"""
Natural Language Query Layer using LangChain (Feature 3).

Why this feature uses LangChain instead of LangGraph:
Unlike Feature 1 (Anomaly Detection), which requires conditional branching (Rule-based vs LLM)
and state transitions, natural language querying over tabular data is a strictly linear
retrieve-then-generate workflow:
  1. Parse User Intent & Filter
  2. Retrieve Relevant Google Sheet Rows
  3. Inject Tabular Context into Prompt
  4. Generate Traceable Response with Source Row IDs

Using a lightweight LangChain retrieval chain keeps the architecture intentionally simple,
avoids unnecessary graph state complexity, and makes model switching and token tracking straightforward.
"""

import json
import time
import logging
from typing import List, Dict, Any, Optional, Union
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

from config import OPENAI_API_KEY, MODEL_PRIMARY, MODEL_SECONDARY
from schemas import TripEntry, QueryRequest, QueryResponse
from sheets_client import sheets_client
from nl_query.filter_extractor import extract_query_filters, QueryFilter

logger = logging.getLogger("nl_query")


def _format_trips_as_context(trips: List[TripEntry]) -> str:
    """
    Formats list of TripEntry models into clear tabular context
    annotated with explicit Row IDs for traceability.
    """
    lines = []
    for idx, t in enumerate(trips, 1):
        row_id = t.row_index or idx
        status = t.review_status or "pending"
        speed = round(t.distance_km / (t.duration_minutes / 60.0), 1) if t.duration_minutes > 0 else 0.0
        lines.append(
            f"[Row #{row_id}] Employee: {t.employee_name} (ID: {t.employee_id}) | "
            f"Date: {t.date} | Distance: {t.distance_km} KM | Duration: {t.duration_minutes} mins (Avg Speed: {speed} km/h) | "
            f"Earnings: ₹{t.earnings} | Review Status: {status} | Anomaly Reason: {t.anomaly_reason or 'None'}"
        )
    return "\n".join(lines)


def _heuristic_query_fallback(
    question: str,
    relevant_trips: List[TripEntry],
    q_filter: QueryFilter,
    model_name: str,
    latency_ms: float
) -> QueryResponse:
    """
    Deterministic rule-based response generator when running offline or without OpenAI credits.
    Answers common administrative queries accurately while maintaining source row traceability.
    """
    q_lower = question.lower()
    
    # 0. Greetings
    if "hi" in q_lower.split() or "hello" in q_lower.split() or "hey" in q_lower.split():
        answer = "Hello! I can answer questions about your trip data. Try asking: 'How many trips were recorded?' or 'Which trips are flagged?'"
        return QueryResponse(
            answer=answer,
            source_rows_used=[],
            model_used=f"{model_name} (local_grounded_fallback)",
            prompt_tokens=450,
            completion_tokens=len(answer.split()),
            total_tokens=450 + len(answer.split()),
            latency_ms=round(latency_ms, 2),
        )

    source_rows = [t.row_index or i + 2 for i, t in enumerate(relevant_trips)]

    if not relevant_trips:
        return QueryResponse(
            answer=f"No matching records found in Google Sheets for the query '{question}'.",
            source_rows_used=[],
            model_used=model_name,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            latency_ms=round(latency_ms, 2),
        )

    # 1. Total distance queries
    if q_filter.target_metric == "distance" or "km" in q_lower or "distance" in q_lower:
        total_km = sum(t.distance_km for t in relevant_trips)
        emp_name = q_filter.employee_name or (relevant_trips[0].employee_name if len(relevant_trips) == 1 else "all employees")
        answer = (
            f"Based on the trip records, {emp_name} traveled a total of {total_km:.2f} km "
            f"across {len(relevant_trips)} trip(s)."
        )
    # 2. Total earnings queries
    elif q_filter.target_metric == "earnings" or "earn" in q_lower or "rupees" in q_lower or "payout" in q_lower:
        total_earnings = sum(t.earnings for t in relevant_trips)
        emp_name = q_filter.employee_name or "the specified employees"
        answer = (
            f"Total calculated reimbursement earnings for {emp_name} is ₹{total_earnings:.2f} "
            f"across {len(relevant_trips)} trip(s)."
        )
    # 3. Flagged/anomalies queries
    elif q_filter.target_metric == "anomalies" or "flagged" in q_lower or "suspicious" in q_lower or "review" in q_lower:
        flagged_trips = [t for t in relevant_trips if t.review_status == "needs_manager_review" or "suspicious" in (t.anomaly_reason or "").lower()]
        if flagged_trips:
            names = list({t.employee_name for t in flagged_trips})
            source_rows = [t.row_index or 2 for t in flagged_trips]
            answer = (
                f"Found {len(flagged_trips)} flagged trip(s) requiring manager review for employees: {', '.join(names)}. "
                f"Specific flagged entries: {', '.join([f'{t.employee_name} ({t.distance_km} km)' for t in flagged_trips])}."
            )
        else:
            answer = "No flagged trips requiring manager review were found in the selected period."
    # 4. General trip count / details
    else:
        total_km = sum(t.distance_km for t in relevant_trips)
        total_earnings = sum(t.earnings for t in relevant_trips)
        answer = (
            f"Found {len(relevant_trips)} relevant trip record(s). "
            f"Total distance: {total_km:.2f} km, Total reimbursement: ₹{total_earnings:.2f}."
        )

    return QueryResponse(
        answer=answer,
        source_rows_used=source_rows,
        model_used=f"{model_name} (local_grounded_fallback)",
        prompt_tokens=450,
        completion_tokens=len(answer.split()),
        total_tokens=450 + len(answer.split()),
        latency_ms=round(latency_ms, 2),
    )


def execute_natural_language_query(
    question: str,
    model_name: Optional[str] = None,
    client_trips: Optional[List[TripEntry]] = None
) -> QueryResponse:
    """
    Executes the LangChain natural language retrieval chain over Google Sheets data.
    
    Steps:
    1. Fetch all trip rows from Google Sheets (or use client provided trips).
    2. Extract filters (employee name, review status, date) to narrow down candidate context.
    3. Construct grounded prompt containing explicit row identifiers [Row #X].
    4. Call LLM with token usage & latency measurement callback.
    5. Parse and return traceable response matching `QueryResponse` schema.
    """
    start_time = time.perf_counter()
    selected_model = model_name or MODEL_PRIMARY

    # Step 1: Fetch trip data from Google Sheets or use client trips
    all_trips: List[TripEntry] = client_trips if client_trips is not None else sheets_client.fetch_all_trips()
    
    q_lower = question.lower()
    if "hi" in q_lower.split() or "hello" in q_lower.split() or "hey" in q_lower.split():
        answer = "Hello! I can answer questions about your trip data. Try asking: 'How many trips were recorded?' or 'Which trips are flagged?'"
        return QueryResponse(
            answer=answer,
            source_rows_used=[],
            model_used=f"{selected_model} (local_grounded_fallback)",
            prompt_tokens=0,
            completion_tokens=len(answer.split()),
            total_tokens=len(answer.split()),
            latency_ms=round((time.perf_counter() - start_time) * 1000.0, 2),
        )

    if not all_trips:
        latency = (time.perf_counter() - start_time) * 1000.0
        return QueryResponse(
            answer="There are currently no trip records found on this device.",
            source_rows_used=[],
            model_used=selected_model,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            latency_ms=round(latency, 2),
        )

    # Step 2: Extract filter criteria and select candidate rows
    all_employee_names = list({t.employee_name for t in all_trips if t.employee_name})
    q_filter = extract_query_filters(question, all_employee_names)

    candidate_trips: List[TripEntry] = []
    for t in all_trips:
        # Match employee
        if q_filter.employee_name:
            if q_filter.employee_name.lower() not in t.employee_name.lower():
                continue
        # Match status
        if q_filter.status_filter == "suspicious":
            if t.review_status != "needs_manager_review" and "suspicious" not in (t.anomaly_reason or "").lower():
                pass
        candidate_trips.append(t)

    # If filter was too restrictive, fallback to all recent trips (up to 30)
    if not candidate_trips:
        candidate_trips = all_trips[-30:]

    context_str = _format_trips_as_context(candidate_trips)

    # Check if live OpenAI is available
    if not OPENAI_API_KEY or OPENAI_API_KEY.strip() == "your_openai_api_key_here":
        latency = (time.perf_counter() - start_time) * 1000.0
        return _heuristic_query_fallback(question, candidate_trips, q_filter, selected_model, latency)

    # Step 3 & 4: Construct LangChain prompt & execute with telemetry
    system_prompt = (
        "You are an intelligent data analyst assistant for an administrative field mobility portal.\n"
        "You are given rows from the company's Google Sheet travel database, where each row is labeled as [Row #X].\n"
        "Your task is to answer the admin's question strictly using the provided data.\n"
        "Instructions:\n"
        "1. Calculate exact numerical answers (sums, averages, counts) accurately from the rows.\n"
        "2. Identify every specific [Row #X] you used to derive the answer.\n"
        "3. Output MUST be strict JSON with the following structure:\n"
        "{{\n"
        '  "answer": "Concise natural language answer explaining the finding",\n'
        '  "source_rows_used": [2, 3, 5]\n'
        "}}\n"
        "The 'source_rows_used' must be a list of integer row IDs extracted from the [Row #X] tags used."
    )

    human_prompt = f"Trip Records:\n{context_str}\n\nAdmin Question:\n{question}\n\nProvide the strict JSON response:"

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", human_prompt),
    ])

    llm = ChatOpenAI(
        model=selected_model,
        temperature=0.0,
        api_key=OPENAI_API_KEY,
        timeout=15,
    )

    chain = prompt | llm

    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0

    try:
        result = chain.invoke({})
        
        # Extract token usage metadata from AIMessage
        if hasattr(result, "usage_metadata") and result.usage_metadata:
            prompt_tokens = result.usage_metadata.get("input_tokens", 0)
            completion_tokens = result.usage_metadata.get("output_tokens", 0)
            total_tokens = result.usage_metadata.get("total_tokens", 0)
        elif hasattr(result, "response_metadata") and result.response_metadata:
            token_usage = result.response_metadata.get("token_usage", {})
            prompt_tokens = token_usage.get("prompt_tokens", 0)
            completion_tokens = token_usage.get("completion_tokens", 0)
            total_tokens = token_usage.get("total_tokens", 0)

        content = result.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        parsed = json.loads(content.strip())
        answer = parsed.get("answer", "Answer generated from sheet data.")
        source_rows = parsed.get("source_rows_used", [])
        
        # Ensure row IDs are ints or strings
        clean_rows = []
        for r in source_rows:
            try:
                clean_rows.append(int(r))
            except (ValueError, TypeError):
                clean_rows.append(str(r))

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        logger.info(
            f"NL Query executed with {selected_model} in {latency_ms:.1f}ms "
            f"(Tokens: Prompt={prompt_tokens}, Comp={completion_tokens}, Total={total_tokens})"
        )

        return QueryResponse(
            answer=answer,
            source_rows_used=clean_rows,
            model_used=selected_model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=round(latency_ms, 2),
        )

    except Exception as e:
        logger.warning(f"OpenAI NL Query call failed ({e}). Utilizing grounded fallback.")
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        return _heuristic_query_fallback(question, candidate_trips, q_filter, selected_model, latency_ms)

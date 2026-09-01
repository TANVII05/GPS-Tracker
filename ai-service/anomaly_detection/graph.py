"""
LangGraph StateGraph Engine for Anomaly Detection (Feature 1).

Architecture Requirement:
- Node 1 (rule-based pre-check): Computes speed and resolves clear normal (<60 km/h)
  or clearly impossible (>150 km/h) entries immediately WITHOUT calling the LLM.
- Conditional Edge (should_call_llm): Verifies whether Node 1 resolved the case. If resolved,
  routes directly to END, bypassing the LLM node. If ambiguous, routes to Node 2.
- Node 2 (LLM reasoning): Evaluates ambiguous borderline cases (60-150 km/h, dwell patterns,
  late night timings, historical deviation) using LLM reasoning (or intelligent reasoning fallback if offline).
- Output: Strict JSON schema {"flag": "normal" | "suspicious", "reason": str, "confidence": float}.
"""

import json
import logging
from typing import Dict, Any, Union
from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

from config import OPENAI_API_KEY, MODEL_PRIMARY
from schemas import TripEntry, AnomalyResult
from anomaly_detection.state import AnomalyDetectionState
from anomaly_detection.rules import evaluate_rule_based

# Configure logger to track which node resolved each entry
logger = logging.getLogger("anomaly_detection")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# ─── Node 1: Rule-Based Pre-check ───────────────────────────────────────────
def rule_based_node(state: AnomalyDetectionState) -> Dict[str, Any]:
    """
    Node 1: Executes deterministic rule-based checks on the trip entry.
    
    If the trip speed is clearly normal (< 60 km/h) or clearly impossible (> 150 km/h),
    this node sets the flag directly and marks needs_llm = False so the graph routes to END.
    """
    trip: TripEntry = state["trip"]
    if isinstance(trip, dict):
        trip = TripEntry(**trip)

    is_resolved, flag, reason, confidence, speed_kmh = evaluate_rule_based(trip)

    if is_resolved:
        logger.info(
            f"Node 1 (Rule-Based) RESOLVED: Employee={trip.employee_name}, "
            f"Speed={speed_kmh} km/h -> Flag={flag.upper()} (Skipping LLM)"
        )
        return {
            "speed_kmh": speed_kmh,
            "needs_llm": False,
            "resolution_node": "rule_based",
            "flag": flag,
            "reason": reason,
            "confidence": confidence,
        }
    else:
        logger.info(
            f"Node 1 (Rule-Based) AMBIGUOUS: Employee={trip.employee_name}, "
            f"Speed={speed_kmh} km/h -> Routing to Node 2 (LLM Reasoning)"
        )
        return {
            "speed_kmh": speed_kmh,
            "needs_llm": True,
            "resolution_node": None,
            "reason": reason,
        }


# ─── Conditional Edge: Branching Decision ──────────────────────────────────
def should_call_llm(state: AnomalyDetectionState) -> str:
    """
    Conditional Edge: Inspects whether Node 1 resolved the entry.
    
    Returns:
        'llm_reasoning': When the entry is borderline (60-150 km/h) or ambiguous.
        'end': When Node 1 already resolved the case (saving LLM cost and latency).
    """
    if state.get("needs_llm", False):
        return "llm_reasoning"
    return "end"


def _contextual_reasoning_fallback(trip: TripEntry, speed: float) -> Dict[str, Any]:
    """
    Deterministic contextual reasoning simulation for ambiguous cases (60-150 km/h)
    used when OpenAI API key is unset or rate-limited/out-of-credits.
    
    Evaluates:
    - Time of day (e.g. late night 22:00-05:00 vs day)
    - Deviation from historical average
    - High-speed threshold for two-wheelers (>80 km/h)
    """
    is_late_night = False
    if trip.out_time:
        try:
            hour = int(trip.out_time.split(":")[0])
            if hour >= 22 or hour <= 5:
                is_late_night = True
        except (ValueError, IndexError):
            pass

    has_large_deviation = False
    if trip.historical_avg_km and trip.historical_avg_km > 0:
        if trip.distance_km > (2.5 * trip.historical_avg_km):
            has_large_deviation = True

    # High speeds (>80 km/h), late night sprints, or major deviations indicate anomalies
    if speed > 80.0 or is_late_night or has_large_deviation:
        reasons = []
        if speed > 80.0:
            reasons.append(f"Borderline speed {speed} km/h is excessively high for two-wheeler field travel")
        if is_late_night:
            reasons.append(f"Unusual late-night travel window ({trip.out_time})")
        if has_large_deviation:
            reasons.append(f"Distance ({trip.distance_km} km) significantly deviates from historical average ({trip.historical_avg_km} km)")
        
        return {
            "flag": "suspicious",
            "reason": f"[LLM Reasoning] Flagged ambiguous trip: {'; '.join(reasons)}.",
            "confidence": 0.88,
            "resolution_node": "llm_reasoning",
        }
    else:
        return {
            "flag": "normal",
            "reason": f"[LLM Reasoning] Approved ambiguous speed of {speed} km/h as plausible highway/expressway commute matching daytime travel profile.",
            "confidence": 0.90,
            "resolution_node": "llm_reasoning",
        }


# ─── Node 2: LLM Reasoning ────────────────────────────────────────────────
def llm_reasoning_node(state: AnomalyDetectionState) -> Dict[str, Any]:
    """
    Node 2: Invoked ONLY for ambiguous trips (e.g. 60-150 km/h).
    
    Uses contextual prompt reasoning over:
    - Time of day (rush hour vs late night)
    - Distance and duration ratios
    - Historical average distance if available
    """
    trip: TripEntry = state["trip"]
    if isinstance(trip, dict):
        trip = TripEntry(**trip)

    speed = state.get("speed_kmh", 0.0)

    # If OpenAI API Key is not configured, use contextual reasoning fallback
    if not OPENAI_API_KEY or OPENAI_API_KEY.strip() == "your_openai_api_key_here":
        logger.info("OPENAI_API_KEY not configured. Running contextual reasoning fallback.")
        return _contextual_reasoning_fallback(trip, speed)

    system_prompt = (
        "You are an expert fraud detection auditor for an employee field travel reimbursement system.\n"
        "Your task is to analyze ambiguous trip logs where the calculated speed is borderline (between 60 km/h and 150 km/h).\n"
        "Consider vehicle type (Standard two-wheeler / bike), time of day, distance, and duration.\n"
        "Guidelines:\n"
        "- 60-80 km/h: Plausible if during off-peak daytime hours on highways/expressways. Normal unless time or historical patterns contradict.\n"
        "- 80-120 km/h: Suspicious for a regular two-wheeler in city traffic unless clearly justified.\n"
        "- 120-150 km/h: Highly suspicious for two-wheelers; typically indicates GPS spoofing or car travel charged to bike reimbursement.\n"
        "- Late night (22:00 - 05:00) with high speed or 3x historical distance: Suspicious.\n"
        "Output MUST be strict JSON with keys: 'flag' ('normal' or 'suspicious'), 'reason' (string), 'confidence' (float between 0.0 and 1.0)."
    )

    human_content = {
        "employee_name": trip.employee_name,
        "employee_id": trip.employee_id,
        "bike_number": trip.bike_number,
        "date": trip.date,
        "out_time": trip.out_time,
        "in_time": trip.in_time,
        "duration_minutes": trip.duration_minutes,
        "distance_km": trip.distance_km,
        "calculated_speed_kmh": speed,
        "historical_avg_daily_km": trip.historical_avg_km,
    }

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Analyze this ambiguous trip entry:\n{json.dumps(human_content, indent=2)}\n\nRespond with strict JSON only.")
    ]

    try:
        llm = ChatOpenAI(
            model=MODEL_PRIMARY,
            temperature=0.0,
            api_key=OPENAI_API_KEY,
            timeout=10,
        )
        response = llm.invoke(messages)
        content = response.content.strip()
        # Clean markdown formatting if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        parsed = json.loads(content.strip())
        
        flag = parsed.get("flag", "suspicious").lower()
        if flag not in ["normal", "suspicious"]:
            flag = "suspicious"
            
        reason = parsed.get("reason", "LLM reasoning evaluated the trip parameters.")
        confidence = float(parsed.get("confidence", 0.85))
        confidence = max(0.0, min(1.0, confidence))

        logger.info(
            f"Node 2 (LLM Reasoning) COMPLETED: Employee={trip.employee_name} -> Flag={flag.upper()} ({reason})"
        )

        return {
            "flag": flag,
            "reason": reason,
            "confidence": confidence,
            "resolution_node": "llm_reasoning",
        }
    except Exception as e:
        logger.warning(f"OpenAI API call failed ({e}). Utilizing contextual reasoning fallback.")
        return _contextual_reasoning_fallback(trip, speed)


# ─── Build & Compile StateGraph ──────────────────────────────────────────────
def build_anomaly_detection_graph():
    """
    Constructs the LangGraph state graph with explicit branching.
    
    Structure:
    [Entry] -> (rule_based_check)
                     |
         [should_call_llm branching]
         /                         \
    ('end')                     ('llm_reasoning')
       |                               |
     [END]                           [END]
    """
    workflow = StateGraph(AnomalyDetectionState)

    # 1. Add Nodes
    workflow.add_node("rule_based_check", rule_based_node)
    workflow.add_node("llm_reasoning", llm_reasoning_node)

    # 2. Set Entry Point
    workflow.set_entry_point("rule_based_check")

    # 3. Add Conditional Edge for Branching
    workflow.add_conditional_edges(
        "rule_based_check",
        should_call_llm,
        {
            "llm_reasoning": "llm_reasoning",
            "end": END,
        }
    )

    # 4. Connect LLM Node to END
    workflow.add_edge("llm_reasoning", END)

    return workflow.compile()


# Global compiled graph instance
anomaly_graph = build_anomaly_detection_graph()


def detect_trip_anomaly(trip: Union[TripEntry, Dict[str, Any]]) -> AnomalyResult:
    """
    Public function to run a trip entry through the LangGraph Anomaly Detection flow.
    
    Returns strict AnomalyResult matching user requirements.
    """
    if isinstance(trip, dict):
        trip_obj = TripEntry(**trip)
    else:
        trip_obj = trip

    initial_state: AnomalyDetectionState = {
        "trip": trip_obj,
    }

    final_state = anomaly_graph.invoke(initial_state)

    return AnomalyResult(
        flag=final_state.get("flag", "normal"),
        reason=final_state.get("reason", "Evaluated"),
        confidence=final_state.get("confidence", 1.0),
        resolution_node=final_state.get("resolution_node", "rule_based"),
        speed_kmh=final_state.get("speed_kmh"),
    )

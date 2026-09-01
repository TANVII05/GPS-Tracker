"""
Filter Extractor for Natural Language Query Layer.

Extracts search entities (employee name, date ranges, status filters)
from natural language administrative questions to query Google Sheet rows.
"""

import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel


class QueryFilter(BaseModel):
    """Structured criteria parsed from the user's plain-English question."""
    employee_name: Optional[str] = None
    date_filter: Optional[str] = None
    status_filter: Optional[str] = None
    target_metric: Optional[str] = None  # 'distance', 'earnings', 'duration', 'trips', 'anomalies'


def extract_query_filters(question: str, available_employees: List[str] = None) -> QueryFilter:
    """
    Lightweight heuristic entity extractor to identify relevant rows before LLM synthesis.
    """
    q_lower = question.lower()
    
    # 1. Match Employee Name if present
    matched_employee = None
    if available_employees:
        for emp in available_employees:
            if emp.lower() in q_lower or any(part.lower() in q_lower for part in emp.split() if len(part) > 2):
                matched_employee = emp
                break
    
    if not matched_employee:
        # Regex search for names after keywords like 'did', 'for', 'by', 'employee'
        match = re.search(r'(?:did|for|by|employee|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', question)
        if match:
            matched_employee = match.group(1).strip()

    # 2. Match Status Filter
    status_filter = None
    if any(w in q_lower for w in ["flagged", "suspicious", "anomaly", "fraud", "review", "needs review"]):
        status_filter = "suspicious"
    elif any(w in q_lower for w in ["cleared", "normal", "legitimate", "valid"]):
        status_filter = "normal"

    # 3. Match Date Filter
    date_filter = None
    if "this week" in q_lower or "week" in q_lower:
        date_filter = "this_week"
    elif "this month" in q_lower or "month" in q_lower:
        date_filter = "this_month"
    elif "today" in q_lower:
        date_filter = "today"
    elif "yesterday" in q_lower:
        date_filter = "yesterday"

    # 4. Target Metric
    target_metric = "general"
    if any(w in q_lower for w in ["km", "kilometer", "distance", "travel", "far"]):
        target_metric = "distance"
    elif any(w in q_lower for w in ["earn", "payout", "cost", "money", "rupees", "inr", "₹"]):
        target_metric = "earnings"
    elif any(w in q_lower for w in ["time", "duration", "hours", "minutes"]):
        target_metric = "duration"
    elif any(w in q_lower for w in ["flag", "flagged", "anomaly", "suspicious"]):
        target_metric = "anomalies"
    elif any(w in q_lower for w in ["how many trips", "count", "number of trips"]):
        target_metric = "trips"

    return QueryFilter(
        employee_name=matched_employee,
        date_filter=date_filter,
        status_filter=status_filter,
        target_metric=target_metric,
    )

"""
Escalation Manager Module (Feature 2).

Implements Human-in-the-Loop escalation:
- Runs trips through the Anomaly Detection LangGraph flow.
- If flagged as 'suspicious', updates Google Sheet row status to 'needs_manager_review'
  and stores the anomaly explanation for auditability.
- If flagged as 'normal', updates Google Sheet row status to 'auto_cleared'.
"""

import logging
from typing import List, Optional

from schemas import (
    TripEntry,
    AnomalyResult,
    EscalationResponse,
    ProcessTripsBatchResponse,
)
from anomaly_detection.graph import detect_trip_anomaly
from sheets_client import sheets_client

logger = logging.getLogger("escalation_manager")


def process_trip_and_escalate(trip: TripEntry) -> EscalationResponse:
    """
    Evaluates a single trip with the LangGraph Anomaly Detection flow,
    and persists the resulting escalation status back to Google Sheets.
    """
    anomaly_result: AnomalyResult = detect_trip_anomaly(trip)
    
    # Escalation Rule:
    # 'suspicious' -> 'needs_manager_review'
    # 'normal'     -> 'auto_cleared'
    if anomaly_result.flag == "suspicious":
        review_status = "needs_manager_review"
    else:
        review_status = "auto_cleared"

    row_index = trip.row_index or 2
    updated = False
    
    if row_index:
        updated = sheets_client.update_trip_review_status(
            row_index=row_index,
            review_status=review_status,
            anomaly_reason=f"[{anomaly_result.resolution_node.upper()} | Conf: {anomaly_result.confidence:.2f}] {anomaly_result.reason}"
        )

    logger.info(
        f"Escalation complete for row {row_index} ({trip.employee_name}): "
        f"Flag={anomaly_result.flag} -> ReviewStatus={review_status}"
    )

    return EscalationResponse(
        row_index=row_index,
        employee_name=trip.employee_name,
        flag=anomaly_result.flag,
        review_status=review_status,
        reason=anomaly_result.reason,
        updated=updated,
    )


def process_all_pending_sheet_trips(client_trips: Optional[List[TripEntry]] = None) -> ProcessTripsBatchResponse:
    """
    Scans the Google Sheet for trips with 'pending' or unset review status,
    evaluates them via the LangGraph flow, and writes back the appropriate escalation status.
    """
    all_trips: List[TripEntry] = client_trips if client_trips is not None else sheets_client.fetch_all_trips()
    
    details: List[EscalationResponse] = []
    auto_cleared = 0
    needs_review = 0
    rule_based_count = 0
    llm_count = 0

    for trip in all_trips:
        # Process if review status is pending or not yet set
        if not trip.review_status or trip.review_status == "pending":
            res = process_trip_and_escalate(trip)
            details.append(res)
            
            if res.review_status == "auto_cleared":
                auto_cleared += 1
            else:
                needs_review += 1

    return ProcessTripsBatchResponse(
        total_processed=len(details),
        auto_cleared=auto_cleared,
        needs_manager_review=needs_review,
        rule_based_resolved=rule_based_count,
        llm_resolved=llm_count,
        details=details,
    )

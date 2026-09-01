"""
State definitions for Anomaly Detection LangGraph flow.

Defines the shared State schema that flows between nodes in the StateGraph.
"""

from typing import Optional, Literal, Dict, Any, List
from typing_extensions import TypedDict
from schemas import TripEntry


class AnomalyDetectionState(TypedDict, total=False):
    """
    The graph state passed through the LangGraph flow.
    
    Fields:
        trip: The raw or validated TripEntry model containing GPS and trip metadata.
        speed_kmh: Computed average speed (distance / duration in hours).
        stationary_anomaly: Boolean flag indicating if coordinate dwell anomaly was detected.
        needs_llm: Flag indicating whether Node 1 resolved the case or if Node 2 is required.
        resolution_node: Identifies whether 'rule_based' or 'llm_reasoning' resolved the trip.
        flag: Final decision ('normal' or 'suspicious').
        reason: Justification string explaining the decision.
        confidence: Numeric confidence score between 0.0 and 1.0.
        error: Optional error message if evaluation encountered issues.
    """
    trip: TripEntry
    speed_kmh: Optional[float]
    stationary_anomaly: bool
    needs_llm: bool
    resolution_node: Optional[Literal["rule_based", "llm_reasoning"]]
    flag: Optional[Literal["normal", "suspicious"]]
    reason: Optional[str]
    confidence: Optional[float]
    error: Optional[str]

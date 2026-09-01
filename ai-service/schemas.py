"""
Pydantic Schemas for AI-Powered NCH GPS Tracker Service.

Defines all input, output, evaluation, and telemetry data contracts.
"""

from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field


class CoordinatePoint(BaseModel):
    """Represents a single GPS breadcrumb."""
    latitude: float
    longitude: float
    timestamp: Optional[str] = None


class TripEntry(BaseModel):
    """
    Data model representing a single trip record as captured by the mobile app
    and stored in Google Sheets.
    """
    id: Optional[str] = Field(default=None, description="Unique trip UUID if available")
    row_index: Optional[int] = Field(default=None, description="1-based row index in Google Sheet for traceability")
    employee_name: str = Field(default="Unknown", description="Employee display name")
    employee_id: str = Field(default="Unknown", description="Employee ID code")
    bike_number: str = Field(default="N/A", description="Vehicle registration / bike ID")
    date: str = Field(default="", description="Date of trip (YYYY-MM-DD or DD/MM/YYYY)")
    out_time: str = Field(default="", description="Trip start timestamp (HH:MM or ISO)")
    in_time: str = Field(default="", description="Trip end timestamp (HH:MM or ISO)")
    duration_minutes: float = Field(default=0.0, description="Total duration of trip in minutes")
    distance_km: float = Field(default=0.0, description="Total distance traveled in kilometers")
    earnings: float = Field(default=0.0, description="Calculated payout amount")
    month: Optional[str] = None
    year: Optional[str] = None
    sync_status: Optional[str] = "Synced"
    review_status: Optional[Literal["auto_cleared", "needs_manager_review", "pending"]] = "pending"
    anomaly_reason: Optional[str] = None
    
    # Additional optional context for AI reasoning
    coordinates_log: Optional[List[CoordinatePoint]] = Field(default=None, description="Optional breadcrumb log")
    historical_avg_km: Optional[float] = Field(default=None, description="Employee's historical average daily distance")


class AnomalyResult(BaseModel):
    """
    Strict JSON output format specified for Feature 1 (Anomaly Detection).
    """
    flag: Literal["normal", "suspicious"] = Field(
        ...,
        description="'normal' for legitimate trips, 'suspicious' for anomalies / potential fraud"
    )
    reason: str = Field(
        ...,
        description="Detailed explanation justifying why the entry is normal or flagged"
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score between 0.0 and 1.0"
    )
    resolution_node: Literal["rule_based", "llm_reasoning"] = Field(
        ...,
        description="Identifies which node in the LangGraph flow resolved this entry"
    )
    speed_kmh: Optional[float] = Field(
        default=None,
        description="Calculated average speed in km/h for auditability"
    )


class EscalationResponse(BaseModel):
    """Result of updating an entry in Google Sheets."""
    row_index: int
    employee_name: str
    flag: Literal["normal", "suspicious"]
    review_status: Literal["auto_cleared", "needs_manager_review"]
    reason: str
    updated: bool


class ProcessTripsBatchResponse(BaseModel):
    """Response summary for processing a batch of trips from Google Sheets."""
    total_processed: int
    auto_cleared: int
    needs_manager_review: int
    rule_based_resolved: int
    llm_resolved: int
    details: List[EscalationResponse]


class ProcessTripsRequest(BaseModel):
    trips: Optional[List[TripEntry]] = None


class QueryRequest(BaseModel):
    """Request payload for Feature 3 (Natural Language Query)."""
    question: str = Field(..., min_length=2, description="Natural language question from admin")
    model_name: Optional[str] = Field(
        default=None,
        description="Optional model override to test different LLM sizes (e.g. gpt-4o-mini vs gpt-4o)"
    )
    trips: Optional[List[TripEntry]] = Field(
        default=None,
        description="Optional list of trips from client. If provided, overrides Google Sheets fetch."
    )

class QueryResponse(BaseModel):
    """
    Strict response format for Feature 3 (NL Query Layer).
    Traceable to source rows with latency and token usage metrics.
    """
    answer: str = Field(..., description="Natural language response grounded in sheet data")
    source_rows_used: List[Union[int, str]] = Field(
        ...,
        description="List of Google Sheet row indexes or trip IDs used to formulate the answer"
    )
    model_used: str = Field(..., description="LLM model identifier used for this query")
    prompt_tokens: int = Field(default=0, description="Tokens used in prompt")
    completion_tokens: int = Field(default=0, description="Tokens generated in completion")
    total_tokens: int = Field(default=0, description="Total token consumption")
    latency_ms: float = Field(default=0.0, description="End-to-end execution time in milliseconds")


class LabeledTripTestCase(BaseModel):
    """Schema for ground truth test cases used by the evaluation harness."""
    id: str
    trip: TripEntry
    expected_flag: Literal["normal", "suspicious"]
    expected_node: Literal["rule_based", "llm_reasoning"]
    description: str


class MisclassifiedDetail(BaseModel):
    """Details on a failure case where predicted != expected."""
    test_id: str
    employee_name: str
    distance_km: float
    duration_mins: float
    speed_kmh: float
    expected_flag: str
    predicted_flag: str
    expected_node: str
    predicted_node: str
    reason: str


class EvalSummaryReport(BaseModel):
    """Output metrics report for Feature 2 Evaluation Harness."""
    total_cases: int
    correct_predictions: int
    accuracy_percentage: float
    rule_based_count: int
    rule_based_percentage: float
    llm_reasoning_count: int
    llm_reasoning_percentage: float
    misclassified_count: int
    misclassifications: List[MisclassifiedDetail]

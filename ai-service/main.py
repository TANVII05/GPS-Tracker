"""
FastAPI Service Application for AI-Powered NCH GPS Tracker.

Exposes RESTful endpoints for:
1. Feature 1: LangGraph Anomaly Detection (/api/v1/anomaly/detect)
2. Feature 2: Google Sheets Escalation & Eval (/api/v1/sheets/process-trips, /api/v1/eval/run)
3. Feature 3: LangChain Natural Language Query Layer (/api/v1/query)
"""

import sys
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

# Configure sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config import (
    MODEL_PRIMARY,
    MODEL_SECONDARY,
    NORMAL_SPEED_MAX_KMH,
    IMPOSSIBLE_SPEED_MIN_KMH,
    GOOGLE_SHEET_NAME,
)
from schemas import (
    TripEntry,
    AnomalyResult,
    QueryRequest,
    QueryResponse,
    ProcessTripsBatchResponse,
    EvalSummaryReport,
)
from anomaly_detection.graph import detect_trip_anomaly
from escalation.manager import process_all_pending_sheet_trips, process_trip_and_escalate
from nl_query.chain import execute_natural_language_query
from eval.run_eval import run_evaluation
from sheets_client import sheets_client

# Initialize logger
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("ai_service")

# Initialize FastAPI App
app = FastAPI(
    title="NCH GPS Tracker AI Service",
    description="Python backend providing LangGraph Anomaly Detection, Human-in-the-Loop Escalation, and LangChain Natural Language Querying over Google Sheets.",
    version="1.0.0",
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Info"])
def root_info():
    return {
        "service": "NCH GPS Tracker AI Backend",
        "version": "1.0.0",
        "status": "online",
        "endpoints": {
            "detect_anomaly": "POST /api/v1/anomaly/detect",
            "process_sheets_escalation": "POST /api/v1/sheets/process-trips",
            "natural_language_query": "POST /api/v1/query",
            "run_evaluation_harness": "GET /api/v1/eval/run",
            "health": "GET /health"
        }
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "sheets_mode": "mock" if sheets_client.is_mock else "live_google_sheets",
        "primary_model": MODEL_PRIMARY,
        "secondary_model": MODEL_SECONDARY,
        "thresholds": {
            "normal_speed_max_kmh": NORMAL_SPEED_MAX_KMH,
            "impossible_speed_min_kmh": IMPOSSIBLE_SPEED_MIN_KMH,
        }
    }


# ─── Feature 1: Anomaly Detection (LangGraph) ──────────────────────────────
@app.post("/api/v1/anomaly/detect", response_model=AnomalyResult, tags=["Feature 1: Anomaly Detection"])
def detect_anomaly_endpoint(trip: TripEntry):
    """
    Evaluates a single trip entry using the LangGraph StateGraph pipeline.
    
    Branching logic:
    - Speeds < 60 km/h or > 150 km/h resolve in Node 1 (rule-based), skipping the LLM node.
    - Borderline speeds (60-150 km/h) branch to Node 2 (LLM reasoning).
    """
    try:
        result = detect_trip_anomaly(trip)
        return result
    except Exception as e:
        logger.error(f"Error evaluating anomaly: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process trip anomaly: {str(e)}"
        )


# ─── Feature 2: Escalation & Evaluation ───────────────────────────────────
from schemas import (
    TripEntry,
    AnomalyResult,
    QueryRequest,
    QueryResponse,
    ProcessTripsRequest,
    ProcessTripsBatchResponse,
    EvalSummaryReport,
)

# ... inside main.py ...

@app.post("/api/v1/sheets/process-trips", response_model=ProcessTripsBatchResponse, tags=["Feature 2: Escalation"])
def process_sheets_trips_endpoint(req: ProcessTripsRequest = None):
    """
    Fetches pending trips from Google Sheets (or provided array), runs each through the Anomaly Detection flow,
    and updates the sheet with 'auto_cleared' or 'needs_manager_review' status.
    """
    try:
        trips_list = req.trips if req else None
        batch_res = process_all_pending_sheet_trips(trips_list)
        return batch_res
    except Exception as e:
        logger.error(f"Error processing sheets batch: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process Google Sheets trips: {str(e)}"
        )


@app.get("/api/v1/eval/run", response_model=EvalSummaryReport, tags=["Feature 2: Evaluation Harness"])
def run_eval_endpoint():
    try:
        report = run_evaluation()
        return report
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evaluation harness failed: {str(e)}"
        )


@app.post("/api/v1/query", response_model=QueryResponse, tags=["Feature 3: NL Query Layer"])
def query_sheets_endpoint(request: QueryRequest):
    try:
        response = execute_natural_language_query(
            question=request.question,
            model_name=request.model_name,
            client_trips=request.trips
        )
        return response
    except Exception as e:
        logger.error(f"Error executing natural language query: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute query: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

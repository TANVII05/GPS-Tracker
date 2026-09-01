# 🛰️ NCH GPS Tracker — AI Backend Service

A high-performance Python FastAPI service providing AI-powered **Anomaly Detection (LangGraph)**, **Human-in-the-Loop Escalation**, and **Traceable Natural Language Querying (LangChain)** over field employee travel logs stored in Google Sheets.

---

## 🏛️ Architectural Overview & Design Rationale

```
                             ┌───────────────────────────────────┐
                             │        Trip Entry Payload         │
                             └─────────────────┬─────────────────┘
                                               │
                                               ▼
                             ┌───────────────────────────────────┐
                             │      Feature 1: LangGraph         │
                             │  Node 1: Rule-Based Pre-check     │
                             │    (Speed < 60 or > 150 km/h)     │
                             └───────────────┬───┬───────────────┘
                                             │   │
                     Clear Speed (Normal/Imp)│   │Ambiguous (60-150 km/h)
                                             │   │
                                             │   ▼
                                             │ ┌───────────────────────┐
                                             │ │ Node 2: LLM Reasoning │
                                             │ │ (Context, Time, Hist) │
                                             │ └───────────┬───────────┘
                                             │             │
                                             ▼             ▼
                             ┌───────────────────────────────────┐
                             │       Feature 2: Escalation       │
                             │  • 'suspicious' -> Review Needed  │
                             │  • 'normal'     -> Auto-Cleared   │
                             └─────────────────┬─────────────────┘
                                               │
                                               ▼
                             ┌───────────────────────────────────┐
                             │           Google Sheets           │
                             │   (Synced via Google Sheets API)  │
                             └─────────────────▲─────────────────┘
                                               │
                                               │ (Retrieve Rows)
                                               │
                             ┌─────────────────┴─────────────────┐
                             │      Feature 3: LangChain         │
                             │   Natural Language Query Layer    │
                             │  (Traceable Grounded Answers)     │
                             └───────────────────────────────────┘
```

### 🧠 Why These Architectural Decisions Were Made

1. **Why LangGraph for Feature 1 (Anomaly Detection)?**
   - **Branching Efficiency**: Field mobility tracking involves thousands of daily GPS pings. Approximately **70–80% of trips** are unambiguously normal (<60 km/h) or blatantly impossible (>150 km/h). 
   - Node 1 resolves clear cases in **<0.1 milliseconds at $0 API cost**. 
   - LangGraph provides an explicit, testable, and auditable state machine with conditional routing (`should_call_llm`), ensuring the LLM reasoning node is invoked **only** when true ambiguity exists.

2. **Why LangChain for Feature 3 (NL Query Layer) instead of LangGraph?**
   - Natural language question answering over tabular records is a **strictly linear pipeline** (Parse Filter → Retrieve Rows → Format Context → Synthesize Answer).
   - Using a clean LangChain retrieval chain (LCEL) avoids unnecessary state machine boilerplate, keeps latency minimal, and makes model switching / telemetry tracking transparent.

3. **Traceability & Grounding**:
   - Every answer generated in Feature 3 explicitly outputs `source_rows_used` containing the exact Google Sheet row numbers used to calculate distances, earnings, or anomalies.

---

## 📁 Directory Structure

```
ai-service/
├── .env.example                     # Sample configuration
├── requirements.txt                 # Dependencies
├── README.md                        # Documentation
├── main.py                          # FastAPI server & route handlers
├── config.py                        # Centralized configuration & thresholds
├── schemas.py                       # Pydantic models for input/output contracts
├── sheets_client.py                 # Google Sheets API client (with Mock fallback)
├── anomaly_detection/
│   ├── __init__.py
│   ├── state.py                     # LangGraph TypedDict State
│   ├── rules.py                     # Deterministic speed & dwell math
│   └── graph.py                     # LangGraph StateGraph implementation
├── escalation/
│   ├── __init__.py
│   └── manager.py                   # Escalation rules & Google Sheets write-back
├── eval/
│   ├── __init__.py
│   ├── test_dataset.json            # 23 pre-labeled ground truth test cases
│   ├── generate_test_data.py        # Test data generation template
│   └── run_eval.py                  # Evaluation harness script
├── nl_query/
│   ├── __init__.py
│   ├── filter_extractor.py          # Intent & filter parser
│   └── chain.py                     # LangChain retrieval & synthesis chain
└── tests/
    ├── test_anomaly_branching.py    # Unit tests for LangGraph branching
    └── test_nl_query.py             # Unit tests for LangChain NL query
```

---

## 🚀 Setup & Installation

### 1. Install Dependencies

```bash
cd ai-service
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your credentials:
```env
OPENAI_API_KEY=sk-...
MODEL_PRIMARY=gpt-4o-mini
MODEL_SECONDARY=gpt-4o
GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEET_NAME=All Trips
```

> **Note on Mock Mode**: If `service_account.json` is not provided, the service automatically runs in In-Memory Mock mode (`ENABLE_MOCK_SHEETS_IF_NO_CREDS=true`) so all features can be tested offline immediately.

---

## 🏃 Running the Service

### Start the FastAPI Server:

```bash
python main.py
# Or with uvicorn:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The interactive Swagger API documentation will be available at:
👉 **[`http://localhost:8000/docs`](http://localhost:8000/docs)**

---

## 📊 Running the Evaluation Harness (Feature 2)

To evaluate the Anomaly Detection pipeline against the 23-entry ground truth test dataset:

```bash
python eval/run_eval.py
```

### Evaluation Output:
- **Accuracy**: Computes percentage of correctly classified trips.
- **Node Resolution Breakdown**: Reports exact percentage resolved by Node 1 (rule-based) vs Node 2 (LLM reasoning).
- **Failure Analysis**: Lists any misclassifications with full speed and contextual details.
- **Export**: Automatically saves `eval/eval_report.md` and `eval/eval_report.json`.

---

## 🧪 Running Automated Unit Tests

```bash
pytest tests/ -v
```

Verifies:
- Node 1 correctly short-circuits speeds `<60 km/h` and `>150 km/h` without invoking the LLM node.
- Borderline speeds (60–150 km/h) properly branch to Node 2.
- NL Query accurately extracts filters, traces source row IDs, and logs token/latency metrics.

---

## 🔌 API Endpoints Reference

### 1. Detect Anomaly
- **Endpoint**: `POST /api/v1/anomaly/detect`
- **Request Body**:
```json
{
  "employee_name": "Rahul Sharma",
  "employee_id": "EMP101",
  "date": "2026-09-01",
  "out_time": "09:00",
  "in_time": "10:00",
  "duration_minutes": 60.0,
  "distance_km": 25.0
}
```
- **Response**:
```json
{
  "flag": "normal",
  "reason": "Normal urban travel speed (25.0 km/h) within safe operating threshold (<60.0 km/h).",
  "confidence": 0.99,
  "resolution_node": "rule_based",
  "speed_kmh": 25.0
}
```

### 2. Process & Escalate Google Sheet Trips
- **Endpoint**: `POST /api/v1/sheets/process-trips`
- Evaluates pending trips and writes back `"auto_cleared"` or `"needs_manager_review"`.

### 3. Natural Language Query
- **Endpoint**: `POST /api/v1/query`
- **Request Body**:
```json
{
  "question": "How many km did Ramesh travel this week?",
  "model_name": "gpt-4o-mini"
}
```
- **Response**:
```json
{
  "answer": "Based on the trip records, Ramesh Verma traveled a total of 32.00 km across 1 trip(s).",
  "source_rows_used": [4],
  "model_used": "gpt-4o-mini",
  "prompt_tokens": 512,
  "completion_tokens": 28,
  "total_tokens": 540,
  "latency_ms": 420.5
}
```

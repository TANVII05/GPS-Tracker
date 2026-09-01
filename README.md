# 🛵 GPS Tracker

A full-stack **employee field mobility tracking** system with real-time GPS, AI-powered anomaly detection, and a natural language query assistant.

Built with **React Native (Expo)** on the frontend and **Python FastAPI + LangGraph + LangChain** on the backend.

---

## ✨ Features

### 🗺️ Core GPS Tracking
- **Live GPS tracking** during active trips with real-time distance (haversine calculation)
- **Employee login & dashboard** with trip history
- **Admin dashboard** with overview stats, all-employee trip history, and PDF export
- **Google Sheets sync** via Apps Script (optional — works fully offline too)

### 🤖 AI-Powered Backend (Python)

| Feature | Technology | What it does |
|---|---|---|
| **Anomaly Detection** | LangGraph (2-node state graph) | Auto-clears normal trips, flags suspicious speeds instantly via rule-based check — routes borderline cases to LLM for reasoning |
| **Escalation Engine** | FastAPI + gspread | Writes `auto_cleared` / `needs_manager_review` status back to Google Sheets |
| **NL Query Layer** | LangChain + OpenAI | Lets admins ask plain-English questions like *"Which trips this month look suspicious?"* with full source-row traceability |

### 📊 Admin Panel
- **AI Anomaly Badges** — 🔴 Needs Review / 🟢 Auto-Cleared on each trip card
- **Run AI Scan** — One-tap batch anomaly analysis across all trips
- **Ask AI** — Conversational query modal with token usage & latency telemetry
- **Month / Employee / Status filters** — Slice and dice trip data
- **PDF Export** — Generate formatted trip reports

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│     React Native App (Expo)     │      │    Python AI Service (FastAPI)  │
│                                 │      │                                 │
│  screens/admin/                 │ HTTP │  /api/v1/anomaly/detect         │
│    AdminOverviewScreen.js  ─────┼──────▶  /api/v1/sheets/process-trips  │
│    AdminTripsScreen.js          │      │  /api/v1/query                  │
│                                 │      │  /health                        │
│  components/                    │      │                                 │
│    AIAssistantModal.js          │      │  LangGraph Anomaly Detection    │
│                                 │      │    Node 1: Rule-Based Check     │
│  services/                      │      │    Node 2: LLM Reasoning        │
│    aiService.js ────────────────┼──────▶                                │
│    googleSheetsService.js       │      │  LangChain NL Query             │
│                                 │      │    Filter Extraction            │
│  utils/                         │      │    Row Retrieval                │
│    storage.js (AsyncStorage)    │      │    Answer Synthesis             │
│    haversine.js                 │      │                                 │
└─────────────────────────────────┘      └────────────────┬────────────────┘
                                                          │
                                                ┌─────────▼────────┐
                                                │   Google Sheets   │
                                                │  (optional sync)  │
                                                └──────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- Expo CLI (`npm install -g expo-cli`)
- An iPhone or Android device on the same Wi-Fi network, OR Expo Go

---

### 1️⃣ Clone the repo

```bash
git clone https://github.com/TANVII05/GPS-Tracker.git
cd GPS-Tracker
```

---

### 2️⃣ Run the React Native App

```bash
npm install
```

**On Windows (cmd):**
```cmd
set EXPO_NO_DEPENDENCY_VALIDATION=1
set REACT_NATIVE_PACKAGER_HOSTNAME=<YOUR_LAN_IP>
npx expo start --lan --port 8081
```

Open Safari / Chrome on your phone and go to `http://<YOUR_LAN_IP>:8081`

> **Default credentials:**
> - Admin: `admin` / `admin`
> - Employee: register via the Sign Up screen

---

### 3️⃣ Run the AI Backend (Optional — enables AI features)

```bash
cd ai-service
pip install -r requirements.txt
cp .env.example .env   # fill in your keys
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Verify it's running: `http://<YOUR_LAN_IP>:8000/health` → should return `{"status":"healthy"}`

> **Without the AI backend:** The app still works fully. Trip scanning and AI queries fall back to fast local heuristics automatically.

---

### 4️⃣ Environment Variables

#### React Native (`.env` in root)
```env
EXPO_PUBLIC_AI_SERVICE_URL=http://<YOUR_LAN_IP>:8000
EXPO_PUBLIC_GOOGLE_SHEETS_URL=          # optional
```

#### Python AI Service (`ai-service/.env`)
```env
OPENAI_API_KEY=your_openai_key_here     # optional — enables LLM reasoning
GOOGLE_SHEET_ID=                        # optional — enables Sheets sync
GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json
```

> The AI backend runs fully without any API keys using a deterministic rule-based fallback.

---

## 📂 Project Structure

```
GPS-Tracker/
├── screens/
│   ├── admin/
│   │   ├── AdminOverviewScreen.js   # Overview stats, AI quick card
│   │   └── AdminTripsScreen.js      # Trip list, AI scan, filters
│   ├── DashboardScreen.js           # Employee live trip tracking
│   └── LoginScreen.js
├── components/
│   └── AIAssistantModal.js          # AI query modal with telemetry
├── services/
│   ├── aiService.js                 # FastAPI client + offline fallback
│   └── googleSheetsService.js       # Sheets sync client
├── utils/
│   ├── storage.js                   # AsyncStorage trip CRUD
│   └── haversine.js                 # GPS distance calculation
├── ai-service/                      # Python FastAPI AI Backend
│   ├── main.py                      # FastAPI app & endpoints
│   ├── schemas.py                   # Pydantic data models
│   ├── sheets_client.py             # gspread wrapper + mock mode
│   ├── config.py                    # Centralised settings
│   ├── anomaly_detection/
│   │   ├── graph.py                 # LangGraph 2-node state graph
│   │   ├── rules.py                 # Speed-based rule checks
│   │   └── state.py                 # LangGraph TypedDict state
│   ├── escalation/
│   │   └── manager.py               # Batch escalation to Sheets
│   ├── nl_query/
│   │   ├── chain.py                 # LangChain retrieval chain
│   │   └── filter_extractor.py      # NL → structured filters
│   ├── eval/
│   │   ├── test_dataset.json        # 23 labelled test trips
│   │   └── run_eval.py              # Eval harness (100% accuracy)
│   ├── requirements.txt
│   └── .env.example
├── .github/
│   └── workflows/
│       └── ai-tests.yml             # CI: runs pytest + eval on push
├── GoogleAppsScript.js              # Apps Script for Sheets sync
├── LICENSE
└── README.md
```

---

## 🧪 Evaluation Harness

The AI anomaly detection was validated against 23 labelled test cases:

```bash
cd ai-service
python -m eval.run_eval
```

**Results:**
```
Total Test Cases : 23
Overall Accuracy : 100.0% (23/23)
Rule-Based Node  : 17 cases (73.9%)  ← 0ms LLM latency, $0 cost
LLM Reasoning    : 6 cases  (26.1%)  ← contextual reasoning
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `POST` | `/api/v1/anomaly/detect` | Analyze a single trip for anomalies |
| `POST` | `/api/v1/sheets/process-trips` | Batch scan all trips |
| `POST` | `/api/v1/query` | Ask a natural language question |
| `GET` | `/api/v1/eval/run` | Run the evaluation harness |

Interactive docs: `http://localhost:8000/docs`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native, Expo |
| State | React Hooks, AsyncStorage |
| GPS | expo-location / Browser Geolocation |
| AI Backend | Python, FastAPI, Uvicorn |
| Anomaly Detection | LangGraph (state graph) |
| NL Query | LangChain, OpenAI |
| Sheets Sync | gspread, Google Sheets API |
| Data Validation | Pydantic v2 |
| CI | GitHub Actions |

---

## 📄 License

MIT License — see [LICENSE](./LICENSE)

"""
Configuration Module for AI-Powered NCH GPS Tracker Service.

This module centralizes all environment variables, model configurations,
and domain thresholds used across the Anomaly Detection (LangGraph),
Escalation, and Natural Language Query (LangChain) modules.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the ai-service directory or project root if present
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

# --- LLM Provider Settings ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Configurable dual models for cost/latency comparison in Feature 3
# Primary model: Fast, cost-effective default (e.g., gpt-4o-mini)
MODEL_PRIMARY = os.getenv("MODEL_PRIMARY", "gpt-4o-mini")
# Secondary model: Larger reasoning model or comparison baseline (e.g., gpt-4o)
MODEL_SECONDARY = os.getenv("MODEL_SECONDARY", "gpt-4o")

# --- Domain & Threshold Settings ---
# Why these thresholds:
# In urban Indian delivery / field mobility contexts, standard two-wheeler speeds
# rarely exceed 60 km/h on regular roads. Speeds between 60 and 150 km/h may occur on highways
# or bypass expressways, requiring contextual LLM reasoning. Speeds exceeding 150 km/h
# are physically impossible for company two-wheelers and indicate GPS spoofing or clock manipulation.
NORMAL_SPEED_MAX_KMH = float(os.getenv("NORMAL_SPEED_MAX_KMH", "60.0"))
IMPOSSIBLE_SPEED_MIN_KMH = float(os.getenv("IMPOSSIBLE_SPEED_MIN_KMH", "150.0"))

# Threshold for GPS coordinate dwell anomaly (minutes at exact same lat/lon with moving distance)
MAX_STATIONARY_DWELL_MINS = float(os.getenv("MAX_STATIONARY_DWELL_MINS", "45.0"))

# --- Google Sheets API Settings ---
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "")
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "All Trips")

# Fallback / Mock Mode when Google credentials are not yet configured
ENABLE_MOCK_SHEETS_IF_NO_CREDS = os.getenv("ENABLE_MOCK_SHEETS_IF_NO_CREDS", "true").lower() == "true"

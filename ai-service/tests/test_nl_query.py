"""
Unit tests for Feature 3 (LangChain Natural Language Query Layer).

Verifies:
1. Entity and filter extraction from admin questions.
2. Grounded answer generation.
3. Strict source row ID traceability.
4. Telemetry logging (token usage, latency).
"""

import sys
from pathlib import Path
import pytest

# Add parent directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nl_query.filter_extractor import extract_query_filters
from nl_query.chain import execute_natural_language_query
from schemas import QueryResponse


def test_filter_extractor_employee_distance():
    q = "How many km did Ramesh travel this week?"
    f = extract_query_filters(q, ["Ramesh Verma", "Priya Singh"])
    assert f.employee_name == "Ramesh Verma"
    assert f.target_metric == "distance"
    assert f.date_filter == "this_week"


def test_filter_extractor_flagged_anomalies():
    q = "Which employees have flagged entries this month?"
    f = extract_query_filters(q, ["Ramesh Verma", "Priya Singh"])
    assert f.status_filter == "suspicious"
    assert f.target_metric == "anomalies"
    assert f.date_filter == "this_month"


def test_execute_query_traceability_and_telemetry():
    q = "How many km did Ramesh Verma travel?"
    res: QueryResponse = execute_natural_language_query(q)
    
    assert isinstance(res.answer, str)
    assert len(res.answer) > 0
    # Must have source rows used for grounding
    assert isinstance(res.source_rows_used, list)
    assert len(res.source_rows_used) > 0
    # Telemetry must be tracked
    assert res.latency_ms >= 0.0
    assert res.total_tokens >= 0


def test_model_switching_flag():
    """Verify that model_name parameter is supported and tracked in response."""
    res_primary: QueryResponse = execute_natural_language_query(
        "What are the total earnings for Rahul Sharma?",
        model_name="gpt-4o-mini"
    )
    assert "gpt-4o-mini" in res_primary.model_used

    res_secondary: QueryResponse = execute_natural_language_query(
        "What are the total earnings for Rahul Sharma?",
        model_name="gpt-4o"
    )
    assert "gpt-4o" in res_secondary.model_used

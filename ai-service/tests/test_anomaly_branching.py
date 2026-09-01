"""
Unit tests for Anomaly Detection LangGraph Flow & Branching Verification.

Ensures that:
1. Clear-cut normal entries (<60 km/h) resolve in Node 1 without invoking the LLM node.
2. Clear-cut impossible entries (>150 km/h) resolve in Node 1 without invoking the LLM node.
3. Borderline entries (60-150 km/h) properly branch to Node 2 (LLM Reasoning).
4. Output format strictly matches {"flag": ..., "reason": ..., "confidence": ...}.
"""

import sys
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock

# Add parent directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from schemas import TripEntry, AnomalyResult
from anomaly_detection.graph import detect_trip_anomaly, build_anomaly_detection_graph
from anomaly_detection.rules import evaluate_rule_based, calculate_speed_kmh


def test_calculate_speed():
    assert calculate_speed_kmh(30.0, 60.0) == 30.0
    assert calculate_speed_kmh(10.0, 15.0) == 40.0
    assert calculate_speed_kmh(10.0, 0.0) is None


def test_clear_normal_skips_llm():
    """
    Test that a 25 km/h urban trip resolves directly via 'rule_based'
    and never invokes the LLM node.
    """
    trip = TripEntry(
        employee_name="Rahul Sharma",
        employee_id="EMP101",
        bike_number="MH-02-AB-1234",
        date="2026-09-01",
        out_time="09:00",
        in_time="10:00",
        duration_minutes=60.0,
        distance_km=25.0,  # 25 km/h (< 60 km/h)
    )

    with patch("anomaly_detection.graph.llm_reasoning_node") as mock_llm_node:
        result = detect_trip_anomaly(trip)
        
        # Verify Node 2 was NEVER called
        mock_llm_node.assert_not_called()
        
        assert result.flag == "normal"
        assert result.resolution_node == "rule_based"
        assert result.confidence >= 0.95
        assert result.speed_kmh == 25.0
        assert "Normal urban travel speed" in result.reason


def test_clear_impossible_speed_skips_llm():
    """
    Test that a 200 km/h impossible trip resolves directly via 'rule_based'
    and never invokes the LLM node.
    """
    trip = TripEntry(
        employee_name="Amit Patel",
        employee_id="EMP102",
        bike_number="DL-01-XY-9999",
        date="2026-09-01",
        out_time="14:00",
        in_time="14:30",
        duration_minutes=30.0,
        distance_km=100.0,  # 200 km/h (> 150 km/h)
    )

    with patch("anomaly_detection.graph.llm_reasoning_node") as mock_llm_node:
        result = detect_trip_anomaly(trip)
        
        # Verify Node 2 was NEVER called
        mock_llm_node.assert_not_called()
        
        assert result.flag == "suspicious"
        assert result.resolution_node == "rule_based"
        assert result.confidence == 1.0
        assert result.speed_kmh == 200.0
        assert "impossible" in result.reason.lower()


def test_teleportation_zero_duration_skips_llm():
    """
    Test that 0 duration with >0 distance resolves directly as suspicious in Node 1.
    """
    trip = TripEntry(
        employee_name="Vikas Roy",
        employee_id="EMP103",
        duration_minutes=0.0,
        distance_km=45.0,
    )

    with patch("anomaly_detection.graph.llm_reasoning_node") as mock_llm_node:
        result = detect_trip_anomaly(trip)
        mock_llm_node.assert_not_called()
        assert result.flag == "suspicious"
        assert result.resolution_node == "rule_based"
        assert "Teleportation" in result.reason


def test_borderline_speed_triggers_llm_reasoning():
    """
    Test that an ambiguous speed of 90 km/h routes to Node 2 (LLM Reasoning).
    """
    trip = TripEntry(
        employee_name="Deepak Kumar",
        employee_id="EMP104",
        bike_number="KA-05-MM-5678",
        date="2026-09-01",
        out_time="23:30",
        in_time="00:30",
        duration_minutes=60.0,
        distance_km=90.0,  # 90 km/h (60-150 km/h range)
        historical_avg_km=30.0,
    )

    result = detect_trip_anomaly(trip)
    
    # Must be handled by LLM reasoning node
    assert result.resolution_node == "llm_reasoning"
    assert result.flag in ["normal", "suspicious"]
    assert isinstance(result.reason, str)
    assert 0.0 <= result.confidence <= 1.0
    assert result.speed_kmh == 90.0


def test_strict_output_schema():
    """
    Verify strict schema compliance.
    """
    trip = TripEntry(
        employee_name="Test User",
        employee_id="TEST01",
        duration_minutes=30.0,
        distance_km=15.0,
    )
    result = detect_trip_anomaly(trip)
    data = result.model_dump()
    assert "flag" in data
    assert "reason" in data
    assert "confidence" in data
    assert "resolution_node" in data
    assert data["flag"] in ["normal", "suspicious"]

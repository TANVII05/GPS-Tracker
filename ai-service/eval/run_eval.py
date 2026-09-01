"""
Evaluation Harness for Anomaly Detection Pipeline (Feature 2).

This script:
1. Loads pre-labeled ground truth trip cases from `test_dataset.json` (or custom file).
2. Runs each trip through the LangGraph Anomaly Detection pipeline.
3. Computes:
   - Overall Accuracy (Flag Classification)
   - Resolution Node Breakdown (Rule-Based vs LLM Reasoning)
   - Detailed Misclassification Failure Analysis
4. Outputs a structured console summary and generates `eval_report.md` & `eval_report.json`.
"""

import sys
import json
import time
from pathlib import Path
from typing import List, Dict, Any
from tabulate import tabulate

# Ensure UTF-8 stdout encoding on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure parent directory is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from schemas import (
    TripEntry,
    AnomalyResult,
    LabeledTripTestCase,
    MisclassifiedDetail,
    EvalSummaryReport,
)
from anomaly_detection.graph import detect_trip_anomaly


def run_evaluation(dataset_path: Path = None) -> EvalSummaryReport:
    """
    Executes the evaluation harness against the specified labeled dataset.
    """
    if dataset_path is None:
        dataset_path = Path(__file__).resolve().parent / "test_dataset.json"

    with open(dataset_path, "r", encoding="utf-8") as f:
        raw_cases = json.load(f)

    test_cases = [LabeledTripTestCase(**case) for case in raw_cases]
    total_cases = len(test_cases)
    
    print("\n" + "=" * 80)
    print(f"[*] STARTING ANOMALY DETECTION EVALUATION HARNESS ({total_cases} TEST CASES)")
    print("=" * 80)

    correct_flags = 0
    rule_based_count = 0
    llm_reasoning_count = 0
    misclassifications: List[MisclassifiedDetail] = []
    results_table = []

    start_time = time.time()

    for idx, tc in enumerate(test_cases, 1):
        trip = tc.trip
        pred: AnomalyResult = detect_trip_anomaly(trip)

        is_flag_correct = (pred.flag.lower() == tc.expected_flag.lower())
        if is_flag_correct:
            correct_flags += 1

        if pred.resolution_node == "rule_based":
            rule_based_count += 1
        elif pred.resolution_node == "llm_reasoning":
            llm_reasoning_count += 1

        speed = pred.speed_kmh if pred.speed_kmh is not None else 0.0

        if not is_flag_correct:
            misclassifications.append(
                MisclassifiedDetail(
                    test_id=tc.id,
                    employee_name=trip.employee_name,
                    distance_km=trip.distance_km,
                    duration_mins=trip.duration_minutes,
                    speed_kmh=speed,
                    expected_flag=tc.expected_flag,
                    predicted_flag=pred.flag,
                    expected_node=tc.expected_node,
                    predicted_node=pred.resolution_node,
                    reason=pred.reason,
                )
            )

        results_table.append([
            tc.id,
            trip.employee_name[:14],
            f"{trip.distance_km} km",
            f"{trip.duration_minutes} m",
            f"{speed} km/h",
            tc.expected_flag.upper(),
            pred.flag.upper(),
            "PASS" if is_flag_correct else "FAIL",
            pred.resolution_node,
            f"{pred.confidence:.2f}"
        ])

    elapsed_time = time.time() - start_time
    accuracy = (correct_flags / total_cases) * 100.0
    rule_based_pct = (rule_based_count / total_cases) * 100.0
    llm_pct = (llm_reasoning_count / total_cases) * 100.0

    # Print Detailed Per-Trip Table
    headers = ["ID", "Employee", "Dist", "Dur", "Speed", "Expected", "Predicted", "Match", "Node", "Conf"]
    print("\n" + tabulate(results_table, headers=headers, tablefmt="grid"))

    # Print Summary Breakdown
    print("\n" + "=" * 80)
    print("EVALUATION SUMMARY METRICS")
    print("=" * 80)
    print(f"Total Test Cases Evaluated : {total_cases}")
    print(f"Overall Accuracy           : {accuracy:.1f}% ({correct_flags}/{total_cases})")
    print(f"Total Execution Time       : {elapsed_time:.2f} seconds")
    print("-" * 80)
    print("NODE RESOLUTION BREAKDOWN (Cost & Latency Optimization):")
    print(f"  - Rule-Based Node (Node 1) : {rule_based_count} cases ({rule_based_pct:.1f}%) [0ms LLM Latency, $0 API Cost]")
    print(f"  - LLM Reasoning (Node 2)   : {llm_reasoning_count} cases ({llm_pct:.1f}%) [Contextual Reasoning]")
    print("-" * 80)

    # Print Misclassifications / Failure Analysis
    if misclassifications:
        print(f"\nMISCLASSIFIED CASES ({len(misclassifications)} failure patterns detected):")
        fail_table = []
        for m in misclassifications:
            fail_table.append([
                m.test_id,
                m.employee_name,
                f"{m.speed_kmh} km/h",
                f"Exp: {m.expected_flag} | Pred: {m.predicted_flag}",
                f"Exp Node: {m.expected_node} | Act Node: {m.predicted_node}",
                m.reason[:60] + "..." if len(m.reason) > 60 else m.reason
            ])
        print(tabulate(fail_table, headers=["ID", "Employee", "Speed", "Flag Mismatch", "Node Mismatch", "Reason"], tablefmt="grid"))
    else:
        print("\nPERFECT CLASSIFICATION: 0 misclassified cases!")

    report = EvalSummaryReport(
        total_cases=total_cases,
        correct_predictions=correct_flags,
        accuracy_percentage=round(accuracy, 2),
        rule_based_count=rule_based_count,
        rule_based_percentage=round(rule_based_pct, 2),
        llm_reasoning_count=llm_reasoning_count,
        llm_reasoning_percentage=round(llm_pct, 2),
        misclassified_count=len(misclassifications),
        misclassifications=misclassifications,
    )

    # Export to markdown & json
    export_dir = Path(__file__).resolve().parent
    with open(export_dir / "eval_report.json", "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, indent=2)

    with open(export_dir / "eval_report.md", "w", encoding="utf-8") as f:
        f.write(f"# Anomaly Detection Pipeline Evaluation Report\n\n")
        f.write(f"- **Total Test Cases**: {total_cases}\n")
        f.write(f"- **Accuracy**: **{accuracy:.1f}%** ({correct_flags}/{total_cases})\n")
        f.write(f"- **Resolved by Rule-Based Check (Node 1)**: {rule_based_count} ({rule_based_pct:.1f}%)\n")
        f.write(f"- **Resolved by LLM Reasoning (Node 2)**: {llm_reasoning_count} ({llm_pct:.1f}%)\n\n")
        f.write("## Detailed Test Results\n\n")
        f.write(tabulate(results_table, headers=headers, tablefmt="github"))
        f.write("\n\n")
        if misclassifications:
            f.write("## Failure Analysis & Misclassifications\n\n")
            f.write(tabulate(fail_table, headers=["ID", "Employee", "Speed", "Flag Mismatch", "Node Mismatch", "Reason"], tablefmt="github"))

    print(f"\nSaved reports to {export_dir / 'eval_report.md'} and {export_dir / 'eval_report.json'}\n")
    return report


if __name__ == "__main__":
    run_evaluation()

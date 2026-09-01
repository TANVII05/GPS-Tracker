"""
Evaluation module for Anomaly Detection.
"""

from eval.run_eval import run_evaluation
from eval.generate_test_data import get_default_mock_dataset, save_test_dataset

__all__ = [
    "run_evaluation",
    "get_default_mock_dataset",
    "save_test_dataset",
]

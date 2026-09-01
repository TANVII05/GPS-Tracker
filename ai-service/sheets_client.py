"""
Google Sheets Client Module.

Handles authentication and CRUD operations on Google Spreadsheets via `gspread`.
Also provides an In-Memory Mock client for offline/local development when
Google service account credentials are not yet configured.
"""

import os
import logging
from typing import List, Dict, Any, Optional
import gspread
from google.oauth2.service_account import Credentials

from config import (
    GOOGLE_SERVICE_ACCOUNT_FILE,
    GOOGLE_SHEET_ID,
    GOOGLE_SHEET_NAME,
    ENABLE_MOCK_SHEETS_IF_NO_CREDS,
)
from schemas import TripEntry

logger = logging.getLogger("sheets_client")


# Default sheet headers based on GoogleAppsScript.js plus AI review columns
DEFAULT_HEADERS = [
    "Employee Name", "Employee ID", "Bike Number", "Date",
    "OUT Time", "IN Time", "Duration (mins)", "Distance (KM)",
    "Earnings (₹)", "Month", "Year", "Sync Status", "Synced At",
    "Review Status", "Anomaly Reason"
]


class MockGoogleSheet:
    """
    In-memory mock Google Sheet providing the exact same interface
    as a real gspread Worksheet for testing and standalone operation.
    """
    def __init__(self, title: str = "All Trips"):
        self.title = title
        self.headers = list(DEFAULT_HEADERS)
        self.rows: List[List[Any]] = [
            # Sample initial mock rows
            ["Rahul Sharma", "EMP101", "MH-02-AB-1234", "2026-09-01", "09:00", "09:45", 45, 18.5, 74.0, "September", "2026", "Synced", "2026-09-01T04:15:00Z", "pending", ""],
            ["Priya Singh", "EMP102", "MH-02-CD-5678", "2026-09-01", "10:00", "10:10", 10, 85.0, 340.0, "September", "2026", "Synced", "2026-09-01T04:40:00Z", "pending", ""],
            ["Ramesh Verma", "EMP103", "MH-03-EF-9012", "2026-09-01", "11:00", "12:30", 90, 32.0, 128.0, "September", "2026", "Synced", "2026-09-01T07:00:00Z", "pending", ""],
            ["Sneha Patil", "EMP104", "MH-04-GH-3456", "2026-09-01", "14:00", "15:00", 60, 95.0, 380.0, "September", "2026", "Synced", "2026-09-01T09:30:00Z", "pending", ""],
            ["Vikram Das", "EMP105", "MH-01-IJ-7890", "2026-09-01", "16:00", "16:05", 5, 40.0, 160.0, "September", "2026", "Synced", "2026-09-01T10:35:00Z", "pending", ""],
        ]

    def get_all_records(self) -> List[Dict[str, Any]]:
        records = []
        for i, row in enumerate(self.rows):
            # Pad row if shorter than headers
            padded = row + [""] * (len(self.headers) - len(row))
            record = dict(zip(self.headers, padded))
            record["_row_index"] = i + 2  # 1-indexed, header is row 1
            records.append(record)
        return records

    def get_all_values(self) -> List[List[Any]]:
        return [self.headers] + self.rows

    def update_cell(self, row: int, col: int, value: Any):
        row_idx = row - 2  # 0-indexed data row
        col_idx = col - 1  # 0-indexed col
        if 0 <= row_idx < len(self.rows):
            while len(self.rows[row_idx]) < len(self.headers):
                self.rows[row_idx].append("")
            self.rows[row_idx][col_idx] = value

    def append_row(self, values: List[Any]):
        self.rows.append(values)


class GoogleSheetsClient:
    """
    Production-ready Google Sheets wrapper.
    Connects to Google Sheets using a Service Account JSON file.
    Falls back gracefully to MockGoogleSheet if no credentials are present.
    """
    def __init__(self):
        self.client: Optional[gspread.Client] = None
        self.worksheet = None
        self.is_mock = False
        self._initialize()

    def _initialize(self):
        creds_path = GOOGLE_SERVICE_ACCOUNT_FILE
        if os.path.exists(creds_path) and GOOGLE_SHEET_ID:
            try:
                scopes = [
                    "https://www.googleapis.com/auth/spreadsheets",
                    "https://www.googleapis.com/auth/drive",
                ]
                credentials = Credentials.from_service_account_file(creds_path, scopes=scopes)
                self.client = gspread.authorize(credentials)
                spreadsheet = self.client.open_by_key(GOOGLE_SHEET_ID)
                self.worksheet = spreadsheet.worksheet(GOOGLE_SHEET_NAME)
                self._ensure_ai_columns()
                logger.info(f"Successfully connected to Google Sheet: {GOOGLE_SHEET_ID} ({GOOGLE_SHEET_NAME})")
                return
            except Exception as e:
                logger.warning(f"Could not connect to live Google Sheet ({e}). Falling back to mock client.")

        if ENABLE_MOCK_SHEETS_IF_NO_CREDS:
            logger.info("Initializing in-memory MockGoogleSheet for local / offline development.")
            self.worksheet = MockGoogleSheet(GOOGLE_SHEET_NAME)
            self.is_mock = True
        else:
            raise RuntimeError(
                f"Google Service Account file '{creds_path}' not found and ENABLE_MOCK_SHEETS_IF_NO_CREDS is False."
            )

    def _ensure_ai_columns(self):
        """Ensures 'Review Status' and 'Anomaly Reason' columns exist in header."""
        if not self.worksheet or self.is_mock:
            return
        try:
            headers = self.worksheet.row_values(1)
            updated = False
            if "Review Status" not in headers:
                headers.append("Review Status")
                updated = True
            if "Anomaly Reason" not in headers:
                headers.append("Anomaly Reason")
                updated = True
            if updated:
                self.worksheet.update("A1", [headers])
        except Exception as e:
            logger.warning(f"Could not update header columns: {e}")

    def fetch_all_trips(self) -> List[TripEntry]:
        """
        Fetches all trips from the sheet and parses them into TripEntry Pydantic models.
        """
        records = self.worksheet.get_all_records()
        trips = []
        for rec in records:
            # Clean keys
            row_idx = rec.get("_row_index")
            try:
                duration = float(rec.get("Duration (mins)") or rec.get("Duration", 0))
            except (ValueError, TypeError):
                duration = 0.0

            try:
                distance = float(rec.get("Distance (KM)") or rec.get("Distance", 0))
            except (ValueError, TypeError):
                distance = 0.0

            try:
                earnings = float(rec.get("Earnings (₹)") or rec.get("Earnings", 0))
            except (ValueError, TypeError):
                earnings = 0.0

            trip = TripEntry(
                row_index=row_idx,
                employee_name=str(rec.get("Employee Name", "Unknown")),
                employee_id=str(rec.get("Employee ID", "Unknown")),
                bike_number=str(rec.get("Bike Number", "N/A")),
                date=str(rec.get("Date", "")),
                out_time=str(rec.get("OUT Time", "")),
                in_time=str(rec.get("IN Time", "")),
                duration_minutes=duration,
                distance_km=distance,
                earnings=earnings,
                month=str(rec.get("Month", "")),
                year=str(rec.get("Year", "")),
                sync_status=str(rec.get("Sync Status", "Synced")),
                review_status=rec.get("Review Status", "pending") or "pending",
                anomaly_reason=rec.get("Anomaly Reason", ""),
            )
            trips.append(trip)
        return trips

    def update_trip_review_status(
        self,
        row_index: int,
        review_status: str,
        anomaly_reason: str = ""
    ) -> bool:
        """
        Updates the Review Status (column 14) and Anomaly Reason (column 15) for a given row.
        """
        try:
            # In our 14-column layout:
            # Col 14 is "Review Status"
            # Col 15 is "Anomaly Reason"
            self.worksheet.update_cell(row_index, 14, review_status)
            if anomaly_reason:
                self.worksheet.update_cell(row_index, 15, anomaly_reason)
            return True
        except Exception as e:
            logger.error(f"Failed to update row {row_index}: {e}")
            return False


# Singleton client instance
sheets_client = GoogleSheetsClient()

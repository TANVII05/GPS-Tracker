"""
Rule-Based Pre-check Engine for Anomaly Detection (Node 1 Logic).

Why this rule-based short-circuit exists:
1. Latency & Cost Optimization: In a production field tracking system, 70-85% of trips
   exhibit completely standard travel speeds (<60 km/h) or blatant impossible teleportation (>150 km/h).
   Evaluating these deterministically via mathematical rules runs in microseconds (<0.1ms)
   at $0 LLM API cost, saving significant compute and operational expenses.
2. Determinism: Physical laws (such as traveling 100 km in 2 minutes) do not require probabilistic
   LLM reasoning. Hard physical constraints are best enforced deterministically.
"""

from typing import Tuple, Optional
from config import NORMAL_SPEED_MAX_KMH, IMPOSSIBLE_SPEED_MIN_KMH, MAX_STATIONARY_DWELL_MINS
from schemas import TripEntry


def calculate_speed_kmh(distance_km: float, duration_minutes: float) -> Optional[float]:
    """
    Calculates average speed in km/h from distance in km and duration in minutes.
    Returns None if duration is non-positive.
    """
    if duration_minutes <= 0:
        return None
    hours = duration_minutes / 60.0
    return round(distance_km / hours, 2)


def check_coordinate_dwell_anomaly(trip: TripEntry) -> Tuple[bool, Optional[str]]:
    """
    Checks if the coordinates log indicates GPS spoofing/dwell:
    e.g., coordinates remain identical for an unusual duration (>45 mins)
    while distance traveled is non-zero (> 0.5 km).
    """
    if not trip.coordinates_log or len(trip.coordinates_log) < 2:
        return False, None
    
    first_pt = trip.coordinates_log[0]
    all_same = True
    for pt in trip.coordinates_log[1:]:
        if abs(pt.latitude - first_pt.latitude) > 0.0001 or abs(pt.longitude - first_pt.longitude) > 0.0001:
            all_same = False
            break
            
    if all_same and trip.duration_minutes >= MAX_STATIONARY_DWELL_MINS and trip.distance_km > 0.5:
        return True, (
            f"GPS Dwell Spoofing: Recorded {trip.distance_km} km distance, but GPS coordinates "
            f"remained completely static ({first_pt.latitude}, {first_pt.longitude}) for {trip.duration_minutes} mins."
        )
        
    return False, None


def evaluate_rule_based(trip: TripEntry) -> Tuple[bool, Optional[str], Optional[str], Optional[float], Optional[float]]:
    """
    Evaluates rule-based constraints on a trip entry.
    
    Returns:
        (is_resolved, flag, reason, confidence, speed_kmh)
        - is_resolved: True if Node 1 conclusively resolves the case (skipping LLM), False if ambiguous.
        - flag: 'normal' | 'suspicious' | None
        - reason: Explanation string
        - confidence: 0.0 - 1.0
        - speed_kmh: Computed average speed
    """
    duration = trip.duration_minutes
    distance = trip.distance_km
    
    # 1. Zero/negative duration checks
    if duration <= 0:
        if distance > 0:
            return (
                True,
                "suspicious",
                f"Teleportation anomaly: Recorded {distance} km with {duration} minutes duration.",
                1.0,
                None,
            )
        else:
            # 0 distance and 0 duration
            return (
                True,
                "normal",
                "Empty zero-duration stationary trip entry.",
                0.95,
                0.0,
            )

    speed = calculate_speed_kmh(distance, duration)
    
    # 2. Check coordinate dwell spoofing
    has_dwell_anomaly, dwell_reason = check_coordinate_dwell_anomaly(trip)
    if has_dwell_anomaly:
        return (
            True,
            "suspicious",
            dwell_reason,
            0.98,
            speed,
        )

    # 3. Clearly impossible speed (> 150 km/h) -> Instant suspicious flag without LLM
    if speed > IMPOSSIBLE_SPEED_MIN_KMH:
        return (
            True,
            "suspicious",
            f"Physically impossible speed: {speed} km/h exceeds upper boundary ({IMPOSSIBLE_SPEED_MIN_KMH} km/h) for field two-wheelers.",
            1.0,
            speed,
        )

    # 4. Clearly normal urban speed (< 60 km/h) -> Instant normal flag without LLM
    if speed < NORMAL_SPEED_MAX_KMH:
        return (
            True,
            "normal",
            f"Normal urban travel speed ({speed} km/h) within safe operating threshold (<{NORMAL_SPEED_MAX_KMH} km/h).",
            0.99,
            speed,
        )

    # 5. Ambiguous speed range (60 km/h <= speed <= 150 km/h)
    # Could be expressways/highways, or intermittent GPS jumping/spoofing. Requires LLM contextual reasoning.
    return (
        False,
        None,
        f"Ambiguous speed ({speed} km/h) between {NORMAL_SPEED_MAX_KMH} and {IMPOSSIBLE_SPEED_MIN_KMH} km/h. Requires contextual LLM reasoning.",
        None,
        speed,
    )

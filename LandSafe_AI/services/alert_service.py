"""
LandSafe AI - Alert & Warning Management Service
Evaluates multi-factor thresholds, suppresses duplicate alerts, and logs active warnings.
"""

from datetime import datetime
from database.db import get_alerts, acknowledge_alert

# Default thresholds
ALERT_THRESHOLDS = {
    "slope_critical_deg": 30.0,
    "rainfall_24h_critical_mm": 50.0,
    "rainfall_72h_critical_mm": 120.0,
    "soil_moisture_critical_pct": 70.0,
    "speed_limit_warning_kmh": 60.0
}

def evaluate_and_format_alert(risk_level: str, location_name: str, primary_factor: str, score: float) -> dict:
    """Format an in-app and browser notification payload."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if risk_level == "HIGH RISK":
        return {
            "type": "CRITICAL_WARNING",
            "level": "HIGH RISK",
            "title": f"CRITICAL LANDSLIDE WARNING: {location_name}",
            "body": f"High risk detected (Score {score}/100). {primary_factor}. Avoid travel and adhere to local SDMA/NDRF advisories.",
            "urgency": "critical",
            "badge_color": "#ef4444",
            "timestamp": timestamp,
            "sound": True
        }
    elif risk_level == "MEDIUM RISK":
        return {
            "type": "WEATHER_ADVISORY",
            "level": "MEDIUM RISK",
            "title": f"Landslide Advisory: {location_name}",
            "body": f"Medium risk level (Score {score}/100). {primary_factor}. Monitor slope stability.",
            "urgency": "warning",
            "badge_color": "#f59e0b",
            "timestamp": timestamp,
            "sound": False
        }
    else:
        return {
            "type": "STATUS_OK",
            "level": "LOW RISK",
            "title": f"Terrain Status Normal: {location_name}",
            "body": "Environmental conditions within normal baseline limits.",
            "urgency": "low",
            "badge_color": "#10b981",
            "timestamp": timestamp,
            "sound": False
        }

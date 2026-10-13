"""
LandSafe AI - Machine Learning Prediction Service
Validates features, executes Random Forest inference, extracts class probabilities,
analyzes contributing risk factors, and provides explainable precautions.
"""

import os
import json
import joblib
import pandas as pd
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "landslide_risk_model.pkl")
METADATA_PATH = os.path.join(MODEL_DIR, "model_metadata.json")

_model_pipeline = None
_model_metadata = None

def load_model():
    """Load cached model pipeline and metadata."""
    global _model_pipeline, _model_metadata
    if _model_pipeline is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}. Run train_model.py first.")
        _model_pipeline = joblib.load(MODEL_PATH)
        
    if _model_metadata is None:
        if os.path.exists(METADATA_PATH):
            with open(METADATA_PATH, "r") as f:
                _model_metadata = json.load(f)
        else:
            _model_metadata = {"status": "metadata_unavailable"}
            
    return _model_pipeline, _model_metadata

def get_model_status():
    """Return model health and metrics telemetry."""
    try:
        _, metadata = load_model()
        return {
            "status": "loaded",
            "model_path": MODEL_PATH,
            "metrics": metadata.get("metrics", {}),
            "feature_importances": metadata.get("feature_importances", {}),
            "features": metadata.get("features", []),
            "trained_at": metadata.get("trained_at", "Unknown"),
            "algorithm": metadata.get("algorithm", "RandomForestClassifier")
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e)
        }

def evaluate_landslide_risk(inputs: dict) -> dict:
    """
    Run full ML risk inference given geotechnical and meteorological inputs.
    
    Expected inputs keys:
    - rainfall_mm (float)
    - rainfall_72h_accum_mm (float)
    - soil_moisture_pct (float)
    - slope_degrees (float)
    - elevation_m (float)
    - temperature_c (float)
    - humidity_pct (float)
    - lithology_risk_index (int, 1 to 5)
    """
    pipeline, metadata = load_model()
    
    # Clean and validate inputs with sensible boundaries
    rainfall_24h = max(0.0, float(inputs.get("rainfall_mm", 0.0)))
    rainfall_72h = max(rainfall_24h, float(inputs.get("rainfall_72h_accum_mm", rainfall_24h * 1.5)))
    soil_moisture = min(100.0, max(0.0, float(inputs.get("soil_moisture_pct", 30.0))))
    slope = min(85.0, max(0.0, float(inputs.get("slope_degrees", 15.0))))
    elevation = max(0.0, float(inputs.get("elevation_m", 500.0)))
    temp = float(inputs.get("temperature_c", 22.0))
    humidity = min(100.0, max(10.0, float(inputs.get("humidity_pct", 65.0))))
    lithology = min(5, max(1, int(inputs.get("lithology_risk_index", 3))))

    # Create single-row DataFrame with exact feature order
    feature_cols = [
        "rainfall_mm",
        "rainfall_72h_accum_mm",
        "soil_moisture_pct",
        "slope_degrees",
        "elevation_m",
        "temperature_c",
        "humidity_pct",
        "lithology_risk_index"
    ]
    
    input_df = pd.DataFrame([{
        "rainfall_mm": rainfall_24h,
        "rainfall_72h_accum_mm": rainfall_72h,
        "soil_moisture_pct": soil_moisture,
        "slope_degrees": slope,
        "elevation_m": elevation,
        "temperature_c": temp,
        "humidity_pct": humidity,
        "lithology_risk_index": lithology
    }], columns=feature_cols)

    # ML Inference
    predicted_class = pipeline.predict(input_df)[0]
    probabilities = pipeline.predict_proba(input_df)[0]
    classes = list(pipeline.classes_)

    prob_dict = {cls_name: round(float(prob), 4) for cls_name, prob in zip(classes, probabilities)}
    prob_low = prob_dict.get("LOW RISK", 0.0)
    prob_med = prob_dict.get("MEDIUM RISK", 0.0)
    prob_high = prob_dict.get("HIGH RISK", 0.0)

    # Composite Risk Score (0 to 100) based on weighted probabilities
    composite_risk_score = round((prob_low * 15.0 + prob_med * 55.0 + prob_high * 95.0), 1)

    # Confidence is winning class probability
    confidence = round(float(max(probabilities)), 4)

    # Analyze primary contributing factors
    contributing_factors = []
    if slope >= 28.0:
        contributing_factors.append(f"Steep slope inclination ({slope:.1f}°)")
    if rainfall_24h >= 45.0:
        contributing_factors.append(f"Heavy 24h precipitation downpour ({rainfall_24h:.1f} mm)")
    if rainfall_72h >= 110.0:
        contributing_factors.append(f"Elevated 72h antecedent rainfall build-up ({rainfall_72h:.1f} mm)")
    if soil_moisture >= 65.0:
        contributing_factors.append(f"High pore-water saturation ({soil_moisture:.1f}% soil moisture)")
    if lithology >= 4:
        litho_names = {4: "Weak fractured shale/phyllite", 5: "Loose unconsolidated debris/alluvium"}
        contributing_factors.append(f"Fragile geological strata ({litho_names.get(lithology)})")

    if not contributing_factors:
        if slope < 10.0:
            contributing_factors.append(f"Gentle terrain slope ({slope:.1f}°) with low gravitational shear stress")
        else:
            contributing_factors.append("Moderate environmental parameters within safe thresholds")

    primary_factor = "; ".join(contributing_factors[:2])

    # Formulate actionable precautions
    if predicted_class == "HIGH RISK":
        recommendations = (
            "CRITICAL: High landslide-risk conditions detected. Follow local authority instructions, "
            "avoid unstable slopes and drainage channels, and move away from danger when it is safe to do so. "
            "Cease hill road travel and secure emergency supplies."
        )
    elif predicted_class == "MEDIUM RISK":
        recommendations = (
            "CAUTION: Moderate landslide hazard. Monitor local hill slopes for tension cracks, muddy runoff, "
            "or bulging toe areas. Keep vehicle speed below 40 km/h along mountain corridors and prepare contingency plans."
        )
    else:
        recommendations = (
            "LOW RISK: Environmental parameters currently indicate low probability of slope failure. "
            "Continue standard seasonal monitoring, keep culverts clear, and observe local weather updates."
        )

    return {
        "risk_level": predicted_class,
        "risk_score": composite_risk_score,
        "confidence": confidence,
        "probabilities": {
            "low_risk": prob_low,
            "medium_risk": prob_med,
            "high_risk": prob_high
        },
        "primary_factor": primary_factor,
        "contributing_factors": contributing_factors,
        "recommendations": recommendations,
        "feature_values": {
            "rainfall_mm": rainfall_24h,
            "rainfall_72h_accum_mm": rainfall_72h,
            "soil_moisture_pct": soil_moisture,
            "slope_degrees": slope,
            "elevation_m": elevation,
            "temperature_c": temp,
            "humidity_pct": humidity,
            "lithology_risk_index": lithology
        }
    }

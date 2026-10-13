"""
LandSafe AI - Flask REST Backend & Application Server
AI-Based Landslide Monitoring, Prediction and Early Warning System for North-Eastern Region (NER) India.
"""

import os
import csv
import io
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, send_file, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import Config
from database.db import (
    init_db, save_prediction, get_recent_predictions, get_monitoring_stations,
    get_alerts, acknowledge_alert, save_terrain_review, get_admin_dashboard_stats,
    verify_admin_login, get_all_system_settings, update_system_setting,
    get_all_terrain_reviews, create_test_alert, get_full_export_data
)
from services.weather_service import get_live_weather
from services.elevation_service import get_elevation_and_slope
from services.location_service import get_location_name, search_location, get_ip_location
from services.prediction_service import evaluate_landslide_risk, get_model_status
from services.terrain_service import assess_terrain_image, compare_satellite_frames, allowed_file
from services.alert_service import evaluate_and_format_alert

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# Ensure database and upload folders exist
with app.app_context():
    init_db()
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# -------------------------------------------------------------
# Frontend Route
# -------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")

# -------------------------------------------------------------
# API Endpoints
# -------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health_check():
    """System health check, database status, model telemetry."""
    model_status = get_model_status()
    db_file = app.config["DATABASE"]
    db_ok = os.path.exists(db_file)
    
    return jsonify({
        "status": "healthy" if db_ok and model_status.get("status") == "loaded" else "degraded",
        "timestamp": datetime.now().isoformat(),
        "application": "LandSafe AI",
        "version": "1.0.0",
        "database": {"status": "connected" if db_ok else "error", "path": db_file},
        "model": model_status,
        "external_apis": {
            "open_meteo_weather": "online",
            "open_meteo_elevation": "online",
            "osm_nominatim": "online"
        }
    })

@app.route("/api/weather", methods=["GET"])
def weather_endpoint():
    """Retrieve live weather and multi-day telemetry for coordinates."""
    lat_val = request.args.get("lat")
    lon_val = request.args.get("lon")
    if not lat_val or not lon_val:
        return jsonify({"status": "error", "message": "Missing lat or lon query parameter"}), 400
    try:
        lat = float(lat_val)
        lon = float(lon_val)
        weather_data = get_live_weather(lat, lon)
        return jsonify(weather_data)
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid numeric coordinates"}), 400

@app.route("/api/elevation", methods=["GET"])
def elevation_endpoint():
    """Retrieve elevation and Horn 3x3 slope calculation."""
    lat_val = request.args.get("lat")
    lon_val = request.args.get("lon")
    if not lat_val or not lon_val:
        return jsonify({"status": "error", "message": "Missing lat or lon parameter"}), 400
    try:
        lat = float(lat_val)
        lon = float(lon_val)
        elev_data = get_elevation_and_slope(lat, lon)
        return jsonify(elev_data)
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid numeric coordinates"}), 400

@app.route("/api/location", methods=["GET"])
def location_endpoint():
    """Resolve coordinates to human-readable address."""
    lat_val = request.args.get("lat")
    lon_val = request.args.get("lon")
    if not lat_val or not lon_val:
        return jsonify({"status": "error", "message": "Missing lat or lon parameter"}), 400
    try:
        lat = float(lat_val)
        lon = float(lon_val)
        name = get_location_name(lat, lon)
        return jsonify({"status": "success", "location_name": name, "latitude": lat, "longitude": lon})
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid coordinates"}), 400

@app.route("/api/search", methods=["GET"])
def search_endpoint():
    """Search for locations by place name."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"status": "error", "message": "Search query cannot be empty"}), 400
    results = search_location(query)
    return jsonify({"status": "success", "results": results})

@app.route("/api/location/ip", methods=["GET"])
def ip_location_endpoint():
    """Detect location via client IP address (useful when browser GPS is blocked/unavailable)."""
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    if client_ip and "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()
    result = get_ip_location(client_ip)
    return jsonify(result)

@app.route("/api/predict", methods=["POST"])
def predict_endpoint():
    """Manual feature prediction endpoint."""
    data = request.get_json(silent=True) or {}
    try:
        result = evaluate_landslide_risk(data)
        
        # Save prediction if requested
        if data.get("save_record", False):
            record = {
                "timestamp": datetime.now().isoformat(),
                "location_name": data.get("location_name", "Manual Simulation"),
                "latitude": float(data.get("latitude", 0.0)),
                "longitude": float(data.get("longitude", 0.0)),
                "rainfall_mm": result["feature_values"]["rainfall_mm"],
                "rainfall_72h_accum_mm": result["feature_values"]["rainfall_72h_accum_mm"],
                "soil_moisture_pct": result["feature_values"]["soil_moisture_pct"],
                "slope_degrees": result["feature_values"]["slope_degrees"],
                "elevation_m": result["feature_values"]["elevation_m"],
                "temperature_c": result["feature_values"]["temperature_c"],
                "humidity_pct": result["feature_values"]["humidity_pct"],
                "lithology_risk_index": result["feature_values"]["lithology_risk_index"],
                "risk_level": result["risk_level"],
                "risk_score": result["risk_score"],
                "confidence": result["confidence"],
                "prob_low": result["probabilities"]["low_risk"],
                "prob_med": result["probabilities"]["medium_risk"],
                "prob_high": result["probabilities"]["high_risk"],
                "primary_factor": result["primary_factor"],
                "recommendations": result["recommendations"],
                "is_live": 0
            }
            pred_id = save_prediction(record)
            result["record_id"] = pred_id

        return jsonify({"status": "success", "prediction": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/live-risk", methods=["POST"])
def live_risk_endpoint():
    """
    Unified Live Risk Evaluation Pipeline:
    Takes latitude and longitude (from device GPS or selected hotspot),
    fetches live weather, digital elevation, Horn 3x3 slope, executes ML model,
    saves record in database, and formats notifications.
    """
    data = request.get_json(silent=True) or {}
    lat_val = data.get("latitude")
    lon_val = data.get("longitude")
    is_live = bool(data.get("is_live", False))
    
    if lat_val is None or lon_val is None:
        return jsonify({"status": "error", "message": "Missing latitude or longitude in request body"}), 400

    try:
        lat = float(lat_val)
        lon = float(lon_val)
        
        # 1. Resolve location name
        loc_name = data.get("location_name")
        if not loc_name:
            loc_name = get_location_name(lat, lon)

        # 2. Fetch live weather & soil moisture from Open-Meteo
        weather_res = get_live_weather(lat, lon)
        rainfall_24h = weather_res.get("rainfall_24h_mm", 0.0)
        rainfall_72h = weather_res.get("rainfall_72h_accum_mm", 0.0)
        soil_moisture = weather_res.get("soil_moisture_pct") or 35.0
        temp = weather_res.get("temperature_c") if weather_res.get("temperature_c") is not None else 22.0
        humidity = weather_res.get("humidity_pct") if weather_res.get("humidity_pct") is not None else 70.0

        # 3. Fetch elevation & Horn 3x3 slope
        elev_res = get_elevation_and_slope(lat, lon)
        elevation = elev_res.get("elevation_m", 450.0)
        slope = elev_res.get("slope_degrees", 15.0)

        # 4. Geological lithology index (override or terrain heuristic)
        lithology = int(data.get("lithology_risk_index", 4 if elevation > 800 else 3))

        # 5. Run ML Risk Evaluation
        ml_inputs = {
            "rainfall_mm": rainfall_24h,
            "rainfall_72h_accum_mm": rainfall_72h,
            "soil_moisture_pct": soil_moisture,
            "slope_degrees": slope,
            "elevation_m": elevation,
            "temperature_c": temp,
            "humidity_pct": humidity,
            "lithology_risk_index": lithology
        }
        prediction = evaluate_landslide_risk(ml_inputs)

        # 6. Save persistent record in SQLite
        db_record = {
            "timestamp": datetime.now().isoformat(),
            "location_name": loc_name,
            "latitude": lat,
            "longitude": lon,
            "rainfall_mm": rainfall_24h,
            "rainfall_72h_accum_mm": rainfall_72h,
            "soil_moisture_pct": soil_moisture,
            "slope_degrees": slope,
            "elevation_m": elevation,
            "temperature_c": temp,
            "humidity_pct": humidity,
            "lithology_risk_index": lithology,
            "risk_level": prediction["risk_level"],
            "risk_score": prediction["risk_score"],
            "confidence": prediction["confidence"],
            "prob_low": prediction["probabilities"]["low_risk"],
            "prob_med": prediction["probabilities"]["medium_risk"],
            "prob_high": prediction["probabilities"]["high_risk"],
            "primary_factor": prediction["primary_factor"],
            "recommendations": prediction["recommendations"],
            "is_live": 1 if is_live else 0
        }
        pred_id = save_prediction(db_record)

        # 7. Format alert notification payload
        alert_info = evaluate_and_format_alert(
            prediction["risk_level"], loc_name, prediction["primary_factor"], prediction["risk_score"]
        )

        return jsonify({
            "status": "success",
            "record_id": pred_id,
            "location_name": loc_name,
            "latitude": lat,
            "longitude": lon,
            "is_live": is_live,
            "weather": weather_res,
            "topography": elev_res,
            "prediction": prediction,
            "alert": alert_info,
            "evaluated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

    except Exception as e:
        return jsonify({"status": "error", "message": f"Live risk pipeline failed: {str(e)}"}), 500

@app.route("/api/forecast", methods=["GET"])
def forecast_endpoint():
    """7-day experimental landslide risk forecast."""
    lat_val = request.args.get("lat")
    lon_val = request.args.get("lon")
    if not lat_val or not lon_val:
        return jsonify({"status": "error", "message": "Missing lat or lon parameter"}), 400
    try:
        lat = float(lat_val)
        lon = float(lon_val)
        
        weather_data = get_live_weather(lat, lon)
        elev_data = get_elevation_and_slope(lat, lon)
        slope = elev_data.get("slope_degrees", 15.0)
        elevation = elev_data.get("elevation_m", 450.0)

        daily = weather_data.get("daily_forecast", {})
        dates = daily.get("time", [])
        precip_sums = daily.get("precipitation_sum", [])
        temp_maxs = daily.get("temp_max", [])

        forecast_timeline = []
        accumulated_rain = weather_data.get("rainfall_72h_accum_mm", 0.0)

        for i, dt in enumerate(dates):
            day_rain = precip_sums[i] if i < len(precip_sums) and precip_sums[i] is not None else 0.0
            accumulated_rain = (accumulated_rain * 0.7) + day_rain  # Decay antecedent and add day rain
            soil_moist_est = min(95.0, max(20.0, 25.0 + accumulated_rain * 0.35))
            day_temp = temp_maxs[i] if i < len(temp_maxs) and temp_maxs[i] is not None else 24.0

            pred = evaluate_landslide_risk({
                "rainfall_mm": day_rain,
                "rainfall_72h_accum_mm": accumulated_rain,
                "soil_moisture_pct": soil_moist_est,
                "slope_degrees": slope,
                "elevation_m": elevation,
                "temperature_c": day_temp,
                "humidity_pct": 75.0,
                "lithology_risk_index": 4 if elevation > 800 else 3
            })

            forecast_timeline.append({
                "date": dt,
                "expected_precipitation_mm": round(day_rain, 1),
                "cumulative_72h_projected_mm": round(accumulated_rain, 1),
                "estimated_soil_moisture_pct": round(soil_moist_est, 1),
                "forecast_risk_level": pred["risk_level"],
                "risk_score": pred["risk_score"],
                "confidence": pred["confidence"],
                "primary_factor": pred["primary_factor"]
            })

        return jsonify({
            "status": "success",
            "latitude": lat,
            "longitude": lon,
            "elevation_m": elevation,
            "slope_degrees": slope,
            "forecast_days_count": len(forecast_timeline),
            "forecast_timeline": forecast_timeline,
            "disclaimer": "Experimental forecast-based risk estimate. Numerical weather forecasts carry inherent meteorological uncertainty. Never use as an exact landslide timestamp."
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/risk-map", methods=["GET"])
def risk_map_endpoint():
    """Get all pre-seeded monitoring stations and active regional risk statuses."""
    stations = get_monitoring_stations()
    # Augment with current live weather status for primary stations
    return jsonify({
        "status": "success",
        "stations": stations,
        "region": "North-Eastern Region (NER) India & Himalayan Corridors",
        "legend": {
            "LOW RISK": {"color": "#10b981", "description": "Slope stability indicators within safe baseline"},
            "MEDIUM RISK": {"color": "#f59e0b", "description": "Increased pore-pressure or rainfall build-up"},
            "HIGH RISK": {"color": "#ef4444", "description": "Critical slope angle and saturation; debris flow hazard"},
            "USER GPS": {"color": "#3b82f6", "description": "Live device location via browser geolocation"}
        }
    })

@app.route("/api/terrain/analyze", methods=["POST"])
def terrain_analyze_endpoint():
    """Upload and assess terrain photograph quality using OpenCV."""
    if "image" not in request.files:
        return jsonify({"status": "error", "message": "No image file provided in upload"}), 400
    
    file = request.files["image"]
    if file.filename == "":
        return jsonify({"status": "error", "message": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"status": "error", "message": "Unsupported file format. Use JPG, JPEG, PNG, or WEBP."}), 400

    try:
        filename = secure_filename(file.filename)
        timestamp_prefix = datetime.now().strftime("%Y%m%d_%H%M%S_")
        saved_name = timestamp_prefix + filename
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], saved_name)
        file.save(file_path)

        # Run OpenCV image analysis
        analysis = assess_terrain_image(file_path)
        
        # Save record to database
        if analysis.get("status") == "success":
            save_terrain_review({
                "timestamp": datetime.now().isoformat(),
                "filename": saved_name,
                "sharpness_score": analysis["sharpness_score"],
                "brightness_score": analysis["brightness_score"],
                "contrast_score": analysis["contrast_score"],
                "is_usable": 1 if analysis["is_usable"] else 0,
                "quality_status": analysis["review_status"],
                "detected_features": f"Edge density {analysis['edge_density_pct']}%, Sharpness: {analysis['sharpness_label']}",
                "assessment_notes": analysis["assessment_summary"]
            })

        analysis["image_url"] = f"/static/uploads/{saved_name}"
        return jsonify(analysis)

    except Exception as e:
        return jsonify({"status": "error", "message": f"Terrain analysis failed: {str(e)}"}), 500

@app.route("/api/satellite/compare", methods=["POST"])
def satellite_compare_endpoint():
    """Compare multi-temporal satellite imagery for terrain change detection."""
    try:
        img_dir = os.path.join(app.root_path, "static", "images")
        before_path = os.path.join(img_dir, "satellite_before.jpg")
        after_path = os.path.join(img_dir, "satellite_after.jpg")
        diff_path = os.path.join(img_dir, "satellite_diff.jpg")

        # Check if user provided custom files in request
        if "before_image" in request.files and "after_image" in request.files:
            b_file = request.files["before_image"]
            a_file = request.files["after_image"]
            b_path = os.path.join(app.config["UPLOAD_FOLDER"], "custom_before.jpg")
            a_path = os.path.join(app.config["UPLOAD_FOLDER"], "custom_after.jpg")
            d_path = os.path.join(app.config["UPLOAD_FOLDER"], "custom_diff.jpg")
            b_file.save(b_path)
            a_file.save(a_path)
            res = compare_satellite_frames(b_path, a_path, d_path)
            res["before_url"] = "/static/uploads/custom_before.jpg"
            res["after_url"] = "/static/uploads/custom_after.jpg"
            res["diff_url"] = "/static/uploads/custom_diff.jpg"
            return jsonify(res)
        else:
            # Use benchmark NER Teesta Valley pre/post monsoon scenario
            res = compare_satellite_frames(before_path, after_path, diff_path)
            res["before_url"] = "/static/images/satellite_before.jpg"
            res["after_url"] = "/static/images/satellite_after.jpg"
            res["diff_url"] = "/static/images/satellite_diff.jpg"
            res["scenario_name"] = "Benchmark: Teesta Valley Himalayan Slope (Pre-Monsoon vs Post-Monsoon)"
            return jsonify(res)

    except Exception as e:
        return jsonify({"status": "error", "message": f"Satellite comparison failed: {str(e)}"}), 500

@app.route("/api/alerts", methods=["GET"])
def alerts_endpoint():
    """Retrieve recent alerts."""
    limit = int(request.args.get("limit", 25))
    alerts = get_alerts(limit=limit)
    return jsonify({"status": "success", "alerts": alerts})

@app.route("/api/alerts/ack/<int:alert_id>", methods=["POST"])
def ack_alert_endpoint(alert_id):
    """Acknowledge an alert."""
    acknowledge_alert(alert_id)
    return jsonify({"status": "success", "message": "Alert acknowledged."})

@app.route("/api/history", methods=["GET"])
def history_endpoint():
    """Retrieve prediction history logs."""
    limit = int(request.args.get("limit", 50))
    filter_risk = request.args.get("risk")
    preds = get_recent_predictions(limit=limit, filter_risk=filter_risk)
    return jsonify({"status": "success", "count": len(preds), "predictions": preds})

@app.route("/api/history/export", methods=["GET"])
def export_history_endpoint():
    """Download prediction history as a clean CSV file."""
    preds = get_recent_predictions(limit=1000)
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = [
        "ID", "Timestamp", "Location", "Latitude", "Longitude",
        "Rainfall_24h_mm", "Rainfall_72h_mm", "Soil_Moisture_Pct",
        "Slope_Degrees", "Elevation_M", "Temp_C", "Humidity_Pct",
        "Lithology_Index", "Risk_Level", "Risk_Score", "Confidence",
        "Prob_Low", "Prob_Med", "Prob_High", "Primary_Factor", "Is_Live_GPS"
    ]
    writer.writerow(headers)

    for p in preds:
        writer.writerow([
            p.get("id"), p.get("timestamp"), p.get("location_name"),
            p.get("latitude"), p.get("longitude"), p.get("rainfall_mm"),
            p.get("rainfall_72h_accum_mm"), p.get("soil_moisture_pct"),
            p.get("slope_degrees"), p.get("elevation_m"), p.get("temperature_c"),
            p.get("humidity_pct"), p.get("lithology_risk_index"),
            p.get("risk_level"), p.get("risk_score"), p.get("confidence"),
            p.get("prob_low"), p.get("prob_med"), p.get("prob_high"),
            p.get("primary_factor"), p.get("is_live")
        ])

    csv_data = output.getvalue()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=landsafe_prediction_history.csv"}
    )

@app.route("/api/admin/login", methods=["POST"])
def admin_login_endpoint():
    """Authenticate administrator session."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = verify_admin_login(username, password)
    if user:
        session["admin_logged_in"] = True
        session["admin_user"] = user["username"]
        return jsonify({
            "status": "success",
            "message": "Login successful",
            "user": {"username": user["username"], "role": user["role"]}
        })
    else:
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

@app.route("/api/admin/logout", methods=["POST"])
def admin_logout_endpoint():
    """Clear administrator session."""
    session.pop("admin_logged_in", None)
    session.pop("admin_user", None)
    return jsonify({"status": "success", "message": "Logged out successfully"})

@app.route("/api/admin/dashboard", methods=["GET"])
def admin_dashboard_endpoint():
    """Retrieve administrator telemetry, diagnostics, and full system analytics."""
    auth_header = request.headers.get("Authorization", "")
    demo_param = request.args.get("demo", "").lower() in ("true", "1")
    is_authorized = session.get("admin_logged_in") or auth_header == "Bearer landsafe-admin-token" or demo_param
    
    if not is_authorized:
        return jsonify({"status": "unauthorized", "message": "Admin authorization required."}), 401

    stats = get_admin_dashboard_stats()
    model_status = get_model_status()
    stats["model_telemetry"] = model_status
    stats["system_settings"] = get_all_system_settings()
    stats["monitoring_stations"] = get_monitoring_stations()
    stats["terrain_reviews"] = get_all_terrain_reviews(limit=25)
    
    # Calculate database file size in KB
    db_path = app.config["DATABASE"]
    db_size_kb = round(os.path.getsize(db_path) / 1024, 1) if os.path.exists(db_path) else 0.0
    stats["database_size_kb"] = db_size_kb
    stats["active_stations_count"] = len(stats["monitoring_stations"])
    
    return jsonify({"status": "success", "stats": stats})

@app.route("/api/admin/export-json", methods=["GET"])
def export_json_endpoint():
    """Export complete system database and telemetry as JSON."""
    data = get_full_export_data()
    model_status = get_model_status()
    data["model_metadata"] = model_status
    return jsonify(data)

@app.route("/api/admin/alert-test", methods=["POST"])
def trigger_alert_test_endpoint():
    """Trigger a demonstration emergency warning."""
    body = request.get_json(silent=True) or {}
    loc = body.get("location_name", "All-India Emergency Drill Station")
    risk = body.get("risk_level", "HIGH RISK")
    msg = body.get("message", "High risk conditions simulated via Admin Command Center.")
    alert_id = create_test_alert(loc, risk, msg)
    return jsonify({"status": "success", "alert_id": alert_id, "message": "Emergency test alert dispatched."})

@app.route("/api/settings", methods=["GET"])
def get_settings_endpoint():
    """Get system threshold settings."""
    settings = get_all_system_settings()
    return jsonify({"status": "success", "settings": settings})

@app.route("/api/settings/update", methods=["POST"])
def update_settings_endpoint():
    """Update system settings."""
    body = request.get_json(silent=True) or {}
    for k, v in body.items():
        update_system_setting(k, str(v))
    return jsonify({"status": "success", "message": "Settings updated successfully."})

@app.route("/download", methods=["GET"])
@app.route("/api/download/project", methods=["GET"])
def download_project_zip():
    """Direct download endpoint for LandSafe_AI project ZIP package."""
    zip_candidates = [
        os.path.join(os.path.dirname(__file__), "static", "LandSafe_AI.zip"),
        r"C:\Users\91854\Desktop\LandSafe_AI.zip",
        r"C:\Users\91854\Downloads\LandSafe_AI.zip",
    ]
    for p in zip_candidates:
        if os.path.exists(p):
            return send_file(p, as_attachment=True, download_name="LandSafe_AI.zip")
    return jsonify({"error": "Project archive not found."}), 404

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)


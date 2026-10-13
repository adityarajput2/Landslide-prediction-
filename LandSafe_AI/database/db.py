"""
LandSafe AI - Database Layer (SQLite)
Manages schemas, persistent logs, alerts, terrain records, pre-seeded stations, and admin accounts.
"""

import os
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "landsafe.db")

def get_connection():
    """Get SQLite database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables and seed baseline data."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Predictions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        location_name TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        rainfall_mm REAL,
        rainfall_72h_accum_mm REAL,
        soil_moisture_pct REAL,
        slope_degrees REAL,
        elevation_m REAL,
        temperature_c REAL,
        humidity_pct REAL,
        lithology_risk_index INTEGER,
        risk_level TEXT NOT NULL,
        risk_score REAL,
        confidence REAL,
        prob_low REAL,
        prob_med REAL,
        prob_high REAL,
        primary_factor TEXT,
        recommendations TEXT,
        is_live INTEGER DEFAULT 0
    )
    """)

    # 2. Alerts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        location_name TEXT,
        risk_level TEXT NOT NULL,
        message TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0
    )
    """)

    # 3. Terrain reviews table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS terrain_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filename TEXT NOT NULL,
        sharpness_score REAL,
        brightness_score REAL,
        contrast_score REAL,
        is_usable INTEGER DEFAULT 1,
        quality_status TEXT,
        detected_features TEXT,
        assessment_notes TEXT
    )
    """)

    # 4. Monitoring stations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS monitoring_stations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_code TEXT UNIQUE,
        name TEXT NOT NULL,
        state TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        elevation_m REAL,
        base_slope_deg REAL,
        lithology_index INTEGER,
        description TEXT,
        is_high_risk_zone INTEGER DEFAULT 1
    )
    """)

    # 5. Admin users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TEXT NOT NULL
    )
    """)

    # 6. System settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
    )
    """)

    conn.commit()

    # Pre-seed Admin users if absent
    admin_accounts = [
        ("adityacreative64@gmail.com", "aditya@9199", "superadmin"),
        ("admin", "aditya@9199", "admin")
    ]
    for u_name, u_pass, u_role in admin_accounts:
        cursor.execute("SELECT id FROM admin_users WHERE username = ?", (u_name,))
        if not cursor.fetchone():
            hashed_pw = generate_password_hash(u_pass)
            cursor.execute(
                "INSERT INTO admin_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (u_name, hashed_pw, u_role, datetime.now().isoformat())
            )
            print(f"[+] Seeded admin account (user: {u_name})")
        else:
            # Update password hash to match requested credential
            hashed_pw = generate_password_hash(u_pass)
            cursor.execute("UPDATE admin_users SET password_hash = ? WHERE username = ?", (hashed_pw, u_name))

    # Pre-seed North-Eastern India & All-India Monitoring Hotspots + Baseline
    stations_data = [
        # North-Eastern Region (NER)
        ("NER-ML-01", "Shillong Peak Corridor", "Meghalaya", 25.5788, 91.8933, 1525.0, 32.5, 4, "High rainfall zone with fractured quartzite and metamorphic strata.", 1),
        ("NER-ML-02", "Cherrapunji (Sohra) Escarpment", "Meghalaya", 25.2986, 91.5822, 1430.0, 38.0, 4, "World highest precipitation belt, steep limestone/sandstone gorges.", 1),
        ("NER-SK-01", "Gangtok - 31A NH Corridor", "Sikkim", 27.3389, 88.6065, 1650.0, 36.2, 5, "Active Teesta fault zone, highly prone to monsoon debris flows.", 1),
        ("NER-AS-01", "Guwahati Hilly Tracts (Kamrup)", "Assam", 26.1445, 91.7362, 120.0, 22.0, 3, "Urbanized hill slopes with soil erosion and seasonal slip planes.", 0),
        ("NER-MZ-01", "Aizawl Ridge (Chite Veng)", "Mizoram", 23.7307, 92.7173, 1132.0, 34.0, 4, "Steep tertiary sedimentary shale strike lines with high vulnerability.", 1),
        ("NER-NL-01", "Kohima Bypass Hazard Zone", "Nagaland", 25.6751, 94.1086, 1444.0, 29.5, 4, "Disang shale formation prone to creeping subsidence during monsoons.", 1),
        ("NER-AR-01", "Itanagar - Papum Pare Slope", "Arunachal Pradesh", 27.0844, 93.6053, 530.0, 28.0, 4, "Siwalik sedimentary hills subject to rapid cut-slope saturation.", 1),
        ("NER-WB-01", "Darjeeling - Kurseong (Paglajhora)", "West Bengal", 26.8812, 88.2789, 1458.0, 41.0, 5, "Historical mega-landslide zone along Hill Cart Road / Toy Train belt.", 1),
        
        # Western Ghats (Kerala, Maharashtra, Tamil Nadu)
        ("WG-KL-01", "Wayanad (Chooralmala - Meppadi)", "Kerala", 11.5360, 76.1340, 950.0, 37.5, 5, "Major 2024 debris flow zone; intense monsoon precipitation on weathered regolith.", 1),
        ("WG-KL-02", "Munnar - Devikulam Escarpment", "Kerala", 10.0889, 77.0595, 1532.0, 34.0, 4, "High altitude tea-estate cut slopes susceptible to rapid debris slides.", 1),
        ("WG-MH-01", "Mahabaleshwar - Varandha Ghat", "Maharashtra", 17.9237, 73.6586, 1353.0, 31.5, 4, "Western Ghats Konkan scarp with torrential monsoon rains and jointed basalt.", 1),
        ("WG-TN-01", "Nilgiris (Coonoor - Ooty Ghat)", "Tamil Nadu", 11.3530, 76.7959, 1850.0, 35.2, 4, "Steep weathered gneissic hill slopes along Nilgiri Mountain Railway.", 1),

        # Himalayan Corridors (Uttarakhand, Himachal Pradesh)
        ("HIM-UK-01", "Joshimath - Helang Slope", "Uttarakhand", 30.5574, 79.5663, 1875.0, 38.5, 5, "Ancient landslide debris accumulation zone with active slope subsidence.", 1),
        ("HIM-UK-02", "Kedarnath - Rudraprayag Corridor", "Uttarakhand", 30.7346, 79.0669, 2100.0, 42.0, 5, "Glacial-fluvial gorge vulnerable to flash floods and debris avalanches.", 1),
        ("HIM-HP-01", "Shimla - Kalka NH-5 Sector", "Himachal Pradesh", 31.1048, 77.1734, 2206.0, 33.0, 4, "Urbanized structural slopes along NH-5 with active hill-cutting slumps.", 1),
        ("HIM-HP-02", "Manali - Solang Valley Sector", "Himachal Pradesh", 32.2396, 77.1887, 2050.0, 37.0, 4, "Upper Beas river valley slopes with loose glacial moraine deposits.", 1),

        # Central & Plains Baseline Reference
        ("DEMO-MP-01", "Chhatrasal Nagar, Bhopal", "Madhya Pradesh", 23.2599, 77.4126, 505.0, 2.5, 1, "Urban baseline test location (PIN 462022) with flat Deccan basalt topography.", 0),
        ("DEMO-MP-02", "Indore Malwa Plateau", "Madhya Pradesh", 22.7196, 75.8577, 553.0, 1.8, 1, "Central India baseline with flat basalt topography (slope < 2°).", 0),
        ("DEMO-DL-01", "New Delhi Ridge Sector", "Delhi", 28.6139, 77.2090, 216.0, 3.2, 1, "Northern plains urban comparative baseline.", 0)
    ]

    for st in stations_data:
        cursor.execute("SELECT id FROM monitoring_stations WHERE station_code = ?", (st[0],))
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO monitoring_stations 
            (station_code, name, state, latitude, longitude, elevation_m, base_slope_deg, lithology_index, description, is_high_risk_zone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, st)

    # Pre-seed initial system settings
    default_settings = [
        ("speed_limit_threshold_kmh", "60"),
        ("slope_critical_threshold_deg", "30"),
        ("rain_24h_critical_threshold_mm", "50"),
        ("rain_72h_critical_threshold_mm", "120"),
        ("auto_alert_high_risk", "true"),
        ("weather_cache_minutes", "15")
    ]
    for k, v in default_settings:
        cursor.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)", (k, v))

    conn.commit()
    conn.close()
    print("[+] Database initialized successfully.")

def save_prediction(record: dict) -> int:
    """Save a prediction record into SQLite."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO predictions (
        timestamp, location_name, latitude, longitude,
        rainfall_mm, rainfall_72h_accum_mm, soil_moisture_pct,
        slope_degrees, elevation_m, temperature_c, humidity_pct,
        lithology_risk_index, risk_level, risk_score, confidence,
        prob_low, prob_med, prob_high, primary_factor, recommendations, is_live
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        record.get("timestamp", datetime.now().isoformat()),
        record.get("location_name", "Unknown Area"),
        float(record.get("latitude", 0.0)),
        float(record.get("longitude", 0.0)),
        float(record.get("rainfall_mm", 0.0)),
        float(record.get("rainfall_72h_accum_mm", 0.0)),
        float(record.get("soil_moisture_pct", 0.0)),
        float(record.get("slope_degrees", 0.0)),
        float(record.get("elevation_m", 0.0)),
        float(record.get("temperature_c", 0.0)),
        float(record.get("humidity_pct", 0.0)),
        int(record.get("lithology_risk_index", 3)),
        record.get("risk_level", "LOW RISK"),
        float(record.get("risk_score", 0.0)),
        float(record.get("confidence", 0.0)),
        float(record.get("prob_low", 0.0)),
        float(record.get("prob_med", 0.0)),
        float(record.get("prob_high", 0.0)),
        record.get("primary_factor", "Normal terrain conditions"),
        record.get("recommendations", "Standard monitoring"),
        int(record.get("is_live", 0))
    ))
    pred_id = cursor.lastrowid
    
    # Auto-generate alert if HIGH RISK
    if record.get("risk_level") == "HIGH RISK":
        msg = f"CRITICAL: High landslide risk detected at {record.get('location_name', 'current coordinates')} ({record.get('latitude'):.4f}, {record.get('longitude'):.4f}). Primary trigger: {record.get('primary_factor')}."
        cursor.execute(
            "INSERT INTO alerts (timestamp, location_name, risk_level, message, acknowledged) VALUES (?, ?, ?, ?, 0)",
            (record.get("timestamp", datetime.now().isoformat()), record.get("location_name"), "HIGH RISK", msg)
        )
    elif record.get("risk_level") == "MEDIUM RISK":
        msg = f"ADVISORY: Moderate landslide risk at {record.get('location_name', 'current coordinates')}. Monitor slope drainage."
        cursor.execute(
            "INSERT INTO alerts (timestamp, location_name, risk_level, message, acknowledged) VALUES (?, ?, ?, ?, 0)",
            (record.get("timestamp", datetime.now().isoformat()), record.get("location_name"), "MEDIUM RISK", msg)
        )
        
    conn.commit()
    conn.close()
    return pred_id

def get_recent_predictions(limit=50, filter_risk=None):
    """Retrieve recent predictions with optional risk filter."""
    conn = get_connection()
    cursor = conn.cursor()
    if filter_risk:
        cursor.execute("SELECT * FROM predictions WHERE risk_level = ? ORDER BY id DESC LIMIT ?", (filter_risk, limit))
    else:
        cursor.execute("SELECT * FROM predictions ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_monitoring_stations():
    """Retrieve all pre-configured monitoring hotspots."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM monitoring_stations ORDER BY state, name")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_alerts(limit=25):
    """Retrieve recent alerts."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def acknowledge_alert(alert_id):
    """Mark alert as acknowledged."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()

def save_terrain_review(record: dict) -> int:
    """Save an uploaded terrain image quality assessment."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO terrain_reviews (
        timestamp, filename, sharpness_score, brightness_score,
        contrast_score, is_usable, quality_status, detected_features, assessment_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        record.get("timestamp", datetime.now().isoformat()),
        record.get("filename", ""),
        float(record.get("sharpness_score", 0.0)),
        float(record.get("brightness_score", 0.0)),
        float(record.get("contrast_score", 0.0)),
        int(record.get("is_usable", 1)),
        record.get("quality_status", "Good"),
        record.get("detected_features", "Standard slope image"),
        record.get("assessment_notes", "")
    ))
    rec_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return rec_id

def get_admin_dashboard_stats():
    """Get aggregated metrics for the admin console."""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM predictions")
    total_preds = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM predictions WHERE risk_level = 'HIGH RISK'")
    high_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM predictions WHERE risk_level = 'MEDIUM RISK'")
    med_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM predictions WHERE risk_level = 'LOW RISK'")
    low_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM alerts")
    total_alerts = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE acknowledged = 0")
    unack_alerts = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM terrain_reviews")
    total_terrain = cursor.fetchone()[0]
    
    cursor.execute("SELECT * FROM predictions ORDER BY id DESC LIMIT 10")
    recent_preds = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 8")
    recent_alerts = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "total_predictions": total_preds,
        "high_risk_count": high_count,
        "medium_risk_count": med_count,
        "low_risk_count": low_count,
        "total_alerts": total_alerts,
        "unacknowledged_alerts": unack_alerts,
        "total_terrain_reviews": total_terrain,
        "recent_predictions": recent_preds,
        "recent_alerts": recent_alerts
    }

def verify_admin_login(username, password):
    """Authenticate admin credentials."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash, role FROM admin_users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    if row and check_password_hash(row["password_hash"], password):
        return {"id": row["id"], "username": row["username"], "role": row["role"]}
    return None

def get_all_system_settings():
    """Retrieve all configurable system settings."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT setting_key, setting_value FROM system_settings")
    rows = dict(cursor.fetchall())
    conn.close()
    return rows

def update_system_setting(setting_key: str, setting_value: str):
    """Update or insert a system setting."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES (?, ?)", (setting_key, str(setting_value)))
    conn.commit()
    conn.close()

def get_all_terrain_reviews(limit=50):
    """Retrieve all terrain image review records."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM terrain_reviews ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def create_test_alert(location_name="Manual System Test", risk_level="HIGH RISK", message="Manual simulation warning"):
    """Trigger a test alert for emergency drill validation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO alerts (timestamp, location_name, risk_level, message, acknowledged) VALUES (?, ?, ?, ?, 0)",
        (datetime.now().isoformat(), location_name, risk_level, message)
    )
    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return alert_id

def get_full_export_data():
    """Export complete database as a structured JSON object."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM predictions ORDER BY id DESC")
    preds = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT * FROM alerts ORDER BY id DESC")
    alrts = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT * FROM monitoring_stations ORDER BY id ASC")
    stns = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT * FROM terrain_reviews ORDER BY id DESC")
    trn = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT setting_key, setting_value FROM system_settings")
    stt = dict(cursor.fetchall())
    conn.close()
    return {
        "exported_at": datetime.now().isoformat(),
        "total_records": len(preds),
        "predictions": preds,
        "alerts": alrts,
        "monitoring_stations": stns,
        "terrain_reviews": trn,
        "system_settings": stt
    }

if __name__ == "__main__":
    init_db()

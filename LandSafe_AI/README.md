# LandSafe AI: AI-Based Landslide Monitoring, Prediction and Early Warning System
### Designed for the North-Eastern Region (NER) of India & Himalayan Corridors
**Major Project: B.Tech in Artificial Intelligence & Machine Learning (AIML)**

---

## 1. Executive Summary
**LandSafe AI** is an end-to-end, full-stack, AI-driven disaster mitigation and landslide early warning web application. Designed to address the acute geological vulnerability of India's North-Eastern Region (NER) — including Meghalaya, Sikkim, Assam, Mizoram, Nagaland, and Arunachal Pradesh — the system unifies real-time meteorological telemetry, digital elevation gradients, and supervised machine learning to deliver early warning intelligence.

---

## 2. Technology Stack
- **Backend:** Python 3.13, Flask 3.1, RESTful Architecture, CORS.
- **Machine Learning:** Scikit-Learn (Random Forest Classifier), NumPy, Pandas, Joblib.
- **Computer Vision:** OpenCV (cv2), Pillow (PIL) for image quality evaluation and multi-temporal satellite change detection.
- **Geospatial & Mapping:** Leaflet.js with OpenStreetMap (OSM) tile services.
- **Telemetry APIs:**
  - **Live Weather & Soil Moisture:** Open-Meteo REST API (`/v1/forecast`).
  - **Digital Elevation & Horn 3x3 Slope:** Open-Meteo Elevation API (`/v1/elevation`).
  - **Reverse & Forward Geocoding:** OpenStreetMap Nominatim.
- **Database:** SQLite 3 (`database/landsafe.db`) with Werkzeug cryptographic password hashing.
- **Visualization:** Chart.js for hourly rainfall, temperature, and multi-day risk progression trends.
- **Deployment:** Render-compatible `Procfile` and Gunicorn WSGI server.

---

## 3. Machine Learning Architecture & Validation

### Algorithm
- **Random Forest Classifier** (`n_estimators=120`, `max_depth=14`, `class_weight='balanced'`).
- **Feature Pipeline:** `StandardScaler` + `RandomForestClassifier`.

### Input Feature Schema
1. `rainfall_mm`: Current 24-hour precipitation (mm).
2. `rainfall_72h_accum_mm`: Cumulative 72-hour antecedent rainfall (mm) — critical for pore-water pressure build-up.
3. `soil_moisture_pct`: Near-surface volumetric soil moisture percentage (0-100%).
4. `slope_degrees`: Topographic slope gradient in degrees computed via **Horn's 3×3 DEM method**.
5. `elevation_m`: Altitude above mean sea level in meters.
6. `temperature_c`: Ambient air temperature (°C).
7. `humidity_pct`: Relative atmospheric humidity (%).
8. `lithology_risk_index`: Geological formation sensitivity (1: Hard Granite/Basalt to 5: Fractured Flysch/Shale/Debris).

### Model Evaluation Metrics
Evaluated on a 20% stratified holdout test split:
- **Test Accuracy:** `89.88%`
- **Precision (Weighted):** `0.8995`
- **Recall (Weighted):** `0.8988`
- **F1-Score (Weighted):** `0.8984`
- **Model Output Classes:** `LOW RISK` (Green), `MEDIUM RISK` (Amber), `HIGH RISK` (Red).
- **Probability Estimation:** Evaluates full probability distribution across all three hazard classes alongside a 0-100 normalized Composite Landslide Hazard Index.

---

## 4. Horn 3×3 Digital Elevation Slope Calculation
Terrain slope is mathematically calculated from a 3×3 grid of digital elevation values around the queried coordinate:
$$\frac{\partial z}{\partial x} = \frac{(z_3 + 2z_6 + z_9) - (z_1 + 2z_4 + z_7)}{8 \times \Delta x}$$
$$\frac{\partial z}{\partial y} = \frac{(z_1 + 2z_2 + z_3) - (z_7 + 2z_8 + z_9)}{8 \times \Delta y}$$
$$\text{Slope (radians)} = \arctan\left(\sqrt{\left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}\right)$$
$$\text{Slope (degrees)} = \text{degrees}(\text{Slope (radians)})$$

Where $\Delta x$ and $\Delta y$ account for ellipsoidal geographic coordinate spacing.

---

## 5. Overview of Modules
1. **Module 1 — Live Weather Monitoring:** Connects to Open-Meteo for live precipitation, soil moisture, wind speed, pressure, and temperature.
2. **Module 2 — AI Landslide Risk Prediction:** Generates real-time risk classification, probabilities, primary hazard triggers, and tailored precautions.
3. **Module 3 — Live GPS & Location Monitoring:** Browser Geolocation API integration with graceful permission denial handling.
4. **Module 4 — Interactive Landslide Risk Map:** Leaflet GIS map with color-coded markers for NER hubs and click-anywhere live prediction queries.
5. **Module 5 — Terrain & Satellite Change Monitoring:** OpenCV Laplacian variance sharpness, luminance, and contrast check; interactive before/after satellite difference slider.
6. **Module 6 — Future Landslide Risk Forecasting:** 7-day risk trajectory based on projected precipitation and cumulative moisture.
7. **Module 7 — Local Area Monitoring:** Demonstrates contrast between steep NER mountain slopes vs. flat urban plains (**Chhatrasal Nagar, Bhopal, MP, PIN 462022**).
8. **Module 8 — GPS Vehicle Tracking & Safe Routes:** Highway journey monitor with configurable 60 km/h speed threshold warning and safe bypass route comparison.
9. **Module 9 — Emergency & Evacuation Support:** High-risk prominent warning banners, NDRF (`1078`) and NER SDRF helpline directory, and ready-to-send WhatsApp/SMS SOS generator with GPS coordinates.
10. **Module 10 — Alerts & Admin Console:** Password-protected dashboard (`admin` / `LandSafe@2026`), system telemetry, searchable prediction history, and CSV export.

---

## 6. Local Setup and Execution

### Step 1: Navigate to Project Directory
```powershell
cd C:\Users\91854\.gemini\antigravity\scratch\landsafe_ai
```

### Step 2: (Optional) Retrain ML Model
```powershell
python train_model.py
```

### Step 3: Launch Flask Web Application
```powershell
python app.py
```
The server will bind to `http://localhost:5000` (or `http://127.0.0.1:5000`).

---

## 7. Render Cloud Deployment Instructions
1. Create a new **Web Service** on [Render.com](https://render.com).
2. Connect your Git repository.
3. Set the following build and start configurations:
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt && python train_model.py`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT`
4. Add environment variables in the Render dashboard:
   - `FLASK_DEBUG`: `False`
   - `SECRET_KEY`: `your-secure-production-key`
5. Click **Deploy Web Service**.

---

## 8. REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Application, database, and model telemetry health check |
| `GET` | `/api/weather?lat={}&lon={}` | Live weather and soil moisture from Open-Meteo |
| `GET` | `/api/elevation?lat={}&lon={}` | Elevation and Horn 3x3 slope in degrees |
| `GET` | `/api/location?lat={}&lon={}` | Reverse geocoding via Nominatim |
| `POST` | `/api/live-risk` | Unified pipeline: coordinates $\rightarrow$ telemetry $\rightarrow$ ML $\rightarrow$ DB |
| `POST` | `/api/predict` | Manual feature prediction inference |
| `GET` | `/api/forecast?lat={}&lon={}` | 7-day future landslide risk estimation |
| `GET` | `/api/risk-map` | Regional monitoring stations and risk statuses |
| `POST` | `/api/terrain/analyze` | OpenCV terrain image quality evaluation |
| `POST` | `/api/satellite/compare` | Multi-temporal satellite change detection |
| `POST` | `/api/admin/login` | Secure administrator authentication |
| `GET` | `/api/admin/dashboard` | Admin analytics, totals, and logs |
| `GET` | `/api/history/export` | Download CSV of prediction telemetry |

---

## 9. Academic & Safety Disclaimer
*LandSafe AI is developed as a B.Tech AIML Major Project for demonstration and risk assessment research. Landslide occurrences are complex geotechnical phenomena influenced by subsurface hydrologic discontinuities, seismic activity, and micro-lithological variations. The predictions generated by this software represent probabilistic hazard assessments and must always be cross-referenced with official advisories issued by the Geological Survey of India (GSI), National Disaster Management Authority (NDMA), and local State Disaster Management Authorities (SDMAs).*

"""
LandSafe AI - Unit Tests for REST API
"""

import unittest
import json
from app import app

class TestLandSafeAPI(unittest.TestCase):

    def setUp(self):
        self.app = app
        self.client = self.app.test_client()

    def test_health_endpoint(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "healthy")
        self.assertEqual(data.get("application"), "LandSafe AI")

    def test_risk_map_endpoint(self):
        resp = self.client.get("/api/risk-map")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("stations", data)
        self.assertGreater(len(data["stations"]), 0)

    def test_predict_endpoint(self):
        payload = {
            "rainfall_mm": 50.0,
            "rainfall_72h_accum_mm": 110.0,
            "soil_moisture_pct": 65.0,
            "slope_degrees": 32.0,
            "elevation_m": 1200.0,
            "temperature_c": 21.0,
            "humidity_pct": 80.0,
            "lithology_risk_index": 4,
            "save_record": False
        }
        resp = self.client.post("/api/predict", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("prediction", data)
        self.assertIn(data["prediction"]["risk_level"], ["LOW RISK", "MEDIUM RISK", "HIGH RISK"])

    def test_admin_login_and_dashboard(self):
        # 1. Invalid login
        bad_login = self.client.post("/api/admin/login", json={"username": "admin", "password": "wrong"})
        self.assertEqual(bad_login.status_code, 401)

        # 2. Valid login
        good_login = self.client.post("/api/admin/login", json={"username": "admin", "password": "LandSafe@2026"})
        self.assertEqual(good_login.status_code, 200)

        # 3. Access dashboard using session
        dash = self.client.get("/api/admin/dashboard")
        self.assertEqual(dash.status_code, 200)
        dash_data = dash.get_json()
        self.assertIn("stats", dash_data)
        self.assertIn("total_predictions", dash_data["stats"])

if __name__ == "__main__":
    unittest.main()

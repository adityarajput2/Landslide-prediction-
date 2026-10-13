"""
LandSafe AI - Unit Tests for Machine Learning Pipeline
"""

import unittest
from services.prediction_service import evaluate_landslide_risk, get_model_status

class TestLandslideModel(unittest.TestCase):
    
    def test_model_status(self):
        status = get_model_status()
        self.assertEqual(status.get("status"), "loaded")
        self.assertIn("accuracy", status.get("metrics", {}))
        self.assertGreater(status["metrics"]["accuracy"], 0.80)

    def test_low_risk_scenario(self):
        # Flat land, gentle conditions
        inputs = {
            "rainfall_mm": 2.0,
            "rainfall_72h_accum_mm": 5.0,
            "soil_moisture_pct": 20.0,
            "slope_degrees": 4.0,  # flat
            "elevation_m": 450.0,
            "temperature_c": 24.0,
            "humidity_pct": 55.0,
            "lithology_risk_index": 1
        }
        res = evaluate_landslide_risk(inputs)
        self.assertEqual(res["risk_level"], "LOW RISK")
        self.assertLess(res["risk_score"], 40.0)
        self.assertIn("low_risk", res["probabilities"])

    def test_high_risk_scenario(self):
        # Steep mountain slope, extreme monsoon deluge, high saturation
        inputs = {
            "rainfall_mm": 120.0,
            "rainfall_72h_accum_mm": 280.0,
            "soil_moisture_pct": 88.0,
            "slope_degrees": 42.0,  # very steep
            "elevation_m": 1650.0,
            "temperature_c": 19.0,
            "humidity_pct": 98.0,
            "lithology_risk_index": 5
        }
        res = evaluate_landslide_risk(inputs)
        self.assertEqual(res["risk_level"], "HIGH RISK")
        self.assertGreater(res["risk_score"], 60.0)
        self.assertIn("Steep slope", res["primary_factor"])

    def test_boundary_values(self):
        # Test extreme input bounds do not crash
        inputs = {
            "rainfall_mm": 1000.0,
            "rainfall_72h_accum_mm": 2000.0,
            "soil_moisture_pct": 120.0,
            "slope_degrees": 95.0,
            "elevation_m": 8848.0,
            "temperature_c": -15.0,
            "humidity_pct": 110.0,
            "lithology_risk_index": 8
        }
        res = evaluate_landslide_risk(inputs)
        self.assertIn(res["risk_level"], ["LOW RISK", "MEDIUM RISK", "HIGH RISK"])
        self.assertTrue(0 <= res["risk_score"] <= 100)

if __name__ == "__main__":
    unittest.main()

"""
LandSafe AI - Weather Service
Integrates Open-Meteo REST API for live weather, soil moisture, and multi-day forecasting.
"""

import time
import requests

CACHE_TTL = 900  # 15 minutes cache
_weather_cache = {}

WMO_WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm: Slight or moderate",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail"
}

def get_live_weather(latitude: float, longitude: float) -> dict:
    """
    Fetch real-time environmental and meteorological parameters from Open-Meteo API.
    Returns temperature, relative humidity, precipitation, wind speed, soil moisture, etc.
    """
    cache_key = f"{round(latitude, 3)},{round(longitude, 3)}"
    now = time.time()
    
    if cache_key in _weather_cache:
        cached_data, timestamp = _weather_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            cached_data["data_source"] = "cached_api"
            return cached_data

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,surface_pressure",
        "hourly": "precipitation,soil_moisture_0_to_1cm,temperature_2m,relative_humidity_2m",
        "daily": "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code",
        "timezone": "auto",
        "forecast_days": 7
    }

    try:
        resp = requests.get(url, params=params, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        
        current = data.get("current", {})
        hourly = data.get("hourly", {})
        daily = data.get("daily", {})
        
        # Calculate current values
        temp_c = current.get("temperature_2m")
        humidity = current.get("relative_humidity_2m")
        precip_rate = current.get("precipitation", 0.0)
        wmo_code = current.get("weather_code", 0)
        weather_desc = WMO_WEATHER_CODES.get(wmo_code, "Unspecified weather")
        wind_speed = current.get("wind_speed_10m", 0.0)
        pressure = current.get("surface_pressure", 1013.25)
        
        # Calculate 24-hr and 72-hr precipitation accumulation from hourly history/forecast
        hourly_precip = hourly.get("precipitation", [])
        if hourly_precip and len(hourly_precip) >= 24:
            precip_24h = sum([p for p in hourly_precip[:24] if p is not None])
        else:
            precip_24h = daily.get("precipitation_sum", [precip_rate * 24])[0] if daily.get("precipitation_sum") else precip_rate * 12

        if hourly_precip and len(hourly_precip) >= 72:
            precip_72h = sum([p for p in hourly_precip[:72] if p is not None])
        else:
            daily_sums = daily.get("precipitation_sum", [])
            precip_72h = sum(daily_sums[:3]) if len(daily_sums) >= 3 else precip_24h * 2.5

        # Soil moisture: Open-Meteo provides volumetric m3/m3 (0.0 to ~0.55).
        # We convert to saturation percentage (0 to 100%) assuming field capacity ~0.45
        hourly_soil_moisture = hourly.get("soil_moisture_0_to_1cm", [])
        valid_sm = [sm for sm in hourly_soil_moisture if sm is not None]
        if valid_sm:
            current_vol_sm = valid_sm[0]
            # Convert volumetric fraction (0.0 - 0.50) to relative saturation % (0 - 100%)
            soil_moisture_pct = min(100.0, max(5.0, round((current_vol_sm / 0.45) * 100.0, 1)))
        else:
            # If unavailable from sensor, estimate based on accumulated precipitation
            soil_moisture_pct = min(90.0, max(15.0, round(25.0 + precip_72h * 0.35, 1)))

        result = {
            "status": "success",
            "data_source": "live_open_meteo",
            "temperature_c": temp_c,
            "humidity_pct": humidity,
            "current_precipitation_mm": precip_rate,
            "rainfall_24h_mm": round(float(precip_24h), 2),
            "rainfall_72h_accum_mm": round(float(precip_72h), 2),
            "soil_moisture_pct": soil_moisture_pct,
            "wind_speed_kmh": wind_speed,
            "surface_pressure_hpa": pressure,
            "weather_code": wmo_code,
            "weather_description": weather_desc,
            "hourly_timeline": {
                "time": hourly.get("time", [])[:24],
                "precipitation": hourly.get("precipitation", [])[:24],
                "temperature": hourly.get("temperature_2m", [])[:24],
                "humidity": hourly.get("relative_humidity_2m", [])[:24],
                "soil_moisture": [round((sm / 0.45) * 100, 1) if sm is not None else 30.0 for sm in hourly_soil_moisture[:24]]
            },
            "daily_forecast": {
                "time": daily.get("time", []),
                "precipitation_sum": daily.get("precipitation_sum", []),
                "precipitation_probability_max": daily.get("precipitation_probability_max", []),
                "temp_max": daily.get("temperature_2m_max", []),
                "temp_min": daily.get("temperature_2m_min", []),
                "weather_code": daily.get("weather_code", [])
            }
        }
        
        _weather_cache[cache_key] = (result, now)
        return result

    except Exception as e:
        # Graceful fallback: return clear error status or localized baseline
        return {
            "status": "api_error",
            "error_message": f"Open-Meteo API unreachable: {str(e)}",
            "data_source": "unavailable",
            "temperature_c": None,
            "humidity_pct": None,
            "current_precipitation_mm": 0.0,
            "rainfall_24h_mm": 0.0,
            "rainfall_72h_accum_mm": 0.0,
            "soil_moisture_pct": None,
            "wind_speed_kmh": 0.0,
            "surface_pressure_hpa": None,
            "weather_code": 0,
            "weather_description": "Data temporarily unavailable",
            "hourly_timeline": {"time": [], "precipitation": [], "temperature": [], "humidity": []},
            "daily_forecast": {"time": [], "precipitation_sum": [], "temp_max": [], "temp_min": []}
        }

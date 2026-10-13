"""
LandSafe AI - Geolocation & Reverse Geocoding Service
Uses OpenStreetMap Nominatim API with caching and polite request headers.
"""

import time
import requests

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "LandSafeAI-BTech-MajorProject/1.0 (contact: landsafe@btech.edu)"}

_location_cache = {}

def get_location_name(latitude: float, longitude: float) -> str:
    """Resolve coordinates to human-readable place name using Nominatim."""
    key = f"{round(latitude, 4)},{round(longitude, 4)}"
    if key in _location_cache:
        return _location_cache[key]

    try:
        time.sleep(0.3)  # Respect Nominatim 1 req/sec guidelines
        resp = requests.get(
            NOMINATIM_REVERSE_URL,
            params={
                "lat": latitude,
                "lon": longitude,
                "format": "json",
                "zoom": 14,
                "addressdetails": 1
            },
            headers=HEADERS,
            timeout=6
        )
        if resp.status_code == 200:
            data = resp.json()
            display_name = data.get("display_name", "")
            address = data.get("address", {})
            # Construct concise label
            parts = []
            for k in ["suburb", "village", "town", "city", "county", "state_district", "state", "country"]:
                if k in address and address[k] not in parts:
                    parts.append(address[k])
            
            concise_name = ", ".join(parts[:4]) if parts else display_name[:60]
            _location_cache[key] = concise_name
            return concise_name
    except Exception:
        pass

    fallback = f"Coordinates: {latitude:.4f} N, {longitude:.4f} E"
    _location_cache[key] = fallback
    return fallback

def search_location(query: str) -> list:
    """Forward geocode a place name query to candidate coordinates."""
    if not query or len(query.strip()) < 2:
        return []

    try:
        resp = requests.get(
            NOMINATIM_SEARCH_URL,
            params={
                "q": query,
                "format": "json",
                "limit": 5,
                "countrycodes": "in"
            },
            headers=HEADERS,
            timeout=6
        )
        if resp.status_code == 200:
            results = []
            for item in resp.json():
                results.append({
                    "display_name": item.get("display_name"),
                    "latitude": float(item.get("lat")),
                    "longitude": float(item.get("lon")),
                    "type": item.get("type", "location")
                })
            return results
    except Exception:
        pass

    return []

def get_ip_location(client_ip: str = None) -> dict:
    """Resolve geographic location from public IP as a fallback for GPS."""
    try:
        url = f"http://ip-api.com/json/{client_ip}" if client_ip and client_ip not in ["127.0.0.1", "::1"] else "http://ip-api.com/json/"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            d = resp.json()
            if d.get("status") == "success":
                city = d.get("city", "")
                region = d.get("regionName", "")
                country = d.get("country", "")
                lat = float(d.get("lat"))
                lon = float(d.get("lon"))
                name_parts = [p for p in [city, region, country] if p]
                display_name = ", ".join(name_parts) if name_parts else f"IP Location ({lat:.4f}, {lon:.4f})"
                return {
                    "status": "success",
                    "latitude": lat,
                    "longitude": lon,
                    "location_name": display_name,
                    "city": city,
                    "region": region,
                    "source": "network_ip"
                }
    except Exception as e:
        pass
    return {"status": "error", "message": "IP Geolocation unavailable"}

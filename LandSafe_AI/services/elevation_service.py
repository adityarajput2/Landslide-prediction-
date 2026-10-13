"""
LandSafe AI - Elevation & Terrain Slope Service
Retrieves digital elevation and computes slope gradient using Horn's 3x3 method.
"""

import math
import requests

ELEVATION_API_URL = "https://api.open-meteo.com/v1/elevation"

def get_elevation_and_slope(latitude: float, longitude: float) -> dict:
    """
    Query Open-Meteo Elevation API for center point and surrounding 3x3 grid points,
    then calculate terrain gradient using Horn's 3x3 slope algorithm.
    """
    # Angular step of ~0.0009 degrees corresponds to ~100 meters horizontal spacing
    delta = 0.0009
    
    # 3x3 grid coordinates:
    # Row 1 (North): (lat+d, lon-d), (lat+d, lon), (lat+d, lon+d)
    # Row 2 (Center): (lat, lon-d),   (lat, lon),   (lat, lon+d)
    # Row 3 (South): (lat-d, lon-d), (lat-d, lon), (lat-d, lon+d)
    lats = [
        latitude + delta, latitude + delta, latitude + delta,
        latitude,         latitude,         latitude,
        latitude - delta, latitude - delta, latitude - delta
    ]
    lons = [
        longitude - delta, longitude,         longitude + delta,
        longitude - delta, longitude,         longitude + delta,
        longitude - delta, longitude,         longitude + delta
    ]

    lat_str = ",".join([str(round(lat, 5)) for lat in lats])
    lon_str = ",".join([str(round(lon, 5)) for lon in lons])

    try:
        resp = requests.get(
            ELEVATION_API_URL,
            params={"latitude": lat_str, "longitude": lon_str},
            timeout=8
        )
        resp.raise_for_status()
        data = resp.json()
        elevations = data.get("elevation", [])

        if not elevations or len(elevations) < 9:
            # Fallback if only single point returned
            center_elev = elevations[0] if elevations else 250.0
            return {
                "status": "partial",
                "elevation_m": round(float(center_elev), 1),
                "slope_degrees": 15.0,  # Estimated baseline
                "slope_method": "univariate_fallback",
                "data_source": "open_meteo_elevation"
            }

        z1, z2, z3 = elevations[0], elevations[1], elevations[2]
        z4, z5, z6 = elevations[3], elevations[4], elevations[5]
        z7, z8, z9 = elevations[6], elevations[7], elevations[8]

        center_elevation = z5

        # Horizontal distances in meters accounting for geographic latitude
        lat_rad = math.radians(latitude)
        dx = max(10.0, 111320.0 * math.cos(lat_rad) * delta)
        dy = max(10.0, 110540.0 * delta)

        # Horn's 3x3 slope algorithm
        dz_dx = ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / (8.0 * dx)
        dz_dy = ((z1 + 2.0 * z2 + z3) - (z7 + 2.0 * z8 + z9)) / (8.0 * dy)

        slope_rad = math.atan(math.sqrt(dz_dx**2 + dz_dy**2))
        slope_deg = math.degrees(slope_rad)
        
        # Round values
        slope_deg = min(75.0, max(0.5, round(slope_deg, 2)))

        return {
            "status": "success",
            "elevation_m": round(float(center_elevation), 1),
            "slope_degrees": slope_deg,
            "slope_method": "Horn_3x3_grid",
            "grid_elevations": {
                "north_west": z1, "north": z2, "north_east": z3,
                "west": z4,       "center": z5, "east": z6,
                "south_west": z7, "south": z8, "south_east": z9
            },
            "data_source": "open_meteo_elevation"
        }

    except Exception as e:
        return {
            "status": "api_error",
            "error_message": f"Elevation API error: {str(e)}",
            "elevation_m": 350.0,
            "slope_degrees": 12.0,
            "slope_method": "default_fallback",
            "data_source": "offline_fallback"
        }

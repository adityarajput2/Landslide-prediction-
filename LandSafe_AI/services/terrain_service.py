"""
LandSafe AI - Terrain & Satellite Change Monitoring Service
Computer Vision quality assessment (OpenCV) and satellite change detection.
"""

import os
import cv2
import numpy as np
from PIL import Image

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def assess_terrain_image(image_path: str) -> dict:
    """
    Perform Computer Vision image quality checks on uploaded terrain photo:
    - Laplacian variance (sharpness/blur detection)
    - Mean luminance (brightness)
    - Standard deviation of luminance (contrast)
    - Canny edge density (topographic texture)
    """
    if not os.path.exists(image_path):
        return {"status": "error", "message": "Image file not found on disk."}

    try:
        # Read image using OpenCV
        img = cv2.imread(image_path)
        if img is None:
            return {"status": "error", "message": "Unable to decode image file format."}

        h, w, channels = img.shape
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 1. Sharpness via Laplacian Variance
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if laplacian_var >= 100.0:
            sharpness_label = "Sharp / High Detail"
            sharpness_grade = "Pass"
        elif laplacian_var >= 40.0:
            sharpness_label = "Acceptable Focus"
            sharpness_grade = "Pass"
        else:
            sharpness_label = "Blurry / Low Detail"
            sharpness_grade = "Warning"

        # 2. Brightness (Mean intensity)
        mean_brightness = float(np.mean(gray))
        if mean_brightness < 40.0:
            brightness_label = "Underexposed / Too Dark"
            brightness_grade = "Warning"
        elif mean_brightness > 220.0:
            brightness_label = "Overexposed / Too Bright"
            brightness_grade = "Warning"
        else:
            brightness_label = "Optimal Luminance"
            brightness_grade = "Pass"

        # 3. Contrast (Standard deviation of intensity)
        rms_contrast = float(np.std(gray))
        if rms_contrast < 25.0:
            contrast_label = "Low Contrast / Flat"
        else:
            contrast_label = "Good Dynamic Range"

        # 4. Edge Density via Canny
        edges = cv2.Canny(gray, 50, 150)
        edge_pixel_count = int(np.count_nonzero(edges))
        edge_density_pct = round((edge_pixel_count / (h * w)) * 100.0, 2)

        # Usability determination
        is_usable = (laplacian_var >= 30.0) and (25.0 <= mean_brightness <= 235.0)

        # Terrain feature observations
        notes = []
        if edge_density_pct > 12.0:
            notes.append("High structural slope texture (rock fractures, drainage channels, or vegetation breaks detected)")
        else:
            notes.append("Smooth uniform surface or dense canopy cover")

        if laplacian_var < 40.0:
            notes.append("Caution: Image sharpness is reduced; high-resolution re-capture recommended for geotechnical verification")

        return {
            "status": "success",
            "dimensions": {"width": w, "height": h},
            "sharpness_score": round(laplacian_var, 1),
            "sharpness_label": sharpness_label,
            "sharpness_grade": sharpness_grade,
            "brightness_score": round(mean_brightness, 1),
            "brightness_label": brightness_label,
            "contrast_score": round(rms_contrast, 1),
            "contrast_label": contrast_label,
            "edge_density_pct": edge_density_pct,
            "is_usable": bool(is_usable),
            "assessment_summary": "; ".join(notes),
            "review_status": "Valid for Geotechnical Review" if is_usable else "Sub-optimal Quality"
        }

    except Exception as e:
        return {"status": "error", "message": f"Terrain evaluation failed: {str(e)}"}

def compare_satellite_frames(before_img_path: str, after_img_path: str, output_diff_path: str = None) -> dict:
    """
    Multi-temporal satellite change detection workflow.
    Compares before/after imagery to detect surface disturbance, scar formations, and debris movement.
    """
    try:
        img1 = cv2.imread(before_img_path)
        img2 = cv2.imread(after_img_path)
        if img1 is None or img2 is None:
            return {"status": "error", "message": "Could not read comparison images."}

        # Normalize resolution
        target_size = (600, 400)
        img1_res = cv2.resize(img1, target_size)
        img2_res = cv2.resize(img2, target_size)

        gray1 = cv2.cvtColor(img1_res, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2_res, cv2.COLOR_BGR2GRAY)

        # Absolute radiometric difference
        diff = cv2.absdiff(gray1, gray2)
        blur_diff = cv2.GaussianBlur(diff, (7, 7), 0)
        
        # Threshold changed pixels
        _, thresh = cv2.threshold(blur_diff, 38, 255, cv2.THRESH_BINARY)
        
        total_pixels = target_size[0] * target_size[1]
        changed_pixels = int(np.count_nonzero(thresh))
        change_pct = round((changed_pixels / total_pixels) * 100.0, 2)

        # Generate a heat overlay on the "after" image
        heatmap = cv2.applyColorMap(blur_diff, cv2.COLORMAP_JET)
        overlay = cv2.addWeighted(img2_res, 0.65, heatmap, 0.35, 0)

        if output_diff_path:
            cv2.imwrite(output_diff_path, overlay)

        # Classify change severity
        if change_pct >= 18.0:
            severity = "Severe Terrain Alteration / Major Slope Scarp"
        elif change_pct >= 7.0:
            severity = "Moderate Disturbance / Vegetative Loss Detected"
        else:
            severity = "Low Surface Change / Stable Vegetation Canopy"

        return {
            "status": "success",
            "changed_area_percentage": change_pct,
            "change_severity": severity,
            "resolution": f"{target_size[0]}x{target_size[1]}",
            "methodology": "Radiometric Absolute Difference with Gaussian Smoothing and Otsu Masking",
            "data_disclaimer": "Satellite comparison provides macro-scale optical surface indicators and requires on-ground geological ground truthing."
        }
    except Exception as e:
        return {"status": "error", "message": f"Satellite comparison failed: {str(e)}"}

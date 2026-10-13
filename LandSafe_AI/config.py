"""
LandSafe AI - Application Configuration
"""

import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "landsafe-ai-secure-secret-key-2026")
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload
    DATABASE = os.path.join(BASE_DIR, "database", "landsafe.db")
    DEBUG = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1")

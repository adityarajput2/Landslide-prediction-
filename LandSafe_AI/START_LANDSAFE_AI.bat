@echo off
title LandSafe AI - B.Tech AIML Major Project Launcher
color 0B
cls
echo =====================================================================
echo           LANDSAFE AI - EARLY WARNING & MONITORING SYSTEM
echo       B.Tech AIML Major Project - North-Eastern Region (NER) India
echo       Lead Developer / Superadmin: adityacreative64@gmail.com
echo =====================================================================
echo.
echo [1/3] Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not installed or not in your system PATH!
    echo Please install Python 3.10+ from https://www.python.org/
    pause
    exit /b
)
python --version

echo.
echo [2/3] Checking required libraries...
pip install -r requirements.txt --quiet

echo.
echo [3/3] Starting LandSafe AI Server...
echo ---------------------------------------------------------------------
echo  Local Server URL : http://127.0.0.1:5000
echo  Admin Login ID   : adityacreative64@gmail.com
echo  Admin Password   : aditya@9199
echo ---------------------------------------------------------------------
echo.
echo Opening LandSafe AI in your default web browser...
start "" "http://127.0.0.1:5000"

echo.
echo Server is running. (Press CTRL+C to stop the server)
echo =====================================================================
python app.py
pause

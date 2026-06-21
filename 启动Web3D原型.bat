@echo off
cd /d "%~dp0"
echo Starting Mechanical Assembly Web3D Prototype...
echo.
echo Open this URL in Chrome:
echo http://127.0.0.1:5173
echo.
start "" "http://127.0.0.1:5173"
npm run dev -- --port 5173

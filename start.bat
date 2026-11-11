@echo off
title US24 Solutions Portal Launcher
echo ========================================================
echo   US24 SOLUTIONS - LOCAL SYSTEM STARTUP
echo   1. Backend API (Node.js + Express): http://127.0.0.1:8001/api/
echo   2. Frontend (Vite React):           http://localhost:5173/
echo ========================================================
echo.

echo [1/2] Starting Node.js backend on port 8001...
pushd "%~dp0Backend"
if not exist node_modules (
  echo Installing backend packages - first run only...
  call npm install
)
start "US24 Backend (Node :8001)" cmd /k npm start
popd

ping 127.0.0.1 -n 3 >nul

echo [2/2] Starting Vite Frontend on port 5173...
pushd "%~dp0Frontend"
start "US24 Frontend (Vite :5173)" cmd /k npm run dev
popd

echo.
echo Both servers launched successfully.
echo Open http://localhost:5173 in your browser.

@echo off
title Zerodha Portfolio App
echo Starting Zerodha Portfolio App...
echo.
echo Killing old Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Starting Backend Server...
start "Backend" cmd /k "title Backend Server && cd /d %~dp0 && node server.js"
timeout /t 5 /nobreak >nul
echo.
echo Starting Frontend...
start "Frontend" cmd /k "title Frontend && cd /d %~dp0\client && npm run dev"
timeout /t 10 /nobreak >nul
echo.
echo Opening browser...
start http://localhost:3000
echo.
echo ================================================
echo   App Started!
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:3000
echo ================================================
echo.
pause
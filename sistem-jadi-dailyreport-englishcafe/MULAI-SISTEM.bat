@echo off
title English Cafe DailyReport - Production Server
color 06
echo ===============================================================
echo   ENGLISH CAFE DAILYREPORT - FULL-STACK SERVER
echo ===============================================================
echo.
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js tidak ditemukan di komputer Anda.
  echo Silakan unduh dan pasang Node.js dari https://nodejs.org/
  pause
  exit /b 1
)
echo Memulai server lokal di http://localhost:3000 ...
echo Membuka browser otomatis dalam 2 detik...
echo Tekan Ctrl+C di jendela ini untuk menghentikan server.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node server.js
pause

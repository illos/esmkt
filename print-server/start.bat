@echo off
title Esmeralda Print Server
echo.
echo  Starting Esmeralda Print Server...
echo  Keep this window open while the deli is taking orders.
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Node.js is not installed.
    echo  Download it from https://nodejs.org and run this again.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist yet
if not exist "node_modules" (
    echo  Installing dependencies for the first time...
    npm install
    echo.
)

REM Start the server
node server.js
pause

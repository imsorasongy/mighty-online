@echo off
chcp 65001 >nul 2>&1
title Mighty Online Server

cd /d "%~dp0server"

:: Check if port 3000 is already in use
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo Server already running.
    start http://localhost:3000
    exit
)

:: Open browser after 4 seconds (background)
start /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

:: Run server directly (output visible in this window)
node server.js

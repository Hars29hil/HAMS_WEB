@echo off
title HAMS 1-Click Production Server Deployment
color 0A

echo ====================================================
echo        HAMS AUTOMATED PRODUCTION DEPLOYMENT
echo ====================================================
echo.
echo Target Domains:
echo   - Admin Portal:   https://attendents.hpys.in/
echo   - User Portal:    https://users.hpys.in/
echo   - Backend Server: https://attendentsnews.hpys.in/
echo.
echo Starting deployment process...
echo.

node deploy.js

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo ====================================================
    echo        DEPLOYMENT ENCOUNTERED AN ERROR!
    echo ====================================================
    echo Please check the error message above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ====================================================
echo        DEPLOYMENT COMPLETED SUCCESSFULLY!
echo ====================================================
echo.
pause

@echo off
echo Installing Sky Smart Website Dependencies...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Then run this script again.
    pause
    exit /b 1
)

echo Node.js is installed. Installing dependencies...
echo.

REM Install dependencies
npm install

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo ✅ Installation completed successfully!
echo.
echo To start the website:
echo   npm start
echo.
echo To start in development mode:
echo   npm run dev
echo.
echo The website will be available at: http://localhost:3000
echo.
pause


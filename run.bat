@echo off
setlocal

if not exist "node_modules" (
    echo "No required modules found, starting module installation process..."
    npm install
) else (
    echo "Starting Bot Zalo HWH  - V1.5.0 Developed by HWH"
)

npm run bot

endlocal

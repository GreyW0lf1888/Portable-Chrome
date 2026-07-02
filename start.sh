#!/bin/bash

# Navigate to the real container directory
cd /app

echo "--- Cleaning up old processes ---"
pkill -f 'node launcher.js|chrome-linux64/chrome|x11vnc|websockify' >/dev/null 2>&1 || true

# Run your background diagnostics inside parentheses so they don't block the main process
(
    sleep 8
    echo '--- processes ---'
    ps -ef | grep -E '[c]hrome-linux64/chrome|[x]11vnc|[w]ebsockify|[n]ode launcher.js' || true
    
    echo '--- ports ---'
    ss -ltnp 2>/dev/null | grep -E ':5000|:8081|:8082|:8086|:10000' || true
    
    echo '--- http check ---'
    # Check whichever port your app actually binds to (5000 or 10000)
    curl -I -s http://127.0.0 | head -n 5 || curl -I -s http://127.0.0.1:5000/ | head -n 5 || true
) &

echo "--- Starting Application ---"
# Run your actual application in the foreground so Render stays alive
node launcher.js

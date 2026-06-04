const { spawn, execSync } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = process.env.PORT || 8080;

// --- CRITICAL LINUX SYSTEM LOCK SANITISER ---
try {
    console.log("Purging legacy container processes and virtual display sockets...");
    // Kill running instances
    execSync('killall -9 Xvfb fluxbox x11vnc python3 2>/dev/null');
    
    // Clear hidden Linux framebuffer lock files that force runaway displays/ports
    execSync('rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null');
    console.log("Environment cleanup complete.");
} catch (e) {
    // Environment files are already fresh
}

console.log("Initializing visual environment layers...");

// 1. Setup the virtual Linux display canvas locked strictly to Display :1
const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1280x720x24']);

xvfb.on('spawn', () => {
    console.log("Virtual monitor frame allocated successfully (:1).");
    
    // 2. Start the desktop window layer manager inside display :1
    spawn('fluxbox', [], { env: { DISPLAY: ':1' } });

    // 3. Start the VNC engine and hard-lock it to raw port 5900
    spawn('x11vnc', [
        '-display', ':1', 
        '-rfbport', '5900', // STRICT PORT RESOURCE LOCK
        '-nopw', 
        '-listen', 'localhost', 
        '-forever', 
        '-shared'
    ]);

    // 4. Bind the streaming canvas web framework onto port 8081 mapping back to display 5900
    setTimeout(() => {
        const novncPath = '/usr/share/novnc';
        const websockifyPath = '/usr/share/novnc/utils/websockify/websockify.py';
        spawn('python3', [websockifyPath, '--web', novncPath, '8081', 'localhost:5900']);
        console.log("Streaming socket baseline prepared (8081).");
    }, 2000);

    // 5. Fire up the native Chromium window inside display :1 with environment binary checking
    setTimeout(() => {
        let binaryCmd = 'chromium';
        if (fs.existsSync('/usr/bin/chromium-browser')) {
            binaryCmd = 'chromium-browser';
        }

        console.log(`Launching visual Chromium engine window via target: ${binaryCmd}`);
        spawn(binaryCmd, [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--start-maximized',
            '--js-flags="--max-old-space-size=400"', 
            '--no-zygote',
            '--single-process',
            'https://google.com'
        ], { env: { DISPLAY: ':1' } });
    }, 3000);
});

// ====================================================================
// NEW UNIFIED REVERSE PROXY HOOKS (FIXES MIXED REQT / WHITE SCREEN EXCEPTION)
// ====================================================================

// Proxies raw WebSocket control streaming traffic cleanly back through port 8080
app.use('/websockify', createProxyMiddleware({
    target: 'http://localhost:8081',
    ws: true, 
    changeOrigin: true,
    logLevel: 'silent'
}));

// Shares structural noVNC static framework assets without cross-origin file drops
app.use('/vnc_core', express.static('/usr/share/novnc'));

// Direct index entry routing to server-side deploy your custom layout iindex.html
app.get('/', (req, res) => {
    const indexPath = path.join(process.cwd(), 'iindex.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: Could not locate your iindex.html file inside the active workspace container.");
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`VISUAL BROWSER ROUTER IS LIVE ONLINE!`);
    console.log(`Access your unified instance on Port: ${port}`);
    console.log(`======================================================\n`);
});

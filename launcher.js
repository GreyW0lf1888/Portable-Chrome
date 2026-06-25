const { spawn, execSync } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http'); 
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
    
    // CRITICAL ENGINE OPTIMIZATION: Enforce structural full-HD mode scaling onto display output canvas
    try {
        execSync('xrandr --display :1 --output default --mode 1920x1080 2>/dev/null');
        console.log("Xvfb resolution initialization scaled to 1920x1080.");
    } catch (err) {
        // Fallback profile if default screen label name changes inside active container profile
    }

    // 2. Start the desktop window layer manager inside display :1
    spawn('fluxbox', [], { env: { DISPLAY: ':1' } });

    // 3. Start the VNC engine and hard-lock it to raw port 5900 with performance overrides
    spawn('x11vnc', [
        '-display', ':1', 
        '-rfbport', '5900', // STRICT PORT RESOURCE LOCK
        '-nopw', 
        '-listen', 'localhost', 
        '-forever', 
        '-shared',
        '-defer', '10',     // CRITICAL PERFORMANCE FIX: Lowers frame encoding delay down to 10ms
        '-noipv6',          // CRITICAL PERFORMANCE FIX: Disables structural IPv6 duplicate loop lookup delays
        '-nowf'             // CRITICAL PERFORMANCE FIX: Disables window wireframing pooling overhead loops
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

// Define the proxy configuration as a reusable instance compatible with http-proxy-middleware v4
const wsProxy = createProxyMiddleware({
    target: 'http://localhost:8081',
    ws: true, 
    changeOrigin: true,
    logLevel: 'silent',
    pathRewrite: {
        '^/websockify': '', // Strips '/websockify' route path prefix so python process catches stream at root link
    }
});

// Proxies raw WebSocket control streaming traffic cleanly back through port 8080
app.use('/websockify', wsProxy);

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

// Wrap your Express application in a native Node HTTP server pipeline to handle network handshakes
const server = http.createServer(app);

// Explicitly pipe root level socket upgrade protocols straight into the proxy configuration rules
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/websockify')) {
        wsProxy.upgrade(req, socket, head);
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`VISUAL BROWSER ROUTER IS LIVE ONLINE!`);
    console.log(`Access your unified instance on Port: ${port}`);
    console.log(`======================================================\n`);
});

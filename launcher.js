const { spawn, execSync } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http'); 
const { createProxyMiddleware } = require('http-proxy-middleware');

// Top-level error safety net to keep the proxy server online if a system command complains
process.on('uncaughtException', (err) => {
    console.error('\n[SYSTEM MONITOR ERROR]:', err.message || err);
});

const app = express();
const BASE_PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const WS_PROXY_PORT = 8081;
const INTERNAL_VNC_PORT = 8082;
const RESERVED_PORTS = [WS_PROXY_PORT, INTERNAL_VNC_PORT];
let currentPort = BASE_PORT;
const maxPortRetries = 20;
let portAttempts = 0;

// Middleware to parse raw string data packets sent from external trackers
app.use(express.text({ type: '*/*' }));

// --- CRITICAL LINUX SYSTEM LOCK SANITISER ---
try {
    console.log("Purging legacy container processes and virtual display sockets...");
    execSync('killall -9 Xvfb fluxbox x11vnc python3 chromium chromium-browser chrome 2>/dev/null');
    execSync('rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null');
    console.log("Environment cleanup complete.");
} catch (e) {}

// ====================================================================
// NEW UNIFIED REVERSE PROXY HOOKS (HTTP-PROXY-MIDDLEWARE V4)
// ====================================================================
const wsProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:8081', 
    ws: true, 
    changeOrigin: true,
    logLevel: 'silent'
});

app.use('/websockify', wsProxy);
app.use('/vnc_core', express.static('/usr/share/novnc'));

// ====================================================================
// INTEGRATED TRACKING LOGIC ROUTE (REPLACES DETACHED PORT 5900 CONFLICT)
// ====================================================================
app.all('/tracker', (req, res) => {
    console.log(`[TRACKER LAYER]: Input/metrics package received.`);
    if (req.body) {
        console.log(`Payload content: ${req.body}`);
        // Handle input coordination, tracing, or custom messaging packets here cleanly
    }
    res.status(200).send({ status: "processed", activeDisplay: ":1" });
});

app.get('/', (req, res) => {
    const indexPath = path.join(process.cwd(), 'iindex.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: Could not locate your iindex.html file inside the active workspace container.");
    }
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/websockify')) {
        wsProxy.upgrade(req, socket, head);
    }
});

// ====================================================================
// PRIORITY INITIALIZATION LAYER (FORCES PORT SELECTION AND RETRY)
// ====================================================================
const HOST = '0.0.0.0'; 

function listenOnPort() {
    if (RESERVED_PORTS.includes(currentPort)) {
        currentPort += 1;
    }

    server.listen(currentPort, HOST, () => {
        console.log(`\n======================================================`);
        console.log(`🚀 VISUAL BROWSER ROUTER IS LIVE ONLINE!`);
        console.log(`🌐 Bound Globally to network interface: ${HOST}`);
        console.log(`📺 Primary Web Interface running on Port: ${currentPort}`);
        console.log(`======================================================\n`);

        console.log(`Server running at http://${HOST}:${currentPort}/`);
        setTimeout(startVisualEnvironment, 1000);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && portAttempts < maxPortRetries) {
        console.warn(`Port ${currentPort} already in use, attempting next port...`);
        portAttempts += 1;
        currentPort += 1;
        if (RESERVED_PORTS.includes(currentPort)) {
            currentPort += 1;
        }
        listenOnPort();
    } else {
        console.error('Server failed to bind:', err);
        process.exit(1);
    }
});

listenOnPort();
// ====================================================================
// DEFERRED SYSTEM PROCESS INITIALIZATION
// ====================================================================
function startVisualEnvironment() {
    console.log("Initializing visual environment layers...");

    // 1. Setup the virtual display frame natively locked directly to full 1080p resolution buffer
    const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1920x1080x24']);

    xvfb.on('error', (err) => console.error("Xvfb failed to execute:", err.message));

    xvfb.on('spawn', () => {
        console.log("Virtual monitor frame allocated successfully (:1).");
        
        // 2. Start the desktop window layer manager inside display :1
        const fluxbox = spawn('fluxbox', [], { env: { ...process.env, DISPLAY: ':1' } });
        fluxbox.on('error', (err) => console.error("Fluxbox failed to execute:", err.message));

        // 3. Start the VNC engine on hidden internal port 8082 instead of 5900
        const x11vnc = spawn('x11vnc', [
            '-display', ':1', 
            '-rfbport', '8082', 
            '-nopw', 
            '-listen', '127.0.0.1', 
            '-forever', 
            '-shared',
            '-defer', '10',     
            '-noipv6',          
            '-nowf'             
        ], { env: { ...process.env } });
        x11vnc.on('error', (err) => console.error("x11vnc failed to execute:", err.message));

        // 4. Bind websockify / noVNC proxy to port 8081, feeding from the hidden 8082 VNC instance
        setTimeout(() => {
            const novncPath = '/usr/share/novnc';
            const novncProxyPath = '/usr/share/novnc/utils/novnc_proxy';
            const websockifyPyPath = '/usr/share/novnc/utils/websockify/websockify.py';

            let proxyCmd;
            let proxyArgs;

            if (fs.existsSync(novncProxyPath)) {
                proxyCmd = novncProxyPath;
                proxyArgs = ['--listen', '8081', '--vnc', '127.0.0.1:8082', '--web', novncPath];
            } else if (fs.existsSync(websockifyPyPath)) {
                proxyCmd = 'python3';
                proxyArgs = [websockifyPyPath, '--web', novncPath, '8081', '127.0.0.1:8082'];
            } else {
                console.error("Websockify proxy not found. Expected either:", novncProxyPath, "or", websockifyPyPath);
                return;
            }

            const websockify = spawn(proxyCmd, proxyArgs, { env: { ...process.env } });
            websockify.on('error', (err) => console.error("Websockify proxy failed to execute:", err.message));
            console.log(`Streaming socket baseline prepared (8081) using ${proxyCmd}.`);
        }, 1500);

        // 5. Fire up the native Chromium window inside display :1
        setTimeout(() => {
            let binaryCmd = 'chromium';
            if (fs.existsSync('/usr/bin/chromium-browser')) {
                binaryCmd = 'chromium-browser';
            }

            console.log(`Launching visual Chromium engine window via target: ${binaryCmd}`);
            const chromium = spawn(binaryCmd, [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--start-maximized',
                '--js-flags="--max-old-space-size=400"', 
                '--no-zygote',
                '--single-process',
                '--disable-dev-shm-usage',
                '--disable-software-rasterizer',
                'https://google.com'
            ], { env: { ...process.env, DISPLAY: ':1' } });
            
            chromium.on('error', (err) => console.error("Chromium browser failed to execute:", err.message));
        }, 2500);
    });
}

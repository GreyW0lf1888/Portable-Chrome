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
const port = 5000;

const NOVNC_PATH = fs.existsSync(path.join(__dirname, 'novnc'))
    ? path.join(__dirname, 'novnc')
    : '/usr/share/novnc';
const WEBSOCKIFY_BIN = path.join(process.env.HOME || '/home/runner', 'workspace', '.pythonlibs', 'bin', 'websockify');

// Middleware to parse raw string data packets sent from external trackers
app.use(express.text({ type: '*/*' }));

// --- CRITICAL LINUX SYSTEM LOCK SANITISER ---
try {
    console.log("Purging legacy container processes and virtual display sockets...");
    execSync('killall -9 Xvfb fluxbox x11vnc python3 chromium chromium-browser chrome 2>/dev/null || true');
    execSync('rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true');
    console.log("Environment cleanup complete.");
} catch (e) {}

// ====================================================================
// REVERSE PROXY FOR WEBSOCKIFY (HTTP-PROXY-MIDDLEWARE V4)
// ====================================================================
const wsProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:8081', 
    ws: true, 
    changeOrigin: true,
    logLevel: 'silent',
    pathRewrite: {
        '^/websockify': '/',
    },
});

app.use('/websockify', wsProxy);
app.use('/vnc_core', express.static(NOVNC_PATH));

// ====================================================================
// TRACKER ROUTE
// ====================================================================
app.all('/tracker', (req, res) => {
    console.log(`[TRACKER LAYER]: Input/metrics package received.`);
    if (req.body) {
        console.log(`Payload content: ${req.body}`);
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
// START SERVER
// ====================================================================
const HOST = '0.0.0.0'; 

server.listen(port, HOST, () => {
    console.log(`\n======================================================`);
    console.log(`VISUAL BROWSER ROUTER IS LIVE ONLINE!`);
    console.log(`Bound Globally to network interface: ${HOST}`);
    console.log(`Primary Web Interface running on Port: ${port}`);
    console.log(`noVNC path: ${NOVNC_PATH}`);
    console.log(`======================================================\n`);

    setTimeout(startVisualEnvironment, 1000);
});

// ====================================================================
// DEFERRED SYSTEM PROCESS INITIALIZATION
// ====================================================================
function waitForX11Socket(socketPath, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        const interval = setInterval(() => {
            if (fs.existsSync(socketPath)) {
                clearInterval(interval);
                resolve(true);
                return;
            }

            if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                reject(new Error('Xvfb socket did not appear in time'));
            }
        }, 100);
    });
}

function startVisualEnvironment() {
    console.log("Initializing high-performance visual environment layers...");

    const env1 = { ...process.env, DISPLAY: ':1' };

    // 1. Start Xvfb (16bpp for network performance, -ac/-pn/-noreset for stability)
    const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1280x720x16', '-ac', '-pn', '-noreset']);
    xvfb.on('error', (err) => console.error("Xvfb failed:", err.message));
    console.log("Starting Xvfb virtual display...");

    const socketPath = '/tmp/.X11-unix/X1';

    waitForX11Socket(socketPath, 8000)
        .then(() => {
            console.log('Xvfb socket ready:', socketPath);

            // 2. Start fluxbox window manager
            console.log('Starting fluxbox window manager...');
            const cleanEnv = { ...env1 };
            delete cleanEnv.SESSION_MANAGER;
            delete cleanEnv.DBUS_SESSION_BUS_ADDRESS;
            const fluxbox = spawn('fluxbox', [], { env: cleanEnv });
            fluxbox.on('error', (err) => console.error('Fluxbox failed:', err.message));

            // 3. Start hyper-optimized x11vnc
            console.log('Starting hyper-optimized x11vnc on port 8082...');
            const x11vnc = spawn('x11vnc', [
                '-display', ':1',
                '-rfbport', '8082',
                '-nopw',
                '-listen', '127.0.0.1',
                '-forever',
                '-shared',
                '-noipv6',
                '-nowf',
                '-noshm',
                '-defer', '0',
            ], { env: env1 });
            x11vnc.on('error', (err) => console.error('x11vnc failed:', err.message));
            x11vnc.stderr.on('data', (d) => {
                const msg = d.toString().trim();
                if (msg) console.log('[x11vnc]', msg);
            });

            // 4. Start websockify
            const websockifyCmd = fs.existsSync(WEBSOCKIFY_BIN) ? WEBSOCKIFY_BIN : 'websockify';
            console.log('Starting websockify...');
            const websockify = spawn(websockifyCmd, ['--web', NOVNC_PATH, '8081', '127.0.0.1:8082'], { env: { ...process.env } });
            websockify.on('error', (err) => console.error('Websockify failed:', err.message));
            websockify.stdout.on('data', (d) => console.log('[websockify]', d.toString().trim()));
            websockify.stderr.on('data', (d) => console.error('[websockify]', d.toString().trim()));

            // 5. Launch Chromium with GPU rasterization enabled
            let binaryCmd = 'chromium';
            if (fs.existsSync('/usr/bin/chromium-browser')) binaryCmd = 'chromium-browser';
            console.log('Launching Chromium with hardware acceleration enabled...');
            const chromium = spawn(binaryCmd, [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--test-type',
                '--no-first-run',
                '--start-maximized',
                '--disable-dev-shm-usage',
                '--disable-infobars',
                '--disable-smooth-scrolling',
                '--ignore-gpu-blocklist',
                '--enable-gpu-rasterization',
                '--enable-zero-copy',
                'https://google.com'
            ], { env: env1 });
            chromium.on('error', (err) => console.error('Chromium failed:', err.message));
            chromium.stderr.on('data', (d) => console.error('[Chromium]', d.toString().trim()));
            chromium.stdout.on('data', (d) => console.log('[Chromium]', d.toString().trim()));
        })
        .catch((err) => {
            console.error('Xvfb readiness check failed:', err.message);
        });
}

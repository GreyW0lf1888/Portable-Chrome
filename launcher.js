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
const requestedPort = Number(process.env.PORT || 5000);
let currentPort = requestedPort;
let server = null;
let listenAttempts = 0;
const maxListenAttempts = 10;
const websockifyPort = Number(process.env.WEBSOCKIFY_PORT || 8081);
const vncPort = Number(process.env.VNC_PORT || 8082);
let activeVncPort = vncPort;

const NOVNC_PATH = fs.existsSync(path.join(__dirname, 'novnc'))
    ? path.join(__dirname, 'novnc')
    : '/usr/share/novnc';
const WEBSOCKIFY_BIN = path.join(process.env.HOME || '/home/runner', 'workspace', '.pythonlibs', 'bin', 'websockify');

// Middleware to parse raw string data packets sent from external trackers
app.use(express.text({ type: '*/*' }));

// --- CRITICAL LINUX SYSTEM LOCK SANITISER ---
try {
    console.log("Purging legacy container processes and virtual display sockets...");
    execSync(`ps -eo pid=,args= | awk '/node launcher.js/ && $1 != ${process.pid} {print $1}' | xargs -r kill -9`, { stdio: 'ignore' });
    execSync('killall -9 Xvfb fluxbox x11vnc websockify python3 chromium chromium-browser chrome 2>/dev/null || true', { stdio: 'ignore' });
    execSync('fuser -k 5000/tcp 8081/tcp 8082/tcp 5900/tcp 2>/dev/null || true', { stdio: 'ignore' });
    execSync('rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 /tmp/.X11-unix/X0 2>/dev/null || true', { stdio: 'ignore' });
    console.log("Environment cleanup complete.");
} catch (e) {}

// ====================================================================
// REVERSE PROXY FOR WEBSOCKIFY (HTTP-PROXY-MIDDLEWARE V4)
// ====================================================================
const wsProxy = createProxyMiddleware({
    target: `http://127.0.0.1:${websockifyPort}`, 
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

function createServer() {
    const srv = http.createServer(app);

    srv.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/websockify')) {
            wsProxy.upgrade(req, socket, head);
        }
    });

    srv.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && listenAttempts < maxListenAttempts) {
            listenAttempts += 1;
            currentPort += 1;
            console.warn(`Port ${currentPort - 1} is busy; trying ${currentPort} instead.`);
            listenOnPort();
        } else {
            console.error('Server failed to bind:', err.message || err);
            process.exit(1);
        }
    });

    return srv;
}

// ====================================================================
// START SERVER
// ====================================================================
const HOST = '0.0.0.0';

function listenOnPort() {
    if (server) {
        try { server.close(); } catch (e) {}
    }

    server = createServer();
    server.listen(currentPort, HOST, () => {
        console.log(`\n======================================================`);
        console.log(`VISUAL BROWSER ROUTER IS LIVE ONLINE!`);
        console.log(`Bound Globally to network interface: ${HOST}`);
        console.log(`Primary Web Interface running on Port: ${currentPort}`);
        console.log(`noVNC path: ${NOVNC_PATH}`);
        console.log(`======================================================\n`);

        setTimeout(startVisualEnvironment, 1000);
    });
}

listenOnPort();

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

function findFreePort(startPort, excluded = []) {
    return new Promise((resolve) => {
        const net = require('net');
        const tryPort = (candidate) => {
            if (excluded.includes(candidate)) {
                return tryPort(candidate + 1);
            }

            const tester = net.createServer();
            tester.once('error', () => {
                if (candidate < 65535) {
                    tryPort(candidate + 1);
                } else {
                    resolve(startPort);
                }
            });
            tester.once('listening', () => {
                const { port } = tester.address();
                tester.close(() => resolve(port));
            });
            tester.listen(candidate, '127.0.0.1');
        };

        tryPort(startPort);
    });
}

async function startVisualEnvironment() {
    console.log("Initializing high-performance visual environment layers...");

    const env1 = { ...process.env, DISPLAY: ':1' };

    // 1. Start Xvfb (16bpp for network performance, -ac/-pn/-noreset for stability)
    const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1280x720x16', '-ac', '-pn', '-noreset']);
    xvfb.on('error', (err) => console.error("Xvfb failed:", err.message));
    console.log("Starting Xvfb virtual display...");

    const socketPath = '/tmp/.X11-unix/X1';

    try {
        await waitForX11Socket(socketPath, 8000);
        console.log('Xvfb socket ready:', socketPath);

        activeVncPort = await findFreePort(activeVncPort);
        console.log(`Using VNC port ${activeVncPort} and websockify port ${websockifyPort}`);

        // 2. Start fluxbox window manager
        console.log('Starting fluxbox window manager...');
        const cleanEnv = { ...env1 };
        delete cleanEnv.SESSION_MANAGER;
        delete cleanEnv.DBUS_SESSION_BUS_ADDRESS;
        const fluxbox = spawn('fluxbox', [], { env: cleanEnv });
        fluxbox.on('error', (err) => console.error('Fluxbox failed:', err.message));

        // 3. Start hyper-optimized x11vnc
        console.log(`Starting hyper-optimized x11vnc on port ${activeVncPort}...`);
        const x11vnc = spawn('x11vnc', [
            '-display', ':1',
            '-rfbport', String(activeVncPort),
            '-nopw',
            '-listen', '127.0.0.1',
            '-localhost',
            '-nowebset',
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
        console.log(`Starting websockify on port ${websockifyPort}...`);
        const websockify = spawn(websockifyCmd, ['--web', NOVNC_PATH, String(websockifyPort), `127.0.0.1:${activeVncPort}`], { env: { ...process.env } });
        websockify.on('error', (err) => console.error('Websockify failed:', err.message));
        websockify.stdout.on('data', (d) => console.log('[websockify]', d.toString().trim()));
        websockify.stderr.on('data', (d) => console.error('[websockify]', d.toString().trim()));

        // 5. Launch Chromium with GPU rasterization enabled
        const browserCandidates = [
            path.join(__dirname, 'chrome', 'linux-150.0.7871.46', 'chrome-linux64', 'chrome'),
            path.join(__dirname, 'chrome-headless-shell', 'linux-149.0.7827.54', 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
        ];

        let binaryCmd = null;
        for (const candidate of browserCandidates) {
            if (!candidate || !fs.existsSync(candidate)) continue;
            if (candidate.includes('chromium-browser')) {
                const content = fs.readFileSync(candidate, 'utf8').slice(0, 80);
                if (content.startsWith('#!')) continue;
            }
            binaryCmd = candidate;
            break;
        }

        if (!binaryCmd) {
            console.error('No usable browser binary was found for launch.');
            return;
        }

        console.log(`Launching browser with binary: ${binaryCmd}`);
        const chromium = spawn(binaryCmd, [
            '--single-process',      
            '--no-zygote',             
            '--renderer-process-limit=1',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-features=VizDisplayCompositor,UseOzonePlatform,Translate,BackForwardCache',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1024,640',
            '--window-position=0,0',
            '--new-window',
            '--user-data-dir=/tmp/chrome-port-launcher-profile-' + process.pid,
            '--remote-debugging-port=9222',
            '--disable-logging',
            '--log-level=0',
            'https://google.com'
        ], { env: { ...env1, DBUS_SESSION_BUS_ADDRESS: '', XDG_RUNTIME_DIR: '/tmp/runtime-chrome' } });
        chromium.on('error', (err) => console.error('Chromium failed:', err.message));
        chromium.stderr.on('data', (d) => console.error('[Chromium]', d.toString().trim()));
        chromium.stdout.on('data', (d) => console.log('[Chromium]', d.toString().trim()));
    } catch (err) {
        console.error('Xvfb readiness check failed:', err.message);
    }
}

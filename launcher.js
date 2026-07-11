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
const websockifyPort = Number(process.env.WEBSOCKIFY_PORT || 6080);
const vncPort = Number(process.env.VNC_PORT || 5900);
let activeVncPort = vncPort;

const NOVNC_PATH = [
    path.join(__dirname, 'novnc'),
    '/usr/share/novnc',
    '/usr/share/python3-novnc',
].find((candidate) => candidate && fs.existsSync(candidate)) || '/usr/share/novnc';
const WEBSOCKIFY_BIN = path.join(process.env.HOME || '/home/runner', 'workspace', '.pythonlibs', 'bin', 'websockify');

function resolveBinary(...candidates) {
    for (const candidate of candidates) {
        if (!candidate) continue;
        if (path.isAbsolute(candidate)) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            continue;
        }

        try {
            const resolved = execSync(`command -v ${candidate}`, { stdio: ['ignore', 'pipe', 'ignore'] })
                .toString()
                .trim();
            if (resolved) {
                return resolved;
            }
        } catch (error) {
            continue;
        }
    }
    return null;
}

const XvfbBinary = resolveBinary('/usr/bin/Xvfb', 'Xvfb');
const FluxboxBinary = resolveBinary('/usr/bin/fluxbox', 'fluxbox');
const X11VNCCmd = resolveBinary('/usr/bin/x11vnc', 'x11vnc');
const WebsockifyCmd = fs.existsSync(WEBSOCKIFY_BIN)
    ? WEBSOCKIFY_BIN
    : resolveBinary('/usr/bin/websockify', 'websockify');

if (!XvfbBinary || !FluxboxBinary || !X11VNCCmd || !WebsockifyCmd) {
    console.error('Critical: One or more required visual environment binaries are unavailable.');
    console.error('Resolved binaries:');
    console.error('  Xvfb:', XvfbBinary || 'not found');
    console.error('  fluxbox:', FluxboxBinary || 'not found');
    console.error('  x11vnc:', X11VNCCmd || 'not found');
    console.error('  websockify:', WebsockifyCmd || 'not found');
    process.exit(1);
}

function findBrowserCandidates() {
    const candidates = [
        process.env.CHROME_BIN,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        process.env.PUPPETEER_EXECUTABLE_PATH,
        path.join(__dirname, 'chrome-headless-shell', 'linux-149.0.7827.54', 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
    ].filter(Boolean);

    const chromeRoot = path.join(__dirname, 'chrome');
    if (fs.existsSync(chromeRoot)) {
        const builds = fs.readdirSync(chromeRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
            .reverse();

        for (const build of builds) {
            const candidate = path.join(chromeRoot, build, 'chrome-linux64', 'chrome');
            if (fs.existsSync(candidate)) {
                candidates.unshift(candidate);
            }
        }
    }

    return candidates;
}

// Middleware to parse raw string data packets sent from external trackers
app.use(express.text({ type: '*/*' }));

// --- CRITICAL LINUX SYSTEM LOCK SANITISER ---
try {
    console.log("Preparing a clean display environment...");
    execSync('rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 /tmp/.X11-unix/X0 2>/dev/null || true', { stdio: 'ignore' });
    execSync("pkill -f 'Xvfb|fluxbox|x11vnc|websockify|chromium|chrome' 2>/dev/null || true", { stdio: 'ignore' });
    execSync(`fuser -k ${requestedPort}/tcp ${websockifyPort}/tcp ${vncPort}/tcp 5900/tcp 6080/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    console.log("Environment cleanup complete.");
} catch (e) {}

// ====================================================================
// REVERSE PROXY FOR WEBSOCKIFY (HTTP-PROXY-MIDDLEWARE V4)
// ====================================================================
const wsProxy = createProxyMiddleware({
    target: `http://127.0.0.1:${websockifyPort}`, 
    ws: true, 
    changeOrigin: true,
    secure: false,
    xfwd: true,
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

app.get('/healthz', (req, res) => {
    res.status(200).send({ status: 'ok', port: currentPort, display: ':1' });
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
        const xvfb = spawn(XvfbBinary || 'Xvfb', [':1', '-screen', '0', '1280x720x16', '-ac', '-pn', '-noreset']);
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
        const fluxbox = spawn(FluxboxBinary || 'fluxbox', [], { env: cleanEnv });
        fluxbox.on('error', (err) => console.error('Fluxbox failed:', err.message));

        // 3. Start hyper-optimized x11vnc
        console.log(`Starting hyper-optimized x11vnc on port ${activeVncPort}...`);
        const x11vnc = spawn(X11VNCCmd || 'x11vnc', [
            '-display', ':1',
            '-rfbport', String(activeVncPort),
            '-nopw',
            '-listen', '127.0.0.1',
            '-localhost',
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
        console.log(`Starting websockify on port ${websockifyPort}...`);
        const websockify = spawn(WebsockifyCmd || 'websockify', ['--web', NOVNC_PATH, String(websockifyPort), `127.0.0.1:${activeVncPort}`], { env: { ...process.env } });
        websockify.on('error', (err) => console.error('Websockify failed:', err.message));
        websockify.stdout.on('data', (d) => console.log('[websockify]', d.toString().trim()));
        websockify.stderr.on('data', (d) => console.error('[websockify]', d.toString().trim()));

        // 5. Launch Chromium with GPU rasterization enabled
        const browserCandidates = findBrowserCandidates();

        let binaryCmd = null;
        for (const candidate of browserCandidates) {
            if (!candidate || !fs.existsSync(candidate)) continue;
            binaryCmd = candidate;
            break;
        }

        if (!binaryCmd) {
            console.error('No usable browser binary was found for launch.');
            return;
        }

        console.log(`Launching browser with binary: ${binaryCmd}`);

        let availableMemMb = null;
        try {
            const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const match = meminfo.match(/MemAvailable:\s+(\d+)/);
            if (match) {
                availableMemMb = Math.floor(Number(match[1]) / 1024);
            }
        } catch (error) {
            availableMemMb = null;
        }

        const lowMemoryMode = availableMemMb !== null && availableMemMb < 512;
        const browserArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=' + (lowMemoryMode ? '1024,600' : '1280,760'),
            '--window-position=0,0',
            '--force-device-scale-factor=' + (lowMemoryMode ? '0.85' : '0.9'),
            '--new-window',
            '--user-data-dir=/tmp/chrome-port-launcher-profile-' + process.pid,
            '--remote-debugging-port=0',
            '--disable-logging',
            '--log-level=3',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=Translate,BackForwardCache,OptimizationGuideModelDownloading,AudioServiceOutOfProcess,MediaRouter,AutofillServerCommunication,InterestFeedContentSuggestions,CalculateNativeWinOcclusion',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--metrics-recording-only',
            '--password-store=basic',
            '--disable-gpu-watchdog',
            '--disable-hang-monitor',
            '--disable-breakpad',
            '--disable-crash-reporter',
            '--disable-gpu-compositing',
            '--disable-accelerated-2d-canvas',
            '--disable-accelerated-video-decode',
            '--disable-accelerated-mjpeg-decode',
            '--lang=en-US,en',
            '--accept-language=en-US,en;q=0.9',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            ...(lowMemoryMode ? ['--single-process', '--no-zygote', '--memory-pressure-off', '--enable-low-end-device-mode', '--aggressive-cache-discard', '--disk-cache-size=10485760', '--media-cache-size=10485760'] : []),
            'https://www.google.com'
        ];

        const chromium = spawn(binaryCmd, browserArgs, { env: { ...env1, DBUS_SESSION_BUS_ADDRESS: '', XDG_RUNTIME_DIR: '/tmp/runtime-chrome', HOME: '/tmp', TZ: 'UTC', LANG: 'en_US.UTF-8', LANGUAGE: 'en_US:en' } });
        chromium.on('error', (err) => console.error('Chromium failed:', err.message));
        chromium.on('exit', (code, signal) => console.error(`Chromium exited with code ${code} signal ${signal}`));
        chromium.stderr.on('data', (d) => console.error('[Chromium]', d.toString().trim()));
        chromium.stdout.on('data', (d) => console.log('[Chromium]', d.toString().trim()));
    } catch (err) {
        console.error('Xvfb readiness check failed:', err.message);
    }
}

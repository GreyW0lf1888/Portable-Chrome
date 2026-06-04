const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Helper function to recursively find the executable file without relying on system commands
function findExecutable(dir, targetName) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            const found = findExecutable(fullPath, targetName);
            if (found) return found;
        } else if (file === targetName) {
            return fullPath;
        }
    }
    return null;
}

async function launchChromium() {
    const port = process.env.PORT || 8080;
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

    // 1. Scan local workspace folders for the downloaded browser using native Node tools
    if (!executablePath) {
        const cacheDir = path.join(process.cwd(), 'chrome-headless-shell');
        if (fs.existsSync(cacheDir)) {
            executablePath = findExecutable(cacheDir, 'chrome-headless-shell');
        }
    }

    // 2. Fallback to basic system locations if the local cache is empty
    if (!executablePath) {
        const standardPaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium'];
        for (const p of standardPaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }
    }

    // 3. Clear error handling if the setup steps were skipped
    if (!executablePath || !fs.existsSync(executablePath)) {
        console.error("\n======================================================");
        console.error("ERROR: No compatible browser binary found!");
        console.error("Please run the download command first:");
        console.error("  npm run install-chrome");
        console.error("======================================================\n");
        process.exit(1);
    }

    console.log(`Using target binary path: ${executablePath}`);
    console.log(`Launching instance server on port ${port}...`);
    
    const browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: true, 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-software-rasterizer', 
            '--disable-dev-shm-usage',       
            `--remote-debugging-port=${port}`,
            '--remote-debugging-address=0.0.0.0',
            
            // MANDATORY LOW-MEMORY PRODUCTION FLAGS FOR RENDER:
            '--js-flags="--max-old-space-size=400"', // Hard-caps JavaScript engine RAM usage
            '--no-zygote',                           // Disables multi-process idling 
            '--single-process'                        // Restricts execution to a single safe container thread
        ]
    });

    console.log(`\n======================================================`);
    console.log(`Chromium Is Online!`);
    console.log(`Endpoint Mapping JSON live at port: ${port}`);
    console.log(`======================================================\n`);

    browser.on('disconnected', () => {
        console.error('Browser instance closed unexpectedly.');
        process.exit(1); 
    });
}

launchChromium().catch(err => {
    console.error("Critical failure starting Chromium:", err);
    process.exit(1);
});

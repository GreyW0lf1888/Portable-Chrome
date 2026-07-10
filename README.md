# Chromium Instance
This runs a completely separate and portable Chromium instance into your port easily, completely isolated from anything and everything on your browser.

## Run in Docker / devcontainer
The app depends on native Linux binaries (`Xvfb`, `fluxbox`, `x11vnc`, `websockify`) that are installed by the provided `Dockerfile`.

To use the project correctly, run it inside the container:

```bash
docker build -t portable-chrome .
docker run --rm -p 5000:5000 -p 8081:8081 -p 8082:8082 portable-chrome
```

Or open the repo via the `devcontainer.json` configuration so the container is created with the right system packages.

## Local host usage
If you want to run `npm start` directly on your machine, install the required packages first:

```bash
sudo apt-get update
sudo apt-get install xvfb fluxbox x11vnc python3-websockify
```

Then run:

```bash
npm install
npm start
```

## Notes
`npm install` only installs Node dependencies; it does not install the native system packages required by the visual browser stack.


FROM node:20-noble

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    gnupg \
    xvfb \
    fluxbox \
    x11vnc \
    novnc \
    python3 \
    python3-websockify \
    dbus-x11 \
    procps \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

RUN (apt-get update && apt-get install -y --no-install-recommends ca-certificates curl wget gnupg xvfb fluxbox x11vnc novnc python3 python3-websockify dbus-x11 procps >/dev/null 2>&1 || true) && pkill -f 'node launcher.js|chrome-linux64/chrome|x11vnc|websockify' >/dev/null 2>&1 || true && (sleep 8 && echo '--- processes ---' && ps -ef | grep -E '[c]hrome-linux64/chrome|[x]11vnc|[w]ebsockify|[n]ode launcher.js' || true && echo '--- ports ---' && ss -ltnp 2>/dev/null | grep -E ':5000|:8081|:8082|:8086' || true && echo '--- http check ---' && curl -I -s http://127.0.0 | head -n 5) & node launcher.js

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

RUN npm run install-chrome

EXPOSE 5000 8081 8082 5900

RUN cd /workspaces/Minecraft-1.19.22.01 && pkill -f 'node launcher.js|chrome-linux64/chrome|x11vnc|websockify' >/dev/null 2>&1 || true && node launcher.js > /tmp/launcher.log 2>&1 & sleep 8 && echo '--- processes ---' && ps -ef | grep -E '[c]hrome-linux64/chrome|[x]11vnc|[w]ebsockify|[n]ode launcher.js' || true && echo '--- ports ---' && ss -ltnp 2>/dev/null | grep -E ':5000|:8081|:8082|:8086' || true && echo '--- http check ---' && curl -I -s http://127.0.0.1:5000/ | head -n 5

CMD ["npm", "start"]

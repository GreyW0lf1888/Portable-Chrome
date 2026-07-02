FROM node:24-bookworm

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

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl wget gnupg xvfb fluxbox x11vnc novnc python3 python3-websockify dbus-x11 procps >/dev/null 2>&1 || true


WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

RUN npm run install-chrome

EXPOSE 5000 8081 8082 5900


CMD ["npm", "start"]
CMD ["node", "launcher.js"]

FROM node:20-noble

RUN npm install express http-proxy-middleware

RUN sudo apt-get install -y novnc python3-websockify

FROM node:20-noble

ENV DISPLAY=:1
ENV NODE_ENV=production

# Install full graphical browser utilities and X11 display frameworks cleanly
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    fluxbox \
    x11vnc \
    novnc \
    python3-websockify \
    python3 \
    ca-certificates \
    findutils \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    fluxbox \
    x11vnc \
    novnc \
    python3-websockify \
    python3 \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
     for Ubuntu 24.04+ Noble
     
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 5000 8081

CMD ["npm", "start"]

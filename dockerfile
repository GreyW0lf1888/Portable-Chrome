FROM node:20-noble

# Install the updated modern Linux GUI/system libraries required for Ubuntu 24.04+ Noble
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
    libasound2t64 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcb1 \
    libxrender1 \
    libxtst6 \
    fonts-liberation \
    findutils \
    && rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /app

# 1. Copy over ALL your application source files first (including iindex.html)
COPY . .

# 2. Install production dependencies cleanly
RUN npm ci --only=production || npm install --only=production

# 3. Run the chrome installer script AFTER files are in place so it never gets overwritten
RUN npm run install-chrome

# Render exposes application ports using the PORT environment variable
EXPOSE 8080

# Command to start your application launcher script
CMD ["npm", "start"]

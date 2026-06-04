FROM node:20-bullseye-slim

# Install the necessary Linux GUI/system libraries required to boot Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libnspr4 \
    libnss3 \
    findutils \
    && rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /app

# Copy dependency configuration files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production || npm install --only=production

# Download the portable chrome-headless-shell binary inside the container environment
RUN npm run install-chrome

# Copy the rest of your application files
COPY . .

# Render exposes application ports using the PORT environment variable
EXPOSE 8080

# Command to start your application launcher script
CMD ["npm", "start"]
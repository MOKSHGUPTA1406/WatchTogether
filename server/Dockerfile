# Dockerfile for WatchTogether Node.js + Socket.io + FFmpeg Server
FROM node:20-slim

# Install FFmpeg and clean apt cache
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files (handles both root context and server context)
COPY package*.json server/package*.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source code
COPY . .
RUN if [ -d "server" ]; then cp -rn server/* .; fi

# Create tmp and data directories for runtime HLS and SQLite storage
RUN mkdir -p tmp data

# Expose server port
EXPOSE 3001

# Environment variables
ENV PORT=3001
ENV NODE_ENV=production

# Start Node.js server
CMD ["node", "src/index.js"]

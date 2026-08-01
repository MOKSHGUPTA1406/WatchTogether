# Dockerfile for WatchTogether Node.js + Socket.io + FFmpeg Server
FROM node:20-slim

# Install FFmpeg and clean apt cache
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy server source code
COPY . .

# Create tmp and data directories for runtime HLS and SQLite storage
RUN mkdir -p tmp data

# Expose server port (default 3001)
EXPOSE 3001

# Environment variables
ENV PORT=3001
ENV NODE_ENV=production

# Start Node.js server
CMD ["node", "src/index.js"]

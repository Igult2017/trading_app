# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build frontend with Vite
RUN npx vite build

# Build production server (uses index.prod.ts which has no vite imports)
RUN npx esbuild server/index.prod.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install Python for chart generation
RUN apk add --no-cache python3 py3-pip

# Install Python dependencies (chart generation + price service)
RUN pip3 install --break-system-packages matplotlib mplfinance pandas numpy tessa yfinance pycoingecko

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder stage
# dist/ contains server (index.prod.js) and frontend (public/)
COPY --from=builder /app/dist ./dist

# Copy Python scripts for chart generation
COPY server/python ./server/python

# Create startup script for environment variable checking
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "=== Environment Check ===" ' >> /app/start.sh && \
    echo 'echo "NODE_ENV: $NODE_ENV"' >> /app/start.sh && \
    echo 'echo "DATABASE_URL set: $([ -n \"$DATABASE_URL\" ] && echo \"YES\" || echo \"NO\")"' >> /app/start.sh && \
    echo 'echo "TELEGRAM_BOT_TOKEN set: $([ -n \"$TELEGRAM_BOT_TOKEN\" ] && echo \"YES\" || echo \"NO\")"' >> /app/start.sh && \
    echo 'echo "========================="' >> /app/start.sh && \
    echo 'exec node dist/index.prod.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start the application with environment check
CMD ["/app/start.sh"]

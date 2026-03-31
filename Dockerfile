FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build frontend with Vite
RUN npx vite build

# Build production server
RUN npx esbuild server/index.prod.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

# Install Python, pip, and system libraries required by OpenCV, Tesseract, matplotlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install all Python dependencies the server actually uses
RUN pip3 install --no-cache-dir --break-system-packages \
    matplotlib \
    mplfinance \
    pandas \
    numpy \
    scipy \
    tessa \
    yfinance \
    pycoingecko \
    pytz \
    requests \
    ta \
    google-genai \
    google-generativeai \
    pillow \
    pytesseract \
    opencv-python-headless \
    psycopg2-binary

# Copy package files and install production Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy Python scripts
COPY server/python ./server/python
COPY python ./python

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "=== Environment Check ==="' >> /app/start.sh && \
    echo 'echo "NODE_ENV: $NODE_ENV"' >> /app/start.sh && \
    echo 'echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"' >> /app/start.sh && \
    echo 'echo "GOOGLE_API_KEY set: $([ -n "$GOOGLE_API_KEY" ] && echo YES || echo NO)"' >> /app/start.sh && \
    echo 'echo "========================="' >> /app/start.sh && \
    echo 'exec node dist/index.prod.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 5000

ENV NODE_ENV=production

CMD ["/app/start.sh"]

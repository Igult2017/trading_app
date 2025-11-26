# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application (outputs to dist/ with frontend in dist/public/)
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install Python for chart generation
RUN apk add --no-cache python3 py3-pip

# Install Python dependencies
RUN pip3 install --break-system-packages matplotlib mplfinance pandas numpy

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder stage
# dist/ contains both server (index.js) and frontend (public/)
COPY --from=builder /app/dist ./dist

# Copy Python scripts for chart generation
COPY server/python ./server/python

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/index.js"]

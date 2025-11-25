FROM node:20-alpine

WORKDIR /app

# Install Python for chart generation
RUN apk add --no-cache python3 py3-pip

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Install Python dependencies
RUN pip3 install --break-system-packages matplotlib mplfinance pandas numpy

# Build the application
RUN npm run build

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "start"]

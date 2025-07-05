# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install dependencies including concurrently
RUN npm install && \
    npm install -g concurrently

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Create data directory for bot storage
RUN mkdir -p data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the server with concurrently
CMD ["npm", "run", "start:docker"] 
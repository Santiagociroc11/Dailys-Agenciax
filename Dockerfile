# Stage 1: Build the application
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Set build-time arguments
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG TELEGRAM_BOT_TOKEN


ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN

# Build the frontend
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine AS final

WORKDIR /app

# Copy package.json to install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

    # Copy built frontend from build stage
    COPY --from=builder /app/dist ./dist
    
    # Copy server files
    COPY --from=builder /app/server.ts ./dist/
    COPY --from=builder /app/api ./dist/api
    
    # Copy Telegram bot files
    COPY --from=builder /app/telegram-bot ./telegram-bot  

# Expose port
EXPOSE 3000

# Start both the server and the Telegram bot
CMD ["sh", "-c", "cd telegram-bot && npm install && node bot.js & node dist/server/server.js"]
# Stage 1: Build the application
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Set build-time arguments
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Build the frontend
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine AS final

WORKDIR /app

# Copy package.json to install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend from build stage
COPY --from=build /app/dist ./dist

# Copy server files
COPY --from=build /app/server.ts ./dist/
COPY --from=build /app/api ./dist/api

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"] 
# Stage 1: Build the Node.js frontend and server
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Final runtime image (Python + Node)
FROM python:3.12-slim
WORKDIR /app

# Install Node.js in the Python image
RUN apt-get update && apt-get install -y curl build-essential && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built Node app and Python source
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY agentarmor/ ./agentarmor/

# Start the unified Node.js server (which spawns Python internally)
# Railway provides $PORT. Our server.ts listens on process.env.PORT || 3000
CMD ["npm", "run", "start"]

# Use Node.js 18 slim as base
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    rclone \
    && rm -rf /var/lib/apt/lists/*

# Install Alist
RUN curl -L https://github.com/alist-org/alist/releases/latest/download/alist-linux-amd64.tar.gz -o alist.tar.gz \
    && tar -zxvf alist.tar.gz \
    && mv alist /usr/bin/alist \
    && rm alist.tar.gz

# Set working directory
WORKDIR /app

# Copy backend dependencies and install
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy the rest of the application
COPY . .

# Ensure scripts are executable
RUN chmod +x start.sh

# Alist config setup (using port 5244 internal)
RUN mkdir -p /app/data

# Default port for Hugging Face Spaces
ENV PORT=7860
EXPOSE 7860

# Start with our script
CMD ["./start.sh"]

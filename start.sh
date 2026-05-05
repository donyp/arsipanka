#!/bin/bash

# Ensure config data is injected from Environment Variables (Secrets)
if [ -n "$RCLONE_CONFIG_DATA" ]; then
    echo "Injecting rclone config from Secrets..."
    echo "$RCLONE_CONFIG_DATA" > /app/rclone.conf
fi

# Start Alist in the background
echo "Starting Alist server..."
if [ -n "$ALIST_ADMIN_PASSWORD" ]; then
    echo "Setting Alist admin password..."
    alist admin set "$ALIST_ADMIN_PASSWORD" --data /app/data
fi
alist server --data /app/data &

# Setup Alist Storages via API (runs in background but has internal retry logic)
echo "Running Alist API setup..."
node setup_alist.js &


# Start Node.js backend
echo "Starting Node.js backend on port $PORT..."
node backend/server.js

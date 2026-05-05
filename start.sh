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


# Give Alist time to start
sleep 5

# Start Node.js backend
echo "Starting Node.js backend on port $PORT..."
node backend/server.js

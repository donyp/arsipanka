#!/bin/bash

# Start Alist in the background
echo "Starting Alist server..."
alist server --data /app/data &

# Give Alist time to start
sleep 5

# Start Node.js backend
echo "Starting Node.js backend on port $PORT..."
node backend/server.js

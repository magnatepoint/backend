#!/bin/bash
# Start Redis server for Celery

# Check if Redis is already running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is already running"
    exit 0
fi

# Start Redis
echo "🚀 Starting Redis server..."
redis-server --daemonize yes

# Wait a moment for Redis to start
sleep 1

# Verify Redis is running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis started successfully"
else
    echo "❌ Failed to start Redis"
    exit 1
fi


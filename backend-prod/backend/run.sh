#!/bin/bash

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down services..."
    # Kill Celery worker if running
    if [ ! -z "$CELERY_PID" ]; then
        kill $CELERY_PID 2>/dev/null
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check and start Redis
echo "🔴 Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is already running"
else
    echo "🚀 Starting Redis server..."
    redis-server --daemonize yes
    sleep 1
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis started successfully"
    else
        echo "❌ Failed to start Redis. Continuing anyway..."
    fi
fi

# Start Celery Worker
echo "🌿 Starting Celery worker..."
celery -A celery_app worker --loglevel=info --concurrency=4 &
CELERY_PID=$!
sleep 2

# Check if Celery started
if ps -p $CELERY_PID > /dev/null; then
    echo "✅ Celery worker started (PID: $CELERY_PID)"
else
    echo "⚠️  Celery worker may have failed to start"
fi

# Start FastAPI Server
echo "🚀 Starting FastAPI server..."
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000


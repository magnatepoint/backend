#!/bin/bash
set -e

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down services..."
    # Kill Celery worker if running
    if [ ! -z "$CELERY_PID" ]; then
        kill $CELERY_PID 2>/dev/null || true
    fi
    # Stop Redis if we started it
    if [ ! -z "$REDIS_PID" ]; then
        kill $REDIS_PID 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Start Redis
echo "🔴 Starting Redis..."
redis-server --daemonize yes --protected-mode no
REDIS_PID=$(pgrep -f "redis-server")
sleep 1

# Verify Redis is running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis started successfully (PID: $REDIS_PID)"
else
    echo "❌ Failed to start Redis"
    exit 1
fi

# Start Celery Worker in background
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

# Start FastAPI Server (foreground - this keeps container alive)
echo "🚀 Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 7000


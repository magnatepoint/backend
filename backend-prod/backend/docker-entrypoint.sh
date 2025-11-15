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
# Create Redis config to disable protected mode and bind to all interfaces
mkdir -p /etc/redis
cat > /etc/redis/redis.conf <<EOF
bind 0.0.0.0
protected-mode no
port 6379
daemonize yes
EOF

# Start Redis with config
redis-server /etc/redis/redis.conf
REDIS_PID=$(pgrep -f "redis-server" | head -1)

# Wait for Redis to be ready (with retries)
echo "⏳ Waiting for Redis to be ready..."
for i in {1..10}; do
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis started successfully (PID: $REDIS_PID)"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ Failed to start Redis after 10 attempts"
        exit 1
    fi
    sleep 1
done

# Verify Redis is accessible
redis-cli ping
echo "✅ Redis is ready and responding"

# Start Celery Worker in background
echo "🌿 Starting Celery worker..."
celery -A celery_app worker --loglevel=info --concurrency=4 &
CELERY_PID=$!
sleep 3

# Check if Celery started
if ps -p $CELERY_PID > /dev/null; then
    echo "✅ Celery worker started (PID: $CELERY_PID)"
else
    echo "⚠️  Celery worker may have failed to start"
fi

# Start FastAPI Server (foreground - this keeps container alive)
echo "🚀 Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 7000


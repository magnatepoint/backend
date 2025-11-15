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
# Check if Redis is already running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is already running"
    REDIS_PID=$(pgrep -f "redis-server" | head -1)
else
    # Create Redis config to disable protected mode and bind to all interfaces
    mkdir -p /etc/redis
    cat > /etc/redis/redis.conf <<EOF
bind 0.0.0.0
protected-mode no
port 6379
daemonize yes
pidfile /var/run/redis/redis-server.pid
logfile /var/log/redis/redis-server.log
EOF
    
    # Create necessary directories
    mkdir -p /var/run/redis /var/log/redis
    chmod 755 /var/run/redis /var/log/redis
    
    # Start Redis with config
    echo "🚀 Launching Redis server..."
    redis-server /etc/redis/redis.conf
    
    # Wait for Redis to be ready (with retries)
    echo "⏳ Waiting for Redis to be ready..."
    REDIS_PID=""
    for i in {1..15}; do
        REDIS_PID=$(pgrep -f "redis-server" | head -1)
        if [ ! -z "$REDIS_PID" ] && redis-cli ping > /dev/null 2>&1; then
            echo "✅ Redis started successfully (PID: $REDIS_PID)"
            break
        fi
        if [ $i -eq 15 ]; then
            echo "❌ Failed to start Redis after 15 attempts"
            echo "Checking Redis logs..."
            tail -20 /var/log/redis/redis-server.log 2>/dev/null || echo "No Redis logs found"
            exit 1
        fi
        sleep 1
    done
fi

# Final verification
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready and responding to ping"
else
    echo "❌ Redis is not responding"
    exit 1
fi

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


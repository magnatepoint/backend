#!/bin/bash
# Don't use set -e, handle errors manually to ensure all services start

# Log that entrypoint script is running
echo "=========================================="
echo "🚀 Docker Entrypoint Script Starting..."
echo "=========================================="

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
    
    # Start Redis with config (in foreground first to check for errors)
    echo "🚀 Launching Redis server..."
    redis-server /etc/redis/redis.conf 2>&1 &
    REDIS_START_PID=$!
    
    # Wait a moment for Redis to start
    sleep 2
    
    # Wait for Redis to be ready (with retries)
    echo "⏳ Waiting for Redis to be ready..."
    REDIS_PID=""
    for i in {1..15}; do
        REDIS_PID=$(pgrep -f "redis-server" | head -1)
        if [ ! -z "$REDIS_PID" ]; then
            # Try to ping Redis
            if redis-cli -h localhost ping > /dev/null 2>&1; then
                echo "✅ Redis started successfully (PID: $REDIS_PID)"
                break
            fi
        fi
        if [ $i -eq 15 ]; then
            echo "❌ Failed to start Redis after 15 attempts"
            echo "Checking if Redis process exists..."
            ps aux | grep redis || echo "No Redis process found"
            echo "Checking Redis logs..."
            tail -20 /var/log/redis/redis-server.log 2>/dev/null || echo "No Redis logs found"
            echo "Trying to start Redis in foreground to see errors..."
            redis-server /etc/redis/redis.conf --daemonize no &
            sleep 2
            exit 1
        fi
        echo "  Attempt $i/15: Redis not ready yet, waiting..."
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


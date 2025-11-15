#!/bin/bash
# Setup Redis on Ubuntu server for Celery workers

echo "🔴 Setting up Redis on Ubuntu server..."

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "📦 Installing Redis..."
    sudo apt-get update
    sudo apt-get install -y redis-server
else
    echo "✅ Redis is already installed"
fi

# Check if Redis is running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is already running"
else
    echo "🚀 Starting Redis service..."
    sudo systemctl start redis-server
    sudo systemctl enable redis-server  # Auto-start on boot
    sleep 2
    
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis started successfully"
    else
        echo "❌ Failed to start Redis"
        exit 1
    fi
fi

# Check Redis status
echo ""
echo "📊 Redis Status:"
sudo systemctl status redis-server --no-pager -l | head -10

echo ""
echo "✅ Redis setup complete!"
echo ""
echo "To verify Redis is working:"
echo "  redis-cli ping  # Should return PONG"
echo ""
echo "To check Redis is listening on localhost:"
echo "  sudo netstat -tlnp | grep 6379"
echo "  # Should show: 127.0.0.1:6379"


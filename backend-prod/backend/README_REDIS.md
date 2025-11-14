# Redis and Celery Setup

## Quick Start

### Option 1: Local Redis (Development)

If your `REDIS_URL` is set to `redis://localhost:6379/0`:

```bash
# Start Redis
redis-server --daemonize yes

# Or use the startup script
./start_redis.sh

# Start Celery worker
celery -A celery_app worker --loglevel=info --concurrency=4

# Start backend (will auto-detect Redis)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 7000
```

### Option 2: Remote Redis (Production)

If your `REDIS_URL` points to a remote server (e.g., `redis://192.168.68.113:6379/0`):

1. **On the remote server** (`192.168.68.113`):
   ```bash
   # Install Redis (if not installed)
   sudo apt-get update
   sudo apt-get install redis-server
   
   # Start Redis
   sudo systemctl start redis-server
   sudo systemctl enable redis-server  # Auto-start on boot
   
   # Check if Redis is running
   redis-cli ping  # Should return "PONG"
   ```

2. **Configure Redis to accept remote connections** (if needed):
   ```bash
   # Edit Redis config
   sudo nano /etc/redis/redis.conf
   
   # Change:
   # bind 127.0.0.1
   # to:
   # bind 0.0.0.0
   
   # Restart Redis
   sudo systemctl restart redis-server
   ```

3. **On your backend server**, update `.env`:
   ```env
   REDIS_URL=redis://192.168.68.113:6379/0
   CELERY_BROKER_URL=redis://192.168.68.113:6379/0
   CELERY_RESULT_BACKEND=redis://192.168.68.113:6379/0
   ```

### Option 3: Use All-in-One Startup Script

```bash
./run.sh
```

This script will:
- Check if Redis is running (local only)
- Start Redis if not running (local only)
- Start Celery worker
- Start FastAPI server

## Environment Variables

Set these in your `.env` file:

```env
# For local Redis
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# For remote Redis
REDIS_URL=redis://192.168.68.113:6379/0
CELERY_BROKER_URL=redis://192.168.68.113:6379/0
CELERY_RESULT_BACKEND=redis://192.168.68.113:6379/0
```

## Troubleshooting

### Connection Refused Error

If you see `Error 111 connecting to 192.168.68.113:6379. Connection refused`:

1. **Check if Redis is running on the remote server:**
   ```bash
   ssh user@192.168.68.113
   redis-cli ping
   ```

2. **Check Redis port is open:**
   ```bash
   telnet 192.168.68.113 6379
   ```

3. **Check firewall rules:**
   ```bash
   sudo ufw allow 6379/tcp
   ```

### Fallback to Sync Processing

If Redis is not available, the backend will automatically fall back to synchronous processing. This means:
- ✅ Excel/PDF uploads will still work
- ⚠️  Large files may timeout (no background processing)
- ⚠️  No parallel processing

## Production Recommendations

1. **Use a dedicated Redis server** for production
2. **Set up Redis persistence** (RDB or AOF)
3. **Configure Redis password** for security
4. **Use Redis Sentinel** for high availability
5. **Monitor Redis** with tools like RedisInsight

## Security Note

If exposing Redis to a network:
- Set a password: `requirepass yourpassword`
- Use firewall rules to restrict access
- Consider using SSL/TLS for Redis connections


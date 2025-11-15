# 🚨 URGENT: Backend Server Down (502 Bad Gateway)

## Problem
Your production backend at `https://backend.mallaapp.org` is returning **502 Bad Gateway** errors.

## Errors Seen
```
GET https://backend.mallaapp.org/api/spendsense/trends?period=3months net::ERR_FAILED 502
GET https://backend.mallaapp.org/api/spendsense/by-category?period=month net::ERR_FAILED 502
GET https://backend.mallaapp.org/api/spendsense/stats?period=month net::ERR_FAILED 502
GET https://backend.mallaapp.org/api/transactions?skip=0&limit=20 net::ERR_FAILED 502
GET https://backend.mallaapp.org/api/spendsense/insights net::ERR_FAILED 502
```

## Root Cause
The backend server process has crashed or stopped running.

## Solution: Restart Backend Server

### Step 1: SSH to Your Production Server
```bash
ssh your-username@your-server-ip
```

### Step 2: Navigate to Backend Directory
```bash
cd /path/to/backend-prod/backend
```

### Step 3: Check Server Status
```bash
# If using Docker:
docker-compose ps

# If using PM2:
pm2 status

# If using systemd:
systemctl status monytix-backend
```

### Step 4: Restart the Server

**Option A: Docker (Most Likely)**
```bash
# Pull latest changes
git pull origin main

# Restart backend
docker-compose restart backend

# Or rebuild if needed
docker-compose down
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

**Option B: PM2**
```bash
# Pull latest changes
git pull origin main

# Restart
pm2 restart monytix-backend

# Check logs
pm2 logs monytix-backend
```

**Option C: Systemd**
```bash
# Pull latest changes
git pull origin main

# Restart
sudo systemctl restart monytix-backend

# Check logs
sudo journalctl -u monytix-backend -f
```

**Option D: Manual (Uvicorn)**
```bash
# Pull latest changes
git pull origin main

# Kill existing process
pkill -f uvicorn

# Start server
cd backend-prod/backend
source venv/bin/activate  # or your virtual environment
uvicorn app.main:app --host 0.0.0.0 --port 7000 --reload
```

### Step 5: Verify Server is Running
```bash
# Test health endpoint
curl https://backend.mallaapp.org/

# Should return: {"message":"Welcome to Monytix API"}
```

### Step 6: Check Frontend
Once backend is running, refresh your frontend at `https://mvp.monytix.ai` - all errors should be gone.

---

## Common Issues

### Issue: Port Already in Use
```bash
# Find process using port 7000
lsof -i :7000

# Kill it
kill -9 <PID>
```

### Issue: Environment Variables Missing
```bash
# Make sure .env file exists
ls -la .env

# If missing, copy from template
cp .env.production .env
```

### Issue: Database Connection Failed
```bash
# Check PostgreSQL connection
psql -h your-db-host -U your-db-user -d your-db-name

# Check MongoDB connection
mongosh "your-mongodb-uri"
```

### Issue: Redis Not Running
```bash
# Start Redis
redis-server

# Or if using Docker
docker-compose up -d redis
```

---

## Prevention: Auto-Restart on Crash

### Using PM2 (Recommended)
```bash
# Install PM2
npm install -g pm2

# Start with auto-restart
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 7000" --name monytix-backend

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

### Using Systemd
Create `/etc/systemd/system/monytix-backend.service`:
```ini
[Unit]
Description=Monytix Backend API
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/backend-prod/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 7000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable monytix-backend
sudo systemctl start monytix-backend
```

---

## Monitoring

### Check Server Health
```bash
# Create a cron job to check health every 5 minutes
*/5 * * * * curl -f https://backend.mallaapp.org/ || systemctl restart monytix-backend
```

### Setup Alerts
Use services like:
- **UptimeRobot** (free)
- **Pingdom**
- **StatusCake**

---

## Next Steps

1. **Restart your backend server** using one of the methods above
2. **Verify it's running** with `curl https://backend.mallaapp.org/`
3. **Refresh frontend** at `https://mvp.monytix.ai`
4. **Setup auto-restart** to prevent future crashes

**The frontend UI improvements are complete. The only issue is the backend server being down.**


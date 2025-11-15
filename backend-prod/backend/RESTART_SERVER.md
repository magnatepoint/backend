# 🚨 URGENT: Backend Server Restart Required

## Current Status

❌ **Backend Server is DOWN** (502 Bad Gateway)  
✅ **Database Migration Complete** (OAuth columns added)  
✅ **Code Changes Pushed to GitHub**  

## Why Server is Down

The server crashed because it tried to query database columns that didn't exist yet. Now that the migration is complete, a simple restart will fix everything.

---

## How to Restart (Choose Your Method)

### Method 1: Docker Compose (Recommended)

```bash
# SSH to your production server
ssh your-server-user@your-server-ip

# Navigate to backend directory
cd /path/to/backend/backend-prod/backend

# Pull latest changes
git pull origin main

# Copy production credentials
cp .env.production .env

# Restart the backend container
docker-compose restart backend

# Check if it's running
docker-compose ps
docker-compose logs -f backend
```

### Method 2: Docker Commands

```bash
# SSH to server
ssh your-server-user@your-server-ip

# Find the container
docker ps -a | grep monytix

# Restart the container
docker restart monytix-backend

# Check logs
docker logs -f monytix-backend
```

### Method 3: Rebuild (If restart doesn't work)

```bash
# SSH to server
ssh your-server-user@your-server-ip

# Navigate to backend directory
cd /path/to/backend/backend-prod/backend

# Pull latest changes
git pull origin main

# Copy production credentials
cp .env.production .env

# Stop and remove old container
docker-compose down

# Rebuild and start
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

### Method 4: PM2 (If not using Docker)

```bash
# SSH to server
ssh your-server-user@your-server-ip

# Navigate to backend directory
cd /path/to/backend/backend-prod/backend

# Pull latest changes
git pull origin main

# Restart with PM2
pm2 restart backend

# Check status
pm2 status
pm2 logs backend
```

### Method 5: Systemd Service (If using systemd)

```bash
# SSH to server
ssh your-server-user@your-server-ip

# Restart service
sudo systemctl restart backend

# Check status
sudo systemctl status backend

# View logs
sudo journalctl -u backend -f
```

---

## After Restart - Verify It's Working

### 1. Check Server Health

```bash
# Test if server is responding
curl https://backend.mallaapp.org/

# Should return: {"message":"Welcome to Monytix API"}
```

### 2. Check API Documentation

Visit: https://backend.mallaapp.org/docs

Should see:
- ✅ Gmail OAuth endpoints
- ✅ Admin endpoints
- ✅ All other endpoints

### 3. Test Gmail OAuth

```bash
# Test OAuth URL endpoint
curl https://backend.mallaapp.org/api/gmail/oauth/url?user_id=test

# Should return a Google OAuth URL
```

### 4. Test in Frontend

1. Go to https://mvp.monytix.ai
2. All API calls should work (no more 502 errors)
3. Gmail connection should work
4. PDF upload should work

---

## Common Issues & Solutions

### Issue: "Container keeps restarting"

**Solution**: Check logs for errors

```bash
docker logs monytix-backend --tail 100
```

### Issue: "Port 7000 already in use"

**Solution**: Kill the process using port 7000

```bash
# Find process
lsof -i :7000

# Kill it
kill -9 <PID>

# Restart container
docker-compose up -d
```

### Issue: "Database connection failed"

**Solution**: Check .env file has correct credentials

```bash
# Make sure .env exists and has correct values
cat .env | grep POSTGRES_URL
cat .env | grep MONGODB_URI

# Copy from .env.production if needed
cp .env.production .env
```

### Issue: "Module not found errors"

**Solution**: Rebuild the container

```bash
docker-compose down
docker-compose up -d --build
```

---

## Quick Checklist

- [ ] SSH to production server
- [ ] Navigate to backend directory
- [ ] Pull latest changes (`git pull origin main`)
- [ ] Copy credentials (`cp .env.production .env`)
- [ ] Restart server (use method above)
- [ ] Check logs for errors
- [ ] Test server health (`curl https://backend.mallaapp.org/`)
- [ ] Test frontend (https://mvp.monytix.ai)
- [ ] Verify Gmail connection works
- [ ] Verify PDF upload works

---

## Need Help?

If you're not sure how to access your server or which method to use, please provide:

1. **Hosting Provider**: (e.g., DigitalOcean, AWS, Heroku, etc.)
2. **Server Access**: Do you have SSH access?
3. **Deployment Method**: Docker, PM2, systemd, or other?
4. **Server IP/Hostname**: (if you have SSH access)

---

## Expected Result After Restart

✅ Server responds to requests  
✅ No more 502 Bad Gateway errors  
✅ Gmail OAuth endpoints work  
✅ PDF upload works  
✅ All frontend API calls succeed  


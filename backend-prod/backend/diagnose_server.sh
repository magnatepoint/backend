#!/bin/bash

# Server Diagnostic Script
# Run this on your production server to diagnose issues

echo "================================================================================"
echo "Monytix Backend Server Diagnostic"
echo "================================================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on server
echo "1. Server Information"
echo "--------------------------------------------------------------------------------"
echo "Hostname: $(hostname)"
echo "OS: $(uname -s)"
echo "Date: $(date)"
echo ""

# Check Docker
echo "2. Docker Status"
echo "--------------------------------------------------------------------------------"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker is installed"
    docker --version
    echo ""
    
    # Check if container is running
    if docker ps | grep -q monytix-backend; then
        echo -e "${GREEN}✓${NC} Backend container is running"
        docker ps | grep monytix-backend
    else
        echo -e "${RED}✗${NC} Backend container is NOT running"
        echo ""
        echo "Checking stopped containers..."
        docker ps -a | grep monytix-backend
    fi
else
    echo -e "${YELLOW}!${NC} Docker is not installed or not in PATH"
fi
echo ""

# Check port 7000
echo "3. Port 7000 Status"
echo "--------------------------------------------------------------------------------"
if command -v lsof &> /dev/null; then
    if lsof -i :7000 &> /dev/null; then
        echo -e "${GREEN}✓${NC} Port 7000 is in use"
        lsof -i :7000
    else
        echo -e "${RED}✗${NC} Port 7000 is NOT in use (server not running)"
    fi
elif command -v netstat &> /dev/null; then
    if netstat -tuln | grep -q :7000; then
        echo -e "${GREEN}✓${NC} Port 7000 is in use"
        netstat -tuln | grep :7000
    else
        echo -e "${RED}✗${NC} Port 7000 is NOT in use (server not running)"
    fi
else
    echo -e "${YELLOW}!${NC} Cannot check port status (lsof/netstat not available)"
fi
echo ""

# Check if backend directory exists
echo "4. Backend Directory"
echo "--------------------------------------------------------------------------------"
if [ -f "docker-compose.yml" ]; then
    echo -e "${GREEN}✓${NC} Found docker-compose.yml in current directory"
    pwd
elif [ -f "../docker-compose.yml" ]; then
    echo -e "${YELLOW}!${NC} Found docker-compose.yml in parent directory"
    cd ..
    pwd
else
    echo -e "${RED}✗${NC} docker-compose.yml not found"
    echo "Please run this script from the backend directory"
fi
echo ""

# Check .env file
echo "5. Environment Configuration"
echo "--------------------------------------------------------------------------------"
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    echo "Checking required variables..."
    
    if grep -q "POSTGRES_URL" .env; then
        echo -e "${GREEN}✓${NC} POSTGRES_URL is set"
    else
        echo -e "${RED}✗${NC} POSTGRES_URL is missing"
    fi
    
    if grep -q "MONGODB_URI" .env; then
        echo -e "${GREEN}✓${NC} MONGODB_URI is set"
    else
        echo -e "${RED}✗${NC} MONGODB_URI is missing"
    fi
    
    if grep -q "GMAIL_CLIENT_ID" .env; then
        echo -e "${GREEN}✓${NC} GMAIL_CLIENT_ID is set"
    else
        echo -e "${RED}✗${NC} GMAIL_CLIENT_ID is missing"
    fi
else
    echo -e "${RED}✗${NC} .env file does not exist"
    if [ -f ".env.production" ]; then
        echo -e "${YELLOW}!${NC} .env.production exists - you should copy it to .env"
        echo "Run: cp .env.production .env"
    fi
fi
echo ""

# Check recent logs
echo "6. Recent Docker Logs (last 20 lines)"
echo "--------------------------------------------------------------------------------"
if docker ps -a | grep -q monytix-backend; then
    docker logs monytix-backend --tail 20 2>&1
else
    echo -e "${YELLOW}!${NC} Container not found"
fi
echo ""

# Test server connectivity
echo "7. Server Connectivity Test"
echo "--------------------------------------------------------------------------------"
echo "Testing localhost:7000..."
if command -v curl &> /dev/null; then
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:7000/ | grep -q "200"; then
        echo -e "${GREEN}✓${NC} Server is responding on localhost:7000"
    else
        echo -e "${RED}✗${NC} Server is NOT responding on localhost:7000"
    fi
else
    echo -e "${YELLOW}!${NC} curl not available"
fi
echo ""

# Summary and recommendations
echo "================================================================================"
echo "Summary & Recommendations"
echo "================================================================================"
echo ""

if docker ps | grep -q monytix-backend && lsof -i :7000 &> /dev/null; then
    echo -e "${GREEN}✓ Server appears to be running${NC}"
    echo ""
    echo "If you're still seeing 502 errors, try:"
    echo "  1. Check nginx/reverse proxy configuration"
    echo "  2. Check firewall rules"
    echo "  3. Restart the container: docker-compose restart backend"
else
    echo -e "${RED}✗ Server is NOT running${NC}"
    echo ""
    echo "To fix this, run:"
    echo "  1. cd /path/to/backend/backend-prod/backend"
    echo "  2. git pull origin main"
    echo "  3. cp .env.production .env  (if .env doesn't exist)"
    echo "  4. docker-compose up -d --build"
    echo "  5. docker-compose logs -f backend"
fi

echo ""
echo "================================================================================"


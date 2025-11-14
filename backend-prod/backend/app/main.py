from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, status, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response
from typing import Optional, Literal
from datetime import date
import uvicorn
import os
from config import settings
from app.routers import transactions as transactions_router
from app.routers import ml as ml_router
from app.routers import auth as auth_router
from app.core.websocket_manager import websocket_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Starting Monytix API...")
    
    # Check Redis availability
    try:
        import redis
        from config import settings
        redis_url = settings.redis_url.replace("redis://", "").split("/")[0]
        if ":" in redis_url:
            host, port = redis_url.split(":")
            port = int(port)
        else:
            host = redis_url
            port = 6379
        
        r = redis.Redis(host=host, port=port, socket_connect_timeout=2)
        r.ping()
        print(f"✅ Redis is running at {host}:{port}")
    except Exception as e:
        print(f"⚠️  Redis not available at {host}:{port}: {e}")
        print("   To enable Celery workers:")
        if host == "localhost" or host == "127.0.0.1":
            print("   - Run: redis-server --daemonize yes")
            print("   - Or use: ./start_redis.sh")
        else:
            print(f"   - Start Redis on {host}:6379")
            print("   - Or update REDIS_URL/CELERY_BROKER_URL in .env to use localhost")
        print("   Background processing will use sync fallback until Redis is available.")
    
    # Check Celery worker availability (optional)
    try:
        from celery import current_app
        # Try to inspect active workers
        inspect = current_app.control.inspect()
        active_workers = inspect.active()
        if active_workers:
            print(f"✅ Celery workers available: {len(active_workers)} worker(s)")
        else:
            print("⚠️  No active Celery workers found. Background processing will use sync fallback.")
    except Exception as e:
        print(f"⚠️  Celery not available: {e}")
        print("   Background processing will use sync fallback.")
    
    # Initialize database tables
    try:
        from app.database.postgresql import init_db
        init_db()
        print("✅ Database tables initialized")
    except Exception as e:
        print(f"⚠️  Database initialization warning: {e}")
        print("   Tables may be created on-demand...")
    
    # Initialize MongoDB connection
    try:
        from app.database.mongodb import connect_to_mongo, close_mongo_connection
        await connect_to_mongo()
    except Exception as e:
        print(f"⚠️  MongoDB connection failed: {e}")
        print("   Continuing without MongoDB...")
    yield
    # Shutdown
    try:
        from app.database.mongodb import close_mongo_connection
        await close_mongo_connection()
    except:
        pass
    print("👋 Shutting down Monytix API...")


app = FastAPI(
    title="Monytix API",
    description="Fintech backend for transaction processing and ML insights",
    version="1.0.0",
    lifespan=lifespan,
    root_path=""  # Don't use root_path - let Cloudflare handle it
)

# Middleware to trust proxy headers and fix redirects
class ProxyFixMiddleware(BaseHTTPMiddleware):
    """Middleware to trust proxy headers (X-Forwarded-Proto, etc.) and fix redirects"""
    async def dispatch(self, request: StarletteRequest, call_next):
        # Check if request is behind a proxy (Cloudflare)
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
        forwarded_host = request.headers.get("X-Forwarded-Host", "")
        
        # If behind Cloudflare with HTTPS, update the request URL scheme
        if forwarded_proto == "https":
            # Update the request URL to use HTTPS
            request.scope["scheme"] = "https"
            if forwarded_host:
                request.scope["headers"] = [
                    (k, v) if k != b"host" else (b"host", forwarded_host.encode())
                    for k, v in request.scope["headers"]
                ]
        
        response = await call_next(request)
        
        # Fix redirects to use HTTPS if behind Cloudflare
        # Check for Location header in any response (redirects)
        if forwarded_proto == "https" and "location" in response.headers:
            location = response.headers["location"]
            if location.startswith("http://"):
                # Replace HTTP with HTTPS in redirect location
                response.headers["location"] = location.replace("http://", "https://", 1)
        
        return response

# Add proxy fix middleware BEFORE CORS middleware
app.add_middleware(ProxyFixMiddleware)

# CORS Middleware
# Allow origins from environment or default to localhost for development
# Production: Set CORS_ORIGINS env var with comma-separated list like:
# CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:55860,https://mallaapp.org,https://app.mallaapp.org
default_origins = "http://localhost:5173,http://localhost:3000,http://localhost:55860,https://mallaapp.org,https://app.mallaapp.org,https://frontend.mallaapp.org,https://backend.mallaapp.org,http://backend.mallaapp.org,https://mvp.monytix.ai,https://f50d8254.monytix.pages.dev"
# Clean up origins: remove duplicates, trim whitespace, filter empty strings
raw_origins = os.getenv("CORS_ORIGINS", default_origins).split(",")
allowed_origins = list(set([origin.strip() for origin in raw_origins if origin.strip()]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600  # Cache preflight requests for 1 hour
)

# Exception handler to ensure CORS headers on unhandled errors
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Ensure CORS headers on HTTP exceptions"""
    origin = request.headers.get("origin")
    cors_origin = origin if origin in allowed_origins else (allowed_origins[0] if allowed_origins else "*")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600"
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure CORS headers are included in all error responses"""
    import traceback
    print(f"❌ Unhandled exception: {exc}")
    print(traceback.format_exc())
    
    origin = request.headers.get("origin")
    cors_origin = origin if origin in allowed_origins else (allowed_origins[0] if allowed_origins else "*")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600"
        }
    )

# Import additional routers
from app.routers import uploads as uploads_router
from app.routers import etl as etl_router
from app.routers import enrichment as enrichment_router
from app.routers import spendsense as spendsense_router
from app.routers import goals as goals_router
from app.routers import budgetpilot as budgetpilot_router
from app.routers import goalcompass as goalcompass_router
from app.routers import goalcoach as goalcoach_router
from app.routers import moneymoments as moneymoments_router
from app.routers import categories as categories_router

# Include routers
app.include_router(auth_router.router, prefix="/auth", tags=["Authentication"])

# Add route for /api/transactions (without trailing slash) that calls the same handler
# This avoids redirects which cause CORS issues
@app.get("/api/transactions", include_in_schema=False)
async def list_transactions_no_slash(
    request: Request,
    user = Depends(transactions_router.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    direction: Optional[Literal["debit", "credit"]] = None,
    sort: Optional[Literal["date_desc","date_asc","amt_desc","amt_asc"]] = "date_desc",
    search: Optional[str] = None
):
    """Handle /api/transactions without trailing slash - calls same handler as /api/transactions/"""
    # Import here to avoid circular dependency
    from app.routers.transactions import list_transactions
    return await list_transactions(
        user=user,
        skip=skip,
        limit=limit,
        start_date=start_date,
        end_date=end_date,
        category=category,
        subcategory=subcategory,
        direction=direction,
        sort=sort,
        search=search
    )

@app.post("/api/transactions", include_in_schema=False, status_code=201)
async def create_transaction_no_slash(
    payload: transactions_router.TransactionCreate,
    user: transactions_router.UserDep = Depends(transactions_router.get_current_user)
):
    """Handle POST /api/transactions without trailing slash."""
    from app.routers.transactions import create_transaction
    return await create_transaction(payload=payload, user=user)

@app.post("/api/goals", include_in_schema=False, status_code=201)
async def create_goal_no_slash(
    payload: goals_router.GoalIntake,
    user: goals_router.UserDep = Depends(goals_router.get_current_user)
):
    """Handle POST /api/goals without trailing slash."""
    from app.routers.goals import create_user_goal
    return await create_user_goal(payload=payload, user=user)

app.include_router(transactions_router.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(ml_router.router, prefix="/api/ml", tags=["ML"])
app.include_router(uploads_router.router, prefix="/api/upload", tags=["Uploads"])
app.include_router(etl_router.router, prefix="/api/etl", tags=["ETL Pipeline"])
app.include_router(enrichment_router.router, prefix="/api/enrichment", tags=["Enrichment"])
app.include_router(spendsense_router.router, prefix="/api/spendsense", tags=["SpendSense"])
app.include_router(goals_router.router, prefix="/api/goals", tags=["Goals"])
app.include_router(budgetpilot_router.router, prefix="/api/budgetpilot", tags=["BudgetPilot"])
app.include_router(goalcompass_router.router, prefix="/api/goalcompass", tags=["GoalCompass"])
app.include_router(goalcoach_router.router, prefix="/api/goalcoach", tags=["GoalCoach"])
app.include_router(moneymoments_router.router, prefix="/api/moneymoments", tags=["MoneyMoments"])
app.include_router(categories_router.router, prefix="/api", tags=["Categories"])


# Explicit OPTIONS handler for CORS preflight (backup to middleware)
@app.options("/{full_path:path}")
async def options_handler(request: Request, full_path: str):
    """Handle CORS preflight OPTIONS requests explicitly"""
    origin = request.headers.get("origin", "")
    
    # Check if origin is in allowed list (case-insensitive check for safety)
    cors_origin = None
    if origin:
        # Normalize origin (remove trailing slash, lowercase comparison)
        origin_normalized = origin.rstrip("/")
        for allowed in allowed_origins:
            if allowed.rstrip("/").lower() == origin_normalized.lower():
                cors_origin = origin
                break
    
    # If no match found, use first allowed origin or "*" (but "*" doesn't work with credentials)
    if not cors_origin:
        cors_origin = allowed_origins[0] if allowed_origins else "*"
    
    # Get requested headers from Access-Control-Request-Headers
    requested_headers = request.headers.get("access-control-request-headers", "*")
    
    return JSONResponse(
        content={},
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": requested_headers if requested_headers else "*",
            "Access-Control-Max-Age": "3600",
            "Vary": "Origin"
        }
    )

@app.get("/")
async def root():
    return {"message": "Monytix API is running", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/debug/db")
async def debug_database():
    """Debug endpoint to check database connectivity and schema"""
    from app.database.postgresql import SessionLocal
    from sqlalchemy import text
    
    session = SessionLocal()
    try:
        results = {
            "database_connected": True,
            "schemas": {},
            "tables": {}
        }
        
        # Check if spendsense schema exists
        schema_check = session.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.schemata 
                WHERE schema_name = 'spendsense'
            )
        """)).scalar()
        results["schemas"]["spendsense"] = schema_check
        
        if schema_check:
            # List tables in spendsense schema
            tables = session.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'spendsense'
                ORDER BY table_name
            """)).fetchall()
            results["tables"]["spendsense"] = [t[0] for t in tables]
            
            # Check key tables
            key_tables = ["txn_staging", "txn_fact", "txn_enriched", "dim_category"]
            for table in key_tables:
                exists = session.execute(text(f"""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_schema = 'spendsense' 
                        AND table_name = '{table}'
                    )
                """)).scalar()
                results["tables"][f"spendsense.{table}"] = exists
        
        # Check staging tables
        staging_tables = session.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name IN ('gmail_connections', 'upload_batch', 'transaction_staging')
            ORDER BY table_name
        """)).fetchall()
        results["tables"]["staging"] = [t[0] for t in staging_tables]
        
        return results
    except Exception as e:
        import traceback
        return {
            "database_connected": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
    finally:
        session.close()


# WebSocket endpoint for real-time updates
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back for now - can be extended for specific commands
            await websocket_manager.send_personal_message(f"Message: {data}", user_id)
    except WebSocketDisconnect:
        websocket_manager.disconnect(user_id)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True if settings.environment == "development" else False
    )


"""
Gmail OAuth Integration Endpoints
Handles Gmail account connection via OAuth
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import httpx
import uuid

from app.routers.auth import get_current_user, UserDep
from app.database.postgresql import SessionLocal
from app.models.etl_models import GmailAccount
from config import settings

router = APIRouter(prefix="/api/gmail", tags=["Gmail OAuth"])


class GmailConnectRequest(BaseModel):
    access_token: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None


class GmailOAuthExchangeRequest(BaseModel):
    code: str


@router.get("/oauth/url")
async def get_gmail_oauth_url(
    user: UserDep = Depends(get_current_user)
):
    """
    Get Gmail OAuth URL for user to authorize access
    """
    if not settings.gmail_client_id or not settings.gmail_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gmail OAuth not configured. Please set GMAIL_CLIENT_ID and GMAIL_REDIRECT_URI"
        )
    
    # Build OAuth URL
    oauth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.gmail_client_id}&"
        f"redirect_uri={settings.gmail_redirect_uri}&"
        f"response_type=code&"
        f"scope=https://www.googleapis.com/auth/gmail.readonly%20email%20profile&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={user.user_id}"
    )
    
    return {
        "url": oauth_url,
        "message": "Redirect user to this URL to authorize Gmail access"
    }


@router.post("/oauth/exchange")
async def exchange_gmail_code(
    body: GmailOAuthExchangeRequest,
    user: UserDep = Depends(get_current_user)
):
    """
    Exchange OAuth code for access token and create Gmail account connection
    """
    if not settings.gmail_client_id or not settings.gmail_client_secret or not settings.gmail_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gmail OAuth not configured"
        )
    
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": body.code,
                    "client_id": settings.gmail_client_id,
                    "client_secret": settings.gmail_client_secret,
                    "redirect_uri": settings.gmail_redirect_uri,
                    "grant_type": "authorization_code"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to exchange code: {response.text}"
                )
            
            token_data = response.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)
            
            # Get user info from Google
            user_info_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if user_info_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to get user info from Google"
                )
            
            user_info = user_info_response.json()
            email = user_info.get("email")
            display_name = user_info.get("name")
            
            # Create Gmail account connection
            session = SessionLocal()
            try:
                # Check if account already exists
                existing = session.query(GmailAccount).filter_by(
                    user_id=user.user_id,
                    email=email
                ).first()
                
                if existing:
                    # Update existing account
                    existing.access_token = access_token
                    existing.refresh_token = refresh_token
                    existing.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
                    existing.is_active = True
                    session.commit()
                    
                    return {
                        "message": "Gmail account reconnected successfully",
                        "status": "updated",
                        "connection_id": existing.id,
                        "email": email,
                        "scope": token_data.get("scope", ""),
                        "expires_in": expires_in,
                        "token_type": token_data.get("token_type", "Bearer"),
                        "has_refresh_token": refresh_token is not None
                    }
                else:
                    # Create new account
                    gmail_account = GmailAccount(
                        id=str(uuid.uuid4()),
                        user_id=user.user_id,
                        email=email,
                        display_name=display_name,
                        access_token=access_token,
                        refresh_token=refresh_token,
                        token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
                        is_active=True
                    )
                    session.add(gmail_account)
                    session.commit()
                    
                    return {
                        "message": "Gmail account connected successfully",
                        "status": "created",
                        "connection_id": gmail_account.id,
                        "email": email,
                        "scope": token_data.get("scope", ""),
                        "expires_in": expires_in,
                        "token_type": token_data.get("token_type", "Bearer"),
                        "has_refresh_token": refresh_token is not None
                    }
            finally:
                session.close()
                
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to connect to Google: {str(e)}"
            )


@router.post("/connect")
async def connect_gmail(
    body: GmailConnectRequest,
    user: UserDep = Depends(get_current_user)
):
    """
    Connect Gmail account (legacy endpoint for compatibility)
    """
    if not body.access_token or not body.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="access_token and email are required"
        )
    
    session = SessionLocal()
    try:
        # Check if account already exists
        existing = session.query(GmailAccount).filter_by(
            user_id=user.user_id,
            email=body.email
        ).first()
        
        if existing:
            # Update existing account
            existing.access_token = body.access_token
            existing.display_name = body.display_name or existing.display_name
            existing.is_active = True
            session.commit()
            
            return {
                "message": "Gmail account reconnected successfully",
                "status": "updated",
                "connection_id": existing.id,
                "email": body.email
            }
        else:
            # Create new account
            gmail_account = GmailAccount(
                id=str(uuid.uuid4()),
                user_id=user.user_id,
                email=body.email,
                display_name=body.display_name,
                access_token=body.access_token,
                is_active=True
            )
            session.add(gmail_account)
            session.commit()
            
            return {
                "message": "Gmail account connected successfully",
                "status": "created",
                "connection_id": gmail_account.id,
                "email": body.email
            }
    finally:
        session.close()


@router.get("/connections")
async def list_gmail_connections(
    user: UserDep = Depends(get_current_user)
):
    """
    List all Gmail connections for the user
    """
    session = SessionLocal()
    try:
        accounts = session.query(GmailAccount).filter_by(
            user_id=user.user_id
        ).all()
        
        return {
            "connections": [
                {
                    "id": acc.id,
                    "email": acc.email,
                    "display_name": acc.display_name,
                    "is_active": acc.is_active,
                    "sync_enabled": acc.is_active,
                    "last_sync_at": acc.last_sync_at.isoformat() if acc.last_sync_at else None,
                    "total_emails_fetched": 0,  # TODO: Track this
                    "total_transactions_extracted": 0,  # TODO: Track this
                    "created_at": acc.created_at.isoformat() if acc.created_at else None
                }
                for acc in accounts
            ]
        }
    finally:
        session.close()


@router.get("/status")
async def gmail_status(
    user: UserDep = Depends(get_current_user)
):
    """
    Get Gmail integration status for the user
    """
    session = SessionLocal()
    try:
        accounts = session.query(GmailAccount).filter_by(
            user_id=user.user_id,
            is_active=True
        ).all()
        
        last_sync = None
        if accounts:
            last_syncs = [acc.last_sync_at for acc in accounts if acc.last_sync_at]
            if last_syncs:
                last_sync = max(last_syncs)
        
        return {
            "active": len(accounts) > 0,
            "connected": len(accounts) > 0,
            "connection_count": len(accounts),
            "sync_enabled": any(acc.is_active for acc in accounts),
            "last_sync_at": last_sync.isoformat() if last_sync else None
        }
    finally:
        session.close()


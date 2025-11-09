# Monytix Frontend

## Prerequisites

Before running the app, you need to set up Supabase authentication.

## Environment Variables

Create a `.env.local` file in the `frontend` directory with the following variables:

```env
# Supabase Configuration
# Get these from your Supabase project dashboard:
# https://app.supabase.com/project/_/settings/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# OAuth Redirect URL (optional)
# Defaults to ${window.location.origin}/callback if not set
# Use this if you need a different redirect URL for OAuth callbacks
# VITE_OAUTH_REDIRECT_URL=http://localhost:5173/callback

# Backend API Configuration (optional)
# Defaults to https://backend.mallaapp.org if not set
# VITE_API_URL=https://backend.mallaapp.org
```

## Supabase Configuration

After setting up your environment variables, you need to configure OAuth redirect URLs in Supabase:

### 1. Configure Redirect URLs

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **Authentication** → **URL Configuration**
3. Add your redirect URLs to the **Redirect URLs** list:
   - For local development: `http://localhost:5173/callback`
   - For production: `https://your-domain.com/callback`
   - **Important:** 
     - The redirect URL must exactly match what you configure in Supabase, including the protocol (http/https) and port number.
     - **DO NOT** add the mobile app's custom URL scheme (`io.supabase.monytix://login-callback/`) here - that's only for mobile apps.
     - Only add HTTP/HTTPS URLs for the web frontend.

### 2. Enable Google OAuth Provider

1. Go to **Authentication** → **Providers**
2. Enable **Google** provider
3. Configure your Google OAuth credentials:
   - Get your **Google Client ID** and **Client Secret** from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Add your **Authorized redirect URIs** in Google Cloud Console:
     - `https://your-project.supabase.co/auth/v1/callback`
     - (Supabase handles the OAuth flow, so you only need to add the Supabase callback URL)
4. Copy your Google Client ID and Client Secret to Supabase

### 3. Enable Email/Password Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider (enabled by default)
3. Configure email templates if needed:
   - Go to **Authentication** → **Email Templates**
   - Customize confirmation and password reset emails

**Note:** The app uses `${window.location.origin}/callback` as the default redirect URL. You can override this by setting `VITE_OAUTH_REDIRECT_URL` in your `.env.local` file.

## Quick Start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Set up Supabase credentials
# Create frontend/.env.local with your Supabase URL and key

# Run development server
npm run dev
```

Access at: `http://localhost:5173`

---

## Navigation Flow

```
Login/Registration → Console Dashboard → SpendSense Analytics
```

### Pages

1. **Login** (`/login`) - Email/Password or Google OAuth authentication
2. **Console** (`/`) - Main dashboard
3. **SpendSense** (`/spendsense`) - Spending analytics
4. **BudgetRack** (`/budgetrack`) - Budget management
5. **MoneyMoments** (`/moneymoments`) - Transaction timeline

---

## Features

- ✅ React + TypeScript
- ✅ React Router (navigation)
- ✅ Supabase Authentication (Email/Password + Google OAuth)
- ✅ Tailwind CSS
- ✅ Recharts (charts)
- ✅ Lucide React (icons)
- ✅ shadcn/ui components

---

## Project Structure

```
src/
├── pages/
│   ├── Login.tsx
│   ├── Console.tsx
│   ├── SpendSense.tsx
│   ├── BudgetRack.tsx
│   └── MoneyMoments.tsx
├── components/
│   ├── Layout.tsx (Navigation sidebar)
│   └── Loading.tsx
├── context/
│   └── AuthContext.tsx (Supabase auth)
├── lib/
│   ├── api.ts (Backend API client)
│   └── supabase.ts (Supabase client)
└── App.tsx (Router configuration)
```

---

## SpendSense Page

**File:** `src/pages/SpendSense.tsx`

**Features:**
- Key metrics cards (Total Spending, Top Category, Budget Status)
- Category distribution (Pie Chart)
- Monthly trends (Bar Chart)
- AI insights panel
- Real-time data from backend API

**API Integration:**
```typescript
import { apiClient } from '../lib/api'

// Load data
const stats = await apiClient.getSpendingStats('month')
const categories = await apiClient.getSpendingByCategory('month')
const insights = await apiClient.getInsights()
const trends = await apiClient.getSpendingTrends('3months')
```

---

## Navigation

Click "SpendSense" in the sidebar to navigate from Console to analytics.

The Layout component wraps all pages and provides the navigation sidebar.

# Monytix MVP - Complete Tech Stack

## 📋 Project Overview
**Monytix** is a comprehensive fintech application for personal finance management, transaction tracking, goal planning, and spending analytics.

---

## 🎨 Frontend Stack

### Core Framework
- **React 19.2.0** - UI library
- **TypeScript 5.6.3** - Type safety
- **Vite 7.1.12** - Build tool & dev server
- **React Router DOM 7.1.12** - Client-side routing

### UI Libraries & Styling
- **Tailwind CSS 3.4.15** - Utility-first CSS framework
- **Framer Motion 12.23.24** - Animation library
- **Recharts 3.3.0** - Charting library (PieChart, LineChart, AreaChart, etc.)
- **React Day Picker 9.1.3** - Date picker component

### State Management & Context
- **React Context API** - Global state management
  - `AuthContext` - Authentication state
  - `ThemeContext` - Theme management
  - `ToastContext` - Toast notifications

### Custom Hooks
- `usePullToRefresh` - Pull-to-refresh functionality
- `useSwipe` - Swipe gestures

### Authentication
- **Supabase JS 2.76.1** - Authentication & user management
  - Google OAuth integration
  - Session management
  - JWT token handling

### Development Tools
- **ESLint 9.17.0** - Code linting
- **TypeScript ESLint** - TypeScript-specific linting
- **PostCSS 8.4.49** - CSS processing
- **Autoprefixer 10.4.20** - CSS vendor prefixing

---

## ⚙️ Backend Stack

### Core Framework
- **FastAPI 0.109.0** - Modern Python web framework
- **Uvicorn 0.27.0** - ASGI server
- **Python 3.12** - Programming language

### Task Queue & Background Processing
- **Celery 5.3.6** - Distributed task queue
- **Redis 5.0.1** - Message broker & result backend
  - Queue routing (ingest, categorize)
  - Task result storage

### Database Stack

#### PostgreSQL
- **SQLAlchemy 2.0.25** - ORM
- **psycopg2-binary 2.9.9** - PostgreSQL adapter (sync)
- **asyncpg 0.29.0** - PostgreSQL adapter (async)
- **Schemas**: 
  - `spendsense` - Transaction analytics
  - `goal` - Goal management
  - `goalcompass` - Goal tracking & insights
  - `budgetpilot` - Budget management
  - `moneymoments` - Behavioral signals
  - `enrichment` - Transaction enrichment
  - `production` - Core transaction data
  - `staging` - ETL staging tables

#### MongoDB
- **PyMongo 4.6.1** - MongoDB driver (sync)
- **Motor 3.3.2** - MongoDB driver (async)
- **MongoDB Atlas** - Cloud database
  - Raw transaction storage
  - Document-based data

### Authentication & Security
- **Supabase 2.3.4** - Authentication provider
- **python-jose[cryptography] 3.3.0** - JWT handling
- **passlib[bcrypt] 1.7.4** - Password hashing

### File Processing & ETL

#### PDF Processing
- **pdfplumber 0.10.4** - PDF text extraction
- **PyPDF2 3.0.1** - PDF manipulation

#### Excel/CSV Processing
- **pandas 2.1.4** - Data manipulation
- **openpyxl 3.1.2** - Excel .xlsx support
- **xlrd 2.0.1** - Legacy Excel .xls support

#### File Type Detection
- **python-magic 0.4.27** - MIME type detection

### Machine Learning
- **scikit-learn 1.4.1.post1** - ML algorithms
- **numpy 1.26.3** - Numerical computing

### Gmail Integration
- **google-api-python-client 2.111.0** - Gmail API client
- **google-auth 2.27.0** - OAuth authentication
- **google-auth-httplib2 0.2.0** - HTTP transport
- **google-auth-oauthlib 1.2.0** - OAuth flow

### Real-time Communication
- **WebSockets 12.0** - WebSocket support
- **python-socketio 5.11.0** - Socket.IO server

### Utilities
- **Pydantic 2.5.3** - Data validation
- **pydantic-settings 2.1.0** - Settings management
- **python-dotenv 1.0.0** - Environment variables
- **python-dateutil 2.8.2** - Date utilities
- **httpx <0.26.0** - HTTP client
- **anyio 4.2.0** - Async I/O utilities
- **python-multipart 0.0.6** - Form data parsing

---

## 🗄️ Database Architecture

### PostgreSQL Schemas

#### `spendsense` Schema
- Transaction analytics & insights
- Category aggregations
- Merchant analytics
- Spending trends
- Materialized views for performance

#### `goal` Schema
- User goals (`user_goals_master`)
- Goal progress tracking
- Goal allocations

#### `goalcompass` Schema
- Goal snapshots
- Risk assessment
- Monthly progress tracking

#### `budgetpilot` Schema
- Budget definitions
- Period-based budgets
- Budget deviations

#### `moneymoments` Schema
- Behavioral signals
- Spending patterns
- Anomaly detection

#### `enrichment` Schema
- Transaction categorization rules
- Merchant normalization
- Category mappings

#### `production` Schema
- Core transaction fact table
- Effective transaction view
- User accounts

#### `staging` Schema
- ETL staging tables
- Upload batches
- Transaction staging

### MongoDB Collections
- Raw transaction documents
- Unstructured data storage
- Event logs

---

## 🏗️ Architecture Patterns

### Backend Structure
```
backend-prod/backend/
├── app/
│   ├── main.py              # FastAPI application entry
│   ├── core/                # Core utilities (WebSocket manager)
│   ├── database/            # Database connections & setup
│   ├── models/              # SQLAlchemy models
│   ├── routers/             # API route handlers
│   ├── services/            # Business logic
│   ├── schemas/             # Pydantic schemas
│   ├── tasks/               # Celery tasks
│   └── workers/             # Celery workers
├── celery_app.py            # Celery configuration
├── config.py                # Settings management
├── migrations/              # SQL migration files
└── scripts/                 # Utility scripts
```

### Frontend Structure
```
frontend/
├── src/
│   ├── pages/               # Page components
│   ├── components/          # Reusable components
│   ├── context/             # React contexts
│   ├── hooks/               # Custom hooks
│   └── lib/                 # Utilities & API client
└── dist/                    # Production build
```

---

## 🔄 ETL Pipeline

### File Processing
- **CSV** - Direct parsing with pandas
- **Excel (.xlsx)** - openpyxl with auto-header detection
- **Excel (.xls)** - xlrd with legacy format support
- **PDF** - pdfplumber with text extraction & regex parsing

### Processing Flow
1. **Upload** → File validation & temporary storage
2. **Parse** → Bank-specific or generic parsing
3. **Normalize** → Column mapping & data standardization
4. **Categorize** → Rule-based categorization
5. **Stage** → Insert into staging table
6. **Validate** → Data quality checks
7. **Load** → Move to production tables

### Celery Workers
- `process_excel_etl` - Excel file processing
- `process_pdf_etl` - PDF file processing
- `process_csv_etl` - CSV file processing
- `parse_gmail_task` - Gmail message parsing
- `categorize_transactions_task` - Transaction categorization

---

## 🔐 Authentication & Authorization

### Authentication Flow
1. **Supabase Auth** - User authentication
2. **Google OAuth** - Social login
3. **JWT Tokens** - Session management
4. **Bearer Token** - API authentication

### Security Features
- CORS middleware with origin whitelisting
- JWT token validation
- Password hashing with bcrypt
- OAuth 2.0 for Gmail integration

---

## 📊 Key Features

### SpendSense
- Transaction analytics
- Category breakdowns
- Merchant insights
- Spending trends
- Anomaly detection
- Cash flow projections
- Budget deviations
- AI-powered spending advice

### GoalCompass
- Goal tracking
- Progress visualization
- Risk assessment
- Goal Coach (AI recommendations)
- What-if Simulator
- Monthly snapshots

### BudgetPilot
- Budget creation & management
- Period-based budgets
- Budget vs actual tracking
- Recommendations

### MoneyMoments
- Behavioral signals
- Spending patterns
- Anomaly detection
- Trait-based insights

### ETL Pipeline
- Multi-format file upload (CSV, XLS, XLSX, PDF)
- Gmail transaction extraction
- Bank-specific parsing
- Auto-categorization
- Background processing

---

## 🚀 Deployment & Infrastructure

### Containerization
- **Docker** - Container runtime
- **Docker Compose** - Multi-container orchestration
- **Dockerfile** - Backend image definition

### Services
- **Redis** - In-memory data store (Celery broker)
- **PostgreSQL** - Relational database
- **MongoDB Atlas** - Cloud document database
- **FastAPI** - API server (port 7000)
- **Celery Workers** - Background task processing

### Entrypoint Script
- `docker-entrypoint.sh` - Service orchestration
  - Starts Redis server
  - Starts Celery workers
  - Starts FastAPI server

### Environment Variables
- Database URLs (PostgreSQL, MongoDB)
- Redis configuration
- Supabase credentials
- Gmail API credentials
- CORS origins

---

## 📦 Key Dependencies Summary

### Frontend (package.json)
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^7.1.12",
  "@supabase/supabase-js": "^2.76.1",
  "recharts": "^3.3.0",
  "framer-motion": "^12.23.24",
  "tailwindcss": "^3.4.15",
  "typescript": "^5.6.3",
  "vite": "^7.1.12"
}
```

### Backend (requirements.txt)
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
celery==5.3.6
redis==5.0.1
sqlalchemy==2.0.25
psycopg2-binary==2.9.9
pymongo==4.6.1
pandas==2.1.4
pdfplumber==0.10.4
openpyxl==3.1.2
xlrd==2.0.1
scikit-learn==1.4.1.post1
google-api-python-client==2.111.0
```

---

## 🔧 Development Tools

### Version Control
- **Git** - Source control
- **GitHub** - Remote repository

### Code Quality
- **ESLint** - JavaScript/TypeScript linting
- **TypeScript** - Static type checking
- **Python type hints** - Type annotations

### Build Tools
- **Vite** - Frontend bundler
- **TypeScript Compiler** - Type checking & compilation
- **PostCSS** - CSS processing

---

## 📁 Project Statistics

### Backend
- **Python Files**: ~60+ files
- **Routers**: 17 API routers
- **Services**: 19 service modules
- **Models**: 7 model files
- **Workers**: 6 Celery workers
- **Migrations**: 17 SQL migration files

### Frontend
- **TypeScript/TSX Files**: 30+ components
- **Pages**: 7 main pages
- **Components**: 30+ reusable components
- **Hooks**: 2 custom hooks
- **Contexts**: 3 React contexts

---

## 🌐 API Endpoints Summary

### Core APIs
- `/api/transactions` - Transaction CRUD
- `/api/spendsense/*` - Spending analytics
- `/api/goals` - Goal management
- `/api/goalcompass/*` - Goal tracking
- `/api/goalcoach/*` - Goal coaching
- `/api/budgetpilot/*` - Budget management
- `/api/moneymoments/*` - Behavioral insights
- `/api/etl/*` - ETL operations
- `/api/categories` - Category management
- `/api/enrichment/*` - Data enrichment
- `/api/ml/*` - ML predictions
- `/auth/*` - Authentication

---

## 🔄 Data Flow

1. **User Upload** → File/Gmail → ETL Pipeline
2. **ETL Processing** → Parse → Normalize → Categorize
3. **Staging** → Validation → Production Tables
4. **Analytics** → Materialized Views → API Responses
5. **Frontend** → API Calls → React Components → UI

---

## 📝 Notes

- **Production URL**: `https://mvp.monytix.ai`
- **Backend URL**: `https://backend.mallaapp.org`
- **Development**: Local development on port 5173 (frontend) and 7000 (backend)
- **Database**: PostgreSQL for structured data, MongoDB for raw/unstructured data
- **Task Queue**: Redis + Celery for background processing
- **Authentication**: Supabase with Google OAuth

---

*Last Updated: 2025-01-14*


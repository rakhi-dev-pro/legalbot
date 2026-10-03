# 🚀 LegalBot Deployment & Setup Guide

This guide provides step-by-step instructions for deploying LegalBot using **Docker Compose** on Windows, Linux, or macOS.

---

## 📋 Prerequisites

Before deploying LegalBot, ensure your system has the following installed:

1. **Docker Desktop** (or Docker Engine + Docker Compose v2+)
   - Windows/Mac: Ensure Docker Desktop is running.
   - Recommended allocated resources: Minimum 8 GB RAM (12 GB+ recommended for local LLM inference).
2. **Git** (to clone/manage codebase).
3. **Python 3.11+** (Optional, only needed if running local test scripts outside Docker).

---

## 🛠️ Step-by-Step Installation

### Step 1: Model Setup

LegalBot uses the **IBM Granite 4.2 3B Instruct** model in GGUF format (`granite-4.2-3b-Q4_K_M.gguf`).

1. **Automatic Download via Docker Compose (Recommended)**:
   You don't need to manually download the model. On your first `docker compose up -d`, `llama.cpp` will automatically download `granite-4.2-3b-Q4_K_M.gguf` directly from Hugging Face into `./models/` and cache it permanently.

2. **Manual Placement (Optional)**:
   If preferred, place the model file in the `./models/` directory:
   ```text
   legalbot/
   └── models/
       └── granite-4.2-3b-Q4_K_M.gguf
   ```
   Direct download link: [ibm-granite/granite-4.2-3b-GGUF](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/blob/main/granite-4.2-3b-Q4_K_M.gguf)

---

### Step 2: Environment Configuration

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

**Sample `.env` contents:**
```env
# Database Credentials
POSTGRES_DB=legalbot
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=legalbot_secure_pass_2026
POSTGRES_PORT=5433

# Redis Configuration
REDIS_PORT=6379

# Local LLM Server Configuration
LLAMA_CPP_PORT=8080
LLM_HF_REPO=ibm-granite/granite-4.2-3b-GGUF
LLM_MODEL_FILE=granite-4.2-3b-Q4_K_M.gguf
LLM_CTX_SIZE=4096

# Backend Security
SECRET_KEY=super_secret_legalbot_jwt_key_2026_change_in_production
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Frontend Configuration
VITE_API_URL=https://localhost
```

---

### Step 3: Launch Containers with Docker Compose

To build and start all 6 microservices in detached mode, run:

```bash
docker compose up -d --build
```

#### Container Checklist:
| Container Name | Service | Access URL / Internal Port |
| :--- | :--- | :--- |
| `legalbot_proxy` | Nginx (HTTPS Proxy) | **https://localhost** (Ports 80/443) |
| `legalbot_frontend` | React 18 SPA | Internal: `3000` |
| `legalbot_backend` | FastAPI App | Internal: `8000` / Health: `/api/health` |
| `legalbot_db` | PostgreSQL 17 + pgvector | Host: `5433` / Internal: `5432` |
| `legalbot_redis` | Redis 7 | Host: `6379` / Internal: `6379` |
| `legalbot_llm` | llama.cpp Server | Host: `8080` / Internal: `8080` |

---

### Step 4: Accessing the Application

1. Open your web browser and navigate to: **https://localhost**
2. **Self-Signed SSL Certificate Notice**: Because Nginx generates a self-signed TLS certificate for local HTTPS, your browser will display a security warning (*"Your connection is not private"*).
   - Click **Advanced** -> **Proceed to localhost (unsafe)**.
3. **Default Admin Login**:
   - **Email**: `admin@legalbot.com`
   - **Password**: `password123`

---

## 🔧 Managing & Maintaining Deployment

### Viewing Real-Time Logs
```bash
# View all service logs
docker compose logs -f

# View backend API logs only
docker logs -f legalbot_backend

# View Nginx proxy logs
docker logs -f legalbot_proxy
```

### Restarting Services
```bash
# Restart backend service after code changes
docker compose restart backend

# Rebuild proxy and backend
docker compose up -d --build backend proxy
```

### Database Clean Reset & Default Seeding
To wipe test contracts, chunks, reports, and reset to clean state with default admin:
```bash
docker exec -e PYTHONPATH=/app legalbot_backend python scripts/reset_database.py
```

### Stopping the Stack
```bash
# Stop containers keeping database volumes intact
docker compose down

# Stop containers and wipe database volumes (Clean Reset)
docker compose down -v
```

---

## ❓ Troubleshooting & Common Issues

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **"Network Error" on Login** | Browser blocked self-signed SSL cert on subrequests | Open `https://localhost` directly in browser and click "Proceed to localhost (unsafe)". |
| **LLM 503 "Loading model"** | `llama.cpp` container still loading GGUF model | Wait 10–15 seconds for `legalbot_llm` container health check to pass. |
| **413 Request Entity Too Large** | Uploading PDFs larger than default body limit | Nginx `client_max_body_size 50M;` is configured in `nginx/nginx.conf`. |
| **Database Connection Refused** | PostgreSQL container healthy state check in progress | Backend will auto-retry database initialization via SQLAlchemy pool pre-ping. |

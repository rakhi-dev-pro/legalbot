# ⚖️ LegalBot: Local AI-Powered Contract Intelligence Platform

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2.0+-blue.svg?logo=docker)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB.svg?logo=react)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%20%2B%20pgvector-4169E1.svg?logo=postgresql)](https://github.com/pgvector/pgvector)
[![LLM](https://img.shields.io/badge/Local%20LLM-IBM%20Granite%204.1%203B-FF6F00.svg)](https://huggingface.co/ibm-granite)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **Enterprise-grade, privacy-first legal contract analysis platform.**  
> Processes confidential legal documents completely **offline on local infrastructure** using **IBM Granite 4.1 3B GGUF** via `llama.cpp` and **pgvector**. No external API calls, no third-party data leaks.

---

## 📚 Complete Project Documentation

Detailed documentation and guides are organized under the [`docs/`](file:///c:/Users/DEEPANSHU/Desktop/workspace/legalbot/docs) directory:

- 🏗️ **[System Architecture & Technical Design](file:///c:/Users/DEEPANSHU/Desktop/workspace/legalbot/docs/ARCHITECTURE.md)**: Deep dive into topology, microservices, NLP pipeline, database schema, and AES-256 security.
- 🚀 **[Deployment & Setup Guide](file:///c:/Users/DEEPANSHU/Desktop/workspace/legalbot/docs/DEPLOYMENT.md)**: Step-by-step instructions for running Docker Compose, SSL setup, and environment variables.
- 💡 **[User Guide & Feature Manual](file:///c:/Users/DEEPANSHU/Desktop/workspace/legalbot/docs/USER_GUIDE.md)**: Comprehensive walkthrough of contract uploading, side-by-side page reader, multi-select clause highlighting, and the Admin Panel.
- 📡 **[REST API Reference](file:///c:/Users/DEEPANSHU/Desktop/workspace/legalbot/docs/API_REFERENCE.md)**: Endpoint documentation for `/auth`, `/docs`, `/reports`, `/admin`, and `/tests`.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **🔒 100% Local & Privacy-First** | All model inferences run internally via `llama.cpp`. Documents are encrypted at rest with **AES-256-GCM**. |
| **📖 Side-by-Side Page Reader** | Interactive split view featuring page-wise navigation, section dividers, text search, and page risk counters. |
| **🎯 Multi-Select Risk Highlighting** | Select multiple risk clauses from the right panel to highlight corresponding document sections on the left panel. |
| **✨ AI Action Recommendations** | Concurrent LLM inference (`asyncio.gather`) generates direct, actionable negotiation and protective advice per risk. |
| **🔎 NLP Entity Extraction** | Automatically extracts Parties, Effective Dates, Jurisdiction, Governing Law, and Monetary Amounts via spaCy. |
| **⚙️ Admin Control Panel** | Dynamic risk rules CRUD editor, system KPI analytics, and user role management (`User` vs `Admin`). |
| **🖨️ Export & Print** | One-click export of structured executive summaries, risk breakdowns, and legal recommendations to PDF. |

---

## 📐 Architecture Overview

```mermaid
graph TD
    User([Browser Client]) -->|HTTPS / SSL| Nginx[Nginx Reverse Proxy]
    Nginx -->|Port 3000| Frontend[React 18 SPA]
    Nginx -->|Port 8000| Backend[FastAPI App Engine]
    
    Backend <--> DB[(PostgreSQL 17 + pgvector)]
    Backend <--> Redis[(Redis 7 Cache)]
    Backend <-->|Parallel HTTP / LLM| LlamaCPP[llama.cpp Server / IBM Granite 4.1]
```

---

## ⚡ Quickstart Guide (3 Minutes)

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed & running.
- IBM Granite model placed in `./models/granite-4.1-3b-Q6_K.gguf`.

### 2. Clone & Launch
```bash
# 1. Clone repository
git clone https://github.com/your-org/legalbot.git
cd legalbot

# 2. Setup environment variables
cp .env.example .env

# 3. Launch full stack with Docker Compose
docker compose up -d --build
```

### 3. Open in Browser
Navigate to **[https://localhost](https://localhost)** in your web browser.

> [!NOTE]
> Because Nginx generates a local self-signed TLS certificate, click **Advanced** $\rightarrow$ **Proceed to localhost (unsafe)** when prompted by your browser.

---

## 🔑 Default Administrator Credentials

Use these credentials to log in with full Admin Panel privileges:

- **Email**: `admin@legalbot.com`
- **Password**: `password123`

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Axios
- **Backend Engine**: Python 3.11, FastAPI, SQLAlchemy (Async), Pydantic v2, PyMuPDF, python-docx, spaCy
- **Database & Cache**: PostgreSQL 17 + `pgvector` (HNSW indexing), Redis 7 (AioRedis)
- **Local AI Inference**: `llama.cpp` server hosting IBM Granite 4.1 3B Instruct (GGUF Q6_K)
- **Reverse Proxy & Security**: Nginx (SSL/TLS termination, HTTP/2, client limits), Bcrypt, OAuth2 JWT

---

## 🧪 Running Diagnostic Verification Suite

To verify that all 6 microservices (PostgreSQL, Redis, llama.cpp, Backend, Nginx, Frontend) are fully operational:

```bash
# Run integration test suite
python backend/tests/test_api.py
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

# ⚖️ LegalBot: Local AI-Powered Contract Intelligence Platform

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2.0+-blue.svg?logo=docker)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB.svg?logo=react)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%20%2B%20pgvector-4169E1.svg?logo=postgresql)](https://github.com/pgvector/pgvector)
[![LLM](https://img.shields.io/badge/Local%20LLM-IBM%20Granite%204.2%203B-FF6F00.svg)](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **Enterprise-grade, privacy-first legal contract analysis platform.**  
> Processes confidential legal documents completely **offline on local infrastructure** using **IBM Granite 4.2 3B GGUF** via `llama.cpp` and **pgvector**. No external API calls, no third-party data leaks.

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

## 📸 Visual Walkthrough: User & Admin Workflows

LegalBot provides tailored interfaces for everyday legal reviewers as well as organization administrators. Below is an end-to-end visual walkthrough of both user experiences.

---

### 👤 1. User Workflow: Contract Upload & Interactive Risk Analysis

Standard users can securely ingest contracts, monitor local AI processing, navigate document pages, and review clause-level risk recommendations with side-by-side highlighting.

#### Step 1: Secure Contract Upload
Upload agreements (`.pdf`, `.docx` up to 50 MB) via an intuitive drag-and-drop modal. Uploaded files are immediately encrypted at rest using AES-256-GCM.

<p align="center">
  <img src="images/upload.png" alt="Contract Upload Modal" width="850" />
</p>

#### Step 2: Real-Time Local AI Processing
A progress indicator monitors the multi-stage local pipeline (PyMuPDF / docx extraction $\rightarrow$ spaCy NER entity detection $\rightarrow$ deterministic rule matching $\rightarrow$ IBM Granite 3B LLM parallel inference).

<p align="center">
  <img src="images/wait.png" alt="Processing State" width="850" />
</p>

#### Step 3: Ingestion Confirmation & Document Repository
Once processed, contracts are stored with analysis metadata. Users can view their full contract catalog, complete with risk severity tags and date timestamps.

<p align="center">
  <img src="images/uploaded.png" alt="Document Uploaded Confirmation" width="850" />
</p>

<p align="center">
  <img src="images/view_documents.png" alt="Document Repository" width="850" />
</p>

#### Step 4: Executive Summary & Categorized Risk Breakdown
The right-hand analysis panel provides key contract metadata (Parties, Jurisdiction, Effective Date), risk distributions, and expandable risk cards categorized into High, Medium, and Low severity.

<p align="center">
  <img src="images/right%20panel.png" alt="Executive Summary Panel" width="850" />
</p>

<p align="center">
  <img src="images/view%20risks.png" alt="Detected Risk Clauses" width="850" />
</p>

#### Step 5: Side-by-Side Interactive Reader & Multi-Select Highlighting
Review original text with page-by-page navigation (`Pg 1`, `Pg 2` with risk count badges) and section dividers. Clicking any risk card pins the clause and highlights matching document sections on the left panel with color-coded risk borders.

<p align="center">
  <img src="images/annotated%20doc.png" alt="Side-by-Side Interactive Reader" width="850" />
</p>

#### Step 6: Actionable Recommendations & Evidence Strength
Inspect individual clauses to view dual-AI confidence metrics (regex pattern + zero-shot LLM validation) and AI-generated negotiation recommendations for counter-drafting.

<p align="center">
  <img src="images/detailed%20selected%20risk%20and%20its%20clause.png" alt="Clause Detail and AI Action Recommendation" width="850" />
</p>

---

### 🛡️ 2. Administrator Workflow: Governance, Dynamic Rules & User Management

Administrators (`admin@legalbot.com`) have full access to system-wide analytics, live rule customization, rule simulation, document re-analysis queues, and user management.

#### Step 1: Analytics & KPI Dashboard
Get real-time visibility into organization-wide metrics: total analyzed contracts, high-risk flags, active risk classification rules, and pipeline throughput.

<p align="center">
  <img src="images/admin%20dashboard.png" alt="Admin Analytics Dashboard" width="850" />
</p>

#### Step 2: Custom Risk Rule Creation
Create custom risk categories (e.g., *Data Protection / GDPR*, *Non-Solicitation*, *IP Assignment*) with custom severity levels, confidence thresholds, and keyword triggers without code deployment.

<p align="center">
  <img src="images/add%20custom%20rule.png" alt="Add Custom Rule Modal" width="850" />
</p>

#### Step 3: Live Rule Simulation & Clause Matching
Test and calibrate rule sensitivity before saving. The built-in chunk tester simulates rule execution against sample clauses in real time.

<p align="center">
  <img src="images/edit%20rule%20and%20simulate%20rule.png" alt="Edit Rule and Simulate Match" width="850" />
</p>

#### Step 4: Batch Document Re-Analysis
When legal policies or risk rules are updated, trigger single or sequential batch re-analysis across the document repository. Jobs run in a managed background queue to prevent local GPU/CPU overload.

<p align="center">
  <img src="images/retrigger%20analysis.png" alt="Retrigger Document Analysis" width="850" />
</p>

#### Step 5: Role-Based User Management
View all registered accounts, promote users to Administrator, demote privileges, or disable access with instant role synchronization.

<p align="center">
  <img src="images/user%20management.png" alt="User Management Panel" width="850" />
</p>

---

## 📐 Architecture Overview

```mermaid
graph TD
    User([Browser Client]) -->|HTTPS / SSL| Nginx[Nginx Reverse Proxy]
    Nginx -->|Port 3000| Frontend[React 18 SPA]
    Nginx -->|Port 8000| Backend[FastAPI App Engine]
    
    Backend <--> DB[(PostgreSQL 17 + pgvector)]
    Backend <--> Redis[(Redis 7 Cache)]
    Backend <-->|Parallel HTTP / LLM| LlamaCPP[llama.cpp Server / IBM Granite 4.2 3B]
```

---

## ⚡ Quickstart Guide (3 Minutes)

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed & running.
- **Model Download**: Handled automatically! Docker Compose downloads `granite-4.2-3b-Q4_K_M.gguf` directly from Hugging Face on first launch into `./models/`.

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
- **Local AI Inference**: `llama.cpp` server hosting IBM Granite 4.2 3B Instruct (GGUF Q4_K_M)
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

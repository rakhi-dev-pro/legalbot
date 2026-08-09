# System Architecture & Technical Design Document
## AI-Powered Legal Document Summarizer & Risk Analyzer (LegalBot)

---

## 1. Executive Architecture Overview

The system is designed as a **privacy-first, containerized enterprise legal intelligence application**. All LLM inference and document processing occur strictly **on-premise / locally** within a unified `docker-compose` environment without transmitting sensitive contract data to external third-party APIs.

```mermaid
graph TD
    Client[Browser: React SPA] -->|HTTP / REST + JWT| Nginx[Nginx Reverse Proxy / Frontend Service]
    Nginx -->|Port 8000| FastAPI[Backend Service: FastAPI]
    
    subgraph Containerized Docker Compose Stack
        FastAPI -->|CRUD & PgVector| Postgres[(PostgreSQL 16 + pgvector)]
        FastAPI -->|Async Tasks & Cache| Redis[(Redis Cache & Queue)]
        FastAPI -->|OpenAI-Compatible REST API :8080| LlamaCpp[LLM Hosting Service: llama.cpp Server Container]
        
        subgraph Local AI Inference Engine (llama.cpp)
            LlamaCpp --> Granite[IBM Granite 3.1 8B/2B GGUF Model]
            LlamaCpp --> Embed[bge-m3 / nomic-embed-text GGUF]
        end
    end
```

---

## 2. Model Selection: IBM Granite Series (Local GGUF via llama.cpp)

### **Primary Model: IBM Granite 3.1 Dense Instruct (`granite-3.1-8b-instruct-Q4_K_M.gguf` or `granite-3.1-2b-instruct-Q4_K_M.gguf`)**
- **License**: Apache 2.0 open source.
- **Why Granite?**: Developed by IBM specifically for enterprise RAG, legal document understanding, structured JSON extraction, and long-context summarization. Highly optimized, low-latency, and accurate.
- **Format**: Quantized GGUF format natively optimized for `llama.cpp`.
- **Quantization & Footprint**:
  - `granite-3.1-8b-instruct.Q4_K_M.gguf`: ~4.9 GB VRAM / RAM footprint. Superior legal reasoning, zero-shot clause classification, and overall document risk assessment.
  - `granite-3.1-2b-instruct.Q4_K_M.gguf`: ~1.6 GB VRAM / RAM footprint. Ultra-lightweight fallback for low-resource environments (e.g. 8GB RAM systems).
- **Embedding Model**: `nomic-embed-text-v1.5.Q4_K_M.gguf` or `bge-m3.Q4_K_M.gguf` served locally via `llama-server` or `llama-cpp-python` embeddings endpoint.

---

## 3. Component Deep Dive & Core Functionalities

### 3.1 Local LLM Hosting Service (`llama.cpp` Server)
- **Hosting Engine**: Official **`llama.cpp` Server** (`ghcr.io/ggerganov/llama.cpp:server`) container running inside the Docker Compose network.
- **Why `llama.cpp` over Ollama?**:
  - **Full Custom Command Control**: Direct access to CLI startup flags (`-c` context size, `-t` CPU threads, `-ngl` GPU layers offloaded, `-b` batch size, `--flash-attn`, `--mlock`).
  - **GBNF Grammar Support**: Enforces strict JSON schemas at the token sampling level for 100% deterministic risk clause output formats.
  - **Memory Efficiency**: Minimal runtime overhead with zero background background daemons.
  - **Custom Context Windows**: Configurable context window scaling (e.g., `-c 8192` or `-c 16384` for processing long legal contracts).
- **Communication Protocol**: OpenAI-compatible REST API endpoints (`http://llm-service:8080/v1/chat/completions` and `/embeddings` or `/completion`).
- **Example Custom `llama-server` Startup Command**:
  ```bash
  ./llama-server \
    -m /models/granite-3.1-8b-instruct.Q4_K_M.gguf \
    -c 8192 \
    -ngl 99 \
    -t 8 \
    -b 512 \
    --flash-attn \
    --host 0.0.0.0 \
    --port 8080
  ```

### 3.2 Backend Service (FastAPI)
- **Framework**: Python 3.11+ FastAPI (ASGI via Uvicorn).
- **Key Responsibilities**:
  - **Authentication & Security**: JWT generation/validation (RS256/HS256), password hashing (bcrypt cost 12), Role-Based Access Control (User/Admin).
  - **Document Ingestion Engine**: Accepts PDF (`PyMuPDF`) and DOCX (`python-docx`). AES-256-GCM encryption at rest before disk storage.
  - **NLP Pre-Processing & Chunking**: Recursive sentence boundary splitting, token trimming, SpaCy NER (extracting parties, dates, governing law, financial amounts).
  - **AI Pipeline Orchestration**: Asynchronous task processing using FastAPI `BackgroundTasks` or Redis worker queues for non-blocking API handling.
  - **`llama.cpp` API Integration**: Sends prompts and optional GBNF JSON grammars to the local `llama.cpp` server endpoint (`http://llm-service:8080/v1/chat/completions`).
  - **Risk Assessment Scoring Engine**: Rule-based weighting combined with Granite LLM zero-shot classification scores to determine Low/Medium/High document risk.
  - **PDF Export Generator**: Server-side report rendering or structured JSON delivery for frontend export.

### 3.3 Database Service (PostgreSQL 16 + pgvector)
- **Primary Relational Engine**: PostgreSQL 16 with `pgvector` plugin enabled for dual relational and vector search capabilities.
- **Key Schemas & Entities**:
  1. `users`: Credentials, roles (admin/user), timestamps.
  2. `documents`: File metadata, encrypted file paths, upload dates, ownership FK.
  3. `document_chunks`: Document text segments, token counts, and 768/1024-dim vector embeddings for semantic vector search.
  4. `analysis_reports`: Summary text, overall risk rating (Low/Medium/High), risk counts, model version metadata.
  5. `risk_clauses`: Extracted clause text, clause type (Indemnity, Termination, Liability, etc.), risk severity, confidence score.
  6. `risk_rules_config`: Dynamic JSON configuration for clause detection rules and weights.
  7. `sessions`: JWT revocation tokens and active user session state.

### 3.4 Frontend Service (React + Tailwind CSS)
- **Framework**: React.js 18 (Vite build tool), Tailwind CSS, Axios with JWT request interceptors.
- **Key UI Modules**:
  - **Authentication Portal**: Login, Registration, Session management, JWT persistence.
  - **Document Upload Hub**: Drag-and-drop zone (`react-dropzone`), client-side file type/size validation, real-time upload & analysis progress indicator.
  - **Interactive Risk Dashboard**: Document history grid, status indicators (Pending/Processing/Completed/Failed), high-risk warning flags.
  - **Detailed Report View**: Side-by-side split view of document & AI summary, color-coded risk clause chips (Red/Amber/Green), clause category filters, interactive charts (`Recharts`).
  - **PDF Export Module**: Client-side PDF generation via `jsPDF` / `@react-pdf/renderer`.
  - **Admin Control Panel**: Dynamic Risk Rules editor (modify confidence thresholds & clause categories on the fly), user management, system usage analytics.

---

## 4. Single Docker Compose Topology (`docker-compose.yml`)

The system will orchestrate 5 distinct services on a private Docker bridge network:

```yaml
version: '3.8'

services:
  # 1. Database Layer
  postgres:
    image: pgvector/pgvector:pg16
    container_name: legalbot_db
    environment:
      POSTGRES_DB: legalbot
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # 2. In-Memory Cache & Queue
  redis:
    image: redis:7-alpine
    container_name: legalbot_redis
    ports:
      - "6379:6379"

  # 3. Local LLM Hosting Service (llama.cpp Server)
  llm-service:
    image: ghcr.io/ggerganov/llama.cpp:server
    container_name: legalbot_llm
    volumes:
      - ./models:/models
    ports:
      - "8080:8080"
    command: >
      -m /models/granite-3.1-8b-instruct.Q4_K_M.gguf
      -c 8192
      -ngl 99
      -t 8
      -b 512
      --flash-attn
      --host 0.0.0.0
      --port 8080
    # Optional GPU Acceleration (if host has NVIDIA GPU):
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]

  # 4. FastAPI Backend Application
  backend:
    build: ./backend
    container_name: legalbot_backend
    environment:
      DATABASE_URL: postgresql://legal_admin:${DB_PASSWORD}@postgres:5432/legalbot
      REDIS_URL: redis://redis:6379/0
      LLAMA_CPP_BASE_URL: http://llm-service:8080
      MODEL_NAME: granite-3.1-8b-instruct
    depends_on:
      - postgres
      - redis
      - llm-service
    ports:
      - "8000:8000"

  # 5. React Frontend Web Application
  frontend:
    build: ./frontend
    container_name: legalbot_frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

---

## 5. Development Milestones & Implementation Roadmap

```mermaid
gantt
    title LegalBot Development Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Data & Infra
    Database & Docker Setup       :m1, 2026-08-10, 5d
    llama.cpp Local Setup & Tuning:m2, after m1, 5d
    section Phase 2: Core AI & Backend
    Document Parsing & Encryption  :m3, after m2, 5d
    Granite NLP & Risk Engine     :m4, after m3, 7d
    Backend API Endpoints          :m5, after m4, 5d
    section Phase 3: Frontend & UX
    Auth & Upload Portal          :m6, after m5, 5d
    Risk Dashboard & PDF Export   :m7, after m6, 6d
    Admin Control Panel           :m8, after m7, 4d
    section Phase 4: Integration
    End-to-End Dockered Test      :m9, after m8, 5d
```

### **Milestones Breakdown**

#### **Milestone 1: LLM Hosting (`llama.cpp`) & AI Infrastructure**
- [ ] **M1.1**: Set up containerized `llama.cpp` Server (`ghcr.io/ggerganov/llama.cpp:server`) in `docker-compose.yml` mounting `./models` volume containing `granite-3.1-8b-instruct.Q4_K_M.gguf`.
- [ ] **M1.2**: Configure custom startup parameters (`-c 8192` context window, `-ngl` GPU layers offloaded, `-t` CPU thread count, `-b 512` batch size, `--flash-attn`).
- [ ] **M1.3**: Create GBNF grammar definitions for strict JSON schema extraction of detected risk clauses, severity ratings, and key contract entities.
- [ ] **M1.4**: Build Python HTTP client wrapper (`httpx` / `requests`) targeting `http://llm-service:8080/v1/chat/completions` with connection pooling, retries, and fallback handling.
- [ ] **M1.5**: Design prompt templates tailored for IBM Granite 3.1 GGUF for legal summarization, entity recognition, and zero-shot NLI clause classification.

#### **Milestone 2: Database Layer (PostgreSQL 16 + pgvector)**
- [ ] **M2.1**: Set up Dockerized PostgreSQL with `pgvector` extension enabled.
- [ ] **M2.2**: Implement SQLAlchemy ORM models and Alembic database migration scripts for `Users`, `Documents`, `Document_Chunks`, `Analysis_Reports`, `Risk_Clauses`, `Risk_Rules_Config`, and `Sessions`.
- [ ] **M2.3**: Configure HNSW vector indexes on `document_chunks.embedding` column for ultra-fast semantic similarity search across legal clauses.
- [ ] **M2.4**: Create database seed scripts for standard legal risk rules configuration (`risk_rules_config.json`) covering Indemnity, Termination, Liability Cap, Non-Compete, Confidentiality, Governing Law, and Auto-Renewal.

#### **Milestone 3: Backend API & AI Pipeline (FastAPI)**
- [ ] **M3.1**: Build User Authentication Router (`/auth/signup`, `/auth/login`, `/auth/refresh`) using JWT tokens and bcrypt password hashing.
- [ ] **M3.2**: Build Document Management Service (`/docs/upload`, `/docs/list`, `/docs/{id}`) with file format validation (PDF/DOCX), AES-256 storage encryption, and PyMuPDF / python-docx plain text extractors.
- [ ] **M3.3**: Construct 7-Stage Asynchronous NLP Pipeline Engine:
  - Text Extraction -> Cleaning/Normalizing -> Recursive Chunking -> IBM Granite Abstractive Summarization via `llama.cpp` -> Zero-shot Clause Classification -> Rule-based Risk Score Calculation -> Report JSON Serialization.
- [ ] **M3.4**: Implement background task processing using Redis and FastAPI `BackgroundTasks` with status polling endpoints (`/analyze/status/{task_id}`).
- [ ] **M3.5**: Build Admin API Endpoints (`/admin/users`, `/admin/rules`, `/admin/stats`) with role-guard middleware.

#### **Milestone 4: Frontend Application (React + Tailwind)**
- [ ] **M4.1**: Initialize React Vite SPA project structure, configure Tailwind CSS design system with custom dark/light theme tokens and typography.
- [ ] **M4.2**: Implement Axios client instance with automatic JWT header injection and 401 refresh token interceptors.
- [ ] **M4.3**: Build Authentication UI pages (Sign In, Sign Up, Protected Route Wrapper).
- [ ] **M4.4**: Build Drag-and-Drop Document Upload Hub with real-time upload/processing progress animation.
- [ ] **M4.5**: Build Interactive User Dashboard featuring document history table, risk badges (High/Medium/Low), and aggregated contract analytics charts.
- [ ] **M4.6**: Build Comprehensive Report Viewer displaying summary, key contract metadata, collapsible risk clause list, and client-side PDF export trigger.
- [ ] **M4.7**: Build Admin Panel UI for live dynamic editing of clause risk weights and user permissions management.

#### **Milestone 5: Container Integration, Testing & Verification**
- [ ] **M5.1**: Assemble unified `docker-compose.yml` linking Frontend, Backend, Postgres, Redis, and `llama.cpp` containers into a single command setup (`docker compose up --build`).
- [ ] **M5.2**: Execute Automated Unit and Integration tests using `pytest` for backend API endpoints and AI pipeline components.
- [ ] **M5.3**: Perform end-to-end verification uploading real sample legal contracts (NDAs, Employment Agreements, Terms of Service) to evaluate Granite 3.1 summarization coherence and risk clause detection recall/precision via `llama.cpp`.
- [ ] **M5.4**: Generate Walkthrough documentation and Docker deployment guide.

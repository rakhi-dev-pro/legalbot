# 📡 LegalBot REST API Reference

All backend API routes are available over HTTPS at `https://localhost` (or direct backend container access on port `8000`).

---

## 🔐 1. Authentication Endpoints (`/auth`)

### `POST /auth/signup`
Register a new user account.

**Request Body (`application/json`):**
```json
{
  "email": "user@legalbot.com",
  "password": "securepassword123",
  "full_name": "Jane Doe"
}
```

**Response (`201 Created`):**
```json
{
  "id": "7f1594dc-3ad0-4353-9781-ca962d93a14d",
  "email": "user@legalbot.com",
  "full_name": "Jane Doe",
  "role": "user",
  "is_active": true
}
```

---

### `POST /auth/login`
Authenticate credentials and obtain signed JWT access & refresh tokens.

**Request Body (`application/json`):**
```json
{
  "email": "admin@legalbot.com",
  "password": "password123"
}
```

**Response (`200 OK`):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5c...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5c...",
  "token_type": "bearer",
  "expires_in_seconds": 3600
}
```

---

### `GET /auth/me`
Retrieve currently authenticated user profile. Requires `Authorization: Bearer <token>`.

**Response (`200 OK`):**
```json
{
  "id": "7f1594dc-3ad0-4353-9781-ca962d93a14d",
  "email": "admin@legalbot.com",
  "full_name": "System Administrator",
  "role": "admin",
  "is_active": true
}
```

---

## 📄 2. Document Management Endpoints (`/docs`)

### `POST /docs/upload`
Upload a contract file for encrypted storage and analysis dispatch.

**Headers:** `Authorization: Bearer <token>`  
**Request (`multipart/form-data`):**
- `file`: File upload (`.pdf` or `.docx`)

**Response (`201 Created`):**
```json
{
  "id": "3cf20b79-6602-499c-832e-511d8af79baa",
  "original_filename": "Employment_Agreement.pdf",
  "file_type": "pdf",
  "file_size": 402531,
  "status": "pending",
  "created_at": "2026-08-08T18:00:00Z"
}
```

---

### `GET /docs/`
List all uploaded documents for the current authenticated user.

**Response (`200 OK`):**
```json
[
  {
    "id": "3cf20b79-6602-499c-832e-511d8af79baa",
    "original_filename": "Employment_Agreement.pdf",
    "file_type": "pdf",
    "file_size": 402531,
    "status": "completed",
    "created_at": "2026-08-08T18:00:00Z"
  }
]
```

---

### `GET /docs/{document_id}/chunks`
Fetch decrypted section text chunks grouped by page numbers for document reader.

**Response (`200 OK`):**
```json
[
  {
    "chunk_index": 0,
    "page_number": 1,
    "chunk_text": "Section 1: Obligations of the Employee...",
    "token_count": 142
  }
]
```

---

## 📊 3. Risk Analysis Report Endpoints (`/reports`)

### `POST /reports/analyze/{document_id}`
Dispatch background AI analysis pipeline for an uploaded contract.

**Response (`202 Accepted`):**
```json
{
  "document_id": "3cf20b79-6602-499c-832e-511d8af79baa",
  "status": "accepted",
  "message": "AI risk analysis pipeline dispatched."
}
```

---

### `GET /reports/doc/{document_id}`
Retrieve completed analysis report or poll processing status.

**Response (`200 OK`):**
```json
{
  "id": "report-uuid",
  "document_id": "3cf20b79-6602-499c-832e-511d8af79baa",
  "overall_risk": "High",
  "executive_summary": "Legal agreement containing 4 clause sections...",
  "model_used": "granite-4.1-3b-Q6_K.gguf",
  "processing_time_seconds": 4.9,
  "key_entities": {
    "effective_dates": ["June 23, 2025"],
    "jurisdiction": "Virginia, USA",
    "governing_law": "Not Specified"
  },
  "risk_clauses": [
    {
      "id": "clause-uuid-1",
      "clause_type": "Unilateral Termination",
      "risk_level": "High",
      "confidence_score": 0.9,
      "explanation": "Allows one party to terminate without cause...",
      "clause_text": "6. Confidentiality and IP...",
      "recommendation": "Negotiate a 30-day mutual written notice requirement for termination.",
      "page_number": 2
    }
  ]
}
```

---

## 🛡️ 4. Admin Management Endpoints (`/admin`)
*Requires Admin Role (`role == "admin"`) Authorization Header.*

### `GET /admin/stats`
Retrieve system-wide KPIs and risk analytics.

---

### `GET /admin/rules`
List all configured risk classification rules.

---

### `POST /admin/rules`
Create a new custom risk rule.

**Request Body (`application/json`):**
```json
{
  "category": "Data Privacy / GDPR",
  "default_risk_level": "High",
  "confidence_threshold": 0.75,
  "weight": 1.8,
  "description": "Requires data controller to indemnify for data breach losses."
}
```

---

### `PUT /admin/rules/{rule_id}`
Update an existing risk rule.

---

### `DELETE /admin/rules/{rule_id}`
Delete a risk rule.

---

### `GET /admin/users`
List all registered system users.

---

### `PUT /admin/users/{user_id}/role`
Update user role (`user` or `admin`).

---

## 🧪 5. Diagnostic Endpoints (`/tests`)

### `GET /tests/all`
Executes end-to-end multi-service health checks (PostgreSQL + pgvector, Redis, llama.cpp LLM, React Frontend).

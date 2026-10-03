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

**Query Parameters:**
* `force` (`boolean`, optional, default: `false`): Pass `?force=true` to restart and force re-analysis if a document was interrupted or failed.

**Response (`202 Accepted`):**
```json
{
  "document_id": "3cf20b79-6602-499c-832e-511d8af79baa",
  "status": "accepted",
  "message": "AI Analysis pipeline dispatched in background."
}
```

---

### `GET /reports/doc/{document_id}`
Retrieve completed analysis report or poll processing status.

**Response (`200 OK`):**
```json
{
  "id": "report-uuid-4a2e",
  "document_id": "3cf20b79-6602-499c-832e-511d8af79baa",
  "overall_risk": "High",
  "composite_risk_score": 11.4,
  "executive_summary": "This Employment Agreement between TechCorp Inc. and Deepanshu provides for full-time employment as Senior AI Engineer at an annual compensation of $120,000. Key terms include a 3-month probation period, mutual 30-day notice for termination, and standard IP assignment. Significant risk factors include an aggressive 2-year post-termination non-compete covenant and a unilateral indemnity clause requiring employee indemnification.",
  "model_used": "granite-4.1-3b-Q6_K.gguf",
  "processing_time_seconds": 6.8,
  "total_risks_found": 3,
  "key_entities": {
    "effective_dates": ["June 23, 2025"],
    "jurisdiction": "Virginia, USA",
    "governing_law": "Laws of Virginia",
    "parties": ["TechCorp Inc.", "Deepanshu"],
    "monetary_amounts": ["$120,000"]
  },
  "risk_clauses": [
    {
      "id": "clause-uuid-1",
      "clause_type": "Indemnity & Hold Harmless",
      "risk_level": "High",
      "confidence_score": 0.95,
      "explanation": "Mandates broad unilateral indemnification by employee.",
      "clause_text": "Employee shall indemnify and hold harmless the Company...",
      "recommendation": "Negotiate a mutual indemnification cap limited to gross negligence.",
      "page_number": 2
    }
  ]
}
```

> **Note on Evidence Strength (`confidence_score`):**
> Scores represent calibrated evidence tiers rather than statistical probability:
> * `0.95`: Dual AI confirmation (both deterministic regex rule and zero-shot LLM independently detected the clause).
> * `0.88`: Exact multi-word legal phrase match (e.g. *"indemnify and hold harmless"*).
> * `0.82`: High-confidence zero-shot LLM classification (satisfies the 0.75 threshold for High-risk rules).
> * `0.78`: Single keyword with supportive contractual context terms.
> * `0.72`: Fallback heuristic score.

---

## 🛡️ 4. Admin Management Endpoints (`/admin`)
*Requires Admin Role (`role == "admin"`) Bearer JWT Authorization Header.*

### `GET /admin/stats`
Retrieve system-wide KPIs, counts, and aggregated risk level distribution.

**Response (`200 OK`):**
```json
{
  "total_users": 1,
  "total_documents": 12,
  "total_reports": 10,
  "active_rules_count": 19,
  "high_risk_docs": 4,
  "medium_risk_docs": 5,
  "low_risk_docs": 1
}
```

---

### `GET /admin/rules`
List all 19 configured risk classification rules (category, default risk level, confidence threshold, weight, keywords).

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
  "keywords": "gdpr, data controller, personal data breach",
  "description": "Requires data processor to indemnify for data breach losses."
}
```

---

### `PUT /admin/rules/{rule_id}`
Update dynamic thresholds, weights, or trigger keywords for an existing rule.

---

### `DELETE /admin/rules/{rule_id}`
Delete a risk rule.

---

### `POST /admin/rules/reset`
Reset all rule categories, weights, and thresholds to system default 19 rules.

---

### `POST /admin/rules/test-chunk`
Interactive test utility to verify how rule regexes match a sample contract excerpt.

**Request Body (`application/json`):**
```json
{
  "chunk_text": "The annual rent shall increase by 10% every year on the anniversary date."
}
```

---

### `GET /admin/documents`
List all documents across all users with processing statuses, risk scores, and owner information.

---

### `POST /admin/documents/{doc_id}/reanalyze`
Invalidate highlight cache and trigger background re-analysis of a specific document using current rules.

---

### `POST /admin/documents/reanalyze-all`
Sequentially queue all documents in the system for background re-analysis without overloading the LLM server.

---

## 🧪 5. Diagnostic Endpoints (`/tests`)

### `GET /tests/all`
Executes end-to-end multi-service health checks (PostgreSQL + pgvector, Redis, llama.cpp LLM, React Frontend).

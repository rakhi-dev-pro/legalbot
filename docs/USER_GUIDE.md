# 💡 LegalBot User Guide & Feature Manual

Welcome to **LegalBot**, your AI-powered legal contract analysis assistant. This guide explains how to use all features of LegalBot from document ingestion to interactive report viewing and admin rule management.

---

## 🔑 1. Authentication & Roles

LegalBot supports Role-Based Access Control (RBAC):
- **User Role**: Upload contracts, view analysis reports, search document text, view side-by-side interactive reader.
- **Admin Role**: All user permissions **plus** full access to the **Admin Control Panel** (KPI Analytics, Live Risk Rules CRUD, User Management).

### Pre-configured Administrator Account
- **Email**: `admin@legalbot.com`
- **Password**: `password123`

To create a standard user account, click **Register Here** on the login modal.

---

## 📄 2. Document Upload & Ingestion

1. Click **Upload & Analyze** on the top navigation bar.
2. Select or drag & drop a legal contract file:
   - **Supported Formats**: `.pdf` (Digital & Scanned), `.docx` (Microsoft Word).
   - **Maximum File Size**: Up to **50 MB**.
3. Click **Upload & Analyze Contract**.
4. The system will encrypt the file at rest using AES-256-GCM, parse the text, run entity recognition, scan risk rules, and execute parallel LLM recommendations via IBM Granite.

<p align="center">
  <img src="../images/upload.png" alt="Upload Contract Modal" width="800" />
</p>

<p align="center">
  <img src="../images/wait.png" alt="Processing State" width="800" />
</p>

<p align="center">
  <img src="../images/uploaded.png" alt="Upload Confirmation" width="800" />
</p>

<p align="center">
  <img src="../images/view_documents.png" alt="Document Repository" width="800" />
</p>

---

## 📊 3. Interactive Report Viewer

Once analysis completes, the **Contract Analysis Viewer** opens.

### Key Features of the Viewer:

#### A. Side-by-Side Split View vs Summary Report Only
Use the mode switcher in the top right header:
- **Side-by-Side Reader**: Displays the original document text on the left panel and AI risk analysis on the right panel.
- **Summary Report Only**: Maximize the right panel for high-level executive summaries and print/exporting.

<p align="center">
  <img src="../images/right%20panel.png" alt="Executive Summary Panel" width="800" />
</p>

<p align="center">
  <img src="../images/view%20risks.png" alt="Detected Risk Clauses" width="800" />
</p>

#### B. Page-Wise Navigation Sidebar
- The left document reader includes a **vertical Page Navigation Sidebar** (`Pg 1`, `Pg 2`, ...).
- Each page button displays a **red badge** indicating the number of risks detected on that specific page.
- Clicking a page button switches the document reader view directly to that page.
- Previous / Next buttons are available at the bottom of each page.

#### C. Section Dividers & Text Search
- Document text is grouped into clear numbered sections (e.g., `Section 1`, `Section 2`).
- Use the **Search in text...** input bar to filter text sections in real-time.

#### D. Multi-Select Risk Clause Highlighting
- Risk highlights in the document text are **disabled by default** to provide a clean reading experience.
- Clicking any risk clause card on the right panel **toggles highlighting ON/OFF** (multi-select supported).
- Pinned/selected risk clauses display a blue checkmark on their card and highlight matching text sections on the left panel with color-coded risk borders:
  - 🔴 **High Risk**: Red border & badge
  - 🟡 **Medium Risk**: Amber border & badge
  - 🟢 **Low Risk**: Green border & badge
- If a single document section contains **multiple risks**, all applicable risk badges are displayed together on that section header.
- Click **Clear highlights** at the top of the reader to reset all selections.

<p align="center">
  <img src="../images/annotated%20doc.png" alt="Side-by-Side Reader with Risk Highlighting" width="800" />
</p>

#### E. Per-Clause Actionable Recommendations & Evidence Strength
- Every detected risk clause features an AI-generated **Recommended Action** card providing practical negotiation and protective amendment advice.
- **Evidence Strength Score**: Represents calibrated detection certainty:
  - `95%`: Dual AI confirmation (both deterministic regex rule and zero-shot LLM independently detected the clause).
  - `88%`: Exact multi-word legal phrase match (e.g. *"indemnify and hold harmless"*).
  - `82%`: High-confidence zero-shot LLM classification (satisfies the 0.75 threshold for High-risk rules).
  - `78%`: Single keyword match with supporting legal context terms.
  - `72%`: Fallback classification score.

<p align="center">
  <img src="../images/detailed%20selected%20risk%20and%20its%20clause.png" alt="Clause Detail and AI Action Recommendation" width="800" />
</p>

#### F. Force Re-Analyze Option
- If a document analysis was interrupted or dynamic rules were reconfigured, click the **Force Re-analyze** button in the viewer toolbar or dashboard to rerun the complete 7-stage NLP pipeline with `?force=true`.

---

## 🛡️ 4. Admin Control Panel

Admin users (`role: "admin"`) will see an **Admin** button in the top navigation navbar. Clicking it opens the Admin Control Panel:

### 1. 📊 Analytics Dashboard
- **System KPIs**: Total analyzed contracts, high-risk flags, active risk rules, active system users.
- **Risk Severity Distribution**: Breakdown of High, Medium, and Low risk findings.
- **Processing Status Breakdown**: Completed vs Failed pipeline jobs.

<p align="center">
  <img src="../images/admin%20dashboard.png" alt="Admin Analytics Dashboard" width="800" />
</p>

### 2. ⚙️ Risk Rules Config (Live CRUD Editor)
- View and modify active risk classification rules.
- Add new custom risk categories (e.g. *Intellectual Property Assignment*, *Data Privacy / GDPR*).
- Edit existing rules:
  - **Category Name**
  - **Default Risk Level** (High, Medium, Low)
  - **Confidence Threshold** (e.g., `0.75`)
  - **Rule Weight** (e.g., `1.8`)
  - **Custom Keywords** (comma-separated trigger words)
  - **Description**
- Test rules against custom sample clauses using the **Interactive Chunk Match Tester**.
- Reset all rules back to system default 19 rules via **Reset to Defaults**.

<p align="center">
  <img src="../images/add%20custom%20rule.png" alt="Add Custom Rule" width="800" />
</p>

<p align="center">
  <img src="../images/edit%20rule%20and%20simulate%20rule.png" alt="Edit Rule and Simulate Match" width="800" />
</p>

### 3. 📄 Document Management & Sequential Batch Re-Analysis
- Inspect all uploaded documents across all system users.
- Trigger single document re-analysis with currently configured rules.
- **Re-analyze All Documents**: Dispatches a sequential background worker queue to re-analyze all documents without overloading the local LLM server.

<p align="center">
  <img src="../images/retrigger%20analysis.png" alt="Retrigger Analysis Queue" width="800" />
</p>

### 4. 👥 User Management
- View all registered users.
- Promote or demote user roles (**User** $\leftrightarrow$ **Admin**).
- Toggle account active/disabled status.

<p align="center">
  <img src="../images/user%20management.png" alt="User Management Panel" width="800" />
</p>

---

## 🖨️ 5. Printing & Exporting PDF Reports

Click **Print / Export PDF** in the top right header of the report viewer to format the executive summary, extracted key entities, detected risk clauses, and action recommendations into a clean PDF printout. Alternatively, click **Export Annotated PDF** to download the original PDF with visual PyMuPDF annotations and comments embedded directly on the document pages.

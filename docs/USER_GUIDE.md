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

---

## 📊 3. Interactive Report Viewer

Once analysis completes, the **Contract Analysis Viewer** opens.

### Key Features of the Viewer:

#### A. Side-by-Side Split View vs Summary Report Only
Use the mode switcher in the top right header:
- **Side-by-Side Reader**: Displays the original document text on the left panel and AI risk analysis on the right panel.
- **Summary Report Only**: Maximize the right panel for high-level executive summaries and print/exporting.

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

#### E. Per-Clause Actionable Recommendations
Every detected risk clause features an AI-generated **Recommended Action** card (with a green ✨ icon) providing direct, practical negotiation and protective amendment advice.

---

## 🛡️ 4. Admin Control Panel

Admin users (`role: "admin"`) will see an **Admin** button in the top navigation navbar. Clicking it opens the 3-tab Admin Control Panel:

### 1. 📊 Analytics Dashboard
- **System KPIs**: Total analyzed contracts, high-risk flags, active risk rules, active system users.
- **Risk Severity Distribution**: Breakdown of High, Medium, and Low risk findings.
- **Processing Status Breakdown**: Completed vs Failed pipeline jobs.

### 2. ⚙️ Risk Rules Config (Live CRUD Editor)
- View and modify active risk classification rules.
- Add new custom risk categories (e.g. *Intellectual Property Assignment*, *Data Privacy / GDPR*).
- Edit existing rules:
  - **Category Name**
  - **Default Risk Level** (High, Medium, Low)
  - **Confidence Threshold** (e.g., `0.75`)
  - **Rule Weight** (e.g., `1.8`)
  - **Description**
- Toggle rule active state or delete rules.

### 3. 👥 User Management
- View all registered users.
- Promote or demote user roles (**User** $\leftrightarrow$ **Admin**).
- Toggle account active/disabled status.

---

## 🖨️ 5. Printing & Exporting PDF Reports

Click **Print / Export PDF** in the top right header of the report viewer to format the executive summary, extracted key entities, detected risk clauses, and action recommendations into a clean PDF printout.

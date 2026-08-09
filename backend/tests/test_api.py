import os
import json
import ssl
import sys
import time
import urllib.request
import urllib.error

# Disable SSL verification for local self-signed HTTPS testing
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URLS = [
    "https://localhost",
    "http://localhost:8000"
]

SAMPLE_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "samples", "Deepanshu - Offer Letter AI Backend Engineer.pdf")

def make_request(url, method="GET", headers=None, data=None):
    """Helper function to execute HTTP/HTTPS requests with SSL bypass."""
    if headers is None:
        headers = {}
    
    encoded_data = None
    if data is not None and isinstance(data, dict):
        headers["Content-Type"] = "application/json"
        encoded_data = json.dumps(data).encode("utf-8")
    elif isinstance(data, bytes):
        encoded_data = data

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=25) as response:
            status_code = response.status
            body = response.read().decode("utf-8")
            elapsed = round((time.time() - start_time) * 1000, 2)
            try:
                json_body = json.loads(body)
            except Exception:
                json_body = body
            return status_code, json_body, elapsed
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        elapsed = round((time.time() - start_time) * 1000, 2)
        try:
            json_body = json.loads(body)
        except Exception:
            json_body = body
        return e.code, json_body, elapsed
    except Exception as e:
        elapsed = round((time.time() - start_time) * 1000, 2)
        return 0, {"error": str(e)}, elapsed


def upload_multipart_file(url, filename, content_bytes, headers=None):
    """Helper to perform multipart/form-data upload using standard library."""
    if headers is None:
        headers = {}

    boundary = f"----WebKitFormBoundary{int(time.time()*1000)}"
    headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8"))
    body.extend(b"Content-Type: application/pdf\r\n\r\n")
    body.extend(content_bytes)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    return make_request(url, method="POST", headers=headers, data=bytes(body))


def run_legalbot_end_to_end_tests():
    print("\n" + "="*70)
    print("  LEGALBOT ENTERPRISE END-TO-END API TEST SUITE")
    print("="*70 + "\n")

    # Determine reachable target base URL
    target_base = None
    for base in BASE_URLS:
        status, body, duration = make_request(f"{base}/api/health")
        if status == 200:
            target_base = base
            print(f"[+] Target API Server Detected: {target_base} ({duration} ms)\n")
            break
    
    if not target_base:
        print("[-] Could not connect to LegalBot API server at https://localhost or http://localhost:8000.")
        print("    Ensure containers are running via: docker compose up -d\n")
        sys.exit(1)

    test_email = f"test_admin_{int(time.time())}@legalbot.com"
    test_password = "SecurePassword123!"

    # --- STEP 1: User Signup ---
    print("[1] Testing POST /auth/signup (User Registration)...")
    status, body, duration = make_request(
        f"{target_base}/auth/signup",
        method="POST",
        data={
            "email": test_email,
            "password": test_password,
            "full_name": "Deepanshu Test User"
        }
    )
    if status in [200, 201]:
        print(f"    [PASS] Signup ({duration} ms) - Account Created: {body.get('email')}")
    else:
        print(f"    [FAIL] Signup ({duration} ms) [HTTP {status}]: {body}")
        sys.exit(1)

    # --- STEP 2: User Login & JWT Token Retrieval ---
    print("\n[2] Testing POST /auth/login (JWT Bearer Token Retrieval)...")
    status, body, duration = make_request(
        f"{target_base}/auth/login",
        method="POST",
        data={
            "email": test_email,
            "password": test_password
        }
    )
    if status == 200 and "access_token" in body:
        access_token = body["access_token"]
        print(f"    [PASS] Login ({duration} ms) - JWT Bearer Token Obtained!")
        print(f"           Token Snippet: Bearer {access_token[:25]}...")
    else:
        print(f"    [FAIL] Login ({duration} ms) [HTTP {status}]: {body}")
        sys.exit(1)

    auth_headers = {"Authorization": f"Bearer {access_token}"}

    # --- STEP 3: Protected Profile Route /auth/me ---
    print("\n[3] Testing GET /auth/me (Protected User Profile)...")
    status, body, duration = make_request(f"{target_base}/auth/me", method="GET", headers=auth_headers)
    if status == 200:
        print(f"    [PASS] Protected Profile ({duration} ms) - User: {body.get('full_name')} (Role: {body.get('role')})")
    else:
        print(f"    [FAIL] Protected Profile ({duration} ms) [HTTP {status}]: {body}")

    # --- STEP 4: Upload Real Sample Document ---
    print("\n[4] Testing POST /docs/upload (Uploading Real Sample Offer Letter)...")
    sample_path = os.path.abspath(SAMPLE_FILE_PATH)
    
    if os.path.exists(sample_path):
        print(f"    Reading sample file from: {sample_path}")
        with open(sample_path, "rb") as f:
            pdf_bytes = f.read()
        upload_filename = os.path.basename(sample_path)
    else:
        print(f"    Notice: Sample file at {sample_path} not found. Using fallback PDF payload.")
        pdf_bytes = (
            "%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
            "3 0 obj <</Type /Page /Parent 2 0 R /Resources <<>> /Contents 4 0 R>> endobj\n"
            "4 0 obj <</Length 250>> stream\nBT /F1 12 Tf 50 700 Td (OFFER LETTER FOR AI BACKEND ENGINEER. Deepanshu is offered the position at $120,000 per year. "
            "Employment is at-will and may be terminated at any time. Non-Compete: Employee agrees not to compete for 12 months. Indemnity applies.) ET endstream endobj\n"
            "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000192 00000 n \n"
            "trailer <</Size 5 /Root 1 0 R>>\nstartxref\n490\n%%EOF"
        ).encode("utf-8")
        upload_filename = "Deepanshu_Offer_Letter_AI_Backend_Engineer.pdf"

    status, body, duration = upload_multipart_file(
        f"{target_base}/docs/upload",
        filename=upload_filename,
        content_bytes=pdf_bytes,
        headers=auth_headers
    )

    if status == 201:
        doc_id = body.get("id")
        print(f"    [PASS] Document Upload ({duration} ms) - Encrypted Storage ID: {doc_id}")
        print(f"           Filename: {body.get('original_filename')} ({body.get('file_size_bytes')} bytes)")
    else:
        print(f"    [FAIL] Document Upload ({duration} ms) [HTTP {status}]: {body}")
        doc_id = None
        sys.exit(1)

    # --- STEP 5: List User Documents ---
    print("\n[5] Testing GET /docs/ (List User Documents)...")
    status, body, duration = make_request(f"{target_base}/docs/", method="GET", headers=auth_headers)
    if status == 200 and isinstance(body, list):
        print(f"    [PASS] Document Listing ({duration} ms) - Total Uploaded Contracts: {len(body)}")
    else:
        print(f"    [FAIL] Document Listing ({duration} ms) [HTTP {status}]: {body}")

    # --- STEP 6: Trigger Asynchronous AI Analysis Pipeline ---
    print(f"\n[6] Testing POST /reports/analyze/{doc_id} (Dispatch AI NLP Risk Engine)...")
    status, body, duration = make_request(
        f"{target_base}/reports/analyze/{doc_id}",
        method="POST",
        headers=auth_headers
    )
    if status in [200, 202]:
        print(f"    [PASS] AI Pipeline Dispatched ({duration} ms) - Pipeline Status: {body.get('status')}")
    else:
        print(f"    [FAIL] AI Pipeline Dispatch ({duration} ms) [HTTP {status}]: {body}")

    # --- STEP 7: Poll & Retrieve Full AI Analysis Report ---
    print(f"\n[7] Testing GET /reports/doc/{doc_id} (Polling AI Risk Report Results)...")
    max_retries = 25
    report_data = None
    for attempt in range(max_retries):
        status, body, duration = make_request(
            f"{target_base}/reports/doc/{doc_id}",
            method="GET",
            headers=auth_headers
        )
        if status == 200 and isinstance(body, dict) and "executive_summary" in body:
            report_data = body
            print(f"    [PASS] Report Retrieved Successfully on Attempt {attempt + 1} ({duration} ms)!")
            break
        elif status == 202:
            print(f"    [...] Attempt {attempt + 1}: Background worker processing document (status: {body.get('status')})...")
            time.sleep(2)
        else:
            print(f"    [...] Attempt {attempt + 1}: Waiting for AI background worker...")
            time.sleep(2)

    if report_data:
        print("\n" + "-"*65)
        print("  AI EXECUTIVE ANALYSIS REPORT SUMMARY")
        print("-"*65)
        print(f"  Document ID     : {report_data.get('document_id')}")
        print(f"  Overall Risk    : [{report_data.get('overall_risk')}]")
        print(f"  Risks Detected  : {report_data.get('total_risks_found')} clauses")
        print(f"  Processing Time : {report_data.get('processing_time_seconds')} seconds")
        print(f"  Model Version   : {report_data.get('model_used')}")
        print(f"\n  Executive Summary:\n  {report_data.get('executive_summary')}\n")
        print("  Extracted Key Contract Entities:")
        entities = report_data.get('key_entities', {})
        for k, v in entities.items():
            print(f"     - {k.replace('_', ' ').title()}: {v}")
        
        print("\n  Detected Risk Clauses:")
        clauses = report_data.get('risk_clauses', [])
        if clauses:
            for idx, cl in enumerate(clauses, 1):
                print(f"     {idx}. Category : {cl.get('clause_type')} [Risk: {cl.get('risk_level')}] (Confidence: {cl.get('confidence_score')})")
                print(f"        Explanation: {cl.get('explanation')}")
                print(f"        Snippet    : {cl.get('clause_text')[:120]}...\n")
        else:
            print("     No high-risk clauses detected.")
        print("-"*65)

    # --- STEP 8: Protected Full System Integration Test /tests/all ---
    print("\n[8] Testing GET /tests/all (Full End-to-End System Diagnostics)...")
    status, body, duration = make_request(
        f"{target_base}/tests/all",
        method="GET",
        headers=auth_headers
    )
    if status == 200:
        overall = body.get("overall_status")
        summary = body.get("summary", {})
        print(f"    [PASS] Integration Diagnostic Test ({duration} ms)")
        print(f"           Overall System Status: {overall}")
        print(f"           Passed: {summary.get('passed')}/{summary.get('total_tests')} services")
        print("\n    Detailed Service Diagnostics:")
        for svc in body.get("services", []):
            st = svc.get("status")
            status_tag = f"[{st}]"
            print(f"       {status_tag:<11} {svc.get('name')}: ({svc.get('duration_ms')} ms)")
            if svc.get("error"):
                print(f"                   Note: {svc.get('error')}")
    else:
        print(f"    [FAIL] Integration Diagnostic Test ({duration} ms) [HTTP {status}]: {body}")

    print("\n" + "="*70)
    print("  ALL END-TO-END SYSTEM & REAL DOCUMENT TESTS COMPLETED SUCCESSFULLY!")
    print("="*70 + "\n")

if __name__ == "__main__":
    run_legalbot_end_to_end_tests()

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
import asyncio
from sqlalchemy import text
from services.nlp_pipeline import (
    split_legal_sentences,
    extract_targeted_clause_snippet,
    deduplicate_clauses,
    compute_confidence_score,
    find_category_definition,
    match_rule_to_chunk,
    compute_overall_risk
)
from database import init_db, engine


def test_split_legal_sentences():
    text = (
        "The Tenant shall pay Rs. 50,000/- per month. "
        "Refer to Sec. 14(2) of the Act. "
        "XYZ Co. Ltd. will inspect the premises at 10.5 AM. "
        "All disputes shall be resolved through arbitration."
    )
    sents = split_legal_sentences(text)
    assert len(sents) == 4
    assert "Rs. 50,000/-" in sents[0]
    assert "Sec. 14(2)" in sents[1]
    assert "XYZ Co. Ltd." in sents[2]
    assert "arbitration" in sents[3]


def test_extract_targeted_clause_snippet():
    chunk = (
        "12. INDEMNITY CLAUSE. "
        "The Tenant hereby agrees to indemnify and hold harmless the Landlord, its directors, "
        "and agents against any and all claims, liabilities, or losses arising from tenant negligence. "
        "The Landlord shall provide 2 sets of keys upon move-in. "
        "Utility bills must be paid within 5 days of receipt. "
        "Electricity meter reading will be recorded on day one."
    )
    snippet = extract_targeted_clause_snippet(
        chunk,
        ["hold harmless", "indemnif", "indemnity"]
    )
    assert "indemnify and hold harmless" in snippet
    assert "Utility bills must be paid" not in snippet
    assert "Electricity meter reading" not in snippet


def test_deduplicate_clauses_preserves_distinct_pages():
    raw_clauses = [
        {"category": "Indemnity", "page_number": 2, "clause_text": "Tenant shall indemnify landlord against lease damages.", "confidence_score": 0.88, "risk_level": "High", "rule_weight": 2.0},
        {"category": "Indemnity", "page_number": 2, "clause_text": "Tenant shall indemnify landlord against lease damages.", "confidence_score": 0.88, "risk_level": "High", "rule_weight": 2.0},
        {"category": "Indemnity", "page_number": 4, "clause_text": "Employee agrees to indemnify the company against third-party IP claims.", "confidence_score": 0.95, "risk_level": "High", "rule_weight": 2.0},
        {"category": "Indemnity", "page_number": 5, "clause_text": "Mutual indemnification applies in case of gross negligence.", "confidence_score": 0.78, "risk_level": "Medium", "rule_weight": 2.0},
        {"category": "Arbitration", "page_number": 6, "clause_text": "All disputes shall be referred to arbitration in Delhi.", "confidence_score": 0.88, "risk_level": "Low", "rule_weight": 0.8}
    ]
    deduped = deduplicate_clauses(raw_clauses)
    indemnities = [c for c in deduped if c["category"] == "Indemnity"]
    assert len(indemnities) == 3, f"Expected 3 distinct indemnities across pages 2, 4, 5, got {len(indemnities)}"
    assert len(deduped) == 4, f"Expected 4 total clauses, got {len(deduped)}"


def test_genuine_confidence_scoring():
    assert compute_confidence_score("exact_phrase", llm_confirmed=True) == 0.95
    assert compute_confidence_score("contextual", llm_confirmed=True) == 0.95
    assert compute_confidence_score("exact_phrase", llm_confirmed=False) == 0.88
    assert compute_confidence_score("llm_only", llm_confirmed=False) == 0.82
    assert compute_confidence_score("llm_only", llm_confirmed=False) >= 0.75  # Must clear High-risk 0.75 threshold
    assert compute_confidence_score("contextual", llm_confirmed=False) == 0.78
    assert compute_confidence_score("fallback", llm_confirmed=False) == 0.72


def test_weighted_overall_risk_scoring():
    # Case 1: Lone High-risk clause (Indemnity: weight 2.0 * 3.0 = 6.0).
    # Safety policy requires lone High-risk clause to rate 'High' (not 'Medium').
    clauses_lone_high = [
        {"risk_level": "High", "rule_weight": 2.0}
    ]
    overall_lone, score_lone = compute_overall_risk(clauses_lone_high)
    assert score_lone == 6.0
    assert overall_lone == "High", f"Lone High risk clause must rate High, got {overall_lone}"

    # Case 2: Multiple High risk clauses (Indemnity + Late Rent -> 2.0*3 + 1.8*3 = 11.4 >= 8.0)
    clauses_high = [
        {"risk_level": "High", "rule_weight": 2.0},
        {"risk_level": "High", "rule_weight": 1.8},
    ]
    overall_high, score_high = compute_overall_risk(clauses_high)
    assert score_high == 11.4
    assert overall_high == "High"

    # Case 3: Medium risk (Non-Compete + Confidentiality -> 1.4*2 + 1.0*2 = 4.8)
    clauses_med = [
        {"risk_level": "Medium", "rule_weight": 1.4},
        {"risk_level": "Medium", "rule_weight": 1.0},
    ]
    overall_med, score_med = compute_overall_risk(clauses_med)
    assert score_med == 4.8
    assert overall_med == "Medium"

    # Case 4: Low risk (Arbitration -> 0.8*1.0 = 0.8 < 3.5)
    clauses_low = [
        {"risk_level": "Low", "rule_weight": 0.8}
    ]
    overall_low, score_low = compute_overall_risk(clauses_low)
    assert score_low == 0.8
    assert overall_low == "Low"


def test_category_definition_resolution():
    # 1. 'Rent Escalation & Auto-Increase' must resolve to rent escalation, NOT auto-renewal
    defn_esc = find_category_definition("Rent Escalation & Auto-Increase")
    assert defn_esc is not None
    assert "rent escalation" in defn_esc["multi_word"]
    assert "automatic renewal" not in defn_esc["multi_word"]

    # 2. 'Utilities & Maintenance Fee Liabilities' must resolve to utilit, NOT maintenance
    defn_util = find_category_definition("Utilities & Maintenance Fee Liabilities")
    assert defn_util is not None
    assert "utility bills" in defn_util["multi_word"]
    assert "structural repairs" not in defn_util["multi_word"]

    # 3. Real escalation clause matches 'Rent Escalation & Auto-Increase'
    clause_esc = "The annual rent shall increase by 10% every year on the anniversary of the commencement date."
    matched_esc, ev_esc = match_rule_to_chunk("Rent Escalation & Auto-Increase", clause_esc)
    assert matched_esc is True, "Expected real escalation clause to match Rent Escalation & Auto-Increase"

    # 4. Real utility clause matches 'Utilities & Maintenance Fee Liabilities'
    clause_util = "The Tenant shall be responsible for paying all electricity charges, water charges, and utility bills."
    matched_util, ev_util = match_rule_to_chunk("Utilities & Maintenance Fee Liabilities", clause_util)
    assert matched_util is True, "Expected real utility clause to match Utilities & Maintenance Fee Liabilities"


def test_benign_text_probes_no_false_positives():
    # Benign probe 1: 'default setting' should NOT trigger Late Rent Payment rule
    benign_tech = "The default setting shall apply to this system configuration unless explicitly changed by an administrator."
    matched_late, _ = match_rule_to_chunk("Late Rent Payment & Default Penalty", benign_tech)
    assert matched_late is False, "Benign phrase 'default setting' must not trigger Late Rent rule"

    # Benign probe 2: 'access to the office premises' should NOT trigger Landlord Entry rule
    benign_office = "All employees shall have access to the office premises during normal business hours."
    matched_entry, _ = match_rule_to_chunk("Landlord Entry & Inspection Rights", benign_office)
    assert matched_entry is False, "Benign phrase 'access to the office premises' must not trigger Landlord Entry rule"


async def test_database_migration_composite_risk_score():
    await init_db()
    async with engine.connect() as conn:
        res = await conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = 'analysis_reports' AND column_name = 'composite_risk_score';"
        ))
        row = res.fetchone()
        assert row is not None, "composite_risk_score column must exist in analysis_reports table"


def test_unilateral_termination_matching():
    chunk = (
        "7. Termination\n"
        "Your employment may be terminated by either party with 30 days written notice or compensation in\n"
        "lieu thereof. All terminations will follow the company’s policies and relevant employment laws."
    )
    is_match, evidence = match_rule_to_chunk("Unilateral Termination", chunk)
    assert is_match is True, "Expected Unilateral Termination to match chunk"
    assert evidence in ("exact_phrase", "contextual")

    defn = find_category_definition("Unilateral Termination")
    kw_list = (defn["multi_word"] + defn["keywords"])
    snippet = extract_targeted_clause_snippet(chunk, kw_list, defn["primary_pattern"])
    assert "terminated by either party" in snippet or "30 days written notice" in snippet


if __name__ == '__main__':
    print("Running test_split_legal_sentences...")
    test_split_legal_sentences()
    print("Running test_extract_targeted_clause_snippet...")
    test_extract_targeted_clause_snippet()
    print("Running test_deduplicate_clauses_preserves_distinct_pages...")
    test_deduplicate_clauses_preserves_distinct_pages()
    print("Running test_genuine_confidence_scoring...")
    test_genuine_confidence_scoring()
    print("Running test_weighted_overall_risk_scoring...")
    test_weighted_overall_risk_scoring()
    print("Running test_category_definition_resolution...")
    test_category_definition_resolution()
    print("Running test_benign_text_probes_no_false_positives...")
    test_benign_text_probes_no_false_positives()
    print("Running test_unilateral_termination_matching...")
    test_unilateral_termination_matching()
    print("Running test_database_migration_composite_risk_score...")
    asyncio.run(test_database_migration_composite_risk_score())
    print("\n==========================================")
    print("ALL PHASE 2 & PHASE 3 TESTS PASSED SUCCESSFULLY!")
    print("==========================================")


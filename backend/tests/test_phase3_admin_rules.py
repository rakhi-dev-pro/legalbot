import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
import asyncio
from sqlalchemy import text, select
from services.nlp_pipeline import (
    match_rule_to_chunk,
    compute_confidence_score,
    extract_targeted_clause_snippet,
    find_category_definition
)
from database import init_db, engine, AsyncSessionLocal
from models import RiskRulesConfig


def test_custom_keywords_matching():
    sample_clause = (
        "The Vendor agrees to comply with all European General Data Protection Regulation (GDPR) standards "
        "and maintain comprehensive audit logs of all personal data access."
    )

    # Without custom keywords, a brand new category 'GDPR Compliance' won't match
    is_match, _ = match_rule_to_chunk("GDPR Compliance", sample_clause)
    assert is_match is False

    # With admin-configured custom keywords, it matches immediately
    custom_kws = "gdpr, data protection, personal data"
    is_match_kw, evidence = match_rule_to_chunk("GDPR Compliance", sample_clause, custom_keywords=custom_kws)
    assert is_match_kw is True
    assert evidence in ("exact_phrase", "contextual")


def test_confidence_threshold_filtering():
    # Contextual evidence gives 0.78
    conf_contextual = compute_confidence_score("contextual", llm_confirmed=False)
    assert conf_contextual == 0.78

    # If admin sets threshold to 0.75, it passes
    thresh_low = 0.75
    assert conf_contextual >= thresh_low

    # If admin raises threshold to 0.85, it is filtered out
    thresh_high = 0.85
    assert conf_contextual < thresh_high


async def test_risk_rules_config_keywords_column():
    await init_db()
    async with AsyncSessionLocal() as session:
        # Verify keywords column can be queried and set
        res = await session.execute(select(RiskRulesConfig).limit(1))
        rule = res.scalar_one_or_none()
        if rule:
            original_kw = rule.keywords
            rule.keywords = "test_kw_1, test_kw_2"
            await session.commit()
            await session.refresh(rule)
            assert rule.keywords == "test_kw_1, test_kw_2"
            # Restore
            rule.keywords = original_kw
            await session.commit()


if __name__ == '__main__':
    print("Running test_custom_keywords_matching...")
    test_custom_keywords_matching()
    print("Running test_confidence_threshold_filtering...")
    test_confidence_threshold_filtering()
    print("Running test_risk_rules_config_keywords_column...")
    asyncio.run(test_risk_rules_config_keywords_column())
    print("\n==========================================")
    print("ALL PHASE 3 ADMIN TESTS PASSED SUCCESSFULLY!")
    print("==========================================")

import time
import json
import uuid
import asyncio
import logging
import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Document, DocumentChunk, AnalysisReport, RiskClause, RiskRulesConfig, DocumentStatus
from services.file_service import read_decrypted_file
from services.document_parser import extract_document_text
from services.text_chunker import create_document_chunks, extract_contract_entities

logger = logging.getLogger("legalbot.nlp_pipeline")

# Controlled concurrency semaphore to prevent llama.cpp slot collisions and task cancellations
_LLM_SEMAPHORE = asyncio.Semaphore(1)


async def call_llama_cpp_completion(prompt: str, system_prompt: str = "You are an expert legal AI assistant.", max_tokens: int = 250, timeout: float = 12.0) -> str:
    """Call local llama.cpp server for text generation with controlled concurrency."""
    url = f"{settings.LLAMA_CPP_URL}/v1/chat/completions"
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2
    }

    async with _LLM_SEMAPHORE:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
            else:
                raise RuntimeError(f"llama.cpp error {resp.status_code}: {resp.text}")


# ---------------------------------------------------------------------------
# Comprehensive Keyword rule matching for contracts, leases, and offer letters.
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS = {
    "indemnity": lambda t: "indemnif" in t or "hold harmless" in t,
    "termination": lambda t: ("terminat" in t and ("without cause" in t or "at any time" in t or "written notice" in t or "notice" in t or "automatically terminated" in t or "in lieu" in t or "policy" in t)) or "notice to vacate" in t,
    "liability": lambda t: "limitation of liability" in t or "maximum liability" in t or "consequential damages" in t,
    "eviction": lambda t: ("evict" in t) or ("vacate" in t and ("notice" in t or "handover" in t or "possession" in t or "premises" in t)),
    "late rent": lambda t: ("late fee" in t or "interest on default" in t) or (bool(re.search(r'\blate\b', t)) and "rent" in t and ("penalty" in t or "default" in t)),
    "deposit": lambda t: "security deposit" in t or (bool(re.search(r'\bdeposit\b', t)) and bool(re.search(r'\b(forfeit|deduct|refund|withhold)\b', t))),
    "non-compete": lambda t: "non-compete" in t or "non-solicitation" in t or ("solicit" in t and ("client" in t or "employee" in t or "customer" in t)),
    "auto": lambda t: bool(re.search(r'\b(auto-renew|automatic renewal|automatically renews?)\b', t, re.IGNORECASE)),
    "governing law": lambda t: "governing law" in t or "jurisdiction" in t,
    "confidentiality": lambda t: bool(re.search(r'\b(confidential|non-disclosure|nda|trade secrets?|proprietary information)\b', t, re.IGNORECASE)),
    "arbitration": lambda t: "arbitrat" in t and ("dispute" in t or "binding" in t),
    "force majeure": lambda t: "force majeure" in t,
    "rent escalation": lambda t: ("rent" in t and ("increment" in t or "increase" in t or "escalat" in t)),
    "subleas": lambda t: "sublet" in t or "subleas" in t or "assignment restriction" in t or "assign or transfer" in t,
    "maintenance": lambda t: ("repair" in t and ("tenant" in t or "second party" in t or "cost" in t)),
    "landlord entry": lambda t: ("inspect" in t or "entry" in t or "access" in t) and ("landlord" in t or "first party" in t or "premises" in t or "property" in t),
    "utilit": lambda t: bool(re.search(r'\b(utilit(y|ies)|electricity|water charges?|maintenance fee)\b', t, re.IGNORECASE)) and ("tenant" in t or "second party" in t or "occupant" in t),
    "probation": lambda t: bool(re.search(r'\b(probation|probationary)\b', t, re.IGNORECASE)),
    "intellectual property": lambda t: "intellectual property" in t or "ip assignment" in t or "inventions" in t or "work product" in t,
}


def match_rule_to_chunk(rule_category_lower: str, chunk_text_lower: str) -> bool:
    """Keyword match helper, used to ensure reliable risk detection across all contract types."""
    for key, matcher_fn in CATEGORY_KEYWORDS.items():
        if key in rule_category_lower:
            if matcher_fn(chunk_text_lower):
                return True
    return False


def _strip_json_fences(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    return cleaned.strip()


async def classify_chunk_with_llm(chunk_text: str, active_rules: list):
    """
    Zero-shot risk classification: ask the local LLM which of the
    *currently configured* risk categories apply to this chunk.

    Returns:
        list[str] of matched category names on success,
        None if the LLM call failed or its output couldn't be parsed.
    """
    if not active_rules:
        return []

    category_list = "\n".join(
        f"- {r.category}: {r.description or 'No description provided.'}"
        for r in active_rules
    )
    prompt = (
        "You are reviewing one excerpt from a legal contract/employment document against the risk "
        "categories listed below. Return ONLY a JSON array of the category "
        "names (exact strings from the list) that genuinely apply to this "
        "excerpt. Return [] if none apply. No prose, no markdown fences, no "
        "explanation -- a raw JSON array only.\n\n"
        f"RISK CATEGORIES:\n{category_list}\n\n"
        f"EXCERPT:\n\"{chunk_text[:1200]}\""
    )
    try:
        raw = await call_llama_cpp_completion(
            prompt=prompt,
            system_prompt="You are a precise contract-risk classifier. Reply with a raw JSON array only.",
            max_tokens=200
        )
        matched = json.loads(_strip_json_fences(raw))
        if not isinstance(matched, list):
            return None
        valid_categories = {r.category for r in active_rules}
        return [c for c in matched if c in valid_categories]
    except Exception as e:
        logger.info(f"LLM classification failed for chunk, will use keyword fallback: {e}")
        return None


def deduplicate_clauses(raw_clauses: list) -> list:
    """
    Merge duplicate risk clause detections by category, keeping the
    longest clause_text and earliest page_number per category.
    """
    category_map = {}
    for clause in raw_clauses:
        cat = clause["category"]
        if cat not in category_map:
            category_map[cat] = clause
        else:
            existing = category_map[cat]
            if len(clause["clause_text"]) > len(existing["clause_text"]):
                clause["page_number"] = min(
                    existing.get("page_number") or 999,
                    clause.get("page_number") or 999
                )
                category_map[cat] = clause
            else:
                existing["page_number"] = min(
                    existing.get("page_number") or 999,
                    clause.get("page_number") or 999
                )
    return list(category_map.values())


async def generate_clause_recommendation(clause_category: str, clause_text: str) -> str:
    """Generate an actionable recommendation for a detected risk clause."""
    snippet = clause_text[:800]
    prompt = (
        f"You are a legal counsel advising a client reviewing a contract/employment offer.\n"
        f"A risk clause of type \"{clause_category}\" was detected.\n\n"
        f"CLAUSE TEXT:\n\"{snippet}\"\n\n"
        f"Provide exactly 2-3 concise, actionable sentences recommending what the client should do. "
        f"Focus on negotiation points, protective amendments, or red flags to escalate to a lawyer. "
        f"Do NOT repeat the clause text. Be direct and practical."
    )
    try:
        return await call_llama_cpp_completion(
            prompt=prompt,
            system_prompt="You are a senior legal advisor. Give brief, actionable contract review guidance.",
            max_tokens=150
        )
    except Exception as e:
        logger.warning(f"LLM recommendation generation failed for {clause_category}: {e}")
        return f"Review this {clause_category} clause carefully with your legal counsel before signing."


async def process_document_ai_analysis(doc_id: uuid.UUID, async_session_factory):
    """
    Asynchronous NLP Analysis Engine for LegalBot:
    1. Read Encrypted Document File
    2. Extract Plain Text (PDF/DOCX) with geometry-driven OCR fallback
    3. Extract Entities (Parties, Dates, Law, Amounts) & Segment Chunks
    4. Generate Executive Summary via local LLM
    5. Hybrid Risk Clause Classification (Union of keyword rule matching AND LLM zero-shot)
    6. Deduplicate clauses & Generate LLM Action Recommendations
    7. Persist Analysis Report & Risk Clauses to PostgreSQL
    """
    start_time = time.time()
    logger.info(f"Starting AI Analysis Pipeline for Document ID: {doc_id}")

    async with async_session_factory() as session:
        try:
            result = await session.execute(select(Document).where(Document.id == doc_id))
            document = result.scalar_one_or_none()
            if not document:
                logger.error(f"Document ID {doc_id} not found in database.")
                return

            document.status = DocumentStatus.PROCESSING
            await session.commit()

            # 2. Read & Extract Text
            encrypted_path = document.storage_path
            file_bytes = read_decrypted_file(encrypted_path)
            full_text, pages_list = extract_document_text(file_bytes, document.file_type)

            if not full_text.strip():
                raise ValueError("Extracted document text is empty. PDF/DOCX might be scanned images.")

            # 3. Entities & Chunks
            entities = extract_contract_entities(full_text)
            chunks_data = create_document_chunks(pages_list, max_chunk_words=300)

            for cdata in chunks_data:
                chunk_obj = DocumentChunk(
                    document_id=doc_id,
                    chunk_index=cdata["chunk_index"],
                    chunk_text=cdata["text"],
                    page_number=cdata["page_number"],
                    token_count=cdata["token_count"]
                )
                session.add(chunk_obj)

            # 4. Executive Summarization
            summary_char_budget = getattr(settings, "SUMMARY_INPUT_CHAR_BUDGET", 4000)
            sample_text = full_text[:summary_char_budget]
            summary_prompt = (
                "Provide a clear, executive plain-English summary of the following legal document / employment offer. "
                "Highlight the document purpose, primary obligations, term/duration, payment/compensation details, and termination rights.\n\n"
                f"DOCUMENT TEXT:\n{sample_text}"
            )
            try:
                executive_summary = await call_llama_cpp_completion(
                    prompt=summary_prompt,
                    system_prompt="You are an expert legal document analyst. Be concise, clear, and plain-English.",
                    max_tokens=400
                )
            except Exception as e:
                logger.warning(f"Local LLM summarization fallback used: {e}")
                executive_summary = f"Summary of {document.original_filename}: Legal agreement containing {len(chunks_data)} clause sections."

            # 5. Hybrid Risk Clause Classification
            # Takes the union of Keyword Rule Matches and LLM Zero-Shot Matches so no risk clause is missed!
            rules_res = await session.execute(select(RiskRulesConfig).where(RiskRulesConfig.is_active == True))
            active_rules = rules_res.scalars().all()

            raw_detected_clauses = []

            classification_tasks = [
                classify_chunk_with_llm(chunk["text"], active_rules) for chunk in chunks_data
            ]
            classification_results = await asyncio.gather(*classification_tasks, return_exceptions=True)

            for chunk, llm_result in zip(chunks_data, classification_results):
                chunk_text_lower = chunk["text"].lower()
                matched_rule_ids = set()
                matched_rules = []

                # 1. Evaluate Keyword Rules
                for rule in active_rules:
                    if match_rule_to_chunk(rule.category.lower(), chunk_text_lower):
                        matched_rules.append(rule)
                        matched_rule_ids.add(rule.id)

                # 2. Add LLM Zero-Shot Matches
                if isinstance(llm_result, list):
                    for rule in active_rules:
                        if rule.category in llm_result and rule.id not in matched_rule_ids:
                            matched_rules.append(rule)
                            matched_rule_ids.add(rule.id)

                for rule in matched_rules:
                    raw_detected_clauses.append({
                        "category": rule.category,
                        "clause_text": chunk["text"],
                        "explanation": rule.description or f"Flagged risky clause under category {rule.category}.",
                        "risk_level": rule.default_risk_level,
                        "confidence_score": round(rule.confidence_threshold + 0.15, 2),
                        "page_number": chunk["page_number"]
                    })

            # 6. Deduplicate & Recommend
            detected_clauses = deduplicate_clauses(raw_detected_clauses)
            total_risk_count = len(detected_clauses)
            has_high_risk = any(c["risk_level"] == "High" for c in detected_clauses)

            rec_tasks = [
                generate_clause_recommendation(c["category"], c["clause_text"])
                for c in detected_clauses
            ]
            recommendations = await asyncio.gather(*rec_tasks, return_exceptions=True)
            for idx, c in enumerate(detected_clauses):
                rec = recommendations[idx]
                c["recommendation"] = rec if isinstance(rec, str) and rec.strip() else \
                    f"Review this {c['category']} clause carefully with your legal counsel before signing."

            if has_high_risk or total_risk_count >= 3:
                overall_risk = "High"
            elif total_risk_count > 0:
                overall_risk = "Medium"
            else:
                overall_risk = "Low"

            # 7. Persist
            duration = round(time.time() - start_time, 2)
            report = AnalysisReport(
                document_id=doc_id,
                executive_summary=executive_summary,
                key_entities=entities,
                overall_risk=overall_risk,
                total_risks_found=total_risk_count,
                processing_time_seconds=duration,
                model_used=settings.LLM_MODEL_FILE
            )
            session.add(report)
            await session.flush()

            for clause_data in detected_clauses:
                clause_obj = RiskClause(
                    report_id=report.id,
                    clause_type=clause_data["category"],
                    clause_text=clause_data["clause_text"],
                    explanation=clause_data["explanation"],
                    risk_level=clause_data["risk_level"],
                    confidence_score=clause_data["confidence_score"],
                    page_number=clause_data["page_number"],
                    recommendation=clause_data.get("recommendation")
                )
                session.add(clause_obj)

            document.status = DocumentStatus.COMPLETED
            await session.commit()
            logger.info(f"AI Analysis Pipeline completed successfully for Document ID {doc_id} in {duration}s")

        except Exception as e:
            await session.rollback()
            logger.error(f"AI Analysis Pipeline failed for Document ID {doc_id}: {str(e)}")
            try:
                await session.execute(
                    update(Document)
                    .where(Document.id == doc_id)
                    .values(status=DocumentStatus.FAILED, error_message=str(e))
                )
                await session.commit()
            except Exception:
                pass

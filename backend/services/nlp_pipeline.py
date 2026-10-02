import re
import time
import json
import uuid
import asyncio
import logging
import httpx
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Document, DocumentChunk, AnalysisReport, RiskClause, RiskRulesConfig, DocumentStatus
from services.file_service import read_decrypted_file
from services.document_parser import extract_document_text
from services.text_chunker import create_document_chunks, extract_contract_entities

from typing import List, Dict, Any, Tuple, Optional, Set

logger = logging.getLogger("legalbot.nlp_pipeline")

# Controlled concurrency semaphore to prevent llama.cpp slot collisions and task cancellations
_LLM_SEMAPHORE = asyncio.Semaphore(1)


async def call_llama_cpp_completion(
    prompt: str,
    system_prompt: str = "You are an expert legal AI assistant.",
    max_tokens: int = 250,
    timeout: float = None
) -> str:
    """Call local llama.cpp server for text generation with controlled concurrency."""
    actual_timeout = timeout if timeout is not None else getattr(settings, "LLM_TIMEOUT_SECONDS", 90.0)
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
        async with httpx.AsyncClient(timeout=actual_timeout) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
            else:
                raise RuntimeError(f"llama.cpp error {resp.status_code}: {resp.text}")


# ---------------------------------------------------------------------------
# Phase 2: Comprehensive Category Rules & Detection Evidence
# ---------------------------------------------------------------------------

CATEGORY_RULE_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "indemnity": {
        "multi_word": [
            "hold harmless", "indemnify and hold", "defend and hold harmless",
            "indemnify the landlord", "indemnify the employer", "indemnify and defend",
            "indemnify and keep indemnified", "indemnify, defend, and hold"
        ],
        "primary_pattern": re.compile(r'\bindemn\w*', re.IGNORECASE),
        "context_terms": ["loss", "losses", "damage", "damages", "claim", "claims", "cost", "costs", "expense", "expenses", "harmless", "defend", "liability"],
        "keywords": ["indemnif", "indemnity", "hold harmless", "defend"]
    },
    "termination": {
        "multi_word": [
            "without cause", "notice to vacate", "in lieu of notice", "automatically terminated",
            "terminate this agreement", "prior written notice", "written notice of termination",
            "immediate termination", "termination without notice", "written notice", "in lieu of",
            "in lieu thereof", "compensation in lieu", "notice of termination", "terminated by either party",
            "terminate employment", "termination of employment", "notice period", "days written notice"
        ],
        "primary_pattern": re.compile(r'\b(terminat\w*|dismiss\w*|severance|resign\w*)\b', re.IGNORECASE),
        "context_terms": ["notice", "immediate", "without cause", "at any time", "cause", "days", "month", "policy", "written", "employment", "party", "compensation"],
        "keywords": ["terminat", "terminate", "termination", "terminated", "without cause", "notice to vacate", "in lieu", "written notice", "compensation in lieu", "notice period"]
    },
    "liability": {
        "multi_word": [
            "limitation of liability", "maximum liability", "consequential damages",
            "indirect damages", "aggregate liability", "cap on liability",
            "cumulative liability", "punitive damages"
        ],
        "primary_pattern": re.compile(r'\bliabilit(?:y|ies)\b', re.IGNORECASE),
        "context_terms": ["limitation", "maximum", "cap", "consequential", "indirect", "exceed", "aggregate", "damages"],
        "keywords": ["limitation of liability", "maximum liability", "consequential damages", "aggregate liability"]
    },
    "eviction": {
        "multi_word": [
            "notice to vacate", "summary eviction", "peaceful possession",
            "quit and vacate", "handover vacant possession", "forfeiture of lease",
            "handover possession", "vacate the premises"
        ],
        "primary_pattern": re.compile(r'\b(evict\w*|vacat\w*)\b', re.IGNORECASE),
        "context_terms": ["possession", "handover", "notice", "premises", "landlord", "tenancy", "quit", "forfeiture"],
        "keywords": ["evict", "vacate", "handover", "possession", "premises"]
    },
    "late rent": {
        "multi_word": [
            "late fee", "interest on default", "default interest", "late payment fee",
            "overdue rent", "penalty of rs", "default penalty", "delayed payment"
        ],
        "primary_pattern": re.compile(r'\b(late|default\w*|overdue|penalt\w*)\b', re.IGNORECASE),
        "context_terms": ["rent", "fee", "interest", "payment", "due", "charges", "default", "penalty"],
        "keywords": ["late fee", "interest on default", "default penalty", "late rent", "penalty"]
    },
    "deposit": {
        "multi_word": [
            "security deposit", "non-refundable deposit", "forfeiture of deposit",
            "deposit refund", "deduction from deposit", "refund of the security deposit",
            "withhold the deposit"
        ],
        "primary_pattern": re.compile(r'\b(security\s+)?deposit\w*\b', re.IGNORECASE),
        "context_terms": ["forfeit", "deduct", "refund", "withhold", "advance", "non-refundable", "security"],
        "keywords": ["security deposit", "deposit", "forfeit", "deduct", "withhold", "refund"]
    },
    "non-compete": {
        "multi_word": [
            "non-compete", "non-solicitation", "restrictive covenant",
            "solicit any client", "solicit any employee", "competing business",
            "covenant not to compete", "restraint of trade"
        ],
        "primary_pattern": re.compile(r'\b(non-compete|non-solicit\w*|solicit\w*|restraint)\b', re.IGNORECASE),
        "context_terms": ["client", "customer", "employee", "business", "months", "territory", "engage", "competing"],
        "keywords": ["non-compete", "non-solicitation", "solicit", "restrictive covenant"]
    },
    "auto": {
        "multi_word": [
            "automatic renewal", "automatically renews", "automatically renew",
            "auto-renew", "renew automatically", "automatic extension"
        ],
        "primary_pattern": re.compile(r'\b(auto-renew\w*|automatic\s+renewal|automatically\s+renews?)\b', re.IGNORECASE),
        "context_terms": ["written", "notice", "extension", "period", "expire", "subsequent"],
        "keywords": ["automatic renewal", "automatically renew", "auto-renew"]
    },
    "governing law": {
        "multi_word": [
            "governing law", "exclusive jurisdiction", "courts of",
            "governed by the laws", "subject to the jurisdiction",
            "laws of india", "dispute resolution and jurisdiction"
        ],
        "primary_pattern": re.compile(r'\b(governing\s+law|jurisdiction)\b', re.IGNORECASE),
        "context_terms": ["governed", "exclusive", "dispute", "construed", "subject", "laws", "court"],
        "keywords": ["governing law", "jurisdiction", "exclusive jurisdiction", "courts of"]
    },
    "confidentiality": {
        "multi_word": [
            "non-disclosure", "trade secret", "proprietary information",
            "confidential information", "duty of confidentiality", "confidentiality agreement"
        ],
        "primary_pattern": re.compile(r'\b(confident\w*|non-disclosure|nda|trade\s+secrets?|proprietary\s+information)\b', re.IGNORECASE),
        "context_terms": ["proprietary", "recipient", "obligation", "unauthorized", "information", "disclosure", "secret"],
        "keywords": ["confidential", "non-disclosure", "trade secrets", "proprietary information"]
    },
    "arbitration": {
        "multi_word": [
            "binding arbitration", "arbitral tribunal", "arbitration and conciliation",
            "arbitration act", "sole arbitrator", "arbitration proceedings"
        ],
        "primary_pattern": re.compile(r'\barbitrat\w*', re.IGNORECASE),
        "context_terms": ["dispute", "binding", "award", "panel", "tribunal", "rules", "arbitrator"],
        "keywords": ["arbitration", "arbitrate", "binding arbitration", "arbitral tribunal"]
    },
    "force majeure": {
        "multi_word": [
            "force majeure", "act of god", "beyond reasonable control",
            "unforeseen circumstances", "frustration of contract"
        ],
        "primary_pattern": re.compile(r'\bforce\s+majeure\b', re.IGNORECASE),
        "context_terms": ["event", "delay", "prevent", "performance", "obligation", "circumstances"],
        "keywords": ["force majeure", "act of god", "beyond reasonable control"]
    },
    "rent escalation": {
        "multi_word": [
            "rent escalation", "rent increment", "annual increment",
            "increase in rent", "escalation of rent", "escalation clause"
        ],
        "primary_pattern": re.compile(r'\b(rent\w*|lease\w*)\b', re.IGNORECASE),
        "context_terms": ["escalat", "increment", "increase", "annual", "percentage", "rate", "year"],
        "keywords": ["rent escalation", "rent increment", "increase in rent", "escalat"]
    },
    "subleas": {
        "multi_word": [
            "subletting or assignment", "assignment restriction", "assign or transfer",
            "part with possession", "underlet or sublet", "assign this agreement"
        ],
        "primary_pattern": re.compile(r'\b(sublet\w*|subleas\w*|assignment\s+restriction)\b', re.IGNORECASE),
        "context_terms": ["tenant", "premises", "permission", "consent", "written", "transfer", "assign"],
        "keywords": ["sublet", "sublease", "assignment restriction", "assign or transfer"]
    },
    "maintenance": {
        "multi_word": [
            "structural repairs", "major repairs", "wear and tear",
            "maintenance and repairs", "tenant shall repair", "keep in good repair"
        ],
        "primary_pattern": re.compile(r'\b(repair\w*|maintenance|maintain\w*)\b', re.IGNORECASE),
        "context_terms": ["tenant", "second party", "cost", "damage", "wear and tear", "structural"],
        "keywords": ["maintenance", "repair", "structural repairs", "wear and tear"]
    },
    "landlord entry": {
        "multi_word": [
            "right of entry", "inspect the premises", "enter upon the premises",
            "inspection of premises", "access at reasonable times", "entry by landlord"
        ],
        "primary_pattern": re.compile(r'\b(inspect\w*|entry|access)\b', re.IGNORECASE),
        "context_terms": ["landlord", "first party", "premises", "property", "reasonable hours", "inspection"],
        "keywords": ["landlord entry", "inspect", "entry", "access to premises"]
    },
    "utilit": {
        "multi_word": [
            "electricity charges", "water charges", "maintenance charges",
            "utility charges", "utility bills", "common area maintenance"
        ],
        "primary_pattern": re.compile(r'\b(utilit(?:y|ies)|electricity|water\s+charges?|maintenance\s+fee)\b', re.IGNORECASE),
        "context_terms": ["tenant", "second party", "occupant", "bill", "meter", "payment"],
        "keywords": ["utility", "utilities", "electricity", "water charges", "maintenance fee"]
    },
    "probation": {
        "multi_word": [
            "probation period", "probationary period", "confirmation of employment",
            "confirmation of service", "period of probation"
        ],
        "primary_pattern": re.compile(r'\b(probation\w*)\b', re.IGNORECASE),
        "context_terms": ["period", "months", "evaluation", "confirmation", "performance", "employment"],
        "keywords": ["probation", "probationary", "probation period"]
    },
    "intellectual property": {
        "multi_word": [
            "intellectual property", "ip assignment", "work for hire",
            "work product", "inventions and patents", "proprietary rights",
            "assignment of inventions"
        ],
        "primary_pattern": re.compile(r'\b(intellectual\s+property|ip\s+assignment|invention\w*|work\s+product)\b', re.IGNORECASE),
        "context_terms": ["property", "assign", "employer", "work", "rights", "ownership", "inventions"],
        "keywords": ["intellectual property", "ip assignment", "inventions", "work product"]
    },
}


def find_category_definition(rule_category: str) -> Optional[Dict[str, Any]]:
    """Resolve category definition dict by fuzzy category key matching."""
    cat_lower = (rule_category or "").lower()
    for key, defn in CATEGORY_RULE_DEFINITIONS.items():
        if key in cat_lower:
            return defn
    return None


def match_rule_to_chunk(rule_category: str, chunk_text: str) -> Tuple[bool, str]:
    """
    Check if a chunk matches a rule category.
    Returns (is_match, evidence_type) where evidence_type can be:
    - 'exact_phrase': matched an exact multi-word phrase
    - 'contextual': matched primary pattern + context word
    - 'none': no match
    """
    defn = find_category_definition(rule_category)
    text_lower = chunk_text.lower()
    text_norm = " ".join(text_lower.split())

    if not defn:
        if rule_category.lower() in text_lower or rule_category.lower() in text_norm:
            return True, "contextual"
        return False, "none"

    # 1. Multi-word phrase check (strongest evidence)
    for phrase in defn["multi_word"]:
        if phrase in text_lower or phrase in text_norm:
            return True, "exact_phrase"

    # 2. Primary pattern check + context terms
    if defn["primary_pattern"].search(chunk_text):
        for ctx in defn["context_terms"]:
            if ctx in text_lower or ctx in text_norm:
                return True, "contextual"

    return False, "none"


def compute_confidence_score(evidence_type: str, llm_confirmed: bool) -> float:
    """
    Dynamically calculate confidence based on detection evidence:
    - 0.95: Both deterministic regex rules AND LLM zero-shot classifier independently flag the clause.
    - 0.88: Exact multi-word keyword phrase match (e.g. 'automatic renewal', 'hold harmless and indemnify').
    - 0.78: Single keyword match in combination with related contextual terms.
    - 0.72: Fallback classification score.
    """
    if llm_confirmed and evidence_type in ("exact_phrase", "contextual"):
        return 0.95
    if evidence_type == "exact_phrase":
        return 0.88
    if evidence_type == "contextual":
        return 0.78
    return 0.72


# ---------------------------------------------------------------------------
# Clause-Level Sentence Extraction Helper
# ---------------------------------------------------------------------------

def split_legal_sentences(text: str) -> List[str]:
    """
    Split legal text into sentences while protecting legal citations,
    currency, abbreviations (Rs., Sec., No., Ltd., Pvt., v., etc.), and decimal numbers.
    """
    if not text or not text.strip():
        return []

    abbrevs = [
        r'\bRs\.', r'\bSec\.', r'\bSecs\.', r'\bNo\.', r'\bNos\.', r'\bArt\.', r'\bArts\.',
        r'\bCl\.', r'\bCls\.', r'\bpara\.', r'\bparas\.', r'\bLtd\.', r'\bPvt\.',
        r'\bInc\.', r'\bCorp\.', r'\bCo\.', r'\bDr\.', r'\bMr\.', r'\bMrs\.', r'\bMs\.',
        r'\bv\.', r'\bvs\.', r'\bviz\.', r'\bi\.e\.', r'\be\.g\.', r'\betc\.', r'\bal\.'
    ]

    temp_text = text
    protected: Dict[str, str] = {}

    def replacer(match):
        token = f"__ABBR_{len(protected)}__"
        protected[token] = match.group(0)
        return token

    # Protect decimals: digits followed by period and digits
    temp_text = re.sub(r'(?<=\d)\.(?=\d)', replacer, temp_text)

    # Protect known abbreviations
    for abbr in abbrevs:
        temp_text = re.sub(abbr, replacer, temp_text, flags=re.IGNORECASE)

    # Split on sentence boundaries:
    # 1. Period, exclamation, or question mark followed by whitespace or newline
    # 2. Semicolons followed by newline
    # 3. Double newlines (paragraphs)
    raw_sentences = re.split(r'(?:[\.\?!]+(?:\s+|\n+)|;\s*\n+|\n{2,})', temp_text)

    restored_sentences = []
    for s in raw_sentences:
        s_clean = s.strip()
        if not s_clean:
            continue
        # Restore protected tokens
        for token, original in protected.items():
            s_clean = s_clean.replace(token, original)
        restored_sentences.append(s_clean)

    return restored_sentences


def extract_targeted_clause_snippet(
    chunk_text: str,
    category_keywords: list,
    pattern: Optional[re.Pattern] = None
) -> str:
    """
    Split the chunk into natural sentence boundaries (handling legal citations, abbreviations).
    Score each sentence based on keyword hits and return the specific 1–2 offending sentences
    (typically 20–60 words) instead of dumping the entire 300-word chunk.
    """
    if not chunk_text or not chunk_text.strip():
        return ""

    sentences = split_legal_sentences(chunk_text)
    if not sentences:
        return chunk_text[:250].strip()

    if len(sentences) == 1:
        return sentences[0].strip()

    scored = []
    kw_lower = [k.lower() for k in category_keywords if k]

    for idx, sentence in enumerate(sentences):
        sent_lower = sentence.lower()
        score = 0.0

        # Pattern match bonus
        if pattern and pattern.search(sentence):
            score += 4.0

        for kw in kw_lower:
            if " " in kw:
                # Multi-word phrase
                if kw in sent_lower:
                    score += 3.0
            else:
                # Single keyword
                if kw in sent_lower:
                    score += 1.0

        scored.append((score, idx, sentence))

    # Sort by score descending
    scored_sorted = sorted(scored, key=lambda x: x[0], reverse=True)
    best_score, best_idx, best_sent = scored_sorted[0]

    if best_score == 0:
        # Fallback: take the first sentence or up to 2 sentences if brief
        combined = sentences[0]
        if len(sentences) > 1 and len(combined.split()) < 25:
            combined = f"{sentences[0]} {sentences[1]}"
        return combined.strip()

    # Expand to 1-2 offending sentences (capped at ~60-65 words)
    selected_indices = [best_idx]
    best_words = len(best_sent.split())

    # Check next sentence
    if best_idx + 1 < len(sentences):
        next_score = scored[best_idx + 1][0]
        next_words = len(sentences[best_idx + 1].split())
        if (next_score > 0 or best_sent.rstrip().endswith(":")) and (best_words + next_words <= 65):
            selected_indices.append(best_idx + 1)

    # If next wasn't added, check preceding sentence
    if len(selected_indices) == 1 and best_idx - 1 >= 0:
        prev_score = scored[best_idx - 1][0]
        prev_words = len(sentences[best_idx - 1].split())
        if prev_score > 0 and (best_words + prev_words <= 65):
            selected_indices.insert(0, best_idx - 1)

    result_sentences = [sentences[i].strip() for i in selected_indices]
    return " ".join(result_sentences).strip()


# ---------------------------------------------------------------------------
# Granular Multi-Clause Deduplication (Token Jaccard & Page Bounds)
# ---------------------------------------------------------------------------

def _token_jaccard_similarity(text1: str, text2: str) -> float:
    t1 = set(re.findall(r'\b\w+\b', (text1 or "").lower()))
    t2 = set(re.findall(r'\b\w+\b', (text2 or "").lower()))
    if not t1 or not t2:
        return 0.0
    return len(t1.intersection(t2)) / len(t1.union(t2))


def deduplicate_clauses(raw_clauses: list) -> list:
    """
    Granular deduplication:
    - Retains multiple distinct clauses under the same category across pages
      or distinct obligations on the same page.
    - Collapses overlapping duplicate clauses (e.g. sliding window chunks)
      based on token Jaccard similarity (> 0.75) or identical normalized text.
    - When merging duplicates, preserves the earliest page_number and higher confidence.
    """
    deduped = []
    for clause in raw_clauses:
        matched_idx = None
        c_text_norm = " ".join((clause.get("clause_text") or "").lower().split())

        for idx, existing in enumerate(deduped):
            # Only compare clauses of same category
            if existing["category"].lower() != clause["category"].lower():
                continue

            e_text_norm = " ".join((existing.get("clause_text") or "").lower().split())

            # 1. Exact or normalized text match
            if c_text_norm == e_text_norm:
                matched_idx = idx
                break

            # 2. Token Jaccard similarity
            jaccard = _token_jaccard_similarity(clause.get("clause_text", ""), existing.get("clause_text", ""))

            # Same page: collapse if high similarity or substring match (chunking overlap)
            same_page = clause.get("page_number") == existing.get("page_number")
            if same_page:
                if jaccard > 0.65 or (c_text_norm in e_text_norm) or (e_text_norm in c_text_norm):
                    matched_idx = idx
                    break
            else:
                # Across different pages: only duplicate if token Jaccard > 0.75 (identical boilerplate repeated)
                if jaccard > 0.75:
                    matched_idx = idx
                    break

        if matched_idx is None:
            deduped.append(clause)
        else:
            existing = deduped[matched_idx]
            # Merge: keep clause with higher confidence or longer text
            p1 = existing.get("page_number")
            p2 = clause.get("page_number")
            min_page = min(p for p in [p1, p2] if p is not None) if (p1 or p2) else None

            if (clause.get("confidence_score", 0) > existing.get("confidence_score", 0)) or (
                clause.get("confidence_score", 0) == existing.get("confidence_score", 0) and
                len(clause.get("clause_text", "")) > len(existing.get("clause_text", ""))
            ):
                clause["page_number"] = min_page
                deduped[matched_idx] = clause
            else:
                existing["page_number"] = min_page

    return deduped


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
            max_tokens=120,
            timeout=30.0
        )
        matched = json.loads(_strip_json_fences(raw))
        if not isinstance(matched, list):
            return None
        valid_categories = {r.category for r in active_rules}
        return [c for c in matched if c in valid_categories]
    except Exception as e:
        logger.info(f"LLM classification failed for chunk, will use keyword fallback: {e}")
        return None


# Curated domain-specific legal recommendations used for fast fallback and guidance
CATEGORY_RECOMMENDATIONS = {
    "indemnity": "Request mutual indemnification and negotiate an aggregate liability cap limited to fees paid under this agreement.",
    "termination": "Negotiate a mandatory written notice period of at least 30 days prior to any termination without cause.",
    "liability": "Ensure liability is mutually capped and consequential, punitive, or indirect damages are explicitly disclaimed.",
    "eviction": "Ensure formal notice and a minimum 30-day cure period are required prior to any eviction or possession handover.",
    "late rent": "Verify that a reasonable grace period (e.g., 5-10 business days) is provided before default interest or late fees apply.",
    "deposit": "Define explicit timelines (e.g., 14-30 days) and require an itemized written statement for any security deposit deductions.",
    "non-compete": "Negotiate to narrow the non-compete duration (maximum 6 months) and restrict its geographic and industry scope.",
    "auto": "Require the counterparty to provide written advance reminder notice (at least 30 days) prior to any automatic renewal.",
    "governing law": "Confirm that the designated governing law and dispute jurisdiction are convenient and appropriate for both parties.",
    "confidentiality": "Ensure non-disclosure obligations are bilateral and carve out standard exclusions (public domain, prior possession).",
    "arbitration": "Ensure arbitration rules are balanced, with costs shared equally and proceedings held in a neutral forum.",
    "force majeure": "Ensure force majeure provisions protect both parties equally against unforeseeable disruptions.",
    "rent escalation": "Cap future rent escalations to a predefined percentage or tie increments to official inflation indexes.",
    "subleas": "Request that assignment or subleasing permissions cannot be unreasonably withheld, conditioned, or delayed.",
    "maintenance": "Clarify that the landlord is responsible for major structural repairs and the tenant only for minor upkeep.",
    "landlord entry": "Require at least 24 to 48 hours prior written notice before landlord entry, except in genuine emergencies.",
    "utilit": "Ensure utility metering is individual and based on verified actual consumption rates rather than arbitrary flat charges.",
    "probation": "Clarify objective, measurable performance criteria and notice standards required to complete the probationary period.",
    "intellectual property": "Ensure IP assignment applies strictly to work product created during working hours using employer equipment.",
}


def get_default_recommendation(category: str) -> str:
    cat_lower = category.lower()
    for key, rec in CATEGORY_RECOMMENDATIONS.items():
        if key in cat_lower:
            return rec
    return f"Review this {category} clause carefully with your legal counsel before signing."


async def generate_batched_clause_recommendations(detected_clauses: list) -> dict:
    """Generate actionable recommendations for all detected risk clauses in a single batched LLM call."""
    if not detected_clauses:
        return {}

    clause_summaries = []
    for c in detected_clauses[:6]:
        cat = c["category"]
        snippet = c["clause_text"][:250].replace("\n", " ").strip()
        clause_summaries.append(f"- Category: \"{cat}\" | Excerpt: \"{snippet}\"")

    prompt = (
        "You are senior legal counsel advising a client reviewing a contract.\n"
        "For each risk clause below, provide exactly 1-2 actionable, concise negotiation recommendations "
        "(amendments, safeguards, or red flags).\n\n"
        "RISK CLAUSES:\n" + "\n".join(clause_summaries) + "\n\n"
        "Return a valid JSON object where keys are the exact Category names and values are the recommendation strings.\n"
        "Example:\n{\n  \"Non-Compete\": \"Negotiate to shorten restriction period to 6 months.\"\n}\n"
        "Reply with a raw JSON object only. No markdown fences, no explanation."
    )

    try:
        raw = await call_llama_cpp_completion(
            prompt=prompt,
            system_prompt="You are a precise legal counsel. Reply with a raw JSON object mapping categories to advice.",
            max_tokens=250,
            timeout=35.0
        )
        parsed = json.loads(_strip_json_fences(raw))
        if isinstance(parsed, dict):
            return parsed
    except Exception as e:
        logger.warning(f"Batched LLM recommendation generation fallback used: {e}")

    # Curated domain-specific legal recommendations fallback
    return {c["category"]: get_default_recommendation(c["category"]) for c in detected_clauses}


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
            document.error_message = None

            # Idempotent cleanup: Delete prior chunks and reports for this document
            await session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc_id))
            old_reports_res = await session.execute(select(AnalysisReport).where(AnalysisReport.document_id == doc_id))
            for old_rep in old_reports_res.scalars().all():
                await session.delete(old_rep)
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
                    max_tokens=350,
                    timeout=getattr(settings, "LLM_TIMEOUT_SECONDS", 90.0)
                )
            except Exception as e:
                logger.warning(f"Local LLM summarization fallback used: {e}")
                executive_summary = f"Summary of {document.original_filename}: Legal agreement containing {len(chunks_data)} clause sections."

            # 5. Hybrid Risk Clause Classification
            rules_res = await session.execute(select(RiskRulesConfig).where(RiskRulesConfig.is_active == True))
            active_rules = rules_res.scalars().all()

            for chunk in chunks_data:
                matched_rules = []
                matched_rule_ids = set()
                chunk_evidence = {}

                for rule in active_rules:
                    is_match, evidence_type = match_rule_to_chunk(rule.category, chunk["text"])
                    if is_match:
                        matched_rules.append(rule)
                        matched_rule_ids.add(rule.id)
                        chunk_evidence[rule.id] = evidence_type

                chunk["matched_rules"] = matched_rules
                chunk["matched_rule_ids"] = matched_rule_ids
                chunk["chunk_evidence"] = chunk_evidence
                chunk["llm_matched_categories"] = set()

            # Zero-shot LLM verification & fallback:
            # Select up to 2 chunks with rule matches + up to 1 ambiguous chunk without matches
            candidate_llm_chunks = []
            chunks_with_matches = [c for c in chunks_data if c["matched_rules"]]
            candidate_llm_chunks.extend(chunks_with_matches[:2])
            chunks_without_matches = [c for c in chunks_data if not c["matched_rules"] and c.get("token_count", 0) >= 30]
            if len(candidate_llm_chunks) < 3 and chunks_without_matches:
                candidate_llm_chunks.append(chunks_without_matches[0])

            if candidate_llm_chunks:
                llm_tasks = [
                    classify_chunk_with_llm(c["text"], active_rules) for c in candidate_llm_chunks
                ]
                classification_results = await asyncio.gather(*llm_tasks, return_exceptions=True)
                for c, llm_result in zip(candidate_llm_chunks, classification_results):
                    if isinstance(llm_result, list):
                        c["llm_matched_categories"] = set(llm_result)
                        for rule in active_rules:
                            if rule.category in c["llm_matched_categories"] and rule.id not in c["matched_rule_ids"]:
                                c["matched_rules"].append(rule)
                                c["matched_rule_ids"].add(rule.id)
                                c["chunk_evidence"][rule.id] = "llm_only"

            raw_detected_clauses = []
            for chunk in chunks_data:
                for rule in chunk["matched_rules"]:
                    evidence = chunk.get("chunk_evidence", {}).get(rule.id, "contextual")
                    llm_confirmed = rule.category in chunk.get("llm_matched_categories", set())
                    confidence = compute_confidence_score(evidence, llm_confirmed)

                    defn = find_category_definition(rule.category)
                    kw_list = (defn["multi_word"] + defn["keywords"]) if defn else [rule.category]
                    pat = defn["primary_pattern"] if defn else None

                    snippet = extract_targeted_clause_snippet(chunk["text"], kw_list, pat)

                    raw_detected_clauses.append({
                        "category": rule.category,
                        "clause_text": snippet,
                        "explanation": rule.description or f"Flagged risky clause under category {rule.category}.",
                        "risk_level": rule.default_risk_level,
                        "rule_weight": getattr(rule, "weight", 1.0),
                        "confidence_score": confidence,
                        "page_number": chunk["page_number"]
                    })

            # 6. Granular Deduplication & Batched Recommendation Generation
            detected_clauses = deduplicate_clauses(raw_detected_clauses)
            total_risk_count = len(detected_clauses)

            # Generate recommendations in a single batched prompt (takes ~20s total instead of 140s)
            recommendations_map = await generate_batched_clause_recommendations(detected_clauses)
            for c in detected_clauses:
                cat = c["category"]
                rec = recommendations_map.get(cat)
                if not rec:
                    for k, v in recommendations_map.items():
                        if k.lower() == cat.lower():
                            rec = v
                            break
                c["recommendation"] = rec or get_default_recommendation(cat)

            # Weighted Overall Risk Scoring:
            # Composite Score = sum(Rule Weight_i * Severity Multiplier_i)
            # High Severity Multiplier = 3.0, Medium = 2.0, Low = 1.0
            SEVERITY_MULTIPLIERS = {
                "HIGH": 3.0,
                "MEDIUM": 2.0,
                "LOW": 1.0
            }

            composite_score = 0.0
            for c in detected_clauses:
                r_weight = float(c.get("rule_weight", 1.0))
                r_severity = str(c.get("risk_level", "Medium")).upper()
                multiplier = SEVERITY_MULTIPLIERS.get(r_severity, 2.0)
                composite_score += (r_weight * multiplier)

            composite_risk_score = round(composite_score, 2)

            # Classify overall risk by threshold bands:
            # Score >= 8.0 -> High Risk
            # 3.5 <= Score < 8.0 -> Medium Risk
            # Score < 3.5 -> Low Risk
            if composite_risk_score >= 8.0:
                overall_risk = "High"
            elif composite_risk_score >= 3.5:
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
                composite_risk_score=composite_risk_score,
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

            # 8. Pre-compute and cache PDF highlights in Redis so UI displays them instantly (2ms)
            if (document.file_type or "").upper() == "PDF":
                try:
                    import redis.asyncio as aioredis
                    from services.pdf_highlighter import extract_pdf_highlights

                    # Query saved clauses with database UUIDs
                    saved_clauses_res = await session.execute(
                        select(RiskClause).where(RiskClause.report_id == report.id)
                    )
                    saved_clauses = saved_clauses_res.scalars().all()
                    clauses_for_hl = [
                        {
                            "id": str(c.id),
                            "clause_type": c.clause_type,
                            "clause_text": c.clause_text,
                            "explanation": c.explanation,
                            "risk_level": c.risk_level,
                            "confidence_score": c.confidence_score,
                            "page_number": c.page_number,
                            "recommendation": c.recommendation
                        }
                        for c in saved_clauses
                    ]
                    page_hl = extract_pdf_highlights(file_bytes, clauses_for_hl)
                    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
                    await r.set(f"pdf_highlights:{doc_id}", json.dumps(page_hl), ex=86400 * 7)
                    logger.info(f"Pre-cached PDF highlights in Redis for Document ID {doc_id}")
                except Exception as ex:
                    logger.warning(f"Failed to pre-cache highlights in Redis: {ex}")

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

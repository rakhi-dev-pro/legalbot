import re
from typing import List, Dict, Any

# ---------------------------------------------------------------------------
# Entity extraction patterns
# ---------------------------------------------------------------------------

_CURRENCY_PATTERN = re.compile(
    r'(?:₹|Rs\.?|INR|\$|USD|EUR|GBP|€|£)\s?'
    r'\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?'
    r'(?:\s?/-)?'
    r'(?:\s?(?:lakh|lac|crore|thousand|million|billion)s?)?',
    re.IGNORECASE
)

_GOVERNING_LAW_PATTERNS = [
    re.compile(r'governed by (?:and construed in accordance with )?(?:the )?laws of (?:the State of )?([A-Za-z\s]{3,40})', re.IGNORECASE),
    re.compile(r'laws of ([A-Za-z\s]{3,40}?) shall (?:apply|govern)', re.IGNORECASE),
    re.compile(r'subject to (?:the )?laws of ([A-Za-z\s]{3,40})', re.IGNORECASE),
]

_JURISDICTION_PATTERNS = [
    re.compile(r'courts of ([A-Za-z\s]{3,40}) shall have (?:exclusive )?jurisdiction', re.IGNORECASE),
    re.compile(r'exclusive jurisdiction of (?:the )?courts (?:at|of|in) ([A-Za-z\s]{3,40})', re.IGNORECASE),
    re.compile(r'subject to the jurisdiction of ([A-Za-z\s]{3,40})', re.IGNORECASE),
]

_DATE_PATTERNS = [
    # "January 15, 2026" or "June 23, 2025"
    re.compile(r'(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}', re.IGNORECASE),
    # "23 Jun 2025" or "10th day of August, 2025"
    re.compile(r'\d{1,2}(?:st|nd|rd|th)?\s+(?:day of\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+\d{4}', re.IGNORECASE),
    # "04-Aug-2025" / "04/Aug/2025"
    re.compile(r'\d{1,2}[-/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-/]\d{4}', re.IGNORECASE),
    # "04-08-2025" / "04/08/2025"
    re.compile(r'\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b'),
]

# Captures the "between X and Y" preamble block common to contracts.
_PARTY_BLOCK_PATTERN = re.compile(
    r'\bbetween\s*:?\s*(.+?)\s+\band\b\s+(.+?)(?:\n\s*\n\s*(?:WHEREAS|NOW THIS|NOW,? THEREFORE|IN WITNESS)|WHEREAS|NOW THIS|NOW,? THEREFORE|IN WITNESS)',
    re.IGNORECASE | re.DOTALL
)

# Defined-term capture accepting quoted ("Landlord") and unquoted conventions.
_DEFINED_TERM_PATTERN = re.compile(
    r'(?:hereinafter\s+(?:called|referred to as)|hereinafter)\s+(?:the\s+)?["\']?([A-Za-z][A-Za-z\s/]{2,40}?)["\']?[\.\)]',
    re.IGNORECASE
)

# Name cutoff at relational tags (S/O, D/O, W/O, R/O) or commas
_LEADING_NAME_PATTERN = re.compile(
    r'^\s*([A-Z][A-Z\.\s]{2,60}?)(?:\s+(?:S/O|D/O|W/O|R/O)\b|\s*,)'
)


def _first_line_name(block: str) -> str:
    m = _LEADING_NAME_PATTERN.search(block.strip())
    if m:
        return m.group(1).strip().rstrip(",")
    words = block.strip().split()
    return " ".join(words[:8]).rstrip(",")


def extract_contract_entities(full_text: str) -> Dict[str, Any]:
    """
    Extract key legal entities (parties, dates, governing law, jurisdiction,
    monetary amounts) by trying several candidate patterns per field.
    Supports commercial agreements, lease deeds, and offer letters.
    """
    entities: Dict[str, Any] = {
        "parties": [],
        "effective_dates": [],
        "governing_law": "Not Specified",
        "jurisdiction": "Not Specified",
        "monetary_amounts": [],
    }

    # 1. Monetary amounts (₹ / Rs. / INR / $ / USD / EUR / GBP, with optional "/-" and lakh/crore/etc)
    seen_amounts = []
    for m in _CURRENCY_PATTERN.finditer(full_text):
        amt = m.group(0).strip()
        if amt not in seen_amounts:
            seen_amounts.append(amt)
    if seen_amounts:
        entities["monetary_amounts"] = seen_amounts[:10]

    # 2. Governing law
    for pattern in _GOVERNING_LAW_PATTERNS:
        m = pattern.search(full_text)
        if m:
            entities["governing_law"] = m.group(1).strip().title()
            break

    # 3. Jurisdiction
    for pattern in _JURISDICTION_PATTERNS:
        m = pattern.search(full_text)
        if m:
            entities["jurisdiction"] = m.group(1).strip().title()
            break

    # 4. Dates
    found_dates = []
    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(full_text):
            d = m.group(0).strip()
            if d not in found_dates:
                found_dates.append(d)
    if found_dates:
        entities["effective_dates"] = found_dates[:5]

    # 5. Parties
    block_match = _PARTY_BLOCK_PATTERN.search(full_text)
    parties = []
    if block_match:
        for side in (block_match.group(1), block_match.group(2)):
            name = _first_line_name(side)
            term_match = _DEFINED_TERM_PATTERN.search(side)
            if name and term_match:
                parties.append(f"{name} ({term_match.group(1).strip()})")
            elif name:
                parties.append(name)

    if not parties:
        # Fallback for Offer Letters & Employment Agreements
        employer_match = re.search(r'(?:Offer Letter\s*[—\-–]\s*|offer of employment with\s+)([A-Z0-9\s,\.\(\)]+?)(?:\s+for|\s+located|\n|\.|$)', full_text, re.IGNORECASE)
        employee_match = re.search(r'Dear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', full_text)
        role_match = re.search(r'position of\s+([A-Za-z0-9\s\-\_]+?)(?:\.|\,|\n|reporting)', full_text, re.IGNORECASE)

        emp_name = employer_match.group(1).strip() if employer_match else None
        cand_name = employee_match.group(1).strip() if employee_match else None
        role_title = role_match.group(1).strip() if role_match else None

        if emp_name:
            parties.append(f"{emp_name} (Employer)")
        if cand_name:
            if role_title:
                parties.append(f"{cand_name} ({role_title})")
            else:
                parties.append(f"{cand_name} (Employee)")

    if parties:
        entities["parties"] = parties

    return entities


def create_document_chunks(
    pages_list: List[Dict[str, Any]],
    max_chunk_words: int = 300,
    overlap_words: int = 30
) -> List[Dict[str, Any]]:
    """
    Sliding-window chunking across pages with safe stride computation to prevent infinite loops.
    """
    chunks = []
    chunk_index = 0
    stride = max(max_chunk_words - overlap_words, 1)

    for page_item in pages_list:
        page_num = page_item.get("page_number", 1)
        text = page_item.get("text", "").strip()
        if not text:
            continue

        words = text.split()
        if len(words) <= max_chunk_words:
            chunks.append({
                "chunk_index": chunk_index,
                "text": text,
                "token_count": len(words),
                "page_number": page_num
            })
            chunk_index += 1
        else:
            start = 0
            while start < len(words):
                end = min(start + max_chunk_words, len(words))
                chunk_words = words[start:end]
                chunks.append({
                    "chunk_index": chunk_index,
                    "text": " ".join(chunk_words),
                    "token_count": len(chunk_words),
                    "page_number": page_num
                })
                chunk_index += 1
                if end == len(words):
                    break
                start += stride

    return chunks

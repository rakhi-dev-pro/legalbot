import re
import logging
from typing import List, Dict, Any, Tuple, Optional
import fitz  # PyMuPDF

logger = logging.getLogger("legalbot.pdf_highlighter")

KEYWORDS_MAP = {
    'terminat': ['terminat', 'notice', 'dismiss', 'severance', 'resignation', 'without cause', 'unilateral', 'in lieu'],
    'confidential': ['confident', 'non-disclosure', 'nda', 'proprietary', 'secret'],
    'intellectual': ['intellectual', 'ip', 'assignment', 'inventions', 'work product'],
    'probat': ['probat', 'evaluation', 'trial'],
    'deposit': ['deposit', 'forfeit', 'deduct', 'security'],
    'non-compete': ['compete', 'solicit', 'restraint', 'exclusivity'],
    'arbitrat': ['arbitrat', 'dispute', 'jurisdiction', 'governing law'],
    'indemn': ['indemn', 'hold harmless', 'liability', 'defend'],
    'liabilit': ['liability', 'limitation', 'damages', 'consequential', 'maximum liability', 'cap'],
    'rent': ['rent', 'escalat', 'increment', 'lease term', 'monthly rent', 'penalty for unauthorized'],
    'maintenance': ['repair', 'maintenance', 'tenant', 'landlord', 'minor repairs', 'neat and clean'],
    'subleas': ['sublet', 'subleas', 'assignment restriction', 'under any circumstances', 'part of the said property'],
    'governing': ['governed by', 'governing law', 'jurisdiction'],
    'evict': ['evict', 'vacate', 'possession', 'forfeiture', 'handover', 'completion of the tenancy', 'house for rent'],
    'inspect': ['inspect', 'entry', 'reasonable hours', 'authorized person', 'access', 'reserves the right'],
    'late rent': ['late fee', 'default', 'interest', 'penalty', 'arrears', 'unauthorized'],
    'penalty': ['penalty', 'unauthorized', 'occupants', 'fine', 'additional penalty', 'prior written approval'],
    'utilit': ['electricity', 'water', 'utility', 'charges', 'bills', 'maintenance fee', 'meter'],
}


def _get_severity_color(risk_level: str) -> Tuple[float, float, float]:
    """Return RGB color tuple in 0.0-1.0 range for PyMuPDF annotations."""
    norm = (risk_level or "").upper()
    if norm == "HIGH":
        return (0.95, 0.25, 0.25)  # Crimson Red
    elif norm == "MEDIUM":
        return (0.95, 0.65, 0.15)  # Amber Orange
    else:
        return (0.15, 0.75, 0.40)  # Emerald Green


def _get_keywords_for_clause(clause_type: str, explanation: str = "") -> List[str]:
    combined = (clause_type + " " + explanation).lower()
    matched_kw = []
    for k, v in KEYWORDS_MAP.items():
        if k in combined:
            matched_kw.extend(v)
    if not matched_kw:
        matched_kw = [w.lower() for w in clause_type.split() if len(w) >= 4]
    return list(set(matched_kw))


def _is_section_heading(text: str) -> bool:
    s = text.strip()
    return bool(re.match(r'^(\d+[\.\)]|\([a-zA-Z0-9]+\)|Section\s+\d+|Article\s+[IVXLCDM\d]+|[A-Z][A-Za-z\s]{2,30}:)', s, re.IGNORECASE))


def _is_signature_footer(text: str) -> bool:
    s = text.lower()
    return "esign" in s or "aadhaar" in s or "leegality" in s or bool(re.search(r'date:\s+[a-z]{3}\s+[a-z]{3}\s+\d+', s))


def _find_paragraph_rects(page: fitz.Page, tp: Any, clause_type: str, explanation: str, full_clause_text: str) -> List[fitz.Rect]:
    """
    Find all line rects for the specific paragraph matching the risk clause.
    Expands contiguous lines to highlight the FULL paragraph while respecting
    numbered/section boundaries.
    """
    try:
        raw_blocks = page.get_text("blocks", textpage=tp) if tp else page.get_text("blocks")
    except Exception as e:
        logger.debug(f"Error getting blocks on page {page.number+1}: {e}")
        return []

    if not raw_blocks:
        return []

    # 1. Filter out digital signature stamps / eSign footers so they never get highlighted as clause paragraphs
    filtered_blocks = [b for b in raw_blocks if not _is_signature_footer(b[4])]
    if not filtered_blocks:
        filtered_blocks = raw_blocks

    # 2. Sort blocks geometrically from top to bottom, then left to right
    blocks = sorted(filtered_blocks, key=lambda b: (round(b[1], 1), round(b[0], 1)))

    kw = _get_keywords_for_clause(clause_type, explanation)

    best_idx = None
    best_score = 0
    for idx, b in enumerate(blocks):
        b_text = b[4].lower()
        score = sum(1 for w in kw if w in b_text)
        if score > best_score:
            best_score = score
            best_idx = idx

    # If no keyword score, check candidates with prefix words
    if best_idx is None:
        clean_text = " ".join((full_clause_text or "").split())
        words = clean_text.split()
        for idx, b in enumerate(blocks):
            b_text = b[4].lower()
            if len(words) >= 4 and " ".join(words[:4]).lower() in b_text:
                best_idx = idx
                break

    if best_idx is None:
        return []

    # Expand to contiguous paragraph lines
    selected_indices = [best_idx]
    
    # Expand upwards
    curr = best_idx
    while curr > 0:
        # If best_idx is already a section heading, it starts the clause — don't expand into previous section!
        if curr == best_idx and _is_section_heading(blocks[curr][4]):
            break
        prev = curr - 1
        gap = blocks[curr][1] - blocks[prev][3]
        prev_is_heading = _is_section_heading(blocks[prev][4])
        curr_is_heading = _is_section_heading(blocks[curr][4])
        # Only expand if previous block is strictly above and within reasonable line gap (0 to 22pt)
        if gap < 0 or gap > 22 or (curr_is_heading and curr != best_idx):
            break
        selected_indices.append(prev)
        if prev_is_heading:
            break
        curr = prev

    # Expand downwards
    curr = best_idx
    while curr < len(blocks) - 1:
        next_b = curr + 1
        gap = blocks[next_b][1] - blocks[curr][3]
        next_is_heading = _is_section_heading(blocks[next_b][4])
        # Only expand if next block is strictly below and within reasonable line gap (0 to 22pt)
        if gap < 0 or gap > 22 or next_is_heading:
            break
        selected_indices.append(next_b)
        curr = next_b

    selected_indices.sort()
    rects = []
    for i in selected_indices:
        b = blocks[i]
        r = fitz.Rect(b[0], b[1], b[2], b[3])
        if r.is_valid and not r.is_empty and r.width > 2 and r.height > 2:
            rects.append(r)

    return rects


def _get_or_create_ocr_textpage(page: fitz.Page, textpages: Dict[int, Any], page_idx: int) -> Any:
    """Generate and cache OCR textpage on demand."""
    if page_idx in textpages and textpages[page_idx] is not None:
        return textpages[page_idx]
    try:
        tp = page.get_textpage_ocr(language="eng", dpi=150)
        textpages[page_idx] = tp
        return tp
    except Exception as e:
        logger.warning(f"OCR textpage generation skipped for page {page_idx+1}: {e}")
        textpages[page_idx] = None
        return None


def _init_pages_and_ocr(doc: fitz.Document) -> Tuple[List[fitz.Page], Dict[int, Any]]:
    """
    Keep persistent fitz.Page instances alive in a list to prevent weak reference
    deallocation errors. Textpages are generated on-demand only when a clause requires OCR.
    """
    pages = [doc[i] for i in range(len(doc))]
    textpages: Dict[int, Any] = {}
    return pages, textpages


def extract_pdf_highlights(
    file_bytes: bytes,
    risk_clauses: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Search for risk clause text in the PDF document using PyMuPDF (fitz)
    and compute normalized percentage bounding boxes [x, y, width, height]
    for each detected risk clause. Highlights the FULL paragraph.
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        logger.error(f"Failed to open PDF stream in extract_pdf_highlights: {e}")
        return []

    pages, textpages = _init_pages_and_ocr(doc)
    page_highlights_map: Dict[int, Dict[str, Any]] = {}

    for page_idx, page in enumerate(pages):
        page_num = page_idx + 1
        page_highlights_map[page_num] = {
            "page_number": page_num,
            "page_width": page.rect.width,
            "page_height": page.rect.height,
            "highlights": []
        }

    for clause in risk_clauses:
        clause_id = str(clause.get("id") or "")
        clause_type = clause.get("clause_type") or "Legal Risk"
        risk_level = clause.get("risk_level") or "Medium"
        explanation = clause.get("explanation") or ""
        recommendation = clause.get("recommendation") or ""
        confidence_score = clause.get("confidence_score") or 0.8
        target_page = clause.get("page_number") or 1
        full_clause_text = clause.get("clause_text") or ""

        if target_page < 1 or target_page > len(pages):
            target_page = 1

        page = pages[target_page - 1]
        tp = textpages.get(target_page - 1)
        p_width = page.rect.width
        p_height = page.rect.height

        # 1. Search target page with native blocks or cached OCR textpage
        found_rects = _find_paragraph_rects(page, tp, clause_type, explanation, full_clause_text)

        # Fallback to on-demand OCR if not found on target page and page is sparse/scanned
        if not found_rects and tp is None:
            direct_text = page.get_text().strip()
            blocks = page.get_text("blocks")
            if len(direct_text) < 450 or len(blocks) <= 3:
                tp = _get_or_create_ocr_textpage(page, textpages, target_page - 1)
                if tp is not None:
                    found_rects = _find_paragraph_rects(page, tp, clause_type, explanation, full_clause_text)

        # 2. If not found on target page, search other pages using native blocks first
        if not found_rects:
            for other_idx, other_page in enumerate(pages):
                if other_idx == target_page - 1:
                    continue
                other_tp = textpages.get(other_idx)
                hits = _find_paragraph_rects(other_page, other_tp, clause_type, explanation, full_clause_text)
                if hits:
                    found_rects = hits
                    target_page = other_idx + 1
                    p_width = other_page.rect.width
                    p_height = other_page.rect.height
                    break

        # Convert found rects to normalized percentage coordinates
        rect_list = []
        if found_rects:
            for r in found_rects:
                x0 = max(0.0, r.x0 - 2)
                y0 = max(0.0, r.y0 - 2)
                x1 = min(p_width, r.x1 + 2)
                y1 = min(p_height, r.y1 + 2)

                rect_list.append({
                    "x": round((x0 / p_width) * 100, 2),
                    "y": round((y0 / p_height) * 100, 2),
                    "w": round(((x1 - x0) / p_width) * 100, 2),
                    "h": round(((y1 - y0) / p_height) * 100, 2),
                    "raw_x0": round(x0, 2),
                    "raw_y0": round(y0, 2),
                    "raw_x1": round(x1, 2),
                    "raw_y1": round(y1, 2),
                })
        else:
            slot_idx = len(page_highlights_map[target_page]["highlights"])
            y_offset_pct = 4.0 + (slot_idx * 5.0)
            rect_list.append({
                "x": 6.0,
                "y": min(round(y_offset_pct, 2), 85.0),
                "w": 88.0,
                "h": 3.5,
                "raw_x0": p_width * 0.06,
                "raw_y0": p_height * (y_offset_pct / 100.0),
                "raw_x1": p_width * 0.94,
                "raw_y1": p_height * ((y_offset_pct + 3.5) / 100.0),
                "is_fallback_banner": True
            })

        highlight_entry = {
            "clause_id": clause_id,
            "clause_type": clause_type,
            "risk_level": risk_level,
            "explanation": explanation,
            "recommendation": recommendation,
            "confidence_score": confidence_score,
            "page_number": target_page,
            "rects": rect_list,
            "sample_text": full_clause_text[:60]
        }

        if target_page in page_highlights_map:
            page_highlights_map[target_page]["highlights"].append(highlight_entry)

    doc.close()
    return list(page_highlights_map.values())


def generate_annotated_pdf(
    file_bytes: bytes,
    risk_clauses: List[Dict[str, Any]],
    selected_clause_ids: Optional[List[str]] = None
) -> bytes:
    """
    Generate an annotated PDF file with native highlight annotations and
    descriptive popups using PyMuPDF (fitz).
    Highlights the FULL paragraph corresponding to each risk.
    """
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages, textpages = _init_pages_and_ocr(doc)

    selected_set = set(selected_clause_ids) if selected_clause_ids else None
    fallback_counts: Dict[int, int] = {}

    for clause in risk_clauses:
        cid = str(clause.get("id") or "")
        if selected_set and cid not in selected_set:
            continue

        clause_type = clause.get("clause_type") or "Legal Risk"
        risk_level = clause.get("risk_level") or "Medium"
        explanation = clause.get("explanation") or ""
        recommendation = clause.get("recommendation") or ""
        target_page = clause.get("page_number") or 1
        full_clause_text = clause.get("clause_text") or ""

        if target_page < 1 or target_page > len(pages):
            target_page = 1

        page = pages[target_page - 1]
        tp = textpages.get(target_page - 1)
        stroke_color = _get_severity_color(risk_level)

        found_rects = _find_paragraph_rects(page, tp, clause_type, explanation, full_clause_text)

        if not found_rects and tp is None:
            tp = _get_or_create_ocr_textpage(page, textpages, target_page - 1)
            if tp is not None:
                found_rects = _find_paragraph_rects(page, tp, clause_type, explanation, full_clause_text)

        if not found_rects:
            for other_idx, other_page in enumerate(pages):
                if other_idx == target_page - 1:
                    continue
                other_tp = textpages.get(other_idx)
                hits = _find_paragraph_rects(other_page, other_tp, clause_type, explanation, full_clause_text)
                if not hits and other_tp is None:
                    other_tp = _get_or_create_ocr_textpage(other_page, textpages, other_idx)
                    if other_tp is not None:
                        hits = _find_paragraph_rects(other_page, other_tp, clause_type, explanation, full_clause_text)
                if hits:
                    found_rects = hits
                    page = other_page
                    target_page = other_idx + 1
                    break

        popup_content = (
            f"Risk Level: {risk_level.upper()}\n\n"
            f"Explanation:\n{explanation}\n\n"
            f"Recommended Action:\n{recommendation}"
        )
        popup_title = f"[{risk_level.upper()} RISK] {clause_type}"

        if found_rects:
            try:
                annot = page.add_highlight_annot(found_rects)
                annot.set_colors(stroke=stroke_color)
                annot.set_opacity(0.35)
                annot.set_info({
                    "title": popup_title,
                    "content": popup_content
                })
                annot.update()
            except Exception as e:
                logger.warning(f"Failed to add highlight annot: {e}")

            try:
                first_rect = found_rects[0]
                note_x = max(15.0, first_rect.x0 - 24.0)
                note_y = max(15.0, first_rect.y0)
                note = page.add_text_annot(fitz.Point(note_x, note_y), popup_content, icon="Note")
                note.set_colors(stroke=stroke_color)
                note.set_info({"title": popup_title, "content": popup_content})
                note.update()
            except Exception as e:
                logger.warning(f"Failed to add text annot: {e}")
        else:
            try:
                slot_idx = fallback_counts.get(target_page, 0)
                fallback_counts[target_page] = slot_idx + 1
                y_top = 25.0 + (slot_idx * 35.0)
                rect = fitz.Rect(35.0, y_top, page.rect.width - 35.0, y_top + 28.0)

                callout = page.add_rect_annot(rect)
                callout.set_colors(stroke=stroke_color)
                callout.set_info({"title": popup_title, "content": popup_content})
                callout.update()

                note = page.add_text_annot(fitz.Point(40.0, y_top + 4.0), popup_content, icon="Help")
                note.set_colors(stroke=stroke_color)
                note.set_info({"title": popup_title, "content": popup_content})
                note.update()
            except Exception as e:
                logger.warning(f"Failed to add fallback callout annot: {e}")

    annotated_bytes = doc.tobytes(deflate=True, clean=True)
    doc.close()
    return annotated_bytes

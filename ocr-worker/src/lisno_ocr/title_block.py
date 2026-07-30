from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence


_LOWER_TITLE_BLOCK_START = 0.70
_TITLE_FIELD = re.compile(
    r"^\s*title\s*:\s*(?P<value>\S(?:.*\S)?)\s*$",
    re.IGNORECASE,
)

OcrLineTuple = tuple[tuple[int, int, int, int], str, float]
PdfWordTuple = tuple[float, float, float, float, str, int, int, int]


def title_block_top(image_height: int) -> int:
    return max(0, int(image_height * _LOWER_TITLE_BLOCK_START))


def extract_title_block(
    lines: Sequence[OcrLineTuple], image_width: int, image_height: int
) -> str | None:
    """Return the one explicit title value found in the lower title block."""
    candidate = extract_title_block_candidate(lines, image_width, image_height)
    return candidate[0] if candidate is not None else None


def extract_title_block_candidate(
    lines: Sequence[OcrLineTuple], image_width: int, image_height: int
) -> tuple[str, float] | None:
    """Return the explicit lower-band title and its OCR confidence, if unique."""
    del image_width
    lower_band_top = title_block_top(image_height)
    candidates: list[tuple[str, float]] = []
    for box, text, confidence in lines:
        if (box[1] + box[3]) / 2 < lower_band_top:
            continue
        match = _TITLE_FIELD.match(unicodedata.normalize("NFKC", text))
        if match is None:
            continue
        value = match.group("value")
        if value:
            candidates.append((value, float(confidence)))

    unique_candidates = {
        " ".join(candidate.casefold().split()) for candidate, _confidence in candidates
    }
    if len(unique_candidates) != 1:
        return None
    return max(candidates, key=lambda candidate: candidate[1])


def extract_pdf_title_block_candidate(
    words: Sequence[PdfWordTuple], page_width: float, page_height: float
) -> tuple[str, float] | None:
    """Read the canonical title field from a PDF's embedded text layer."""
    lower_band_top = page_height * _LOWER_TITLE_BLOCK_START
    lower_words = [
        word
        for word in words
        if (word[1] + word[3]) / 2 >= lower_band_top
    ]
    candidates: list[str] = []
    for marker in lower_words:
        marker_text = unicodedata.normalize("NFKC", marker[4]).strip()
        if marker_text.casefold().rstrip(":") != "title":
            continue
        baseline = (marker[1] + marker[3]) / 2
        field_end = page_width * 0.265
        value_words = [
            word
            for word in lower_words
            if word[0] > marker[2]
            and word[0] < field_end
            and abs(((word[1] + word[3]) / 2) - baseline)
            <= max(6.0, marker[3] - marker[1])
            and word[4].strip() != ":"
        ]
        value_words.sort(key=lambda word: word[0])
        value_parts: list[str] = []
        for word in value_words:
            text = word[4].strip()
            if text.casefold().strip(":") in {
                "designed",
                "disined",
                "date",
                "project",
                "checked",
                "handover",
                "client",
            }:
                break
            value_parts.append(text)
        value = " ".join(value_parts).lstrip(": ").strip()
        if value:
            candidates.append(value)

    unique = {" ".join(value.casefold().split()) for value in candidates}
    if len(unique) != 1:
        return None
    return candidates[0], 1.0

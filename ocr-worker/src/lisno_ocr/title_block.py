from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence


_LOWER_TITLE_BLOCK_START = 0.70
_TITLE_MARKER = re.compile(r"^\s*title\b", re.IGNORECASE)

OcrLineTuple = tuple[tuple[int, int, int, int], str, float]


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
        match = _TITLE_MARKER.match(unicodedata.normalize("NFKC", text))
        if match is None:
            continue
        value = match.string[match.end():].strip()
        if value.startswith(":"):
            value = value[1:].strip()
        if value:
            candidates.append((value, float(confidence)))

    unique_candidates = {
        " ".join(candidate.casefold().split()) for candidate, _confidence in candidates
    }
    if len(unique_candidates) != 1:
        return None
    return max(candidates, key=lambda candidate: candidate[1])

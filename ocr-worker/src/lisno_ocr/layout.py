from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, TypeAlias

from .settings import LayoutSettings, normalize_matching_text


Box: TypeAlias = tuple[int, int, int, int]


@dataclass(frozen=True, slots=True)
class OcrLine:
    box: Box
    text: str
    confidence: float


@dataclass(frozen=True, slots=True)
class HeadingCandidate:
    line: OcrLine
    label: str
    semantic_score: float
    kind: Literal["page_title", "panel"]


def classify_heading(
    line: OcrLine,
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> HeadingCandidate | None:
    text = normalize_display_text(line.text)
    if not text or is_reserved_or_annotation(
        text, line.box, page_width, page_height, settings
    ):
        return None
    score, kind = heading_evidence(text, line.box, page_width, page_height, settings)
    if score < settings.min_heading_score:
        return None
    return HeadingCandidate(line, strip_panel_marker(text), score, kind)


def normalize_display_text(text: str) -> str:
    normalized = " ".join(text.replace("–", " - ").replace("—", " - ").split())
    normalized = re.sub(r"\s*-\s*", " – ", normalized)
    return normalized.strip()


def is_reserved_or_annotation(
    text: str,
    box: Box,
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> bool:
    del page_width
    match_text = _match_text(text)
    if any(_contains_term(match_text, term) for term in settings.reserved_terms):
        return True
    if _DIMENSION_RE.search(match_text) or _UNIT_DIMENSION_RE.search(match_text):
        return True
    if _NOTE_RE.search(match_text) or _looks_like_callout(
        text, match_text, settings
    ):
        return True
    if (
        page_height > 0
        and box[1] >= page_height * (1 - settings.reserved_bottom_ratio)
        and not _PANEL_MARKER_RE.match(text)
    ):
        return True
    return _is_short_room_or_fixture_label(text, match_text, settings)


def heading_evidence(
    text: str,
    box: Box,
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> tuple[float, Literal["page_title", "panel"]]:
    match_text = _match_text(text)
    has_marker = bool(_PANEL_MARKER_RE.match(text))
    has_drawing_term = _has_drawing_term(match_text, settings)
    words = re.findall(r"[A-Za-z]+", text)
    left, top, right, _bottom = box
    width_ratio = max(0, right - left) / max(page_width, 1)
    top_ratio = max(top, 0) / max(page_height, 1)

    score = 0.0
    if has_marker:
        score += 0.28
    if has_drawing_term:
        score += 0.30
    if " – " in text:
        score += 0.15
    if _has_heading_case(text):
        score += 0.12
    if 0.15 <= width_ratio <= 0.85:
        score += 0.10
    if top_ratio < 0.80:
        score += 0.06
    if len(words) >= 3:
        score += 0.10

    kind: Literal["page_title", "panel"] = (
        "panel" if has_marker else "page_title"
    )
    return min(score, 1.0), kind


def strip_panel_marker(text: str) -> str:
    without_marker = _PANEL_MARKER_RE.sub("", text).strip(" –")
    return _title_case_display(without_marker)


def _title_case_display(text: str) -> str:
    return " – ".join(_title_case_segment(segment) for segment in text.split(" – "))


def _title_case_segment(segment: str) -> str:
    return _DISPLAY_WORD_RE.sub(_display_word, segment)


def _display_word(match: re.Match[str]) -> str:
    word = match.group()
    if word in _DISPLAY_ACRONYMS or _DIGIT_ACRONYM_RE.fullmatch(word):
        return word
    return word.capitalize()


def _match_text(text: str) -> str:
    return normalize_matching_text(text)


def _contains_term(text: str, term: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(term.casefold())}(?!\w)", text))


def _has_drawing_term(text: str, settings: LayoutSettings) -> bool:
    return any(_contains_term(text, term) for term in settings.drawing_terms)


def _has_heading_case(text: str) -> bool:
    letters = "".join(character for character in text if character.isalpha())
    return bool(letters) and (letters.isupper() or text.istitle())


def _is_short_room_or_fixture_label(
    text: str, match_text: str, settings: LayoutSettings
) -> bool:
    if _PANEL_MARKER_RE.match(text):
        return False
    words = match_text.split()
    return len(words) <= 2 and not any(
        _contains_term(match_text, term) for term in settings.drawing_terms
    )


_PANEL_MARKER_RE = re.compile(
    r"^(?:[A-Z]\.(?:\d+\.?)?\s+|DETAIL\s+\d+\s*(?:[.\-–]\s*)?)",
    re.IGNORECASE,
)
_DIMENSION_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?\b")
_UNIT_DIMENSION_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mm|cm|m|ft|in)\b")
_NOTE_RE = re.compile(r"\b(?:all\s+dimensions?|dimensions?\s+are|note|notes)\b")
_CALLOUT_PHRASE_RE = re.compile(
    r"\b(?:to\s+match|match\s+existing|as\s+per|refer\s+to|to\s+existing|to\s+be)\b"
)
_CALLOUT_PREFIX_RE = re.compile(
    r"^(?:material|finish|spec(?:ification)?)(?:\s+(?P<remainder>.*))?$"
)
_LEADER_PREFIX_RE = re.compile(r"^leader\b")
_FINISH_TREATMENT_RE = re.compile(r"\bfinish$")
_DISPLAY_WORD_RE = re.compile(r"[A-Za-z]+(?:\d+)?|\d+[A-Za-z][A-Za-z0-9]*")
_DIGIT_ACRONYM_RE = re.compile(r"\d+[A-Z]{2,}\d*")
_DISPLAY_ACRONYMS = frozenset({"AC", "DB", "FFL", "HVAC", "LED", "MEP", "RCP", "TV", "UPVC", "WC"})


def _looks_like_callout(
    text: str, match_text: str, settings: LayoutSettings
) -> bool:
    unmarked = _PANEL_MARKER_RE.sub("", text).strip()
    unmarked_match = _match_text(unmarked)
    prefix_match = _CALLOUT_PREFIX_RE.match(unmarked_match)
    if prefix_match and not _has_drawing_term(
        prefix_match.group("remainder") or "", settings
    ):
        return True
    if _LEADER_PREFIX_RE.search(unmarked_match):
        return True
    prefix, separator, description = unmarked.partition(":")
    if separator and len(_match_text(prefix).split()) <= 3 and len(
        _match_text(description).split()
    ) >= 2 and not _has_drawing_term(_match_text(description), settings):
        return True
    _head, has_with, tail = match_text.partition(" with ")
    if has_with and not _has_drawing_term(tail, settings):
        return True
    if not _has_drawing_term(match_text, settings) and _FINISH_TREATMENT_RE.search(
        match_text
    ):
        return True
    return bool(_CALLOUT_PHRASE_RE.search(match_text))

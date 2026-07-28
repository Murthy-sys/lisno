from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypeAlias

from .settings import DEFAULT_MATERIAL_SPEC_TERMS, DEFAULT_ROOM_TYPES


Box: TypeAlias = tuple[int, int, int, int]

_DIRECTIONAL_ELEVATIONS = (
    "front elevation",
    "rear elevation",
    "back elevation",
    "side elevation",
    "left elevation",
    "right elevation",
)
_EXCLUDED_PHRASES = (
    "general note",
    "general notes",
    "key plan",
    "vicinity plan",
    "location map",
    "cross section",
)
_EXCLUDED_WORDS = frozenset(
    {
        "arrow",
        "callout",
        "cloud",
        "detail",
        "details",
        "diagram",
        "diagrams",
        "dimension",
        "dimensions",
        "equipment",
        "finish",
        "finishes",
        "fixture",
        "fixtures",
        "legend",
        "legends",
        "material",
        "materials",
        "note",
        "notes",
        "schedule",
        "schedules",
        "section",
        "sections",
        "symbol",
        "symbols",
    }
)
_DIRECTIVE_PHRASES = (
    "refer",
    "refer to",
    "consult",
    "check",
    "see",
    "as per",
    "typical",
    "note",
    "verify",
    "provide",
    "do not",
    "not for construction",
    "for reference",
    "to be verified",
    "for information only",
)
_FLOOR_QUALIFIERS = frozenset(
    {
        "basement",
        "ground",
        "ground floor",
        "first",
        "first floor",
        "second",
        "second floor",
        "third",
        "third floor",
        "upper",
        "upper floor",
        "lower",
        "lower floor",
    }
)
_DIRECTIONAL_QUALIFIERS = frozenset(
    {
        "front",
        "rear",
        "back",
        "left",
        "right",
        "north",
        "south",
        "east",
        "west",
    }
)
_MATERIAL_SPEC_TERMS = frozenset(DEFAULT_MATERIAL_SPEC_TERMS)
_DASHES = str.maketrans(
    {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2015": "-",
        "\u2212": "-",
    }
)
_OCR_PUNCTUATION = str.maketrans(
    {
        "\uff06": "&",
        "\uff08": "(",
        "\uff09": ")",
        "\uff0e": ".",
        "\uff0d": "-",
    }
)
_OCR_DASH_PATTERN = re.compile(
    r"\s*[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212]\s*"
)
_DRAWING_MARKER_PATTERN = re.compile(r"^[ \t]*[abc]\.[ \t]*", re.IGNORECASE)
_ALPHANUMERIC_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+")
_NEIGHBOR_Y_BUCKET_SIZE = 64
_NEIGHBOR_X_BUCKET_SIZE = 128
_MAX_JOIN_GAP = 96
_MAX_NEIGHBORS_PER_BUCKET = 64
_DEDUPE_CELL_SIZE = 128


@dataclass(frozen=True, slots=True)
class OcrLine:
    box: Box
    text: str
    confidence: float


@dataclass(frozen=True, slots=True)
class DrawingTitle:
    box: Box
    label: str
    confidence: float


@dataclass(frozen=True, slots=True)
class _QualifierIndex:
    by_bottom: dict[tuple[int, int], tuple[int, ...]]
    by_top: dict[tuple[int, int], tuple[int, ...]]


def normalize_ocr_title(
    text: str,
    accepted_plan_types: Sequence[str],
    accepted_room_types: Sequence[str],
) -> str:
    plan_types = _normalized_plan_types(accepted_plan_types)
    room_types = _normalized_plan_types(accepted_room_types)
    return _normalize_ocr_title(
        text,
        plan_types,
        room_types,
        _compact_title_tokens(plan_types, room_types),
    )


def classify_drawing_titles(
    lines: Sequence[OcrLine],
    accepted_plan_types: Sequence[str],
    accepted_room_types: Sequence[str] = DEFAULT_ROOM_TYPES,
) -> tuple[DrawingTitle, ...]:
    plan_types = _normalized_plan_types(accepted_plan_types)
    room_types = _normalized_plan_types(accepted_room_types)
    compact_title_tokens = _compact_title_tokens(plan_types, room_types)
    ordered = sorted(
        (line for line in lines if line.text.strip()),
        key=lambda line: (line.box[1], line.box[0]),
    )
    normalized_texts = tuple(
        _normalize_ocr_title(
            line.text,
            plan_types,
            room_types,
            compact_title_tokens,
        )
        for line in ordered
    )
    comparison_texts = tuple(
        _comparison_text(text)
        for text in normalized_texts
    )
    overview_indices = _segmented_overview_indices(
        ordered,
        normalized_texts,
        plan_types,
        room_types,
    )
    qualifier_index = _build_qualifier_index(
        ordered,
        comparison_texts,
        plan_types,
        room_types,
    )
    consumed: set[int] = set()
    titles: list[DrawingTitle] = []

    for index, line in enumerate(ordered):
        if index in consumed or index in overview_indices:
            continue
        comparison = comparison_texts[index]
        if not _is_supported_title(comparison, plan_types, room_types):
            continue

        label = normalized_texts[index]
        box = line.box
        confidence = line.confidence
        if _is_bare_drawing_type(comparison, plan_types):
            neighbor = _adjacent_qualifier(
                ordered,
                index,
                consumed,
                qualifier_index,
            )
            if neighbor is not None:
                neighbor_index, qualifier, qualifier_precedes = neighbor
                consumed.add(neighbor_index)
                box = _union_box(box, qualifier.box)
                confidence = min(confidence, qualifier.confidence)
                qualifier_label = normalized_texts[neighbor_index]
                label = (
                    f"{qualifier_label} \u2013 {label}"
                    if qualifier_precedes
                    else f"{label} \u2013 {qualifier_label}"
                )

        titles.append(DrawingTitle(box, label, float(confidence)))

    deduplicated: list[DrawingTitle] = []
    spatial_index: dict[
        tuple[str, int, int],
        set[DrawingTitle],
    ] = {}
    for title in sorted(titles, key=lambda item: (item.box[1], item.box[0])):
        normalized_label = _comparison_text(title.label)
        cells = _box_cells(title.box)
        nearby = {
            existing
            for cell_x, cell_y in cells
            for existing in spatial_index.get(
                (normalized_label, cell_x, cell_y),
                (),
            )
        }
        if any(_boxes_overlap(existing.box, title.box) for existing in nearby):
            continue
        deduplicated.append(title)
        for cell_x, cell_y in cells:
            spatial_index.setdefault(
                (normalized_label, cell_x, cell_y),
                set(),
            ).add(title)
    return tuple(deduplicated)


def _normalized_plan_types(accepted_plan_types: Sequence[str]) -> tuple[str, ...]:
    normalized = tuple(
        value
        for plan_type in accepted_plan_types
        if (value := _comparison_text(plan_type))
    )
    return tuple(dict.fromkeys(normalized))


def _compact_title_tokens(
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> dict[str, str]:
    phrases = [
        *_DIRECTIONAL_ELEVATIONS,
        *(
            f"{plan_type} plan"
            for plan_type in plan_types
            if plan_type != "room"
        ),
        *room_types,
    ]
    if "room" in plan_types:
        phrases.extend(f"{room_type} plan" for room_type in room_types)
    return {
        phrase.replace(" ", ""): phrase
        for phrase in phrases
        if " " in phrase
    }


def _normalize_ocr_title(
    text: str,
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
    compact_title_tokens: dict[str, str],
) -> str:
    compatible = unicodedata.normalize("NFKC", text)
    punctuated = compatible.translate(_OCR_PUNCTUATION)
    unmarked = _DRAWING_MARKER_PATTERN.sub("", punctuated, count=1)

    def separate_configured_token(match: re.Match[str]) -> str:
        token = match.group(0)
        phrase = compact_title_tokens.get(token.casefold())
        if phrase is None:
            return token
        if token.isupper():
            return phrase.upper()
        if token.islower():
            return phrase
        return phrase.title()

    separated = _ALPHANUMERIC_TOKEN_PATTERN.sub(
        separate_configured_token,
        unmarked,
    )
    if _is_single_line_overview(separated, plan_types, room_types):
        return ""
    dashed = _OCR_DASH_PATTERN.sub(" \u2013 ", separated)
    parenthesized = re.sub(r"\s*\(\s*", " (", dashed)
    parenthesized = re.sub(r"\s*\)\s*", ") ", parenthesized)
    return _display_text(parenthesized)


def _is_single_line_overview(
    text: str,
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> bool:
    stripped = text.strip()
    if stripped.startswith("&"):
        return True
    if "&" not in stripped:
        return False
    fragments = stripped.split("&")
    return any(
        _contains_drawing_family_fragment(left, plan_types, room_types)
        and _contains_drawing_family_fragment(right, plan_types, room_types)
        for left, right in zip(fragments, fragments[1:])
    )


def _contains_drawing_family_fragment(
    fragment: str,
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> bool:
    text = _comparison_text(fragment)
    if not text:
        return False
    if "elevation" in text.split():
        return True
    if any(
        plan_type != "room"
        and _contains_phrase(text, f"{plan_type} plan")
        for plan_type in plan_types
    ):
        return True
    if "room" not in plan_types or not text.endswith(" plan"):
        return False
    qualifier = text.removesuffix(" plan").strip()
    return _matches_room_qualifier(qualifier, room_types)


def _segmented_overview_indices(
    lines: Sequence[OcrLine],
    normalized_texts: Sequence[str],
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> frozenset[int]:
    overview_starts = tuple(
        index
        for index, text in enumerate(normalized_texts)
        if text.rstrip().endswith("&")
        and _contains_drawing_family_fragment(
            text.rsplit("&", 1)[0],
            plan_types,
            room_types,
        )
    )
    if not overview_starts:
        return frozenset()

    by_top: dict[tuple[int, int], list[int]] = {}
    for index, line in enumerate(lines):
        top_cell = line.box[1] // _NEIGHBOR_Y_BUCKET_SIZE
        for cell_x in _neighbor_x_cells(line.box):
            _append_bounded(by_top, (top_cell, cell_x), index)

    excluded: set[int] = set()
    for overview_index in overview_starts:
        overview = lines[overview_index]
        candidates: set[int] = set()
        first_y = (
            overview.box[1] - _NEIGHBOR_Y_BUCKET_SIZE
        ) // _NEIGHBOR_Y_BUCKET_SIZE
        last_y = (
            overview.box[3] + _MAX_JOIN_GAP
        ) // _NEIGHBOR_Y_BUCKET_SIZE
        first_x = overview.box[0] // _NEIGHBOR_X_BUCKET_SIZE
        last_x = (
            overview.box[2] + _MAX_JOIN_GAP
        ) // _NEIGHBOR_X_BUCKET_SIZE
        for cell_y in range(first_y, last_y + 1):
            for cell_x in range(first_x, last_x + 1):
                candidates.update(by_top.get((cell_y, cell_x), ()))

        continuations = [
            (distance, candidate_index)
            for candidate_index in candidates
            if candidate_index != overview_index
            and (
                distance := _overview_continuation_distance(
                    overview.box,
                    lines[candidate_index].box,
                )
            )
            is not None
            and _contains_drawing_family_fragment(
                normalized_texts[candidate_index],
                plan_types,
                room_types,
            )
        ]
        if continuations:
            _distance, continuation_index = min(continuations)
            excluded.update((overview_index, continuation_index))
    return frozenset(excluded)


def _overview_continuation_distance(
    overview: Box,
    continuation: Box,
) -> int | None:
    if _is_title_neighbor(continuation, overview, False):
        return continuation[1] - overview[3]

    horizontal_gap = continuation[0] - overview[2]
    overview_height = max(1, overview[3] - overview[1])
    continuation_height = max(1, continuation[3] - continuation[1])
    maximum_gap = max(16, max(overview_height, continuation_height))
    if horizontal_gap < 0 or horizontal_gap > maximum_gap:
        return None
    vertical_overlap = max(
        0,
        min(overview[3], continuation[3])
        - max(overview[1], continuation[1]),
    )
    narrower_height = min(overview_height, continuation_height)
    if vertical_overlap / narrower_height < 0.4:
        return None
    return horizontal_gap


def _comparison_text(text: str) -> str:
    dashed = text.translate(_DASHES).casefold()
    return re.sub(r"[^a-z0-9]+", " ", dashed).strip()


def _display_text(text: str) -> str:
    return " ".join(text.split())


def _is_supported_title(
    text: str,
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> bool:
    if not text or _is_excluded(text):
        return False
    if _matches_directional_elevation(text, room_types):
        return True
    return _matches_plan_title(text, plan_types, room_types)


def _is_excluded(text: str) -> bool:
    words = set(text.split())
    if re.match(r"^\d+\s+", text):
        return True
    if any(_contains_phrase(text, phrase) for phrase in _DIRECTIVE_PHRASES):
        return True
    if any(_contains_phrase(text, phrase) for phrase in _EXCLUDED_PHRASES):
        return True
    if words & _EXCLUDED_WORDS:
        return True
    if words & _MATERIAL_SPEC_TERMS:
        return True
    if "scale" in words:
        return True
    return _is_dimension_or_symbol(text)


def _is_dimension_or_symbol(text: str) -> bool:
    if len(text) == 1:
        return True
    if re.fullmatch(r"\d+(?:\s*[x×]\s*\d+)*", text):
        return True
    if re.fullmatch(r"\d+\s+\d+", text):
        return True
    return False


def _matches_directional_elevation(
    text: str,
    room_types: tuple[str, ...],
) -> bool:
    return any(
        _matches_closed_base(text, elevation, room_types)
        for elevation in _DIRECTIONAL_ELEVATIONS
    )


def _matches_plan_title(
    text: str,
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> bool:
    for plan_type in plan_types:
        if plan_type == "room":
            continue
        drawing_type = f"{plan_type} plan"
        if _matches_closed_base(text, drawing_type, room_types):
            return True
    if "room" not in plan_types or not text.endswith(" plan"):
        return False
    qualifier = text.removesuffix(" plan").strip()
    return _matches_room_qualifier(qualifier, room_types)


def _matches_closed_base(
    text: str,
    drawing_type: str,
    room_types: tuple[str, ...],
) -> bool:
    if text == drawing_type:
        return True
    prefix = text.removesuffix(f" {drawing_type}")
    if prefix != text and _is_controlled_qualifier(prefix, room_types):
        return True
    suffix = text.removeprefix(f"{drawing_type} ")
    return suffix != text and _is_controlled_qualifier(suffix, room_types)


def _matches_room_qualifier(
    qualifier: str,
    room_types: tuple[str, ...],
) -> bool:
    return any(
        qualifier == room_type
        or re.fullmatch(rf"{re.escape(room_type)}\s+\d+", qualifier)
        for room_type in room_types
    )


def _is_bare_drawing_type(text: str, plan_types: tuple[str, ...]) -> bool:
    return text in _DIRECTIONAL_ELEVATIONS or any(
        plan_type != "room" and text == f"{plan_type} plan"
        for plan_type in plan_types
    )


def _adjacent_qualifier(
    lines: Sequence[OcrLine],
    title_index: int,
    consumed: set[int],
    qualifier_index: _QualifierIndex,
) -> tuple[int, OcrLine, bool] | None:
    title = lines[title_index]
    neighbors: list[tuple[int, int, OcrLine, bool]] = []
    candidate_indices = _geometric_qualifier_candidates(
        title.box,
        qualifier_index,
    )
    for neighbor_index in candidate_indices:
        if neighbor_index == title_index or neighbor_index in consumed:
            continue
        qualifier = lines[neighbor_index]
        if qualifier.box[3] <= title.box[1]:
            precedes = True
            gap = title.box[1] - qualifier.box[3]
        elif qualifier.box[1] >= title.box[3]:
            precedes = False
            gap = qualifier.box[1] - title.box[3]
        else:
            continue
        if _is_title_neighbor(qualifier.box, title.box, precedes):
            neighbors.append((gap, neighbor_index, qualifier, precedes))
    if not neighbors:
        return None
    _gap, neighbor_index, qualifier, precedes = min(
        neighbors,
        key=lambda item: (item[0], item[2].box[1], item[2].box[0]),
    )
    return neighbor_index, qualifier, precedes


def _build_qualifier_index(
    lines: Sequence[OcrLine],
    comparison_texts: Sequence[str],
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> _QualifierIndex:
    by_bottom: dict[tuple[int, int], list[int]] = {}
    by_top: dict[tuple[int, int], list[int]] = {}
    for index, (line, text) in enumerate(zip(lines, comparison_texts)):
        if not _is_controlled_qualifier(text, room_types):
            continue
        if _is_supported_title(text, plan_types, room_types):
            continue
        for cell_x in _neighbor_x_cells(line.box):
            bottom_key = (
                line.box[3] // _NEIGHBOR_Y_BUCKET_SIZE,
                cell_x,
            )
            top_key = (
                line.box[1] // _NEIGHBOR_Y_BUCKET_SIZE,
                cell_x,
            )
            _append_bounded(by_bottom, bottom_key, index)
            _append_bounded(by_top, top_key, index)
    return _QualifierIndex(
        by_bottom={
            key: tuple(indices)
            for key, indices in by_bottom.items()
        },
        by_top={
            key: tuple(indices)
            for key, indices in by_top.items()
        },
    )


def _geometric_qualifier_candidates(
    title: Box,
    index: _QualifierIndex,
) -> tuple[int, ...]:
    candidates: set[int] = set()
    x_cells = _neighbor_x_cells(title)
    above_start = (title[1] - _MAX_JOIN_GAP) // _NEIGHBOR_Y_BUCKET_SIZE
    above_stop = title[1] // _NEIGHBOR_Y_BUCKET_SIZE
    below_start = title[3] // _NEIGHBOR_Y_BUCKET_SIZE
    below_stop = (title[3] + _MAX_JOIN_GAP) // _NEIGHBOR_Y_BUCKET_SIZE
    for cell_x in x_cells:
        for cell_y in range(above_start, above_stop + 1):
            candidates.update(index.by_bottom.get((cell_y, cell_x), ()))
        for cell_y in range(below_start, below_stop + 1):
            candidates.update(index.by_top.get((cell_y, cell_x), ()))
    return tuple(candidates)


def _neighbor_x_cells(box: Box) -> range:
    first_x = min(box[0], box[2] - 1) // _NEIGHBOR_X_BUCKET_SIZE
    last_x = max(box[0], box[2] - 1) // _NEIGHBOR_X_BUCKET_SIZE
    return range(first_x, last_x + 1)


def _append_bounded(
    buckets: dict[tuple[int, int], list[int]],
    key: tuple[int, int],
    value: int,
) -> None:
    bucket = buckets.setdefault(key, [])
    if len(bucket) < _MAX_NEIGHBORS_PER_BUCKET:
        bucket.append(value)


def _is_controlled_qualifier(
    text: str,
    room_types: tuple[str, ...],
) -> bool:
    if not text or len(text) > 64 or len(text.split()) > 8:
        return False
    if _is_excluded(text):
        return False
    return (
        _matches_room_qualifier(text, room_types)
        or _matches_residence_qualifier(text)
        or _matches_project_qualifier(text)
        or _matches_floor_qualifier(text)
        or text in _DIRECTIONAL_QUALIFIERS
    )


def _matches_residence_qualifier(text: str) -> bool:
    return bool(
        re.fullmatch(r"[a-z0-9]+(?:\s+[a-z0-9]+){0,3}\s+residence", text)
    )


def _matches_project_qualifier(text: str) -> bool:
    return bool(
        re.fullmatch(r"project\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}", text)
    )


def _matches_floor_qualifier(text: str) -> bool:
    return text in _FLOOR_QUALIFIERS or bool(
        re.fullmatch(r"(?:level\s+)?\d+(?:st|nd|rd|th)?", text)
    )


def _contains_phrase(text: str, phrase: str) -> bool:
    return f" {phrase} " in f" {text} "


def _is_title_neighbor(
    qualifier: Box,
    title: Box,
    qualifier_precedes: bool,
) -> bool:
    gap = (
        title[1] - qualifier[3]
        if qualifier_precedes
        else qualifier[1] - title[3]
    )
    qualifier_height = max(1, qualifier[3] - qualifier[1])
    title_height = max(1, title[3] - title[1])
    if gap < 0 or gap > max(16, int(max(qualifier_height, title_height) * 0.9)):
        return False
    overlap = max(0, min(qualifier[2], title[2]) - max(qualifier[0], title[0]))
    narrower_width = max(
        1,
        min(qualifier[2] - qualifier[0], title[2] - title[0]),
    )
    return overlap / narrower_width >= 0.4


def _union_box(first: Box, second: Box) -> Box:
    return (
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[2], second[2]),
        max(first[3], second[3]),
    )


def _boxes_overlap(first: Box, second: Box) -> bool:
    return (
        max(first[0], second[0]) < min(first[2], second[2])
        and max(first[1], second[1]) < min(first[3], second[3])
    )


def _box_cells(box: Box) -> tuple[tuple[int, int], ...]:
    left, top, right, bottom = box
    first_x = min(left, right - 1) // _DEDUPE_CELL_SIZE
    last_x = max(left, right - 1) // _DEDUPE_CELL_SIZE
    first_y = min(top, bottom - 1) // _DEDUPE_CELL_SIZE
    last_y = max(top, bottom - 1) // _DEDUPE_CELL_SIZE
    return tuple(
        (cell_x, cell_y)
        for cell_y in range(first_y, last_y + 1)
        for cell_x in range(first_x, last_x + 1)
    )

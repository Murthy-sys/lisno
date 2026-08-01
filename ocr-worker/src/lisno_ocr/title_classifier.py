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
_MAX_OVERVIEW_SEGMENT_TOLERANCE = 24
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
    segment_texts = tuple(
        _prepare_ocr_title(
            line.text,
            compact_title_tokens,
        )
        for line in ordered
    )
    normalized_texts = tuple(
        ""
        if _is_single_line_overview(text, plan_types, room_types)
        else text
        for text in segment_texts
    )
    comparison_texts = tuple(
        _comparison_text(text)
        for text in normalized_texts
    )
    overview_indices = _segmented_overview_indices(
        ordered,
        segment_texts,
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


def is_excluded_drawing_title(text: str) -> bool:
    """Return whether title text matches the classifier's non-drawing taxonomy."""
    prepared = _prepare_ocr_title(text, {})
    return _is_excluded(_comparison_text(prepared))


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
    prepared = _prepare_ocr_title(text, compact_title_tokens)
    if _is_single_line_overview(prepared, plan_types, room_types):
        return ""
    return prepared


def _prepare_ocr_title(
    text: str,
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
    return _is_combined_drawing_overview(
        stripped,
        plan_types,
        room_types,
    )


def _is_combined_drawing_overview(
    text: str,
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> bool:
    if "&" not in text:
        return False
    fragments = text.split("&")
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
    segment_texts: Sequence[str],
    normalized_texts: Sequence[str],
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> frozenset[int]:
    ampersand_indices = tuple(
        index
        for index, text in enumerate(segment_texts)
        if _is_incomplete_ampersand_segment(text)
    )
    if not ampersand_indices:
        return frozenset()

    spatial_index: dict[tuple[int, int], list[int]] = {}
    for index, line in enumerate(lines):
        for cell in _overview_spatial_cells(line.box):
            _append_bounded(spatial_index, cell, index)

    excluded: set[int] = set()
    for ampersand_index in ampersand_indices:
        candidates: set[int] = set()
        for cell in _overview_spatial_cells(
            lines[ampersand_index].box,
            _MAX_OVERVIEW_SEGMENT_TOLERANCE,
        ):
            candidates.update(spatial_index.get(cell, ()))

        closest: dict[tuple[str, int], tuple[tuple[int, int], int]] = {}
        for candidate_index in candidates:
            if candidate_index == ampersand_index:
                continue
            for orientation, direction, gap in _overview_segment_relations(
                lines[ampersand_index].box,
                lines[candidate_index].box,
            ):
                key = (orientation, direction)
                score = (
                    max(0, gap),
                    abs(gap),
                )
                current = closest.get(key)
                if current is None or (score, candidate_index) < (
                    current[0],
                    current[1],
                ):
                    closest[key] = (score, candidate_index)

        components: set[tuple[str, tuple[int, ...]]] = set()
        for (orientation, _direction), (
            _score,
            candidate_index,
        ) in closest.items():
            components.add(
                (
                    orientation,
                    tuple(sorted((ampersand_index, candidate_index))),
                )
            )
        for orientation in ("row", "column"):
            before = closest.get((orientation, -1))
            after = closest.get((orientation, 1))
            if before is not None and after is not None:
                components.add(
                    (
                        orientation,
                        tuple(
                            sorted(
                                (
                                    before[1],
                                    ampersand_index,
                                    after[1],
                                )
                            )
                        ),
                    )
                )

        for orientation, component in components:
            reading_order = sorted(
                component,
                key=lambda index: _overview_reading_order_key(
                    lines[index].box,
                    orientation,
                ),
            )
            combined = " ".join(
                segment_texts[index]
                for index in reading_order
                if segment_texts[index]
            )
            if _is_combined_drawing_overview(
                combined,
                plan_types,
                room_types,
            ):
                excluded.update(
                    index
                    for index in component
                    if _is_supported_title(
                        _comparison_text(normalized_texts[index]),
                        plan_types,
                        room_types,
                    )
                )
    return frozenset(excluded)


def _is_incomplete_ampersand_segment(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("&") or stripped.endswith("&")


def _overview_spatial_cells(
    box: Box,
    margin: int = 0,
) -> tuple[tuple[int, int], ...]:
    left = box[0] - margin
    top = box[1] - margin
    right = box[2] + margin
    bottom = box[3] + margin
    first_x = left // _NEIGHBOR_X_BUCKET_SIZE
    last_x = max(left, right - 1) // _NEIGHBOR_X_BUCKET_SIZE
    first_y = top // _NEIGHBOR_Y_BUCKET_SIZE
    last_y = max(top, bottom - 1) // _NEIGHBOR_Y_BUCKET_SIZE
    return tuple(
        (cell_y, cell_x)
        for cell_y in range(first_y, last_y + 1)
        for cell_x in range(first_x, last_x + 1)
    )


def _overview_segment_relations(
    reference: Box,
    candidate: Box,
) -> tuple[tuple[str, int, int], ...]:
    reference_height = max(1, reference[3] - reference[1])
    candidate_height = max(1, candidate[3] - candidate[1])
    tolerance = min(
        _MAX_OVERVIEW_SEGMENT_TOLERANCE,
        max(4, max(reference_height, candidate_height) // 2),
    )
    relations: list[tuple[str, int, int]] = []

    vertical_overlap = max(
        0,
        min(reference[3], candidate[3])
        - max(reference[1], candidate[1]),
    )
    if vertical_overlap / min(reference_height, candidate_height) >= 0.4:
        reference_center_x = reference[0] + reference[2]
        candidate_center_x = candidate[0] + candidate[2]
        if candidate_center_x < reference_center_x:
            direction = -1
            gap = reference[0] - candidate[2]
        else:
            direction = 1
            gap = candidate[0] - reference[2]
        if -tolerance <= gap <= tolerance:
            relations.append(("row", direction, gap))

    reference_width = max(1, reference[2] - reference[0])
    candidate_width = max(1, candidate[2] - candidate[0])
    horizontal_overlap = max(
        0,
        min(reference[2], candidate[2])
        - max(reference[0], candidate[0]),
    )
    if horizontal_overlap / min(reference_width, candidate_width) >= 0.4:
        reference_center_y = reference[1] + reference[3]
        candidate_center_y = candidate[1] + candidate[3]
        if candidate_center_y < reference_center_y:
            direction = -1
            gap = reference[1] - candidate[3]
        else:
            direction = 1
            gap = candidate[1] - reference[3]
        if -tolerance <= gap <= tolerance:
            relations.append(("column", direction, gap))
    return tuple(relations)


def _overview_reading_order_key(
    box: Box,
    orientation: str,
) -> tuple[int, int]:
    if orientation == "row":
        return (box[0], box[1])
    return (box[1], box[0])


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

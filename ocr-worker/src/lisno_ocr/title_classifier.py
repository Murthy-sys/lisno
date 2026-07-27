from __future__ import annotations

import re
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
    "refer to",
    "see",
    "as per",
    "typical",
    "note",
    "verify",
    "provide",
    "do not",
    "not for construction",
)
_FLOOR_QUALIFIERS = frozenset(
    {
        "basement",
        "ground floor",
        "first floor",
        "second floor",
        "third floor",
        "upper floor",
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
        "\u2212": "-",
    }
)
_NEIGHBOR_WINDOW = 8
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


def classify_drawing_titles(
    lines: Sequence[OcrLine],
    accepted_plan_types: Sequence[str],
    accepted_room_types: Sequence[str] = DEFAULT_ROOM_TYPES,
) -> tuple[DrawingTitle, ...]:
    plan_types = _normalized_plan_types(accepted_plan_types)
    room_types = _normalized_plan_types(accepted_room_types)
    ordered = sorted(
        (line for line in lines if line.text.strip()),
        key=lambda line: (line.box[1], line.box[0]),
    )
    consumed: set[int] = set()
    titles: list[DrawingTitle] = []

    for index, line in enumerate(ordered):
        if index in consumed:
            continue
        comparison = _comparison_text(line.text)
        if not _is_supported_title(comparison, plan_types, room_types):
            continue

        label = _display_text(line.text)
        box = line.box
        confidence = line.confidence
        if _is_bare_drawing_type(comparison, plan_types):
            neighbor = _adjacent_qualifier(
                ordered,
                index,
                consumed,
                plan_types,
                room_types,
            )
            if neighbor is not None:
                neighbor_index, qualifier, qualifier_precedes = neighbor
                consumed.add(neighbor_index)
                box = _union_box(box, qualifier.box)
                confidence = min(confidence, qualifier.confidence)
                qualifier_label = _display_text(qualifier.text)
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
    if _matches_directional_elevation(text):
        return True
    return _matches_plan_title(text, plan_types, room_types)


def _is_excluded(text: str) -> bool:
    words = set(text.split())
    if re.match(r"^\d+\s+", text):
        return True
    if any(_contains_phrase(text, phrase) for phrase in _DIRECTIVE_PHRASES):
        return True
    if any(phrase in text for phrase in _EXCLUDED_PHRASES):
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


def _matches_directional_elevation(text: str) -> bool:
    return any(
        text == elevation
        or text.startswith(f"{elevation} ")
        or text.endswith(f" {elevation}")
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
        if (
            text == drawing_type
            or text.startswith(f"{drawing_type} ")
            or text.endswith(f" {drawing_type}")
        ):
            return True
    if "room" not in plan_types or not text.endswith(" plan"):
        return False
    qualifier = text.removesuffix(" plan").strip()
    return _matches_room_qualifier(qualifier, room_types)


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
    plan_types: tuple[str, ...],
    room_types: tuple[str, ...],
) -> tuple[int, OcrLine, bool] | None:
    title = lines[title_index]
    neighbors: list[tuple[int, int, OcrLine, bool]] = []
    start = max(0, title_index - _NEIGHBOR_WINDOW)
    stop = min(len(lines), title_index + _NEIGHBOR_WINDOW + 1)
    for neighbor_index in range(start, stop):
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
        qualifier_text = _comparison_text(qualifier.text)
        if (
            _is_controlled_qualifier(qualifier_text, room_types)
            and not _is_supported_title(
                qualifier_text,
                plan_types,
                room_types,
            )
            and _is_title_neighbor(qualifier.box, title.box, precedes)
        ):
            neighbors.append((gap, neighbor_index, qualifier, precedes))
    if not neighbors:
        return None
    _gap, neighbor_index, qualifier, precedes = min(
        neighbors,
        key=lambda item: (item[0], item[2].box[1], item[2].box[0]),
    )
    return neighbor_index, qualifier, precedes


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
        or _matches_floor_qualifier(text)
        or text in _DIRECTIONAL_QUALIFIERS
    )


def _matches_residence_qualifier(text: str) -> bool:
    return bool(
        re.fullmatch(r"[a-z0-9]+(?:\s+[a-z0-9]+){0,3}\s+residence", text)
    )


def _matches_floor_qualifier(text: str) -> bool:
    return text in _FLOOR_QUALIFIERS or bool(
        re.fullmatch(r"level\s+[a-z0-9]+", text)
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

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypeAlias


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
_CALLOUT_WORDS = frozenset(
    {
        "aluminium",
        "aluminum",
        "brass",
        "concrete",
        "fabric",
        "glass",
        "granite",
        "grout",
        "laminate",
        "marble",
        "metal",
        "paint",
        "plaster",
        "plywood",
        "quartz",
        "stone",
        "steel",
        "teak",
        "tile",
        "timber",
        "veneer",
        "wallpaper",
        "wood",
    }
)
_NOTE_WORDS = frozenset(
    {
        "all",
        "approved",
        "continue",
        "existing",
        "match",
        "provide",
        "refer",
        "typical",
    }
)
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
) -> tuple[DrawingTitle, ...]:
    plan_types = _normalized_plan_types(accepted_plan_types)
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
        if not _is_supported_title(comparison, plan_types):
            continue

        label = _display_text(line.text)
        box = line.box
        confidence = line.confidence
        if _is_bare_drawing_type(comparison, plan_types):
            neighbor = _adjacent_qualifier(ordered, index, consumed, plan_types)
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
    for title in sorted(titles, key=lambda item: (item.box[1], item.box[0])):
        normalized_label = _comparison_text(title.label)
        if any(
            _comparison_text(existing.label) == normalized_label
            and _boxes_overlap(existing.box, title.box)
            for existing in deduplicated
        ):
            continue
        deduplicated.append(title)
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


def _is_supported_title(text: str, plan_types: tuple[str, ...]) -> bool:
    if not text or _is_excluded(text):
        return False
    if _matches_directional_elevation(text):
        return True
    return _matches_plan_title(text, plan_types)


def _is_excluded(text: str) -> bool:
    words = set(text.split())
    if re.match(r"^\d+\s+", text):
        return True
    if any(phrase in text for phrase in _EXCLUDED_PHRASES):
        return True
    if words & _EXCLUDED_WORDS:
        return True
    if words & _CALLOUT_WORDS:
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


def _matches_plan_title(text: str, plan_types: tuple[str, ...]) -> bool:
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
    return _is_qualifier(qualifier, plan_types)


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
) -> tuple[int, OcrLine, bool] | None:
    title = lines[title_index]
    neighbors: list[tuple[int, int, OcrLine, bool]] = []
    for neighbor_index, qualifier in enumerate(lines):
        if neighbor_index == title_index or neighbor_index in consumed:
            continue
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
            _is_qualifier(qualifier_text, plan_types)
            and not _is_supported_title(qualifier_text, plan_types)
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


def _is_qualifier(text: str, plan_types: tuple[str, ...]) -> bool:
    if not text or len(text) > 64 or len(text.split()) > 8:
        return False
    if _is_excluded(text):
        return False
    words = set(text.split())
    if words & _NOTE_WORDS:
        return False
    if _matches_directional_elevation(text):
        return False
    if any(
        text == f"{plan_type} plan"
        for plan_type in plan_types
        if plan_type != "room"
    ):
        return False
    return any(character.isalpha() for character in text)


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

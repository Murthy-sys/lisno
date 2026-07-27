from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass
from math import ceil, sqrt
from typing import Literal, Sequence, TypeAlias

import numpy as np
from PIL import Image

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


@dataclass(frozen=True, slots=True)
class PanelProposal:
    label: str
    confidence: float
    crop: Box
    heading_box: Box


@dataclass(frozen=True, slots=True)
class _DrawingRegion:
    box: Box
    ink_pixels: int


def propose_panels(
    image: Image.Image,
    lines: Sequence[OcrLine],
    settings: LayoutSettings,
) -> tuple[PanelProposal, ...]:
    page_width, page_height = image.size
    if page_width <= 0 or page_height <= 0:
        return ()

    candidates = tuple(
        candidate
        for line in lines
        if (
            candidate := classify_heading(
                line, page_width, page_height, settings
            )
        )
        is not None
    )
    if not candidates:
        return ()

    reserved_zones = _reserved_zones(
        lines, page_width, page_height, settings
    )
    regions = _discover_drawing_regions(
        image,
        lines,
        reserved_zones,
        settings,
    )
    if not regions:
        return ()

    if len(candidates) == 1 and candidates[0].kind == "page_title":
        dominant = _dominant_region(regions, page_width, page_height, settings)
        if dominant is None:
            return ()
        raw_proposals = (
            _make_proposal(
                candidates[0],
                dominant,
                1.0,
                page_width,
                page_height,
                reserved_zones,
            ),
        )
    else:
        assignments = tuple(
            assignment
            for candidate in candidates
            if (
                assignment := _best_region_for_heading(
                    candidate,
                    candidates,
                    regions,
                    page_width,
                    page_height,
                )
            )
            is not None
        )
        raw_proposals = tuple(
            _make_proposal(
                candidate,
                _partition_region_box(
                    candidate,
                    tuple(
                        other_candidate
                        for other_candidate, _score, other_region in assignments
                        if other_region == region
                    ),
                    region,
                    page_width,
                    page_height,
                ),
                layout_score,
                page_width,
                page_height,
                reserved_zones,
            )
            for candidate, layout_score, region in assignments
        )

    return _suppress_and_separate(raw_proposals, settings)


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


def _reserved_zones(
    lines: Sequence[OcrLine],
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> tuple[Box, ...]:
    bottom_start = int(page_height * (1 - settings.reserved_bottom_ratio))
    zones: list[Box] = [(0, bottom_start, page_width, page_height)]
    for line in lines:
        match_text = _match_text(line.text)
        if not any(
            _contains_term(match_text, term) for term in settings.reserved_terms
        ):
            continue
        left, top, right, bottom = line.box
        horizontal_padding = max(
            int(page_width * 0.04), int(max(0, right - left) * 0.45)
        )
        vertical_above = max(int(page_height * 0.025), bottom - top)
        vertical_below = max(int(page_height * 0.14), (bottom - top) * 5)
        zones.append(
            _clamp_box(
                (
                    left - horizontal_padding,
                    top - vertical_above,
                    right + horizontal_padding,
                    bottom + vertical_below,
                ),
                page_width,
                page_height,
            )
        )
    return tuple(zones)


def _discover_drawing_regions(
    image: Image.Image,
    lines: Sequence[OcrLine],
    reserved_zones: Sequence[Box],
    settings: LayoutSettings,
) -> tuple[_DrawingRegion, ...]:
    page_width, page_height = image.size
    analysis_scale = min(
        1.0, sqrt(_MAX_ANALYSIS_PIXELS / max(page_width * page_height, 1))
    )
    analysis_width = max(1, round(page_width * analysis_scale))
    analysis_height = max(1, round(page_height * analysis_scale))
    grayscale_image = image.convert("L")
    if analysis_scale < 1:
        grayscale_image = grayscale_image.resize(
            (analysis_width, analysis_height),
            Image.Resampling.BOX,
        )
    grayscale = np.asarray(grayscale_image)
    mask = grayscale < 210
    text_padding = max(
        2, round(min(analysis_width, analysis_height) * 0.004)
    )
    for line in lines:
        _erase_mask_box(
            mask,
            _pad_box(
                _scale_box(line.box, analysis_scale, analysis_scale),
                text_padding,
            ),
            analysis_width,
            analysis_height,
        )
    for zone in reserved_zones:
        _erase_mask_box(
            mask,
            _scale_box(zone, analysis_scale, analysis_scale),
            analysis_width,
            analysis_height,
        )
    if np.count_nonzero(mask) > mask.size * 0.45:
        return ()

    components = _connected_components(mask)
    merged = _merge_nearby_components(
        components, analysis_width, analysis_height, settings
    )
    analysis_area = analysis_width * analysis_height
    analysis_zones = tuple(
        _scale_box(zone, analysis_scale, analysis_scale)
        for zone in reserved_zones
    )
    regions = []
    for region in merged:
        width, height = _box_size(region.box)
        region_area = width * height
        ink_density = region.ink_pixels / max(region_area, 1)
        if region_area < analysis_area * settings.min_region_area_ratio:
            continue
        if width < analysis_width * 0.08 or height < analysis_height * 0.06:
            continue
        if ink_density <= 0.001 or ink_density >= 0.62:
            continue
        if not _has_interior_drawing_ink(mask, region):
            continue
        if any(
            _intersection_area(region.box, zone) >= region_area * 0.25
            for zone in analysis_zones
        ):
            continue
        regions.append(
            _DrawingRegion(
                _unscale_box(
                    region.box,
                    analysis_scale,
                    page_width,
                    page_height,
                ),
                region.ink_pixels,
            )
        )
    return tuple(sorted(regions, key=lambda region: (region.box[1], region.box[0])))


def _erase_mask_box(
    mask: np.ndarray,
    box: Box,
    page_width: int,
    page_height: int,
) -> None:
    left, top, right, bottom = _clamp_box(box, page_width, page_height)
    mask[top:bottom, left:right] = False


def _connected_components(mask: np.ndarray) -> tuple[_DrawingRegion, ...]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[_DrawingRegion] = []
    for start_y, start_x in np.argwhere(mask):
        if visited[start_y, start_x]:
            continue
        queue = deque([(int(start_x), int(start_y))])
        visited[start_y, start_x] = True
        left = right = int(start_x)
        top = bottom = int(start_y)
        pixels = 0
        while queue:
            x, y = queue.popleft()
            pixels += 1
            left = min(left, x)
            top = min(top, y)
            right = max(right, x)
            bottom = max(bottom, y)
            for neighbor_x, neighbor_y in (
                (x - 1, y - 1),
                (x, y - 1),
                (x + 1, y - 1),
                (x - 1, y),
                (x + 1, y),
                (x - 1, y + 1),
                (x, y + 1),
                (x + 1, y + 1),
            ):
                if (
                    0 <= neighbor_x < width
                    and 0 <= neighbor_y < height
                    and mask[neighbor_y, neighbor_x]
                    and not visited[neighbor_y, neighbor_x]
                ):
                    visited[neighbor_y, neighbor_x] = True
                    queue.append((neighbor_x, neighbor_y))
        components.append(
            _DrawingRegion((left, top, right + 1, bottom + 1), pixels)
        )
        if len(components) > _MAX_COMPONENTS:
            return ()
    return tuple(components)


def _has_interior_drawing_ink(
    mask: np.ndarray,
    region: _DrawingRegion,
) -> bool:
    left, top, right, bottom = region.box
    width, height = _box_size(region.box)
    margin = max(2, round(min(width, height) * 0.02))
    if right - left <= margin * 2 or bottom - top <= margin * 2:
        return False
    interior_pixels = int(
        np.count_nonzero(
            mask[top + margin : bottom - margin, left + margin : right - margin]
        )
    )
    return interior_pixels >= max(24, round(region.ink_pixels * 0.08))


def _merge_nearby_components(
    components: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> tuple[_DrawingRegion, ...]:
    page_area = page_width * page_height
    minimum_fragment_area = page_area * settings.min_region_area_ratio * 0.12
    regions = [
        component
        for component in components
        if _box_area(component.box) >= minimum_fragment_area
        or component.ink_pixels >= minimum_fragment_area * 0.02
    ]
    horizontal_gap = max(2, round(page_width * 0.012))
    vertical_gap = max(2, round(page_height * 0.012))

    changed = True
    while changed:
        changed = False
        for first_index, first in enumerate(regions):
            for second_index in range(first_index + 1, len(regions)):
                second = regions[second_index]
                if not _components_belong_together(
                    first.box,
                    second.box,
                    horizontal_gap,
                    vertical_gap,
                ):
                    continue
                regions[first_index] = _DrawingRegion(
                    _union_box(first.box, second.box),
                    first.ink_pixels + second.ink_pixels,
                )
                del regions[second_index]
                changed = True
                break
            if changed:
                break
    return tuple(regions)


def _components_belong_together(
    first: Box,
    second: Box,
    horizontal_gap: int,
    vertical_gap: int,
) -> bool:
    if _intersection_area(first, second) > 0:
        return True
    first_width, first_height = _box_size(first)
    second_width, second_height = _box_size(second)
    x_overlap = max(0, min(first[2], second[2]) - max(first[0], second[0]))
    y_overlap = max(0, min(first[3], second[3]) - max(first[1], second[1]))
    x_gap = max(0, max(first[0], second[0]) - min(first[2], second[2]))
    y_gap = max(0, max(first[1], second[1]) - min(first[3], second[3]))
    vertically_aligned = x_overlap >= min(first_width, second_width) * 0.3
    horizontally_aligned = y_overlap >= min(first_height, second_height) * 0.3
    return (
        vertically_aligned and y_gap <= vertical_gap
    ) or (
        horizontally_aligned and x_gap <= horizontal_gap
    )


def _dominant_region(
    regions: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> _DrawingRegion | None:
    ordered = sorted(regions, key=lambda region: _box_area(region.box), reverse=True)
    if not ordered:
        return None
    largest_area = _box_area(ordered[0].box)
    page_area = page_width * page_height
    if largest_area < page_area * max(settings.min_region_area_ratio * 2, 0.12):
        return None
    if len(ordered) > 1 and largest_area < _box_area(ordered[1].box) * 1.35:
        return None
    return ordered[0]


def _best_region_for_heading(
    candidate: HeadingCandidate,
    candidates: Sequence[HeadingCandidate],
    regions: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
) -> tuple[HeadingCandidate, float, _DrawingRegion] | None:
    scored_regions = tuple(
        (
            _association_score(
                candidate,
                candidates,
                region,
                page_width,
                page_height,
            ),
            region,
        )
        for region in regions
    )
    layout_score, region = max(
        scored_regions, key=lambda item: item[0], default=(0.0, None)
    )
    if region is None or layout_score < 0.42:
        return None
    return candidate, layout_score, region


def _partition_region_box(
    candidate: HeadingCandidate,
    competitors: Sequence[HeadingCandidate],
    region: _DrawingRegion,
    page_width: int,
    page_height: int,
) -> _DrawingRegion:
    box = list(region.box)
    candidate_x = _box_center_x(candidate.line.box)
    candidate_y = (candidate.line.box[1] + candidate.line.box[3]) / 2
    for neighbor in competitors:
        if neighbor is candidate:
            continue
        neighbor_x = _box_center_x(neighbor.line.box)
        neighbor_y = (neighbor.line.box[1] + neighbor.line.box[3]) / 2
        delta_x = abs(candidate_x - neighbor_x) / max(page_width, 1)
        delta_y = abs(candidate_y - neighbor_y) / max(page_height, 1)
        if delta_x < 0.02 and delta_y < 0.02:
            continue
        if delta_x >= delta_y:
            boundary = round((candidate_x + neighbor_x) / 2)
            if candidate_x < neighbor_x:
                box[2] = min(box[2], boundary)
            else:
                box[0] = max(box[0], boundary)
        else:
            boundary = round((candidate_y + neighbor_y) / 2)
            if candidate_y < neighbor_y:
                box[3] = min(box[3], boundary)
            else:
                box[1] = max(box[1], boundary)
    return _DrawingRegion(tuple(box), region.ink_pixels)


def _association_score(
    candidate: HeadingCandidate,
    candidates: Sequence[HeadingCandidate],
    region: _DrawingRegion,
    page_width: int,
    page_height: int,
) -> float:
    heading = candidate.line.box
    heading_width, _heading_height = _box_size(heading)
    region_width, _region_height = _box_size(region.box)
    horizontal_overlap = max(
        0, min(heading[2], region.box[2]) - max(heading[0], region.box[0])
    )
    overlap_ratio = horizontal_overlap / max(
        1, min(heading_width, region_width)
    )
    center_distance = abs(_box_center_x(heading) - _box_center_x(region.box))
    if overlap_ratio < 0.18 and center_distance > page_width * 0.18:
        return 0.0

    vertical_gap = region.box[1] - heading[3]
    if vertical_gap < -page_height * 0.08:
        return 0.0
    if vertical_gap > page_height * 0.32:
        return 0.0
    region_center_y = (region.box[1] + region.box[3]) / 2
    for neighbor in candidates:
        if neighbor is candidate:
            continue
        neighbor_box = neighbor.line.box
        neighbor_overlap = max(
            0,
            min(heading[2], neighbor_box[2])
            - max(heading[0], neighbor_box[0]),
        )
        if (
            neighbor_box[1] > heading[1]
            and neighbor_overlap >= min(heading_width, _box_size(neighbor_box)[0]) * 0.2
            and region_center_y >= neighbor_box[1]
        ):
            return 0.0

    proximity = 1 - min(abs(vertical_gap) / max(page_height * 0.25, 1), 1)
    center_alignment = 1 - min(center_distance / max(page_width * 0.35, 1), 1)
    area_score = min(
        _box_area(region.box) / max(page_width * page_height * 0.18, 1),
        1,
    )
    return (
        overlap_ratio * 0.38
        + proximity * 0.27
        + center_alignment * 0.18
        + area_score * 0.17
    )


def _make_proposal(
    candidate: HeadingCandidate,
    region: _DrawingRegion,
    layout_score: float,
    page_width: int,
    page_height: int,
    reserved_zones: Sequence[Box],
) -> PanelProposal:
    padding = max(4, round(min(page_width, page_height) * 0.012))
    crop = _clamp_box(
        _pad_box(_union_box(candidate.line.box, region.box), padding),
        page_width,
        page_height,
    )
    crop = _trim_crop_against_reserved_zones(
        crop,
        candidate.line.box,
        region.box,
        reserved_zones,
    )
    confidence = min(
        1.0,
        candidate.line.confidence * 0.45
        + candidate.semantic_score * 0.30
        + layout_score * 0.25,
    )
    return PanelProposal(
        label=candidate.label,
        confidence=confidence,
        crop=crop,
        heading_box=_clamp_box(
            candidate.line.box, page_width, page_height
        ),
    )


def _trim_crop_against_reserved_zones(
    crop: Box,
    heading_box: Box,
    region_box: Box,
    reserved_zones: Sequence[Box],
) -> Box:
    trimmed = list(crop)
    protected = _union_box(heading_box, region_box)
    for zone in reserved_zones:
        if _intersection_area(tuple(trimmed), zone) == 0:
            continue
        if protected[3] <= zone[1]:
            trimmed[3] = min(trimmed[3], zone[1])
        elif protected[1] >= zone[3]:
            trimmed[1] = max(trimmed[1], zone[3])
        elif protected[2] <= zone[0]:
            trimmed[2] = min(trimmed[2], zone[0])
        elif protected[0] >= zone[2]:
            trimmed[0] = max(trimmed[0], zone[2])
    return tuple(trimmed)


def _suppress_and_separate(
    proposals: Sequence[PanelProposal],
    settings: LayoutSettings,
) -> tuple[PanelProposal, ...]:
    accepted: list[PanelProposal] = []
    for proposal in sorted(
        proposals, key=lambda item: item.confidence, reverse=True
    ):
        normalized_label = _match_text(proposal.label)
        duplicate = any(
            normalized_label == _match_text(existing.label)
            and (
                _box_iou(proposal.heading_box, existing.heading_box)
                >= settings.duplicate_iou
                or _box_iou(proposal.crop, existing.crop)
                >= settings.duplicate_iou
            )
            for existing in accepted
        )
        substantial_overlap = any(
            _box_iou(proposal.crop, existing.crop)
            >= min(settings.duplicate_iou, 0.35)
            for existing in accepted
        )
        if not duplicate and not substantial_overlap:
            accepted.append(proposal)

    ordered = sorted(
        accepted, key=lambda item: (item.heading_box[1], item.heading_box[0])
    )
    for first_index in range(len(ordered)):
        for second_index in range(first_index + 1, len(ordered)):
            first = ordered[first_index]
            second = ordered[second_index]
            if _intersection_area(first.crop, second.crop) == 0:
                continue
            first_crop, second_crop = _split_overlap(first, second)
            ordered[first_index] = PanelProposal(
                first.label,
                first.confidence,
                first_crop,
                first.heading_box,
            )
            ordered[second_index] = PanelProposal(
                second.label,
                second.confidence,
                second_crop,
                second.heading_box,
            )
    return tuple(ordered)


def _split_overlap(
    first: PanelProposal,
    second: PanelProposal,
) -> tuple[Box, Box]:
    first_center_x = _box_center_x(first.heading_box)
    second_center_x = _box_center_x(second.heading_box)
    first_center_y = (first.heading_box[1] + first.heading_box[3]) / 2
    second_center_y = (second.heading_box[1] + second.heading_box[3]) / 2
    x_separation = abs(first_center_x - second_center_x)
    y_separation = abs(first_center_y - second_center_y)
    first_crop = list(first.crop)
    second_crop = list(second.crop)
    if x_separation >= y_separation:
        if first_center_x <= second_center_x:
            boundary = (first_crop[2] + second_crop[0]) // 2
            first_crop[2] = max(first.heading_box[2], boundary)
            second_crop[0] = min(second.heading_box[0], boundary)
        else:
            boundary = (second_crop[2] + first_crop[0]) // 2
            second_crop[2] = max(second.heading_box[2], boundary)
            first_crop[0] = min(first.heading_box[0], boundary)
    elif first_center_y <= second_center_y:
        boundary = (first_crop[3] + second_crop[1]) // 2
        first_crop[3] = max(first.heading_box[3], boundary)
        second_crop[1] = min(second.heading_box[1], boundary)
    else:
        boundary = (second_crop[3] + first_crop[1]) // 2
        second_crop[3] = max(second.heading_box[3], boundary)
        first_crop[1] = min(first.heading_box[1], boundary)
    return tuple(first_crop), tuple(second_crop)


def _pad_box(box: Box, padding: int) -> Box:
    return (
        box[0] - padding,
        box[1] - padding,
        box[2] + padding,
        box[3] + padding,
    )


def _scale_box(box: Box, scale_x: float, scale_y: float) -> Box:
    return (
        int(box[0] * scale_x),
        int(box[1] * scale_y),
        ceil(box[2] * scale_x),
        ceil(box[3] * scale_y),
    )


def _unscale_box(
    box: Box,
    scale: float,
    page_width: int,
    page_height: int,
) -> Box:
    return _clamp_box(
        (
            int(box[0] / scale),
            int(box[1] / scale),
            ceil(box[2] / scale),
            ceil(box[3] / scale),
        ),
        page_width,
        page_height,
    )


def _clamp_box(box: Box, page_width: int, page_height: int) -> Box:
    left = max(0, min(int(box[0]), page_width))
    top = max(0, min(int(box[1]), page_height))
    right = max(left, min(int(box[2]), page_width))
    bottom = max(top, min(int(box[3]), page_height))
    return left, top, right, bottom


def _box_size(box: Box) -> tuple[int, int]:
    return max(0, box[2] - box[0]), max(0, box[3] - box[1])


def _box_area(box: Box) -> int:
    width, height = _box_size(box)
    return width * height


def _box_center_x(box: Box) -> float:
    return (box[0] + box[2]) / 2


def _union_box(first: Box, second: Box) -> Box:
    return (
        min(first[0], second[0]),
        min(first[1], second[1]),
        max(first[2], second[2]),
        max(first[3], second[3]),
    )


def _intersection_area(first: Box, second: Box) -> int:
    width = max(0, min(first[2], second[2]) - max(first[0], second[0]))
    height = max(0, min(first[3], second[3]) - max(first[1], second[1]))
    return width * height


def _box_iou(first: Box, second: Box) -> float:
    intersection = _intersection_area(first, second)
    union = _box_area(first) + _box_area(second) - intersection
    return intersection / max(union, 1)


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


_MAX_ANALYSIS_PIXELS = 2_000_000
_MAX_COMPONENTS = 20_000
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
_PARENTHETICAL_PROPERTY_RE = re.compile(r"\(([^()]*)\)")
_DISPLAY_WORD_RE = re.compile(r"[A-Za-z]+(?:\d+)?|\d+[A-Za-z][A-Za-z0-9]*")
_DIGIT_ACRONYM_RE = re.compile(r"\d+[A-Z]{2,}\d*")
_DISPLAY_ACRONYMS = frozenset({"AC", "DB", "FFL", "HVAC", "LED", "MEP", "RCP", "TV", "UPVC", "WC"})


def _looks_like_callout(
    text: str, match_text: str, settings: LayoutSettings
) -> bool:
    unmarked = _PANEL_MARKER_RE.sub("", text).strip()
    unmarked_match = _match_text(unmarked)
    if _has_material_specification_suffix(unmarked, settings):
        return True
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


def _has_material_specification_suffix(
    text: str, settings: LayoutSettings
) -> bool:
    dash_suffixes = text.split(" – ")[1:]
    parenthetical_properties = _PARENTHETICAL_PROPERTY_RE.findall(text)
    for phrase in (*dash_suffixes, *parenthetical_properties):
        match_phrase = _match_text(phrase)
        if _has_drawing_term(match_phrase, settings):
            continue
        if any(
            _contains_term(match_phrase, term)
            for term in settings.material_spec_terms
        ):
            return True
    return False

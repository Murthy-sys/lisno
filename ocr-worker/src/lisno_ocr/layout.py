from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass
from math import ceil, floor, sqrt
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
class _PanelCandidate:
    proposal: PanelProposal
    drawing_box: Box


@dataclass(frozen=True, slots=True)
class _DrawingRegion:
    box: Box
    ink_pixels: int
    component_count: int = 1
    compact_component_count: int = 0


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

    reserved_zones = _reserved_zones(image, lines, settings)
    regions = _discover_drawing_regions(
        image,
        lines,
        reserved_zones,
        settings,
    )
    if not regions:
        return ()
    measurement_mask, measurement_scale_x, measurement_scale_y = (
        _measurement_mask(image, lines, reserved_zones)
    )

    if len(candidates) == 1 and candidates[0].kind == "page_title":
        dominant = _dominant_region(regions, page_width, page_height, settings)
        if dominant is None:
            return ()
        proposal = _make_proposal(
            candidates[0],
            dominant,
            1.0,
            page_width,
            page_height,
            reserved_zones,
        )
        raw_proposals = () if proposal is None else (proposal,)
    else:
        assignments = _global_heading_region_assignments(
            candidates,
            regions,
            page_width,
            page_height,
        )
        raw_proposals = tuple(
            proposal
            for candidate, layout_score, region in assignments
            if (
                partition := _measure_partition(
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
                    ).box,
                    candidate,
                    measurement_mask,
                    measurement_scale_x,
                    measurement_scale_y,
                    page_width,
                    page_height,
                    settings,
                )
            )
            is not None
            and (
                proposal := _make_proposal(
                    candidate,
                    partition,
                    layout_score,
                    page_width,
                    page_height,
                    reserved_zones,
                )
            )
            is not None
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
    image: Image.Image,
    lines: Sequence[OcrLine],
    settings: LayoutSettings,
) -> tuple[Box, ...]:
    page_width, page_height = image.size
    mask, scale_x, scale_y = _base_analysis_mask(image)
    analysis_height, analysis_width = mask.shape
    text_padding = max(
        2, round(min(analysis_width, analysis_height) * 0.004)
    )
    for line in lines:
        _erase_mask_box(
            mask,
            _pad_box(
                _scale_box(line.box, scale_x, scale_y),
                text_padding,
            ),
            analysis_width,
            analysis_height,
        )
    if np.count_nonzero(mask) > mask.size * 0.45:
        return ()
    components = tuple(
        _DrawingRegion(
            _unscale_box(
                component.box,
                scale_x,
                scale_y,
                page_width,
                page_height,
            ),
            component.ink_pixels,
        )
        for component in _connected_components(mask)
    )
    heading_candidates = tuple(
        candidate
        for line in lines
        if (
            candidate := classify_heading(
                line,
                page_width,
                page_height,
                settings,
            )
        )
        is not None
    )
    zones: list[Box] = []
    for line in lines:
        match_text = _match_text(line.text)
        if not any(
            _contains_term(match_text, term) for term in settings.reserved_terms
        ):
            continue
        if not _box_near_page_edge(line.box, page_width, page_height):
            continue
        geometric_candidates = tuple(
            component
            for component in components
            if _reserved_geometry_evidence(
                component.box,
                components,
                page_width,
                page_height,
            )
            and not _region_has_heading_counter_evidence(
                component,
                heading_candidates,
                page_width,
                page_height,
                settings,
            )
            and _box_distance(line.box, component.box)
            <= max(page_width, page_height) * 0.08
        )
        if geometric_candidates:
            zones.append(
                min(
                    geometric_candidates,
                    key=lambda component: _box_distance(
                        line.box, component.box
                    ),
                ).box
            )

    zones.extend(
        component.box
        for component in components
        if _unlabeled_edge_reserved_geometry(
            component.box,
            components,
            page_width,
            page_height,
        )
        and not _region_has_heading_counter_evidence(
            component,
            heading_candidates,
            page_width,
            page_height,
            settings,
        )
    )
    return _deduplicate_boxes(zones)


def _region_has_heading_counter_evidence(
    region: _DrawingRegion,
    candidates: Sequence[HeadingCandidate],
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> bool:
    width, height = _box_size(region.box)
    if (
        _box_area(region.box)
        < page_width * page_height * settings.min_region_area_ratio
        or width < page_width * 0.08
        or height < page_height * 0.06
    ):
        return False
    return any(
        _association_score(
            candidate,
            (candidate,),
            region,
            page_width,
            page_height,
        )
        >= 0.42
        for candidate in candidates
    )


def _reserved_geometry_evidence(
    box: Box,
    components: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
) -> bool:
    width, height = _box_size(box)
    area_ratio = _box_area(box) / max(page_width * page_height, 1)
    bottom_band = (
        box[3] >= page_height * 0.92
        and width >= page_width * 0.35
        and height <= page_height * 0.30
    )
    compact_edge_container = (
        0.004 <= area_ratio <= 0.08
        and width <= page_width * 0.35
        and height <= page_height * 0.35
        and _box_near_page_edge(box, page_width, page_height)
        and _contained_component_count(box, components) >= 1
    )
    return bottom_band or compact_edge_container


def _unlabeled_edge_reserved_geometry(
    box: Box,
    components: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
) -> bool:
    width, height = _box_size(box)
    area_ratio = _box_area(box) / max(page_width * page_height, 1)
    title_block = (
        box[3] >= page_height * 0.96
        and box[1] >= page_height * 0.68
        and width >= page_width * 0.45
        and height <= page_height * 0.30
        and _contained_component_count(box, components) >= 3
    )
    compact_key_plan = (
        0.006 <= area_ratio <= 0.06
        and box[1] <= page_height * 0.20
        and (box[0] <= page_width * 0.08 or box[2] >= page_width * 0.92)
        and _contained_component_count(box, components) >= 1
    )
    return title_block or compact_key_plan


def _contained_component_count(
    container: Box,
    components: Sequence[_DrawingRegion],
) -> int:
    return sum(
        1
        for component in components
        if component.box != container
        and component.box[0] >= container[0]
        and component.box[1] >= container[1]
        and component.box[2] <= container[2]
        and component.box[3] <= container[3]
    )


def _box_near_page_edge(
    box: Box,
    page_width: int,
    page_height: int,
) -> bool:
    return (
        box[0] <= page_width * 0.08
        or box[2] >= page_width * 0.92
        or box[1] <= page_height * 0.20
        or box[3] >= page_height * 0.80
    )


def _box_distance(first: Box, second: Box) -> float:
    x_gap = max(0, max(first[0], second[0]) - min(first[2], second[2]))
    y_gap = max(0, max(first[1], second[1]) - min(first[3], second[3]))
    return sqrt(x_gap * x_gap + y_gap * y_gap)


def _deduplicate_boxes(boxes: Sequence[Box]) -> tuple[Box, ...]:
    unique: list[Box] = []
    for box in sorted(boxes, key=lambda item: (_box_area(item), item)):
        if any(_box_iou(box, existing) >= 0.80 for existing in unique):
            continue
        unique.append(box)
    return tuple(unique)


def _discover_drawing_regions(
    image: Image.Image,
    lines: Sequence[OcrLine],
    reserved_zones: Sequence[Box],
    settings: LayoutSettings,
) -> tuple[_DrawingRegion, ...]:
    page_width, page_height = image.size
    mask, scale_x, scale_y = _base_analysis_mask(image)
    analysis_height, analysis_width = mask.shape
    text_padding = max(
        2, round(min(analysis_width, analysis_height) * 0.004)
    )
    for line in lines:
        _erase_mask_box(
            mask,
            _pad_box(
                _scale_box(line.box, scale_x, scale_y),
                text_padding,
            ),
            analysis_width,
            analysis_height,
        )
    for zone in reserved_zones:
        _erase_mask_box(
            mask,
            _scale_box(zone, scale_x, scale_y),
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
        _scale_box(zone, scale_x, scale_y)
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
        if _looks_like_unrecognized_text(region):
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
                    scale_x,
                    scale_y,
                    page_width,
                    page_height,
                ),
                region.ink_pixels,
                region.component_count,
                region.compact_component_count,
            )
        )
    return tuple(sorted(regions, key=lambda region: (region.box[1], region.box[0])))


def _measurement_mask(
    image: Image.Image,
    lines: Sequence[OcrLine],
    reserved_zones: Sequence[Box],
) -> tuple[np.ndarray, float, float]:
    mask, scale_x, scale_y = _base_analysis_mask(image)
    analysis_height, analysis_width = mask.shape
    text_padding = max(
        2, round(min(analysis_width, analysis_height) * 0.004)
    )
    for line in lines:
        _erase_mask_box(
            mask,
            _pad_box(
                _scale_box(line.box, scale_x, scale_y),
                text_padding,
            ),
            analysis_width,
            analysis_height,
        )
    for zone in reserved_zones:
        _erase_mask_box(
            mask,
            _scale_box(zone, scale_x, scale_y),
            analysis_width,
            analysis_height,
        )
    return mask, scale_x, scale_y


def _base_analysis_mask(
    image: Image.Image,
) -> tuple[np.ndarray, float, float]:
    page_width, page_height = image.size
    analysis_width, analysis_height = _bounded_analysis_size(
        page_width,
        page_height,
        _MAX_ANALYSIS_PIXELS,
    )
    analysis_image = image
    if (analysis_width, analysis_height) != image.size:
        analysis_image = image.resize(
            (analysis_width, analysis_height),
            Image.Resampling.BOX,
        )
    mask = np.asarray(analysis_image.convert("L")) < 210
    return (
        mask,
        analysis_width / page_width,
        analysis_height / page_height,
    )


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
        row_counts: dict[int, int] = {}
        column_counts: dict[int, int] = {}
        while queue:
            x, y = queue.popleft()
            row_counts[y] = row_counts.get(y, 0) + 1
            column_counts[x] = column_counts.get(x, 0) + 1
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
        raw_box = (left, top, right + 1, bottom + 1)
        robust_box = _robust_component_box(
            raw_box, row_counts, column_counts
        )
        robust_left, robust_top, robust_right, robust_bottom = robust_box
        robust_pixels = int(
            np.count_nonzero(
                mask[
                    robust_top:robust_bottom,
                    robust_left:robust_right,
                ]
            )
        )
        robust_width, robust_height = _box_size(robust_box)
        is_compact = (
            robust_width < robust_height * 3
            and robust_height < robust_width * 3
        )
        components.append(
            _DrawingRegion(
                robust_box,
                robust_pixels,
                1,
                int(is_compact),
            )
        )
        if len(components) > _MAX_COMPONENTS:
            return ()
    return tuple(components)


def _robust_component_box(
    raw_box: Box,
    row_counts: dict[int, int],
    column_counts: dict[int, int],
) -> Box:
    width, height = _box_size(raw_box)
    minimum_column_ink = max(2, round(height * 0.10))
    minimum_row_ink = max(2, round(width * 0.10))
    structural_columns = [
        column
        for column, count in column_counts.items()
        if count >= minimum_column_ink
    ]
    structural_rows = [
        row
        for row, count in row_counts.items()
        if count >= minimum_row_ink
    ]
    if not structural_columns or not structural_rows:
        return raw_box
    return (
        min(structural_columns),
        min(structural_rows),
        max(structural_columns) + 1,
        max(structural_rows) + 1,
    )


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


def _looks_like_unrecognized_text(region: _DrawingRegion) -> bool:
    return (
        region.component_count >= 12
        and region.compact_component_count / region.component_count >= 0.75
    )


def _merge_nearby_components(
    components: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> tuple[_DrawingRegion, ...]:
    page_area = page_width * page_height
    minimum_fragment_ink = max(
        4, round(page_area * settings.min_region_area_ratio * 0.0005)
    )
    regions = [
        component
        for component in components
        if component.ink_pixels >= minimum_fragment_ink
    ]
    horizontal_gap = max(2, round(page_width * 0.02))
    vertical_gap = max(2, round(page_height * 0.02))
    if len(regions) < 2:
        return tuple(regions)

    parents = list(range(len(regions)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(first_index: int, second_index: int) -> None:
        first_root = find(first_index)
        second_root = find(second_index)
        if first_root != second_root:
            parents[second_root] = first_root

    cell_size = max(16, horizontal_gap * 2, vertical_gap * 2)
    spatial_index: dict[tuple[int, int], list[int]] = {}
    for index, region in enumerate(regions):
        expanded = _pad_box(
            region.box, max(horizontal_gap, vertical_gap)
        )
        left_cell = max(0, expanded[0]) // cell_size
        top_cell = max(0, expanded[1]) // cell_size
        right_cell = max(0, expanded[2]) // cell_size
        bottom_cell = max(0, expanded[3]) // cell_size
        neighbors: set[int] = set()
        for cell_y in range(top_cell, bottom_cell + 1):
            for cell_x in range(left_cell, right_cell + 1):
                neighbors.update(spatial_index.get((cell_x, cell_y), ()))
        for neighbor_index in neighbors:
            if _components_belong_together(
                region.box,
                regions[neighbor_index].box,
                horizontal_gap,
                vertical_gap,
            ):
                union(index, neighbor_index)
        for cell_y in range(top_cell, bottom_cell + 1):
            for cell_x in range(left_cell, right_cell + 1):
                spatial_index.setdefault((cell_x, cell_y), []).append(index)

    grouped: dict[int, list[_DrawingRegion]] = {}
    for index, region in enumerate(regions):
        grouped.setdefault(find(index), []).append(region)
    return tuple(
        _DrawingRegion(
            _union_boxes(member.box for member in members),
            sum(member.ink_pixels for member in members),
            sum(member.component_count for member in members),
            sum(member.compact_component_count for member in members),
        )
        for members in grouped.values()
    )


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
    first_flat = first_width > first_height * 8
    second_flat = second_width > second_height * 8
    first_tall = first_height > first_width * 8
    second_tall = second_height > second_width * 8
    first_two_dimensional = not first_flat and not first_tall
    second_two_dimensional = not second_flat and not second_tall
    if y_gap and (
        (first_flat and second_two_dimensional)
        or (second_flat and first_two_dimensional)
    ):
        return False
    if x_gap and (
        (first_tall and second_two_dimensional)
        or (second_tall and first_two_dimensional)
    ):
        return False
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


def _global_heading_region_assignments(
    candidates: Sequence[HeadingCandidate],
    regions: Sequence[_DrawingRegion],
    page_width: int,
    page_height: int,
) -> tuple[tuple[HeadingCandidate, float, _DrawingRegion], ...]:
    score_matrix = tuple(
        tuple(
            _association_score(
                candidate,
                candidates,
                region,
                page_width,
                page_height,
            )
            for region in regions
        )
        for candidate in candidates
    )
    assignments: list[tuple[HeadingCandidate, float, _DrawingRegion]] = []
    assigned_candidates: set[int] = set()
    for candidate_index, region_index in _maximum_weight_matching(
        score_matrix,
        minimum_weight=0.42,
    ):
        score = score_matrix[candidate_index][region_index]
        assignments.append(
            (
                candidates[candidate_index],
                score,
                regions[region_index],
            )
        )
        assigned_candidates.add(candidate_index)

    for candidate_index, candidate in enumerate(candidates):
        if candidate_index in assigned_candidates:
            continue
        best = max(
            (
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
            ),
            key=lambda item: item[0],
            default=(0.0, None),
        )
        score, region = best
        if region is not None and score >= 0.42:
            assignments.append((candidate, score, region))
    return tuple(assignments)


def _maximum_weight_matching(
    weights: Sequence[Sequence[float]],
    minimum_weight: float,
) -> tuple[tuple[int, int], ...]:
    row_count = len(weights)
    region_count = len(weights[0]) if row_count else 0
    if row_count == 0 or region_count == 0:
        return ()
    column_count = region_count + row_count
    costs = tuple(
        tuple(
            -(
                row[column]
                if column < region_count
                and row[column] >= minimum_weight
                else 0.0
            )
            for column in range(column_count)
        )
        for row in weights
    )

    row_potential = [0.0] * (row_count + 1)
    column_potential = [0.0] * (column_count + 1)
    matched_row = [0] * (column_count + 1)
    predecessor = [0] * (column_count + 1)
    for row_index in range(1, row_count + 1):
        matched_row[0] = row_index
        minimum_cost = [float("inf")] * (column_count + 1)
        used = [False] * (column_count + 1)
        column = 0
        while True:
            used[column] = True
            active_row = matched_row[column]
            delta = float("inf")
            next_column = 0
            for candidate_column in range(1, column_count + 1):
                if used[candidate_column]:
                    continue
                reduced_cost = (
                    costs[active_row - 1][candidate_column - 1]
                    - row_potential[active_row]
                    - column_potential[candidate_column]
                )
                if reduced_cost < minimum_cost[candidate_column]:
                    minimum_cost[candidate_column] = reduced_cost
                    predecessor[candidate_column] = column
                if minimum_cost[candidate_column] < delta:
                    delta = minimum_cost[candidate_column]
                    next_column = candidate_column
            for candidate_column in range(column_count + 1):
                if used[candidate_column]:
                    row_potential[matched_row[candidate_column]] += delta
                    column_potential[candidate_column] -= delta
                else:
                    minimum_cost[candidate_column] -= delta
            column = next_column
            if matched_row[column] == 0:
                break
        while True:
            previous_column = predecessor[column]
            matched_row[column] = matched_row[previous_column]
            column = previous_column
            if column == 0:
                break

    assignment_by_row = [-1] * row_count
    for column in range(1, column_count + 1):
        if matched_row[column]:
            assignment_by_row[matched_row[column] - 1] = column - 1
    return tuple(
        (row_index, column)
        for row_index, column in enumerate(assignment_by_row)
        if column < region_count
        and weights[row_index][column] >= minimum_weight
    )


def _measure_partition(
    box: Box,
    candidate: HeadingCandidate,
    mask: np.ndarray,
    scale_x: float,
    scale_y: float,
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> _DrawingRegion | None:
    box = _clamp_box(box, page_width, page_height)
    width, height = _box_size(box)
    page_area = page_width * page_height
    if (
        _box_area(box) < page_area * settings.min_region_area_ratio
        or width < page_width * 0.08
        or height < page_height * 0.06
    ):
        return None
    analysis_box = _clamp_box(
        _scale_box(box, scale_x, scale_y),
        mask.shape[1],
        mask.shape[0],
    )
    left, top, right, bottom = analysis_box
    ink_pixels = int(np.count_nonzero(mask[top:bottom, left:right]))
    analysis_area = _box_area(analysis_box)
    density = ink_pixels / max(analysis_area, 1)
    measured = _DrawingRegion(analysis_box, ink_pixels)
    if (
        density <= 0.001
        or density >= 0.62
        or not _has_interior_drawing_ink(mask, measured)
    ):
        return None
    source_region = _DrawingRegion(box, ink_pixels)
    if (
        _association_score(
            candidate,
            (candidate,),
            source_region,
            page_width,
            page_height,
        )
        < 0.42
    ):
        return None
    return source_region


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
) -> _PanelCandidate | None:
    crop = _clamp_box(
        _union_box(candidate.line.box, region.box),
        page_width,
        page_height,
    )
    crop = _trim_crop_against_reserved_zones(
        crop,
        candidate.line.box,
        region.box,
        reserved_zones,
    )
    if any(
        _intersection_area(crop, zone) > 0 for zone in reserved_zones
    ):
        return None
    confidence = min(
        1.0,
        candidate.line.confidence * 0.45
        + candidate.semantic_score * 0.30
        + layout_score * 0.25,
    )
    return _PanelCandidate(
        PanelProposal(
            label=candidate.label,
            confidence=confidence,
            crop=crop,
            heading_box=_clamp_box(
                candidate.line.box, page_width, page_height
            ),
        ),
        region.box,
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
    candidates: Sequence[_PanelCandidate],
    settings: LayoutSettings,
) -> tuple[PanelProposal, ...]:
    accepted: list[_PanelCandidate] = []
    for candidate in sorted(
        candidates,
        key=lambda item: item.proposal.confidence,
        reverse=True,
    ):
        proposal = candidate.proposal
        normalized_label = _match_text(proposal.label)
        duplicate = any(
            normalized_label == _match_text(existing.proposal.label)
            and (
                _box_iou(
                    proposal.heading_box,
                    existing.proposal.heading_box,
                )
                >= settings.duplicate_iou
                or _box_iou(proposal.crop, existing.proposal.crop)
                >= settings.duplicate_iou
            )
            for existing in accepted
        )
        colliding_headings = any(
            _intersection_area(
                proposal.heading_box,
                existing.proposal.heading_box,
            )
            > 0
            for existing in accepted
        )
        if duplicate or colliding_headings:
            continue
        trial_accepted = list(accepted)
        trial_candidate = candidate
        for existing_index, existing in enumerate(trial_accepted):
            if (
                _intersection_area(
                    existing.proposal.crop,
                    trial_candidate.proposal.crop,
                )
                == 0
            ):
                continue
            existing_crop, candidate_crop = _split_overlap(
                existing.proposal,
                trial_candidate.proposal,
            )
            if (
                not _candidate_crop_is_valid(existing, existing_crop)
                or not _candidate_crop_is_valid(
                    trial_candidate, candidate_crop
                )
                or _intersection_area(existing_crop, candidate_crop) > 0
            ):
                trial_candidate = None
                break
            trial_accepted[existing_index] = _PanelCandidate(
                PanelProposal(
                    existing.proposal.label,
                    existing.proposal.confidence,
                    existing_crop,
                    existing.proposal.heading_box,
                ),
                existing.drawing_box,
            )
            trial_candidate = _PanelCandidate(
                PanelProposal(
                    trial_candidate.proposal.label,
                    trial_candidate.proposal.confidence,
                    candidate_crop,
                    trial_candidate.proposal.heading_box,
                ),
                trial_candidate.drawing_box,
            )
        if trial_candidate is None:
            continue
        trial_accepted.append(trial_candidate)
        if not _candidate_set_is_valid(trial_accepted):
            continue
        accepted = trial_accepted
    return tuple(
        candidate.proposal
        for candidate in sorted(
            accepted,
            key=lambda item: (
                item.proposal.heading_box[1],
                item.proposal.heading_box[0],
            ),
        )
    )


def _candidate_crop_is_valid(
    candidate: _PanelCandidate,
    crop: Box,
) -> bool:
    return _box_contains(
        crop, candidate.proposal.heading_box
    ) and _box_contains(crop, candidate.drawing_box)


def _candidate_set_is_valid(
    candidates: Sequence[_PanelCandidate],
) -> bool:
    return all(
        _candidate_crop_is_valid(candidate, candidate.proposal.crop)
        for candidate in candidates
    ) and all(
        _intersection_area(first.proposal.crop, second.proposal.crop) == 0
        for index, first in enumerate(candidates)
        for second in candidates[index + 1 :]
    )


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
    scale_x: float,
    scale_y: float,
    page_width: int,
    page_height: int,
) -> Box:
    return _clamp_box(
        (
            int(box[0] / scale_x),
            int(box[1] / scale_y),
            ceil(box[2] / scale_x),
            ceil(box[3] / scale_y),
        ),
        page_width,
        page_height,
    )


def _bounded_analysis_size(
    width: int,
    height: int,
    pixel_cap: int,
) -> tuple[int, int]:
    if width <= 0 or height <= 0 or pixel_cap <= 0:
        raise ValueError("Image dimensions and analysis pixel cap must be positive.")
    if width * height <= pixel_cap:
        return width, height
    scale = sqrt(pixel_cap / (width * height))
    analysis_width = max(1, floor(width * scale))
    analysis_height = max(1, floor(height * scale))
    if analysis_width * analysis_height > pixel_cap:
        if analysis_width >= analysis_height:
            analysis_width = max(1, pixel_cap // analysis_height)
        else:
            analysis_height = max(1, pixel_cap // analysis_width)
    if analysis_width * analysis_height > pixel_cap:
        analysis_width, analysis_height = pixel_cap, 1
    return analysis_width, analysis_height


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


def _union_boxes(boxes: Sequence[Box]) -> Box:
    iterator = iter(boxes)
    combined = next(iterator)
    for box in iterator:
        combined = _union_box(combined, box)
    return combined


def _intersection_area(first: Box, second: Box) -> int:
    width = max(0, min(first[2], second[2]) - max(first[0], second[0]))
    height = max(0, min(first[3], second[3]) - max(first[1], second[1]))
    return width * height


def _box_iou(first: Box, second: Box) -> float:
    intersection = _intersection_area(first, second)
    union = _box_area(first) + _box_area(second) - intersection
    return intersection / max(union, 1)


def _box_contains(container: Box, contained: Box) -> bool:
    return (
        container[0] <= contained[0]
        and container[1] <= contained[1]
        and container[2] >= contained[2]
        and container[3] >= contained[3]
    )


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

from __future__ import annotations

import os
import re
from dataclasses import dataclass


_DEFAULT_DRAWING_TERMS = (
    "plan",
    "elevation",
    "section",
    "detail",
    "ceiling",
    "layout",
    "joinery",
    "millwork",
)
_DEFAULT_RESERVED_TERMS = (
    "legend",
    "notes",
    "note",
    "key plan",
    "symbol",
    "title block",
    "dimensions",
)
DEFAULT_MATERIAL_SPEC_TERMS = (
    "aluminium",
    "aluminum",
    "brass",
    "concrete",
    "fabric",
    "felt",
    "glass",
    "granite",
    "grout",
    "laminate",
    "leather",
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
)
DEFAULT_PLAN_TYPES = (
    "floor",
    "room",
    "ceiling",
    "site",
    "roof",
    "electrical",
    "plumbing",
    "furniture layout",
)
DEFAULT_ROOM_TYPES = (
    "living room",
    "bedroom",
    "master bedroom",
    "guest bedroom",
    "kids bedroom",
    "kitchen",
    "dining room",
    "bathroom",
    "toilet",
    "powder room",
    "foyer",
    "lobby",
    "corridor",
    "passage",
    "utility",
    "utility room",
    "study",
    "family room",
    "pooja room",
    "prayer room",
    "balcony",
    "terrace",
    "garage",
    "store",
    "store room",
    "pantry",
)


@dataclass(frozen=True, slots=True)
class LayoutSettings:
    drawing_terms: tuple[str, ...]
    reserved_terms: tuple[str, ...]
    min_heading_score: float
    min_region_area_ratio: float
    duplicate_iou: float
    reserved_bottom_ratio: float
    material_spec_terms: tuple[str, ...] = DEFAULT_MATERIAL_SPEC_TERMS
    accepted_plan_types: tuple[str, ...] = DEFAULT_PLAN_TYPES
    accepted_room_types: tuple[str, ...] = DEFAULT_ROOM_TYPES

    @classmethod
    def defaults(cls) -> LayoutSettings:
        return cls(
            drawing_terms=_DEFAULT_DRAWING_TERMS,
            reserved_terms=_DEFAULT_RESERVED_TERMS,
            min_heading_score=0.65,
            min_region_area_ratio=0.03,
            duplicate_iou=0.65,
            reserved_bottom_ratio=0.18,
            material_spec_terms=DEFAULT_MATERIAL_SPEC_TERMS,
            accepted_plan_types=DEFAULT_PLAN_TYPES,
            accepted_room_types=DEFAULT_ROOM_TYPES,
        )

    @classmethod
    def from_environment(cls) -> LayoutSettings:
        defaults = cls.defaults()
        return cls(
            drawing_terms=_extend_terms(
                defaults.drawing_terms, os.environ.get("OCR_DRAWING_TERMS")
            ),
            reserved_terms=_extend_terms(
                defaults.reserved_terms, os.environ.get("OCR_RESERVED_TERMS")
            ),
            min_heading_score=_bounded_float(
                "OCR_MIN_HEADING_SCORE", defaults.min_heading_score, 0.0, 1.0
            ),
            min_region_area_ratio=_bounded_ratio(
                "OCR_MIN_DRAWING_REGION_AREA_RATIO",
                defaults.min_region_area_ratio,
            ),
            duplicate_iou=_bounded_ratio("OCR_PANEL_DUPLICATE_IOU", defaults.duplicate_iou),
            reserved_bottom_ratio=_bounded_ratio(
                "OCR_RESERVED_BOTTOM_RATIO", defaults.reserved_bottom_ratio
            ),
            material_spec_terms=_extend_terms(
                defaults.material_spec_terms,
                os.environ.get("OCR_MATERIAL_SPEC_TERMS"),
            ),
            accepted_plan_types=_configured_terms(
                "OCR_ACCEPTED_PLAN_TYPES",
                os.environ.get("OCR_ACCEPTED_PLAN_TYPES"),
                defaults.accepted_plan_types,
            ),
            accepted_room_types=_configured_terms(
                "OCR_ACCEPTED_ROOM_TYPES",
                os.environ.get("OCR_ACCEPTED_ROOM_TYPES"),
                defaults.accepted_room_types,
            ),
        )


def _extend_terms(defaults: tuple[str, ...], raw: str | None) -> tuple[str, ...]:
    extra = tuple(
        term
        for part in (raw or "").split(",")
        if (term := normalize_matching_text(part))
    )
    return tuple(dict.fromkeys((*map(normalize_matching_text, defaults), *extra)))


def normalize_matching_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def _configured_terms(
    name: str,
    raw: str | None,
    defaults: tuple[str, ...],
) -> tuple[str, ...]:
    if raw is None:
        return defaults
    values = tuple(
        value
        for part in raw.split(",")
        if (value := normalize_matching_text(part))
    )
    unique = tuple(dict.fromkeys(values))
    if not unique:
        raise ValueError(f"{name} must contain at least one value.")
    return unique


def _bounded_float(name: str, default: float, minimum: float, maximum: float) -> float:
    value = float(os.environ.get(name, str(default)))
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return value


def _bounded_ratio(name: str, default: float) -> float:
    value = float(os.environ.get(name, str(default)))
    if not 0 < value < 1:
        raise ValueError(f"{name} must be between 0 and 1 (exclusive).")
    return value

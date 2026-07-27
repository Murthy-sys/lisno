import pytest

from lisno_ocr.settings import LayoutSettings
from lisno_ocr.title_classifier import (
    DrawingTitle,
    OcrLine,
    classify_drawing_titles,
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


@pytest.mark.parametrize(
    "label",
    [
        "Floor Plan – 3BHK Residence",
        "Kitchen Plan",
        "Ceiling Plan – Living Room",
        "Site Plan",
        "Roof Plan",
        "Electrical Plan",
        "Plumbing Plan",
        "Furniture Layout Plan",
        "Living Room – Front Elevation",
        "Rear Elevation",
        "Side Elevation (Left)",
        "Left Elevation",
        "Right Elevation",
    ],
)
def test_accepts_supported_plan_and_directional_elevation_titles(label):
    line = OcrLine((40, 80, 440, 120), label, 0.93)

    assert classify_drawing_titles([line], DEFAULT_PLAN_TYPES) == (
        DrawingTitle(line.box, label, 0.93),
    )


def test_returns_titles_in_page_reading_order():
    lines = [
        OcrLine((420, 210, 700, 245), "Rear Elevation", 0.91),
        OcrLine((40, 80, 340, 115), "Kitchen Plan", 0.95),
        OcrLine((40, 210, 340, 245), "Site Plan", 0.94),
    ]

    assert [
        title.label
        for title in classify_drawing_titles(lines, DEFAULT_PLAN_TYPES)
    ] == ["Kitchen Plan", "Site Plan", "Rear Elevation"]


@pytest.mark.parametrize(
    "label",
    [
        "SYMBOL LEGEND",
        "Electrical Legend",
        "GENERAL NOTES",
        "1. All dimensions are in millimetres",
        "1. Refer to Floor Plan",
        "Key Plan",
        "VICINITY PLAN",
        "LOCATION MAP",
        "4500",
        "3'-6\"",
        "SCALE 1:100",
        "N",
        "Ø",
        "Living Room",
        "MATERIAL: TEAK VENEER",
        "FINISH: BRUSHED BRASS",
        "Building Cross Section A-A",
        "Section Plan Detail",
        "Window Detail 04",
        "Single Line Diagram",
        "Door Schedule",
    ],
)
def test_rejects_annotations_and_unsupported_drawing_types(label):
    lines = [OcrLine((40, 80, 440, 120), label, 0.99)]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == ()


def test_joins_one_adjacent_aligned_qualifier_and_uses_minimum_confidence():
    lines = [
        OcrLine((80, 100, 310, 132), "Living Room", 0.96),
        OcrLine((84, 138, 360, 174), "Front Elevation", 0.89),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle(
            (80, 100, 360, 174),
            "Living Room – Front Elevation",
            0.89,
        ),
    )


@pytest.mark.parametrize(
    "qualifier_box",
    [
        (80, 20, 310, 52),
        (500, 100, 730, 132),
    ],
)
def test_does_not_join_distant_or_column_misaligned_qualifier(qualifier_box):
    lines = [
        OcrLine(qualifier_box, "Living Room", 0.96),
        OcrLine((84, 138, 360, 174), "Front Elevation", 0.89),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle((84, 138, 360, 174), "Front Elevation", 0.89),
    )


@pytest.mark.parametrize(
    "nearby_text",
    [
        "1. All dimensions are in millimetres",
        "MATERIAL: TEAK VENEER",
    ],
)
def test_does_not_attach_nearby_note_or_material_text_to_valid_title(nearby_text):
    lines = [
        OcrLine((80, 100, 360, 132), nearby_text, 0.96),
        OcrLine((84, 138, 360, 174), "Front Elevation", 0.89),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle((84, 138, 360, 174), "Front Elevation", 0.89),
    )


def test_deduplicates_overlapping_titles_after_comparison_normalization():
    lines = [
        OcrLine((80, 100, 360, 140), "SIDE ELEVATION (LEFT)", 0.91),
        OcrLine((84, 102, 364, 142), "Side Elevation (Left)", 0.95),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle((80, 100, 360, 140), "SIDE ELEVATION (LEFT)", 0.91),
    )


def test_configured_plan_types_are_normalized_unique_and_replace_defaults(
    monkeypatch,
):
    monkeypatch.setenv(
        "OCR_ACCEPTED_PLAN_TYPES",
        " Landscape, floor, LANDSCAPE ",
    )

    assert LayoutSettings.from_environment().accepted_plan_types == (
        "landscape",
        "floor",
    )


def test_rejects_empty_accepted_plan_type_configuration(monkeypatch):
    monkeypatch.setenv("OCR_ACCEPTED_PLAN_TYPES", " , ")

    with pytest.raises(ValueError, match="OCR_ACCEPTED_PLAN_TYPES"):
        LayoutSettings.from_environment()

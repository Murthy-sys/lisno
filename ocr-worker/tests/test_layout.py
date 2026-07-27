import pytest

from lisno_ocr.layout import LayoutSettings, OcrLine, classify_heading


def test_accepts_numbered_and_unknown_structured_panel_headings():
    settings = LayoutSettings.defaults()

    assert classify_heading(
        OcrLine((100, 120, 700, 170), "A. LIVING ROOM – FRONT ELEVATION", 0.94),
        1400,
        1000,
        settings,
    ).label == "Living Room – Front Elevation"
    assert classify_heading(
        OcrLine((90, 220, 500, 265), "DETAIL 04 – CUSTOM MILLWORK", 0.96),
        1400,
        1000,
        settings,
    ) is not None
    assert classify_heading(
        OcrLine((100, 420, 650, 465), "A. BESPOKE FEATURE", 0.96),
        1400,
        1000,
        settings,
    ) is not None


def test_strips_decimal_panel_marker_from_display_label():
    candidate = classify_heading(
        OcrLine((100, 120, 700, 170), "B.1 SIDE ELEVATION (LEFT)", 0.94),
        1400,
        1000,
        LayoutSettings.defaults(),
    )

    assert candidate.label == "Side Elevation (Left)"
    assert candidate.kind == "panel"


def test_preserves_meaningful_acronyms_in_display_labels():
    candidate = classify_heading(
        OcrLine((100, 420, 700, 465), "A. LED FEATURE FOR 3BHK", 0.94),
        1400,
        1000,
        LayoutSettings.defaults(),
    )

    assert candidate.label == "LED Feature For 3BHK"


@pytest.mark.parametrize(
    "text",
    [
        "FALSE CEILING WITH LED STRIP",
        "4200 X 2700",
        "SYMBOL LEGEND (CEILING PLAN)",
        "ALL DIMENSIONS ARE IN MM.",
        "KEY PLAN",
        "BEDROOM 2",
        "A. MATERIAL: TEAK VENEER – MATCH EXISTING",
        "FINISH: BRUSHED BRASS TO MATCH EXISTING",
        "SPECIFICATION: PAINT AS PER APPROVED SAMPLE",
        "FIXTURE TO MATCH EXISTING",
        "LEADER: CONTINUE TILE TO CEILING",
    ],
)
def test_rejects_annotations_dimensions_reserved_regions_and_room_labels(text):
    assert classify_heading(
        OcrLine((100, 420, 500, 460), text, 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is None


@pytest.mark.parametrize(
    "text",
    [
        "A. MATERIAL TEAK VENEER – POLISHED",
        "A. TILE WITH GROUT",
        "B. DISPLAY UNIT WITH LED LIGHT",
        "C. WALL PANEL FLUTED FINISH",
        "D. LAMINATE FINISH",
    ],
)
def test_rejects_marked_mid_page_material_and_finish_callouts(text):
    assert classify_heading(
        OcrLine((100, 420, 700, 465), text, 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is None


def test_rejects_unmarked_heading_evidence_in_the_reserved_bottom_band():
    assert classify_heading(
        OcrLine((100, 900, 700, 950), "FLOOR PLAN – 3BHK RESIDENCE", 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is None

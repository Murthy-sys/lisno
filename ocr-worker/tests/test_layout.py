from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from lisno_ocr.layout import (
    LayoutSettings,
    OcrLine,
    PanelProposal,
    classify_heading,
    propose_panels,
)


FIXTURES = Path(__file__).parent / "fixtures"
PAGE_SIZE = (1400, 1000)
KEY_PLAN_BOX = (1080, 35, 1360, 205)
LEGEND_NOTES_BOX = (0, 820, 1400, 1000)


def fixture_image(name: str) -> Image.Image:
    with Image.open(FIXTURES / name) as image:
        return image.convert("RGB")


def blueprint_two_ocr_lines() -> list[OcrLine]:
    return [
        OcrLine((45, 35, 250, 65), "BLUEPRINT 02", 0.99),
        OcrLine((60, 105, 650, 145), "A. LIVING ROOM – FRONT ELEVATION", 0.94),
        OcrLine((250, 355, 520, 380), "FALSE CEILING WITH LED STRIP", 0.96),
        OcrLine((830, 220, 1240, 255), "B. SIDE ELEVATION (LEFT)", 0.93),
        OcrLine((1010, 405, 1080, 430), "600 MM", 0.98),
        OcrLine((830, 530, 1285, 565), "C. CEILING PLAN – LIVING ROOM", 0.95),
        OcrLine((940, 665, 1100, 690), "LIVING ROOM", 0.97),
        OcrLine((1110, 52, 1285, 80), "KEY PLAN", 0.99),
        OcrLine((45, 842, 300, 875), "SYMBOL LEGEND", 0.99),
        OcrLine((760, 842, 1050, 875), "GENERAL NOTES", 0.99),
    ]


def blueprint_one_ocr_lines() -> list[OcrLine]:
    return [
        OcrLine((45, 35, 250, 65), "BLUEPRINT 01", 0.99),
        OcrLine((60, 105, 650, 145), "FLOOR PLAN – 3BHK RESIDENCE", 0.97),
        OcrLine((250, 355, 520, 380), "FALSE CEILING WITH LED STRIP", 0.96),
        OcrLine((350, 500, 470, 525), "BEDROOM 2", 0.98),
        OcrLine((1110, 52, 1285, 80), "KEY PLAN", 0.99),
        OcrLine((45, 842, 300, 875), "SYMBOL LEGEND", 0.99),
        OcrLine((760, 842, 1050, 875), "GENERAL NOTES", 0.99),
    ]


def intersects(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> bool:
    return (
        max(first[0], second[0]) < min(first[2], second[2])
        and max(first[1], second[1]) < min(first[3], second[3])
    )


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


@pytest.mark.parametrize(
    "text",
    [
        "A. FALSE CEILING WITH LED STRIP",
        "A. CEILING PLAN WITH LED STRIP",
    ],
)
def test_rejects_marked_with_callouts_even_when_heading_has_drawing_terms(text):
    assert classify_heading(
        OcrLine((100, 420, 700, 465), text, 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is None


@pytest.mark.parametrize(
    "text",
    [
        "A. CEILING PANEL – TEAK VENEER",
        "B. FLOOR PLAN – MARBLE FINISH",
        "C. WALL ELEVATION – OAK LAMINATE",
        "D. REFLECTED CEILING PLAN – TILE / GROUT",
        "E. FRONT ELEVATION – TEXTURED PAINT",
        "F. BUILDING SECTION – BRUSHED METAL",
        "G. CEILING LAYOUT – HONED STONE",
        "H. CEILING PANEL (TEAK VENEER)",
        "I. WALL ELEVATION (MARBLE FINISH)",
    ],
)
def test_rejects_marked_material_specification_suffixes(text):
    assert classify_heading(
        OcrLine((100, 420, 700, 465), text, 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is None


def test_rejects_configured_material_specification_suffix(monkeypatch):
    monkeypatch.setenv("OCR_MATERIAL_SPEC_TERMS", "cork")

    assert classify_heading(
        OcrLine((100, 420, 700, 465), "A. CEILING PANEL – CORK", 0.99),
        1400,
        1000,
        LayoutSettings.from_environment(),
    ) is None


def test_six_argument_layout_settings_reject_material_specification_suffix():
    settings = LayoutSettings(
        ("ceiling",),
        (),
        0.65,
        0.03,
        0.65,
        0.18,
    )

    assert classify_heading(
        OcrLine((100, 420, 700, 465), "A. CEILING PANEL – TEAK VENEER", 0.99),
        1400,
        1000,
        settings,
    ) is None


@pytest.mark.parametrize(
    "text",
    [
        "A. FINISH PLAN",
        "A. BESPOKE FINISH STUDY",
        "A. LIVING ROOM – FRONT ELEVATION",
        "B. REFLECTED CEILING PLAN",
        "C. FLOOR PLAN – FIRST FLOOR",
        "D. FRONT ELEVATION (LEFT)",
        "E. BESPOKE STONE STUDY",
    ],
)
def test_accepts_structured_and_genuine_drawing_titles(text):
    assert classify_heading(
        OcrLine((100, 420, 700, 465), text, 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is not None


def test_rejects_unmarked_heading_evidence_in_the_reserved_bottom_band():
    assert classify_heading(
        OcrLine((100, 900, 700, 950), "FLOOR PLAN – 3BHK RESIDENCE", 0.99),
        1400,
        1000,
        LayoutSettings.defaults(),
    ) is None


def test_multi_panel_sheet_returns_only_major_drawing_panels():
    proposals = propose_panels(
        fixture_image("major-panels.png"),
        blueprint_two_ocr_lines(),
        LayoutSettings.defaults(),
    )

    assert [proposal.label for proposal in proposals] == [
        "Living Room – Front Elevation",
        "Side Elevation (Left)",
        "Ceiling Plan – Living Room",
    ]
    assert all(not intersects(proposal.crop, KEY_PLAN_BOX) for proposal in proposals)
    assert all(
        not intersects(proposal.crop, LEGEND_NOTES_BOX) for proposal in proposals
    )


def test_dominant_single_plan_uses_descriptive_page_subtitle():
    proposals = propose_panels(
        fixture_image("major-panels.png"),
        blueprint_one_ocr_lines(),
        LayoutSettings.defaults(),
    )

    assert [proposal.label for proposal in proposals] == [
        "Floor Plan – 3BHK Residence"
    ]


def test_panel_proposals_are_bounded_include_headings_and_do_not_overlap():
    proposals = propose_panels(
        fixture_image("major-panels.png"),
        blueprint_two_ocr_lines(),
        LayoutSettings.defaults(),
    )

    assert all(isinstance(proposal, PanelProposal) for proposal in proposals)
    assert all(
        0 <= proposal.crop[0] <= proposal.heading_box[0]
        and 0 <= proposal.crop[1] <= proposal.heading_box[1]
        and proposal.heading_box[2] <= proposal.crop[2] <= PAGE_SIZE[0]
        and proposal.heading_box[3] <= proposal.crop[3] <= PAGE_SIZE[1]
        for proposal in proposals
    )
    assert all(
        not intersects(first.crop, second.crop)
        for index, first in enumerate(proposals)
        for second in proposals[index + 1 :]
    )


def test_heading_without_a_major_drawing_region_does_not_create_a_proposal():
    lines = [
        *blueprint_two_ocr_lines(),
        OcrLine((70, 785, 500, 815), "D. WALL SECTION – ENTRY", 0.99),
    ]

    proposals = propose_panels(
        fixture_image("major-panels.png"),
        lines,
        LayoutSettings.defaults(),
    )

    assert "Wall Section – Entry" not in [
        proposal.label for proposal in proposals
    ]


def test_duplicate_ocr_heading_is_suppressed():
    lines = [
        *blueprint_two_ocr_lines(),
        OcrLine((62, 106, 648, 146), "A. LIVING ROOM - FRONT ELEVATION", 0.89),
    ]

    proposals = propose_panels(
        fixture_image("major-panels.png"),
        lines,
        LayoutSettings.defaults(),
    )

    assert [proposal.label for proposal in proposals].count(
        "Living Room – Front Elevation"
    ) == 1


def test_unmarked_heading_can_associate_on_a_mixed_heading_sheet():
    lines = [
        line
        if line.text != "C. CEILING PLAN – LIVING ROOM"
        else OcrLine(
            line.box,
            "CEILING PLAN – LIVING ROOM",
            line.confidence,
        )
        for line in blueprint_two_ocr_lines()
    ]

    proposals = propose_panels(
        fixture_image("major-panels.png"),
        lines,
        LayoutSettings.defaults(),
    )

    assert [proposal.label for proposal in proposals] == [
        "Living Room – Front Elevation",
        "Side Elevation (Left)",
        "Ceiling Plan – Living Room",
    ]


def test_touching_panels_are_partitioned_by_neighboring_headings():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((30, 125, 770, 430), outline="black", width=4)
    draw.line((400, 125, 400, 430), fill="black", width=4)
    draw.line((30, 280, 770, 280), fill="black", width=3)
    draw.rectangle((90, 180, 300, 370), outline="black", width=3)
    draw.rectangle((500, 180, 710, 370), outline="black", width=3)
    lines = [
        OcrLine((45, 65, 330, 100), "A. FRONT ELEVATION", 0.95),
        OcrLine((455, 65, 745, 100), "B. SIDE ELEVATION", 0.94),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert [proposal.label for proposal in proposals] == [
        "Front Elevation",
        "Side Elevation",
    ]
    assert not intersects(proposals[0].crop, proposals[1].crop)


def test_thin_frame_without_interior_drawing_ink_is_not_a_panel():
    image = Image.new("RGB", (800, 500), "white")
    ImageDraw.Draw(image).rectangle(
        (80, 150, 720, 400), outline="black", width=1
    )
    lines = [
        OcrLine((85, 85, 510, 120), "A. FRONT ELEVATION", 0.98),
    ]

    assert propose_panels(image, lines, LayoutSettings.defaults()) == ()


def test_crop_padding_is_trimmed_before_the_reserved_bottom_band():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 150, 720, 409), outline="black", width=4)
    draw.line((80, 275, 720, 275), fill="black", width=3)
    draw.line((300, 150, 300, 409), fill="black", width=3)
    lines = [
        OcrLine((85, 85, 510, 120), "A. FRONT ELEVATION", 0.98),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert len(proposals) == 1
    assert proposals[0].crop[3] <= 410

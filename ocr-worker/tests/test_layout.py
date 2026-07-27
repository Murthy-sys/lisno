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
EXTERNAL_DIMENSION_BOX = (835, 499, 1316, 512)
EXTERNAL_LEADER_BOX = (1, 430, 40, 451)
EXTERNAL_CALLOUT_SYMBOL_BOX = (788, 690, 808, 707)
TITLE_BLOCK_BOX = (700, 820, 1400, 1000)


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
    from lisno_ocr.layout import _reserved_zones

    image = fixture_image("major-panels.png")
    lines = blueprint_two_ocr_lines()
    settings = LayoutSettings.defaults()
    proposals = propose_panels(
        image,
        lines,
        settings,
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
    excluded_geometry = (
        EXTERNAL_DIMENSION_BOX,
        EXTERNAL_LEADER_BOX,
        EXTERNAL_CALLOUT_SYMBOL_BOX,
        TITLE_BLOCK_BOX,
    )
    assert all(
        not intersects(proposal.crop, excluded)
        for proposal in proposals
        for excluded in excluded_geometry
    )
    confirmed_reserved_zones = _reserved_zones(image, lines, settings)
    assert all(
        not intersects(proposal.crop, zone)
        for proposal in proposals
        for zone in confirmed_reserved_zones
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


def test_reserved_words_inside_a_drawing_do_not_create_an_exclusion_zone():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 145, 720, 440), outline="black", width=4)
    draw.line((80, 280, 720, 280), fill="black", width=3)
    draw.line((300, 145, 300, 440), fill="black", width=3)
    lines = [
        OcrLine((85, 85, 510, 120), "A. FRONT ELEVATION", 0.98),
        OcrLine((130, 250, 670, 300), "KEY PLAN", 0.99),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert len(proposals) == 1
    assert proposals[0].crop[3] >= 440


def test_unlabeled_edge_key_plan_and_title_block_have_geometry_evidence():
    from lisno_ocr.layout import _reserved_zones

    image = fixture_image("major-panels.png")
    lines_without_reserved_labels = [
        line
        for line in blueprint_one_ocr_lines()
        if line.text not in {"KEY PLAN", "SYMBOL LEGEND", "GENERAL NOTES"}
    ]

    zones = _reserved_zones(
        image,
        lines_without_reserved_labels,
        LayoutSettings.defaults(),
    )

    assert any(intersects(zone, KEY_PLAN_BOX) for zone in zones)
    assert any(intersects(zone, TITLE_BLOCK_BOX) for zone in zones)


def test_overlapping_heading_boxes_leave_only_the_higher_score_proposal():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((35, 145, 385, 430), outline="black", width=4)
    draw.line((35, 280, 385, 280), fill="black", width=3)
    draw.rectangle((415, 145, 765, 430), outline="black", width=4)
    draw.line((415, 280, 765, 280), fill="black", width=3)
    lines = [
        OcrLine((45, 75, 440, 115), "A. FRONT ELEVATION", 0.97),
        OcrLine((370, 75, 755, 115), "B. SIDE ELEVATION", 0.88),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert [proposal.label for proposal in proposals] == ["Front Elevation"]


def test_shared_region_partition_rejects_non_major_heading_sliver():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 220, 760, 400), outline="black", width=4)
    draw.line((400, 220, 400, 400), fill="black", width=4)
    draw.line((40, 310, 760, 310), fill="black", width=3)
    lines = [
        OcrLine((55, 80, 345, 120), "A. FRONT ELEVATION", 0.97),
        OcrLine((505, 80, 795, 120), "B. SIDE ELEVATION", 0.95),
        OcrLine((720, 80, 780, 120), "C. PLAN", 0.94),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert [proposal.label for proposal in proposals] == [
        "Front Elevation",
        "Side Elevation",
    ]


def test_fragmented_antialiased_drawing_still_forms_a_major_region():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    for x in range(80, 720, 24):
        draw.line((x, 150, min(x + 16, 720), 150), fill=(155, 155, 155), width=2)
        draw.line((x, 410, min(x + 16, 720), 410), fill=(155, 155, 155), width=2)
    for y in range(150, 410, 24):
        draw.line((80, y, 80, min(y + 16, 410)), fill=(155, 155, 155), width=2)
        draw.line((720, y, 720, min(y + 16, 410)), fill=(155, 155, 155), width=2)
        draw.line((400, y, 400, min(y + 16, 410)), fill=(170, 170, 170), width=2)
    lines = [
        OcrLine((85, 85, 560, 120), "A. REFLECTED CEILING PLAN", 0.96),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert [proposal.label for proposal in proposals] == [
        "Reflected Ceiling Plan"
    ]
    assert proposals[0].crop[2] >= 720
    assert proposals[0].crop[3] >= 410


def test_unrecognized_external_text_does_not_become_a_drawing_region():
    image = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 145, 720, 390), outline="black", width=4)
    draw.line((80, 270, 720, 270), fill="black", width=3)
    draw.line((310, 145, 310, 390), fill="black", width=3)
    for row in range(410, 470, 15):
        for column in range(90, 700, 16):
            draw.rectangle(
                (column, row, column + 5, row + 8),
                outline=(80, 80, 80),
                width=1,
            )
    lines = [
        OcrLine((85, 85, 510, 120), "A. FRONT ELEVATION", 0.98),
    ]

    proposals = propose_panels(image, lines, LayoutSettings.defaults())

    assert len(proposals) == 1
    assert proposals[0].crop[3] < 410


def test_four_x_analysis_preserves_source_coordinate_crops():
    source = fixture_image("major-panels.png")
    baseline = propose_panels(
        source,
        blueprint_two_ocr_lines(),
        LayoutSettings.defaults(),
    )
    scale_x = 4.003
    scale_y = 3.997
    large = source.resize(
        (round(source.width * scale_x), round(source.height * scale_y)),
        Image.Resampling.NEAREST,
    )
    scaled_lines = [
        OcrLine(
            (
                round(line.box[0] * scale_x),
                round(line.box[1] * scale_y),
                round(line.box[2] * scale_x),
                round(line.box[3] * scale_y),
            ),
            line.text,
            line.confidence,
        )
        for line in blueprint_two_ocr_lines()
    ]

    enlarged = propose_panels(large, scaled_lines, LayoutSettings.defaults())

    assert [proposal.label for proposal in enlarged] == [
        proposal.label for proposal in baseline
    ]
    for expected, actual in zip(baseline, enlarged):
        normalized = (
            round(actual.crop[0] / scale_x),
            round(actual.crop[1] / scale_y),
            round(actual.crop[2] / scale_x),
            round(actual.crop[3] / scale_y),
        )
        assert all(
            abs(expected_value - actual_value) <= 2
            for expected_value, actual_value in zip(expected.crop, normalized)
        )


@pytest.mark.parametrize(
    ("width", "height"),
    [
        (40_000_000, 1),
        (1, 40_000_000),
        (20_000_000, 2),
        (9_999_991, 3),
    ],
)
def test_analysis_dimensions_never_exceed_the_pixel_cap(width, height):
    from lisno_ocr.layout import _MAX_ANALYSIS_PIXELS, _bounded_analysis_size

    analysis_width, analysis_height = _bounded_analysis_size(
        width,
        height,
        _MAX_ANALYSIS_PIXELS,
    )

    assert analysis_width >= 1
    assert analysis_height >= 1
    assert analysis_width * analysis_height <= _MAX_ANALYSIS_PIXELS


def test_dense_page_is_rejected_before_component_traversal(monkeypatch):
    import lisno_ocr.layout as layout

    image = Image.new("RGB", (2000, 1000), "black")
    lines = [
        OcrLine((100, 80, 1000, 130), "A. FRONT ELEVATION", 0.98),
    ]

    def fail_if_traversed(_mask):
        raise AssertionError("dense mask reached component traversal")

    monkeypatch.setattr(layout, "_connected_components", fail_if_traversed)

    assert propose_panels(image, lines, LayoutSettings.defaults()) == ()

import pytest

from lisno_ocr.title_block import (
    extract_pdf_title_block_candidate,
    extract_title_block,
)


def test_extracts_title_value_from_the_lower_title_block_band():
    lines = [
        ((80, 840, 390, 880), "TITLE : TV UNIT", 0.98),
    ]

    assert extract_title_block(lines, image_width=1_000, image_height=1_000) == "TV UNIT"


def test_normalizes_ocr_title_marker_without_changing_the_display_value():
    lines = [
        ((80, 840, 390, 880), " title  ：  TV Unit – North ", 0.98),
    ]

    assert (
        extract_title_block(lines, image_width=1_000, image_height=1_000)
        == "TV Unit – North"
    )


@pytest.mark.parametrize(
    "text",
    [
        "FLOOR PLAN : TV UNIT",
        "FRONT ELEVATION : TV UNIT",
        "MATERIAL : TV UNIT",
    ],
)
def test_ignores_non_title_block_labels(text):
    lines = [((80, 840, 390, 880), text, 0.98)]

    assert extract_title_block(lines, image_width=1_000, image_height=1_000) is None


@pytest.mark.parametrize("text", ["TITLE", "TITLE :", "TITLE :    "])
def test_rejects_title_markers_without_a_value(text):
    lines = [((80, 840, 390, 880), text, 0.98)]

    assert extract_title_block(lines, image_width=1_000, image_height=1_000) is None


@pytest.mark.parametrize("text", ["TITLE NO", "TITLE NUMBER", "TITLE-CODE"])
def test_requires_a_colon_after_the_title_field_marker(text):
    lines = [((80, 840, 390, 880), text, 0.98)]

    assert extract_title_block(lines, image_width=1_000, image_height=1_000) is None


def test_rejects_title_markers_outside_the_lower_band():
    lines = [
        ((80, 300, 390, 340), "TITLE : TV UNIT", 0.98),
    ]

    assert extract_title_block(lines, image_width=1_000, image_height=1_000) is None


def test_rejects_ambiguous_title_block_values():
    lines = [
        ((80, 840, 390, 880), "TITLE : TV UNIT", 0.98),
        ((80, 890, 390, 930), "TITLE : WALL PANEL", 0.98),
    ]

    assert extract_title_block(lines, image_width=1_000, image_height=1_000) is None


def test_extracts_embedded_pdf_title_relative_to_a_right_side_marker():
    words = [
        (700.0, 760.0, 728.0, 780.0, "TITLE", 0, 0, 0),
        (732.0, 760.0, 736.0, 780.0, ":", 0, 0, 1),
        (740.0, 760.0, 788.0, 780.0, "TV UNIT", 0, 0, 2),
    ]

    assert extract_pdf_title_block_candidate(
        words,
        page_width=1_191,
        page_height=842,
    ) == ("TV UNIT", 1.0)

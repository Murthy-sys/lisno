import pytest

from lisno_ocr.title_block import extract_title_block


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

import pytest

from lisno_ocr import title_classifier as classifier_module
from lisno_ocr.settings import DEFAULT_ROOM_TYPES, LayoutSettings
from lisno_ocr.title_classifier import (
    DrawingTitle,
    OcrLine,
    classify_drawing_titles,
    normalize_ocr_title,
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
    ("captured", "normalized"),
    [
        (
            "FLOOR PLAN—3BHK RESIDENCE",
            "FLOOR PLAN – 3BHK RESIDENCE",
        ),
        ("&CEILING PLAN", ""),
        (
            "LIVING ROOM—FRONTELEVATION",
            "LIVING ROOM – FRONT ELEVATION",
        ),
        ("B.SIDE ELEVATION(LEFT）", "SIDE ELEVATION (LEFT)"),
        (
            "C.CEILINGPLAN-LIVINGROOM",
            "CEILING PLAN – LIVING ROOM",
        ),
        ("CEILING FAN", "CEILING FAN"),
    ],
)
def test_normalizes_only_captured_blueprint_title_variants(
    captured,
    normalized,
):
    assert normalize_ocr_title(
        captured,
        DEFAULT_PLAN_TYPES,
        DEFAULT_ROOM_TYPES,
    ) == normalized


def test_captured_blueprint_lines_produce_exactly_four_titles():
    captured = [
        "FLOOR PLAN—3BHK RESIDENCE",
        "&CEILING PLAN",
        "LIVING ROOM—FRONTELEVATION",
        "B.SIDE ELEVATION(LEFT）",
        "C.CEILINGPLAN-LIVINGROOM",
        "CEILING FAN",
    ]
    lines = [
        OcrLine((40, 80 + index * 80, 440, 120 + index * 80), text, 0.93)
        for index, text in enumerate(captured)
    ]

    assert [
        title.label
        for title in classify_drawing_titles(lines, DEFAULT_PLAN_TYPES)
    ] == [
        "FLOOR PLAN – 3BHK RESIDENCE",
        "LIVING ROOM – FRONT ELEVATION",
        "SIDE ELEVATION (LEFT)",
        "CEILING PLAN – LIVING ROOM",
    ]


@pytest.mark.parametrize(
    "label",
    [
        "&CEILING PLAN",
        "ELEVATION & CEILING PLAN",
        "CEILING FAN",
    ],
)
def test_rejects_blueprint_overviews_and_symbol_legend_entries(label):
    assert classify_drawing_titles(
        [OcrLine((40, 80, 440, 120), label, 0.99)],
        DEFAULT_PLAN_TYPES,
    ) == ()


@pytest.mark.parametrize(
    ("label", "plan_types", "room_types"),
    [
        ("Bed & Bath Plan", ("room",), ("bed & bath",)),
        (
            "Research & Development Plan",
            ("research & development",),
            DEFAULT_ROOM_TYPES,
        ),
    ],
)
def test_preserves_configured_single_titles_containing_ampersands(
    label,
    plan_types,
    room_types,
):
    line = OcrLine((40, 80, 440, 120), label, 0.99)

    assert classify_drawing_titles(
        [line],
        plan_types,
        room_types,
    ) == (DrawingTitle(line.box, label, 0.99),)


def test_complete_ampersand_title_does_not_seed_segmented_overview():
    lines = [
        OcrLine(
            (80, 100, 310, 132),
            "Front Elevation & Living Room",
            0.96,
        ),
        OcrLine((305, 100, 570, 132), "CEILING PLAN", 0.94),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle(
            (80, 100, 310, 132),
            "Front Elevation & Living Room",
            0.96,
        ),
        DrawingTitle((305, 100, 570, 132), "CEILING PLAN", 0.94),
    )


@pytest.mark.parametrize(
    "continuation_box",
    [
        (84, 138, 360, 174),
        (326, 100, 570, 132),
        (84, 128, 360, 164),
        (305, 100, 570, 132),
    ],
)
def test_rejects_aligned_adjacent_segmented_overview_titles(
    continuation_box,
):
    lines = [
        OcrLine((80, 100, 310, 132), "ELEVATION &", 0.96),
        OcrLine(continuation_box, "CEILING PLAN", 0.94),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == ()


def test_rejects_three_box_segmented_overview_title():
    lines = [
        OcrLine((80, 100, 250, 132), "ELEVATION", 0.96),
        OcrLine((246, 100, 276, 132), "&", 0.95),
        OcrLine((272, 100, 520, 132), "CEILING PLAN", 0.94),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == ()


@pytest.mark.parametrize(
    "unrelated_box",
    [
        (500, 138, 760, 174),
        (84, 300, 360, 336),
        (316, 127, 570, 159),
    ],
)
def test_segmented_overview_fragment_does_not_suppress_unrelated_titles(
    unrelated_box,
):
    lines = [
        OcrLine((80, 100, 310, 132), "ELEVATION &", 0.96),
        OcrLine(unrelated_box, "CEILING PLAN", 0.94),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle(unrelated_box, "CEILING PLAN", 0.94),
    )


@pytest.mark.parametrize(
    ("captured", "normalized"),
    [
        ("﹠CEILING PLAN", ""),
        ("B．SIDE ELEVATION（LEFT）", "SIDE ELEVATION (LEFT)"),
        (
            "FLOOR PLAN―3BHK RESIDENCE",
            "FLOOR PLAN – 3BHK RESIDENCE",
        ),
    ],
)
def test_normalizes_compatibility_punctuation_and_horizontal_bar(
    captured,
    normalized,
):
    assert normalize_ocr_title(
        captured,
        DEFAULT_PLAN_TYPES,
        DEFAULT_ROOM_TYPES,
    ) == normalized


@pytest.mark.parametrize(
    ("label", "plan_types", "room_types"),
    [
        ("LANDSCAPEPLAN", DEFAULT_PLAN_TYPES, DEFAULT_ROOM_TYPES),
        ("CONSERVATORYPLAN", ("room",), DEFAULT_ROOM_TYPES),
        ("LIVINGROOMPLAN", ("room",), ("mud room",)),
    ],
)
def test_compact_unsupported_words_remain_rejected_by_configuration(
    label,
    plan_types,
    room_types,
):
    assert classify_drawing_titles(
        [OcrLine((40, 80, 440, 120), label, 0.99)],
        plan_types,
        room_types,
    ) == ()


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


@pytest.mark.parametrize(
    "label",
    [
        "Ground Floor Plan",
        "First Floor Plan",
        "Second Floor Plan",
        "2nd Floor Plan",
        "Basement Floor Plan",
        "Floor Plan – Ground Floor",
        "Floor Plan – Level 2",
        "Floor Plan – Aurora Residence",
        "Floor Plan – Project Aurora",
    ],
)
def test_accepts_only_controlled_floor_residence_and_project_qualifiers(label):
    line = OcrLine((40, 80, 440, 120), label, 0.93)

    assert classify_drawing_titles([line], DEFAULT_PLAN_TYPES) == (
        DrawingTitle(line.box, label, 0.93),
    )


@pytest.mark.parametrize(
    "label",
    [
        "Living Room Plan",
        "Bedroom Plan",
        "Kitchen Plan",
        "Dining Room Plan",
        "Bathroom Plan",
        "Toilet Plan",
        "Foyer Plan",
        "Lobby Plan",
        "Corridor Plan",
        "Passage Plan",
        "Utility Plan",
        "Study Plan",
        "Family Room Plan",
        "Pooja Room Plan",
        "Prayer Room Plan",
        "Balcony Plan",
        "Terrace Plan",
        "Garage Plan",
        "Store Plan",
        "Pantry Plan",
    ],
)
def test_accepts_only_explicit_common_room_plan_qualifiers(label):
    line = OcrLine((40, 80, 440, 120), label, 0.93)

    assert classify_drawing_titles([line], DEFAULT_PLAN_TYPES) == (
        DrawingTitle(line.box, label, 0.93),
    )


@pytest.mark.parametrize(
    "label",
    [
        "Landscape Plan",
        "Lighting Plan",
        "Mechanical Plan",
        "Emergency Evacuation Plan",
    ],
)
def test_default_room_support_does_not_accept_arbitrary_plan_qualifiers(label):
    assert classify_drawing_titles(
        [OcrLine((40, 80, 440, 120), label, 0.93)],
        DEFAULT_PLAN_TYPES,
    ) == ()


def test_room_only_configuration_does_not_enable_other_plan_families():
    lines = [
        OcrLine((40, 80, 440, 120), "Floor Plan", 0.93),
        OcrLine((40, 180, 440, 220), "Kitchen Plan", 0.94),
    ]

    assert classify_drawing_titles(lines, ("room",)) == (
        DrawingTitle(lines[1].box, "Kitchen Plan", 0.94),
    )


def test_custom_room_types_are_isolated_from_default_rooms():
    lines = [
        OcrLine((40, 80, 440, 120), "Mud Room Plan", 0.93),
        OcrLine((40, 180, 440, 220), "Kitchen Plan", 0.94),
    ]

    assert classify_drawing_titles(
        lines,
        ("room",),
        ("mud room",),
    ) == (DrawingTitle(lines[0].box, "Mud Room Plan", 0.93),)


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


@pytest.mark.parametrize(
    "label",
    [
        "Refer to Floor Plan",
        "See Floor Plan",
        "As per Floor Plan",
        "Typical Floor Plan",
        "Note: Floor Plan",
        "Verify Floor Plan",
        "Provide Floor Plan",
        "Do not use Floor Plan",
        "Not for construction – Floor Plan",
        "Floor Plan – NOT FOR CONSTRUCTION",
    ],
)
def test_rejects_unnumbered_directives_containing_supported_titles(label):
    assert classify_drawing_titles(
        [OcrLine((40, 80, 440, 120), label, 0.99)],
        DEFAULT_PLAN_TYPES,
    ) == ()


@pytest.mark.parametrize(
    "label",
    [
        "Refer Floor Plan",
        "Consult Floor Plan",
        "Check Floor Plan",
        "Refer Front Elevation",
        "Consult Front Elevation",
        "Check Front Elevation",
        "Floor Plan – for reference",
        "Front Elevation – for reference",
        "Floor Plan – to be verified",
        "Front Elevation – to be verified",
        "Floor Plan – for information only",
        "Front Elevation – for information only",
        "Floor Plan – Some Random Prose",
        "Some Random Prose – Front Elevation",
    ],
)
def test_closed_title_grammar_rejects_free_form_prefixes_and_suffixes(label):
    assert classify_drawing_titles(
        [OcrLine((40, 80, 440, 120), label, 0.99)],
        DEFAULT_PLAN_TYPES,
    ) == ()


@pytest.mark.parametrize("label", ["Turkey Plan", "Turnkey Plan"])
def test_configured_plan_labels_containing_key_are_not_key_plan_exclusions(label):
    normalized = classifier_module._comparison_text(label)

    assert classifier_module._is_excluded(normalized) is False
    line = OcrLine((40, 80, 440, 120), label, 0.93)
    family = normalized.removesuffix(" plan")
    assert classify_drawing_titles([line], (family,)) == (
        DrawingTitle(line.box, label, 0.93),
    )


def test_exact_key_plan_remains_an_exclusion_phrase():
    assert classifier_module._is_excluded("key plan") is True


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


def test_joins_geometric_neighbor_hidden_by_nine_interleaved_column_lines():
    lines = [
        OcrLine((80, 100, 310, 132), "Living Room", 0.96),
        *[
            OcrLine(
                (500, 102 + index * 3, 730, 122 + index * 3),
                f"DECOY {index}",
                0.99,
            )
            for index in range(9)
        ],
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
    "qualifier",
    [
        "NOT FOR CONSTRUCTION",
        "FELT",
        "LEATHER",
        "A-A",
        "NORTH ARROW",
        "REVISION CLOUD",
    ],
)
def test_does_not_join_uncontrolled_multiline_qualifiers(qualifier):
    lines = [
        OcrLine((80, 100, 310, 132), qualifier, 0.96),
        OcrLine((84, 138, 360, 174), "Front Elevation", 0.89),
    ]

    assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == (
        DrawingTitle((84, 138, 360, 174), "Front Elevation", 0.89),
    )


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        ("Floor Plan", "3BHK Residence", "Floor Plan – 3BHK Residence"),
        ("Ground Floor", "Front Elevation", "Ground Floor – Front Elevation"),
        ("Side Elevation", "Left", "Side Elevation – Left"),
    ],
)
def test_joins_only_controlled_residence_floor_and_directional_qualifiers(
    first,
    second,
    expected,
):
    lines = [
        OcrLine((80, 100, 310, 132), first, 0.96),
        OcrLine((84, 138, 360, 174), second, 0.89),
    ]

    assert [
        title.label
        for title in classify_drawing_titles(lines, DEFAULT_PLAN_TYPES)
    ] == [expected]


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


def test_two_thousand_lines_do_not_trigger_quadratic_classifier_scans(
    monkeypatch,
):
    comparison_calls = 0
    original = classifier_module._comparison_text

    def counted_comparison(text):
        nonlocal comparison_calls
        comparison_calls += 1
        return original(text)

    monkeypatch.setattr(
        classifier_module,
        "_comparison_text",
        counted_comparison,
    )
    lines = [
        OcrLine((0, index * 4, 100, index * 4 + 1), "Front Elevation", 0.9)
        for index in range(2_000)
    ]

    titles = classify_drawing_titles(lines, DEFAULT_PLAN_TYPES)

    assert len(titles) == 2_000
    assert comparison_calls < 50_000


def test_geometric_neighbor_lookup_stays_bounded_for_interleaved_ocr(
    monkeypatch,
):
    comparison_calls = 0
    original = classifier_module._comparison_text

    def counted_comparison(text):
        nonlocal comparison_calls
        comparison_calls += 1
        return original(text)

    monkeypatch.setattr(
        classifier_module,
        "_comparison_text",
        counted_comparison,
    )
    lines = []
    for group in range(180):
        base_y = group * 200
        lines.append(
            OcrLine((80, base_y, 310, base_y + 32), "Living Room", 0.96)
        )
        lines.extend(
            OcrLine(
                (500, base_y + 2 + index * 3, 730, base_y + 22 + index * 3),
                f"DECOY {group}-{index}",
                0.99,
            )
            for index in range(9)
        )
        lines.append(
            OcrLine(
                (84, base_y + 38, 360, base_y + 74),
                "Front Elevation",
                0.89,
            )
        )

    titles = classify_drawing_titles(lines, DEFAULT_PLAN_TYPES)

    assert len(lines) == 1_980
    assert len(titles) == 180
    assert {title.label for title in titles} == {
        "Living Room – Front Elevation"
    }
    assert comparison_calls < 20_000


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


def test_configured_room_types_are_normalized_unique_and_replace_defaults(
    monkeypatch,
):
    monkeypatch.setenv(
        "OCR_ACCEPTED_ROOM_TYPES",
        " Mud room, conservatory, MUD-ROOM ",
    )

    assert LayoutSettings.from_environment().accepted_room_types == (
        "mud room",
        "conservatory",
    )

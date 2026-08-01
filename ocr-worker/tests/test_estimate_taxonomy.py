from __future__ import annotations

import pytest

from lisno_ocr.contracts import EstimateTaxonomy, TaxonomyTerm
from lisno_ocr.estimate_taxonomy import (
    classify_estimate_drawing,
    match_taxonomy_term,
    normalize_drawing_title,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (" FALSE  CEILING---PLAN ", "false ceiling"),
        ("R.C.P.", "rcp"),
        ("LIVING–HALL LAYOUT", "living hall"),
        ("Bespoke Joinery Detail", "bespoke joinery"),
    ],
)
def test_normalize_drawing_title(raw, expected):
    assert normalize_drawing_title(raw) == expected


def _taxonomy() -> EstimateTaxonomy:
    return EstimateTaxonomy(
        rooms=(
            TaxonomyTerm("room-living", "Living Room", ("living hall", "lounge")),
            TaxonomyTerm("room-bedroom-1", "Bedroom 1", ()),
            TaxonomyTerm("room-bedroom-2", "Bedroom 2", ()),
        ),
        scopes=(
            TaxonomyTerm(
                "FC",
                "False Ceiling",
                ("RCP", "reflected ceiling plan", "false cieling", "ceiling plan"),
            ),
            TaxonomyTerm("WE", "Wall Elevation", ("front elevation",)),
            TaxonomyTerm("FL", "Flooring", ("floor plan",)),
            TaxonomyTerm("EL", "Electrical", ()),
            TaxonomyTerm("PT", "Painting", ()),
        ),
    )


@pytest.mark.parametrize(
    ("title", "room_id", "scope_id"),
    [
        ("Living Hall RCP", "room-living", "FC"),
        ("Lounge reflected ceiling plan", "room-living", "FC"),
        ("Living Room false cieling", "room-living", "FC"),
        ("Living Hall wall elevation", "room-living", "WE"),
        ("Lounge flooring layout", "room-living", "FL"),
        ("Living Room electrical plan", "room-living", "EL"),
        ("Living Room painting layout", "room-living", "PT"),
    ],
)
def test_classifies_room_and_scope_from_normalized_title(title, room_id, scope_id):
    proposal = classify_estimate_drawing(title, _taxonomy())

    assert proposal.room.id == room_id
    assert proposal.room.confidence >= 0.84
    assert proposal.room.ambiguous is False
    assert proposal.scope.id == scope_id
    assert proposal.scope.confidence >= 0.84
    assert proposal.scope.ambiguous is False


def test_ocr_confusion_alias_remains_a_high_confidence_match():
    match = match_taxonomy_term("false cieling", _taxonomy().scopes)

    assert match.id == "FC"
    assert match.confidence >= 0.9
    assert match.evidence == ("false cieling",)


def test_ambiguous_bedroom_match_never_selects_an_automatic_room_id():
    match = match_taxonomy_term("bedroom ceiling", _taxonomy().rooms)

    assert match.id is None
    assert match.ambiguous is True
    assert match.confidence >= 0.84
    assert match.to_payload()["evidence"] == ["bedroom 1", "bedroom 2"]
    assert all(isinstance(value, str) for value in match.to_payload()["evidence"])


def test_fuzzy_matching_scans_bounded_windows_across_the_full_title():
    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-studio", "Studio Lounge", ()),),
        scopes=(TaxonomyTerm("FC", "False Ceiling", ()),),
    )
    title = (
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu "
        "studo lounge false cieling plan"
    )

    proposal = classify_estimate_drawing(title, taxonomy)

    assert proposal.room.id == "room-studio"
    assert proposal.room.confidence >= 0.84
    assert proposal.scope.id == "FC"
    assert proposal.scope.confidence >= 0.84


def test_more_specific_exact_room_phrase_beats_a_generic_subphrase():
    terms = (
        TaxonomyTerm("room-bedroom", "Bedroom", ()),
        TaxonomyTerm("room-master-bedroom", "Master Bedroom", ()),
    )

    match = match_taxonomy_term("Master Bedroom Plan", terms)

    assert match.id == "room-master-bedroom"
    assert match.confidence == 1.0
    assert match.ambiguous is False


def test_short_title_does_not_crash_when_taxonomy_alias_is_longer():
    terms = (
        TaxonomyTerm(
            "room-living",
            "Living and Dining Room",
            ("combined living and dining room",),
        ),
    )

    match = match_taxonomy_term("A-101", terms)

    assert match.id is None
    assert match.confidence == 0.0
    assert match.ambiguous is False

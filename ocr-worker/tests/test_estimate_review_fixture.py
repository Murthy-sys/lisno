from pathlib import Path

from lisno_ocr.contracts import EstimateTaxonomy, TaxonomyTerm
from lisno_ocr.estimate_taxonomy import normalize_drawing_title
from lisno_ocr.extractor import Extractor


FIXTURE = Path(__file__).parent / "fixtures" / "estimate-review-sheet.png"

OCR_LINES = (
    ((40, 20, 360, 60), "LIVING   ROOM — FALSE-CEILING PLAN", 0.99),
    ((440, 20, 760, 60), "living room electrical.", 0.98),
    ((840, 20, 1160, 60), "BEDROOM RCP", 0.97),
    ((140, 450, 520, 480), "Bedroom Wall Elevation", 0.96),
    ((680, 450, 1060, 480), "Bedroom Floorimg", 0.91),
)

EXPECTED_MANIFEST = (
    {
        "detectedTitle": "LIVING ROOM — FALSE-CEILING PLAN",
        "crop": {"x": 14, "y": 54, "width": 372, "height": 292},
        "roomId": "room-living",
        "scopeId": "FC",
        "confidenceClass": "exact",
    },
    {
        "detectedTitle": "living room electrical.",
        "crop": {"x": 414, "y": 54, "width": 372, "height": 292},
        "roomId": "room-living",
        "scopeId": "EL",
        "confidenceClass": "exact",
    },
    {
        "detectedTitle": "BEDROOM RCP",
        "crop": {"x": 814, "y": 54, "width": 372, "height": 292},
        "roomId": "room-bedroom",
        "scopeId": "FC",
        "confidenceClass": "alias",
    },
    {
        "detectedTitle": "Bedroom Wall Elevation",
        "crop": {"x": 114, "y": 484, "width": 432, "height": 352},
        "roomId": "room-bedroom",
        "scopeId": "WE",
        "confidenceClass": "exact",
    },
    {
        "detectedTitle": "Bedroom Floorimg",
        "crop": {"x": 654, "y": 484, "width": 432, "height": 352},
        "roomId": "room-bedroom",
        "scopeId": "FL",
        "confidenceClass": "bounded-fuzzy",
    },
)


class DeterministicOcr:
    def predict(self, input):
        assert input.shape == (860, 1200, 3)
        return [{
            "rec_boxes": [box for box, _text, _score in OCR_LINES],
            "rec_texts": [text for _box, text, _score in OCR_LINES],
            "rec_scores": [score for _box, _text, score in OCR_LINES],
        }]


def _taxonomy():
    return EstimateTaxonomy(
        rooms=(
            TaxonomyTerm("room-living", "Living Room", ("living hall",)),
            TaxonomyTerm("room-bedroom", "Bedroom", ()),
        ),
        scopes=(
            TaxonomyTerm(
                "FC",
                "False Ceiling",
                ("RCP", "reflected ceiling plan", "ceiling plan"),
            ),
            TaxonomyTerm("EL", "Electrical", ()),
            TaxonomyTerm("WE", "Wall Elevation", ()),
            TaxonomyTerm("FL", "Flooring", ()),
        ),
    )


def _confidence_class(proposal):
    if proposal.room.confidence < 1 or proposal.scope.confidence < 1:
        return "bounded-fuzzy"
    canonical_evidence = {
        "living room",
        "bedroom",
        "false ceiling",
        "electrical",
        "wall elevation",
        "flooring",
    }
    evidence = {
        normalize_drawing_title(value)
        for value in (*proposal.room.evidence, *proposal.scope.evidence)
    }
    return "exact" if evidence <= canonical_evidence else "alias"


def test_representative_estimate_sheet_matches_every_manifest_proposal():
    pages = Extractor(
        ocr_engine=DeterministicOcr(),
        estimate_taxonomy=_taxonomy(),
    ).extract(FIXTURE)

    assert len(pages) == 1
    actual = []
    for section in pages[0].sections:
        assert section.proposal is not None
        actual.append({
            "detectedTitle": section.proposal.detected_title,
            "crop": section.crop.to_payload(),
            "roomId": section.proposal.room.id,
            "scopeId": section.proposal.scope.id,
            "confidenceClass": _confidence_class(section.proposal),
        })

    assert actual == list(EXPECTED_MANIFEST)

import base64
import io
import json
from pathlib import Path

from PIL import Image

from lisno_ocr.extractor import Extractor


FIXTURE = Path(__file__).parent / "fixtures" / "labeled-plan.png"


class FixtureOcr:
    def predict(self, input):
        height, width = input.shape[:2]
        return [{
            "rec_boxes": [[width // 5, height // 3, width // 2, height // 3 + 45]],
            "rec_texts": ["Front Elevation"],
            "rec_scores": [0.97],
        }]


def test_labeled_plan_serializes_to_the_backend_completion_contract():
    page = Extractor(ocr_engine=FixtureOcr()).extract(FIXTURE)[0]
    payload = json.loads(json.dumps({
        "resultId": "fixture-result",
        "pages": [page.to_payload()],
    }))

    assert set(payload) == {"resultId", "pages"}
    assert set(payload["pages"][0]) == {
        "pageNumber", "width", "height", "imageBase64", "sections"
    }
    assert payload["pages"][0]["pageNumber"] == 1
    assert payload["pages"][0]["width"] > 0
    assert payload["pages"][0]["height"] > 0

    section = payload["pages"][0]["sections"][0]
    assert set(section) == {"label", "confidence", "crop", "imageBase64"}
    assert section["label"] == "Front Elevation"
    assert 0 <= section["confidence"] <= 1
    assert set(section["crop"]) == {"x", "y", "width", "height"}
    assert (
        section["crop"]["x"] + section["crop"]["width"]
        <= payload["pages"][0]["width"]
    )
    assert (
        section["crop"]["y"] + section["crop"]["height"]
        <= payload["pages"][0]["height"]
    )

    for encoded in [payload["pages"][0]["imageBase64"], section["imageBase64"]]:
        decoded = base64.b64decode(encoded, validate=True)
        assert base64.b64encode(decoded).decode("ascii") == encoded
        assert Image.open(io.BytesIO(decoded)).format == "PNG"

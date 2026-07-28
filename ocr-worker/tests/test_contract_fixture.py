import base64
import io
import json

from PIL import Image, ImageDraw, ImageFont

from lisno_ocr.extractor import Extractor


class FixtureOcr:
    def __init__(self, title_box, excluded_boxes):
        self.title_box = title_box
        self.excluded_boxes = excluded_boxes

    def predict(self, input):
        return [{
            "rec_boxes": [self.title_box, *self.excluded_boxes],
            "rec_texts": [
                "Front Elevation",
                "Electrical Legend",
                "Building Cross Section A-A",
            ],
            "rec_scores": [0.97, 0.99, 0.99],
        }]


def _write_contract_blueprint_page(tmp_path):
    path = tmp_path / "contract-blueprint.png"
    image = Image.new("RGB", (800, 600), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)
    title_position = (80, 60)
    legend_position = (500, 65)
    section_position = (500, 115)
    draw.text(title_position, "Front Elevation", fill="black", font=font)
    draw.text(legend_position, "Electrical Legend", fill="black", font=font)
    draw.text(section_position, "Building Cross Section A-A", fill="black", font=font)
    title_box = draw.textbbox(title_position, "Front Elevation", font=font)
    excluded_boxes = [
        draw.textbbox(legend_position, "Electrical Legend", font=font),
        draw.textbbox(section_position, "Building Cross Section A-A", font=font),
    ]
    panel = (70, 140, 420, 410)
    unrelated_panel = (500, 250, 750, 520)
    draw.rectangle(panel, outline="black", width=4)
    draw.rectangle(unrelated_panel, outline="black", width=4)
    try:
        image.save(path, format="PNG")
    finally:
        image.close()
    return path, title_box, excluded_boxes, panel, unrelated_panel


def test_labeled_plan_serializes_to_the_backend_completion_contract(tmp_path):
    source, title_box, excluded_boxes, panel, unrelated_panel = (
        _write_contract_blueprint_page(tmp_path)
    )
    page = Extractor(
        ocr_engine=FixtureOcr(title_box, excluded_boxes)
    ).extract(source)[0]
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
    assert [section["label"] for section in payload["pages"][0]["sections"]] == [
        "Front Elevation"
    ]

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
    assert section["crop"]["x"] <= panel[0]
    assert section["crop"]["y"] <= panel[1]
    assert section["crop"]["x"] + section["crop"]["width"] >= panel[2]
    assert section["crop"]["y"] + section["crop"]["height"] >= panel[3]
    assert (
        section["crop"]["x"] + section["crop"]["width"] <= unrelated_panel[0]
        or unrelated_panel[2] <= section["crop"]["x"]
        or section["crop"]["y"] + section["crop"]["height"] <= unrelated_panel[1]
        or unrelated_panel[3] <= section["crop"]["y"]
    )

    for encoded in [payload["pages"][0]["imageBase64"], section["imageBase64"]]:
        decoded = base64.b64decode(encoded, validate=True)
        assert base64.b64encode(decoded).decode("ascii") == encoded
        assert Image.open(io.BytesIO(decoded)).format == "PNG"

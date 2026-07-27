from pathlib import Path

import pytest

from lisno_ocr.extractor import Extractor


FIXTURES = Path(__file__).parent / "fixtures"


class FakePaddleOCR3:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    def predict(self, input):
        assert input.ndim == 3
        self.calls += 1
        return self.result


class FakeLegacyPaddleOCR:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    def ocr(self, _image, cls=True):
        assert cls is True
        self.calls += 1
        return self.result


def test_renders_every_pdf_page_with_positive_pixel_dimensions():
    ocr = FakePaddleOCR3(
        [{"rec_boxes": [], "rec_texts": [], "rec_scores": []}]
    )
    pages = Extractor(ocr_engine=ocr).extract(FIXTURES / "two-page-plan.pdf")

    assert [page.page_number for page in pages] == [1, 2]
    assert all(page.width > 0 and page.height > 0 for page in pages)
    assert all(page.image_base64 for page in pages)
    assert ocr.calls == 2


def test_uses_paddleocr3_predict_and_parses_structured_results():
    result = [
        {
            "rec_boxes": [[285, 520, 515, 565]],
            "rec_texts": ["  Ground   Floor Elevation  "],
            "rec_scores": [0.23],
        }
    ]
    ocr = FakePaddleOCR3(result)
    pages = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )

    sections = pages[0].sections
    assert ocr.calls == 1
    assert any(section.label == "Ground Floor Elevation" for section in sections)
    assert sections[0].confidence == pytest.approx(0.23)
    assert all(0 <= section.crop.x < 2000 for section in sections)
    assert all(section.crop.x + section.crop.width <= pages[0].width for section in sections)
    assert all(section.crop.y + section.crop.height <= pages[0].height for section in sections)
    assert all(section.image_base64 for section in sections)


def test_legacy_ocr_output_remains_a_fallback():
    result = [
        [
            [
                [[285, 520], [515, 520], [515, 565], [285, 565]],
                ("Legacy Elevation", 0.91),
            ]
        ]
    ]
    ocr = FakeLegacyPaddleOCR(result)

    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert ocr.calls == 1
    assert sections[0].label == "Legacy Elevation"


@pytest.mark.model
def test_installed_paddle_model_smoke():
    pytest.importorskip("paddleocr")
    pages = Extractor().extract(FIXTURES / "labeled-plan.png")
    assert pages
    assert all(page.width > 0 and page.height > 0 for page in pages)

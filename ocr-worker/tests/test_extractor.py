from pathlib import Path

import pytest

from lisno_ocr.extractor import Extractor


FIXTURES = Path(__file__).parent / "fixtures"


class FakePaddleOCR:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    def ocr(self, _image, cls=True):
        assert cls is True
        self.calls += 1
        return self.result


def test_renders_every_pdf_page_with_positive_pixel_dimensions():
    ocr = FakePaddleOCR([[]])
    pages = Extractor(ocr_engine=ocr).extract(FIXTURES / "two-page-plan.pdf")

    assert [page.page_number for page in pages] == [1, 2]
    assert all(page.width > 0 and page.height > 0 for page in pages)
    assert all(page.image_base64 for page in pages)
    assert ocr.calls == 2


def test_preserves_display_case_and_low_confidence_when_proposing_bounded_sections():
    result = [
        [
            [
                [[285, 520], [515, 520], [515, 565], [285, 565]],
                ("  Ground   Floor Elevation  ", 0.23),
            ]
        ]
    ]
    pages = Extractor(ocr_engine=FakePaddleOCR(result)).extract(
        FIXTURES / "labeled-plan.png"
    )

    sections = pages[0].sections
    assert any(section.label == "Ground Floor Elevation" for section in sections)
    assert sections[0].confidence == pytest.approx(0.23)
    assert all(0 <= section.crop.x < 2000 for section in sections)
    assert all(section.crop.x + section.crop.width <= pages[0].width for section in sections)
    assert all(section.crop.y + section.crop.height <= pages[0].height for section in sections)
    assert all(section.image_base64 for section in sections)


@pytest.mark.model
def test_installed_paddle_model_smoke():
    pytest.importorskip("paddleocr")
    pages = Extractor().extract(FIXTURES / "labeled-plan.png")
    assert pages
    assert all(page.width > 0 and page.height > 0 for page in pages)

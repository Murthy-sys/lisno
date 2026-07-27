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


def test_filters_candidates_below_configured_confidence_floor():
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20], [30, 30, 60, 60]],
        "rec_texts": ["Noise", "Ambiguous elevation"],
        "rec_scores": [0.19, 0.2],
    }])

    sections = Extractor(ocr_engine=ocr, confidence_floor=0.2).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert [section.label for section in sections] == ["Ambiguous elevation"]


def test_candidate_cap_stops_crop_encoding_before_candidate_501(monkeypatch):
    labels = 501
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20]] * labels,
        "rec_texts": [f"Section {index}" for index in range(labels)],
        "rec_scores": [0.9] * labels,
    }])
    encoded = 0
    from lisno_ocr import extractor as module
    original = module._png_base64

    def counted(image):
        nonlocal encoded
        encoded += 1
        return original(image)

    monkeypatch.setattr(module, "_png_base64", counted)
    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert len(sections) == 500
    assert encoded == 501  # one page plus exactly 500 crops


def test_output_budget_stops_before_encoding_later_candidates(monkeypatch):
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20], [30, 30, 60, 60]],
        "rec_texts": ["First", "Second"],
        "rec_scores": [0.9, 0.9],
    }])
    encoded = 0
    from lisno_ocr import extractor as module

    def fixed(_image):
        nonlocal encoded
        encoded += 1
        return "A" * 40

    monkeypatch.setattr(module, "_png_base64", fixed)
    with pytest.raises(Exception, match="output is too large"):
        Extractor(ocr_engine=ocr, max_output_bytes=31).extract(
            FIXTURES / "labeled-plan.png"
        )
    assert encoded == 2  # page + first crop; second crop never encoded


def test_pdf_dimension_budget_rejects_before_pixmap_allocation(monkeypatch, tmp_path):
    class Rect:
        width = 10_000
        height = 10_000

    class Page:
        rect = Rect()

        def get_pixmap(self, **_kwargs):
            raise AssertionError("oversized page must not allocate a pixmap")

    class Document:
        page_count = 1

        def __iter__(self):
            return iter([Page()])

        def close(self):
            pass

    source = tmp_path / "large.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    with pytest.raises(Exception, match="page is too large"):
        Extractor(ocr_engine=FakePaddleOCR3([]), max_page_pixels=1_000).extract(source)


def test_pdf_pixmap_is_released_before_ocr_consumes_page(monkeypatch, tmp_path):
    released = []

    class Rect:
        width = 1
        height = 1

    class Pixmap:
        width = 1
        height = 1
        samples = b"\xff\xff\xff"

        def __del__(self):
            released.append(True)

    class Page:
        rect = Rect()

        def get_pixmap(self, **_kwargs):
            return Pixmap()

    class Document:
        page_count = 1

        def __iter__(self):
            return iter([Page()])

        def close(self):
            pass

    class LifecycleOcr:
        def predict(self, input):
            assert input.shape == (1, 1, 3)
            assert released
            return [{"rec_boxes": [], "rec_texts": [], "rec_scores": []}]

    source = tmp_path / "one.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    Extractor(ocr_engine=LifecycleOcr()).extract(source)


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
    sections = [section for page in pages for section in page.sections]
    assert sections
    for page in pages:
        for section in page.sections:
            assert section.label
            assert section.label == " ".join(section.label.split())
            assert section.crop.width > 0
            assert section.crop.height > 0
            assert 0 <= section.crop.x < page.width
            assert 0 <= section.crop.y < page.height
            assert section.crop.x + section.crop.width <= page.width
            assert section.crop.y + section.crop.height <= page.height

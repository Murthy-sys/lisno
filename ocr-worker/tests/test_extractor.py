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
            "rec_texts": ["  Front   Elevation  "],
            "rec_scores": [0.23],
        }
    ]
    ocr = FakePaddleOCR3(result)
    pages = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )

    sections = pages[0].sections
    assert ocr.calls == 1
    assert any(section.label == "Front Elevation" for section in sections)
    assert sections[0].confidence == pytest.approx(0.23)
    assert all(0 <= section.crop.x < 2000 for section in sections)
    assert all(section.crop.x + section.crop.width <= pages[0].width for section in sections)
    assert all(section.crop.y + section.crop.height <= pages[0].height for section in sections)
    assert all(section.image_base64 for section in sections)


def test_filters_candidates_below_configured_confidence_floor():
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20], [30, 30, 60, 60]],
        "rec_texts": ["Floor Plan", "Rear Elevation"],
        "rec_scores": [0.19, 0.2],
    }])

    sections = Extractor(ocr_engine=ocr, confidence_floor=0.2).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert [section.label for section in sections] == ["Rear Elevation"]


def test_extracts_only_supported_titles_from_mixed_ocr_lines_in_reading_order():
    labels = [
        ((40, 40, 410, 78), "Floor Plan – 3BHK Residence", 0.97),
        ((450, 42, 690, 76), "Electrical Legend", 0.99),
        ((40, 125, 260, 157), "Living Room", 0.96),
        ((44, 163, 330, 199), "Front Elevation", 0.91),
        ((450, 125, 700, 157), "GENERAL NOTES", 0.99),
        ((450, 168, 710, 200), "1. All dimensions in mm", 0.99),
        ((40, 250, 180, 282), "4500", 0.99),
        ((210, 250, 340, 282), "N", 0.99),
        ((370, 250, 570, 282), "Key Plan", 0.99),
        ((40, 330, 300, 362), "MATERIAL: TEAK VENEER", 0.99),
        ((330, 330, 590, 362), "Building Cross Section A-A", 0.99),
        ((40, 410, 250, 442), "Window Detail 04", 0.99),
        ((280, 410, 510, 442), "Single Line Diagram", 0.99),
        ((540, 410, 730, 442), "Door Schedule", 0.99),
        ((40, 520, 390, 558), "Ceiling Plan – Living Room", 0.94),
    ]
    ocr = FakePaddleOCR3([{
        "rec_boxes": [box for box, _text, _score in labels],
        "rec_texts": [text for _box, text, _score in labels],
        "rec_scores": [score for _box, _text, score in labels],
    }])

    page = Extractor(ocr_engine=ocr).extract(FIXTURES / "labeled-plan.png")[0]

    assert [section.label for section in page.sections] == [
        "Floor Plan – 3BHK Residence",
        "Living Room – Front Elevation",
        "Ceiling Plan – Living Room",
    ]
    assert all(0 <= section.crop.x < page.width for section in page.sections)
    assert all(0 <= section.crop.y < page.height for section in page.sections)
    assert all(
        section.crop.x + section.crop.width <= page.width
        for section in page.sections
    )
    assert all(
        section.crop.y + section.crop.height <= page.height
        for section in page.sections
    )


def test_uses_configured_accepted_plan_types_for_extraction(monkeypatch):
    monkeypatch.setenv("OCR_ACCEPTED_PLAN_TYPES", "landscape")
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[40, 40, 300, 80], [40, 140, 300, 180]],
        "rec_texts": ["Landscape Plan", "Floor Plan"],
        "rec_scores": [0.95, 0.96],
    }])

    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert [section.label for section in sections] == ["Landscape Plan"]


def test_candidate_cap_stops_crop_encoding_before_candidate_501(monkeypatch):
    labels = 501
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20]] * labels,
        "rec_texts": [f"Floor Plan – Wing {index}" for index in range(labels)],
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


def test_classifier_input_is_bounded_before_the_output_candidate_cap(
    monkeypatch,
):
    labels = 2_001
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20]] * labels,
        "rec_texts": [f"Floor Plan – Wing {index}" for index in range(labels)],
        "rec_scores": [0.9] * labels,
    }])
    received = []
    from lisno_ocr import extractor as module

    def bounded_classifier(lines, _plan_types, _room_types):
        received.append(len(lines))
        return ()

    monkeypatch.setattr(
        module,
        "classify_drawing_titles",
        bounded_classifier,
    )

    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert received == [2_000]
    assert sections == ()


def test_output_budget_stops_before_encoding_later_candidates(monkeypatch):
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20], [30, 30, 60, 60]],
        "rec_texts": ["Floor Plan", "Rear Elevation"],
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
                ("Left Elevation", 0.91),
            ]
        ]
    ]
    ocr = FakeLegacyPaddleOCR(result)

    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert ocr.calls == 1
    assert sections[0].label == "Left Elevation"


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

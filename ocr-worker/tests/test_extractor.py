import base64
import io
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

from lisno_ocr.extractor import Extractor
from lisno_ocr.settings import LayoutSettings
from lisno_ocr.title_classifier import OcrLine, classify_drawing_titles


FIXTURES = Path(__file__).parent / "fixtures"


def _write_representative_blueprint_pdf(tmp_path):
    path = tmp_path / "representative-blueprint.pdf"
    first = Image.new("RGB", (900, 700), "white")
    second = Image.new("RGB", (900, 700), "white")
    font = ImageFont.load_default(size=24)
    first_draw = ImageDraw.Draw(first)
    second_draw = ImageDraw.Draw(second)

    first_lines = []
    second_lines = []
    first_dashes = []
    second_dashes = []

    def add_text(draw, lines, dashes, position, text, confidence=0.99):
        if " – " not in text:
            draw.text(position, text, fill="black", font=font)
            lines.append(
                (draw.textbbox(position, text, font=font), text, confidence)
            )
            return

        before_dash, after_dash = text.split(" – ", maxsplit=1)
        left_box = draw.textbbox(position, before_dash, font=font)
        space_width = round(draw.textlength(" ", font=font))
        dash_left = left_box[2] + space_width
        dash_right = dash_left + 12
        dash_top = position[1] + 15
        dash_bottom = dash_top + 2
        draw.text(position, before_dash, fill="black", font=font)
        draw.rectangle(
            (dash_left, dash_top, dash_right - 1, dash_bottom - 1),
            fill="black",
        )
        right_position = (dash_right + space_width, position[1])
        draw.text(right_position, after_dash, fill="black", font=font)
        right_box = draw.textbbox(right_position, after_dash, font=font)
        lines.append(
            (
                (
                    left_box[0],
                    min(left_box[1], dash_top, right_box[1]),
                    right_box[2],
                    max(left_box[3], dash_bottom, right_box[3]),
                ),
                text,
                confidence,
            )
        )
        dashes.append((dash_left, dash_top, dash_right, dash_bottom))

    add_text(
        first_draw,
        first_lines,
        first_dashes,
        (50, 50),
        "Floor Plan – 3BHK Residence",
        0.97,
    )
    add_text(first_draw, first_lines, first_dashes, (470, 55), "Electrical Legend")
    add_text(first_draw, first_lines, first_dashes, (470, 100), "Building Cross Section A-A")
    add_text(first_draw, first_lines, first_dashes, (470, 145), "GENERAL NOTES")
    first_draw.rectangle((40, 115, 410, 350), outline="black", width=4)
    first_draw.rectangle((500, 300, 820, 600), outline="black", width=4)

    add_text(second_draw, second_lines, second_dashes, (50, 45), "Living Room", 0.96)
    add_text(second_draw, second_lines, second_dashes, (50, 80), "Front Elevation", 0.91)
    add_text(second_draw, second_lines, second_dashes, (460, 80), "Side Elevation (Left)", 0.93)
    add_text(second_draw, second_lines, second_dashes, (50, 420), "Ceiling Plan – Living Room", 0.94)
    add_text(second_draw, second_lines, second_dashes, (480, 45), "Door Schedule")
    add_text(second_draw, second_lines, second_dashes, (480, 130), "1. All dimensions in mm")
    second_draw.rectangle((40, 140, 350, 330), outline="black", width=4)
    second_draw.rectangle((450, 220, 790, 410), outline="black", width=4)
    second_draw.rectangle((40, 490, 400, 650), outline="black", width=4)

    page_results = []
    for lines in (first_lines, second_lines):
        page_results.append({
            "rec_boxes": [box for box, _text, _score in lines],
            "rec_texts": [text for _box, text, _score in lines],
            "rec_scores": [score for _box, _text, score in lines],
        })
    try:
        first.save(path, format="PDF", save_all=True, append_images=[second])
    finally:
        first.close()
        second.close()
    return path, page_results, [
        {
            "Floor Plan – 3BHK Residence": (40, 115, 410, 350),
            "unrelated": (500, 300, 820, 600),
        },
        {
            "Living Room – Front Elevation": (40, 140, 350, 330),
            "Side Elevation (Left)": (450, 220, 790, 410),
            "Ceiling Plan – Living Room": (40, 490, 400, 650),
        },
    ], [first_dashes, second_dashes]


def _write_noise_only_blueprint_page(tmp_path):
    path = tmp_path / "noise-only-blueprint.png"
    image = Image.new("RGB", (900, 800), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=22)
    labels = [
        "SYMBOL LEGEND",
        "GENERAL NOTES",
        "1. Refer to Floor Plan",
        "Key Plan",
        "4500",
        "SCALE 1:100",
        "N",
        "Living Room",
        "MATERIAL: TEAK VENEER",
        "FINISH: BRUSHED BRASS",
        "FIXTURE: WALL LIGHT",
        "Building Cross Section A-A",
        "Window Detail 04",
        "Single Line Diagram",
        "Door Schedule",
        "Landscape Plan",
        "Some Arbitrary Text",
    ]
    lines = []
    for index, label in enumerate(labels):
        position = (50 + (index % 2) * 430, 35 + (index // 2) * 82)
        draw.text(position, label, fill="black", font=font)
        lines.append((draw.textbbox(position, label, font=font), label, 0.99))
    try:
        image.save(path, format="PNG")
    finally:
        image.close()
    return path, {
        "rec_boxes": [box for box, _text, _score in lines],
        "rec_texts": [text for _box, text, _score in lines],
        "rec_scores": [score for _box, _text, score in lines],
    }


def _contains_region(crop, region):
    left, top, right, bottom = region
    return (
        crop.x <= left
        and crop.y <= top
        and crop.x + crop.width >= right
        and crop.y + crop.height >= bottom
    )


def _overlaps_region(crop, region):
    left, top, right, bottom = region
    return (
        crop.x < right
        and left < crop.x + crop.width
        and crop.y < bottom
        and top < crop.y + crop.height
    )


def _assert_dash_is_a_horizontal_stroke(page, dash_regions):
    rendered = Image.open(
        io.BytesIO(base64.b64decode(page.image_base64))
    ).convert("L")
    try:
        for left, top, right, bottom in dash_regions:
            assert all(
                rendered.getpixel((x, y)) < 100
                for x in range(left, right)
                for y in range(top, bottom)
            )
            assert all(
                rendered.getpixel((x, y)) > 235
                for x in range(left - 1, right + 1)
                for y in (top - 2, bottom + 2)
            )
    finally:
        rendered.close()


class FakePaddleOCR3:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    def predict(self, input):
        assert input.ndim == 3
        self.calls += 1
        return self.result


class PageAwareFakePaddleOCR3(FakePaddleOCR3):
    def __init__(self, page_results):
        super().__init__([page_results[0]])
        self.page_results = page_results

    def predict(self, input):
        assert input.ndim == 3
        assert self.calls < len(self.page_results)
        result = self.page_results[self.calls]
        self.calls += 1
        return [result]


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


def test_extracts_exact_approved_blueprint_titles_in_page_order(tmp_path):
    source, page_results, expected_regions, dash_regions = (
        _write_representative_blueprint_pdf(tmp_path)
    )

    pages = Extractor(
        ocr_engine=PageAwareFakePaddleOCR3(page_results), render_scale=1
    ).extract(source)

    assert [[section.label for section in page.sections] for page in pages] == [
        ["Floor Plan – 3BHK Residence"],
        [
            "Living Room – Front Elevation",
            "Side Elevation (Left)",
            "Ceiling Plan – Living Room",
        ],
    ]

    for page, regions in zip(pages, expected_regions):
        for section in page.sections:
            assert _contains_region(section.crop, regions[section.label])
            assert all(
                not _overlaps_region(section.crop, region)
                for label, region in regions.items()
                if label != section.label
            )
    for page, dashes in zip(pages, dash_regions):
        _assert_dash_is_a_horizontal_stroke(page, dashes)


def test_extracts_zero_sections_from_a_noise_only_page(tmp_path):
    source, page_result = _write_noise_only_blueprint_page(tmp_path)
    ocr = PageAwareFakePaddleOCR3([page_result])

    page = Extractor(ocr_engine=ocr).extract(source)[0]

    assert page.sections == ()


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
        "rec_texts": [f"Bedroom {index} Plan" for index in range(labels)],
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
    taxonomy = LayoutSettings.defaults()
    for page in pages:
        for section in page.sections:
            classified = classify_drawing_titles(
                [OcrLine((0, 0, 1, 1), section.label, section.confidence)],
                taxonomy.accepted_plan_types,
                taxonomy.accepted_room_types,
            )
            assert classified
            assert classified[0].label == section.label
            assert section.label
            assert section.label == " ".join(section.label.split())
            assert section.crop.width > 0
            assert section.crop.height > 0
            assert 0 <= section.crop.x < page.width
            assert 0 <= section.crop.y < page.height
            assert section.crop.x + section.crop.width <= page.width
            assert section.crop.y + section.crop.height <= page.height

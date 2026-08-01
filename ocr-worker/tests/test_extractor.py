import base64
import io
from pathlib import Path
import time

import fitz
import pytest
from PIL import Image, ImageDraw, ImageFont

from lisno_ocr.contracts import (
    Crop,
    EstimateTaxonomy,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
    TaxonomyTerm,
)
from lisno_ocr.extractor import Extractor
from lisno_ocr.settings import LayoutSettings
from lisno_ocr.title_classifier import OcrLine, classify_drawing_titles


FIXTURES = Path(__file__).parent / "fixtures"
SUPPLIED_BLUEPRINT_SHA256 = (
    "980c69b279fb2d283ff33836f5539264d117cdff76928252177863c2ffc3e65c"
)


SUPPLIED_BLUEPRINT_OCR = [
    ((34, 32, 247, 60), "BLUEPRINT 01", 0.9613800644874573),
    ((734, 32, 911, 59), "BLUEPRINT", 0.9939998984336853),
    ((903, 32, 950, 59), "02", 0.9947403073310852),
    ((1195, 32, 1270, 49), "KEY PLAN", 0.9569981098175049),
    ((34, 70, 285, 84), "FLOOR PLAN—3BHK RESIDENCE", 0.9452375769615173),
    ((733, 68, 831, 85), "ELEVATION", 0.9987469911575317),
    ((828, 69, 968, 86), "&CEILING PLAN", 0.9627071022987366),
    ((329, 124, 366, 139), "13500", 0.9989112019538879),
    ((109, 154, 140, 169), "1800", 0.9990113973617554),
    ((226, 154, 258, 169), "4200", 0.9994466304779053),
    ((364, 154, 396, 169), "2700", 0.9996252655982971),
    ((507, 151, 541, 170), "4800", 0.999168872833252),
    ((829, 161, 844, 173), "A.", 0.9105772972106934),
    (
        (852, 160, 1070, 173),
        "LIVING ROOM—FRONTELEVATION",
        0.9670242667198181,
    ),
    ((731, 238, 801, 249), "FALSE CEILING", 0.9744109511375427),
    ((732, 334, 791, 344), "WALL PANEL", 0.9555436968803406),
    ((1291, 334, 1356, 344), "DISPLAYUNIT", 0.9957664608955383),
    ((335, 418, 394, 429), "BEDROOM 2", 0.9815718531608582),
    ((479, 418, 572, 428), "MASTERBEDROOM", 0.9964205622673035),
    ((147, 447, 195, 461), "LIVING/DINING", 0.5892143845558167),
    ((731, 440, 770, 451), "TV UNIT", 0.9705317616462708),
    ((534, 486, 576, 497), "WALK IN", 0.9571718573570251),
    ((527, 500, 583, 511), "WARDROBE", 0.9981621503829956),
    ((101, 580, 137, 594), "ENTRY", 0.9969401359558105),
    (
        (731, 609, 898, 627),
        "B.SIDE ELEVATION(LEFT）",
        0.9535936117172241,
    ),
    (
        (1000, 611, 1236, 625),
        "C.CEILINGPLAN-LIVINGROOM",
        0.9797329902648926,
    ),
    ((867, 698, 928, 709), "WALLPANEL", 0.9878377914428711),
    ((867, 820, 908, 831), "TV UNIT", 0.9440501928329468),
    ((36, 949, 89, 963), "LEGEND", 0.9480158090591431),
    ((214, 949, 362, 962), "WALL & FINISHLEGEND", 0.9982010722160339),
    ((496, 948, 543, 963), "NOTES", 0.9857620000839233),
    (
        (739, 949, 947, 963),
        "SYMBOLLEGEND(CEILINGPLAN)",
        0.9980929493904114,
    ),
    ((1165, 948, 1211, 963), "NOTES", 0.9964715838432312),
    ((801, 997, 896, 1011), "LED DOWN LIGHT", 0.976708173751831),
    ((995, 997, 1063, 1011), "CEILING FAN", 0.9604941606521606),
]


def write_estimate_pdf(
    tmp_path: Path,
    titles: list[str | None],
    *,
    filename: str = "estimate.pdf",
) -> Path:
    source = tmp_path / filename
    document = fitz.open()
    try:
        for title in titles:
            page = document.new_page(width=1191, height=842)
            if title is not None:
                page.insert_text((700, 780), f"TITLE : {title}")
        document.save(source)
    finally:
        document.close()
    return source


class OcrMustNotStart:
    def predict(self, **_kwargs):
        raise AssertionError("embedded title text must bypass OCR")


def test_estimate_pdf_uses_embedded_title_text_without_starting_ocr(tmp_path):
    source = tmp_path / "text-layer-title.pdf"
    document = fitz.open()
    page = document.new_page(width=1191, height=842)
    page.insert_text((33, 735), "TITLE :")
    page.insert_text((68, 735), "TV UNIT")
    page.insert_text((318, 735), "DISINED BY : JITHESH K")
    document.save(source)
    document.close()

    class OcrMustNotStart:
        def predict(self, **_kwargs):
            raise AssertionError("embedded PDF title should bypass OCR")

    pages = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert len(pages) == 1
    assert len(pages[0].sections) == 1
    assert pages[0].sections[0].label == "TV UNIT"
    assert pages[0].sections[0].crop == Crop(
        x=0, y=0, width=pages[0].width, height=pages[0].height
    )


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


def test_pdf_title_blocks_emit_one_full_page_section_and_preserve_taxonomy(tmp_path):
    source = tmp_path / "title-blocks.pdf"
    first = Image.new("RGB", (900, 700), "white")
    second = Image.new("RGB", (900, 700), "white")
    try:
        first.save(source, format="PDF", save_all=True, append_images=[second])
    finally:
        first.close()
        second.close()

    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-living", "Living Room", ()),),
        scopes=(TaxonomyTerm("FL", "Flooring", ()),),
    )
    ocr = PageAwareFakePaddleOCR3([
        {
            "rec_boxes": [(50, 20, 370, 48)],
            "rec_texts": ["TITLE : Living Room Flooring"],
            "rec_scores": [0.97],
        },
        {
            "rec_boxes": [(50, 20, 370, 48)],
            "rec_texts": ["TITLE : TV UNIT"],
            "rec_scores": [0.96],
        },
    ])

    pages = Extractor(
        ocr_engine=ocr,
        render_scale=1,
        estimate_taxonomy=taxonomy,
    ).extract(source, mode="estimate_design")

    assert [[section.label for section in page.sections] for page in pages] == [
        ["Living Room Flooring"],
        ["TV UNIT"],
    ]
    assert [
        section.crop.to_payload()
        for page in pages
        for section in page.sections
    ] == [
        {"x": 0, "y": 0, "width": pages[0].width, "height": pages[0].height},
        {"x": 0, "y": 0, "width": pages[1].width, "height": pages[1].height},
    ]
    assert [
        section.proposal.to_payload() if section.proposal else None
        for page in pages
        for section in page.sections
    ] == [
        {
            "detectedTitle": "Living Room Flooring",
            "room": {
                "id": "room-living",
                "confidence": 1.0,
                "evidence": ["living room"],
                "ambiguous": False,
            },
            "scope": {
                "id": "FL",
                "confidence": 1.0,
                "evidence": ["flooring"],
                "ambiguous": False,
            },
        },
        {
            "detectedTitle": "TV UNIT",
            "room": {"id": None, "confidence": 0.0, "evidence": [], "ambiguous": False},
            "scope": {"id": None, "confidence": 0.0, "evidence": [], "ambiguous": False},
        },
    ]
    assert all(
        section.image_base64 == page.image_base64
        for page in pages
        for section in page.sections
    )
    assert ocr.calls == 2


def test_six_page_estimate_pdf_opens_once_and_emits_one_full_page_drawing(
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(
        tmp_path,
        [f"Drawing {number}" for number in range(1, 7)],
    )

    from lisno_ocr import extractor as module
    actual_open = module.fitz.open
    opens = 0

    def counted_open(*args, **kwargs):
        nonlocal opens
        opens += 1
        return actual_open(*args, **kwargs)

    monkeypatch.setattr(module.fitz, "open", counted_open)
    pages = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert opens == 1
    assert [page.page_number for page in pages] == [1, 2, 3, 4, 5, 6]
    assert all(len(page.sections) == 1 for page in pages)
    assert all(
        section.crop == Crop(0, 0, page.width, page.height)
        and section.image_base64 == page.image_base64
        for page in pages
        for section in page.sections
    )


def test_estimate_pdf_does_not_expand_title_geometry_to_far_same_line_text(
    tmp_path,
):
    source = tmp_path / "far-title-value.pdf"
    document = fitz.open()
    try:
        page = document.new_page(width=1191, height=842)
        page.insert_text((700, 780), "TITLE :")
        page.insert_text((1100, 780), "UNRELATED")
        document.save(source)
    finally:
        document.close()

    class EmptyTitleBandOcr:
        def predict(self, **_kwargs):
            return [{
                "rec_boxes": [],
                "rec_texts": [],
                "rec_scores": [],
            }]

    page = Extractor(
        ocr_engine=EmptyTitleBandOcr(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")[0]

    assert page.sections[0].label == "Unidentified drawing — page 1"


def test_six_page_estimate_pdf_without_titles_emits_unidentified_drawings(
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(tmp_path, [None] * 6)

    class EmptyTitleBandOcr:
        def __init__(self):
            self.heights: list[int] = []

        def predict(self, input):
            self.heights.append(input.shape[0])
            return [{
                "rec_boxes": [],
                "rec_texts": [],
                "rec_scores": [],
            }]

    from lisno_ocr import extractor as module
    monkeypatch.setattr(
        module,
        "_drawing_regions",
        lambda *_args, **_kwargs: pytest.fail(
            "estimate extraction must not enter region detection"
        ),
    )
    ocr = EmptyTitleBandOcr()
    pages = Extractor(
        ocr_engine=ocr,
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == [1, 2, 3, 4, 5, 6]
    assert [
        section.label
        for page in pages
        for section in page.sections
    ] == [
        f"Unidentified drawing — page {number}"
        for number in range(1, 7)
    ]
    assert all(
        section.confidence == 0
        and section.crop == Crop(0, 0, page.width, page.height)
        and section.image_base64 == page.image_base64
        and section.proposal is not None
        and section.proposal.room.id is None
        and section.proposal.scope.id is None
        for page in pages
        for section in page.sections
    )
    assert ocr.heights
    assert all(
        height < page.height
        for height, page in zip(ocr.heights, pages, strict=True)
    )


def test_unidentified_estimate_drawing_ignores_matching_taxonomy_terms(tmp_path):
    source = write_estimate_pdf(tmp_path, [None])

    class EmptyTitleBandOcr:
        def predict(self, **_kwargs):
            return [{
                "rec_boxes": [],
                "rec_texts": [],
                "rec_scores": [],
            }]

    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-unidentified", "Unidentified Drawing", ()),),
        scopes=(TaxonomyTerm("scope-unidentified", "Unidentified Drawing", ()),),
    )
    page = Extractor(
        ocr_engine=EmptyTitleBandOcr(),
        render_scale=1,
        estimate_taxonomy=taxonomy,
    ).extract(source, mode="estimate_design")[0]

    assert page.sections[0].label == "Unidentified drawing — page 1"
    assert page.sections[0].proposal is not None
    assert page.sections[0].proposal.room.id is None
    assert page.sections[0].proposal.scope.id is None


def test_estimate_pdf_processes_page_seven_when_the_configured_limit_allows_it(
    tmp_path,
):
    source = write_estimate_pdf(
        tmp_path,
        [f"Drawing {number}" for number in range(1, 8)],
    )
    pages = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        max_pdf_pages=7,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == list(range(1, 8))
    assert all(len(page.sections) == 1 for page in pages)


def test_pdf_title_block_fast_path_accounts_for_both_serialized_image_fields(
    monkeypatch, tmp_path
):
    source = tmp_path / "title-block.pdf"
    image = Image.new("RGB", (900, 700), "white")
    try:
        image.save(source, format="PDF")
    finally:
        image.close()

    ocr = PageAwareFakePaddleOCR3([{
        "rec_boxes": [(50, 20, 370, 48)],
        "rec_texts": ["TITLE : TV UNIT"],
        "rec_scores": [0.97],
    }])
    from lisno_ocr import extractor as module

    monkeypatch.setattr(module, "_png_base64", lambda _image: "A" * 40)

    with pytest.raises(OcrError, match="output is too large"):
        Extractor(
            ocr_engine=ocr,
            render_scale=1,
            max_output_bytes=59,
        ).extract(source, mode="estimate_design")


def test_project_design_pdf_keeps_multi_panel_region_extraction_despite_title_block(
    tmp_path,
):
    source = tmp_path / "project-design.pdf"
    image = Image.new("RGB", (900, 700), "white")
    try:
        draw = ImageDraw.Draw(image)
        draw.rectangle((60, 80, 400, 450), outline="black", width=4)
        draw.rectangle((500, 80, 840, 450), outline="black", width=4)
        image.save(source, format="PDF")
    finally:
        image.close()

    ocr = PageAwareFakePaddleOCR3([{
        "rec_boxes": [
            (90, 100, 280, 130),
            (530, 100, 760, 130),
            (50, 620, 370, 648),
        ],
        "rec_texts": [
            "Floor Plan",
            "Front Elevation",
            "TITLE : TV UNIT",
        ],
        "rec_scores": [0.98, 0.98, 0.99],
    }])

    page = Extractor(ocr_engine=ocr, render_scale=1).extract(
        source, mode="project_design"
    )[0]

    assert [section.label for section in page.sections] == [
        "Floor Plan",
        "Front Elevation",
    ]
    assert all(
        section.crop.to_payload()
        != {"x": 0, "y": 0, "width": page.width, "height": page.height}
        for section in page.sections
    )
    assert ocr.calls == 1


def test_rejects_an_extraction_deadline_that_has_already_expired():
    with pytest.raises(OcrError, match="processing time limit"):
        Extractor(ocr_engine=FakePaddleOCR3([])).extract(
            FIXTURES / "labeled-plan.png",
            deadline=time.monotonic() - 1,
        )


def test_tiff_decode_failures_remain_classified_as_invalid_sources(tmp_path):
    source = tmp_path / "oversized.tiff"
    image = Image.new("RGB", (10, 10), "white")
    try:
        image.save(source, format="TIFF")
    finally:
        image.close()

    with pytest.raises(InvalidSourceError, match="source image page is too large"):
        Extractor(
            ocr_engine=FakePaddleOCR3([]),
            max_page_pixels=1,
        ).extract(source)


def test_multipage_tiff_respects_the_common_source_page_limit(tmp_path):
    source = tmp_path / "two-pages.tiff"
    first = Image.new("RGB", (10, 10), "white")
    second = Image.new("RGB", (10, 10), "black")
    try:
        first.save(source, format="TIFF", save_all=True, append_images=[second])
    finally:
        first.close()
        second.close()

    with pytest.raises(InvalidSourceError, match="too many pages"):
        Extractor(
            ocr_engine=FakePaddleOCR3([]),
            max_pdf_pages=1,
        ).extract(source)


def test_estimate_taxonomy_adds_a_proposal_for_every_multi_title_crop():
    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-living", "Living Room", ()),),
        scopes=(
            TaxonomyTerm("FL", "Flooring", ("floor plan",)),
            TaxonomyTerm("WE", "Wall Elevation", ("front elevation",)),
            TaxonomyTerm("FC", "False Ceiling", ("ceiling plan",)),
            TaxonomyTerm("EL", "Electrical", ()),
        ),
    )
    labels = [
        ((34, 70, 285, 84), "Living Room Floor Plan", 0.95),
        ((852, 160, 1070, 173), "Living Room Front Elevation", 0.96),
        ((731, 609, 898, 627), "Living Room Ceiling Plan", 0.97),
        ((1000, 611, 1236, 625), "Living Room Electrical Plan", 0.98),
    ]
    ocr = PageAwareFakePaddleOCR3([{
        "rec_boxes": [box for box, _text, _score in labels],
        "rec_texts": [text for _box, text, _score in labels],
        "rec_scores": [score for _box, _text, score in labels],
    }])

    page = Extractor(
        ocr_engine=ocr,
        estimate_taxonomy=taxonomy,
    ).extract(FIXTURES / "multi-room-scope-plan.png")[0]

    assert [section.proposal.scope.id for section in page.sections] == [
        "FL", "WE", "FC", "EL",
    ]
    assert all(section.proposal is not None for section in page.sections)
    assert all(section.proposal.room.id == "room-living" for section in page.sections)
    assert len({
        (section.crop.x, section.crop.y, section.crop.width, section.crop.height)
        for section in page.sections
    }) == 4
    payload = page.sections[2].to_payload()
    assert payload["proposal"] == {
        "detectedTitle": "Living Room Ceiling Plan",
        "room": {
            "id": "room-living",
            "confidence": 1.0,
            "evidence": ["living room"],
            "ambiguous": False,
        },
        "scope": {
            "id": "FC",
            "confidence": 1.0,
            "evidence": ["ceiling plan"],
            "ambiguous": False,
        },
    }


def test_estimate_taxonomy_preserves_room_matched_titles_with_uncertain_scope():
    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-bedroom", "Bedroom", ()),),
        scopes=(
            TaxonomyTerm("FC", "False Ceiling", ("ceiling plan",)),
            TaxonomyTerm("FL", "Flooring", ("floor plan",)),
            TaxonomyTerm("CA", "Carpentry", ()),
            TaxonomyTerm("EL", "Electrical", ()),
        ),
    )
    ocr = PageAwareFakePaddleOCR3([{
        "rec_boxes": [(34, 70, 285, 84)],
        "rec_texts": ["Bedroom Wardrobe"],
        "rec_scores": [0.98],
    }])

    page = Extractor(
        ocr_engine=ocr,
        estimate_taxonomy=taxonomy,
    ).extract(FIXTURES / "multi-room-scope-plan.png")[0]

    assert len(page.sections) == 1
    assert page.sections[0].proposal.room.id == "room-bedroom"
    assert page.sections[0].proposal.scope.id is None
    assert page.sections[0].proposal.scope.confidence == 0


@pytest.mark.parametrize(
    "label",
    [
        "Living Room Flooring Schedule",
        "Living Room Flooring Notes",
        "Living Room Flooring Legend",
        "Living Room Flooring Details",
        "Living Room Teak Flooring",
    ],
)
def test_estimate_taxonomy_preserves_drawing_title_exclusions(label):
    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-living", "Living Room", ()),),
        scopes=(TaxonomyTerm("FL", "Flooring", ()),),
    )
    ocr = PageAwareFakePaddleOCR3([{
        "rec_boxes": [(34, 70, 285, 84)],
        "rec_texts": [label],
        "rec_scores": [0.99],
    }])

    page = Extractor(
        ocr_engine=ocr,
        estimate_taxonomy=taxonomy,
    ).extract(FIXTURES / "multi-room-scope-plan.png")[0]

    assert page.sections == ()


def test_extracts_exact_approved_blueprint_titles_in_page_order(tmp_path):
    source, page_results, expected_regions, dash_regions = (
        _write_representative_blueprint_pdf(tmp_path)
    )

    pages = Extractor(
        ocr_engine=PageAwareFakePaddleOCR3(
            page_results
        ),
        render_scale=1,
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


def test_supplied_blueprint_extracts_four_distinct_drawing_crops():
    import hashlib

    source = FIXTURES / "blueprint-01-02.png"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == (
        SUPPLIED_BLUEPRINT_SHA256
    )
    ocr = PageAwareFakePaddleOCR3([{
        "rec_boxes": [box for box, _text, _score in SUPPLIED_BLUEPRINT_OCR],
        "rec_texts": [text for _box, text, _score in SUPPLIED_BLUEPRINT_OCR],
        "rec_scores": [score for _box, _text, score in SUPPLIED_BLUEPRINT_OCR],
    }])

    page = Extractor(ocr_engine=ocr).extract(source)[0]

    assert [section.label for section in page.sections] == [
        "FLOOR PLAN – 3BHK RESIDENCE",
        "LIVING ROOM – FRONT ELEVATION",
        "SIDE ELEVATION (LEFT)",
        "CEILING PLAN – LIVING ROOM",
    ]
    by_label = {section.label: section.crop for section in page.sections}
    expected_drawings = {
        "FLOOR PLAN – 3BHK RESIDENCE": (87, 200, 620, 815),
        "LIVING ROOM – FRONT ELEVATION": (835, 196, 1275, 550),
        "SIDE ELEVATION (LEFT)": (758, 649, 840, 890),
        "CEILING PLAN – LIVING ROOM": (1015, 650, 1315, 890),
    }
    for label, drawing in expected_drawings.items():
        assert _contains_region(by_label[label], drawing)
    assert len({
        (crop.x, crop.y, crop.width, crop.height)
        for crop in by_label.values()
    }) == 4
    for label, crop in by_label.items():
        assert crop.y + crop.height < 934, label


def test_crop_association_penalizes_nearby_text_dense_notes_panel(tmp_path):
    source = tmp_path / "drawing-versus-notes.png"
    image = Image.new("RGB", (1000, 700), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)

    title = ((40, 35, 310, 70), "Front Elevation", 0.98)
    note_lines = [
        ((75, 150 + index * 32, 320, 174 + index * 32), text, 0.99)
        for index, text in enumerate(
            (
                "GENERAL NOTES",
                "1. VERIFY ALL LEVELS",
                "2. DIMENSIONS IN MM",
                "3. REFER FLOOR PLAN",
                "4. DO NOT SCALE",
                "5. CONTRACTOR TO CHECK",
            )
        )
    ]
    draw.rectangle((35, 110, 365, 370), outline="black", width=4)
    for box, text, _confidence in note_lines:
        draw.text((box[0], box[1]), text, fill="black", font=font)

    # A farther, sparse architectural line drawing.
    draw.rectangle((500, 120, 940, 620), outline="black", width=4)
    draw.line((500, 280, 940, 280), fill="black", width=4)
    draw.line((650, 120, 650, 620), fill="black", width=4)
    draw.rectangle((700, 340, 860, 560), outline="black", width=4)
    image.save(source, format="PNG")
    image.close()

    lines = [title, *note_lines]
    ocr = FakePaddleOCR3([{
        "rec_boxes": [box for box, _text, _score in lines],
        "rec_texts": [text for _box, text, _score in lines],
        "rec_scores": [score for _box, _text, score in lines],
    }])

    section = Extractor(ocr_engine=ocr).extract(source)[0].sections[0]

    assert section.label == "Front Elevation"
    assert section.crop.x >= 450
    assert section.crop.x + section.crop.width > 900
    assert section.crop.y + section.crop.height > 580
    assert section.crop.x >= 365


def test_crop_fallback_without_detected_drawing_stays_within_page(tmp_path):
    source = tmp_path / "title-only.png"
    image = Image.new("RGB", (320, 180), "white")
    image.save(source, format="PNG")
    image.close()
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[20, 20, 180, 48]],
        "rec_texts": ["Roof Plan"],
        "rec_scores": [0.97],
    }])

    section = Extractor(ocr_engine=ocr).extract(source)[0].sections[0]

    assert 0 <= section.crop.x < 320
    assert 0 <= section.crop.y < 180
    assert section.crop.x + section.crop.width <= 320
    assert section.crop.y + section.crop.height <= 180


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


def test_region_text_scoring_is_computed_once_per_page_not_per_title(
    monkeypatch,
):
    labels = 100
    ocr = FakePaddleOCR3([{
        "rec_boxes": [
            [20 + index, 20 + index, 200 + index, 50 + index]
            for index in range(labels)
        ],
        "rec_texts": [f"Bedroom {index + 1} Plan" for index in range(labels)],
        "rec_scores": [0.9] * labels,
    }])
    from lisno_ocr import extractor as module
    original = module._region_text_penalty
    calls = 0

    def counted(region, title_box, recognized_lines):
        nonlocal calls
        calls += 1
        return original(region, title_box, recognized_lines)

    monkeypatch.setattr(module, "_region_text_penalty", counted)

    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "labeled-plan.png"
    )[0].sections

    assert len(sections) == labels
    assert calls < labels


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


def test_pdf_dimension_budget_downscales_before_pixmap_allocation(monkeypatch, tmp_path):
    class Rect:
        width = 700
        height = 700

    scales = []

    class Pixmap:
        width = 1
        height = 1
        samples = b"\xff\xff\xff"

    class Page:
        rect = Rect()

        def get_pixmap(self, *, matrix, alpha):
            assert alpha is False
            scales.append(matrix.a)
            return Pixmap()

    class Document:
        page_count = 1

        def __iter__(self):
            return iter([Page()])

        def close(self):
            pass

    source = tmp_path / "large.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    pages = Extractor(
        ocr_engine=FakePaddleOCR3([]), max_page_pixels=1_000_000
    ).extract(source)

    assert [page.page_number for page in pages] == [1]
    assert len(scales) == 1
    assert 1.0 < scales[0] < 2.0


def test_pdf_dimension_budget_keeps_default_scale_at_exact_pixel_limit(
    monkeypatch, tmp_path
):
    class Rect:
        width = 500
        height = 500

    scales = []

    class Pixmap:
        width = 1
        height = 1
        samples = b"\xff\xff\xff"

    class Page:
        rect = Rect()

        def get_pixmap(self, *, matrix, alpha):
            assert alpha is False
            scales.append(matrix.a)
            return Pixmap()

    class Document:
        page_count = 1

        def __iter__(self):
            return iter([Page()])

        def close(self):
            pass

    source = tmp_path / "exactly-at-budget.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    Extractor(
        ocr_engine=FakePaddleOCR3([]), max_page_pixels=1_000_000
    ).extract(source)

    assert scales == [2.0]


def test_pdf_dimension_budget_rejects_before_pixmap_when_one_x_is_unsafe(
    monkeypatch, tmp_path
):
    class Rect:
        width = 10_000
        height = 10_000

    class Page:
        rect = Rect()

        def get_pixmap(self, **_kwargs):
            raise AssertionError("irreducibly oversized page must not allocate a pixmap")

    class Document:
        page_count = 1

        def __iter__(self):
            return iter([Page()])

        def close(self):
            pass

    source = tmp_path / "irreducibly-large.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    with pytest.raises(PdfRenderError, match="page is too large"):
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
    pages = Extractor().extract(FIXTURES / "model-supported-title.png")
    assert pages
    assert all(page.width > 0 and page.height > 0 for page in pages)
    assert sum(len(page.sections) for page in pages) >= 1
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

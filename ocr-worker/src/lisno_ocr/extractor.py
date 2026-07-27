from __future__ import annotations

import base64
from collections.abc import Mapping, Sequence
from collections import deque
from collections.abc import Iterator
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

import fitz
import numpy as np
from PIL import Image, UnidentifiedImageError

from .contracts import (
    Crop,
    ExtractedPage,
    ExtractedSection,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
)
from .settings import LayoutSettings
from .title_classifier import OcrLine, classify_drawing_titles


_MAX_CLASSIFIER_LINES = 2_000
_MAX_DRAWING_REGIONS = 2_000
_TEXT_DENSE_REGION_LINE_COUNT = 5
_TEXT_DENSE_REGION_AREA_RATIO = 0.12
_RESERVED_REGION_PHRASES = (
    "general notes",
    "legend",
    "key plan",
    "vicinity plan",
    "location map",
)


class Extractor:
    def __init__(self, ocr_engine: Any | None = None, render_scale: float = 2.0,
                 confidence_floor: float = 0.2, max_pdf_pages: int = 50,
                 max_page_pixels: int = 40_000_000,
                 max_output_bytes: int = 64_000_000,
                 accepted_plan_types: Sequence[str] | None = None):
        classifier_settings = LayoutSettings.from_environment()
        self._ocr_engine = ocr_engine
        self._render_scale = render_scale
        self._confidence_floor = confidence_floor
        self._max_pdf_pages = max_pdf_pages
        self._max_page_pixels = max_page_pixels
        self._max_output_bytes = max_output_bytes
        self._accepted_plan_types = tuple(
            accepted_plan_types
            if accepted_plan_types is not None
            else classifier_settings.accepted_plan_types
        )
        self._accepted_room_types = classifier_settings.accepted_room_types

    def extract(self, source_path: str | Path) -> list[ExtractedPage]:
        path = Path(source_path)
        if not path.is_file():
            raise InvalidSourceError("The extraction source does not exist.")
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            images = self._render_pdf_pages(path)
        elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            images = iter((self._open_image(path),))
        else:
            raise InvalidSourceError("The extraction source type is unsupported.")
        pages: list[ExtractedPage] = []
        remaining = self._max_output_bytes
        for page_number, image in enumerate(images, start=1):
            try:
                page, used = self._extract_page(image, page_number, remaining)
                pages.append(page)
                remaining -= used
            finally:
                image.close()
        return pages

    def _render_pdf_pages(self, path: Path) -> Iterator[Image.Image]:
        try:
            document = fitz.open(path)
        except Exception as error:
            raise PdfRenderError("The PDF could not be opened.") from error
        if document.page_count < 1:
            document.close()
            raise PdfRenderError("The PDF contains no pages.")
        if document.page_count > self._max_pdf_pages:
            document.close()
            raise PdfRenderError("The PDF contains too many pages.")
        matrix = fitz.Matrix(self._render_scale, self._render_scale)
        try:
            for page in document:
                expected_width = int(round(page.rect.width * self._render_scale))
                expected_height = int(round(page.rect.height * self._render_scale))
                if expected_width * expected_height > self._max_page_pixels:
                    raise PdfRenderError("A rendered PDF page is too large.")
                pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                try:
                    image = Image.frombytes(
                        "RGB", (pixmap.width, pixmap.height), pixmap.samples
                    )
                finally:
                    del pixmap
                yield image
        except PdfRenderError:
            raise
        except Exception as error:
            raise PdfRenderError("A PDF page could not be rendered.") from error
        finally:
            document.close()

    def _open_image(self, path: Path) -> Image.Image:
        source: Image.Image | None = None
        try:
            source = Image.open(path)
            if source.width * source.height > self._max_page_pixels:
                source.close()
                raise InvalidSourceError("The source image is too large.")
            source.load()
            converted = source.convert("RGB")
            return converted
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise InvalidSourceError("The source image could not be decoded.") from error
        finally:
            if source is not None:
                source.close()

    def _extract_page(
        self, image: Image.Image, page_number: int, remaining_bytes: int
    ) -> tuple[ExtractedPage, int]:
        recognized = self._recognize(image)
        regions = _drawing_regions(
            image, [box for box, _, _ in recognized]
        )
        eligible_lines: list[OcrLine] = []
        for box, label, confidence in recognized:
            if not label or confidence < self._confidence_floor:
                continue
            eligible_lines.append(OcrLine(box, label, confidence))
            # Keep title work bounded before the separate 500-crop output cap.
            if len(eligible_lines) >= _MAX_CLASSIFIER_LINES:
                break
        titles = classify_drawing_titles(
            eligible_lines,
            self._accepted_plan_types,
            self._accepted_room_types,
        )
        title_boxes = tuple(title.box for title in titles)
        association_lines = tuple(
            line
            for line in eligible_lines
            if not any(_boxes_overlap(line.box, box) for box in title_boxes)
        )
        region_penalties = {
            region: _region_text_penalty(
                region,
                (-1, -1, -1, -1),
                association_lines,
            )
            for region in regions
        }
        page_base64 = _png_base64(image)
        used = _decoded_base64_size(page_base64)
        _require_budget(used, remaining_bytes)
        sections: list[ExtractedSection] = []
        for title in titles:
            if len(sections) >= 500:
                break
            section = self._section_for_label(
                image,
                title.box,
                title.label,
                title.confidence,
                regions,
                region_penalties,
            )
            section_bytes = _decoded_base64_size(section.image_base64)
            _require_budget(used + section_bytes, remaining_bytes)
            sections.append(section)
            used += section_bytes
        return ExtractedPage(
            page_number=page_number,
            width=image.width,
            height=image.height,
            image_base64=page_base64,
            sections=tuple(sections),
        ), used

    def _recognize(
        self, image: Image.Image
    ) -> list[tuple[tuple[int, int, int, int], str, float]]:
        try:
            engine = self._engine()
            predict = getattr(engine, "predict", None)
            if callable(predict):
                raw = predict(input=np.asarray(image))
                return list(_parse_predict_results(raw))
            raw = engine.ocr(np.asarray(image), cls=True)
            return list(_parse_legacy_ocr_lines(raw))
        except OcrError:
            raise
        except Exception as error:
            raise OcrError("PaddleOCR could not process the source page.") from error

    def _engine(self) -> Any:
        if self._ocr_engine is not None:
            return self._ocr_engine
        try:
            from paddleocr import PaddleOCR
        except ImportError as error:
            raise OcrError(
                "PaddleOCR is not installed; install the model extra to run OCR."
            ) from error
        self._ocr_engine = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        return self._ocr_engine

    def _section_for_label(
        self,
        image: Image.Image,
        label_box: tuple[int, int, int, int],
        label: str,
        confidence: float,
        regions: list[tuple[int, int, int, int]],
        region_penalties: Mapping[
            tuple[int, int, int, int],
            tuple[int, int, float],
        ],
    ) -> ExtractedSection:
        candidate_regions = regions or [(0, 0, image.width, image.height)]
        largest_region_area = max(_box_area(region) for region in candidate_regions)
        selected = min(
            candidate_regions,
            key=lambda region: (
                *region_penalties.get(region, (0, 0, 0.0)),
                int(_box_area(region) < largest_region_area * 0.1),
                _squared_distance(label_box, region),
            ),
        )
        left, top, right, bottom = _expanded_and_clamped(
            selected, image.width, image.height, padding=16
        )
        crop = Crop(
            x=left,
            y=top,
            width=right - left,
            height=bottom - top,
        )
        return ExtractedSection(
            label=" ".join(label.split()),
            confidence=float(confidence),
            crop=crop,
            image_base64=_png_base64(image.crop((left, top, right, bottom))),
        )


def _parse_predict_results(
    raw: Any,
) -> Iterable[tuple[tuple[int, int, int, int], str, float]]:
    if not isinstance(raw, (list, tuple)):
        return
    for result in raw:
        data = _structured_result_data(result)
        boxes = data.get("rec_boxes", [])
        texts = data.get("rec_texts", [])
        scores = data.get("rec_scores", [])
        for box, text, score in zip(boxes, texts, scores):
            values = np.asarray(box).reshape(-1).tolist()
            if len(values) == 4:
                left, top, right, bottom = values
            elif len(values) >= 8 and len(values) % 2 == 0:
                xs = values[0::2]
                ys = values[1::2]
                left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
            else:
                continue
            label = " ".join(str(text).split())
            yield (
                (
                    int(round(float(left))),
                    int(round(float(top))),
                    int(round(float(right))) + 1,
                    int(round(float(bottom))) + 1,
                ),
                label,
                float(score),
            )


def _structured_result_data(result: Any) -> Mapping[str, Any]:
    if isinstance(result, Mapping):
        data: Any = result
    else:
        json_value = getattr(result, "json", None)
        data = json_value() if callable(json_value) else json_value
        if not isinstance(data, Mapping):
            data = {
                "rec_boxes": getattr(result, "rec_boxes", []),
                "rec_texts": getattr(result, "rec_texts", []),
                "rec_scores": getattr(result, "rec_scores", []),
            }
    nested = data.get("res") if isinstance(data, Mapping) else None
    return nested if isinstance(nested, Mapping) else data


def _parse_legacy_ocr_lines(
    raw: Any,
) -> Iterable[tuple[tuple[int, int, int, int], str, float]]:
    if not isinstance(raw, (list, tuple)):
        return
    lines: Any = raw
    if len(raw) == 1 and isinstance(raw[0], (list, tuple)):
        lines = raw[0]
    for line in lines:
        if not isinstance(line, (list, tuple)) or len(line) != 2:
            continue
        points, recognition = line
        if (
            not isinstance(points, (list, tuple))
            or not isinstance(recognition, (list, tuple))
            or len(recognition) < 2
        ):
            continue
        coordinates = [
            (int(round(float(point[0]))), int(round(float(point[1]))))
            for point in points
            if isinstance(point, (list, tuple)) and len(point) >= 2
        ]
        if not coordinates:
            continue
        xs = [point[0] for point in coordinates]
        ys = [point[1] for point in coordinates]
        label = " ".join(str(recognition[0]).split())
        yield (
            (min(xs), min(ys), max(xs) + 1, max(ys) + 1),
            label,
            float(recognition[1]),
        )


def _drawing_regions(
    image: Image.Image, text_boxes: list[tuple[int, int, int, int]]
) -> list[tuple[int, int, int, int]]:
    grayscale = np.asarray(image.convert("L"))
    ink = grayscale < 235
    for left, top, right, bottom in text_boxes:
        left = max(0, left - 8)
        top = max(0, top - 8)
        right = min(image.width, right + 8)
        bottom = min(image.height, bottom + 8)
        ink[top:bottom, left:right] = False

    visited = np.zeros(ink.shape, dtype=np.bool_)
    regions: list[tuple[int, int, int, int]] = []
    for start_y, start_x in np.argwhere(ink):
        y = int(start_y)
        x = int(start_x)
        if visited[y, x]:
            continue
        queue = deque([(x, y)])
        visited[y, x] = True
        min_x = max_x = x
        min_y = max_y = y
        pixels = 0
        while queue:
            current_x, current_y = queue.popleft()
            pixels += 1
            min_x = min(min_x, current_x)
            max_x = max(max_x, current_x)
            min_y = min(min_y, current_y)
            max_y = max(max_y, current_y)
            for next_x, next_y in (
                (current_x - 1, current_y),
                (current_x + 1, current_y),
                (current_x, current_y - 1),
                (current_x, current_y + 1),
            ):
                if (
                    0 <= next_x < image.width
                    and 0 <= next_y < image.height
                    and ink[next_y, next_x]
                    and not visited[next_y, next_x]
                ):
                    visited[next_y, next_x] = True
                    queue.append((next_x, next_y))
        width = max_x - min_x + 1
        height = max_y - min_y + 1
        if pixels >= 40 and width >= 12 and height >= 12:
            regions.append((min_x, min_y, max_x + 1, max_y + 1))

    if regions:
        return sorted(regions, key=_box_area, reverse=True)[:_MAX_DRAWING_REGIONS]
    ys, xs = np.nonzero(ink)
    if len(xs):
        return [
            (
                int(xs.min()),
                int(ys.min()),
                int(xs.max()) + 1,
                int(ys.max()) + 1,
            )
        ]
    return []


def _squared_distance(
    left: tuple[int, int, int, int], right: tuple[int, int, int, int]
) -> float:
    left_x = (left[0] + left[2]) / 2
    left_y = (left[1] + left[3]) / 2
    right_x = (right[0] + right[2]) / 2
    right_y = (right[1] + right[3]) / 2
    return (left_x - right_x) ** 2 + (left_y - right_y) ** 2


def _region_text_penalty(
    region: tuple[int, int, int, int],
    title_box: tuple[int, int, int, int],
    recognized_lines: Sequence[OcrLine],
) -> tuple[int, int, float]:
    left, top, right, bottom = region
    region_area = max(1, (right - left) * (bottom - top))
    contained_count = 0
    contained_area = 0
    reserved = False
    for line in recognized_lines:
        if _boxes_overlap(line.box, title_box):
            continue
        center_x = (line.box[0] + line.box[2]) / 2
        center_y = (line.box[1] + line.box[3]) / 2
        if not (left <= center_x <= right and top <= center_y <= bottom):
            continue
        contained_count += 1
        overlap_left = max(left, line.box[0])
        overlap_top = max(top, line.box[1])
        overlap_right = min(right, line.box[2])
        overlap_bottom = min(bottom, line.box[3])
        contained_area += max(0, overlap_right - overlap_left) * max(
            0, overlap_bottom - overlap_top
        )
        normalized = " ".join(line.text.casefold().split())
        if any(phrase in normalized for phrase in _RESERVED_REGION_PHRASES):
            reserved = True

    text_area_ratio = contained_area / region_area
    is_text_dense = (
        contained_count >= _TEXT_DENSE_REGION_LINE_COUNT
        or text_area_ratio >= _TEXT_DENSE_REGION_AREA_RATIO
    )
    # Sparse drawing labels do not affect association. Reserved or dense
    # text blocks sort after drawing-like regions; distance then breaks ties.
    return (
        int(reserved),
        int(is_text_dense),
        text_area_ratio if is_text_dense else 0.0,
    )


def _boxes_overlap(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
) -> bool:
    return (
        max(first[0], second[0]) < min(first[2], second[2])
        and max(first[1], second[1]) < min(first[3], second[3])
    )


def _box_area(box: tuple[int, int, int, int]) -> int:
    return max(0, box[2] - box[0]) * max(0, box[3] - box[1])


def _expanded_and_clamped(
    box: tuple[int, int, int, int],
    page_width: int,
    page_height: int,
    padding: int,
) -> tuple[int, int, int, int]:
    left = max(0, min(page_width - 1, box[0] - padding))
    top = max(0, min(page_height - 1, box[1] - padding))
    right = max(left + 1, min(page_width, box[2] + padding))
    bottom = max(top + 1, min(page_height, box[3] + padding))
    return left, top, right, bottom


def _png_base64(image: Image.Image) -> str:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return base64.b64encode(output.getvalue()).decode("ascii")


def _decoded_base64_size(value: str) -> int:
    return len(value) * 3 // 4


def _require_budget(used: int, maximum: int) -> None:
    if used > maximum:
        raise OcrError("The extracted image output is too large.")

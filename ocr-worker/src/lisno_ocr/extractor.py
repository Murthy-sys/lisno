from __future__ import annotations

import base64
from collections.abc import Mapping, Sequence
from collections import deque
from collections.abc import Iterator
from io import BytesIO
import math
from pathlib import Path
import time
from typing import Any, Iterable, Literal

import fitz
import numpy as np
from PIL import Image

from .contracts import (
    CanonicalMatch,
    Crop,
    EstimateDrawingProposal,
    EstimateTaxonomy,
    ExtractedPage,
    ExtractedSection,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
)
from .estimate_taxonomy import classify_estimate_drawing, normalize_drawing_title
from .image_formats import ImageSourceError, open_source_pages
from .settings import LayoutSettings
from .title_block import (
    extract_pdf_title_block_candidate,
    extract_title_block_candidate,
    title_block_top,
)
from .title_classifier import (
    DrawingTitle,
    OcrLine,
    classify_drawing_titles,
    is_excluded_drawing_title,
)


_MAX_CLASSIFIER_LINES = 2_000
_MAX_DRAWING_REGIONS = 2_000
_AUTOMATIC_MATCH_CONFIDENCE = 0.84
_TEXT_DENSE_REGION_LINE_COUNT = 5
_TEXT_DENSE_REGION_AREA_RATIO = 0.12
_MIN_PDF_RENDER_SCALE = 1.0
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
                 accepted_plan_types: Sequence[str] | None = None,
                 estimate_taxonomy: EstimateTaxonomy | None = None):
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
        self._estimate_taxonomy = estimate_taxonomy

    def extract(
        self,
        source_path: str | Path,
        *,
        mode: Literal["project_design", "estimate_design"] = "project_design",
        deadline: float | None = None,
    ) -> list[ExtractedPage]:
        _require_processing_time(deadline)
        path = Path(source_path)
        if not path.is_file():
            raise InvalidSourceError("The extraction source does not exist.")
        suffix = path.suffix.lower()
        if suffix == ".pdf" and mode == "estimate_design":
            return self._extract_estimate_pdf(path, deadline=deadline)
        if suffix == ".pdf":
            images = self._render_pdf_pages(path, deadline=deadline)
        elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".heic", ".heif"}:
            images = open_source_pages(
                path,
                max_page_pixels=self._max_page_pixels,
                max_pages=self._max_pdf_pages,
            )
        else:
            raise InvalidSourceError("The extraction source type is unsupported.")
        pages: list[ExtractedPage] = []
        remaining = self._max_output_bytes
        try:
            for page_number, image in enumerate(images, start=1):
                try:
                    _require_processing_time(deadline)
                    if mode == "estimate_design":
                        page, used = self._extract_estimate_page(
                            image,
                            page_number,
                            remaining,
                            embedded_title=None,
                            deadline=deadline,
                        )
                    else:
                        page, used = self._extract_page(
                            image,
                            page_number,
                            remaining,
                            deadline=deadline,
                        )
                    pages.append(page)
                    remaining -= used
                finally:
                    image.close()
        except ImageSourceError as error:
            raise InvalidSourceError(str(error)) from error
        return pages

    def _extract_estimate_pdf(
        self,
        path: Path,
        *,
        deadline: float | None,
    ) -> list[ExtractedPage]:
        _require_processing_time(deadline)
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

        pages: list[ExtractedPage] = []
        remaining = self._max_output_bytes
        try:
            for page_number, pdf_page in enumerate(document, start=1):
                _require_processing_time(deadline)
                try:
                    words = pdf_page.get_text("words")
                    embedded_title = extract_pdf_title_block_candidate(
                        words,
                        pdf_page.rect.width,
                        pdf_page.rect.height,
                    )
                except Exception:
                    embedded_title = None
                image = self._render_pdf_page(pdf_page, deadline=deadline)
                try:
                    extracted_page, used = self._extract_estimate_page(
                        image,
                        page_number,
                        remaining,
                        embedded_title=embedded_title,
                        deadline=deadline,
                    )
                    pages.append(extracted_page)
                    remaining -= used
                finally:
                    image.close()
        except (PdfRenderError, OcrError):
            raise
        except Exception as error:
            raise PdfRenderError("A PDF page could not be rendered.") from error
        finally:
            document.close()
        return pages

    def _render_pdf_pages(
        self, path: Path, *, deadline: float | None = None
    ) -> Iterator[Image.Image]:
        _require_processing_time(deadline)
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
        try:
            for page in document:
                _require_processing_time(deadline)
                image = self._render_pdf_page(page, deadline=deadline)
                _require_processing_time(deadline)
                yield image
        except (PdfRenderError, OcrError):
            raise
        except Exception as error:
            raise PdfRenderError("A PDF page could not be rendered.") from error
        finally:
            document.close()

    def _render_pdf_page(
        self,
        page: fitz.Page,
        *,
        deadline: float | None,
    ) -> Image.Image:
        scale = _pdf_render_scale(
            page.rect.width,
            page.rect.height,
            self._render_scale,
            self._max_page_pixels,
        )
        pixmap = page.get_pixmap(
            matrix=fitz.Matrix(scale, scale),
            alpha=False,
        )
        try:
            return Image.frombytes(
                "RGB",
                (pixmap.width, pixmap.height),
                pixmap.samples,
            )
        finally:
            del pixmap

    def _extract_page(
        self,
        image: Image.Image,
        page_number: int,
        remaining_bytes: int,
        deadline: float | None = None,
    ) -> tuple[ExtractedPage, int]:
        _require_processing_time(deadline)
        recognized = self._recognize(image, deadline=deadline)
        _require_processing_time(deadline)
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
        if self._estimate_taxonomy is not None:
            titles = _with_estimate_taxonomy_titles(
                titles,
                eligible_lines,
                self._estimate_taxonomy,
            )
            titles = _deduplicate_taxonomy_titles(
                titles,
                self._estimate_taxonomy,
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
        _require_processing_time(deadline)
        page_base64 = _png_base64(image)
        _require_processing_time(deadline)
        used = _decoded_base64_size(page_base64)
        _require_budget(used, remaining_bytes)
        sections: list[ExtractedSection] = []
        for title in titles:
            _require_processing_time(deadline)
            if len(sections) >= 500:
                break
            section = self._section_for_label(
                image,
                title.box,
                title.label,
                title.confidence,
                regions,
                region_penalties,
                deadline=deadline,
            )
            section_bytes = _decoded_base64_size(section.image_base64)
            _require_budget(used + section_bytes, remaining_bytes)
            sections.append(section)
            used += section_bytes
        sections = list(_deduplicate_extracted_sections(sections, titles))
        return ExtractedPage(
            page_number=page_number,
            width=image.width,
            height=image.height,
            image_base64=page_base64,
            sections=tuple(sections),
        ), used

    def _bounded_estimate_title(
        self,
        image: Image.Image,
        *,
        embedded_title: tuple[str, float] | None,
        deadline: float | None,
    ) -> tuple[str, float] | None:
        _require_processing_time(deadline)
        if embedded_title is not None:
            return embedded_title
        top = title_block_top(image.height)
        band = image.crop((0, top, image.width, image.height))
        try:
            local_lines = self._recognize(band, deadline=deadline)
        finally:
            band.close()
        recognized = [
            ((left, y1 + top, right, y2 + top), label, confidence)
            for (left, y1, right, y2), label, confidence in local_lines
            if label and confidence >= self._confidence_floor
        ]
        return extract_title_block_candidate(recognized, image.width, image.height)

    def _extract_estimate_page(
        self,
        image: Image.Image,
        page_number: int,
        remaining_bytes: int,
        *,
        embedded_title: tuple[str, float] | None,
        deadline: float | None,
    ) -> tuple[ExtractedPage, int]:
        candidate = self._bounded_estimate_title(
            image,
            embedded_title=embedded_title,
            deadline=deadline,
        )
        if candidate is None:
            title = f"Unidentified drawing — page {page_number}"
            confidence = 0.0
            proposal = _empty_estimate_proposal(title)
        else:
            title, confidence = candidate
            proposal = _estimate_proposal(title, self._estimate_taxonomy)
        _require_processing_time(deadline)
        page_base64 = _png_base64(image)
        _require_processing_time(deadline)
        # The page image is encoded once, but appears in both the page and
        # full-page section payload fields.
        used = _decoded_base64_size(page_base64) * 2
        _require_budget(used, remaining_bytes)
        section = ExtractedSection(
            label=" ".join(title.split()),
            confidence=confidence,
            crop=Crop(x=0, y=0, width=image.width, height=image.height),
            image_base64=page_base64,
            proposal=proposal,
        )
        return ExtractedPage(
            page_number=page_number,
            width=image.width,
            height=image.height,
            image_base64=page_base64,
            sections=(section,),
        ), used

    def _recognize(
        self, image: Image.Image, *, deadline: float | None = None
    ) -> list[tuple[tuple[int, int, int, int], str, float]]:
        try:
            _require_processing_time(deadline)
            engine = self._engine()
            predict = getattr(engine, "predict", None)
            if callable(predict):
                raw = predict(input=np.asarray(image))
                _require_processing_time(deadline)
                return list(_parse_predict_results(raw))
            raw = engine.ocr(np.asarray(image), cls=True)
            _require_processing_time(deadline)
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
        *,
        deadline: float | None = None,
    ) -> ExtractedSection:
        _require_processing_time(deadline)
        candidate_regions = regions or [(0, 0, image.width, image.height)]
        drawing_regions = [
            region
            for region in candidate_regions
            if not _is_page_frame(region, image.width, image.height)
        ]
        if drawing_regions:
            candidate_regions = drawing_regions
        selected = min(
            candidate_regions,
            key=lambda region: (
                region_penalties.get(region, (0, 0, 0.0))[0],
                int(_is_title_decoration(label_box, region)),
                int(_is_title_scale_fragment(label_box, region)),
                int(_box_area(region) < _box_area(label_box) * 2),
                _size_adjusted_distance(label_box, region),
                *region_penalties.get(region, (0, 0, 0.0))[1:],
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
        _require_processing_time(deadline)
        image_base64 = _png_base64(image.crop((left, top, right, bottom)))
        _require_processing_time(deadline)
        return ExtractedSection(
            label=" ".join(label.split()),
            confidence=float(confidence),
            crop=crop,
            image_base64=image_base64,
            proposal=(
                classify_estimate_drawing(label, self._estimate_taxonomy)
                if self._estimate_taxonomy is not None
                else None
            ),
        )


def _estimate_proposal(
    title: str,
    taxonomy: EstimateTaxonomy | None,
) -> EstimateDrawingProposal:
    if taxonomy is not None:
        return classify_estimate_drawing(title, taxonomy)
    return _empty_estimate_proposal(title)


def _empty_estimate_proposal(title: str) -> EstimateDrawingProposal:
    empty = CanonicalMatch(None, 0.0, (), False)
    return EstimateDrawingProposal(title, empty, empty)


def _require_processing_time(deadline: float | None) -> None:
    if deadline is not None and time.monotonic() >= deadline:
        raise OcrError("The extraction exceeded its processing time limit.")


def _pdf_render_scale(
    width: float,
    height: float,
    default_scale: float,
    max_page_pixels: int,
) -> float:
    if width <= 0 or height <= 0 or default_scale <= 0:
        raise PdfRenderError("A rendered PDF page has invalid dimensions.")
    if _scaled_page_pixels(width, height, default_scale) <= max_page_pixels:
        return default_scale

    minimum_scale = min(_MIN_PDF_RENDER_SCALE, default_scale)
    if _scaled_page_pixels(width, height, minimum_scale) > max_page_pixels:
        raise PdfRenderError("A rendered PDF page is too large.")

    lower = minimum_scale
    upper = default_scale
    for _ in range(60):
        candidate = (lower + upper) / 2
        if _scaled_page_pixels(width, height, candidate) <= max_page_pixels:
            lower = candidate
        else:
            upper = candidate
    return lower


def _scaled_page_pixels(width: float, height: float, scale: float) -> int:
    return math.ceil(width * scale) * math.ceil(height * scale)


def _with_estimate_taxonomy_titles(
    classified: Sequence[DrawingTitle],
    lines: Sequence[OcrLine],
    taxonomy: EstimateTaxonomy,
) -> tuple[DrawingTitle, ...]:
    titles = list(classified)
    existing_boxes = {title.box for title in titles}
    for line in lines:
        if line.box in existing_boxes or is_excluded_drawing_title(line.text):
            continue
        proposal = classify_estimate_drawing(line.text, taxonomy)
        if max(
            proposal.room.confidence,
            proposal.scope.confidence,
        ) < _AUTOMATIC_MATCH_CONFIDENCE:
            continue
        titles.append(
            DrawingTitle(
                line.box,
                " ".join(line.text.split()),
                float(line.confidence),
            )
        )
        existing_boxes.add(line.box)
    return tuple(sorted(titles, key=lambda title: (title.box[1], title.box[0])))


def _deduplicate_taxonomy_titles(
    titles: Sequence[DrawingTitle],
    taxonomy: EstimateTaxonomy,
) -> tuple[DrawingTitle, ...]:
    """Collapse OCR aliases for one nearby drawing, keeping best confidence.

    Taxonomy augmentation intentionally considers lines that the drawing-title
    classifier rejected.  OCR can therefore produce both a classifier title
    and a taxonomy-only alias for the same heading.  Canonical IDs make the
    comparison robust to aliases, while geometry keeps repeated panels with
    the same room/scope separate.
    """
    accepted: list[DrawingTitle] = []
    ranked = sorted(
        titles,
        key=lambda title: (-title.confidence, title.box[1], title.box[0]),
    )
    for title in ranked:
        proposal = classify_estimate_drawing(title.label, taxonomy)
        duplicate = any(
            _same_taxonomy_label(
                title.label,
                proposal,
                existing.label,
                classify_estimate_drawing(existing.label, taxonomy),
            )
            and _title_boxes_are_near(title.box, existing.box)
            for existing in accepted
        )
        if not duplicate:
            accepted.append(title)
    return tuple(sorted(accepted, key=lambda title: (title.box[1], title.box[0])))


def _same_taxonomy_label(
    first_label: str,
    first: EstimateDrawingProposal,
    second_label: str,
    second: EstimateDrawingProposal,
) -> bool:
    return normalize_drawing_title(first_label) == normalize_drawing_title(second_label) or (
        first.room.id is not None
        and first.room.id == second.room.id
        and first.scope.id is not None
        and first.scope.id == second.scope.id
    )


def _title_boxes_are_near(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
) -> bool:
    if _boxes_overlap(first, second):
        return True
    first_width = max(1, first[2] - first[0])
    second_width = max(1, second[2] - second[0])
    first_height = max(1, first[3] - first[1])
    second_height = max(1, second[3] - second[1])
    horizontal_overlap = max(0, min(first[2], second[2]) - max(first[0], second[0]))
    vertical_overlap = max(0, min(first[3], second[3]) - max(first[1], second[1]))
    vertical_gap = max(first[1], second[1]) - min(first[3], second[3])
    horizontal_gap = max(first[0], second[0]) - min(first[2], second[2])
    return (
        vertical_gap <= max(12, int(max(first_height, second_height) * 1.5))
        and horizontal_overlap / min(first_width, second_width) >= 0.3
    ) or (
        horizontal_gap <= max(12, int(max(first_width, second_width) * 1.5))
        and vertical_overlap / min(first_height, second_height) >= 0.3
    )


def _deduplicate_extracted_sections(
    sections: Sequence[ExtractedSection],
    titles: Sequence[DrawingTitle],
) -> tuple[ExtractedSection, ...]:
    """Protect the payload from repeated crops selected for nearby headings."""
    kept: list[tuple[ExtractedSection, DrawingTitle]] = []
    for section, title in zip(sections, titles):
        duplicate_index = next(
            (
                index
                for index, (existing, existing_title) in enumerate(kept)
                if _box_iou(section.crop, existing.crop) >= 0.96
                and normalize_drawing_title(title.label)
                == normalize_drawing_title(existing_title.label)
                and _title_boxes_are_near(title.box, existing_title.box)
            ),
            None,
        )
        if duplicate_index is None:
            kept.append((section, title))
        elif section.confidence > kept[duplicate_index][0].confidence:
            kept[duplicate_index] = (section, title)
    return tuple(section for section, _title in kept)


def _box_iou(first: Crop, second: Crop) -> float:
    left = max(first.x, second.x)
    top = max(first.y, second.y)
    right = min(first.x + first.width, second.x + second.width)
    bottom = min(first.y + first.height, second.y + second.height)
    intersection = max(0, right - left) * max(0, bottom - top)
    union = first.width * first.height + second.width * second.height - intersection
    return intersection / union if union else 0.0


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


def _size_adjusted_distance(
    title: tuple[int, int, int, int],
    region: tuple[int, int, int, int],
) -> float:
    return _squared_distance(title, region) / math.sqrt(max(1, _box_area(region)))


def _is_title_decoration(
    title: tuple[int, int, int, int],
    region: tuple[int, int, int, int],
) -> bool:
    title_height = max(1, title[3] - title[1])
    region_height = region[3] - region[1]
    vertical_gap = region[1] - title[3]
    return (
        -title_height <= vertical_gap <= max(40, title_height * 4)
        and region_height <= title_height * 2
    )


def _is_title_scale_fragment(
    title: tuple[int, int, int, int],
    region: tuple[int, int, int, int],
) -> bool:
    title_height = max(1, title[3] - title[1])
    return region[3] - region[1] <= max(24, title_height * 2)


def _is_page_frame(
    region: tuple[int, int, int, int],
    page_width: int,
    page_height: int,
) -> bool:
    left, top, right, bottom = region
    near_vertical_edges = top <= page_height * 0.03 and bottom >= page_height * 0.97
    near_horizontal_edges = left <= page_width * 0.03 and right >= page_width * 0.97
    return (
        near_vertical_edges and bottom - top >= page_height * 0.85
    ) or (
        near_horizontal_edges and right - left >= page_width * 0.85
    )


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

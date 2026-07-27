from __future__ import annotations

import base64
from collections import deque
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


class Extractor:
    def __init__(self, ocr_engine: Any | None = None, render_scale: float = 2.0):
        self._ocr_engine = ocr_engine
        self._render_scale = render_scale

    def extract(self, source_path: str | Path) -> list[ExtractedPage]:
        path = Path(source_path)
        if not path.is_file():
            raise InvalidSourceError("The extraction source does not exist.")
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            images = self._render_pdf(path)
        elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            images = [self._open_image(path)]
        else:
            raise InvalidSourceError("The extraction source type is unsupported.")
        return [
            self._extract_page(image, page_number)
            for page_number, image in enumerate(images, start=1)
        ]

    def _render_pdf(self, path: Path) -> list[Image.Image]:
        try:
            document = fitz.open(path)
        except Exception as error:
            raise PdfRenderError("The PDF could not be opened.") from error
        try:
            if document.page_count < 1:
                raise PdfRenderError("The PDF contains no pages.")
            matrix = fitz.Matrix(self._render_scale, self._render_scale)
            images: list[Image.Image] = []
            for page in document:
                pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                image = Image.frombytes(
                    "RGB", (pixmap.width, pixmap.height), pixmap.samples
                )
                images.append(image)
            return images
        except PdfRenderError:
            raise
        except Exception as error:
            raise PdfRenderError("A PDF page could not be rendered.") from error
        finally:
            document.close()

    def _open_image(self, path: Path) -> Image.Image:
        try:
            with Image.open(path) as source:
                source.load()
                return source.convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise InvalidSourceError("The source image could not be decoded.") from error

    def _extract_page(self, image: Image.Image, page_number: int) -> ExtractedPage:
        labels = self._recognize(image)
        regions = _drawing_regions(image, [box for box, _, _ in labels])
        sections = tuple(
            self._section_for_label(image, box, label, confidence, regions)
            for box, label, confidence in labels
            if label
        )
        return ExtractedPage(
            page_number=page_number,
            width=image.width,
            height=image.height,
            image_base64=_png_base64(image),
            sections=sections,
        )

    def _recognize(
        self, image: Image.Image
    ) -> list[tuple[tuple[int, int, int, int], str, float]]:
        try:
            engine = self._engine()
            raw = engine.ocr(np.asarray(image), cls=True)
            return list(_parse_ocr_lines(raw))
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
        self._ocr_engine = PaddleOCR(use_doc_orientation_classify=False)
        return self._ocr_engine

    def _section_for_label(
        self,
        image: Image.Image,
        label_box: tuple[int, int, int, int],
        label: str,
        confidence: float,
        regions: list[tuple[int, int, int, int]],
    ) -> ExtractedSection:
        selected = min(
            regions or [(0, 0, image.width, image.height)],
            key=lambda region: _squared_distance(label_box, region),
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


def _parse_ocr_lines(
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
        return regions
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

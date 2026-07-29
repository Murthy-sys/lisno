from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal


FailureCode = Literal[
    "PDF_RENDER_FAILED",
    "OCR_FAILED",
    "INVALID_SOURCE",
    "RESULT_REJECTED",
]


@dataclass(frozen=True, slots=True)
class Crop:
    x: int
    y: int
    width: int
    height: int

    def to_payload(self) -> dict[str, int]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }


@dataclass(frozen=True, slots=True)
class TaxonomyTerm:
    id: str
    label: str
    aliases: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class EstimateTaxonomy:
    rooms: tuple[TaxonomyTerm, ...]
    scopes: tuple[TaxonomyTerm, ...]


@dataclass(frozen=True, slots=True)
class CanonicalMatch:
    id: str | None
    confidence: float
    evidence: tuple[str, ...]
    ambiguous: bool

    def to_payload(self) -> dict[str, object]:
        return {
            "id": self.id,
            "confidence": self.confidence,
            "evidence": list(self.evidence),
            "ambiguous": self.ambiguous,
        }


@dataclass(frozen=True, slots=True)
class EstimateDrawingProposal:
    detected_title: str
    room: CanonicalMatch
    scope: CanonicalMatch

    def to_payload(self) -> dict[str, object]:
        return {
            "detectedTitle": self.detected_title,
            "room": self.room.to_payload(),
            "scope": self.scope.to_payload(),
        }


@dataclass(frozen=True, slots=True)
class ExtractedSection:
    label: str
    confidence: float
    crop: Crop
    image_base64: str
    proposal: EstimateDrawingProposal | None = None

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "label": self.label,
            "confidence": self.confidence,
            "crop": self.crop.to_payload(),
            "imageBase64": self.image_base64,
        }
        if self.proposal is not None:
            payload["proposal"] = self.proposal.to_payload()
        return payload


@dataclass(frozen=True, slots=True)
class ExtractedPage:
    page_number: int
    width: int
    height: int
    image_base64: str
    sections: tuple[ExtractedSection, ...]

    def to_payload(self) -> dict[str, object]:
        return {
            "pageNumber": self.page_number,
            "width": self.width,
            "height": self.height,
            "imageBase64": self.image_base64,
            "sections": [section.to_payload() for section in self.sections],
        }


@dataclass(frozen=True, slots=True)
class ClaimedJob:
    id: str
    claim_token: str
    source_url: str
    source_filename: str
    source_mime_type: str
    lease_duration_seconds: float


@dataclass(frozen=True, slots=True)
class WorkerFailure:
    code: FailureCode
    message: str


@dataclass(frozen=True, slots=True)
class WorkerSettings:
    api_base_url: str
    worker_token: str
    poll_seconds: float = 5.0
    request_timeout_seconds: float = 60.0
    confidence_floor: float = 0.2
    max_pdf_pages: int = 50
    max_page_pixels: int = 40_000_000
    max_output_bytes: int = 40 * 1024 * 1024
    max_processing_seconds: float = 900.0

    @classmethod
    def from_environment(cls) -> WorkerSettings:
        api_base_url = os.environ.get(
            "OCR_API_BASE_URL", "http://127.0.0.1:3000/api/v1"
        ).rstrip("/")
        worker_token = os.environ.get("OCR_WORKER_TOKEN", "")
        if len(worker_token) < 32:
            raise ValueError("OCR_WORKER_TOKEN must contain at least 32 characters.")
        poll_seconds = _positive_float("OCR_POLL_SECONDS", 5.0)
        timeout_seconds = _positive_float("OCR_REQUEST_TIMEOUT_SECONDS", 60.0)
        confidence_floor = _bounded_float("OCR_CONFIDENCE_FLOOR", 0.2, 0.0, 1.0)
        max_pdf_pages = _positive_int("OCR_MAX_PDF_PAGES", 50)
        max_page_pixels = _positive_int("OCR_MAX_PAGE_PIXELS", 40_000_000)
        max_output_bytes = _bounded_positive_int(
            "OCR_MAX_OUTPUT_BYTES", 40 * 1024 * 1024, 44 * 1024 * 1024
        )
        max_processing_seconds = _positive_float("OCR_MAX_PROCESSING_SECONDS", 900.0)
        return cls(
            api_base_url=api_base_url,
            worker_token=worker_token,
            poll_seconds=poll_seconds,
            request_timeout_seconds=timeout_seconds,
            confidence_floor=confidence_floor,
            max_pdf_pages=max_pdf_pages,
            max_page_pixels=max_page_pixels,
            max_output_bytes=max_output_bytes,
            max_processing_seconds=max_processing_seconds,
        )


class ExtractionError(Exception):
    """A safe, classifiable extraction failure."""


class PdfRenderError(ExtractionError):
    pass


class OcrError(ExtractionError):
    pass


class InvalidSourceError(ExtractionError):
    pass


class ResultRejectedError(ExtractionError):
    pass


def _positive_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    value = default if raw is None else float(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive.")
    return value


def _positive_int(name: str, default: int) -> int:
    value = int(os.environ.get(name, str(default)))
    if value <= 0:
        raise ValueError(f"{name} must be positive.")
    return value


def _bounded_positive_int(name: str, default: int, maximum: int) -> int:
    value = _positive_int(name, default)
    if value > maximum:
        raise ValueError(f"{name} must not exceed {maximum}.")
    return value


def _bounded_float(name: str, default: float, minimum: float, maximum: float) -> float:
    value = float(os.environ.get(name, str(default)))
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return value

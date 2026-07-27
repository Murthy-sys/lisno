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
class ExtractedSection:
    label: str
    confidence: float
    crop: Crop
    image_base64: str

    def to_payload(self) -> dict[str, object]:
        return {
            "label": self.label,
            "confidence": self.confidence,
            "crop": self.crop.to_payload(),
            "imageBase64": self.image_base64,
        }


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
        return cls(
            api_base_url=api_base_url,
            worker_token=worker_token,
            poll_seconds=poll_seconds,
            request_timeout_seconds=timeout_seconds,
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

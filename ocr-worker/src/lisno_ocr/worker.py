from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Protocol, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from uuid import uuid4

from .contracts import (
    ClaimedJob,
    ExtractedPage,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
    ResultRejectedError,
    WorkerFailure,
    WorkerSettings,
)
from .extractor import Extractor


class Api(Protocol):
    def claim(self) -> ClaimedJob | None: ...
    def download(self, claimed: ClaimedJob) -> Path: ...
    def cleanup(self, source_path: Path) -> None: ...
    def complete(self, job_id: str, pages: Sequence[ExtractedPage]) -> None: ...
    def fail(self, job_id: str, failure: WorkerFailure) -> None: ...
    def heartbeat(self, job_id: str) -> float: ...


class PageExtractor(Protocol):
    def extract(self, source_path: str | Path) -> list[ExtractedPage]: ...


class WorkerApi:
    def __init__(self, settings: WorkerSettings):
        self._settings = settings
        self._claim_tokens: dict[str, str] = {}

    def claim(self) -> ClaimedJob | None:
        status, payload = self._request_json(
            "POST", "/internal/extraction-jobs/claim"
        )
        if status == 204:
            return None
        data = payload.get("data", {})
        job_id = _required_string(data, "id")
        claim_token = _required_string(data, "claimToken")
        source_url = _required_string(data, "sourceUrl")
        filename = str(data.get("source", {}).get("filename", "source"))
        mime_type = _required_string(data.get("source", {}), "mimeType")
        lease_duration_ms = _required_positive_number(data, "leaseDurationMs")
        self._claim_tokens[job_id] = claim_token
        return ClaimedJob(
            id=job_id,
            claim_token=claim_token,
            source_url=source_url,
            source_filename=filename,
            source_mime_type=mime_type,
            lease_duration_seconds=lease_duration_ms / 1000,
        )

    def download(self, claimed: ClaimedJob) -> Path:
        suffix = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
        }.get(claimed.source_mime_type, ".bin")
        return self._download_source(
            claimed.source_url,
            suffix,
            claimed.claim_token,
        )

    def cleanup(self, source_path: Path) -> None:
        try:
            os.unlink(source_path)
        except FileNotFoundError:
            pass

    def complete(self, job_id: str, pages: Sequence[ExtractedPage]) -> None:
        result = {
            "resultId": str(uuid4()),
            "pages": [page.to_payload() for page in pages],
        }
        self._request_json(
            "POST",
            f"/internal/extraction-jobs/{job_id}/complete",
            result,
            claim_token=self._claim_tokens.get(job_id),
        )
        self._claim_tokens.pop(job_id, None)

    def fail(self, job_id: str, failure: WorkerFailure) -> None:
        self._request_json(
            "POST",
            f"/internal/extraction-jobs/{job_id}/fail",
            {"code": failure.code, "message": failure.message},
            claim_token=self._claim_tokens.get(job_id),
        )
        self._claim_tokens.pop(job_id, None)

    def heartbeat(self, job_id: str) -> float:
        _status, payload = self._request_json(
            "POST",
            f"/internal/extraction-jobs/{job_id}/heartbeat",
            claim_token=self._claim_tokens.get(job_id),
        )
        return _required_positive_number(
            payload.get("data", {}), "leaseDurationMs"
        ) / 1000

    def _download_source(
        self, source_url: str, suffix: str, claim_token: str
    ) -> Path:
        request = Request(
            urljoin(self._settings.api_base_url + "/", source_url),
            headers={
                "Authorization": f"Bearer {self._settings.worker_token}",
                "X-Extraction-Claim-Token": claim_token,
            },
            method="GET",
        )
        try:
            with urlopen(
                request, timeout=self._settings.request_timeout_seconds
            ) as response:
                data = response.read()
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            raise InvalidSourceError("The source file could not be downloaded.") from error
        if not data:
            raise InvalidSourceError("The downloaded source file is empty.")
        handle = tempfile.NamedTemporaryFile(
            prefix="lisno-ocr-", suffix=suffix, delete=False
        )
        try:
            handle.write(data)
        finally:
            handle.close()
        return Path(handle.name)

    def _request_json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        claim_token: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        headers = {
            "Authorization": f"Bearer {self._settings.worker_token}",
            "Accept": "application/json",
        }
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if claim_token:
            headers["X-Extraction-Claim-Token"] = claim_token
        request = Request(
            urljoin(self._settings.api_base_url + "/", path.lstrip("/")),
            data=encoded,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(
                request, timeout=self._settings.request_timeout_seconds
            ) as response:
                status = response.status
                data = response.read()
        except HTTPError as error:
            if 400 <= error.code < 500:
                raise ResultRejectedError(
                    f"The backend rejected the worker result ({error.code})."
                ) from error
            raise OcrError("The backend worker API is unavailable.") from error
        except (URLError, TimeoutError, OSError) as error:
            raise OcrError("The backend worker API is unavailable.") from error
        if status == 204 or not data:
            return status, {}
        try:
            return status, json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ResultRejectedError(
                "The backend returned an invalid worker response."
            ) from error


def run_worker(
    settings: WorkerSettings,
    *,
    api: Api | None = None,
    extractor: PageExtractor | None = None,
    sleep: Callable[[float], None] = time.sleep,
    max_iterations: int | None = None,
) -> None:
    worker_api = api or WorkerApi(settings)
    page_extractor = extractor or Extractor(
        confidence_floor=settings.confidence_floor,
        max_pdf_pages=settings.max_pdf_pages,
        max_page_pixels=settings.max_page_pixels,
        max_output_bytes=settings.max_output_bytes,
    )
    iterations = 0
    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        claimed = worker_api.claim()
        if claimed is None:
            sleep(settings.poll_seconds)
            continue
        source_path: Path | None = None
        stop_heartbeat = threading.Event()
        heartbeat = threading.Thread(
            target=_heartbeat_loop,
            args=(
                worker_api,
                claimed.id,
                claimed.lease_duration_seconds,
                settings.max_processing_seconds,
                stop_heartbeat,
            ),
            daemon=True,
        )
        heartbeat.start()
        try:
            source_path = worker_api.download(claimed)
            worker_api.complete(
                claimed.id, page_extractor.extract(source_path)
            )
        except Exception as error:
            _report_failure_with_retry(
                worker_api,
                claimed.id,
                classify_failure(error),
                sleep,
            )
        finally:
            stop_heartbeat.set()
            heartbeat.join(timeout=min(claimed.lease_duration_seconds * 0.4, 1.0))
            if source_path is not None:
                worker_api.cleanup(source_path)


def _heartbeat_loop(
    api: Api,
    job_id: str,
    lease_duration_seconds: float,
    max_processing_seconds: float,
    stop: threading.Event,
) -> None:
    deadline = time.monotonic() + max_processing_seconds
    lease_duration = lease_duration_seconds
    while time.monotonic() < deadline:
        interval = max(0.01, min(60.0, lease_duration * 0.4))
        if stop.wait(interval):
            break
        try:
            lease_duration = api.heartbeat(job_id)
        except Exception:
            # Completion/failure remains claim-token guarded; a transient heartbeat
            # outage must not terminate the polling process.
            continue


def _report_failure_with_retry(
    api: Api,
    job_id: str,
    failure: WorkerFailure,
    sleep: Callable[[float], None],
    attempts: int = 3,
    initial_backoff_seconds: float = 1.0,
) -> bool:
    for attempt in range(attempts):
        try:
            api.fail(job_id, failure)
            return True
        except Exception:
            if attempt + 1 < attempts:
                sleep(initial_backoff_seconds * (2**attempt))
    return False


def classify_failure(error: Exception) -> WorkerFailure:
    if isinstance(error, PdfRenderError):
        code = "PDF_RENDER_FAILED"
    elif isinstance(error, InvalidSourceError):
        code = "INVALID_SOURCE"
    elif isinstance(error, ResultRejectedError):
        code = "RESULT_REJECTED"
    else:
        code = "OCR_FAILED"
    message = _safe_message(error)
    return WorkerFailure(code=code, message=message)


def _safe_message(error: Exception) -> str:
    message = " ".join(str(error).split())
    message = message.partition("Traceback")[0].strip()
    if not message:
        message = "The OCR worker could not process the source."
    return message[:500]


def _required_string(data: dict[str, Any], field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value:
        raise ResultRejectedError(
            f"The backend worker response omitted {field}."
        )
    return value


def _required_positive_number(data: dict[str, Any], field: str) -> float:
    value = data.get(field)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        raise ResultRejectedError(
            f"The backend worker response omitted {field}."
        )
    return float(value)


def main() -> None:
    run_worker(WorkerSettings.from_environment())


if __name__ == "__main__":
    main()

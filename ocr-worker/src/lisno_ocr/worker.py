from __future__ import annotations

from contextlib import contextmanager
from http.client import HTTPException
import json
import math
import os
import re
import signal
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterator, Protocol, Sequence
from uuid import uuid4

from .contracts import (
    ClaimedJob,
    EstimateTaxonomy,
    ExtractedPage,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
    ResultRejectedError,
    TaxonomyTerm,
    WorkerFailure,
    WorkerSettings,
)
from .extractor import Extractor
from .transport import bounded_chunks, open_response, source_url


class Api(Protocol):
    def claim(self) -> ClaimedJob | None: ...
    def download(self, claimed: ClaimedJob) -> Path: ...
    def cleanup(self, source_path: Path) -> None: ...
    def complete(self, job_id: str, pages: Sequence[ExtractedPage]) -> None: ...
    def fail(self, job_id: str, failure: WorkerFailure) -> None: ...
    def heartbeat(self, job_id: str) -> float: ...


class PageExtractor(Protocol):
    def extract(
        self,
        source_path: str | Path,
        *,
        mode: str = "project_design",
        deadline: float | None = None,
    ) -> list[ExtractedPage]: ...


class WorkerApi:
    def __init__(self, settings: WorkerSettings):
        self._settings = settings
        self._claim_tokens: dict[str, str] = {}
        self._claim_kinds: dict[str, str] = {}

    def claim(self) -> ClaimedJob | None:
        status, payload = self._request_json(
            "POST", "/internal/extraction-jobs/claim"
        )
        if status == 204:
            return None
        data = payload.get("data", {})
        job_id = _required_string(data, "id")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id):
            raise ResultRejectedError("The backend returned an invalid worker job ID.")
        claim_token = _required_string(data, "claimToken")
        source_url = _required_string(data, "sourceUrl")
        kind = data.get("kind", "project_design")
        if kind not in ("project_design", "estimate_design"):
            raise ResultRejectedError("The backend worker response used an unknown job kind.")
        if kind == "estimate_design":
            filename = _required_string(data, "sourceFilename")
            mime_type = _required_string(data, "sourceMimeType")
            taxonomy = _estimate_taxonomy(data.get("taxonomy"))
        else:
            filename = str(data.get("source", {}).get("filename", "source"))
            mime_type = _required_string(data.get("source", {}), "mimeType")
            taxonomy = None
        lease_duration_ms = _required_positive_number(data, "leaseDurationMs")
        self._claim_tokens[job_id] = claim_token
        self._claim_kinds[job_id] = kind
        return ClaimedJob(
            id=job_id,
            claim_token=claim_token,
            source_url=source_url,
            source_filename=filename,
            source_mime_type=mime_type,
            lease_duration_seconds=lease_duration_ms / 1000,
            kind=kind,
            taxonomy=taxonomy,
        )

    def download(self, claimed: ClaimedJob) -> Path:
        try:
            validated_url = source_url(
                self._settings.api_base_url, claimed.source_url, claimed.id
            )
        except ValueError as error:
            raise InvalidSourceError("The source download address is invalid.") from error
        suffix = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/tiff": ".tiff",
            "image/heic": ".heic",
            "image/heif": ".heif",
        }.get(claimed.source_mime_type, ".bin")
        return self._download_source(
            validated_url,
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
        if self._claim_kinds.get(job_id) == "estimate_design":
            result["kind"] = "estimate_design"
        self._request_json(
            "POST",
            f"/internal/extraction-jobs/{job_id}/complete",
            result,
            claim_token=self._claim_tokens.get(job_id),
        )
        self._claim_tokens.pop(job_id, None)
        self._claim_kinds.pop(job_id, None)

    def fail(self, job_id: str, failure: WorkerFailure) -> None:
        self._request_json(
            "POST",
            f"/internal/extraction-jobs/{job_id}/fail",
            {"code": failure.code, "message": failure.message},
            claim_token=self._claim_tokens.get(job_id),
        )
        self._claim_tokens.pop(job_id, None)
        self._claim_kinds.pop(job_id, None)

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
        destination: Path | None = None
        try:
            with open_response(source_url, "GET", {
                "Authorization": f"Bearer {self._settings.worker_token}",
                "X-Extraction-Claim-Token": claim_token,
                "Accept-Encoding": "identity",
            }, None, self._settings.request_timeout_seconds
            ) as response:
                if response.status != 200:
                    raise InvalidSourceError("The source file could not be downloaded.")
                with tempfile.NamedTemporaryFile(
                    prefix="lisno-ocr-", suffix=suffix, delete=False
                ) as handle:
                    destination = Path(handle.name)
                    total = 0
                    for chunk in bounded_chunks(response, self._settings.max_source_bytes):
                        handle.write(chunk)
                        total += len(chunk)
                    if not total:
                        raise InvalidSourceError("The downloaded source file is empty.")
            result = destination
            destination = None
            return result
        except (HTTPException, TimeoutError, OSError, ValueError) as error:
            raise InvalidSourceError("The source file could not be downloaded.") from error
        finally:
            if destination is not None:
                self.cleanup(destination)

    def _request_json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        claim_token: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        if not re.fullmatch(
            r"/internal/extraction-jobs/(?:claim|[A-Za-z0-9_-]{1,128}/(?:heartbeat|complete|fail))",
            path,
        ):
            raise ResultRejectedError("The worker request path is invalid.")
        headers = {
            "Authorization": f"Bearer {self._settings.worker_token}",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        }
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if claim_token:
            headers["X-Extraction-Claim-Token"] = claim_token
        try:
            with open_response(
                self._settings.api_base_url.rstrip("/") + "/" + path.lstrip("/"),
                method, headers, encoded, self._settings.request_timeout_seconds,
            ) as response:
                status = response.status
                if 300 <= status < 500:
                    raise ResultRejectedError("The backend rejected the worker request.")
                if status >= 500:
                    raise OcrError("The backend worker API is unavailable.")
                data = b"".join(bounded_chunks(response, 1024 * 1024))
        except (HTTPException, TimeoutError, OSError) as error:
            raise OcrError("The backend worker API is unavailable.") from error
        except ValueError as error:
            raise ResultRejectedError("The backend returned an invalid worker response.") from error
        if status == 204 or not data:
            return status, {}
        try:
            payload = json.loads(data)
            if not isinstance(payload, dict):
                raise ValueError
            return status, payload
        except (ValueError, UnicodeDecodeError, RecursionError) as error:
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
    iterations = 0
    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        claimed = worker_api.claim()
        if claimed is None:
            sleep(settings.poll_seconds)
            continue
        source_path: Path | None = None
        extraction_deadline = time.monotonic() + settings.max_processing_seconds
        stop_heartbeat = threading.Event()
        heartbeat = threading.Thread(
            target=_heartbeat_loop,
            args=(
                worker_api,
                claimed.id,
                claimed.lease_duration_seconds,
                extraction_deadline,
                stop_heartbeat,
            ),
            daemon=True,
        )
        heartbeat.start()
        try:
            source_path = worker_api.download(claimed)
            page_extractor = extractor or Extractor(
                confidence_floor=settings.confidence_floor,
                max_pdf_pages=settings.max_pdf_pages,
                max_page_pixels=settings.max_page_pixels,
                max_output_bytes=settings.max_output_bytes,
                estimate_taxonomy=claimed.taxonomy,
            )
            worker_api.complete(
                claimed.id,
                _extract_before_deadline(
                    page_extractor,
                    source_path,
                    mode=claimed.kind,
                    deadline=extraction_deadline,
                ),
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
    deadline: float,
    stop: threading.Event,
) -> None:
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


def _extract_before_deadline(
    page_extractor: PageExtractor,
    source_path: Path,
    *,
    mode: str,
    deadline: float,
) -> list[ExtractedPage]:
    if time.monotonic() >= deadline:
        raise OcrError("The extraction exceeded its processing time limit.")
    with _interrupt_at_deadline(deadline):
        pages = page_extractor.extract(source_path, mode=mode, deadline=deadline)
    if time.monotonic() >= deadline:
        raise OcrError("The extraction exceeded its processing time limit.")
    return pages


@contextmanager
def _interrupt_at_deadline(deadline: float) -> Iterator[None]:
    """Interrupt extraction on supported main-thread platforms.

    Existing SIGALRM state is suspended during extraction and restored with its
    elapsed delay accounted for before control returns to the caller.
    """
    if time.monotonic() >= deadline:
        raise OcrError("The extraction exceeded its processing time limit.")
    setitimer = getattr(signal, "setitimer", None)
    getitimer = getattr(signal, "getitimer", None)
    sigalrm = getattr(signal, "SIGALRM", None)
    itimer_real = getattr(signal, "ITIMER_REAL", None)
    if (
        not callable(setitimer)
        or not callable(getitimer)
        or sigalrm is None
        or itimer_real is None
        or threading.current_thread() is not threading.main_thread()
    ):
        yield
        return
    try:
        previous_delay, previous_interval = getitimer(itimer_real)
    except (OSError, ValueError):
        yield
        return
    previous_handler = signal.getsignal(sigalrm)
    ownership_started_at = time.monotonic()

    def interrupt(_signum: int, _frame: object) -> None:
        raise OcrError("The extraction exceeded its processing time limit.")

    def restore_previous_timer() -> None:
        elapsed = time.monotonic() - ownership_started_at
        if previous_delay <= 0:
            restored_delay = 0.0
        elif previous_interval <= 0:
            restored_delay = max(0.0, previous_delay - elapsed)
        elif elapsed < previous_delay:
            restored_delay = previous_delay - elapsed
        else:
            restored_delay = previous_interval - (
                (elapsed - previous_delay) % previous_interval
            )
        setitimer(itimer_real, restored_delay, previous_interval)

    handler_installed = False
    try:
        try:
            signal.signal(sigalrm, interrupt)
            handler_installed = True
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise OcrError("The extraction exceeded its processing time limit.")
            setitimer(itimer_real, remaining)
        except (OSError, ValueError):
            if handler_installed:
                try:
                    setitimer(itimer_real, 0.0)
                finally:
                    try:
                        signal.signal(sigalrm, previous_handler)
                    finally:
                        restore_previous_timer()
                    handler_installed = False
        yield
    finally:
        if handler_installed:
            try:
                setitimer(itimer_real, 0.0)
            finally:
                try:
                    signal.signal(sigalrm, previous_handler)
                finally:
                    restore_previous_timer()


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
        message = "The source PDF could not be rendered."
    elif isinstance(error, InvalidSourceError):
        code = "INVALID_SOURCE"
        message = "The source file could not be downloaded or decoded."
    elif isinstance(error, ResultRejectedError):
        code = "RESULT_REJECTED"
        message = "The backend rejected the extraction result."
    else:
        code = "OCR_FAILED"
        message = "The OCR worker could not process the source."
    return WorkerFailure(code=code, message=message)


def _required_string(data: dict[str, Any], field: str) -> str:
    value = data.get(field) if isinstance(data, dict) else None
    if not isinstance(value, str) or not value:
        raise ResultRejectedError(
            f"The backend worker response omitted {field}."
        )
    return value


def _required_positive_number(data: dict[str, Any], field: str) -> float:
    value = data.get(field) if isinstance(data, dict) else None
    if (
        not isinstance(value, (int, float)) or isinstance(value, bool)
        or not math.isfinite(value) or value <= 0
    ):
        raise ResultRejectedError(
            f"The backend worker response omitted {field}."
        )
    return float(value)


def _estimate_taxonomy(value: Any) -> EstimateTaxonomy:
    if not isinstance(value, dict):
        raise ResultRejectedError("The backend worker response omitted taxonomy.")

    def terms(field: str) -> tuple[TaxonomyTerm, ...]:
        raw = value.get(field)
        if not isinstance(raw, list):
            raise ResultRejectedError(
                f"The backend worker response omitted taxonomy.{field}."
            )
        parsed = []
        for item in raw:
            if not isinstance(item, dict):
                raise ResultRejectedError("The backend worker taxonomy is invalid.")
            aliases = item.get("aliases")
            if not isinstance(aliases, list) or not all(
                isinstance(alias, str) and alias for alias in aliases
            ):
                raise ResultRejectedError("The backend worker taxonomy is invalid.")
            parsed.append(
                TaxonomyTerm(
                    id=_required_string(item, "id"),
                    label=_required_string(item, "label"),
                    aliases=tuple(aliases),
                )
            )
        return tuple(parsed)

    return EstimateTaxonomy(rooms=terms("rooms"), scopes=terms("scopes"))


def main() -> None:
    run_worker(WorkerSettings.from_environment())


if __name__ == "__main__":
    main()

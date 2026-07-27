from pathlib import Path

import pytest
import time

from lisno_ocr.contracts import (
    ClaimedJob,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
    ResultRejectedError,
    WorkerSettings,
)
from lisno_ocr.worker import WorkerApi, classify_failure, run_worker


FIXTURE = Path(__file__).parent / "fixtures" / "labeled-plan.png"


class FakeApi:
    def __init__(
        self,
        jobs,
        *,
        download_error=None,
        complete_errors=None,
        fail_errors=None,
    ):
        self.jobs = list(jobs)
        self.download_error = download_error
        self.complete_errors = list(complete_errors or [])
        self.fail_errors = list(fail_errors or [])
        self.downloaded = []
        self.cleaned = []
        self.completed = []
        self.failed = []
        self.heartbeats = []

    def claim(self):
        return self.jobs.pop(0) if self.jobs else None

    def download(self, claimed):
        self.downloaded.append(claimed.id)
        if self.download_error:
            raise self.download_error
        return FIXTURE

    def cleanup(self, source_path):
        self.cleaned.append(source_path)

    def complete(self, job_id, pages):
        if self.complete_errors:
            error = self.complete_errors.pop(0)
            if error:
                raise error
        self.completed.append((job_id, pages))

    def fail(self, job_id, failure):
        self.failed.append((job_id, failure))
        if self.fail_errors:
            error = self.fail_errors.pop(0)
            if error:
                raise error

    def heartbeat(self, job_id):
        self.heartbeats.append(job_id)
        return 0.06


class FakeExtractor:
    def __init__(self, pages=None, error=None):
        self.pages = pages or []
        self.error = error

    def extract(self, source_path):
        assert source_path == FIXTURE
        if self.error:
            raise self.error
        return self.pages


class ScriptedExtractor:
    def __init__(self, results):
        self.results = list(results)

    def extract(self, source_path):
        assert source_path == FIXTURE
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def job():
    return ClaimedJob(
        id="job-1",
        claim_token="claim-1",
        source_url="/api/v1/internal/extraction-jobs/job-1/source",
        source_filename="labeled-plan.png",
        source_mime_type="image/png",
        lease_duration_seconds=0.06,
    )


def second_job():
    return ClaimedJob(
        id="job-2",
        claim_token="claim-2",
        source_url="/api/v1/internal/extraction-jobs/job-2/source",
        source_filename="labeled-plan.png",
        source_mime_type="image/png",
        lease_duration_seconds=0.06,
    )


def settings():
    return WorkerSettings(
        api_base_url="http://backend.example/api/v1",
        worker_token="worker-token-with-at-least-32-characters",
        poll_seconds=2.5,
        request_timeout_seconds=30,
    )


def test_settings_does_not_require_a_duplicate_backend_lease_value(monkeypatch):
    monkeypatch.setenv("OCR_WORKER_TOKEN", "worker-token-with-at-least-32-characters")
    monkeypatch.setenv("OCR_LEASE_SECONDS", "60")
    assert WorkerSettings.from_environment().max_processing_seconds == 900


def test_settings_bounds_output_for_base64_json_transport(monkeypatch):
    monkeypatch.setenv("OCR_WORKER_TOKEN", "worker-token-with-at-least-32-characters")
    assert WorkerSettings.from_environment().max_output_bytes == 40 * 1024 * 1024
    monkeypatch.setenv("OCR_MAX_OUTPUT_BYTES", str(44 * 1024 * 1024 + 1))
    with pytest.raises(ValueError, match="must not exceed"):
        WorkerSettings.from_environment()


def test_api_claim_returns_metadata_without_downloading_source():
    class ClaimOnlyApi(WorkerApi):
        def _request_json(self, *_args, **_kwargs):
            return 200, {
                "data": {
                    "id": "job-1",
                    "claimToken": "claim-1",
                    "sourceUrl": "/api/v1/internal/extraction-jobs/job-1/source",
                    "source": {"filename": "plan.pdf", "mimeType": "application/pdf"},
                    "leaseDurationMs": 300000,
                }
            }

        def download(self, _claimed):
            raise AssertionError("claim must not download")

    claimed = ClaimOnlyApi(settings()).claim()

    assert claimed.id == "job-1"
    assert claimed.claim_token == "claim-1"
    assert claimed.source_filename == "plan.pdf"
    assert claimed.lease_duration_seconds == 300


def test_download_uses_authoritative_mime_type_for_temporary_suffix():
    claimed = ClaimedJob(
        id="job-1",
        claim_token="claim-1",
        source_url="/source",
        source_filename="wrong.pdf",
        source_mime_type="image/webp",
        lease_duration_seconds=300,
    )

    class DownloadApi(WorkerApi):
        def _download_source(self, _url, suffix, _claim):
            assert suffix == ".webp"
            return FIXTURE

    assert DownloadApi(settings()).download(claimed) == FIXTURE


def test_polling_sleeps_when_empty_then_completes_the_next_claim():
    api = FakeApi([None, job()])
    sleeps = []
    pages = [object()]

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(pages=pages),
        sleep=sleeps.append,
        max_iterations=2,
    )

    assert sleeps == [2.5]
    assert api.completed == [("job-1", pages)]
    assert api.failed == []


def test_short_authoritative_lease_heartbeats_before_expiry_without_worker_lease_env():
    api = FakeApi([job()])

    class SlowExtractor:
        def extract(self, _source):
            time.sleep(0.04)
            return []

    run_worker(
        settings(),
        api=api,
        extractor=SlowExtractor(),
        sleep=lambda _seconds: None,
        max_iterations=1,
    )

    assert api.heartbeats


def test_worker_reports_bounded_failure_without_a_traceback():
    api = FakeApi([job()])

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(error=OcrError("engine failed\nTraceback: secret")),
        sleep=lambda _seconds: None,
        max_iterations=1,
    )

    assert api.completed == []
    assert api.failed[0][0] == "job-1"
    assert api.failed[0][1].code == "OCR_FAILED"
    assert api.failed[0][1].message == "engine failed"
    assert len(api.failed[0][1].message) <= 500


def test_download_failure_marks_the_claim_invalid_source():
    api = FakeApi(
        [job()],
        download_error=InvalidSourceError("source download failed"),
    )

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(error=AssertionError("must not extract")),
        sleep=lambda _seconds: None,
        max_iterations=1,
    )

    assert api.completed == []
    assert api.failed[0][0] == "job-1"
    assert api.failed[0][1].code == "INVALID_SOURCE"


def test_fail_callback_outage_is_bounded_and_polling_continues():
    api = FakeApi(
        [job(), second_job()],
        fail_errors=[
            OcrError("callback unavailable"),
            OcrError("callback unavailable"),
            OcrError("callback unavailable"),
        ],
    )
    recovered_pages = [object()]
    extractor = ScriptedExtractor(
        [OcrError("engine failed"), recovered_pages]
    )
    sleeps = []

    run_worker(
        settings(),
        api=api,
        extractor=extractor,
        sleep=sleeps.append,
        max_iterations=2,
    )

    assert [job_id for job_id, _failure in api.failed] == [
        "job-1",
        "job-1",
        "job-1",
    ]
    assert sleeps == [1.0, 2.0]
    assert api.downloaded == ["job-1", "job-2"]
    assert api.completed == [("job-2", recovered_pages)]


def test_completion_callback_failure_is_reported_and_next_poll_runs():
    api = FakeApi(
        [job(), second_job()],
        complete_errors=[OcrError("completion unavailable"), None],
    )
    pages = [object()]

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(pages=pages),
        sleep=lambda _seconds: None,
        max_iterations=2,
    )

    assert api.failed[0][0] == "job-1"
    assert api.completed == [("job-2", pages)]


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (PdfRenderError("pdf"), "PDF_RENDER_FAILED"),
        (OcrError("ocr"), "OCR_FAILED"),
        (InvalidSourceError("source"), "INVALID_SOURCE"),
        (ResultRejectedError("result"), "RESULT_REJECTED"),
    ],
)
def test_classifies_only_documented_failure_codes(error, code):
    assert classify_failure(error).code == code

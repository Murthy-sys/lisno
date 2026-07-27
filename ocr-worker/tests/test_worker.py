from pathlib import Path

import pytest

from lisno_ocr.contracts import (
    ClaimedJob,
    InvalidSourceError,
    OcrError,
    PdfRenderError,
    ResultRejectedError,
    WorkerSettings,
)
from lisno_ocr.worker import classify_failure, run_worker


FIXTURE = Path(__file__).parent / "fixtures" / "labeled-plan.png"


class FakeApi:
    def __init__(self, jobs):
        self.jobs = list(jobs)
        self.completed = []
        self.failed = []

    def claim(self):
        return self.jobs.pop(0) if self.jobs else None

    def complete(self, job_id, pages):
        self.completed.append((job_id, pages))

    def fail(self, job_id, failure):
        self.failed.append((job_id, failure))


class FakeExtractor:
    def __init__(self, pages=None, error=None):
        self.pages = pages or []
        self.error = error

    def extract(self, source_path):
        assert source_path == FIXTURE
        if self.error:
            raise self.error
        return self.pages


def job():
    return ClaimedJob(
        id="job-1",
        claim_token="claim-1",
        source_path=FIXTURE,
    )


def settings():
    return WorkerSettings(
        api_base_url="http://backend.example/api/v1",
        worker_token="worker-token-with-at-least-32-characters",
        poll_seconds=2.5,
        request_timeout_seconds=30,
    )


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

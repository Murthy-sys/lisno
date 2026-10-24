from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import threading
import tempfile
import time

import pytest

from lisno_ocr.contracts import (
    ClaimedJob, InvalidSourceError, OcrError, PdfRenderError,
    ResultRejectedError, WorkerSettings,
)
from lisno_ocr.worker import WorkerApi, classify_failure


TOKEN = "synthetic-worker-token-with-32-characters"
CLAIM = "synthetic-claim-token"
SOURCE_PATH = "/api/v1/internal/extraction-jobs/job-1/source"


@contextmanager
def server(callback):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            callback(self)

        do_POST = do_GET

        def log_message(self, *_args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}/api/v1"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=1)


def settings(base="https://backend.example/api/v1", **kwargs):
    return WorkerSettings(api_base_url=base, worker_token=TOKEN, **kwargs)


def job(source=SOURCE_PATH):
    return ClaimedJob("job-1", CLAIM, source, "plan.png", "image/png", 300)


@pytest.mark.parametrize("url", [
    "http://backend.example/api/v1", "http://localhost/api/v1",
    "http://10.0.0.2/api/v1", "file:///tmp/private", "ftp://example.test/api/v1",
    "https://user:password@backend.example/api/v1", "https://backend.example/api/v1?",
    "https://backend.example/api/v1#", " https://backend.example/api/v1",
    "https://backend.example/api/v1\n", "https://backend.example/api/../v1",
    "https://backend.example/api/%76%31", "https://backend.example/api\\v1",
])
def test_rejects_unsafe_backend_configuration(url):
    with pytest.raises(ValueError):
        settings(url)


@pytest.mark.parametrize("url", [
    "https://backend.example/api/v1", "http://127.0.0.1:3000/api/v1",
    "http://[::1]:3000/api/v1",
])
def test_accepts_tls_or_literal_loopback_backend(url):
    assert settings(url).api_base_url == url


@pytest.mark.parametrize("source", [
    "https://attacker.example" + SOURCE_PATH,
    "//attacker.example" + SOURCE_PATH,
    "http://backend.example" + SOURCE_PATH,
    "https://backend.example:444" + SOURCE_PATH,
    "https://user:password@backend.example" + SOURCE_PATH,
    SOURCE_PATH + "?token=secret", SOURCE_PATH + "#fragment",
    SOURCE_PATH + "?", SOURCE_PATH + "#", SOURCE_PATH + "\n",
    "/api/v1/internal/extraction-jobs/other-job/source", "/api/v1/users",
    "/api/v1/internal/extraction-jobs/job-1/%73ource", "/api/v1/../source",
])
def test_rejects_source_destinations_before_credentials_leave_process(monkeypatch, source):
    def forbidden(*_args, **_kwargs):
        pytest.fail("No transport may be opened for a rejected destination")

    monkeypatch.setattr("lisno_ocr.worker.open_response", forbidden)
    with pytest.raises(InvalidSourceError):
        WorkerApi(settings()).download(job(source))


@pytest.mark.parametrize("job_id", ["../../users", "job-1?redirect=foreign", "job-1#fragment", "job-1\r\n"])
def test_callback_paths_reject_untrusted_job_ids(monkeypatch, job_id):
    def forbidden(*_args, **_kwargs):
        pytest.fail("No transport may be opened for a rejected callback path")

    monkeypatch.setattr("lisno_ocr.worker.open_response", forbidden)
    with pytest.raises(ResultRejectedError):
        WorkerApi(settings()).heartbeat(job_id)


@pytest.mark.parametrize("relative", [True, False, "path"])
def test_download_streams_to_private_file_with_claim_credentials(tmp_path, monkeypatch, relative):
    seen = []

    def serve(request):
        seen.append((request.path, request.headers.get("Authorization"),
                     request.headers.get("X-Extraction-Claim-Token")))
        request.send_response(200)
        request.send_header("Content-Length", "8")
        request.end_headers()
        request.wfile.write(b"testdata")

    monkeypatch.setattr("tempfile.tempdir", str(tmp_path))
    # http.client never consults these credential-intercepting destinations.
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("NO_PROXY", "")
    with server(serve) as base:
        source = SOURCE_PATH if relative is True else base.removesuffix("/api/v1") + SOURCE_PATH
        if relative == "path":
            source = "internal/extraction-jobs/job-1/source"
        api = WorkerApi(settings(base))
        path = api.download(job(source))
        assert path.read_bytes() == b"testdata"
        assert path.stat().st_mode & 0o777 == 0o600
        api.cleanup(path)
    assert seen == [(SOURCE_PATH, f"Bearer {TOKEN}", CLAIM)]
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("operation", ["download", "claim"])
def test_redirect_never_forwards_worker_or_claim_credentials(operation):
    intercepted = []

    def attacker(request):
        intercepted.append(dict(request.headers))
        request.send_response(204)
        request.end_headers()

    with server(attacker) as target:
        def redirect(request):
            request.send_response(302)
            request.send_header("Location", target)
            request.end_headers()

        with server(redirect) as base:
            api = WorkerApi(settings(base))
            with pytest.raises(InvalidSourceError if operation == "download" else ResultRejectedError):
                api.download(job()) if operation == "download" else api.claim()
    assert intercepted == []


@pytest.mark.parametrize("length", [None, "100", "-1", "invalid", "1" * 100])
def test_source_byte_limits_cleanup_even_without_trustworthy_length(tmp_path, monkeypatch, length):
    def serve(request):
        request.send_response(200)
        if length is not None:
            request.send_header("Content-Length", length)
        request.end_headers()
        request.wfile.write(b"123456789")

    monkeypatch.setattr("tempfile.tempdir", str(tmp_path))
    with server(serve) as base:
        with pytest.raises(InvalidSourceError):
            WorkerApi(settings(base, max_source_bytes=8)).download(job())
    assert list(tmp_path.iterdir()) == []


def test_failed_disk_write_removes_partial_private_download(tmp_path, monkeypatch):
    create_tempfile = tempfile.NamedTemporaryFile

    @contextmanager
    def failed_tempfile(**kwargs):
        with create_tempfile(dir=tmp_path, **kwargs) as handle:
            class FailedFile:
                name = handle.name

                def write(self, chunk):
                    handle.write(chunk[:1])
                    raise OSError("synthetic disk failure")

            yield FailedFile()

    @contextmanager
    def response(*_args, **_kwargs):
        class Response(io.BytesIO):
            status = 200

            def getheader(self, _name, default=None):
                return default

        yield Response(b"source bytes")

    monkeypatch.setattr("lisno_ocr.worker.open_response", response)
    monkeypatch.setattr("tempfile.NamedTemporaryFile", failed_tempfile)
    with pytest.raises(InvalidSourceError):
        WorkerApi(settings()).download(job())
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("body,length,encoding", [
    (b"", None, None), (b"short", "100", None), (b"data", None, "gzip"),
])
def test_empty_truncated_or_encoded_source_is_rejected_and_removed(
    tmp_path, monkeypatch, body, length, encoding
):
    def serve(request):
        request.send_response(200)
        if length:
            request.send_header("Content-Length", length)
        if encoding:
            request.send_header("Content-Encoding", encoding)
        request.end_headers()
        request.wfile.write(body)

    monkeypatch.setattr("tempfile.tempdir", str(tmp_path))
    with server(serve) as base:
        with pytest.raises(InvalidSourceError):
            WorkerApi(settings(base)).download(job())
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("headers", [False, True])
def test_total_deadline_interrupts_slow_drip_headers_and_body(tmp_path, monkeypatch, headers):
    def serve(request):
        try:
            if headers:
                chunks = b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n"
            else:
                request.send_response(200)
                request.end_headers()
                chunks = b"x" * 100
            for byte in chunks:
                request.wfile.write(bytes([byte]))
                request.wfile.flush()
                time.sleep(0.025)
        except (BrokenPipeError, ConnectionResetError):
            pass

    monkeypatch.setattr("tempfile.tempdir", str(tmp_path))
    with server(serve) as base:
        start = time.monotonic()
        with pytest.raises(InvalidSourceError):
            WorkerApi(settings(base, request_timeout_seconds=0.1)).download(job())
        assert time.monotonic() - start < 0.35
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("body", [b"[1,2]", b"not json", b" " * (1024 * 1024 + 1)], ids=["array", "invalid", "oversized"])
def test_api_response_shape_and_bytes_are_bounded(body):
    def serve(request):
        request.send_response(200)
        request.end_headers()
        try:
            request.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    with server(serve) as base:
        with pytest.raises(ResultRejectedError):
            WorkerApi(settings(base)).claim()


@pytest.mark.parametrize("error_type", [OcrError, InvalidSourceError, PdfRenderError, ResultRejectedError, RuntimeError])
def test_failure_payloads_never_copy_arbitrary_exception_text(error_type):
    sensitive = "Bearer synthetic-private /tmp/customer-file secret-question https://internal.private"
    failure = classify_failure(error_type(sensitive))
    assert sensitive not in failure.message
    assert "synthetic-private" not in failure.message
    assert "customer-file" not in failure.message
    assert "internal.private" not in failure.message


def test_api_preserves_claim_heartbeat_result_protocol():
    calls = []

    def serve(request):
        body = request.rfile.read(int(request.headers.get("Content-Length", "0")))
        calls.append((request.path, request.headers.get("X-Extraction-Claim-Token"), body))
        if request.path.endswith("/claim"):
            data = {"id": "job-1", "claimToken": CLAIM, "sourceUrl": SOURCE_PATH,
                    "source": {"filename": "plan.png", "mimeType": "image/png"},
                    "leaseDurationMs": 300000}
        else:
            data = {"leaseDurationMs": 60000}
        response = json.dumps({"data": data}).encode()
        request.send_response(200)
        request.send_header("Content-Length", str(len(response)))
        request.end_headers()
        request.wfile.write(response)

    with server(serve) as base:
        api = WorkerApi(settings(base))
        claimed = api.claim()
        assert claimed.claim_token == CLAIM
        assert api.heartbeat(claimed.id) == 60
        api.complete(claimed.id, [])
    assert [call[1] for call in calls] == [None, CLAIM, CLAIM]
    result = json.loads(calls[-1][2])
    assert result["resultId"]
    assert result["pages"] == []

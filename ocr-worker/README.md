# Lisno OCR worker

The worker claims queued design extractions from the backend, renders PDF pages,
runs PaddleOCR, and returns page images plus proposed labeled crops. The backend
owns authorization, storage, review state, and audit history.

## Setup

Python 3.11 or newer is required:

```bash
cd ocr-worker
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[test,model]"
```

The `model` extra installs PaddleOCR and PaddlePaddle. To run contract tests
without the OCR runtime or model downloads, install only `-e ".[test]"`.

PaddleOCR downloads model files on the first real inference and reuses its local
cache afterward. That first run can be much slower and needs network access and
disk space. Warm the cache as the same operating-system user that runs the
service; do not delete it during routine deployments.

## Configuration

- `OCR_WORKER_TOKEN` — required shared secret of at least 32 characters; it must
  exactly match the backend value and must never reach browser code.
- `OCR_API_BASE_URL` — versioned backend base URL; default
  `http://127.0.0.1:3000/api/v1`.
- `OCR_POLL_SECONDS` — positive empty-queue poll delay; default `5`.
- `OCR_REQUEST_TIMEOUT_SECONDS` — positive HTTP timeout; default `60`.
- `OCR_CONFIDENCE_FLOOR` — candidates below this score are discarded; default
  `0.2`, while candidates below the UI warning threshold remain reviewable.
- `OCR_MAX_PDF_PAGES`, `OCR_MAX_PAGE_PIXELS`, and `OCR_MAX_OUTPUT_BYTES` bound
  PDF rendering, decompression, and generated page/crop payloads. Output
  defaults to 40 MiB and cannot exceed 44 MiB so base64 and JSON overhead stay
  below the backend's 64 MiB request limit.
- `OCR_MAX_PROCESSING_SECONDS` stops lease renewal after a bounded processing
  window (default `900`), allowing a wedged model job to be reclaimed safely.

The backend controls `OCR_LEASE_SECONDS` (default `300`) and returns the
authoritative duration on every claim and renewal. The worker schedules each
heartbeat from that response with a safety fraction; no duplicate worker lease
setting is required. An abandoned job becomes claimable after expiry.

```bash
export OCR_WORKER_TOKEN="local-development-only-ocr-worker-token-123456"
export OCR_API_BASE_URL="http://127.0.0.1:3000/api/v1"
python -m lisno_ocr.worker
```

That token is a non-secret local-development example. Use the exact same value
for the backend process, and replace it with a real secret in shared or
production environments.

## Inputs and processing

Supported uploads are multi-page PDF, PNG, JPEG, and WebP. PDFs are rendered in
page order; images are decoded directly. Worker results contain PNG page images,
PNG crops, one-based page numbers, pixel dimensions, confidence values, and
bounded pixel crops. OCR labels and crops are proposals a designer must verify.

## Health and recovery

Confirm the backend before starting the worker:

```bash
curl http://127.0.0.1:3000/api/v1/health
```

The worker has no listening HTTP port. Monitor its process and backend extraction
status. `processing_failed` exposes a bounded safe failure code and message. The
original remains available, so the designer can retry or manually add sections.
Failed callbacks use bounded retry; lease expiry lets another worker reclaim an
abandoned job. Repeated `INVALID_SOURCE` indicates missing/unreadable storage,
`PDF_RENDER_FAILED` or `OCR_FAILED` indicates decoding/model trouble, and
`RESULT_REJECTED` indicates a backend contract or bounds rejection.

## Verification

```bash
python -m pytest -m "not model"
```

Real inference is opt-in and may initialize or download model assets:

```bash
python -m pytest -m model tests/test_extractor.py
```

This runbook was verified in a lightweight environment without `paddleocr` or
`paddlepaddle`, so the model smoke was skipped. Record deployed versions with:

```bash
python -c 'import importlib.metadata as m; print("paddleocr", m.version("paddleocr")); print("paddlepaddle", m.version("paddlepaddle"))'
```

# Estimate design image extraction and review

This workflow keeps design drawings attached to the estimate before a project
exists. Estimator/sales uploads a plan, the leased OCR worker proposes one crop
per detected drawing, and the estimator verifies the exact room and scope
placement before the client can see it.

## Local setup

The backend requires a transaction-capable MongoDB replica set. Configure
`backend/.env`, using the same private worker token in the backend and worker
process.

```bash
cd ocr-worker
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test,model]"
```

Start the backend, frontend, and worker as described in the root README. The
worker needs `OCR_WORKER_TOKEN` (at least 32 characters) and normally uses
`OCR_API_BASE_URL=http://127.0.0.1:3000/api/v1`. Never place the worker token in
`VITE_*` variables or browser code.

## Supported files and native dependencies

Estimate uploads accept multi-page PDF, PNG, JPEG/JPG, WebP, TIFF/TIF, and
HEIC/HEIF after content-signature validation. DWG and DXF are not supported.
TIFF and HEIC/HEIF are decoded to normalized RGB pages while the immutable
original remains protected.

`pillow-heif` is a required base dependency. Production images must either use
a compatible prebuilt `pillow-heif` wheel containing its native HEIF support or
provide the platform's libheif build/runtime dependencies. Validate HEIC and
HEIF decoding on the exact operating-system and Python image used in
production; do not assume a pure-Python fallback exists.

## Processing limits

Defaults are:

- upload: `MAX_UPLOAD_MB=25`;
- source pages: `OCR_MAX_PDF_PAGES=50`;
- decoded/rendered page: `OCR_MAX_PAGE_PIXELS=40000000`;
- generated page and crop output: `OCR_MAX_OUTPUT_BYTES=41943040` (40 MiB),
  with a hard worker setting ceiling of 44 MiB;
- accepted OCR lines: 2,000 per page;
- extracted crops: 500 per page;
- processing window: `OCR_MAX_PROCESSING_SECONDS=900`;
- backend lease: `OCR_LEASE_SECONDS=300`.

Keep worker heartbeats comfortably inside the backend lease. The backend
completion endpoint permits up to 50 estimate pages, 500 sections per page,
and a 64 MiB request body; worker output remains lower to leave room for base64
and JSON overhead.

## Review and recovery

The worker proposes stable room and scope IDs from the estimate taxonomy.
Exact, alias, punctuation/case/spacing, `RCP`, and bounded OCR misspelling
matches can place automatically when both room and scope meet the 0.84
threshold. Ambiguous or low-confidence crops remain visible for estimator
correction and cannot be submitted silently.

Failed extraction keeps the immutable original. Retrying resets only a failed
upload/job pair, uses the same source, and remains safe under version and lease
guards. An expired lease may be reclaimed; stale completion tokens cannot
publish duplicate results. If OCR repeatedly fails, estimator/sales can
manually correct the room, scope, title, and crop or add the missing crop before
submission.

Client annotations remain normalized vectors. A requested-change revision and
its annotation layer are immutable. Uploading and verifying a replacement
creates further revisions in the same drawing history. The client must approve
every active latest revision before final estimate approval creates the
project. Individually approved drawings and all drawings after final estimate
approval are read-only.

## Verification

```bash
cd ocr-worker
.venv/bin/python -m pytest -q
cd ../backend
npm test
npm run typecheck
npm run build
cd ../frontend
VITE_API_URL=/api/v1 npm test
npm run typecheck
VITE_API_URL=/api/v1 npm run build
```

Manual desktop and 320 px visual verification requires the in-app browser
surface. No browser session was available for the Task 8 verification run, so
no screenshots were produced and no manual visual pass is claimed. Repeat that
check in an in-app browser before treating the responsive screenshot review as
complete.

The deterministic acceptance sheet is
`ocr-worker/tests/fixtures/estimate-review-sheet.png`. Its contract test records
literal crops, stable room/scope IDs, and exact, alias, or bounded-fuzzy
confidence classes.

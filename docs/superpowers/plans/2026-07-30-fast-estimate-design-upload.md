# Fast Estimate Design Upload and Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add truthful upload progress and a title-block optimized, one-full-page-per-PDF-page extraction path for large estimate design PDFs without changing estimate mapping, annotations, revisions, or client review.

**Architecture:** Add an XHR multipart request helper that reports byte progress to the existing React Query mutation. Extend the worker with a bounded title-block OCR adapter that emits one full-page proposal per eligible PDF page, while preserving the current extractor as fallback. Adapt PDF rendering scale to the configured pixel budget and polish the choose-file/retry controls using existing design-system primitives.

**Tech Stack:** React 19, TanStack Query, TypeScript, Vitest, Testing Library, existing `ProgressBar`, Python 3.11, Pillow, PyMuPDF, NumPy, PaddleOCR, pytest.

## Global Constraints

- Preserve existing title normalization, estimate taxonomy mapping, revision, crop annotation, and client approval contracts.
- Full-page drawing output must retain title blocks, legends, material schedules, dimensions, notes, and all other page details.
- Upload progress must report actual transferred bytes and remain visible until the API settles.
- OCR progress must remain indeterminate unless the worker contract gains durable progress events; never display a fabricated percentage.
- Keep configured page-count, pixel, output-byte, and processing-time safety limits.
- Non-title-block PDFs and image uploads must continue through the existing extraction behavior.

---

### Task 1: Add a progress-aware multipart API helper

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/features/leads/estimateDesignApi.ts`
- Test: `frontend/src/api/client.test.ts` (extend the existing API-client suite if present)

**Interfaces:**
- Add `postMultipartWithProgress<T>(path: string, body: FormData, onProgress: (percent: number) => void): Promise<T>` to `apiClient`.
- The helper must use `XMLHttpRequest`, resolve the same `{ data: T }` envelope as `postMultipart`, apply the stored bearer token and `Accept: application/json`, and preserve the existing unauthorized-event behavior for 401 responses.

- [ ] **Step 1: Write the failing tests.** Stub `XMLHttpRequest` and assert that `upload.onprogress` converts `loaded / total` to a clamped integer percentage, success parses the API envelope, non-2xx responses reject with `ApiError`, and an aborted/error request rejects.
- [ ] **Step 2: Run the focused client tests to verify they fail.**

Run: `npm test -- --run frontend/src/api/client.test.ts`

Expected: FAIL because `postMultipartWithProgress` is not defined.

- [ ] **Step 3: Implement the minimal XHR helper.** Reuse `resolveApiUrl`, `tokenStorage`, `buildHeaders`, and `ApiError`; do not set `Content-Type` manually so the browser supplies the multipart boundary.
- [ ] **Step 4: Run the focused tests to verify they pass.**
- [ ] **Step 5: Commit.**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat: report multipart upload progress"
```

### Task 2: Integrate upload progress and polished file/retry controls

**Files:**
- Modify: `frontend/src/features/leads/estimateDesignApi.ts`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/leads/EstimateDesignUploads.test.tsx`

**Interfaces:**
- Change `uploadEstimateDesign` to accept `(estimateId: string, file: File, onProgress?: (percent: number) => void)` and call the progress-aware helper.
- Maintain `upload.isPending` as the request lock; add local `uploadProgress: number | undefined` that is set to 0 on submit, updated from XHR, and cleared only after success or failure.

- [ ] **Step 1: Write failing component tests.** Add tests that select a PDF and see a `Choose file` control plus filename/size, invoke the XHR progress callback and observe an accessible progressbar value, keep the progressbar until the mocked API settles, and show `Retrying extraction…` with the failure message during retry.
- [ ] **Step 2: Run the focused component tests to verify they fail.**

Run: `npm test -- --run frontend/src/features/leads/EstimateDesignUploads.test.tsx`

Expected: FAIL because the component still renders the native input/button path and does not expose upload progress.

- [ ] **Step 3: Implement the UI integration.** Keep the real input visually hidden but label it with a styled `Choose file` button; render the selected filename and byte size; render `ProgressBar value={uploadProgress} label="Uploading design plan"` while the request is active; retain the selected file on failure; and show the existing queued/processing status after API success.
- [ ] **Step 4: Polish responsive styles.** Add focused `.estimate-design-uploads__file-picker`, filename, progress, and retry styles using existing color tokens and button classes. Ensure wrapping and full-width stacking at the existing mobile breakpoint, and preserve keyboard focus outlines.
- [ ] **Step 5: Run focused component tests and frontend typecheck.**
- [ ] **Step 6: Commit.**

```bash
git add frontend/src/api/client.ts frontend/src/features/leads/estimateDesignApi.ts frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/leads/EstimateDesignUploads.test.tsx frontend/src/styles/index.css
git commit -m "feat: add design upload progress and recovery controls"
```

### Task 3: Add title-block extraction primitives

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Create: `ocr-worker/src/lisno_ocr/title_block.py`
- Test: `ocr-worker/tests/test_title_block.py`
- Test: `ocr-worker/tests/test_extractor.py`

**Interfaces:**
- Create `extract_title_block(lines, image_width, image_height) -> str | None` in `title_block.py`; it accepts normalized OCR line tuples and searches the configured lower title-block band for `TITLE`/`TITLE :` followed by a non-empty value.
- Add an extractor mode that receives a page image and returns one `ExtractedSection` whose crop is `(0, 0, image.width, image.height)` and whose label is the title-block value.

- [ ] **Step 1: Write failing title-block tests.** Cover `TITLE : TV UNIT` near the bottom, normalized punctuation/spacing, unrelated plan/elevation/material labels, missing title, and a title outside the lower band.
- [ ] **Step 2: Run `pytest tests/test_title_block.py -q` and verify the expected failures.**
- [ ] **Step 3: Implement bounded title-block parsing.** Use page-relative lower-band coordinates, normalize OCR punctuation without changing the returned display title, and reject blank/ambiguous candidates.
- [ ] **Step 4: Run the title-block tests and verify they pass.**
- [ ] **Step 5: Add a failing extractor test with a two-page synthetic PDF and mocked OCR results.** Assert one full-page section per page, exact title labels, full-page crop bounds, and preserved estimate taxonomy proposal data.
- [ ] **Step 6: Run the focused extractor test and verify it fails for the current multi-panel behavior.**
- [ ] **Step 7: Implement the title-block fast path.** OCR the title-block band only for eligible PDFs, bypass full-sheet region association when a title is found, encode the already-rendered full page once, and emit one section. Route pages with no recognized title through the existing extractor path.
- [ ] **Step 8: Run focused OCR tests and commit.**

```bash
git add ocr-worker/src/lisno_ocr/title_block.py ocr-worker/src/lisno_ocr/extractor.py ocr-worker/tests/test_title_block.py ocr-worker/tests/test_extractor.py
git commit -m "feat: optimize titled PDF extraction"
```

### Task 4: Make PDF rendering adaptive within safety limits

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/src/lisno_ocr/contracts.py` only if a new bounded setting is required by the implementation

**Interfaces:**
- `_render_pdf_pages` must compute a page scale no greater than the configured default and reduce it when `width * height` at the default scale exceeds `max_page_pixels`.
- It must still reject a page when the minimum safe scale cannot produce a positive, useful image within the configured budget, with a classifiable `PdfRenderError`.

- [ ] **Step 1: Replace the current rejection-only test with a failing downscale test.** Mock a page whose default 2× dimensions exceed the budget; assert `get_pixmap` receives a reduced matrix and extraction proceeds.
- [ ] **Step 2: Run the focused test and verify it fails because the current implementation raises before allocating a pixmap.**
- [ ] **Step 3: Implement the scale calculation and retain page-count, output-byte, and processing safety guards.**
- [ ] **Step 4: Add a test for an irreducibly oversized page that still raises `PdfRenderError` before unsafe allocation.**
- [ ] **Step 5: Run all OCR tests.**

Run: `cd ocr-worker && .venv/bin/python -m pytest -m 'not model'`

- [ ] **Step 6: Commit.**

```bash
git add ocr-worker/src/lisno_ocr/extractor.py ocr-worker/tests/test_extractor.py ocr-worker/src/lisno_ocr/contracts.py
git commit -m "feat: adapt PDF rendering to safe page budgets"
```

### Task 5: End-to-end regression verification and documentation

**Files:**
- Modify: `ocr-worker/README.md`
- Modify: `README.md` if local setup instructions need the progress/fast-path behavior documented
- Test: existing frontend, backend, and OCR suites

- [ ] **Step 1: Document that titled estimate PDFs use title-block OCR and emit one full-page drawing per page, while other formats retain fallback extraction.**
- [ ] **Step 2: Run frontend tests.**

Run: `npm test -- --run`

- [ ] **Step 3: Run backend tests and typecheck.**

Run: `npm test -- --run` from `backend`, then `npm run typecheck` from `backend`.

- [ ] **Step 4: Run OCR non-model tests and the model smoke if the PaddleOCR cache is available.**
- [ ] **Step 5: Run `git diff --check` and inspect the final status.**
- [ ] **Step 6: Commit documentation and verification updates.**

```bash
git add README.md ocr-worker/README.md
git commit -m "docs: describe fast estimate PDF extraction"
```

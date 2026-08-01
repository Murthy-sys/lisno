# Estimate PDF Classifier Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make estimate PDF extraction retain every valid full page when taxonomy matching cannot classify a title, report real renderer failures accurately, expose actionable worker diagnostics, and remove the Mongoose update warnings shown during extraction.

**Architecture:** Make the fuzzy matcher a total function, then isolate advisory taxonomy classification from required page rendering and encoding. Move render-error translation to the actual PyMuPDF/Pillow boundary, log internal failures with correlation data while keeping UI messages safe, and update Mongo compare-and-set queries to supported Mongoose 9 APIs.

**Tech Stack:** Python 3.11, PyMuPDF, Pillow, pytest, TypeScript, Node.js, Mongoose 9.8, Vitest, MongoDB.

## Global Constraints

- Preserve one full-page drawing per source page, including legends, materials, title blocks, and drawing details.
- Preserve the detected title when classification fails; exact backend mapping may still map it, otherwise it must remain visible under Miscellaneous.
- Only PDF source validation/opening, page-dimension validation, pixmap creation, and pixmap-to-image conversion may produce `PDF_RENDER_FAILED`; empty PDFs and configured page-count-limit violations intentionally retain that existing code.
- Do not expose tracebacks, claim tokens, authorization headers, source bytes, image payloads, or taxonomy contents through the API or UI.
- Never log raw exception messages, `logger.exception()` output, traceback locals, source lines, or `exc_info`; diagnostics may contain only bounded exception class names and sanitized code-basename/function/line locations.
- Do not change the current page, pixel, output-size, or processing-time safety budgets.
- Do not change estimate mapping thresholds, exact estimate-item assignment, annotations, or non-blocking client submission.
- Do not change database schemas or API response shapes.
- Follow red-green TDD: add each regression first, run it and observe the expected failure, then write production code.

---

## File map

- `ocr-worker/src/lisno_ocr/estimate_taxonomy.py`: total fuzzy-title similarity and taxonomy matching.
- `ocr-worker/tests/test_estimate_taxonomy.py`: short-title and exact-match regressions.
- `ocr-worker/src/lisno_ocr/safe_logging.py`: bounded exception-chain summaries that never format exception messages or locals.
- `ocr-worker/tests/test_safe_logging.py`: protected-value redaction, cause-chain, frame-location, and cycle-bound regressions.
- `ocr-worker/src/lisno_ocr/extractor.py`: per-page classification fallback and the true PDF-render boundary.
- `ocr-worker/tests/test_extractor.py`: six-page integration, fallback, and error-boundary regressions.
- `ocr-worker/src/lisno_ocr/worker.py`: safe failure classification and correlated lifecycle/error logging.
- `ocr-worker/tests/test_worker.py`: worker success, failure, redaction, and callback-log regressions.
- `backend/src/services/estimate-design.service.ts`: estimate worker update options.
- `backend/src/repositories/mongo.ts`: repository update options and generic worker compare-and-set calls.
- `backend/tests/mongo-repository.test.ts`: emitted Mongo query contract regressions.

### Task 1: Make taxonomy matching total and prove the six-page case

**Files:**
- Modify: `ocr-worker/tests/test_estimate_taxonomy.py:78-117`
- Modify: `ocr-worker/tests/test_extractor.py:441-475`
- Modify: `ocr-worker/src/lisno_ocr/estimate_taxonomy.py:103-120`

**Interfaces:**
- Consumes: `match_taxonomy_term(normalized_title: str, terms: Sequence[TaxonomyTerm]) -> CanonicalMatch`
- Produces: `_phrase_similarity(title: str, phrase: str) -> tuple[float, int]` that returns `(0.0, 0)` when no comparison window exists.

- [ ] **Step 1: Add failing short-title unit regressions**

Add these tests after `test_ambiguous_bedroom_match_never_selects_an_automatic_room_id`:

```python
def test_short_title_is_a_non_match_for_a_longer_unrelated_term():
    terms = (TaxonomyTerm("room-office", "Home Office/Study", ()),)

    match = match_taxonomy_term("kitchen", terms)

    assert match.id is None
    assert match.confidence == 0.0
    assert match.evidence == ()
    assert match.ambiguous is False


def test_short_exact_title_still_wins_when_a_longer_term_is_checked_first():
    terms = (
        TaxonomyTerm("room-office", "Home Office/Study", ()),
        TaxonomyTerm("room-kitchen", "Kitchen", ()),
    )

    match = match_taxonomy_term("KITCHEN", terms)

    assert match.id == "room-kitchen"
    assert match.confidence == 1.0
    assert match.evidence == ("kitchen",)
    assert match.ambiguous is False
```

- [ ] **Step 2: Add the failing six-page integration regression**

Add this test after the existing six-page full-page test:

```python
def test_six_page_estimate_pdf_classifies_final_one_word_title(tmp_path):
    source = write_estimate_pdf(
        tmp_path,
        [
            "TV UNIT",
            "DINING - SEATER UNIT",
            "PUJA - UNIT",
            "PUJA BACK PANEL",
            "CROCKERY - UNIT",
            "KITCHEN",
        ],
    )
    taxonomy = EstimateTaxonomy(
        rooms=(
            TaxonomyTerm("room-living", "Living & Dining", ()),
            TaxonomyTerm("room-master", "Master Bedroom", ()),
            TaxonomyTerm("room-utility", "Balcony / Utility", ()),
            TaxonomyTerm("room-kitchen", "Kitchen", ()),
            TaxonomyTerm("room-office", "Home Office/Study", ()),
        ),
        scopes=(
            TaxonomyTerm(
                "FC",
                "False Ceiling",
                ("false ceiling", "ceiling plan", "rcp", "reflected ceiling"),
            ),
            TaxonomyTerm("FL", "Flooring", ("flooring", "floor plan", "floor finish")),
            TaxonomyTerm("CA", "Carpentry", ("carpentry", "woodwork", "joinery")),
            TaxonomyTerm("CV", "Civil", ("civil", "masonry")),
            TaxonomyTerm("EL", "Electrical", ("electrical", "lighting", "power")),
            TaxonomyTerm("PA", "Painting", ("painting", "paint")),
        ),
    )

    pages = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=taxonomy,
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == [1, 2, 3, 4, 5, 6]
    assert [page.sections[0].label for page in pages][-1] == "KITCHEN"
    assert pages[-1].sections[0].proposal is not None
    assert pages[-1].sections[0].proposal.room.id == "room-kitchen"
    assert all(
        page.sections[0].crop == Crop(0, 0, page.width, page.height)
        and page.sections[0].image_base64 == page.image_base64
        for page in pages
    )
```

- [ ] **Step 3: Run the new regressions and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest \
  tests/test_estimate_taxonomy.py::test_short_title_is_a_non_match_for_a_longer_unrelated_term \
  tests/test_estimate_taxonomy.py::test_short_exact_title_still_wins_when_a_longer_term_is_checked_first \
  tests/test_extractor.py::test_six_page_estimate_pdf_classifies_final_one_word_title -q
```

Expected: both unit tests fail directly with
`ValueError: max() arg is an empty sequence`; the integration test fails with
the false generic `PdfRenderError`, whose cause chain contains that
`ValueError`.

- [ ] **Step 4: Add the minimal empty-window guard**

In `_phrase_similarity()`, insert the guard after calculating `longest`:

```python
    if shortest > longest:
        return 0.0, 0
```

Do not alter the existing threshold, token cap, ambiguity margin, or scoring order.

- [ ] **Step 5: Run focused and complete taxonomy/extractor tests**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_estimate_taxonomy.py tests/test_extractor.py -q
```

Expected: every test passes, including the two short-title tests and the six-page regression.

- [ ] **Step 6: Commit the total-matcher change**

```bash
git add \
  ocr-worker/src/lisno_ocr/estimate_taxonomy.py \
  ocr-worker/tests/test_estimate_taxonomy.py \
  ocr-worker/tests/test_extractor.py
git commit -m "fix: make estimate taxonomy matching total"
```

### Task 2: Add redacted diagnostics and isolate advisory classification

**Files:**
- Create: `ocr-worker/src/lisno_ocr/safe_logging.py`
- Create: `ocr-worker/tests/test_safe_logging.py`
- Modify: `ocr-worker/tests/test_extractor.py:441-620,1181-1335`
- Modify: `ocr-worker/src/lisno_ocr/extractor.py:1-18,134-237,339-380`

**Interfaces:**
- Produces: `safe_exception_summary(error: BaseException) -> str`, containing
  only bounded exception class names and sanitized code locations.
- Consumes: `_empty_estimate_proposal(title: str) -> EstimateDrawingProposal`
- Produces: `_render_pdf_page(page: fitz.Page, *, page_number: int, deadline: float | None) -> Image.Image`
- Produces: estimate-page extraction that catches classification exceptions, logs `stage=estimate_classification`, and returns an empty proposal with the detected title.

- [ ] **Step 1: Add failing safe-diagnostic regressions**

Create `ocr-worker/tests/test_safe_logging.py`:

```python
from lisno_ocr.safe_logging import safe_exception_summary


PROTECTED_VALUES = (
    "claim-1",
    "Bearer worker-secret",
    "taxonomy-secret",
    "payload-secret",
)


def test_exception_summary_keeps_types_and_locations_without_messages():
    def raise_chained_failure():
        try:
            raise ValueError(" ".join(PROTECTED_VALUES))
        except ValueError as cause:
            raise RuntimeError(" ".join(PROTECTED_VALUES)) from cause

    try:
        raise_chained_failure()
    except RuntimeError as error:
        summary = safe_exception_summary(error)

    assert "RuntimeError" in summary
    assert "ValueError" in summary
    assert "test_safe_logging.py" in summary
    assert "raise_chained_failure" in summary
    assert all(value not in summary for value in PROTECTED_VALUES)


def test_exception_summary_bounds_a_cyclic_cause_chain():
    first = RuntimeError("payload-secret")
    second = ValueError("taxonomy-secret")
    first.__cause__ = second
    second.__cause__ = first

    summary = safe_exception_summary(first)

    assert "RuntimeError" in summary
    assert "ValueError" in summary
    assert "<chain-truncated>" in summary
    assert "payload-secret" not in summary
    assert "taxonomy-secret" not in summary
    assert len(summary) <= 4_096
```

- [ ] **Step 2: Run the safe-diagnostic tests and verify RED**

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_safe_logging.py -q
```

Expected: collection fails with
`ModuleNotFoundError: No module named 'lisno_ocr.safe_logging'`.

- [ ] **Step 3: Implement the message-free exception summary**

Create `ocr-worker/src/lisno_ocr/safe_logging.py`:

```python
from __future__ import annotations

import os
import string


_MAX_CHAIN_DEPTH = 4
_MAX_FRAMES_PER_EXCEPTION = 4
_MAX_FIELD_CHARS = 80
_MAX_SUMMARY_CHARS = 4_096
_ALLOWED = frozenset(string.ascii_letters + string.digits + "._<>-")


def _safe_field(value: str) -> str:
    cleaned = "".join(char if char in _ALLOWED else "?" for char in value)
    return (cleaned or "?")[:_MAX_FIELD_CHARS]


def safe_exception_summary(error: BaseException) -> str:
    parts: list[str] = []
    seen: set[int] = set()
    current: BaseException | None = error

    while current is not None and len(parts) < _MAX_CHAIN_DEPTH:
        identity = id(current)
        if identity in seen:
            break
        seen.add(identity)
        node = current

        frames: list[str] = []
        traceback = node.__traceback__
        while traceback is not None:
            code = traceback.tb_frame.f_code
            frames.append(
                f"{_safe_field(os.path.basename(code.co_filename))}:"
                f"{traceback.tb_lineno}:{_safe_field(code.co_name)}"
            )
            traceback = traceback.tb_next
        if len(frames) > _MAX_FRAMES_PER_EXCEPTION:
            frames = ["<frames-omitted>", *frames[-_MAX_FRAMES_PER_EXCEPTION:]]
        frame_summary = ",".join(frames) if frames else "<no-traceback>"
        parts.append(f"{_safe_field(type(node).__name__)}[{frame_summary}]")

        current = node.__cause__
        if current is None and not node.__suppress_context__:
            current = node.__context__

    if current is not None:
        parts.append("<chain-truncated>")
    return " caused_by=".join(parts)[:_MAX_SUMMARY_CHARS]
```

This helper must never call `str(error)`, `repr(error)`,
`traceback.format_*`, or inspect frame locals or source lines.

Run:

```bash
.venv/bin/python -m pytest tests/test_safe_logging.py -q
```

Expected: both tests pass.

- [ ] **Step 4: Add the failing classification-fallback regression**

Add `import logging` to the test file and add:

```python
def test_estimate_classification_failure_keeps_the_full_page_as_unmapped(
    caplog,
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(tmp_path, ["KITCHEN"])
    taxonomy = EstimateTaxonomy(
        rooms=(TaxonomyTerm("room-kitchen", "Kitchen", ()),),
        scopes=(),
    )
    protected_values = (
        "claim-1",
        "Bearer worker-secret",
        "taxonomy-secret",
        "payload-secret",
    )

    def fail_classification(_title, _taxonomy):
        raise RuntimeError(" ".join(protected_values))

    monkeypatch.setattr(
        "lisno_ocr.extractor.classify_estimate_drawing",
        fail_classification,
    )
    caplog.set_level(logging.ERROR, logger="lisno_ocr.extractor")

    page = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=taxonomy,
    ).extract(source, mode="estimate_design")[0]

    section = page.sections[0]
    assert section.label == "KITCHEN"
    assert section.crop == Crop(0, 0, page.width, page.height)
    assert section.image_base64 == page.image_base64
    assert section.proposal is not None
    assert section.proposal.detected_title == "KITCHEN"
    assert section.proposal.room.id is None
    assert section.proposal.scope.id is None
    assert "stage=estimate_classification page_number=1" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "fail_classification" in caplog.text
    assert all(value not in caplog.text for value in protected_values)
```

- [ ] **Step 5: Add failing PDF-boundary regressions**

Add:

```python
def test_estimate_pdf_open_failure_remains_a_pdf_source_error(
    monkeypatch,
    tmp_path,
):
    source = tmp_path / "broken.pdf"
    source.write_bytes(b"%PDF")

    def fail_open(_path):
        raise RuntimeError("open failed")

    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", fail_open)

    with pytest.raises(
        PdfRenderError,
        match=r"The PDF could not be opened\.",
    ) as captured:
        Extractor(
            ocr_engine=OcrMustNotStart(),
            estimate_taxonomy=EstimateTaxonomy((), ()),
        ).extract(source, mode="estimate_design")

    assert isinstance(captured.value.__cause__, RuntimeError)


def test_estimate_pdf_pixmap_failure_reports_the_real_page(monkeypatch, tmp_path):
    source = write_estimate_pdf(tmp_path, ["KITCHEN"])

    def fail_pixmap(self, **_kwargs):
        raise RuntimeError("pixmap failed")

    monkeypatch.setattr(fitz.Page, "get_pixmap", fail_pixmap)

    with pytest.raises(
        PdfRenderError,
        match=r"PDF page 1 could not be rendered\.",
    ) as captured:
        Extractor(
            ocr_engine=OcrMustNotStart(),
            render_scale=1,
            estimate_taxonomy=EstimateTaxonomy((), ()),
        ).extract(source, mode="estimate_design")

    assert isinstance(captured.value.__cause__, RuntimeError)


def test_estimate_pdf_pixel_conversion_failure_reports_the_real_page(
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(tmp_path, ["KITCHEN"])

    def fail_conversion(*_args, **_kwargs):
        raise RuntimeError("conversion failed")

    monkeypatch.setattr("lisno_ocr.extractor.Image.frombytes", fail_conversion)

    with pytest.raises(
        PdfRenderError,
        match=r"PDF page 1 could not be rendered\.",
    ) as captured:
        Extractor(
            ocr_engine=OcrMustNotStart(),
            render_scale=1,
            estimate_taxonomy=EstimateTaxonomy((), ()),
        ).extract(source, mode="estimate_design")

    assert isinstance(captured.value.__cause__, RuntimeError)


def test_non_render_page_assembly_error_is_not_relabelled_as_pdf_render(
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(tmp_path, ["KITCHEN"])

    def fail_page_assembly(self, *_args, **_kwargs):
        raise RuntimeError("page assembly failed")

    monkeypatch.setattr(Extractor, "_extract_estimate_page", fail_page_assembly)

    with pytest.raises(RuntimeError, match="page assembly failed"):
        Extractor(
            ocr_engine=OcrMustNotStart(),
            render_scale=1,
            estimate_taxonomy=EstimateTaxonomy((), ()),
        ).extract(source, mode="estimate_design")
```

- [ ] **Step 6: Run the new extractor regressions and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest \
  tests/test_extractor.py::test_estimate_classification_failure_keeps_the_full_page_as_unmapped \
  tests/test_extractor.py::test_estimate_pdf_open_failure_remains_a_pdf_source_error \
  tests/test_extractor.py::test_estimate_pdf_pixmap_failure_reports_the_real_page \
  tests/test_extractor.py::test_estimate_pdf_pixel_conversion_failure_reports_the_real_page \
  tests/test_extractor.py::test_non_render_page_assembly_error_is_not_relabelled_as_pdf_render -q
```

Expected:

- PDF-open behavior is already green and proves the preserved source boundary;
- classification failure is wrapped as the false generic `PdfRenderError`;
- pixmap and conversion failures lack the one-based page number;
- page-assembly failure is incorrectly converted to `PdfRenderError`.

- [ ] **Step 7: Add per-page classification fallback**

Add a module logger and the redacted summary import:

```python
import logging

from .safe_logging import safe_exception_summary

logger = logging.getLogger(__name__)
```

Replace the classified-candidate branch in `_extract_estimate_page()` with:

```python
        else:
            title, confidence = candidate
            try:
                proposal = _estimate_proposal(title, self._estimate_taxonomy)
            except Exception as error:
                logger.error(
                    "event=estimate_classification_failed "
                    "stage=estimate_classification page_number=%d exception=%s",
                    page_number,
                    safe_exception_summary(error),
                )
                proposal = _empty_estimate_proposal(title)
```

The fallback catches only advisory proposal construction. Rendering, image
encoding, output budgets, and deadlines remain required operations.

- [ ] **Step 8: Move render translation to `_render_pdf_page()`**

Enumerate project PDF pages so both modes supply a one-based page number:

```python
            for page_number, page in enumerate(document, start=1):
                _require_processing_time(deadline)
                image = self._render_pdf_page(
                    page,
                    page_number=page_number,
                    deadline=deadline,
                )
```

Pass `page_number` from `_extract_estimate_pdf()` in the same way. Change the
renderer to:

```python
    def _render_pdf_page(
        self,
        page: fitz.Page,
        *,
        page_number: int,
        deadline: float | None,
    ) -> Image.Image:
        try:
            scale = _pdf_render_scale(
                page.rect.width,
                page.rect.height,
                self._render_scale,
                self._max_page_pixels,
            )
            pixmap = page.get_pixmap(
                matrix=fitz.Matrix(scale, scale),
                alpha=False,
            )
            try:
                return Image.frombytes(
                    "RGB",
                    (pixmap.width, pixmap.height),
                    pixmap.samples,
                )
            finally:
                del pixmap
        except PdfRenderError as error:
            raise PdfRenderError(
                f"PDF page {page_number} could not be rendered: {error}"
            ) from error
        except Exception as error:
            raise PdfRenderError(
                f"PDF page {page_number} could not be rendered."
            ) from error
```

Delete the broad `except Exception` wrappers that currently surround the full
page-processing loops at `extractor.py:181-182` and `extractor.py:209-210`.
Retain `finally: document.close()`. Keep existing empty-PDF and configured
page-count-limit validation as `PdfRenderError`; those are source-validation
failures, not page-processing wrappers.

Update the existing irreducibly-oversized-page assertion to require both the
page number and original safe reason:

```python
    with pytest.raises(
        PdfRenderError,
        match=r"PDF page 1 could not be rendered: .*page is too large",
    ):
        Extractor(
            ocr_engine=FakePaddleOCR3([]),
            max_page_pixels=1_000,
        ).extract(source)
```

- [ ] **Step 9: Run focused and complete diagnostic/extractor tests**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest \
  tests/test_safe_logging.py \
  tests/test_estimate_taxonomy.py \
  tests/test_extractor.py -q
```

Expected: every test passes; the fallback retains `KITCHEN`, diagnostics omit
all protected sentinels, real PDF failures report page 1, and the assembly
error remains a `RuntimeError`.

- [ ] **Step 10: Commit the diagnostic and error-boundary change**

```bash
git add \
  ocr-worker/src/lisno_ocr/safe_logging.py \
  ocr-worker/src/lisno_ocr/extractor.py \
  ocr-worker/tests/test_safe_logging.py \
  ocr-worker/tests/test_extractor.py
git commit -m "fix: preserve pages when estimate classification fails"
```

### Task 3: Add safe, correlated worker diagnostics

**Files:**
- Modify: `ocr-worker/tests/test_worker.py:1-20,560-650`
- Modify: `ocr-worker/src/lisno_ocr/worker.py:1-20,226-286,403-439,491-492`

**Interfaces:**
- Consumes: `classify_failure(error: Exception) -> WorkerFailure`
- Consumes: `safe_exception_summary(error: BaseException) -> str`
- Produces: `_safe_message(error: Exception) -> str` that returns the original bounded message only for known `ExtractionError` instances.
- Produces: worker lifecycle log fields `job_id`, `kind`, `duration_seconds`, `failure_code`, and `exception_type`.

- [ ] **Step 1: Add failing worker logging and redaction tests**

Add `import logging` to the test imports, then add:

```python
def test_worker_logs_failure_context_and_keeps_unknown_details_out_of_ui(
    caplog,
):
    api = FakeApi([job()])
    protected_values = (
        "claim-1",
        "Bearer worker-secret",
        "taxonomy-secret",
        "payload-secret",
    )
    caplog.set_level(logging.INFO, logger="lisno_ocr.worker")

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(
            error=RuntimeError(" ".join(protected_values))
        ),
        sleep=lambda _seconds: None,
        max_iterations=1,
    )

    failure = api.failed[0][1]
    assert failure.code == "OCR_FAILED"
    assert failure.message == "The OCR worker could not process the source."
    assert "event=job_failed" in caplog.text
    assert "job_id=job-1" in caplog.text
    assert "kind=project_design" in caplog.text
    assert "failure_code=OCR_FAILED" in caplog.text
    assert "exception_type=RuntimeError" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "extract" in caplog.text
    assert all(value not in failure.message for value in protected_values)
    assert all(value not in caplog.text for value in protected_values)


def test_worker_logs_completed_page_count(caplog):
    api = FakeApi([job()])
    pages = [object(), object()]
    caplog.set_level(logging.INFO, logger="lisno_ocr.worker")

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(pages=pages),
        sleep=lambda _seconds: None,
        max_iterations=1,
    )

    assert "event=job_started job_id=job-1 kind=project_design" in caplog.text
    assert "event=job_completed job_id=job-1 kind=project_design" in caplog.text
    assert "page_count=2" in caplog.text
```

Extend `test_fail_callback_outage_is_bounded_and_polling_continues` with the
`caplog` fixture, set the worker logger to `ERROR`, and change the final
callback error to:

```python
        fail_errors=[
            OcrError("callback unavailable"),
            OcrError("callback unavailable"),
            RuntimeError(
                "claim-1 Bearer worker-secret taxonomy-secret payload-secret"
            ),
        ],
```

Then assert:

```python
    assert "event=failure_callback_exhausted job_id=job-1" in caplog.text
    assert "attempts=3" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "fail" in caplog.text
    assert "claim-1" not in caplog.text
    assert "Bearer worker-secret" not in caplog.text
    assert "taxonomy-secret" not in caplog.text
    assert "payload-secret" not in caplog.text
```

- [ ] **Step 2: Run worker diagnostics tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest \
  tests/test_worker.py::test_worker_logs_failure_context_and_keeps_unknown_details_out_of_ui \
  tests/test_worker.py::test_worker_logs_completed_page_count \
  tests/test_worker.py::test_fail_callback_outage_is_bounded_and_polling_continues -q
```

Expected: logging assertions fail and the unknown `RuntimeError` message,
including the protected sentinels, is still exposed by the current
`_safe_message()` implementation.

- [ ] **Step 3: Implement safe unknown-error messaging**

Import `ExtractionError` from `contracts`. Replace `_safe_message()` with:

```python
def _safe_message(error: Exception) -> str:
    if not isinstance(error, ExtractionError):
        return "The OCR worker could not process the source."
    message = " ".join(str(error).split())
    message = message.partition("Traceback")[0].strip()
    if not message:
        message = "The OCR worker could not process the source."
    return message[:500]
```

Known `PdfRenderError`, `OcrError`, `InvalidSourceError`, and
`ResultRejectedError` messages remain unchanged.

- [ ] **Step 4: Implement lifecycle and failure logging**

Add:

```python
import logging

from .safe_logging import safe_exception_summary

logger = logging.getLogger(__name__)
```

After a job is claimed, capture `started_at = time.monotonic()` and log:

```python
        logger.info(
            "event=job_started job_id=%s kind=%s",
            claimed.id,
            claimed.kind,
        )
```

After the `worker_api.complete` callback succeeds, log:

```python
            logger.info(
                "event=job_completed job_id=%s kind=%s "
                "page_count=%d duration_seconds=%.3f",
                claimed.id,
                claimed.kind,
                len(pages),
                time.monotonic() - started_at,
            )
```

Store extraction output in a `pages` local before passing it to `complete`.
Replace the current exception body with:

```python
        except Exception as error:
            failure = classify_failure(error)
            logger.error(
                "event=job_failed job_id=%s kind=%s "
                "duration_seconds=%.3f failure_code=%s "
                "exception_type=%s exception=%s",
                claimed.id,
                claimed.kind,
                time.monotonic() - started_at,
                failure.code,
                type(error).__name__,
                safe_exception_summary(error),
            )
            _report_failure_with_retry(
                worker_api,
                claimed.id,
                failure,
                sleep,
            )
```

Update `_report_failure_with_retry()` so the final callback exception retains
redacted exception-chain locations:

```python
        except Exception as error:
            if attempt + 1 < attempts:
                sleep(initial_backoff_seconds * (2**attempt))
                continue
            logger.error(
                "event=failure_callback_exhausted "
                "job_id=%s attempts=%d exception_type=%s exception=%s",
                job_id,
                attempts,
                type(error).__name__,
                safe_exception_summary(error),
            )
```

Do not use `logger.exception()` or `exc_info` on either path; both would format
the raw exception message and could leak the protected values proven by the
tests.

Configure command-line logging in `main()` without adding a new environment
contract:

```python
def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    run_worker(WorkerSettings.from_environment())
```

- [ ] **Step 5: Run the worker suite**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
```

Expected: every worker test passes, failure callbacks remain bounded, unknown
details stay out of the persisted UI message, and internal logs retain the
redacted exception class and code locations.

- [ ] **Step 6: Commit worker diagnostics**

```bash
git add ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_worker.py
git commit -m "feat: log OCR worker failures with safe correlation"
```

### Task 4: Remove Mongoose warnings and repair worker compare-and-set queries

**Files:**
- Modify: `backend/tests/mongo-repository.test.ts:320-430,674-688`
- Modify: `backend/src/services/estimate-design.service.ts:441-455,836-850,940-949,1190-1209,3204-3224`
- Modify: `backend/src/repositories/mongo.ts:199,264-267,596-599,758-777,853-856,879-897,918-958,966-1012,1213-1219,1249-1284,1363-1377`

**Interfaces:**
- Consumes: Mongoose `findOneAndUpdate(filter, update, options)`.
- Produces: all return-after-update calls use `returnDocument: "after"`.
- Produces: `completeExtractionJob()` and `failExtractionJob()` issue their full compare-and-set filters through `findOneAndUpdate()`.

- [ ] **Step 1: Change query-contract tests first**

In the client-linking and revision-decision expectations, replace:

```typescript
expect.objectContaining({ new: true })
```

and:

```typescript
{ new: true, runValidators: true }
```

with:

```typescript
expect.objectContaining({ returnDocument: "after" })
```

and:

```typescript
{ returnDocument: "after", runValidators: true }
```

For the stale completion test, spy on the correct method and assert the full
filter and supported options:

```typescript
const legacyUpdate = vi.spyOn(
  DesignExtractionJobModel,
  "findByIdAndUpdate"
).mockImplementation(() => {
  throw new Error("legacy findByIdAndUpdate called");
});
const update = vi.spyOn(
  DesignExtractionJobModel,
  "findOneAndUpdate"
).mockReturnValueOnce({
  lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
} as never);

await expect(
  createMongoRepository().completeExtractionJob(
    "job-stale",
    "old-claim",
    "2026-07-27T10:03:00.000Z"
  )
).rejects.toBeInstanceOf(RepositoryConflictError);

expect(legacyUpdate).not.toHaveBeenCalled();
expect(update).toHaveBeenCalledWith(
  {
    _id: "job-stale",
    status: "processing",
    claimId: "old-claim",
    leaseExpiresAt: { $gt: new Date("2026-07-27T10:03:00.000Z") }
  },
  expect.objectContaining({
    $set: expect.objectContaining({ status: "designer_review" })
  }),
  { returnDocument: "after", runValidators: true }
);
```

Change the missing-completion and missing-failure tests to mock
`findOneAndUpdate()` instead of `findByIdAndUpdate()`. Capture the failure
update spy in the existing missing-failure test and, after asserting the
`RepositoryNotFoundError`, assert the complete query contract:

```typescript
expect(update).toHaveBeenCalledWith(
  {
    _id: "job-missing",
    status: "processing",
    claimId: "claim-missing",
    leaseExpiresAt: { $gt: new Date("2026-07-27T10:03:00.000Z") }
  },
  {
    $set: {
      status: "processing_failed",
      completedAt: new Date("2026-07-27T10:03:00.000Z"),
      leaseExpiresAt: null,
      claimId: null,
      failureCode: "OCR_FAILED",
      failureMessage: "OCR failed"
    }
  },
  { returnDocument: "after", runValidators: true }
);
```

- [ ] **Step 2: Run the Mongo repository tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/mongo-repository.test.ts
```

Expected: option expectations fail on `new: true`; completion/failure tests
show that production still invokes `findByIdAndUpdate()`.

- [ ] **Step 3: Replace every deprecated production option**

Replace the 19 production occurrences reported by:

```bash
rg -n "new:\\s*true" backend/src
```

The replacements are:

```typescript
{ new: true, runValidators: true }
// becomes
{ returnDocument: "after", runValidators: true }

{ upsert: true, new: true, updatePipeline: true }
// becomes
{ upsert: true, returnDocument: "after", updatePipeline: true }

{ new: true, sort: { queuedAt: 1, _id: 1 }, runValidators: true }
// becomes
{
  returnDocument: "after",
  sort: { queuedAt: 1, _id: 1 },
  runValidators: true
}
```

Apply the same property substitution in:

- `backend/src/services/estimate-design.service.ts` at the annotation draft,
  estimate claim, lease renewal, failure, and frozen-job transitions;
- `backend/src/repositories/mongo.ts` at lead/project/task updates, version
  sequence allocation, design-version update, extraction claim/renew/complete/
  fail/retry/recovery, design-section update, and revision decision.

- [ ] **Step 4: Repair completion and failure query methods**

In `completeExtractionJob()`, change the model method while retaining this
complete update:

```typescript
const query = DesignExtractionJobModel.findOneAndUpdate(
  {
    _id: id,
    status: "processing",
    claimId,
    leaseExpiresAt: { $gt: date(completedAt) }
  },
  {
    $set: {
      status: "designer_review",
      completedAt: date(completedAt),
      leaseExpiresAt: null,
      claimId: null,
      failureCode: null,
      failureMessage: null
    }
  },
  { returnDocument: "after", runValidators: true }
);
```

In `failExtractionJob()`, use the same compare-and-set filter and retain this
complete failure update:

```typescript
const query = DesignExtractionJobModel.findOneAndUpdate(
  {
    _id: id,
    status: "processing",
    claimId,
    leaseExpiresAt: { $gt: date(completedAt) }
  },
  {
    $set: {
      status: "processing_failed",
      completedAt: date(completedAt),
      leaseExpiresAt: null,
      claimId: null,
      failureCode,
      failureMessage
    }
  },
  { returnDocument: "after", runValidators: true }
);
```

Keep the existing update documents and
`throwExtractionJobClaimError(id, session)` behavior unchanged.

- [ ] **Step 5: Verify focused backend behavior and deprecation removal**

Run:

```bash
cd backend
npm test -- tests/mongo-repository.test.ts
npm run typecheck
```

Then run from the repository root:

```bash
rg -n "new:\\s*true" backend/src
```

Expected: repository tests and typecheck pass; `rg` returns no production
matches.

- [ ] **Step 6: Commit backend query hardening**

```bash
git add \
  backend/src/services/estimate-design.service.ts \
  backend/src/repositories/mongo.ts \
  backend/tests/mongo-repository.test.ts
git commit -m "fix: harden extraction Mongo update queries"
```

### Task 5: Full verification, real-PDF smoke, runtime smoke, review, and PR update

**Files:**
- Verify only; production and test changes are committed by Tasks 1-4.
- Existing draft PR: `Murthy-sys/lisno#1`

**Interfaces:**
- Consumes: all behavior produced by Tasks 1-4.
- Produces: a clean, reviewed branch pushed to
  `origin/feature/estimate-design-image-review`.

- [ ] **Step 1: Run every OCR worker test**

```bash
cd ocr-worker
.venv/bin/python -m pytest -q
```

Expected: all tests pass. The installed Paddle model smoke may emit only the
known optional `ccache` warning and PyMuPDF SWIG deprecation warnings.

- [ ] **Step 2: Run backend tests, typecheck, and production build**

```bash
cd backend
npm test
npm run typecheck
npm run build
```

Expected: all commands exit zero and the Mongoose `new` deprecation warning
does not appear.

- [ ] **Step 3: Run frontend regression tests, typecheck, and build**

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Expected: all commands exit zero. Existing MSW unhandled-request diagnostics
and the Vite chunk-size advisory may remain non-failing.

- [ ] **Step 4: Smoke-test the exact six-page and complete PDFs**

Run from `ocr-worker` for the exact six-page stored upload:

```bash
.venv/bin/python -c "from pathlib import Path; from lisno_ocr.contracts import EstimateTaxonomy,TaxonomyTerm,Crop; from lisno_ocr.extractor import Extractor; source=Path('../backend/uploads/94a42828-060c-4026-8bb8-1f7dd28bd045.pdf'); rooms=tuple(TaxonomyTerm(term_id,label,()) for term_id,label in (('room-living','Living & Dining'),('room-master','Master Bedroom'),('room-utility','Balcony / Utility'),('room-kitchen','Kitchen'),('room-office','Home Office/Study'))); scopes=tuple(TaxonomyTerm(term_id,label,aliases) for term_id,label,aliases in (('FC','False Ceiling',('false ceiling','ceiling plan','rcp','reflected ceiling')),('FL','Flooring',('flooring','floor plan','floor finish')),('CA','Carpentry',('carpentry','woodwork','joinery')),('CV','Civil',('civil','masonry')),('EL','Electrical',('electrical','lighting','power')),('PA','Painting',('painting','paint')))); pages=Extractor(render_scale=2,estimate_taxonomy=EstimateTaxonomy(rooms,scopes)).extract(source,mode='estimate_design'); assert len(pages)==6; assert pages[-1].sections[0].label=='KITCHEN'; assert pages[-1].sections[0].proposal.room.id=='room-kitchen'; assert all(len(page.sections)==1 and page.sections[0].crop==Crop(0,0,page.width,page.height) and page.sections[0].image_base64==page.image_base64 for page in pages); print(source.name,len(pages),pages[-1].sections[0].label)"
```

Then run the supplied complete PDF:

```bash
.venv/bin/python -c "from pathlib import Path; from lisno_ocr.contracts import EstimateTaxonomy,TaxonomyTerm,Crop; from lisno_ocr.extractor import Extractor; source=Path('/Users/apple/Downloads/AMIT - FINAL 2D (19-05-2026) (1).pdf'); rooms=tuple(TaxonomyTerm(term_id,label,()) for term_id,label in (('room-living','Living & Dining'),('room-master','Master Bedroom'),('room-utility','Balcony / Utility'),('room-kitchen','Kitchen'),('room-office','Home Office/Study'))); scopes=tuple(TaxonomyTerm(term_id,label,aliases) for term_id,label,aliases in (('FC','False Ceiling',('false ceiling','ceiling plan','rcp','reflected ceiling')),('FL','Flooring',('flooring','floor plan','floor finish')),('CA','Carpentry',('carpentry','woodwork','joinery')),('CV','Civil',('civil','masonry')),('EL','Electrical',('electrical','lighting','power')),('PA','Painting',('painting','paint')))); pages=Extractor(render_scale=2,estimate_taxonomy=EstimateTaxonomy(rooms,scopes)).extract(source,mode='estimate_design'); assert len(pages)==34; assert all(len(page.sections)==1 and page.sections[0].crop==Crop(0,0,page.width,page.height) and page.sections[0].image_base64==page.image_base64 for page in pages); print(source.name,len(pages),pages[-1].sections[0].label)"
```

Expected outputs:

```text
94a42828-060c-4026-8bb8-1f7dd28bd045.pdf 6 KITCHEN
AMIT - FINAL 2D (19-05-2026) (1).pdf 34 MBR & COMMON VANITY
```

- [ ] **Step 5: Verify the restarted development stack**

Stop the pre-change `npm run dev` process so the Python worker is not left
running old source, then restart from `backend`:

```bash
npm run dev
```

In the authenticated estimator UI, use **Retry extraction** on the failed
`AMIT - FINAL 2D - pages 1-6.pdf` upload for estimate
`estimate-1848c1cd-0d7d-4e2b-ada1-cfbde485515b`.

Expected terminal evidence:

```text
event=job_started
event=job_completed
page_count=6
```

The terminal must not emit Mongoose's
`the new option for findOneAndUpdate() and findOneAndReplace() is deprecated`
warning.
The upload must reach estimator review with six full-page drawings.

- [ ] **Step 6: Run branch hygiene checks**

```bash
git diff --check
git status --short
git log -6 --oneline
```

Expected: no unstaged/untracked implementation files, no whitespace errors,
and the design plus implementation commits appear at the branch tip.

- [ ] **Step 7: Request independent code review**

Use `superpowers:requesting-code-review` to review the complete diff from
`6c2df3f` through `HEAD`. Resolve every Critical and Important finding with a
fresh failing regression where behavior changes, then rerun the affected
focused and full suites.

- [ ] **Step 8: Push the verified commits and confirm the draft PR**

```bash
git push origin feature/estimate-design-image-review
gh pr view 1 --repo Murthy-sys/lisno \
  --json number,title,url,state,isDraft,baseRefName,headRefName
```

Expected: the push succeeds and PR #1 remains open as a draft from
`feature/estimate-design-image-review` into `master`.

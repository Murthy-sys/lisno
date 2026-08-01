# Estimate PDF Classifier Resilience Design

## Problem

The stored six-page AMIT PDF is valid and renders successfully. Extraction
fails only when the worker receives the failed estimate's taxonomy.

Page 6 has the embedded title `KITCHEN`. While comparing that one-token title
with the three-token room term `Home Office/Study`,
`estimate_taxonomy._phrase_similarity()` calculates an empty fuzzy-match
window and calls `max()` with no candidates. The resulting `ValueError` is
caught by the broad exception boundary around the complete PDF page pipeline
and is incorrectly converted to:

`PDF_RENDER_FAILED: A PDF page could not be rendered.`

The worker reports the bounded UI message but does not log the original
exception chain. Separately, Mongoose 9 emits a deprecation warning every time
an update query uses `{ new: true }`.

## Goals

- Extract the exact six-page file successfully with its real estimate taxonomy.
- Treat an impossible fuzzy-match window as "no taxonomy match", not an error.
- Ensure mapping/classification failures never discard an otherwise valid
  full-page drawing.
- Reserve `PDF_RENDER_FAILED` for PDF source validation, opening, page
  dimension validation, rasterization, or pixel conversion failures.
- Keep UI errors bounded and safe while logging actionable diagnostics
  server-side.
- Remove the repeated Mongoose deprecation warnings.
- Correct the two generic extraction-job conditional updates that currently
  pass a compound filter to `findByIdAndUpdate()`.
- Preserve the existing title-based mapping, exact estimate-item assignment,
  Miscellaneous fallback, annotations, and non-blocking client submission.

## Non-goals

- Incremental page publication or object-storage result references.
- Replay-safe completion callbacks or automatic transient retry scheduling.
- Changing the current page, pixel, output-size, or processing-time safety
  budgets.
- Changing client-submission eligibility.
- Changing the estimate mapping catalogue or matching thresholds.

Those larger extraction-transport items remain in
`docs/estimate-design-extraction-pending.md`.

## Design

### 1. Make fuzzy matching total

`_phrase_similarity()` will explicitly return `(0.0, 0)` when its calculated
minimum comparison length is greater than its maximum comparison length.

This is mathematically a non-match: there is no valid token window to compare.
It must not be represented as an exception. Existing exact, fuzzy, ambiguity,
specificity, and confidence behavior remains unchanged.

### 2. Make estimate classification best-effort per page

Title detection and full-page image extraction remain required. Taxonomy
classification is advisory.

When an unexpected exception occurs while constructing a page's estimate
proposal:

1. Log a redacted exception-chain summary with the page number and
   `stage=estimate_classification`.
2. Preserve the detected title.
3. Emit an empty room/scope proposal with zero confidence.
4. Continue extracting and publishing the page.

The backend will still run its existing exact estimate-item title mapping.
When that mapping is absent or ambiguous, the drawing remains visible under
Miscellaneous. No valid rendered page is dropped because advisory
classification failed.

### 3. Correct the PDF error boundary

Only these PDF source/render operations may produce `PdfRenderError`:

- opening the PDF;
- validating that the PDF has at least one page and remains within the
  configured page-count safety budget;
- validating page dimensions against the pixel budget;
- creating the PyMuPDF pixmap;
- converting pixmap samples to a Pillow image.

Empty-document and over-budget page-count failures intentionally retain their
existing `PDF_RENDER_FAILED` code for backward compatibility; the safety
budgets themselves do not change.

The renderer will attach the one-based page number to safe render failures.
The broad wrapper around title extraction, classification, image encoding, and
page assembly will be removed.

Known extraction errors retain their existing failure codes. Unexpected
non-render exceptions are logged with their redacted exception-chain summary
and are reported to the UI as the generic safe `OCR_FAILED` message, never as
a fabricated PDF render failure.

### 4. Add worker diagnostics without exposing private data

The worker will use Python logging and emit structured, single-line lifecycle
events, plus a redacted exception-chain summary when an exception causes
failure. The summary contains only exception class names and bounded,
sanitized code-basename/function/line locations. It never formats exception
messages, source lines, or traceback locals, so exception text cannot leak
claim tokens, authorization headers, source bytes, image payloads, or taxonomy
contents. Lifecycle events cover:

- job claimed/started;
- job completed, including page count and duration;
- job failed, including job ID, kind, duration, failure code, and exception
  class;
- failure-callback retry exhaustion.

The same redacted formatter is used for advisory-classification and
failure-callback errors. Raw `logger.exception()` / `exc_info` output is not
used on these paths. The backend/UI failure contract remains the bounded safe
code and message.

### 5. Remove Mongoose 9 deprecations

All production query options using `{ new: true }` will use
`{ returnDocument: "after" }`, which has identical return-after-update
semantics in the installed Mongoose version.

Warnings will not be suppressed globally. Tests that assert query options will
assert the supported option.

### 6. Correct conditional generic worker updates

The generic project extraction repository has two completion/failure methods
that provide a compound compare-and-set filter to `findByIdAndUpdate()`.
Mongoose treats that object as the `_id` value instead of as a filter.

Those calls will use `findOneAndUpdate()` while preserving their existing
status, claim-token, and lease predicates. Tests will spy on the correct model
method and assert the full conditional filter.

## Data flow after the change

1. The worker claims and downloads an estimate PDF.
2. Each page's embedded title is read and the page is rasterized once.
3. The full-page PNG is generated.
4. Taxonomy matching either returns a proposal or safely degrades to an empty
   proposal while retaining the title.
5. The backend applies its existing exact estimate-item mapping.
6. Exact matches are grouped under their estimate item; all other drawings are
   stored under Miscellaneous.
7. Actual extraction failures retain accurate failure codes and diagnostics.

No schema migration or API response-shape change is required.

## Test strategy

Implementation will follow red-green TDD.

### OCR unit regressions

- A one-token title compared with a longer taxonomy term returns no match and
  does not throw.
- `KITCHEN` still matches the exact `Kitchen` room when longer unrelated room
  terms are present.
- Exact, fuzzy, ambiguity, and bounded-window tests remain green.

### OCR integration regressions

- A generated multi-page estimate PDF with a final one-token title and the
  production-shaped taxonomy emits every full-page section.
- A forced taxonomy-classification exception retains the detected title and
  emits an empty proposal instead of failing extraction.
- Redacted exception summaries retain exception classes, cause-chain classes,
  and bounded function/line locations while omitting protected values present
  in exception messages.
- A forced PDF-open failure remains `PDF_RENDER_FAILED`.
- A forced pixmap failure remains `PDF_RENDER_FAILED` and identifies the page.
- A forced Pillow pixel-conversion failure remains `PDF_RENDER_FAILED` and
  identifies the page.
- A non-render processing exception is not classified as a PDF render failure.
- Worker failure logging contains correlation metadata and redacted
  exception-chain locations but no claim token or other protected sentinel.

### Backend regressions

- Mongoose update calls use `returnDocument: "after"` and no production call
  uses the deprecated `new` option.
- Generic completion/failure uses `findOneAndUpdate()` with the full
  compare-and-set filter.

### Verification

- Run the focused OCR and backend suites.
- Run all backend, frontend, and OCR tests plus typecheck/build checks.
- Extract the exact stored six-page PDF with the failed estimate's taxonomy.
- Extract the supplied complete 34-page PDF with the same taxonomy.
- Confirm every source page produces one full-page drawing and page 6's
  taxonomy proposal resolves its room to `Kitchen`.
- Start the development backend and verify that extraction no longer emits the
  Mongoose `new` option warning.

## Rollout and rollback

The change is backward-compatible and requires no data migration. It will be
committed in independently reviewable parts: OCR resilience/diagnostics,
Mongoose query cleanup, and regression coverage.

If rollback is required, these commits can be reverted without modifying
stored uploads, extracted drawings, annotations, or estimate records.

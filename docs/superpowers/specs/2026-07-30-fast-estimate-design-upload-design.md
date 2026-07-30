# Fast Estimate Design Upload and Extraction Design

## Goal

Make design-plan uploads understandable and make title-block based PDF extraction
fast and reliable for estimate documents such as the supplied AMIT final-design
PDF. The upload must show real transfer progress, while one full-page drawing is
created for every titled PDF page.

## Scope

This change covers estimator/sales design-plan uploads and the OCR worker.
It preserves the existing room/scope mapping, drawing revision, crop annotation,
and client-approval flows.

## Upload progress

The design-upload request uses a dedicated multipart transport backed by
`XMLHttpRequest`. Its upload progress callback reports actual transferred bytes
and renders an accessible 0-100 percent progress bar in the design-upload
workspace. The form prevents a duplicate submission while the request is active.

The bar remains visible until the upload API responds successfully or fails. On
failure, the selected file remains available for another attempt and the existing
error treatment is shown. A successful upload clears the selection and continues
to poll the existing extraction workspace.

## Upload and recovery controls

The native file input must not appear as an unstyled browser control. The upload
form presents a labeled `Choose file` button, the selected filename and file size,
and a separate primary `Upload design plan` action. The filename wraps safely on
small screens and the controls remain keyboard-accessible through the underlying
file input.

Failed extractions retain a visually distinct `Retry extraction` button beside
the failure status. It uses the existing secondary-button visual language while
making its recovery purpose clear, includes a pending `Retrying extraction…`
state, and remains usable on mobile layouts. The failure message remains visible
above the retry action.

## Extraction states

After the upload API succeeds, the UI uses the persisted upload state to show a
separate extraction stage: queued, processing, ready for estimator review, or
failed. Extraction progress is intentionally indeterminate because the existing
worker contract does not provide a durable per-page progress event. The display
must not imply a false percentage for OCR.

## Title-block PDF fast path

The supplied design PDF has a consistent lower title block. Each inspected page
contains exactly one canonical `TITLE:` field, such as `TV UNIT`, `DINING -
SEATER UNIT`, or `PUJA - UNIT`. Repeated labels in plan, elevation, detail, and
material areas are not estimate mapping titles.

For eligible PDF pages, the worker must:

1. Render the page at a bounded OCR-appropriate resolution.
2. OCR only the lower title-block band and extract the one canonical `TITLE:`
   value.
3. Classify that title through the existing estimate room/scope taxonomy and
   title normalization logic.
4. Emit exactly one full-page drawing proposal using the rendered page as its
   crop and image.

The full-page drawing deliberately retains all technical context: the title
block, plans/elevations/details, legends, material schedules, dimensions, and
notes. It therefore remains compatible with the existing crop editor,
annotations, revisions, and review workflow.

If the title-block OCR does not find a canonical title, extraction falls back to
the existing full-page OCR and panel-detection behavior so non-standard document
formats remain supported.

## Large-PDF reliability

PDF rendering adapts the page scale down only when the configured pixel budget
would otherwise be exceeded. The worker still observes the configured maximum
page count, output-byte budget, and processing deadline. Limit failures remain
classifiable and explain whether the PDF could not be rendered, exceeds a safe
bound, or could not be read by OCR.

The fast path avoids full-sheet text recognition and multi-panel region
association for title-block documents, reducing CPU, memory, and result payload
work. It does not merely increase timeouts or remove safety limits.

## Compatibility

- Existing title normalization and taxonomy matching remain the source of truth.
- A title such as `TV UNIT - BEDROOM 1` continues to map to the established
  Bedroom 1 room and TV Unit scope when that mapping is available.
- Existing revision, annotation, and client-approval APIs do not change.
- Existing non-PDF and non-title-block document extraction behavior remains
  available through the fallback path.

## Testing

- Multipart upload tests verify byte-progress updates, successful completion,
  duplicate-submission prevention, and error cleanup.
- UI tests verify the selected filename, accessible choose-file control, and
  styled retry action remain available in ready, uploading, and failed states.
- Worker tests verify title-band OCR produces one full-page proposal for each
  supplied-page fixture and preserves taxonomy proposals.
- Worker tests verify missing title-block text reaches the current fallback path.
- Rendering tests verify oversized PDF pages are safely downscaled rather than
  rejected solely because the default scale exceeds the pixel budget.
- Existing frontend, backend, and OCR suites remain green.

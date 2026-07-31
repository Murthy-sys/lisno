# Six-Page Estimate Upload and Client Annotation Design

## Goal

Deliver a deliberately limited, reliable milestone:

- an estimator can upload an estimate-design PDF containing one through six pages;
- extraction creates exactly one full-page drawing for every PDF page;
- a missing or unusable title never fails extraction and is stored as Misc;
- the estimator can submit extracted drawings without first verifying or assigning them;
- the client can preview every submitted drawing and save annotations.

Larger PDFs and broader production hardening remain explicitly pending.

## Supported contract

### Upload and extraction

- Estimate-design PDFs containing one through six pages are the supported milestone.
- The worker opens the PDF once and processes every page in order.
- Every estimate page produces exactly one section and therefore one drawing.
- The section crop is the complete rendered page:
  - `x = 0`
  - `y = 0`
  - `width = page.width`
  - `height = page.height`
- The section image is the same normalized image as the rendered page. Estimate extraction never invokes the legacy multi-region crop fallback.
- PDFs above six pages are outside this milestone and must return a clear unsupported-page-count failure rather than partially publishing drawings.

### Title handling and mapping

- Embedded title text remains the first title source.
- Bounded title OCR may be used when embedded text is unavailable.
- When neither source produces a usable title, the worker emits:
  - `detectedTitle: "Unidentified drawing — page <n>"`
  - `displayTitle: "Unidentified drawing — page <n>"`
  - OCR confidence `0`
  - null worker room/scope suggestions
- The backend persists every unidentified page using the true-null Misc tuple:
  - `roomId: null`
  - `scopeSectionId: null`
  - `catalogueId: null`
  - `mappingStatus: "misc"`
- Identified titles continue through the existing backend-owned deterministic estimate-item resolver. They are not forced into Misc.
- Missing, ambiguous, or unmatched mapping never fails extraction.

### Backend publication invariant

For estimate-design completion, the backend accepts only:

- one through six contiguous pages;
- exactly one section per page;
- a section crop equal to that page’s full dimensions;
- section image bytes equal to that page’s normalized image.

Malformed estimate results are rejected before publication. A valid six-page result commits exactly:

- six source pages;
- six active drawings;
- six immutable first revisions.

Project-design extraction keeps its existing multi-section behavior and is outside this change.

## Submission behavior

This milestone intentionally makes estimator submission permissive.

- The estimator submit button is enabled whenever at least one active drawing exists and a submit request is not already running.
- `verified`, `mappingStatus`, room assignment, and catalogue assignment do not block submission.
- The backend accepts coherent mapped or true-null Misc drawings without requiring `drawing.verified === true`.
- Submission still enforces:
  - authenticated estimator ownership;
  - an editable estimate lifecycle;
  - at least one active drawing and a current revision;
  - transactional consistency and immutable submitted revisions.
- Extraction with no completed drawings, unauthorized access, invalid mapping tuples, and terminal lifecycle conflicts remain errors.

This permissive rule is temporary and will be revisited in a later production-hardening task.

## Client review and annotations

- Submitted mapped drawings remain grouped by room and scope.
- Submitted unidentified or otherwise unresolved drawings appear under the existing client `Misc` group.
- The client can open the full-page preview for every drawing.
- Annotation drafts are saved through the versioned public annotation endpoint.
- A successful save is visible after query refresh or component remount.
- Approve and request-changes controls continue to work for Misc and mapped drawings.

## Progress presentation

- File transfer uses the existing real multipart upload percentage and remains visible until the upload API succeeds or fails.
- Extraction uses the existing queued/processing/review status loader and polling.
- No fabricated numerical extraction percentage is shown because the backend does not yet expose a trustworthy extraction-progress metric.

## Error behavior

- One missing page title: extraction succeeds and the page becomes Misc.
- One ambiguous title: extraction succeeds and the page becomes Misc.
- PDF above six pages: extraction fails with an allowlisted unsupported-page-count message and publishes nothing.
- Invalid worker page/section shape: backend rejects the complete request and publishes nothing.
- Upload API failure: the selected file and retry action remain visible.
- Annotation save conflict: the existing version-conflict message is shown and no annotation state is silently overwritten.

## Automated acceptance coverage

1. Generate a six-page PDF during the OCR worker test.
2. Assert pages `1..6`, one full-page section per page, identical page/section image, and no multi-region fallback.
3. Generate a six-page no-title PDF and assert deterministic unidentified titles and Misc-compatible proposals.
4. Complete a six-page backend result and assert six pages, drawings, and revisions.
5. Reject zero/multiple sections, non-full-page crops, mismatched images, and more than six estimate pages.
6. Render six estimator drawing rows and assert submit is enabled without verification or assignment.
7. Submit true-null Misc drawings and assert the client receives them.
8. Save a client annotation draft, refresh the workspace, and assert the annotation is restored.

## Deferred work

All work outside this milestone will be listed in an ordered pending-tasks document, including:

- replay-safe and idempotent completion;
- poison-job retry scheduling and attempt limits;
- worker transport reconciliation;
- PDFs above six pages and general bounded extraction;
- bulk-write optimization;
- production object storage and reconciliation;
- structured logging, readiness, probes, and operational rollout gates;
- restoring stricter estimator verification/submission policy.

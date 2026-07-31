# Full-Page Estimate Upload and Client Annotation Design

## Goal

Deliver a deliberately limited, reliable milestone:

- an estimator can upload an estimate-design PDF within the existing configured page limit;
- extraction creates exactly one full-page drawing for every PDF page;
- a missing or unusable title never fails extraction and is stored as Misc;
- the estimator can submit extracted drawings without first verifying or assigning them;
- the client can preview every submitted drawing and save annotations.

Six pages is the required regression fixture, not an extraction limit. Broader
production hardening remains explicitly pending.

## Supported contract

### Upload and extraction

- Estimate-design PDFs retain the existing configured page limit
  (`OCR_MAX_PDF_PAGES`, currently 50 by default).
- Six pages is the minimum production-representative acceptance fixture; page
  seven and later remain supported when they are within the configured limit.
- The worker opens the PDF once and processes every page in order.
- Every estimate page produces exactly one section and therefore one drawing.
- The extractor has no dropped or `unmapped` page outcome: every successfully
  rendered page is returned to the backend even when its title cannot be
  resolved.
- The section crop is the complete rendered page:
  - `x = 0`
  - `y = 0`
  - `width = page.width`
  - `height = page.height`
- The section image is the same normalized image as the rendered page. Estimate extraction never invokes the legacy multi-region crop fallback.
- PDFs above the configured safety limit retain the existing clear
  too-many-pages failure and publish no drawings.

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
- A unique title match uses the resolved estimate-item tuple. Repeated pages
  with the same normalized title use that same tuple and therefore appear in
  the same room/scope section.
- Missing, ambiguous, or unmatched mapping never fails extraction and never
  drops a drawing. The backend stores that drawing with the same true-null
  `misc` tuple, and the estimator/sales review UI shows it under
  **Miscellaneous** for later verification or assignment.
- `misc` is the only unresolved persisted state. No user-visible `unmapped`
  bucket or status is introduced.
- The API/database value remains `mappingStatus: "misc"`; estimator and client
  interfaces label that group **Miscellaneous**.

### Backend publication invariant

For ordinary estimate-design upload completion, the backend accepts only:

- one or more contiguous pages within the existing configured limit;
- exactly one section per page;
- a section crop equal to that page’s full dimensions;
- section image bytes equal to that page’s normalized image.

Malformed estimate results are rejected before publication. A valid result
with `N` pages commits exactly:

- `N` source pages;
- `N` active drawings;
- `N` immutable first revisions.

Project-design extraction keeps its existing multi-section behavior and is outside this change.
Queued single-drawing replacement completion keeps its existing page-image
contract, including its current empty-sections payload, and is not subjected
to the ordinary-upload section-shape rules.

## Submission behavior

This milestone intentionally makes estimator submission permissive.

- Whenever the estimator submit button is rendered, it has no `disabled`
  condition. Verification, mapping, upload status, and an in-flight submit do
  not disable it for this milestone.
- `verified`, `mappingStatus`, room assignment, and catalogue assignment do not block submission.
- Estimator/sales users may still verify and assign Misc drawings before
  submission, but those actions remain optional for this milestone.
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
- Submitted unidentified or otherwise unresolved drawings appear under the
  client **Miscellaneous** group.
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
- PDF above the configured safety limit: extraction fails with the existing
  allowlisted too-many-pages message and publishes nothing.
- Invalid worker page/section shape: backend rejects the complete request and publishes nothing.
- Upload API failure: the selected file and retry action remain visible.
- Annotation save conflict: the existing version-conflict message is shown and no annotation state is silently overwritten.

## Automated acceptance coverage

1. Generate a six-page PDF during the OCR worker test.
2. Assert pages `1..6`, one full-page section per page, identical page/section image, and no multi-region fallback.
3. Generate a six-page no-title PDF and assert deterministic unidentified titles and Misc-compatible proposals.
4. Complete a six-page backend result and assert six pages, drawings, and revisions.
5. Reject zero/multiple sections, non-full-page crops, mismatched images, and
   non-contiguous page numbers.
6. Render six estimator drawing rows and assert submit is enabled without verification or assignment.
7. Process a seventh page when the configured page limit permits it, protecting
   against an accidental six-page cap.
8. Resolve repeated identical titles to the same estimate tuple and render
   those drawings in one estimator section.
9. Persist absent, ambiguous, and unmatched titles as true-null Misc drawings;
   assert every source page still has one drawing and there is no unmapped
   bucket.
10. Submit true-null Misc drawings and assert the client receives them.
11. Save a client annotation draft, refresh the workspace, and assert the annotation is restored.

## Deferred work

All work outside this milestone will be listed in an ordered pending-tasks document, including:

- replay-safe and idempotent completion;
- poison-job retry scheduling and attempt limits;
- worker transport reconciliation;
- broader extraction memory, transport, and bulk-write bounds;
- bulk-write optimization;
- production object storage and reconciliation;
- structured logging, readiness, probes, and operational rollout gates;
- restoring stricter estimator verification/submission policy.

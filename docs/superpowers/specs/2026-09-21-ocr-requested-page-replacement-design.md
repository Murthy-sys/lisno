# OCR requested-page replacement — design specification

- Date: 2026-09-21
- Status: Draft for approval
- Classification: Substantial cross-stack workflow and persistence correction
- Affected areas: Designer upload UX, estimate plan-review API, estimate-design extraction completion, Mongo persistence, audit/history, and OCR regression coverage

## Goal

When a Client annotates an existing design page and requests a change, a Designer upload made for that request must revise the requested page/drawing lineage. It must not append the revised page, or the unchanged pages bundled with it, as additional pages.

The working PaddleOCR title extraction and title-based estimate mapping remain authoritative. The change must continue to recognize and preserve both 2D and 3D drawing pages from their titles; this work does not replace that classifier or mapping logic.

## Current behavior and evidence

The annotation save itself is not creating the duplicate page:

- `estimate-plan-review.service.ts::saveDraft` writes only `EstimatePlanAnnotationDraft` data keyed by Client and `sourcePageId`.
- `submitRequest` creates one immutable page-linked change request with the original `sourcePageId`, selected stable `drawingId` values, and their `requestedRevisionId` values. It does not create a source page.
- Client annotation geometry is projected onto the selected drawing revision while retaining the page-level request and source identity.

The duplicate is possible in the subsequent Designer upload path:

- `EstimateDesignUploads` exposes the ordinary `uploadEstimateDesign` action even while Client changes are open.
- `POST /estimates/:estimateId/design-uploads` contains only the estimate and file. It carries no change-request, source-page, drawing, or requested-revision identity.
- Ordinary OCR completion in `estimate-design.service.ts::completeWorkerJob` persists every returned OCR page as a new `EstimateDesignSourcePage`, creates a new drawing, and creates revision 1. It cannot infer that one page is a replacement.
- The existing targeted drawing replacement endpoint correctly preserves the stable drawing lineage and advances the original composite page, but it is a separate per-drawing interaction. Its queued PDF path requires one replacement drawing and does not support a full revised PDF containing the requested page plus unchanged pages.

The OCR worker already supplies the information needed for safe matching:

- In `estimate_design` mode, each PDF page becomes one full-page drawing proposal.
- The title block is preferred; OCR is the fallback.
- Each result contains a canonical `detectedTitle` and the existing room/scope proposal.
- The backend already applies `autoMapDrawingTitle` to that title. No new 2D/3D classification algorithm is required for this defect.

## Actors and workflow

### Client

1. Opens an existing plan page.
2. Draws annotations and saves a draft without changing page or revision history.
3. Submits the change request against the displayed page revision.
4. Confirms the detected drawing targets or submits unassigned page feedback.

### Designer

1. Opens the immutable Client request and its marked page.
2. If the request is unassigned, links it to one or more existing drawings before uploading a replacement.
3. Uploads a revised image or PDF from the request workspace. A PDF may contain the requested revised page and unchanged pages.
4. Sees which requested title/page was matched, which unrelated input pages were ignored, or why matching needs manual correction.
5. Reviews the new drawing revision and submits it through the existing Client review lifecycle.

### OCR worker

1. Uses the existing leased-job protocol and `estimate_design` extraction mode.
2. Extracts every input page and returns the existing title/mapping proposal contract.
3. Does not decide persistence identity and does not create or replace pages; the backend resolves the result against the immutable request target snapshot.

## Required behavior

### 1. Annotation save and submission

- Saving an annotation draft must change only the draft record and version.
- Submitting feedback must change only the request, targeted drawing review state, audit history, notifications, and workflow state already defined by the plan-review contract.
- Draft save and request submission must never create an upload, source page, drawing, or drawing revision.
- The submitted request must retain its original `sourcePageId`, target `drawingId`, and `requestedRevisionId` lineage.

### 2. Request-scoped replacement upload

Add a request-scoped multipart operation for staff, conceptually:

`POST /estimate-plan-change-requests/:requestId/replacement-upload`

The request contains:

- optimistic `version` for the change request;
- the replacement file;
- an idempotency key or equivalent durable upload identity.

The backend must atomically verify:

- the request exists, remains open, and belongs to the selected estimate;
- the actor is authorized for that estimate under the existing staff ownership rules;
- the request is assigned to at least one existing active drawing;
- every target is still open and its latest revision is exactly the stored `requestedRevisionId`/version lineage;
- no target already has a live replacement reservation.

The queued upload must store an immutable request snapshot. The minimum durable identity is:

- upload purpose: ordinary, direct drawing replacement, or plan-request replacement;
- `planChangeRequestId` and request version;
- original `replacementSourcePageId`;
- each target's `drawingId` and `requestedRevisionId`;
- the target's normalized title and existing mapping tuple used only for deterministic OCR matching.

Stable IDs remain the persistence join keys. Titles are matching evidence and presentation; they must never replace `drawingId`, `sourcePageId`, or revision identity.

### 3. OCR matching and page selection

For a request-scoped result, the backend must run a deterministic, fail-safe resolver:

1. Normalize the OCR `detectedTitle` with the existing title normalization.
2. Prefer one unique normalized-title match against the open request targets.
3. Where titles differ but the existing `autoMapDrawingTitle` result uniquely matches one target's complete room/scope/catalogue tuple, allow that unique match and record the reason.
4. Reject duplicate or ambiguous candidates; do not select by array order, page number, upload order, or fuzzy best guess.
5. Require every requested target selected for the upload to have exactly one match.

Input pages that do not match a requested target are reported as ignored and are not persisted as new source pages or drawings. This is how a complete revised PDF can leave all unchanged pages in place.

If any required target is missing or ambiguous, the completion fails atomically. The original plan remains current, no partial revisions/pages are published, reservations are released according to the existing retry contract, and the Designer can retry or use the existing per-drawing/manual fallback.

### 4. Revision and page replacement

For every uniquely matched target:

- create a new immutable `EstimateDesignRevision` on the existing `drawingId`;
- set `replacesRevisionId` to the request's targeted revision;
- preserve the existing mapping tuple and stable drawing identity;
- store the replacement image in an internal replacement source page owned by the request-scoped upload;
- mark the drawing unverified so the Designer reviews the extracted result;
- update the target to `replacement_submitted` with `resolvedByRevisionId`;
- advance the original `EstimatePlanPageRevision` under the original `sourcePageId`, replacing the matching patch and preserving all other patches.

When several targets belong to one original page, advance that plan page once with all successful replacement patches in the same transaction. The original page position and Client-facing page count remain unchanged.

Request-scoped replacement uploads and their internal source pages must be excluded from the ordinary Client page list. History remains available through drawing revisions and audit events.

### 5. Designer UX

- The open request workspace becomes the primary upload surface while Client changes are unresolved.
- It shows the marked current page, Client summary, original page identity, requested drawing titles, and target states.
- Provide one request-scoped revised-file upload that accepts the same safe PDF/image formats as the OCR pipeline.
- Keep the existing per-drawing replacement upload as a manual fallback.
- The ordinary upload control must not look like the way to answer an open Client request. During an open request, move it behind an explicit secondary “Add a new design page” action with explanatory copy so intentional additions remain possible without silently appending a replacement.
- After extraction, show matched targets, ignored unchanged pages, and ambiguous/missing-title failures without exposing storage references.
- Refresh the request, estimate workspace, plan workspace, workflow, and review queries after every queue, completion, retry, or failure transition.

### 6. OCR 2D/3D preservation

- Preserve `Extractor._extract_estimate_page`, title-block preference, OCR fallback, `detectedTitle`, estimate taxonomy proposals, and `autoMapDrawingTitle` behavior.
- Do not filter a page because its title describes a 2D plan, elevation, section, or 3D/perspective/render view when that title is accepted by the existing configured title taxonomy.
- Add regression fixtures/tests representing at least one accepted 2D title and one accepted 3D title. Both must reach the backend result with their title intact and remain eligible for request matching.
- Existing exclusions for legends, key plans, notes, dimensions, schedules, and ambiguous overview headings remain intact.

### 7. Concurrency, idempotency, and failure handling

- Request version, targeted revision identity, replacement reservation, extraction claim token, result ID, and Mongo transaction checks must all remain authoritative.
- Replaying the same upload/result returns the same outcome and must not create another page or revision.
- Two simultaneous uploads for the same target allow only one reservation.
- A Client update, withdrawal, approval, deletion, or newer replacement occurring while OCR runs makes the stale completion fail without publication.
- Storage persistence must use compensating cleanup when database persistence fails.
- Retry must reuse the failed upload/job and exact request snapshot rather than creating another ordinary upload.
- Deleting the original ordinary upload follows the existing withdrawal behavior for linked open requests; deleting a request-scoped replacement must not delete the original page.

## Scope

In scope:

- Request-scoped replacement upload API and operation registry/OpenAPI entry.
- Upload-purpose and immutable target-snapshot persistence.
- Backend OCR-result matching and transactional replacement publication.
- Designer request workspace and query invalidation changes.
- Focused OCR regression coverage for existing 2D/3D title extraction.
- Backend, frontend, and worker tests for page-count, identity, race, retry, and failure behavior.

Out of scope:

- Replacing PaddleOCR or redesigning the title classifier.
- Changing Client annotation tools or annotation geometry.
- Automatically deleting historical duplicate pages already stored.
- A production data migration or backfill.
- Fuzzy/AI semantic title matching when deterministic title/mapping evidence is ambiguous.
- Changing approved drawing history or approval immutability.

## Compatibility and migration

- Existing uploads without an explicit purpose remain ordinary unless they contain the established direct-drawing replacement fields. This preserves current records.
- New purpose and request-snapshot fields are nullable for historical documents; no live data rewrite is required.
- Existing direct drawing replacement routes and old queued replacements remain valid.
- Existing Client plan page IDs, order, annotations, links, and revision URLs remain stable.
- Historical duplicate pages are left untouched; any cleanup would require a separate migration specification, dry run, backup, conflict report, and approval.

## Authorization and audit

- Reuse the existing staff estimate-ownership policy; do not broaden Designer, Sales, Manager, Head, Client, or Super Admin access.
- Add the new route to the canonical route-operation registry, authorization contract, and OpenAPI inventory.
- Audit queue, match outcome, ignored-page count, failure reason, created revision IDs, original `sourcePageId`, and request/target identity. Do not record image bytes, annotations, private URLs, or storage references.

## Risks and controls

- **Duplicate titles:** require a unique match; fail safely instead of guessing.
- **Title changed in the revision:** allow only a unique complete mapping-tuple fallback or the manual per-target flow.
- **Multi-target partial publication:** build all mappings first and publish all replacements in one transaction.
- **Large full-plan PDFs:** retain current page, pixel, output-byte, and processing-time limits.
- **Stale request while OCR runs:** validate the immutable snapshot and current CAS state again inside the completion transaction.
- **Accidental new-page upload:** make request-scoped upload primary and ordinary addition explicit in the UX.
- **History loss:** append revisions and page revisions; never overwrite or delete the requested revision.

## Acceptance criteria

1. Saving an annotation draft and submitting it leave source-page, drawing, and revision counts unchanged.
2. A request-scoped image replacement creates a new revision on the requested `drawingId`; Client-facing page count and original page order remain unchanged.
3. A revised PDF containing one requested page and several unchanged pages replaces only the uniquely title-matched target. Unmatched pages are reported and are not added.
4. Two requested pages with distinct 2D/3D titles are uniquely matched and replaced atomically while all unrequested pages remain unchanged.
5. Missing, duplicate, or ambiguous OCR titles publish no page or drawing change and provide a retryable safe error.
6. Title matching never substitutes title text for stable request, page, drawing, or revision IDs.
7. The original `sourcePageId` remains the Client-visible page identity and receives one new `EstimatePlanPageRevision` containing the replacement patch set.
8. Open request targets move from `open` to `replacement_submitted` only after the matching revisions and plan-page revision commit.
9. Direct per-drawing replacement, initial ordinary upload, annotation geometry, approval history, and title-based room/scope/catalogue mapping continue to work.
10. Worker regression tests prove accepted 2D and 3D titles are extracted and returned unchanged enough for existing normalization/mapping, while current exclusion tests still pass.
11. Concurrent/stale/replayed completion tests prove one durable outcome with no duplicate pages, revisions, notifications, or audits.
12. Designer UI makes request-scoped replacement the primary action, keeps intentional new-page addition explicit, and renders loading, failure, retry, ignored-page, and success states accessibly.
13. Backend focused tests, replica-set transactional tests, frontend interaction/accessibility tests, OCR non-model tests, typechecks/builds, and repository hygiene checks pass or any unrelated baseline failures are classified.

## Assumptions and open decisions

- “Marked page” means the existing Client-visible plan page identified by the submitted change request's `sourcePageId`; the annotation overlay is feedback, not a new page asset.
- A Designer may upload a complete revised PDF. Pages not uniquely matched to open targets are treated as unchanged and ignored rather than appended.
- Intentional new pages remain supported through a separate explicit ordinary-upload action.
- No production cleanup of already duplicated pages is included. If historical cleanup is required, it will be designed as a separate migration after this behavior is fixed.
- The implementation plan must confirm the exact accepted 3D title vocabulary already configured in the current taxonomy and add regression fixtures without broadening classifier acceptance unintentionally.

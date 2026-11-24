# Estimator PDF preview matches the client-email proposal

Date: 2026-11-23
Status: Narrowed specification approved and implemented in Mode A. Verification results are recorded in the separate task plan. The implementation reuses the existing template without frontend or renderer changes.

## Goal and decision

Opening **View quotation PDF** in the estimator workspace must display the same proposal design and sections used for client-email attachments. A saved draft previews that design using its saved customer-visible data; a submitted quotation continues to open the rendition belonging to its selected review round.

The user's clarified requirement is only to reuse the styling of the PDF sent to the client when Sales clicks Submit. Reuse the existing proposal metadata factory and PDF renderer without modifying the template, adding PDF labels, adding viewer messages or changing the estimator screen. This is a small correction to the saved-preview input.

## Current behavior and evidence

- The supplied screenshot shows **Draft quotation · Version 1** with the legacy table-style **Interior Estimate** PDF.
- `frontend/src/features/leads/SalesQuotationPdfAction.tsx` selects a version-bound saved preview for editable drafts and legacy internal-review estimates. Submitted previews use `downloadCustomerRevisionPdf`, bound to a review-round ID.
- `backend/src/services/quotation-draft-pdf.service.ts:15` implements `readSavedQuotationPdf` for both staff and project quotation routes. It obtains the saved estimate, checks authorization/version/stage, projects customer-visible rows, and rechecks after rendering. It currently calls `toEstimateSnapshot(estimate, lead)` without proposal metadata.
- `backend/src/services/estimate-pdf.service.ts:852` selects the proposal booklet only when `input.proposal` exists. Passing `compact_client_delivery` alone still selects the legacy PDF when metadata is absent. This explains the screenshot.
- `backend/src/services/estimate-publication.service.ts:165` creates proposal metadata with `createEstimateProposal` and freezes it into the published snapshot. The existing template includes the cover, welcome, scope, detailed estimate, project price, payment schedule, workflow, exclusions, terms and acceptance pages. Pagination depends on content.
- `backend/src/services/estimate-delivery.service.ts:300` obtains email attachments through `renditions.readForRound`. `backend/src/services/estimate-revisions.service.ts:146` uses that same service for submitted previews with `audience=client`.
- The existing viewer already identifies draft/internal-review status and version. Keep those existing labels; the proposal cover is outside the change scope.
- Existing quotation/revision tests check draft access and version guards, but several only assert a PDF signature or mocked renderer input. They do not establish that the draft actually contains the proposal booklet.

These are source-code findings; no running application or real client email was inspected. The worktree contains substantial existing changes, including the PDF viewer, draft service, pricing presentation and proposal pages. Preserve them. The initial dirty-path set and relevant inspected diffs were captured during investigation; refresh them before implementation ownership is assigned. The earlier quotation-PDF-view documents are background context, not approval for this correction.

## Scope, requirements and UX

1. Attach fresh preview proposal metadata through the existing `createEstimateProposal` factory to the saved customer-visible snapshot. Reuse the publication defaults for terms, reference and prepared-by identity (`Team Lisno`); do not substitute the currently viewing staff member.
2. Keep both existing saved-preview routes aligned: the staff estimate PDF route with `audience=client` and the project quotation draft PDF route. Their shared service also serves Client drafts, which will receive the same corrected template without changed access rights.
3. Reuse the current multi-page proposal assets, typography, grouping and sections. Preserve current tax-inclusive pricing, rounding, PMC vendor-payable behavior, projected line amounts and private-field filtering.
4. Retain the existing **Draft quotation · Version N** and **Quotation in internal review · Version N** viewer titles and existing unsaved-edit warnings. Add no new PDF labels or viewer copy.
5. Preview metadata uses one timestamp captured for the request and the existing proposal defaults. Publication continues to freeze its own actual issuance metadata. Do not change date/validity rules or add new guidance.
6. Keep the existing viewer, download link, keyboard/focus behavior, close action, loading/error/retry states and stale-document cleanup. A failed proposal render must show a retrieval error instead of silently falling back to the legacy table.
7. Submitted previews remain bound to the selected review round and use its frozen metadata, amounts and existing customer-rendition visibility policy. Later draft edits must not alter the selected round's commercial content.

Non-goals: modifying the proposal template, cover or assets; adding PDF markers or viewer messages; editing the estimator screen or HTML Proposal tab; changing calculation formulas, permissions, publication or email workflows; updating historical documents; mobile-app changes; adding dependencies; sending emails; migrations or deployment.

## Contracts and invariants

- **API:** retain existing URLs, request parameters, PDF response MIME type, filenames and private/no-store headers. No new endpoint or persisted field is expected. Proposal metadata is an existing internal renderer input.
- **Identity:** use saved estimate ID/version for previews and estimate/review-round IDs for submissions. Reject stale versions, wrong stages, lost authorization and changed visibility before returning bytes.
- **Permissions:** preserve existing staff assignment/ownership and project-member checks. Other staff, clients or projects gain no access. The frontend remains a consumer of backend authorization.
- **Finance/privacy:** keep the saved integer-paise values and current customer projection. Preserve `includedPayablesPaise`, full saved payable totals and existing hidden-scope explanations. Do not expose internal margins or introduce a different financial source for the new layout.
- **State/side effects:** preview is a read. It must not save the draft, create review rounds, advance statuses, write publication records, persist preview artifacts, enqueue delivery, send mail or create audit events. Submitted rendition cache behavior is unchanged.
- **Compatibility:** legacy published rounds without proposal metadata continue to use their existing rendition behavior; do not synthesize new terms into historical snapshots. For the same round and unchanged visibility policy/state, the submitted preview and email delivery resolve the same rendition. Current visibility policy can invalidate a prior rendition, so byte equality to every previously sent email is not promised.
- **Operations:** no migration, cache-policy bump or new logging is required. Errors remain in the current API/viewer flow. Rollback is limited to the new preview metadata input while preserving pre-existing work; stored artifacts are untouched.

## Acceptance criteria

- **AC1: Template parity.** A real saved-draft PDF opened from the estimator uses the unmodified proposal renderer and section sequence used by Sales-submit client emails. Saved draft data and generation dates may differ from an issued round. Do not assert a fixed page count for arbitrary estimates.
- **AC2: Preview identity.** The viewer retains its current saved-version/stage titles and unsaved-edit warnings. Unsaved edits do not enter the PDF. A subsequent save invalidates the previous version request. No frontend copy or cover-label changes are introduced.
- **AC3: Pricing and privacy.** Verify customer-visible line amounts and final payable against saved values in the draft PDF. Preserve projected payable allocations, round-off, private-field filtering and hidden-row handling. Reuse existing renderer coverage for PMC/vendor-payable, aggregate/component pricing and payment-stage sums; no pricing implementation changes are needed.
- **AC4: Submitted stability.** Submitted and historical previews use the requested round's rendition and frozen metadata. New draft edits and changed current proposal defaults do not rewrite that round. Legacy rounds retain their existing format. The email attachment and preview resolve identical rendition bytes for the same round and visibility state.
- **AC5: Access, races and no writes.** Both saved-preview routes retain wrong-user/project denial, stale-version and stage rejection, incomplete-pricing errors, and post-render version/visibility/access checks. Reading a draft produces no estimate, review-round, audit, stored-document or email writes.
- **AC6: Usability.** The existing viewer opens and downloads the multi-page proposal, preserving its close, retry and focus behavior. Perform a focused desktop/phone smoke check with a synthetic PDF. No screen or template redesign is included.

## Verification approach

After implementation approval, add a focused regression proving the saved-preview route supplies proposal metadata and returns the real proposal layout. Run the existing quotation/revision checks for saved identity, access, visibility and no-write behavior, plus the existing proposal tests. Verify submitted rendition routing remains untouched. Reuse the existing viewer interaction test and visually inspect a synthetic proposal in the dialog at desktop/phone sizes. Run backend typecheck/build and diff hygiene. Mongo integration checks require a replica set. Avoid unrelated test expansion or frontend source edits. Exact commands belong in the reduced task plan.

## Assumptions, risks and open decisions

- Confirmed scope: the PDF sent on Sales estimation Submit is the styling source of truth. Reuse that complete existing template.
- Risk: the full proposal has more pages, larger assets and longer render time than the legacy table. Reuse existing asset caching and lazy, user-triggered viewing; check loading and failures with a representative long estimate.
- Risk: the preview service is existing untracked work in a dirty repository. Preserve its customer projection and guards; do not rewrite adjacent code.
- Risk: tests using only mocked PDFs can miss the renderer-selection bug; real rendered PDF assertions and visual checks are required.
- No unresolved product decision blocks this narrowed scope. No product code has been changed and no tests, builds, migration, email delivery or deployment were run for this specification stage.

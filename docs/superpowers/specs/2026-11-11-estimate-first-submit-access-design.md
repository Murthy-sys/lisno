# Correct first-submit access checks

Date: 2026-11-11
Status: Approved, implemented and locally verified in Mode A. Final evidence and remaining test limitations are recorded in the task plan. Not deployed.
Classification: Focused workflow correction with publication/authorization risk.

## Goal

Allow an eligible Sales user to submit a new quotation through the existing confirmation, save and publication sequence without getting stuck on “Checking the latest estimate, items and publication access…”. Preserve draft inputs and all server authorization, version, pricing and approval checks.

## Current behavior and evidence

- The user reports the pictured footer when activating Submit, first with one selected item and again with two. Whether the particular draft has previously been saved is not confirmed.
- A temporary rendered interaction test reproduced the exact message and Refresh estimate access button with a new workflow-V3 draft. The saved-estimate read returned null successfully; the quotation-revision query remained `pending` with `fetchStatus: idle`; no save or submission was issued. That diagnostic passed and its temporary files were removed.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx:177` enables quotation revision fetching only after a saved estimate ID exists. The submission context at approximately line794 nevertheless requires a successful revision for every V3 quotation. `canPublish` also requires capabilities from a saved estimate. These requirements cannot be satisfied for the first unsaved draft.
- `useQuotationRevision.ts` correctly avoids querying a quotation that does not exist. The bug is the caller treating that intentionally disabled query as an unfinished access check.
- The Refresh action rereads existing data; it cannot create the missing draft. The quotation revision endpoint returns404 when no V3 estimate exists. Refreshing that endpoint prematurely can introduce an error state rather than making the draft submit-ready.
- The earlier approved November9 correction hid the separate refresh-error footer. It intentionally left submission eligibility unchanged, so it did not cover this first-submit case.
- Existing checklist tests primarily start from a saved estimate ID/version. The missing first-save case explains why those checks passed.
- Backend `PUT /leads/:leadId/estimate` already verifies active actor, lead ownership, assigned project, editable state and versions. Its response includes current publication capabilities. `POST /leads/:leadId/estimate/submit` independently enforces ownership, version, readiness, current Configuration and publication authorization.
- Existing In-house, basket-name and related changes are dirty in this worktree. Preserve them; the relevant workspace diff has been inspected. The new fix must not replace or revert those changes.

## Proposed behavior

Use the existing confirmation-before-write flow. Opening the checklist is preparation, not permission to publish.

1. Recognize a first draft only when the saved-estimate query has succeeded with no estimate, the current user is an authenticated Sales owner of the loaded lead, and the necessary save/submit permissions and project context are present. A failed or pending read must never be mistaken for a new draft.
2. Validate the selected items, quantities, prices, dimensions, Configuration freshness and applicable client requirements normally. A missing saved revision is not a blocker for this explicitly recognized first-draft case.
3. Submit opens the existing confirmation checklist. Opening or cancelling it performs no save, approval, publication or email operation.
4. After confirmation, save exactly once using the current draft. Validate the returned saved identity, project association, version, workflow phase and authoritative publication capability. Obtain and validate the matching quotation revision before sending the submission request. Use the version returned by the save; do not invent capabilities or versions.
5. Publish only after those checks succeed. Keep the backend as the final authority. A stale/mismatched revision, missing/denied capability, changed identity, failed save or unknown save outcome must prevent publication.
6. If saving succeeds but verification/publication fails, retain the saved draft and the user's inputs, identify the actual failure and permit the existing safe recovery path. Do not report successful publication or create duplicate drafts/approvals on repeated clicks or retries.
7. Show “Checking…” only while a relevant enabled request is actually running. Distinguish missing saved data, missing project context, unavailable access and failed requests. Do not offer Refresh estimate access as a way to create an unsaved draft, or manually fetch a revision before its source exists.
8. Existing saved quotations continue to require current verified revision/capability checks. Preserve Designer, legacy workflow, read-only/approved estimate, confirmation, focus and keyboard behavior.

## Approach and tradeoff

Recommended: extend the existing checklist → save → verify → submit flow for a known new draft. This avoids requiring a separate Save draft action and retains the user's explicit confirmation before any write. It adds a bounded verification step after the first save.

Alternative: require users to Save draft manually before Submit and explain that requirement. This is simpler but retains the extra manual step behind the reported problem. The recommended flow fits the existing submission handler, which already saves the current inputs before publishing.

## Scope and impacts

- Expected product scope: web `LeadEstimateWorkspace.tsx`, a small existing query/helper boundary if necessary, and focused rendered regression tests.
- Reuse existing save, quotation revision and submit endpoints. No API/schema, role grant, calculation formula or database migration is expected.
- No change to In-house presets/visibility, catalogue selection, approved financial amounts, stored approvals, issued artifacts or email delivery semantics.
- No broad footer redesign or blanket suppression of real errors. Existing Sales refresh-error suppression remains intact.
- No dependency, seed, backfill, commit, push, deployment or production-data operation.

## States, failure handling and risks

- Known new draft → eligible confirmation → saving → verification of saved access/version → submission → existing result.
- Cancellation returns to the unchanged local draft. Validation failure stays in the draft and identifies the item/problem.
- Unknown save outcome uses the existing reconciliation state; no blind resubmission or publication.
- A capability denial after a successful save leaves a saved draft with truthful feedback. An identity/version mismatch requires a fresh read and review before retry.
- Concurrent clicks remain guarded. Changes to user, lead, permissions or draft while the checklist is open invalidate confirmation; backend checks remain authoritative during asynchronous work.
- Main risks: treating failed reads as new drafts, publishing on inferred permissions, reusing stale versions, double saves/submissions and losing local inputs. Focused negative tests must cover each.
- “Checking…” in other scenarios can have different causes. Tests must include saved drafts with pending, failed and missing revision/access data, without assuming the screenshot proves a single runtime cause.

## Acceptance criteria and verification

- AC1: A new eligible V3 Sales draft with one or two valid configured items can open the checklist without first manually saving. Its idle, disabled revision query does not produce the pictured waiting loop or refresh action.
- AC2: No write occurs before confirmation. Confirmation performs one save, verifies the returned identity/capability/revision and submits using the returned version. Repeated clicks do not duplicate actions.
- AC3: Missing permissions, another lead owner, failed initial reads, missing project information, invalid pricing/items, denied/missing returned capability, stale revision and unknown save outcome prevent publication and expose accurate recovery feedback.
- AC4: Draft values survive validation, cancellation and failures; a successfully saved draft remains available if later verification fails. No approved history or financial calculation changes.
- AC5: Saved V3 quotations, Designer flows, legacy workflows and the existing warning-removal behavior retain their requirements and interactions.
- AC6: Loading text corresponds to real pending requests, accessible descriptions point to rendered messages, and focus remains usable after errors/cancellation.
- Verify with focused rendered first-submit/checklist/collaboration regressions, the existing aggregate-price regression subset, frontend typecheck/build and final `git diff --check`. Compare any existing failures with the already recorded baseline. Broaden only if implementation changes a backend/shared contract or reveals a specific additional risk.

## Assumptions and open decisions

- The repeated report requests correction of the Submit behavior, including the demonstrated first-draft gap, rather than another purely cosmetic removal.
- The existing confirmation remains the consent point for saving and publishing.
- No additional product choice is required beyond approval of this scoped behavior.

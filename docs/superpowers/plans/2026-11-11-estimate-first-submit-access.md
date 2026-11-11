# First-submit access correction task plan

Date: 2026-11-11
Status: Implemented and locally verified in approved Mode A. Not deployed.

Source of truth: [Approved specification](../specs/2026-11-11-estimate-first-submit-access-design.md).

## Outcome and boundaries

An eligible Sales user can open the existing checklist for a new draft, confirm, save once, verify the returned quotation access/version, then submit. A disabled revision query must not appear as an endlessly running check. No writes occur before confirmation.

Keep the backend authoritative and reuse existing endpoints. Preserve current In-house pricing/visibility, draft edits, approved history, Designer and legacy behavior. This plan does not authorize deployment, production mutation, migration, seed, dependencies, commits or pushes.

## Ownership and execution order

The primary agent owns interpretation, integration, shared boundaries and this plan. Keep one parent task in progress. Do not assign writers until the task plan and subsequent execution mode are approved.

- **Mode A:** a frontend implementer owns product files in task2; a separate regression implementer owns test files in task3. They can work concurrently after task1 settles the observable sequence. Neither may edit the other's files. Both must preserve existing work and coordinate contract questions through the primary agent. Independent integrity review and verification follow completed writers.
- **Mode B:** the primary agent performs the same tasks, review and verification inline, without implementation subagents.

### 1. Capture the existing changes and establish regression inputs

Owner: primary. Dependencies: implementation authorization. Acceptance: AC1–AC6.

- Capture current dirty paths and per-target diffs before writers start. `LeadEstimateWorkspace.tsx` already contains the approved In-house changes; preserve them. Its existing changes are understood. The checklist test and revision hook are currently unchanged from HEAD.
- Reconfirm the existing save response's `id`, `projectId`, `version`, lifecycle and capabilities, plus the quotation revision's identity/version fields. Use existing `saveLeadEstimate`, `getQuotationRevision` and `submitLeadEstimate` contracts.
- Establish a genuine initial GET-null fixture, authenticated owning Sales actor, project context, valid current catalogue and requirements. Cover one and two selected items. Do not simulate a new estimate by returning a malformed saved estimate with a missing ID.
- Record the expected request sequence: no writes on checklist open/cancel; one PUT after confirmation; successful verification for that returned estimate/version; then one POST with that version and the existing Sales-approval semantics.
- Run the existing focused checklist/revision-hook baseline. The previous full verification already identified two unrelated manual-rate failures in the collaboration suite; record them separately and do not suppress or fix them in this task.

### 2. Correct eligibility, verification and feedback

Owner: product implementer. Dependencies: task1. Acceptance: AC1–AC6.

Owned product paths:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/useQuotationRevision.ts` only if the existing hook needs a bounded change
- A small local publication helper only if it makes identity/state validation clearer; do not introduce a new framework or change shared contracts unnecessarily

Existing API modules are read-only dependencies unless the primary agent explicitly assigns a necessary compatible type correction. No backend changes are planned.

Implementation steps:

1. Identify a known new draft from a successful null saved-estimate response. Require the authenticated owning Sales actor, relevant frontend permissions, valid project context, fresh requirements/catalogue and existing item validation. Keep failed/pending reads, other owners, other roles and existing drafts out of this path.
2. Permit this eligible new draft to open the existing confirmation checklist without requiring a revision for a nonexistent estimate. Preserve cancellation, context-change invalidation, focus restoration and the no-write-before-confirmation rule.
3. Extend the existing submission mutation rather than creating a separate autosave flow. After confirmation, save once and validate the returned identity/project, safe positive version, V3/pre workflow state and explicit publication capability. Obtain a fresh revision using the existing API/query key and validate it against that saved result before POST. Cached data for another estimate/version must not authorize submission.
4. Use the saved version for submission. Preserve existing concurrency guards and backend authorization. Do not infer a missing capability as permission or weaken checks for already saved/Designer quotations.
5. Preserve reconciliation for unknown save outcomes. After a verified successful save, retain the saved draft even if revision verification or publication subsequently fails. Avoid duplicate creation/publication during retries, repeated clicks or polling races.
6. Separate active loading from disabled/idle queries, paused requests, missing context and failed checks. Render truthful feedback and only offer a refresh that can recover the actual dependency. Do not request quotation revision data before a saved source exists. Preserve the earlier Sales refresh-error suppression and useful existing query-error notices.

Exit evidence: product diff remains limited to the owned frontend boundary; no authorization, pricing or persistence semantics are weakened.

### 3. Add rendered first-submit and recovery regressions

Owner: regression implementer. Dependencies: agreed task1 sequence; may run alongside task2 on separate files. Acceptance: AC1–AC6.

Owned test paths:

- New `frontend/src/features/leads/LeadEstimateWorkspace.firstSubmit.test.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.checklist.test.tsx` for directly related saved-state/accessibility cases
- `frontend/src/features/leads/useQuotationRevision.test.tsx` only if task2 changes the hook

Use existing fixture patterns and meaningful observable behavior. Tests must cover:

- Real GET-null first draft, one/two items, checklist open/cancel, no premature revision fetch, no misleading idle loading/footer refresh action, and exact save → verify → submit order/version after confirmation.
- Another owner, missing save/submit permission, missing project, pending/failed initial reads and invalid item inputs; no publication or unauthorized draft creation.
- Save failure and unknown outcome; missing/denied returned capability; wrong returned project/identity, malformed or stale version; failed, empty or mismatched verification response. No POST in any denied case.
- Duplicate Submit/Confirm activation, delayed verification, concurrent version change, authentication/lead changes and existing revision polling. No duplicate writes or stale publication.
- Draft values and saved-draft acknowledgement survive failures; safe recovery submits the appropriate current version without losing edits.
- Existing saved V3, Designer and legacy flows retain their guards; old refresh-warning suppression remains intact. Keyboard operation, focus and accessible descriptions remain consistent with rendered messages.

### 4. Review, verify and hand off

Owner: primary; in Mode A, use `integrity_reviewer` after writers finish and `verification_runner` after review corrections. Dependencies: tasks2–3 integrated. Acceptance: AC1–AC6.

- Review first-draft recognition, authoritative capability checks, returned source/version binding, context changes, duplicate actions, unknown-save reconciliation and preservation of the existing dirty In-house changes.
- Run focused regression checks first, then frontend typecheck/build. If a check fails, distinguish a new regression from the recorded baseline and fix task-related defects. Do not repeat the previous repository-wide backend/frontend suites unless a shared/backend contract change or a new unresolved risk justifies it.
- Exercise the Submit/checklist flow in a local browser with synthetic responses at desktop and mobile widths, including first-save success and verification failure preserving inputs. Inspect status/focus behavior and console/network errors. Do not publish a real quotation or use customer data. Remove task-only fixtures/screenshots afterward.
- Inspect the final diff, run hygiene checks and record exact results, remaining baseline failures and unrun checks. No lint script exists.

Commands from `frontend/`:

```sh
# Existing baseline before writers
npm test -- src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/useQuotationRevision.test.tsx

# First-submit and related state regressions after integration
npm test -- src/features/leads/LeadEstimateWorkspace.firstSubmit.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/useQuotationRevision.test.tsx

# Preserve nearby collaboration and the already implemented aggregate-price behavior
npm test -- src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/configuredEstimate.aggregatePricing.test.ts src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx

npm run typecheck
npm run build
```

From the repository root:

```sh
git diff --check
git status --short
```

## Acceptance trace

| Specification criterion | Tasks | Evidence |
| --- | --- | --- |
| AC1 first draft avoids idle waiting | 1–3 | GET-null rendered flow with one/two items; no premature revision request |
| AC2 confirmed, single save and verified submission | 2–3 | Ordered requests, returned version, cancellation and duplicate-click tests |
| AC3 denied/invalid/unknown states fail safely | 2–4 | Asymmetric actors and negative identity/capability/version/error tests; integrity review |
| AC4 preserve draft/history/amounts | 2–4 | Failure/recovery assertions and existing aggregate-price regressions |
| AC5 preserve saved/Designer/legacy behavior | 2–4 | Checklist/collaboration/revision-hook regression lane |
| AC6 accurate loading and accessibility | 2–4 | Pending versus idle/error states, focus/description assertions and browser checks |

## Current execution record

- Specification and task plan approved; Mode A selected.
- Task1 complete: initial dirty paths and per-target diffs captured under `/tmp/lisno-first-submit-baseline`, including existing In-house changes. Baseline checklist/revision-hook lane passed 31/31. Backend requirements scope also permits an assigned Sales user to read requirements before an estimate exists.
- Task2 complete: primary owns the bounded workspace implementation. A known successful empty estimate read can prepare the existing checklist; confirmation saves, checks the returned identity/project/state/version/capability, verifies a fresh matching revision, then uses the existing submit endpoint and Sales approval flag. Disabled queries no longer produce active-loading feedback or premature revision retries. No backend, hook, financial formula, or other workflow change.
- Task3 complete: `first_submit_regressions` added 19 passing rendered regressions in `LeadEstimateWorkspace.firstSubmit.test.tsx`, including first-save success/order, cancellation/focus, duplicate confirmation, denied/missing capability, invalid saved project/version, revision identity/version/phase/status mismatch, unknown-save preservation, missing project/permissions, another owner, permission revocation and unmount while verification is pending. Earlier product/test agents were stopped without changes; primary took product ownership to finish the bounded correction.
- Independent integrity review found one remaining raw revision-error notice; fixed it to require a saved source. Final integrated review of product and tests found no blocking defects. Added a null-token guard for clear failure feedback. Existing saved/Designer/legacy mutation branches remain preserved. The new suite does not directly exercise an empty/failed revision response, initial pending/failed GET, or successful recovery after verification failure; existing checklist tests cover saved-query error/recovery and pending revision behavior, while browser checks verify preservation after capability denial.
- Existing checklist/revision-hook checks after the product change: 31/31 passed. Frontend typecheck and production build passed; build reports the existing large-chunk advisory.
- Nearby regression command: 72 passed, 2 failed out of 74. Both failures match the recorded collaboration baseline: `preserves an incomplete manual rate when both the old rate and serialized edit are null` and `retains a partial rate typed while an earlier blank-rate save is in flight`. The other three files passed. No expansion into those unrelated manual-rate cases.
- Local Playwright with synthetic data: desktop two-item ₹189 draft opens confirmation with no write or revision read, then performs one PUT and one POST with the saved version and `approveSales: true`. Mobile 390×844 one-item ₹90 success and denied-capability paths passed: cancellation restores Submit focus with no writes, success saves/submits once, denial saves once and sends no POST while retaining the item/amount. No unexpected synthetic requests, runtime page errors, or horizontal overflow. Rendered mobile failure state inspected.
- Temporary local browser fixture, logs and screenshot under `frontend/output/playwright/first-submit/` were removed after inspection. The isolated port4173 server and task browser session were stopped. No production request, email, deployment or other external mutation occurred.
- Task4 complete: `first_submit_verify` ran the final integrated lane after both writers and final integrity review. `npm test -- src/features/leads/LeadEstimateWorkspace.firstSubmit.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/useQuotationRevision.test.tsx` passed 50/50 across three files; `npm run typecheck`, `npm run build`, `git diff --check`, and `git status --short` all exited0. Build regenerated ignored `frontend/dist/` and retained the existing large-chunk warning. No dependencies or lockfiles changed.
- Final comparison against the captured baseline confirmed the task-only product change is 63 inserted/15 removed lines in `LeadEstimateWorkspace.tsx`; previous In-house changes remain. The revision hook, its test, and the existing checklist test are byte-identical to the baseline. The only newly dirty source path is the dedicated first-submit test. Task-only baseline copies were removed after comparison.
- Full repository/backend/replica-set/OCR suites were not rerun for this bounded frontend correction. There is no repository lint script. No migration, seed, commit, push, deployment or production-data operation was performed. These results verify this correction, not all pre-existing worktree changes.

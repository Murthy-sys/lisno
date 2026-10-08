# Vendor request approval with Configuration setup: task plan

Status: implemented in approved Mode A on 2026-10-08. Scope verification finished; broader backend baseline failures remain documented below. No deployment performed.

Source of truth: [approved specification](../specs/2026-10-08-vendor-request-approval-classification-design.md). AC1–AC8 below refer to its numbered acceptance criteria.

## Delivery boundary

Deliver the Super Admin pending-request entry, direct navigation to review, optional Sub Basket/Main Line setup in the approval panel, atomic persistence, and refreshed classifications for the existing vendor form. Preserve optional Main Basket-only approval, normal vendor saving, draft Main Lines, current authorization and existing Configuration behavior.

No automatic vendor creation or assignment, new vendor/Main Line relationship, price changes, dependencies, lockfile changes, security-remediation expansion, migrations, seeds, commits, pushes, deployments or external messages.

## Baseline and ownership

The initial worktree contains the prior approved vendor-name fix in these four tracked paths:

- `frontend/src/features/procurement/ProcurementVendorEditor.tsx`
- `frontend/src/features/procurement/ProcurementVendorProfile.test.tsx`
- `frontend/src/features/procurement/VendorBasketFields.tsx`
- `frontend/src/features/procurement/VendorBasketRequestDialog.tsx`

Its 2026-10-08 specification and task plan are untracked, as is this scope's specification. Preserve all these files and their existing changes. Before implementation, record the dirty-path set and inspect each target's diff; assign the four dirty frontend paths only to the primary agent. No worker may reset, replace or reformat another owner's work.

| Owner | Exclusive write responsibility |
| --- | --- |
| Primary agent | Shared backend request contract and frontend API mirror; shared request-query helper; dashboard queue/navigation integration and related tests; Configuration index entry point/deep-link tests; previously dirty vendor files; documentation; final integration |
| Backend implementer | Request model, route validation, service, OpenAPI; Configuration transaction-helper extraction and its existing callers; focused backend request/Configuration tests |
| Frontend implementer | Request review and approval panel, its local styling/components and `KnowledgeBasketRequestReview.test.tsx`; no dashboard/index/vendor-form/API edits |
| Integrity reviewer | Read-only review of the integrated diff after writers finish |
| Verification runner | Final integrated checks and temporary QA outputs; no product-source edits |

In Mode A, use native subagents for the two bounded implementation slices after the shared contract is settled. Tell each worker it is not alone in the codebase and must preserve other owners' changes. In Mode B, the primary agent performs the same tasks, review and verification inline. No agents run before the execution-choice gate.

## Dependency-ordered tasks

### T1. Preserve the baseline and settle the shared contract

Owner: primary agent. Depends on task-plan approval and execution-mode selection. Covers AC1–AC8.

1. Capture current status and relevant diffs, reconcile any new intervening changes, and run the existing request/review regression tests as a focused baseline.
2. Confirm the Configuration creation/deletion coordination helpers and transaction boundaries. Share the helper boundary with the backend owner before extraction; do not nest independent transactions inside request approval.
3. Update `backend/src/contracts/vendor-basket-request.ts` and `frontend/src/features/procurement/vendorBasketRequestApi.ts` together:
   - Optional fulfillment-only `configuration` input containing exactly one of `subBasketId`/`subBasketName`, plus optional `mainLineName`.
   - Nullable `subBasketId` and `mainLineId` outcomes, with legacy records represented as null by the backend.
   - Preserve existing routes, status enum, required version and idempotency key.
4. Establish the small shared pending-count query helper using the existing review API with `status=pending`, `limit=1`, `offset=0`, and its authoritative pagination total. Reuse the review query-key prefix so decisions invalidate counts and lists together. Refresh on mount/focus and every 30 seconds while mounted/visible, without background polling while hidden.
5. Set the review entry URL to the existing Configuration index route with `basketRequests=pending`. Preserve unrelated URL parameters. Expose a review input for Pending selection only if needed for navigation; agree that interface before concurrent editing.
6. Update affected typed fixtures without broadening the API. Communicate the final contract, key conventions and no-overlap paths to both implementation owners.

Exit condition: one agreed contract and ownership map, preserved vendor-name diff, baseline results recorded. If extraction exposes a material change to the approved behavior, stop that dependent change and reconcile the specification first.

### T2. Implement atomic approval and reusable Configuration creation

Owner: backend implementer. Depends on T1. May run alongside T3 and T4. Covers AC2, AC3, AC5, AC6, AC8.

Affected areas:

- `backend/src/models/VendorBasketRequest.ts`
- `backend/src/routes/vendor-basket-requests.ts`
- `backend/src/services/vendor-basket-request.service.ts`
- `backend/src/openapi/vendor-basket-requests.ts`
- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- A narrowly scoped session-aware creation helper under `backend/src/services/`, if extraction requires it
- Request, item/reference and related transactional Configuration tests

Implementation:

1. Add nullable outcome fields and strict runtime validation. Normalize setup names; reject setup on rejection, empty setup, ambiguous Sub Basket input and invalid names.
2. Extract/reuse established Sub Basket resolution and draft Main Line creation within a supplied session. Preserve standalone create behavior, actor checks, parent/child dependency coordination, display ordering, aggregate versions, revision/section initialization, uniqueness and audit semantics. Do not copy a second creation implementation into the request service.
3. Within the existing decision transaction, revalidate Super Admin, claim the pending version, resolve the requested active Main Basket, validate/create the Sub Basket, optionally create a draft Main Line, store result IDs and append audits. Any failure rolls back the whole operation.
4. Preserve the exact legacy fingerprint for decisions without setup. For setup commands, fingerprint normalized contents, replay identical commands with the original IDs, and reject altered commands using the same key.
5. Keep vendor records untouched. Extend decision/creation audit context with stable hierarchy/request IDs; keep historic decisions unchanged.
6. Add replica-set cases for variants, old records, wrong-parent and stale child IDs, inactive/deleted parents, duplicate lines, concurrent decisions and deletion/creation races. Inject child/revision/section/audit failures and assert no partial hierarchy or decision persists. Verify unauthorized and inactive actors, including replay.
7. Update OpenAPI and focused contract tests without changing route-operation permissions.

Exit condition: focused backend checks pass and the service returns the agreed outcomes with no automatic activation/vendor writes.

### T3. Implement the approval panel and review states

Owner: frontend implementer. Depends on T1. May run alongside T2 and T4. Covers AC2, AC3, AC6, AC7, AC8.

Affected areas: `KnowledgeBasketRequestReview.tsx`, `knowledge-basket-requests.css`, `KnowledgeBasketRequestReview.test.tsx`, and a local approval-panel component if needed to keep responsibilities clear.

1. Rename the pending action to Review and approve. Use the existing accessible panel/form primitives for request context and optional setup; retain Reject and its required reason.
2. Resolve the requested Main Basket against the complete available catalogue. For an existing active parent, load its Sub Basket options by stable ID; for an absent parent, allow new Sub Basket entry. Catalogue failure must not be mistaken for absence. The backend still revalidates everything at submit time.
3. Provide choose-existing/create-new Sub Basket controls and optional Main Line name. Validate the selected hierarchy and normalized bounds; disable submission while required catalogue data is unresolved.
4. Send one decision command, freeze its contents/key for an uncertain retry, retain input/error context and distinguish validation conflicts from network uncertainty. Cancel before submit must not create any records.
5. On success, show the confirmed hierarchy, draft status and Open Main Line link. Resolve display labels by saved IDs or confirmed submitted names, never by an unrelated name match. A failed follow-up read must not imply the approval failed or offer another create operation.
6. Invalidate review/count and own-request queries plus affected basket/sub-basket/main-line/item lists and details. Handle post-save refresh failures separately from mutation failures.
7. Add accessible interaction tests for setup variants, rejection, cancellation, naming/parent errors, catalogue errors, stale version, duplicate submit, unchanged retry, result links, refresh failure and keyboard focus return. Keep pending/all pagination and legacy requests working.

Exit condition: panel tests pass against the agreed API; empty/error/pending/saved states are explicit and compact.

### T4. Surface requests and preserve vendor continuity

Owner: primary agent. Depends on T1. May run alongside T2 and T3 on non-overlapping paths. Covers AC1, AC4, AC7, AC8.

Affected areas: `DashboardOverview.tsx`, `SuperAdminDashboardPage.tsx` only where required for refresh integration, dashboard tests/styles, `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexPage.test.tsx`, shared pending-count tests, and the four owned vendor files only where required.

1. Add a compact Vendor classification requests Action queue entry using the shared count query, permission-gated like the existing protected Configuration entry. Show loading/unavailable or clearly stale data rather than zero on failure; offer retry/refresh.
2. Link to the Configuration request URL. Make index visibility and Pending selection follow its URL on direct entry and back/forward navigation. Preserve unrelated query parameters and existing catalogue navigation.
3. Add the pending count to the Configuration request entry point using the same query source. Ensure explicit refresh, focus refresh and the visible interval update the result without resetting an open approval form.
4. Keep request submission and vendor-name editing intact. Adjust success wording to explain the approval wait. Verify existing vendor catalogue focus/manual refresh discovers the approved Main/Sub Baskets without losing fields or selections; change implementation only if that verification exposes a gap.
5. Add rendered tests for permission visibility, pending counts, zero/error/stale states, deep links/back-forward navigation, changed counts after decisions, separate-session refresh and preservation of an unsaved vendor draft.

Exit condition: the pending request can be discovered from Super Admin and the approved classification can be selected in the retained Procurement form.

### T5. Integrate and review integrity

Owner: primary agent, then integrity reviewer in Mode A. Depends on T2–T4 finishing. Covers AC1–AC8.

1. Inspect every changed path, reconcile contracts and typed fixtures, confirm existing vendor-name edits remain, and review cache invalidation across both roles.
2. Run a read-only integrity review focused on authorization/replay, hierarchy lineage, transaction atomicity, deletion races, old fingerprints/records, duplicate handling, post-save failures and unchanged standalone Configuration behavior.
3. Resolve findings in the original owner's scope. Review corrections before final verification; stop parallel writers before evaluating the integrated result.

Exit condition: no unresolved correctness issue within scope. Record any unrelated pre-existing failure separately rather than modifying it silently.

### T6. Verify the integrated result and hand off

Owner: verification runner in Mode A; primary agent in Mode B. Depends on T5. Covers AC1–AC8.

Run the focused checks below on the final worktree, typecheck/build both workspaces, and perform rendered interaction/accessibility QA. Re-run only affected checks after a correction, broadening coverage if failures or shared-helper changes reveal further risk. No repository lint script exists; do not claim lint passed.

Record exact commands, pass/fail counts, warnings and unrun checks in this plan's delivery record. Report outcome, principal changes, affected files, temporary QA artifact paths, remaining limitations and that no production actions were performed. Mark complete only when every acceptance criterion has evidence.

## Verification commands and evidence map

Run each command in the named workspace; use the repository's existing replica-set helper and synthetic fixtures. Never point these tests at production or weaken transaction requirements.

### Backend

From `backend/`:

```sh
npm test -- tests/vendor-basket-request.replica-set.test.ts
npm test -- tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-sub-baskets.test.ts tests/ai-estimator-knowledge-display-order.service.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts tests/ai-estimator-knowledge-inline-item-mutations.replica-set.test.ts
npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts
npm test -- tests/ai-estimator-knowledge-routes.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

Request/replica tests cover AC2, AC3, AC5 and AC6; Configuration creation/deletion suites cover AC2 and AC8; vendor suites cover AC4 and AC8; route/authorization/OpenAPI checks cover AC5 and compatibility. Include any new helper tests in this lane. Broaden to the backend full suite if the extracted helper changes additional call paths not covered here.

### Frontend

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx
npm test -- src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx
npm run typecheck
npm run build
```

Also run any newly introduced shared query/navigation tests. Review/panel tests cover AC2, AC3, AC6 and AC7; dashboard/index cover AC1 and AC7; vendor tests cover AC4 and AC8; existing creation/mutation tests cover AC8.

### Rendered QA and hygiene

- At desktop (1440 px) and narrow mobile (390 px and 320 px), inspect queue entry, expanded review and approval panel. Use synthetic records only.
- Exercise keyboard entry, optional setup, new/existing Sub Basket, cancellation, rejection, field errors, focus trap/return, loading, no requests, API failure, retry and confirmed-save/failed-refresh states. Check accessible names and run axe on the changed surfaces.
- Use separate synthetic Procurement/Super Admin sessions or API-backed test contexts to exercise Send request → pending count/review → approval → refreshed vendor classifications. A mocked browser fixture proves UI behavior only; use backend replica-set evidence for atomicity and permissions and distinguish the two in the handoff.
- Check network/console errors and horizontal overflow. Store temporary outputs under `/tmp/lisno-vendor-approval-qa/` or an ignored test-output directory; record paths and stop task-owned servers/sessions afterwards.
- From the repository root, run `git diff --check` and `git status --short`; inspect the final scoped diff and retained initial dirty paths.

## Parallel execution and progress tracking

Dependency graph: **T1 → (T2 + T3 + T4) → T5 → T6**. Shared contract/helper interfaces are settled before parallel writes. Backend extraction and request-service integration remain one owned slice to avoid incompatible transaction semantics. Review and verification run sequentially after integration.

Only one parent task is in progress at a time: T1 preparation, then the T2–T4 implementation batch, then T5 review, then T6 verification. During implementation, record task status, evidence and blockers here without reopening completed approval gates unless the behavior materially changes.

Current progress: T1–T6 finished. Integrated read-only integrity review found no confirmed new correctness defects. Initial dirty-path set and all four existing vendor-name diffs inspected and preserved. Shared contracts and pending-count query source are settled. Baselines: backend request replica-set tests 11/11; frontend review 4/4; index/dashboard/vendor tests 137/137. Root baseline log: `/tmp/lisno-vendor-approval-baseline-frontend.log`.

Implementation evidence before final review: request replica tests 30/30; panel tests 20/20; root index/dashboard/vendor/count tests 148/148; frontend/backend typecheck passed. One count-test cleanup warning was corrected and its 5 tests rerun without warnings. A test run during panel-file creation encountered a transient missing-module error; the later integrated 148-test pass supersedes it.

Broader backend checks identified four existing failing assertions: one item induction/pricing case, two reference-deletion cases, and one route Procurement direct-basket-creation case. They were reproduced in an isolated copy using the original HEAD item service. Baseline JSON: `/tmp/lisno-vendor-approval-qa/item-baseline.json`, `reference-baseline.json`, `routes-baseline.json`. Older `.log` files there include superseded sandbox socket failures; use the JSON and final verification evidence. These failures are not being remediated as part of this approved scope.

Rendered QA completed after the final mobile CSS correction: queue, new hierarchy and existing Sub Basket at 1440/390/320 px; zero horizontal overflow and axe violations. Verified optional setup, validation, stable child IDs, exact-command uncertain retry, corrected-command new key, saved decision with failed refresh/retry, rejection, keyboard trap/discard/focus return and count/error recovery. No browser warnings/errors or unexpected fixture API calls. Synthetic QA report and screenshots: `/tmp/lisno-vendor-approval-qa/RESULTS.md`. Browser/server were stopped. Root visually inspected the mobile panel and corrected 320 px warning screenshot.

## Final delivery record

### Outcome and principal decisions

- Super Admin has a permission-gated pending vendor classification request count and a direct Configuration review link. The existing count API remains the source of truth; visible polling/focus/manual refresh keeps separate sessions current.
- Approval optionally resolves/creates a Sub Basket and creates a draft Main Line in one transaction with the decision, result IDs and audits. Existing Configuration creation now shares its session-aware implementation. Normal creation, rejection and historical no-setup command fingerprints remain compatible.
- The approval panel preserves uncertain commands for safe retry, distinguishes confirmed save from refresh failure, and provides the saved hierarchy and Main Line link. Read-only review hides decision actions.
- Procurement can refresh the available baskets and finish saving the retained vendor draft. Approval creates no vendor, assigns no vendor automatically, and activates no Main Line.
- Existing vendor-name edits were retained. No dependencies or lockfiles changed.

Affected product files: backend request contract/model/route/service/OpenAPI and `ai-estimator-knowledge-item.service.ts`; frontend request API and new `useVendorBasketRequestCount.ts`, `KnowledgeBasketRequestDecisionPanel.tsx`, `VendorClassificationRequestQueueItem.tsx`, existing request review/index/dashboard integration and scoped styles, and `VendorBasketFields.tsx` for refresh/notice. Tests cover these paths. The preceding vendor-name fix remains in its original four paths.

### Final integrated checks

All test commands in the verification section above were run, with the new count test included in the frontend focused lane. Each used `--reporter=json --outputFile=/tmp/lisno-vendor-approval-qa/<evidence-name>.json` and redirected stdout/stderr to the matching `.log` file. The table records distinct final tests, excluding repeated attempts.

| Check | Result | Evidence name |
| --- | --- | --- |
| Backend request replica tests | 30/30, exit 0 | `final-backend-request-unrestricted` |
| Backend item/reference/sub-basket/display-order tests | 170/173, exit 1; three baseline failures | `final-backend-configuration` |
| Backend Configuration integration/sub-basket management/inline mutation tests | 116/116, exit 0 | `final-backend-integration` |
| Backend vendor unit/replica tests | 45/45, exit 0 | `final-backend-vendor` |
| Backend routes/authorization/frontend authorization registry/OpenAPI tests | 250/251, exit 1; one baseline failure | `final-backend-contracts-retry` |
| Frontend review/index/dashboard/vendor/count tests | 168/168, exit 0 | `final-frontend-focused` |
| Frontend existing create-dialog/mutation-sync/foundation tests | 90/90, exit 0 | `final-frontend-regressions` |
| Backend `npm run typecheck` and `npm run build` | Both exit 0 | `final-backend-typecheck.log`, `final-backend-build.log` |
| Frontend `npm run typecheck` and `npm run build` | Both exit 0 | `final-frontend-typecheck.log`, `final-frontend-build.log` |
| Repository `git diff --check` and `git status --short` | Both exit 0; prior work preserved | Final worktree inspection |

Totals: **258/258 frontend**, **611/615 backend**. This is not a fully green backend repository. The four remaining failing assertions are:

1. `ai-estimator-knowledge-item.service.test.ts`: rejects a new Budget price after induction approval is reopened.
2. `ai-estimator-knowledge-reference.service.test.ts`: strips references to the deleted Basket out of the configurations that survive.
3. `ai-estimator-knowledge-reference.service.test.ts`: reports what a deletion carries away and refuses none of it.
4. `ai-estimator-knowledge-routes.test.ts`: permits Procurement vendor management and inline classifications without opening Configuration; existing direct-create expectation is 201, response is 403.

Names/messages match the isolated original-code baseline JSON referenced above. They were left unchanged.

The first final contracts run also encountered a Specifications assertion expecting 400 but receiving 404 (`final-backend-contracts.json`, 249/251). It passed an isolated rerun using `npm test -- tests/ai-estimator-knowledge-routes.test.ts -t 'accepts mixed legacy and canonical Specifications and rejects partial canonical rows'` (1 passed, 97 intentionally skipped), and the whole five-file contracts lane then passed that assertion too. Its cause is unproven; the initial report and `final-backend-route-specifications-retry.json` are retained as transient-failure evidence.

The initial sandboxed request test run could not open Mongo's temporary local socket (`listen EPERM`, 30 skipped). The required escalated retry ran all 30 successfully; `final-backend-request-unrestricted` is authoritative. During implementation, one typecheck saw the old panel test fixture before new outcome fields were added; the final typecheck passes after integration.

### Warnings, limits and external actions

Existing Mongoose deprecation warnings for the `new` update option remain in broad Configuration tests. The frontend build retains its existing chunk-size warning above 500 kB. Final frontend test logs have no unhandled request/MSW warnings.

Browser checks rendered actual components with synthetic API responses; no live authenticated end-to-end environment was exercised. Backend persistence/permission evidence comes from the replica-set and HTTP tests. Full unrelated repository suites, OCR tests and migration dry-runs were not run because those surfaces were unchanged. There is no lint script and no lint result is claimed.

QA logs/screenshots/fixtures are under `/tmp/lisno-vendor-approval-qa/`; generated compiler/build outputs are ignored under `backend/dist` and `frontend/dist`. No runtime artifacts were staged or committed, and the task-owned browser/server were stopped. No production mutation, seed, migration, backfill, commit, push, external message or deployment was performed.

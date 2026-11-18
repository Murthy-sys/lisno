# First-save tier description copying: task plan

Status: Completed locally in approved Mode A. A1–A5 implementation, integrated review, automated verification, and final real-API browser checks are finished. Known unrelated failures and coverage limits are recorded below. No deployment or production mutation was performed.

Source of truth: [Approved specification](../specs/2026-11-18-first-save-tier-description-copy-design.md).

## Amendment plan: initialize descriptions already saved in another tier

The approved amendment adds an initialization step before an editable named Mode opens. In the reported case, saved Signature wording must be persisted into eligible Premium/Functional descriptions without editing Signature or clicking Save for each destination. Existing text, deliberate clears, default Mode, disabled scopes, and unrelated settings stay unchanged.

### Settled API and lifecycle contract

- Add `POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/initialize-tier-descriptions` under the existing `ai_estimator_knowledge.configuration.update` permission and the same mutation actor guard as section saves. No new permission or schema migration.
- Request: `{ expectedVersion, expectedAggregateVersion }`, both required positive integer versions. `expectedVersion` is the shared advanced-section version. The client supplies no description, source tier, or destination payload.
- Response: `{ mainLineId, revisionId, version, aggregateVersion, sourceTier, copiedTiers }`. `version` is the current advanced-section version. `sourceTier` is a named tier or null; `copiedTiers` is a list of named tiers. A no-op returns unchanged versions, null source, and an empty list.
- Select saved source text in Signature, Premium, Functional order, requiring enabled/configured valid nonblank text. Initialize only absent/null enabled destinations that are not explicitly `not_applicable`, within the same draft.
- Auth/identity/draft/version guards precede the mutation. Source, destinations, version increments, completeness, and audit commit in one existing transaction. A no-op adds no version increment or audit event. GETs remain read-only. Reuse the existing section-update audit action with initialization source/destination metadata, without logging description text.
- Frontend lifecycle: saved data loaded → eligible editable named Mode entry with no pending work → one deduplicated initialization request → authoritative refresh → editor enabled. No-op responses finish initialization without a write. Failures expose the existing retry/error pattern; a version conflict may refresh/retry once. Do not recreate drafts, invent saved cache values, or mutate from default/read-only/client/proposal/history views.
- Reevaluate at safe entry boundaries after reopening or saved applicability changes. Deduplicate in-flight work by Main Line/revision/version, including Strict Mode and rapid tier switching. Ignore obsolete responses after navigation. Initialization must never submit or replace local unsaved input.

### A1. Capture the amendment baseline and add the shared API client contract

Owner: primary agent. Depends on this plan's approval. Covers AC8–AC11.

- Capture current dirty paths and relevant diffs. The original helper/service/integration tests, frontend tier tests/comment, and earlier GST/client-description work are already dirty and remain owned historical work to preserve.
- Confirm the approved endpoint/input/result shapes against existing API conventions before writers begin. Add narrowly typed input/result definitions and the client factory method `initializeKnowledgeTierDescriptions` in `shared/knowledge/knowledgeApi.ts` and `shared/knowledge/knowledgeTypes.ts`. Primary owns these shared files exclusively.
- Record focused baselines for the copy helper, route registry, and workspace tests. The earlier unrelated Budget/vendor test failure and API-docs three-versus-four Mode enum expectation are known; do not repair them in this slice or repeatedly reproduce already established baselines.

### A2. Implement the transactional initialization endpoint

Owner: backend implementer. Depends on A1. Covers AC8–AC10 and backend AC11.

Owned production files: `backend/src/domain/ai-estimator-knowledge-tier-description-copy.ts`, `backend/src/services/ai-estimator-knowledge-item.service.ts`, `backend/src/contracts/ai-estimator-knowledge.ts`, `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/domain/route-operations.ts`, and `backend/src/openapi/ai-estimator-knowledge.ts`.

Owned tests: `backend/tests/ai-estimator-knowledge-tier-description-copy.test.ts`, `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`, `backend/tests/ai-estimator-knowledge-routes.test.ts`, `backend/tests/fixtures/ai-estimator-knowledge-route-operations.ts`, `backend/tests/route-operation-registry.test.ts`, and a focused new initialization assertion in `backend/tests/api-docs.test.ts`.

1. Extend the existing pure copying rule with explicit initialization semantics; retain changed-description save behavior. Validate candidates rather than borrowing malformed text or default Mode wording.
2. Implement the new service method with current-draft identity, actor authorization, advanced/aggregate CAS, saved Overview selection, single-transaction writes, accurate root Signature applicability, and existing validation/completeness behavior. Reuse persistence helpers where practical without triggering unrelated price/reference commands or duplicating large service code blocks.
3. Make no-op/retry behavior explicit. Concurrent initialization or ordinary edits must never overwrite a description initialized/edited by another writer. A stale request may return the normal conflict; the UI performs its bounded refresh/retry.
4. Register route validation, operation authorization, and OpenAPI request/response inventory together. Reject arbitrary extra fields and client-supplied text. Preserve existing GET/save contracts and actor restrictions.
5. Add real database tests for the exact screenshot setup, source priority/fallback, no-op audit/version stability, ordinary-save compatibility, protected clear/disabled/default values, concurrent initialization/edit races, post-write rollback, identity isolation, immutable revisions, and unauthorized calls.

Boundary: backend only. Preserve previous dirty edits; no frontend/shared ownership, data migration, pricing fixes, or production access.

### A3. Initialize before enabling the live Mode editor

Owner: frontend implementer. Depends on A1; may run in parallel with A2 using the agreed API contract. Covers AC8–AC11.

Owned production files: `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts`, `KnowledgeItemWorkspacePage.tsx`, and at most one focused initialization hook in the same directory. Extend `KnowledgeModePanel.tsx`, `knowledgeEditorDataSource.ts`, or `knowledgeMutationSync.ts` only if the existing boundaries require it; avoid affecting shared proposal editors.

Owned tests: `knowledgeApi.test.ts`, `KnowledgeItemWorkspace.configurationModes.test.tsx`, `KnowledgeItemWorkspace.clientPreview.test.tsx`, `KnowledgeModePanelPendingChanges.test.tsx`, and a focused hook test if a hook is added, all under `frontend/src/features/ai-estimator-knowledge/`.

1. Export the shared client method and integrate initialization at the live workspace boundary, where draft status, permissions, current named tier, saved Overview, and unsaved-work guards are available. Keep generic component reads and client/proposal data sources read-only.
2. Gate editing until the initialization response and required authoritative refresh complete. Reuse loading/error/retry components without extra permanent headings or controls. Prevent stale-version saves and avoid clearing unrelated dirty fields.
3. Deduplicate Strict Mode/rapid-navigation requests, handle stale identity responses, limit automatic conflict retries, and permit an explicit retry after failure. A completed no-op must not loop after every render or query refresh.
4. Reproduce the user scenario in rendered tests: Signature already has text before mounting, Premium/Functional are empty, and opening a named Mode fills both without Save clicks. Assert persisted fixture state, reopening, client preview, one successful initialization, and independent subsequent edits.
5. Add negative cases for filled/cleared destinations, default Mode, read-only and active-only revisions, pending edits, conflict/error refresh, applicability changes, and no eligible source. API tests assert only IDs/versions are submitted and the typed response is consumed.

Boundary: frontend only; no duplicate production copying/source-selection rule, backend/shared edits, new styling, or replacement of the user's saved descriptions.

### A4. Integrate and review

Owner: primary agent followed by integrity reviewer. Depends on A2 and A3. Covers all acceptance criteria.

- Verify the integrated contract, mutation registration/permissions, deterministic source selection, no-op behavior, CAS/races, audit privacy, and preservation of pending edits. Check the new automatic write cannot run through proposal/read-only/default/historical entry points.
- Confirm the frontend receives actual saved destination descriptions, rather than a fallback that hides missing persistence. Exercise the existing save-triggered path as a regression.
- Resolve confirmed findings before final verification. No writer/reviewer may revert previous work or cross assigned ownership without coordination.

### A5. Verify and hand off the amendment

Owner: verification runner and primary agent. Depends on A4. Covers AC1–AC11.

Run these focused commands, adding any new initialization hook test:

```sh
# backend/
npm test -- tests/ai-estimator-knowledge-tier-description-copy.test.ts tests/ai-estimator-knowledge-mode-tiers.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/route-operation-registry.test.ts tests/estimator-tier-description.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm test -- tests/api-docs.test.ts -t 'tier description initialization'
npm run typecheck
npm run build

# frontend/
npm test -- src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/useKnowledgeTierDescriptionInitialization.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts
npm test -- src/features/client/ClientQuotationLine.description.test.tsx src/features/estimates/estimateGstPresentation.test.ts
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

Use isolated local Mongo replica-set fixtures and proportionate desktop/mobile browser QA with synthetic data. Start with an existing Signature description before navigation, verify automatic initialization and reopening, and check keyboard access, failure/retry, console errors, and overflow. Prefer a browser flow against the actual local initialization endpoint when practical; otherwise report precisely which browser behavior used synthetic transport and prove persistence independently through integration tests. Never use production data or substitute a display-only fallback for proof of saving.

Record exact results, any unrun checks or known failures, and generated artifact paths in this plan. Remove temporary harnesses and isolated test databases. No lint claim, dependency, migration, bulk backfill, commit, push, deployment, or customer communication is included.

### Amendment execution status

The amendment task plan was approved and Mode A resumed. A1 contract definitions and API factory method are in place. Existing target diffs and dirty paths were captured in `/private/tmp/lisno-tier-init-baseline.diff` and `/private/tmp/lisno-tier-init-baseline-status.txt`. A2/A3 finished their non-overlapping backend/frontend implementation and focused checks. A4 integrated review completed with no remaining confirmed defects; A5 final verification and cleanup are complete. The primary retained ownership of integration and shared files throughout.

The final frontend refresh reads Signature and already-cached named scopes, while unvisited tiers use their normal initial GET. It cancels only the exact item query and exact advanced-section keys being refreshed, preserving unrelated Overview and default Mode reads. Six focused frontend suites passed 107 tests; the expanded seven-suite run passed 213 with 16 KnowledgeScreens failures. A diagnostic disabling only the new initialization hook reproduced the identical 16 failures, plus four existing static-layout failures; no new failure names appeared. Its temporary test was removed. Logs: `/private/tmp/lisno-tier-init-frontend-rerun.log` and `/private/tmp/lisno-tier-init-unaffected-baseline.log`. The backend route suite's unrelated Procurement basket creation failure (expected 201, received 403) was also reproduced against isolated HEAD, recorded in `/private/tmp/lisno-tier-init-route-baseline.log`.

Integrated review found and resolved a navigation race: an initialization finishing after switching to default Mode could cancel the default Mode's pending first read. Cancellation now targets only the exact named-tier keys being refreshed. The added real QueryObserver regression failed before correction (`idle` instead of `fetching`) and passed afterward; all 10 initialization-hook tests passed. The reviewer cleared authorization, versions, transactions, audit privacy, source/clear protections, dirty-state handling, and the correction. A lost POST response after a server commit has no dedicated test: a retry safely refreshes item/tier data through the no-op path, but other dependent caches may wait for normal refresh. No persistence or overwrite defect was found in that scenario.

### Final automated verification

After integrated review, the independent verification runner checked the final product sources. The new navigation regression initially needed required fixture metadata for TypeScript; that test-only correction was followed by a passing hook rerun and frontend typecheck/build.

| Check | Result |
| --- | --- |
| Backend focused copy, Mode-tier, route, route-registry, and selected-description suites | 228 passed; one previously confirmed unrelated Procurement basket authorization failure (201 expected, 403 received) |
| Full `ai-estimator-knowledge-integration.replica-set.test.ts` | 106 passed |
| `api-docs.test.ts -t 'tier description initialization'` | 1 passed; unrelated cases filtered |
| Frontend API, initialization hook, workspace configuration/client preview, pending changes, tier source, and mutation synchronization suites | 161 passed across seven suites |
| Client selected-description and GST presentation regressions | 21 passed |
| Corrected initialization-hook test fixture rerun | 10 passed, a subset of the 161 above |
| Backend and frontend `npm run typecheck` / `npm run build` | All passed |
| `git diff --check` | Passed |

The final scoped run has **517 distinct passing tests and one confirmed pre-existing failure**. Broader exploratory frontend failures and their baseline evidence are recorded above. No full repository/OCR suite or lint was run. Existing Mongoose `new` deprecation and Vite chunk-size warnings remain. Logs use `/private/tmp/lisno-tier-init-final-*`; the command list above records the exact verification scope. Builds generated ignored `backend/dist/` and `frontend/dist/` outputs. No dependency, lockfile, schema migration, production data change, commit, push, or deployment was performed.

### Real API browser verification

The primary exercised the actual `KnowledgeItemWorkspacePage` under React Strict Mode against the real Configuration admin router and services, backed by a newly created local Mongo replica set. Authentication used a loopback-only synthetic actor; production files, databases, and credentials were not used. Two synthetic Main Lines were created through real services: save Signature while only Signature is enabled, then enable Premium and Functional. Database reads confirmed both destination descriptions were absent before browser navigation.

Chrome checks passed at 1440×1000 and 390×844. Opening Premium automatically persisted Signature's existing wording into Premium and Functional without any section PUT or Save-button click. The advanced section version increased exactly once. Tier switching, browser reload, and reopening showed the saved wording without further version increments. On mobile, an injected 503 before the initialization handler left database versions unchanged; the visible retry action then completed successfully. Both widths had zero axe violations and horizontal overflow. The only console error was the intentionally injected mobile 503; there were no unexpected console/page errors. Screenshots were visually inspected.

Evidence summaries: `/private/tmp/lisno-tier-init-browser.json`, `/private/tmp/lisno-tier-init-browser.log`, and `/private/tmp/lisno-tier-init-api.log`. Temporary `backend/qa-tier-init-local.mts` and `frontend/qa/tier-init-local.*` were removed after checks, and their dedicated API/Mongo/Vite processes stopped. This browser run verifies real persisted initialization, unlike the earlier save-triggered feature's synthetic-transport browser check. Missing fixture prices mean client-preview rendering remains covered by focused rendered tests rather than this browser run.

An independent final browser run repeated this matrix against the final runtime, including the exact-query cancellation correction. Both 1440×1000 and 390×844 passed with real persisted Premium/Functional text and a single advanced-version increment from 2 to 3. Switching all tiers by keyboard, reloading, and reopening preserved the wording; subsequent initialization requests were no-ops with no version increment. No section PUT or manual Save occurred. The mobile injected 503 left the database unchanged before retry succeeded. Both widths reported zero axe violations, zero horizontal overflow, and no unexpected browser errors. The final JSON/log evidence is `/private/tmp/lisno-tier-init-browser-final.json` and `/private/tmp/lisno-tier-init-browser-final.log`. The temporary browser harness required serving actual local HTML because Chromium blocked loopback fetches from a synthesized document; this was a test setup issue, not a product defect.

Final screenshots were visually inspected at both widths and then removed. The temporary `/tmp` API/browser scripts and `frontend/qa/tier-init-final.html` were removed; the dedicated API/Mongo/Vite processes were stopped and ports 5037/4177 confirmed closed. Final source hashes were unchanged during the browser run. Repository status contains no QA harness or screenshot artifacts; `git diff --check` passes. Small JSON/log reports remain under `/private/tmp` as evidence.

## Original implementation and verification record

The sections below document the completed save-triggered implementation. Where its original contract conflicts with the approved spec amendment and amendment plan above, the amendment takes precedence. The original 454-test result does not verify the new automatic initialization behavior.

## Implementation contract

- A successful live Configuration draft save that changes a named, enabled tier's description to nonblank text initializes the same description in eligible enabled sibling tiers.
- Absent/null descriptions are eligible. Existing strings, including intentional empty strings, are preserved. Default Mode and explicitly `not_applicable` scopes are excluded.
- Copy only the description. Retain sibling settings, stable Main Line/revision identity, backend authorization, version checks, and selected-tier-only client projection.
- Save all affected descriptions in the existing transaction. Record copied tier IDs in the existing audit event. Preserve request/response shapes; no client-side sibling write loop.
- Refresh authoritative tier data without replacing unrelated unsaved edits. No new UI controls or runtime description fallback.

## Worktree and ownership

The initial worktree contains the preceding GST and selected-tier-description implementation, including dirty frontend description editors, client preview/rendering, backend description projection, tests, and untracked shared GST helper/documents. Preserve all of it. Before any writer starts, capture the current dirty-path set and per-target diffs, and reconcile any intervening user changes.

The primary agent owns product interpretation, this plan, integration, and any shared contract decision. No dependency, lockfile, model/schema, pricing, approval-history, or production-data change is planned. Do not modify those areas without evidence and scope reconciliation.

Only one parent phase is in progress at a time. Independent backend/frontend tasks run concurrently within the implementation phase.

Baseline: the existing 45 modified tracked files and seven untracked files belong to the preceding work and approved documents/helper tests. All production and test targets assigned to T2/T3 were clean before delegation. The backend baseline passed 21 mode-tier unit/scoped replica tests (76 unrelated cases filtered). The service has only the direct section-save and sub-basket margin callers; unchanged-description detection prevents the latter from triggering copying. Tier query keys are descendants of the Main Line item key already invalidated after saves.

## Dependency-ordered tasks

### T1. Establish the implementation baseline

Owner: primary agent. Dependencies: plan approval and execution-mode selection. Covers AC1–AC7.

- Capture dirty paths and target diffs before edits; preserve the previous feature's changes.
- Confirm the live section-save entry point and all callers of `updateSectionInSession`, including sub-basket margin updates. Ensure copying cannot be triggered by an unrelated settings operation or by excluded proposal/clone/provisioning flows.
- Confirm the existing enabled-tier reader, root Signature applicability, named-tier applicability, validation compatibility, audit shape, and tier cache invalidation. Reuse those mechanisms.
- Establish focused baselines for tier persistence and cache tests before modifying their behavior. Record pre-existing failures separately.

### T2. Implement atomic description initialization

Owner in Mode A: backend implementer. In Mode B: primary agent. Depends on T1. Covers AC1–AC5 and backend AC7.

Owned production paths:

- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/domain/ai-estimator-knowledge-mode-tiers.ts`, or one focused adjacent domain helper if separating the copying rule improves clarity

Owned tests:

- `backend/tests/ai-estimator-knowledge-mode-tiers.test.ts`, or a focused companion test for the helper
- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`

Work:

1. Implement a pure eligibility/copy rule using the previous persisted scope, accepted source payload, saved enabled tiers, and scope applicability. Preserve strings and malformed existing values; retain all unrelated fields.
2. Integrate it into the live advanced-section save transaction after validating the source and reading the same draft's Overview. Update root Signature applicability correctly when Signature is a destination. Keep existing version increments and atomic failure behavior.
3. Keep whole-section validation and historical compatibility protections intact. Do not repair unrelated old fields or mark missing prices as complete.
4. Add copied destination tier IDs to the successful section-save audit event, without description text. Keep existing public endpoint and response projections.
5. Test all three source tiers, two/three enabled tiers, absent/null versus blank/filled destinations, disabled/not-applicable scopes, default Mode exclusion, unchanged/empty source, independent later edits, length validation, identity isolation, and preserved non-description fields.
6. Add real replica-set coverage for persistence/reopen, concurrent and stale saves, rollback, versions, audit IDs, authorization, and immutable revisions. Include a failure after the proposed copy so partial commit cannot pass unnoticed.

Boundary: do not edit frontend or existing estimator display/price logic. Report contract issues to the primary agent before expanding scope.

### T3. Verify and correct tier refresh behavior

Owner in Mode A: frontend implementer. In Mode B: primary agent. Depends on T1; may run alongside T2 because request/response shapes remain unchanged. Covers AC4, AC6, and frontend AC7.

Owned production paths, only as required by evidence:

- `frontend/src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMutationSync.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`

Owned tests:

- `knowledgeModeTierDataSource.test.ts`
- `knowledgeMutationSync.test.ts`
- `KnowledgeModePanelPendingChanges.test.tsx`
- `KnowledgeItemWorkspace.configurationModes.test.tsx`
- `KnowledgeItemWorkspace.clientPreview.test.tsx`

All test paths above are within `frontend/src/features/ai-estimator-knowledge/`.

Work:

1. Verify existing invalidation refreshes the selected draft's sibling advanced-section queries and dependent previews. Make the smallest correction needed; remove outdated assumptions that sibling descriptions never change.
2. Keep one selected-tier save request. Read sibling results from the backend; do not reproduce copying logic in production frontend code or synthesize saved cache payloads.
3. Add rendered interaction tests for the user's Signature-to-Functional example, a different source tier, reopening/switching tiers, later independent edits, and pre-existing sibling text/intentional clear.
4. Verify failed/canceled saves do not show copied content, keyboard save remains accessible, unrelated local edits survive refresh, and stale-version handling retains user input. Exercise a previously cached sibling to catch stale data.
5. Verify the existing client preview receives copied saved text and still renders only the selected tier description. Retain layout and current GST presentation.

Boundary: no backend, shared contract, style redesign, new controls, or unrelated price/editor rewrites. Inspect prior diffs before extending any dirty test file.

### T4. Integrate and review

Owner: primary agent; Mode A uses an integrity reviewer after writers finish. Depends on T2 and T3. Covers AC1–AC7.

- Reconcile the integrated diff against the approved specification. Check atomicity, eligibility, root/sibling applicability, validation, identity isolation, audit behavior, cache freshness, and unsaved edits.
- Ensure test fixtures model server copying accurately without concealing production behavior. Confirm no excluded write path starts copying descriptions.
- Resolve confirmed findings before final verification. Preserve all preceding approved work. In Mode B, perform the equivalent review inline.

### T5. Verify the integrated result and hand off

Owner: primary agent; Mode A uses a verification runner after review fixes are complete. Depends on T4. Covers AC1–AC7.

Run focused suites, then affected workspace typechecks/builds. Commands are run from the stated directory:

```sh
# backend/
npm test -- tests/ai-estimator-knowledge-mode-tiers.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/estimator-tier-description.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/client/ClientQuotationLine.description.test.tsx src/features/estimates/estimateGstPresentation.test.ts
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

Include any newly added focused helper test in these commands. Run additional affected tests only when changed shared behavior or failures justify them. Replica-set tests use isolated local fixtures, never a production database or application seed. Do not weaken transaction semantics to make the environment pass.

Perform a focused rendered/browser check of saving, switching tiers, and independent editing at desktop and mobile widths using synthetic data. Verify accessible names, keyboard save, no unexpected errors, and no added headings. Record actual checks and any unavailable validation; do not claim a full suite or lint passed unless run. There is no repository lint script.

Update this plan with completed tasks, exact commands/results, findings, and remaining limitations. Report the behavior, principal affected files, validation, and any unrun checks. Clean up only temporary artifacts created for this task. No commit, push, deployment, migration, backfill, or external communication is included.

## Execution gates

This plan is the only new file created at the task-plan stage. After plan approval, ask for execution mode once. Mode A permits T2 and T3 on independent paths with explicit ownership and instructions to preserve others' work. Mode B performs those tasks inline. Both modes finish integration, review, and verification in dependency order.

## Execution evidence

- Independent integrity review found no confirmed defects or blockers. It checked copying eligibility, preserved descriptions and disabled scopes, root Signature applicability, same-revision reads, section/Main Line CAS, transactional audit, immutable history, validation compatibility, authoritative cache refresh, and regression coverage. It was a read-only review; final test execution is recorded separately below.
- Backend implementation: one focused domain helper initializes eligible sibling descriptions; the existing service transaction persists all changes and records only copied destination IDs. No API/schema or finance changes. Twenty-one helper cases and ten replica-set cases were added. The combined scoped run passed 52 tests (76 filtered), backend typecheck passed, and the three all-source replica cases passed again after strengthening applicability and audit privacy assertions (95 filtered). Scoped replica tests required approved local-port escalation after a sandbox EPERM; no transaction semantics were changed. Logs: `/private/tmp/lisno-tier-copy-backend-tests.log` and `/private/tmp/lisno-tier-copy-backend-applicability.log`.
- Frontend baseline: five focused suites, 123 tests passed. After eight new regression cases, the same suites passed 131 tests. Typecheck found readonly mutations in test fixtures; those were corrected to immutable replacement, four affected cases passed on rerun, and typecheck passed.
- Existing Main Line item-prefix and catalogue invalidation already refresh sibling tier descriptions. Frontend production behavior needed no change; only an outdated comment was corrected. The three changed frontend test files cover authoritative refresh, cached switching, keyboard save, independent later editing, protected existing/blank wording, canceled/failed saves, and client preview.
- A temporary browser harness mounted the actual `KnowledgeModePanel`, tier data source, query invalidation, and client description component with synthetic persistence. Chrome checks passed at 1440×1000 and 390×844: keyboard save issued one write, a previously cached Functional tier showed copied wording, subsequent Functional edits preserved Signature, disabled Premium/default wording remained unchanged, client content had no internal heading, and both viewports had zero console errors, horizontal overflow, or axe violations. Screenshots were visually inspected. This verifies frontend behavior with synthetic data; real transactional persistence is covered separately by Mongo tests.
- Browser evidence summary: `/private/tmp/lisno-tier-copy-browser.json`. Temporary `frontend/qa/tier-copy-local.*`, `output/playwright/tier-copy-*.png`, and this session's `.playwright-cli` output were removed. The dedicated Vite server was stopped. The CLI could not retain its browser session across calls, so the successful check used the installed Playwright library in a single local Chrome process.

## Final integrated verification

The verification runner executed these commands after both implementation writers finished and integrity review found no blockers:

```sh
# backend/
npm test -- tests/ai-estimator-knowledge-tier-description-copy.test.ts tests/ai-estimator-knowledge-mode-tiers.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/estimator-tier-description.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/client/ClientQuotationLine.description.test.tsx src/features/estimates/estimateGstPresentation.test.ts
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

Results:

- Backend focused suites: 188 passed, one unrelated failure. The complete knowledge replica-set integration suite passed all 98 cases. Backend total: 286 passed, one confirmed pre-existing failure. Initial sandbox local-port failures were rerun with approved escalation; the successful runs exercised real replica-set transactions.
- Frontend: 131 owned-suite tests and 37 description/GST regressions passed, 168 total. Combined final successful test cases: 454.
- Both workspace typechecks and production builds passed. `git diff --check` passed. Existing Mongoose `new` option deprecation and Vite large-chunk warnings remain.
- The unrelated failure is `rejects a new Budget price after induction approval is reopened`, in `backend/tests/ai-estimator-knowledge-item.service.test.ts:2849`. The promise resolves where the existing test expects rejection. The verifier reproduced it both in isolation on the current worktree and in an isolated HEAD archive with existing dependencies. This failure predates the description changes; no unrelated vendor/pricing fix was included.
- The baseline reproduction command, run separately from `backend/` in both locations, was `npm test -- tests/ai-estimator-knowledge-item.service.test.ts -t 'rejects a new Budget price after induction approval is reopened'`. The temporary baseline archive was removed without swapping or reverting shared-worktree files.
- Final command logs are at `/private/tmp/lisno-tier-copy-final-*.log`. The isolated baseline was HEAD `baddcbcde6734de49f14492778bcf50add34971d`. Builds refreshed ignored `backend/dist/`, `frontend/dist/`, and frontend caches; none were staged.

Final production files for this added behavior are `backend/src/domain/ai-estimator-knowledge-tier-description-copy.ts` and `backend/src/services/ai-estimator-knowledge-item.service.ts`; the frontend tier data source has a corrected comment only. Five regression-test files cover the domain, persistence, cache, workspace interaction, and preview. Earlier approved GST and selected-tier-description work remains intact.

Verification scope: the selected backend suites, full knowledge integration suite, focused frontend suites, both builds/typechecks, and synthetic browser checks above were run. The entire repository test suite and a live deployed-backend browser session were not run. No lint command exists. No dependencies, schema migration, backfill, seed, commit, push, deployment, or production/customer action was performed. Historical data was not rewritten.

# Design upload layout requirements: task plan

Date: 2026-11-27
Status: Implemented locally; Mode A review and verification finished, with baseline failures and runtime limits recorded below
Approved specification: [Design uploads follow the Client's execution choice](../specs/2026-11-27-design-upload-layout-requirements-design.md)

The user approved the linked specification and this plan, then selected Mode A. Its acceptance criteria AC1–AC10 and compatibility rules are the source of truth.

Execution record: T0–T4 finished. All writers have stopped, independent integrity findings are resolved, and final verification is recorded below. The repository-wide suites are not fully green. The initial 44 dirty files, their contents/hashes, and tracked diff are preserved under `/private/tmp/lisno-layout-requirements-baseline`. Focused baselines: backend upload/review/lineage 65 passed (local test listener permission required), web upload/Designer workspace 87 passed, native preparation/API 38 passed. Native contract checks reproduce two existing failures (permission mirror drift and a stale operation-count assertion).

Contract decision: new classified manifests add optional `layoutType` and `layoutClassification` metadata to the existing version-1 shape. Untyped manifests omit these fields, retaining their original hash and bytes. Current classification changes the current manifest hash; historical rounds continue using pinned documents. Workspace `layoutRequirements` carries `designPlanVersion`, `revisionKey`, and coverage separate from full submission readiness. Classification uses `expectedDesignPlanVersion` and returns the saved upload DTO; it uses the existing lifecycle fence without incrementing the review-round version. Shared definitions live in `backend/src/contracts/design-layout-requirements.ts`, re-exported through `shared/projects/designLayoutRequirements.ts`.

## Outcome and fixed scope

- Option 1 requires separate original 2D and 3D uploads before a new Client review can be submitted.
- Option 2 offers and accepts only new 3D layouts, with no missing-2D requirement.
- Eligible existing unclassified drafts can be explicitly labeled once and reused. Approved content and stored review history remain unchanged.
- The backend derives requirements from the permanently saved Client choice and enforces them at upload, classification, and transactional review submission. Web and native display those requirements.
- Existing drawing verification, mapping, extraction, prepared-PDF, authorization, lifecycle, and delivery rules continue to apply. This does not introduce ordered completion of Renders, Selections, or Production.

No dependencies were added. No bulk migration, backfill, deployment, production writes, commits, pushes, or actual customer messages were performed. Existing PDF/image formats remain the supported layout formats.

## Evidence and implementation boundaries

The current worktree already contains the permanent execution-choice feature and the Designer project-only workspace. Preserve both, including the existing uncommitted edits.

| Area | Current evidence | Planned integration |
| --- | --- | --- |
| Choice | `backend/src/contracts/project-execution-choice.ts`, `backend/src/domain/project-execution-choice.ts`, and `shared/projects/executionChoice.ts` define and validate the saved choice/history. | Reuse those definitions and validation; no second choice source or default. |
| Upload persistence | `EstimateDesignUpload.ts` distinguishes ordinary/replacement purposes. `estimate-design.service.ts` stores files and transactionally creates upload/job/audit records. | Add independent layout metadata and enforce choice before storage and again at commit. Preserve compensating cleanup. |
| Draft classification | No existing layout-label mutation exists. Existing upload/deletion code establishes ownership, editability, lifecycle, and approved-content protection. | Add a bounded conditional one-time mutation with existing upload permission, version guard, idempotency, and audit. |
| Current lineage | `resolveDrawingPlacement` in `domain/estimate-plan-document.ts` resolves original upload/page identities through revision ancestry. | Reuse this lineage for coverage and inheritance instead of counting upload rows or duplicating a weaker traversal. |
| Review submission | `submitDrawings` and `project-workflow.service.ts::prepareDesignReview` revalidate current revisions and prepared documents in a transaction. | Validate layout coverage at both applicable boundaries and snapshot the evidence used by the committed review. |
| Historical artifacts | `DesignPlanReviewRound.ts` stores immutable attachments and plan-document references. Current plan manifests use schema/renderer version 1. | Add optional metadata for new rounds; retain old readers and bytes. Bind new readiness to classification without rewriting old manifests. |
| Consumers | Web `EstimateDesignUploads.tsx`; native `EstimateDesignPreparation.tsx`, `DesignFileUpload.tsx`, and runtime models. | Extend the existing upload workflow, labels, readiness, and cache handling. Keep the Designer workspace scoped to its selected project. |
| Authorization inventory | Backend `route-operations.ts`, OpenAPI, and native `contracts/operations.ts`. | Register the classification operation using existing upload authority and the existing personal-action restriction. No new role grants. |

The services intentionally use direct Mongoose for these paths. Keep that architecture and `.js` import suffixes. OCR lease/heartbeat/result contracts remain unchanged; worker results must not overwrite upload classification.

## Ownership and safe parallelism

Keep one parent task in progress at a time: baseline, contract, implementation, integrity review, then final verification. The implementation parent contains three independently owned slices.

| Owner | Write boundary | Exclusions / handoff |
| --- | --- | --- |
| Primary agent | This plan; shared layout definitions/contracts and their focused contract tests; cross-layer decisions and final integration. Proposed shared module: `shared/projects/designLayoutRequirements.ts`; backend contract: `backend/src/contracts/design-layout-requirements.ts`; relevant additions to `backend/src/contracts/estimate-plan-document.ts`. | Freeze these contracts before concurrent writers. Do not edit another active writer's files. |
| Backend implementer | Relevant `backend/src/models`, upload/plan-document domain and service files, design routes, `route-operations.ts`, OpenAPI, and backend behavior/transaction tests. | No `frontend/`, `mobile/`, `shared/`, or primary-owned contract edits. One backend owner for the interdependent upload, deletion, manifest, and review services. |
| Web implementer | `frontend/src/features/leads` upload/API/document/review consumers, `frontend/src/api/types.ts`, associated tests and scoped styles/fixtures. | No backend/native/shared edits. Preserve existing Designer page behavior; parent-page changes only if required, after reviewing its existing diff. |
| Native implementer | `mobile/src/features/design-plans`, `mobile/src/contracts/operations.ts`, related capability/contract tests and scoped fixtures. | No backend/web/shared edits. Preserve existing session isolation and workflow-choice changes. |
| Integrity reviewer | Read-only integrated review after writers finish. | Report concrete findings; primary coordinates fixes with the owning writer. |
| Verification runner | Final tests/builds and rendered checks after review fixes finish; no product-source edits. | Return actual commands/results and limitations. |

After Mode A is selected, use native Codex agents for independent audits when useful, then backend/web/native writers after the contract is fixed. The three writers can run together within the four-agent limit. Tell every writer it shares the worktree, identify existing dirty targets, and prohibit reverting others' edits. Review and final verification run sequentially after all writers finish. In Mode B, the primary performs the same tasks inline without subagents.

## T0. Capture baseline and confirm integration seams

Owner: primary. Dependencies: plan approval and execution-mode selection. Covers: AC4–AC10.

1. Capture `git status --short`, the initial dirty-path set, relevant per-target diffs, and content hashes for existing untracked/dirty work before assigning writers. Record temporary evidence outside tracked source. In particular, inspect the existing `backend/src/openapi.ts` and Designer-page changes before permitting edits there.
2. Confirm upload, replacement, manual drawing, deletion, submission, Client review, and delivery-retry callers. Identify exact cache keys and response parsers used by both clients.
3. Inspect the current lifecycle race fence and design-plan version semantics. Confirm how approved root content and currently submitted files are proven from persisted history, including partial approvals and reopened work.
4. Run focused existing upload/review/lineage, web upload, and native preparation/contract checks before implementation. Record failures with current evidence; previous task test counts are background only.
5. Check the replica-set harness and browser/native verification tooling. Do not substitute mock-only evidence for changed transactional paths.

Exit: known ownership, current baseline, confirmed lineage/locking seams, and a bounded list of affected consumers. If an implementation discovery would materially change approved behavior, update the affected approved artifact and request its approval once before that change.

## T1. Establish the shared contract and fixtures

Owner: primary. Dependency: T0. Covers: AC1–AC10.

1. Define the two layout values and derive required/allowed types from canonical execution-option definitions. Do not duplicate the permanent option sequences.
2. Fix the workspace projection for applicability, choice availability, required/allowed types, current per-type coverage, unclassified editable uploads, missing types, and safe blockers. Represent missing/unavailable choice explicitly and distinguish layout coverage from full review readiness.
3. Fix upload/document labels and optional historical fields. Missing historical metadata remains explicitly unclassified; it never defaults to 3D. Define replacement labels as inherited from proven roots.
4. Fix the multipart `layoutType` input and strict `PATCH /estimate-design-uploads/:uploadId/layout-type` request/response: layout type, expected design-plan version, idempotency key, and the saved classification result. Document validation, permission, stale/conflict, and uncertain-result behavior using existing API conventions.
5. Define persisted classification actor/time/choice lineage and the command identity needed for exactly-once assignment. A replay must reauthorize before returning a result; same-command replay and conflicting reassignment are separate cases.
6. Define new review snapshots: choice identity/definition, required types, qualifying root uploads/current revisions/prepared-document identities, and attachment categories. Identify every historical reader so new labels come from the round snapshot, not live state.
7. Specify how classification participates in current preparation/readiness identity and stale-preparation checks. Preserve existing version-1 manifests and pinned round documents; use an additive/versioned contract where necessary, without changing historical hashes or bytes. Record the concrete decision here before handing off writers.
8. Provide asymmetric fixtures: two projects with different choices, two assigned Designers, distinct root uploads, replacement chains, an unclassified editable draft, protected approved legacy content, and old/new review rounds.

Exit: exact request/response/snapshot shapes and fixture expectations shared with all writers. No writer invents missing-data fallbacks. Routine contract naming/refinement within the approved behavior does not reopen approval gates.

## T2. Implement the three owned slices

Dependencies: T1. Backend, web, and native slices may run in parallel against the fixed contract. Each owner runs its focused checks; results remain provisional until integrated verification.

### T2a. Backend enforcement, lineage, and immutable review evidence

Owner: backend implementer. Covers: AC2–AC8, AC10.

Affected areas: `EstimateDesignUpload.ts`, `DesignPlanReviewRound.ts`, `estimate-designs.ts`, `estimate-design.service.ts`, `estimate-design-upload-deletion.ts`, plan-document domain/manifest/service code, `project-workflow.service.ts`, applicable review readers, route-operation registry, OpenAPI, and their tests. Add a focused layout domain/service helper if it avoids repeated rules in the existing large service.

1. Add optional classification metadata without changing upload `purpose` or existing historical defaults. Keep sensitive storage references private.
2. Enforce valid same-project saved choice and allowed type before new applicable upload storage and inside upload/job/audit persistence. Preserve pre-approval Sales uploads. Reject malformed/omitted categories and Option 2 direct 2D requests; do not accept invalid input simply because a client hides it.
3. Implement one-time draft labeling in the existing transaction/lifecycle model: current active Designer authority, editable state, expected version, eligible unclassified ordinary root, conditional first assignment, command replay, and a single audit. Deny approved/submitted/frozen/deleted/foreign files. Roll back classification on audit failure. Do not alter bytes, crops, mappings, or jobs.
4. Resolve current layout coverage through original-upload/page/revision ancestry. Require distinct roots for Option 1; ignore empty, failed, removed, deleted, stale, superseded, or foreign content. Treat unresolved/mismatched lineage as a conflict. Distinguish proven approved legacy references from editable unclassified content.
5. Preserve type through extraction, manual drawings, retry, drawing replacement, and requested-page replacement. Block replacement of an eligible unclassified draft until it is labeled. An approved legacy continuation remains historical and cannot create typed coverage. A replacement cannot convert layout type or create a second root.
6. Return authoritative requirements and labels from authorized workspace/document responses. Recompute after every relevant mutation; never persist a guessed read-time classification.
7. Add choice/coverage checks inside `submitDrawings` and `prepareDesignReview`, alongside existing current-revision and prepared-manifest checks. Share lifecycle locking with classification, replacement, and deletion so stale preflight success cannot commit an invalid review.
8. Store immutable classification/coverage evidence on new rounds and attachment/document snapshots. Preserve old-round reads, Client decisions, and stored-artifact delivery retries. Incomplete submissions create no submitted revisions, round, or email; complete submissions retain existing commit-independent disabled/failed/sent delivery semantics.
9. Register the classification route with `estimation.design_upload.create` and the matching personal-operation restrictions, update OpenAPI/runtime validation, and notify the native owner of the exact registry entry. Preserve existing permission grants.
10. Add focused unit/HTTP and real Mongo replica-set coverage for classification races, upload/delete/replacement/submit conflicts, storage compensation, audit rollback, and historical compatibility.

Exit: backend checks enforce all applicable requirements independently of client state; current and historical responses satisfy T1 contracts.

### T2b. Web upload groups, existing-draft labeling, and review states

Owner: web implementer. Covers: AC1, AC3–AC5, AC7, AC9–AC10.

Primary files: `EstimateDesignUploads.tsx`, `estimateDesignApi.ts`, `api/types.ts`, `PlanDocuments.tsx`, relevant Client/staff review readers and focused tests. Use existing design-system controls and scoped styles; add no decorative redesign or project selector.

1. Consume backend requirements and render a concise Required layouts summary. Option 1 exposes separate “Upload 2D layout” and “Upload 3D layout” inputs; Option 2 exposes only 3D. Preserve the generic pre-approval upload flow.
2. Send the fixed group type with each ordinary upload. Maintain independent progress/error state and retain the current policy against silently replaying ambiguous ordinary uploads.
3. Show saved/inherited labels and missing, processing, review-pending, and ready states. Required-type coverage supplements existing drawing/PDF checks; it must not enable submission early.
4. Add explicit one-time labeling for eligible legacy drafts, with no preselected category, allowed options only, confirmation, pending state, conflict recovery, and focus restoration. Keep protected historical uploads readable and uneditable.
5. Fail closed for loading, missing choice, invalid choice, denied, and failed-refresh states. Reset selected files and classification commands when estimate/project/identity changes.
6. Invalidate affected workspace, current documents/readiness, workflow/tasks, and Client review queries after mutations. Historical views use snapshot labels. Preserve the one-project Designer page and back navigation.
7. Add rendered interaction/accessibility tests for both choices, incomplete submission, legacy confirmation, stale/version denial, refresh failure, replacement labels, read-only history, and project changes. Check 1440/768/390px layouts without overflow.

Exit: visible controls and client behavior agree with backend contracts without weakening existing submission or identity isolation.

### T2c. Native upload groups, classification, and contract parsing

Owner: native implementer. Covers: AC1, AC3–AC5, AC7, AC9–AC10.

Primary files: `EstimateDesignPreparation.tsx`, `DesignFileUpload.tsx`, `designPlanApi.ts`, `designPlanModel.ts`, `PreparedPlanDocuments.tsx`, applicable review controls, `contracts/operations.ts`, and related fixtures/tests.

1. Extend runtime schemas and multipart/API calls for layout requirements, labels, and classification. Reject malformed applicable contract data instead of inventing requirements.
2. Provide the same choice-dependent groups and explicit one-time draft confirmation as web, using accessible native controls and status announcements.
3. Preserve session/environment/estimate scoping, picker cancellation, upload progress, denial cache clearing, operation-capability checks, and safe replacement retries. Never auto-replay an ambiguous ordinary upload.
4. Reset pending file/classification state on session/project changes and invalidate the same affected data families as web. Preserve pinned historical labels.
5. Mirror the new protected operation and its permission/Super Admin behavior. Reproduce and report any unrelated pre-existing contract-inventory drift separately; do not weaken equality assertions or expand permissions to make tests green.
6. Extend rendered preparation and API tests for both options, missing choice, incomplete coverage, one-time classification, forbidden/stale responses, uncertain outcomes, and session isolation.

Exit: native parsing, controls, and mutation behavior match the fixed backend contract, with no extraction-worker or platform dependency changes.

## T3. Integrate and review integrity

Owner: primary plus read-only integrity reviewer in Mode A; primary inline in Mode B. Dependency: all T2 writers finished. Covers: AC1–AC10.

1. Inspect all new/modified paths against ownership and the initial dirty baseline. Reconcile DTOs, runtime schemas, OpenAPI, operation mirrors, error codes, and query invalidations.
2. Trace an Option 1 and Option 2 request end to end, including direct API bypass attempts, legacy classification, replacement inheritance, prepared-document freshness, and Client historical reads.
3. Review transaction boundaries and shared race fences, authorization before idempotent disclosure, original-root distinctness, partial approval, artifact immutability, cleanup, and email retry behavior.
4. Resolve concrete findings with the owning writer. Share any contract correction with all affected consumers before further edits. Preserve prior features and unrelated work.

Exit: no unresolved correctness or authorization findings; all writers stopped before final verification.

## T4. Verify the integrated worktree and hand off

Owner: verification runner in Mode A; primary inline in Mode B. Dependency: T3 and any fixes complete. Covers: AC1–AC10.

### Acceptance evidence matrix

| Criteria | Required integrated evidence |
| --- | --- |
| AC1 | Render both exact choices on web/native; separate roots for 2D/3D and a single allowed 3D group for Option 2. |
| AC2 | HTTP/service rejection matrix for absent/invalid choice, missing/malformed type, Option 2 2D, inactive/wrong Designer, and mismatched project IDs. |
| AC3 | Option 1 missing-2D/missing-3D cases block; complete Option 1 and 3D-only Option 2 pass all existing mapping/verification/PDF gates. |
| AC4 | Reload, worker completion, manual drawing, retry, and both replacement paths preserve root type; replacement never counts as another required type. |
| AC5 | Replica-set same-command retry, competing labels, stale version, authorization revocation, one audit, audit rollback, and all protected-state denials. |
| AC6 | Current lineage fixtures and races exclude empty/failed/deleted/removed/superseded/foreign/stale content; partial approval and prepared-document mismatch remain safe. |
| AC7 | Pre-approval uploads still work; approved legacy files stay untyped/protected; old-round decisions/read/retry use original artifacts and labels; new rounds pin new evidence. |
| AC8 | Replica-set upload/classify/delete/replace/submit concurrency plus storage and audit failures leave no partial committed workflow or orphaned new file. Verify existing disabled/failed/successful/concurrent/retry delivery behavior with test transports. |
| AC9 | Rendered web/native loading/error/denied/read-only/progress/conflict states; classification focus/confirmation; no early submit; refresh and cross-session/project cache isolation. |
| AC10 | Contract checks, builds/typechecks, broader regression suites, browser viewport/keyboard checks, native export and available runtime smoke checks, final diff/status review. |

### Commands and verification order

Run focused checks first, including new layout-specific suites created by T2. The following existing commands are known repository lanes; record the exact final commands and outcomes during execution.

Backend, from `backend/`:

```sh
npm test -- tests/estimate-design-upload.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts tests/estimate-design-audit.test.ts tests/estimate-design-mapping.test.ts
npm test -- tests/estimate-plan-document-lineage.test.ts tests/estimate-plan-documents-routes.test.ts tests/estimate-design-upload-delete-route.test.ts
npm test -- tests/estimate-design-upload-delete.replica-set.test.ts tests/estimate-plan-document-service.replica-set.test.ts tests/project-workflow-mongo.replica-set.test.ts
npm test -- tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/project-workflow.test.ts tests/project-workflow-routes.test.ts
npm run typecheck
npm test
npm run build
```

Frontend, from `frontend/`:

```sh
npm test -- src/features/leads/EstimateDesignUploads.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx
npm run typecheck
npm test
npm run build
```

Native, from `mobile/`:

```sh
npm test -- --runInBand src/features/design-plans/DesignPreparation.test.tsx src/features/design-plans/designPlanApi.test.ts
npm run test:contracts
npm run typecheck
npm test -- --runInBand
npm run export:android
```

The broader suites are justified by changed upload/review contracts and multiple consumers. Do not repeatedly rerun passing broad suites without new changes or unresolved failures. Reproduce failures in isolation and compare with the captured current baseline before attributing them; never report a failing suite as passed. No repository lint script exists.

Rendered browser checks use local synthetic fixtures at 1440, 768, and 390px. Cover both choices, no choice, explicit legacy labeling, missing-type submission, and the preserved project-only workspace. Check keyboard navigation, accessible names/focus, overflow, console, and network errors. Use the Playwright skill when performing browser automation. Verify native rendered interactions and export; if a simulator/device is available, smoke-test picker/confirmation/session reset there, otherwise state that device interaction was not verified. Do not claim export proves physical-device behavior.

No OCR suite is required if the worker protocol and worker files remain untouched; backend worker-result regression tests must still demonstrate that classification survives extraction. Reassess this lane if the implementation changes that boundary.

Finish at the repository root with `git diff --check`, `git status --short`, and full changed-path/diff review against the baseline. Remove only task-created temporary browser fixtures, screenshots, uploads, and build/test artifacts when no longer needed; preserve pre-existing generated/tracked content. Record artifact paths and any retained evidence without including private Client data.

### Completion record

Local implementation and the planned review/verification work are finished. The affected feature checks pass. Full-suite failures and runtime limitations remain explicitly recorded; this is not a claim that the entire repository is green.

| Final check | Actual result |
| --- | --- |
| Backend affected lane | All 462 tests across 19 files passed in the integrated full run, including Mongo replica-set tests. Corrected supplementary API, Client-review, and replacement fixtures passed another 30 tests. |
| Backend typecheck/build | Both passed. |
| Backend full suite | 8,456 passed, 73 failed, 24 skipped across 417 files: 394 passed files, 20 failed, 3 skipped. Attribution below. |
| Web affected lane | 134/134 tests passed across eight files. |
| Web typecheck/build | Both passed; Vite retains its existing large-chunk warning. |
| Web full suite | 7,796 passed, 141 failed across 480 files. All 141 failures exactly reproduce the captured pre-change baseline. |
| Native full suite | 1,937 passed, two pre-existing contract-inventory failures across 194 suites (193 passing suites). |
| Native typecheck/Android export | Passed. |
| Browser interactions/accessibility | Both choices checked at 1440/768/390px; no overflow or application errors in checked states, and zero axe violations. Keyboard confirmation, version 0, explicit empty initial classification, saved labels, and save/cancel focus restoration passed. |
| Repository hygiene | `git diff --check` passed; `git status --short` captured. Initial unrelated edits preserved. |

The backend's 73 full-run failures comprise 61 exact pre-change baseline matches, 10 outdated API/Client-review/replacement fixture expectations corrected and rerun successfully, and two intermittent cases. The complete suite was not restarted after bounded fixture-only corrections. The catalogue file passed 131/131 on current and baseline reruns; its one-time unexpected HTTP 404 remains unexplained. The Python transport file passed 69/69 on both reruns; its broad privacy regex had accidentally matched `360` inside a random UUID. Neither intermittent test was weakened. No unclassified new product regression remains identified.

Native baseline failures are the existing missing-permission mirror and stale hardcoded operation-count assertion. The added classification operation has focused permission coverage. No device smoke test was possible: no Android device was attached, and iOS simulator discovery timed out. Export and rendered component tests do not establish physical-device picker behavior.

Independent integrity review cleared both findings after fixes: retained replacement lineage remains readable after original/obsolete source deletion, and pending legacy reviews protect roots through submitted revision ancestry as well as attachment IDs. Four additional replica-set cases cover these protections and unrelated-project stability. Review found no remaining blocking findings.

#### Acceptance evidence and affected areas

- AC1–AC3: the shared contract, backend layout tests, and web/native rendered tests verify separate 2D/3D roots for Option 1, only 3D for Option 2, and fail-closed missing or invalid choice. Backend enforcement remains authoritative.
- AC4–AC6: extraction, lineage, deletion, replacement, classification, and replica-set submission tests verify inherited types, once-only assignment, version/idempotency checks, ownership, protected states, distinct qualifying roots, and lifecycle races.
- AC7–AC8: manifest/publication/review and replica-set tests cover untyped historical compatibility, pinned evidence, prepared-document identity, audit rollback, storage cleanup, and existing delivery behavior.
- AC9: rendered interaction tests and browser checks cover confirmation, accessible names/focus, stale/conflict/error handling, readiness, cache/session isolation, and preservation of the project-only Designer workspace.
- AC10: all three typechecks, backend/web builds, Android export, full suites with baseline attribution, integrity review, and final diff/status checks ran. Native device interaction and the existing skipped backend integration cases remain unverified.

Principal changed files include the new `backend/src/contracts/design-layout-requirements.ts`, its shared re-export, `backend/src/services/design-layout-requirements.service.ts`, upload/review models, upload and project-workflow services/routes, plan-document and historical review readers, route-operation/OpenAPI inventories, and their regression tests. Web changes are centered on `EstimateDesignUploads.tsx`, the new `DesignLayoutRequirements.tsx`, API types/calls, document/review labels, and focused tests. Native changes are centered on design preparation/upload/requirements, document/review readers, API/runtime models, operation mirror, Metro/Jest configuration, and tests. Existing approved-choice and project-only-workspace changes were retained.

38 of the initial 44 dirty files remain byte-identical. Six understood overlaps are the current spec/plan, OpenAPI, Designer page and its test, and Metro configuration. Existing changes in those files were preserved. No dependencies or lockfiles changed, and no OCR worker code/protocol changed. Backend extraction regression tests passed; the OCR worker suite was not run. No lint script exists, so no lint pass is claimed.

#### Executed commands and retained evidence

Exact commands, working directories, exits, failure titles, skipped cases, and baseline comparisons are retained in [backend verification report](/private/tmp/lisno-layout-verification/backend-report.md), [backend command/results record](/private/tmp/lisno-layout-verification/backend-report.json), [frontend verification report](/private/tmp/lisno-layout-verification/frontend-report.md), and [frontend command/results record](/private/tmp/lisno-layout-verification/frontend-report.json).

Final commands below preserve actual arguments. Full-suite commands returned exit 1 with the counts above; typecheck/build and corrected supplementary commands returned exit 0.

From `backend/`:

```sh
npm run typecheck
npm run build
npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=/private/tmp/lisno-layout-verification/backend-full.json
npm test -- tests/estimate-design-upload.test.ts --maxWorkers=1
npm test -- tests/api-docs.test.ts -t 'contains all 545 routes|documents exact workflow multipart contracts' --maxWorkers=1
npm test -- tests/estimate-plan-review-client.test.ts --maxWorkers=1
npm test -- tests/estimate-plan-request-replacement.replica-set.test.ts --maxWorkers=1
```

From `frontend/`:

```sh
npm test -- src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/EstimateDesignLayouts.test.tsx src/features/leads/PlanDocuments.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/estimates/ClientFullPlanNav.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/ClientEstimateDesignReview.test.tsx --maxWorkers=2 --reporter=default --reporter=json --outputFile=/private/tmp/lisno-layout-verification/frontend-focused.json
npm run typecheck
npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=/private/tmp/lisno-layout-verification/frontend-full.json
npm run build
```

From `mobile/`, `npm test -- --runInBand` and `npm run typecheck` ran. The Android Expo export passed; detailed native output is retained at `/private/tmp/lisno-layout-requirements-baseline/native-full-final.log` and `native-export-final.log`.

Browser evidence is retained at `/private/tmp/lisno-layout-requirements-baseline/browser-results.json`. Checks used the actual upload component and styles with synthetic local API fixtures. Temporary fixture files, six screenshots under `output/playwright/`, and task-created Playwright snapshots/logs were removed; browser and Vite processes were closed. The temporary Android export was removed and the original tracked export log restored byte-for-byte. Ignored `backend/dist`, `frontend/dist`, and normal build caches may remain from required builds. The initial snapshot and isolated baseline checkout under `/private/tmp/lisno-layout-requirements-baseline` and verification reports under `/private/tmp/lisno-layout-verification` are retained as comparison evidence; no runtime artifacts were staged.

## Authorization and delivery boundary

Specification and plan approval plus Mode A selection authorized the completed local implementation, review, and verification. No migration, backfill, seed, deployment, commit, push, production mutation, or customer communication was performed. No further implementation approval is pending.


## Client extracted-image review follow-up (2026-11-27)

Status: implemented locally; independent review and bounded final verification passed under the approved Mode A preservation scope (AC9–AC10). User reported that the Client screen shows only PDF attachment rows and requested that existing extracted 2D/3D image review remain available.

Evidence: the exact screenshot text comes from `DesignReviewCard` inside `ProjectClientActions`. That component is a summary of immutable attachments and staff proof decisions, not the Client drawing workspace. Existing `ClientEstimateDesignReview` still provides extracted drawings, full-plan thumbnails, annotations, and Client decisions, but `ClientProject` mounts it inside the initially collapsed Estimation phase. Design flow starts open and contains the summary card. Both backend Client workspace readers retain their image responses and immutable review-round selection; layout changes were additive labels. Seven relevant composition files are unchanged from the captured pre-layout baseline.

Bounded correction: reuse the existing Client review component in Design flow from the already verified unique project estimate. Suppress only the embedded Estimation duplicate using default-preserving props, retain standalone quotation/dashboard review, and send the task link to the direct design-review anchor. Preserve all role, source, quotation, version, and review-status gates. Do not place a current editable workspace inside historical task cards. No extraction, storage, schema, permission, approval, or API behavior changes.

Ownership: web implementer owns `ClientProject.tsx`, `ClientEstimationWorkspace.tsx`, `EstimateReviewPanel.tsx`, `ProjectClientActions.tsx`, and their focused tests. Primary owns this follow-up record, temporary browser fixtures, and integration. Read-only frontend/backend audits are complete. Initial dirty paths and target snapshots are retained at `/private/tmp/lisno-client-image-review-baseline`.

Verification: rendered Client project tests must show actual extracted drawings and full-plan thumbnails for two typed uploads while Estimation is closed, retain one viewer when Estimation opens, navigate/reveal the direct link, and fail safely for unavailable or ambiguous project reads. Run focused affected suites, frontend typecheck/build, a browser interaction/responsive check with synthetic data, independent integrity review, and final diff/status review. The preceding broad-suite baseline results remain relevant; no full-suite repeat is planned for this bounded composition fix.


Follow-up implementation evidence: four product files changed as assigned. `ClientProject.designReview.test.tsx` adds 18 rendered cases with real drawing/full-plan components; the existing task-link test was updated. The final six-suite lane passed 130/130 tests and frontend typecheck passed. No source changes were made to extraction, backend APIs, approved artifacts, or native UI.

The review identified and the owner corrected a stale-image cache issue in the new direct navigation: successful unique-project metadata refresh now invalidates both Client drawing and full-plan workspaces. The viewer remounts when its design-plan version changes, closing old-round dialogs. Same-version refresh keeps open annotations. Navigation also refreshes when another metadata read is already in flight. Rendered regressions cover both version transitions and that overlap.

Browser evidence: actual Client project composition with synthetic local transport showed both extracted drawings and both full-plan thumbnails loaded at 1440/768/390px with no horizontal overflow, console errors, or unhandled requests. The existing drawing preview and full-plan annotation dialogs opened; opening Estimation left exactly one viewer; keyboard activation of the task link focused `#design-review`. Scoped axe checks reported zero violations for the populated review and dialog; the existing whole-page axe test additionally caught a missing region role in the empty state, which was corrected before the final 130-test pass. Browser fixture, three screenshots, and task-created CLI outputs were removed, and the browser was closed. Evidence: `/private/tmp/lisno-client-image-review-baseline/browser-results.json`.

Exact focused command from `frontend/`:

```sh
npm test -- src/features/client/ClientProject.designReview.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/workflow/ProjectClientActions.test.tsx
npm run typecheck
```

Logs: `/private/tmp/lisno-client-image-review-final-focused.log` and `/private/tmp/lisno-client-image-review-typecheck.log`. Full suites were not rerun for this bounded Client composition correction; preceding baseline failures remain documented above. Backend/native/OCR checks are unchanged and were not repeated. No new dependency, migration, commit, deployment, or customer-data mutation was performed for this correction.


Final follow-up handoff: the independent integrity reviewer confirmed the cache finding resolved with no remaining introduced finding. The verification runner confirmed `cd frontend && npm run build` exited 0 (Vite 9.91s), retaining the pre-existing >500 kB chunk warning. Main JavaScript is 3,563.28 kB, gzip 982.65 kB. Build log: `/private/tmp/lisno-client-image-review-build.log`. `git diff --check` passed and `git status --short` showed exactly the six expected frontend additions relative to the follow-up baseline, with no baseline paths removed or status-changed. The four product files, two test files, and this existing plan are the follow-up scope. All ten named temporary browser files were confirmed absent. Existing local frontend development server remains available; this correction required no backend restart or deployment.

# Client execution path implementation plan

Date: 2026-11-27
Status: Implemented locally in approved Mode A; focused verification passed, with baseline suite failures and runtime limits recorded below

## Authority and scope

Source of truth: [Client execution path specification](../specs/2026-11-27-client-execution-path-design.md), approved by the user on 2026-11-27.

Deliver the one-time Client choice after completed key collection on web and native, with a backend-enforced permanent lock and read-only staff visibility:

- Option 1: 2D layout → 3D layout → Selections → Renders → Production.
- Option 2: 3D layout → Renders → Selections → Production.

The user explicitly selected **save and display the permanent choice**. Phase progression, existing approvals, financial state, Production activation, task generation, and deadlines are outside this change.

The specification and task plan have been approved, and the user selected Mode A. Local implementation and verification are authorized within this plan.

## Baseline and implementation constraints

- Planning baseline: `git status --short` contains only the untracked specification for this feature. There are no existing dirty product targets. Refresh the full status and per-target diffs immediately before implementation; preserve any work added meanwhile.
- The approved specification's AC1–AC10 are the acceptance criteria for every task below.
- Use stable option/phase IDs, one versioned definition, and the existing workflow transaction, actor checks, audit, and idempotency patterns.
- Backend authorization is authoritative. Administrative operation-level access never grants permission to make this personal Client decision.
- No default option, choice revocation, staff override, alternate selection endpoint, or phase-completion action is introduced.
- No dependencies or lockfile changes are expected. No staging, commit, push, deployment, seed, backfill, write migration, production mutation, or external communication is included.
- Keep one parent implementation task active. In parallel mode its bounded child slices can run together after their shared contract is settled.

### Additional evidence reconciled during planning

The existing `saveDesignWorkflowState` implementations synchronize a quotation design task for workflow-version-3 projects. The common action-service tail can also mark existing-furniture collection completed. These hooks must not run as a consequence of selecting the execution path. The implementation must provide a narrow internal save context or equivalent bounded path that suppresses these unrelated effects for this action while preserving the default behavior of every existing caller. This is required by specification AC8, not a change to approved scope.

Do not unnecessarily hydrate or lock unrelated quotation sources before validating or replaying this action. Eligibility comes from active project ownership, the saved key-collection stage and its completion evidence, the immutable choice record, and workflow version. A later unrelated source issue must not turn an already-saved choice into an editable state.

## Dependency and ownership map

| Task | Deliverable | Depends on | Owner in Mode A | Write boundary |
| --- | --- | --- | --- | --- |
| T0 | Confirm current baselines and contract integration points | Execution mode selected | Primary | Plan progress only; investigation is read-only |
| T1 | Shared choice definitions, DTOs, and action payload types | T0 | Primary | New backend contract and shared export, shared contract test |
| T2 | Backend selection, preservation, projection, and regression coverage | T1 | Backend implementer | Backend paths listed below, excluding T1-owned contract |
| T3 | Web choice/confirmation/read-only UI and tests | T1 | Frontend implementer | Frontend paths listed below |
| T4 | Native choice/confirmation/read-only UI and tests | T1 | Separate frontend implementer for native | Mobile paths listed below |
| T5 | Integrated reconciliation and integrity review | T2, T3, T4 complete | Primary, then integrity reviewer | Review is read-only; fixes routed to the relevant owner |
| T6 | Final verification and handoff | T5 findings resolved | Verification runner, then primary | No product edits during verification; plan result log only |

In Mode A, T2/T3/T4 can run in parallel after T1 freezes the contract, using the three available child slots. In Mode B, the primary performs all tasks inline in the same dependency order, including review and verification; no implementation subagents are used.

Every child assignment must state that the worker is not alone in the codebase, must preserve others' changes, must remain inside its boundary, and must report contract issues to the primary. Shared contract edits are always coordinated through the primary. No agent may invent its own response or retry semantics.

## T0: Reconfirm baselines and safety boundaries

Acceptance criteria supported: AC2, AC3, AC7, AC8, AC10.

1. Capture `git status --short` and relevant target diffs. Understand any newly dirty targets before assigning ownership.
2. Reconfirm Client ownership, active-identity checks, workflow state mapping, current generic save hooks, and transaction/audit behavior in both repository implementations.
3. Verify current web dialog/radio patterns and native confirmation/navigation handling. Reuse established components rather than introducing a library or visual redesign.
4. Confirm local test tooling and disposable Mongo replica-set support. Runtime QA must use synthetic data and local services; do not use seed scripts or a production database.

Exit: baselines are recorded, affected paths are understood, and no unresolved material change to the approved specification is required.

## T1: Establish the shared contract

Acceptance criteria: AC1, AC5, AC9, AC10.

Primary owns:

- New `backend/src/contracts/project-execution-choice.ts`.
- New `shared/projects/executionChoice.ts`, following the existing re-export convention.
- New `backend/tests/project-execution-choice-contract.test.ts`.

Deliverables:

1. Define stable `option_1`/`option_2`, definition version 1, ordered phase IDs, exact labels, the strict selection payload shape, and the public projection types. Keep the contract dependency-free and compatible with backend build boundaries and native bundling.
2. Define the saved selection metadata and immutable sequence snapshot shape. Keep public safe projection fields separate from stored event/actor lineage as necessary.
3. Freeze the projection states `waiting_for_keys`, `available`, `locked`, and `unavailable`; workflow version; `canSelect`; safe blocking reason; option definitions; and nullable saved selection.
4. Fix the mutation behavior for all consumers: existing action route, `execution_path_select`, key-collection stage ID, expected version, immutable confirmation, idempotency key, `{ version }` result, and canonical read refresh.
5. Define malformed/unsupported projection behavior: show unavailable and never enable selection. Define locked state precedence over unrelated source errors.
6. Share the contract and error semantics with all implementation slices before they start.

Verification: verify both exact phase arrays, unequal option lengths/order, and definition version in a focused contract test. The later package typechecks/builds verify cross-workspace imports.

## T2: Implement backend persistence, authority, and projections

Acceptance criteria: AC1, AC2, AC3, AC5, AC6, AC7, AC8, AC9, AC10.

Backend owner boundaries:

- `backend/src/domain/design-workflow-state.ts` and a focused new `backend/src/domain/project-execution-choice.ts` if needed for reusable validation/projection/preservation rules.
- `backend/src/models/DesignWorkflowState.ts`.
- `backend/src/repositories/types.ts`, `memory.ts`, and `mongo.ts`.
- `backend/src/services/design-workflow-state.service.ts` and `project.service.ts`.
- `backend/src/routes/design-workflow-state.ts`, only if admission/error handling needs adjustment.
- `backend/src/openapi.ts` and directly affected backend contract/route tests. No permission expansion in `route-operations.ts` or authorization policy.
- New `backend/tests/project-execution-choice.test.ts`, `project-execution-choice-routes.test.ts`, and `project-execution-choice.replica-set.test.ts`; a new dedicated fixture under `backend/tests/fixtures/` if required.
- Existing workflow regression tests only where the additive contract requires expectations or focused preservation cases.

Implementation requirements:

1. Add the typed optional choice to domain and strict Mongo schema, including serializer/read mapping. Do not default or backfill it.
2. Centralize current eligibility and saved-record validity. Require active linked Client identity, a matching saved key-collection stage, all key completion fields, and a supported definition. Deny representatives explicitly before replay or mutation disclosure.
3. Add strict `execution_path_select` validation and a dedicated service branch. Reject forged actor/timestamp/order fields, unsupported values, missing acknowledgment, and uploads. Keep it out of generic stage-action lists so it can only be offered through the dedicated confirmation UI.
4. Inside the existing transaction, coordinate authorization, check same-command replay, check version and existing selection, recheck keys, and build server-owned selection metadata and snapshot.
5. Save the immutable choice and one history event, increment the workflow version once, and append the required audit in the same transaction. No partial state on failed audit/save or invalid input.
6. Prevent a fresh write after any saved choice, even if it repeats the same option. Permit only an exact authorized idempotent replay, including after intervening legitimate workflow writes, without an additional event or version increment.
7. In both repositories, reject attempts to remove, null, or change an existing choice and reject loss or corruption of its matching history evidence. Enforce this for unrelated workflow writes as well as the new action. Preserve compare-and-swap behavior and do not depend solely on Mongoose's `immutable` setting.
8. Isolate selection from generic furniture-completion and design-task synchronization hooks using a server-internal save context or equivalent minimal branch. Preserve existing caller behavior. Test the case in which those hooks would otherwise create or alter work.
9. Expose the typed choice through the authorized project workflow GET without writes. Support saved choices despite unrelated later source issues, eligible existing projects, and unavailable legacy projects without configured stage evidence.
10. Extend OpenAPI schemas/descriptions while keeping the operation registry and permission assignment unchanged. Update safe history labeling and contract expectations.

Verification cases:

- Neither key confirmation, each single confirmation, both without completed stage, valid completed stage, malformed dates/evidence, wrong/foreign stage ID, and missing legacy configuration.
- Two distinct Clients and projects; inactive Client; Designer; Admin; Super Admin; representative; unauthenticated and inaccessible-project routes. No unauthorized state/audit writes or cross-project disclosure.
- Both choices, actor/time/snapshot correctness, read-only GET, restart/re-read, new-key repeat, alternate option, same-command retry, reused-key mismatch, and stale version.
- Concurrent conflicting saves through a disposable Mongo replica set: one choice/event/audit wins, the other fails safely. Test same-command races and transaction rollback on audit failure.
- Existing-record preservation through legitimate later actions and direct repository deletion/replacement attempts; memory/Mongo parity.
- Before/after assertions on stages, quotation state, design tasks, finance, procurement, deadlines, and key-collection records to prove selection has no unrelated business effects.

## T3: Implement the web choice flow

Acceptance criteria: AC1, AC2, AC4, AC5, AC9, AC10.

Web owner boundaries:

- New `frontend/src/features/workflow/ProjectExecutionChoice.tsx`, its focused CSS, and `ProjectExecutionChoice.test.tsx`.
- `frontend/src/features/workflow/ProjectWorkflowPanel.tsx` and its test.
- `frontend/src/features/workflow/projectWorkflowApi.ts`.
- `frontend/src/features/workflow/WorkflowStageActions.tsx` for the new history label and any exhaustive action typing only.
- Existing query/refresh hooks and focused tests only if required for consistent invalidation or safe stale-state handling. Do not redesign shared UI primitives.

Implementation requirements:

1. Consume the shared contract and backend capability. Render the waiting, unavailable, authorized staff, and permanently saved states in the shared project workflow.
2. Add two unselected-by-default radio rows and exact sequences. Use an existing accessible dialog for **Save execution choice**, the immutable warning, **Save permanently**, and **Go back**.
3. Keep drafts local; only final confirmation sends a mutation. Add a synchronous duplicate-submit guard and retain the exact command for uncertain-result retries. Do not automatically retry a different or refreshed decision.
4. Refetch conflicts and display a saved winner. If still unselected, require renewed confirmation against the refreshed version. If a save response succeeds but refresh fails, keep the section locked pending reconciliation.
5. Reuse identity-scoped workflow queries and established invalidation. Clear draft/dialog state on project/session changes and prevent revoked or mismatched data from reappearing.
6. Render the saved sequence as **Planned sequence** and **Saved permanently** with the timestamp. Do not add progress markers or phase actions.
7. Ensure the dedicated section does not duplicate a generic key-collection action button.

Verification: rendered radio/confirmation/cancel/save tests; staff/no-permission variants; duplicate clicks; both options; stale-version race; timeout retry; post-save refresh failure; missing/invalid projection; identity/project switch; focus placement/return and accessible names. Inspect at 1440px, 768px, and 390px widths, including keyboard-only use and increased text size.

## T4: Implement the native choice flow

Acceptance criteria: AC1, AC2, AC4, AC5, AC9, AC10.

Native owner boundaries:

- New `mobile/src/features/workflows/ProjectExecutionChoice.tsx` and `ProjectExecutionChoice.test.tsx`.
- `mobile/src/features/workflows/WorkflowWorkspace.tsx` and a focused workspace integration test if needed.
- `mobile/src/features/workflows/workflowTypes.ts`; `workflowModel.ts` and `NativeWorkflowActionForm.tsx` only for type/history compatibility and preventing duplicate generic actions.
- `mobile/src/core/query/invalidationRegistry.ts` only if existing `design-workflow-changed` coverage is insufficient.
- Related focused native contract tests if the new fields require them.

Implementation requirements:

1. Use the same contract, labels, backend capabilities, and final confirmation semantics as web, with accessible native radio and confirmation controls.
2. Integrate into the existing workflow without changing unrelated stage forms. Keep waiting/staff/saved states read-only and tolerate an older server safely.
3. Use identity/environment/project-scoped cache keys and existing invalidation events. Reset drafts across project/session changes; do not show revoked private data.
4. Retain exact request identity during uncertain network results, prevent conflicting resubmission, and maintain a locked state after success even if refresh fails.
5. Follow existing navigation safeguards during a pending/uncertain action. Cancelling before submission must remain possible; successful canonical refresh releases the guard.
6. Ensure long sequence labels and confirmation copy fit narrow devices and increased font sizes. Expose selected/disabled/busy and error states to accessibility services.

Verification: native rendered interaction tests for the same critical save/cancel/locked/conflict/retry/identity cases as web; workflow integration test; native contract tests, TypeScript, and Android export. Use an available emulator/device for runtime layout and back-navigation checks; explicitly report if native runtime tooling is unavailable.

## T5: Integrate and review correctness

Acceptance criteria: AC1–AC10.

1. Wait for all writers. Inspect their actual diffs, reconcile contract differences, and ensure no writer crossed an ownership boundary or reverted another change.
2. Confirm that choice rendering and action authority agree across the server, web, and native clients. Check exact sequences and that public projections do not expose private evidence.
3. Review every workflow state writer for record/history preservation; check transactional races, replay ordering, authorization precedence, unknown commit outcomes, stale caches, and absence of unrelated stage/task/financial effects.
4. In Mode A, run an `integrity_reviewer` after writers finish. In Mode B, perform the same review inline. The reviewer must not modify product sources.
5. Route concrete findings to the relevant owner, run focused regression checks for fixes, and inspect the integrated diff again. A material scope/contract departure requires revising the affected approved artifact once before implementation proceeds beyond it.

Exit: no unresolved confirmed correctness or security findings; all planned acceptance criteria have implementation and verification coverage.

## T6: Final verification and evidence

The final verification runs only after integration and review fixes. In Mode A use `verification_runner`; in Mode B the primary performs these checks inline. Focused test file names below are planned additions, not claims that those files or tests already exist.

### Focused checks

From `backend/`:

```sh
npm test -- tests/project-execution-choice-contract.test.ts tests/project-execution-choice.test.ts tests/project-execution-choice-routes.test.ts tests/project-execution-choice.replica-set.test.ts --maxWorkers=2
npm test -- tests/key-collection-appointment.test.ts tests/key-collection-appointment-mongo.replica-set.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts tests/workflow-space-planning.test.ts tests/client-furniture-workflow.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts
```

From `frontend/`:

```sh
npm test -- src/features/workflow/ProjectExecutionChoice.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/WorkflowStageActions.test.tsx
```

From `mobile/`:

```sh
npm test -- --runInBand src/features/workflows/ProjectExecutionChoice.test.tsx src/features/workflows/NativeWorkflowActionForm.test.tsx src/features/workflows/workflowModel.test.ts
npm run test:contracts
```

Include any added workspace integration test in the focused command and record the final exact commands. Use the existing Mongo-memory replica-set helper; never substitute a non-transactional database or production connection to obtain a passing result.

### Integrated package checks

The shared workflow state and action contracts justify complete backend and frontend lanes after focused checks pass:

```sh
cd backend && npm run typecheck && npm test && npm run build
```

```sh
cd frontend && npm run typecheck && npm test && npm run build
```

```sh
cd mobile && npm run typecheck && npm run export:android
```

Run from the repository root where shown. Mobile focused/contract tests above cover the affected native surface; broaden native tests only for additional shared-module changes or unresolved regressions. There is no repository lint script, so no lint success may be claimed.

### Runtime and acceptance matrix

| Criteria | Final evidence |
| --- | --- |
| AC1 | Contract assertions plus both option sequences in rendered web/native UI. |
| AC2 | Server prerequisite matrix and rendered waiting-to-available transition after canonical refresh. |
| AC3 | HTTP/service identity matrix and read-only staff UI using distinct Clients/projects. |
| AC4 | Radio/confirmation/cancel tests, one submitted command, focus/accessibility and duplicate-click checks. |
| AC5 | Re-read/revisit, reload, another authorized session, no edit controls, direct mutation rejection. |
| AC6 | Replica-set conflicting-save/same-command races, idempotent replay, and audit-failure rollback. |
| AC7 | Memory/Mongo preservation plus unrelated workflow action regressions. |
| AC8 | No-write reads, legacy compatibility, and before/after invariants for stages/tasks/finance/deadlines. |
| AC9 | Initial read failure, failed refresh after save, timeouts, conflicts, identity change, permission loss, old API response. |
| AC10 | Contract/operation consistency, package checks, desktop/tablet/phone QA, native export, and repository hygiene. |

For web runtime QA, inspect the new section in synthetic Client and staff project views at the listed widths. Verify real interactions, keyboard/focus behavior, network failure presentation, and absence of browser console errors attributable to this change. For native, verify rendered accessible states and bundle export, adding emulator/device checks when available. Report native runtime limitations separately from successful Jest/export evidence.

Finish with `git diff --check` and `git status --short`. Review new/untracked files as well as tracked diffs. Build/test outputs and screenshots are temporary ignored artifacts; record their actual paths and remove only artifacts created by this task when no longer needed, preserving anything pre-existing. Expected build locations include `backend/dist/`, `frontend/dist/`, and `mobile/dist/android/`; these are not deliverables.

## Completion and handoff

The task is complete only when the approved save/display flow works on the included surfaces, immutability and authorization hold at the backend and persistence boundaries, applicable checks pass, and material limitations are reported accurately.

The final handoff must include the outcome, principal decisions, affected files, exact checks/results, unrun checks or environment blockers, artifact paths, and remaining risks. Explicitly state that no deployment, migration, production mutation, commit, or external communication was performed. Do not call partially verified work complete.

Current progress: T0–T5 finished, including all integrity-review corrections. T6 verification and baseline comparison concluded. No unresolved feature regression was found; the complete repository suites are not green. Initial dirty paths contained only this plan and its specification; product targets were clean.

### Delivered behavior and affected areas

- `backend/src/contracts/project-execution-choice.ts` and `shared/projects/executionChoice.ts` define the two exact versioned sequences, persisted record, public projection, command, and fail-closed consumer validation.
- The backend domain, model, workflow service, project projection, route validation, OpenAPI, and both repositories enforce linked-Client ownership, completed keys, atomic immutable record/history/audit, expected versions, idempotent retries, and preservation during later writes. The narrow internal save purpose avoids unrelated quotation-task synchronization and furniture completion.
- Web `ProjectExecutionChoice.tsx` and its stylesheet integrate with `ProjectWorkflowPanel`, the typed API, history labels, and scoped workflow queries. Native `ProjectExecutionChoice.tsx` integrates with `WorkflowWorkspace`, workflow types, and the Metro shared-contract watch path.
- Added backend contract/service/HTTP/replica-set tests and rendered web/native interaction tests. Existing projection, workflow-panel, and Key Collection header tests were updated only where the additive behavior required it.
- Integrity-review corrections clear denied workflow data and the cached review sibling, protect identity/project boundaries, and prevent cancelled reads from overwriting newer authorized data. The independent final integrity recheck found no unresolved confirmed finding.
- No dependencies, lockfiles, permission assignments, phase progression, finance rules, deadlines, or approval behavior were changed.

### Final command results

Commands run from the workspace named in the first column. Backend/frontend full tests were bounded to four workers; isolation/baseline checks used one worker without raising test timeouts.

| Workspace | Command or lane | Result |
| --- | --- | --- |
| Backend | New-feature command below | **57/57 passed**, 4 files, including Mongo replica-set transaction/race coverage. |
| Backend | Extended workflow/authorization command below, run before final review | **546/546 passed**, 13 files. This overlaps the 42 new service/HTTP/replica-set tests; counts must not be added as unique coverage. |
| Backend | `npm run typecheck` | Passed. |
| Backend | `npm run build` | Passed. |
| Backend | `npm test -- --maxWorkers=4` | Exit 1: **90 failed, 8,366 passed, 31 skipped**; 22 failed, 388 passed, 3 skipped files. All failures reconciled below. |
| Frontend | Final five-file command below | **99/99 passed**, including the header-selector correction. |
| Frontend | `npm run typecheck` | Passed. |
| Frontend | `npm run build` | Passed; existing large-chunk warning remains. |
| Frontend | `npm test -- --maxWorkers=4` | Exit 1: **143 failed, 7,775 passed**; 21 failed, 458 passed files. This run preceded the test-selector correction; all failures reconciled below. |
| Mobile | Three-suite command below | **34/34 passed**, 3 suites. |
| Mobile | `npm run typecheck` | Passed. |
| Mobile | `npm run export:android` | Passed after final native source changes: 3,062 modules, approximately 13 MB Hermes bundle. |
| Mobile | `npm run test:contracts` | Exit 1: **2 failed, 2 passed**. Both failures reproduce on original HEAD. |
| Repository | `git diff --check` and `git status --short` | Passed hygiene; only feature source/tests and the approved documents are changed. No generated artifacts are included. |

Backend new-feature command:

```sh
npm test -- tests/project-execution-choice-contract.test.ts tests/project-execution-choice.test.ts tests/project-execution-choice-routes.test.ts tests/project-execution-choice.replica-set.test.ts
```

Backend extended workflow/authorization command:

```sh
npm test -- tests/project-execution-choice.test.ts tests/project-execution-choice-routes.test.ts tests/project-execution-choice.replica-set.test.ts tests/key-collection-appointment.test.ts tests/key-collection-appointment-mongo.replica-set.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts tests/workflow-space-planning.test.ts tests/client-furniture-workflow.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts
```

Final frontend command:

```sh
npm test -- --maxWorkers=1 src/features/workflow/ProjectExecutionChoice.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/ProjectClientActions.test.tsx src/features/workflow/KeyCollectionHeader.test.tsx
```

Final mobile command:

```sh
npm test -- --runInBand src/features/workflows/ProjectExecutionChoice.test.tsx src/features/workflows/NativeWorkflowActionForm.test.tsx src/features/workflows/workflowModel.test.ts
```

### Full-suite failure reconciliation

Original HEAD sources were extracted with `git archive` to `/private/tmp/lisno-choice-baseline-dwj9n8p8`, using the same installed package dependencies. The working tree was never reset or replaced. Baseline results below come from executing those original sources, rather than inferring failure provenance from unchanged filenames.

**Backend:** 61 of the 90 full-run failures reproduce at HEAD with identical test names and first error/assertion messages. The other 29 pass on the integrated code in serial reruns. There is no unresolved backend feature regression from these runs.

- `npm test -- tests/workflow-measurement-media.test.ts tests/mongo-repository.test.ts --maxWorkers=1`: 106 passed, 3 failed. Media is 32/32 passing; its 21 full-run failures followed a timeout/upload-busy cascade. Mongo retains three failures.
- Original HEAD `npm test -- tests/mongo-repository.test.ts --maxWorkers=1`: 74 passed, the same 3 failed (legacy user-update CAS expectation, responsibility-count expectation, and scoped-summary timeout).
- The filtered HEAD comparison across 20 additional files below produced 58 identical failures, 19 passes, and 736 filter-skipped tests. No HEAD-only failure appeared.
- The final integrated serial command below produced **19 passed**, 96 filter-skipped tests across 5 files. It covers all 8 remaining full-run failures plus access-request setup recovery. Combined with media, all 29 failures that did not reproduce at HEAD pass in isolation.
- Of the original 31 skipped tests, 24 belong to three opt-in Python-bridge suites requiring `LISNO_ASSISTANT_TEST_PYTHON`. The other 7 were access-request tests skipped after setup timeout; those 7 subsequently passed in the final serial lane.

**Frontend:** 141 of 143 failures reproduce at HEAD with identical test names and first error/assertion messages. The HEAD comparison below yielded 141 failed and 632 passed across 20 files. The remaining focus-removal timing failure passes at both HEAD and current code (`npm test -- --maxWorkers=1 src/components/ui/focus.test.ts`: 9/9 current tests passed). The only feature-related failure was an older header test using an unqualified status-role selector; the new execution-choice status made that selector ambiguous. The test now names its route output explicitly and preserves the navigation assertion. The final five-file lane passes all 99 tests. No unresolved frontend feature regression remains from these runs.

**Native contracts:** `npm run test:contracts` produced the same 2 failures and 2 passes at original HEAD. The unchanged mobile manifest lacks `workflow_timelines.read`, `workflow_timelines.update`, `design.key_collection_reminders.read`, `design.assignment_requests.read`, and `design.assignment_requests.decide`. Its operation-count assertion expects 480 while the canonical registry contains 523. Fixing that existing manifest drift is outside this feature.

These comparisons establish the provenance of the observed failures; they do not turn the original full-suite runs into passing runs. The complete suites were not rerun after the isolated header-test correction.

<details>
<summary>Exact frontend HEAD comparison command</summary>

```sh
Working directory: /private/tmp/lisno-choice-baseline-dwj9n8p8/frontend

npm test -- --maxWorkers=1 src/test/fixtures/enterpriseTransport.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/app/router.test.tsx src/features/client/ClientEstimateDimensions.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcScope.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketCard.test.tsx src/features/leads/configuredEstimate.componentPricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/estimates/AskLisnoLauncher.test.tsx src/test/accessibility.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/auth/LoginPage.test.tsx src/features/admin/ProjectPeopleAssignments.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/components/ui/focus.test.ts src/features/admin/dashboard/dashboardInvalidation.test.ts

Exit: 1
Files: 19 failed, 1 passed (20)
Tests: 141 failed, 632 passed (773)
Duration: 168.00s
```

</details>

<details>
<summary>Exact backend HEAD filtered comparison command</summary>

```sh
npm test -- --maxWorkers=1 tests/ai-estimator-knowledge-basket-quality.replica-set.test.ts tests/ai-estimator-knowledge-bootstrap.test.ts tests/ai-estimator-knowledge-domain.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts tests/assigned-project-visibility.replica-set.test.ts tests/collaborative-finance-issue.replica-set.test.ts tests/config.test.ts tests/estimate-collaboration.replica-set.test.ts tests/estimate-component-pricing-contract.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/leads.test.ts tests/project-manager-vendors-quality.replica-set.test.ts tests/project-number-mongo.replica-set.test.ts tests/repository.test.ts tests/super-admin-dashboard-mongo.replica-set.test.ts tests/access-request-mongo.replica-set.test.ts -t '(?:treats\ an\ empty\ shared\ checklist\ as\ currently\ unconfigured\ while\ preserving\ configured\ item\ history|has\ one\ valid\ payload\ for\ every\ section\ and\ a\ stable\ canonical\ digest|conforms\ every\ direct\-insert\ resource\ to\ its\ strict\ persistence\ schema|exposes\ the\ closed\ formula\ and\ eight\-section\ vocabulary|leaves\ hidden\ backend\ sections\ outside\ the\ registered\-tab\ percentage|rejects\ a\ new\ Budget\ price\ after\ induction\ approval\ is\ reopened|strips\ references\ to\ the\ deleted\ Basket\ out\ of\ the\ configurations\ that\ survive|reports\ what\ a\ deletion\ carries\ away\ and\ refuses\ none\ of\ it|permits\ Procurement\ vendor\ management\ and\ inline\ classifications\ without\ opening\ Configuration|documents\ scoped\ Mode\ tiers\ without\ accepting\ whole\ namespace\ maps|lists\ and\ opens\ designer\ assignments\ independently\ of\ estimate\ state\ without\ writes|lists\ and\ opens\ procurement\ assignments\ independently\ of\ estimate\ state\ without\ writes|lists\ and\ opens\ site_manager\ assignments\ independently\ of\ estimate\ state\ without\ writes|denies\ task\-only\ Project\ Manager\ ownership\ consistently\ in\ lists\ and\ details|retries\ issuance\ eligibility\ against\ an\ unlock\ that\ wins\ after\ the\ approved\ snapshot\ was\ read|binds\ v3\ quotation\ and\ later\ drawings\ separately,\ preserving\ two\ unequal\ project\ baselines\ on\ repricing|does\ not\ treat\ a\ v3\ quotation\ approval\ as\ drawing\ approval\ or\ unrestricted\ legacy\ issuance|rejects\ a\ foreign\ receipt\ and\ stale\ design\ or\ requirements\ without\ treating\ them\ as\ paid|keeps\ project\ AI\ disabled\ by\ default\ with\ bounded\ server\-only\ model\ settings|loads\ explicit\ Gemini\ settings\ and\ the\ shared\ token\ limit|ignores\ legacy\ OpenAI\ settings\ with\ Gemini\ key\ undefined|ignores\ legacy\ OpenAI\ settings\ with\ Gemini\ key\ synthetic\-gemini\-key|preserves\ the\ original\ finance\ baseline\ and\ selects\ the\ final\ source\ atomically\ without\ opening\ spending|renders\ the\ frozen\ exact\ total\ and\ a\ component\ label\ in\ the\ customer\ PDF|publishes\ and\ approves\ a\ ready_for_client\ estimate\ after\ initiation\ without\ location\ or\ budgets|marks\ unsaved\ manual\ edits\ incomplete\ while\ retaining\ authoritative\ alternative\ prices|rejects\ outsiders,\ hidden\ rows,\ stale\ sources,\ foreign\ row\ IDs\ and\ stale\ estimates|copies,\ backfills,\ and\ protects\ a\ linked\ Lead\ project\ on\ draft\ save|row\ 74\ saves\ one\ exact\ calculated\ draft\ estimate|rolls\ back\ every\ hold\ and\ notice\ when\ any\ selected\ assignment\ is\ stale|allocates\ sequential\ numbers\ to\ asymmetric\ linked\ projects\ and\ projects\ the\ same\ values|serializes\ simultaneous\ first\ saves\ against\ an\ empty\ counter\ for\ different\ leads|deduplicates\ simultaneous\ saves\ and\ retries\ of\ the\ same\ lead|rolls\ back\ counter,\ assignment\ and\ estimate\ when\ audit\ persistence\ fails,\ then\ safely\ retries|rolls\ back\ assignment\ after\ an\ injected\ transient\ transaction\ error\ and\ commits\ one\ audit\ on\ retry|retries\ a\ bounded\ counter\-initialization\ duplicate\ without\ treating\ it\ as\ an\ estimate\ version\ conflict|stops\ after\ three\ initialization\ conflicts\ without\ partial\ writes|keeps\ numbers\ through\ rename,\ resave,\ submission\ and\ normal\ model\ updates|does\ not\ number\ an\ existing\ historical\ estimate\ during\ editing\ or\ reading|keeps\ historical\ unnumbered\ estimates\ readable\ when\ their\ Lead\ has\ no\ project\ link|continues\ safely\ from\ 999999|continues\ safely\ from\ 1000000|continues\ safely\ from\ 9007199254740990|rejects\ absent/stale\ counter\ null\ even\ when\ its\ next\ value\ is\ a\ gap|rejects\ absent/stale\ counter\ 2\ even\ when\ its\ next\ value\ is\ a\ gap|fails\ explicitly\ for\ malformed\ stored\ number\ 🌏🌏000001|fails\ explicitly\ for\ malformed\ stored\ number\ Lisno000000|fails\ explicitly\ for\ malformed\ stored\ number\ Lisno0000001|fails\ explicitly\ for\ malformed\ stored\ number\ Lisno9007199254740992|fails\ at\ exhaustion\ without\ assigning\ an\ unsafe\ number|reuses\ an\ already\ issued\ number\ when\ an\ estimate\ is\ recreated\ and\ retains\ highwater\ after\ deletion|enforces\ number\ uniqueness\ while\ allowing\ many\ historical\ nulls|rejects\ a\ missing\ Lead\ number\ when\ an\ earlier\ assignment\ audit\ survives|rejects\ a\ null\ Lead\ number\ when\ an\ earlier\ assignment\ audit\ survives|rejects\ a\ conflicting\ Lead\ number\ when\ an\ earlier\ assignment\ audit\ survives|rejects\ contradictory\ canonical\ Lead\ identity\ in\ an\ assignment\ audit|retains\ a\ valid\ preexisting\ Lead\ number\ without\ creating\ a\ retroactive\ assignment\ audit|fails\ closed\ for\ counter\ null\ after\ numbered\ Leads\ were\ deleted|fails\ closed\ for\ counter\ 0\ after\ numbered\ Leads\ were\ deleted|rejects\ a\ changed\ Lead\ owner\ before\ saving\ an\ existing\ estimate\ or\ revealing\ its\ number|rejects\ invalid\ persisted\ counter\ \-1|rejects\ invalid\ persisted\ counter\ 1\.5|rejects\ invalid\ persisted\ counter\ 9007199254740992|rejects\ invalid\ persisted\ counter\ null|pages\ scoped\ Admin\ project\ summaries\ newest\-first\ and\ exposes\ only\ active\ estimator\ options|retains\ unequal\ v3\ approved\ baselines\ and\ issued\ task\ scope\ after\ quotation\ unlock)$|access-request Mongo replica-set transactions'
```

</details>

<details>
<summary>Exact final integrated backend serial command</summary>

```sh
npm test -- --maxWorkers=1 tests/assigned-project-visibility.replica-set.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/project-manager-vendors-quality.replica-set.test.ts tests/access-request-mongo.replica-set.test.ts -t '(?:denies\ task\-only\ Project\ Manager\ ownership\ consistently\ in\ lists\ and\ details|lists\ and\ opens\ designer\ assignments\ independently\ of\ estimate\ state\ without\ writes|lists\ and\ opens\ procurement\ assignments\ independently\ of\ estimate\ state\ without\ writes|lists\ and\ opens\ site_manager\ assignments\ independently\ of\ estimate\ state\ without\ writes|publishes\ and\ approves\ a\ ready_for_client\ estimate\ after\ initiation\ without\ location\ or\ budgets|marks\ unsaved\ manual\ edits\ incomplete\ while\ retaining\ authoritative\ alternative\ prices|rejects\ outsiders,\ hidden\ rows,\ stale\ sources,\ foreign\ row\ IDs\ and\ stale\ estimates|rolls\ back\ every\ hold\ and\ notice\ when\ any\ selected\ assignment\ is\ stale)$|access-request Mongo replica-set transactions'
```

</details>

### Runtime evidence, limitations, and cleanup

- Real Chromium through Playwright CLI rendered the actual `ProjectWorkflowPanel` with synthetic network responses. Checks passed at 1440, 768, and 390 pixels: no overflow, no default choice, cancel with zero writes, confirmation focus and focus return, keyboard selection, both exact saved sequences, one request on confirmation, locked reload, staff pending/locked without editing, pre-key waiting, and 200% text without horizontal overflow. Screenshots were visually inspected. Final browser console: zero errors and zero warnings. This is frontend runtime evidence, not a live-backend end-to-end test.
- Native device runtime QA could not run: `adb devices` showed no attached device or emulator. Native evidence consists of rendered Jest interaction/accessibility checks, typecheck, and successful Android export. No full native Jest suite, iOS export, or OCR suite was required or run. There is no repository lint script; no lint result is claimed.
- Browser harness/screenshots were under `frontend/output/playwright/execution-choice/`, with temporary config/session files under `/private/tmp/lisno-execution-choice-*`. They were removed and the task-owned browser/Vite preview were closed.
- Verification logs/command files were under `/private/tmp/lisno-choice-verification-*`; the original-source comparison tree was `/private/tmp/lisno-choice-baseline-dwj9n8p8`. Results and exact comparison commands are preserved above; these temporary files were removed after recording them.
- Build outputs remain ignored under `backend/dist/`, `frontend/dist/`, and `mobile/dist/android/`. They are not deliverables. The tracked `mobile/.expo/dev/logs/export.log` was restored to its exact clean initial content and verified unchanged.
- No staging, commit, push, deployment, seed, backfill, write migration, production mutation, or external communication was performed. No migration is needed for the optional additive record; existing projects retain no selection until their Client explicitly saves one.

The remaining verification limits are the existing repository-suite defects, optional Python suites, live-backend browser end-to-end behavior, and native device runtime. The feature is implemented locally with the focused, transaction, interaction, build, baseline-comparison, and review evidence described above.

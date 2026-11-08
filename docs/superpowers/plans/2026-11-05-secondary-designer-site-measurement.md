# Secondary Designer onsite measurement task plan

Date: 2026-11-05
Status: Implemented in Mode A. Targeted automated and rendered verification passed on 2026-11-06. Full workspace suites are not green; limitations and exact results are recorded below.

Source of truth: [Approved specification](../specs/2026-11-05-secondary-designer-site-measurement-design.md). Acceptance criteria AC1–AC9 below refer to that document. This plan does not change the approved shared-task interpretation.

## Outcome and fixed boundaries

For estimation workflow version 3, current active Secondary Designers own one shared onsite measurement task. Any one can complete it with the existing evidence and prerequisites. Selecting the team is the only assignment step. The Primary Designer manages the team and resolves missing secondary assignments, without gaining measurement-completion authority.

Derive ownership from saved stable secondary IDs and current user eligibility on the backend. Preserve legacy workflow assignment, completed history, quotation/Design approval authority, clock rules, media handling, Client restrictions and unrelated work. No new assignment collection, persisted owner copy, dependency, migration, seed, deployment or external communication is planned.

## Current implementation anchors

- Team assignment: `backend/src/services/design-team.service.ts` and `frontend/src/features/designer/DesignTeamPicker.tsx`.
- Action permissions, transaction and projection: `backend/src/services/design-workflow-state.service.ts`; workflow state in `backend/src/domain/design-workflow-state.ts`.
- Workflow response and stage instructions: `backend/src/services/project.service.ts` and `backend/src/domain/design-workflow-instructions.ts`.
- Pending responsibility: `backend/src/domain/project-status.ts`, its source reader in `backend/src/services/project-status.service.ts`, and the existing participant eligibility path. Current domain projection accepts already-authorized participants.
- Designer project tasks: `backend/src/services/project-workflow.service.ts` already includes secondary-owned projects; no duplicate task generation is needed.
- Frontend consumers: `WorkflowStageActions.tsx`, `projectWorkflowSelectors.ts`, `DesignerDesignPlanTasksPage.tsx`, `ProjectStatusButton.tsx`, and typed responses in `projectWorkflowApi.ts`.
- Team save already invalidates workflow/status and designer queries through `refreshEstimateCollaboration`. Completion form errors currently refresh on HTTP 409; membership loss can require an additional narrowly scoped refresh on the established authorization/not-found response.
- Existing replica-set tests use `tests/helpers/mongo-replica-set.ts`, which starts an isolated `MongoMemoryReplSet`. Tests do not require or authorize access to an existing project database.

## Ownership and parallel boundaries

Only begin the work below after plan approval and the user's A/B execution choice. Keep one parent phase in progress at a time.

| Owner | Write boundary | Must not change |
| --- | --- | --- |
| Primary agent | This plan/spec status during implementation; contract decisions; shared public declarations/documentation if needed; final integration and reconciliation | Unrelated pending work, dependency/lockfiles, production data |
| Backend implementer in Mode A; primary in Mode B | Measurement ownership helper, scoped backend workflow/status/instructions services and matching tests/fixtures listed in P2 | Frontend files, unrelated workflow behavior, schema/migration changes, shared declarations reserved to primary |
| Frontend implementer in Mode A; primary in Mode B | Design team guidance, measurement form refresh/presentation, affected selectors and focused frontend tests listed in P2 | Backend files, shared declarations reserved to primary, Sales/Client fixes, page-wide styling |
| Integrity reviewer in Mode A; primary in Mode B | Read-only integrated review | Product source edits or external writes |
| Verification runner in Mode A; primary in Mode B | Test execution and temporary synthetic browser fixtures/artifacts | Product source edits, live customer data or services |

The primary reserves `backend/src/openapi.ts`, `backend/src/contracts/project-status.ts`, `frontend/src/features/workflow/projectWorkflowApi.ts`, and `frontend/src/api/types.ts` if public contract changes become necessary. Prefer the existing owner/facts/blockers/actions response fields; a new public field is not presumed necessary. Any required declaration is agreed and supplied before a dependent writer uses it.

Both writers must be told that they are not alone in the worktree, must preserve others' edits, and must stop overlapping edits until ownership is reconciled. Root integration writes happen after the relevant writer has finished.

## P1. Capture baseline and settle the internal ownership contract

Owner: primary. Dependencies: approved plan and execution mode. Covers AC1–AC8 prerequisites.

1. Capture `git status --short`, existing target diffs and contents, and hashes of unrelated dirty files in a temporary task directory. Review the existing Client visibility diff in `ProjectWorkflowPanel.tsx` and its test before considering either a target. Do not stage, revert or reformat unrelated files.
2. Verify the current secondary eligibility rule and the active/non-deleted participant source used by Project status. Trace the workflow read/action and task next-step paths so eligibility is consistent across them.
3. Settle a small backend ownership resolver/context: current-team mode is workflow 3; eligible members come from current saved secondary IDs and validated user records. Keep this context transient, separate from persisted stage history. Do not place live team membership into an immutable approval or copy it into a new measurement-assignee field.
4. Confirm how capabilities/action availability receive the current actor's secondary membership and how stage facts receive eligible names. Existing backend-rendered facts, blockers, instructions and actions should carry the UI behavior without client-side authorization inference.
5. Confirm mutation response/error handling, preserved replay ordering, and stage completion history behavior. Record the settled implementation contract in this plan before writers start.
6. Establish focused pre-change test results for the relevant workflow/team/projection and frontend suites. Existing failures are evidence to diagnose, not permission to weaken assertions. Confirm that the isolated Mongo replica-set harness can run.

In Mode A, independent read-only backend ownership/transaction and frontend consumer/cache audits may run in parallel during this phase. The primary reconciles their findings before product edits. In Mode B, perform those audits inline. No agent may independently choose a different ownership model.

## P2. Implement backend and frontend slices

Dependency: P1 contract and baseline complete. This is one parent phase with two bounded slices. In Mode A, B1 and F1 can run concurrently once their response contract is fixed. In Mode B, implement B1 then F1 inline. Tests run during this phase are provisional until integrated verification.

### B1. Canonical ownership, permissions, projection and transaction regressions

Owner: backend implementer/primary. Covers AC1–AC8.

Primary targets:

- `backend/src/services/design-workflow-state.service.ts`
- `backend/src/services/project.service.ts`
- `backend/src/domain/project-status.ts`
- `backend/src/domain/design-workflow-instructions.ts`
- A focused ownership helper under `backend/src/domain/` or `backend/src/services/`, if required to share the rule without duplicating it
- `backend/src/services/project-status.service.ts` and its existing source reader only if eligibility is missing at the projection boundary
- `backend/src/services/design-team.service.ts` and `project-workflow.service.ts` only if the traced integration requires a change; their existing assignment/task behavior is otherwise reused
- Relevant backend tests and fixtures; a dedicated `tests/secondary-designer-measurement.replica-set.test.ts` is permitted if it keeps cross-service race tests isolated

Implementation:

1. Resolve workflow-3 measurement ownership from current eligible secondaries. Reject primary/removed/unrelated/wrong-role/inactive actors and ignore stale singleton ownership when determining current authority.
2. Remove workflow-3 `measurement_assign` from available actions and reject new writes server-side. Keep older workflows and historical replay/history handling intact.
3. Allow each eligible secondary to submit the existing `measurement_complete` action once normal prerequisites allow it. Keep media/proof validation, room-source capture, approval gates, audit identity, CAS and idempotency intact.
4. Read membership inside the existing authorization-coordinated transaction. Do not weaken or replace the transaction fence used by team updates and action writes.
5. Project current secondary owners, the no-eligible-secondary explanation and primary assignment responsibility consistently into workflow facts, instructions and Project status. Do not return a new measurement candidate picker for workflow 3. Preserve role-specific redaction and legacy candidate lists.
6. Make historical completion visibly historical; later team changes do not rewrite the original actor or reopen the stage. Do not mutate saved state during reads.
7. Add focused asymmetric identity/project regressions and transactional races. Update only fixtures that actually represent the changed workflow-3 semantics; retain explicit legacy singleton tests.

Test fixture matrix: project A has Primary A and distinct Secondary A1/A2/A3; project B has Primary B and Secondary B1. Include a removed member, active wrong-role user, inactive/deleted member, Client, representative, manager and Super Admin. Use stable synthetic IDs and differing project membership. Assert zero, one, multiple and all-unavailable teams; historical singleton set to primary/outsider; completed stage with a later team change.

Concurrency evidence must cover both controlled removal/completion orderings, simultaneous submissions by different secondaries, same-request replay, stale workflow version and staged-upload cleanup on failed submissions. Assert stored event/audit/evidence counts, not only returned status codes.

If a repository interface changes, keep memory and Mongo implementations aligned; no such change is expected merely to resolve existing project/user fields. Escalate a material schema, permission or behavior change to primary rather than inventing a fallback.

### F1. Team guidance, action refresh and consistent task presentation

Owner: frontend implementer/primary. Covers AC1–AC4, AC7–AC9.

Primary targets:

- `frontend/src/features/designer/DesignTeamPicker.tsx` and `.test.tsx`
- `frontend/src/features/workflow/WorkflowStageActions.tsx` and `WorkflowStageActions.measurement.test.tsx`
- `frontend/src/features/workflow/projectWorkflowSelectors.ts` and existing tests, only if current next-step selection obscures the backend-provided ownership/blocker
- `frontend/src/features/workflow/useRefreshDesignWorkflow.ts` and `frontend/src/features/leads/estimateCollaborationQueries.ts` only for a demonstrated invalidation gap
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.test.tsx`, `frontend/src/features/workflow/ProjectWorkflowProgress.designer.test.tsx`, and `frontend/src/features/project-status/ProjectStatusButton.test.tsx`
- Matching page/display components only if they cannot render the agreed response through their existing generic fields

Implementation:

1. Add concise Secondary Designer measurement guidance to the existing team section. Preserve saved-versus-draft selection, CAS conflict handling and Super Admin reason entry.
2. Render backend-provided current owner facts and missing-team guidance. Do not add another selector or derive permission from displayed names. Preserve the legacy assignment dialog for legacy actions.
3. Verify that successful team saves refresh workflow, Project status and designer-task data; a failed save must leave committed ownership unchanged. Reuse existing prefix invalidation where it already covers these consumers.
4. Handle stale completion forms after team removal. Refresh current authorization on applicable measurement submission conflicts/denials without granting access, automatically retrying a write or claiming success. Keep safe draft evidence recoverable when the user remains authorized, and handle loss of project access cleanly.
5. Cover primary monitoring, secondary completion, no-secondary guidance, multi-person owner names, permission loss, failed save and legacy assignment in rendered component tests.
6. Preserve current theme, keyboard controls, focus/error announcements and responsive wrapping. Add scoped CSS only for an observed layout defect; no new decorative styling or dependency.

`ProjectWorkflowPanel.tsx` and its test are protected dirty targets. Prefer no edits. If a necessary integration change touches them, primary first supplies the existing diff and explicit ownership, and the writer adds only the approved measurement change while preserving Client visibility behavior.

## P3. Integrate and perform independent integrity review

Owner: primary; `integrity_reviewer` in Mode A. Dependency: B1/F1 finished. Covers all acceptance criteria.

1. Reconcile actual changed files against ownership and the initial dirty-path baseline. Check public types/OpenAPI if needed, canonical operation authorization and legacy compatibility. No new endpoint or role should be introduced.
2. Review eligibility once across mutation, available actions, pending responsibilities and designer next-step projections. Check for stale snapshots, leaks between projects, implicit primary fallbacks, and inactive users presented as eligible owners.
3. Review transaction ordering, idempotency, failed-upload cleanup, immutable actor/evidence lineage, and team edits after completion. Confirm no read path writes or synthetic assignment events.
4. Review frontend cache refresh and 403/404/409 handling, saved-versus-draft ownership, existing Client restrictions and responsive/keyboard behavior.
5. Resolve confirmed findings within the owned slices. Writers finish corrections before final verification. Record reviewer conclusions and any remaining risks; do not treat test results from concurrent edits as final evidence.

## P4. Verify the integrated result and hand off

Owner: primary; `verification_runner` in Mode A. Dependency: P3 findings resolved. Covers AC1–AC9.

Run focused suites first, then backend/frontend typechecks, full workspace test suites and builds because this changes shared authorization and workflow projections. Use the existing isolated replica-set harness. Report setup failures and unrun checks explicitly; never silently skip transactional coverage or substitute nontransactional tests.

Backend focused, from `backend/`:

```sh
npm test -- tests/design-team.replica-set.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts tests/workflow-measurement-media.test.ts
npm test -- tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-user-responsibilities.test.ts tests/project-status-routes.test.ts tests/project-status-mongo.replica-set.test.ts tests/project-workflow.test.ts tests/project-workflow-routes.test.ts tests/project-workflow-mongo.replica-set.test.ts
```

Add the dedicated secondary-measurement replica-set test to the focused command if created. Run any additional existing route/media/authorization test affected by the final diff.

Frontend focused, from `frontend/`:

```sh
npm test -- src/features/designer/DesignTeamPicker.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/project-status/ProjectStatusButton.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx
```

From each of `backend/` and `frontend/`, after focused checks pass:

```sh
npm run typecheck
npm test
npm run build
```

Rendered verification uses the actual local frontend with synthetic, controlled API fixtures or an isolated test backend, never live customer records:

- At approximately 1440px and 390px: primary with no eligible secondary, one secondary, three long-named secondaries, access paused, and completed measurement after team changes. Confirm readable owner names/guidance, reachable controls and no horizontal overflow.
- Primary selects/saves secondaries once; workflow and Project status show committed ownership. Secondary opens their existing task and sees completion when ready. Another secondary sees completion after refresh and cannot complete again.
- Failed team save keeps current owners; stale membership loss yields safe error/refresh. Legacy workflow still renders and supports its separate assignment control.
- Exercise keyboard selection, focus return, file input and error announcements; check accessible names, console errors and unexpected network requests. Verify existing Client restrictions and history/evidence presentation.

Trace final results to the criteria:

| Criteria | Required integrated evidence |
| --- | --- |
| AC1–AC3 | Team update/action integration, zero/one/multiple/unavailable owner projections, and rendered primary/secondary journeys |
| AC4 | Direct action authorization matrix across two projects, forged assignment rejection and stale-form denial |
| AC5 | Real replica-set ordering/race tests plus CAS/replay and cleanup event-count assertions |
| AC6 | Evidence, prerequisites, access pause, clock/downstream regressions and unchanged completed history after team edits |
| AC7 | Matching workflow/status/task owners, versioned save/failure behavior and refreshed queries |
| AC8 | Explicit older-workflow assignment and completion regressions |
| AC9 | Desktop/mobile interaction, accessibility, layout and Client visibility checks |

Finish with `git diff --check`, `git status --short`, per-target diff inspection and comparison of protected dirty files against the captured baseline. Clean up task-created browser fixtures, screenshots, temporary test databases and processes; report any retained ignored build/typecheck artifacts. Do not remove artifacts or changes belonging to other tasks.

Final handoff records changed files, exact commands/results, criterion coverage, warnings and unrun checks. State that no migration, production action, dependency change, commit, push or deployment occurred. No lint script exists, so do not claim lint passed. Do not call partially verified work complete.

## Progress

- Specification: approved by the user on 2026-11-05.
- Task plan: approved by the user.
- Execution mode: A, parallel native agents, selected by the user for this task.
- P1: complete. Captured 32 pre-existing dirty paths, full diff, file copies and hashes at `/private/tmp/lisno-secondary-measurement-baseline`; reviewed the protected Client visibility diff. Independent backend/frontend audits reconciled; contract below.
- P2: complete. Backend and frontend owned files are stable; no public type extension or protected-panel edits needed.
- P3: complete; independent integrated review found no confirmed defect or must-fix finding. Reviewed transaction ordering, evidence cleanup, unchanged history, legacy behavior and the minimal fixture repair. All 30 protected dirty files remain hash-identical.
- P4: targeted automated and rendered checks passed; full-suite attempts failed with resource/timing disruption and additional unclassified failures. No claim of full-suite health is made.
- Planning-only checks: current paths, scripts, transaction harness, query invalidation and existing worktree state inspected. No product code changed and no tests run at this gate.

## Settled P1 contract and baseline evidence

- No public API shape extension. Backend adds transient secondary membership capability and a current eligible-owner context. Workflow-3 actions reject new manual assignment and accept measurement completion only for an eligible current secondary, independently of any legacy singleton. Existing prerequisite/CAS/replay/evidence behavior stays intact.
- One backend helper resolves current secondary IDs against active, non-deleted Designer records for workflow and Project status. Project status receives domain-only owner context, so the compatibility `assignedDesignerIds` mirror does not become the ownership source. Do not broaden chat membership. Missing context must fail closed or resolve from already eligible participants intersected with canonical secondary IDs; never fall back to the singleton or primary.
- Existing backend facts/blockers/instructions/actions expose owners and empty-state guidance. Omit the measurement candidate list for workflow 3. Root updates OpenAPI descriptions only; public field types remain unchanged.
- Add a bounded deleted-actor check in workflow scope, since current `requireActor` verifies active/role but not deletion. Keep team/action authorization coordination inside both transactions.
- Frontend adds team guidance and measurement-only permission-denial refresh/disabled handling for 403/404, retaining existing 409 behavior. If refetch fails, a denied open form remains disabled rather than trusting cached action availability. Existing invalidation already covers workflow/status/designer tasks; no selector or protected panel edit is expected.
- Backend baseline: `npm test -- tests/design-team.replica-set.test.ts tests/design-workflow-state.test.ts tests/design-workflow-projection.test.ts tests/project-status.test.ts` passed 363 tests in 4 files, including the isolated replica-set harness (5.50s).
- Frontend baseline: five focused suites (`DesignTeamPicker`, `WorkflowStageActions.measurement`, `ProjectWorkflowProgress.designer`, `DesignerDesignPlanTasksPage`, `ProjectStatusButton`) passed 83 tests in 5 files (6.32s).

## Final implementation

The backend derives current eligible owners from the saved secondary IDs, using `domain/measurement-ownership.ts`. Workflow scope supplies a transient secondary capability; workflow-3 manual-assignment writes are rejected and only current active, non-deleted secondaries can complete measurement. The existing transaction fence, workflow CAS, idempotency, media cleanup and history remain in place. No ownership data is copied into persisted workflow state.

Workflow facts, version-specific instructions and Project status use the same team source. Current-team names are distinct from the historical measurement completer. Empty/ineligible teams produce guidance to use Design team and assign the pending team-selection responsibility to the Primary Designer. Legacy projects retain their separate assignment behavior. OpenAPI descriptions document these semantics without adding public fields.

Frontend product changes are limited to `DesignTeamPicker.tsx` responsibility guidance and `WorkflowStageActions.tsx` measurement-only 403/404 refresh/disabled handling. An already denied form remains disabled even when refetch fails, preserving its safe draft. Existing query invalidation and generic owner/action rendering were sufficient; no selector, CSS, public frontend type or protected Client panel change was needed.

Task-specific product/test paths:

- Backend source: `src/domain/measurement-ownership.ts`, `design-workflow-instructions.ts`, `project-status.ts`; `src/services/design-workflow-state.service.ts`, `project.service.ts`, `project-status.service.ts`; `src/openapi.ts`.
- Backend tests: new `secondary-designer-measurement.test.ts` and `secondary-designer-measurement.replica-set.test.ts`; existing `client-furniture-workflow.test.ts` prerequisite/fixture correction.
- Frontend source: `src/features/designer/DesignTeamPicker.tsx`, `src/features/workflow/WorkflowStageActions.tsx`.
- Frontend tests: `DesignTeamPicker.test.tsx`, `WorkflowStageActions.measurement.test.tsx`, `ProjectWorkflowProgress.designer.test.tsx`, `DesignerDesignPlanTasksPage.test.tsx`, `ProjectStatusButton.test.tsx` in their existing feature directories.

The furniture test originally failed 18 of 19 cases on an isolated untouched HEAD copy before reaching measurement: its quotation fixture lacked current immutable snapshot/digest/sales-approval/paise metadata. Only that fixture evidence and the measurement prerequisite were corrected; assertions and production approval validation were preserved. It now passes 19/19.

## Final automated evidence

From `backend/`, the final serial command passed **544/544 tests across 13 files**, exit 0, in 34.58 seconds:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism tests/secondary-designer-measurement.test.ts tests/secondary-designer-measurement.replica-set.test.ts tests/design-team.replica-set.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-projection.test.ts tests/workflow-measurement-media.test.ts tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-user-responsibilities.test.ts tests/project-status-routes.test.ts tests/project-status-mongo.replica-set.test.ts tests/client-furniture-workflow.test.ts
```

This includes all **33 new service/permission/status tests** and **4 new real replica-set tests**. They cover canonical membership independent of stale compatibility assignments, zero/one/multiple/unavailable secondaries, denied roles and unrelated projects, prerequisites, evidence, version conflicts, historical exact replay, no read writes, completed actor history, actual Project status resolution, team changes and concurrent submissions. Replica tests verify one completion/audit event, both team-removal/completion orderings, losing-upload cleanup and replay cleanup.

From `frontend/`, the final focused command passed **122/122 tests across 6 files**, exit 0, in 7.63 seconds:

```sh
npm test -- src/features/designer/DesignTeamPicker.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/project-status/ProjectStatusButton.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx
```

Fourteen new frontend regressions cover saved-versus-draft ownership, cache refresh, failed saves, 403/404 denial with failed refetch, same-version action removal, legacy selection, primary/secondary/missing-team presentation and multiple status owners. The protected Client visibility panel regression suite is included unchanged.

Both workspaces passed `npm run typecheck` and `npm run build` (exit 0). Frontend retains the existing >500 kB bundle warning; main bundle is 3,268.29 kB minified / 898.49 kB gzip. `git diff --check` passed. All **30 protected pre-existing dirty files** stayed hash-identical.

### Full-suite limitations

`npm test -- --maxWorkers=2` was attempted in each workspace and **did not pass**:

| Workspace | Files | Tests | Outcome |
| --- | --- | --- | --- |
| Backend | 100 failed, 257 passed, 3 skipped | 123 failed, 6,575 passed, 609 skipped | Exit 1 |
| Frontend | 58 failed, 361 passed | 197 failed, 6,183 passed | Exit 1; also 3 worker-start errors |

Both broad attempts reported abnormally long elapsed durations and extensive Mongo startup, hook, worker and test timeouts. Other assertion/fixture failures were not fully classified; do not describe all failures as pre-existing. An initial unrestricted 17-file backend focused run was also resource-degraded (32 failed, 546 passed, 101 skipped); the serial 544-test lane above subsequently passed on the same integrated sources.

One separate failure is conclusively pre-existing: `design-workflow-submission-gates.test.ts:335` lacks valid quotation approval in its fixture. It reproduced unchanged on the isolated HEAD copy with **24 passing / 1 failing** tests. That file and production approval rules were left untouched. It is excluded from the successful final serial command, not silently counted as passed.

Full-suite health remains unresolved. No full-suite restart or unrelated product changes were made to mask these failures. No lint script exists; no lint or OCR checks were run. Browser checks use synthetic APIs, while backend authorization, transactions and evidence behavior are verified by the automated service/HTTP/replica-set tests.

## Rendered verification

Actual Designer workspace, initially local Vite and then the freshly built production preview for stable form checks; synthetic runtime API interception only. Vite HMR connection loss interrupted two preliminary form checks, so those were completed against the production preview without changing product code.

- Desktop 1440px and mobile 390px: document scroll width equals viewport width; zero/one/three-long-name secondary states wrap and remain usable. Primary sees the saved owners and no measurement-completion or separate assignment action.
- Actual team save changes committed owner facts without reload. Keyboard ArrowDown/Enter selection and Escape focus return passed.
- Axe WCAG 2/2.1 A/AA reported **zero violations** in desktop zero-team and mobile three-owner states.
- Secondary completion records one successful submission/completion. Another secondary sees no completion action after refresh. After team changes, current owner names and historical completer remain clearly distinguished.
- Denied completion (403) plus failed workflow refetch (503) leaves submission disabled and retains the note/photo. The access-changed message and backend error remain visible.
- Paused state has no completion action and displays its access blocker. Legacy mode retains its assignment control. Failed team save retains the original committed owner and replacement draft.
- No unknown API endpoints or runtime errors. Console errors were limited to deliberately mocked 403/503 cases. Full Client and Project status browser journeys were not exercised; focused component/service tests cover their affected restrictions and ownership projection.

Screenshots were inspected by the browser agent and primary at `frontend/output/playwright/secondary-measurement/`, including desktop/mobile multi-owner, denial and post-completion history states. They are temporary QA evidence, not deliverables.

## Cleanup and remaining boundaries

Temporary artifacts were created at `/private/tmp/lisno-secondary-measurement-baseline`, `/private/tmp/lisno-measurement-head-belsue15`, `/private/tmp/lisno-secondary-measurement-browser`, `/private/tmp/lisno-secondary-measurement-verification`, `frontend/output/playwright/secondary-measurement/`, and task-created `frontend/.playwright-cli` entries. Task-owned browser/servers were stopped; temporary baseline/archive copies, fixtures, screenshots and task-created CLI artifacts were removed. Failed-run diagnostic logs, isolated HEAD comparison logs and the final protected-file result are retained temporarily under `/private/tmp/lisno-secondary-measurement-verification/` for unresolved full-suite investigation. Ignored build/typecheck outputs such as `backend/dist`, `frontend/dist` and TypeScript build information are retained as normal generated local outputs. Final diff hygiene passed and all 30 protected files remained unchanged.

No new dependencies, lockfile changes, migrations, seeds, production mutations, external communications, commits, pushes or deployment were performed. The existing unrelated Client/Sales/recommendations work is preserved.

## Runtime follow-up: stale local server (2026-11-06)

The user still saw the manual assignment button in the actual Designer workspace. Investigation confirmed that the frontend had loaded the new Secondary Designer guidance, but the local backend process had started on 2026-11-05 at 10:34, before the measurement service edit at 21:01. Its `scripts/local-chat.mjs --with-ocr` launcher deliberately does not watch source files. This was an outdated running backend, not a remaining workflow-3 assignment branch in the changed code.

The old local supervisor was stopped gracefully. Automatic approval review then rejected restoring the original SMTP-enabled startup because background services could send external email. A safer temporary launcher, `/private/tmp/lisno-measurement-mail-disabled.mjs`, was used to start the same loopback backend/rules/OCR services with outbound mail disabled only in the process environment. It removed the complete mail configuration group, prevented dotenv from restoring it, and verified both the local development database guard and `mailDelivery.kind === "disabled"` before starting. The saved `.env` was not edited; there was no seed or migration.

Verification used the user's actual open Designer page, not a synthetic fixture: local backend health returned HTTP 200, then a page reload showed **no Assign measurement team member button** and displayed **Assign a Secondary Designer in Design team to carry out onsite measurement.** No project data or assignments were changed during this check.

The user explicitly approved **Restore the original email setup**, including possible resumed queued delivery. The temporary stack was stopped gracefully and the original `node ../scripts/local-chat.mjs --with-ocr` command was restored from `backend/`, using the unchanged SMTP-enabled configuration. Local development target and SMTP mode were validated before restart; backend health returned HTTP 200 afterward. The backend, rules service and OCR worker are running, and the frontend stayed available throughout. Reloading the actual Designer page again confirmed the assignment button is absent and the Secondary Designer guidance remains. No test email or project mutation was submitted.

The temporary mail-disabled launcher and its log were removed after restoration. The restored runtime log is `/private/tmp/lisno-measurement-runtime-restored.log`; the active original supervisor execution session is `11948`. This local service is intentionally left running for the user. Saved environment settings were unchanged throughout.

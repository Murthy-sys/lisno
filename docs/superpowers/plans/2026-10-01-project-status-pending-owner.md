# Project status and pending responsibility: task plan

Status: specification and task plan approved; user selected Mode A on 2026-10-01. T1–T7 complete. Implemented and verified locally on 2026-10-01; not deployed.

Source of truth: [approved specification](../specs/2026-10-01-project-status-pending-owner-design.md).

## Outcome

Provide one reusable **Project status** button and read-only drawer for current project participants. Show the current stage, next action, responsible people/roles, concurrent pending work, and recorded blockers or schedules. Derive the summary on the backend from existing workflow and assignment sources; preserve all existing actions and approval gates.

## Dependency order and execution

`T1 contract/baseline → T2 domain + T3 service + T4 UI → T5 integration → T6 integrity review → T7 final verification`

Only one parent task is in progress at a time. After the user selects Mode A, T2, T3, and T4 may run concurrently against the contract settled in T1. T3 may use the agreed domain interface until T2 is integrated. Shared-file changes belong to the primary agent. Mode B executes these tasks inline in dependency order.

## Ownership and preservation

- The worktree is already dirty with the earlier Designer upload, furniture panel, workflow visibility, and Client estimate review work. Capture the full dirty-path set and relevant per-target diffs immediately before implementation. Understand each existing diff before assigning a writer.
- Domain writer: new `backend/src/domain/project-status.ts` and its focused tests only.
- Backend writer: new status service/router and their tests; any dedicated status-source reader and its tests. Existing repository source-loader changes require explicit assignment after T1, including memory/Mongo alignment. Excludes shared contracts, registry, app wiring, and the domain writer's files.
- Frontend writer: new `frontend/src/features/project-status/` components, styles, API hook/tests; `features/messages/ProjectChatHeader.tsx`, `ProjectMessagesPage.tsx`, and their focused tests. Excludes shared authorization/types and existing workflow/estimate mutation consumers.
- Primary agent: backend/frontend shared types, authorization/route registry/OpenAPI, app wiring, shared repository interfaces, integration/cache hooks, documents, and final reconciliation. Existing dirty workflow/estimate files are only touched for necessary integration, preserving their current behavior.
- Every writer must be told they share the worktree, must preserve other changes, and must report contract gaps before changing a different owner's files.

## T1. Capture the baseline and settle the interfaces

Owner: primary agent. Criteria: AC1–AC7.

1. Record the dirty baseline and run proportionate existing membership, workflow, and navigation checks. Capture known unrelated failures separately.
2. Define the shared response and normalized domain inputs before writers start. The response includes project identity/status, `serverNow`, summary availability, current stage, and pending actions with stable source keys, responsible roles, eligible people, optional authoritative schedules/deadlines, and safe blockers.
3. Agree deterministic stage precedence, handling of parallel actions, unassigned people, source conflicts, and the distinction between “no pending tracked actions” and a completed project.
4. Map source reads to existing project participant sources, canonical commercial/Design approvals, workflow state, and generated execution tasks. The chat source projection lacks some approval evidence; do not infer immutable approvals from its status string alone. Load the necessary existing records using their established repository/service boundaries.
5. Define the `projects.status.read` permission and membership-scoped operation for `GET /projects/:projectId/status`. Reuse verified session claims and current participant resolution, respecting exclusions and inactive users. The summary must be readable outside chat sending hours.
6. Define the frontend query key under the established project-workflow prefix where suitable, so existing workflow invalidation can refresh the summary. Identify additional draft-save, assignment, approval, execution-task, and membership mutations needing explicit invalidation.

Deliverable: settled typed interfaces, source map, exact writer ownership, and baseline evidence. This task does not broaden the approved scope.

## T2. Derive current stage and pending owners

Owner in Mode A: backend/domain implementer. Criteria: AC2–AC5, AC7.

- Implement a pure summary projection from validated source inputs. Use workflow action/state rules and current assignments; do not use viewer-filtered action arrays, SLA clock ownership, Lead free text, or display labels as join keys.
- Cover Sales preparation/returns/publication, internal estimate review, current Client review, payment confirmation, all six design stages, Design revision/approval/acknowledgement, and existing execution tasks.
- Distinguish scheduled waits, paused access, multiple outstanding confirmations, completed actions, and future locked stages. Include independent actions that can actually proceed; never blame a future assignee for a blocked stage.
- Resolve named people only from active, eligible project assignments/participants. When missing or ambiguous, use the responsible role with “Assignment needed.”
- Keep blocked or inconsistent source state explicit. Approval evidence and generated-task lineage must match the current project/estimate/version. Return only safe status fields.
- Add table-driven regression coverage for every row of the specification's responsibility matrix, including legacy/current furniture paths, simultaneous actions, on-behalf/direct approval equivalence, and unequal projects.

## T3. Add the authenticated status read

Owner in Mode A: backend implementer, separate from T2. Criteria: AC1, AC3–AC5, AC7.

- Add a dedicated status service and read router using the T1 contract and T2 projection. Reuse the participant source loader/resolver, current session validation, and established source reads.
- Authorize membership before returning any project identity or pending-person information. Deny unrelated, removed, inactive, stale-session, and unauthenticated callers without disclosing project existence.
- Load required records in bounded batches; avoid per-person/task queries. If a repository interface changes, coordinate with the primary agent and align memory/Mongo behavior. Do not introduce a persisted summary, migration, or new transaction solely for this read.
- Preserve lineage across linked project, Lead, commercial round, Design round, and generated tasks. Detect contradictory reads rather than combine them into a false completion or owner.
- Return a minimal whitelisted DTO with `Cache-Control: no-store`. Do not expose internal notes, commercial values, proof/attachment metadata, contact details, or source documents. Do not write chat/domain data or start background delivery.
- Test direct service and mounted route access with two asymmetric projects, multiple roles, explicit selections/removals, revoked grants, inactive accounts, and the protected Super Admin rule. Verify response redaction and absence of domain side effects.
- Exercise Mongo source loading if added or changed; use replica-set integration when the reused repository path requires it. Preserve established transaction semantics.

## T4. Build the shared button and drawer

Owner in Mode A: frontend implementer. Criteria: AC1–AC3, AC5–AC7.

- Build a reusable button/drawer using existing UI primitives and the approved visual direction. Integrate it once into shared project navigation and into the selected conversation header so assigned workers and selected participants can reach it.
- Confirm participant access before showing the button. Avoid duplicate buttons, page-specific owner calculations, new message streams, or dependence on whether chat sending is currently open.
- Render current stage, pending people/role, next action, other active actions, and recorded blocker/schedule/deadline. Support long names, unassigned roles, source issues, completed/no-pending, and paused/scheduled states.
- Fetch fresh data when opened; provide Refresh, focus refetch, and a 30-second interval only while the drawer is open and the page visible. Key by project ID and authenticated identity; close/reset correctly when either changes.
- Handle initial loading, transient refresh errors with labelled stale data, empty/unavailable states, and access revocation. Purge denied data and close/hide the control; never retain another project's content.
- Reuse focus containment, Escape/close, and restoration. Ensure readable desktop/tablet/mobile layouts without horizontal overflow or new dependencies.
- Add rendered tests for membership visibility, role-independent summary content, multiple actions, unassigned state, refresh/polling lifecycle, error/denial, project changes, keyboard focus, and accessibility.

## T5. Integrate contracts, entry points, and freshness

Owner: primary agent. Criteria: AC1–AC7.

- Wire the service/router into `backend/src/app.ts`; synchronize canonical permission definitions, route registry, frontend authorization contract, OpenAPI, and their tests. Assert actual mounted authorization rather than only documentation presence.
- Reconcile existing route-inventory fixture mismatches when updating the affected inventory for this new operation. Preserve exact route/permission coverage; do not suppress failures or loosen assertions to accept arbitrary routes.
- Integrate the domain/service/UI results and inspect all writer diffs against the captured baseline.
- Complete cache invalidation for relevant estimate save/publication/direct-on-behalf decisions, Designer assignment/review, workflow actions, execution assignments/completion, and participant changes. Reuse existing broad invalidations where sufficient; avoid redundant requests.
- Verify that the new status summary works before estimate approval while the design workflow remains hidden, and that opening it never enables otherwise unauthorized actions or exposes source data.
- Walk Client → Sales revision → Client approval and Designer/Client workflow handoffs. Confirm distinct individual assignments and parallel actions update correctly for other viewers on refresh.

## T6. Review the integrated result

Owner in Mode A: read-only `integrity_reviewer` after all writers finish. In Mode B: primary agent. Criteria: AC1–AC7.

Review membership/session enforcement, protected identity behavior, per-project isolation, source/version lineage, immutable approvals, current-owner accuracy, parallel/scheduled work, data minimization, cache invalidation, request races, and preservation of prior work. Fix confirmed findings and recheck affected paths before final verification.

## T7. Verify and hand off

Owner in Mode A: `verification_runner` after review fixes; primary agent owns browser inspection. In Mode B: primary agent. Criteria: AC1–AC7.

Run focused lanes first, from each workspace:

- Backend new suites: `npm test -- tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-routes.test.ts` (use finalized names if different).
- Backend shared regressions: participant/membership and session tests, `design-workflow-state.test.ts`, `workflow-space-planning.test.ts`, and relevant Client estimate review/decision tests. Re-run the affected memory/Mongo source-loader and replica-set integration suites when those paths change.
- Backend contract gate: `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts`.
- Frontend: new project-status tests plus `ProjectMessagesPage.test.tsx`, `ProjectChatProvider.refresh.test.tsx`, the affected project navigation consumers, and mutation-invalidation regressions. Check the new permission contract too.
- Both workspaces: `npm run typecheck` and `npm run build`. Run `git diff --check` and inspect `git status --short`. No lint script exists.
- Browser with synthetic fixtures: desktop, tablet, narrow mobile, and 200% text resizing; inspect long owner/action labels, drawer scroll, multiple actions, scheduled/paused/unassigned/source-error states, keyboard opening/closing/focus restoration, refresh, project switching, and access removal. Verify participant-only button visibility for Client, Sales/Designer, and an execution worker, including before estimate approval.

Trace the result to AC1–AC7. Save temporary logs/screenshots outside tracked sources and report their locations. Report exact commands/results, affected files, unrun checks, known unrelated failures, and remaining risks. No dependency/lockfile changes, migration, seed, commit, push, deployment, or external communication is planned.


## Execution evidence (2026-10-01)

- Baseline preserved in `/tmp/lisno-project-status-baseline/prior-status.txt` and `prior-work.diff`. Earlier estimate review, furniture and Designer upload changes remain intact.
- Domain and backend were delegated to separate native implementation agents. Primary agent implemented the frontend and shared integration because an additional frontend agent could not start within the available thread limit.
- Added the shared status contract, participant-scoped GET endpoint, snapshot source reader, pure workflow projection, reusable drawer and navigation/conversation buttons. Repository memory/Mongo reads are aligned. No persisted summary, new dependencies, lockfile changes or migration.
- All human roles receive the read permission; current participant membership and session checks remain authoritative. Returned people contain only ID, name and role. Source documents, commercial amounts and approval proof metadata are excluded.
- The integrated integrity reviewer found one issue: pending Designer assignment was initially hidden behind later upload prerequisites. Fixed and re-reviewed: assignment is now independent concurrent work immediately after approval, without unlocking future upload actions. Domain coverage increased to 57 tests.
- A pre-existing furniture screen test fixture lacked the approved-estimate marker required by the earlier workflow visibility change. Added that marker to the fixture, preserving the visibility guard.
- The startup gate exposed a pre-existing fixture omission: two daily-critical model index initializers were not mocked. Updated only the test to match the existing production initialization order; all 18 server tests passed.
- Browser fixtures and screenshots are under `/tmp/lisno-project-status-baseline/`. Desktop 1440 px, tablet 768 px, mobile 390 px and 200% root text were inspected. Enlarged-text toolbar overflow was corrected; the drawer body has no horizontal overflow and the close button remains visible. Refresh, concurrent/unassigned work, source issue, stale-error display, Escape/focus restoration and revoked-access hiding were exercised with synthetic responses.
- Current browser diagnostics intentionally include simulated 503 and 404 responses. Initial role fixtures omitted daily-critical and conversation-list responses; both fixtures were corrected. The final Designer and worker conversation runs passed without additional console errors. Client, Designer and electrician-worker entry points all opened the same safe status summary. No production data was used.

### Acceptance trace

| Criteria | Evidence |
| --- | --- |
| AC1 | Service/route membership, session and asymmetric project tests; shared navigation/conversation entry point; role-independent rendered tests. |
| AC2–AC4 | Pure domain stage matrix, direct/on-behalf canonical evidence tests, parallel assignment and confirmation cases, generated execution task lineage. |
| AC5 | DTO/OpenAPI whitelist, proof redaction, conflicting-source and access-removal checks. |
| AC6 | Drawer rendered tests for refresh, polling/focus, identity/project reset, stale/denied states, keyboard and axe; responsive browser checks. |
| AC7 | Preserved initial dirty baseline; focused shared workflow and earlier consumer regressions plus workspace typechecks/builds. |

### Final check results

- Backend focused status suites: 78/78 passed (57 domain, 17 service, 1 route, 3 Mongo replica).
- Backend authorization/route/API/startup and shared workflow/approval regressions: 602/602 passed.
- Shared workflow Mongo reader regressions: 54/54 passed. Total backend: **734 passing tests**.
- Frontend status/navigation/cache/mutation checks: 85/85 passed. Preservation checks: 167/167 passed after the furniture fixture correction. Total frontend: **252 unique passing tests**.
- Both workspace typechecks and production builds passed (exit 0). The frontend build reported existing chunks over 500 kB; workflow tests reported the Mongoose `new` option deprecation. No selected check remains failing.
- Integrity review passed after the early-assignment fix; rendered and browser checks are recorded above. `git diff --check` passed.

Whole backend/frontend suites and OCR were not run; no lint script exists. Earlier full-journey fixture issues (workflow prerequisites and OCR soft-delete metadata) were outside the selected regression lane. Browser checks used intercepted synthetic API data; authenticated backend behavior was verified separately through service, mounted route and Mongo tests. No commits, pushes, deployments, seeds, migrations or production mutations were performed.


### Exact final commands and results

```text
Backend cwd: /Users/apple/Desktop/personal/lisno/backend
1. npm test -- tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-routes.test.ts tests/project-status-mongo.replica-set.test.ts
   Final exit 0: 78 passed, 4 files (domain 57, service 17, mounted route 1, Mongo replica 3).
   Initial same command exit 1: 77 passed, 1 failed. An outdated Mongo assertion expected only payment and excluded admin-a, while the reviewed fix also reports concurrent Designer assignment. Root updated the assertion, retained proof redaction checks, and the full focused command passed.
2. npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts tests/design-workflow-submission-gates.test.ts tests/workflow-space-planning.test.ts tests/project-chat-membership.test.ts tests/project-module-access.test.ts tests/design-workflow-state.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-decision.test.ts
   Exit 0: 602 passed, 12 files.
3. npm test -- tests/design-workflow-state.replica-set.test.ts tests/workflow-space-planning.replica-set.test.ts
   Exit 0: 54 passed, 2 files (design workflow state 41; space planning 13).
4. npm run typecheck
   Exit 0.
5. npm run build
   Exit 0.

Frontend cwd: /Users/apple/Desktop/personal/lisno/frontend
1. npm test -- src/features/project-status/ProjectStatusButton.test.tsx src/features/messages/ProjectMessagesPage.test.tsx src/features/messages/ProjectChatProvider.refresh.test.tsx src/features/admin/ClientResponseDecisionDialog.test.tsx src/features/admin/WorkerAssignmentPanel.test.tsx src/features/workflow/OperationalTaskQueue.test.tsx src/api/authorization-contract.test.ts
   Exit 0: 85 passed, 7 files. Includes 13 new status tests with rendered keyboard/axe checks, refresh, hidden polling, project/identity reset, and denied-cache removal.
2. npm test -- src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/FurnitureUomField.test.tsx src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/SpacePlanningCompletion.test.tsx
   Initial exit 1: 163 passed, 4 failed, 10 files. The four failures were in the Designer furniture fixture, which omitted estimateApprovalStatus: approved and was correctly hidden by the existing fail-closed guard.
3. npm test -- src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx
   After root corrected the fixture: exit 0, all 6 tests pass. Combined with the other 161 regression tests, all 167 tests in the preservation lane have passing results. Combined command was not repeated because only that fixture changed.
4. npm run typecheck
   Exit 0.
5. npm run build
   Exit 0; Vite 3003 modules; built in 8.11s.

```

Full verification report and command logs: `/tmp/lisno-project-status-baseline/project-status-final-verification.txt` and `verification-<lane>.log`. Browser screenshots and fixture scripts are stored in the same temporary directory; build outputs remain ignored.

## Correction: participant visibility and actual pending owner

The user reported unmet AC1, AC2, and AC4. The approved Mode A implementation continues under the same feature scope. The current dirty baseline is captured in `/tmp/lisno-project-status-correction/prior-status.txt` and `prior-work.diff`; preceding Designer upload, furniture, Client review, and full-PDF edits remain owned by their prior tasks.

1. Frontend owner: decouple the button's membership check from chat availability, expose it in project contexts and site/worker task groups, and cover denied, transient, switched-project, and accessible states. Preserve server authorization as authoritative and avoid per-task query fan-out.
2. Backend source owner: remove the impossible `Estimate.clientDecisionSource` comparison; verify immutable direct/on-behalf round, timestamp, proof, version, and finance lineage against actual persisted Mongo documents. Keep memory/Mongo evidence aligned without schema changes.
3. Backend domain owner: show eligible Finance Head and Super Admin as alternative payment confirmers, use only assigned project Sales for calendar acceptance, require the Client Design completion event, and attribute missing kickoff evidence to Internal Kick off. Order the current lifecycle action ahead of independent prior work, and advance the headline to execution when Design is completed. Add focused regressions.
4. Primary integration: reconcile the shared contract and pre-existing diffs, review authorization/data lineage, validate a read-only local approved-project status after the fix, then run focused and shared checks, both typechecks/builds, responsive rendered interaction, and `git diff --check`.

The prior 734 backend and 252 frontend passing tests are historical evidence, not proof of this correction. Record new command results and limitations below after integrated verification. No production mutation, migration, seed, Client communication, commit, push, or deployment is authorized.

Correction evidence so far:

- Backend commercial source tests passed 17/17 in memory and 3/3 in Mongo replica tests. Persisted direct and on-behalf approvals without the nonexistent Estimate source field now produce an active status; tampered approval evidence still produces a source issue.
- Backend domain tests passed 70/70 after pending-owner, Client event, kickoff-label, and current-stage ordering corrections. Backend typecheck passed for both owned slices.
- Read-only local development database check after integration returned `active` without a source issue for both approved projects. Each project's Client, assigned Sales user, and assigned Designer received the same state and current stage. The first pending action now matches the current stage (Design for one project, execution for the other). Output included only project ordinal, roles, stage keys, state, and action counts; no data was changed.
- Frontend focused correction suite passed 80/80 and typecheck passed before integrity review. The review found and fixed a cached-status preflight gap: uncertain membership now requires a successful fresh status read. It also found and fixed the scheduled-kickoff label: future meetings say “Scheduled with,” while actionable work says “Pending with.” Final focused status tests passed 19/19 and frontend typecheck passed. Independent re-review reported no remaining findings.

### Final correction verification

- Integrated backend selection: 590/590 passed across 12 files, including Project status domain/service/mounted route/Mongo replica, membership, workflow, estimate decision, authorization, route registry, and API docs. The first sandbox attempt could not open local test listeners (`EPERM`); the identical command passed with permitted local test access. No product failure remained.
- Integrated frontend selection: 113/113 passed across seven files, including Project status, conversation and task screens, Client and Designer consumers, and authorization. Rendered tests covered keyboard and accessibility behavior; the test axe scan disables its color-contrast rule. A separate manual browser run was not needed for this bounded correction.
- Backend and frontend `npm run typecheck` and `npm run build` all exited 0. `git diff --check` passed. The frontend build retains the existing large-chunk advisory (largest application JS 2,134.55 kB, gzip 585.60 kB). The final dirty-path comparison against the captured baseline adds only the intended conversation list and two focused test files; earlier work remains present.
- Exact logs: `/tmp/lisno-project-status-correction/backend-focused-escalated.log`, `frontend-focused.log`, `backend-typecheck.log`, `frontend-typecheck.log`, `backend-build.log`, `frontend-build.log`, `git-diff-check.log`, and `final-status.txt`.
- No dependency change, migration, seed, customer communication, commit, push, or deployment was performed. Full workspace suites and OCR tests were outside this correction's risk scope. Correction complete.

# Designer recommendations and client handoff: implementation plan

Date: 2026-11-25

Source of truth: [approved specification](../specs/2026-11-25-designer-recommendations-client-handoff-design.md). The user approved that specification in this conversation.

Status: Implemented and verified locally in approved Mode A on 2026-11-25. All seven tasks finished. Prior Location/Language work preserved; baseline and validation artifacts are under `/private/tmp/lisno-designer-handoff-20261125/`. No deployment or migration performed.

## Outcome and fixed decisions

- Super Admin sees all eligible Designers in ranked suggestion cards under Assignments → Designer. Ordering uses distinct non-completed assigned-project count, then project-language match, then saved location/city-text match, with stable ties.
- Send one pending primary-assignment request per project. The target Designer must accept before project access, task ownership, and existing assignment effects activate. Decline/cancel leaves the previous assignment intact.
- After initial estimate approval, Client content is grouped into Estimation, Design flow, and Execution. Pending requests display “We’ll assign your designer soon”; accepted assignments display the Designer's name.
- The Client confirms either 48 calendar hours from the server's confirmation time or an explicit future date/time in Asia/Kolkata. Both kickoffs remain prerequisites for actual key collection. The countdown can run while those prerequisites are incomplete and cannot silently extend.
- Keep fixed appointments separate from existing pausable SLA/KPI calculations. Preserve estimate/design approval history, amounts, PDFs, existing Location/Language work, and the removal of progress percentages.

## Contracts to establish before parallel writers

The primary agent owns the shared contract checkpoint. Define strict schemas and DTOs once, then provide them to all writers. No writer may invent a fallback source, broaden a permission, or change a shared shape independently.

### Assignment API

| Method/path | Input | Output and scope |
| --- | --- | --- |
| `GET /admin/projects/:projectId/designer-suggestions` | Existing bounded pagination shape and optional name search | Project/source revision, server time, ranked candidate page, accepted assignment and pending-request summary; Super Admin only |
| `GET /admin/projects/:projectId/designer-assignment-requests` | Bounded pagination | Current and historical request summaries; Super Admin only |
| `POST /admin/projects/:projectId/designer-assignment-requests` | `designerId`, `expectedSourceRevision`, `idempotencyKey` | Created/replayed pending request; Super Admin only |
| `POST /admin/projects/:projectId/designer-assignment-requests/:requestId/cancel` | `expectedVersion`, `idempotencyKey` | Cancelled/replayed request; Super Admin only |
| `GET /designer/assignment-requests` | Bounded pagination and optional request-status filter | Safe previews scoped to the authenticated Designer; no arbitrary target-user parameter |
| `POST /designer/assignment-requests/:requestId/decision` | `expectedVersion`, `decision: accept/decline`, `idempotencyKey`, optional decline `note` | Decided/replayed request and safe assignment result; target active Designer only |

- Use `backend/src/contracts/designer-assignment.ts` for dependency-free public shapes. Record states are `pending`, `accepted`, `declined`, `cancelled`; decisions are retained rather than deleted.
- `expectedSourceRevision` is a server-derived opaque revision of the validated project/estimate approval and current design assignment. It is a stale-state check, not authorization. Persist the exact source IDs/versions/approval reference behind it and revalidate on acceptance.
- A candidate includes stable ID, name, active-project count, saved language/location values, explicit language/location match classifications, and availability/reason. Missing values stay missing. Workload aggregation and stable ranking happen before pagination.
- A pending Designer preview includes only request identity/version, project name/location, project language preference, safe approved-scope summary, and request time. It does not disclose Client contact details, financial documents, chat, or administrative candidate comparisons.
- New Designer request permissions are personal operations with Super Admin personal-action denial. Administrative request operations still verify the actor is the authorized Super Admin, even though older assignment permissions are also used by other roles elsewhere.
- Keep the old immediate-assignment route registered as an explicit `409 DESIGNER_ACCEPTANCE_REQUIRED` compatibility response. Remove its ability to create an immediate assignment through the old public service path. Do not repurpose the pre-estimate Designer review/decision routes.

### Client handoff and key appointment

- Add a typed handoff projection to the existing authorized project design-workflow read. It includes validated initial-approval state, accepted Designer ID/name or null, safe handoff state, appointment details, prerequisites, permitted scheduling action, and source revision. Missing/ambiguous sources must be distinguishable from an unassigned project.
- Client reads receive no candidate identity while a request is pending, no declined-request notes, and no staff workload/language/location profile data. Pending requests do not create project membership merely to make the status chip work.
- Add `key_collection_schedule` to the existing workflow action envelope. Keep `stageId`, `expectedVersion`, `idempotencyKey`, and existing validation/audit conventions. Its data is a strict choice:

```ts
{ mode: "within_48_hours"; expectedAssignmentRevision: string }
// or
{ mode: "chosen_datetime"; scheduledAt: string; expectedAssignmentRevision: string }
```

- Store the appointment under the Key Collection stage in `DesignWorkflowState`, with mode, confirmed-by ID, confirmation timestamp, original/current deadline, accepted-assignment provenance, and approval-source reference. Use UTC ISO timestamps; require an explicit future instant for the custom option.
- Initial confirmation writes original/current deadline together. A replay returns the recorded result; a new attempt to replace an existing appointment conflicts. Reassignment may change the responsible Designer but never resets the project's appointment.
- Derive countdown state from server time and existing `receivedAt`/handover evidence. Receipt ends the Designer countdown; both parties' confirmations still determine stage completion. No timeout action completes a task automatically.
- Scheduling is a linked-Client personal action, allowed before kickoffs when there is an eligible accepted assignment and initial approval. Do not inherit broad representative/Super-Admin powers from the generic workflow action route. Actual key actions retain the existing current-quotation and kickoff gates.
- For newly accepted requests, require the Client scheduling decision before new key-collection actions; preserve valid legacy assignment/history behavior where no appointment was previously recorded.
- Extend necessary repository read contracts in memory and Mongo consistently. A narrow request-evidence reader can support workflow/status projections without replacing the established direct-Mongoose assignment writer.

## Ownership and sequencing

Keep one parent implementation task in progress. The primary agent owns product interpretation, contracts, shared files, integration, and final reconciliation.

In Mode A, after Task 1, three bounded implementation slices can run concurrently: assignment backend, appointment/workflow backend, and frontend. They share a worktree but have non-overlapping file ownership. Tell every writer that others are working concurrently and that existing changes must not be overwritten or reverted. No uncoordinated child agents.

In Mode B, the primary agent performs the same tasks inline without implementation/review subagents.

### Task 1: Baseline and contract checkpoint

Owner: Primary agent. Depends on task-plan approval and execution-mode selection. Acceptance criteria: groundwork for all specification criteria.

1. Capture dirty paths, per-target diffs, and existing untracked source files before writers begin. The completed User Location/Language implementation and tests are the baseline to preserve.
2. Recheck the approved estimate/Lead/project source resolution, immediate assignment effects, existing actor capabilities, kickoff gates, and stage timers. Use focused read-only audits only after Mode A has been selected.
3. Establish the DTOs, strict request/action schemas, request-source revision representation, appointment provenance, and repository evidence-reader interfaces above. Share exact imports/signatures and frozen examples with each writer.
4. Prepare shared declarations/registration changes in primary-owned files: `backend/src/contracts/designer-assignment.ts`, `backend/src/domain/authorization.ts`, `route-operations.ts`, `audit-actions.ts`, `backend/src/repositories/types.ts`, `backend/src/openapi.ts`, `backend/src/app.ts`, `frontend/src/api/types.ts`, `frontend/src/api/authorization-contract.ts`, and `frontend/src/features/workflow/projectWorkflowApi.ts`. The primary agent may defer app bindings until the corresponding service exists.
5. Coordinate narrow evidence-reader contracts for project/status projections and appointment validation. Keep backend-only stored metadata separate from public DTOs. Any later shared-contract edit returns to the primary agent.
6. Record a focused baseline where needed to distinguish unrelated existing test failures from intentional endpoint/registry changes. Do not run a global suite merely to establish a baseline.

### Task 2: Ranked suggestions and assignment requests

Owner in Mode A: Backend assignment implementer. Depends on Task 1. Covers specification acceptance criteria 1–3, 5, and assignment portions of 8–9.

Exclusive source ownership:

- New `backend/src/domain/designer-assignment.ts` for ranking/source helpers where useful.
- New `backend/src/models/DesignerAssignmentRequest.ts`.
- New `backend/src/services/designer-assignment.service.ts` and `backend/src/routes/designer-assignment.ts`.
- `backend/src/services/project-workflow.service.ts` and `backend/src/routes/project-workflow.ts`; a focused internal assignment helper extracted beside that service if necessary.
- Assignment/request tests and the existing project-workflow tests needed for the compatibility change. Do not edit workflow-state, project-status, repositories, app wiring, shared contracts, frontend, or documents.

Work:

1. Resolve the correct project/Lead/approved-estimate source by stable IDs. Aggregate distinct current primary/secondary/assigned projects, exclude completed projects and historical initiator-only membership, and include on-hold projects.
2. Implement language and conservative text-location matching with visible missing-data states. Sort the entire eligible set before paginating. Return active Designers with missing metadata rather than silently dropping them.
3. Persist requests and enforce one pending request per project. Add scoped idempotency uniqueness/receipt handling for creation and decisions; install/test indexes only in isolated test databases.
4. Implement request creation/list/cancel, target-only inbox/decision, safe preview DTOs, and transaction-bound actor/source revalidation. Validate status/decision/note combinations and reject unrelated fields.
5. Extract the current immediate assignment effects into an internal helper that runs in the caller's transaction after authorization has been established. Acceptance must atomically record the request decision, update the team/estimate/lead, upsert the existing deterministic task, and append audit events.
6. Retain old assignment while replacement is pending. Handle accepted replay, decline, cancellation, deactivated target, invalidated source, completed/ineligible project, and changed team without granting stale access or resetting unrelated deadlines.
7. Close the old public immediate-assignment path with the agreed compatibility response. Preserve current eligible historical assignments and approved-design restrictions.
8. Add focused ranking/route tests and replica-set tests for competing requests, accept/cancel races, source changes, rollback, idempotency, and absence of pre-accept project/chat rights. Supply request-evidence reader implementation guidance to the workflow writer through the primary agent.

### Task 3: Client appointment, handoff reads, and status integration

Owner in Mode A: Backend workflow implementer. Depends on Task 1; can run alongside Task 2 against its shared source contract. Covers criteria 3–8 and workflow portions of 9.

Exclusive source ownership:

- `backend/src/domain/design-workflow-state.ts`, `backend/src/models/DesignWorkflowState.ts` if required, `backend/src/services/design-workflow-state.service.ts`, and `backend/src/routes/design-workflow-state.ts`.
- `backend/src/services/project.service.ts`, `backend/src/domain/project-status.ts`, `backend/src/services/project-status.service.ts`, and a narrow related status-evidence reader where necessary.
- `backend/src/repositories/memory.ts` and `mongo.ts` for the primary-approved contracts only. Preserve the existing Location/Language mappings and authorization-version behavior.
- Workflow/appointment and project-status tests. No assignment-service/model/routes, shared declarations, app wiring, frontend, or documents.

Work:

1. Provide the server-authoritative initial-approval/accepted-assignment/handoff projection, distinguishing missing source data from an unassigned project. Keep Client output private and pending Designer access limited to the inbox contract.
2. Add appointment state and Client-only action validation to the existing workflow transaction. Check the active assignment/source revision and workflow version using coordinated source writes/fences where needed to prevent stale confirmation races with reassignment or approval changes.
3. Implement exact 48-calendar-hour and chosen-future-instant paths with one immutable original deadline, idempotent replay, audit history, and no overwrite on conflicting confirmations.
4. Preserve Internal Kickoff and Client Kickoff prerequisites for key actions. Keep scheduling separate from completing either kickoff. Preserve later measurement/design gates, initial payment rules, current quotation approval rules, and historical completed stages.
5. Project appointment countdown/absolute deadline/prerequisites independently of the current visible stage; derive receipt/completion/overdue states on the backend. Do not add appointment time to KPI/SLA calculations or pause/extend it implicitly.
6. Update status/owner summaries for request decision, Client scheduling, and key receipt while retaining outstanding kickoff actions. Resolve pending owners through narrow request evidence, not through extra chat membership. Hide pending candidate identity from Client projections.
7. Make appointment state survive reassignment without changing the deadline. Test legacy assigned projects and already completed collections without inventing historical acceptance/scheduling events.
8. Add memory and Mongo tests for authorization, initial/current approval distinctions, CAS/idempotency, temporal boundaries, receipt vs full completion, site-access blockers, source ambiguity, and asymmetric Client/project identities.

### Task 4: Admin, Designer, and Client screens

Owner in Mode A: Frontend implementer. Depends on Task 1; can run alongside Tasks 2–3 using the frozen API contracts. Covers criteria 1–7 and UI portions of 8–9.

Exclusive source ownership:

- `frontend/src/features/admin/DesignAssignmentPanel.tsx` and narrow assignment presentation components/styles/tests.
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx`, new assignment-request inbox and appointment components, and related tests.
- `frontend/src/features/client/ClientProject.tsx`, new Client handoff/scheduling component, scoped Client styles, and related tests.
- `frontend/src/features/workflow/ProjectWorkflowPanel.tsx`, narrowly affected workflow presentation/actions, and a dedicated assignment API module with actor/project-scoped query keys. Shared API/authorization declarations remain primary-owned.
- No backend, shared declarations, or documentation edits.

Work:

1. Replace immediate Designer assignment controls with ranked cards, truthful matching explanations, current request state, request/cancel actions, and bounded pagination/search. Keep Procurement and Project Manager assignment controls intact.
2. Add a Designer request queue before assigned work, with narrow previews and Accept/Decline controls. Do not mount project workspace queries for a pending request. Refresh accepted work, requests, team, status, and access-aware queries after a decision.
3. Group the existing Client content under Estimation, Design flow, and Execution after validated initial approval. Keep existing component identity/forms mounted where necessary; avoid portal content outside its parent section and avoid hiding active forms by unmounting on collapse.
4. Add awaiting/accepted-Designer messages and Client scheduling choices. Explain that the clock starts only on confirmation and that both kickoffs still precede collection. Require a specific date/time for the custom choice with explicit Asia/Kolkata conversion/display.
5. Add a Designer appointment timer/absolute deadline visible even when another stage is current. Reuse established server-time-aware countdown behavior; distinguish appointment due time from paused SLA clocks.
6. Respect source-unavailable, pending, error/retry, completed, stale-version, inactive-target, and eligibility states. Preserve inputs after safe failures, prevent double submission, and require review after conflicts.
7. Invalidate all affected admin suggestions/project, Designer requests/tasks/projects/team, Client workflow/quotation/project, and status queries. Include actor/project identity in keys; use bounded cross-session refetching without polling closed forms aggressively.
8. Add rendered tests for request/accept/decline/cancel, panel navigation and retained input, independent Client/project state, custom scheduling, server-time refresh/expiry, and kickoff blockers. Keep all-inclusive totals, PDFs, reviews, existing Designer work, status chips, and no-progress-percentage presentation intact.

### Task 5: Cross-layer integration and independent integrity review

Owner: Primary agent; `integrity_reviewer` in Mode A. Depends on Tasks 2–4 finishing.

1. Bind the new service/router in `backend/src/app.ts`; reconcile shared declarations, permissions, operation registry, audit inventory, and OpenAPI. Verify each new route has the correct scope and personal-action restrictions.
2. Exercise one complete synthetic path: approved project → suggestions → pending request → target acceptance → Client 48-hour/custom confirmation → required kickoffs → handover/receipt. Check that subsequent design/execution behavior still follows existing gates.
3. Review the integrated incremental diff against the baseline, with particular attention to approval-source lineage, unique pending requests, atomic acceptance, membership leakage, schedule immutability, version races, query caches, and historical compatibility.
4. Review request/appointment read paths and status projections for unauthorized candidate/profile/Client data. Verify that a pending Designer cannot use normal project/document/chat endpoints.
5. Resolve all blocking findings through explicit file owners. Do not expand into unrelated UI, finance, notification, or authorization refactors.

### Task 6: Final integrated verification and local readiness

Owner: `verification_runner` after review fixes in Mode A; primary agent inline in Mode B. Primary agent owns browser QA and any local development-service refresh. Depends on Task 5.

Run focused regressions first. Finish the required suites on a stable integrated worktree; do not count transient tests during concurrent edits as final evidence. Exact new test filenames may follow the implementation modules, and final commands/counts must be recorded here.

Backend test groups, from `backend/`:

```sh
npm test -- tests/designer-assignment.test.ts tests/designer-assignment-routes.test.ts tests/designer-assignment-mongo.replica-set.test.ts tests/project-workflow.test.ts tests/project-workflow-routes.test.ts tests/project-workflow-mongo.replica-set.test.ts
npm test -- tests/key-collection-appointment.test.ts tests/key-collection-appointment-mongo.replica-set.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts
npm test -- tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-routes.test.ts tests/project-status-mongo.replica-set.test.ts tests/project-chat-membership.test.ts tests/project-chat-membership-mutations.replica-set.test.ts tests/design-team.replica-set.test.ts tests/quotation-approval-state.test.ts tests/quotation-approvals.replica-set.test.ts
npm test -- tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts tests/authorization-policy.test.ts tests/admin-project-summary.test.ts
npm run typecheck
npm run build
```

- Add targeted public DTO/audit/API-schema assertions for the new resources, including field-level validation and old-route rejection. Registry/OpenAPI inventories intentionally affected by the new routes must be updated and checked; classify unrelated pre-existing API-doc failures with baseline evidence.
- Re-run Location/Language regressions if their shared repository/type/API surfaces are modified, rather than assuming earlier test counts still apply.
- Use isolated replica sets and synthetic identities; no shared application database writes or real invitations. Run socket-dependent test commands with the necessary local-test permissions rather than weakening transactions.

Frontend focused groups, from `frontend/`:

```sh
npm test -- src/features/admin/DesignAssignmentPanel.test.tsx src/features/admin/ProjectPeopleAssignments.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
npm test -- src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx
npm run typecheck
npm run build
```

Include new assignment inbox, Client scheduling, and appointment-timer tests. Include adjacent quotation/furniture/execution tests when those components or shared workflow rendering are changed. Do not broaden or repeat passing suites without a specific remaining risk.

Browser matrix, with synthetic fixtures and no real project mutations:

- Desktop and narrow mobile: ranked Designer list, missing metadata, pagination, pending/accept/decline/cancel states, and no pre-accept workspace access.
- Client before approval, awaiting Designer, accepted Designer, each parent expansion panel, retained form input, existing PDF/design/execution actions, and keyboard focus/accessibility.
- 48-hour/custom confirmation, displayed timezone, countdown before kickoffs, overdue state, receipt/completed state, stale response/error recovery, and reload without reset.
- Long names/location/language values, empty/error/loading states, no document overflow, and no unexpected console/network errors. Inspect screenshots visually and run rendered accessibility checks.

Before local handoff, inspect the established non-seeding loopback development launcher. If the running backend serves the old contract, restart that existing service and verify health/new schemas; do not run seed/demo-bootstrap or deployment commands. Stop task-only QA servers/browser sessions afterwards.

Run `git diff --check`, check new untracked source whitespace, and inspect `git status --short`. Preserve prior work and keep generated logs/screenshots outside product sources. Report ignored build/test artifacts. No lint script exists, so do not claim lint passed.

### Task 7: Evidence and handoff

Owner: Primary agent. Depends on Task 6.

- Record each acceptance criterion's evidence, final commands/results, changed paths, review findings/resolutions, and any unrun checks or existing unrelated failures in this plan.
- Summarize the three user-facing flows, the confirmed timer/kickoff rule, local readiness, and material limitations. Distinguish completed local implementation from deployment.
- Confirm no dependencies, production data, historical approvals, or external communications changed unless a newly discovered need was explicitly authorized. No migration/backfill is expected; request indexes are exercised in tests, and production rollout remains outside this task.

## Dependency graph and parallelism

Task 1 establishes contracts and ownership. Tasks 2, 3, and 4 can then run in parallel in Mode A. Shared-file changes remain with the primary agent; cross-slice discoveries must be reconciled before dependent work proceeds. Task 5 begins only after all writers finish; Task 6 follows resolved integrity findings; Task 7 follows verification. In Mode B, execute these same boundaries sequentially in the primary thread.

## Acceptance mapping

| Specification criterion | Main implementation | Required evidence |
| --- | --- | --- |
| 1. Accurate suggestions | Tasks 2, 4 | Unequal workload/location/language fixtures, deterministic paginated ranking, Admin browser checks |
| 2. Request and target acceptance | Tasks 2, 4, 5 | Route/permission tests, no pre-accept access, accepted task/team state |
| 3. Races and historical integrity | Tasks 2, 3, 5 | Replica-set races/rollback/idempotency; previous assignment and deadline retained |
| 4. Three Client panels | Task 4 | Rendered and browser tests, forms retained, existing review/PDF/execution actions |
| 5. Correct handoff messaging/privacy | Tasks 2–4 | Separate target/other-Designer/Client fixtures and DTO assertions |
| 6. Exact Client schedule | Tasks 3, 4 | Controlled-clock tests, timezone validation, Client-only CAS/idempotency |
| 7. Countdown and kickoff gates | Tasks 3, 4 | Before/after confirmation, blocked kickoff, receipt, expiry, refresh, legacy cases |
| 8. Contracts and downstream behavior | Tasks 1, 3, 5 | Registry/OpenAPI, memory/Mongo, asymmetric access, subsequent design/execution regressions |
| 9. Integrated readiness | Tasks 5–7 | Independent review, focused tests, typechecks/builds, responsive/accessibility QA, clean scoped diff |

## Execution record: 2026-11-25

### Delivered behavior and ownership

- Assignment backend: ranked active Designers by deduplicated non-completed project workload, preferred/known language match, then conservative saved location/city-text match. One pending request per project; target-only acceptance atomically updates project, estimate, Lead, deterministic task, request and audit. Cancellation/decline preserves the current assignment. Pending previews contain no contacts, pricing, files or chat access. The retired immediate assignment route returns `409 DESIGNER_ACCEPTANCE_REQUIRED`.
- Workflow backend: linked Client scheduling starts a fixed 48-hour appointment or saves the chosen future UTC instant. Both kickoffs still gate actual keys actions. Original deadlines survive reassignment; receipt stops the Designer countdown. Appointment provenance and history remain separate from pausable SLA clocks. Memory/Mongo readers and status-owner projections agree.
- Frontend: Admin suggestions and request controls; Designer acceptance/decline inbox; Client Estimation, Design flow and Execution expansion panels; accepted-Designer message, India-time scheduling and Designer appointment display. Collapsing panels retains in-progress inputs. Cross-session reads refresh and mutations invalidate affected project/assignment/workflow queries.
- Primary integration: public type contract and shared type reexports, runtime route registration, operation-specific permissions, policy version, audit vocabulary, OpenAPI schemas, tests, browser verification and local readiness. No dependency or lockfile changes.

Principal source files:

- `backend/src/contracts/designer-assignment.ts`, `domain/designer-assignment.ts`, `models/DesignerAssignmentRequest.ts`, `services/designer-assignment.service.ts`, `routes/designer-assignment.ts`, and the existing `services/project-workflow.service.ts`.
- `backend/src/services/designer-handoff.service.ts`, `services/design-workflow-state.service.ts`, `domain/design-workflow-state.ts`, project/status services, and memory/Mongo repository readers.
- `backend/src/app.ts`, `domain/authorization.ts`, `domain/route-operations.ts`, `domain/audit-actions.ts`, `repositories/types.ts`, `services/auth.service.ts`, `openapi.ts`, `openapi/designer-assignment.ts`.
- `frontend/src/features/admin/DesignAssignmentPanel.tsx`, `features/designer/DesignerAssignmentInbox.tsx`, `designerAssignmentApi.ts`, `designerHandoff.css`, `features/workflow/DesignerHandoff.tsx`, `ProjectWorkflowPanel.tsx`, and `features/client/ClientProject.tsx` / `ClientProjectPhasePanel.tsx`.
- Shared/frontend API declarations, authorization vocabulary, workflow history presentation and focused test/QA fixtures.

### Independent review and corrections

The integrity reviewer found one blocking compatibility regression: a valid legacy approved estimate without review-round history could become unschedulable after acceptance and lose Execution visibility. The corrected resolver uses the established legacy approved-baseline/version rules, including version 1, with honestly nullable historical provenance. Collaborative workflows and legacy records that do have review rounds keep strict source validation. Regression coverage includes a real Mongo request → acceptance → schedule → payment → both kickoffs → handover/receipt path, legacy versions 1/4, corrupt recorded sources, and already-approved legacy execution. Re-review found no remaining confirmed blocking defects.

Final verification also updated old integration assertions that expected the retired direct-assignment dropdown/API or omitted the new Client scheduling action. Approval, actor, privacy, source, financial and deadline assertions were retained. Browser inspection corrected a CSS ancestor mismatch so Designer metadata aligns across desktop rows and wraps on mobile.

### Final verification evidence

Commands were run from their respective workspace. The exact focused file lists are listed in Task 6 above; logs are in the task artifact directory. Final verification was performed independently after writers and review fixes settled.

| Check | Result |
| --- | --- |
| Backend assignment/domain/routes/replica suite, including existing project-workflow suites | 139 passed across 6 files |
| Backend appointment/workflow/projection/submission suite | 365 passed across 6 files |
| Backend project-status/access/team/quotation suite | 200 passed across 9 files, including independent corrected-file retries: status 13/13 and quotation 34/34 |
| Backend contracts/registry/authorization/Admin summary/Location/Language/User administration suite | 359 passed across 9 files |
| Frontend Admin, Designer, Client, workflow and authorization suite | 363 passed across 16 files, including independent Admin detail retry 37/37 |
| `cd backend && npm run typecheck && npm run build` | Passed |
| `cd frontend && npm run typecheck && npm run build` | Passed |
| `cd backend && npm test -- tests/api-docs.test.ts` | 80 passed; 1 pre-existing unrelated Mode-tier enum assertion fails at line 201 |
| `git diff --check` and whitespace scan of feature files | Passed |

Total: **1,426 focused feature/adjacent tests passed**. Including the broader API-documentation suite: **1,506 passed and one known unrelated failure**. The API-doc failure also exists in `HEAD`: its assertion expects three tiers while the existing schema includes `default`. It was not hidden or weakened. Initial sandbox socket-binding failures were rerun successfully with local-test permissions; all replica tests used isolated databases. Existing Mongoose deprecation and Vite large-chunk warnings remain. No lint script exists.

Browser verification used synthetic data through the isolated QA entry and the Playwright CLI, at 1440×1000 and 390×844:

- Admin request/cancel/search, pending disabling, missing metadata, long Designer names and final responsive metadata layout.
- Designer pending preview without project-detail requests, acceptance opening assigned work, overdue timer and receipt stopping the timer.
- Client awaiting assignment, all three panels, retained custom time across collapse and failed-save retry, India-time → UTC conversion, explicit 48-hour confirmation, and execution awaiting design approval.
- No document overflow, no application render errors, and zero axe violations in the checked Admin/Designer/Client states. Screenshots were inspected visually. The separate QA server/browser were stopped.

The existing loopback development backend was restarted via the established non-seeding `npm run dev` launcher. Health returned 200; live OpenAPI exposes Designer suggestions/decision routes, handoff schema and scheduling action; the rules service is listening. Existing local data was preserved. No real assignment, Client appointment, email or other customer action was performed.

### Artifacts and limits

- `/private/tmp/lisno-designer-handoff-20261125/`: baseline copies, incremental diff/path list, final test/build logs, synthetic browser scripts/reports/screenshots and runtime health report. Task-generated Playwright output was moved out of the repository into its `playwright-output/` directory.
- Ignored `backend/dist/`, `frontend/dist/` and normal compiler/test caches were generated by verification and are not deliverables.
- Full repository blanket suites and OCR/model tests were not run; OCR behavior was unchanged. Geographic distance is deliberately not calculated: suggestions use the approved saved-text matching rule.
- No seeds, backfills, write migrations, commits, pushes, deployments or external communications were performed. Production rollout remains outside this task. The one pre-existing API-doc test failure is the remaining verification limitation.

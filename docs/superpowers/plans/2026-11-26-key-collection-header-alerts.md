# Key-collection header countdown and alerts: task plan

Date: 2026-11-26
Status: Implemented in Mode A; local verification complete with documented preexisting test failures. No deployment or live scheduler activation.

Approved specification: [Key-collection header alerts](../specs/2026-11-26-key-collection-header-alerts-design.md). The user approved it on 2026-11-26, including notifications 30 minutes before orange and red.

## Outcome and invariants

Show the existing appointment countdown above project content, with green below 50% elapsed, orange from 50% to below 75%, and red from 75% onward. A persistent Designer reminder exposes pending red appointments across routes. The backend records advance warnings for the current associated PM and the sole active Super Admin in the existing **Project updates** inbox.

Use the saved Client confirmation/deadline and existing receipt/completion state. Preserve both kickoffs, other existing prerequisites, immutable approval/assignment evidence, and the separate stage SLA clocks. No elapsed-progress percentage, deadline reset, external messaging, new completion mutation, dependency, or destructive migration is needed.

## Dependency-ordered work

| Task | Owner and deliverable | Depends on | Acceptance criteria |
| --- | --- | --- | --- |
| T0. Baseline and integration map | Primary: capture dirty paths and per-target snapshots/diffs; confirm the current project-header and scheduler lifecycle entry points; record focused baseline results | Plan approval and execution-mode selection | AC9; safeguards for all tasks |
| T1. Freeze shared timing and identity contracts | Primary: shared DTOs, timing policy, appointment identity, feed contract, notification event payload, and invalidation/deep-link contract | T0 | AC2, AC4–AC7 |
| T2. Backend timing projection and Designer feed | Backend implementer: validate saved source, expose bounded actor-scoped reminder reads, align memory/Mongo queries, and add service/route tests | T1 | AC2–AC4, AC8 |
| T3. Durable warning scheduler | Separate backend implementer: background scheduling, PM/Super Admin resolution, transaction-safe deduplication, Project updates event projection, runtime lifecycle tests, and replica-set race tests | T1 | AC4–AC7 |
| T4. Header countdown, shell reminder, and navigation | Frontend implementer: shared timer/query presentation, project header placements, global Designer dialog, notification links, cache handling, and rendered regressions | T1 | AC1–AC4, AC7–AC8 |
| T5. Cross-layer integration | Primary: app/runtime wiring, operation/OpenAPI inventories, fixture updates, settled mutation invalidation, and review of all incremental diffs | T2–T4 | AC1–AC9 |
| T6. Integrity review | `integrity_reviewer` in Mode A; primary in Mode B: inspect integrated authorization, lineage, stale caches, scheduling, deduplication, and completion/reassignment races; resolve findings | T5 | AC2–AC8 |
| T7. Final verification and handoff | `verification_runner` in Mode A plus primary browser QA; primary in Mode B: final integrated checks, screenshots, artifact/process cleanup, and evidence record | T6 and any fixes | AC1–AC9 |

Keep only one parent phase in progress: preparation, contract, implementation, integration, review, verification. In Mode A, T2/T3/T4 can run concurrently after T1 because their writable paths are disjoint. No implementation agents start before the execution-choice gate. In Mode B, the primary implements, reviews, and verifies sequentially.

## File ownership and coordination

The repository already has substantial uncommitted work. Every writer receives its initial target diffs and is told that other agents are working in the same tree: preserve prior and concurrent edits, do not revert or reformat unrelated code, and send contract concerns to the primary.

### Primary/shared ownership

- This plan and its specification.
- `backend/src/contracts/designer-assignment.ts`, `shared/projects/designerAssignment.ts`, and a focused backend timing-policy module such as `backend/src/domain/key-collection-timing.ts` with its unit test.
- `backend/src/app.ts`, `backend/src/server.ts` if needed, canonical authorization/route-operation registries, OpenAPI integration, audit-action declarations, and their contract tests.
- `frontend/src/api/authorization-contract.ts` and related contract tests; synthetic QA transport/fixtures under `frontend/src/test/fixtures/`.
- Reconcile runtime exports, shared DTO changes, event names, query invalidation, and existing test fixtures. Do not let agents edit a shared file simultaneously.

### T2 backend projection/feed ownership

- `backend/src/services/designer-handoff.service.ts`, the appointment projection in `backend/src/domain/design-workflow-state.ts`, and a new focused reminder service/router.
- `backend/src/repositories/types.ts`, `memory.ts`, and `mongo.ts` only for the bounded appointment-candidate query and any transaction-aware adapter strictly needed by the agreed service contract.
- `backend/src/models/DesignWorkflowState.ts` only if an internal coordination field is required to serialize notification creation against workflow-state writes; never advance the public workflow version merely for a reminder.
- Related `designer-handoff-contract`, appointment, and new reminder service/route tests.

### T3 scheduler/notification ownership

- A new key-collection reminder scheduler service and its focused runtime tests.
- `backend/src/services/project-manager/workspace.ts` for the new event family's safe notification projection/list/read scope.
- `backend/src/models/ProjectManagerEvent.ts` only if strictly needed; reuse its existing unique idempotency index.
- New key-collection scheduler replica-set tests and `backend/tests/project-manager-notification-routes.test.ts`.
- No app/registry/repository/model-workflow writes. Coordinate any missing API or serialization primitive with the primary/T2 owner before use.

### T4 frontend ownership

- New focused countdown/header/reminder components and API/query helpers; existing `DesignerHandoff.tsx`, its test, `ProjectWorkflowPanel.tsx`, and `useRefreshDesignWorkflow.ts`.
- `AppShell.tsx`, narrowly necessary `WorkspaceTopbar.tsx`/shell styles, and global reminder interaction tests. Preserve the existing assignment-request chip and other toolbar actions.
- Project detail/header integrations listed below, `PMNotifications.tsx`, relevant navigation behavior, assignment invalidation, and their frontend tests.
- No backend/shared-contract/authorization-registry/QA-fixture writes. Reuse established Dialog, Button, focus, and feedback primitives. Do not add icons, gradients, flashing animation, or new dependencies for this change.

## T1 contract to implement

### Timing and appointment identity

- Extend `KeyCollectionAppointmentView` with optional backend timing metadata: stable opaque appointment identity, absolute orange/red transition times, effective advance-warning times, and current zone. Keep existing dates intact. Missing/invalid timing is explicit and never defaults to green.
- One backend helper owns the 50%/75% thresholds and 30-minute warning policy. The frontend only advances the server-adjusted clock against returned timestamps; it does not invent percentage calculations.
- Base identity on project ID, confirmed time, original deadline, and saved assignment lineage. Validate appointment history, initial approval evidence, and the currently responsible Designer before exposing an actionable obligation.
- Preserve the existing completion behavior: receipt or completed collection ends the obligation; pending Client handover remains in the normal workflow.

### Designer feed

- Proposed route: `GET /designer/key-collection-reminders`, with bounded pagination and an urgent/pending filter. Final names are fixed before writers start, without changing the approved behavior.
- Response includes `serverNow`, `urgentCount`, `nextRedAt`, paginated items, and pagination metadata. Each item contains project identity/name, appointment/timing data, and a safe workflow destination; no Client contact details or internal approval records are needed.
- `urgentCount` and `nextRedAt` cover all authorized pending obligations, not just the visible page. The shell can show the correct count and refetch at the next threshold even when that project is not on the current page. Validate/filter before pagination so invalid sources do not hide valid projects or corrupt counts.
- Reuse indexed project/assignment lookups in bounded batches, with memory/Mongo parity. All-project full workflow fetching in the browser is prohibited.
- Recheck active user, role, current Designer assignment, project access, and source validity. A pending invitation/request or previous assignment grants no access.

### Notification records and visibility

- Use `ProjectManagerEvent` with a distinct `key_collection` family and structured fields for appointment identity, target zone, transition/deadline timestamps, warning due time, and actual creation time.
- Use one deterministic event per appointment/zone/recipient. Include recipient identity in the idempotency key under a stable system actor; preserve existing `readBy` when replaying.
- **Existing Super Admin oversight sees every PM event with recipients.** For this new family, constrain list/count/read to the actual recipient even for Super Admin, otherwise separate PM and admin records would appear twice. Preserve oversight behavior for all existing event families.
- New-family notifications must revalidate current PM ownership and unique active Super Admin identity. Former managers lose access; a replacement manager can receive the current relevant warning once without generating a second admin event.
- Expose safe message details for this family to its recipients, including project name and transition time. Do not change unrelated notification descriptions.

## T2/T3 persistence, concurrency, and runtime

1. Query candidates in bounded stable batches using existing project/workflow IDs and existing indexes. No new discovery index is planned initially; do not use an unbounded `find({})` or process only the first page forever. Confirm query shape and scan bounds against representative isolated fixtures.
2. Load and validate immutable source evidence and the recorded appointment; skip absent, invalid, completed/received, closed-project, and no-longer-responsible cases.
3. In one Mongo transaction, coordinate against identity/assignment changes and workflow-state writes, reread current appointment status/recipients, select the latest eligible warning, and persist the deduplicated event/audit. A normal snapshot read alone does not serialize against concurrent receipt; verify a genuine shared write fence or add a narrow internal workflow notification epoch with T2 ownership. Do not reset dates, append fake workflow actions, or increment the Client-facing workflow version just to send a reminder.
4. Honour missing/conflicting PM ownership without losing the sole valid Super Admin notification. A missing/ambiguous Super Admin identity produces no arbitrary recipient.
5. If both warning times have passed, process the red warning only; do not later replay a stale orange warning. If only orange is due, process orange. Repeated ticks/restarts preserve this behavior. A new PM can receive the current relevant warning without changing original history.
6. Short chosen-date warning times are clamped to confirmation, and the latest relevant warning wins if both are already eligible. Render accurate wording for imminent versus already-crossed zones.
7. Runtime API: injected clock, directly testable `tick()`, idempotent `start()`, and awaited `stop()`. Use a roughly one-minute interval, no overlapping local runs, bounded batches, retry-safe uniqueness across instances, and per-project error isolation. Record safe counts and last success/failure.
8. Wire lifecycle through the existing app start/close hooks. Importing/constructing the app for tests must not start scheduler writes. Confirm shutdown waits for owned work.

No live index or data migration is included. If evidence shows an index is necessary, record its exact definition and isolated query evidence in this plan before implementation; live index creation still requires separate authorization. Existing appointments need no backfill. Run all scheduler verification against isolated fixtures, never the current development or production database.

## T4 UI integration map

| Surface | Integration requirement |
| --- | --- |
| Client `ClientProject.tsx` | Header timer remains visible above collapsed Estimation/Design flow/Execution panels; dialog routes to/open Design flow as appropriate |
| Designer `ProjectWorkspace.tsx` | Header timer; existing workflow receives a single header/inline ownership choice |
| Designer `DesignerDesignPlanTasksPage.tsx` | Selected project's header uses the correct project ID; changing selected projects cannot retain another project's timer |
| Super Admin `SuperAdminProjectDetails.tsx` and applicable older admin detail path | Header timer stays visible across details/persona/assignment views; opening key collection activates the existing design tool |
| Project Manager `ProjectManagerWorkspace.tsx` | Put timer in the outer project header even before full-detail expansion; avoid duplicating it in embedded `ExecutionWorkspace.tsx` |
| `ManagementProjectWorkspace.tsx`, `ProcurementProjectPage.tsx`, standalone `ExecutionWorkspace.tsx` | Include header timer where existing workflow-read scope exposes this handoff; preserve authorization |
| Finance/vendor-only pages without handoff access | No extra request or disclosure merely because a project status chip exists |
| Common Designer shell | Persistent red reminder/count across all workspace routes, including messaging/compact layouts; closes only when no eligible red obligation remains |
| Existing `PMNotifications.tsx` | Recognize key-collection family, show message/time, navigate to role-correct project/workflow without opening an unrelated vendor tab |

Use one actor/role/review-session/project-scoped workflow query helper for header and body so collapsing the body does not stop the header and mounting both does not duplicate independent fetches. Keep scheduling forms and their version/conflict handling intact. Extract the existing countdown formatting/clock only as needed for reuse; keep per-second rendering in the small timer subtree.

Use an explicit header-versus-inline timer option/context rather than unreliable DOM inspection. The header dialog can reuse read-only handoff facts and a workflow link. Preserve due-date display, blockers, accessible labels, focus return, keyboard behavior, and `aria-live="off"` for ticking seconds.

The global feed refetches on relevant mutations, foreground/reconnect, a bounded interval, and the returned next threshold. It must not make per-second requests. On denied access, clear stale project data/dialog state; on transient failure retain clearly labelled stale information and allow retry. On actor/review-session switches, drop the previous actor's visible state and pending responses.

## Verification matrix

- **AC1:** Client collapsed panels, Super Admin tab switches, PM outer/embedded detail, Designer selected-project changes; no duplicate countdown on one page.
- **AC2:** One millisecond before/at/after 50% and 75%; 48-hour and unequal chosen-date windows; due-now/overdue; server/client clock skew, refresh/remount, delayed timer, interval cleanup. Do not claim the header is green while timing data is unavailable.
- **AC3/AC4:** Two Designers and at least two projects with unequal deadlines; pending/rejected/previous assignment, account disablement, project closure, receipt/completion, route changes, and stale request resolution. Red reminder persists after closing its dialog and disappears after successful receipt refresh.
- **AC5/AC6:** No browser present; injected-clock warning boundaries; duplicate/concurrent ticks; second process/restart; missed windows; short windows; missing/conflicting PM; unique/ambiguous Super Admin; PM changes; transaction rollback; receipt/assignment races; event read state remains intact.
- **AC7:** Existing notification families still list/read correctly; new-family PM/admin counts are not doubled; former managers cannot read retained events; deep links open the intended project and current workflow state.
- **AC8:** Desktop 1440, tablet 1024, and mobile 390/360 widths, including long project names and multiple urgent projects. Keyboard open/close/focus, readable green/orange/red contrast, state labels independent of colour, no overflow, no continuous screen-reader announcements, and loading/error/denied/stale states.

### Commands and evidence

Start with focused tests on the files changed. Proposed new test files are created alongside their modules; list their exact names in the execution record before final verification.

Backend regression minimum from `backend/`:

```sh
npm test -- tests/key-collection-appointment.test.ts tests/designer-handoff-contract.test.ts tests/key-collection-appointment-mongo.replica-set.test.ts tests/project-manager-notification-routes.test.ts
npm test -- tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts tests/server.test.ts
npm run typecheck
npm run build
```

Additionally run the new timing-policy, reminder-service/route, scheduler-runtime, and scheduler replica-set suites. Preserve replica-set transactions and use the existing `tests/helpers/mongo-replica-set.ts` fixture pattern. Run existing assignment/project-scope regressions if those shared source paths change.

Frontend regression minimum from `frontend/`:

```sh
npm test -- src/features/workflow/DesignerHandoff.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/components/layout/AppShell.test.tsx src/features/project-manager/PMNotifications.test.tsx
npm test -- src/features/client/ClientProject.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/features/designer/ProjectWorkspace.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/execution/ExecutionWorkspace.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx
npm run typecheck
npm run build
```

Additionally run new header/reminder/query tests and directly affected Procurement/authorization/fixture tests. Use existing synthetic browser transport with controlled clocks for colour changes and local fixtures for all notification actions. Do not wait for real 24/36-hour thresholds or confirm a real Client appointment.

Broaden to additional suites when the integrated diff, review findings, or test failures justify them. Do not rerun green checks after documentation-only changes. There is no repository lint script. Finish with `git diff --check`, final `git status --short`, and baseline comparison. Report existing warnings separately from newly introduced issues.

## Handoff, cleanup, and rollback

Record exact check counts/results, failed checks and fixes, unrun checks, screenshots/log paths, and remaining limitations. Stop only owned QA processes and keep temporary browser/build outputs ignored or outside the repository. No commit, push, deployment, production scheduler activation, live index change, seed/backfill, or real notification creation is authorized by the implementation plan.

Rollback removes the new header/feed/scheduler integration while preserving existing appointment history and recorded notifications. No deadline rewrite or record deletion is needed. Preserve all unrelated dirty work throughout.

## Execution record

- Specification approved on 2026-11-26.
- Task plan approved; user selected Mode A.
- Baseline captured at `/private/tmp/lisno-key-alerts-20261126/`: 4,652 file hashes, target-source snapshots, initial status, and per-target Git diff.
- Independent backend audits confirmed the existing authorization coordination write fence serializes workflow receipt, Designer assignment, and PM assignment. No new workflow epoch, public version update, index, or migration is needed for scheduler coordination.
- Shared timing/DTO contract established. Backend feed, scheduler, and frontend integration writers own separate paths as above.
- Runtime rollout follows the existing reminder convention: `KEY_COLLECTION_REMINDERS_ENABLED=false` by default, set to true in the intended deployed environment to start durable notification creation. Header timing and authorized reminder reads work independently. Verification will explicitly enable the scheduler only against isolated test data; no current database or environment flag is changed.

### Integrated outcome

- Backend timing derives immutable 50%/75% transition timestamps from the saved appointment window. The original deadline survives valid Designer reassignment; reminders move to the current owner.
- The Designer feed validates current identity, assignment, approval lineage, receipt/completion and project state before returning paginated obligations. Global urgent count and the next red transition cover all matching projects.
- The scheduler reuses authorization and project transaction fences, resolves the current PM and sole active Super Admin, and records recipient-specific Project updates with atomic audit entries. Repeated/concurrent ticks, restarts, late windows, recipient changes, clock rollback and receipt races are covered. It logs only safe counts, timestamps and failure codes.
- Header timers share the actor/project/review-session workflow query with the body. Client, Designer, Super Admin, PM, management, Procurement, standalone Execution and converted Lead detail hosts use one header countdown. The Designer shell reminder remains visible across routes and while its next page loads.
- Integrity review found and resolved two cache issues: selected Designer upload eligibility used an old query key; denied cached data could reappear after a later transient error. The final review found no outstanding confirmed defect.
- No dependencies, schema/index changes, backfill, live database changes, external messaging, commit, push or deployment were performed.

### Browser verification

Synthetic transport only, served on owned port 5189; no real appointment was confirmed or notification sent.

- Client green at 1440px, orange at 1024px and red at 390px: one header timer, no horizontal overflow, render errors or unexpected requests.
- Collapsing Design flow leaves the header timer visible. Header dialog supports Escape and returns focus to its trigger. Open key collection expands Design flow and selects Key Collection. Dialog axe scan: zero violations.
- Live boundary: green at `24:00:05 remaining` changed to orange at `24:00:00 remaining`; workflow request count stayed at one.
- Designer at 360px: red reminder persisted on dashboard, Design plans, project messages and project detail. Multiple-project dialog had no overflow; closing it retained the chip. Dialog axe scan: zero violations.
- Super Admin: one timer remained across Client persona, Assignments and Project details; the link opened the Design workflow Key Collection stage.
- PM: one timer in compact view; its link opened `detail=1` and Key Collection with one header timer, no overflow/errors/unexpected requests.
- Existing axe asset-preload warnings occurred during scans; no application console error was found in the successful scenarios. Two initial QA attempts used the wrong synthetic display name/project fixture; reruns used the registered fixtures and passed.
- Screenshots and browser logs: `/private/tmp/lisno-key-alerts-20261126/`. The owned browser session and port-5189 preview were stopped. Unrelated running services were left intact.

### Known baseline test failures

- Backend: four existing Gemini/provider configuration assertions and one existing OpenAPI ModeTier enum assertion fail unchanged. A run against the captured baseline reproduced the same five failures. Evidence: `verification/preexisting-failures.log` (at the task artifact root).
- Frontend enterprise transport: seven existing fixture assertions fail unchanged (three PM Living & dining cases, recommendation dialog, PMC pricing selector, two duplicate Procurement project articles). Baseline: 69 passed/7 failed; current: 70 passed/7 failed. The added key-collection fixture test passes. Evidence: `verification/baseline-fixture-tests.log` and `verification/fixture-tests.log`.
- Full repository suites and lint were not run. There is no repository lint script. Focused integrated suites, typechecks/builds and rendered QA were used; final command evidence is recorded below.

### Final executed checks

From `backend/`, **72 passed; exit 0**. Log: `final-backend-focused.log`.

```sh
npm test -- tests/key-collection-timing.test.ts tests/key-collection-reminders.test.ts tests/key-collection-reminders-routes.test.ts tests/key-collection-reminder-scheduler.test.ts tests/key-collection-reminder-scheduler.replica-set.test.ts tests/key-collection-appointment.test.ts tests/key-collection-appointment-mongo.replica-set.test.ts tests/designer-handoff-contract.test.ts tests/project-manager-notification-routes.test.ts
```

From `backend/`, **299 passed, 5 proven preexisting failures; exit 1**. Log: `final-backend-contracts.log`.

```sh
npm test -- tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts tests/server.test.ts tests/config.test.ts
```

From `frontend/`, **399 passed, 8 failed initially: 7 proven preexisting failures and the permission-count assertion corrected below; exit 1**. Log: `final-frontend-focused.log`.

```sh
npm test -- src/features/workflow/KeyCollectionTimer.test.tsx src/features/workflow/KeyCollectionHeader.test.tsx src/features/workflow/DesignerHandoff.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/designer/KeyCollectionReminder.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/project-manager/PMNotifications.test.tsx src/components/layout/AppShell.test.tsx src/features/leads/LeadDetail.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientProjectPhasePanel.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/features/designer/ProjectWorkspace.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/execution/ExecutionWorkspace.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/projects/ProjectPageStatusHeaders.test.tsx src/api/authorization-contract.test.ts src/test/fixtures/enterpriseTransport.test.tsx
```

From `frontend/`, **16 passed after permission-count and pagination corrections; exit 0**. Log: `final-frontend-corrections.log`.

```sh
npm test -- src/features/designer/KeyCollectionReminder.test.tsx src/api/authorization-contract.test.ts
```

In both `backend/` and `frontend/`, `npm run typecheck` and `npm run build` passed on the final product sources. Backend checks were repeated after the final safe logging hookup; frontend checks ran after the pagination fix. `git diff --check` passed and final status was captured. Warnings: existing Mongoose deprecated `new` option and Vite chunks above 500 kB. Builds produced ignored `backend/dist` and `frontend/dist`; no runtime artifact was staged.

### Local runtime follow-up: Timing unavailable

The reported Client header was receiving the old API shape. The local backend process had started on 2026-11-25; its public OpenAPI response lacked both the reminder route and timing schema while current source/build contained them. No serialization defect or missing saved appointment was found.

Restarted the existing local `npm run dev` supervisor with its unchanged backend/assistant/OCR launcher. This launcher skips account provisioning. No source fix, environment edit, seed, migration, or scheduler activation was required. The restarted API exposes the new route and timing schema. A read-only local lookup using the canonical project number and current handoff projector confirmed `scheduled`, valid timing, orange zone, and approximately 22.16 hours remaining. Automatic model/index creation was disabled for that diagnostic connection. The replacement local stack remains running for the user.

### Header chip refinement

The user requested a compact chip for the existing header timer. Updated only `KeyCollectionTimer.tsx`, `KeyCollectionHeader.tsx` and `keyCollection.css`: the header has a one-row rounded chip, status wording and ticking clock, while its existing popup retains the detailed countdown. Backend timing, thresholds and notifications are unchanged. The button retains a 44px interaction target around the 36px chip.

Verification: `npm test -- src/features/workflow/KeyCollectionTimer.test.tsx src/features/workflow/KeyCollectionHeader.test.tsx` passed 10/10; frontend `npm run typecheck` and `npm run build` passed. Read-only review found no defect. Browser checks at 1440px green, 1024px orange and 360px red found no overflow or render error; popup keyboard/focus behavior passed and axe found zero dialog violations. `git diff --check` passed. Snapshots, logs and screenshots are outside the repository at `/private/tmp/lisno-timer-chip-before/`; the owned browser and temporary preview were stopped.

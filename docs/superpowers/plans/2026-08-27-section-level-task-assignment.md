# Section-Level Task Assignment — Task Plan

## Approved source

- Specification: `docs/superpowers/specs/2026-08-27-section-level-task-assignment-design.md`

## Parent outcome

Deliver one clean, nested Super Admin assignment panel per project and one authoritative assignment control per selected Estimate section, backed by atomic section-wide reassignment while preserving item-level execution tasks and history.

## Ownership boundaries

- **Primary integrator**
  - Owns the approved cross-layer contract, interpretation, shared-query reconciliation, final diff review, and plan status.
  - Must capture the initial dirty-path set and relevant target diffs before writers start.
- **Backend owner**
  - Owns `backend/src/domain/project-workflow.ts`, the section-assignment service/aggregation slice in `backend/src/services/project-workflow.service.ts`, project-workflow routes, authorization registry/OpenAPI/audit additions, and backend tests.
  - Must not edit frontend files or unrelated workflow behavior.
- **Frontend owner**
  - Owns frontend section-assignment types/API/query keys, `WorkerAssignmentPanel.tsx`, its tests, the two shared-consumer tests, and bounded assignment-panel CSS.
  - Must not edit backend files or unrelated Admin/Finance presentation.
- **Integrity reviewer**
  - Read-only review after both writers finish; focuses on authorization, project/estimate/section lineage, CAS, audit, aggregation, partial-write risk, shared consumers, and accessibility.
- **Verification runner**
  - Read-only final verification after review findings are resolved.

## Dependency-ordered task graph

### Task 1 — Freeze the section-assignment contract and baseline

Owner: Primary integrator.

Dependencies: approved specification.

Work:

- Capture `git status --short` and relevant existing diffs before assignment.
- Confirm the exact DTO/request/error names from the approved specification.
- Confirm the current task queries that must continue returning item-level tasks.
- Publish the immutable implementation contract to both writers:
  - grouping key;
  - revision calculation inputs;
  - aggregation rules;
  - mutation scope;
  - error codes;
  - query invalidation set;
  - no-migration boundary.

Acceptance criteria: establishes the shared inputs for AC 2, 5, 7–11.

Stop/report condition: any existing target diff that cannot safely be preserved or any evidence that tasks lack stable section IDs/versions.

### Task 2 — Implement backend section aggregation and contract

Owner: Backend implementer.

Dependencies: Task 1 contract.

Affected areas:

- `backend/src/domain/project-workflow.ts`
- `backend/src/services/project-workflow.service.ts`
- `backend/src/routes/project-workflow.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/domain/authorization.ts` only if the existing permission cannot be safely reused
- `backend/src/domain/audit-actions.ts`
- `backend/src/openapi.ts`
- relevant backend route/service/domain tests and fixtures

Work:

1. Add a pure section-aggregation function over current `trade_execution` tasks.
2. Validate exact project, Estimate, Design version, section ID, unique task identity, and one required role per group.
3. Derive stable opaque identity, section label, assigned/unassigned/mixed state, weighted progress, aggregate status, task counts, updated time, and deterministic opaque revision.
4. Add Super Admin-only section-assignment listing.
5. Add strict section-assignment override input and route.
6. In one replica-set transaction:
   - re-read exact membership;
   - compare revision;
   - validate active role-compatible worker;
   - preserve completed task assignment history;
   - update every unfinished member or none;
   - increment changed member versions;
   - return an idempotent no-op without duplicate audit;
   - append one sanitized section-level audit event for a real change.
7. Keep existing task list/progress/single-task APIs compatible.
8. Synchronize route-operation registry and OpenAPI inventory.

Acceptance criteria covered: AC 4–9, 11, 13.

Focused verification:

- Domain aggregation unit tests.
- Project-workflow route tests.
- Replica-set service tests for multi-member transaction/CAS/audit.
- Backend typecheck after the slice stabilizes.

Stop/report conditions:

- Mixed roles within one stable section.
- Missing section IDs or duplicate stable member identities.
- A transaction design that could update only part of a section.
- Any need for schema migration or destructive data change.

### Task 3 — Implement frontend API/types and nested Task assignment UX

Owner: Frontend implementer.

Dependencies: Task 1 contract; may run in parallel with Task 2 because file ownership does not overlap.

Affected areas:

- `frontend/src/api/types.ts`
- `frontend/src/features/workflow/projectWorkflowApi.ts`
- `frontend/src/features/admin/WorkerAssignmentPanel.tsx`
- `frontend/src/features/admin/WorkerAssignmentPanel.test.tsx`
- bounded assignment-panel selectors in `frontend/src/styles/access-administration.css` or the established owning stylesheet
- `frontend/src/features/admin/AdminProjectDetailPage.test.tsx`
- `frontend/src/features/finance/FinanceProjectWorkflowControl.test.tsx`

Work:

1. Add the section-assignment type, query key/API request, and mutation request matching Task 1 exactly.
2. Redesign the shared panel as one outer **Task assignment** disclosure, closed by default.
3. Preserve a compact, separate Project coordination area for Procurement assignment and Finance/Site progress.
4. Render one nested closed-by-default disclosure per section assignment; never render line-item assignment rows.
5. Show section label, assignment state/person, aggregate status, progress, task counts, and expanded assignment controls.
6. Handle assigned, unassigned, mixed, completed, loading, empty, error, stale, pending, and success states.
7. Filter dropdown candidates to the backend-required role and retain explicit save/unassign behavior.
8. On success, update/invalidate section assignments plus project/operational workflow queries.
9. On stale revision, announce the conflict, refetch the section assignment, and avoid false success.
10. Preserve keyboard focus, accessible names/relationships, heading order, responsive stacking, reduced motion, and existing shared-consumer behavior.

Acceptance criteria covered: AC 1–4, 7, 10–12.

Focused verification:

- Rendered interaction tests for outer and nested disclosures.
- Assigned/unassigned/mixed/completed mutation states.
- Exact request and invalidation assertions.
- Collapsed/expanded axe checks.
- Shared Admin-project and Finance-workflow consumer tests.
- Frontend typecheck after the slice stabilizes.

Stop/report conditions:

- Any need to issue repeated single-task mutation calls.
- Any invented client-side aggregate progress or assignment source that differs from the backend DTO.
- Any loss of current Procurement coordinator assignment or Finance/Site progress.

### Task 4 — Integrate backend and frontend contracts

Owner: Primary integrator.

Dependencies: Tasks 2 and 3 complete.

Work:

- Compare frontend types/request fields/error handling against the implemented backend route/OpenAPI contract.
- Reconcile exact route names, revision format, assignment-state semantics, labels, and response fields.
- Inspect all affected query invalidations and both shared component consumers.
- Run focused backend and frontend suites only after both writers are finished.
- Resolve transient contract/test mismatches without weakening authorization, CAS, lineage, audit, or accessibility.

Acceptance criteria covered: all, especially AC 5, 8, 10–13.

### Task 5 — Integrity review

Owner: `integrity_reviewer`.

Dependencies: integrated writers and focused checks green.

Review matrix:

- Super Admin authorization remains operation-specific and backend-enforced.
- Section identity is stable and never label-joined.
- Membership is exact for project, Estimate, Design version, and section.
- One role and one current assignment are enforced.
- Completed history cannot be rewritten.
- Mixed legacy assignments are explicit and reconcilable.
- Revision changes for membership, progress, version, or assignment changes.
- No-op behavior is idempotent; real changes produce one sanitized audit event.
- Transactions cannot partially update a section.
- Coordination controls remain functional.
- Nested disclosures, responsive behavior, focus, and accessible hierarchy are correct.

Output: findings by severity with file/line evidence and a ready/not-ready verdict. No edits.

### Task 6 — Resolve confirmed review findings

Owner: corresponding backend/frontend writer, with primary integrator reconciliation.

Dependencies: Task 5.

Work:

- Fix every confirmed P0–P2 issue and relevant P3 regression gap.
- Add focused regression coverage for each fix.
- Rerun the affected focused checks.

### Task 7 — Final verification

Owner: `verification_runner`.

Dependencies: review ready and all writers idle.

Exact checks:

1. Backend focused domain/route/replica-set tests for project workflow and section assignment.
2. `cd backend && npm run typecheck`
3. Proportional backend broader suite and `npm run build` because route/OpenAPI/audit contracts change.
4. Frontend focused WorkerAssignmentPanel, AdminProjectDetailPage, and FinanceProjectWorkflowControl tests.
5. `cd frontend && npm run typecheck`
6. Proportional frontend broader suite and `npm run build` because a shared Super Admin component changes.
7. Rendered desktop/mobile, loading/empty/error, assigned/unassigned/mixed/completed, collapsed/expanded, keyboard/focus, and accessibility scenarios.
8. `git diff --check`
9. `git status --short`

Output: exact commands, test counts, warnings, unrun checks, and final verdict. No edits.

## Safe parallelism

- Tasks 2 and 3 may run in parallel only after Task 1 freezes the contract; their filesystem ownership does not overlap.
- Backend and frontend writers may run their own focused tests, but final verification waits for the integrated worktree.
- Integrity review and verification are sequential and read-only.
- No migration/backfill writer is needed or authorized.

## Acceptance-criteria traceability

| Acceptance criterion | Primary task(s) | Verification |
|---|---|---|
| AC 1–3 nested collapsed panels, one per section | 3 | Frontend interactions + axe |
| AC 4 assignment/status/progress content | 2, 3 | DTO unit tests + rendered tests |
| AC 5 atomic exact-section reassignment | 2 | Replica-set transaction tests |
| AC 6 completed history immutable | 2, 3 | Replica-set + disabled UI test |
| AC 7 existing/mixed projects without migration | 2, 3 | Asymmetric legacy fixture |
| AC 8 fail-closed validation/authorization/CAS | 2 | Route + replica-set matrix |
| AC 9 sanitized single audit | 2 | Audit commit/rollback/no-op tests |
| AC 10 coordination preserved | 3 | WorkerAssignmentPanel shared tests |
| AC 11 both Super Admin consumers consistent | 3, 4 | Admin + Finance consumer tests |
| AC 12 professional responsive accessible UX | 3, 5, 7 | viewport/state matrix + axe/focus |
| AC 13 verification and hygiene | 7 | exact command evidence |

## External actions explicitly excluded

- No production mutation, migration, backfill, seed, deployment, staging, commit, push, or customer communication.

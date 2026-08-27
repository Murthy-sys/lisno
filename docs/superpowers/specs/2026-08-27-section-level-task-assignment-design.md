# Section-Level Task Assignment — Specification

## 1. Decision summary

### Requested outcome

Replace the repeated line-item assignment rows in Super Admin → All Projects → project detail with a clean nested Task assignment experience:

- one outer **Task assignment** expansion panel;
- one nested expansion panel for each selected main Estimate section, such as Carpentry, Painting, Electrical, or Plumbing;
- one active assignee per section;
- assigned person, reassignment control, status, and progress within the section panel;
- no repeated assignment rows for individual Estimate items.

### Recommended approach

Keep item-level `trade_execution` tasks as the execution/progress source of truth, but add a backend-derived section-assignment contract that groups them by stable `sourceSectionId`. A section reassignment updates every unfinished item task in that section atomically in one Mongo transaction.

This approach is recommended because it:

- removes duplicates from the Super Admin assignment experience immediately for existing and future projects;
- enforces one active worker for the whole section rather than relying on unsafe frontend-only repeated requests;
- retains item-level worker tasks, progress, deadlines, KPI lineage, and audit history;
- requires no destructive consolidation, deletion, or production data migration.

### Decisions fixed by the request and architecture

- Assignment grouping uses stable section IDs, never display labels.
- Only Super Admin can assign or reassign section work.
- Backend authorization and optimistic concurrency remain authoritative.
- Completed item-task history is immutable; reassignment affects unfinished tasks only.
- Existing Procurement coordinator, Finance, and Site Management visibility must not be lost.

## 2. Current-state evidence

### User-visible behavior

- `WorkerAssignmentPanel.tsx` renders every `trade_execution` task as its own assignment row.
- A project with several Carpentry Estimate items therefore shows several Carpentry assignment rows, often with the same role and different room/item titles.
- Each row has its own worker dropdown, status, and progress, so the same section can be assigned inconsistently to multiple workers.

### Traced execution and data path

- `projectWorkflowBlueprints` in `backend/src/domain/project-workflow.ts` creates one `trade_execution` blueprint for every included approved Estimate line.
- The dedupe key is line-item-specific, so these are distinct item tasks rather than accidental duplicate database inserts.
- Every item task carries `projectId`, `estimateId`, `designPlanVersion`, `sourceSectionId`, `sourceLineItemKey`, `assigneeRole`, assignee, status, progress, and version.
- `POST /execution/worker-assignments/override` mutates only one task at a time with version/CAS and audit protection.
- The same `WorkerAssignmentPanel` is consumed by the Super Admin project detail and the Super Admin Finance workflow view.

### Confirmed root cause

The assignment UI exposes item execution granularity where the product requires section assignment granularity. Grouping only in the frontend would hide repetition but would not enforce one assignee or atomic reassignment across the underlying tasks.

### Current test gap

Existing tests verify one-task reassignment and role filtering. They do not verify section grouping, mixed legacy assignees, atomic multi-task reassignment, aggregate progress, nested disclosures, or concurrency for a whole section.

## 3. Product specification

### Goal

For every Design-approved project, Super Admin can scan and manage exactly one assignment control per selected Estimate section, with consistent assignee, status, and progress.

### Actor and job

- **Super Admin:** review section staffing, assign/reassign/unassign one eligible person for all unfinished work in the section, and monitor aggregate completion.
- Other roles receive no new assignment permission.

### Scope

- Super Admin project detail reached from All Projects.
- The shared Super Admin assignment component when rendered in the Finance workflow view.
- Backend section-assignment read and mutation contracts.
- Section aggregation, authorization, audit, version/CAS, cache invalidation, responsive layout, keyboard behavior, and regression coverage.

### Non-goals

- Do not delete, merge, or rewrite existing item-level workflow tasks.
- Do not change worker item-task queues, item progress updates, KPI/deadline derivation, Procurement purchasing, or Finance calculations.
- Do not reassign completed item tasks or rewrite their assignee history.
- Do not run a migration, backfill, deployment, seed, commit, or production mutation.

### Happy path

1. Super Admin opens a Design-approved project from All Projects.
2. The **Task assignment** panel is initially collapsed.
3. Expanding it shows compact project-coordination information and one collapsed panel per selected section.
4. A section trigger shows its section label, assignment state, aggregate status, and progress summary.
5. Expanding a section shows the assigned person's name/email or “Unassigned,” a role-filtered assignment dropdown, an explicit Assign/Reassign/Unassign button, a status badge, and progress bar.
6. Super Admin chooses a worker and saves.
7. The backend verifies the section membership and revision, then atomically updates every unfinished item task in that section.
8. The UI refreshes section assignments, project workflow tasks, and operational task queries and announces success.

### State and action behavior

- **Outer panel:** closed by default; opening it must not automatically open a section.
- **Section panels:** independently expandable and closed by default.
- **Unassigned:** show “Unassigned”; eligible worker selection enabled.
- **Assigned:** show current person's name and email; dropdown supports reassignment or unassignment.
- **Mixed legacy assignment:** show “Multiple assignees”; no person is implied. Super Admin must select one worker or Unassigned to reconcile every unfinished member task atomically.
- **Open:** no member task has begun.
- **In progress:** any member task has begun or completed while the section is not fully complete.
- **Completed:** every member task is completed; controls are disabled and historical assignments are not rewritten.
- **Stale revision/member conflict:** show a conflict message, refresh the section data, and retain no false success state.
- **No selected trade sections:** show a compact empty state inside Task assignment.
- **Loading/error/retry:** remain inside the expanded outer panel without losing the project page.

### Aggregate progress

- Backend derives section progress across all item tasks using `plannedEffort` as the weight when it is a finite positive value; a missing/invalid legacy effort uses weight `1`.
- Completed tasks contribute 100%; other tasks contribute their stored integer progress.
- The result is rounded to the nearest whole percent and clamped to `0–100`.

### Acceptance criteria

1. The project page contains one outer panel titled **Task assignment**, collapsed by default.
2. Expanding it shows exactly one nested panel per stable selected trade section; repeated item rows are not rendered.
3. Every nested section panel is collapsed by default and expands independently.
4. A section panel shows assigned person name/email or an explicit Unassigned/Multiple assignees state, a role-filtered dropdown, explicit save action, status badge, and progress bar.
5. One section reassignment atomically updates all and only unfinished member tasks for the same project, estimate, Design-plan version, and section.
6. Completed item tasks are never reassigned; a fully completed section disables assignment controls.
7. Existing mixed/unassigned item tasks are grouped without migration and can be reconciled through one section action.
8. Backend rejects stale membership/revisions, cross-project or cross-estimate lineage, mixed required roles, invalid/inactive workers, and unauthorized actors without partial writes.
9. A single sanitized audit event records the section assignment change and affected task count without exposing unnecessary personal data.
10. Procurement coordinator assignment and Finance/Site progress remain available in a visually separate compact coordination area.
11. Both Super Admin consumers of the shared panel remain consistent; no new assignment UI appears for unauthorized roles.
12. Nested panels support keyboard operation, stable accessible names/relationships, correct heading order, focus retention, responsive mobile layout, reduced motion, and collapsed/expanded accessibility checks.
13. Focused backend replica-set/route tests, frontend rendered tests, typechecks, builds, and repository hygiene checks pass.

## 4. Contract and invariants

### Section-assignment response

Add a backend-owned `ProjectWorkflowSectionAssignment` shape with:

- `id`: stable opaque section-assignment identity;
- `projectId`, `projectName`;
- `estimateId`, `designPlanVersion`;
- `sourceSectionId`, `sectionLabel`;
- `assigneeRole`;
- `assignedWorker` or `null`;
- `assignmentState`: `unassigned | assigned | mixed`;
- `status`: `open | in_progress | completed`;
- `progress`: integer `0–100`;
- `taskCount` and `unfinishedTaskCount`;
- `revision`: opaque deterministic revision of exact member task IDs and versions;
- `updatedAt`.

Names and labels are presentation only. Grouping and mutations use project, estimate, Design-plan version, and `sourceSectionId`.

### Read API

- Add `GET /admin/projects/:projectId/section-assignments`.
- Super Admin only, using an explicit route operation and the existing execution-worker assignment permission boundary.
- Derive from current stored `trade_execution` tasks and fail closed on missing section IDs, duplicate member identities, mixed required roles, or mismatched project/estimate/version lineage.
- Sort by canonical section label and stable section ID.

### Mutation API

- Add `POST /execution/section-worker-assignments/override` with strict body:
  - `projectId`;
  - `estimateId`;
  - `designPlanVersion`;
  - `sourceSectionId`;
  - `expectedRevision`;
  - `workerId: string | null`.
- Re-read the complete section membership in a Mongo transaction and compare the exact deterministic revision before writes.
- Validate the worker is active and has the one role required by all section tasks.
- Update all unfinished member tasks in one transaction, incrementing every changed task version.
- Treat a no-op selection as an idempotent success without audit duplication.
- Return the newly derived section assignment.

### Revision and concurrency

- Revision is computed from a canonical sort of stable member task IDs and their versions; it is opaque to clients.
- Any member addition, removal, progress/version update, or concurrent assignment changes the revision and causes `WORKFLOW_SECTION_ASSIGNMENT_STALE`.
- No partial member update may commit.

### Audit

- Add a section-level audit action.
- Record actor, project/estimate/Design version, section ID, old assignment state/worker IDs, new worker ID, affected unfinished-task count, and revision transition.
- Do not record worker email, display name, or Estimate content.

### Permission matrix

| Operation | Super Admin | Other roles |
|---|---:|---:|
| List section assignments | Allowed | Forbidden/not routed |
| Assign/reassign/unassign section | Allowed | Forbidden |
| View coordination/progress through existing authorized screens | Existing behavior | Existing behavior |

### Cache invalidation

After a successful section mutation invalidate/update:

- section assignments for the project;
- existing project workflow-task query;
- operational workflow-task queries;
- affected Admin project/workflow summaries that display assignment counts.

## 5. UX and content

### Information hierarchy

1. Outer **Task assignment** disclosure with overall assigned-section count.
2. Compact **Project coordination** area retaining Procurement assignment plus Finance/Site status.
3. **Work sections** list with one nested disclosure per selected main Estimate section.
4. Expanded section details: assignee → reassignment control → status/progress → feedback.

### Labels

- Outer title: `Task assignment`
- Coordination label: `Project coordination`
- Section assignee labels: `Assigned person`, `Unassigned`, `Multiple assignees`
- Dropdown: `Assign or reassign <Section label>`
- Actions: `Assign person`, `Reassign person`, `Unassign person`
- Progress: `<Section label>: <N>% complete`

### Responsive and accessibility requirements

- Desktop section trigger uses a compact label/assignee/status/progress summary.
- Mobile stacks metadata and controls without horizontal scrolling.
- Use native buttons with `aria-expanded` and `aria-controls`; collapsed content is not rendered.
- Maintain `h2 → h3 → h4` hierarchy across outer/coordination/section content.
- Preserve trigger focus after expand/collapse and return focus after mutation dialogs if any.
- Use icon rotation plus text/state, never color alone; respect reduced-motion preference.

## 6. Options and tradeoffs

### Option A — Derived section assignments with atomic bulk mutation (recommended)

- Preserves item-level execution/KPI history and works with all existing projects without migration.
- Adds a section DTO and mutation contract plus aggregation logic.
- Correctly enforces one active assignee and transactional consistency.

### Option B — Replace item tasks with one stored task per section

- Simpler assignment record after conversion.
- Requires a destructive/high-risk migration, conflict policy for different existing assignees/progress, and changes to worker execution/KPI granularity.
- Rejected because it risks losing item-level status and history.

### Option C — Frontend grouping with repeated single-task mutations

- Smallest code change.
- Can partially reassign a section on network, validation, or concurrency failure and cannot provide one authoritative progress/revision.
- Rejected because it violates atomicity and one-person-per-section correctness.

## 7. Compatibility and operations

- Existing item-task read/update APIs remain compatible for worker queues and workflow snapshots.
- Existing single-task Super Admin override remains available for current internal consumers until separately deprecated; the redesigned panel uses only the section endpoint for trades.
- No schema migration or backfill is needed because existing tasks already carry stable section IDs and versions.
- Rollback is code-only: remove the new UI/route usage; stored item tasks remain valid.
- No external messages, files, finance writes, or production effects are introduced.
- Malformed legacy section groups fail closed with a retryable/supportable conflict rather than choosing an arbitrary person.

## 8. Risks

- Mixed existing assignments require explicit reconciliation and must not be silently attributed to one worker.
- Concurrent progress updates can stale a section assignment revision; the UI must refresh and require a new confirmation rather than overwrite.
- Reassigning only unfinished tasks can produce historical multiple-worker completion; copy must distinguish current assignment from completed history.
- Shared component changes can regress the Finance workflow consumer if it is not tested alongside All Projects.
- Nested disclosures can produce duplicate landmarks or heading-order failures without explicit accessibility coverage.

## 9. Verification expectations

- Domain aggregation unit tests with at least two unequal sections and multiple item tasks.
- Replica-set tests for atomic multi-task assignment, mixed legacy assignments, no-op idempotency, stale revision caused by concurrent progress, completed-task immutability, invalid worker role, and audit rollback.
- Route/authorization/OpenAPI registry tests for both new endpoints.
- Frontend tests for default collapse, one panel per section, no duplicate item rows, assigned/unassigned/mixed states, role-filtered dropdown, success/stale/error states, query invalidation, responsive render, keyboard focus, and axe in collapsed/expanded states.
- Shared-consumer tests for Admin project detail and Finance workflow view.
- Backend/frontend typechecks, focused and proportional broader suites, production builds, `git diff --check`, and `git status --short`.

## 10. Open decisions

- None. The recommended derived-section approach satisfies the requested UI and assignment invariant without destructive data changes.

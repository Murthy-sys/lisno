# Final Role Workflow Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining designer structure controls, derived project reporting, bounded organization reads, and nested head project visibility.

**Architecture:** Keep Mongo/memory repositories as the persistence boundary and derive project/floor summaries in services from task records so caller-owned progress cannot become stale. Add page-bounded organization and client-summary endpoints, batch task/event reads, and have React clients explicitly traverse pages or expose load-more controls. Reuse the existing REST authorization and query invalidation patterns.

**Tech Stack:** TypeScript, Express, Zod, Mongoose, React, TanStack Query, Vitest, Supertest, Testing Library.

## Global Constraints

- The backend remains the authorization boundary for every role and entity.
- List endpoints use pagination and explicit filters.
- Project and floor progress/status are derived from task state and planned-effort weighting.
- Client responses exclude staff assignments, internal tasks/notes, KPI details, evaluations, and organization data.
- Mutations use server-owned timestamps and preserve append-only task/evaluation/audit history.
- Do not modify `reference_docs/`.

---

### Task 1: Derived project reporting and client summaries

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/project.service.ts`
- Modify: `backend/src/routes/projects.ts`
- Test: `backend/tests/workflows.test.ts`
- Test: `backend/tests/repository.test.ts`

**Interfaces:**
- Produces: batched `listFloorsForProjectIds` and `listTasksForProjectIds` repository reads.
- Produces: paginated `GET /api/v1/client/project-summaries`.
- Produces: derived project status/progress and derived floor progress.

- [ ] Write failing repository and workflow tests for effort-weighted progress, status transitions, ignored/rejected caller floor progress, client redaction, and pagination beyond one page.
- [ ] Run the focused tests and confirm failures are caused by missing derived summary behavior.
- [ ] Add the minimal batched repository reads and project-service derivation.
- [ ] Add the client summary route and return a paginated envelope.
- [ ] Re-run focused tests until green.

### Task 2: Bounded organization hierarchy with nested projects

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/hierarchy.service.ts`
- Modify: `backend/src/routes/organization.ts`
- Test: `backend/tests/workflows.test.ts`

**Interfaces:**
- Produces: paginated manager-team and head-tree envelopes.
- Produces: manager nodes whose designer summaries retain accessible project lists.
- Consumes: batched task/project/event reads from Task 1.

- [ ] Write failing tests with more than the default page size of direct reports/managers and assert page metadata plus nested designer projects.
- [ ] Run the focused tests and confirm the existing unbounded array response fails.
- [ ] Page users/managers before summary expansion and batch task/event reads for each page.
- [ ] Re-run focused hierarchy tests until green.

### Task 3: Designer project structure controls and client dashboard

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/designer/designerApi.ts`
- Create: `frontend/src/features/designer/ProjectStructureDialog.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.tsx`
- Modify: `frontend/src/features/client/clientApi.ts`
- Modify: `frontend/src/features/client/ClientDashboard.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/designer/ProjectWorkspace.test.tsx`
- Test: `frontend/src/features/client/ClientDashboard.test.tsx`

**Interfaces:**
- Consumes: existing floor/stage/task creation routes.
- Consumes: paginated client summary endpoint from Task 1.
- Produces: keyboard-accessible labeled floor, stage, and task forms with project-query refresh.

- [ ] Write failing workspace tests that create a floor, stage, and task through labeled dialog controls.
- [ ] Write a failing client dashboard test for server-derived progress and floor count.
- [ ] Run focused frontend tests and confirm failures are from missing controls/summary rendering.
- [ ] Add typed API mutations, accessible dialogs, invalidation, notices, and client summary cards.
- [ ] Re-run focused frontend tests until green.

### Task 4: Explicit continuation for management histories and organization pages

**Files:**
- Modify: `frontend/src/features/manager/managerApi.ts`
- Modify: `frontend/src/features/manager/ManagerDashboard.tsx`
- Modify: `frontend/src/features/manager/DesignerDetail.tsx`
- Modify: `frontend/src/features/head/HeadDashboard.tsx`
- Modify: `frontend/src/features/head/OrganizationTree.tsx`
- Modify: `frontend/src/api/types.ts`
- Test: `frontend/src/features/manager/ManagerDashboard.test.tsx`
- Test: `frontend/src/features/manager/DesignerDetail.test.tsx`
- Test: `frontend/src/features/head/HeadDashboard.test.tsx`

**Interfaces:**
- Consumes: paginated team/tree/evaluation/audit APIs.
- Produces: explicit all-page traversal for team/tree and load-more evaluation/audit history where user interaction benefits from bounded incremental reads.

- [ ] Write failing tests proving records beyond page one are loaded or exposed by continuation controls.
- [ ] Run focused tests and confirm existing first-page-only behavior fails.
- [ ] Implement explicit page traversal or TanStack infinite-query continuation without silent truncation.
- [ ] Re-run focused tests until green.

### Task 5: Verification, self-review, commit, and report

**Files:**
- Create or append: `.superpowers/sdd/2026-07-25-role-based-design-operations-platform/task-11-report.md`

- [ ] Run backend typecheck, test suite, and production build.
- [ ] Run frontend typecheck, test suite, and production build.
- [ ] Run `git diff --check` and review the complete scoped diff for authorization, redaction, pagination, and transaction regressions.
- [ ] Fix any discovered issue through a new red-green cycle and rerun all verification.
- [ ] Commit the coherent implementation and record commit, exact counts, and remaining concerns in the Task 11 report.

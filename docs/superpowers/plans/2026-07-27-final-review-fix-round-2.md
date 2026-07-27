# Final Review Fix Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify KPI evidence, hard-bound hierarchy/KPI reads, and expose complete paginated management project history without weakening authorization.

**Architecture:** A shared KPI-enrichment service will turn stored tasks plus bounded version/event batches into the single KPI input used by personal, manager, and head summaries. Organization pages will use explicit nested designer pages and repository queries scoped to only those IDs. A project-activity service will merge project/task/design-version audit events into a newest-first paginated feed consumed alongside all-page design versions.

**Tech Stack:** TypeScript, Express, Zod, in-memory and Mongoose repositories, React Query, React Testing Library, Vitest, Supertest.

## Global Constraints

- Preserve all existing project, role, client, team, and audit authorization boundaries.
- No unbounded report period, task set, nested organization collection, Mongo `$or`, or silent 100-record frontend cutoff.
- Use strict TDD: observe each new regression fail before production changes.
- Do not touch `reference_docs/`.

---

### Task 1: Shared bounded KPI evidence

**Files:**
- Create: `backend/src/services/kpi-enrichment.service.ts`
- Modify: `backend/src/services/kpi.service.ts`
- Modify: `backend/src/services/hierarchy.service.ts`
- Modify: `backend/src/services/task.service.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Test: `backend/tests/workflows.test.ts`
- Test: `backend/tests/kpi.test.ts`

**Interfaces:**
- Produces: `enrichKpiTasks(repository, tasks, periodStartAt, periodEndAt): Promise<TaskRecord[]>`.
- Produces: bounded KPI validation with structured `INVALID_KPI_RANGE` / `KPI_TASK_LIMIT_EXCEEDED` errors.
- Persists: `wasYellow: true` when pre-update risk is yellow.

- [ ] Add failing tests proving one version is zero revisions, two versions is one revision, `in_review` sets `hasReview`, recovered yellow tasks retain `wasYellow`, and hierarchy/personal KPI components match.
- [ ] Run focused backend tests and confirm failures reflect the current duplicate/incomplete enrichment.
- [ ] Implement the shared enrichment service using batched task-version and owner-safe event reads.
- [ ] Call it from personal and hierarchy KPI calculation and persist pre-mutation yellow history in the task transaction.
- [ ] Add and enforce a 366-day maximum KPI span and 1,000-task maximum with structured errors before enrichment.
- [ ] Replace the unbounded Mongo task-event `$or` with fixed-size task/owner pair batches and a hard overall result limit.
- [ ] Run focused tests until green.

### Task 2: Explicit nested organization bounds

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/hierarchy.service.ts`
- Modify: `backend/src/routes/organization.ts`
- Modify: `backend/tests/workflows.test.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/manager/managerApi.ts`
- Modify: `frontend/src/features/head/HeadDashboard.test.tsx`

**Interfaces:**
- Produces: each manager node with `designers.items` plus nested `pagination {limit, offset, total, hasMore}`.
- Consumes: `listProjectsForDesignerIds(ids)` rather than head-wide `listProjectsForUser(head)`.

- [ ] Add failing backend tests with more than the nested page size proving each manager payload is capped, totals are explicit, and head-wide project enumeration is never called.
- [ ] Add failing frontend tests proving nested designer pages are traversed and merged without truncation.
- [ ] Implement scoped project/user/task/evaluation/event batch repository methods with bounded ID chunks.
- [ ] Return nested designer page metadata and update hierarchy summaries to operate only on that bounded page.
- [ ] Add a nested-page endpoint or query parameters and update the frontend loader to request all explicit pages per manager.
- [ ] Run focused backend/frontend tests until green.

### Task 3: Complete project history

**Files:**
- Create: `backend/src/services/project-activity.service.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/routes/audit.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/workflows.test.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/manager/managerApi.ts`
- Modify: `frontend/src/features/manager/ManagementProjectWorkspace.tsx`
- Create: `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`

**Interfaces:**
- Produces: `GET /projects/:projectId/activity?limit&offset`, newest first, with project, related-task, and design-version audit entries.
- Produces: all-page management API helpers for design versions and activity.

- [ ] Add failing integration tests proving the feed includes project creation, related task status/progress/deadline changes, upload, and approval events; excludes unrelated projects; paginates newest first; and rejects unauthorized actors.
- [ ] Add failing component/API tests with second-page versions and activity.
- [ ] Implement repository project activity paging over scoped project/task/version entity IDs and service authorization.
- [ ] Register the endpoint and add typed frontend all-page helpers.
- [ ] Replace the project-only audit query with the complete activity feed and render all design-version/activity pages.
- [ ] Run focused backend/frontend tests until green.

### Task 4: Verification, review, report, and commits

**Files:**
- Modify: `.superpowers/sdd/2026-07-25-role-based-design-operations-platform/task-11-report.md`

- [ ] Run backend typecheck, full tests, and build.
- [ ] Run frontend typecheck, full tests, and build.
- [ ] Run `git diff --check` and review authorization, payload bounds, ordering, and `reference_docs/` status.
- [ ] Commit coherent implementation changes.
- [ ] Append exact commands/counts and commit hashes to the task report, then commit the report.

# Final Review Fix Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make head manager aggregates cover every designer in an explicitly bounded team and render actionable management project-history metadata.

**Architecture:** The hierarchy tree will keep its 20-designer nested payload while separately loading each manager's complete team up to a hard 100-designer aggregate limit, then reuse the existing bounded summary/KPI enrichment for aggregate metrics. The project inspection screen will format existing task, version, and audit data into compact semantic list items, resolving task audit entity IDs against the loaded hierarchy.

**Tech Stack:** TypeScript, Express, in-memory/Mongoose repositories, React, React Query, Testing Library, Vitest, Supertest.

## Global Constraints

- Preserve the nested 20-designer response page and all existing authorization boundaries.
- Reject manager aggregates above the explicit 100-designer hard limit with a structured error.
- Render returned metadata only; do not introduce new backend history joins.
- Keep project-history markup compact, labeled, and screen-reader comprehensible.
- Do not touch `reference_docs/`.

---

### Task 1: Full bounded manager aggregates

**Files:**
- Modify: `backend/src/services/hierarchy.service.ts`
- Test: `backend/tests/workflows.test.ts`

**Interfaces:**
- Produces: organization manager `summary` values computed over all team designers when `designerTotal <= 100`.
- Preserves: `designers.items` capped at 20 with existing nested pagination metadata.

- [ ] Add a backend regression with 21 designers where the final designer contributes workload, risk, KPI evidence, and missing evaluation coverage.
- [ ] Run the focused workflow test and confirm the aggregate assertions fail while the nested payload remains 20.
- [ ] Load each manager's full team with `pageDesignersForManager(managerId, { limit: 101, offset: 0 })`, reject totals above 100, and build aggregate summaries from the full team.
- [ ] Derive nested items from the first 20 full-team summaries and manager aggregate metrics from every full-team summary.
- [ ] Run the focused workflow suite until green.

### Task 2: Useful project-history metadata

**Files:**
- Modify: `frontend/src/features/manager/ManagementProjectWorkspace.tsx`
- Modify: `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`

**Interfaces:**
- Consumes: existing `ProjectHierarchy`, `DesignVersion`, and `AuditEvent` fields.
- Produces: task deadline history, version provenance/review metadata, and audit identity/change/reason details.

- [ ] Expand the component fixture with a task, deadline-revision audit, actor/reviewer metadata, and complete version fields.
- [ ] Assert original/current deadlines, task title identity, actor/entity/action, old/new values, upload/review timestamps, and revision reason; run the component test and observe failure.
- [ ] Add compact date and record-value formatters plus a task-ID-to-title lookup.
- [ ] Render labeled task deadline rows, version upload/review rows, and audit metadata/change/reason rows using semantic articles and lists.
- [ ] Run the focused component test and accessibility smoke coverage until green.

### Task 3: Verification, commits, and report

**Files:**
- Modify: `.superpowers/sdd/2026-07-25-role-based-design-operations-platform/task-11-report.md`

- [ ] Run backend type-check, full tests, and build.
- [ ] Run frontend type-check, full tests, and build.
- [ ] Run `git diff --check`, inspect authorization/bounds/accessibility density, and confirm `reference_docs/` remains untouched.
- [ ] Commit the implementation and plan.
- [ ] Append exact commands, counts, and the implementation hash to the task report, then commit the report.

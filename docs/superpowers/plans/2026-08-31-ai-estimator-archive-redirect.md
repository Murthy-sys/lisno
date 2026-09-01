# AI Estimator Archive Success Redirect — Task Plan

## Objective

Redirect a Super Admin from an successfully archived Estimation Item workspace
to the AI Estimator Configuration dashboard while preserving every other
lifecycle outcome and failure state.

Source of truth:

- `docs/superpowers/specs/2026-08-31-ai-estimator-archive-redirect-design.md`

## Current repository state

- The worktree contains approved, uncommitted AI Estimator Mode/layout and
  permanent Basket deletion changes. They must remain intact.
- `KnowledgeItemWorkspacePage.tsx` and `KnowledgeScreens.test.tsx` are already
  dirty from approved AI Estimator work. Their relevant pre-change diffs must be
  inspected before editing, and additions must remain narrowly scoped.
- No backend, API, route registry, shared routing primitive, dependency,
  lockfile, or OCR change is required.
- No commit, push, deployment, seed, migration, or live archive is authorized.

## T1 — Add the archive-navigation regression

**Status:** completed

**Depends on:** Approved specification.

**Ownership:** One frontend implementer owns the focused workspace test and the
subsequent page change. No second writer may edit the same feature files.

**Affected areas:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`, or a
  new narrowly scoped archive-navigation test if that preserves the dirty file
  more safely.

**Work:**

1. Capture the relevant existing diff before editing.
2. Add a failing rendered test that confirms successful archive:
   - sends the established archive command;
   - waits for success/cache synchronization;
   - navigates to `/admin/configuration/estimation`; and
   - replaces the archived workspace history entry.
3. Add or retain assertions that a failed archive remains on the workspace and
   that activate/deactivate success does not use the archive redirect.

**Acceptance criteria covered:** 1–4.

**Verification:** Run the exact focused test before and after implementation.

## T2 — Implement the localized success redirect

**Status:** completed

**Depends on:** T1 failing for the expected missing redirect.

**Ownership:** The same frontend implementer owns
`KnowledgeItemWorkspacePage.tsx`. Do not change backend, route definitions,
shared UI/routing primitives, or unrelated lifecycle behavior.

**Affected areas:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`

**Work:**

1. Preserve the existing lifecycle mutation and cache synchronization.
2. In the successful archive branch only, navigate to
   `/admin/configuration/estimation` with replace semantics after synchronization.
3. Keep activate/deactivate announcements and current-page behavior unchanged.
4. Keep failure, pending, conflict, confirmation, and unsaved-change behavior
   unchanged.

**Acceptance criteria covered:** 1–4.

**Verification:** The T1 regression passes without changing unrelated test
expectations.

## T3 — Run integrated frontend verification and hygiene

**Status:** completed

**Depends on:** T2 complete.

**Ownership:** A verification runner performs read-only checks after the writer
finishes. The primary integrator owns final diff reconciliation and reporting.

**Checks:**

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge
cd frontend && npm run typecheck
cd frontend && npm run build
git diff --check
git status --short
git diff --cached --quiet
```

Confirm the final diff contains only the localized archive-success branch, its
focused regression, this specification, and this task plan in addition to the
previously approved dirty work. Record warnings and unrun checks. Do not claim
lint because the repository has no lint script.

**Acceptance criteria covered:** 1–5.

## Parallel execution

No implementation tasks are safe to run in parallel: the test and page behavior
are one small, tightly coupled frontend slice. Read-only final verification
starts only after the writer is finished.

## Acceptance-criteria traceability

| Criterion | Task | Evidence |
| --- | --- | --- |
| Successful archive redirects to Configuration dashboard | T1, T2 | Rendered navigation regression |
| Redirect occurs after success/sync and replaces history | T1, T2 | Mutation-order and navigation assertions |
| Failed archive remains on workspace | T1, T2 | Failure-state regression |
| Activate/deactivate do not redirect | T1, T2 | Lifecycle branch assertions |
| Focused/full feature verification and hygiene | T3 | Exact command results and final diff inspection |

## Verification outcome — 2026-08-31

- Archive redirect regression: 4/4 passed.
- Existing workspace screens: 30/30 passed.
- AI Estimator feature suite: 135/135 passed across 14 files.
- Frontend typecheck and production build passed; the existing over-500-kB Vite
  chunk advisory remains non-failing.
- `git diff --check` passed and nothing is staged.
- No live archive, browser interaction, backend/OCR/migration check, dependency
  install, commit, push, or deployment was performed for this frontend-only
  navigation change.

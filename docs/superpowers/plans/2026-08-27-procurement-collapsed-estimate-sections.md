# Procurement Collapsed Estimate Sections — Task Plan

## Approved source

- Specification: `docs/superpowers/specs/2026-08-27-procurement-collapsed-estimate-sections-design.md`

## Ownership boundaries

- **Frontend behavior owner:** `frontend/src/features/procurement/ProcurementWorkspace.tsx`
  - Owns visible-section derivation, anomaly detection, expansion state, accessible trigger/panel relationships, and reset behavior.
- **Styling owner:** Procurement selectors in `frontend/src/styles/index.css`
  - Owns compact expansion-panel presentation and expanded/collapsed affordances only.
- **Regression-test owner:** `frontend/src/features/procurement/ProcurementWorkspace.test.tsx`
  - Owns fixtures and assertions for positive/zero values, default collapse, independent expansion, reset, spend anomalies, focus, and accessibility.
- **Primary integrator:** owns contract interpretation, final diff reconciliation, and repository hygiene; no backend, API, Finance, or persistence files are in scope.

## Dependency-ordered tasks

### 1. Add display derivation and fail-closed anomaly handling

Affected area:

- `frontend/src/features/procurement/ProcurementWorkspace.tsx`

Work:

- Derive visible items from approved-snapshot items whose `estimatedAmountPaise > 0`.
- Derive visible sections from sections whose `estimatedAmountPaise > 0` and that contain at least one visible item.
- Keep the existing full-response lineage/integrity validation before display filtering.
- Extend integrity handling so zero-value items/sections with actual spend or expenses produce the Procurement integrity-error state instead of being silently omitted.
- Use visible sections for preview section count and display totals.

Acceptance criteria covered:

- AC 4: zero-value items/sections are absent.
- AC 5: hidden-value financial activity fails closed.
- AC 8: no API or persistence change.

### 2. Convert visible sections to closed-by-default expansion panels

Depends on: Task 1.

Affected areas:

- `frontend/src/features/procurement/ProcurementWorkspace.tsx`
- Procurement selectors in `frontend/src/styles/index.css`

Work:

- Add stable trigger and panel IDs based on project and section IDs.
- Render a keyboard-operable section-summary button with label, visible item count, estimated total, recorded spend, `aria-expanded`, and `aria-controls`.
- Do not render item cards, receipts, or Record purchase actions while the section is collapsed.
- Allow multiple sections to expand independently.
- Keep expansion state inside the project-detail lifecycle so opening or reopening Preview starts with every section closed.
- Add a non-color-only state affordance using the existing icon system and motion preferences.

Acceptance criteria covered:

- AC 1: all positive sections initially collapsed.
- AC 2: details/actions hidden until expansion.
- AC 3: expansion exposes existing item, receipt, and purchase behavior.
- AC 6: independent panels reset on preview reopen.
- AC 7: accessible state and keyboard operation.

### 3. Add focused regression and accessibility coverage

Depends on: the UI contract in Tasks 1–2; the test file can be authored in parallel with Task 2 after trigger names and IDs are agreed.

Affected area:

- `frontend/src/features/procurement/ProcurementWorkspace.test.tsx`

Work:

- Add positive and zero-value fixture sections/items.
- Assert section triggers begin with `aria-expanded="false"` and item cards/actions are absent.
- Expand sections independently and assert only positive-value selected items appear.
- Navigate Back and reopen Preview; assert all panels are closed again.
- Assert zero-value financial activity produces the integrity-error state.
- Preserve and rerun Preview/Back focus assertions and the automated accessibility check in collapsed and expanded states.

Acceptance criteria covered:

- AC 1–7 through rendered interaction tests.

### 4. Integrated verification and review

Depends on: Tasks 1–3 complete and reconciled.

Checks:

1. `cd frontend && npm test -- src/features/procurement/ProcurementWorkspace.test.tsx`
2. `cd frontend && npm run typecheck`
3. `cd frontend && npm run build`
4. `git diff --check`
5. `git status --short` to confirm only intended new changes alongside preserved pre-existing work.

Review:

- Inspect the final diff for hidden financial evidence, stale expansion state, unstable IDs, accessible names, focus regressions, and unintended changes outside Procurement UI scope.
- No deployment, commit, staging, migration, or production mutation.

Acceptance criteria covered:

- AC 7–8 and final repository hygiene.

## Safe parallelism

- After Task 1 settles the visible-section contract, Task 2's implementation/CSS work and Task 3's test-file work may proceed in parallel because their file ownership does not overlap.
- Final tests and review must wait until both writers finish because concurrent worktree tests can observe partial integration.
- No backend or Finance work is delegated because those contracts are unchanged.

## Completion evidence

- Focused test output with exact test count.
- Frontend typecheck and production-build exit status.
- `git diff --check` result.
- Final review verdict and any remaining warning or unrun check.

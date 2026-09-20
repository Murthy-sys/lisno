# Quality-control add actions polish — task plan

## Approved source

- Specification: `docs/superpowers/specs/2026-09-20-quality-control-add-actions-polish-design.md`

## Dependency-ordered tasks

1. **Protect the existing work**
   - Capture the current dirty-path set and the focused diff for the quality-parameter component and stylesheet.
   - Treat all existing changes in those files as owned work that must be preserved.

2. **Refine the action markup**
   - In `frontend/src/features/ai-estimator-knowledge/KnowledgeQualityParameterFields.tsx`, retain the existing permission checks and click handlers.
   - Use the concise visible labels `Add frequency` and `Add performed by` while preserving native button semantics and descriptive accessible names.
   - Add only the local hooks needed for the polished presentation.

3. **Implement the scoped visual treatment**
   - In `frontend/src/features/ai-estimator-knowledge/knowledge-quality-workspace.css`, style both actions as consistent compact accent controls.
   - Keep the selects dominant, align the grid and hints, and cover hover, pressed, focus-visible, narrow-width, and text-zoom behavior.
   - Avoid changes to shared button styles or unrelated quality controls.

4. **Run focused regression checks**
   - Run the relevant frontend quality-parameter tests.
   - Run frontend typecheck and build.
   - Run `git diff --check` on the integrated result.

5. **Visually verify the interaction**
   - Inspect the real form at a desktop width, a narrow mobile width, and 200% text zoom.
   - Confirm both actions stay readable and operable, do not overflow, have visible keyboard focus, and open the correct existing creation dialog.
   - Reconcile any visual defects, then repeat affected checks.

## Ownership boundaries

- Frontend implementation owns only the two approved frontend files and any directly related focused test adjustment required by the label change.
- No backend, API, persistence, permissions, dialog workflow, dependency, lockfile, or unrelated form changes are in scope.
- The primary agent owns integration, preservation of pre-existing edits, and final acceptance-criteria reconciliation.

## Acceptance criteria trace

- Tasks 2–3 preserve both Super Admin actions and give them a shared compact, single-line treatment.
- Task 3 covers alignment, responsive layout, hover/pressed/focus states, and scoped styling.
- Tasks 4–5 verify the correct dialog target, keyboard operability, text zoom, and absence of overflow.

## Parallel execution

- Markup and CSS are coupled and should be implemented by one owner to avoid conflicting edits in already-dirty files.
- Once implementation is stable, focused test review and visual QA may run independently; final verification must run against the integrated worktree.

## Verification commands

- `cd frontend && npm test -- <relevant quality-parameter test paths>`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `git diff --check`
- Browser checks at desktop, narrow mobile, and 200% text zoom with keyboard interaction.

# Timer color thirds task plan

Specification: [Approved design](../specs/2026-09-11-timer-color-thirds-design.md).

## Scope and ownership
Small frontend change. Primary implementer owns `frontend/src/features/workflow/ProjectWorkflowProgress.tsx` and its focused timer tests. Reuse existing CSS and API allowance; no backend or dependency changes. Before implementation, recheck worktree status and relevant diffs. The only dirty path at planning time is the new approved specification.

## Dependency-ordered tasks
1. **Implement relative urgency (acceptance criteria 1, 3, 4, 5).** Extend countdown urgency to accept an optional allowance. For positive finite allowances, use green above two thirds remaining, orange above one third through two thirds, and red at or below one third. Pass operational `slaAllowanceMs`; retain fixed-day fallback for missing/invalid allowances and legacy timers. Supply relative accessible descriptions. Preserve timer mechanics and backend bands.
2. **Verify timer behavior (criteria 1–5; depends on task 1).** Extend `ProjectWorkflowProgress.test.tsx` with two unequal allowances, exact boundaries and adjacent values, zero/overdue, ticking transitions, paused stability, refreshed allowances/remaining time, and invalid/missing allowance fallback. Assert rendered urgency and accessible descriptions. Keep existing legacy coverage.
3. **Review and validate (criterion 6; depends on tasks 1–2).** Inspect integrated diff for unchanged clock semantics and visibility. Run `npm test -- src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx`, `npm run typecheck`, and `npm run build` from `frontend/`. Check rendered timer states and accessibility through component tests; inspect the running UI for visual color/label consistency if available. Run `git diff --check` and `git status --short`. Report exact results and any unrun visual checks.

## Execution boundaries
Keep one parent task in progress. Implementation and regression edits are tightly coupled and should run sequentially under one owner. An independent read-only review can run in parallel with test preparation only in Mode A; final verification follows all writers. Mode B performs everything inline. No commits, pushes, deployment, or external mutations are included.

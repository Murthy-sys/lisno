# Timer colors by equal thirds

## Goal
Divide each workflow stage's allowed countdown duration into three equal periods: green first, orange second, red third.

## Current behavior and evidence
- `frontend/src/features/workflow/ProjectWorkflowProgress.tsx` uses fixed remaining-time thresholds: above two days green, one to two days orange, below one day red.
- `projectWorkflowProgress.css` already supplies all three colors through the comfortable, approaching, and urgent states.
- Operational timing includes `slaAllowanceMs` in `projectWorkflowApi.ts`; `backend/src/services/design-workflow-state.service.ts` supplies the same duration used to calculate the countdown target and remaining time.
- Existing timer tests cover urgency, ticking, paused clocks, and accessible descriptions. Initial worktree is clean.

## Requirements and boundaries
Let M be the stage's positive, finite `slaAllowanceMs` and R its current remaining time.

| Period | Remaining time | Color |
| --- | --- | --- |
| First third | R > 2M/3 | Green |
| Second third | M/3 < R <= 2M/3 | Orange |
| Final third and overdue | R <= M/3 | Red |

- At each exact boundary, transition to the next color. Example: a 9-hour allowance is green above 6 hours remaining, orange above 3 through 6 hours, and red at 3 hours or less.
- Use the authoritative allowance, not time since the page opened or a pause-adjusted wall-clock span.
- Preserve existing countdown ticking, pause/resume, due/overdue labels, visibility, and refresh behavior.
- Update screen-reader descriptions to describe the relative period rather than fixed day counts.
- Preserve current fixed thresholds for legacy timers or missing/invalid allowances, where no reliable slab duration exists.

## Scope and non-goals
Small frontend presentation change in the workflow timer and focused regression coverage. Reuse existing color styles. No backend band/KPI changes, deadline changes, API changes, persistence, dependencies, or migrations.

## Assumptions, constraints, and risks
- “Slab max” means the allowed countdown duration already exposed as `slaAllowanceMs`.
- The user's equal-thirds clarification supersedes the earlier half/third/quarter proposal.
- Fractional thresholds must not be rounded to whole days; short and long allowances should behave proportionally.
- Backend workflow bands are separate from timer presentation and remain unchanged.

## Acceptance criteria and verification
1. Two unequal allowances show green, orange, and red at proportional thresholds, including exact boundaries.
2. A ticking countdown changes color at the boundaries; paused timers keep their color until refreshed.
3. Zero and overdue remaining time display red; refreshed allowance/remaining values update the color.
4. Timer accessible descriptions match the new periods; existing visible timer labels and layout remain intact.
5. Legacy and invalid-allowance fallback behavior remains covered.
6. Run focused workflow timer tests, frontend typecheck/build, rendered timer/accessibility checks, and `git diff --check` during implementation.

## Open decisions
None; boundary behavior and compatibility defaults are specified above for approval.

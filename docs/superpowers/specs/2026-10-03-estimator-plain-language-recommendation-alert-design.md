# Plain-language estimator recommendation alert

Date: 2026-10-03  
Status: Approved and verified locally in Mode A on 2026-10-04

## Goal and current evidence

When a configured relationship applies in the active estimator room, the in-page alert should say what item is recommended and which selected item prompted it. For example: **“False ceiling painting is needed for POP false ceiling.”**

`EstimatorRecommendations.tsx` currently has the exact target names and configured source names in `RoomRecommendationView`, but its in-page alert says only “Recommendations for this room” and a count such as “2 related items to review.” The right-side slide-out already contains the selection actions and configured reasons. The earlier approved specification and task plan for this flow are [Estimator smart recommendations](2026-10-03-estimator-smart-recommendations-design.md) and its [plan](../plans/2026-10-03-estimator-smart-recommendations.md).

## Scope and recommended behavior

- Replace the generic in-page count as the primary message with a short relationship sentence built from the current eligible catalogue target name and configured source name. Required rules use “**{target} is needed for {source}.**” Optional rules use “**Consider {target} for {source}.**” Do not use “needed” for an optional rule.
- Show the highest-priority pending target first. If there are more pending targets, add a compact “+N more recommendations” cue. The existing **Review recommendations** action opens the slide-out to see and select all of them. When an item is selected, update the alert to the next pending relationship; when all eligible relationships are selected, use a short completion message.
- Use the existing stable target and source IDs, current room selection, and deduplicated recommendation view. One target linked from multiple sources must not create duplicate Select actions. Keep its full configured source names and reasons available in the slide-out; the alert may name the first applicable source and indicate that more connections can be reviewed.
- Keep loading, stale, error, forbidden, unavailable, guidance-only, historical, and read-only messages truthful. Never fabricate a relationship from display-name similarity, show Configuration completion wording, or imply an unavailable item can be selected.
- Preserve the approved right-side slide-out, its **Select item** behavior, and the automatic dismissal rule that unchecks a newly checked source when no linked eligible item was chosen. This request changes the alert copy and visual density, not the selection or save workflow.

## Assumptions, constraints, and impacts

“Simple alert” refers to the compact in-page alert above the estimate basket list. The prior request for a right-side slide-out remains in effect as the action surface. If the intended change is to remove the slide-out entirely, that would also need a replacement for its dismissal-and-uncheck behavior.

This is frontend presentation work in `EstimatorRecommendations.tsx`, its focused tests, and recommendation-scoped CSS. No backend/API, saved estimate, Configuration, permission, finance, dependency, or migration change is expected. Existing uncommitted work in those files and unrelated paths must be preserved.

## Risks and acceptance criteria

- Required and optional relationships have distinct truthful wording. A configured POP false-ceiling-to-painting rule renders the example sentence from catalogue/source data, not hardcoded names.
- The alert stays compact with multiple rules, updates after Select, and exposes the remaining rules through Review. Duplicate target IDs do not create duplicate actions or misleading counts.
- Unavailable, stale, failed, and read-only states never present a selectable promise. The slide-out still carries configured reasons and preserves room-scoped selection, close rollback, totals, and save behavior.
- Focused component tests cover wording, priority, duplicate sources, selected state, and exceptional states. Rendered desktop and 390 px checks cover wrapping, no overflow, keyboard/accessible names, and no Configuration completion copy; frontend typecheck/build and repository hygiene checks pass.

## Open decision for approval

Approval accepts the interpretation that only the **in-page alert** becomes a simple, item-specific sentence while the previously approved slide-out and its dismissal behavior remain available.

## Outcome

The in-page alert now leads with the configured target–source relationship. It prioritizes required pending targets, uses the matching required source before saying “is needed,” uses “Consider” for optional relationships, and shows a singular or plural count of other distinct eligible targets. The right-side slide-out, explicit selection, and dismissal behavior remain in place. Verification evidence is recorded in the linked task plan.

# Estimate header actions and recommendation dismissal

Date: 2026-11-09
Status: specification and task plan approved; user selected execution Mode A. Implemented and verified against AC1–AC6. See the task plan for verification evidence and limitations.

## Goal

Make only the two requested refinements: place Check tier comparison after the Sub Basket info icon in the same header row as Remove Sub Basket, and automatically close the Sales recommendation popup after an accepted Add when no further suggestions remain.

## Current behavior and evidence

- `ConfiguredEstimateBuilder.tsx` supplies the info icon as `headingActions` and the comparison component as `headerActions`. `EstimateBuilderShell.tsx` renders `headerActions` below the header containing the Sub Basket name, info, count, amount, collapse control, and removal button. This causes the second row shown in the screenshot.
- `EstimateSubBasketModes.tsx` owns the existing comparison trigger, dialog, and PDF behavior. Its comparison-only wrapper still uses the full-width strip styles in `estimate-sub-basket-modes.css`.
- `EstimatorRecommendations.tsx` derives the complete recommendation list from the current room's authorized decisions, then passes a 20-item page to `EstimateRecommendations.tsx`. Selected items remain in that list with Remove actions, so `total` does not mean additional suggestions remain.
- `EstimateRecommendations.tsx` opens the popup automatically for the first non-empty ready result and keeps accepted Add/Remove actions focused inside it. It currently has no accepted-Add completion rule for automatic closure.
- `LeadEstimateWorkspace.tsx` recalculates the recommendation query identity after selections change. Its state is loading while current source data is fetching, and ready only after those reads settle. Adding a recommendation can introduce further recommendations, so a temporarily empty loading page is not evidence that the flow is finished.
- Existing tests intentionally expect the popup to remain open after Add. Sales opt-in expectations will need to change for the no-remaining-suggestions case; other shared consumers retain their current behavior.

## Scope and non-goals

- Header placement applies to the staff Sub Basket header in the Sales/shared Designer estimate builder. Keep Direct items presentation as it currently is; it has no Remove Sub Basket action and is outside the pictured change.
- Automatic dismissal applies to the existing Sales recommendation popup. Preserve non-popup Designer recommendations and Client recommendation behavior.
- Preserve the completed refresh-warning removal, Main Line tier controls, implicit Mode, tier-info contents, authoritative pricing, known-stale blockers, existing comparison/PDF, and removal confirmation behavior.
- No changes to recommendation rules, item eligibility, selected-item persistence, prices/totals, APIs, permissions, dependencies, or general styling. No automatic save, submit, or additional item selection.

## Required behavior

### Header

1. On desktop, present one header row in this order: Sub Basket name/disclosure, info icon, Check tier comparison, existing count/amount/collapse indication, and Remove Sub Basket. Keep removal at the trailing end of the row.
2. Remove the separate comparison strip below that Sub Basket header. Keep the button label, scope, disabled reason, dialog, Mode column, and PDF behavior unchanged.
3. Info, comparison, collapse, and removal must remain independent accessible controls. No nested buttons or invalid heading markup. Clicking either information action must not collapse or remove the group.
4. On narrower screens, allow the same header to wrap in its existing container while preserving action order and usable touch targets. Avoid horizontal overflow; do not shrink labels into unreadable controls or add a new toolbar.

### Recommendation popup

5. After an Add is accepted, wait until the updated current-room selection and its current recommendation result are ready. If there are no remaining unselected recommendations across the complete list, and no unavailable/historical-source review issue, close the popup automatically once.
6. Count remaining recommendations before pagination. A selected row with a Remove action does not count as an additional suggestion. Recommendations produced by the newly added item do count, including those on another page.
7. Keep the popup open while loading, when additional unselected recommendations remain, or when an error, stale/forbidden state, or unresolved Configuration/review issue prevents confirming completion. Rejected Adds do not trigger automatic closure or a success announcement.
8. Apply this completion rule only to a successful Add interaction. Do not immediately close a popup the user manually reopens to inspect/remove already selected recommendations. Removal, ordinary rerenders, and saving the estimate do not arm the completion rule.
9. Scope pending completion to the same actor/estimate/room. Clear it on manual dismissal or a context change; a late response from a previous context must not close the current popup or reclaim focus.
10. Reuse the existing close path and Dialog focus restoration. Return focus to the Recommendations trigger, or its existing fallback if the trigger disappears. Preserve existing success feedback through the established announcement path without adding another toast or confirmation.

## Recommended integration and state transitions

Reuse the existing comparison control with an opt-in inline presentation and the current header structure. Keep its existing default presentation for other consumers. Extend the staff recommendation adapter to supply the full-list completion signal; the paginated presentation must not guess completion from visible rows or total selected-plus-unselected rows.

The popup transition is: accepted Add → pending completion for the same context → updated ready result → close if nothing remains, otherwise stay open and clear the completed interaction. Loading keeps the decision pending. Manual close/context change cancels it. This reuses existing recommendation reads and does not introduce a second fetch or decision source.

The repository already provides the required controls, data, and close behavior; no competing architecture choice is needed. Internal prop names and the smallest state owner can be settled in the task plan without changing the behavior above.

## Assumptions, impacts, and risks

- “After info icon” means immediately after it in header action order. The removal button remains on the same row when width permits.
- “No additional suggestions” means no unselected recommendation in the full current-room result after refresh, rather than an empty page or no enabled button during loading. Unresolved review messages keep the popup available.
- Data/API impact: frontend presentation and local interaction state only. Stable target IDs remain the mutation keys; backend authorization remains authoritative. No schema or migration is required.
- UX risks: premature closure before chained suggestions arrive, confusing selected rows with outstanding suggestions, closing a manually reopened popup, late-result cross-room closure, stolen focus, or a wrapped header moving comparison away from its info icon. Acceptance checks below cover these cases.
- Rollback is a scoped frontend revert of this follow-up; preserve prior approved changes. No data rollback or external actions are involved.

## Worktree preservation

The initial dirty set contains the completed prior tier/info work and Sales warning removal: shared builder/tier controls and tests; configured builder/workspace/pricing helper and tests; estimator CSS; seven new tier-info/suggestion files; and the four prior spec/plan documents. These were inspected and belong to the earlier approved work. Extend them without reverting, staging, or rewriting unrelated edits. Recommendation components/tests are currently clean. Capture per-target diffs again before implementation ownership is assigned.

## Acceptance criteria and verification

- **AC1:** Comparison appears after the info icon in the Sub Basket header, with Remove Sub Basket on the same desktop row; no duplicate comparison strip remains. Direct items and other shared consumers retain their presentation.
- **AC2:** Info, comparison/PDF, collapse, and removal remain independently operable with correct accessible names and focus behavior. Verify desktop/mobile widths and long Sub Basket names without horizontal overflow.
- **AC3:** Adding the final unselected recommendation closes the Sales popup after current results are ready, despite retained selected/Remove rows. The item is added exactly once and no save/submit is triggered.
- **AC4:** Further suggestions on another page or introduced by the added item keep the popup open. A loading empty list, rejected Add, failed/stale/forbidden read, and unresolved review message do not falsely close it.
- **AC5:** Manual reopening with only selected rows stays open for review/removal. Removing an item, manually closing during loading, switching rooms/actors/estimates, and late old results preserve existing focus and per-room dismissal behavior.
- **AC6:** Prior Main Line tier/info and Sales warning-removal regressions remain green. Client/non-popup recommendation consumers preserve their existing behavior.
- Run focused shell, comparison, staff builder, shared recommendation, staff adapter, and workspace recommendation tests; then frontend typecheck/build and appropriate shared-consumer regressions. Include rendered keyboard/accessibility and desktop/mobile checks, plus `git diff --check` and final status review.
- The previous full frontend run has documented unrelated baseline failures in the prior tier task plan. Report those separately if encountered; do not expand this request to repair them. No lint script exists.

## Open decisions

None requiring user clarification. The interpretations above keep the changes limited to the two requested behaviors.

# Match Sales recommendations to the common popup theme

Date: 2026-11-05
Status: Approved and implemented in Mode A. Verification recorded in the [task plan](../plans/2026-11-05-sales-recommendations-popup-theme.md).

## Goal

Keep the accepted recommendations popup placement and interactions, while matching the application's common popup colors and controls.

## Current behavior and evidence

- The user's screenshot shows the correctly positioned popup with a cool pale background, black headings and plain white Close, Refresh and Add controls. The user accepts placement and requests the common popup theme.
- `frontend/src/features/estimates/estimateSelection.css` currently applies generic `--color-surface-subtle`, `--color-border` and `--color-text-strong` values to the popup. Generic selection styles also style its plain buttons.
- The popup is portalled to `document.body`, outside the Sales shell's inherited role colors. Global values include `#f8f8fc` for the subtle surface and black strong text (`styles/global.css`).
- The existing common popup theme is `.ui-dialog--reference` in `components/ui/dialog.css`: warm surface `#fbfbf8`, border `#dcded5`, ink `#202633`, muted text `#667064`, olive primary button `#414d32`, and established secondary/quiet button tokens. `Dialog.tsx` and the shared `Button` component consume this theme.

## Scope and requirements

1. Reuse the common popup theme's existing source of truth for surface, header/body text, muted room/source text, separators and control colors. Avoid a separately copied palette that can drift.
2. Match Add to the common primary button treatment. Use the common secondary/quiet treatment for Close, Refresh/Retry, Remove and pagination as appropriate. Keep readable disabled and keyboard-focus states, and maintain current accessible names.
3. Apply theme styling locally to the recommendations popup and its toolbar trigger. Default inline recommendations, Client screens, the shared modal appearance and other Sales controls retain their current styles.
4. Preserve the accepted right-edge placement, width, measured toolbar/footer bounds, responsive sizing, internal scrolling and non-modal behavior. Reuse visual theme primitives without introducing a modal backdrop, focus trap, scroll lock or additional branding/header row.
5. Keep all recommendation copy, availability warnings, counts, pagination, target identity, Add/Remove/Refresh callbacks, room dismissal, focus handling, saved values and totals unchanged. Preserve the existing basket/sub-basket browsing and Client visibility fixes.
6. Preserve mobile touch targets, wrapped item names and readable warning/action content within the current width. No new gradients, shadows, decorative effects, animations, icons or dependencies.

## Integration, constraints and risks

Expected product touchpoints are `EstimateRecommendations.tsx` and scoped rules in `estimateSelection.css`; reuse the existing common theme stylesheet and button primitives. Only extract a shared visual token hook if existing theme classes cannot be reused safely. Do not change common modal geometry or behavior.

Both targets already contain the completed, uncommitted popup implementation. Capture their diffs before implementation and preserve all previous work. The main risks are generic selection CSS overriding common button styling, portalled content missing theme tokens, and theme classes accidentally applying modal dimensions or affecting inline Client recommendations.

This is a small presentation-only change. There are no data, API, permission, finance, persistence or migration impacts. No commit, push, deployment or external service changes are in scope. Rollback is limited to this follow-up's visual edits.

## Assumptions and open decisions

“Common popup” refers to the existing `Dialog` / `.ui-dialog--reference` visual theme. The screenshot's placement and compact content hierarchy are accepted. Keep the visible Close control and existing actions; a new interaction pattern is unnecessary. No unresolved product decision is required.

## Acceptance criteria and verification

- **AC1:** Rendered recommendations use the same warm surface, border, text and olive primary action colors as a common popup, including the unavailable-warning state shown in the screenshot.
- **AC2:** Close, Refresh/Retry, Add/Remove and pagination use consistent common button styling with visible focus and disabled states. Verify computed styles so generic selection rules cannot silently win.
- **AC3:** Desktop and mobile rendering retain the accepted placement and sizing, readable wrapping, reachable Close and footer controls, and no horizontal overflow. Compare the recommendations panel with an actual existing common dialog.
- **AC4:** Existing shared recommendation, staff adapter and Client recommendation regression tests pass. Check Close/reopen, Escape and action focus in the rendered view; popup behavior and default inline styles remain unchanged.

After implementation, run focused existing tests, frontend typecheck/build, rendered desktop/mobile interaction and accessibility checks, and `git diff --check`. Do not add tests that only mirror CSS declarations. No lint script exists. Record exact results and cleanup in the later task plan.

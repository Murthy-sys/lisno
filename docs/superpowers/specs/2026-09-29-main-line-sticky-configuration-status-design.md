# Sticky Main Line Save action

Status: Revised specification approved and implemented locally.

## Goal

Keep only the active Save button within reach while editing a Main Line. Configuration completeness, tab count, and save-status text should scroll normally with the page.

## Current behavior and evidence

- At the time of this revision, `KnowledgeItemWorkspacePage.tsx` rendered `KnowledgeWorkspaceStatus` below the Main Line header, and the earlier worktree CSS pinned the whole strip beneath the global topbar.
- The earlier worktree `KnowledgeWorkspaceStatus.tsx` measured the strip to push the separate sticky Quality checklist command bar below it.
- Overview, Mode, and Recommendations & Exclusions use the page-level Save command. Quality uses its own save handler and command state in `KnowledgeBasketQualityPanel.tsx`.
- The pre-existing dirty Expo log and unrelated PDF are outside this change and must be preserved.

## Revised behavior

- On the web Main Line workspace, show the existing progress/status strip in its normal place below the title. It scrolls away with the page.
- Keep the inline Save action in its current location while visible. Once that action passes under the global topbar, show a **compact pinned Save button** at the trailing edge just beneath the topbar. Hide the pinned button when the inline action returns to view. Only one Save action is visible and keyboard reachable at a time.
- The pinned button uses the active tab's exact Save operation, label, enabled/disabled state, busy state, and permission checks. Dirty, saving, saved, error, and read-only transitions stay governed by existing logic. Switching tabs updates the action without saving the previous tab.
- Apply the same behavior to Quality's shared-checklist Save action. Its full command bar scrolls normally; only its Save button pins after that inline action leaves view.
- Keep the pinned action behind menus and dialogs and clear of the global topbar and safe-area inset. At narrow browser widths, preserve a 44px touch target and avoid horizontal overflow or covering essential navigation. Maintain visible focus and avoid duplicate accessible Save controls.

## Scope, constraints, and non-goals

- The target is the responsive web Main Line configuration page. The separate native mobile app and other Configuration pages retain their current layout.
- This is a presentation and action-wiring change only. No API, persistence, completeness calculation, or authorization changes are required.
- Reuse the existing Save handlers and state. Do not introduce a second save mutation or change the semantics of Quality's basket-level checklist.

## Risks and verification

- Scroll and resize transitions may briefly show both buttons or neither, or disrupt keyboard focus. Verify the inline/pinned handoff and tab changes at desktop and narrow widths.
- Quality's Save state is owned by its panel; expose only the command state needed by the pinned action and keep the panel's own validation authoritative.
- Verify actual rendered scrolling, text zoom, dirty/saving/saved/read-only states, focus, modal layering, and no horizontal overflow. Run focused frontend tests, typecheck, build, and `git diff --check`.

## Acceptance criteria

1. Progress and status text scroll away; only the active Save button remains pinned after the inline Save action leaves view.
2. Exactly one visible and keyboard-reachable Save action uses the current tab's handler and correct disabled/busy state.
3. The behavior covers Overview, Mode, Recommendations & Exclusions, and Quality; the Quality command bar itself scrolls away.
4. Desktop and narrow browser widths, safe-area inset, text zoom, keyboard focus, and dialogs have no obstruction or horizontal clipping.
5. Other Configuration pages and native mobile retain their current layout.

## Open decisions

None. The compact pinned button remains below the existing topbar, matching the placement of the previously pinned strip.

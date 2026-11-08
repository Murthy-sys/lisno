# Compact closable recommendations popup for Sales

Date: 2026-11-05
Status: Approved and implemented in Mode A; verification recorded in the linked task plan.

## Goal

Move Sales estimate recommendations into a small closable side popup so they do not occupy a full-width block above the selected Main Baskets. Keep the restored direct Sub Basket/item browsing and all recommendation selection, pricing and availability rules.

## Current behavior and evidence

- The supplied screenshot shows a full-width “Non-negotiable recommendations (1)” section, availability warning, suggested item, source explanation and Add button above the POP / Gypsum basket.
- `ConfiguredEstimateBuilder.tsx` renders `EstimatorRecommendations` in `EstimateBuilderShell`'s `beforeGroups` content, which places it in the normal scrolling basket flow.
- `EstimatorRecommendations.tsx` filters decisions to existing `must` recommendations, derives item targets by stable IDs, pages 20 rows and delegates Add/Remove to the workspace. It returns nothing when there are no recommendation sources.
- Shared `EstimateRecommendations.tsx` renders an inline expandable section. It automatically expands for a ready, non-empty recommendation context, preserves focus after accepted actions and exposes loading/error/stale/forbidden states.
- `ClientQuotation.tsx` also uses that shared presentation. An unconditional shared change would affect Client screens.
- `LeadEstimateWorkspace.tsx` supplies a recommendation context containing actor, lead, room and recommendation identity. That identity changes when source selections change, so it must not also be the popup's dismissal key.
- The existing `Drawer` component uses a modal backdrop, focus management and `aria-modal="true"`. Its current behavior is heavier than the requested small popup and would block normal estimate interaction.

## Recommended UX and tradeoff

Use a compact non-modal popup at the right edge of the Sales estimate workspace, with a persistent “Recommendations (n)” trigger near the builder tools, a clear Close control, the current room name, and independently scrollable content. The estimate remains interactive while the popup is open. Reuse the existing recommendation rows, semantic labels, pagination and mutation callbacks through an explicit opt-in presentation.

A narrow modal drawer could reuse the existing Drawer directly, but it would block the estimate until dismissed and occupy more screen area. The non-modal popup better fits the requested side helper. Do not change the shared Drawer's behavior or introduce a general-purpose overlay framework for this task.

## Scope and preservation

In scope: the current editable Sales configured-estimate workflow, including reopened working drafts; popup layout, open/close/reopen behavior, room context, keyboard access and responsive presentation.

Preserve:

- Direct Main Basket/Sub Basket/item browsing, sparse draft materialization, selected counts, saved quantities/prices and exclusion focus behavior from the completed Sales restoration.
- Client pre-submission visibility and Client quotation recommendation behavior.
- Existing Designer/other-role presentation and immutable submitted, approved, closed and historical views.
- Recommendation eligibility, `must` filtering, targets, origins, current Configuration checks, Add/Remove semantics, totals, saving and publication requirements.

No backend/API/schema changes, new recommendation types, automatic additions, dependencies, global visual redesign, persistence migration, commit, push or deployment are included.

## Requirements

### R1. Compact side presentation

- In Sales working drafts, replace the full-width inline recommendation block with one compact trigger and one popup. Do not render a second actionable copy.
- Desktop popup width should be approximately 360–400 CSS pixels, bounded by available viewport width, with content height constrained to the viewport and its own scrolling. It must not push baskets down or resize the builder when opened.
- Include a heading identifying non-negotiable recommendations, current room, count and an accessible Close button. Preserve item names, source explanations, availability messages, selected state, Add/Remove controls and pagination.
- Keep the popup outside clipping imposed by the builder's scroll pane. Keep its Close control visible and prevent it from covering the persistent Save/Submit footer or project navigation controls.
- Reuse existing typography, surface/border tokens and button styling. No new icon library, decorative effects, shadows or animation dependency.

### R2. Opening, dismissal and context

- Preserve automatic discovery: open once when a room first receives ready, non-empty recommendations during the current estimate workspace visit. Automatic opening must not steal focus from quantity/rate inputs or change scroll position.
- Close hides only the popup. A compact trigger remains available to reopen it and shows the current recommendation count or relevant loading/review state.
- Once explicitly closed, do not reopen automatically because items are added/removed, results refresh, counts change, or the user switches between Builder and Summary. Retain that choice per stable actor/project-or-lead/room context for the current workspace visit; no server or localStorage preference is needed.
- Switching rooms must show only the active room's recommendations. Each room can have its own first-open/dismissed state. Returning to a dismissed room keeps it dismissed. Leaving the workspace or changing actor/project resets the presentation state.
- Keep dismissal identity separate from the existing source-dependent query/context identity. Never use old-room results to open or populate the new room's popup.
- A successful Add/Remove keeps the popup open and preserves a meaningful focus target as its button changes. It must not cause repeated automatic opening or scroll jumps.
- Closing, reopening and paging must not mutate estimate selections, draft values, dirty state, totals or recommendation origins.

### R3. Empty, loading and failure states

- With no sources, or a confirmed empty result without a warning, omit the popup and trigger. If focused content disappears, return focus to a surviving builder control without stealing focus elsewhere.
- When loading or when a warning/error requires attention, keep the state discoverable from the trigger even if there are no available items. Do not invent an available-item count while results are unresolved.
- Present existing loading, unavailable, stale, forbidden and retry/refresh information inside the popup. A closed popup must retain a concise status on its trigger so failure is not silently hidden.
- Preserve current disabled-action checks and callbacks. A stale/rejected Add must not display a successful addition, change totals or dismiss a warning.
- Keep the existing 20-item pagination bound, full item identity and current Configuration source rules. Closing and reopening should preserve the current valid page; room/source changes must reset or clamp it appropriately.

### R4. Keyboard, mobile and other overlays

- The trigger has an accessible name, expanded state and association with the popup. Explicit keyboard opening moves focus into the popup; automatic opening leaves the active estimate input focused.
- Close and Escape from the popup return focus to its trigger when that trigger still exists. No focus trap, inert background or page scroll lock for this non-modal surface.
- Clicking/typing elsewhere in the builder remains possible and does not automatically dismiss the popup. Escape handling must not interfere with another open dialog or the builder's own controls.
- Existing confirmation/publication dialogs remain above the popup and retain their established focus/close behavior. Avoid competing Escape handlers or overlay layers above those dialogs.
- At narrow widths, adapt to a compact panel within viewport margins, above the persistent footer, rather than an off-screen desktop sidebar. Preserve readable wrapped names, reachable actions and touch targets; no horizontal overflow. Check constrained heights and browser zoom as well as normal mobile width.
- Respect reduced-motion settings. No animation is required for this change.

### R5. Role and lifecycle isolation

- Opt into the popup explicitly for the same stable Sales working-draft boundary used by the restored catalogue browser. Temporary save/refetch locks disable actions without switching presentation.
- Keep the default shared recommendation presentation inline for Client, Designer and other callers. Do not project a new editable popup into submitted/approved/closed/historical snapshots.
- Backend authorization remains authoritative. Use only the existing authorized recommendation data; do not fetch additional catalogue contents to populate the popup.

## Integration and data impact

Expected touchpoints are `ConfiguredEstimateBuilder.tsx`, the staff/shared recommendation adapters, scoped recommendation styling and their tests. Workspace-owned presentation state may be needed to retain dismissal across Builder/Summary switches. Extend the existing components rather than duplicating recommendation derivation or mutation logic.

Data flow remains: current selected source lines → existing recommendation query/view → authorized recommendation rows → existing workspace Add/Remove callback. Popup state is presentation-only. Stable room and item IDs remain the joins; no prices, amounts, DTOs, approval records or request contracts change.

No migration is required. Rollback is the bounded frontend presentation change while preserving the completed Client and Sales fixes. No production effects or external actions are needed for verification.

## Worktree baseline and risks

The worktree contains the completed, uncommitted Client visibility fix and Sales basket-browsing restoration, with their specs/plans and new Sales projection/workspace tests. `ConfiguredEstimateBuilder.tsx`, `EstimateBuilderShell.tsx`, `LeadEstimateWorkspace.tsx` and associated tests already contain understood changes from those tasks. Preserve them; capture per-target diffs again before assigning writers. The recommendation components and `estimateSelection.css` currently have no local changes.

Principal risks are accidental Client presentation changes; reopening after every source update; displaying old-room data; focus theft while typing; lost focus when an item disappears; duplicate actionable recommendations; clipping/z-index conflicts; hidden failures while closed; and covering important controls on small screens.

## Assumptions and open decisions

- “Small side closable popup” means a compact helper that leaves the Sales estimate usable, with explicit Close/Reopen controls.
- Existing automatic discovery should remain, but dismissal should be respected for that room throughout the workspace visit.
- The request concerns the supplied Sales screen. Other roles keep their current presentation.
- These defaults are specified for review; no separate product question is necessary before specification approval.

## Acceptance criteria and verification

1. **AC1: Compact placement.** A Sales room with recommendations shows a small right-side popup and a reopen trigger; no full-width recommendation block pushes baskets down. Close restores clear item access.
2. **AC2: Stable dismissal.** Automatic first opening preserves input focus. Close stays respected through source changes, refresh and Builder/Summary navigation; reopening works. Two unequal rooms keep independent dismissal state and correct content.
3. **AC3: Existing actions.** Add/Remove still affects exactly the intended room/target with correct origin cleanup and totals. Closing/opening does not mutate drafts. Accepted actions keep sensible popup focus; rejected actions do not claim success.
4. **AC4: Accurate states.** Empty, loading, unavailable, stale, forbidden and failure/retry fixtures preserve honest count/status and action guards while both open and closed. Large recommendation groups remain paged.
5. **AC5: Boundaries.** Client/default inline recommendation tests and the Client pre-submission gate pass. Sales direct basket browsing, saved values and closed/historical views remain unchanged.
6. **AC6: Rendered usability.** Desktop 1440×900, mobile 390×844, constrained height and zoom checks show a visible Close control, usable footer, no horizontal overflow, keyboard opening/closing, correct focus restoration and correct behavior with another modal. Accessibility checks pass or any pre-existing limitation is explicitly recorded.

After implementation, run the affected recommendation, Sales builder/workspace and Client recommendation/visibility regressions, frontend typecheck/build, rendered interaction/accessibility checks, `git diff --check` and status review. Tests must exercise user typing and keyboard transitions, not only atomic state updates. No lint script exists. Record exact verification and temporary-artifact cleanup in the later task plan.

Implementation and verification: [task plan](../plans/2026-11-05-sales-recommendations-popup.md). All workflow gates were completed before implementation.

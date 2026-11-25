# Estimation Main Line: single-row controls

Date: 2026-11-25
Status: Approved and implemented. Verification is recorded in the [task plan](../plans/2026-11-25-estimation-single-row-layout.md).

## Goal

Keep the Main Line item, tiers, PMC, Standard/Custom, quantity, rate, and total together on one horizontal desktop row, as requested in the latest screenshot feedback.

## Current behavior and evidence

- `frontend/src/features/estimates/EstimateLineRow.tsx` places the item, pricing/tier/type groups and price fields inside `.configured-estimate-line__primary`.
- `frontend/src/styles/estimator-dashboard.css:2565` uses a wrapping flex row. The item has a 280 px basis; control groups and the quantity/rate/amount grid have nonshrinking widths. Their combined width causes the financial fields to drop onto a second row.
- Container rules at 700 px and 480 px intentionally stack groups for narrow layouts.
- The shared row is also used by Client and Configuration previews. Scope the new presentation to the configured estimation builder so those consumers keep their existing layout.
- The current worktree includes completed Standard/Custom functionality and prior Super Admin edits. Preserve all of them, including the existing builder changes; do not replace files from HEAD.

## Scope and requirements

1. Arrange desktop controls in this order: **Main Line item → Tier → PMC → Standard/Custom → Quantity → Rate incl. GST → Amount incl. GST → Actions**.
2. Keep these groups on one primary row. Use compact spacing and sensible column widths; allow long item names to wrap within their column rather than pushing the price controls onto another row.
3. Aim to fit normal laptop/desktop estimation panes at 1280, 1440, and 1920 px viewport widths. Where a narrower desktop pane cannot accommodate readable controls, use contained horizontal scrolling rather than wrapping the financial fields. Avoid page-level horizontal overflow, clipped values, and inaccessible actions.
4. Preserve the mobile stacked arrangement and touch targets at 390 px. The supplied screenshot is treated as a desktop layout request; do not squeeze every control into a phone-width row.
5. Keep DOM order and keyboard order aligned with the visible control order. Preserve native radio semantics, disabled states, focus indicators, and existing accessible names.
6. Tier descriptions, warnings, dimensions, and component details may remain beneath the primary row. Do not remove relevant information to force the entire item into one line.
7. Keep all existing calculation, save, selection, Standard/Custom persistence, pricing-mode, permission, and source-lock behavior unchanged. Show the same tax-inclusive rate and amount values.
8. Follow-up copy refinement: show the compact headings **Qty**, **Rate**, and **Total**. Preserve unit/tax context in accessible names and retain the excluded-item indication. Values remain tax-inclusive.

## Implementation boundary

Prefer scoped CSS and the smallest layout-prop/markup adjustment needed in the shared row and configured builder. Likely files: `styles/estimator-dashboard.css`, `features/estimates/EstimateLineRow.tsx`, and `features/leads/ConfiguredEstimateBuilder.tsx`; adjust existing keyboard-order tests if the order changes.

This is a localized frontend presentation change. No backend/API/schema updates, pricing changes, new dependencies, PDF changes, or redesign of other screens.

## Assumptions, risks, and compatibility

- “Price” includes the existing quantity, unit rate, and total controls; none is removed.
- Mobile remains responsive. Long names, large totals, alternate UOM labels, zoom, and touch devices must remain usable.
- Shared stylesheet selectors could alter other row consumers; isolate the new layout through an estimation-specific modifier and verify a shared consumer.
- Changing visual order without DOM order would confuse keyboard navigation; use matching markup order.
- No data migration or rollout dependency. Rollback is limited to this presentation change, preserving prior functionality.
- No unresolved product decision; the assumptions above are included for approval.

## Acceptance criteria and verification

1. At the tested desktop widths, the item, tier, PMC, Standard/Custom, quantity, rate, and amount share one primary row; no financial block drops below the selectors.
2. Long text and large prices remain readable, with contained overflow only when necessary. Mobile retains its usable stacked layout.
3. Keyboard order matches the visible order, all controls retain their existing behavior, and unrelated shared-row consumers retain their layout.
4. Verify rendered layouts at 1280/1440/1920 and 390 px, including long labels and disabled/read-only rows. Run relevant existing row/builder/keyboard tests, frontend typecheck/build, and `git diff --check`. No backend or full repository test rerun is needed for this presentation-only change.

## Non-goals

No changes to saved values, totals, taxes, margins, approvals, backend code, or existing Standard/Custom behavior. No commit, push, deployment, production mutation, or customer communication.

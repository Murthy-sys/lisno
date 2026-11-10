# Estimator PMC toggle before Tiers

Date: 2026-11-10
Status: implemented and verified under Mode A; two unchanged baseline test failures recorded in the task plan.

## Goal and evidence

Show one compact PMC on/off toggle immediately before Tiers in the estimation screen. The user confirmed that it must work for every editable Main Line and automatically handle the internal Standard/Special type.

Current code:

- `ConfiguredEstimateBuilder.tsx` places the shared pricing control after Tiers. Its editable controls are currently restricted to internally Special items.
- `EstimatePricingModeControl.tsx` combines the PMC switch with Vendor/In-house selectors. Standard items normally have no visible pricing control.
- `EstimateLineRow.tsx` defines the shared row order. Other callers, including Configuration preview and client quotation, must retain their current presentation.
- `ConfiguredEstimateBuilder.tsx` already remembers a line's non-PMC mode during an editor session. `updateConfiguredLinePricing` adopts Configuration prices on deliberate mode changes.
- `backend/src/routes/estimates.ts` rejects Standard items with PMC pricing. Selecting PMC must therefore send Special classification together with PMC mode, without changing the backend contract.

## Requirements and state transitions

1. For included estimator Main Lines, show only the compact PMC toggle before Tiers, in both visual and keyboard reading order. Remove the estimator's previous combined pricing control so there is no duplicate PMC control or Vendor/In-house selector. Keep Type/Standard/Special hidden.
2. The toggle is on when the saved/current pricing mode is PMC. It is available for both internal classifications when the editor can change pricing mode and current Configuration is available. Readonly or restricted rows show the state with interaction disabled; this does not expand permissions.
3. Turning PMC on applies `pricingMode: pmc` and `classification: special` atomically through the existing configured-price update path. Mere rendering does not rewrite data.
4. Turning PMC off restores the line's prior non-PMC mode and classification remembered in this editing context. If a saved PMC line has no remembered state, use Sub-Vendor with Standard classification. Existing In-house rows retain their saved components and pricing when restored. Clear remembered state when the estimate context changes, as today.
5. A toggle transition must use a usable configured price for the selected tier and target pricing method. Disable unavailable transitions with an accessible explanation; do not manufacture a rate or silently switch tiers. Tier prices and availability continue to follow the current pricing mode. Selling-rate fields remain disabled.
6. Preserve quantities, dimensions, configured prices, component calculations, compact Qty/Rate widths, field alignment, item eligibility, save/version checks and existing source refresh behavior. Use existing save fields and mutations; no schema, API, backend or data migration is required.

## Scope, assumptions and non-goals

The user's “just PMC toggle” means the estimator shows no separate Vendor/In-house choice beside it. Existing saved non-PMC data is preserved until an explicit toggle action. Configuration preview and client quotation remain outside scope; any shared presentation extension must be opt-in for the estimator and retain existing defaults elsewhere.

No unrelated styling, dependencies, permission changes, manual pricing, automatic tier selection, catalogue eligibility redesign, commit, deployment or customer-data mutation. Preserve all current uncommitted changes, including the prior removal of Type and compact-field work.

## Risks and acceptance checks

- Verify Standard → PMC submits Special + PMC with the configured price, then toggles back to the prior non-PMC state. Verify an existing Special/In-house line round trip separately so classifications and component selections cannot be mixed across lines or estimate contexts.
- Verify saved PMC reload, readonly and pricing-restricted rows, unavailable target prices, disabled rate inputs, and tier updates. Existing backend validation and capability checks remain authoritative.
- Render desktop and narrow-screen rows: exactly one PMC toggle precedes Tiers, no Type or Vendor/In-house selectors appear in estimator rows, keyboard order matches layout, and controls do not overlap or overflow.
- Run affected control/builder/workspace tests, frontend build and `git diff --check`. Preserve regression assertions for other shared-component callers. The preceding task independently confirmed two existing collaboration tests that incorrectly expect editable prices; report these separately if encountered again.

No open product decisions remain. Reverting the bounded frontend change restores the previous UI; no stored-data migration or external action is involved.

Verification: frontend build, independent integrity review and rendered responsive/interaction checks passed. The focused suite passed 206 of 208 tests; the two failures were previously confirmed baseline disabled-rate expectations. See the [completed task plan](../plans/2026-11-10-estimation-pmc-before-tiers.md) for exact evidence and limitations.

# Estimator in-house base rate and compact basket layout

Date: 2026-10-02  
Status: Implementation authorized by the user's request to proceed without approval gates.  
Related work: [Estimator basket selection](2026-10-02-estimator-main-basket-selection-design.md).

## Goal and current evidence

The configured estimator builder currently starts every new line with a blank selling rate. `GET /estimation/catalogue` projects item identity, revision, and UOM but no rate, while Configuration stores in-house Labor and Material `baseRatePaise` in the chosen revision's `advanced.modeCalculations`. The current builder stacks the name above quantity and rate inputs, shows redundant `Main Line` / `Temporary item` text under each name, and renders Main Baskets as permanently expanded sections.

## Scope and requirements

- Project one combined in-house base rate per catalogue item: Labor base rate plus Material base rate in integer paise. For legacy `modeCalculations.in_house`, use its single base rate once. A missing, partial, invalid, or overflowing pair is unavailable rather than zero. Project only the combined value, not cost breakdown or margin settings.
- Prefill each newly selected configured line's editable rate from that value. Preserve the line's entered rate and quantity during refresh, and preserve every persisted estimate snapshot. If the source rate changes during a refresh, flag the source change for review; do not silently replace an entered rate. A line without a configured in-house base rate retains the current blank-rate flow.
- Keep item name, checkbox, quantity, rate, and amount in one aligned row where width permits. Do not show the `Main Line` or `Temporary item` caption under the item name. Retain unit and Draft/Inactive source context where useful for internal estimating.
- Make each Main Basket collapsible with a keyboard-accessible button and explicit expanded state. Its heading continues to show the room subtotal; basket jump controls open the target before scrolling. Keep empty, saved, and unavailable sections understandable.
- Within a Main Basket that has available items, omit empty Sub Basket groups so they do not interrupt item selection. An entirely empty Main Basket retains its explanation.
- At narrower widths, let controls wrap without horizontal overflow. Preserve labels, focus indication, reduced-motion behavior, and read-only estimate state.

## Contract and constraints

`EstimatorCatalogueLine.inHouseBaseRatePaise: number | null` is additive. The value is derived from the selected source revision's `advanced` section using batched reads and is returned only to the existing authorized estimator catalogue audience. Estimate input, saved `ratePaise`, amount, GST, publication, and downstream contracts remain unchanged. The configured rate is an initial suggestion; Estimator/Sales may edit it using the existing selling-rate control. No Configuration data is written. No production mutation, commit, or deployment is part of this request.

Older catalogue services omit the additive field; the frontend treats it as unavailable and keeps the existing rate workflow. Existing saved lines always use their frozen rate. Rates use safe integer paise and the existing quantity rounding rule.

## Acceptance criteria

1. A configured item with Labor ₹420 and Material ₹630 arrives with a ₹1,050 base rate and a newly selected estimate line starts at ₹1,050; zero remains distinct from unavailable.
2. A malformed or partial in-house calculation does not invent a price. Existing saved rates and manual edits survive catalogue refresh.
3. Ordinary and temporary rows omit their type caption, align name, quantity, rate, and amount at desktop width, and remain usable without horizontal overflow on mobile.
4. Main Baskets open and close by pointer and keyboard. Jump navigation opens a closed basket. Totals and line edits remain correct while collapsed.
5. Focused backend/frontend tests, typechecks, builds, rendered interaction/accessibility checks, and repository hygiene pass or have recorded limits.

## Risks and assumptions

- The current Configuration model has separate Labor and Material base rates. Their exact integer-paise sum is the requested in-house base rate; impact and margin are intentionally excluded because the user named the base rate.
- Some eligible items may have no in-house calculation. Their rate remains blank until entered, preserving current behavior and avoiding false zero pricing.
- The worktree already contains uncommitted related estimator changes. This change must preserve them and stay within the catalogue projection and estimator UI.

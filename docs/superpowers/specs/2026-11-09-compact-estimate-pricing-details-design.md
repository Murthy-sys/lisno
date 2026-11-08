# Compact estimate pricing details

Date: 2026-11-09
Status: Implemented and verified in Mode A

## Goal and evidence

Combine the two pending UI requests: remove the static `Pricing / Vendor` block,
and make the expanded In-house section match the compact Main Line styling
across Sales, Designer and Client estimation.

`EstimatePricingModeControl.tsx` renders this block when `editable` is false
and the saved mode is `sub_vendor`. Staff and Client share this component.
`EstimateLineLayout` wraps its pricing slot; the desktop CSS currently reserves
a five-column layout whenever that slot exists. Hiding text alone could leave
an empty divider or column.

`EstimateInHouseComponents.tsx` renders a full-width fieldset, introductory
paragraph, component rows and selection issue. `EstimateComponentPricingStatus`
in `EstimateComponentBreakdown.tsx` can repeat the same issue below another
divider and renders a long generic secondary button. The screenshot's repeated
`Choose at least one In-house component` comes from these two presentations.
`useEstimateInHousePricing.ts` attaches a retry callback even when missing
selections prevent a pricing request, explaining the unnecessary action in
that state. Client has its own component fieldset in `ClientQuotationLine.tsx`.

## Requirements and scope

- Omit the read-only Vendor summary and reclaim its column, padding and divider.
  Preserve the compact desktop order: identity, Tier, Type, numeric fields/menu.
- Retain the editable Pricing controls, including PMC and Vendor/In-house
  choices, under their existing permission checks.
- Scope this removal to the static Vendor block in the screenshot. Other
  read-only mode values (PMC, In-house or Not recorded) retain their existing
  presentation; do not conceal a different or missing saved mode implicitly.
- Extend the shared pricing presentation and scoped row layout. Expected targets
  are `EstimatePricingModeControl.tsx`, its existing test, the relevant rules in
  `estimator-dashboard.css`, and existing consumer assertions affected by the
  removed text. Avoid duplicated role-specific behavior.
- Preserve disabled states, callbacks, saved modes, amounts and prior compact-row
  work. No API, pricing calculation, permission, data, dependency or service change.

## Compact In-house section

- Use a small `In-house components` heading and compact checkbox rows directly
  below the primary band. Target 12px heading/component text and 11–12px helper
  text on desktop, matching the existing typography and colors. Reduce padding,
  divider duplication and blank vertical space; avoid another oversized panel.
- Keep each component's checkbox, name and short availability/cost status close
  together. Allow long names and statuses to wrap naturally. Preserve component
  identity, selection/removal behavior and real missing-cost/unavailable states.
- Present the same selection warning once beside the component list. Preserve
  distinct calculation failures and actual validation messages; do not merely
  hide all feedback to make the section smaller.
- Show compact actions with concise visible labels, such as `Retry calculation`
  and `Use calculated rate`, retaining item-specific accessible names. Keep
  existing callbacks and their permissions. Do not show Retry for a blocking
  empty/invalid selection or missing configuration that must be resolved first;
  retain recovery for genuine calculation errors and eligible incomplete states.
- Remove redundant instruction copy where the heading and component controls
  already explain the action. Keep manual-rate versus calculated-rate meaning
  clear. Preserve ready/loading/error and manual-override behavior and amounts.
- Apply matching density to the Client component list within its existing
  permissions. Client does not gain manual-rate or classification editing.
- Scope compact breakdown/status styling to estimate Main Lines, preserving
  other financial/reporting uses of `EstimateComponentBreakdown`. Existing
  details disclosures remain available. Maintain keyboard focus, accessible
  labels and readable mobile controls with suitable touch targets.

Additional expected targets: `EstimateInHouseComponents.tsx`,
`EstimateComponentBreakdown.tsx`, `estimate-in-house-components.css`, the scoped
In-house presentation in `ConfiguredEstimateBuilder.tsx`, Client component-list
markup/styles, and their existing interaction/status tests. Calculation hooks,
API contracts, persistence and financial arithmetic remain outside the scope.

## Acceptance and verification

1. A non-editable Vendor row shows neither the Pricing/Vendor text nor an empty
   column or divider where it was displayed.
2. Editable Special rows still show working PMC and Vendor/In-house controls;
   other read-only mode values remain accurate.
3. Staff and Client rows retain one compact desktop band and readable mobile
   layout, with existing amounts and other fields unchanged.
4. Selecting In-house opens a compact component section consistent with the row;
   there are no oversized action labels or repeated identical selection errors.
   Component toggles, removal of unavailable selections, manual/calculated-rate
   actions and retry for recoverable errors retain their existing outcomes.
5. Empty, selected, unavailable, missing-cost, loading, calculation-error, ready
   and read-only component states remain honest and usable. Blocking selection
   issues do not display a misleading Retry action. Mobile remains readable.
6. Run focused shared/affected consumer regressions, rendered desktop/mobile
   checks, frontend typecheck/build and `git diff --check`. Preserve unrelated
   dirty work; no broad backend/OCR or full workflow retest is needed.

Assumptions: the first screenshot identifies the static Vendor summary, not the
editable pricing controls requested earlier; the second requests presentation
cleanup using the existing pricing flow. Risks are vacant grid space, hiding
distinct errors while removing duplicates, accidental changes to retry behavior,
and compact styles leaking into other financial views. Focused state tests and
scoped rendered checks must cover these. No open product decision.

# Configurable Priced Quantity Slabs Design

**Status:** Implemented — automated verification complete; live-browser viewport capture unavailable in this session  
**Date:** 2026-09-02  
**Scope:** Configuration → Main Basket → Main Line → Mode → Quantity & margin → Quantity slabs  
**Revises:** [Main Line Descriptive Specifications Design](2026-09-02-main-line-descriptive-specifications-design.md) only to permit a descriptive Specification ID to categorize a priced slab estimate; Specifications remain excluded from immutable vendor-price selection

## Decision summary

**Add Quantity slab** will create a user-friendly priced slab row. The user will
select one Specification already configured in the same Main Line, select one
UOM from the reusable UOM list, enter a quantity, and enter a per-unit slab
rate in rupees. The row will immediately show a read-only **Estimated cost**:

`Estimated cost = Quantity × Unit rate`

For this design, the user's “slab rate” means the per-unit rate entered for the
row. Estimated cost is the row's pre-tax, pre-margin quantity cost; it is not a
final selling price.

The new row is additive and stored in a distinct `slabRates` list. Existing
`quantitySlabs` range/adjustment rows remain readable and editable as legacy
adjustment rules so saved revisions are not rewritten and current context
calculation behavior is not silently changed.
New priced slabs configure and display their own estimated cost, but do not yet
override immutable price versions or become an automatic runtime/context price
source. That source-precedence decision requires a separate estimator-integration
specification.

## Goal

Make Quantity slabs understandable and useful without requiring users to enter
minimum/maximum ranges or basis points for the requested workflow. A user can
connect a slab to the Specification and UOM they already configured, enter the
commercial inputs they understand, and see the resulting estimated slab cost
before saving.

## Current behavior and evidence

- `quantity-margin.payload.quantitySlabs[]` currently accepts only
  `{ id, minimumQuantity, maximumQuantity, adjustmentBps }`.
- The current editor exposes **Stable ID**, **Minimum quantity**,
  **Maximum quantity**, and **Adjustment (basis points)**.
- Backend validation treats those rows as ordered non-overlapping ranges and
  requires `gapBehavior` whenever range slabs exist.
- Runtime context selects a range by requested quantity, applies its basis-point
  adjustment to an immutable effective price version, and otherwise follows the
  configured gap behavior.
- Specifications are stored in `pricing.payload.specifications[]` and use stable
  IDs. Their current values are descriptive metadata, not price inputs.
- Reusable UOM records carry the decimal scale needed to validate quantity.
- Money inputs and results use integer paise. The existing deterministic
  `multiplyMoneyByQuantity` calculation rounds half-up to the nearest paise and
  rejects unsafe results.
- Mode keeps separate Pricing and Quantity & margin drafts and saves dirty
  sections with section CAS and Main Line aggregate CAS. Pricing currently saves
  before Quantity & margin, which allows a newly added Specification to be saved
  before a new slab references it.
- Existing immutable price versions already provide vendor, tax, effective-date,
  and lineage behavior. Treating the new inline slab rate as an automatic
  replacement would create unresolved precedence and lineage rules.
- The worktree contains approved, uncommitted Overview and Quantity & margin UI
  changes. Implementation must preserve those changes and avoid unrelated
  formatting or rewrites.

## Options considered

### 1. Add a distinct `slabRates` sibling while retaining legacy rules — selected

- Meets the requested Specification, UOM, quantity, rate, and estimated-cost
  workflow directly.
- Preserves historical data and the existing context calculation.
- Clearly separates a slab estimate from immutable vendor-price history.
- Keeps the two formulas unambiguous and requires additive strict validation and
  reference handling.

### 2. Require selection of an immutable price version

- Preserves one price source and complete vendor/tax lineage.
- Does not meet the requested direct unit-rate entry and forces unrelated vendor,
  tax, status, and effective-date inputs into a simple slab workflow.

### 3. Replace range/adjustment slabs everywhere

- Produces the simplest new editor.
- Would reinterpret existing data, break current quantity-adjustment resolution,
  and require an unapproved rule for how the new rate competes with effective
  price versions.

## User workflow

1. The user opens **Main Line → Mode → Quantity & margin**.
2. The **Quantity slabs** block explains that each new row estimates one
   Specification/UOM quantity at a per-unit rate.
3. The user selects **Add Quantity slab**.
4. A new priced row appears with these controls in order:
   - **Specification** — required dropdown sourced from the current Pricing draft;
   - **Unit of measure** — required dropdown sourced from reusable UOMs;
   - **Quantity** — required positive canonical decimal;
   - **Unit rate (₹)** — required non-negative rupee input with at most two
     decimal places; and
   - **Estimated cost** — read-only formatted rupee value.
5. The estimate updates immediately when Specification, UOM, quantity, or unit
   rate changes. Specification does not alter the arithmetic, but it identifies
   which configured component owns the estimate.
6. Reorder and delete controls retain the established accessible behavior.
7. The existing Mode-level Save/Discard workflow persists or discards the row.
8. After a successful save, the row stays editable in the mounted Draft and uses
   the authoritative returned section and aggregate versions.

## UX requirements

### Specification dropdown

- Options come from `drafts.pricing.payload.specifications`, so a valid
  Specification added or renamed in the same unsaved Mode session appears
  immediately.
- Options display the Specification label/name; raw stable IDs are never the
  primary visible text.
- Rows with an empty or invalid label are not selectable and remain governed by
  Pricing validation.
- If no selectable Specification exists, the control is disabled and displays
  **Add a Specification in Pricing first**.
- A slab keeps `specificationId` as its join key across renames.
- Using the ID here categorizes the slab estimate. It does not make the
  descriptive Specification itself a price source or alter price arithmetic.

### UOM dropdown

- Options come from the active reusable UOM list already loaded for the Main
  Line workspace. The workspace must load every available page, not only the
  first page, before presenting the complete list.
- Options show the established UOM label/code presentation.
- A previously selected non-active UOM may be shown as unavailable for an
  existing row, but it cannot be newly selected or silently replaced.
- If no active UOM exists, the control is disabled and displays
  **Add a Unit first**. The existing Overview **Add Unit** workflow remains the
  way to create a reusable UOM; this scope does not duplicate that form.
- Changing UOM revalidates Quantity against that UOM's `decimalScale`.
- During initial UOM loading, the dependent controls are disabled with a named
  loading state. An initial load failure shows an alert and Retry; a background
  refresh retains cached options with non-blocking stale-data guidance.

### Quantity, rate, and estimate

- Quantity must be greater than zero and may contain no more fractional digits
  than the selected UOM permits.
- Unit rate is entered in rupees, converted once at the frontend/API boundary,
  and persisted as non-negative safe-integer paise.
- Empty or invalid Quantity/Unit rate displays **Estimated cost —** and an inline
  field error after validation is triggered; it never displays a stale result.
- A valid zero rate is displayed as **₹0.00** and is not treated as missing.
- Estimated cost uses selected UOM quantity scale and half-up paise rounding.
  Example: quantity `12.5` × unit rate `₹80.00` = **₹1,000.00**.
- Estimated cost excludes GST, wastage, start/bottom margin, and PMC markup.
  Supporting copy states: **Before tax, wastage, margins, and markup.**
- Estimated cost is derived, is never editable, and is never persisted in the
  section payload.

### Legacy rows

- A stored row with `minimumQuantity`, `maximumQuantity`, and `adjustmentBps`
  remains a **Legacy adjustment slab** and retains its current fields and
  calculation behavior.
- New rows always append to `slabRates`; the Add action does not create another
  legacy `quantitySlabs` range rule.
- Legacy and priced lists may coexist. No automatic conversion is offered because
  Specification, UOM, and unit rate cannot be inferred safely.
- `gapBehavior` is required and evaluated only when at least one legacy range
  rule exists. Adding only priced rows does not manufacture `gapBehavior`.
- Stable IDs remain in payloads and accessible diagnostics but are not displayed
  as primary editable fields in the priced-slab card.

### Responsive and accessible behavior

- Desktop uses the existing slab card/grid style; controls wrap without
  horizontal page overflow at tablet and mobile widths.
- Every control has a persistent label and row-specific accessible description;
  the derived value is exposed as **Estimated cost: …**.
- Validation summaries focus or link to the corresponding row field.
- Reorder and delete buttons keep explicit accessible names that identify the
  slab position.
- Draft, Active, superseded, archived, loading, saving, conflict, and unauthorized
  states retain the established read-only/disabled behavior.
- Keyboard-only editing, error recovery, and deletion confirmation behavior must
  remain usable.

## Data contract

### New priced slab-rate row

```json
{
  "id": "knowledge-slabRates-opaque-id",
  "specificationId": "knowledge-specification-opaque-id",
  "uomId": "uom-opaque-id",
  "quantity": "12.5",
  "unitRatePaise": 8000
}
```

Rules:

- `id`, `specificationId`, and `uomId` are bounded stable IDs.
- `quantity` is a positive canonical decimal string validated against the
  selected UOM's decimal scale.
- `unitRatePaise` is a non-negative safe integer no greater than the established
  knowledge money limit.
- `estimatedCostPaise` is not accepted in writes and is not stored.
- The tuple `(specificationId, uomId, quantity)` must be unique within
  `slabRates`; the stable row `id` must also be unique.

### Compatible legacy slab

```json
{
  "id": "quantity-slab-existing-id",
  "minimumQuantity": "0",
  "maximumQuantity": "200",
  "adjustmentBps": 500
}
```

Legacy `quantitySlabs` keeps its exact existing contract. New `slabRates` has
its own exact row contract; unknown or legacy range fields in a slab-rate row are
rejected rather than guessed.

## Calculation contract

For selected UOM scale `s`:

1. Parse Quantity into a scaled integer using `s`.
2. Multiply `unitRatePaise × scaledQuantity` using integer arithmetic.
3. Divide by `10^s`, rounding half-up to the nearest paise.
4. Reject negative, non-canonical, excessive-scale, or safe-integer-overflow
   inputs/results.

The backend uses the established domain calculation helper as the authoritative
validation rule. The frontend produces the same immediate preview with exact
decimal/integer arithmetic and covered parity examples; binary floating-point
money arithmetic is not allowed.

## Backend, API, and persistence impacts

- Add the public `KnowledgeSlabRate` contract, allow `slabRates` in the strict
  Quantity & margin payload, and retain the existing quantity-slab contract
  unchanged.
- Keep both `quantitySlabs` and `slabRates` inside the existing Quantity & margin
  section document; no collection or schema migration is required.
- Validate every priced slab's Specification against the same revision's Pricing
  section and its UOM against the reusable UOM collection inside the existing
  section-update transaction.
- Validate duplicate IDs, required references, quantity scale, money bounds, and
  derived-cost overflow server-side.
- Add `payload.slabRates.specificationId` to Specification reference protection
  and `payload.slabRates.uomId` to UOM reference/archive impact
  checks.
- Block a referenced UOM's decimal-scale change because it would reinterpret
  stored Quantity; label/code-only edits may continue without changing IDs.
- Extend Pricing response reference state so the Specification builder knows
  about slab references as well as immutable historical price references.
- A referenced Specification cannot be removed until its priced slabs are
  removed and saved. The UI explains this dependency. Adding a Specification and
  its slab in one Mode save remains supported because Pricing saves first.
- Keep the existing authorization operation, section/aggregate CAS, transaction,
  audit action, payload bounds, clone behavior, and activation lifecycle.
- Document the new slab-rate array and unchanged legacy slab array in OpenAPI and
  update request/response examples.
- Do not write derived cost into audit details or operational logs.

## Frontend impacts

- Pass the live Pricing Specification draft into the Quantity & margin editor.
- Render `slabRates` as priced cards and retained `quantitySlabs` as clearly
  labeled legacy adjustment rules.
- Add exact rupee-input parsing/formatting and derived-cost presentation using
  existing knowledge money conventions.
- Extend client validation to require Specification/UOM/Quantity/Unit rate and
  produce row-specific errors.
- Include priced-slab Specification IDs in deletion protection before save.
- Preflight every dirty Mode draft and all live cross-section references before
  sending the first section update, so a client-detectable invalid slab cannot
  partially save an earlier Pricing edit.
- Preserve unrelated Quantity & margin properties on every edit, reorder,
  delete, save, discard, conflict review, and authoritative response rebase.
- Keep Overview's aggregate Quantity slab count, updated to include priced and
  legacy rows; detailed priced-slab presentation in Overview is outside scope.

## State, failure, and compatibility behavior

- Validation failure keeps all local row inputs and focuses actionable errors.
- Network or server failure keeps the local buffer and last valid derived values
  recompute only from current inputs.
- A section or aggregate CAS conflict uses the existing conflict review; no
  automatic merge is introduced.
- If Pricing saves successfully but Quantity & margin fails during the same Mode
  save, the new Specification remains saved and the slab remains dirty for retry,
  matching the existing ordered partial-save behavior.
- Existing active/archived revisions and immutable price versions are not
  rewritten, backfilled, or reinterpreted.
- Existing legacy range slabs continue to affect context quantity adjustment.
  Priced slabs are ignored by that resolver in this scope and cannot accidentally
  override an effective price version.
- Duplicate Main Line/revision behavior preserves priced rows and stable
  references using the established revision-copy rules.
- Rollback is code rollback: stored priced rows remain valid JSON but require the
  compatible reader/validator to edit. No production mutation or destructive
  rollback is part of implementation.
- Any later release must deploy backend read/write support before enabling the
  frontend writer because the current strict validator rejects `slabRates`.

## Permissions and security

- Backend `update_section` authorization remains authoritative.
- Only an editable Draft and an actor with the existing update permission may
  add, edit, reorder, or delete slabs.
- Read-only actors and non-Draft revisions may view configured values but cannot
  mutate them.
- Dropdown labels are presentation only; stable IDs are the sole reference keys.
- API clients cannot submit trusted `estimatedCostPaise` or bypass UOM scale,
  Specification ownership, money-bound, or reference validation.

## Scope

- New additive `slabRates` contract with unchanged legacy `quantitySlabs`.
- Specification and UOM selectors in the Add Quantity slab workflow.
- Quantity and unit-rate inputs.
- Immediate, read-only estimated-cost calculation.
- Cross-section Specification reference protection and UOM reference protection.
- Backend validation, OpenAPI, frontend UX, and focused regression coverage.

## Non-goals

- No automatic use of priced slabs as the runtime/context price source.
- No change to immutable vendor price/tax versions or their effective windows.
- No combined final selling-price formula.
- No GST, wastage, margin, PMC, or productivity application to Estimated cost.
- No automatic conversion or destructive migration of legacy range slabs.
- No new UOM or Specification master/catalog workflow.
- No detailed priced-slab block in Overview.
- No deployment, seed, backfill, production write, commit, or push.

## Risks and mitigations

- **Two price concepts may be confused:** label the input **Unit rate** and the
  output **Estimated cost**, explain their limited scope, and do not change
  effective-price resolution.
- **Dangling Specification/UOM references:** validate in the transaction and add
  archive/removal protection paths.
- **Money drift:** persist paise, parse canonical decimals, use integer math and
  half-up rounding on both sides, and test parity.
- **Legacy regression:** use separate exact arrays and keep legacy resolver tests
  unchanged.
- **Cross-section partial save:** preserve the established Pricing-first order,
  retain a dirty slab after failure, and require referenced slabs to be removed
  and saved before deleting their Specification.
- **Crowded mobile rows:** use the existing responsive card layout, wrap fields,
  and verify representative narrow widths and long labels.

## Verification requirements

- Backend contract/validation tests for both exact arrays, wrong-field rejection,
  duplicate IDs, missing/dangling references, archived UOM, UOM decimal scale,
  invalid/overflow money, and derived-cost overflow.
- Domain calculation tests for whole, fractional, zero-rate, half-up rounding,
  maximum-safe, and overflow cases.
- Replica-set service tests for transactional cross-section validation,
  Specification removal protection, UOM archive protection, CAS rollback, and
  legacy resolver preservation.
- OpenAPI inventory/schema tests for the new slab-rate array and unchanged
  legacy slab array.
- Frontend editor tests for empty states, live same-draft Specification options,
  UOM options, input parsing, estimate updates, stale-estimate clearing,
  validation, reorder/delete, read-only states, and legacy rendering.
- Mode integration tests for add/save/edit/save, authoritative rebase,
  Pricing-before-Quantity ordering, partial failure/retry, discard, and conflict.
- Rendered accessibility checks and desktop/tablet/mobile interaction checks.
- Frontend and backend focused suites first, then each affected workspace's
  typecheck, full test suite, and build, followed by `git diff --check` and
  `git status --short`.

## Acceptance criteria

1. Selecting **Add Quantity slab** creates a `slabRates` priced row, not a legacy
   range/basis-point row.
2. The row selects a Specification from the current same-Main-Line Pricing draft
   by stable ID and reflects valid additions/renames without a reload.
3. The row selects an active reusable UOM by stable ID and validates Quantity to
   that UOM's decimal scale.
4. The user can enter a positive Quantity and non-negative Unit rate in rupees;
   the payload persists canonical Quantity and integer `unitRatePaise`.
5. A valid row immediately displays Estimated cost as Quantity × Unit rate with
   deterministic half-up paise rounding and clear exclusions.
6. Empty or invalid inputs never show a stale estimate, and zero rate displays
   correctly as ₹0.00.
7. Estimated cost is read-only, is not accepted from the client as authoritative,
   and is not persisted.
8. Backend validation rejects wrong row fields, duplicate
   Specification/UOM/Quantity tuples, cross-revision/dangling Specifications,
   unavailable UOMs, excessive decimal scale, and unsafe money.
9. Referenced Specifications and UOMs cannot be removed/archived through a race
   or bypass path.
10. Add, edit, reorder, delete, Save, Discard, retry, and CAS-conflict workflows
    preserve unrelated Mode data and authoritative versions.
11. Existing legacy adjustment slabs remain readable/editable and retain their
    exact context calculation behavior; no historical row is auto-converted.
12. New priced slabs do not override immutable prices or claim to be a combined
    final selling price.
13. Active, superseded, archived, and unauthorized views remain read-only.
14. The editor is usable by keyboard, has explicit accessible names/errors, and
    does not overflow representative mobile widths.
15. Focused and affected full verification passes with no unintended source,
    migration, dependency, or lockfile changes.

## Assumptions

- “Slap” means “Slab.”
- “Slab rate” means the entered per-unit rate.
- “Estimated price/cost for the slab” means Quantity × Unit rate before tax,
  wastage, margins, and markup.
- Specifications and UOMs are selected by stable ID from existing Main Line and
  reusable-master sources respectively.

## Open decisions

None. Approval confirms the assumptions and the explicit boundary that priced
slabs calculate a configured row estimate but do not yet replace runtime
effective-price resolution.

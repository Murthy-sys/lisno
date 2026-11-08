# Main-line row matching the supplied reference

Date: 2026-11-08
Status: Compact desktop revision implemented and verified

## Compact desktop revision

The latest user screenshot shows Qty, Rate, amount and menu wrapping beneath
the identity and classification controls. The user explicitly requests smaller
fonts to retain the primary controls on one desktop row. This revision replaces
the earlier requirement to preserve the reference's larger type at narrower
desktop widths.

At follow-up inspection, CSS reserved approximately 1,685px across identity (280px), Tier (350px),
Type (235px), Pricing (345px) and numeric fields (475px), before the outer row
padding. The fixed five-column grid started only at 1,660px of inner row width.
Standard/read-only Pricing reserved the same space as the full editable control.
Reducing text alone will therefore not prevent wrapping.

For this small follow-up, adjust the existing scoped row CSS: reduce desktop
item/amount text to about 14px, labels/options to 11–12px, numeric text to 13–14px,
thumbnail to about 36px, and group padding/gaps. Replace oversized group widths
with compact sizing that allows the complete editable Special row to fit at
approximately 1,050px of available inner row width. Standard/read-only Pricing
should use only the width its content needs. Keep larger widths compact too.

Acceptance for this revision:

- At 1,050, 1,200, 1,500 and 1,760px of available row width, primary identity,
  Tier, Type, Pricing, Qty, Rate, amount and menu remain in one horizontal band
  for the supplied sample and its editable Special/PMC variant.
- Verify the actual 1440px editor with its sidebar, for Sales/Designer and Client.
  All controls and numeric values remain readable with no overlap or clipping.
- Preserve the same order, permissions, callbacks, saved-amount meaning, focus
  and disabled states. Availability messages, dimensions and component details
  remain visible below the primary band. Long names may wrap within identity.
- Below the viable desktop width, retain responsive wrapping and readable mobile
  fields/touch targets. Do not force a 390px screen into an unreadable single row.
- Inspect actual rendered desktop/mobile states, run frontend typecheck/build
  and `git diff --check`. Reuse existing interaction tests when control markup
  changes; no new tests that merely restate CSS values.

Expected scope is `frontend/src/styles/estimator-dashboard.css`, with a scoped
Client override adjustment only if browser evidence requires one. No API,
pricing, permission, data, dependency, service or workflow changes. Main risk is
over-compression of long names or numeric values; browser measurements and a
responsive fallback must address it. No open product decision.

## Goal and reference

Match the user's supplied 1761 × 125 image for the estimation Main Line row.
The reference is the visual source of truth for composition, density, typography,
control shapes, dividers, selected states and subtle edge treatment.

Desktop order:

**Checkbox → thumbnail + name/UOM → Tier → Type → Pricing → Qty → Rate → amount → menu**

Apply the shared presentation to Sales, Designer and Client estimation, using
each role's currently permitted controls and existing financial values.

## Original behavior before reference styling

- `frontend/src/features/estimates/EstimateLineRow.tsx` provides the shared row,
  item choice, tier selector and actions. Its DOM places numeric fields before
  options, and the checkbox is overlaid on the thumbnail.
- `ConfiguredEstimateBuilder.tsx` and `client/ClientQuotationLine.tsx` supply
  their own controls and pricing behavior to that shared presentation.
- `estimator-dashboard.css` positions options on a separate full-width line;
  later compact-builder overrides reduce text and controls. Client-specific
  flex overrides in `clientQuotation.css` also force options below the item.
- `EstimatePricingModeControl.tsx` already owns the PMC switch and non-PMC radios.
  Its behavior and server-driven eligibility must survive the restyling.
- The repository has an appropriate existing ceiling image at
  `frontend/src/assets/main-baskets/pop-gypsum.webp`; no generated image or new
  image dependency is needed for the reference's thumbnail treatment.

## Visual requirements

1. Form one compact horizontal desktop band at the widths specified in the
   compact desktop revision, with all primary groups vertically aligned. Use the reference's
   thin pale-green outline, rounded perimeter, light surface and faint elevation.
   These explicitly requested reference details govern this component's styling.
2. Keep the checked inclusion control to the left of the thumbnail. Use a roughly
   36px desktop image, a prominent dark title and the muted UOM on its own line below.
   Match the reference's spacing; do not overlay the checkbox on the image.
   Keep actual item names, units and images/data bindings, rather than copying
   the reference's example values into other items.
3. Place compact visible labels **Tier**, **Type** and **Pricing** above their
   control groups. Use fine vertical dividers between identity and each main
   group, matching the reference. Keep DOM/tab order consistent with visual order.
4. Render Signature/Premium/Functional and Standard/Special with the reference's
   compact rounded controls, outlined unselected state and pale-green selected
   state with a strong green radio indicator. Preserve disabled/checked semantics.
5. Pricing contains **PMC** and a rounded switch, followed by **Vendor** and
   **In-house** while PMC is off. Match the switch and selected-radio appearance
   in the reference. The visible Vendor label still means the existing
   `sub_vendor` value; no enum, rate rule or stored value changes.
6. Keep **Qty (UOM)** and **Rate (₹/UOM)** labels above aligned controls. Match the
   compact minus/value/plus stepper, input borders, spacing and readable values.
   Emphasize the amount in the reference's pale-green block with bold dark text;
   place the existing vertical menu at the far right. Preserve contextual
   accessible names even where visual labels are shorter.
7. Keep the existing application font family. Use approximately 14px item/amount
   emphasis, 11–12px labels/options and 13–14px numeric text on desktop, together
   with reduced control gaps and widths, to preserve the single primary band.
   Keep mobile input text readable and preserve accessible touch targets.
8. Retain long item names without obscuring controls. Put exceptional information
   such as unavailable-tier reasons, draft-source notes, required dimensions,
   In-house components and validation below the main band when needed. The clean,
   fully configured row matches the reference; genuine extra state can increase
   its height. Do not erase useful failure information to obtain a fixed height.

## Responsive and role behavior

Use the width available to the row, accounting for navigation/sidebar space.
Keep the compact primary band on one row at desktop widths defined above. Below
that viable width, wrap into deliberate aligned bands in the same reading order,
with accessible touch targets and no page-level horizontal scrolling.

Preserve native checkbox/radio interaction, switch keyboard behavior, visible
focus, menu focus return and accessible item/room context. Avoid animations that
change the geometry or add unnecessary interaction effects.

Sales and Designer retain their existing editable Type controls. Client does
not gain classification editing; show its known Type as a compact read-only
value in the same position, without guessing missing classification. Standard
items remain Sub-Vendor; mode controls retain the approved phase/assignment
matrix. Read-only rows show their actual selections without acquiring editability.

Client saved amounts must remain identified as saved while edits are pending;
new items and missing prices keep their honest pending/after-save state. Styling
must not imply that a saved amount has been recalculated before the existing
save flow completes. Configured/base-price annotations remain hidden.

## Scope, architecture and non-goals

Extend the existing shared row with explicit presentation slots where needed,
and update both consumers. Keep permissions, draft state, mode memory, API calls,
calculations and validation in their existing owners. Scope styles to estimation
rows and reconcile existing compact/Client overrides so they cannot undo the
reference layout. Avoid visual reordering that leaves keyboard order incorrect.

Scope is row presentation and necessary compact-label changes. No backend/API,
approval, pricing, rounding, persistence, basket-picker or footer redesign; no new
dependency, font package, migration or generated asset. Preserve the recently
fixed Refresh items capability reload and unsaved-edit protection.

## Acceptance criteria and verification

- **AC1 Reference match:** At approximately 1760px of row width, compare the same
  sample content against the supplied image. Verify one-row order, checkbox/image
  placement, dividers, title/UOM hierarchy, control styling and amount emphasis.
  Inspect actual browser screenshots, not only a standalone mockup.
- **AC2 Shared roles:** Sales/Designer editable rows and Client/read-only rows
  share the visual treatment while preserving permitted actions and saved values.
- **AC3 Functional preservation:** Tier/type/mode changes, both PMC round trips,
  quantity stepping, manual rate edits and menu actions retain existing behavior.
  Standard restrictions, role/phase restrictions and Refresh items recovery pass.
- **AC4 Responsive/states:** Inspect reference width and real editor containers at
  desktop, tablet and 390px mobile widths, with long labels, missing rates,
  unavailable tiers, dimensions, In-house components and excluded/read-only rows.
  No clipped control, overlapping text or page overflow; keyboard and touch work.
- **AC5 Checks:** Run focused shared-row, pricing-control, staff builder/workspace
  and Client row/workspace regressions, frontend typecheck/build and
  `git diff --check`. No backend/OCR suite is needed for presentation-only changes.

## Risks, constraints and open decisions

Main risks are existing CSS overrides, primary controls reflowing unpredictably,
lost keyboard order, truncated real names and hidden validation. Shared markup,
scoped styles and actual-container browser comparisons address those risks.

Capture current dirty target diffs before implementation and preserve earlier
work. Use synthetic data for screenshots; remove owned temporary artifacts after
inspection. No service restart, customer-data mutation, staging, commit, push or
deployment is required for this frontend styling change.

No open product decision: the supplied image defines the visual direction.
The original implementation and its verification are recorded in the matching
task plan. The compact desktop revision and its follow-up plan are approved;
Mode A implementation and verification are complete.

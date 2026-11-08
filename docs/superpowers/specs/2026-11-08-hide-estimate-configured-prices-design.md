# Hide configured reference prices in estimation

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal

Remove the extra configured-price annotation from estimate item details, as
highlighted in the user's screenshot. Keep the actual selling-price field and
item amount visible.

## Current behavior and evidence

`frontend/src/features/leads/ConfiguredEstimateBuilder.tsx:473–479` renders the
pricing mode followed by a reference-price paragraph. That paragraph shows
`Configured price: ₹… / unit`, `Configured price not configured`, or the In-house
variant `Base price`. It duplicates pricing information beside the primary Price
field. The shared builder supplies the staff estimation item rows.

Existing builder, selling-price and workspace tests assert the reference text.
These files already contain earlier changes that must be preserved.

## Requirements and scope

1. Remove the supplemental configured/base reference-price paragraph beside
   Pricing mode in the shared estimate builder, including its unavailable-price
   placeholder. Do not leave an empty layout slot.
2. Keep Pricing mode, Configuration tier, Item type, the editable selling Price,
   quantity and calculated Amount. Simplify the fallback mode label to
   `Sub-Vendor` instead of mentioning the hidden configured price.
3. Preserve configured-rate lookup and automatic selling-price updates on
   deliberate tier/mode changes. Preserve manual overrides, component pricing,
   item totals, saved values, missing-price validation and submission behavior.
4. Preserve meaningful tier availability messages and component calculation
   controls. This is a display-only change, not a pricing-policy change.

## Assumptions and non-goals

The screenshot identifies the extra reference annotation, not the estimate's
selling prices. Client quotation prices, Configuration administration, component
input prices, totals and published/historical documents are outside this change.
No backend, API, persistence, permission, dependency or migration changes.

## Risks and verification

Removing reference-display variables must not remove values used by pricing or
tier validation. Update affected existing tests to assert selling prices and
amounts instead of using removed text as a loading signal. Check the rendered
item row has no reference annotation and that the pricing controls remain usable.
Run affected focused frontend tests, frontend typecheck/build and
`git diff --check`; preserve unrelated dirty work.

## Acceptance criteria

- No extra Configured price/Base price annotation beside Pricing mode.
- Selling price and Amount remain visible and correct after tier/mode changes
  and manual edits; validation remains intact.
- Sales and Designer receive the same cleaned-up shared item row.
- The row remains readable at desktop/mobile widths without an empty gap.

## Open decisions

None.

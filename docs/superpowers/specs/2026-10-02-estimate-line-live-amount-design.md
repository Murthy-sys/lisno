# Live amount in configured estimate line rows

## Goal

Show the monetary result of **quantity in the item's UOM × selling price per that UOM** directly in each configured estimate row as either field changes. In the supplied example, 100 sq-ft at ₹60/sq-ft displays ₹6,000 in the row without waiting for a checkbox click, blur, or save.

## Current behavior and evidence

- `ConfiguredEstimateBuilder.tsx` renders Quantity, Price (₹/UOM), and Amount for each Main Line or temporary item. Its input handlers update `ConfiguredLineDraft` immediately through `LeadEstimateWorkspace.updateConfiguredLine`.
- New lines start with `included: false` in `configuredEstimate.ts`. The row calls `configuredLineAmountPaise(line)`, whose first branch returns `0` whenever `included` is false. This is why a valid entered quantity and price can still show ₹0 in the row.
- The same inclusion-aware helper feeds Main Basket, Sub Basket, room, and estimate subtotals. The backend independently calculates persisted configured-line amounts from integer paise and UOM-scaled quantity, and assigns zero to excluded lines. The selection checkbox therefore has an established financial meaning beyond row display.
- The current dirty worktree contains ongoing edits in the builder, amount helper, workspace, tests, and backend. Preserve those edits and distinguish this presentation fix from unrelated estimate and catalogue work.

## Recommended behavior

1. Calculate a **row amount preview** from the row's current quantity and selling price whenever both inputs are valid, regardless of whether the item is selected. Update it on every input change and quantity stepper action. The preview uses the existing paise arithmetic and configured UOM decimal precision, including the existing half-up paise rounding and safe-integer limit.
2. Show the same UOM on both field labels, for example `Quantity (sq-ft)` and `Price (₹/sq-ft)`, using the row's source or saved UOM name. Do not infer an alternate unit or convert between area, length, and count units.
3. Keep the checkbox as the only action that includes the line in basket, room, GST, and estimate totals. An unchecked row may show a ₹6,000 amount preview while its contribution to those totals remains ₹0. Present the unchecked state clearly beside or within the row amount so the preview is not mistaken for an included subtotal.
4. For an empty or invalid price or quantity, show a neutral pending/invalid amount state instead of ₹0 or a stale amount. Retain the existing validation and submit blocking for selected lines. A valid zero selling price may display ₹0; zero quantity remains invalid when an item is selected.

The preferred implementation is a pure, inclusion-independent preview calculation sharing the existing arithmetic with the inclusion-aware subtotal calculation. Automatically checking a row when a field changes would alter financial scope during ordinary editing, so it is outside this change.

## Scope and non-goals

**In scope:** configured item-selection row calculation and labels; a shared frontend calculation helper if needed to avoid diverging formulas; focused calculation and rendered interaction tests for Main Lines, temporary items, selected/unselected states, UOM precision, rounding, and invalid inputs; responsive/accessibility check of the row feedback.

**Out of scope:** backend calculation or API schema changes, catalogue UOM definitions, room-dimension-based quantity defaults, price prefilling, item inclusion semantics, saved draft payloads, GST rules, approved estimate lineage, publication, procurement, migrations, and changes to legacy estimate rows.

## Financial and state invariants

- Treat price as rupees per the line's configured UOM at the input boundary, parse to integer paise, scale quantity by that UOM's decimal precision, multiply with integers, and round once to paise using the backend-equivalent half-up rule. Reject unsafe results rather than display an invented number.
- A row preview is transient UI feedback. `configuredLineAmountPaise`, basket/room/estimate totals, the saved payload, and backend-persisted `amountPaise` remain inclusion-aware. Excluded lines continue to contribute zero to stored and aggregate amounts.
- UOM ID/name/precision and source snapshot lineage remain as supplied by the catalogue or saved estimate. A source UOM change still requires the existing review flow. The user-entered quantity is interpreted only in the currently displayed UOM; no automatic conversion occurs.
- Rate blank, invalid rate, invalid quantity, and valid zero rate remain distinct states. Preserve the existing gates: a selected blank rate may be saved as an incomplete draft but blocks Submit; malformed selected or persisted values block Save and Submit; a new unchecked line is not sent in the payload. The preview must not mask existing field errors.
- Calculation updates are local while editing and cause no network request or persistence write until the user invokes an existing save action.

## UX and accessibility requirements

- The amount changes immediately when a valid price or quantity is typed, cleared, or changed by stepper. For the screenshot case, 100 × ₹60 displays ₹6,000; 1 Rft × ₹60/Rft displays ₹60. Decimal UOM values display backend-equivalent paise rounding.
- The quantity and price fields remain individually labelled with the same UOM, and the amount output keeps an item-specific accessible name. A screen-reader user can distinguish the preview from the included subtotal and understand whether the line is selected.
- Long UOM names and pending/error text wrap or fit without covering adjacent controls at desktop and mobile widths. Focus and keyboard operation remain visible and unchanged.

## Risks and verification

- The main risk is accidentally using preview values in financial totals or saved payloads. Test an unchecked line with nonzero fields and then check/uncheck it, asserting row preview continuity and exact basket/room/estimate total changes.
- Match the backend formula at fractional quantity and rate boundaries, including a half-paise rounding example, zero rate, UOM precision error, and safe-integer overflow.
- Run focused frontend tests, typecheck, build, `git diff --check`, and rendered keyboard/mobile checks. Inspect the final diff against the pre-existing dirty hunks. Backend tests are only needed if the backend formula or contract is changed; neither is proposed.

## Acceptance criteria

1. With a new, unchecked configured line, entering quantity 100 and price ₹60 per its UOM displays ₹6,000 in that row immediately, while basket, room, and estimate totals remain zero.
2. Checking that line includes exactly ₹6,000 in the applicable subtotals and GST calculation; unchecking removes it without clearing the fields or changing the row preview.
3. Main Lines, direct and grouped temporary items, and saved configured rows use the same calculation and their actual UOM labels/precision. Decimal values and rounding match backend paise arithmetic.
4. Blank, invalid, zero, overflow, and changed-source UOM states do not show misleading amounts or bypass existing validation, save, or submit rules.
5. Pointer, keyboard, screen-reader labels, and narrow layouts remain usable. Focused tests, typecheck/build, rendered verification, and repository hygiene are reported with exact results.

## Open decisions

None blocking. This specification interprets “calculate on field” as immediate row preview while typing. The selection checkbox retains its current meaning for financial totals and persistence.

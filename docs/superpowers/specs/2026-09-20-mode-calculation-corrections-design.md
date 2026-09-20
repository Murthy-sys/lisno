# In-house calculation corrections

## Goal

Correct only Configuration → Mode → Execution → In-house calculations:

- Labour and Material percentages become true gross margins;
- their prices use division by the retained percentage;
- the temporary In-house discount becomes a selling-price discount;
- its maximum is derived from rounded starting and floor prices so neither cost falls below its configured minimum margin;
- the combined In-house breakup continues to reconcile exactly; and
- the verified implementation is saved in `docs/ai-estimator-mode-calculations.md`.

PMC and Sub-Vendor are explicitly outside this change. Do not change their calculation functions, discount behavior, validation, contracts, labels, UI, or stored values. The user's intended future change to discount PMC and Sub-Vendor charges will be handled separately.

This is a focused financial correction. It does not authorize deployment, production migration, approved-estimate or ledger rewriting, commits, pushes, or unrelated Configuration work.

## Current behavior and evidence

1. In-house Labour and Material currently calculate additive markup:

   ```text
   price = adjusted cost × (1 + configured percentage)
   ```

   The UI calls the control **Gross margin markup** and later calls the additive uplift **Margin on labour/material**.
2. At ₹30 adjusted cost and 35%, the current formula returns ₹40.50, whose actual gross margin is 25.93%. The supplied calculation requires true 35% margin, which returns ₹46.15.
3. In-house currently displays `Max Discount = Starting markup − Min. markup` and treats the temporary discount as a reduction in markup percentage points. That number is not a selling-price discount percentage.
4. The combined In-house total adds independently rounded Labour and Material results and displays expense, margin, total expense, total margin, and subtotal.
5. In-house applies low-quantity Impact only when `quantity < limit`; the intended common boundary is inclusive.
6. PMC and Sub-Vendor already use separate margin calculation branches. They must remain behaviorally unchanged by this task.

## Authoritative In-house formulas

All money remains integer paise. Percentages remain integer basis points (`10000 bps = 100%`). Use non-negative `BigInt` arithmetic and the existing half-up division helper.

### Adjusted cost

For base unit rate `B`, quantity `q`, Impact `i`, and low-quantity limit `L`:

```text
appliedImpact = i when q <= L, otherwise 0
revisedUnitRate = roundHalfUp(B × (10000 + appliedImpact) / 10000)
C = roundHalfUp(revisedUnitRate × q)
```

`C` is the independently rounded Labour or Material adjusted cost. Quantity parsing continues to use the saved UOM scale.

### True gross-margin price

For gross margin `r`, where `0 <= r < 10000`:

```text
Price(r) = roundHalfUp(C × 10000 / (10000 - r))
MarginAmount(r) = Price(r) - C
```

For Starting Gross Margin `rStart` and Min. Gross Margin `rMin`:

```text
StartPrice = Price(rStart)
FloorPrice = Price(rMin)
```

Require `0 <= rMin <= rStart < 10000`. Existing numeric saved values are retained and interpreted as their intended margin percentages. Existing transport field names `minimumMarkupBps` and `startingMarkupBps` remain for compatibility in this focused change, but UI and calculation documentation must identify them as legacy names.

### In-house selling-price discount

For a selected Starting basis:

```text
MaxDiscountBps =
  StartPrice = 0
    ? 0
    : floor((StartPrice - FloorPrice) × 10000 / StartPrice)

DiscountAmount = roundHalfUp(StartPrice × discountBps / 10000)
FinalPrice = StartPrice - DiscountAmount
```

Reject `discountBps > MaxDiscountBps`. After rounding, also assert `FinalPrice >= FloorPrice`; never silently clamp an unsafe result.

For a selected Minimum basis, the selected price equals its floor, so `MaxDiscountBps = 0`.

### Combined Labour and Material

Calculate Labour and Material independently with their own adjusted cost, starting price, floor price, rounding, and maximum discount. When Starting basis is selected:

```text
CombinedMaxDiscountBps = min(LabourMaxDiscountBps, MaterialMaxDiscountBps)
```

Apply the entered rate independently to each component's selling price, then add the independently rounded final prices:

```text
Labour effective margin = Labour final price - Labour adjusted cost
Material effective margin = Material final price - Material adjusted cost
Total expense = Labour adjusted cost + Material adjusted cost
Total margin = Labour effective margin + Material effective margin
Subtotal = Labour final price + Material final price
Subtotal = Total expense + Total margin
```

Any response that breaches either floor or either reconciliation identity is invalid.

## Required example

For adjusted cost ₹30.00, Starting Gross Margin 35%, and Min. Gross Margin 25%:

```text
StartPrice = roundHalfUp(3000 × 10000 / 6500) = ₹46.15
FloorPrice = roundHalfUp(3000 × 10000 / 7500) = ₹40.00
MaxDiscountBps = floor((4615 - 4000) × 10000 / 4615)
                   = 1332 bps = 13.32%
```

The old ₹40.50 additive-markup result and the old 10% percentage-point discount limit must not be accepted for this scenario.

## Backend and API requirements

1. Isolate the correction to the generic/In-house calculation path. PMC and Sub-Vendor calculations and their request/response contracts must not change.
2. Replace additive In-house pricing with the true-margin formula.
3. Make In-house low-quantity Impact inclusive at `quantity <= limit`.
4. Replace the rate-point discount with a selling-price discount and derive its cap from the rounded selected and floor prices.
5. Enforce the cap and floor on the backend. Frontend validation is only an interaction aid.
6. Return the authoritative In-house maximum discount and enough rounded values for frontend reconciliation. Remove or rename In-house response wording that calls an effective true margin a markup; do not alter PMC/Sub-Vendor response fields.
7. Keep preview read-only. Invalid inputs or an over-cap discount create no payload, version, audit, or other business write.
8. Update only directly affected runtime validation, TypeScript contracts, OpenAPI descriptions, configuration-context fields, and tests. A projected `maximumDiscountBps` must represent the corrected In-house selling-price discount, not a raw rate difference.

## Frontend requirements

1. Under In-house only, replace:
   - **Gross margin markup** → **Gross margin**;
   - **Starting Gross Margin Markup** → **Starting Gross Margin**;
   - **Min. Gross Margin Markup** → **Min. Gross Margin**.
2. Do not show a configuration-level `Starting − Min.` value as Max Discount. In the simulator, show the authoritative amount-aware **Maximum selling-price discount** after Quantity and the selected basis are known.
3. The discount hint states that discount applies to the In-house selling price and preserves both Labour and Material minimum margins.
4. Display effective **Margin on labour** and **Margin on material** as each backend final price minus adjusted cost, so the existing breakup reconciles after discount.
5. Use backend amounts as authoritative. Reject stale or inconsistent results instead of calculating replacement money in the UI.
6. Preserve automatic preview, temporary edits, loading, error/retry, read-only, close/reopen, focus, keyboard, responsive, and accessible behavior.
7. Do not alter any PMC or Sub-Vendor text, controls, helper copy, results, discount input, or request construction.

## Compatibility and data impact

- No stored payload is migrated or rewritten.
- Existing In-house numeric values remain numerically unchanged and are treated as the intended margin values. Future In-house previews therefore change from markup results to true-margin results.
- Immutable section history, optimistic concurrency, authorization, and Save Mode/Discard behavior remain unchanged.
- Existing legacy transport names remain accepted to avoid a persistence migration. New comments, OpenAPI, UI, and the calculation reference explain their margin semantics in the corrected In-house path.
- PMC/Sub-Vendor saved values and preview behavior remain unchanged.

## Saved calculation reference

After implementation and verification pass, create `docs/ai-estimator-mode-calculations.md` with:

- a glossary for adjusted cost, markup, gross margin, floor price, and selling-price discount;
- the corrected In-house operation order and formulas;
- paise/basis-point units and half-up rounding stages;
- the inclusive low-quantity boundary;
- individual and combined maximum-discount formulas;
- the verified ₹30 example and one unequal Labour/Material example from executable tests;
- reconciliation identities and rejected-input behavior;
- an explicit note that PMC and Sub-Vendor were not changed in this task; and
- links to the authoritative implementation and focused tests.

Finalize the reference only after checks pass so it documents implemented behavior.

## Scope and non-goals

Included:

- In-house Labour, In-house Material, combined In-house total, In-house simulator maximum discount, directly required contracts/validation/OpenAPI, focused tests, labels, and the saved Markdown reference.

Excluded:

- every PMC and Sub-Vendor calculation or discount change;
- a Supplier calculation branch;
- changes to PMC, Lisno, tax, GST, wastage, procurement, approved-estimate, invoice, or ledger formulas;
- unrelated Configuration, recommendation, quality, chat, or mobile work;
- production backfill, deployment, seed, commit, or push.

## Risks and controls

- **In-house repricing:** verify explicit before/after examples and retain numeric configuration without mutating stored revisions.
- **Floor breach:** backend enforces the calculated cap and rounded floor; test cap and cap + 1 basis point.
- **Combined leakage:** use unequal Labour/Material values and prove the smaller cap protects both.
- **PMC/Sub-Vendor regression:** run focused asymmetric regression tests and inspect the diff to confirm no behavioral changes.
- **Rounding drift:** use integer paise/BigInt and verify half-paise ties, fractional quantities, zero, overflow, and reconciliation.
- **Stale UI result:** retain request invalidation and verify selected basis, quantity, discount, and returned cap.

## Acceptance criteria

1. In-house ₹30 at 35% returns ₹46.15 and its 25% floor returns ₹40.00; the old ₹40.50 result is rejected.
2. The same example reports a maximum selling-price discount of 13.32%; 13.32% is accepted when the rounded result remains at the floor or above, and 13.33% is rejected.
3. Labour and Material each use true margin, independently rounded prices, and independently protected floors.
4. Combined unequal Labour/Material inputs use the smaller cap and satisfy both reconciliation identities exactly.
5. Minimum basis permits 0% discount only.
6. In-house Impact applies below, at, and not above the limit as specified, including fractional quantities.
7. Existing numeric configuration, authorization, immutable history, concurrency, and read-only preview behavior remain intact; no migration or business write occurs.
8. PMC and Sub-Vendor focused calculation and simulator regressions return their existing results, request shapes, labels, and discount behavior without updates to product expectations.
9. Runtime validation, backend/frontend types, In-house configuration context, OpenAPI, UI wording, and response guards agree on the corrected formula and discount.
10. Desktop and narrow-mobile rendered checks cover labels, cap display, cap rejection, basis switching, unequal combined totals, focus, accessibility, and horizontal overflow.
11. `docs/ai-estimator-mode-calculations.md` matches final code and executable examples.
12. Focused backend Mode/In-house/context/route/OpenAPI tests, frontend editor/In-house/Mode lifecycle tests, unchanged PMC/Sub-Vendor regression tests, both typechecks/builds, `git diff --check`, and final status pass. No lint result is claimed because the repository has no lint script.

## Approval assumptions

- Existing In-house percentages were entered with true-margin intent and retain the same numeric values.
- Only In-house is corrected now.
- PMC and Sub-Vendor remain unchanged even though their future charge-discount policy may require a separate task.
- No stored-data migration is needed because these are saved inputs and temporary preview results, not persisted calculated totals.

No additional product decision remains if these assumptions are approved.

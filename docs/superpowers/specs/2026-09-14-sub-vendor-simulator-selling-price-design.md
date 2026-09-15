# Sub-Vendor simulator — selling price from Lisno margin

Status: specification and task plan approved; the user selected execution mode A. Implementation and independent integrity review are complete. Focused tests, typechecks, builds and desktop interaction checks passed. Mobile calculation and rendered layout passed; browser automation timed out during close/reopen verification. See the [task plan](../plans/2026-09-14-sub-vendor-simulator-selling-price.md) for final evidence and limits. The user's explicit table establishes the division formula below and replaces the earlier draft.

## Goal and confirmed formula

Change Execution → Sub-Vendor → Test calculations to calculate:

```text
Selling price = CP / (1 − R / 100)
```

The user's example is CP = ₹100 and R = 35%, giving ₹100 / 0.65 = **₹153.85**, rounded to paise. The implementation follows that explicit formula. Keep the product label **Lisno Margin** established in the earlier task; the table's “Markup” label does not request another UI rename.

Scope assumptions for approval: apply this formula to Sub-Vendor Test calculations only. Treat 35% as an illustration and retain the approved configured choices of **15% or 20%**. Preserve PMC, In-house, low-quantity impact and custom-discount behavior. The user clarified the arithmetic through a table; no separate request to expand scope or allowed rates has been received.

## Current behavior and evidence

- `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts` currently shares PMC/Sub-Vendor arithmetic and uses `applyBasisPoints(revisedAmountPaise, 10000 + marginBps)`. For adjusted cost ₹200 and Lisno margin 20%, it returns ₹240 before discount; the requested division formula must return ₹250.
- `backend/src/domain/ai-estimator-knowledge-calculation.ts` already exports **`calculateMarginSellingPrice(basisAmountPaise, marginBps)`**, implementing exactly `cost × 10000 / (10000 − marginBps)` with BigInt intermediates, half-up rounding, invalid-denominator checks and safe-integer validation. Reuse this helper without changing its behavior or other consumers.
- `backend/src/services/ai-estimator-knowledge-context.service.ts` calls the Sub-Vendor calculation only in the authenticated preview branch. The traced runtime references do not apply it to approved estimates or finance calculations.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationSimulator.tsx` already displays the cost, positive Lisno margin amount, subtotal, discount, vendor charges and final total. Its current reconciliation checks only sum the rows; an obsolete cost-plus-markup result could pass those sums even after the requested formula changes.
- `backend/src/contracts/ai-estimator-knowledge.ts` currently describes Sub-Vendor as sharing PMC arithmetic. Update that description and corresponding OpenAPI guidance while keeping the established response fields.
- The paired Min./Max. controls, 1500/2000 basis-point restriction, legacy saved-value repair, pending/conflict behavior and stale-response handling are already implemented. Preserve this baseline and prior inclusion/exclusion work.

## Requirements and calculation contract

1. Preserve base-rate × quantity calculation and low-quantity impact, including the current inclusive quantity threshold and per-unit/quantity rounding. In the formula, **CP** means the adjusted cost amount including applicable impact (`revisedAmountPaise`). The illustrative ₹100 example assumes quantity one and zero impact.
2. Let `C = revisedAmountPaise` and `r` be the selected configured Lisno margin in basis points. Calculate:

   ```text
   selling price before discount = roundHalfUp(C × 10000 / (10000 − r))
   Lisno margin amount = selling price before discount − C
   discount amount = roundHalfUp(selling price before discount × discountBps / 10000)
   final total = selling price before discount − discount amount
   final vendor charges = final total − Lisno margin amount
   ```

   Use `calculateMarginSellingPrice` for the first step. Derive the displayed margin from rounded selling price minus cost so displayed stages reconcile exactly. Do not round a percentage approximation independently or implement currency calculations using floating-point multiplication/division.
3. Preserve the existing custom Discount control and its 0%–100% allowance. Discount applies to the selling price after the Lisno margin is calculated. With zero discount, final total equals the user's selling-price formula. The displayed margin amount remains based on the price before discount, matching the existing discount policy; this change does not introduce a new minimum effective margin or discount cap.
4. Preserve the existing vendor-charge breakdown: cost before discount equals vendor charges at zero discount; discount reduces that balance while the configured margin amount remains separately visible. A sufficiently large discount can produce a signed vendor balance. At 100% discount, final total is zero and vendor balance is negative by the displayed margin amount. Do not replace this existing policy as part of a formula-only change.
5. Both Min. and Max. scenarios use the new formula. Max. remains the default and yields a greater or equal selling price than Min. for identical other inputs. Keep exact-rate requests, read-only configured fields and temporary Quantity/Discount state.
6. Preserve safe integer paise, configured basis-point validation, overflow errors, quantity precision, branch validation, authentication, errors/retry, close/reopen behavior and clearing/ignoring stale results after input or basis changes. Preview never saves configuration.

## Examples and reconciliation

The user-provided example can be verified directly through the existing money helper: `calculateMarginSellingPrice(10000, 3500)` returns `15385`. The simulator API still rejects 35% because this specification retains the separately approved 15%/20% configuration restriction.

| Adjusted cost | Lisno rate | Selling price before discount | Margin amount | Discount | Final total | Vendor balance |
| --- | --- | --- | --- | --- | --- | --- |
| ₹200.00 | 15% | ₹235.29 | ₹35.29 | ₹0.00 | ₹235.29 | ₹200.00 |
| ₹200.00 | 20% | ₹250.00 | ₹50.00 | ₹0.00 | ₹250.00 | ₹200.00 |
| ₹2,200.00 | 15% | ₹2,588.24 | ₹388.24 | ₹0.00 | ₹2,588.24 | ₹2,200.00 |
| ₹2,200.00 | 20% | ₹2,750.00 | ₹550.00 | ₹275.00 (10%) | ₹2,475.00 | ₹1,925.00 |
| ₹0.02 | 20% | ₹0.03 | ₹0.01 | ₹0.00 | ₹0.03 | ₹0.02 |

Required identities:

- Base amount + low-quantity impact = adjusted cost.
- Adjusted cost + Lisno margin amount = selling price before discount.
- Selling price before discount − discount amount = final total.
- Vendor charges/balance + Lisno margin amount = final total.

In addition to these identities, verify that the selling price itself satisfies the rounded division formula for the requested rate. Reconciliation alone cannot distinguish the old cost-plus-markup formula from the requested formula.

## API, compatibility and UI

- Keep the preview endpoint, selected-rate input `subVendorCalculation.subVendorMarginBps`, existing preview envelope/version and response shape. This is a coordinated arithmetic and explanatory-copy change to the existing ephemeral preview branch.
- `subVendorMarginAmountPaise` remains the positive difference between rounded selling price and adjusted cost; `totalBeforeDiscountPaise` becomes the selling price produced by the division formula. `totalPaise`, `finalVendorChargesPaise` and discount fields retain their existing breakdown roles. Correct any type/OpenAPI wording that says Sub-Vendor shares PMC's pricing arithmetic.
- Keep PMC's cost-plus-fee calculation and In-house's current formula unchanged. Introduce the smallest scope-specific branch needed to reuse the existing selling-price helper; do not duplicate the shared cost/quantity/impact code.
- Frontend Sub-Vendor validation must check the exact rounded division relationship as well as existing sums, selected rate, discount rate, impact boundary and safe amounts. This validation verifies server results; it must not synthesize a replacement financial result in the UI. Reject obsolete additive or deduction results, even when otherwise internally consistent.
- Keep the **Lisno Margin** heading, paired controls, Calculate with radios, positive margin row, vendor-charge/signed-balance row and Final total. Label the intermediate subtotal **Selling price before discount**, with a matching accessible output name.
- Explain: **Selling price = cost price ÷ (1 − Lisno margin %). Cost includes any low-quantity impact. Discount applies afterward.** Update the Sub-Vendor discount hint to refer to selling price before discount. Retain focus, error/status announcements, keyboard access, mobile reflow and no-overflow behavior. Do not expose implementation units or transport details in the UI.
- No stored value, Active revision, approved estimate or finance ledger is rewritten. The existing saved 15%/20% rates are used on the next preview. Historical invalid margins stay blocked until repaired using the existing draft workflow. Preview must not change payloads, versions or audits.
- Frontend/backend must be released together for compatible rendering; deployment is outside this task. Code rollback requires no data migration because this change writes no business data.

## Scope, constraints and risks

This is a cross-stack financial calculation change confined to Sub-Vendor Test calculations, its backend preview, response checks, explanatory text and directly affected tests/docs. The worktree already contains 44 modified source/test paths and four prior task documents; preserve those changes and capture current target diffs before assigning writers.

Use the existing selling-price helper because it already implements the exact requested formula and repository money conventions. No additional formula choice or library is needed.

Primary risks are changing the shared PMC path, retaining an old additive subtotal, rounding a margin separately, accepting a stale but internally consistent response, or unintentionally changing discount/vendor-balance policy. Scope-specific calculation checks, hand-calculated unequal examples, half-paise ties and regression tests must expose those failures.

No expansion to allowed rates, margin persistence/repair, other simulators, live estimates, finance, schemas, dependencies, migrations, seeds, commits, pushes or deployment is included. No broader UI redesign is required.

## Acceptance criteria and verification

- **AC1 — Formula:** the existing money helper reproduces ₹100/35% = ₹153.85. Allowed simulator 15%/20% scenarios reproduce the table and differ from the old markup result. Cover quantities below/equal/above the impact limit, fractional quantities, zero cost, half-up ties and overflow boundaries.
- **AC2 — Discount and breakdown:** verify zero, nonzero, near-100% and 100% discounts with all identities above. Preserve signed vendor balances and prove Max. produces no smaller selling price than Min. for otherwise identical inputs.
- **AC3 — API:** direct calculation and authenticated preview agree. Invalid rates including 25%/35%, unsafe types/precision and mixed branches stay rejected. Preview writes no business state. Backend/frontend/OpenAPI descriptions match the formula.
- **AC4 — UX:** both Min./Max. selections send the exact configured rate and render the server's margin, selling price and final total with correct accessible labels. Quantity/Discount remain temporary. Loading, errors/retry, read-only fields and reopening remain correct.
- **AC5 — Response safety:** reject obsolete markup/deduction results, a wrong selected rate or discount, unsafe/negative non-balance amounts, wrong rounding and inconsistent breakdowns. Keep stale-response and close/unmount protections.
- **AC6 — Regression:** PMC, In-house, saved margin restrictions, legacy repair, pending/conflict behavior and inclusion/exclusion behavior remain unchanged. Use two distinct configured Main Lines and unequal rates to check isolation.
- **AC7 — Integrated verification:** focused backend money-helper, Sub-Vendor, PMC, Mode/preview/context and API-doc tests; focused frontend Sub-Vendor, PMC, editor and Mode lifecycle tests; both workspace typechecks/builds; rendered desktop/mobile result, focus, label and overflow checks; `git diff --check` and final status. Reuse unchanged persistence evidence; add isolated replica-set tests only if an actual persistence change becomes necessary. Record exact checks and limitations. Prior mobile interaction automation timed out and is not evidence of a pass for this formula.

## Open decisions and next gate

The formula is settled by the user's explicit table: **CP / (100% − R%)**. Approval confirms the stated Sub-Vendor-only scope, unchanged 15%/20% choices, adjusted-cost basis and existing discount/vendor-balance policy. After approval, create the separate task plan before requesting the execution mode. Do not implement at this gate.

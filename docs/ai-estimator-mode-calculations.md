# AI Estimator In-house calculations

## Scope

This document records the implemented calculation rules for **Configuration → Mode → Execution → In-house** Labour and Material costs.

The configuration context identifies this corrected contract as `formulaVersion: "mode-margin-v2"` so consumers can distinguish it from the previous additive-markup semantics.

PMC and Sub-Vendor arithmetic, discount behavior, request/response contracts, saved values, and UI behavior were not changed by this correction. Their charge-discount policy remains separate from the In-house formulas below.

## Terms and units

- **Paise:** all money is calculated as integers. `₹1.00 = 100 paise`.
- **Basis points (bps):** all percentages are integers. `1% = 100 bps`; `100% = 10,000 bps`.
- **Adjusted cost:** the independently rounded Labour or Material cost after low-quantity Impact and quantity are applied.
- **Markup:** profit as a percentage of cost. A 35% markup would use `cost × 1.35`. In-house does not use this formula.
- **Gross Margin:** profit as a percentage of selling price. In-house uses `cost ÷ (1 − margin)`.
- **Floor price:** the rounded selling price at the configured Min. Gross Margin.
- **Selling-price discount:** a percentage deducted from the rounded selected selling price.

The stored/request field names `minimumMarkupBps`, `startingMarkupBps`, and `modeCalculationMarkupBasis` are retained for compatibility. For In-house calculations they mean **Min. Gross Margin**, **Starting Gross Margin**, and the selected In-house margin basis.

## Rounding rule

Every stated rounding stage uses non-negative integer half-up division:

```text
roundHalfUp(N / D) = floor((N + floor(D / 2)) / D)
```

The maximum discount uses floor division instead of half-up rounding so it cannot authorize a rate above the computed amount gap.

## 1. Adjusted cost

For base unit rate `B`, quantity `q`, configured Impact `i`, low-quantity limit `L`, and quantity scale `s`:

`i` is the supplied `impactBps`, or the compatibility default of `1,000 bps` (10%) whenever that field is omitted. An explicit zero disables Impact.

```text
appliedImpactBps = i when q <= L, otherwise 0

revisedUnitRatePaise =
  roundHalfUp(B × (10,000 + appliedImpactBps) / 10,000)

adjustedCostPaise =
  roundHalfUp(revisedUnitRatePaise × scaledQuantity / 10^s)
```

The boundary is inclusive: Impact applies **below and exactly at** the Low Quantity Limit. Labour and Material calculate their own adjusted costs independently.

## 2. True Gross Margin price

For adjusted cost `C` and Gross Margin `r`, where `0 <= r < 10,000`:

```text
Price(r) = roundHalfUp(C × 10,000 / (10,000 − r))
MarginAmount(r) = Price(r) − C
```

The configured rates must satisfy:

```text
0 <= MinGrossMargin <= StartingGrossMargin < 10,000 bps
```

The two authoritative prices are:

```text
StartPrice = Price(StartingGrossMargin)
FloorPrice = Price(MinGrossMargin)
```

## 3. Maximum selling-price discount

When **Starting Gross Margin** is selected:

```text
MaximumDiscountBps =
  StartPrice == 0
    ? 0
    : floor((StartPrice − FloorPrice) × 10,000 / StartPrice)
```

For an entered discount `d`:

```text
DiscountAmount = roundHalfUp(StartPrice × d / 10,000)
FinalPrice = StartPrice − DiscountAmount
```

The backend rejects `d > MaximumDiscountBps` and also rejects any rounded result where `FinalPrice < FloorPrice`. It never silently clamps an unsafe result.

When **Min. Gross Margin** is selected, the selected price is already the floor:

```text
MaximumDiscountBps = 0
```

The preview response exposes the checked values as:

- `floorPricePaise`
- `maximumDiscountBps`
- `discountBasis: "selling_price"`
- optional discount `rateBps`, `totalBeforeDiscountPaise`, and `amountPaise`

## 4. Combined Labour and Material

Labour and Material calculate their adjusted cost, start price, floor price, discount amount, and final price independently.

For Starting Gross Margin, the common input limit is:

```text
CombinedMaximumDiscountBps =
  min(LabourMaximumDiscountBps, MaterialMaximumDiscountBps)
```

The same entered rate is applied independently to both rounded selling prices. The combined result must satisfy:

```text
LabourEffectiveMargin = LabourFinalPrice − LabourAdjustedCost
MaterialEffectiveMargin = MaterialFinalPrice − MaterialAdjustedCost

TotalExpense = LabourAdjustedCost + MaterialAdjustedCost
TotalMargin = LabourEffectiveMargin + MaterialEffectiveMargin
Subtotal = LabourFinalPrice + MaterialFinalPrice

Subtotal = TotalExpense + TotalMargin
```

The frontend rejects a response with a mismatched discount basis, floor, maximum, selected price, discount, final amount, component sum, or reconciliation identity.

## Verified example: ₹30 cost, 35% Starting, 25% Minimum

With no Impact and quantity `1`:

```text
AdjustedCost = 3,000 paise

StartPrice = roundHalfUp(3,000 × 10,000 / 6,500)
           = 4,615 paise
           = ₹46.15

FloorPrice = roundHalfUp(3,000 × 10,000 / 7,500)
           = 4,000 paise
           = ₹40.00

MaximumDiscountBps = floor((4,615 − 4,000) × 10,000 / 4,615)
                   = 1,332 bps
                   = 13.32%
```

At `13.32%`:

```text
DiscountAmount = roundHalfUp(4,615 × 1,332 / 10,000)
               = 615 paise

FinalPrice = 4,615 − 615
           = 4,000 paise
           = ₹40.00
```

`13.32%` is accepted. `13.33%` is rejected. The previous additive-markup result of ₹40.50 is not used.

## Verified unequal Labour and Material example

Quantity is `1` for both components.

| Component | Base / adjusted cost | Impact | Min. / Starting Gross Margin | Floor price | Start price | Maximum discount |
|---|---:|---:|---:|---:|---:|---:|
| Labour | ₹450.00 / ₹450.00 | 0% | 8% / 23% | ₹489.13 | ₹584.42 | 16.30% |
| Material | ₹650.00 / ₹732.88 | 12.75% | 18% / 36% | ₹893.76 | ₹1,145.13 | 21.95% |

The common maximum is therefore `min(16.30%, 21.95%) = 16.30%`.

At a 5% selling-price discount:

```text
Labour final price = ₹555.20
Material final price = ₹1,087.87
Subtotal = ₹1,643.07

Total expense = ₹450.00 + ₹732.88 = ₹1,182.88
Total margin = ₹105.20 + ₹354.99 = ₹460.19
Total expense + Total margin = ₹1,643.07
```

At the common 16.30% cap, Labour finishes at ₹489.16 and Material at ₹958.47. Both remain at or above their own floors. A 16.31% request is rejected because Labour owns the smaller cap.

## Validation and failure behavior

The calculation rejects:

- negative, fractional, unsafe, or otherwise invalid basis-point inputs;
- Min. Gross Margin greater than Starting Gross Margin;
- either In-house Gross Margin at or above 100%;
- invalid quantity precision for the saved UOM;
- a discount above the selected or combined amount-aware cap;
- any rounded result below its floor;
- unsafe money or combined totals; and
- an inconsistent backend preview response.

Preview requests are read-only. They do not save simulator quantity, margin basis, discount, calculated money, a new section version, or an audit event.

When configuration context has both quantity and UOM precision, it may project the exact In-house selling-price discount cap. Without enough amount context, that cap is `null`; the system does not substitute `Starting Gross Margin − Min. Gross Margin`.

## Authoritative implementation and tests

- Backend arithmetic: [`backend/src/domain/ai-estimator-knowledge-mode-calculation.ts`](../backend/src/domain/ai-estimator-knowledge-mode-calculation.ts)
- Shared integer helpers: [`backend/src/domain/ai-estimator-knowledge-calculation.ts`](../backend/src/domain/ai-estimator-knowledge-calculation.ts)
- Backend preview contract: [`backend/src/contracts/ai-estimator-knowledge.ts`](../backend/src/contracts/ai-estimator-knowledge.ts)
- Frontend reconciliation: [`frontend/src/features/ai-estimator-knowledge/knowledgeInHouseCalculation.ts`](../frontend/src/features/ai-estimator-knowledge/knowledgeInHouseCalculation.ts)
- Combined In-house UI: [`frontend/src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.tsx`](../frontend/src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.tsx)
- Backend executable examples: [`backend/tests/ai-estimator-knowledge-mode-calculation.test.ts`](../backend/tests/ai-estimator-knowledge-mode-calculation.test.ts)
- Frontend contract tests: [`frontend/src/features/ai-estimator-knowledge/knowledgeInHouseCalculation.test.ts`](../frontend/src/features/ai-estimator-knowledge/knowledgeInHouseCalculation.test.ts)
- Frontend simulator tests: [`frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx`](../frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx) and [`KnowledgeInHouseTotal.test.tsx`](../frontend/src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx)

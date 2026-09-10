# Configuration context for future estimator analysis

The existing estimator does not currently call the knowledge context API. This document describes the read-only configuration contract to use when that integration is built. No AI model is invoked by this endpoint.

`POST /api/v1/ai-estimator-knowledge/context` retains its existing authentication and sole active Super Admin restriction. It reads one active revision in a Mongo snapshot transaction. Draft changes cannot affect the returned configuration until that revision is activated.

## Identity and ownership

Use stable IDs from `lineage` and the returned Overview identities, never labels as joins. The request must identify the Main Basket and Main Line; optional Specification, UOM and Surface references are validated against the configured item. The revision ID, revision number and content digest identify the configuration snapshot. Changing a draft does not change an already returned snapshot.

| Configuration | Ownership |
| --- | --- |
| UOM and decimal precision | Main Line Overview, shared by every cost |
| Saved paragraph | Main Line, shared by PMC and Execution |
| Selected Inclusion and Exclusion lists | Main Line, shared; currently stored on the canonical PMC configuration |
| PMC calculations | `pmc` only |
| Sub-Vendor calculations | `sub_vendor` only |
| In-house Labor calculations | `in_house_labor` only |
| In-house Material calculations | `in_house_material` only |
| Specifications, recommendations, quality and dependencies | Their own sections within the same Main Line revision |

The Mode and Execution source checkboxes choose which configurations the administrator is viewing. Sub-Vendor and In-house can be viewed together, each in its own expandable panel inside Execution. Expansion and selection are local view preferences. They do not enable/disable, delete or merge the other stored configurations. The UI labels this view behavior.

Sub-Vendor and In-house no longer show component sections or Add component controls. Existing stored component definitions are retained when other configuration values are saved; this UI removal does not migrate or delete historical data. Recovery for unresolved historical configurations remains available. Invalid retained Execution component configurations also appear in recovery for explicit removal, so their validation errors do not become hidden save blockers.

PMC Margin is an optional numeric input saved as `advanced.pmcMarginBps` (integer hundredths of a percent). Both the form and API enforce 10%–20% inclusive, with up to two decimal places. Values outside this range must be corrected before saving; existing invalid values are displayed for correction rather than silently changed. Clearing it saves null. The PMC test simulator requires this margin and uses it instead of Starting or Minimum markup. Sub-Vendor Margin is independently saved as `advanced.subVendorMarginBps` with the same optional/null behavior and 10%–20% range. Missing Sub-Vendor margin never inherits PMC margin or legacy Starting/Minimum markup. Its test simulator requires this independently configured margin. In-house calculations and all saved legacy markup fields remain unchanged.

## Selected calculation context

The additive `configuration` response exposes the compatibility Mode settings described below; it does not resolve the independent PMC or Sub-Vendor simulator margins. Request `modeKind: "pmc"`, or `modeKind: "execution"` with `executionSource: "sub_vendor"` / `"in_house"`. The response contains only that selection's calculation entries. In-house returns two explicitly named cost entries. It does not guess a mode from a legacy mode ID, a Main Line name, a paragraph or an available rate.

- `state: "ready"`: the selected settings and UOM are usable configuration inputs. This does not mean an estimate has been approved, a requested quantity has been priced, or a model has analysed it.
- `selection_required`: supply a canonical Mode and, for Execution, its source. No calculation entries are selected automatically.
- `not_configured`: one or more costs or the Overview UOM are missing. Consult `issues`; do not substitute zero or another mode's cost.
- `invalid`: selected settings, quantity precision, or shared scope data cannot be resolved safely. Do not calculate until corrected.

Read the existing top-level `availability` alongside this state for Specifications, recommendations, quality, dependencies and other sections. A ready calculation does not make missing sections configured.

`shared.inclusions` and `shared.exclusions` contain only checked items, each with its stable ID and name. The lists are independent: the same label can appear in both and must retain its list identity. Never derive selections by parsing the paragraph. `shared.paragraph` is the saved custom wording, or null when the UI generates its standard paragraph from the Main Line name and selected lists. Unchecked entries, vendor notes and stored component answers are not included in this projection.

Each calculation entry has `scope`, `source`, `settings` and `maximumDiscountBps`. An explicitly null or missing scope never falls back to another scoped cost. Older records use the same compatibility rules as the configuration UI: an old shared value may seed each scope (`legacy_shared`), and an old In-house value may seed its two costs (`legacy_in_house`). The source is explicit so a future consumer can require review of inherited settings. Once either split In-house key exists, neither split cost inherits the old In-house value. No data is rewritten by context resolution.

## Units and calculation rules

`formulaVersion` is `mode-markup-v1`. Money is integer paise and percentages are basis points: 100 paise = ₹1, and 100 basis points = 1%. `impactBps` defaults to 1,000 only for older records that omit it; an explicit zero is retained.

Use the existing backend Mode calculator, including its rounding and overflow checks:

1. Apply Impact to the Base Rate only when quantity is strictly below the Low Quantity Limit.
2. Multiply the revised unit rate by quantity in the Overview UOM.
3. Add the selected Starting or Minimum markup to that amount. A 35% markup multiplies by 1.35.
4. For In-house, calculate Labor and Material separately with their own settings, then sum their independently rounded final amounts.

`maximumDiscountBps = startingMarkupBps - minimumMarkupBps`, independently for each cost. This is a difference in markup percentage points. Test simulators accept temporary `modeCalculationDiscountBps` and subtract it from the chosen markup before calculating the total. It must not reduce that markup below the minimum: the allowed discount at minimum markup is zero. The combined In-house simulator applies one discount to both costs, bounded by the smaller allowance. The backend enforces the limit and returns the effective markup, pre-discount total and saving for each cost. Estimation-level discount entry/enforcement is not yet connected and must not reinterpret this as a percentage discount on the final selling price.

The existing top-level `preview` uses the older immutable price-version/GST calculation system. It remains for compatibility and is **not** the total for `configuration.calculations`. Do not combine both systems or let a generic legacy rate override the selected Mode settings.

## PMC test simulator

`POST /api/v1/admin/ai-estimator-knowledge/preview` accepts a separate `pmcCalculation` object with `baseRatePaise`, `lowQuantityLimit`, optional `impactBps`, and required `pmcMarginBps`. The configuration editor supplies the first three from its PMC cost settings and the margin from `advanced.pmcMarginBps`. It sends the editable test quantity through `quantity` / Overview `quantityScale`, and the optional test discount through `modeCalculationDiscountBps`. Preview inputs are temporary and do not save configuration changes.

PMC cannot be combined with `modeCalculation`, `inHouseCalculation`, `subVendorCalculation`, or `modeCalculationMarkupBasis`. It requires a quantity and a 10%–20% PMC margin. Configured Impact applies at or below the configured Low Quantity Limit. For a limit of 15, the charge applies at quantity 15 and stops above 15; the rule uses the configured limit rather than a fixed number. Omitted Impact defaults to 10%, while an explicit zero disables the charge. Configured PMC Impact is limited to `Number.MAX_SAFE_INTEGER - 10000`; The generic Mode and In-house calculators retain their strictly-below boundary.

First compute `baseAmountPaise` from the original unit rate and quantity. Apply configured Impact using the inclusive quantity limit, round the revised unit rate in paise, then multiply by quantity and round that amount. `lowQuantityImpactAmountPaise` is the rounded revised amount minus the base amount, so `baseAmountPaise + lowQuantityImpactAmountPaise = revisedAmountPaise` exactly. Do not independently round the surcharge. Zero quantity produces zero amounts.

Add PMC margin to the revised amount: `subtotal = roundHalfUp(revisedAmountPaise * (10000 + pmcMarginBps) / 10000)`. The margin amount is `subtotal - revisedAmountPaise`. Apply discount to that subtotal: `discountAmount = roundHalfUp(subtotal * discountBps / 10000)`, then `total = subtotal - discountAmount`. The PMC margin and discount remain separate amounts. `finalVendorChargesPaise = total - pmcMarginAmountPaise`; vendor charges exclude the PMC margin, and adding the two equals the final total.

Discount is a custom percentage from 0% to 100% inclusive, represented by an integer from 0 to 10,000 basis points. It does not depend on the configured margin. Both the margin-derived discount cap and the rounded 10% minimum-total rule have been removed. A 10% configured margin can therefore be combined with a 20%, 50%, or 100% discount. Negative discounts, values above 100%, and fractions of a basis point are rejected; accepted values are never clamped. A 100% discount makes the final total zero.

The Discount input remains editable in both margin simulators and explains that the custom percentage applies to the subtotal after margin. Existing half-up rounding is unchanged: for example, a 2,503-paise subtotal discounted by 0.02% loses one paisa and becomes 2,502 paise, without a minimum-margin rejection.

The separately displayed configured margin remains the pre-discount amount. Consequently, `finalVendorChargesPaise = totalPaise - pmcMarginAmountPaise` is a signed remainder and can be negative for a large discount. The UI then labels it **Balance after margin**, displays the signed value, and explains that it plus the displayed margin equals the final total. It is not clamped to zero or presented as a negative vendor payment. All other amounts, including the final payable total, remain nonnegative.

The `pmcCalculation` response always reports the base amount, configured low-quantity charge, revised rate and amount, applied Impact, PMC margin rate and amount, pre-discount subtotal, final vendor charges, and total. When a discount is supplied, `discount` reports its rate, amount, and the same pre-discount subtotal for compatibility. It does not report an effective-margin percentage. No Starting or Minimum markup contributes to this result. In-house discounts continue to subtract markup percentage points as documented above.

## Sub-Vendor test simulator

The same preview endpoint accepts `subVendorCalculation` with `baseRatePaise`, `lowQuantityLimit`, optional `impactBps`, and required `subVendorMarginBps`. The editor supplies its own `modeCalculations.sub_vendor` cost settings and `advanced.subVendorMarginBps`; there is no fallback to PMC margin or legacy markups. This branch is mutually exclusive with `pmcCalculation`, `modeCalculation`, `inHouseCalculation`, and `modeCalculationMarkupBasis`. Quantity, Overview precision, and temporary discount use the same request fields as PMC.

Sub-Vendor and PMC share one backend calculation implementation. Every rule above applies identically: configured impact at or below the quantity limit, no additional low-quantity charge, unit-rate and quantity rounding, margin on the revised amount, a custom 0%–100% discount on the subtotal after margin, overflow rejection, and a signed remainder after margin. The response has the same reconciled breakdown, replacing `pmcMarginBps` / `pmcMarginAmountPaise` with `subVendorMarginBps` / `subVendorMarginAmountPaise`. `finalVendorChargesPaise + subVendorMarginAmountPaise = totalPaise`. The UI displays the margin and discount separately and omits a zero-value low-quantity row. Only test quantity and discount are editable inside the simulator; configured values are read-only there.

Both source panels may be visible together, but their calculators and saved inputs remain independent. An In-house preview continues to sum its own Labor and Material amounts using the legacy markup arithmetic. No combined Sub-Vendor/In-house price or estimate mutation is implied by selecting both checkboxes.

These simulator branches do not extend the `configuration` context response above. Its existing `mode-markup-v1` fields and `maximumDiscountBps` retain their compatibility meaning; they do not include or resolve `advanced.pmcMarginBps` or `advanced.subVendorMarginBps`, and must not be treated as either margin simulator's total or discount allowance. Existing saved legacy markup fields remain intact. The optional Sub-Vendor margin requires no data migration or backfill.

The future estimator integration still needs stable configuration IDs on estimator items, server-authorized resolution for that workflow, deterministic pricing, and saved revision/formula lineage before AI analysis or suggestions can use these configurations on real estimates.

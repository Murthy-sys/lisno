# PMC simulator selling-price calculation and Final total

Status: approved and implemented after task-plan approval and execution mode A selection. Required PMC checks passed; browser coverage and automation limits are recorded in the [task plan](../plans/2026-09-15-pmc-margin-parity.md).

## Goal and confirmed scope

Keep the existing single **PMC Margin** field and its current configuration behavior. In PMC Test calculations, use the same selling-price formula as Sub-Vendor with that single PMC percentage, and remove **Final vendor charges** and its associated explanation. Retain **Final total** and the existing PMC labels.

The user's clarification supersedes the earlier proposal for PMC minimum/maximum fields. This change adds no margin fields or selectors and changes no stored configuration schema, margin limits or increment rules.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgePmcMarginInput.tsx` renders one PMC Margin input with the existing 10%–20% hint and step 5. `knowledgePmcMargin.ts` and backend validation currently accept integer basis points between 1,000 and 2,000. These configuration behaviors are outside this change.
- `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts` calculates PMC subtotal by adding its percentage to adjusted cost. Sub-Vendor already uses `calculateMarginSellingPrice` from `ai-estimator-knowledge-calculation.ts`, which divides adjusted cost by the retained percentage using integer-paise, half-up rounding.
- `backend/src/services/ai-estimator-knowledge-context.service.ts` invokes the PMC calculator for the authenticated, temporary calculation preview. The request supplies one percentage as `pmcCalculation.pmcMarginBps`.
- `KnowledgeModeCalculationSimulator.tsx` uses that single PMC setting and already calculates automatically. It verifies exact selling-price arithmetic only for Sub-Vendor. PMC results currently render Final vendor charges, a Balance after margin variant for negative balances, and an explanatory paragraph.
- `backend/src/openapi/ai-estimator-knowledge.ts` describes additive PMC arithmetic. Its calculation descriptions must reflect the new formula while retaining the existing request/response fields and validation bounds.

## Financial requirements

Use the existing `calculateMarginSellingPrice` helper for PMC. Let C be the adjusted cost in integer paise after low-quantity impact, r the configured PMC margin in basis points, and d the discount in basis points:

```text
Subtotal P = roundHalfUp(C × 10000 / (10000 − r))
PMC margin amount M = P − C
Discount amount D = roundHalfUp(P × d / 10000)
Final total T = P − D
```

Preserve the inclusive low-quantity threshold, unit-rate impact rounding before quantity multiplication, exact quantity parsing and overflow handling. Discount continues to apply after the selling subtotal, with the existing 0%–100% bounds and no new margin-based cap. Reuse the helper without altering its other callers.

| Adjusted cost C (₹) | PMC margin | Discount | Subtotal P (₹) | PMC amount M (₹) | Final total T (₹) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 220.00 | 20% | 0% | 275.00 | 55.00 | 275.00 |
| 220.00 | 15% | 0% | 258.82 | 38.82 | 258.82 |
| 220.00 | 20% | 10% | 275.00 | 55.00 | 247.50 |
| 200.00 | 10% | 0% | 222.22 | 22.22 | 222.22 |
| 220.00 | 20% | 100% | 275.00 | 55.00 | 0.00 |
| 0.02 | 20% | 0% | 0.03 | 0.01 | 0.03 |

In the screenshot, ₹200 base plus 10% low-quantity impact gives ₹220 adjusted cost. At 20% PMC margin and no discount, Final total becomes **₹275**, replacing the additive ₹264 result.

## Simulator and API behavior

1. Keep the single readonly PMC Margin field in the simulator and the existing editable PMC Margin field in configuration. Use the current valid PMC configuration supplied by the Mode editor, including valid unsaved configuration as today. Do not introduce Min./Max. controls, scenario choices or Sub-Vendor value fallbacks.
2. Preserve automatic calculation after valid input changes, cancellation, loading/error handling and stale-response protection. Invalid or incomplete inputs must not leave an old result presented as current. No Calculate button is introduced.
3. Extend exact selling-subtotal and discount verification to PMC. Reject additive or inconsistent backend responses even when their component sums reconcile. Display backend-supplied amounts; do not substitute locally calculated values.
4. Remove the Final vendor charges row, its negative Balance after margin variant, and the corresponding explanatory paragraph from PMC results. Preserve Base amount, low-quantity information, PMC margin, Subtotal after PMC margin, Discount and Final total labels.
5. Correct the formula explanation using PMC terminology: selling price equals adjusted cost divided by `(1 − PMC margin %)`, followed by discount. Keep related API calculation descriptions consistent.
6. Retain the response field `finalVendorChargesPaise` and its existing signed reconciliation relationship for compatibility. It remains `T − M`; only its user-facing display is removed. Keep the existing request shape, bounds, authorization and response field names.

## Architecture, state and scope boundaries

Extend the existing PMC preview calculation and shared simulator presentation. The established Sub-Vendor helper provides the required approach; no new dependency, endpoint or architecture decision is needed.

Expected affected areas are the backend mode-calculation function, calculation documentation/comments, the frontend simulator and directly related fixtures/regression tests. Margin settings, persistence/model validation, activation/copy behavior, pending/conflict review and saved-summary projection do not require changes.

The preview remains temporary and uses existing backend authorization. Keep active revisions, approved estimates, finance/ledger data and saved configuration unchanged. Sub-Vendor and In-house calculations retain their behavior. Preserve the existing PMC input limits and step, automatic previews, side-panel behavior and independently scrolling Quick summary.

Deploy the matching frontend and backend changes together when separately authorized; the updated frontend must reject an older additive PMC response. No migration, backfill or application-data write is needed. Code rollback affects subsequent previews only and requires no stored-data conversion. This task does not authorize staging, commits, pushes, deployment, seeding, production mutation or customer communication.

Before implementation, capture existing dirty paths and per-target diffs because this workspace already contains earlier changes. Assign ownership against those baselines and preserve unrelated work.

## Risks and acceptance criteria

The main risks are rounding differences, discounting the wrong amount, accepting an additive/stale response, or accidentally changing another calculation scope through shared code.

- **AC1 — Single setting preserved:** Configuration and simulator retain one PMC Margin field and their existing labels, limits and interaction behavior. No minimum/maximum field, range selection, stored-schema change or cross-scope fallback is introduced.
- **AC2 — Exact amounts:** Backend results match the table. Cover quantity below/equal/above the impact threshold, zero cost, zero/100% discount, half-up rounding and unsafe-result rejection. The existing PMC input validation remains unchanged.
- **AC3 — Correct automatic preview:** Changing valid inputs updates automatically using the single configured PMC percentage. Reject additive, mismatched and inconsistent responses; invalid inputs, errors and superseded requests cannot expose stale results as current.
- **AC4 — Result presentation:** Final vendor charges, Balance after margin and their explanation are absent for both zero and large discounts. Final total and the other PMC labels remain visible and accessible. The formula hint describes division using PMC margin.
- **AC5 — Compatibility and isolation:** Keep API fields and authorization unchanged, including the hidden signed reconciliation field. Verify distinct PMC/Sub-Vendor scenarios and unaffected In-house behavior. Saving or migrating configuration is unnecessary.
- **AC6 — Verification:** Run focused backend PMC calculation/preview and Sub-Vendor regression tests, affected route/OpenAPI checks, frontend PMC/Sub-Vendor simulator and relevant automatic-preview tests, both workspace typechecks/builds, and repository diff checks. Perform rendered desktop/mobile and keyboard/accessibility checks of the PMC result. Broaden checks only for affected shared behavior; replica-set or migration tests are unnecessary without persistence changes. In approved Mode A, use independent integrity review and final integrated verification proportionate to this financial change.

No product decision remains open. All approval and execution gates are complete for this scope.

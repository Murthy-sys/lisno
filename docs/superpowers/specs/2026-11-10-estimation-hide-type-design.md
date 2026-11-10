# Remove Type from the estimation screen

Date: 2026-11-10
Status: implemented and verified under Mode A; two unchanged baseline test failures documented in the task plan.

## Goal and current behavior

Remove the Type heading and Standard/Special controls or readonly text from Main Line rows in the Sales/Estimator estimation workspace.

`ConfiguredLineRow` in `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` supplies the Type slot to the shared `EstimateLineLayout`. That slot currently renders radios while editing and readonly text otherwise. Omitting the slot also removes its wrapper and spacing. The Client quotation and Configuration Client view preview supply their own Type presentations.

## Scope and constraints

- Remove the Type slot from estimator rows, including their readonly and review presentations. Do not leave a blank column or hidden keyboard-focusable controls.
- Preserve the existing tier selection, compact Qty/Rate widths, field-group alignment, quantity controls and disabled selling-rate input.
- Preserve saved Standard/Special classification values, defaults, pricing calculations, permission checks and save payloads. This is a display/control removal, not a data conversion. Existing pricing-method availability continues to follow the current classification and permissions; no replacement type selector or automatic classification change is introduced.
- Limit product changes to the estimator caller. Client quotation and Configuration Client view preview are outside this request. Keep the shared layout's optional Type capability for those callers.
- Preserve all existing uncommitted work. No dependency, backend, API, migration, commit or deployment changes.

## Acceptance and verification

1. Estimator Main Line rows contain no Type heading, Standard/Special radios or readonly Type text, and no reserved Type column.
2. Rows with stored Standard and Special values still show their existing configured prices and permitted pricing controls; quantity and tier interactions remain functional, rates remain disabled, and rendering does not rewrite classification.
3. Compact field widths, right alignment on wide rows and narrow-screen wrapping remain intact.
4. Update affected frontend tests to use saved/initial classification fixtures where they previously clicked the removed selector. Retain their pricing, persistence and permission assertions. Run the affected builder/workspace regressions, frontend build and `git diff --check`; perform a focused rendered desktop/mobile check of the changed row.

The primary risk is accidentally changing pricing behavior while removing a UI control. Keep the underlying classification logic in place and verify Standard/Special fixtures. No open product decision or migration is required.

Verification: the frontend build and rendered width/interaction checks passed. The focused regressions passed 167 of 169 tests; both failures were independently reproduced against the original renderer and tests. See the [completed task plan](../plans/2026-11-10-estimation-hide-type.md) for evidence and limitations.

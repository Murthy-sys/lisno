# Sub-Vendor simulator — final total only

Status: specification and task plan approved; executed in mode A. Implementation and focused checks passed; desktop rendering verified. Mobile screenshot verification was limited by an automation timeout (details in the task plan).

## Goal and scope

In Sub-Vendor Test calculations, remove **Final vendor charges** and keep **Final total** as the sole final-summary row, matching the attached screenshot. Keep the preceding calculation breakdown: base amount, applicable low-quantity impact, adjusted cost, Lisno margin, selling price before discount and discount.

Interpretation: this applies to the Sub-Vendor simulator shown in the attachment. It does not remove all intermediate breakdown rows or change PMC/In-house presentation.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationSimulator.tsx:261` renders a shared margin-result row labelled **Final vendor charges**, or **Balance after margin** when its value is negative. **Final total** follows it.
- The same component at line274 renders a paragraph explaining vendor charges or the negative balance. That paragraph would refer to a removed row if left visible.
- The component's response guard separately verifies `finalVendorChargesPaise` and financial reconciliation. The existing Sub-Vendor and Mode lifecycle tests assert the displayed vendor row; PMC uses the same rendering branch.

## Requirements and invariants

1. Omit the vendor-result row for `scope === "sub_vendor"` in both its positive and negative variants. Neither label/output should remain in the accessible result tree.
2. Omit the associated vendor-charge/negative-balance explanatory paragraph for Sub-Vendor. Preserve the low-quantity-impact note and other calculation guidance.
3. Keep **Final total**, its accessible output name, value, emphasis and spacing. No empty row or unnecessary gap should replace the deleted row. For the attached example, base₹15,000 at35% with zero impact/discount still produces **₹23,076.92**.
4. Preserve both Min./Max. scenarios, five-point margin rules, discounts, integer-paise rounding, the approved selling-price formula, result validation and stale/loading/error behavior. Backend fields, APIs, storage and the reconciliation guard remain unchanged even though the vendor amount is no longer displayed.
5. Preserve PMC's existing row/note, In-house behavior and unrelated prior changes. Keep shared CSS used by PMC. No new dependency, migration or configuration write is needed.

## Acceptance criteria and verification

- **AC1:** Sub-Vendor results show Final total with the same amount; neither Final vendor charges nor Balance after margin nor their explanatory paragraph is visible or exposed as an output. Cover zero and nonzero discounts, including a response with a negative vendor balance.
- **AC2:** The earlier breakdown and selected Min./Max. context remain. The screenshot example remains₹23,076.92. No arithmetic or response-validation checks are removed.
- **AC3:** PMC rendering and calculations remain unchanged. Update affected assertions in existing Sub-Vendor and Mode lifecycle tests, retaining malformed-response and discount coverage; run those focused tests and the shared PMC simulator tests. Run frontend typecheck/build and `git diff --check` after implementation.
- **AC4:** Inspect the shortened rendered result and accessible Final total on desktop and a small viewport using bounded browser checks. Report any automation limit explicitly; previous mobile browser sessions timed out, so a screenshot cannot stand in for an uncompleted interaction.

## Constraints, risks and open decisions

The main risk is accidentally removing PMC's shared row or weakening response validation while hiding Sub-Vendor presentation. Use scope-specific rendering conditions and preserve the transport/guard logic. No material product decision is open; removing the explanatory paragraph and negative variant follows the request to retain only Final total in this final-summary area.

The worktree already contains49 modified tracked files and eight prior task documents. Preserve those changes and capture the current target diffs before implementation. This is a small local display change, so review and tests should stay focused. No backend/full-repository/replica-suite rerun is needed unless an unexpected implementation change warrants it. No commit, push, deployment or application-data mutation is included.

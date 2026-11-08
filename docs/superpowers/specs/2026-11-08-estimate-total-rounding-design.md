# Final estimate total rounding

The user confirmed rounding applies only to the final estimate total. Keep configured selling rates, line amounts, subtotal and GST unchanged. After adding GST, round the grand total to a whole rupee: paise above 50 round up, while 50 or less round down. Examples: 102.24 → 102, 102.50 → 102, 102.52 → 103.

Store an optional signed `roundOffPaise` alongside integer-paise totals. New saves always provide it, including zero; subtotal + GST + adjustment must equal total. Reject unsafe integer amounts and overflow. Missing adjustment means historical exact-sum behavior, preserving published/approved snapshots and existing saved read-only amounts without a migration.

Apply the rule to staff saves, quotation edits and tier/dimensions updates. Editable previews use the same rule. Carry the adjustment through publication, revision snapshots, client review, PDFs and approved finance baselines. Display a signed Round off summary row when nonzero. Finance retains original pre-GST revenue, GST, costs and budget semantics, while its approved contract total includes the adjustment. Individual and aggregate validation must accept only reconciled amounts.

Acceptance includes below/at/above 50 paise, zero and whole-rupee totals, unequal projects, stale or forged adjustment rejection, save/reopen, all three roles, immutable historical views, publication/PDF/approval and portfolio reconciliation. No production data migration, new dependency, invoice or purchase-order rounding is required.

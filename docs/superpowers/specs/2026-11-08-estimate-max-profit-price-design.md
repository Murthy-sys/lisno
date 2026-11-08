# Estimate main-line selling price

The estimation catalogue previously projected raw base rates. New lines, mode/tier changes, save validation, quotations and publication all consumed that projection as a selling price.

Apply the selected current Main Line revision and tier's maximum profit additively: 20,000 paise plus 2,500 basis points yields 25,000 paise. Expose only the final price. Keep existing wire field names for compatibility and document their meaning. Use exact integer arithmetic with nearest-paise rounding and reject unsafe totals. Missing or invalid maxima remain unpriced instead of borrowing another mode/tier.

PMC/Sub-Vendor use their own maximum margin fields. Legacy In-house uses startingMarkupBps for its combined rate, or independently prices and sums its labor/material settings. Modern In-house component calculations already incorporate configured profit and retain their existing rules. Manual prices, approved/published snapshots, Configuration calculators, GST and quantity rules retain their behavior. No schema migration or production mutation is needed.

Acceptance: display 250 for base 200 and max 25%; quantity two totals 500; no margin details in estimation UI/API; save/reload and tier choices use the same final rate; current draft wins over active revision; unequal lines/projects stay independent; historical snapshots stay frozen.

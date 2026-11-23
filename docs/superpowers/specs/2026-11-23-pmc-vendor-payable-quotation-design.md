# PMC margin in Estimation and vendor payable in the quotation

## Goal

When PMC is enabled for a Main Line, Sales needs the maximum margin allocated to Lisno. The client needs the rate and amount payable to the vendor, inclusive of taxes. The customer quotation should present one payable total without a separate GST row.

## Current behavior and source of truth

Configuration’s calculateKnowledgePmcPrice exposes distinct PMC margin and final vendor charges. Its reconciliation rule equates final vendor charges to the quantity-adjusted vendor amount. The estimate-mode selling-rate helper also exposes a rate calculated with markup. These amounts can differ. Use the authoritative PMC calculation and its explicitly named vendor and margin outputs for their respective purposes. The proposal currently labels item pricing as excluding GST and prints subtotal and GST separately. The estimate PDF service also has a separate GST summary path.

## Display and calculation requirements

- For an included PMC line, show the configured maximum margin percentage and resulting Lisno margin amount for the actual quantity on the internal Estimation screen. Identify the margin as pre-tax. Keep this internal breakdown out of Client estimation and customer PDFs.
- Use final vendor charges as the PMC contribution to the client quotation and payable summaries. Show a tax-inclusive vendor rate per sqft for sqft items, or per configured unit for other UOMs, and the tax-inclusive line amount. Use the existing tax, quantity-impact, discount and rounding rules. Retain precision in paise through calculation. Derive displayed unit rates from the same basis as the line amounts.
- Reconcile room, basket, estimate and PDF totals to the same payable lines and existing estimate round-off. A mixed estimate includes the existing customer prices for non-PMC lines and the vendor payable for PMC lines. Use a general total-payable label for a mixed quotation. Suppress separate GST rows and tax-exclusive rate labels throughout the customer quotation, including itemised and summary pages.
- Changing quantity, tier or PMC status refreshes the relevant margin and payable. Switching PMC off restores normal pricing. A missing pricing input produces an explicit incomplete state and follows existing publication guards.

## Data, constraints and risks

Resolve current Configuration by stable Main Line and revision IDs for editable estimates. Carry the calculated payable basis through saving and publication so the PDF and totals use the same figures. Keep internal financial and tax records available for reconciliation. Previously issued PDFs and approved customer amounts are immutable. Existing drafts with insufficient PMC source data require review before publication. This scope covers estimation and the customer quotation. Vendor purchase orders, invoices and ledgers have separate workflows.

## Acceptance and verification

1. For a PMC line whose existing calculation returns ₹100 per sqft in vendor charges before tax, at 10 sqft and the existing 18% estimate tax, the customer sees ₹118/sqft and ₹1,180 payable. Sales sees the maximum margin separately. Adding that margin again to the ₹1,180 would fail the test.
2. Verify a fractional quantity, a low-quantity impact, a configured discount where supported, missing source data, and a mixed PMC/non-PMC estimate. Reconcile rate, line amount, totals and round-off to stored paise.
3. Save and reopen, publish a new quotation, and inspect the rendered PDF for tax-inclusive rates, line amounts and total. Check that no separate GST row or Lisno margin appears. Verify historical artifacts retain their recorded amounts.

## Assumption for approval

“Payable to the vendor” means the PMC calculation’s final vendor charges plus applicable tax. Lisno’s margin is a separate internal amount. Keeping it in the vendor payable would produce a different quotation total.

# Submitted quotation: total inclusive of all charges

Date: 2026-11-24
Status: Initial spec/plan approved and implemented in Mode A. Updated to reflect the user's explicit follow-up: show only total money inclusive of all charges; hide separate GST and round-off.

## Goal and final presentation

The submitted pre/post-design quotation's **Price summary** shows one monetary row: **Total payable inclusive of all charges**. For the supplied example this is **₹425.00**. Do not display separate subtotal, GST, round-off, PMC recipient, PMC grouping or other-work rows inside this summary.

The total includes every applicable saved charge, tax and recorded rounding adjustment. It remains immediately above the existing approval/change-request controls and agrees with the header. Use Indian currency formatting with two decimal places.

## Evidence and source of truth

`ClientQuotationSubmittedView.tsx` reads `publishedReview.snapshot` and computes one `clientEstimateTotal` value for the header and summary. That existing reader selects the saved combined customer obligation for PMC quotes and rejects invalid payment evidence. It does not calculate the total from visible or filtered item rows.

The previous implementation displayed an expanded breakdown. The user's follow-up explicitly replaces that summary with a single all-inclusive total. This is a presentation correction; underlying amounts, tax, round-off, financial validation and approved records remain unchanged.

## Scope and invariants

- Frontend-only change to the submitted-review summary and its scoped styles/tests.
- Keep existing before-tax item information, configured PMC item shares, approval confirmation, PDFs and other screens unchanged.
- Retain saved paise precedence, legacy rupee compatibility, zero values and unavailable feedback. Do not turn missing/invalid totals into zero or fall back to vendor-only money for invalid PMC evidence.
- Preserve published-review identity, immutable totals, hidden-scope protection, search/room behavior, PDF controls and decision guards.
- No backend/API/schema, financial formula, dependency, lockfile, email, deployment or migration changes.

## Acceptance and verification

1. Price summary contains one monetary definition, labelled Total payable inclusive of all charges, and no breakdown rows.
2. The supplied quotation displays ₹425.00; header and summary agree for ordinary, PMC-only, mixed, legacy, zero and invalid cases.
3. Totals remain bound to the correct saved review despite switching reviews, filtering or hidden item scope. Existing approval and PDF interactions are preserved.
4. Desktop and phone renders wrap the label and amount without page-wide overflow. Focused rendered regression tests, frontend typecheck/build and diff hygiene pass.

## Risks, assumptions and rollback

The request applies to the Price summary highlighted in the screenshot; previously requested PMC differentiation at item/PDF level remains. Avoid replacing the combined PMC customer obligation with the vendor-only estimate total. Rollback is a frontend presentation revert and requires no data action. No unresolved product decisions remain.

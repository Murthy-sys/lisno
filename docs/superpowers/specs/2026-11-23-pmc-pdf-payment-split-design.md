# PMC payments to Lisno and the vendor in quotation PDFs

Date: 2026-11-23
Status: Approved and implemented in Mode A. Verification passed; see the linked task plan for exact checks and limitations.

## Goal and confirmed interpretation

For each included PMC item, show the estimated value, the amount payable to Lisno with its percentage, and the amount payable to the vendor. Use the selected Main Line and tier's configured **maximum PMC margin**, as confirmed by the user. Do not hardcode 20%.

Use the existing PMC calculation as the source of truth. Its configured percentage is Lisno's share of the combined estimated value before tax. Preserve its calculated vendor charge. The latest request supersedes the earlier requirement to keep the PMC fee entirely internal for this explicitly requested customer payment breakdown; other internal pricing remains private.

Example from the existing calculation, before tax:

| PDF field | Value |
| --- | ---: |
| PMC estimated value | ₹1,250 |
| Payable to Lisno: 20% of estimated value | ₹250 |
| Payable to vendor: remaining 80% | ₹1,000 |

₹1,000 is the existing vendor charge in this example. The split must not reduce that charge to ₹800 or treat 20% as a markup on ₹1,000.

## Current behavior and evidence

- `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts` calculates the combined PMC value using the configured margin, derives Lisno's margin as the difference, and preserves the quantity-adjusted vendor amount as `finalVendorChargesPaise`. PMC margin is currently validated between 10% and 20%. Existing PMC discounts, where supported, reduce Lisno's charge rather than the vendor charge.
- `backend/src/services/quotation.service.ts` saves the vendor amount in `amountPaise`, marks `pmcVendorPayable`, and separately captures the percentage and Lisno amount in `pmcMarginSnapshot`.
- `backend/src/models/Estimate.ts` makes `pmcMarginSnapshot` private by default with `select: false`. Current preview/publication reads do not consistently select it. It cannot simply be assumed present in a PDF input.
- `toEstimateSnapshot` in `backend/src/services/estimate-publication.service.ts`, the review-round model, client projection schemas and PDF types currently carry the vendor basis but omit a public Lisno/vendor payment split.
- `backend/src/services/estimate-proposal-pdf/content.ts` presents tax-inclusive row amounts. `pages.ts` labels an all-PMC total **Payable to vendor**, and the welcome/payment/acceptance pages currently use the same saved vendor-based total.
- The estimator preview and Sales-submit email now share the existing proposal renderer. Both must receive the same new split data through their established paths.

These are code findings, not inspection of a particular live estimate. The repository is already dirty, including these pricing, snapshot and PDF files. Preserve existing work and capture relevant diffs before any later implementation.

## Scope and presentation

1. Add a compact payment breakdown beneath each customer-visible PMC item, using existing proposal typography and pagination:
   - **PMC estimated value**
   - **Payable to Lisno · X% of estimated value**
   - **Payable to vendor · remaining share**
2. Show the actual saved percentage for that item's Main Line/tier. Different PMC items can have different percentages; never show a single 20% label for a mixed-rate subtotal.
3. Keep currency amounts tax-inclusive in the customer PDF, consistent with current presentation. State that the configured percentage is applied before tax; derive tax-inclusive values using the application's existing tax policy and integer-paise rounding. No tax-rule change is included.
4. Summarize **PMC payable to Lisno**, **PMC payable to vendors**, and **Total PMC estimated value**. In mixed quotations, show non-PMC work separately and make the combined customer amount explicit. The recipient amounts must reconcile exactly; no double counting of the vendor amount or Lisno fee.
5. Use the same saved split in draft/internal-review previews, newly published proposal PDFs and their client-email renditions. Keep the current viewer and PDF styling.
6. The welcome, investment, payment and acceptance pages must consistently distinguish the full estimated value from recipient payables. Do not label the existing vendor-only total as the full customer obligation after displaying an additional Lisno fee.
7. The current five-stage payment schedule has no separate recorded schedule for PMC vendor payments. For PMC-only scope, use the recipient breakdown instead of implying that vendor payments follow Lisno's booking milestones. For mixed scope, retain the existing milestone percentages for the non-PMC work, explicitly label that basis, and show PMC recipient amounts separately without inventing PMC due dates. Update the acceptance booking figure to the same non-PMC basis; omit that figure for PMC-only scope.

Non-goals: redesigning the estimator/editor; changing Configuration's percentages or PMC calculation; changing vendor procurement/invoices/ledgers; collecting payments; introducing new discounts or tax policy; rewriting approved history; migrating production; sending real email. Any minimal API/approval-total presentation needed to keep the new PDF's commercial amount consistent is in scope; broad screen redesign is not.

## Data contract and financial invariants

- **Current source:** resolve the exact Main Line and selected tier using existing Configuration revision rules. Use the existing calculated/saved vendor charge and maximum-margin evidence for that saved estimate version. If Configuration changed, require the existing refresh/save flow before presenting new commercial values. Do not combine an old saved vendor amount with a newly fetched percentage.
- **Dedicated public split:** introduce an explicitly validated optional customer-facing PMC payment object containing the configured percentage, pre-tax estimated value, Lisno payable, vendor payable, and the corresponding tax-inclusive amounts. Final names belong in the task plan. Do not expose the raw private margin snapshot or unrelated calculation inputs through general DTO serialization.
- **Reconciliation:** before tax, estimated value = vendor amount + Lisno amount. Use existing calculator results rather than multiplying the vendor amount by the margin percentage. After tax, preserve the vendor allocation and calculate the Lisno allocation under the same applicable policy. Store/reuse the resulting whole-paise amounts; allocate any rounding remainder once and explicitly.
- **Combined total:** preserve existing vendor-based amount fields and their meaning for compatibility. Record the new PMC fee and combined customer payable as explicitly named commercial values, derived on the backend. All new PDF totals and any customer approval total using this document must reference that saved breakdown. Do not fabricate a larger grand total only inside the renderer or silently overwrite an approved financial baseline.
- **Publication:** freeze the public split, percentage, tax basis and combined payable into each new review round. Include them in validation, source/freshness comparison and existing transaction/CAS boundaries so a configuration edit during publication cannot change the document silently. Draft reads remain side-effect free.
- **History:** existing issued rounds without this split retain their recorded amounts and existing PDF behavior. Never derive historical fees from today's Configuration. Revised quotations obtain the split through a new saved version and normal publication/approval flow. No backfill is proposed.
- **Visibility:** apply existing client visibility rules before rendering item breakdowns. Preserve authorized full-estimate summary totals without disclosing hidden item names, rates or private fields. Do not rebuild historical amounts from visible rows alone.
- **Missing evidence:** a new or editable PMC estimate lacking a valid saved split must request refresh/save or report incomplete pricing. It must not substitute zero, assume 20%, or guess a fee. Non-PMC quotations remain usable and retain their current calculations.
- **Discounts:** the existing estimator save path does not apply a PMC discount here. If a supported source carries one, preserve the existing effective Lisno fee and show its discount separately so the maximum configured percentage is not misrepresented as the effective payment share.
- **Permissions/delivery:** keep current authorization and project scope. Publication remains independent of email delivery; retries reuse the same stored commercial snapshot/rendition. Merely viewing a draft must not publish, send mail, create a review round or write audit/storage records.

## Compatibility and risks

The main risk is presenting Lisno's fee as an additional obligation while other totals still mean vendor-only charges. The new fields and labels must keep those bases explicit and aligned through approval. This is why the change includes saved commercial metadata as well as PDF text.

Schema additions should be optional for historical records, validated for new PMC publications and preserved through memory/Mongo representations and client-safe parsers. Existing cached historical renditions must not be silently upgraded with inferred fees. If rendition versioning is needed, scope it to documents carrying the new split and retain old artifacts.

Rollback must preserve newly published snapshots and their recorded amounts. Do not remove or reinterpret issued split fields after publication. No live migration or destructive rollback is authorized.

## Acceptance criteria

1. A Main Line configured at 20% with a ₹1,000 vendor amount produces ₹1,250 estimated value, ₹250 Lisno and ₹1,000 vendor before tax. A second line configured at 15% uses 15%, with paise rounding from the existing calculator. No hardcoded percentage or fee markup is used.
2. Each visible PMC item and the PDF summary show the recipient breakdown. The combined amount equals the sum of recipient amounts. Non-PMC items retain their current customer prices; mixed totals and any round-off reconcile without applying PMC percentages to other work.
3. Verify fractional quantities, low-quantity impact, unequal projects, different tiers/percentages, missing evidence and any supported discount. Use existing GST rules and confirm the vendor charge is not reduced or charged twice.
4. Save/reopen and draft preview use the saved version. New publication freezes the split; later quantity, tier or Configuration edits do not alter that issued PDF or email retry. Legacy issued PDFs remain unchanged.
5. Client-visible safe fields survive snapshot persistence and validation. Private pricing and hidden descriptions remain absent. Wrong-project/user reads fail, and stale-version/configuration races cannot return a mismatched split.
6. Real PDF extraction and rendered inspection verify item breakdown, summary, payment basis and acceptance amounts with long descriptions, multiple pages, PMC-only and mixed scope. Preview and email use the same renderer and saved split.

## Verification and open decisions

After specification and task-plan approval and execution-mode selection, use focused calculation, saved-preview, publication replica-set, rendition and real-PDF tests; backend typecheck/build; and visual checks of synthetic PDFs in the existing desktop/phone viewer. Trace every acceptance criterion to the separate task plan. No tests or product-code edits were performed at this specification stage.

The percentage source is confirmed. The evidence-backed interpretation is to preserve the current Configuration calculation and vendor amount while exposing the combined value and Lisno fee. The payment-page treatment and explicit combined-total contract above are proposed as part of this specification, not implemented behavior.

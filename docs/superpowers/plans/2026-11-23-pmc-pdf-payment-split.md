# PMC payment split: implementation plan

Date: 2026-11-23
Status: Complete. Approved specification and task plan implemented in Mode A; integrity review, automated verification and synthetic browser QA passed.

## Outcome and boundaries

Show each PMC item's estimated value, Lisno payable at its configured maximum PMC percentage, and vendor payable in the existing PDF. Summarize the recipients, preserve vendor pricing and historical artifacts, and align the new customer total in approval displays and email text. Keep the existing layout and calculation engines.

This change carries financial and publication risk because current quote totals contain vendor charges while the newly disclosed Lisno fee is additional. Existing amount fields retain their meaning; named new fields carry the combined obligation. No Configuration rate changes, vendor ledger/procurement changes, production migration, historical backfill, dependency installation, real email, commit, push or deployment is included.

## Contract to establish before parallel implementation

The primary agent owns these additive types and their validation rules. Use `shared/estimation/estimatePmcPaymentSplit.ts` for shared shapes and `backend/src/domain/estimate-pmc-payment-split.ts` for authoritative construction/validation. UI consumers read saved amounts; they do not calculate a fee from a percentage.

### Per-line `pmcPaymentSplit`

Optional for historical records and non-PMC lines; required for newly saved, complete, included PMC lines and new PMC publications:

- `version: 1`
- `marginBps`: the selected Main Line/tier's configured maximum PMC margin.
- `vendorAmountPaise`, `lisnoAmountPaise`, `estimatedValuePaise`: pre-tax amounts from the existing PMC calculation.
- `vendorPayablePaise`, `lisnoPayablePaise`, `totalPayablePaise`: the corresponding tax-inclusive amounts.
- `taxBasis: { subtotalPaise, gstPaise }`: the recorded estimate tax basis used for allocation.

Reuse the containing line's stable identity and saved source revision/version fields. Do not duplicate names as join keys. Reject malformed, unsafe or unreconciled values. `pmcMarginSnapshot` remains private and is selected only in authorized backend operations that require it.

The existing estimate mutation APIs have no PMC discount command. Do not add one. If an existing persisted supported discount source is encountered, retain its explicit before-discount value and effective Lisno charge in an optional validated discount object, rendering the discount separately as required by the spec. Missing discount evidence must not be inferred from the maximum percentage.

### Estimate/review-round `pmcPaymentSummary`

Optional when absent in history or when no included PMC lines exist:

- `version: 1`
- `vendorPayablePaise`: full-estimate PMC vendor amount.
- `lisnoPayablePaise`: full-estimate PMC Lisno amount.
- `pmcTotalPayablePaise`: the sum of those two recipient amounts.
- `otherWorkPayablePaise`: the existing tax-inclusive non-PMC work.
- `roundOffPaise`: the existing signed estimate adjustment.
- `customerTotalPayablePaise`: combined customer obligation across PMC and non-PMC scope.
- `nonPmcMilestoneBasisPaise`: the non-PMC work on which the existing milestone percentages apply in a mixed estimate.

Persist this summary alongside the saved lines and freeze it into new review rounds. Validate against complete source rows before visibility filtering. Client projections retain authorized full-estimate totals and only visible item details. Validation of an already filtered projection must not require visible rows to sum to hidden full-estimate scope.

### Exact money rules

1. Use `calculateKnowledgePmcPrice`/`calculateEstimatePmcPayable` results. With a ₹1,000 vendor amount and 20% configured margin, pre-tax value is ₹1,250 and Lisno receives ₹250. Do not multiply ₹1,000 by 20% or reduce the vendor share.
2. Keep existing allocation of recorded GST over vendor/non-PMC rows unchanged. Allocate GST over the additional Lisno fee amounts in stable source order using `allocateEstimatePayables` and the same recorded tax basis. Save the resulting allocations once.
3. For each PMC row, `totalPayablePaise = vendorPayablePaise + lisnoPayablePaise`. Without a recorded discount, `estimatedValuePaise = vendorAmountPaise + lisnoAmountPaise`.
4. `pmcTotalPayablePaise = vendorPayablePaise + lisnoPayablePaise`; `customerTotalPayablePaise = pmcTotalPayablePaise + otherWorkPayablePaise + roundOffPaise`. It also equals the existing saved `totalPaise` plus the new Lisno fee total. Do not apply another whole-rupee rounding pass.
5. In mixed scope, `nonPmcMilestoneBasisPaise = otherWorkPayablePaise`. Keep the whole-estimate round-off as a separate visible adjustment, not an invented vendor discount or fee. Existing non-PMC-only documents retain their current rounded milestone basis and output.
6. The new customer total describes payments across recipients; it must not replace vendor procurement amounts or be treated as wholly Lisno revenue. Existing financial baseline fields are preserved. Approvals bind the complete new commercial snapshot, including the split and summary.

## Dependency-ordered tasks

### T0. Capture baseline and establish shared contracts

Owner: primary agent. Depends on approvals and execution-mode selection. Acceptance criteria: foundation for AC1–AC6.

- Capture `git status --short`, target diffs and copies of untracked targets before writers start. The repository already contains PMC pricing changes and the completed PDF-template reuse fix; preserve them.
- Establish the shared shapes/domain helper above and a small synthetic fixture matrix. Add focused domain tests in `backend/tests/estimate-pmc-payment-split.test.ts`.
- Verify 20% and 15% use the existing calculator, including fractional quantities and low-quantity impact. Test paise/tax/round-off reconciliation, zero values, mixed scope, invalid evidence and overflow.
- Establish optional persistence fields in `backend/src/models/Estimate.ts`, `backend/src/models/EstimateClientReviewRound.ts`, and shared snapshot/PDF type additions in `backend/src/domain/estimate-client-review.ts` and `backend/src/services/estimate-pdf.service.ts`.
- Check memory/Mongo contract representations. Add the fields to explicit allowlists/mappers only where needed; do not refactor repository boundaries. Preserve old snapshots without defaults or inferred fees.
- Primary owns these shared files until the contract is stable. Report any incompatible source semantics before expanding scope.

### T1. Save, publish and project the canonical split

Owner: backend implementation slice. Depends on T0. Acceptance criteria: AC1–AC5.

Owned source paths:

- `backend/src/routes/estimates.ts`
- `backend/src/services/quotation.service.ts`
- `backend/src/services/estimate-tiers.service.ts`
- `backend/src/services/quotation-setup.service.ts`, only where a mutation changes included/priced scope
- `backend/src/services/quotation-draft-pdf.service.ts`
- `backend/src/services/estimate-publication.service.ts`
- `backend/src/services/estimate-client-presentation.ts`
- `backend/src/services/client-quotation-projection.service.ts`
- `backend/src/services/client-quotation-rendition.service.ts`
- `backend/src/services/estimate-revisions.service.ts`
- `backend/src/services/estimate-client-review.service.ts`
- `backend/src/services/quotation-approval-state.service.ts`
- `backend/src/services/estimate-delivery.service.ts`

Implementation:

1. Update existing staff save, Client quotation edit and tier/dimension save paths to derive the complete split/summary after existing vendor totals are known. Clear stale split data when PMC is disabled, an item is excluded, or scope changes; refresh all affected tax allocations when the estimate's row order or amounts change.
2. Require the exact saved Main Line/tier/revision evidence. Compare both fee and vendor amounts against current Configuration for new publication; a margin-only Configuration change must not pass a vendor-rate-only freshness check.
3. Preserve private evidence on full-array writes, explicitly selecting it only after authorization where necessary. Return the validated public split, never the raw private snapshot, to customer consumers.
4. Draft previews consume the saved split and remain read-only. Existing drafts lacking valid evidence receive a refresh/save or incomplete-pricing response rather than an assumed fee. A normal save can upgrade a draft; no backfill is required.
5. Feed identical frozen data to the publication PDF and committed review-round snapshot within current transaction/CAS/freshness checks. Recheck the complete commercial input after rendering. Include split/summary in approval comparisons and snapshot digests; do not change historical digest values by adding defaults to old records.
6. Preserve new fields through client-safe schemas, revision reads, admin review mapping and quotation/tier responses. Compare old/new customer totals and split changes when describing revised submissions. Audit approval paths so no new fee can be approved against an older vendor-only snapshot.
7. Keep historical no-split renditions unchanged. New snapshots supply a distinct source/visibility identity through the existing digest mechanism; avoid a global rendition-policy bump that would regenerate historical PDFs unnecessarily.
8. Use frozen `customerTotalPayablePaise / 100` in new split-bearing email amount text, with the existing total as the legacy fallback. Keep attachment selection, delivery leases, retry/idempotency and disabled-mail behavior intact.

Owned tests: focused extensions to quotation edits, estimate tiers, estimator-catalogue estimate, publication unit/replica-set, approval state/approval replica-set, client projection/presentation/review, rendition, revision and delivery tests. Add no production-seeding or migration scripts. Primary handles any shared-file additions requested by this owner.

### T2. Render recipient breakdowns in the existing proposal

Owner: PDF implementation slice. Depends on T0; can run in parallel with T1 using the settled contract. Acceptance criteria: AC1–AC3 and AC6.

Owned paths: `backend/src/services/estimate-proposal-pdf/{content,details,pages,index}.ts`, `backend/src/services/estimate-pdf-pricing.ts`, `backend/tests/estimate-proposal-pdf.test.ts`, and the synthetic proposal fixture in `backend/tests/fixtures/estimate-proposal.ts`.

- Add the compact PMC estimated-value/Lisno/vendor breakdown beneath each visible PMC item, with the saved percentage and a clear before-tax percentage basis. Use the saved tax-inclusive amounts for displayed money.
- Make the main PMC item amount and relevant area/summary amounts clearly describe their combined payable; keep the vendor rate identifiable. Prevent a combined amount from appearing under a vendor-only label.
- Add recipient summary and non-PMC subtotal; use the saved combined customer total consistently in welcome, investment and applicable acceptance copy. Keep existing hidden-scope explanations and full-estimate summary totals.
- For PMC-only quotes, replace milestone instructions with recipient amounts and omit the booking figure. For mixed quotes, show non-PMC milestones on `nonPmcMilestoneBasisPaise` and keep PMC payables separate. Do not invent PMC payment dates.
- Preserve exact no-split legacy and non-PMC behavior. No template redesign, new assets, fonts or dependencies.
- Test real searchable PDF content, sums, pagination and bounds with long descriptions, multiple rates, mixed/PMC-only scope and all detail rows hidden. The shared PDF-service interface remains primary-owned; coordinate rather than edit it concurrently.

### T3. Align customer approval totals without redesign

Owner: client presentation slice. Depends on T0's contract; can run alongside T1/T2. Acceptance criteria: AC2, AC4–AC6.

Owned web areas: shared API shapes in `frontend/src/api/types.ts`; relevant amount shapes in `frontend/src/features/client/{clientApi,quotationApi,estimateTiersApi}.ts`, `frontend/src/features/leads/{leadsApi,estimateRevisionsApi}.ts` and `frontend/src/features/estimates/estimateWorkflowApi.ts`; existing submitted/approval displays in `frontend/src/features/estimates/{ClientPublishedEstimate,EstimateReviewPanel,SubmittedEstimateBuilder}.tsx` and `frontend/src/features/client/{ClientQuotationSubmittedView,ClientQuotation,ClientEstimateTiers}.tsx`. Restrict edits to amount selection, recipient labels and minimal safe breakdown presentation where the displayed basis would otherwise conflict.

The existing mobile approval consumer also reads snapshot totals. Its bounded compatibility scope is `mobile/src/features/estimates/clientReviewModel.ts`, `ClientEstimateReviewScreen.tsx` and `ClientPublishedEstimateDetails.tsx`, with their existing parser/rendered tests. Do not change the mobile estimator authoring workflow.

- Accept optional safe split/summary fields. Display `customerTotalPayablePaise` when a valid summary exists; use legacy totals only when it is absent, not when malformed.
- Show PMC recipient values in the approval summary so a customer is approving the same obligation as the PDF. Keep unsaved versus saved data and published-round identity explicit.
- Preserve current viewer, navigation, permissions and mutation behavior. Do not calculate fees in UI state or reprice a published document from Configuration.
- Ensure partial/old snapshots stay readable and invalid new data uses existing unavailable/error states. Add rendered tests for mixed totals, PMC-only totals, legacy fallback, historical selection and approval confirmation.

### T4. Integrate and run integrity review

Owner: primary agent. Depends on T1–T3 finishing. Acceptance criteria: AC1–AC6.

- Reconcile the complete diff against T0. Inspect source-of-truth propagation through every explicit mapper, including memory and Mongo representations, and update additive OpenAPI response shapes where an explicit schema exists. No authorization-registry change is expected because operations are unchanged.
- Confirm saved amount fields and unrelated finance/procurement baselines retain their existing semantics. Check that only the new named summary represents the customer obligation across recipients.
- Exercise save, edit quantity/tier, disable PMC, publish, approve, start a later draft, change Configuration, and retry delivery. Issued amounts and old no-split artifacts remain fixed.
- In Mode A, run `integrity_reviewer` after all writers stop. Resolve confirmed findings, then run `verification_runner` on the final integrated tree. In Mode B, perform those stages inline and sequentially.

### T5. Final verification and handoff

Owner: verification agent in Mode A; primary in Mode B. Depends on T4 review fixes. Acceptance criteria: AC1–AC6.

Run the relevant focused tests first, then workspace typechecks/builds. Reuse tests that already prove unchanged financial rules; extend only missing behavior. Use replica-set integration tests for changed transactional publication/approval paths.

Backend focused commands, from `backend/`:

```sh
npm test -- tests/estimate-pmc-payment-split.test.ts tests/ai-estimator-knowledge-pmc-calculation.test.ts tests/estimate-proposal-pdf.test.ts tests/estimate-pdf.test.ts
npm test -- tests/quotation-edits.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/quotation-approval-state.test.ts tests/quotation-approvals.replica-set.test.ts
npm test -- tests/client-quotation-projection.test.ts tests/estimate-client-presentation.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts tests/client-quotation-rendition.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts tests/estimate-delivery.test.ts
npm run typecheck
npm run build
```

Web focused commands, from `frontend/`:

```sh
npm test -- src/features/client/ClientEstimationWorkspace.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/SubmittedEstimateBuilder.test.tsx src/features/estimates/QuotationPdfViewer.test.tsx
npm run typecheck
npm run build
```

Mobile compatibility commands, from `mobile/`:

```sh
npm test -- --runInBand src/features/estimates/clientReviewModel.test.ts src/features/estimates/ClientEstimateReviewScreen.test.tsx
npm run typecheck
```

Both listed mobile test files exist. Run the app's existing export lane only if changed imports/runtime behavior require bundle verification; do not prebuild native projects or introduce generated native sources for this amount-display change.

Final checks from the repository root:

```sh
git diff --check
git status --short
```

Visual QA: inspect generated synthetic PMC-only and mixed PDFs, item continuation pages, summaries, payment pages and acceptance figures. Open the real existing viewer at desktop 1440×900 and phone 390×844; verify readable labels, no clipping, scrolling/download, keyboard close and focus. Check web approval confirmation agrees with the PDF. Keep generated artifacts in a task-specific temporary directory and remove them after recording results. Use isolated test replica sets, not any existing user database. Do not send email or use real client data.

## Acceptance trace and execution mode

| Spec criterion | Primary evidence |
| --- | --- |
| AC1: configured maximum percentage | T0 calculator fixtures; T1 saved Main Line/tier lineage; T2 row labels |
| AC2: recipient and mixed-total reconciliation | T0 paise invariants; T2 summary/payment pages; T3 approval totals |
| AC3: quantities, impacts, tax and missing evidence | T0 edge cases; T1 mutation/validation tests; two unequal projects |
| AC4: save/publication/history stability | T1 replica-set lifecycle, digest and rendition tests; T3 historical selection |
| AC5: safe fields, permissions and races | T1 private-field/visibility tests; T4 integrity review |
| AC6: real PDF and preview/email parity | T2 PDF extraction/bounds; T5 rendered checks and same-round delivery tests |

Keep one parent task in progress. If Mode A is selected, T1, T2 and T3 may run concurrently only after T0 settles their shared contract. Give each owner the exact paths above, acceptance criteria and an explicit instruction to preserve others' edits. Primary owns shared files, integration and any boundary changes. Mobile compatibility may be a separate later slice if the web owner cannot cover it without exceeding the available slots. Review and final tests run after all writers stop. Mode B executes the same tasks inline without implementation subagents.

Do not broaden to unrelated code or repeat successful checks unless a new change, failure or unresolved risk warrants it. Record exact final results, pre-existing failures, unrun checks, temporary outputs and remaining limitations. Rollback must preserve already-issued split snapshots; no live data rewrite is authorized. This planning stage creates only this file and has run no product tests, builds or mutations.


## Implementation and review record

- Established `estimate-pmc-payment-split.ts` as the authoritative pure money contract; the shared module re-exports it to keep the backend root boundary intact. No discount command or persisted discount source exists in these workflows, so no discount schema or inference was introduced.
- Saved public split and summary fields are optional for historical records. New complete PMC saves populate them; new draft previews and publication require them. The existing vendor-based amounts and finance baselines retain their meaning.
- Completed T1 save/publication/freshness/approval/email integration, T2 existing booklet recipient rendering, and T3 web/mobile approval compatibility in separate owned slices. No dependencies added.
- Integration extended the approved mapper audit to the Mongo admin-project, project-status and finance estimate query selections. Each now retains the new summary before resolving approval. `EstimateSummaryRecord` and its explicit mapper retain the field. A replica-set regression verifies current PMC approval survives the project-status projection.
- T3 additionally updated `ClientQuotationLine.tsx` so its saved amount agrees with the new saved total, and extracted `estimatePmcPaymentPresentation.tsx` to avoid coupling working rows to the approval UI module. Existing description/rate changes were preserved. Mobile Jest mapping adds the new pure shared domain module.
- Integrity review found one issue: the tier selector still described vendor-only choice money as the selected total. The label now states “Selected vendor payable incl. GST” and explains that saving updates the full recipient breakdown; its rendered regression passed. No other confirmed findings remained in the reviewed delta.
- Baseline captured at `/private/tmp/lisno-pmc-split-53k4cq1q`; initial dirty files and their prior edits were preserved. Only scoped implementation, tests and these documents changed.

### Visual verification

Used synthetic PMC rows at 20% and 15%, plus unequal non-PMC scope and signed round-off. Inspected actual PDF detail, summary, recipient, non-PMC milestone and acceptance pages; no clipping or overlap observed. Existing no-split PDF tests retain the prior output.

Opened the real `QuotationPdfAction` and `ClientPublishedEstimate` components in an isolated local Vite harness at 1440×900 and 390×844. Checked recipient readability, approval confirmation against the PDF (customer total ₹2,950, PMC Lisno ₹472, PMC vendors ₹2,183, other work ₹295.15, round-off −₹0.15), PDF frame bounds, scrolling, download, Escape and restored trigger focus. The downloaded bytes match the generated PDF SHA-256. This was component/browser verification with synthetic data, not a live authenticated customer session or email delivery. The first harness load had a missing temporary favicon; the harness was corrected. No product JavaScript exception was observed.

### Proportionate checks before final verification

- Primary: `npm test -- tests/estimate-pmc-payment-split.test.ts tests/project-status-mongo.replica-set.test.ts tests/project-finance-mongo.replica-set.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/openapi.test.ts --maxWorkers=2`: 4 matched files, 83 tests passed. There is no `openapi.test.ts`; final verification uses the actual quotation/project-manager OpenAPI suites.
- Primary review fix: `npm test -- src/features/client/ClientEstimateTiers.test.tsx --maxWorkers=1`: 20 tests passed.
- Writer checks included focused PDF, source, publication race, model, visibility, web and mobile tests. Initial obsolete fixture expectations and transient parallel frontend startup timeouts were corrected or rerun serially. Final integrated results below supersede these intermediate counts.


### Final integrated verification

```text
PMC payment split: final integrated automated verification, 2026-11-23

All implementation writers had stopped before these checks. No source/test/configuration/documentation/dependency edits made by verification agents.

Backend, cwd backend/:
npm test -- tests/estimate-pmc-payment-split.test.ts tests/ai-estimator-knowledge-pmc-calculation.test.ts tests/estimate-proposal-pdf.test.ts tests/estimate-pdf.test.ts tests/quotation-edits.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/quotation-approval-state.test.ts tests/quotation-approvals.replica-set.test.ts tests/client-quotation-projection.test.ts tests/estimate-client-presentation.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts tests/client-quotation-rendition.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts tests/estimate-delivery.test.ts tests/quotation-openapi.test.ts tests/project-manager-openapi.test.ts --maxWorkers=2
Result: exit 0; 21 files, 747 tests passed. Duration 71.08s. Includes isolated Mongo replica-set suites. Existing Mongoose new-option deprecation warnings only.

npm run typecheck
Result: exit 0.

npm run build
Result: exit 0; tsc and static asset copying completed.

Final client verification on integrated worktree. No source, test, config, documentation or dependency edits by verifier.

cwd: /Users/murthy/Desktop/personal/lisno/frontend
$ npm test -- src/features/client/ClientEstimationWorkspace.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/SubmittedEstimateBuilder.test.tsx src/features/estimates/QuotationPdfViewer.test.tsx src/features/client/ClientQuotationLine.description.test.tsx --maxWorkers=1
Exit 0; 7 files, 106 tests passed; duration 18.79s.

cwd: /Users/murthy/Desktop/personal/lisno/frontend
$ npm run typecheck
Exit 0; tsc -b --pretty false passed.

cwd: /Users/murthy/Desktop/personal/lisno/frontend
$ npm run build
Exit 0; tsc and Vite build passed. 3384 modules transformed, Vite 10.31s. Existing bundle-size warning: chunks larger than 500kB; no new build error.

cwd: /Users/murthy/Desktop/personal/lisno/mobile
$ npm test -- --runInBand src/features/estimates/clientReviewModel.test.ts src/features/estimates/ClientEstimateReviewScreen.test.tsx
Exit 0; 2 suites, 29 tests passed; duration 3.276s.

cwd: /Users/murthy/Desktop/personal/lisno/mobile
$ npm run typecheck
Exit 0; tsc --noEmit --pretty false passed.

$ git diff --check
Exit 0
```

Final run: **882 passing tests** (747 backend, 106 web, 29 mobile). All three workspace typechecks and backend/frontend builds passed. `git status --short` confirmed the preserved uncommitted worktree; `git diff --check` passed. Existing Mongoose deprecation and Vite large-chunk warnings remain. No dependencies were installed.

Unrun checks: unrelated full workspace suites, OCR (unchanged), native mobile build/export/device testing, and a live authenticated customer/browser/email session. There is no lint script. No migration, production data change, real approval, customer email, commit, push or deployment was performed. Existing drafts need a normal refresh/save to acquire the new payment evidence; old issued PDFs remain unchanged.

Temporary PDFs, screenshots, harness, baseline copies and logs under `/private/tmp/lisno-pmc-split-53k4cq1q` were removed after recording the evidence. The QA browser and loopback server were closed. Ignored `backend/dist/` and `frontend/dist/` build outputs remain.

# Submitted quotation pricing summary: task plan

Date: 2026-11-24
Status: Initial implementation completed after spec/plan approval and Mode A selection. The user then explicitly corrected the summary to a single total inclusive of all charges; the total-only correction and verification are complete.

## Current follow-up: total only

The user explicitly requested removal of separate GST and round-off and asked to show only the total inclusive of all charges. This replaces the breakdown presentation in the initial tasks below. Primary owns the small component/CSS correction; the existing test agent owns its two submitted-review test files. Preserve item/PDF PMC differentiation and all financial readers.

- Removed every breakdown row from Price summary; it now contains only **Total payable inclusive of all charges** using the same saved customer total. Removed unused local subtotal/round-off readers and breakdown-only CSS.
- Captured the pre-correction dirty status/diff and target copies before writers. All prior task changes were understood and preserved.
- Updated focused tests to assert exactly one summary amount and absence of all pricing breakdown rows, while retaining source, rounding, invalid, PMC and interaction coverage. Two files / **45 tests passed**.
- Final correction verification passed: `cd frontend && npm test -- src/features/client/ClientQuotationSubmittedView.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx --maxWorkers=1` (**45 tests / 2 files**), `npm run typecheck`, `npm run build`, and `git diff --check`. Vite retains its large-chunk warning (largest application JS chunk 3,485.40 kB before gzip); ignored output is `frontend/dist/`.
- Rendered the real component with client-role styling and synthetic data at 1440×900 and 390×844. Both widths show exactly one summary amount, ₹425.00, with the all-charges label, readable contrast, no horizontal overflow, no runtime errors and no API requests. Visually inspected both screenshots. Focused tests retain keyboard/approval and saved-total/PMC/invalid-value coverage. The initial broader 72-test workspace verification is recorded below; full unrelated suites were not repeated for this removal of presentation rows.
- Primary inspected the integrated correction diff. No financial calculation, backend/API, PDF, decision, dependency or lockfile changes were introduced by this correction. No lint script exists; no deployment, migration, commit, push or production mutation was performed.
- Closed the temporary browser and Vite server and removed baseline copies, fixture, screenshots and cache under `/private/tmp/lisno-total-only-p_7jb7e2`.

## Initial outcome and boundaries

Add a complete **Price summary** and a prominent **Total payable inclusive of all taxes** immediately above the submitted quotation's decision controls. The header and footer must use the same immutable customer-total source. Preserve ordinary subtotal/GST/round-off and the existing PMC recipient breakdown, with two-decimal currency formatting in this review summary.

Frontend presentation only. Do not change financial formulas, published amounts, approval behavior, backend/API/schema, PDF artifacts, email, dependencies or lockfiles. Do not expose internal costs or allocate new per-line taxes. The approved specification remains the source of truth.

## T0. Capture baseline and settle presentation contract

Owner: primary agent. First task after execution-mode selection. Covers AC1–AC6.

- Capture fresh status and relevant target diffs before assigning writers. At plan creation, the only dirty path is this request's untracked specification; the preceding Client project-table work is baseline.
- Use a semantic **Price summary** section, followed by the existing decision component. Ordinary rows: **Submitted subtotal (before tax)**, **GST**, recorded nonzero signed **Round off**, and **Total payable inclusive of all taxes**.
- For PMC/mixed reviews, keep validated Lisno/vendor payables, their grouped PMC total, applicable other work and round-off. Clearly label recipient amounts as GST-inclusive and the PMC total as a subtotal of the two shares. Finish with the combined saved customer total.
- Compute the displayed total once from `clientEstimateTotal(review.snapshot)` and use it in both header and footer. Never substitute working-estimate totals or sum filtered/visible rows.
- Scope two-decimal formatting to this summary/header. If `PmcPaymentSummary` needs presentation options for formatting and tax-inclusive labels, keep them optional with existing defaults unchanged for every other consumer; retain existing validation rather than duplicating financial logic.
- Use saved paise when present, legacy rupees only when paise is absent, and explicit unavailable feedback for invalid values. Do not silently coerce invalid values to zero or re-round the recorded quotation.

## T1. Implement summary and scoped presentation

Owner: frontend implementation slice in Mode A; primary in Mode B. Depends on T0. Covers AC1–AC5.

Owned product files:

- `frontend/src/features/client/ClientQuotationSubmittedView.tsx`
- `frontend/src/features/client/clientQuotation.css`
- `frontend/src/features/estimates/estimatePmcPaymentPresentation.tsx` only if additive presentation options are needed; leave financial readers and existing consumer defaults intact.
- `frontend/src/features/estimates/SubmittedEstimateBuilder.tsx` only for concise before-tax labels/help text; preserve values, selection, grouping and component visibility.

Keep the implementation local; introduce a small submitted-review presentation helper only if it improves clarity, with its path assigned before creation. Add the summary, format its saved monetary values consistently, emphasize its final total and share that total with the header. Preserve the existing conditional PMC path without double-counting recipient shares, GST or grouped totals.

Keep the summary above approval/change-request controls in both embedded and bounded-workspace layouts. Use scoped CSS with wrapping labels/amounts and no overflow. Do not change decision handlers, PDF behavior, refresh guards, pending/stale rules, focus behavior or submission identifiers.

## T2. Add financial-presentation and interaction regressions

Owner: independent frontend test slice in Mode A; primary in Mode B. Depends on T0; may run beside T1. Covers AC1–AC5.

Owned test files:

- `frontend/src/features/client/ClientQuotationSubmittedView.test.tsx` (new focused coverage)
- `frontend/src/features/estimates/ClientPublishedEstimate.visibility.test.tsx`
- `frontend/src/features/estimates/SubmittedEstimateBuilder.test.tsx`

Test the screenshot's ₹360.00 + ₹64.80 + ₹0.20 = ₹425.00 display, header/footer agreement, negative/absent/zero round-off, zero totals and legacy rupee-only snapshots. Use explicit unequal fixtures and saved paise that differ from working/legacy values to detect incorrect fallbacks.

Cover PMC-only and mixed quotations, configured percentages, hidden/projected line details, malformed/missing payment evidence and combined customer totals. Verify taxes and grouped subtotals are not added twice and that unavailable values do not become zero.

Exercise two different published reviews, search/room changes, pre/post-design and read-only/approval-enabled states. Verify summary semantics, ordering before decisions and keyboard access. Preserve meaningful existing approval/PDF/visibility assertions; update only expectations intentionally changed by approved presentation.

## T3. Integrate and review

Owner: primary agent. Depends on T1 and T2. Covers AC1–AC6.

- Reconcile all diffs with the approved spec and inspect every changed shared presentation default.
- Primary owns any necessary test-only integration adaptation in `ProjectQuotationWorkspace.test.tsx`; do not modify project/workflow product code for this request.
- After writers stop, run the Mode A `integrity_reviewer` on saved-money lineage, paise/rupee boundaries, PMC reconciliation, invalid-value feedback, decision preservation and CSS isolation. In Mode B, perform the same review inline.
- Resolve confirmed findings before final verification. No backend or contract expansion is authorized by this plan.

## T4. Verify and hand off

Owner: Mode A `verification_runner` for final commands; primary for rendered QA and final reconciliation. Depends on T3 fixes. Covers AC1–AC6.

From `frontend/`:

```sh
npm test -- src/features/client/ClientQuotationSubmittedView.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/SubmittedEstimateBuilder.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

Use a synthetic browser harness at 1440×900 and 390×844 to inspect ordinary and PMC/mixed summaries, embedded/workspace layouts, long labels, zero/unavailable amounts and accessible decision controls. Check displayed total agreement, navigation/refresh, keyboard focus, no page overflow and console/network errors. Do not use real customer data or trigger real approvals/email.

Run `git diff --check` and `git status --short`. Record exact commands, outcomes, unrun checks, warnings and temporary/build outputs here. Close synthetic servers/browser sessions and remove temporary QA files. No lint script exists. No backend/OCR/full repository suite is required for this bounded frontend change unless evidence reveals a relevant regression.

## Coordination and acceptance trace

Keep one parent task in progress. After the user selects Mode A, T1 and T2 may run in parallel with non-overlapping product/test ownership. Tell each writer they share the worktree and must preserve others' changes. The primary agent owns the settled contract, shared-file arbitration, documentation and integration. Integrity review and final verification follow completed writes. Mode B keeps implementation, review and verification in the primary thread.

| Acceptance criterion | Verification |
| --- | --- |
| AC1: screenshot reconciliation and final payable | T2 ordinary fixture; T4 rendered summary |
| AC2: saved rounding, zero and legacy values | T2 boundary fixtures and source-precedence assertions |
| AC3: PMC/mixed recipients and valid customer total | T2 PMC matrix; T3 integrity review |
| AC4: correct published-review identity despite hidden/filterable rows | T2 unequal reviews and partial-scope cases |
| AC5: workflow, layout and accessibility preserved | T2 interactions; T4 workspace regression and browser matrix |
| AC6: scoped, verified frontend change | T3 diff review; T4 tests/typecheck/build/hygiene |

No commits, pushes, deployment, migrations, seeds, customer communication or production writes are included.

## Execution record

- T0 complete: the initial tracked worktree was clean, with only this request's specification and plan untracked. Captured status, diff and relevant target-file copies in a temporary QA directory before assigning writers.
- T1 and T2 complete: four scoped product files and three test files changed. No additional helper or dependency was needed. Product/test writers stopped before review. The summary is above decisions; header and footer share the saved validated customer total. Optional PMC presentation props keep other consumers' formatting and labels unchanged.
- Focused writer checks passed: 56 tests across the new submitted-review test, existing visibility test and submitted-builder test. The existing project quotation workspace suite also passed (16 tests). Independent integrity review found no confirmed defects in financial lineage, invalid-data handling, PMC totals, shared defaults, decision/PDF behavior or CSS isolation.
- Final integrated command listed above passed: **72 tests across 4 files**. `npm run typecheck`, `npm run build` and `git diff --check` passed (exit 0). Vite transformed 3,383 modules and reported the existing class of large-chunk warning; the largest application JS chunk is 3,486.66 kB before gzip. Ignored build output is at `frontend/dist/`.
- Browser QA uses synthetic fixtures with the real application shell and the styles loaded by the quotation parent. At 1440×900 and 390×844, ordinary, PMC-only, mixed, zero and invalid summaries had matching header/footer totals, no page-wide overflow, no runtime errors and no unexpected API requests. Valid totals were ₹425.00, ₹147.50, ₹442.50 and ₹0.00 respectively; invalid evidence showed “Estimate unavailable” without an approval button. Phone PMC summaries stay in document flow so the expanded breakdown does not cover the item list or decision controls.
- Embedded post-design read-only checks at both widths retained the complete ₹442.50 summary without approval controls. Keyboard approval opening/cancellation preserved the existing confirmation amount and returned focus to the trigger. Refresh ran once; Back to estimate and return to review worked. Browser axe checks on the new summary, including colour contrast, reported no violations. No actual decision or PDF/customer write was made.
- T3/T4 complete. Final status includes only seven scoped frontend product/test files and these two documents. No backend, API, schema, PDF, dependency or lockfile changes. The shared PMC reader/default presentation and existing decision handlers remain unchanged.
- Closed the synthetic browser/Vite server and removed temporary baseline copies, fixtures, screenshots and cache under `/private/tmp/lisno-quotation-summary-afwrbur0`. No customer data or live backend was used for rendered checks.
- Full/unrelated frontend, backend and OCR suites were not run; the focused suite covers the affected presentation and workspace compatibility. No lint script exists. No migration, seed, commit, push, deployment, email or production mutation was performed. The bundle-size warning remains outside this request.

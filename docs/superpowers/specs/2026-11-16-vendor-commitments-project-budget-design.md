# Include approved vendor commitments in project budget usage

Date: 2026-11-16
Status: Implemented and verified in Mode A; one unrelated pre-existing API documentation test failure remains

## Goal

Deduct the selected vendor's approved work-order commitment from the available project budget immediately, even before an expense is recorded. Preserve the existing budget screen styling and distinguish committed costs from recorded expenses so the same vendor cost is never deducted twice.

## Current behavior and evidence

- `frontend/src/features/finance/budgetLiquidMetrics.ts` reads the Expenses vessel from `recordedCostPaise`. The backend derives that amount from posted direct spending plus overheads. Awarding a bid and issuing a work order do not create a finance ledger entry.
- Procurement already maintains approved commitments. `project-purchase-order.service.ts` counts orders with an approved revision and no cancellation, using `approvedNetPaise`; its separate commitment response is not included in the finance budget response.
- Read-only inspection of the previously reported local project found an issued basket award and one approved, uncancelled purchase order: vendor net amount 5,000 paise, GST 2,500 paise, total 7,500 paise. The bid and order amounts agree. There are no finance ledger entries, invoice assessments, or payment certifications in the app for this project. This establishes what is recorded in the app, not whether an external payment occurred.
- Its approved net budget is 9,000 paise, reserve 1,800 paise, and usable allocation 7,200 paise. The current recorded expense is correctly zero, but the budget screen omits the 5,000-paise approved commitment. Available budget after that commitment should be 2,200 paise.
- Evidence: `/tmp/lisno-vendor-budget-qa/diagnosis.json`. Command monitoring observed only reads and a read transaction commit, with no data mutation commands. The screenshot does not include a project URL; inspection uses the project reported earlier in this conversation.

## Recommended approach and alternative

Use a backend-derived budget-commitment read model, alongside the existing recorded-expense fields. This can reflect existing approved work orders immediately without creating a payment, receipt, historical expense, or migration. Existing ledger and approved-estimate amounts remain unchanged.

An alternative is automatically posting an expense at work-order approval. That changes expense recognition and requires new accounting entries, reversal rules, and historical reconciliation. It is outside this correction; the selected approach keeps approval commitments and recorded expenses explicit.

## Requested presentation

Keep the existing five-vessel layout, typography, colors, motion, and responsive behavior. For the reported project:

| Existing location | Proposed value and meaning |
| --- | --- |
| Total Budget | ₹90.00, approved revenue excluding GST |
| Budget After Margin | ₹72.00, original usable allocation before costs |
| Expenses | ₹50.00, recorded costs plus outstanding approved vendor commitments |
| Overheads | ₹0.00, posted overheads only, already included in total usage |
| Reserved Profit (20%) | ₹18.00, unchanged approved reserve |
| Remaining usable budget | ₹22.00, after recorded costs and outstanding commitments |

Update the short Expenses/summary explanation to state that approved vendor commitments are included. Use “Budget used” for any summary that combines recorded expenses and commitments; do not call the combined amount actual spending or paid. Show the recorded amount and outstanding vendor commitment as compact detail rows within the existing summary or cost breakdown, without new cards or a redesigned layout. Transactions continue to show only real ledger entries.

The Super Admin project-budget list, its aggregate summary, and project detail must reconcile on the same budget-usage basis. Where a screen intentionally shows recorded spending or current profit based on recorded costs, retain those values and make their basis clear. Do not relabel an existing actual amount as a commitment-aware amount without changing its data source.

## Financial rules and source of truth

All arithmetic uses safe integer paise. Use backend calculations; the frontend must not reconstruct commitments from bids or manufacture an expense.

For each project and each eligible purchase order `o`:

- `C[o]` is its approved net commitment from the current approved immutable order revision. Verify the header and revision belong to the same project/order and reconcile net, GST, and gross amounts. Count the order once by stable ID.
- `L[o]` is the sum of posted procurement expense entries explicitly linked to that same project and purchase-order ID.
- `O[o] = max(C[o] - L[o], 0)` is the commitment not yet covered by recorded cost.
- `outstandingVendorCommitmentPaise = sum(O[o])`.
- `budgetUsedPaise = recordedCostPaise + outstandingVendorCommitmentPaise`.
- `availableBudgetPaise = costBudgetPaise - budgetUsedPaise`. Preserve negative amounts when over budget.

This retains every recorded expense exactly as entered. It does not infer the tax split or payment status of a ledger amount: the ledger has no separate GST allocation. Approved commitments follow Procurement's existing net-of-GST convention. A recorded linked cost larger than the approved net commitment remains fully counted as a recorded cost; its outstanding commitment is zero. For example, an order committed at ₹50 with ₹20 recorded has ₹30 outstanding and ₹50 total budget usage; ₹75 recorded against that order means ₹75 usage and zero outstanding. No GST, TDS, recoverability, or payment accounting policy is changed.

Other rules:

1. Exclude unselected bids, superseded bid revisions, proposals still awaiting approval, rejected awards, and unapproved/cancelled orders. An approved order being amended retains its prior approved commitment until a replacement revision is approved. A draft amendment does not remove an existing obligation.
2. Count issued basket awards through their resulting approved purchase order, not once as an award and again as an order. Apply the same rule to other approved vendor purchase orders.
3. Match expenses by stable project/order IDs, never vendor names, item labels, or equal amounts. Offsets apply per order; excess expense on one order cannot consume another order's outstanding commitment.
4. Voided entries do not offset commitments and do not count as recorded costs. Include recorded employee/other expenses and overheads once via the existing recorded-cost total.
5. Existing approved orders remain obligations even when the current estimate has moved to a later approved revision. Preserve their own immutable source lineage; do not substitute current Configuration prices or discard historical commitments because their estimate version differs.
6. When posted procurement expenses coexist with commitments but lack sufficient order linkage, do not guess whether they duplicate an order. Return an explicit reconciliation-needed budget state. Keep recorded finances readable, show the known commitment separately, and withhold combined usage/available-budget numbers until the source can be reconciled. Do not silently treat unavailable values as zero or automatically rewrite legacy entries.
7. Treat broken approved-order revision linkage or inconsistent amounts explicitly as an integrity problem. Never silently omit that order from the budget. Keep existing approval, finance-source, and ledger integrity protections, including the just-completed round-off correction.

## Data/API and consistency impacts

Extend the existing finance detail/list responses and portfolio summary with a dedicated commitment-budget projection. Expected information: availability/reconciliation status, total approved vendor net commitments, outstanding commitments, combined budget usage, available balance, and backend-derived usage/risk metadata. Use nullable combined amounts when reconciliation is unresolved; never use zero to represent unavailable data. Exact TypeScript field grouping will be fixed in the task plan before writers start.

Existing `recordedCostPaise`, `directSpendPaise`, `procurementCostPaise`, `overheadPaise`, `remainingBudgetPaise`, and recorded-cost profit fields retain their established meanings. Do not overwrite them with combined costs. Align frontend types and OpenAPI with the additive response. No new route or permission is needed.

Read approved orders, revisions, posted linked entries, and finance counters within the existing consistent snapshot. Batch project IDs for list/portfolio reads; avoid per-row API calls and N+1 queries. Build each portfolio total from the same per-project calculation as detail, using the same filters. A portfolio containing an unresolved project must report the incomplete combined total explicitly, not present a partial sum as complete. Commitment-aware budget status/filtering must use backend metadata consistently; preserve recorded-cost risk fields for consumers that use that basis.

Refresh finance detail/list/summary queries after relevant approved-order issuance or approval/amendment and expense posting/voiding. Reuse existing invalidation mechanisms. Rejected/pending work must not change budget usage.

## Permissions, persistence, and scope boundaries

Retain existing Finance Head and Super Admin route authorization and project scoping. Queries must use only the projects already authorized by the finance service. Do not expose new vendor identity, quotation documents, or private bid content in the finance aggregate.

Expected changes are limited to the finance domain/read service and response documentation, finance frontend types/budget presentation/list, necessary mutation invalidations, and focused tests. Existing bidding, approval, issuance, payment-certification, and expense-posting writes remain intact. Preserve all unrelated dirty work; initial status/target diffs are saved under `/tmp/lisno-vendor-budget-qa/` and must be refreshed before writers.

No ledger entry creation on reads, schema migration, data repair, seed, backfill, payment initiation, changes to GST/TDS calculations, new dependencies, redesign, commit, push, deployment, or customer communication is included. The prior round-off fix is complete and must remain intact.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | An approved vendor order reduces available budget before any recorded expense; unselected/pending bids do not. | Reproduce a ₹90 net project with ₹18 reserve, ₹50 approved commitment, zero recorded cost: Expenses/budget used ₹50 and available ₹22. Include a different pending vendor quote. |
| AC2 | Each vendor cost is counted once throughout partial/full/over-commitment recording and voids. | Per-order examples with zero/partial/full/excess linked costs, multiple orders with unequal amounts, mixed GST, other expenses and overheads; no global offset across orders. |
| AC3 | Approval history and project isolation remain correct. | Approved-versus-pending amendment, previous approved estimate source, duplicate award/order lineage, invalid revision, two asymmetric projects and actor scopes. |
| AC4 | Incomplete linkage is visible without fabricated balances. | Unlinked legacy procurement costs, missing/malformed order sources, unresolved portfolio aggregate, and missing additive response data. Existing recorded-cost views stay readable. |
| AC5 | Detail, list, portfolio, usage/risk metadata, and refresh behavior agree. | Backend domain and Mongo replica-set tests, including concurrent expense/approval reads; list/detail/portfolio reconciliation for at least two unequal projects; relevant mutation invalidation tests. |
| AC6 | Styling and accessible interactions are preserved. | Rendered finance regressions and desktop/mobile browser checks for valid commitment, overrun, unresolved data, and ordinary recorded-cost views; keyboard and accessible names. |
| AC7 | Integrated changes compile and preserve unrelated work. | Focused backend/frontend checks, typechecks/builds, OpenAPI/route contract checks as applicable, integrity review, `git diff --check`, and baseline preservation comparison. |

## Risks, assumptions, rollback, and open decisions

The main risks are double counting linked costs, treating a bid as a confirmed obligation, dropping prior approved commitments during amendment, mixing projects, and displaying an incomplete aggregate as final. The separate read model, stable-ID joins, preserved recorded fields, snapshot reads, and explicit unresolved state address these risks.

The proposed commitment basis is the approved vendor amount excluding GST, matching existing Procurement commitments and the screenshot's net-budget presentation. The ₹72 vessel remains the original after-margin allocation; the remaining balance becomes ₹22. Approval of this specification accepts these meanings. No further product choice is needed under those assumptions.

Rollback removes the additive read projection and its UI consumption while retaining the unchanged ledger, approved orders, and prior round-off fix. No data rollback is required. The specification and task plan were approved and the user selected Mode A. Execution is recorded in [the task plan](../plans/2026-11-16-vendor-commitments-project-budget.md).

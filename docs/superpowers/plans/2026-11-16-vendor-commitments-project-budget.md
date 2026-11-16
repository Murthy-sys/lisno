# Vendor commitments in project budgets: task plan

Date: 2026-11-16
Status: Implemented and verified in Mode A; one unrelated pre-existing API documentation test failure remains

Source of truth: [Approved specification](../specs/2026-11-16-vendor-commitments-project-budget-design.md). The user approved the specification and task plan, then selected Mode A on 2026-11-16.

## Outcome and boundaries

For the reported project, preserve the ₹90 approved net budget, ₹18 reserve, and ₹72 original usable allocation. Include its ₹50 approved vendor commitment in budget usage and show ₹22 available. Recorded expenses remain ₹0 until a real expense is posted. Preserve the current five-vessel layout and styling, the earlier round-off correction, and the project-completion control changes already in the worktree.

Implement a read-only derived projection. Do not create ledger entries, repair data, change tax/payment policy, edit approved orders, migrate, seed, add dependencies, commit, push, deploy, or send external communications. No approval or expense-posting write semantics change.

## Fixed response contract

Add `commitmentBudget` to the backend finance bucket DTO and portfolio summary. Preserve all existing recorded-cost fields and their meanings. Frontend declarations may make this addition optional for old responses; missing data must display as unavailable, never as a zero commitment or a calculated replacement.

The common projection has these fields:

| Field | Type / meaning |
| --- | --- |
| `status` | `"ready"` or `"needs_reconciliation"` |
| `reasonCodes` | Array of `"unlinked_procurement_expense"`, `"invalid_order_source"`, or `"invalid_expense_linkage"`; empty when ready |
| `approvedVendorNetPaise` | Safe nonnegative integer, or null if any approved source is invalid; do not present a partial sum as the complete commitment |
| `outstandingVendorCommitmentPaise` | Safe nonnegative integer when ready; otherwise null |
| `budgetUsedPaise` | Recorded costs plus outstanding commitments when ready; otherwise null |
| `availableBudgetPaise` | Signed usable budget minus budget used when ready; otherwise null |

On each project, additionally include `utilizationBps: number | null`, `budgetStatus: "over_budget" | "at_risk" | "within_budget" | "no_budget" | null`, and `overBudget: boolean | null`. Unknown combined values produce null risk/usage fields. For ready data use the existing backend budget-risk policy with combined usage, including its completed-project behavior; `overBudget` still reflects a negative available balance.

The portfolio projection adds `unresolvedProjectCount: number` and `overBudgetProjectCount: number | null`. Sum the common money fields across the same matching project set used by the list. If any project is unresolved, combined outstanding/usage/available fields and over-budget count are null, with the unresolved count and deduplicated reason codes provided. The total approved vendor net amount is available only if every project's corresponding amount is known. An empty matching portfolio is ready with zero money/counts.

Add optional `budgetBasis: "recorded" | "including_commitments"` to the existing list query. Omission retains current behavior. The Super Admin project-budget API helper sends `including_commitments`; its existing `budgetStatus` filter then compares `commitmentBudget.budgetStatus`. Unresolved rows remain visible without a status filter and cannot satisfy a known-status filter. Ordinary recorded-finance callers retain their current query basis and fields. This avoids changing the meaning of legacy status filters while keeping the updated list and summary consistent. Validate/document this query parameter in the existing route and OpenAPI; no route-operation permission changes are needed.

## Calculation and source rules

The backend computes the approved specification's per-order formula using safe integer paise:

```text
outstanding[o] = max(approvedNet[o] - postedLinkedProcurement[o], 0)
outstandingVendorCommitment = sum(outstanding[o])
budgetUsed = recordedCost + outstandingVendorCommitment
availableBudget = originalCostBudget - budgetUsed
```

Count each uncancelled order with an approved revision once, including an order whose next amendment is still pending. Compare header totals to its approved immutable revision and verify stable project/order/revision lineage. Follow the approved revision rather than mutable draft lines. Preserve valid historical order obligations when the current approved estimate version changes. Bid/award proposal totals are not a second cost source.

Read posted procurement entries by project and purchase-order ID, excluding voids. Never offset globally across orders or projects. Keep recorded costs as entered, including amounts exceeding the net commitment; do not infer their GST split. A valid linked expense exceeding its own commitment reduces its outstanding amount to zero and leaves the full recorded amount counted.

When commitments coexist with unlinked procurement entries, return `needs_reconciliation`. Invalid approved-order sources and broken explicit expense/order linkage also produce an explicit unresolved projection. No matching by names/labels/amounts, silent omission, or data repair is allowed. With no commitments, unlinked historical expenses remain fully represented by the unchanged recorded-cost totals. Validate ledger/source totals without changing the existing legacy classification rules.

Read the projection within the same Mongo snapshot as existing finance counters and approved baseline. Batch queries for the already authorized project set and approved revision IDs. Do not execute parallel operations on the same transaction session. Avoid N+1 reads and do not invoke read wrappers that introduce unrelated writes against local data.

## Ownership and parallel boundaries

Before assigning writers, refresh the dirty-path inventory, per-target copies/diffs, and preservation hashes under `/tmp/lisno-vendor-budget-qa/`. Existing unrelated changes include `procurement.service.ts`, purchase-order tests, frontend API types, finance panel/tests, and admin/vendor/manager screens. Understand each assigned dirty target first and preserve its exact prior delta.

| Owner | Exclusive write scope |
| --- | --- |
| Backend implementation | New focused finance-commitment domain helper and its unit tests; `backend/src/services/project-finance.service.ts`; `backend/src/routes/project-finance.ts`; finance-route regression tests; new focused replica-set commitment tests. Existing finance-domain tests may be extended only if necessary. No procurement/order/ledger write-service edits. |
| Frontend implementation | `frontend/src/api/types.ts`; finance `projectFinanceApi.ts`, `ProjectFinancePanel.tsx`, `ProjectBudgetOverview.tsx`, `budgetLiquidMetrics.ts`, `BudgetLiquidStage.tsx`, `SuperAdminProjectBudgets.tsx`, `projectBudgetList.ts`, and their focused tests. Small fixture additions under the existing enterprise finance QA fixture may be made by this owner after coordination. No procurement component edits. |
| Cache regression implementation | Relevant procurement mutation success handlers and their tests: `ProcurementBasketComparison.tsx`, `ProcurementBasketApprovalQueue.tsx`, `SuperAdminPurchaseOrdersPage.tsx`, `PurchaseOrdersPanel.tsx`, and `ProjectPurchaseOrderRequestPanel.tsx` only where the action can change approved commitments. Read finance query keys; do not edit finance modules. |
| Primary | Approved contract interpretation, `backend/src/openapi.ts`, any narrowly required OpenAPI regression assertions, plan/spec records, integration, local read-only diagnosis, and browser QA. Coordinates fixture/ownership transfers explicitly. |
| Integrity reviewer / verification runner | Read-only product-source review and final checks after writers finish; temporary logs only. |

In Mode A, backend, frontend, and cache slices can proceed concurrently after the baseline and contract are confirmed. They may not cross ownership boundaries or invent incompatible fields/fallbacks. Primary owns reconciliation. In Mode B, primary performs the same implementation, review, and verification inline without implementation agents. No agents or product edits start until the user chooses the execution mode.

## Dependency-ordered work

Keep one parent task in progress: vendor commitments in project budgets.

1. **Baseline and failing examples.** Refresh preservation evidence. Capture the prior ₹90/₹72/zero-expense case and add failing pure/backend/frontend regressions for a ₹50 approved commitment before changing the relevant implementation. Verify actual order-revision field names and the existing risk helper against the fixed contract. Capture any relevant pre-existing check failures separately. AC1, AC7.

2. **Backend commitment projection.** Add the pure per-order calculator and source validation, then batch-load order/revision/linked-entry inputs within `loadFinanceEnrichments` or an adjacent bounded read helper. Add the projection consistently to detail, list, transaction DTO responses, and portfolio totals, including synthetic buckets without persisted finance state. Extend query validation/filtering for `budgetBasis`. Preserve authorization, approved snapshot selection, recorded counters, and round-off validation. AC1–AC5.

3. **Budget presentation and export.** Read the new projection for the Expenses vessel, “Budget used” summary, remaining usable budget, list rows, portfolio summary, status/utilization, and current-page CSV export. Show recorded expenses and outstanding commitments as compact rows in the existing summary or cost breakdown. Keep standard recorded-finance and transaction views intact and clearly labelled. Extend the budget integrity checks to validate the new projection's internal arithmetic when present without replacing the existing recorded/source checks. AC1, AC4–AC6.

   Missing/unresolved commitment data must show an explicit unavailable/reconciliation message and no combined amount or percentage. Preserve the five vessel positions; an unavailable expense vessel may retain an empty decorative outline, but its caption must say “Unavailable,” never ₹0 or 0%. Other known values remain visible. Keep canvas calculations finite and decorative; avoid changes to geometry, lighting, animation, colors, or CSS unless required for an accessible existing-state layout. Do not block legitimate recorded-cost information solely because the added commitment projection is unavailable.

4. **Query refresh.** Add finance query invalidation to success paths that issue/approve approved vendor obligations or replace their approved revision. Use existing `projectFinanceKeys` so cached project detail, list, and aggregate data refresh together. Confirm existing finance expense posting already refreshes these keys; preserve it. Check any existing void UI path if present, but do not build a new void workflow. Pending/rejected bid updates do not create budget amounts. Test relevant success/retry behavior without changing mutation payloads or authorization. AC2, AC5.

5. **Integrate and review.** Once all writers stop, primary inspects each delta against the execution baseline, aligns OpenAPI and frontend/backend contracts, and runs integrity review. Review per-order deduplication, tax/amount meaning, amendments, authorization scope, snapshot consistency, unresolved aggregates, cache invalidation, and prior-work preservation. Resolve findings before final verification. AC2–AC7.

6. **Final verification and handoff.** Run the scoped suites below on the integrated result, then inspect desktop/mobile valid, overrun, unresolved, and recorded-only states. Use isolated synthetic browser data. Read the reported local project using an inspected read-only path to confirm ₹50 usage/₹22 available and unchanged stored finance/order values. If the local backend needs a restart to serve the approved code, reuse the existing non-seeding launcher only; never launch a seed/provision path. Record commands, counts, evidence, unrun lanes, and remaining issues before declaring completion. AC1–AC7.

## Verification matrix

- **Calculation:** no orders; one approved order; pending/unselected quotes; positive/zero/excess linked spending; voided costs; multiple unequal orders; mixed tax rates; other expenses and overheads exactly once; overflow/invalid paise.
- **History and integrity:** pending versus approved amendment, prior approved estimate lineage, cancelled/unapproved orders excluded, duplicate award/order representation, missing/mismatched immutable revision, foreign-project order/expense linkage, unlinked procurement history, and unchanged round-off cases.
- **Mongo and access:** at least two unequal projects; Finance Head task scope versus Super Admin scope; list/detail/matching portfolio reconciliation; `budgetBasis` filtering; empty and unresolved summaries; reads during concurrent expense posting or approved-revision replacement using existing isolated replica-set patterns. No transient mixed snapshot may double count or lose a commitment.
- **Frontend:** the exact ₹90/₹72/₹50/₹18/₹22 example, normal recorded-only panel, recorded and committed detail rows, invalid/missing projection, overrun, original source/ledger guard, list/CSV/summary agreement, status filters, and mutation refresh. Keyboard interaction and accessible names remain usable.
- **Visual:** preserve desktop five-vessel layout and mobile flow; check 1440px and 390px, no horizontal overflow, no fake zero for unavailable data, no new console/runtime errors, and accessibility checks. Existing Three.js warning or unrelated baseline failures must be recorded separately rather than fixed opportunistically.

## Planned checks

Backend, from `backend/` (new focused test names established by this plan):

```sh
npm test -- tests/project-finance-commitments.test.ts tests/project-finance.test.ts tests/project-finance-rounding.test.ts tests/project-finance-routes.test.ts
npm test -- tests/project-finance-commitments.replica-set.test.ts tests/project-finance-mongo.replica-set.test.ts
npm test -- tests/api-docs.test.ts tests/route-operation-registry.test.ts
npm run typecheck
npm run build
```

Frontend, from `frontend/`:

```sh
npm test -- src/features/finance/ProjectBudgetOverview.test.tsx src/features/finance/BudgetLiquidStage.test.tsx src/features/finance/SuperAdminProjectBudgets.test.tsx src/features/finance/FinancePages.test.tsx src/features/finance/projectBudgetNavigation.test.ts
npm test -- src/features/admin/AdminProjectDetailPage.test.tsx src/features/procurement/ProcurementBasketComparison.test.tsx src/features/procurement/ProcurementBasketApprovalQueue.test.tsx src/features/procurement/SuperAdminPurchaseOrdersPage.test.tsx src/features/procurement/PurchaseOrdersPanel.test.tsx
npm run typecheck
npm run build
```

Include any focused new invalidation test for `ProjectPurchaseOrderRequestPanel` if that success path changes. Do not modify unrelated tests simply to make broader suites pass. Known historical failures are not assumed current: verify baseline evidence before classifying a failure as pre-existing. Expand checking only for a demonstrated affected consumer or unresolved risk. Typecheck/build commands sharing generated TypeScript outputs must run sequentially per workspace.

Repository: `git diff --check`, `git status --short`, and final hash/diff comparison against the execution baseline. There is no lint script. Full unrelated repository/OCR suites and production actions are outside the planned lane. Keep build output ignored and browser/test diagnostics under the temporary artifact directory.

## Execution record

- Complete: implemented and verified the commitment-budget read model. Baseline captured for 4,452 repository files in `/tmp/lisno-vendor-budget-qa/execution-hashes.json`; status, full diff, and backend/frontend source/test copies were saved before writers began.
- Backend owner: `/root/vendor_budget_backend`; finance frontend owner: `/root/vendor_budget_frontend`; procurement invalidation owner: `/root/vendor_budget_cache`. Primary owns OpenAPI, integration, and local/browser verification.
- The frontend owner may add a focused `projectCommitmentBudget.ts` validator/presentation helper and tests, and owns any required `enterpriseFinanceData.ts`/`enterpriseRoutes.ts` synthetic fixture updates. These reuse the fixed response contract and do not calculate vendor commitments in the browser.

## Completion and rollback

Completion requires AC1–AC7 traced to passing evidence, all writers finished, integrity findings resolved, final integrated checks recorded, and unrelated work preserved. Report partial/unavailable checks honestly. No live data repair is authorized if historical reconciliation issues are discovered.

Rollback removes only this task's additive projection/query parameter and UI consumption, retaining the previous recorded-finance behavior and earlier fixes. No stored-data rollback is needed. A proposed change to financial policy, persisted ledger semantics, permissions, or migration scope must return to specification review.


## Final verification record (2026-11-16)

The reported local project now derives 5,000 paise of approved vendor commitments and budget usage, with 2,200 paise available. Approved net budget 9,000, reserve 1,800, original usable allocation 7,200 and recorded expense 0 remain unchanged. Detail, filtered list and matching portfolio agree. This is a derived read model, not a new ledger expense or payment.

### Acceptance evidence

| Criteria | Evidence |
| --- | --- |
| AC1 | Red rendered/Mongo regressions captured first; reported ₹90/₹50/₹22 example passes tests and actual local read. |
| AC2–AC3 | Pure and isolated replica-set regressions cover per-order partial/full/excess costs, voids, unequal projects, scope, immutable revisions, amendments, cancellations and invalid lineage. |
| AC4 | Backend unresolved totals and frontend missing/malformed/unresolved states tested; browser confirms “Unavailable” rather than zero while recorded information remains readable. |
| AC5 | List/detail/portfolio/status/filter/CSV and cache tests pass; concurrent expense/approval snapshots tested. Existing dashboard report explicitly retains its recorded-only response shape. |
| AC6 | Existing five-vessel styling preserved; synthetic browser passes 1440px/390px overflow checks, keyboard navigation, overrun/unresolved states, commitment filter and zero axe violations. Screenshots inspected. |
| AC7 | Both typechecks/builds pass, task-focused tests pass, integrity review has no unresolved findings, and `git diff --check` passes. API-docs baseline exception is recorded below. |

### Executed checks

From `backend/`:

- `npm test -- tests/project-finance-commitments.test.ts tests/project-finance.test.ts tests/project-finance-rounding.test.ts tests/project-finance-routes.test.ts tests/project-finance-commitments.replica-set.test.ts tests/project-finance-mongo.replica-set.test.ts`: **129 passed** across six files (`backend-focused-green.log`).
- `npm test -- tests/api-docs.test.ts tests/route-operation-registry.test.ts`: **121 passed, one pre-existing failure** (`final-api-docs.log`). The same scoped Mode-tier enum assertion at `api-docs.test.ts:165` failed before this task; it expects Signature/Premium/Functional while the existing contract also includes `default`. The new commitment contract test passes. Baseline evidence: `baseline-api-docs-permitted.log` (120 passed, same one failure).
- `npm run typecheck` and `npm run build`: **passed** (`final-backend-typecheck.log`, `final-backend-build.log`).

From `frontend/`:

- `npm test -- src/features/finance/projectCommitmentBudget.test.ts src/features/finance/projectFinanceApi.test.ts src/features/finance/ProjectBudgetOverview.test.tsx src/features/finance/BudgetLiquidStage.test.tsx src/features/finance/SuperAdminProjectBudgets.test.tsx src/features/finance/FinancePages.test.tsx src/features/finance/projectBudgetNavigation.test.ts`: **134 passed** across seven files (`frontend-focused-final.log`).
- `npm test -- src/features/procurement/ProcurementBasketApprovalQueue.test.tsx src/features/procurement/ProcurementBasketComparison.test.tsx src/features/procurement/SuperAdminPurchaseOrdersPage.test.tsx src/features/procurement/PurchaseOrdersPanel.test.tsx`: **75 passed** (`cache-focused.log`).
- `npm test -- src/features/admin/AdminProjectDetailPage.test.tsx`: **26 passed** (`final-admin-integration.log`).
- Integrity review found one minor utilization-message edge case when a positive budget has an unrepresentably large ratio; corrected the copy without changing amounts. `npm test -- src/features/finance/ProjectBudgetOverview.test.tsx` after correction: **45 passed**, a subset of the 134 above (`final-budget-overview.log`).
- `npm run typecheck` and `npm run build`: **passed**. Build repeated after the review correction (`final-frontend-build-after-review.log`); existing Vite chunk-size warning remains.

Repository: `git diff --check` passed; `git status --short` captured. All writers stopped before integrated review and verification. The primary reviewed task-owned deltas against the execution copies. Concurrent configuration/estimator changes outside this task were observed and left untouched; no global reset, staging or formatting occurred.

### Runtime, browser and limits

- Artifacts: `/tmp/lisno-vendor-budget-qa/`, including `browser-summary.json`, inspected desktop/mobile/unresolved screenshots, `live-read-check.json`, `final-owned-diff.patch` and final check logs. Browser used synthetic intercepted data and made no write requests; no runtime errors, zero axe violations. Existing Three.js Clock deprecation warning remains.
- Read-only local verification compared hashes of seven project/estimate/finance/order source collections before and after the reads; all unchanged. Only `find`, `aggregate` and read-transaction commit commands occurred. No ledger entry, payment, baseline or order was created or modified by verification.
- Restarted the verified existing non-seeding local `npm run dev` launcher, then confirmed local `/openapi.json` serves `commitmentBudget` and `budgetBasis` (`local-runtime-check.json`). The existing user's authenticated browser session was not automated; route regressions, service verification and synthetic rendered checks cover their respective boundaries.
- Builds created ignored `backend/dist` and `frontend/dist`. No dependencies, lockfiles, schema migration, seed/backfill, production mutation, deployment, commit, push or customer communication. Full unrelated repository/OCR suites were not run. No lint script exists.

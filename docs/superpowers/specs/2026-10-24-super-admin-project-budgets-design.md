# Super Admin Finance: project budgets and budget detail

Date: 2026-10-24
Status: Approved and implemented in Mode A; verification evidence and limitations are recorded in the task plan.
Classification: Substantial UI redesign with bounded read-only API additions; financial-source and permission invariants apply.

## Goal

Make the existing Super Admin **Finance** sidebar destination show a Project Budgets screen following reference image 1. Opening a project shows the visual budget overview and summary from reference image 2: total budget, reserved 20% margin, usable budget, recorded spending, overheads, and remaining usable budget.

Use real Lisno values and the existing approved financial baseline. Keep this focused on the list-to-detail flow; reuse existing ledger, payment, document, and workflow controls.

## Current behavior and evidence

- `frontend/src/app/routeRegistry.ts` already exposes **Finance** at `/finance` to authorized Super Admin and Finance Head users. `/finance/projects/:projectId` is the existing detail route. No duplicate sidebar entry or new permission is needed.
- `FinanceOverviewPage.tsx` shows Portfolio finance, payment confirmations, a portfolio ring, and project cards. It automatically fetches all 100-row pages. It has no project-budget table or search/filter toolbar.
- `FinanceProjectPage.tsx` embeds `ProjectFinancePanel.tsx`, which owns approved-source checks, the budget/ledger queries, entry creation, supporting documents, completion controls, and query invalidation. Other project screens also consume this panel; their behavior must remain intact.
- `backend/src/domain/project-finance.ts` already defines the fixed 2,000-basis-point reserve on the approved subtotal excluding GST, integer-paise rounding, usable cost budget, total recorded cost, signed remaining budget, and over-budget flag.
- `project-finance.service.ts` reads immutable approved Estimate/baseline sources and classified ledger amounts within a finance snapshot. Its portfolio summary already aggregates all eligible projects independently of pagination.
- `GET /finance/projects` currently accepts only `limit` and `offset`. Project client name/ID exist on `ProjectModel` but are absent from the finance DTO. Current project lifecycle and finance bucket stage are available. Budget creation dates alone must not be assumed to equal immutable approval dates.
- `financeRiskFactors` in `backend/src/domain/super-admin-dashboard.ts` already marks costs above usable budget as red, and unfinished projects at 90% or more consumption as yellow. Reuse this backend policy rather than introduce a frontend risk threshold.
- At specification discovery the only dirty path was the existing `.playwright-cli/console-2026-10-24T04-32-31-311Z.log`; preserve it and recapture the baseline before implementation.

## Financial meaning and reference corrections

The references establish visual direction, but several displayed totals, percentages, and statuses are inconsistent. The implementation must reconcile using these existing authoritative amounts:

| Display label | Existing source / meaning |
| --- | --- |
| Total project budget | `approvedSubtotalPaise`, explicitly **excluding GST** |
| Reserved margin (20%) | `targetProfitPaise`, the existing backend-rounded reserve |
| Usable budget | `costBudgetPaise = approvedSubtotalPaise - targetProfitPaise` |
| Total spending | `recordedCostPaise = directSpendPaise + overheadPaise`; label as including overheads |
| Overheads | `overheadPaise`; a breakdown of total spending, never deducted a second time |
| Remaining usable budget | `remainingBudgetPaise = costBudgetPaise - recordedCostPaise`; preserve negatives |
| Usable budget utilized | Total spending divided by usable budget, with the denominator labelled |
| Approved contract value / GST | Show separately in project details using the existing fields; never treat GST as spendable budget |

Example: ₹25 lakh approved budget excluding GST gives ₹5 lakh reserve and ₹20 lakh usable budget. If total spending is ₹18 lakh including ₹2 lakh overheads, ₹2 lakh remains and **90% of usable budget** is utilized. The spending share of total project budget is 72%, which must not be labelled usable-budget utilization.

Portfolio values are sums of project amounts, including each project's already rounded reserve. Do not calculate a fresh rounded 20% on an aggregated subtotal. ₹12.4 crore of eligible budget would yield about ₹9.92 crore usable before spending, not the reference's ₹7.92 crore. Ratios with zero denominators are undefined, not fabricated 0% or 100%.

## Screen 1: Project Budgets

- Reuse `/finance`; show the new composition for Super Admin. Preserve the Finance Head experience and existing permissions.
- Header: Finance breadcrumb, **Project Budgets**, concise reserve explanation, project selector, and an explicitly labelled **Budget approved between** date range. Default to all eligible approved budgets and all dates.
- Five primary totals: Total Project Budget, Total Spending, Total Overheads, Reserved Margin (20%), Total Usable Budget. Use compact Indian notation where helpful, with exact rupee values accessible and exportable. No invented previous-period changes or decorative sparklines.
- Toolbar: project-name search, Client, Budget status, Finance stage, and a compact additional-filter disclosure for project lifecycle. Avoid duplicate controls with identical meanings.
- Finance stage uses actual values: Awaiting design approval, Finance active, Finance closed. Do not fabricate a single Estimation/Design/Procurement/Execution stage from overlapping workflows.
- Budget status reuses backend finance risk: Over budget, At risk, Within budget. Explain At risk as at least 90% of usable budget consumed on an unfinished project. Keep schedule risk separate. An empty zero-budget project uses a neutral No usable budget state; any positive recorded spending against zero budget is over budget.
- Table: row number, Project, Client, Total Budget, Spending, Overheads, Margin (20%), Usable Budget, Remaining, Budget Status, and a clearly named View details action. Spending is labelled as including overheads. Show actual usable-budget utilization by the project name; no invented completion percentage or stock project photography.
- Search/filters, summary totals, count, and pagination must describe the same authorized matching population. Use server filtering before summary aggregation and pagination; do not derive portfolio totals or client choices from a loaded page.
- Default page size 10 with Previous/Next and an honest result range. Reset pagination after filter changes and preserve list state in the URL when opening a project and returning.
- Export a clearly labelled **current-page CSV**, with exact values, filter/date scope, matching-project count, and portfolio summary distinguished from current-page rows. Escape spreadsheet-formula text. Do not silently claim a full-portfolio row export.
- Keep authorized initial-payment confirmations accessible in a compact secondary section without displacing the main budget list.

The approval-date filter selects a cohort of budgets; all financial amounts remain their current lifetime totals. State this beside the date control. It is not a historical balance or a transaction-date report.

## Screen 2: project budget detail

- Reuse `/finance/projects/:projectId`, show project identity and Back to Project Budgets, and preserve selected list filters/history.
- Primary composition: a large Budget Overview visual on the left, Budget Summary and short factual insights on the right. Reflow to one column on mobile.
- Build a lightweight SVG cylinder inspired by image 2, using restrained green/ochre accents and existing design tokens. No WebGL, image generation, chart framework, glass effects, shadows, or decorative animation is necessary.
- Encode mutually exclusive quantities: reserved margin, direct spending, overheads, and remaining usable budget. Total spending includes direct spending plus overheads, so it is never an additional stacked segment. Labels and an exact-value summary accompany the graphic.
- For overspending, show the signed overrun and utilization above 100% explicitly. Do not draw a negative-height segment or misrepresent costs as fitting inside the approved budget. Use a bounded cylinder and separate overrun indicator with exact text. For zero or invalid denominators, show amounts without a misleading percentage.
- Budget Summary rows: total budget excluding GST, reserved margin, usable budget, total spending including overheads, overheads as a subset, and signed remaining usable budget. Label percentage denominators clearly; preserve approved contract/GST/baseline context in a secondary disclosure.
- Insights are deterministic statements from actual values: budget status, utilization, remaining/overrun, overhead share, and reserved amount. Do not predict future procurement or profit from absent forecasts.
- Use only supported detail sections: Overview, Transactions, Cost Breakdown, and Overheads. Transactions retain existing ledger pagination and document controls; Overheads filters authoritative ledger entries rather than inferring categories from text. Cost Breakdown uses the backend's procurement/employee/other/overhead amounts. Keep any incomplete ledger view explicitly partial and never use it for budget totals.
- Existing authorized procurement navigation, entry forms, project completion, chat, and Super Admin workflow controls remain reachable. Do not introduce Forecast or Notes tabs with placeholders or new storage/workflows merely to reproduce screenshot labels.
- Restrict the new presentation to the Super Admin Finance route through a small additive presentation option or route-owned wrapper. Preserve integrity checking and all other `ProjectFinancePanel` consumers.

## API, data, and permission impact

Recommended approach: retain the existing finance domain and routes, adding only the read fields and validated list filters required by this screen. A frontend-only filter over the current auto-loaded list would be smaller initially, but gives slow loading and unreliable partial-list summaries; server-side filtering is the chosen approach.

- Extend the list request with bounded search, stable project/client ID, budget status, finance stage, lifecycle status, and inclusive UTC approval-date bounds. Preserve existing `limit`/`offset` clients and reject invalid combinations/dates.
- Add client identity/presentation, canonical baseline approval date, and backend-derived budget status/consumption to finance read results as needed. Use stable IDs, never client/project names as joins. Unlinked clients are labelled as such; same-name clients remain distinct.
- Return scoped project/client filter choices from the authorized eligible population, not from one page. No extra user/contact records or private contact fields are exposed.
- Keep totals and matching count consistent with filters inside the existing snapshot-read path. Preserve canonical approved-source selection, pre/final baseline handling, no-write reads, lineage errors, and the current Finance Head access boundary.
- Synchronize frontend types, query keys, strict query validation, and OpenAPI parameters. Existing route-operation identities and authorization remain authoritative; no permission expansion or new public endpoint.
- Existing cost/payment mutations and invalidation must refresh every filtered list variant, bucket, ledger, and affected dashboard summary as before. No new financial formula, persisted balance, database migration, seed, backfill, or approval-history edit.

## Visual and interaction constraints

Use the references' hierarchy and density with Lisno typography, warm off-white/sage surfaces, crisp borders, deep green figures, restrained ochre reserve accents, and red for actual budget exceptions. Follow existing restrictions on shadows, rounded cards, gradients, icons, and motion. Do not add new dependencies unless an implementation-specific need is demonstrated.

Provide native controls, semantic tables, accessible names, visible keyboard focus, exact-value alternatives, reduced-motion compatibility, loading, empty/no-match, retry, stale-refresh, and permission states. At 360px use readable stacked project summaries or a deliberately labelled local table scroller without horizontal page overflow. Do not display the prior dashboard's source-diagnostic wall; retain actionable errors for unsafe finance/lineage failures.

## Scope and non-goals

In scope: Super Admin Finance list/detail presentation, necessary read-only finance API additions, filtering/pagination/export, and proportional regression/browser verification.

Out of scope: changing the 20% policy, counting GST as budget, altering ledger posting or approvals, historical balance snapshots, forecasts, notes storage, project-image infrastructure, new payment workflows, Finance Head redesign, deployment, commits, production changes, or broad shared-component rewrites.

## Acceptance criteria

1. **AC1:** Super Admin sidebar Finance opens the reference-inspired five-total Project Budgets screen with functional filters, pagination, and details; no duplicate sidebar item.
2. **AC2:** Each project and portfolio total uses the existing canonical approved baseline and integer-paise values. Reserve, usable budget, overhead inclusion, remaining amount, and utilization reconcile across at least two unequal projects, including nonzero GST and rounding cases.
3. **AC3:** Filtering occurs before totals/count/pagination, duplicate client names remain distinct, permissions cannot expand the result population, and date scope is explicitly budget-approval cohort/current lifetime values.
4. **AC4:** Project details show the cylinder, exact summary, reserve, actual spending/overheads, and usable/remaining budget. Zero, negative remaining, over-100% usage, and unavailable data are represented honestly.
5. **AC5:** Transactions, documents, entry/payment forms, baseline integrity, completion controls, existing Finance Head screens, and other embedded finance consumers retain their behavior and authorization. Returning to the list retains filters.
6. **AC6:** Current-page CSV matches visible rows and exact financial values with explicit summary/page scope. No fabricated deltas, photos, future insights, or unsupported tabs.
7. **AC7:** Focused backend domain/route and replica-set read/reconciliation tests, frontend Finance/route regressions, affected typechecks/builds, and rendered desktop/tablet/mobile interaction/accessibility checks pass. Run `git diff --check`; report any unrun checks and build limitations accurately.

## Risks, rollback, and open decisions

Main risks: double-counting overheads, using GST-inclusive contract value for reserve, mixing period spending with lifetime budget, partial-page aggregates, baseline/client identity drift, and regression of shared finance forms. The field mappings, backend filtering, scoped presentation, and reconciliation tests address them.

All changes are local and additive to existing reads; rollback restores the prior presentation and optional query/DTO additions without changing persisted money or history. No migration is required.

Open decisions: none required before specification approval. Approval accepts the stated interpretations: GST-exclusive budget, spending includes overheads, coherent corrected percentages, approval-date cohort filtering, backend finance risk policy, current-page export, and omission of unsupported Forecast/Notes.

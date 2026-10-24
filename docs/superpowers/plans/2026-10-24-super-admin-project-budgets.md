# Super Admin project budgets: implementation plan

Date: 2026-10-24
Status: Implemented; focused verification passed. Broader harness limitations are recorded below.
Approved specification: [Super Admin Finance design](../specs/2026-10-24-super-admin-project-budgets-design.md).
Approval record: The user approved that specification on 2026-10-24. Its original awaiting-approval status line is superseded by this record; its requirements are unchanged.
Execution mode: A, parallel sub-agents, selected by the user after task-plan approval.

## Outcome and boundaries

Deliver the approved Super Admin Finance flow: a five-total Project Budgets list with working filters and pagination, then a project detail with the cylinder graphic, exact budget summary, and existing ledger/workflow actions.

Retain the canonical approved-estimate source, the existing 20% reserve excluding GST, integer-paise amounts, and backend finance-risk policy. Spending includes overheads; overheads are a subset and never deducted twice. Extend existing read APIs only where needed. Preserve Finance Head screens and all other embedded finance consumers. No dependency, persistence, migration, posting-policy, permission, or deployment changes are planned.

## Ownership

All agents must preserve other writers' changes and work only within their assigned paths. Recheck dirty paths and target diffs before assigning writers. Shared-file changes return to the primary owner.

| Owner | Exclusive scope | Deliverable |
| --- | --- | --- |
| Primary | `frontend/src/api/types.ts`; `frontend/src/features/finance/projectFinanceApi.ts`; `FinanceOverviewPage.tsx`; `FinanceProjectPage.tsx`; existing `FinancePages.test.tsx`; any necessary routing/test-fixture integration; shared style imports; this plan/spec | Shared contract, role-specific entry points, safe return navigation, integration and final reconciliation |
| Backend implementer | `backend/src/services/project-finance.service.ts`; `backend/src/routes/project-finance.ts`; `backend/src/openapi.ts`; relevant finance/domain/route/API tests; a small finance-domain read helper only if needed | Authorized filtered reads, client/approval metadata, backend status, scoped choices, matching summaries and pagination |
| List implementer | New finance-local `SuperAdminProjectBudgets.tsx`, its scoped stylesheet/tests, and small list presentation/export helpers with tests if warranted | Five totals, filters, table/mobile layout, pagination, current-page CSV, payment entry |
| Detail implementer | `frontend/src/features/finance/ProjectFinancePanel.tsx`; new finance-local budget overview/SVG presentation and stylesheet/tests | Opt-in Super Admin detail presentation with supported sections, preserving existing integrity and mutation behavior |
| Integrity reviewer | Read-only | Financial reconciliation, authorization, lineage, query invalidation, filters and shared-consumer regression review |
| Verification runner | Read-only product sources; temporary QA logs allowed | Final integrated tests/typechecks/builds/hygiene after writers and review finish |

`ProjectFinanceChart.tsx`, `financeFormat.ts`, `DesignPaymentConfirmations.tsx`, shared tokens, and unrelated dashboard code remain unchanged unless an integration need is demonstrated and ownership is explicitly reassigned. Prefer reusing existing capabilities over expanding shared abstractions.

## Dependency-ordered tasks

### T0. Capture baseline and settle the small shared contract

Owner: Primary. Dependency: approved plan and execution choice. Acceptance: AC1–AC7.

- Capture `git status --short`, relevant diffs, focused baseline results, and existing Finance screenshots before edits. Preserve the pre-existing Playwright log and any newly discovered unrelated work.
- Confirm the exact approved-source timestamp for original/final baselines, current client identity source, and existing finance-risk function usage. Carry stable project/client IDs; never join by presentation labels.
- Settle request/response names with the backend slice: optional search, project/client selection including explicit unlinked-client selection, budget status, finance stage, project lifecycle, UTC approval-date range, limit and offset; matching summary/count plus authorized project/client choices.
- Keep the existing numeric-offset `getProjectFinanceBuckets` caller compatible. Add a typed filtered query function/key beneath the existing `projectFinanceKeys.projects` prefix so current prefix invalidation refreshes all list variants.
- Define the role-specific list entry and opt-in detail presentation contract. Keep one owner for bucket/ledger queries and integrity checks in `ProjectFinancePanel`; do not introduce duplicate detail query/mutation owners.
- Settle URL filter serialization, safe same-app list return location, and scoped class names before parallel writers start. Direct detail visits return to `/finance`; never accept arbitrary external return URLs.

### T1. Extend authoritative Finance reads

Owner: Backend implementer. Dependency: T0. Parallel-safe with T2/T3 after the interface is settled. Acceptance: AC2, AC3, AC5, AC7.

- Extend the strict list-query schema while preserving unfiltered pagination behavior. Bound search/IDs, validate enums and real calendar dates, reject reversed ranges, and define inclusive UTC bounds explicitly.
- Resolve the existing authorized eligible approved-project population inside the existing finance snapshot. Add client ID/name and canonical approved-baseline date to read data; do not expose contact details or broaden eligibility.
- Reuse the existing backend finance-risk rules for Over budget/At risk/Within budget and neutral zero-budget presentation. Keep project completion semantics and null utilization denominators correct.
- Derive filter choices from the authorized eligible population. Apply filters before financial summary, total matching count, and pagination. Preserve canonical baseline selection, classified costs, signed remaining values, and no-write reads.
- Align detail metadata where needed without requiring new permissions or changing mutation results' financial meaning. Missing identity metadata must remain explicit rather than being inferred from names.
- Update OpenAPI query/response descriptions and relevant route mocks. Keep route-operation identities unchanged.
- Add focused route and replica-set regressions for two unequal projects, nonzero GST, per-project reserve rounding, overhead inclusion, duplicate client names, unlinked clients, date boundaries, combined filters, empty results, page/summary reconciliation, role isolation, and original/final baseline dates. Retain existing snapshot consistency and finance lineage coverage.

### T2. Build the Project Budgets list

Owner: List implementer. Dependency: T0 contract; final integration uses T1. Acceptance: AC1–AC3, AC5–AC7.

- Implement the reference-inspired header, five available authoritative totals, exact-value access, warm neutral surfaces, and green/ochre hierarchy. Do not add fake deltas, imagery, or decorative trends.
- Implement native project/date/search/client/status/stage/lifecycle controls from the agreed read contract. Label date filtering as approval cohort/current lifetime amounts. Keep URL state, reset pagination on changes, and distinguish initial loading, background refresh, no match, error, and retry.
- Render 10 project rows per page with all approved financial columns and named View details actions. Use backend budget status and clearly labelled usable-budget utilization. Preserve negative remaining amounts and undefined percentages.
- Use server summary/count/choices; fetch only the requested page for this Super Admin view. Do not reuse the existing automatic all-page loading behavior for the new table.
- Add explicit current-page CSV with exact values, filters, matching count, summary/page distinction, and spreadsheet-formula escaping. Disable export while the displayed data does not match requested filters.
- Reuse the authorized initial-payment component in a secondary, space-efficient section. Keep payment forms and permission checks unchanged.
- Test server-filter query identity, pagination, matching summary versus row count, state preservation, zero/negative values, stale responses, export scope, keyboard controls, and responsive semantics.

### T3. Build the visual project detail

Owner: Detail implementer. Dependency: T0 contract; final metadata integration uses T1. Acceptance: AC2, AC4–AC7.

- Add an opt-in presentation to `ProjectFinancePanel` for the Super Admin Finance route. Preserve its existing trusted-bucket checks, expected-source validation, ledger validation, query ownership, and default consumers.
- Implement the lightweight SVG cylinder, exact Budget Summary, and deterministic insights. Stack reserve, direct spending, overheads, and remaining only once. Handle signed overrun separately and display actual utilization above 100% when applicable.
- Preserve existing GST/contract/baseline context in a secondary disclosure. Use clear percentage denominators and avoid division by zero or invented availability values.
- Add supported Overview, Transactions, Cost Breakdown, and Overheads sections with keyboard-operable navigation. Use backend class totals for Cost Breakdown and real ledger entry types for Overheads. Loaded-only ledger filtering must be labelled partial with existing load-more/retry controls retained.
- Keep entry creation, document access, project completion, procurement navigation, and existing workflow/chat controls reachable. Do not weaken eligibility, idempotency, versions, or invalidation.
- Test the ₹25L/₹5L/₹20L reserve example with ₹18L total spending including ₹2L overheads, unequal second-project values, zero budget, overrun, partial ledger, unavailable/unsafe source, supported sections, and permission restrictions.

### T4. Integrate routes, caches, and shared-consumer regressions

Owner: Primary. Dependencies: T1–T3 writers finish. Acceptance: AC1–AC7.

- Branch existing Finance entry points by authorized role: Super Admin gets the new list and opt-in detail; Finance Head and embedded consumers retain current behavior. Avoid adding a second sidebar Finance item.
- Integrate shared frontend types/API keys, returned facets, list/detail URLs, and safe return state. Verify browser Back/Forward and direct detail URLs.
- Confirm existing cost/payment/completion invalidation reaches filtered lists, bucket/ledger, and dashboard summaries. Avoid unrelated cache changes.
- Update existing Finance page/routing fixtures and regression assertions for the new Super Admin presentation while retaining Finance Head, documents, entry mutation, completion, integrity, and workflow checks.
- Inspect the integrated diff against baseline. Reconcile summary/detail/CSV values and validate loading/error behavior with asymmetric synthetic records. No real customer data or external effects.

### T5. Review and verify once integrated

Owners: Integrity reviewer, then Verification runner, with primary visual QA in Mode A. Inline equivalent in Mode B. Dependency: T4. Acceptance: AC1–AC7.

- Perform a bounded integrity review of GST/reserve/overhead arithmetic, authoritative baseline/date/client identity, filtered total/count consistency, role isolation, stale queries, CSV injection/scope, and unchanged mutation safeguards. Resolve confirmed defects before the final test run.
- Backend focused: `cd backend && npm test -- tests/project-finance.test.ts tests/project-finance-routes.test.ts tests/project-finance-mongo.replica-set.test.ts tests/api-docs.test.ts`. Include any new focused filter/status tests and the existing finance-risk tests touched by helper changes. Use the actual replica-set lane; do not weaken snapshot semantics for a standalone database.
- Frontend focused: `cd frontend && npm test -- src/features/finance`. Run affected `/finance` routing and authorization cases separately using exact test names. Add only specifically implicated shared-consumer checks.
- Run `npm run typecheck` and `npm run build` in both affected workspaces, then root `git diff --check` and `git status --short`. No lint script exists. Broaden tests only when changed shared contracts or a concrete failure warrant it.
- Render the list and detail at 1440px, 1024px, and 360px. Inspect screenshots, exact financial labels, local versus page overflow, keyboard focus, accessible control names, and screen-reader value alternatives.
- Exercise sidebar-to-list-to-detail-to-return, combined filters, pagination, date edges, current-page export, supported sections, and payment/ledger controls with synthetic data. Cover empty/no-match, loading, refresh error/retry, over-budget, zero-budget, partial/unavailable data, and restricted-role states proportionately.
- Record exact outcomes, remaining limitations, temporary artifact locations, and unrun checks in this plan. No commits, pushes, deployments, seeds, migrations, or production mutations.

## Parallel execution and acceptance trace

In Mode A, T1, T2, and T3 can run concurrently only after T0 establishes their interface and ownership. The primary owns integration files throughout. T4 follows all writers; integrity review precedes final integrated verification. Keep one parent implementation task in progress. In Mode B, execute these same slices sequentially in the primary thread without implementation subagents.

| Criterion | Evidence |
| --- | --- |
| AC1 | Super Admin route/list tests and reference-based desktop/mobile screenshots |
| AC2 | Domain/replica-set reconciliation across unequal projects, detail visual tests, and exact CSV inspection |
| AC3 | Strict-query, filtered summary/count/pagination, client/date identity and permission tests |
| AC4 | Rendered cylinder/summary with normal, zero, and overrun examples |
| AC5 | Finance Head/embedded-consumer, ledger/document/mutation/payment/completion and history regressions |
| AC6 | Current-page CSV scope/formula escaping plus absence of unsupported/fabricated content |
| AC7 | Integrated focused tests, affected builds/typechecks, responsive/accessibility checks, and hygiene |

## Execution record

- Specification approved by the user on 2026-10-24.
- Task plan approved; user selected Mode A. T0 baseline captured in `/tmp/lisno-project-budgets/`; Finance frontend baseline: 45 tests passed.
- T1–T3 are authorized as one parent implementation task, with the primary owning shared contract and integration.


### Completed implementation

- T0–T4 completed. Backend list reads now return validated filters, authorized client/project choices, canonical approval dates, and backend budget status. Totals and pagination use the same matching population inside the existing finance snapshot.
- Super Admin Finance now renders `SuperAdminProjectBudgets.tsx`; its table, URL filters, current-page CSV, and safe return navigation are integrated. The detail opts into `ProjectBudgetOverview.tsx` through the existing `ProjectFinancePanel.tsx`, retaining its query, integrity, ledger, and mutation owners.
- The existing `FinanceProjectWorkflowControl.test.tsx` heading assertion was updated from the old Super Admin title to `Project budget`; workflow assertions remain unchanged. This extra test target was clean before the change.
- Synthetic enterprise fixtures supply unequal projects, duplicate client names, unlinked clients, overruns, and 12-row pagination. Production data, stored financial values, permissions, dependencies, and lockfiles were not changed.
- T5 integrity review found no confirmed high or medium defect. The browser review found and corrected one status-label contrast issue scoped to the new detail presentation.

### Final automated verification

| Location | Exact command | Result |
| --- | --- | --- |
| `backend/` | `npm test -- tests/project-finance.test.ts tests/project-finance-routes.test.ts tests/project-finance-mongo.replica-set.test.ts tests/collaborative-finance-issue.replica-set.test.ts tests/api-docs.test.ts` | 111 tests across 5 files passed; actual replica-set lane passed |
| `backend/` | `npm run typecheck` | Passed |
| `backend/` | `npm run build` | Passed |
| `frontend/` | `npm test -- src/features/finance` | 75 tests across 7 files passed |
| `frontend/` | `npm test -- src/test/fixtures/enterpriseTransport.test.tsx -t 'renders /finance'` | 3 passed; 60 unrelated cases skipped |
| `frontend/` | `npm run typecheck` | Passed |
| `frontend/` | `npm run build` | Passed; Vite emitted large-chunk warnings |
| repository | `git diff --check` | Passed |
| repository | `git status --short` | Reviewed; pre-existing Playwright log retained |

Total: 189 focused tests passed. The initial backend sandbox attempt could not open local listeners; its escalated rerun passed without weakening the replica-set tests. Initial integration failures caused by a hidden ledger error and an outdated heading assertion were corrected before the final Finance run.

### Rendered verification

Used the local enterprise QA harness with synthetic records, without live customer data or writes. Both list and detail were rendered at 1440, 1024, and 360 pixels. All six final checks had no page overflow, no reported axe violations, no application console errors, and no unexpected API requests. The mobile table retains a named, focusable local scroller (302px viewport, 1080px table). Axe logged preload warnings, but completed its checks.

Verified list-to-detail-to-return with retained search/client/status/stage/date filters; duplicate-name client identity and unlinked-client filtering; inclusive one-day approval filtering; no-match, empty, loading, error/retry, and denied states; 10-row pagination across 12 projects; an actual two-row page-2 CSV download with separate matching-portfolio totals; keyboard entry into detail; Overview/Transactions/Cost Breakdown/Overheads; and the payment disclosure. The over-budget detail showed 112.5% utilization and its signed remaining amount. Zero-budget and partial-ledger behavior are covered by the focused rendered unit tests.

The approved arithmetic example is verified: ₹25L excluding GST reserves ₹5L, leaves ₹20L usable, and ₹18L spending including ₹2L overheads leaves ₹2L remaining at 90% usable-budget utilization.

### Artifacts and remaining limits

- Logs, baseline captures, CSV, and screenshots: `/tmp/lisno-project-budgets/`. Final screenshots: `list-final-{1440,1024,360}.png` and `detail-final-{1440,1024,360}.png`. Temporary browser logs/snapshots were moved into `browser-artifacts/`; the task browser and preview server were closed. Ignored build outputs remain in workspace `dist` directories.
- An earlier broader enterprise harness run reported three failures outside Finance: the protected workflow-document test could not find its expected `Client Kick off` button, and two Procurement gallery cases matched duplicate `Aurora Villa` articles. Those unrelated product/test paths were not modified, and the full harness was not rerun. Details remain in `integration-first.log`; no full-suite pass is claimed.
- Full backend/frontend suites and OCR were not run. There is no repository lint script. Build chunk-size optimization is outside this bounded Finance change.
- No dependencies, migrations, seeds, backfills, commits, pushes, deployments, external messages, or production mutations were performed.


### Resumed loading correction, 2026-10-24

The user reported that the approved screen still cannot load real local test projects. Read-only diagnosis reproduced HTTP 500 at `requireCompletePortfolio`: one approved Estimate references a missing Project. The database has 12 current projects; five have individually valid budget reads, seven have no approved budget. No stored data was changed.

This resumes AC1/AC3/AC7 of the approved Mode A implementation. Bound the Finance list to existing authorized Project IDs before reading their approved Estimates, retaining the current approval, money, identity, and bucket consistency checks for every existing project. Summary, filters, and pagination continue to cover that same population. Do not repair/delete data, invent budgets for unapproved projects, change the response contract, or modify other reporting consumers.

One correction task in progress: backend owner updates only the list service and focused replica-set regressions (orphan alongside two unequal existing projects, permission scope, and retained invalid-source rejection). Primary owns this record and verifies the actual local API and rendered list/detail. A bounded integrity review and final focused checks follow the writer. Baseline captured in `/tmp/lisno-project-budgets-loading-fix/`.


Loading correction completed. Only `listProjects` in `backend/src/services/project-finance.service.ts` and its replica-set regression file changed. Existing project rows now define the authorized population before approved Estimate lookup. Orphan references cannot enter list totals, choices, or pages; invalid approval evidence on an existing project still fails explicitly. Independent integrity review found no confirmed defects.

Verification of the correction:

- The new orphan regression failed at `requireCompletePortfolio` before the change and passed after it.
- `cd backend && npm test -- tests/project-finance-mongo.replica-set.test.ts tests/project-finance-routes.test.ts tests/collaborative-finance-issue.replica-set.test.ts`: 43 tests across three files passed, including real replica sets. The initial sandbox listener failure was retried successfully with escalation.
- Backend `npm run typecheck`, `npm run build`, and root `git diff --check`: passed.
- Actual local API after restart: HTTP 200, five rows, five project choices; all five detail budgets match the list and all summary financial amounts reconcile with the five rows.
- Actual browser at the existing localhost:5173 app: five table rows, no loading error, Budget Overview and Budget Summary visible, Transactions open, and Back to Project Budgets restores the five rows. No synthetic data transport was used for this final check. Only aggregate/boolean evidence was recorded in `live-browser-result.json`; no customer screenshots or credentials were retained.
- The existing development supervisor did not watch backend source changes. It was gracefully restarted with the same `npm run dev` topology (API, local rules service, OCR) to load the fix. The restored local service remains running for the user. Its established startup skips account provisioning. No data repair, deletion, migration, seed, or production deployment was performed.
- Temporary browser session cleared and closed; task browser artifacts moved to `/tmp/lisno-project-budgets-loading-fix/browser-artifacts/`. Logs and before/after evidence remain under `/tmp/lisno-project-budgets-loading-fix/`.
- Frontend sources were unchanged in this correction; its suites and build were not repeated. Full backend/OCR suites were not run. The previously recorded unrelated enterprise-harness limitations remain outside this correction.

# Visual dashboard and click-through details: task plan

Date: 2026-10-24
Status: Complete; integrated implementation and local verification finished.
Approved specification: [Super Admin visual dashboard and click-through details](../specs/2026-10-24-visual-dashboard-drilldowns-design.md).
Approval record: The user approved the specification on 2026-10-24. This records approval despite its original awaiting-approval status line; its requirements are unchanged.
Execution mode: A, selected by the user after task-plan approval.

## Outcome and boundaries

Deliver one visual overview matching the approved reference hierarchy. Remove visible dashboard tabs and the mobile section selector. Clicking metrics, charts, module rings, workforce roles, and action summaries opens existing relevant detail views with a clear return action.

Reuse the existing APIs, ECharts/SVG runtime, query keys, record components, and payment workflow. Keep unavailable summaries hidden and preserve truthful comparisons, signed finance values, exports, permissions, and retries. Do not add a modal framework, backend analytics, dependencies, maps, invented trends, or unsupported history. Keep one parent implementation task active and verify proportionately.

## Ownership and parallel boundaries

Paths below are relative to `frontend/src/features/admin/dashboard/` unless otherwise stated.

| Owner | Exclusive write scope | Deliverable |
| --- | --- | --- |
| Primary | `SuperAdminDashboardPage.tsx` and tests; `DashboardNavigation.tsx`; `dashboardViewModel.ts` and tests; `DashboardMetricStrip.tsx`; `DashboardTabSummary.tsx`; `super-admin-dashboard.css`; report sections/export files and tests; `frontend/src/features/finance/DesignPaymentConfirmations.tsx` and tests if needed; dashboard routing tests; existing QA entry; this plan | URL navigation, shared interfaces, five metrics, scoped styling, payment entry, export integration, final reconciliation |
| Charts | `dashboardChartData.ts` and tests; `DashboardDataChart.tsx`; `ExecutiveDashboardCharts.tsx` and tests; one dashboard-local activity heatmap component/test if useful | Accurate activity/comparison/lifecycle/finance chart views and heatmap, exact values, keyboard actions |
| Overview | `DashboardOverview.tsx` and tests; `DashboardPriorityProjects.tsx` and tests if required | Visual composition, module rings, workforce presentation, priority list, existing authorized operational actions |
| Integrity reviewer | Read-only | Data semantics, navigation, permissions, payment/export preservation |
| Verification runner | Read-only product sources; temporary logs allowed | Final focused tests, typecheck/build, hygiene after integration |

Before assigning writers, the primary captures the relevant dirty-file diffs and copies, settles shared navigation/chart props and class names, and communicates their exact contract. Writers preserve the prior approved dashboard work and unrelated changes. Shared-file needs return to the primary; agents do not edit another owner's files.

## Dependency-ordered implementation

### T0. Capture baseline and settle integration contracts

Owner: Primary. Dependencies: Approved plan and execution choice. Acceptance: AC1–AC6.

- Capture initial status, scoped diffs, and current dashboard source copies before changes. Record current focused-test results and a synthetic overview screenshot.
- Settle a small dashboard navigation helper using existing `tab`, period, comparison, and supported filter parameters. Include stable origin identifiers for focus/scroll return; use existing router state/local refs rather than a navigation framework.
- Confirm the five headline metrics and detail destinations from the specification. Overdue uses schedule-risk records sorted by deadline, explicitly named as that broader result.
- Settle dataset exports and activation callbacks for the overview charts. Keep raw export datasets distinct from available-only presentation. Reuse existing dataset shape; the calendar heatmap may consume the same dated count rows without changing the ECharts runtime.
- Define shared layout class names and overview navigation props before parallel edits. Preserve `getDashboardPendingActions` report semantics or move it only under an agreed primary-owned integration change.

### T1. Build the visual chart surfaces

Owner: Charts. Dependency: T0. Parallel-safe with T2 and the primary's T3. Acceptance: AC1–AC3, AC6.

- Add project-created/completed activity and current-versus-previous event comparison datasets from existing trend/comparison fields. Use available periods and UTC dates; label snapshots and event windows correctly.
- Present the lifecycle distribution with reconciled totals and shares, stable status activation IDs, and matching keyboard/DOM actions. Preserve verified-bar fallback for incomplete distributions.
- Reuse recorded-expense history and current finance composition/budget data; do not fabricate stacked historical expense classes or six-month data.
- Implement the small project-creation calendar heatmap from daily buckets. Distinguish verified zero from unknown, expose exact dated counts on selection, support keyboard use, and handle partial weeks and 7/30/90-day windows.
- Make chart styling fit the approved reference through existing SVG charts and chart-local options. Do not alter the shared runtime unless a concrete requirement proves necessary and ownership is reassigned.
- Test period comparisons, unequal values, missing comparisons, negative/zero values, null gaps, partial populations, stable activation targets, and heatmap date/value handling. Tests assert behavior and data meaning rather than markup details.

### T2. Compose the overview and clickable summaries

Owner: Overview. Dependency: T0; final integration uses T1 exports. Acceptance: AC1–AC3, AC5–AC6.

- Replace the current overview hierarchy and “More portfolio context” disclosure with the approved primary visual layout: activity/lifecycle/comparison, financial overview, module progress, workforce, activity calendar, priorities, and compact actions. Integrate the primary-owned headline strip and payment summary slot.
- Turn module progress into labelled, operable rings/counts. Use backend ratio values; estimation may display approved/tracked counts. Do not create a new business KPI.
- Show active workforce with verified role counts; render a ring only for a complete reconciled population. Role links use stable role IDs and preserve period/comparison settings.
- Keep risk, Client/design responses, vendor requests, and existing operational actions accurate and permission-aware. Do not combine separate queues into a unique-project count. Preserve vendor loading/retry behavior.
- Reuse priority-project data and authorized ID links. Do not add placeholder property photography or infer project stages from unrelated fields.
- Filter unavailable content before wrappers; preserve valid zeros and negatives. Use distinct actions inside multi-control panels, avoiding nested interactive elements.
- Add focused tests for visual-to-detail callbacks/links, partial/all-hidden states, module/workforce destinations, permission restrictions, and operational failures.

### T3. Integrate navigation, metrics, payment access, and presentation

Owner: Primary. Dependency: T0; can progress alongside T1/T2 on assigned paths. Acceptance: AC1–AC6.

- Remove `DashboardNavigation` from the page and replace orphaned tab semantics with meaningful regions/headings. Keep legacy `tab` URLs working as internal detail selection.
- Add **Back to dashboard**, contextual detail headings, history navigation, focus transfer, and origin scroll/focus restoration. Reuse existing detail summaries, filters, pagination, and query identities; reset irrelevant filters on a new visual drilldown.
- Set the overview headline strip to total projects, approved net value, approved contract value, current margin, and live overdue projects. Hide unavailable values and unsupported deltas/sparklines. Make exact financial amounts accessible when labels are compact.
- Keep detailed queries lazy. Overview loads its existing priority and authorized operational queries; selecting a module or workforce opens the corresponding existing records query.
- Add a compact initial-payment queue entry backed by the existing query/cache and permission checks. Open the existing finance confirmation UI without changing mutation forms, attestation, stale-version handling, or invalidation. Keep other uses of the payment component unchanged.
- Scope styling to the dashboard. Match the reference's multi-panel hierarchy at desktop widths and reflow naturally at laptop/tablet/360px widths. Keep missing panels from leaving empty slots; preserve focus contrast and reduced-motion behavior.
- Update page/routing tests for the new visual entry points, legacy URLs, direct links, filter reset/preservation, browser history, focus return, lazy requests, refresh/error handling, and payment navigation.

### T4. Reconcile reports and integrated behavior

Owner: Primary. Dependencies: T1–T3 writers finished. Acceptance: AC2–AC5.

- Ensure overview exports cover implemented visual data and retain raw partial-source diagnostics. Reuse chart factories for exact values; do not recalculate amounts in a separate export path. Keep detail-page exports scoped to their filter/pagination state.
- Integrate any additional authorized queue section with truthful loading/stale/error state and observed/fetched metadata. Do not make a missing operational count appear as zero or block unrelated available content.
- Review the entire delta against the captured baseline, remove obsolete in-scope tab presentation only where no consumer remains, and preserve unrelated work. Keep existing internal `DashboardTab` naming where renaming would add churn.
- Update synthetic QA fixtures only as needed for complete/partial/all-hidden data, populated charts, payment states, and asymmetric project/workforce records. Use no real customer data.

### T5. Review and verify the completed flow

Owners: Integrity reviewer, then Verification runner in Mode A; primary sequentially in Mode B. Dependency: T4. Acceptance: AC1–AC6.

- Review finance units/sources, event-versus-snapshot comparisons, partial-distribution semantics, availability, supported filters, permission checks, vendor/payment behavior, and export metadata. Resolve concrete defects before final verification.
- Run focused dashboard/payment tests: `cd frontend && npm test -- src/features/admin/dashboard src/features/finance/DesignPaymentConfirmations.test.tsx`.
- Run the dashboard routing cases in `src/app/router.test.tsx`, `npm run typecheck`, `npm run build`, and root `git diff --check` / `git status --short`. There is no lint script. Broaden checks only if an actual shared regression warrants it; backend/OCR suites are outside this frontend-only scope.
- Render at 1440px, 1024px, and 360px. Inspect complete, partial, all-hidden, empty, initial-loading, stale/error, and retry states, distributing the state/width checks proportionately rather than repeating every combination.
- Exercise every visual destination, lifecycle/worker/risk filters, module details, browser Back/Forward, direct legacy URLs, payment entry, period changes, exact-value access, and CSV export. Verify focus/scroll return, keyboard controls, no horizontal page overflow, and overview/detail accessibility scans.
- Inspect screenshots against the reference and fix alignment/readability issues. Report exact results, any remaining limitations, and temporary artifact paths. No commits, pushes, deployment, migrations, or external actions are included.

## Acceptance trace

| Specification criterion | Required evidence |
| --- | --- |
| AC1: New visual hierarchy, no visible tabs | Overview/page tests plus reference comparison at desktop and mobile widths |
| AC2: Working visual entry and history compatibility | Each supported destination, keyboard counterpart, legacy URL, and Back/Forward checked |
| AC3: Truthful available data and exports | Dataset/model/export regressions for partial, zero, negative, comparison, population, and gap cases |
| AC4: Correct filters, focus/history, lazy queries | Page/query tests and browser lifecycle/role/module/period navigation |
| AC5: Operational and permission preservation | Vendor/payment/permission/retry tests and partial-data CSV inspection |
| AC6: Responsive and verified | Rendered width/state checks, accessibility scans, focused tests, typecheck/build, hygiene |

Mode A permits T1, T2, and the primary's T3 to run concurrently after T0 fixes their interfaces. Mode B executes the same slices inline. Review and final verification follow all writers sequentially. Only this task-plan document is created at the current gate.

## Execution record

- T0 complete: baseline captured in `/tmp/lisno-visual-dashboard/`. Existing dirty dashboard work is preserved as the starting point.

- T1–T3 complete. Charts, Overview, navigation, styling, payment entry, and regression tests were integrated under the agreed ownership boundaries. Baseline focused suite: 226 tests passed.
- T4 complete. Overview exports include activity, comparison, heatmap, operational design responses, and payment confirmation counts with source availability/provenance. Exact finance values remain accessible beneath compact visible labels. Existing APIs, permissions, query keys, and mutation workflows remain intact.
- T5 complete. The integrity reviewer identified three bounded issues: individual workforce-role masks, comparison-mask key names, and the missing design-response export row. All were fixed with regression coverage; narrow re-review was clear.

### Final verification evidence

| Check | Result |
| --- | --- |
| `cd frontend && npm test -- src/features/admin/dashboard src/features/finance/DesignPaymentConfirmations.test.tsx` | 253 tests across 21 files passed |
| `cd frontend && npm test -- src/app/router.test.tsx -t 'mounts the registered super_admin page at /admin/dashboard\|routes the Super Admin root to Dashboard'` | 2 passed; 137 unrelated cases skipped |
| `cd frontend && npm run typecheck` | Passed |
| `cd frontend && npm run build` | Passed; existing large-chunk warnings remain |
| `git diff --check` and dirty-path reconciliation | Passed; unrelated initial changes preserved |
| Browser at 1440px, 1024px, and 360px | Screenshots inspected; no horizontal page overflow |
| Rendered navigation | Project/finance/module/workforce/schedule-risk/payment entries passed with origin focus return; lifecycle and all five comparison actions used the correct supported filters |
| Browser history and keyboard | Back/Forward, legacy workforce query, selected-period preservation, chart Home/Enter exact values, and heatmap arrow selection passed |
| Availability and recovery | Partial and all-hidden summaries omitted without warning wall; priority records retained; verified zero, initial loading, and error-to-retry recovery passed |
| Accessibility | Axe scans on overview and Design detail found no violations; keyboard and focus checks passed |
| CSV | Actual browser download inspected, including design responses and payment confirmation section |

Artifacts and detailed logs: `/tmp/lisno-visual-dashboard/`. Principal visual evidence: `desktop-final.png`, `width-1024.png`, `mobile-top-final.png`; CSV: `overview-export.csv`. Temporary browser outputs were moved out of the repository. Final valid-fixture interaction run recorded no page errors. During QA a Vite reload at an application URL lost the synthetic fixture and produced expected unauthenticated-request failures; reopening the QA entry resolved that harness state.

Full unrelated frontend, backend, and OCR suites were not run. No lint script exists. No new dependencies, backend/schema changes, migrations, commits, pushes, deployment, or production mutations were performed. Unsupported maps, lead flow, and historical snapshots remain absent as approved; overdue navigation remains explicitly labelled as broader schedule risk.

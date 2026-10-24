# Super Admin dashboard reference redesign

Date: 2026-10-23
Status: Approved by the user; implemented under the approved task plan and Mode A. See the task plan for verification results and limitations.
Classification: Substantial frontend redesign with sensitive financial presentation and permission preservation.

## Goal and confirmed direction

Rebuild the Super Admin web dashboard around the supplied screenshot's composition, and apply a coherent, equally polished design to every tab inside that dashboard.

The user confirmed: **“Match the layout with real Lisno metric labels.”** The screenshot establishes hierarchy, density, chart placement, and the green/neutral palette. Its example amounts, names, percentages, subscription tiers, and historical dates are not application data.

The recommended approach uses existing dashboard APIs and ECharts. Four headline metrics lead into a wide time-series chart beside a donut, followed by two practical tables. Detail tabs use the same typography, surfaces, metric treatment, chart conventions, and table styling, with charts appropriate to each module.

## Current behavior and source evidence

Repository inspection, rather than older design documents, establishes these facts:

| Area | Current evidence | Implication |
| --- | --- | --- |
| Dashboard scope | `frontend/src/features/admin/dashboard/superAdminDashboardApi.ts` defines Overview, Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk. | Redesign all nine dashboard tabs. |
| Page composition | `SuperAdminDashboardPage.tsx` owns URL parameters, period/comparison controls, refresh, queries, summary metrics, module charts, drilldowns, and payment confirmations. | Preserve state and action behavior while changing composition. |
| Overview | `DashboardOverview.tsx` renders five headline metrics, recorded-cost bars, project-status donut, cost and budget charts, a side rail, workforce content, and module links. | Replace the crowded composition with the reference's four-metric and two-chart hierarchy. |
| Detail tabs | `DashboardModuleCharts.tsx` and `echarts/DashboardModuleECharts.tsx` render spatial corridors, nodes, topology, and custom ratio paths; `TabSummary` follows them with many metric cards. | Replace these visual treatments with readable line, donut, bar, and progress charts; promote four key metrics per tab. |
| Finance | `backend/src/contracts/super-admin-dashboard.ts` exposes approved subtotal, GST, contract total, budget, spend, overhead, profit, and margin. `backend/src/repositories/super-admin-dashboard.ts` joins approved finance sources. | Reuse authoritative amounts and units. Approved value is not cash receipts. |
| Time series | Comparison/trend contracts expose project/client creation, project/task completion, approvals, and recorded expense buckets. There is no historical revenue series in this contract. | Use recorded expenses for the main money-over-time chart. |
| Clients | `DashboardClientMetrics` exposes registered, active, and inactive Client accounts, with independent account and relationship availability. | Active clients and an active/inactive client donut are supported. Active means enabled account, not a recent login. |
| Completion | Memory and Mongo aggregates calculate project completion from completed projects divided by all projects. | Use the backend ratio as “Completion rate”; do not label it sales conversion. |
| Project details | `DashboardProjectRow` has stable project identity, manager, planned end date, weighted execution progress, risk, and verified module context. | A priority-project table can use an existing bounded project query. Client name and generic overall progress are not fields in this row. |
| Authorization | Dashboard routes require their registered operations. Overview actions also check client-response, project, user-directory, Configuration, and payment permissions. | Preserve each operation's visibility and access checks. |
| Chart accessibility | Existing `ChartFigure` and `DashboardEChart` provide exact-value tables and keyboard interaction infrastructure. | Reuse these rather than removing accessible alternatives. |
| Styling | Current dashboard CSS includes multiple historical visual treatments. Shared interface typography is Poppins; ECharts is already installed. | Consolidate dashboard-scoped styles without a new UI or chart dependency. |
| Test support | Dashboard page, module chart, executive chart, API, presentation, and invalidation tests exist, plus `frontend/qa/super-admin-dashboard.html` and its synthetic fixture entry. | Update behavioral tests and use the fixture route for repeatable visual checks. |

The initial worktree contains unrelated security remediation across backend, frontend, mobile, assistant, OCR, package files, and deployment configuration. The inspected dashboard feature paths and dashboard backend contracts/routes/repository have no existing diff. Re-capture status and relevant target diffs before implementation; preserve all unrelated work, including the modified frontend package files, API client, authentication files, and test setup.

## Scope and non-goals

In scope:

- `/admin/dashboard` and its nine existing tabs, including responsive web layouts.
- Dashboard header, metric hierarchy, charts, legends, table presentation, filters, pagination, loading/error states, and local report export.
- Dashboard-only styling around existing vendor-request and payment-confirmation controls, preserving their functionality.
- A bounded priority-project read on Overview using the existing dashboard project endpoint.
- Tests and synthetic QA fixtures necessary to verify the new presentation.

Outside this change:

- Other Super Admin sidebar destinations, other roles' dashboards, and the separate native `mobile/` application.
- New revenue recognition, cash receipt, subscription-tier, login-activity, conversion, or audit-history systems.
- New backend endpoints, persistence fields, permissions, finance formulas, migrations, or changes to payment and approval workflows.
- Global shell/theme replacement, 3D scenes, decorative motion, new dependencies, commits, deployment, and production data changes.

## Overview content and layout

The desktop content region follows this order:

1. **Dashboard** heading and an **Export Report** button aligned on the same row. Keep refresh, last-updated time, reporting period, and comparison control in a compact secondary toolbar. Keep the nine-tab navigation.
2. Four equally weighted metric panels in a single row.
3. A wide recorded-expense area chart, approximately 70% of the row, with a client-account donut alongside it.
4. Two tables of approximately equal width: Pending actions and Priority projects.
5. Existing initial-payment confirmations and secondary operational/finance information below the main composition, using compact sections and disclosures where useful.

### Exact mapping from the reference

| Reference element | Lisno label and content | Data basis |
| --- | --- | --- |
| Total Revenue | **Approved net value** | `finance.approvedSubtotalPaise`; caption “Client-approved value, excluding GST.” Current approved finance snapshot. |
| Active Users | **Active clients** | `clients.activeAccounts`; caption “Enabled Client accounts.” Respect `accountsStatus`. |
| Projects | **Projects** | `projects.total`; caption “Current portfolio.” |
| Conversion Rate | **Completion rate** | `projects.completionRate`; show completed/total context. |
| Revenue Over Time | **Recorded expenses over time** | Existing expense buckets by their authoritative UTC date. Green line and restrained translucent area; visible selected-period total. |
| User Breakdown | **Client breakdown** | Active and inactive accounts, with registered-account total, counts, and percentages. No invented tiers. |
| Recent Activity | **Pending actions** | Existing operational queue counts and links. Columns: Action, Items, Status. This is a current queue, not a fabricated event feed. |
| Top Projects | **Priority projects** | Up to five rows from `GET /admin/dashboard/projects`, `module=projects`, `sort=risk_desc`, `limit=5`, `offset=0`. Columns: Project, Execution progress, Manager, Due date. Risk is a compact labeled status within the project cell. |
| Export Report | **Export Report** | Download a local CSV of the current tab's verified data and reporting context. |

### Metric and chart accuracy

- Snapshot cards do not receive invented historical sparklines or growth percentages. Where a creation trend is shown under Clients or Projects, label it explicitly “New clients in period” or “New projects in period”; it does not describe growth in the current active/total population.
- Existing comparison fields are the source for changes. A zero previous denominator retains the backend's “New” state; unavailable comparisons remain unavailable. An increase in costs is not automatically styled as a positive outcome.
- The expense chart shows interval amounts, not a fabricated revenue history. Its total is the selected-period sum, not the all-time recorded-cost total. Do not overlay approved-value/budget snapshots as though they were historical measurements.
- Keep the existing 7/30/90-day reporting windows and display their actual dates. “This Year” and January-to-December labels are not valid for these rolling windows.
- Grouping is optional only when it preserves exact amounts, dated bucket boundaries, and selected-window totals. Daily values remain available in the exact-value table. Never interpolate missing values as observed amounts.
- The client donut uses one account population and two mutually exclusive states. Missing account data produces an unavailable state; zero accounts produces an empty state, without a fake 100% segment. Relationship counts appear separately, not as overlapping donut slices.
- Priority-project execution progress comes from `row.execution.progress.rateBps`. Missing eligible tasks produce “Not available”, not 0% or 100%. Planned due dates use the existing formatter. Missing managers display “Unassigned”.
- The priority-project request is independent of detail-tab filters, keyed by its fixed filters and selected period, and enabled only on Overview. It has its own retry/error state and participates in refresh without blocking the overview metrics.
- All existing pending-action destinations remain reachable, including vendor classification review when permitted. Do not attach made-up actors, timestamps, or completion states to queue totals.

## Design for every detail tab

Each detail tab begins with four primary metrics, followed by a dominant chart and a supporting breakdown. Additional metrics appear in a compact “More metrics” section, preserving the existing figures and availability explanations without another large grid. Filters, result count, details, and pagination follow in a consistent table region. Organization summaries stay independent from detail filters and are labeled accordingly.

| Tab | Four primary metrics | Primary and supporting visualizations | Detail emphasis |
| --- | --- | --- | --- |
| Projects | All projects; Active; Live overdue; Completion rate | Created/completed time series; lifecycle donut | Project, status, schedule, risk, and existing finance/execution context. |
| Estimation | Client approved; Awaiting Client; Changes requested; Approved net value | Horizontal status distribution; approval-throughput time series | Estimate status, version, lineage, waiting ages, and project links. Status counts must not imply sequential conversion. |
| Design | Approved; In progress; Ready for Client; Changes requested | Design status distribution; design-approval time series | Plan status/version, pending reviews, delivery exceptions, and project links. |
| Procurement | In progress; Completed; Approved procurement amount; Posted procurement spend | Task-state distribution; approved amount versus posted spend | Persisted progress, variance, source context, and eligibility. Preserve null planned amounts and unavailable lineage. |
| Finance | Approved net value; Recorded expenses; Current profit; Current margin | Expense time series; cost-composition donut | Budget reconciliation, GST and contract context, direct cost/overhead separation, project finance rows, and payment confirmations. Show negative profit and overspend accurately. |
| Execution | All execution tasks; In progress; Overdue incomplete; Weighted progress | Completion time series; execution-state breakdown | Assignments, overdue/unassigned counts, trade distribution, and weighted-progress denominator/fallback context. |
| Workforce | Active workers; Workers with assignments; Unassigned workers; Average calculated KPI | Worker counts by trade; assigned/unassigned donut | Worker detail, workload, KPI eligibility, capacity availability, inactive-assignee exceptions, and governance queues. |
| Risk | Red-risk projects; Yellow-risk projects; Clear projects; Not tracked | Risk-level donut; horizontal risk-factor bars | Distinct project counts versus factor occurrences, reason details, and source drilldowns. Gray must not be presented as healthy. |

Preserve additional existing analytics in secondary sections where needed: budget position, cost composition, workforce and governance detail, project lifecycle links, task-role counts, and module coverage. Avoid displaying the same full chart repeatedly within a tab.

## Visual system and interaction requirements

- Reference-led, restrained analytical interface: pale gray-green page background, off-white panel surfaces, dark text, green emphasis, thin neutral borders, square panel corners, and consistent spacing. Do not introduce a pure-white canvas, shadows, colorful card backgrounds, colored left stripes, decorative orbs, or glass effects.
- Retain the installed Poppins interface font. Use a sans-serif numeric treatment with tabular figures scoped to this dashboard, strong metric numerals, compact labels, and readable table text. Do not use the shared decorative serif for dashboard numbers.
- Use one green accent with neutral comparison colors. Reserve distinct warning/error colors for real semantic statuses, supported by text labels. No rainbow series palette.
- Replace dashboard-owned Lucide ornamentation with text controls or simple functional inline SVG where necessary. Do not replace icon systems outside dashboard scope.
- Clean chart axes, correct monotonic scales, restrained grid lines, visible legends, and real tooltips. Area fills may use low-opacity green without a harsh gradient. Charts retain exact-value disclosure and keyboard access.
- Every menu and action must work. Omit decorative ellipsis menus if there are no relevant actions. No hover movement, animated arrows, 3D, or floating chart marks. Respect reduced motion and disable nonessential chart transitions.
- Preserve native button/link/select semantics, roving tab focus and explicit activation, URL-backed navigation, focus restoration, and accessible names. Validate contrast and target sizes in the actual rendered UI.
- At desktop widths, use the reference's four metrics, wide chart plus donut, and paired tables. At intermediate widths use two metrics per row and stack charts when labels need space. On narrow screens use a single content column with two compact metrics per row where they fit; move to one at larger text sizes. Keep controls touch-friendly.
- At 360px width and 200% zoom, no page-level horizontal overflow, clipped values, inaccessible actions, or overlapping labels. Adapt project/detail tables to the existing mobile row pattern or contained labeled scrolling where preserving column comparison is necessary.
- Keep loading geometry stable with existing project loading primitives and meaningful status text. Preserve verified data during background refresh, mark it stale after failure, expose retries, and avoid reporting an unavailable metric as zero.

## Local report export

The button must export useful data, not be a visual placeholder. Use a UTF-8 CSV without adding a dependency.

- Include active tab, selected period and actual observed dates, observation timestamps, comparison setting, and applied detail filters.
- Export the tab's summaries and plotted values, plus currently loaded detail rows. Explicitly label these as the current page and record page offset/total; never describe a paginated export as the full organization dataset.
- On Overview include its headline metrics, expense series, client breakdown, available action counts, and loaded priority projects. Secondary independent sections have their own observed state; do not imply one transactional snapshot across requests.
- Reuse the same presentation/availability mapping as the screen. Unavailable metrics carry their reason. Financial columns specify INR and use explicit paise-to-rupee conversion; no floating-point recalculation of financial business rules.
- Disable export while the requested period/tab is still showing placeholder data from another request. If a section is missing or has failed, label that section unavailable or stale and include its known observation context.
- Escape CSV delimiters, quotes, and newlines; neutralize spreadsheet-formula prefixes in user-controlled text. Do not include private URLs, credentials, tokens, hidden permission-restricted data, or unrelated records.
- Release browser object URLs. Export creates no backend write, audit event, or external delivery.

## Architecture, data, and permissions

- Extend the existing dashboard feature. Extract a small number of focused metric, chart, table, and export helpers as needed; avoid growing the existing page into a larger component.
- Use existing ECharts lifecycle, lazy loading, resize handling, and accessibility wrappers. Do not add a second chart engine or new global state store.
- Keep frontend/backend API shapes compatible. The additional priority-project call uses the existing operation and response. Do not broaden backend access or join by display name.
- Preserve stable IDs for projects, workers, chart categories, and UTC trend dates. Never use table position or a person's name as identity.
- Preserve all integer-paise sources, approved-estimate baselines, GST treatment, profit/margin rules, cost classification, and ledger-derived overhead. Financial summaries must reconcile with the unchanged Finance tab and project rows.
- Preserve non-Super-Admin route restrictions and operation-specific action permissions. Unauthorized queues are not requested merely to hide them after loading.
- Keep query keys scoped by period and filters. Preserve invalidation after existing mutations, refresh outcomes, last-successful-data messaging, and out-of-order-request protection.
- No schema/index change, migration, seeding, backfill, or production access is needed. Rollback consists of reverting this change's owned frontend paths only, preserving concurrent work.

## Assumptions, alternatives, and open decisions

Confirmed: the user chose real Lisno metrics in the reference composition.

Assumptions presented for approval:

- “All tabs under dashboard” means the nine tabs in `/admin/dashboard`, including responsive web, rather than every sidebar destination or the native mobile application.
- Current queues and priority projects fill the reference's lower-table positions. An audit-history feed is not introduced by a visual redesign.
- Export Report means a practical CSV of the current view and loaded rows, not a new PDF/reporting service.

The chosen existing-data approach preserves authoritative meanings and limits this to a frontend change. Keeping the screenshot's exact SaaS metric labels would require new product definitions and backend data sources, or predominantly unavailable panels. The user selected the existing-data option, so that alternative is not proposed for implementation.

No unresolved architectural decision blocks the task plan once this specification is approved. Feedback changing scope or metric semantics must be reflected here before the task plan advances.

## Risks and controls

- **Loss of reference fidelity through excess content:** keep the four metrics, chart/donut row, and paired tables dominant; put secondary analytics below them.
- **Changing financial meaning while changing labels:** approved net value remains the existing GST-exclusive snapshot; expenses retain their actual time basis; all totals and exports share the same source mapping.
- **Existing CSS overriding the new design:** consolidate owned dashboard selectors and scope tokens; check with the real AppShell and neighboring routes.
- **Permission or workflow regression:** retain vendor-review and payment-confirmation functionality and test asymmetric permission snapshots.
- **Extra overview request failing or becoming stale:** isolate its loading/retry state, include it in refresh, and identify its own observation context.
- **Legacy response omissions and partial data:** preserve optional Client/comparison compatibility and suppress unavailable values in charts, tables, metrics, and exports.
- **Unrelated concurrent security changes:** inspect pre-existing diffs before writers begin; no package, authentication, or shared API rewrites are part of this specification.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification required during implementation |
| --- | --- | --- |
| AC1 | Overview follows the reference's four-metric, wide-chart/donut, and paired-table composition with the approved real-data labels. | Render and inspect against the supplied image at a comparable content width and at 1440px desktop width. |
| AC2 | All eight detail tabs have the shared new visual system and the specified module-specific hierarchy. | Inspect every tab at desktop and narrow width; verify metric/table data remains accessible. |
| AC3 | Financial units, totals, ratios, dates, snapshot/period distinctions, and missing values are accurate. | Focused presentation/chart/export tests using at least two unequal projects, nonzero GST, different costs, zero denominators, overspend, and partial availability. |
| AC4 | Tabs, period/comparison controls, filters, sorts, pagination, drilldowns, and refresh retain their behavior. | Page/API/invalidation regressions and rendered interaction checks, including rapid period changes and browser navigation. |
| AC5 | Priority projects use the existing bounded endpoint and actual weighted progress, manager, due date, and risk. | Request/cache tests, source-row assertions, link checks, and independent failed/empty/stale states. |
| AC6 | Pending actions, vendor-review permissions, and payment confirmations remain functional. | Existing relevant page/workflow tests plus restricted-permission fixtures; no unauthorized query or action leakage. |
| AC7 | Export downloads the current view with accurate scope, values, metadata, missing-data states, and CSV escaping. | Export helper and button interaction tests, including formula-like names, quotes/newlines, stale sections, current-page labeling, and pending-period disablement. |
| AC8 | Loading, empty, partial, legacy, failed, and stale states are distinct and usable. | Synthetic QA fixtures and focused regressions; zero must not stand in for unknown. |
| AC9 | Layout and controls work responsively and accessibly. | Rendered checks at 1440, 1024, 768, 390, and 360px; 200% zoom; keyboard tab/chart navigation; reduced motion; contrast and automated accessibility checks. |
| AC10 | The redesign remains scoped and technically stable. | Frontend focused tests, `npm run typecheck`, full frontend `npm test`, `npm run build`, `git diff --check`, and final `git status --short`. Inspect console/network errors and ensure no new runtime dependency. |

Use the existing synthetic QA entry for visual evidence, with unequal projects and realistic text lengths. Also inspect the dashboard through the actual application shell and confirm an unaffected neighboring route has no style leakage. Runtime artifacts stay in ignored temporary paths and are reported at handoff.

This stage inspected source code and existing test coverage only. No application code was changed, no tests/builds or rendered QA have been run, and no external action has been performed. The separate dependency-ordered task plan will be created only after specification approval, as required by `AGENTS.md`.

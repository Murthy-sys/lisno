# Apache ECharts organization dashboard

- Date: 2026-09-20
- Status: Motion revision pending approval on 2026-09-21; original dashboard scope approved on 2026-09-21
- Classification: Substantial frontend/backend redesign; financial and identity reporting require integrity checks.
- Scope assumption: The existing Super Admin organization dashboard at `/admin/dashboard`.

## Goal

Give the Super Admin a premium, readable dashboard that answers: how many projects and clients exist, what changed from the previous period, how the approved financial position is progressing, and what needs action. Every production metric must come from an authorized backend aggregate over stored records. Apache ECharts will provide interactive charts and visibly advanced data transitions that preserve the relationship between old and new values instead of replaying basic entrance effects.

The overview prioritizes essential metrics. Existing module tabs retain detailed operational reporting and record navigation.

## Current behavior and evidence

The worktree was clean at the start of investigation. No application sources, dependencies, or database records have been changed for this specification.

| Finding | Current source/evidence |
| --- | --- |
| A dedicated organization dashboard already exists, with Overview, Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk tabs. | `frontend/src/features/admin/dashboard/SuperAdminDashboardPage.tsx`, `DashboardNavigation.tsx`; route in `frontend/src/app/router.tsx`. |
| Charts currently use repository-owned SVG/DOM components; Apache ECharts is not installed. | `frontend/src/components/charts/`, `dashboardCharts.tsx`, `DashboardModuleCharts.tsx`, `frontend/package.json`. |
| Overview repeats project totals, lifecycle, risk, finance, and module summaries across many sections. | `DashboardOverview.tsx`; visual inspection of the existing local `/qa/super-admin-dashboard.html` fixture. |
| Chart captions, legends, unavailable states, and a Show values table already exist and should be preserved. | `frontend/src/components/charts/ChartFigure.tsx`. |
| There is no client metrics section or previous-period contract. | `backend/src/contracts/super-admin-dashboard.ts`: `SuperAdminDashboardOverview`, `DashboardTrendBucket`. |
| Current reporting periods are 7/30/90 days, based on UTC calendar days through the observation time. | `backend/src/services/super-admin-dashboard.service.ts`: `dashboardPeriod`. |
| Global metrics are already aggregated server-side, independently of drill-down pagination. Memory and Mongo paths exist, with explicit unsupported-source suppression. | `backend/src/repositories/super-admin-dashboard.ts`; related repository adapters and tests. |
| Project counts/statuses and client identity are persisted. Project client IDs can be null; project contact labels are not canonical client identities. | `backend/src/models/Project.ts`: `clientId`, `status`, dates; `backend/src/models/User.ts`: `role`, `active`, timestamps. |
| A user's role can change, so a current Client account's creation date is not necessarily its first date in the Client role. | `backend/src/services/user-administration.service.ts`: versioned role updates and audit. |
| The overview incorrectly describes `projects.completed` as completed “in this period”; it is the current all-time completed-status count. | `DashboardOverview.tsx` headline detail; project aggregation in `backend/src/repositories/super-admin-dashboard.ts`. |
| Existing approval trends inspect mutable Estimate status/timestamps; genuine historical approval events also have review-round sources requiring lineage validation. | `mongoCanonicalApprovalTrends`; `EstimateClientReviewRound.ts`, `DesignPlanReviewRound.ts`. |
| The ledger trend uses posted records filtered by `incurredAt`, although its current title says “Expenses posted.” | `mongoSuperAdminDashboardOverview` ledger aggregate. |
| Global access is restricted by the canonical route operation and a sole-active-Super-Admin service check. | `backend/src/routes/super-admin-dashboard.ts`, `requireSoleActiveSuperAdmin`. |
| Brand foundations already include Poppins, white/pale surfaces, violet series, reserved risk colors, and common radii. | `frontend/src/styles/global.css`, `brand.css`, `components/charts/chartTokens.ts`. |

The browser inspection used isolated synthetic QA records and a fixture without the complete production shell. It establishes composition issues, not live database values or a complete production visual baseline. No production database was queried. Existing tests were inspected, not executed at this specification stage.

### Motion correction after the first implementation

The first implementation completed the reporting, layout, accessibility, responsive, and database-lineage work, but its animation treatment does not meet the intended ECharts quality bar. It configures generic `animationDuration` and `animationDurationUpdate`, yet does not register ECharts `UniversalTransition`. The runtime calls `setOption` with structural `replaceMerge`, and several line/bar data arrays use primitive values or IDs without stable data `name` values. The result is a conventional entrance/update animation rather than the continuous data transition demonstrated in the [official ECharts transition guide](https://echarts.apache.org/handbook/en/how-to/animation/transition/).

The official transition contract is the implementation baseline for this revision:

- ECharts diffs data by stable `name` to classify add, update, and remove states.
- Existing chart instances and stable series IDs must survive UI state changes so shapes can interpolate instead of restarting.
- Enter and update motion require distinct duration, easing, and stagger policies.
- `UniversalTransition` must be registered in a modular build for intentional cross-series morphing.
- Motion remains bounded, interruptible, disabled for reduced-motion users, and driven by verified application state rather than random or looping demo data.

## Recommended approach and alternatives

**Recommended:** Extend the existing dashboard read contract with client aggregates and explicit current/previous event metrics; redesign its overview; adopt modular Apache ECharts within the dashboard. Reuse canonical finance/risk services, permissions, navigation, theme tokens, and accessible chart frames. This directly supports the requested database reporting while limiting regressions to the dashboard.

**Alternative:** Build a historical snapshot system for every metric, including past risk, active workload, account status, and profit. This would require new persistence, scheduled writes, retention, and operational decisions. It cannot recover missing past observations. It is outside this release; current-only metrics will be clearly identified instead.

ECharts is the user's fixed library choice. No additional React chart wrapper, GSAP, Three.js, or UI framework is required for this dashboard.

## Scope and non-goals

In scope:

- The Super Admin dashboard overview and chart presentation within its existing module tabs.
- Dedicated client account and project-link summaries.
- Previous/current comparisons wherever dated, authoritative records support them.
- Correction of time-basis labels and any historical aggregation needed for the displayed comparisons.
- Backend/frontend contract alignment, OpenAPI updates, query freshness, source-failure handling, and regression coverage.
- Responsive chart interactions, accessible data tables, reduced motion, and chart lifecycle/performance checks.
- Advanced ECharts data transitions for metric, period, comparison, refresh, and one intentional lifecycle-view morph.

Out of scope:

- Redesigning Client, Designer, Manager, Head, or Sales/Estimator dashboards and the main application shell.
- Replacing shared charts throughout unrelated product screens or changing finance business formulas.
- New customer CRM entities, identity matching by name/email, engagement scores, retention/churn, forecasts, or invented targets.
- Reconstructing past status, risk, margin, or capacity from today's state.
- Historical snapshots, database migration/backfill, new production jobs, seeding, deployment, commits, or external publication.
- New date-range types, export workflows, dark-mode infrastructure, or WebGL charts.

## Information hierarchy and visual direction

Use a refined light analytical workspace consistent with Lisno: deep ink text, violet primary data, restrained supporting colors, generous chart area, and precise tabular numbers. Preserve Poppins and established surface/radius tokens. Give the headline metric band more prominence than navigation and metadata. Use thin borders and modest elevation; avoid a repeated wall of equal cards.

Desktop overview composition:

```text
Organization overview                 7d / 30d / 90d   Compare   Refresh
Observed time · visible current and previous UTC date ranges

Projects             Registered clients      Approved net revenue   Recorded expenses
Current total        Current total           Excluding GST          Selected period
New projects + Δ     New accounts + Δ         Current snapshot       Prior-period Δ

Growth and delivery — selected metric / current vs previous       Client portfolio
Wide comparison chart with exact values and dates                 Account + link summary

Project lifecycle                                               Financial health
Stage distribution and counts                                   Budget/spend composition

Needs attention — bounded prioritized records and actionable queue counts
Compact module summaries and links to existing detail tabs
Initial-payment confirmation workflow remains reachable from Overview and Finance
```

The layout is an intent, not fixed pixel positioning. At desktop widths, use a roughly 2:1 main-comparison/client split and equal lower panels. At tablet widths, reduce columns; at 360–430px, stack charts, use a two-column headline band only where values fit, and fall back to one column for narrow/zoomed content. Controls wrap naturally. No whole-page horizontal scrolling.

Initial-payment confirmations remain available with their existing behavior and authorization. Place their workflow below the primary analytical content so an empty confirmation panel does not displace the headline figures.

### Overview chart selection

| Surface | Presentation | Purpose and interaction |
| --- | --- | --- |
| Headline band | Semantic DOM figures; small ECharts sparklines only for real dated activity | Current project/client totals, approved net revenue excluding GST, and recorded expenses in the selected period. Each figure declares its time basis. Supporting new-project/new-account deltas are labelled as activity, not change in total inventory. |
| Growth and delivery | ECharts line chart, current solid and previous dashed; optional subtle current-period area | DOM selector for Projects created, Client accounts created, Projects completed, Execution tasks completed, Estimate approvals, and Design approvals. Show only the selected metric's two period series. Counts use integer ticks; straight segments preserve exact daily shape. |
| Client portfolio | Horizontal bars plus exact DOM counts | Active/inactive Client accounts as an exhaustive partition. Supporting counts for clients linked to projects, clients with active projects, and unlinked projects. These overlapping relationships are labelled separately and never stacked as a partition. |
| Project lifecycle | ECharts doughnut with adjacent labelled counts | Planning, Active, On hold, Completed. Slice selection and equivalent DOM links open the existing Projects tab with its matching status filter. Zero total renders an empty state, never equal synthetic slices. |
| Financial health | ECharts horizontal budget/composition view, with Expenses trend selector | Current cost budget and canonical recorded cost; category composition and remaining budget are explicit. Period expense comparison uses its own money axis. Over-budget values are not clamped to hide overspend. |
| Needs attention | Concise DOM list and existing risk/status indicators | Highest-priority risk projects, overdue/unassigned work, budget exceptions, client responses, and delivery failures. Preserve existing backend ordering and record IDs. Avoid summing overlapping exceptions into a fabricated unique total. |

Keep detailed workforce KPI, role distribution, estimation/design/procurement status, finance waterfall, and risk-factor charts in their existing tabs. Migrate their plots to the same ECharts adapter as appropriate while retaining metric semantics, tables, and links. Ratios may remain simple accessible DOM meters; a chart library should not make basic values harder to read.

Current workflow-state distributions are labelled as distributions, not conversion funnels. A funnel or Sankey would imply transitions/cohorts that these records do not establish.

## Metric definitions and data lineage

All aggregates cover the full authorized population on the backend, never the rows currently loaded into a frontend table.

| Metric | Definition/source | Time/comparison policy |
| --- | --- | --- |
| Total projects | Count stored canonical Projects, all lifecycle statuses. | Current snapshot. Supporting “created in period” comparison is separate. |
| Active/planning/on-hold/completed projects | Current `Project.status` partition. | Current snapshot; do not present as historic period counts. |
| Projects created | Valid canonical Project `createdAt` in the reporting window. | Current/prior values and daily series. |
| Projects completed in period | Canonical completed Projects with a valid `actualEndAt` in the window; reconcile to the same definition in trend buckets. | Period activity from retained records, not all-time completed count. Missing completion dates cannot be invented. |
| Registered clients | Distinct stored User IDs currently carrying `role=client`, active and inactive. Pending invitations and unclaimed project contacts are excluded. | Current snapshot; label explains accounts rather than inferred companies/people. |
| Active/inactive Client accounts | Partition registered clients by persisted `active`. | Current account status, not recent product usage. |
| Client accounts created | Creation dates of accounts currently in the Client role. | Compare current/prior windows; visible helper states the current-role cohort. A role change is not a new registration, and this is not historical customer acquisition/retention. |
| Clients with projects | Distinct valid `Project.clientId` values resolving to Client users. One Client with multiple Projects counts once. | Current relationship snapshot. |
| Clients with active projects | Same distinct Client IDs restricted to Projects currently `active`. | Current relationship snapshot; may overlap other client summaries. |
| Unlinked projects | Projects with null `clientId`; keep projects with invalid/non-Client references as a separate integrity exception. | Current snapshot; never deduplicate contact names or emails into clients. |
| Estimate approvals | Valid decided approval review rounds, keyed by their immutable business/version identity; retries/send generations cannot multiply the same approval. | Period events at the persisted decision timestamp, respecting canonical lineage. |
| Design approvals | Valid approved Design review rounds, once per project/estimate/design-plan version. | Period events at the persisted decision timestamp. |
| Execution completions | Valid site/trade execution tasks, status completed, persisted `completedAt` in the window, resolved project/source lineage. | Same task population for headline/module/trend values; do not mix procurement or other workflow tasks. |
| Approved net revenue | Existing canonical approved-estimate portfolio subtotal excluding GST. | Current approved baseline snapshot, not cash received or period revenue. |
| Budget, recorded costs, remaining budget, current profit/margin | Existing canonical finance report and posted ledger classification. | Current snapshot; margin remains explicitly provisional/live. No invented historical values. |
| Recorded expenses in period | Valid currently posted ledger entries, bucket/project lineage checked, selected by `incurredAt`, integer paise. | Current/prior incurred-period amounts as known at observation time. Label “Recorded expenses,” not payment cashflow or posting-date activity. Backdated entries can revise a prior-period result. |
| Risk, overdue work, staffing, queues, KPI | Existing backend services/aggregates. | Keep their existing current/period semantics. Historical comparison is unavailable unless supported by an authoritative event series. |

Historical comparisons describe retained records as known at the observation time. They are not an audit snapshot of what the database contained in the past. Do not calculate an old client/project inventory simply by subtracting period creations from today's total.

Approval history must use immutable review provenance where present. Any legacy fallback must require an unambiguous persisted approval identity and timestamp, cannot double-count a matching review round, and must expose incomplete history when those facts are missing. A mutable status alone is insufficient for a historical approval claim.

Money stays in integer paise through all calculations, chart datasets, and comparison deltas. Formatting explicitly converts at display boundaries. Preserve GST exclusion, immutable approved baselines, expense classification, ledger-only overhead, and project/detail/portfolio reconciliation. Missing money is unavailable, never zero.

## Previous/current comparison contract

Retain `periodDays=7|30|90` and the existing UTC calendar-day basis. Default to 30 days with comparison enabled. Store the display comparison toggle in the URL; it does not change the server's metric definition.

- Compute one server `observedAt` per response.
- Current start: midnight UTC, `periodDays - 1` calendar days before the observation date. Current end: `observedAt`.
- Previous start and end: shift both current bounds backward by exactly `periodDays` UTC days. This matches elapsed duration and the partial final day. It deliberately excludes the unused remainder of the previous final day.
- Apply start-inclusive, end-exclusive boundaries consistently to the new comparison metrics and their displayed period totals/trends. Reconcile any existing inclusive-end aggregate feeding those same values.
- Return explicit bounds, `timezone: UTC`, and partial-day metadata. Show both ranges and note that the last day is partial; bucket labels must not silently shift to the browser's timezone.
- Align overlays by day index in each window, while tooltips and value tables show the actual date for both points.
- Return a complete ordered bucket set for each supported series, maximum 90 buckets per period. An absence of events is zero only after the source read succeeds. Unknown/missing history is null/unavailable and is drawn as a gap.

Return comparison values from the backend with `current`, `previous`, absolute `delta`, nullable percentage change in basis points, availability/reason, unit, and time basis. The frontend formats these fields rather than creating another business calculation.

Percentage rules: with a positive prior value, use `(current - previous) / previous`, with a documented integer-basis-point rounding rule. With prior zero and current positive, show “New” and the absolute change; with both zero, show “No change” and no invented percentage. With unavailable data, suppress the delta and comparison line with a concise reason. Higher expenses are neutral context, not automatically a green/red outcome; semantic direction depends on the metric.

Snapshot-only figures show “Current snapshot.” Their historical detail, when exposed, states “Historical comparison unavailable.” They receive no ornamental delta or sparkline.

## API, permissions, compatibility, and state

Extend `GET /api/v1/admin/dashboard/overview` additively with:

- `clients`: account partition, valid client/project relationship counts, and integrity/coverage status.
- `comparison`: previous bounds, matched-window metadata, typed event metric summaries, current/previous buckets, and per-metric availability.
- Explicit period completion totals where necessary to prevent reuse of all-time status counts.
- Source dependency/data-quality keys for all new metrics, including independent current/prior failures.

Keep existing response fields and module consumers compatible. If an older response lacks new sections, render “Not available” for those sections rather than inferring values. Update backend contracts, runtime request validation where needed, OpenAPI, frontend types, fixtures, and supported memory/Mongo paths together. Unsupported memory history remains explicitly unavailable.

| Actor | Global overview/client/comparison data |
| --- | --- |
| Sole active Super Admin with `admin.dashboard.read` | Allowed through the existing protected operation. |
| Admin, Client, worker, or any other role | Denied under the existing policy. |
| Missing, stale, inactive, or invalid identity | Existing non-disclosing authorization failure. |

Do not add frontend direct database access, user-directory bulk downloads, separate per-metric HTTP requests, or broader access rights. Client aggregates do not return contact details, emails, tokens, or private files. Use existing stable IDs for navigation and backend allow-listed filters for interactive drill-down. “Open user directory” may link to its current route; do not pretend it supports an unimplemented Client URL filter.

Keep the existing dashboard query root and period-aware keys. Client creation/role/activation/link changes and existing project/approval/workflow/finance mutations must invalidate the affected dashboard queries. URL period/tab changes must not display old-period values under new-period dates: loading/placeholder content either retains its original labels or is clearly suspended until the new result arrives. Late responses must not replace the current selection.

One source failure disables only dependent metrics. For example, a prior-period ledger failure must not erase current project totals or display a false zero expense delta. Base overview failure retains the established retry state. Failed background refresh keeps the last verified values with their original observation time and a visible stale message. Authorization loss must remove protected cached content according to established application behavior.

## ECharts integration and motion

Add Apache ECharts 6.x as a local frontend dependency during approved implementation, resolving a supported patch then. Use `echarts/core`, only required series/components, and a typed `ComposeOption` configuration. Start with SVG rendering for these bounded daily/category datasets; only add Canvas if measured behavior justifies it. Keep chart code in a lazy dashboard chunk so unrelated roles do not pay its initial download cost.

Reuse `ChartFigure` for semantic headings, descriptions, loading/unavailable/empty states, and equivalent value tables. A small React adapter owns init/update/resize/dispose, a `ResizeObserver`, event subscriptions, and media-query cleanup. It must tolerate Strict Mode remounts, hidden panels, rapid period changes, theme changes, and route exit/reentry. Only mount active-tab charts. Resolve CSS color/font tokens to actual renderer values rather than depending on raw CSS custom-property strings being understood inside chart rendering.

Register `UniversalTransition` alongside the existing modular features. Use stable series IDs and explicit data `name` values based on durable semantic identity: actual UTC date for time-series points and stable status/category keys for categorical data. Preserve the ECharts instance across period, metric, comparison, refresh, and view changes. The update strategy must allow ECharts to diff matching marks while explicitly removing obsolete series/components; a removed previous-period line must animate out and must not remain in the option model. User-provided labels stay text-safe in tooltips. DOM controls and links mirror chart interactions, so hover, legend clicks, or precise slice targeting are never the sole way to operate the dashboard.

The advanced transition choreography is:

1. **Growth and delivery:** changing metric or period smoothly interpolates matching daily points, redraws the line/area, and updates the axis without remounting the chart. Actual UTC date names match overlapping points; newly introduced dates enter with a restrained stagger and removed dates leave cleanly. Toggling comparison animates the previous line and points in or out while the current line remains spatially continuous.
2. **Client and financial bars:** verified refreshes animate bar length, stack boundaries, labels, and negative/positive financial direction from their prior values. Categories keep stable keys even when their value becomes zero. The UI never counts through false monetary values in semantic DOM.
3. **Project lifecycle:** add a compact native `Doughnut / Ranked bars` view control. Both views represent the same lifecycle snapshot and retain the same table and drill-down behavior. The plot morphs between pie sectors and bars through one stable series ID, stable stage names, and `universalTransition`; this is the intentional cross-series demonstration rather than a decorative chart switch.
4. **Module charts:** line, categorical, pipeline, waterfall, and composition charts use the same stable identity/update policy so tab data refreshes transform existing marks. Tabs still mount on demand and do not run transitions while hidden.
5. **Interaction continuity:** rapid repeated selection is interruptible and latest-state-wins. Hover/highlight state clears safely when a mark leaves. Route exit, renderer retry, theme changes, and reduced-motion preference changes cannot leave an animation loop, stale series, duplicated listener, or reinitialized chart instance.

| Trigger | Motion | Timing/interrupt behavior | Reduced motion |
| --- | --- | --- | --- |
| First verified chart data | Lines reveal; bars grow to measured values; doughnut sectors unfold; small index-capped stagger across categories | Approximately 650–800ms with `cubicOut`; stagger capped so total motion stays below one second; essential DOM values visible immediately. | Immediate final plot. |
| Period/metric/comparison change | Matching points and shapes interpolate by stable identity; added marks enter and removed marks leave | Approximately 500–700ms with `cubicInOut`; latest selection wins without chart reinitialization. | Immediate update. |
| Lifecycle view change | Doughnut sectors morph into ranked bars, and reverse, using `universalTransition` | Approximately 700–900ms; the control remains usable and a new selection interrupts toward the latest view. | Immediate view replacement. |
| Pointer/focus emphasis | Highlight selected series/category and show exact values | Immediate feedback or at most 120ms; no looping pulse. | Immediate feedback. |
| Background refresh | Preserve layout and transform only changed marks/labels | Approximately 450–650ms; no repeated whole-page entrance; announce successful refresh once. | Immediate update. |

Listen to `prefers-reduced-motion` in JavaScript as well as CSS. No count-up that temporarily displays false financial values, continuous animation, bar-race playback, decorative particles, or scroll hijacking. Use an animation threshold for unexpectedly large marks. Performance claims require measurement, not visual impression.

## Accessibility and responsive states

- Show chart title, unit, time basis, legend, and “Show values” control in semantic DOM.
- Register ECharts accessibility support and provide short descriptions. Keep the data table as the full equivalent; generated ARIA text alone is insufficient.
- Distinguish previous/current series with dash and labels in addition to color; use labels/patterns for categorical ambiguity. Preserve reserved risk colors.
- Meet WCAG 2.2 AA contrast targets and visible focus; validate actual rendered token combinations.
- Maintain logical reading/tab order, native controls, touch-friendly targets, and existing roving-focus navigation.
- At narrow widths reduce tick density while keeping all values available in the table. Tooltips remain within the viewport. Do not block vertical touch scrolling.
- Support initial loading, verified empty, all-zero activity, sparse single-point data, source unavailable, partial history, stale refresh, permission loss, large numbers, long labels, and negative financial headroom.
- Chart loading/render failure retains textual figures and the values table with a chart-specific retry/fallback, rather than blanking the dashboard.

## Acceptance criteria and verification evidence required

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | The first analytical content shows project and client totals, with financial figures carrying explicit basis/units. Overview is materially shorter and detailed modules remain reachable. | Rendered desktop/mobile overview in the full shell; existing navigation/payment flow checks. |
| AC2 | Every production value traces to the backend; no fixture/random/demo fallback, page-bounded aggregation, or fabricated zero. | API/service tests and frontend unavailable/empty cases; audit production imports against fixtures. |
| AC3 | Client counts deduplicate by ID and handle inactive clients, multiple projects, unlinked projects, wrong-role/missing references, invitations, and role changes correctly. | Memory/Mongo cases with at least two unequal clients, shared/multiple project links, and source failure. |
| AC4 | Period comparisons use matched UTC windows, correct partial-day boundaries, actual point dates, zero-prior rules, and independent availability. | Fixed-clock tests for 7/30/90 days, midnight/month/year boundaries, exact start/end events, future records, one-sided failure, and no data. |
| AC5 | Completed-project headline and trend share a period definition; current completed status is never labelled period activity. Approval events deduplicate immutable identities; execution scope is consistent. | Regression fixtures with old completions, missing timestamps, multiple approval generations/versions, unrelated task kinds, and broken lineage. |
| AC6 | Financial figures remain integer-paise calculations and reconcile to approved sources; incurred-date trends and current snapshots are correctly distinguished. | Two unequal approved projects, unequal ledger categories, GST, overhead, backdated/voided entries, overspend, missing lineage, and portfolio/detail/trend reconciliation. |
| AC7 | Existing authorization boundaries and non-disclosing failures remain intact; cache freshness covers new client dependencies. | Route authorization matrix, version/identity failure cases, mutation invalidation, period race/stale-data checks. |
| AC8 | Dashboard plots use real Apache ECharts with consistent tokens and advanced data transitions. Metric, period, comparison, refresh, and lifecycle-view changes preserve the instance and visibly interpolate matching marks; lifecycle doughnut/ranked-bar views morph through `UniversalTransition`. Unrelated screens preserve their chart contracts. | Browser exercise and recorded transition evidence for metric, period, comparison, refresh, lifecycle view, rapid interruption, tab changes, route reentry, resize, and negative/empty datasets; focused tests assert registered feature, stable series/data identity, no re-init, and obsolete-series removal. |
| AC9 | Charts are usable by keyboard/touch and readable without animation or charts. | Values-table parity, focus/accessible-name checks, reduced motion before/after load, chart-error fallback, contrast checks, 200% zoom. |
| AC10 | Charts are bounded and cleaned up; transitions remain responsive under rapid input and unrelated routes do not eagerly load the ECharts chunk. | Production bundle inspection; browser network/console and representative transition trace; repeated update/interruption/mount/resize/navigation checks; verify the added feature remains in the lazy chunk. |
| AC11 | Integrated repository validation passes with exact results recorded. | Focused dashboard/domain/API/finance tests, relevant Mongo replica-set integration suite, backend/frontend typecheck and builds, broader tests according to final contract changes, and `git diff --check`. |

Rendered QA target widths: 1440, 1024, 768, 390, and 360px, with at least one short landscape viewport and 200% zoom. Use synthetic isolated records for screenshots. Verify the full application shell as well as fixtures; the current fixture alone is insufficient.

The separate task plan will specify ownership, execution ordering, exact check commands, and parallel boundaries after this specification is approved. No plan or application implementation is included in this stage.

## Risks, compatibility, and operational limits

- **History completeness:** mutable state and retained records cannot prove every past snapshot. Explicit time-basis/availability is required; no backfill is proposed.
- **Client meaning:** registered accounts differ from project contacts and historical customer acquisition. Labels and identity rules above are part of the acceptance contract.
- **Aggregate cost:** previous-period reads approximately double the maximum event window. Use bounded server aggregation, avoid per-project queries and unbounded intermediate ID/date arrays, and measure representative Mongo execution. Any required new index must be documented before operational rollout; no production index migration is authorized here.
- **Concurrent writes:** one observation timestamp gives consistent bounds, not automatic transactional snapshot isolation across independent aggregates. Preserve existing semantics and avoid claiming a point-in-time database snapshot; use shared event projections for displayed totals and their series where possible.
- **Financial interpretation:** recorded spend is neither cashflow nor inherently bad; live profit is not realized profit. Preserve precise labels and neutral expense deltas.
- **Chart regressions:** ECharts adds download/render cost and instance lifecycle responsibilities. Restrict imports, mount visible content, preserve tables, and verify the integrated result.
- **Compatibility/rollback:** additive API fields allow an older dashboard client to continue operating. An absent new section is unavailable to a newer client. Application rollback requires no data rewrite. No new persistence state or external side effects are introduced.
- **Observability:** reuse safe aggregate failure/data-quality reporting and the observation timestamp; do not log raw client records or ledger descriptions. No new third-party telemetry.

## Assumptions and open decisions

Proposed defaults for approval are: Super Admin scope; existing light Lisno branding; 30-day default with comparison enabled; UTC reporting retained and made visible; clients mean registered Client-role accounts; no historical snapshot storage. These follow current architecture and can be changed through specification feedback.

No additional product decision blocks specification approval. Exact ECharts patch, chart heights, and token-derived contrast refinements are implementation details to verify after the gates. Live database reconciliation remains unverified until an authorized development/test dataset is available; this specification does not claim actual business counts.

## Apache ECharts research

Official sources reviewed on 2026-09-20:

- [ECharts 6 features](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/): current major-version features and presentation capabilities. Use the existing product palette rather than inheriting a new default brand.
- [Modular imports and TypeScript](https://echarts.apache.org/handbook/en/basics/import/): register only required charts/components/renderers and type options with `ComposeOption`.
- [Dataset](https://echarts.apache.org/handbook/en/concepts/dataset/): separate chart configuration from reusable data dimensions.
- [SVG versus Canvas](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/): choose the renderer according to data volume, memory, and device behavior; SVG is the proposed starting point for this bounded dashboard.
- [Data transitions](https://echarts.apache.org/handbook/en/how-to/animation/transition/): stable data identity, entry/update timings, and animation disabling/thresholds support the proposed behavior.
- [Universal Transition](https://echarts.apache.org/handbook/en/basics/release-note/5-2-0/): register the modular feature, associate changing series through stable IDs, and morph the lifecycle chart between doughnut and bar views.
- [Accessibility](https://echarts.apache.org/handbook/en/best-practices/aria/): explicit AriaComponent registration, descriptions, and pattern cues complement the required DOM tables.

Applied design guidance: `lisno-implementation-planner`, `advanced-ui-design`, and `web-motion-design`. The specification approval boundary comes from repository `AGENTS.md`, which says: “Create or update only the durable specification” and “Do not create the task plan or implement code.”

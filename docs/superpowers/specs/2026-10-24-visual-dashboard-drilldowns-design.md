# Super Admin visual dashboard and click-through details

Date: 2026-10-24
Status: Approved and implemented; local verification completed on 2026-10-24.
Classification: Substantial frontend redesign; existing API and workflow contracts retained.

## Goal

Replace the nine visible dashboard tabs with one visual dashboard following the user's latest screenshot. Metrics, chart segments, module rings, workforce roles, and operational summaries become the entry points to relevant details. Preserve the approved rule that unavailable summary metrics and their diagnostic messages stay hidden.

The latest reference supersedes the previous dashboard composition. Use real Lisno labels and values, as previously requested; the screenshot's numbers, percentage changes, city counts, and project images are examples, not application data.

## Current behavior and evidence

- `frontend/src/features/admin/dashboard/SuperAdminDashboardPage.tsx` mounts `DashboardNavigation`, switches content using the existing `tab` URL parameter, and already owns period, comparison, refresh, export, project filters, workforce filters, and paginated queries.
- `DashboardNavigation.tsx` renders desktop tabs and a mobile section selector. `DashboardOverview.tsx` places much of the portfolio information inside a secondary disclosure. The new design promotes supported visual summaries to the main dashboard.
- `superAdminDashboardApi.ts` and `backend/src/contracts/super-admin-dashboard.ts` expose current project/finance/module/workforce/risk aggregates, daily event buckets, and previous-period comparisons for specific events. Periods are 7, 30, or 90 days.
- Available comparison events are project/client creation, project/task completion, estimate/design approvals, and recorded expenses. Previous lifecycle distributions and historical approved-value/margin snapshots are absent.
- Project rows have free-text locations, but the overview has no portfolio geography aggregate or coordinates. It has no lead-to-execution transition counts, project-photo field, six-month financial series, or daily expense-class breakdown. A paginated record list cannot supply portfolio totals for these visuals.
- `DashboardProjectDrilldown.tsx`, `DashboardWorkforceDrilldown.tsx`, and the backend already support stable project status, module, risk, worker-role, sorting, and pagination filters. The projects module does not support an exact live-overdue filter; schedule-risk filtering is broader and must be named accordingly.
- `DesignPaymentConfirmations.tsx` owns a permission-gated payment queue query and existing mutation safeguards. Vendor requests have their own permission-gated count and retry flow.
- The worktree contains the prior approved dashboard changes plus unrelated work. Preserve both; capture the new target baseline before implementation.

## Design and interaction requirements

### Visual composition

Use the reference's hierarchy: five prominent metrics, large analytical charts, module and workforce visuals, then activity, priority projects, and compact operational actions. Keep the existing app shell, export action, refresh, period control, and typography. Use ivory/sage surfaces, deep green emphasis, restrained ochre for distinct measures, and red only for risk or overdue states.

Match the reference's analytical density, chart proportions, prominent numerals, segmented rings, and clear legends. Use the existing ECharts/SVG approach, crisp panel borders, and subtle chart-area shading. Respect existing styling constraints: no new Lucide icons, glass effects, drop shadows, glowing rings, harsh gradients, fake imagery, decorative trend lines, or hover movement. Decorative backgrounds must not look like measured data. No WebGL or new charting framework is required.

| Visual | Authoritative content | Interaction |
| --- | --- | --- |
| Five headline metrics | Total projects, approved net value excluding GST, approved contract value including GST, current margin excluding GST, live overdue projects | Projects opens project details; finance metrics open finance details; overdue opens clearly titled schedule-risk details sorted by deadline, without claiming an exact overdue-only result |
| Project activity trend | Daily projects created/completed, with accurate date axis and optional previous-period event series | Point selection reveals exact dated values; a visible projects action opens records |
| Project lifecycle distribution | Planning, active, on hold, completed; total and shares only when the categories reconcile | Segment or matching legend action opens projects filtered by the stable lifecycle status |
| Period activity comparison | Current/previous backend event counts, with labels such as projects created and projects completed | Relevant series action opens project, estimation, design, or execution details; date values remain inspectable locally |
| Financial overview | Recorded expenses over the supported period plus verified current budget, cost composition, and remaining amount | Opens finance details; exact values retain full currency precision |
| Module progress | Existing estimation approval counts and design/procurement/execution ratios | Each named ring/count opens its module details |
| Workforce summary | Active workers and backend role distribution; ring only when the whole reconciles | Total opens workforce; role row opens workforce filtered by the stable role ID |
| Project activity heatmap | Daily projects-created counts from existing buckets, explicitly labelled; zero and unknown are distinct | Keyboard/pointer selection reveals that day's exact available counts; no invented date-filtered record query |
| Priority projects | Existing five-record risk-sorted query, backend risk, real project name/status | Open the authorized project destination by ID; no stock project photographs |
| Risk and response actions | Backend risk counts and separately labelled pending Client/design response counts | Open supported risk filters and authorized existing response/review destinations |
| Initial payment action | Existing payment queue, with count labelled to match the queue's actual items | Opens the existing confirmation workflow in the finance detail view; no mutation from the summary |
| Vendor classification requests | Existing authorized count, loading/error/retry behavior | Existing vendor-review destination |

Do not sum different approval queues into an invented unique-project total. Only display payment/response counts that accurately describe the underlying queue. Preserve any other existing operational action through an appropriate visible action entry or detail view.

Unsupported geography, lead-flow/Sankey, previous lifecycle snapshots, six-month financial history, and category-by-date financial layers stay absent. Reflow the surviving panels; no unavailable placeholders or technical warning wall. The comparison panel is labelled **Period activity comparison**, since it compares recorded events rather than historical project-state populations.

### Navigation and details

- Remove the visible tab bar and mobile section selector. Default `/admin/dashboard` is the visual overview.
- Clicking a visual opens a focused detail view within the existing dashboard route. Reuse the current `tab` query values internally to preserve existing bookmarked URLs, filters, and cache identities. Detail views have a contextual heading and **Back to dashboard** action, with no replacement tab strip.
- Prefer this existing route-based detail behavior over a new modal/drawer system: it supports long tables, mobile, browser history, and direct links with less new machinery.
- Preserve reporting period and comparison settings through transitions. New drilldowns reset unrelated filters and pagination. Browser Back/Forward must restore the selected view and filters.
- Lifecycle, risk, module, and workforce actions use the filters already supported by the backend. Do not silently send unsupported parameters or filter only the loaded page to imitate a portfolio result.
- Detail views reuse the current summaries, charts, search/filter controls, pagination, project links, and payment forms where relevant. Clicking an aggregate never changes financial or workflow data.
- Move focus to the detail heading on activation. Returning restores the originating visual's focus and scroll position when possible, falling back to the dashboard heading for direct links. Chart actions have equivalent labelled DOM controls; tooltips are supplementary.
- A card containing multiple controls is not wrapped in a nested link/button. Use a distinct title/action and individually operable chart/legend items.

### Data and state rules

- Keep current snapshots separate from period events. Do not attach project-creation changes to total-project snapshots, expense changes to approved contract value, or any fabricated KPI percentage/trend. Missing comparisons do not hide a valid current value.
- Financial inputs remain integer paise. Compact lakh/crore labels may be used for headline space, with full exact values available to accessible text/value tables and exports. No new financial calculations or revenue definition.
- Reuse the current availability selectors. Preserve valid zero and negative amounts; hide null/unavailable summary values. Incomplete distributions show verified bars rather than false percentages. Retain time-series gaps.
- The overview needs only existing summary, priority-project, authorized queue, and payment-query data. Fetch module/workforce detail records on demand. Do not load every project page to manufacture missing analytics.
- Permission checks and backend enforcement remain unchanged. Chart availability does not grant navigation or mutation rights.
- Retain visible actionable loading, stale-refresh, request-error, permission, and retry states, including vendor/payment failures. No return of the concatenated source-diagnostic banner.
- Keep export provenance, partial-data diagnostics, observation dates, filter scope, and pagination honest. The overview export should cover the implemented overview visuals; detail exports stay scoped to their current view. Unsupported/absent data is never exported as zero.

### Responsive and accessibility behavior

At wide desktop widths, follow the reference's five-metric row and multi-column chart arrangement. At laptop/tablet widths, reduce columns based on readable content. At 360px, stack analytical panels and keep touch controls legible; do not shrink the entire reference image or require horizontal page scrolling. Missing panels must not leave empty slots.

Use meaningful headings/regions instead of orphaned `tabpanel` semantics after tab removal. Provide keyboard actions, visible focus, exact chart-value access, text labels in addition to color, reduced-motion support, and appropriate status announcements. Do not animate or rebuild all charts on selection of unrelated details.

## Scope and integration

Primary affected areas: `SuperAdminDashboardPage`, `DashboardOverview`, `DashboardNavigation`, dashboard-local metric/chart presentation and report tables, scoped dashboard CSS, related tests, and the existing synthetic QA entry. The payment component may expose an additive compact summary using its existing query if needed; existing form behavior and other consumers remain unchanged.

No backend/API/schema/authorization changes, new persistence, map/geocoding service, dependencies, migrations, seeds, production actions, or unrelated shell redesign. Existing URL values/types can retain their internal names even though the UI no longer presents tabs. Rollback is limited to restoring this frontend slice against its captured baseline.

## Assumptions, decisions, and risks

- The new screenshot controls the overview's visual hierarchy; the previous request to use real Lisno data and hide unavailable summaries still applies.
- Details replace the overview in the same route rather than opening a new browser tab or overlay. This is the recommended interaction and will be explicit in the approved specification.
- Existing 7/30/90-day data windows remain the source of chart controls. No unsupported month selector or six-month option is presented.
- Main risks are misleading comparisons, inaccessible chart-only navigation, lost filter/history state, and payment/vendor workflow regressions. Reuse existing contracts and verify these paths directly.
- No unresolved business-data decision is required for this frontend scope. Adding omitted analytics later would require a separately defined backend source and aggregation contract.

## Acceptance criteria and verification

1. The default dashboard follows the new visual hierarchy, exposes supported panels without a secondary disclosure hiding the main dashboard, and has no desktop tabs/mobile section selector.
2. Every displayed navigation affordance opens its documented relevant detail or exact values. Each of the eight prior non-overview areas has a mapped visual/action when its supporting data is available; direct legacy dashboard URLs remain accessible independently of summary availability, and browser Back/Forward continue to work.
3. Metrics, comparisons, charts, and exports use the supported real sources above. Unavailable summaries disappear without empty wrappers; valid zero, signed finance values, incomplete distributions, and date gaps remain correct.
4. Lifecycle/role/risk/module filters, query isolation, pagination, focus/scroll return, and reporting-period changes behave correctly. Detail requests are lazy and use stable IDs and existing API filters.
5. Vendor review, payment confirmations, permission checks, retry/stale/error states, and export diagnostics retain their current behavior. The overview introduces no new mutations.
6. Visually inspect synthetic complete, partial, all-hidden, empty, and error states at 1440px, a laptop/tablet breakpoint, and 360px. Exercise pointer and keyboard entry/return, exact values, exports, and accessibility checks. Run focused dashboard/payment/routing tests, frontend typecheck/build, and repository hygiene checks; broaden only if a shared regression warrants it.

This document is the specification only. A separate dependency-ordered task plan follows approval; implementation begins after the repository's remaining gates.

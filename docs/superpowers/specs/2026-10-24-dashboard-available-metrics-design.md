# Dashboard: show available metrics only

Date: 2026-10-24
Status: Approved and implemented on 2026-10-24.
Classification: Bounded frontend presentation change across the existing dashboard components.
Related specification: [Super Admin dashboard redesign](2026-10-23-super-admin-reference-dashboard-design.md).

## Goal

Remove the long “Some dashboard metrics are unavailable” warning shown in the user's screenshot. Show verified, available metrics in the Super Admin dashboard summary sections, omitting unavailable metric items and their diagnostic placeholder copy.

This supersedes the earlier redesign's requirement to display unavailable summary metrics with explanations. Financial correctness, authorization, and the existing dashboard design remain required.

## Current behavior and evidence

- `SuperAdminDashboardPage.tsx` renders a warning whenever the overview response is partial and concatenates every `dataQuality.issues[].message`. Repeated backend lineage issues therefore fill the page with repeated text.
- `DashboardMetricStrip.tsx` renders every supplied metric, including unavailable entries. `DashboardTabSummary.tsx` does the same in supplementary metrics and renders unavailable coverage reasons.
- `DashboardOverview.tsx` has separate finance, Client, workforce, module-progress, lifecycle, and action-count summaries that also render unavailable placeholders.
- `DashboardDataChart.tsx` exposes unavailable chart totals/categories and verbose partial-source reasons. Existing chart datasets already distinguish verified values, nulls, incomplete populations, and fully unavailable sources.
- Availability is supplied through backend metric keys, optional Client/comparison states, and nullable ratios. Numeric zero is a valid value and must not be treated as missing.

## Scope and requirements

1. Remove the global partial-metrics warning and its repeated source-error text. Do not replace it with another warning banner.
2. Apply available-only presentation to headline and supplementary summary metrics across all nine dashboard tabs, including summary counts, ratios, and progress indicators in Overview. Omit unavailable values and their explanatory placeholders.
3. Keep a valid snapshot metric visible when only its comparison or supporting detail is unavailable; omit only that unavailable detail. Preserve valid zero, negative financial amounts, and genuine zero-percent values.
4. Omit fully unavailable summary charts and their surrounding panels. For partially available charts, retain verified data, omit unavailable categories/series and totals from visible summaries, and preserve gaps in time series. Do not connect missing points or convert them to zero.
5. Do not portray an incomplete population as a complete donut or compute percentages against the remaining subset. Use the existing honest bar presentation for incomplete distributions, without lengthy technical diagnostic copy. Exact-value disclosures show available entries; unknown cells in otherwise useful time-series rows use a neutral empty-cell marker rather than fabricated values.
6. Let surviving metrics and panels fill their section responsively. Omit an empty summary section or disclosure instead of leaving empty cards, an inaccurate item count, or an unavailable-data message. Keep available navigation, filters, records, and operational actions usable.
7. Preserve request loading, refresh failure, permission loss, and retry behavior. These are actionable request states, distinct from an unavailable metric. Keep existing project/workforce record-table handling where removing a cell could hide material record context. Do not change payment-confirmation or vendor-review workflows.
8. Keep backend data-quality flags and source validation intact. CSV section metadata continues to record partial/unavailable sources and accurate scope; hiding screen diagnostics must never relabel a partial response as complete. Do not replace missing financial data with fallback figures.

## Assumptions and non-goals

- “This section” refers to dashboard summary metrics and analytics, including the equivalent summaries in its tabs, not every unavailable field elsewhere in Lisno.
- This is a presentation change. Repairing historical lineage, changing backend calculations or APIs, altering permissions, changing record-table workflows, or running migrations is out of scope.
- No new dependencies, deployment, staging, or commits are required.
- The worktree contains the previous dashboard redesign and unrelated security work. Preserve both; inspect the current per-target diff before any implementation writer starts.

## Risks and mitigations

- Hidden metrics could incorrectly suppress valid zero or negative values: derive availability from explicit source state and nullable inputs, not value truthiness.
- Partial charts could imply false totals or percentages: keep the existing population-completeness safeguards and test unequal known values with a missing category.
- Fewer panels could create awkward gaps: verify one, two, and no available metrics/charts at desktop and narrow widths.
- Backend problems remain unresolved by this UI change: retain diagnostic metadata and truthful availability in export and API contracts.

## Acceptance criteria

- AC1: A partial response with many repeated issues produces no global metrics warning or repeated diagnostic paragraph.
- AC2: Unavailable summary metrics and fully unavailable charts are absent; available metrics and valid zero/negative values remain visible across all nine tabs.
- AC3: Missing comparison detail does not remove an otherwise available metric; incomplete chart data never creates fabricated values, totals, or shares.
- AC4: Remaining content reflows without empty panels, empty disclosures, or page overflow at 1440px and 360px.
- AC5: Request errors/retries, permissions, record tables, operational actions, and CSV diagnostic accuracy remain intact.

Verification will use focused presentation/page/chart/export regressions, TypeScript and build checks, and rendered partial-data scenarios. No behavior-changing implementation or task-plan document is included at this gate.

## Open decisions

None. The available-only summary behavior above is the proposed interpretation of the user's requested correction.

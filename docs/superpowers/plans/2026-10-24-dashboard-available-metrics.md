# Dashboard available metrics: task plan

Date: 2026-10-24
Status: Completed and verified on 2026-10-24.
Approved specification: [Show available dashboard metrics only](../specs/2026-10-24-dashboard-available-metrics-design.md).
Approval record: The user approved the specification on 2026-10-24. This approval supersedes its original awaiting-approval status line; requirements are unchanged.
Execution mode: A, selected by the user after specification and task-plan approval.

## Outcome and boundaries

Remove the large partial-metrics warning and show only available dashboard summary metrics and analytics. Preserve valid zero/negative values, partial-chart correctness, request failures/retries, permissions, record tables, operational actions, and truthful export diagnostics.

Changes are limited to the frontend dashboard feature, its tests, and the existing synthetic dashboard QA entry if additional states are needed. No backend, authorization, finance formula, shared chart engine, package, record-table workflow, or production changes are planned. Keep one parent implementation task in progress.

## Ownership

Paths below are relative to `frontend/src/features/admin/dashboard/` unless stated otherwise.

| Owner | Exclusive write scope | Responsibilities |
| --- | --- | --- |
| Primary | `dashboardViewModel.ts` and tests; `dashboardPresentation.ts` and tests if necessary; `DashboardMetricStrip.tsx`; `DashboardTabSummary.tsx`; `SuperAdminDashboardPage.tsx` and tests; `super-admin-dashboard.css`; existing `frontend/src/test/fixtures/superAdminDashboardQaEntry.tsx`; this plan | Shared availability contract, page banner, summary presentation, CSS, integration, final verification |
| Chart slice | `dashboardChartData.ts` and tests; `DashboardDataChart.tsx`; `DashboardModuleCharts.tsx` and tests; `ExecutiveDashboardCharts.tsx` and tests; dashboard-local chart tests if needed | Available-only chart view, intact time gaps and population safeguards, parent panel/disclosure visibility |
| Overview slice | `DashboardOverview.tsx` and its tests | Finance, Client, workforce, lifecycle, module and action-count summaries; conditional Overview wrappers |
| Integrity reviewer | Read-only | Financial/availability semantics, unknown-versus-zero handling, permissions, export metadata and source preservation |
| Verification runner | Read-only product sources; temporary logs allowed | Final focused checks, typecheck/build and hygiene after source writers finish |

In Mode A, chart and Overview slices can run in parallel only after the primary settles their shared interfaces. Each writer must preserve existing dashboard changes and unrelated work, avoid other owners' files, and report cross-boundary needs. In Mode B, the primary performs the same work sequentially without implementation subagents.

## Dependency-ordered tasks

### T0. Preserve the current implementation and capture baseline

Owner: Primary. Dependencies: Approved plan and execution-mode choice. Criteria: AC1–AC5.

- Capture the current dirty-path set, scoped diffs, and copies of affected untracked dashboard files in a task-specific temporary directory before edits. The existing redesign is the baseline, not code to revert.
- Run the focused dashboard/payment tests and capture the current partial-data screen at desktop and narrow width.
- Confirm the warning source and consumers of shared metric/chart data, including CSV export. Identify current baseline failures without changing unrelated areas.

### T1. Establish explicit availability and visible-summary rules

Owner: Primary. Dependency: T0. Criteria: AC2, AC3, AC5.

- Normalize metric availability from backend unavailable keys, nullable ratio values, optional Client states, and missing fields. Never use numeric truthiness or display text as the source of truth.
- Keep primary value availability separate from comparison/supporting-detail availability. A valid snapshot stays visible even when its comparison is missing.
- Define reusable available-only selectors for the screen while retaining raw diagnostic/report data. Preserve stable keys, integer-paise inputs, signed amounts, UTC context, and valid zero.
- Settle the chart presentation contract with the chart slice before parallel work: a view may omit a dataset, category, series, total, or detail, while retaining original completeness information and stable activation IDs.
- Add focused cases for missing Client/comparison fields, unavailable parent keys, zero-denominator ratios, valid zero, and negative finance values.

### T2. Implement available-only charts

Owner: Chart slice. Dependency: T1. Parallel-safe with T3. Criteria: AC2–AC5.

- Prepare a display view from the verified dataset without mutating backend data or export source metadata. Omit fully unavailable datasets and unavailable category/series labels and totals.
- Preserve null gaps and date positions in surviving time series; do not join across gaps or turn unknown observations into zero. Keep legitimate empty-history states distinct from unavailable sources.
- Decide incomplete-donut fallback before filtering categories so removing an unknown category cannot falsely restore completeness. Render known values as bars with no inferred percentage shares or subset total.
- Update exact-value disclosure to match displayed data, using a neutral empty-cell marker only within otherwise useful rows. Suppress lengthy technical source messages in visible summary charts.
- Filter chart lists before creating `Surface` wrappers; omit empty analysis disclosures and expose panel counts for responsive layout. Preserve tooltips, keyboard navigation, stable activation targets, signed-amount behavior, and reduced motion.
- Test two unequal known categories plus an unavailable category, all unavailable, valid zero, missing total, mismatched total, and a partly missing multi-series timeline. Assert CSV quality diagnostics remain truthful.

### T3. Update Overview and tab summaries

Owners: Overview slice for its file; Primary for shared strip and tab summary. Dependency: T1; integrate chart visibility after T2. Criteria: AC1–AC5.

- Filter headline and supplementary metrics using explicit availability. Recalculate visible disclosure counts and omit empty sections.
- Apply the same rule to Overview finance/Client/workforce facts, ratios and progress rows, lifecycle/module summaries, and unavailable action counts. Preserve available navigation and valid zero-count rows.
- Keep vendor-count loading/error/retry behavior and payment confirmations unchanged. Do not remove operational actions simply because a summary metric is absent.
- Suppress unavailable comparison/coverage details without suppressing a valid primary value. Avoid showing diagnostic-only partial-response content in the summary.
- Remove empty Overview chart/card wrappers and the portfolio disclosure when it has no useful visible content.
- Remove only the global concatenated metric-warning banner from the page. Preserve actionable request-error, stale-refresh, permission, and record-table states.

### T4. Integrate layout and report safeguards

Owner: Primary. Dependencies: T2 and T3. Criteria: AC1–AC5.

- Adapt dashboard-scoped grids for one, two, or more surviving metric/panel items while retaining the established visual hierarchy and mobile stacking.
- Verify that hiding chart/summary copy does not clear `dataQuality`, mark partial responses complete, fabricate totals, or remove export section provenance. Keep export observation/fetch timestamps and failure states intact.
- Update affected page tests from unavailable-placeholder assertions to absent-metric assertions, retaining independent record-table/error assertions.
- Add synthetic QA states for mixed availability, all summaries unavailable, and missing comparison detail if existing fixtures cannot cover them.

### T5. Review and verify the integrated change

Owners: Integrity reviewer, then Verification runner in Mode A; Primary sequentially in Mode B. Dependency: All writers finished. Criteria: AC1–AC5.

- Review availability handling, ratio denominators, chart gaps, incomplete populations, source preservation, and permission-sensitive operational content. Fix confirmed issues before final verification.
- Run `cd frontend && npm test -- src/features/admin/dashboard src/features/finance/DesignPaymentConfirmations.test.tsx`.
- Run the two dashboard routing cases in `src/app/router.test.tsx` if headings/regions or empty-dashboard structure change.
- Run `cd frontend && npm run typecheck`, `cd frontend && npm run build`, and `git diff --check`.
- Render all nine tabs with partial metrics at 1440px and 360px. Inspect one/all hidden summaries, one surviving chart, valid zero values, missing comparison detail, exact-value disclosures, keyboard access and overflow. Run dashboard accessibility scans.
- Exercise at least one request failure/retry and one partial-data CSV download to distinguish metric omission from hidden operational errors or altered export status.
- Review final diff/status against the baseline. Report exact checks and remaining limitations. There is no lint script. Backend/OCR/native-mobile suites are outside this frontend-only change; broader frontend tests are warranted only if integration reveals shared behavior outside the dashboard. The previous full run's unrelated failures are background evidence, not a current pass/fail claim.

## Acceptance trace

| Criterion | Evidence |
| --- | --- |
| AC1 | Page regression with repeated issues; rendered partial response lacks the global warning and technical diagnostic paragraph. |
| AC2 | Metric/Overview/chart tests cover unavailable, zero, negative, one-visible and all-hidden cases across the nine-tab mapping. |
| AC3 | Current snapshots survive missing comparisons; incomplete distributions have no false shares; timeline gaps remain null. |
| AC4 | Desktop/narrow screenshots and overflow checks show no empty wrappers or stale disclosure counts. |
| AC5 | Existing permission/payment/query/error coverage remains green; record table behavior preserved; downloaded CSV retains partial-source metadata. |

## Completion evidence

- All five implementation/review tasks completed within the approved frontend scope. Removed the global warning, filtered unavailable summaries/charts, omitted empty panels, and preserved legitimate zeros, signed amounts, line gaps, record tables, request failures, and raw CSV diagnostics.
- Focused dashboard/payment regression: 226 tests across 19 files passed. Dashboard routing: 2 passed, 137 unrelated cases skipped. Frontend typecheck, production build, and `git diff --check` passed. Build reports existing large-chunk warnings; no lint script exists.
- Rendered partial-data checks covered all nine tabs at 1440px and 360px with no horizontal page overflow or unavailable headline placeholders. Visually inspected desktop Overview, mobile Procurement, all-hidden summaries, and a single surviving chart. Verified missing optional Client/comparison data, chart values, full-error retry, and partial-data CSV diagnostics. Desktop/mobile Overview accessibility scans reported zero violations.
- Independent integrity audit found no concrete regressions against the captured follow-up baseline. Final verification ran after all writers finished.
- Temporary baseline, focused logs, screenshots, CSV and follow-up diff: `/tmp/lisno-available-metrics/`. No dependencies, backend changes, production mutations, migrations, commits, or deployment. Full unrelated frontend/backend/OCR suites were not rerun for this bounded change.

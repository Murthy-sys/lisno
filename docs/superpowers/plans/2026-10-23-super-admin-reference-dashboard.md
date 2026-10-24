# Super Admin dashboard reference redesign task plan

Date: 2026-10-23
Status: Implementation finished; scoped checks pass. Full-suite failures outside dashboard scope remain documented below.
Specification: [Approved dashboard redesign specification](../specs/2026-10-23-super-admin-reference-dashboard-design.md)
Approval record: The user approved the specification and task plan, then selected Mode A. Approved requirements are unchanged.
Execution mode: A, parallel native subagents, selected by the user on 2026-10-23.

## Outcome and boundaries

Deliver the approved reference composition on Overview and a coordinated redesign of Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk. Use actual Lisno metrics, a functional local CSV export, existing permission checks, and responsive web layouts.

This plan changes the frontend dashboard feature and its tests/QA fixtures. It does not change backend contracts, finance calculations, authentication, permission policy, native mobile, other sidebar pages, packages/lockfiles, payment workflows, or production data. Existing chart infrastructure and Poppins typography remain in use.

The primary agent owns the integrated result, shared presentation contracts, query ownership, CSS, and final verification. Keep one parent implementation task in progress. The independent slices below are children of that parent, not separate competing changes.

## Initial evidence and preservation

- `SuperAdminDashboardPage.tsx` currently owns tab/period/filter state, summary cards, overview and detail queries, refresh, and payment sections. Its overview does not currently fetch project rows.
- Existing `dashboardKeys.projects(periodDays, filters)` already distinguishes bounded priority-project reads from detail pages. No API change is needed.
- `DashboardEChart` already supports line/bar/pie rendering, keyboard datum inspection, retry, lazy loading, responsive sizing, and reduced motion. Its `motion="disabled"` option can suppress nonessential transitions without changing global animation policy.
- `ChartFigure` supplies exact-value disclosure. Its shared table icon can be hidden within dashboard-scoped styling while preserving the text button; do not change unrelated charts to satisfy the dashboard icon direction.
- Vendor classification counts have existing loading, stale, retry, polling, and invalidation behavior. Payment confirmations have existing permission, version-conflict, and idempotency coverage. Preserve these behaviors.
- The worktree already contains unrelated security changes, including frontend package files, authentication, `src/api/client.ts`, and `src/test/setup.ts`. Dashboard feature paths, its QA fixture, and inspected chart/payment source paths currently have no diff. Recheck before implementation; do not assume that stays true.

Before any writer begins, capture the full dirty-path set and per-target diff in ignored temporary output, using a task-specific directory such as `/tmp/lisno-super-admin-reference-dashboard/`. Do not stage or modify unrelated files. Newly dirty targets require an explicit ownership reconciliation within the team; they must not be overwritten.

## Ownership and interfaces

All dashboard-relative paths below are under `frontend/src/features/admin/dashboard/`. New filenames are proposed bounded extraction points, not a requirement to create unnecessary abstractions.

| Owner | Exclusive write boundary | Read-only dependencies |
| --- | --- | --- |
| Primary | `SuperAdminDashboardPage.tsx` and its test; `DashboardNavigation.tsx`; `DashboardProjectDrilldown.tsx`; `DashboardWorkforceDrilldown.tsx`; `super-admin-dashboard.css`; `dashboardPresentation.ts` and its test; new `dashboardViewModel.ts` and test; new `DashboardMetricStrip.tsx`; new `DashboardTabSummary.tsx`; `dashboardFixtures.ts`; QA entry and HTML; this plan | Approved spec, existing API types, query helpers, permission helpers, shared components, finance/payment and vendor-count hooks |
| Overview slice | `DashboardOverview.tsx`; new `DashboardOverview.test.tsx`; new `DashboardPriorityProjects.tsx` and test if extraction is useful; `VendorClassificationRequestQueueItem.tsx` and its test | Shared model/components/classes established by primary; chart exports established by chart slice; query state supplied by primary |
| Chart slice | `ExecutiveDashboardCharts.tsx` and test; `DashboardModuleCharts.tsx` and test; `echarts/DashboardModuleECharts.tsx`; new dashboard-local chart adapter/helper files and their tests if needed | Shared datasets, existing `DashboardEChart`, `ChartFigure`, theme tokens, existing finance formatters |
| Export slice | New `dashboardReportExport.ts` and `dashboardReportExport.test.ts` | Shared view data, query-state metadata contract, existing API types and formatters |
| Integrity reviewer | No source writes | Integrated diff, approved specification, tests, query/data/permission lineage |
| Verification runner | No product source writes; may generate ignored test/QA artifacts | Integrated worktree after fixes, verification commands, synthetic browser harness |

The primary also owns any narrowly necessary change to shared dashboard chart runtime files, API helper tests, or invalidation tests. Other writers must report the need rather than edit outside their boundary. Shared global chart components, styles, package files, backend files, and existing payment-workflow source are not assigned for modification.

### Contract to settle before parallel writers

1. Define small typed presentation helpers for the specified metrics, chart datasets, exact-value rows, and availability reasons. Use existing backend response types and existing financial formatting. Avoid a generic dashboard framework.
2. Every plotted value must have a matching exact-value row. Export consumes the same prepared datasets, rather than reconstructing a second definition of the metric.
3. Keep underlying amounts in integer paise and percentages in backend basis points until display/export boundaries. Preserve stable IDs, UTC dates, nulls, and unavailable reasons.
4. Separate live snapshot totals from selected-period event values. Optional legacy Client/comparison fields remain safe to read.
5. Define Overview props for priority-project query state, permitted action rows, and vendor-count state. Query ownership remains in the primary page so Overview and export observe the same data. Preserve the existing vendor-count hook's cache, polling, invalidation, and retry behavior with a single owner.
6. Export input includes the active tab, requested/resolved period, comparison setting, current filters and pagination, each section's observed/fetched context, and loading/stale/unavailable states. Missing observation time must stay unknown, never be borrowed from a different response.
7. Establish shared CSS class names, metric-strip props, and chart export names before writers start. Keep existing component interfaces where they already fit; publish any new interface in code and share it with all dependent writers.

## Dependency-ordered tasks

### T0. Capture baseline and prepare verification

Owner: Primary. Dependencies: Approved plan and selected execution mode. Acceptance criteria: AC3, AC6, AC8, AC10.

- Capture dirty paths and target diffs; read any new target changes before assigning ownership.
- Inspect current dashboard tests and capture a synthetic desktop/narrow baseline through the existing QA entry and AppShell.
- Run the focused existing dashboard/payment/vendor checks listed below. Record baseline failures without modifying unrelated security work.
- Confirm a local browser controller is available and determine the usable fixture states and URL query parameters. Keep QA local and synthetic; do not authenticate to production or record real user data.
- Record baseline chart mounts/network activity while navigating tabs, so accidental eager data requests or duplicate polling are detectable.

Exit evidence: Known pre-existing failures, baseline screenshots, initial dirty-path record, and verified bounded ownership. This task does not change product behavior.

### T1. Establish shared presentation and reporting inputs

Owner: Primary. Dependencies: T0. Acceptance criteria: AC1, AC2, AC3, AC7, AC8.

- Extract the current `TabSummary` metric definitions from the page into focused helpers and a dashboard-local summary component. Preserve every existing secondary metric and module-coverage explanation.
- Define the approved four primary metrics for each tab and the remaining metrics for a compact disclosure.
- Prepare shared chart/exact-value datasets covering expense activity, Client account states, project lifecycle/throughput, module statuses/approval throughput, procurement spend, finance cost composition/budget, execution states/trades, workforce assignments/trades/KPI, and risk levels/factors.
- Use existing data-quality checks. Suppress invalid values before they reach charts or exports; distinguish valid zero, missing denominator, partial source, and absent legacy fields.
- Add the metric-strip component with labels, exact basis, permitted comparison context, and no invented snapshot sparkline.
- Specify the action-row and independently loaded-section inputs used by Overview and export, including permission-restricted vendor counts.
- Add focused correctness tests using unequal project/client/finance values, nonzero GST, signed overspend/profit, partial series, and missing Client/comparison data.
- Share the stabilized types and component/class names. Dependent writers may begin only after these interfaces are usable.

Exit evidence: A tested, small shared presentation layer and explicit interfaces. No backend or financial business-rule change.

### T2. Build the reference Overview content

Owner: Overview slice. Dependencies: T1. Acceptance criteria: AC1, AC3, AC5, AC6, AC8, AC9.

- Replace the five-card executive layout with Approved net value, Active clients, Projects, and Completion rate using the shared metric component.
- Compose Recorded expenses over time and Client breakdown in the approved wide/narrow chart row, using the chart slice's agreed exports.
- Replace the decorative side rail with Pending actions and Priority projects tables below the charts. Keep every existing operational queue destination reachable.
- Render up to five priority rows with stable project links, backend risk, actual weighted execution progress, manager, and planned due date. Handle loading/error/retry, stale rows, empty results, missing manager, and unavailable progress explicitly.
- Adapt the vendor-request queue item to consume the agreed query state without creating a second independent count. Retain its accessible retry/refresh actions and stale messaging.
- Keep secondary finance, workforce, lifecycle, and module information available below the primary composition. Retain the existing payment-confirmation mount in the parent.
- Add focused component tests for real labels, asymmetric data, restricted links/counts, row identity, unavailable fields, and independently failed priority data.

Exit evidence: Complete Overview component behavior with no shared CSS, page-query, export, or chart implementation writes outside this slice.

### T3. Replace spatial chart treatments across all tabs

Owner: Chart slice. Dependencies: T1. May run concurrently with T2, T4, and the primary's T5 work. Acceptance criteria: AC1, AC2, AC3, AC8, AC9.

- Use existing ECharts and `ChartFigure` to create restrained area/line, donut, horizontal bar, and progress views from the shared datasets.
- Implement the overview expense area chart and Client active/inactive donut. Show the selected-period expense total and account counts/percentages. Do not render annual axes, fake tier segments, revenue history, or snapshot guide lines as time-series data.
- Implement the approved per-tab chart pairs from the specification. Preserve supplementary risk, budget, cost, task-role, governance, and KPI information in readable secondary visualizations.
- Replace corridor/constellation/custom-path presentation on the active dashboard routes. Search consumers before removing or changing exports used by `DashboardOverviewCharts.tsx` or `dashboardCharts.tsx`; leave compatible unused code alone when deletion would expand scope.
- Keep exact-value tables, semantic legends, stable IDs, keyboard datum access, correct counts/denominators, and separate source availability.
- Use dashboard tokens, green/neutral series, text-supported semantic risk colors, and `motion="disabled"` for these redesigned charts. Avoid hover enlargement, shadows, decorative gradients, and fake geometry.
- Update tests that enforce the superseded spatial design while retaining their underlying finance, identity, availability, and keyboard guarantees. Add tests for supported zero/empty, partial-series, negative amounts, and cost breakdown reconciliation.

Exit evidence: All nine tabs' required chart content supported and tested. Any needed runtime/shared-helper change is reported to the primary before editing.

### T4. Implement accurate local CSV export

Owner: Export slice. Dependencies: T1. May run concurrently with T2, T3, and T5. Acceptance criteria: AC3, AC6, AC7, AC8.

- Build a pure CSV serializer and a small browser-download helper using the agreed presentation and section-state inputs.
- Include active tab, period, actual dates, observed/fetched context, comparison setting, applied filters, page offset/total, summaries, all plotted values, and loaded rows.
- Label paginated rows as the current page and partial/stale/unavailable sections accurately. Do not claim a common transactional snapshot for independently loaded sections.
- Include Overview action counts only when permitted and supplied. Omit private links, raw sensitive payloads, credentials, and hidden data.
- Render money with explicit INR units and consistent conversion from paise. Keep negative numeric values numeric while neutralizing formula prefixes in user-controlled text.
- Escape CSV quoting, delimiters, CR/LF, Unicode, and malicious spreadsheet-formula prefixes, including leading whitespace/control characters. Use trusted numeric cells versus untrusted text deliberately.
- Create and revoke object URLs and return explicit errors for the page to report. Do not invoke a backend write or external upload.
- Test representative output from every tab, differing amounts, exact plotted rows, partial data, current-page labeling, formula-like names, and URL cleanup.

Exit evidence: Tested serializer/download functions. Button wiring, query freshness checks, and page error feedback stay with the primary.

### T5. Integrate page controls, data loading, detail summaries, and design system

Owner: Primary. Dependencies: T1; can progress against the agreed interfaces while T2-T4 run. Final completion depends on T2-T4. Acceptance criteria: AC1-AC10.

- Use the extracted summary component to place four primary metrics before each detail tab's charts and a compact disclosure for other metrics.
- Change the page heading to Dashboard, add Export Report, and align refresh, period, comparison, last-updated context, and nine-tab navigation as specified.
- Add the Overview-only priority query using existing helpers and fixed filters: `module=projects`, `sort=risk_desc`, `limit=5`, `offset=0`, selected `periodDays`. Do not let detail filters change it.
- Own the permission-gated vendor-count query once and pass the same result to Overview and export. Preserve refetch/invalidation behavior and avoid fetching restricted data.
- Include all active sections in manual refresh, retain meaningful success/failure announcements, and keep the Overview usable if priority rows fail.
- Wire export to the currently resolved view. Disable it while overview placeholder data belongs to another period or the requested view is not ready; do not silently export another period's rows. Mark independently missing/stale sections clearly.
- Retain existing filter normalization, tab focus, browser navigation, pagination, query invalidation, payment confirmations, and operation-specific links.
- Consolidate dashboard CSS into one clear scoped design system: off-white surfaces, pale neutral canvas, one green accent, square panels, fine borders, sans-serif tabular numerals, and no shadows or left stripes.
- Style chart legends, exact-value disclosure, filters, desktop tables, mobile rows, status text, and payment/vendor sections consistently. Preserve functional focus/pressed/disabled states without hover movement.
- Ensure dashboard styles do not leak into shared shell or another route. Hide shared chart-toggle ornamentation only inside dashboard scope; retain the accessible text.
- Update page tests, fixture data, and QA request mocks for the bounded priority query and export behavior. Avoid touching the already-dirty shared test setup.

Exit evidence: Integrated functional dashboard across nine tabs, updated focused tests, and a complete candidate for review.

### T6. Review data, permission, and workflow integrity

Owner: `integrity_reviewer` in Mode A; primary sequential review in Mode B. Dependencies: All writers finished and T5 integrated. Acceptance criteria: AC3-AC8, AC10.

- Review the integrated diff against the approved specification and compare before/after metric sources.
- Verify paise/rupee boundaries, GST context, period totals versus snapshots, row progress denominator, stable IDs, unavailable values, and current-page export scope.
- Check all nine tabs for omitted existing metrics/queues, invented history, mislabeled roles/states, and incorrect color semantics.
- Verify permission checks occur before queries/actions, vendor polling is not duplicated, payment confirmation behavior remains unchanged, and pending period transitions cannot export mismatched data.
- Review CSV escaping/formula protection and safe tooltip text handling with user-controlled labels.
- Check dirty-work preservation and dashboard-only styling. Report concrete findings with file evidence; primary resolves confirmed issues.

Exit evidence: All material findings resolved or explicitly documented as a blocker. Final verification starts after resulting edits are integrated.

### T7. Verify the integrated build and rendered experience

Owner: `verification_runner` in Mode A; primary sequential verification in Mode B. Dependencies: T6 fixes complete. Acceptance criteria: AC1-AC10.

- Run focused and full frontend checks listed below on the integrated worktree.
- Inspect screenshots as images against the user reference at comparable content width, including the actual AppShell.
- Exercise every tab at desktop and narrow width, and the full viewport/state matrix below. Fix confirmed product issues through the owning writer or primary, then rerun only affected checks plus required final checks if changes invalidate their earlier result.
- Exercise export through the rendered button and inspect the downloaded synthetic CSV for the chosen period, active tab, current-page scope, and exact values.
- Inspect console/network errors, chart render failures, resize behavior, hidden/restricted requests, repeated mounts, and duplicate polling. Confirm nonessential motion is disabled and reduced-motion mode is usable.
- Confirm an unaffected neighboring route retains its previous styling and operation.

Exit evidence: Exact commands/results, inspected screenshots, functional and accessibility results, and any environment limitations. Do not report full verification if a required check is blocked or fails.

### T8. Reconcile scope and hand off

Owner: Primary. Dependencies: T7. Acceptance criteria: AC10 and all criteria reconciled.

- Inspect final owned diff and dirty-path set; confirm no unrelated work was reverted, staged, or reformatted.
- Record each acceptance criterion's evidence, affected files, checks run, unrun checks, generated QA paths, and remaining risks.
- Report the completed behavior and any limits concisely. State that no migration, deployment, commit, push, or production mutation occurred.

## Safe execution order

In Mode A, run T0 and T1 in the primary thread first. After interfaces and ownership are settled, T2 (Overview), T3 (charts), and T4 (export) may run with three native subagents while the primary progresses T5. This uses at most four concurrent agents. Tell each writer that others share the worktree, forbid reverting others' edits, and require boundary issues to be returned to the primary. Complete T5 integration after all three writers finish. Run T6 and then T7 sequentially on the integrated result; perform T8 last.

In Mode B, perform T0 through T8 inline without subagents. T5 may be split into foundational controls/styles and final integration, but the same dependency and acceptance checks apply. Neither execution mode authorizes backend writes, dependency changes, production access, or bypassing the required approvals.

If discovered evidence materially changes the approved scope, data meaning, or architecture, revise the affected durable document and request its approval once. Routine implementation details within these boundaries do not reopen gates.

## Verification commands

Run from `frontend/` unless stated otherwise. Baseline existing tests exclude files not yet created.

Focused existing dashboard and protected-action checks:

```sh
npm test -- src/features/admin/dashboard src/features/finance/DesignPaymentConfirmations.test.tsx
```

Focused new presentation, overview, priority, and export checks are included automatically in the directory command above. For faster iteration, run the specific affected test file. If shared chart infrastructure changes, include its focused tests and all known consumers. Keep baseline tests that enforce data and permission invariants even when obsolete visual-layout assertions are replaced.

Required integrated frontend verification:

```sh
npm run typecheck
npm test
npm run build
```

Repository root hygiene:

```sh
git diff --check
git status --short
```

Use the existing local Vite dev command for browser QA, with an available localhost port. No additional browser/test dependency should be installed for this change. Store screenshots and test logs in a task-specific ignored temporary directory, not in versioned output folders. There is no repository lint script; do not claim lint passed. Backend/OCR/native-mobile suites are not required for this frontend-only scope and must be identified as unrun at handoff.

## Acceptance and visual verification matrix

| Criteria | Evidence and scenarios |
| --- | --- |
| AC1 | Overview at comparable reference content width and 1440px: four headline metrics, wide expense chart, client donut, two lower tables, functional export; no decorative side rail crowding the composition. |
| AC2 | All nine tabs inspected at 1440px and 390px. Correct four primary metrics per detail tab, appropriate charts, accessible supplementary metrics, and working detail rows. |
| AC3 | Shared-model/chart/export tests using at least two unequal projects; GST/non-GST distinction; valid zero; no denominator; signed profit and overspend; expense-period sum; partial categories; missing Client/comparison fields. Screen, exact-value table, and CSV reconcile. |
| AC4 | Keyboard and pointer tabs, period/comparison controls, back/forward navigation, filter reset/apply, sort, pagination, drilldowns, refresh, failed refresh, and out-of-order period responses. |
| AC5 | Overview priority request has fixed filters/limit and period-specific key; no eager request on unrelated tabs; row IDs, progress, manager, due date, error/retry/empty/stale states validated. |
| AC6 | Restricted Configuration/client-response/project/user/payment permissions; no forbidden query or link; vendor count refresh and decision invalidation preserved; payment confirmation suite passes unchanged behavior. |
| AC7 | CSV export from each tab; real click/download; accurate timestamps/filters/current-page scope; pending transition disabled; independently failed/stale sections labeled; formula-like names and quote/newline escaping. |
| AC8 | Populated, empty organization, no matching detail rows, initial loading/error, chart load failure/retry, priority-only failure, partial data, legacy fields, unavailable previous comparison, stale refresh, and permission-loss fixtures. |
| AC9 | Overview plus the longest Finance/Workforce/Risk content at 1024, 768, and 360px in addition to the all-tab widths above; 200% zoom; long names/amounts; no page overflow; tab/chart keyboard navigation; exact-value disclosure; focus visibility; contrast; reduced motion; automated accessibility checks. |
| AC10 | Typecheck, full frontend tests, production build, hygiene, scoped diff review, actual-shell QA, unaffected neighboring route, console/network inspection, no new dependency, no leaked chart instances or duplicate polling after navigation. |

## Implementation and verification record

Completed on 2026-10-24 under the approved Mode A execution choice. No commits, staging, deployment, migration, dependency installation, or production actions were performed.

### Delivered scope

- T0: preserved all 78 initial dirty entries, captured the initial target diff and synthetic desktop/mobile baselines. The baseline dashboard/payment lane passed 134 tests in 13 files.
- T1-T5: implemented the four-metric Overview, recorded-expense line chart, actual Client-account donut, pending actions and bounded priority-project table; applied the same green/neutral system to all eight detail tabs. Extracted shared metric/chart/export presentation helpers without changing API contracts, backend finance calculations, permissions, or workflow actions.
- T4: local CSV downloads consume the same metric and chart datasets. Loaded detail rows retain current-page scope, section timestamps, unavailable values, stale reasons, and formula-safe text.
- T6: independent integrity review found no high/medium issue. Fixed its minor finding by preserving source-quality explanations alongside stale refresh messages. Browser QA also corrected status contrast and clarified average KPI/procurement denominator captions.
- T7: final verification and rendered checks completed as recorded below. Shared primitives and neighboring routes remain unchanged.

### Automated checks

| Check | Final observed result |
| --- | --- |
| `cd frontend && npm test -- src/features/admin/dashboard src/features/finance/DesignPaymentConfirmations.test.tsx` | 205 tests in 19 files passed. One duplicate-text test assertion was corrected, retaining visible reason and exact-value unavailability checks. |
| Dashboard route cases in `src/app/router.test.tsx` | 2 passed, 137 skipped. Updated two old heading assertions and retained root redirect/denied-request checks. |
| `cd frontend && npm run typecheck` | Passed. |
| `cd frontend && npm test` | 5,258 passed, 75 failed across 339 files. Two dashboard title assertions were subsequently fixed and independently retested. The other 73 failures concern Knowledge screens/layouts, AskLisno, LeadDetail, ChatTimeline, enterprise fixtures, and unrelated router cases. No initial full-suite baseline was captured, so these are observed out-of-scope failures, not claimed proven pre-existing failures. The entire suite was not repeated after the two title-only fixes. |
| `cd frontend && npm run build` | Passed, including a final rerun after the last scoped CSS adjustment. Existing large-chunk warnings remain for ECharts, ExcelJS, and the main application bundle. |
| `git diff --check` | Passed. |

The full application suite is not green. Out-of-scope failures were preserved for separate work; they do not justify changing unrelated existing work during this redesign. There is no lint script. Backend, replica-set, OCR, native-mobile, migration, and production checks were not run for this frontend-only change.

### Browser and visual checks

- Inspected all nine tabs at 1440px and 390px. All nine also passed overflow and axe checks at 360px. No page-level horizontal overflow or dashboard axe violations at these widths after fixes.
- Overview, Finance, Workforce, and Risk were checked at 1024px and 768px without page overflow. A 720px CSS viewport verified the reflow equivalent of 200% zoom on a 1440px screen; this was not a native browser zoom control test. Reduced-motion mode and the open exact-values table were checked in that configuration.
- Inspected loading, initial error, partial, empty-project, legacy, background-refresh, and priority-project-failure states. The synthetic empty-project fixture deliberately retains other organization data.
- Exercised keyboard tab selection, chart Home/End value announcements, exact-value disclosure, search/reset, comparison toggle, period changes, export gating while delayed period requests were pending, and an out-of-order 90-day/7-day transition. The final view resolved to the latest selected 7-day period.
- Downloaded actual CSV files from all nine tabs and inspected parsed export metadata and section scope. Overview's narrow priority table is labeled and focusable; ArrowRight moves its contained scroll area.
- Inspected the neighboring All Projects route through the synthetic enterprise harness. It retained its existing design, had no dashboard root, no page overflow, and no render error.
- Synthetic browser console inspection found no unexpected application errors. Expected error scenarios used the harness, not production data.

Logs, CSVs, and screenshots are local temporary artifacts under `/tmp/lisno-super-admin-reference-dashboard/`. CLI-generated artifacts were relocated there from the worktree before handoff. Relevant files include `final-focused-tests-rerun.log`, `final-typecheck.log`, `final-frontend-tests.log`, `final-failure-summary.log`, `final-build-after-css.log`, `final-dashboard-router-tests.log`, `desktop-*.png`, `mobile-390-*.png`, and `mobile-360-*.png`.

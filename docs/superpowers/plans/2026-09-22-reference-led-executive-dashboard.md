# Lisno reference-led executive dashboard — implementation plan

- Date: 2026-09-22
- Status: Completed (Mode A)
- Specification: [`docs/superpowers/specs/2026-09-22-reference-led-executive-dashboard-design.md`](../specs/2026-09-22-reference-led-executive-dashboard-design.md)
- Classification: Substantial cross-platform dashboard redesign
- Scope: Local implementation and verification only

## Outcome

Replace the current dark spatial-atlas Overview on web and mobile with the approved light executive dashboard inspired by the supplied reference. The result will use the existing authorized Super Admin dashboard response, Apache ECharts, stable animated transitions, exact-value fallbacks, and accurate Lisno finance/workflow labels.

The Overview will provide:

1. Five compact KPI cards.
2. A wide finance/activity panel.
3. Project lifecycle status.
4. Budget/cost composition and budget-position panels.
5. Priority-project context and current attention queues.
6. Module-progress and workforce summaries.
7. Responsive mobile recomposition.

No backend, schema, persistence, permission, migration, or production-data change is included.

## Preservation boundary

The worktree contains the completed spatial-dashboard implementation and earlier approved mobile work. Before implementation begins, capture:

- `git status --short`;
- focused diffs for `frontend/src/features/admin/dashboard/**`;
- focused diffs for `mobile/src/features/dashboard/**`;
- existing untracked specification/plan documents;
- the pre-existing generated `mobile/.expo/dev/logs/start.log` dirtiness.

Writers must not revert, stage, commit, reformat, or overwrite unrelated paths. Generated build/export logs are restored or removed after verification when they were clean at baseline.

## Fixed implementation contract

- The supplied reference is the current visual source of truth and supersedes the previous prohibition on bar and doughnut chart families.
- Apache ECharts remains the chart engine. No new charting or 3D dependency is introduced.
- The existing `GET /admin/dashboard/overview` contract remains unchanged.
- All data comes from the authorized dashboard response. No project photo, activity event, vendor ranking, employee ranking, revenue history, or estimate-category value is invented.
- Approved net revenue excludes GST; approved contract value retains GST context; paise stays integer internally; margin stays basis points.
- Missing and unavailable values remain distinct from verified zero.
- Exact tables/ledgers reconcile one-to-one with plotted values.
- Stable series/data IDs and `universalTransition` drive updates. Motion is bounded, finite, and removed for reduced-motion users.
- Web and mobile share metric definitions and hierarchy, while each platform receives its own responsive composition.
- Existing route authorization and permission-aware drill-down links remain authoritative.

## Ownership and parallel boundaries

### Primary agent

Owns the approved data-to-panel mapping, shared interpretation, specification/plan status, worktree preservation, cross-platform reconciliation, final integrity fixes, and final handoff.

### Web slice

Owns only:

- `frontend/src/features/admin/dashboard/**`
- dashboard-focused frontend tests

It may extend the existing ECharts runtime with tree-shakable `BarChart`, `LineChart`, and `PieChart` registrations already present in the installed ECharts package. It must not alter backend contracts or unrelated shared UI without returning the dependency to the primary agent.

### Mobile slice

Owns only:

- `mobile/src/features/dashboard/**`
- dashboard-focused mobile tests

It may extend the dashboard ECharts runtime with installed chart modules. It must preserve the existing Expo Router, authentication, local/remote API resolution, chart failure boundary, and app-lifecycle cleanup.

### Review and verification

- An `integrity_reviewer` performs a read-only integrated review after both writers finish.
- Confirmed findings are fixed before verification.
- A `verification_runner` executes the final risk-based checks after the integrated diff is stable.

Web and mobile implementation may run in parallel after the primary agent settles shared tokens, panel order, data labels, and chart semantics. Tests that observe the shared worktree are provisional until final integrated verification.

## Dependency-ordered tasks

### T0 — Baseline and implementation brief

**Owner:** Primary agent  
**Dependencies:** Approved plan and selected execution mode  
**Parallel:** No

1. Record dirty paths and focused dashboard diffs.
2. Record current dashboard test/build baselines and known unrelated suite failures.
3. Freeze the panel mapping, copy labels, units, responsive order, and palette tokens from the approved specification.
4. Identify existing components that remain useful: page header, period/comparison controls, `ChartFigure`, ECharts host, loading/error surfaces, module navigation, and exact-value disclosures.
5. Confirm no API or backend edit is necessary.

**Exit criteria:** Every writer receives the same panel order, data mapping, labels, and preservation boundary.

### T1 — Shared visual and interaction system

**Owner:** Primary agent with product/UX read-only audit in Mode A  
**Dependencies:** T0  
**Parallel:** May precede T2 and T3

1. Define semantic dashboard tokens for background, surfaces, border, shadow, ink, muted text, sage, sand, stone, blue, plum, success, warning, and danger.
2. Define desktop grid areas and mobile reading order.
3. Define KPI-card anatomy: icon well, label, value, comparison/status, and basis.
4. Define consistent panel heading, action/filter, legend, exact-value, unavailable, loading, and error patterns.
5. Define motion timing and reduced-motion behavior.
6. Define chart semantics:
   - recorded-cost activity columns with approved-revenue/cost-budget snapshot guides;
   - lifecycle doughnut;
   - cost-composition doughnut;
   - cost-budget versus recorded/remaining position;
   - compact progress/timeline summaries using only aggregate workflow data.

**Exit criteria:** Web and mobile can implement the same product hierarchy without inventing platform-specific metrics.

### T2 — Web reference-led Overview

**Owner:** Frontend implementation slice  
**Dependencies:** T1  
**Parallel:** T3

1. Recompose `DashboardOverview.tsx` into the approved five-KPI row, analytical grid, and contextual rail.
2. Update headline cards to:
   - Total projects;
   - Approved net revenue;
   - Approved contract value;
   - Current margin;
   - Live overdue projects.
3. Replace Overview spatial scenes with reference-aligned ECharts options while keeping stable IDs, keyboard focus, tooltips, exact values, and chart fallback.
4. Build the primary finance/activity panel without presenting snapshot approved revenue as a historical series.
5. Build lifecycle and cost-composition doughnuts with exact counts/paise and accessible tables.
6. Build budget-position and module-progress panels using only authoritative aggregate fields.
7. Convert the current “Needs attention” content into the right-rail queue and priority-project summary.
8. Provide a branded non-photographic fallback for the priority-project media area. Render no interior photograph unless the API supplies an authorized asset in a future contract.
9. Rework `super-admin-dashboard.css` into a light, dense, responsive system at 390px, tablet, 1024px, 1440px, and wide desktop.
10. Preserve permission-aware links, background-refresh behavior, stale data, partial data, loading, empty, and error states.

**Acceptance checks:**

- The Overview matches the reference hierarchy without copying unavailable data products.
- Labels and values trace to the approved mapping.
- No horizontal page overflow or clipped legends.
- Keyboard, focus-visible, reduced-motion, and exact-value behavior remain intact.

### T3 — Mobile reference-led Overview

**Owner:** Mobile implementation slice  
**Dependencies:** T1  
**Parallel:** T2

1. Recompose `SuperAdminMobileDashboard.tsx` into the approved KPI-first mobile hierarchy.
2. Replace dark spatial styling with light Lisno executive tokens while preserving safe areas and native scroll behavior.
3. Add mobile chart options for finance activity, lifecycle, cost composition, and budget position using the same metric mapping as web.
4. Use two-column KPI cards where space permits and single-column fallback at narrow width or large text.
5. Place priority-project and attention content in normal flow after the primary analytical panels.
6. Retain native exact-value controls/ledger and accessible chart summaries.
7. Preserve lazy chart mounting, app-state behavior, renderer fallback, disposal, API-environment handling, and authenticated data loading.
8. Ensure touch targets are at least 44 points and charts never capture vertical scrolling.

**Acceptance checks:**

- Mobile reads as the same executive dashboard, not a shrunken desktop canvas.
- No safe-area collision, clipped values, scroll trapping, or small tap targets.
- Exact values and unavailable reasons remain available without chart interaction.

### T4 — Web regression coverage

**Owner:** Web slice  
**Dependencies:** T2  
**Parallel:** T5

1. Update Overview/page tests for the five KPI cards and reference-led panel order.
2. Add option tests for stable IDs, chart families, reduced motion, tooltips, zero/unavailable separation, and exact-table parity.
3. Add finance tests for unequal data, GST context, zero budget, overspend, and unavailable snapshot fields.
4. Test priority-project empty/present states and permission-aware links.
5. Test narrow responsive semantics, renderer failure, stale refresh, comparison toggle, and keyboard traversal.

**Exit criteria:** Focused dashboard tests fail if a metric is relabelled inaccurately, fabricated, hidden, or disagrees with its exact table.

### T5 — Mobile regression coverage

**Owner:** Mobile slice  
**Dependencies:** T3  
**Parallel:** T4

1. Update view-model and option tests for the approved panel mapping.
2. Test paise/basis-point formatting, zero/unavailable, partial data, overspend, comparison state, and stable IDs.
3. Test loading skeleton, error/retry, exact ledger, touch controls, reduced motion, and inactive-app behavior.
4. Retain route-conflict and authenticated dashboard rendering coverage.

**Exit criteria:** Focused mobile tests verify every displayed value against the overview response and preserve runtime failure behavior.

### T6 — Integrated integrity review

**Owner:** Integrity reviewer in Mode A; primary agent equivalent in Mode B  
**Dependencies:** T2–T5  
**Parallel:** No

Review:

- data lineage and stable IDs;
- authorization and protected links;
- finance reconciliation and GST handling;
- unavailable versus zero behavior;
- semantic accuracy of reference substitutions;
- responsive DOM/reading order;
- query lifecycle, chart disposal, and reduced motion;
- preservation of unrelated dirty work.

Confirmed defects are fixed before T7.

### T7 — Final verification and visual QA

**Owner:** Verification runner in Mode A; primary agent equivalent in Mode B  
**Dependencies:** T6 and all fixes  
**Parallel:** No

Run:

1. `cd frontend && npm test -- src/features/admin/dashboard`
2. `cd frontend && npm run typecheck`
3. `cd frontend && npm run build`
4. `cd mobile && npm test -- --runInBand src/features/dashboard`
5. `cd mobile && npm run typecheck`
6. Android export supported by the mobile package.
7. `git diff --check` and `git status --short`.

Rendered web matrix:

- 390px, tablet, 1024px, 1440px, and wide desktop;
- comparison on/off and 7/30/90-day periods;
- normal, zero, partial/unavailable, stale-refresh, renderer-error, and permission-limited states;
- keyboard traversal, exact tables, reduced motion, console errors, and horizontal overflow.

Rendered mobile matrix:

- phone portrait and landscape;
- large phone/tablet where supported;
- normal, sparse/partial, zero, stale-refresh, renderer-error, and authorization states;
- exact ledger, touch selection, vertical scrolling, safe area, large text, and runtime logs.

## Acceptance traceability

| Specification criterion | Tasks | Evidence |
| --- | --- | --- |
| Reference-led web hierarchy | T1, T2, T7 | Browser screenshots and visual review |
| Purpose-built mobile composition | T1, T3, T7 | Emulator/device screenshots and scroll review |
| Database-only values | T0–T6 | Mapping tests and integrity review |
| Accurate finance labels/units | T1–T6 | Reconciliation fixtures and exact tables |
| Exact chart/table parity | T2–T6 | Option/component tests |
| Stable premium transitions | T1–T5 | Stable-ID and reduced-motion tests |
| Accessible resilient states | T2–T7 | Component tests, keyboard review, failure fixtures |
| Responsive quality | T2, T3, T7 | Full viewport matrix |
| Repository verification/hygiene | T7 | Exact command results and final status |

## Rollback and external actions

- The redesign is feature-local. Rollback restores the prior Overview components, option builders, runtime registrations, and dashboard styles while keeping the existing API contract.
- No migration or rollback script is required.
- No commit, push, deployment, seed, production mutation, package publication, or external communication is authorized.

## Completion evidence

- Frontend dashboard tests: 110/110 passed across 11 files.
- Mobile dashboard tests: 73/73 passed across 11 suites.
- Frontend and mobile TypeScript checks passed.
- Frontend production build passed with 2,905 modules; Vite retained its non-blocking large-chunk warning.
- Android export passed with 2,721 modules and an 8.2 MB bundle; Expo retained its non-blocking `NO_COLOR`/`FORCE_COLOR` warning.
- Browser QA passed at 360px, 390px, 768px, 1024px, 1440px, and 1920px with no horizontal overflow, console errors, or reduced-motion regression.
- Android Pixel 10 portrait QA used the current Metro bundle and repository-documented loopback demo identity. The dashboard was inspected through its KPI, chart, status, priority, queue, finance, budget, and delivery sections.
- Final verification confirmed no `grid.containLabel` usage, stable chart identities, universal transitions, 480/360ms web motion, 500/380ms mobile motion, and immediate reduced-motion updates.
- `git diff --check` passed. Generated QA/build artifacts and the verification-only Expo export-log changes were removed.
- Unrelated full suites, backend/OCR tests, replica-set tests, migrations, landscape/tablet emulator passes, and physical-device passes were not run because they were outside this local dashboard implementation scope.

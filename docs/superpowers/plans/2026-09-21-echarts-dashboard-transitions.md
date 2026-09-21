# Advanced Apache ECharts transitions — task plan

- Date: 2026-09-21
- Status: Implemented and verified — focused checks pass; the complete frontend suite retains the same 18 unrelated baseline failures
- Source of truth: [Approved revised dashboard specification](../specs/2026-09-20-echarts-dashboard-design.md)
- Specification approval: User replied “Approved” on 2026-09-21 after requesting transitions matching the official Apache ECharts data-transition guide.
- Task-plan approval: User replied “Approved” on 2026-09-21.
- Execution mode: A — parallel sub-agents, selected by the user on 2026-09-21.
- Classification: Substantial frontend interaction refinement; no backend, API, database, authorization, or financial-contract change.
- Outcome: Existing dashboard data should transform smoothly between verified states through stable ECharts identity and Universal Transition, with a purposeful lifecycle doughnut/ranked-bar morph.

## Evidence and boundaries

The completed dashboard currently uses ECharts `6.1.0`, a lazy modular SVG runtime, stable chart instances, accessible value tables, and global 550ms entrance/300ms update timings. The remaining gap is motion quality:

- `dashboardEChartsRuntime.ts` registers `LabelLayout` but not `UniversalTransition`.
- The runtime always calls `setOption` with structural `replaceMerge` for series, dataset, and axes.
- Several series pass primitive values or data IDs without explicit stable `name` values, while ECharts data diffing uses `name` to associate added, updated, and removed data.
- The overview has no intentional cross-series transition; Project lifecycle is always a doughnut.
- Existing tests verify duration, reduced motion, updates, cleanup, and stable instance ownership, but they do not prove mark continuity, Universal Transition registration, cross-type morphing, or visible interruption behavior.

The worktree already contains the approved dashboard implementation and its specification/plan. Those changes are the baseline for this revision and must not be reset, reformatted wholesale, staged, committed, or mixed with unrelated fixes. Existing repository-wide test failures in Design/full-journey/bootstrap and password/signup/accessibility/navigation/Knowledge screens are documented baseline failures; this task does not own them.

In scope:

- The dashboard ECharts runtime, typed option boundary, overview charts, dashboard module charts, dashboard-only styles, fixtures, and focused tests.
- Motion triggered by verified metric, period, comparison, refresh, lifecycle-view, and module-data changes.
- A native `Doughnut / Ranked bars` control in the Project lifecycle figure.
- Real-browser transition, reduced-motion, interruption, responsive, cleanup, and lazy-bundle verification.

Out of scope:

- Backend aggregation, API/OpenAPI fields, persistence, authorization, query definitions, finance formulas, or cache invalidation.
- Random/demo updates, autonomous playback, looping animation, scroll choreography, count-up DOM money, Canvas/WebGL, GSAP, or a second animation dependency.
- Redesigning unrelated charts or fixing existing unrelated full-suite failures.
- Seed, migration, backfill, production access, commit, push, deployment, or external publication.

## Transition contract

1. Register `UniversalTransition` through the current lazy, tree-shakeable `echarts/features` import. Keep SVG rendering and the existing lazy runtime boundary.
2. Retain one ECharts instance for each stable `chartId`. Metric, period, comparison, refresh, theme, and lifecycle-view changes update that instance; only retry, unmount, or a deliberate chart-identity change may initialize a replacement.
3. Give every changing series a stable semantic `id`. Give every plotted datum an explicit stable `name`: actual UTC date for time-series points and stable lifecycle/category identity for categorical points. Display labels may remain human-readable without becoming join keys.
4. Use ECharts `setOption` updates so matching marks remain eligible for interpolation and obsolete series/components are removed. Determine the narrow update policy with real-browser evidence: preserve merge-by-ID for ordinary data updates; use a deliberate replacement mode only where cross-type Universal Transition or component removal requires it. Never retain a hidden previous-period series after comparison is disabled.
5. Apply bounded motion profiles centrally:
   - entrance: 650–800ms, `cubicOut`, capped stagger;
   - data update: 500–700ms, `cubicInOut`;
   - lifecycle morph: 700–900ms;
   - hover/focus: no more than 120ms;
   - reduced motion: `animation: false`, zero duration/delay, and immediate final geometry.
6. Growth/Delivery transitions interpolate matching daily points during metric/period changes and animate comparison entry/removal. Current and prior series retain distinct solid/dashed cues throughout.
7. Client and Finance bars, labels, stack boundaries, negative values, pipeline categories, waterfall marks, and module time series transform from the last verified values rather than replaying full entrance motion.
8. Project lifecycle adds an accessible native view control. Doughnut and ranked-bar modes use the same verified dataset, stable series ID, data names, value table, color mapping, keyboard activation, and Project drill-down. `universalTransition` morphs between the two views. View state is presentation-only local state and does not alter the API/query key.
9. Rapid repeated input is latest-state-wins. Removed/highlighted marks clean up safely. Hidden tabs do not animate, route exit/reentry does not leak listeners, and theme/reduced-motion changes do not initialize a duplicate chart.
10. Animation never changes metric meaning or delays semantic DOM values. Loading, empty, unavailable, stale, old-response, permission-loss, and renderer-error behavior remain intact.

## Task graph

```text
T0 Capture motion baseline and protect the dirty worktree
  ↓
T1 Settle typed transition/update interfaces and fixtures
  ├──────────────┬─────────────────┐
  ↓              ↓                 ↓
T2 Runtime       T3 Overview       T4 Module charts
  └──────────────┴─────────────────┘
                 ↓
       T5 Integrate and tune in a real browser
                 ↓
       T6 Integrity review and fixes
                 ↓
       T7 Final verification and handoff
```

T2, T3, and T4 can run in parallel only after T1 fixes the public transition contract. T5 waits for all three. Keep one parent delivery task active and treat subagent output as evidence requiring integration review.

## Ownership boundaries

| Owner | Exclusive write boundary |
| --- | --- |
| Primary integrator | This plan/status, transition contract, shared public types, integration reconciliation, browser QA fixture, final tuning that crosses an ownership boundary, and final evidence. |
| ECharts runtime implementer | `frontend/src/features/admin/dashboard/echarts/DashboardEChart.tsx`, `dashboardEChartsRuntime.ts`, `dashboardEChartOptions.ts`, runtime/option tests, and narrowly related runtime types after the primary settles their public shape. |
| Overview transition implementer | `DashboardOverviewCharts.tsx`, `DashboardOverview.tsx` only if the lifecycle control needs composition state, dashboard overview tests, and transition-specific dashboard CSS. |
| Module transition implementer | `frontend/src/features/admin/dashboard/echarts/DashboardModuleECharts.tsx`, `DashboardModuleCharts.tsx` only where integration requires it, and module chart tests. |
| Integrity reviewer | Read-only review after all writers and primary integration finish. |
| Verification runner | Final read-only commands and evidence after review fixes are integrated. |

In Mode A, each writer must be told that the worktree is shared, the existing uncommitted dashboard implementation is intentional, unrelated edits must not be reverted, and discovered interface changes return to the primary. In Mode B, the primary performs the same slices sequentially.

## T0 — Capture the motion baseline

Owner: Primary. Dependencies: task-plan approval and execution-mode selection.

1. Capture `git status --short`, target diffs, and the current ECharts production chunk sizes: 558,122 bytes raw / 192,915 bytes gzip at the previous handoff.
2. Record current option-update behavior for metric change, comparison off/on, a changed categorical value, and lifecycle rendering. Confirm one chart instance currently survives growth-metric changes.
3. Capture short real-browser evidence of the current basic transition at desktop and mobile using synthetic QA data. Store runtime artifacts under `/tmp`, never as deliverable source.
4. Confirm no user-owned dev server is stopped and no unrelated dirty target is assigned.

Exit: a reproducible before state, protected target set, and exact verification commands.

## T1 — Settle the transition interface

Owner: Primary. Dependencies: T0.

Affected areas: dashboard ECharts public types, deterministic fixtures, and test helpers only.

1. Define a small motion profile/update-policy type only if the runtime needs caller input. Prefer renderer defaults; avoid chart-by-chart timing constants.
2. Define the lifecycle view type (`doughnut | ranked_bar`) and stable series/data identities.
3. Define deterministic current/next fixtures with overlapping, added, removed, zero, and negative values so tests can distinguish update continuity from full reinitialization.
4. Define the observable completion/evidence hook for browser QA without adding production telemetry or a permanent debug API. Prefer ECharts `finished`/`rendered` observation inside the QA harness.

Exit: T2–T4 can implement without inventing incompatible IDs, timings, or update behavior.

## T2 — Upgrade the ECharts runtime

Owner: ECharts runtime implementer in Mode A; primary in Mode B. Dependencies: T1.

1. Import and register `UniversalTransition` in the existing lazy modular runtime.
2. Implement transition-safe option updates. Preserve series matched by stable IDs, remove obsolete plots, and support cross-type lifecycle morphing without disposing the instance.
3. Apply centralized entrance/update timing, easing, and capped stagger only when motion is enabled. Ensure option-specific settings cannot accidentally restore animation under reduced motion.
4. Keep safe tooltip handling, resize behavior, error/retry fallback, keyboard focus actions, Strict Mode ownership, and cleanup intact.
5. Extend tests to prove registration, update policy, stable instance ownership, obsolete-series removal, rapid successive updates, reduced-motion switching, and clean disposal.

Exit: runtime tests pass and option calls expose the intended transition behavior without changing chart semantics.

## T3 — Add advanced Overview transitions

Owner: Overview transition implementer in Mode A; primary in Mode B. Dependencies: T1.

1. Convert growth datasets to named data objects keyed by actual UTC date. Keep stable series IDs while metric, period, and comparison state change.
2. Make comparison enable/disable enter and remove the previous series smoothly while current geometry remains continuous.
3. Convert Client and Financial data to stable named marks so stack/bar/label/value updates interpolate, including zero and negative headroom.
4. Add the native Doughnut/Ranked bars lifecycle control. Use one stable series identity, stage names, fixed colors, accessible pressed/selected state, preserved table/drill-down behavior, and `universalTransition` in both directions.
5. Preserve responsive composition, URL-backed comparison state, source-unavailable behavior, exact tables, focus order, and reduced motion.
6. Add focused tests for identities, controls, view parity, no chart remount, drill-down equivalence, rapid toggling, old/partial responses, and reduced-motion option output.

Exit: Overview interactions visibly transform data and all existing nonvisual contracts still pass.

## T4 — Apply stable transitions to module charts

Owner: Module transition implementer in Mode A; primary in Mode B. Dependencies: T1.

1. Give module time-series, categorical, pipeline, waterfall, and composition marks stable semantic names and series IDs.
2. Enable Universal Transition where it provides continuity; do not force cross-type morphs where they obscure financial or workflow meaning.
3. Preserve ordering, colors, units, negative values, tables, drill-downs, and simple DOM meters.
4. Add focused option/behavior tests for added/updated/removed marks and waterfall/pipeline integrity.

Exit: module chart updates transform existing marks without changing reported values or mounting hidden-tab charts.

## T5 — Integrate and tune in a real browser

Owner: Primary. Dependencies: T2–T4.

1. Reconcile the final runtime, overview, and module option shapes. Ensure every transition participant has a stable series ID and datum name.
2. Exercise initial load, metric selection, 7/30/90-day changes, comparison toggle, lifecycle view toggle, refresh, module tab changes, rapid interruption, and route reentry with real ECharts.
3. Tune duration/easing/stagger within the approved ranges based on observed continuity and input responsiveness. Avoid elastic/bouncy motion for financial and operational data.
4. Verify reduced motion at initial load and after preference changes; final values and interactions must remain identical.
5. Inspect desktop/mobile motion, tooltip confinement, label collisions, layout stability, console/network behavior, and instance/listener counts. Capture before/after transition evidence under `/tmp`.
6. Rebuild and compare the lazy ECharts chunk. The feature must remain dynamically imported; investigate any material increase beyond the Universal Transition feature itself.

Exit: integrated motion visibly meets the official transition behavior and remains accessible, responsive, and lazy-loaded.

## T6 — Integrity review

Owner: `integrity_reviewer` in Mode A; primary in Mode B. Dependencies: T5.

Review the integrated diff for stable semantic identities, correct `setOption` merge/removal behavior, truthful data/table parity, lifecycle view equivalence, rapid-input races, hidden/removed series, reduced-motion enforcement, accessibility, cleanup, and lazy-bundle containment. Confirm no backend/API/financial meaning changed. Resolve confirmed findings before final verification.

## T7 — Verification and handoff

Owner: `verification_runner` in Mode A; primary in Mode B. Dependencies: T6.

Focused frontend commands from `frontend/`:

```sh
npm test -- src/features/admin/dashboard/echarts
npm test -- src/features/admin/dashboard/DashboardModuleCharts.test.tsx src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx
npm test -- src/features/admin/dashboard/dashboardPresentation.test.ts src/features/admin/dashboard/dashboardInvalidation.test.ts
npm run typecheck
npm run build
```

Run the complete frontend suite once on the final tree and classify failures against the recorded baseline. Backend commands are unnecessary unless implementation unexpectedly changes backend/shared contracts; such a change first returns to the specification boundary. There is no lint script.

At repository root run:

```sh
git diff --check
git status --short
```

Browser matrix:

| Dimension | Evidence |
| --- | --- |
| Transition continuity | Start/middle/end capture for growth metric, 7→30-day period, comparison off/on, lifecycle doughnut↔bar, changed Finance bar, and one module chart. |
| Interruption | Rapid alternating metric/view changes finish at the last selection with one chart instance, current table values, and no stale series. |
| Reduced motion | Preference active before load and toggled live; geometry changes immediately with no delayed or universal morph. |
| Responsive | 1440, 1024, 768, 390, 360, short landscape, and 200% zoom; no overflow, blocked scroll, clipped control, or tooltip escape. |
| Accessibility | Keyboard lifecycle view control and chart/table drill-down equivalence; focus remains visible during changes; motion is not required to read values. |
| Runtime | No relevant console/network errors, duplicate listeners, reinitialization on data changes, animation after unmount, or ECharts load on an unrelated route. |
| Performance | Record the ECharts chunk delta and a representative transition trace. Do not infer or claim FPS from visual inspection. |

Acceptance is complete when revised AC8 and AC10 are evidenced, original AC1–AC7/AC9/AC11 remain intact, all focused checks pass, full-suite differences are classified, browser evidence shows visible ECharts data transitions, and no unauthorized external action occurred.

## Execution progress

- T0 complete: baseline revision `016f10287d1252612de0976c8c229df3bc1e9c2e`; intentional dirty dashboard paths recorded; `git diff --check` passed; no server was listening on task port 4177; baseline runtime chunk recorded at 558,122 bytes; existing metric/period transition captured at `/tmp/lisno-echarts-motion-baseline.webm`.
- T1 complete: no new public renderer prop is required. Motion defaults remain centralized; series IDs stay stable; time points use actual UTC date names; category points use stable keys; lifecycle view state remains local and uses series ID `project-lifecycle` in both chart types. The QA harness may observe ECharts/SVG state externally and serves alternating deterministic motion fixtures without adding production debug state.
- T2 complete: the lazy modular runtime registers `UniversalTransition`, retains a stable instance, applies transition-safe `setOption` replacement for series/dataset/axes, and enforces centralized 760ms entrance, 700ms update, capped stagger, 100ms state, and zero-motion policies. Runtime tests pass 16/16.
- T3 complete: Overview time-series and bar data use stable semantic identities; comparison entry/removal and verified refresh values update in place; Project lifecycle morphs between an accessible doughnut and ranked bars while preserving table, colors, keyboard activation, and drill-down. A deferred 30→90→7 test proves the verified response and chart instance remain mounted, stale 90-day data cannot replace the active 7-day request, and displayed period labels follow the data being shown. Dashboard page tests pass 26/26.
- T4 complete: module time-series, category, pipeline, composition, and waterfall marks use stable names and Universal Transition. Zero-valued stacked categories remain in chart options so positive↔zero updates keep their identity while visible legends and keyboard targets remain unchanged. Module chart tests pass 16/16.
- T5 complete: real-browser QA covered initial/refresh value updates, lifecycle doughnut↔bar, Finance charts, 90→7-day UTC windows, rapid lifecycle view changes, reduced motion before load and live, desktop/tablet/mobile/short-landscape widths, 200% page scale, and console output. No tested width overflowed and no browser errors or warnings were reported. Evidence: `/tmp/lisno-echarts-motion-advanced.webm`, `/tmp/lisno-echarts-motion-advanced-contact.png`, `/tmp/lisno-echarts-motion-finance.png`, and `/tmp/lisno-echarts-motion-period-7.png`.
- T6 complete: the integrity review confirmed the final stable identity, lifecycle parity, merge/removal, reduced-motion, cleanup, lazy-loading, QA isolation, authorization, finance, and API contracts. Its three findings were resolved: period fetches retain mounted verified charts, the QA harness now serves distinct delayed 7/30/90-day windows, and zero-valued module categories keep transition identity.
- T7 complete: focused ECharts tests pass 16/16, page/module tests 42/42, dashboard presentation/invalidation tests 16/16, procurement tests 55/55, TypeScript passes, the production build passes, and `git diff --check` passes. The complete frontend suite passes 3,216/3,234 tests across 219/225 files; the 18 failures are the unchanged unrelated baseline. The final ECharts runtime chunk is 577,905 bytes raw / 200,772 gzip (delta +19,783 / +7,857) and remains loaded once through a dynamic import rather than `index.html`.

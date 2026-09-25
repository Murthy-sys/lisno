# Premium mobile dashboard visualization — task plan

- Date: 2026-09-22
- Status: Completed
- Specification: [Premium mobile dashboard visualization](../specs/2026-09-22-premium-mobile-dashboard-visualization-design.md)
- Classification: Substantial mobile visualization redesign with financial and authorization integrity requirements

## Delivery outcome

Replace the mobile Dashboard feature's generic primitive-value grid with a dedicated Super Admin analytical screen. The finished screen will use Apache ECharts with custom isometric 3D geometry and stable data transitions, display the existing database-backed dashboard contract faithfully, retain complete native value/accessibility paths, and pass responsive Android visual and runtime validation.

## Ownership and worktree boundaries

- Preserve the pre-existing generated change in `mobile/.expo/dev/logs/start.log`; do not edit, stage, restore, or include it in the feature diff.
- Preserve all unrelated repository work. Recheck dirty paths and per-target diffs immediately before assigning any writer.
- **Primary/integration owner:** package and lockfile changes, dependency compatibility, shared dashboard interfaces, `FeatureWorkspace.tsx` routing, token integration, cross-slice decisions, final reconciliation, and documents.
- **Data-contract slice:** owns new files under `mobile/src/features/dashboard/data/` and their tests. It does not edit UI/chart files, shared tokens, packages, navigation, or generic workspace files.
- **Chart-engine slice:** owns new files under `mobile/src/features/dashboard/charts/` and their tests. It consumes the approved data-view interfaces and does not edit API parsing, screen composition, shared tokens, packages, or routing.
- **Dashboard-UX slice:** owns the dedicated screen and native presentation files under `mobile/src/features/dashboard/components/` plus `SuperAdminMobileDashboard.tsx` and their tests. It consumes the shared data/chart interfaces and does not edit package files, chart geometry, generic workspace code, or backend contracts.
- The primary agent owns the final integration edits where a shared file cannot safely have multiple writers.
- No backend source, API contract, database record, authentication/RBAC rule, production environment, deployment, commit, or push is in scope.

## Dependency-ordered tasks

### 1. Capture the baseline and settle integration contracts

- Record `git status --short` and relevant per-target diffs before any writer starts.
- Run the current focused workspace tests, mobile typecheck, and a Dashboard render smoke test if one exists, recording pre-existing failures separately.
- Trace every consumed field to `backend/src/contracts/super-admin-dashboard.ts` and confirm the live development response still matches the approved specification without printing private values.
- Define the shared implementation interfaces before parallel work begins:
  - `DashboardPeriod = 7 | 30 | 90`
  - selected comparison metric and module identifiers
  - parsed dashboard response type
  - normalized chart datum/view-model shapes, including stable IDs, units, availability, UTC dates, paise, and backend-provided deltas
  - chart surface props/events and reduced-motion contract
- Confirm Dashboard remains reachable only through the existing `admin.dashboard.read` destination and no route/RBAC change is required.

**Acceptance:** every planned datum has a backend source and time/unit definition; shared interfaces prevent slices from inventing parallel response models; unrelated dirty files have explicit exclusion boundaries.

### 2. Prove and add the ECharts native dependency path

- Verify the selected `@wuba/react-native-echarts` version against React 19.2, React Native 0.86, Expo 57, `react-native-svg` 15.15, TypeScript 6, and Apache ECharts 6.1.
- Add `echarts` and `@wuba/react-native-echarts` as mobile runtime dependencies, updating only `mobile/package.json` and the repository lockfile(s) required by the existing package manager.
- Use the SVG renderer. Register only the required renderer, components, line/custom-series capabilities, tooltip/grid/data-zoom features if actually used, and transition support.
- Build a minimal native initialization test before custom geometry work. Prove initialization, `setOption`, resize, event binding, and disposal on the Android/Expo path.
- If the package is incompatible, stop feature writes long enough to diagnose the concrete API/build issue and resolve it within the approved native-ECharts architecture; do not silently substitute WebView, Skia, ECharts-GL, or another chart framework.
- Run dependency health, typecheck, and Android export checks immediately after installation so compatibility failures are not discovered after UI completion.

**Acceptance:** the real native SVG renderer loads in this app, the dependency set is minimal and documented, and no alternate rendering stack or unrelated lockfile churn is introduced.

### 3. Implement strict dashboard parsing and normalized view models

- Add a dashboard response schema/parser for every consumed section while preserving explicit optional/unavailable source states.
- Keep unknown raw response objects outside presentation code. Reject malformed required window/unit structures with a safe dashboard-load error.
- Add formatters and selectors for:
  - UTC observed/current/previous range labels and partial final day
  - project/client current snapshots versus period activity
  - count metrics, absolute delta, basis-point percentage state, and `New`/no-change/unavailable cases
  - integer paise and currency display boundaries
  - daily current/previous series with stable names and real dates
  - lifecycle, delivery, finance, workforce, governance, and risk module data
- Build a dashboard-specific query hook/factory whose private query key includes environment, user, dashboard family, and selected period. Retain previous successful data only as visibly stale data during a period/refetch transition.
- Add asymmetric fixtures with unequal values, unavailable sections, zeros, partial data quality, negative finance/overspend cases, and malformed structures.

**Acceptance:** all presentation data is typed, source-traceable, unit-safe, and deterministic; missing is never converted to zero; current and previous periods cannot collide in cache.

### 4. Build the reusable ECharts lifecycle surface

- Create a bounded React Native ECharts wrapper responsible for measured initialization, stable instance retention, `setOption`, resize, event subscription, app-background animation handling, error fallback notification, and disposal.
- Keep chart option data out of high-frequency React state. Ensure callbacks and subscriptions do not multiply across renders.
- Add a test adapter/mock boundary for component tests without replacing Android runtime validation of the actual renderer.
- Support reduced motion by supplying immediate/final option updates rather than running the normal stagger/keyframes.
- Expose a concise accessibility summary or hide unreliable SVG subpaths while leaving native controls and values operable.

**Acceptance:** repeated mount, update, resize, background, and unmount cycles preserve one live instance and leave no chart listener or animation loop behind.

### 5. Author the custom isometric comparison system

- Implement deterministic prism geometry helpers for front, top, and side faces using a fixed perspective, depth, light direction, and zero baseline.
- Build the six-metric current/previous count stage as an ECharts `custom` series with stable series IDs and stable data names.
- Keep scaling in ECharts coordinates; do not scale polygon dimensions with formatted text or device pixels in a way that distorts ranking.
- Apply Lisno token-derived faces, restrained selected gold edge light, legible flat labels, and unavailable/zero treatments that do not fabricate volume.
- Add enter and update choreography from the approved timing ranges. Verify a period update interpolates the existing named marks instead of remounting or replaying the page.
- Map tap selection to a metric ID and provide the same selection through native controls.
- Add geometry/option tests for zero, maximum, current-only, paired, narrow-width, and reduced-motion cases.

**Acceptance:** the hero is visibly custom rather than a default bar preset, represents only count metrics on one truthful scale, and performs continuous stable updates on real values.

### 6. Build the trend and module chart options

- Implement the precise 2D daily current/previous velocity chart with actual UTC dates, gaps for unavailable history, integer axes, bounded label density, and selected-metric identity continuity.
- Implement the approved lower scenes:
  - Overview: current lifecycle isometric stage, risk distribution, and top-risk summary
  - Delivery: estimation/design/procurement/execution states without implying an unsupported funnel
  - Capital: approved-net-revenue/cost/profit waterfall or composition, GST separation, budget/recorded/remaining state, overspend support, and its own money scale
  - People: workforce role distribution, assigned/unassigned state, KPI availability, and governance queue
- Mount only the active heavy scene. Reuse shared chart lifecycle and token helpers rather than creating independent chart wrappers.
- Add option/semantic tests proving count/money separation, lifecycle partition totals, finance reconciliation, unavailability gaps, and bounded 90-day output.

**Acceptance:** every module chart preserves the backend's meaning and unit, no hidden module retains a chart instance, and no decorative shape encodes invented data.

### 7. Compose the premium native dashboard experience

- Create `SuperAdminMobileDashboard` and native components for the operations header, period/compare controls, project/client fact rails, selected-metric values, module selector, availability summary, refresh/error states, and “Show all values” sheet.
- Establish scoped dashboard semantic tokens from the existing midnight/violet/gold palette and Poppins typography. Avoid changing unrelated screens.
- Compose a single narrative phone scroll with a dominant edge-to-edge hero stage and content-specific sections rather than repeated equal cards.
- Add tablet/rail and landscape layouts with bounded two-column composition where space supports it.
- Implement loading, valid-zero, first-load error, stale refresh, failed refresh, partial/unavailable source, renderer failure, and permission-loss states.
- Make every control at least 44 points with accessible names, selected/disabled state, visible focus/pressed state, and non-color cues.
- Ensure the value sheet contains every chart series' exact label, value, unit, time basis, range, and availability. It must remain complete when the chart is unavailable.
- Respect reduced motion and large text. Preserve vertical scrolling and safe-area/bottom-navigation clearance.

**Acceptance:** the screen matches the approved visual hierarchy, remains complete without chart picking, and works across phone, landscape, tablet, large-text, screen-reader, and reduced-motion states.

### 8. Integrate the dedicated Dashboard route

- Special-case the existing Dashboard destination in `FeatureWorkspace.tsx` to render `SuperAdminMobileDashboard`; preserve Messages, Configuration, and every generic feature path unchanged.
- Replace the fixed 30-day generic request with the dashboard-specific period query inside the dedicated screen. Keep the feature definition as metadata or remove only its now-unused fixed endpoint behavior without changing other definitions.
- Keep the existing authenticated runtime, private query scope, operation capability, and navigation shell boundaries.
- Verify session changes, environment changes, permission loss, and sign-out clear or isolate private dashboard data through existing query/session cleanup.

**Acceptance:** authorized Super Admin navigation opens the new dashboard; unrelated roles and workspaces do not gain access or regress; cached data cannot cross users or environments.

### 9. Run integrated design and integrity review

- Reconcile the complete diff against every specification acceptance criterion and the current backend contract.
- Audit financial lineage, paise handling, GST labels, comparison bounds, partial availability, stable IDs, and role/operation checks.
- Inspect chart geometry for perceptual distortion, mixed units, occluded labels, synthetic values, and inaccessible chart-only actions.
- Inspect dependency imports, bundle scope, chart lifecycle, event cleanup, background behavior, and inactive-scene mounting.
- Review the final phone/tablet composition for generic-template patterns and remove unnecessary card framing or decorative effects that reduce scan speed.
- Resolve every confirmed finding before final verification.

**Acceptance:** the integrated feature is contract-safe, authorization-safe, financially honest, visually authored, and limited to the approved mobile scope.

### 10. Perform focused, full, runtime, and visual verification

Run in this order:

1. Dashboard parser, formatter, selector, geometry, option, lifecycle, component, and integration tests.
2. Existing workspace/navigation/session/query regression tests affected by the route change.
3. `cd mobile && npm run typecheck`.
4. `cd mobile && npm test` using the repository's normal full-suite path; investigate new open handles or failures rather than hiding them.
5. `cd mobile && npm run doctor` or the repository-equivalent dependency compatibility check.
6. `cd mobile && npm run export:android` with the approved development environment configuration.
7. Build/reload the Android development app when the native dependency path requires it, then authenticate with the existing loopback-development Super Admin flow without exposing credentials.
8. Validate the populated dashboard at 7, 30, and 90 days; comparison on/off; all four modules; partial and renderer-fallback paths; background/resume; repeated mount/unmount; pull refresh; and sign-out.
9. Capture temporary visual evidence at representative 360-, 390-, and 430-point phones, compact landscape, and tablet/rail layouts, plus large text and reduced motion. Inspect hierarchy, isometric accuracy, clipping, wrapping, contrast, touch targets, scroll conflicts, and bottom/safe-area clearance.
10. Inspect Metro and device logs for chart, React, network, animation, memory, and navigation errors. Profile startup, period/module transition responsiveness, and cleanup; report measured evidence without claiming unmeasured frame rates.
11. Run `git diff --check`, inspect `git status --short`, and compare the final changed paths to the ownership list.

**Acceptance:** every specification criterion has direct automated or rendered-runtime evidence; all required checks pass, and any platform check that cannot run is reported precisely as unverified.

## Parallel execution boundaries

Mode A may use three independent implementation slices after Tasks 1–2 establish the dependency and shared interfaces:

- The data-contract owner performs Task 3.
- The chart-engine owner performs Tasks 4–6 within `dashboard/charts/`.
- The dashboard-UX owner performs Task 7 against the agreed view/chart interfaces.

The primary agent retains shared tokens, dependency files, routing, and integration ownership, supplies contract changes to every slice, and performs Task 8 after writers finish. Agents must account for concurrent work, never restore or reformat another owner's files, and report any interface conflict before editing across boundaries.

Tasks 9 and 10 are sequential after all writers finish. In Mode A, run a dedicated integrity reviewer and then a verification runner on the integrated worktree. In Mode B, perform the equivalent review and verification inline in the primary thread.

## Rollback and external effects

- Rollback is limited to the new dashboard feature files, bounded integration edits, dashboard token additions, and the two approved runtime dependencies/lockfile entries.
- No backend change, data migration, seed, production mutation, third-party telemetry, external communication, deployment, commit, or push will be performed.
- Temporary screenshots, profiler output, Expo exports, build products, and runtime logs remain ignored/local verification artifacts and will not be committed.

## Completion record

Tasks 1–10 were implemented in approved Mode A. The integrated integrity review found and cleared four edge cases: Capital empty-state removal after data recovery, stable trend identities across metric changes, previous-only metric selection, and complete dated/unit-aware values-ledger coverage. Final hardening aligned the query hook with the canonical capability check and virtualized the bounded 90-day ledger.

Final checks passed: 11 dashboard suites / 52 tests, 65 mobile suites / 463 tests, mobile TypeScript, the ECharts dependency tree, Android Expo export, `git diff --check`, live 7/30/90-day response parsing, and portrait Android emulator rendering against local database data. The full Jest command exited successfully with `--forceExit`; the repository's ordinary full-suite process retains a known asynchronous handle after successful assertions.

No backend source, database data, authentication policy, OCR worker, migration, seed, deployment, commit, or push was changed or performed. Device landscape/tablet, large-text, screen-reader, reduced-motion, measured performance, native Gradle APK/AAB, and iOS builds remain outside the completed verification evidence.

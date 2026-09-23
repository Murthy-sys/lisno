# Premium mobile dashboard visualization — design specification

- Date: 2026-09-22
- Status: Implemented
- Classification: Substantial mobile visualization redesign with financial and authorization integrity requirements
- Affected area: `mobile/`; read-only use of the existing Super Admin dashboard API

## Goal

Replace the mobile Super Admin dashboard's generic metric-card grid with a purpose-built, premium analytical experience powered by Apache ECharts. The dashboard must express real database aggregates through custom isometric 3D graphics, deliberate data transitions, strong mobile information hierarchy, and exact accessible values. It must feel authored for Lisno rather than assembled from a chart template.

Visual sophistication cannot weaken metric meaning. Every displayed number, delta, chart mark, date, and availability state must trace to the authorized backend dashboard response. Missing data is unavailable, never fabricated or silently converted to zero.

## Current behavior and evidence

- `mobile/src/features/workspace/FeatureWorkspace.tsx` sends the Dashboard feature through `GenericFeatureWorkspace` and requests `/admin/dashboard/overview?periodDays=30`.
- `mobile/src/features/workspace/recordPresentation.ts` flattens only top-level primitive values. Most of the dashboard response is nested, so its project, client, finance, execution, workforce, governance, risk, trend, and comparison data is not meaningfully presented.
- The current screen renders repeated generic bordered metric blocks. It has no dashboard-specific hierarchy, period control, comparison view, chart interaction, or dedicated financial presentation.
- The backend already exposes a typed Super Admin dashboard contract with 7-, 30-, and 90-day periods; current/previous comparison windows; 30/90 daily buckets; project and client aggregates; estimation, design, procurement, finance, execution, workforce, governance, and risk modules; and per-metric data-quality status.
- The comparison contract includes Projects created, Clients created, Projects completed, Execution tasks completed, Estimates approved, Design plans approved, and Recorded expenses in paise. Count metrics and money are different units and must not share an axis.
- A read-only audit of the local development response confirmed that every major module is populated, with daily trend buckets, all seven comparison metrics, workforce roles, risk factors, and a top-risk project. The response is intentionally `partial` for metrics whose sources are unavailable. No private values or identities were captured in the specification.
- Dashboard access is currently limited to the Super Admin role and the `admin.dashboard.read` operation. The backend remains the authorization authority.
- The mobile app already provides Poppins typography, midnight/violet/gold brand colors, `react-native-svg`, Reanimated, and gesture handling. It does not currently include Apache ECharts, a React Native ECharts renderer, WebView, Skia, or a GL runtime.
- The web dashboard has an ECharts implementation and transition conventions, but the mobile screen requires its own touch, layout, memory, lifecycle, and accessibility decisions.

## Recommended approach and alternatives

### Recommended: native ECharts SVG with custom isometric geometry

Use Apache ECharts 6.1 through `@wuba/react-native-echarts` with its SVG renderer and the existing `react-native-svg` dependency. Author a bespoke ECharts `custom` series whose render items draw front, top, and side polygon faces for isometric prisms. Stable series/data identities, keyframe entry animation, and update transitions will make period and metric changes visibly continuous.

This approach keeps the chart inside the native React Native hierarchy, supports the requested Apache ECharts behavior, avoids a nested browser surface, and fits the bounded maximum of 90 trend buckets. The 3D effect is an intentional data encoding: height communicates magnitude, paired depth lanes distinguish current and previous periods, and selected faces disclose exact values. Perspective must never distort the ordering or make a smaller value appear larger.

### Alternative: ECharts-GL in a WebView

ECharts-GL would provide a true WebGL camera and volumetric bars, but mobile integration would require a WebView and a packaged browser runtime. It adds scroll/touch arbitration, accessibility duplication, memory overhead, error recovery, and offline-bundle complexity. The ECharts-GL source package also has current strict-ESM compatibility concerns with ECharts 6. This is not selected for the primary mobile dashboard.

### Alternative: a fully custom Skia chart system

React Native Skia could provide GPU-rendered geometry, but it would add a large dependency and require rebuilding selection, axes, labels, transitions, and value mapping outside the user's requested ECharts ecosystem. It is not selected.

The approved implementation will therefore deliver authored 3D visual language through ECharts custom geometry, while preserving exact 2D projections and native text equivalents for analytical accuracy.

## Scope

- A dedicated mobile Super Admin dashboard screen within the existing adaptive application shell.
- 7-, 30-, and 90-day period selection, current/previous comparisons, refresh, observed time, and data-quality status.
- Custom Apache ECharts visualizations for comparison, trends, project lifecycle, finance, workforce, governance, and risk.
- Dashboard-specific typed response parsing, display mapping, chart option generation, query keys, caching, and error handling.
- Responsive phone, landscape, and tablet compositions.
- Touch, screen-reader, large-text, reduced-motion, loading, empty, partial-data, stale-data, and chart-failure states.
- Focused regression coverage, native export/build checks, emulator visual checks, and runtime/performance inspection.

## Non-goals

- Changing backend metric definitions, financial formulas, authorization rules, database schema, records, or the dashboard endpoint.
- Adding forecasts, targets, scores, projections, or generated narrative that the backend does not provide.
- Showing raw client identities, contact information, ledger descriptions, private file links, or tokens.
- Redesigning unrelated mobile workspaces, authentication, onboarding, messaging, or the adaptive navigation shell.
- Replacing the existing web dashboard.
- Adding WebView, ECharts-GL, Three.js, Skia, continuous particles, decorative camera orbit, or game controls.
- Seeding, migrating, deploying, committing, pushing, or mutating production data.

## Experience direction

The visual concept is a compact operations console built around one spatial analytical stage. The dashboard uses a midnight base, ink and soft-white typography, violet depth planes, and restrained gold for selected or verified focal values. Risk colors retain their semantic roles. Poppins remains the product typeface.

The layout must avoid a wall of interchangeable rounded cards. A wide, edge-to-edge hero chart establishes the visual focus. Native editorial rails carry the primary facts, while module sections change scale and composition according to their content. Borders are structural and sparse. Depth comes from chart geometry, tonal planes, occlusion, light, and motion rather than glass effects or random gradients.

The screen opens with this reading order:

```text
Operations pulse                         7d  30d  90d
Observed time · data quality             Compare · Refresh

Projects                         Clients
Total · active · at risk         Registered · active · project-linked

CURRENT / PREVIOUS
Custom isometric comparison stage
Metric selection and exact selected values

Daily velocity
Current and previous trend, with actual UTC dates

Overview     Delivery     Capital     People
Context-specific visualization and action summary

Show all values · metric definitions · unavailable-data detail
```

On a phone, this is a single narrative scroll. On tablet and wide landscape sizes, the hero remains dominant while the supporting trend and module content can form a two-column composition. The page must not introduce horizontal page scrolling.

## Information architecture and chart system

### Operations header

- Label the screen “Operations pulse” within the existing Dashboard route.
- Show the backend `observedAt` time, UTC reporting basis, selected range, comparison range, and whether the final day is partial.
- Provide segmented 7/30/90-day controls, a comparison toggle, and refresh. Controls retain a minimum 44-by-44-point touch target and visible selected/focus state.
- Show `complete`, `partial`, or `unavailable` data quality as a concise native status. Partial availability is visible without treating it as a system failure.

### Native project and client facts

- Present Projects and Clients as two typographic rails rather than six equal cards.
- Projects: total, active, at risk, plus the period delta for projects created when available.
- Clients: registered, active, project-linked, plus the period delta for clients created when available.
- Distinguish current snapshots from period activity in labels. Do not imply that a period delta changes an inventory total.
- Values remain selectable/readable independent of the chart renderer.

### Hero: isometric comparison matrix

- Render six count metrics as grouped isometric prisms: Projects created, Clients created, Projects completed, Execution tasks completed, Estimates approved, and Design plans approved.
- Use a shared linear zero baseline. Each metric has a current prism and, when comparison is enabled and available, a previous prism in a receding depth lane.
- Derive top and side face colors from semantic Lisno tokens. Selected bars receive restrained gold edge light; unselected data remains legible rather than fading into decorative background.
- Perspective, face width, depth offset, and light direction are fixed. They must not change with values or create a false area/volume comparison.
- Axis/tick labels remain on the flat reading plane. Exact selected current, previous, delta, and percentage state appear in native text directly below the stage.
- Recorded expenses must never appear on this count chart. Money receives a separate finance view and currency scale.
- Tapping a metric selects it and drives the daily trend. A matching native selector provides the same operation without requiring precise picking.

### Daily velocity

- Show the selected count metric as current and previous daily series, aligned by day index while tooltips/value details disclose both actual UTC dates.
- Use a precise line/area projection rather than 3D perspective. Current is solid; previous is dashed and visually subordinate.
- Preserve gaps for unavailable history. Successful source reads with no events may be zero.
- Keep integer count ticks and bounded labels. On 90-day ranges, reduce label density without reducing data fidelity.

### Module views

A native segmented control changes the lower analytical scene between Overview, Delivery, Capital, and People. Only the active heavy chart is mounted.

| Module | Visualization | Required meaning |
| --- | --- | --- |
| Overview | Project lifecycle isometric stage, compact risk radial distribution, and top-risk summary | Lifecycle statuses remain an exhaustive current partition. Risk distribution and factors use backend categories and canonical ordering. |
| Delivery | Estimation, design, procurement, and execution flow with exact stage counts and completion measures | Current workflow states are not presented as a conversion funnel unless the backend establishes transitions. Unavailable modules show their reason. |
| Capital | Financial waterfall/composition and budget state | Approved net revenue excluding GST, cost budget, classified costs, recorded cost, remaining budget, and current profit/margin retain canonical paise calculations. Contract total and GST are labelled separately. Overspend is never clamped. |
| People | Workforce role distribution, assigned/unassigned work, KPI availability, and governance queue | Roles and queue counts come from backend aggregates. Missing KPI coverage is unavailable rather than poor performance. |

Decorative depth graphics around these charts may use native SVG/Reanimated, but they cannot encode independent or invented values.

### Value view and definitions

- “Show all values” opens a native, vertically scrollable value sheet grouped by the same information hierarchy.
- Every visualized series has an equivalent label/value representation, unit, time basis, and availability state.
- A metric-definition disclosure explains snapshot versus period activity, current/previous dates, partial-day behavior, count versus money units, and source availability.
- The value view is the accessible fallback if the chart renderer fails and the primary interface for screen readers when SVG chart semantics are incomplete.

## Data contract and integrity

- The existing `GET /api/v1/admin/dashboard/overview?periodDays=7|30|90` response is the sole metric source. The mobile client must not aggregate paginated list endpoints or synthesize database metrics.
- Add a typed mobile mirror/parser for the fields the dashboard consumes. Malformed required structure fails safely; optional/unavailable modules preserve their backend status and reason.
- Retain stable backend IDs for top-risk project selection or future navigation. Names and labels are presentation fields, never join keys.
- Money remains integer paise in state, selectors, and chart datasets. Conversion to rupees/currency text occurs only in explicit formatting functions.
- Preserve the backend's approved-estimate source, GST exclusion, cost classification, ledger-derived overhead, and current-profit semantics. Mobile does not recalculate finance from formatted values.
- Preserve the backend UTC window bounds, current/previous alignment, percentage basis points, “New,” and unavailable semantics. The client formats these fields without inventing a different comparison formula.
- Successful all-zero data renders a meaningful empty analytical state. Failed or unsupported sources render unavailable. These states must not look identical.
- The dashboard query family includes the selected period. Period changes may retain the prior response as visibly stale content during fetch, but old and new periods must never share a cache identity.
- The backend `admin.dashboard.read` operation and sole-active-Super-Admin checks remain authoritative. Mobile route visibility is presentation only.

## Motion and interaction choreography

Motion communicates data continuity. It cannot exist merely to make the screen appear active.

- First reveal: the spatial frame settles before prisms grow from the common baseline over approximately 650–800 ms with a capped metric stagger. Labels appear after their marks establish position.
- Period refresh: reuse the ECharts instance, series IDs, and stable data names so existing prisms interpolate to new heights and positions over approximately 450–650 ms. Do not remount the chart or replay the whole page.
- Metric selection: the chosen prism receives a short depth/edge-light response while the trend series updates through stable identities.
- Module change: matching marks may morph only where their semantics remain the same. Unrelated shapes cross-fade/translate as separate scenes; they must not imply data lineage that does not exist.
- Pull-to-refresh and explicit refresh update verified values in place. No fake count-up, random seed values, looping bars, auto-rotating camera, pulsing dashboard, or perpetual animation.
- Gestures must not trap vertical scroll. Chart selection uses taps; any horizontal scrub is bounded to the plot and has an equivalent selector/value control.
- Respect the operating-system reduced-motion preference. Reduced motion renders final states immediately and uses simple state changes without stagger or camera-like depth travel.
- Stop animation when the screen backgrounds. Dispose listeners and ECharts instances on unmount.

## Technical architecture

- Route the Dashboard feature to a dedicated `SuperAdminMobileDashboard` instead of the generic feature renderer. Other generic workspaces remain unchanged.
- Add dashboard-specific contract, parsing, format, selector, and option-builder modules with focused unit coverage. Avoid placing API mapping and chart geometry in the screen component.
- Add Apache ECharts 6.1 and `@wuba/react-native-echarts`; use the SVG renderer backed by the already-installed `react-native-svg`. Register only required ECharts components, coordinate systems, transitions, and custom-series support.
- Do not add WebView, Skia, ECharts-GL, Three.js, or a second chart framework.
- A bounded chart wrapper owns initialization, `setOption`, measured resize, event registration, background handling, and disposal. It keeps one stable chart instance for update transitions.
- Custom isometric render-item helpers accept normalized values and tokenized geometry. Numeric scaling remains ECharts' responsibility; polygon construction must be deterministic and testable.
- Mount only the active module's visualization. Avoid multiple invisible chart instances behind tabs.
- Use native React Native text and controls for headings, exact values, definitions, status, and essential actions. Do not inject credentials, raw identities, private record data, or unrestricted response objects into chart options.
- Extend existing mobile color/spacing/type tokens with dashboard semantic roles where necessary. Keep those additions scoped and reusable; do not introduce a competing app-wide theme.

## Responsive behavior

- Design and verify at representative 360-, 390-, and 430-point phone widths, a compact landscape phone, and tablet widths used by the adaptive rail.
- The hero stage reserves a stable aspect ratio and measures its container before ECharts initialization. No clipped labels, overlapping controls, or layout jump after chart load.
- Narrow phones keep the paired current/previous bars readable through controlled group spacing and abbreviated visible labels; complete labels remain in selectors and value views.
- Large text may stack the project/client rails and period controls. Exact values cannot be truncated in a way that changes their meaning.
- Safe-area insets, bottom navigation, keyboard/accessibility focus, and landscape height constraints remain respected.

## Accessibility

- Meet WCAG 2.2 AA contrast for native text and controls. Perspective faces must remain distinguishable without relying on low-opacity contrast.
- Do not encode series, risk, or availability by color alone. Use labels, line styles, face treatment, symbols, and native state text.
- Every control has a meaningful accessible name, role, selected/disabled state, and at least a 44-point target.
- Screen-reader order follows the visual reading sequence: header, facts, selected comparison values, trend summary, module summary, actions.
- The chart stage is either given a concise summary or hidden from the accessibility tree when its individual SVG shapes cannot provide reliable semantics. The native selector and value sheet expose the complete equivalent data and actions.
- Announce refresh success/failure and period changes without reading every animated value.
- Support reduced motion, increased text size, keyboard/remote focus where the platform provides it, and a non-chart fallback after render errors.

## Loading, empty, stale, partial, and error states

- Loading uses a static skeleton that mirrors the final spatial composition without showing demo numbers or animated fake bars.
- During a background refresh, keep the last successful data visible, mark it as updating, and preserve selection. A failed refresh retains the prior response with a clear retry state.
- A first-load failure shows a native explanation and retry action inside the dashboard route.
- Partial data keeps available modules usable and shows an availability summary. Each dependent visualization suppresses only the unavailable metric or module.
- A valid all-zero response uses zero baselines, explicit zero labels, and helpful empty copy; it must not render synthetic equal-size shapes.
- A chart-library initialization or render failure falls back to the native facts and complete values view. It must not crash the route or hide refresh.
- Authorization loss follows the existing session/permission flow and does not disclose dashboard data.

## Performance and lifecycle constraints

- Prefer ECharts SVG for this bounded, interaction-focused mobile dashboard, consistent with Apache ECharts guidance on lower memory use for smaller datasets on mobile devices.
- Limit the detailed time series to the backend maximum of 90 points per period. Configure animation thresholds and skip expensive transitions beyond the supported data shape.
- Import only used ECharts modules; avoid bundling unused chart families and renderers.
- Avoid continuous frame loops. Native ambient decoration must settle and stop.
- Keep chart option objects and event handlers stable where useful, and do not route high-frequency pointer movement through React state.
- Profile representative Android hardware/emulator behavior for startup, period switch, module switch, scroll responsiveness, memory growth, and chart cleanup. Do not claim a frame rate until measured.
- Preserve a useful static/native value experience on unsupported or resource-constrained devices.

## Risks and controls

- **3D distortion:** isometric volume can exaggerate area. Fix perspective and baseline, keep exact flat labels, use grouped bars only for like units, and provide a value table.
- **Financial misstatement:** formatting or mixed axes can corrupt meaning. Keep paise throughout data flow, isolate the finance scale, and test reconciliation with unequal values.
- **Partial source coverage:** treating missing modules as zero would mislead. Consume backend availability and data-quality keys explicitly.
- **Touch conflict:** chart gestures can block page scroll. Prefer tap selection, bound any scrub interaction, and provide native controls.
- **Renderer lifecycle:** retained chart instances can leak listeners or display stale data. Centralize initialize/update/resize/dispose and test repeated mount/period/module changes.
- **Dependency compatibility:** the React Native bridge must work with the repository's React Native, Expo, React, SVG, and ECharts versions. Validate the dependency matrix and a native export/build before considering the work complete.
- **Bundle and startup cost:** ECharts is substantial. Use modular imports, lazy dashboard loading where architecture permits, and measure the emitted bundle/start behavior.
- **Accessibility gaps in SVG:** individual paths may not expose dependable semantics. Keep all essential content and actions in native components.
- **Visual excess:** advanced treatment can reduce scan speed. Reserve 3D for the hero and bounded lifecycle/composition scenes; use precise 2D lines and native text where they communicate better.

## Acceptance criteria

1. The mobile Dashboard route uses a dedicated authored screen; other generic feature workspaces retain their behavior.
2. Every value and chart mark traces to the existing authorized dashboard API. There is no placeholder, random, locally inferred, or AI-generated business data.
3. Projects, clients, comparison, daily trends, delivery, finance, execution, workforce, governance, and risk data are represented when their backend sections are available.
4. Period selection supports 7, 30, and 90 days with correct query/cache identity, UTC dates, partial-day labeling, current/previous ranges, and backend-provided deltas.
5. The hero visibly uses an Apache ECharts custom series with authored isometric front/top/side geometry, tokenized Lisno styling, a truthful zero baseline, exact native values, and stable update transitions.
6. Count metrics never share an axis with Recorded expenses. Finance uses integer paise until formatting and reconciles with the canonical dashboard response, including GST, budget, recorded cost, remaining budget, profit, and overspend semantics.
7. Complete, partial, unavailable, all-zero, stale-refresh, first-load error, chart-render error, and authorization-loss states are distinguishable and usable.
8. Period, metric, and module changes preserve chart instances and stable identities where semantics match; transitions follow the approved choreography and reduced-motion removes nonessential movement.
9. The complete dashboard remains operable without precise chart picking. Screen readers and chart-failure fallback receive equivalent values, labels, units, time bases, availability, and controls.
10. The layout is visually checked at phone, landscape, and tablet sizes with no clipped data, overlapping controls, unsafe-area collision, or whole-page horizontal scroll.
11. The dashboard does not trap vertical scroll, leak chart instances/listeners, run continuous animation in the background, or mount inactive heavy chart scenes.
12. Focused contract/parser/formatter/geometry/option/screen tests, full mobile typecheck and test suite, native export/build validation, repository hygiene checks, and Android emulator runtime/visual checks pass. Any unrun platform build or measured-performance limitation is reported explicitly.

## Verification plan

- Unit tests for response validation, availability handling, UTC/range labels, paise formatting, finance mapping, stable IDs, custom prism geometry, option generation, and reduced-motion settings.
- Component tests for period/metric/module selection, loading/error/partial/empty states, value-sheet parity, refresh retention, and accessibility roles/names/states.
- Contract-drift or fixture checks against the backend dashboard type/shape so mobile cannot silently omit a required field change.
- Full mobile TypeScript and test suite, plus Expo/native export or build validation supported by the repository.
- Emulator inspection with the authorized local development account and populated local data. Capture phone portrait, phone landscape, tablet/rail, large-text, and reduced-motion states; verify console/logcat and network behavior.
- Exercise repeated period and module changes to check stable transitions, selection retention, gesture/scroll coexistence, app backgrounding, unmount cleanup, and memory behavior.
- Run `git diff --check` and inspect `git status --short`; preserve all unrelated worktree changes.

## Compatibility, migration, and rollback

The backend contract and database remain unchanged. No schema migration, seed, backfill, external side effect, or production write is required. The dependency lockfile will change only for the selected ECharts packages after implementation approval.

The API remains compatible because this is a new mobile consumer of existing fields. Rollback consists of removing the dedicated dashboard route/component and dependencies and restoring the generic renderer. No data rollback is necessary.

## Assumptions and open decisions

Approval of this specification selects the recommended native SVG approach, the midnight operations-console direction, and a 30-day default with comparison enabled. It also approves the information hierarchy and the deliberate restriction of 3D to visualizations where depth supports grouping.

No unresolved product choice blocks task planning. Exact prism angle, depths, label-density thresholds, token values, and transition curves are implementation details to refine against the emulator while preserving the requirements above.

## Apache ECharts research

Primary sources reviewed for this specification:

- [Apache ECharts Canvas versus SVG guidance](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/) supports SVG as a strong starting point for bounded mobile charts and lower memory use on constrained devices.
- [Apache ECharts data-transition guidance](https://echarts.apache.org/handbook/en/how-to/animation/transition/) establishes stable data names, separate enter/update timing, and animation thresholds.
- [Apache ECharts custom-series and keyframe animation release documentation](https://echarts.apache.org/handbook/en/basics/release-note/5-3-0/) supports custom graphic geometry and authored keyframes.
- [Apache ECharts API](https://echarts.apache.org/en/api.html) is the implementation reference for chart lifecycle, events, and option behavior.
- [`@wuba/react-native-echarts` repository](https://github.com/wuba/react-native-echarts) documents the React Native SVG/Skia renderers, touch support, and ECharts option compatibility.
- [ECharts-GL repository](https://github.com/ecomfe/echarts-gl) was evaluated for true WebGL rendering and rejected for this mobile analytical surface because of the integration and accessibility tradeoffs described above.

Applied design guidance: `lisno-implementation-planner` and `advanced-ui-design`.

## Implementation outcome

Implemented in `mobile/src/features/dashboard/` and routed through the existing authenticated Dashboard destination. The result uses the native SVG Apache ECharts renderer, custom isometric prism geometry, stable update identities, the canonical operation-capability gate, the existing authorized dashboard endpoint, explicit unavailable states, integer-paise finance handling, and a complete virtualized native values ledger.

Final verification passed 11 dashboard suites with 52 tests, the full mobile suite with 65 suites and 463 tests, TypeScript, dependency resolution, Android Expo export, repository whitespace checks, and a portrait Android emulator smoke test with real local data. The full Jest lane required `--forceExit` because the repository's normal runner retains a known asynchronous handle after all assertions pass.

Landscape/tablet, large-text, screen-reader, reduced-motion, measured frame-rate/memory, native Gradle APK/AAB, and iOS device matrices remain explicitly unverified. A single ZRender depth-order warning appeared in an earlier native session without a stack or visible failure; it did not reproduce after a controlled clean relaunch or in fresh ECharts 6.1 renders of every dashboard option.

# Lisno spatial dashboard visualization redesign — design specification

- Date: 2026-09-22
- Status: Implemented and locally verified
- Classification: Substantial cross-platform visualization redesign
- Affected areas: `mobile/src/features/dashboard/`, `frontend/src/features/admin/dashboard/`
- Data source: existing read-only Super Admin dashboard API

## Goal

Replace the conventional chart language on the mobile Dashboard and web Super Admin Dashboard with a purpose-built spatial visualization system built on Apache ECharts.

The current implementation uses familiar bar, pie, doughnut, waterfall, and line/area primitives. Adding bevels or isometric faces to those primitives does not satisfy the requested direction: the attached mobile screenshot still reads as a standard grouped bar chart. The redesigned dashboards must instead use advanced spatial forms whose structure matches the business question: operational constellations, faceted temporal ribbons, lifecycle topologies, delivery corridors, risk fields, capacity clusters, and capital-flow scenes.

The redesign must keep the existing database-backed metrics, authorization boundary, units, availability semantics, and financial reconciliation. Visual sophistication cannot invent records, imply false flow, hide zero or unavailable values, or make a smaller value appear larger.

## Current behavior and evidence

### Mobile

- The current dedicated Super Admin dashboard is backed by `/admin/dashboard/overview` and already preserves authorized database values, current/previous ranges, daily buckets, partial-data status, exact-value ledgers, and canonical paise formatting.
- Its hero comparison chart uses custom isometric prisms. Despite custom polygon faces, it remains a grouped vertical bar chart with a baseline, repeated columns, and category labels.
- Other mobile dashboard modules still register or render `bar`, `pie`, and `line` ECharts series for delivery, workforce, risk, trends, and portions of capital.
- The native runtime uses Apache ECharts 6.1 through `@wuba/react-native-echarts` with the SVG renderer. This path is functioning and already has lifecycle, failure fallback, and accessibility support.

### Web Super Admin dashboard

- The web dashboard is also backed by the existing Super Admin dashboard contract and already provides exact-value tables through `ChartFigure`.
- `DashboardOverviewCharts.tsx` uses line/area, stacked bar, doughnut, ranked bar, and financial bar charts.
- `echarts/DashboardModuleECharts.tsx` and `dashboardCharts.tsx` use line, stacked bar, category bar, and waterfall forms across Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk.
- `dashboardEChartsRuntime.ts` currently registers `LineChart`, `BarChart`, and `PieChart`, and replaces entire series/axis groups during updates. That update strategy limits meaningful shape continuity for a spatial custom-series system.

### Root cause

The problem is the visualization grammar, not the color palette or amount of animation. The current charts start with standard analytical primitives and decorate them with depth. The requested result requires different data structures and silhouettes from the beginning.

## Product principles

1. **Spatial structure must carry meaning.** Depth, position, size, ribbon width, adjacency, and elevation must each have a documented business meaning.
2. **No conventional chart silhouette.** Dashboard production views must not visually resolve into vertical or horizontal bars, pie/doughnut sectors, gauges, simple polylines, or a conventional waterfall.
3. **Exact values remain primary.** Every scene includes readable exact values through native/HTML labels, selection details, and the existing value table or ledger.
4. **Perspective stays honest.** The camera, light direction, depth scale, and projection are fixed. Perspective cannot vary with the data or reorder magnitude.
5. **Snapshots are not funnels.** Connectors between workflow statuses communicate sequence or relationship only. They must not imply conversion or entity movement unless the API provides that transition data.
6. **Motion explains change.** Transitions show a period, metric, selection, or module change. There is no decorative auto-rotation, infinite particle field, or continuous camera orbit.
7. **The two dashboards share one visual language.** Web can use more screen space and bounded pointer parallax, while mobile uses a fixed camera and touch-first focus. Metric meaning and scale rules remain the same.

## Recommended technical approach and alternatives

### Recommended: ECharts custom-series spatial projection

Build the scenes with Apache ECharts `custom` series and a small, deterministic projection layer that maps semantic `(x, y, z)` coordinates to the display plane. Render depth-sorted polygon faces, bezier ribbons, elliptical orbs, halos, floor planes, contour paths, labels, and focus meshes as ECharts graphic elements.

This is more than an isometric skin:

- Orbs use area-correct square-root scaling for count magnitude.
- Temporal values form connected faceted ribbon surfaces across time and depth lanes.
- Financial values use proportional flow width and signed direction.
- Topology nodes use fixed semantic positions rather than a baseline.
- Occlusion, depth tint, shadow falloff, and bounded parallax establish space without changing analytical order.

Use ECharts 6 stable series/data IDs and child element identities so `setOption` animates shape, position, size, and style between states. Update the web runtime to merge compatible spatial scenes instead of replacing every series on each change. Mobile retains its native ECharts SVG surface and lifecycle controls.

This approach requires no new rendering dependency, works through the established mobile native bridge, preserves offline behavior, and keeps both platforms on Apache ECharts 6.1.

### Alternative: ECharts-GL with a mobile WebView

ECharts-GL provides literal WebGL camera scenes on the web. On native mobile it would require a WebView, a separately packaged browser chart runtime, duplicate accessibility content, touch/scroll arbitration, and additional crash/loading recovery. The published ECharts-GL compatibility guidance targets ECharts 5.x, while this repository uses ECharts 6.1. Selecting it would create two runtimes and a material compatibility risk. It is not selected.

### Alternative: Three.js / React Three Fiber

Three.js could create full free-camera scenes, but it would replace the requested ECharts chart engine, add a second cross-platform rendering architecture, and require custom interaction, chart semantics, accessibility, and native Expo GL work. It is disproportionate for bounded dashboard aggregates and is not selected.

The recommended design therefore provides authored perspective-projected 3D analytical scenes with depth sorting and spatial transitions. It does not claim to be free-orbit WebGL.

## Scope

- Redesign the mobile Super Admin Dashboard visualizations.
- Redesign the web Super Admin Dashboard overview and all module-tab visualizations.
- Replace dashboard `bar`, `pie`, doughnut, waterfall, gauge-like, and simple `line`/area series with spatial custom-series scenes.
- Introduce shared visual rules for projection, depth, scale, lighting, selection, transitions, reduced motion, and fallbacks.
- Preserve the existing API contract, period controls, comparison behavior, exact-value views, availability handling, permission checks, stale-data behavior, and financial calculations.
- Preserve responsive phone, landscape, tablet, laptop, and desktop behavior.
- Add focused geometry, mapping, transition, accessibility, visual, and regression verification.

## Non-goals

- Changing backend metrics, database schemas, records, calculation rules, dashboard permissions, or the `/admin/dashboard/overview` contract.
- Adding forecasts, targets, simulated employees, synthetic projects, AI narratives, or decorative business data.
- Adding ECharts-GL, WebView, Three.js, React Three Fiber, Skia, WebGPU, or a second chart runtime.
- Making scenes freely rotatable or requiring the user to manipulate a 3D camera to read a value.
- Redesigning authentication, navigation, unrelated mobile workspaces, or non-dashboard web pages.
- Seeding, migrating, deploying, committing, pushing, or mutating production data.

## Visual system: Lisno Spatial Operations Atlas

The dashboard becomes an operations atlas rather than a stack of chart cards. Its visual field uses a deep ink ground, violet spatial planes, mineral-white typography, restrained gold focus light, cyan period comparison, and semantic risk colors. Depth comes from geometry, overlap, lighting, and perspective. It does not use generic glass panels, random gradients, or excessive rounded cards.

Each scene has four layers:

1. **Orientation layer:** a restrained floor lattice, depth rails, or orbital guide establishes the coordinate system.
2. **Data layer:** orbs, ribbons, nodes, corridors, and contour meshes encode database values.
3. **Focus layer:** selection light, guide tether, and a native/HTML value readout connect the mark to its exact value.
4. **Context layer:** visible title, unit, current/previous range, availability, and scale description prevent ambiguous reading.

Decorative elements cannot carry a value that is absent from the API.

## Spatial chart families and data contracts

### 1. Operations constellation

Purpose: replace the grouped comparison bars for Projects created, Clients created, Projects completed, Execution tasks completed, Estimates approved, and Design plans approved.

- Arrange the six metrics at stable coordinates around a central period core rather than along a baseline.
- Current and previous values occupy paired depth lanes at each metric coordinate.
- Orb cross-sectional area, not diameter, is proportional to the value through square-root radius scaling.
- A zero value remains a small outlined anchor with a visible `0`; unavailable values become a broken/disabled anchor with a reason.
- Current and previous use the same scale and camera. Exact current, previous, delta, percent state, unit, and period dates appear in the focus readout.
- Selecting a metric recenters the constellation through bounded camera translation and drives the temporal ribbon field.
- Recorded expenses remain excluded from this count scene because paise cannot share the count scale.

### 2. Temporal ribbon field

Purpose: replace simple current/previous line and area charts.

- Convert each daily bucket sequence into a faceted ribbon surface suspended above a dated floor rail.
- Time advances horizontally; value controls vertical position; current and previous occupy separated depth lanes.
- The ribbon width is constant and carries no extra metric. Its upper edge and facet vertices use the same truthful value scale.
- Gaps remain open for unavailable history. Verified no-event days reach the zero plane.
- Current and previous dates are disclosed separately when aligned by day index.
- At 90 days, all points remain in the geometry while visible labels thin deterministically.
- Keyboard/touch step controls and the exact-value table provide precise navigation without requiring pointer scrubbing.

### 3. Lifecycle orbit

Purpose: replace lifecycle doughnuts, stacked bars, and ranked status charts.

- Place canonical project statuses at fixed positions on a shallow elliptical orbit around the total-project core.
- Node area uses square-root scaling from current status count.
- Ordered guide paths indicate the canonical lifecycle sequence only. Copy explicitly states that counts are current snapshots and paths do not represent measured conversion.
- Status labels and exact counts remain visible or focusable; zero and unavailable states keep their semantic positions.
- On mobile, the orbit uses a fixed axonometric view. On web, pointer movement may shift the camera by at most three degrees without changing node order or requiring hover.

### 4. Delivery corridors

Purpose: replace estimation, design, procurement, and execution bar/stacked-bar views.

- Each workflow appears as a spatial corridor with fixed semantic waypoints for its backend-defined states.
- Aggregated state is encoded by waypoint orb area and a short pulse envelope, not by rectangular height.
- Connecting ribbons communicate process order. Ribbon width is neutral unless the API provides a valid shared measure; it must not imply conversion between snapshot counts.
- Completion measures may use a bounded illuminated track whose length follows a labelled 0–100% scale, rendered as a spatial path rather than a bar or gauge.
- Missing modules collapse to a labelled inactive corridor with the backend reason.

### 5. Capital flow scene

Purpose: replace financial bars and waterfall charts.

- Begin with approved net revenue excluding GST as the source plane.
- Route proportional signed ribbons through the backend's classified cost groups into recorded cost, remaining budget, and current profit/margin outcomes.
- Ribbon width uses one documented paise scale. Positive and negative values use directional flow and semantic color; overspend is shown as a reverse/downward breach path and is never clamped.
- Contract total and GST appear as separate context nodes and cannot be visually added twice to net revenue.
- Exact rupee values, formulas, and availability remain outside the rendered paths in readable text/table form.
- At least two unequal project/portfolio values must reconcile to the exact backend totals in tests.

### 6. Workforce capacity topology

Purpose: replace workforce bars and pie/doughnut distributions.

- Render each backend role aggregate as a labelled cluster node in a stable topology.
- Cluster area uses square-root count scaling. Do not create one visual person per count because the API provides aggregates, not individual employee records.
- Assigned and unassigned work appear as paired satellites with exact counts and a labelled relationship to the role or total-work core.
- KPI availability and governance queues use distinct semantic nodes; unavailable KPI coverage cannot look like poor performance.
- Queue severity and risk use semantic color plus shape/pattern, so color is not the sole signal.

### 7. Risk field

Purpose: replace risk pie/doughnut and ranked bar charts.

- Place canonical risk bands and backend risk factors on a fixed perspective field.
- Risk-band node area uses square-root project-count scaling. Concentric contour halos indicate selection and severity, not share of a circle.
- The top-risk project becomes a labelled focal beacon only when the authorized response includes it.
- Factor nodes connect to their relevant summary using relationships already present in the response; no inferred causality is drawn.
- Exact counts, ordering rules, and unavailable reasons remain in adjacent values and tables.

## Screen composition

### Mobile Dashboard

The existing project/client facts and period controls remain concise native content. The first visual focus becomes the Operations constellation, followed by the selected metric's Temporal ribbon field. The lower module selector retains Overview, Delivery, Capital, and People, but each module uses the corresponding spatial scene above.

The page remains a single vertical narrative with no horizontal page scroll. Scenes use a fixed camera and tap/focus selection. Only the active lower module scene mounts. The exact-value ledger remains available and keeps complete current/previous daily bucket coverage.

### Web Super Admin Dashboard

The overview uses a wide Operations constellation and Temporal ribbon field, with Client topology, Lifecycle orbit, Risk field, and Capital flow arranged as editorial analytical regions rather than a uniform card grid.

Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk tabs adopt the same scene families. Desktop layouts can place a main scene beside its exact-value table or native summary. Tablet and narrow layouts stack the same reading order without shrinking desktop geometry beyond legibility.

## Interaction and transition choreography

- Initial reveal: orientation plane resolves first, then data nodes/ribbons enter by depth, followed by labels. Total duration is bounded to approximately 700 ms.
- Period change: semantic marks keep stable IDs and interpolate position, radius, ribbon shape, color, and focus. They do not disappear and regrow from a baseline.
- Metric change: the focus tether moves to the selected constellation node while the temporal ribbon facets morph to the new daily sequence.
- Comparison toggle: the previous-period depth lane folds into or out of the scene; current geometry does not jump.
- Module change: the outgoing scene exits through a short depth fade and the new scene establishes its orientation plane before data appears.
- Pointer parallax on web is bounded, optional, and never changes the data projection enough to alter magnitude reading.
- Reduced motion removes staged reveals, parallax, and nonessential interpolation. The final data state appears immediately or with a short opacity change.
- There is no continuous render loop while the dashboard is idle.

## Data, API, authorization, and financial invariants

- The existing `/admin/dashboard/overview?periodDays=7|30|90` response remains the sole business-data source.
- The backend `admin.dashboard.read` operation remains authoritative. Frontend/mobile visibility is only a synchronized consumer check.
- Existing strict response parsing, query keys, environment/user cache isolation, data-quality metadata, stale-data retention, and error states remain intact.
- Every scene mark maps to a stable backend metric key and stores its unit, availability, and exact display value.
- Count, percentage, and paise values never share an unlabeled scale.
- Finance stays in integer paise until formatting. Approved net revenue excluding GST remains the financial source of truth, and recorded/classified costs, remaining budget, profit, and margin must reconcile exactly.
- `null` or backend-unavailable metrics remain unavailable. They are never converted to zero. A successful available source with no records may display zero.
- Stable IDs, not labels, connect marks, selections, exact-value rows, tooltips, and announcements.
- No backend, database, migration, permission, or production-data change is required.

## Rendering architecture

### Shared conceptual contract

Both implementations use the same projection vocabulary and scale rules:

- fixed camera and vanishing geometry per scene family;
- deterministic `(x, y, z)` projection;
- depth sorting before shape output;
- square-root radius for count-area encoding;
- linear vertical scale for temporal values;
- linear width scale for paise flows;
- explicit signed direction for negative finance states;
- stable semantic IDs for series, data, and rendered children.

Pure geometry functions accept normalized data and viewport dimensions and return testable projected shapes. Platform-specific text, controls, and lifecycle code remain in their current packages.

### Mobile

- Keep `@wuba/react-native-echarts`, Apache ECharts 6.1, `react-native-svg`, lazy registration, and the existing chart failure boundary.
- Register only the ECharts modules needed for custom-series spatial scenes within the dashboard runtime.
- Preserve a single chart instance through compatible period/metric updates, dispose on unmount, pause nonessential work when the app is inactive, and mount only the active lower module.
- Use bounded face/node counts and no particle systems.

### Web

- Keep the existing lazy ECharts runtime and external accessible `ChartFigure` structure.
- Replace feature-local bar, pie, and line registrations/usages with custom-series support and required tooltip/dataset/accessibility components.
- Merge updates using stable IDs for compatible scenes. Explicitly remove obsolete scene families without wholesale replacement that destroys transition continuity.
- Maintain keyboard datum navigation, visible focus, exact-value tables, resize handling, renderer disposal, and chart-error fallback.

## Accessibility and failure behavior

- Canvas/SVG geometry is supplementary. Every metric remains available through semantic native/HTML controls and exact-value tables or ledgers.
- Each scene has a concise description naming the metric, unit, range, comparison basis, and encoding.
- Keyboard and screen-reader users can select metrics and step through time buckets without interacting with projected paths.
- Focus order follows the visible reading order. Focus is never represented by glow alone.
- Risk and status use labels and shape/pattern in addition to color.
- Large text may move labels into an adjacent value rail rather than overlap geometry.
- First-load, stale refresh, partial, unavailable, all-zero, renderer failure, and authorization-loss states remain distinguishable.
- If ECharts fails, exact values and controls remain usable; the page must not become blank.

## Responsive and performance requirements

- Verify mobile portrait, mobile landscape, tablet, laptop, and wide desktop layouts.
- Mobile scenes preserve at least 44-by-44-point interactive targets and never trap vertical scrolling.
- Web scenes support keyboard access and do not depend on hover.
- Cap scene complexity per family and avoid generating marks for identities absent from the API.
- No idle animation loop, automatic camera orbit, unbounded shadow blur, or high-density particles.
- Lazy-load the web runtime, retain the current mobile module-mount strategy, and dispose listeners/instances deterministically.
- Reduced-capability and reduced-motion modes retain the spatial layout while removing parallax, long morphs, and expensive shadow layers.

## Risks and mitigations

- **Novel visuals can reduce scan speed.** Keep stable positions, visible labels, exact-value rails, a scene description, and predictable focus behavior.
- **Perspective can distort magnitude.** Use fixed projection, area-correct node scaling, shared scales, depth-independent labels, and tests for ordering/scale monotonicity.
- **Workflow connectors can imply conversion.** Label them as ordered snapshot states and keep connector width neutral unless a real transition measure exists.
- **Financial ribbons can hide reconciliation errors.** Generate them from one tested paise mapping and verify source/outflow/outcome identities with unequal fixtures and overspend.
- **Custom-series transitions can become discontinuous.** Use stable semantic IDs and shape-compatible children; update compatible scenes through normal ECharts diffing.
- **Dense custom SVG can affect mobile performance.** Bound face/node counts, mount one lower scene, avoid particles and continuous loops, and inspect 90-day data on a device.
- **Cross-platform drift can change meaning.** Test the same normalized fixtures against the documented scale and ordering rules on both platforms.
- **ECharts-GL expectations.** The selected architecture is spatial projected 3D within supported ECharts 6 custom series. It deliberately avoids an unverified ECharts-GL/WebView runtime.
- **Existing dirty work can be overwritten.** Preserve all current mobile dashboard work and unrelated files; redesign only through reviewed diffs after plan approval.

## Acceptance criteria

1. The mobile Dashboard and web Super Admin Dashboard overview/module tabs contain no production ECharts `bar`, `pie`, doughnut, conventional waterfall, or simple `line`/area series.
2. No primary dashboard visualization resolves visually into repeated rectangles on a common baseline, circle sectors, or a standard chart with cosmetic extrusion.
3. The seven approved scene families are implemented where their corresponding metrics exist: Operations constellation, Temporal ribbon field, Lifecycle orbit, Delivery corridors, Capital flow, Workforce topology, and Risk field.
4. Every mark and transition traces to an existing authorized dashboard metric, stable key, unit, availability state, and exact value. No placeholder, random, inferred, simulated-person, or AI-generated business data appears.
5. Current/previous counts use one truthful scale; count, percentage, and paise metrics remain separated; zero and unavailable states are visibly distinct.
6. Financial scenes preserve integer-paise lineage, exclude GST before margin calculations, show signed overspend, and reconcile exactly with the backend response for unequal fixtures.
7. Snapshot workflow states do not claim conversion or movement that the API does not provide.
8. Period, comparison, metric, and compatible scene updates use stable IDs and visible ECharts shape/position transitions. They do not destroy and recreate the entire scene without continuity.
9. Motion is bounded and purposeful, stops while idle, and respects reduced motion. No auto-rotation, looping particles, or required camera manipulation is present.
10. Exact native/HTML values, tables/ledger, keyboard/touch selection, screen-reader names, focus states, units, dates, availability, and failure fallbacks remain complete without relying on the visual geometry.
11. Mobile portrait/landscape/tablet and web narrow/laptop/wide layouts pass rendered visual review with no clipping, unreadable overlap, unsafe-area collision, horizontal page scroll, or scroll trapping.
12. Focused geometry/data/finance/transition/accessibility tests, full mobile and frontend typechecks/tests/builds, native Android export/runtime checks, web browser interaction/console checks, and repository hygiene checks pass. Any unrun platform or measured-performance check is reported explicitly.

## Verification requirements

- Unit tests for projection determinism, depth sorting, square-root area scale, temporal linear scale, signed ribbon width/direction, zero/unavailable geometry, stable semantic IDs, and reduced-motion options.
- Data-mapping tests that trace each scene mark to the response field and reject cross-unit composition.
- Finance reconciliation tests with at least two unequal datasets, GST, zero values, partial availability, and overspend.
- Component tests for period/comparison/metric/module selection, exact-value parity, keyboard/touch navigation, loading/error/stale/partial/empty states, and chart-failure fallback.
- Static regression checks over dashboard production paths preventing `type: "bar"`, `type: "pie"`, and simple `type: "line"` from returning.
- Mobile: focused dashboard tests, full tests, TypeScript, Android export/build supported by the repository, emulator portrait/landscape inspection, repeated transitions, console/log review, and lifecycle cleanup.
- Web: focused dashboard tests, full tests, TypeScript, production build, browser review across narrow/laptop/wide viewports, keyboard/reduced-motion checks, console/network review, and repeated transitions.
- Visual review must confirm that the result reads as the Lisno Spatial Operations Atlas rather than a recolored dashboard template.
- Run `git diff --check` and inspect `git status --short`, preserving unrelated and generated local work.

## Compatibility, migration, rollback, and side effects

- No API, database, migration, seed, permission, or production-data change is required.
- No new visualization dependency is expected; both packages already contain the selected Apache ECharts paths.
- The change is feature-local and reversible by restoring the previous dashboard visualization components and runtime registrations.
- Existing exact-value tables, ledgers, native controls, and data parsers provide a stable fallback during visual rollout.
- No deployment, external communication, commit, push, or production mutation is included.

## Open decisions

No user decision is required beyond specification approval. The selected approach interprets “advanced 3D graphs” as authored spatial analytical scenes built with supported Apache ECharts 6 custom-series geometry on both platforms. Literal free-orbit WebGL is intentionally outside this scope because it would require an incompatible/divergent mobile runtime and would weaken cross-platform reliability.

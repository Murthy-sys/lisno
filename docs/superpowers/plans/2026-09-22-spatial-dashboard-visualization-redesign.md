# Lisno spatial dashboard visualization redesign — implementation plan

- Date: 2026-09-22
- Status: Completed and locally verified (Mode A)
- Specification: [`docs/superpowers/specs/2026-09-22-spatial-dashboard-visualization-redesign-design.md`](../specs/2026-09-22-spatial-dashboard-visualization-redesign-design.md)
- Classification: Substantial cross-platform visualization redesign
- Execution scope: local implementation and verification only

## Outcome

Replace every conventional production chart on the mobile Dashboard and web Super Admin Dashboard with the approved Apache ECharts spatial scene system:

1. Operations constellation
2. Temporal ribbon field
3. Lifecycle orbit
4. Delivery corridors
5. Capital flow scene
6. Workforce capacity topology
7. Risk field

The implementation preserves the current backend contract, authorization, database-derived values, exact-value tables/ledger, availability semantics, UTC periods, and integer-paise financial lineage. It introduces no backend, database, migration, deployment, seed, or production-data work.

## Current worktree and preservation boundary

The repository is already dirty from the approved mobile dashboard implementation. These paths are part of that existing work and must be extended rather than reverted:

- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/features/workspace/FeatureWorkspace.tsx`
- `mobile/src/features/dashboard/**`
- `docs/superpowers/specs/2026-09-22-premium-mobile-dashboard-visualization-design.md`
- `docs/superpowers/plans/2026-09-22-premium-mobile-dashboard-visualization.md`

`mobile/.expo/dev/logs/start.log` is generated/pre-existing dirty state. It must not be edited, staged, restored, or treated as a deliverable. Any new Expo output remains local and must be reported.

Before writers begin, the primary agent will capture `git status --short`, the relevant mobile diff, the relevant frontend diff, and the exact production references to bar/pie/line series. No task may revert unrelated changes.

## Fixed implementation contract

The following decisions are settled by the approved specification and must not be reinterpreted independently by implementation agents:

- Apache ECharts 6 custom series remain the chart engine on both platforms.
- No ECharts-GL, WebView, Three.js, React Three Fiber, Skia, WebGPU, or new chart dependency is added.
- Dashboard production series cannot use `bar`, `pie`, or simple `line`/area types. Conventional doughnuts, waterfalls, gauges, and baseline columns are also removed.
- ECharts custom-series child shapes may use paths, lines, polygons, ellipses, circles, text, and groups; the restriction applies to analytical series and conventional chart composition.
- Count-orb area uses square-root scaling. Temporal height uses a linear scale. Financial flow width uses a linear paise scale. Negative financial states use signed direction.
- Cameras and projections are deterministic and fixed per scene. Web parallax is bounded to three degrees and carries no metric.
- Stable backend keys drive series IDs, data IDs, focus, announcements, and exact-value rows. Presentation labels never serve as joins.
- Unavailable stays unavailable; an available no-event result may be zero.
- Workflow connectors show canonical order only unless a backend transition measure exists.
- Count, percent, and paise metrics remain on separate labelled scales.
- Reduced motion removes staged reveals and parallax. There is no idle animation loop or automatic orbit.

## Ownership and parallel boundaries

If execution mode A is selected, work divides as follows after the primary agent publishes the fixed projection/scale contract to both writers:

| Owner | Exclusive write scope | Responsibilities |
| --- | --- | --- |
| Primary agent | This plan/spec, cross-platform contract decisions, final integration and reconciliation | Capture baseline, coordinate scale/ID conventions, inspect both diffs, resolve contract conflicts, update status after verified completion. |
| Mobile frontend implementer | `mobile/src/features/dashboard/**`; `mobile/src/features/workspace/FeatureWorkspace.tsx` only if routing integration needs adjustment | Mobile projection primitives, seven scene builders as applicable, runtime registration, native composition, touch/accessibility, and mobile tests. |
| Web frontend implementer | `frontend/src/features/admin/dashboard/**` | Web projection primitives, overview/module scene builders, ECharts runtime updates, responsive composition/CSS, keyboard/accessibility, and web tests. |
| Integrity reviewer | Read-only integrated diff | Verify data lineage, finance, availability, authorization, stable IDs, transition semantics, and cross-platform consistency. |
| Verification runner | Read-only integrated worktree | Run final focused/full checks and rendered/runtime QA; report exact evidence and unrun checks. |

The mobile and web writers must not edit each other's package. Neither writer may alter backend contracts, shared authorization policy, generated logs, package manifests, or lockfiles. No new dependency is expected. If a genuine cross-boundary requirement appears, the writer stops that slice and reports it to the primary agent.

If execution mode B is selected, the primary agent performs the same tasks sequentially and applies the same ownership boundaries conceptually.

## Dependency-ordered task graph

```text
T0 Baseline and invariants
  └── T1 Spatial primitives and scene contract
        ├── T2 Mobile spatial dashboard
        └── T3 Web spatial dashboard
              └── T4 Integrated reconciliation and regression hardening
                    └── T5 Integrity review and confirmed fixes
                          └── T6 Final verification and visual QA
```

T2 and T3 may run in parallel only after T1's coordinate, scaling, ID, motion, and availability rules are fixed. T4–T6 are sequential on the integrated worktree.

## T0 — Capture baseline and protect existing work

**Owner:** Primary agent  
**Dependencies:** Approved plan and selected execution mode  
**Writes:** None beyond task-status bookkeeping in this plan after implementation begins

### Actions

1. Record the initial dirty-path set and relevant per-target diffs.
2. Record every production dashboard series/runtime registration using bar, pie, line/area, waterfall, or gauge composition.
3. Run the currently focused mobile dashboard and frontend dashboard tests to establish whether the starting tree is green before redesign edits.
4. Confirm package versions and that no dependency change is required.
5. Preserve existing mobile data/query/parser/ledger behavior as the regression baseline.

### Exit criteria

- Dirty paths and current diffs are understood.
- Any pre-existing failure is separated from redesign failures.
- Writers receive explicit non-overlapping ownership and the fixed contract.

## T1 — Establish deterministic spatial primitives and scene contracts

**Owner:** Primary agent defines the contract; each platform writer implements it inside its own package  
**Dependencies:** T0  
**Parallel:** Platform implementations may begin after the contract is published

### Contract to publish

- Coordinate system and fixed camera constants for phone, tablet/narrow web, and wide web.
- Projection function signature from semantic `(x, y, z)` to screen coordinates.
- Stable depth-sort rule with deterministic tie-breaking.
- Count radius function with square-root scaling, minimum zero anchor, maximum cap, and unavailable representation.
- Temporal domain/range mapping, facet construction, current/previous depth lanes, and gap behavior.
- Signed financial flow-width mapping, zero flow, overspend direction, and paise reconciliation inputs.
- Stable ID format for scene, series, datum, and rendered child.
- Motion durations/easing for initial, update, selection, comparison, and reduced-motion states.
- Semantic palette, depth-lighting adjustments, focus treatment, and non-color risk/status distinction.
- Maximum node/face counts and label-density rules.

### Mobile target structure

The mobile implementer may refine filenames, but responsibility remains within `mobile/src/features/dashboard/charts/`:

- deterministic projection/scale/depth utilities;
- reusable custom-series primitives for orb, ribbon, contour, corridor, guide plane, tether, label anchor, and flow path;
- scene option builders for constellation, temporal ribbon, lifecycle orbit, delivery corridor, capital flow, workforce topology, and risk field;
- scene-level types and stable-ID helpers;
- geometry/scale/option tests.

Existing `prismSeries.ts` and conventional chart builders must be removed or retired once no production scene depends on them.

### Web target structure

The web implementer may refine filenames, but responsibility remains within `frontend/src/features/admin/dashboard/echarts/` and the dashboard feature root:

- deterministic projection/scale/depth utilities;
- matching custom-series primitives and scene option builders;
- scene types and stable-ID helpers;
- runtime update behavior for shape continuity;
- geometry/scale/option tests.

### Required tests

- Projection is deterministic for identical inputs and responsive viewport presets.
- Depth order is stable and monotonic.
- Doubling count does not double orb radius; orb area remains proportional to count within caps.
- Temporal scale is linear and preserves zero/unavailable gaps.
- Paise flow width is monotonic, signed direction is preserved, and overspend is not clamped.
- Stable IDs do not depend on translated/presentation labels.
- Reduced-motion options remove staged/keyframe motion and parallax.

### Exit criteria

- Both packages implement the same semantic scale and ID rules.
- Pure primitives pass focused tests before screen integration.

## T2 — Implement the mobile spatial dashboard

**Owner:** Mobile frontend implementer  
**Exclusive files:** `mobile/src/features/dashboard/**`, with the existing workspace route touched only if required  
**Dependencies:** T1  
**May run parallel with:** T3

### T2.1 Runtime and transition foundation

1. Update the mobile ECharts runtime to register `CustomChart` and only the components required by custom scenes.
2. Remove dashboard runtime registrations for `BarChart`, `PieChart`, and `LineChart` when no production option uses them.
3. Preserve initialize/update/resize/dispose behavior and error fallback.
4. Use stable option/series/data/child IDs and normal compatible updates so period/metric changes visibly interpolate.
5. Keep inactive lower modules unmounted and prevent an idle animation loop.
6. Eliminate invalid `z`, `z2`, or `zlevel` values and cover geometry output with finite-number checks.

### T2.2 Replace the hero and daily comparison

1. Replace the isometric comparison matrix with the Operations constellation.
2. Keep the six approved count metrics and exclude recorded-expense paise from the shared count scale.
3. Preserve current/previous availability, delta, percent state, exact focus values, and previous-only selectable metrics.
4. Replace daily line/area output with the Temporal ribbon field, including all 7/30/90-day buckets and separate current/previous dates.
5. Add touch-safe native selectors/step controls so precise chart picking is optional.

### T2.3 Replace lower module scenes

1. **Overview:** Lifecycle orbit plus Risk field and top-risk context.
2. **Delivery:** Estimation, Design, Procurement, and Execution corridors with snapshot-state copy and availability handling.
3. **Capital:** Signed Capital flow scene using existing view-model financial values and exact paise formatting.
4. **People:** Workforce capacity topology, assigned/unassigned satellites, KPI availability, and governance nodes.
5. Remove/retire mobile production bar, pie, simple line/area, waterfall, and prism-column builders.

### T2.4 Mobile composition, accessibility, and states

1. Recompose `DashboardCharts.tsx` and `SuperAdminMobileDashboard.tsx` around the approved atlas reading order without turning every scene into an identical card.
2. Preserve period, comparison, refresh, stale data, data quality, observed time, exact ledger, loading, error, partial, unavailable, zero, and authorization-loss behavior.
3. Preserve 44-by-44-point controls, screen-reader names/states, large-text fallback, reduced motion, and chart failure fallback.
4. Ensure chart touch handling does not trap the vertical scroll view.
5. Support portrait, landscape, and tablet geometry presets with no page-level horizontal scrolling.

### T2.5 Mobile regression tests

- Extend geometry/option tests for all mobile scene families.
- Assert every top-level production ECharts series is `custom`; custom child path/line shapes remain allowed.
- Verify every scene datum maps to a stable response key, exact value, unit, and availability.
- Verify period/comparison/metric/module transitions retain stable semantic IDs.
- Verify finance reconciliation, GST context separation, negative overspend, and unequal fixtures.
- Preserve strict parser/query/auth/ledger tests and complete current/previous bucket coverage.
- Verify renderer failure still leaves native values and controls usable.

### T2 exit criteria

- No mobile production dashboard analytical series or composition uses conventional bars, pie/doughnut sectors, simple lines/areas, baseline prisms, gauges, or waterfall columns.
- All four mobile module views use the approved spatial families and real response data.
- Focused mobile dashboard tests and typecheck pass before integration review.

## T3 — Implement the web Super Admin spatial dashboard

**Owner:** Web frontend implementer  
**Exclusive files:** `frontend/src/features/admin/dashboard/**`  
**Dependencies:** T1  
**May run parallel with:** T2

### T3.1 Runtime and interaction foundation

1. Register ECharts `CustomChart` and the required components/features in the lazy dashboard runtime.
2. Remove `BarChart`, `PieChart`, and `LineChart` registrations after production options migrate.
3. Replace unconditional series/axis `replaceMerge` behavior with stable-ID updates for compatible scenes and explicit removal for obsolete scene families.
4. Preserve resize, datum focus, keyboard interaction, tooltip, error fallback, lazy loading, listener cleanup, and disposal.
5. Add bounded pointer parallax as a presentation transform only; disable it for reduced motion and non-pointer devices.

### T3.2 Redesign the overview

1. Replace Growth comparison with the Operations constellation and Temporal ribbon field while preserving metric selection, daily dates, current/previous totals, exact table, and period semantics.
2. Replace Client portfolio bars with a client status topology using truthful count scaling and exact registered/active/inactive values.
3. Replace lifecycle doughnut/ranked-bar modes with one responsive Lifecycle orbit.
4. Replace financial health bars with the Capital flow scene.
5. Present Risk field and top-risk context without pie sectors or ranked bars.
6. Recompose `DashboardOverview.tsx` and dashboard CSS into editorial analytical regions with clear hierarchy at narrow, laptop, and wide widths.

### T3.3 Redesign every module tab

Map current module charts to approved scene families without dropping metrics:

| Module | Replacement |
| --- | --- |
| Projects | Lifecycle orbit, project topology, risk field, and temporal ribbons where time buckets exist |
| Estimation | Delivery corridor and temporal ribbon for period activity |
| Design | Delivery corridor and temporal ribbon for approvals/review activity |
| Procurement | Delivery corridor and category topology |
| Finance | Capital flow scene and expense-category topology |
| Execution | Delivery corridor, capacity topology, and temporal ribbon |
| Workforce | Workforce capacity topology and governance nodes |
| Risk | Risk field and related project/factor topology |

Existing exact-value tables, drilldowns, metric definitions, unavailable reasons, and navigation remain intact. Static stage counts must not be described as conversion.

### T3.4 Web accessibility, responsive behavior, and states

1. Keep `ChartFigure` tables and descriptions as the accessible source of exact values.
2. Ensure keyboard navigation can focus/select every meaningful datum and move through time buckets without pointer use.
3. Maintain visible focus independent of glow and disclose unit, date/range, availability, and encoding.
4. Preserve loading, partial, unavailable, all-zero, stale-refresh, chart-error, and authorization behavior.
5. Ensure narrow/mobile web, tablet, laptop, and wide desktop layouts do not clip labels or introduce page-level horizontal scrolling.

### T3.5 Web regression tests

- Add geometry/scale/option tests for all web scene families.
- Assert every top-level production dashboard series is `custom` and the runtime no longer imports/registers bar, pie, or line chart modules.
- Verify stable IDs across period, metric, comparison, and mode changes.
- Verify exact-table parity, keyboard focus, reduced motion, pointer-parallax bounds, and renderer failure.
- Verify finance lineage with unequal datasets, GST separation, zero/unavailable states, and overspend.
- Update overview/module/page tests to assert the new scenes and remove expectations tied to doughnut/ranked-bar toggles.

### T3 exit criteria

- The web overview and every dashboard module tab use the approved spatial families without losing metrics or exact tables.
- No web production dashboard analytical series or composition uses conventional bars, pie/doughnut sectors, simple lines/areas, gauges, or waterfall columns.
- Focused web dashboard tests and typecheck pass before integration review.

## T4 — Integrated reconciliation and regression hardening

**Owner:** Primary agent  
**Dependencies:** T2 and T3 complete  
**Writes:** Only integration fixes within the responsible writer's scope; return substantial fixes to that writer in Mode A

### Actions

1. Inspect both final diffs and reconcile scene names, scale rules, stable IDs, availability behavior, units, and copy.
2. Compare normalized fixtures across platforms for the six comparison counts, daily buckets, lifecycle, delivery, capital, workforce, governance, and risk.
3. Confirm that top-level production series are custom and that conventional runtime registrations are absent.
4. Confirm custom child shape types are not incorrectly rejected by regression guards.
5. Confirm the old mobile prism and web bar/pie/line builders are deleted or unreachable from production dashboard code.
6. Confirm exact values and tables/ledger retain parity with visual marks.
7. Confirm no dependency, backend, authorization, route, API, or lockfile drift was introduced.
8. Run focused mobile and web suites, both typechecks, and `git diff --check` before review.

### Exit criteria

- Cross-platform metric meaning and scale behavior match the approved specification.
- Focused checks are green and the integrated diff is ready for independent review.

## T5 — Integrity review and confirmed fixes

**Owner:** `integrity_reviewer` in Mode A; primary agent performs equivalent review in Mode B  
**Dependencies:** T4

### Review checklist

- Authorization remains `admin.dashboard.read` and no frontend visibility check becomes enforcement.
- Every scene mark traces to the existing response through a stable key.
- Unavailable/null values never become zero; zeros remain visible.
- Count, percentage, and paise scales do not mix.
- Finance preserves integer paise, approved net revenue excluding GST, classified/recorded cost, remaining budget, profit/margin, signed overspend, and unequal-project reconciliation.
- Workflow connectors do not imply unsupported conversion.
- Current/previous day-index alignment retains actual dates and partial-final-day semantics.
- Stable IDs support transitions without stale/ghost data after period, metric, comparison, or module changes.
- Error, stale, partial, and chart-failure states preserve exact values and actions.
- No private identity, URL, token, or client data appears in fixtures, logs, or screenshots.
- No idle loop, leaked listener, inactive-scene mount, invalid z-order value, or unbounded geometry is introduced.

Confirmed defects are returned to the owning implementer in Mode A and rechecked before T6. Review observations without evidence do not trigger speculative rewrites.

## T6 — Final verification and visual QA

**Owner:** `verification_runner` in Mode A; primary agent in Mode B  
**Dependencies:** T5 findings resolved

### Mobile focused checks

```bash
cd mobile
npm test -- --runInBand src/features/dashboard
npm run typecheck
```

### Mobile full checks

```bash
cd mobile
npm test -- --runInBand --forceExit
npm run export:android
```

If the local Android toolchain is already configured and the check does not mutate project sources, run the appropriate existing debug/runtime lane. Do not run prebuild if it would create or rewrite native project files without a clean preservation plan.

### Frontend focused checks

```bash
cd frontend
npm test -- src/features/admin/dashboard
npm run typecheck
```

### Frontend full checks

```bash
cd frontend
npm test
npm run build
```

There is no repository lint script; do not claim lint passed.

### Static and contract checks

- Execute option builders and assert all top-level production dashboard series types are `custom`.
- Verify the mobile and web dashboard runtimes do not import/register BarChart, PieChart, or LineChart.
- Inspect production reachability so retired conventional builders cannot be rendered.
- Run `git diff --check` and `git status --short`.

### Rendered mobile QA matrix

- Phone portrait: 7-, 30-, and 90-day ranges; comparison on/off; every module; selection change.
- Phone landscape: hero, controls, labels, and vertical scroll behavior.
- Tablet/large viewport: two-column opportunities, labels, and safe-area behavior.
- Reduced motion and large text.
- Partial, unavailable, all-zero, stale-refresh, renderer-failure, and authorization-loss states through fixtures/tests where live data cannot safely produce them.
- Inspect Metro/native logs for ECharts/ZRender errors, invalid z-order warnings, unhandled promises, and navigation failures.

### Rendered web QA matrix

- Narrow/mobile web, tablet, laptop, and wide desktop viewports.
- Overview plus Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk tabs.
- 7/30/90-day ranges, comparison on/off, metric selection, keyboard datum navigation, bounded pointer parallax, and reduced motion.
- Partial, unavailable, zero, stale-refresh, chart-error, and authorization states through safe fixtures/mocks where needed.
- Inspect browser console, network failures, focus order, accessible names, layout overflow, and idle animation behavior.

### Visual quality gate

Reject the implementation if any primary scene reads as:

- repeated rectangular columns on a baseline;
- a pie or doughnut split into sectors;
- a basic polyline/area chart placed on a normal grid;
- a conventional waterfall with cosmetic perspective;
- a generic collection of equal rounded chart cards;
- decorative 3D that obscures scale, units, dates, zero, or unavailable state.

Accept only when the rendered result clearly expresses the approved Operations Atlas grammar: spatial nodes, faceted ribbons, lifecycle topology, corridors, signed capital flows, capacity clusters, and risk fields.

### Final evidence

Report exact commands, pass/fail counts, build/export outcomes, viewport/state coverage, generated temporary artifacts, unrun checks, and residual risks. Never call the redesign complete if either platform lacks rendered visual inspection.

## Acceptance-criteria traceability

| Specification criterion | Tasks | Evidence |
| --- | --- | --- |
| No conventional chart series or silhouettes | T2, T3, T4, T6 | Runtime imports, evaluated option tests, production reachability inspection, visual gate |
| Seven spatial scene families | T2, T3 | Scene option tests, screen/module tests, rendered QA |
| Database-only values and stable IDs | T1–T5 | Mapping tests, exact-value parity, integrity review |
| Truthful units, zero, and unavailable | T1–T5 | Scale and state fixtures, component tests, review |
| Paise lineage and overspend | T1–T5 | Unequal finance fixtures and reconciliation assertions |
| No false workflow conversion | T2, T3, T5 | Copy/options inspection and integrity review |
| Stable ECharts transitions | T1–T4, T6 | ID/option tests and repeated live updates |
| Bounded/reduced motion | T1–T3, T6 | Motion tests, reduced-motion rendered checks, idle inspection |
| Accessible exact values and controls | T2, T3, T6 | Component tests, keyboard/screen-reader semantics, fallback checks |
| Responsive rendered quality | T2, T3, T6 | Mobile and browser viewport matrices |
| Full verification and hygiene | T4–T6 | Focused/full suites, typechecks, builds/exports, diff/status evidence |

## Rollback and external actions

- Rollback is feature-local: restore the prior dashboard visualization components/runtime registrations while keeping existing data contracts and exact-value views.
- No data migration or rollback script is required.
- No deployment, commit, push, package publication, seed, backend write, production mutation, or external communication is authorized by this plan.

## Completion evidence

- Mobile and web production dashboard options now use Apache ECharts custom-series spatial scenes only. Runtime registrations no longer include bar, pie, or line chart modules.
- Operations constellations, temporal ribbons, lifecycle orbits, delivery corridors, capital flows, workforce/governance topologies, and risk fields are wired to existing authorized dashboard fields with stable semantic IDs.
- Comparison visibility preserves current position, depth, radius, and height against a fixed full-period domain, including when the hidden previous period owns the maximum.
- Finance marks and exact tables share all eight lineage values; context, allocation, recorded cost, remaining budget, and standalone current profit retain their backend metric keys and availability.
- Design and Execution include their required temporal scenes. Workforce includes governance nodes with exact per-source keys and availability rather than a synthetic aggregate key.

Verification completed on 2026-09-22:

- Frontend dashboard: 10 files and 105 tests passed; TypeScript passed; production build passed with 2,905 modules transformed.
- Mobile dashboard: 11 suites and 57 tests passed; TypeScript passed; Android export passed with 2,720 modules bundled.
- Final integrity review passed with no remaining acceptance defect.
- Web live review covered Overview at 390px and 1024px plus Overview, Finance, and Risk at a wide desktop viewport; the browser console had no errors or warnings.
- Mobile emulator review covered the constellation, temporal ribbon, and lifecycle/risk scenes; fresh runtime logs contained no current ZRender, SVG-radius, JavaScript, or native fatal error.
- `git diff --check` passed. Generated Expo export-log changes were restored; the pre-existing dirty `mobile/.expo/dev/logs/start.log` was preserved.

Repository-wide context:

- The full frontend suite remains red outside this dashboard scope: 215 files and 3,240 tests passed; 13 files and 27 tests failed in unrelated knowledge-editor, simulator, upload-polling, and workflow tests. Dashboard tests passed inside the same run.
- The full mobile suite was not repeated in final verification because its known post-assertion asynchronous handle can retain Jest. The earlier run completed all 65 suites and 468 assertions before requiring interruption.
- No commit, push, deployment, migration, seed, production write, or external communication was performed.

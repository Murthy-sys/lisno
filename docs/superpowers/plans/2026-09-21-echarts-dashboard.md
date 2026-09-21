# Apache ECharts organization dashboard — task plan

- Date: 2026-09-21
- Status: Implemented and verified — repository-wide suites retain unrelated failures recorded below
- Source of truth: [Approved dashboard specification](../specs/2026-09-20-echarts-dashboard-design.md)
- Specification approval: User replied “Approved” on 2026-09-21. Its requirements are unchanged; this stage writes only this separate task-plan file.
- Execution mode: A — parallel sub-agents, selected by the user on 2026-09-21.
- Outcome: A focused Super Admin dashboard with database-backed client/project metrics, honest previous-period comparisons, and accessible animated Apache ECharts.

## Baseline and boundaries

At plan creation, `git status --short` lists only the untracked approved specification. Inspected application targets are clean. The current application already has the protected dashboard API, nine dashboard tabs, canonical financial/risk aggregates, SVG/DOM charts, a QA fixture, and dashboard regression tests. Historical plans describing a missing dashboard are not the implementation baseline.

This plan preserves the approved light Lisno design, the existing `/admin/dashboard` route and role boundary, default 30-day reporting, supported 7/30/90-day windows, existing module drill-downs, and payment confirmation workflow. It introduces no new production write endpoint, customer identity system, historical snapshot collection, background job, or financial formula.

The required new dependency is local frontend Apache ECharts 6.x. Only `frontend/package.json` and its lockfile need dependency changes. No React chart wrapper or additional motion library is planned. Resolve the supported patch during implementation and record the resulting version.

No seed, migration, backfill, production index operation, production data access, commit, push, deployment, or external publication is authorized. Synthetic test database writes are limited to the existing disposable test helpers. Screenshots, traces, and logs belong in an ignored directory or `/tmp/lisno-echarts-dashboard-qa`, not in deliverable source files.

## Task graph and ownership

```text
T0 Reconfirm baseline
  ↓
T1 Settle shared contracts and representative fixtures
  ↓
T2 Install ECharts and establish the renderer interface
  ↓
T3 Backend metrics  ─┬─  T4 ECharts renderer  ─┬─  T5 Dashboard UX
                    └────────────────────────┘
                                      ↓
                     T6 Integrate routing, cache, and QA
                                      ↓
                     T7 Review integrity and fix findings
                                      ↓
                     T8 Verify integrated result and hand off
```

T3, T4, and T5 are parallel lanes after T2, not dependencies of one another. They use the settled interfaces from T1–T2. Full integration waits for all three.

Keep one parent delivery task in progress. Child tasks may run concurrently only inside the active implementation phase. T0–T8 were completed in Mode A; execution evidence is recorded below.

### Mode A ownership

| Owner | Exclusive write boundary |
| --- | --- |
| Primary integrator | Plan/status; backend dashboard contract and repository interface; OpenAPI; frontend dashboard API types/query contract and fixtures; ECharts public type boundary; package/lockfile; router integration; QA harness; cache-invalidation integration outside dashboard presentation; final reconciliation. |
| Backend implementer | Dashboard domain, service, repository implementation/adapters, and backend dashboard tests. It must not edit primary-owned contracts, OpenAPI, schema models, or unrelated financial calculation services. |
| ECharts implementer | New runtime/adapter/options modules and focused tests under `frontend/src/features/admin/dashboard/echarts/`, excluding the primary-owned public type file. It must not edit dashboard page/layout, shared chart components, tokens, dependencies, or API types. |
| Frontend implementer | Dashboard page, overview, module-chart compositions, dashboard presentation helpers/styles and their tests. It must not edit API types, fixtures, renderer internals, router, shared chart primitives, package files, or another role's dashboard. |
| Integrity reviewer | Read-only review after all implementation writers finish. |
| Verification runner | Final commands and browser verification after review fixes are integrated; no product-source writes. |

In Mode A, the primary may first use bounded read-only audits for approval/ledger provenance and UX acceptance details when they resolve a concrete uncertainty. Audit ownership never permits writes. During implementation, the three independent writers occupy the three child slots; shared edits remain with the primary. Every assignment must say that writers share the worktree, must preserve others' edits, and must return contract changes to the primary rather than inventing a fallback.

In Mode B, the primary executes the same tasks, integrity review, and verification sequentially without subagents. The T3/T4/T5 parallel option does not apply.

## T0 — Reconfirm the approved baseline

Owner: Primary. Dependencies: Task-plan approval and execution-mode selection. Acceptance: AC11 and preservation of unrelated work.

1. Re-read current repository instructions and the approved specification; confirm the current date and worktree state.
2. Capture `git status --short`, relevant target diffs, and the tracked baseline revision before any implementation writer begins. Understand and assign any newly dirty target explicitly; never overwrite unrelated work.
3. Confirm installed dependencies, existing test commands, Mongo test helper behavior, and the available local browser surface. Identify any existing dev server before starting another; do not stop a user-owned server.
4. Capture representative existing dashboard views using synthetic QA data and the actual application shell. Retain baseline viewport, loading/partial states, and a production build size report for later comparison.
5. Record the present behavior of period labels, payment confirmations, keyboard tabs, and module links. Treat missing optional local test infrastructure as a verification prerequisite, not permission to weaken correctness.

Exit evidence: Baseline/diffs recorded, dirty-file ownership settled, existing verification commands identified, and no unreviewed target assigned.

## T1 — Settle the shared reporting contract

Owner: Primary. Dependencies: T0. Acceptance: AC2–AC7.

Affected files:

- `backend/src/contracts/super-admin-dashboard.ts`
- `backend/src/repositories/types.ts`
- `backend/src/openapi.ts`
- `frontend/src/features/admin/dashboard/superAdminDashboardApi.ts`
- `frontend/src/features/admin/dashboard/dashboardFixtures.ts`
- Related API/OpenAPI contract tests, owned by the primary while this task is active.

Implementation requirements:

1. Extend the existing overview response with client aggregates, explicit project completions in period, and typed comparison metadata. Preserve existing response fields and query parameters. The new server returns the new fields; the frontend safely handles older responses that omit them.
2. Define one closed metric-key set for comparisons: projects created, Client accounts created, projects completed, execution tasks completed, Estimate approvals, Design approvals, and recorded expenses in paise. Record exact names once in the shared boundary and use them consistently across domains, API, data-quality keys, fixtures, and presentation.
3. Define current/previous values and availability separately. A source failure can disable one side without erasing the other. Include nullable absolute/percentage deltas, unit, time basis, safe reason, matched window bounds, UTC timezone, and partial-day metadata. Suppression must be machine-readable; neither consumers nor chart code should infer availability from a numeric zero.
4. Define ordered daily buckets containing actual dates and metric values; unavailable values are null. Bound each period to 90 buckets and use a fixed number of series. Totals and their plotted buckets must share a canonical projection.
5. Define client totals, active/inactive partition, distinct linked-client counts, clients with active projects, null-client project count, and invalid-client-reference count. Preserve the approved current-role-cohort meaning for account creation. No contact details enter the aggregate DTO.
6. Freeze comparison arithmetic: `[startAt, endAt)` windows; previous bounds shifted backward by `periodDays` UTC days; basis points rounded to nearest integer using an explicitly tested signed rounding policy. Prior zero/current positive is “New”; both zero is “No change”; unavailable prior has no delta. Check safe-integer arithmetic and use exact intermediate arithmetic where required to prevent overflow in money percentage calculations.
7. Retain the dashboard query root and one overview HTTP request per selected period. The comparison toggle is URL-backed display state, default enabled; do not send it to the currently strict API query schema or create redundant server requests/query identities for a purely visual change.
8. Prepare asymmetric synthetic fixtures with multiple clients, multiple projects per client, distinct period activity, truthful financial data, independent missing sources, zero denominators, and absent new API fields. Fixtures must remain restricted to tests/QA.
9. Update OpenAPI field shapes, enums, limits, nullable values, and semantics alongside the backend/frontend contracts. Existing authorization operation names and policy version do not change.

Exit evidence: One agreed contract/fixture set that all writers can consume. Type errors caused by pending implementations are tracked until integration; placeholders must not fabricate successful metrics just to compile. Public-contract changes discovered later return to the primary before a writer proceeds.

## T2 — Establish the ECharts dependency and public interface

Owner: Primary. Dependencies: T1. Acceptance: AC8–AC10.

Affected files: `frontend/package.json`, `frontend/package-lock.json`, and a public type module under `frontend/src/features/admin/dashboard/echarts/`.

1. Verify the supported ECharts 6.x package and applicable official APIs, then install it only in `frontend/`. Record the version and lockfile changes; avoid unrelated dependency updates.
2. Settle the renderer boundary before assigning T4/T5: typed options for the necessary series/components; accessible description; stable chart identity; explicit reduced-motion behavior; safe event callback contract; and a render-error callback/fallback contract. Metric labels, availability, tables, and business calculations remain outside the renderer.
3. Register only required line/bar/pie components and SVG rendering, plus tooltip/grid/dataset/accessibility/label features actually used. Ordinary financial waterfall can use composed bar series; no custom-series dependency is required.
4. Agree that chart modules are dynamically loaded inside the existing semantic figure boundary. Figures, exact values, and data tables stay usable while the renderer loads or fails. Ensure the intended import graph will not eagerly pull ECharts into the router or unrelated roles.
5. Publish interface examples against T1 fixtures for a two-period line chart, client account bars, lifecycle doughnut, and financial bar/waterfall view. These are implementation contract examples, not invented production values.

Exit evidence: Dependency resolved and the renderer interface is stable enough for T3/T4/T5 to proceed independently.

## T3 — Implement canonical client and comparison aggregates

Owner: Backend implementer in Mode A; primary in Mode B. Dependencies: T2. Acceptance: AC2–AC7, AC10.

Exclusive files: `backend/src/domain/super-admin-dashboard.ts`, `backend/src/services/super-admin-dashboard.service.ts`, `backend/src/repositories/super-admin-dashboard.ts`, affected dashboard adapter methods in `memory.ts`/`mongo.ts`, dashboard test files, and narrowly scoped dashboard-only helper modules/tests if needed. Contract/OpenAPI edits are requested from the primary. Keep NodeNext `.js` import suffixes.

1. Implement a pure shared window/delta/bucket policy with a single request observation clock. Use it for both memory and Mongo paths; remove inconsistent inclusive-end behavior from metrics that feed the same comparison.
2. Aggregate registered Client accounts and valid project relationships by stable ID. Distinguish inactive accounts, no project, multiple projects, missing/wrong-role references, unlinked contacts, pending invitations, and role changes. Suppress dependent client metrics when authoritative source reads fail.
3. Read the two bounded event windows on the server. Group before returning data; avoid page loops, per-project N+1 queries, and unbounded `$push` arrays of every event or client ID. Do not obtain prior metrics by calling the complete current overview twice with altered timestamps.
4. Use the same completed-Project predicate and timestamp rules for period total and buckets. Missing/invalid completion history cannot become a fabricated event or a zero-labelled complete history.
5. Build approval event projections from validated immutable review identities and decision timestamps. Deduplicate retry/send-generation records for the same approved Estimate/version; distinguish legitimate distinct Design versions. Validate project/estimate/version lineage without requiring today's latest mutable version to erase a valid historical event. Permit a legacy fallback only when its persisted identity and timestamp prove the same fact and cannot duplicate a review-round event. Otherwise mark the affected history incomplete/unavailable.
6. Restrict execution completion comparisons to `site_execution` and `trade_execution`, using the same authoritative source population as period execution summaries. Validate task/project/source lineage and reject orphan or unrelated workflow records.
7. Derive recorded-expense comparisons from currently posted ledger records selected by `incurredAt`. Validate canonical bucket/project lineage and approved-baseline rules through established reporting helpers. Preserve classifications, overhead accounting, integer paise, GST treatment, synthetic valid finance baselines, and invalid-lineage suppression. Use current ledger status, so voided entries are excluded and backdated entries are correctly attributed.
8. Feed compatible legacy trend fields from the corrected projection where they represent the same business event, rather than keeping contradictory old and new calculators. Keep unavailable source keys aligned with their consumers; if an existing field retains a distinct meaning, label and test it explicitly.
9. Preserve sole-active-Super-Admin checks and no-store responses. Add no API operation, permissions, response PII, persistence state, or financial mutation. Unsupported memory facts are explicitly unavailable.
10. Add regression tests in the existing dashboard domain/routes/Mongo suites; a dedicated `super-admin-dashboard-comparison.test.ts` may isolate pure window/arithmetic cases. Use the disposable replica-set helper for Mongo evidence. Inspect representative 90-day aggregate execution without deploying indexes or logging private records.

Required fixtures include exact start/end events, future dates, leap/month/year boundaries, partial final days, current-only/prior-only failure, multiple versions/send generations, wrong-project lineage, missing timestamps, account role changes, and two unequal approved finance projects. Verify totals independently of drill-down filters and page size.

Exit evidence: Focused backend tests pass, client and comparison fields reconcile to their sources, source failure stays isolated, and performance/read-bound concerns are documented with actual observations.

## T4 — Build the reusable ECharts renderer

Owner: ECharts implementer in Mode A; primary in Mode B. Dependencies: T2. Acceptance: AC8–AC10.

Exclusive files: Renderer/runtime/options helpers and focused tests in `frontend/src/features/admin/dashboard/echarts/`; the primary-owned public type file remains read-only during parallel work.

1. Implement one React instance owner for initialization, option updates, events, size observation, cleanup, and render errors. Handle Strict Mode remount, zero-width hidden containers, interrupted loading, route exit, and resize without duplicate instances/listeners.
2. Resolve existing CSS chart/font tokens into renderer-supported values. Support actual application theme changes without introducing a theme framework; do not edit global color tokens.
3. Use stable series/item identities and deliberate replace/merge behavior so changing metric or disabling comparison removes obsolete series. Keep plot coordinates and value formatting consistent with the supplied units.
4. Apply 450–650ms entrance and 250–350ms data updates with restrained easing. Respect `prefers-reduced-motion` initially and when changed; cancel obsolete animations/listeners and render final values immediately. DOM metrics never animate through false monetary values.
5. Keep events text-safe, tooltips confined, and category IDs allow-listed by callers. Avoid user-input HTML interpolation. Preserve vertical touch scrolling and expose no critical interaction only through the chart.
6. Make renderer/chunk failure visible to the caller without taking down the semantic figure or table. Provide an operable retry path with clean disposal. Keep inactive-tab plots unmounted.
7. Add meaningful lifecycle tests for resize/dispose, late initialization, reduced-motion changes, dropped series, safe labels, and render failure. Browser verification must later use real ECharts; a mocked API test alone does not establish rendering quality.

Exit evidence: Public interface implemented, focused lifecycle tests pass, and the adapter handles real line/bar/pie examples without affecting layout or business state.

## T5 — Implement the focused dashboard design

Owner: Frontend implementer in Mode A; primary in Mode B. Dependencies: T2 and its public renderer contract. Acceptance: AC1, AC2, AC4–AC6, AC8, AC9.

Exclusive files: `SuperAdminDashboardPage.tsx`, `DashboardOverview.tsx`, `DashboardModuleCharts.tsx`, `dashboardCharts.tsx`, `dashboardPresentation.ts`, `super-admin-dashboard.css`, their tests, and new dashboard-specific presentation components. `DashboardNavigation.tsx` and drill-down presentation may change only where needed to preserve the approved interactions. API types, fixtures, renderer internals, router, global tokens, shared charts, and other screens remain outside this lane.

1. Build the semantic headline band: total Projects, registered Client accounts, current approved net revenue excluding GST, and period recorded expenses. Attach labelled period activity/deltas only where valid. Correct the current completed-project and incurred-expense labels.
2. Compose the large current/prior activity chart, focused Client panel, lifecycle doughnut, financial health view, concise attention records, and compact links to detailed modules. Retain source suppression and avoid repeated overview grids. Move the existing payment confirmation component below the overview analytical content, retaining its existing behavior and Finance placement.
3. Implement a native metric selector, URL-backed comparison toggle, explicit UTC period labels, partial-day note, source-appropriate “New”/“No change” states, and a textual explanation of the current Client-role cohort. Present current-only figures as snapshots.
4. Use the T4 renderer inside existing `ChartFigure` boundaries. Every plotted point/category has exact table values. Preserve labels/dash cues, visible keyboard controls, and status colors. The frontend formats backend deltas and money; it does not recompute source metrics.
5. Wire lifecycle selection and matching DOM links to existing validated Project filters using stable category IDs. Keep module filters scoped to drill-downs; they must not silently change global overview totals. Link to the existing user directory using an honest route label, without inventing a Client filter it does not support.
6. Migrate dashboard-only time-series, categorical, lifecycle, spend, and waterfall plots to ECharts while preserving each module's information and table equivalents. Keep simple ratio meters where clearer. Do not replace shared chart implementations in unrelated Finance or role screens.
7. Implement desktop/tablet/mobile compositions using existing tokens: 2:1 main comparison/client split where space permits, two lower panels, then stacked mobile. Reserve chart height, keep labels/values readable, avoid whole-page overflow, and ensure 200% zoom and long values remain usable.
8. Preserve loading, all-zero, empty, sparse, partial, older-response, stale, and unavailable distinctions. Keep valid current values when only prior history fails. Do not carry old-period data under newly selected period labels or render unavailable slices as zero.
9. Extend page/presentation tests for key reading order, period changes, comparison toggle/navigation, permission loss, source failures, table parity, and payment workflow reachability. Avoid snapshots that merely assert internal ECharts option structure.

Exit evidence: The full representative overview flow is usable against settled fixtures, module details remain available, and focused frontend behavior tests pass.

## T6 — Integrate runtime, cache freshness, and QA

Owner: Primary. Dependencies: All T3/T4/T5 writers finished. Acceptance: AC1–AC10.

Affected integration files: Frontend dashboard API/tests/fixtures, `frontend/src/app/router.tsx` and its tests only if lazy-route integration is necessary, `dashboardInvalidation.test.ts`, existing mutation callers only where an actual invalidation gap is demonstrated, and `frontend/src/test/fixtures/superAdminDashboardQaEntry.tsx` / `frontend/qa/super-admin-dashboard.html`. Shared auth code is inspected and reused; any required behavioral fix must be narrowly scoped and reviewed.

1. Reconcile the final API, OpenAPI, fixture, renderer, and presentation shapes. Confirm production imports cannot reach QA fixtures or random fallback values. Check availability propagation to every dependent headline, chart, and table.
2. Ensure ECharts is isolated behind a lazy import. The router currently eagerly imports the dashboard page; a dynamically imported renderer can satisfy isolation without unnecessarily changing route behavior. Confirm with the actual production chunk graph/network waterfall rather than assuming tree shaking alone is sufficient.
3. Audit client/project creation and linking, account role/activation changes, approvals, execution, and ledger mutations against dashboard query invalidation. Existing `UserMutationDialog` and `AdminProjectInitiationDialog` already invalidate `dashboardKeys.all`; retain working paths and add behavioral checks for demonstrated gaps. Avoid adding new cross-user notification infrastructure.
4. Exercise concurrent period requests, comparison toggle changes, refresh failure, and authentication expiry. The existing AuthProvider clears the query cache on session termination; verify it rather than adding a second competing session policy. Protected values must not remain visible following permission loss.
5. Expand deterministic QA states for new comparisons, client integrity issues, chart load/render error, old API payload, meaningful 90-day series, large money values, and one-sided source failure. Render the real application shell in at least one synthetic QA flow; the original standalone fixture is not sufficient visual evidence.
6. Cross-check two unequal Projects and Client identities through the actual test API. Assert chart tables, headlines, module reports, and source records reconcile; fixture rendering alone does not establish database integration.

Exit evidence: One integrated worktree, real chart rendering, working data flow, and no unresolved owner/interface divergence.

## T7 — Review integrity and resolve findings

Owner: Read-only `integrity_reviewer` in Mode A; primary in Mode B. Dependencies: T6. Acceptance: AC2–AC10.

Review the integrated diff against the approved spec, emphasizing:

- Client deduplication/current-role cohort semantics and no PII or unauthorized global access.
- Correct previous/current bounds, unavailable history, zero-prior deltas, snapshot/activity labels, and timestamp validity.
- Immutable approval provenance/deduplication, execution kind scope, canonical finance baseline/ledger lineage, integer units, and two-project reconciliation.
- Server-side full-population aggregation, bounded intermediate data, independent source failures, no frontend business metric calculations, and no invented fallback history.
- Query keys/invalidation, race handling, authorization loss, instance disposal, lazy loading, token consistency, keyboard/value-table parity, and preserved payment actions.

Return file/line evidence and concrete risk for each finding. The primary triages, assigns fixes within existing ownership, and integrates them before verification. A material change to approved behavior returns to the affected document approval boundary; routine fixes within scope proceed without reopening the spec.

Exit evidence: All confirmed correctness/security/finance regressions resolved; remaining limitations explicitly recorded. Review alone is not test evidence.

## T8 — Verify the integrated result and hand off

Owner: `verification_runner` in Mode A; primary in Mode B. Dependencies: T7 and all fixes completed. Acceptance: AC1–AC11.

Start with focused checks during implementation. Run final verification only after writers stop. Because this change extends a cross-stack read contract and dashboard presentation, run each complete backend/frontend suite once on the integrated result; do not repeatedly broaden testing without a new change or failure.

Backend focused commands, working directory `backend/`:

```sh
npm test -- tests/super-admin-dashboard-domain.test.ts tests/super-admin-dashboard.test.ts tests/super-admin-dashboard-comparison.test.ts
npm test -- tests/super-admin-dashboard-mongo.replica-set.test.ts
npm test -- tests/project-finance.test.ts tests/project-finance-routes.test.ts tests/project-finance-mongo.replica-set.test.ts
npm test -- tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
```

The comparison test path above is the planned dedicated pure-regression file; if coverage is incorporated into an existing dashboard suite instead, update this plan with the actual command before execution. Run procurement or additional source-service tests if those shared helpers are changed; shared service edits are not assumed.

Frontend focused commands, working directory `frontend/`:

```sh
npm test -- src/features/admin/dashboard
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx
npm test -- src/auth/AuthProvider.test.tsx src/app/router.test.tsx src/components/layout/AppShell.test.tsx src/components/charts/charts.test.tsx
```

Final integrated commands, run separately in each of `backend/` and `frontend/`:

```sh
npm run typecheck
npm test
npm run build
```

Run `git diff --check` and `git status --short` at repository root. Inspect the complete final diff and added-file hygiene. There is no lint script; do not report a lint pass. Mongo integration uses `tests/helpers/mongo-replica-set.ts` and its disposable replica set, never an ambient production URI. If sandbox restrictions or a missing Mongo binary block a required check, use the appropriate tool approval path and record the exact result; do not silently skip it or weaken transaction/test semantics.

### Rendered verification matrix

| Dimension | Required checks |
| --- | --- |
| Width and content | 1440, 1024, 768, 390, 360px; short landscape; 200% zoom; long names, large paise values, negative budget headroom. |
| Periods and comparisons | 7/30/90 days; current/prior actual-date tooltips; partial final day; zero prior, both zero, one-point/sparse history, one-sided unavailable source. |
| Interaction | Native metric selection, compare on/off, refresh, keyboard tabs, lifecycle chart and equivalent DOM drill-down, all module tabs, user directory link, payment confirmation reachability. |
| Failures | Initial API failure/retry, partial source failure, stale refresh, slow chart chunk, renderer error/retry, older response, permission loss, rapid selection and route changes. |
| Accessibility | Keyboard and touch-equivalent operation, meaningful focus order, accessible names, exact value tables, color-independent series cues, actual contrast, reduced motion at load and after changing preference. |
| Runtime | Real ECharts rendering, no relevant console/network errors, no lost series cleanup, no duplicate chart/listeners after reentry, bounded 90-day plot size, no page-scroll blocking. |
| Performance | Before/after build chunk sizes, unrelated-route network check, representative desktop/mobile runtime trace and 90-day interaction timing. Record measured results and test conditions; do not infer FPS from appearance. |

Use safe synthetic records and inspect screenshots as images. Exercise the full shell, not only a chart fixture. Application-required dev/preview processes may be started after mode selection using existing scripts; stop only task-owned processes. Do not install a new browser automation dependency if available tooling already supports the checks.

### Acceptance traceability

| Spec criterion | Primary tasks | Required evidence |
| --- | --- | --- |
| AC1 Focused overview and retained workflows | T5, T6, T8 | Full-shell responsive screenshots and payment/module navigation checks. |
| AC2 Authoritative backend data | T1, T3, T6, T7 | Source reconciliation, failed-source tests, production import audit. |
| AC3 Correct client identity/counts | T1, T3, T7 | Asymmetric memory/Mongo account and project-link tests. |
| AC4 Accurate comparisons | T1, T3, T5, T8 | Fixed-clock boundaries/delta tests plus actual-date UI checks. |
| AC5 Consistent historical event definitions | T3, T5, T7 | Completion, approval-generation/version, and execution-kind regressions. |
| AC6 Financial correctness | T1, T3, T7, T8 | Two unequal approved Projects, ledger/baseline/trend reconciliation. |
| AC7 Authorization and freshness | T3, T6, T7 | Route matrix, mutation invalidation, race/stale and session-expiry checks. |
| AC8 ECharts and brand consistency | T2, T4, T5, T8 | Real chart render, interactions, module/chart regression checks. |
| AC9 Accessible responsive experience | T4, T5, T8 | Table parity, keyboard/touch, contrast, zoom, reduced motion and failure fallback. |
| AC10 Bounded rendering/cleanup/loading | T2, T3, T4, T6, T8 | Aggregate/read bounds, chunk/network evidence, lifecycle tests and trace. |
| AC11 Integrated validation | T0, T7, T8 | Exact final command results, final diff, and limitations. |

## Execution evidence — 2026-09-21

T0–T8 are complete. The integrated result uses Apache ECharts `6.1.0` through a modular, dynamically imported SVG runtime. It adds database-backed Client aggregates and matched current/previous 7/30/90-day reporting, reconciles approval/execution/Finance event lineage, replaces dashboard analytical plots with accessible ECharts figures and exact value tables, and retains module drill-downs and payment workflows. The integrity review's confirmed findings were remediated before final verification.

Focused final verification:

- Backend dashboard domain/service: 12 tests passed; dashboard Mongo: 39 passed; Finance: 23 passed; authorization/API/OpenAPI: 284 passed.
- Frontend dashboard: 65 tests passed; Procurement/cache freshness: 55 passed; dashboard router cases: 2 passed.
- Backend and frontend `npm run typecheck`: passed.
- Backend and frontend `npm run build`: passed.
- `git diff --check`: passed. No new `.playwright-cli` artifacts remain; the existing 25 files there are tracked baseline files.

The required full suites were each run once on the final tree. Backend completed 3,623 of 3,629 tests across 165 of 170 passing files; six tests plus one teardown suite failed in unchanged Design workflow, full-journey, AI bootstrap, workflow-media, and production-bootstrap scenarios. Frontend completed 3,202 of 3,220 tests across 219 of 225 passing files; 18 failures remain in unchanged password reset, signup, drawer focus, AppShell navigation, and AI Estimator knowledge-editor scenarios. Dashboard tests passed inside both complete-suite runs, and focused checks confirm these failures are outside this change.

The production build emits a separate lazy ECharts chunk of 558,122 bytes (192,915 bytes gzip). `dist/index.html` loads the main entry only; the main bundle references the ECharts runtime once through dynamic import and has no static ECharts import. Vite still reports its standard warning for chunks above 500 kB; the existing main entry is 1,788,416 bytes (493,289 bytes gzip).

Rendered QA used the real application shell and real ECharts at 1440×900, 1024×768, 768×900, 390×844, 360×800, and 844×390, plus actual 200% browser zoom. All sizes had no horizontal overflow and rendered 38 SVG charts. Checks covered comparison and metric controls, exact tables, protected links, module navigation, full/partial/older-response/error/stale/auth-loss states, current-only data preservation, initial and live reduced-motion changes, and console output. Final desktop and mobile captures are in `/tmp/lisno-echarts-dashboard-final-qa/overview-1440.png` and `/tmp/lisno-echarts-dashboard-final-qa/overview-390.png`.

No seed, migration, backfill, production data access, commit, push, deployment, or external publication was performed.

Exit evidence: Report the changed behavior and principal files, dependency version, exact commands/results, rendered QA coverage/artifact paths, and any unrun check or remaining risk. Distinguish actual database integration evidence from synthetic frontend rendering. No migration or external action is required. Do not call the implementation complete while required checks or confirmed material defects remain unresolved.

## Approval and execution record

| Gate | Status |
| --- | --- |
| Specification | Approved by the user on 2026-09-21. |
| Task plan | Approved by the user on 2026-09-21. |
| Execution choice | A — parallel sub-agents, selected by the user on 2026-09-21. |
| Implementation | In progress. |

The approval boundary comes from repository `AGENTS.md`: “Only after the specification is approved, create or update only the separate task-plan file” and “Do not implement.” This plan does not reopen the approved specification or preselect an execution mode.

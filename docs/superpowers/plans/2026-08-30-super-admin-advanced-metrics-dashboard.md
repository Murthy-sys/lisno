A# Super Admin advanced metrics dashboard — Task Plan

**Date:** 2026-08-30
**Status:** Approved — execution mode A (parallel sub-agents)
**Approved specification:** [Super Admin advanced metrics dashboard design](../specs/2026-08-30-super-admin-advanced-metrics-dashboard-design.md)
**Delivery model:** One additive, read-only dashboard inside the existing Lisno backend process, React application, Mongo database, authentication, authorization, and design system
**Implementation authorization:** Granted for local implementation and verification by task-plan approval plus execution-mode A selection; deployment, production mutation, migration execution, commit, and push remain unauthorized

## 1. Outcome and execution guardrails

Implement the approved organization-wide Super Admin Dashboard and make `/admin/dashboard` the Super Admin home. The dashboard opens on Overview without a project picker, summarizes all approved operational tabs, derives risk on the backend, and provides bounded server-paginated project/workforce drill-down.

This plan creates:

- one additive Super Admin-only permission and three additive read operations;
- backend dashboard contracts, pure metric/risk rules, aggregate-oriented memory/Mongo reads, service orchestration, routes, OpenAPI, and tests;
- frontend dashboard API/query keys, home/navigation/routing, nine-tab UX, responsive/accessibility behavior, cache invalidation, and tests; and
- a deterministic frontend QA fixture used only for rendered visual and interaction verification.

This plan does not authorize or create:

- a new service, database, dashboard persistence collection, materialized view, background refresh job, AI/weighted score, or historical risk snapshot;
- a mutation, approval, assignment, finance, invitation, access, email, or workflow-state change;
- an All Projects, Finance, Users, Configuration, Client response, Design approval, Access request, or role-specific workflow replacement;
- a project-status vocabulary change, normalized-search backfill, data migration, seed execution, dependency/lockfile change, production read/write, index deployment, deployment, commit, or push; or
- a browser-side finance, KPI, progress, or risk calculation.

## 2. Baseline, ownership, and stop conditions

### 2.1 Planning baseline

At task-plan creation time:

- the only dirty path is the untracked approved specification;
- all inspected backend and frontend product targets are clean; and
- the existing Super Admin home is `/admin/users`, the project navigation entry is **All Projects**, and no dashboard permission, route, service, or page exists.

Before implementation writers begin, the primary integrator must recapture:

1. `git status --short`;
2. the per-target diff for every shared file assigned below;
3. content hashes for authorization, route-operation, OpenAPI, routing, and finance calculation boundaries;
4. ownership of every dirty target, if the worktree changed after plan approval; and
5. the exact cross-stack contract in section 3.

No writer may edit a dirty target until its existing change is understood and ownership is explicit.

### 2.2 Exclusive ownership in execution mode A

| Owner | Exclusive write boundary |
|---|---|
| Primary integrator | Specification/plan, frozen cross-stack contract, integration decisions, conflict reconciliation, final diff |
| Backend implementer | All approved `backend/` product/test changes in tasks T1–T5 |
| Frontend implementer | All approved `frontend/` product/test/QA changes in tasks T6–T9 |
| Integrity reviewer | Read-only integrated review after both writers finish |
| Verification runner | Read-only final commands and rendered QA after review findings are resolved |

Only one backend writer and one frontend writer may be active. This avoids concurrent edits to their respective authorization, repository, routing, type, and test registries.

### 2.3 Immediate stop/report conditions

Stop and return to the primary integrator if implementation would:

- calculate organization totals by looping endpoint pages, users, or projects;
- load every organization row into Node to obtain a count that Mongo can group;
- diverge from `calculateTaskRisk`, canonical Finance formulas, approved-estimate lineage, or KPI eligibility rules;
- join projects, estimates, finance buckets, tasks, users, sections, or line items by name/label;
- differ by one paise or basis point from the canonical Finance response for the same source set;
- treat missing module data, zero-denominator ratios, or no-KPI workers as zero/healthy;
- invent an approval SLA, status-to-percentage mapping, historical risk trend, weighted score, or predictive result;
- expose a dashboard request to a non-Super-Admin role or include tokens, storage references, documents, proofs, private URLs, or unnecessary client personal data;
- require an unbounded in-memory sort, an unexplained collection scan, a normalized-search backfill, a new dependency, or a new persistence/write path;
- add speculative indexes without query-plan evidence; or
- require a dashboard drill-down to a personally attributable action surface.

## 3. Cross-stack contract freeze

The primary integrator publishes this contract to both implementation owners before T1 or T6 starts. A material change returns to the approved specification boundary.

### 3.1 Authorization and route contract

Add exactly one permission:

```text
admin.dashboard.read
```

The mirrored backend/frontend authorization policy version is:

```text
2026-08-30.super-admin-dashboard.v1
```

Grant it only to `super_admin`. Register exactly three operations:

| Operation | Scope | Class | Super Admin behavior |
|---|---|---|---|
| `GET /admin/dashboard/overview` | non-project namespace `super_admin_dashboard` | read | global read |
| `GET /admin/dashboard/projects` | non-project namespace `super_admin_dashboard` | read | global read |
| `GET /admin/dashboard/workforce` | non-project namespace `super_admin_dashboard` | read | global read |

Each route order is `authenticate → requireOperation → validateQuery → handler`. The service rechecks that the actor is the sole active Super Admin before starting dashboard aggregate reads.

| Actor/state | Contract |
|---|---|
| Anonymous | Existing 401 authentication response |
| Inactive, role-changed, or stale-session actor | Existing 401 invalid-token response |
| Valid non-Super-Admin role | Generic 403 before dashboard repository entry |
| Super Admin when the sole-active invariant is false | Non-disclosing 401 invalid-token response; no aggregate query |
| Active sole Super Admin | Global read |

All successful responses set `Cache-Control: private, no-store`.

### 3.2 Request bounds

- `periodDays`: exact enum `7 | 30 | 90`, default `30`.
- Project/workforce `limit`: default `20`, maximum `50`; `offset >= 0`.
- Search: trim, maximum 100 characters, safely escape database matching; no normalized-search field/backfill.
- Top-risk list: maximum 10 projects.
- Trend buckets: maximum 90 daily buckets.
- Data-quality issue details: maximum 50 safe issues plus total count.
- Invalid enums, unsafe ranges, or unrecognized sort/filter combinations return 400.

Project filters cover bounded module, canonical project status, module status, risk level/factor, and sort enums. Workforce filters cover worker role, assignment state, capacity state, KPI availability, search, and stable sort.

### 3.3 Response envelope and units

Every dashboard response includes one request-owned `observedAt`. Period-based responses also include UTC `startAt` and `endAt`. UTC day boundaries are used because no organization timezone contract exists.

Overview groups data by domain:

```text
observedAt
period { days, startAt, endAt }
projects
estimation
design
procurement
finance
execution
workforce
governance
risk { projectDistribution, factorDistribution, topProjects }
trends
dataQuality { status, totalIssueCount, issues, unavailableMetricKeys }
```

Contract rules:

- money is integer paise;
- margins and returned rates use explicit integer basis points;
- every ratio includes numerator, denominator, and nullable `rateBps`;
- a zero denominator returns `rateBps: null`;
- eligible, tracked, and unavailable counts remain distinct;
- project/workforce pages use the standard pagination envelope and deterministic stable-ID tie-breaking;
- project rows carry stable Project, Estimate/version/review-round, Design Plan version, task, worker, and Finance bucket/version identity where present; and
- dashboard payloads exclude client email/mobile, invitation tokens, proof/file storage references, documents, and private URLs.

### 3.4 Finance contract

Finance fields remain structurally compatible with the canonical portfolio summary:

- `approvedContractTotalPaise` includes GST;
- `approvedSubtotalPaise` is approved net revenue excluding GST;
- `approvedGstPaise` is excluded from revenue/profit/cost budget;
- `targetProfitPaise` remains the current per-project rounded 20% target sum;
- `recordedCostPaise` and `overheadPaise` come only from posted ledger entries;
- `currentProfitPaise` and `currentMarginBps` are labelled live, not final; and
- asymmetric two-project fixtures must reconcile exactly with `/finance/projects`.

The backend may extract shared read-only finance reporting functions, but existing Finance responses and formulas must not change.

### 3.5 Execution and workforce contract

- Execution includes only `site_execution` and `trade_execution` task kinds.
- Weighted progress uses persisted `plannedEffort`, then the established workflow-kind fallback; return numerator, denominator, and fallback-task count.
- Workforce includes active users in canonical `WORKER_ROLES`, not every operational role.
- Average KPI includes only workers with at least one eligible KPI component; return eligible/no-data counts.
- Existing workload is a bounded planned/completed/remaining-effort measure, not worker capacity. Return its exact effort numerator/denominator separately; expose capacity as unavailable and over-capacity as nullable until an authoritative capacity field exists.
- Inactive-but-resolvable assignees remain a red staffing factor and a safe data-quality/assignment exception; a broken or cross-project assignee identity makes the affected metric unavailable.

### 3.6 Risk contract

Use existing levels `gray | green | yellow | red`. Overall risk is the worst eligible factor, ordered red, yellow, green; gray means no eligible signal.

Reason codes are closed and backend-owned. The initial set covers:

```text
project_deadline_overdue
task_overdue
task_forecast_late
task_due_soon
task_blocked
task_behind_schedule
task_low_schedule_buffer
cost_budget_exceeded
cost_budget_headroom_low
overdue_execution_unassigned
active_execution_unassigned
inactive_execution_assignee
lead_next_action_overdue
project_on_hold
estimate_changes_requested
design_changes_requested
delivery_failed
delivery_disabled
```

Each factor returns `kind`, `level`, `reasonCode`, display reason, safe source entity type/ID, observed value, threshold when applicable, and safe drill-down target. A project may contribute to multiple factor occurrences; unique project counts and factor counts are separate. Risk is current-state only.

### 3.7 Data-quality and partial-failure contract

- Stable-identity/lineage contradictions make only affected metrics unavailable when isolation is safe.
- Base project/identity aggregate failure fails the request.
- Independent module aggregate failure may return verified modules and mark the failed module keys unavailable.
- A missing module record is ordinary unavailable/not eligible data; a mismatched record is a data-quality issue.
- Issue codes/messages are safe and bounded; internal stack/query details are never returned.
- The frontend does not derive or repair a failed metric.

### 3.8 Frontend URL/query/cache contract

- Super Admin home and fallback: `/admin/dashboard`.
- Keep `/admin/users`, `/admin/projects`, and existing Super Admin destinations as explicit safe return paths.
- Selected dashboard section uses `?tab=overview|projects|estimation|design|procurement|finance|execution|workforce|risk`.
- Invalid tab falls back to Overview; invalid period falls back to 30.
- Period, filters, sort, and offset are URL-backed; filter changes reset offset to zero.
- Query namespace root: `['super-admin-dashboard']`.
- Overview performs one request. Project-backed tabs share the paginated projects endpoint; Workforce alone uses the workforce endpoint.
- Dashboard queries use a 30-second stale time and locally set `refetchOnWindowFocus: true`; do not change global query defaults.
- Background refresh retains current data and timestamp; `observedAt` advances only after success.
- Successful local mutations listed in T9 invalidate the dashboard namespace.

## 4. Dependency-ordered implementation graph

### T0 — Baseline and contract handoff

**Owner:** Primary integrator
**Dependencies:** Approved task plan and selected execution mode
**Writes:** No product source; planning/coordination only

Actions:

1. Re-run the baseline checks in section 2.1.
2. Freeze permission/policy version, DTOs, request enums, units, ratio shape, reason/data-quality codes, pagination, and query keys from section 3.
3. Confirm exclusive backend/frontend file ownership and dirty-target handling.
4. Give both writers the same acceptance-criteria and verification matrix.

Exit criteria:

- no dirty/shared target is unowned;
- frontend and backend agree on exact DTO/permission/query contracts; and
- neither writer has an unresolved cross-stack question.

Stop/report if the current worktree conflicts with the approved spec/plan or an exact contract cannot be frozen safely.

### T1 — Pure backend dashboard contracts and risk/metric domain

**Owner:** Backend implementer
**Dependencies:** T0
**Parallel safety:** Can run in parallel with frontend T6–T7; owns only backend paths

Create:

- `backend/src/contracts/super-admin-dashboard.ts`
- `backend/src/domain/super-admin-dashboard.ts`
- `backend/tests/super-admin-dashboard-domain.test.ts`

Modify only if shared-rule extraction is necessary:

- `backend/src/domain/risk.ts`
- `backend/src/domain/kpi.ts`
- `backend/tests/risk.test.ts`
- `backend/tests/kpi.test.ts`

Actions:

1. Define DTO/filter/sort/reason/data-quality constants and exhaustive types.
2. Implement pure ratio, status grouping, weighted progress, risk-factor, worst-level, and unique-project/factor aggregation rules.
3. Reuse or extract task-risk facts/constants; do not duplicate task-risk thresholds in a Mongo pipeline.
4. Enforce safe integer paise/BPS and null-rate behavior.
5. Add truth-table tests for every risk factor, boundary, precedence, gray/no-signal case, and duplicate factor occurrence.

Exit criteria:

- pure tests cover all approved formulas and reason codes;
- no Express/Mongoose/UI dependency enters the domain module; and
- no existing risk/KPI behavior changes without characterization coverage.

### T2 — Canonical finance reporting reuse

**Owner:** Backend implementer
**Dependencies:** T1 finance DTO frozen
**Parallel safety:** Sequential within the backend lane

Preferred new file:

- `backend/src/services/project-finance-reporting.ts`

Likely modified files:

- `backend/src/services/project-finance.service.ts`
- `backend/tests/project-finance.test.ts`
- `backend/tests/project-finance-mongo.replica-set.test.ts`

Actions:

1. Extract the minimum shared, read-only approved-baseline validation, position/portfolio reduction, safe addition, and lineage issue classification required by the dashboard.
2. Keep existing Finance endpoint output and ordering compatible.
3. Add two unequal-project reconciliation fixtures including different GST, direct spend, procurement, employee/other cost, overhead, current margin, and over-budget state.

Exit criteria:

- canonical Finance tests remain unchanged/passing;
- dashboard and Finance summaries reconcile exactly; and
- no ledger/project/estimate mutation or money-formula change is introduced.

Stop/report if aggregation cannot preserve Finance membership/lineage without a material Finance contract change.

### T3 — Aggregate-oriented repository read model

**Owner:** Backend implementer
**Dependencies:** T1–T2
**Parallel safety:** Exclusive ownership of repository core files

Create:

- `backend/src/repositories/super-admin-dashboard.ts`

Modify:

- `backend/src/repositories/types.ts`
- `backend/src/repositories/memory.ts`
- `backend/src/repositories/mongo.ts`
- `backend/src/seed/data.ts` only for optional, test-only in-memory dashboard fixture shapes
- `backend/tests/repository.test.ts`
- `backend/tests/mongo-repository.test.ts`

Actions:

1. Add aggregate/page methods for Overview, Projects, and Workforce.
2. Implement memory/Mongo contract parity using asymmetric projects, tasks, workers, estimates, review rounds, finance positions, and governance queues.
3. Use Mongo `$match`/`$group`/`$facet`, stable-ID joins, paginated rows, bounded top-N arrays, and deterministic tie-breakers.
4. Keep module facts separate until stable project/estimate/version lineage is validated.
5. Return bounded facts to the service; do not return secrets/private storage fields.
6. Instrument repository tests to prove totals do not depend on page size and denied actors never enter aggregate methods.

Exit criteria:

- memory and Mongo adapters return the same DTO for equivalent data;
- overview cardinality/query shape is bounded independently of organization size;
- project/workforce filters and pagination are server-applied; and
- no endpoint/page loop or N+1 per project/worker exists.

### T4 — Backend authorization, service, routes, OpenAPI, and application wiring

**Owner:** Backend implementer
**Dependencies:** T3
**Parallel safety:** Exclusive ownership of backend shared registries

Create:

- `backend/src/services/super-admin-dashboard.service.ts`
- `backend/src/routes/super-admin-dashboard.ts`
- `backend/tests/super-admin-dashboard.test.ts`
- `backend/tests/fixtures/super-admin-dashboard-route-operations.ts`

Modify:

- `backend/src/domain/authorization.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/app.ts`
- `backend/src/openapi.ts`
- `backend/tests/authorization-policy.test.ts`
- `backend/tests/frontend-authorization-contract.test.ts`
- `backend/tests/route-operation-registry.test.ts`
- `backend/tests/super-admin-authorization.test.ts`
- `backend/tests/auth-authorization.test.ts`
- `backend/tests/api-docs.test.ts`

Actions:

1. Add `admin.dashboard.read`, bump the mirrored authorization policy version, and register exactly three operations.
2. Add runtime Zod query validation and private/no-store response headers.
3. Recheck sole-active Super Admin before aggregation.
4. Capture one `observedAt`, derive UTC period boundaries, compose partial module results, and project safe DTOs.
5. Wire the service/router into `createApp` using the existing injected repository boundary.
6. Document request/response enums, units, nullable ratios, pagination, error behavior, and safe data quality in OpenAPI.
7. Assert anonymous and every role, including zero dashboard repository calls for denied roles.

Exit criteria:

- route, authorization, frontend-policy parity, and OpenAPI inventories are exact;
- all three endpoints meet the permission/failure/header contract; and
- no response includes forbidden private fields.

### T5 — Mongo performance and evidence-based index gate

**Owner:** Backend implementer
**Dependencies:** T3–T4 functional pipelines
**Parallel safety:** Sequential within backend lane; no concurrent model/index writer

Create:

- `backend/tests/super-admin-dashboard-mongo.replica-set.test.ts`

Inspect with `explain('executionStats')`; modify only when evidence proves need:

- `backend/src/models/Project.ts`
- `backend/src/models/Estimate.ts`
- `backend/src/models/ProjectWorkflowTask.ts`
- `backend/src/models/Task.ts`
- `backend/src/models/FinanceLedgerEntry.ts`
- `backend/src/models/EstimateClientReviewRound.ts`
- `backend/src/models/DesignPlanReviewRound.ts`
- `backend/src/models/application-indexes.ts`

Actions:

1. Exercise global status/date, project deadline, estimate/design approval, workflow status/deadline/completion, ledger-period, workforce, and paginated sort/filter predicates.
2. Record query plans and add only minimal justified compound indexes.
3. Verify index registration/startup locally; do not connect to or mutate production.
4. Assert bounded top lists, pagination facets, stable ordering, and finance/risk parity on unequal data.

Exit criteria:

- major selective predicates use a justified index or have a documented bounded reason not to;
- no unexplained full scan/unbounded sort remains; and
- no backfill, normalized search field, write migration, or live index creation is performed.

### T6 — Frontend contracts and tested dashboard query namespace

**Owner:** Frontend implementer
**Dependencies:** T0; exact backend DTO/permission freeze
**Parallel safety:** Can run in parallel with backend T1–T5; owns only frontend paths

Create:

- `frontend/src/features/admin/dashboard/superAdminDashboardApi.ts`
- `frontend/src/features/admin/dashboard/superAdminDashboardApi.test.ts`

Modify:

- `frontend/src/api/types.ts`
- `frontend/src/api/authorization-contract.ts`
- `frontend/src/api/authorization-contract.test.ts`
- `frontend/src/test/authFixtures.ts`

Actions:

1. Mirror exact backend DTOs, closed enums, ratio/paise/BPS units, stable IDs, data-quality shapes, permission, and policy version.
2. Add `dashboardKeys.all`, period Overview, filtered Projects, and period/filtered Workforce keys.
3. Add whitelisted/trimmed query builders with stable `URLSearchParams` encoding.
4. Prove one Overview request, stable query keys, correct pagination, and no legacy `/admin/projects` or `/finance/projects` fetch-all loop.

Exit criteria:

- frontend/backend authorization and DTO contracts match;
- API tests cover every request enum and encoding boundary; and
- React receives complete server-derived values without needing domain calculations.

Stop/report if the backend omits units, `observedAt`, eligible/tracked counts, safe data quality, stable IDs, or paginated drill-down fields.

### T7 — Super Admin home, route, safe return paths, and navigation

**Owner:** Frontend implementer
**Dependencies:** T6 permission/type foundation
**Parallel safety:** Sequential within frontend lane

Modify:

- `frontend/src/app/routeRegistry.ts`
- `frontend/src/app/router.tsx`
- `frontend/src/app/routePaths.ts`
- `frontend/src/app/router.test.tsx`
- `frontend/src/app/routePaths.test.ts`
- `frontend/src/components/layout/navigation.test.tsx`
- `frontend/src/components/layout/AppShell.test.tsx` when needed for desktop/mobile parity

Actions:

1. Register `/admin/dashboard` first for Super Admin and guard it with `admin.dashboard.read` plus presentation role.
2. Make `/admin/dashboard` the Super Admin role home.
3. Preserve `/admin/users`, `/admin/projects`, Configuration, response/approval/access, and Finance paths as explicit safe return targets.
4. Keep All Projects label, route, and behavior unchanged.
5. Test sign-in/root/fallback, direct safe paths, permission denial, navigation order, and desktop/mobile parity.

Exit criteria:

- Super Admin lands on Dashboard/Overview;
- other role homes/routes remain unchanged; and
- denied roles render no dashboard and make no dashboard request.

### T8 — Dashboard page, tabs, summaries, and drill-downs

**Owner:** Frontend implementer
**Dependencies:** T6–T7
**Parallel safety:** Sequential within frontend lane; owns all new dashboard feature files

Create under `frontend/src/features/admin/dashboard/`:

- `SuperAdminDashboardPage.tsx`
- `DashboardNavigation.tsx`
- `DashboardOverview.tsx`
- `DashboardProjectDrilldown.tsx`
- `DashboardWorkforceDrilldown.tsx`
- `dashboardPresentation.ts`
- `super-admin-dashboard.css`
- `SuperAdminDashboardPage.test.tsx`

Actions:

1. Implement URL-backed tab/period/filter/sort/page state and invalid-value fallbacks.
2. Add local 30-second stale time, focus refetch, manual refresh, and old-timestamp preservation.
3. Render the approved Overview hierarchy and all nine tabs.
4. Reuse MetricCard/Surface/StatusBadge/ProgressBar/PageState/SectionState/Button and Finance display semantics.
5. Format paise/BPS/dates and returned ratios only; perform no finance, risk, KPI, or module-progress derivation.
6. Implement text-equivalent charts, explainable risk reasons, eligible/tracked/unavailable states, stable drill-down links, filters, pagination, and partial errors.
7. Adapt the established tab pattern: roving keyboard focus, arrows/Home/End, explicit activation, panel-heading focus, mobile **Dashboard section** select, and no refresh focus theft.
8. Implement responsive layouts: four/two/one-column summaries, contained tables, labelled mobile row cards, reduced motion, and no 320px overflow.

Exit criteria:

- populated, empty, loading, background refresh, full error, partial data-quality, no-match, and pagination-error states are tested;
- red/yellow/green/gray are textual and reasoned, not color-only;
- every chart value is available in text; and
- no mutation/personal action is added.

### T9 — Dashboard invalidation and deterministic visual QA fixture

**Owner:** Frontend implementer
**Dependencies:** T6 query namespace and T8 page
**Parallel safety:** Sequential within frontend lane; exact existing mutation files owned here

Add `dashboardKeys.all` invalidation after successful relevant mutations in:

- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx`
- `frontend/src/features/admin/ClientResponseDecisionDialog.tsx`
- `frontend/src/features/admin/DesignPlanResponseInboxPage.tsx`
- `frontend/src/features/admin/DesignAssignmentPanel.tsx`
- `frontend/src/features/admin/WorkerAssignmentPanel.tsx`
- `frontend/src/features/admin/UserMutationDialog.tsx`
- `frontend/src/features/admin/InviteUserDialog.tsx`
- `frontend/src/features/admin/InvitationActionDialog.tsx`
- `frontend/src/features/access/AccessRequestDecisionDialog.tsx`
- `frontend/src/features/finance/ProjectFinancePanel.tsx`
- `frontend/src/features/procurement/ProcurementProjectPage.tsx`
- `frontend/src/features/workflow/OperationalTaskQueue.tsx`
- `frontend/src/components/tasks/TaskUpdateDialog.tsx`
- `frontend/src/features/manager/DeadlineRevisionDialog.tsx`

Update each existing focused mutation test to assert invalidation only after success.

Create a deterministic, development/test-only QA harness:

- `frontend/qa/super-admin-dashboard.html`
- `frontend/src/test/fixtures/superAdminDashboardQaEntry.tsx`
- feature-owned asymmetric dashboard fixture data

The harness must not be reachable from production navigation, call a live backend, carry real client data, or add a runtime dependency.

Exit criteria:

- every approved local mutation invalidates the root namespace after success and not after failure;
- cross-user freshness remains handled by focus/manual refetch;
- the QA harness renders populated and state variants without product data writes; and
- focused axe/CSS contract tests pass.

### T10 — Integrated reconciliation

**Owner:** Primary integrator
**Dependencies:** Backend T1–T5 and frontend T6–T9 complete
**Writes:** Only targeted reconciliation fixes after ownership is reassigned

Actions:

1. Inspect the complete diff and reconcile backend/frontend permission, policy version, DTO enums, units, reason/data-quality codes, query parameters, and pagination.
2. Trace every acceptance criterion to implemented source/tests.
3. Confirm no legacy endpoint is used for dashboard aggregation and no product invariant changed.
4. Run focused cross-stack checks before review.

Exit criteria:

- the integrated contract is exact;
- no dirty/unrelated path was changed or reformatted; and
- review can evaluate one stable worktree.

### T11 — Integrity review

**Owner:** `integrity_reviewer`
**Dependencies:** T10
**Mode:** Read-only; must finish before final verification

Review:

- authorization and sole-active actor behavior;
- stable project/estimate/review/bucket/task/worker lineage;
- finance reconciliation, paise/BPS labels, and live/final semantics;
- risk parity, gray/unavailable behavior, factor versus unique counts;
- workforce KPI eligibility and workload denominators;
- partial failure, data quality, caching/invalidation, and cross-user staleness;
- pagination, sorting, query bounds, index evidence, privacy, and no-fetch-all behavior; and
- frontend focus, responsive states, accessible names, and mutation-surface leakage.

Confirmed findings return to the assigned backend/frontend owner. The primary integrator reconciles cross-stack findings. Repeat review for material fixes.

### T12 — Final verification

**Owner:** `verification_runner`
**Dependencies:** T11 findings resolved
**Mode:** Read-only integrated verification

Run the commands and visual matrix in sections 5–6. Record exact results, environment dependencies, unrun checks, artifacts, and remaining blind spots. Do not repair product source during this task.

## 5. Verification matrix

| Acceptance criteria | Required evidence |
|---|---|
| AC1–2 | Route-home/fallback/navigation tests; direct browser entry; All Projects regression |
| AC3–7 | Backend memory/Mongo asymmetric aggregates; frontend all-tab rendering and status/lineage assertions |
| AC8–9 | Dashboard versus canonical Finance reconciliation on two unequal projects; exact paise/BPS and label assertions |
| AC10 | Execution-kind truth table; open/in-progress/completed/overdue/unassigned and weighted-progress tests |
| AC11 | Unequal worker loads, eligible KPI worker, no-KPI worker, inactive-assignee case |
| AC12–14 | Domain risk truth table; worst-factor/gray behavior; unique versus occurrence counts; no SLA/history response fields |
| AC15 | Text-equivalent chart assertions, axe scan, keyboard-only interaction, no color/hover-only information |
| AC16 | Empty, loading, refresh, full/partial error, stale lineage, no match, pagination failure, permission loss |
| AC17 | Anonymous and every role; denied roles cause zero repository/frontend dashboard calls |
| AC18 | Exact response projection/privacy assertions and safe QA fixtures |
| AC19 | One Overview request, no legacy/fetch-all requests, Mongo facets/top bounds, call-count and query-plan evidence |
| AC20 | Existing Admin/role routes, Finance, KPI, workflow, invitations, access, response/approval, routing/navigation regressions |
| AC21 | Focused suites, backend/frontend typecheck/full test/build, rendered QA, `git diff --check`, `git status --short` |

### Focused backend commands

```sh
cd backend && npm test -- tests/super-admin-dashboard-domain.test.ts tests/super-admin-dashboard.test.ts tests/risk.test.ts tests/kpi.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts tests/api-docs.test.ts tests/project-finance.test.ts
cd backend && npm test -- tests/super-admin-dashboard-mongo.replica-set.test.ts tests/project-finance-mongo.replica-set.test.ts
```

### Focused frontend commands

```sh
cd frontend && npm test -- src/features/admin/dashboard/superAdminDashboardApi.test.ts
cd frontend && npm test -- src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx
cd frontend && npm test -- src/app/router.test.tsx src/app/routePaths.test.ts src/components/layout/navigation.test.tsx src/test/accessibility.test.tsx
```

### Full gates

```sh
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
git diff --check
git status --short
```

There is no repository lint script. Do not claim lint passed.

## 6. Rendered interaction and visual QA

Use the deterministic QA harness; do not seed or connect to production. Verify these viewports:

- 1440 × 1000
- 1024 × 768
- 768 × 1024
- 390 × 844
- 320 × 800

Scenarios:

1. Overview with asymmetric populated data.
2. Empty organization.
3. Initial loading and retained shell.
4. Background refresh with old timestamp retained.
5. Full failure and retry.
6. Partial data-quality failure with other sections intact.
7. Projects filters, no matches, previous/next pagination, and page failure.
8. Finance with two unequal projects, GST/net/live labels, and over-budget risk.
9. Workforce with eligible/no-data KPI, explicit capacity-unavailable, unassigned, and inactive-assignee states.
10. Risk with red/yellow/green/gray and multiple factors on one project.
11. Complete keyboard tablist behavior, Home/End, explicit panel focus, mobile selector, refresh focus retention, and reduced motion.
12. Super Admin success versus Admin/other-role generic denial with zero dashboard requests.
13. Network proof: one Overview request, bounded page requests, and no legacy/fetch-all loop.

For each viewport/scenario, inspect page overflow, card/table containment, text truncation, focus visibility, heading/landmark order, risk/finance labels, chart text equivalence, and accessible names. Run axe against populated, empty, error, and partial-failure states. Store screenshots only in an ignored temporary directory and report its path; do not commit screenshots.

## 7. Safe parallel schedule

```text
T0 contract handoff
├── Backend lane:  T1 → T2 → T3 → T4 → T5
└── Frontend lane: T6 → T7 → T8 → T9
                         ↓
                 T10 integration
                         ↓
                 T11 integrity review
                         ↓
                 T12 final verification
```

Backend and frontend lanes may run in parallel only after T0. Within each lane, tasks remain sequential because they share core registry/type/repository/page files. Integrity review and verification are sequential after all writers finish.

## 8. Completion and handoff requirements

Final handoff must report:

- dashboard/home/navigation outcome and principal metric/risk decisions;
- every affected file grouped by backend, frontend, QA, and planning artifacts;
- exact focused/full/visual checks and results;
- Finance reconciliation and Mongo query-plan evidence;
- unrun checks and why;
- temporary screenshot/output paths;
- confirmation that no migration, seed, live index creation, production connection, deployment, commit, push, external message, or dependency change occurred; and
- remaining risks, especially finance-reporting refactor risk, cross-collection observed-snapshot drift, search/index limitations, and cross-user freshness.

Implementation is complete only when all acceptance criteria are traced, integrity findings are resolved, verification is integrated rather than transient, and no required check is reported as passed without being run.

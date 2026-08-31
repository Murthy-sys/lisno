# Super Admin advanced metrics dashboard design

**Date:** 2026-08-30
**Status:** Approved
**Owner:** Lisno product and engineering
**Scope:** Super Admin organization overview, module metrics, explainable risk analysis, and drill-down navigation

## 1. Decision summary

Lisno will add a dedicated **Super Admin Dashboard** and make it the Super Admin landing page. The dashboard will open on an organization-wide **Overview**, not on an “All Projects” selection or project list. “All Projects” remains available as a secondary administration destination and project drill-down.

The Overview will summarize every operational area that has an authoritative source in the current product: Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, Governance attention, and Risk. Each dashboard tab will expose its own metrics and a server-paginated drill-down. The Overview will show a compact summary from each tab so the Super Admin can see organization health without visiting every tab first.

Risk analysis will be deterministic, server-derived, and explainable. It will use the existing task-risk calculation plus explicit schedule, finance, staffing, and workflow signals. It will not introduce a weighted “AI risk score,” because the repository has no approved weights or historical calibration data. Every risk state must identify its factor, source, observed value, severity, and affected project.

The recommended technical shape is a purpose-built, Super Admin-only aggregation API. It will aggregate across full authorized result sets on the server and return bounded summaries and paginated drill-down rows. The browser must not fetch every project, finance bucket, task, user, and approval queue to calculate organization metrics.

## 2. Current-state evidence

### User-visible behavior

- There is no dedicated Super Admin metrics dashboard.
- The current project-administration page renders a paginated list titled **All Projects** for a Super Admin and shows only project identity, workflow status, estimator, next action, and estimate value.
- The Super Admin home route currently resolves to `/admin/users`; the first project navigation item is `/admin/projects`, relabelled **All Projects** for this role.
- Existing Super Admin navigation separates Users, Configuration, Client responses, Design approvals, Access requests, and Finance, but it provides no cross-module overview or unified risk analysis.

### Traced sources of truth

| Area | Current authoritative source |
|---|---|
| Project identity and lifecycle | Canonical `Project` record and `Project.status`, planned/actual dates |
| Estimation | Estimate status plus immutable Client-approved estimate baseline |
| Design | Design-plan task status/version and immutable review history |
| Procurement | Approved-estimate section lineage, procurement workflow task, and posted receipt-backed finance entries |
| Finance | Project finance bucket and ledger-derived portfolio summary, in integer paise |
| Execution | Project workflow tasks, assignment identity, progress, due date, and completion time |
| Task delivery risk | Shared backend `calculateTaskRisk` domain rule |
| Workforce KPI/workload | Shared backend KPI calculation and task/event lineage |
| Users and governance | User directory, invitations, access requests, client-response tasks, and design-response tasks |

### Existing reusable capabilities

- The finance service already returns full-result-set portfolio totals independently of pagination, including approved contract value, approved net revenue, GST, target profit, cost budget, recorded costs, overheads, current profit, margin, over-budget projects, overdue projects, late completions, and overdue tasks.
- Design and operational workflow tasks can already be normalized through the shared KPI/risk path, including a deadline fallback for older workflow rows.
- Existing UI primitives cover metric cards, status badges, progress bars, surfaces, page/section states, buttons, and accessible finance charts.
- Backend route-operation authorization and OpenAPI inventories provide the canonical security and API registration boundaries.

### Confirmed gap

The missing behavior is not a presentation-only gap. The current project list is page-bounded and does not carry enough cross-module data to compute accurate organization totals. Correct implementation therefore requires a new server-side aggregate/read contract, explicit Super Admin authorization, frontend navigation/routing, dashboard presentation, and regression coverage.

## 3. Product goal and outcome

The sole active Super Admin can open one command center and answer, without first selecting a project:

1. How many projects are in each lifecycle and module state?
2. Which projects and teams require attention now, and why?
3. Where are estimation, design, procurement, finance, and execution bottlenecks?
4. What is the live approved commercial position, with GST and non-final profit labelled correctly?
5. How much work is open, overdue, unassigned, completed, or concentrated on overloaded workers?
6. Which exact project, workflow, finance, or workforce record should be opened next?

Success means the dashboard totals reconcile to their canonical module sources, risk reasons are explainable, all drill-down data is server-paginated, and no non-Super-Admin role can read the global contract.

## 4. Actors, scope, and non-goals

### Actor

- The sole active `super_admin` identity is the only dashboard actor in this release.
- Existing Admin screens and Admin project scoping remain unchanged.
- The dashboard is a global read surface. It does not impersonate Estimator, Designer, Client, Procurement, Finance, Site Manager, or Worker actions.

### In scope

- New `/admin/dashboard` frontend route and first Super Admin navigation item labelled **Dashboard**.
- `/admin/dashboard` becomes the Super Admin role home.
- Overview plus Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk tabs.
- A Governance attention strip for pending/failed administrative queues that already have durable records.
- Organization totals, selected-period flows/trends, module state distributions, finance metrics, execution/workforce metrics, and explainable project risk.
- Search, filters, sorting, pagination, drill-down links, freshness timestamp, and refresh behavior.
- Server-only global aggregation contracts with authorization, OpenAPI, frontend types, and cache/query-key integration.
- Accessible responsive charts with equivalent text/table values.

### Non-goals

- No changes to estimation, design, procurement, finance, execution, approval, invitation, or access-request state machines.
- No mutation buttons that bypass existing role-specific or personally attributable workflows.
- No new project status vocabulary and no backfill of project records.
- No weighted or machine-learned risk score, prediction model, historical-risk reconstruction, or automated decision.
- No fabricated module percentage where the source only provides a categorical status.
- No replacement of the existing All Projects administration page, Finance workspace, Users page, Configuration workspace, or response queues.
- No deployment, production data read/write, migration execution, telemetry service, or third-party chart dependency as part of this feature.

## 5. Information architecture and workflow

### Navigation

Super Admin navigation begins with:

1. **Dashboard** → `/admin/dashboard`
2. **All Projects** → `/admin/projects`
3. Existing Users, Configuration, Client responses, Design approvals, Access requests, and Finance destinations

Successful sign-in, root redirection, and rejected/unsafe return-path fallback send a Super Admin to `/admin/dashboard`. Existing safe direct return paths continue to work.

### Dashboard tabs

| Tab | Primary job |
|---|---|
| Overview | See summaries from every operational tab, leading risks, trends, and governance attention |
| Projects | Inspect project lifecycle, module readiness, owner, deadline, progress, and overall risk |
| Estimation | Inspect estimate funnel, approvals, changes requested, aging, and approved value |
| Design | Inspect assignment, in-progress work, review, changes requested, and approval state |
| Procurement | Inspect workflow state, task progress, planned procurement amount, posted procurement spend, and variance |
| Finance | Inspect approved net revenue, GST, target profit, live costs, overheads, current profit/margin, and budget exceptions |
| Execution | Inspect open/in-progress/completed/overdue/unassigned execution tasks and progress |
| Workforce | Inspect active workers, assignments, workload, completion, and eligible KPI |
| Risk | Inspect risk distribution, factor breakdown, top affected projects, and reason-level drill-down |

The selected tab is reflected in a shareable query string such as `/admin/dashboard?tab=risk`. An invalid or unavailable tab falls back to Overview without exposing data.

### Default behavior

- There is no project picker on initial load.
- Overview is intrinsically organization-wide.
- The global period defaults to the last 30 complete/current calendar days and can switch to 7, 30, or 90 days.
- Current-state snapshot cards remain “as of now”; the selected period changes flow, trend, completion, and KPI metrics only. The UI must distinguish snapshot values from period values.
- Project/module/status/risk filters live in the relevant drill-down tab and never silently alter Overview totals.

## 6. Metric contract and formulas

All ratios return their numerator and denominator as well as the formatted rate. A rate is `null`, rendered **Not available**, when its denominator is zero. A missing module record is not converted to a successful zero-progress state.

### Projects

| Metric | Definition |
|---|---|
| Total projects | Count of canonical Project records in global Super Admin scope |
| Created in period | Projects whose `createdAt` is inside the selected period |
| Planning / Active / On hold / Completed | Counts by canonical `Project.status` |
| Live overdue | Non-completed projects whose `plannedEndAt` is before `observedAt` |
| Completed late | Completed projects with `actualEndAt > plannedEndAt` |
| Completion rate | Completed projects / total projects |
| At risk | Unique projects whose overall explainable risk is red or yellow |

“Delayed” may appear as a visual roll-up, but the response and drill-down preserve **Live overdue** and **Completed late** separately so active delay is not confused with historical lateness.

### Estimation

Counts use current estimate state and never infer state from project names or UI labels:

- No estimate
- Draft/internal work: `draft`, `pending_manager_assignment`, `pending_designer_approval`, `designer_changes_requested`
- Ready to send: `ready_for_client`
- Awaiting client: `sent_to_client`
- Client changes requested: `client_changes_requested`
- Client approved: `client_approved` with a valid immutable approved baseline
- Approved net value and contract value: sum only immutable approved baselines; rupees are converted explicitly to integer paise at the dashboard boundary if the source summary still exposes rupees
- Median and oldest waiting age: calculated from durable status/round timestamps; shown as elapsed time, not assigned a risk severity without an approved SLA

### Design

Design metrics are categorical because the current Design Plan contract does not define a trustworthy continuous percentage:

- Pending assignment
- Assigned
- In progress
- Ready for client review
- Changes requested
- Approved
- Design approval rate = approved / design-plan-eligible projects
- Oldest pending review and failed/disabled delivery counts remain explicit operational attention values

No ordinal status-to-percentage mapping is permitted.

### Procurement

- Eligible project count and projects with a procurement task
- Open, in-progress, and completed procurement tasks
- Average procurement task progress from the persisted task percentage, with tracked count exposed
- Approved procurement amount, posted procurement spend, and variance, all in integer paise and joined by stable project/estimate/section/line-item IDs
- Projects with spend but missing or conflicting approved-source lineage are integrity exceptions, not ordinary metric rows

### Finance

Dashboard finance uses the same calculation source as the Finance portfolio; it does not reimplement money formulas in React:

| Dashboard label | Canonical field/meaning |
|---|---|
| Client-approved contract value | `approvedContractTotalPaise`, including GST |
| Approved net revenue | `approvedSubtotalPaise`, excluding GST |
| GST | `approvedGstPaise`, excluded from revenue, profit, and cost budget |
| Target profit | `targetProfitPaise`, the current fixed 20% target derived per project |
| Cost budget | `costBudgetPaise` |
| Recorded expenses | `recordedCostPaise` |
| Recorded overheads | `overheadPaise`, only posted ledger entries |
| Current profit (live) | `currentProfitPaise`; never labelled final profit while projects/cost capture remain open |
| Current margin | `currentMarginBps`, displayed from basis points |
| Budget exceptions | Over-budget project count, remaining budget, and project drill-down |

Portfolio values sum project-level rounded values and must reconcile exactly to the existing finance portfolio response for the same observed project set.

### Execution

- Total workflow tasks with kinds `site_execution` or `trade_execution`
- Open, in-progress, and completed counts
- Completed in selected period
- Overdue incomplete tasks based on the shared deadline/risk normalization
- Unassigned open/in-progress tasks
- Weighted progress using `plannedEffort` when present and the established workflow-kind fallback when absent; numerator, denominator, and fallback count are returned
- Project and role distributions

Design-plan upload, procurement, and finance workflow tasks remain in their own module metrics and are excluded from execution totals.

### Workforce

- Total active worker accounts across canonical worker roles, with counts by trade
- Workers with at least one active assignment
- Open/in-progress assigned task count and unassigned task count
- Tasks completed in the selected period
- Average calculated KPI across active workers with at least one eligible KPI component
- `kpiEligibleWorkerCount` and `noKpiDataWorkerCount` are always returned so a missing KPI is never treated as zero
- Workload distribution uses the existing bounded planned/completed/remaining-effort aggregation. Because the current user model has no authoritative worker-capacity denominator, capacity and over-capacity are explicitly **Not available** in this release rather than inferred; drill-down returns the exact effort numerator/denominator and availability state
- Inactive assignees attached to active tasks are reported as integrity/assignment exceptions

### Governance attention

Overview shows compact counts with links to existing workspaces:

- Pending, expired, and delivery-failed invitations
- Pending access requests
- Pending Client response tasks and failed/disabled deliveries
- Pending Design response tasks and failed/disabled deliveries

Configuration data is not given a synthetic health score. Configuration remains a direct workspace link.

### Trends

For 7/30/90-day windows, server-bucketed trend series may include:

- Projects created and completed
- Estimates Client-approved
- Design plans approved
- Workflow tasks completed
- Ledger expenses posted

Risk is a current snapshot only in this release. The system must not reconstruct a historical risk trend from current rows.

## 7. Explainable risk model

### Principle

Risk is a prioritization aid, not an automated approval or performance decision. The backend derives every factor at `observedAt`; the frontend only renders the returned level and reasons.

### Factor families

| Factor | Red condition | Yellow condition | Clear/unknown behavior |
|---|---|---|---|
| Schedule | Non-completed project past `plannedEndAt`, or any incomplete task with shared risk level red | Any task with shared risk level yellow | Green when tracked schedule signals are clear; gray when no schedulable signal exists |
| Finance | Recorded cost exceeds approved cost budget | Remaining cost budget is at or below 10% while the project is not completed | Green when an approved baseline exists and neither condition holds; gray before an approved baseline |
| Staffing | An overdue active execution task is unassigned, or an active task points to an inactive assignee | A non-overdue active execution task is unassigned | Clear when all active execution tasks have active assignees; gray with no eligible task |
| Workflow | A durable lead next action is overdue | Project is on hold, an estimate/design state is `changes_requested`, or a delivery is failed/disabled | Pending review age is displayed but is not risk-classified without an SLA |

### Overall project risk

- Overall level is the worst eligible factor: red before yellow before green.
- Overall level is gray only when the project has no eligible risk-bearing signal.
- No numeric weighted score is returned.
- A project can contribute to multiple factor counts; the response distinguishes unique at-risk projects from factor occurrence totals.
- Every factor contains `kind`, `level`, `reasonCode`, human-readable reason, source entity type/ID, observed value, threshold where applicable, and a safe drill-down target.
- Integrity conflicts that make a metric untrustworthy are returned in a separate `dataQuality` block and make the affected metric unavailable; the service must not downgrade corruption to gray risk or zero.

### Risk drill-down

The Risk tab supports server-side filtering by overall level, factor family, project status, module, and search. Default sorting is red before yellow, then overdue magnitude/affected count, then project name for deterministic ties.

## 8. Backend and API contract

### New read operations

1. `GET /api/v1/admin/dashboard/overview?periodDays=7|30|90`
   - Returns one bounded organization summary, trend buckets, risk distribution, governance attention, `observedAt`, period boundaries, and data-quality state.
2. `GET /api/v1/admin/dashboard/projects`
   - Returns paginated cross-module project snapshots.
   - Supports bounded `search`, `module`, `projectStatus`, `moduleStatus`, `riskLevel`, `riskFactor`, `sort`, `limit`, and `offset` inputs.
3. `GET /api/v1/admin/dashboard/workforce`
   - Returns paginated worker/task-load/KPI rows for the selected period with role, assignment, capacity, and KPI filters.

The exact response types live in shared backend contracts and mirrored frontend API types. Runtime Zod validation is authoritative; OpenAPI documents every query enum and response field.

### Overview response shape

The contract groups values by domain rather than returning a flat bag of labels:

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
dataQuality { status, issues, unavailableMetricKeys }
```

Each module group exposes eligible/tracked/unavailable project counts where applicable. Monetary values are integer paise; margin values are basis points; percentages include numerator and denominator.

### Project drill-down identity

Each row preserves stable IDs and source lineage:

- Project ID and canonical project fields
- Estimate ID/version and approved review round, when present
- Design Plan version/status, when present
- Workflow task counts/progress and stable assignee IDs
- Finance bucket ID/version and approved estimate baseline identity, when present
- Overall risk plus factor reasons

Names and labels are presentation only and are never used as joins.

### Aggregation and consistency

- Mongo implementation uses server-side grouped/count queries and indexed bounded lookups; it must not materialize every organization row in Node merely to count it.
- Memory and Mongo repositories/services return the same contract and are tested with asymmetric fixtures.
- Overview aggregation captures one `observedAt` and uses it for all deadline/risk calculations.
- Cross-collection reads are an observed snapshot and may be eventually consistent; lineage contradictions fail the affected metric safely and appear in `dataQuality`.
- Existing finance domain functions are reused or extracted into a shared read-only calculation path; dashboard code must not duplicate finance formulas.
- Existing task normalization and `calculateTaskRisk` are reused for design and operational tasks.
- Any required compound index is a schema/index change only and must be justified with query evidence in the later task plan; no data backfill is currently expected.

## 9. Authorization, privacy, and caching

- Add explicit dashboard read permission(s) and route-operation entries granted only to Super Admin.
- Every new route authenticates, re-reads the active actor, and verifies the current role and sole-active-Super-Admin invariant before aggregation.
- Admin and every other authenticated role receive a non-disclosing denial; anonymous users receive the normal authentication response.
- Frontend route/presentation guards are synchronized but are never treated as enforcement.
- Responses contain operational identities needed for authorized drill-down but no secrets, invitation tokens, access tokens, private file URLs, or document contents.
- HTTP responses use private, no-store semantics. TanStack Query may retain in-memory data with a short stale period, refetch on window focus, and expose manual refresh.
- The page displays `Updated <time>` from `observedAt`; it does not advance that label until a successful refresh replaces the response.
- Successful local mutations that affect dashboard values invalidate the dashboard query namespace: project initiation, estimate/client decision, design response, workflow progress/assignment, finance/procurement posting, user activation/role, invitations, and access-request decisions.

## 10. UX and content specification

### Overview hierarchy

1. Page header: **Organization dashboard**, selected period, freshness, Refresh
2. Priority strip: red/yellow project counts, overdue work, budget exceptions, unassigned overdue tasks, failed deliveries
3. Portfolio/project lifecycle summary
4. Cross-module health matrix with one row/card per module and a **View details** link
5. Risk factor analysis and top affected projects
6. Finance position using existing finance chart semantics
7. Execution and workforce health
8. Governance attention

The dashboard is read-first. “Initiate project” remains on All Projects rather than becoming the primary dashboard action.

### Tables and charts

- Reuse MetricCard, Surface, StatusBadge, ProgressBar, PageState/SectionState, Button, and existing finance chart patterns.
- Add no chart library unless a later approved task proves existing CSS/SVG primitives insufficient.
- Every visual chart provides the same values in adjacent text, a definition/legend, and a meaningful accessible name; information is never hover-only or color-only.
- Money labels state inclusive/exclusive GST and live/final meaning.
- Risk colors retain text labels and factor reasons.
- Project names link to the existing Super Admin project detail. Finance links use the existing authorized Finance detail. Other module drill-downs link only to safe read/admin surfaces that already permit Super Admin; no personal-action UI is exposed.

### Responsive behavior

- Desktop: multi-column metric groups plus detail table.
- Tablet: two-column cards and horizontally contained tables.
- Mobile: single-column summaries; the tab system uses the established accessible compact selector/tab pattern; tables become labelled stacked rows without dropping definitions or actions.
- No horizontal page overflow at 320 CSS pixels.

### Keyboard and accessibility

- Tabs implement `tablist`, `tab`, and `tabpanel` semantics, roving keyboard focus, arrow-key navigation, Home/End, and stable focus after data refresh.
- Filters have persistent labels, clear/reset controls, and announced result counts.
- Loading state uses skeleton/status content without replacing the entire application shell.
- Errors and partial metric failures provide a retry and identify which section is unavailable.
- Focus moves to the selected tab panel heading after an explicit tab change, without stealing focus during background refetch.
- Status contrast and focus indicators meet the existing application accessibility baseline.

## 11. Loading, empty, stale, error, and conflict states

| State | Required behavior |
|---|---|
| Initial loading | Show labelled dashboard skeletons and retain the shell/navigation |
| Empty organization | Show zero project/user counts and a clear “No projects yet” state; do not show risk as green |
| Module not eligible | Show **Not available** with eligible/tracked counts, not 0% |
| Background refresh | Retain prior values, mark refreshing, and preserve selected tab/filter/page |
| Overview failure | Show a page-level retry and no fabricated cached timestamp |
| One metric unavailable | Render other verified sections, mark the affected section unavailable, and expose the safe data-quality reason |
| Paginated drill-down failure | Keep already loaded/current rows and provide scoped retry |
| Stale lineage/conflict | Do not merge mismatched project/estimate/bucket/task data; fail the affected metric safely |
| Permission/session change | Clear dashboard cache and route through the normal authorization/session flow |

## 12. Options and tradeoffs

### Recommended: dedicated server-side dashboard with explainable factor severity

- Best correctness and performance for organization-wide totals.
- Reuses canonical domain calculations and enables bounded, filterable drill-down.
- Requires backend contracts and frontend work, but avoids fetch-all behavior and false precision.
- Keeps risk auditable by showing reasons rather than a composite score.

### Rejected: aggregate existing list endpoints in the browser

- Initially smaller backend change, but would require fetching every page from Projects, Finance, Procurement, Tasks, Users, and queues.
- Produces slow, race-prone snapshots, duplicated finance/risk formulas, and pagination-dependent totals.
- Conflicts with the existing Prompt 8 repository direction and server-derived risk/finance invariants.

### Deferred: weighted predictive risk score and historical risk trend

- Could provide ranking and forecasting after calibrated thresholds, snapshots, and business validation exist.
- Current data cannot validate weights or reconstruct historical risk accurately.
- Introducing it now would make a precise-looking but unsupported metric, so this release uses worst-factor severity and deterministic sorting.

## 13. Compatibility, rollout, and operations

- Existing routes and response contracts remain backward compatible.
- `/admin/users` remains directly accessible but is no longer the Super Admin role home.
- `/admin/projects` remains All Projects and retains initiation and project administration behavior.
- New API fields/routes are additive. No production backfill or write migration is expected.
- Frontend and backend authorization policy versions, route registry, safe return paths, OpenAPI inventory, and tests must change together.
- Rollback consists of restoring the prior Super Admin home/navigation and removing the additive dashboard routes; no dashboard-owned persistence must exist.
- The service may log aggregate query duration, result cardinalities, unavailable metric keys, and safe reason codes. Logs must not include client personal data, tokens, document references, or private URLs.
- Later implementation must define a response-time budget from realistic asymmetric fixtures and inspect Mongo query plans before adding indexes. The target is one bounded Overview response without browser fetch-all fan-out.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Counts disagree across tabs | One server aggregation contract, canonical status definitions, shared observed timestamp, reconciliation tests |
| Finance labels imply final profit | Exact approved net revenue/GST/target/live-profit labels and reuse of finance calculation source |
| Missing module data looks healthy | Eligible/tracked/unavailable counts and gray/Not available states |
| Risk appears subjective | Deterministic reason codes, documented thresholds, worst-factor severity, no weighted score |
| Dashboard leaks global data | Super Admin-only route operations, active-actor recheck, non-disclosing denial tests |
| Large organization causes fetch-all or memory pressure | Server grouping, pagination, bounded top lists, query-plan/index review |
| Cross-collection lineage silently mixes projects | Stable-ID joins, version/baseline proof, fail-safe data-quality results |
| Overview becomes visually overwhelming | Overview summaries with progressive disclosure into tabs and existing workspaces |
| Background updates make values stale | `observedAt`, manual refresh, focus refetch, and cross-feature invalidation |
| Historical risk chart is misleading | Risk remains a current snapshot until durable risk snapshots are explicitly designed |

## 15. Acceptance criteria

1. Super Admin sign-in and home redirection open `/admin/dashboard`; Overview is selected and no project picker is required.
2. Dashboard is the first Super Admin navigation item; All Projects remains separately reachable and behaves as it does today.
3. Overview shows project, estimation, design, procurement, finance, execution, workforce, governance, and risk summaries from server-derived data.
4. Each operational tab is directly addressable, keyboard accessible, refresh-safe, and provides a server-paginated drill-down or an explicit link to the canonical workspace.
5. Project snapshot totals reconcile to canonical Project records and distinguish planning, active, on-hold, completed, live-overdue, and completed-late states.
6. Estimation and Design metrics use exact persisted statuses and immutable approval baselines/history; the UI does not map categorical statuses to fake progress percentages.
7. Procurement spend and variance preserve stable estimate/section/line-item lineage and integer-paise amounts.
8. Finance totals reconcile exactly with the canonical Finance portfolio for at least two projects with unequal approved values, GST, costs, and overheads.
9. Finance labels distinguish contract value including GST, net revenue excluding GST, target profit, recorded costs/overheads, and current live profit/margin.
10. Execution totals distinguish module task kinds and correctly count open, in-progress, completed, overdue, and unassigned work.
11. Workforce average KPI excludes workers without eligible KPI data and reports both eligible and unavailable worker counts.
12. The backend derives risk using the documented schedule, finance, staffing, and workflow factors and returns explainable reasons; React performs no risk calculation.
13. Overall risk uses worst eligible factor, gray represents unavailable/not tracked, and unique at-risk project counts are not confused with factor occurrence counts.
14. Pending review age is visible but is not classified against an invented SLA; historical risk trend is not shown.
15. Every chart has an equivalent text representation and remains understandable without color or hover.
16. Loading, empty, background-refresh, partial-error, full-error, stale-lineage, and permission-loss states match this specification.
17. A non-Super-Admin authenticated user cannot read any global dashboard endpoint or render the route; anonymous access remains authenticated-protected.
18. Dashboard responses contain no secret, token, private file URL, document body, or unnecessary client personal data.
19. Overview aggregation is server-side and bounded; browser network checks show no fetch-all pagination loop across organization resources.
20. Existing Admin, All Projects, Users, Configuration, Client response, Design approval, Access request, Finance, and role-specific workflows retain their prior authorization and behavior.
21. Backend and frontend focused tests, typechecks, builds, rendered interaction/accessibility tests, asymmetric reconciliation tests, and repository hygiene checks pass before completion is claimed.

## 16. Assumptions, constraints, and approval decisions

### Assumptions fixed by this draft

- “Metrics of all tabs” means operational module health across Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, and Risk, with governance queues summarized on Overview.
- “Instead of picking all projects by default” means the Super Admin should land on a global organization Overview; All Projects remains a secondary project administration destination.
- The dashboard is read-first and organization-wide. Filters refine drill-down lists, not the meaning of headline Overview totals.
- Current explainable severity is more trustworthy than an unsupported numeric risk score.

### Constraints

- Project, approval, finance, identity, and workflow invariants in the repository remain authoritative.
- Money stays in integer paise internally; conversions and rounding remain explicit.
- Backend authorization and derived metrics remain authoritative.
- No dependency, persistence model, migration, deployment, production mutation, or external communication is approved by this specification alone.

### Decisions included in approval

Approving this specification approves:

1. Dashboard as the Super Admin home, with All Projects retained separately.
2. The nine-tab information architecture and Overview summaries.
3. Server-side aggregation and paginated drill-down APIs.
4. The documented explainable worst-factor risk model, including the 10% finance-headroom warning.
5. Current risk snapshot only, with weighted/predictive scoring and historical risk explicitly deferred.

No additional material product decision is known at this gate. Dependency-ordered implementation tasks, file ownership, exact test commands, and safe parallel boundaries will be written in the separate task-plan document only after this specification is approved.

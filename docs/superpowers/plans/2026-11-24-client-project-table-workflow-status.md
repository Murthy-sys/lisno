# Client project phases and project-progress removal: task plan

Date: 2026-11-24
Status: Implemented and locally verified. Updated specification and revised task plan approved; Mode A completed.

Source of truth: [Approved updated specification](../specs/2026-11-24-client-project-table-workflow-status-design.md).

## Outcome and invariants

Client home shows **Estimate → Post approval → Execution**, using initial Client approval and current design approval as the boundaries. Remove read-only project/floor progress percentages, bars and aggregate progress displays across all roles and matching dashboard report output. Preserve detailed stage/owner chips, risks, money, deadlines, task counts, completion rates, operational inputs and approval actions.

Frontend only. Existing endpoints, backend calculations, saved progress, historical artifacts, dependencies and permissions remain unchanged. No deployment, commits or external/customer actions. Do not run the whole application suite or investigate unrelated baseline defects.

## T1. Capture the current baseline and settle the data interface

Owner: primary. Prerequisite for all writers. Covers AC1–AC5.

- Capture fresh status, per-target diffs and copies, including untracked row-status/helper files from the earlier implementation. Preserve all prior chip, Client panel and quotation changes.
- Use `GET /projects/:projectId/status` for authorized status/exception evidence and the existing shared `GET /client/estimates` read for approval/design evidence. No phase inferred from names, progress or a missing estimate row alone.
- Settle a small pure Client phase resolver accepting one project ID, matching status and the authorized estimate collection. Its result distinguishes resolved phase, unavailable/conflicting evidence and any supplemental state. The detailed header formatter remains unchanged.
- Reconcile workflow versions before coding: collaborative initial approval must match its pre-approval evidence; design approval must match the current design/version/scope. Legacy records use explicit published estimate/design approval state. Revised quotations do not return an already Client-approved project to Estimate. Completion retains Execution with a Completed state.
- Settle one identity-scoped Client estimate query adapter/key under the existing client-estimates key family. The table and existing estimate consumers must share requests; current prefix invalidations must still reach them. Preserve denial clearing across any added key variants. Require fresh identity/session verification before exposing retained data.
- Map read-only progress outputs to the spec inventory. Keep editable site-completion reporting and its percentage-based validation, individual task work progress, uploads and unrelated ratios. Shared generic ProgressBar stays available.

## T2. Client phases and Client progress removal

Owner: Client frontend agent. Depends on T1; can run alongside T3–T5. Covers AC1–AC5.

Owned areas:

- `features/client/ClientProjectStatus.tsx`, its tests, and a small Client phase resolver/query adapter if warranted.
- `ClientDashboard.tsx`, `ClientDashboard.test.tsx`, `ClientDashboard.collapsible.test.tsx`, `ClientEstimateSummary.tsx` and associated tests.
- `ClientProject.tsx`, `ClientProjectQuickView.tsx`, `ClientSiteCompletionReview.tsx` and their affected tests.
- `styles/client-dashboard.css`.
- Client-estimate query integration in `features/estimates/estimateWorkflowApi.ts`, `EstimateReviewPanel.tsx`, `ClientPublishedEstimate.tsx`, and `features/client/ClientEstimationWorkspace.tsx`, limited to any necessary shared-query key/options, abort handling or denial-clearing compatibility. Update directly affected tests only.

Tasks:

1. Reuse the existing safe visible-row status consumer, replacing its detailed-stage label with the approved three-phase resolver. Load the Client estimate collection once per identity/session, sharing it with estimate links/reviews; never once per row. Keep status reads visibility-controlled with no polling.
2. Handle no-estimate/pre-estimate, initial approval, pending design, valid design approval, completion, revised quotation and invalid/mismatched sources. Preserve loading, stale, unavailable, retry, denial and account/session transitions. A failed or contradictory source cannot manufacture a phase.
3. Remove the Client Progress column, rebalance its five remaining columns, and remove read-only floor/project percentages in Client detail/quick-view/completion-review presentation. Preserve floor identities, approval evidence/actions and navigation.
4. Keep existing project list ordering, pagination, same-name IDs, denied/retained list behavior and estimate deep links. Ensure approval/design changes invalidate or refresh the shared phase inputs.

## T3. Designer, Manager and Head project displays

Owner: design/management frontend agent. Depends on T1; parallel with T2/T4/T5. Covers AC3–AC5.

Owned components and directly related tests:

- `features/designer/DesignerDashboard.tsx` and `ProjectWorkspace.tsx`.
- `features/manager/DesignerDetail.tsx`, `DesignerQuickReview.tsx` and `ManagementProjectWorkspace.tsx`.
- `features/head/OrganizationTree.tsx`; relevant ManagerDashboard/HeadDashboard integration tests.

Remove project-wide task-completion percentage widgets, project-link percentage suffixes and floor aggregate bars. Keep task-level actions/details, project links, assigned people, stage/owner chips, risk and workload values. Delete imports/calculations that become unused solely because their presentation is removed. Avoid unrelated layout/style refactoring; primary owns any truly shared styles.

## T4. Super Admin project/dashboard displays and reports

Owner: dashboard frontend agent. Depends on T1; parallel with T2/T3/T5. Covers AC3–AC5.

Owned directory slice: relevant components, data presentation helpers, styles and tests in `features/admin/dashboard/`:

- DashboardPriorityProjects, DashboardProjectDrilldown and DashboardOverview.
- dashboardViewModel, dashboardChartData, DashboardModuleCharts, DashboardTabSummary/OverviewCharts only where necessary to remove obsolete progress datasets or empty layouts.
- dashboardReportSections and `super-admin-dashboard.css`.

Remove project/portfolio Procurement/Execution progress percentages, bars, rings, headline metrics and corresponding chart/report fields. Remove progress-only selectors/options and derived presentation values when unused. Preserve completed-project counts/rates, operational task counts/states, risk, workforce, financial ratios, available filters and report behavior. Repair resulting column/grid layouts without inventing replacement metrics or changing backend contracts.

## T5. Project Manager, shared project overview, Finance and site workflow

Owner: primary. Depends on T1; parallel with T2–T4. Covers AC3–AC5.

Owned components and directly related tests:

- `features/project-manager/PMDashboardProjects.tsx`, `PMShared.tsx`, `ProjectManagerWorkspace.test.tsx`, `PMShared.test.tsx`, and `project-manager-dashboard.css`.
- `features/projects/AssignedProjectOverview.tsx`; relevant Procurement/Execution tests, without editing their unrelated behavior.
- `features/finance/FinanceProjectWorkflowControl.tsx` and tests; its shared snapshot covers Finance/Admin project views.
- `features/workflow/SiteCompletionPanel.tsx` and tests, plus preservation checks in OperationalTaskQueue.
- Shared stylesheet edits, only if required and explicitly coordinated; avoid broad cleanup of orphaned styles.

Remove project-progress columns/bars/read-only summaries and unused presentation-only averages. Preserve PM list/grid navigation, execution assignments, procurement/finance workflow controls and project stage/owner chips. In site-completion reporting, keep the editable percentage input, saved reporting state, validation and submission/approval actions; remove only separable summary presentation. Do not modify operational contracts to hide an input.

## T6. Integrated review

Owner: primary reconciliation plus `integrity_reviewer`. Depends on all writers stopping. Covers AC1–AC5.

- Compare final changes against the new baseline; preserve earlier work and avoid overlapping ownership.
- Audit phase transitions, workflow-version lineage, duplicate/foreign projects, identity/session caches, approval refreshes, denied reads and exception states. Validate that an initial Client approval and a later revised approval are not confused.
- Scan all inventoried renderers, chart selectors and dashboard report rows for remaining read-only project/floor progress. Classify surviving task/input/upload/financial percentages explicitly; do not remove them mechanically.
- Verify table/list/card/detail layout, headers, accessible controls and unchanged completion workflows. Resolve confirmed defects only, then stop writers for verification.

## T7. Focused integrated verification and handoff

Owner: `verification_runner` for commands after T6; primary for browser QA and reconciliation. Covers AC1–AC5.

Run the relevant existing suites for each changed slice, plus targeted phase regressions. Record one exact final manifest of the actual files; do not repeat already passing checks without a changed dependency or unresolved concern.

| Coverage | Focused suite selection |
| --- | --- |
| Client phases/cache/table | ClientProjectStatus, ClientDashboard, ClientDashboard.collapsible; ClientEstimateSummary and query/review consumers actually changed; ProjectStatusButton preservation. |
| Client detail/review | ClientProject, affected estimate-review tests and ClientSiteCompletionReview. |
| Designer/Manager/Head | DesignerDashboard, ProjectWorkspace, DesignerDetail, DesignerQuickReview, ManagementProjectWorkspace, relevant ManagerDashboard/HeadDashboard. |
| PM/shared/Finance | ProjectManagerWorkspace, PMShared, AssignedProjectOverview consumers, FinanceProjectWorkflowControl. |
| Super Admin | DashboardPriorityProjects, DashboardProjectDrilldown, DashboardOverview, DashboardModuleCharts, dashboardViewModel, dashboardChartData, dashboardReportSections. |
| Operational preservation | SiteCompletionPanel and affected OperationalTaskQueue scenarios. |

Use bounded Vitest file selections with `--maxWorkers=2`, then run from `frontend/`:

```sh
npm run typecheck
npm run build
```

No backend/OCR or full frontend suite. No lint script exists. Diagnose only failures associated with this change; record unrelated baseline limitations honestly.

Rendered checks use synthetic data and real components/styles at 1440 and 390 pixels: Client table with all three phase boundaries and unavailable/retry states; PM list/grid; a shared project-detail/floor summary; and representative Super Admin dashboard/report controls. Check absence of removed metrics, usable links/actions, no new body overflow, keyboard interaction and accessible names. Keep browser coverage representative and proportional rather than repeating every unchanged route.

Final acceptance evidence:

- **AC1/AC2:** asymmetric same-name projects; before/after initial Client approval and valid design approval; revised quotation, current-scope mismatch, legacy/collaborative records, completion, missing/duplicate/denied/delayed sources and session changes.
- **AC3:** reviewed inventory plus rendered/test assertions for removal of project/floor progress across roles and matching dashboard reports.
- **AC4:** relevant existing workflow/action tests pass; no changes to saved progress, payment/release gates, approval history or backend calculations.
- **AC5:** one shared estimate read, visibility-controlled status reads, proper invalidation/abort, safe retry/stale behavior and responsive/keyboard checks.

Run `git diff --check` and `git status --short`. Report exact results/warnings/unrun checks, affected files and remaining risks. Close local sessions and remove temporary QA fixtures/caches/screenshots after recording evidence. `frontend/dist/` is ignored build output. No commit, push, deployment or external mutation.

## Coordination

Mode A is already selected and persists. After this revised plan is approved, continue implementation without asking for the mode again. Keep one parent task active. T1 precedes writes; T2, T3, T4 and T5 have non-overlapping ownership and fit the primary plus three-agent limit. Tell each writer they share a dirty worktree and must preserve others' changes. Primary owns shared contracts, documentation, shared styles and integration. Any cross-slice change is coordinated before editing. Review and final verification follow writers sequentially.

## Verified baseline from the earlier table-stage slice

The earlier implementation remains in the worktree and is the starting point, not verification of the new scope:

- Captured baseline/status/diffs under `/private/tmp/lisno-client-status-9bwzy5v7`.
- Added visible-row workflow status, scoped cache/retry handling and extracted existing chip presentation without changing its behavior.
- Final command from `frontend/`: `npm test -- src/features/client/ClientDashboard.test.tsx src/features/client/ClientProjectStatus.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/project-status/ProjectStatusButton.test.tsx --maxWorkers=2` passed **80/80 tests, four files**, in 7.28 seconds.
- `npm run typecheck` passed. `npm run build` passed, 3,383 modules, with the existing large-chunk warning. `git diff --check` passed.
- Browser QA with real ClientDashboard/AuthProvider/query client/styles and synthetic responses passed at 1440/390: different stages for same-named planning projects, offscreen loading, scrolling, stale/keyboard retry, no body overflow, axe zero violations, no unexpected API/runtime errors. Browser/server sessions are closed.
- Independent scoped integrity review found no confirmed defects. Logs include `final-focused-tests.log`, `final-typecheck.log`, `final-build.log` and browser artifacts in the temporary directory. Preserve useful evidence until the expanded task's final handoff, then clean it up.
- The expanded implementation and verification are recorded below.


## Implementation and verification record

Implementation uses the existing authorized project-status and Client estimate endpoints. `clientProjectPhase.ts` resolves the three phases from initial approval and current design lineage. `clientEstimateQuery.tsx` shares a cancellable, identity/session-scoped estimate read across the table and existing review consumers. The detailed project-header stage/owner chip remains unchanged.

Removed read-only project/floor progress from Client, Designer, Manager, Head, Project Manager, shared Procurement/Execution detail, Finance/Admin workflow snapshots, Super Admin dashboards and matching reports. Final inventory also found the separate Admin completion summary; its Site progress field was removed and the remaining two summary columns rebalanced. Editable site-completion input, completion decisions, task-level reporting, finance, risk and unrelated ratios remain intact.

Integrity review found and resolved initial unpublished-draft phase detection and malformed action-ID handling. Exact backend initial-source action evidence permits pre-estimate/draft/submission captions without assuming that an absent estimate row proves approval state. Legacy/V2 internal-review actions can be identical before and after initial approval; without readable approval evidence those cases deliberately show an unavailable/review state. No phase is manufactured.

### Focused test manifest

Commands below run from `frontend/`; each uses `--maxWorkers=2`.

```sh
npm test -- src/features/designer/DesignerDashboard.test.tsx src/features/designer/ProjectWorkspace.test.tsx src/features/manager/DesignerDetail.test.tsx src/features/manager/DesignerQuickReview.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx src/features/manager/ManagerDashboard.test.tsx src/features/head/HeadDashboard.test.tsx --maxWorkers=2
npm test -- src/features/admin/dashboard/DashboardPriorityProjects.test.tsx src/features/admin/dashboard/DashboardProjectDrilldown.test.tsx src/features/admin/dashboard/DashboardOverview.test.tsx src/features/admin/dashboard/DashboardModuleCharts.test.tsx src/features/admin/dashboard/dashboardViewModel.test.ts src/features/admin/dashboard/dashboardChartData.test.ts src/features/admin/dashboard/dashboardReportSections.test.ts src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx --maxWorkers=2
npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/PMShared.test.tsx src/features/finance/FinanceProjectWorkflowControl.test.tsx src/features/workflow/SiteCompletionPanel.test.tsx src/features/workflow/OperationalTaskQueue.test.tsx src/features/projects/ProjectPageStatusHeaders.test.tsx src/features/execution/ExecutionWorkspace.test.tsx --maxWorkers=2
npm test -- src/features/admin/ProjectCompletionPage.test.tsx src/features/manager/DesignerQuickReview.test.tsx --maxWorkers=2
npm test -- src/features/client/clientProjectPhase.test.ts src/features/client/ClientProjectStatus.test.tsx src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/client/ClientEstimateSummary.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientSiteCompletionReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx --maxWorkers=2
npm test -- src/features/client/ClientEstimationWorkspace.test.tsx src/features/client/clientProjectPhase.test.ts src/features/client/ClientProjectStatus.test.tsx --maxWorkers=2
npm test -- src/features/project-status/ProjectStatusButton.test.tsx --maxWorkers=2
```

Results recorded so far:

- Design/management: 28 tests covered successfully. Initial run passed 26; two anomalous scheduling timeouts passed unchanged on targeted retry. The later typed DesignerQuickReview fixture was rechecked successfully.
- Admin dashboard: 149/149 passed across eight files, including rendered interaction/accessibility checks and report-field coverage.
- PM/shared/Finance/workflow: 114/114 passed across seven files, including editable completion submission and approval preservation.
- Admin completion plus typed Designer quick-review fixture: 6/6 passed across two files.
- Client: initial bounded run passed 202/203; the sole failure was a stale currency-string assertion from the earlier quotation formatting change. Correcting only that assertion to the existing two-decimal display, followed by the phase/status/workspace rerun, passed 84/84. All other nine files in the bounded selection passed. Later initial-submission coverage is recorded in the final result below.
- Final initial-submission mapping and typed-fixture recheck: `npm test -- src/features/client/clientProjectPhase.test.ts --maxWorkers=2` passed 25/25.
- Detailed project-header chip preservation: 36/36 passed.

### Browser and scope verification

Real components/styles with synthetic data at 1440 and 390 pixels passed: Client Estimate/Post approval/Execution and Completed state, unpublished initial draft, keyboard stale/retry recovery, one shared estimate collection request, PM list/grid, shared project details and Admin priority tables/loaded execution charts. No body overflow, unexpected API calls or runtime errors; Client axe reported zero violations. Existing horizontal scrolling keeps the Client table usable on mobile. Admin report behavior is covered by the focused rendered and report-section tests.

Temporary harness, baseline copies, diffs, screenshots and logs used `/private/tmp/lisno-phases-progress-_lojff13` and the earlier `/private/tmp/lisno-client-status-9bwzy5v7`; separate Client logs used `/private/tmp/lisno-t2-final-tests.log` and `/private/tmp/lisno-t2-final-recheck.log`. These are temporary verification outputs, not repository deliverables. Close sessions and remove owned artifacts after final checks. Ignored `frontend/dist/` is build output.

No backend/OCR/full frontend suite was run, because no backend/OCR contracts changed and bounded frontend coverage was specified. No lint script exists. No dependency/lockfile changes, migration, commit, push, deployment, production-data mutation or customer communication was performed.

Final integrated checks: `npm run typecheck` passed (exit 0); `npm run build` passed (exit 0, 3,385 modules, 10.39 seconds), with the existing warning for chunks larger than 500 kB. `git diff --check` passed. Final `git status --short` retained pre-existing work and only task-related additions/edits; no dependency or backend changes. Browser/server sessions are closed. Owned temporary harnesses, caches, screenshots, baseline copies and logs were removed after recording this evidence.

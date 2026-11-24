# Client project phases and removal of project progress displays

Date: 2026-11-24
Status: Approved, implemented and locally verified in Mode A. See the task plan for final verification evidence.

## Goal

Show three meaningful phases in the Client project table and remove read-only project progress percentages/bars from project views across all roles.

| Client table phase | Boundary |
| --- | --- |
| Estimate | From pre-estimate until the initial Client estimate approval is recorded. |
| Post approval | From initial Client approval until the current design is approved. |
| Execution | From current design approval through project completion. |

Completed projects retain Execution as their phase, with Completed as a separate state where appropriate. On-hold, blocked, scheduled and unavailable conditions must remain distinguishable without inventing a phase. The project-header chip continues to show the detailed pending stage and owner; this phase change is for the Client table.

## Current behavior and evidence

- ClientDashboard originally rendered `ClientProjectSummary.status`, so the generic stored `planning` lifecycle value appeared as “Planning”. The first approved implementation now reads the existing per-project status API for visible rows and displays the detailed workflow stage.
- That implementation passed 80 tests across ClientDashboard, ClientProjectStatus, ClientDashboard.collapsible and ProjectStatusButton; frontend typecheck/build passed. Real-component browser checks at 1440/390 pixels passed, including visibility loading, stale/retry handling and axe. These results establish the current baseline, not verification of this updated scope.
- `GET /projects/:projectId/status` returns the detailed current stage, but that stage alone cannot determine the requested phase. In `backend/src/domain/project-status.ts`, both pre-estimate preparation and post-approval Designer quotation revision can use `estimate_preparation`.
- The existing Client estimate read (`getClientEstimates`, `GET /client/estimates`) exposes project IDs, workflow versions, pre-approval references, design status/version and collaborative design/scope approval fields. `estimate-client-presentation.ts` and `estimate-client-review.service.ts` enforce membership and published-review lineage. Use these existing records alongside status, not stage-name guessing.
- The user explicitly confirmed removal of project progress from **all roles' project screens**, not only Client screens.

## Requirements

1. Replace detailed Client table stage text with Estimate, Post approval or Execution according to the boundaries above. Interpret Client approval as the initial estimate/pre-approval that starts design, not a later revised quotation approval. A quotation revision after that approval does not restart the Estimate phase.
2. Determine phase from existing authorized approval/design evidence, joined by stable project ID. For collaborative workflows, verify the relevant scope/version references; for legacy records, use their explicit estimate/design approval states. Current design approval must refer to the current design/scope. Never equate a draft, submitted design or internal estimate approval with Client/design approval.
3. A verified pre-estimate project may show Estimate before a client-readable estimate exists. A missing Client estimate row alone does not establish that phase. Missing, duplicate, foreign or contradictory sources must show an explicit unavailable/review state rather than an invented phase.
4. Reuse existing API endpoints and query families. Share/deduplicate the Client estimate read across rows and existing estimate-link consumers. Preserve authenticated identity/review-session scoping, post-mount cache verification, status read permission checks, abort signals, denied-result clearing and explicit stale/retry behavior. Visible-row status loading remains; no recurring per-row polling.
5. Remove the Client table's Progress column and its values. Preserve project name/ID, location, phase/status, expected completion, ordering, links, pagination and estimate deep links.
6. Remove read-only overall project and floor progress percentages/bars, project completion-percentage badges, and their project-progress aggregate charts/headlines from role-specific lists, cards, project details, quick reviews and dashboards. Remove corresponding progress fields from dashboard report output that mirrors those screens. Close resulting layout gaps and update table column sizing.
7. Preserve project status/stage and owner information, risk indicators, financial ratios, deadlines, task counts and completed-project counts/rates. Keep task-level work reporting, editable completion-percentage inputs needed to submit/review work, approval evidence and actions, upload/loading progress and estimate step navigation. The change removes project summary presentation; it does not rewrite reporting or approval workflows.
8. Persisted progress values, backend calculations and API contracts remain available to existing workflows. Frontend phase captions do not change execution eligibility, release/payment gates or approval immutability. No backend, PDF/email artifact, dependency, migration, deployment or production-data changes.

## Affected UI inventory

Primary paths under `frontend/src`:

| Area | Relevant surfaces |
| --- | --- |
| Client | ClientDashboard; ClientProject floor summaries; ClientSiteCompletionReview read-only percentage header. Preserve the review form and decisions. |
| Project Manager | PMDashboardProjects list/grid and now-unused PM progress display helpers/styles. |
| Procurement / Execution | AssignedProjectOverview used by ProcurementProjectPage and ExecutionWorkspace. |
| Designer / Manager / Head | DesignerDashboard project aggregates; DesignerDetail; DesignerQuickReview; OrganizationTree; ProjectWorkspace and ManagementProjectWorkspace floor summaries. |
| Finance / Admin project details | ProjectWorkflowSnapshot in FinanceProjectWorkflowControl, including its presentation-only task-average calculation. |
| Super Admin dashboard | DashboardPriorityProjects; DashboardProjectDrilldown; project-progress metrics in DashboardOverview, dashboardViewModel and dashboardChartData/ModuleCharts; corresponding dashboardReportSections output. |
| Site completion | Remove standalone read-only project-progress summaries where possible; preserve the functional percentage input and its save/submit validation in SiteCompletionPanel. |

ClientProjectQuickView and PMProgressBasis currently have no runtime callers; remove obsolete project-progress presentation there if retained for future reuse, without activating those views. Keep the shared generic ProgressBar component because operational tasks, uploads and unrelated metrics still use it.

## Decisions, constraints and risks

- Frontend-only reuse of existing approval/status reads is the selected approach. A new backend phase field would expand contracts and is outside this request.
- A single Client estimate read may carry more data than the previous status-only table. Deduplicate it and reuse existing cache invalidation; do not issue one full estimate-list request per row.
- Different endpoint snapshots can disagree during a transition. Display a clear unavailable/stale state and refresh rather than mixing project identities or manufacturing approval proof.
- Several all-role target files already contain earlier uncommitted changes. Capture a fresh scoped baseline before writers and preserve those edits.
- Preserve operational inputs and records while removing read-only summary presentation. This is an explicit boundary of the updated UI scope, not permission to alter completion workflows.
- No open product decision remains. The revised task plan must detail file ownership and focused verification before further implementation. The previous Mode A execution choice remains applicable.

## Acceptance criteria

- AC1: Correct phase at no-estimate/pre-estimate, submitted estimate, initial Client approval, design pending, current design approval and completed boundaries; revised quotation after initial approval remains in the later phase justified by current design evidence.
- AC2: Same-named projects with unequal approval states show correct independent phases. Denied, missing, conflicting, foreign and account/session-switched sources cannot expose retained details or misleading labels.
- AC3: No Progress column on Client home. No read-only project/floor progress percentages, bars or aggregate progress charts/headlines remain on the inventoried active all-role views or their matching dashboard report rows.
- AC4: Task/work entry, completion submission/review, approval actions, project links/deep links, risks, financial data and unrelated progress indicators remain functional.
- AC5: Visible-row loading, shared estimate fetch deduplication, focus/return refresh, cancellation, retry and stale states work without timer polling. Desktop/mobile layouts and keyboard-accessible controls remain usable.

## Verification boundaries

Run focused tests for changed phase/state consumers and affected role views, then frontend typecheck/build and rendered desktop/mobile checks covering the Client table plus representative list/detail/dashboard removals. Use tests for preservation of completion input/approval flows. Run Git diff/status hygiene checks. Do not repeat the entire frontend suite or investigate unrelated baseline failures. Record exact checks and limitations in the revised task plan. No deployment or external mutation is authorized.

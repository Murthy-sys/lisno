# Site Manager workspace simplification

Date: 2026-10-09
Status: Approved by the user; implemented and locally verified in Mode A on 2026-10-09. Verification results and remaining baseline failures are recorded in the separate task plan.

## Goal

Make the Site Manager workspace a compact entry point containing only personal KPI and current assigned projects. Opening a project reveals its execution statistics, vendor progress, and vendor work updates/blockers. Remove repeated and premature content while retaining the actions needed to manage that project's work.

The user explicitly selected **Work updates and blockers** as the meaning of vendor queries. This change does not introduce a vendor chat inbox or a new question/ticket workflow.

## Current behavior and evidence

Verified against the current worktree, including the uncommitted execution and vendor invitation features:

| Area | Current implementation and implication |
| --- | --- |
| Home | `frontend/src/app/router.tsx` renders a shared `RoleLanding` with welcome/status metadata, `KpiPanel`, and `OperationalTaskQueue` for Site Managers. The generic status says “Ready for staged access.” |
| Repeated project content | `frontend/src/features/workflow/OperationalTaskQueue.tsx` renders legacy coordination tasks, then a `ProjectStatusButton`, `SiteCompletionPanel`, and `VendorWorkProgressPanel` for every vendor-managed project. Each progress panel mounts another full execution tracker. This makes the landing page grow with every project and repeats headers, statistics, filters and completion forms. |
| Separate execution list | `/execution` already shows an assigned-project portfolio, while `/projects/:projectId/execution` shows the tracker. Site Managers currently have both Home and Execution navigation destinations. |
| KPI | `frontend/src/components/kpi/KpiPanel.tsx` already provides the backend-derived score, period selection and a collapsed breakdown. Keep its meaning and calculation. |
| Assignment source | `backend/src/services/vendor-execution-access.ts` derives Site Manager project access from assigned `site_execution` tasks and validates the unique current project assignment for detail/mutations. Do not substitute name matching or a client-maintained project list. |
| Portfolio | `backend/src/services/vendor-execution.service.ts` exposes project identity, project status and execution counts with search/pagination. It currently includes completed projects and has no current-project filter before pagination. |
| Execution data | The same service/projection exposes work status, vendor-reported percentage, proposal/confirmed dates, reporting flags, next owner, verification, and allowed actions. These remain authoritative. |
| Vendor updates | Immutable `VendorExecutionEvent` records contain daily-report note, reason, next action, status and time. The generic `latestNote` can also be changed by staff actions; it must not be presented as a vendor-authored query without checking its source. |
| Existing actions | `ExecutionDetailPanel` handles schedule confirmation, evidence, verification, changes requested, holds and history. `SiteCompletionPanel` provides project-level Client handoff. Legacy coordination updates still use the operational task API. Removing these from Home must not remove their only reachable action. |
| Live data | `ExecutionLiveProvider` invalidates execution, vendor-progress and completion queries after changes, with visible-page polling fallback. The redesign must continue to use these query families. |

The repository is already dirty with the previous approved work. Those edits are the baseline and must be preserved. Capture a fresh dirty-path list and per-target content/diff before any implementation writer starts. No agents are started for this change until its execution-mode gate is reached.

## Recommended design

Use the existing Home and project-execution routes with a Site Manager-specific composition. This removes the repeated landing-page content without creating another dashboard or another workflow.

Simply collapsing every existing project panel would retain the duplicated structure and its reads. A separate new workspace route would add a third destination. The selected approach uses one landing page and one project detail page, reusing the existing actions and data.

### 1. Home: KPI and current assigned projects

- One concise page heading. Remove staged-access badges, placeholder/welcome copy and repeated “Approved design handoff”/“Site execution overview” wrappers from the Site Manager landing content.
- Retain one KPI panel with its existing reporting period and collapsed breakdown. Scope any spacing changes to this workspace so other roles keep their existing layout and KPI behavior.
- Below KPI, show **Assigned projects** as a compact list, with one row per stable project ID. Show project name, actual project status, and a clear Open project link. Do not show expanded execution statistics, completion forms, vendor tables, photos or activity histories here.
- “Current” means assigned projects whose status is `planning`, `active` or `on_hold`. Completed projects are excluded from this landing list. Projects on hold remain visible and clearly labelled; a project with no issued work remains visible.
- Support search and pagination. Search and current-project filtering must apply before backend pagination and total calculation. Do not filter only the visible page or silently truncate the portfolio.
- Clicking a project opens `/projects/:projectId/execution`. Browser Back returns to the same list search/page. Direct links and refresh remain supported.
- Use Home as the single Site Manager project-list destination. Remove only the duplicate Site Manager Execution navigation entry and redirect their `/execution` list URL to Home. Keep the existing execution routes and their permissions for all other roles. Existing work-order approvals, access requests, messages, notifications and account controls remain accessible; this task simplifies workspace content rather than removing their capabilities.

### 2. Selected project: execution summary and vendor work

- One project heading with Back to assigned projects and one compact project-actions entry point.
- One compact execution-statistics strip from the backend: open work, awaiting verification, blocked work, missing updates, overdue work and site verified. Clearly label overlapping flags; do not imply the counts are additive or calculate an invented overall project percentage.
- Main content has two views: **Vendor progress** and **Vendor updates & blockers**. Vendor progress is the default. Preserve view/filter state in the selected-project route where useful for Back/refresh.
- Vendor progress uses compact Main Line rows showing the vendor, Main Line/room, vendor-reported percentage, current status, proposed or confirmed dates, latest update time and next required action. Keep separate assignments separate even when their names/baskets match.
- A pending schedule proposal must be noticeable and open the existing confirmation action. A completion awaiting site verification must expose its review action. The vendor's 100% remains distinguishable from Site Manager verification and Client acceptance.
- Search/filter/pagination remain server-backed. Do not compute project-wide counts from a loaded subset. If a filtered subset count is displayed, label it as filtered; the top summary continues to describe the entire selected project.
- Clicking a work row opens the existing assignment detail panel with current, backend-authorized actions. Show essential identity, status, schedule and next action first. Keep photos, issued references, history and secondary metadata behind explicit disclosures/actions where this can be scoped to the Site Manager presentation.
- Do not display a vendor invitation/login-delivery panel on the Site Manager project page; that is not one of their management actions. Procurement/Super Admin access controls stay on their existing screens.

### 3. Vendor updates and blockers

- Show the latest actual vendor daily report per current assignment, with vendor name, Main Line, note, reported time and reported status. For a current blocker, show its reason and next action clearly.
- Include a Blocked filter so the Site Manager can focus on issues requiring attention. No AI/NLP classification of notes as questions, no manufactured “unanswered” or “resolved” status, and no fake query count.
- Read report content from the newest current-round event whose action is `report`, joined by assignment ID. Never relabel a staff hold/review note as a vendor report.
- No report yet is an explicit empty state. Older-round reports remain in assignment history. A previous blocked report must not make currently verified/reworked work appear newly blocked.
- Open the relevant assignment to inspect evidence/history or use an existing staff action. Schedule proposals remain schedule requests; daily notes are not automatically converted into tickets or chat messages.
- A Site Manager cannot change the vendor's reported progress or silently mark a blocker resolved. Existing vendor reporting and staff hold/resume/verification semantics remain authoritative.

### 4. Necessary secondary project actions

- Keep schedule confirmation, completion verification, changes requested, reasoned hold/resume, evidence exemption and reporting schedule available through the existing assignment/project controls and backend permissions.
- Move the existing project completion/Client handoff panel into an on-demand project action. Do not mount every project's completion form on Home. Preserve saved draft, pending Client, changes requested, accepted and completed states and all existing blockers.
- For legacy projects, keep their applicable coordination update under selected-project actions using the existing operational-task API. Do not turn legacy saved progress into vendor progress or individual verification.
- Project status and existing project messages can remain secondary project actions where authorized, without embedding another timeline or dashboard into the default project view.

## Visual and interaction direction

- Dense, restrained operations workspace using the existing Poppins typography, muted surface/text and green action tokens. Use a non-white workspace surface, borders and clear alignment rather than decorative effects.
- Compact rows instead of large cards. Aim for approximately 13–14px body text, 12px metadata and 20–24px page titles; allow readable wrapping for long project/vendor/Main Line names. No fixed blank-height cards.
- No new icon package or new Lucide usage, harsh gradients, drop shadows, animated hover effects, bento layout or additional decorative banners. Existing shared components may remain; do not restyle them globally for this task.
- At narrow widths, stack row information and keep the primary Open/action control reachable. Avoid page-level horizontal overflow at 320px. Do not hide status, vendor identity or actionable blockers merely to fit.
- Use semantic links/buttons, visible focus, labelled filters and accessible disclosures/tabs. Preserve drawer focus return and unsaved-change protection. Announce saves/errors without announcing every live refresh.
- Keep loading, no assigned projects, no issued work, no vendor updates, filtered-empty, retryable failure, stale/offline and access-revoked states distinct. Show a partial failure only for the affected region; never turn missing data into zero counts.

## Data/API and compatibility impacts

Reuse the existing execution portfolio, project, assignment, history and command APIs, and existing KPI and site-completion APIs. No new command, role grant or ticket model is required.

Small additive read changes are allowed where required:

1. A validated optional portfolio-only `projectScope` query (`current` or `all`, default `all`) on `GET /execution/projects`. `current` filters out completed projects before search/page totals. Omission preserves other consumers' current behavior. Use a portfolio-specific schema/type rather than accidentally broadening command/history queries.
2. Include safe selected-project metadata (stable ID, name, status, completion authority) in project execution reads, including zero-work results. This enables correct direct-link headers and legacy/Client-handoff presentation without reading unrelated projects or relying on the first work row.
3. Add a nullable latest-vendor-report projection to execution work reads: event ID, execution round, report time, note, reason, next action, reported progress and report status. Derive it from immutable current-round report events, scoped by assignment/project/vendor identity. Batch or reuse the existing projection cache; avoid one extra report-history request for every row. No raw actor IDs need to be shown as vendor names.

Mirror additions in backend/frontend DTOs and OpenAPI/runtime validation. Route-operation permissions remain the same because the authorized resource and actions are unchanged. Do not add read-side writes, new persisted workflow states, indexes/migrations without evidence of need, or frontend calculations for KPI/risk/finance.

The current project-wide counts must remain stable when a row filter/page changes. Reuse an unfiltered project-summary read or a clearly separated additive summary projection rather than changing the meaning of shared `counts` for existing consumers. Do not fetch every assignment into the browser merely to count it.

## Permissions, state and safety invariants

- Site Manager sees only projects assigned through the established site-execution task source. Reassignment/removal must revoke list, detail and cached data; a bookmarked foreign project must not disclose its name, vendors or notes.
- All schedule/verification/completion mutations keep existing backend checks, expected versions, idempotency keys, audited actors and immutable approval history.
- Reads are read-only. Opening a project cannot initialize tracking, confirm a schedule, change progress or submit completion.
- Live updates refresh relevant project/list/report/summary queries without overwriting an open dirty form. Cancel or clear scoped queries on identity/access changes; include new filters in cache keys.
- User names, order numbers and labels are display only. Assignment/project/vendor IDs remain join and mutation keys.
- Shared Vendor, Procurement, Program Manager, Super Admin, Finance and worker behavior must not regress. Keep the old operational component available for its remaining consumers while removing its Site Manager landing-page composition.
- No email/reminder policy or delivery defaults change. No production mutation, deployment, dependency installation, commit or push is part of this specification.

## Risks and mitigations

| Risk | Required mitigation |
| --- | --- |
| Removing Home panels hides the only way to complete a project | Demonstrate existing Client-handoff and legacy update actions from the selected project. |
| Completed filtering produces empty pages or wrong totals | Filter on the backend before pagination; test more than one page with mixed project statuses. |
| Staff notes appear as vendor queries | Source the report projection from current-round `report` events and test later staff actions. |
| Filters change summary meaning | Project statistics use an unfiltered backend source; test pagination and unequal vendor workloads. |
| One component change affects all roles | Site Manager-specific composition or explicit scoped variants, with cross-role regression checks. |
| New UI hides authorization failures under stale data | Clear denied/deleted project/assignment data and test two differently assigned Site Managers. |
| Concurrent unrelated work is overwritten | Snapshot and inspect existing diffs before ownership assignment; no staging, reset, revert or broad reformat. |

## Acceptance criteria

| ID | Required outcome and evidence |
| --- | --- |
| AC1 | Site Manager Home contains one KPI region and one current assigned-project list. No expanded project completion, execution table, coordination task grid, duplicate statistics or staged-access placeholder. Rendered and visual checks. |
| AC2 | Each assigned current project appears once by ID, including zero-issued-work and on-hold projects; completed projects are excluded. Search/pagination totals are correct across mixed-status pages. Server integration and UI checks. |
| AC3 | Opening/direct-loading a project presents one heading, one accurate execution summary and compact vendor progress. Pending schedule confirmation and verification are clearly actionable. Back restores list context. |
| AC4 | Vendor updates/blockers show current-round vendor-authored report content, reason and next action without inventing ticket state. Staff notes and prior-round blockers cannot masquerade as current vendor queries. Backend projection and rendered tests. |
| AC5 | Schedule confirmation, verification/request changes, holds and project Client handoff still work with their existing version/idempotency and permission semantics. Legacy coordination remains reachable in project context. |
| AC6 | Assigned-project isolation, access revocation, live refresh and dirty-form preservation hold for two Site Managers with different projects/vendors. Other role workspaces retain behavior. |
| AC7 | Desktop 1440px, tablet 768px, mobile 390px and 320px checks show compact readable layouts with no document overflow. Keyboard navigation, focus restoration, long names, empty/error/stale states and accessibility checks pass. |
| AC8 | Relevant frontend/backend regressions, typechecks, builds, contract/OpenAPI validation and diff hygiene pass. Replica-set checks cover changed authorized read projections/filtering. Independently distinguish baseline failures; do not claim full-suite success from earlier counts. |

## Assumptions and open decisions

- Confirmed: vendor queries means work updates and blockers, per the user's reply on 2026-10-09.
- Assumption: “current assigned projects” includes planning, active and on-hold assignments, and excludes completed projects. No project record or history is deleted.
- Assumption: the user wants workspace content simplified while retaining required schedule/verification/Client-handoff capabilities inside the selected project.
- No unresolved product question blocks specification review. Implementation details and the separate dependency-ordered task plan follow specification approval under repository gates.

## Verification and rollout boundaries

Implementation verification will start with targeted workspace/router/navigation, KPI, execution/detail/progress/completion and backend execution/authorization tests. Use local replica-set fixtures and at least two asymmetric projects/identities. Browser QA uses synthetic data; inspect the rendered states and exercise the relevant actions. Broaden testing when shared-contract changes warrant it, and run both affected workspace typechecks/builds plus `git diff --check`/status.

No deployment, migration/backfill or new external email is needed for this redesign. Rollback is a code rollback that preserves existing data and workflow history; additive response fields and an omitted optional query retain prior API behavior. Real operational data, credentials and private media must not appear in logs/screenshots.

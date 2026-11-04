# Generated Project ID visibility: implementation plan

Date: 2026-11-04
Status: Implemented; scoped verification passed; existing full-suite failures documented.
Specification: [Generated Project ID across project screens](../specs/2026-11-04-project-id-visibility-design.md)
Approval record: The user approved that specification with “Approved” on 2026-11-04. Its approved content remains the source of truth.
Execution mode: A, parallel native subagents, selected by the user on 2026-11-04 after task-plan approval.

## Outcome and fixed contract

Display the existing Lead-owned `projectNumber` as `Project ID: Lisno000001` in each applicable project's identity area. Successfully loaded unnumbered records show `Project ID not assigned`. Preserve compact headers, existing permissions and internal UUID-based routing/mutations.

Number allocation remains at the first successful estimate creation. No historical backfill, second persisted number, numbering-format change, search feature, new lookup endpoint, issued-document rewrite, dependency, deployment or production mutation is included.

The read contract is an additive `readonly projectNumber: string | null` on new backend projections. Frontend interfaces may keep it optional for compatibility with older responses. A present invalid value or inconsistent numbered linkage must produce the established identity-conflict behavior, not an alternative number. A failed/loading request must not be rendered as an unassigned project.

## Current evidence and ownership baseline

- At specification discovery the worktree was clean. At plan creation the only dirty path was the new approved specification. Capture status and relevant per-file diffs again immediately before implementation or agent assignment.
- `project-number.ts` and `project-number.service.ts` already validate/allocate the reference. `admin-project-summary.ts` already projects it with stable-ID lineage checks.
- `project.service.ts` general list/detail, `clientSummaries` and `toClientProject` omit it. Client and Designer cannot obtain it merely through a UI change.
- Project Manager, quotation, Procurement, Finance, execution, chat, status, management and Super Admin dashboard have independent project projections. Each must be checked explicitly against the matrix below.
- `LeadEstimateWorkspace.tsx` already remembers the committed number in its saved-estimate/Lead caches and invalidates Admin/dashboard/general project queries. Its first-save invalidation does not cover every newly affected feature family. Reconcile those keys without resetting an active estimate draft.
- `api/projectNameSync.ts` invalidates several live identity views after rename. Extend/reuse its existing pattern only where useful; do not introduce another writable identity cache or edit historical snapshots.

## Surface and contract inventory

Paths below are relative to `frontend/src/` or `backend/src/`. Adjacent focused tests belong to the same owner as the source. For each row, record implementation, test and rendered evidence before marking it done. A DTO change alone does not complete a row.

| ID | Existing frontend consumers | Existing response/source boundary | Required result |
| --- | --- | --- | --- |
| S1 | `features/client/ClientDashboard.tsx`, `ClientProjectQuickView.tsx`, `ClientProject.tsx` | `services/project.service.ts`: `/projects`, `/projects/:projectId`, `/client/project-summaries`; repository project reads; frontend `api/types.ts` | ID in dashboard card, quick view and compact project header |
| S2 | `features/estimates/ProjectQuotationWorkspace.tsx`, `features/client/ClientQuotation.tsx`, `ClientEstimationWorkspace.tsx` | `services/quotation.service.ts`, safe quotation projection and `openapi/quotation.ts`; frontend `features/client/quotationApi.ts` | Standalone Client/Designer estimation identifies its project using existing allowed quotation data; embedded view avoids duplicating the project header label |
| S3 | `features/leads/LeadDashboard.tsx`, `LeadDetail.tsx`, `LeadEstimateWorkspace.tsx` | Existing Lead/estimate number responses; `features/leads/leadsApi.ts` | Normalize Project ID wording, explicit missing state, committed-save cache refresh |
| S4 | `features/admin/AdminProjectsPage.tsx`, `AdminProjectDetailPage.tsx`, `AdminProjectQuickView.tsx` | `repositories/admin-project-summary.ts`, Admin summary DTOs | Cover list/grid/detail/quick view; retained UUID labeled System ID |
| S5 | `features/admin/dashboard/DashboardPriorityProjects.tsx`, `DashboardProjectDrilldown.tsx` | `contracts/super-admin-dashboard.ts`, `repositories/super-admin-dashboard.ts`, `services/super-admin-dashboard.service.ts` | Add reference to live project rows/priority entries without changing KPI, filters, risk or finance calculations |
| S6 | `features/designer/DesignerDashboard.tsx`, `ProjectWorkspace.tsx`, `DesignerDesignPlanTasksPage.tsx` | General project reads; `services/project-workflow.service.ts` and `/designer/design-plan-tasks`; frontend workflow API/types | Assigned project rows/workspace and design-plan project context carry the reference |
| S7 | `features/manager/DesignerDetail.tsx`, `DesignerQuickReview.tsx`, `ManagementProjectWorkspace.tsx` | `/designers/:designerId/summary`, `services/hierarchy.service.ts` project subset; general project detail | Same number in management's assigned-project lists and project header; KPI untouched |
| S8 | `features/project-manager/PMDashboardProjects.tsx`, `ProjectManagerWorkspace.tsx`, `ProjectManagerEstimationsPage.tsx` | `services/project-manager/workspace.ts`, `sources.ts`, `estimates.ts`; `contracts/project-manager*.ts`; local mirrored frontend types | Portfolio list/card, project header and estimation header use canonical identity |
| S9 | `features/procurement/ProcurementProjectCard.tsx`, `AssignedProcurementProjectCard.tsx`, `ProcurementProjectPage.tsx`, `SalesProcurementProjects.tsx`; containing `ProcurementWorkspace.tsx` | `services/procurement.service.ts` project DTOs plus general assigned-project reads | Same reference for prepared and not-yet-prepared projects; no change to historical BOQ, prices or issued orders |
| S10 | `features/finance/FinanceOverviewPage.tsx`, `SuperAdminProjectBudgets.tsx`, `ProjectFinancePanel.tsx`, `ProjectBudgetOverview.tsx`, project identity within `FinanceProjectWorkflowControl.tsx` | `services/project-finance.service.ts` list/bucket/filter-option responses; frontend finance API and shared types | Project list/detail and selector labels include ID; selector values and all monetary results unchanged |
| S11 | `features/execution/ExecutionWorkspace.tsx` portfolio/project/vendor variants, `ExecutionDetailPanel.tsx`, `features/site-manager/SiteManagerProjectPage.tsx`, project identity in `features/project-manager/PMCounterpartPanel.tsx`; VendorWorkPage composes execution | `contracts/vendor-execution.ts`, `services/vendor-execution.service.ts`, `vendor-execution-projection.ts`, general project read as applicable | Generated ID in the existing project grouping/context for staff/vendor work, including readers without general projects permission; keep issued-order content unchanged |
| S12 | `features/messages/ProjectConversationList.tsx`, `ProjectMessagesPage.tsx`, `ChatProjectDetails.tsx`; `features/project-status/ProjectStatusButton.tsx` | `contracts/project-chat.ts`, `services/project-chat.service.ts` and chat repositories; `contracts/project-status.ts`, `services/project-status.service.ts`/status repository | Conversation entries, project conversation/details header and loaded status drawer expose only the authorized project's reference |
| S13 | `features/projects/AssignedProjectOverview.tsx`, existing project selectors within the above consumers, `features/access/AccessRequestDialog.tsx` and `MyAccessRequestsPage.tsx` terminology | Existing approved identity DTOs and unchanged internal-ID input contracts | Avoid repeated labels within one page; clarify System ID for technical UUID fields without changing submitted values |

Before coding a row, trace its exact serializer and existing denial/stale behavior. If an identity UI is delegated to a child component, edit that child rather than duplicating identity markup in the parent. Additional source files may be included only to complete an already listed consumer path, with ownership updated before a second writer touches them.

## Dependency-ordered tasks

### T1. Capture baseline and settle shared contracts

Owner: primary. Depends on: task-plan approval and execution-mode selection. Acceptance: AC2, AC3, AC6.

- Capture initial status, target diffs and any pre-existing relevant failures in ignored temporary evidence; do not stage anything.
- Confirm all S1–S13 serializer/consumer paths. Distinguish current UI identity from published/issued snapshots and technical UUID fields.
- Define a shared pure stable-ID resolution rule using `readProjectNumber`, and a batched repository lookup for already-authorized project IDs. Define the session-aware direct-Mongoose adapter for services outside `AppRepository`.
- A lookup reads only required identity fields, never allocates a number and returns one nullable value per requested project. Reject contradictory numbered Lead or estimate linkage using the existing conflict contract. Preserve legitimate missing/unlinked legacy states.
- Primary owns shared `backend/src/repositories/types.ts`, backend contract/OpenAPI files, `frontend/src/api/types.ts`, any cross-feature DTO changes, shared fixtures and this plan. Publish the exact shape to implementers before parallel writes.

### T2. Implement canonical read resolution and general project delivery

Owner in Mode A: backend foundation implementer. Depends on T1. Acceptance: AC2–AC4, AC6.

- Own the approved shared identity-read helper, `repositories/memory.ts`, `repositories/mongo.ts`, `repositories/admin-project-summary.ts` if deduplication is necessary, and `services/project.service.ts`, plus their focused tests. Do not edit the existing allocator/sequence/model unless a demonstrated dependency requires returning to the primary.
- Batch lookup using stable Project/Lead IDs, not names. Retain the request's existing authorization boundary and any transaction/session of the caller.
- Add the reference to authorized general list/detail and Client summaries, including the explicit Client projection. Do not spread internal Lead fields into Client responses.
- Test two same-named projects with different generated IDs, unnumbered project, unrelated numbered project, invalid number, conflicting linkage, duplicate numbered linkage and empty page. Assert batch query behavior and no writes/allocation on reads.
- Keep the foundation writer as sole owner of both large repository files. Later consumers request changes through that owner or primary rather than editing them concurrently.

### T3. Create shared compact identity presentation

Owner: primary, or one explicitly assigned frontend foundation implementer. Depends on T1; can overlap T2. Acceptance: AC1, AC4, AC6, AC7.

- Implement a small reusable Project ID text component/formatter only as justified by the repeated consumers. Inputs are loaded response values, not project IDs for independent fetching.
- Support inline/header, secondary row text and selector-label use without adding new containers or controls. Make text selectable, wrap long values, and use established typography/tokens.
- Test assigned and null/older omitted values, long valid suffixes and accessible label text. Caller controls loading/error rendering; helper does not fabricate loading data.
- Freeze this API and primary-owned shared DTO changes before UI feature writers start.

### T4. Extend remaining authorized project projections

Owner in Mode A: backend feature implementer, sequential sub-slices below; primary integrates central contract changes. Depends on T2 and T1 contracts. Acceptance: AC1–AC4, AC6.

1. **Commercial and work reads:** `services/quotation.service.ts`/safe live projection, `procurement.service.ts`, `project-finance.service.ts`, `vendor-execution.service.ts`, `vendor-execution-projection.ts`. Project number is live identity metadata outside immutable snapshots, financial hashes and approval/version decisions. Scope to the page's already authorized project IDs. Preserve session semantics and do not recompute issued artifacts.
2. **Project Manager/design/management:** `services/project-manager/workspace.ts`, `sources.ts`, `estimates.ts`, `project-workflow.service.ts`, `hierarchy.service.ts`. Carry only the needed reference and preserve KPI/risk/assignment calculations.
3. **Messaging/status/dashboard:** `services/project-chat.service.ts`, applicable chat read repository projections, `project-status.service.ts`/status repository, `repositories/super-admin-dashboard.ts`/dashboard service. Batch list resolution, maintain membership denial and overview/current-project checks; do not expand message, status or Super Admin access.

The sub-slices may be assigned to different backend agents only after exact non-overlapping file sets are published; the common helper and `memory.ts`/`mongo.ts` remain single-owner. New contract/OpenAPI edits go through the primary. For each slice add focused source/denial/missing/lineage tests and return a complete consumer-field mapping.

### T5. Update Client, Sales, Admin, Designer and management screens

Owner in Mode A: frontend core implementer. Depends on T3 and the matching T2/T4 read contracts. Acceptance: AC1, AC4, AC6, AC7. Own S1–S7 UI files and their adjacent tests/CSS, excluding shared DTOs and primary-owned cache utilities.

- Add the common identity presentation at existing name/metadata locations; normalize Sales/Admin wording and distinguish retained System ID.
- Standalone quotation obtains its reference from the existing safe quotation response, avoiding a new privileged project-detail fetch. Coordinate placement with ClientEstimationWorkspace/ClientQuotation so an embedded project page does not repeat its outer header ID.
- Cover list/grid/quick-view variants and design/management project entries. Do not hide legitimate missing state in lists.
- Preserve the compact Client top and estimate priority, form drafts, dialogs and navigation. Add behavior tests that assert the project number rather than snapshots mirroring markup.

### T6. Update operational role and shared identity screens

Owner in Mode A: frontend operations implementer. Depends on T3 and matching T4 contracts. Acceptance: AC1, AC3, AC4, AC6, AC7. Own S8–S13 UI files and tests/CSS, except primary-owned shared DTOs/cache utilities.

- Update PM, Procurement, Finance, execution/vendor, messaging and status identity areas, reusing existing parent identity where possible.
- Keep project selector values/internal routes unchanged while displaying name plus Project ID. Clarify technical System ID inputs without treating generated strings as accepted UUID substitutes.
- Preserve revoked-access cache removal and stale-state messaging. A loaded unnumbered project is distinguishable from a failed read.
- Do not add IDs to every nested line/task/message when the containing project is already identified. Do not modify VendorApprovedOrder issued content, published quote content, exports or email templates.

### T7. Reconcile cache propagation and integrate coverage

Owner: primary. Depends on T4–T6. Acceptance: AC1, AC3, AC5, AC6.

- Reconcile `LeadEstimateWorkspace.tsx` committed-save invalidations with Client, Designer, assigned-project, management, Admin/dashboard, quotation, PM, procurement, finance, chat and status query keys that can contain the generated reference. Do not reset dirty estimates, synthesize a number, change auth scope or refetch unauthorized endpoints.
- This is a sequential handoff: T5 finishes changes to LeadEstimateWorkspace before primary takes ownership of its save/cache changes.
- Preserve number on successful project renaming; inspect `api/projectNameSync.ts` and affected invalidation families without mutating snapshots or persisting a duplicate reference.
- Add focused tests for first save, failed save, already-numbered save, navigation/refetch, rename and switching between equal-named projects with unequal IDs. Other authenticated sessions continue using their existing refetch/live-update model; no new event protocol is introduced.
- Reconcile all S1–S13 entries and request missing-source edits from their owner. Do not silently mark an unrendered or untested surface covered.

### T8. Integrity review, final verification and handoff

Owner: primary; Mode A uses `integrity_reviewer` followed by `verification_runner`. Depends on all writers finishing. Acceptance: all ACs.

- Review integrated diff against the baseline for authorization, canonical linkage, no allocation/backfill, internal UUID preservation, immutable artifacts, cache safety, batch performance and complete surface coverage.
- Fix confirmed findings before final verification. Any required source fix triggers only the affected checks plus appropriate integration verification.
- Record exact commands, counts, failed/unrun checks and pre-existing failures. Inspect rendered layouts and console/network behavior using synthetic projects, not live customer mutations.
- Remove/archive temporary harnesses/screenshots and stop task-only services. Inspect `git diff --check`/status, record artifacts and leave product changes unstaged. No commits, push or deployment.

## Execution and safe parallelism

The user selected Mode A after both approvals. If Mode B is selected, the primary performs all tasks inline in this order, including review and verification.

If Mode A is selected, use native agents with explicit file ownership and the instruction that they are not alone in the worktree and must preserve others' changes. Keep one parent task active; its independent child slices may run together.

| Wave | Work that can overlap | Required boundary |
| --- | --- | --- |
| 1 | T1 read-only source/authorization/consumer audits when useful | Primary owns synthesis and locks the contract before writes |
| 2 | T2 backend foundation with T3 frontend presentation | Separate workspaces; shared DTOs remain primary-owned |
| 3 | T4 backend projections with T5 core UI and T6 operations UI | Three workers maximum plus primary; UI uses the frozen response shape; no shared paths assigned twice |
| 4 | T7 integration/cache changes | Feature writers complete or explicitly hand off overlapping files first |
| 5 | Integrity review, fixes, then final verification | Sequential against a stable integrated tree; browser QA may overlap final non-mutating checks |

Do not mistake tests executed during concurrent edits for the final verification result. Expand ownership only by explicit primary coordination, and communicate any contract discrepancy before inventing a fallback.

## Verification matrix

| Acceptance criteria | Evidence required |
| --- | --- |
| AC1: consistent cross-role identity | S1–S13 coverage record; two projects sharing a name but having different IDs; component/API and representative rendered checks |
| AC2: every required projection | Unit/service/route tests for general/Client, quotation, PM, Procurement, Finance, work, chat/status, management/dashboard; memory/Mongo parity where changed; OpenAPI inventory |
| AC3: access preservation | Authorized and unrelated users/projects, revoked access, Super Admin operation-specific scope, no extra Lead fields or privileged frontend calls |
| AC4: missing and inconsistent identity | Null/omitted/invalid/duplicate/conflicting cases; no reads allocate or persist; missing state only after successful record load |
| AC5: cache correctness | Committed first-save value, failed save absent, navigation/rename/project switching; preserve dirty editors |
| AC6: workflow/data invariants | Existing route/select payloads use internal IDs; approval/version and financial tests unchanged; immutable artifacts not rewritten |
| AC7: rendered quality | Mobile 390, tablet 768, desktop 1440 (and a wide list where useful), long project names/IDs, enlarged text, keyboard/accessibility, no overflow or added empty header blocks |
| AC8: integrated health | Focused tests, impacted Mongo integration, workspace typechecks/builds, broader suites and repository hygiene; report actual limits |

### Commands and test lanes

Run focused tests first using existing repository scripts. Extend existing behavior tests or add narrowly scoped project-number projection tests as needed; do not add tests solely for trivial wording.

- Foundation candidates: `backend/tests/project-number.test.ts`, `admin-project-summary.test.ts`, `mongo-repository.test.ts`, `workflows.test.ts`, `sales-initiated-projects.test.ts`, plus new shared resolution/general-project projection regressions.
- Feature candidates: existing quotation projection, Procurement routes/Mongo, project-finance, project-manager workspace/estimate, project-chat conversation/repository, project-status, Super Admin dashboard and vendor-execution tests that exercise changed serializers. Run real replica-set lanes for changed transactional Mongo readers; do not claim skipped opt-in tests passed.
- If the numbering assignment transaction boundary changes despite the intended read-only scope, run `project-number-mongo.replica-set.test.ts` including concurrent first-save and rollback regressions. Prefer leaving that boundary unchanged.
- Frontend: affected component tests beside every changed feature, focused shared identity/selector tests, `LeadEstimateWorkspace` save/navigation/cache tests and `api/projectNameSync.test.ts` when touched. Preserve existing approval/editor tests.
- After focused checks pass, both workspaces run `npm run typecheck`, `npm test` and `npm run build` because the approved change spans shared DTOs and many role consumers. Diagnose failures against the captured baseline; do not weaken tests or report a failing suite as passed.
- Repository: `git diff --check` and `git status --short`. No lint script exists. OCR has no affected contract and its test lane is not required.
- Rendered QA uses temporary synthetic transport/fixtures with numbered, missing and denied states. Check at least one representative identity in each API family, the Client list/header/standalone estimate, a Finance selector with internal-ID value, and the shared conversation/status surfaces. Verify no new per-project network waterfalls and no live mutation requests.

## Surface verification record

All rows preserve internal-ID routes and selectors. Tests below are focused files included in the recorded agent/root lanes; browser images live in the temporary evidence directory, not in the repository.

| Surface | Implemented and tested | Browser evidence |
| --- | --- | --- |
| S1 Client | Dashboard, quick view, compact project header; ClientDashboard/ClientProject tests | client-list, client-desktop/tablet/mobile |
| S2 Quotation | Existing quotation/tier response carries live identity; standalone/edit/review and embedded duplicate tests | quote, client-desktop |
| S3 Sales | Lead list/detail/Configure identity, committed-save propagation and failed-save/revision tests | sales; LeadDetail, LeadEstimateWorkspace and revisions tests |
| S4 Admin | List/grid/detail/quick view; corresponding Admin component tests | admin |
| S5 Dashboard | Priority and drilldown table/mobile identities; two same-name projects plus missing ID | dashboard |
| S6 Designer | Both general-project and populated design-task rows, selected quick view, workspace, design queue | designer, design-queue |
| S7 Management | Designer summaries/quick review and project header; hierarchy stable-ID projection tests | management |
| S8 PM | Portfolio/detail/estimation contracts and UI; replica source/overview/estimate tests, query-count regression | pm, pm-detail, pm-estimate |
| S9 Procurement | Prepared/general cards, project page, Sales suggestions; source, list/denial and selector tests | procurement |
| S10 Finance | List/bucket/mutation/filter-option contracts, trusted detail and selector; frozen totals and UUID tests | finance-fixed, finance-selector |
| S11 Execution | Portfolio/project/work DTOs, vendor rows, work details, Site Manager fallback; scoped/revoked and batched-read tests | execution, pm-detail; ExecutionWorkspace and SiteManager tests |
| S12 Messaging/status | Conversation project summaries/rows/header/details and status drawer; memory and Mongo authorization tests | chat, status-mobile with Escape/focus restoration |
| S13 Technical identity | Access-request fields/validation say System ID; existing internal values unchanged; parent metadata reused | AccessRequestDialog and repository accessibility tests (43-case follow-up lane with Finance) |

## Completion record

- T1–T8 complete. Integrated review, scoped regression checks, builds, typechecks and browser QA finished. Baseline captured at `/private/tmp/lisno-project-id-visibility/`; initial source tree clean, with only approved spec/plan untracked.
- Foundation: pure stable-ID resolver, session-aware Mongo reader, repository parity and general/Client reads implemented. Commercial, PM, design-task, management, dashboard, chat and status projections wired without changing persistent Project schemas.
- S1–S13 implemented with scoped component coverage. Shared `ProjectId` presents compact metadata; selectors/routes keep UUIDs. AssignedProjectOverview and ProjectBudgetOverview reuse containing identity rather than repeating it. Sales ID remains in its existing Configure identity area.
- T7: first committed allocation refreshes all affected identity query families; failed saves do not invent IDs and estimate drafts remain intact. Cache lane passed 56 tests; shared helper adds 2 passing tests.
- Integrity review found two issues, both corrected: populated Designer task rows/quick review lacked identity; internal PM execution projections added per-project identity queries. Designer regression: 8/8; PM query-count regression suite: 5/5. All other review boundaries passed. Browser review also corrected missing separation between project name and ID in the Finance table.
- Focused validation: foundation 76 tests plus 3 replica tests; commercial 172 replica tests across initial/rerun lanes plus 91 domain/route tests; core frontend 207 tests plus drilldown 1; operations frontend 333 tests plus final adjusted slice 29. Root service/OpenAPI/PM/workflow/chat/status lane totals 185 passing tests across initial and corrected-fixture rerun. These are overlapping focused lanes, not a unique aggregate.
- Final backend/frontend `npm run typecheck` and `npm run build` passed. Frontend `npm test -- --maxWorkers=2`: 6,237 passed / 95 failed across 410 files (425.19s); 91 failures reproduce identically on unchanged HEAD in the isolated baseline. The remaining four stale Project ID/System ID copy expectations were corrected and their complete files pass in follow-up lanes: accessibility/Finance 43/43 and Lead detail/revision 34/34. Full frontend suite was not repeated after these assertion-only fixes. Backend `npm test -- --maxWorkers=2`: 7,155 passed / 16 failed / 24 skipped across 351 files (759.60s). Fifteen failures reproduce identically on HEAD; the remaining safe chat-header exact-key assertion was updated for the new read-only field and all six route tests pass. The 24 skips are existing Python-assistant opt-in cases (`LISNO_ASSISTANT_TEST_PYTHON`); no Project ID regression checks were skipped. Full backend suite was not repeated after this assertion-only fix. `final-baseline-{backend,frontend}-failures.log` records the exact comparison commands and results. Vite retains the existing chunk-size warning.
- Browser evidence so far: 390/768/1440 px; Client header/list, standalone quote, Admin list, Designer tasks, Finance, Procurement, execution and chat render IDs with no page overflow. All remaining family/state/enlarged-text checks passed, including management, PM portfolio/detail/estimation, design queue, dashboard, Finance selector internal values, and status drawer Escape/focus restoration. After allowing existing UI transitions to settle, every inspected view reports zero axe violations.
- Temporary harnesses: `frontend/qa/project-id.html`, `frontend/qa/project-id.tsx`; images `output/playwright/project-id/`; evidence archived under `/private/tmp/lisno-project-id-visibility/browser-harness`, `screenshots` and `browser-logs`. `browser-verification.json` records the 23 scenarios. Temporary repository harness/images removed; task-only browser closed and Vite stopped.
- No dependencies, migrations, backfill, seeds, live customer operations, commits, pushes or deployment performed. Existing number allocation still happens on first successful estimate creation.

The approval and execution gates are complete. Changes remain local and unstaged. No further work is required within this approved scope; unrelated baseline test failures remain outside this change.


### Final evidence and limitations

- Both workspace typechecks and production builds pass. `git diff --check` passes; final status captured in `/private/tmp/lisno-project-id-visibility/final-status.txt`. No lint script exists and no lint result is claimed.
- Full-suite raw totals include five stale assertions corrected afterward. Complete affected files pass in focused reruns: 43 frontend accessibility/Finance tests, 34 Lead detail/revision tests and 6 backend chat-route tests. These assertion-only changes do not require another full build or broad suite repetition.
- The unrelated baseline failures remain: 91 frontend cases in eight files and 15 backend cases in nine files, reproduced from `git archive HEAD` under the temporary baseline directory with the same installed dependencies. This handoff does not claim repository-wide test success.
- Browser QA covers 23 synthetic scenarios at 390, 768 and 1440 px, long identity text, enlarged root text, missing/denied states, internal selector values and keyboard focus. Final settled checks show no page overflow, runtime errors, mutation calls or axe violations. Evidence is in `browser-verification.json` and `screenshots/` under the temporary evidence directory.
- The original numbering rule is preserved: first successful estimate creation allocates the generated number. Legacy projects without a number show `Project ID not assigned`; no backfill was run.
- Only representative screenshots were visually inspected; component interaction tests cover the remaining role variants. No live customer data or deployed application was used. No migration, dependency change, seed, commit, push or deployment was performed.

# Site Manager workspace simplification: task plan

Date: 2026-10-09
Status: Specification and task plan approved; Mode A selected. T0–T6 complete for local implementation and verification. No unresolved new regression found. Full suites retain confirmed baseline failures; no deployment or production mutation performed.

Approved source: [Site Manager workspace simplification](../specs/2026-10-09-site-manager-workspace-simplification-design.md).

## Outcome and scope

Site Manager Home will contain one KPI panel and a compact list of current assigned projects. Opening a project will show its execution statistics, vendor progress and vendor work updates/blockers. Required schedule confirmation, verification, Client handoff and legacy coordination actions will remain available in the selected project.

The user confirmed that vendor queries means **work updates and blockers**. No new chat inbox, query/ticket lifecycle, email behavior, permissions, financial calculation or persisted workflow state is included.

The specification and this task plan were approved in sequence. The user then selected Mode A, authorizing the bounded implementation below.

## Baseline and preservation

- The current worktree contains substantial uncommitted execution-tracker and vendor-invitation work. It is the starting point, not a clean-up target. Relevant dirty/untracked paths include frontend router/navigation, workflow panels, the execution feature, backend execution contracts/services/routes/OpenAPI and their tests.
- Before implementation, capture a fresh `git status --short --untracked-files=all`, tracked target diffs and current contents of every dirty/untracked target under `/tmp/lisno-site-manager-workspace/baseline/`. Do not include credentials or actual environment files.
- Review each assigned target's current content/diff before granting write ownership. Do not stage, commit, reset, revert, delete or broadly reformat unrelated work.
- Prior task test counts and known failures are background. Establish current focused results for this change and distinguish existing failures from new regressions.
- No implementation agents start before the execution-mode gate. Mode A uses owned native subagents; Mode B keeps implementation/review/verification inline.

## Contract and UX decisions to freeze before parallel writes

The primary owns shared types, API/query signatures, routes and overall interaction decisions. The backend and frontend writers implement against this contract.

### Read contract

1. Introduce `ExecutionPortfolioQuery` extending the existing portfolio query shape with optional `projectScope: "current" | "all"`. A portfolio-only runtime schema validates this parameter; omitted scope means `all`. `current` includes `planning`, `active` and `on_hold`, excluding completed projects before search, pagination and `total` calculation. Other execution/history/notification endpoints do not silently accept this parameter.
2. Add safe selected-project metadata to project execution reads: `id`, `name`, `status` and `completionAuthority`. It must be available even for zero-work projects and must be returned only after the existing project authorization succeeds. The shared response may expose `project: null` for vendor-wide reads.
3. Keep existing `counts` behavior for shared consumers. Add a clearly named `projectCounts` summary to project execution responses, containing unfiltered counts for the selected project; vendor-wide reads use null. The Site Manager statistics strip uses this summary while the table's filtered `total` remains separate. Compute from the same authorized snapshot and full assignment projection before filters/pagination, not from a browser page or multiple inconsistent sources.
4. Add nullable `latestVendorReport` to the work DTO: event ID, execution round, reported time, note, reason, next action, reported progress and report status. Read the newest current-round `report` event using stable assignment/project/vendor identity and deterministic event ordering. No current-round report means null. Staff notes, earlier rounds and another vendor's reports cannot populate this field.
5. Reuse/batch report projection reads within the existing transaction/projection-cache structure. Do not issue browser history reads for each displayed row or introduce a new persistent summary model. Do not change report/confirmation/verification command semantics.
6. Mirror additions in frontend API types, query serialization, runtime validation and OpenAPI. Keep endpoint URLs, route-operation permission IDs and existing defaults intact. No authorization inventory count change should be necessary.

### Navigation and page composition

- Site Manager `/home` mounts a dedicated workspace composition, with KPI once and the assigned-project list. Other roles retain the existing landing/queue composition.
- Site Manager `/execution` redirects to `/home`; only their duplicate Execution sidebar item is removed. All other roles retain the Execution portfolio and existing navigation.
- Reuse `/projects/:projectId/execution` with a Site Manager-specific page composition. Existing consumers keep their current project page.
- Persist Home search/page and project view/filter/page in URL state. Use validated internal return context so direct links default to `/home`; browser Back and the visible Back link restore list context without permitting arbitrary external navigation.
- The project screen has one identity header, one compact statistics strip and two views: **Vendor progress** and **Vendor updates & blockers**. Use the approved compact typography, rows, muted surfaces and responsive composition; no new library/assets/icons or global theme rewrite.
- Assignment detail uses the existing commands and dirty-state protections, with a scoped presentation that prioritizes status, schedule and next action and progressively reveals evidence/history/reference details.
- Secondary project actions open completion/Client handoff, reporting policy, project status, existing messages and applicable legacy coordination only when requested and authorized. No invitation-delivery panel in the Site Manager view.

## Dependency-ordered task graph

Keep one parent task in progress. T2 and T3 are independent child slices of the implementation parent after T1; final review and verification occur only after all writers finish.

| Task | Owner and responsibility | Dependencies | Acceptance criteria |
| --- | --- | --- | --- |
| T0: Capture baseline and current regressions | Primary; read-only product investigation and temporary evidence | Task-plan approval and execution-mode selection | Preserve dirty work, confirm current duplicate mounts and record targeted test baseline. AC1, AC6, AC8. |
| T1: Freeze read contracts and integration boundaries | Primary | T0 | Publish exact DTO/query changes, response defaults, cache keys, route variants and project action entry points. Own shared types/validation inventory interfaces before writers use them. AC2–AC6. |
| T2: Implement authorized read projections | Backend implementer in A; primary in B | T1 | Current-project filtering, safe empty-project metadata, unfiltered counts and current-round vendor-report projection with focused transactional tests. AC2, AC3, AC4, AC6, AC8. |
| T3: Implement Site Manager screens | Frontend implementer in A; primary in B | T1 | Compact Home/project screens, progress and report views, selected-project secondary actions, responsive/keyboard states and rendered tests. AC1, AC3–AC7. Safe alongside T2 on separate paths. |
| T4: Integrate routing, navigation and live data | Primary, with bounded handoff back to writers for their paths | T2 and T3 | Site-only route composition and redirect, duplicate navigation removal, final contracts/fixtures, live invalidation, safe return state and preserved other-role behavior. AC1–AC6, AC8. |
| T5: Integrated integrity review and corrections | Read-only integrity reviewer in A; primary sequentially in B | T4 and all writers frozen | Check scope isolation, report lineage, summary/filter correctness, reachable actions, stale/dirty state and cross-role behavior. Owners fix confirmed issues, then re-review. AC2–AC6. |
| T6: Final verification and visual handoff | Verification runner plus primary in A; primary inline in B | T5 resolved | Run final integrated tests/typechecks/builds and browser matrix, inspect final diff and document exact outcomes/limits. AC1–AC8. |

## Ownership boundaries

### Primary

Own this plan and the approved-spec interpretation; all contracts and shared integration files:

- `backend/src/contracts/vendor-execution.ts`
- `backend/src/domain/vendor-execution.ts` portfolio schema/type integration
- `backend/src/routes/vendor-execution.ts` selecting the portfolio-only schema
- `backend/src/openapi/vendor-execution.ts` and any necessary narrow `backend/src/openapi.ts` integration
- `backend/tests/api-docs.test.ts` or narrow contract-inventory assertions
- `frontend/src/features/execution/executionApi.ts`
- `frontend/src/app/router.tsx`, `routeRegistry.ts`, and any necessary scoped return-path helper
- Router, navigation and canonical contract tests/fixtures affected by primary edits

No new permissions or operation identities are planned. If evidence requires changing a canonical permission/route-operation registry, stop the writer and return the decision to the primary; do not broaden access as a UI convenience.

### Backend implementer

Own the approved read-only data slice:

- `backend/src/services/vendor-execution.service.ts`
- `backend/src/services/vendor-execution-projection.ts`
- `backend/src/services/vendor-execution-access.ts` only if necessary to preserve the existing assignment boundary consistently in portfolio reads
- Focused `backend/tests/site-manager-workspace.replica-set.test.ts` (new) and relevant execution integration/projection tests

Do not edit invitation/onboarding/email services, command lifecycle rules, financial sources, persisted models, shared contracts or primary-owned schemas/routes/OpenAPI. Current report projection should come from existing events without migrations. Coordinate additive contract needs with the primary.

### Frontend implementer

Own Site Manager UI and bounded reusable presentation changes:

- New feature files under `frontend/src/features/site-manager/`, including workspace, selected-project page, project actions, styles and focused tests
- `frontend/src/features/execution/ExecutionDetailPanel.tsx` and `ExecutionWorkspace.tsx` only for explicit reusable/scoped presentation boundaries; retain the existing behavior for other callers
- `frontend/src/features/workflow/OperationalTaskQueue.tsx` only for reusable legacy coordination in selected-project context, with applicable tests
- Narrow changes to `SiteCompletionPanel.tsx` only if needed for correct on-demand mounting/dirty close behavior, with tests
- Feature-specific execution fixtures and affected rendered tests, excluding primary-owned routing/navigation/contract files

Reuse `KpiPanel` without changing its calculation, API or default presentation. Scope compact spacing under the Site Manager feature styles. Do not change global CSS tokens or shared primitives to achieve a local redesign.

### Collaboration rules

Every writer must be told they are not alone in the worktree, must preserve the captured baseline, and must not revert another writer's edits. Assign only explicit non-overlapping paths. Shared decisions and unexpected overlaps return to the primary. Run final checks after all writes finish; passing tests while another writer is editing are interim evidence only.

## Detailed implementation conditions

### T0–T1: Baseline and contract preparation

- Confirm the actual endpoint/DTO/schema behavior and dirty per-target diffs rather than relying on the previous task's plan.
- Run the focused execution, Site Manager queue/completion, router/navigation and KPI-related checks to establish failures before edits. Keep logs separate from final evidence.
- Freeze names/nullability and query serialization together. Update test fixtures with real semantics, never arbitrary zero values to silence missing-contract errors.
- Set explicit empty-project metadata and unfiltered-count behavior so frontend and backend agents cannot invent incompatible fallbacks.

### T2: Data correctness

- Test assigned planning/active/on-hold/completed projects across more than one page, including two distinct projects sharing a name and a current project with no work orders. Ensure one list entry per stable project ID and correct totals.
- Preserve the existing unique assigned Site Manager boundary; duplicate/ambiguous or removed assignments must not grant project detail, note or action access. Compare two Site Managers with unequal projects and work counts.
- Derive the latest report only from current-round vendor `report` events. Cover a later staff hold/review note, earlier-round blocker, same-name Main Lines, no-report case and successive reports.
- Compute project statistics before row filters and pagination; filtering by one vendor/status must not change project-wide statistics. Preserve current filtered `counts` semantics for shared consumers.
- All reads remain free of state initialization/audit/event writes. Preserve transaction consistency and source IDs. No new indexes or data migrations without primary review of demonstrated need.

### T3: Compact UI and preserved actions

- Home mounts only one heading, one existing KPI panel and assigned projects. It must not fan out into completion/detail reads for every project.
- Project list rows display name/status/open action and support long labels. Current-assignment empty state differs from a failed read.
- Project view mounts only the selected project's data. Display zero work truthfully with the project name/status; never hide an assigned project because no vendor has been awarded work.
- Keep proposed dates visible next to the relevant work and use backend `allowedActions` for confirmation/verification. Preserve exact submission/version/receipt handling in the existing detail panel.
- Vendor updates list shows the authentic latest report and a Blocked filter. For a current blocker, include reason and next action. The report's own status remains labelled as reported; current execution status and verification remain separate.
- Expand history/evidence/reference metadata on demand in the Site Manager detail variant. Other roles retain their established presentation.
- Preserve completion/Client handoff and legacy actions in project context. If moving a form into a panel/disclosure, protect unsaved edits and keep pending/error/focus behavior. No button may bypass eligibility checks.
- Keep selected project/list/filter state on back navigation. On access loss, clear stale identity and report data and disable mutations.

### T4: Route and live-data integration

- Wire Site Manager Home and project variants without changing login destinations for other roles or weakening permission wrappers.
- Hide their duplicate Execution nav entry; preserve the route as an authorized redirect and preserve navigation for Program Manager, Procurement and Super Admin.
- Confirm one KPI and one summary region in the rendered DOM. Remove redundant mounts, not only hide them with CSS.
- Include `projectScope`, project ID, views and filters in appropriate query keys; retain identity scoping and authentication-cache clearing. Reuse the execution live-provider invalidation family, with existing visible-page fallback.
- Completion, legacy progress and execution mutations invalidate affected project summary, task/KPI, status and completion queries as appropriate. New report projections must refresh without replacing a dirty form.

## Verification matrix

| Criteria | Required checks |
| --- | --- |
| AC1 | Home rendered tests assert a single KPI and project list and absence of completion forms, task grids, per-project trackers and placeholder badge. Browser layout inspection. |
| AC2 | Replica-set reads verify current-scope filtering before pagination, search/total consistency, unique IDs, on-hold/planning inclusion, completed exclusion and zero-work projects. |
| AC3 | Direct project link/refresh/back, search/filter/paging, unfiltered statistics, proposal visibility and verification action reachability with unequal vendor data. |
| AC4 | Current-round report lineage tests and rendered notes/reason/next-action states; no report, staff-after-report, rework and no fabricated ticket state. |
| AC5 | Existing confirmation/verification/hold and Client handoff regressions; legacy coordination update remains reachable. Preserve CAS/idempotency and evidence gates. |
| AC6 | Two Site Managers with different projects, removed/ambiguous assignments, revoked cached reads, live updates, dirty panels and unaffected other-role navigation/workspaces. |
| AC7 | Browser 1440/768/390/320px; long labels, keyboard/focus, loading/empty/error/offline states, no page overflow, accessibility scans and inspected screenshots. |
| AC8 | Focused suites, affected full-workspace typechecks/builds, API/OpenAPI/authorization parity, broader suite runs for shared-read contracts, final diff/status review and documented baseline classification. |

### Commands

Run from the corresponding workspace, with named new test files finalized during T1. Start focused and broaden once on the integrated tree; repeat only for actual changes or unresolved failures.

```sh
# Backend focused
npm test -- tests/site-manager-workspace.replica-set.test.ts tests/vendor-execution.replica-set.test.ts tests/vendor-execution-integration.replica-set.test.ts
npm test -- tests/api-docs.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts

# Frontend focused
npm test -- src/features/site-manager/ src/features/execution/ExecutionWorkspace.test.tsx src/features/workflow/OperationalTaskQueue.test.tsx src/features/workflow/SiteCompletionPanel.test.tsx src/features/workflow/VendorWorkProgressPanel.test.tsx
npm test -- src/app/router.test.tsx src/app/routePaths.test.ts src/components/layout/navigation.test.tsx src/features/vendor/VendorWorkPage.test.tsx

# Final affected workspace checks, backend and frontend separately
npm run typecheck
npm test -- --maxWorkers=2
npm run build

# Repository hygiene
git diff --check
git status --short
```

If another relevant KPI or preserved-action test is identified during implementation, include it. Replica-set tests must use authorized local sockets, not weakened transaction behavior. The full suites may contain prior failures; compare actual failures against the captured baseline/unchanged source before classifying them. Do not change unrelated assertions just to obtain a green run. There is no repository lint script. OCR is unaffected.

Browser QA uses synthetic identities, isolated data and existing tools. Required scenarios: assigned project with a pending vendor schedule; another project with a completion awaiting site verification; vendor blocker and a later staff note; on-hold and zero-work projects; legacy coordination; Client-handoff blocked/pending states; navigation Back; revoked access; dirty detail while a live update arrives. Exercise real production components and disclose any mocked API boundary. Record sanitized results/screenshots under `/tmp/lisno-site-manager-workspace/`, inspect them and stop owned services after QA.

## Handoff and rollback

- Report the final Home/project flow, affected files, exact tests/builds/browser results, any unrun checks and confirmed baseline failures.
- Do not call partial verification complete. Resolve confirmed regressions in the approved scope, re-review material fixes and rerun the necessary checks.
- No dependency install, environment edit, deployment, actual email, production mutation, migration/backfill, commit or push is planned.
- Rollback is a code rollback; no data rollback should be needed. The optional portfolio filter defaults to prior behavior, and additive response fields are compatible with existing clients.
- Temporary baselines, logs, screenshots and ignored build artifacts are not committed. Preserve all existing project/report/approval history and uncommitted work.

## Execution record

- Specification approved on 2026-10-09; approval applies to the immediately preceding specification gate.
- Current task-plan stage performed read-only inspection and created this document only. No product files changed, no agents started, no test/build/real email/deployment executed for this change.
- The task plan was approved and the user selected A; all implementation gates are complete.

- T0 complete: captured 146 existing changed files and tracked diff under `/tmp/lisno-site-manager-workspace/baseline/`. Frontend baseline: 252/252 tests passed. Backend baseline initially blocked by sandbox sockets; rerun with local socket permission.
- T1 complete: froze additive `ExecutionPortfolioQuery`, `ExecutionProjectMetadata`, `ExecutionVendorReport` and `ExecutionPage.projectCounts`; existing commands and authorization operations unchanged. T2/T3 are the active implementation parent slices.

- Baseline backend rerun passed 18/18 after local sockets were authorized. Root contract/API regression passed 157/157; routing/navigation regression passed 372/372. Live-provider invalidation/denial test passed 1/1. These are focused interim checks; final integrated verification remains pending.

- T2–T4 complete: backend projections, dedicated Site Manager screens, scoped compact details, route composition, navigation, live invalidation and preserved project actions are integrated. No shared command or persistence lifecycle changed.
- Backend writer verification: new replica suite 8/8; existing execution/integration/delivery suites 44/44; typecheck passed. Frontend writer verification: focused 36/36 plus typecheck passed.
- T5 complete: independent integrity review found one P2 issue, then accepted the correction. Transient project execution refresh failures now retain open project-action drawers and their drafts, while new action entry is disabled until refresh succeeds. Corrective project-page regression passed 9/9. No remaining confirmed integrity defect.
- T6 active: final verification runner owns integrated focused/full suites, typechecks and production builds. Separate browser runner uses an isolated synthetic API/SSE harness with production App/router/components. No production data or actual mail is used.


### Final automated verification

| Check | Result | Evidence under `/tmp/lisno-site-manager-workspace/` |
| --- | --- | --- |
| Backend focused execution/current-project/delivery/API/authorization/query suites, `npm test -- tests/site-manager-workspace.replica-set.test.ts tests/vendor-execution.replica-set.test.ts tests/vendor-execution-integration.replica-set.test.ts tests/vendor-execution-delivery.replica-set.test.ts tests/execution-query.test.ts tests/api-docs.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts --maxWorkers=2` | 209 passed, 9 files, exit 0 | `final-backend-focused.log` |
| Backend `npm run typecheck` and `npm run build` | Both exit 0 | `final-backend-typecheck.log`, `final-backend-build.log` |
| Backend `npm test -- --maxWorkers=2` | 4,885 passed / 18 failed, 244 files, exit 1 | `final-backend-full.log` |
| Backend isolated catalogue replica suite, `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts --maxWorkers=1` | 34 passed, exit 0; full-run setup timeout and duplicate-fixture cascade did not reproduce | `final-backend-catalogue-rerun.log` |
| Frontend focused Site Manager, execution, workflow, routing/navigation and vendor-page suites, `npm test -- src/features/site-manager/ src/features/execution/ src/features/workflow/OperationalTaskQueue.test.tsx src/features/workflow/SiteCompletionPanel.test.tsx src/features/workflow/VendorWorkProgressPanel.test.tsx src/app/router.test.tsx src/app/routePaths.test.ts src/components/layout/navigation.test.tsx src/features/vendor/VendorWorkPage.test.tsx --maxWorkers=2` | 433 passed, 13 files | `final-frontend-focused.log` |
| Frontend `npm test -- --maxWorkers=2` | 4,444 passed / 29 failed, 292 files, exit 1 | `final-frontend-full.log` |
| Frontend correction run, `npm test -- src/features/site-manager/ src/test/fixtures/enterpriseTransport.test.tsx --maxWorkers=2` | All 18 Site Manager tests and corrected Home fixture passed; combined 79 passed / 2 known baseline failures | `final-frontend-corrections.log` |
| Frontend isolated vendor-profile labor-save test | 1 passed / 61 intentionally skipped, exit 0; unrelated full-run timing failure did not reproduce | `final-frontend-labor-rerun.log` |
| Frontend corrected-tree `npm run typecheck` and final CSS-inclusive `npm run build` | Both exit 0; existing large-chunk build warning remains | `final-frontend-typecheck-corrections.log`, `final-frontend-build-mobile.log` |

Full suites are **not green**. Independent verification matched 16 backend and 27 frontend failures against the saved unchanged-HEAD baseline by both exact name and first error message. Their source/test paths are unchanged by this task. The previously dirty purchase-order request test also matches this task's captured starting file byte-for-byte. The new frontend synthetic-transport fixture gap was corrected and passed its rerun. No unresolved new test regression remains.

Additional browser-driven corrections: added the missing semantic work-section H2 and removed mobile KPI flex-basis height reserved after its layout switches to a column. These are scoped changes. No dependencies or lockfiles changed.


### Final browser verification and handoff

- T6 complete: 34 browser assertions passed using the production App/router/components against an isolated synthetic API and SSE harness. Covered vendor-report lineage despite later staff notes, stable statistics under filters, Home search and Back, schedule confirmation, exact verification submission/version/idempotency, live refresh while dirty, focus restoration, Client handoff blockers and pending read-only state, reporting-policy drafts, legacy progress Back guard, zero-work/on-hold projects, resume, offline/loading/empty/error, and access revocation clearing identity/notes.
- Home and selected-project screenshots at 1440, 768, 390 and 320 pixels: 8 scans with zero axe violations and no document overflow. Root and QA inspected the corrected screenshots. The temporary harness was corrected to include the production CSS layer prelude before final scans; earlier unstyled artifacts were replaced. Mobile KPI spacing and heading hierarchy were rechecked after their fixes.
- Browser evidence: `/tmp/lisno-site-manager-workspace/visual/`, including the final `results.json`, passing matrix/action/secondary/legacy/availability run logs and sanitized screenshots. Interrupted combined harness runs are superseded by the passing isolated checks. Chromium only. External Google Fonts were not requested, so screenshots used the configured fallback font; exact downloaded-font rendering was not tested. API/SSE data and mutations were synthetic; real backend lifecycle behavior is covered by the replica-set tests. Only intentionally injected 500/403/offline failures occurred, with no unexpected production JavaScript exception.
- Owned temporary browser/server sessions were closed after QA. Ignored build outputs and temporary verification evidence were not staged or committed. Existing unrelated dirty work was preserved.
- No dependencies, lockfile edits, environment edits, migration/backfill, real email, production mutation, deployment, commit or push performed. OCR is unaffected and was not run. There is no repository lint script, so no lint result is claimed.
- Final outcome: Site Manager Home contains KPI and current assigned projects. One project view provides unfiltered execution statistics, vendor progress, current-round vendor work updates/blockers and on-demand existing actions. Other roles retain their workspaces and command contracts. All new task regressions are resolved; remaining full-suite baseline failures are disclosed above.

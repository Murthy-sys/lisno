# Project Manager dashboard reference redesign: task plan

Date: 2026-10-28
Status: Implemented under approved Mode A; scoped verification passed. The full frontend suite retains 96 proven pre-existing failures, detailed below.
Source of truth: [Approved redesign specification](../specs/2026-10-28-project-manager-dashboard-reference-redesign-design.md).
Approval record: The user approved the specification, approved this separate task plan, then selected Mode A in the current conversation on 2026-10-28.

## Outcome and boundaries

Deliver the approved reference composition on the shared Project Manager / Site Manager web dashboard at `/execution`, retaining the `/home` redirect. Use the existing image, typography, backend data, assignment scope, filters, alerts, KPI and project-detail destinations.

The implementation includes the image header, filter band, four summary metrics, adjacent alerts and project table, functional list/grid selection, responsive layouts and complete query states. Preserve the approved adaptations: no New project action; Target handover instead of an unsupported per-project Updated date; generic decorative imagery; real project/section context for alerts.

No backend, API contract, database, role, permission, native mobile, package or lockfile changes are planned. No new dependencies, commits, staging, deployment, migrations, production access or external communications are authorized by this plan.

## Worktree and execution contract

At planning discovery, the only dirty path was the untracked approved specification:

`docs/superpowers/specs/2026-10-28-project-manager-dashboard-reference-redesign-design.md`

Relevant tracked dashboard, stylesheet, test, routing-test and QA transport diffs were empty. This new task-plan file is the only write made in this stage. Preserve both documents and recapture the full dirty-path set and relevant diffs immediately before writers begin.

Only one parent stage below may be in progress at a time. Parallel work is limited to the explicit slices within T2. No agents are started until the user selects execution mode after task-plan approval.

- In Mode A, use native agents with non-overlapping ownership. Every writer must be told that others share the worktree, to preserve their changes, and to return dependencies instead of editing another owner's files.
- In Mode B, the primary agent performs all implementation, review, integration and verification sequentially. No implementation or review subagents are used.
- The primary agent owns interpretation, integration, shared contracts, this plan, conflict resolution and final evidence in either mode.
- Reconcile routine implementation details within the approved spec. Reopen an approval gate only for a material scope or contract change.

## File ownership

All paths below are relative to `frontend/` unless stated otherwise. New files are proposed bounded responsibilities, not a requirement to create unused abstractions.

| Owner in Mode A | Exclusive write responsibility | Boundary |
| --- | --- | --- |
| Runtime frontend implementer | `src/features/project-manager/ProjectManagerWorkspace.tsx`; new `PMDashboardProjects.tsx`; new `PMDashboardIcon.tsx` if needed | Own dashboard markup, view state and project presentations. Preserve project-detail behavior in the shared workspace file. Do not change CSS, shared query helpers, API types or tests assigned to others. |
| Styling frontend implementer | New `src/features/project-manager/project-manager-dashboard.css` | Own the scoped visual system and responsive rules. Do not edit shared `project-manager.css`, global shell/theme CSS, runtime JSX or tests. |
| QA fixture implementer | New `src/test/fixtures/enterpriseProjectManagerData.ts`; `src/test/fixtures/enterpriseTransport.ts`; `src/test/fixtures/enterpriseTransport.test.tsx` | Own opt-in synthetic PM data/transport and real-route harness coverage. Preserve unrelated fixture scenarios and existing fail-on-unexpected-request checks. No product code changes. |
| Primary agent | `src/features/project-manager/ProjectManagerWorkspace.test.tsx`; `src/app/router.test.tsx`; this plan and integration | Own dashboard behavior tests, affected route assertions, reconciliation and final fixes after ownership handoff. Shared helper edits are primary-only and require a demonstrated need. |

Read-only review/verification agents receive the final integrated diff after all writers stop. Any ownership transfer must be explicit; do not let the primary agent and a child edit the same target concurrently.

## Dependency-ordered tasks

### T1. Capture baseline and establish the presentation boundary

Status: Complete. Initial dirty paths were only the specification and this plan; relevant product diffs were empty. Baseline focused PM/dashboard/routing tests passed: 4 files, 292 tests. Presentation/file ownership boundaries below are established.
Owner: Primary agent.
Dependencies: Approved task plan and execution mode.
Acceptance criteria: A2, A3, A8, A9.

1. Recheck worktree status, relevant target diffs, current route wiring, contracts and current tests. Preserve any new user changes.
2. Run the current focused PM/dashboard and routing regression checks before edits; record pre-existing failures separately. Do not use historical test counts as current evidence.
3. Confirm the current image and shell context. Use the existing synthetic QA entry for browser baseline where available; record that its current PM portfolio fixture is empty.
4. Establish the minimal JSX/CSS interface before parallel writers start: dashboard root `.pm-dashboard`, header `.pm-dashboard__header`, body `.pm-dashboard__body`, and dashboard-local projects, alerts, metrics, list/grid and loading descendants. Share any extra selectors directly between owners.
5. Keep existing exports and project-detail entry points stable. Use the existing `projectLink` builder or pass its result/callback into the new project presentation; do not create competing URL builders.
6. Agree the project presenter inputs: backend `PMProject[]`, current `offset`, validated list/grid mode and safe project hrefs. Loading/error state stays at the dashboard query boundary; the collection only displays supplied records.

Exit condition: baseline and file ownership are recorded, and component/style/fixture interfaces are clear enough for independent work.

### T2. Implement the dashboard and isolated QA support

Status: Complete. All three bounded writers returned ownership. Root added behavioral and route regression coverage. Focused integrated PM/operational tests passed: 2 files, 38 tests; fixture/real-route checks passed: 4 tests. Initial desktop/mobile visual findings were corrected in dashboard-scoped CSS.
Owner: Primary agent coordinates the four slices below.
Dependencies: T1.

These slices may run in parallel only in Mode A. With four available slots, the primary agent owns T2D while three bounded writers own T2A, T2B and T2C. In Mode B, perform them inline, generally T2A, T2B, T2C, T2D.

#### T2A. Runtime composition and presentation state

Owner: Runtime frontend implementer in Mode A; primary in Mode B.
Acceptance criteria: A1–A6, A8.

- Add the dashboard-specific root and import its stylesheet after the existing PM stylesheet.
- Build the shallow decorative header with Project Dashboard, actual identity/date, real connection state, refresh and KPI disclosure.
- Preserve native labelled filters and existing URL/API filter construction. Add validated `view=list|grid` URL state separately; view changes preserve search, health, status and offset and do not change the API query key/data request.
- Restyle the four real summary metrics through agreed markup while preserving current health-filter behavior, the critical subcount, count-scope explanation and incomplete-source action.
- Place alerts and projects into the two-panel body. Retain exact target IDs/tab/entity/offset and preview/all-alert pagination. Keep source details and long titles readable.
- Implement the semantic desktop project table and grid using the same page of data. Preserve approved net value, source issues, null progress, target handover and exact health/status text. Row numbering includes the page offset.
- Provide one active project presentation with one progress indicator per project. Use responsive semantics without duplicated focusable controls. Give project links and any secondary opening affordance distinct, meaningful accessible names.
- Use the common decorative image with empty alt text, reserved dimensions and graceful failure handling. Add only the small local glyphs needed for this screen.
- Preserve loading, empty/no-match, initial failure, stale refresh and denied-access behavior. Reuse existing query helpers where possible; any dashboard-specific placeholder must not show invented values.
- Keep My KPI policy behavior and the full project-detail workflow unchanged. A denied portfolio response must hide stale portfolio records regardless of selected view or KPI expansion.

Exit condition: dashboard renders all approved data and controls with existing data sources and destinations, and no project-creation action appears.

#### T2B. Dashboard styling and responsive composition

Owner: Styling frontend implementer in Mode A; primary in Mode B.
Acceptance criteria: A1, A6–A8.

- Write only dashboard-scoped CSS using the agreed root/descendants and existing Poppins conventions.
- Implement warm ivory/stone surfaces, olive emphasis, readable semantic states, fine borders and 2–4 px corners. Exclude drop shadows, glass, Lucide additions, harsh gradients and hover motion.
- Crop the existing image toward the right of the header while protecting title/action contrast with a stable reading area.
- Build the full-width filter band, four-metric region, approximately 36/64 alert/project split, dense readable table and compact grid.
- Choose responsive transitions using actual available workspace width with the sidebar present. Stack the body before either panel becomes cramped; turn metrics two by two and projects into stacked rows on compact screens. Preserve all source fields.
- Ensure useful focus states, primary touch targets, long-text wrapping, stable loading geometry and reduced-motion behavior. Avoid fixed-height content or nested vertical scroll panes.
- Inspect representative desktop/mobile results with the runtime owner and primary agent once markup and fixtures are available. Do not modify another owner's files to address a mismatch.

Exit condition: wide and narrow layouts are ready for integrated visual review, with no style leakage into other PM screens.

#### T2C. Synthetic route fixtures and harness regressions

Owner: QA fixture implementer in Mode A; primary in Mode B.
Acceptance criteria: A2–A7, A9.

- Extend the existing `qa/enterprise.html` harness through an opt-in `qaProjectDashboard=ready` scenario. Reuse its real `AppRoutes`, role/session fixture, request diagnostics and accessibility hook.
- Keep PM data in a dedicated typed fixture module. Provide unequal projects, realistic long names/alerts, critical/at-risk/on-track/setup/incomplete/completed states, null progress/value/date, server-style paging and distinct stable IDs. Counts must be consistent with the fixture dataset and filter contract.
- Support project/alert pagination and the minimum PM overview/site/KPI reads needed to exercise real navigation and return. Do not weaken unknown-request failures or silently route QA traffic to a backend.
- Reuse existing loading/empty/error/denied scenario support; provide deterministic failed-refresh and access-revocation controls only if needed for browser state checks. Keep those controls test-only.
- Preserve default non-opt-in scenarios. Update only the PM heading assertion from Dashboard to Project Dashboard where the approved title requires it.
- Add a focused harness integration case proving both `/execution` and `/home` reach the redesigned dashboard through the real shell, with zero unexpected requests and no create-project action.

Exit condition: populated and failure-state QA is possible without reading or mutating real project data, and unrelated harness scenarios retain their behavior.

#### T2D. Dashboard and route regression coverage

Owner: Primary agent.
Acceptance criteria: A2–A6, A8.

- Preserve existing tests for backend counts, missing data, health filters, pagination, safe return paths, exact alert entities, revoked access, KPI availability and full-detail navigation.
- Add behavior tests for default/invalid/list/grid URL state; unchanged API filter parameters when toggling; no `view` parameter sent to the strict backend endpoint; return navigation retaining view and current pagination.
- Verify unequal project values, null versus zero progress, exact critical health, nonzero row numbering, source notes and target handover in both presentations. Do not calculate portfolio counts from rendered rows.
- Verify distinct empty/no-match states, initial retry, stale-data warning, loading without fake metrics, and removal of visible records on authorization failure in list and grid modes.
- Cover connection labels and keyboard-operable view/KPI controls. Keep existing full-detail and operational-access tests meaningful rather than deleting assertions to accommodate layout changes.
- Update only relevant PM title assertions in `router.test.tsx`; retain role gates and `/home` redirect expectations.

Exit condition: focused regressions demonstrate the approved behaviors without coupling assertions to incidental CSS markup.

### T3. Integrate and perform integrity review

Status: Complete. Independent integrity review found no confirmed defects. Root corrected view-switch focus after browser evidence by using URL replacement, then added a route-focus regression. Reviewer confirmed this is contract-safe. Coverage also now includes KPI-open access revocation and encoded alert targets with nonzero tab offsets.
Owner: Primary agent; `integrity_reviewer` read-only in Mode A.
Dependencies: All T2 owners finished and ownership returned.
Acceptance criteria: A2–A6, A8, A9.

1. Inspect every changed file and reconcile the final imports, selectors, view-state handling, generated URLs and fixture routing. Confirm the changed-path set stays inside ownership boundaries.
2. Check assignment-denial handling, nullable values, integer-paise formatting, At risk inclusivity, count/filter semantics and absence of frontend-generated business values.
3. Confirm no backend/schema/authorization edits, extra network requests, dependency changes, project-creation controls or unrequested detail redesign slipped in.
4. Run the read-only integrity review after writers finish. In Mode B, perform this review inline. Resolve findings, then rerun affected focused checks before final verification.

Exit condition: confirmed review findings are resolved and the integrated code is ready for the final verification stage.

### T4. Verify the integrated result and visually refine

Status: Verification finished. Typecheck/build, 340 PM/routing tests and 3 dedicated PM harness tests passed. Browser checks passed. Full-suite failures were reproduced and compared against pristine HEAD; see the evidence record below.
Owner: Primary agent; `verification_runner` read-only in Mode A after integrity review.
Dependencies: T3.
Acceptance criteria: A1–A9.

Run from `frontend/`, sequentially after writers finish:

```sh
npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx
npm test -- src/features/project-manager src/app/router.test.tsx src/app/routePaths.test.ts src/test/fixtures/enterpriseTransport.test.tsx
npm run typecheck
npm test
npm run build
```

Run `git diff --check` and `git status --short` at repository root. Do not claim lint passed; no lint script exists. Do not run backend or native mobile suites for this unchanged contract.

Use an available browser controller and the existing local Vite workflow to inspect the real shell with isolated QA data. Apply the relevant browser/visual-QA skill when that stage starts. No production or database mutation is needed.

| Surface/state | Required browser evidence |
| --- | --- |
| Populated list at 1920 and 1440 px | Compare reference hierarchy, image crop, panel proportions, density, status readability and table alignment. |
| 1024, 768 and 390 px | Verify layout transitions, readable alert wrapping, filter labels, project fields and control access. |
| 320 px and 200% zoom | Check document overflow, overlapping text, hidden controls and usable reading order. |
| Grid at desktop and phone widths | Same records, values and navigation; one active presentation and no duplicate progressbars/focus targets. |
| Filters, paging and navigation | Change search/status/health, select a summary metric, expand/page alerts, open a project/alert and return with view/filter/page state preserved. |
| KPI | Open and close; existing score/policy availability remains truthful and accessible. |
| Loading, empty/no-match, initial error, stale refresh, denied and offline | Inspect representative rendering and retry/replacement behavior; combine browser evidence with focused state tests. |
| Keyboard and accessibility | Traverse primary controls, check visible focus/touch sizes, run the existing axe hook and inspect actual contrast. Distinguish existing shell findings from new regressions. |
| Detail regression | Open one real project-detail route in the fixture shell; inspect tabs, source note/progress and the unchanged operational entry points. |
| Runtime diagnostics | Inspect console errors, failed/unexpected requests, network count while switching views, and image fallback/layout stability. |

Inspect saved screenshots as images, not only DOM snapshots. Keep screenshots/reports under `/tmp/lisno-pm-dashboard-reference-qa/`. Record exact commands, exit codes, test totals, screenshots and limitations. If a finding requires edits, the primary agent fixes it after reviewer/verification ownership is released and reruns only affected checks plus required final checks invalidated by the edit.

Exit condition: each acceptance criterion has evidence; any unresolved limitation is explicitly recorded and prevents an unsupported claim of completion.

### T5. Handoff

Status: Complete. Evidence recorded below; task-owned browser artifacts moved out of the repository; local task browser/server closed. Work remains unstaged and uncommitted.
Owner: Primary agent.
Dependencies: T4.

- Update this plan with actual work, verification evidence and remaining limitations. Preserve the approved specification; do not retroactively weaken its acceptance criteria.
- Report the redesigned shared dashboard, principal UI decisions, affected files, exact check results and QA artifact path.
- State that no dependencies, backend/API changes, migrations, deployment or production actions were performed, if that remains true.
- Report any unrun checks or outstanding issues. Keep the final worktree unstaged and uncommitted unless separately instructed.

## Implementation and verification record

### Delivered changes

- `frontend/src/features/project-manager/ProjectManagerWorkspace.tsx`: reference dashboard composition, real header/filters/metrics/alerts/KPI, view-level refreshed date, frontend-only list/grid URL state. View changes replace the URL entry to retain keyboard focus under the existing route-focus manager. Project-detail implementation is preserved.
- New `PMDashboardProjects.tsx` and `PMDashboardIcon.tsx` in the same feature: one active semantic project table/grid, real values and target handover, null-state handling, decorative existing image with stable fallback, local glyphs.
- New `project-manager-dashboard.css`: scoped typography, image header, warm canvas, summary and body layout, responsive stacked rows, visible keyboard focus, 44 px mobile controls and reduced-motion behavior. The two-panel body stacks when available content width is insufficient.
- Dashboard and route tests: source values, query/view/return state, keyboard focus, exact encoded alert targets and target pages, KPI disclosure, denied access while KPI is open, failed-refresh retry and empty/loading states.
- `enterpriseProjectManagerData.ts`, `enterpriseTransport.ts`, `enterpriseTransport.test.tsx`: opt-in synthetic data through the real application routes/shell; paging and deterministic failure/revocation states without live backend fallback.

No dependencies or lockfiles, backend/API contracts, permissions, native mobile code, migrations or real project data changed. No staging, commit, push, deployment or external action was performed.

### Automated checks

All frontend commands ran from `frontend/`. Evidence directory: `/tmp/lisno-pm-dashboard-reference-qa/`.

| Command | Actual result |
| --- | --- |
| Baseline `npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx src/app/router.test.tsx src/app/routePaths.test.ts` | Passed before edits: 4 files, 292 tests. |
| Final focused `npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx` | Passed: 2 files, 40 tests. |
| `npm test -- src/features/project-manager src/app/router.test.tsx src/app/routePaths.test.ts src/test/fixtures/enterpriseTransport.test.tsx` | 405 passed, 3 failed. The 3 unrelated harness failures reproduce on pristine HEAD. Log: `frontend-focused.log`. |
| `npm run typecheck` | Passed, exit 0. Log: `frontend-typecheck.log`. |
| `npm test` | 5,682 passed, 96 failed; 364 files passed and 8 failed. Log: `frontend-full.log`. All 96 failures reproduce on pristine HEAD with identical failure names. |
| `npm run build` | Passed, exit 0; 3,264 modules. Existing large-bundle warning remains. Log: `frontend-build.log`. |
| `npm test -- src/features/project-manager src/app/router.test.tsx src/app/routePaths.test.ts` | Passed: 8 files, 340 tests. Log: `frontend-scoped-final.log`. |
| `npm test -- src/test/fixtures/enterpriseTransport.test.tsx -t 'Project Manager'` | Passed: 3 tests; 65 unrelated cases intentionally filtered out. Log: `frontend-pm-fixtures-final.log`. |
| Root `git diff --check` | Passed. Final status contains only intended frontend sources/tests and the two approved documents. |

The independent verification runner archived pristine HEAD `8a306913142b899fd3424878c3e0a81b453b3713` into the evidence directory's `baseline/`, reused the existing dependencies, and ran:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/test/fixtures/enterpriseTransport.test.tsx src/features/leads/LeadDetail.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/estimates/AskLisnoLauncher.test.tsx
```

Baseline result: 242 passed and 96 failed. `failure-comparison.json` records 96 current and 96 baseline failure headers, identical sets, with no additional current failures. `frontend-baseline-failures.log` contains the underlying output. These unrelated failures were not modified or hidden. Full-suite warnings also include an existing unmatched Configuration mock request and unavailable JSDOM canvas context.

### Rendered checks

Browser: Headless Chrome 156 on macOS, device pixel ratio 1, local Vite development build with isolated synthetic data. No CPU/network throttling or physical-device performance claim. The existing harness rendered the actual role shell and routes. The 200% check used CSS zoom, not browser-toolbar zoom.

| Acceptance | Observed evidence |
| --- | --- |
| A1, A7 | Inspected desktop list and grid, responsive layouts at 1920/1440/1024/768/390/320 px, and 200% CSS zoom. No document-level horizontal overflow. Fixed header button alignment, table Open/Incomplete wrapping, canvas background and mobile controls after screenshot review. |
| A2, A8 | Both `/execution` and `/home` tested through the actual shell. Project and alert links open the existing detail page with all eight tabs. Rendered detail retained its original styling; full execution actions remain covered by operational-access tests. |
| A3, A4 | Checked unequal values, null/zero progress, real health/counts, all/completed/current status, search/no-match and summary filtering. List/grid switch made zero extra portfolio reads. Keyboard focus remains on the selected view button with a visible 2 px olive outline; returning from a project restores view/filter state. |
| A5 | Preview expanded from 8 to 9 real fixture alerts; alert opens the expected stable entity. Paging fixture showed projects 21–31 of 31 and alerts 21–40 of 81. KPI displayed its existing score/policy-availability message and closed correctly. |
| A6 | Visually checked loading, empty, no-match, initial error, stale refresh/retry, offline, initial denied role and assignment revocation. Stale refresh retained 7 projects with warning; revocation removed all projects and an open KPI panel. |
| A7 | Axe scans reported zero violations on desktop list, mobile list and mobile grid. Mobile primary controls measured at least 44 px high; reduced-motion preference was exercised. Thumbnail error handling retained its 58×62 px mobile space and displayed the decorative fallback. |
| A9 | Final rendered routes reported zero application errors and zero unexpected harness requests. Axe emitted asset-preload warnings, so the scan is not a claim of complete cross-browser accessibility conformance. |

Final preview artifacts:

- `/tmp/lisno-pm-dashboard-reference-qa/pm-dashboard-desktop-final.png`
- `/tmp/lisno-pm-dashboard-reference-qa/pm-dashboard-mobile-final.png`
- `/tmp/lisno-pm-dashboard-reference-qa/pm-dashboard-grid-desktop.png`
- `/tmp/lisno-pm-dashboard-reference-qa/pm-dashboard-grid-mobile-project.png`
- `/tmp/lisno-pm-dashboard-reference-qa/pm-dashboard-project-detail.png`
- `/tmp/lisno-pm-dashboard-reference-qa/pm-dashboard-zoom200-viewport.png`

Other state, breakpoint and initial/refined screenshots and browser diagnostics are in the same temporary directory. Task-owned browser outputs were moved out of `.playwright-mcp`; unrelated existing files were preserved. Production build output remains in ignored `frontend/dist`. The task's development server and browser page were closed.

### Limits and remaining repository issues

- The full suite is not green: all 96 failures above are proven pre-existing. Scope-specific tests pass; no claim is made that unrelated repository failures are resolved.
- The existing production chunk-size warning remains. This change adds no dependency or heavy runtime.
- No physical devices, Safari/Firefox, production data, backend, native mobile, OCR or migrations were tested. Those implementations were unchanged. There is no lint script, so no lint pass is claimed.
- Independent integrity review and its focus-change follow-up found no unresolved introduced defect.

### Follow-up: compact project warnings, 2026-10-28

The user reported long diagnostic paragraphs expanding project rows and clarified that dashboard cards must not contain long content. This is a bounded presentation correction within the approved redesign; the existing source-note requirement is retained through a short indicator and project disclosure. The separate estimate/vendor-handoff specification remains pending and was not implemented.

- `PMDashboardProjects.tsx` now renders only **Details need review** when issues exist, in both list and grid. The raw issue array and internal line IDs are no longer printed in dashboard projects.
- `ProjectManagerWorkspace.tsx` preserves all overview issues in an initially collapsed **Project details to review** disclosure under the opened project's heading, available in tabs and full-detail mode. This also keeps aggregate notes that are not repeated by an individual tab discoverable.
- Workspace tests cover several long overview-only diagnostics, both views, closed/open disclosure behavior, full-detail retention, and no indicator for clean projects. The operational-access test fixture now includes the existing required `issues` and `activeAlerts` fields. Native summary keyboard activation was verified in Chrome; JSDOM interaction coverage uses click because its native Enter activation is not implemented.
- Independent integrity review found no introduced defect. Independent final verification: `npm test -- src/features/project-manager src/app/router.test.tsx src/app/routePaths.test.ts` passed **342 tests in 8 files**; `npm run typecheck` and root `git diff --check` passed. Parent `npm run build` passed after the final product edits, with the existing chunk-size warning. Subsequent edits were tests/documents only.
- Inspected real-shell synthetic screenshots of desktop list/grid at 1440px, mobile grid at 390px and mobile list at 320px. No raw diagnostics in dashboard content; no document overflow in measured 1280/390/320px checks. A desktop list row measured 79.5px. Verified the project disclosure starts closed and Enter opens it to the original note. Browser console: zero errors and warnings.
- Local screenshots: `/tmp/lisno-pm-compact-qa/desktop-list.png`, `desktop-grid.png`, `mobile-grid.png`, `mobile-list.png`, and `project-details-expanded.png`. Temporary CLI logs/snapshots are under `/tmp/.playwright-cli/`. No runtime artifacts were added to the repository.
- No backend, permissions, dependencies, financial values, production data, deployment or migrations changed. Full frontend suite, backend/OCR and physical-device checks were not repeated for this presentation-only correction; earlier unrelated suite failures remain as documented above. No lint script exists.

### Follow-up: independent dashboard scrolling, 2026-10-28

The user explicitly requested separate scrollbars for Priority alerts and All projects when their content grows. This scoped dashboard refinement replaces the original normal-flow-only content requirement, while keeping the overall page scrollable.

- `ProjectManagerWorkspace.tsx`: independent named, keyboard-focusable scroll regions around alert items and project results. Section headings, view controls, refreshed timestamp and pagination remain outside the scrolling content. Relevant filters, page and project view changes reset the region to the top; periodic data refresh preserves its DOM and scroll position.
- `project-manager-dashboard.css`: shared responsive content cap `clamp(16rem, 60dvh, 42rem)` with a vh fallback, native automatic overflow, styled 12px WebKit scrollbars, focus-ring insets and sticky desktop table headings. Mobile retains the stacked project presentation and independent scrolling. Short/empty regions retain natural heights.
- Existing workspace regressions now also verify the named focusable regions, controls outside scrolling content, and scroll reset on project view/alert page changes. `npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx` passed **42 tests in 2 files**. Final `npm run build` passed after the last CSS adjustment, including TypeScript compilation; the existing chunk-size warning remains. Root `git diff --check` passed.
- Real-shell synthetic browser QA used 31 projects and 81 alerts, with 20 projects and eight preview alerts displayed initially. At 1920x1080 both regions capped at 648px and overflowed independently. Keyboard Page Down scrolled alerts without changing projects/page, and later moved project scroll from 100px to 639px while alert scroll remained 70px. The sticky column header and scroller top aligned exactly after correcting the 5px inset.
- Checked list/grid, 390px and 320px layouts, native scrollbar styling, filter reset, and no-match results. Mobile had no document horizontal overflow. At 320px the regions capped at 480px; empty alert/project results instead measured 73px/126px. Grid switching reset only project scroll. Browser console reported zero errors/warnings. Inspected saved desktop/mobile screenshots.
- Evidence: `/tmp/lisno-pm-scroll-qa/`, including `pm-scroll-desktop-final.png`, `pm-scroll-mobile-grid.png`, `pm-scroll-mobile-list.png` and task-specific browser snapshots/logs. The CLI's npm lookup hit sandbox DNS failure and was retried with the required escalation; final checks used the available browser tool after CLI session instability.
- No backend/API, permissions, dependencies, records, deployment or migrations changed. Full-suite, backend/OCR, physical-device and cross-browser checks were not repeated for this bounded change. No lint script exists. The separate estimate/vendor-handoff specification remains pending.

# Project Manager project-detail consistency implementation plan

Date: 2026-10-28
Status: Implemented; scoped local verification complete (2026-10-29), with baseline test failures recorded below
Specification: [Project-detail visual consistency](../specs/2026-10-28-project-manager-project-detail-consistency-design.md)
Specification approval: User replied “Approved” after the specification gate on 2026-10-28. This approval is recorded here without changing the approved specification's requirements.
Execution mode: A, parallel sub-agents, selected by the user on 2026-10-29. Task plan approved in the immediately preceding gate.

## Outcome and boundaries

Bring the opened Project Manager / Site Manager project into the dashboard's ivory/olive visual system. Redesign the header, navigation, Site progress summary and room/trade presentation; keep long technical notes collapsed and make trade rows readable on mobile.

The existing eight sections, source-backed values, API-derived actions, stable-ID links, full-detail handoff, loading/error/access boundaries and mutation guards remain intact. Other sections receive consistent presentation around their existing workflows. No backend/API/type contract, permissions, financial calculation, dependency, asset generation, data migration, deployment or operational workflow change is planned. The separate estimate/vendor-handoff specification remains pending and is not implemented by this plan.

## Current evidence and preservation baseline

- `ProjectManagerWorkspace.tsx` owns both the recently redesigned dashboard and `ProjectManagerProjectPage`, plus local `SitePanel` and `Room` components. New work must be limited to the project branch and required imports; dashboard behavior is already modified in the worktree.
- The project shell uses `pm-workspace`, `pm-project-heading` and shared styles. Site displays `room.description` directly. `PMIssues` expands one or two notes by default, so changing it globally would alter counterpart screens.
- `PMProgressBar` and `PMProgressBasis` already preserve null versus numeric zero and explain the source-backed measurements. Reuse their logic.
- `PMRequestsPanel` is shared with Procurement/Designer. Scope new presentation to this PM project surface and keep any shared-helper option backward-compatible.
- Existing workspace tests cover dashboard return URLs, targeted alerts, full-detail entry, assignment-only links and unavailable KPI policy. Existing operational suites cover actual actions beyond the mocked panel components in the workspace suite.
- The enterprise transport has an explicitly enabled PM fixture, overview/site responses and a local error/denied event. Its existing Site fixture has one simple room; extend it through an opt-in scenario for meaningful rendered checks.

The dirty-path set at plan preparation is:

| State | Existing paths to preserve |
| --- | --- |
| Modified | `frontend/src/app/router.test.tsx`; `frontend/src/features/project-manager/ProjectManagerOperationalAccess.test.tsx`; `frontend/src/features/project-manager/ProjectManagerWorkspace.test.tsx`; `frontend/src/features/project-manager/ProjectManagerWorkspace.tsx`; `frontend/src/test/fixtures/enterpriseTransport.test.tsx`; `frontend/src/test/fixtures/enterpriseTransport.ts` |
| Untracked existing product/fixture work | `frontend/src/features/project-manager/PMDashboardIcon.tsx`; `frontend/src/features/project-manager/PMDashboardProjects.tsx`; `frontend/src/features/project-manager/project-manager-dashboard.css`; `frontend/src/test/fixtures/enterpriseProjectManagerData.ts` |
| Untracked existing documents | Dashboard reference-redesign spec and plan; estimate/vendor-handoff spec; approved project-detail consistency spec |

Only this task-plan file is created at this stage. Before implementation, capture fresh status, per-target diffs and copies/checksums of relevant untracked files in a temporary directory. Review all pre-existing changes before assigning a dirty path. Do not stage or revert them. Previously completed dashboard compact notes and independent panel scrolling are explicit regression boundaries.

## Ownership and dependency order

Keep one parent task in progress. Mode A may run the bounded child slices in T2 concurrently after T1 settles their shared markup contract. Mode B performs the same slices inline. No agents are started at this plan gate.

| Task | Depends on | Owner in Mode A | Owned paths / deliverable | Acceptance |
| --- | --- | --- | --- | --- |
| T0: Capture baseline | Plan approval and execution choice | Primary | Temporary baseline evidence; this plan's status | A8 |
| T1: Project markup and shared presentation contract | T0 | Primary | `ProjectManagerWorkspace.tsx`; `PMShared.tsx` only if an opt-in note option is necessary; stylesheet import and documented DOM/class contract | A2–A5, A7–A8 |
| T2a: Responsive visual styling | T1 | `frontend_implementer` | New `frontend/src/features/project-manager/project-manager-project-detail.css` only | A1, A3, A6, A8 |
| T2b: Real-route synthetic QA scenarios | T1 | Separate `frontend_implementer` | `enterpriseProjectManagerData.ts`, `enterpriseTransport.ts`, `enterpriseTransport.test.tsx` under `frontend/src/test/fixtures/` | A1, A4, A6–A8 |
| T2c: Focused behavioral regressions | T1 | Separate `frontend_implementer` | `ProjectManagerWorkspace.test.tsx`, `ProjectManagerOperationalAccess.test.tsx`; add a focused PM shared-helper test only if the optional helper API changes | A2–A5, A7–A8 |
| T3: Integration and rendered review | All T2 writers finished | Primary | Integration fixes in released paths; relevant router-test adjustments only if needed; temporary screenshots and interaction evidence | A1–A8 |
| T4: Integrity review | T3 | `integrity_reviewer`, read-only | Scoped final-diff findings with exact evidence; primary resolves confirmed findings | A2–A8 |
| T5: Final verification and handoff | T4 resolved | `verification_runner`, then primary | Integrated checks, temporary QA evidence, this plan's completion record and concise user handoff | A1–A8 |

Every writer receives explicit file ownership, the approved specification, current target diffs and the instruction: other agents are working in the same repository; do not revert their edits or cross the assigned boundary. Report dependencies to the primary agent. All three T2 slices can run concurrently without exceeding three child agents plus the primary. Review and final verification run after writers release their files. In Mode B, the primary performs review and verification sequentially without implementation subagents.

## Task details

### T0. Establish the implementation baseline

1. Reconcile current code and worktree with the approved specification and this plan; preserve subsequent user edits.
2. Run the focused existing PM workspace and operational-access tests once before editing. Record failures accurately rather than treating historical results as current evidence.
3. Capture the current project and dashboard at representative desktop/mobile widths using the existing opt-in synthetic transport. Keep screenshots outside product sources.
4. Record the current DOM and route behavior for full detail, all eight sections, KPI and return navigation. Stop only if a newly discovered material scope/contract decision requires a revised approved document.

### T1. Implement the bounded project structure

1. Add a dedicated project-detail root class and explicit header, navigation, tab-content and Site scopes. Retain the existing component boundaries unless a small local extraction materially improves readability. Add the new stylesheet import after the shared stylesheet; do not rewrite the dashboard.
2. Organize the header into back navigation, project identity/health, client/location, labelled approved net value and handover, and KPI/full-detail actions. Reuse formatting helpers and the existing decorative interior asset. Missing values keep their established truthful labels.
3. Retain the project-review disclosure and exact messages. Keep it available in full-detail mode. Preserve native disclosure state through ordinary polling rerenders.
4. Keep eight actual navigation links with `aria-current="page"`, current URL builders and query-state behavior. Provide a local horizontal navigation rail on narrow screens, with active and keyboard-focused links reachable.
5. Structure Site as one compact overall progress surface, labelled planned/verified/accepted facts, collapsed measurement explanation and collapsed Site source notes. If `PMIssues` needs a presentation option, preserve existing defaults for all other callers and document the option before T2 starts.
6. Give rooms consistent padding and move their full descriptions into initially collapsed “Room details to review” disclosures. Preserve trade IDs, assignment links, short operational reasons, status, vendor, exact progress and separate verification facts. Provide an explicit disclosure for any long trade description instead of exposing a diagnostic paragraph or silently clipping it; do not infer backend status from arbitrary text.
7. Prepare one semantic rendering of each trade that adapts from desktop columns to labelled mobile rows. Do not render duplicate actions/progress controls or replace native links and disclosures with click-only containers.
8. Leave the embedded execution workspace and portal dialogs outside the new Site/table selectors. Preserve the `PMQueryState` boundaries and existing source/version/action guards.
9. Share the final class names, accessible names, mobile row labels, helper option and fixture needs with T2 writers. Primary retains ownership of production TSX during their work; any requested change is coordinated explicitly.

### T2a. Apply scoped visual styling

- Match the approved dashboard tokens, Poppins scale, spacing rhythm, restrained borders/radii and action treatment. Use a shallow header with a solid reading area and decorative imagery at its edge; reduce/remove the image at narrow widths.
- Style the project shell and tab surfaces through explicit project selectors. Avoid broad shared `.pm-workspace`/table/button overrides, global shell changes or selector leakage into full detail and dialogs. Preserve semantic severity treatments.
- Align the overall progress/facts surface, room headings and trade columns. Make long names and expanded diagnostics wrap safely, including unbroken technical identifiers inside disclosures.
- Remove the shared 640px table minimum only within the redesigned Site region. Use readable labelled rows on mobile, visible focus and appropriate touch targets. Verify semantics if CSS changes table display behavior.
- Keep the page in ordinary vertical flow. Do not add nested vertical room scrollbars or change the dashboard's existing independent panel scroll regions. Navigation scrolling remains local.
- Respect reduced motion; add no hover animation, dependency, generated asset or new icon system.

### T2b. Extend deterministic rendered fixtures

- Add an explicitly enabled project-detail fixture variant through the existing enterprise PM transport, preserving current dashboard/default scenario output.
- Include multiple rooms and trades; long project, room, vendor and scope names; long overview/Site/room diagnostics; short operational reasons; unequal actual/planned values; separate verification states; zero and unavailable values. Use synthetic identities and stable project/assignment IDs only.
- Include no-work and source-unavailable project states without removing the project overview itself. Retain or extend existing local loading/error/denied controls where necessary for rendered checks.
- Support genuine existing route handoffs needed for QA rather than inserting a static screenshot page. Use existing fixtures where possible; do not invent production endpoints or modify live data.
- Test that the new scenario is opt-in and existing dashboard scenarios and transport cleanup are unchanged.

### T2c. Extend behavioral coverage

- Verify labelled header values, health, missing metadata, null versus 0% progress and unequal overall/room/trade values. Check one accessible progress indicator and Open link per applicable trade.
- Verify project, Site and room diagnostics are initially collapsed, exact messages are reachable on expansion, short operational reasons remain visible, and native open state survives an ordinary data refresh. If the shared helper changes, explicitly verify its old default behavior for other consumers.
- Preserve assertions for all eight sections, safe filtered/grid dashboard return URLs, encoded entity IDs, tab offsets, stable assignment IDs, assignment-only legacy links, KPI availability and full-detail/back navigation.
- Exercise loading, initial error/retry, empty Site, stale successful data and post-success 401/403/404 denial on the project surface. Assert protected content and actions disappear after denial.
- Retain the completed dashboard compact-note, focus, URL-state and independent-scroll assertions. Use existing operational suites to verify actual request/operations actions, rather than relying solely on mocked tabs in workspace tests.
- Prefer assertions on user behavior and accessible structure. Do not add snapshot/class-string tests solely to mirror CSS.

### T3–T5. Integrate, review and verify

Review all T2 diffs against captured pre-existing work, resolve integration problems, and inspect the actual app. After writers finish, run the integrity review, resolve its findings, then run final verification on the integrated worktree. Any product edits made in response to verification require rerunning their affected checks.

## Verification and acceptance trace

From `frontend/`, first run the focused implementation suites:

```sh
npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx src/test/fixtures/enterpriseTransport.test.tsx
```

Then run the affected consumer/navigation suites:

```sh
npm test -- src/features/project-manager/PMRequestsPanel.test.tsx src/features/project-manager/PMOperationsPanel.test.tsx src/features/project-manager/PMClientPanel.test.tsx src/features/project-manager/PMNotifications.test.tsx src/app/router.test.tsx src/app/routePaths.test.ts
npm run typecheck
npm run build
```

Include any added focused helper test in the final test command. From the repository root, run `git diff --check` and `git status --short`. There is no lint script. A full frontend suite is required only if integration expands into shared behavior beyond the scoped surface; otherwise the focused/consumer suites, typecheck, build and rendered matrix are the verification lane. Investigate failures and compare with the captured baseline as necessary; do not label them pre-existing based only on past test counts. Backend/OCR checks are out of scope because those systems are unchanged.

| Acceptance | Required integrated evidence |
| --- | --- |
| A1: Visual consistency | Project/dashboard comparison at 1440 and 1920px; actual app shell, matching colours/type/controls, no decorative imagery presented as a project photo |
| A2: Header and actions | Exact source-backed labels/values, unknowns, My KPI and unavailable policy, full-detail/back, exact safe return URL |
| A3: Compact diagnostics | Long and unbroken notes hidden initially but fully readable in keyboard-operated disclosures; one-note and multi-note cases; no default raw IDs in room/trade content |
| A4: Truthful progress | Unequal actual/planned/room/trade values, 0 versus null, separate verification counts/facts and unchanged measurement explanation |
| A5: Navigation and workflow | All eight sections, representative request and operation actions/guards, encoded entity and assignment deep links, target-page behavior, legacy handoff and full-detail visual isolation |
| A6: Responsive/accessibility | 320, 390, 768, 1024, 1440 and 1920px; 200% zoom; long names/many trades; no document horizontal overflow; local nav keyboard scrolling; reading order, names, focus, contrast and touch targets; image-failure/reduced-motion smoke checks |
| A7: Query states | Loading, initial error/retry, no work, stale data, unavailable source, post-success denial; console/network inspection distinguishes intended fixture errors from regressions |
| A8: Preservation | Dashboard list/grid and independent scrolling, representative shared Procurement/Designer consumer, operational dialogs, original fixture defaults and final dirty-path/diff reconciliation |

Rendered QA must use synthetic local data. Check native Enter/Space disclosure operation in the real browser rather than assuming JSDOM implements it. Inspect screenshots as well as DOM geometry. Verify only local navigation scrolls horizontally, trade semantics remain understandable, and page-level overflow is absent. Record exact commands, pass/fail counts, viewport/state coverage and remaining limitations. Store temporary screenshots/logs under `/private/tmp/lisno-pm-project-detail-qa/`; remove or relocate only task-generated runtime artifacts from the repository. Stop task-owned development servers when finished.

## Completion and rollback

Completion requires A1–A8 evidence, resolved material review findings and an inspected integrated diff. Update this plan with checks actually run and their results. The handoff names affected files, principal presentation decisions, validation, unrun checks and any remaining risks. No migration, external mutation, staging, commit, push or deployment occurs under this plan.

Rollback is limited to this task's project markup, scoped stylesheet, optional helper option and scenario/test additions. Use the captured baseline to preserve all earlier dashboard, compact-note, scrolling and unrelated edits; never reset entire dirty files to HEAD.

Execution record: T0 complete. Captured initial dirty files and diffs under `/private/tmp/lisno-pm-project-detail-qa/baseline/`. Baseline focused workspace/operational suites: 42 tests passed across 2 files. Captured current project at 1440px and 390px. T1 complete: scoped project markup, semantic responsive trade structure, native room/work disclosures and Site-only `PMIssues` opt-in. T2–T5 complete: separate stylesheet, fixture and test owners finished; integrated changes received a read-only integrity review and final verification. Read-only navigation/access audit confirmed the existing invariants; no contract changes were needed.


## Final implementation and verification record, 2026-10-29

### Delivered

- `ProjectManagerWorkspace.tsx`: project-scoped header, labelled metadata, navigation rail, compact source-backed progress facts, padded rooms, collapsed room/work diagnostics and a single semantic responsive trade rendering. Existing routes, eight sections, assignment IDs, KPI, full-detail handoff and query boundaries retained.
- New `project-manager-project-detail.css`: dashboard-matching ivory/olive styling, existing decorative artwork, responsive trades/navigation, accessible focus/touch targets and isolated theme mappings. Fixed two rendered defects during QA: mobile titles retaining desktop column width and decorative header artwork extending outside its border.
- `PMShared.tsx`: backward-compatible `collapsedByDefault` option for Site notes. Other callers retain the existing note defaults.
- Workspace/operational tests and new `PMShared.test.tsx`: source-backed values, null/zero, note state, route targets, real assignment handoff and query states.
- Enterprise fixture module/transport/tests: opt-in `qaProjectDetail=ready` rich rooms/trades and matching execution reads, preserving existing default dashboard scenarios.

No backend contracts, dependencies, lockfiles, financial calculations, authorization rules or mutations changed. Baseline comparison confirmed unchanged dashboard functions/components/CSS, shared `project-manager.css`, return URL helper and router-test contents. The pending estimate/vendor workflow was not implemented.

### Exact integrated checks

All commands listed in the verification section ran, with `PMShared.test.tsx` added to the first command.

| Check | Result |
| --- | --- |
| Focused Workspace, OperationalAccess, PMShared and enterpriseTransport suites | 128 passed, 3 failed across 4 files |
| Consumer suites: PMRequestsPanel, PMOperationsPanel, PMClientPanel, PMNotifications, router and routePaths | 300 passed across 6 files |
| Combined integrated tests | 428 passed; 3 confirmed pre-existing failures; no new failures |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; existing Vite warning about chunks exceeding 500 kB |
| `git diff --check` | Passed, including after artifact cleanup |
| Read-only integrity review | No confirmed defects; preserved navigation, source values, denial boundaries and shared-consumer isolation |

The 3 fixture failures are the protected client workflow-document selector and two Procurement gallery selectors (`/procurement`, `/home`). Restoring the saved pre-task files in an isolated harness reproduced the same failures. Evidence is `/private/tmp/lisno-pm-project-detail-qa/fixture-baseline-test.log`. They were not changed as part of this redesign.

### Rendered evidence and limits

- Actual application shell checked at 320, 390, 768, 1024, 1440 and 1920px: no document horizontal overflow. Long project/vendor/trade names, 3 rooms/8 trades, zero/unavailable progress, empty work and expanded notes were exercised.
- Keyboard Enter/Space disclosures, visible focus, mobile navigation scrolling, all eight sections, KPI, exact alert/assignment targets, actual assignment drawer, Back to project tabs and exact dashboard return URL were checked.
- Loading, initial error, stale refresh and post-success denial were rendered. Denial removed project header, rooms and KPI; stale refresh retained data with warnings.
- 200% CSS zoom/reflow checked without overflow. axe reported no violations in checked project and assignment-drawer states. CSS zoom was used, not a browser-native zoom command. axe's asset-preload warning did not correspond to an application error.
- Full-detail retained its original theme tokens. The dashboard still had independent 600px alert/result scroll regions with unchanged document scroll. Normal dashboard console had zero errors/warnings.
- Shared Procurement/Designer preservation is supported by scoped-source review, unchanged shared stylesheet and shared/operational tests. The stock Procurement browser fixture did not expose PMCounterpartPanel, so that counterpart itself was not visually exercised. No claim of complete accessibility or cross-browser conformance is made.
- No full frontend suite, backend suite, OCR suite or lint command ran; there is no lint script. Testing stayed within the approved frontend presentation and affected-consumer scope. No live records, migration, staging, commit, push, deployment or external communication occurred.

Final logs, baseline evidence and synthetic screenshots: `/private/tmp/lisno-pm-project-detail-qa/`. The complete rendered record is `rendered-verification.md`; command logs are `final-focused-tests.log`, `final-consumer-tests.log`, `final-typecheck.log` and `final-build.log`. Task-generated browser screenshots/logs were moved out of the repository. The task-owned Vite server and browser were closed. Ignored build output remains in `frontend/dist`.

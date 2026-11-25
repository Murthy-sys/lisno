# Super Admin project details simplification: task plan

Date: 2026-11-24
Status: Complete and locally verified on 2026-11-24. Specification and task plan approved; executed in Mode A.

Source of truth: [Approved specification](../specs/2026-11-24-super-admin-project-details-simplification-design.md). Both documents were approved before implementation.

## Outcome and constraints

Super Admin gets three clear project views: **Project details**, **Client persona**, **Assignments**. Assignments offers Designer, Procurement and Project Manager. The existing stage/owner chip, completion action and chat navigation remain. Finance, workflow, Client responses and Trade teams stay accessible under **More project tools**.

Frontend only. Reuse the current project response and existing editors/mutations. Preserve ordinary Admin rendering, permission gates, approval/financial lineage, query invalidation and the previous removal of project progress displays. No new dependencies, backend/API changes, migration, commit, push or deployment.

## Ownership and dependencies

Keep one parent implementation task in progress. In Mode A, T2 and T3 can run independently after T1 settles their interfaces; the primary can implement T4 concurrently on separate files. In Mode B, execute these same slices inline. No agents start before the execution-mode gate.

| Task | Depends on | Owner in Mode A | Owned files/responsibility | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T1: Baseline and interfaces | Implementation authorized | Primary | Baseline capture; project/role boundary, view state and props agreed before writers | AC1–AC6 |
| T2: Client persona presentation | T1 | Frontend agent 1 | New `ProjectClientPersona.tsx` and its focused test in `features/admin/`; no shared stylesheet or page edits | AC2, AC5, AC6 |
| T3: Primary assignment presentation | T1 | Frontend agent 2 | `ProjectPeopleAssignments.tsx` and a focused test; narrowly necessary optional presentation props in existing assignment editors and their tests | AC3–AC6 |
| T4: Page composition and secondary tools | T1; integrates T2/T3 | Primary | `AdminProjectDetailPage.tsx`, its integration test, `admin-project-detail.css`, and a focused Super Admin composition component if needed | AC1, AC3–AC6 |
| T5: Integrated integrity review | T2–T4 stopped | Integrity reviewer; primary resolves findings | Read-only integrated review; corrections returned to each file owner | AC1–AC6 |
| T6: Final verification and handoff | T5 resolved; writers stopped | Verification runner plus primary browser QA | Focused checks, typecheck/build, rendered QA, documentation and cleanup | AC1–AC6 |

Every writer must be told that they share a worktree, must preserve others' edits, and may not change files outside their assignment without coordination. The primary owns all shared styles, the page integration test, contracts between components, and final reconciliation.

## T1. Capture baseline and settle small component interfaces

1. Capture `git status --short`, relevant per-target diffs and copies immediately before implementation. Planning inspection found only the new specification untracked; recapture rather than assuming that remains true.
2. Keep the project-loading/error/permission behavior on the existing route. Isolate Super Admin composition from ordinary Admin so the redesign does not quietly change other callers.
3. Define the three primary views, selected assignment responsibility, secondary-tool selection and visited-panel state. State belongs to the current project identity and resets on project change.
4. Agree on a read-only persona component accepting the current `AdminProjectSummary` (or a typed pick of its existing fields) with no API queries or mutations. Use shared language/category constants and calendar-date validation.
5. Agree on an optional simplified presentation for `ProjectPeopleAssignments`, preserving its existing default behavior for ordinary Admin. The primary version shows Designer, Procurement and Project Manager in that order and excludes Trade teams, which the page mounts under More project tools.
6. Use mount-on-first-visit behavior for editors/tools, preserving mounted draft state while hidden. Hidden content must be removed from keyboard navigation. Do not mount the ordinary Admin sidebar/coordination reads for Super Admin merely to compute a removed duplicate team list.
7. Reuse existing approved estimate labels, total/source checks and formatter behavior. Do not introduce new financial derivation or duplicate an assignment mutation.

T1 is read-only/interface work until implementation authorization; it does not require an extra product decision beyond the approved specification.

## T2. Present captured Client persona

1. Implement a compact field list for Client name/email/mobile, native place, preferred/known languages, self-use/rental purpose, tentative budget text and tentative closure date.
2. Label missing values clearly, handle unknown legacy enum values without inventing a value, and format calendar dates without timezone shifts or invalid-date exceptions.
3. Keep captured budget text distinct from numeric budget range and approved quotation total. Do not interpret closure date as expected completion.
4. Use the primary's agreed scoped field-list classes; no new stylesheet or global design system.
5. Focused tests cover a populated record, absent historical fields, invalid/empty dates, long text and switching to a differently identified Client. Verify semantic labels and absence of invented preference fields.

## T3. Simplify assignment navigation while preserving operations

1. Add the agreed opt-in presentation to `ProjectPeopleAssignments`; keep ordinary Admin defaults unchanged.
2. Present the three primary responsibilities clearly, with one visible editor. Retain the existing authorized read-only/blocked states and role-specific option lists.
3. Reuse `DesignAssignmentPanel`, Procurement-scoped `WorkerAssignmentPanel`, and canonical `ProcurementProjectIdentityPanel` with its existing fallback. Keep initial approval/design locks, reasons, version checks, project/estimate identity checks and cache refresh behavior.
4. Mount editors only after their first visit. Keep selected people and entered reasons when navigating away and back. Reset their state when the project changes; preserve stale-version conflict handling.
5. Do not rewrite editor internals. Add an optional presentation prop only if an existing nested wrapper materially prevents the approved simplified layout; scope it to this caller and preserve defaults elsewhere.
6. Focused rendered tests exercise the role choices, no eager unvisited requests, saved/unsaved selections, blocked and denied actions, and correct project reset. Existing editor suites remain the mutation-regression checks.

## T4. Compose the simple Super Admin project screen

1. Use the existing header with project name/Project ID, Back to All Projects, chat navigation and top-right stage/owner chip. Preserve authorized Close project and its existing readiness checks.
2. Default to Project details. Render location, property type, created date, captured budget range, one correctly sourced tax-inclusive estimate total, next action and Sales contact without duplicate sidebar facts.
3. Move internal system ID under Technical details. Remove illustrative artwork and repeated summary/team blocks from the Super Admin presentation only.
4. Integrate Client persona and Assignments with visible selected state and named content. Keep reading/focus order natural on desktop and mobile.
5. Make Manage people and Assign Designer entry points select the corresponding view/responsibility before moving focus. Support existing assignment anchors on entry and avoid targets in hidden panes.
6. Add collapsed More project tools with permission-aware choices for Finance, design workflow, vendor work, entire workflow snapshot, Client response history and Trade teams. Reuse the existing components; reveal only the selected tool and keep form drafts after first use.
7. Preserve finance baseline/source gating and Client response link eligibility exactly. Confirm closed/unvisited tools do not trigger their ledger, workflow, worker or section-assignment reads.
8. Scope styles to the Super Admin composition. Use existing fonts, muted surfaces, restrained borders and a flat field list. No new decorative icons, gradients, hover animations or cards in a three-column grid. At narrow widths, wrap selectors and stack fields without page overflow.
9. Adapt existing page tests to open the relevant view/tool before assertions while retaining their original financial, permission, completion and identity checks. Preserve assertions for the ordinary Admin route rather than replacing them with Super Admin-only tests.

## T5. Review the integrated change

Once writers have stopped, compare against the captured baseline and review:

- Facts and persona join to the current project, with no previous project's retained content.
- Existing assignment endpoints, actor/version/reason checks, permissions and invalidation remain intact; Procurement and Project Manager cannot share the wrong options or draft.
- Primary view/tool changes preserve drafts within a project, reset on a project switch and do not expose hidden focusable controls.
- Finance still distinguishes current working estimates from the approved source. Missing/mismatched approved baselines remain explicit; no recalculated or fabricated totals.
- The status/owner chip and header closure remain correct. Prior removal of project progress displays is preserved.
- Secondary controls are reachable and gated. Ordinary Admin retains its existing presentation and behavior.
- No API/backend/dependency change or unrelated cleanup entered the diff.

Fix confirmed defects only. Recheck affected paths; do not start unrelated baseline investigations or repeat broad tests without a changed dependency.

## T6. Verify and hand off

### Focused commands

From `frontend/`, run the changed page and presentation tests first, followed by the existing affected assignment/workflow preservation tests. Expected manifest:

```sh
npm test -- src/features/admin/AdminProjectDetailPage.test.tsx src/features/admin/ProjectClientPersona.test.tsx src/features/admin/ProjectPeopleAssignments.test.tsx --maxWorkers=2
npm test -- src/features/admin/DesignAssignmentPanel.test.tsx src/features/admin/WorkerAssignmentPanel.test.tsx src/features/admin/ProcurementProjectIdentityPanel.test.tsx src/features/finance/FinanceProjectWorkflowControl.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/VendorWorkProgressPanel.test.tsx src/features/project-status/ProjectStatusButton.test.tsx --maxWorkers=2
npm run typecheck
npm run build
```

If a planned presentational extraction is folded into an existing component, adjust the test manifest to the actual files and record it. Do not create redundant tests solely to retain planned filenames. Existing `AdminProjectDetailPage` tests already cover finance integrity and header completion; add new cases there only for changed behavior or a coverage gap.

From repository root:

```sh
git diff --check
git status --short
```

No repository lint script exists. Do not run backend/OCR/full frontend suites unless an actual shared dependency or unresolved defect justifies broader verification.

### Rendered verification matrix

Use real components/styles and synthetic data, with no production mutation:

| Area | Required evidence |
| --- | --- |
| Default Project details | One concise fact set, correct total source, status/owner chip, no duplicate imagery/sidebar or project progress; tools initially closed |
| Client persona | Populated and missing-field cases, long names/languages/budget text, calendar-date behavior |
| Assignments | Three distinct roles; keyboard selection; correct current owner/options; blocked prerequisite; successful synthetic save; draft preservation across primary and responsibility navigation |
| Secondary tools | Each permitted tool reachable; only visited tools load; hidden controls not focusable; finance/history/trade functionality retained |
| Project isolation | Two distinct projects with unequal totals, different Clients and assignees; switch without leaking previous content/drafts |
| Failure states | Project load/retry/denial; assignment read/save error; stale-version recovery; missing approval/baseline |
| Compatibility | Ordinary Admin route retains original composition and restrictions |
| Responsive/accessibility | Inspect 1440, 768 and 390 px; selected-state semantics, focus movement, keyboard operation, long-text wrapping, no body overflow; rendered axe check |

### Acceptance trace

- **AC1:** page integration tests and default-view/header browser checks.
- **AC2:** persona tests and populated/missing/long-content browser states.
- **AC3:** assignment component/page tests for drafts, eligibility, saved state and project switching.
- **AC4:** secondary-tool navigation and API request-count assertions, plus existing panel regressions.
- **AC5:** ordinary Admin tests, asymmetric finance/project fixtures, permission tests and integrated diff review.
- **AC6:** rendered keyboard/accessibility checks and three-width visual inspection.

Record exact commands, results, warnings, actual affected files and unrun checks. Close local browser/server sessions and remove owned temporary harnesses/screenshots/caches after recording evidence. Report ignored build outputs without staging them. Final handoff states local verification status and that no deployment or production mutation occurred.

## Approval boundary

Specification and task plan approved; user selected Mode A. Continue implementation and verification without reopening completed gates. T4 page test ownership was assigned to a third frontend agent for independent work; the primary retains source, style and integration ownership.


## Implementation and verification results

T1–T6 completed. The primary captured a fresh baseline before writers; only the current planning documents were untracked, and no target source had pre-existing edits. Three frontend agents owned persona, assignment presentation and page tests independently. The primary composed the Super Admin page and owned scoped styles. The integrity reviewer found no confirmed permission, assignment, finance-lineage or project-isolation defect. Final verification ran after source writers stopped.

### Delivered files and decisions

- `frontend/src/features/admin/AdminProjectDetailPage.tsx`: Super Admin-only composition branch, existing summary/approved finance source retained, no eager legacy coordination read for Super Admin, route/project identity check.
- `frontend/src/features/admin/SuperAdminProjectDetails.tsx`: three primary views, header/status/closure/chat integration, assignment shortcuts and lazy secondary tools; project-keyed state preserves drafts within a project and resets on navigation.
- `frontend/src/features/admin/ProjectClientPersona.tsx`: captured metadata using shared language/category/date rules; explicit missing values and unchanged tentative budget text.
- `frontend/src/features/admin/ProjectPeopleAssignments.tsx`: opt-in primary presentation with Designer, Procurement and Project Manager; original ordinary Admin defaults retained. Existing mutation editors are reused.
- `frontend/src/features/admin/admin-project-detail.css`: Super Admin-scoped flat field layout, warm surface, responsive selectors and assignment styling; tested with all production global styles loaded.
- `frontend/src/features/admin/AdminProjectDetailPage.test.tsx`, `ProjectClientPersona.test.tsx`, `ProjectPeopleAssignments.test.tsx`: rendered regression coverage for changed behavior and preserved permissions, finance lineage and draft isolation.
- `frontend/src/features/workflow/VendorWorkProgressPanel.test.tsx`: one existing success fixture corrected to include a synthetic current-submission photo. The unchanged implementation correctly rejects verification without a photo; exact submission/version assertions remain unchanged. No production vendor behavior changed.
- This plan and its companion specification record the approved requirements and verification evidence.

### Exact checks

Commands ran from `frontend/` unless stated otherwise. Counts below represent 153 distinct passing tests across 10 files; reruns are not added to the total.

| Command | Result |
| --- | --- |
| `npm test -- src/features/admin/AdminProjectDetailPage.test.tsx src/features/admin/ProjectPeopleAssignments.test.tsx src/features/admin/ProjectClientPersona.test.tsx --maxWorkers=2` | 46 passed across 3 files. Page 33, assignments 4, persona 9. |
| `npm test -- src/features/admin/DesignAssignmentPanel.test.tsx src/features/admin/WorkerAssignmentPanel.test.tsx src/features/admin/ProcurementProjectIdentityPanel.test.tsx --maxWorkers=2` | 30 passed across 3 files. |
| `npm test -- src/features/finance/FinanceProjectWorkflowControl.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/VendorWorkProgressPanel.test.tsx src/features/project-status/ProjectStatusButton.test.tsx --maxWorkers=2` | Initially 76 passed, 1 failed. Failure was the existing no-photo success fixture described above, reproduced in isolation. Other 3 suites passed. |
| `npm test -- src/features/workflow/VendorWorkProgressPanel.test.tsx --maxWorkers=2` | After the fixture correction, exit 0; all 4 passed. This resolves the only preservation-suite failure. |
| `npm run typecheck` | Exit 0 after correcting unsupported Testing Library role-query options and unreachable legacy Super Admin branches. |
| `npm run build` | Final exit 0 after scoped CSS verification; 3,387 modules, Vite 10.02s. Warning for chunks above 500 kB remains; main bundle 3,487.10 kB, gzip 961.34 kB. |
| `git diff --check` (repository root) | Exit 0. |
| `git status --short` (repository root) | Only the expected 9 source/test files and 2 planning documents changed or added. |

### Rendered evidence and acceptance trace

Local Playwright browser checks used real components and all `main.tsx` global styles with synthetic fetch responses, no live backend or production data.

- **AC1, AC4:** At 1440, 768 and 390 px, initial load made only the 4 session, authorization, project and status reads. Hidden assignment/finance/workflow tools made no eager reads. Header retained the actual stage/owner chip; default facts contained one correctly sourced estimate value. Finance, Design workflow, Vendor work, Entire workflow and Trade teams were opened successfully. Client response history/access was covered by rendered page tests.
- **AC2:** Captured persona, calendar date, missing historical values and long text rendered correctly. Missing and long-content browser checks passed; persona unit tests additionally cover invalid dates and unknown enum values.
- **AC3:** Keyboard selected the persona view, Manage people opened/focused the assignment heading, Procurement selection survived primary-view navigation, and Project Manager city edits survived responsibility changes. A synthetic Procurement save used the correct project/worker IDs at each width. Existing editor tests preserve approval locks, denied/error/stale paths and mutation contracts.
- **AC5:** Switching to a differently identified project with an unequal total reset visible persona/editor state. Page tests preserve missing/mismatched baseline and permission checks. Ordinary Admin retained its original composition and loaded without runtime errors or body overflow; visually inspected at desktop and checked at mobile.
- **AC6:** Inspected desktop/tablet/mobile screenshots. All three widths had no body overflow, no unexpected API reads or runtime errors; rendered axe checks reported 0 violations. Additional long-persona mobile screenshot inspected. Scoped CSS corrected later global-style overrides before final browser/build checks.

Temporary harness fixture issues (missing workflow arrays) were corrected only in the local synthetic response; no product behavior was changed to accommodate them.

### Limits and cleanup

Full frontend, backend, OCR and transactional integration suites were not run because this is a frontend composition change without changed shared/API contracts. No lint script exists. Verification used synthetic browser requests; no live assignment or production workflow was changed. No new dependencies, lockfile changes, migrations, commits, pushes, deployment or customer communication occurred.

QA artifacts were created under `/private/tmp/lisno-admin-simple-wr007i4b/` and temporary Playwright session logs; the browser/server were closed and owned temporary artifacts removed after recording results. The production build regenerated ignored `frontend/dist/` and normal tool caches; no generated output is staged. Remaining known warning: existing large application chunks, outside this change's scope.


## Follow-up: dropdown-only primary assignments

Status: Complete and locally verified on 2026-11-24; continued the approved Mode A UI refinement from the user's screenshot feedback.

- Primary owns `ProjectPeopleAssignments.tsx` integration, durable documents, final rendered QA and reconciliation.
- Assignment implementer owns the optional `assignmentOnly` presentation in `ProcurementProjectIdentityPanel.tsx`, compatible frontend request types/options pagination in `procurementProjectIdentityApi.ts`, and panel tests. Default behavior is preserved.
- Test implementer owns `ProjectPeopleAssignments.test.tsx`: replace editable-city draft assertions with manager-dropdown drafts, preserve role separation and project reset, assert no textboxes in the primary view.
- Reviewer checks the integrated city omission, version/permission handling and option pagination after writers stop; verification runner checks the focused panel/composition/page suites plus typecheck/build after review. Primary verifies real dropdown selection and no textbox at mobile/desktop sizes with synthetic requests.

Fresh baseline and relevant target copies captured at `/private/tmp/lisno-assignment-dropdown-yw3xlprp/`. All 11 dirty paths from the preceding completed work are preserved. No new dependency, backend change or deployment is required.


### Follow-up implementation evidence

Changed follow-up files: `ProjectPeopleAssignments.tsx`, `ProjectPeopleAssignments.test.tsx`, `ProcurementProjectIdentityPanel.tsx`, `ProcurementProjectIdentityPanel.test.tsx`, `procurementProjectIdentityApi.ts`, plus the specification and this plan. Prior task edits were retained.

The primary presentation opts into dropdown-only Project Manager assignment. The standard editor remains available to ordinary Admin. The save payload contains only `expectedVersion` and `programManagerId`; the backend's existing optional-city behavior preserves the stored city. Separate query keys prevent paginated dropdown data from colliding with the ordinary search result. Load/retry buttons make managers after the first 50 reachable without text input.

Focused implementer checks passed: `npm test -- src/features/admin/ProcurementProjectIdentityPanel.test.tsx --maxWorkers=2` (6/6) and `npm test -- src/features/admin/ProjectPeopleAssignments.test.tsx --maxWorkers=2` (4/4). Integrated read-only review found no confirmed defect.

Real-browser checks at 1440 and 390 px passed with actual components/global styles and synthetic API responses: no `input` or `textarea` in any of the three primary assignment roles, keyboard role switching, manager selection from the second page, draft retention across roles, and a save payload exactly `{ expectedVersion: 3, programManagerId: "manager-50" }`. Both widths had zero axe violations, no overflow and no runtime errors. Screenshots were visually inspected. The local browser/server have been stopped; the owned repository Playwright snapshot/log were removed.


Final integrated follow-up verification (all source writers stopped, integrity review clear):

| Command (from `frontend/` unless indicated) | Result |
| --- | --- |
| `npm test -- src/features/admin/ProcurementProjectIdentityPanel.test.tsx src/features/admin/ProjectPeopleAssignments.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx --maxWorkers=2` | Exit 0; 43 tests in 3 files passed. |
| `npm run typecheck` | Exit 0, no warnings. |
| `npm run build` | Exit 0; 3,387 modules. Existing chunks-over-500-kB warning; main JS 3,488.51 kB, gzip 961.68 kB. |
| `git diff --check` (repository root) | Exit 0. |

No full/frontend-preservation/backend/OCR suite rerun was needed beyond these affected tests. No new dependency, backend edit, migration, commit, push, deployment or production mutation occurred. Temporary preview/baseline/log artifacts under `/private/tmp/lisno-assignment-dropdown-yw3xlprp/` were removed after recording evidence; ignored `frontend/dist/` was regenerated by the build. All requested dropdown-only acceptance checks passed locally.


## Follow-up: show saved estimation location (2026-11-25)

Status: Complete and locally verified on 2026-11-25; presentation correction within the approved Mode A task.

- Read-only source trace confirmed the distinction between optional initiation `cityName` and legacy `location`. Both are already persisted separately. No schema or backend change.
- Primary owns `SuperAdminProjectDetails.tsx`, documents and final reconciliation. Preserve the existing Location value; for blank legacy location, show Project city using the authorized project identity query and explicit states.
- Frontend test agent owns only `AdminProjectDetailPage.test.tsx`, preserving all preceding changes and adding focused captured-city, legacy-location, missing/error/permission/identity coverage.
- Review the final source, then run the focused page suite, typecheck/build, and diff hygiene. Rendered interaction/accessibility coverage validates the added read-only field and retry. No new layout or CSS changes.

Baseline status/diff and both target copies captured in `/private/tmp/lisno-project-location-m6w0ci1l/`. All 14 dirty paths from preceding tasks are preserved.


### Location follow-up evidence

Affected source/test files: `frontend/src/features/admin/SuperAdminProjectDetails.tsx` and `frontend/src/features/admin/AdminProjectDetailPage.test.tsx`; this plan/specification were updated. All previous dirty edits were preserved.

The component preserves nonblank legacy Location. Otherwise it reads the current Project city's canonical stored value through the existing permission-gated identity endpoint. It validates returned project identity before caching and guards previously cached mismatches, failed refreshes and denied permissions before display. No city is inferred from an address or copied into another persisted field. Project city is read-only; dropdown assignments remain unchanged.

An independent source review reported no confirmed defect. Rendered page coverage includes saved city/loading/empty values, unchanged legacy location/no additional read, foreign identities, failed/403 refresh hiding cached values, retry, no-permission cached data, and two distinct project cities. Desktop (1440 px) and mobile (390 px) Playwright previews used actual components/global styles and synthetic requests; both displayed the saved city read-only with no overflow, no runtime errors and zero axe violations. Screenshots were visually inspected. Preview browser/server and owned repository Playwright files were cleaned up.


Final location follow-up checks (from `frontend/` unless noted):

| Command | Result |
| --- | --- |
| `npm test -- src/features/admin/AdminProjectDetailPage.test.tsx src/features/admin/ProjectPeopleAssignments.test.tsx src/features/admin/ProcurementProjectIdentityPanel.test.tsx --maxWorkers=2` | Exit 0; 47 tests in 3 files passed on the integrated source, including the response-identity guard. |
| `npm run typecheck` | Exit 0. |
| `npm run build` | Exit 0; existing warning for chunks above 500 kB. |
| `git diff --check` (repository root) | Exit 0. |

The verification agent ran the integrated tests; the primary completed the final compiler/build checks. Full frontend/backend/OCR suites were not rerun for this small read-only UI correction. No dependencies, backend changes, migration, commit, push, deployment or production mutation occurred. Temporary logs/screenshots/harness/baseline files under `/private/tmp/lisno-project-location-m6w0ci1l/` were removed after evidence was recorded; ignored `frontend/dist/` and normal build caches were regenerated. No unresolved implementation issue remains.

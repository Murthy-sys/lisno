# Designer project-only workspace task plan

Date: 2026-11-27
Status: Implemented and verified locally in approved Mode A

Source of truth: [Designer project-only workspace specification](../specs/2026-11-27-designer-project-only-workspace-design.md), approved by the user on 2026-11-27.

## Scope and authority

Remove the assigned-project sidebar, let the selected project occupy the workspace width, and resolve only the explicitly requested estimate. The existing dashboard remains the project-selection surface. Missing selection shows the dashboard prompt; an unmatched or removed selection never falls back to another project.

The user approved this plan and selected Mode A. Local implementation and verification are authorized. No backend, native, permission, API, persistence, dependency, migration, deployment, or commit work is included.

## Baseline and ownership

The worktree currently contains 35 paths from the preceding execution-choice feature plus this feature's specification. The implementation targets listed below have no current diff. Capture status and target diffs again before writing; preserve all prior changes, including the shared workflow panel and permanent choice.

| Task | Deliverable | Depends on | Ownership and boundary | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T0 | Reconfirm baseline and focused current behavior | Execution-mode choice | Primary; read-only checks and plan log | AC6 |
| T1 | Project-only page, explicit selection, navigation and regression coverage | T0 | Page owner: `DesignerDesignPlanTasksPage.tsx`, its main/furniture test files, and the single affected Designer preview scenario in `enterpriseTransport.test.tsx` | AC1, AC3, AC4, AC5 |
| T2 | Single-column layout and obsolete queue CSS removal | T0 | Primary: `frontend/src/styles/designer-design-plans.css` only | AC2, AC6 |
| T3 | Reconcile and review the integrated change | T1, T2 | Primary; bounded read-only review in Mode A | AC1–AC6 |
| T4 | Focused verification, browser inspection, and handoff | T3 fixes resolved | Primary or verification runner; no concurrent source writers | AC1–AC6 |

Keep one parent task in progress. In Mode A, one frontend implementer may own T1 while the primary performs T2. These are independent once the DOM contract below is fixed; no second implementation agent is needed for this small change. Give the child explicit paths, tell it others are working in the repository, and prohibit reverting or editing their work. In Mode B, the primary performs all work inline. Review and final verification follow implementation in either mode.

## T0: Confirm the baseline

1. Capture `git status --short` and per-target diffs. Do not assign any newly dirty file until its changes are understood.
2. Run the existing Designer page, furniture, and dashboard tests to distinguish current failures from introduced failures. Use the focused commands below; historical test counts are not current evidence.
3. Confirm queue CSS selectors have no consumers outside this page. The relevant DOM contract retains `.designer-plan-layout`, `.designer-plan-progress`, `.designer-plan-workspace`, and the selected-project region; queue/task-list nodes are removed.

## T1: Simplify the page and preserve project boundaries

1. Remove the queue heading, count, list, project-switch buttons, and unused search-parameter setter. Keep the selected-project header, controls, details, and timeline portal.
2. Select by the requested estimate ID only. Remove the first-task fallback without changing the task-list query, query scoping, APIs, or authorization.
3. Preserve loading and failed-read/retry behavior. Once the assignment response is available:
   - With a matching explicit selection, render only that project's workspace.
   - With an unmatched explicit selection, including after assignment refresh, render an unavailable state and dashboard navigation.
   - Without a selection and with assignments, show **Select a project from your dashboard** and dashboard navigation.
   - Without a selection or assignments, retain the no-assignment state and dashboard navigation.
4. Ensure missing/unmatched selection does not request project details, uploads, team information, or workflow for a different assignment. Maintain hook ordering and prevent null-task derivations from accessing stale workflow data.
5. Keep all project-dependent child keys and reset behavior. Browser back/forward or query changes must move to the correct project without carrying file inputs, stage drafts, or modal state across projects.
6. Update page-test defaults to explicitly select their fixture project. Replace sidebar-switch clicks with route navigation in the test harness; preserve existing upload, timer, status, deletion, and workflow assertions.
7. Add bounded rendered regressions for two unequal assignments, missing/unknown selection, selected-assignment removal, and route-driven state resets. Assert no other project's visible details or detail requests. Keep the prior execution-choice behavior covered by its existing tests.
8. Update the enterprise Designer drawing-preview scenario to open its existing estimate explicitly. Retain protected-image and annotation assertions. Leave unrelated transport scenarios untouched.

The dashboard and global navigation keep their current destinations; the bare workspace route deliberately presents the approved dashboard prompt. No production navigation control is added merely to support tests.

## T2: Reclaim the layout width

1. Change the layout to one `minmax(0, 1fr)` column, keeping the timeline above the selected project.
2. Remove rules exclusive to `.designer-plan-queue*` and `.designer-plan-task*`, including breakpoint rules. Remove only those selectors from grouped rules that also style project headers or upload results.
3. Retain existing responsive summary, upload, and workflow styling. Add no new visual effects, icons, dependencies, or design system.

## T3: Review the integrated result

Check the full feature diff, including tests, against AC1–AC6. Confirm there is no hidden replacement project picker, empty desktop column, fallback selection, cross-project draft retention, or change to existing workflow behavior. Inspect all navigation-dependent tests rather than deleting obsolete sidebar assertions without equivalent coverage. Resolve confirmed findings before final checks.

## T4: Verification and handoff

From `frontend/`, use this core lane before and after implementation:

```sh
npm test -- --maxWorkers=1 src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDashboard.test.tsx
```

Then run the affected protected-preview scenario and existing shared workflow checks:

```sh
npm test -- --maxWorkers=1 src/test/fixtures/enterpriseTransport.test.tsx -t 'opens the designer drawing with the protected image and saved annotation geometry'
npm test -- --maxWorkers=1 src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/ProjectExecutionChoice.test.tsx
npm run typecheck
npm run build
```

Use real browser rendering with synthetic local responses at 1440, 768, and 390 pixels. Verify:

- Only the selected project's information is visible; no assigned-project list or reserved sidebar width remains.
- The timeline and project content align, and the change introduces no horizontal page overflow.
- Dashboard return, direct link/reload, missing and invalid selection, and route changes produce the specified states.
- Keyboard navigation and focus remain usable; relevant project controls still operate and the browser console has no new errors.

The scoped frontend change does not require backend/mobile/OCR suites or another full repository suite. Broaden checks only when a new finding warrants it. If a focused test already fails, reproduce and report the baseline; do not hide it or fix unrelated product behavior.

Finish from the repository root with:

```sh
git diff --check
git status --short
```

Record exact commands/results, browser evidence and limitations, and affected files in this plan. Remove only task-owned temporary browser artifacts and close task-owned processes. Keep build artifacts ignored and preserve previous work. There is no lint script, so no lint success may be claimed. Final handoff must state that no migration, deployment, production mutation, commit, or external communication occurred.

## Progress

- Specification and task plan approved; Mode A selected.
- T0 finished: the 37 initial dirty paths (35 previous-feature paths and this feature's two documents) were recorded with content hashes. All four page/test targets and the stylesheet were initially clean.
- Baseline core command: 3 files, 57 tests passed. Baseline protected-preview scenario: 1 passed, 76 filtered out.
- T1 and T2 finished: the page resolves only the requested estimate, renders no project queue, and uses the full content width. The complete selected workspace is keyed by project and estimate to reset forms and header dialogs on navigation.
- T3 finished: independent read-only review reported no confirmed defects; scoped diff hygiene passed.
- T4 finished: final checks and browser validation passed. All 35 pre-existing dirty files matched their initial content hashes after implementation.

## Final implementation and verification record

Changed product/test files:

- `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx`: removed queue and first-assignment fallback, added missing/unavailable states, and keyed the selected workspace.
- `frontend/src/styles/designer-design-plans.css`: one content column; removed 99 lines of obsolete queue styling while preserving shared project/upload selectors.
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.test.tsx`: retained existing workflow/upload/state-reset coverage using route navigation, with explicit selection and assignment-removal checks.
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx`: opens its fixture estimate explicitly.
- `frontend/src/test/fixtures/enterpriseTransport.test.tsx`: the protected Designer preview scenario opens its estimate explicitly; other scenarios are unchanged.

Commands below ran from `frontend/` unless stated otherwise:

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=1 src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDashboard.test.tsx` | Baseline: 57 passed. Final: **61 passed**, 3 files. |
| `npm test -- --maxWorkers=1 src/test/fixtures/enterpriseTransport.test.tsx -t 'opens the designer drawing with the protected image and saved annotation geometry'` | Baseline and final: **1 passed**, 76 filtered out. |
| `npm test -- --maxWorkers=1 src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/ProjectExecutionChoice.test.tsx` | **54 passed**, 2 files. |
| `npm run typecheck` | Passed on final code. |
| `npm run build` | Passed; 3,412 modules, Vite 9.84 seconds. Existing warning about chunks larger than 500 kB remains. |
| Root `git diff --check` and `git status --short` | Passed; expected prior-feature and current-feature paths only after QA cleanup. |
| Hash comparison against initial dirty-file snapshot | All **35 previous-feature files unchanged**. |

Combined final focused coverage: **116 passing tests** across six files, with 76 unrelated preview-suite cases filtered out. Full repository/frontend suites, backend, native, and OCR checks were not run for this bounded frontend change. No lint result is claimed because there is no lint script.

### Browser evidence

Used the existing `frontend/qa/enterprise.html` harness, actual application routes/components, and synthetic authorized Designer data through Playwright CLI and local Vite on `127.0.0.1:5188`.

- At 1440, 768, and 390px, the layout has one column, workspace width matches its container, the timeline remains above it, there is no assigned-project queue, and the document has no horizontal overflow. Desktop and phone screenshots were visually inspected.
- **Back to dashboard** returns to the existing table. Keyboard activation of the second project's link opens only that project and Client; the first project's information is absent.
- A direct second-project link and reload retain the correct project.
- Missing selection shows the dashboard prompt; invalid selection shows unavailable. Both retain dashboard navigation, render no selected workspace, and issue no project/estimate detail requests.
- The existing drawing preview opens with its saved annotation, closes with Escape, and restores focus to its trigger.
- Browser logs have zero errors and warnings. Synthetic fixture requests report no unexpected endpoint, and the harness recorded no render errors.

This is browser runtime evidence with synthetic responses, not live-backend end-to-end testing. The existing fixture lacks newer workflow-source/choice fields, so its corresponding unavailable messages were expected; the unchanged shared workflow behavior is covered by the passing regression tests.

### Cleanup and external actions

Temporary screenshots/snapshots/logs were created under `frontend/output/playwright/designer-project-only/`; the browser config, daemon state, and initial hash snapshot used `/private/tmp/lisno-project-only-*`. These task-owned artifacts were removed after results were recorded. The task-owned browser and Vite preview were closed. Build output remains ignored under `frontend/dist/`.

No dependencies or lockfiles changed. No migration, seed, deployment, production mutation, staging, commit, push, or external communication occurred. There are no unresolved findings within this scoped change; live-backend browser behavior was not tested.

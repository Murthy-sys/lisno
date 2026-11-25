# Project status and owner chip: task plan

Date: 2026-11-24
Status: Specification/task plan approved and Mode A selected. Implementation, integrity review and focused verification finished. Typecheck/build/browser QA passed. The broader suite was attempted and intentionally stopped after the user's repeated concern about elapsed time; no full-suite pass is claimed.

Source of truth: [Approved specification](../specs/2026-11-24-project-status-owner-chip-design.md).

## Outcome and boundaries

Expose current project stage/status and pending-action owner in one shared, top-right header chip on the project contexts listed in the specification. Clicking it retains the current details drawer. Reuse the authorized project-status endpoint, stable identities, backend action ordering and existing query-key family.

Do not change backend contracts, permissions, stored data, financial values, workflow actions, PDFs, dependencies or lockfiles. Do not introduce a global active-project state system or polling chips on every list row. Preserve prior uncommitted Client-section removal and quotation-summary work.

## T0. Baseline and integration contract

Owner: primary. First task after execution-mode selection. Covers AC1, AC2 and AC6.

- Capture fresh dirty-path status, target diffs and relevant file copies before writers. `ClientProject.tsx` and its review test already contain the approved removal of Additional requirements and Project coordination; explicitly preserve those changes. Other dirty quotation-summary files are outside this task unless a directly relevant fixture adjustment is necessary and assigned.
- Reconcile all coverage-table entries with their actual outer header and loaded project-ID source. Include selected task/work details and active project quick views; do not mount an extra chip in each nested editor or form.
- Settle this additive frontend contract before parallel writers: `ProjectStatusButton` accepts `presentation="chip"`, with the existing button presentation as its default. `ProjectChatNavigation` accepts `showStatus={false}` where a separate header chip replaces its status trigger; default remains true and both navigation fallback branches honor it.
- Reuse `PageHeader.actions` and custom header action slots. For selected detail drawers, add an optional generic `headerActions` slot to `Drawer` if needed; `ContextPanel` already forwards its drawer props. Existing consumers without the slot keep their behavior. UI primitives must not import project business logic.
- Record each surface's outer-chip owner. Embedded execution/project views suppress duplicate parent-context triggers, while a separately opened task/detail overlay may own its own contextual chip and shares cached reads.

## T1. Shared chip, query behavior and navigation support

Owner: primary. Depends on T0. Covers AC2–AC5.

Owned paths:

- `frontend/src/features/project-status/ProjectStatusButton.tsx`, `ProjectStatusButton.test.tsx`, `projectStatus.css`; a small colocated presentation helper only if it improves clarity.
- `frontend/src/features/messages/ProjectChatHeader.tsx` and its tests; `ProjectMessagesPage.tsx` and its tests.
- `frontend/src/components/ui/Drawer.tsx` and its existing tests/styles only for the optional header slot. Any generic header-layout adjustment belongs to the primary rather than integration agents.

Work:

1. Derive display text from the matching project summary: first server-ordered action for the current stage, its named owners, additional owner/action counts, and explicit special states. Hide guessed ownership for unavailable, completed or empty evidence. Keep the full existing drawer content.
2. Fetch chip data before activation. Preserve identity-scoped keys, fresh verification in unconfirmed contexts, denied-data purging, abort handling and project/identity resets. A cached previous-project or previous-viewer response must never appear.
3. Refresh mounted header chips on mount/focus, existing invalidations and every 30 seconds while visible. Stop when hidden, unmounted or denied. Preserve default button-mode behavior for queues/lists. Reuse query deduplication rather than creating a parallel data source.
4. Provide neutral loading, initial failure/retry and explicit stale indicators as specified. Keep keyboard activation, accessible names/descriptions, Escape and return focus working.
5. Style the shared chip and header action wrapper for long labels, 44-pixel touch targets, wrapping and right alignment. Keep colors neutral and use existing tokens. Add no icons or decorative effects.
6. Add the navigation suppression option and integrate the project-message header. Preserve chat membership, registration, overview links, counts and invalidation behavior.

Shared-control tests cover active, multiple-owner/action, unassigned, scheduled, blocked, paused, completed, empty, unavailable and mismatched responses; confirmed/unconfirmed loading; transient and denied errors; two unequal projects and identities; delayed responses; polling/focus/unmount; default list-button compatibility; nested drawer focus and accessibility.

## T2. Project-page header integration

Owner: project-page agent in Mode A; primary in Mode B. Depends on T0's settled interface. May progress in parallel with T1 and T3/T4; final checks wait for T1 completion. Covers AC1, AC5 and AC6.

Own only these page components and their directly associated existing tests:

- Client `ClientProject.tsx`, `ClientProject.test.tsx`, `ClientProject.estimateReview.test.tsx`, and `ClientProjectQuickView.tsx` if still used.
- Designer `ProjectWorkspace.tsx` and its test.
- Manager/Head `ManagementProjectWorkspace.tsx` and its test.
- Admin `AdminProjectDetailPage.tsx`, its test, `AdminProjectQuickView.tsx` and its owning tests.
- Finance `FinanceProjectPage.tsx` and Procurement `ProcurementProjectPage.tsx`; add focused integration coverage where there is no existing page test.

Place the shared chip in each outer page header and pass `showStatus={false}` to existing project navigation where appropriate. Preserve all existing header actions and links. Use verified loaded project IDs, not names. Keep the Client's retained selection approval panel and prior quotation summary unchanged. No edits to shared styles/components by this owner; return any required shared change to primary.

## T3. Estimation and response-detail integration

Owner: estimation agent in Mode A; primary in Mode B. Depends on T0's interface. Parallel with T2/T4. Covers AC1, AC2, AC5 and AC6.

Owned paths and directly associated tests:

- `frontend/src/features/leads/LeadDetail.tsx` and `LeadEstimateWorkspace.tsx`.
- `frontend/src/features/estimates/ProjectQuotationWorkspace.tsx`.
- `frontend/src/features/admin/ClientResponseTaskDetailPage.tsx` when its loaded record supplies an explicit linked project ID; omit the chip for unlinked records rather than inventing a lookup.

Use the loaded lead/record project ID and retain a single outer-header chip across estimate tabs and review/history views. Suppress only the duplicate navigation status control. Preserve totals, PDF controls, draft edits, approval actions and historical snapshot semantics. Keep the chip separate from the historical estimate's saved data: it describes current project status. Do not modify financial presentation helpers or submitted-quotation summary components.

## T4. Execution, Project Manager and selected-task integration

Owner: execution agent in Mode A; primary in Mode B. Depends on T0's interface. Parallel with T2/T3. Covers AC1, AC2, AC5 and AC6.

Owned components and directly associated tests:

- `features/project-manager/ProjectManagerWorkspace.tsx`, `ProjectManagerEstimationsPage.tsx`.
- `features/site-manager/SiteManagerProjectPage.tsx`, `SiteManagerProjectActions.tsx`.
- `features/execution/ExecutionWorkspace.tsx`, `ExecutionDetailPanel.tsx`.
- `features/workflow/OperationalTaskQueue.tsx`, including its selected-task detail panel.

Move project-specific status visibility into the outer project header, outside optional menus. Respect existing embedded/full-detail flags so PM tabs, full execution and site views do not show duplicate chips. Add a contextual chip only to a selected work/task detail with an explicit project ID. Keep vendor/operational multi-project list controls in their default presentation and preserve all edit/dirty/close guards. Do not replace a task's own progress/owner fields with the project-summary owner.

## T5. Integrated integrity review

Owner: `integrity_reviewer` in Mode A; primary in Mode B. Depends on all writers stopping. Covers all acceptance criteria.

- Inspect the final coverage matrix and integrated diff, including prior dirty changes. Check each required project surface, single-header ownership, loaded IDs, unlinked-record behavior and default list compatibility.
- Audit summary selection, role visibility, project/identity/session changes, stale/denied/mismatched data, membership verification, polling/deduplication and delayed responses.
- Verify shared navigation suppression works with chat enabled, disabled and denied. Review drawer layering, keyboard focus, long-name layout and existing unsaved-form protection.
- Assign any confirmed fixes back to the owning slice; rerun affected focused checks before final verification.

## T6. Final verification and handoff

Owner: `verification_runner` in Mode A for integrated commands; primary for browser QA and final reconciliation. Depends on T5 fixes and all writers being stopped. Covers all acceptance criteria.

Start with focused commands from `frontend/`:

```sh
npm test -- src/features/project-status/ProjectStatusButton.test.tsx src/features/messages/ProjectChatHeader.test.tsx src/features/messages/ProjectMessagesPage.test.tsx --maxWorkers=1
npm test -- src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/designer/ProjectWorkspace.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx --maxWorkers=1
npm test -- src/features/leads/LeadDetail.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/admin/ClientResponseTaskDetailPage.test.tsx --maxWorkers=1
npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerEstimationsPage.test.tsx src/features/site-manager/SiteManagerProjectPage.test.tsx src/features/execution/ExecutionWorkspace.test.tsx src/features/workflow/OperationalTaskQueue.test.tsx --maxWorkers=1
```

Add the actual new finance/procurement/detail integration tests and any changed Drawer/ContextPanel tests to the integrated run. Keep an exact final command manifest in this plan rather than claiming coverage of unrun files. Capture relevant baseline failures before changing tests where feasible; diagnose failures and do not weaken assertions to fit the implementation.

After focused checks pass, run `npm run typecheck`, `npm test`, and `npm run build` for this shared cross-screen change. Run repository `git diff --check` and `git status --short`. There is no lint script. Backend/OCR suites are outside this frontend-only change unless new evidence justifies them.

Browser QA uses synthetic data with actual role/header styles at 1440, 768 and 390-pixel widths. Cover a standard project header, custom estimator header, PM/execution header, chat header and selected detail drawer. Check long stage/name wrapping, multiple owners/tasks, unavailable/stale states, one chip per header, keyboard open/Escape/focus, ordinary header controls, no page overflow and no runtime/unexpected network errors. Use unequal projects when navigating and verify no old owner flashes. Do not use real customer data or perform a real approval/write.

Record commands, outcomes, coverage, warnings, unrun checks and temporary output paths. Close browser/server sessions and remove temporary fixtures/screenshots/cache; ignored build output is `frontend/dist/`. No commit, push, deployment, migration, seed, email or production mutation is authorized.

## Coordination and acceptance trace

Keep one parent implementation task active. The primary owns product interpretation, shared interfaces/files, documentation and final integration. In Mode A, up to three integration agents can work concurrently after T0 while primary implements T1. Every agent must be told they share the worktree, may edit only their assigned paths, and must preserve all other changes. Shared styles, UI primitives, status logic and chat navigation remain primary-owned. Review and final verification follow integrated writes sequentially. Mode B performs the same tasks inline.

| Acceptance criterion | Evidence |
| --- | --- |
| AC1: coverage and one top-right chip | T2–T4 coverage matrix, integration tests, browser QA |
| AC2: correct status/owner/identity | T1 asymmetric fixtures, T3/T4 loaded-ID cases, T5 audit |
| AC3: complete state handling | T1 state matrix and preserved drawer tests |
| AC4: refresh/access/failure lifecycle | T1 polling, denial, stale, delayed-response and list-compatibility tests |
| AC5: responsive/accessibility/interaction | T1 focus tests, each header integration, T6 width/state matrix |
| AC6: safe scope and verified integration | T0 dirty baseline, T5 review, T6 tests/typecheck/build/diff |

The specification and task plan were approved and Mode A was selected before implementation began.


## Execution record

- T0: captured status, full tracked baseline diff and copies of dirty targets under `/private/tmp/lisno-status-chip-f5i8_ffu`. Preserved the prior Client-section removal and quotation-summary work. Settled the additive `presentation="chip"`, `showStatus={false}` and optional `Drawer.headerActions` interfaces before parallel integration.
- T1–T4 initial implementation complete: shared control/state tests passed (36); existing status/chat regressions initially passed (87); project headers passed 89 tests; estimation/response-focused suites passed 68 plus 49 collaboration tests; execution/PM/selected-task suites passed 154 tests. Some suites overlap; these are individual run results, not a unique total.
- The main LeadEstimateWorkspace suite has 19 pricing/edit failures. The estimation agent reproduced the identical 19 failure names with the unchanged HEAD component via a temporary Vite transform, preserving the shared worktree. Its other 44 tests passed. Logs are `t3-baseline.log` and `t3-workspace.log` in the QA directory.
- T5 initial integrity review found no confirmed shared status, ownership, authorization, cache, polling or navigation defect, but found seven active selected-detail coverage gaps. These remain within the approved selected-project/task scope: DesignerDesignPlanTasksPage and DesignerDashboard assigned to estimation agent; ProjectCompletionPage and ClientResponseInboxPage assigned to project-page agent; ProcurementBasketApprovalQueue, SuperAdminProjectRequestReview and SuperAdminPurchaseOrdersPage assigned to execution agent. Each agent also owns the directly associated tests. No per-row chips or extra permissions are introduced.
- Browser QA uses the real shared chip, PageHeader/ContextPanel and actual header/role styles with synthetic project data. Initial width checks found tablet chat overflow and wrapping that displaced a detail Close control; both were corrected with scoped wrapping and the optional drawer-header grid. Standard, estimator, PM, chat and detail layouts cover 1440/768/390 widths. State checks cover multiple owners/tasks, unassigned, scheduled, blocked, on hold, completed, empty, unavailable, stale and switching to an unequal project. Keyboard drawer opening/Escape/focus and browser axe checks passed; no runtime/unexpected request errors. Final integrated verification follows remaining coverage fixes and integrity recheck.
- T5 final review: all seven selected-detail coverage gaps are closed. Independent integrity review found no remaining confirmed defect in project IDs, ownership, access, stale data, list behavior, actions/totals or drawer integration. Designer selected-detail suites passed 57 tests across three files; Admin completion/inbox suites passed 15 across two files. Procurement coverage adds matching-award/project checks and unequal-project selection tests for both purchase-order review variants.
- The initial typecheck found four unsupported Testing Library `exact` options in test queries. These were removed; exact string matching already provides the intended behavior. Three initial shared-suite failures were asynchronous assertion timing in new tests, corrected with `waitFor`; the status suite then passed all 36 tests.
- Prior dirty quotation-summary files remain byte-for-byte equal to the captured baseline. The only initially dirty paths changed for this task are ClientProject and its estimate-review test, where previous Client panel removals were preserved.
- Product writers are stopped. The final verification agent owns the integrated focused suites, TypeScript check, full frontend suite and build. No backend, API, financial calculation, stored-data, dependency or lockfile changes were made.
- Final focused verification: 162 tests passed across ProjectStatusButton, ProjectChatHeader, ProjectMessagesPage, Drawer, ContextPanel, ProcurementBasketApprovalQueue and SuperAdminPurchaseOrdersPage. The first run passed 147 tests and failed 15 because the new PO test auth fixture omitted its existing approve operation. Restoring that explicit operation alongside status-read fixed the fixture; all 15 PO tests passed on rerun. Product permission logic was unchanged. This result combines the unchanged six passing suites and the corrected PO rerun.

### Final command manifest

Commands run from `frontend/` unless otherwise stated. Reporter/output flags were also used to save temporary evidence.

```sh
npm test -- src/features/project-status/ProjectStatusButton.test.tsx src/features/messages/ProjectChatHeader.test.tsx src/features/messages/ProjectMessagesPage.test.tsx src/components/ui/Drawer.test.tsx src/components/ui/ContextPanel.test.tsx src/features/procurement/ProcurementBasketApprovalQueue.test.tsx src/features/procurement/SuperAdminPurchaseOrdersPage.test.tsx --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/private/tmp/lisno-status-chip-f5i8_ffu/final-focused.json
npm test -- src/features/procurement/SuperAdminPurchaseOrdersPage.test.tsx --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/private/tmp/lisno-status-chip-f5i8_ffu/final-procurement-rerun.json
npm test -- src/features/designer/DesignerDashboard.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx --maxWorkers=1
npm test -- src/features/admin/ProjectCompletionPage.test.tsx src/features/admin/ClientResponseInboxPage.test.tsx --maxWorkers=1
npm run typecheck
npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/private/tmp/lisno-status-chip-f5i8_ffu/final-full.json
npm run build
```

The final runner may add reporter/output flags for ignored temporary logs without changing test selection. The prior estimation baseline comparison used a temporary Vite transform, without replacing or reverting the working component.

### Final results and limits

- Focused shared-control/navigation/drawer/procurement verification: **162 passed across seven suites**, combining the six unchanged passing suites and the repaired PO fixture rerun. Earlier project, estimation, execution and selected-detail focused results are recorded above and cover the remaining integration surfaces.
- **Typecheck passed**, no diagnostics. **Production build passed**, 3,381 modules. Vite warned about chunks exceeding 500 kB; no new dependency or bundle-splitting work is included in this UI task.
- Browser QA passed for five representative header types at 1440, 768 and 390 pixels, with synthetic data and real shared components/styles. No horizontal overflow after fixes, minimum 44-pixel chip target, keyboard open/Escape/focus and nested drawer behavior passed. Axe reported no violations; no runtime or unexpected network errors. This is not an end-to-end test against a live backend/account.
- The whole frontend suite was attempted, exposed failures in existing areas, and was intentionally stopped during handoff after repeated user concern about elapsed time. It exited 130 on intentional interruption. The partial log contains 69 completed files (52 passed, 17 failed), 2,594 reported tests and 140 failures. There is no completed aggregate/JSON report; these partial counts do not establish a green full suite.
- **79 failed test titles are verified pre-existing**, reproduced against original production sources: LeadEstimateWorkspace 19; KnowledgeScreens 16; AskLisnoLauncher 34; LeadEstimateWorkspace.checklist 6; LeadEstimateWorkspace.catalogue 4. The latter four baseline suites ran 226 tests with 166 passed and 60 failed. The main workspace baseline ran 63 with 44 passed and 19 failed. Current and baseline failed-title sets matched exactly. The baseline transform preserved initial dirty source copies and otherwise substituted HEAD, without reverting the working tree.
- The remaining **61 observed failures across 12 suites are unclassified**: KnowledgeModeSectionStateRemoval, enterpriseTransport, KnowledgePmcScope, VendorWorkProgressPanel, router, ClientEstimateDimensions, KnowledgeBasketCard, configuredEstimate.componentPricing, KnowledgeModeLayout, KnowledgeItemWorkspaceLayout, accessibility and ClientEstimationWorkspace. They were not fixed or labelled pre-existing without reproduction.
- Full-suite warning classes included unmatched MSW basket-request endpoints and an unawaited React `act` warning in existing knowledge tests. Backend/OCR suites were not run for this frontend-only change. There is no lint script.
- No commits, pushes, deployment, migration, seed, database changes, email or production actions were performed. Source changes remain available for local review.

- Final repository hygiene: `git diff --check` passed. `git status --short` showed 55 modified and eight untracked paths, including preserved prior work. Browser/server sessions are closed; the synthetic QA fixtures, screenshots, caches, baseline copies and logs under `/private/tmp/lisno-status-chip-f5i8_ffu` were removed after recording evidence here. Ignored build output is `frontend/dist/`.

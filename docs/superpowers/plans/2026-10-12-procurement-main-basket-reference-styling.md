# Procurement Configure Main Basket: reference styling plan

Date: 2026-10-12
Status: Completed locally and verified. Specification and task plan approved; Mode A executed.

Source of truth: [approved specification](../specs/2026-10-12-procurement-main-basket-reference-styling-design.md).

## Delivery contract

Match the supplied reference's header, basket summary strip, wider hierarchy, underlined tabs, Overview sections and footer only in Procurement's new-Main-Basket workspace. Preserve the existing editor, hierarchy actions, saving, submission, permissions and data.

Ordinary Configuration, Super Admin review, existing-parent Sub-Basket workspaces, the initial draft-name form and Add vendor panel remain unchanged. No backend, database, API, authorization, dependency or lockfile changes. No sync, migration, seed, deployment, staging, commit or push.

The existing uncommitted work is the implementation baseline. Do not reset or replace those changes. Only one parent implementation task is active; parallelism below is limited to explicitly owned slices after execution mode A is selected.

## Presentation contract

- Add `.basket-proposal--procurement-main-reference` only when the resolved workspace scope is `procurement` and target is a new Main Basket, including legacy proposals whose omitted target means new Main Basket. An unresolved target must not temporarily apply the new design to a Sub-Basket request.
- Keep existing base classes. Add local hooks for the summary strip (`basket-proposal__summary`), identity, saved state, summary actions, Main Line toolbar and footer. Keep hierarchy/tab/editor selectors rooted under the new modifier.
- Use a dedicated `procurement-main-basket.css` imported by the workspace. Importing it must have no visual effect without the modifier; no global token, role-theme or shared Drawer selector edits.
- Continue using the existing shared Overview/surface components. If necessary, add an optional `presentation="procurement-basket"` prop to provide reference-specific headings and the empty surface presentation. Forward it only from the target workspace; omitted/default behavior stays equivalent.
- Derive status from the existing dirty, saving, error/conflict, refreshing and saved-record states. Error/unsaved/saving states take precedence over saved success. Use the saved timestamp only when available and valid. Keep this local; do not add a new persistence or status subsystem.
- Keep existing Close/Save controls and `saveCurrent()` semantics. Submission/readiness remains separate. Do not add search, collapse, overflow menus or inert placeholders.
- Retain 70vw at viewport widths of at least 1200px and full available width below 1200px. Use approximately 30–32% hierarchy width only where the editor can remain usable; adapt/stack at narrower panel sizes.

## Dependency-ordered tasks and ownership

| Task | Owned deliverable and paths | Depends on | Acceptance |
| --- | --- | --- | --- |
| T0: baseline | Primary captures initial status plus full content/diffs for every intended target, including untracked proposal files; captures comparable Procurement/Configuration/admin-review/Sub-Basket screenshots and focused-test baseline in ignored temporary storage. | Approved plan and execution choice | AC3, AC6 |
| T1: freeze hooks | Primary confirms the modifier, local class names, optional presentation props and status precedence above, and communicates the same contract to both implementation owners. No backend contract changes. | T0 | AC1–AC3, AC5 |
| T2: workspace presentation | Frontend structure owner: `ProposalWorkspace.tsx`, `ProposalWorkspace.test.tsx`, and only if needed `KnowledgeOverviewPanel.tsx`, `KnowledgeModeSurfacePanel.tsx` and their tests. Owns stylesheet import, scoped modifier, semantic wrappers, header copy, real save-state display, optional headings/empty-state hooks and preserved handlers. Does not edit the new CSS file. | T1 | AC1–AC3, AC5 |
| T3: scoped styling | Frontend CSS owner: new `frontend/src/features/vendor-basket-proposals/procurement-main-basket.css` only. Implements header/summary, hierarchy, tabs, editor sections, footer, responsive states and focus styles using established tokens. Does not edit shared styles or JSX. | T1; final integration with T2 | AC1, AC3, AC4 |
| T4: integrate and review | Primary integrates the two slices and performs reference comparison. In Mode A, a read-only integrity reviewer checks selector isolation, shared defaults, status truthfulness and preserved save/submit/dirty guards. Assigned owners resolve confirmed findings. | T2 and T3 complete | AC1–AC6 |
| T5: verify and hand off | Verification owner runs final focused tests, typecheck/build, rendered interaction/accessibility checks and final diff review after writers finish. Primary records exact evidence, remaining limitations and task status here. | T4 findings resolved | AC1–AC6 |

In **Mode A**, T2 and T3 may run in parallel because file ownership is disjoint. Shared component changes belong only to T2. Unexpected hook changes are reconciled by the primary before either owner adopts them. The reviewer runs after integration; final verification follows resolved findings. No agents start during this task-plan gate.

In **Mode B**, the primary performs these tasks and equivalent review/verification sequentially inline.

All writers must preserve prior edits, stay within their assigned files and accommodate other work in the shared worktree. The primary owns this plan, the specification, integration decisions and temporary baseline evidence.

## Verification checklist

### Focused behavior and isolation

From `frontend/`:

```sh
npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx src/features/vendor-basket-proposals/ProposalMetadataDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx
npm run typecheck
npm run build
```

- Add meaningful rendered assertions for target-only presentation, omitted/default shared-component behavior, actual save-state transitions, preserved populated/empty surfaces and read-only behavior. Avoid tests that merely repeat CSS declarations.
- Exercise UOM/surface edit and save, all four tabs, dirty navigation, refresh, close/discard, metadata actions and submission readiness. Ensure a section save makes no submission/approval request.
- Check the modifier is absent for Super Admin review, existing-parent Sub-Basket requests and non-workspace entry forms.
- Run checks on the integrated final state. Compare failures with the captured baseline instead of treating older recorded test counts as current proof. Broaden only if a shared behavior change or unresolved failure warrants it; backend/OCR suites are unnecessary for this bounded presentation change.

### Rendered visual and interaction checks

Use synthetic fixtures and the real role shell, with the Configuration workspace loaded lazily. No configured database credentials or live data are needed. Reuse the prior disposable QA approach where practical, but capture a new baseline for this task.

| View/state | Required evidence |
| --- | --- |
| Target Overview, 1440px and 1920px | Compare to supplied image: visual hierarchy, summary alignment, hierarchy proportion, underlined tabs, UOM/surface sections and footer. Confirm 70vw width. |
| Target, 1024px/768px/390px | Full available width, sensible stacking/wrapping, no unintended horizontal overflow, visible labels/actions and unblocked final content. |
| Long names/multiple children/empty hierarchy | No clipping, stable selection context and usable Add/Edit/Remove actions. |
| Empty and populated surfaces | Correct content, preserved select/table behavior and accessible empty-state text. |
| Loading/error/retry/dirty/saving/saved/read-only | Truthful state, accessible announcements, stable layout and preserved button availability. |
| Nested metadata and dirty-close dialogs | Focus trap, Escape, focus return and no obscured controls. |
| Ordinary Configuration/admin review/Sub-Basket/initial form | Comparable before/after screenshots and interactions prove isolation. |

Check keyboard tab/arrow navigation and automated accessibility violations in representative desktop/mobile states. Inspect the actual screenshots, browser console and API requests. Store synthetic screenshots/logs under ignored `frontend/output/playwright/procurement-main-basket-reference/` or `/tmp`; stop only task-owned servers/browser sessions afterward.

### Repository hygiene and handoff

```sh
git diff --check
git status --short
```

Review final changes against T0's worktree snapshot, not just HEAD. Confirm no unintended shared CSS changes, missing baseline files, dependency/lockfile changes or stray runtime artifacts. There is no lint script; do not claim lint passed.

Record actual commands/results, screenshot paths, baseline failures, unrun checks and limitations. Report the changed files and preserved boundaries. No database migration or deployment is part of this delivery.

## Gate state

- Specification: approved.
- Task plan: approved.
- Execution mode: A, parallel sub-agents.
- Implementation: T0–T5 complete; integrated integrity review and final verification passed.

## Execution evidence

- Current worktree captured before writers at `/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/lisno-main-reference-baseline-mnwmnoq0` (3,172 source files, hash manifest, initial status and tracked diff).
- Initial focused frontend suite: 6 files, 79 tests passed. Log: `/tmp/lisno-main-reference-baseline-tests.log`.
- Frozen hooks follow the presentation contract; `KnowledgeModeSurfacePanel` extends its existing presentation enum so omitted/default/overview consumers stay unchanged.

### Integrated implementation and review

- Changed the workspace presentation plus optional Overview/surface presentation props. All defaults remain unchanged. New CSS selectors are rooted under `.basket-proposal--procurement-main-reference`.
- T2 owned focused tests: 3 files, 56 tests passed without React warnings (`/tmp/lisno-main-reference-structure-tests.log`).
- T4 integrity review compared the fresh worktree baseline, found no new defects, and confirmed no changed workflow, authorization or persistence contracts.
- Final focused lane: 6 files, 92 tests passed (`/tmp/lisno-main-reference-final-focused.log`). Frontend typecheck passed (`/tmp/lisno-main-reference-final-typecheck.log`). Frontend production build passed (`/tmp/lisno-main-reference-final-build.log`, Vite 8.78s). It retains the existing large-chunk advisory; remaining browser states passed as recorded below.

### Primary rendered evidence

Synthetic-only local harness: `/tmp/lisno-main-reference-qa.mts`. Screenshots and machine-readable primary evidence: `frontend/output/playwright/procurement-main-basket-reference/primary-report.json`.

- Desktop widths 1440/1920 preserve 70vw (1008/1344px); 1024/768/390 use full width. No unintended horizontal overflow. Hierarchy stacks on narrow panels. Cold Procurement did not load the Configuration workspace.
- Before/after screenshot pairs for ordinary Configuration, Super Admin review, Sub-Basket workspace and initial form have zero differing pixels after entrance animations settle.
- Saved UOM and Surface edits produced one proposal Overview PUT and no submit/decision request. Observed real unsaved, saving and saved states, with the actual persisted timestamp.
- ArrowRight/Home/End select the expected loaded tabs. Edit Main Line Escape restores focus to its trigger. Dirty tab navigation prompts to save/discard; mobile Close prompts, keeps edits or discards/closes as selected. Confirmation focus trap passed. Submission readiness and footer remain reachable on mobile.
- Browser axe scans returned no violations for empty mobile, populated desktop/mobile, Quality and mobile discard confirmation.
- Existing limitation observed and traced to baseline: initial Mode data loading disables the focused tab and can move focus to the document body. This styling change preserves that existing behavior; uninterrupted keyboard focus is not claimed.

### Final verification and handoff

- Final runner repeated the exact six-file focused command above: **92/92 tests passed**. `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- Section GET 503 showed “Configuration needs attention” with no saved timestamp. Retry restored saved data/status and a real timestamp. Delayed refresh showed loading before saved.
- Pending Main Basket was read-only: UOM/removal disabled and edit/add/save/submit controls absent. Empty hierarchy/readiness/Add action rendered correctly on 390px. Long basket/vendor/line names with four children rendered without clipped text or horizontal overflow at 1440/390px.
- All additional representative browser axe scans returned zero violations. After removing test response overrides, the final page had zero console errors/warnings and all 17 observed API requests succeeded with 200 responses.
- Screenshot pairs proving visual isolation and additional `verify-*` screenshots are retained under ignored `frontend/output/playwright/procurement-main-basket-reference/`. Primary inspected desktop, mobile, populated, error, empty and long-name images.
- No backend/OCR or repository-wide full suites were run for this bounded frontend presentation change. There is no lint script. Build retains the existing large-chunk advisory. The preexisting Mode-loading keyboard-focus limitation remains as documented above.
- Final source scope: `ProposalWorkspace.tsx`/test, `KnowledgeOverviewPanel.tsx`/test, `KnowledgeModeSurfacePanel.tsx`/test, new `procurement-main-basket.css`, and these two task documents. Baseline manifest confirms no prior source files missing and no backend/shared-CSS/dependency/lockfile changes.
- No configured local/production database changes, sync, migration, seed, deployment, staging, commit or push. Browser QA used a disposable synthetic replica set only. Task-owned browser sessions/server are closed during final cleanup.

Final cleanup confirmed: task browser sessions and synthetic server stopped successfully. Only this task’s new CLI artifacts were relocated into ignored output; all 88 preexisting tracked browser artifacts were preserved byte-for-byte. Final manifest check: no missing baseline files, exactly 6 source/test modifications plus the new scoped stylesheet and 2 task documents. `git diff --check` passed. Cross-browser and screen-reader testing were not performed.

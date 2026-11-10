# Main Line Applicable tiers toggle and grouped Mode task plan

Date: 2026-11-11
Status: revised specification and refinement plan approved; Mode A selected. R0–R3 complete. Refinement implemented and verified; original broader-suite baseline failures remain historical below. Original implementation checks below are historical.

Source of truth: [approved specification](../specs/2026-11-11-configuration-main-line-mode-group-design.md).

## Current refinement: Mode is the default screen

The approved revision removes the separate **Default Mode** choice. The main **Mode** screen opens the existing default editor, using **Mode** / **Save Mode** wording. Only enabled Signature Mode, Premium Mode and Functional Mode remain as inner choices. Returning to Mode from a tier uses the existing unsaved-change guard. No settings are merged or deleted.

This refinement supersedes the original plan's four-choice inner selector and parent-click-preserves-tier behavior. Overview switch behavior, tier functionality, prices, persistence and permissions stay unchanged. No backend, estimator, dependency, migration, commit or deployment work is included.

### R0. Preserve the current implementation

Owner: primary. After this plan is approved and A/B selected, capture the current dirty paths and relevant diffs. The eight existing changed source/test/style files contain the original implementation and must be preserved. Confirm the revised specification's requirements 6 and 8–11 and AC3 as the correction boundary. Prior test counts are background, not fresh verification.

### R1. Remove the extra choice and keep the default screen reachable

Owner: primary; exclusive product ownership of `KnowledgeItemWorkspacePage.tsx`, `KnowledgeSectionNavigation.tsx`, relevant Configuration wording in `KnowledgeOverviewPanel.tsx`, and only directly needed navigation CSS. Depends on R0. Covers AC3, AC5 and AC6 while preserving AC1, AC2 and AC4.

- Remove the fourth Default Mode choice from inner navigation. Restore Mode/Save Mode wording for the independent default editor and its summary/help.
- Entering the main Mode section opens its default editor with no tier selected. Selecting Signature/Premium/Functional keeps their existing scope, fields, save behavior and labels.
- Allow activating the main Mode navigation from a tier to return to the default editor. Keep same-screen activation a no-op when already on the default editor. Route the return through existing save/discard/cancel and in-flight-save protections.
- Keep the default screen reachable on narrow screens as well. Do not rely on a native select emitting a change when its already-selected Mode option is chosen again. Reuse the parent Mode navigation/action; do not reintroduce a fourth Default Mode option.
- Handle the default screen's unselected inner tier state explicitly: valid panel naming, a keyboard entry point to the tier choices, and no select value or ARIA reference pointing to the removed tab. Do not visually select a tier whose editor is not open.
- Preserve the stable editor wrapper, hidden-tier dirty/saving retention, current-applicability recheck inside deferred navigation, query/session identities and distinct saved values. Default remains the internal `default` scope.
- Preserve other consumers of the shared navigation component through opt-in behavior; no unrelated layout changes.

### R2. Update the narrow interaction regressions

Owner: test implementer in Mode A, primary in Mode B. Exclusive ownership of `KnowledgeItemWorkspace.configurationModes.test.tsx`, directly affected navigation assertions in `KnowledgeFoundation.test.tsx` / `KnowledgeScreens.test.tsx`, and the help assertion in `KnowledgeOverviewPanel.test.tsx`. Depends on R0 and the settled R1 interface; test writing may run alongside R1 on these separate paths. Final execution waits for writers to finish.

- Assert there is no separate Default Mode tab/option and the main Mode screen loads/saves the default scope.
- Verify all three enabled tier editors remain available and independent.
- Verify clean and dirty tier → Mode returns, cancel/discard/save, failed or in-flight saves, and no-op activation on the default screen.
- Retain regressions for dirty default edits during applicability refreshes and a destination removed during a pending guard save.
- Verify keyboard/focus, correctly named panels and the narrow-screen return path without an implicit tier selection or missing-option warning.
- Do not weaken source identity assertions or fix unrelated baseline test failures.

### R3. Review and verify the integrated correction

Owner: primary; independent read-only integrity review followed by verification in Mode A, equivalent sequential work inline in Mode B. Depends on R1/R2 complete. Covers the revised AC3 and affected AC4–AC6.

- Review only the correction delta on top of the original feature, especially parent reactivation, dirty guards, no selected tier on the default screen and the default scope's save ownership.
- Run the affected rendered tests from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts
npm run typecheck
npm run build
```

- Run directly affected KnowledgeScreens navigation cases if changed; compare any failures with the recorded baseline instead of editing unrelated behavior.
- Use synthetic browser data to check default → tier → Mode at 1280px and 390px, with a 320px overflow check. Verify no fourth choice, all tier controls still usable, keyboard focus and unsaved-change protection. Do not save real Configuration.
- Run `git diff --check` / `git status --short`. Record exact fresh results and any unrun checks, remove temporary fixtures/screenshots, and report only the requested correction. There is no lint script.

### Ownership and execution boundary

Keep one parent refinement task in progress. In Mode A, R1 and R2 may run in parallel after their labels/navigation interface is settled; product and test ownership must not overlap. Tell all agents they share the worktree and must preserve existing changes. Review and final verification follow finished writers. In Mode B, implement and verify inline without implementation subagents.

Only this task-plan file is updated at this gate. The revised specification was approved in the latest user message. Next: task-plan approval, then the A/B execution choice. No refinement product changes are authorized by approval of the previous implementation alone.

---

## Original implementation plan and execution record (historical)

The following tasks and results describe the completed original implementation, before removal of the separate Default Mode choice. The R0–R3 refinement above is the active plan.

## Ownership and parallel work

After approval and execution choice:

| Owner | Exclusive ownership | Boundary |
| --- | --- | --- |
| Primary agent | Shared navigation interpretation; `KnowledgeItemWorkspacePage.tsx`; `knowledgeWorkspaceSections.ts`; `KnowledgeSectionNavigation.tsx` if needed; scoped grouped-mode navigation/style files; integration; specification/plan records | Preserve editor scope identity, cache keys and guards. Coordinate contracts before other writers start. |
| Overview implementer in Mode A, otherwise primary | `KnowledgeOverviewPanel.tsx`, `KnowledgeOverviewPanel.test.tsx`, `knowledge-overview-table.css` | Only Applicable tiers controls/help/styles; no workspace, data-source, backend or shared contract edits. |
| Workspace regression implementer in Mode A, otherwise primary | `KnowledgeItemWorkspace.configurationModes.test.tsx`, `KnowledgeItemWorkspaceLayout.test.tsx`, `KnowledgeFoundation.test.tsx`, and directly affected assertions in `KnowledgeScreens.test.tsx` | Only tests for the settled grouped navigation contract; do not change product files, weaken assertions or rewrite unrelated tests. |
| Integrity reviewer, then verification runner in Mode A; primary sequentially in Mode B | Read-only integrated source/diff review, then checks and temporary synthetic browser fixtures | No product edits or real Configuration writes. |

All writers must be told they share the worktree and must preserve other work. Do not assign overlapping files. T1, T2 and T3 can progress in parallel after T0 establishes the interaction contract. T4 review and T5 final verification run after writers finish, in that order. Keep one parent task in progress.

## T0. Record baseline and settle navigation boundaries

Owner: primary. Depends on task-plan approval and execution choice. Covers prerequisites for AC1–AC6.

- Capture current `git status --short` and per-target diffs before writers; the specification was the only untracked file at task-plan preparation. Reconcile any subsequent work without reverting it.
- Run the existing Overview and configuration-modes tests as the focused baseline. Record pre-existing failures separately if any.
- Confirm the scope-to-editor mapping remains default, Signature, Premium and Functional with stable Main Line/revision/session identity. Parent Mode selection is a presentation grouping, not a new data source.
- Define one top-level Mode entry, distinct accessible names for outer Configuration sections and inner Mode selection, and visible inner labels Default Mode / Signature Mode / Premium Mode / Functional Mode. OFF omits the redundant single-choice selector.
- Reuse existing navigation/guard patterns where they fit. Keep default props and unrelated consumers compatible if a shared navigation component is extended. No API or shared storage contract change is authorized.

## T1. Add the Overview Applicable tiers switch

Owner: Overview implementer. Depends on T0. Covers AC1–AC2.

1. Derive switch state from the existing applicable tiers; preserve explicit empty arrays and legacy missing-field behavior on initial render/refetch.
2. ON from OFF selects all three tiers and shows the checkboxes. Keep individual selection available; deselecting the last tier turns the switch OFF and hides the choices. OFF writes an empty array only to the local Overview draft.
3. Mark only `applicableTiers` dirty and retain other payload fields. Use the existing Save Overview path; no new persistence field, automatic save or tier configuration deletion.
4. Disable the switch/choices while saving or without edit permission. Provide accessible checked state, help association, keyboard operation and focus styling using existing visual tokens.
5. Update focused Overview tests for initial ON/OFF/legacy data, switch actions, subsets, last deselection, immutable unrelated fields and permission/saving locks. Keep non-Configuration Overview presentations unchanged.

## T2. Group the existing mode editors under Mode

Owner: primary. Depends on T0; can run alongside T1 and T3. Covers AC2–AC5.

1. Collapse the top-level desktop navigation and narrow-screen Configuration section selector to one Mode entry. Separate its active presentation from the existing selected editor scope.
2. Render the compact inner mode selector only when applicable tier choices exist. Use saved Overview applicability, include Default Mode first, and mount only the chosen existing `KnowledgeModePanel`.
3. Preserve the current scoped data-source adapter and session ownership. Do not merge settings, share caches across modes, introduce default-to-tier fallbacks or change the existing pricing controls/calculations.
4. Keep the selected scope through ordinary refreshes and clicks on the already-active parent Mode tab. Use Default Mode on initial entry and when a clean current tier becomes unavailable.
5. Route inner and outer navigation through the existing unsaved-change guard. Preserve save/discard/cancel, failure and in-flight protections, and retain dirty/saving editors until safe resolution when applicability changes externally.
6. Keep save controls, mode-specific labels, status, saved summaries and error/retry actions tied to the selected scope. Protect Main Line/revision changes from stale responses or cross-line drafts.
7. Preserve read-only/archived behavior, parent and nested panel semantics, keyboard/focus handling and narrow-screen usability. Restrict CSS to the new mode grouping.

## T3. Update integrated navigation and persistence regressions

Owner: workspace regression implementer. Depends on T0's settled interface; may write alongside T1/T2, but final checks wait for integration. Covers AC2–AC6.

- Verify the outer tablist and narrow-screen selector have exactly one Mode entry. Check inner choice order, subsets and OFF/default-only presentation using scoped accessible queries.
- Exercise successful and failed Save Overview, saving OFF then ON and reloading. Assert saved hidden tier configurations are retained and unsaved applicability does not prematurely alter editor availability.
- Extend existing unequal-value fixtures across all four modes and two Main Lines. Save and reload each scope, asserting unaffected scopes/other-line data stay unchanged and requests use the intended scope.
- Cover default-to-tier and tier-to-tier dirty navigation: cancel, discard, save success, save failure and in-flight save. Clicking the selected parent Mode must not reset or prompt unnecessarily.
- Cover clean versus dirty/saving selected tiers removed by refreshed applicability; retain guards and stable focus. Cover valid selection retention on refetch and Main Line/revision isolation.
- Preserve read-only and archived viewing, loading/error/retry behavior, keyboard navigation and correct panel labels. Update only assertions whose old top-level tier layout intentionally changes.
- Keep existing data-source tests intact and include them in verification; no test should permit cross-scope values merely to satisfy the new presentation.

## T4. Integrate and review

Owner: primary, with independent integrity reviewer in Mode A. Depends on T1–T3 finished. Covers AC1–AC6.

- Inspect the complete diff and confirm all intended changes are within the approved Configuration scope.
- Review scope/session/cache/save ownership, empty and legacy applicability, guard behavior, external refresh races, selected-tab/panel semantics and shared-navigation consumers.
- Resolve confirmed findings with the responsible owner; rerun checks affected by fixes. Do not remove protections or modify backend contracts to simplify navigation.

## T5. Verify the integrated result and hand off

Owner: verification runner after review in Mode A, primary in Mode B. Depends on T4 complete. Covers AC1–AC6.

Focused rendered/regression commands from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts
npm run typecheck
npm run build
```

- Include any new directly relevant navigation test file in the focused command. Extend testing only for concrete changed consumers or unresolved failures; no backend/full repository suite is required for unchanged APIs and calculations.
- Render the real components with synthetic data in a browser at 1280px and 390px, plus a 320px overflow check. Verify switch ON/OFF, nested choices, saved applicability, distinct mode data, read-only state, focus/keyboard behavior and no control overlap or unexpected console/network errors.
- Do not save real Configuration records for verification. Temporary fixtures/screenshots belong in ignored temporary locations, must contain no customer data, and are removed when done.
- Run `git diff --check` and `git status --short`; preserve unrelated work. There is no repository lint script, so do not claim lint ran.
- Record exact outcomes and generated build/artifact paths. Report any unrun checks or remaining risks candidly. No migration, production mutation, commit, push or deployment is part of completion.

## Execution record

- Specification approval received on 2026-11-11.
- Task-plan stage: only this plan file created; no product code or tests changed.
- Next gate after task-plan approval: execution choice A (parallel sub-agents) or B (inline implementation).

- Execution choice A received. Baseline product worktree clean; only the spec/plan untracked. Existing Overview and configuration-mode tests: 46/46 passed. Overview and regression agents own the non-overlapping paths above; primary owns navigation.


### Implementation and review

- Overview switch and scoped styles completed by `overview_tier_toggle`; its focused tests passed 44/44. It retains existing payload and save semantics, turns ON with all three choices, and restores switch focus on last deselection.
- Primary grouped existing mode editor scopes beneath one top-level Mode entry. Reused the existing navigation component with optional labels and a hidden-navigation state; its default behavior remains compatible for other consumers. The editor remains mounted when default-only versus tier choices change, preserving dirty Default edits.
- `grouped_modes_regressions` updated only the two affected workspace/screen test files. Existing internal scope registries and data-source adapters remain unchanged. Configuration mode regressions passed 12/12, then the additional deferred-destination regression passed separately (1 passed, 12 skipped) before final integrated verification.
- `grouped_modes_integrity` found one P2: a deferred guard callback could briefly mount a destination removed during an awaited save. Primary added a current-applicability recheck inside the callback. The reviewer confirmed it resolved and reported no other confirmed defects. The new regression checks that the removed scope is neither selected nor fetched.
- Broader existing test failures were checked against an isolated HEAD archive without changing the shared worktree: KnowledgeScreens 106 passed / 16 failed, KnowledgeItemWorkspaceLayout 13 passed / 4 failed (139 total, 119 passed / 20 failed). Current failures matched the same names. The archive and diagnostic logs were removed.

Existing Layout failure names: connects the approved workspace hooks without changing shared primitives; uses a compact Overview hierarchy and one shrink-safe inline UOM row; keeps UOM inline on tablet and stacks its action on narrow mobile screens; presents a compact status strip and one contextual command bar.

Existing Screens failure names: keeps the summary unchanged while Mode edits still update save status; lists temporary items under their Main Basket beside regular Main Lines and opens Basket-scoped creation; keeps exactly one contextual Overview Save across clean, dirty, and saving states; keeps descriptive Specifications separate from a business-only saved Budget; keeps Specifications usable when unrelated Tax and Vendor catalogs fail; saves dirty Mode blocks in backend-section order with independent CAS versions; keeps one contextual Mode Save across clean, dirty, and saving states; stops a Mode save on partial failure and retries only the still-dirty blocks; attributes a Specifications conflict without discarding the acknowledged Mode change; reviews a Mode conflict as labelled values without raw price or vendor IDs; keeps a conflicted Mode block dirty when the latest server version cannot be loaded; discards every dirty Mode buffer before navigating to another section; loads saved sources once for the rail without inserting summaries into the Overview editor; keeps all Mode blocks visible and non-mutable for an active read-only revision; keeps an archived workspace and every active section non-mutable; keeps focus on the selected Mode tab when dirty keyboard navigation is declined.


### Integrated verification

`grouped_modes_final_verification` ran the exact six-file T5 command after all writers and the integrity correction finished: **200 passed, 20 failed, 220 total**, exit 1, 25.60s. All 20 failed names matched the isolated HEAD baseline above (16 Screens, 4 Layout), with no newly failing test names. The new mode/switch regressions passed. This is not a claim of a fully green repository test suite.

- `cd frontend && npm run typecheck`: exit 0.
- `cd frontend && npm run build`: exit 0; 3,346 modules, existing chunk-size warning over 500 kB.
- `git diff --check`: exit 0.
- Generated ignored outputs: `frontend/dist/` and `frontend/node_modules/.tmp/{tsconfig.app,tsconfig.node}.tsbuildinfo`. The verification runner removed its temporary log.
- Backend/OCR/full repository suites and migration checks were not run: no sources or contracts in those areas changed. No lint script exists. No dependencies, real data, external services, commits or deployments were changed.

Browser QA used the real `KnowledgeItemWorkspacePage` with synthetic in-browser API responses and mocked auth, without logging in or writing real Configuration. At 1280px, 390px and 320px, OFF hid choices without auto-saving; an explicit mock save left only Default Mode; ON restored the three tier choices and four independent editor descriptions. Desktop nested tabs and mobile selectors were visually inspected, with no control overlap or page overflow. The matrix reported zero runtime errors and zero unhandled/unexpected API calls.


Final browser checks also passed: keyboard navigation Overview → Mode and inner Default Mode → Signature Mode restored the correct focus; clicking the selected parent Mode retained Signature. A read-only fixture disabled the Applicable tiers switch and exposed no Edit Description action in Premium. All three width screenshots and the Overview toggle were visually inspected. QA removed the synthetic fixture under `frontend/node_modules/.cache/lisno-mode-qa`, its screenshots and `.playwright-cli` artifacts, and closed its isolated browser. No production or local Configuration records were saved.

Final scope: five product/style files and three directly related test files, plus the two approved task documents. No data-source adapter, backend, shared storage contract or estimator file was changed.


### Refinement execution record

- Revised spec and R0–R3 plan approved; execution A selected. Initial eight dirty source/test/style files captured and preserved. Pre-refinement source snapshots and initial diff stored temporarily at `/tmp/lisno-mode-refinement-mrxurm1k/` for delta review.
- Fresh baseline: four focused files passed, 81/81 tests. Primary owns product edits; `grouped_modes_regressions` owns the bounded tests; `overview_tier_toggle` owns temporary synthetic browser QA only.

- Refinement product delta: removed the fourth inner choice and Default Mode wording; main Mode/Save Mode uses the independent default scope. Added opt-in parent reactivation and a narrow-screen Return to Mode action. An unselected inner tier state has a disabled Choose a tier placeholder, keyboard entry point and no dangling panel label. Existing deferred-navigation and dirty-editor protections remain.
- Fresh tests after writers finished: 89/89 across Overview, configuration modes, Foundation and data-source files. Targeted KnowledgeScreens navigation cases: 17/17 passed, 105 unrelated skipped, using `-t 'Configuration Mode tiers|In-house component basket catalog integration|keeps section and category navigation operable|preserves arrow, Home|keeps mobile selectors keyboard-operable'`. Total: 106 passed. The old broad suite's 20 baseline failures were not rerun for this narrow refinement.
- Browser refinement checks passed with the real workspace and synthetic data at 1280/390/320px: main Mode opens default with no selected tier and no Default Mode label; only the three tier choices appear; clean/dirty returns, Stay/Discard, keyboard/return focus and read-only controls work. No overflow, runtime errors, unexpected API calls or real mutation requests. Screenshots inspected. The browser owner removed its ignored fixture/screenshots and CLI artifacts and closed the isolated browser.

- Refinement integrity review: no confirmed defects. Independent review verified default scope, guarded returns, unselected-tier accessibility, stable editor ownership and opt-in shared-navigation behavior.
- Final `npm run typecheck`: exit 0. Final `npm run build`: exit 0, 3,346 modules, Vite 9.44s; existing large-chunk warning remains. Final `git diff --check`: exit 0. Passed tests were not unnecessarily repeated after the read-only review.
- Ignored build outputs: `frontend/dist/` and TypeScript caches under `frontend/node_modules/.tmp/`. Removed the parent-owned `/tmp/lisno-mode-refinement-mrxurm1k/` snapshots after verification. Browser and test owners removed their temporary artifacts. No dependencies, backend changes/checks, migrations, real data writes, commits or deployments.
- Final refinement touches four product/style files and four test files on top of the preserved original implementation; no extra feature or pricing change. Nine files remain modified overall because the original Overview CSS remains part of the earlier uncommitted feature. Full/broad repository suites were not rerun; fresh validation is the 106 passing focused tests, browser matrix, typecheck and build recorded above.


### Radio-control presentation follow-up complete

- Continue approved Mode A for the user's requested radio-button presentation. Primary owns the small opt-in navigation variant, workspace opt-in and scoped radio styling. Regression agent owns the three directly affected test files; browser owner uses only temporary synthetic fixtures. Existing dirty work preserved; before-radio snapshot at `/tmp/lisno-mode-radios-8ray4bnk/`.
- Same R1–R3 behavior boundaries apply: no default choice, independent scopes, guarded switching/return, responsive keyboard access and no changes to Overview availability or prices. Inner native radios replace both the desktop tier tabs and mobile inner selector. Outer navigation keeps its default component variant.
- Verify the scoped mode/navigation tests and targeted Screens cases, followed by read-only review and final typecheck/build. Browser checks target radio selection, cancelled guarded selection, keyboard/focus and wrapping at 1280/390/320px. Old passed counts above do not describe this presentation follow-up.

- Radio follow-up tests completed after writers finished: 91/91 across Overview, configuration modes, Foundation and data-source tests; 17/17 targeted Screens cases passed with 105 unrelated skipped. Total 108 passed. Coverage includes native exclusivity, no checked tier on main Mode, arrows/Home/End, cancelled or blocked selection and existing save/refetch/race cases. Test logs removed.
- Independent radio-delta review found no confirmed defects; controlled selection/focus, native keyboard behavior, region labels, guards, separate settings and unchanged default tab variant were checked. Final browser and typecheck/build checks follow without repeating passed tests.

- Final radio typecheck and production build passed (exit 0; 3,346 modules; Vite 9.69s). Existing large-chunk warning unchanged. `git diff --check` passed. Generated ignored outputs remain `frontend/dist/` and TypeScript caches under `frontend/node_modules/.tmp/`.
- Real-workspace synthetic browser QA passed at 1280/390/320px: three native radios visible, no checked tier on the main Mode screen, exactly one checked after selection, Space and all four arrows work, and cancelled dirty selection preserves both the selected radio and draft. Stay restores selected-radio focus; Discard enters the requested tier. Mobile Mode return clears tier selection and restores parent-selector focus. Screenshots inspected; controls wrap without overflow. No runtime/console errors, unexpected API calls or real writes.
- Removed parent-owned before-radio snapshots at `/tmp/lisno-mode-radios-8ray4bnk/` after review and verification. The browser owner cleans its synthetic fixture, screenshots, CLI artifacts and isolated session. No dependencies, migrations, production actions, commits or pricing changes. Full/backend suites were not rerun for this presentation-only change; fresh regression evidence is 108 passing focused tests.


### Clear-selected-tier follow-up complete

- Continue the existing approved Mode workflow for the user's explicit request to unselect all extra modes. Add only an opt-in `onClearSelection` callback for clicking the checked radio and wire it to guarded `selectWorkspaceSection("mode")`.
- Primary owns the two product files. Regression agent owns focused configuration-mode and Foundation tests; browser owner uses only temporary synthetic fixtures. Preserve all earlier dirty work; before-change snapshots at `/tmp/lisno-mode-clear-8th6v5g5/`.
- Verify click/reclick and Space, none checked on default, retained dirty state on cancellation, discard/save handling and in-flight protection. No style, configuration data, pricing, dependency or API changes. Reuse existing guards rather than implement a separate clearing state.

- Current product delta is limited to `KnowledgeSectionNavigation.tsx` (opt-in checked-radio click and explicit Space clearing) and `KnowledgeItemWorkspacePage.tsx` (existing guarded Mode callback). No changes to styles, Overview applicability, saved settings, pricing or API behavior.
- Fresh focused regression command: `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx`. After the final Space correction: **38/38 passed**, 2 files, exit 0, 11.75s. Tests cover clean return to independent default values, dirty cancellation/discard, failed-save retry, in-flight save blocking and unchanged generic radio/arrow behavior.
- Browser QA on the real workspace with synthetic responses passed at 1280px and 390px. Clicking each selected tier returns to default with none checked. Space selects an unchecked tier and clears a checked tier. Dirty Space retains draft and selection on Stay, restores focus, and returns to default on Discard. The explicit Space handler was added after this browser check exposed that native checked radios do not emit a click for Space. No console/runtime errors, unexpected API calls or real data writes. Browser fixture, session and CLI artifacts were removed.
- Independent read-only delta review, including the final Space branch, found no confirmed defects. Preventing native Space activation avoids duplicate clearing; existing workspace guards remain authoritative. The old broad suite's baseline failures were not rerun for this bounded follow-up.
- Final `cd frontend && npm run typecheck`: exit 0 after the Space correction. `cd frontend && npm run build`: exit 0; 3,346 modules, Vite 10.14s, existing chunk-size warning. Verification confirmed the produced bundle contains the latest Space branch. `git diff --check`: exit 0; status contains only the expected nine cumulative modified files and two task documents.
- Removed parent-owned snapshots at `/tmp/lisno-mode-clear-8th6v5g5/` after delta review. Ignored build outputs remain `frontend/dist/` and TypeScript caches under `frontend/node_modules/.tmp/`. No dependencies, migrations, real data writes, commits or deployments. Backend/full repository suites were not rerun; no sources or contracts in those areas changed.

# Main-line tiers and Sub Basket information task plan

Date: 2026-11-09
Status: approved implementation and integrity review finished in Mode A. Requested behavior passed focused and rendered verification. Repository-wide tests are not fully green; exact baseline failures are recorded below.

Source of truth: [approved revised specification](../specs/2026-11-09-main-line-tier-selection-suggestions-design.md).

## Outcome and boundaries

Place an info button beside each populated Sub Basket name, and beside Direct items where applicable. Clicking it opens the existing accessible Dialog with Signature, Premium, and Functional price suggestions grouped under included Main Line names. Remove the inline suggestion paragraphs. Fetch only the opened scope's prices, using all its included lines in the current room, independent of search and pagination.

Preserve Main Line tier controls, implicit Mode, manual-price retention, Check tier comparison and its dialog/PDF, Client behavior, and the earlier Sales refresh-warning removal. No backend changes, pricing formulas, dependencies, migrations, automatic saves, or unrelated styling.

Keep one parent implementation task in progress: complete the Main Line tier update with Sub Basket information placement.

## Starting state and preservation

The original tier work is implemented but not finally verified. Intentional dirty paths cover shared line/tier controls, configured builder/workspace, pricing helper, suggestion hook/renderer, their tests, workflow fixtures, and estimator CSS. Extend this work without replacing it.

Preserve the earlier warning fix in `LeadEstimateWorkspace.tsx` and `LeadEstimateWorkspace.checklist.test.tsx`, including footer-feedback/focus guards and regression tests. Both requests' specification/plan files are untracked. `EstimateBuilderShell.tsx` and its tests have no existing changes at this revision.

Before writers start, capture `git status --short` and relevant target diffs again. Reconcile existing dirty changes before assigning ownership. Never revert, stage, reformat, or overwrite unrelated work.

## Integration contracts

- Add optional `headingActions` to `EstimateShellSubBasket` and `directHeadingActions` to `EstimateShellBasket`. Preserve existing presentation when absent. Position the info button beside the name, outside the collapse button; retain independent collapse/removal actions.
- Add staff-only `EstimateSubBasketTierInfo` presentation using existing `Dialog` and `EstimateLineTierSuggestions`. Supply title, stable per-line IDs/names and states, money formatter, close handler, and focus refs. The component does not fetch, calculate prices, or mutate drafts. Use a simple outlined info symbol without a dependency.
- Root owns one open scope keyed by actor/target context, room, Main Basket, and nullable Sub Basket IDs. Derive contents from the full current draft. Match prices by stable Main Line ID; show invalid included lines with explanations while requesting eligible siblings.
- Keep `useEstimateTierSuggestions(context, groups)` mounted. Pass only the opened group's eligible request, or an empty list while closed. Reuse debounce, batching, cancellation, response validation, and integer-paise values.
- Extend the hook's existing blocker records with their stable group key and return block-only states for inactive scopes. These contain no stale prices or retry callback. Derive row-to-group identity independently of request eligibility, filtering, and paging. Closing, collapsing, quantity edits, and version changes must not clear a known stale/access block. Clear only after valid current recovery or a true context/target change. Filter retained blocks during render so old identity state cannot leak before effect cleanup. Internal `scopeMainLineIds` metadata carries every included ID, including invalid lines; failed IDs omitted from a subset read stay blocked. Explicitly removed IDs may be dropped only after successful current recovery for the remaining scope.
- Close cancels pending reads; reopening requests current values. Reset the dialog on actor/target/room change or underlying group removal. Keep the trigger available when Sub Basket rows are collapsed. Restore focus to its surviving trigger or an existing logical fallback.
- The info dialog and Check tier comparison stay separate. Do not change the latter's scope, label, Mode column, PDF, or request behavior. Shared-shell consumers omitting the new slots keep their current behavior.

## Dependency-ordered tasks

### R0. Reconcile baseline and ownership

Owner: primary agent. Depends on revised plan approval; Mode A is already selected.

Record current diffs and assign the disjoint slices below. Root owns integration, CSS, documentation, and product interpretation. Tell each writer that other agents share the worktree and that unrelated changes must be preserved. Confirm contracts before dependent edits.

Verification: preserved baseline and explicit ownership; supports all acceptance criteria.

### R1. Preserve blockers while information is closed

Owner: frontend implementer, preferably the existing hook owner. Depends on R0.

Exclusive files:
- `frontend/src/features/leads/useEstimateTierSuggestions.ts`
- `frontend/src/features/leads/useEstimateTierSuggestions.test.tsx`

Expose retained block-only states when the active request list is empty or switches scope, without closed-scope reads. Preserve actor/target isolation and fresh-read recovery. Cover initial closed state, cancellation, 409 → close → quantity edit, reopening/pending/network failure, another opened group, identity changes, older cached success, and successful recovery. Keep existing malformed-response, zero-value, batching, and race coverage.

Acceptance: AC4 and AC5. Run the focused hook test file.

### R2. Add heading actions and information presentation

Owner: second frontend implementer. Depends on R0; can run in parallel with R1.

Exclusive files:
- `frontend/src/features/estimates/EstimateBuilderShell.tsx` and its test file.
- New `frontend/src/features/leads/EstimateSubBasketTierInfo.tsx` and its test file.

Implement optional heading slots without nested controls or default-consumer changes. Implement the presentational trigger/dialog, reusing the existing per-line suggestion renderer. Keep names with their three messages; add no totals or PDF action. Supply scoped class hooks; root owns CSS and builder integration.

Test independent click/keyboard activation, no accidental collapse, collapsed-group availability, direct-items placement, per-line attribution, Close/Escape, focus containment, and return focus. Preserve shell navigation/removal coverage. No shared Dialog implementation change is expected.

Acceptance: AC3, AC6, AC7. Run shell and presentation tests.

### R3. Integrate scope, lifecycle, and responsive presentation

Owner: primary agent. Depends on R1 and R2. Read-only preparation may run alongside them.

Owned files:
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its builder/selling-price tests.
- `frontend/src/features/leads/LeadEstimateWorkspace.tiers.test.tsx`.
- `frontend/src/styles/estimator-dashboard.css`.
- `LeadEstimateWorkspace.tsx` only if a bounded context/focus connection is needed; preserve the earlier warning fix and single-line updater.
- Other existing workflow fixtures only if necessary; record exact paths before editing and preserve mutation assertions.

1. Add the adjacent info actions and track one open scope. Dismiss it on actor/target/room/group invalidation.
2. Derive all included lines in that scope, ignoring search/pagination/collapse for dialog content. Exclude other rooms and excluded rows. Keep invalid-line explanations and request eligible siblings only.
3. Remove inline suggestion rendering and its row prop. Continue deriving tier eligibility from stable group blocker state and existing permission/freshness guards. Preserve current Main Line choices and the single-line update path.
4. Render current suggestion states in the info dialog. Use scoped CSS for approximately 560px maximum width, viewport-safe scrolling, 32px desktop/44px touch targets, and long-name wrapping. Preserve established typography/colors and comparison layout.
5. Adapt workspace tests to open information before expecting suggestions. Cover no initial reads, full-group content beyond filters/pages, collapsed/direct groups, zero/unavailable/component cases, cancellation/late responses, changed quantities/source revisions, blockers after close, and current prices after tier selection/reopen.
6. Retain manual-baseline, save/reload, unequal sibling/room/ID isolation, permission, details/PDF, and prior warning tests.

Acceptance: AC1–AC7; revised behavior is AC3/AC4/AC7, preserved behavior is AC1/AC2/AC5/AC6.

### R4. Review the integrated changes

Owner: `integrity_reviewer`. Depends on all R1–R3 writers finishing.

Read-only review against the approved revised spec: stable identity, authoritative paise values, full-group scope, cancellation, retained blockers, actor/target transitions, manual-price retention, single-line mutations, focus lifecycle, and unchanged Client/details/PDF paths. Root resolves confirmed findings before final verification. No concurrent product writes during the final review pass.

Acceptance: integrated review of AC1–AC7.

### R5. Verify the final result

Owner: `verification_runner` after R4. Root fixes confirmed failures, then reruns affected checks. No product-source edits during final verification.

From `frontend/`:
1. `npm test -- src/features/leads/useEstimateTierSuggestions.test.tsx src/features/leads/EstimateLineTierSuggestions.test.tsx src/features/leads/EstimateSubBasketTierInfo.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/estimates/EstimateLineRow.test.tsx src/features/estimates/EstimateSubBasketModes.test.tsx`
2. `npm run typecheck`, `npm test`, and `npm run build`. The full suite covers shared-shell Client consumers and prior warning/workflow regressions. Do not repeat successful suites without a new change or unresolved failure.
3. Browser checks with synthetic local data at desktop and narrow mobile widths: icon adjacency, long names, collapsed groups, keyboard open/close/focus, scrolling, no horizontal overflow, current/zero/unavailable prices, and unchanged comparison/PDF. Confirm no unintended mutations, console errors, or unexpected network failures. Remove only task-owned temporary artifacts and stop only task-owned sessions.

From the repository root: `git diff --check`, `git status --short`, and final integrated diff inspection.

No lint script exists; do not claim lint passed. Backend/OCR tests are outside this frontend-only scope. Do not call the work complete if final UI, typecheck, tests, or build remain unverified.

## Parallel execution and evidence

Mode A: R0 → R1 and R2 in parallel → R3 integration → R4 review/fixes → R5 verification. R1/R2 have disjoint write paths. Root alone owns shared integration/CSS/docs. The prior Mode A choice carries forward; do not request that choice again.

Pre-revision evidence, not final acceptance:
- Initial shared-control suites passed 10 tests.
- Five workflow/recommendation suites passed 162 tests with narrow comparison fixtures and preserved mutation assertions.
- Latest five pricing/hook/suggestion/workspace suites passed 73 tests. Frontend typecheck and `git diff --check` passed.
- Integrity review confirmed fixes for explicit same-tier selection on legacy manual lines and stale-source blocking across quantity changes/group removal. The revised dialog lifecycle still needs review.
- The temporary fixture `frontend/output/playwright/tier-2026-11-09/` was removed and its isolated server/browser stopped. Revised browser verification and the full frontend suite/build remain outstanding.

At final handoff, record affected files, exact results, unrun checks, remaining risks, and any temporary outputs. No commit, push, deployment, seed, migration, production mutation, or customer communication is authorized.

## Revised implementation record

- R0: current dirty paths matched the recorded prior work. Root preserved the warning removal and existing tier changes.
- R1: the hook returns inactive block-only states and cancels closed-scope reads; its focused suite passed 29 tests before integrated review.
- R2: heading slots and the information trigger/dialog are implemented. Shell/presentation suites passed 12 tests. Root assigned the additional isolated `ConfiguredEstimateBuilder.tierInfo.test.tsx` to the same writer; its six scope/lifecycle/cancellation checks and typecheck passed.
- R3: root moved guidance into the opened full-group dialog, retained stable row blocker lookups, and added scoped responsive styles. Builder/workspace/selling-price suites passed 63 tests. The five temporary background-read mocks and their new helper were removed because unopened information now makes no read; earlier warning regression changes remain intact.
- Browser checks at 1440×1000 and 390×844 confirmed adjacent icons, 32px/44px targets, no horizontal overflow, all 22 included lines in one group read, bounded dialog scrolling, zero closed-dialog reads, unchanged manual prices, Escape/return focus, and access while collapsed. Existing comparison retained Mode/Signature/Premium/Functional columns and downloaded the synthetic PDF. A fixture-only hot-reload createRoot warning was cleared by reloading; no application runtime errors were observed on the fresh page.
- R4 found one remaining edge: a successful eligible-sibling subset must not clear a stale block covering an omitted source line. The hook now tracks failed source coverage and all included scope IDs, distinguishing invalid omissions from explicit removals. The seven-test builder integration suite covers this transition. Final integrity recheck confirmed the fix with no remaining findings.
- Temporary visual outputs at `frontend/output/playwright/tier-info-2026-11-09/`, including the synthetic PDF, were removed; the isolated browser and Vite server were stopped.
- R5 integrated focused command passed 130 tests across 10 files (16.30s). All product sources remained stable during final verification.

## Final verification and remaining limitations

| Check | Result |
| --- | --- |
| Integrated focused command listed in R5 | 130 tests passed across 10 files; exit 0 |
| `npm run typecheck` | Passed; exit 0 |
| `npm test` | 6,693 passed, 98 failed across 438 files; exit 1, 164.62s |
| Failed-file rerun with `--maxWorkers=1` | 443 passed, 92 failed across 13 files; six files recovered, seven retained baseline failures; exit 1, 128.09s |
| `npm run build` | Passed; exit 0. Existing large-chunk warning remains (main JS 3,334.22 kB; CSS 1,574.83 kB) |
| Desktop/mobile synthetic browser checks | Passed as recorded above; comparison PDF download verified with a synthetic response |
| `git diff --check` and final status | Passed; expected task changes only, with no temporary browser directory |

The single-worker rerun passed the new tier-info integration suite and resolved the timing failures in workspace collaboration, accessibility, procurement, dashboard, and pending Knowledge changes. The remaining failures are in unchanged test/source areas:

- `KnowledgeItemWorkspaceLayout.test.tsx`, `KnowledgeModeLayout.test.tsx`, `KnowledgeModeSectionStateRemoval.test.tsx`, and `KnowledgeScreens.test.tsx`.
- `AskLisnoLauncher.test.tsx` and `EstimateReviewPanel.collapsible.test.tsx`.
- `src/test/fixtures/enterpriseTransport.test.tsx`.

The verifier checked their relevant files against HEAD with no differences and identified no deterministic task-related failure. Examples include the old `1 items · GST included` expectation versus the existing `1 item shown · GST included` UI, a PMC radio expectation where the existing control is a switch, and older enterprise fixture labels/actions and duplicate article queries. Enterprise failures do not assert the removed staff Mode/group-tier controls. These unrelated baseline mismatches were not changed.

Verification logs: `/tmp/lisno-tier-info-final-focused.log`, `/tmp/lisno-tier-info-final-typecheck.log`, `/tmp/lisno-tier-info-final-full.log`, `/tmp/lisno-tier-info-final-isolated.log`, and `/tmp/lisno-tier-info-final-build.log`. Standard ignored outputs remain under `frontend/dist/` and `frontend/node_modules/.tmp/*.tsbuildinfo`; task-specific browser fixtures/screenshots/downloads were removed. No dependencies or lockfiles changed. Backend/OCR suites were not run for this frontend-only change; no lint script exists. No commit, push, deployment, migration, or external mutation was performed.

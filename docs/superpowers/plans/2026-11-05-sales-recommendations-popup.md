# Sales recommendations popup: task plan

Date: 2026-11-05
Status: Complete. Specification and task plan approved; Mode A implementation, independent review and integrated verification completed.

Source of truth: [approved specification](../specs/2026-11-05-sales-recommendations-popup-design.md).

## Intended result

Sales working drafts show recommendations in a small, non-modal side popup with Close and Reopen controls. The popup opens automatically once for a room's first ready recommendations without stealing focus. Explicit dismissal survives recommendation/source updates and Builder/Summary navigation during the workspace visit. Existing recommendation selection, current Configuration rules, saved values, totals and other roles' presentation remain intact.

No backend/API, persistence, dependency, global overlay redesign, migration or deployment work is planned.

## Baseline and ownership

The current dirty worktree contains the completed Client visibility fix and Sales direct-basket browsing restoration. Preserve all those edits and their documents.

Dirty targets relevant to this change are:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its test: direct catalogue presentation, pagination and stable excluded-row focus ownership.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` and its tests: Sales lifecycle opt-in, sparse preview edits and lifecycle/role regression coverage.
- `frontend/src/features/estimates/EstimateBuilderShell.tsx`: optional group counts, footer slots and empty-state messages.

Existing Client files, `ProjectWorkflowPanel` files, Sales catalogue projection files and prior specs/plans are outside this implementation's write scope. The recommendation components, their tests and `estimateSelection.css` currently have no local diffs. Capture the complete status, hashes and per-target diffs again before writers start so intervening work is not overwritten.

The primary agent owns product interpretation, state/data contracts, integration, this plan and final reconciliation. In Mode A, each writer receives explicit paths and the instruction that others are working in the shared worktree; no writer may revert or edit another owner's paths.

## Contract to establish before parallel work

1. **Opt-in presentation:** shared recommendation presentation defaults to the existing inline mode. Only the stable Sales working-draft boundary opts into popup mode; transient loading/save restrictions do not switch presentation.
2. **Workspace-owned dismissal:** keep presentation state above the conditionally mounted builder, keyed by stable actor/lead/room identity. Distinguish an unseen room from an opened or explicitly closed room. Automatic opening is allowed only for an unseen room with current ready, non-empty data. Explicit opening can reopen a closed room. Never persist this state remotely or in localStorage.
3. **Data context stays separate:** preserve the existing source-dependent recommendation query/context key for freshness and pagination. It must not reset the stable dismissal state. Only the active room's accepted recommendation data can populate the popup.
4. **One trigger and one content surface:** supply the Sales trigger near builder tools, using a minimal optional shell slot if needed. Render the popup outside scroll clipping with the existing portal utility where suitable. Inline callers keep their current structure. Do not create a duplicate recommendation derivation or second actionable list.
5. **Non-modal behavior:** do not use the modal `useOverlay`/Drawer behavior for this popup. The existing overlay utility acquires scroll locks, isolates background elements and manages modal focus; those semantics must remain unchanged. The popup stays below true modal layers and handles Escape only within its own focus context.
6. **Explicit geometry and focus ownership:** settle the trigger reference, builder bounds and footer-safe positioning inputs before splitting files. Prefer existing layout measurements or explicit element refs over duplicated magic offsets. Explicit opening requests focus; automatic opening does not. Return focus only when the closing/disappearing popup owned it.
7. **Existing item contract:** keep the authorized item list, count, source explanations, 20-item pages, disabled states, `onAdd`, `onRemove`, retry/refresh routing and rejected-action behavior. Popup state cannot change draft fingerprints, save payloads, totals or recommendation origins.

Exact TypeScript prop names and internal state representation are primary-owned implementation details settled in T1. They may be adjusted within this contract without changing approved behavior. A material scope or backend-contract change requires revising the affected approved document first.

## Tasks and dependencies

### T1. Confirm contracts and capture the regression baseline

Owner: primary agent. Dependency: plan approval and a new execution-mode selection. Covers AC1, AC2, AC5, AC6.

- Capture current dirty-path hashes/diffs and confirm the completed Sales/Client changes remain present.
- Trace builder mount/unmount across tabs, stable room/actor identity, current recommendation context and the Sales lifecycle boundary.
- Confirm geometry around the toolbar, scrolling builder and persistent footer. Inspect portal/modal stacking and focus behavior without changing shared modal infrastructure.
- Settle the controlled popup/state props, trigger placement and positioning refs for both implementation owners.
- Establish fixtures with two unequal rooms, shared and distinct recommendation targets, unavailable targets, a late response and a paged group. Capture a failing popup-discovery regression while retaining existing inline/default tests.

Exit: concrete interfaces, verified dirty-target ownership and reproducible pre-change behavior. Only T1 is active until these contracts are settled.

### T2. Implement popup presentation and Sales integration

Parent owner: primary agent. Dependency: T1. Covers AC1–AC5.

In Mode A, the following non-overlapping slices can run concurrently after T1. In Mode B, the primary performs them sequentially.

**T2a: Shared opt-in popup presentation.** Owner: bounded frontend implementer. Exclusive paths:

- `frontend/src/features/estimates/EstimateRecommendations.tsx`
- `frontend/src/features/estimates/EstimateRecommendations.test.tsx`
- `frontend/src/features/estimates/estimateSelection.css`

Implement compact trigger/popup presentation using the settled controlled API. Reuse current row rendering and pagination; keep default inline behavior unchanged. Add accessible Close/Reopen controls, room/count/status text, automatic-versus-explicit focus handling, focus restoration when content disappears and scoped Escape behavior. Preserve accepted/rejected Add/Remove announcements and focus continuity.

Use scoped styling for 360–400 px desktop width, bounded height, internal scrolling and narrow-screen adaptation above the footer. Keep modal layers above the popup and the estimate interactive; no backdrop, focus trap, scroll lock, new icons or decorative effects. If a small adjacent presentation helper becomes necessary, agree its path with the primary before writing it.

Test controlled open/close, initial auto-open without focus theft, manual keyboard open/close, one actionable list, row removal/focus fallback, empty/loading/error/stale/forbidden/warning states and pagination. Keep existing inline tests.

**T2b: Workspace state, staff adapter and builder integration.** Owner: primary agent. Exclusive paths:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` and relevant `LeadEstimateWorkspace*.test.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its test
- `frontend/src/features/leads/EstimatorRecommendations.tsx` and its test
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx`
- `frontend/src/features/estimates/EstimateBuilderShell.tsx` and its test only for an optional toolbar slot/explicit positioning ref if required

Store room-scoped popup state in the workspace so Builder/Summary remounts do not undo dismissal. Wire only Sales working drafts to the popup and preserve default staff/Client presentation. Keep query freshness identity separate from popup identity, reset state on workspace/actor changes, and prevent late old-room results from populating the current popup.

Move only the Sales recommendation trigger out of the full-width `beforeGroups` block; preserve excluded review and all existing basket controls. Feed the established recommendation items/actions and current availability state into the popup. Avoid changes to catalogue projection, sparse draft construction or finance logic.

Add integration coverage for two rooms, source changes after close, refresh, Builder/Summary return, read-only and reopened drafts, pending save, no dirty-state changes from popup controls, accepted/rejected recommendation actions and unchanged saved inputs. Existing recommendation workspace fixtures omit the Sales role; add explicit Sales cases without converting away the default-role coverage.

Both owners may read all relevant files. They must not change each other's paths or the existing Client/Configuration/overlay infrastructure. Tests during concurrent edits are provisional.

### T3. Integrate and perform independent integrity review

Owner: primary agent, with `integrity_reviewer` in Mode A. Dependency: all T2 writers finished. Covers AC1–AC5 and focus/layering aspects of AC6.

- Inspect the combined diff and reconcile optional shell/default presentation behavior.
- Review state transitions: unseen → open → closed; explicit reopen; empty/error results; room/source/actor changes; Builder/Summary remounts; stale callbacks and failed Add/Remove.
- Verify that the new UI never mutates selections merely by opening/closing, never changes backend guards, and keeps popup items tied to stable room/target IDs.
- Review keyboard focus during typing, disappearance and pagination, and isolation from modal Escape/inert/focus management.
- Return confirmed defects to their owners, then rerun affected checks and re-review fixes. In Mode B, the primary performs the equivalent review inline.

### T4. Run final integrated verification

Owner: `verification_runner` in Mode A for automated checks; primary for rendered browser checks. In Mode B, primary owns both. Dependency: T3 findings resolved and writers stopped. Covers AC1–AC6.

Run the checks below on the integrated worktree. Use synthetic/mock data only for browser testing, including any simulated saves. Check desktop, mobile, short viewport, zoom and coexistence with an actual existing confirmation dialog. Inspect screenshots, console/network errors and accessibility results. Resolve verified defects and repeat only affected checks unless risk expands.

### T5. Reconcile and hand off

Owner: primary agent. Dependency: T4 completed.

- Inspect final diff/status and confirm prior Client and Sales fixes were preserved.
- Record exact checks/results, warnings, any unrun checks and remaining limitations in this plan.
- Remove task-created temporary fixtures/screenshots and stop task-owned browser/server processes. Report regenerated ignored build outputs.
- Report the actual popup behavior, principal file changes and verification. No commit, push, deployment or production mutation is authorized by this task.

## Acceptance and verification matrix

| Criteria | Required evidence |
| --- | --- |
| AC1 | Sales recommendations appear in one compact popup with one trigger; popup opening does not shift basket geometry; close/reopen works. |
| AC2 | Real typing remains focused during auto-open; dismissal survives source changes, refresh and tab remounts; two unequal rooms and delayed results preserve correct context. |
| AC3 | Stable target/room Add/Remove and origin cleanup remain correct; rejected actions do not announce success; popup controls alone produce no draft/save/total change. |
| AC4 | Open and closed loading, unavailable, stale, forbidden, error/retry and genuine-empty fixtures; correct status/count; 45+ recommendations stay paged at 20. |
| AC5 | Shared/default inline and Client recommendation suites pass; direct Sales basket browsing, manual saved values, closed/historical restrictions and Client pre-submission visibility remain intact. |
| AC6 | Rendered 1440×900, 390×844, short-height and 200% browser-zoom checks; accessible trigger/Close/Escape/focus return, reachable footer, no horizontal overflow, correct dialog layering and no focus trap in the popup. |

## Planned commands

From `frontend/`, start with the recommendation and affected integration suites:

```sh
npm test -- src/features/estimates/EstimateRecommendations.test.tsx src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/roomRecommendations.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx
npm test -- src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx
npm test -- src/features/client/ClientQuotation.recommendations.test.tsx src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx
npm run typecheck
npm run build
```

Include any newly added focused popup test file and appropriate existing dialog tests if integration evidence requires them. Do not run typecheck and build concurrently because they share TypeScript build outputs. At repository root, run `git diff --check` and `git status --short` and compare protected-path baseline hashes.

No lint script exists. Full frontend/backend/OCR suites, migrations and live service tests are not planned for this frontend presentation change; expand only if actual implementation risk warrants it and report unrun checks accurately.

## Progress record

- Specification: approved.
- Task plan: approved.
- Execution mode: A, selected for this popup change.
- Product implementation: T1–T5 completed. Baseline hashes and per-target diffs were captured before writers started. The initial new Sales dismissal test failed on the original implementation because no popup trigger existed.
- Verification of this change: 369 tests across 20 files, frontend typecheck/build, rendered interaction/accessibility checks and diff hygiene passed; details below.
- External actions: none performed or required.

T1 contract: optional controlled `popup` props with `open: boolean | undefined` (unseen), callback, toolbar/footer/search refs; workspace owns per-room state; portal uses measured visible footer bounds and remains below modal layers.


## Implementation and final verification record

### Delivered behavior

- Sales working drafts opt into one toolbar trigger and one body-portalled, non-modal recommendation panel. Shared/default callers remain inline. The stable Sales catalogue boundary also controls popup presentation during save/refetch locks and reopened drafts.
- Workspace-local per-room open/closed state survives source changes and Builder/Summary mounts. The existing actor/lead/session/role workspace key resets presentation state between identities/workspaces. The adapter is keyed by stable room ID; source-dependent query keys continue to control freshness and pagination.
- Popup placement uses toolbar/footer refs and visual viewport measurements; the normal-flow footer reduces available height only when visible. The popup uses existing tokens, no new dependencies or icons, no backdrop or focus trap, and a layer below actual modals.
- Close/Enter/Escape, accepted/rejected actions, loading/failure/review labels, empty-state focus fallback and 20-item pages preserve existing targets, values, totals and save behavior.
- Independent integrity review found an initial hidden-content focus attempt and a historical-warning refresh routed to an empty source retry. Both were corrected and re-reviewed with focused regression coverage; no findings remain.

Principal files: `EstimateRecommendations.tsx` and its test, `estimateSelection.css`, `EstimateBuilderShell.tsx`, `ConfiguredEstimateBuilder.tsx`, `EstimatorRecommendations.tsx` and its test, `LeadEstimateWorkspace.tsx`, and `LeadEstimateRecommendations.test.tsx`.

### Automated results

All commands in Planned commands ran from `frontend/` with exit 0:

- Recommendation/core command: 91 tests across 6 files.
- Sales workspace command: 115 tests across 6 files.
- Client visibility/default behavior command: 152 tests across 7 files.
- Additional `npm test -- src/features/leads/salesEstimateCatalogue.test.ts`: 11 tests in 1 file.
- Total: **369 tests across 20 files**. Includes 17 shared recommendation tests and the workspace popup scenarios with real typing, independent room targets, late data, pending save, read-only Sales and modal coexistence.
- `npm run typecheck`: passed.
- `npm run build`: passed; 3,333 modules, Vite 9.56 seconds. Existing chunk-size warning remains: main bundle 3,267.67 kB minified / 898.31 kB gzip, with several chunks above 500 kB.
- `git diff --check`: passed. All 17 protected pre-existing dirty paths were hash-identical to the captured baseline. Status contains the intended prior Client/Sales work and this popup change only after cleanup.

### Rendered evidence

Actual local Vite app, Playwright/Chromium, synthetic route-intercepted API data only. Two unequal rooms used distinct source/target pairs and persisted manual values. No live backend or customer data was used.

- Desktop 1440×900: popup 380px wide, below toolbar and above Save footer. Closing did not shift basket geometry. Close/reopen/Enter/Escape restored focus; Add/Remove retained a meaningful popup focus target; room-specific targets and dismissal survived Summary and refresh. Actual Sub Basket removal dialog isolated the popup with inert, owned focus, and handled Escape without dismissing the popup.
- Mobile 390×844: popup 374px wide within 8px margins; Close/Add targets 44px tall, no horizontal overflow, footer reachable. Screenshot inspected.
- Short viewport 1440×450: 380px popup remained below toolbar and above the visible footer. Screenshot inspected.
- Reflow viewport 720×450 and **200% visual viewport zoom** via Chromium page scale factor 2: Close and panel remained within the visible viewport. Zoom screenshot inspected. This checks actual visual zoom plus reflow at the corresponding CSS viewport; browser-menu text-only zoom was not exercised.
- Axe accessibility checks scoped to the actual estimate workspace and popup: zero violations at desktop, mobile, short and reflow viewports, no rule exclusions.
- Initial error keyboard opening correctly focused Close; retry recovered. Closed unavailable/error/forbidden states stayed discoverable. Ready-empty removed popup/trigger and returned owned focus to the search control.
- 46 recommendations rendered pages of 20/20/6; close/reopen retained the current page.
- A held recommendation response released while typing did not steal focus; the user finished `123.45`. Mock save retained quantity 7 and rate 12,345 paise for the intended source, preserved the other room, and included exactly the two intended lines.
- No runtime JavaScript errors or unexpected API requests. Deliberate 503/403 fixtures exercised failures. The synthetic harness blocked external Google Fonts reads, producing expected resource errors and using the existing fallback font; exact remote-font rendering was not exercised.

Browser harness assertions were corrected for actual accessible names, modal inert semantics and asynchronous modal focus; no additional product changes were needed for these harness corrections.

### Cleanup and limits

Task-owned browser/server processes are stopped at handoff. Temporary baseline, synthetic scripts, screenshots and logs under `/private/tmp/lisno-popup-baseline`, `/private/tmp/lisno-popup-browser`, and the four task-owned `.playwright-cli` artifacts are removed. Existing ignored `frontend/dist/` and `frontend/node_modules/.tmp/tsconfig.{app,node}.tsbuildinfo` were regenerated by required checks and retained as existing build outputs.

No dependencies/lockfiles, backend/API/schema, migration, live-service mutation, commit, push or deployment. No lint script exists. Full frontend, backend and OCR suites were not run; focused regression coverage matched this presentation-only change. Remaining limitations are the existing bundle warning and remote-font/browser-menu text-only-zoom checks described above.

# Estimate recommendations and fixed builder controls

Date: 2026-10-08
Status: Completed and verified in Mode A on 2026-10-08. Local changes only; not deployed.

Approved specification: [Estimate builder: optional recommendations and fixed controls](../specs/2026-10-07-probable-recommendation-skip-design.md).

The user approved the specification, task plan, and Mode A execution on 2026-10-08. This plan covers both the Probable Addition action and the screenshot-defined scrolling layout. Prior pricing/source/card changes remain intact.

## Outcome and invariants

- Only Probable Additions expose **Not necessary**. Explicitly reviewing optional targets can preserve the source without adding targets; a skip cannot satisfy an unanswered required target. Keep the existing successful-add and ordinary-dismissal behavior.
- Skip decisions belong to one current room/review and source/rule context. They are not saved preferences and cannot survive an incompatible Configuration change.
- Tabs, Messages, search/filter/refresh, room controls, and basket shortcuts remain stationary while the recommendation panel and item list scroll in one bounded pane.
- Preserve item selection, modes, prices, recommendation-origin cleanup, estimate saves, authorization, and existing compact row dimensions. No backend contract or financial formula changes.
- No dependencies, lockfile changes, migrations, staging, commits, publishing, production mutation, or deployment are included.

## Worktree protection

The planning-stage `git status --short` contains 40 modified paths and 6 untracked paths from the earlier approved work and this specification. Before execution writers start, capture a fresh status and per-target diff to ignored temporary files; do not assume that the planning snapshot remains current.

Previously modified targets that this plan may touch:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its test.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, its test, and `LeadEstimateRecommendations.test.tsx`.
- `frontend/src/styles/estimator-dashboard.css`.
- `frontend/src/test/fixtures/enterpriseTransport.ts`, its test, and the untracked `enterpriseEstimateModesData.ts`.

`EstimatorRecommendations.tsx`, its test, `roomRecommendations.ts`, and its test were clean at planning. Inspect actual diffs before assigning any file. All owners must preserve earlier source/mode/compact-row changes and unrelated work. Do not stage or revert the worktree. Keep one parent task in progress and record verified results as execution advances.

## Dependency-ordered tasks

### T1. Establish baseline and implementation contracts

Owner: primary agent. Depends on plan approval and execution-mode selection.

1. Reconcile the approved spec against the current working files and preserve relevant pre-existing diffs.
2. Run the focused recommendation/builder/workspace baseline once, record failures, and identify which predate this scope. Use existing local synthetic QA data for a baseline view of the builder.
3. Define one effective target projection with stable target/source/rule identity and required precedence. Reuse or extract the current flatten/deduplication logic rather than creating competing category rules in the modal and workspace.
4. Settle the frontend-only skip contract before writers proceed: workspace owns validated review decisions; the modal receives current skip state and an action callback whose success determines progression. Builder forwards those props. The workspace revalidates ready/editable/current-room/current-source/current-catalogue context before accepting a skip or using it during dismissal.
5. Settle the local layout boundary: workspace owns the common tabs/Messages/work-area integration; builder owns toolbar, stationary rail/shortcuts, item scroll reference, and controlled jumps. Size using the actual available viewport; any measurement lifecycle must handle resize/content changes and clean up on unmount/tab change.

Acceptance: named boundaries and callback/types are shared before parallel writes. No backend or unrelated shell change is needed to implement the approved behavior. Criteria 1–12.

### T2. Implement independent owned slices

Depends on T1. In Mode A the following slices can run concurrently with explicit non-overlapping file ownership. In Mode B the primary agent executes them sequentially.

| Slice and owner | Exclusive writable paths | Deliverable |
| --- | --- | --- |
| Recommendation presentation, frontend implementer | `EstimatorRecommendations.tsx`, `EstimatorRecommendations.test.tsx`, `roomRecommendations.ts`, `roomRecommendations.test.ts` under `frontend/src/features/leads/` | Effective target/category helpers, Probable-only action, separate selected/skipped state presentation, next-item focus, announcements, truthful completion, and focused category/precedence/state tests. |
| Builder layout, frontend implementer | `ConfiguredEstimateBuilder.tsx`, `ConfiguredEstimateBuilder.test.tsx`, and `frontend/src/styles/estimator-dashboard.css` | Fixed toolbar/rail/shortcuts, bounded recommendation/item pane, pane-only basket jumps, context-change scroll reset, responsive navigation, keyboard access, and row-menu boundary handling. Forward the agreed recommendation props. This owner alone adjusts any three-button modal CSS. |
| Workspace integration, primary agent | `LeadEstimateWorkspace.tsx`, `LeadEstimateWorkspace.test.tsx`, `LeadEstimateRecommendations.test.tsx` | Validated skip lifecycle, skip-aware dismissal, tabs/Messages/work-area sizing integration, save/reload regressions, and preservation of ordinary dismissal/add behavior. |
| Synthetic browser fixtures, verification fixture owner if capacity permits | `frontend/src/test/fixtures/enterpriseTransport.ts`, `enterpriseTransport.test.tsx`, `enterpriseEstimateModesData.ts` | Opt-in QA scenarios with enough items/rooms/baskets to scroll; optional-only, required, mixed/shared-target, unavailable and long-text cases. Preserve all existing fixture defaults and earlier QA variants. |

No owner edits another slice's files. The primary agent supplies shared-interface decisions and handles handoffs; do not resolve prop or style disagreements by concurrent edits to a shared path. Every writer is informed that others are working in the same worktree and must preserve their changes. If all available slots are occupied, the fixture slice follows one completed writer instead of overlapping ownership.

Recommendation deliverables, criteria 1–7:

1. Render the correct category and two/three actions. Skipping a probable target does not call Add or mark it selected.
2. Advance through pending targets; distinguish reviewed from included scope in summaries/completion.
3. Apply skip exemptions only to the appropriate newly selected source whose actionable optional choices have been answered. Maintain required dominance for shared targets and Sub Basket children.
4. Clear obsolete decisions on new review, room/estimate/source changes, source deselection, catalogue invalidation, and loss of editability. Guard late responses and repeated actions.
5. Verify source preservation, target exclusion, totals, origin metadata, and save/reload; preserve manual reconsideration and source reselect behavior.

Layout deliverables, criteria 9–12:

1. Keep screenshot-1 controls outside the vertical item pane; include the recommendation panel and every relevant item/empty/unavailable section inside it.
2. Keep room overflow and horizontal shortcuts independently accessible. Prevent item scrolling from chaining into page scrolling at pane boundaries.
3. Keep footer actions, project context, notices, menus, and dialogs reachable. Do not globally lock page scrolling.
4. Reset pane scroll on room/search/filter context changes. Retain position on field edits, selection, collapse, and modal close. Basket jumps retain search/filter clearing, expansion, and reduced-motion behavior while moving only the item pane.
5. Adapt compact controls for narrow/short/zoomed viewports, with accessible overflow when the complete work area cannot fit. Preserve Configure, Summary, Proposal, and historical-only routes.

### T3. Integrate and run focused checks

Owner: primary agent. Depends on every T2 writer finishing.

1. Inspect each completed diff against its baseline, reconcile contracts, and verify that no earlier compact UI, mode, or source behavior was lost.
2. Run the focused suite below on the integrated worktree; fix confirmed failures in the responsible slice and rerun affected tests.
3. Run frontend typecheck. Inspect the mixed legacy/configured builder path, tab transitions, saved/unavailable rows, and read-only states for unintended scroll constraints.

Acceptance: criteria 1–6 and 10/12 are covered by behavior-level tests; no test merely asserts incidental CSS or mirrors a helper's implementation. Passing unit tests alone do not establish sticky/scroll correctness.

### T4. Integrity review

Owner in Mode A: `integrity_reviewer`, read-only; primary agent in Mode B. Depends on T3.

Review room/source/rule identity, required precedence, dismissal/add compatibility, async invalidation, source/target save state, query freshness, focus lifecycle, viewport/scroll ownership, and preservation of earlier dirty changes. Report evidence-backed defects with file locations. Primary agent resolves findings before final verification; reviewers do not rewrite product sources.

Acceptance: no unresolved correctness or accessibility issue in criteria 1–12. If fixes are needed, review the affected changes before advancing.

### T5. Final verification and handoff

Owner in Mode A: `verification_runner`, plus primary agent for browser checks; primary agent in Mode B. Depends on T4 and all fixes/writers finishing. No concurrent product edits during final checks.

Run from `frontend/`:

```sh
npm test -- src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/roomRecommendations.test.ts src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
npm run typecheck
npm run build
```

If the fixture transport changes, also run `npm test -- src/test/fixtures/enterpriseTransport.test.tsx`. Run `git diff --check` and inspect `git status --short` from the repository root. Broaden tests only for new affected boundaries or unresolved failures; backend/OCR verification is unnecessary unless their scope changes. There is no lint script.

Browser verification using local synthetic data:

- At 1440×900, 1024×768, and 390×844, scroll a long list and record control/content bounding positions plus pane/page scroll positions. Verify the controls stay in place, the recommendation panel scrolls, and first/last rows are reachable.
- Exercise basket jumps, room navigation, search/filter, By Section/Selected, collapse/expand, quantity/rate input focus, and item selection. Verify intended resets and position preservation.
- Exercise optional-only, required, mixed/shared-target, and unavailable recommendations. Verify three/two action presentation, keyboard progression after skip/Add, source preservation, truthful completion, and ordinary dismissal.
- Exercise short landscape and 200% zoom, long names, long navigation lists, refresh/error notices, empty results, read-only states, lower-row menus, and modal focus restoration. Confirm no horizontal page overflow, clipped action, keyboard trap, or unexpected console/network failure.
- Switch Configure/Builder/Summary/Proposal and open the synthetic Messages destination. Verify navigation, appropriate scrolling, and Save/Submit reachability. Do not send messages or publish an estimate.
- Run rendered accessibility checks for the modal and focusable scroll region; report incomplete automated checks and supplement with keyboard inspection.

Store screenshots, logs, and numeric scroll evidence under an ignored temporary directory such as `/tmp/lisno-estimator-recommendation-scroll-qa/`. Do not commit generated assets or runtime files.

Acceptance: all 12 specification criteria have recorded evidence. Final handoff lists actual changes, important file links, exact checks/results, unrun checks, artifacts, and remaining limitations. Do not claim completion if rendered scrolling or recommendation behavior remains unverified.

## Execution graph and approval state

`T1 → T2 independent owned slices → T3 integration → T4 review/fixes → T5 final verification`

All approval gates and tasks T1–T5 are complete. No remaining implementation task.

## Execution evidence

- Baseline captured at `/tmp/lisno-estimator-recommendation-scroll-qa/baseline/`: status, worktree diff, and 13 affected target copies. Baseline five-file suite: 108 tests passed.
- Implemented shared target projection, category-specific skip UI, room/source/rule/revision-scoped local skip decisions, skip-aware dismissal, and save/reload coverage. Skips are never serialized or confused with included scope.
- Implemented a measured local work area containing tabs/Messages, toolbar, room rail, basket shortcuts, and one keyboard-accessible recommendation/item pane. Basket jumps scroll that pane. Row action menus use an unclipped portal and restore focus. Existing compact item styles remain.
- Added opt-in synthetic scrolling/recommendation scenarios. Read-only synthetic chat enables actual Messages checks only in this QA scenario; default permissions and production APIs are untouched.
- Integrity review found no confirmed defects in product changes or the subsequent isolated synthetic chat fixture.
- Final verification: 184 tests passed across the six planned files; frontend typecheck and production build passed; `git diff --check` passed. Existing Vite warning: chunks exceed 500 kB. There is no lint script.
- Actual browser wheel tests at 1440×900, 1024×768, and 390×844: control positions and outer page position remained identical while item scroll increased by 700 px. Desktop pane bottom also contained an additional wheel gesture without page movement. Short 844×390 layout had no horizontal overflow and retained a positive pane height.
- Effective viewport 720×450, equivalent to a 1440×900 viewport at 200% browser zoom: final row and Save draft remain reachable, without horizontal page overflow. This is responsive zoom-equivalent coverage; browser-chrome zoom was not independently exercised.
- Browser checks passed for optional skip/source retention/target exclusion, required no-skip/ordinary dismissal, Summary/Proposal/Builder transitions, mobile dialog layout, lower-row menu placement, and keyboard return to the menu trigger.
- Messages is visible in the fixed controls on desktop/mobile and opens the actual synthetic project conversation. Read-only sending remains disabled. The harness uses a memory router; navigation was verified by rendered destination, not browser URL changes.
- Automated rendered accessibility: 20 workspace checks and 13 settled-modal checks passed, no violations; color contrast remains incomplete because axe could not preload assets. An initial scan during the existing modal opening animation was rerun after settling. Keyboard/focus checks supplement this partial automated coverage. No application console errors observed; the axe preload warning is retained in the QA logs.
- Broader frontend/backend/OCR and replica-set suites were not run: no backend contract, persistence, or transaction changed. No migration, dependency, external send, commit, push, or deployment performed.
- Logs and screenshots: `/tmp/lisno-estimator-recommendation-scroll-qa/`. Temporary browser logs are moved there before handoff; generated build files remain ignored.

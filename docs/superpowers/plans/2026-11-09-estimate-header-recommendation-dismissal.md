# Estimate header actions and recommendation dismissal task plan

Date: 2026-11-09
Status: specification and task plan approved by the user; execution Mode A selected. T0–T5 complete, including independent integrity review and final verification.

Source of truth: [approved specification](../specs/2026-11-09-estimate-header-recommendation-dismissal-design.md).

## Outcome and boundaries

Place Check tier comparison immediately after the Sub Basket info icon in the same desktop header row as Remove Sub Basket. Automatically close the Sales recommendation popup after an accepted Add once the updated selection and recommendation result confirm no outstanding suggestions or review issues.

Preserve Direct items placement, Client/non-popup recommendations, comparison/PDF behavior, Main Line tier/pricing rules, the tier-info dialog, removal confirmation, and the earlier Sales refresh-warning fix. No backend, dependency, lockfile, rule, persistence, or general styling changes.

This gate creates only the task-plan file. Implementation follows plan approval and the execution-choice gate. Keep one parent task in progress: implement and verify these two refinements.

## Baseline and ownership safety

The existing dirty set belongs to the completed tier/info and warning work: shared builder/tier controls and tests, configured builder/workspace/pricing helper and tests, estimator CSS, seven new tier/info files, and prior specifications/plans. Preserve all of it. Recommendation components and their tests currently have no changes.

Before writers begin, capture status and relevant target diffs again. Read each dirty target before assigning it. Never revert, stage, reformat, or overwrite unrelated changes. Root owns integration, documentation, and reconciliation of shared contracts.

## Integration contracts

- **Inline comparison:** add an opt-in inline presentation for comparison-only use in `EstimateSubBasketModes`. Reuse its existing trigger, request, disabled explanation, dialog, and PDF. Default callers keep their current wrapper and presentation. Inline markup must be valid inside the existing heading-action area and must not contain nested controls.
- **Header wiring:** use the current `headingActions` slot for info followed by inline comparison, and stop supplying the duplicate lower `headerActions` for staff Sub Baskets. Keep Direct items on its current path. Preserve the surrounding count, subtotal, collapse, and trailing removal controls. Prefer the existing shell contract; change the shell only if semantic or responsive layout requires a bounded adjustment.
- **Sales opt-in:** add an optional completion descriptor to the shared recommendation presentation, supplied only by the staff adapter for the Sales popup. Existing consumers omitting it retain their behavior.
- **Completion data:** the descriptor carries a stable actor/estimate/room interaction key, the outstanding unselected count from the full authorized recommendation list, confirmation of currently selected target IDs from the draft, and whether loading/review state prevents a completion decision. Root can reuse the builder's existing full-room `includedTargets` set. Match targets with `recommendationTargetIdentity`, not names or row positions.
- **Identity:** reuse the existing actor/review/role/estimate context supplied to the builder and combine it with the active room ID. Do not use a source-query fingerprint as the stable interaction key: a successful Add changes that fingerprint. Current query state still determines when results are ready.
- **Completion state:** only an accepted Add arms pending completion for its stable target/context. Require post-update selection acknowledgement and a current ready result. Zero outstanding suggestions and no review issue closes once; remaining suggestions keep the popup open and finish that pending interaction. Loading, errors, stale/forbidden state, or unresolved review issues cannot be treated as completion.
- **Cancellation and focus:** manual close, context change, and Remove cancel pending Add completion. A manually reopened selected-only popup remains usable. Reuse the existing close path, clear pending focus intent, and let Dialog restore focus. Keep the existing success announcement available once after automatic closure, without adding a toast or confirmation.

## Dependency-ordered tasks

### T0. Reconcile baseline and settle contracts

Owner: primary agent. Depends on the required approval gates.

Record the baseline and assign the non-overlapping slices below. Confirm the completion descriptor and inline comparison interface before dependent integration. Tell every writer that other agents share the worktree and unrelated edits must be preserved. Routine internal prop names may follow repository conventions without changing the approved behavior.

Acceptance: preservation and consistent contracts supporting AC1–AC6.

### T1. Prepare inline comparison presentation and header styling

Owner: one frontend implementer in Mode A; primary agent in Mode B. Depends on T0.

Exclusive files:

- `frontend/src/features/estimates/EstimateSubBasketModes.tsx` and its test file.
- `frontend/src/features/estimates/estimate-sub-basket-modes.css`.
- `frontend/src/styles/estimator-dashboard.css` for only the affected header selectors.
- `EstimateBuilderShell.tsx` and its test file only if existing heading slots need a bounded semantic/layout adjustment; report that dependency before editing.

Add inline comparison-only presentation without changing default consumers or dialog/PDF internals. Preserve accessible disabled reasons. Style the existing header so name, info, comparison, count/amount/collapse, and removal fit one desktop row and wrap in order at narrow widths. Add no new toolbar or strip. Validate standalone inline/default rendering and comparison open/close/download behavior.

Acceptance: AC1, AC2, and the shared-control portion of AC6. Run focused comparison and any changed shell tests.

### T2. Implement Sales recommendation completion behavior

Owner: second frontend implementer in Mode A; primary agent in Mode B. Depends on T0. Can run alongside T1.

Exclusive files:

- `frontend/src/features/estimates/EstimateRecommendations.tsx` and its test file.
- `frontend/src/features/leads/EstimatorRecommendations.tsx` and its test file.

Derive outstanding suggestions before pagination in the staff adapter. Implement optional pending-Add completion in the shared presentation, acknowledging the added target in the current draft before acting. Use current readiness rather than assuming every Add causes an observable loading render; cached current results may settle immediately.

Test final Add closure, retained selected/Remove rows, another-page suggestions, newly introduced suggestions, loading-empty lists, errors/stale/forbidden states, unavailable/historical review issues, and rejected Adds. Cover manual reopening, Remove, manual dismissal during loading, context changes, late results, focus restoration, and a single success announcement after closure. Existing default/non-popup behavior stays unchanged.

Acceptance: AC3–AC6. Run shared presentation and staff adapter tests. This owner does not edit builder/workspace files or CSS.

### T3. Wire the two refinements into the staff workspace

Owner: primary agent. Depends on T1/T2 interfaces being ready; read-only preparation may run in parallel.

Owned files:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and relevant builder tests, including `ConfiguredEstimateBuilder.tierInfo.test.tsx`.
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx`.
- `LeadEstimateWorkspace.tsx` only if the existing context cannot supply the required identity; preserve its warning and tier changes.

1. Render info plus inline comparison in the Sub Basket heading, removing its lower comparison strip. Keep Direct items unchanged and avoid empty heading-action fragments for groups with no controls.
2. Pass Sales-only completion context and the existing complete selected-target identities to the staff adapter. Do not change Add/Remove mutations, recommendation queries, rules, or backend authorization.
3. Update workspace tests that intentionally expected the final Add popup to stay open. Preserve tests for selection persistence, one-item mutations, chained recommendations, manual prices/quantities, source-room isolation, saving, and rejection behavior.
4. Confirm all review/error states remain discoverable and that late results cannot close a newly opened popup in another context.

Acceptance: AC1–AC6 with real workspace interaction evidence, not only isolated component behavior.

### T4. Review the integrated result

Owner: `integrity_reviewer` in Mode A; primary agent in Mode B. Depends on all writers finishing.

Review the integrated changes read-only: full-list versus page counts, target acknowledgement, readiness races, actor/estimate/room boundaries, manual reopening, focus/announcements, valid header semantics, unchanged comparison/PDF and removal behavior, and preservation of prior work. Root resolves confirmed findings before final checks. Do not run final verification against concurrent product edits.

Acceptance: integrated review of AC1–AC6.

### T5. Verify and hand off

Owner: `verification_runner` after review in Mode A; primary agent in Mode B. No product edits during final verification.

From `frontend/`, run:

1. `npm test -- src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/EstimateSubBasketModes.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.tierInfo.test.tsx`
2. Prior behavior/shared-consumer checks: `npm test -- src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/client/ClientEstimateTiers.test.tsx`. Discover and include any additional direct shared recommendation consumers affected by a changed public prop contract.
3. `npm run typecheck` and `npm run build`.
4. Rendered desktop/mobile checks with synthetic data: exact header order and one desktop row, long names and wrapping, independent controls, keyboard focus, final Add automatic close, chained/off-page suggestions staying open, manual reopening, and no unexpected saves or network errors.

At repository root, run `git diff --check`, inspect the final diff, and capture `git status --short`. Remove only task-owned temporary browser files and stop only task-owned sessions; report any standard ignored build outputs.

Broaden testing only for a new shared-behavior concern or unresolved failure. The previous full frontend run and isolated failures are documented in the [prior tier task plan](2026-11-09-main-line-tier-selection-suggestions.md); do not repeat that known baseline merely for a new count or repair unrelated failures. Use a single worker when isolating contention failures. No lint script exists. Backend/OCR tests and migrations are outside this frontend-only scope.

## Execution ordering and final report

- Mode A: T0 → T1 and T2 in parallel → T3 integration → T4 review/fixes → T5 verification. The two implementation owners have disjoint paths; root owns shared integration and documentation.
- Mode B: primary agent performs the same work inline without implementation subagents.
- Report implemented behavior, principal files, exact checks/results, unrun checks and limitations, and generated outputs. Never claim checks passed without running them.
- No commits, pushes, deployments, seeding, production changes, external messages, or dependency additions are authorized.

## Implementation and verification evidence

Implemented only the approved header placement and Sales recommendation completion behavior. `EstimateSubBasketModes` supports inline comparison-only rendering; the configured builder places it after information in the existing heading slot. Direct items keep their original comparison placement. `EstimateRecommendations` receives an optional completion descriptor; `EstimatorRecommendations` derives outstanding targets from the full authorized list, and the builder supplies current draft target identities plus stable actor/estimate/room context. Existing Add/Remove and query operations are reused.

Ownership: `header_actions` delivered T1; `recommendation_completion` delivered T2; primary agent completed T0/T3 and browser checks. `header_popup_integrity` reviewed the integrated changes with no confirmed defects. `header_popup_verification` ran final checks after all writers finished. Existing dirty changes were preserved using the initial status and `/tmp/lisno-header-recommendations-before.patch` as baseline.

Final checks (all exit 0):

- The exact ten-file focused command listed in T5, with `--maxWorkers=1`: **212 tests passed across 10 files**.
- `cd frontend && npm test -- src/features/client/ClientQuotation.recommendations.test.tsx --maxWorkers=1`: **9 tests passed** for the additional direct shared consumer. Total: **221 tests, 11 files**.
- `cd frontend && npm run typecheck`: passed.
- `cd frontend && npm run build`: passed; 3345 modules transformed. Existing chunk-size warning remains (main JavaScript 3335.44 kB, CSS 1575.20 kB).
- `git diff --check`: passed; final status and diff inspected.

Logs: `/tmp/lisno-header-popup-final-{focused,client,typecheck,build}.log`. Root's earlier workspace integration check also passed 28 tests across the workspace recommendation and builder tier-info suites.

Rendered checks used local synthetic data with the actual builder, shared dialogs, and workspace container:

- Desktop 1440×1000: disclosure, info, comparison, and trailing removal share one center line; no horizontal overflow or duplicate comparison strip. The comparison includes Mode and its PDF download remains functional.
- Mobile 390×844: normal and long Sub Basket names wrap in DOM/action order with no horizontal overflow; info, comparison, and removal have 44 px touch targets inside the actual workspace container.
- An accepted final Add closes after current ready results, adds once, returns focus to Recommendations, and retains one existing success receipt. No save/submit or unrelated draft update occurs.
- During a delayed source refresh the popup remains open. A newly introduced suggestion keeps it open, and the second/final Add closes it. Manually reopening selected-only rows stays open for removal.
- Information contents still load on demand, and Escape restores the info/comparison trigger. A fresh final page produced no application console or network errors. An initial fixture-only favicon 404 was removed from the synthetic fixture before final checks.

Full frontend suite was not rerun: the approved plan preserves the previously established unrelated failures. No backend/OCR checks, lint (no script), migration, external mutation, commit, push, or deployment was performed. Actual assistive-technology announcement frequency was not measured; DOM receipt uniqueness, accessible controls, keyboard interaction, and focus restoration were checked.

Temporary browser fixture, screenshots, console logs, and synthetic downloaded PDF were removed after verification; only the task-owned browser/server sessions were stopped. Standard ignored outputs remain at `frontend/dist/` and `frontend/node_modules/.tmp/*.tsbuildinfo`.

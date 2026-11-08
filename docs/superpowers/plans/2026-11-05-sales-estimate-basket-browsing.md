# Restore Sales Sub Basket browsing: task plan

Date: 2026-11-05
Status: Complete. Specification and task plan approved; implementation, independent review and integrated verification completed in Mode A.

Source of truth: [approved specification](../specs/2026-11-05-sales-estimate-basket-browsing-design.md).

## Outcome and boundaries

Sales working drafts will display available items directly under the selected Main Basket/Sub Basket hierarchy for the active room. Available items start unchecked. Only explicit edits or selections create local draft state, and only included items affect totals. Preserve saved values, exclusions, Configuration freshness, recommendation cleanup, and existing save/publication restrictions.

This is a bounded frontend correction. Preserve the completed Client pre-submission visibility fix and the existing Client, Designer, other-role, submitted, approved, closed and historical presentation. Do not restore eager rooms × catalogue draft creation or revert the earlier commit wholesale. No backend/API/schema changes, dependencies, lockfile changes, global restyling, migrations, production mutations, commits, pushes or deployment are planned.

## Baseline and ownership

At plan creation, these existing Client-task paths are dirty and remain outside implementation ownership:

- `frontend/src/features/client/ClientEstimationWorkspace.test.tsx`
- `frontend/src/features/client/ClientProject.estimateReview.test.tsx`
- `frontend/src/features/client/ClientProject.tsx`
- `frontend/src/features/client/ClientQuotation.tsx`
- `frontend/src/features/workflow/ProjectWorkflowPanel.test.tsx`
- `frontend/src/features/workflow/ProjectWorkflowPanel.tsx`
- `docs/superpowers/specs/2026-11-05-client-pre-submission-visibility-design.md`
- `docs/superpowers/plans/2026-11-05-client-pre-submission-visibility.md`

The approved Sales specification is also untracked. Sales implementation targets currently have no local diffs. Recheck status and capture per-target diffs before writers start; understand and preserve any intervening work. The primary agent owns this plan, product interpretation, integration contracts and shared-worktree reconciliation. Every writer must be told that other agents may be working and that they must not revert or modify another owner's paths.

## Integration contract

1. Add an explicit opt-in Sales catalogue presentation to `ConfiguredEstimateBuilder`. Its default preserves the current selected-only/picker behavior for other callers. Choose the opt-in from authenticated Sales role and stable working-draft lifecycle in `LeadEstimateWorkspace`, independently of transient `editable` restrictions. Existing permissions still control every action.
2. Derive display rows from the authorized current catalogue, selected Main Basket IDs and active room only. Use `createConfiguredLine` for fresh defaults. Overlay actual drafts by stable room/Main Line identity only when basket/Sub Basket grouping is compatible. Keep source-missing or incompatible saved lines in the existing correction path; do not silently move them or create a competing actionable preview.
3. Keep catalogue previews separate from `configuredDraftLines`, dirty fingerprints, pricing hooks, recommendations and save serialization. Reuse `ConfiguredLineRow` to render both previews and real drafts.
4. Route changes to an existing draft through the established update path. A change to a preview must carry explicit room and catalogue target IDs to a workspace callback, which revalidates room, selected basket, current catalogue, grouping and editability before materializing one excluded draft and applying the edit. Inclusion occurs only when explicitly requested. Do not reconstruct target identity from display names or parse opaque row keys.
5. Existing draft updates retain manual pricing, dimensions, tier/mode/component values, persisted IDs and recommendation-origin rules. Save payload inclusion stays `included || persistedId`. Display derivation must be pure and must not call setters during render.
6. Keep selected counts and amounts based on real included rows. Search/filter acts on the complete active-room display set before any group-local rendering bound. Resolve excluded-review ownership so each line has one actionable editor while validation remains discoverable.
7. Prefer existing shell/row styles and pagination controls. If a rendering bound is necessary, add only optional presentation slots to `EstimateBuilderShell`, with unchanged defaults for other consumers. Each populated group must show headings and initial choices immediately; there must be no global Add items barrier in Sales browse mode.

The primary agent settles exact TypeScript signatures at T1 and shares them before independent writers begin. Names/signatures may be adjusted within this contract without changing approved behavior. A required backend change or material scope change returns to the affected approval gate.

## Dependency-ordered tasks

### T1. Confirm boundaries and establish regression fixtures

Owner: primary agent. Dependencies: task-plan approval and execution-mode choice. Acceptance: AC1, AC4, AC5, AC7, AC8.

- Capture current status and target diffs; preserve the baseline above.
- Confirm Sales role mapping and draft lifecycle at the workspace call site, including reopened drafts and transient save/refetch locks.
- Establish fixtures with two unequal rooms, two selected Main Baskets, multiple Sub Baskets, direct and Sub Basket temporary items, distinct stable IDs, one saved manual line and one persisted excluded line.
- Fix the display-helper and preview-edit callback contracts described above. Confirm grouping-conflict and excluded-review ownership before dividing work.
- Add or identify a regression that fails on the current picker-first Sales presentation. Retain default-mode tests that protect other roles.

Exit evidence: agreed file boundaries/signatures and a reproducible zero-selection Sales case. Keep T1 as the only active parent task until the contract is settled.

### T2. Build active-room display projection and restore the hierarchy

Parent owner: primary agent. Dependency: T1. Acceptance: AC1, AC2, AC3, AC5, AC6, AC8.

Two non-overlapping slices may run in parallel in Mode A:

**T2a: Pure display projection.** Owner: a bounded frontend implementer; exclusive paths `frontend/src/features/leads/salesEstimateCatalogue.ts` and `salesEstimateCatalogue.test.ts`.

- Implement active-room catalogue projection and compatible saved/draft overlay using existing configured-line helpers, without changing shared sparse draft construction.
- Cover selected-basket filtering, supported temporary items, empty groups, stable keys, saved overrides, persisted exclusions, source/grouping conflicts and duplicate prevention.
- Verify that deriving or filtering rows does not mutate inputs, include rows or create data for other rooms. Include the 1,000-item fixture.

**T2b: Sales builder presentation.** Owner: a separate frontend implementer; exclusive paths `ConfiguredEstimateBuilder.tsx`, `ConfiguredEstimateBuilder.test.tsx`, and, only if necessary, `frontend/src/features/estimates/EstimateBuilderShell.tsx` and its test.

- Add the opt-in mode, consuming the settled projection contract. Render selected Main Basket/Sub Basket headings and unchecked available rows immediately.
- Use the main search/filter for available and saved rows. Preserve room navigation, collapse state and basket jump targets even with zero included items.
- Reuse inline row controls; keep deselected rows and focus targets in place. Call the explicit preview-edit callback for new rows and the existing update callback for drafts.
- Hide the duplicate picker in this mode. Show honest empty/loading/error/source-conflict states and preserve disabled-action guards during refresh.
- Preserve selected-only totals/counts, scoped removal controls and recommendations. Avoid duplicate excluded-review editors.
- Bound large rendered groups if needed using existing pagination conventions; search the full group before paging, reset/clamp pages on room/search/catalogue changes, and retain initial visible choices.

Both writers may read shared files but must not change the workspace, configured pricing/state helpers, Client paths or one another's files. In Mode B the primary agent performs both slices sequentially. Tests run during concurrent edits are provisional.

### T3. Integrate sparse edits and Sales lifecycle selection

Owner: primary agent. Dependency: T2 completed and reconciled. Exclusive paths: `LeadEstimateWorkspace.tsx`, relevant `LeadEstimateWorkspace*.test.tsx`, and, only if reuse requires a minimal shared helper change, `configuredEstimate.ts` with its focused tests. Acceptance: AC2, AC3, AC4, AC5, AC6, AC7.

- Opt Sales working drafts into catalogue browsing using stable lifecycle state. Keep historical/submitted/approved/closed and non-Sales presentations unchanged.
- Implement guarded single-row materialization for explicit preview edits/selections. Preserve excluded local edits across room changes, searches and basket navigation.
- Reuse current pricing/default-classification/dimension and recommendation cleanup logic; do not duplicate calculation rules. Confirm display-only rows never enter in-house pricing requests, draft fingerprints, totals or save payloads.
- Verify saved manual rate, classification, tier, pricing mode, dimensions and components survive the supported save/reopen and refresh paths.
- Preserve group-removal confirmations, persisted exclusions, stale-source errors and current Configuration compatibility checks.

Exit evidence: integrated builder/workspace tests cover explicit selection, room isolation, no browse-induced dirty state, minimal payloads, exclusion persistence and lifecycle/role boundaries.

### T4. Review the integrated result and resolve defects

Owner: `integrity_reviewer` in Mode A; primary agent in Mode B. Dependency: all T2/T3 writers finished. Read-only review; fixes return to the assigned owner. Acceptance: AC1–AC7.

- Review stable identity and grouping joins, preview/state separation, payloads and dirty detection, totals/pricing requests, exclusion/recommendation behavior and refresh races.
- Review role/lifecycle opt-in and unchanged Client/default behavior, including optional shared-shell defaults.
- Inspect the final diff against the captured baseline; ensure unrelated dirty paths were preserved.
- Resolve confirmed findings and rerun the affected checks before final verification.

### T5. Verify behavior, rendered interaction and builds

Owner: `verification_runner` in Mode A after T4 fixes; primary agent in Mode B. No concurrent product writes. Acceptance: AC1–AC8.

Run focused regression checks first, then the required typecheck/build and rendered checks described below. Record exact commands, counts, results and remaining limits here. Failed checks return to the owning task; rerun only affected checks unless the fix broadens risk.

### T6. Reconcile and hand off

Owner: primary agent. Dependency: T5 passed or any unresolved limitation accurately documented.

- Review final diff/status and ensure every acceptance criterion has evidence.
- Clean task-created browser/test artifacts and stop only task-owned servers/sessions. Record regenerated ignored build outputs.
- Update this plan with completed tasks, checks, unrun checks and any remaining risks.
- Report the Sales outcome, affected files, preserved Client behavior and verification. Do not claim completion for partially verified work.

## Verification matrix

| Criteria | Required evidence |
| --- | --- |
| AC1 | Rendered Sales zero-line draft immediately shows both selected baskets, Sub Baskets and unchecked rows; no picker action; selected count and total unchanged. |
| AC2 | Main search finds a never-selected item; filter, jump and collapse work; two unequal rooms keep independent edits and selections. |
| AC3 | Include one item, edit it, deselect and reselect; siblings stay excluded; values and focus persist; only included rows contribute to the current total. |
| AC4 | Workspace save/reopen tests preserve saved manual/tier/mode/dimension/component choices; browsing and display-only rows do not alter dirty state, payloads or pricing requests. |
| AC5 | Persisted exclusions and group removals remain excluded; refresh updates current Configuration-owned fields; incompatible saved grouping stays visible for correction without a second actionable copy. |
| AC6 | Pending/failed/stale refresh, incomplete price, unavailable source, grouping conflict and genuinely empty groups retain honest messages and guarded actions without losing local edits. |
| AC7 | Sales draft versus non-Sales and historical/submitted/approved/closed fixtures; existing Client visibility and quotation regressions; shared-shell default-mode coverage if modified. |
| AC8 | Desktop 1440×900 and mobile 390×844 mocked browser interactions, keyboard/focus and accessibility checks, no horizontal overflow or unexpected console/network errors; 1,000-item case with bounded rendering and no rooms × catalogue draft state. |

### Automated checks

From `frontend/`, run the tests for newly added projection coverage and changed Sales builder/workspace behavior, including these established suites as applicable:

```sh
npm test -- src/features/leads/salesEstimateCatalogue.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/EstimateItemPicker.test.tsx
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx
npm test -- src/features/leads/configuredEstimate.test.ts src/features/leads/configuredEstimate.dimensions.test.ts src/features/leads/configuredEstimate.componentPricing.test.tsx src/features/leads/useEstimateInHousePricing.test.tsx
npm test -- src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/ProjectDesignRequirementsPanel.test.tsx src/features/client/ClientEstimateRequirements.test.tsx
npm test -- src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx
npm run typecheck
npm run build
```

Use mocked authorized fixtures for browser verification; do not change real estimates, seed databases or call production write endpoints. Record visible empty-draft hierarchy, selection/deselection, room switching, search/filter, transient disabled state, historical boundaries, keyboard focus and the large catalogue case. Check overflow at both widths and use the available accessibility tooling, disclosing any excluded rules.

At repository root run `git diff --check` and `git status --short`, and inspect the scoped final diff. There is no repository lint script. Full frontend, backend and OCR suites are not planned for a frontend-only correction unless implementation evidence requires expanding checks; report them as unrun when applicable.

## Progress and evidence log

- Specification: approved before this plan was created.
- Task plan: approved.
- Execution choice: Mode A selected for this correction.
- T1: complete. Sales targets have empty baseline diffs; six existing Client source/test files captured by hash for preservation. Sales role is `estimator_sales`; stable mode uses working-draft lifecycle, independent of transient edit locks.
- T2: complete. Projection owner reports 11 passing tests; final builder/shell/picker slice has 39 passing tests. Sales uses `itemPresentation="catalogue"` and `onUpdateAvailableLine(roomId, target, change)`; other callers retain defaults. Direct hierarchy regression was observed failing before the builder change.
- T3: complete. Sales workspace opts in by stable lifecycle and explicitly materializes one edited row through the existing pricing/update logic. Raw-edit baselines protect excluded local edits. New workspace tests cover direct browsing, clean state, isolated edits, save/reopen, remote hydration and role/lifecycle limits. Existing workspace test assertions updated for visible unchecked rows. All six workspace suites passed integrated verification.
- T4: complete. Independent review found and rechecked one P2: clearing a persisted excluded row's quantity moved its active editor into review. Focused compatible rows now remain inline during typing; leaving the row hands unresolved errors to review. Real clear/type, invalid-rate blur and keyboard deselection tests cover the fix. No remaining material findings.
- T5: complete. Final automated verification passed 386 tests across 23 files. Initial final typecheck identified missing fields in the new lifecycle fixture; those fixture fields were corrected, the affected 10 tests passed again, then typecheck and build passed. No product changes followed the integrated regression run.
- T6: complete. Final scoped diff and status inspected; all six prior Client source/test hashes unchanged. Browser/server stopped and task-created temporary fixtures/screenshots removed. No source edits by review or verification agents.
- Product implementation: complete, started only after all approvals.
- Tests/build/browser checks: complete as detailed below. Earlier diagnostic 20-test pass remains baseline evidence only.
- External actions/migrations: none performed or required.

All implementation gates and verification tasks are complete.

## Final verification record

The final integrated regression command was run from `frontend/`:

```sh
DEBUG_PRINT_LIMIT=500 npm test -- src/features/leads/salesEstimateCatalogue.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/EstimateItemPicker.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/configuredEstimate.dimensions.test.ts src/features/leads/configuredEstimate.componentPricing.test.tsx src/features/leads/useEstimateInHousePricing.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/ProjectDesignRequirementsPanel.test.tsx src/features/client/ClientEstimateRequirements.test.tsx src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx
```

Result: 386 tests / 23 files passed, exit 0, 15.91 seconds. After correcting only the new approval-history fixture's required fields, `DEBUG_PRINT_LIMIT=500 npm test -- src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx` passed all 10 tests again.

- `npm run typecheck`: passed, exit 0.
- `npm run build`: passed, exit 0; Vite 9.52 seconds. Bundle warning for chunks over 500 kB; main JS 3,262.80 kB. No dependency or bundling redesign was in scope.
- `git diff --check`: passed. Final `git status --short` contains the preserved Client work and intended Sales source/test/document changes only.
- Independent hash check: all six pre-existing Client source/test files unchanged by this task.

Real Chromium browser verification used the local Vite app and fully intercepted synthetic API data, including local-only save simulation. No real API writes occurred. Checked desktop 1440×900 and mobile 390×844:

- Direct Main Basket/Sub Basket hierarchy, six available unchecked rows, selected count zero and no duplicate picker.
- Main search, basket filter, collapse/jump, unequal-room isolation and retained excluded quantity/manual-rate edits.
- Keyboard inclusion/deselection/reselection with stable focus and correct totals; each save serialized exactly one line. Persisted exclusion replacement typing kept the same focused input mounted.
- Pending and deliberately failed catalogue refresh preserved rows and edits while disabling additions; retry recovered. Only the deliberately simulated 503 requests produced console errors; no unexpected requests or runtime errors occurred.
- Axe-core checks of `.estimate-workspace` reported zero violations at both widths, with no rules excluded. Screenshots visually inspected; no document horizontal overflow at either width.
- Submitted-state checks at both widths showed only the saved disabled row, retained its manual price and exposed no catalogue picker or new rows.
- 1,000-item catalogue at both widths rendered 20 rows per group page; search found item 999 outside the first page, and saving it serialized one row. Sampled search completion was 47 ms desktop / 22 ms mobile; these fixture observations are not a production performance benchmark.

Together with the focused suites, these checks cover AC1–AC8. Existing historical, Designer, Client, grouping/conflict, dimensions, components, pricing and exclusion regressions passed. Explicit Sales v3 fixtures verified that closed edits stay read-only while an editable revision retaining an earlier final approval remains browseable.

Temporary artifacts used `/private/tmp/lisno-sales-*` for browser fixtures, scripts, screenshots and the prior-work hash manifest, plus task-specific `/private/tmp/.playwright-cli/` logs/snapshots. These task artifacts were removed after verification. The task-owned browser session and Vite server were stopped. Existing ignored `frontend/dist/` and `frontend/node_modules/.tmp/tsconfig.{app,node}.tsbuildinfo` were regenerated by the required build.

Full frontend/backend/OCR suites were not run; no lint script exists. No migrations, dependencies, lockfile changes, live data changes, commits, pushes or deployment were performed. The build's bundle-size warning remains outside this bounded correction.

# Estimate stage actions and recommendation cleanup: task plan

Date: 2026-11-09
Status: Implemented and verified in Mode A
Specification: [Approved design](../specs/2026-11-09-estimate-stage-actions-recommendation-cleanup-design.md)
Specification approval: User replied “Approved”.

## Delivery boundary

Implement the three approved frontend changes: setup-only navigation before item selection, removal of empty recommendation-only basket groups, and a compact standard recommendation dialog. Preserve existing estimate permissions, submission validation, excluded saved rows, totals and approval history. No backend/API/schema changes, dependencies or production actions.

## Ownership and parallelism

- Primary agent owns `LeadEstimateWorkspace.tsx`, its workspace/checklist/collaboration tests, `LeadEstimateRecommendations.test.tsx`, shared integration decisions and these documents. Action placement and recommendation state transitions share this page and must have one writer.
- In Mode A, one frontend agent owns `salesRecommendationScope.ts`, `salesRecommendationScope.test.ts`, `ConfiguredEstimateBuilder.tsx` and `ConfiguredEstimateBuilder.test.tsx`, limited to basket/group visibility and cleanup helpers.
- A second frontend agent owns `EstimateRecommendations.tsx`, `EstimateRecommendations.test.tsx` and recommendation-specific rules in `estimateSelection.css`, limited to the modal popup conversion and compact styling.
- The primary agent owns any necessary adapter changes in `EstimatorRecommendations.tsx` or popup prop plumbing. Keep existing props compatible while parallel slices are underway; remove obsolete positioning refs only after all callers are reconciled.
- Every writer must preserve others' existing changes, stay within assigned paths and return cross-boundary changes to the primary agent. No worker may edit shared `Dialog` behavior or global typography.
- In Mode B, the primary agent performs the same work sequentially. Final integrity review follows completed writers; final verification follows resolution of review findings.

## Dependency-ordered work

### 1. Capture the baseline and settle scope-state rules

Owner: Primary agent. Begins only after task-plan approval and execution-mode selection.

- Record the initial dirty-path set and exact diffs/copies of affected files. Preserve prior pricing, group-tier, Client view and publication work.
- Recheck saved hydration, explicit setup selection, recommendation additions, ordinary additions, browse promotion, all removal paths and serialization. Establish which state represents explicit selection versus a recommendation-only basket before parallel edits.
- Freeze the helper inputs/outputs: stable basket/room identity, included lines, recommendation-only membership and explicit browse/setup intent. Distinguish global selection cleanup from current-room display filtering.
- Preserve saved excluded rows. Cleanup may remove empty automatic scope, never historical line records or approved amounts. Where persisted origin is ambiguous, do not invent provenance or delete explicit selections; resolve presentation conservatively within the approved no-schema-change scope.
- Record the interface used between the workspace and builder before assigning writers.

Acceptance: AC3–AC5; explicit cross-room, provenance and persistence invariants agreed before edits.

### 2. Correct action placement

Owner: Primary agent. Depends on Task 1; can run alongside Tasks 3 and 4.

- Remove setup-specific Save draft and the footer exception that exposes submission actions in `configure` view.
- Keep Continue, clear/count and existing necessary navigation on setup. Keep save/publication actions on item-selection and subsequent review views according to current role capabilities.
- Preserve important recovery state outside the hidden setup footer when required; restore the existing feedback/actions when returning to the builder. Do not add autosave or change publication authorization.
- Update tests that currently require Submit on empty Setup or in every editable Sales view. Replace them with stage-specific assertions; retain actionable Submit checks in the builder, Designer submit-only behavior, stale/access failures and duplicate-request protection.

Acceptance: AC1–AC2.

### 3. Remove empty recommendation-only groups

Owners: Scope/builder agent for helpers and rendering; primary agent for workspace state and integration tests. Depends on Task 1; can run alongside Tasks 2 and 4 with the agreed interface.

- Extend the existing cleanup mechanism so removal of the last recommended line removes obsolete automatic basket scope when no included lines remain across rooms.
- Apply the rule consistently for popup Remove, row exclusion, Sub Basket removal and source-dependent exclusions. Clear obsolete room browse state without clearing explicit setup or independent selection intent.
- Filter current-room empty recommendation-only Main Basket/Sub Basket wrappers and related zero-item navigation/filter entries. Keep deliberately browsable setup baskets and the existing excluded-row review where required.
- Preserve a basket used by another room; keep each remaining line's identity, quantity, price and classification intact.
- Re-adding the recommendation restores only its target item and grouping. Verify serialization and hydration do not recreate the removed empty shell.
- Add asymmetric regression cases: two rooms with different selected items/totals; same-named baskets with distinct IDs; mixed manual/recommended items; explicit empty setup baskets; saved versus newly added recommendations; remove/re-add/save/reload.

Acceptance: AC3–AC5.

### 4. Convert the recommendation popup to the shared Dialog

Owner: Popup agent. Depends on Task 1; independent of Tasks 2 and 3 after the interface is agreed.

- Replace only the popup variant's positioned portal with the existing `Dialog`. Keep inline recommendations available to their existing consumers.
- Preserve room-scoped opening/dismissal, trigger reopening, authorized recommendation data, pagination, one-item Add/Remove behavior and loading/error/retry feedback.
- Use a scoped approximately 600px desktop maximum width, viewport-safe mobile width and internally scrollable content. Use 15–16px title, 12–13px text, 32–36px desktop actions and 44px touch targets.
- Use shared modal focus containment, Escape/backdrop close and focus restoration. Reconcile the existing add/remove focus logic with dialog lifecycle; retain focus safely if a recommendation or its source disappears.
- Remove obsolete custom position-measuring code after confirming no remaining consumer needs it. Avoid leaving two focus owners or duplicate close behavior.
- Adapt popup tests to real modal semantics. User-flow tests must close the modal before interacting with the background rather than bypassing focus/inert behavior. Keep inline regression coverage.

Acceptance: AC6–AC7, with AC3 one-item behavior preserved.

### 5. Integrate and review

Owner: Primary agent, then `integrity_reviewer` in Mode A. Depends on Tasks 2–4.

- Reconcile popup caller props, footer refs, active-room transitions and recommendation cleanup on the integrated worktree.
- Inspect the final diff against the baseline. Confirm no unrelated source changes were overwritten.
- Review all-room versus current-room scope, explicit selection preservation, saved excluded-row payloads, save/reload, totals, authorization and modal focus.
- Resolve confirmed findings before verification. No changes to pricing formulas, published history or backend mutation contracts are expected.

Acceptance: AC1–AC7; no unresolved task-related correctness findings.

### 6. Verify the integrated result

Owner: `verification_runner` in Mode A, primary agent in Mode B. Depends on Task 5 and all source writers finishing.

Focused tests from `frontend/`:

```sh
npm test -- src/features/leads/salesRecommendationScope.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/components/ui/Dialog.test.tsx
```

Then:

```sh
npm run typecheck
npm run build
```

Rendered checks with actual components/styles and synthetic data at desktop and mobile widths:

- Setup shows Continue and appropriate navigation, without the estimate submission footer. Entering the builder and returning to setup preserve local edits and show only stage-appropriate actions.
- Add one recommended Painting item, remove it and confirm the empty group disappears. Re-add and verify no sibling item is selected. Repeat with another room retaining an item, a manually selected sibling and an explicit setup basket.
- Save/reload using mocked persistence and verify the removed empty group stays absent while saved excluded rows remain intact.
- Confirm popup visual scale, long item labels, scrolling, pagination, pending/error/retry states, keyboard focus, Escape/backdrop close and post-removal focus restoration. Check for overflow, accessibility violations and fresh runtime errors.
- Do not start backend/OCR services solely for this frontend task or mutate customer data. Stop owned temporary frontend/browser processes and remove owned verification artifacts after inspection.

Repository hygiene:

```sh
git diff --check
git status --short
```

Run each focused slice during development, then verify the integrated result. If broader failures appear, establish whether they predate the task using captured inputs without reverting the live worktree. Report exact commands/results, any skipped checks and concurrent edits. This repository has no lint script.

### 7. Record delivery and limitations

Owner: Primary agent. Depends on Task 6.

- Update specification/plan status and record acceptance evidence, principal affected files, exact tests/build results and remaining limitations.
- Report the resulting button placement, empty-group behavior and compact popup concisely.
- Report retained ignored build/test outputs. No commit, push, deployment, migration or external communication is authorized by this task.

## Gate state

- Specification: approved.
- Task plan: approved.
- Execution mode: A, selected by user.
- Implementation: implemented, reviewed and verified; all seven acceptance criteria covered.


## Delivery and verification record

### Result

- Setup/Main Baskets shows Continue and appropriate navigation without estimate Save/Submit or the submission footer. Sales save/submit and Designer submit-only behavior remain available after item selection. Submission guards also require leaving Setup.
- Removing a recommendation hides its empty current-room Main Basket/Sub Basket group and removes its empty chip/filter entry. Other-room rows, independent items, explicit Setup choices and saved excluded records are preserved.
- Only automatic additions witnessed by the current editing session authorize deleting automatic selected-basket scope. Saved records do not distinguish whether Setup or recommendations introduced a basket, so ambiguous saved selection IDs/classifications remain authoritative. Empty saved groups are compacted for presentation. Setup Continue explicitly accepts the selected scope and restores normal browsing without selecting sibling items.
- Recommendations now use the shared Dialog, a 600px desktop maximum width, 16px heading, 13px content, 34px desktop actions and 44px touch actions. Inline recommendations retain their presentation. Removed custom popup geometry/focus ownership; shared modal behavior handles containment, Escape/backdrop and focus restoration.
- Integrity review found two related provenance/browse-intent issues during implementation. Both were fixed and covered by save/full-reload/remove/save/full-reload/Continue regression checks. Final review found no remaining confirmed defects.

### Affected files

Exactly ten frontend files differ from this task's captured baseline:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.checklist.test.tsx`
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx`
- `frontend/src/features/leads/salesRecommendationScope.ts` and `salesRecommendationScope.test.ts`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and `ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/estimates/EstimateRecommendations.tsx` and `EstimateRecommendations.test.tsx`
- `frontend/src/features/estimates/estimateSelection.css`

Existing pricing, group-tier, publication and Client view changes were preserved. No backend/API/schema change, new dependency, migration, commit, push, deployment or external communication occurred.

### Terminal verification

The exact ten-suite focused command in Task 6 exited 0: **288 tests passed across 10 suites**, 13.99s, with no failures or environment errors. Coverage includes stage navigation/recovery, Sales/Designer actions, one-item recommendation selection, current-room/global cleanup, persisted excluded rows, manual/explicit scope, full reload, stable IDs and dialog accessibility.

From `frontend/`, `npm run typecheck && npm run build` exited 0; both scripts passed sequentially. Build transformed 3,342 modules and Vite completed in 9.60s. The existing greater-than-500kB chunk warning remains (main JavaScript 3,322.86kB; CSS 1,571.32kB).

`git diff --check` and `git status --short` exited 0. All 17 monitored source/package/dependency hashes stayed unchanged during final verification. Exactly ten baseline targets changed; unrelated work remained intact.

### Rendered verification

**55 browser assertions passed** using the actual workspace, builder, dialog and styles with synthetic API data. Checked desktop 1440px and mobile 390px:

- Setup/build/return action placement and preserved choices.
- One-item recommendation add/remove/re-add, persisted exclusion and save/reload without empty-group resurrection.
- Unequal room quantities/totals and preservation of another room's recommendation/manual line.
- Explicit Painting Setup scope after save/full reload/removal, followed by Continue restoring unchecked Paint/Primer browsing.
- Desktop dialog width 600px, title 16px, content 13px, action height 34px; mobile action height 44px and no horizontal overflow.
- Keyboard containment, Escape/backdrop dismissal, focus return/post-removal focus, loading/error/retry, pagination and real internal scrolling (667px viewport with 2,453px scroll content; second page items 21–26).
- Automated accessibility audit: zero violations. No fresh page errors. Observed requests: 56 GETs and five mocked draft-save PUTs; no other mutations or live customer data writes.

Desktop/mobile screenshots were inspected by the browser agent and primary agent. Fixture-only navigation/locator timing issues were resolved before the passing final run; they did not require product changes.

### Limits and artifacts

The full frontend suite, backend/OCR/replica-set suites and migration checks were not run; the focused lane covers this frontend workflow. There is no lint script. No remaining task-specific correctness issue is known.

Build/test/typecheck refreshed ignored `frontend/dist`, `frontend/node_modules/.tmp/tsconfig.app.tsbuildinfo`, `frontend/node_modules/.tmp/tsconfig.node.tsbuildinfo` and Vitest results under `.vite`. Existing bundle size is the remaining build warning. Temporary browser/baseline/report cleanup is recorded below after owned processes stop.

Cleanup confirmed: the owned browser and fixture server on port 4192 were stopped; fixture files under `/private/tmp/lisno-stage-recommendation-browser`, screenshots under `output/playwright/lisno-stage-recommendation`, five confirmed-owned CLI artifacts, the captured baseline and two root JSON test reports were removed after inspection/recording. Existing services and unrelated logs/files were preserved.

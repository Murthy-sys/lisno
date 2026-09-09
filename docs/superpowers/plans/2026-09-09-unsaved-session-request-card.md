# Unsaved session request card — task plan

## Source of truth and gate status

- Approved specification: [Unsaved session changes beneath Revision history](../specs/2026-09-09-unsaved-session-request-card-design.md).
- The user approved that specification. Its original proposal-status text records the previous gate; this plan records the subsequent approval without rewriting the approved requirements.
- Specification and task plan approved; Mode A selected. Tasks 1–7 are complete. Integrated integrity review, 316 focused tests, frontend typecheck/build and scoped desktop/intermediate/mobile browser verification passed. Initial target diffs were clean; only these two working documents were untracked before writers started.
- The initial dirty set for planning consists only of the untracked approved specification. After this file is created, the expected dirty set is these two working documents. Recheck all target diffs before implementation and preserve any later unrelated changes.
- Acceptance criteria AC1–AC8 below refer to the approved specification. Only one parent phase may be in progress; task statuses will be updated here during execution.

## Confirmed boundaries

The change is a frontend-only, read-only projection of current editor state. The card is a sibling below Revision history, visible only for meaningful unsaved edits in the active Mode, Recommendation & Exclusions or Quality Parameter tab. It introduces no saving, persistence, permission, financial or backend behavior.

Draft ownership remains where it is today: Mode owns two independently saved blocks and nested local inputs; the workspace owns Recommendation & Exclusions; the shared-quality panel owns the basket checklist. Reference names come from existing catalogs and authoritative returned creation details by stable ID. Opening PMC/Execution panels and switching execution source remain viewing operations.

## Ownership and file boundaries

Paths are relative to `frontend/src/features/ai-estimator-knowledge/` unless otherwise stated. These are ownership boundaries for Mode A; Mode B performs the same tasks inline.

| Owner | Owned files / responsibility | No-overlap boundary |
| --- | --- | --- |
| Primary integrator | This task plan; new `knowledgePendingChanges.ts` and `.test.ts` for shared types/comparison primitives; new `KnowledgePendingChangesCard.tsx` and `.test.tsx`; `KnowledgeItemWorkspacePage.tsx`, `KnowledgeScreens.test.tsx`, `KnowledgeItemWorkspaceLayout.test.tsx`, `ai-estimator-knowledge.css`; `KnowledgeRevisionHistory.tsx` only if necessary for the rail wrapper | Owns the shared contract, workspace session lifecycle, recommendation baseline, integrated rendering, styles and final checks. Other owners request changes to these files. |
| Mode owner | New `knowledgeModePendingChanges.ts` and `.test.ts`; `KnowledgeModePanel.tsx`, `KnowledgeModeConfigurationBuilder.tsx`, `KnowledgeModeDescriptionEditor.tsx`, `KnowledgeModeCalculationEditor.tsx`; their existing focused tests or new `KnowledgeModePendingChanges.test.tsx` | Owns only Mode/Specifications projection, baseline advancement and nested paragraph/calculation input publication. Does not change the shared card, workspace, CSS, API or financial calculation helpers. |
| Quality owner | New `knowledgeQualityPendingChanges.ts` and `.test.ts`; `KnowledgeBasketQualityPanel.tsx`, `KnowledgeBasketQualityPanel.test.tsx` | Owns only shared-checklist projection and local baseline lifecycle. Does not change `KnowledgeSectionEditor.tsx`, workbook parser, API or shared types. |
| Recommendation owner | New `knowledgeRecommendationPendingChanges.ts` and `.test.ts`; `KnowledgeSectionEditor.tsx`, `KnowledgeBudgetAlterationBuilder.tsx`, `KnowledgeBudgetAlterationBuilder.test.tsx` for narrowly scoped optional reference-detail callbacks | Owns pure rule/legacy-row projection and propagation of already available related-item details. Workspace baseline and application-level tests remain with the primary. |

All contributors must be told they are not alone in the worktree, must preserve other edits, and must request any change outside their assigned files. Other existing input/component tests may be assigned to their corresponding owner explicitly before editing. `KnowledgePmcMarginInput.tsx` already emits invalid/empty values to its parent; no change is anticipated. If discovery requires an additional local hook, settle its ownership before editing.

## Task 1 — settle the presentation contract and capture the baseline

**Owner:** primary integrator. **Dependencies:** approved plan and execution choice. **Criteria:** AC2, AC6, AC8. **Status:** complete.

1. Capture `git status --short`, relevant target diffs and current source identities before any writer starts. Reconcile any later changes with the approved scope.
2. Read the exact save/partial-save/discard/conflict paths, normalized defaults and nested draft callbacks. Confirm the inventory of editable properties in each requested tab. Do not infer unsaved fields from the dirty boolean alone.
3. Define shared readonly presentation types in `knowledgePendingChanges.ts`: source identity, ordered groups, entry identity/title, change kind, field label/current display value, and incomplete state. Retain full entered display values; truncation is the card's responsibility. No raw payload or baseline reaches the rendered component.
4. Scope every publication to item/revision/tab and, for quality, basket; add mount/session ownership so an old callback or cleanup cannot overwrite a new editor's summary. Empty summaries normalize to no card. Do not persist session identity.
5. Provide narrowly scoped pure comparison primitives for meaningful values, stable row matching, ordering and field changes. Domain-specific normalization belongs with the relevant projection. Do not use label joins or broad coercion. ID-less legacy rows need conservative in-memory identity handling that does not modify persisted data; identify ambiguous cases explicitly rather than guessing associations.
6. Freeze additive optional callbacks before parallel writers begin. A panel publishes its source-scoped summary; nested Mode inputs publish their pending text/validity to the Mode owner; the recommendation builder may publish existing confirmed item details to its parent. Use stable callback identities and explicit cleanup rules.
7. Add focused shared-helper tests for equality, false/zero/null distinctions, stable IDs, duplicate labels and meaningful ordering. Share the settled exports and lifecycle rules with each owner.

**Stop condition:** If evidence requires changing save/CAS behavior, persistence, permissions or the product assumptions, report and revise the affected approved document before implementation expands.

## Task 2 — Mode and Specifications projection

**Owner:** Mode owner. **Dependency:** task 1 contract. **Criteria:** AC2, AC3, AC6, AC8. **Status:** complete.

1. Add pure projection for PMC inclusions/exclusions, margin, execution source components and their editable definitions/values, paragraph, scoped calculation inputs and Specifications. Reuse existing parsers/formatters and stable IDs; keep Specifications shared and scope calculation labels to PMC/Sub-Vendor/In-house Labor/Material.
2. Normalize untouched PMC default lists and legacy calculation fallback consistently for both baseline and draft. Materializing a default container must not manufacture new entries. Preserve changed optional fields, removals, cleared values, incomplete rows and meaningful row order.
3. Keep a saved presentation baseline with each `advanced` and `pricing` draft. Accept refreshed envelopes while clean; freeze the editing baseline while dirty. Advance only the block confirmed by its save response. Preserve existing expected section/aggregate versions and save order.
4. Add optional nested callbacks for the paragraph's current unapplied text and raw/incomplete calculation inputs. Prefer that pending text over the last valid parent setting for the same field. Avoid duplicate entries after text is applied to the section draft. Paragraph cancel restores the enclosing draft's remaining changes; simulation inputs remain excluded.
5. Publish only meaningful changes, independent of the visibility checkboxes. Keep pending changes from both Mode contexts correctly labeled when viewing a different source. Displaying a mode alone produces nothing.
6. Reset publications and baselines on accepted discard/source teardown; retain local differences on validation/transport/conflict failures. Guard StrictMode/unmount cleanup and late callbacks. Do not mark pending text saved merely because a paragraph-local Apply/Save button was used.
7. Add rendered and pure tests for unequal PMC/Execution data; default expansion; edit/revert; component type/options/value changes; paragraph edit/apply/cancel; incomplete calculation text; shared Specifications; partial save; delayed refresh; conflict/refetch; and revision teardown.

**Deliverable:** isolated Mode publication with regression evidence; no workspace/card changes.

## Task 3 — shared Quality Parameter projection

**Owner:** Quality owner. **Dependency:** task 1 contract. **Criteria:** AC2, AC5, AC6, AC8. **Status:** complete.

1. Add pure row/field projection for question/check, answer type/options, acceptance criteria, photo requirements and every other field editable by the current checklist UI. Exclude untouched legacy/hidden metadata and default required/active values.
2. Capture the accepted checklist parameters/version as the presentation baseline when editing begins. Retain it across query refresh and conflict; reset it only through the existing accepted save/discard/source lifecycle. Do not compare to the item-specific historical checklist.
3. Publish source-scoped groups with `Shared checklist · [Main Basket]` context. Imported rows enter the summary only when accepted into the editor draft, with normal addition/incomplete semantics. Opening/cancelling import or downloading saved Excel creates no entry.
4. Clear confirmed saved entries when the authoritative checklist response arrives, before unrelated refresh finishes. Retain changes on failure/conflict and eliminate reverted edits even if the panel's existing draft marker remains set.
5. Use quality's existing `canUpdate` and item/basket archived checks. Do not require an editable item draft revision where the shared checklist currently permits editing.
6. Test existing saved data omission, one-field edits within a saved row, row add/remove/revert, imported additions, answer options and photo counts, save/refresh timing, conflict/refetch and two baskets with different saved checklists.

**Deliverable:** isolated quality publication with regression evidence; no workbook/API changes.

## Task 4 — Recommendation & Exclusions projection and reference details

**Owner:** Recommendation owner. **Dependency:** task 1 contract. **Criteria:** AC2, AC4, AC6, AC8. **Status:** complete.

1. Add a pure projector accepting the saved baseline, current section payload, existing masters/baskets/items and source identity. Cover budget-alteration rules plus editable legacy recommendation/exclusion rows.
2. Group changed fields within a rule; label trigger, Scope action, Related item, reason and Enabled status clearly. Include basket/sub-basket/type changes when edited without duplicating unchanged saved context. Describe removed rows with only minimal identity and text status.
3. Resolve all displayed references by stable ID and context. Missing labels get readable unavailable-selection text without raw IDs or extra network reads. The primary supplies existing workspace catalogs.
4. Expose already confirmed creation/reuse detail from `KnowledgeBudgetAlterationBuilder` through an optional `KnowledgeSectionEditor` prop when needed. Preserve its version-aware merge, real-ID target selection, cancellation, source lifetime guard and refresh behavior. Retain only source-relevant detail and ignore older metadata.
5. Catalog creation remains an independent successful write. Publish only the pending rule selection, never a claim that the created catalog item is unsaved. Opening/cancelling/failed creation cannot fabricate a target change.
6. Test unchanged saved rows, single-field edits, added/removed/cleared rules, duplicate labels with distinct IDs/baskets, unresolved references, legacy optional fields and order; re-run creation/cancellation/delayed-refresh regressions for touched builder hooks.

**Deliverable:** pure projector and optional reference-detail delivery for primary integration; no workspace baseline changes.

## Task 5 — card, workspace lifecycle and responsive rail

**Owner:** primary integrator. **Dependencies:** task 1; final integration consumes tasks 2–4. **Criteria:** AC1, AC2, AC4, AC6, AC7, AC8. **Status:** complete.

1. Implement `KnowledgePendingChangesCard` using the shared contract, existing Surface/StatusBadge/Button components and local tokens. Render nothing for no entries. Use the approved title/helper/status, clear tab/group context, and text status for changes/incomplete values.
2. Initially show four entries across ordered groups. Add keyboard-accessible `Show all N changes` / `Show fewer changes` with correct expanded state. Provide a full-value disclosure for long changed text; never require horizontal scroll or show hidden saved content when expanded. Reset disclosure state safely on session changes.
3. Add a shared rail wrapper with Revision history first and the card second. Scope CSS so history's list rules do not style pending-change lists accidentally. Retain existing wide rail width and breakpoint; use normal page flow for a long expanded rail so content remains reachable.
4. Connect source-checked Mode/Quality callbacks and render only the active permitted context. Clean initialization, loading, read-only, unrelated tabs and stale publications show no card. Quality uses its own permission/editability context.
5. Keep a frozen Recommendation & Exclusions baseline alongside its existing editor state, capturing the accepted payload before the first edit. Project differences with the new helper and confirmed reference details. A refetch or server-review panel cannot replace that baseline during editing.
6. Remove confirmed recommendation changes from the summary when the save response arrives even if existing cache synchronization is pending; keep the current save/navigation contract intact. Avoid clearing later user edits if editing remains possible during a pending response. Align discard/conflict resolution and navigation cleanup with existing accepted transitions.
7. Preserve form focus while summaries update; never assign live-region semantics to the whole card. History loading/errors remain independent. No added form buttons, autosave, network reads, storage or analytics.
8. Add application-level integration tests for all three tabs, saved-value absence, immediate/reverted changes, save/discard/stay navigation, history error independence, reference labels during delayed refresh, item/revision/basket isolation, read-only/archived and temporary-item behavior.

The primary may build the card/layout against synthetic shared-contract fixtures while tasks 2–4 run. Final source integration occurs after the corresponding publication contract is delivered and reviewed.

## Task 6 — integrated integrity review

**Owner:** primary; Mode A uses `integrity_reviewer`. **Dependencies:** tasks 2–5 finished. **Criteria:** AC1–AC8. **Status:** complete.

Review the integrated diff after writers finish. Trace original baseline capture, success timing, Mode partial save, quality scope, incompatible source changes, reference detail versions, ID-less rows, default normalization and local incomplete inputs. Verify that no save/CAS/navigation behavior or financial calculation changed. Check that an old cleanup cannot erase a newer publication and that context keys block one-frame stale displays.

Resolve confirmed findings in their assigned ownership boundaries. Re-review affected paths before final verification. Do not call intermediate test results final while concurrent writers remain.

## Task 7 — final automated and browser verification

**Owner:** primary; Mode A uses `verification_runner` after review fixes. **Dependencies:** task 6 resolved. **Criteria:** AC1–AC8. **Status:** complete.

### Automated checks

From `frontend/`, run the new projection/card suites (adjust names only if the settled contract uses equivalent files):

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgePendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeQualityPendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgePendingChangesCard.test.tsx
```

Run affected integrated and nested-input regressions:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx
npm run typecheck
npm run build
```

Include any additional integration test files created by the owners. If shared `KnowledgeSectionEditor` behavior beyond additive optional callbacks changes, include its relevant quality/pricing/overview regression suites. Broaden only for an observed failure, source change or unresolved risk. There is no lint script; do not report lint.

### Browser and accessibility matrix

Render actual workspace/card/editor components and application CSS with synthetic data. Prefer application-level mocked transport so the real workspace rail and navigation are exercised; distinguish mock save responses from actual persistence. No production data or writes.

| Viewport | Required checks |
| --- | --- |
| Desktop, approximately 1440 × 1000 | Card beneath history, all three tab contexts, edited-values-only content, visible/history-error states, four-entry limit, full-value disclosure and expanded long rail reachability |
| Intermediate, approximately 1024 × 900 | Existing rail breakpoint stacks both surfaces below editor, correct order, long labels and no horizontal overflow |
| Mobile, approximately 390 × 844 | Wrapped context/labels, usable disclosure controls, complete pending values reachable, no clipped content or horizontal scrolling |

Exercise edit/revert, addition/removal, paragraph pending/apply/cancel, incomplete numeric input, delayed/partial save, failed save, read-only and item/tab navigation. Check that input focus stays put during updates. Verify disclosure keyboard activation and accessible names/expanded state, and run a scoped axe audit. If native input interactions cannot be conclusively automated, state the exact gap rather than treating a synthetic assertion as browser evidence.

Keep screenshots/logs under a task-specific ignored or temporary directory, such as `/tmp/lisno-unsaved-request-card-qa/`. Stop only this task's local server/browser processes after verification. Record artifact paths and any unrun scenarios in this plan.

### Repository hygiene and handoff

Run `git diff --check` and `git status --short`; inspect the final source diff and ensure only assigned files and working documents changed. Record exact commands, exits, test counts, browser results, warnings and unrun checks here. Backend/OCR suites are unnecessary if their surfaces remain untouched. No migration, deployment, seed, commit, push or external communication belongs to this plan.

## Acceptance-to-evidence map

| Criterion | Required evidence |
| --- | --- |
| AC1 placement | Card/workspace rendered tests; desktop/intermediate/mobile inspection; clean/read-only absence |
| AC2 precision | Projection fixtures for default/equal/reverted/cleared/removed/reordered values and same-label distinct IDs; assertions excluding saved sentinel text |
| AC3 Mode | Unequal PMC/Execution contexts, pending paragraph/numeric values, shared Specifications and partial-save integration |
| AC4 Recommendation | New/existing/legacy row changes; confirmed related-item name with delayed refresh; create/cancel/temporary regression |
| AC5 Quality | Two baskets, shared-vs-item-specific saved sentinel data, one-field edits, import/options/photo requirements and save/conflict behavior |
| AC6 lifecycle | Authoritative success before refresh, baseline frozen through conflict/refetch, full revert, navigation and stale-callback/StrictMode checks |
| AC7 accessibility | Disclosure/focus assertions, scoped axe, real rendered widths and long-content reachability |
| AC8 compatibility | Existing focused regressions, unchanged request/CAS assertions, frontend typecheck/build and final diff/status review |

## Execution dependencies

- Gates remain sequential: approve this task plan, then choose Mode A or B, then begin task 1.
- Task 1 is sequential because all writers need the shared presentation and lifetime contract.
- In Mode A, tasks 2, 3 and 4 may run concurrently with explicit non-overlapping ownership; the primary can prepare task 5's card/layout simultaneously. With four available slots this uses one primary and three writers.
- Task 5's final integration follows the delivered parts of tasks 2–4. Task 6 waits for every writer to finish; task 7 follows review fixes. Read-only browser QA and final automated verification may run independently after sources are stable, then the primary reconciles all evidence.
- In Mode B, all tasks, integrity review and verification run inline without implementation subagents.
- If feedback materially changes the approved specification or this plan, update and approve only the affected document once. Routine implementation choices inside these boundaries do not reopen earlier gates.

## Execution record

Implementation uses source-scoped readonly publications, pure change projectors and a shared card. Recommendation and Quality rows without saved IDs retain local presentation identities across sequential edits; these identities never enter the save payload. The Mode owner maintains presentation values separately from conflict-rebased save values, including local paragraph and incomplete numeric input. Parent recommendation saves acknowledge only the submitted tracker and preserve later input while refresh is pending.

Preliminary focused results (not final integrated verification): shared/card 11 passed; new workspace card cases 7 passed; full workspace/layout before the last added legacy case 83 passed; Mode 95 passed across seven files; Quality 47 passed across two files; Recommendation tracker 24 passed plus builder/dialog 46 passed. Source changes are frozen for integrity review. Browser preparation uses `/tmp/lisno-unsaved-request-card-qa/` and port 4192, with actual workspace components/styles and synthetic API data. No backend, persistence, dependency, lockfile, commit, seed or deployment changes.

### Integrated review and corrections

- Editing one of two identical ID-less legacy quality rows could fabricate an ordering change; the tracker now retains the position of an unambiguous single-row edit before equal-content matching. Tests cover successive edits/revert and an actual later reorder.
- Discarding a Mode conflict when the accepted server calculation equaled the local value could retain the local input baseline. Discard now resets only advanced input publications and local input instances, preserving independently unsaved Specifications. A regression reproduced the failure before the correction and verifies subsequent edit/revert behavior.
- The combined rail remains sticky when its measured height fits the viewport and uses normal page flow when taller. Observer/resize listeners are cleaned up. Intermediate/mobile placement retains the existing breakpoint.
- Read-only re-review found no remaining blockers and confirmed unchanged API/CAS/permission/persistence/financial/history behavior.
- Real-browser axe found the new disclosure inherited low-contrast yellow text from the role's quiet-button theme. A scoped text-color override corrects normal/hover states; the final browser audit has zero violations with all rules enabled.

### Final automated verification

From `frontend/`, the following exact command passed with exit 0: **316 tests across 17 files**, no failures or skips, 14.96 seconds.

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgePendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeQualityPendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgePendingChangesCard.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx
npm run typecheck
npm run build
```

Typecheck and build exited 0. After the final CSS-only contrast correction, `npm run build` passed again (5.79 seconds); tests and standalone typecheck were not unnecessarily repeated. Repository `git diff --check` and `git status --short` exited 0 with 25 planned paths (12 modified, 13 untracked).

The existing Vite bundle-size warning remains: main JS 1,397.51 kB before gzip, 385.66 kB gzip; ExcelJS approximately 940 kB. No dependency/bundling changes were made. Ignored artifacts are `frontend/dist/` and `frontend/node_modules/.tmp/tsconfig.{app,node}.tsbuildinfo`.

### Final browser verification

Actual workspace/editor/card components and application CSS ran with synthetic API data under `/tmp/lisno-unsaved-request-card-qa/`. Browser evidence verifies frontend behavior with controlled responses, not real database persistence or authenticated production access.

- Mode viewing controls remain clean; edited Specifications show only changed names, with input focus retained and saved paragraph/description omitted. Revert hides the card. Partial save leaves the failed Specifications block, retry clears it, and applied paragraph text remains pending until section save.
- Recommendation edits show only pending reason data, preserve focus, exclude saved/untouched content and disappear on revert. Failed save retains changes; server confirmation clears submitted changes before delayed history refresh; later edits survive refresh. Stay preserves the preview; Discard clears it.
- Quality shows changed fields with shared-basket context, excludes saved content, preserves focus and supports revert. Four entries expand to six using Enter; full-value disclosure is keyboard-accessible. A history fetch error does not suppress local changes.
- At 1440 × 1000, a short combined rail stays sticky (top approximately 8px); a long expanded rail uses normal flow and its final control remains reachable. At 1024 × 900 and 390 × 844, history precedes the card below the editor and document widths do not exceed viewports. Long content remains reachable.
- Final scoped browser axe audit: **0 violations, all rules enabled**, after the contrast correction. Representative final captures: [desktop Mode](/tmp/lisno-unsaved-request-card-qa/output/playwright/desktop-mode-spec-final.png), [mobile Quality](/tmp/lisno-unsaved-request-card-qa/output/playwright/mobile-quality-header.png), [intermediate Quality](/tmp/lisno-unsaved-request-card-qa/output/playwright/intermediate-quality-header.png). Detailed commands and scope limits are recorded in `/tmp/lisno-unsaved-request-card-qa/RESULTS.md`.

Full frontend/backend/OCR suites and live-database browser end-to-end checks were not run. Focused tests cover the changed frontend surfaces; backend and OCR are unchanged. No migration, seed, commit, push, deployment or production mutation was performed.

Browser limits: ancillary paragraph-cancel/incomplete-calculation sequences encountered native beforeunload/session resets and are not claimed as final browser evidence; their local behavior is covered by focused automated tests. Read-only/archive, multi-item and imported-workbook scenarios were not repeated in the final browser pass. Partial Mode save/retry and paragraph apply were confirmed in an earlier browser run. The existing history-error action creates a tall message at narrow widths without clipping the card. Final required browser sequences completed in uninterrupted batches. The task browser and port 4192 server were stopped; only temporary QA artifacts remain.

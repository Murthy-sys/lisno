# Multiple brands per Configuration specification: task plan

Date: 2026-10-21
Status: Original implementation and user-directed compact dropdown correction implemented, reviewed, and verified. Four confirmed pre-existing failures in the earlier broader layout-test lane are recorded below.
Specification: [Multiple brands per Configuration specification](../specs/2026-10-21-specification-multiple-brands-design.md), approved by the user on 2026-10-21.
Execution mode: A — parallel sub-agents, selected by the user on 2026-10-21.

## Progress

- Follow-up correction completed: the existing compact dropdown and its in-menu Add/Edit actions are restored, retaining the verified multiple-brand contract. No backend, shared-contract, native, or save-conflict changes were required.
- Shared contract foundation is complete: all 36 parser/section-validation tests passed in final verification. Helpers preserve malformed association evidence through unrelated edits, normalize readable IDs, validate original field paths, and serialize zero/one/many selections compatibly. Initial tracked target diffs were clean; only this plan and the approved specification were untracked.
- Backend, web editor, summaries, and bounded mobile compatibility are implemented. No dependency, lockfile, collection, route-permission, price-calculation, or migration change was needed.
- Independent integrity review found no confirmed defects or blockers. Final automated and rendered checks are complete, with four unrelated baseline layout assertions failing as detailed below.

## Outcome and implementation contract

Enable multiple local brands for one web Specification and give its selector the existing Configuration theme. Preserve every selected association through Save Mode, reload, review, context projection, and compatible mobile edits.

The approved representation is fixed: application code reads associations as `brandIds`; serialization omits the association for zero selections, writes legacy `brandId` for one, and writes `brandIds` for multiple. Input containing both fields is invalid. All IDs must resolve uniquely within the same Pricing payload. No primary-brand alias, name-based identity matching, pricing changes, migration, or global dropdown redesign is authorized.

Initial investigation baseline: clean worktree at `e58f514e`; 26 frontend parser/builder tests and 65 backend validation tests passed. At plan creation the only existing dirty path is the approved specification. Capture status and per-target diffs again before implementation; understand and preserve any changes that arrive after this baseline.

## Ownership and safe parallel work

Keep one parent work package in progress. Do not spawn agents before the execution-mode gate. Mode B performs all responsibilities inline. In Mode A, the primary agent establishes the shared contract first, then delegates three non-overlapping implementation slices within the available concurrency slots.

| Owner | Files and responsibilities |
| --- | --- |
| Primary agent | Task documents; shared contract foundation in `shared/knowledge/knowledgeSpecificationConfiguration.ts`; its frontend parser/section-validation tests; cross-layer contract decisions; integration and any unassigned consumer fixes after explicit ownership assignment |
| Backend implementer | `backend/src/domain/ai-estimator-knowledge-validation.ts`, `backend/src/services/ai-estimator-knowledge-context.service.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`, and relevant backend validation/context/API/replica-set tests |
| Web editor implementer | `KnowledgeSpecificationBuilder.tsx`, a feature-local brand picker and narrowly scoped stylesheet/tests if needed, `KnowledgeModePanel.tsx`, `KnowledgeSectionEditor.tsx`, builder/save/pricing editor tests, and directly affected field-focus/layout tests |
| Compatibility implementer | `shared/knowledge/knowledgeSavedSummary.ts`; frontend pending-change, conflict-review, and overview projections with their tests; saved-summary tests; `mobile/src/features/knowledge/KnowledgeSpecificationsEditor.tsx` and focused workspace tests |
| Integrity reviewer | Read-only review of the integrated change after all writers finish |
| Verification runner | Final tests/typechecks/builds and hygiene after review corrections; no product-source changes |

Frontend filenames in the table are under `frontend/src/features/ai-estimator-knowledge/`. The compatibility implementer does not change the shared parsing/serialization contract owned by the primary agent. Any additional rendered consumer or merge utility discovered during implementation must be assigned explicitly before editing; notify all affected owners when a contract changes.

Tell every writer that they share the worktree, must preserve other work, must not revert others' edits, and may not expand their file ownership without coordination. No commits, staging, pushes, deployment, production access, seeds, or write migrations are included.

## Dependency-ordered work

### 1. Establish and verify the shared association contract

Owner: Primary agent. Depends on: plan approval and execution-mode selection.

- Recheck source, dirty-path inventory, and all singular-brand consumers; confirm the approved local-brand scope and existing Save Mode persistence path.
- Extend the internal specification shape to a complete readonly ID list. Provide a reusable interpretation/serialization boundary for raw legacy and list representations; do not make every consumer invent its own precedence rules.
- Preserve validation evidence for malformed input. Reject both fields, invalid types/IDs, duplicates, missing/ambiguous references, and overflow before any representation conversion could conceal an error. Keep indexed error paths and unavailable-value information usable by the editor.
- Preserve selection order, zero/one-brand wire compatibility, and hidden legacy typed fields. Ensure representation-only normalization does not produce a false Saved/Unsaved difference.
- Add focused parser/section-validation tests using distinct brands, an unavailable second brand, duplicate IDs, a same-name brand belonging to another line, zero/one/many associations, and legacy typed metadata.
- Publish the exact helper/type and error-path contract to all implementers before parallel edits begin. Do not expect whole-workspace typechecks to pass during an intentionally incomplete shared-type transition.

Completion: AC3 foundation tests pass, helper signatures and public projection shapes are agreed, and independent ownership is explicit.

### 2. Implement backend validation, public context, and persistence coverage

Owner: Backend implementer. Depends on: Task 1. May run alongside Tasks 3 and 4 in Mode A.

- Allow and validate list associations in both simple and legacy typed specification rows, keeping frontend/backend behavior aligned and actor authorization ahead of protected writes.
- Preserve section versions, aggregate CAS checks, transaction/audit behavior, immutable price records, and parent/local-reference boundaries.
- Return the existing singular public identity for one brand; return the complete ID list and public brand identities for multiple. Never substitute the first brand or expose private notes/prices.
- Update all relevant OpenAPI specification input and public-context shapes/examples. Describe mutual exclusion, uniqueness, bounds, and compatibility; document runtime validation accurately.
- Add validation and context regressions for every list shape, second-brand resolution, cross-line same-name rejection, and privacy filtering.
- Extend the existing replica-set integration lane with a save/reload case for two brands, an unrelated subsequent edit, and a rejected invalid association. Assert failed writes leave version/audit/business state unchanged and existing price/specification references remain intact. Use existing isolated test fixtures only.

Completion: AC3–AC5 backend behavior and persistence verified without changing route permissions or transaction semantics.

### 3. Implement the themed web editor and Save Mode integration

Owner: Web editor implementer. Depends on: Task 1. May run alongside Tasks 2 and 4 in Mode A.

- Replace the singular Brand control with a feature-local searchable multi-select labeled Brands, preserving the existing compact dropdown appearance. Reuse existing interaction and theme patterns without fabricating Surface/master records or changing global controls.
- Keep the popup open while toggling choices, show selected names within the closed field, allow removal/Not configured without deleting brand definitions, and preserve selections while searching. Display unavailable selections explicitly and permit their removal when editable. Do not introduce an external selected list, Edit/Remove/Clear links, optional hint, or Add button.
- Use the current Configuration surface/border/text/focus tokens for trigger, popup, option, error, disabled, and selected states, including inside the portaled panel. Avoid the default violet focus treatment and new decorative effects.
- Keep Add brand and Edit selected brand/named edit actions inside the dropdown popup, outside the semantic listbox; append the created ID rather than replace the selection. Preserve the existing dialogs, name validation, limits, cancellation, draft status, and focus return to the persistent dropdown trigger.
- Update table/View display, Saved/Unsaved/Needs review calculation, and first-invalid-field routing for all selected IDs and indexed list errors. Renaming the second selected brand must update status and visible names.
- Preserve Done versus Save Mode semantics, read-only transitions, partial-save recovery, and reference protection.
- Treat the singular/list representation as one logical association during conflict rebase. Exercise local list edits against server name/description/brand changes so merging cannot manufacture both fields, discard an untouched list, or hide a conflicting selection. Preserve existing explicit conflict resolution semantics rather than inventing an automatic union.
- Update existing builder, Mode save, and Pricing editor tests for the accessible multi-select and add/remove/create/rename behavior. Include Save Mode/reopen/reload, empty selection, unavailable values, nested Escape, focus, and permission/read-only changes while open.

Completion: AC1–AC3, AC5, and AC6 editor behavior covered by meaningful interaction and save tests.

### 4. Update summaries and bounded mobile compatibility

Owner: Compatibility implementer. Depends on: Task 1. May run alongside Tasks 2 and 3 in Mode A.

- Update shared saved summaries and frontend pending-change, conflict-review, and overview projections to resolve every association by local stable ID. Update any directly consuming presentation types/renderers under coordinated ownership.
- Keep unavailable references visible without exposing raw private identifiers as display labels. Do not add first-brand fallback or silently ignore the second/later association.
- Normalize legacy/list associations for comparisons so a wire-shape change alone does not imply a different brand choice. Preserve actual local/server differences and brand renames in review output.
- On mobile, show all names, preserve the list during unrelated edits, and block removal of any referenced brand. For multi-brand items, replace the misleading single-select interaction with a clear list and web-edit guidance; guard both selection and add-and-assign handlers. Keep ordinary zero/one-brand editing available.
- Add focused summary and native interaction regressions: second-brand rename, unavailable second ID, saved/read-only views, unrelated name/description edits retaining IDs, referenced-brand removal, and permission changes. Confirm raw payloads never acquire both association fields.

Completion: AC4 and AC7 with no new native multi-select redesign or financial display changes.

### 5. Integrate and perform integrity review

Owner: Primary agent plus integrity reviewer in Mode A; primary agent in Mode B. Depends on: Tasks 2–4 and all writers being finished.

- Inspect the integrated diff and search remaining `brandId` consumers. Classify each as intentional legacy compatibility or a converted consumer; investigate any place that can still truncate a list.
- Reconcile parser/backend/OpenAPI behavior, serialization, public identities, summary types, mobile preservation, and Save Mode conflict handling.
- Review list error targeting, second-brand dirty detection, creation/cancellation, popup focus/Escape, read-only guards, and unchanged reference/price-history behavior.
- Confirm no unrelated styles, master lifecycle logic, dependency/lockfile changes, or unintended persistence/auth changes entered the diff.
- Resolve findings through the assigned owners. Material scope/contract changes require updating the affected approved document once; ordinary bounded corrections stay within this plan.

Completion: review findings resolved and integrated worktree ready for final verification.

### 6. Verify the integrated implementation and hand off

Owner: Verification runner and primary agent in Mode A; primary agent in Mode B. Depends on: Task 5.

Start with focused regressions during implementation. Run final checks after all review fixes on the integrated result. Do not repeat successful checks without a subsequent change or unresolved concern.

Frontend, from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.test.ts src/features/ai-estimator-knowledge/knowledgeSectionValidation.test.ts src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts src/features/ai-estimator-knowledge/knowledgeSavedSummary.test.ts src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx src/features/ai-estimator-knowledge/knowledgeSlabRate.test.ts src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
npm run typecheck
npm run build
```

Include any new picker/merge tests and directly affected consumer suites in the final focused command. These tests cover association changes plus quantity/specification-reference and save/review compatibility; broaden further only if the integrated diff or failures reveal additional impact.

Backend, from `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts tests/api-docs.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
npm run build
```

Mobile, from `mobile/`:

```sh
npm test -- --runInBand src/features/knowledge/KnowledgeItemWorkspace.test.tsx
npm run test:contracts
npm run typecheck
npm run export:android
```

Include any new direct native compatibility tests. Android export verifies bundling without prebuild, native-project regeneration, signing, installation, or store distribution. Do not treat it as a native device test.

Rendered QA uses the actual web panel and production theme with synthetic local fixtures and intercepted save requests. Check 1440 × 900 and 390 × 844, including closed/open, zero/one/many selections, search with no results, long names, unavailable selection, validation errors, read-only, and nested Add/Edit Brand dialogs. Verify theme via rendered appearance/computed role tokens, full selected-name visibility, bounded scrolling, keyboard navigation, Escape precedence, focus return, and accessible names/selected/error states. Exercise selection of two brands, Add Brand append, rename of the second brand, Done, Save Mode, and reload; assert the intercepted payload and restored selection. Review console/network failures and run accessibility checks. Use rendered native component tests for the bounded mobile change; report if no device QA was performed.

Run repository `git diff --check` and `git status --short`. There is no lint script. OCR, production, migration, and deployment checks are outside scope. Keep temporary fixtures/logs/screenshots under `/tmp/lisno-specification-multiple-brands-2026-10-21` or existing ignored output directories; stop task-owned servers afterward. Do not commit build outputs, caches, or QA artifacts.

Final handoff reports the implemented behavior, affected files, exact test/build/QA results, artifact paths, unrun checks, remaining risks, and absence of production actions. Any separately authorized rollout must install array-compatible backend/readers before web multi-brand writes; no rollback may truncate stored lists.

## Acceptance trace

| Criterion | Work and verification |
| --- | --- |
| AC1: Select/save/reload multiple brands | Task 3 interaction/save tests; Tasks 2 and 6 persistence/rendered checks |
| AC2: Append creation and stable rename | Task 3 builder/status tests; Task 4 summary tests; Task 6 nested-dialog QA |
| AC3: Legacy compatibility and strict validation | Tasks 1–2 parser/backend/API tests; Task 3 wire-safe save/rebase tests |
| AC4: Complete projections and local identity | Tasks 2 and 4 context/summary tests with asymmetric IDs and names |
| AC5: Save/conflict and lineage protection | Tasks 2–3 replica-set/save tests; Task 6 quantity/reference regressions |
| AC6: Theme and accessibility | Task 3 picker/panel tests; Task 6 desktop/narrow visual and keyboard QA |
| AC7: Safe native compatibility | Task 4 native regression tests; Task 6 mobile contract/typecheck/export checks |
| AC8: Integrated evidence | Tasks 5–6 integrity review, tests, builds, rendered checks, and hygiene |

## Final verification evidence

The evidence below records the original implementation. A later user-directed presentation correction is tracked at the end of this document; its checks supersede the original picker-layout screenshots and interaction details.

All implementation agents finished before independent integrity review and final verification. The review covered strict local identity, malformed-data preservation, complete public projection, atomic conflict rebasing, every read consumer, native preservation/removal guards, and unchanged CAS/audit/price-history behavior. No blockers were found.

### Automated results

Backend implementer ran the following on the final backend slice; no later backend source changes occurred. The independent verifier reused these successful unchanged results:

```sh
cd backend
npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts tests/api-docs.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
npm run build
```

Result: **232 tests passed**, including all **74 replica-set integration tests**. Typecheck/build passed. Existing Mongoose deprecation warnings remain.

Final frontend command included every test in Task 6 plus `KnowledgeSectionEditor.overview.test.tsx`. No separate picker test file was necessary: the picker is exercised through 23 builder tests and 20 Mode-save tests.

```sh
cd frontend
npm test -- src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.test.ts src/features/ai-estimator-knowledge/knowledgeSectionValidation.test.ts src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.overview.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts src/features/ai-estimator-knowledge/knowledgeSavedSummary.test.ts src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx src/features/ai-estimator-knowledge/knowledgeSlabRate.test.ts src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
npm run typecheck
npm run build
```

Result: **241 passed, 4 failed** across 14 suites; test command exit 1. All 228 tests in the other 13 suites passed. Typecheck/build passed. The preflight save test emits existing React `act` warnings; Vite reports chunks over 500 kB, including the 2.80 MB main chunk.

The four failures are deterministic stale expectations in `KnowledgeItemWorkspaceLayout.test.tsx`, reading unchanged raw source:

| Assertion location | Stale expectation | Existing baseline implementation |
| --- | --- | --- |
| Test line 100 | Exact root div attribute string | Workspace page line 604 includes `ref={workspaceRef}` and `data-workspace-section` |
| Test line 663 | Two-column UOM grid | CSS line 3188 uses one column and a full-width Add Unit action |
| Test line 718 | Two-column tablet UOM grid | CSS line 5009 retains the one-column UOM layout |
| Test line 840 | Status strip uses grid | CSS line 2890 uses wrapping flex |

Baseline evidence: `git diff --exit-code e58f514e -- frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css` returned exit 0. These unrelated tests/layout files were not altered to satisfy stale assertions. The overall test lane is therefore not entirely green.

```sh
cd mobile
npm test -- --runInBand src/features/knowledge/KnowledgeSpecificationsEditor.test.tsx src/features/knowledge/KnowledgeItemWorkspace.test.tsx
npm run test:contracts
npm run typecheck
npm run export:android
```

Result: **33 native component/workspace tests and 3 contract tests passed**. Typecheck and Android export passed; export produced a 12 MB Hermes bundle. Only color-environment warnings occurred in the final export. This is bundle verification, not native device verification.

`git diff --check` passed. The test-generated tracked `mobile/.expo/dev/logs/export.log` was restored to its clean starting content. No unrelated tracked changes remain.

### Rendered interaction, theme, and accessibility

Used the actual production `KnowledgeModePanel`, builder, picker, overlay components, and Configuration styles in a temporary local fixture. API reads/writes were intercepted using synthetic records, with unexpected API calls rejected. No live data or credentials were used.

- Checked 1440 × 900 and 390 × 844, closed/open/selected/search-empty/unavailable/error/read-only states, zero/one/many choices, and long selected names. No horizontal overflow; long names wrap and the options list stays bounded.
- Selected a second brand, appended a third through Add Brand, renamed the second brand, returned with Done, saved with Save Mode, and reloaded. All three names returned with Saved status. The intercepted payload contained the complete ordered `brandIds` list, no singular alias, stable identities, and unchanged typed metadata.
- Removed an unavailable selection, cleared remaining choices, and saved. Neither association field remained, confirming optional zero-selection behavior.
- Checked search, Arrow/Home/End, Space/Enter, Tab, and Escape. Escape closes the picker before its parent panel; nested Add Brand Escape returns focus to Add Brand. Successful creation also restores that focus.
- Changing permission while the picker was open closed it, removed editing actions, retained names, and moved focus safely to the selection group.
- Browser axe checks returned **zero violations** for desktop open, narrow open, read-only transition, unavailable/error, and long-selection states, including browser contrast checks. Focus computed as `rgb(61, 74, 50) solid 2px`, with no shadow. Invalid control exposes its error description and themed error border.
- Browser console checks reported zero errors/warnings during completed flows. Requests remained local static assets; save requests were handled by the synthetic interceptor. Initial QA attempts were interrupted by source HMR, then repeated successfully after writers finished.

Evidence directory: `/tmp/lisno-specification-multiple-brands-2026-10-21`. It contains the isolated fixture, `final-*.log`, CLI snapshots, and `desktop-open.png`, `desktop-selected.png`, `narrow-open.png`, `narrow-empty-search.png`, `narrow-readonly.png`, `narrow-unavailable.png`, `narrow-no-selection.png`, and `narrow-long-selection.png`. Task browser session and fixture server were stopped. Build outputs are ignored under `frontend/dist/` and `mobile/dist/android/`.

### Remaining limits and external actions

Full repository suites, OCR, native device QA, and lint were not run; there is no lint script. Four baseline layout assertions remain failing. No dependencies, migration/backfill, staging, commits, pushes, installation on devices, deployment, or production mutation were performed. A future rollout must deploy array-compatible backend/readers before web multi-brand writes; no data-truncating rollback is permitted.

## User-directed dropdown correction

The follow-up requests multi-selection without changing the established dropdown Add/Edit flow. This corrects the presentation of the same feature; the approved data contract remains unchanged. The existing Mode A selection continues to apply.

Ownership: one frontend implementer owns `KnowledgeBrandMultiSelect.tsx`, its local CSS, `KnowledgeSpecificationBuilder.tsx`, and directly affected builder/Mode-save/Pricing-editor tests. The primary owns documentation, rendered checks, final review, and build verification. Existing dirty changes from the prior implementation are the baseline and must be preserved. Backend, shared persistence/validation, native compatibility, and conflict merge are outside this correction.

1. Restore `ui-control ui-select` geometry and chevron, show full selected names in the field, and remove the added selected list, underlined links, selection hint, and external Add button.
2. Keep Add brand and Edit selected brand/named multi-brand Edit actions inside the same popup. Keep existing dialogs and append/rename semantics. Pass the persistent trigger as the dialog return-focus target.
3. Retain searchable checkable choices, unavailable-value removal, and Not configured for clearing. Keep one reachable listbox option in the Tab sequence, including before arrow navigation, so the scrollable options region is keyboard accessible.
4. Verify compact closed layout and menu placement at desktop/narrow widths, add/cancel/edit with focus return, multi-selection save/reload, empty/unavailable/read-only states, axe, focused regressions, typecheck/build, and diff hygiene.

### Correction verification results

Independent focused integrity review found no confirmed defects or blockers. Primary review also confirmed that the original Add/Edit dialog fields and actions remain unchanged. All implementation writes finished before final browser verification.

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.overview.test.tsx
npm run typecheck
npm run build
```

Results: **62 tests passed** (24 builder, 20 Mode-save, 8 Pricing, 10 Overview), typecheck passed, build passed in 8.57 seconds. Existing Mode preflight `act` and Vite large-chunk warnings remain. `git diff --check` passed. Tests cover original in-menu Add/Edit flows, no external controls, append, rename, zero selection, missing associations, read-only transition, selected-name accessibility, save/reload, and retained conflict behavior.

Rendered the actual panel at 1440 × 900 and 390 × 844. The closed field uses the original control classes/chevron and shows selected names; the external list, links, helper and Add button are absent. Add/Edit are reachable inside the popup, including after scrolling at narrow width. Checked multi-selection, Not configured, search with no results, readonly names, keyboard Tab/Arrow/Enter, popup Escape and nested-dialog Escape. Creating a third brand and renaming the second returned focus to the trigger. Done → Save Mode → reload preserved all three IDs/names and legacy typed fields.

Browser QA initially found a scrollable-list keyboard access issue; fixed it by providing a roving initial Tab stop and synchronizing option focus. Final desktop/narrow open, search-empty and readonly axe checks returned **zero violations**, with no horizontal overflow. Trigger value is exposed through `aria-describedby` while preserving existing hint/error associations. Console reported zero errors/warnings during final flows. Only synthetic intercepted data was used.

Correction artifacts share `/tmp/lisno-specification-multiple-brands-2026-10-21`: `correction-build.log`, `correction-desktop-closed.png`, `correction-desktop-menu.png`, `correction-narrow-closed.png`, `correction-narrow-menu.png`, plus CLI snapshots. Browser session and fixture server stopped. Backend/native/full-repository suites were not repeated for this frontend-only correction. No dependency, migration, production, commit, or deployment action occurred.

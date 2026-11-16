# Tier description persistence and preview: task plan

Date: 2026-11-16
Status: Implemented and verified locally in Mode A

Source of truth: [Approved specification](../specs/2026-11-16-tier-description-save-and-preview-design.md). Specification approved by the user on 2026-11-16.

## Outcome and boundaries

Inline Save persists the selected tier's description immediately through the existing versioned section API. Signature, Premium and Functional remain independent. Refresh the estimator and Configuration Client view so each shows its selected tier's saved wording. Preserve the textarea styling, other saved settings, unrelated unsaved changes and shared vendor-proposal behavior. After the user’s clarification, show saved wording on entry and start empty only when no description is saved. No new API, schema, migration or dependency is expected.

## Integration contract

- The editor's existing `onSave` accepts synchronous callbacks or an asynchronous success/failure result. Await an asynchronous acknowledgement before marking the text applied or clearing pending state. Failed saves retain text; repeated clicks are blocked while saving.
- Add an optional `onSaveDescription(text): Promise<boolean>` through the builder. The inline Configuration editor uses this callback; shared standard consumers retain their existing local-draft behavior.
- The Mode panel owns persistence: use its verified saved advanced-section payload plus `modeDescription`, the current section/aggregate versions, and its existing tier data source. Do not send unrelated unsaved settings. Reconcile the acknowledged description and new versions into the local draft while retaining other field/calculation buffers and their dirty state.
- Reuse the established conflict handling, query commit and invalidation helpers. Existing invalidation already includes estimate-tier queries; inspect catalogue invalidation and add only a demonstrated missing refresh. Keep server-selected source IDs/revisions authoritative.

## Dependency-ordered work and ownership

1. **Baseline and reproduction — primary.** Capture dirty paths and target diffs. Add or adapt a focused regression showing that inline Save must issue a scoped request and survive refetch, without a second Save Mode action. Verify the current callback and saved-section shapes before writers begin. AC1–AC2.

2. **Async editor — editor owner.** Own `KnowledgeModeDescriptionEditor.tsx`, `KnowledgeModeConfigurationBuilder.tsx` and `KnowledgeModeDescription.test.tsx`. Implement the agreed callback contract, busy/error feedback, duplicate-click protection, success acknowledgement and retained text on failure. Preserve empty entry, clearing, Cancel/Escape, autosizing and read-only behavior. AC1, AC3–AC4.

3. **Scoped persistence — persistence owner.** Own `KnowledgeModePanel.tsx`, `KnowledgeItemWorkspace.configurationModes.test.tsx` and `KnowledgeModePanelPendingChanges.test.tsx`. Add the description-only save handler and version/baseline reconciliation. Verify three unequal descriptions, independent tiers/Main Lines, unchanged sibling settings, preserved unsaved buffers, refetch, failures and conflicts. AC1–AC5, AC7.

4. **Preview refresh — preview owner.** Own `knowledgeMutationSync.ts`, `knowledgeMutationSync.test.ts`, `KnowledgeMainLineClientPreview.test.tsx` and `ConfiguredEstimateBuilder.tierInfo.test.tsx`. Verify selected-tier mapping and refresh after acknowledged saves. Avoid product edits when existing mapping/invalidation already satisfies the contract. Do not change pricing or legacy fallback policy. AC5–AC7.

5. **Integrate, review and verify — primary.** Wait for writers to stop, inspect the task delta and run a bounded integrity review. Resolve findings before final integrated checks. Run a synthetic desktop/mobile flow that saves different descriptions and opens both previews, then record exact outcomes and limitations. AC1–AC7.

In Mode A, tasks 2–4 can run in parallel after task 1 and confirmation of the callback contract; their files do not overlap. Primary owns contracts and reconciliation. In Mode B, primary performs the same work inline. Keep one parent task in progress. No implementation or agents start before execution-mode selection.

## Focused verification

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx
npm test -- src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/leads/ConfiguredEstimateBuilder.tierInfo.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx
npm run typecheck
npm run build
```

Verify request payloads and acknowledgements, not just textbox state. Browser QA uses synthetic API responses, not live configuration writes. If evidence requires changing backend description projection, first assign that bounded file/test ownership explicitly and run its focused projection/replica-set checks; do not expand into unrelated backend work.

Run `git diff --check`, inspect status and compare against the captured baseline. Do not rerun known unrelated broad suites without a demonstrated dependency. No lint script exists. Keep diagnostics in a temporary task directory; no deployment, seed, migration, commit or push.

## Completion

Complete when one inline Save persists the selected tier, errors preserve entered text, unrelated drafts survive, both previews refresh to the correct saved description, and focused tests/typecheck/build plus rendered checks are recorded. Report any remaining verification limitation explicitly.

## Implementation and verification record

- Product delta is limited to `KnowledgeModeDescriptionEditor.tsx`, `KnowledgeModeConfigurationBuilder.tsx` and `KnowledgeModePanel.tsx`. No API, backend, schema, CSS or dependency changes. The existing tier projection and catalogue invalidation were already correct; regression coverage now verifies their refresh behavior.
- Inline Save awaits a scoped, version-checked request built from the saved advanced section plus the selected description. The acknowledged result reconciles the local baseline and versions without losing other pending settings. Failure/conflict retains text; retry, explicit clear, duplicate submissions and navigation are covered. Shared standard vendor editing retains its prior callback behavior.
- Integrated focused command: `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/leads/ConfiguredEstimateBuilder.tierInfo.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx` passed: **7 files, 183 tests**. Removing eight unsupported Testing Library options was followed by the affected pending-change suite: **37/37 passed**.
- The pending-change suite contained an old assertion expecting an automatically generated paragraph from an empty advanced payload. The captured baseline builder already returned an empty description and omitted paragraph generation. The stale expectation was removed while retaining inclusion/exclusion checks; this task did not alter generation behavior.
- Read-only integrity review found no confirmed defects. Browser QA saved three unequal descriptions with independent scope/version values and sequential aggregate versions, with exactly three synthetic PUT requests and no second Mode save. The real Configuration Client preview and estimator components displayed the correct selected-tier wording from the saved synthetic catalogue. Screenshots inspected at 1440px and 390px; no browser runtime errors and zero axe violations in the preview. Axe emitted a preload warning.
- Browser limitations: the enterprise QA identity lacks catalogue-read permission, so the real Client preview was mounted in a synthetic QueryClient harness after the actual workspace save flow. This verified the real preview and estimator components without modifying permissions or live data. The entry-point permission behavior remains covered by existing tests; no live authenticated configuration was changed.
- Diagnostics and screenshots are temporary under `/tmp/lisno-tier-description-save-qa`; frontend build output is ignored under `frontend/dist`. Task-baseline hash comparison found only the three product files, six test files and these two approved documents changed.
- Full frontend/backend suites were not rerun; no backend changes were made. No lint script exists. No migrations, seed, production writes, deployment, commits or pushes were performed.
- Final `cd frontend && npm run typecheck`: **passed**. Final `cd frontend && npm run build`: **passed**, with the existing large-chunk warning. Final `git diff --check`: **passed**. The full dirty worktree was captured separately and unrelated paths were preserved. All acceptance criteria are covered by the focused tests and synthetic rendered checks above.

## Follow-up: retain saved wording in the editor

User verified saved text in Client view and clarified first-time empty behavior. The correction is limited to the editor baseline; API, persistence, pricing, layout and preview behavior remain unchanged. Primary owns the editor and documentation; the existing Mode A editor agent owns relevant editor/workspace regression assertions. Verify saved and unsaved initial values, tier/Main Line reopening, Cancel, explicit clear, and no writes on entry. Capture the current dirty baseline in `/tmp/lisno-tier-description-retain-qa`, run affected rendered tests, typecheck/build and a synthetic browser check without restarting backend services.

Follow-up evidence: only `KnowledgeModeDescriptionEditor.tsx` changed in product code; regression expectations updated in the description and workspace configuration tests. `npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx` passed **81 tests across 3 files**. The synthetic browser confirmed saved Signature/Premium wording on entry and return, empty first-time Functional entry, Cancel/Escape restoration, no unintended writes, no horizontal overflow at 390px, zero axe violations and zero runtime errors. Screenshots inspected at desktop/mobile widths; artifacts are temporary under `/tmp/lisno-tier-description-retain-qa`. Backend/OCR services were not restarted and no data was changed.

## Follow-up: enable Client view tiers

Primary owns the small `KnowledgeMainLineClientPreview.tsx` display change; the existing preview agent owns `KnowledgeMainLineClientPreview.test.tsx`. Remove price-based disabling from preview choices and display the selected tier description. Keep pricing availability logic unchanged. Run the preview/entry-point rendered tests, a synthetic click flow with unpriced tiers, and final compile/build/diff checks. Saved-description retention checks already passed: 81 tests, typecheck, build, desktop/mobile browser and axe. Backend services remain stopped.

Preview follow-up verification: `npm test -- src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx` passed **23 tests across 2 files**. Coverage includes three enabled choices, keyboard selection of unpriced/non-applicable preview tiers, selected descriptions, Pending prices, restored valid Signature pricing, and no API mutations. The shared estimate eligibility controls and pricing helpers were not changed.

## Follow-up: restore common Mode description

Primary changes only the workspace description-presentation prop and keeps the existing scoped save path. The editor agent updates the workspace regressions for visible empty/saved common Mode values, `modeTier: default` saves, reopening, tier isolation and permissions. Run workspace/editor/pending tests and a synthetic no-tier-selected save/reopen flow. Prior retention and preview changes have passed their focused tests, typecheck and build; final verification includes this one-line integration change. Backend services remain stopped.

Common Mode regression results: workspace/editor/pending suites passed **82 tests across 3 files**, including description placement above PMC, common Mode first entry, immediate `default`-scope save, reopening, tier/Main Line isolation, loading and read-only handling. Product delta for this follow-up is one workspace presentation prop; no save/API logic changed.

Synthetic common Mode browser verification passed: no tier selected, saved description visible above PMC/Execution, one description save explicitly scoped to `default`, saved text retained after returning from Signature, no tier contamination, Cancel restoring saved text, zero runtime errors and zero axe violations. Screenshot inspected; artifacts are temporary under `/tmp/lisno-common-mode-description-qa`. Preview-tier browser checks also passed at desktop/mobile widths, with zero writes/runtime errors/axe violations, under `/tmp/lisno-tier-preview-enabled-qa`. All browser sessions created for these checks were closed. Live backend/OCR services remain stopped; no live configuration was changed.

Final combined follow-up verification: **105 focused tests passed across 5 files** (82 editor/workspace/pending tests plus 23 preview/entry-point tests rerun after common Mode restoration). Final `npm run typecheck`, `npm run build` and `git diff --check` passed. Build emitted only the existing large-chunk warning. Final diagnostics are in `/tmp/lisno-common-mode-description-qa`; no backend/OCR services were restarted. Baseline reconciliation shows only three product components, three test files and the two working documents changed during these follow-ups; unrelated work is preserved.

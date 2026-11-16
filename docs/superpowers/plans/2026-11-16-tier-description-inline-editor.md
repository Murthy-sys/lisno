# Tier description inline editor: task plan

Date: 2026-11-16
Status: Implemented and verified in Mode A, including the empty-input clarification

Source of truth: [Approved specification](../specs/2026-11-16-tier-description-inline-editor-design.md). The user approved this specification on 2026-11-16.

## Scope and integration

Frontend UI change only. Show one growing Description textarea under Signature, Premium or Functional, with inline Cancel/Save. Hide it in common Mode without deleting stored wording. Preserve existing tier-specific saving, pending-edit guards, permissions, client visibility and vendor-proposal behavior.

Use an explicit presentation option in the existing components: standard shared-consumer behavior, inline tier editor, or hidden common-Mode description. Keep the standard presentation as the shared default. The Configuration workspace selects the presentation; do not change API or data-source contracts. Inline Save continues to apply text to the current tier draft, with persistence through the existing configuration save flow.

## Ordered tasks and ownership

1. **Capture the baseline.** Primary records current dirty paths and relevant diffs before writers start, including existing description changes. Confirm the selected-tier data source and vendor-proposal consumer. No unrelated cleanup. Covers AC7.

2. **Implement the inline editor and layout.** Editor owner changes only `KnowledgeModeDescriptionEditor.tsx`, description-specific rules in `knowledge-mode-reference.css`, and `KnowledgeModeDescription.test.tsx`. Add the inline presentation while retaining standard behavior. Keep the textarea mounted after Save/Cancel, resize on content and width changes, and clean up any resize observer. Remove the separate preview only in inline presentation. Preserve synchronization, clearing, validation, pending callbacks, keyboard access and read-only behavior. Covers AC2–AC5 and AC7.

3. **Connect tier placement.** Integration owner changes only `KnowledgeItemWorkspacePage.tsx`, `KnowledgeModePanel.tsx`, `KnowledgeModeConfigurationBuilder.tsx`, and `KnowledgeItemWorkspace.configurationModes.test.tsx`. Pass the presentation option through the existing hierarchy: inline for the three selected tiers, hidden for common Mode, standard by default for other consumers. Preserve reset keys and navigation guards. Covers AC1, AC5–AC7.

4. **Integrate and inspect.** Primary reconciles the two slices, reviews the complete delta against the baseline, and checks tier isolation, draft lifecycle and shared-consumer preservation. No backend, financial, storage, pricing, dependency or lockfile edits. Covers AC1–AC7.

5. **Verify and hand off.** Run the checks below on the integrated result, resolve task-related failures, and report exact outcomes and any limitations. Covers AC1–AC7.

In Mode A, tasks 2 and 3 may run in parallel after task 1 and agreement on the presentation prop. Their files do not overlap. Primary owns shared interface decisions, review and final verification. In Mode B, primary performs the same bounded tasks inline. Keep only this parent task in progress; no agents or implementation start before execution-mode selection.

## Verification

- Focused frontend command: `npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx`.
- Verify direct textarea visibility, hidden common-Mode editor, empty/long text, clearing, Cancel/Escape restoration, inline Save, unchanged-text handling, tier switching and unsaved-change guards. Retain coverage of inclusion/exclusion synchronization and standard shared-editor behavior.
- Browser checks with synthetic data at desktop and mobile widths: growing/shrinking textarea after typing/paste and resizing, no clipping or horizontal overflow, adjacent/wrapped controls, readable saved/read-only text, keyboard access and accessibility checks. Do not mutate live configuration for QA.
- Run frontend `npm run typecheck`, `npm run build`, then repository `git diff --check` and `git status --short`. Broaden tests only if an affected consumer or failure justifies it. No lint script exists.
- Keep temporary diagnostics outside tracked product files. No deployment, migration, seed, commit or push.

## Completion

Complete when the approved UI is rendered and verified in all three tiers, common Mode hides the editor, existing draft and shared-consumer behavior remains intact, and the final diff contains only the authorized UI work. The specification and task plan are approved; the user selected Mode A.


## User clarification during implementation

The user explicitly requested an empty text field for entry, including where existing wording had been prefilled. Editable inline tier fields now open blank without changing stored configuration or becoming dirty. Typing and inline Save apply the user’s wording through the existing tier draft/save flow; the field then retains that applied text. Cancel/Escape restore blank before the first inline Save and the applied description afterward. Reopening an editable tier starts a new blank entry. Read-only views and standard shared consumers continue to show saved descriptions. This is a presentation change, not a data reset.


## Completion record

Implemented the five frontend product files named above and updated three affected test files (`KnowledgeModeDescription.test.tsx`, `KnowledgeItemWorkspace.configurationModes.test.tsx`, and the common-Mode readiness assertion in `KnowledgeScreens.test.tsx`). No backend, API, database, dependency or lockfile changes. Existing saved configuration is preserved until the user explicitly applies and saves replacement wording through the existing configuration flow.

- Approved Mode A: independent editor/layout and tier-placement writers, followed by scoped integrity review and final verification. Review found one obsolete common-Mode test readiness selector; corrected it. Primary reviewed the later empty-on-entry state change.
- `npm test -- src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx`: **73 passed** after the clarification.
- `npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx -t 'keeps the default Mode open when Overview disables every optional tier'`: **1 passed, 121 filtered**.
- Frontend `npm run typecheck` and `npm run build`: **passed** after final edits. Build retains the existing Vite chunk-size warning; ignored output is `frontend/dist`.
- Broader exploratory `KnowledgeScreens.test.tsx`: **106 passed, 16 failed**. A read-only Vitest load overlay of the captured pre-task modules reproduced **the same 16 failure names**. These pre-existing broader failures were not changed. Evidence: `baseline-screens.log`, `baseline-comparison.json`; no shared sources were replaced for this check.
- Browser verified empty editable fields in all three tiers, hidden common editor, saved-data preservation, no automatic dirty state, typing/pasting growth and shrink, width reflow, inline/wrapped buttons, Save/Cancel/Escape, tier-navigation guards and read-only content. At 1440px and 390px there was no horizontal overflow; accessibility checks found **zero axe violations**, no runtime errors and no API write requests. Screenshots inspected.
- `git diff --check` passed. Initial hashes covered 4,464 files; comparison found only the eight scoped source/test files and these two documents changed. No unrelated work was overwritten. Final verification confirmed task-source hashes remained stable during its checks.

Artifacts: `/tmp/lisno-tier-description-inline-qa/`, including the baseline, final logs, `browser-summary.json`, empty desktop/mobile screenshots and task diff. The synthetic browser session was closed. No seed, migration, live data mutation, deployment, commit or push. Full backend/OCR suites and unrelated frontend suites were not run; there is no lint script. The known broader test failures are the remaining verification limitation.

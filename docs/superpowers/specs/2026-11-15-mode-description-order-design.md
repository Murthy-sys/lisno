# Mode description order and metadata cleanup

Date: 2026-11-15
Status: Proposed for approval

## Goal

Show Description at the top of Mode content, above the PMC/Execution selector. Remove the visible **Section version …** text and **Read-only revision** badge from Mode while retaining the existing styling and editing restrictions.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx` currently renders the read-only badge, PMC/Execution selector, then Description and the mode sections.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx` renders `Section version` in each Mode block toolbar, alongside unsaved/saving feedback. The same version value also serves internal save and conflict handling.
- Existing builder, Mode state-removal, and proposal-workspace tests assert some of the labels being removed. Other tabs have their own read-only labels and are outside this request.

## Requirements and scope

1. Move the existing Description block above the PMC/Execution selector in actual document order, preserving its current editor, field reference, callbacks, and styling. Keep validation errors visible when present.
2. Remove the Mode builder's Read-only revision badge and the Mode block toolbar's Section version text for every revision number, not just version 7.
3. Preserve Unsaved changes, Saving…, errors, and conflict feedback. Do not leave an empty toolbar, separator, or reserved space when no toolbar content remains.
4. Preserve internal version tracking, save/concurrency behavior, generated/custom descriptions, PMC/Execution visibility controls, and all existing read-only guards.
5. Apply through the shared Mode components. Do not remove labels from unrelated tabs or change any API, saved data, pricing, workflow, dependency, or theme.

Expected production scope is the two components above, with scoped spacing adjustments only if rendered inspection requires them. Preserve all previous work in the dirty repository.

## Assumptions, risks, and open decisions

“Above PMC/Execution” means above the selector shown in the screenshot as well as its sections. Removing a badge does not enable editing. The main risks are leaving blank header space or accidentally removing useful unsaved/conflict feedback; keep those conditions intact. No product decision remains open.

## Acceptance and verification

- Description precedes the Mode selector in both editable and read-only views.
- Mode shows neither Section version nor Read-only revision, with no empty metadata row.
- Description editing, mode visibility, disabled fields, save/version handling, and unsaved feedback retain existing behavior.
- Preserve desktop/mobile layout and accessible labels. Run relevant existing component assertions, a rendered layout check, frontend typecheck/build, and `git diff --check`; avoid unrelated suites.

This stage creates only the specification. The repository workflow requires specification approval, separate task-plan approval, and execution-mode selection before implementation.

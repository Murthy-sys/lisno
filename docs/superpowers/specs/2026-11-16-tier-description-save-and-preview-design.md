# Persist tier descriptions and refresh client previews

Date: 2026-11-16
Status: Implemented and verified locally in Mode A

## Goal

The inline Description Save button must persist the user's wording independently for Signature, Premium and Functional, and the selected tier must display that saved wording in the estimator and Configuration Client view. Preserve the approved textarea placement and styling.

## Current behavior and evidence

- `KnowledgeModeDescriptionEditor.tsx` calls a synchronous `onSave`, then closes its local edit. `KnowledgeModeConfigurationBuilder.tsx` only changes the local advanced-section payload. No request is issued by this inline action.
- The separate Save Mode operation in `KnowledgeModePanel.tsx` performs the actual versioned section request. This two-step behavior explains why clicking inline Save alone does not persist a description.
- The user clarified after verifying the saved description in Client view that empty entry applies only when no description has been saved. Editable fields must show their existing saved wording on opening; opening a field must never write an empty description.
- Tier storage already exists. `knowledgeModeTierDataSource.ts` keeps Signature in the established base advanced section and Premium/Functional in their named scopes, verifies stable source identity, and supplies the appropriate query and mutation scope.
- Configuration Client view and the estimator already select `tierDescriptions[selectedTier]`. The backend projector prioritizes each tier's own description. The primary confirmed defect is the absent persistence step; preview freshness and the complete save-to-display path still need regression verification.

## Requirements and acceptance criteria

1. One click on inline Save persists only the selected tier's description through the existing section API. Do not require a second Save Mode click for this text.
2. Preserve other tiers, common Mode, saved configuration settings and unrelated unsaved edits. Build the write from the verified saved section plus the explicit description change; retain unrelated local buffers and reconcile their baseline/version after success. Never silently save other pending fields.
3. Await the server acknowledgement before showing success or clearing pending description state. Disable duplicate submission and prevent navigation from silently discarding an in-flight edit. On validation, network or version failure, retain the entered text and show a retryable error or the established conflict review.
4. Show the saved description in the editable field, using an empty value only when no description has been saved or the user explicitly saved a clear. Keep the auto-growing textarea with inline Cancel/Save. Opening or cancelling must not erase saved text. After a successful save, retain the entered text in the current editor and provide accurate save feedback. Read-only controls and existing shared vendor-proposal behavior remain intact.
5. Persist three different descriptions for the same Main Line and verify each independently after refetch. Clearing previously applied wording must remain an explicit save and must not affect another tier.
6. After a successful save, refresh the authoritative tier/configuration and catalogue/estimate-tier queries used by the estimator and Configuration Client view. Both displays must show the saved description for the selected tier, without stale text from another tier or Main Line.
7. Preserve current source/revision rules, authorization, version/CAS checks, pricing, specification behavior and historical estimate/publication snapshots. Retain established fallback rules for absent legacy data; an explicitly saved tier description or explicit clear takes precedence.

## Scope and constraints

Extend existing frontend save orchestration and async editor feedback. Reuse the existing scoped API and existing preview projection; no schema migration, new endpoint or dependency is expected. Change a mapping or refresh path only where evidence demonstrates it is necessary. No live configuration rewrite, seed, deployment or data repair.

This corrects the earlier draft-only inline Save contract. The clarified blank-input request applies only to first-time entry, not saved descriptions and not automatic deletion. Existing dirty work must be captured and preserved before implementation.

## Verification, risks and open decisions

Verify real mocked requests and server responses, not only local textbox values: all three independent tiers, refresh/reopen, explicit clearing, duplicate clicks, failure retention, version conflicts and unrelated dirty settings. Use distinct Main Lines and unequal tier text so wrong joins cannot pass. Verify both client previews select and refresh the correct text after saving.

Run focused editor/workspace/preview tests, applicable projection tests if backend mapping changes, frontend typecheck/build and repository diff checks. Include a rendered desktop/mobile save flow with synthetic API responses. Known unrelated broader test failures remain separately documented.

The main risks are sending stale versions, unintentionally persisting unrelated configuration edits, clearing pending text before acknowledgement and stale preview caches. The existing scoped APIs establish the preferred approach; no additional product decision is needed. Rollback is limited to this save/refresh correction without rewriting stored data.

## Completion

Implemented and locally verified. See the [task plan and verification record](../plans/2026-11-16-tier-description-save-and-preview.md) for the exact changed areas, 183 passing focused tests, typecheck/build results, synthetic browser evidence and limitations. No live configuration or production data was changed.

## Saved-text display clarification

The user confirmed persistence and Client view are correct and clarified that existing saved descriptions must remain visible in the textarea. This is a local editor-display correction within the implemented save task; scoped persistence and preview mapping remain unchanged. Remove the forced blank baseline, retain Save/Cancel/clear behavior, and verify first entry, reopening and independent tier/Main Line values. Backend services remain stopped as requested.

## Client preview tier selection clarification

The user requested enabled Signature, Premium and Functional choices in Configuration Client view. All three choices are selectable in this local preview, including tiers without a configured price. Show only the selected tier’s supplied description, or the existing missing-description state. Preserve Pending and the missing-price message instead of borrowing another tier’s amount. This changes preview selection only; estimate eligibility, actual pricing, API contracts and stored configuration remain unchanged. Verify three enabled radios, description selection, unavailable pricing and absence of writes.

## Common Mode description restoration

The user clarified that common Mode must retain its description editor when no tier radio is selected. Show the same inline auto-growing description above PMC/Execution for common Mode as for each named tier. Common Mode uses its existing `default` scope and independently saved value; it must not load or overwrite Signature/Premium/Functional text. Empty first-time values, retained saved wording, Save/Cancel, error handling and read-only behavior remain consistent. Restore the field via the existing workspace presentation prop; no backend, schema, pricing or data migration.

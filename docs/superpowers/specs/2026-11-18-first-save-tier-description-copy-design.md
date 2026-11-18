# First-save tier description copying

Status: Original save-triggered behavior and the approved already-saved-description amendment are implemented and locally verified in Mode A. Automated and real-API desktop/mobile verification, known unrelated failures, and coverage limits are recorded in the [task plan](../plans/2026-11-18-first-save-tier-description-copy.md). No deployment or production mutation was performed.

## Amendment: initialize from an already-saved description

This amendment supersedes the earlier restriction that copying requires a changed source description. The existing save-triggered behavior remains, with an additional initialization step for editable Mode screens.

### Reported behavior and confirmed cause

The supplied screenshots show a saved Signature paragraph and empty Premium/Functional fields. Current code explains this case:

- `copyUninitializedTierDescriptions` returns without copying when the source text matches its previous saved value.
- `updateSectionInSession` invokes copying only for a changed nonblank description.
- `KnowledgeModeDescriptionEditor` does not submit unchanged text, and `knowledgeModeTierDataSource.getSection` only reads the selected tier.

Consequently, previously saved wording never initializes empty sibling descriptions merely by opening the editor. This was omitted from the initial implementation. The screenshots do not establish whether an empty field is stored as absent/null or an explicitly cleared string; existing-clear protection must remain.

### Corrected behavior

1. Opening an editable named Mode for a saved draft initializes eligible descriptions from wording already saved in that same Main Line/revision. The user does not need to change Signature or save each destination separately. Reopening the editor and opening another tier after a saved applicability change must also handle remaining eligible destinations.
2. When Signature has a valid saved description and is enabled/configured, use it as the source. Otherwise use the first enabled/configured named tier with valid nonblank text in Premium, Functional order. This deterministic order resolves existing records with more than one authored description. Preserve every existing destination description regardless of the chosen source.
3. Eligibility remains absent/null `modeDescription`, enabled in saved Overview, and not explicitly `not_applicable`. Preserve all strings, including deliberately saved empty strings. No eligible destination or no valid source is a no-op.
4. Persist initialization through an explicit authenticated mutation. GET requests remain read-only. The backend reads the source text itself, updates only eligible destination descriptions/applicability, and preserves all unrelated settings. No browser-generated saved payload or display-only fallback is used.
5. The mutation is scoped by Main Line ID, current draft revision ID, advanced-section version, and aggregate version. It uses the existing update-section authorization, transaction, CAS, validation, and audit protections. Record source/destination tier IDs without description text. Repeated initialization with nothing left to copy must not change versions or add duplicate audit events.
6. After successful initialization, refresh the authoritative section/item/catalogue queries before allowing edits against the old versions. Do not overwrite or submit unrelated local drafts. Start initialization before the Mode editor becomes editable; do not trigger background writes while the user has pending edits. Re-check only after a safe navigation/save boundary.
7. On a conflict, refresh and reevaluate eligibility against current saved data before a bounded retry. On failure, use existing error/retry states and never present a copy as successfully saved. Avoid effect-driven retry loops and duplicate requests under React Strict Mode or rapid tier switching.
8. Read-only users, active/historical revisions, client views, proposal editing, and default Mode must not trigger initialization or automatic draft creation. Client views continue to display only their selected tier's actual saved description after initialization succeeds.
9. Preserve ordinary changed-description saves and their atomic first-save copying. No deployment, direct production-data update, bulk backfill, or migration is authorized by this amendment. Existing items are initialized individually through the normal editable application workflow once the change is running.

### Approach and contract impact

Use a narrow, idempotent initialization mutation, with request identity/version fields and a response reporting current versions plus the copied tier IDs and source tier (or no source for a no-op). Keep it under the existing Configuration section-update permission; synchronize route-operation registration and OpenAPI documentation. Existing GET/save response meanings remain unchanged, and no database schema change is expected.

The alternative is to prefill an unsaved editor value and require Save on the destination. It would avoid automatic persistence on opening the editor, but would leave the client-facing saved description empty until another user action. The recommended persisted initialization matches the requested automatic copying of existing wording.

### Additional acceptance criteria

| ID | Acceptance criterion and verification |
| --- | --- |
| AC8 | Start with an already-saved Signature description and absent/null descriptions in enabled Premium and Functional. Opening editable Mode fills and persists both without changing Signature or clicking their Save buttons. Verify all three fields after switching/reopening and the selected client preview. |
| AC9 | Existing nonblank/cleared descriptions, default Mode, disabled scopes, unrelated fields, other Main Lines, and historical revisions remain unchanged. Verify source priority when Signature is unavailable and no-op behavior when no eligible source/destination exists. |
| AC10 | Repeat navigation, Strict Mode, concurrent writers, stale versions, and retries do not overwrite newer text or produce duplicate successful writes. Test real transaction rollback and audit/version behavior. |
| AC11 | Initialization cannot run for read-only/client/proposal/history views, cannot create a draft automatically, and cannot discard unsaved work. Rendered tests cover initial loading, failure/retry, rapid switching, saved applicability changes, and preserved local edits. |

Principal new risks are writes triggered by editor navigation, stale versions, duplicate effects, and ambiguous existing empty strings. The explicit mutation, narrow permissions, idempotent no-op behavior, and unchanged clear protection address them. Code rollback stops future initialization; already-copied descriptions remain ordinary editable text.

This changes the previous write trigger and API contract, so the repository workflow requires approval of the amended spec and corresponding task-plan update. The previously selected Mode A remains the execution preference; no implementation is included in this spec-only revision.

## Goal

When a description is saved in an enabled Signature, Premium, or Functional tier, copy that wording into the other enabled tiers that have never had a description saved. Each tier then owns an independent saved description.

Example: Signature and Functional are enabled, and Functional has no saved description. Saving `Custom wardrobe installation.` in Signature saves the same text in Functional. Subsequent Signature edits do not overwrite Functional.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`, `saveDescription`, saves only the selected tier's advanced section, using section and aggregate versions. Clearing a description explicitly saves an empty string.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeDescriptionEditor.tsx` trims the paragraph at save time, validates its length, and retains entered text after save failure.
- `backend/src/services/ai-estimator-knowledge-item.service.ts`, `updateSectionInSession`, validates the selected payload, merges it into the current draft, performs version checks, and writes the section, revision, Main Line, and audit event in one transaction.
- `backend/src/domain/ai-estimator-knowledge-mode-tiers.ts` stores Signature at the advanced-section root and Premium/Functional under `tierConfigurations`. Missing sibling scopes currently stay empty. The separate `default` Mode scope is also retained.
- Saved Overview `applicableTiers` identifies enabled tiers. Existing compatibility behavior treats an absent selection as Signature only and an explicit empty array as no enabled tiers.
- `frontend/src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.ts` keeps separate tier caches while all tiers share the section version. Its current comment that a sibling's payload does not change will need reconciliation with copying.
- `backend/src/domain/estimator-tier-description.ts` now projects only the selected tier's own saved wording. The preceding approved GST/description changes are present as uncommitted work and must be preserved.

## Required behavior

1. Apply copying on a successful Configuration draft save that adds or changes a nonblank `modeDescription` in an enabled Signature, Premium, or Functional tier. Use the accepted source text exactly, retaining internal line breaks. Unrelated settings saves, canceled edits, empty descriptions, and failed saves do not trigger copying.
2. Determine eligible destinations from the same Main Line and draft revision's saved Overview. Copy only to the other enabled named tiers. Never copy to or from the separate default Mode scope, another Main Line, or another revision.
3. A destination with an absent or null `modeDescription` is uninitialized and eligible. A saved string, including an explicitly empty string, is already initialized and must remain unchanged. Preserve malformed existing values for explicit validation/recovery rather than silently replacing them.
4. Preserve an explicitly `not_applicable` destination section. An eligible missing or `not_configured` destination can acquire the description and become `configured`, using the existing section semantics. This does not create rates, mode settings, or financial readiness.
5. Copy only `modeDescription`. Preserve all destination calculations, margins, specifications, scope lists, component IDs, and other data. Validate the new description without weakening existing validation or rewriting historical compatibility fields.
6. Copying is initialization, not ongoing synchronization. After copying, editing or clearing any tier affects only that tier. Enabling another tier by itself does not copy old wording; a later changed, nonblank description save can initialize that tier if it is still eligible.
7. Persist the source and eligible destination descriptions together under the existing transaction and section/aggregate version checks. A conflict or validation failure must leave all descriptions unchanged. Existing authorization and immutable revision rules remain authoritative.
8. Refresh affected tier caches and previews after success. Switching to a copied tier must show the saved wording without a browser reload. Preserve unrelated unsaved edits and existing conflict handling; do not issue separate client-side save requests for each sibling.
9. Keep the client UI unchanged: show only the selected tier's saved description. No fallback at read time, automatic specification sentences, extra headings, dialogs, or decorative UI.

## Assumptions and scope

“First time” refers to the destination description, not the age of its other settings. An explicitly cleared description stays empty. Null represents no authored description; the current UI uses an empty string for deliberate clearing. These assumptions preserve existing user choices.

Use server-side copying in the existing Configuration section-save transaction. Frontend-only copying would require multiple requests and could partially save or overwrite concurrent changes. No new public endpoint or database schema is expected.

This scope covers live Configuration draft editing and its consumers. It does not introduce copying during revision cloning, proposal application, historical reads, activation, bulk provisioning, or existing-data migration. Previously approved GST presentation and selected-tier-only rendering remain intact.

## Data, permissions, failure handling, and rollback

- Preserve stable Main Line/revision IDs, authorization, selected-tier request shapes, and response projection. Clients cannot supply arbitrary sibling payloads.
- Record copied destination tier IDs in the existing successful-save audit event without adding description text to logs. Use one logical save and the existing version increment semantics.
- Reject stale writes atomically. Failed writes must retain local input for retry and must not advertise copied values as saved.
- No backfill, seed, dependency, production mutation, commit, push, or deployment is included. Reverting this behavior stops future copying; descriptions already saved remain ordinary editable tier text and are not automatically erased.

## Risks and acceptance criteria

| ID | Acceptance criterion and verification |
| --- | --- |
| AC1 | With only Signature and Functional enabled and Functional uninitialized, saving Signature copies exactly to Functional and leaves Premium/default untouched. Verify persisted values and reopening both tiers. |
| AC2 | Each named tier can be the source; two or three enabled tiers and a pre-existing sibling description behave correctly. Test the full source/destination matrix with distinct text. |
| AC3 | Existing nonblank descriptions, deliberate empty strings, disabled tiers, `not_applicable` scopes, and other Main Lines/revisions are unchanged. Null and absent destination values initialize as specified. |
| AC4 | Later edits/clears remain independent; unrelated saves, cancel, unchanged text, blank source text, and failed validation cause no copying. Verify source and destination state. |
| AC5 | Concurrent and stale saves cannot overwrite a sibling or partly commit. Replica-set integration tests assert rollback, shared versions, preserved unrelated fields, authorization, and audit destination IDs. |
| AC6 | After successful save, tier switching and client preview show copied persisted wording. Rendered interaction tests cover keyboard save, cache refresh, conflict/failure recovery, unsaved edits, and independent later editing. |
| AC7 | Selected-tier-only client projection, the 4,000-character limit, default Mode independence, existing GST display, and historical financial values remain unchanged. Run focused regressions, affected workspace typechecks/builds, and `git diff --check`. |

Primary risks are overwriting deliberate blanks, stale sibling caches, accidentally marking disabled settings active, transaction conflicts, and replacing independent configuration data. Existing malformed scopes must fail safely rather than be repaired implicitly.

## Open decisions

No additional product choice is required if the first-save and explicit-clear assumptions above are accepted. The separate implementation task plan follows specification approval, as required by `AGENTS.md`.

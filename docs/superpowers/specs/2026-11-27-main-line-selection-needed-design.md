# Main Line Overview: Selection needed

Date: 2026-11-27
Status: Approved on 2026-11-27
Classification: Substantial, bounded additive configuration contract and persistence

## Goal and confirmed scope

Add a **Selection needed?** radio group with **Yes** and **No** choices under Overview for every Main Line in the web Configuration tab, including temporary Main Lines that use the same Configuration Overview.

The user confirmed: **save and display the setting only**. This is configuration metadata. It does not change which Main Lines appear in Client selections, generate tasks, require selection completion, alter design upload requirements, or change estimate/pricing/approval behavior.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx` renders existing Yes/No settings for client visibility, default estimation display, and mandatory dimensions. Configuration presentation is explicitly selected by `KnowledgeItemWorkspacePage.tsx` for Overview.
- `shared/knowledge/knowledgeSectionPayload.ts` enumerates editable Overview fields and rebases only locally edited fields over the latest saved payload. `KnowledgeConflictReview.tsx` separately enumerates fields shown during conflict review. Neither currently contains a selection-needed flag.
- `backend/src/domain/ai-estimator-knowledge-validation.ts` explicitly allows and validates Overview fields. It must accept the new boolean before a client can save it. `backend/src/openapi/ai-estimator-knowledge.ts` documents the same payload.
- `AiEstimatorKnowledgeSection.ts` persists a revision-owned JSON payload and validates it through the domain validator. `ai-estimator-knowledge-item.service.ts::updateSectionInSession` requires the current editable draft, section version, aggregate version, authorized actor, transaction, and audit; the generic Overview path clones and saves the payload.
- The existing Design section contains separate detailed design rules, including Designer/vendor and Client-finish approvals. None is equivalent to this requested metadata flag; those rules remain independent.
- The worktree contains prior approved upload/workflow/UI changes. The proposed Overview, rebase, conflict-review, validation, and OpenAPI targets are clean at this inspection. Recheck target diffs before implementation and preserve all unrelated changes.

## Behavior and UX

1. Add **Selection needed?** with **Yes** and **No**, immediately after the existing default-display question in Configuration Overview. Use the established fieldset, Radio components, spacing, keyboard behavior, and focus styles. No visual redesign or new dependency is needed.
2. Helper text: **Record whether this Main Line needs a selection.** The UI must not imply that this setting already controls Client lists or workflow enforcement.
3. The setting applies once per Main Line revision, across its modes and tiers. Do not infer it from names, pricing modes, `clientVisible`, `showByDefault`, or Design-section rules.
4. Existing records without the field display **No**. Only boolean `true` displays Yes. Opening a line or changing an unrelated field must not automatically add or overwrite this value.
5. Clicking a radio changes the local draft and marks this field dirty. The existing Save action persists it; discard and unsaved-navigation behavior remain unchanged. Reopening or refreshing after a successful save shows the saved value.
6. Respect existing Configuration read/update authorization, `allowedActions`, and draft editability. Disable edits while saving or read-only. Active/history and archived views retain their existing protections.
7. Conflict review shows the server's **Selection needed?** value. Retrying a save rebases only explicitly edited fields, preserving newer unrelated Overview values. Invalid historical data must never be interpreted as Yes; the conflict view can report that the saved configuration needs review, following existing conventions.
8. Keep the new control limited to Configuration presentation. Shared proposal editors and standalone procurement forms do not gain an additional question through component reuse. Existing consumers must preserve the field during unrelated saves.

## Data and API contract

- Store optional `selectionNeeded?: boolean` in the revision's `overview.payload`; absence has display meaning No.
- Extend the backend Overview allowlist and boolean validation, OpenAPI documentation, shared editable-field union, and web conflict-review mapping. Accept absent, true, or false. Reject explicit null, strings, numbers, arrays, and objects. Do not allow this field in other section types.
- Reuse existing section read/update routes and versioned request/response envelopes. Add no endpoint, collection, permission, or role grant.
- Save against stable Main Line and revision IDs. Preserve both true and false through new-draft creation and duplication, without modifying the source active revision or immutable history.
- Continue existing post-save query synchronization so the workspace and saved Overview refresh correctly. No new downstream catalogue or Client-selection projection is required.
- Keep web/native shared payload compatibility. This request adds the web Configuration control; native and proposal editors must retain the saved metadata when editing unrelated values, without introducing a native editor redesign.

## Permissions and state transitions

| State | Expected behavior |
| --- | --- |
| Current draft with existing update authority | Edit local Yes/No, then use Save. |
| Read access without update authority | Display the current/default value, disabled. |
| Active revision, archived line, or history | Preserve existing read-only behavior. |
| Save in progress | Disable the setting and retain the selected draft value. |
| Stale section/aggregate version | Existing conflict handling; show current server value and rebase only edited fields. |
| Read/save failure or uncertain outcome | Existing error/retry behavior; do not present an unconfirmed value as saved. |

No changes to authorization boundaries, estimate totals, published documents, approved designs, selection records, or workflow stages are permitted by this feature.

## Compatibility, risks, and rollback

- No migration, seed, backfill, or bulk update is required. Historical records may remain without the field indefinitely.
- Main risks are losing the field during unrelated saves, omitting it from conflict handling, accidentally adding it to shared proposal forms, or implying downstream behavior that does not exist. Verification must cover these boundaries.
- Backend field acceptance must be available before the running frontend submits it. During local verification, confirm that the actual running API has loaded the changed validator; a successful source build alone does not update the existing non-watching development server.
- A rollback may remove the UI while retaining backend acceptance and stored metadata. Do not delete values or revert to a writer that silently drops them.
- No dependency installation, production mutation, deployment, commit, push, or external communication is included.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | All regular and temporary Configuration Overview screens show an accessible Yes/No group; missing means No. | Rendered panel/workspace tests, keyboard interaction, read-only/saving cases, and responsive browser check. |
| AC2 | Yes and No save and reload through existing versioned persistence; opening alone writes nothing. | Focused backend validator and Mongo replica-set section service round trips; web save/reload integration. |
| AC3 | Unrelated edits and conflict retry preserve saved metadata and other Overview fields. | Shared rebase tests, conflict display tests, stale-version rejection, save error/uncertain-result checks, preservation in shared consumers. |
| AC4 | Draft copying and duplication preserve the value; active/history and unauthorized writes remain protected. | Existing service lifecycle/authorization seams with distinct true/false lines and source-revision assertions. |
| AC5 | The flag has no effect on Client selections, tasks, estimates, pricing, or design review. | Scoped diff/contract review; no downstream filtering/enforcement edits; shared proposal control remains absent. |
| AC6 | Contracts and implementation remain aligned. | OpenAPI/schema checks, relevant backend/frontend focused tests and typechecks/builds, shared/native compatibility check as affected, final `git diff --check` and status review. |

Use existing tests around `KnowledgeOverviewPanel`, `knowledgeSectionPayload`, `KnowledgeConflictReview`, Overview workspace saves, `ai-estimator-knowledge-validation`, section-service replica-set tests, and OpenAPI. Broaden verification only as justified by actual changed paths. There is no repository lint script. Record commands, results, baseline failures, and unrun checks in the later approved task plan.

## Assumptions and open decisions

- Default No and placement after the default-display question are approved defaults consistent with an optional metadata flag.
- Scope is confirmed as save/display only. There is no unresolved downstream-workflow decision.
- The user approved this specification and the separate task plan, then selected Mode A. Local implementation and verification are authorized; production actions remain outside scope.

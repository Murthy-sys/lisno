# Main Line defaults in estimation

Status: Specification and task plan approved on 23 November 2026. The user selected Mode A, parallel implementation. Execution is tracked in the [task plan](../plans/2026-11-23-main-line-show-by-default.md).

## Goal and confirmed requirement

Add **Show this Main Line by default?** with **Yes / No** choices to Main Line Overview. The user clarified that estimation should show only Main Lines selected as default Yes under a Sub-Basket, instead of listing every Main Line.

This setting controls the initial catalogue rows displayed in the estimate builder. A visible default row still follows the existing explicit item-selection and quantity-entry flow; showing it does not automatically include it in the estimate or charge for it.

## Current behavior and evidence

| Verified behavior | Current source |
| --- | --- |
| Overview has independent Yes/No controls for client visibility and mandatory dimensions, but no default-display flag. | `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx` |
| Overview saves rebase only edited fields, send section and aggregate versions, and use existing mutation synchronization. | `shared/knowledge/knowledgeSectionPayload.ts`, `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx` |
| Conflict review explicitly enumerates Overview fields. A new control must be included there to remain reviewable. | `frontend/src/features/ai-estimator-knowledge/KnowledgeConflictReview.tsx` |
| The backend validates an explicit Overview field allowlist. Section payloads use the existing revision-owned JSON model; adding an allowed boolean does not need a new collection. | `backend/src/domain/ai-estimator-knowledge-validation.ts`, `backend/src/models/AiEstimatorKnowledgeSection.ts` |
| Section updates validate the current draft and version, persist the payload in a transaction, and append an audit event. Revision copying clones the Overview payload. | `backend/src/services/ai-estimator-knowledge-item.service.ts`, `updateSectionInSession`, `copyRevisionSections` |
| The estimation catalogue projects current Overview values from the latest saved draft, otherwise active revision. It also supports source resolution for pricing and recommendations. | `backend/src/services/estimator-catalogue.service.ts` |
| Sales catalogue browsing creates display-only rows for every eligible item under selected baskets, applying pricing availability but no default-display condition. | `frontend/src/features/leads/salesEstimateCatalogue.ts`, `ConfiguredEstimateBuilder.tsx` |
| The web workspace enables catalogue presentation for editable Sales estimates; other presentations already use selected estimate rows. Add items is a separate explicit selection flow. | `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `ConfiguredEstimateBuilder.tsx` |
| The current web `buildConfiguredLines` refreshes existing draft rows; removing a line from the source catalogue would incorrectly make an existing row appear unavailable. | `frontend/src/features/leads/configuredEstimate.ts` |
| Overview mutation invalidation already covers the estimation catalogue query family. | `frontend/src/features/ai-estimator-knowledge/knowledgeMutationSync.ts` |

The initial worktree inspection found existing margin-related changes, including changes to the backend validation, OpenAPI, item service and frontend cache synchronization. Those changes are independent of this request and must be preserved. The proposed Overview UI, Overview rebase helper and Sales catalogue projection paths were clean at inspection. Recheck target diffs before implementation because the workspace is shared.

## Proposed behavior

### Overview

1. Display the new radio group in Configuration Overview for every Main Line, including temporary items that use that Overview. Place it beside the existing configuration questions, immediately after client visibility. It is one setting for the Main Line across all tiers.
2. Label: **Show this Main Line by default?** Choices: **Yes**, **No**. Helper text: **Yes shows this item in the default estimation list. No keeps it available through Add items and recommendations.**
3. Use the existing Radio components, spacing, focus treatment, dirty tracking, Save action and unsaved-navigation protection. A click changes only local form state until Save succeeds.
4. Initial and legacy behavior is **No**: only a saved boolean `true` qualifies as Yes. Opening a previously unmarked line must not write a value automatically. This makes the user's explicit Yes selections authoritative.
5. Follow the existing Configuration read/update permissions and draft editability. Active/history views and unauthorized readers show the setting without allowing edits. Saving disables the control along with the other Overview controls.
6. Reopening, unrelated Overview edits, conflict review/retry, draft creation and duplication preserve the stored boolean. Reading malformed stored data must not interpret strings or numbers as Yes.

### Estimation

1. Default browsing under each Sub-Basket shows eligible Main Lines with `showByDefault === true`, plus rows already explicitly included, saved or being edited in the current estimate. Apply the same rule to temporary items shown in the default catalogue, including those directly under a Main Basket.
2. **No** and absent values suppress unused preview rows from the default list. They do not delete Configuration, mark a source missing, remove saved estimate rows, clear user edits, or change existing included quantities or totals.
3. Retain the existing explicit **Add items** flow for non-default eligible items. Existing optional and required recommendations also retain their source/target identities and selection behavior. Once explicitly added, a non-default item appears as an estimate row.
4. Combine default visibility with existing configuration, positive-base-price, tier and mode eligibility rules. Yes cannot make an incomplete or unavailable item selectable.
5. Apply default filtering before default-list search, counts and per-group pagination. Searching the default list does not reveal No items; Add items searches the eligible catalogue independently. Labels/counts must clearly describe the list being counted rather than claiming the default subset is the whole catalogue.
6. An empty default group states **No default items are configured for this Sub-Basket.** Keep the existing Add items entry point. Distinguish this state from loading, failed catalogue reads and a search with no matches. Do not fall back to showing all Main Lines when no Yes values exist.
7. Saving Overview refreshes the catalogue through existing invalidation. A Yes-to-No change removes only an unused preview after refresh. A No-to-Yes change makes an eligible preview available without selecting it automatically. Preserve current stale-data and version-conflict safeguards.
8. Existing submitted, published, approved and historical estimates retain their saved rows and amounts. The setting is not a new client-visibility rule and does not replace `clientVisible`.

## Data and API contract

- Store `showByDefault?: boolean` on the revision's `overview.payload`. Absence means false. Reject explicit null, strings, numbers, arrays and objects on write. Permit the field only in Overview.
- Extend the backend Overview allowlist and OpenAPI property documentation, shared Overview editable-field union, and web conflict-review field mapping. Keep generic section update/read envelopes and existing HTTP routes.
- Project an explicit `showByDefault: boolean` on estimation catalogue Main Lines and temporary items using the same current revision as the rest of that line's configuration. A current draft with an absent/false value must not inherit true from an older active revision.
- Align backend, web and native catalogue DTOs. Older catalogue responses with no property are treated as No for unused default previews; existing explicit estimate rows remain intact.
- Keep the complete authorized catalogue and resolver data available for pricing, saved-row hydration, Add items, recommendations and Procurement-related source lookups. Filter the display projection instead of globally removing non-default sources in `eligibleCatalogueLines` or `resolveEstimatorCatalogueLines`.
- Preserve stable Main Line, Sub-Basket, basket, revision and section identities. Keep the existing transactional audit and section/aggregate version checks. No new permission, audit action, route, background job, index or independent flag on the Main Line document is required.
- The flag describes current discovery behavior and is not added to immutable financial snapshots as a new pricing input. Existing configuration-version refresh requirements still apply.

## Scope, assumptions and alternatives

**Included:** web Configuration Overview, persistent validation/documentation, current catalogue projection, web default estimation browsing, related counts/empty states, cache refresh and regression checks. Reuse the existing UI; no visual redesign or dependency is needed.

**Recommended interpretation:** No means absent from automatic browsing, while deliberate Add items and recommendation flows remain available. This follows the requested word “default” and preserves the repository's explicit selection workflows. Treating No as a prohibition on using a line anywhere in estimation would be a separate eligibility-policy change and would need different rules for existing estimates and required recommendations.

**Assumption:** existing and newly created unmarked records start at No. As a result, initially empty default lists are possible until Configuration owners mark the intended items Yes. There is no implicit all-Yes initialization or production backfill.

The requested screens are the web Configuration and estimation screens discussed in this thread. Native catalogue typing and preservation remain compatible; changing native authoring controls/layout is outside this specification. Responsive web layouts are included.

**Non-goals:** changing margin defaults or their pending implementation, automatic estimate inclusion, financial formulas, client visibility, publication/approval history, recommendation requirements, native UX redesign, public access, deployment, commits, seeds or live data migrations.

## Permissions and states

| Context | Behavior |
| --- | --- |
| Authorized Configuration editor on an editable draft | Read and save Yes/No through the existing section update operation. |
| Configuration reader, historical revision, or otherwise non-editable workspace | Read the stored/effective setting; cannot save changes. |
| Authorized estimator with an editable estimate | Browse Yes defaults, explicitly add eligible other items, retain saved/current edits. |
| Submitted or historical estimate viewer | See the existing saved estimate according to its current permissions and client-visibility rules. |

Controls must have an accessible group name, associated helper text and keyboard operation. Follow existing loading and failure states. Save errors retain the local choice; conflict review shows the server value. Apply existing focus restoration and responsive layout at 390, 768 and 1440 px. No animation is required.

## Risks, rollout and rollback

- **Empty lists:** missing values resolve to No, so this is an intentional change from the current all-item browse behavior. Explain the empty state and allow explicit additions.
- **Hidden saved work:** filter only unused discovery rows. Verify included rows, explicit unsaved edits and excluded saved rows requiring review survive a flag change.
- **Shared resolver regression:** globally filtering catalogue sources would break pricing and recommendation resolution. Keep source availability separate from default display.
- **Legacy/concurrent writes:** optional storage, explicit boolean validation, edited-field rebasing and the existing CAS checks prevent accidental broad changes. Verify an unrelated edit preserves the flag.
- **Concurrent margin work:** do not overwrite dirty validation, OpenAPI or synchronization changes, and do not infer their test status from the existence of test files.
- No live migration is required. Release backend support before the frontend starts submitting the new field. No release is authorized by this specification. A rollback may remove the new control/filter while retaining backend field acceptance for already stored payloads; reverting to a validator that rejects stored fields is not a safe rollback.

## Acceptance criteria and verification

| ID | Acceptance criterion | Evidence required during implementation |
| --- | --- | --- |
| AC1 | Every supported Configuration Main Line Overview has an accessible Yes/No control; absent means No; saves and reloads correctly. | Rendered regular/temporary-item tests, read-only/saving states, round-trip section service tests, keyboard and responsive checks. |
| AC2 | Only explicit true produces a default preview, subject to existing eligibility. False/absent never fall back to all items. | Catalogue projection tests using different draft/active values; unequal Main Lines across two Sub-Baskets; Yes with unusable pricing remains ineligible. |
| AC3 | Default search, counts, pagination and empty states reflect the filtered list. Yes does not automatically include or price an item. | Sales catalogue unit/rendered workflow tests, including more than one page of mixed Yes/No values, no defaults, and normal search misses. |
| AC4 | Saved, included and actively edited rows survive changing Yes to No; explicit Add items and recommendations still work for No items. | Reopen and live-refresh tests with two rooms and unequal lines; verify persisted IDs, quantities, inclusion, source availability and existing totals; required recommendation and historical-estimate regressions. |
| AC5 | Validation, concurrency, immutable history and field preservation remain correct. | Reject invalid boolean types; save both values; stale-version rejection; unrelated-field rebase; conflict display; draft/duplicate preservation; draft-vs-active isolation; unauthorized write rejection. |
| AC6 | A saved setting refreshes affected UI without corrupting the shared catalogue or margin work. | Mutation invalidation coverage, full catalogue lookup of a No line, focused neighbouring regressions, integrated typechecks/builds and final diff review. |

Relevant existing verification surfaces include backend `ai-estimator-knowledge-validation.test.ts`, `ai-estimator-knowledge-item.service.test.ts` (uses a Mongo replica set), `ai-estimator-knowledge-routes.test.ts`, `estimator-catalogue-estimate.replica-set.test.ts`, `estimator-catalogue-recommendations.replica-set.test.ts`, and `api-docs.test.ts`; frontend `KnowledgeOverviewPanel.test.tsx`, `knowledgeSectionPayload.test.ts`, `KnowledgeConflictReview.test.tsx`, `salesEstimateCatalogue.test.ts`, `ConfiguredEstimateBuilder.test.tsx`, `LeadEstimateWorkspace.catalogue.test.tsx`, and recommendation/refresh regressions. Run backend and frontend typechecks, tests and production builds after focused checks; run mobile typecheck for catalogue DTO compatibility. Run `git diff --check` and inspect the integrated dirty-path set. There is no repository lint script.

## Open decisions and approval boundary

The initial ambiguity about saving metadata versus filtering estimation was resolved by the user's clarification: filtering estimation is required. The defaults and explicit-add exceptions above were approved, followed by the separate task plan and Mode A execution choice.

Implementation and local verification are recorded in the approved task plan. No migration, production mutation, commit, push or deployment is part of this request.

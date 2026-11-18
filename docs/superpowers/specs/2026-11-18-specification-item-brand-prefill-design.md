# Saved specification item brand prefill

Date: 2026-11-18
Status: Implemented and locally verified in approved Mode A. Automated checks, real-API desktop/mobile evidence, and verification limits are recorded in the [task plan](../plans/2026-11-18-specification-item-brand-prefill.md). No deployment or production mutation was performed.
Classification: Substantial; existing Configuration lookup contract and draft selection behavior.

## Goal

Selecting a pre-fed specification item, such as **Gypsum Board**, should immediately select the Brands previously saved for that item. The user can adjust the selection, choose Done, and persist it through the existing Save Mode action.

## Current behavior and evidence

The reported screenshot shows Add Specification with Gypsum Board selected and Brands displaying Not configured. Code confirms a missing data path:

- `backend/src/services/ai-estimator-knowledge-specification-item-name.service.ts` projects only specification names from each Main Line's current saved pricing scope. It does not read specification brand associations or the scope's Brand definitions.
- `backend/src/contracts/ai-estimator-knowledge.ts`, `shared/knowledge/knowledgeTypes.ts`, and the OpenAPI `KnowledgeSpecificationItemName` schema expose only `{ name }`.
- `KnowledgeSpecificationItemNamePicker.tsx` reduces lookup entries to names and calls `onChange(name)`.
- `KnowledgeSpecificationBuilder.tsx` changes only the selected row's name. Its Brands control reads the destination Mode's existing Brand definitions and the row's `brandIds`; a new row has no selected Brand IDs.
- Specification-to-Brand associations use `brandId` or `brandIds` within a pricing scope. They must resolve to exactly one Brand in that same scope. The current validator permits up to 200 Brands and requires unique IDs and normalized names.
- The lookup already selects the current saved draft before active revision, filters applicable/configured scopes, validates Main Line/revision ownership, and excludes archived sources. Default Mode is part of the current reusable-item catalogue.
- The prior item-name-picker specification intentionally reused spelling only. This request supersedes that restriction for Brand prefill; description, pricing, identity, and save behavior remain independent.

This diagnosis is based on code and the screenshot. No production records have been inspected or changed. The preceding GST and tier-description work is already dirty in this worktree and must be preserved.

## Scope and recommendation

Extend the existing read-only saved-item lookup with validated Brand suggestions, then apply the selected suggestion to the local specification draft. Keep the current panel, Brand multiselect, and Done → Save Mode flow.

This approach makes existing saved data reusable without a new master collection, migration, or write-on-navigation behavior. A separate permanent item/Brand master would introduce new identity and lifecycle rules and is outside this request. Merely adding Brand options without selecting them would leave the reported Not configured behavior unresolved.

In scope: internal live Configuration item selection, lookup/shared contracts, draft Brand import and selection, cache freshness, and focused regression coverage.

Non-goals: automatic description copying, brand synchronization after selection, changing source records, replacing existing Brand choices, pricing/budget/slab changes, historical/customer/vendor proposal data, permission expansion, a UI redesign, bulk repair, migration, deployment, commit, or push.

## Required behavior

### Saved-item Brand discovery

1. Reuse the lookup's current Configuration source selection: latest saved draft when present, otherwise current active revision, joined by Main Line/revision IDs. Preserve current applicable/configured scope filters and default Mode behavior. Never fall back to obsolete active data when a draft exists.
2. For each eligible specification, resolve its saved `brandId` or `brandIds` against Brand definitions from the **same pricing scope**, using stable IDs. Do not return unrelated Brands merely because they exist elsewhere in that scope.
3. Preserve the existing one-option-per-normalized-item-name catalogue. An option offers the distinct valid Brand names associated with all eligible saved occurrences of that exact normalized item name. Similar-name suggestions remain separate items and do not contribute Brands unless explicitly selected.
4. Grouping reusable display values does not link or merge source specifications. Resolve source associations before catalogue grouping; retain deterministic results independent of database ordering. Do not expose pricing, actors, customer data, or private proposal payloads.
5. Skip invalid/missing/ambiguous source Brand associations rather than borrowing a Brand from another scope. Malformed or unavailable Brand data must not be advertised as a successful complete prefill. Return a bounded availability/incompleteness signal when a selected item's saved Brand set cannot be fully resolved or exceeds the supported limit; do not silently truncate and claim success.
6. Preserve search, pagination, exact-match and similar-item behavior. All selection routes, including selecting an exact existing item from Add item, must retain the same Brand metadata. Avoid per-row request/database fan-out.

### Draft selection and persistence

7. Explicitly selecting a saved item for a specification with no Brand choices imports its valid saved Brand names into the destination Mode's Brand definitions as needed and selects them immediately. The displayed Brands field must show those names before Done or Save Mode.
8. Deduplicate destination Brand definitions using their established normalized-name uniqueness rule. Reuse the existing destination Brand ID for an unambiguous matching local Brand; create fresh destination IDs for new definitions. This is copying suggested values into a local draft, not linking foreign Brand IDs or synchronizing records. Never overwrite a local Brand's name, description, ID, or other specifications' associations.
9. Keep the destination specification's stable ID, brief description, hidden compatibility fields, budget/slab references, and unrelated Mode data unchanged. Import only the Brand names required by this selection; do not copy foreign prices, descriptions, or reference IDs.
10. Preserve an existing nonempty Brand selection when an item is selected or renamed. Do not overwrite malformed destination associations during unrelated selection; show the existing validation/recovery path instead. Users retain manual add/remove/edit controls.
11. New item names with no saved matches remain unconfigured for Brands and continue to support Add Brand. A successful lookup with no saved Brands is distinct from an unavailable lookup.
12. Prefill runs on explicit saved-item selection only. Opening a panel, query refresh, rerender, or reopening a deliberately cleared row must not re-add Brands. Selecting the saved item again is an explicit request to prefill an empty selection.
13. Apply the selected name and imported Brand associations atomically to the current local draft. If import would exceed the 200-Brand limit or create invalid/ambiguous destination data, preserve the current draft and show a concise corrective message. Never silently select a partial set.
14. Done only closes the panel. Save Mode remains the persistence boundary, using existing validation, section/aggregate versions, transactions, audit, and conflict handling. Discard restores the previous saved state. Failed saves retain the local draft; source records never change through this feature.

### Recovery, compatibility, and access

15. Lookup failures retain the current name, Brand choices, and pending draft, with a retry action. A stale response must never change another row, Mode, or Main Line. Changing the selection or editing Brands must not be undone by a late lookup response.
16. Read-only users and isolated proposal editors must not acquire new mutation behavior or global Configuration reads. Retain the existing editor data-source capability and backend authorization.
17. Refresh saved-item lookup data after successful source changes through the established mutation invalidation paths. Unsaved/failed changes must not become shared suggestions.
18. Keep the UI simple: use the existing Brands field and selection controls, with only necessary loading/error feedback. Preserve keyboard selection, focus return, accessible names, and narrow-screen layout. No new UI dependencies or decorative changes.

## Data/API impacts and compatibility

- Add bounded Brand suggestion metadata to `KnowledgeSpecificationItemName` in backend/shared contracts and OpenAPI. Keep the existing authenticated GET, its parameters, permissions, pagination, and name fields. The task plan will settle the exact additive field names and availability shape before writers start.
- Keep name-only domain normalization/matching helpers reusable; do not discard metadata while transforming or merging lookup results in the picker.
- Extend the picker-to-builder selection value so Brand metadata reaches the draft owner, which performs a single draft update. Shared/proposal consumers without the lookup capability retain their current behavior.
- No new write endpoint, persisted schema, collection, index, dependency, or migration is required. Destination Brand/specification payloads continue to use existing supported shapes and validators.
- Legacy name-only responses must not trigger invented Brand selections. A missing metadata field is unavailable/legacy data, not proof that no Brands were saved.
- Rollback removes prefill for future selections. Already saved destination Brand associations remain ordinary independently editable data.

## Assumptions and open decisions

Approval confirms that "previously added for this item" means valid associated Brands in current saved internal Configuration, using the same exact normalized item grouping as the existing pre-fed list. All distinct available saved Brands are preselected for an empty selection; the user can remove any before saving. Existing nonempty choices remain untouched.

No blocking product question remains under these assumptions. Exact response field names and import-helper placement are implementation choices for the separate task plan.

## Risks

- Identical labels can appear on multiple independent source specifications. Catalogue grouping must never become a cross-record mutation or identity join.
- Brand IDs are scoped to their saved pricing data. Resolve by source IDs, then create/reuse destination-owned IDs without copying foreign associations blindly.
- Invalid legacy associations, conflicting local definitions, or many source Brands can produce incomplete suggestions. Handle these explicitly without silent repair or partial import.
- Shared lookup metadata can be lost during search/match/draft-name merging. Test every picker selection route and deterministic deduplication.
- Changes touch contracts and a builder also used by isolated editors. Preserve capability boundaries and test no additional proposal requests.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | A previously saved Gypsum Board with two associated Brands fills both in a new empty specification immediately on selection. | Rendered picker/builder interaction and desktop/mobile browser check. |
| AC2 | Only Brands associated with that exact item are offered, resolved within the source scope; current saved draft wins over active/history. | Replica-set lookup tests with unequal Main Lines, tiers, Brands, and revisions. |
| AC3 | Multiple current occurrences aggregate valid distinct Brands deterministically, including exact-match selection from Add item, without mixing similar items. | Catalogue/API and picker search/matching/pagination tests. |
| AC4 | Local IDs, descriptions, compatibility fields, existing Brand selections, and references are preserved; duplicate local Brands are not created. | Builder/import tests with existing and colliding destination Brand records. |
| AC5 | Done/Save Mode/discard/reopen behave correctly; saved Brands persist and source records stay unchanged. | Mode-save integration and fresh-reader assertions. |
| AC6 | Empty, unavailable, malformed, over-limit, failed-save, stale-response, and deliberate-clear cases do not silently lose or overwrite data. | Focused backend validation and rendered recovery/race tests. |
| AC7 | Read-only/proposal isolation, authorization, query invalidation, and API documentation remain correct. | Scoped permission, data-source, mutation-sync, and OpenAPI checks. |
| AC8 | Existing GST and description behavior remains intact; affected workspaces compile/build, keyboard/mobile interactions pass, and repository hygiene is clean. | Focused regressions, typechecks/builds, 390px/1440px visual/accessibility checks, and `git diff --check`. |

The user approved this specification and its separate task plan, then selected Mode A. The completed implementation and verification are recorded in the linked task plan.

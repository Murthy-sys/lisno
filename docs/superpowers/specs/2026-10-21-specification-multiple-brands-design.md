# Multiple brands per Configuration specification

Date: 2026-10-21
Status: Implemented in Mode A, including the user-directed compact dropdown correction. Correction checks pass; earlier broader verification has four documented pre-existing layout-test failures. See the task plan for evidence.
Classification: Substantial cross-workspace contract and UI change.

## Goal

In web Configuration → Main Basket → Sub-Basket → Main Line → Mode → Specifications, allow an item to select multiple local brands. Match the brand dropdown, popup, selected states, and focus treatment to the existing Configuration theme. Save and display every association without losing existing single-brand data.

## Pre-implementation behavior and evidence

- The supplied screenshot shows the Add Specification panel with a single Brand name dropdown and an inconsistent purple focus outline. It identifies the web editor; this specification treats the visual request as scoped to that brand control.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx` uses native `Select`, binds `editingSpecification.brandId`, and replaces the previous brand when adding a new one. The table, status calculation, validation focus, and brand edit action also assume one selected brand.
- `shared/knowledge/knowledgeSpecificationConfiguration.ts` defines `brandId: string | null`, reads/writes a singular association, and validates it against the local `brands` array. The existing limits are 50 specifications and 200 local brands.
- `backend/src/domain/ai-estimator-knowledge-validation.ts` allowlists `brandId` and validates its reference. A frontend-only array change would currently be rejected. `backend/src/openapi/ai-estimator-knowledge.ts` documents the singular shape.
- `backend/src/services/ai-estimator-knowledge-context.service.ts` projects one public `brandId`/`brand` pair. Saved summaries, overview details, conflict review, pending-change review, and Mode validation targeting also resolve only one brand.
- `KnowledgeModePanel.tsx` edits specifications and brands in the existing Pricing-section draft. They remain shared Main Line configuration presented within Mode; this request does not introduce a separate brand list for each mode or change the Save Mode workflow.
- `KnowledgeSurfaceMultiSelect.tsx` demonstrates themed multi-selection, search, keyboard navigation, and unavailable-value presentation. Its master lifecycle/proposal contract is domain-specific and must not be reused by fabricating master records for local brands.
- `mobile/src/features/knowledge/KnowledgeSpecificationsEditor.tsx` consumes the same payload. Its display, add-brand assignment, single-brand setter, and referenced-brand removal checks need compatibility handling so web-created multi-brand records remain safe.
- Initial worktree is clean at `e58f514e`. Baseline frontend specification parser/builder tests pass: 26 tests. Backend knowledge validation baseline passes: 65 tests. No data access, live mutation, source edits, or subagent execution occurred during this investigation.

## Scope and assumptions

Primary feature: web Add/Edit/View Specification, its selected-brand display, and the brand dropdown theme. Supporting scope: shared parsing/serialization/validation, backend payload validation and safe context projection, API documentation, all current brand-association summaries, save/conflict behavior, and bounded mobile compatibility.

Brands remain optional and local to the existing Pricing payload. Multiple selections describe the brands associated with one item; they do not create duplicate specification rows, select a preferred brand, split quantities, multiply prices, or introduce per-brand rates. Stable IDs remain the source of identity, including when names change.

Out of scope: redesigning every dropdown, global Vendor/Brand master changes, financial calculations, approval permissions, immutable price history, published artifacts, new native mobile multi-select UX, database backfills, deployment, dependencies unless later proven essential, commits, or production writes.

## Recommended approach and alternative

**Recommended: a normalized brand-ID list in application code, with backward-compatible wire shapes.** Read old `brandId` and new `brandIds` into one list. Preserve the established wire format for zero/one brand; write `brandIds` when multiple brands are selected. Existing single-brand records and older consumers remain compatible, while explicit lists represent all multi-brand associations.

**Alternative: always write `brandIds`, even for zero/one brand.** This gives one new write shape but makes ordinary single-brand edits incompatible with older singular-only consumers sooner. It would require a broader coordinated client rollout without improving the requested interaction.

Approval selects the recommended approach. Do not dual-write a first-brand alias for a multi-brand item: it would misleadingly imply that one selected brand represents the full selection.

## Data and API contract

### Representation and validation

- Internal specification configuration uses `brandIds: readonly string[]` as its full association list. Centralize legacy/list interpretation so consumers do not independently fall back to the first brand.
- Read a valid legacy `brandId` as a one-element list. An omitted association means an empty list. Accept `brandIds` arrays with zero through 200 entries; absence remains compatible with existing unconfigured records.
- New serialization emits no association field for zero selections, `brandId` for exactly one, and `brandIds` for two or more. It never emits both fields.
- Reject payload rows containing both `brandId` and `brandIds`, even if they appear consistent. Return an actionable association error rather than choosing precedence or merging silently.
- Every array entry must be a nonempty, trimmed, bounded stable ID under the existing 240-character rule, unique within that specification, and resolve to exactly one entry in the same Pricing payload's brands. Reject wrong types, null array values, empty entries, duplicates, unknown/ambiguous references, and more than 200 IDs. Do not silently trim IDs, drop invalid references, or match by brand name.
- Keep existing brand-name validation and the local-brand/specification count limits. Preserve legacy typed specification fields (`type`, `options`, `value`) during edits and serialization.
- Association order is not a preference ranking. Preserve stable selection order for display and round trips; search/filtering cannot reorder or remove selected values. Add/remove operations use IDs and prevent duplicates.
- Apply equivalent rules in shared frontend/mobile validation and authoritative backend validation. Keep readable field paths for `brandIds` and indexed errors so Save Mode focuses the correct brand control.

Example writes:

```json
{ "id": "spec-paint", "name": "Wall paint", "brandId": "brand-a" }
```

```json
{ "id": "spec-paint", "name": "Wall paint", "brandIds": ["brand-a", "brand-b"] }
```

### Projection, compatibility, and persistence

- Continue using the existing section-save endpoints and version/conflict checks. No collection, index, transaction boundary, route authorization, or database migration is required for this JSON payload extension.
- Public context retains the current singular `brandId`/`brand` identity for one selection. For multiple selections, expose `brandIds` and resolved `brands` identity objects, containing only the same public ID/name fields currently permitted. Do not expose private vendor notes, prices, or unrelated brand data.
- Internal saved/overview/conflict/pending-change views display all selected brand names by stable ID. Unknown associations remain explicitly unavailable and never bind to another brand by name. Public projection preserves the complete valid selection and its existing sanitization boundaries.
- Saved/Unsaved status must consider all associations and every selected brand record. A rename of any selected brand, including the second or later one, must be visible in status/review and all references to that local ID.
- Keep specifications shared where they are shared today. Preserve quantities, price references, immutable history, partial-save recovery, and existing version-conflict handling. Unrelated edits must retain all selected IDs.
- Bounded mobile compatibility: show all associated brands, preserve arrays when editing names/descriptions, and prevent removal of any referenced brand. For a multi-brand item, do not present the current single-select as if it could safely edit the full selection. Show the names and a brief instruction to manage that item's brand choices in web Configuration; disable that item's single-brand replacement/add-and-assign actions. Ordinary zero/one-brand editing remains available. A full native multi-select redesign is outside this request.
- Older clients that submit both fields or remove a brand still referenced in `brandIds` must receive a validation failure. Never discard the list to make an older request succeed.

## Web interaction and theme

### Selecting and managing brands

- Label the control **Brands**. Preserve the compact existing dropdown appearance and its **Not configured** empty choice; zero selection remains valid. The user's follow-up explicitly requires keeping Add/Edit inside the dropdown rather than introducing controls beneath it.
- Open a searchable multi-selection popup with checkbox-style selected indicators. Selecting a brand keeps the popup open so the user can choose another. Selecting it again removes only that association.
- Show selected names inside the closed field, with wrapping when needed, instead of a count and a separate selected-brand area. No persistent Edit/Remove/Clear links, optional-selection hint, or separate Add Brand button beneath the field. Toggle selected options to unassign them; **Not configured** clears associations without deleting brand definitions.
- Retain **Add brand** as a row inside the same dropdown popup, outside the semantic selectable listbox. Open the existing dialog without changing its form or validation. A successfully created brand is added to the local catalog and appended to the current selection without replacing existing selections. Cancellation changes neither catalog nor selection. Preserve duplicate-name checks, maximum count, dirty state, and validation feedback.
- Keep **Edit selected brand** inside the dropdown for one selection. When several are selected, provide named **Edit <brand name>** actions in the same popup so the target is explicit. These actions are buttons outside the semantic listbox, visually part of the dropdown. Rename preserves the ID and updates every specification using it, with the unchanged dialog explanation.
- An unavailable selected brand remains visible with a field error and can be unassigned in editable mode; it must not disappear when filtering. Read-only mode exposes the complete list and prevents selection, creation, or rename changes.
- Changes remain in the existing Mode draft. **Done** returns to the Mode screen; **Save Mode** persists. Preserve existing close/cancel draft semantics, dirty indicators, pending review, and save-error recovery.

### Theme and accessibility

- Reuse the Configuration control geometry, typography, warm surface, border, text, selected-state, and role-focus tokens. The trigger and popup must match the panel in both open and closed states. Replace the inconsistent violet focus treatment with the active Configuration theme's focus treatment, retaining a visible focus indicator.
- Keep dropdown styling local to the brand selector. Do not change global fields, all menus, or unrelated Surface selectors. Reuse established neutral primitives/interaction patterns where practical; avoid fake master metadata and unnecessary library installation.
- Use a coherent accessible multi-select pattern: labeled trigger with expanded/controls state, searchable popup, listbox with `aria-multiselectable`, and options exposing selected state. Decorative checkbox indicators are not nested interactive controls. Creation/rename actions are separate buttons inside the same popup. Return focus to the persistent dropdown trigger after a nested dialog because its menu action unmounts when the popup closes.
- Support keyboard opening, Arrow/Home/End navigation, Space/Enter toggling, search, Tab navigation, and Escape. Escape closes the dropdown first without also closing the specification panel. Return focus correctly after closing the popup or nested Add/Edit Brand dialog.
- Associate validation errors and hints with the control. Preserve Save Mode's first-invalid-field focusing and read-only/permission transitions while the popup or nested dialog is open.
- Keep all options/actions reachable within the existing panel overlay at desktop and narrow web widths. Use bounded vertical scrolling, readable wrapping, touch targets, and no horizontal overflow or clipped popup. Avoid added shadows, gradients, decorative icons, or hover animation; use the existing theme and restrained selection/focus states.

## Relevant affected areas

Expected areas, with final bounded ownership to be established in the separate task plan:

- Shared: `knowledgeSpecificationConfiguration.ts`, `knowledgeSavedSummary.ts`, validation consumers and their tests.
- Backend: `ai-estimator-knowledge-validation.ts`, `ai-estimator-knowledge-context.service.ts`, `openapi/ai-estimator-knowledge.ts`, focused validation/context/API/save tests.
- Web: `KnowledgeSpecificationBuilder.tsx`, a small local brand-picker component/styles if warranted, `KnowledgeModePanel.tsx`, `KnowledgeSectionEditor.tsx`, `knowledgeModePendingChanges.ts`, `KnowledgeConflictReview.tsx`, `knowledgeOverviewSummary.ts`, and any rendered consumers of the changed projection.
- Mobile compatibility: `KnowledgeSpecificationsEditor.tsx` and focused workspace regression coverage, plus shared consumers affected by type changes.
- Tests: specification parser/builder, Mode save/reopen/conflict, summaries, quantity-slab/reference preservation, backend validation/context, OpenAPI, mobile preservation, and rendered dropdown interaction/theme checks.

## Acceptance criteria

1. **AC1: Multiple brand selection.** In Add and Edit Specification, select at least two differently named brands, remove one without affecting the others, close/reopen the panel, Save Mode, and reload. All remaining selections and the item identity/description persist. Zero and one selection also work.
2. **AC2: Brand creation and rename.** Add Brand appends to an existing selection; cancel does not change it. Rename the second selected brand and confirm all relevant item rows/summaries and dirty/save states reflect the name while IDs stay stable. Duplicate names and the 200-brand limit retain actionable errors.
3. **AC3: Backward compatibility and validation.** Existing legacy single-brand and unconfigured records round-trip correctly. New list records retain every ID. Malformed, duplicated, mixed singular/list, missing, ambiguous, and excessive associations are rejected consistently by client/backend without silent data loss. Legacy typed fields survive edits.
4. **AC4: Complete read/review paths.** Table, View Specification, saved summary, overview, pending-change review, conflict review, and public context show every selected brand. Same-name brands from another Main Line cannot satisfy a reference. Unavailable values are explicit, and private context fields remain excluded.
5. **AC5: Workflow and lineage.** Save Mode version conflicts and partial failures retain the complete draft selection and existing recovery behavior. Pricing, quantity slabs, specification references, approved/customer amounts, and immutable history retain their current semantics. Permissions/read-only changes prevent further writes.
6. **AC6: Theme and accessibility.** Closed/open/selected/search-empty/error/read-only states match Configuration theme tokens with visible themed focus. Keyboard and nested-dialog focus behavior work, Escape closes only the topmost surface, and desktop/narrow rendered checks show reachable actions without overflow. Accessible names, selected states, and error descriptions are correct.
7. **AC7: Mobile compatibility.** Mobile renders all web-selected brands, preserves them through unrelated edits, guards referenced-brand removal, and cannot accidentally collapse a multi-brand selection through its existing single-select/add flow. Ordinary singular-brand flows remain usable.
8. **AC8: Verification.** Run focused shared/frontend/backend/mobile regressions, relevant workspace typechecks/builds, API documentation checks, rendered browser interaction/accessibility/theme checks, and repository hygiene checks on the integrated result. Include a save/reload persistence test; use a replica set if exercising or changing transactional Mongo paths. Report exact results and any unrun checks. No live production mutation is a test step.

## Risks, rollout, and rollback

- Principal risks are truncating lists in a singular-only consumer, accidentally replacing selections on Add Brand, losing validation targeting, and presenting a first-brand alias as the whole selection. The contract and acceptance tests explicitly prohibit these behaviors.
- A dropdown nested inside a panel with a nested brand dialog can lose focus or be clipped; test the actual rendered overlay stack and theme context rather than only isolated markup.
- Deploying clients that write arrays before a compatible backend would fail validation. Any separately authorized rollout must install compatible backend readers/validators and affected consumers before enabling web multi-brand writes.
- No backfill is planned. Existing records remain unchanged until explicitly saved. After multi-brand data exists, rollback must retain array-aware readers/validation; do not revert to a singular-only server or truncate data automatically. UI enablement can be withdrawn independently while preserving stored lists.
- Open product decisions: none blocking specification review. Assumptions are explicit: optional local brands, no preferred-brand ranking or pricing effect, current web brand control only, and minimal native compatibility rather than a new mobile selection workflow.

## Approval and implementation record

The user approved this specification, approved the separate [task plan](../plans/2026-10-21-specification-multiple-brands.md), and selected Mode A. Implementation, independent integrity review, automated checks, and rendered browser QA have been performed within that scope. No deployment, migration, staging, commit, or production mutation was performed. The task plan records exact verification results and remaining limits.

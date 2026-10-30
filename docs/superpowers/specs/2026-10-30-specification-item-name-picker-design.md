# Specification item-name picker

Date: 2026-10-30
Status: Approved and implemented on 2026-10-30; verification and existing suite limitations recorded in the task plan
Classification: Substantial; shared Configuration discovery and specification-editor interaction

## Goal

Replace free typing in the Specifications side panel's **Item name** field with a searchable dropdown of previously saved item names and an explicit **Add item** action. Encourage employees to reuse the same spelling, prevent case/spacing duplicates, and show likely spelling matches before a new name is added.

The user explicitly requested a dropdown containing entered values, with an option to add an item and then select it. Interpret this as names shared across current Configuration, rather than only names already on the selected Main Line. Preserve the current role permissions and Save Mode draft lifecycle.

## Current behavior and evidence

Inspected the current worktree on 2026-10-30 at `4fb3733b22f238d12af5dc8b342b50b74b49f19d`. The initial `git status --short` was clean. Only this specification is written at this stage.

| Area | Evidence | Implication |
| --- | --- | --- |
| Side-panel field | `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx` renders Item name as a 240-character `Input` and copies each keystroke into the current specification draft. | Every entry is manually typed; there is no shared name lookup. |
| Draft ownership | `KnowledgeModePanel.tsx` passes the current pricing payload and draft callbacks to the builder. The panel says Done returns to Mode, and Save Mode persists changes. | Selecting or adding a name must preserve this save/discard behavior. |
| Existing specification identity | `shared/knowledge/knowledgeSpecificationConfiguration.ts` stores a stable specification `id`, `name`, brand associations, description, and compatibility data. Budgets/slab references use the specification ID. | Reusing a name must retain the local specification ID and never copy another line's references. |
| Duplicate checks | Shared `normalizeComparable` and backend `validateNamedPricingRow` normalize Unicode, case, and whitespace, but reject duplicates only within one specification array. | Retain these authoritative local checks; add discovery across current Configuration so users can reuse spelling before save. |
| Existing selectable vocabulary pattern | The Brand control is searchable and supports Add Brand; its additions remain in the Mode draft. Quality Control options have a separate persistent master model/API. | Reuse the established interaction style, while choosing deliberately between a derived list and a new master collection. |
| Other consumers | `KnowledgeSectionEditor.tsx` also uses the builder; `ProposalWorkspace.tsx` uses `KnowledgeModePanel` through an isolated `KnowledgeEditorDataSource`. | Do not introduce live Configuration reads into vendor proposal editors or unscoped shared-component calls. |
| Permission boundary | `ai-estimator-knowledge-actor.ts` restricts global Configuration reads/writes to the active sole Super Admin. Vendor-directory access is a separate exception. | This feature does not grant employees, vendors, or Procurement new Configuration access. Existing editor permissions remain authoritative. |

## Scope and non-goals

In scope:

- A searchable Item name picker in the internal Configuration Specifications side panel, for add and edit.
- All valid names from current saved Configuration across Main Lines, temporary items, and applicable Mode tiers, plus valid names already entered in the current local draft.
- An explicit Add item dialog with duplicate and similar-name guidance.
- Clear loading, failure, empty, read-only, keyboard, focus, and mobile behavior.
- Compatibility with existing saved rows, stable specification references, and isolated editor data sources.

Out of scope:

- A new employee role, permission expansion, or vendor access to global internal Configuration.
- A separate product/material inventory or item-master administration screen.
- Automatically correcting or merging existing misspellings, renaming specifications globally, or changing existing brands/descriptions.
- Automatic linking of two specifications solely because their names match.
- Financial changes, budget recalculation, approval/history rewrites, or changes to issued documents.
- Production migration/backfill, seeding, deployment, commits, or pushes.

## Recommended approach and alternatives

| Approach | Benefits | Tradeoffs |
| --- | --- | --- |
| **Recommended: derive reusable names from current saved specification rows, with Add item remaining in the existing draft.** | Immediately includes existing values; preserves Save Mode and cancel/discard; no schema migration or separate global write; local IDs and references remain intact. | The list represents names currently used in Configuration. A name no longer used anywhere does not remain as a permanent master option. |
| Introduce a permanent global item-name master with stable master IDs and a unique normalized-name index. | Supports independent name lifecycle, permanent options, and centrally managed identity. | Requires a separate creation/save contract, authorization and lifecycle decisions, legacy mapping, and wider persistence changes beyond the requested name reuse. |

Use the recommended approach. Names are reusable labels, while each specification remains an independent record identified by its existing stable ID. No relationship or data join is keyed by the selected label.

## Required behavior

### 1. Saved-name discovery

- Read names through a narrow, authenticated Configuration endpoint rather than downloading all Main Line detail to the browser.
- For each Main Line, use its latest saved draft revision when present, otherwise its saved active revision. Join revisions/sections by their stable IDs and ownership. Do not fall back to an old active revision when a saved draft exists.
- Collect valid specification names from the current pricing payload, including supported Signature, Premium, and Functional tier locations. Include current temporary items where those specifications are supported.
- Exclude deleted/archived source lines and malformed/blank/over-length name values. Missing specification arrays are an empty source of names. Do not use customer estimates, historical-only revisions, or private vendor proposals as the global name source.
- Deduplicate using the existing Unicode normalization, trimmed/collapsed whitespace, and case-insensitive comparison. Keep punctuation, dimensions, accents, and meaningful word differences intact.
- Return one deterministic display spelling per normalized name. Do not rewrite stored legacy spellings during a lookup or an unrelated save.
- Search, sort, deduplicate, and compute counts before pagination. Every matching name must remain discoverable; do not silently truncate to the first page.
- Invalidate affected catalog queries after successful specification saves and other source changes that remove or replace current names. Failed saves do not publish a new name.

### 2. Item name picker

- Keep the visible label **Item name** and its required validation. Replace unrestricted text entry with an accessible searchable single-select control.
- Show existing saved names with a clear **Add item** action. Searching filters choices; typing a search term alone does not change the specification name or create a new item.
- Merge saved choices with valid names in the current local Mode draft so a newly added name is immediately selectable in that draft. Do not publish local unsaved values to other sessions.
- Selecting a saved name changes only the current specification's name. Preserve its ID, brand associations, description, hidden compatibility data, budget/slab references, and all other draft fields.
- Names already used by another specification in the same local array cannot create duplicate rows. Explain that the item is already included and retain the existing backend/shared validation as enforcement.
- When editing a legacy value absent from the current lookup, show that exact selected value without silently renaming or clearing it. Read-only views show the saved value without mutation controls.

### 3. Add item

- Open a small Add item dialog from the picker with **Item name**, **Add and select**, and **Cancel**. The current search text may prefill the input.
- Accept nonempty names up to the existing 240-character limit. Normalize outer/repeated whitespace for newly added input; retain intentional display capitalization.
- Check against saved choices and the current draft using the shared normalization rule. An exact normalized match offers the existing item instead of adding another option. If it is already used in the same local specification array, explain that conflict rather than selecting an invalid duplicate row.
- Show a small set of deterministic similar-name suggestions before confirming a near match, for example **Plywod** should surface **Plywood**. Let the user select the existing name or explicitly confirm the distinct spelling. Do not silently autocorrect, merge, or forbid legitimate similar names.
- Add and select fills the currently edited specification and marks the Mode draft dirty. It does not add an extra specification row or make a separate shared write.
- Cancel leaves the current specification unchanged and restores focus. Done returns to Mode. Save Mode is the persistence boundary; only a successful save makes a new name available to other authorized Configuration sessions.

### 4. Recovery and accessibility

- Distinguish loading, no saved names, no search matches, and failed lookup. A failed request must not appear as a successful empty list or silently restore unrestricted typing.
- Preserve the selected name, brands, description, and pending draft during lookup failure, retry, Mode save failure, and version conflicts. Existing conflict review remains authoritative.
- Keep Save Mode validation, required-field focus, nested dialog focus restoration, read-only transitions, pending-change summaries, and discard behavior working.
- Support keyboard opening/search/navigation/selection, Escape, visible focus, accessible names, and announced validation messages. Ensure long names fit narrow screens without page overflow.
- Keep the side panel visually simple and consistent with the existing Brand picker. No new animation, icon library, or UI dependency is required.

## Data, API, and authorization impacts

- Add a read-only endpoint under the existing Configuration namespace, proposed as `GET /admin/ai-estimator-knowledge/specification-item-names`, with bounded search and pagination. Return only names and page metadata; do not expose owning projects, vendors, prices, actor details, or historical payloads.
- Register the endpoint in the canonical route-operation registry and OpenAPI inventory, using the existing Configuration read permission and server-side actor guard. Keep frontend/backend/shared API types synchronized.
- Use an owner-scoped editor capability/data-source boundary. Internal Configuration editors may request the global list; isolated proposal editors must not call that endpoint or share its cache. Preserve their existing authorized behavior unless a separate scoped implementation is required to maintain compatibility.
- Keep the saved specification payload shape and stable local IDs unchanged. Continue using the existing section update API, expected section/aggregate versions, transaction, audit, and immutable-revision rules.
- No new collection, index, write endpoint, schema migration, or live backfill is proposed. Deriving names from current saved rows provides legacy availability without mutating those rows.
- Different Main Lines may legitimately use the same item name. Global name deduplication is a vocabulary/display rule, not a uniqueness constraint across specification records. Existing per-array duplicate checks remain authoritative during concurrent saves.
- Avoid per-row network/database queries. Fetch/project only the revision/section/name data needed, with bounded responses and deterministic ordering. Keep lookup cache scope explicit and refresh after relevant source changes.

## Assumptions and open decisions

The specification approval confirms these assumptions:

1. “All entered values” means valid names in current saved internal Configuration across Main Lines and Mode tiers, plus the local unsaved draft; it does not mean all historical/customer/vendor-private data.
2. Add item follows the existing Done → Save Mode workflow. Abandoned or failed drafts do not publish shared names.
3. Selecting an item name reuses spelling only; brands and descriptions stay specific to each specification.
4. Existing role permissions remain unchanged. The request's employee rationale does not authorize new Configuration access.

No blocking product question remains under these assumptions. Exact helper/query names and bounded similarity thresholds are implementation details to settle in the task plan, without broadening this scope.

## Risks and mitigations

- **Similar words can be different materials:** warn and require an explicit choice; never automatically merge or rewrite.
- **Legacy spelling variants:** deduplicate choices consistently while preserving each saved row unless explicitly edited. No data cleanup migration.
- **Large catalogs:** server-side discovery and pagination; no browser fan-out across all Main Lines; test beyond one page.
- **Stale/concurrent names:** refresh duplicate checks where appropriate, normalize candidate groups deterministically, and retain existing transactional section validation/CAS.
- **Shared editor leakage:** test an internal Configuration editor and an isolated proposal actor/data source separately; proposal editing must produce no admin catalog request.
- **Draft/reference loss:** retain specification IDs and compatibility fields; test existing budget/slab associations, description/brand edits, discard, and version-conflict recovery.

## Acceptance criteria and verification

| ID | Acceptance criterion | Evidence required |
| --- | --- | --- |
| AC1 | Item name is a searchable selector with Add item in the internal Specifications side panel. Search text alone cannot become a saved name. | Rendered add/edit/read-only tests and browser interaction. |
| AC2 | Previously saved names from different Main Lines, temporary items, and supported Mode tiers appear once per normalized name, using current saved revisions. | Backend tests for draft-before-active, ownership, all tiers, duplicate casing/spacing, malformed names, search/order, and more than one page. |
| AC3 | Add and select fills the existing draft row; Cancel/Done/discard/Save Mode retain their established meanings. A name is shared only after successful save. | Mode save/discard/failure tests and fresh-reader lookup before/after persistence. |
| AC4 | Exact case/space duplicates reuse an existing name; likely misspellings offer similar names without automatic mutation. Local duplicate specification rows remain invalid. | Normalization, similar-name, legitimate-similar-name, and local-duplicate tests. |
| AC5 | Existing names, IDs, brands, descriptions, hidden typed fields, and budget/slab references survive selection and unrelated edits. | Shared serializer/validator and referenced-specification regression tests. |
| AC6 | Loading, empty, error, retry, stale lookup, conflict, and permission loss are explicit and preserve authorized draft data. | Rendered recovery tests; backend denial/validation tests. |
| AC7 | Global lookup follows existing authorization and never leaks into isolated proposal data sources; API inventories agree. | Route/authorization/OpenAPI tests plus proposal data-source/request regressions. |
| AC8 | The field, Add item dialog, validation focus, and long options work on desktop/mobile and keyboard. | Browser checks at 390px and 1440px, screenshots, runtime/network review, and scoped accessibility checks. |

The user approved this specification and the separate task plan, then selected Mode A. See [implementation and verification](../plans/2026-10-30-specification-item-name-picker.md) for the completed work and evidence. No deployment or production mutation was performed.

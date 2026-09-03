# Main Line Mode Surface Configuration Specification

## Status

Proposed on 2026-09-03. This specification requires approval before a task plan or implementation begins.

## Goal

Give Super Admin a simple way to create reusable Surface options and assign them to a Main Line. A saved Surface must become available immediately in a dropdown, while stable IDs, UOM relationships, concurrency, audit history, and downstream estimator compatibility remain authoritative in the backend.

## Product decision

- Add a standalone **Surfaces** panel inside **Main Line → Mode**, after **Budgeting** and before **Quantity & margin**.
- Keep Surfaces out of Overview, as previously approved.
- Reuse the existing Surface master data and the existing `overview.surfaceIds` assignment contract rather than creating a duplicate backend section or a second Surface entity.
- Let Super Admin add any Surface name and freeform example/component text. Each saved Surface record—not each comma-separated example—becomes one reusable dropdown option.
- Link every newly created or edited Surface to one or more existing UOM records by stable ID. Multiple typical units are supported because the supplied **Counter surface** example allows both square feet and running feet.
- Treat typical units as guidance only. They do not convert quantities, select a Budgeting UOM automatically, or calculate price.

## Current behavior and evidence

- A reusable `surfaces` master already exists with stable ID, code, name, description, display order, lifecycle status, CAS version, actor metadata, and audited transactional CRUD.
- The existing Surface model and strict request schemas do not contain a UOM relationship.
- **Configuration → Manage reusable values → Surfaces** already exists, but its generic editor exposes technical fields such as Code and display order and does not match the requested **Surface / Examples / Typical unit** model.
- `surfaceIds` already exist in Main Line Overview and Scope payload contracts. Current Main Line summaries, list filtering, and estimator-context compatibility use `overview.surfaceIds`.
- Surface controls were intentionally removed from the visible Overview UI without deleting saved `surfaceIds`, Surface masters, APIs, or types.
- Scope still contains a hidden Surface selector, but Scope is not a visible workspace section and Scope-only values are not consistently consumed by item filtering or estimator context.
- A tested accessible Surface multi-select already exists and can be adapted rather than replaced.
- Current Main Line Surface loading stops at the first 100 records, so it is not safe for a growing reusable library.
- The repository exposes an estimator-context API but contains no production Estimator/Sales screen that currently consumes it.
- The worktree was clean when this specification was prepared.

## Options considered

### Option A — extend the existing Surface master and present it in Mode (selected)

This preserves stable IDs, lifecycle, audit history, existing APIs, and the current estimator compatibility field. It adds only the requested Surface-specific metadata and presentation.

### Option B — restore the old Scope editor

This would expose unrelated Scope concepts and would save Surface IDs in a location ignored by current item filters and context matching. It does not satisfy the requested simple workflow.

### Option C — create Surface Component child entities

This would make Paint, Wallpaper, Tile, and similar examples independently selectable and versioned. It would require a second CRUD lifecycle, child archive rules, more joins, and more UI. The supplied request describes freeform components, so that complexity is outside this version.

## Scope

### Reusable Surface management

- Specialize only the existing **Surfaces** reusable-values category.
- Show a simple Surface list with these columns on wider screens:
  - **Surface**
  - **Examples / components**
  - **Typical unit**
  - **Status**
  - **Actions**
- Provide **Add Surface** and **Edit Surface** dialogs.
- Keep the existing Surface lifecycle and archive protection.
- Hide technical code, stable ID, version, display order, audit metadata, and other persistence details from the form.

### Main Line assignment

- Add a standalone **Surfaces** panel inside the existing Mode page.
- Let Super Admin select multiple applicable Surfaces from the complete active Surface catalog.
- Place **Add Surface** beside the selector when the actor has Surface-create permission.
- Save Surface assignments through the existing **Save Mode** action.
- Persist only Surface stable IDs to the existing Overview payload; do not persist names or UOM labels as join keys.

### Backend relationship

- Add ordered `typicalUomIds` metadata to Surface masters.
- Validate new UOM selections against active UOM masters.
- Protect referenced UOMs from archival and preserve transactional consistency during concurrent Surface/UOM changes.
- Include Surface-specific field changes in audit evidence.

## Non-goals

- Do not restore Surface controls to Main Line Overview.
- Do not restore the hidden Scope page or move canonical assignment to `scope.surfaceIds`.
- Do not create a new backend knowledge-section key or duplicate Surface collection.
- Do not make example/component words independent dropdown choices, stable entities, pricing dimensions, or filters.
- Do not add a new Estimator/Sales screen or claim that such a consumer is integrated.
- Do not make a typical UOM calculate, convert, or override Budgeting, slab, quantity, rate, tax, or estimated-cost values.
- Do not seed or backfill the nine rows shown in the reference image. They are examples, not authorized data mutation.
- Do not remove legacy Surface codes, descriptions, statuses, display order, versions, or historical references from backend contracts.
- Do not add dependencies, deploy, seed, migrate production data, or perform external actions.

## Roles and authorization

- Existing operation-specific backend authorization remains authoritative.
- Actors with configuration read permission may view Surface records and assigned values.
- Surface create, update, lifecycle, and archive operations continue to require their existing distinct permissions.
- Main Line assignment continues to require draft-section update permission for that revision.
- The UI hides unavailable actions and renders read-only data, but frontend visibility is never authorization enforcement.
- Unauthorized and unauthenticated requests must be rejected before validation details disclose configuration data.

## UX specification

### 1. Reusable values → Surfaces

Header:

- Title: **Surfaces**
- Supporting text: **Create reusable surface options for Main Lines and the estimator.**
- Primary action: **Add Surface**

Add/Edit Surface form:

1. **Surface name\***
   - Free text.
   - Example placeholder: `Wall surface`.
   - Required and unique among non-archived Surface names using the existing normalized, case-insensitive uniqueness rule.
2. **Examples / components**
   - Optional freeform textarea.
   - Example placeholder: `Paint, wallpaper, texture, paneling, tiles`.
   - Hint: **Add examples in any format that helps the estimator understand this Surface.**
   - The value remains one descriptive string; commas are not parsed into child records.
3. **Typical unit\***
   - Searchable multi-select populated from the complete active UOM catalog.
   - At least one UOM is required for a newly created Surface or when an existing Surface's UOM selection is changed.
   - The selected order is retained for display; duplicate IDs are removed.

Actions:

- Add dialog: **Cancel**, **Add Surface**.
- Edit dialog: **Cancel**, **Save changes**.
- Create defaults to active. Lifecycle actions remain in the list's Actions control instead of adding technical status controls to the main form.
- Invalid submission focuses the first invalid field.

Technical presentation rules:

- Do not display or request Code, stable ID, version, display order, dependency epoch, or actor/audit fields.
- Generate a collision-safe technical code on the server for UI-created Surfaces. Continue accepting an explicit code from compatible older clients.
- Sort user-facing Surface dropdown options by normalized Surface name; do not expose display-order maintenance in this simplified Surface UI.

### 2. Main Line → Mode → Surfaces

Place a separate card after Budgeting and before Quantity & margin:

- Heading: **Surfaces**
- Help text: **Select every surface where this Main Line can be used.**
- Field label: **Applicable surfaces**
- Empty value: **Select surfaces**
- Multi-select option summary: `Wall surface · Sq.ft` or `Counter surface · Sq.ft / Running ft`.
- Secondary action: **Add Surface**, adjacent to the selector when permitted.

Interaction rules:

- The selector supports multiple values because a Main Line can apply to multiple Surfaces and the persisted contract is already an array.
- Only active Surfaces may be newly selected.
- Inactive, archived, or unresolved records that are already saved remain visible as retained unavailable selections and are never replaced by raw IDs.
- Quick-add opens the same simplified Add Surface dialog. On success, the new Surface is added to the shared catalog, selected in the current unsaved Mode draft, and announced as: **{Surface name} added. Save Mode to apply it.**
- **Save Mode** persists the assignment. A Surface create is independently durable even if the subsequent Mode save fails.
- **Discard** restores the server Surface assignment without deleting a Surface created through quick add.
- Surface edits participate in existing Mode dirty-navigation protection.

## Loading, empty, stale, error, and conflict states

- Initial load: show **Loading surfaces…** and disable only the Surface controls.
- Background refresh: keep selected values visible and show a non-blocking refresh state.
- Empty catalog: show **No surfaces have been added.** and **Add Surface** when permitted.
- No search results: show **No surfaces match your search.** with **Clear search**.
- Catalog failure without cached data: show **Surfaces could not be loaded.** with **Retry**; do not clear saved IDs.
- Catalog failure with cached data: retain values and show **Surface options may be out of date.** with **Retry**.
- Create/update validation errors remain attached to their fields and preserve all entered values.
- Duplicate name: show **A Surface with this name already exists.**
- Stale Surface edit version: return 409, preserve the form draft, refresh the server record, and offer review/retry.
- Main Line revision conflict: preserve the local Surface selection, refresh the latest Overview payload, and show a Surface-scoped comparison without exposing raw IDs.
- Mode save failure: keep the Surface draft selected and dirty so the actor can retry.
- Referenced Surface archive conflict: explain that the Surface must first be removed from the referencing Main Lines.
- Referenced UOM archive conflict: explain that the UOM is used by a Surface and identify the dependency without exposing unrelated private data.

## Data and API contract

### Surface master

Retain the existing master fields and add:

```ts
typicalUomIds: string[]
```

Rules:

- `description` stores the freeform **Examples / components** text; no duplicate examples field or migration is introduced.
- `typicalUomIds` stores unique, ordered, stable UOM IDs and defaults to `[]` for legacy documents.
- Requests are bounded by the established knowledge array-size limit.
- New or newly added typical UOM references must resolve to active UOM records.
- An unchanged inactive historical UOM reference may be retained while other Surface text is edited; it cannot be newly selected.
- Responses map a missing legacy value to `[]`.
- Surface create may omit technical `code`; the server derives it. Explicit legacy code remains supported and validated.
- Strict Mongoose, runtime validation, shared TypeScript types, and OpenAPI must all describe the same shape.

### Main Line Surface assignment

- The Mode presentation group reads and writes `overview.surfaceIds`.
- `surfaceIds` remain ordered, unique stable Surface IDs.
- The Surface panel updates only `surfaceIds`; priority and every other Overview property must be preserved from the latest server payload.
- Mode save conflict/rebase handling must treat `priorityId` and `surfaceIds` as independent edited fields.
- Hidden legacy `scope.surfaceIds` are not cleared, copied, unioned into the visible selection, or newly written by this workflow.
- Existing context requests using one `surfaceId`, Main Line list filters, summaries, activation validation, history, duplication, and digest behavior must remain compatible with the saved Overview assignment.

### UOM referential integrity

- Surface creation and updates validate UOM stable IDs inside the existing transaction boundary.
- UOM archival must detect references from non-archived Surface masters and fail atomically.
- Concurrent Surface update/create and UOM lifecycle operations must coordinate through the established dependency-epoch/transaction mechanism so neither can create a dangling relationship.
- Surface create/update/lifecycle and audit append remain atomic; failed validation or audit persistence leaves no partial Surface write.
- Audit state must record meaningful changes to Surface name, description/examples, typical UOM IDs, status, version, and order without relying on labels as identity.

### Catalog consistency

- Fetch every Surface and UOM page required by the dropdown instead of silently limiting results to 100.
- After Surface create/update/lifecycle, invalidate or update the Surface collection, affected item summaries/filters, and any cached Surface detail used by the current workspace.
- Quick-add must use the returned stable Surface ID and must not match the new record by name.

## State transitions

### Quick-add and assign

1. Super Admin opens **Add Surface** from the Mode panel.
2. The server validates and commits the Surface master and audit record.
3. The client updates/invalidate caches using the returned stable ID.
4. The new active Surface becomes selected in the local Mode draft.
5. Super Admin selects any additional Surfaces and chooses **Save Mode**.
6. The existing Overview section update persists only the intended `surfaceIds` change with CAS and aggregate-version checks.

If step 5 fails, steps 2–3 remain committed, the local assignment remains dirty, and retry does not create a duplicate Surface.

### Edit and lifecycle

- Edit requires the record's expected version and produces a new audited version.
- Deactivated Surfaces disappear from new choices but remain resolvable for saved Main Lines.
- Archive is rejected while a Surface is referenced by protected Main Line revisions.
- UOM archive is rejected while a non-archived Surface references it.

## Compatibility, migration, and rollout

- The new Surface field is additive and optional/defaulted at persistence boundaries; no bulk write migration is required.
- Existing Surface documents remain readable and display **Not configured** for Typical unit until edited.
- Existing `description` values display as **Examples / components** without rewrite.
- Existing codes and display order remain stored and returned for compatible clients even though the simplified UI hides them.
- Deploy backend contract support before the new frontend. Older frontends ignore the additive field; compatible older clients may continue sending code.
- Do not modify the bootstrap manifest, because already-bootstrapped databases compare its documents exactly.
- Rollback is code-only for the additive data shape. A rollback must retain new fields in Mongo and must not use a destructive down migration.

## Accessibility and responsive requirements

- Reuse the established keyboard-accessible Surface multi-select behavior: Arrow keys navigate, Home/End jump, Enter/Space toggle, Escape closes and returns focus, and Tab closes and advances.
- The listbox exposes a clear accessible name, multi-select semantics, selected state, loading/error status, and text in addition to color.
- Dialog focus starts on Surface name, stays trapped while open, moves to the first invalid field on submit, and returns to its opener on close.
- All controls retain visible focus, a minimum 44 px target, reduced-motion behavior, and wrapping/truncation that does not hide accessible names.
- At 1440, 1024, and 768 px, the reusable Surface list may use a table.
- At 390 and 320 px, use stacked Surface cards or an equivalent non-overflowing layout; do not force the current wide table onto the viewport.
- The Mode selector and adjacent Add Surface action may wrap at narrow widths but must not create page-level horizontal scrolling.
- Verify long Surface names, multiple UOM labels, 200% zoom, keyboard-only use, coarse pointer, and all loading/empty/error/read-only/conflict states.

## Constraints and invariants

- Stable IDs are the only persisted join keys; names and labels are presentation.
- Backend authorization, validation, CAS, transactions, and audit remain authoritative.
- Surface typical UOM metadata is advisory and cannot manufacture financial values.
- Existing Budgeting, Quantity & margin, Specification, Priority, Recommendations, and Quality behavior must remain unchanged.
- Preserve all complete Overview payload properties when saving priority or Surface edits.
- Preserve memory and Mongo implementations when the repository contract has both.
- No production mutation, seed, backfill, deployment, commit, push, or external communication is authorized.

## Risks and mitigations

- **Examples accidentally become data entities:** explicitly store one freeform string in `description`; only the Surface record becomes a dropdown option.
- **Wrong assignment source:** write `overview.surfaceIds`, which current context and filtering already consume; leave hidden Scope data untouched.
- **Counter surfaces lose a valid unit:** use plural `typicalUomIds` even though the compact UI label remains **Typical unit**.
- **Typical UOM affects price:** label it as guidance and freeze Budgeting/slab calculation regressions.
- **Dangling UOM references:** validate in transaction, add UOM archive guards, and test concurrent lifecycle changes with a replica set.
- **Legacy Surface records become invalid:** default missing arrays to empty, show Not configured, and require UOM only when a new record is created or its UOM selection changes.
- **Catalog truncation:** use the existing collect-all-pages pattern and test a Surface beyond record 100.
- **Sequential Mode save partially succeeds:** retain existing per-section server authority, report the failed Surface/Overview save precisely, and keep unsaved local selections dirty.
- **Technical fields confuse Super Admin:** hide code, IDs, versions, ordering, and audit mechanics from the task form while retaining them in backend contracts.
- **Prior Overview decision regresses:** add explicit tests that Overview still contains no Surface UI.

## Acceptance criteria

1. **Configuration → Manage reusable values → Surfaces** displays Surface, Examples/components, Typical unit, Status, and Actions without exposing Code, stable ID, version, or display order.
2. Super Admin can create an arbitrary Surface name, optional freeform examples/components, and one or more typical units selected from the complete active UOM list.
3. A saved Surface appears immediately as a stable-ID option in the Mode Surface selector, and quick-add selects it in the unsaved draft.
4. **Main Line → Mode** contains a standalone Surfaces panel after Budgeting and before Quantity & margin; Overview remains free of Surface UI.
5. Super Admin can select, remove, save, discard, reload, and conflict-review multiple applicable Surfaces without losing priority or any other Overview data.
6. Saved Main Line assignments persist in `overview.surfaceIds` and remain compatible with item summaries, filters, activation, duplication, history, digest, and estimator-context surface matching.
7. `description` is presented as Examples/components, `typicalUomIds` uses stable UOM references, and no example text or UOM label is persisted as an identity key.
8. Existing legacy Surface rows require no migration, remain readable, and show **Not configured** when no typical UOM exists.
9. New UOM references must be active; referenced UOM archival and referenced Surface archival fail atomically with clear 409 behavior.
10. Surface create/update/lifecycle, UOM dependency validation, and audit evidence remain transactional and CAS-safe under concurrent changes.
11. Surface and UOM dropdowns load all pages, preserve retained unavailable selections, never expose raw IDs, and handle loading, stale, empty, error, read-only, and permission states.
12. The Surface management list, dialog, quick-add flow, and Mode selector meet keyboard, focus, accessible-name, zoom, touch-target, and 1440/1024/768/390/320 px responsive requirements without page-level overflow.
13. Focused backend model/route/service/context/archive/race tests and frontend management/Mode/query/conflict/accessibility/responsive tests pass, followed by both workspaces' typecheck, full tests, production builds, and `git diff --check`.
14. Budgeting, tax/GST, quantity slabs, margin calculations, other Mode panels, Recommendations, and Quality have no behavioral regression.

## Assumptions confirmed by approving this specification

- “Add component how he need” means freeform descriptive **Examples / components** inside a Surface record; examples are not independently selectable child records.
- “Saved data should come as dropdown” means each saved Surface name becomes an option in **Main Line → Mode → Surfaces**.
- The reference-image rows are illustrative and are not automatically seeded.
- A Surface may have multiple typical UOMs, while financial workflows continue requiring their own explicit UOM.
- Building a separate Estimator/Sales consumer dropdown is outside this task because no such consumer currently exists in this repository.

## Open decisions

No blocking decision remains. Approval confirms the assumptions and selected option above; any requirement for independently selectable component entities, automatic seed data, or a separate Estimator/Sales screen would require a revised specification.

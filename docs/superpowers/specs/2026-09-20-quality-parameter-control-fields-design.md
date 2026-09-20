# Quality parameter control fields and reusable values design

## Goal

Add the four controls from the supplied Quality Parameters reference to every shared Main Basket checklist row and allow Super Admin to extend the Frequency and Performed by dropdowns without a deployment.

1. **Severity** — Critical, Major, or Minor.
2. **Pass range** — Minimum and Maximum for Number answers, with the measurement unit.
3. **Frequency** — built-in and reusable Super Admin-created values.
4. **Performed by** — built-in and reusable Super Admin-created role-family values.

The controls must survive editor, API, immutable revision, summary, context, and Excel round trips. Existing revisions remain readable without migration.

## Current behavior and evidence

- The implemented Quality Parameter editor currently exposes Severity, Frequency, Performed by, and Number pass-range controls.
- Frequency is currently limited to Per unit, Per room, Per zone, Per batch, and Once per project.
- Performed by is currently limited to Site, PM, Procurement, and Vendor.
- `KnowledgeQualityParameter` persists the performer in `responsibleRole` and frequency in `sampling`; replacing those fields would introduce competing sources of truth.
- Shared checklists are immutable revisions protected by Basket compare-and-swap checks, transactions, and audit history.
- Historical revisions can contain absent or legacy free-text values, so compatibility reads must remain separate from validation of a new save.
- Lisno has reusable generic masters and quick-add UI patterns, but their edit/archive/reorder behavior is broader than required for these two Quality Parameter lists.

## Recommended approach

Introduce a dedicated, append-only **Quality Control Option** catalog with two kinds:

- `frequency`
- `performer`

Built-in options remain code-defined. Custom options are stored in the catalog and merged with built-ins for presentation. This avoids migrating existing revisions and avoids exposing generic master-management behavior that the request does not need.

### Option record

Each custom option contains:

- a stable opaque ID;
- `kind`, either `frequency` or `performer`;
- display `name`;
- normalized name for duplicate detection;
- creation version, actor, and timestamp metadata.

Names are trimmed, 1–80 characters, compared case-insensitively after whitespace normalization, and unique within their kind. The same label may exist once under each different kind.

This phase supports creation and reuse only. It does not support rename, reorder, archive, or delete because saved immutable checklist revisions may reference the option.

### Checklist storage

Existing built-ins retain their current canonical representation.

| UI value | Stored value |
| --- | --- |
| Per unit | `sampling = { method: "all", unit: "unit" }` |
| Per room | `sampling = { method: "all", unit: "room" }` |
| Per zone | `sampling = { method: "all", unit: "zone" }` |
| Per batch | `sampling = { method: "all", unit: "batch" }` |
| Once per project | `sampling = { method: "fixed_count", value: 1, unit: "project" }` |
| Custom frequency | `sampling = { method: "all", unit: <stable frequency option ID> }` |
| Site / PM / Procurement / Vendor | existing canonical `responsibleRole` code |
| Custom performer | `responsibleRole = <stable performer option ID>` |

A shared resolver must map the stored form to the option label for editor, table, summaries, history, context documentation, workbook import/export, and mobile presentation.

### Why stable IDs are required

Display labels are presentation and cannot be record keys. Storing the stable option ID:

- prevents spelling and capitalization changes from creating accidental joins;
- permits future catalog lifecycle work without rewriting immutable revisions;
- allows the backend to reject unknown or wrong-kind references;
- preserves identity when two kinds happen to use the same label.

## Alternatives considered

1. **Dedicated append-only option catalog — selected.** It provides stable identity and narrow permissions without exposing unrelated master behavior.
2. **Reuse the generic master collection.** It would inherit edit/archive/reorder semantics and would need broader authorization and compatibility rules.
3. **Free text with datalist suggestions.** It is faster initially but produces duplicates, cannot enforce kind, and makes reporting unreliable.

## Scope

### Included

- Preserve existing Severity and Number pass-range behavior.
- Merge built-in and custom options in Frequency and Performed by dropdowns.
- Show inline add actions for Super Admin in both dropdowns.
- Create a custom option through a focused quick-add panel and select it in the current row after success.
- Allow every user with existing checklist-update permission to select a custom option.
- Enforce option creation and option-reference authorization on the backend.
- Resolve custom labels across editor, controls summary, saved summary, pending changes, history, read-only details, context documentation, Excel template/import/export, and AI workbook instructions.
- Preserve immutable revision, content digest, compare-and-swap, transaction, audit, query invalidation, and unsaved-draft behavior.

### Not included

- Renaming, deleting, archiving, reordering, or merging custom options.
- Migrating built-in values into the database or rewriting historical revisions.
- Assigning a named user, team member, vendor record, or project participant.
- Executing a schedule from a custom Frequency label.
- Collecting inspection answers, uploading inspection evidence, creating snags/tasks, blocking stages, sending notifications, or completing PM sign-off.

## UX behavior

### Dropdowns

- Built-in values appear first in their established order, followed by custom values sorted by display name.
- A custom value looks like a normal selectable option; raw IDs are never displayed.
- A loading failure keeps the draft intact, shows an inline retry state, and does not replace the current selection.
- Unknown historical values remain visible as legacy/incomplete instead of being silently remapped.

### Super Admin quick-add

- Only Super Admin sees **Add frequency** or **Add performed-by value** inside the relevant dropdown flow.
- Activating the action opens a compact, accessible side panel with one required Name field, Save, and Cancel.
- The panel clearly identifies which list is being changed.
- Save trims and validates the label, creates the catalog record, refreshes the relevant list, and selects the new option in the current checklist row.
- Creating the catalog option is an immediate audited mutation. Selecting it changes only the local checklist draft until the existing checklist Save action is used.
- If the user later discards the checklist draft, the successfully created reusable catalog option remains available. The panel explains this before creation.
- Cancel, validation failure, authorization failure, conflict, or server failure creates no option and leaves the checklist draft unchanged.
- Duplicate conflicts show the existing matching label and let the user select it without creating a second record.
- Keyboard focus returns to the dropdown after cancel and to the selected value after success.

### Severity and pass range

- Severity remains required with Critical, Major, and Minor.
- Number answers show required Minimum, Maximum, and Unit; the inclusive minimum must not exceed maximum.
- Other answer types hide and clear numeric-only fields through the established cleanup behavior.
- Critical describes the configured PM sign-off policy; it does not claim that a sign-off workflow ran.

## Validation and compatibility

- Structural compatibility validation continues to read immutable historical revisions.
- The strict new-save validator accepts:
  - valid built-in values; or
  - an existing catalog option of the correct kind.
- The route validates request shape and syntax. The service performs database-backed option existence and kind validation before writing a checklist revision.
- Unknown IDs, wrong-kind IDs, malformed stored values, absent required controls, invalid numeric bounds, and missing numeric units fail with field-specific errors.
- A validation failure writes no checklist revision, Basket version, digest, or audit event.
- Legacy free-text values remain readable and exportable but are marked **Needs completion** and cannot pass a new shared-checklist save.
- Adding a catalog option does not change any saved checklist revision until the user explicitly saves that checklist draft.

## API, authorization, and persistence

Add a dedicated resource:

- `GET /admin/ai-estimator-knowledge/quality-control-options?kind=frequency|performer`
- `POST /admin/ai-estimator-knowledge/quality-control-options`

Create body:

```json
{
  "kind": "frequency",
  "name": "Per floor"
}
```

Authorization behavior:

| Action | Required authority |
| --- | --- |
| Read available options | Existing Quality Configuration read/update access as appropriate for the screen |
| Select an option in a checklist draft | Existing Quality Configuration update access |
| Create a reusable option | New `ai_estimator_knowledge.quality_control_options.create` operation; Super Admin only |

- Backend authorization is authoritative; hiding the add action is only a matching frontend affordance.
- The sole active Super Admin identity and all existing operation-specific override rules remain unchanged.
- Creation is transactional and audited with actor, kind, stable option ID, normalized name, and timestamp.
- A unique database constraint on `(kind, normalizedName)` provides race-safe duplicate prevention.
- Concurrent duplicate creates return the existing conflict cleanly and never produce two options.
- The canonical route-operation registry and OpenAPI inventory must include both endpoints and the new operation.

## Excel and AI workbook behavior

- Workbooks show custom values by display name and never expose stable IDs.
- Export resolves the stored option ID to its current catalog name.
- Import resolves a known label to the correct built-in or custom option of the requested kind.
- An unknown workbook label does not implicitly create a catalog option. Super Admin must create it first, then retry or select it in the editor.
- Ambiguous, missing, or wrong-kind values produce a row-specific import error.
- Older workbooks and historical detailed columns remain readable under existing compatibility rules.
- AI instructions may choose from supplied built-in and custom labels, but AI output cannot create catalog values.

## Failure handling

- Catalog load errors preserve selected and draft values and provide retry.
- Catalog create errors keep the quick-add panel and entered name open.
- Stale checklist versions preserve the full draft under the established reload/discard flow.
- A successful catalog create followed by a checklist save failure leaves the catalog option reusable and the checklist draft recoverable.
- Missing catalog records referenced by history render as an unavailable legacy value with the stable reference hidden from normal UI; exports report the unresolved value explicitly.

## Risks and controls

| Risk | Control |
| --- | --- |
| Duplicate labels from concurrent creation | Normalized unique constraint plus conflict response |
| Editors bypass Super Admin-only creation | Dedicated backend operation and authorization tests |
| Custom option is used in the wrong dropdown | Kind-aware storage resolution and service validation |
| A label becomes a join key | Persist stable opaque IDs and resolve labels for presentation |
| Historical revisions become unreadable | Compatibility reads and no migration/rewrite |
| Immediate catalog creation surprises the author | Explain persistence before Save and keep checklist save separate |
| Custom frequency is mistaken for an executable schedule | Treat it as a named inspection scope/cadence label only |
| Missing catalog data leaks raw identifiers | Render an unavailable legacy state and keep raw IDs out of normal UI |

## Acceptance criteria

1. Frequency and Performed by dropdowns show their built-in values and all custom values of the matching kind, with built-ins first and no raw IDs.
2. Only Super Admin sees the add actions, and the backend rejects creation by every other role even when called directly.
3. Super Admin can create a valid, unique Frequency or Performed by value; it becomes selected in the current row immediately and reusable in other rows.
4. Cancelled or failed creation changes neither catalog nor draft; a successfully created catalog value remains available if the checklist draft is discarded.
5. Custom performers persist as stable performer option IDs in `responsibleRole`; custom frequencies persist as `{ method: "all", unit: <stable frequency option ID> }`.
6. Backend and frontend accept valid built-in/custom selections and reject unknown, wrong-kind, malformed, or incomplete values before a checklist write.
7. Historical and canonical revisions remain readable and exportable without migration or digest rewrite; unsupported legacy values remain visible as incomplete.
8. Editor, controls table, mobile layout, pending changes, summaries, history, read-only details, and context-facing presentation resolve the same human-readable option name.
9. Excel export/import and AI workbook guidance support custom values without exposing IDs or implicitly creating options.
10. Option creation is authorized, audited, transactional, and duplicate-safe, and the authorization registry plus OpenAPI inventory remain synchronized.
11. Existing Severity, Number pass-range, photo evidence, immutable revision, CAS, audit, and query-refresh behavior remains intact.
12. Custom values do not assign people, execute schedules, create inspections/tasks/snags, block stages, send notifications, or complete sign-off.
13. Focused backend route/service/authorization/race tests, frontend quick-add/editor/presentation/workbook tests, typechecks, builds, and desktop/mobile interaction-accessibility checks pass.

## Assumptions settled by approval

- A new value is a reusable global catalog entry, not row-specific free text.
- Only Super Admin creates values; every user who can edit a shared checklist may select them.
- The catalog is append-only in this phase.
- A custom Frequency is a named inspection scope or cadence, not an executable scheduler rule.
- Built-in values remain code-defined, so no seed or migration is required.

## Open decisions

No implementation-blocking decision remains. Rename, archive, delete, reorder, assignment, and executable scheduling require a later specification with explicit historical-reference behavior.

# Main Line Descriptive Specifications Design

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Scope:** Configuration → Main Basket → Main Line → Mode → Specifications,
Overview Specifications summary, Pricing compatibility, and estimator context  
**Revises:** [Main Line Dynamic Specification Fields Design](2026-09-02-main-line-dynamic-specification-fields-design.md)

## Decision summary

A Main Line **Specification is descriptive information**, not a pricing
dimension. A Super Admin adds material or work-detail rows such as:

- **Plywood** — brief description of the required plywood.
- **Inner Laminate** — brief description of the inner laminate requirement.
- **Hardware** — brief description of the required hardware.

Each newly authored Specification contains a stable ID, a required
Specification name, and an optional brief description. The UI must no longer
ask for a component type, options, or a separate saved value, and it must not
call the feature “Pricing specifications.” New price versions must not be
assigned to a Specification.

Historical price versions and previously saved typed Specification rows remain
immutable and readable for compatibility; they are not rewritten or deleted.

## Goal

Make Specifications a clear, professional list of descriptive Main Line
requirements that Super Admins can add, edit, reorder, save, and summarize
without affecting vendor prices, price selection, tax calculations, or price
scope.

## Current behavior and evidence

### Current user-visible behavior

- The Mode tab renders a dynamic Specification builder with Component type,
  Label, Description, options, and a generated value control.
- Price-version creation includes a **Specification** dropdown and persists the
  selected row ID as `priceEntries[].specificationId`.
- Overview calls the block **Pricing specifications**, uses a
  **Pricing specification** dropdown, and groups matching price entries under
  the selected Specification.
- Referenced Specification rows cannot be removed because immutable saved
  price versions may point to their stable IDs.

### Current contract behavior

- `pricing.payload.specifications[]` accepts legacy descriptive rows
  `{ id, name, description? }` and canonical typed rows containing
  `type`, `options`, and `value`.
- Immutable price versions store `specificationId` and include it in their
  pricing scope key.
- Estimator context accepts `specificationId`, validates it against the Pricing
  section, filters returned Specifications, and currently uses the same ID to
  filter effective-price resolution.
- Overview and conflict review already resolve Specification identity by
  stable ID and keep internal notes/private IDs out of the visible summary.

### Problem

The current implementation conflates descriptive construction requirements
with price selection. That conflicts with the clarified product meaning and
causes labels such as Plywood, Inner Laminate, and Hardware to look like price
variants instead of explanatory requirements.

## Proposed behavior

### Specifications editor

1. The subsection heading remains **Specifications**.
2. **Add Specification** creates one stable descriptive row.
3. Each row exposes:
   - **Specification name** — required; examples: Plywood, Inner Laminate,
     Hardware.
   - **Brief description** — optional multiline guidance.
4. The editor does not expose Component type, Allowed options, or a generated
   value control.
5. Rows can be added, edited, reordered, and removed when not retained by
   immutable historical pricing.
6. Save continues through the existing single **Save Mode** command, section
   CAS, aggregate CAS, conflict handling, and authoritative post-save rebasing.
7. A saved row remains editable after save, including a second save in the
   same mounted Draft.
8. Empty rows are not manufactured automatically and empty descriptions are
   omitted from summaries.

### Example

```text
Specification name: Plywood
Brief description: 18 mm BWP-grade plywood for the cabinet carcass.

Specification name: Inner Laminate
Brief description: 0.8 mm white matte laminate on all internal faces.

Specification name: Hardware
Brief description: Soft-close hinges and full-extension drawer channels.
```

### Pricing editor

1. The price-version form no longer displays a Specification selector.
2. New append commands persist `specificationId: null` and price scope is
   determined by the existing Vendor, UOM, Mode, tax, dates, and status fields.
3. Existing referenced price versions may retain a non-null historical
   `specificationId`; immutable price history is never rewritten.
4. A historical price reference continues to display safely and remains
   replaceable through the established replacement workflow.
5. New API writes must not create another non-null Specification-to-price
   relationship after the revised backend contract is deployed.

### Overview

1. The heading is **Specifications**, not **Pricing specifications**.
2. The dropdown label is **Specification**, not **Pricing specification**.
3. Options use stable IDs and visible Specification names.
4. The selected detail displays only:
   - Specification name;
   - Brief description, when non-empty.
5. Component type, allowed options, generated value, price-entry count, and
   price rows are not displayed inside the Specifications panel.
6. Saved prices, when present, remain a separate Pricing summary/list and are
   never grouped beneath a descriptive Specification.
7. If no Specification is saved, the Specifications panel is omitted under
   the approved configured-only Overview behavior.

### Conflict and read-only views

- Conflict review labels the rows as Specifications and shows only stable
  user-facing name/brief-description information.
- It does not imply price applicability or expose raw Specification IDs.
- Active, superseded, archived, and unauthorized revisions remain read-only.
- Historical typed fields and price links may be retained internally without
  appearing as current descriptive controls.

## Data contract

### Authoritative new-write shape

```json
{
  "id": "knowledge-specifications-<stable-id>",
  "name": "Plywood",
  "description": "18 mm BWP-grade plywood for the cabinet carcass."
}
```

Rules:

- `id` is stable and opaque.
- `name` is required, trimmed for validation, and unique within the Pricing
  section after normalized case-insensitive comparison.
- `description` is optional/nullable, multiline, and bounded by the existing
  long-text limit.
- Unknown keys are rejected for new descriptive writes.
- Name and description are presentation, never join keys.

### Compatibility with existing typed rows

Previously saved canonical rows containing `type`, `options`, and `value` are
accepted for read/update compatibility, but:

- the revised editor shows only Specification name and Brief description;
- edits to those visible fields preserve the hidden legacy typed fields unless
  an explicitly approved normalization is performed later;
- typed fields do not participate in new price selection, Overview
  Specifications details, or current conflict presentation;
- no background migration or Active-revision rewrite is performed.

This compatibility rule prevents data loss while making the new-write contract
descriptive.

## Backend and API behavior

- Keep the existing section GET/PUT endpoints, permissions, audit event,
  transaction, section version, and aggregate version behavior.
- Treat the simple descriptive shape as authoritative for new Specifications.
- Retain dual-read support for already stored typed rows.
- Reject non-null `specificationId` on new price append commands after rollout;
  existing reference commands to immutable historical versions remain valid.
- Preserve price-version paise calculations, tax lineage, effective windows,
  overlap protection, rollback, and audit behavior.
- Continue returning revision-wide response metadata for historical
  Specification references so a retained historical row cannot be removed.
- Update OpenAPI descriptions/examples to distinguish descriptive
  Specifications from compatibility-only historical price links.

## Estimator context behavior

- Safe context includes descriptive Specifications as name/brief-description
  guidance.
- When a request supplies `specificationId`, it may select/filter the
  descriptive guidance returned to the estimator, but it must not filter or
  choose the effective price.
- Effective-price resolution ignores `specificationId` for newly unscoped
  prices and continues to respect Vendor/UOM/Mode/date/status scope.
- Existing historical price lineage may expose its Specification label for
  audit/debug presentation, but this does not make it a current price selector.
- Internal vendor notes, unknown Pricing fields, and private identifiers remain
  excluded from public context.

## Permissions and invariants

- Only the existing authorized Super Admin Draft workflow may mutate the
  section; backend authorization remains authoritative.
- Stable IDs survive edit, save, Overview, context, conflict, duplication, and
  history.
- Immutable price-version records are never rewritten to remove historical
  Specification IDs.
- New Specification rows do not affect prices, GST, margins, quantities,
  recommendations, quality calculations, or execution.
- Failed validation, network, partial-save, and conflict responses preserve
  local descriptive edits.
- Hidden Pricing properties and other Mode blocks survive every Specification
  edit.

## UX states and accessibility

- **Loading:** retain the existing Pricing block loading state.
- **Empty:** show Specifications guidance and **Add Specification** without a
  placeholder row.
- **Validation:** show exact errors for missing/duplicate name and invalid
  description, focus the first invalid field, and use user-facing descriptive
  terminology.
- **Saving:** disable mutation only during the authoritative request.
- **Success:** keep the same mounted controls enabled for further editing.
- **Error/conflict:** retain local values and the existing review/discard
  workflow.
- **Read-only:** show names and brief descriptions without add, remove, reorder,
  or edit actions.
- **Responsive:** name, description, and row actions wrap/stack without
  page-level horizontal overflow.

## Scope

- Descriptive Specification row editor and compatibility model.
- Removal of current dynamic component controls from the Specification UI.
- Removal of Specification selection from new price-version creation.
- Backend guard preventing new non-null price Specification relationships.
- Separate Overview Specifications and Pricing presentation.
- Context behavior that uses Specification only as descriptive guidance.
- Conflict review, OpenAPI, and focused cross-layer tests.

## Non-goals

- No price, GST, margin, UOM, Vendor, tax, quantity, Recommendation, Quality,
  PMC, Execution, or Mode semantic change.
- No migration, backfill, bootstrap rewrite, or mutation of immutable history.
- No reusable Specification master or separate top-level tab.
- No dynamic Text/Number/Radio/Checkbox/Dropdown/Textarea values for newly
  authored Specifications.
- No use of Specification descriptions in calculations.
- No commit, push, deployment, seed, production write, or external action.

## Risks and mitigations

- **Historical price linkage:** preserve immutable rows and reference commands;
  reject only new non-null append relationships.
- **Typed-row data loss:** dual-read and preserve hidden typed keys during
  visible name/description edits.
- **Mixed-version clients:** deploy backend compatibility/guard and frontend
  changes in a coordinated window so an older client cannot create a new
  Specification-scoped price.
- **Price ambiguity after unscoping:** keep existing Vendor/UOM/Mode/date scope
  validation and add asymmetric resolution tests.
- **Overview confusion:** split Specifications from Pricing and prohibit price
  counts/lists inside the Specifications panel.
- **Context regression:** prove `specificationId` filters guidance only while
  unequal effective prices resolve identically.
- **Dirty-worktree loss:** capture relevant diffs and use explicit ownership
  boundaries before writers start.

## Acceptance criteria

1. A Super Admin can add rows named Plywood, Inner Laminate, Hardware, or any
   other valid Specification name.
2. Each new row contains a stable ID, required Specification name, and optional
   Brief description only.
3. The editor does not show Component type, Allowed options, or a generated
   Specification value control.
4. Rows support add, edit, reorder, remove, save, and same-mounted second save
   while preserving stable IDs and descriptions.
5. Existing typed rows remain readable and editable by name/brief description
   without losing their hidden compatibility data.
6. New price-version forms expose no Specification selector and send
   `specificationId: null`.
7. The backend rejects a new append command with non-null `specificationId`
   while accepting references to valid immutable historical price versions.
8. Price calculations, tax lineage, effective windows, overlap rules, CAS,
   audit, and rollback remain unchanged.
9. Overview uses **Specifications** and **Specification**, showing only the
   selected name and non-empty Brief description.
10. Overview price information is separate and never grouped under a
    descriptive Specification.
11. Empty Specification data creates no Overview placeholder content.
12. Context returns safe descriptive guidance; selecting a Specification does
    not change effective-price resolution.
13. Conflict and read-only views use descriptive terminology and expose no raw
    IDs, typed values, or private Pricing notes.
14. Active, superseded, archived, and unauthorized views expose no mutation
    action.
15. Runtime validation, OpenAPI, frontend types/model, and rendered controls
    agree on the descriptive new-write and typed compatibility-read contracts.
16. Focused backend/frontend tests, replica-set price/context tests,
    accessibility interactions, typechecks, builds, and repository hygiene
    pass or any environment limitation is reported precisely.

## Data, migration, rollout, and rollback impact

- **Data:** new Specifications use the existing descriptive row shape; typed
  rows and historical price IDs remain stored.
- **API:** existing endpoints remain; validation narrows new price append
  commands and context changes Specification from a price filter to a guidance
  filter.
- **Persistence:** no new collection or index.
- **Migration:** none.
- **Rollout:** coordinated backend/frontend deployment is required to prevent
  older clients from creating new Specification-scoped prices.
- **Rollback:** preserve dual-read support and historical price fields; do not
  destructively downgrade or strip stored data.
- **External actions:** no deployment, production write, migration, seed,
  commit, push, or customer communication is authorized.

## Open decisions

No open decision remains under the evidence-backed interpretation that the
examples Plywood, Inner Laminate, and Hardware are descriptive requirement
headings with brief descriptions and are not dynamic component fields or price
variants. If dynamic values should remain in addition to brief descriptions,
or if prices should still be selectable by Specification, that would conflict
with this clarification and requires a revised decision before implementation.

## Implementation outcome

- New Specifications now use stable ID, required Specification name, and
  optional Brief description controls only.
- Historical typed rows remain readable; hidden `type`, `options`, and `value`
  fields are retained and cannot be introduced or changed by current writes.
- New and replacement price commands are Specification-unscoped, while
  immutable historical Specification price lineage remains readable.
- Estimator context uses Specification selection for descriptive guidance only;
  effective-price resolution is unchanged by that selector.
- Overview and conflict review present descriptive Specifications separately
  from configured Pricing and omit empty summaries.
- Independent reciprocal backend/frontend integrity review found no blocker,
  high, moderate, or low-severity issues.
- Focused verification passed: 101 backend tests, one isolated replica-set
  context regression, and 113 frontend editor/Overview/screen tests. Backend
  and frontend typechecks and builds passed. Full-suite runs reached 2104/2106
  backend tests and 1420/1421 frontend tests; the two unrelated backend failures
  and one unrelated frontend accessibility focus failure each passed when
  rerun alone. Repository diff hygiene passed.
- Rendered RTL accessibility and responsive-width checks passed. Authenticated
  live-browser visual QA was not available in this verification environment.
- No migration, seed, dependency, commit, stage, push, deployment, production
  write, or external action was performed.

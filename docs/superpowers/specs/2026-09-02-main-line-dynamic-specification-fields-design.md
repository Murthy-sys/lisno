# Main Line Dynamic Specification Fields Design

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Scope:** Configuration → Main Basket → Main Line → Mode → Specifications,
plus the configured-only Specifications summary in Overview

## Decision summary

Each Specification remains one stable, price-referenceable row in the Pricing
section, but the row becomes a configurable form component. A Super Admin can
choose Text, Number, Radio, Checkbox, Dropdown, or Textarea, provide a visible
label, add an optional description, configure choice options where applicable,
enter a value, and save it.

The existing stored `name` remains the row's user-facing label so current
`priceEntries[].specificationId` relationships, selectors, Overview summaries,
and saved revisions retain their lineage. The UI labels this control **Label**.
No reusable master catalog or new Specification tab is introduced.

The recommended flat row model is intentionally different from nesting an
arbitrary list of fields inside each Specification. One added Specification is
one added component. This matches the existing price-reference model and avoids
creating a second identity level that price entries cannot currently address.

## Goal

Allow a Super Admin to build and maintain Specifications with the same guided
component experience as Mode fields, including optional descriptive guidance,
while preserving stable pricing references and making saved values editable
again immediately after save.

## Current behavior and evidence

### User-visible behavior

- Specifications are rendered inside the Mode tab's Pricing block through the
  generic structured-array editor.
- **Add specification** creates a row with a generated stable ID.
- Each row currently exposes only **Name** and **Description**.
- Price-version creation can select a Specification by stable row ID while
  displaying its Name.
- Overview provides a **Pricing specification** dropdown and shows the selected
  row's name and matching price entries.
- Saved Specifications remain part of the Pricing section and use the Mode
  tab's single ordered save command.

### Data and execution path

- The source of truth is `pricing.payload.specifications[]`.
- The current accepted row shape is `{ id, name, description? }` with unique
  stable IDs and normalized unique names.
- `priceEntries[].specificationId` stores the Specification row ID, not its
  name.
- Backend validation is strict and currently rejects any component type,
  options, or value keys on Specification rows.
- Context requests validate `specificationId` against saved Specification row
  IDs.
- Overview projection resolves Specification labels and price relationships
  from the same rows.
- Pricing saves use section CAS plus Main Line aggregate CAS. The current Mode
  lifecycle already supports authoritative post-save rebasing and repeat saves
  in the same mounted Draft.

### Dirty-worktree evidence

The relevant frontend and backend AI-estimator files already contain approved,
uncommitted work. Implementation must preserve the existing Mode builder,
authoritative section-mutation response, Pricing hidden-field preservation,
Overview configured-only behavior, and unrelated user changes.

## Product specification

### Specification builder workflow

1. The Specifications block remains inside the Main Line **Mode** tab.
2. **Add specification** creates one new stable Specification row.
3. The Super Admin chooses one component type:
   - Text
   - Number
   - Radio
   - Checkbox
   - Dropdown
   - Textarea
4. The Super Admin enters a required **Label**. The label is stored in the
   existing `name` field and remains unique within the Pricing section after
   trimming and case normalization.
5. The Super Admin may enter an optional **Description**. It is supporting
   guidance for the Specification, not the Specification's saved value.
6. Radio and Dropdown require one or more unique, non-blank options.
7. The generated editable value control uses the configured Label as its
   accessible name and displays the Description as associated help text when
   present.
8. The Super Admin enters or changes the Specification value, reorders rows, or
   removes an unreferenced row.
9. Saving uses the existing single **Save Mode** command and Pricing section
   CAS workflow.
10. After a successful save, the same Draft and Specifications editor remain
    mounted and editable. A second save uses the returned section and aggregate
    versions without requiring a tab change or reload.

### Component behavior

- **Text:** single-line string or empty/null.
- **Textarea:** multiline string or empty/null.
- **Number:** canonical decimal string or empty/null. It is metadata and is not
  interpreted as currency, quantity, percentage, paise, or basis points.
- **Radio:** one configured option or empty/null.
- **Dropdown:** one configured option or empty/null.
- **Checkbox:** explicit boolean, including `false` as a configured value.
- Changing a component type clears an incompatible saved value and shows a
  visible notice before save.
- Removing or renaming a choice option clears an incompatible selected value
  and shows a visible notice.
- Row and option limits align with the established Mode-field limits unless the
  existing global Pricing payload limit is lower.

### Description behavior

- Description is optional for every new and existing Specification.
- Blank descriptions are normalized to absent/null according to the existing
  Pricing-row convention.
- Description supports the existing long-text limit.
- Description is shown as help text with the editable control and in Overview
  when non-blank.
- Description is not used as identity, a join key, or a price calculation
  input.

### Save, edit, and removal behavior

- A saved Text, Number, Radio, Checkbox, Dropdown, or Textarea control remains
  enabled for a Super Admin while the revision remains Draft and permissions
  allow `update_section`.
- Successful saves preserve stable Specification IDs, row order, descriptions,
  unrelated Pricing keys, immutable price-version commands, and other Mode
  blocks.
- Validation, network, partial-save, and conflict failures preserve the local
  Specification buffer for review or retry.
- A Specification row cannot be removed after immutable saved price history in
  the revision references its ID. The UI explains that the row must be retained
  and may still be edited.
- Active, superseded, and archived revisions remain read-only.

### Overview summary

- Overview retains its configured-only **Pricing specifications** dropdown.
- Options use stable Specification IDs and visible Labels.
- Selecting a Specification displays only its non-empty saved information:
  Label, optional Description, configured value, and matching price entries.
- `false` Checkbox values display as **No** and are not treated as empty.
- Empty/null values are omitted rather than rendered as “Not configured.”
- When no Specification or matching price entry is saved, the entire block
  remains omitted according to the approved Overview behavior.
- Overview remains read-only for Specification definitions and values; its
  **Open Mode** action navigates to detailed editing through the existing
  unsaved-change guard.

## Data contract

### Canonical Specification row

New or promoted rows use:

```json
{
  "id": "knowledge-specifications-<stable-id>",
  "name": "Board thickness",
  "description": "Use the approved finished thickness.",
  "type": "dropdown",
  "options": ["12 mm", "18 mm", "25 mm"],
  "value": "18 mm"
}
```

Rules:

- `id`, `name`, `type`, `options`, and `value` are required canonical keys.
- `description` is optional or nullable.
- Allowed `type` values are exactly `text`, `textarea`, `number`, `radio`,
  `dropdown`, and `checkbox`.
- `options` is non-empty only for Radio and Dropdown.
- Value validity is type-specific and follows the component behavior above.
- Unknown keys are rejected.
- IDs remain opaque and stable; names/labels and descriptions are presentation.
- Normalized duplicate labels, duplicate row IDs, duplicate choice options, and
  values outside their configured choice list are rejected with exact paths.

### Legacy compatibility

Existing rows may retain the current shape:

```json
{
  "id": "specification-existing",
  "name": "Premium",
  "description": "Existing specification"
}
```

Compatibility rules:

1. Backend dual-read validation accepts both the current legacy shape and the
   canonical component shape during the compatibility period.
2. Legacy rows remain visible by Name and Description and retain their stable
   IDs and price references.
3. Editing only a legacy Name or Description does not manufacture a component
   type or value.
4. Choosing a component type explicitly promotes that row to the canonical
   shape while retaining the same ID, Name/Label, Description, order, and price
   relationships.
5. No background rewrite, seed, bootstrap change, or production backfill is
   performed.
6. Activated historical revisions may retain legacy rows indefinitely.

## Backend and API behavior

- Extend the public Pricing Specification contract and strict validator with
  the canonical component fields and type-specific validation.
- Keep `priceEntries[].specificationId` unchanged and continue validating it by
  stable row ID.
- Preserve immutable price-version materialization and price calculations;
  dynamic Specification values are descriptive selection metadata only.
- Prevent canonical/legacy ambiguity by accepting either the legacy exact shape
  or the canonical exact shape.
- Update OpenAPI with both compatible row shapes, field-type enum, option/value
  rules, and examples.
- Keep the existing section update endpoint, permissions, audit action,
  transaction, section version, and aggregate version response.
- Pricing section responses expose response-only, revision-wide referenced
  Specification IDs so the UI can prevent an invalid removal without changing
  the persisted Pricing payload.
- Pre-existing orphaned payloads remain saveable for unrelated edits and may
  retain an exact previously stored price-version reference, but cannot add or
  reintroduce a dangling reference.
- Context/public projections may expose Label, Description, type, options, and
  saved value, but must continue excluding internal vendor notes and unrelated
  private Pricing metadata.

## UX states

### Loading

- Preserve the existing Pricing block loading state and do not render an empty
  builder before the authoritative section envelope loads.

### Empty

- Show the Specifications heading, concise builder guidance, and **Add
  specification**.
- Do not manufacture a default saved row or show empty Overview content.

### Validation

- Show a summary and field-level errors for missing Label/type, invalid number,
  missing/duplicate options, invalid choice value, duplicate Label, limits, and
  referenced-row removal.
- Save attempts focus the first actionable invalid control.

### Saving and success

- Disable mutations only while the authoritative save request is in flight.
- After success, re-enable the saved controls and show the existing saved-state
  feedback.
- Secondary cache refresh must not keep committed controls disabled.

### Error and conflict

- Preserve local values on validation, network, and partial-save failures.
- Attribute a Pricing conflict to the Pricing block and retain existing
  keep-editing, review-server-version, and discard-local-changes behavior.

### Read-only

- Active/archived revisions display saved Specification labels, descriptions,
  options, and values without Add, Remove, Reorder, or mutation controls.

### Accessibility and responsive behavior

- Use native/select-compatible controls, labelled radio groups, associated
  descriptions/errors, keyboard-operable row actions, and stable accessible
  names.
- Preserve visible focus, validation focus, and a minimum touch target matching
  the existing design system.
- At desktop, tablet, and mobile widths, definition controls and value controls
  wrap without page-level horizontal overflow.

## Permissions and invariants

- Frontend visibility requires the established frontend permission and backend
  `allowedActions`; backend authorization remains authoritative.
- Only the current Draft revision is mutable.
- Specification IDs remain stable across edit, save, Overview, price-entry
  selection, context, conflict review, duplicate revision, and audit paths.
- Labels and descriptions never become join keys.
- Immutable price-version lineage and paise-based financial calculations remain
  unchanged.
- Section and aggregate CAS must prevent stale writes.
- A failed save never clears a valid local value or silently converts a legacy
  row.
- No reusable master, new route, new permission, or new top-level tab is added.

## Scope

- Dynamic Specification component contract and validation.
- Super Admin Specifications builder in the Mode/Pricing block.
- Optional Specification descriptions and accessible help presentation.
- Post-save editability and repeat-save CAS behavior.
- Price-selector label compatibility and reference integrity.
- Overview configured-only dynamic Specification details.
- Conflict review, public/context sanitization, OpenAPI, and focused tests.

## Non-goals

- No change to prices, GST, margins, UOMs, vendors, taxes, brands, quantities,
  Recommendations, Quality, PMC, or Execution field semantics.
- No reusable Specification master or separate Specifications tab.
- No arbitrary nested list of fields inside one Specification row.
- No multi-select, date, file upload, rich-text, formula, or computed component.
- No production migration, backfill, seed, deployment, commit, or push.
- No rewrite of immutable Active revisions or existing price versions.

## Constraints

- Preserve the heavily dirty worktree and understand relevant per-target diffs
  before assigning writers.
- Reuse the established Mode component model and design-system controls where
  behavior aligns, without coupling Specification identity to `modeKind`.
- Keep generic Pricing keys that are hidden from the current UI intact on save.
- Do not add a dependency unless implementation evidence proves the established
  components cannot satisfy the approved behavior.
- Final verification must distinguish known unrelated full-suite failures from
  regressions introduced by this change.

## Risks and mitigations

- **Dangling price references:** retain the existing Specification ID and block
  removal while referenced; add asymmetric relationship tests.
- **Legacy data loss:** use dual-read exact shapes and explicit, user-initiated
  promotion only.
- **Type-change value loss:** clear only incompatible values and announce the
  consequence before save.
- **Hidden Pricing key loss:** update only `specifications[]` inside the loaded
  payload and assert unrelated keys survive.
- **Checkbox omission:** treat `false` as a saved value in editor, API,
  Overview, context, and tests.
- **CAS regression:** reuse authoritative section/aggregate rebasing and test
  same-mounted save–edit–save with cache noise.
- **UI density:** use a guided builder/repeater with responsive definition and
  value groups rather than exposing raw JSON.
- **Contract drift:** align backend contract, runtime validation, OpenAPI,
  frontend parser, selectors, conflict review, and Overview projection.

## Acceptance criteria

1. A Super Admin can add Text, Number, Radio, Checkbox, Dropdown, and Textarea
   Specifications in the Main Line Specifications block.
2. Every new Specification has a stable ID, required Label, optional
   Description, type-specific options, and an editable value control.
3. Radio/Dropdown options and all type-specific values are validated with
   accessible field errors and first-error focus.
4. Saving persists the canonical row while preserving stable IDs, order,
   descriptions, unrelated Pricing data, price commands, and other Mode blocks.
5. Saved Specification controls remain editable after save, and a second save
   in the same mounted Draft uses authoritative section and aggregate versions.
6. Switching among or editing multiple Specification rows preserves all local
   buffers until save, discard, or guarded navigation resolution.
7. Type/option changes visibly clear only incompatible values.
8. Existing legacy `{ id, name, description? }` rows remain readable,
   editable, referenceable, and are promoted only after explicit type choice.
9. Price entries continue to reference Specifications by stable ID and display
   the Label; referenced rows cannot be removed into a dangling state.
10. Overview lists saved Specifications by stable ID/Label and displays only
    non-empty Label, Description, value, and matching price information;
    Checkbox `false` displays as **No**.
11. Empty Specifications do not create Overview placeholder content.
12. Context, conflict review, duplication, and read-only history preserve the
    correct Specification definition and value without exposing raw IDs or
    private Pricing notes.
13. Active, superseded, archived, or unauthorized views expose no Specification
    mutation action.
14. Backend validation, API/OpenAPI, frontend types, and rendered controls agree
    on both legacy and canonical shapes.
15. Focused backend/frontend tests cover all six types, descriptions, choice
    options, legacy promotion, stable price references, save–edit–save,
    failures/conflicts, Overview omission, responsive layout, and accessibility.
16. Backend and frontend typechecks/builds, applicable integration tests,
    repository hygiene, and rendered browser QA pass or any environment
    limitation is reported precisely.

## Data, API, persistence, and migration impact

- **Data:** additive canonical fields on `pricing.specifications[]`; stable row
  IDs and `specificationId` relationships are unchanged.
- **API:** existing section GET/PUT endpoints return/accept the extended Pricing
  payload. No new route is required.
- **Persistence:** remains embedded in the existing versioned Pricing section;
  no new collection or index is required.
- **Migration:** none. Dual-read compatibility is required before canonical
  frontend writes are deployable.
- **Authorization/audit:** existing update-section permission and audit event
  remain authoritative.
- **Financial behavior:** unchanged; values are not financial inputs.
- **Rollback:** code-only while dual-read support remains; canonical rows must
  not be destructively downgraded.
- **External actions:** no deployment, production write, migration, seed,
  commit, push, or customer communication is authorized.

## Open decisions

No open decision remains under the evidence-backed interpretation that one
added Specification equals one configurable component and that “similar to
Mode” requests the same six component types. Approval of this specification
approves that flat model. A nested group containing multiple fields, a new
Specifications tab, additional component types, or using Specification values
in calculations would materially change the contract and require a revised
specification.

## Implementation verification

- Integrity review: GO, with no blocker, high, or moderate finding remaining.
- Focused backend contract/service/replica-set/OpenAPI suite: 98/98 passed.
- Focused frontend builder/save/Overview/conflict suite: 145/145 passed.
- Backend and frontend typechecks and builds passed.
- Frontend full suite: 1416/1416 passed.
- Backend full suite: 2102/2103; the sole unrelated Estimate Design failure
  passed immediately in isolation and was classified as suite contention.
- Repository `git diff --check` passed with no generated tracked changes.
- Live authenticated browser QA was unavailable; rendered interaction,
  accessibility, and responsive-layout tests passed.
- No migration, seed, dependency installation, commit, push, deployment, or
  external production action was performed.

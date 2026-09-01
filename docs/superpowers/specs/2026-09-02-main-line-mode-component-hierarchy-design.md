# Main Line Mode Component Hierarchy Design

**Status:** Implemented — verified 2026-09-02
**Date:** 2026-09-02
**Scope:** Configuration → Main Basket → Main Line → Mode, Overview Mode
summary, conflict/read-only presentation, and Active estimator context
**Revises:** [Main Line Dynamic Mode Fields](2026-09-01-main-line-dynamic-mode-fields-design.md)

## Decision summary

Main Line Mode configuration has exactly two fixed Modes:

1. **PMC**
2. **Execution**

PMC owns one direct list of configurable components. It has no Sub-Vendor or
In-house subdivision.

Execution is subdivided into **Sub-Vendor** and **In-house**. A required radio
group lets the Super Admin select either Execution source and configure its
component definitions.
Sub-Vendor and In-house definitions coexist; switching the selector changes
the editing context and does not delete the other source.

Mode configuration is a template-definition workflow. The Super Admin chooses
a component type, gives it a label, and configures allowed options when needed.
No operational answer/default value is entered or stored under Main Basket →
Main Line → Mode.

The recommended contract keeps the existing revision-owned Advanced section
but changes each component from `{ id, type, label, options, value }` to the
definition-only shape `{ id, type, label, options }`. This preserves existing
Draft CAS, immutable revision history, audit, duplication, and context lineage
without creating reusable Mode master records or another backend section.

## Current-state evidence

### Confirmed current behavior

- The Mode builder has fixed PMC and Execution choices, but both currently use
  the same flat component/value workflow.
- `KnowledgeModeConfigurationField` includes `value`, and the Mode builder
  renders a live text, textarea, number, radio, dropdown, or checkbox value
  control after the definition is complete.
- The frontend serializer sends `value` for every field.
- Backend Advanced-section validation requires `value` and validates it against
  the chosen type/options.
- Overview projects saved non-empty Mode values, and Active estimator context
  currently carries those values with the Mode configuration.
- No separate estimator/project/estimate response entity consumes these
  dynamic Mode component definitions today.
- Canonical PMC and Execution configurations already use `modeKind`; legacy
  reusable Mode IDs remain only for compatibility.

### Root mismatch

The existing implementation treats the knowledge-base configuration as both a
form template and an answer record. The clarified product model requires the
knowledge base to define the form only. It also requires an Execution-only
Sub-Vendor/In-house level that the current flat two-Mode contract does not
represent.

## Goal

Allow a Super Admin to define the components required for PMC, Execution →
Sub-Vendor, and Execution → In-house without saving operational answers in the
Main Basket knowledge configuration.

The resulting Active context must provide stable, safe component definitions
that a future authorized data-entry workflow can render and answer outside the
knowledge-base revision.

## Product behavior

### Mode selection

1. The Mode selector contains only **PMC** and **Execution**.
2. These choices use canonical `modeKind` values (`pmc`, `execution`); they do
   not create, edit, or depend on reusable Main Basket Mode records.
3. Switching Mode preserves unsaved component-definition edits in both Modes.

### PMC configuration

1. Selecting **PMC** shows **PMC components** directly.
2. PMC does not display an Execution source selector.
3. The Super Admin can add, edit, reorder, and remove PMC component
   definitions.

### Execution configuration

1. Selecting **Execution** shows an **Execution source** radio group with:
   - **Sub-Vendor**
   - **In-house**
2. Selecting a source shows only that source's component definitions.
3. Sub-Vendor and In-house definitions are independently stored and can both
   exist in the same Main Line revision.
4. Switching sources preserves unsaved changes for both source buffers.
5. An empty source remains empty; selecting it does not manufacture a
   component row.

### Component definition

1. **Add component** creates a stable component-definition row.
2. The Super Admin chooses one supported component type:
   - Text field
   - Text area
   - Number field
   - Radio buttons
   - Dropdown
   - Checkbox
3. The Super Admin enters a required **Component label**.
4. Radio and Dropdown additionally require **Allowed options**.
5. The configuration screen does not render an answer/default-value control.
6. Saving persists only the component definition.
7. Saved definitions remain editable after the first save and through a second
   save in the same mounted Draft.
8. Read-only revisions show definition metadata without mutation actions.

### Overview

1. Overview keeps the existing PMC/Execution selection presentation.
2. Selecting PMC shows configured PMC component definitions only.
3. Selecting Execution shows separate configured-only **Sub-Vendor** and
   **In-house** definition summaries.
4. A component summary may show its label, component type, and allowed options;
   it never shows an answer/default value.
5. Empty Mode/source summaries are omitted.

### Conflict and context presentation

- Conflict review exposes only Mode/source labels and component-definition
  metadata. It excludes legacy values and raw internal IDs.
- Active estimator context may filter by `modeKind` and, for Execution, by
  `executionSource`.
- Context returns stable component IDs, types, labels, and allowed options only.
- Context never returns a configured answer/default value from Main Basket
  knowledge.

## Data contract

### Canonical new-write shape

```json
{
  "modeConfigurations": [
    {
      "id": "knowledge-mode-configuration-pmc-...",
      "modeKind": "pmc",
      "fields": [
        {
          "id": "knowledge-mode-field-pmc-mark-...",
          "type": "text",
          "label": "PMC mark",
          "options": []
        }
      ]
    },
    {
      "id": "knowledge-mode-configuration-execution-sub-vendor-...",
      "modeKind": "execution",
      "executionSource": "sub_vendor",
      "fields": [
        {
          "id": "knowledge-mode-field-sub-vendor-scope-...",
          "type": "dropdown",
          "label": "Work package",
          "options": ["Carpentry", "Electrical"]
        }
      ]
    },
    {
      "id": "knowledge-mode-configuration-execution-in-house-...",
      "modeKind": "execution",
      "executionSource": "in_house",
      "fields": []
    }
  ]
}
```

### Structural rules

- PMC configuration must omit `executionSource`.
- Execution configuration must contain exactly one `executionSource`:
  `sub_vendor` or `in_house`.
- At most one PMC configuration and one configuration per Execution source may
  exist in a revision.
- Configuration and component IDs are stable and opaque.
- Component array order is display order.
- Every component contains exact `id`, `type`, `label`, and `options` keys.
- A new component must not contain `value`, `defaultValue`, or an equivalent
  answer field.
- Labels are normalized-unique within their own PMC/source configuration.
- Radio/Dropdown options are trimmed, bounded, non-empty, and
  normalized-unique; other types use an empty options array.
- Existing limits of 50 components per configuration, 50 options per choice,
  bounded strings, object depth, and section payload size remain.

### Historical compatibility

- Existing Active, Superseded, and Archived revisions containing `value`
  remain immutable and are not migrated or rewritten.
- Existing Draft component rows containing `value` are accepted only as
  compatibility rows matched by stable component ID.
- The UI does not render the historical value. Visible definition edits retain
  it internally without allowing it to be added or changed.
- Backend writes reject a new `value`, legacy-to-valued promotion, or mutation
  of a retained historical value.
- Public Overview, conflict projection, and Active context strip historical
  values even when storage retains them for immutable compatibility.
- An existing unscoped Execution configuration cannot be assigned silently to
  Sub-Vendor or In-house. It appears as a recovery configuration and the Super
  Admin must explicitly move it to an empty Execution source or remove it from
  the editable Draft.

## API, persistence, and workflow impact

- Keep the existing Advanced section and section PUT endpoint.
- Add `executionSource` to canonical Execution Mode configuration rows.
- Remove `value` from the authoritative new-write component schema.
- Keep Draft-only mutation, section and aggregate CAS, transactional audit,
  completeness, activation, duplication, and immutable-history rules.
- Extend context request validation with optional `executionSource`, valid only
  when `modeKind=execution`.
- Update runtime validation, shared contracts, frontend types, OpenAPI, context
  sanitization, Overview projection, conflict allowlists, and focused tests.
- No collection, index, route, permission, audit action, migration, bootstrap,
  or reusable Mode master change is required.

## Permissions and invariants

- Only the existing authorized Super Admin Draft workflow can mutate component
  definitions.
- Other roles receive no new configuration mutation authority.
- Stable IDs survive edit, reorder, save, Overview, conflict, activation,
  duplication, history, and context.
- PMC definitions never appear under Execution.
- Sub-Vendor definitions never appear under In-house, and vice versa.
- Mode definitions do not change pricing, GST, UOM, margins, quantities,
  Specifications, Recommendations, Quality, or project Execution tasks.
- The frontend preserves unrelated Pricing, Quantity & margin, Advanced,
  Vendor, Specification, and hidden server-owned payload fields.
- A failed save, validation response, or conflict preserves every unsaved
  PMC/Sub-Vendor/In-house buffer.

## UX, accessibility, and responsive requirements

- Information order: Mode selector; Execution source radio group when
  applicable;
  component list; Add component.
- Exact labels: **Mode**, **Execution source**, **Sub-Vendor**, **In-house**,
  **PMC components**,
  **Sub-Vendor components**, **In-house components**, **Component type**,
  **Component label**, **Allowed options**, **Add component**.
- The helper text states that this screen defines required inputs and does not
  store entered answers.
- The Execution source choices render as native radio buttons inside a labelled
  `fieldset`/`legend`; keyboard arrow navigation changes the selected source.
- Dropdown and other radio controls have explicit accessible names and correct
  grouping.
- Validation focuses the first invalid component definition and announces a
  summary without raw payload paths.
- Add, remove, and move controls identify Mode/source and component label.
- At 768 px and below, definition rows stack; at 320–480 px, controls and row
  actions wrap without page-level horizontal overflow.
- Loading, empty, saving, saved, failed, stale, conflict, retry, and read-only
  states reuse the established Mode panel and command-bar behavior.

## Scope

- Definition-only PMC component builder.
- Definition-only Execution → Sub-Vendor and Execution → In-house builders.
- Backend schema, validation, context, OpenAPI, and compatibility enforcement.
- Overview, conflict, read-only, responsive, accessibility, and lifecycle tests.
- Removal of current Main Basket answer-value controls and public projections.

## Non-goals

- No actual answer entry or answer persistence in the knowledge-base revision.
- No new estimate/project/operational data-entry screen in this change because
  its actor, parent record, workflow state, and persistence boundary have not
  yet been specified.
- No reusable Mode management for PMC, Execution, Sub-Vendor, or In-house.
- No nested groups beyond the one Execution source level.
- No arbitrary React components, HTML, scripts, formulas, conditional rules,
  files, rich text, or external lookup components.
- No migration, backfill, seed, bootstrap execution, deployment, commit, push,
  or production write.

## Options and tradeoffs

### A — Flat configurations keyed by Mode and Execution source (recommended)

- PMC remains one configuration; Execution owns one row per source.
- Minimizes change to the current `modeConfigurations[]` storage and stable-ID
  behavior.
- Makes source isolation, context filtering, and validation explicit.
- Requires revising the old one-configuration-per-Mode uniqueness rule.

### B — One Execution configuration containing nested source groups

- Keeps one row per Mode but introduces a second nested repeater/schema.
- Requires a larger parser, serializer, conflict, OpenAPI, and compatibility
  rewrite.
- Rejected because the flat contract is simpler and preserves the current
  configuration/fields pattern.

## Risks and mitigations

- **Legacy answer leakage:** strict public projection allowlists omit `value`.
- **Historical data loss:** stable-ID compatibility preserves old values
  internally and never rewrites immutable revisions.
- **Execution source crossover:** exact source enum and asymmetric fixtures
  prove Sub-Vendor/In-house isolation.
- **Ambiguous old Execution data:** explicit recovery prevents automatic,
  incorrect classification.
- **Older clients reintroducing values:** deploy backend validation before the
  new frontend and reject added/changed value fields.
- **Unsaved-buffer loss:** keep all three buffers inside the Advanced-section
  draft and reuse the existing navigation/conflict guard.
- **Future response joins:** stable component IDs plus Main Line/revision/Mode/
  source lineage make a later answer entity possible without using labels as
  keys.

## Acceptance criteria

1. Mode configuration offers exactly PMC and Execution.
2. PMC has no Sub-Vendor/In-house selector and supports direct component
   definitions.
3. Execution offers exactly Sub-Vendor and In-house as a required radio group
   and preserves independent definition lists for both.
4. The Super Admin can add, edit, reorder, remove, save, and edit again after
   save in all three configuration contexts.
5. Components support Text, Text area, Number, Radio, Dropdown, and Checkbox
   definition types.
6. The configuration screen shows Component type, Component label, and allowed
   options when applicable, but no answer/default-value control.
7. New writes contain no `value` or reusable `modeId`.
8. Backend runtime validation rejects new/changed values, invalid source/Mode
   combinations, duplicate identities/labels/options, and unsafe bounds.
9. Historical values remain immutable/read-compatible internally and are
   absent from Overview, conflict, and public context.
10. Overview shows configured definitions only, keeps PMC direct, separates
    Execution Sub-Vendor/In-house, and omits empty groups.
11. Context filters definition templates by exact Mode/source without
    cross-group leakage.
12. Existing Draft CAS, audit, conflict, cache synchronization, Active history,
    authorization, and read-only rules remain unchanged.
13. Pricing, Specifications, Vendors, quantities, Recommendations, Quality,
    calculations, and project Execution workflows are unchanged.
14. Frontend/backend/OpenAPI contracts agree and focused plus integrated tests,
    typechecks, builds, responsive interaction, accessibility, and repository
    hygiene pass or limitations are precisely reported.

## Assumptions and open decision

- **Assumption for approval:** Sub-Vendor and In-house configurations can both
  coexist; the radio group switches the editor rather than choosing one
  permanent Execution strategy.
- The future screen and persistence model that collect actual component
  answers are not identifiable in the current repository or request. That is a
  separate product decision and is intentionally not invented here. This
  definition contract is designed so that future answers can join by stable
  component ID and revision lineage.

## Rollout and rollback

- Deploy backend dual-read/new-write validation before the frontend stops
  sending values and starts sending Execution sources.
- No background rewrite is required.
- Rollback must retain read support for source-scoped definition rows; an older
  backend that rejects `executionSource` must not accept Advanced-section
  writes after rollout.
- No external action is authorized by approval of this specification.

## Implementation outcome

Verified implementation matches the approved flat hierarchy:

- PMC owns direct definition-only components.
- Execution owns independent Sub-Vendor and In-house definitions selected by
  a labelled native radio group.
- Canonical writes contain `id`, `type`, `label`, and `options` only; answer or
  default values are neither collected nor publicly projected.
- Historical values remain immutable compatibility data matched by stable
  configuration and component IDs. Legacy reusable-Mode rows cannot be
  promoted, and canonical unscoped Execution rows require an explicit move to
  an empty source or removal before activation.
- Overview and conflict review expose configured definition metadata only.
  Active context filters exact Mode/source definitions without changing price
  resolution.
- OpenAPI, runtime validation, service enforcement, and frontend request types
  agree on Mode/source identities and type-specific option rules.

Final evidence:

- Backend focused validation, routes, item service, replica-set, and OpenAPI:
  **105/105 passed**.
- Frontend AI Estimator Knowledge feature suite: **278/278 passed**.
- Backend and frontend typechecks and production builds passed.
- Independent backend and frontend integrity reviews returned **GO** after all
  findings were corrected.
- Full backend run: **2103/2108 passed**; five unrelated timeout failures in
  password reset and production bootstrap passed **39/39** when rerun in
  isolation.
- Full frontend run: **1419/1424 passed**; five unrelated timing/interference
  failures in invitation acceptance, accessibility, and access request tests
  passed **49/49** when rerun in isolation.
- Responsive and accessibility behavior is covered by feature rendering,
  keyboard, axe, and 768/390/320 px layout tests. An authenticated real-browser
  viewport matrix was not run.
- Repository `git diff --check` passed. Existing Mongoose deprecation warnings
  and the Vite large-chunk advisory remain unrelated.
- No migration, seed, dependency installation, stage, commit, push,
  deployment, production write, or external mutation was performed.

# Main Line Dynamic Mode Fields

Status: Approved for implementation  
Date: 2026-09-01

## Goal

Allow a Super Admin to configure mode-specific fields from **Configuration →
Main Basket → Main Line → Mode**.

The Mode tab will provide a **Mode** dropdown for **PMC** and **Execution**.
For either mode, the Super Admin can add a supported field type, give the field
a label, configure choice options where applicable, enter or edit its value,
and save it as revision-owned Main Line knowledge.

Example: select **PMC**, add a **Text field**, label it **PMC mark**, enter a
value, and save. On subsequent visits, **PMC mark** renders as an editable text
field for an editable Draft revision. The saved non-empty value is also shown
in the existing read-only Overview summary for PMC.

## Decision summary

The recommended implementation is to keep **Mode** as the established
frontend presentation group and add an optional `modeConfigurations` structure
to the existing backend `advanced` section payload.

This approach is recommended because:

- mode-specific overrides already belong to the `advanced` revision section;
- it preserves the authoritative eight-section backend contract;
- it reuses the existing Draft-only section update endpoint, transaction,
  section and aggregate version checks, audit event, revision copy, activation,
  and context projection paths;
- it avoids a separate collection or a ninth section that could fall out of
  sync with the Main Line revision; and
- Overview already reads the Advanced section for its summary.

The existing Pricing and Quantity & margin content in the Mode tab remains in
place. The dynamic builder is an additional **Mode configuration** block, not a
replacement for those established inputs.

## Current behavior and evidence

- `KnowledgeModePanel.tsx` currently treats Mode as a frontend group over the
  fixed `pricing` and `quantity-margin` backend sections. It does not expose a
  mode selector or dynamic field definitions.
- `knowledgeWorkspaceSections.ts` explicitly prevents `mode` from being sent as
  a backend section key.
- The backend permits exactly eight section keys and validates every section
  payload against an allowlist. `advanced` currently owns dependencies,
  mode-specific overrides, and revision lineage.
- Main Line modes are reusable master records with stable IDs. PMC exists in
  the bootstrap manifest. Execution must also exist as an active reusable Mode
  record in the target data; labels must not be used as join keys.
- The section update service permits mutation only on the current Draft,
  checks both the section version and Main Line aggregate version, validates
  all revision references, updates completeness, and appends an audit event in
  the same Mongo transaction.
- Activated revisions are immutable, and a new Draft copies all section
  payloads. Storing the new configuration in a section therefore preserves its
  history automatically.
- The Quality editor already demonstrates accessible structured rows for text,
  number, dropdown, radio, and checkbox-like parameters. Its interaction and
  validation patterns can be reused, but Quality data must remain separate
  from Mode configuration data.
- Overview already renders mode choices as a radio group and reads the Advanced
  section. It can project saved dynamic fields without another request.
- The worktree contains substantial existing AI Estimator changes. Future
  implementation must capture and preserve the relevant pre-change diffs
  before modifying shared files.

## Actors and permissions

### Super Admin

- Can create and edit dynamic mode fields only when the displayed revision is
  the current Draft and the existing `ai_estimator_knowledge.configuration.update`
  permission and `update_section` action are available.
- Can view saved fields in read-only Active, Superseded, or Archived revisions.
- Uses the existing section Save command, conflict dialog, unsaved-navigation
  guard, and audit trail.

### Other roles

- Receive no new visibility or mutation authority.
- Backend authorization remains authoritative and must reject a non-Super-Admin
  update before payload validation.

## Product behavior

### Mode selection

1. A **Mode** dropdown appears at the start of the Mode configuration block.
2. Its required product choices are **PMC** and **Execution**.
3. Each choice resolves to an active reusable Mode master by stable ID. The UI
   may use the master code to locate the canonical choices, but persisted
   configuration stores only `modeId`, never the displayed label.
4. PMC and Execution configurations can coexist for one Main Line revision.
   The dropdown selects which configuration is being edited; it is not a
   destructive single-mode replacement.
5. Switching the dropdown preserves unsaved edits for both modes in the local
   Advanced-section draft.
6. If PMC or Execution cannot be resolved from the active Mode masters, the UI
   shows an explicit blocking reference state and an existing Super Admin
   quick-add path. It must not silently manufacture an ID or persist a label.

### Adding and editing fields

1. **Add field** opens an inline field-definition row.
2. The Super Admin chooses a field type and enters a label.
3. Radio and dropdown fields additionally require one or more allowed options.
4. Once the definition is structurally valid, its real input control renders
   in the same Mode configuration block.
5. The Super Admin can enter or change the value, edit the label and options,
   move fields up or down, or remove a field before saving.
6. One **Save Mode** action persists every dirty Mode-owned backend block in
   deterministic order. It must not report success while any block remains
   unsaved.
7. Reloading the same Draft renders the saved definitions as editable controls
   with their saved values.
8. Read-only revisions render the controls disabled and do not expose add,
   reorder, or remove actions.

### Supported field types

“Any field” is implemented as a bounded, validated set of safe form controls;
it does not permit arbitrary executable React components or HTML.

| Type | Builder configuration | Stored value | Rendered control |
| --- | --- | --- | --- |
| `text` | Label | string or null | Single-line text input |
| `textarea` | Label | string or null | Multi-line text area |
| `number` | Label | canonical decimal string or null | Decimal input |
| `radio` | Label and allowed options | selected option or null | Radio group |
| `dropdown` | Label and allowed options | selected option or null | Select control |
| `checkbox` | Label | boolean | Checkbox |

No Description field is added to the field definition or rendered control.

### Overview summary

- Overview remains read-only for dynamic mode fields.
- Its existing mode radio group includes modes referenced by
  `modeConfigurations`.
- Selecting PMC or Execution displays only that mode's saved, non-empty dynamic
  field values.
- Empty text/number/choice values are omitted. Checkbox values render as
  **Yes** or **No** because both are meaningful saved values.
- Unknown or inactive historical mode IDs remain non-disclosing stable-ID
  fallbacks in read-only history; they never cause values from another mode to
  appear.

## Data contract

The `advanced` section payload gains one optional top-level property:

```json
{
  "modeConfigurations": [
    {
      "id": "knowledge-mode-configuration-...",
      "modeId": "knowledge-mode-...",
      "fields": [
        {
          "id": "knowledge-mode-field-...",
          "type": "text",
          "label": "PMC mark",
          "options": [],
          "value": "A1"
        }
      ]
    }
  ]
}
```

Contract rules:

- Configuration and field IDs are stable, non-empty IDs generated once on the
  client and validated by the server.
- At most one configuration may exist for a given `modeId` within a revision.
- Field IDs and normalized field labels must be unique within a mode.
- Array order is the authoritative display order. Reordering does not recreate
  field IDs.
- Each mode supports at most 50 fields.
- Radio/dropdown options are trimmed, non-empty, normalized-unique strings;
  each choice field supports at most 50 options.
- Labels and options use the existing short-text limit. Text values use the
  existing bounded-text limit.
- Number values are canonical decimal strings, not JavaScript floating-point
  numbers.
- Radio/dropdown values are null or one of that field's current options.
- Non-choice fields must store an empty `options` array.
- Checkbox values are booleans.
- Changing a type or option list may retain the value only if it remains valid;
  otherwise the UI clears it with an inline notice before save.
- Unknown keys, invalid value/type combinations, duplicate IDs, duplicate mode
  references, duplicate normalized labels/options, unsafe sizes, and unresolved
  Mode master IDs are rejected by the backend.

## API and persistence impact

- No new route is introduced.
- The existing endpoint remains authoritative:
  `PUT /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/sections/advanced`.
- The route request shape continues to carry `expectedVersion`,
  `expectedAggregateVersion`, applicability, and payload.
- Backend domain validation, Mongoose validation, OpenAPI payload keys, contract
  types, section cloning, master-reference validation, and active-context
  projection are extended for `modeConfigurations`.
- Active-context projection includes only structurally valid data from the
  Active revision and retains exact Main Line/revision content-digest lineage.
- The existing `ai_estimator_knowledge_section_updated` audit action remains
  the write audit event. No new event or permission is needed.
- The first use of a Mode ID, or replacement with a different Mode ID, touches
  an internal Mode dependency epoch in the same transaction as the Advanced
  section write. Mode archive compares that epoch in its CAS, so concurrent
  archive/reference creation cannot commit a dangling reference under Mongo
  snapshot isolation. The epoch is not exposed in DTOs, OpenAPI, versions,
  timestamps, or audit values, and legacy Mode rows safely behave as epoch zero.
- Dynamic fields are optional knowledge. Their absence does not reduce current
  completeness or introduce a new activation blocker. Invalid configurations
  cannot be saved or activated.

## Save, conflict, and cache behavior

- The Mode panel loads `advanced` in addition to its existing backend sections.
- Saving only a dynamic definition/value updates only the Advanced section.
- A dynamic configuration mutation makes the Advanced section semantically
  configured. Its save therefore sends `applicability: "configured"`, including
  when the freshly created section was `not_configured`, so an activated revision
  cannot silently omit the saved configuration from estimator context. Merely
  opening or switching the Mode selector does not change applicability.
- If other Mode blocks are also dirty, saves run serially using the latest
  aggregate version after each successful update.
- A failure stops the sequence, identifies the affected block, preserves all
  unsaved local drafts, and leaves the command bar dirty.
- A 409 conflict loads the latest Advanced section and Main Line versions and
  uses the existing keep-editing, review-server-version, and discard-local
  choices. There is no automatic replay.
- Success updates the section, item, Overview-summary, context-relevant, and
  list caches through the established mutation synchronization path.
- Navigating away with unsaved definitions or values uses the existing
  save/discard/stay dialog.

## UX, accessibility, and responsive requirements

- Information order: Mode dropdown, field list, **Add field**, then the existing
  Mode content.
- Field-definition editing is visually subordinate to the rendered value
  controls and uses the established Surface, Field, Input, Select, Textarea,
  Checkbox, Button, InlineMessage, and repeater styling.
- Every rendered control has a programmatically associated label derived from
  its stored field label and a unique DOM ID derived from stable IDs.
- Radio fields use a labelled `fieldset`/`legend`; the Mode selector has an
  explicit accessible name.
- Add, move, remove, retry, and save controls have mode- and field-specific
  accessible names.
- Validation summaries link/focus to the first invalid definition or value.
- Keyboard users can complete the full workflow without drag-and-drop. Move up
  and Move down remain the authoritative ordering controls.
- At 768px and below, builder/value grids progressively stack. At 480px, field
  actions become full-width or wrap without horizontal page scrolling.
- Loading, empty, missing-master, error, stale refresh, saving, success,
  read-only, and conflict states are explicit and do not erase cached data.
- Canonical PMC and Execution resolution uses the backend-compatible identity
  normalizer over the complete Mode result set rather than treating the first
  page as authoritative.
- An editable Draft with a stale referenced Mode exposes that configuration as
  a recovery entry. Its fields remain disabled, but Super Admin can remove the
  whole stale configuration and use the governed reusable-value flow to create
  or select a valid replacement. Read-only history keeps the stale values visible.

## Scope

- Extend the Advanced-section contract and validation with mode configurations.
- Add the Mode dropdown and dynamic builder to the Main Line Mode tab.
- Support the six bounded field types specified above.
- Preserve and edit saved values in Draft revisions.
- Project saved values into the existing Overview mode summary.
- Extend query synchronization, conflict review, context projection, OpenAPI,
  and focused/full regression coverage.
- Provide fixtures with two asymmetric stable Mode IDs for PMC and Execution.

## Non-goals

- No arbitrary custom React components, HTML, scripts, formulas, conditional
  visibility rules, nested groups, file uploads, rich text, or external lookup
  fields.
- No changes to estimation calculations, price formulas, paise/BPS rules,
  Execution workflow tasks, project execution screens, or the separate
  backend `execution` knowledge section.
- No replacement or removal of the existing Pricing and Quantity & margin
  content in Mode.
- No editing of dynamic fields from Overview.
- No permission expansion beyond Super Admin.
- No automatic production seed, migration, bootstrap execution, deployment,
  commit, or push.
- No rewrite of historical Active/Superseded revisions.

## Compatibility and rollout

- Existing revisions without `modeConfigurations` are treated as an empty
  configuration. No backfill is required.
- Existing Advanced payload properties remain unchanged and must be preserved
  on every update.
- Dynamic Mode references participate in the same inbound-reference protection
  as every other Mode use; a referenced Mode cannot be archived from either a
  Draft or retained Active revision. Forced archive-first and reference-first
  replica-set tests cover atomic rollback and audit behavior.
- Deploy backend validation/OpenAPI support before the frontend begins sending
  the new property.
- PMC and Execution must exist as active reusable Mode records in the target
  environment before release acceptance. If Execution is missing, it is added
  through the existing governed Super Admin reusable-values workflow or a
  separately approved additive data operation; this implementation does not
  mutate production data automatically.
- Rollback is code-only for revisions that do not yet contain the new property.
  Once saved, an older backend that rejects unknown Advanced keys cannot safely
  accept Advanced-section updates, so rollback must retain read compatibility
  or temporarily disable those writes. Saved JSON remains revision history.

## Options and tradeoffs

### A — Extend `advanced` with `modeConfigurations` (recommended)

- Preserves the eight-section contract and revision lifecycle.
- Keeps mode-specific rules together and lets Mode/Overview reuse an already
  loaded section.
- Requires the Mode frontend group to save a third backend block and requires
  explicit validation/context projection updates.

### B — Store configurations in `overview`

- Reduces Mode configuration to one additional section read.
- Mixes potentially large form definitions with identity/UOM/surface summary
  data and increases conflict risk with Overview edits.
- Rejected because Advanced already owns mode-specific configuration.

### C — Add a ninth persisted `mode` section or a separate collection

- Creates an intuitively named storage boundary.
- Expands section enums, bootstrap, completeness, revision copying, context,
  OpenAPI, indexes, and lifecycle logic, or risks separate-record drift.
- Rejected as unnecessary contract and migration risk.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Arbitrary fields become an injection or unbounded-payload path | Closed type enum, plain-text rendering, strict keys, length/count/depth limits, and no executable markup |
| PMC values appear under Execution | Stable `modeId` ownership, one configuration per mode, asymmetric tests, and Overview filtering by exact ID |
| Choice edits leave invalid saved values | Backend membership validation and client-side clearing notice before save |
| Concurrent Super Admin edits overwrite configuration | Existing section and aggregate CAS, conflict review, no automatic replay |
| Hidden Advanced data is lost when Mode saves | Rebase/preserve untouched Advanced keys and add contract tests for dependencies, overrides, and lineage |
| Execution label is mistaken for the Execution section | Store a reusable Mode stable ID and keep the backend `execution` section unchanged |
| Older clients reject or erase the new property | Backend-first rollout and preservation tests for full Advanced payloads |
| Responsive builder becomes difficult to use | Reuse established repeater styling and run desktop/tablet/mobile plus keyboard/accessibility QA |

## Acceptance criteria

1. In an editable Draft, Super Admin sees a labelled Mode dropdown containing
   resolvable PMC and Execution choices.
2. PMC and Execution are represented by distinct stable Mode IDs; display
   labels are never used as persistence or join keys.
3. Selecting either mode shows only that mode's configuration while retaining
   unsaved edits made to the other mode.
4. Super Admin can add text, textarea, number, radio, dropdown, and checkbox
   fields with a label and no Description input.
5. Radio and dropdown definitions require valid, unique allowed options.
6. Newly added definitions render their real editable controls before save.
7. Saving and reloading preserves stable field IDs, order, labels, options,
   value types, and values.
8. Super Admin can edit labels/options/values, reorder fields, and remove fields
   in a Draft; read-only revisions expose none of those mutation actions.
9. Example PMC text field **PMC mark** can be saved with a value and edited
   after reload.
10. PMC and Execution configurations can coexist without value leakage.
11. Overview's mode radio summary shows only the selected mode's non-empty
    saved dynamic values and remains read-only.
12. Existing Pricing and Quantity & margin Mode content remains behaviorally
    unchanged.
13. Saving dynamic fields preserves all existing Advanced payload properties.
14. Invalid types, labels, options, values, duplicates, bounds, or mode
    references return field-addressable validation errors without a partial
    write.
15. Only the current Draft is mutable; Active, Superseded, and Archived history
    remains immutable.
16. Section/aggregate conflicts preserve local work and use the existing review
    choices without automatic retry.
17. Non-Super-Admin mutation attempts remain forbidden by backend enforcement.
18. Active context exposes the saved mode configuration with exact revision
    lineage and no Draft data.
19. Existing revisions with no configuration continue loading, copying,
    activating, and resolving unchanged.
20. Focused backend/frontend tests, authorization and replica-set CAS coverage,
    typechecks, full builds, repository hygiene, and rendered responsive,
    keyboard, and accessibility scenarios pass before completion is claimed.

## Verification expectations

### Backend

- Domain validation tests for every type/value pairing, duplicate IDs/modes/
  labels/options, bounds, unknown keys, and invalid master references.
- Route tests for 401/403 ordering, 400 validation, successful update, and
  OpenAPI parity.
- Service and replica-set tests for Draft-only mutation, section and aggregate
  CAS conflicts, transaction rollback, audit atomicity, revision copying,
  activation, digest/context lineage, and preservation of unrelated Advanced
  keys.
- Context tests with unequal PMC and Execution values proving exact filtering
  and no Draft leakage.

### Frontend

- Builder interaction tests for all six types, option editing, type changes,
  reorder/remove, save/reload, read-only state, missing master, validation
  focus, conflict, partial Mode save failure, cache synchronization, and
  unsaved navigation.
- Overview tests proving selected-mode filtering and omission of empty values.
- Responsive interaction and accessibility checks at desktop, 768px, 480px,
  keyboard-only, and 200% zoom.
- Focused tests first, followed by frontend/backend typecheck, full tests, and
  production builds.

### Repository hygiene

- `git diff --check`
- `git status --short`
- No lint claim unless a lint command is added and actually run.
- No migration, bootstrap, production write, deployment, commit, or push unless
  separately authorized.

## Assumptions and open decisions

The following interpretations are part of this specification and will be fixed
by approval:

- **Execution** means a reusable Mode choice named Execution, not the hidden
  Main Line Execution tab or project execution workflow.
- PMC and Execution configurations may both exist; the dropdown is an editor
  switcher rather than a single exclusive assignment.
- “Any field” means the six safe field types listed in this specification.
- The existing Pricing and Quantity & margin blocks remain in Mode.
- Saved dynamic values are shown in Overview for the selected mode because that
  continues the previously approved Overview-summary behavior.
- Target data supplies active PMC and Execution Mode master records. Missing
  master data is surfaced and created through the governed reusable-values
  workflow, not silently seeded by the screen.

No unresolved product decision blocks the task-plan stage after these
assumptions are approved.

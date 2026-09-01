# Main Line Mode Tab-Local Choices Design

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-01  
**Supersedes:** The previously approved “hide Mode Code” interpretation  
**Scope:** Configuration → Main Basket → Main Line → Mode, plus removal of
Modes from the Super Admin reusable-values UI

## Decision summary

PMC and Execution are fixed choices owned by the Main Line **Mode** tab. They
are not reusable values and a Super Admin must never create, repair, or manage
them from a reusable-value screen.

The Mode tab must work when the reusable Mode catalog is empty, missing
Execution, unavailable, or not loaded. The blocking message **Required reusable
Modes are unavailable**, the **Add reusable Mode** action, and the associated
quick-add workflow are removed.

New dynamic Mode configurations use the closed semantic key `modeKind` with
values `pmc` or `execution`. Existing saved `modeId` configurations remain
readable through a compatibility path so this change does not require an
immediate production migration.

## Goal

Give every Super Admin a reliable Mode-tab dropdown containing exactly:

- PMC
- Execution

After selecting either choice, the Super Admin can add labelled Text, Number,
Radio, Checkbox, Dropdown, or Textarea fields, enter values, and save them for
that Main Line revision without depending on reusable master data.

## Current behavior and evidence

### User-visible behavior

- The Mode builder loads reusable Mode masters and attempts to resolve active
  records whose codes are PMC and Execution.
- If one record is missing, the page displays **Required reusable Modes are
  unavailable**, identifies the missing record, and offers **Add reusable
  Mode**.
- The screenshot demonstrates this failure with **Execution is missing**.
- Reusable values currently include a Modes category with add/edit/archive
  workflows.

### Data and execution path

- Dynamic configurations are stored in the Advanced section as
  `modeConfigurations[]` containing `modeId` and `fields`.
- Frontend resolution joins `modeId` to the reusable Mode catalog and uses the
  master code to identify PMC or Execution.
- Backend section validation treats `modeConfigurations[].modeId` as a stable
  Mode-master reference.
- Draft save validation verifies referenced Mode IDs exist and are active.
- Mode archive protection scans `payload.modeConfigurations.modeId`.
- Context filtering accepts `modeId` and filters dynamic configurations by that
  reusable-master ID.

This means the banner is not only incorrect copy; it reflects an incorrect
source-of-truth dependency for the requested product behavior.

## Product specification

### Fixed Mode choices

1. The Main Line Mode tab owns a closed list of two choices:
   - `pmc`, displayed as **PMC**
   - `execution`, displayed as **Execution**
2. The choice control is always available after the Mode section itself loads.
3. The choice list does not come from `listKnowledgeMasters("modes")`, a master
   catalog cache, bootstrap data, or a quick-add workflow.
4. PMC and Execution cannot be renamed, archived, reordered, duplicated, or
   deactivated by a Super Admin.
5. Each Main Line revision may contain at most one configuration per Mode kind.
6. PMC and Execution configurations may coexist and retain independent field
   definitions, ordering, and values.

### Mode builder workflow

1. Select PMC or Execution from the Mode dropdown.
2. Add any supported component: Text, Number, Radio, Checkbox, Dropdown, or
   Textarea.
3. Enter a user-facing label and any component-specific options.
4. Enter or edit the component value.
5. Reorder or remove components while the revision is editable.
6. Save through the existing Mode save command and ordered multi-section CAS
   workflow.
7. After a successful save, the same Draft remains editable. The saved section
   and aggregate versions are rebased from the server response without forcing
   the Super Admin to leave or reload the Mode tab.
8. A Super Admin can change any previously saved PMC or Execution field and
   save again; the second save uses the latest section and aggregate CAS
   versions and retains all unrelated saved Mode data.
9. Switching between PMC and Execution preserves unsaved buffers for both
   choices until save, discard, or navigation resolution.

### Removed reusable behavior

1. Remove **Modes** from the Super Admin Reusable estimation values category
   navigation and mobile selector.
2. Do not show Add Mode, Quick add Mode, Edit Mode, Archive Mode, Code, or Mode
   master list rows in that reusable-values workflow.
3. Remove **Add reusable Mode** and all reusable-mode recovery calls to action
   from the Main Line Mode tab.
4. Remove copy that describes PMC or Execution as reusable values or reusable
   Modes.
5. Other reusable categories—UOMs, Vendors, Taxes, Priorities, and Surfaces—are
   unchanged.

### Overview summary

1. Overview may display a PMC/Execution selector or switch only to inspect
   saved Mode-tab information.
2. The Overview selector uses the same fixed `modeKind` values and display
   labels as the Mode tab.
3. Only saved, non-empty fields for the selected Mode kind are displayed.
4. If one Mode kind has no saved non-empty fields, its empty summary is omitted.
5. Overview remains read-only for these dynamic field definitions and values.

## Data contract

### New canonical payload

New and updated dynamic Mode configurations use:

```json
{
  "modeConfigurations": [
    {
      "id": "knowledge-mode-configuration-<stable-id>",
      "modeKind": "pmc",
      "fields": [
        {
          "id": "knowledge-mode-field-<stable-id>",
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

Rules:

- `modeKind` is required for newly written configurations.
- Allowed values are exactly `pmc` and `execution`.
- A configuration cannot contain both `modeKind` and legacy `modeId`.
- Configuration IDs and field IDs remain stable, opaque IDs.
- Display labels are presentation and never identity.
- Unknown keys remain rejected by strict validation except for unrelated
  already-approved Advanced payload keys preserved by the section editor.

### Legacy compatibility

Existing saved configurations may contain:

```json
{
  "id": "knowledge-mode-configuration-existing",
  "modeId": "knowledge-mode-existing-id",
  "fields": []
}
```

Compatibility behavior:

1. Backend validation continues accepting a legacy configuration with exactly
   one valid `modeId` during the compatibility period.
2. When its referenced master can be resolved canonically to PMC or Execution,
   the frontend presents it under the corresponding fixed choice.
3. The next successful user-initiated save writes `modeKind` and removes that
   configuration's legacy `modeId`; there is no background or automatic write.
4. If a legacy ID cannot be resolved, the configuration remains visible as a
   recovery item with its fields intact. It may be removed, but it must not be
   silently assigned to PMC or Execution.
5. Failure to load a legacy catalog must not block creating or editing canonical
   `modeKind` configurations.
6. Activated revisions remain immutable and may retain legacy `modeId` forever.
7. No production backfill, seed, or migration is required by this change.

## API and backend behavior

### Section validation

- Extend the dynamic Mode configuration validator to accept either canonical
  `modeKind` or legacy `modeId`, but never both and never neither.
- Validate canonical Mode-kind uniqueness independently of reusable Mode
  masters.
- New `modeKind` configurations do not participate in active Mode-master
  reference validation or archive coordination.
- Legacy `modeId` configurations retain existing reference and archive safety
  for backward compatibility.

### Context request and filtering

- Add optional `modeKind: "pmc" | "execution"` to knowledge context and preview
  request contracts where exact dynamic Mode selection is required.
- Reject requests that supply both `modeKind` and `modeId` for the same
  selection because their precedence would be ambiguous.
- `modeKind` filters canonical configurations by exact semantic key.
- Existing `modeId` continues to support legacy configurations and other
  established reusable-mode relationships such as immutable price-version
  lineage during the compatibility period.
- PMC data must never appear in Execution context and vice versa.

### OpenAPI and contracts

- Document the `modeKind` enum and the canonical configuration shape.
- Mark `modeId` in dynamic Mode configurations as legacy compatibility, not the
  preferred write contract.
- Keep generic reusable Mode DTOs and persistence internal/compatible for
  existing backend consumers; removing their database collection or price
  lineage is outside this bounded change.

## UX states

### Loading

- Loading the Advanced section may show the existing Mode-tab loading state.
- The PMC/Execution choices do not have a separate reusable-catalog loading
  dependency.
- A legacy mapping request, when needed, is secondary and cannot hide or disable
  canonical choices.

### Empty

- With no saved configurations, show the fixed Mode selector and an empty
  builder for the selected choice.
- Do not show a missing reusable Mode warning.

### Error

- Section load/save errors retain the existing block-specific retry and CAS
  behavior.
- A legacy mapping failure reports only that an existing legacy configuration
  could not be identified; it does not instruct the user to add reusable data.

### Read-only

- Active and archived revisions show fixed labels and saved values without
  mutation actions.
- Legacy read-only values remain visible without being rewritten.

### Accessibility and responsive behavior

- The Mode choice remains a labelled native/select-compatible control with
  keyboard access and a stable accessible name.
- Field controls retain labels, validation association, focus handling, and
  existing drag/reorder alternatives.
- Desktop, tablet, and mobile layouts must not contain the removed warning or
  leave empty action space where **Add reusable Mode** previously appeared.

## Permissions and invariants

- Existing Super Admin operation permissions remain unchanged.
- Backend authorization remains authoritative.
- Draft-only editability, Active immutability, section version CAS, aggregate
  CAS, conflict review, ordered Mode save, and audit behavior remain unchanged.
- Stable configuration/field IDs preserve lineage; `modeKind` is the stable
  semantic owner within the Mode tab.
- No name-based join is introduced.
- Pricing, quantity/margin, recommendations, quality, and unrelated Advanced
  payload keys remain unchanged.

## Scope

### In scope

- Fixed PMC/Execution Mode-tab choices.
- Canonical `modeKind` frontend/backend/OpenAPI contract.
- Legacy `modeId` read compatibility and user-initiated conversion on save.
- Removal of reusable Mode UI navigation and Mode quick-add/recovery actions.
- Overview dynamic Mode summary conversion to fixed keys.
- Context filtering for canonical Mode kinds.
- Focused frontend/backend/integration tests and responsive/accessibility QA.

### Non-goals

- Deleting the backend Mode-master collection or generic Mode API routes.
- Rewriting immutable price versions or other historical `modeId` lineage.
- Running a production migration, seed, bootstrap, backfill, or destructive
  cleanup.
- Changing supported dynamic component types or field-value rules.
- Changing project Execution workflow semantics.
- Changing non-Mode reusable values.

## Options considered

### Option 1 — Canonical Mode-tab enum with legacy compatibility

**Recommended.** `modeKind` expresses the actual closed product choice, removes
the reusable-data prerequisite, works even when the Mode catalog is empty, and
allows old saved IDs to remain readable without an immediate migration. It is a
cross-layer contract change but matches the requested ownership boundary.

### Option 2 — Hidden, system-owned reusable Mode records

PMC and Execution could remain Mode masters but be hidden from the UI and
automatically provisioned. This minimizes payload changes, but the Mode tab
would still depend on records, bootstrap correctness, archive rules, and a
production provisioning operation. That contradicts “not reusable” and leaves
the current root dependency in place.

### Option 3 — Keep user-managed reusable Modes and change only the warning

Rejected. Removing the banner while retaining the dependency would leave the
Mode tab unusable when Execution is missing and would not satisfy the clarified
requirement.

## Compatibility, rollout, and rollback

### Rollout order

1. Backend first: accept canonical `modeKind` plus legacy `modeId`, expose
   `modeKind` context filtering, and retain old clients.
2. Frontend second: write `modeKind`, use fixed choices, hide reusable Modes,
   and read legacy configurations through the compatibility adapter.
3. No data operation is run as part of rollout.

### Rollback

- The backend remains able to read both shapes during rollback.
- A frontend rollback can continue reading legacy `modeId`; canonical
  `modeKind` data requires the compatibility-capable backend and should not be
  deployed before it.
- No destructive rollback or data restoration is required.

### Observability

- Validation errors identify the exact configuration path and whether
  `modeKind` is invalid, duplicated, or combined with `modeId`.
- Existing audit events continue recording section updates without exposing
  private payloads.
- Tests and operational diagnostics distinguish canonical configurations from
  unresolved legacy records without logging client data.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Old saved IDs become unreadable | Dual-shape parser plus resolved legacy display; no automatic destructive conversion. |
| PMC values leak into Execution | Closed enum, one configuration per kind, exact backend filtering, and asymmetric tests. |
| Old clients break after backend deploy | Backend accepts both shapes; deploy backend before frontend. |
| A legacy master is missing or archived | Preserve fields as an unresolved recovery item; never guess a Mode kind. |
| Reusable Modes are still used by price lineage | Keep internal models/routes and historical `modeId` support outside the removed Super Admin category. |
| Removing the UI affects other master categories | Filter only Modes and add UOM/Surface regression coverage. |
| A production mutation occurs implicitly | No migration, seed, bootstrap, or backfill is part of implementation. |

## Acceptance criteria

1. The Main Line Mode dropdown always contains exactly PMC and Execution after
   its section loads, independent of reusable master data.
2. The Mode tab never displays **Required reusable Modes are unavailable**,
   **Execution is missing**, **Add reusable Mode**, or equivalent reusable-data
   recovery copy.
3. With the modes catalog empty or failed, a Super Admin can add/edit fields for
   PMC and Execution and save them successfully.
4. After a successful Mode save, PMC and Execution remain editable in the same
   Draft, and a subsequent edit-save cycle succeeds using the refreshed section
   and aggregate versions without duplicate configurations or lost fields.
5. New saves persist `modeKind: "pmc"` or `modeKind: "execution"`, never a
   reusable `modeId` for canonical dynamic Mode configurations.
6. PMC and Execution configurations coexist with unequal IDs, labels, and
   values without cross-mode leakage.
7. Existing resolvable `modeId` configurations load under the correct fixed
   choice and convert only on the next successful user save.
8. Existing unresolved legacy configurations retain their fields and can be
   removed without blocking canonical PMC/Execution editing.
9. Active and archived legacy revisions remain readable and immutable without
   background writes.
10. Reusable estimation values no longer shows a Modes tab/category or any Mode
   add/edit/archive workflow; UOMs, Vendors, Taxes, Priorities, and Surfaces are
   unchanged.
11. Overview uses fixed PMC/Execution labels and shows only saved, non-empty
    information for the selected kind.
12. Context/preview requests using `modeKind` return only the exact selected
    dynamic configuration; requests containing both `modeKind` and `modeId`
    fail validation.
13. Canonical `modeKind` configurations do not create reusable Mode archive
    blockers; legacy `modeId` references retain existing safety.
14. Draft-only mutation, CAS conflicts, audit behavior, ordered Mode save,
    query invalidation, and unrelated Advanced keys remain correct.
15. Add/edit/switch/save/re-edit/re-save, empty, loading, catalog-failure, legacy, conflict,
    read-only, keyboard, accessibility, desktop, and mobile tests pass.
16. Backend and frontend focused suites, typechecks, builds, relevant
    replica-set integration, and repository hygiene checks pass; unrelated
    pre-existing failures are reported exactly.

## Assumptions and constraints

- “Not reusable, only for Mode Tab” applies specifically to PMC/Execution
  dynamic field ownership and their Super Admin management experience.
- Existing generic backend Mode records may remain temporarily for historical
  price/context compatibility, but they are not a prerequisite or management
  surface for the Main Line Mode tab.
- No production migration or deployment is authorized.

## Open decisions

None. A closed Mode-tab enum with legacy read compatibility is the only option
that removes the current reusable prerequisite without forcing a production
data operation.

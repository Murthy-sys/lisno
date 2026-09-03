# Mode Main Line Priority Design

**Status:** Approved and implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Scope:** Configuration → Main Basket → Main Line → Mode, Priority master
identity, Overview persistence, and estimator knowledge context

## Decision summary

Add one **Priority** dropdown in Mode immediately after **Specifications**.
The value applies to the whole Main Line and therefore to every Specification;
it is not repeated on each Specification row.

The control reuses the existing authoritative `overview.payload.priorityId`
field and the existing Priority master records. The selectable values are, in
this exact order:

1. **Non Negotiable**
2. **High**
3. **Medium**
4. **Low**

The browser persists only the selected stable Priority master ID. The backend
resolves that ID to a safe semantic identity for estimator context so an
estimator does not have to infer priority from option order, UI color, or a
mutable label.

Priority remains optional in this change: no value is selected automatically,
and a missing Priority does not add a new activation blocker. This preserves
existing Draft and Active revisions. Making Priority mandatory can be added
later as a separate workflow decision.

## Goal

Give a Super Admin a clear, single place to classify the importance of a Main
Line while configuring Mode, and make that classification available as
unambiguous metadata in estimator knowledge context without changing any
financial calculation.

## Current behavior and evidence

- The data model already stores one Main-Line-level Priority as
  `overview.payload.priorityId`; Overview validation accepts that reference.
- Main Line list summaries and Priority filtering already derive their single
  `priorityId` from Overview.
- The approved Overview redesign intentionally hid the Priority control while
  preserving its stored value. Priority must remain absent from Overview.
- Mode currently loads, edits, and saves Advanced, Pricing, and Quantity &
  margin. It does not load the Overview envelope that owns `priorityId`.
- Specifications are descriptive Pricing-section rows and do not contain a
  Priority field.
- Estimator knowledge context currently carries the raw Overview payload when
  Overview is configured, so it may expose an opaque `priorityId`, but it does
  not resolve the Priority name/code/tier.
- No current production estimator consumes this knowledge-context service.
  This change can make Priority machine-identifiable at that boundary, but it
  cannot truthfully claim to alter current estimate output until a downstream
  estimator is connected to the context.
- The current bootstrap guarantees only the reusable **Medium** Priority.
  Non Negotiable, High, and Low are not guaranteed in every environment.
- Priority reference/archive coordination does not currently have the same
  dependency-epoch protection used by UOM and Mode, leaving a possible race
  between a first reference and an archive.

## Proposed user experience

### Position and hierarchy

```text
Mode
├─ Advanced
├─ Pricing
│  ├─ Specifications
│  ├─ Priority
│  ├─ Vendors
│  └─ Price versions
└─ Quantity & margin
```

Priority is a compact single-field subsection after the Specifications
repeater and before Vendors/Price versions. It is not restored on Overview and
is not placed inside an individual Specification card.

### Copy and controls

- Subsection heading and field label: **Priority**
- Helper text: **Set the priority for this Main Line so the estimator can
  identify it. Applies to all Specifications.**
- Empty editable option: **Select priority**
- Read-only/summary empty value: **Not configured**
- Options: Non Negotiable, High, Medium, Low, in that order
- No **Add Priority** action appears beside this fixed Main Line control.
- Option meaning must be conveyed by text. Color may be supplementary in a
  future custom control, but no requirement depends on colored native options.

### Interaction behavior

- Selecting or clearing Priority marks only the supporting Overview draft
  dirty, while the existing **Save Mode** command remains the single save
  action for the page.
- Save order is `advanced → pricing → overview (Priority) → quantity-margin`.
  Each section retains its own section version and the revision aggregate
  version; acknowledged earlier saves are not falsely rolled back after a
  later failure.
- Discard restores the latest authoritative Priority with all other Mode
  drafts.
- A conflict compares user-facing Priority labels and never shows a raw ID.
- Saving Priority submits the complete latest Overview payload and preserves
  UOM plus every hidden compatibility property exactly.
- Active, superseded, archived, or unauthorized revisions remain read-only.

## Priority catalog and semantic contract

The four choices are canonical Priority master identities, not frontend-only
strings. Their semantic contract is:

| Semantic tier | Code | Display label | Order |
| --- | --- | --- | ---: |
| `non_negotiable` | `NON_NEGOTIABLE` | Non Negotiable | 0 |
| `high` | `HIGH` | High | 1 |
| `medium` | `MEDIUM` | Medium | 2 |
| `low` | `LOW` | Low | 3 |

Rules:

- Each canonical value has a stable master ID. The existing
  `knowledge-priority-bootstrap-medium` identity is retained for Medium rather
  than replaced.
- `overview.payload.priorityId` remains the only stored Main Line selection.
- The backend owns the ID-to-tier mapping and exposes the tier with the master
  DTO (or an equivalent backend-owned catalog projection). React must not map
  a visible label to an ID or infer semantics from `displayOrder`.
- This Main Line selector offers only active canonical values. Other existing
  Priority masters remain readable for compatibility and remain available to
  existing features that already support them, but they are not new choices
  in this control.
- An inactive, archived, missing, or non-canonical saved selection remains
  visible by its resolved label when possible, or as **Unavailable priority**;
  it is not silently cleared and is not selectable as a replacement.
- Canonical code, semantic tier, label, ordering, and active availability are
  system contract fields. Generic master edits must not silently change their
  meaning or archive a canonical value.

The tiers are classification metadata in this scope. They do not define an
automatic inclusion/exclusion algorithm. In particular, **Non Negotiable** is
reported as that semantic tier, but this change does not manufacture price,
quantity, or estimate-selection behavior that no estimator currently owns.

## Data and API behavior

### Persistence

- Reuse `overview.payload.priorityId`; do not add Priority to Pricing,
  Advanced, Quantity & margin, or a Specification row.
- Clearing the dropdown removes/clears only `priorityId` according to the
  established Overview payload convention.
- Backend reference validation remains authoritative. A newly selected ID must
  resolve to an active canonical Priority.
- Unrelated Overview values survive Priority writes, rebases, conflicts,
  retries, duplication, and revision history.

### Mode supporting draft

- Mode loads the Overview section envelope in addition to its three visible
  section envelopes.
- Only the Priority projection of that Overview draft is rendered in Mode.
- Overview loading/error/version state participates in Mode preflight, dirty
  tracking, save, partial-failure reporting, discard, and conflict review.
- A Priority edit is rebased at field level so a refreshed Overview response
  cannot overwrite an unsaved local Priority or discard a newer UOM value.
- The implementation must never write an item-list `priorityId` back as if it
  were an editable section; the versioned Overview envelope is authoritative.

### Estimator context

When Priority is configured, the safe active-revision context retains
`overview.priorityId` for compatibility and adds a resolved response-only
identity equivalent to:

```json
{
  "priorityId": "<stable-priority-id>",
  "priority": {
    "id": "<stable-priority-id>",
    "tier": "high",
    "code": "HIGH",
    "name": "High"
  }
}
```

When Priority is not configured, `priorityId` remains absent/null according to
the existing payload contract and the resolved `priority` value is absent or
null consistently. Context must fail closed or report an unresolved reference
for an invalid configured ID; it must not guess a tier from a label.

Priority does not alter slab rates, unit rates, quantity, estimated cost, GST,
margins, markup, wastage, effective-price selection, or any server calculation
preview formula.

## Catalog provisioning and rollout

- Fresh bootstrap data includes all four canonical records and preserves the
  current Medium ID.
- Existing environments use an idempotent, audited provisioning operation with
  a dry-run mode. The dry run reports exact matches, missing values, code/name
  conflicts, reference conflicts, and proposed writes.
- The operation never deletes, archives, or rewrites non-canonical Priority
  records automatically and never remaps existing Main Line references.
- Applying provisioning to any shared or production-like environment requires
  separate explicit authorization, a backup/rollback procedure, and a final
  clean dry run. Approval of this design or its later implementation plan does
  not authorize that data mutation.
- Frontend empty/error handling remains usable before provisioning; the UI must
  not fabricate IDs when canonical values are unavailable.

## Concurrency and integrity

- Priority archive/update protection coordinates with reference creation using
  the established dependency-epoch pattern or an equivalent transaction-safe
  invariant.
- A first Overview reference racing an archive cannot commit both outcomes.
- Reference checks include the selected Overview Priority while preserving the
  existing recommendation Priority references.
- Stable IDs, not names, remain the join key through list, detail, mutation,
  audit, conflict, and context paths.
- Existing authorization and operation registry rules remain authoritative;
  frontend visibility is not authorization enforcement.

## UI states and accessibility

- **Loading:** disabled select and `Loading Priority options…`.
- **Empty catalog:** disabled select and `No Priority options are configured.`
- **Catalog error:** preserve a saved selection; show
  `Priority options could not be loaded.` with **Retry Priority**.
- **Stale catalog:** keep the cached selection visible and announce
  `Priority options may be out of date.`
- **Unavailable saved value:** show its resolved name when available, otherwise
  **Unavailable priority**; never expose the raw ID.
- **Saving:** disable the control with the rest of the active save operation.
- **Success:** retain the selection and use the established `Mode saved.` live
  announcement.
- **Validation/conflict:** retain local edits and focus or identify the
  Priority control when it is the actionable field.
- **Read-only/no permission:** disable the control and expose no mutation or
  quick-add action.
- Use a native labelled select, connect helper/error text with
  `aria-describedby`, preserve logical keyboard/focus order after
  Specifications, and provide at least a 44 px target.
- The field is bounded on desktop and full-width without horizontal overflow
  at tablet and mobile widths.

## Compatibility

- Existing Draft and Active revisions with no Priority remain valid and are
  not backfilled automatically.
- Existing saved Priority IDs remain intact, including inactive or
  non-canonical legacy values.
- Priority remains hidden from Overview, so the recently approved Overview
  simplification is preserved.
- Main Line list filtering continues to use the same `priorityId` identity.
- Existing recommendation-row Priority behavior remains separate and is not
  converted into Main Line Priority.
- No schema rewrite of revision payloads and no automatic Active-revision
  mutation is permitted.

## Scope

- One Main Line Priority dropdown in Mode after Specifications.
- Overview-backed draft/save/conflict integration inside Mode.
- Exact canonical option catalog and compatibility presentation.
- Resolved Priority identity in estimator knowledge context.
- Priority reference/archive race hardening.
- Backend/OpenAPI/frontend contract alignment and focused regression coverage.
- A safe provisioning artifact for missing canonical master values.

## Non-goals

- Per-Specification Priority.
- Priority-specific colors or a custom dropdown widget.
- An **Add Priority** quick action in Mode.
- Automatic Priority defaults or a new activation blocker.
- Changes to pricing, slab calculations, estimated cost, tax, margins, or
  financial lineage.
- Wiring a currently separate production estimator to knowledge context or
  defining how it changes estimates after reading a tier.
- Automatically deleting, archiving, renaming, or remapping existing custom
  Priority data.
- Deployment, production provisioning, seeding, migration execution, commit,
  or push.

## Options considered

### A — Reuse Overview Priority with canonical master semantics (selected)

Preserves the existing source of truth and list/filter behavior, gives the
estimator a deterministic resolved tier, and avoids duplicating Priority into
Specifications. It requires Mode to coordinate an additional versioned section
and requires safe catalog provisioning.

### B — Hard-code a frontend enum and store its label/code

Looks smaller but duplicates the master system, weakens stable-ID lineage, and
lets API clients and the UI disagree. Rejected.

### C — Store Priority on every Specification

Allows finer granularity but changes the Specification contract, creates an
ambiguous aggregate Main Line Priority, and requires new list/filter/context
rules and migration decisions. Rejected because the requested control and the
existing model are Main-Line-level.

## Risks and mitigations

- **Whole-Overview overwrite:** use field-aware rebase and the authoritative
  Overview version; preserve hidden fields.
- **Partial Mode save:** preserve per-section acknowledgements and clearly keep
  the remaining local Priority edit after a later failure.
- **Missing master values:** show explicit loading/empty/error states and use
  dry-run-first provisioning rather than client-generated IDs.
- **Semantic drift:** resolve a backend-owned canonical tier; never infer from
  label, color, or sort position.
- **Reference/archive race:** coordinate dependency epoch and cover it with a
  replica-set integration test.
- **Expectation that estimates immediately change:** state and test that this
  task enriches context metadata only; downstream estimator behavior is not
  silently invented.
- **Dirty worktree overlap:** implementation must preserve the current
  configurable-slab and Overview simplification edits in the same frontend and
  backend files.

## Acceptance criteria

1. Mode displays one Priority field immediately after Specifications and
   before Vendors/Price versions; Overview still displays no Priority field.
2. The selectable choices are Non Negotiable, High, Medium, and Low in that
   exact order, use stable Priority IDs, and have no automatic default.
3. Priority applies to the Main Line and all Specifications; no Specification
   payload gains a Priority property.
4. Selecting, saving, reloading, clearing, discarding, and resolving a conflict
   preserve the correct Priority and all unrelated Overview fields.
5. Mode save includes the versioned Overview envelope with correct aggregate
   CAS and truthful partial-failure behavior.
6. Active canonical values are selectable; inactive/missing/non-canonical
   saved values remain readable but cannot be newly selected, and raw IDs are
   never shown.
7. Authorized non-archived Drafts are editable; all established read-only and
   permission states remain enforced by the backend and reflected by the UI.
8. Safe estimator context resolves a configured Priority to stable ID, tier,
   code, and name while retaining `priorityId`; it never infers semantics from
   presentation.
9. Priority changes do not change any amount, quantity, tax, margin, markup,
   slab, effective-price, or preview result.
10. A concurrent first reference and archive cannot both succeed.
11. Fresh bootstrap data defines the four canonical records; an existing-data
    dry run reports what would change without mutating data, and no shared or
    production data operation is executed without separate authorization.
12. Loading, empty, error/retry, stale, unavailable, saving, success, conflict,
    and read-only states are accessible and responsive at 1440, 1024, 768, 390,
    and 320 px without horizontal overflow.
13. Focus order places Priority after Specifications; the control has an
    accessible label, linked help/error messaging, keyboard operation, and no
    color-only meaning.

## Verification requirements

- Backend validation/service tests for active canonical, inactive, missing,
  unchanged legacy, clear, and unauthorized Priority writes.
- Backend context tests for each tier, no Priority, unresolved Priority, safe
  response shape, and unchanged financial preview output.
- Replica-set integration coverage for first-reference/archive concurrency and
  section/aggregate CAS.
- Bootstrap/provisioning tests for fresh create, exact reuse, dry run,
  conflicts, idempotent rerun, and no implicit deletion/remap.
- Frontend interaction tests for option order, stable-ID PUT, full Overview
  payload preservation, save ordering, partial failure, conflict, discard,
  and a second save without remounting.
- Frontend tests preserve the assertion that Priority is absent from Overview
  and cover catalog loading/error/stale/unavailable plus Draft/read-only and
  permission states.
- Rendered keyboard/accessibility checks and the required responsive width/state
  matrix.
- Focused backend/frontend suites first, followed by full typecheck, tests, and
  build for both workspaces, then `git diff --check` and `git status --short`.

## Assumptions

- The user intends one Main-Line-level Priority because the requested control
  is singular and the existing canonical model already has one `priorityId`.
- “Help the estimator identify Priority” means expose deterministic metadata;
  it does not authorize a new financial or selection algorithm.
- Blank Priority remains allowed because mandatory activation behavior was not
  requested and would change existing revision workflow.
- The four shown labels are exact product values; “Non Negotiable” uses that
  spelling and capitalization.

## Open decisions

No decision blocks approval. If Priority must become mandatory before
activation or must directly change estimator selection, that is a material
scope change and this specification must be revised before implementation.

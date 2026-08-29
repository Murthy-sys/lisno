# AI Estimator Knowledge Automatic Display Order — Design Specification

**Date:** 2026-08-29  
**Status:** Approved and implemented locally

## 1. Decision summary

New AI Estimator Knowledge Base values will no longer ask the Super Admin to enter a display order. Main Baskets, Main Lines, and reusable values will be appended automatically after the highest existing position in their own ordering scope.

Recommended behavior:

- Remove **Display order** from all create and Quick Add dialogs.
- Keep `displayOrder` as an internal server-managed persistence and response field so existing sorting remains stable.
- Allocate the next value transactionally on the server; the frontend must not inspect existing lists or calculate an order.
- Preserve the current edit-only display-order control as the sole deliberate reordering mechanism. Approval of this specification confirms that creation is automatic while explicit reordering remains available only when editing an existing Basket or reusable value.
- Keep accepting explicit `displayOrder` from older API clients temporarily as a deprecated compatibility override; new Lisno frontend requests omit it.

## 2. Goal

Make creation sequential and effortless: when a user adds a Main Basket, Main Line, UOM, Vendor, Tax, Priority, Surface, or Mode, the new record appears after the existing records without asking for an ordering number.

Measurable outcome:

- No create or Quick Add workflow exposes a Display order field.
- Every successful create receives a server-assigned safe-integer order after the historical high-water position for its scope.
- Concurrent successful creates in the same scope receive distinct consecutive positions.

## 3. Current behavior and evidence

### Frontend

- `BasketEditorDialog` uses one form for create and edit. It defaults Display order to `0`, requires the field, and always sends it for both operations.
- `KnowledgeMasterEditorDialog` covers all reusable values and workspace Quick Add operations. It also defaults Display order to `0`, validates it, renders it as required, and always sends it.
- The Add estimation item/Main Line dialog already hides display order and submits only the Basket, name, and description.
- Frontend lists and selectors do not sort locally; they trust backend response order.

### Backend

- Basket, Main Line, and reusable-master create schemas currently transform an omitted display order into `0`.
- Their services persist `input.displayOrder ?? 0`.
- Therefore Main Line creation already looks automatic in the UI but is not append-safe: omitted values become `0` and can appear before or among existing data.
- Lists sort by `displayOrder` and deterministic secondary keys.
- The Main Line duplicate path copies the source order instead of appending the duplicate.
- Models require a non-negative safe-integer `displayOrder`, and existing order indexes are intentionally non-unique.

## 4. Actors and permissions

- Super Admin remains the only actor authorized to create, edit, archive, or duplicate these Knowledge Base configuration records.
- This change does not alter route-operation authorization, role visibility, audit identity, or disclosure behavior.
- Backend authorization remains authoritative.

## 5. Scope

### Included

- Main Basket creation.
- Main Line/estimation-item creation within a Basket.
- Main Line duplication within its target Basket.
- Reusable-value creation and Quick Add for:
  - UOM;
  - Vendor;
  - Tax rule;
  - Priority;
  - Surface;
  - Mode.
- Create/update request validation and OpenAPI descriptions for `displayOrder`.
- Transactional sequence persistence, audit evidence, and concurrency tests.
- Create and Quick Add UI, payload, accessibility, and regression tests.

### Non-goals

- Removing `displayOrder` from stored documents or response resources.
- Renumbering or backfilling existing records.
- Replacing edit-only reordering with drag-and-drop.
- Making display order unique across legacy data.
- Changing Tax Version ordering; Tax Versions use immutable `versionNumber` and have no `displayOrder`.
- Changing Execution Step order or the move-up/move-down ordering of nested section rows.
- Changing the existing Estimator, Finance, Procurement, project workflows, or AI estimation calculations.
- Changing the global `/items` search order, which currently uses recent update time rather than Basket-scoped display order.

## 6. User experience

### Create and Quick Add

- Add Main Basket contains Basket name and Description only.
- Add estimation item continues to contain Main Basket, Main Line name, and Description only.
- Add/Quick Add reusable-value dialogs contain Code, Name, type-specific fields, and Description; Display order is absent.
- Submit availability must not depend on hidden display-order state.
- No helper text or accessibility relationship may reference a removed order control.
- After success, the existing query invalidation/refetch behavior shows the new value in its server-assigned position and selects it where Quick Add already does so.

### Edit

- Edit Main Basket and Edit reusable-value dialogs retain Display order for deliberate reordering.
- The edit field continues to accept a non-negative safe integer and use the existing version/CAS contract.
- No Main Line edit-order UI is introduced by this change.

### UI states

- Existing loading, busy, API-error, focus restoration, keyboard, narrow-width, and dialog accessibility behaviors remain unchanged.
- Allocation failure is shown through the existing inline API error region; the dialog stays open with user-entered values intact.

## 7. Ordering contract and invariants

### Independent scopes

- `baskets`: one global Basket sequence.
- `main-lines:<basketId>`: one Main Line sequence per Basket.
- `masters:uoms`, `masters:vendors`, `masters:taxes`, `masters:priorities`, `masters:surfaces`, and `masters:modes`: one sequence per reusable-value family.

### Allocation rules

1. The first automatic creation in a scope lazily observes the maximum persisted `displayOrder` across every status, including inactive and archived records. An empty scope starts at `0`.
2. A transactional sequence record stores the scope's high-water order.
3. Each later automatic creation atomically increments that sequence and receives the next value.
4. Archived records and physical gaps never cause order reuse.
5. A Main Line duplicate receives the next order in the target Basket; it never copies the source order.
6. If the high-water value is already `Number.MAX_SAFE_INTEGER`, creation fails atomically with a stable `DISPLAY_ORDER_EXHAUSTED` conflict. It must not wrap, round, or create a partial aggregate/audit record.
7. The allocated order, created resource, child aggregate records where applicable, and audit event commit in the same Mongo transaction.

### Compatibility overrides

- `displayOrder` remains optional in create/update service input during a compatibility period.
- Route schemas stop injecting a default `0`.
- If an older client explicitly supplies a valid order on create, the backend honors it and advances the scope high-water mark to at least that value.
- If an explicit order is supplied on update, existing CAS-protected reordering remains supported and advances—but never decreases—the high-water mark.
- Omitted update order preserves the existing resource value.
- The new frontend omits `displayOrder` from every create payload and includes it only for an existing record being deliberately reordered.

## 8. Data and transaction design

- Add one internal sequence model/collection keyed by the unique ordering-scope ID with a required non-negative safe-integer high-water value and timestamps as appropriate.
- Reuse the repository's established transactional baseline-plus-sequence pattern rather than performing an unguarded maximum read followed by insert.
- Both direct-Mongoose services share one allocator helper and pass their existing Mongo session.
- Mongo replica-set transactions remain required; transaction semantics must not be weakened for non-replica environments.
- Resource models and existing non-unique sorting indexes remain unchanged.
- Audit create events include the assigned `displayOrder`; Main Line create/duplicate audit payloads are aligned with Basket/master audit evidence.

## 9. API and OpenAPI impact

- Create requests: `displayOrder` remains optional and deprecated for backward compatibility; it has no default.
- Update requests: `displayOrder` remains optional for edit-only reordering.
- Response resources: `displayOrder` remains required because it is server-resolved state used for ordering and diagnostics.
- Route and OpenAPI bounds align to `0..Number.MAX_SAFE_INTEGER`.
- Documentation states: “Assigned automatically after existing values when omitted.”
- No endpoint path, stable ID, version/CAS field, status enum, or pagination shape changes.
- Frontend request types remain compatible but create call sites omit the optional field.

## 10. Existing data, rollout, and rollback

- No migration or backfill is required.
- Sequence records initialize lazily from persisted maxima, so existing manual and bootstrap orders remain unchanged.
- Bootstrap manifests and guarded bootstrap digests remain unchanged.
- Deployment compatibility:
  - backend-first is safe because older frontends may continue sending explicit `0`;
  - frontend-first remains accepted by the old backend but does not provide correct append ordering until the backend is deployed, so backend-first is preferred.
- Rolling back application code leaves sequence documents inert. They must not be deleted during normal rollback because they preserve high-water history.
- No production sequence initialization or mutation is authorized by this specification.

## 11. Options and tradeoffs

### Option A — Transactional per-scope sequence (recommended)

- Guarantees distinct consecutive orders for concurrent creates.
- Preserves existing order and needs no backfill.
- Adds one small internal collection/model and shared allocator.

### Option B — Read current maximum and store maximum + 1

- Smaller implementation, but two concurrent transactions can read the same maximum and create duplicate orders because resource IDs differ and order indexes are non-unique.
- Rejected because it does not guarantee the requested sequential behavior.

### Option C — Ignore display order and sort only by creation time

- Removes allocation infrastructure, but changes the meaning/order of all existing data and discards deliberate bootstrap/manual ordering.
- Rejected because it is not backward compatible.

## 12. Risks and controls

- **Concurrent create collision:** controlled by a shared transactional sequence document per scope and transaction retry behavior.
- **Legacy explicit clients:** controlled by accepting deprecated overrides and advancing the high-water mark.
- **Archived or deleted rows:** high-water values are never reduced or reused.
- **Counter/resource divergence:** controlled by using the same transaction and testing audit/resource failures for rollback.
- **Integer exhaustion:** explicit conflict before mutation.
- **Dirty worktree regression:** existing uncommitted pricing, workspace, image, and styling changes must be captured and preserved; display-order writers may not overwrite or reformat them.
- **Scope creep into existing Estimator:** prevented through frozen-path diff and forbidden-import audits.

## 13. Acceptance criteria

1. Add Main Basket has no Display order field and sends no `displayOrder`.
2. Add estimation item/Main Line continues to have no Display order field and sends no `displayOrder`.
3. Add and Quick Add dialogs for all six reusable-value types have no Display order field and send no `displayOrder`.
4. Edit Main Basket and Edit reusable-value dialogs retain explicit reordering with version/CAS protection.
5. An empty scope assigns order `0`; a scope whose historical maximum is `10` assigns `11`.
6. Inactive and archived records participate in initial high-water calculation.
7. Main Line ordering is isolated per Basket.
8. Main Line duplication appends in the target Basket rather than copying the source order.
9. Two concurrent automatic creates in one scope receive distinct consecutive orders and both complete atomically.
10. Creates in different scopes do not block or alter each other's sequences.
11. Older clients supplying an explicit valid order remain compatible and advance the sequence high-water mark.
12. Allocation exhaustion, identity conflict, audit failure, stale update, and aggregate failure leave no partial resource, child record, audit record, or counter advance.
13. List responses and selectors preserve backend order after mutation/refetch; the frontend performs no order calculation.
14. OpenAPI shows optional/deprecated request order with no default, safe-integer bounds, and required response order.
15. Existing stored/bootstrapped orders require no migration and remain unchanged.
16. Dialog keyboard/focus, accessible names, inline errors, narrow layouts, and axe checks remain green.
17. Existing Estimator paths and behavior remain untouched and their regression tests pass.

## 14. Assumptions and open decisions

- “Automatically next to existing” means append after the historical high-water position within the relevant scope, not alphabetic insertion.
- Approval confirms the recommended create-only simplification: Display order disappears from create/Quick Add, while edit-only manual reordering remains available for correcting existing order.
- No further product decision is open once this specification is approved.

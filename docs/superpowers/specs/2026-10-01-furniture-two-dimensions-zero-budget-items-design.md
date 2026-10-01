# Furniture measurements and zero-value estimate items

Status: approved and implemented; focused verification passed on 2026-10-01.

## Goal

In the **Collection of existing furniture dimensions** action, collect Length, Width and UOM for dimensional items without a Height field. Do not ask the team to measure or procure approved-estimate items whose estimated value is ₹0.00. Keep the approved estimate, submitted evidence and procurement history intact.

## Current behavior and evidence

- The Designer panel in `frontend/src/features/workflow/FurnitureDimensionsEditor.tsx` renders Length, Width, Height and UOM for each dimensional item. Its draft parser requires all three numbers. The action API type, backend Zod input and stored-event schemas, persisted workflow item type, review table and OpenAPI contract also require Height. Removing only the input would leave submission blocked.
- `backend/src/domain/workflow-estimate-items.ts` currently places every `included` approved line into the furniture room's `estimateItems`, regardless of its `amount`. `canonicalFurnitureItems` in `design-workflow-state.service.ts` then requires every such item in a submitted room. This explains why the pictured 400 sqft Gypsum item is requested even though its budget is ₹0.00. Quantity zero and estimated value zero are distinct conditions.
- Procurement's approved snapshot in `backend/src/services/procurement.service.ts` converts each included line's `amount` to integer paise and projects zero-value lines into `sections[].items`. `frontend/src/features/procurement/EstimateProcurementItems.tsx` renders all of them and offers **Add item**. `project-procurement.service.ts` currently resolves any approved line key when creating or assigning a child item.
- Existing tests deliberately cover zero-quantity selections and historical furniture approvals. Previously submitted furniture rows may contain Height and zero-value line IDs. The worktree has many unrelated and relevant uncommitted edits; implementation must preserve them. No project data was changed during this investigation.

## Scope and behavior

1. Treat **estimated value equal to zero paise in the canonically approved estimate snapshot** as the exclusion rule for new furniture-measurement and procurement actions. Do not infer it from quantity, rate, item name, catalogue, a mutable estimate draft, or frontend formatting. A positive-value item remains actionable even if its estimate quantity is zero. Missing, invalid or conflicting approved amount data must not silently become zero; retain the established source-conflict behavior or a safe explicit unavailable state.
2. In the furniture declaration and resubmission flow, show and require Length, Width and an active configured UOM for dimensional items. Point-count items continue to require their positive whole-number count and UOM. Remove Height from the editable panel, draft, validation text and new request payload. The backend accepts new dimensional submissions without Height, validates positive finite Length and Width, and never inserts a fabricated Height value.
3. Keep existing saved Height values in immutable events and current pending/approved submissions. Historical review can show Height when it was actually recorded; a new two-dimensional submission shows only Length and Width. Existing pending submissions containing Height, including a zero-value item, remain reviewable under their original approved source and evidence rules. A returned submission uses the new actionable set on resubmission without rewriting the earlier revision.
4. Exclude zero-value approved lines from the furniture item's editable list and selected-item count. A room with no positive-value items cannot be selected as requiring measurements in a new declaration; it must not trigger a missing-measurement blocker. Preserve the room's approved length/width reference and the existing no-furniture workflow. Keep room and item IDs stable for all remaining lines, including legacy IDs derived from original snapshot indexes.
5. In **Procurement → Dashboard → Projects → Estimated items**, omit zero-value estimate parent rows and empty sections from the actionable list, count, search results and assignment choices. Do not show an **Add item** action for a zero-value source. The backend rejects new procurement child creation or reassignment to such a source, including direct API requests. Existing children under a zero-value line remain findable in the project's procurement item history or reassignment view with their source lineage and amounts; they are not deleted, silently orphaned, or included as a new order solely because the parent row was hidden.
6. Keep approved estimate snapshots, finance totals, project completion's zero-value `not_required` logic, purchase-order history, workflow proof, authorization, CAS/idempotency and audit behavior unchanged except where the new input and eligibility rule requires an explicit contract adjustment. No live data rewrite or migration is planned.

## Approach and contract

- Use the pinned approved estimate amount and the existing rupees-to-paise conversion at the backend boundary. Share one eligibility predicate across furniture source selection and procurement write checks, while keeping the complete approved line set available for immutable history and financial reconciliation.
- Update frontend request/read types, backend input and stored-event validation, and OpenAPI together. Height becomes optional only for the historical dimensional record shape; new UI requests omit it. Keep mixed-mode rejection: a dimensional row cannot carry point quantity, and a point row cannot carry dimensional fields.
- Keep zero-value procurement lines in the approved financial snapshot. Filter the actionable presentation and assignment options, and enforce the rule server-side for writes. If a zero-value line already has a child procurement record, present that record in a clearly identified history/reassignment area without enabling another item under the zero-value source.
- Continue using existing endpoints, room IDs, estimate line keys and version checks. No new dependency, role, endpoint or database migration is expected.
- An accepted room returned before this change, containing only zero-value approved items, can be explicitly resolved by the assigned Designer through the existing `furniture_upload` action using `resolveReturnedZeroValueRoomIds`. This no-file action verifies the original submission, retains its evidence and Client response, records an audit event, and marks only those rooms optional.
- Existing zero-linked procurement children remain visible for reassignment. The project purchase-order preparation omits them from new request item sets and planned totals, while approved estimate budgets and already approved purchase-order commitments remain intact.

## Risks and handling

- Filtering by `quantity === 0` would miss the pictured 400 sqft / ₹0.00 line and wrongly hide positive-value zero-quantity lines; tests must distinguish them.
- Changing the required item set can make a pending legacy Client review fail. Validate such a pending revision against the approved source and its original submitted identities, while new declarations and corrections follow the current eligible set. Never auto-approve or rewrite history.
- Hiding a zero-value parent must not conceal an existing procurement child, spend or purchase-order commitment. Keep those records accessible and reconcile their totals through the existing financial source.
- Open drawers can contain stale item IDs after a refresh. Existing stale-source/version handling must prevent submission against an obsolete set, with a clear refresh path.

## Acceptance criteria

1. A dimensional furniture item with positive approved value offers Length, Width and UOM, with no Height control or Height validation; a valid submission succeeds and Client review displays the submitted values. Existing submissions with recorded Height remain readable and approvable.
2. A 400 sqft approved item valued at ₹0.00 is absent from the editable furniture items and Procurement estimated-item list. Other positive-value items in the same room/section remain, with accurate counts and unchanged stable IDs. A zero-only room is not required for a new measurement declaration.
3. A positive-value zero-quantity line remains eligible, proving the rule uses estimated value. Invalid/missing amount data never gets silently classified as zero.
4. Direct procurement create/reassignment to a zero-value approved line is rejected; positive-value sources still work. Existing zero-linked procurement children, history and finance remain visible and unchanged.
5. Focused backend workflow/procurement and frontend rendered-interaction tests pass, including pending legacy approval and returned resubmission. Backend/frontend typechecks and builds pass, followed by a rendered desktop/mobile check of the panel and procurement list.

## Open decisions

None. The requested rule is based on the displayed estimated **value**, not the estimate quantity. Historical submitted records and financial lineage are preserved.

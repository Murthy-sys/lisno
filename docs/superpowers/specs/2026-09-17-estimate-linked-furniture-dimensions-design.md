# Estimate-linked furniture dimensions and compact workflow panel

## Authority and goal
User requests dimension entry for items selected in the estimate, followed by submission, and a more professional side panel with smaller fonts and checkboxes. Standing autonomous Mode A applies. Local implementation and verification; no deployment or production mutation.

## Evidence and approach
The current dimensions editor creates arbitrary item names and IDs after selecting a room. Workflow room options currently expose only room IDs/names. Approved estimate review snapshots contain selected line IDs, names/specifications, quantity and UOM; legacy line identity follows existing approved-estimate key generation. Existing estimates associate lines with room labels rather than room IDs, so the adapter must use the established deterministic room mapping and reject ambiguity rather than guess. The global checkbox primitive is 44px square; workflow panels inherit general drawer typography.

Expose a sanitized set of selected approved-estimate items for each room, using stable line IDs and the pinned approved source. Include all selected positive-quantity lines mapped to the room; do not infer furniture eligibility from names or silently hide custom items. Display item identity, estimated quantity and UOM as reference. Collect actual positive length/width/height and an explicit measurement unit for every selected item in submitted rooms. Estimate quantity/UOM are context, not actual dimension defaults.

## Contract and invariants
- `furnitureRooms[].estimateItems` exposes `{id,name,catalogueId,specification,quantity,uom}`. Upload item input is `{estimateItemId,length,width,height,unit}`; the server stores canonical `id = estimateItemId`, `estimateItemId`, and name with the entered dimensions. Legacy saved rows may omit `estimateItemId`.
- Approved estimate IDs/version remain the source of truth. Project/room/line references must be checked server-side; no name-based identity fallback in submissions.
- Add an estimate item reference to measurement rows; labels are resolved from canonical estimate data. Expose no pricing/private fields through the workflow projection.
- A selected room submits its full selected item set with proof; reject missing, duplicate, unrelated, excluded or stale items. No arbitrary item creation/removal in this editor.
- Existing Client approval/send-back, exact submission IDs, version/CAS, immutable history, proof access/cleanup and downstream gates remain intact.
- Returned linked revisions prefill by item ID. Historic unlinked measurements remain visible in history/review, but are not silently attached by matching names. Pending unlinked submissions require return/correction and a fresh linked submission before approval. Completed/approved history is not rewritten. No migration or backfill.
- Missing/ambiguous estimate items or room mapping produces an actionable blocked/empty state, not invented item names. Memory/Mongo source adapters stay aligned.
- Item mapping validation applies to furniture context only. Shared payment/financial source checks retain their existing approved-estimate checks and must not become blocked by an unrelated furniture item mapping problem.

## UI direction
Scope styling to workflow action panels. Compact 18px heading, 13px body/labels, 12px helper text, restrained borders and consistent spacing. Use 18px checkbox visuals inside 44px clickable labels. Desktop inputs can be compact; mobile controls stay comfortable and avoid focus zoom. Keep real labels, keyboard focus, dirty-draft protection and visible validation. Remove the technical workflow-version header. Organize fixed estimate item names above a concise dimension grid, with readable quantity/UOM reference and responsive stacking.

## Acceptance criteria
1. Selected estimate items appear automatically for each chosen required room with canonical names, quantity and UOM.
2. Uploader can enter actual dimensions and submit with proof; arbitrary/missing/foreign estimate items cannot be submitted.
3. Client sees exactly those item measurements and document, can approve/send back; linked correction drafts preserve values by ID and downstream work stays gated.
4. Legacy history is preserved, no label-based rebinding occurs, and ambiguous/stale source data fails safely.
5. Compact panel works at 360/768/1440px with usable keyboard/touch targets, no page overflow and no new accessibility violations.

## Verification and risks
Focused source mapping, authorization/lineage, submission/revision and replica-set tests; frontend rendered item-selection/correction/empty/stale tests; both typechecks/builds; actual browser width/interactions/accessibility; final baseline diff comparison. Primary risk is old label-only room association, handled by deterministic unique resolution and explicit failures. Deploy frontend/backend together after separate authorization.

The current estimate editor writes and restores exact room labels, including custom labels. No production historical dataset was inspected. Historical selected lines with unmatched or ambiguous room labels require approved-source reconciliation; this change deliberately does not use drawing/OCR fuzzy aliases to guess their ownership.

# Estimate references in the furniture-dimensions panel

Status: approved; Mode A implementation verified locally on 2026-09-30.

## Goal

In the “Collection of existing furniture dimensions” action panel, show the room dimensions and selected items recorded during estimation so the Designer can check the approved source while entering actual site measurements. Make the long form easier to scan with expandable room and item sections and a clear “Declare existing-furniture requirements” action.

## Current behavior and evidence

- Estimation records each room's `id`, label, length, width and area in `LeadEstimateWorkspace.tsx`. Its room editor labels length and width in feet. The estimator separately selects line items and quantities; only included lines become selected estimate items.
- The estimate stores `rooms` on the Estimate record. The project workflow resolves its canonical approved estimate and uses those room IDs plus approved line snapshots to build `furnitureRooms`. The current `WorkflowEstimateRoom` and frontend `FurnitureEstimateRoom` expose the room name and selected items, but omit estimated room length and width. Selected item names, specifications, quantities and units already reach the panel.
- `FurnitureDimensionsEditor.tsx` creates first-entry item Length, Width, Height, count and UOM drafts as blank values. It restores prior submitted measurements by estimate item ID for corrections. The estimate quantity is displayed only as reference. This explains why the screenshot shows “Estimate: 100 sqft” beside empty actual-measurement inputs.
- `WorkflowStageActions.tsx` presents all selected item fields in a long `ContextPanel` drawer. The primary declaration action sits in its footer; the screenshot shows the dense rows and a cramped footer. No live project record or production response was inspected.
- The worktree already contains the separate, completed Designer upload fix. In particular, `backend/src/repositories/memory.ts`, `backend/src/repositories/mongo.ts` and `frontend/src/features/workflow/projectWorkflowApi.ts` have prior changes that must be preserved. The furniture editor and action-panel targets currently have no local diff.

## Scope and requirements

1. Add optional, read-only estimated room length and width, in feet, to the existing project workflow `furnitureRooms` projection. Source them only from the canonically linked, Client-approved Estimate room with the same stable room ID. Keep memory and Mongo repositories, backend types, frontend DTO and OpenAPI aligned. Validate positive finite values before display; a missing or malformed room size is shown as unavailable and does not block the furniture action.
2. Preserve the current selected-item source: included lines from the approved estimate snapshot, with stable estimate item IDs, names, specifications, quantities, units and count-versus-dimensions mode. Do not fetch a mutable estimate draft or rebuild rows from labels in the browser. Show the estimated room length and width once in each room summary, and show each selected item's estimate quantity as reference.
3. Keep actual item measurements separate. First-entry Length, Width, Height, point count and configured UOM remain empty until the Designer enters them. Returned submissions restore saved values by item ID. Do not copy room dimensions into every item or infer height, convert units, change estimate quantity, or submit reference dimensions as actual measurements. The user selected the once-per-room reference behavior.
4. Redesign only this furniture entry panel's content and local styles. Use expandable room groups and compact expandable item rows so a room can be scanned without every input being visible at once. Each room summary shows its name, estimated dimensions or a clear unavailable state, and selected-item count. Each item summary shows its name, specification when useful and estimate quantity; its expansion contains the required actual-measurement controls and configured UOM/Add UOM action. Start with a useful first room and first item open; collapsing preserves unsaved values. Keep “No existing furniture dimensions are needed”, room selection, evidence upload, notes and correction feedback understandable in the same flow.
5. Keep the drawer footer's primary “Declare existing-furniture requirements” action visible, fully readable and keyboard reachable at desktop and mobile widths; pair it with Cancel and show submission blockers near the action. Prevent horizontal clipping of the reference quantity, fields, Add UOM and footer actions. Use the existing drawer, type, color and spacing tokens; no new visual framework or dependency.
6. Preserve existing backend validation, proof, authorization, version/CAS, idempotency, approval and immutable history behavior. Collapsed fields must remain part of the draft and submission. If submission validation finds an incomplete item hidden by a disclosure, open it and move focus to the relevant field or clearly linked error. Disabled/stale, UOM loading/error, returned, no-furniture and missing-estimate-source states remain usable and truthful.

## Product and technical approach

- Extend the existing approved-estimate room projection with an optional `estimateDimensions` object, for example `{ lengthFt, widthFt }`; absent means the approved estimate did not record a usable room size. The established workflow endpoint and furniture action payload remain the transport. Existing clients can ignore the optional field. No persisted schema change or migration is expected.
- Use native disclosure semantics or equivalent accessible buttons with `aria-expanded` and controlled regions. Visually distinguish the read-only estimate reference from editable actual values. Prefer restrained section rules, type hierarchy and spacing over additional cards or effects. Keep the drawer body scrollable and its footer stable.
- Do not change the action when no room requires dimensions: the existing no-furniture declaration remains possible under its current rules. A room with selected items but no valid estimated length/width still allows actual dimensions to be entered and submitted.

## Constraints, risks and failure handling

- The Estimate room structure is stored as mixed data and older records may omit, mis-type or contain invalid length/width values. The read projection must validate both numbers and omit unusable reference data without inventing a value. Estimate `sqft` may be a default even when length/width were never entered, so it must not be presented as a measured dimension.
- Approved line items are snapshotted in review rounds while room geometry comes from the linked Estimate record. Resolve the room reference through the same canonical approved Estimate and approved version checks used by the workflow; do not fall back to another project's room or a draft. Keep existing source-conflict behavior.
- Nested disclosure state can hide errors, lose focus or discard drafts if item components remount. Preserve draft state above the disclosures, expose validation, and test keyboard focus and re-opening.
- The footer can be obscured on narrow screens or by mobile safe areas. Check a long real-content room, small screens, enlarged text and the nested Add UOM panel during rendered QA.
- This request does not change estimate pricing, approval records, furniture submission semantics, the global drawer design, or the previously implemented Designer upload unlock.

## Acceptance criteria

1. An eligible Designer opening the action sees the same approved estimate rooms and selected item rows already used by the workflow, plus any valid estimated room length and width once per room, labeled in feet. A different project's rooms and excluded estimate lines never appear.
2. Estimate references are read-only. Actual item measurements start empty on first declaration and retain entered values across collapse/reopen, UOM creation and validation; returned drafts restore the correct saved values by stable item ID.
3. Rooms and item values are expandable, readable and keyboard operable. Missing estimated room dimensions produce an explicit unavailable reference without blocking a valid submission. Long names and quantities wrap without clipping at desktop and mobile widths.
4. The declaration button and Cancel remain visible and readable in the panel footer, with clear evidence/validation blockers. A hidden invalid item is revealed and reachable from its error; no-furniture and stale/error states keep their current safety behavior.
5. Existing furniture proof, UOM, point-count, Client review/approval and source/version enforcement continue to pass. Focused backend projection and frontend interaction tests, typechecks, builds and rendered responsive/accessibility checks pass on the integrated worktree.

## Open decisions

None. The user chose to show estimated room length and width once per room as reference, rather than prefill every item's actual-measurement inputs.

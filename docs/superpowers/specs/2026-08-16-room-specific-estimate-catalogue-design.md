# Room-Specific Estimator Catalogue

**Status:** Approved in conversation on 2026-08-16; awaiting written-spec review

**Scope:** Estimator/Sales estimate configuration and builder catalogue selection

**Reference:** `Lisno_Interior_Room_Wise_Measurement_Reference.pdf`, supplied by the user. The PDF is treated only as room, section, item, unit, and measurement reference data. Product behavior comes from the user's request and the decisions below.

## Purpose

Change the Estimator/Sales estimate builder so the active room determines which sections and items are available. The current builder creates the same global catalogue for every room, which allows unrelated choices such as kitchen work in a bedroom. The revised builder must show only the PDF-defined content related to the selected room.

The existing visual layout, CSS, property-type controls, room-adding flow, specifications, prices, saved-estimate workflow, and approval workflow remain in place.

## Approved User Experience

The estimator continues to:

1. Select a property type.
2. Add the required rooms.
3. Enter room dimensions.
4. Select commercial scopes.
5. Continue to the estimate builder.
6. Select a room from the existing left-side room list.

The builder then renders only the sections and rows for that active room:

- **Master Bedroom** shows the Master Bedroom reference.
- **Bedroom 2**, **Bedroom 3**, and future non-master bedroom instances show the same standard Bedroom reference.
- **Living & Dining**, **Kitchen**, **Master Bathroom**, **Common Bathroom**, **Balcony / Utility**, **Foyer / Entrance**, **Home Office / Study**, and **Custom Room** each show their corresponding reference.

Changing the active room changes the visible sections without resetting selections made for any other room. No unrelated room rows are added to a new estimate.

The existing commercial scope toggles remain a filter. A room-local section may contain items from more than one commercial scope; disabled-scope items are removed, and a room-local section with no remaining rows is not rendered. Scope filtering must never introduce items from another room.

Property-type selection does not automatically create rooms in this change. The source PDF does not define an authoritative BHK-to-room composition, and the user requested room-selection-driven content rather than automatic room generation.

## Room Reference Map

| Current room `typeId` | Room reference | Section headings | Item count |
|---|---|---|---:|
| `living` | Living & Dining | False Ceiling; Flooring; Wall & Decorative Finishes; TV / Entertainment; Dining & Furniture; Electrical & Lighting | 35 |
| `master` | Master Bedroom | False Ceiling; Flooring; Carpentry & Storage; Wall Finish; Electrical & Soft Furnishing | 30 |
| `bedroom2`, `bedroom3` | Standard Bedroom | False Ceiling; Flooring; Carpentry; Wall Finish; Electrical & Soft Furnishing | 30 |
| `kitchen` | Kitchen | Modular Cabinetry; Shutters & Finishes; Countertop & Backsplash; Hardware & Accessories; Appliances & Plumbing | 35 |
| `bath_m` | Master Bathroom | Civil & Surface; Vanity; Sanitaryware & CP Fittings; Glass & Accessories; Electrical | 27 |
| `bath_c` | Common Bathroom | Civil & Surface; Sanitary & Vanity; CP Fittings & Glass; Electrical | 21 |
| `balcony` | Balcony / Utility | Flooring; Walls / Ceiling / Railing; Utility; Electrical & Plumbing; Outdoor | 21 |
| `foyer` | Foyer / Entrance | Flooring; Ceiling & Lighting; Carpentry & Partition; Wall & Decor; Electrical | 16 |
| `study` | Home Office / Study | False Ceiling & Flooring; Workstation; Storage; Wall; Furniture & Electrical | 23 |
| `custom` | Custom Room | Flexible Categories | 11 |

The PDF's exact item names, supported units, and measurement descriptions are the content source for these references.

## Catalogue Architecture

Separate three concepts that the current `estimateBuilderSections` structure combines:

1. **Commercial scope** - the existing stable scope IDs `FC`, `FL`, `CA`, `PA`, `EL`, `CV`, and `LF`. These remain the persistence and design-mapping contract.
2. **Catalogue row** - one stable item ID with description, commercial scope, unit, quantity basis, specifications, rates, and allocation metadata.
3. **Room reference** - an ordered list of room-local section headings, each referencing applicable catalogue row IDs.

The frontend catalogue module will expose:

- A flattened row registry for restoration, review screens, PDF export synchronization, and design drawing assignment.
- The existing commercial scope metadata for configuration controls.
- A room-type-to-reference mapping.
- A selector that returns applicable, non-empty room-local sections for a room and the enabled commercial scopes.

Master Bedroom and standard Bedroom are separate references. `bedroom2` and `bedroom3` map to the same standard Bedroom reference; they do not duplicate catalogue definitions. Multiple room instances remain independent because working line IDs combine the room instance ID and catalogue row ID.

Room-local section headings are presentation data, not new commercial scope IDs. For example, Master Bedroom's **Electrical & Soft Furnishing** heading can contain rows mapped individually to `EL` or `LF`.

## Item Identity, Specifications, and Pricing

Existing `FC01` through `LF04` IDs are not removed, renamed, or assigned a different meaning. Existing estimates, PDF exports, design mappings, and client review screens depend on those IDs.

When a PDF item is an exact match for an existing Lisno catalogue row, the room reference reuses that row and preserves its current:

- catalogue ID;
- specification options;
- unit and quantity behavior;
- base and specification-specific rates;
- costing allocation metadata.

New PDF-only items receive stable, short, namespaced IDs under the 64-character API limit. They use the PDF's primary unit and closest currently supported quantity basis. Because the PDF provides no commercial pricing or material variants, these rows use:

- specification: `Rate pending`;
- rate: `₹0`;
- the PDF measurement description as reference metadata.

The interface must make the pending rate visible. It must not infer or fabricate a price. Adding unit selection, item-level length/width/height/depth inputs, multi-unit pricing, or a pricing administration screen is deferred.

## Builder Data Flow

### Creating lines

When the estimator selects **Continue to item selection**:

1. Resolve each room's reference from `room.typeId`.
2. Read that reference's ordered sections.
3. Filter each section's rows by the enabled commercial scopes.
4. Hide empty sections.
5. Create line drafts only for the remaining rows.
6. Restore any prior in-session value with the same `room.id + catalogueId` key.
7. Default new rows to unchecked.

The current quantity engine continues to provide area, perimeter, count, and custom defaults. No calculation formula is silently expanded beyond what the existing engine supports.

### Rendering the active room

The existing room sidebar remains the active-room control. The content panel renders the active room's resolved section list rather than every global catalogue section. Section totals and the selected-item count use only that room's visible lines.

Summary and proposal views continue to group totals by room. Client review and exported estimates continue to resolve catalogue descriptions from the flattened registry.

### Saving and restoration

The API payload remains compatible: property type, room records, enabled commercial scopes, and line items continue to be stored in their current shapes. A database migration is not required for the initial feature.

Saved rooms already include `typeId`. Older room records that lack it are resolved conservatively from known labels. An unrecognized legacy label uses a legacy/custom fallback rather than preventing the draft from opening.

Previously saved included lines are never silently discarded. If an old draft contains a row that is no longer applicable to that room, it remains visible in a clearly labelled **Existing saved items** group until the estimator unchecks it. New estimates never receive this group or any unrelated row.

## Downstream Compatibility

The backend PDF catalogue remains synchronized from the frontend's flattened row registry. Every selectable catalogue ID must resolve to a description, section ID, and section label on the backend.

Design drawing mapping continues to use the existing commercial scope IDs and exact catalogue IDs. New room-local headings do not become mapping scope IDs. Item aliases may be extended for new rows, but room matching and manual assignment behavior remain unchanged.

The client estimate review keeps its current commercial-scope grouping in this change. It must still display every included new row instead of silently omitting unknown IDs.

## Empty, Error, and Edge States

- A room with no items after scope filtering shows: `No estimate items match the selected scopes for this room.`
- Removing a room removes only that room instance and its unsaved working lines.
- Two rooms using the same standard Bedroom reference keep independent quantities, specifications, selections, and totals.
- Switching rooms never copies values between room instances.
- A `Rate pending` row contributes ₹0 and remains visibly identifiable before submission.
- Unknown legacy catalogue IDs retain their raw ID and saved values in the legacy group; they do not crash the builder, review, mapping, or PDF export.
- Rebuilding lines preserves matching prior values and included states.

## Visual and Accessibility Contract

No CSS, theme, or design-system work is included. Reuse the current room sidebar, section cards, line rows, controls, responsive breakpoints, focus states, and selected states shown in the supplied screenshots.

The active room control continues to expose its selected state. Every item checkbox, specification control, and quantity input keeps a unique accessible name containing the catalogue ID. Empty-room feedback is exposed as readable text rather than an empty panel.

## Testing

### Catalogue tests

- Every current room `typeId` resolves to the correct reference.
- Master Bedroom and standard Bedroom resolve to different item sets.
- Bedroom 2 and Bedroom 3 resolve to the same standard Bedroom definition.
- Every catalogue row ID is globally unique and no longer than 64 characters.
- Every referenced row exists in the flattened registry and has a valid commercial scope.
- Scope filtering removes disabled rows and empty sections without adding unrelated rows.
- Existing IDs retain their prior description, specifications, and rates.
- New PDF-only rows are explicitly `Rate pending` at ₹0.

### Builder interaction tests

- Selecting Master Bedroom shows Master Bedroom items and excludes kitchen, bathroom, and living-only items.
- Selecting Bedroom 2 or Bedroom 3 shows the standard Bedroom items.
- Selecting each other room shows its corresponding room reference.
- Switching rooms preserves independent values and selection state.
- Rebuilding preserves matching lines and does not silently discard included legacy rows.
- Saved drafts restore the correct room-local sections.
- The no-matching-scopes state is visible and accessible.

### Downstream tests

- The generated backend catalogue exactly matches the flattened frontend registry.
- Estimate PDF export prints descriptions for new catalogue IDs.
- Design mapping accepts new included catalogue IDs with their commercial scopes.
- Client review displays included new rows.
- Existing estimates containing legacy IDs still load, render, export, and remain assignable.

### Visual verification

Run the estimator flow at the screenshot's desktop state and a narrow mobile state. Verify Master Bedroom, Bedroom 2, Living & Dining, Kitchen, and both bathrooms. Confirm section order, absence of unrelated rows, stable sidebar selection, no clipped controls, and no regression to the existing responsive layout.

## Non-Goals

- App-wide design-system or CSS changes.
- Automatic BHK room generation.
- New property types or room types.
- Pricing administration or invented rates.
- New specification options for PDF-only items.
- A new measurement-entry model for height, depth, openings, wastage, or alternative units.
- Backend workflow, permission, GST, approval, or notification changes.
- New routes or navigation.

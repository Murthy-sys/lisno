# Specification item/part and brand association design

Status: Specification draft-list workflow approved, implemented, and verified on 2026-09-19.

## Goal

Keep all item and Brand authoring inside **Specifications**. Each Specification row contains **Item name**, **Brand name**, and the existing optional **Brief description**. The Brand name control lists existing local Brands and provides an explicit **Add brand** action; a newly added Brand appears in the same dropdown and is selected for the current item. Do not render a separate **Brands** section below Specifications.

## Current behavior and evidence

- The implemented editor correctly keeps local Brands separate from reusable procurement Vendors and stores associations by stable `brandId`.
- It currently renders two sibling blocks: **Specifications** and a separate **Brands** catalog, matching the supplied screenshot. The user has rejected that presentation.
- A Specification row already renders an item/part field, Brand dropdown, Brief description, and one aligned delete action without reorder arrows.
- The required correction is presentation and interaction: move Brand creation into the Specification row's Brand dropdown and remove the visible standalone Brands block.
- The stored Pricing contract remains `payload.specifications[].brandId` referencing `payload.brands[].id`; Vendor masters remain a separate business identity.
- Quantity slabs and immutable historical price records continue to reference stable Specification IDs and retain their removal protections.

## Product decision

Continue using the existing Pricing `brands` collection as the Brand dropdown source and keep the optional stable `brandId` association on each Specification row. The data contract is correct; only the authoring experience changes.

The Brand control uses the existing native dropdown pattern for Android, keyboard, and screen-reader compatibility. It contains **Not configured**, all local Brand names, an explicit **Add brand** action, and **Edit selected brand** when a configured Brand is selected. Choosing either action opens a compact Brand-name form. Adding creates a stable Brand row, closes the form, adds the new name to every Specification Brand dropdown, and selects it for the row that initiated the action. Editing preserves the stable Brand ID and updates its name everywhere it is selected.

Specifications will follow the established Quality Parameter and Recommendation & Exclusions interaction model: a compact summary list is the primary view, while adding or editing opens a contextual editor. Changes made there update the in-memory Mode draft. **Done** closes the editor; only the page-level **Save Mode** action persists the Pricing section to the backend.

## Scope

### Specification rows

1. Keep the section heading **Specifications** for compatibility with the wider workflow.
2. Use the visible field label **Item name**. **Specification name** and **Item / part name** are absent from this authoring view.
3. Preserve **Brief description** as an optional field; the request does not remove the existing guidance field.
4. Add an optional **Brand name** dropdown to every item row.
5. Populate the dropdown from `payload.brands` using stable Brand IDs. Show **Not configured** as the empty choice and **Add brand** as an explicit action in the same dropdown experience.
6. Persist the association as `brandId` on that Specification row. Names remain presentation only and are never used as join keys.
7. Keep item names required, trimmed, bounded, and unique under the existing normalized-name rule. A Main Line can contain many different items, each independently associated with a Brand.
8. Existing Specification rows without `brandId` remain valid and display **Not configured** without an automatic write.
9. Existing typed compatibility properties remain preserved exactly during visible edits.

### Inline Brand creation

1. Remove the standalone **Brands** heading, **Add brand** button, empty state, and Brand rows from below Specifications.
2. Keep local Brand records distinct from reusable Vendors used by Budgeting and procurement.
3. Place **Add brand** inside each **Brand name** dropdown experience; do not use free-text entry as an implicit Brand creation mechanism.
4. The add form requires a unique, trimmed, bounded **Brand name** and may retain the optional Brand description in storage without adding another permanent section to the page.
5. Cancel closes the add form without changing the Brand catalog or the current selection.
6. A successful add creates one stable Brand ID, automatically selects it for the initiating item, and exposes it immediately in every other Brand dropdown.
7. Failed validation or save keeps the typed Brand name available and focuses the exact error. It must not create a partial Brand or replace the current association.
8. The existing 200-Brand limit remains enforced. At the limit, the dropdown still selects existing Brands but disables **Add brand** with an accessible explanation.
9. **Edit selected brand** remains available at the limit and lets an author repair an invalid or concurrently duplicated local Brand name without discarding unrelated Pricing edits. Editing changes the name only; it preserves the stable Brand ID, hidden Brand fields, and every existing Specification association.

### Row actions and layout

1. Remove Up and Down controls from Specification item/part rows only. Other repeaters retain their existing reorder behavior.
2. Preserve stored array order. New rows append to the end; deleting a row closes the gap naturally.
3. In the contextual editor at desktop and suitable tablet widths, render **Item name**, **Brand name**, and **Brief description** on one row. Each field occupies four columns of the same 12-column content grid, producing three equal-width fields.
4. Keep Brief description compact in the editor row rather than rendering a full-width textarea beneath Item name and Brand name. It remains multiline-capable where supported, but its initial control height aligns with the other two controls.
5. Put Edit/View and Remove in the compact summary row's narrow action column; do not place a delete control beside the three editor fields.
6. At mobile widths, stack the contextual editor fields and present each summary table row as a readable stacked row/card with its actions aligned together.
7. Keep action controls' accessible names, disabled reasons, focus restoration, minimum touch targets, and visible keyboard focus states.
8. Opening and closing the Brand dropdown or Add-brand form must preserve keyboard focus and must not move or delete the Specification row.

### Draft list and contextual editor

1. The default Specifications view is a compact table/list rather than permanently visible input controls. Each row summarizes **Item name**, resolved **Brand name**, **Brief description**, draft status, and actions.
2. **Add Specification** immediately creates one stable draft row and opens its contextual editor, matching the established Quality Parameter and Recommendation & Exclusions pattern.
3. **Edit** opens the contextual editor for an existing row. In editable mode, the editor contains Item name, Brand name, and Brief description; in read-only mode it acts as a View-details surface.
4. The contextual editor keeps the approved three equal four-column fields on desktop and stacks them on narrow screens. The Brand dropdown retains Add brand and Edit selected brand behavior.
5. The editor footer uses **Done** to close and return focus to the initiating Add/Edit control. Done does not call the backend and must not imply that the row is persisted.
6. Rows compare their stable-ID draft values with the saved Pricing baseline and display **Unsaved** when the Specification or its resolved Brand has changed, **Saved** when unchanged, and **Needs review** after a failed Save Mode validation attempt.
7. Deleting a Specification remains a draft operation. Referenced rows remain protected by the existing disabled reason. The row action contains Edit/View and Remove only; reorder actions remain absent.
8. **Save Mode** remains the only persistence action for Specification and Brand changes. It validates and saves the existing Pricing payload with its CAS version, audit behavior, pending-change projection, and conflict recovery unchanged.
9. If Save Mode finds an invalid Specification or selected Brand, it opens the affected contextual editor, focuses the first invalid control, leaves the draft intact, and performs no partial backend save.
10. A successful Save Mode refreshes the saved baseline, changes affected row statuses from Unsaved to Saved, and keeps the compact summary list visible.
11. Discarding or navigating through the existing unsaved-changes guard restores the last saved Pricing baseline; closing the contextual editor alone never discards draft values.

## Data and API contract

Current rows remain valid:

```json
{
  "id": "spec-plywood",
  "name": "Plywood",
  "description": "18 mm BWP-grade plywood"
}
```

New association shape:

```json
{
  "id": "spec-plywood",
  "name": "Plywood",
  "brandId": "brand-century-green",
  "description": "18 mm BWP-grade plywood"
}
```

Brand source:

```json
{
  "brands": [
    {
      "id": "brand-century-green",
      "name": "Century Green"
    }
  ]
}
```

- `brandId` is optional for compatibility and incomplete authoring.
- When present, `brandId` must be a bounded stable ID and must reference exactly one row in the same Pricing payload's `brands` array.
- Backend validation rejects unknown properties, malformed IDs, duplicate Brand IDs/names, and dangling `brandId` references before persistence or activation.
- The OpenAPI `KnowledgeSpecification` shapes add optional `brandId` to descriptive and typed compatibility rows.
- Context projection may expose `brandId` and the resolved Brand identity needed by estimation consumers, but it must not expose private Vendor notes or use a Vendor name as a join key.
- No database migration or backfill is required because the Pricing section is JSON payload data and the new field is optional. No save occurs merely by opening legacy data.

## Dependent presentation

1. Pending Changes labels the fields **Item name**, **Brand name**, and **Brief description** and resolves a Brand ID to its current name.
2. Conflict Review shows the same business labels and resolved Brand name; it does not expose raw IDs.
3. Validation summaries focus the exact invalid Item name, Brand name, or inline Add-brand control.
4. Quantity-slab selectors continue to use stable Specification IDs and show the Item name. Brand association does not change quantity-slab calculation behavior.
5. Read-only and saved views show each item with its Brand when configured and never expose reorder or Brand-add controls.

## Permissions and state behavior

- Existing Pricing edit permission and Draft-revision rules remain authoritative.
- Read-only, active-history, and archived views expose no add, delete, or Brand-creation controls.
- Failed validation, access denial, network failure, or version conflict retains all local item/part and Brand selections for retry or conflict review.
- Saving continues through the existing section expected-version and aggregate-version checks, transaction, immutable revision, and audit behavior.

## Non-goals

- No changes to reusable Vendor masters, procurement Vendors, Budget Vendor selection, GST, pricing calculations, margins, quantity calculations, or execution modes.
- No drag-and-drop or alternative manual ordering control.
- No multi-select Brand field in one item/part row. A row represents one part and at most one associated Brand.
- No automatic Brand creation from arbitrary typed dropdown text and no name-based association; creation occurs only through the explicit **Add brand** action.
- No separate permanent Brand-management section below Specifications.
- No migration of current Pricing `brands` rows into the reusable Vendor catalog.

## Risks and controls

- **Brand/Vendor ambiguity:** use **Brand name** only for local `payload.brands`; keep Budgeting labels as **Vendor** and document the distinct IDs.
- **Dangling association:** validate `brandId` against the same saved Pricing payload and block deletion of referenced Brands.
- **Legacy compatibility loss:** preserve typed compatibility fields and treat missing `brandId` as a valid unconfigured association.
- **Hidden ID leakage:** resolve Brand labels in dropdowns, summaries, pending changes, and conflicts; stable IDs remain transport data.
- **Dropdown complexity:** keep Add brand explicit, prevent accidental creation from search text, and return focus and selection to the initiating Specification row.
- **Action misalignment:** verify the summary table action column and contextual editor at desktop, tablet, and 320–390 px mobile widths.
- **Stale edits:** retain existing section and aggregate CAS behavior; surface duplicate-name conflicts on the affected Brand dropdown and allow the selected stable Brand to be renamed before retry.

## Acceptance criteria

- **AC1 — Business labels:** every editable Specification row uses **Item name**, **Brand name**, and **Brief description**; **Specification name** and **Item / part name** are absent from the authoring UI and validation copy.
- **AC2 — Association:** an author can add Plywood, select Century Green from Brand options, save, reload, and see the same association resolved by stable ID.
- **AC3 — Multiple parts:** one Main Line can save and reload Plywood, Laminate, Hinges, and Glue rows with independent optional Brand selections.
- **AC4 — Inline Brand authoring:** no separate Brands section is rendered. From Plywood's Brand name dropdown, an author can choose **Add brand**, create Century Green, see it selected for Plywood, and find it in every other Specification dropdown. **Edit selected brand** preserves its stable ID and repairs a concurrent duplicate-name conflict without losing unrelated edits.
- **AC5 — Compatibility:** legacy descriptive and typed Specification rows load without writes; missing `brandId` shows **Not configured**; hidden typed fields survive edits.
- **AC6 — Validation:** empty/duplicate item names, malformed or dangling Brand IDs, duplicate Brand identities, invalid inline Brand names, and the 200-Brand limit are rejected with focused messages and no partial persistence.
- **AC7 — Actions:** Specification rows show no Up or Down actions. Edit/View and Remove are correctly aligned in the summary row, remain accessible, and Remove respects immutable-history and quantity-slab blockers.
- **AC8 — Responsive/accessibility:** the contextual editor shows Item name, Brand name, and Brief description in one equal-width four-column row on desktop and suitable tablet widths. At 390 px and 320 px, editor fields and summary rows stack without overflow; dropdown/add-form positioning, labels, focus return, error descriptions, disabled reasons, and keyboard operation pass rendered checks.
- **AC9 — Established editor pattern:** Specifications render as a compact summary table/list with Add, Edit/View, status, and Remove behavior consistent with Quality Parameter and Recommendation & Exclusions workspaces; inputs appear in a contextual editor rather than remaining expanded in every row.
- **AC10 — Save Mode ownership:** Done only closes the contextual editor. Before Save Mode, affected rows remain Unsaved and no Pricing request occurs; Save Mode is the sole persistence action and changes valid rows to Saved after a successful response.
- **AC11 — Validation recovery:** a failed Save Mode attempt opens the first invalid Specification editor, focuses the exact invalid Item or Brand control, preserves all draft values, and performs no partial save.
- **AC12 — Saved-state surfaces:** Pending Changes, conflict review, read-only presentation, context projection, and quantity-slab labels use the item/part and resolved Brand model without raw-ID leakage.
- **AC13 — Isolation:** reusable Vendors, Budgeting, procurement, finance calculations, and unrelated repeaters retain their current behavior.

## Verification requirements

- Backend validation, context projection, OpenAPI, route/service no-write, stale-version, and replica-set persistence tests.
- Frontend parser/serializer, Brand referential integrity, legacy compatibility, pending/conflict, saved/reload, permission, Add-brand cancellation/failure/success, cross-row option refresh, 200-Brand limit, and focus tests.
- Rendered interaction and accessibility checks for editable, read-only, empty Brand list, inline Brand creation, validation failure, keyboard use, and responsive widths.
- Backend and frontend typechecks, focused suites, production builds, `git diff --check`, and repository status review.

## Assumptions

- **Brand is optional** because the example lists parts without a Brand and existing rows have no association.
- **One Brand per item row** matches the supplied `Plywood — Century Green` structure. If one physical item needs two Brands, authors create distinct rows with clear names.
- The existing local Pricing `brands` collection is the authoritative Brand option source; reusable Vendors remain supplier identities.

## Open decisions

None required to begin planning. The assumptions above use the smallest compatible extension of the current Pricing contract and preserve the supplied example.

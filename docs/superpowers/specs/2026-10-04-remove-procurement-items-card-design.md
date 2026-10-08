# Remove the duplicate Procurement items card

Date: 2026-10-04  
Status: approved, including lineage amendment

## Goal

Remove the entire **Procurement items** card shown in the supplied screenshot from the Procurement project page. Buyers should work from the approved-estimate expansion in **Purchase orders** and retain the ability to prepare and maintain the procurement items needed for an order.

## Current behavior and evidence

- `ProcurementProjectPage.tsx` renders `EstimateProcurementItems` before `PurchaseOrdersPanel`. The former is the screenshot's card: heading, approved-estimate badge, separate search, section rows, Add item and View items controls.
- `ProjectPurchaseOrderRequestPanel.tsx` and `PurchaseOrderEstimateTree.tsx` already render the approved estimate as room → main basket → sub-basket → main-line expansions, including zero-value and excluded reference lines. The tree currently displays linked purchase items and their configured modes, but has no add, edit, remove, or reassignment controls.
- `EstimateProcurementItems.tsx` is currently the entry point for `ProjectProcurementItemEditor`. `ProjectProcurementItems.tsx` supplies per-line item lists, edit/remove controls, and an unassigned-items recovery section. Removing its page render alone would strand those workflows, especially when a main line has no child item yet.
- The relevant purchase-order tree and request panel contain uncommitted edits from the approved 2026-10-04 mode-aware purchase-order work. This change must build on them without reverting those edits. The project page itself is currently clean.

## Recommended behavior

1. Stop rendering `EstimateProcurementItems` on the Procurement project page. Its entire card, duplicate search, section listing, and approved-estimate badge disappear, with no empty placeholder.
2. Make the existing purchase-order estimate tree the single place to inspect the approved line and manage its procurement children. Each eligible included, positive-value main line provides **Add purchase item**. Each existing child provides **Edit** and, when allowed, **Remove**. Reuse the established procurement item editor, source identity validation, version checks, and reasoned remove operation; do not duplicate finance calculations or invent another persistence path.
3. Keep a compact **Items needing assignment or review** area within the Purchase orders workspace. Genuinely unassigned children and children linked to a now non-actionable line in the **same** approved estimate version can use the existing editor to select a current positive line when the backend permits it. Children linked to an older approved estimate ID/version remain visible with a source-conflict explanation; they cannot be directly reassigned. If they have no protected order/request history, the buyer may remove them with a reason and create a corrected item under a current eligible line. No automatic identity or commercial-data transfer occurs.
4. Keep zero-value and excluded estimate lines visible in the order tree as references, without an Add action. A line with no child clearly offers Add when eligible. Existing vendor-order and amendment views stay available.
5. Invalidate preparation, procurement child lists, request/quote state, commitments, project status, and related dashboard queries after item changes. A changed item invalidates the current quote; the buyer must obtain a new backend quote. Preserve editor draft and clear stale-source feedback if the project or approved estimate changes while editing.

## Scope and non-goals

- Frontend Procurement project page, purchase-order tree/request panel, item editor entry points, compact unassigned-item recovery, related styling and tests.
- Reuse existing Procurement item APIs and permissions. No backend route, schema, mode formula, approval, estimate, vendor order, or Configuration change is planned.
- No new automatic item creation from estimate lines and no automatic transfer of configured selling amounts to vendor payable orders.
- Removing the card from the rendered page does not require deleting its component source in this change; shared item utilities may remain where useful.

## UX and interaction requirements

- Present one clear Add action on an eligible expanded main line, close to the existing linked purchase items. Show edit/remove controls on each child without introducing another large card or table. Keep the tree's search and expansion state while an editor opens and after it closes.
- Open the existing context-panel editor with the exact approved estimate ID, version, and source-line key. Return keyboard focus to the triggering control on close or save. Keep accessible button names, visible focus, loading/error/empty states, and responsive controls at mobile widths.
- Removal retains its required reason and backend guard against submitted-order history. Pending requests and stale source/version conflicts must remain visible and fail closed through the existing backend contracts. A pending request restricts referenced children through the existing backend rule; unrelated eligible item work need not be frozen.
- The page header and Purchase orders intro should describe the consolidated workflow; they should no longer direct the buyer to the removed card.

## Data, API, authorization, and financial impact

- No new data fields or API operations. The established create/update/remove item endpoints remain authoritative. Source joins use approved estimate IDs and line keys, never display names.
- Only users with existing Procurement item-management permission see item mutations; existing purchase-order and project-read permissions remain unchanged. The backend remains authoritative for access and validation.
- Existing item quantity, unit price, allocated work, mode choice, GST, quote totals, approval history, and vendor PO arithmetic are unchanged. Item mutations must refresh the preparation digest and clear any displayed quote before send.
- No migration, backfill, Configuration write, or external action is part of this change.

## Risks and controls

| Risk | Control |
| --- | --- |
| Removing the only Add/Edit/Remove entry point strands buyers | Put these actions beside the corresponding line and item in the purchase-order tree before removing the page card. |
| Orphaned or historical children disappear | Keep a compact review area. Offer direct reassignment only where the existing backend lineage rule allows it; explain removal and corrected recreation for older-version children. |
| A stale quote is submitted after an item edit | Invalidate preparation and quote state; backend digest/version validation remains decisive. |
| Same-named lines in different rooms receive the wrong item | Pass stable approved source IDs/keys to the existing editor. |
| Existing unfinished edits are overwritten | Review target diffs before implementation and preserve the mode-aware tree/request changes. |

## Acceptance criteria

1. The screenshot's **Procurement items** card does not render on the Procurement project page at desktop or mobile widths. There is one approved-estimate search and hierarchy within Purchase orders.
2. An eligible main line with no child can add a procurement item from its expansion. The saved child appears under that exact line after refresh, including when another room has the same display name.
3. Existing children can be edited and removed with the established validation, version conflict, reason, focus return, and permission behavior. Submitted purchase-order history remains protected.
4. Unassigned and same-version children whose previous line became non-actionable remain discoverable and can be reassigned when the existing backend rule permits it. Older-version children remain discoverable with a precise blocked state and a reasoned remove-and-recreate path if their history allows removal. Unresolved children do not silently enter a purchase order.
5. Zero-value/excluded lines remain visible but cannot create new order items. A changed item clears the current quote and requires a new backend quote before submission.
6. Existing configured mode calculations, purchase-order approval, vendor order and amendment behavior continue to work. No Configuration-owned file or record is changed by this feature.
7. Focused Procurement interaction and accessibility tests, frontend typecheck/build, rendered desktop/mobile checks, and repository diff hygiene pass. Any unrelated full-suite failures are reported separately.

## Assumption and open decision

**Assumption for approval:** “Remove this entire card” means removing the duplicate page surface while retaining its essential item-management actions inside the purchase-order estimate expansion. Removing those actions would prevent preparing a first order from a main line with no child and would make existing orphaned items difficult to recover. No further product decision is needed if this assumption is accepted.

**Lineage amendment for approval:** The existing item API and its replica-set tests explicitly reject direct reassignment when a child belongs to a different approved estimate ID/version. Preserving that invariant keeps historical item identity and PO/request links intact. This specification does not authorize changing that backend rule.

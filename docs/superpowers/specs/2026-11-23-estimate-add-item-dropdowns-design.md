# Choose an estimate item by Main Basket, Sub Basket and Main Line

## Goal and current behavior

In the Sales estimate, Add items currently opens a searchable, paginated list with two basket filters and an Add button on each result. ConfiguredEstimateBuilder derives candidates from the catalogue for the active room and passes a stable target to the workspace’s addConfiguredLine handler.

## Interaction

Replace the search and results list in this picker with three labeled dropdowns in order: Main Basket, Sub Basket and Main Line. Start with a Main Basket prompt. Enable each subsequent dropdown when its parent is chosen. Changing a parent clears its descendants. Offer only branches containing room-eligible catalogue choices. For items attached directly to a Main Basket, offer “Direct items” in the Sub Basket dropdown and retain the underlying null Sub Basket ID.

Use one Add button to confirm the selected Main Line. This preserves the existing explicit action and lets a keyboard user explore options before adding. On success, show the included row in the active room under its usual basket, with the normal quantity, unit, pricing, editing and save behavior. Reveal a previously hidden group as needed. Keep Add items reachable in an otherwise empty room.

## Constraints and failure states

Use the existing room applicability, pricing availability, edit permissions, freshness guards and duplicate checks. Identify options by stable IDs throughout. Reset invalid choices on room or catalogue changes and prevent adding a stale selection. Indicate when a room has no eligible items or the chosen line is already included. The change is local to the Sales estimate picker and uses the existing API and persistence path.

## Acceptance

- For an eligible Balcony / Utility item, choose Main Basket, Sub Basket and Main Line, then Add. Exactly one normal editable row appears in that room and survives the existing draft save and reopen flow.
- Changing the Main Basket or Sub Basket clears any previous Main Line. Ineligible lines cannot be added. A direct item can be added without assigning it to a real Sub Basket.
- Read-only, unavailable and duplicate states prevent unintended additions. Verify labeled dropdowns, keyboard operation, narrow-screen layout, and visibility of the new row after adding.

The proposed confirmation gesture is a single Add button after the three selections.

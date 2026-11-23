# Hide empty Main Baskets and Sub-Baskets in the room estimate

## Evidence and goal

The Balcony / Utility screenshot shows POP Gypsum with zero selected and zero shown. In ConfiguredEstimateBuilder the expanded catalogue retains a group if any source passes room eligibility. A non-default or unrestricted source can therefore keep a heading visible even when the builder has no rows to display. The screenshot establishes the empty state. It does not identify the underlying catalogue record.

## Display change

The builder currently supplies basket shortcuts from `visibleBaskets` and content sections from `catalogueGroups`. In the loaded estimate, show a Main Basket section and its room shortcut only if the basket contains a displayable direct item or at least one Sub-Basket with a displayable item. Evaluate this for the active room. Keep the Add items entry point accessible when every basket is hidden. Room switches must recover gracefully if the previously filtered basket is hidden in the new room.

In the loaded estimate, render a Sub-Basket only when it has a row to show for the selected room. Apply the rule consistently across rooms. Keep eligible optional items discoverable through Add items. Adding one should reveal its group immediately. This revises the earlier requirement that picker-only membership should keep a heading visible. Reuse the builder's existing row, search and pagination logic.

## Scope and assumptions

This is a presentation change. Keep existing Configuration eligibility, unrestricted-line semantics, Main Basket selection, saved rows, mismatch review, room totals and loading/error handling. No API or persistence changes are required. Hiding a group must cause no save or removal. The main interaction risk is losing access to an optional item when its group is hidden.

## Acceptance and verification

- With Balcony / Utility active and zero displayable POP Gypsum rows, the group heading, removal control and empty message are absent.
- If POP / Gypsum also has no displayable direct or sibling items, its Main Basket heading, shortcut and empty message are absent. A direct item or a populated sibling keeps the parent visible while the empty Sub-Basket stays hidden.
- Adding the first eligible item from Add items reveals its parent and, for a grouped item, its Sub-Basket. Switching back to a room with no rows hides both while preserving the estimate’s saved basket selection.
- Switching to a room with displayable rows restores the group. Adding an eligible optional item through the picker also restores it in the active room.
- An ineligible item stays absent from the picker. Switching rooms preserves existing selections and totals.
- Exercise these transitions in rendered builder tests and a browser. No open product decisions beyond approval of the revised visibility rule.

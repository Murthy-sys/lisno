# Hide Sub-Baskets with no Main Lines applicable to the selected room

## Goal and evidence

In the Sales estimate builder, selecting Kitchen should hide the POP Gypsum Sub-Basket if none of its Main Lines apply to Kitchen. The screenshot shows the Sub-Basket header, a zero count, a removal control and an empty message. ConfiguredEstimateBuilder.tsx already filters catalogue rows by room, but its Sub-Basket filter admits every group in expanded catalogue browsing.

## Display rule

When the catalogue is available, use the existing room eligibility matcher against each Sub-Basket’s regular and temporary Main Lines and the active room type. Omit the entire Sub-Basket if it has no applicable items. Keep any group needed to display an existing editable row and keep incompatible saved assignments accessible in the existing review area. Recompute visibility when the room or saved configuration changes. Hiding a group is a display decision and must never invoke its removal action.

Applicability is independent of default-display status, price and current search. A matching line available only through Add items still qualifies its Sub-Basket; a line with no room restriction qualifies in every room. Preserve existing loading, error, search and pagination behavior. The scope is the Sub-Basket groups in the estimate shown. Main Basket selection and room totals retain their existing behavior. This is a frontend presentation change using existing catalogue data.

## Acceptance

- With POP Gypsum assigned only to Bedroom and Living & Dining, selecting Kitchen removes the Sub-Basket header, count, removal action and empty message together. A Kitchen-compatible sibling remains visible.
- Switching to a bedroom brings POP Gypsum back. A mixed Sub-Basket, an unrestricted item and a matching temporary item each keep their group visible. A truly empty Sub-Basket is hidden.
- Keyboard and mobile room switching produce the same result. Existing saved assignments remain reviewable and totals survive switching rooms.
- Verify through rendered builder tests and browser checks. Preserve the existing room-applicability edits in the working tree.

The scope and empty-group rule above are the decisions for approval.

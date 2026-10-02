# Estimation screen reference design

## Goal and evidence

Redesign the configured Estimate Builder to follow the supplied screen: compact project masthead, view tabs, search and filter toolbar, section rail, Main Basket chips, collapsible basket hierarchy, and dense item rows with quantity, rate, and amount aligned horizontally. The current builder in `ConfiguredEstimateBuilder.tsx` has the required data and edit actions, but presents sparse gray panels and stacked controls. `LeadEstimateWorkspace.tsx` owns navigation, totals, refresh, and saving. `configuredEstimate.ts` owns paise arithmetic and source-rate prefilling.

## Scope

- Apply the reference's hierarchy, proportions, warm neutral surfaces, dark green emphasis, navy text, and compact controls to the configured item-selection view.
- Keep project status, critical count, messages, view tabs, refresh, selected items, save, and submit accessible.
- Add search across available item and section names, a Main Basket filter, a selected-room rail view, section chips, and sub basket disclosures.
- Use existing local interior imagery as a supporting crop where it fits; show a neutral visual tile for items without a suitable image. Catalogue data has no image or description field, so display the real UOM as secondary item information.
- At narrow widths, reflow the rail and item controls without horizontal page overflow.
- On wide screens, let the item-selection workspace use the available area beside the application sidebar with consistent page gutters.

## Invariants and non-goals

- Do not alter catalogue eligibility, in-house base-rate prefilling, item inclusion, quantity precision, paise calculations, save/submit payloads, source-review warnings, or authorization.
- Do not add a backend image/description contract or fabricate configuration descriptions.
- Preserve draft, inactive, unavailable, and historical saved-line handling.
- No new dependency, migration, commit, deployment, or external write.

## Acceptance criteria

1. At desktop widths, the screen follows the reference's header, tabs, search/filter row, left section rail, chips, nested basket headers, and one-line item controls.
2. Every basket/sub basket disclosure works by pointer and keyboard; chips open and jump to baskets.
3. Search, Main Basket filter, and Selected view give truthful results and empty states without mutating estimate data.
4. Quantity steppers respect UOM precision; editing rate and selecting an item update amounts and totals using existing logic.
5. Source warnings, invalid values, empty catalogue, refresh error, and saved unavailable lines remain visible and operable.
6. The layout uses the available width on large desktop screens, then works at tablet and mobile widths with labelled controls and visible focus.

## Risks and assumptions

- Item photos in the reference are illustrative. Existing catalogue records have no asset reference; local imagery is decorative and must not imply a specific product.
- Existing project chat/status components determine visibility from permissions and live data. Their controls may be absent when the underlying capability or project context is absent.
- The user previously requested autonomous implementation without approval gates; this specification records the implementation target and is not an approval stop.

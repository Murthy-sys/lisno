# Quick-add catalogue for estimate item selection

Date: 2026-10-04  
Status: Awaiting specification approval

## Goal

Provide an advanced, modern alternative to the supplied **Select estimate items** screen using the fast browse → add → adjust → basket interaction familiar from Blinkit. An estimator should choose a room, find a scope item, add it with one clear action, adjust its UOM-aware quantity and selling rate, and see an estimate tray update immediately. The catalogue should occupy the work surface. A review drawer opens only when needed, leaving room to browse long item names and compare scope.

## Current behavior and evidence

- The screenshot shows a wide header with project status, a boxed ₹0 total, three prominent view tabs, a separate search/filter/refresh row, a room rail, a Main Basket jump tile, nested basket headers, and a second total/action bar. The same financial summary is visually emphasized twice while line-item text and form labels are small.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` renders the back link, project context, status/messages navigation, total, Builder/Summary/Proposal tabs, configured builder, and footer actions. The footer already owns selected-line count, total, Save draft, Submit estimate, and any Send to client action.
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` owns room selection, All Sections filtering, search, refresh, Main Basket jumps, basket/sub-basket disclosure, selection, quantity, selling rate, amount preview, changed-source review, and a recommendation entry point. The visible row images are two generic local interiors reused across many distinct items.
- `frontend/src/styles/estimator-dashboard.css` currently uses several bordered panels, green fills, small 10–12 px item text, and a narrow item-name column beside a wide editing grid. Existing breakpoint rules turn the room rail horizontal and stack item fields on narrower screens.
- Blinkit's current [product page](https://blinkit.com/prn/x/prid/493530) and [category listing](https://blinkit.com/dc/electronics/mobile-computer/?collection_group_id=11723&collection_uuid=OTg3NjU0MzIxMjM0NTMzMjY%3D) visibly use search/categories, product-level **ADD** actions, and a cart destination. This proposal adapts that interaction rhythm, not Blinkit's branding, retail prices, delivery language, or checkout model.
- The worktree already has uncommitted recommendation changes in those frontend files and related backend/tests, plus an independent recommendation alert specification awaiting approval. This proposal must be reconciled with those changes rather than replacing them.

## Recommended design: estimate marketplace

Use a compact project bar and a full-width catalogue on warm limestone. A floating estimate tray leads to a review drawer. The latest two desktop visual concepts supplied in chat show **one item added**, followed by the **basket open**:

```text
Murthyll / Add items            Kitchen · 120 sqft       Messages · Status
Search work items for Kitchen...                     All sections · Refresh
All items 3        False Ceiling 2       Gypsum Wall Panelings 1
POP / Gypsum
  POP false ceiling     ₹60/sq-ft      [− 1 +]      ₹60 included
  Cove in Gypsum        Rate needed    [ADD]        Edit details
  50mm Gypsum...        ₹55/sq-ft      [ADD]        ₹55 preview
                 [1 item added · ₹70.80 incl. GST · Review estimate]

Review estimate opens a drawer:
Basket | Summary | Proposal
Kitchen: POP false ceiling 1 sq-ft × ₹60             ₹60
Subtotal ₹60 · GST ₹10.80 · Total ₹70.80
Save draft · Submit estimate
```

The amounts in this example follow the existing 18% GST calculation for one selected ₹60 line. The visual concept is a review artifact; live behavior, all exceptional states, and accessibility still need implementation verification.

### Browse, add, and edit flow

1. Choose an active room from a compact selector in the project bar. The catalogue shows only items available for that room and the Main Baskets selected during Configuration. The existing **All rooms / With selections** view remains available within the selector when multiple rooms exist; it does not create a permanent room sidebar.
2. Browse a Main Basket and its Sub Basket labels as a product shelf, or use search and the existing All Sections filter. Show item name, UOM, available selling rate, and an explicit amount preview when the line is not selected. Long names wrap; category illustrations are neutral technical linework only, never unrelated interior photos or purported product images.
3. An unselected item has an **ADD** button. ADD sets that line's existing `included` state to true while preserving its current valid quantity, selling rate, UOM, source identity, and saved-draft lineage. The button becomes an item-specific `− quantity +` control. Increasing/decreasing uses the configured UOM precision and the existing integer-paise amount logic. Pressing minus at the minimum selected quantity removes the line from the estimate but keeps its draft values for a later re-add.
4. **Edit details** opens a focused, keyboard-accessible item editor for quantity and selling rate on selected or unselected lines. Editing an unselected line updates its preview only; it never silently adds the item. A missing rate can still be added to a draft, but the item and basket show **Rate needed / Total incomplete**, and the existing Submit gate remains in force.
5. A compact **estimate tray** stays accessible at the bottom of the catalogue, including at zero selected items so Save draft remains reachable. It shows selected count and the project-wide inclusion-aware total. **Review estimate** opens a basket drawer listing selected lines grouped by stable room ID, independent of the currently browsed room. The drawer shows each line's quantity × rate, subtotal, GST, total, and existing Save draft, Submit estimate, and conditional Send to client actions. It also provides access to the existing Summary and Proposal views. Tray and drawer update immediately on add, remove, quantity, and rate changes. They are the only prominent estimate total; the boxed header total and duplicate footer total disappear from this view.
6. Recommendation entry and its right-side slide-out remain connected to the relevant selection. If adding a source line automatically opens a recommendation, the established close/uncheck safeguard still applies. The basket drawer and recommendation slide-out are mutually exclusive so neither hides the other's action/focus state. The separately pending recommendation-card specification governs recommendation content if approved.

### Composition and visual language

- **Header and views:** Keep back/project navigation and all real status/message affordances in a slim project bar. Show the active room as the working context. The item catalogue is the Builder view. Keep Summary and Proposal reachable from the review drawer with accessible text tabs and visible focus; shared chrome remains coherent when navigating to their existing bodies.
- **Catalogue:** Give search the most space, with section filtering and refresh nearby. Use horizontal tabs for only the available Sub Baskets in the current Main Basket, with real counts; avoid inventing unrelated categories. Present consistent full-width product listings rather than a form table or decorative card grid. Each listing reserves room for a long name, UOM/rate information, preview or selected amount, and an immediate ADD/quantity action. Use thin rules, sharp corners, and comfortable touch targets.
- **Rooms:** Keep selection in the project bar and an accessible room menu, without a permanent room rail. A room change updates the catalogue context but never narrows the project-wide basket to that room.
- **Basket:** Use one solid forest tray anchored near the bottom of the work surface, with safe-area and final-row spacing. The tray opens a right-side basket drawer on desktop and a full-height sheet on phone. The drawer shows the selected scope and financial breakdown, with Save/Submit actions and Summary/Proposal navigation. It must close by explicit control and Escape, restore focus predictably, and not duplicate the total elsewhere.
- **Media:** The mockup's small architectural sketches are illustrative category cues. Initial implementation may use simple non-informational linework or typography in that space; it must not reuse the current generic interiors as if they depict the actual line item. No new image or icon dependency is required.

### Type, color, and density

- Reuse the loaded Fraunces/Poppins typefaces. Use matte forest green, warm limestone, pale sage selected state, and dark blue-green ink. Avoid pure white panels, shadows, gradients, glass, rounded cards, or retail yellow. Green marks ADD/selected controls and primary actions; warning/error colors retain semantic use.
- Target about 28–34 px for the page title, 24–28 px for the Main Basket heading, 14–16 px for item names and editable values, and at least 12 px for supporting labels. Use tabular numerals for prices and totals, natural line wrapping, readable contrast, and clear focus indicators.
- Scope presentation tokens and selectors to the estimate item view. Do not change global theme tokens or add a font, icon, animation, or layout dependency.

## Scope and non-goals

**In scope:** configured estimate item-selection presentation and quick-add interaction, compact project/room navigation, available-section tabs, converting existing footer information/actions into a responsive estimate tray and review drawer, product-list presentation, item detail editing, responsive behavior, keyboard/focus states, and focused frontend tests for financial and workflow behavior.

**Out of scope:** Configuration step, Summary/Proposal body redesign, legacy `EstimateBuilder` data behavior, backend/API/contracts, authorization, catalogue or recommendation rules, estimate arithmetic, GST, save/submit payloads, project status/risk logic, migrations, real product imagery, deployment, and external communication.

## Interaction, data, and compatibility constraints

- ADD/removal is the visible control for the existing `included` state. Only included lines contribute to basket, room, and estimate totals. An unselected preview must never be counted or persisted as selected merely because quantity or rate changes.
- Preserve the existing paise-based amount helpers, UOM precision, included/excluded semantics, source lineage, validation, draft status, and save/submit gates. Do not invent or recalculate a financial value to make the new layout look complete.
- Preserve room ID and line ID based state, search/filter outcomes, basket disclosure/navigation behavior, refresh status, unavailable saved/new item handling, recommendation guards, project navigation, and permission/read-only behavior. Saved and unavailable items need visible shelf/basket destinations rather than disappearing in the new structure.
- Reconcile CSS/markup with the pre-existing dirty diffs. Do not overwrite the pending recommendation work or the approved collapsed-basket and live-row-amount behavior.
- No new API request, persistence field, migration, dependency, or external side effect is expected. If implementation reveals that a proposed visual requires one, return to the specification gate before making that change.

## Responsive, accessibility, and failure states

- On desktop, show the full-width catalogue and floating project-wide estimate tray; the basket drawer overlays it only when opened. On tablet and phone, keep the room selector, horizontal section tabs, and one-column item list usable without squeezing long names. On phone, use a compact basket bar and full-height basket sheet; no horizontal page overflow.
- Keep the mobile basket control above browser safe areas and avoid covering the final item. If a fixed treatment leaves too little working area, use a normal-flow control there.
- ADD, quantity plus/minus, item editing, room/section navigation, basket sheet, and all existing actions need item-specific accessible names and visible keyboard focus. Keep focus stable when ADD swaps to a stepper or when removal returns to ADD. Target comfortable touch controls; avoid relying on hover. Match keyboard and visual order, keep status/error messages associated with their fields, and respect reduced-motion settings.
- Preserve clear loading, empty search, no available items, incomplete rate, invalid amount, changed source, unavailable selection, refresh failure, forbidden/read-only, and recommendation states. The interface must not imply a zero total when the total is incomplete.

## Risks and acceptance criteria

Main risks are accidentally changing selection or amount semantics when ADD replaces a checkbox; losing an editable field behind the item editor; hiding Save draft when the basket is empty; drawer conflicts with recommendations; and breaking currently dirty recommendation work or shared Summary/Proposal navigation. Verification needs the one-room screenshot case and wider/longer data.

1. At a desktop viewport, the page follows the approved quick-commerce direction: slim project/room bar, full-width searchable item shelf with ADD/quantity actions, and one floating estimate tray that opens a basket drawer. No permanent sidebars, duplicate totals, invented categories, or generic product photos appear.
2. Initially, the unchecked ₹60 and ₹55 examples show **preview · not included** and the estimate total is ₹0. ADD on POP false ceiling selects exactly one line at 1 sq-ft × ₹60, updates room/basket subtotal to ₹60, GST to ₹10.80, and total to ₹70.80. Minus at its minimum removes inclusion and returns the total to ₹0 without discarding valid draft inputs.
3. Editing quantity or selling rate through the item editor updates the preview while unselected and the basket while selected. A selected missing rate shows an incomplete total and the existing Submit restriction; no false ₹0 or fabricated rate appears.
4. Search, section filtering, room switching, basket/sub-basket access, refresh, Save draft even with zero selected items, Submit estimate, status/messages navigation, Summary/Proposal access, basket open/close, and recommendation entry/close behavior remain functional and accessible. Basket totals include selected items across multiple rooms and are grouped by stable room identity.
5. Long item names, varied UOM labels, pending/error messages, multiple rooms/baskets, and saved/unavailable sections fit at desktop, tablet, and 390 px without clipping, overlap, or horizontal document overflow. Loading, empty, read-only, invalid, stale/failed recommendation, and blocked-submit states communicate their real condition.
6. Focused frontend interaction tests, frontend typecheck/build, rendered desktop/tablet/390 px keyboard and visual checks, `git diff --check`, and final dirty-path review are reported with exact results. No backend or production action is expected.

## Assumptions and open decisions

- The request targets the estimator item-selection screen in the supplied screenshot, not the Configuration, Summary, or Proposal body screens.
- “Like adding items in Blinkit” means the **browse → ADD → quantity control → live basket** interaction, adapted to estimate UOMs, selling rates, GST, save/submit rules, and multiple rooms. It does not mean copying Blinkit's retail checkout, branding, imagery, or prices.
- The visual concepts show one already selected item to demonstrate the interaction and the basket drawer. The actual initial draft may have zero selected lines. Neutral technical sketches in the mockups are visual cues; implementation must not imply item-specific media where none exists.
- No open decision blocks this specification. Approval confirms ADD as the item-inclusion control, minus-at-minimum as removal, full-width room-specific browsing, a project-wide floating tray/review drawer, and the scoped marketplace styling.

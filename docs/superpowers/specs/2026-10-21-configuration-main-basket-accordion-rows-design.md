# Configuration Main Baskets: full-width accordion rows

Date: 2026-10-21
Status: Specification and task plan approved on 2026-10-21; user selected Mode A. Implementation and scoped local verification completed on 2026-10-22. Not deployed; browser checks used synthetic local data.

Approved task plan: [Main Basket accordion-row implementation](../plans/2026-10-21-configuration-main-basket-accordion-rows.md).

## Goal and confirmed target

Replace the web Configuration **Main Basket photo-card grid** with a vertical list of **full-width accordion rows**. The user explicitly clarified that the requested changes apply to Main Baskets such as **POP / Gypsum**, **Functional Lights Supply and Installation**, and **Painting**.

The accepted Sub-Basket sections and the Main Line item cards inside them stay as they are. In the supplied example, `na` and `popp` are Sub-Baskets; `POP false ceiling` and `Cove in Gypsum` are the contained items. They are not the redesign target.

This specification supersedes only the Main Basket grid and large photo-header presentation in the [previous hierarchy specification](2026-10-21-configuration-basket-photo-cards-design.md). Its accepted nested hierarchy and behavioral invariants remain applicable.

## Current behavior and evidence

- The worktree is clean at inspection. The current Main Basket component is included in commit `79b12659` (`differentiated sub baskets`). Capture a fresh worktree baseline before eventual implementation.
- `frontend/src/features/ai-estimator-knowledge/knowledge-index.css` makes `.knowledge-basket-groups` a one-, two-, or four-column grid. Expanded Main Baskets span all columns. Consequently, the open POP / Gypsum panel sits above a row of smaller collapsed category cards, as shown in the user's screenshot.
- The same stylesheet gives collapsed Main Baskets a photo/header layout, with a separate large expanded-only header at the 64rem container breakpoint. Photos have a 108px minimum height and increase to at least 120px in the wide expanded header. Opening a basket changes both its footprint and header scale.
- `KnowledgeBasketCard.tsx` already separates main, sub, and direct presentation. Main Basket disclosure is controlled by its parent, using a native name button, stable panel IDs, a toggle ref, and hidden child content. Creation and management actions are separate slots.
- `KnowledgeBaseIndexPage.tsx` owns independent expansion by stable basket ID, filter-specific disclosure choices, lazy Sub-Basket reads, page counts, role guards, dialogs, and focus recovery. These behaviors already support a vertically stacked accordion.
- `KnowledgeIndexItemCard.tsx` renders the existing named Main Line cards. No changes to that component are needed for this request.

## Scope and non-goals

Scope: Main Basket list composition, Main Basket header layout, and focused regression/visual verification on the web Configuration index.

Preserve Sub-Basket and direct-item sections, their spacing and controls, Main Line cards, the expanded content body's existing layout, category order, and all existing business behavior.

No native mobile-app work, backend/API changes, new data fields, shared image resolver changes, routes, inline Main Line editor, brand/recommendation work, dependencies, fonts, icons, or new image assets. No deployment, production mutation, staging, commit, or push.

## Proposed UI

### Main Basket list

- Render one Main Basket per row at every viewport width. Both closed and open baskets occupy the entire available list width.
- Use a compact, consistent accordion header. Opening a basket reveals its body directly below that header and pushes later rows downward. Closed siblings retain the same full-width header composition; they never become adjacent photo tiles.
- Preserve multiple independently open baskets and the current default collapsed state. Do not introduce an exclusive one-open accordion.
- Keep the current category order, approximately 12px separation between outer panels, and a fine border around each parent. Avoid new decorative frames inside its content.

### Header composition

- Reduce the current large category photograph to an approximately 56–64px square thumbnail. Retain the existing image mapping, lazy loading, neutral failure fallback, and decorative alt semantics. The thumbnail remains the same size when the basket opens.
- Present the small Main Basket label, actual configured name, and truthful `N items on this page` count as the category identity. Use approximately 18px semibold name text in both states; no expanded-only title-size jump.
- Place a clear disclosure chevron beside the name. Keep a broad native name/disclosure button with a visible keyboard focus outline; users need not hit the small chevron precisely. Creation, edit, and delete controls remain separate controls outside the disclosure button.
- On wide screens, keep the category identity on the left and creation/management controls aligned on the right within the same horizontal header. Preserve existing labels and accessible names. Creation buttons should size to readable labels, with sufficient space for management controls.
- Target a compact, content-driven desktop header around 80–96px for ordinary closed content. This is a visual target, not a fixed height: long names, enlarged text, descriptions, and wrapped controls must remain fully visible.
- Keep the existing description visible only when expanded, below the name. Do not duplicate it or move it into the Sub-Basket content.
- Retain the warm stone header, olive controls, existing font, fine neutral borders, and restrained current corner treatment. Add no gradients, shadows, colored left stripe, hover animation, or new decorative icons.

Illustrative order with one open basket:

```text
MAIN BASKET: POP / Gypsum       [page count]       [add actions] [edit] [delete]
  Existing description
  Existing Sub-Basket na
    Existing POP false ceiling and Cove in Gypsum item cards
  Existing Sub-Basket popp

MAIN BASKET: Functional Lights Supply and Installation   [count] [actions]
MAIN BASKET: Painting                                   [count] [actions]
MAIN BASKET: General Items                              [count] [actions]
```

Each Main Basket header includes the compact thumbnail and disclosure control described above. The example indicates structure, not new literal product copy.

### Responsive behavior

- Main Baskets remain a single column on desktop, tablet, and narrow mobile web widths.
- At constrained widths, wrap actions together onto a second header row. Keep creation and management groupings coherent and fully visible, without reserving empty toolbar space for restricted roles.
- Allow names and descriptions to wrap naturally. No truncated-only identification, horizontal page scroll, squeezed action labels, or fixed-height clipping.
- Keep current nested-body insets and responsive Main Line grid behavior. The compact parent header must not alter the accepted child layouts.
- Preserve touch target sizes and ordinary document scrolling. No new motion or animation is needed.

## Interaction, data, and compatibility

- Presentation changes only: reuse current expansion state, stable IDs, order, callback semantics, and refs. No persistence or API transition changes.
- Keep native `aria-expanded`/`aria-controls`, Main Basket h2 names, existing Sub-Basket headings, and keyboard Enter/Space disclosure. Hidden child content remains unavailable to keyboard interaction.
- Preserve initial lazy reads, independent expansion, filter reveal/temporary filtered collapse, clearing filters, paging, and refresh behavior.
- Keep the qualified current-page counts. Do not invent total item counts or infer empty inventory from an unloaded catalog.
- Keep every existing role-specific action guard, catalog-freshness check, confirmation/reason rule, version conflict, retry, and focus-restoration behavior. Clicking an action must not also toggle the accordion.
- Preserve loading, empty, stale, failed child catalog, retry, read-only, and update-only states. Image failures do not hide names or controls.
- No schema, permission matrix, notification, observability, or migration change. Rollback is limited to frontend presentation; existing saved data remains compatible.

## Constraints and risks

- Several existing CSS selectors are shared across main/sub/direct variants. Restrict any changed header/photo/action styling to the main variant to avoid changing accepted Sub-Baskets.
- The wide header must accommodate a long category name and four actions. Wrap at content-driven breakpoints instead of reducing controls below usable sizes.
- Changing the Main Basket markup could break panel associations or focus refs. Prefer retaining the existing presentation contract; verify native disclosure and dialog focus if structure changes.
- Only parent presentation should change. Preserve `KnowledgeIndexItemCard.tsx`, item-card CSS, shared image consumers, and child section layout. Any required adjustment beyond that scope must be reconciled before implementation.

Likely affected areas: `KnowledgeBasketCard.tsx`, `KnowledgeBasketCard.test.tsx`, main-variant/root-list rules in `knowledge-index.css`, and narrowly relevant index assertions. Exact ownership and dependency ordering belong in the separate task plan after approval.

## Acceptance criteria and verification

1. **AC1: Full-width accordion.** Every Main Basket occupies its own full-width row in closed, open, and mixed states at 1920, 1440, 1024, 768, 390, and 320px. Opening one basket preserves the header width and sibling order, with no multi-column card layout.
2. **AC2: Compact consistent parent header.** The category photo is a small thumbnail; title size and header composition stay consistent between states. Names, counts, descriptions, and grouped actions remain readable at each width and at 200% text.
3. **AC3: Accepted children preserved.** Sub-Basket sections, direct-item groups, and Main Line cards retain their current appearance and controls. Compare expanded content at matching widths before and after, including repeated names and empty groups.
4. **AC4: Behavior preserved.** Independent expansion, lazy reads, search/filter reset, pagination, qualified counts, all role guards, item navigation, dialogs, rename/delete focus, conflict confirmation, and refresh-only recovery retain existing behavior.
5. **AC5: Accessible and responsive.** Keyboard and touch-equivalent disclosure work; actions do not toggle parents; focus remains visible; narrow/200% text views have no overflow or clipped controls. Check image failure, empty/error/retry, read-only, and update-only states. Run automated accessibility checks alongside visual inspection.
6. **AC6: Scoped verification.** Run relevant existing component/index/presentation and mutation regressions, frontend typecheck/build, and repository diff hygiene on the final tree. Inspect rendered screenshots of collapsed and mixed-open Main Basket rows with actual nested content. Record exact checks, warnings, limitations, and any unrun suites; no deployment is implied.

## Assumptions and open decisions

Confirmed by the user: the redesign target is Main Baskets, not Main Lines. The accepted contents inside Sub-Baskets remain unchanged.

Design assumption for approval: keep existing category images as small thumbnails in the new row headers. The user requested accordion presentation, so the previous responsive photo-card grid is removed at all widths. No other product decision is required before specification approval.

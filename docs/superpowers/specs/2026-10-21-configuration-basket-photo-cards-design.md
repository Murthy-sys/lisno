# Configuration basket hierarchy: distinct visual levels

Date: 2026-10-21
Revision: 2
Status: Revision 2 specification and task plan approved on 2026-10-21; user selected Mode A. Implementation and scoped local verification completed. This revision supersedes the previous same-card treatment for Main Baskets and Sub-Baskets. Not deployed; rendered verification used synthetic local data.

Implementation plan and historical record: [Configuration basket hierarchy task plan](../plans/2026-10-21-configuration-basket-photo-cards.md). Revision-1 checks establish prior behavior, not acceptance of the rejected visual hierarchy.

## Goal and corrected interpretation

Make the web Configuration hierarchy immediately understandable and visually refined:

**Main Basket → Sub-Basket → Main Line name**

The user rejected the previous result because Main Baskets and Sub-Baskets still looked like the same expansion panel. A small category label and slight background change were insufficient. Main Baskets must establish the category, Sub-Baskets must read as subordinate groups belonging to that category, and Main Lines must remain the named items within each group.

Use the estimation reference for Main Basket imagery and the existing warm/olive visual language. Each hierarchy level needs its own composition, scale, and spacing. The same photo-card design must not repeat at every depth.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBasketCard.tsx` renders the same photo/header/content/actions/body anatomy for `main`, `sub`, and `direct` variants. Only the heading level and a Sub-Basket eyebrow differ.
- `knowledge-index.css` gives those variants the same border, header grid, 128px minimum header height, photo area, and disclosure treatment. Main and nested grids share the same four/two/one-column rules. The Sub-Basket modifier only changes its header background.
- `KnowledgeBaseIndexPage.tsx` passes a category image to Main Baskets, a matching or inherited parent photo to Sub-Baskets, and the same parent photo to direct-item groups. This repeats the strongest visual signal across all levels and weakens ownership.
- Main Basket and Sub-Basket expansion already use stable IDs. Rendering and lazy catalog reads share the effective parent expansion state. Applied filters reveal matching content and keep temporary filtered choices separate from unfiltered choices. These working behaviors do not need replacement.
- Main Line cards already display actual configured item names with existing summaries and actions. Preserve those names and their navigation targets.
- Counts come from the current paginated item list. They must continue to say “items on this page”; no total inventory or Sub-Basket count can be invented from unloaded catalogs.
- The worktree contains the prior hierarchy work plus unrelated brand and recommendation changes. Preserve those changes; capture per-target baselines before implementation writers start.

## Scope and non-goals

Scope: presentation of the web Configuration Main Basket/Sub-Basket hierarchy, including its direct-item group, responsive composition, accessibility, and the smallest integration/test adjustments needed for the distinct structures.

Keep existing disclosure behavior, initial collapsed Main Baskets, filter reveal, independent multiple-open groups, lazy reads, search, paging, mutations, dialog contents, item metadata, and permissions. Existing actions remain independently usable.

No backend/API/schema changes, native mobile changes, image uploads, new assets/dependencies/fonts/icons, new routes, master-detail navigation, drag-and-drop, Main Line workspace redesign, brand/recommendation changes, deployment, or production mutation.

## Proposed visual composition

### Level 1: Main Basket as the category container

- Keep the estimation-inspired horizontal photo cards in the collapsed overview. Only Main Baskets use representative photography. Show a quiet “Main Basket” eyebrow above the configured name to make the level explicit.
- Give the category name stronger hierarchy: approximately 18px/semibold in the overview and 20px/semibold when expanded, using the existing interface font and responsive tokens. Preserve long names with natural wrapping.
- Keep the current category photo, qualified page count, and permitted creation/edit/delete controls. Visually group the named creation actions separately from the smaller management controls so they form an intentional toolbar rather than wrapping arbitrarily between one another.
- Opening a Main Basket spans the available grid width at its logical position. Its photo/name header becomes the top of a single category container. On desktop the category identity anchors the left, its actions sit to the right when space permits, and the description sits below the name. At narrower widths these areas stack in DOM order.
- Use a warm stone header surface, fine outer border, modest existing corner treatment, and clear internal spacing. The outer container is the primary boundary for everything belonging to this Main Basket. Use about 20–24px inner spacing on desktop and 12px on narrow screens, adjusted to existing spacing tokens.
- The collapsed Main Basket overview keeps four/two/one columns based on available content width. Expanded Main Baskets remain independent; no exclusive-selection workflow is introduced.

### Level 2: Sub-Baskets as nested group sections

- Remove Sub-Basket photo blocks and inherited category photos. A Sub-Basket becomes a compact full-width group section inside its Main Basket, not a second category/photo card.
- Stack sibling Sub-Baskets vertically in configured order. Each group has a compact header and an immediately attached item area when expanded. Do not reuse the Main Basket photo-card grid for these children.
- Use a small “Sub-Basket” eyebrow, the actual configured Sub-Basket name at approximately 16px/semibold, a clearly secondary page-count capsule, and a separate disclosure control within the name button. Keep edit/delete controls aligned at the header end on desktop and on their own line when needed on narrow screens.
- Target a 64–80px compact header with content-driven growth, not a fixed height. Its hierarchy comes from smaller scale, inset placement, typographic weight, and its connection to the Main Line area.
- Use a quiet warm surface, a fine bottom separator, and vertical separation between sibling groups. Avoid giving every group the same heavy outer frame, image, or toolbar as its Main Basket. Do not use a colored left stripe or decorative tree connectors.
- Opening a Sub-Basket reveals its Main Line cards directly beneath its header with a small additional inset. The cards remain visually contained within that group. Closing it removes only that group's visible child content.
- Empty Sub-Baskets retain the same compact group header and current truthful empty/page-empty message. Repeated names in different Main Baskets remain visibly owned by their surrounding parent and distinct by stable IDs.

### Level 3: Main Lines as named items

- Keep the exact Main Line name as the item card's primary linked text. Do not replace it with a generic “Main Line” name, the parent name, or a new category photo.
- Keep the existing item card anatomy, summaries, completion, unit, priority, menus, rename/delete actions, and workspace link semantics. The task changes the surrounding hierarchy, not item business information.
- Use the current responsive item grid within its Sub-Basket section. Preserve usable card widths and keyboard order; no additional expandable category shell around each item.

### Direct items

- Present “Items directly under Main Basket” as a separate, quiet content section below the real Sub-Baskets, with no representative photo and no “Sub-Basket” label.
- It retains its current disclosure/default-open behavior and actual Main Line cards. It must never resemble a configured Sub-Basket or receive an invented ID, rename action, or delete action.

### Concrete example

The layout below describes ownership and relative emphasis; it is not literal product copy or an interactive mockup.

```text
MAIN BASKET
[category photo]  POP / Gypsum                       [creation actions] [management]
                  16 items on this page
                  Existing category description

    SUB-BASKET
    Gypsum ceilings                  15 items on this page       [edit] [delete] [open]
    ────────────────────────────────────────────────────────────────────────────────
        [Gypsum false ceiling]   [Ceiling profile 1]   [Ceiling profile 2]
        [existing Main Line information and actions within each named item]

    SUB-BASKET
    Shared finish                     1 item on this page        [edit] [delete] [closed]

    SUB-BASKET
    Empty Sub-Basket                   0 items on this page      [edit] [delete] [closed]
```

The hierarchy must remain recognizable if the small level labels are temporarily ignored: Main Basket photography and stronger category header, compact subordinate group sections, and named leaf cards are three different structures.

## Theme and responsive requirements

- Reuse the existing interface font, olive action color, warm stone/off-white surfaces, fine neutral borders, and current spacing/focus tokens. Richness comes from photography at the category level, disciplined composition, typography, and nesting.
- Add no shadows, harsh/radial gradients, pure-white replacement theme, colored left stripe, glass effects, rainbow category colors, 3D, hover animation, new icon package, or oversized rounded containers.
- At wide sizes, align category identity, counts, and action groups deliberately. Nested Sub-Baskets remain full-width sections instead of competing photo tiles.
- On 390px and 320px layouts, stack actions when needed, keep visible hierarchy with reduced inset, and allow names to wrap. Avoid nested padding that squeezes Main Lines below usable widths. All operative targets retain accessible hit areas; no action requires hover.
- Verify 1920/1440/1024/768/390/320px and 200% text. Content must not overflow, names must not truncate as the only identification, and destructive controls must remain fully visible.

## Interaction, data, and permission invariants

- Keep expansion IDs, current query keys, lazy query enabling, filter-specific state, cache invalidation, ordering, and current-page counts. Opening/closing and image failure must not mutate data.
- Applied search/filters continue to expose matching parent/group/item results. Clearing filters restores ordinary expansion choices. Pagination and refresh retain surviving choices.
- Keep create/update/lifecycle permissions, role-specific gates, catalog freshness, immutable identity/version lineage, confirmation and reason validation, conflicts, and refresh-only recovery unchanged. Presentation never becomes authorization.
- Keep loading, stale data, unavailable records, empty catalog/search/group, failed child catalog, and retry states explicit. Never imply empty inventory from an unloaded/error catalog or a zero page count.
- Use native name/disclosure buttons with `aria-expanded`/`aria-controls`; keep actions outside these buttons. Main Basket headings use level 2, Sub-Basket/direct-section headings level 3, and existing named item headings retain their logical order. Do not add application/tree ARIA roles without implementing their keyboard contract.
- Maintain focus on the trigger after toggling. After rename/delete/cancel, restore focus to a surviving visible control, then the visible parent or existing page fallback. Hidden descendants must not receive focus.
- No schema, migration, persistence, authorization-operation, notification, or new observability requirement. Rollback is a frontend presentation change only; shared estimator/Procurement image consumption remains compatible.

## Architectural constraints and risks

Keep queries, mutations, filters, and permissions in `KnowledgeBaseIndexPage`. Presentation may share low-level disclosure logic, but it must expose different Main Basket and nested-group structures. Do not merely add another class or badge to the existing identical photo-card markup.

Likely affected areas are `KnowledgeBasketCard.tsx`, its tests, index-scoped `knowledge-index.css`, and minimal hierarchy integration/regressions in `KnowledgeBaseIndexPage.tsx` and its tests. The task plan will define exact ownership after this specification is approved.

Principal risks:

- A vertical Sub-Basket stack may use more scrolling than collapsed child tiles. Compact headers and independent disclosure keep the item workspace readable and make ownership explicit.
- Larger category typography and grouped management actions can overflow at intermediate widths. Allow content-driven wrapping and verify real long names at the stated widths.
- Different markup can break refs, accessibility associations, and focus recovery. Preserve stable panel IDs/refs and exercise dialogs and keyboard interaction on the rendered result.
- Existing global styles can erase local hierarchy differences. Inspect actual production styles in the browser; structural and visual acceptance must both pass.
- Existing dirty files contain unrelated work. Snapshot target diffs before writing; do not reformat or revert neighboring changes.

## Acceptance criteria

1. **AC1: Recognizable hierarchy.** With Main Basket, Sub-Basket, and Main Line visible together, each has a distinct composition. Only Main Baskets contain representative category photos. Sub-Baskets have compact full-width nested section headers; actual Main Line names remain prominent on leaf cards. Category labels and color alone are insufficient to satisfy this criterion.
2. **AC2: Rich, coherent layout.** Collapsed Main Baskets retain the estimation reference's photo-card language. Expanded parents have a stronger category header and intentionally grouped actions. Nested sections have a clear inset, separate typography, and attached item areas. Existing theme and prohibited-style constraints are respected.
3. **AC3: Correct relationships.** Real Sub-Baskets, same-named groups under different parents, empty groups, and direct items preserve ownership and stable IDs. Multiple groups open independently and remain in logical DOM order.
4. **AC4: Behavior preservation.** Existing add/edit/delete, permissions/freshness, exact confirmation, version conflicts, refresh-only recovery, navigation, filter reveal/reset, paging, lazy reads, truthful counts, and focus behavior pass focused regression checks.
5. **AC5: Responsive and accessible.** The width/text matrix has no horizontal overflow or clipped controls. Keyboard/touch-equivalent disclosures, headings, focus, image fallback at the parent level, empty/error/retry, and restricted-role states remain usable. Automated accessibility checks complement visual review.
6. **AC6: Scope and evidence.** No backend, contract, native app, dependency, or unrelated feature edits. Run focused component/index/dialog tests, frontend typecheck/build, and diff hygiene on the final integrated result. Inspect actual rendered screenshots that show all three levels together at desktop and narrow widths. Report exact results, warnings, and unrun checks.

Use synthetic local records, including POP / Gypsum → Gypsum ceilings → Gypsum false ceiling, long names, repeated Sub-Basket names under different parents, direct items, empty groups, and more than 20 items. Compare the visual result directly against the user's stated hierarchy requirement. Passing existing behavior tests alone does not establish visual success.

## Assumptions and open decisions

This is a correction to the web Configuration visual hierarchy. Existing inline disclosure and saved data relationships remain suitable. The proposed main-photo/sub-section/item-card distinction is the recommended interpretation of “differentiate main basket/sub basket hierarchy properly with rich UI.” No additional product choice is needed beyond approval of this concrete direction.

The revised specification and task plan are approved, and the user selected parallel execution. No deployment, production mutation, staging, commit, or push is authorized.

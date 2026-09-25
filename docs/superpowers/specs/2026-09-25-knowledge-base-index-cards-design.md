# AI Estimator Knowledge Base: card-based index redesign

Date: 2026-09-25
Status: Approved 2026-09-25 ("keep search with filter (with icons) and do required changes"), including the three open-decision defaults. The approval added one clarification to R2: the Search button also carries an icon. Task plan: [2026-09-25-knowledge-base-index-cards.md](../plans/2026-09-25-knowledge-base-index-cards.md).
Classification: Substantial, frontend only. It touches several files on a shared configuration page, with no backend, data or permission change.
User request: "I need to do changes as per attached screenshot in configuration page." The reference screenshot is in this conversation.
User decisions (2026-09-25, recorded before this spec):

1. **Thumbnails:** a placeholder tile, with no image upload.
2. **Card metrics:** existing data only. The footer shows configured sections and the unit of measure next to the real priority chip.
3. **Search and filters:** keep them, in a compact toolbar.
4. **Basket icon:** one shared icon for every basket.

## Goal

Restyle the Configuration → AI Estimator Knowledge Base index (`/admin/configuration/estimation`) to match the reference:

- the header with its five actions;
- a dismissible isolation notice;
- a basket panel for each Main Basket, with an icon tile, name, description, item count, add buttons and icon-only edit and delete buttons;
- a responsive grid of item cards. Each card has a thumbnail tile, name, temporary badge, completeness percentage and bar, a ⋮ menu, and a metrics footer.

Every value shown must come from existing data. The reference's "12 rules" and "3 units" have no backing data. Following the user's decision, the footer shows real configured-section and unit-of-measure values instead.

## Current behavior and evidence

Read-only inspection on 2026-09-25. `frontend/` had no uncommitted changes in this feature, and the vendor-directory work lives in other files.

| Area | Source | Current state |
| --- | --- | --- |
| Page | `features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx` (966 lines) | `PageHeader` with the same five actions as the reference: Manage reusable values, Manage baskets, Add main basket, Add temporary item, and Add estimation item (primary). Permission-gated. |
| Notice | `KnowledgeSafetyNotice.tsx` → `NoticeBanner` | Same text as the reference, with no dismiss control. Also used by `KnowledgeItemWorkspacePage.tsx` and `KnowledgeReusableValuesPage.tsx`. |
| Search and filters | same file, lines 330–448 | A full `Surface` panel: a labelled search field, Filters (advanced disclosure) and Search, applied-filter chips, and the advanced filter grid with Basket, Status, Priority, Mode, Surface, Unit and Vendor. The reference doesn't show it. The user chose to keep it, compacted. |
| Basket panels | lines 480–549 | A collapsible heading with a chevron, the name, an "N items" pill, and compact text buttons: "Add estimation item", "Add temporary item", "Edit basket", and "Delete" (with the basket name hidden visually). No icon or description is shown, although `KnowledgeBasket.description` exists. |
| Item cards | lines 522–543 | A name link to the item workspace, a "Temporary item · Must be completed" badge, "N% complete" and a `ProgressBar`. No thumbnail, menu, priority or metrics. |
| Item data | `knowledgeTypes.ts:287` `KnowledgeItemListItem` | Has `priorityId`, `uomId`, `completeness.sections[]` (state `complete`, `needs_attention`, `not_configured` or `not_applicable`), `itemType`, `completionRequired`, `modeIds`, `surfaceIds`, `vendorIds` and `allowedActions`. **No image, rule-count or unit-count field.** |
| Priority master | `backend/src/domain/ai-estimator-knowledge-priority.ts` | Priorities have a `name` and a `semanticTier` (`non_negotiable`, `high`, `medium` or `low`). The page already loads priorities and units (up to 100 each) for its filters. |
| Basket data | `KnowledgeBasket` | `name`, `description` (nullable), `status`. No icon field. |
| Styles | `ai-estimator-knowledge.css` (5,345 lines) and `knowledge-configuration-ui.css` (1,050 lines) | Shared by every knowledge page, including the item workspace. `.knowledge-page` is on all of them. |
| Tests that render the index | `KnowledgeScreens.test.tsx` (4 renders), `KnowledgeBasketDeletion.test.tsx`, `KnowledgeAutomaticDisplayOrder.test.tsx`, `KnowledgeFoundation.test.tsx` (notice region) | Some assert the exact texts "Edit basket" and "Temporary item · Must be completed". |
| Width | `styles/shell.css:331` | The page is capped at 1440px and centered, like the vendor directory was before its amendment. |

## Scope

### In scope (frontend only)

- `KnowledgeBaseIndexPage.tsx`. It may extract small presentational components into new files in the same folder, for example a basket panel, an item card and a card menu.
- `KnowledgeSafetyNotice.tsx`, for an optional dismiss behavior used only by the index.
- A new stylesheet scoped to the index, for example `knowledge-index.css`, under a new `.knowledge-page--index` modifier.
- The affected knowledge tests.

### Non-goals

- Item image upload or storage.
- A stored basket icon.
- New rule or unit counts.
- Backend, DTO, OpenAPI or permission changes.
- Item lifecycle actions (duplicate, deactivate, archive) on the card. They stay in the item workspace.
- Changes to the item workspace, the reusable-values page, dialogs, filter semantics, pagination rules, or the Sales estimate builder.
- New dependencies. The page already uses `lucide-react` icons.

## Requirements

### R1 — Header and notice

- Keep the eyebrow, title, description, and all five actions with their current permissions, handlers and order. Restyle them to match the reference: outlined secondary buttons with icons, and the dark olive primary "Add estimation item".
- The index shows the isolation notice with a dismiss (×) button. Its accessible name is "Dismiss notice".
  - Dismissing hides it for the current page visit only; it returns on the next visit, because it is a safety notice.
  - The item workspace and reusable-values pages keep the notice without a dismiss button.
  - The region name "Knowledge base isolation notice" stays unchanged.

### R2 — Compact search and filter toolbar

- Put the search input (with its leading search icon), the Filters toggle (with its sliders icon and active-count badge) and the Search button (with a search icon) in one slim row. All three controls share one height and align on one baseline. The current screen has them misaligned.
- The label "Search Basket or Main Line" stays for assistive technology but is hidden visually. The placeholder text carries the visible prompt.
- Applied-filter chips, the advanced filter disclosure and grid, Clear filters, Apply filters, and the filter and query semantics are all unchanged.
- The toolbar wraps cleanly on narrow widths.

### R3 — Basket panels

- Header, left to right:
  - an expand/collapse chevron (the existing toggle and `aria-expanded`/`aria-controls`);
  - a shared basket icon tile (decorative, `aria-hidden`);
  - the basket name as the `h2` toggle label;
  - the basket description under the name, when one exists. Filtered groups whose basket record isn't loaded show no description.
- Right side:
  - the "N item(s)" pill;
  - "Add estimation item" and "Add temporary item" as secondary buttons with plus icons, keeping their current handlers and the hidden "to {basket}" suffix in their names;
  - an icon-only pencil button for Edit, named "Edit basket {name}", with a matching tooltip;
  - an icon-only red bin button for Delete, named "Delete {name}", with a matching tooltip.
- Permission gating, the basket editor and delete dialogs, and the announcements are unchanged.
- The collapsed state hides the body exactly as it does today.

### R4 — Item cards

- **Grid:** responsive, filling the basket body. Four columns at wide widths as in the reference, then 3, 2 and 1 as space shrinks, with no fixed breakpoints tied to the viewport.
- **Card layout:**
  - **Thumbnail tile:** a placeholder with the shared basket icon on a warm neutral surface. It is decorative and fetches no image. Temporary items use the same tile.
  - **Name:** the existing link to `/admin/configuration/estimation/items/{mainLineId}`. The whole card is not a link, so nested controls stay valid.
  - **Temporary badge:** visible text "Temporary item" in the amber style from the reference. "Must be completed" stays in the badge's accessible text and tooltip whenever `completionRequired` is true, and the existing `aria-describedby` link from the name is kept.
  - **Completeness:** "N% complete" with the existing `ProgressBar` and its accessible label and value text.
  - **⋮ menu** at the top right, named "More actions for {item name}". It has one item, "Open item", which navigates to the workspace.
    - It opens with Enter, Space and ArrowDown.
    - Escape and Tab close it and return focus to the trigger.
    - A click outside closes it.
    - It follows the vendor-directory `RowMenu` interaction pattern.
  - **Metrics footer,** described under R5.
- **Card states:** hover and focus-within states follow the design system, and there is a visible focus ring on the link, menu and buttons.

### R5 — Truthful card metrics

- **Sections:**
  - The value is the count of `completeness.sections` in state `complete`, over the count of sections not in state `not_applicable`.
  - It displays as "5/7 sections" with a document icon. The accessible text is "5 of 7 sections complete".
  - If no applicable sections exist, the metric is hidden.
- **Unit of measure:**
  - The name of the unit whose ID matches `uomId`, looked up in the unit catalog the page already loads. It displays with a ruler icon.
  - It shows "No unit" when `uomId` is null, and "Unit unavailable" when the ID isn't in the loaded catalog.
  - The reference's clock icon is not used, because it would suggest time.
- **Priority chip:**
  - The name of the priority whose ID matches `priorityId`, looked up in the loaded priority catalog, with tone set by `semanticTier`. Non-negotiable and High use red, Medium uses amber, and Low uses green.
  - The chip always shows its text and icon, so color is never the only signal.
  - It shows muted "No priority" when `priorityId` is null, and "Priority unavailable" when the ID isn't in the catalog.
- No rule counts, unit counts, scores or images are invented. While catalogs are loading or have failed, the unit and priority values show "…" (loading) or "unavailable". The existing "Some filters are unavailable" warning still covers the failure case.

### R6 — Width and layout

- The index page fills the workspace width, using the scoped `:has()` approach from the vendor-directory amendment, so the four-column grid has room. Other pages stay capped at 1440px. See open decision 2.
- Vertical rhythm is tighter, as in the reference.

### R7 — Styling scope

- New styles live in the index-only stylesheet under `.knowledge-page--index`. Existing shared rules are overridden there, and the shared stylesheets aren't edited, unless a shared rule blocks the layout; any such case is listed in the plan.
- Use the existing tokens, colors and Poppins type. The olive primary, the amber temporary badge, and the red, amber and green priority tones stay close to the reference.
- No new fonts or dependencies.

### R8 — Responsive and accessible

- **Widths:** check 1920, 1440, 1280, 1024, 768 and 390px.
  - Basket header actions wrap under the title on narrow widths.
  - On phones, cards stack in one column, and the add buttons may become full-width.
  - The page never scrolls horizontally.
- **Accessibility:**
  - Semantic headings are kept (`h1`, `h2` per basket, `h3` per item).
  - Every icon-only control has an accessible name and tooltip, and a target of at least 44px.
  - There is a visible focus ring, and zero axe violations.
- **States:** loading, error with retry, empty (no baskets or no matches), refreshing, filtered and paginated states all behave as today.

### R9 — Behavior preserved

These stay unchanged:

- queries and query keys;
- grouping, including empty live baskets appearing when no filter is applied;
- pagination (20 items per page);
- collapsed state;
- every dialog: create or edit basket, delete basket with impact check, manage baskets, create item, create temporary item;
- navigation after creation;
- mutation sync and invalidation;
- announcements and focus return.

## Data, API and UX impact

- **Data/API:** none. It uses the existing list, basket, priority and unit responses only. No requests are added or removed.
- **UX:** a denser, visual, card-based page. Search stays available in a slimmer toolbar. Card menus add a second path to open an item.
- **Rollback:** revert the frontend files. No stored state; notice dismissal lives in component state only.

## Assumptions

- The reference's sample content (names, percentages, counts and photos) is illustrative.
- The ⋮ menu offers only "Open item" for now. Lifecycle actions stay in the workspace, which already enforces blockers, reasons and versions. See open decision 1.
- The reference's gear icon on the priority chip becomes a small priority icon from the existing icon set.

## Risks

| Risk | Mitigation |
| --- | --- |
| Shared knowledge CSS changes leak into the item workspace or other pages | A new index-only stylesheet under a `.knowledge-page--index` scope, and a visual spot check of the item workspace and reusable-values pages |
| Catalog limits (100 priorities or units) leave some names unresolved | Show "Priority unavailable" or "Unit unavailable". Don't guess or fall back to IDs |
| Sections fraction misread as quality | The label says "sections", with an explicit accessible "N of M sections complete". The completeness bar stays the primary signal |
| Existing tests depend on exact button and badge text | Update them to the new accessible names and keep equivalent assertions |
| Full-width page differs from other pages | Page-scoped rule; open decision 2 |

## Acceptance criteria

- **AC1 Visual match:**
  - At 1920 and 1440, compare rendered screenshots side by side with the reference: the header and actions, dismissible notice, compact toolbar, basket panels (icon tile, description, pill, add buttons, pencil and bin), and four-column cards with placeholder tile, badge, progress, ⋮ menu and metrics footer.
  - The sample data covers:
    - active and temporary items;
    - 0% and high completeness;
    - every priority tier and a missing priority;
    - a known unit, a missing unit and an unknown unit;
    - a basket with and without a description;
    - an empty basket.
- **AC2 Truthful data:**
  - Unit tests prove the section fraction (including `not_applicable` exclusion), the unit and priority name lookups, and their fallbacks.
  - No card shows rules or units counts or images, and no image requests are made.
- **AC3 Preserved behavior:** existing index tests pass, updated only for the intended name and text changes. They cover search, the Filters disclosure, chips and clear, pagination, collapse, every dialog path, permission-hidden controls and announcements.
- **AC4 Menu and notice:**
  - The ⋮ menu works by keyboard and pointer, with focus returning to the trigger, and "Open item" navigates to the right workspace.
  - The notice dismisses on the index only. The region name stays intact, and the other pages keep the notice with no dismiss button.
- **AC5 Responsive and accessible:**
  - At the six widths in R8: no page-level horizontal overflow, zero axe violations, 44px icon targets, and a visible focus ring.
  - Cards reflow from 4 columns down to 1.
- **AC6 Scope and regression:**
  - The item workspace and reusable-values pages look unchanged in a spot check.
  - Knowledge tests (`src/features/ai-estimator-knowledge`), typecheck, build and `git diff --check` pass.
  - Only in-scope files change. No lint claim, because the repo has no lint script.

## Open decisions (defaults proposed; approving the spec accepts them)

1. **Card ⋮ menu contents.** Default: "Open item" only.
2. **Page width.** Default: the Knowledge Base index fills the workspace width, as the vendor directory now does. Other pages stay capped at 1440px.
3. **Notice dismissal persistence.** Default: for the current visit only, not remembered across visits, because it is a safety notice.

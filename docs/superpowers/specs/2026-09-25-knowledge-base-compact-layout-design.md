# Configuration Knowledge Base: compact layout and icon actions

Date: 2026-09-25
Status: Approved and implemented in Mode A. Verification evidence and remaining limits are recorded in the [task plan](../plans/2026-09-25-knowledge-base-compact-layout.md#execution-record-2026-09-25).
Classification: Substantial frontend presentation refinement, confined to the Configuration index.

Follow-up refinement, 2026-09-25: the user's request to further tighten the Main Basket and TV Unit label spacing reduces basket vertical padding from 8px to 4px and card title tiles from 32px to 28px, with 8px vertical card padding and 4px title-to-progress gaps. This stays within the approved compact-layout scope; the original approximate 110–135px card target is superseded by content-driven cards around 103px for short labels. Preserve 44px action targets and a 45px minimum basket header with zero vertical padding after the subsequent POP / Gypsum refinement, so collapsed read-only baskets remain operable.

## Goal

Make Configuration → AI Estimator Knowledge Base show more useful content per screen with less empty space, compact item cards and basket headers, and icon-only Filter and Search actions beside the search input. Preserve readability, every existing action, truthful data, keyboard access, and responsive behavior.

The current user screenshot is the visual baseline. This specification refines the earlier [card-index design](2026-09-25-knowledge-base-index-cards-design.md). The latest request supersedes its large placeholder treatment and visible Search/Filters button text; the earlier data, permission, navigation, and lifecycle invariants remain applicable.

## Current behavior and evidence

Read-only inspection of the live worktree on 2026-09-25:

| Area | Source | Evidence and consequence |
| --- | --- | --- |
| Route | `frontend/src/app/router.tsx` | `/admin/configuration/estimation` renders `KnowledgeBaseIndexPage`. The request concerns this index, not all Configuration descendants. |
| Header | `KnowledgeBaseIndexPage.tsx`, `knowledge-index.css` | Five permission-gated actions, an eyebrow/title/description, and page gaps of `--space-5`. Title may wrap beside the action cluster, consuming vertical space. |
| Notice | `KnowledgeSafetyNotice.tsx` | Isolation notice is dismissible for this index visit only. Shared item/reusable-values pages retain it. Index CSS adds generous padding and a colored leading border. |
| Search | `KnowledgeBaseIndexPage.tsx` | A search field with leading magnifier, a Filters button with sliders and active count, and a Search submit button with magnifier. Both buttons currently show text. |
| Basket header | `knowledge-index.css` | Decorative basket tile is 60px; header adds 12px padding above/below and a 56px chevron zone, plus large actions/count styling. |
| Cards | `KnowledgeIndexItemCard.tsx`, `knowledge-index.css` | Cards reserve a 120px thumbnail column and a 120 × 110px decorative tile. The body uses a bottom-pushed progress block (`margin-block-start: auto`), leaving empty space below short titles. Metrics occupy another full-width row. |
| Grid | `knowledge-index.css` | Minimum card width is 340px and gaps use `--space-4`; less content fits across ordinary laptop widths. |
| Existing coverage | `KnowledgeIndexPage.test.tsx`, `KnowledgeIndexPresentation.test.tsx` | Covers search submit, filter disclosure, truthful metrics and fallbacks, card menu navigation, and notice behavior. CSS geometry requires browser checks. |

## Scope and preservation

In scope: index-only layout/style rules in `knowledge-index.css`, presentational structure in `KnowledgeIndexItemCard.tsx`, Search/Filters control markup in `KnowledgeBaseIndexPage.tsx`, and focused tests for changed control accessibility/interaction. Header, notice, and basket density should be scoped overrides on this page.

Out of scope: backend/API/schema changes; filter/query semantics; pagination size (currently 20); item data/completeness calculation; image uploads; changing permissions; the item workspace, reusable-values page, vendor panels, navigation shell, or dialogs. No dependency, font, or icon package additions. No commit, push, seed, migration, or deployment.

These files already contain uncommitted work from the earlier card redesign, including untracked card/style/test modules. Preserve its real metrics, temporary-item semantics, menus, notice dismissal, basket controls, and related tests. Current unrelated vendor and mobile changes must remain untouched. Capture the relevant target diffs again before any implementation writer starts; do not treat untracked files as disposable.

## Proposed layout and requirements

### R1. Compact page hierarchy

- Keep the existing title, description, and all five header actions with their current labels, order, handlers, and permission rules.
- Reduce the title to a restrained approximately 24–28px desktop scale using the existing font. Let actions occupy a compact second row before they force the title into awkward wrapping. Do not hide commands in a new menu.
- Use approximately 12px vertical gaps between main blocks, 8–12px inside compact groups, and smaller scoped header/button padding. Use established spacing tokens where appropriate.
- Present the notice as a compact, quiet information line with its message and dismiss action intact. Let text wrap naturally on narrow screens. Remove the decorative leading stripe and excessive padding on the index only.
- Maintain at least 44 × 44px targets for icon-only actions and touch controls. Reduce decorative area before reducing usable targets or readable type.

### R2. Icon-only Search and Filters

- Toolbar order remains search input, Filters icon action, Search icon action. Remove the visible words on those two buttons only. Retain the existing leading icon inside the input.
- Use the existing accessible `IconButton`/tooltip patterns and the familiar search/sliders symbols already present on this screen; no new icon library.
- Accessible names remain `Search` and `Filters`. Show those labels on hover and keyboard focus through the established tooltip. Decorative SVGs are hidden from assistive technology.
- Search stays a native `type="submit"` action; Enter in the input submits the same form. Filters stays `type="button"`, retains `aria-expanded`/`aria-controls`, and opens the same disclosure.
- Keep the active-filter count as a small readable badge when nonzero, and make its count available to assistive technology without relying on color or changing submit/disclosure semantics. Do not clip it at narrow widths.
- Use matching 44px square targets immediately beside the input. Allow the input to shrink with `min-width: 0`; keep this toolbar on one row at supported phone widths where the two targets and a useful input fit.
- Applied chips, Clear all, advanced fields, Apply filters, loading/unavailable states, and draft-versus-applied behavior remain unchanged.

### R3. Dense basket headers

- Reduce the decorative basket tile to approximately 28–32px and tighten its chevron spacing. Keep the basket name/description, item count, add actions, edit/delete actions, and current collapse behavior.
- Aim for a normal desktop header around 56–64px tall when the content fits one row. Longer names/descriptions and wrapped actions must grow naturally without clipping.
- Use smaller count styling and compact text-button padding. Wrap actions below the name only when needed; preserve descriptive accessible names including the target basket.
- Empty baskets remain visible under existing rules; collapsing does not change query state or counts.

### R4. Compact item cards

- Preserve the inventory-card arrangement. Replace the large thumbnail block with a small approximately 28–36px decorative placeholder next to the title, retaining the existing no-upload behavior.
- Arrange the title and menu first, then the temporary badge when applicable, completeness text/bar, and the existing section/unit/priority metadata. Remove the artificial blank space before progress.
- Keep names readable and naturally wrapping; do not use fixed card heights or remove metadata to reach a density target. The menu must remain distinct from the title link, with its existing keyboard handling and focus return.
- Aim for short ordinary cards around 110–135px high, with approximately 10–12px padding and 10–12px grid gaps. Temporary badges, long names, and metadata may increase height.
- Reduce the minimum card width from 340px to approximately 250–270px. Use available content width to determine columns: at least four cards across when the basket body has at least 1100px, then adapt down to one on phones. Do not scale the whole page or alter browser zoom.
- Preserve real completion values, applicable-section fraction, unit lookup, priority semantics, unavailable/loading fallbacks, and the temporary-item required-completion accessible description.

### R5. Visual consistency and responsive states

- Keep the current typography and olive primary-action emphasis. Use existing warm neutral surface tokens, quiet borders, and compact corner treatments; remove decorative card shadows and excess tinted blocks. Add no gradients, new illustrations, hover motion, or ornamental effects.
- Keep heading/body/metadata hierarchy clear: approximately 14–15px item names and 12–13px metadata, without reducing everything to tiny text.
- Scope all overrides under `.knowledge-page--index`. Shared controls and other configuration screens must retain their behavior and layout.
- At 1920, 1440, 1280, 1024, 768, 390, and 320px, avoid horizontal page overflow, clipped text, overlapping menus, and unreachable actions. At 200% text zoom, allow content-driven wrapping.
- Preserve initial loading, background refresh, no matches, empty baskets, filter catalog failure, item-query failure/retry, and read-only/permission-hidden actions. Do not invent success values to fill missing data.

## Data, state, and compatibility

No data/API contract changes, extra requests, persisted preferences, or migrations. Backend authorization remains authoritative. Search application, filter disclosure, chips, page offsets, basket expansion, notice dismissal, item navigation, mutation invalidation, and dialog focus return follow existing state transitions. Only their presentation changes.

The earlier design's decisions to use placeholders and existing metrics remain intact. Full lifecycle actions remain in their existing dialogs/workspace. Rollback is limited to this refinement's frontend diff; preserve the earlier redesign and other uncommitted changes.

## Acceptance and verification

| ID | Acceptance criterion | Evidence |
| --- | --- | --- |
| AC1 | Less wasted space and visibly more content at the same viewport, sidebar, data, and zoom | Before/after screenshots at 1440 × 900 and 1920 × 1080; short representative card heights reduced by at least 25%; first basket content starts higher on the page. |
| AC2 | Search/Filters show only icons while remaining discoverable and operable | Rendered tooltip/focus checks, accessible names, 44px targets, native submit and Enter search, disclosure toggle, active count, applied chips/reset. |
| AC3 | Card information and actions retained | Regular/temporary cards, short/long names, high/zero completion, all priority/missing/catalog-failure states, unit/section metrics, keyboard menu and item link. |
| AC4 | Basket/header density improved without removing functionality | Collapse/expand, empty basket, description wrapping, add/edit/delete controls, permission-hidden actions, notice dismissal and focus return. |
| AC5 | Responsive, readable, and accessible | Width matrix above, 200% text zoom, no horizontal overflow, visible focus, no clipped menu/badge, axe check with no new violations. |
| AC6 | Bounded changes and regression safety | Focused index/presentation/basket tests, frontend typecheck/build, `git diff --check`, spot-check item workspace/reusable-values layout. Report any existing test failures separately. |

Use synthetic fixtures and a local environment or API-mocked harness for browser QA; do not seed or mutate real configuration data. Record geometry as well as screenshots so density claims are measurable. No implementation-mirroring tests for spacing values; browser evidence covers layout.

## Risks, assumptions, and open decisions

- Assumption: “maximum content” means denser presentation, not larger API pages, hidden fields, smaller browser zoom, or a table replacement.
- Assumption: only Search and Filters lose their visible button text; other action labels stay.
- Risk: the existing index stylesheet has high-specificity overrides and responsive rules. Edit the relevant existing rules coherently and inspect the actual cascade instead of piling on conflicting patches.
- Risk: long titles/priority labels and count badges may defeat nominal card sizes. Allow wrapping and preserve content rather than enforce fixed heights.
- Risk: these targets contain earlier uncommitted work. Use reviewed per-target baselines and explicit ownership during implementation.
- No unresolved product decision requires a separate question. The recommended approach is a denser version of the current card UI. The task plan will be created after this specification is approved under the repository workflow.

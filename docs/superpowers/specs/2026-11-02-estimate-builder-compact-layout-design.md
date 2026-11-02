# Compact estimate builder

Date: 2026-11-02
Status: Approved; implemented and verified under the corresponding task plan

## Goal

Give Main Basket, Sub-basket, and editable estimate items substantially more visible space by reducing the stacked header, toolbar, navigation, and footer footprint. Use compact typography and necessary spacing within the existing Lisno visual language.

The user's supplied screenshot is the visual problem reference. It shows a separate back row, a large project heading and total box, a generously spaced workflow disclosure, tabs, search controls, basket shortcuts, and a tall footer surrounding the actual item content.

## Current behavior and evidence

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` renders the back control separately from the title/header. The project number has a separate line. The workflow disclosure appears between the header and builder controls. Tabs and project navigation are already grouped inside the bounded builder.
- `EstimateBuilderArea` in that file measures available viewport height after its top position, footer height, workspace gap, and shell bottom padding. Reducing surrounding chrome can therefore directly increase the item pane's height without changing estimate logic.
- `frontend/src/styles/estimator-dashboard.css` sets a 14px item-view gap; the header has an 82px minimum height plus its content constraints; the total panel has a 70px minimum height. Tabs, search controls, and basket shortcuts contribute separate rows.
- The same stylesheet gives the room rail a 205–250px column, basket shortcuts a 48px minimum height, basket headings a 43px minimum height, and nested margins/padding around line items. Current row typography is already small in places, including 10px metadata and 11px item names. Reducing every font indiscriminately would harm readability.
- `frontend/src/features/leads/staffEstimateCollaboration.css` gives the workflow disclosure summary 10px vertical padding on each side. Its expanded content has separate workflow actions and requirements that must remain accessible.
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` already supports filtering, selected-item navigation, basket/sub-basket collapse, quantity/rate editing, classification, dimensions, validation, and floating row menus. These behaviors are retained.
- CSS includes several historical override layers and responsive/container rules. Implementation must verify computed sizes in a rendered browser rather than assume an earlier selector wins.

The screenshot's bitmap dimensions are not treated as its CSS viewport. Baseline measurements will use controlled browser viewports.

## Scope and non-goals

In scope: the configured Estimate Builder item-selection workspace, its heading, collapsed workflow disclosure, tabs/project controls, search/filter controls, room rail, basket shortcuts, basket/sub-basket headings, line spacing, and action footer. Apply the same compact presentation to supported staff roles and workflow versions using this workspace.

Out of scope: Configure estimate layout, Summary and Proposal layout, global application navigation, client quotation pages, PDF/export layout, pricing calculations, permissions, project numbering, API contracts, persistence, workflow transitions, and new functionality. Legacy catalogue rendering remains functionally intact; it does not require a new layout in this task.

## Proposed UX

### Compact top area

- Place the back control and project identity within one compact masthead instead of reserving a separate full-width back row.
- Use an approximately 18–20px title. Present client/project/location/project number as compact metadata, wrapping naturally for long values. Preserve the unassigned project-number state.
- Keep the total and “Total including GST” at the right on desktop in a compact treatment. Remove decorative space from the calculator ornament; it must not dictate header height.
- Use one compact disclosure row for workflow and client requirements, retaining the open count, native keyboard operation, and expanded content. The existing initial collapsed/open behavior remains unchanged.
- Preserve every blocking warning, error, delivery status, and permission-dependent action. They may increase page height when present.
- Keep tabs and Messages/Project status/Critical controls on one row when width permits. Size tabs to their labels instead of unnecessarily stretching them across a large reserved width.
- Keep search, section filter, and Refresh items on a tightly spaced row on desktop. Refresh text must not wrap into two lines when there is sufficient room for the three controls.

### Basket and item content

- Reduce the desktop room rail to approximately 180–200px and the gap to the content to 8–10px. Preserve room identity, area, amount, active state, and selected-item view. Long room labels remain discoverable.
- Make basket shortcuts compact navigation controls, approximately 34–38px tall on desktop. Keep item counts and subtotals visible. Preserve horizontal scrolling for many baskets.
- Use roughly 34–36px Main Basket headings and 30–32px Sub-basket headings in normal single-line desktop states. Keep hierarchy, collapse affordances, counts, and amounts clear.
- Reduce nested horizontal padding and item gaps. Use roughly 4–6px between rows and 6–8px row padding; reduce thumbnails to approximately 36–40px where this improves density.
- Use approximately 12px item text, 11–12px secondary labels, and 12–13px numeric inputs/totals. Do not shrink existing tiny metadata further to meet a height target.
- Keep ordinary unselected, single-line desktop rows around 60–68px where their labels fit. Selected rows, dimensions, pricing detail, long names, and errors can grow naturally. No fixed-height clipping.
- Preserve full values and warnings for quantities, rates, totals, source freshness, and classifications. Do not hide essential editing controls behind new menus.

### Footer and scrolling

- Use a compact desktop action bar, approximately 48–56px for its normal state, with total/status at the left and save/submit actions at the right. Prefer inline total/selection metadata where it fits.
- Preserve actual button labels, disabled/pending states, and accessible names. Longer workflow action labels wrap or increase the bar height when necessary.
- Retain the existing independently scrollable item pane and room navigation where appropriate. Reconcile minimum-height rules with available space so compacting the header actually enlarges the visible basket pane.
- Expanded workflow content and short viewports must retain a usable page-scroll fallback. The footer, last item, and focused controls must remain reachable and unobscured.

### Responsive and accessible behavior

- Desktop density comes primarily from layout and spacing. At tablet/mobile widths, wrap toolbars and metadata without page-level horizontal overflow.
- Preserve the existing responsive room navigation pattern. Avoid a large permanent sidebar on narrow screens.
- Use at least 24px interactive hit areas on desktop, with approximately 40–44px coarse-pointer controls where needed. Do not reduce checkbox/stepper/menu operability merely to shorten rows.
- Keep focus indicators visible, sensible DOM/tab order, labelled inputs, heading hierarchy, native disclosure behavior, and basket `aria-expanded`/`aria-controls` semantics.
- Use 16px editable input text on narrow touch layouts where necessary to avoid mobile browser focus zoom. At browser zoom, reflow and scrolling take precedence over density targets.
- Preserve the existing restrained colors, font family, and icon set. No new dependencies, icon library, animations, gradients, shadows, or decorative effects are needed.

## Integration and invariants

- Add a builder-specific scope or equivalent explicit marker to prevent style leakage into Configure, Summary, Proposal, and other users of shared builder components.
- Extend the current components and styling. Consolidate conflicting rules within scope where necessary; do not rewrite unrelated CSS.
- Keep estimate state, calculations, mutation handlers, cache invalidation, query keys, stable IDs, project-number display, authorization, and workflow branching unchanged.
- No data model, API, migration, background job, notification, or external delivery changes are required. This work adds no backend side effects.
- Existing loading, empty, stale catalogue, validation, read-only, and failed-save states must remain usable.
- The repository is already dirty, including `LeadEstimateWorkspace.tsx`, its tests, and `estimator-dashboard.css`. Before implementation, capture the current dirty-path set and per-target baseline, then preserve prior initiation, numbering, and quotation changes. Any future parallel ownership must avoid overlapping file writes.

## Acceptance criteria

1. **More content:** At 1440×900 and 1280×800 CSS pixels, using the same populated fixture, 100% browser zoom, collapsed workflow, and normal successful state, the vertical distance from workspace top to first Main Basket heading decreases by at least 25% against the captured baseline. The scrollable item pane gains at least 80 CSS pixels of height. Record measured before/after values rather than infer them from screenshots.
2. **Visible improvement:** The normal desktop fixture shows at least one additional complete simple line item without scrolling, with basket/sub-basket context and save actions still available. Use enough identical-shape rows to make this comparison meaningful.
3. **Compact presentation:** The header has no separate space-consuming back row; metadata uses available width; collapsed workflow, tabs, search, basket shortcuts, and footer follow the density targets above. Targets are natural content sizes, not clipping constraints.
4. **Behavior preserved:** Search, section/selected filters, room switching, basket and sub-basket collapse, quantity/rate editing, dimensions, tier/classification selection, menu keyboard handling, saving, and submission still behave as before. Project numbers and totals remain accurate and visible.
5. **States preserved:** Long project/basket/item names, an unassigned number, multi-digit totals, selected rows with detail, validation messages, expanded workflow, and read-only/blocked states remain legible and operable.
6. **Responsive/accessibility:** Render at desktop sizes above, 768×1024, and 390×844, plus a 200% desktop zoom/reflow check. No unintended page-level horizontal overflow, overlapping controls, clipped essential text, inaccessible scroll regions, or obscured focus/last row. Coarse-pointer hit areas and mobile input text remain usable.
7. **Scope preserved:** Configure, Summary, and Proposal retain their existing presentation and behavior; no backend/API/persistence changes or new dependencies.
8. **Verification:** Relevant existing frontend component/workspace regression tests, frontend typecheck/build, rendered interaction/accessibility checks, and `git diff --check` pass or have precisely documented pre-existing failures. Do not add tests that merely assert CSS declarations. Browser measurements and screenshots are the evidence for density. No repository lint command exists.

## Risks and mitigation

- **CSS cascade leakage:** Use explicit builder scoping and inspect computed styles in all target widths and adjacent views.
- **Oversized minimum-height fallback:** Verify short viewports, expanded workflow, footer wrapping, and visual-viewport changes; retain scrolling rather than conceal overflow.
- **Over-compression:** Prioritize removing redundant gaps and repeated vertical rows. Let complex content expand and protect input readability and hit areas.
- **Financial information truncation:** Amounts and units must wrap or receive adequate width. Ellipsis is limited to navigation labels with a discoverable full value.
- **Dirty worktree conflicts:** Use task-specific baselines and narrowly scoped changes. Rollback means reversing only this task's changes, never resetting shared dirty files.

## Assumptions and open decisions

- “Sub-basket/main content more” means increasing the visible editing area within the existing estimate builder, not introducing a new estimation flow.
- “No extra padding” permits the small spacing required for readability, focus outlines, and touch operation.
- The existing components and viewport-sizing mechanism provide a credible implementation path; no new layout library or architecture choice is necessary.
- No product decision remains open. Exact computed dimensions will be tuned during approved implementation to satisfy the measurable criteria and content/accessibility constraints.

## Approval boundary

This file is the specification only. No task plan or product code is created at this stage. After specification approval, create the separate task plan, obtain its approval, and request execution mode under the repository workflow.

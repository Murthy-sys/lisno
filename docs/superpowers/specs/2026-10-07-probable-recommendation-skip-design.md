# Estimate builder: optional recommendations and fixed controls

Date: 2026-10-07
Status: Approved on 2026-10-08. Implementation authorized in Mode A after task-plan approval; verification recorded in the linked plan.

## Goal

Let an estimator explicitly choose **Not necessary** for a configured Probable Addition while keeping the selected source Main Line. Non-Negotiable Additions retain the existing two actions. Use the categories already saved in Configuration.

Also keep the controls shown in the user's first screenshot visible while only the recommendation panel and item sections shown in the second screenshot scroll. This layout request is included with the recommendation change in the [approved implementation plan](../plans/2026-10-08-estimator-recommendations-fixed-controls.md).

## Current behavior and evidence

- `shared/knowledge/knowledgeRecommendationPresentation.ts` maps added-item rules with `requirement: "must"` to **Non-Negotiable Additions**, and `requirement: "can"` to **Probable Additions**.
- `estimationCatalogueApi.ts` already exposes that discriminator. `roomRecommendations.ts` preserves source/rule IDs, target IDs, revisions, room selection, availability, and category. Required recommendations take precedence when rules share a target.
- `EstimatorRecommendations.tsx` flattens available Main Line and Sub Basket recommendations, deduplicates targets, and shows one pending item at a time. Both categories currently receive **Not now** and **Add recommended item**, with a generic Configuration suggestion badge.
- `LeadEstimateWorkspace.tsx` tracks newly selected source lines for an automatically opened modal. Closing without any related selection can uncheck the source, including a source whose additions are all probable. Merely adding another close button would therefore remove the source instead of recording an optional choice.
- The workspace currently preserves a source when any matching related target is selected. This request does not introduce stronger required-item enforcement or a new save/publication constraint.
- Existing recommendation tests cover dismissal, shared targets, stale responses, room changes, and recommendation-origin cleanup. Several workspace, builder, fixture, and style files already contain earlier approved changes; those must be preserved.
- `LeadEstimateWorkspace.tsx` renders the Estimate Builder/Summary/Proposal tabs above `ConfiguredEstimateBuilder`. Messages is currently positioned from the project navigation in the preceding workspace header.
- `ConfiguredEstimateBuilder.tsx` renders its search/filter/refresh toolbar above a two-column room rail and content grid. The content grid contains basket shortcuts, the recommendation panel, and basket sections in the same normal page flow. Its `jumpToBasket` uses `scrollIntoView`, which can also move ancestor scroll containers.
- `estimator-dashboard.css` currently provides no bounded vertical item pane or sticky builder controls. The basket shortcuts already scroll horizontally; at narrower widths the room rail becomes a horizontal layout. Existing line menus are positioned within rows and must remain usable at scroll boundaries.

## Scope and non-goals

Change the estimator recommendation modal and the corresponding local review/dismissal state, plus the configured Estimate Builder's fixed-control and scrolling-content layout. Preserve the preceding compact basket/Main Line UI work, item modes, pricing, recommendation additions, and deselection cleanup.

No Configuration authoring changes, backend/API/schema changes, new permissions, dependencies, migrations, historical estimate rewrites, deployment, or permanent dismissal preference are required. Do not change the ordinary Cancel/Not now, close icon, Escape, or backdrop behavior for an unanswered recommendation.

## Required behavior

1. Show the configured category in the modal using **Non-Negotiable Addition** or **Probable Addition**. Derive it from `must`/`can`, never names or reason text.
2. For an available, unselected Non-Negotiable Addition, retain the two current actions: **Not now** and **Add recommended item**. Do not render **Not necessary**.
3. For an available, unselected Probable Addition, add **Not necessary** alongside the two current actions. All three actions remain compact and wrap on small screens. Keep Add visually primary.
4. **Not necessary** records an explicit skip for the displayed target in the current room/review. It must not add the target, alter quantities or rates, reveal a basket, record recommendation-selection origin, or change totals. Advance to the next pending recommendation, using the existing navigation and completion pattern.
5. When every actionable recommendation for a newly selected source is optional and has been explicitly skipped (or is already selected), completing/closing the review keeps that source selected. A source with unanswered optional recommendations and no selected related target retains the existing ordinary-dismissal behavior. Skipping one optional item does not silently skip the others.
6. A skip never counts as an added target and never satisfies an outstanding Non-Negotiable Addition. In a mixed review, keep required items pending and preserve their current Add/Not now behavior. Preserve the existing successful-add rule described above; this change does not strengthen or weaken it.
7. Preserve target deduplication and required precedence across direct Main Line rules, Sub Basket children, and multiple included sources. If any applicable rule makes a displayed target non-negotiable, that target cannot be skipped. A shared probable target is reviewed once for the applicable sources in that room.
8. At completion, use truthful copy such as **All recommendations reviewed** when anything was skipped. Do not say all items were selected. Announce the skipped item to assistive technology and move focus to the next action or Done. Adjust the automatic-dismissal explanation to distinguish explicitly skipped probable items from unanswered recommendations.
9. Keep the existing Add flow, including same-room source identity, recommendation-origin tracking, automatic basket reveal, and configuration-based pricing. Adding an item after a prior review still works normally.

## Fixed controls and scrolling items

1. **Stationary controls, screenshot 1:** keep Estimate Builder/Summary/Proposal tabs, Messages, search, All Sections filter, Refresh items, By Section/Selected controls, room navigation, and Main Basket shortcuts visible while browsing the builder's item content. On desktop, retain the room rail on the left and the shortcuts above the right-hand pane. Do not duplicate controls to achieve this.
2. **Scrolling content, screenshot 2:** place the recommendation summary panel, Main Basket/Sub Basket headings, and item rows in one vertical scroll pane below the basket shortcuts. The recommendation panel scrolls with the items. Basket/Sub Basket headings do not acquire additional sticky behavior. Include empty, saved/unavailable-item, loading, and error content in an accessible location within this structure.
3. Use a local builder layout with a height bounded by the available viewport and explicit shrinking grid/flex tracks. Tabs and toolbar sit outside the item scroll pane. Keep surrounding application navigation, project context, notices, and Save/Submit actions reachable; do not apply an unconditional body scroll lock or overflow rule to unrelated screens. Once the work area is in view, scrolling its items must not move the controls or chain into the outer page at the pane's boundaries.
4. Basket shortcuts expand the chosen basket and scroll only the item pane to its heading, retaining existing search/filter clearing and reduced-motion support. A heading must not land behind the fixed controls. Keyboard focus must scroll offscreen item inputs into view without shifting the control area. Room changes and a new search/filter context start the item pane at the top; quantity/rate changes, selection, collapse, and recommendation-dialog close preserve a usable position rather than resetting the entire pane.
5. Use the actual available space and content sizing rather than fixed offsets that assume one header height. Loading notices, validation messages, resized windows, and browser zoom must not create overlap, a zero-height pane, or inaccessible final rows. Keep row menus and recommendation dialogs visible above or within the appropriate scroll boundary; closing a dialog restores focus and item position.
6. On tablet/mobile, adapt the control region into compact rows and retain horizontal access to room and basket shortcuts. Keep the requested controls accessible while the recommendation/item pane scrolls. Avoid expanding navigation into a tall vertical stack that consumes the viewport. If a very short or zoomed viewport cannot fit the work area, keep the outer page navigable so all controls and content remain reachable instead of clipping them.
7. The room rail remains stationary during item scrolling. If its own room list exceeds the available height, permit scrolling that navigation list solely to reach additional rooms; this must not move the item pane or hide By Section/Selected. Horizontal shortcut scrolling is similarly independent.
8. Preserve compact cards, radio choices, Quantity/Price/Amount dimensions, selection state, and totals. Do not change Configure, Summary, Proposal, or historical-only builder scrolling beyond the structural changes needed to keep their navigation and content functional. Switching tabs must not inherit a stale item-pane height, scroll lock, or clipped content.

The recommended structure uses a single explicit item scroll pane, with controls outside it. Stacking multiple sticky elements in the existing long page would require fragile height offsets and would not establish the requested isolated content scrolling. No new UI dependency is needed.

## State, compatibility, and failure handling

- **Recommended scope:** a skip is a local decision for the current review, not a saved suppression rule. Manual **Review recommendations** can show the optional target again, so the estimator can reconsider. Deselecting and reselecting a source starts a new review. Saving/reloading preserves normal source selection, not a hidden skip preference.
- The alternative of persisting dismissals across visits would require a versioned estimate decision contract and rules for Configuration changes. It is outside the requested button change and is not proposed here.
- Identify skips by room, stable target identity, and the current applicable source/rule context. Revalidate against the current ready view before accepting or using a skip. Reuse the existing source revision/item version and catalogue freshness protections.
- Clear obsolete review decisions when the modal is reopened for a new review, the room/estimate changes, the source is deselected or replaced, Configuration refresh invalidates the context, or editability is lost. A stale skip must never suppress a newly required recommendation.
- Disable mutation actions in read-only/loading states, and retain the existing error, forbidden, stale, unavailable-item, and refresh handling. An unavailable or incompatible target cannot be marked successfully reviewed through the new action.
- A late response, double click, or room switch must not add/remove lines or exempt another source based on an obsolete skip. Existing safe dismissal guards remain authoritative.
- No backend write occurs when skipping. The ordinary draft save continues to persist the included source and calculate amounts through the existing backend path. Configuration and approved snapshots remain untouched.

## Risks and controls

| Risk | Control |
| --- | --- |
| New button closes the modal and unchecks the source | Explicitly distinguish skip from ordinary dismissal and test the workspace result. |
| Optional skip bypasses a required shared target | Preserve `must` dominance and validate the effective target category. |
| Skip leaks between rooms, sources, or Configuration revisions | Scope to stable identities and the current review context; invalidate stale decisions. |
| Completion misleadingly claims skipped scope was included | Separate reviewed/skipped state from selected state and keep totals unchanged. |
| Third action overflows or loses keyboard focus | Reuse the dialog/button patterns, allow wrapping, and verify narrow layouts and focus progression. |
| Nested scrolling moves the page or hides item rows | Bound only the builder pane, contain scroll chaining, and verify the first and last rows with real browser scrolling. |
| Fixed controls consume the viewport or overlap menus/messages | Use responsive sizing and compact navigation; test short viewports, zoom, dialogs, and menu boundaries. |

## Acceptance criteria and verification

1. A `must` target exposes the existing two actions and no Not necessary action. A `can` target exposes all three actions with the correct category label.
2. Select a source with one probable target, choose Not necessary, and finish the modal: the source stays included, the target stays excluded, and only the source contributes to totals and the next saved draft. Reload retains the source selection.
3. Multiple probable targets can be independently added or skipped. Skipping one advances correctly; explicitly skipping all preserves the source. Ordinary dismissal before the remaining optional decisions are answered retains the established dismissal behavior when no target was added.
4. Mixed `must`/`can` rules, shared targets, and Sub Basket children preserve required precedence. An optional skip alone cannot exempt a source with an unanswered required target. Successfully adding a related item retains existing behavior.
5. Unrelated selected sources and the same Main Line in another room remain unchanged. Manual review supports reconsideration; deselect/reselect starts fresh. No skipped target receives recommendation-selection origin.
6. Loading, read-only, forbidden, unavailable, stale Configuration, late-response, room-change, and source-removal cases cannot execute or apply an invalid skip. Existing recommendation-origin cleanup and ordinary dismissal regressions continue to pass.
7. Rendered desktop and mobile checks verify three-button layout, keyboard access, focus after skip, accessible action names, announcements, and truthful completion copy. No horizontal overflow or console errors are introduced.
8. Run focused recommendation presentation/workspace/domain tests, frontend typecheck and production build, and repository diff hygiene after implementation. Broaden only if changes expose another affected boundary. There is no repository lint script.
9. At desktop and laptop widths, record control and content positions before and after scrolling a long item list. All screenshot-1 controls remain at the same position, the recommendation panel and item rows move, and the final row and Save/Submit actions remain reachable. Scrolling at the top/bottom of the item pane does not move the outer page.
10. Basket jumps move only the item pane and expose the requested expanded heading. Search, filter, room changes, By Section/Selected, keyboard navigation, expand/collapse, and recommendation Add/Not necessary continue to work without unexpected selection or scroll resets. A row menu near the bottom and a recommendation modal remain fully usable.
11. Verify representative 1440×900, 1024×768, and 390×844 layouts, plus a short landscape viewport and 200% zoom. Check long room/basket lists, long names, notices, unavailable items, and no search results. There must be no page-width overflow, obscured focus, clipped actions, or inaccessible scroll region.
12. Switching Configure/Builder/Summary/Proposal and opening Messages leaves each destination functional with appropriate scrolling. Preserve the previously verified compact Main Line layout. Add focused builder/workspace interaction coverage and rendered scroll/accessibility checks; CSS position behavior requires a real browser, not only DOM tests.

## Assumptions and open decisions

- **Not necessary** applies to the currently displayed Probable Addition, not every optional recommendation at once.
- Keep the current **Not now** / **Add recommended item** labels; the user's Cancel/Add wording refers to those existing actions.
- Use the current-review lifetime above; persistent dismissal history was not requested.
- Screenshot 1 identifies the controls to retain; the recommendation panel visible at its bottom belongs to the scrolling area because it is explicitly included in screenshot 2. Room-list overflow and horizontal shortcuts remain independently navigable when necessary.
- No additional product decision is required before specification approval. The separate task plan follows that approval under `AGENTS.md`.

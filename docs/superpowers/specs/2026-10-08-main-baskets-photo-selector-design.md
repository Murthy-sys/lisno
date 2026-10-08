# Main Baskets photo selector

## Goal
Match the attached reference's Main Baskets section: compact horizontal photo cards in four desktop columns, search beside Refresh available items, a clear selected state, and a bottom selection bar with the selected count, Clear all, and Continue to item selection. Preserve the user's earlier requests to omit basket descriptions, count badges, and basket-level item type/pricing controls.

## Baseline behavior and evidence
- Route: `/estimator-sales/leads/:leadId/estimate`, configure view in `frontend/src/features/leads/LeadEstimateWorkspace.tsx`.
- `MainBasketSelectionCard` in that file already renders a cube glyph, configured name, Add/Added toggle, selected marker, and independent disclosure button. The disclosure exposes the real Sub Baskets and available-item information. Cards have no photos.
- The configure view renders catalogue loading, refresh, denied/error, empty, legacy-service, and unavailable-item states, then the basket list and a separate Continue button. There is no basket search, selected-count summary, or Clear all action.
- `frontend/src/styles/estimator-dashboard.css` supplies compact card styling and one/two/three/four-column container breakpoints. The new reference calls for horizontal photo cards rather than the existing stacked icon/title/actions composition.
- `EstimationCatalogueBasket` in `estimationCatalogueApi.ts` exposes stable ID, name, optional description, order, Sub Baskets, and direct temporary items. It has no image field. `backend/src/models/AiEstimatorKnowledgeBasket.ts` also has no photo property. The repository has general interior images but no complete set of category photos matching the screenshot.
- Selection lives in `selectedMainBasketIds`. Removing one basket also invokes `deselectConfiguredRecommendationSources`, clears pending recommendation context, and preserves line objects and their entered quantities/rates. Continue uses `buildLines`, requires rooms and a selected basket, and respects catalogue/editability gates.
- `LeadEstimateWorkspace.test.tsx` already covers independent toggle/disclosure behavior, keyboard operation, hidden descriptions/count badges, refresh failure, saved selections, locked estimates, and builder round trips.
- Current target files have no pre-existing diff. Separate completed LeadDetail/payment/navigation changes and their documents remain dirty and must be preserved. Capture the current dirty-path set again before implementation.

## Scope and non-goals
Change the Main Baskets chooser and its configure-view selection footer only. Keep Project details, room selection/dimensions, the application shell, lead header, item builder, Main Line pricing controls, recommendation rules, estimate saving, approvals, and publication behavior intact.

No backend/API/schema changes, Configuration data writes, photo-upload management, new routes, dependencies, migrations, customer messages, commits, or deployment. Catalogue order, names, identities, eligibility, and warning counts remain authoritative. Do not hardcode the screenshot's 17 baskets, selected basket, or unavailable-item count.

## Recommended approach
Extend the current chooser and selection state. Use scoped styles and a focused presentational component if extracting the existing card makes the large workspace easier to maintain. Keep catalogue loading, mutations, and estimate state in their existing owner.

The screenshot is the visual source of truth for card composition and density. Retain the established interface typeface, muted green selection colors, quiet off-white surfaces, and inline SVG symbols. Use restrained borders and compact corners; add no decorative gradients, shadows, hover motion, or icon dependency.

## Requirements

### Header and search
- Keep the Configuration eyebrow, Main Baskets heading, explanatory sentence, and dynamic catalogue notice in the reference's hierarchy.
- Put a labeled search field with placeholder `Search baskets...` beside Refresh available items on wide screens. Wrap controls cleanly when the available width narrows.
- Search the loaded basket names locally, case-insensitively, with trimmed input. Preserve catalogue ordering. Search does not issue a request or modify selected IDs, pricing, room data, line values, or recommendation decisions.
- Distinguish `No baskets match your search.` from an empty catalogue. Provide an accessible way to clear the search. Keep the global selected count and Continue eligibility independent of filtered results.
- Preserve the existing refresh behavior and error messages. Keep search and selections while refreshing. A failed refresh must retain the existing last-loaded display and mutation restrictions.

### Compact photo cards
- Display four equal columns at desktop chooser widths of approximately 1050 CSS px and above, two at intermediate widths, and one at narrow widths. Match the attached four-column composition at wide desktop size without shrinking readable text or controls. No three-column intermediate layout is needed.
- Each collapsed card has a portrait/square-cropped category photo on the left spanning the content height. On the right, place the small cube glyph beside the basket name, then a wide Add/Added button and narrow details-arrow button.
- Target roughly 128–148 CSS px collapsed card height at typical desktop sizes, with 8–12px internal spacing and 10–16px gaps. Keep images consistent and controls aligned. Allow genuinely long names and enlarged text to increase height instead of clipping content or forcing excessive blank space on every card.
- Selected cards use the reference's green outline, restrained background tint, top-right selected marker, and Added button. Do not increase card dimensions when selected.
- Keep Add/Added as an accessible toggle with the basket name and pressed state. Clicking Added deselects using the existing behavior. The details arrow expands/collapses details independently and never changes selection. Expanded detail content sits below the photo/content row; other cards should not stretch vertically to fill that expansion.
- Do not restore basket descriptions, summary count chips, checkboxes, Standard/Special controls, or pricing modes to the collapsed cards. Preserve the current useful disclosure information.

### Image assets and truthful presentation
- Use optimized, locally bundled representative category photographs matching the supplied reference's subjects and framing. The original individual photographs are not available in the repository, so exact photographic reproduction is not promised. Generate suitable category assets during the approved implementation stage if existing reusable assets cannot cover the subjects.
- Subjects from the reference include POP/gypsum ceiling, pendant lighting, painting roller, general tools, switches, on-site woodwork, modular cabinetry, decorative ceiling, light fixtures, glass partitions, glass stair/railing, material samples, ACP facade, slatted ceiling, PVC ceiling, metal framing, and interior furnishings.
- Use a small deterministic presentation-only asset resolver for known category labels and aliases. Labels may select decoration only; every selection, saved reference, and business operation continues to use stable basket IDs. Do not infer a business category, rate, or relationship from an image or label.
- Per the user's implementation-stage clarification, unknown or unrelated names receive a static neutral skeleton thumbnail instead of a photograph. Failed images use the same placeholder. Preserve card dimensions and usable controls; do not announce a permanent placeholder as loading. Decorative images use empty alt text because the adjacent heading identifies the basket.
- Reserve image dimensions to avoid layout shifts, use appropriate compressed dimensions, lazy-load offscreen assets, and avoid runtime external image hosts. Record asset provenance in the implementation handoff. No new upload/storage infrastructure is in scope.

### Selection footer
- Replace the separate configured Continue button with one configure-only bottom bar: selected-count badge and Clear all on the left; Continue to item selection with a static arrow on the right.
- Keep it sticky at the bottom of the existing content scroll region while browsing baskets. Respect the app sidebar, mobile safe area, and keyboard. Reserve enough space for the last card and focused controls to remain visible; avoid introducing a second basket-list scroller or changing the builder's existing scroll system.
- Count all selected basket IDs, including selections hidden by search. Display `0 selected` when empty. Announce selection changes without moving focus.
- Clear all deselects all baskets, including filtered-out selections, as one local state transition. Apply the same recommendation-source cleanup as individual deselection. Retain room configuration, line objects, saved IDs, entered quantities/rates, classification data, and persisted records. Do not save, delete, or refetch merely because Clear all was clicked. Do not automatically restore previous included-item choices when baskets are re-added if individual deselection does not do so today.
- Disable Clear all when nothing is selected or selection editing is disallowed, including a catalogue error. Search and read-only details remain usable where the current loaded catalogue is visible.
- Continue retains its existing gates: at least one room, at least one selected basket, a usable catalogue, and an editable estimate. It opens the existing builder using all selected IDs regardless of search. There must be only one configured Continue action.
- On mobile, wrap the count/Clear all row above a full-width Continue action when necessary, retaining compact spacing and reliable touch targets. Keep the historical-items branch and its Return to saved items behavior unchanged.

## State, permissions, and compatibility
This adds local search state and a local bulk-deselect interaction only. No new persisted fields or API contract. Existing query keys, invalidation, catalogue freshness, ID lineage, backend authorization, immutable published amounts, and integer-paise calculations remain unchanged.

Locked/submitted estimates keep selection actions and Continue disabled under the same existing rules. Zero-item baskets remain selectable when editable. Missing selected catalogue entries must not be silently discarded by search or refresh. Clear all may remove their local selection explicitly, but must retain their saved-line data and existing recovery behavior.

Use the same deselection source cleanup for a bulk operation to avoid leaving required/probable recommendation inclusion attached to deselected sources. Avoid repeatedly calling a toggle closure with stale selected state. Preserve pending/submission guards and do not expand recommendation business rules.

Rollback is the frontend chooser/footer change and its bundled decorative assets. No migration or stored-data rewrite is needed.

## Responsive and accessibility requirements
- Validate wide desktop, normal laptop, tablet, and 390px/320px mobile widths, plus enlarged text/effective 200% zoom. Use actual long basket names, selected/unselected cards, empty baskets, and an expanded disclosure.
- Preserve semantic heading and article names, native button/input behavior, focus-visible styling, Add/Added pressed state, and disclosure expanded/control associations. Use a real accessible search label rather than placeholder-only labeling.
- Search, selection, disclosure, Clear all, refresh, and Continue must work by keyboard. Keep focus stable during selection changes and clear operations. Sticky content must not obscure the focused card or an open disclosure.
- Use loading/error/status announcements appropriately; no new animation is needed. Decorative assets must not become a prerequisite for selecting baskets.

## Acceptance criteria
1. At wide desktop size the chooser matches the reference's compact four-column photo-card composition, header controls, green selected treatment, and bottom selection bar. The earlier omitted descriptions/count chips/type controls remain absent.
2. Search filters basket names without changing configured order, selections, estimate values, or the global selected count. Empty-search and empty-catalogue states are distinct, and clearing the query restores the complete list.
3. Add/Added toggles the correct stable basket ID; the details arrow is independent. Existing saved selections, locked states, refresh preservation/errors, and zero-item baskets continue to work.
4. Clear all clears every local basket selection, including hidden results, and applies existing recommendation-source cleanup while preserving rooms, entered line data, and persisted records. Re-selection follows existing individual-toggle semantics.
5. The footer remains reachable and compact on desktop/mobile, never covers the last card or keyboard focus, and contains exactly one Continue action with unchanged validation/navigation behavior.
6. Relevant local photos render with stable dimensions. Unknown categories and failed images have a usable static skeleton placeholder. No external runtime image requests, Configuration mutation, backend change, or dependency is introduced.
7. Focused rendered regressions, relevant recommendation/deselection tests, frontend typecheck/build, responsive browser interaction/accessibility checks, and `git diff --check` pass on the integrated work. Report exact checks, remaining limitations, and asset provenance; preserve unrelated work.

## Risks and assumptions
- Reference fidelity depends on available width and real names; the screenshot is a section reference, not a request to remove Project details or room dimensions above it. Existing surrounding screens remain in place.
- Representative photos are acceptable as decoration; the original screenshot photographs are unavailable as separate assets. Exact images would require those original assets. This assumption is explicit in the specification approval.
- Photo cards need more horizontal space than the current icon-only cards. Responsive column reduction and flexible long-name heights prevent cramped labels.
- Sticky footer positioning must use the actual shell scroll container. Verify at short viewport heights, with the mobile keyboard, and with an expanded last card before claiming visual completion.
- Bulk deselection must preserve the established recommendation cleanup and stored-line behavior. Focused round-trip tests should catch accidental data loss or stale inclusion.

## Open decisions and status
No unresolved product decision blocks this proposal. Local representative photos and a frontend-only asset mapping are the scoped default, with static skeleton thumbnails for unmatched categories as explicitly requested during implementation; configurable basket image uploads are outside this request.

Specification and task plan approved; Mode A selected. Implementation and integrated verification completed on 2026-10-08, including the user's clarification to use a static skeleton thumbnail for unmatched baskets. All seven acceptance criteria are covered by the focused tests and rendered checks recorded in the [task plan](../plans/2026-10-08-main-baskets-photo-selector.md). No deployment or production mutation was performed. Browser validation used synthetic data; native mobile keyboard and native browser zoom remain untested.

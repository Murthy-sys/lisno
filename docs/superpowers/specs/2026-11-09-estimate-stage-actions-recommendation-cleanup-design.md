# Estimate stage actions and recommendation cleanup

Date: 2026-11-09
Status: Implemented and verified in Mode A

## Goal

Keep the room/Main Basket setup stage focused on continuing to item selection. Remove empty recommendation-added basket groups when their last selected item is removed. Present recommendations in a normal, compact application popup.

## Current behavior and evidence

- `LeadEstimateWorkspace.tsx` renders the estimate footer when `tab !== "configure" || checklistRequired && draftEditable || publicationFeedback?.message`. The Sales exception displays Save draft, Submit, total and submission feedback alongside “Continue to item selection” on the setup screen, matching image 1.
- A separate setup Save draft button also exists for some other roles. Both setup save placements conflict with the requested stage-specific actions.
- Adding a recommendation records its Main Basket in `recommendationOnlyBasketIds` and `selectedMainBasketIds`. Removing it calls `updateConfiguredLine(..., { included: false })`, leaving the basket selected. The existing empty-basket cleanup only checks `itemAddedBasketIds`, which is populated by the ordinary item picker, not recommendation additions.
- `ConfiguredEstimateBuilder.tsx` includes every selected basket in catalogue presentation, even when a recommendation-only basket has no items in the current room. It can therefore retain the “Painting / 0 selected / Browse other items” empty group shown in image 2.
- `EstimateRecommendations.tsx` currently uses a custom positioned, non-modal portal with toolbar/footer geometry. `estimateSelection.css` partially applies common dialog colors, but buttons inherit the general control height. The application already has a standard accessible `Dialog` component.

## Scope and assumptions

- Image 1 concerns the room/Main Basket **setup stage**. Save/Submit belong after entering item selection; existing subsequent summary/proposal review actions remain valid.
- Image 2 shows an empty Main Basket wrapper even though the request calls it a Sub Basket. Remove both empty auto-added Main Basket and Sub Basket wrappers where applicable.
- Preserve deliberately selected setup baskets, other selected items and other rooms. Selecting a Main Basket for normal browsing must still work when it has no selected items yet.
- Apply the cleanup in the shared staff estimate workflow used by Sales/Designer. Use the common popup for the existing popup variant; do not turn unrelated inline Client recommendation sections into modals.

## Requirements

### Stage-specific actions

1. On room/Main Basket setup, retain “Continue to item selection”, selection count/clear and necessary navigation such as “Return to saved items”. Remove estimate Save draft/Submit/publication actions and the duplicated submission footer from that stage, including when old publication feedback is present.
2. Show estimate save/submission actions when the user enters the item-selection/review stage. Preserve existing role behavior: Sales may save drafts and submit; Designer remains submit-only. Keep existing submission validation, actionable feedback and authorization rules.
3. Important save/navigation failures must remain visible in the appropriate existing recovery UI; do not silently discard error state to hide the setup footer. Returning to the builder must restore the correct actions and current feedback.

### Remove empty recommendation groups

4. Removing a recommended item from its popup, row, Sub Basket action, or a source-dependent removal must remove the now-empty recommendation-only group from the current room immediately. Also remove its zero-item summary/filter entry where that entry would otherwise refer to an invisible group.
5. If the basket was introduced solely by recommendation selection and has no included items in any room, remove it from the effective selected-basket scope and clear its obsolete recommendation-browse state. Preserve explicit setup choices and intentional independent item selections.
6. Do not remove a basket that still has included items in another room. Hide its empty recommendation-only group in the current room while preserving the other room's group, values and total.
7. Preserve stable IDs, saved excluded rows and existing removal/review semantics. Do not physically delete historical estimate records or reconstruct items by name. Recommendation provenance and dependent-item behavior remain authoritative.
8. Re-adding the recommendation restores exactly the chosen item and the required parent group, without selecting its siblings. Save/reload must not recreate an empty group caused by this interaction. Existing deliberately empty setup baskets remain available for browsing.

### Compact standard popup

9. Replace the existing popup variant's custom floating presentation with the shared application `Dialog`, with a bounded desktop width (approximately 560–640px) and a viewport-safe mobile layout. Keep its recommendation list scrollable.
10. Use restrained typography: approximately 15–16px title, 12–13px item/help text and compact 32–36px desktop actions; retain usable 44px touch targets on narrow/coarse-pointer devices. Use existing dialog colors, buttons and borders without new decoration or dependencies.
11. Preserve the existing recommendation data, pagination, loading/error/retry states, Add/Remove actions and one-item feedback. Preserve room-scoped opening/dismissal state and the ability to reopen from the Recommendations trigger.
12. Use the standard dialog's accessible title, modal semantics, focus containment, Escape/backdrop dismissal and return focus. If a removal changes the list or removes the last group, focus must return to an available dialog control or the surviving trigger/editor control.

## Architecture, state and API impacts

- Frontend changes in the existing workspace, recommendation-scope helper, builder group derivation, shared recommendation popup and scoped selection styles.
- Setup state continues into the builder through the existing Continue action. No new automatic save or submission behavior.
- Track explicit setup/browse intent separately from recommendation-only presentation. Reuse existing state where possible; do not infer that every empty basket should be deleted.
- Saved line exclusion is preserved while current effective basket selection is cleaned up. Existing save APIs and audit/history contracts are unchanged.
- No backend endpoint, permission, schema, migration, financial formula or published estimate changes. Totals must continue to derive from the existing included-line calculation.
- Remove custom popup positioning only for the variant replaced by the shared Dialog. Do not redesign other dialogs or globally shrink their controls.

## Risks and constraints

- **Cross-room loss:** cleanup must consider all included lines before removing a globally selected basket. Test unequal room contents and same-named groups with different IDs.
- **Lost browse intent:** explicit setup choices or deliberate browsing must not be cleared merely because a room is empty. The original recommendation-only empty shell must still disappear after its last item is removed.
- **Saved history:** excluded persisted rows may be required for save/review. Hide empty group shells without deleting those rows or altering prior approved versions.
- **Modal focus:** replacing the custom portal must preserve action feedback and avoid losing keyboard focus when recommendations refresh or disappear.
- **Dirty/concurrent work:** these files already contain earlier and concurrent changes. Capture target diffs before implementation and preserve unrelated pricing, tier comparison, approval and Client view work.

## Acceptance criteria and verification

- AC1: The setup/Main Basket screen never shows estimate Submit/Save draft or the duplicate submission footer; Continue remains usable under the existing setup rules. Test with and without prior publication feedback.
- AC2: Entering item selection restores the correct Sales/Designer actions and submission validation; returning to setup hides them again without losing edits or recovery state.
- AC3: Add one recommendation, remove it, and observe its empty Sub Basket/Main Basket group disappear. Re-add restores only that item.
- AC4: A separately selected item, explicitly selected setup basket and another room's selected recommendation remain intact. Totals and save payloads retain the right included/excluded line identities.
- AC5: After saving/reloading, removed recommendation-only empty groups do not return. Source-dependent removals and Sub Basket removals use the same cleanup rules.
- AC6: Popup uses the standard dialog and compact visual scale on desktop/mobile, with correct scrolling, Add/Remove, retry/pagination and no overflow.
- AC7: Keyboard opening, focus containment, Escape/backdrop closing, post-removal focus and return focus work; accessible labels remain contextual.
- Verify with focused workspace/recommendation/scope/helper tests and shared Dialog tests; render the setup-to-builder flow and popup at desktop and mobile widths; run frontend typecheck/build and repository hygiene checks. Report any unrelated failures separately with baseline evidence rather than claiming a fully passing repository.

## Open decisions

None blocking. “Normal popup” is interpreted as the existing shared modal Dialog, and setup navigation is retained while estimate submission actions move to the item-selection/review stage.


## Delivered behavior and evidence

Implemented the approved stage-specific actions, recommendation group cleanup and compact standard Dialog. Saved records do not persist basket introduction origin: their selection IDs/classifications remain authoritative when ambiguous. Only witnessed automatic additions release automatic scope; empty saved groups are hidden for presentation, and Setup Continue explicitly restores normal browsing of accepted baskets.

All acceptance criteria were checked: 288 focused tests, frontend typecheck/build and 55 rendered browser assertions passed. Final integrity review found no remaining confirmed defects. See the [task plan verification record](../plans/2026-11-09-estimate-stage-actions-recommendation-cleanup.md) for affected files, exact checks, artifacts and the existing bundle-size warning.

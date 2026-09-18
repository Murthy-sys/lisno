# Explain and recover furniture submission blockers

## Evidence, goal and authority
User reports Edit furniture requirements remains disabled after all visible fields are filled. Code trace confirms `unavailableItems` disables only Submit when any selected room has zero canonical approved estimate items; every configured room is projected, but only included nonzero estimate lines populate its items. This matches screenshot-enabled numbers/Add UOM/Cancel. The actual live project state is not available, so this is a reproduced/code-supported matching cause, not a claim of inspected production data. UOM lookup failures are a second possible cause. Missing file and invalid entered values do not themselves disable this button.

Standing autonomous Mode A applies. Scope is bounded frontend behavior/feedback; no backend guard relaxation or production changes.

## Behavior and invariants
- Furniture scope/upload footer always explains a disabled Submit state at the button: stale workflow/source/action; selected rooms with no estimate items (name affected rooms); UOM add panel busy; UOM loading/error. Existing in-flight saving keeps busy label. Explanations are accessible via aria-describedby and visible at mobile/desktop widths.
- Mark selected empty rooms near the room checkboxes. A Review rooms action focuses/scrolls to the first affected checkbox. User explicitly unchecks rooms that do not need dimensions, or corrects the approved estimate. Do not automatically remove rooms, guess item-room mapping, or weaken complete-item/source/CAS/proof validation.
- Resolving selection re-enables submission using existing guards and preserves filled measurements, point counts, configured UOMs, native proof FileList and note. Rechecking the empty room restores the blocker. Scope payload records the user’s selection explicitly.
- UOM errors have one footer Retry UOMs action and preserve drafts; retry success releases the blocker. Initial loading/busy state clearly described. No cached-data authority bypass.
- Existing stale guards remain authoritative; no automatic version rebase. Show their existing message at the furniture-entry footer without duplicate alerts, preserving other workflows.
- Keep the footer compact, wrap long names, summarize large empty-room sets, and leave room checks scrollable/reachable. No new dependencies, routes, schema, migrations or financial effects.

## Acceptance and checks
Three selected rooms with one empty and all actual fields filled reproduce blocking; footer names the room; Review rooms focuses it; explicit uncheck enables real valid multipart submission with that room required=false; values/proof retained; recheck blocks again. Check UOM initial/error/refetch/retry and stale state. Focused furniture/workflow regressions, typecheck/build, read-only integrity/final verification and rendered narrow/desktop footer interaction+axe. Full backend suites unnecessary because no backend code or contract changes.

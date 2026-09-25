# Mobile translucent safe-area finish

Implemented and verified in the recorded Android scope. Authorized by the user's standing instruction to proceed without approval pauses. Extends the completed mobile/web style alignment.

## Evidence and intent
The initial cream translucency washed out the established sage/olive color. The user's correction requires retaining that rich color while adding transparency and edge effects. Preserve icon-only phone tabs, labeled tablet rail, web-aligned typography, Back behavior and permission-filtered destinations.

## Design and acceptance
1. Use the established dark sage/olive color for translucent scaffold surfaces, with restrained sage edge lighting and no cream/white wash. Cream foreground icons/text retain contrast. Selected tabs use a translucent sage marker and a defined sage outline; no new icons or navigation behavior. Focused colored chrome uses light system icons; immersive light chat retains dark system icons.
2. Extend each top/bottom surface through its matching system safe area. Interactive content remains inset; no double top/bottom padding, obscured content, gesture overlap or displaced targets. Phone controls stay at least48dp; tablet rail remains readable.
3. Use existing native View/SVG rendering, no blur dependency, animation, large shadows or lens effects. Respect Reduce Transparency by replacing decorative layers with an opaque surface. No per-frame rendering or scroll listeners.
4. Preserve immersive conversation ownership of its safe areas, header, composer and Back. The scaffold must add no chrome/insets in immersive mode. Auth/onboarding retain existing light backgrounds unless an actual shared edge issue requires a bounded fix.
5. Verify phone/tablet, selected/disabled navigation, Back, immersive mode, nonzero safe insets and reduced-transparency behavior. Inspect actual Android rendering; typecheck, focused regression tests and Android export must pass. Report iOS device coverage limits.

No API, data, auth or permission changes. Existing dirty paths and target diffs are captured in /tmp/lisno-mobile-safe-area-finish-20260923. Main risks are nested safe-area padding, insufficient icon contrast and unwanted chrome around immersive chat. Status-bar styling must follow the focused screen; preserve the prior root ordering fix.

# Stable configuration tab content

## Goal and evidence
Stop intermittent continuous movement in configuration tab content, particularly short Overview panels below temporary-line reference banners. The left navigation is outside scope. WorkspaceRail observes the workspace layout, reads its viewport-relative top, then writes a summary max-height inside that same layout. A one-pixel threshold crossing can switch from 160px to 60vh. Its own sizing can trigger another parent ResizeObserver callback, while browser scroll anchoring/bottom clamping changes the measured top. Overview and closed Surface selectors have no continuous focus/scroll effects.

## Decision and contract
Compute the summary budget from stable viewport height, sticky inset, header height and rail gap. Observe only the header plus window/visualViewport resize. Remove dependence on the enclosing layout's screen position and stop observing the size changed by the calculation. Retain 60vh fallback for stacked layouts and very tall headers, static positioning for a header that cannot fit, [section] re-observation, internal summary scrolling and all existing focus/keyboard behavior. The initial summary may extend further below the fold and scroll normally. No scroll listeners, auto-scroll, fixed-height main content, global overflow rules, CSS redesign, backend/API/data changes or dependencies.

## Acceptance
1. Repeated parent height/scroll-position changes cannot alter the summary budget or sustain resize callbacks.
2. Header content/size changes, desktop/mobile transitions and visualViewport resizing recalculate correctly.
3. Tall revision history remains reachable in a static rail; internal summary details still scroll.
4. Tab switches observe the new header, cleanup pending frames/listeners, and do not reset main content focus or scroll.
5. Rendered tests, production build and wide/narrow visual checks verify the changed behavior. Capture baseline/fixed telemetry where reproducible; distinguish modelled regression from natural runtime reproduction.

## Execution
User autonomous implementation instructions override default repository approval ceremony. Preserve all pre-existing dirty changes. Work in /tmp snapshot, then hash-check and back up the small delivery before applying with required filesystem permission. No deployment or production mutation.

## Validation limits
Automated coverage verifies the geometry dependency and responsive sizing contract. Desktop/mobile browser inspection was attempted through an isolated synthetic fixture but interrupted by concurrent user activity. Continuous movement has not been independently reproduced in a live browser during this task.

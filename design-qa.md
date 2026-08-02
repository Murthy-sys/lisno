# Design QA — Client full-plan sidebar and Ask Lisno rail launcher

- Source visual truth: user-provided browser screenshot in this conversation.
- Implementation screenshot: unavailable because no in-app browser session is connected.
- Intended viewport: desktop, approximately 2048 × 1152 CSS pixels at device scale 1.
- State: client estimate expanded with a six-page uploaded plan and extracted drawings.
- Source dimensions: 2048 × 1152 pixels as supplied.
- Implementation dimensions: unavailable; density normalization could not be performed.

## Full-view comparison evidence

The source screenshot shows the full-design navigator incorrectly flowing below the estimate in the first content column, with Ask Lisno embedded in the Full Design card. The implementation places estimate content and a dedicated design-tools rail in an explicit two-column grid (`minmax(0, 1fr) 18rem`). The sticky rail contains Full Design and a separate bottom-aligned Ask Lisno launcher. At widths of 760px or less it returns to normal flow.

## Focused region evidence

Browser-rendered evidence is unavailable. Automated regression coverage verifies the desktop column, sticky rail, independent launcher, unobstructed page list, and mobile flow rules. Component coverage proves the launcher is outside the Full Design region. Recovered source assets were validated directly as a six-page PDF and 2382 × 1684 PNG page/revision images.

## Findings

- [P1] Browser comparison unavailable.
  - Location: expanded client estimate, full-design sidebar, and bottom Ask Lisno launcher.
  - Evidence: no browser runtime is connected, so the corrected implementation cannot be captured at the same authenticated state and viewport.
  - Impact: typography, precise spacing, image rendering, and interaction polish cannot receive final visual sign-off here.
  - Fix: reload the client page in the user's browser and capture the expanded estimate at desktop and mobile widths.

## Required fidelity surfaces

- Fonts and typography: unchanged; browser verification blocked.
- Spacing and layout rhythm: desktop rail, bottom alignment, and mobile flow rules covered by automated regression tests; browser verification blocked.
- Colors and visual tokens: existing Lisno tokens retained; browser verification blocked.
- Image quality and asset fidelity: original PDF restored; six full pages and twenty extracted images reconstructed at their existing references and dimensions.
- Copy and content: Full Design contains only page navigation; the separate launcher shows `Ask Lisno` and `Coming soon`.

## Comparison history

- Initial evidence: navigator appeared below the estimate with a large empty region; both page and extracted-image previews reported unavailable.
- Fixes: introduced an explicit right-sidebar layout, separated Ask Lisno into a bottom rail launcher, and restored the missing protected assets from the matching original PDF without changing database IDs.
- Post-fix visual evidence: blocked because no in-app browser session is connected.

## Implementation checklist

- [x] Place full plan in the desktop right column.
- [x] Keep the plan navigator sticky while reviewing estimate content.
- [x] Collapse to a single-column drawer on small screens.
- [x] Keep Ask Lisno outside Full Design and bottom-aligned within the right rail.
- [x] Keep every uploaded plan page reachable without launcher overlap.
- [x] Restore full-page and extracted-image files referenced by MongoDB.
- [x] Pass frontend tests, typecheck, and production build.
- [ ] Capture authenticated desktop and mobile screenshots after browser reload.

final result: blocked

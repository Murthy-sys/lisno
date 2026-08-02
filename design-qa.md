# Design QA — Client full-plan sidebar recovery

- Source visual truth: user-provided browser screenshot in this conversation.
- Implementation screenshot: unavailable because no in-app browser session is connected.
- Intended viewport: desktop, approximately 2048 × 1152 CSS pixels at device scale 1.
- State: client estimate expanded with a six-page uploaded plan and extracted drawings.
- Source dimensions: 2048 × 1152 pixels as supplied.
- Implementation dimensions: unavailable; density normalization could not be performed.

## Full-view comparison evidence

The source screenshot shows the full-design navigator incorrectly flowing below the estimate in the first content column. The implementation now places the estimate content and full-design navigator in an explicit two-column grid (`minmax(0, 1fr) 18rem`) and makes the second column sticky. At widths of 760px or less it becomes a one-column drawer.

## Focused region evidence

Browser-rendered evidence is unavailable. Automated CSS regression coverage verifies the desktop column, sticky placement, and mobile collapse rules. Recovered source assets were validated directly as a six-page PDF and 2382 × 1684 PNG page/revision images.

## Findings

- [P1] Browser comparison unavailable.
  - Location: expanded client estimate and full-design sidebar.
  - Evidence: no browser runtime is connected, so the corrected implementation cannot be captured at the same authenticated state and viewport.
  - Impact: typography, precise spacing, image rendering, and interaction polish cannot receive final visual sign-off here.
  - Fix: reload the client page in the user's browser and capture the expanded estimate at desktop and mobile widths.

## Required fidelity surfaces

- Fonts and typography: unchanged; browser verification blocked.
- Spacing and layout rhythm: desktop and mobile grid rules covered by automated regression test; browser verification blocked.
- Colors and visual tokens: existing Lisno tokens retained; browser verification blocked.
- Image quality and asset fidelity: original PDF restored; six full pages and twenty extracted images reconstructed at their existing references and dimensions.
- Copy and content: unchanged.

## Comparison history

- Initial evidence: navigator appeared below the estimate with a large empty region; both page and extracted-image previews reported unavailable.
- Fixes: introduced an explicit right-sidebar layout and restored the missing protected assets from the matching original PDF without changing database IDs.
- Post-fix visual evidence: blocked because no in-app browser session is connected.

## Implementation checklist

- [x] Place full plan in the desktop right column.
- [x] Keep the plan navigator sticky while reviewing estimate content.
- [x] Collapse to a single-column drawer on small screens.
- [x] Restore full-page and extracted-image files referenced by MongoDB.
- [x] Pass frontend tests, typecheck, and production build.
- [ ] Capture authenticated desktop and mobile screenshots after browser reload.

final result: blocked

# Design QA — Sticky Full Design annotation recovery

- Source visual truth: user-provided browser screenshot in this conversation.
- Implementation screenshot: unavailable because no in-app browser session is connected.
- Intended viewport: desktop, approximately 2048 × 1152 CSS pixels at device scale 1.
- State: client estimate expanded with a six-page uploaded plan and extracted drawings.
- Source dimensions: 2048 × 1152 pixels as supplied.
- Implementation dimensions: unavailable; density normalization could not be performed.

## Full-view comparison evidence

The implementation places estimate content and a dedicated design-tools rail in an explicit two-column grid (`minmax(0, 1fr) 18rem`). Full Design independently owns sticky top positioning, while Ask Lisno remains a separate bottom-aligned sibling. At widths of 760px or less both return to normal flow.

## Focused region evidence

Browser-rendered evidence is unavailable. Automated regression coverage verifies the desktop column, stretched sticky containing rail, sticky Full Design card, independent launcher, unobstructed page list, and mobile flow rules. Workflow coverage proves annotations and Save as draft remain available after an earlier client change request and become read-only after approval. Pointer coverage proves Rectangle is initially active and the first drag creates a mark and enables Save as draft.

## Findings

- [P1] Browser comparison unavailable.
  - Location: expanded client estimate, full-design sidebar, and bottom Ask Lisno launcher.
  - Evidence: no browser runtime is connected, so the corrected implementation cannot be captured at the same authenticated state and viewport.
  - Impact: typography, precise spacing, image rendering, and interaction polish cannot receive final visual sign-off here.
  - Fix: reload the client page in the user's browser and capture the expanded estimate at desktop and mobile widths.

## Required fidelity surfaces

- Fonts and typography: unchanged; browser verification blocked.
- Spacing and layout rhythm: sticky Full Design, bottom Ask Lisno alignment, and mobile flow rules covered by automated regression tests; browser verification blocked.
- Colors and visual tokens: existing Lisno tokens retained; browser verification blocked.
- Image quality and asset fidelity: original PDF restored; six full pages and twenty extracted images reconstructed at their existing references and dimensions.
- Copy and content: extracted drawing rows retain `Preview`; Full Design tiles open directly without visible Preview copy; the annotation modal exposes `Save as draft` and `Submit change request`; the toolbar explains how to draw.

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
- [x] Keep Full Design independently sticky on desktop.
- [x] Keep annotations editable for `client_changes_requested` and read-only for `client_approved`.
- [x] Expose explicit Preview and Save as draft actions.
- [x] Default editable annotation dialogs to Rectangle so the first drag marks the drawing.
- [x] Stretch the right rail across the full estimate content height so sticky positioning has a valid scroll range.
- [x] Restore full-page and extracted-image files referenced by MongoDB.
- [x] Pass frontend tests, typecheck, and production build.
- [ ] Capture authenticated desktop and mobile screenshots after browser reload.

final result: blocked

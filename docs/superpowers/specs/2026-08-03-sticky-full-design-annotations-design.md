# Sticky Full Design Annotation Recovery

## Goal

Keep the Full Design section sticky while restoring client annotations across the complete pre-approval design-review lifecycle.

## Root Cause

The client UI uses the commercial estimate `actionable` flag to enable design annotations. That flag is true only while an estimate is `sent_to_client`. Submitting the first design change request moves the estimate to `client_changes_requested`, which incorrectly turns every remaining Full Design page read-only even though the backend still accepts drafts and page-level change requests.

## Review Permissions

- Commercial estimate decision controls retain their current workflow and remain actionable only for `sent_to_client`.
- Design annotations use a separate permission:
  - `sent_to_client`: editable.
  - `client_changes_requested`: editable.
  - `client_approved`: read-only.
- The same design-review permission applies to Full Design pages and extracted individual drawings.
- Existing page-level approval state remains respected: an approved page is read-only even when another page is still editable.

## Full Design Actions

- Full Design represents each original uploaded plan as one entry, not as one card per rendered page.
- The entry shows the original uploaded filename, file type, and total page count in upload order.
- Clicking the uploaded-plan entry opens the complete protected plan viewer. Page navigation lives inside that viewer and preserves the original page order.
- Annotations are stored against the selected source page while the client experiences the upload as one complete plan.
- Extracted individual drawing rows retain their existing explicit `Preview` action beside review status and Approve.
- `Preview` uses the standard Lisno secondary button treatment for every extracted drawing row, including mapped Design Drawing Review groups and Miscellaneous; it must not render as plain text.
- The annotation modal exposes `Save as draft` while annotation is permitted. Saving does not submit or notify staff.
- `Submit change request` remains a separate final action and requires markings plus a change summary.
- Submitted change requests continue mapping annotations to affected extracted drawings through the existing preview-target flow.

## Annotation Interaction

- `Rectangle` is the initial active tool whenever an editable annotation modal opens, so the first drag creates a visible mark.
- `Select` is not displayed in the annotation toolbar.
- Editable dialogs show the concise instruction `Choose a tool, then drag on the drawing.`
- The canvas uses a crosshair cursor while Ellipse, Rectangle, Arrow, Freehand, or Text is active and a selection cursor while Select is active.
- Pointer drawing must continue working after zoom changes and must enable `Save as draft` as soon as the annotation document becomes dirty.
- `Save as draft` uses the standard Lisno secondary button treatment with the same full-width control geometry as `Submit change request`; it must not render as plain text.

## Sticky Right Rail

- Full Design itself owns desktop sticky positioning at the top of the right rail.
- No ancestor between Full Design and the page scrolling viewport may use scrolling overflow that blocks sticky positioning. Content clipping uses `overflow: clip`, not `hidden` or `auto`.
- Ask Lisno is rendered once for the complete client page as a fixed bottom-right floating chat launcher. It is not rendered inside an estimate, project, Full Design card, or right rail.
- Sticky positioning must not introduce a clipped nested page list; every uploaded page remains reachable through document scrolling.
- At widths of 760px or less, Full Design and Ask Lisno return to normal document flow.

## Testing

- A workflow test proves annotations and `Save as draft` remain available for `client_changes_requested`.
- A workflow test proves annotations are read-only for `client_approved`.
- A backend DTO test proves the client plan workspace exposes the original upload filename, MIME type, and ordered page count.
- A component test proves one uploaded plan entry is rendered for a six-page upload and opens page 1 in the complete-plan viewer.
- A viewer test proves all pages remain navigable in original order and selecting a page annotates that source page.
- An editor test proves Rectangle is initially active and the first drag creates a visible annotation.
- A modal test proves the first drag enables `Save as draft`.
- A toolbar test proves Select is absent.
- A CSS test proves Save as draft uses the standard button classes and the sticky ancestor does not use `overflow: hidden`.
- A drawing-row test proves Preview uses the standard secondary button classes in both mapped and Miscellaneous groups.
- A page test proves exactly one Ask Lisno launcher exists outside every estimate card.
- CSS regression coverage proves `.client-plan-nav` owns sticky positioning on desktop and returns to static positioning on mobile.
- Run the complete frontend test, typecheck, and production build suites.
- Visual QA must confirm the sticky card, all uploaded pages, Preview controls, and annotation toolbar without overlap.

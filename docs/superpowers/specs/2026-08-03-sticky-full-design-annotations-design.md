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

- Every page row exposes a visible `Preview` button rather than relying only on an implicit whole-row action.
- Preview opens the protected full-page design in the existing annotation modal.
- The modal exposes `Save as draft` while annotation is permitted. Saving does not submit or notify staff.
- `Submit change request` remains a separate final action and requires markings plus a change summary.
- Submitted change requests continue mapping annotations to affected extracted drawings through the existing preview-target flow.

## Sticky Right Rail

- Full Design itself owns desktop sticky positioning at the top of the right rail.
- Ask Lisno remains a separate sibling aligned to the bottom of the right-side area.
- Sticky positioning must not introduce a clipped nested page list; every uploaded page remains reachable through document scrolling.
- At widths of 760px or less, Full Design and Ask Lisno return to normal document flow.

## Testing

- A workflow test proves annotations and `Save as draft` remain available for `client_changes_requested`.
- A workflow test proves annotations are read-only for `client_approved`.
- A component test proves every Full Design page exposes `Preview` and still selects the correct page.
- CSS regression coverage proves `.client-plan-nav` owns sticky positioning on desktop and returns to static positioning on mobile.
- Run the complete frontend test, typecheck, and production build suites.
- Visual QA must confirm the sticky card, all uploaded pages, Preview controls, and annotation toolbar without overlap.

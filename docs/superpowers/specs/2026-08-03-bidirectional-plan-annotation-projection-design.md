# Bidirectional Plan Annotation Projection Design

## Goal

Keep the original uploaded plan structurally unchanged while synchronizing client annotations between a full source page and every extracted drawing crop on that page. A six-page upload must remain a six-page plan after annotations, change requests, and drawing replacements.

## Canonical identity

The original `EstimateDesignSourcePage` created from a non-replacement upload is the canonical plan page. Its `sourcePageId`, width, height, and ordered `pageNumber` remain stable throughout review.

Replacement uploads are patch assets. Their technical source pages support image normalization and revision history, but they are never Full Design pages and never increase the client-visible page count.

Full Design must therefore include only uploads whose `replacementDrawingId` and `replacesRevisionId` are absent. Page ordering is the original upload order followed by original page number.

## Annotation ownership and projection

Annotation documents keep normalized coordinates from zero to one in their native image space.

- Full-plan annotations are native to the canonical source page.
- Extracted-drawing annotations are native to the drawing revision crop.
- `projectAnnotationToCrop` transforms page coordinates into crop coordinates.
- `projectAnnotationToPage` transforms crop coordinates into canonical page coordinates.

Projection supports rectangles, ellipses, arrows, freehand paths, and text. Conversions use the drawing revision crop that was current when the request was created, not a later replacement crop. This preserves coordinate accuracy and auditability.

The client viewer presents a composed annotation layer without changing image or page identity:

1. editable annotations native to the currently opened surface;
2. read-only annotations projected from the other surface;
3. submitted open-request annotations associated with the canonical source page.

Projected annotations receive stable namespaced IDs so the same submitted annotation is not displayed twice when a drawing draft transitions into a plan change request. Read-only shared annotations cannot be moved, deleted, or resubmitted accidentally.

## Full-plan to extracted-drawing flow

When the client marks an original plan page:

1. Save the page draft against the existing canonical `sourcePageId`.
2. Detect intersecting drawing crops.
3. On request submission, store one plan change request against that same page and the selected drawing IDs.
4. In each affected extracted drawing preview, project the request annotations from page coordinates into the requested drawing revision crop.
5. Do not create a source page, upload, or plan-page revision merely for annotations.

## Extracted-drawing to full-plan flow

When the client marks an extracted drawing:

1. Save the editable draft in drawing crop coordinates.
2. Project the draft into canonical source-page coordinates for Full Design display.
3. On request submission, persist the projected document as a plan change request against the canonical source page and target drawing ID.
4. Full Design renders that submitted request on the existing page.
5. The extracted drawing renders its native draft/request without duplicating the projected copy.

Draft projection is a client-view composition concern. The backend remains authoritative for stored drawing drafts and submitted plan requests.

## Selective replacement flow

When staff uploads a corrected image for a requested drawing:

1. Create a replacement drawing revision and retain immutable revision history.
2. Preserve the original requested revision crop as the patch destination on the canonical page.
3. Normalize the replacement image to that destination rectangle during composition.
4. Advance only the matching drawing patch in the canonical page manifest.
5. Keep every unrelated patch, uncovered base pixel, source page, and extracted drawing unchanged.
6. Exclude the replacement upload and its technical source page from Full Design uploads and page counts.

The client receives the corrected extracted thumbnail from the new drawing revision and the corrected full-plan page from the advanced canonical page manifest. No additional page is appended.

## API and UI changes

The plan-review workspace continues returning original uploads, flat original pages, and open requests. It must filter replacement uploads before building the Full Design DTO.

The client estimate panel derives projected drawing drafts for the selected canonical page from the drawing workspace and supplies them as a separate read-only annotation layer to the plan viewer. The drawing preview continues deriving page-request projections for its crop.

The preview dialog must keep editable and shared annotations separate. Saving or submitting sends only editable annotations plus intentional new edits, never imported read-only annotations.

## Error handling

- Missing canonical page or crop: block submission and request a refresh.
- Invalid or out-of-bounds crop: reject projection rather than guessing coordinates.
- Stale revision or draft version: preserve optimistic-concurrency conflicts already used by the review APIs.
- Replacement normalization failure: leave the current plan manifest and all client-visible images unchanged.
- Annotation outside a crop: omit it from that extracted drawing while retaining it on the source page.

## Verification

Automated tests must prove:

- a six-page original PDF remains six Full Design pages after a replacement upload creates a technical source page;
- replacement uploads are absent from the Full Design upload DTO;
- an extracted drawing draft projects into its canonical page at the correct coordinates;
- submitting the extracted request does not duplicate its annotation in Full Design;
- a full-plan request projects into every selected extracted crop accurately;
- rectangle, ellipse, arrow, freehand, and text coordinates round-trip within the existing nine-decimal normalization;
- advancing one replacement changes only its manifest patch and retains all other patch revision IDs;
- the corrected extracted image and composed original page both use the new drawing revision;
- no annotation action creates a page or changes original page ordering.

## Out of scope

- Flattening annotations permanently into the stored original PDF.
- Replacing the complete uploaded plan for a single drawing correction.
- Allowing projected historical/request annotations to be edited as new annotations.
- Changing the staff request-resolution workflow beyond ensuring selective replacement remains correctly linked.

# Bidirectional Change-Request Comment Projection

## Goal

Show change-request comments wherever their related annotations are projected. A comment submitted from an extracted drawing must be visible in Full Design on the canonical page, and a page-level request comment must be visible in each targeted extracted drawing preview.

## User Experience

- Preview modals show a read-only **Requested changes** history near the editable **Change summary** field.
- Historical comments never prefill the editable field and are never included automatically in a new draft or request.
- Each history item shows the request summary and its current status.
- Duplicate representations of the same request are rendered once, keyed by request ID.
- Empty or whitespace-only summaries are not rendered.

## Projection Rules

### Extracted drawing to Full Design

For the selected canonical plan page, include each plan change request whose target resolves to a drawing placed on that page. Replacement revisions resolve through `replacesRevisionId` ancestry to the original canonical page and crop, matching annotation projection.

### Full Design to extracted drawing

For an extracted drawing preview, include each page request that directly targets the drawing. Requests targeting a replacement revision remain associated with the same logical drawing and canonical placement.

### Native drawing requests

Drawing-level change summaries already attached to a revision are included in Full Design history when that drawing is projected to the selected page. If a submitted plan request represents the same logical request, the request ID is the deduplication authority.

## Data Contract

Introduce a presentation-only shared-comment value:

```ts
type SharedChangeRequestComment = {
  id: string;
  summary: string;
  status: string;
  source: "plan" | "drawing";
};
```

The preview dialog receives `sharedComments` separately from editable annotation state and submission callbacks. Projection helpers return comments independently from annotation elements so comment text cannot enter annotation documents.

## Error and Empty States

- If related request data is unavailable, the preview remains usable and omits history.
- If no mapped comments exist, the Requested changes section is hidden.
- Malformed blank summaries are ignored rather than displaying empty rows.

## Verification

- Unit tests cover extracted-to-page and page-to-extracted comment mapping.
- Dialog tests prove comments are visible, read-only, deduplicated, and absent from save/submit payloads.
- Replacement-ancestry tests prove comments remain mapped after targeted re-upload.
- Existing annotation, page-count, targeted replacement, frontend, and backend suites remain green.

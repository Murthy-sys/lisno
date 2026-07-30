# Task 5 — Estimator Upload, Mapping, and Drawing Rows

## Scope delivered

- Added typed estimator design DTOs from the current public backend mappers.
- Added an authenticated API boundary for upload, list, edit/verify, submit,
  protected source/revision image URLs, and replacement upload.
- Mounted plan upload and drawing review only after an estimate exists.
- Groups only verified drawings by stable `roomId` and `scopeSectionId`;
  duplicate drawings remain individual rows. Unverified, missing, or unknown
  mappings remain visible in **Needs placement**.
- Added protected 40×40 thumbnails, explicit Preview, an accessible per-row
  overflow menu, correction/crop/verification dialog, immutable history,
  and section-specific replacement file dialog for changes-requested revisions.
- Added compact responsive styles that retain 44px menu/preview touch targets
  and wrap row metadata on narrow screens.

## RED / GREEN evidence

### RED

Ran before implementation:

```text
VITE_API_URL=/api/v1 npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
```

The new workspace test failed because the pre-existing workspace did not render
the `Upload design plans` heading. The upload test module was also absent before
the Task 5 implementation. This demonstrated the missing estimator surface.

### GREEN

Fresh final verification:

```text
VITE_API_URL=/api/v1 npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
Test Files  2 passed (2)
Tests       3 passed (3)

npm run typecheck
tsc -b --pretty false  # exit 0

VITE_API_URL=/api/v1 npm run build
vite build             # exit 0
```

The build emits the repository's existing Vite chunk-size warning only; it
completes successfully.

## API mapping verified against current backend public routes/mappers

| Frontend boundary | Public route | Current mapped result |
| --- | --- | --- |
| `uploadEstimateDesign` | `POST /estimates/:estimateId/design-uploads` | `EstimateDesignUpload` (201); multipart `file` field |
| `getEstimateDesignWorkspace` | `GET /estimates/:estimateId/design-uploads` | `{ uploads, pages, drawings, revisions }` |
| `editEstimateDrawing` | `PATCH /estimate-design-drawings/:drawingId` | drawing DTO plus current `revision` |
| `replaceEstimateDrawing` | `POST /estimate-design-drawings/:drawingId/replacement` | drawing DTO plus new `revision`; multipart `version` and `file` |
| `submitEstimateDrawings` | `POST /estimates/:estimateId/design-drawings/submit` | `{ submittedCount }` |
| protected thumbnails/previews | `GET /estimate-design-revisions/:revisionId/image` | authenticated PNG blob via `ProtectedImage` |

No multipart `Content-Type` is set by the frontend; `apiClient.postMultipart`
lets the browser assign the required boundary.

Polling runs only while a workspace upload has `queued` or `processing`
status and stops at terminal review/status states.

## Tests added

- `EstimateDesignUploads.test.tsx`
  - stable room/scope grouping, duplicate preservation, Needs placement;
  - explicit Preview and 40×40 thumbnail class;
  - keyboard overflow-menu opening and independent menu state;
  - client-side crop boundary validation;
  - multipart upload request, queued → processing → estimator-review polling,
    and poll stop at terminal state.
- `LeadEstimateWorkspace.test.tsx`
  - upload/review surface appears only after an estimate exists.

## Files changed

- `frontend/src/api/types.ts`
- `frontend/src/features/leads/estimateDesignApi.ts`
- `frontend/src/features/leads/EstimateDesignUploads.tsx`
- `frontend/src/features/leads/EstimateDrawingRow.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/styles/index.css`
- `frontend/src/features/leads/EstimateDesignUploads.test.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`

## Responsive and accessibility self-review

- File input and upload control have explicit accessible labels.
- Status/error/loading states use semantic text and `role="alert"`/
  `role="status"` where applicable.
- Preview is always an explicit button; secondary actions are semantic buttons
  inside a labelled `role="menu"`, with `aria-haspopup`, `aria-expanded`, and
  per-row menu IDs.
- Corrected-crop fields have labels and validation feedback; dialogs use the
  existing focus-trapping dialog implementation.
- Narrow layouts maintain 40×40 thumbnail sizing, wrap metadata, and retain
  minimum 44px action controls.

## Concerns / backend prerequisites

The actual estimator public routes currently provide upload, list, edit/verify,
submit, image, and replacement only. They do **not** expose retry extraction,
remove drawing, or manual drawing/crop creation endpoints. Per task direction,
this frontend does not present unsupported actions or invent requests for them.
The UI is organized around a workspace API boundary and row action callbacks so
those actions can be added once the corresponding backend routes are delivered.

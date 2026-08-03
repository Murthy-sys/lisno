# Bidirectional Plan Annotation Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the original plan page count stable while synchronizing annotations and selective drawing replacements between full-plan pages and extracted drawing crops.

**Architecture:** Original non-replacement uploads define the canonical plan and page ordering. Annotation documents remain native to either page or crop coordinates and are projected into a separate read-only shared layer for the other view. Replacement uploads remain internal patch assets; their normalized image advances only the targeted patch in the original page manifest.

**Tech Stack:** TypeScript, React 19, TanStack Query, Mongoose, Sharp, Vitest, Testing Library

## Global Constraints

- A six-page original upload remains six Full Design pages after annotations and replacements.
- Replacement-upload source pages never appear in Full Design navigation.
- Main-page and crop annotations use the exact requested revision crop for coordinate projection.
- Imported/shared annotations are read-only and never included in a draft or request payload twice.
- Replacement uploads advance only the targeted drawing patch; all other plan pixels, pages, patches, and extracted drawings remain unchanged.
- No annotation action creates an upload, source page, or plan-page revision.

---

### Task 1: Keep replacement assets out of the canonical plan

**Files:**
- Modify: `backend/src/services/estimate-plan-review.service.ts`
- Modify: `backend/tests/estimate-plan-review-client.test.ts`
- Modify: `backend/tests/estimate-plan-composite.test.ts`

**Interfaces:**
- Consumes: `EstimateDesignUpload.replacementDrawingId` and `EstimateDesignUpload.replacesRevisionId`.
- Produces: `pageRows(user, estimateId)` containing only original uploads and their source pages.

- [x] **Step 1: Write the failing six-page regression test**

Create six original source pages plus one completed replacement upload/source page, then assert:

```ts
expect(workspace.uploads).toHaveLength(1);
expect(workspace.uploads[0]).toMatchObject({ id: "upload-original", pageCount: 6 });
expect(workspace.pages.map((page) => page.id)).toEqual([
  "page-1", "page-2", "page-3", "page-4", "page-5", "page-6"
]);
expect(workspace.pages).not.toContainEqual(expect.objectContaining({ id: "replacement-page" }));
```

- [x] **Step 2: Run the backend tests and verify RED**

Run: `npm test -- --run tests/estimate-plan-review-client.test.ts tests/estimate-plan-composite.test.ts`

Expected: the plan-review test reports seven pages or a second upload because `pageRows` currently queries every estimate upload.

- [x] **Step 3: Filter canonical uploads at the query boundary**

Change the upload query used by `pageRows` to:

```ts
const uploads = await EstimateDesignUploadModel.find({
  estimateId,
  replacementDrawingId: null,
  replacesRevisionId: null
}).sort({ uploadedAt: 1, _id: 1 }).lean();
```

Do not filter source pages after querying; deriving them only from canonical upload IDs prevents replacement assets from leaking into flat pages or upload groups.

- [x] **Step 4: Run the focused backend tests and verify GREEN**

Run: `npm test -- --run tests/estimate-plan-review-client.test.ts tests/estimate-plan-composite.test.ts`

Expected: all focused tests pass, including selective patch preservation.

- [x] **Step 5: Commit the canonical-page fix**

```bash
git add backend/src/services/estimate-plan-review.service.ts backend/tests/estimate-plan-review-client.test.ts backend/tests/estimate-plan-composite.test.ts
git commit -m "fix: keep replacement pages out of full design"
```

### Task 2: Separate editable and projected annotation layers

**Files:**
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx`
- Modify: `frontend/src/components/design/ImageAnnotationEditor.tsx`

**Interfaces:**
- Produces: `EstimateDrawingPreviewDialogProps.sharedAnnotations?: AnnotationDocumentV1["elements"]`.
- Guarantees: `onSaveDraft` and `onSubmitChangeRequest` receive only the editable annotation document.

- [x] **Step 1: Write a failing shared-layer persistence test**

Render the dialog with one editable rectangle and one shared text annotation:

```tsx
<EstimateDrawingPreviewDialog
  {...previewProps({
    annotations: editableDocument,
    sharedAnnotations: [sharedText],
    onSaveDraft
  })}
/>
```

Assert both marks are visible, the shared mark has `data-shared="true"`, and saving calls:

```ts
expect(onSaveDraft).toHaveBeenCalledWith(editableDocument);
```

The shared text ID must not occur in the submitted document.

- [x] **Step 2: Run the dialog test and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: TypeScript/runtime behavior lacks the `sharedAnnotations` layer.

- [x] **Step 3: Render shared annotations as a non-interactive overlay**

Add the prop:

```ts
sharedAnnotations?: AnnotationDocumentV1["elements"];
```

Inside the canvas, render the editable `ImageAnnotationEditor` as today and a sibling `AnnotationOverlay` containing:

```ts
{
  schemaVersion: 1,
  imageWidth,
  imageHeight,
  elements: sharedAnnotations
}
```

Mark shared SVG elements with `data-shared="true"` and `pointerEvents="none"`. Do not merge shared elements into component state.

- [x] **Step 4: Run the dialog and editor tests and verify GREEN**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/EstimateDrawingPreviewDialog.test.tsx src/components/design/ImageAnnotationEditor.test.tsx`

Expected: both files pass and persistence callbacks contain no shared elements.

- [x] **Step 5: Commit the layer separation**

```bash
git add frontend/src/components/design/EstimateDrawingPreviewDialog.tsx frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx frontend/src/components/design/ImageAnnotationEditor.tsx
git commit -m "fix: separate shared plan annotations"
```

### Task 3: Project extracted annotations into Full Design

**Files:**
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/ClientPlanPageReview.tsx`
- Modify: `frontend/src/features/estimates/ClientPlanPageReview.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Modify: `frontend/src/components/design/planGeometry.test.ts`

**Interfaces:**
- Produces: `projectDrawingAnnotationsToPage(page, drawingWorkspace, planWorkspace): AnnotationElement[]`.
- `ClientPlanPageReview` consumes `sharedAnnotations` and passes them to `EstimateDrawingPreviewDialog`.
- `ClientDrawingRow` passes projected plan annotations separately instead of merging them into editable drawing annotations.

- [x] **Step 1: Extend geometry round-trip tests**

For rectangle, ellipse, arrow, freehand, and text fixtures, assert:

```ts
expect(projectAnnotationToCrop(
  projectAnnotationToPage(element, crop, page),
  crop,
  page
)).toEqual(element);
```

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/planGeometry.test.ts`

Expected: existing coordinate functions pass for all supported shapes; if a shape fails, fix only its point mapping before continuing.

- [x] **Step 2: Write the failing extracted-to-page composition test**

Create a drawing draft in a crop `{ x: 200, y: 100, width: 400, height: 300 }` on a `1000 × 800` page. Open Full Design and assert the projected mark uses page-normalized coordinates. Also provide an open request with the same logical source mark and assert only one shared annotation renders.

- [x] **Step 3: Run focused estimate tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: Full Design does not render the drawing draft/request shared layer.

- [x] **Step 4: Implement stable projection and deduplication**

Create a pure helper that:

1. finds the latest visible revision for each active drawing on the selected canonical page;
2. projects `revision.annotationDraft?.annotations ?? revision.annotations` using `projectAnnotationToPage` and that revision crop;
3. namespaces IDs as `drawing:<revisionId>:<elementId>`;
4. namespaces submitted plan-request IDs as `request:<requestId>:<elementId>`;
5. omits a drawing draft when an open request targets the same revision, preventing the draft/request transition from rendering twice.

Pass the resulting elements into `ClientPlanPageReview.sharedAnnotations`. In extracted drawing previews, pass `sharedPlanAnnotations(...)` through the dialog's shared layer rather than concatenating it into the editable document.

- [x] **Step 5: Verify bidirectional focused behavior**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/planGeometry.test.ts src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: projected annotations appear in both directions, remain read-only when imported, and never enter draft/request payloads twice.

- [x] **Step 6: Commit bidirectional projection**

```bash
git add frontend/src/components/design/planGeometry.test.ts frontend/src/features/estimates/ClientEstimateDrawings.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/features/estimates/ClientPlanPageReview.tsx frontend/src/features/estimates/ClientPlanPageReview.test.tsx frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
git commit -m "fix: project drawing annotations into full plan"
```

### Task 4: End-to-end selective replacement verification

**Files:**
- Modify: `backend/tests/estimate-plan-composite.test.ts`
- Modify: `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`
- Modify: `docs/superpowers/plans/2026-08-03-bidirectional-plan-annotation-projection.md`

**Interfaces:**
- Consumes: canonical upload filter, shared annotation projection, and existing `advanceForDrawingRevision` patch composition.
- Produces: regression evidence for the complete client-to-staff-to-client path.

- [x] **Step 1: Add a targeted replacement image assertion**

In the composite test, retain two original patches, replace drawing A, and assert:

```ts
expect(next.patches).toEqual([
  expect.objectContaining({ drawingId: "drawing-a", drawingRevisionId: "revision-a2", crop: originalCropA }),
  expect.objectContaining({ drawingId: "drawing-b", drawingRevisionId: "revision-b1", crop: originalCropB })
]);
expect(await EstimatePlanPageRevisionModel.distinct("sourcePageId")).toEqual(["page-1"]);
```

- [x] **Step 2: Add the client journey assertion**

Exercise an extracted annotation request, refresh plan and drawing workspaces, assert the mark is visible in Full Design on the original page, upload the targeted replacement, then assert the replacement revision image is used while the original plan still exposes the same page IDs and count.

- [x] **Step 3: Run focused end-to-end tests**

Run backend: `npm test -- --run tests/estimate-plan-composite.test.ts tests/estimate-plan-review-client.test.ts`

Run frontend: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/estimateDrawingJourney.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: all focused tests pass.

- [x] **Step 4: Run complete verification**

Backend:

```bash
npm test
npm run typecheck
npm run build
```

Frontend:

```bash
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build
```

Expected: zero failures and successful production builds.

- [x] **Step 5: Mark this plan complete, commit, and push the feature branch**

```bash
git add backend frontend docs/superpowers/plans/2026-08-03-bidirectional-plan-annotation-projection.md
git commit -m "fix: synchronize plan and drawing annotations"
git push origin feature/ocr_improvements
```

Do not merge to master.

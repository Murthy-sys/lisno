# Synchronized Full-Plan Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronized full-plan and extracted-drawing review workflow in which clients annotate either view, staff replace only requested drawings, and the current full-plan preview patches each new drawing revision into its original position.

**Architecture:** Keep normalized source pages immutable and store annotations canonically in normalized page coordinates. Add page revision manifests and shared change requests, then project page annotations into drawing crops and drawing annotations back into page space through a pure geometry library. Build current-plan previews from the immutable base page plus selected immutable drawing revision patches; never regenerate or mutate unrelated drawings.

**Tech Stack:** TypeScript, Node.js, Express, MongoDB/Mongoose, React, TanStack Query, SVG, Sharp, Vitest, Testing Library, existing authenticated blob/image APIs.

## Global Constraints

- Preserve the original uploaded PDF and every normalized source page as immutable data.
- Persist annotation geometry in normalized `0..1` source-page coordinates; never persist CSS pixels, zoom scale, or viewport translation.
- A replacement creates a new immutable revision only for explicitly targeted drawings.
- Unchanged drawing revisions, crop positions, review states, and approvals remain unchanged.
- Full-page annotations that overlap several drawings require explicit client target confirmation.
- Non-overlapping annotations remain valid as unassigned page feedback.
- No separate pan tool: wheel, pinch, buttons, double-click/tap, and empty-canvas drag provide map-style navigation.
- **Ask Lisno** is a non-functional UI placeholder only; no AI service or chat persistence is introduced.
- Existing upload, page, pixel, output, annotation-byte, processing-time, authorization, and storage-safety limits remain enforced.
- Notifications and audit events contain metadata only—never storage references, source bytes, claim tokens, or raw annotation documents.
- All state-changing requests use optimistic versions and idempotency where retry could duplicate a request or revision.
- Follow red-green TDD for every behavior change and commit each task independently.

---

## File Structure

### Backend domain and persistence

- Create `backend/src/domain/estimate-plan-review.ts`: canonical page geometry, crop projection, overlap detection, patch-manifest and lifecycle invariants.
- Create `backend/src/models/EstimatePlanPageRevision.ts`: immutable page revision manifest.
- Create `backend/src/models/EstimatePlanChangeRequest.ts`: shared client request and per-target resolution state.
- Create `backend/src/models/EstimatePlanAnnotationDraft.ts`: versioned page-level draft.
- Create `backend/src/services/estimate-plan-review.service.ts`: page workspace, drafts, requests, staff actions, and composite reads.
- Create `backend/src/routes/estimate-plan-review.ts`: client/staff protected HTTP contract.
- Modify `backend/src/services/estimate-design.service.ts`: drawing-decision projection, selective replacement completion hook, and final-readiness integration.
- Modify `backend/src/app.ts`: service/router wiring.

### Frontend domain and UI

- Create `frontend/src/components/design/planGeometry.ts`: browser-side projection for immediate display using the same documented formulas.
- Create `frontend/src/components/design/MapViewport.tsx`: zoom/pinch/drag transform shell with no pan mode.
- Modify `frontend/src/components/design/ImageAnnotationEditor.tsx`: render/edit annotations through the viewport transform.
- Modify `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`: shared page/crop preview actions and target confirmation integration.
- Create `frontend/src/features/estimates/ClientFullPlanNav.tsx`: page thumbnails, statuses, mobile drawer, and Ask Lisno placeholder.
- Create `frontend/src/features/estimates/ClientPlanPageReview.tsx`: page preview, drafts, overlap preview, and request submission.
- Modify `frontend/src/features/estimates/ClientEstimateDrawings.tsx`: page-coordinate projection and synchronized request display.
- Create `frontend/src/features/leads/EstimatePlanChangeRequests.tsx`: staff queue/detail, target linking, replacement, and resolution.
- Modify `frontend/src/features/leads/LeadEstimateWorkspace.tsx`: staff review surface integration.
- Modify `frontend/src/api/types.ts` and `frontend/src/features/leads/estimateDesignApi.ts`: typed API contracts.

### Tests and operations

- Create focused domain, service, route, component, and end-to-end journey tests beside their production units.
- Create `docs/estimate-full-plan-review.md`: local workflow, lifecycle, failure recovery, and manual QA instructions.

---

### Task 1: Canonical Page Geometry and Overlap Detection

**Files:**
- Create: `backend/src/domain/estimate-plan-review.ts`
- Create: `backend/tests/estimate-plan-geometry.test.ts`
- Create: `frontend/src/components/design/planGeometry.ts`
- Create: `frontend/src/components/design/planGeometry.test.ts`

**Interfaces:**
- Produces: `NormalizedPoint`, `NormalizedBounds`, `PageGeometry`, and `DrawingCropGeometry`.
- Produces: `cropPointToPage(point, crop, page) -> NormalizedPoint`.
- Produces: `pagePointToCrop(point, crop, page) -> NormalizedPoint | null`.
- Produces: `projectAnnotationToPage(element, crop, page) -> AnnotationElementV1`.
- Produces: `projectAnnotationToCrop(element, crop, page) -> AnnotationElementV1 | null`.
- Produces: `detectAnnotationTargets(elements, drawings, page) -> DrawingTargetMatch[]`.
- Consumes: existing `AnnotationElementV1` and integer `CropRect` contracts.

- [ ] **Step 1: Add failing backend round-trip tests**

Test rectangle, circle, arrow, freehand, and text geometry. Assert that crop → page → crop returns every coordinate within `1 / max(page.width, page.height)` and returns `null` when a page element does not intersect the crop.

```ts
it("round-trips every annotation geometry through a drawing crop", () => {
  const page = { width: 2000, height: 1000 };
  const crop = { x: 500, y: 100, width: 800, height: 600 };
  const source = annotationFixtureWithEveryElement();
  const pageElements = source.elements.map((element) =>
    projectAnnotationToPage(element, crop, page)
  );
  const restored = pageElements.map((element) =>
    projectAnnotationToCrop(element, crop, page)
  );
  expectGeometryClose(restored, source.elements, 1 / 2000);
});
```

- [ ] **Step 2: Run the backend tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/estimate-plan-geometry.test.ts
```

Expected: FAIL because `estimate-plan-review.ts` does not exist.

- [ ] **Step 3: Implement bounded coordinate projection**

Implement one primitive point transform and map every annotation geometry
through it. Reject non-finite values and coordinates outside `0..1`; do not
silently clamp invalid persisted input.

```ts
export function cropPointToPage(
  point: NormalizedPoint,
  crop: CropRect,
  page: PageGeometry
): NormalizedPoint {
  assertNormalizedPoint(point);
  assertCropWithinPage(crop, page);
  return {
    x: (crop.x + point.x * crop.width) / page.width,
    y: (crop.y + point.y * crop.height) / page.height
  };
}
```

- [ ] **Step 4: Add failing overlap tests**

Cover no overlap, one crop, nested crops, two crops, boundary-only contact,
annotation centroid inside a crop, and the 15-percent bounding-area rule. Lines
and arrows use midpoint, freehand uses point centroid, and text uses its anchor.

```ts
expect(detectAnnotationTargets([annotation], drawings, page)).toEqual([
  { drawingId: "drawing-a", reason: "anchor_inside" },
  { drawingId: "drawing-b", reason: "area_overlap" }
]);
```

- [ ] **Step 5: Implement deterministic overlap detection**

Return stable results sorted by crop area descending and drawing ID ascending.
Do not count a zero-area boundary intersection.

- [ ] **Step 6: Mirror the pure projection contract in the frontend**

Add equivalent browser functions and fixture-driven tests using the same JSON
cases as the backend. The backend remains authoritative; the frontend copy is
for immediate rendering only.

- [ ] **Step 7: Run focused and full geometry tests**

```bash
cd backend && npm test -- --run tests/estimate-plan-geometry.test.ts
cd ../frontend && VITE_API_URL=/api/v1 npm test -- --run src/components/design/planGeometry.test.ts
```

Expected: all geometry and overlap tests pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add backend/src/domain/estimate-plan-review.ts backend/tests/estimate-plan-geometry.test.ts frontend/src/components/design/planGeometry.ts frontend/src/components/design/planGeometry.test.ts
git commit -m "feat: project plan annotations across drawing crops"
```

---

### Task 2: Page Revisions, Shared Requests, and Versioned Draft Persistence

**Files:**
- Create: `backend/src/models/EstimatePlanPageRevision.ts`
- Create: `backend/src/models/EstimatePlanChangeRequest.ts`
- Create: `backend/src/models/EstimatePlanAnnotationDraft.ts`
- Create: `backend/tests/estimate-plan-review-models.test.ts`
- Modify: `backend/src/domain/estimate-plan-review.ts`

**Interfaces:**
- Produces: `PlanPagePatch { drawingId, drawingRevisionId, crop, order }`.
- Produces: immutable `EstimatePlanPageRevision` with unique `{ sourcePageId, revisionNumber }`.
- Produces: `EstimatePlanChangeRequest` with `targets[]`, `unassigned`, `status`, and optimistic `version`.
- Produces: `EstimatePlanAnnotationDraft` unique by `{ clientId, sourcePageId }` with optimistic `version`.
- Consumes: Task 1 normalized page-coordinate annotation validation.

- [ ] **Step 1: Add failing schema invariant tests**

Assert:

- duplicate page revision numbers are rejected;
- patch drawing IDs and revision IDs are non-empty and unique per manifest;
- target resolution states are exactly `open | replacement_submitted | approved | resolved`;
- `unassigned=true` requires zero targets;
- `unassigned=false` requires at least one target;
- raw annotations respect the existing 256 KiB UTF-8 limit;
- storage references cannot appear in request/audit DTOs.

- [ ] **Step 2: Run model tests and verify RED**

```bash
cd backend
npm test -- --run tests/estimate-plan-review-models.test.ts
```

Expected: FAIL because the models and domain schemas do not exist.

- [ ] **Step 3: Implement focused Mongoose schemas**

Use immutable identifiers, source-page references, page revision numbers, patch
manifests, creator/reviewer IDs, timestamps, and strict embedded schemas. Keep
annotation documents in the draft/request only; patch manifests store no image
bytes.

```ts
const patchSchema = new Schema({
  drawingId: { type: String, required: true, immutable: true },
  drawingRevisionId: { type: String, required: true, immutable: true },
  crop: { type: cropSchema, required: true, immutable: true },
  order: { type: Number, required: true, immutable: true, min: 0 }
}, { _id: false, strict: "throw" });
```

- [ ] **Step 4: Add lifecycle transition tests**

Test that only these target transitions are legal:

```text
open -> replacement_submitted -> approved
open -> resolved
replacement_submitted -> open  (client requests more changes)
```

Overall status is `resolved` only when every target is `approved|resolved`, or
when unassigned feedback is explicitly resolved.

- [ ] **Step 5: Implement lifecycle guards and DTO types**

Expose pure `requirePlanRequestTransition()` and
`derivePlanRequestStatus()` functions. No service writes status directly
without these guards.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
cd backend
npm test -- --run tests/estimate-plan-review-models.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/src/domain/estimate-plan-review.ts backend/src/models/EstimatePlanPageRevision.ts backend/src/models/EstimatePlanChangeRequest.ts backend/src/models/EstimatePlanAnnotationDraft.ts backend/tests/estimate-plan-review-models.test.ts
git commit -m "feat: persist plan review revisions and requests"
```

---

### Task 3: Client Plan Workspace, Protected Images, Drafts, and Request Submission

**Files:**
- Create: `backend/src/services/estimate-plan-review.service.ts`
- Create: `backend/src/routes/estimate-plan-review.ts`
- Create: `backend/tests/estimate-plan-review-client.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/leads/estimateDesignApi.ts`

**Interfaces:**
- Produces: `GET /client/estimates/:estimateId/plan-review`.
- Produces: `GET /client/estimate-plan-pages/:pageId/thumbnail`.
- Produces: `GET /client/estimate-plan-pages/:pageId/current-image`.
- Produces: `PUT /client/estimate-plan-pages/:pageId/annotation-draft`.
- Produces: `POST /client/estimate-plan-pages/:pageId/target-preview`.
- Produces: `POST /client/estimate-plan-pages/:pageId/change-requests`.
- Consumes: Task 1 projection/overlap functions and Task 2 models.

- [ ] **Step 1: Add failing authorization and DTO tests**

Create two clients and two estimates. Assert a client can read only its claimed
estimate pages, cannot access raw storage references, and receives:

```ts
type ClientPlanWorkspace = {
  pages: Array<{
    id: string;
    uploadId: string;
    pageNumber: number;
    width: number;
    height: number;
    currentRevisionId: string;
    status: "awaiting_review" | "changes_requested" | "revised" | "approved";
    thumbnailUrl: string;
    currentImageUrl: string;
    annotationDraft: PlanAnnotationDraftDto | null;
  }>;
  openRequests: PlanChangeRequestDto[];
};
```

- [ ] **Step 2: Run client route tests and verify RED**

```bash
cd backend
npm test -- --run tests/estimate-plan-review-client.test.ts
```

Expected: `404` because the router is not registered.

- [ ] **Step 3: Implement lazy bootstrap of page revision manifests**

When a submitted estimate page has no manifest, create revision 1 inside a
transaction from active latest drawing revisions on that page. Sort patches by
crop area descending, then drawing ID, so smaller/detail patches render last.
Concurrent calls must converge on the unique page revision.

- [ ] **Step 4: Implement protected workspace and image reads**

Reuse current estimate/client ownership checks and storage streaming. Thumbnail
generation is bounded and cached by immutable page revision ID. Current-image
composition is implemented in Task 4; until then the endpoint returns the
immutable normalized page for revision 1.

- [ ] **Step 5: Add failing draft version tests**

Assert version `0` creates, the returned version increments, a stale version
returns `409`, an exact idempotent retry returns the current draft, and a draft
cannot be saved after the page becomes non-reviewable.

- [ ] **Step 6: Implement page draft persistence**

Validate canonical page dimensions and normalized coordinates. Store the
client page draft transactionally and append a metadata-only audit event with
element count, page ID, and version.

- [ ] **Step 7: Add failing target-preview and submission tests**

Test zero, one, and multiple detected targets. Submission must reject selected
drawing IDs that are inactive, belong to another page, or were not returned by
the same geometry/version snapshot. Require an idempotency key.

- [ ] **Step 8: Implement target preview and shared request creation**

The preview returns detected target IDs/titles/reasons plus a signed or opaque
snapshot token. Submission recomputes the overlap, validates the token/version,
creates one request, copies the page-coordinate annotations, and queues
metadata-only recipients for estimator/sales and assigned design staff.

- [ ] **Step 9: Project existing drawing requests into the page workspace**

When an existing extracted drawing has a client change request, project its
annotations into page coordinates and expose the same request identity in the
page workspace. Do not duplicate persistence.

- [ ] **Step 10: Add typed frontend client functions**

Add exact DTOs and functions:

```ts
getClientPlanWorkspace(estimateId)
saveClientPlanDraft(pageId, version, annotations)
previewClientPlanTargets(pageId, version, annotations)
submitClientPlanChangeRequest(pageId, input, idempotencyKey)
clientPlanThumbnailUrl(pageId)
clientPlanCurrentImageUrl(pageId)
```

- [ ] **Step 11: Run focused tests, backend typecheck, and route-security tests**

```bash
cd backend
npm test -- --run tests/estimate-plan-review-client.test.ts tests/estimate-design-review.test.ts tests/cors.test.ts
npm run typecheck
```

- [ ] **Step 12: Commit Task 3**

```bash
git add backend/src/services/estimate-plan-review.service.ts backend/src/routes/estimate-plan-review.ts backend/tests/estimate-plan-review-client.test.ts backend/src/app.ts backend/src/services/estimate-design.service.ts frontend/src/api/types.ts frontend/src/features/leads/estimateDesignApi.ts
git commit -m "feat: review complete estimate plan pages"
```

---

### Task 4: Selective Composite Rendering and Revision Advancement

**Files:**
- Modify: `backend/src/services/estimate-plan-review.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Create: `backend/tests/estimate-plan-composite.test.ts`
- Modify: `backend/tests/estimate-design-extraction.test.ts`
- Modify: `backend/tests/estimate-design-review.test.ts`

**Interfaces:**
- Produces: `renderCurrentPlanPage(user, pageId) -> StoredImageRead`.
- Produces: `advancePlanPageForDrawing(session, drawingRevision) -> EstimatePlanPageRevision`.
- Consumes: immutable source-page image, patch manifest, and existing protected drawing-revision images.

- [ ] **Step 1: Add failing pixel-preservation tests**

Create a deterministic colored source page with two non-overlapping drawing
crops. Replace only drawing A. Assert:

- output dimensions equal source dimensions;
- pixels inside A equal the new patch;
- pixels inside B equal its prior patch;
- all pixels outside patch rectangles equal the source page;
- the old page revision manifest is unchanged.

- [ ] **Step 2: Run composite tests and verify RED**

```bash
cd backend
npm test -- --run tests/estimate-plan-composite.test.ts
```

Expected: FAIL because composite rendering does not exist.

- [ ] **Step 3: Implement bounded Sharp composition**

Read the immutable base image and latest permitted patch images, validate each
patch's dimensions against its crop, and composite in manifest order. Cache by
page revision ID through the existing storage abstraction. Never use a mutable
cache key.

```ts
const layers = patches.map((patch) => ({
  input: patchBytesByRevision.get(patch.drawingRevisionId)!,
  left: patch.crop.x,
  top: patch.crop.y
}));
const output = await sharp(baseBytes).composite(layers).png().toBuffer();
```

- [ ] **Step 4: Add failing selective-manifest advancement tests**

Submit a replacement for drawing A and assert the next manifest changes only
A's revision identifier. Drawing B's manifest entry, approval, crop, and image
reference remain equal. Concurrent completion of the same replacement must
create one page revision.

- [ ] **Step 5: Implement the replacement completion hook**

Inside the existing Mongo transaction that publishes a drawing replacement,
copy the prior page manifest, replace the matching entry, and create the next
page revision. If no manifest entry exists, append the drawing deterministically.
Do not advance the page manifest for failed/unverified replacement uploads.

- [ ] **Step 6: Implement non-destructive fallback**

If a patch cannot be decoded, serve the prior cached page revision or immutable
base page, record an observable metadata-only audit event, and return a bounded
warning header/status in staff diagnostics. Never delete the previous cache or
revision.

- [ ] **Step 7: Integrate request target lifecycle and readiness**

Replacement submission sets only its target to `replacement_submitted`.
Client approval sets only that target to `approved`. Final estimate approval is
blocked while any page request target remains open or replacement-submitted.

- [ ] **Step 8: Run composite, replacement, journey, and full backend tests**

```bash
cd backend
npm test -- --run tests/estimate-plan-composite.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts tests/full-journey.test.ts
npm test
npm run typecheck
npm run build
```

- [ ] **Step 9: Commit Task 4**

```bash
git add backend/src/services/estimate-plan-review.service.ts backend/src/services/estimate-design.service.ts backend/tests/estimate-plan-composite.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts
git commit -m "feat: patch selective drawing revisions into plan pages"
```

---

### Task 5: Staff Change-Request Queue, Assignment, and Resolution APIs

**Files:**
- Modify: `backend/src/routes/estimate-plan-review.ts`
- Modify: `backend/src/services/estimate-plan-review.service.ts`
- Create: `backend/tests/estimate-plan-review-staff.test.ts`
- Modify: `backend/src/models/Estimate.ts`
- Modify: `backend/tests/full-journey.test.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/leads/estimateDesignApi.ts`

**Interfaces:**
- Produces: `GET /estimate-plan-change-requests` with role-filtered queue.
- Produces: `GET /estimate-plan-change-requests/:requestId`.
- Produces: `PUT /estimate-plan-change-requests/:requestId/targets`.
- Produces: `POST /estimate-plan-change-requests/:requestId/resolve-page`.
- Reuses: existing manual drawing creation and drawing replacement endpoints.
- Consumes: Task 2 lifecycle guards and Task 4 manifest advancement.

- [ ] **Step 1: Add failing role and queue tests**

Assert estimator/sales sees requests for owned leads, assigned design staff sees
requests for assigned projects, unrelated staff cannot read them, and clients
cannot access staff routes. Queue DTO includes summary/status/target metadata
but excludes annotation payloads until detail is opened.

- [ ] **Step 2: Run staff tests and verify RED**

```bash
cd backend
npm test -- --run tests/estimate-plan-review-staff.test.ts
```

- [ ] **Step 3: Implement queue/detail authorization**

Centralize access in `requirePlanReviewStaffAccess(user, estimate)` and reuse it
for image reads, linking, replacements, and resolution. Do not expand existing
roles beyond estimator/sales and actually assigned design users.

- [ ] **Step 4: Add failing unassigned-feedback tests**

Cover:

- linking to one or more active drawings on the same page;
- rejecting cross-page/inactive targets;
- creating a new manual crop through the existing bounds validation;
- resolving as page-only with a bounded staff note;
- optimistic conflict when another staff member acts first.

- [ ] **Step 5: Implement target linking and page-only resolution**

Changing targets creates audit events with request/page/drawing IDs only.
Page-only resolution creates a new page revision only when a corrected full-page
artifact is supplied; otherwise it records resolution against the immutable
page with a note and does not change image bytes.

- [ ] **Step 6: Add metadata-only notification tests**

Assert the estimate notification array queues `estimate_plan_changes_requested`
for relevant estimator/sales/design recipients and
`estimate_plan_revision_ready` for the client after staff submission. Ensure
deduplication by request/target/revision and no raw annotations or storage keys.

- [ ] **Step 7: Implement typed staff API functions**

Add:

```ts
getEstimatePlanChangeRequests(filters)
getEstimatePlanChangeRequest(requestId)
updateEstimatePlanRequestTargets(requestId, input)
resolveEstimatePlanPageRequest(requestId, input)
```

- [ ] **Step 8: Extend the backend cross-role journey**

Exercise page annotation → confirmed target → staff queue → selective
replacement → client approval → resolved request → final estimate approval.
Assert unrelated drawing approval/revision IDs never change.

- [ ] **Step 9: Run focused and full backend verification**

```bash
cd backend
npm test -- --run tests/estimate-plan-review-staff.test.ts tests/full-journey.test.ts
npm test
npm run typecheck
```

- [ ] **Step 10: Commit Task 5**

```bash
git add backend/src/routes/estimate-plan-review.ts backend/src/services/estimate-plan-review.service.ts backend/tests/estimate-plan-review-staff.test.ts backend/src/models/Estimate.ts backend/tests/full-journey.test.ts frontend/src/api/types.ts frontend/src/features/leads/estimateDesignApi.ts
git commit -m "feat: route plan change requests to project staff"
```

---

### Task 6: Map-Style Zoom and Drag Interaction Shell

**Files:**
- Create: `frontend/src/components/design/MapViewport.tsx`
- Create: `frontend/src/components/design/MapViewport.test.tsx`
- Modify: `frontend/src/components/design/ImageAnnotationEditor.tsx`
- Modify: `frontend/src/components/design/ImageAnnotationEditor.test.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Produces: `MapViewport` with controlled `scale`, `translateX`, and `translateY`.
- Produces: `screenPointToDocumentPoint()` for annotation tools.
- Consumes: existing SVG annotation editor and protected image component.

- [ ] **Step 1: Add failing viewport interaction tests**

Test:

- wheel zoom around pointer;
- pinch zoom around touch midpoint;
- `+`, `−`, fit, and reset controls;
- double-click/tap zoom at location;
- empty-canvas drag translates the view;
- annotation-tool drag creates a mark instead of moving the page;
- scale remains in `0.5..8`;
- no button/label named Pan exists.

- [ ] **Step 2: Run viewport tests and verify RED**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/components/design/MapViewport.test.tsx
```

- [ ] **Step 3: Implement transform state and focal zoom**

Use pointer events and pointer capture. Apply one CSS transform to the image and
SVG overlay together. Convert pointer positions back through the inverse
transform before annotation geometry is updated.

```ts
const documentX = (screenX - translateX) / scale;
const documentY = (screenY - translateY) / scale;
```

- [ ] **Step 4: Add failing alignment and resize tests**

Draw at scale 1, zoom to 4, resize the dialog, fit to screen, and assert the SVG
mark still aligns with the same normalized image point. Repeat for a projected
crop annotation.

- [ ] **Step 5: Integrate the existing annotation editor**

Keep persisted annotations unchanged. Replace its separate zoom/pan behavior
with `MapViewport`; remove any pan-mode control; retain keyboard create/select/
move/resize/delete, undo/redo, byte limits, and unsaved-close protection.

- [ ] **Step 6: Add accessible/touch styling**

Keep controls at least 44 CSS pixels on touch layouts, use a sticky mobile
toolbar with safe-area padding, and ensure it never covers the canvas. Announce
zoom percentage through a polite live region.

- [ ] **Step 7: Run focused editor, accessibility, and full frontend tests**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/components/design/MapViewport.test.tsx src/components/design/ImageAnnotationEditor.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx src/test/accessibility.test.tsx
VITE_API_URL=/api/v1 npm test
npm run typecheck
VITE_API_URL=/api/v1 npm run build
```

- [ ] **Step 8: Commit Task 6**

```bash
git add frontend/src/components/design/MapViewport.tsx frontend/src/components/design/MapViewport.test.tsx frontend/src/components/design/ImageAnnotationEditor.tsx frontend/src/components/design/ImageAnnotationEditor.test.tsx frontend/src/components/design/EstimateDrawingPreviewDialog.tsx frontend/src/styles/index.css
git commit -m "feat: add map-style plan review navigation"
```

---

### Task 7: Client Full-Design Side Navigation and Synchronized Review

**Files:**
- Create: `frontend/src/features/estimates/ClientFullPlanNav.tsx`
- Create: `frontend/src/features/estimates/ClientFullPlanNav.test.tsx`
- Create: `frontend/src/features/estimates/ClientPlanPageReview.tsx`
- Create: `frontend/src/features/estimates/ClientPlanPageReview.test.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: Task 3 client plan workspace APIs, Task 1 frontend projection, and Task 6 preview/editor.
- Produces: right-side full-design navigator, page-review modal, target confirmation, and Ask Lisno placeholder.

- [ ] **Step 1: Add failing side-navigation tests**

Render a six-page workspace and assert:

- six compact thumbnail rows render in page order;
- statuses and selected page are visible;
- protected bytes load only for visible thumbnail rows;
- selecting page 4 opens page 4 current-image URL;
- Ask Lisno remains last and visible;
- mobile layout exposes a Design pages drawer.

- [ ] **Step 2: Run navigation tests and verify RED**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientFullPlanNav.test.tsx
```

- [ ] **Step 3: Implement the responsive navigator**

Use an `aside` on desktop and the existing accessible dialog/drawer pattern on
small screens. Ask Lisno renders a disabled input and button with copy
`Ask Lisno — coming soon`; it performs no API call.

- [ ] **Step 4: Add failing page review/draft tests**

Open a page, add marks, save a draft, close/reopen, and assert restoration.
Test unsaved-close confirmation, stale-version conflict, autosave error/retry,
and read-only behavior after approval.

- [ ] **Step 5: Implement page preview and target confirmation**

Save canonical page-coordinate drafts. On Request changes:

1. call target preview;
2. show detected drawings with checkboxes;
3. require confirmation for one or multiple targets;
4. show unassigned explanation when none overlap;
5. submit one idempotent request;
6. invalidate only the matching client estimate workspace.

- [ ] **Step 6: Add failing cross-view synchronization tests**

Submit a page mark targeting drawing A and assert it appears projected in A's
preview but not drawing B. Submit a crop mark in A and assert it appears at the
correct page position with the same request ID.

- [ ] **Step 7: Integrate projection into extracted drawing rows**

Combine drawing-local legacy data and shared page requests into one derived
crop annotation document. Persist new decisions through the shared request API
when page-review support exists; retain compatibility for historical drawing
revision decisions.

- [ ] **Step 8: Integrate with the expanded estimate panel**

Fetch plan workspace only while its estimate is expanded. Preserve existing
estimate collapse behavior and drawing readiness text. The side navigator must
not appear for another estimate or before plans are submitted.

- [ ] **Step 9: Run focused journey, accessibility, and full frontend tests**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientFullPlanNav.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/test/accessibility.test.tsx
VITE_API_URL=/api/v1 npm test
npm run typecheck
```

- [ ] **Step 10: Commit Task 7**

```bash
git add frontend/src/features/estimates/ClientFullPlanNav.tsx frontend/src/features/estimates/ClientFullPlanNav.test.tsx frontend/src/features/estimates/ClientPlanPageReview.tsx frontend/src/features/estimates/ClientPlanPageReview.test.tsx frontend/src/features/estimates/ClientEstimateDrawings.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/styles/index.css
git commit -m "feat: review full design plans in the client portal"
```

---

### Task 8: Estimator, Sales, and Designer Change-Request Workspace

**Files:**
- Create: `frontend/src/features/leads/EstimatePlanChangeRequests.tsx`
- Create: `frontend/src/features/leads/EstimatePlanChangeRequests.test.tsx`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: Task 5 staff APIs and existing manual-crop/replacement APIs.
- Produces: role-authorized request queue/detail, unassigned mapping, replacement workflow, and status announcements.

- [ ] **Step 1: Add failing staff queue/detail tests**

Assert open requests sort oldest-first, show client/estimate/page/summary/status,
and open a split detail with full-page context, highlighted crops, selected
drawing, projected annotations, and immutable history.

- [ ] **Step 2: Run staff component tests and verify RED**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/leads/EstimatePlanChangeRequests.test.tsx
```

- [ ] **Step 3: Implement queue and split detail**

Use query keys scoped by role, estimate, and request. Never include protected
image URLs in list rows. Load images only after opening a request.

- [ ] **Step 4: Add failing unassigned-feedback action tests**

Test link-existing, create-crop, and resolve-page-only paths. Reuse `CropEditor`
for manual crop creation and display safe field errors and `409` refresh action.

- [ ] **Step 5: Implement target actions**

After success, invalidate request detail, request queue, estimator drawing
workspace, and only the related plan page workspace. Preserve the selected
request/focus where possible.

- [ ] **Step 6: Add failing selective replacement tests**

Upload a replacement for drawing A. Assert the staff UI shows A's new revision,
the current full-page image URL advances, drawing B keeps its old revision and
approved status, and no bulk replacement API is called.

- [ ] **Step 7: Reuse the existing replacement flow**

Pass the exact target drawing ID and latest version to the existing replacement
endpoint. Show queued/processing/review states. Do not permit replacement from
an unassigned request until a target exists.

- [ ] **Step 8: Expose assigned requests to design staff**

Add a project-workspace section for assigned designers using the same component
with role-derived permissions. Estimator/sales retains it inside the estimate
workspace. Do not duplicate request state or business logic.

- [ ] **Step 9: Run focused and full frontend verification**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/leads/EstimatePlanChangeRequests.test.tsx src/features/leads/EstimateDesignUploads.test.tsx src/features/designer/ProjectWorkspace.test.tsx
VITE_API_URL=/api/v1 npm test
npm run typecheck
VITE_API_URL=/api/v1 npm run build
```

- [ ] **Step 10: Commit Task 8**

```bash
git add frontend/src/features/leads/EstimatePlanChangeRequests.tsx frontend/src/features/leads/EstimatePlanChangeRequests.test.tsx frontend/src/features/leads/LeadEstimateWorkspace.tsx frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/designer/ProjectWorkspace.tsx frontend/src/styles/index.css
git commit -m "feat: resolve client plan requests by drawing"
```

---

### Task 9: Cross-Role Journey, Performance, Documentation, and Visual QA

**Files:**
- Modify: `backend/tests/full-journey.test.ts`
- Create: `frontend/src/features/estimates/fullPlanReviewJourney.test.tsx`
- Create: `docs/estimate-full-plan-review.md`
- Modify: `backend/README.md`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release evidence, operating instructions, and regression coverage for the complete synchronized workflow.

- [ ] **Step 1: Extend the backend journey with a deterministic two-crop page**

Exercise:

```text
upload -> extraction -> estimator verification/submission
-> client page annotation -> overlap confirmation
-> staff queue -> drawing A replacement
-> composite revision -> client approval
-> unchanged drawing B assertion -> final estimate approval
```

Assert request/audit/notification metadata, idempotent retries, immutable source
page, and unchanged B identifiers/state.

- [ ] **Step 2: Add the frontend cross-role journey**

Mock the same server state transitions rather than assigning terminal state
variables directly. Drive the real page draft, target preview, request submit,
staff replacement, client revised-page display, drawing approval, and final
readiness mutations.

- [ ] **Step 3: Add performance regressions**

Use a 50-page workspace fixture. Assert only visible thumbnail images are
requested, full page bytes load only after selection, and switching pages does
not decode all page images. Backend composite tests must remain within existing
page/pixel/output limits and avoid loading pages unrelated to the request.

- [ ] **Step 4: Document operation and recovery**

Document:

- page/drawing coordinate model;
- right-nav and Ask Lisno placeholder behavior;
- client/staff workflow;
- selective patch manifests;
- cache invalidation;
- stale conflict and failed replacement recovery;
- required upload/pixel/annotation limits;
- audit/notification privacy boundaries;
- local demo steps and role accounts.

- [ ] **Step 5: Run complete fresh verification**

```bash
cd backend
npm test
npm run typecheck
npm run build
cd ../frontend
VITE_API_URL=/api/v1 npm test
npm run typecheck
VITE_API_URL=/api/v1 npm run build
cd ..
git diff --check
git status --short
```

Expected: all tests pass, both projects typecheck and build, no whitespace
errors, and no generated composite/thumbnail artifacts remain tracked.

- [ ] **Step 6: Perform manual desktop/tablet/mobile visual verification**

At desktop, tablet, and 320-pixel widths verify:

- page thumbnails, statuses, selected state, and Ask Lisno placement;
- mobile Design pages drawer and safe-area spacing;
- wheel, trackpad, pinch, double-click/tap, buttons, and empty-canvas drag;
- annotation alignment through zoom, resize, and cross-view projection;
- multi-target confirmation and unassigned messaging;
- staff split detail and selective replacement;
- approved unchanged drawings remain read-only;
- keyboard focus order, dialog trapping, and live announcements.

Store screenshots outside the repository or in an ignored QA directory.

- [ ] **Step 7: Commit Task 9**

```bash
git add backend/tests/full-journey.test.ts frontend/src/features/estimates/fullPlanReviewJourney.test.tsx docs/estimate-full-plan-review.md backend/README.md frontend/src/styles/index.css
git commit -m "test: verify synchronized full-plan review journey"
```

---

## Final Review Gate

- [ ] Generate one consolidated review package from the branch base through
  Task 9.
- [ ] Request a whole-branch review against
  `docs/superpowers/specs/2026-08-03-synchronized-full-plan-review-design.md`.
- [ ] Fix every Critical and Important finding with focused regression tests.
- [ ] Run one scoped rereview of those fixes.
- [ ] Run the complete backend/frontend verification commands again on the
  final tree.
- [ ] Do not merge into `master` without explicit user approval.

# Estimate Design Image Extraction and Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let estimator/sales upload plans to an estimate, extract and map every titled drawing to its configured room and scope, collect client-only image annotations before estimate approval, and manage section-specific replacement revisions.

**Architecture:** Extend the existing leased OCR and protected-image infrastructure with estimate-owned upload, page, drawing, revision, annotation, and job records. The Python worker performs decoding, multi-title crop extraction, and canonical room/scope proposals; the TypeScript backend validates authorization, estimate taxonomy, revisions, review decisions, and final approval gating. React renders dense 40×40 drawing rows and an SVG-based annotation modal without adding a canvas dependency.

**Tech Stack:** Node.js 20, TypeScript, Express, Mongoose, Zod, Multer, React 19, TanStack Query, SVG Pointer Events, Vitest, Testing Library, Python 3.11, Pillow, pillow-heif, PyMuPDF, NumPy, PaddleOCR, pytest.

## Global Constraints

- Supported inputs are multi-page PDF, PNG, JPEG/JPG, WebP, TIFF/TIF, and HEIC/HEIF; DWG and DXF are excluded.
- Original uploads and every submitted/replaced crop are immutable and accessible only through authenticated endpoints.
- Drawings are placed under an exact estimate `roomId` plus canonical `scopeSectionId`; ambiguous results require estimator verification and are never silently discarded.
- Multiple drawings may occupy the same room and scope.
- Thumbnails are exactly 40×40 CSS pixels; full images and client tools appear only in the preview modal.
- Annotation tools are circle/ellipse, rectangle/square, arrow, freehand, text, select/move/resize, undo/redo, and delete.
- Annotations remain normalized vector data; never flatten them destructively into the source image.
- Annotation tools are client-only, individually approved revisions are read-only, and all revisions are read-only after final estimate approval.
- Final estimate approval is blocked until every active latest drawing revision is approved; estimates with no drawings preserve current behavior.
- Use TDD for every production change and commit after each independently reviewable task.

---

## File and Responsibility Map

### Backend

- `backend/src/domain/estimate-design.ts`: canonical status/type definitions, annotation schema limits, and room/scope validation helpers.
- `backend/src/domain/estimate-scope-catalogue.ts`: stable scope IDs and worker-facing aliases derived from the estimate catalogue.
- `backend/src/models/EstimateDesignUpload.ts`: estimate-owned original upload and extraction state.
- `backend/src/models/EstimateDesignSourcePage.ts`: normalized page artifacts and dimensions.
- `backend/src/models/EstimateDesignDrawing.ts`: stable drawing identity and current room/scope mapping.
- `backend/src/models/EstimateDesignRevision.ts`: immutable crop/review/replacement history.
- `backend/src/models/EstimateDesignAnnotationDraft.ts`: one client-owned editable annotation draft per submitted revision.
- `backend/src/models/EstimateDesignExtractionJob.ts`: leased worker job for estimate uploads.
- `backend/src/services/estimate-design.service.ts`: estimator/client authorization, upload lifecycle, mapping edits, review decisions, replacements, images, and approval readiness.
- `backend/src/routes/estimate-designs.ts`: HTTP validation and response streaming only.
- `backend/src/routes/extraction-worker.ts`: extend the existing worker boundary to claim and complete both project and estimate job kinds.
- `backend/src/middleware/upload.ts`: signature validation for TIFF and HEIC/HEIF.
- `backend/src/app.ts`: construct and register the estimate design service/router.
- `backend/src/routes/leads.ts`: call the approval-readiness guard before final client estimate approval.

### OCR worker

- `ocr-worker/src/lisno_ocr/contracts.py`: tagged job kind and room/scope proposal payloads.
- `ocr-worker/src/lisno_ocr/image_formats.py`: TIFF and HEIC/HEIF decoding into normalized RGB pages.
- `ocr-worker/src/lisno_ocr/estimate_taxonomy.py`: normalization, aliases, bounded fuzzy matching, and evidence.
- `ocr-worker/src/lisno_ocr/extractor.py`: accept estimate taxonomy and attach mappings to every extracted crop.
- `ocr-worker/src/lisno_ocr/worker.py`: send estimate extraction result payloads without changing project-job behavior.

### Frontend

- `frontend/src/api/types.ts`: estimate design DTOs, annotation types, statuses, and mutation inputs.
- `frontend/src/features/leads/estimateDesignApi.ts`: estimator and client API calls/query keys.
- `frontend/src/features/leads/EstimateDesignUploads.tsx`: upload, processing, retry, verification, correction, and submission orchestration.
- `frontend/src/features/leads/EstimateDrawingRow.tsx`: 40×40 estimator mini-card and context menu.
- `frontend/src/features/estimates/ClientEstimateDrawings.tsx`: client Room → Scope drawing groups and review actions.
- `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`: shared protected preview; mounts client tools only when permitted.
- `frontend/src/components/design/ImageAnnotationEditor.tsx`: SVG annotation state machine and toolbar.
- `frontend/src/components/design/annotationGeometry.ts`: normalized geometry conversion, hit testing, movement, resize, and bounds.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`: mount estimator design uploads and drawing rows.
- `frontend/src/features/estimates/EstimateReviewPanel.tsx`: mount client drawings and use approval readiness.
- `frontend/src/styles/index.css`: compact thumbnails, modal canvas, toolbar, and responsive bottom action bar.

---

### Task 1: Estimate Design Persistence and Secure Upload

**Files:**
- Create: `backend/src/domain/estimate-design.ts`
- Create: `backend/src/domain/estimate-scope-catalogue.ts`
- Create: `backend/src/models/EstimateDesignUpload.ts`
- Create: `backend/src/models/EstimateDesignSourcePage.ts`
- Create: `backend/src/models/EstimateDesignDrawing.ts`
- Create: `backend/src/models/EstimateDesignRevision.ts`
- Create: `backend/src/models/EstimateDesignAnnotationDraft.ts`
- Create: `backend/src/models/EstimateDesignExtractionJob.ts`
- Create: `backend/src/services/estimate-design.service.ts`
- Create: `backend/src/routes/estimate-designs.ts`
- Modify: `backend/src/middleware/upload.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/estimate-design-upload.test.ts`
- Test: `backend/tests/uploads.test.ts`

**Interfaces:**
- Consumes: existing `Storage`, `AuthenticatedUser`, `EstimateModel`, `LeadModel`, `uploadSingleFile`, and `ApiError`.
- Produces:

```ts
export type EstimateDesignExtractionStatus =
  | "queued" | "processing" | "estimator_review"
  | "processing_failed" | "submitted" | "changes_requested" | "approved";

export interface CreateEstimateDesignServiceInput {
  storage: Storage;
  maxUploadBytes: number;
  now?: () => Date;
}

export interface EstimateDesignService {
  upload(user: AuthenticatedUser, estimateId: string, file: ValidatedUpload): Promise<EstimateDesignUploadDto>;
  listEstimator(user: AuthenticatedUser, estimateId: string): Promise<EstimateDesignWorkspaceDto>;
  sourceImage(user: AuthenticatedUser, pageId: string): Promise<NodeJS.ReadableStream>;
  revisionImage(user: AuthenticatedUser, revisionId: string): Promise<NodeJS.ReadableStream>;
}
```

- [ ] **Step 1: Write failing model and upload-route tests**

Add tests that POST valid PDF, PNG, JPEG, WebP, TIFF, and HEIC signatures to
`/api/v1/estimates/:estimateId/design-uploads`, then assert:

```ts
expect(response.status).toBe(201);
expect(response.body.data).toMatchObject({
  estimateId: "estimate-draft",
  extractionStatus: "queued"
});
expect(await EstimateDesignExtractionJobModel.countDocuments({
  uploadId: response.body.data.id,
  status: "queued"
})).toBe(1);
```

Also prove foreign estimates return the same `404 ESTIMATE_NOT_FOUND`, locked or
client-approved estimates return `409 ESTIMATE_DESIGN_LOCKED`, fake extensions
fail signature validation, and oversized uploads leave no stored artifact.

- [ ] **Step 2: Run upload tests and confirm the intended failures**

Run:

```bash
cd backend
npm test -- --run tests/estimate-design-upload.test.ts tests/uploads.test.ts
```

Expected: FAIL because TIFF/HEIC signatures, models, service, and route do not exist.

- [ ] **Step 3: Add strict domain types and Mongoose schemas**

Implement immutable IDs, indexes, enum validation, timestamps, and these key
uniqueness constraints:

```ts
estimateDesignSourcePageSchema.index(
  { uploadId: 1, pageNumber: 1 },
  { unique: true }
);
estimateDesignRevisionSchema.index(
  { drawingId: 1, revisionNumber: 1 },
  { unique: true }
);
estimateDesignAnnotationDraftSchema.index(
  { revisionId: 1, clientId: 1 },
  { unique: true }
);
estimateDesignExtractionJobSchema.index(
  { status: 1, leaseExpiresAt: 1, queuedAt: 1 }
);
```

Store annotation elements as strict discriminated subdocuments with normalized
coordinates between `0` and `1`, at most 200 elements, at most 5,000 freehand
points total, text at most 500 characters per item, and payload at most 256 KiB.

- [ ] **Step 4: Extend signature detection for TIFF and HEIC/HEIF**

Recognize little- and big-endian TIFF headers and ISO BMFF `ftyp` brands
`heic`, `heix`, `hevc`, `hevx`, `heim`, `heis`, `mif1`, and `msf1`. Return
canonical MIME types `image/tiff` and `image/heic`; keep claimed MIME advisory
and require matching magic bytes.

- [ ] **Step 5: Implement atomic upload and job enqueue**

Authorize only the estimate owner with role `estimator_sales`, store the
original under an opaque reference, then persist upload plus queued job. If
persistence fails after storage, delete only the newly stored reference.
Register the route before generic `/:estimateId` patterns and stream protected
images with existing pipeline error handling.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
cd backend
npm test -- --run tests/estimate-design-upload.test.ts tests/uploads.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit Task 1**

```bash
git add backend/src/domain/estimate-design.ts backend/src/domain/estimate-scope-catalogue.ts backend/src/models/EstimateDesignUpload.ts backend/src/models/EstimateDesignSourcePage.ts backend/src/models/EstimateDesignDrawing.ts backend/src/models/EstimateDesignRevision.ts backend/src/models/EstimateDesignAnnotationDraft.ts backend/src/models/EstimateDesignExtractionJob.ts backend/src/services/estimate-design.service.ts backend/src/routes/estimate-designs.ts backend/src/middleware/upload.ts backend/src/app.ts backend/tests/estimate-design-upload.test.ts backend/tests/uploads.test.ts
git commit -m "feat: store estimate design uploads securely"
```

---

### Task 2: OCR Format Decoding and Canonical Room/Scope Matching

**Files:**
- Modify: `ocr-worker/pyproject.toml`
- Modify: `ocr-worker/src/lisno_ocr/contracts.py`
- Create: `ocr-worker/src/lisno_ocr/image_formats.py`
- Create: `ocr-worker/src/lisno_ocr/estimate_taxonomy.py`
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Test: `ocr-worker/tests/test_image_formats.py`
- Test: `ocr-worker/tests/test_estimate_taxonomy.py`
- Test: `ocr-worker/tests/test_extractor.py`
- Create: `ocr-worker/tests/fixtures/multi-room-scope-plan.png`

**Interfaces:**
- Consumes: worker-provided taxonomy:

```py
@dataclass(frozen=True, slots=True)
class TaxonomyTerm:
    id: str
    label: str
    aliases: tuple[str, ...]

@dataclass(frozen=True, slots=True)
class EstimateTaxonomy:
    rooms: tuple[TaxonomyTerm, ...]
    scopes: tuple[TaxonomyTerm, ...]
```

- Produces:

```py
@dataclass(frozen=True, slots=True)
class CanonicalMatch:
    id: str | None
    confidence: float
    evidence: tuple[str, ...]
    ambiguous: bool

@dataclass(frozen=True, slots=True)
class EstimateDrawingProposal:
    detected_title: str
    room: CanonicalMatch
    scope: CanonicalMatch
```

- [ ] **Step 1: Add failing normalization and matching tests**

Use literal expectations:

```py
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (" FALSE  CEILING---PLAN ", "false ceiling"),
        ("R.C.P.", "rcp"),
        ("LIVING–HALL LAYOUT", "living hall"),
    ],
)
def test_normalize_drawing_title(raw, expected):
    assert normalize_drawing_title(raw) == expected
```

Add mapping cases for `RCP`, `reflected ceiling plan`, `false cieling`,
`living hall`, `lounge`, `wall elevation`, flooring, electrical, and painting.
Assert ambiguous `bedroom ceiling` against Bedroom 1 and Bedroom 2 produces no
automatic room ID and `ambiguous=True`. Assert every title on the multi-title
fixture produces an independent crop and mapping.

- [ ] **Step 2: Add failing TIFF and HEIC decode tests**

Generate tiny in-memory TIFF and HEIC fixtures in the test. Assert
`open_source_pages()` yields RGB Pillow images with correct page order and
dimensions. Skip HEIC only when the optional decoder cannot import; CI must
install the declared dependency so the normal project suite does not skip it.

- [ ] **Step 3: Run worker tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_image_formats.py tests/test_estimate_taxonomy.py tests/test_extractor.py -q
```

Expected: FAIL because the decoder, taxonomy module, and proposal fields are absent.

- [ ] **Step 4: Add the reliable HEIF decoder dependency**

Add `pillow-heif>=0.20,<2` to base dependencies. Use Pillow's native TIFF
support and `pillow_heif.register_heif_opener()` for HEIC/HEIF; do not shell
out to ImageMagick or platform tools.

- [ ] **Step 5: Implement deterministic normalization and matching**

Use Unicode NFKC, case folding, punctuation-to-space conversion, whitespace
collapse, suffix removal, explicit aliases, and bounded token similarity.
Exact normalized aliases score `1.0`; OCR-confusion aliases score at least
`0.9`; fuzzy matches require `>=0.84` and a winning margin of `>=0.08`.
Return ambiguity instead of choosing when the winning margin is smaller.

Do not use an unbounded language model or network service. Keep alias tables
data-driven and stable-ID based.

- [ ] **Step 6: Extend extraction results without breaking project jobs**

Add optional `proposal` to `ExtractedSection`. When no estimate taxonomy is
provided, serialize the existing payload exactly. When provided, classify the
full normalized detected title and serialize:

```json
{
  "detectedTitle": "Living Room False Ceiling Plan",
  "room": { "id": "room-living", "confidence": 1, "evidence": ["living room"], "ambiguous": false },
  "scope": { "id": "FC", "confidence": 1, "evidence": ["false ceiling"], "ambiguous": false }
}
```

- [ ] **Step 7: Run worker tests**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -q
```

Expected: all worker tests pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add ocr-worker/pyproject.toml ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/image_formats.py ocr-worker/src/lisno_ocr/estimate_taxonomy.py ocr-worker/src/lisno_ocr/extractor.py ocr-worker/tests/test_image_formats.py ocr-worker/tests/test_estimate_taxonomy.py ocr-worker/tests/test_extractor.py ocr-worker/tests/fixtures/multi-room-scope-plan.png
git commit -m "feat: map extracted plans to estimate sections"
```

---

### Task 3: Leased Estimate Extraction and Estimator Verification APIs

**Files:**
- Modify: `backend/src/routes/extraction-worker.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/routes/estimate-designs.ts`
- Modify: `backend/src/app.ts`
- Modify: `ocr-worker/src/lisno_ocr/contracts.py`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Test: `backend/tests/estimate-design-extraction.test.ts`
- Test: `backend/tests/extraction-worker.test.ts`
- Test: `ocr-worker/tests/test_worker.py`

**Interfaces:**
- Consumes: Task 1 persistence and Task 2 `EstimateTaxonomy`/proposal payload.
- Produces:

```ts
type ClaimedExtractionJob =
  | { kind: "project_design"; /* existing fields */ }
  | {
      kind: "estimate_design";
      id: string;
      claimToken: string;
      sourceUrl: string;
      sourceFilename: string;
      sourceMimeType: string;
      taxonomy: {
        rooms: Array<{ id: string; label: string; aliases: string[] }>;
        scopes: Array<{ id: string; label: string; aliases: string[] }>;
      };
    };

interface EditEstimateDrawingInput {
  version: number;
  displayTitle?: string;
  roomId?: string;
  scopeSectionId?: string;
  crop?: CropRect;
  verified?: boolean;
}
```

- [ ] **Step 1: Write failing claim/completion integration tests**

Create a queued estimate job, claim it, and assert the response includes
`kind: "estimate_design"` plus only the estimate's configured rooms/scopes.
Complete it with two pages and four proposals, then assert four active drawings,
immutable revision 1 crops, and `estimator_review`. Reject unknown room/scope
IDs, out-of-bounds crops, duplicate pages, oversized output, and wrong claim
tokens without partial publication.

- [ ] **Step 2: Write failing estimator correction tests**

Test PATCH `/api/v1/estimate-design-drawings/:drawingId` for label, room, scope,
crop, and verified state. Assert:

```ts
expect(updated).toMatchObject({
  roomId: "room-living",
  scopeSectionId: "FC",
  verified: true,
  revision: { revisionNumber: 2, reviewStatus: "draft" }
});
```

Prove low-confidence drawings cannot be submitted until explicitly verified,
approved revisions cannot be edited, and stale `version` returns `409`.

- [ ] **Step 3: Run focused backend and worker tests to verify RED**

Run:

```bash
cd backend
npm test -- --run tests/estimate-design-extraction.test.ts tests/extraction-worker.test.ts
cd ../ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
```

- [ ] **Step 4: Introduce a tagged worker-job adapter**

Keep existing project job responses backward compatible. Select the oldest
claimable job across both job collections, atomically lease only that record,
and return a tagged payload. Route completion to the correct publisher by
`kind`. Never expose the claim token in the source URL.

- [ ] **Step 5: Publish estimate results transactionally**

Validate taxonomy IDs against the persisted estimate, page/crop limits against
the upload, and decoded image totals before creating any page/drawing/revision.
Store pages and crops under opaque references. On storage or database failure,
remove only newly generated artifacts and leave the job retryable.

- [ ] **Step 6: Implement estimator mapping/crop revisions and submit**

Every correction creates a new draft revision instead of overwriting the prior
crop. `verified=true` requires a valid room and enabled scope. Submitting
drawings requires no dirty/ambiguous unverified active drawing and changes all
latest drafts to `submitted` atomically.

- [ ] **Step 7: Update the Python worker client**

Parse the tagged job. For `estimate_design`, construct `EstimateTaxonomy`, call
the enhanced extractor, and send the tagged completion payload. Preserve
existing project-job retry/failure behavior and safe failure codes.

- [ ] **Step 8: Run focused and compatibility suites**

Run:

```bash
cd backend
npm test -- --run tests/estimate-design-extraction.test.ts tests/extraction-worker.test.ts tests/design-sections.test.ts
npm run typecheck
cd ../ocr-worker
.venv/bin/python -m pytest tests/test_worker.py tests/test_contract_fixture.py -q
```

- [ ] **Step 9: Commit Task 3**

```bash
git add backend/src/routes/extraction-worker.ts backend/src/services/extraction-worker.service.ts backend/src/services/estimate-design.service.ts backend/src/routes/estimate-designs.ts backend/src/app.ts backend/tests/estimate-design-extraction.test.ts backend/tests/extraction-worker.test.ts ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_worker.py
git commit -m "feat: review estimate drawing extraction"
```

---

### Task 4: Client Annotation, Decisions, Replacements, and Approval Gate

**Files:**
- Modify: `backend/src/domain/estimate-design.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/routes/estimate-designs.ts`
- Modify: `backend/src/routes/leads.ts`
- Test: `backend/tests/estimate-design-review.test.ts`
- Test: `backend/tests/leads.test.ts`
- Test: `backend/tests/full-journey.test.ts`

**Interfaces:**
- Consumes: submitted revisions from Task 3.
- Produces:

```ts
interface AnnotationDocumentV1 {
  schemaVersion: 1;
  imageWidth: number;
  imageHeight: number;
  elements: AnnotationElement[];
}

interface RequestDrawingChangesInput {
  version: number;
  summary: string;
  annotations: AnnotationDocumentV1;
}

interface ReplaceDrawingInput {
  version: number;
  file: ValidatedUpload;
}

interface EstimateDesignApprovalReadiness {
  ready: boolean;
  total: number;
  approved: number;
  awaitingReview: number;
  changesRequested: number;
}
```

- [ ] **Step 1: Write failing authorization and annotation-schema tests**

Prove only the exact lead-email client can list submitted drawings, save an
annotation draft, approve, or request changes. Test every element discriminator,
normalized bounds, shape/point/text/byte limits, forbidden estimator writes,
and consistent `404 ESTIMATE_NOT_FOUND` for foreign/hidden data.

- [ ] **Step 2: Write failing state-transition and replacement tests**

Assert a change request needs non-empty summary plus at least one annotation or
text note, locks the submitted revision, exposes read-only markings to the
owner, and changes the upload aggregate to `changes_requested`. Uploading a
replacement for that exact drawing creates revision N+1 with the same room and
scope, status `draft`, and historical linkage; approved siblings remain locked.

- [ ] **Step 3: Write failing final approval-gate tests**

Cover:

```ts
expect(await service.approvalReadiness(client, estimateId)).toEqual({
  ready: false,
  total: 2,
  approved: 1,
  awaitingReview: 0,
  changesRequested: 1
});
```

Assert `/client/estimates/:estimateId/decision` rejects approval with
`409 ESTIMATE_DRAWINGS_UNRESOLVED`, preserves the estimate state, allows normal
approval when no drawings exist, and allows approval when every active latest
revision is approved.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/estimate-design-review.test.ts tests/leads.test.ts tests/full-journey.test.ts
```

- [ ] **Step 5: Implement annotation validation and client decisions**

Use one strict Zod discriminated union shared by annotation draft and change
request routes. Normalize neither coordinates nor text server-side; reject
invalid payloads. Upsert client drafts with optimistic `version`, but copy the
submitted annotation document into the immutable revision decision before
deleting the editable draft.

- [ ] **Step 6: Implement section-specific replacement**

Accept replacement files only for the owner and only when the latest revision
is `changes_requested`. Decode the replacement as one full drawing image,
create a new source page plus draft revision, preserve room/scope/title, and
require estimator verification/submission before client visibility.

- [ ] **Step 7: Add transactional approval readiness**

Calculate readiness from active drawings' latest revisions inside the client
approval path immediately before project creation. Do not trust a frontend
count or cached aggregate.

- [ ] **Step 8: Run focused tests, full backend suite, and typecheck**

Run:

```bash
cd backend
npm test -- --run tests/estimate-design-review.test.ts tests/leads.test.ts tests/full-journey.test.ts
npm test
npm run typecheck
```

- [ ] **Step 9: Commit Task 4**

```bash
git add backend/src/domain/estimate-design.ts backend/src/services/estimate-design.service.ts backend/src/routes/estimate-designs.ts backend/src/routes/leads.ts backend/tests/estimate-design-review.test.ts backend/tests/leads.test.ts backend/tests/full-journey.test.ts
git commit -m "feat: review estimate drawings with annotations"
```

---

### Task 5: Estimator Upload, Mapping, and 40×40 Drawing Rows

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/features/leads/estimateDesignApi.ts`
- Create: `frontend/src/features/leads/EstimateDesignUploads.tsx`
- Create: `frontend/src/features/leads/EstimateDrawingRow.tsx`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/leads/EstimateDesignUploads.test.tsx`
- Test: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`

**Interfaces:**
- Consumes: estimator APIs from Tasks 1 and 3.
- Produces:

```ts
export interface EstimateDrawingRowProps {
  drawing: EstimateDesignDrawing;
  roomLabel: string;
  scopeLabel: string;
  onPreview: () => void;
  onCorrect: () => void;
  onReplace: () => void;
  onHistory: () => void;
}
```

- [ ] **Step 1: Write failing upload and placement tests**

Render an estimate with Living Room and Bedroom plus False Ceiling and
Electrical scopes. Upload a plan, return queued → processing → estimator_review,
and assert polling stops at the terminal state. Assert drawings render under
the exact `Room → Scope`, duplicate drawings remain visible, and ambiguous
drawings appear in a `Needs placement` review group.

- [ ] **Step 2: Write failing compact-row interaction tests**

Assert the thumbnail class is 40×40, Preview is always explicit, secondary
actions are in an accessible menu, one row's menu does not affect another, and
status-specific actions match the design. Test keyboard menu operation, loading,
retry, correction, crop validation, verification, remove, submit, and
section-specific replacement file selection.

- [ ] **Step 3: Run focused frontend tests and verify RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
```

- [ ] **Step 4: Add typed API boundary and query keys**

Use authenticated `apiClient` for JSON and `FormData`; never set multipart
`Content-Type` manually. Keep upload progress local to the selected file and
poll only while any upload is queued or processing.

- [ ] **Step 5: Implement estimator orchestration**

Mount `EstimateDesignUploads` after the estimate exists. Group verified
drawings by stable room ID and scope ID, not display label. Keep ambiguous
drawings visible above grouped sections until corrected. Use existing
`ProtectedImage` for authenticated thumbnails and preview source reuse.

- [ ] **Step 6: Implement dense rows and responsive styles**

Set `.estimate-drawing-row__thumbnail` to `width: 40px; height: 40px;
object-fit: cover`. Keep row height compact, avoid hover-only actions, and make
the overflow menu a semantic button/menu. On narrow cards, wrap metadata while
retaining 44px action targets.

- [ ] **Step 7: Run focused tests, frontend typecheck, and build**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
npm run typecheck
VITE_API_URL=/api/v1 npm run build
```

- [ ] **Step 8: Commit Task 5**

```bash
git add frontend/src/api/types.ts frontend/src/features/leads/estimateDesignApi.ts frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/leads/EstimateDrawingRow.tsx frontend/src/features/leads/LeadEstimateWorkspace.tsx frontend/src/styles/index.css frontend/src/features/leads/EstimateDesignUploads.test.tsx frontend/src/features/leads/LeadEstimateWorkspace.test.tsx
git commit -m "feat: manage extracted drawings in estimates"
```

---

### Task 6: SVG Annotation Editor and Protected Preview Modal

**Files:**
- Create: `frontend/src/components/design/annotationGeometry.ts`
- Create: `frontend/src/components/design/annotationGeometry.test.ts`
- Create: `frontend/src/components/design/ImageAnnotationEditor.tsx`
- Create: `frontend/src/components/design/ImageAnnotationEditor.test.tsx`
- Create: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Create: `frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `AnnotationDocumentV1` and protected revision image URL.
- Produces:

```ts
export type AnnotationTool =
  | "select" | "ellipse" | "rectangle" | "arrow" | "freehand" | "text";

export interface ImageAnnotationEditorProps {
  imageSource: string;
  imageWidth: number;
  imageHeight: number;
  value: AnnotationDocumentV1;
  readOnly: boolean;
  onChange: (document: AnnotationDocumentV1) => void;
}
```

- [ ] **Step 1: Write failing pure geometry tests**

Test viewport-to-normalized coordinates, clamping, rectangle/ellipse
construction in any drag direction, arrow endpoints, freehand simplification,
move, eight-handle resize, hit testing, and preservation through zoom/pan.
Use literal coordinates and verify no operation creates values outside `[0,1]`.

- [ ] **Step 2: Run geometry tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/components/design/annotationGeometry.test.ts
```

- [ ] **Step 3: Implement pure immutable geometry helpers**

Keep DOM access out of `annotationGeometry.ts`. Every operation returns a new
element/document, making undo/redo snapshots deterministic and testable.

- [ ] **Step 4: Write failing editor interaction tests**

Using pointer events, create every tool, select/move/resize an element, add text,
undo, redo, and delete. Assert tool buttons have names, selection is visible,
keyboard Delete works, Escape exits the active drawing operation, and
`readOnly=true` hides all editing controls while rendering overlays.

- [ ] **Step 5: Implement the SVG editor without a new canvas dependency**

Render the protected image below one responsive SVG with a shared `viewBox`.
Use pointer capture for draw/move/resize; store freehand points at a bounded
sample rate; use an HTML dialog/form for text entry instead of `foreignObject`.
Keep a maximum 100-state undo stack and announce changes through a polite live
region.

- [ ] **Step 6: Write failing preview-modal lifecycle tests**

Assert modal focus trapping/restoration, authenticated image reuse, client tool
visibility only when `canAnnotate`, read-only overlays for estimator and
approved states, zoom/pan controls, unsaved-close confirmation, Save draft, and
Submit change request callbacks.

- [ ] **Step 7: Implement preview modal and responsive toolbar**

Use the shared `Dialog`. On desktop, place the labeled toolbar beside the
canvas; under 48rem, use a sticky bottom toolbar with horizontal scrolling.
Never mount the editing component when `canAnnotate=false`.

- [ ] **Step 8: Run component tests, accessibility smoke tests, and typecheck**

Run:

```bash
cd frontend
npm test -- --run src/components/design/annotationGeometry.test.ts src/components/design/ImageAnnotationEditor.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx src/test/accessibility.test.tsx
npm run typecheck
```

- [ ] **Step 9: Commit Task 6**

```bash
git add frontend/src/components/design/annotationGeometry.ts frontend/src/components/design/annotationGeometry.test.ts frontend/src/components/design/ImageAnnotationEditor.tsx frontend/src/components/design/ImageAnnotationEditor.test.tsx frontend/src/components/design/EstimateDrawingPreviewDialog.tsx frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx frontend/src/styles/index.css
git commit -m "feat: annotate estimate drawings in preview"
```

---

### Task 7: Client Review Integration and Estimator Replacement Loop

**Files:**
- Create: `frontend/src/features/estimates/ClientEstimateDrawings.tsx`
- Create: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.test.tsx`
- Modify: `frontend/src/features/leads/estimateDesignApi.ts`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: Task 4 review endpoints, Task 5 rows, and Task 6 preview modal.
- Produces: complete estimator → client → estimator replacement interaction.

- [ ] **Step 1: Write failing client grouping and modal tests**

Render two rooms, multiple scopes, and duplicate drawings. Assert 40×40 rows
appear only within the correct expanded estimate; opening Preview does not
collapse it. Awaiting review shows client annotation tools, individually
approved and final-approved states are read-only, and estimator mode never
renders editing tools.

- [ ] **Step 2: Write failing save/submit/approval-gate tests**

Assert Save draft persists annotations without changing review status. Submit
requires summary plus an annotation, updates only that row to Changes requested,
and keeps other drawings independent. Assert Approve estimate is disabled with
an accessible unresolved-count explanation until readiness becomes true.

- [ ] **Step 3: Write failing estimator replacement-loop tests**

Return a requested-change revision with annotations. Assert estimator sees the
overlay and summary, `Upload replacement` targets the exact drawing ID, a failed
upload preserves the old revision, and success displays a new draft revision
in the same room/scope with history intact.

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/leads/EstimateDesignUploads.test.tsx
```

- [ ] **Step 5: Implement client drawing groups and decision mutations**

Group by stable room/scope IDs. Keep per-drawing mutation state so one approval,
draft save, or change request never disables unrelated rows. Invalidate only
the affected estimate drawing/readiness queries and preserve expanded-card
state.

- [ ] **Step 6: Connect final approval readiness**

Render backend-provided counts. Disable the action when unresolved and keep the
backend conflict visible if readiness changes concurrently. Do not infer
approval readiness solely from currently rendered client data.

- [ ] **Step 7: Implement estimator marked-preview and replacement flow**

Reuse the read-only preview modal with the immutable client layer. File input
accepts the supported formats and resets only after successful replacement.
After success, focus the new revision row and announce that it awaits
verification.

- [ ] **Step 8: Run focused tests, full frontend suite, typecheck, and build**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/leads/EstimateDesignUploads.test.tsx
VITE_API_URL=/api/v1 npm test
npm run typecheck
VITE_API_URL=/api/v1 npm run build
```

- [ ] **Step 9: Commit Task 7**

```bash
git add frontend/src/features/estimates/ClientEstimateDrawings.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/leads/EstimateDesignUploads.test.tsx frontend/src/features/leads/estimateDesignApi.ts frontend/src/styles/index.css
git commit -m "feat: review estimate drawings with clients"
```

---

### Task 8: End-to-End Contract, Visual Fixture, and Production Verification

**Files:**
- Modify: `backend/tests/full-journey.test.ts`
- Create: `ocr-worker/tests/fixtures/estimate-review-sheet.png`
- Create: `ocr-worker/tests/test_estimate_review_fixture.py`
- Create: `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`
- Create: `docs/estimate-design-image-review.md`
- Modify: `backend/README.md`
- Modify: `ocr-worker/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: documented, production-verifiable workflow and representative fixture.

- [ ] **Step 1: Add a representative multi-title fixture**

Create a deterministic plan sheet containing at least:

- Living Room False Ceiling;
- Living Room Electrical;
- Bedroom Flooring;
- Bedroom Wall Elevation;
- mixed case, punctuation, extra spacing, `RCP`, and one bounded OCR misspelling.

The expected manifest must list literal crop, room ID, scope ID, and confidence
class for every drawing.

- [ ] **Step 2: Add failing worker fixture and cross-role journey tests**

Worker test: run real deterministic OCR doubles through the extractor and
compare every proposal to the manifest.

Backend journey: upload → claim → complete → estimator correction/submit →
client annotation request → estimator replacement/submit → client approvals →
final estimate approval/project creation.

Frontend journey: render the same state transitions and assert exact room/scope
placement, 40×40 rows, modal tools, read-only transitions, and replacement
history.

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_estimate_review_fixture.py -q
cd ../backend
npm test -- --run tests/full-journey.test.ts
cd ../frontend
VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/estimateDrawingJourney.test.tsx
```

- [ ] **Step 4: Complete missing integration glue only**

Fix only wiring exposed by the end-to-end tests: app construction, route order,
DTO mapping, query invalidation, or state announcements. Do not add features
outside the approved specification.

- [ ] **Step 5: Document local setup and operational limits**

Document:

```bash
cd ocr-worker
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test,model]"
```

Include supported formats, required HEIF native wheel expectations, worker
token/configuration, page/pixel/output limits, safe retry behavior, and the
manual estimator correction fallback.

- [ ] **Step 6: Run all fresh verification**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -q
cd ../backend
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

Expected:

- every worker test passes;
- every backend test passes;
- every frontend test passes;
- both TypeScript projects typecheck;
- both production builds succeed;
- no whitespace errors or generated fixture output remains.

- [ ] **Step 7: Perform manual visual verification**

At desktop and 320px mobile widths, verify:

- multiple 40×40 rows do not collide with titles/status/actions;
- the preview image remains legible with zoom/pan;
- every tool is reachable by keyboard and touch;
- the mobile bottom toolbar does not cover the image;
- annotations remain aligned while resizing and zooming;
- approved/read-only states show no editing controls.

Record screenshots outside the repository or in an ignored QA output directory.

- [ ] **Step 8: Commit Task 8**

```bash
git add backend/tests/full-journey.test.ts ocr-worker/tests/fixtures/estimate-review-sheet.png ocr-worker/tests/test_estimate_review_fixture.py frontend/src/features/estimates/estimateDrawingJourney.test.tsx docs/estimate-design-image-review.md backend/README.md ocr-worker/README.md
git commit -m "test: verify estimate drawing review journey"
```


# OCR Design Section Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert designer PDF/image uploads into OCR-proposed, designer-corrected sections that only the assigned property client can approve or reject.

**Architecture:** The TypeScript backend persists uploads, extraction jobs, source pages, sections, revisions, authorization, and review state. A Python PaddleOCR worker claims leased jobs and returns page/section proposals through a backend-owned result contract. React adds a designer correction workspace and a client-only review workspace while managers and heads receive read-only progress.

**Tech Stack:** TypeScript, Node.js 24, Express 5, MongoDB/Mongoose 9, React 19, TanStack Query, Vitest, Python 3.11+, PaddleOCR, PaddlePaddle, PyMuPDF, Pillow, pytest

## Global Constraints

- Accept multi-page PDF, PNG, JPEG, and WebP while retaining the immutable original.
- Run OCR asynchronously; upload requests must not wait for PaddleOCR.
- Designers must review, rename, recrop, remove, or manually add sections before client submission.
- Only the client assigned to the project may approve or reject.
- Rejection requires a non-empty comment.
- Approved section revisions are immutable; rejected sections can be replaced independently.
- Clients cannot see draft OCR results or unsubmitted corrections.
- Managers and design heads have read-only review visibility.
- OCR failure retains the original file and permits retry or manual section creation.
- All generated crop coordinates use source-image pixels with a top-left origin and must remain in bounds.
- Every upload, extraction result/failure, section mutation, submission, decision, and replacement is audited.

---

### Task 1: Persist extraction and section-review entities

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Create: `backend/src/models/DesignExtractionJob.ts`
- Create: `backend/src/models/DesignSourcePage.ts`
- Create: `backend/src/models/DesignSection.ts`
- Create: `backend/src/models/DesignSectionRevision.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`

**Interfaces:**
- Produces `ExtractionStatus = "queued" | "processing" | "designer_review" | "submitted" | "changes_requested" | "approved" | "processing_failed"`.
- Produces `SectionReviewStatus = "draft" | "submitted" | "approved" | "rejected"`.
- Produces records `DesignExtractionJobRecord`, `DesignSourcePageRecord`, `DesignSectionRecord`, and `DesignSectionRevisionRecord`.
- Adds repository methods `enqueueExtractionJob`, `claimExtractionJob`, `completeExtractionJob`, `failExtractionJob`, `findExtractionJobByVersionId`, `listSourcePages`, `replaceExtractionDraft`, `listDesignSections`, `createManualSection`, `updateDraftSection`, and `createSectionRevision`.

- [ ] **Step 1: Write failing repository contract tests**

Add a shared repository test that enqueues a job, claims it once with a lease,
rejects a second claim before lease expiry, and reclaims it after expiry:

```ts
const queued = await repository.enqueueExtractionJob({
  id: "job-1",
  designVersionId: "version-1",
  status: "queued",
  attemptCount: 0,
  queuedAt: "2026-07-27T10:00:00.000Z",
  startedAt: null,
  completedAt: null,
  leaseExpiresAt: null,
  failureCode: null,
  failureMessage: null
});
expect((await repository.claimExtractionJob(
  "2026-07-27T10:01:00.000Z",
  "2026-07-27T10:06:00.000Z"
))?.id).toBe(queued.id);
expect(await repository.claimExtractionJob(
  "2026-07-27T10:02:00.000Z",
  "2026-07-27T10:07:00.000Z"
)).toBeNull();
expect((await repository.claimExtractionJob(
  "2026-07-27T10:07:00.000Z",
  "2026-07-27T10:12:00.000Z"
))?.attemptCount).toBe(2);
```

Add a replacement test asserting `replaceExtractionDraft` atomically stores
two pages, active OCR sections, and revision `1` drafts without duplicating
records when the same worker result ID is replayed.

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/repository.test.ts tests/mongo-repository.test.ts
```

Expected: TypeScript/test failure because extraction records and methods do not
exist.

- [ ] **Step 3: Add exact domain records**

Add the four record interfaces and these crop coordinates:

```ts
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignSectionRevisionRecord {
  id: string;
  sectionId: string;
  revisionNumber: number;
  sourcePageId: string;
  crop: CropRect;
  croppedFileReference: string;
  label: string;
  reviewStatus: SectionReviewStatus;
  submittedAt: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  rejectionComment: string | null;
  createdAt: string;
}
```

Define Mongo schemas with string IDs, timestamps, enum validation, and unique
indexes on `designVersionId + pageNumber`, `sectionId + revisionNumber`, and
`designVersionId` for one extraction job per version. Implement memory and Mongo
methods with the same observable behavior.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd backend
npm test -- --run tests/repository.test.ts tests/mongo-repository.test.ts
```

Expected: repository suites pass for both implementations.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories backend/src/models backend/src/seed/data.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts
git commit -m "feat: persist OCR design sections"
```

---

### Task 2: Enqueue OCR after a design upload

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/services/design-version.service.ts`
- Modify: `backend/src/routes/design-versions.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/uploads.test.ts`
- Test: `backend/tests/config.test.ts`

**Interfaces:**
- Consumes Task 1 `enqueueExtractionJob`.
- Extends public design versions with `extractionStatus`.
- Produces `GET /api/v1/design-versions/:versionId/extraction`.
- Upload response remains HTTP `201`, stores the original, and reports `extractionStatus: "queued"`.

- [ ] **Step 1: Write failing upload/enqueue tests**

Extend the PDF upload test:

```ts
expect(pdf.status).toBe(201);
expect(pdf.body.data.extractionStatus).toBe("queued");
expect(await repository.findExtractionJobByVersionId(pdf.body.data.id))
  .toMatchObject({ status: "queued", attemptCount: 0 });
```

Add a test proving a failed job enqueue rolls back design-version metadata and
deletes the original stored file. Add extraction-status route tests proving the
owning designer can read the job while unrelated users receive `404`.

- [ ] **Step 2: Run upload tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/uploads.test.ts
```

Expected: queued status and extraction route assertions fail.

- [ ] **Step 3: Enqueue in the existing upload transaction**

After `createNextDesignVersion`, write:

```ts
await transaction.enqueueExtractionJob({
  id: randomUUID(),
  designVersionId: version.id,
  status: "queued",
  attemptCount: 0,
  queuedAt: uploadedAt,
  startedAt: null,
  completedAt: null,
  leaseExpiresAt: null,
  failureCode: null,
  failureMessage: null
});
```

Expose status only after `requireAccessibleProject`. Add
`OCR_LEASE_SECONDS` as a positive integer defaulting to `300`; this value is
used by the worker API in Task 3, not by the upload request.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd backend
npm test -- --run tests/uploads.test.ts tests/config.test.ts
```

Expected: both suites pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/tests/uploads.test.ts backend/tests/config.test.ts backend/.env.example
git commit -m "feat: enqueue design extraction"
```

---

### Task 3: Implement the leased PaddleOCR worker contract

**Files:**
- Create: `ocr-worker/pyproject.toml`
- Create: `ocr-worker/src/lisno_ocr/__init__.py`
- Create: `ocr-worker/src/lisno_ocr/contracts.py`
- Create: `ocr-worker/src/lisno_ocr/extractor.py`
- Create: `ocr-worker/src/lisno_ocr/worker.py`
- Create: `ocr-worker/tests/fixtures/labeled-plan.png`
- Create: `ocr-worker/tests/fixtures/two-page-plan.pdf`
- Create: `ocr-worker/tests/test_extractor.py`
- Create: `ocr-worker/tests/test_worker.py`
- Create: `backend/src/routes/extraction-worker.ts`
- Create: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/extraction-worker.test.ts`

**Interfaces:**
- Produces worker-authenticated `POST /api/v1/internal/extraction-jobs/claim`.
- Produces `POST /api/v1/internal/extraction-jobs/:jobId/complete` and `/fail`.
- Worker result shape is `{ resultId, pages: [{ pageNumber, width, height, imageBase64, sections: [{ label, confidence, crop, imageBase64 }] }] }`.
- Uses `OCR_WORKER_TOKEN` with minimum 32 characters; it is never accepted from browser clients.

- [ ] **Step 1: Write failing backend worker-contract tests**

Test missing/incorrect worker tokens return `401`, one valid claim returns a
leased job plus an authenticated original-file download URL, and completion
rejects crops outside page bounds:

```ts
await request(app)
  .post("/api/v1/internal/extraction-jobs/job-1/complete")
  .set("Authorization", `Bearer ${workerToken}`)
  .send({
    resultId: "result-1",
    pages: [{
      pageNumber: 1,
      width: 1000,
      height: 800,
      imageBase64: PNG.toString("base64"),
      sections: [{
        label: "Elevation",
        confidence: 0.94,
        crop: { x: 900, y: 0, width: 200, height: 200 },
        imageBase64: PNG.toString("base64")
      }]
    }]
  })
  .expect(400);
```

- [ ] **Step 2: Write failing Python extraction tests**

Use the committed fixtures to assert:

```py
pages = extractor.extract("tests/fixtures/two-page-plan.pdf")
assert [page.page_number for page in pages] == [1, 2]
assert all(page.width > 0 and page.height > 0 for page in pages)

sections = extractor.extract("tests/fixtures/labeled-plan.png")[0].sections
assert any(section.label == "Elevation" for section in sections)
assert all(0 <= section.crop.x < 2000 for section in sections)
```

Mock PaddleOCR in unit tests so normal CI does not download models. Add one
opt-in `@pytest.mark.model` smoke test for an installed local model.

- [ ] **Step 3: Run both suites and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/extraction-worker.test.ts
cd ../ocr-worker
python3 -m pytest -m "not model"
```

Expected: missing route/modules cause failures.

- [ ] **Step 4: Implement worker routes and extractor**

Implement token comparison with `timingSafeEqual`, atomic job claim, bounds
validation, base64 size limits, and atomic `replaceExtractionDraft`. In Python,
use PyMuPDF to render PDFs, Pillow for images/crops, and PaddleOCR for text
boxes. Normalize labels with whitespace collapsing while preserving human
display case. Associate each label with the nearest non-text drawing region,
clamp the proposal to page bounds, and return confidence without hiding
low-confidence results.

- [ ] **Step 5: Implement worker polling**

`worker.py` must:

```py
while True:
    job = api.claim()
    if job is None:
        time.sleep(settings.poll_seconds)
        continue
    try:
        api.complete(job.id, extractor.extract(job.source_path))
    except Exception as error:
        api.fail(job.id, classify_failure(error))
```

Use bounded codes `PDF_RENDER_FAILED`, `OCR_FAILED`, `INVALID_SOURCE`, and
`RESULT_REJECTED`. Never send stack traces to the backend.

- [ ] **Step 6: Run both suites and verify GREEN**

Run the commands from Step 3. Expected: backend contract tests and Python tests
pass without downloading OCR models.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/extraction-worker.ts backend/src/services/extraction-worker.service.ts backend/src/app.ts backend/src/config/env.ts backend/.env.example backend/tests/extraction-worker.test.ts ocr-worker
git commit -m "feat: add PaddleOCR extraction worker"
```

---

### Task 4: Add designer correction and submission APIs

**Files:**
- Create: `backend/src/services/design-section.service.ts`
- Create: `backend/src/routes/design-sections.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/storage/storage.ts`
- Modify: `backend/src/storage/local-storage.ts`
- Test: `backend/tests/design-sections.test.ts`
- Test: `backend/tests/local-storage.test.ts`

**Interfaces:**
- Produces designer routes to list source pages/sections, add, rename, recrop,
  remove, replace rejected sections, retry OCR, and submit.
- Produces authenticated artifact routes for source pages and section images.
- `PATCH /api/v1/design-sections/:sectionId` accepts `{ version, label?, crop? }`.
- `POST /api/v1/design-versions/:versionId/submit-sections` submits every active eligible draft.

- [ ] **Step 1: Write failing designer workflow tests**

Cover owner-only draft visibility, valid rename/recrop, crop bounds, manual add,
false-detection removal, retry after `processing_failed`, zero-section
submission rejection, and successful submission:

```ts
const submitted = await request(app)
  .post(`/api/v1/design-versions/${versionId}/submit-sections`)
  .set("Authorization", bearer(users.ananya))
  .expect(200);
expect(submitted.body.data).toMatchObject({
  extractionStatus: "submitted",
  submittedCount: 2
});
```

Assert clients receive `404` before submission and that every mutation appends
the documented audit event.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/design-sections.test.ts tests/local-storage.test.ts
```

- [ ] **Step 3: Implement bounded image recropping**

Extend `FileStorage` with:

```ts
read(reference: string): Promise<Buffer>;
saveGenerated(input: SaveFileInput): Promise<StoredFile>;
```

Use `sharp` in the backend for designer recrops only. Validate integer
coordinates and source bounds before calling:

```ts
sharp(source).extract({ left: x, top: y, width, height }).png().toBuffer();
```

Store each edit as a new draft section revision; never overwrite an existing
crop image.

- [ ] **Step 4: Implement service state transitions**

Require the task-owning designer and assigned-project membership. Use optimistic
version checks. Submit active latest drafts transactionally, set
`submittedAt`, and move extraction status to `submitted`. Expose drafts only to
the owning designer; managers/heads receive submitted/history reads only.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all designer section and storage tests
pass.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src backend/tests/design-sections.test.ts backend/tests/local-storage.test.ts
git commit -m "feat: add designer section correction"
```

---

### Task 5: Add client-only decisions and aggregate status

**Files:**
- Modify: `backend/src/services/design-section.service.ts`
- Modify: `backend/src/routes/design-sections.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Test: `backend/tests/design-section-review.test.ts`

**Interfaces:**
- Produces `GET /api/v1/client/projects/:projectId/design-sections`.
- Produces `POST /api/v1/design-section-revisions/:revisionId/decision` with
  `{ version, decision: "approved" | "rejected", comment? }`.
- Produces `{ approved, rejected, awaitingReview, total }` progress.

- [ ] **Step 1: Write failing authorization and decision tests**

Assert only `project.clientId` may decide; other clients, designers, managers,
and heads receive `403` or entity-isolated `404` according to existing route
conventions. Assert rejection without a trimmed comment returns:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": { "comment": "Explain what the designer should modify." }
  }
}
```

Test approval idempotency, stale version conflict, approved immutability, a
rejected section replacement, and aggregate transitions from `submitted` to
`changes_requested` and finally `approved`.

- [ ] **Step 2: Run review tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/design-section-review.test.ts
```

- [ ] **Step 3: Implement transactional client decisions**

Load revision, section, design version, and project within one transaction.
Require `actor.role === "client"` and `project.clientId === actor.id`. Update
only a `submitted` revision. Store reviewer ID/timestamp/comment, append
`design_section_approved` or `design_section_rejected`, then recompute aggregate
status from latest active revisions.

- [ ] **Step 4: Run review tests and verify GREEN**

Run the command from Step 2. Expected: decision and aggregate tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src backend/tests/design-section-review.test.ts
git commit -m "feat: add client section decisions"
```

---

### Task 6: Build the designer OCR correction workspace

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/designer/designerApi.ts`
- Create: `frontend/src/features/designer/DesignUploadsWorkspace.tsx`
- Create: `frontend/src/components/design/SectionEditor.tsx`
- Create: `frontend/src/components/design/CropEditor.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/designer/DesignUploadsWorkspace.test.tsx`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**
- Consumes Task 4 designer APIs.
- Produces TypeScript types `DesignExtraction`, `DesignSourcePage`,
  `DesignSection`, `DesignSectionRevision`, and `CropRect`.
- Produces a project-level `Design uploads` section with processing status,
  source-page/crop editing, correction actions, and client submission.

- [ ] **Step 1: Write failing designer UI tests**

Mock API states for `processing`, `processing_failed`, and `designer_review`.
Assert low-confidence warnings, rename, delete, add, crop keyboard controls,
preview refresh, retry, and submit. For crop accessibility:

```ts
const crop = screen.getByRole("group", { name: "Elevation crop boundaries" });
await user.keyboard("{Tab}{ArrowRight}{ArrowDown}");
expect(screen.getByLabelText("Crop x coordinate")).toHaveValue(1);
expect(screen.getByLabelText("Crop y coordinate")).toHaveValue(1);
```

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/features/designer/DesignUploadsWorkspace.test.tsx src/test/accessibility.test.tsx
```

- [ ] **Step 3: Implement query/mutation hooks**

Add stable query keys by project/version and invalidate extraction, section, and
project queries after every mutation. Preserve unsaved edits locally on network
failure; on `409`, show a refresh action and retain the draft label/crop.

- [ ] **Step 4: Implement the correction UI**

Use an image with an absolutely positioned crop rectangle plus numeric inputs
for exact accessible control. Show crop preview, label, confidence warning,
revision status, and client comment. Disable submission until processing is
complete and at least one active section exists.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run the command from Step 2. Expected: designer and accessibility tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/features/designer frontend/src/components/design frontend/src/styles/index.css frontend/src/test/accessibility.test.tsx
git commit -m "feat: add designer OCR review workspace"
```

---

### Task 7: Build client review and staff read-only views

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/client/clientApi.ts`
- Create: `frontend/src/features/client/DesignSectionReview.tsx`
- Modify: `frontend/src/features/client/ClientProject.tsx`
- Create: `frontend/src/components/design/SectionReviewCard.tsx`
- Modify: `frontend/src/features/manager/ManagementProjectWorkspace.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Test: `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**
- Consumes Task 5 client listing and decision APIs.
- Produces client controls and `{ approved, rejected, awaitingReview, total }`
  summary.
- Produces manager/head read-only cards without decision controls.

- [ ] **Step 1: Write failing client/staff tests**

Assert submitted-only visibility, large preview, revision/history metadata,
approve, required rejection comment, progress counts, no controls for staff,
and no leakage of draft sections. Verify accessible dialog focus and error
association for the rejection comment.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/features/client/DesignSectionReview.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx src/test/accessibility.test.tsx
```

- [ ] **Step 3: Implement client review**

Render one `SectionReviewCard` per latest submitted revision. Approve directly
after confirmation; reject through a dialog with a required textarea. Disable a
card while its mutation is pending and refresh progress after success.

- [ ] **Step 4: Implement read-only staff view**

Reuse the card display with `mode="read-only"` and omit decision handlers.
Expose latest status, rejection comment, and revision history without draft
crop controls.

- [ ] **Step 5: Run tests and verify GREEN**

Run the command from Step 2. Expected: client, manager, and accessibility suites
pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: add client design section review"
```

---

### Task 8: End-to-end verification and operator documentation

**Files:**
- Create: `ocr-worker/README.md`
- Modify: `backend/.env.example`
- Modify: `README.md`
- Modify: `backend/tests/full-journey.test.ts`
- Create: `ocr-worker/tests/test_contract_fixture.py`

**Interfaces:**
- Documents exact backend, worker, and frontend startup order.
- Produces one cross-role journey fixture from upload through rejected-section
  replacement to complete approval.

- [ ] **Step 1: Write the failing full-journey test**

Extend the journey to:

```ts
upload -> completeExtraction -> designerCorrection -> submit
  -> clientApprove(sectionA) -> clientReject(sectionB, comment)
  -> designerReplace(sectionB) -> resubmit -> clientApprove(sectionB)
```

Assert the final design status is `approved`, section A remains on its original
approved revision, section B is approved on revision `2`, and audit history
contains every transition.

- [ ] **Step 2: Run the journey and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/full-journey.test.ts
```

- [ ] **Step 3: Complete operator documentation**

Document:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd ocr-worker && python3 -m lisno_ocr.worker

# Terminal 3
cd frontend && npm run dev
```

Include Python environment creation, dependency installation, PaddleOCR model
cache behavior, required `OCR_WORKER_TOKEN`, lease/poll settings, health checks,
supported formats, and processing-failure recovery.

- [ ] **Step 4: Run complete verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build
cd ../frontend
npm test
npm run typecheck
npm run build
cd ../ocr-worker
python3 -m pytest -m "not model"
```

Expected: all backend/frontend/Python tests pass and both TypeScript builds
succeed.

- [ ] **Step 5: Run local model smoke test**

With PaddleOCR models installed:

```bash
cd ocr-worker
python3 -m pytest -m model tests/test_extractor.py
```

Expected: the labeled-plan fixture returns at least one in-bounds section with a
non-empty label. Record the PaddleOCR/PaddlePaddle versions in `ocr-worker/README.md`.

- [ ] **Step 6: Commit**

```bash
git add README.md backend/.env.example backend/tests/full-journey.test.ts ocr-worker/README.md ocr-worker/tests/test_contract_fixture.py
git commit -m "docs: verify OCR section review flow"
```

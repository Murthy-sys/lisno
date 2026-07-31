# Full-Page Estimate Upload and Client Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make estimate-design extraction publish exactly one full-page drawing for every accepted source page, allow immediate estimator submission regardless of verification or assignment, and prove client annotation drafts survive a refresh.

**Architecture:** The OCR worker owns the one-page/one-section result shape and never enters legacy region detection for estimate jobs. The backend independently validates that shape before saving any artifacts, reuses the normalized page artifact for the drawing revision, and keeps mapping tuples truthful. Submission becomes permissive only with respect to verification and assignment; authentication, ownership, mapping coherence, current-revision identity, and immutable lifecycle transitions remain enforced.

**Tech Stack:** Python 3.11, PyMuPDF, Pillow, PaddleOCR-compatible adapters, pytest, Node.js, TypeScript, Express, Zod, Mongoose transactions, Vitest, Supertest, React, TanStack Query, Testing Library.

## Global Constraints

- Six pages is the required regression fixture, not an extraction limit.
- Preserve `OCR_MAX_PDF_PAGES` and the existing configured page, pixel, output-byte, and processing-time limits.
- Every accepted `estimate_design` source page produces exactly one full-page section.
- `project_design` keeps its existing multi-region behavior.
- Embedded PDF title text is first choice; fallback OCR is restricted to the title band.
- Missing or unusable title text produces `Unidentified drawing — page <n>` with confidence `0` and null worker room/scope suggestions.
- Every unidentified page persists as the true-null `misc` mapping tuple.
- Identified titles keep the existing backend-owned deterministic mapping resolver.
- Repeated pages with the same uniquely resolvable normalized title receive the
  same estimate-item tuple and render in the same room/scope group.
- Missing, ambiguous, and unmatched titles always persist with the true-null
  `misc` tuple; no page is dropped and no separate `unmapped` state is exposed.
- Estimator and client interfaces label `mappingStatus: "misc"` as
  **Miscellaneous**.
- Estimator submission is not blocked by `verified`, mapping status, room assignment, or catalogue assignment.
- Whenever rendered, the estimator submit button has no `disabled` condition,
  including while submission is in flight.
- Submission still requires authentication, ownership, an allowed estimate lifecycle, active drawings, coherent mapping tuples, and a current immutable revision.
- Real multipart upload percentage and status polling remain unchanged; do not invent extraction percentage.
- No idempotent completion, poison retry, transport reconciliation, bulk-write, S3, logging, readiness, or general resource-bound work is implemented in this plan.

---

## File and Responsibility Map

- Modify `ocr-worker/src/lisno_ocr/extractor.py`: isolate estimate extraction from region detection, open PDFs once, and emit one full-page section per accepted page.
- Modify `ocr-worker/tests/test_extractor.py`: generate six- and seven-page PDFs at test time and cover title/no-title/full-page behavior.
- Modify `backend/src/services/estimate-design.service.ts`: validate ordinary estimate completion shape, reuse page artifacts, and remove verification/assignment submission gates.
- Modify `backend/tests/estimate-design-extraction.test.ts`: cover six-page publication, seventh-page compatibility, atomic malformed-result rejection, Misc persistence, and permissive submission.
- Modify `backend/tests/estimate-design-review.test.ts` only if a submission/client fixture needs the permissive state.
- Modify `frontend/src/features/leads/EstimateDesignUploads.tsx`: keep the submit button free of disabled conditions, group resolved drawings, label unresolved drawings Miscellaneous, and update temporary-policy copy.
- Modify `frontend/src/features/leads/EstimateDesignUploads.test.tsx`: render six unverified mapped/Misc drawings, prove repeated titles share one section, and prove submission remains enabled while in flight.
- Modify `frontend/src/features/estimates/ClientEstimateDrawings.tsx`: label true-null `misc` drawings Miscellaneous.
- Modify `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`: verify the Miscellaneous group, persist an annotation draft in the request mock, and prove it is restored after refresh/remount.
- Create `docs/estimate-design-extraction-pending.md`: ordered deferred production-hardening backlog.

---

### Task 1: Emit one full-page estimate drawing for every accepted page

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/tests/test_extractor.py`

**Interfaces:**
- Consumes: `Extractor.extract(source_path, mode="estimate_design", deadline=...)`, `ExtractedPage`, `ExtractedSection`, `EstimateDrawingProposal`, and the existing configured extraction limits.
- Produces:

```python
def _extract_estimate_pdf(
    self,
    path: Path,
    *,
    deadline: float | None,
) -> list[ExtractedPage]: ...

def _extract_estimate_page(
    self,
    image: Image.Image,
    page_number: int,
    remaining_bytes: int,
    *,
    embedded_title: tuple[str, float] | None,
    deadline: float | None,
) -> tuple[ExtractedPage, int]: ...
```

- The estimate page result always contains one `ExtractedSection` whose crop covers the full page and whose `image_base64` equals the page `image_base64`.

- [ ] **Step 1: Add a generated PDF helper and six-page embedded-title test**

Add to `ocr-worker/tests/test_extractor.py`:

```python
def write_estimate_pdf(
    tmp_path: Path,
    titles: list[str | None],
    *,
    filename: str = "estimate.pdf",
) -> Path:
    source = tmp_path / filename
    document = fitz.open()
    try:
        for title in titles:
            page = document.new_page(width=1191, height=842)
            if title is not None:
                page.insert_text((700, 780), f"TITLE : {title}")
        document.save(source)
    finally:
        document.close()
    return source


class OcrMustNotStart:
    def predict(self, **_kwargs):
        raise AssertionError("embedded title text must bypass OCR")


def test_six_page_estimate_pdf_opens_once_and_emits_one_full_page_drawing(
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(
        tmp_path,
        [f"Drawing {number}" for number in range(1, 7)],
    )

    from lisno_ocr import extractor as module
    actual_open = module.fitz.open
    opens = 0

    def counted_open(*args, **kwargs):
        nonlocal opens
        opens += 1
        return actual_open(*args, **kwargs)

    monkeypatch.setattr(module.fitz, "open", counted_open)
    pages = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert opens == 1
    assert [page.page_number for page in pages] == [1, 2, 3, 4, 5, 6]
    assert all(len(page.sections) == 1 for page in pages)
    assert all(
        section.crop == Crop(0, 0, page.width, page.height)
        and section.image_base64 == page.image_base64
        for page in pages
        for section in page.sections
    )
```

- [ ] **Step 2: Replace the legacy no-title crop expectation with deterministic unidentified output**

Replace `test_pdf_without_a_true_title_field_falls_back_to_existing_region_extraction` with:

```python
def test_six_page_estimate_pdf_without_titles_emits_unidentified_drawings(
    monkeypatch,
    tmp_path,
):
    source = write_estimate_pdf(tmp_path, [None] * 6)

    class EmptyTitleBandOcr:
        def __init__(self):
            self.heights: list[int] = []

        def predict(self, input):
            self.heights.append(input.shape[0])
            return [{
                "rec_boxes": [],
                "rec_texts": [],
                "rec_scores": [],
            }]

    from lisno_ocr import extractor as module
    monkeypatch.setattr(
        module,
        "_drawing_regions",
        lambda *_args, **_kwargs: pytest.fail(
            "estimate extraction must not enter region detection"
        ),
    )
    ocr = EmptyTitleBandOcr()
    pages = Extractor(
        ocr_engine=ocr,
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == [1, 2, 3, 4, 5, 6]
    assert [
        section.label
        for page in pages
        for section in page.sections
    ] == [
        f"Unidentified drawing — page {number}"
        for number in range(1, 7)
    ]
    assert all(
        section.confidence == 0
        and section.crop == Crop(0, 0, page.width, page.height)
        and section.image_base64 == page.image_base64
        and section.proposal is not None
        and section.proposal.room.id is None
        and section.proposal.scope.id is None
        for page in pages
        for section in page.sections
    )
```

- [ ] **Step 3: Add a configured-limit compatibility test**

```python
def test_estimate_pdf_processes_page_seven_when_the_configured_limit_allows_it(
    tmp_path,
):
    source = write_estimate_pdf(
        tmp_path,
        [f"Drawing {number}" for number in range(1, 8)],
    )
    pages = Extractor(
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        max_pdf_pages=7,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == list(range(1, 8))
    assert all(len(page.sections) == 1 for page in pages)
```

Keep the existing generic test that rejects a PDF above `max_pdf_pages`.

- [ ] **Step 4: Run the focused tests and capture RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_extractor.py -q
```

Expected: the six-page test reports two PDF opens; the no-title test enters region detection or returns no section.

- [ ] **Step 5: Implement the single-open estimate PDF path**

In `Extractor.extract`, route estimate PDFs before the legacy image generator:

```python
if suffix == ".pdf" and mode == "estimate_design":
    return self._extract_estimate_pdf(path, deadline=deadline)
```

`_extract_estimate_pdf` must:

1. call `fitz.open(path)` once;
2. apply the existing empty/`self._max_pdf_pages` checks;
3. iterate pages in document order;
4. call `extract_pdf_title_block_candidate(page.get_text("words"), ...)`;
5. render that same page with the existing scale/pixel checks;
6. call `_extract_estimate_page`;
7. close each image and the document in `finally`;
8. decrement the existing output-byte budget after every page.

Factor the current pixmap body into:

```python
def _render_pdf_page(
    self,
    page: fitz.Page,
    *,
    deadline: float | None,
) -> Image.Image:
    scale = _pdf_render_scale(
        page.rect.width,
        page.rect.height,
        self._render_scale,
        self._max_page_pixels,
    )
    pixmap = page.get_pixmap(
        matrix=fitz.Matrix(scale, scale),
        alpha=False,
    )
    try:
        return Image.frombytes(
            "RGB",
            (pixmap.width, pixmap.height),
            pixmap.samples,
        )
    finally:
        del pixmap
```

Keep `_render_pdf_pages` for `project_design`, implemented using `_render_pdf_page`.

- [ ] **Step 6: Implement bounded title extraction and deterministic fallback**

Move the current lower-band OCR logic into:

```python
def _bounded_estimate_title(
    self,
    image: Image.Image,
    *,
    embedded_title: tuple[str, float] | None,
    deadline: float | None,
) -> tuple[str, float] | None:
    if embedded_title is not None:
        return embedded_title
    top = title_block_top(image.height)
    band = image.crop((0, top, image.width, image.height))
    try:
        local_lines = self._recognize(band, deadline=deadline)
    finally:
        band.close()
    recognized = [
        ((left, y1 + top, right, y2 + top), label, confidence)
        for (left, y1, right, y2), label, confidence in local_lines
        if label and confidence >= self._confidence_floor
    ]
    return extract_title_block_candidate(
        recognized,
        image.width,
        image.height,
    )
```

Always construct a proposal. If taxonomy is absent, use null canonical matches:

```python
def _estimate_proposal(
    title: str,
    taxonomy: EstimateTaxonomy | None,
) -> EstimateDrawingProposal:
    if taxonomy is not None:
        return classify_estimate_drawing(title, taxonomy)
    empty = CanonicalMatch(None, 0.0, (), False)
    return EstimateDrawingProposal(title, empty, empty)
```

`_extract_estimate_page` chooses the embedded/bounded candidate or:

```python
title = f"Unidentified drawing — page {page_number}"
confidence = 0.0
```

Encode the page once, reuse the string in both payload fields, and charge its decoded size twice because it is serialized twice. Do not call `_drawing_regions`, `classify_drawing_titles`, or `_section_for_label`.

For non-PDF `estimate_design` sources, feed each decoded image through `_extract_estimate_page` with `embedded_title=None`. Project images retain the current `_extract_page` behavior.

- [ ] **Step 7: Run focused and non-model worker suites**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_extractor.py -q
.venv/bin/python -m pytest -m "not model" -q
```

Expected: PASS; the seventh-page compatibility test proves no six-page cap was introduced.

- [ ] **Step 8: Commit the worker contract**

```bash
git add ocr-worker/src/lisno_ocr/extractor.py ocr-worker/tests/test_extractor.py
git commit -m "feat: emit one full-page estimate drawing per page"
```

---

### Task 2: Validate and atomically publish the full-page estimate shape

**Files:**
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/tests/estimate-design-extraction.test.ts`

**Interfaces:**
- Consumes: ordinary estimate worker results from Task 1.
- Produces: ordinary estimate completion with exactly one source page, drawing, and revision per input page.
- `normalizeEstimateResult` gains an explicit ordinary/replacement validation mode:

```ts
type EstimateResultMode = "ordinary" | "replacement";

async function normalizeEstimateResult(
  result: EstimateWorkerResult,
  maxImageBytes: number,
  mode: EstimateResultMode
): Promise<NormalizedEstimateResult>;
```

- [ ] **Step 1: Replace the ordinary completion fixture with full-page pages**

In `backend/tests/estimate-design-extraction.test.ts`, build valid page PNGs in `beforeAll` and use:

```ts
function estimatePage(
  pageNumber: number,
  image: Buffer,
  label = `Drawing ${pageNumber}`
) {
  return {
    pageNumber,
    width: 100,
    height: 80,
    imageBase64: image.toString("base64"),
    sections: [{
      label,
      confidence: 0.95,
      crop: { x: 0, y: 0, width: 100, height: 80 },
      imageBase64: image.toString("base64"),
      proposal: {
        detectedTitle: label,
        room: {
          id: null,
          confidence: 0,
          evidence: [],
          ambiguous: false
        },
        scope: {
          id: null,
          confidence: 0,
          evidence: [],
          ambiguous: false
        }
      }
    }]
  };
}

function completeBody(pageCount = 2) {
  return {
    kind: "estimate_design" as const,
    resultId: "estimate-result-1",
    pages: Array.from(
      { length: pageCount },
      (_, index) => estimatePage(index + 1, PAGE_IMAGES[index % PAGE_IMAGES.length]!)
    )
  };
}
```

Update existing assertions that expected two sections per page to expect one drawing and revision per page.

- [ ] **Step 2: Add six-page publication and seventh-page compatibility tests**

```ts
it("publishes six full-page results as six pages, drawings, revisions, and six stored images", async () => {
  const { app, pages, drawings, revisions, storage } = setup();
  const leased = await claim(app);

  const response = await complete(
    app,
    leased.body.data.claimToken,
    completeBody(6)
  );

  expect(response.status).toBe(200);
  expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(drawings).toHaveLength(6);
  expect(revisions).toHaveLength(6);
  expect(revisions.every((revision) =>
    revision.crop.x === 0 &&
    revision.crop.y === 0 &&
    revision.crop.width === 100 &&
    revision.crop.height === 80
  )).toBe(true);
  expect([...storage.objects.keys()]).toHaveLength(7);
  expect(revisions.map((revision) => revision.croppedFileReference))
    .toEqual(pages.map((page) => page.normalizedFileReference));
});

it("does not impose a six-page backend cap", async () => {
  const { app, pages, drawings, revisions } = setup();
  const leased = await claim(app);
  const response = await complete(
    app,
    leased.body.data.claimToken,
    completeBody(7)
  );

  expect(response.status).toBe(200);
  expect([pages.length, drawings.length, revisions.length]).toEqual([7, 7, 7]);
});
```

- [ ] **Step 3: Add atomic malformed-shape rejection tests**

```ts
it.each([
  ["non-contiguous page numbers", (body) => {
    body.pages[1]!.pageNumber = 3;
  }],
  ["zero sections", (body) => {
    body.pages[0]!.sections = [];
  }],
  ["multiple sections", (body) => {
    body.pages[0]!.sections.push(
      structuredClone(body.pages[0]!.sections[0]!)
    );
  }],
  ["partial crop", (body) => {
    body.pages[0]!.sections[0]!.crop.width = 99;
  }],
  ["different section bytes", (body) => {
    body.pages[0]!.sections[0]!.imageBase64 =
      PAGE_IMAGES[1]!.toString("base64");
  }]
])("rejects %s before publishing artifacts", async (_name, mutate) => {
  const { app, pages, drawings, revisions, storage } = setup();
  const leased = await claim(app);
  const body = completeBody(2);
  mutate(body);

  const response = await complete(
    app,
    leased.body.data.claimToken,
    body
  );

  expect(response.status).toBe(400);
  expect(pages).toEqual([]);
  expect(drawings).toEqual([]);
  expect(revisions).toEqual([]);
  expect([...storage.objects.keys()]).toEqual(["original-plan.pdf"]);
});
```

Run RED:

```bash
cd backend
npm test -- --run tests/estimate-design-extraction.test.ts
```

Expected: current normalizer accepts each malformed shape.

- [ ] **Step 4: Enforce the ordinary result shape before saving**

Call normalization after loading the upload:

```ts
const resultMode: EstimateResultMode =
  upload.replacementDrawingId ? "replacement" : "ordinary";
const normalized = await normalizeEstimateResult(
  result,
  input.maxUploadBytes,
  resultMode
);
```

For `mode === "ordinary"`:

```ts
for (const [index, page] of result.pages.entries()) {
  if (page.pageNumber !== index + 1) {
    invalidWorkerResult(
      "Estimate page numbers must be contiguous starting at 1."
    );
  }
  if (page.sections.length !== 1) {
    invalidWorkerResult(
      "Each estimate page must contain exactly one full-page drawing."
    );
  }
}
```

After decoding the page and its single section:

```ts
const fullPageCrop = {
  x: 0,
  y: 0,
  width: page.width,
  height: page.height
};
if (
  section.crop.x !== fullPageCrop.x ||
  section.crop.y !== fullPageCrop.y ||
  section.crop.width !== fullPageCrop.width ||
  section.crop.height !== fullPageCrop.height
) {
  invalidWorkerResult(
    "Estimate drawings must use the complete source page."
  );
}
if (!cropImage.equals(image)) {
  invalidWorkerResult(
    "Estimate drawing image bytes must equal the source page image."
  );
}
```

Preserve the current replacement rules. Do not apply ordinary contiguous/full-page checks to a legacy queued replacement.

- [ ] **Step 5: Save one generated artifact per ordinary page**

Because the normalizer proves the page and section bytes are identical, ordinary publication stores the page once:

```ts
const section = page.sections[0]!;
const storedPage = await saveGeneratedImage(input.storage, page.image);
references.push(storedPage.reference);

pageDocuments.push({
  // existing identifiers
  normalizedFileReference: storedPage.reference
});
revisionDocuments.push({
  // existing identifiers and mapping
  croppedFileReference: storedPage.reference,
  crop: { ...section.crop }
});
```

Do not call `saveGeneratedImage` for a second crop artifact in the ordinary path. Keep replacement storage behavior unchanged.

- [ ] **Step 6: Lock unidentified pages to true-null Misc**

Add a six-page completion case whose sections use:

```ts
const title = `Unidentified drawing — page ${index + 1}`;
```

with confidence `0` and null proposals. Assert every drawing and revision contains:

```ts
{
  roomId: null,
  scopeSectionId: null,
  catalogueId: null,
  mappingStatus: "misc"
}
```

The current backend resolver should make this GREEN after the full-page fixture is accepted. If it fails, fix only the resolver input/persistence path; do not introduce a sentinel ID.

- [ ] **Step 7: Prove repeated matches group together and every unresolved title becomes Misc**

Add one ordinary completion test with two pages whose normalized title is
`TV UNIT BEDROOM 1`. The fixture has exactly one included candidate for that
room/item pair. Assert both drawing and revision tuples equal:

```ts
{
  roomId: "room-bedroom-1",
  scopeSectionId: "CA",
  catalogueId: "CA01",
  mappingStatus: "auto_mapped"
}
```

Also keep/add literal cases for:

```ts
[
  "Unidentified drawing — page 1",
  "SHEET WITH NO ESTIMATE ITEM",
  "TV UNIT"
]
```

The first is missing, the second is unmatched, and the third is ambiguous
between Bedroom 1 and Bedroom 2. Each completion must succeed, create exactly
one drawing for its page, and persist both drawing and revision as:

```ts
{
  roomId: null,
  scopeSectionId: null,
  catalogueId: null,
  mappingStatus: "misc"
}
```

Do not add an `unmapped` status, sentinel identifier, dropped-page filter, or
worker-suggestion override.

- [ ] **Step 8: Run focused tests and typecheck**

```bash
cd backend
npm test -- --run tests/estimate-design-extraction.test.ts
npm run typecheck
```

Expected: PASS, including the seventh-page compatibility guard.

- [ ] **Step 9: Commit backend publication**

```bash
git add backend/src/services/estimate-design.service.ts backend/tests/estimate-design-extraction.test.ts
git commit -m "feat: validate full-page estimate extraction results"
```

---

### Task 3: Allow immediate submission and render six extracted rows

**Files:**
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/tests/estimate-design-extraction.test.ts`
- Modify: `backend/tests/estimate-design-review.test.ts` only if a client fixture needs adjustment.
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.test.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`

**Interfaces:**
- Consumes: coherent mapped or true-null Misc active drawings from Task 2.
- Produces: submission that ignores verification/assignment while preserving ownership, lifecycle, mapping, current-revision, and transactional guards.
- Frontend button contract:

```tsx
<button
  type="button"
  className="button button--primary"
  onClick={() => submit.mutate()}
>
  {submit.isPending ? "Submitting…" : "Submit drawings to client"}
</button>
```

There is no `disabled` prop and no `readyToSubmit` gate. The existing footer
may still render only when active drawings exist.

- [ ] **Step 1: Add a failing backend permissive-submission test**

```ts
it("submits unverified mapped and true-null Misc draft drawings", async () => {
  const { app, drawings, revisions, jobs } = setup();
  const leased = await claim(app);
  const body = completeBody(2);
  const unidentified = "Unidentified drawing — page 2";
  Object.assign(body.pages[1]!.sections[0]!, {
    label: unidentified,
    confidence: 0,
    proposal: {
      detectedTitle: unidentified,
      room: {
        id: null,
        confidence: 0,
        evidence: [],
        ambiguous: false
      },
      scope: {
        id: null,
        confidence: 0,
        evidence: [],
        ambiguous: false
      }
    }
  });

  expect((await complete(
    app,
    leased.body.data.claimToken,
    body
  )).status).toBe(200);
  expect(drawings.every((drawing) => drawing.verified === false)).toBe(true);

  const submitted = await owner(
    request(app).post(
      "/api/v1/estimates/estimate-1/design-drawings/submit"
    )
  ).send();

  expect(submitted.status).toBe(200);
  expect(submitted.body.data).toEqual({ submittedCount: 2 });
  expect(jobs[0]).toMatchObject({ status: "submitted" });
  expect(revisions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      reviewStatus: "submitted"
    })
  ]));
});
```

Keep and explicitly assert:

- no active drawings returns `ESTIMATE_DRAWINGS_EMPTY`;
- missing current revision returns `ESTIMATE_DRAWINGS_INCOMPLETE`;
- incoherent mapping tuple is rejected;
- ownership and lifecycle checks still fail closed;
- stale request/transaction revision identity rolls back.

Run RED:

```bash
cd backend
npm test -- --run tests/estimate-design-extraction.test.ts
```

Expected: current service returns `ESTIMATE_DRAWINGS_UNVERIFIED`.

- [ ] **Step 2: Remove only verification and assignment gates**

Inside `submitDrawings`, retain `assertEstimateDesignMapping` but remove:

```ts
if (!drawing.verified) unverifiedDrawings();
```

Do not reject `misc`, null identifiers in a coherent Misc tuple, or an unassigned drawing.

Replace current revision-state gating with:

```ts
if (!revision) {
  throw new ApiError(
    409,
    "ESTIMATE_DRAWINGS_INCOMPLETE",
    "Every active drawing requires a current revision before submission."
  );
}
```

Only current `draft` revisions transition to `submitted`. Existing submitted, approved, or changes-requested revisions are not overwritten. A safe repeat with zero draft revisions returns `{ submittedCount: 0 }`.

Remove `if (draftLatest.length === 0) unverifiedDrawings();`. Build upload/job transitions only from current draft revisions.

- [ ] **Step 3: Add a failing six-row grouping and submission test**

In `frontend/src/features/leads/EstimateDesignUploads.test.tsx`, create six
pages, six active unverified drawings, and six draft revisions:

- pages 1 and 2 use the identical title `TV UNIT - BEDROOM 1` and the identical
  complete `auto_mapped` tuple;
- pages 3 and 4 use other complete mapped tuples;
- pages 5 and 6 use the true-null `misc` tuple.

Mock one upload as `processing` to prove upload readiness does not disable the
button once rows exist. Assert the repeated-title rows appear in the same
`Bedroom 1, Carpentry drawings` region and unresolved rows appear in:

```tsx
expect(await screen.findByRole("region", {
  name: "Miscellaneous drawings"
})).toHaveTextContent("No exact estimate item is assigned.");
expect(await screen.findAllByRole("article", {
  name: /drawing$/i
})).toHaveLength(6);
expect(screen.getByRole("button", {
  name: "Submit drawings to client"
})).toBeEnabled();
```

Click the button, leave the POST unresolved, and assert the same button
(`Submitting…`) remains enabled and has no `disabled` attribute. The test must
not require or assert prevention of a second click.

Run RED:

```bash
cd frontend
npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx
```

Expected: the current `readyToSubmit` requires zero unverified drawings and
terminal upload readiness, and `submit.isPending` disables the button.

- [ ] **Step 4: Make the UI policy explicitly permissive**

In `EstimateDesignUploads.tsx`, delete `readyToSubmit` and remove the
`disabled` prop from the submit button. Do not replace it with an
`aria-disabled` condition or a pending-state click guard.

Update reader-facing copy:

- Header: `Extracted drawings remain private until they are submitted to the client.`
- Miscellaneous section accessible name: `Miscellaneous drawings`
- Miscellaneous heading: `Miscellaneous`
- Miscellaneous row labels: `Miscellaneous` and `Unassigned item`
- Miscellaneous copy: `No exact estimate item is assigned. You can still submit this drawing.`
- Footer with unverified drawings: `<count> drawing(s) can be submitted now. Verification is optional for this milestone.`
- Submission error: `The drawings could not be submitted. Try again.`

In `ClientEstimateDrawings.tsx`, keep the persisted/API
`mappingStatus: "misc"` value but change the group accessible name and heading
to `Miscellaneous drawings` and `Miscellaneous`. Update the existing client
group tests accordingly.

Do not change upload progress, polling, retry, selected-file, assignment,
correction, preview, replacement, history, or client review behavior.

- [ ] **Step 5: Run backend/frontend focused suites and typechecks**

```bash
cd backend
npm test -- --run tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts
npm run typecheck

cd ../frontend
npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx
npm run typecheck
```

Expected: PASS; no verification or mapping assignment blocks submission.

- [ ] **Step 6: Commit permissive submission**

```bash
git add backend/src/services/estimate-design.service.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/leads/EstimateDesignUploads.test.tsx frontend/src/features/estimates/ClientEstimateDrawings.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx
git commit -m "feat: allow permissive estimate drawing submission"
```

---

### Task 4: Prove client annotation drafts survive refresh

**Files:**
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx` only if the regression exposes a production defect.

**Interfaces:**
- Consumes: `saveClientDrawingAnnotationDraft`, query invalidation for `estimateDesignKeys.clientWorkspace(estimateId)`, and `revision.annotationDraft`.
- Produces: regression coverage proving versioned annotation draft save and restoration after workspace refresh/remount.

- [ ] **Step 1: Add stateful annotation-draft mock behavior**

In the existing client annotation interaction test:

```ts
let savedDraft: AnnotationDocumentV1 | null = null;
let draftVersion = 0;
```

For the workspace GET, return:

```ts
annotationDraft: savedDraft
  ? {
      id: "draft-revision-living",
      revisionId: "revision-living",
      version: draftVersion,
      annotations: savedDraft
    }
  : null
```

For `PUT /api/v1/client/estimate-design-revisions/revision-living/annotation-draft`:

```ts
const body = JSON.parse(String(init?.body));
expect(body.version).toBe(draftVersion);
savedDraft = body.annotations;
draftVersion += 1;
return json({
  id: "draft-revision-living",
  revisionId: "revision-living",
  version: draftVersion,
  annotations: savedDraft
});
```

- [ ] **Step 2: Extend the interaction to close, refresh, and reopen**

After adding a text annotation and clicking `Save draft`:

1. wait for the PUT request;
2. close the preview;
3. trigger the workspace query again by collapsing/reopening the estimate or remounting the route;
4. reopen `Preview <title>`;
5. assert the saved text element is visible in the annotation editor;
6. assert the next save would use the returned draft version.

Keep the existing request-changes, approve, preview, and save-error assertions.

- [ ] **Step 3: Run the test and interpret RED/GREEN**

Run:

```bash
cd frontend
npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx
```

If the test is immediately GREEN, record it as strengthened coverage of existing behavior; no production edit is needed. If restored content is absent, fix `ClientEstimateDrawings.tsx` so it continues to prefer:

```ts
revision.annotationDraft?.annotations ?? revision.annotations
```

and ensure successful save invalidates:

```ts
estimateDesignKeys.clientWorkspace(estimateId)
```

- [ ] **Step 4: Run frontend journey coverage and typecheck**

```bash
cd frontend
npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx
npm run typecheck
```

Expected: PASS with annotation restoration and all existing review controls intact.

- [ ] **Step 5: Commit annotation restoration coverage**

```bash
git add frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/features/estimates/ClientEstimateDrawings.tsx
git commit -m "test: verify client annotation draft restoration"
```

Do not stage `ClientEstimateDrawings.tsx` when no production change was required.

---

### Task 5: Record deferred hardening and run the milestone release check

**Files:**
- Create: `docs/estimate-design-extraction-pending.md`
- Test: all files changed by Tasks 1-4.

**Interfaces:**
- Consumes: the three approved deferred plans dated 2026-07-30.
- Produces: an ordered, checkbox-based backlog that can be resumed one item at a time without implying the work is complete.

- [ ] **Step 1: Create the ordered pending-work note**

Create `docs/estimate-design-extraction-pending.md` with:

```markdown
# Estimate Design Extraction — Pending Production Work

## Current milestone

- [x] One full-page drawing for every accepted estimate source page.
- [x] Six-page regression coverage without a six-page product limit.
- [x] Missing, ambiguous, and unmatched pages persist under Miscellaneous.
- [x] Estimator submission is temporarily permissive.
- [x] Client annotation drafts save and restore.

## Ordered backlog

1. [ ] Complete replay-safe/idempotent project and estimate completion.
2. [ ] Add poison-job retry scheduling, attempt limits, terminalization, and safe reset.
3. [ ] Add worker transport-only retries, stable result IDs, heartbeat reconciliation, and real replica-set completion tests.
4. [ ] Finish general bounded variable-page extraction, download/transport limits, and bounded bulk writes.
5. [ ] Add staged artifact publication, reconciliation, and durable shared object storage.
6. [ ] Add structured backend/worker logs, metrics, liveness/readiness probes, and rollout gates.
7. [ ] Reintroduce configurable verification/assignment submission policy after estimator workflow validation.
8. [ ] Run authenticated desktop and 320 px browser QA when a browser session is available.
```

Link backlog items to:

- `docs/superpowers/plans/2026-07-30-idempotent-extraction-completion.md`
- `docs/superpowers/plans/2026-07-30-bounded-variable-page-extraction.md`
- `docs/superpowers/plans/2026-07-30-production-extraction-storage-observability.md`

- [ ] **Step 2: Run the focused milestone verification**

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_extractor.py tests/test_worker.py -q

cd ../backend
npm test -- --run tests/estimate-design-upload.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts tests/full-journey.test.ts
npm run typecheck

cd ../frontend
npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx
npm run typecheck

cd ..
git diff --check
git status --short
```

Expected: every command exits zero; the only intentional uncommitted file before the documentation commit is the pending-work note.

- [ ] **Step 3: Run full regression suites and builds**

```bash
cd ocr-worker
.venv/bin/python -m pytest -q

cd ../backend
npm test -- --run
npm run build

cd ../frontend
npm test -- --run
VITE_API_URL=/api/v1 npm run build
```

Expected: PASS. Model-marked worker tests may skip only when their optional model dependency is unavailable; all non-model tests must pass.

- [ ] **Step 4: Inspect a generated six-page PDF render**

Use the generated test PDF path retained only under the test temporary directory, or generate an equivalent PDF under `tmp/pdfs/`. Render with:

```bash
pdftoppm -png tmp/pdfs/six-page-estimate.pdf tmp/pdfs/six-page-estimate
```

Inspect all six PNG pages and confirm the embedded title is inside the title band and not clipped. Do not commit the generated PDF or PNGs.

- [ ] **Step 5: Commit the pending-work note**

```bash
git add docs/estimate-design-extraction-pending.md
git commit -m "docs: record deferred extraction hardening"
```

---

## Final Acceptance

- A generated six-page estimate PDF produces six pages, six full-page drawings, and six first revisions.
- A seventh page still processes when the configured page limit permits it.
- A titleless accepted page becomes `Unidentified drawing — page <n>` and true-null Misc.
- Region detection is never entered for estimate extraction.
- Malformed ordinary estimate completion publishes nothing.
- Whenever rendered, the estimator submit button has no disabled condition,
  including for unverified Miscellaneous drawings and an in-flight submit.
- Backend submission accepts unverified mapped and Misc draft drawings.
- Repeated uniquely matched titles use the same estimate tuple and estimator
  section; absent, ambiguous, and unmatched titles are never dropped and
  appear under Miscellaneous.
- The client saves an annotation draft and sees it after refresh/remount.
- Upload transfer percentage, extraction status polling, retry, preview, assignment, replacement, and history remain functional.
- All deferred production work is recorded in `docs/estimate-design-extraction-pending.md`.

# Fast Estimate Design Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Provide byte-accurate design upload progress and rapidly extract one complete, correctly mapped drawing per page from title-block PDFs.

**Architecture:** The frontend adds an XHR-backed multipart transport that emits actual upload bytes while retaining existing authentication and API errors. The worker recognizes the lower TITLE field, creates a one full-page proposal with the existing taxonomy mapping, and falls back to current panel extraction for non-standard PDFs. Rendering derives the largest scale allowed by the pixel budget.

**Tech Stack:** React 19, TanStack Query, TypeScript, Vitest, Testing Library, XMLHttpRequest, Python 3.11, Pillow, PyMuPDF, PaddleOCR, pytest.

## Global Constraints

- Use actual transferred bytes for the upload percentage; never simulate progress.
- Keep the transfer bar until the upload HTTP request succeeds or fails.
- Keep OCR progress indeterminate until durable backend progress events exist.
- Keep existing taxonomy mapping, revisions, crop annotations, and client approval APIs.
- A recognized title-block page produces one complete-page drawing with all details, legends, title block, dimensions, and material schedules.
- Non-title-block and non-PDF extraction uses the current fallback behavior.
- Keep maximum page, pixel, output-byte, and processing-time bounds.

---

## File structure

- frontend/src/api/client.ts: authenticated XHR multipart implementation.
- frontend/src/api/client.test.ts: transport behavior.
- frontend/src/features/leads/estimateDesignApi.ts: typed design-upload adapter.
- frontend/src/features/leads/EstimateDesignUploads.tsx: upload state and extraction UI.
- frontend/src/features/leads/EstimateDesignUploads.test.tsx: accessible UI behavior.
- frontend/src/styles/index.css: upload and retry presentation.
- ocr-worker/src/lisno_ocr/extractor.py: title-band fast path and adaptive rendering.
- ocr-worker/tests/test_extractor.py: deterministic worker coverage.

### Task 1: Authenticated multipart byte-progress transport

**Files:**
- Modify: frontend/src/api/client.ts
- Create: frontend/src/api/client.test.ts
- Modify: frontend/src/features/leads/estimateDesignApi.ts

**Interfaces:**
- Produces apiClient.postMultipartWithProgress<T>(path, body, onProgress): Promise<T>.
- Produces uploadEstimateDesign(estimateId, file, onProgress?): Promise<EstimateDesignUpload>.
- Uses resolveApiUrl, tokenStorage, ApiError, buildHeaders, and the existing { data: T } envelope.

- [ ] **Step 1: Write failing client transport tests**

~~~
it("reports real XHR upload percentages and resolves the API envelope", async () => {
  const progress: number[] = [];
  const request = apiClient.postMultipartWithProgress(
    "/estimates/estimate-1/design-uploads", new FormData(), (value) => progress.push(value)
  );
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent);
  xhr.complete(201, JSON.stringify({ data: { id: "upload-1" } }));
  await expect(request).resolves.toEqual({ id: "upload-1" });
  expect(progress).toEqual([25]);
  expect(xhr.headers.Authorization).toBe("Bearer token");
});

it("normalizes an XHR API failure without reporting uncomputable progress", async () => {
  const progress = vi.fn();
  const request = apiClient.postMultipartWithProgress("/uploads", new FormData(), progress);
  xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 } as ProgressEvent);
  xhr.complete(413, JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "Too large" } }));
  await expect(request).rejects.toMatchObject({ code: "FILE_TOO_LARGE", message: "Too large" });
  expect(progress).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: cd frontend && npm test -- client.test.ts

Expected: FAIL because postMultipartWithProgress does not exist.

- [ ] **Step 3: Implement the minimal XHR transport**

~~~
postMultipartWithProgress<T>(path, body, onProgress) {
  const requestToken = tokenStorage.get();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", resolveApiUrl(API_BASE_URL, path));
    for (const [name, value] of buildHeaders(undefined, false, requestToken)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      const payload = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload.data as T);
      else reject(new ApiError(xhr.status, payload.error?.code ?? "REQUEST_FAILED", payload.error?.message ?? "The request could not be completed."));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", "The request could not be completed."));
    xhr.send(body);
  });
}
~~~

Move the existing authenticated-401 token-clear behavior into a shared response-status helper used by fetch and XHR. Do not set Content-Type for FormData. In estimateDesignApi.ts pass the optional callback through to this new method.

- [ ] **Step 4: Run focused frontend tests**

Run: cd frontend && npm test -- client.test.ts

Expected: PASS for headers, percentage, JSON success, API failure, and network failure.

- [ ] **Step 5: Commit**

~~~
git add frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/features/leads/estimateDesignApi.ts
git commit -m "feat: report multipart upload progress"
~~~

### Task 2: Polished design upload and recovery controls

**Files:**
- Modify: frontend/src/features/leads/EstimateDesignUploads.tsx
- Modify: frontend/src/features/leads/EstimateDesignUploads.test.tsx
- Modify: frontend/src/styles/index.css

**Interfaces:**
- Consumes uploadEstimateDesign with its progress callback and ProgressBar.
- Produces accessible controls named Choose design plan file, Upload progress, and Retry extraction.

- [ ] **Step 1: Write failing UI tests**

~~~
it("shows selected file and byte progress until the upload API resolves", async () => {
  await user.upload(screen.getByLabelText("Choose design plan file"),
    new File(["pdf"], "Bedroom 1 TV Unit.pdf", { type: "application/pdf" }));
  expect(screen.getByText("Bedroom 1 TV Unit.pdf")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Upload design plan" }));
  xhr.emitUploadProgress(50, 100);
  expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute("aria-valuenow", "50");
  xhr.complete(201, JSON.stringify({ data: queuedUpload }));
  await waitFor(() => expect(screen.queryByRole("progressbar", { name: "Upload progress" })).not.toBeInTheDocument());
});

it("keeps selected file after upload failure and gives failed extraction a recovery button", async () => {
  xhr.complete(413, JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "Too large" } }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The plan could not be uploaded");
  expect(screen.getByText("Bedroom 1 TV Unit.pdf")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry extraction" })).toBeVisible();
});
~~~

- [ ] **Step 2: Run the workspace test to verify it fails**

Run: cd frontend && npm test -- EstimateDesignUploads.test.tsx

Expected: FAIL because neither the selected-file summary nor Upload progress exists.

- [ ] **Step 3: Implement the state and markup**

~~~
const [uploadProgress, setUploadProgress] = useState<number | undefined>();
const upload = useMutation({
  mutationFn: (nextFile: File) => uploadEstimateDesign(estimateId, nextFile, setUploadProgress),
  onMutate: () => setUploadProgress(0),
  onSettled: () => setUploadProgress(undefined),
  onSuccess: () => { setFile(undefined); void client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) }); }
});
~~~

Replace the visible native input with a label styled as a Choose file button and retain the real input as an sr-only, label-associated input. Show file.name and a formatted byte size. Render ProgressBar with value uploadProgress and label Upload progress. For queued and processing persisted uploads, add an indeterminate ProgressBar labeled Extracting drawings; never attach a numeric OCR percentage. Change the pending retry copy to Retrying extraction….

- [ ] **Step 4: Add responsive CSS**

~~~
.estimate-design-uploads__selected-file { min-width: 0; overflow-wrap: anywhere; color: #515b73; }
.estimate-design-uploads__progress { display: grid; gap: .35rem; width: min(100%, 22rem); font-size: .82rem; color: #4b3f99; }
.estimate-design-uploads__status-list .secondary-button { justify-self: start; margin-top: .25rem; }
@media (max-width: 640px) {
  .estimate-design-uploads__choose-file,
  .estimate-design-uploads__header .button { width: 100%; }
}
~~~

- [ ] **Step 5: Run the workspace test to verify it passes**

Run: cd frontend && npm test -- EstimateDesignUploads.test.tsx

Expected: PASS for selected file, progress, cleanup, extraction stage, failure, and retry behavior.

- [ ] **Step 6: Commit**

~~~
git add frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/leads/EstimateDesignUploads.test.tsx frontend/src/styles/index.css
git commit -m "feat: show estimate design upload progress"
~~~

### Task 3: One whole-page title-block extraction

**Files:**
- Modify: ocr-worker/src/lisno_ocr/extractor.py
- Modify: ocr-worker/tests/test_extractor.py

**Interfaces:**
- Produces Extractor._title_block_section(image, page_number, remaining_bytes) -> tuple[ExtractedPage, int] | None.
- Uses classify_estimate_drawing and EstimateTaxonomy unchanged.
- Produces a full-page Crop(0, 0, image.width, image.height) and exactly one section when a lower TITLE field is recognized.

- [ ] **Step 1: Write failing deterministic worker tests**

~~~
def test_title_block_page_creates_one_full_page_section_with_taxonomy_match():
    page = Extractor(ocr_engine=ocr, estimate_taxonomy=taxonomy).extract(image_path)[0]
    assert [(item.label, item.crop.to_payload()) for item in page.sections] == [
        ("TV UNIT - BEDROOM 1", {"x": 0, "y": 0, "width": 1000, "height": 800})
    ]
    assert page.sections[0].proposal.room.id == "bedroom-1"
    assert page.sections[0].proposal.scope.id == "tv-unit"

def test_missing_title_block_keeps_current_full_page_ocr_fallback(monkeypatch):
    monkeypatch.setattr(Extractor, "_extract_page", fallback_extract_page)
    Extractor(ocr_engine=no_title_ocr).extract(image_path)
    assert fallback_extract_page.called is True
~~~

Use a fake OCR response containing TITLE : TV UNIT - BEDROOM 1 within the bottom 16% of the test image and realistic room/scope taxonomy records.

- [ ] **Step 2: Run the focused worker tests to verify they fail**

Run: cd ocr-worker && .venv/bin/python -m pytest tests/test_extractor.py -k "title_block_page or missing_title_block" -q

Expected: FAIL because title-band extraction does not exist.

- [ ] **Step 3: Implement the fast path**

~~~
_TITLE_BAND_TOP_RATIO = 0.84
_TITLE_FIELD = re.compile(r"\btitle\s*:\s*(.+)", re.IGNORECASE)

def _title_block_label(self, image):
    band = image.crop((0, round(image.height * _TITLE_BAND_TOP_RATIO), image.width, image.height))
    try:
        lines = self._recognize(band)
    finally:
        band.close()
    text = " ".join(label for _box, label, _score in sorted(lines, key=lambda line: (line[0][1], line[0][0])))
    match = _TITLE_FIELD.search(text)
    return None if not match else _clean_title_value(match.group(1), lines)
~~~

Clean title values at the earliest metadata boundary: DESIGNED BY, DATE, PROJECT CODE, CHECKED BY, PROJECT, CLIENT, or HANDOVER DATE. Run this only for PDF-rendered pages before the existing _extract_page. On a valid title, encode the image once for the source page and use the complete image rectangle for the one extracted section. Use classify_estimate_drawing for a supplied taxonomy; otherwise leave proposal absent. A missing or blank TITLE result must call existing _extract_page unchanged.

- [ ] **Step 4: Run the fast-path and fallback tests to verify they pass**

Run: cd ocr-worker && .venv/bin/python -m pytest tests/test_extractor.py -k "title_block_page or missing_title_block or estimate_taxonomy" -q

Expected: PASS with one full-page result, unchanged taxonomy data, and fallback behavior.

- [ ] **Step 5: Commit**

~~~
git add ocr-worker/src/lisno_ocr/extractor.py ocr-worker/tests/test_extractor.py
git commit -m "feat: fast-path title block design extraction"
~~~

### Task 4: Adaptive page rendering within safe bounds

**Files:**
- Modify: ocr-worker/src/lisno_ocr/extractor.py
- Modify: ocr-worker/tests/test_extractor.py

**Interfaces:**
- Produces Extractor._safe_render_scale(page) -> float.
- Uses min(render_scale, sqrt(max_page_pixels / page_area)).
- Retains post-render pixel checking, page count, output byte budget, and deadline controls.

- [ ] **Step 1: Write failing oversized-render test**

~~~
def test_pdf_renderer_downscales_an_oversized_page_before_pixmap_allocation(monkeypatch, tmp_path):
    calls = []
    class Rect: width = 10_000; height = 10_000
    class Page:
        rect = Rect()
        def get_pixmap(self, *, matrix, alpha):
            calls.append((matrix.a, alpha))
            return Pixmap(width=1_000, height=1_000, samples=b"\xff" * 3_000_000)
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document([Page()]))
    list(Extractor(ocr_engine=FakePaddleOCR3([]), max_page_pixels=1_000_000)._render_pdf_pages(tmp_path / "large.pdf"))
    assert calls == [(0.01, False)]
~~~

- [ ] **Step 2: Run the render test to verify it fails**

Run: cd ocr-worker && .venv/bin/python -m pytest tests/test_extractor.py -k "downscales_an_oversized_page" -q

Expected: FAIL because current rendering rejects before get_pixmap.

- [ ] **Step 3: Implement adaptive scale**

~~~
page_area = page.rect.width * page.rect.height
if page_area <= 0:
    raise PdfRenderError("A PDF page has invalid dimensions.")
scale = min(self._render_scale, math.sqrt(self._max_page_pixels / page_area))
pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
if pixmap.width * pixmap.height > self._max_page_pixels:
    raise PdfRenderError("A rendered PDF page is too large.")
~~~

- [ ] **Step 4: Verify focused and full regression suites**

Run:

~~~
cd ocr-worker && .venv/bin/python -m pytest -m "not model"
cd ../frontend && npm test -- client.test.ts EstimateDesignUploads.test.tsx
~~~

Expected: PASS. Confirm the model smoke separately with .venv/bin/python -m pytest -m model tests/test_extractor.py -q when its model cache is available.

- [ ] **Step 5: Commit**

~~~
git add ocr-worker/src/lisno_ocr/extractor.py ocr-worker/tests/test_extractor.py
git commit -m "fix: adapt large estimate PDF rendering"
~~~

## Plan self-review

- Tasks 1-2 cover byte progress, polished choose-file and retry controls, and indeterminate extraction states.
- Task 3 covers single title-block detection, one full-page output, taxonomy mapping, and fallback behavior.
- Task 4 covers large-page runtime safety without disabling limits.
- The plan introduces every function and callback before a later task consumes it.

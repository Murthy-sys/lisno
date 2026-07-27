# Drawing Title Section Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept valid design PDFs reliably and create OCR proposals only for supported plan and elevation drawing titles.

**Architecture:** Upload usability validation accepts supported MIME metadata or a supported extension when browser MIME is empty/generic, while backend magic-byte detection remains authoritative. The OCR worker adds a deterministic title classifier that normalizes OCR lines, evaluates exclusions first, recognizes only configured plan/elevation families, composes bounded adjacent title lines, and passes only accepted titles to crop association.

**Tech Stack:** React 19, TypeScript, Express, Multer, Vitest, Python 3.11+, pytest, PaddleOCR 3, Pillow.

## Global Constraints

- Supported uploads are PDF, PNG, JPEG, and WebP.
- Empty or `application/octet-stream` browser MIME metadata must not reject valid supported content.
- Explicit supported MIME/content mismatches and malformed files remain rejected.
- Accepted drawings are floor/room/ceiling/site/roof/electrical/plumbing/furniture-layout plans and directional elevations.
- Legends, notes, key plans, dimensions, symbols, standalone room labels, material callouts, sections, details, diagrams, and schedules produce no proposals.
- OCR proposal ordering remains deterministic by page and reading order.
- Existing crop, confidence, resource-budget, lease, authorization, and review behavior must remain unchanged.

---

### Task 1: Accept valid PDFs with missing or generic browser MIME metadata

**Files:**
- Modify: `frontend/src/components/tasks/DesignUploadDialog.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.test.tsx`
- Modify: `backend/src/middleware/upload.ts`
- Modify: `backend/tests/uploads.test.ts`

**Interfaces:**
- Consumes: browser `File` name/type and Multer `file.mimetype`.
- Produces: `isSupportedUploadSelection(file: File): boolean` and backend content-authoritative `ValidatedUpload`.

- [ ] **Step 1: Write failing frontend selection tests**

Add cases to `ProjectWorkspace.test.tsx` using the existing upload-dialog flow:

```ts
const emptyMimePdf = new File(["%PDF-1.7\n%%EOF"], "Software data R1.pdf", {
  type: ""
});
const genericPdf = new File(["%PDF-1.7\n%%EOF"], "plan.pdf", {
  type: "application/octet-stream"
});
```

Assert both files reach the multipart request. Assert `notes.txt` with empty
MIME and `plan.exe` with generic MIME show the supported-type error.

- [ ] **Step 2: Run the frontend test and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/features/designer/ProjectWorkspace.test.tsx
```

Expected: the empty/generic PDF cases fail because the current code requires an
exact supported MIME.

- [ ] **Step 3: Implement frontend usability validation**

Add a pure helper:

```ts
const supportedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const genericMimeTypes = new Set(["", "application/octet-stream"]);

export function isSupportedUploadSelection(file: File): boolean {
  if (allowedMimeTypes.has(file.type.toLowerCase())) return true;
  if (!genericMimeTypes.has(file.type.toLowerCase())) return false;
  const dot = file.name.lastIndexOf(".");
  return dot >= 0 && supportedExtensions.has(file.name.slice(dot).toLowerCase());
}
```

Use this helper in `submit`. Do not treat extension checks as security
validation.

- [ ] **Step 4: Write failing backend multipart tests**

In `uploads.test.ts`, upload valid PDF magic bytes with content types `""` as
represented by Multer's generic fallback and `application/octet-stream`.
Assert `201`, canonical `mimeType: "application/pdf"`, and `.pdf` storage
extension. Add malformed `.pdf` content with generic MIME and assert `415`.
Add PNG bytes claimed explicitly as `application/pdf` and assert `415`.

- [ ] **Step 5: Run backend upload tests and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/uploads.test.ts
```

Expected: generic MIME is rejected by `fileFilter`.

- [ ] **Step 6: Make magic bytes authoritative**

Change `allowedClaimedMimeTypes` to include `application/octet-stream`. After
`detectFileType`, apply this rule:

```ts
const claimed = request.file.mimetype.toLowerCase();
const claimIsGeneric = claimed === "application/octet-stream" || claimed === "";
if (!detected || (!claimIsGeneric && detected.mimeType !== claimed)) {
  throw unsupportedType;
}
```

Store only `detected.mimeType` and `detected.extension`. Keep the upload size,
single-file, and malformed-content protections unchanged.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
cd frontend
npm test -- --run src/features/designer/ProjectWorkspace.test.tsx
cd ../backend
npm test -- --run tests/uploads.test.ts
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/tasks/DesignUploadDialog.tsx frontend/src/features/designer/ProjectWorkspace.test.tsx backend/src/middleware/upload.ts backend/tests/uploads.test.ts
git commit -m "fix: accept content-valid PDF uploads"
```

---

### Task 2: Classify supported plan and elevation titles

**Files:**
- Create: `ocr-worker/src/lisno_ocr/title_classifier.py`
- Create: `ocr-worker/tests/test_title_classifier.py`
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/src/lisno_ocr/settings.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/README.md`

**Interfaces:**
- Produces:

```py
@dataclass(frozen=True)
class OcrLine:
    box: tuple[int, int, int, int]
    text: str
    confidence: float

@dataclass(frozen=True)
class DrawingTitle:
    box: tuple[int, int, int, int]
    label: str
    confidence: float

def classify_drawing_titles(
    lines: Sequence[OcrLine],
    accepted_plan_types: Sequence[str],
) -> tuple[DrawingTitle, ...]: ...
```

- Consumes: normalized PaddleOCR lines in page reading order.

- [ ] **Step 1: Write failing positive classifier tests**

Create `test_title_classifier.py` with table-driven cases asserting acceptance
and preserved display labels for:

```py
[
    "Floor Plan – 3BHK Residence",
    "Kitchen Plan",
    "Ceiling Plan – Living Room",
    "Site Plan",
    "Roof Plan",
    "Electrical Plan",
    "Plumbing Plan",
    "Furniture Layout Plan",
    "Living Room – Front Elevation",
    "Rear Elevation",
    "Side Elevation (Left)",
    "Left Elevation",
    "Right Elevation",
]
```

Assert output order matches OCR reading order and confidence is the minimum of
the joined title lines.

- [ ] **Step 2: Write failing exclusion tests**

Use realistic OCR lines for legends, general notes, numbered notes, key plan,
dimensions (`"4500"`, `"3'-6\""`, `"SCALE 1:100"`), symbols, standalone room
labels, material callouts, cross sections, details, diagrams, and schedules.
Assert:

```py
assert classify_drawing_titles(lines, DEFAULT_PLAN_TYPES) == ()
```

Include deceptive cases `Key Plan`, `Section Plan Detail`, `Door Schedule`,
`Electrical Legend`, and `Living Room`.

- [ ] **Step 3: Write failing bounded multi-line tests**

Assert vertically adjacent, horizontally aligned lines:

```text
Living Room
Front Elevation
```

compose to `Living Room – Front Elevation`. Assert distant or column-misaligned
`Living Room` and `Front Elevation` do not join, and nearby note/material text
is not attached to a valid title.

- [ ] **Step 4: Run classifier tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_title_classifier.py -q
```

Expected: import/module failure because the classifier does not exist.

- [ ] **Step 5: Implement exclusion-first classification**

In `title_classifier.py`:

- normalize Unicode dashes, whitespace, and comparison text without changing
  the display label;
- reject explicit exclusion phrases before positive matching;
- reject dimension/scale/symbol-only patterns;
- recognize exact configured plan families plus
  `front|rear|back|side|left|right` elevation forms;
- require room-specific plans to use `<qualifier> Plan`, with the qualifier not
  matching exclusion vocabulary;
- join at most one adjacent qualifier line when vertical gap, horizontal
  overlap, and bounded character length rules pass;
- deduplicate normalized labels with overlapping title boxes;
- sort by `(top, left)`.

Do not use a generic substring check for `plan` or `elevation`.

- [ ] **Step 6: Run classifier tests and verify GREEN**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_title_classifier.py -q
```

Expected: all classifier tests pass.

- [ ] **Step 7: Integrate classifier into extraction with failing regression**

Update `test_extractor.py` so the fake PaddleOCR result contains accepted titles
mixed with legends, notes, dimensions, symbols, room labels, materials,
sections, diagrams, and schedules. Assert only the supported plan/elevation
labels produce crops, in reading order, and every crop remains in bounds.

Run:

```bash
.venv/bin/python -m pytest tests/test_extractor.py -q
```

Expected: RED because `_extract_page` still crops every confidence-eligible OCR
line.

- [ ] **Step 8: Route OCR lines through the classifier**

Convert recognized tuples to `OcrLine`, call `classify_drawing_titles`, and pass
only returned `DrawingTitle` instances to `_section_for_label`. Apply the
existing confidence floor before classification. Preserve the 500-candidate,
pixel, page, output-byte, and crop-bound protections.

Expose a comma-separated `OCR_ACCEPTED_PLAN_TYPES` setting with defaults:

```text
floor,room,ceiling,site,roof,electrical,plumbing,furniture layout
```

Validate non-empty normalized unique values and document it in
`ocr-worker/README.md`.

- [ ] **Step 9: Run Python verification**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m "not model"
```

Expected: all non-model tests pass without downloading Paddle models.

- [ ] **Step 10: Commit**

```bash
git add ocr-worker/src/lisno_ocr/title_classifier.py ocr-worker/src/lisno_ocr/extractor.py ocr-worker/src/lisno_ocr/settings.py ocr-worker/tests/test_title_classifier.py ocr-worker/tests/test_extractor.py ocr-worker/README.md
git commit -m "fix: extract only plan and elevation titles"
```

---

### Task 3: Verify exact blueprint output and complete regression

**Files:**
- Modify: `ocr-worker/tests/test_contract_fixture.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `README.md`

**Interfaces:**
- Consumes: upload validation and `classify_drawing_titles`.
- Produces: an end-to-end deterministic fixture for the approved extraction requirements.

- [ ] **Step 1: Add the exact deterministic blueprint regression**

Create two ordered fake OCR page results containing the approved titles plus
excluded noise. Assert exactly:

```py
assert [[section.label for section in page.sections] for page in pages] == [
    ["Floor Plan – 3BHK Residence"],
    [
        "Living Room – Front Elevation",
        "Side Elevation (Left)",
        "Ceiling Plan – Living Room",
    ],
]
```

Also assert a noise-only page returns zero sections.

- [ ] **Step 2: Verify the regression fails before final fixture wiring**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_contract_fixture.py tests/test_extractor.py -q
```

Expected: the new multi-page fixture assertion fails until its page-specific OCR
fixture is wired through the classifier.

- [ ] **Step 3: Complete fixture wiring and documentation**

Use a page-aware fake OCR engine that returns the deterministic result for each
page call. Document the accepted plan/elevation taxonomy and explicit
exclusions in the root `README.md`, including that application-internal
“section” records must not be confused with architectural Section drawings.

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
.venv/bin/python -m pytest -m "not model"
```

Expected: backend, frontend, and Python suites pass; both TypeScript builds pass.

- [ ] **Step 5: Run installed-model smoke when available**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m model tests/test_extractor.py
```

Expected: the real fixture returns only supported plan/elevation titles. If
models are unavailable, record the skip without weakening deterministic tests.

- [ ] **Step 6: Commit**

```bash
git add ocr-worker/tests/test_contract_fixture.py ocr-worker/tests/test_extractor.py README.md
git commit -m "test: verify drawing title extraction"
```


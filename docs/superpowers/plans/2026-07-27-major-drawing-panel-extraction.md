# Major Drawing Panel Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the PaddleOCR worker from creating one section per OCR string to creating one compact section per major architectural drawing panel while excluding annotations, dimensions, legends, notes, symbols, key plans, and material callouts.

**Architecture:** Introduce focused OCR layout types, a deterministic heading classifier, and a panel-region associator between PaddleOCR parsing and the existing worker result contract. The extractor continues returning the same `ExtractedPage` and `ExtractedSection` objects, so backend persistence and designer/client review APIs do not change.

**Tech Stack:** Python 3.11+, PaddleOCR 3, Pillow, NumPy, PyMuPDF, pytest.

## Global Constraints

- OCR text is evidence for panel detection; it must never directly create a section.
- Architectural terms are configurable evidence, not a closed whitelist.
- Every accepted heading must have a valid associated major drawing region.
- Crops contain the heading and drawing while excluding separable dimensions, callouts, legends, notes, symbols, title blocks, and key plans.
- Page and crop coordinates are integer, positive, and bounded by the source page.
- Existing confidence, page-count, pixel, candidate, output, lease, and transport limits remain enforced.
- Existing backend contracts and designer/client approval behavior remain unchanged.
- Normal CI uses mocked OCR and must not download PaddleOCR models.

---

### Task 1: Classify major architectural drawing headings

**Files:**
- Create: `ocr-worker/src/lisno_ocr/layout.py`
- Create: `ocr-worker/tests/test_layout.py`
- Modify: `ocr-worker/src/lisno_ocr/settings.py`
- Modify: `ocr-worker/tests/test_worker.py`

**Interfaces:**
- Produces `OcrLine(box: Box, text: str, confidence: float)`.
- Produces `HeadingCandidate(line: OcrLine, label: str, semantic_score: float, kind: Literal["page_title", "panel"])`.
- Produces `classify_heading(line: OcrLine, page_width: int, page_height: int, settings: LayoutSettings) -> HeadingCandidate | None`.
- Produces `LayoutSettings(drawing_terms, reserved_terms, min_heading_score, min_region_area_ratio, duplicate_iou, reserved_bottom_ratio)`.
- Consumes worker environment variables `OCR_DRAWING_TERMS`, `OCR_RESERVED_TERMS`, `OCR_MIN_HEADING_SCORE`, `OCR_MIN_DRAWING_REGION_AREA_RATIO`, `OCR_PANEL_DUPLICATE_IOU`, and `OCR_RESERVED_BOTTOM_RATIO`.

- [ ] **Step 1: Write failing heading-classification tests**

```python
def test_accepts_numbered_and_unknown_structured_panel_headings():
    settings = LayoutSettings.defaults()
    assert classify_heading(
        OcrLine((100, 120, 700, 170), "A. LIVING ROOM – FRONT ELEVATION", 0.94),
        1400, 1000, settings
    ).label == "Living Room – Front Elevation"
    assert classify_heading(
        OcrLine((90, 220, 500, 265), "DETAIL 04 – CUSTOM MILLWORK", 0.96),
        1400, 1000, settings
    ) is not None


@pytest.mark.parametrize("text", [
    "FALSE CEILING WITH LED STRIP",
    "4200 X 2700",
    "SYMBOL LEGEND (CEILING PLAN)",
    "ALL DIMENSIONS ARE IN MM.",
    "KEY PLAN",
    "BEDROOM 2",
])
def test_rejects_annotations_dimensions_reserved_regions_and_room_labels(text):
    assert classify_heading(
        OcrLine((100, 900, 500, 940), text, 0.99),
        1400, 1000, LayoutSettings.defaults()
    ) is None
```

- [ ] **Step 2: Run the classifier tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_layout.py -v
```

Expected: collection fails because `lisno_ocr.layout` does not exist.

- [ ] **Step 3: Implement layout types and heading classification**

Implement immutable dataclasses and normalized matching:

```python
@dataclass(frozen=True)
class OcrLine:
    box: Box
    text: str
    confidence: float


@dataclass(frozen=True)
class HeadingCandidate:
    line: OcrLine
    label: str
    semantic_score: float
    kind: Literal["page_title", "panel"]


def classify_heading(
    line: OcrLine,
    page_width: int,
    page_height: int,
    settings: LayoutSettings,
) -> HeadingCandidate | None:
    text = normalize_display_text(line.text)
    if not text or is_reserved_or_annotation(text, line.box, page_width, page_height, settings):
        return None
    score, kind = heading_evidence(text, line.box, page_width, page_height, settings)
    if score < settings.min_heading_score:
        return None
    return HeadingCandidate(line, strip_panel_marker(text), score, kind)
```

Use term-boundary matching, panel-marker patterns, title case/uppercase evidence,
relative width, and page position. Explicitly reject numeric dimensions, units,
sentence-like notes, reserved terms, and short room/fixture labels without
panel-heading evidence.

- [ ] **Step 4: Add and validate configuration parsing**

Parse comma-separated term lists and bounded numeric values in worker settings.
Empty term configuration extends neither list and falls back to defaults.
Reject ratios outside `(0, 1)` and scores outside `[0, 1]`.

- [ ] **Step 5: Run classifier and worker settings tests**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_layout.py tests/test_worker.py -v
```

Expected: all classifier and existing worker tests pass.

- [ ] **Step 6: Commit**

```bash
git add ocr-worker/src/lisno_ocr/layout.py ocr-worker/src/lisno_ocr/settings.py ocr-worker/tests/test_layout.py ocr-worker/tests/test_worker.py
git commit -m "feat: classify architectural panel headings"
```

---

### Task 2: Associate headings with compact drawing regions

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/layout.py`
- Test: `ocr-worker/tests/test_layout.py`
- Create: `ocr-worker/tests/fixtures/major-panels.png`

**Interfaces:**
- Consumes `OcrLine`, `HeadingCandidate`, and `LayoutSettings` from Task 1.
- Produces `PanelProposal(label: str, confidence: float, crop: Box, heading_box: Box)`.
- Produces `propose_panels(image: Image.Image, lines: Sequence[OcrLine], settings: LayoutSettings) -> tuple[PanelProposal, ...]`.

- [ ] **Step 1: Write failing panel-association tests**

Create a deterministic synthetic sheet containing:

- one dominant floor-plan page;
- three independently headed drawing rectangles;
- a top-right key-plan rectangle;
- a bottom legend/notes band;
- callouts, dimensions, and room labels.

Test the layout function directly:

```python
def test_multi_panel_sheet_returns_only_major_drawing_panels():
    proposals = propose_panels(
        fixture_image("major-panels.png"),
        blueprint_two_ocr_lines(),
        LayoutSettings.defaults(),
    )
    assert [proposal.label for proposal in proposals] == [
        "Living Room – Front Elevation",
        "Side Elevation (Left)",
        "Ceiling Plan – Living Room",
    ]
    assert all(not intersects(proposal.crop, KEY_PLAN_BOX) for proposal in proposals)
    assert all(not intersects(proposal.crop, LEGEND_NOTES_BOX) for proposal in proposals)


def test_dominant_single_plan_uses_descriptive_page_subtitle():
    proposals = propose_panels(
        fixture_image("major-panels.png"),
        blueprint_one_ocr_lines(),
        LayoutSettings.defaults(),
    )
    assert [proposal.label for proposal in proposals] == [
        "Floor Plan – 3BHK Residence"
    ]
```

- [ ] **Step 2: Run panel tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_layout.py -k "panel or dominant" -v
```

Expected: fails because `PanelProposal` and `propose_panels` are missing.

- [ ] **Step 3: Implement reserved zones and drawing-region discovery**

Build a binary ink mask, erase OCR text boxes and thin annotation leaders,
identify connected/contour regions, merge nearby components into panel-sized
regions, and discard regions that:

- fall inside detected legend, notes, title-block, or key-plan zones;
- are below `min_region_area_ratio`;
- are dominated by text rather than drawing ink;
- contain only thin dimension/leader geometry.

Keep this code in `layout.py`; do not change backend contracts.

- [ ] **Step 4: Implement heading-to-region association**

For each heading, score regions using vertical ordering, horizontal overlap,
distance, region area, and collision with neighboring headings. The resulting
crop is the union of heading and drawing region, clamped to page bounds with
small padding. Stop at the next heading or panel boundary so adjacent panels do
not overlap.

For a single dominant drawing, accept one descriptive page subtitle and ignore
generic sheet identifiers such as `BLUEPRINT 01`.

- [ ] **Step 5: Implement duplicate and overlap suppression**

Sort by page position, collapse normalized duplicate labels whose heading or
crop IoU exceeds `duplicate_iou`, and resolve overlapping proposals in favor of
the higher combined OCR/layout confidence.

- [ ] **Step 6: Run layout tests**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_layout.py -v
```

Expected: every heading, exclusion, dominant-plan, region, bounds, duplicate,
and overlap test passes.

- [ ] **Step 7: Commit**

```bash
git add ocr-worker/src/lisno_ocr/layout.py ocr-worker/tests/test_layout.py ocr-worker/tests/fixtures/major-panels.png
git commit -m "feat: associate architectural drawing panels"
```

---

### Task 3: Integrate panel proposals into the bounded extractor

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Modify: `ocr-worker/src/lisno_ocr/settings.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/tests/test_worker.py`

**Interfaces:**
- Consumes `propose_panels(image, lines, layout_settings)` from Task 2.
- Preserves `Extractor.extract(source_path) -> list[ExtractedPage]`.
- Preserves backend `ExtractedSection(label, confidence, crop, image_base64)`.
- `Extractor.__init__` accepts `layout_settings: LayoutSettings | None = None`.

- [ ] **Step 1: Replace per-OCR-label expectations with failing panel expectations**

Update extractor tests so annotation strings never become sections:

```python
def test_extractor_emits_panels_not_every_ocr_line():
    ocr = FakePaddleOCR3([{
        "rec_boxes": BLUEPRINT_TWO_BOXES,
        "rec_texts": [
            "BLUEPRINT 02",
            "A. LIVING ROOM – FRONT ELEVATION",
            "FALSE CEILING WITH LED STRIP",
            "B. SIDE ELEVATION (LEFT)",
            "600",
            "C. CEILING PLAN – LIVING ROOM",
            "SYMBOL LEGEND (CEILING PLAN)",
        ],
        "rec_scores": [0.99] * 7,
    }])
    sections = Extractor(ocr_engine=ocr).extract(
        FIXTURES / "major-panels.png"
    )[0].sections
    assert [section.label for section in sections] == [
        "Living Room – Front Elevation",
        "Side Elevation (Left)",
        "Ceiling Plan – Living Room",
    ]
```

Retain resource-budget, PaddleOCR 3 adapter, legacy fallback, PDF streaming,
confidence-floor, and model-smoke tests.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_extractor.py -m "not model" -v
```

Expected: current extractor emits annotation-derived sections.

- [ ] **Step 3: Return `OcrLine` objects from OCR adapters**

Change `_recognize` and both Paddle parsers to return `list[OcrLine]` while
preserving structured PaddleOCR 3 and tested legacy parsing.

- [ ] **Step 4: Replace `_section_for_label` with panel proposal conversion**

In `_extract_page`:

```python
lines = self._recognize(image)
eligible = [line for line in lines if line.confidence >= self._confidence_floor]
proposals = propose_panels(image, eligible, self._layout_settings)
for proposal in proposals[:self._max_candidates]:
    crop_image = image.crop(proposal.crop)
    # Encode, update the existing running byte budget, and create ExtractedSection.
```

Do not encode rejected OCR lines. Preserve the preemptive candidate and output
budgets added to the worker.

- [ ] **Step 5: Wire settings into worker construction**

Construct `LayoutSettings` once from validated environment settings and pass it
to `Extractor`. Do not initialize PaddleOCR more than once per worker process.

- [ ] **Step 6: Run all non-model worker tests**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m "not model"
```

Expected: all Python tests pass without downloading models.

- [ ] **Step 7: Commit**

```bash
git add ocr-worker/src/lisno_ocr/extractor.py ocr-worker/src/lisno_ocr/worker.py ocr-worker/src/lisno_ocr/settings.py ocr-worker/tests/test_extractor.py ocr-worker/tests/test_worker.py
git commit -m "feat: extract major architectural panels"
```

---

### Task 4: Add acceptance fixtures, model smoke assertions, and operations documentation

**Files:**
- Create: `ocr-worker/tests/fixtures/blueprint-major-panels.png`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/README.md`
- Modify: `backend/.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces an acceptance fixture representing the supplied Blueprint 01/02
  layout without treating its labels as a closed taxonomy.
- Documents all new layout environment variables.

- [ ] **Step 1: Add failing acceptance tests**

With deterministic mocked OCR output, assert:

```python
assert labels_for_page(1) == ["Floor Plan – 3BHK Residence"]
assert labels_for_page(2) == [
    "Living Room – Front Elevation",
    "Side Elevation (Left)",
    "Ceiling Plan – Living Room",
]
assert not any(
    forbidden in label.upper()
    for label in all_labels
    for forbidden in ("LEGEND", "NOTES", "KEY PLAN", "LED STRIP", "4200")
)
```

Add an unknown structured heading fixture to prove the taxonomy is extensible,
and a known drawing term without a drawing region to prove layout evidence is
mandatory.

- [ ] **Step 2: Run acceptance tests and verify RED**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_extractor.py -k "blueprint or unknown" -v
```

Expected: fails until fixture OCR boxes and panel geometry are aligned.

- [ ] **Step 3: Align fixture geometry and deterministic expectations**

Adjust only the fixture and classifier thresholds needed to satisfy general
rules. Do not add exact reference labels to production code or page-coordinate
special cases.

- [ ] **Step 4: Strengthen the opt-in real-model smoke**

Keep the existing model test opt-in. Assert every model-generated section has a
non-empty normalized label, valid associated crop, and does not match reserved
legend/note/key-plan terms. Do not assert an exact count for real-model output.

- [ ] **Step 5: Document configuration and behavior**

Document:

- major-panel rather than per-text extraction;
- default and custom drawing/reserved terms;
- layout thresholds;
- compact crop exclusions;
- designer correction fallback;
- model-cache behavior and the real smoke command.

Add matching examples to `backend/.env.example` only for variables read by the
backend; worker-only variables belong in `ocr-worker/README.md` and the worker
startup example.

- [ ] **Step 6: Run complete verification**

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

Expected: backend, frontend, and Python non-model suites pass; TypeScript builds
and typechecks pass.

- [ ] **Step 7: Run the installed model smoke**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m model tests/test_extractor.py -v
```

Expected: the locally installed PaddleOCR/PaddlePaddle model produces only
bounded, non-empty, non-reserved proposals. Record installed versions and
whether model assets were downloaded in the implementation report.

- [ ] **Step 8: Commit**

```bash
git add README.md backend/.env.example ocr-worker/README.md ocr-worker/tests/test_extractor.py ocr-worker/tests/fixtures/blueprint-major-panels.png
git commit -m "test: verify major drawing panel extraction"
```

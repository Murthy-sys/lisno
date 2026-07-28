# Blueprint OCR Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the supplied blueprint's real PaddleOCR output into four correct plan/elevation titles and associate the three Blueprint 02 titles with their distinct drawings.

**Architecture:** Add a closed, taxonomy-aware normalization layer before title grammar evaluation. Preserve the original source image as a regression fixture, use captured OCR output for deterministic classification/crop tests, and use the installed model as a positive integration check without changing the production allowlist.

**Tech Stack:** Python 3.12, PaddleOCR 3, Pillow, pytest.

## Global Constraints

- Output exactly `FLOOR PLAN – 3BHK RESIDENCE`, `LIVING ROOM – FRONT ELEVATION`, `SIDE ELEVATION (LEFT)`, and `CEILING PLAN – LIVING ROOM`.
- Reject `&CEILING PLAN`, combined overview headings, key plan, legend entries, notes, symbols, and `CEILING FAN`.
- Normalize only configured drawing/room phrases, alphabetical drawing markers, dash variants, and full-width punctuation.
- Preserve all existing strict exclusions, performance bounds, crop bounds, and configuration isolation.
- Blueprint 02 crops must be distinct and map to top, bottom-left, and bottom-right drawings.

---

### Task 1: Normalize captured PaddleOCR title variants

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/title_classifier.py`
- Modify: `ocr-worker/tests/test_title_classifier.py`

**Interfaces:**
- Produces `normalize_ocr_title(text, accepted_plan_types, accepted_room_types) -> str`.
- Consumes normalized text in `classify_drawing_titles`.

- [ ] Add a failing table-driven test for the six captured OCR strings and exact four outputs.
- [ ] Add failing tests proving `&CEILING PLAN`, `ELEVATION & CEILING PLAN`, and `CEILING FAN` are rejected.
- [ ] Add configuration-isolation tests proving compact unsupported words remain rejected.
- [ ] Run `cd ocr-worker && .venv/bin/python -m pytest tests/test_title_classifier.py -q` and verify RED.
- [ ] Implement marker stripping, configured token separation, dash/full-width punctuation normalization, and overview rejection before the closed grammar.
- [ ] Run classifier and full non-model tests; verify GREEN.
- [ ] Commit with `fix: normalize blueprint OCR titles`.

---

### Task 2: Verify the supplied blueprint titles and crop mapping

**Files:**
- Create: `ocr-worker/tests/fixtures/blueprint-01-02.png`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/README.md`

**Interfaces:**
- Consumes the Task 1 normalization and captured real OCR boxes/confidences.
- Produces exact title and crop regression for the supplied design.

- [ ] Copy the user-supplied image byte-for-byte into the fixture directory and record its SHA-256 in the test/report.
- [ ] Add a failing page-aware fake-Paddle test using the captured boxes/confidences from the real installed model.
- [ ] Assert exactly four titles in reading order and zero overview/legend proposals.
- [ ] Assert Blueprint 02 crops are distinct and respectively overlap the top elevation, bottom-left side elevation, and bottom-right ceiling drawing while excluding the bottom legend band.
- [ ] Run the focused extractor test and verify RED before completing crop association changes.
- [ ] If necessary, use title-relative column/band geometry to select the correct drawing region; do not hard-code image filename or absolute coordinates in production.
- [ ] Run non-model tests and installed model smoke against this fixture.
- [ ] Run backend/frontend/Python full verification, typechecks, and builds.
- [ ] Document the normalization behavior and commit with `test: verify supplied blueprint extraction`.


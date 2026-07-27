# Major Drawing Panel Extraction Design

## Purpose

The OCR worker must propose sections for major architectural drawing panels,
not for every text string found on a sheet. Text recognition is an input to
layout analysis, not a direct section generator.

The behavior applies generally across floor plans, elevations, ceiling plans,
sections, furniture layouts, electrical and plumbing plans, enlarged plans,
joinery details, schedules, and other clearly titled architectural drawings.
The supplied Blueprint 01 and Blueprint 02 image is an acceptance fixture, not
a fixed taxonomy or template.

## Required Output

For a sheet containing one dominant titled drawing, create one compact section
for that drawing. For a sheet containing multiple independently titled drawing
panels, create one section per panel.

For the reference fixture, the expected proposals are:

```text
Blueprint 01
1. Floor Plan – 3BHK Residence

Blueprint 02
1. Living Room – Front Elevation
2. Side Elevation (Left)
3. Ceiling Plan – Living Room
```

Names and counts vary with the uploaded design. Detection must not be limited
to those examples.

## Excluded Content

The worker must not create sections from:

- room names or fixture names inside a drawing;
- material descriptions and finish callouts;
- leader-line labels;
- measurement text, dimension arrows, or dimension lines;
- legends, wall/finish legends, and symbol legends;
- general notes;
- individual symbols;
- key plans or orientation thumbnails;
- arbitrary OCR text without a corresponding major drawing panel.

These elements should also be excluded from generated crops when layout
separation allows it.

## Detection Architecture

Extraction uses two stages:

1. PaddleOCR returns text, confidence, and bounding boxes.
2. A deterministic layout classifier identifies major drawing headings and
   associates each accepted heading with a nearby large drawing region.

The classifier combines:

- heading typography, capitalization, line length, and relative text size;
- page position and alignment;
- numbered, lettered, and unnumbered heading patterns;
- an extensible architectural drawing-term taxonomy;
- large connected drawing regions and whitespace boundaries;
- heading-to-region proximity;
- dominant-drawing detection for single-panel sheets;
- reserved-region detection for legends, notes, title blocks, and key plans;
- duplicate suppression for repeated OCR detections.

The taxonomy helps classification but is not a strict whitelist. An unknown
title may qualify when its typography, placement, and associated drawing
region provide strong panel evidence.

## Heading and Label Normalization

Leading panel markers such as `A.`, `B.1`, or `DETAIL 04` may be removed from
the display label when they are identifiers rather than part of the drawing
name. Meaningful architectural text and display case are preserved with
collapsed whitespace.

Page headers such as `BLUEPRINT 02` are metadata, not section labels. A
descriptive subtitle such as `FLOOR PLAN – 3BHK RESIDENCE` can label a dominant
single drawing.

## Crop Proposal

Each proposal contains the accepted heading and its associated drawing. Crops
must:

- use integer coordinates within source-page bounds;
- be compact around the heading and drawing;
- exclude dimensions, callouts, legends, notes, symbols, title blocks, and key
  plans where those regions can be separated;
- avoid overlap with neighboring drawing panels;
- remain independently editable in the existing designer crop editor.

The detector must not crop only the heading or attach one heading to an entire
multi-panel sheet.

## Confidence and Fallback

Panel confidence combines OCR confidence with layout evidence. The existing
configurable confidence floor remains the eligibility threshold. Candidates
above the floor but below the UI warning threshold remain visible with a
low-confidence warning.

When a page cannot be separated confidently:

- return only candidates with a valid associated drawing region;
- do not fall back to turning annotation text into sections;
- allow the designer to add missing sections manually;
- preserve the source page for rename, recrop, removal, and manual addition.

## Interfaces

The backend worker result contract, persistence model, designer correction
workflow, client-only approval flow, and staff read-only views remain
unchanged. The worker may introduce internal OCR line, region, candidate, and
classification types plus configuration for taxonomy and layout thresholds.

## Configuration

Provide bounded defaults for:

- accepted architectural drawing terms and aliases;
- reserved-region labels such as legend, notes, key plan, and symbol legend;
- heading confidence and layout-score thresholds;
- minimum drawing-region area;
- duplicate and overlap thresholds.

Defaults must work without project-specific configuration. Configuration may
extend terms but must not disable the layout evidence requirements.

## Testing

Tests use mocked OCR output and deterministic synthetic fixtures so normal CI
does not download models.

Required cases:

- one dominant floor-plan sheet produces exactly one proposal;
- a multi-panel elevation/ceiling sheet produces exactly its major panels;
- page headers do not become sections;
- room labels and fixture names inside floor plans do not become sections;
- legends, notes, symbols, key plans, dimensions, and material callouts do not
  become sections;
- unknown but strongly structured panel headings can qualify;
- known architectural terms without a drawing region do not qualify;
- duplicate OCR headings produce one proposal;
- neighboring panels receive non-overlapping bounded crops;
- low-confidence eligible panels retain warnings;
- below-floor candidates are discarded;
- a multi-page PDF preserves page order and independently extracts each page.

The supplied Blueprint 01/02 example is a visual acceptance fixture. Its
expected labels and counts validate the general rules rather than define a
closed list.

## Out of Scope

- semantic interpretation of every line or architectural symbol;
- automatic material, dimension, or legend extraction;
- replacing designer correction and approval;
- introducing a cloud vision model in the first release;
- project-specific fixed page templates.

# Drawing-title section filter

## Goal

Create design sections only for recognized architectural drawing titles. OCR
text that belongs to legends, notes, key plans, dimensions, symbols, room
labels, and material callouts must never become a section by itself.

## Accepted drawing titles

The first release uses a strict, configurable drawing-type allowlist:

- `Floor Plan`
- `Front Elevation`
- `Rear Elevation`
- `Side Elevation`
- `Ceiling Plan`

Matching is case-insensitive and tolerant of normalized whitespace and common
punctuation. A title may contain a qualifier before or after the drawing type,
for example:

- `Floor Plan – 3BHK Residence`
- `Living Room – Front Elevation`
- `Side Elevation (Left)`
- `Ceiling Plan – Living Room`

A standalone qualifier such as `Living Room` or `3BHK Residence` is not a
section.

## Multi-line titles

OCR lines that are horizontally aligned, vertically adjacent, and visually
title-like may be combined when one line contains an accepted drawing type.
This permits `Living Room` plus `Front Elevation` to become
`Living Room – Front Elevation`. Lines outside the bounded title neighborhood
are not combined.

## Explicit exclusions

Reject candidates that are:

- legend or key entries;
- general notes or numbered note paragraphs;
- key plans, vicinity plans, or location maps;
- dimensions, scale annotations, levels, coordinates, and grid markers;
- standalone symbols or abbreviations;
- standalone room labels;
- material, finish, fixture, and equipment callouts;
- arbitrary text that does not contain an accepted drawing type.

Exclusions take precedence over the allowlist. In particular, `Key Plan` is
not accepted merely because it contains `Plan`.

## Crop association

Only an accepted title seeds a section crop. The crop association continues to
use bounded drawing regions, but must not select a text-dense legend/notes
region as the drawing when another nearby drawing region is available. The
designer can still correct the proposed crop.

## Configuration

The accepted drawing types are configured in the OCR worker with safe defaults
matching the list above. Expanding the taxonomy later does not require changing
the client or backend contracts.

## Required regression

The supplied blueprint fixture must return exactly:

```text
Blueprint 01
1. Floor Plan – 3BHK Residence

Blueprint 02
1. Living Room – Front Elevation
2. Side Elevation (Left)
3. Ceiling Plan – Living Room
```

It must return zero sections for fixture regions containing only legends,
notes, key plans, dimensions, symbols, standalone room labels, or material
callouts.

Unit tests use deterministic PaddleOCR result fixtures and verify filtering,
multi-line title composition, ordering, and crop bounds. The opt-in real-model
test verifies the supplied blueprint output when PaddleOCR models are installed.


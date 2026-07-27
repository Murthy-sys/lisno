# Drawing-title section filter

## Goal

Create design sections only for recognized architectural drawing titles. OCR
text that belongs to legends, notes, key plans, dimensions, symbols, room
labels, and material callouts must never become a section by itself.

Valid PDF, PNG, JPEG, and WebP uploads must be accepted based on their verified
contents. Browser MIME metadata is advisory: an empty or
`application/octet-stream` claim must not cause a valid file to be rejected.
An explicitly conflicting supported MIME claim and files whose magic bytes are
not supported remain rejected.

## Accepted drawing titles

The first release uses a strict, configurable drawing-type taxonomy. It accepts
plan and elevation drawings only:

- `Floor Plan`
- room-specific plans such as `Kitchen Plan`
- `Site Plan`
- `Roof Plan`
- `Electrical Plan`
- `Plumbing Plan`
- `Furniture Layout Plan`
- `Ceiling Plan`
- `Front Elevation`
- `Rear Elevation`
- `Side Elevation`
- directional elevations such as `Left Elevation` and `Right Elevation`
- equivalent directional elevation wording

Matching is case-insensitive and tolerant of normalized whitespace and common
punctuation. A title may contain a qualifier before or after the drawing type,
for example:

- `Floor Plan – 3BHK Residence`
- `Living Room – Front Elevation`
- `Side Elevation (Left)`
- `Ceiling Plan – Living Room`

A standalone qualifier such as `Living Room` or `3BHK Residence` is not a
section. Generic use of the word `Plan` is insufficient: the candidate must
match a supported plan title and must not match an exclusion.

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
- section drawings;
- details;
- diagrams;
- schedules;
- drawing types outside the supported plan-and-elevation taxonomy;
- arbitrary text that does not contain an accepted drawing type.

Exclusions take precedence over the allowlist. In particular, `Key Plan` is
not accepted merely because it contains `Plan`.

## Crop association

Only an accepted title seeds a section crop. The crop association continues to
use bounded drawing regions, but must not select a text-dense legend/notes
region as the drawing when another nearby drawing region is available. The
designer can still correct the proposed crop.

## Page and blueprint ordering

Every uploaded page or blueprint is processed independently and retained in
source order. Within a page, accepted drawing titles retain deterministic
reading order. The regression example is not a complete title allowlist; every
supported plan and elevation found across the upload is returned.

## Upload validation

The browser file picker advertises PDF, PNG, JPEG, and WebP. Client validation
accepts an exact supported MIME type or, when MIME is empty/generic, a supported
filename extension. This is only a usability check.

The backend remains authoritative. It detects the type from file magic bytes,
accepts empty or `application/octet-stream` multipart MIME metadata, stores the
detected canonical type and extension, and rejects malformed content or an
explicit conflicting supported MIME claim. A renamed non-PDF cannot pass by
using a `.pdf` filename.

## Configuration

The accepted plan and elevation types are configured in the OCR worker with
safe defaults matching the list above. The exclusion rules are evaluated first
and cannot be overridden by a generic `Plan` or `Elevation` token. Expanding the
taxonomy later does not require changing the client or backend contracts.

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
notes, key plans, dimensions, symbols, standalone room labels, material
callouts, sections, details, diagrams, or schedules.

Additional positive fixtures cover site, roof, electrical, plumbing, furniture
layout, floor, ceiling, room-specific plans, and directional elevations.

Unit tests use deterministic PaddleOCR result fixtures and verify filtering,
multi-line title composition, ordering, and crop bounds. The opt-in real-model
test verifies the supplied blueprint output when PaddleOCR models are installed.

Frontend and backend upload tests verify that a valid PDF succeeds with
`application/pdf`, empty MIME metadata, or `application/octet-stream`, while
malformed PDFs and explicit type/content mismatches are rejected.

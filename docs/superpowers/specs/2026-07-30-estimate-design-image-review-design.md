# Estimate Design Image Extraction and Review Design

## Objective

Allow estimator/sales users to upload plans while preparing an estimate, extract
every titled drawing through the OCR worker, and place each crop under the
matching estimate room and scope section. Clients review these drawings before
approving the estimate, annotate requested changes non-destructively, and
receive section-specific replacement revisions from estimator/sales.

This workflow belongs to the estimate and lead before a project exists. It
shares the existing secure upload, extraction, crop, revision, and protected
image foundations without creating a provisional project.

## Supported Inputs

The first release accepts:

- multi-page PDF;
- PNG;
- JPEG/JPG;
- WebP;
- TIFF/TIF;
- HEIC/HEIF.

TIFF and HEIC/HEIF inputs are converted to normalized PNG pages before OCR. The
immutable original upload is retained. DWG and DXF are not supported in this
release.

## End-to-End Workflow

1. Estimator/sales uploads one or more plans from the estimate workspace.
2. The backend validates and stores each original, creates an estimate design
   upload, and enqueues asynchronous extraction.
3. The OCR worker renders or decodes each page, detects every drawing title,
   associates each title with a drawing region, and returns a separate crop for
   every detected drawing.
4. The worker proposes a canonical room and scope mapping for each crop.
5. The backend validates the proposed room and scope against the estimate.
6. Estimator/sales verifies mappings and crops, corrects uncertain results, and
   submits verified drawings with the estimate.
7. The client previews and either approves each latest drawing revision or
   requests changes with annotations and a written summary.
8. Estimator/sales views the client's immutable annotation layer and uploads a
   replacement for that exact drawing.
9. The replacement becomes a new revision in the same room and scope. The
   client reviews it without losing prior images, annotations, comments, or
   decisions.
10. Final estimate approval is allowed only when every active drawing's latest
    revision is approved. Estimates with no drawings retain the existing
    approval behavior.

## Extraction and Canonical Matching

### Multi-drawing extraction

One source page may contain several titled drawings. The worker must detect all
eligible titles and associate each title with its own bounded drawing region.
For example, a sheet containing False Ceiling, Wall, Electrical, and Flooring
drawings produces four independent crops.

Multiple crops may map to the same room and scope. None is discarded merely
because another crop has the same classification.

### Text normalization

Matching is not exact-string based. Before classification, the worker:

- applies Unicode normalization and case folding;
- trims and collapses whitespace;
- removes or normalizes punctuation and separators;
- expands known abbreviations;
- tolerates configured OCR confusions and minor misspellings;
- removes non-semantic drawing suffixes such as `plan`, `layout`, or `detail`
  when appropriate.

Examples:

- `LIVING  ROOM`, `Living Hall`, and `Lounge` can map to `Living Room`;
- `False-Ceiling Plan`, `ceiling layout`, `RCP`, and
  `reflected ceiling plan` can map to `False Ceiling`.

### Room and scope classifiers

The canonical room vocabulary comes from the estimate's configured rooms. The
canonical scope vocabulary comes from `estimateBuilderSections`. Worker-owned
alias configuration maps normalized terms to stable identifiers rather than UI
labels.

Each proposal includes:

- normalized detected title;
- proposed room identifier;
- room confidence and matching evidence;
- proposed scope identifier;
- scope confidence and matching evidence;
- crop coordinates and source page;
- OCR confidence.

Automatic placement requires both a reliable room and scope match. Ambiguous or
low-confidence proposals are preserved for estimator/sales correction and are
never silently discarded or sent to the client unverified.

## Architecture and Ownership

The existing design extraction implementation is extended through shared
services and contracts rather than reused as a project-owned record.

### Backend responsibilities

The TypeScript backend owns:

- estimate and lead authorization;
- original and generated artifact storage;
- job persistence and worker leases;
- validation of room and scope identifiers;
- crop, mapping, and review revision persistence;
- client visibility;
- annotation validation;
- final estimate approval gating;
- audit records.

### OCR worker responsibilities

The Python OCR worker owns:

- PDF rendering and image decoding;
- TIFF and HEIC/HEIF normalization;
- title OCR;
- multi-title drawing-region association;
- normalized room and scope classification;
- crop generation;
- bounded result submission.

The worker does not authorize users, publish drawings to clients, or change
review decisions.

## Data Model

### Estimate design upload

- estimate ID and lead ID;
- original filename, MIME type, size, and stored reference;
- uploader ID and upload timestamp;
- extraction status: `queued`, `processing`, `estimator_review`,
  `processing_failed`, `submitted`, `changes_requested`, or `approved`;
- bounded processing failure code and safe message.

### Estimate design source page

- upload ID;
- one-based page number;
- normalized PNG reference;
- width and height.

### Estimate design drawing

- stable drawing ID;
- upload and source-page IDs;
- estimate ID;
- active state;
- current room ID and scope section ID;
- detected and display titles;
- extraction source: `ocr` or `manual`;
- room, scope, and OCR confidence with bounded matching evidence.

### Estimate design revision

- drawing ID and monotonically increasing revision number;
- source page and crop coordinates;
- immutable cropped image reference;
- room, scope, and label snapshots;
- review status: `draft`, `submitted`, `approved`, or `changes_requested`;
- submitted, reviewed, and reviewer metadata;
- client change summary;
- immutable annotation-layer reference when changes are requested;
- replacement relationship to the prior revision.

### Annotation layer

Annotations use normalized coordinates relative to the source image, so they
remain stable across preview sizes. A layer contains a versioned list of:

- ellipse/circle;
- rectangle/square;
- arrow;
- freehand polyline;
- text note.

Each item has an ID, geometry, permitted color, bounded stroke width, and
optional bounded text. Annotation payloads have maximum shape, point, and byte
limits.

## State and Approval Rules

- Only estimator/sales may create, map, crop, remove, verify, submit, or replace
  estimate drawings they own.
- Only the estimate's client may decide visible submitted revisions.
- Estimator/sales may view client annotations but cannot edit them.
- Annotation tools are client-only.
- An awaiting-review drawing may be annotated and receive a change request.
- An individually approved drawing is read-only even before final estimate
  approval.
- All previews become permanently read-only after final estimate approval.
- A change request requires a written summary and at least one annotation or
  note.
- A replacement creates a new drawing revision; it never overwrites the
  rejected image or client annotations.
- A client decision targets one exact revision and stale decisions return a
  conflict.
- Duplicate equivalent decisions are idempotent.
- The backend rechecks every active latest drawing revision inside the final
  estimate approval operation.
- Existing estimates without drawings remain approvable.

## Estimator/Sales UI

The estimate workspace header includes a compact `Upload design plans` action.
Upload progress and extraction state appear in a non-blocking status panel.

Each enabled `Room → Scope` section includes a slim Drawings row. Drawings use
compact mini-cards with:

- a 40×40 protected thumbnail;
- a one-line title;
- a small status badge;
- a compact Preview action;
- an overflow menu for secondary actions.

Context-sensitive actions avoid visual clutter:

- draft or uncertain: Verify, Correct mapping, Adjust crop, Remove;
- verified: Ready for client, Preview, History;
- changes requested: View markings, Upload replacement, History;
- approved: Preview and History.

Estimator/sales can manually create a missing crop, correct room or scope
placement, and preserve multiple drawings under the same room and scope.

## Client UI and Annotation Modal

Client estimate cards remain collapsible. Expanded details present drawings
under the matching `Room → Scope` section using the same 40×40 compact row.

Selecting Preview opens an accessible large modal. For the client, an
awaiting-review revision exposes:

- circle/ellipse;
- rectangle/square;
- arrow;
- freehand pen;
- text note;
- select, move, and resize;
- undo and redo;
- delete selected marking;
- zoom and pan;
- Save draft;
- Submit change request.

The annotation editor keeps unsaved work locally while open. Server persistence
occurs only through Save draft or Submit change request. Closing with unsaved
changes requires confirmation. The toolbar becomes a bottom action bar on
narrow touch screens.

Estimator/sales and read-only client states use the same modal without editing
tools. Client markings render over the original image as an immutable overlay.

## API Surface

The estimate workflow gains authenticated endpoints to:

- upload an estimate design and enqueue extraction;
- list uploads, processing status, pages, drawings, mappings, and histories;
- retry a failed extraction;
- correct a drawing's room, scope, label, or crop;
- create or remove a draft drawing;
- verify and submit drawings to the client;
- read protected source-page, crop, and annotation-layer content;
- save a client annotation draft;
- approve a submitted drawing revision;
- request changes with annotations and summary;
- upload a replacement for a specific drawing;
- read estimator/client review progress.

Existing estimate decision handling adds a transactional drawing-approval
precondition. Unauthorized, foreign, or hidden estimate assets use consistent
non-leaking not-found responses.

## Error Handling and Recovery

- Invalid signatures, unsupported formats, oversized pages, and output limits
  return structured safe errors.
- Extraction failures retain the original and allow retry or manual crop
  creation.
- Worker leases expire so abandoned jobs can be reclaimed.
- Partial worker results are not published.
- Invalid or ambiguous mappings remain in estimator review.
- Invalid crop bounds and annotation geometry return field-level errors.
- Stale mapping, crop, annotation, decision, replacement, or estimate approval
  mutations return conflicts without losing the user's draft.
- Failed replacement uploads leave the current revision unchanged.
- Protected object URLs and temporary upload resources are cleaned up on
  completion and unmount.

## Security and Audit

- Validate content signatures, not filename extensions.
- Sanitize filenames and keep all artifacts behind authenticated routes.
- Derive estimate, lead, owner, and client identity server-side.
- Validate every crop against stored source dimensions.
- Validate annotations against a strict versioned schema and bounded limits.
- Never accept client-provided storage references.
- Record audit events for upload, extraction, mapping correction, verification,
  submission, annotation draft, approval, change request, replacement, and
  final estimate approval.
- Store identifiers and bounded metadata in audit logs, not image bytes or full
  annotation documents.

## Testing

### OCR worker

- multi-title and multi-page fixtures;
- case, whitespace, punctuation, abbreviation, alias, and bounded misspelling
  matching;
- simultaneous room and scope classification;
- duplicate room/scope drawings;
- ambiguous and low-confidence preservation;
- bounded crop coordinates and result size;
- TIFF and HEIC/HEIF normalization;
- deterministic retries without duplicate publication.

### Backend

- upload authorization and asynchronous job creation;
- worker leasing, result validation, and atomic publication;
- estimate room and scope validation;
- manual correction, crop, and replacement revision rules;
- client visibility and non-leaking authorization;
- annotation schema and size limits;
- client-only draft, approve, and change-request actions;
- immutable approved and historical revisions;
- stale mutation conflicts and idempotent decisions;
- final estimate approval gating, including the no-drawing case;
- audit consistency.

### Frontend

- upload, progress, failure, retry, and estimator verification states;
- correct `Room → Scope` placement and multiple drawing thumbnails;
- 40×40 thumbnail contract and compact overflow actions;
- authenticated modal preview and resource cleanup;
- every annotation tool, undo/redo, selection, zoom/pan, and touch behavior;
- Save draft, unsaved-close confirmation, and submit validation;
- estimator read-only annotation rendering and section-specific replacement;
- individually approved and final-approved read-only states;
- keyboard operation, focus management, screen-reader announcements, and
  mobile toolbar layout.

### End-to-end

Verify estimator upload → OCR multi-drawing extraction → room/scope correction
→ client annotation request → estimator replacement → client drawing approval
→ final estimate approval.

## Explicit Non-Goals

- Direct DWG or DXF ingestion;
- destructive annotation flattening;
- editing client annotations by estimator/sales;
- creating provisional projects for unapproved estimates;
- silently discarding or force-mapping ambiguous drawings;
- replacing historical images or review decisions in place.

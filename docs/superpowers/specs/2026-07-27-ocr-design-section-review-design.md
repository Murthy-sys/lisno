# OCR Design Section Review Design

## Objective

Create a designer upload workflow that converts architectural design files into
named, reviewable sections. PaddleOCR proposes section labels and crop regions;
the designer verifies those results before submitting them to the property-owning
client. Only that client can approve or reject individual sections.

## Supported Inputs

- Multi-page PDF
- PNG
- JPEG
- WebP

The original file is retained as the immutable source artifact. PDF pages are
rendered to images before OCR. Images are processed directly.

## User Flow

### Designer upload and extraction

1. A designer uploads a supported file to a task.
2. The API validates and stores the original file.
3. The design version enters `queued`, then `processing`.
4. A Python PaddleOCR worker processes each page independently.
5. The worker returns detected text, confidence, page number, and proposed crop
   coordinates.
6. The backend creates draft section proposals and stores their crop images.
7. The design version becomes `designer_review`.

OCR processing does not run within the upload request. The upload returns after
the source file and processing job have been persisted.

### Designer verification

The designer can:

- rename a section;
- adjust its crop rectangle;
- remove a false detection;
- add a missing section manually;
- inspect the source page beside the proposed crop;
- retry failed OCR processing;
- submit the reviewed set to the client.

Submission is blocked while processing is incomplete, while a crop is outside
its source-page bounds, or when no section remains. Submitting creates immutable
review revisions of the current section images and labels.

### Client review

Only the client assigned to the design version's project can review sections.
The client can:

- approve a submitted section;
- reject a submitted section with a required comment;
- view the source file, section label, image, revision number, and decision
  history.

Designers, design managers, and design heads may view review progress but cannot
approve or reject. Clients cannot see draft OCR results or unsubmitted
corrections.

### Revisions

Approved section revisions remain locked. A rejected section returns to the
designer, who can upload or crop a replacement for only that section. The
replacement becomes a new section revision and must be submitted to the client
again. Other approved sections are preserved.

A design version becomes `approved` only when every active section's latest
submitted revision is approved. It remains `changes_requested` while any active
section is rejected.

## State Model

### Design version processing status

- `queued`
- `processing`
- `designer_review`
- `submitted`
- `changes_requested`
- `approved`
- `processing_failed`

### Section revision review status

- `draft`
- `submitted`
- `approved`
- `rejected`

Processing status and section review status are separate so OCR retries cannot
overwrite client decisions.

## Data Model

### Design extraction job

- design version ID
- status
- attempt count
- queued, started, and completed timestamps
- bounded failure code and user-safe message
- worker lease timestamp

### Source page

- design version ID
- one-based page number
- rendered image reference
- width and height

### Design section

- stable section ID
- design version ID
- source page ID
- current label
- active/deleted state
- creator source: `ocr` or `manual`
- OCR confidence when applicable

### Section revision

- section ID
- revision number
- crop coordinates in source-image pixels
- cropped image reference
- label snapshot
- review status
- submitted timestamp
- reviewer client ID
- reviewed timestamp
- rejection comment

Coordinates use `{ x, y, width, height }` with a top-left origin. The backend
validates all bounds against the stored source-page dimensions.

## OCR Worker Boundary

The TypeScript backend owns authorization, source storage, job persistence,
section persistence, and review state. A Python worker owns PDF rendering,
PaddleOCR inference, label-to-region association, and crop generation.

The worker:

1. claims one queued job using an atomic lease;
2. downloads or opens the stored source artifact;
3. renders pages when the source is a PDF;
4. runs PaddleOCR on each page;
5. proposes labeled crop regions using bounded deterministic rules;
6. writes source-page and section artifacts through the backend-owned storage
   interface;
7. commits results atomically or marks the job `processing_failed`.

The worker never authorizes users or changes client review decisions.

## Label and Crop Proposal

OCR output is treated as a proposal, not authoritative data. A candidate label
must meet a configurable confidence floor and contain non-empty normalized text.
The crop association algorithm uses the label bounding box and neighboring
drawing geometry to propose a bounded region. Low-confidence or ambiguous
regions remain visible to the designer with a warning.

The first release does not attempt to infer architectural meaning beyond the
detected section label. Labels such as `Elevation`, `Kitchen`, or `Living Room`
are stored as normalized display text but are not forced into a fixed taxonomy.

## API Surface

- Upload a design version and enqueue extraction.
- Read extraction status and failure details.
- List source pages and draft sections for the owning designer.
- Create, rename, recrop, remove, or replace a draft section.
- Submit all eligible draft section revisions to the client.
- List submitted sections for the assigned client.
- Approve one submitted section revision.
- Reject one submitted section revision with a required comment.
- Read section revision and decision history for authorized project users.

Every mutation uses project and role authorization. Entity isolation returns a
not-found response when a user cannot access the project.

## Storage

Storage keeps:

- immutable original upload;
- rendered source pages;
- cropped section revision images.

Generated references are opaque and never accepted directly from clients.
Downloads go through authenticated endpoints. Failed processing cleans up
uncommitted generated artifacts while retaining the original upload.

## Error Handling

- Invalid file signature or size returns the existing structured upload errors.
- OCR failures set `processing_failed` with a user-safe reason and allow retry
  or manual section creation.
- Worker leases expire so abandoned jobs can be reclaimed.
- Invalid crop bounds return field-level validation errors.
- A rejection without a comment returns a validation error.
- Stale section edits or decisions return a conflict response.
- Duplicate client decisions are idempotent when the requested state and
  comment match the existing decision.

## Audit and Security

Audit events are written for upload, extraction completion/failure, section
creation/edit/removal, client submission, approval, rejection, and replacement.
The audit record stores IDs and bounded metadata, not file contents.

Only the project client can approve or reject. The backend derives reviewer
identity from the authenticated token. File type detection uses content
signatures, filenames are sanitized, generated crop bounds are validated, and
all files remain behind authenticated download routes.

## UI

### Designer

The project workspace gains a Design Uploads area with:

- upload progress and asynchronous processing state;
- source-page viewer;
- editable section list;
- source image with crop overlay;
- crop preview;
- warnings for low-confidence OCR;
- add, rename, recrop, remove, retry, and submit actions;
- review status and rejection comments for submitted revisions.

### Client

The client project view gains a Design Review area with:

- only submitted section revisions;
- section label and revision;
- large section image preview;
- approve action;
- reject action with required comment;
- progress summary showing approved, rejected, and awaiting-review counts.

Manager and head views show the same progress summary and read-only section
history without decision controls.

## Testing

### Backend

- upload enqueues extraction without blocking on OCR;
- only supported file signatures are accepted;
- job claiming and lease recovery are atomic;
- multi-page results create bounded page and section records;
- OCR failure retains the original and exposes retry/manual recovery;
- designer edits validate ownership, state, and crop bounds;
- only the assigned client can decide submitted revisions;
- rejection requires a comment;
- approved revisions are immutable;
- rejected sections can be replaced without changing approved sections;
- aggregate design status follows latest active section decisions;
- audit writes remain transactionally consistent.

### Worker

- PDF rendering preserves page order and dimensions;
- fixtures cover clear, low-confidence, missing, and duplicated labels;
- proposed crop rectangles remain within page bounds;
- retries are deterministic and do not duplicate sections;
- partial failures do not publish incomplete results.

### Frontend

- processing, failure, review, submission, and decision states render correctly;
- designer correction controls update previews and validation;
- client controls appear only for the assigned client;
- rejection comment validation is accessible;
- keyboard and screen-reader users can operate crop and review flows;
- stale conflicts prompt a safe refresh without losing an unsaved comment.

## Scope Boundaries

The first release does not add chat, mentions, notifications, semantic
architectural classification, or automatic final approval. It does not allow
clients to edit labels or crops. Those capabilities can build on the persisted
section and revision model later.

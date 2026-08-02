# Synchronized Full-Plan Review Design

**Date:** 2026-08-03
**Status:** Approved in conversation; written-spec review pending

## Goal

Let a client review either the complete uploaded design plan or an extracted
drawing, annotate either view, and submit one synchronized change request to
estimator/sales/design staff. A corrected drawing must update only its original
region in the current full-plan preview. Unchanged drawings, positions,
revisions, and approvals must remain unchanged.

## Product Decisions

- The client receives a professional right-side **Full design** navigator with
  small thumbnails for every normalized source page.
- Selecting a thumbnail opens that complete page in the existing protected
  annotation preview.
- Full-page and extracted-drawing annotations are two views of the same review
  data, not independent feedback channels.
- If a page annotation overlaps multiple drawings, the client confirms one or
  more target drawings before submitting.
- A page annotation outside every drawing remains valid as **Unassigned plan
  feedback**.
- Corrected drawings are patched into their original positions in a generated
  current-plan view. The original uploaded PDF and normalized pages remain
  immutable.
- There is no visible pan tool. Navigation behaves like Google Maps: wheel,
  pinch, buttons, double-click/tap, and drag on empty canvas.
- The right navigation reserves a fixed bottom placeholder called **Ask Lisno**.
  This design does not implement an AI agent.

## Existing Foundation

The application already stores normalized source pages, immutable extracted
drawing revisions, each revision's source-page identifier and crop rectangle,
protected image endpoints, annotation documents, client decisions, replacement
uploads, and audit events. This feature extends those contracts instead of
creating a separate document-review system.

## Recommended Architecture

Use a coordinate-linked composite model.

The immutable normalized source page remains the base layer. Each latest
eligible drawing revision is a patch layer placed at its persisted crop
rectangle. Page-level annotations form the top layer. The browser may render
the composite interactively, while the backend remains authoritative for
revision selection, coordinate validation, overlap mapping, and any persisted
composite artifact.

Do not regenerate and duplicate the complete PDF after every correction. Do
not store unrelated copies of equivalent annotations for page and drawing
views.

## Data Model

### Plan page revision

Add a plan-page revision record containing:

- stable estimate and source-page identifiers;
- monotonically increasing revision number;
- immutable base normalized-page reference;
- ordered patch manifest of drawing revision identifiers and crop rectangles;
- lifecycle status and timestamps;
- prior plan-page revision identifier.

The patch manifest contains references and geometry, not duplicated image
bytes. Its ordering is deterministic. The source page remains immutable.

### Shared change request

Add an estimate-design change request containing:

- estimate, upload, and source-page identifiers;
- client and creator identifiers;
- normalized page-coordinate annotation document;
- summary;
- confirmed target drawing identifiers;
- `unassigned` flag when there is no target;
- per-target resolution state and resulting revision identifier;
- overall open/resolved status;
- optimistic version and timestamps.

One submission creates one change request even when it appears in both the
full-page and drawing views. Per-target states allow a multi-drawing request to
be resolved independently. The request closes only after every target, or the
unassigned page action, is resolved.

### Annotation identity

Every annotation element receives a stable identifier and records:

- normalized page-space geometry;
- source view: `full_page` or `drawing`;
- optional source drawing and revision identifiers;
- confirmed target drawing identifiers;
- type, style, and bounded text.

Page-space annotation coordinates are canonical. Crop-space coordinates are a
derived projection used by the drawing preview.

## Coordinate System

Persist normalized coordinates in the inclusive logical range `0..1` relative
to the normalized source page. Never persist CSS pixels, zoom offsets, or
viewport transforms.

For a drawing crop `(cropX, cropY, cropWidth, cropHeight)` on a page
`(pageWidth, pageHeight)`, map a crop-local normalized point `(u, v)` into page
space:

```text
pageU = (cropX + u * cropWidth) / pageWidth
pageV = (cropY + v * cropHeight) / pageHeight
```

Map a page point inside that crop back into crop space:

```text
u = (pageU * pageWidth - cropX) / cropWidth
v = (pageV * pageHeight - cropY) / cropHeight
```

Transform every geometry type through a shared backend/domain library:
rectangle, circle/ellipse, arrow endpoints, freehand points, and text anchors.
The frontend may use the same formulas for immediate previews, but the backend
recomputes and validates persisted mappings.

Rotated PDF pages must be normalized into one upright raster coordinate system
during extraction. All later geometry uses that normalized orientation.

## Overlap and Target Selection

Calculate an annotation's page-space bounding box and its intersection with
each active drawing crop on the same source page.

- No overlap: store valid unassigned plan feedback.
- One material overlap: preselect that drawing and let the client confirm.
- Multiple material overlaps: show all detected drawings and require explicit
  selection of one or more targets.
- Boundary-only contact does not count as an overlap.

A drawing is a detected target when the annotation anchor/centroid is inside
its crop or the crop contains at least 15 percent of the annotation bounding
box area. Lines and arrows use the midpoint as their anchor; freehand marks use
the centroid of their points; text uses its anchor. This prevents a stray tail
from targeting a drawing accidentally. The UI never silently submits targets;
the backend verifies that selected targets belong to the page and are active.

## Client Experience

### Right-side navigation

The expanded client estimate includes a right-side **Full design** navigator:

- one compact thumbnail row per normalized source page;
- page number/title and status;
- selected-page highlight;
- statuses for awaiting review, changes requested, revised, and approved;
- scrollable page list;
- fixed **Ask Lisno** placeholder at the bottom.

On small screens the navigator becomes a **Design pages** drawer. The Ask
Lisno placeholder stays reachable without obscuring page thumbnails.

### Full-page preview

Selecting a page opens a protected modal with:

- select, circle, rectangle, arrow, freehand, and text/comment tools;
- undo, redo, and delete-selection actions;
- zoom in, zoom out, fit-to-screen, and reset-view actions;
- save-draft and request-changes actions;
- target confirmation before request submission.

There is no pan-mode control. Wheel or pinch zooms around the pointer/focal
point. Double-click/tap zooms into a location. Dragging empty canvas moves the
view; dragging with an annotation tool creates or edits a mark. Keyboard zoom
controls and accessible labels remain available.

Zoom scale and translation are ephemeral UI state. They never alter annotation
geometry.

### Extracted drawing preview

The existing drawing preview uses the same editor and interaction model.
Page-space annotations targeting the drawing are projected into crop space.
New crop annotations are converted to canonical page coordinates before save
or submission.

## Staff Experience

Estimator, sales, and assigned design staff receive one notification for each
submitted change request. Notification data contains identifiers, page/title,
target count, summary, and status only.

The staff review workspace opens with:

- full-page context and annotations;
- highlighted target crop(s);
- selected extracted drawing and current revision;
- client summary;
- immutable revision history;
- replacement upload restricted to the selected target.

Unassigned feedback supports three explicit actions:

- link to an existing active drawing;
- create a new bounds-validated crop/drawing;
- resolve as a page-only correction.

## Selective Replacement and Composite View

A replacement creates a new immutable revision only for the selected drawing.
It never mutates or regenerates unrelated drawing revisions.

After staff verifies and submits the replacement:

1. Create the new drawing revision.
2. Create the next plan-page revision manifest by copying the prior manifest
   and replacing only the matching drawing-revision reference.
3. Preserve every other patch reference, crop rectangle, review status, and
   approval.
4. Present the new drawing to the client for review.
5. Render the current plan as base page plus latest eligible patches at their
   original crop positions.

If one request targets several drawings, each replacement and approval advances
independently. Previously approved unchanged drawings remain approved. Final
estimate readiness considers unresolved change-request targets as blockers.

The composite endpoint may render on demand with bounded caching. If a patch
cannot be rendered, it falls back to the prior working patch or immutable base
region and returns an observable, non-destructive error state. A failed upload
never removes the prior revision.

## API Boundaries

Add protected endpoints for:

- client plan-page workspace and thumbnail metadata;
- protected thumbnail/current-composite image reads;
- page annotation draft create/update;
- overlap-target preview;
- page change-request submission;
- staff change-request queue/detail;
- target linking, manual crop creation, replacement, and resolution;
- plan-page revision history.

Every write uses optimistic versioning and idempotency where a retry could
otherwise duplicate a request or revision. DTOs never expose storage keys,
claim tokens, or raw internal audit metadata.

## Authorization and Lifecycle

- Clients may read only pages belonging to their claimed estimate and may edit
  only while that estimate and page are reviewable.
- Estimator/sales/design permissions follow existing estimate ownership and
  assignment rules.
- Approved or superseded revisions are immutable.
- New replacements reopen only their targeted drawing and related request
  target, not unrelated approvals.
- Final estimate approval is rejected while any required drawing or change
  request remains unresolved.

## Safety and Failure Handling

- Enforce existing upload, page, pixel, output, annotation-byte, and processing
  limits.
- Validate finite normalized coordinates, geometry bounds, element counts,
  text lengths, crop membership, target ownership, and revision versions.
- Confirm before closing a modal with unsaved annotations.
- Autosave drafts with visible saving/saved/error states and retry.
- Return `409` for stale revisions without overwriting newer data.
- Keep the previous working revision when replacement extraction or storage
  fails.
- Store metadata-only audit events for drafts, submissions, target changes,
  replacements, resolutions, approvals, and plan-page revision creation.
- Do not place raw annotation documents or private file references in
  notifications or audit metadata.

## Performance

- Load thumbnail metadata with the expanded estimate, but fetch protected
  thumbnail bytes lazily.
- Load full page/composite bytes only when opened.
- Virtualize or incrementally render large page lists.
- Apply patches only for the selected page.
- Cache composites by immutable plan-page revision identifier.
- Keep interactive transforms on the client GPU-friendly; do not re-encode an
  image during zoom or drag.

## Testing

### Domain and backend

- Crop-to-page and page-to-crop round trips for every annotation geometry.
- One-pixel-equivalent tolerance after normalization.
- Zero, one, and multiple overlap target detection, including boundary contact.
- Explicit target confirmation and active-page ownership validation.
- Unassigned feedback link/create/resolve paths.
- Draft, submission, notification, and idempotent retry behavior.
- Replacement of one drawing changes only its manifest entry.
- Unchanged revisions, crops, and approvals remain byte-for-byte/state-equal.
- Multi-target independent resolution and final readiness gating.
- Composite dimensions, patch placement, ordering, caching, and fallback.
- Authorization, stale-version conflicts, file limits, and metadata-only audit.

### Frontend

- Right navigation renders every page thumbnail/status and selected state.
- Mobile drawer and fixed Ask Lisno placeholder do not obscure content.
- Wheel, pinch, buttons, double-click/tap, and empty-canvas drag navigation.
- No separate pan tool is shown.
- Annotation alignment across zoom, resize, full-page, and crop projections.
- Target confirmation and unassigned feedback submission.
- Staff notification/detail/replacement journey.
- One replacement updates only the related drawing and plan region.
- Approved unchanged drawings remain approved and read-only.
- Keyboard access, focus trapping, announcements, and unsaved-change warning.

### Manual acceptance

- Desktop, tablet, and 320-pixel mobile layouts.
- Mouse, trackpad, touch, and keyboard interactions.
- Large multi-page PDF thumbnail and preview performance.
- Slow upload, retry, conflict, offline draft, and failed-composite behavior.
- Cross-role client-to-staff-to-client selective replacement journey.

## Out of Scope

- Implementing the Ask Lisno AI agent or chat backend.
- Collaborative simultaneous cursors or real-time co-editing.
- Mutating the original uploaded PDF.
- Replacing an entire PDF when only one drawing changes.
- Automatic submission of ambiguous overlap targets without client
  confirmation.

## Acceptance Criteria

The feature is accepted when a client can annotate either a complete source
page or extracted drawing, observe the synchronized mark in the other view,
submit one correctly targeted request, and receive a corrected drawing patched
into its original full-page position while every unrelated drawing, position,
revision, and approval remains unchanged.

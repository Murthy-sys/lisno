# Full-plan design review

## Overview

Lisno preserves uploaded design files and normalized pages as immutable source material. Clients review a complete page or an extracted drawing. A replacement creates a new drawing revision and page manifest that changes only that drawing patch.

## Coordinate model

Annotations use normalized `0..1` page coordinates. UI zoom, translation, CSS pixels, and device size are never persisted. Crop projection uses the crop rectangle and source-page dimensions. Target detection uses the annotation anchor or at least 15 percent bounding-area overlap; boundary-only contact is ignored. Multiple detected drawings require explicit confirmation.

## Client workflow

1. Expand the estimate and open **Design pages** in the right-side navigator (a drawer on small screens).
2. Select a 40×40 thumbnail to open the current composite page.
3. Navigate using wheel/trackpad, pinch, double-click/tap, `+`, `−`, Fit, Reset, or empty-canvas drag. There is no pan mode.
4. Add shapes, arrows, freehand, or text and optionally save a draft.
5. Submit changes and confirm detected drawings, or submit unassigned page feedback.
6. Review the selective revision and approve it. Final approval stays blocked while drawing reviews or plan requests remain unresolved.

**Ask Lisno — coming soon** is disabled and stores no chat data.

## Staff workflow

Estimator/sales users see owned estimates; designers see assigned estimates. Queue rows contain metadata only. Annotations and protected images load after opening a request.

- Targeted feedback uploads against exactly one drawing and latest version.
- Unassigned feedback can link active same-page drawings or resolve page-only with a bounded note.
- Replacement advances only its manifest patch; other identifiers, positions, states, and approvals remain unchanged.
- Client approval advances the target to approved; the request resolves when every target resolves.

## Limits and privacy

- Original uploads, normalized pages, drawing revisions, and page manifests are immutable.
- Protected images use authenticated non-cacheable endpoints; storage references never enter public DTOs.
- Existing upload, decoded-pixel, page-count, output, processing, 200-shape, 5,000-point, 500-character text, and 256 KiB annotation limits remain authoritative.
- Audit and notification records contain identifiers and counts only—never bytes, storage keys, claim tokens, or raw annotations.
- Thumbnails load lazily when rows enter the viewport; full composite bytes load only after selection.

## Recovery

- `409 PLAN_REVIEW_CONFLICT`: refresh the matching request/page, review current targets, and retry.
- Failed replacement: the prior manifest remains current; refresh the target version and retry.
- Failed composite read: verify manifest revisions and protected images. Never edit the base or unrelated patches.
- OCR failure: retry from estimator/sales. OCR-missed pages remain available for unassigned feedback.

## Local demo

1. Start MongoDB, backend, frontend, and OCR worker using repository instructions.
2. Upload a multi-page PDF, verify mappings, submit drawings, and send the estimate.
3. Sign in as the exact lead-email client and annotate one full-plan drawing.
4. As estimator/sales or assigned designer, open **Plan change requests** and replace only that target.
5. Confirm only its original crop changes, approve as client, and verify final readiness.
6. Check desktop, tablet, and 320px layouts, keyboard focus, dialog trapping, and zoom announcements.

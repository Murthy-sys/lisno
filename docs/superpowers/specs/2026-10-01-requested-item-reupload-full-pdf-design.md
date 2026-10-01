# Requested-item re-upload and current full-plan PDF

Status: specification and task plan approved by the user on 2026-10-01; Mode A completed. Implementation, independent integrity review, focused/shared regression checks, typechecks, builds, and browser/PDF verification completed.

## Goal

Give the Designer a visible **Upload revised item** button for each item with requested changes. Uploading through that action must replace that exact item's current revision and update it in its original position in the actual full-plan PDF. The downloadable and submitted PDF, the full-page preview, and the item preview must describe the same revision set.

The user identified full-PDF replacement as essential. A separate revised image beside an unchanged original PDF does not satisfy this requirement.

## Current behavior and evidence

Verified against the current worktree:

- `frontend/src/features/leads/EstimateDesignUploads.tsx` lists returned drawings and opens the existing Replace dialog. Ordinary upload intentionally adds another file.
- `frontend/src/features/leads/EstimatePlanChangeRequests.tsx` already offers a request-wide revised PDF upload. The individual replacement input is inside a disclosure labelled "Replace only this drawing" and described as a fallback.
- `backend/src/services/estimate-design.service.ts`, `replaceDrawing`, uses the drawing ID and expected revision, accepts only a current returned drawing, and creates an immutable replacement revision. Images complete immediately; PDF/HEIC replacements use the existing leased extraction job.
- `backend/src/services/estimate-plan-review.service.ts` stores page patch manifests and composites a current full-page PNG. This is an image preview, not an updated PDF artifact.
- `backend/src/services/project-workflow.service.ts`, `prepareDesignReview`, snapshots original upload bytes and adds separate revised PNG attachments. The original full PDF is not rebuilt with the changed item.
- Page advancement currently chooses the immediately replaced revision's source page. Replacement revisions have their own source pages, so stable placement through a second or later replacement must be explicitly established and regression tested.
- Immediate image replacement creates a source-page record under the original upload with a new page number. The current full-plan reader enumerates upload source pages. A revised item must not become an extra page in the full PDF or its page navigator.
- Current PNG composition resizes patches using `fit: "fill"`. The new PDF correctness contract must avoid stretching drawing geometry and must validate placement instead of silently clamping invalid coordinates.
- The backend already has `pdf-lib`, `pdfkit`, `pdfjs-dist`, and `sharp`. The OCR worker renders PDF pages using PyMuPDF. Original PDF page geometry can be read from stored bytes; existing page records store normalized pixel dimensions but not a persistent original-placement identity.

No customer uploads were opened or changed during this investigation. Earlier approved work remains dirty in the shared worktree and must be preserved.

## Recommended approach and alternatives

**Recommended: versioned full PDFs built from original PDF pages and explicit item placements.** Preserve the original PDF's page sizes, rotation, order, and unaffected native content. Replace only the requested item's region using its stable original placement. Use original replacement PDF content where available and validated, and original-resolution image content for image replacements. Generate new stored PDF versions while retaining original uploads and prior review artifacts as history.

**Alternative: rebuild every page from the current PNG preview.** This is simpler but rasterizes unaffected text/linework and can reduce print quality. It does not meet the requested quality requirement and is excluded as the default or a silent fallback.

These are implementation choices within the requested outcome. No automatic file supersession or deletion is needed for item re-upload.

## Scope and non-goals

In scope:

- Discoverable item-specific upload in the Designer returned-items area and the existing requested-item detail.
- Correct replacement of the same item in full-page previews and the actual full PDF, including repeated revisions.
- A Designer preview/download of the current revised full PDF before submission.
- The same immutable submitted PDF used for Client download, Admin/on-behalf review, and review email attachments/retries.
- Exact drawing/page/file lineage, geometry validation, authorization, stale-write protection, failure recovery, and PDF rendering verification.

Out of scope:

- CAD editing, changing the layout of unrelated items, automatic item deletion, unrelated screen redesign, commercial estimate calculations, or changing Client approval rules.
- Merging unrelated original uploads into one arbitrary document. Each original full-plan PDF remains a document with its own stable page order and revised current version.
- Rewriting historical approvals, proofs, stored original uploads, or already submitted review attachments.
- Production mutation, backfill execution, deployment, commits, or real email during verification.

## User flow and UI requirements

1. A returned item shows its title, Client feedback, source plan/page, revision, and **Upload revised item** as a visible primary action. It remains available without opening a secondary disclosure.
2. File selection is already bound to the drawing ID and expected current revision. Reuse the existing replacement dialog and validated upload endpoints. Show the target name in the dialog and accessible button name.
3. A single-item file replaces only that item. The existing request-wide revised-PDF flow remains available for multiple requested items and must update the same canonical PDF representation. Matching must fail safely for ambiguous/missing targets; titles are not persistent identity keys.
4. Show upload, extraction, full-plan preparation, ready, and retry/error states truthfully. Prevent duplicate submissions and replacement of a different project/item if selection changes during upload.
5. When processing succeeds, show the revised item and **Preview updated PDF** / **Download updated PDF**. The PDF contains the replacement in the original slot, with other items and pages preserved.
6. The Designer submits once all current returned items are addressed, processing is complete, and the full PDF matches the current manifest. Unresolved returned drawings retain the readiness guard from the previous fix.
7. The Client sees the submitted revision only. Designer draft replacements must not leak through a mutable current-image URL into an earlier pending or approved Client review.
8. Reuse existing components/styles. Check desktop and mobile layout, keyboard file selection, dialog focus restoration, accessible progress/errors, loading, empty, stale, and denied states. Invalidate every affected workspace, page/PDF, request, workflow, and review query on mutation.

Ordinary **Add new plan/pages** remains an explicit separate operation for genuinely additional pages. Re-uploading a requested item requires no deletion of the original plan.

## Canonical data and PDF contract

### Stable item placement

- Maintain a stable origin consisting of original upload ID, original source-page ID/index, drawing ID, destination crop, and coordinate transform to PDF page units. Replacement content has separate source IDs and its own source crop.
- Follow and validate the complete immutable revision lineage when resolving older data. Never use the immediately previous replacement page as the next destination or join by filename/title.
- Distinguish original document pages from replacement-only source assets. Preserve every original page, including pages with no detected drawings; exclude synthetic replacement pages from the document page count.
- Preserve deterministic patch ordering and handle overlapping target regions explicitly. Do not silently cover an unrelated approved item or lose an earlier replacement.

### One versioned document manifest

- Use an immutable ordered manifest of original documents/pages, current drawing revision IDs, original placements, and replacement asset references. Include a version/content fingerprint so preview, export, submission, and cache identity agree.
- Generate a stored PDF artifact from that manifest, with an opaque storage reference, checksum, byte size, filename, page count, and generation version. Reuse a successful artifact for the same manifest.
- On submission, pin the exact manifest and PDF artifact to the review round. Client/Admin downloads and email delivery must read those stored bytes, never regenerate from later editable state.
- Original uploads and old review rounds remain immutable history. New round attachments present the updated full PDF as the authoritative plan; an old original PDF must not be labelled or sent as the current revised plan.

### Geometry and quality

- Preserve original page count/order, physical dimensions, orientation, crop-box origin, and unaffected content. Cover 0/90/180/270-degree rotations and non-zero page boxes in tests.
- Preserve unaffected PDF vectors/text rather than rebuilding the entire document from OCR preview images. Use source PDF replacement content where supported by verified source geometry; do not silently downsample it to an OCR thumbnail.
- Replace the destination region completely so obsolete linework cannot show through transparent pixels. Preserve the replacement's proportions and linework; no unconditional non-uniform stretching.
- Fit the complete replacement proportionally inside its original destination; differing proportions use blank padding, with no stretching, cropping, or destination enlargement. The user explicitly approved this policy after reporting the disabled Submit button.
- Validate source/destination bounds, source-PDF-to-preview aspect/scale assumptions, overlap, missing pages, and corrupt assets before publication. If placement cannot be established safely, provide an actionable correction/re-upload error and block submission. Do not append the item as a new page or quietly fall back to an unchanged PDF.
- Preview must use the same placement manifest as PDF generation. Pixel comparison of rendered exports is required; a successful HTTP response or changed attachment name is insufficient evidence.

## Authorization and state transitions

| Actor | Allowed behavior |
| --- | --- |
| Assigned Designer with editable workflow | Upload a revision for an eligible returned item; preview/download the draft updated PDF; submit when ready |
| Related Client | Read/download the exact submitted or approved plan allowed by the existing review state; approve/request changes through existing decisions |
| Authorized Admin/on-behalf reviewer | Read/download the same pinned review artifact within existing operation-specific scope |
| Other user/project or unassigned Designer | No read/write access; no disclosure of private filenames, storage references, or manifest data |

The existing Estimator replacement flow must remain compatible. Shared page/PDF logic must preserve its current permission boundary and commercial review semantics.

`changes_requested -> upload/extraction -> replacement draft + revised page manifest -> current PDF ready -> submitted review round -> approved or changes_requested`

Approval is never implied by successful upload. Preserve actor identity, proof records, expected-version/CAS checks, audits, frozen-design restrictions, lease/heartbeat/token semantics, and deterministic downstream completion.

## API, persistence, failure handling, and compatibility

- Extend existing replacement endpoints rather than introducing an unrelated ordinary-upload path. Add only the placement/manifest/artifact metadata and protected PDF reads needed for the above contract. Synchronize route-operation authorization, OpenAPI, runtime schemas, frontend types, and test fixtures for any new/changed routes.
- Use additive schema changes and a deterministic legacy read strategy. Existing unmodified originals can remain valid baseline artifacts. New successful replacements/submissions must use the new consistency rules. An unresolved legacy mapping must return a specific repair error without modifying customer data automatically.
- Read existing artifacts safely when new fields are absent. If a write migration becomes necessary, its dry run, conflict report, backup, rollback, and live authorization are separate requirements.
- Prepare storage objects before final publication, revalidate the manifest/CAS at commit, and clean up unreferenced generated objects on failure. A concurrent replacement must not publish a PDF from stale revisions. Bound PDF work by existing upload/page/pixel limits and avoid holding database transactions during expensive rendering.
- If PDF generation fails after replacement extraction, retain a recoverable draft/pending state, keep the last valid published artifact, expose the failure, and prevent submitting mismatched bytes. Retry against the same manifest idempotently.
- Review-round commit and external delivery remain independent. Disabled/failed mail must not roll back the valid submitted plan; retries send the same stored PDF/checksum and semantic review round.
- Log/audit stable IDs, manifest version, generation outcome and safe failure code. Do not log document contents, private storage URLs, or personal information.
- Prefer current dependencies. Any inability to meet native PDF quality with them must be reported and resolved explicitly; a degraded screenshot PDF is not an acceptable silent substitute.

## Acceptance criteria and verification

- **AC1 - Discoverability:** every editable returned item exposes **Upload revised item**, bound to the correct drawing/version, with useful progress/error states and keyboard/mobile coverage.
- **AC2 - Actual PDF replacement:** replacing one item in a multi-item, multi-page PDF changes that item in the rendered downloaded full PDF. Page count/order, unrelated items, unaffected page geometry/content, and original upload bytes remain unchanged.
- **AC3 - Repeated changes:** replace the same item at least three times and replace a second item independently. All changes remain in their original slots; no duplicate pages, lost patches, or stale original drawing reappears. Include two original PDFs and an OCR-missed page.
- **AC4 - Quality:** actual PDF render checks cover image and PDF inputs, transparent assets, unequal source dimensions, rotation/crop-box transforms, overlapping regions, and print-scale line/text legibility. Incorrect placement or unsupported geometry blocks publication with a clear error. Unaffected native PDF content is retained.
- **AC5 - Consistent review:** Designer preview, submitted full-page/item previews, Client/Admin download, email attachment, and delivery retry resolve to the intended revision manifest; downloads/delivery share exact stored PDF checksums. Earlier rounds/proofs/attachments remain byte-identical after later replacement.
- **AC6 - Integrity:** replica-set tests cover concurrent uploads/submission, stale requests, extraction/generation/storage failure and cleanup, retry deduplication, approved-item protection, no draft leakage, and unauthorized access using asymmetric projects/identities.
- **AC7 - Regression:** first upload, ordinary additional pages, supported current resubmission cases, request-wide matching, Client decisions, and existing Estimator behavior remain valid. Run affected backend/frontend typechecks/builds, focused transactional/rendered suites, PDF visual checks, and OCR non-model tests if its contract changes.

The later task plan must trace verification to these criteria. Do not describe the feature as complete until the downloaded PDF itself has passed the replacement, preservation, and history checks.

## Assumptions and open decisions

- "Actual full PDF" means the current version users preview/download and submit to Client review. Original files and earlier approved/submitted PDFs remain available as immutable history.
- One requested item may be only a region within a PDF page; replacement must therefore work for both a whole-page drawing and a drawing sharing its page with other items.
- No further product choice is required before specification approval. Exact additive schema names and route shapes will be settled in the separate task plan against these requirements.

## Approved submission-blocker correction

The user reported that an uploaded requested image left Submit disabled. Read-only local development evidence identified `PLAN_DOCUMENT_ASPECT_MISMATCH`: all uploads had completed extraction, two documents were ready, and the revised document failed only its source-to-destination proportions check. The user explicitly selected “Fit complete image without stretching” in this conversation.

Acceptance: allow proportional containment with blank padding; retry the previous proportions failure once through the normal authenticated preparation API; enable submission only after its current full PDF is ready; show any remaining blocker beside Submit. Preserve history, authorization, source geometry validation and exact artifact checks. No direct data repair or Client submission is authorized by this correction.

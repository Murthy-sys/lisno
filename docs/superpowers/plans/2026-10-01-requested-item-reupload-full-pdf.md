# Requested-item re-upload and current full-plan PDF: task plan

Status: specification and task plan approved by the user on 2026-10-01; Mode A completed. Implementation, independent integrity review, focused/shared regression checks, typechecks, builds, and browser/PDF verification completed.

Source of truth: [approved specification](../specs/2026-10-01-requested-item-reupload-full-pdf-design.md). This plan records its approval without changing the specification's requirements.

## Required outcome

An item-specific **Upload revised item** action creates the next revision of that same drawing and replaces its original position in the actual full-plan PDF. Designer preview, submitted Client review, Admin/on-behalf download, and email must agree on the pinned manifest and stored PDF bytes. Earlier originals, approvals, proofs, and attachments remain immutable.

The implementation is incomplete until actual exported PDFs pass rendered replacement/preservation checks. A revised thumbnail or separate image attachment cannot stand in for this result.

## Settled implementation contract

### Document identity and placement

- Introduce a canonical plan-document contract in `backend/src/contracts/estimate-plan-document.ts` and a pure placement/manifest module in `backend/src/domain/estimate-plan-document.ts`.
- Each original upload is a separate document. Order its original pages by validated original page index. Retain pages without detected drawings. Exclude replacement-only source assets and synthetic appended image pages.
- Resolve each drawing's original destination through its immutable `replacesRevisionId` ancestry, validating estimate/upload ownership, cycles, missing ancestors, and bounds. Persist additive original-placement metadata for newly created revisions/pages where useful; legacy reads derive it without rewriting historical records.
- Separate destination coordinates from replacement-source coordinates. The destination includes original upload/page IDs, original PDF page index, normalized crop, and transform to page units. The source includes the revision ID, source upload/page/crop, media type, and immutable asset identity.
- PDF geometry is read from the stored native PDF and related normalized page dimensions. Validate page rotation, crop/media-box origins, and pixel-to-page transforms. Do not infer identity from names or use a replacement's source page as the next destination.
- Version the renderer and canonical serialization. A manifest hash includes original asset identity, ordered pages, placements, current drawing revision IDs, source assets, and renderer version. Exclude mutable review status/timestamps so changing draft to submitted does not alter document content identity.
- Hashes/storage references are internal integrity data. Public DTOs expose only safe IDs, manifest version, status, filenames, page metadata, download URLs, and useful failure codes/messages.

### Artifact persistence and preparation

- Add `backend/src/models/EstimateDesignPlanDocument.ts` for immutable manifest content and a generation state: `preparing`, `ready`, or `failed`. Public workspace status also supports `not_prepared` and `blocked` without fabricating an artifact.
- Use a unique identity over estimate, original upload, manifest hash, and renderer version. Ready artifacts have immutable opaque PDF storage reference, checksum, byte size, filename, and page count. Retries reuse the same content identity; a ready artifact is never overwritten.
- Reserve generation with a bounded attempt token/expiry and compare-and-set transitions so crashed or concurrent requests cannot leave a permanent preparing state or publish another attempt's bytes. This is separate from the existing OCR lease protocol, which remains unchanged.
- Create a document service to load/authorize manifests, prepare/reuse artifacts, and return protected stored bytes. Generate outside Mongo transactions, then validate the current source manifest before marking ready. Clean up losing/failed temporary writes without deleting a winner's referenced object.
- After replacement/extraction, the UI prepares the current document set and shows progress. Submission also ensures artifacts are ready independently, so a direct API caller cannot skip this check. A stale manifest returns a specific conflict and refresh path.
- PDF failure preserves a recoverable drawing draft and the last published artifact. A successful upload does not imply the revised full plan is ready to submit.

### PDF renderer behavior

- Add an isolated `backend/src/services/estimate-plan-pdf.ts` renderer accepting an immutable manifest and storage-backed source bytes. Reuse installed `pdf-lib` and `sharp`; no new package or OCR contract change is planned.
- Copy native original PDF pages and preserve their dimensions, boxes, rotation, order, and unaffected vectors/text. For a document with no replacements, reuse its validated original PDF bytes where possible.
- Apply only actual content replacements at the canonical destination. Fully cover obsolete visible content in that region, including beneath transparent replacement pixels. Clip source PDF content to the validated source crop; preserve vectors where the source is PDF. Use source-resolution image content for image inputs.
- Fit the complete replacement proportionally inside the original destination, adding blank padding for unequal proportions. The user approved this correction after a proportions failure blocked submission. Retain strict source-PDF-to-preview geometry checks. Do not distort, crop away drawing content, enlarge the destination, or alter an unrelated item.
- Overlapping changes use a deterministic validated composition. If they cannot preserve unrelated/approved content, return a placement conflict instead of relying on arbitrary paint order.
- Full-page previews and PDF composition consume the same immutable placement manifest. Tests compare rendered PDF regions with the corresponding page preview. Do not add `pdfjs-dist` as a production dependency merely for previews; it is currently a dev dependency.
- Keep image-only original uploads compatible. Do not invent a physical drawing scale where the source contains none; any PDF wrapper must preserve the image's proportions and disclose no unsupported measurement interpretation.

### Protected API and consumer contract

Keep both current replacement endpoints and their input/version checks. Add a focused plan-document router with these operations:

| Operation | Purpose and access |
| --- | --- |
| `GET /estimates/:estimateId/design-plan-documents` | Authorized staff workspace manifest/status; Designer scope follows assignment/editability and existing staff policies |
| `POST /estimates/:estimateId/design-plan-documents/prepare` | Prepare current draft PDFs with `expectedManifestHash`; editable authorized staff only; idempotent for the same manifest |
| `GET /estimates/:estimateId/design-plan-documents/:documentId/pdf` | Authorized draft PDF preview/download; validate document membership and the permitted manifest |
| `GET /client/estimates/:estimateId/design-plan-documents?roundId=...` | Related Client's published manifest/document list for an authorized submitted/approved round |
| `GET /client/estimates/:estimateId/design-plan-documents/:documentId/pdf?roundId=...` | Exact stored PDF belonging to that permitted round; never resolve editable latest state |

- Workspace DTO: `manifestHash`, `readyForSubmission`, and `documents[]` containing source upload ID/name, artifact ID when present, per-document hash, status, page count, safe failure details, and protected PDF URL when ready. Return pending status while another valid preparation attempt is running; bounded UI polling stops on terminal/error state.
- Primary agent owns backend contracts and matching frontend types/API helpers before writers consume them. Route-operation registry, operation-specific Super Admin policy, OpenAPI, runtime schemas, app wiring, and authorization fixtures change together.
- Add optional immutable document references/manifest metadata to new Design review rounds and attachment snapshots. Retain the existing attachment byte-size/checksum/storage envelope for delivery and Admin downloads. New rounds use current full PDFs as the authoritative plan attachments rather than original PDFs plus replacement PNGs.
- Extend the existing Client page workspace/image reads to resolve the round-pinned page manifest. Keep existing commercial Estimator review semantics compatible; do not expose staff draft manifests through Client URLs.
- Existing legacy round downloads continue to serve their original immutable attachments. Reconstruct legacy page views only from that round's exact submitted revisions when provable; an ambiguous legacy mapping fails with a safe explicit error, never a mutable latest-state fallback. New submissions always use pinned document manifests.

## Dependency order and ownership

`T1 baseline/contracts -> T2 lineage + T3 renderer/artifacts + T4 frontend -> T5 publication integration -> T6 integrity review -> T7 final verification`

T2, T3, and T4 can run concurrently only after T1 fixes the shared interfaces. T5 requires T2/T3 and integrates T4 before review. Maintain one active parent phase, with these bounded subtasks underneath it.

No agents or implementation start before the execution-mode gate. In Mode A use the owners below; in Mode B the primary agent performs the same work sequentially.

### T1. Preserve baseline and establish shared contracts

Owner: primary agent. Criteria: AC1-AC7.

Owned shared files: this plan; new backend document contract; `backend/src/app.ts`, `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, `backend/src/openapi.ts`; `frontend/src/api/types.ts`, `frontend/src/api/authorization-contract.ts`, `frontend/src/features/leads/estimateDesignApi.ts`; related canonical authorization fixtures/tests. Primary also owns later `project-workflow.service.ts`, review-round schema, new router, and publication integration.

1. Capture initial dirty paths and per-target diffs under `/tmp/lisno-requested-item-full-pdf/`. Preserve the previous readiness fix, Designer unlock, furniture, Client review, and Project status changes. Assign each dirty target only after its existing diff is understood.
2. Define manifest/placement/artifact DTOs and internal prepare/submission interfaces from the settled contract. Keep relative backend imports ending in `.js`.
3. Establish synthetic multi-page native PDFs with text/vector markers, two drawings sharing a page, one untouched page, one OCR-missed page, and a second unequal document/project. Keep binary outputs ignored/temporary; retain fixture builders and assertions.
4. Confirm pure renderer inputs and asset-read boundaries so T2/T3 need no shared-file edits. Publish contract changes to every owner immediately.
5. Validate early PDF feasibility for native page copying, clipping, transformations, and opaque replacement using installed libraries. If a quality requirement cannot be met, report the concrete limitation before any degraded fallback. A material scope/architecture change requires updating the affected approved document once.

### T2. Fix original placement and repeated replacement lineage

Owner in Mode A: backend implementer. Criteria: AC2-AC4, AC6-AC7.

Exclusive paths:

- `backend/src/domain/estimate-plan-document.ts`
- `backend/src/services/estimate-design.service.ts`
- `backend/src/services/estimate-plan-review.service.ts`
- Necessary additive fields in `EstimateDesignRevision.ts`, `EstimateDesignSourcePage.ts`, and `EstimatePlanPageRevision.ts`
- New `backend/tests/estimate-plan-document-lineage.test.ts` and focused existing plan-review/request-replacement suites

Tasks:

1. Resolve stable original destinations through full ancestry, including multiple successive replacements and both immediate-image and queued-PDF results.
2. Ensure page advancement updates the canonical original page. Separate replacement asset pages from visible document pages; retain original pages without drawings.
3. Apply the same origin/manifest rules to request-wide replacement, single-item replacement, and supported deletion recovery. Avoid refactoring unrelated upload behavior.
4. Replace unchecked stretching/clamping with validated shared geometry in page previews. Preserve item mapping, latest-revision checks, authorized target IDs, approved content, and existing leased-job semantics.
5. Add tests for three replacements of one item, independent second-item replacement, two original uploads, legacy immediate-image pages, corrupt/cyclic lineage, and cross-project source references.
6. Hand off settled manifest loading and page rendering functions to primary/T3. Do not edit publication, route registry, or frontend files.

After this writer finishes, the primary agent may extend its services for publication pinning in T5; there must be no concurrent ownership of those paths.

### T3. Build native PDF composition and durable artifacts

Owner in Mode A: independent backend implementer. Criteria: AC2-AC6.

Exclusive paths:

- `backend/src/services/estimate-plan-pdf.ts`
- `backend/src/services/estimate-plan-document.service.ts`
- `backend/src/models/EstimateDesignPlanDocument.ts`
- New `backend/tests/estimate-plan-pdf.test.ts`, `estimate-plan-document-service.replica-set.test.ts`, and their dedicated fixture helpers

Tasks:

1. Implement native PDF composition using the fixed manifest and storage interface, including rotation/crop boxes, transparent images, source PDF crops, and unchanged-page preservation.
2. Store prepared artifacts by content identity with unique-index/CAS protection, retryable generation failure, checksum verification, and compensating storage cleanup. Reject invalid geometry or missing assets without creating a usable artifact.
3. Keep CPU/storage work outside publication transactions. Revalidate current manifest after generation and expose a prepared immutable descriptor for T5's transaction check.
4. Exercise concurrent prepare/retry, crash-expired reservation, storage failure, stale generation, and duplicate preparation. Verify a losing attempt never deletes a winning referenced artifact.
5. Render real generated PDFs and assert region changes, page geometry, text/vector retention, unaffected regions, and repeatability. Unit tests must inspect bytes/content/rendered output rather than mock the renderer itself.
6. Do not edit `estimate-design.service.ts`, `estimate-plan-review.service.ts`, publication, or routes; coordinate via T1's interfaces.

### T4. Expose requested-item upload and PDF preview

Owner in Mode A: frontend implementer. Criteria: AC1, AC5, AC7.

Exclusive paths:

- `frontend/src/features/leads/EstimateDesignUploads.tsx` and its tests
- `frontend/src/features/leads/EstimatePlanChangeRequests.tsx` and its tests
- A small reusable plan-document status/preview component and its scoped tests/styles
- `frontend/src/features/estimates/ClientPlanPageReview.tsx` and its tests
- Relevant Designer styles and page tests only as needed

Tasks:

1. Show **Upload revised item** beside every editable returned target. Reuse the existing bound replacement dialog and validation; remove the individual action's fallback-only/disclosure presentation.
2. Show exact target title, source page, feedback, and revision. Ensure changing selection or project cannot retarget a queued upload. Preserve ordinary **Add new plan/pages** and supported request-wide upload as separate actions.
3. On terminal replacement/extraction, refresh manifest status and prepare the revised document. Show upload/extraction/preparing/failed/ready states accurately; retain clear retry controls and disable submission while current PDFs are not ready.
4. Provide protected **Preview updated PDF** and **Download updated PDF** for Designers. Reuse existing authenticated file/preview components; revoke temporary object URLs and prevent stale preview reuse.
5. Provide the Client's submitted PDF preview/download using round-pinned metadata. Draft replacements must not update an already open submitted review in place.
6. Invalidate workspace, plan pages/documents, requests, workflow, and review queries after changes; include manifest/round identity in preview cache keys.
7. Test keyboard/focus, duplicate-click prevention, slow processing, refresh failure, stale 409, failed generation/retry, denied states, mobile long names, and correct bytes/URL selection for published versus draft documents.

Do not modify shared API/types/authorization files while the primary owns them. Request a contract adjustment from primary instead.

### T5. Integrate submission, published reads, delivery, and authorization

Owner: primary agent after T2/T3 finish; coordinate with completed T4. Criteria: AC5-AC7.

Owned paths: `project-workflow.service.ts`, `DesignPlanReviewRound.ts`, new `routes/estimate-plan-documents.ts`, shared T1 files, publication/authorization tests; previously owned service files only after explicit writer handoff.

1. Wire the document service without circular service dependencies. Register protected routes and canonical operation policies with no broader identity/project access.
2. Before Designer submission, load and validate current drawing state and prepare/reuse full PDFs outside the transaction. Recheck exact drawing IDs/revisions, workflow state, document membership, and manifest identity inside the transaction before submission/audit/review-round writes.
3. Pin document manifests/artifacts on the round. Reuse stored artifact checksums for Admin attachments and post-commit mail. Keep first submission, approved-plus-draft, and supported unchanged-approved resubmission valid; retain the returned-drawings guard and genuine stale-revision errors.
4. Make Client full-page/item previews read only the submitted revision set. A later editable draft cannot change that round's visible images/PDF. Preserve existing Client request/approval version checks.
5. Verify disabled, failed, successful, concurrent, and retried delivery sends the same pinned artifact. External delivery failure remains independent from a valid round commit.
6. Cover legacy snapshots with absent additive fields without altering them. Test protected download checksums, safe errors, cross-estimate IDs, unassigned Designers, unrelated Clients, and operation-specific Admin/Super Admin scope.
7. Reconcile the complete diff against the T1 baseline. No customer data repair, backfill, or historical artifact rewrite is performed.

### T6. Independent integrity review

Owner in Mode A: read-only integrity reviewer after all writers finish. Criteria: AC2-AC7.

Review original placement and repeated lineage, PDF content/geometry, canonical page enumeration, manifest hashing, artifact races/cleanup, transaction ordering, immutable history, Client draft isolation, authorization, cache identity, mail retry semantics, and compatibility. Report confirmed findings with evidence. Primary fixes findings with explicit ownership, then finishes all writers before T7.

### T7. Final verification and handoff

Owner in Mode A: verification runner for integrated checks; primary for browser and PDF visual inspection. Criteria: AC1-AC7.

Run focused checks first, then broaden for the changed shared contracts:

```text
# backend/
npm test -- tests/estimate-plan-document-lineage.test.ts tests/estimate-plan-pdf.test.ts tests/estimate-plan-document-service.replica-set.test.ts
npm test -- tests/estimate-plan-review-models.test.ts tests/estimate-plan-review-client.test.ts tests/estimate-plan-review-staff.test.ts tests/estimate-plan-request-replacement.test.ts tests/estimate-plan-request-replacement.replica-set.test.ts
npm test -- tests/project-workflow-mongo.replica-set.test.ts tests/estimate-design-upload-delete.replica-set.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/EstimatePlanChangeRequests.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/admin/DesignPlanResponseInboxPage.test.tsx src/features/workflow/DesignPlanAttachmentPreview.test.tsx
npm test -- src/api/authorization-contract.test.ts
npm run typecheck
npm run build

# root
git diff --check
git status --short
```

Add the new router/submission and reusable frontend component tests to the final command list when their filenames are fixed. Run repository full suites only if integration evidence identifies a remaining cross-cutting risk; no lint script exists.

If the existing OCR payload cannot provide verified replacement geometry, return to the shared contract before extending it. Any approved worker change must preserve leases/heartbeat/token/result/retry semantics, use a separate owner, and run `.venv/bin/python -m pytest -m "not model" tests/test_extractor.py tests/test_worker.py` plus focused new contract tests. No model-dependent verification is assumed.

## Acceptance evidence matrix

| Criteria | Required evidence |
| --- | --- |
| AC1 | Rendered component tests and browser interaction at 1440px, 768px, and 390px; keyboard upload/dialog focus; errors and processing states |
| AC2 | Real multi-page PDF export; changed target region and preserved unaffected regions/page count/order; original byte hash unchanged |
| AC3 | Three successive revisions of one item plus a different second item, two source PDFs and one undetected page; no extra page or stale patch |
| AC4 | Native PDF structure/text retention plus rendered checks for 0/90/180/270 rotations, non-zero crop boxes, transparency, matching/unequal proportions, bounds/overlap rejection, fine text/linework |
| AC5 | Exact artifact hashes across Designer submission, Client/Admin download and mail/retry; historical artifact hashes and proof records unchanged; no draft leakage |
| AC6 | Real Mongo replica-set race/failure/rollback/cleanup tests, idempotent preparation/delivery, asymmetric project/identity access tests |
| AC7 | Focused existing workflow/replacement suites, shared route/authorization checks, both typechecks/builds, and conditional OCR contract verification |

PDF quality is a required gate: render the final exported PDFs using an available local renderer, inspect original/revised pages at normal and enlarged scale, and save before/after images under `/tmp/lisno-requested-item-full-pdf/`. Use generated synthetic drawings, not customer files. Automated comparisons must tolerate antialiasing without allowing movement, stretching, missing content, or changed unrelated regions. Browser QA must open/download the real generated test artifact, not just a mocked success response containing placeholder PDF bytes.

## Failure limits, rollout, and final report

- No live migration is planned. Additive fields/read compatibility and source-derived lineage are the rollout strategy. Ambiguous existing lineage is a reported repair case, never a guessed destination.
- No dependency change is planned. Native PDF fidelity must be proven with current libraries before broad wiring; a material limitation is escalated as a concrete finding rather than silently reducing quality.
- No seed, production mutation, real email, commit, push, or deployment is authorized. Preserve all earlier shared-worktree changes.
- Final handoff reports implemented behavior, changed files/contracts, exact test results and PDF/browser evidence, warnings, unrun checks, generated-output paths, and remaining limitations. Link the approved specification and this execution record. Do not call partially verified PDF replacement complete.

## Execution record, 2026-10-01

- User approved both documents and selected Mode A. Prior worktree paths/diffs preserved in `/tmp/lisno-requested-item-full-pdf/prior-status.txt` and `prior-work.diff`.
- T1–T5 implemented: canonical ancestry/placement manifests, native PDF composition, artifact preparation with expiring CAS ownership, protected current/published PDF routes, pinned review-round attachments, and visible per-item upload plus PDF readiness/preview/download.
- Production dependencies and lockfiles unchanged. Uses existing `pdf-lib` and `sharp`; renderer tests use installed development PDF rendering tools.
- T6 independent integrity review completed. Fixed late prepare responses overwriting newer manifests, cross-project request selection, individual PDF extraction reconciliation, and feedback from stale Client review rounds. Client mutation bodies now carry `reviewRoundId`, required after commercial approval; the server rechecks the round and drawing snapshot inside write transactions. Saved page drafts also carry round identity. Legacy precommercial calls remain compatible.
- Initial implementation rejected source-to-slot aspect mismatches (rounding allowance capped at 3%). The approved follow-up below replaces that restriction with proportional containment; bounds/overlap conflicts, unsupported annotations and inconsistent source pages remain rejected. Failures leave the draft and prior submitted PDF intact.
- Artifact downloads compare immutable review attachment metadata and content checksums. Ready document page counts come from the generated PDF, including pages without detected drawings.
- T7 browser checks passed at 1440, 768 and 390 pixels using synthetic API fixtures and a real generated five-page PDF: visible item upload, keyboard opening, preparation blocking submission, failed preparation/retry, protected preview/download, submission, and no horizontal page overflow. The downloaded PDF SHA-256 matched the served renderer output at the time of the browser check (`c232261ec245575856d774c78552b329ae7b689bc3058ce2998b7615a9c2cf2e` on the first run). Subsequent renderer tests regenerate these temporary synthetic PDFs with different fixture metadata; their later hashes are not the browser-check baseline. Screenshots/PDFs are ignored temporary outputs under `/tmp/lisno-requested-item-full-pdf/`.
- Actual PDF rendering checks prove original byte preservation, unchanged outside-region pixels, repeated replacements, native text/vector retention, rotated pages, offset boxes, transparent inputs, a page with no detected drawings, and matching full-page previews. Synthetic rendered PDF pages and browser UI screenshots inspected locally.
- Integrated verification results follow below. No production data, migration, seed, external delivery, commit, push or deployment performed.

### Verification notes

- Source page metadata must enumerate the complete original PDF. Pages with no extracted drawings remain in the PDF; incomplete/ambiguous page metadata is rejected rather than guessing placement.
- Clean browser session: no application console errors or warnings. UI containers, upload actions, preparation states, preview opening and exact PDF download were checked. Embedded native PDF paint is not asserted in headless mobile Chromium; the downloaded artifact itself was rendered and visually inspected with local PDF tools.
- Existing full repository suites and model-dependent OCR tests were not run. The changed contract is covered by focused and shared authorization/workflow suites; no OCR protocol or model implementation changed. There is no repository lint script.
- Initial integrated runs found two stale/incomplete test fixtures. Corrected fixtures pass focused reruns: backend artifact/Client tests 32/32 and frontend drawing tests 7/7. Original failing logs remain under the QA temporary directory for traceability.

### Final integrated results

| Check | Result |
| --- | --- |
| Backend final focused/shared selection | 401/401 tests passed, 18 files |
| Frontend final selection | 119/119 tests passed, 11 files |
| Backend `npm run typecheck` and `npm run build` | Both exit 0 |
| Frontend `npm run typecheck` and `npm run build` | Both exit 0 |
| `git diff --check` and `git status --short` | Both exit 0; unrelated pre-existing work preserved |
| Responsive browser interaction | 1440/768/390 passed; clean console |
| Real exported PDF geometry/content | Six renderer tests passed, including native/image source fidelity and geometry rejection |

The backend command was the T7 selection above plus `tests/estimate-plan-documents-routes.test.ts`. The frontend selection included all T7 files plus `src/features/leads/PlanDocuments.test.tsx`, `src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`, `src/features/estimates/estimateDrawingJourney.test.tsx`, and `src/features/estimates/ClientEstimateDrawings.test.tsx`. Full commands and output are saved in `/tmp/lisno-requested-item-full-pdf/final-backend-tests.log` and `final-frontend-tests.log`; typecheck/build and hygiene logs share the `final-` prefix.

Non-blocking existing tooling warnings: Mongoose deprecated `new` option, and Vite chunk-size advisory (largest application chunk approximately 2,132.50 kB, gzip 584.94 kB). No lint command exists. Task-owned Vite/browser sessions stopped. No dependencies, migration, real email, production mutation, commit, push, or deployment.

## Follow-up: uploaded image leaves Submit disabled

User-approved correction: proportional containment of differing replacement image dimensions. Existing Mode A implementation resumed.

1. Backend owner: remove only the source-to-slot ratio rejection; preserve source geometry, bounds, overlap and immutable artifacts. Verify image and native PDF replacements with unequal proportions, unchanged outside pixels and complete visible content.
2. Primary/frontend: automatically retry a saved `PLAN_DOCUMENT_ASPECT_MISMATCH` once, show the current blocker beside Submit, retain readiness/version guards, and test recovery/no retry loop.
3. Independent review and focused integrated checks; browser interaction check with the saved-failure recovery state. Do not submit the user's plan or mutate its database directly.

Focused frontend verification: `npm test -- src/features/leads/PlanDocuments.test.tsx src/features/leads/EstimateDesignUploads.test.tsx` passed 45/45. Remaining follow-up results recorded below when complete.

Follow-up evidence:

- Backend focused lineage/PDF suites: 21/21 passed. Four new real PDF cases cover portrait/landscape image and native PDF sources, all-corner preservation, circular markers without distortion, white padding, unchanged outside pixels, and matching page previews. Source-to-native-PDF geometry rejection remains covered.
- Both follow-up typechecks passed. No renderer algorithm, storage contract, approval history or route permissions changed.
- Read-only in-memory rendering of the affected local development estimate succeeded for all three current documents (6 pages, 1 page, 1 page). No customer PDF was exported, logged, or saved; no database state or Client review was changed.
- Browser recovery fixture passed at 1440/390 pixels: the saved proportions failure automatically retries, the old error clears, Submit becomes enabled and the synthetic submit handler runs successfully. No page overflow or console errors. Screenshots in `/tmp/lisno-requested-item-submit-disabled/`.

Follow-up integrity finding: allowing unequal proportions requires item/page annotation transforms to use the centered visible-content rectangle rather than the full masked destination. Corrected both projection directions and Designer feedback fallback; full original slots remain authoritative for placement/masking. Blank-padding-only marks are page feedback. Added portrait/landscape edge and round-trip tests. Frontend focused selection including `planGeometry.test.ts` and `ClientEstimateDrawings.test.tsx` passed 57/57 before final integrated verification.

Backend annotation verification: `npm test -- tests/estimate-plan-document-lineage.test.ts tests/estimate-plan-review-client.test.ts` passed 33/33, including replica-set tests for portrait/landscape request creation, update, and Designer feedback fallback. Backend typecheck passed. Tests verify exact item coordinates, page round trips, unchanged original slots, and padding-only feedback without an item target.

Independent follow-up integrity review confirmed the annotation finding resolved with no new actionable finding. The reviewer traced frontend projections, transactional target detection, request creation/update, and Designer fallback to the fitted rectangle while preserving original placement and pinned review checks.

Final follow-up test selections passed on the integrated worktree: backend 99/99 across six files (lineage, PDF renderer, Client review, staff review, Design review, and artifact service replica-set); frontend 57/57 across four files (PDF readiness, Designer upload/submission, annotation geometry, and Client drawings). Full suites were not repeated. Current logs are under `/tmp/lisno-requested-item-submit-disabled/`.

Final follow-up typechecks and builds passed for both workspaces. `git diff --check` passed and the pre-existing dirty worktree was preserved. The frontend build retains its existing chunk-size advisory (largest application chunk 2,133.79 kB, gzip 585.43 kB). No new dependency, migration, live database mutation, Client submission, external delivery, commit, or deployment was performed. Follow-up complete.

Exact final follow-up commands:

```sh
# backend/
npm test -- tests/estimate-plan-document-lineage.test.ts tests/estimate-plan-pdf.test.ts tests/estimate-plan-review-client.test.ts tests/estimate-plan-review-staff.test.ts tests/estimate-design-review.test.ts tests/estimate-plan-document-service.replica-set.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/leads/PlanDocuments.test.tsx src/features/leads/EstimateDesignUploads.test.tsx src/components/design/planGeometry.test.ts src/features/estimates/ClientEstimateDrawings.test.tsx
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

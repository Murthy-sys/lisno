# Task plan — Mobile client estimate and design review

Approved specification: [mobile client estimate and design review](../specs/2026-09-26-mobile-client-estimate-design-review-design.md) (approved 2026-09-26). Gate 2: task plan only. Implementation begins only after this plan is approved and an execution mode is selected.

## Baseline and decision

- The approved spec establishes an estimate-ID entry before project creation, exact `projectId` linking after approval, page-level V1 annotations, separate drawing/section decisions, and approved documents in the tabbed Project Details screen. Those are the contract; tasks below do not reopen them.
- The current worktree has pre-existing edits to the mobile Project Details tab implementation and its documents panel, plus `mobile/.expo/dev/logs/start.log`. Capture the exact dirty-path set and per-target diffs again before writers begin. The primary agent owns all pre-existing dirty product paths and reconciles them with that separate approved work. No worker may overwrite, reformat, stage, or revert them.
- Reuse `runtime.transfers.download` and `DownloadedArtifact.release()` for protected images, React Native `Image` for local previews, and the existing `artifact.share({ cleanupAfterShare: true })` platform flow for PDF/other document opening. Verify this on Android. No dependency or lockfile change is planned. If the platform flow cannot open a PDF on the verification device, resolve that concrete failure before final handoff and update the plan only if the fix materially changes the approved scope.
- Keep API and persistence unchanged. The mobile operation registry already contains the needed operations. Any drift found by contract checks is diagnosed against the backend registry, never bypassed in the UI.

## Shared implementation contract

1. **Canonical queries.** A Client estimate list has one scoped key based on the current `FeatureWorkspace` key, `privateQueryKey(scope, "estimates", "estimates", "/client/estimates")`; the list screen, estimate detail, and project Estimation tab share it. Plan pages and drawings use separate estimate-ID keys in the `plan-review` family. Project sections use a project-ID key in the `design` family. Existing project design-version keys stay unchanged. All private keys contain environment and user IDs.
2. **Typed boundary.** Parse `GET /client/estimates` and nested plan/drawing/section payloads into narrow mobile view models with stable IDs, status, source dimensions, revision numbers, request versions, and original filenames. Reject malformed actionable records with an error state; never infer an ID from a label or list position. Unknown optional presentation fields get explicit fallbacks.
3. **Decision state.** Commercial estimate controls only for `sent_to_client`. Post-approval plan editability follows the backend `designPlanStatus` and page/revision state: `ready_for_client` can be reviewed; `approved` is visible but read-only. Pre-approval `sent_to_client` and `client_changes_requested` retain the backend's plan-review permissions. The server response, not an optimistic status, changes the UI.
4. **Annotation state.** One `AnnotationDocumentV1` belongs to one source page or drawing revision with exact dimensions and normalized coordinates. The editor owns local unsaved state. Network actions carry the server's draft/request/revision version. A new page request retains its idempotency key across retries of that submission. A 409 preserves the editor document while fresh server data is loaded for reconciliation.
5. **Separation.** Estimate upload pages and extracted drawing revisions use the estimate review APIs; project design sections use the project section API; task design versions in Documents remain approved/client-visible files. Each has separate labels and empty states. The Client's approved value is never fabricated from a mutable estimate total.

## Dependency-ordered tasks

### T0 — Reconcile the existing Project Details work *(first; primary agent)*

- **Owner:** primary agent; read-only investigation of the current dirty paths and their approved sibling spec/plan.
- **Work:** snapshot `git status --short` and relevant diffs; run the sibling work's focused Project Details tests if its integration state permits; identify which current tab and document surfaces are stable. Record exact ownership of dirty paths before any writers begin. Preserve the modified `.expo` log without touching it.
- **Exit:** the implementation starts from a known integrated baseline, and no task below assumes the old single-scroll screen or overwrites the in-progress tab implementation.

### T1 — Typed client review data and query/mutation adapters *(after T0; shared contract owner)*

- **Owner:** primary agent for shared contract decisions; implementation ownership of new `mobile/src/features/estimates/clientReviewModel.ts`, `clientReviewApi.ts`, their focused tests, and any necessary `mobile/src/core/query/invalidationRegistry.ts` change. Other writers consume these exports and do not edit them.
- **Work:** define narrow parsers/types for Client estimates, line items, `projectId`, plan uploads/pages/open requests, extracted drawing revisions/readiness, section revisions/history, and approved document metadata. Centralize scoped query keys, exact project-ID matching, operation gates, and mutation invalidation. Use existing endpoint paths and status rules. Add contract tests with two unequal projects/estimates, null project ID, malformed nested records, approval states, and 401/403/404/409 behavior.
- **Exit / spec AC:** AC1, AC2, AC4, AC6 foundations. `npm test -- src/features/estimates/clientReviewModel.test.ts` passes before dependent UI uses the adapters.

### T2 — Native V1 annotation core and editor *(after T1; independent file ownership)*

- **Owner:** `mobile/src/platform/annotations/**` additions/edits and new `mobile/src/features/annotations/**`, including focused tests. Do not edit estimate screens, project screens, or `frontend/`.
- **Work:** port the web V1 document rules into pure mobile geometry/edit operations and an SVG touch editor. Support rectangle, ellipse, arrow, freehand, text, selection, move/resize/remove, undo/redo, bounds, 200 elements, 256 KiB, and accessible tool names. Use the existing normalized-coordinate helpers; keep pan/zoom separate from mark creation, and preserve coordinates across layout/orientation changes. Include a read-only overlay. No per-frame React state loop for gesture movement.
- **Tests:** source/view round trips under non-square pages, zoom/pan, rotation/layout changes; bounds/byte limits; freehand simplification; undo/redo; gesture/tool behavior; read-only state; large font/touch targets.
- **Exit / spec AC:** annotation portion of AC3 and AC7. This task can run in parallel with T3 and T4 after T1.

### T3 — Protected image and document opening primitives *(after T1; independent file ownership)*

- **Owner:** new `mobile/src/features/documents/ProtectedDocumentViewer.tsx`, `useProtectedDocument.ts`, and focused tests. Do not edit the existing Project Documents panel or annotation editor.
- **Work:** fetch protected page/drawing/section images with authenticated transfers, expose temporary local URIs to the native preview, cancel superseded loads, release artifacts on close/unmount/session change, and distinguish denied, unavailable, network, and oversized-file states. Support image viewing in an accessible full-screen surface and PDF/other documents through the existing authenticated share/reader flow. Set explicit size limits per resource and never put tokens or client file data in logs.
- **Tests:** correct encoded path and MIME/filename, cancel/release after page switch or close, late-result cleanup, denied vs network failure, repeated Open taps, and PDF cleanup after share.
- **Exit / spec AC:** private-file parts of AC5–AC7. T3 can run in parallel with T2 and T4 after T1.

### T4 — Client estimate entry and commercial decision *(after T1; distinct estimate-screen ownership)*

- **Owner:** `mobile/src/features/estimates/ClientEstimateAction.tsx`, new `ClientEstimateReviewScreen.tsx` and tests, new `mobile/src/app/estimate/[estimateId].tsx`, and the estimates branch only of `mobile/src/features/workspace/FeatureWorkspace.tsx`. No other feature branch is changed.
- **Work:** turn the existing Client Estimates list rows into navigation to an estimate-ID review screen, while retaining the list for estimates without projects. Authorize the route through the established session and feature registry. Resolve the selected estimate by exact ID from the shared query, display identity, GST-inclusive total, included lines, status and Client PDF; handle missing/denied/empty/refetch states. Limit decision buttons to `sent_to_client`, confirm approval, require a note for changes, prevent double submission, invalidate shared queries, and route to the returned project ID when available. Reserve explicit slots for T5/T6 design review without duplicating their state.
- **Tests:** two unequal estimates, null project ID, approved result with project link, 409/no optimistic approval, action permissions, PDF client path, and `client_changes_requested` read-only commercial controls.
- **Exit / spec AC:** AC1 and the estimate-entry part of AC6. T4 can run in parallel with T2 and T3 after T1.

### T5 — Full uploaded-plan review and page change requests *(after T1–T3 and T6; plan-review owner)*

- **Owner:** new `mobile/src/features/estimates/ClientPlanReview.tsx`, `ClientPlanPageViewer.tsx`, `clientPlanReviewModel.ts`, and focused tests. Do not edit T4 screen, T6 drawing component, or project integration files.
- **Work:** list original uploads by ID/filename and pages in source order; open a selected protected page in the T3 viewer with T2 editor; show prior marks/comments read-only using T6's settled projection helper; save a versioned draft; preview affected drawings; require the Client to confirm targets; submit with the returned revision/snapshot token and retained idempotency key; edit an open request by version. Support page-level feedback when no overlap exists, preserve unsent edits on 409, and prompt before discarding dirty edits. Map backend `DESIGN_PLAN_NOT_REVIEWABLE` and `designPlanStatus` to an awaiting/read-only state rather than a generic failure.
- **Tests:** multi-page upload order, one-page-at-a-time fetch, draft reopen, target overlap and no-overlap, idempotent retry, 409 reconciliation, approved/read-only page, and access-denied isolation.
- **Exit / spec AC:** AC3, AC5, AC6. Can run in parallel with T7 and T8 after T6's projection helper is settled.

### T6 — Extracted drawing review *(after T1–T3; drawing-review owner)*

- **Owner:** new `mobile/src/features/estimates/ClientDrawingReview.tsx`, `drawingAnnotationProjection.ts`, and focused tests. Do not edit T5 files or the estimate screen.
- **Work:** render backend readiness and client-visible drawing revisions, preview protected revision images, approve only submitted versions, and show current/historical annotations. For a drawing with a source page, project marks onto that page and use target preview plus a page change request or update the existing open request, matching web. For the legacy path without a source page, use the drawing revision draft/decision operations. Keep revision numbers and IDs exact; refresh both drawing and plan consumers after a decision.
- **Tests:** page projection in both directions on unequal crops, selected target ID, legacy decision fallback, approved/hidden revisions, concurrent/stale revision and request history.
- **Exit / spec AC:** drawing portion of AC4 and AC7. Can run in parallel with T7 and T8 after T2/T3; its projection helper is a prerequisite for T5.

### T7 — Client project design-section review *(after T1 and T3; independent file ownership)*

- **Owner:** new `mobile/src/features/design/ClientSectionReview.tsx` and focused tests. Do not edit `DesignVersionWorkspace.tsx`, project tab files, or estimate review files.
- **Work:** query `GET /client/projects/:projectId/design-sections` by stable project ID, preview the protected revision image, show progress/status/history, and submit versioned approve or required-comment change decisions through the existing section endpoint. Advance to the next submitted section after a successful decision, matching web; retain a clear completed/empty state. A section image is not an editable V1 plan page.
- **Tests:** role and operation gate, two-project isolation, next submitted section, immutable decided revision, required rejection comment, stale 409, image cleanup, and invalidation.
- **Exit / spec AC:** section portion of AC4 and AC6. Can run in parallel with T5/T6 after T1/T3.

### T8 — Approved project document access *(after T0, T1 and T3; primary agent)*

- **Owner:** primary agent for pre-existing dirty `mobile/src/features/projects/ProjectDocuments.tsx`, `ProjectDocuments.test.tsx`, and any new local helper under `mobile/src/features/projects/`.
- **Work:** retain the existing admin document behavior, add Client estimate PDF by the linked estimate ID, ensure task design versions are approved/client-visible for Client (backend remains authoritative), and paginate or offer load-more beyond 30. Add an Open action using T3 for images and platform PDF reading, preserving download/share where appropriate. Never label a submitted estimate plan as an approved project document.
- **Tests:** role-aware PDF operation, 31+ approved files, client-visible filter, image/PDF Open, clean-up, empty/denied/error states, and two-project document isolation.
- **Exit / spec AC:** document portion of AC5 and AC6. Only the primary agent edits these dirty files, sequentially with T9.

### T9 — Integrate estimate, design and documents into Project Details *(after T4–T8; primary agent)*

- **Owner:** primary agent for pre-existing dirty `mobile/src/features/projects/ProjectDetailPage.tsx`, `ProjectStructure.tsx`, `ProjectStructure.test.tsx`, `mobile/src/features/workspace/RecordDetailScreen.tsx`, and `mobile/src/app/record/[featureId]/[recordId].tsx`; also the final wiring of `mobile/src/features/estimates/ClientEstimateReviewScreen.tsx` after T4's owner finishes. Limit changes to the project branch, estimate review composition, and route param handling; preserve other records and the sibling tabbed layout.
- **Work:** compose T5 plan and T6 drawing review into T4's estimate review screen after its owner is done. On Client projects, use the exact-ID linked estimates from T1 in Estimation; mount T5 plan review and T7 section review in Designs, with T6 drawing review reachable in the estimate/design context; use T8 in Documents. Keep existing staff/admin Designs and Tasks operations. Accept a validated `tab=designs` deep link from T4 and fall back to Information when unavailable. Keep visited panels mounted so an in-progress annotation is not lost on tab switch, but do not fetch unopened heavy pages. Harmonize labels, loading/empty/permission states, and the sibling Project Details visual system.
- **Tests:** full Client sequence across estimate approval and project link, pending/no-upload state, submitted/reviewable state, approved/read-only state, exact project-ID joining with two unequal projects, deep-link tab fallback, state retention, and regression of admin/staff tabs and other record branches.
- **Exit / spec AC:** AC1, AC2, AC4, AC5 and AC7 on the integrated screen.

### T10 — Integrated integrity review and verification *(after all writers finish)*

- **Owner:** Mode A: `integrity_reviewer`, fixes by assigned owners, then `verification_runner`; Mode B: primary agent performs the same stages sequentially. No concurrent verification against partial shared-worktree edits.
- **Integrity review:** compare the integrated diff with the approved spec and backend/web contracts: exact estimate/project/page/revision identity, immutable approval records, baseline-only approved project value, resource authorization, operation gates, stale versions, idempotency keys, page/drawing projection, private-file cleanup, query invalidation, and untouched unrelated dirty paths. Resolve confirmed findings before final verification.
- **Focused checks:**
  1. `cd mobile && npm test -- src/features/estimates src/features/annotations src/features/design/ClientSectionReview.test.tsx src/features/documents src/features/projects src/platform/annotations`
  2. `cd mobile && npm test -- src/contracts scripts/contract-drift.test.ts`
  3. `cd backend && npm test -- tests/estimate-client-decision.test.ts tests/estimate-plan-review-client.test.ts tests/estimate-design-review.test.ts tests/design-section-review.test.ts` (read-only contract regression; add replica-set lane only if backend transactional paths change).
- **Broader checks after focused results:** `cd mobile && npm run typecheck`, `cd mobile && npm test -- --runInBand`, and `cd mobile && npm run export:android`. There is no repository lint script, so do not report lint as passed.
- **Rendered/native checks:** run the app on an Android emulator/device when available and inspect Client estimate pending/approved screens, a multi-page plan and all annotation tools, 320 dp phone and tablet layouts, 2× font scale, TalkBack labels, Android back, denied/offline states, PDF reader/share handoff, and local-file release. If native execution is unavailable, state exactly which visual/gesture behavior remains unverified.
- **Hygiene:** `git diff --check`, `git status --short`, inspect every changed path and the pre-existing diff, and report generated ignored outputs without staging or committing them.
- **Exit / spec AC:** AC1–AC7 are traced to checks and actual results. The final handoff names unrun checks and risks; it does not call partially verified work complete.

## Safe parallelism and ownership boundaries

- After T1 settles the shared types/query keys, T2 (annotation), T3 (protected media), and T4 (estimate entry) can proceed simultaneously because they own different paths. T6 and T7 can then run in parallel; T5 follows T6's projection helper and may run alongside T7 and primary-owned T8. None may edit another task's files or the pre-existing dirty Project Details files.
- The primary agent owns the shared contract, all existing dirty project paths, integration, and final reconciliation. T8 and T9 are sequential primary-agent work. Child agents in Mode A must be told they share one worktree, must preserve others' edits, and must return contract discrepancies to the primary agent rather than inventing a fallback.
- In Mode B, execute the same dependency order inline with no implementation subagents. In Mode A, delegate only the bounded independent slices above. The selection is requested only after this plan is approved.

## Acceptance trace

| Spec criterion | Implemented by | Verified by |
|---|---|---|
| AC1 estimate decision and project link | T1, T4, T9 | T4/T9 tests, native pending-to-approved flow |
| AC2 exact project estimate and baseline | T1, T9 | asymmetric project tests, existing baseline regression |
| AC3 V1 page annotation and request lifecycle | T1–T3, T5 | geometry, draft, target, stale, native gesture checks |
| AC4 drawing and section review | T6, T7, T9 | review/status/history tests and native flow |
| AC5 submitted designs and approved documents | T3, T5, T8, T9 | state, pagination, viewer, PDF handoff tests |
| AC6 security, cleanup and invalidation | T1, T3–T9 | denial, cleanup, contract drift, integrity review |
| AC7 responsive, accessible and regression checks | T2–T10 | phone/tablet/font/TalkBack, typecheck, test, export |

## Actions outside this plan

No backend or web edits, dependency installation, migration, seed, production mutation, commit, push, deployment, or customer communication are authorized by this plan.

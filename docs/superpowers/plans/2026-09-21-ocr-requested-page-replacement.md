# OCR requested-page replacement — implementation plan

- Date: 2026-09-21
- Status: Draft for approval
- Classification: Substantial cross-stack workflow and persistence correction
- Source of truth: [OCR requested-page replacement design specification](../specs/2026-09-21-ocr-requested-page-replacement-design.md)

## Outcome

Add a request-scoped Designer upload path that resolves OCR pages against the immutable targets of a Client plan-change request. A successful match appends revisions to the existing drawings and advances the existing Client-visible plan page once; it does not append the revised page or unrelated pages from a full PDF to the ordinary page list.

The existing PaddleOCR `estimate_design` contract remains intact. The implementation will preserve explicit title-block values, existing taxonomy proposals, and backend title mapping, and will add regression coverage for one 2D title and one 3D/perspective title.

## Confirmed current behavior

- Annotation draft save and request submission do not create source pages, drawings, or drawing revisions.
- The submitted request already stores the stable `sourcePageId`, target `drawingId`, and `requestedRevisionId` identities required for replacement.
- `POST /estimates/:estimateId/design-uploads` has no request identity. Its OCR completion path persists every returned page as a new `EstimateDesignSourcePage`, drawing, and revision 1.
- The existing direct per-drawing replacement path preserves drawing identity and advances the original plan page, but it accepts one target and cannot safely select requested pages from a full revised PDF.
- In OCR `estimate_design` mode, every input page produces one full-page section. An explicit lower-band `TITLE:` value is preferred and preserved in `detectedTitle`; OCR fallback and taxonomy classification remain unchanged.
- The repository has no hard-coded `3D` or `perspective` classifier term. This does not block the current estimate-design path: a unique explicit title such as `LIVING ROOM 3D PERSPECTIVE` is retained verbatim and can be matched by normalized title even when its taxonomy scope is empty. Deployment-provided taxonomy aliases may still enrich its mapping.

## Fixed implementation decisions

1. Add an explicit upload-purpose discriminator with three semantic values: `ordinary`, `drawing_replacement`, and `plan_request_replacement`.
2. Keep compatibility with historical uploads by deriving the purpose when it is absent: established direct-replacement fields imply `drawing_replacement`; otherwise the upload is `ordinary`.
3. Add one request-scoped multipart route:
   `POST /estimate-plan-change-requests/:requestId/replacement-upload`.
4. Reuse the existing `estimation.drawing.replace` permission and estimate-ownership scope. The route does not grant a broader change-request administration permission.
5. Store an immutable target snapshot on the queued upload. Stable IDs are authoritative; titles and mapping tuples are evidence used by the OCR resolver.
6. Resolve all requested targets before opening the publication transaction. Inside the transaction, revalidate the request version, target state, latest revision identity, reservation, and extraction claim before writing any revision or page-manifest change.
7. Match each target by one unique normalized exact title first, then by one unique complete room/scope/catalogue tuple. Missing, duplicate, or ambiguous matches fail the whole completion.
8. Ignore and report unmatched input pages. Do not create source pages, drawings, or revisions for them.
9. Preserve internal immutable source-page records for matched replacement assets, but exclude request-scoped replacement uploads from the ordinary Client page inventory.
10. When several matched drawings share one original page, append all drawing revisions and advance that page once with one replacement patch set.
11. Keep direct per-drawing replacement as the manual fallback. Keep ordinary upload available through a clearly secondary “Add a new design page” action.
12. Do not add a schema migration or rewrite historical duplicates. New fields remain optional for old documents.

## Contract to settle before parallel implementation

The primary implementer owns this contract and must land it before backend completion and frontend integration diverge:

### Upload persistence

Extend `EstimateDesignUpload` with an explicit or compatibility-derived purpose and a nullable immutable request snapshot containing:

- `planChangeRequestId`;
- accepted request version;
- original `replacementSourcePageId`;
- idempotency key/durable upload identity;
- selected targets, each containing `drawingId`, `requestedRevisionId`, normalized detected title, and the current room/scope/catalogue mapping tuple;
- reservation state sufficient to reject a second live upload for the same target.

No title or label becomes a foreign key. The snapshot is never rewritten when labels later change.

### HTTP request and response

The multipart request contains `file`, optimistic request `version`, and an idempotency key using the repository's existing safe header/body convention. The queue response uses the existing upload status shape extended with purpose and a safe request-replacement summary.

Completion/read responses expose only presentation-safe data:

- matched target identifiers and titles;
- match reason (`normalized_title` or `mapping_tuple`);
- ignored page numbers/count;
- retryable missing/ambiguous failure category;
- resulting revision IDs and target state where the actor may already read them.

They must not expose storage references, claim tokens, raw image bytes, or private URLs.

### Result semantics

Add `plan_request_replacement` to the backend's internal result-mode resolution. Do not change the OCR worker payload schema. Ordinary and direct-replacement validation remains exactly as strict as it is today.

The resolver receives the immutable target snapshot and normalized worker result and returns either:

- a complete one-to-one target/page match set plus ignored page metadata; or
- a typed missing/duplicate/ambiguous failure with no persistence writes.

### Client-visible page invariant

Ordinary page-list queries must select only ordinary uploads. Direct and request-scoped replacement source pages are history assets, not additional Client plan pages. Legacy derivation must preserve the current treatment of old direct replacements.

## Dependency graph

```text
T00 baseline and regression fixture
  -> T01 shared contract and pure matching rules
      -> T02 request-scoped queue, persistence, authorization, API
          -> T03 transactional OCR completion and lifecycle handling
      -> T04 frontend request-upload workflow
      -> T05 OCR 2D/3D preservation tests
T02 + T03 + T04 + T05
  -> T06 integrated regression and rendered UX verification
      -> T07 integrity review
          -> T08 final verification and handoff
```

T04 and T05 may proceed in parallel after T01. T03 starts after the queue/persistence contract in T02 is stable. In execution Mode A, writers receive the non-overlapping ownership below; in Mode B, the primary implementer performs the same tasks sequentially.

## Ownership boundaries

### Primary implementer

- Own the cross-stack contract, shared identifiers, task sequencing, and final integration.
- Resolve any contract change before implementation slices continue.
- Inspect the initial dirty-path set and per-target diffs before assigning or editing files.
- Do not let frontend or OCR work invent a second matching or upload-purpose contract.

### Backend implementation slice

Own only:

- `backend/src/domain/estimate-design.ts`
- `backend/src/domain/estimate-design-mapping.ts`
- `backend/src/domain/estimate-plan-review.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/models/EstimateDesignUpload.ts`
- `backend/src/models/EstimateDesignSourcePage.ts` only if an index/query helper is required
- `backend/src/models/EstimatePlanChangeRequest.ts`
- `backend/src/services/estimate-design.service.ts`
- `backend/src/services/estimate-plan-review.service.ts`
- `backend/src/services/estimate-design-upload-deletion.ts`
- `backend/src/routes/estimate-plan-review.ts`
- `backend/src/openapi.ts`
- `backend/src/app.ts` only for necessary wiring
- focused backend tests and fixtures for this workflow

Do not change frontend or OCR worker files.

### Frontend implementation slice

Own only:

- `frontend/src/api/types.ts`
- `frontend/src/features/leads/estimateDesignApi.ts`
- `frontend/src/features/leads/EstimatePlanChangeRequests.tsx`
- `frontend/src/features/leads/EstimateDesignUploads.tsx`
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx`
- `frontend/src/features/designer/ProjectWorkspace.tsx` only if it composes the affected controls
- existing relevant stylesheet files
- focused frontend tests for these components

Do not alter backend route shapes after T01; raise a contract conflict to the primary implementer.

### OCR implementation slice

Own only:

- `ocr-worker/tests/test_title_block.py`
- `ocr-worker/tests/test_extractor.py`
- `ocr-worker/tests/test_estimate_taxonomy.py` if taxonomy preservation needs a focused assertion
- `ocr-worker/tests/test_worker.py` or contract fixtures only when needed to prove the unchanged worker result
- OCR source files only if a regression test demonstrates that the currently accepted explicit title is lost

The expected outcome is regression coverage without classifier redesign. Do not broaden default title acceptance or change the worker/backend result contract without primary-owner review.

### Review and verification

- The integrity reviewer performs a read-only cross-stack check after all writers finish.
- The verification runner executes final checks against the integrated worktree after review findings are resolved.

## Tasks

### T00 — Capture baseline and encode the failing workflow

**Depends on:** approved plan and selected execution mode.

**Work**

1. Record `git status --short`, the initial dirty-path set, and relevant pre-change diffs. Preserve the approved spec and plan and all unrelated work.
2. Add a focused backend regression that constructs an ordinary upload made while a plan-change request is open and proves current ordinary completion appends a new page/drawing rather than replacing the request target. Mark the desired request-scoped behavior in a separate failing test so the bug and correction are independently visible.
3. Record pre-action counts and identities for source pages, drawings, drawing revisions, plan-page revisions, request targets, audits, and notifications.
4. Add or extend a frontend test that captures the current ambiguity: the ordinary upload action is presented alongside an open Client request without an explicit “new page” distinction.
5. Confirm the current OCR title-block fixture preserves arbitrary explicit title text; do not run model-dependent tests.

**Acceptance**

- The failing test demonstrates the extra-page path through ordinary completion.
- Baseline assertions prove annotation draft save and request submission do not change source-page, drawing, or revision counts.
- No production data, fixture database outside the test harness, or external storage is mutated.

### T01 — Define upload purpose, snapshot, and deterministic matcher

**Depends on:** T00.

**Work**

1. Add typed upload-purpose and request-snapshot shapes with explicit compatibility derivation for legacy documents.
2. Define a pure target/page resolver in the backend domain layer. Reuse the existing title normalization and `autoMapDrawingTitle` output rather than reimplementing taxonomy logic.
3. Require one-to-one matching:
   - collapse whitespace/case/punctuation through the established normalizer;
   - accept a normalized title only when it uniquely identifies one open snapshot target and one OCR page;
   - use the mapping fallback only when the complete configured room/scope/catalogue tuple is present and uniquely identifies both sides;
   - reject missing, duplicate, multi-target, or multi-page ambiguity;
   - return unmatched OCR pages as ignored metadata.
4. Add table-driven domain tests for exact match, normalized spelling/case, unique tuple fallback, changed title without a complete tuple, duplicate titles, duplicate tuples, missing target, unrelated pages, and two distinct requested targets.
5. Freeze the API request/response types used by T02 and T04.

**Acceptance**

- Matcher output is deterministic and independent of array order.
- A title never substitutes for `requestId`, `sourcePageId`, `drawingId`, or `requestedRevisionId`.
- All requested targets must match before publication can begin.
- Ordinary and direct-replacement mode derivation remains backward compatible.

### T02 — Queue a request-scoped replacement safely

**Depends on:** T01.

**Work**

1. Extend `EstimateDesignUpload` with nullable purpose/request-snapshot fields and indexes needed to prevent more than one live reservation for the same target. Use a transactional or uniquely enforceable reservation; do not rely on a preflight query alone.
2. Add `POST /estimate-plan-change-requests/:requestId/replacement-upload` with the same file-signature, MIME, size, page/pixel, authenticated-storage, and cleanup rules as existing estimate-design uploads.
3. Reuse `estimation.drawing.replace` and the existing estimate-ownership guard. Synchronize the canonical operation registry, authorization contract, Super Admin behavior, and OpenAPI request/response inventory.
4. In one authoritative queue operation, validate:
   - request and estimate identity;
   - open request status and optimistic request version;
   - at least one assigned open target;
   - each target's latest revision equals the stored requested revision;
   - the source page is the request's original page;
   - no target has a live request-scoped reservation;
   - idempotency replay returns the original upload.
5. Persist the immutable target snapshot and queue the existing `estimate_design` worker job. Keep lease, heartbeat, token, retry, and manual-review behavior unchanged.
6. Audit only safe metadata: request/source/target IDs, upload ID, actor, accepted version, and target count.
7. Extend deletion/cancellation handling so removing a request-scoped replacement releases its reservation and never deletes or withdraws the original ordinary page/upload.

**Tests**

- Route validation and multipart failure cleanup.
- Ownership/role asymmetry and Super Admin policy.
- Stale request version, closed request, unassigned request, stale target revision, and wrong estimate.
- Concurrent queue attempts allow one reservation.
- Same idempotency key returns the same upload without duplicate job/audit/notification writes.
- Deletion/cancellation preserves the original page and request history.
- Route-operation and OpenAPI inventory tests.

**Acceptance**

- A queued job contains stable request-target identity sufficient for completion after labels or UI state change.
- No unauthorized actor or stale request can reserve a target.
- Storage objects are removed if metadata/job persistence fails.

### T03 — Publish matched revisions and one page update atomically

**Depends on:** T02.

**Work**

1. Extend worker-result mode resolution with `plan_request_replacement`, leaving the worker payload unchanged.
2. Apply existing normalized-result validation and resource limits before matching. Build the complete match set outside the transaction; reject any missing or ambiguous target before creating records.
3. In a Mongo transaction with claim/result idempotency and CAS checks:
   - re-read and validate the upload snapshot, request version/status, target status, latest drawing revisions, source-page identity, and reservations;
   - create internal replacement source pages only for matched OCR pages;
   - append one immutable drawing revision per existing `drawingId` with `replacesRevisionId` set to the snapshotted requested revision;
   - preserve the target's mapping tuple and mark the drawing unverified for Designer review;
   - group matches by original `sourcePageId` and advance each plan page once with all replacement patches while preserving every unrelated patch;
   - transition targets to `replacement_submitted` with `resolvedByRevisionId` only after revision/page writes are ready to commit;
   - persist match reasons and ignored-page metadata on the safe upload result/audit shape;
   - release reservations as part of the committed terminal state.
4. Make ordinary page-list queries explicitly purpose-aware so internal request replacement pages never appear as additional Client pages.
5. Preserve retry identity: retries reuse the same upload, job lineage, snapshot, and result idempotency key.
6. Treat stale request/target state discovered at completion as a safe failed or superseded outcome with no partial publication. Apply compensating storage cleanup according to existing retryability rules.
7. Extend original-upload deletion/withdrawal behavior to cancel dependent live request-scoped work without deleting committed immutable history.

**Tests**

- Image replacement of one target keeps Client page count/order/sourcePageId stable and increments only the target drawing revision.
- Full PDF matches one requested title, ignores unrelated pages, and creates no ordinary pages for them.
- Distinct 2D and 3D target titles match two targets atomically.
- Several targets on one source page create one new plan-page revision containing all changed patches.
- Missing/duplicate/ambiguous titles and incomplete/ambiguous tuples publish nothing.
- Transaction rollback leaves counts, latest pointers, target states, audits, and notifications unchanged.
- Stale request, withdrawn request, newer drawing revision, deletion, approval, and concurrent completion fail safely.
- Replayed result/claim and retry produce one durable set of revisions, page revision, audits, and notifications.
- Ordinary upload and existing direct replacement regression suites remain green.
- Replica-set tests cover transactional completion and queue/completion races.

**Acceptance**

- The only Client-visible change is the original page advancing to a new page revision with updated requested patches.
- Unrequested PDF pages are recorded only as ignored result metadata.
- No partial multi-target replacement can commit.

### T04 — Make request upload the primary Designer workflow

**Depends on:** T01 for contract; integrates against T02.

**Work**

1. Add frontend API types and a multipart mutation for the request-scoped replacement route.
2. In `EstimatePlanChangeRequests`, show one primary revised-file upload for each open assigned request, alongside:
   - marked/current page context;
   - Client summary;
   - requested drawing titles and target states;
   - accepted file constraints;
   - queue/extraction progress;
   - matched target and ignored-page result;
   - missing/ambiguous failure and retry guidance.
3. Retain the existing per-drawing replacement controls as the manual fallback for changed or unreadable titles.
4. In `EstimateDesignUploads`, when unresolved Client requests exist, collapse the ordinary uploader behind a secondary “Add a new design page” control with copy explaining that it appends a page. Preserve the normal primary uploader when there is no open request.
5. Prevent double submission while the request mutation is pending and preserve selected-file validation, keyboard operation, focus visibility, live progress semantics, and accessible error/status announcements.
6. On queue, retry, completion, failure, or deletion, invalidate/update every affected query: change-request queue/detail, estimate design workspace, plan workspace/page, workflow status, review data, and ordinary upload list.
7. Ensure compact/mobile layout keeps the requested targets, primary action, and status readable without horizontal overflow.

**Tests**

- Primary request upload uses the request route, version, and file.
- Ordinary upload is labelled as an intentional new-page action during an open request.
- Pending state blocks duplicate submit and exposes progress accessibly.
- Success renders matched and ignored counts without storage data.
- Missing/ambiguous failure renders a retry/manual-fallback path.
- Required query invalidations occur for success and failure transitions.
- No-open-request and existing direct-replacement behavior remain intact.
- Designer task page/project workspace composition does not render duplicate primary request controls.

**Acceptance**

- A Designer answering Client feedback has one clear primary replacement action.
- Intentionally adding a new page remains possible and explicit.
- Loading, empty, error, retry, success, responsive, keyboard, and accessible-name states are covered.

### T05 — Lock existing 2D/3D OCR title behavior

**Depends on:** T01; may run in parallel with T02/T04.

**Work**

1. Add non-model fixtures for explicit lower title-block values:
   - 2D: `LIVING ROOM FLOOR PLAN`;
   - 3D: `LIVING ROOM 3D PERSPECTIVE`.
2. Prove the PDF embedded-text path and raster OCR title-band fallback each preserve the display title and emit one full-page estimate-design section.
3. Prove the worker result retains each `detectedTitle` and any existing taxonomy proposal without filtering the 3D page because the default drawing-term list lacks a literal 3D term.
4. Add an integration fixture at the backend normalization boundary showing both titles remain eligible for exact normalized request matching.
5. Re-run existing exclusions for legends, key plans, notes, dimensions, schedules, and ambiguous headings.
6. Change OCR source only if these preservation tests expose an actual regression. Any source change must preserve the worker contract and existing model-independent fixtures.

**Acceptance**

- Both titles survive extraction and worker serialization.
- The 3D fixture remains matchable by normalized title even if no scope mapping is configured.
- No default classifier vocabulary is broadened without evidence and contract review.

### T06 — Integrate and verify the complete workflow

**Depends on:** T02, T03, T04, T05.

**Work**

1. Reconcile shared types and final diffs; remove any duplicate resolver or incompatible fallback.
2. Run an integrated test from Client annotation draft through request submit, Designer request upload, worker completion, and Client plan reread.
3. Assert before/after identities and counts:
   - draft save/request submit do not add pages/drawings/revisions;
   - matched completion adds only expected internal matched pages and drawing revisions;
   - ordinary Client page count/order and original `sourcePageId` remain stable;
   - one plan-page revision advances the page;
   - request targets transition only after commit;
   - ignored full-PDF pages create no source-page/drawing/revision records.
4. Run rendered Designer UX checks at representative mobile, tablet, laptop, and desktop widths. Exercise open request, uploading, success with ignored pages, ambiguous failure, and explicit new-page disclosure.
5. Check browser console and network activity for request-route errors, duplicate requests, stale invalidations, and inaccessible controls.

**Acceptance**

- The end-to-end regression reproduces the original trigger and proves the page is replaced in lineage rather than appended.
- The UI and API agree on every terminal state.
- No unrelated working-tree paths are reformatted or overwritten.

### T07 — Cross-stack integrity review

**Depends on:** T06.

Review the integrated result for:

- authorization and non-disclosure across Designer, Manager, Head, Client, Sales, and Super Admin roles;
- stable ID lineage and title-only matching evidence;
- immutable revision and plan-page history;
- one-to-one matching, multi-target atomicity, and mapping-tuple completeness;
- reservation, CAS, idempotency, claim/result replay, and concurrent retry races;
- storage cleanup and deletion/withdrawal behavior;
- request target, audit, notification, and query-cache consistency;
- compatibility of historical uploads and existing direct replacements;
- unchanged OCR lease/result contract and 2D/3D title preservation;
- absence of a hidden ordinary-page path in the request UX.

Any material finding returns to its owning task and must be reverified before T08.

### T08 — Final verification and handoff

**Depends on:** T07 findings resolved.

Run the smallest focused checks first, then the complete required lanes once on the integrated tree.

## Verification commands

### Backend focused

```bash
cd backend
npm test -- tests/estimate-plan-review-models.test.ts tests/estimate-plan-review-client.test.ts tests/estimate-plan-review-staff.test.ts tests/estimate-plan-composite.test.ts
npm test -- tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts tests/estimate-design-upload-delete.replica-set.test.ts tests/estimate-plan-request-replacement.replica-set.test.ts
npm test -- tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
```

If the implementation adds the replica-set test under a different focused filename, use that exact filename and record it in the handoff.

### Backend complete

```bash
cd backend
npm run typecheck
npm test
npm run build
```

### Frontend focused

```bash
cd frontend
npm test -- src/features/leads/EstimatePlanChangeRequests.test.tsx src/features/leads/EstimateDesignUploads.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
```

Include `ProjectWorkspace`'s focused test if its composition changes.

### Frontend complete

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

### OCR focused and complete

```bash
cd ocr-worker
.venv/bin/python -m pytest -m "not model" tests/test_title_block.py tests/test_extractor.py tests/test_estimate_taxonomy.py tests/test_worker.py tests/test_contract_fixture.py
.venv/bin/python -m pytest -m "not model"
```

### Repository hygiene

```bash
git diff --check
git status --short
```

There is no repository lint script; do not report lint as run. Model-dependent PaddleOCR tests are not part of the default lane and must be listed as unrun unless explicitly executed in a prepared model environment.

## Acceptance-criteria traceability

| Specification acceptance criterion | Implemented by | Primary evidence |
| --- | --- | --- |
| Draft/request save does not add pages or revisions | T00, T06 | Backend count/identity regression |
| One request-scoped image replaces existing drawing/page lineage | T02, T03 | Service and replica-set completion tests |
| Full PDF ignores unchanged pages | T01, T03, T06 | Resolver tests plus integrated count assertions |
| Distinct 2D/3D targets replace atomically | T03, T05 | OCR fixtures and multi-target transaction test |
| Missing/duplicate/ambiguous title publishes nothing | T01, T03 | Pure resolver and rollback tests |
| Stable IDs remain authoritative | T01, T07 | Domain assertions and integrity review |
| Original source page advances once | T03, T06 | Page-manifest identity/revision assertions |
| Target status changes only after commit | T03 | Transaction rollback and success tests |
| Existing workflows remain compatible | T02, T03, T04 | Ordinary/direct replacement regression suites |
| OCR preserves 2D/3D titles and exclusions | T05 | Non-model worker tests |
| Concurrent/stale/replayed work yields one outcome | T02, T03 | Replica-set race/idempotency tests |
| Designer UX makes replacement primary | T04, T06 | Component tests and rendered interaction checks |
| Required checks and hygiene pass | T08 | Exact command results in final handoff |

## Rollback and operational boundaries

- No production migration, backfill, seed, deployment, commit, or push is authorized by this plan.
- The schema change is additive and nullable. Rolling back application code leaves historical records readable through compatibility derivation; queued `plan_request_replacement` uploads must not be processed by older code during rollback.
- Before deployment in a later authorized operation, drain or pause OCR jobs across mixed application versions so a new-purpose job cannot reach an old completion handler.
- Existing historical duplicate pages remain unchanged. Cleanup requires a separate migration specification with backup, dry run, conflict report, idempotency, and explicit approval.
- Final handoff must list exact changed files, checks and results, checks not run, temporary QA artifacts, external actions not performed, and any remaining risk.

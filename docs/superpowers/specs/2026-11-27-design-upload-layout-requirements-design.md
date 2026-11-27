# Design uploads follow the Client's execution choice

Date: 2026-11-27
Status: Approved; implementation authorized in Mode A
Classification: Substantial; upload contracts, persistence, authorization, and immutable review history

## Goal and confirmed decisions

Use the Client's permanently saved execution choice to determine which layout files the Designer uploads and submits for Client review.

| Saved choice | Required layout uploads | Allowed new layout uploads |
| --- | --- | --- |
| Option 1: 2D layout → 3D layout → Selections → Renders → Production | At least one 2D upload and at least one separate 3D upload | 2D and 3D |
| Option 2: 3D layout → Renders → Selections → Production | At least one 3D upload | 3D only |

The user explicitly confirmed:

- **Separate 2D and 3D uploads.** A single upload cannot satisfy both requirements.
- **Label existing draft files once and reuse them.** Approved designs remain unchanged.

This request extends the earlier [permanent execution-choice feature](2026-11-27-client-execution-path-design.md) with layout-upload requirements. It does not introduce ordered completion gates for every execution phase.

## Current behavior and evidence

Investigation used the current working tree, which already contains the two preceding features. Their 42 dirty paths must be preserved. No product code was changed during this specification stage.

- `backend/src/contracts/project-execution-choice.ts` defines the exact options and phase IDs. `backend/src/domain/project-execution-choice.ts` validates the saved record/history and projects its permanent state. This is the authoritative choice, not a Designer-entered setting.
- `backend/src/models/EstimateDesignUpload.ts` stores file identity, ownership, extraction state, and upload `purpose`; it has no 2D/3D classification. `purpose` distinguishes ordinary uploads, drawing replacements, and requested-plan replacements and must keep that meaning.
- `POST /estimates/:estimateId/design-uploads` in `backend/src/routes/estimate-designs.ts` accepts a validated file and passes it to `estimate-design.service.ts`. The service checks editable ownership/workflow, stores the file, and transactionally persists upload/job/audit metadata with compensating file cleanup.
- `estimate-design.service.ts` has separate drawing and requested-page replacement paths, manual drawings, retries, and deletion. `submitDrawings` checks current revisions, extraction, mappings, and existing workflow gates inside a transaction. It currently has no layout-type coverage check.
- `assertEstimateDesignWorkflowAllowed` deliberately exempts Sales drawings prepared before commercial approval. That existing pre-approval flow is distinct from the post-approval Designer workspace.
- `estimate-plan-document-manifest.ts` and the plan-document domain construct current PDFs from original upload/page identities and replacement revisions. Coverage must follow this lineage, not simply count all uploaded files.
- `project-workflow.service.ts` prepares immutable `DesignPlanReviewRound` attachments, revision IDs, and document-manifest references. Historical delivery retries use those stored artifacts.
- Web `EstimateDesignUploads.tsx` currently has one generic file input and Client-review readiness controls. Native `EstimateDesignPreparation.tsx` and `DesignFileUpload.tsx` expose equivalent upload/replacement actions; their API models validate responses.
- Existing upload, extraction, review, deletion, plan-document, workflow, web upload, and native preparation tests provide regression seams. The new choice-conditioned requirements are not implemented yet.

## Recommended approach and scope

Add an explicit layout type to each original layout upload, separate from its existing upload purpose. The backend derives allowed and required types from the project's saved choice, returns readiness to consumers, and enforces it again at upload/classification and review-submission boundaries.

The user's separate-file decision rules out a combined-PDF shortcut. File-level classification fits the current upload/page lineage and avoids introducing page-level classification or changing OCR extraction behavior.

Included:

- Post-approval Designer layout uploads on web and native.
- One-time labeling of eligible existing drafts.
- Type preservation through retries, manual drawings, and replacements.
- Current layout coverage, submission enforcement, and immutable classification snapshots for new review rounds.
- Relevant Client/staff labels, API contracts, authorization inventory, and regression coverage.

Excluded:

- New 3D model/CAD formats, viewers, or automatic visual recognition of 2D versus 3D. A 3D layout is a document/image using the currently supported formats.
- New Renders, Selections, Production, or sequential phase-completion workflows.
- Changes to pricing, quotations, payments, deadlines, assignment rules, or the permanent choice itself.
- Automatic classification, bulk backfill, deletion of old files, or changes to issued PDFs and historical approvals.

## Product behavior

### Saved choice and upload availability

1. Resolve the current estimate's project by stable IDs and validate that project's persisted execution choice. Never use another assignment, estimate, cached default, or filename as the source.
2. For a post-approval Designer upload, require a valid saved choice before creating a new layout upload or labeling an existing draft. With no choice, display **Waiting for the Client to choose an execution path**. With missing/inconsistent choice data, display unavailable and offer refresh.
3. Existing documents remain readable within existing access rules while awaiting a choice. Existing submitted review rounds and their decisions remain usable under their current contracts.
4. Pre-approval estimate/Sales uploads retain their current behavior. When such an untyped file becomes part of an editable post-approval design, use the explicit draft-labeling flow below.
5. Option 1 shows **2D layout** and **3D layout** upload groups. Option 2 shows only **3D layout**. The backend rejects a 2D upload for Option 2, including a direct API request.

### Separate uploads and readiness

1. Each file has exactly one type: `layout_2d` or `layout_3d`. The group fixes the type sent with the upload; a file cannot be marked as both. Multiple files for the same type are allowed.
2. Each required group may be uploaded separately. Option 1 does not require both files in one request or force 2D to finish before 3D can be uploaded, beyond existing extraction/concurrency restrictions.
3. Show the selected execution option, required types, saved files, and clear missing/processing/review states. For example: **2D layout missing** or **3D layout uploaded; drawing review pending**.
4. Before a new Client-review submission, Option 1 needs qualifying current content from at least two distinct original uploads, one per type. Option 2 needs qualifying current 3D content and allows no new 2D content in that design set.
5. Coverage is computed from non-deleted original uploads that contribute active current drawings/revisions and the prepared review documents for this estimate. Empty files, failed extraction, superseded or removed content, deleted uploads, foreign estimates, and stale historical revisions do not satisfy a requirement.
6. Pending extraction or incomplete mapping/verification/prepared PDFs still blocks submission under existing rules. A layout being present must not bypass those checks. Conversely, a missing 2D layout never blocks Option 2.
7. Enforce the same requirement in the actual submission transaction, including review-round preparation, rather than trusting an enabled UI button or a previous readiness read.
8. Layout type is a Designer declaration. The system validates its permitted value and lineage; it does not certify document contents through image recognition.

### Existing drafts

1. Missing classification remains explicitly **Layout type not set**. Do not infer a type from the filename, MIME type, crop, upload order, or execution option.
2. An active, currently assigned Designer with existing upload authority can label an eligible unclassified draft once. Show only the types allowed by the saved choice. Require an explicit selection and confirmation; do not silently default an old file to 3D.
3. Reuse current estimate editability, lifecycle/version checks, and authoritative ownership. Do not label a deleted upload, an unrelated project's file, a frozen design, an upload protected by approved content, or a file currently locked in a submitted review.
4. Persist the category, actor, server timestamp, and choice lineage with an audit event. The first assignment is permanent for that original upload. A retry cannot produce another audit or change the category; a competing different type conflicts.
5. Classification does not change file bytes, crops, drawing mappings, or OCR jobs. If a Designer selected the wrong category, use the established eligible-delete/re-upload flow; this feature adds no relabel override.
6. Existing unclassified editable content must be labeled before it can count toward a new review. For a 3D-only choice, an unwanted unapproved 2D file must not be mislabeled to satisfy the rule; existing removal rules remain available where permitted.
7. Already approved or issued historical content remains immutable and readable. It is not retroactively labeled or counted as a newly required typed layout. If further design work is reopened, newly required content must be supplied in typed uploads; historical approved references can remain attached without satisfying current coverage. This compatibility exception must be based on proven historical approval, never merely on a missing type.

### Replacements, deletion, and retries

- A drawing replacement or requested-page replacement inherits the original layout's type. The caller cannot use replacement to convert a 2D layout into 3D or bypass Option 2 restrictions.
- Resolve replacement/manual-drawing type through the authoritative original upload/page lineage. A replacement is not an additional original layout and cannot satisfy the other group.
- If an editable original draft is unclassified, require its explicit one-time labeling before replacement. Inherited legacy records need not be mass-rewritten; missing/mismatched lineage must produce a clear conflict rather than guessing.
- Preserve existing approved legacy replacement behavior only as historical continuation; it cannot manufacture typed coverage or reopen/change immutable approval records.
- Recompute requirements after upload, classification, extraction, replacement, removal, and deletion. Removing the last qualifying 2D layout makes Option 1 incomplete; removing unrelated content must not change another project's readiness.
- Keep existing retry/idempotency and storage-compensation semantics. An uncertain ordinary file upload must not be silently retried as a new file.

## Data, API, and permission impacts

### Persistence and source of truth

- Add optional layout classification metadata to original upload records: stable `layoutType`, classification actor/time, and the immutable choice's event/definition lineage where applicable. Absence represents an unclassified legacy file, not a default type.
- Keep the existing `purpose` enum and leased extraction-job protocol unchanged. Worker results cannot override layout classification.
- Enforce one-time assignment with a conditional update and lifecycle/version guard in the existing Mongo transaction. New uploads persist their category atomically with upload/job/audit metadata.
- New review rounds snapshot the applicable choice, required types, and the original upload/document identities that satisfy them. Snapshot attachment categories so historical views and delivery retries do not derive labels from mutable current state.
- Classification changes must invalidate current readiness/prepared-document identity as appropriate. Preserve existing manifest versions and immutable stored document bytes; old rounds are read using their original snapshots.

### HTTP and shared contracts

- Extend the existing ordinary multipart upload contract with `layoutType`. It is required for applicable post-approval Designer uploads and validated against the saved choice before storage and again before metadata commit. Preserve pre-approval compatibility.
- Add a bounded one-time classification operation, proposed as `PATCH /estimate-design-uploads/:uploadId/layout-type`, with a strict payload containing `layoutType`, expected design-plan version, and an idempotency key. A repeat of the same authorized command returns the saved classification; conflicting requests return 409.
- Extend the authorized design-workspace response with upload layout labels and a backend-derived requirement projection: applicability/choice availability, allowed/required types, per-type current coverage, unclassified editable files, missing types, and safe blocking reasons. Distinguish layout coverage from complete submission readiness.
- Expose no storage references or additional Client data. Keep stable IDs through upload, replacement, requirement, review, and audit records.
- Keep web/mobile types, runtime validation, OpenAPI, protected-route registry, and operation manifests aligned. Reuse existing upload permission rather than introducing new role grants. Older clients cannot bypass the server requirement by omitting the new field.

### Permission matrix

| Actor | Read labels/requirements | Upload or label drafts | Change permanent choice/type |
| --- | --- | --- | --- |
| Active assigned Designer | Existing estimate/project access | Existing upload authority and editable state; permitted types only | Never |
| Other authorized staff | Existing access | Existing pre-approval behavior only; no new post-approval override | Never |
| Client | Existing submitted-design/round access | No | Existing execution-choice rules only; no saved-choice changes |
| Super Admin / representative | Existing operation-specific read scope | No personal Designer-action override | Never |
| Unrelated/inactive identity | Denied under existing rules | Denied | Never |

Authorization must be checked again before returning idempotent results. Wrong-estimate/project identifiers retain the application's non-disclosing not-found/forbidden behavior.

## UI states and accessibility

- Reuse the existing design-upload components and controls; do not add a second project picker or restore the removed Designer sidebar.
- Place a concise **Required layouts** summary above the upload controls. Option 1 presents two labeled groups; Option 2 presents one. Use explicit button/input names such as **Upload 2D layout** and **Upload 3D layout**.
- Label saved upload rows and relevant prepared review documents. Historical untyped files must not be presented as if they had a recorded category.
- Support loading, no choice, unavailable choice, missing file, uploading, extraction failure/retry, incomplete review, ready, read-only, denied, stale-version, and uncertain-result states. A failed refresh must never enable an unsupported upload or submission.
- Refresh every affected workspace, document-readiness, workflow/task, and Client-review query after mutations. Reset drafts/file selections on project, estimate, identity, or native session changes; preserve existing denial handling.
- Keep keyboard-accessible labels, focus management for one-time classification confirmation, upload status announcements, and native accessibility states. The groups must fit 1440, 768, and 390px widths without introducing overflow or adding motion.

## Compatibility, rollout, and operations

- Schema changes are additive. No automatic migration, guessed backfill, or read-time writes. Explicit one-time draft labeling is a normal authorized application mutation, not a bulk migration.
- Existing Client decisions, issued/approved PDFs, review-round artifacts, and historical delivery retries must remain unchanged. New submission checks apply when starting a new post-approval review, not retroactively to completing an already stored review round.
- Existing Sales/pre-approval design preparation remains compatible. Missing/invalid choice data in the applicable Designer flow fails closed with an actionable explanation.
- Ship backend validation/contracts together with updated web/native consumers. During a partial rollout, older applicable upload clients may receive a validation error and need updating; do not silently accept an untyped post-approval upload to mask incompatibility.
- A rollback must preserve categories and review snapshots. Do not deploy old writers that drop metadata or disable enforcement while the UI still promises required layouts; prefer a forward fix.
- Keep publication independent from email delivery: incomplete layouts produce no submitted revisions, review round, or email; a successful complete submission retains the existing queued/disabled/failed/sent delivery and stored-artifact retry behavior.
- No dependency, seed, backfill, live migration, deployment, commit, push, production mutation, or actual customer communication is authorized by this spec.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Option 1 offers separate 2D/3D uploads; Option 2 offers only 3D. | Shared definitions plus rendered web/native controls with both exact choices. |
| AC2 | Allowed category and valid saved choice are enforced server-side; no default or foreign-project source can bypass them. | Strict multipart/service tests, absent/malformed choice, omitted/invalid category, Option 2 direct 2D rejection, asymmetric projects. |
| AC3 | Option 1 cannot submit with either type missing; Option 2 submits without 2D once existing checks pass. | Complete/incomplete coverage matrix through HTTP/service and replica-set review submission. |
| AC4 | Categories survive reload, extraction, manual drawings, retry, and replacements without counting a replacement as another layout. | Upload/replacement lineage and worker-result regressions; no worker-protocol change. |
| AC5 | Existing eligible drafts can be labeled exactly once, with ownership, audit, CAS/idempotency, and concurrency protection. | Two Designers/projects; same-command retry; competing types; audit failure rollback; approved/submitted/frozen/deleted/foreign-file denial. |
| AC6 | Coverage uses current content and cannot be satisfied by empty, failed, deleted, superseded, foreign, or stale data. | Unequal upload/revision fixtures, partial approval, deletion/replacement races, prepared-document mismatch. |
| AC7 | Historical approved designs and review/email artifacts are unchanged; missing legacy types are explicit. | Old-round reads and retries, approved-file classification rejection, editable legacy classification, pre-approval flow regression. |
| AC8 | Failed/conflicting saves and concurrent upload/delete/submit leave no partial files, jobs, classification, audits, or review publication. | Storage compensation and Mongo replica-set transactional tests; current lifecycle lock preserved. |
| AC9 | Web/native loading, errors, denial, progress, read-only, and project/session changes remain safe and understandable. | Rendered interaction and cache-invalidation tests; disabled submit and accessible classification confirmation. |
| AC10 | Contracts and user-facing layouts stay aligned without unrelated regressions. | OpenAPI/operation checks, backend/frontend/native typechecks and applicable builds, focused/broader tests proportionate to changes, browser widths, native export, final diff review. |

Relevant existing lanes include `estimate-design-upload`, `estimate-design-extraction`, `estimate-design-review`, `estimate-design-audit`, upload deletion replica-set tests, plan-document lineage/service tests, project-workflow replica-set tests, web `EstimateDesignUploads.test.tsx` and Designer workspace tests, and native design preparation/API tests. Changed transactional paths require replica-set evidence. Record actual commands/results in the later task plan; this specification makes no implementation/test-pass claim.

## Assumptions and approval boundary

- Confirmed: separate 2D/3D uploads and one-time labeling of existing drafts.
- Proposed default: require the Client's valid saved choice before new post-approval layout uploads/classification and new review submission; leave existing review rounds and pre-approval uploads intact.
- Proposed default: require at least one qualifying original upload per required type across the design set, not a new requirement for every room/item. Existing mapping/room checks still apply.
- Existing document/image formats remain the supported representation of both layout types.
- No unresolved user decision remains for this bounded specification. Under repository `AGENTS.md`, the next stage after approval is a separate task plan; this stage creates only this specification.

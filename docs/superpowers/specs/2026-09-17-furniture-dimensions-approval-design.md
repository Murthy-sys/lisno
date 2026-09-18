# Furniture dimensions: correction and Client approval

## Decision, authority and evidence
The user requests a Client send-back option, entered dimensions alongside furniture uploads, and Client approval before onward work. Standing autonomous Mode A authority applies; do not reopen approval gates. Local changes and verification only.

Current state: Designer declares required rooms; Client accepts; Client uploads a file or grants permission to proceed. `uploadedAt || proceed` immediately marks rooms ready and may complete the stage. There is no structured measurement or return/review record. Mongo stages/history use Mixed values and full-state version/CAS; memory follows the same repository contract. Final design submissions converge on workflowSubmissionBlockers. Draft design preparation deliberately uses a separate upload phase.

## Product behavior and actors
1. Designer declares room applicability. Client sees requirements/evidence and can Accept or Send back. Send back requires a reason, disables acceptance until Designer resubmits, and keeps the saved choices prefilled.
2. After scope acceptance, assigned Designers and existing authorized Client uploaders may submit dimensions and a supporting document for selected required rooms. Each room contains one or more furniture items: item name, length, width, height and unit (mm, cm, m, in, ft). Measurements must be finite positive numbers; IDs, names, units and room memberships are validated. Upload does not approve anything.
3. Client reviews the submitted measurements and document, selecting pending rooms to Approve dimensions or Send back. Both actions identify exact current submission event IDs. Send back requires a correction reason visible to the project team.
4. Returned room entries reopen prefilled for correction and a new document/submission. Revision number increments; old measurements, files, decisions and reasons remain in immutable history. Approved rooms cannot be overwritten or sent back through this workflow.
5. Only the latest explicitly approved dimensions make a required room ready. All required rooms must be ready to complete the stage. Existing mapped-room final submission rules apply to the rooms included in that submission. New permission-to-proceed bypasses are unavailable and rejected server-side.
6. No-furniture/all-nonrequired scope completes after Client scope acceptance. Already-completed legacy stages/history remain valid. UploadedAt-only or proceed-only rooms in incomplete legacy stages need dimensions submission and explicit approval; no automatic approval/backfill. Draft design uploads remain available under existing prerequisites, but Client-facing final submission remains blocked for unapproved required rooms.

## Contract
New action IDs: `furniture_scope_return`, `furniture_dimensions_approve`, `furniture_dimensions_return`. Keep existing furniture_upload ID but accept structured `data.rooms: [{roomId, items:[{id,name,length,width,height,unit}]}]` plus required proof. Existing roomIds-only uploads must fail validation with an actionable message, never silently approve. Scope return has empty data and required note. Dimension approve/return use `data.submissions: [{roomId,submissionEventId}]`; return uses required note.

Add `WorkflowRoom.dimensions?: {submissionEventId, revision, status: pending|changes_requested|approved, items, submittedAt, reviewedAt?, returnReason?}` and `WorkflowStageState.scopeReturn?: {reason,at}`. Actor identity and exact data are retained in immutable action events. Generate the submission event ID before applying room state so file/measurements/review share stable lineage. No new collection/index/route or migration.

Projection adds optional room dimensions and furniture.scopeReturn; phases add requirements_changes_requested, awaiting_dimension_approval and dimension_changes_requested. Existing counts reflect approved readiness. Extend curated evidence source with furniture_dimensions; include only proofs from referenced current room submissions, deduplicating shared events. Exclude private storage/hash fields and unrelated history. Existing Client file access and object URL lifecycle protections stay intact.

## Invariants and failure handling
Backend role/project scope is authoritative. Designer can submit, Client can decide; existing representatives retain mandatory on-behalf proof/audit. Designer cannot self-approve via role fallback. Uploads by Clients also require separate explicit approval. Expected workflow version, exact submission references, immutable history, transaction CAS, idempotency and upload compensation remain required. Concurrent approve/return or superseded submissions must conflict; failed validation writes neither new state nor audit and cleans new proof. Pinned approved-estimate room lineage is enforced on mutations and onward submission. No email/notification side effect is introduced.

## UX
Use the current compact stage panel, room selection and protected file viewer. Keep the generic action form manageable with a focused dimensions editor: room grouping, editable item rows, add/remove controls, explicit unit labels, positive number validation and responsive stacking. Client and Designer see latest room measurements, status and return reason. Approval/return controls reference pending rooms only. Disabled, saving, validation, stale version and retry states remain visible. On success refresh all existing workflow/Designer/Client/admin queries. No forced download or fabricated approval state.

## Options and compatibility
Chosen: preserve current Client upload capability and add Designer capture, then require Client review for both. Designer-only uploads would unnecessarily break existing Client collection. Chosen: preserve completed legacy history but enforce approval for incomplete work; treating all historical uploads as approved would falsely clear unreviewed rooms. New proceed actions conflict with the requested gate and are retired, retaining historical records only.

Deploy backend/frontend together after separate deployment authorization. Rollback must account for persisted pending/rejected revisions: an old server's uploadedAt gate is unsafe once this feature is used, so production rollback requires a compatible gate-preserving release. No live rollout or data rewrite is included here.

## Acceptance and verification
- AC1: Client returns scope with a reason; acceptance is blocked until Designer resubmits; selected rooms persist.
- AC2: Authorized uploader submits validated item dimensions with proof for exact accepted required rooms. Missing/invalid fields, unknown/duplicate IDs and unauthorized actors fail without writes.
- AC3: Upload yields pending Client approval, latest dimensions/documents visible on both role screens. Upload alone does not complete a room/stage or permit its final design submission.
- AC4: Approve/return bind to exact current submissions. Return reason and item values survive reload; resubmission increments revision; stale/conflicting actions fail and historical evidence remains immutable.
- AC5: Only approved required rooms pass room-scoped final gates. Proceed bypass rejected, no-furniture still completes on Client acceptance, valid completed legacy stages preserved, incomplete legacy evidence not silently approved.
- AC6: Memory/Mongo persistence, audit, idempotency, retry, proof cleanup, representative requirements and project/estimate lineage hold; tests include asymmetric identities and real replica-set races.
- AC7: Client/Designer interaction, mobile/tablet/desktop, accessibility, loading/error/stale states, typechecks/builds and focused regressions verified. No deployment or full-suite claim without evidence.

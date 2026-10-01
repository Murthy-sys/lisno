# Designer resubmission readiness and returned-plan feedback

Status: approved by the user on 2026-10-01. Task plan approved and Mode A selected; implementation, integrity review and final verification complete. See the task plan for evidence and runtime limits.

## Goal

Make Designer resubmission after a Client change request understandable and successful once the intended current drawings are ready. A newly uploaded plan must not produce a misleading concurrent-edit error because an older returned plan remains active.

## Current behavior and evidence

- The user confirmed the failure occurs from the Designer screen after uploading a new plan file, then calling `POST /estimates/:estimateId/design-drawings/submit`.
- Ordinary upload creates a separate upload and extracted drawings. It does not replace an earlier upload or its drawing IDs.
- `backend/src/services/estimate-design.service.ts`, `submitDrawings`, loads every active drawing. It transitions draft revisions to submitted; returned revisions without replacements stay `changes_requested`. Its special no-draft resubmission branch selects approved revisions only.
- `backend/src/services/project-workflow.service.ts`, `prepareDesignReview`, requires every current revision to be submitted or approved. A remaining returned revision therefore triggers `DESIGN_PLAN_REVISION_CONFLICT`, even when no concurrent edit occurred.
- `frontend/src/features/leads/EstimateDesignUploads.tsx` enables submission for active drawings once extraction ends, without identifying unresolved returned revisions. On failure it displays generic retry text instead of the API explanation.
- Existing drawing replacement creates a new revision with stable lineage. Existing Designer upload deletion can retire eligible unapproved uploads, preserves stored review history, and enforces ownership/approval restrictions in `estimate-design-upload-deletion.ts`.
- This establishes a code path matching the report. The user's database records were not read or modified.

## Recommended behavior and scope

Extend the existing submission-readiness and error handling. Use the existing replacement and eligible upload-removal actions to resolve old returned drawings. An ordinary additional upload continues to mean an additional plan; the application cannot safely infer which earlier file it supersedes, especially with multiple plans or approved drawings.

No new replacement API, automatic deletion, approval bypass, historical revision rewrite, OCR protocol change, or migration is included.

## Requirements

1. Before submission writes, validate the latest revision of every active drawing. Distinguish unresolved returned drawings from a genuine stale revision conflict.
2. Return a specific safe readiness error explaining that returned drawings need replacement or that a superseded, eligible old upload needs removal. Keep existing concurrent-change/CAS checks and the final review preparation guard.
3. In the Designer screen, list the outstanding returned drawings using existing workspace data. Explain that a new file is added alongside existing plans. Provide guidance to their existing Replace controls and eligible upload delete controls; keep existing confirmation and permission restrictions.
4. Prevent knowingly invalid submission while returned current revisions remain. Display actionable API errors and refresh workspace data after a stale/readiness failure so another tab's changes are reflected.
5. After the Designer replaces all returned drawings, or explicitly removes a superseded eligible upload after checking the new plan, submission must create exactly one new review round containing the intended current revisions and attachments.
6. Preserve approved drawings, immutable earlier review rounds/proofs, drawing lineage, current Designer authorization, workflow prerequisites, transaction rollback and post-commit email delivery behavior.
7. Preserve valid first submission, mixed approved-plus-new-draft submission, and the existing supported approved-revision resubmission path.

## Data, API and UX impact

- No persisted fields or request-body changes. The existing endpoint gains a distinct readiness error code/message within the current error envelope.
- UI additions are a compact readiness explanation/list and error handling within the current Designer upload workspace. No redesign or dependency is required.
- Error details may identify only drawings already visible in the authorized estimate workspace. No storage paths, proof metadata or other-project details.

## Risks and constraints

- Silently treating a new upload as a replacement could drop unrelated or approved plans. Retiring an old upload remains an explicit existing user action with its current confirmation.
- A UI-only check can race with extraction or another tab. Backend readiness validation and transactional revision checks remain authoritative.
- The worktree contains earlier approved changes. Capture and preserve its baseline before implementation; limit edits to the relevant submission/readiness paths and tests.
- No live customer upload deletion, real email, production mutation, commit or deployment is authorized by this specification.

## Acceptance criteria

- **AC1:** New upload plus an older active returned drawing produces a precise readiness blocker, not a false revision-conflict message; no revision, review-round, audit or email side effects commit on rejection.
- **AC2:** Designer UI identifies outstanding returned drawings and explains replacement versus additional upload. Relevant API errors are visible; refresh reflects resolved blockers.
- **AC3:** Explicitly retiring an eligible superseded old upload or replacing its returned drawings allows the new current plan to be submitted successfully. Earlier review history remains intact.
- **AC4:** Approved-plus-draft, first submission and supported unchanged-approved resubmission still work; true concurrent revision changes still fail safely.
- **AC5:** Focused rendered tests and Mongo replica-set regression cover the reported path and rollback; affected typechecks/builds pass.

## Open decisions

None required for this bounded fix. Automatic whole-plan supersession would be a separate workflow change requiring an explicit old-to-new upload selection and additional lineage design.

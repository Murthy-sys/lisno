# Correct false section-assignment approval conflicts

Date: 2026-11-16
Status: Approved, implemented, and verified in Mode A

## Goal

Make `GET /api/v1/admin/projects/:projectId/section-assignments` return the existing section-assignment response for a valid approved project instead of a false 409. Preserve approval, task-lineage, authorization, assignment-version, and completed-section protections.

## Current behavior and verified root cause

- The route calls `listProjectWorkflowSectionAssignments`, which resolves `canonicalApprovedTradeSource` in `backend/src/services/project-workflow.service.ts`.
- That resolver loads only `_id`, `projectId`, `version`, `designPlanVersion`, `lineItems`, and `estimation` from the estimate. For workflow version 3 it passes this partial record to `resolveCurrentQuotationApproval`.
- `quotation-approval-state.service.ts` compares the current estimate with its immutable approved snapshot. Its comparison requires reconciled rupee/paise totals, optional round-off, property/room/scope selections, basket classifications, and line items. The narrow query omits required data, so a valid approval becomes `source_issue` and the caller throws `WORKFLOW_SECTION_ASSIGNMENT_CONFLICT`.
- Diagnosis of the reported loopback project found one approved candidate and one trade task. The complete estimate resolves as `initial_current` with `currentQuotationApproved: true`; the endpoint's partial projection resolves as `source_issue`. Task estimate/design-version lineage matches and pure aggregation returns one section.
- The existing service reproduced the reported 409. Its transaction aborted on the conflict; the checked project, estimate, and task data remained unchanged. Diagnostic evidence is under `/tmp/lisno-section-assignment-409-qa/diagnosis.json`.
- The project is completed, but completion is not the cause of this read failure. Historical section information must remain readable; completed-section reassignment protection remains in force.

## Proposed correction

Remove the incomplete estimate projection from `canonicalApprovedTradeSource` so the existing approval resolver receives the full saved estimate. Retain the project/status/design-status filters, two-candidate ambiguity check, transaction, and all source validation. This follows other callers that supply complete estimate records and avoids duplicating the approval comparison's field inventory.

The response continues to use the existing explicit section-assignment DTO. Reading the full internal estimate must not expose extra fields in the API. The immutable approved review-round snapshot remains the source of section labels and approved line content.

## Requirements and invariants

1. A valid workflow-v3 initial approval or approved designer revision must resolve using complete current data. The reported project must produce its one valid section instead of the projection-induced conflict.
2. Real inconsistencies must still return the existing conflict: changed current financial/content values, invalid/missing approval evidence, ambiguous approved estimates, mismatched project/estimate/design-version lineage, malformed tasks, or incompatible assignment groups.
3. Preserve legacy and workflow-v2 behavior, including the empty-list result where no approved source exists.
4. `canonicalApprovedTradeSource` is also used by section assignment mutations. Keep their existing actor permissions, role eligibility, stale-revision checks, audit/transaction behavior, and completed-section rejection unchanged. Do not bypass validation or substitute live lines for an approved snapshot.
5. Keep API response shapes, status/error codes, frontend styling, cache keys, persisted approvals, prices, task data, and project completion state unchanged.

## Scope, constraints, and risks

Expected product change: the query in `backend/src/services/project-workflow.service.ts`. Add focused regression coverage in the existing workflow replica-set suite, with route coverage only if needed to prove the endpoint contract. Preserve all current unrelated dirty work, especially the ongoing admin/vendor UI and workflow changes.

No schema change, migration, data repair, approval rewrite, seed, new dependency, frontend redesign, or permission expansion is required. No commit, push, deployment, or external communication is included. The main risks are inadvertently relaxing approval validation or enabling stale mutations; tests must demonstrate that valid reads succeed while genuine conflicts remain blocked.

Any further local-data verification should use read-only source inspection/pure resolution or a rollback-only transaction. The service's shared transaction wrapper performs an authorization coordination write, so a successful diagnostic invocation must not commit that wrapper against the local database merely to test the fix. Successful endpoint/service tests belong in the isolated replica-set database.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | Valid initial and revised workflow-v3 approvals return their current section assignments. | Regression reproduces the partial-projection failure, then passes with complete source data; include completed-project history. |
| AC2 | Actual approval/content/lineage conflicts still fail closed. | Distinct project/source fixtures, invalid evidence or changed totals/content, stale design version and ambiguous task groups. |
| AC3 | Existing read and mutation contracts remain intact. | Existing section assignment, stale revision, completed-section, legacy/workflow-v2 and route authorization cases. |
| AC4 | The correction compiles and preserves unrelated work. | Focused backend tests, backend typecheck/build, `git diff --check`, baseline diff review. |

Use the existing isolated Mongo replica-set lane. No frontend visual QA is needed unless implementation evidence requires a UI change, which is outside this proposed correction. Broaden verification only for a demonstrated impact. Record exact checks and any unrelated pre-existing failure separately.

## Assumptions, rollback, and open decisions

The requested outcome is to fix the false API failure while retaining valid integrity conflicts. No product decision remains. Rollback is reverting the bounded query change and regression additions; no stored-data rollback is needed.

The specification and task plan were approved, and the user selected Mode A. Implementation and verification are recorded in [the task plan](../plans/2026-11-16-section-assignment-approval-projection.md).

# Award approvals use the project's Site Manager and Designer

## Goal and scope

Correct the existing vendor-award approval flow: the PM chip represents the project's **Site Manager**, and Design routes automatically to the project's already assigned **Designer**. Procurement must not assign either person again in the Award modal.

This supersedes the earlier award specification's dedicated Program Manager requirement for this flow. It is an approval-identity correction, not a redesign. Preserve the modal, payment schedule, selected chips, pricing, budget-override rules, Procurement-only direct issue below ₹50,000, and existing financial safeguards.

## Current behavior and evidence

- `ProcurementBasketComparison.tsx` displays a Designer dropdown and disables submission when `programManagerId` is absent. Its accessible chip label and blocker refer to Program Manager.
- `procurement-basket-award.service.ts` reads `Project.programManagerId`, requires a separate active `program_manager` account, and uses that identity for queue visibility and decisions. The issue service separately repeats this role/identity requirement. A label change alone would leave approval and issuance broken.
- The existing Site Manager assignment is `ProjectWorkflowTask` with `kind: site_execution`, `assigneeRole: site_manager`, and `assigneeUserId`. Site completion already resolves that assignment and rejects inconsistent duplicate tasks. Site Managers currently lack work-order approval permissions and navigation.
- The existing design assignment updates `Project.assignedDesignerIds`, the approved estimate's `designPlanDesignerId`, and its `design_plan_upload` task together. The normal assignment has one Designer. The award currently accepts a separate `designerId` selection despite having these saved assignments.
- Assignment changes and approval decisions are transaction-sensitive. The current project write fence does not itself lock the Site Manager workflow-task assignment.
- Initial dirty-path inventory: `/tmp/lisno-award-project-approvers-initial-status.txt`. Existing changes must be preserved; capture affected file baselines before implementation.

## Required behavior

1. **PM identity:** resolve the active Site Manager from the existing project Site execution assignment. Do not require or create a separate Program Manager assignment. Keep the compact PM chip; its accessible name, explanatory text, approval status, and blockers say Site Manager.
2. **Designer identity:** resolve the project's existing active Designer on the backend. Remove the award-specific Designer dropdown. Show the resolved person's name as read-only context when Design approval is required. Requests cannot select a different person or override the project assignment.
3. **Assignment consistency:** use the unique current project assignment. For multiple Designer IDs, use the current approved-source design assignment only when it consistently identifies an active assigned Designer; never choose by list order or name. Missing, inactive, or contradictory assignments produce a specific actionable blocker. A valid existing assignment must enable the otherwise-valid submission.
4. **Approval routing:** Send for approvals exposes one current-revision task per selected required role, with its payment rows, in the assigned Site Manager's and assigned Designer's Work order approvals screens. Unassigned or other-project users cannot see details or decide those slots. A chip click alone creates no task.
5. **Authorization and issuance:** synchronize backend permissions, queue/detail/decision checks, frontend navigation, and final issue guards with `site_manager`. Recheck both assignment identities and account eligibility at submission, decision, and issue. Fence Site Manager assignment changes so a concurrent reassignment cannot issue using stale approval authority. Keep distinct actors, revision/digest binding, audit, idempotency, and existing transaction guarantees.
6. **Small orders:** below ₹50,000, Procurement-only direct issue must not become blocked by an absent Site Manager or Designer. Preserve the existing boundary at exactly ₹50,000 and the existing higher-value/budget requirements.

## Data, API, and compatibility

- Project workflow and design assignments remain the source of truth; no new assignment screen, duplicate assignment field, or role-wide account conversion is required.
- Preview returns the resolved approver identities/names needed by the modal. New or revised proposals freeze those exact IDs. A legacy client-supplied Designer ID may be accepted only if it matches the resolved project Designer; an omitted ID is resolved server-side.
- Existing internal `program_manager` approval-slot and `programManagerId` snapshot keys may remain compatibility names if needed. For this corrected award route they refer to the Site Manager, and all actor-role checks must resolve to `site_manager`. Do not treat an internal key as an account role.
- Do not rewrite issued orders, prior proposal revisions, or approval decisions. If an unissued frozen proposal names different approvers, use the existing revision/resubmission flow and collect new decisions; never silently transfer a prior approval to a different actor. Legacy accounts/role records remain stored without gaining Site Manager authority.
- Keep existing error-response shapes and return specific assignment blockers rather than a generic error. Use existing mutation/audit and query invalidation paths. No external email mechanism is added.

## Non-goals, risks, and rollback

- No changes to estimate submission, bid comparison, payment calculations, unrelated project roles, global user-role cleanup, or unrelated order workflows.
- No seeds, backfills, live assignment changes, live award decisions, deployment, or customer communication.
- Main risks are cross-project approval leakage, disagreement between preview/queue/issue, stale assignments during concurrent transactions, and accidental alteration of immutable history. Tests must cover these directly.
- No data migration is planned. Rollback consists of restoring the scoped code delta; newly saved Site Manager proposals must not be issued by older role checks without review.

## Acceptance criteria and verification

1. A project with an assigned active Site Manager, no separate Program Manager, and an assigned active Designer opens a valid higher-value award with resolved approvers and no Designer dropdown or missing-Program-Manager blocker.
2. Submission freezes the correct Site Manager and Designer IDs. Their respective queues show the current approval request and selected payment rows; unrelated users from a second project cannot list, read, or approve it.
3. Missing/inactive/inconsistent assignments are clearly reported. A stale supplied Designer ID is rejected. Reassignment between preview, submit, decision, and issue blocks stale authority and requires the established revision path.
4. Final approval can issue through the existing guarded path with Site Manager identity; distinct actors, duplicate protection, audit lineage, and existing budget rules remain enforced.
5. Below-₹50,000 Procurement-only issuance still works without either assignment. Historical issued records remain unchanged and readable.
6. Run focused backend authorization and replica-set award/issue tests, frontend rendered modal/queue/navigation tests, affected workspace typechecks/builds, and `git diff --check`. Verify keyboard labels and read-only approver presentation. Do not submit or approve a live order during QA.

## Assumptions and open decisions

The request concerns the PM slot in vendor-award approvals. Existing project assignment screens remain responsible for assigning staff. There is no product decision requiring an additional selector or a new role. This specification changes the earlier approval-role contract and therefore requires its updated approval under the repository workflow before a separate task plan and implementation.

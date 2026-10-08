# Award project approvers: task plan

Approved specification: [Site Manager and assigned Designer approval routing](../specs/2026-10-06-award-project-approvers-design.md).

## Outcome and boundaries

PM uses the existing project Site Manager assignment. Design uses the existing project Designer automatically. Remove the award-specific Designer selector and make the assigned users' approval queues, decisions, and final issue checks agree.

Keep the current modal, chips, payment calculations, amount thresholds, Procurement direct issue, and budget-override behavior. No global role migration, new assignment screen, live submission, live assignment change, seed, deployment, or commit.

## Contract to implement

- Resolve Site Manager from the project's unique `site_execution` workflow task, with role `site_manager` and an active `assigneeUserId`. Resolve Designer from the project's current assignment, using the approved-source design assignment to disambiguate only when consistent with project membership. Missing, inactive, or inconsistent assignments remain explicit blockers.
- Reuse a bounded backend resolver across preview/proposal, approval access, submission, and issue so these paths cannot use different assignment rules. Read paths must not write. Transactional decision/submit/issue paths fence the relevant assignment documents against concurrent reassignment.
- Preview exposes resolved Site Manager and Designer IDs/names and any required-role assignment blockers. Retain existing compatibility fields where needed. The frontend uses the server-resolved Designer, with no local chooser. Freeze the resolved identities in each new proposal revision.
- Keep `program_manager` as the existing internal PM approval-slot key and `programManagerId` as its compatibility snapshot field; its eligible account role in the corrected award flow is `site_manager`. Do not rename historical records or convert user accounts.
- Omitted Designer input resolves automatically. A supplied Designer ID is accepted only when it agrees with the server's current project assignment. Older unissued proposals with different identities use the established revise/resubmit path; prior decisions are never transferred to a new person.
- The assigned Site Manager receives work-order approval read/decision permissions and navigation. Backend project/proposal assignment checks still enforce scope. Other roles do not gain new issue or budget-override authority.
- Below ₹50,000, absent Site Manager/Designer assignments must not block a Procurement-only proposal. Assignment requirements follow the server's required slots.

## Dependency-ordered tasks and ownership

### 1. Establish baseline and shared contract

**Owner:** primary. **Dependencies:** task-plan approval and execution-mode selection.

- Refresh the dirty-path inventory and capture relevant file contents/diffs under `/tmp/lisno-award-project-approvers-baseline` before writers start. Initial inventory is `/tmp/lisno-award-project-approvers-initial-status.txt`.
- Confirm preview DTO fields and existing assignment mutation boundaries. Record the minimal DTO additions for resolved names/IDs and blockers before splitting backend/frontend work.
- Check existing proposal revision behavior so changed approvers require a new revision and fresh decisions without modifying frozen history.
- Keep this correction as the sole parent task in progress. No unrelated cleanup or formatting.

**Acceptance:** both implementation slices share one assignment contract and explicit file ownership; every dirty target has been inspected. Covers specification AC1–AC5.

### 2. Correct backend assignment, authorization, and issue checks

**Owner:** backend implementer in Mode A; primary in Mode B. **Dependency:** task 1.

**Owned areas:**

- `backend/src/services/procurement-basket-award.service.ts`
- `backend/src/services/project-purchase-order-basket-issue.service.ts`
- One award-specific shared assignment helper if needed to avoid duplicated resolver logic.
- `backend/src/domain/authorization.ts` and directly affected backend API/OpenAPI contracts.
- Existing workflow assignment service/model only if needed for the shared transaction fence, with no change to assignment UX or authority.
- Focused backend award/issue, route, authorization, and assignment-race tests.

**Work:**

1. Resolve existing Site Manager/Designer assignments in preview and proposal creation/revision; remove the need to supply a Designer when one is already assigned.
2. Replace separate Program Manager account checks in submit, queue, detail, decision, and issue with the same Site Manager identity rule. Include active-account checks and explicit assignment errors.
3. Route queue tasks to the matching project/proposal IDs; deny other-project users and a legacy Program Manager who is not the assigned Site Manager.
4. Fence relevant assignment records at mutation boundaries and recheck identity at issue. Preserve proposal digest/version checks, distinct actors, audit, idempotency, budget checks, and one-order commitment.
5. Keep assignment resolution from blocking Procurement-only small awards. Preserve issued history and require revision for an unissued award with changed approvers.

**Acceptance:** replica tests prove correct recipients, unauthorized access denial, assignment-change handling, and successful final issue using Site Manager approval. Covers AC1–AC5.

### 3. Use resolved approvers in the modal and navigation

**Owner:** frontend implementer in Mode A; primary in Mode B. **Dependency:** task 1; can run alongside task 2 once DTO fields are agreed.

**Owned areas:**

- `frontend/src/features/procurement/ProcurementBasketComparison.tsx` and its rendered tests.
- `frontend/src/features/procurement/procurementBasketApi.ts`.
- Award approval queue labels/tests where they display the role name.
- `frontend/src/app/routeRegistry.ts`, relevant navigation tests, and `frontend/src/test/authFixtures.ts`.

**Work:**

1. Remove Designer selection state/control and display the server-resolved assigned Designer as read-only context. Use resolved identity when comparing a saved draft to the current preview; do not keep an invisible empty selection that disables submission.
2. Keep the PM chip abbreviation and use Site Manager for its accessible name, status, and blockers. Display the server's assignment errors only when that role is required.
3. Enable an otherwise-valid award when the project already has eligible assignments. Refresh preview/award/approval queries through existing mutation invalidation paths.
4. Add Work order approvals to Site Manager navigation and retain permission-based route guards.
5. Test the higher-value assigned-user flow, missing assignments, saved-draft identity changes, small-order direct issue, keyboard labels, and submission payload without a Designer chooser.

**Acceptance:** the user's valid assigned project submits without a Program Manager assignment or another Designer selection; Site Manager can reach the scoped approval queue. Covers AC1, AC2, AC3, AC5, AC6.

### 4. Review and verify the integrated correction

**Owner:** primary, then integrity reviewer and verification runner in Mode A; primary performs the equivalent sequential checks in Mode B. **Dependencies:** tasks 2 and 3 complete.

- Review source identity consistency across preview, saved proposal, queue, detail, decision, and issue. Confirm historical records and unrelated dirty changes are preserved.
- Use two different projects with different Site Managers and Designers. Include inactive/missing/contradictory assignments, stale client Designer input, reassignment races, duplicate decisions, and old proposal identities.
- Verify final approval can issue one work order through the existing route, and ₹49,999.99 still uses Procurement only while ₹50,000 retains the established higher-value requirements.
- Run final checks only after all writers finish. Fix confirmed defects and rerun affected checks; do not expand into unrelated features.
- Record exact results, remaining limitations, generated outputs, and unrun checks. No live award or client email is used for QA.

**Acceptance:** every specification criterion has focused evidence, and no partially verified result is called complete.

## Verification commands

Backend, from `backend/`:

```sh
npm test -- tests/procurement-basket-tender.replica-set.test.ts tests/project-purchase-order-basket-issue.replica-set.test.ts tests/procurement-basket-routes.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts
npm run typecheck
npm run build
```

Add the directly affected workflow assignment race test and API documentation test if those paths/contracts change. Mongo transaction coverage must use a replica set.

Frontend, from `frontend/`:

```sh
npm test -- src/features/procurement/ProcurementBasketComparison.test.tsx src/features/procurement/ProcurementBasketApprovalQueue.test.tsx src/components/layout/navigation.test.tsx src/app/routePaths.test.ts
npm run typecheck
npm run build
```

Use rendered interaction tests for the selector removal, resolved name, actionable errors, chip accessible names, and queue/navigation. Inspect the bounded modal at desktop and narrow width using synthetic responses if browser verification is needed; do not click a live submission.

Repository checks: `git diff --check` and `git status --short`. There is no repository lint script.

## Parallel execution and approval boundary

Only tasks 2 and 3 can run in parallel, after task 1 freezes their shared contract. Backend and frontend owners have disjoint paths and must preserve others' edits; contract discoveries return to the primary before implementation diverges. Final integrity review precedes final verification.

The specification, task plan, and Mode A execution were approved before implementation.

## Execution record

The user approved the specification and task plan, then selected Mode A. Tasks 1–4 are complete. Scoped baseline and initial diffs are captured in `/tmp/lisno-award-project-approvers-baseline`; refreshed status is `/tmp/lisno-award-project-approvers-execution-status.txt`. Backend and frontend writers used disjoint paths. The primary owns documentation and integrated verification.

The agreed preview additions are `assignedSiteManager: { id, name } | null`, `assignedDesigner: { id, name } | null`, and `approverBlockers: Array<{ slot: "program_manager" | "designer", code, message }>`. Existing compatibility fields remain. The backend resolver is authoritative; frontend create/update omits Designer selection and compares saved IDs with required-role preview identities.

The user also requested Work order approvals navigation for Procurement, Site Manager, Super Admin, and Designer. The frontend slice includes the Super Admin link using its existing approval permission and budget-override responsibility. Existing Finance navigation remains; no broader Super Admin decision authority is added.

Interim evidence: read-only resolution for the currently open project found its active Site Manager and Designer correctly, with no blockers and no change to assignment version or approval epoch. The actual modal component was checked with isolated synthetic responses at desktop and 390×844: both assigned names are shown, no Designer selector exists, selecting all required chips enables submission, all rows are reachable on mobile, and no horizontal overflow or console error was observed. Temporary preview files were removed, the tab closed, and the viewport reset. No live award was submitted.

### Final implementation and verification

- Added `procurement-basket-approvers.service.ts` as the shared resolver for preview, proposal, queue, detail, decision, and issue. The internal PM slot remains compatible; its actor is the assigned Site Manager. Designer identity comes from the current project and approved-source assignment. No new dependency or global role migration.
- Added a task-local `awardApprovalEpoch` fence for concurrent Site Manager reassignment. Assignment version, progress, deadlines, and timestamps remain unchanged by approval fencing. Existing Project fencing protects Designer reassignment. Saved revisions preserve their frozen identities and decisions.
- Removed the Designer chooser; the modal shows resolved names and required-role blockers. Stale assignment data cannot enable submission or issuance. Procurement-only small awards remain independent of the other assignments.
- Work order approvals navigation includes Procurement, Site Manager, Designer, and Super Admin, retaining Finance. Existing backend scope and budget-override permissions remain authoritative.
- Integrity review found and resolved a queue pagination defect: stale assignments could consume the first 100 candidates. The queue now pages until it collects eligible requests. Regression coverage places 101 stale proposals before a valid request for both Site Manager and Designer. Final integrity review cleared with no remaining confirmed issue.
- Backend writer's final focused run: **240/240 tests across 8 suites**, including 48 tender replica tests, 26 issue replica tests, and 12 resolver replica tests. Backend `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- Independent final frontend command listed above: **232/232 passed** (24 comparison, 6 queue, 82 navigation, 120 route paths). Frontend typecheck and build passed. Build reports the existing large-chunk warning.
- Independent final backend command: `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts`: **101/101 passed**. Initial sandbox-only local-listener `EPERM` was resolved by rerunning the same command with approved execution permissions. Backend typecheck passed again.
- Final independent repository hygiene checks passed. Logs: `/tmp/lisno-award-project-final-{frontend-tests,backend-contract-retry,frontend-typecheck,backend-typecheck,frontend-build,diff-check,status}.log`. Build outputs are ignored. The temporary browser harness was removed.

Full repository test suites were not run; focused transaction, authorization, interaction, navigation, typecheck, build, and desktop/mobile checks cover this correction. No lint script exists. No migrations, live assignments, live submissions/approvals, external email, commits, pushes, or deployment were performed. Unrelated preexisting dirty work was preserved.

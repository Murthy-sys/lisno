# User assignment visibility during access changes

Date: 2026-11-04

Status: Specification and task plan approved; user selected Mode A. Implemented and locally verified on 2026-11-04. See the [task plan](../plans/2026-11-04-user-assignment-visibility.md) for evidence and verification limits.

## Goal

In the Manage user panel, show which projects and work a user is responsible for, the current stage of each project, and which responsibilities prevent the selected role change. An administrator must be able to identify the work behind “Reassign dependent work first.” without guessing or searching every project.

Interpretation: the request is to expose the missing assignment context in the existing access-management workflow. Provide navigation to existing, authorized project/assignment screens where available. A new universal reassignment editor or automatic transfer of ownership is outside this change.

## Current behavior and evidence

- `backend/src/services/user-administration.service.ts` calls `countUserResponsibilities` inside the role-change transaction. Its `responsibilityRole` mapping and `hasIncompatibleResponsibility` decide whether the destination role is compatible. A conflict returns only code `RESPONSIBILITY_REASSIGNMENT_REQUIRED` and message “Reassign dependent work first.”
- The memory and Mongo repositories count eleven responsibility categories: active leads, active estimates, initiated projects, assigned design projects, managed projects, active design tasks, direct reports, linked Client projects, active Sales Manager initiator grants, execution projects and workflow tasks. They do not return the records that produced those counts.
- These categories have different completion rules. Leads exclude won/lost; estimates exclude client-approved; most project assignments exclude completed projects; direct reports and linked Client projects do not have that exclusion. Active grants and unsuperseded workflow tasks have their own predicates. The new list must preserve these distinctions.
- `frontend/src/features/admin/UserMutationDialog.tsx` has no assignment-detail query. Its conflict handler renders only the error text. Existing responsibility counts are used in successful deactivation feedback, not a pre-change work list. Existing tests assert the generic conflict without project/stage context.
- `backend/src/domain/project-status.ts` and `services/project-status.service.ts` already derive the current workflow stage from validated estimate, approval, design and execution evidence. A project's broad `status` alone is not the detailed current stage.
- The public project-status service enforces project membership. The new administration read must use an explicit, narrow administrative boundary while sharing the existing status projection; it must not weaken the participant endpoint or impersonate a project member.
- Generated project numbers are sourced from linked lead records using `projectNumbersForProjectIds`. Keep stable project IDs for joins and links. Do not create project numbers on this read path.
- `/admin/projects/:projectId` already presents project administration and permission-gated assignment sections. Navigation does not itself grant reassignment permission.

## Scope and non-goals

Add one authorized, read-only user responsibility endpoint and a compact Current assignments section in the existing Manage user panel. Include all responsibility categories used by the current blocker, including compatible responsibilities and non-project relationships. Highlight incompatibility for the selected destination role.

Do not change role eligibility, deactivation/deletion policy, the immutable Super Admin, assignment ownership, approvals, grants, transaction/CAS checks, or audit semantics. Do not add transfer mutations, automatic reassignment, new user roles, broad project access, financial details, client contact data, or an employee activity dashboard. Existing completion/filter semantics are retained even when a category's label differs from an ordinary “active work” interpretation.

No data migration, backfill, dependency installation or live database action is required. Do not start the application backend, launcher or OCR; use isolated test services and synthetic frontend fixtures for verification after approval.

## User experience

1. Opening Manage user loads a compact **Current assignments** section beneath the identity and role field. Show it before a failed Save attempt, not only after an error.
2. Show a concise total of responsibilities and, when the selected role differs from the stored role, the number requiring reassignment. Do not label a responsibility count as a project count; one project can have several responsibilities.
3. Each project-linked entry shows:
   - Generated **Project ID** and project name.
   - **Current stage**, using the authoritative project-status projection.
   - **Responsibility**, such as Sales owner, Assigned Designer, Sales Manager project access, or workflow task title.
   - The work's own stage/status when distinct from the project stage, for example a task waiting for review while the project is in space planning.
   - A short **Reassignment required** indicator only if that entry blocks the selected role.
4. Non-project relationships remain visible: direct reports show the report's name and relationship; leads without a project show their lead/project label and lead stage. Missing or inconsistent source links show **Project details unavailable** with the stable record reference; they must not disappear or be joined by name.
5. Missing generated project numbers show an explicit unavailable value. Do not substitute a database ID as the generated Project ID or generate a fake number. An unavailable stage remains **Stage unavailable** while the responsibility stays visible.
6. Use a compact list with aligned labels, small inline links, existing tokens and minimal spacing. Long names wrap. On narrow screens, labels stack within each row without horizontal scrolling; the existing panel footer remains usable. Do not add large buttons, another modal or ornamental cards.
7. Provide **Open project** for resolved projects when the viewer has the existing project-read permission. Link to an existing assignment section only when both the route/anchor and permission are verified. Use accurate action labels; do not promise a direct reassignment flow where one does not exist. Navigation must preserve the panel's existing unsaved-role handling.
8. Provide Refresh and bounded pagination with a truthful total. The full blocking count must remain visible even when blocking rows are on another page. Deterministic sorting puts blocking records first when a destination role is selected.
9. Loading, failed loading, no responsibilities, unavailable project context and stale data are distinct states. A failed read must never appear as “No assignments.” Keep retry local to this section.
10. Selecting another destination refreshes the compatibility view. A mutation conflict refreshes assignments and retains the user's selected role so they can inspect the latest blockers. Refresh when returning to the panel after reassignment elsewhere. Never replay a role change automatically.

## API and data contract

Proposed route: `GET /admin/users/:userId/responsibilities`, with optional validated `destinationRole` and the repository's bounded `limit`/`offset` pagination.

Response includes:

- Target user ID, stored role and version, requested destination role, server read time.
- Full responsibility counts by the existing eleven categories, total responsibility count and full blocking count.
- A bounded page of responsibility rows with a stable row key, category, source entity type/ID, responsibility label, own work status/stage where applicable and `blocksRoleChange`.
- Nullable project context: stable ID, generated project number, name, broad status, current-stage key/label, and an explicit context-availability state.
- Direct-report identity limited to stable ID/name when applicable; no unnecessary email, phone, financial or source-document fields.

The server derives compatibility from the same policy as the existing transactional role-change guard. If no destination is selected, or it equals the stored role, no change is being blocked. Workflow assignments retain the current guard's behavior; this task does not reinterpret their role compatibility.

Add repository support in both memory and Mongo implementations. Use the exact guard predicates for record enumeration and totals; share predicates/policy where useful without changing their semantics. Preserve records with missing linked entities so the list can explain every counted blocker. Extend memory fixtures with explicit stable lineage where needed; never infer a project from labels or whichever record appears first.

Enrich only distinct project IDs on the requested page, with bounded concurrency or batched reads. Reuse the canonical status source selection and projection through a narrowly authorized administrative service entry point. Do not return full project status sources or pending-action actor lists when only current stage/state is needed. The existing participant endpoint retains all its access checks.

Keep the existing PATCH request and 409 code compatible. The role-change transaction remains authoritative and recalculates responsibility counts on each save; a read-only preview is not an authorization token. The assignment list is a dated preview, not a guarantee against concurrent reassignment.

Register the new GET operation in the canonical route-operation registry and OpenAPI with runtime query validation and an explicit response contract. Update frontend API types and query keys together.

## Authorization and invariants

| Actor / operation | Behavior |
| --- | --- |
| Current active Super Admin with user-directory read operation | Read only the target user's responsibility projection, including the minimum linked project/stage metadata needed to explain it. |
| Other roles, inactive/deleted actors or stale sessions | Denied through existing authentication/service checks; do not disclose target existence or project metadata. |
| Missing/deleted target | Existing non-disclosing not-found behavior. |
| Role update | Existing update permission, immutable-user rules, expected version, authorization coordination, transaction and audit behavior remain authoritative. |
| Open project or assignment screen | Existing destination authorization applies independently. |

A new read must not mutate assignments, materialize missing project numbers, revoke grants, issue audit mutation events, send notifications or expose contact/financial/source-document data. Stage-source errors must be isolated from the responsibility list where safe; authorization failures must not be swallowed as mere missing stage data.

Use user ID, destination role and pagination in query identity. Clear or refetch the selected user's preview on version changes, successful access changes, role-conflict responses, explicit refresh and reopening/focus as appropriate. Never show a previous user's cached assignments while another user loads.

## Approach and tradeoffs

Recommended: load a dedicated responsibility projection when the panel opens, then highlight incompatibilities for the selected destination. This supports both proactive inspection and the blocked-save case, keeps the normal user directory lightweight and permits bounded paging.

Alternative considered: return detail only in the failed PATCH response. This requires a failed save to see work, cannot explain engagement before choosing a role, and makes large lists/error envelopes awkward. It does not satisfy the requested visibility as well.

## Risks and safeguards

- **Count/list drift:** test every category against the existing guard, including completed records retained by particular categories, inactive direct reports, and superseded workflow tasks.
- **Wrong stage or project:** use stable IDs and the existing stage projection; test unequal projects at different stages and ambiguous/missing lineage. Never present task status as the project's current stage.
- **Administrative disclosure:** enforce stored actor checks and the explicit route operation; project metadata is limited to the target's actual responsibilities. Keep participant APIs unchanged.
- **Concurrent reassignment:** refresh previews, preserve CAS behavior and keep final transaction checks. Do not silently submit after a refresh.
- **Performance:** page source rows, use full-scope counts, hydrate only page projects and deduplicate project-stage reads. A large user workload must not fetch the full portfolio into the browser.
- **Dirty worktree:** earlier estimate recommendation, checklist and dimension changes remain uncommitted. Preserve them; capture relevant target diffs before implementation, especially the already-modified route registry/OpenAPI files.

## Acceptance criteria and verification intent

1. Opening a managed user shows their actual responsibilities before Save. Two users with different assignments cannot see each other's cached rows.
2. For at least two unequal projects at different stages, correct generated project IDs, names, current stages and responsibility/task labels appear, with correct stable links.
3. Every category counted by the role-change guard is represented and count totals reconcile across pages. Compatible entries stay visible; only incompatible entries are marked as blockers for the selected destination.
4. Non-project, missing-project, missing-number and unavailable-stage cases remain explicit and cannot produce a false empty state or fabricated context.
5. Refresh and a 409 conflict fetch current data. Concurrent changes still obey the existing backend guard and expected-version checks; no automatic role-change retry occurs.
6. The new read is restricted to the existing Super Admin administration boundary, returns only the defined projection, and causes no writes. Existing membership-scoped project status behavior and immutable/deactivation/deletion policies remain unchanged.
7. Frontend tests cover loading/error/retry/empty/pagination, destination changes, stale user/role responses, links and keyboard access. Browser checks cover the real panel with synthetic data at desktop and mobile widths, including long names, many rows and a fixed footer.
8. Backend focused service, repository, route authorization and OpenAPI tests cover the new contract and its guard reconciliation. Memory/Mongo parity and existing user-administration regressions are required. Use existing replica-set tests if repository snapshot/transaction paths are changed; do not launch the application backend.
9. Run relevant frontend/backend typechecks and builds, focused tests, integrated review, `git diff --check` and status inspection. Record actual results and any unrun checks in the later approved task plan. No lint claim; the repository has no lint script.

## Open decisions and next gate

No product clarification is required under the assignment-visibility scope above. Detailed implementation ownership and commands belong in the separate task plan after this specification is approved. No reassignment, access change or deletion of the pictured account is authorized or performed by this specification.

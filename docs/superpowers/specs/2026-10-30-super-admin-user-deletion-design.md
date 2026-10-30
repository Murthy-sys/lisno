# Delete users from the Super Admin directory

Date: 2026-10-30
Status: Implemented and locally verified under the approved task plan; not deployed
Classification: High-risk identity/access change spanning frontend, authorization, and persistence

## Goal and decision

Let the Super Admin delete a user directly from the Users list, including inactive Vendor accounts such as the example in the request.

Recommended behavior: **logical account deletion**. Remove the user from the current directory, prevent sign-in and further account changes, and revoke access while retaining the stable identity needed by project, approval, procurement, and audit history. Deleting a Vendor login must not delete its Configuration vendor record, linked Main Lines, bids, orders, or delivery history.

This document proposes behavior only. It does not authorize deleting the real account shown in the screenshot or any other production account.

## Current behavior and evidence

- Inspected HEAD `73761538e1ca9cc34b70d768ec35f938ada7ae65`.
- `frontend/src/features/admin/UserDirectoryPage.tsx` renders **Details** and **Manage** actions; it excludes Manage for the Super Admin row. No Delete action exists.
- `UserMutationDialog.tsx` permits role changes and activation/deactivation. Deactivation retains the user in the directory, explaining why an inactive account remains visible.
- `backend/src/routes/admin-users.ts` exposes GET directory and PATCH account update only. `user-administration.service.ts` permits these operations only for a stored active Super Admin and rejects mutation of the sole Super Admin identity.
- Existing account updates use a coordinated authorization transaction, optimistic version checks, session invalidation, access-grant revocation, and audit events. Deactivation already preserves assignments even when work remains.
- `User.ts` has active, version, and sessionVersion fields but no deletion metadata. The email index is unique; vendor membership is a stable immutable ID.
- Directory rows and summaries are built by `pageUsers` and `summarizeUsers` in both Mongo and memory repositories. Dashboard account aggregates have separate reads in `repositories/super-admin-dashboard.ts`.
- Authentication checks the current stored active flag and session version on requests. Historical attribution uses retained user lookups, including `audit.service.ts`; filtering every user lookup globally would break that history.
- Vendor access/onboarding checks retain existing bound accounts and reject inactive ones. Deletion must keep this fail-closed behavior instead of implicitly creating another vendor identity.
- Existing administration tests cover protected identities, version conflicts, retained assignments, grant revocation, transaction rollback, directory parity, and authorization races. There is no deletion coverage yet.

Initial unrelated work to preserve: modified `frontend/src/features/leads/LeadEstimateWorkspace.tsx` and the untracked estimate-configuration workflow-panel-removal specification and task plan from the preceding task. No user-administration product files are initially dirty.

## Product requirements

1. Add a compact **Delete** action beside the existing row actions for every non-Super-Admin account. Also expose **Delete user** in Manage using the same confirmation, while retaining Activate/Deactivate. Disable deletion while a role edit is unsaved or an account mutation is pending. Both active and inactive accounts are eligible; requiring a separate deactivation step is unnecessary.
2. Selecting Delete opens the existing accessible danger-dialog pattern with the selected user's name and email, **Cancel**, and **Delete user**. Use clear copy: “Remove this user from the Users list and revoke their access. Existing work and history will be kept. This account cannot be reactivated here.”
3. Cancellation performs no mutation. Default focus goes to Cancel. The dialog supports keyboard navigation and focus containment, and controls fit desktop and mobile widths without horizontal overflow.
4. Submit a confirmed deletion once, using the displayed user's stable ID and version. Show **Deleting…** while pending. Block duplicate submission and closing during the mutation using existing dialog behavior.
5. On success, close any details/manage/delete view for that user, refresh directory rows, all directory metrics, and affected dashboard/account projections, and announce **User deleted**. Preserve search and role/status filters. Move to a valid previous page when deleting the last row on a non-first page.
6. A stale, placeholder, or failed directory response must not allow confirmation against an unverified row. A version conflict refreshes current data and requires a new explicit confirmation; it must never silently retry deletion against a newer version.
7. Failed deletion leaves the user visible and reports an actionable error. If deletion committed but refresh fails, retain the successful deletion outcome, exclude the confirmed deleted row from local cached directory data, and offer refresh without inviting a second destructive action.
8. Deleted users are absent from every directory filter, search result, total, active/inactive count, and role count. Deleted accounts are also excluded from current dashboard account/workforce counts and user candidate lists. Historical actor/assignee references remain readable; existing inactive/unavailable-assignee reporting must remain truthful.
9. Existing role/status controls remain unchanged for non-deleted accounts. A deleted account cannot be reactivated or edited using a stale Manage dialog or a direct PATCH request.

## Data and API contract

### Persistence and transition

- Add optional internal `deletedAt` and `deletedById` metadata to User storage and repository types. Missing/null metadata means not deleted, preserving compatibility with existing rows.
- Implement a dedicated repository deletion operation with matching Mongo and memory behavior. Do not physically remove the document or cascade into related collections.
- Transition once from a non-deleted account to `active: false`, populated deletion metadata, incremented account version, incremented sessionVersion, and updatedAt. Increment sessionVersion even when the account was already inactive.
- Run actor validation, protected-target validation, CAS, deletion, active-grant revocation, and audit writes in the existing coordinated authorization transaction. Audit failure rolls back all changes.
- Record `user.deleted` with actor ID, target ID, timestamp, prior/new account state and version, retained responsibility counts, and revoked-grant count. Preserve existing per-grant revocation events. Never include password hashes, session tokens, or private storage references.
- Preserve IDs and all historical records, including approvals, client links, assignments, finance entries, chat attribution, vendor membership, and issued documents. As with deactivation, work is retained and must be reassigned separately; deletion must not silently rewrite owners or approval actors.

### HTTP and authorization

- Add `DELETE /admin/users/:userId` with strict JSON input `{ version: positiveInteger }`.
- Success envelope: `{ data: { userId, deletedAt, version } }`. No credentials or full internal user record are returned.
- Add the operation-specific permission `identity.users.delete`, limited to Super Admin, to the canonical authorization/route-operation registry and synchronized frontend contract. Document the route and schemas in OpenAPI.
- Re-read the current actor inside the transaction. Non-Super-Admin callers receive the established generic forbidden response before target lookup or validation details; unauthenticated/inactive/deleted actors cannot act.
- The sole Super Admin target is immutable, including self-deletion. Return `SOLE_SUPER_ADMIN_IMMUTABLE` without writes.
- Missing target: 404. Stale non-deleted target: `VERSION_CONFLICT` 409. Malformed input: 400 after authorization.
- A repeat request for an already-deleted target returns the stored deletion result without new versions, revocations, or audit events. It cannot restore or modify the account. Concurrent deletions therefore commit at most one deletion event.
- Reject role/status changes to deleted targets. Authentication explicitly rejects deleted users as well as inactive users; existing bearer tokens and password login must fail after deletion.

### Lookup and cache boundaries

- Filter deletion metadata at current-directory/candidate/count boundaries. Keep stable-ID historical and email-uniqueness lookups capable of finding the retained record. Do not apply a global Mongoose exclusion hook or globally hide deleted users from repository historical lookups.
- Retain the existing email uniqueness and vendor-account binding rules. This feature does **not** free an email or vendor identity for reuse, recreate an account, or add restore functionality. Vendor login access remains unavailable after deletion and onboarding must not automatically resurrect it.
- Invalidate directory and dashboard query families plus affected cached access/vendor-login projections identified during implementation. Account totals must reflect the server's updated source of truth; do not fabricate summary values to mask failed reads.

## Permission matrix

| Actor / target | Result |
| --- | --- |
| Active Super Admin / non-deleted non-Super-Admin user | May delete after confirmation and version validation |
| Active Super Admin / already-deleted user | Idempotent result, no new writes |
| Active Super Admin / sole Super Admin | Rejected, immutable identity |
| Any other role / any target | Generic forbidden, no target disclosure or writes |
| Missing, inactive, or deleted actor | Authentication rejected |

## Options and tradeoffs

1. **Logical deletion, recommended:** provides removal from the directory and immediate access revocation while preserving historical attribution. Requires deletion metadata and scoped read filters. Email and vendor bindings remain reserved; there is no restore UI in this scope.
2. **Physical deletion:** would remove the user document but leave numerous historical references unresolved or require a much larger anonymization/reference-migration design. Rejected for this request because immutable actor history and stable identity are repository invariants.

Existing deactivation remains a separate reversible access control. It does not satisfy removal from the list, so merely renaming it Delete is insufficient.

## Scope, assumptions, and operations

- Scope includes the Users list action/dialog, API/types, authorization and OpenAPI inventories, audited transactional persistence, authentication guards, current-account read projections, and focused regression coverage.
- Assumption for approval: “delete user” means removing the account from ordinary use and the Users list while preserving business history. It is not a personal-data erasure request.
- No redesign of the directory, bulk deletion, automatic reassignment, restore flow, email reuse, vendor replacement workflow, cascade deletion, file purge, new dependency, or OCR change is included.
- No unresolved product decision blocks this proposed scope. If physical erasure or reusing a deleted email/vendor login is required, revise this specification before implementation because those change identity lineage and recovery behavior.
- Optional fields need no backfill or seed. Runtime writes remain transactional on a replica set. Deploy the compatible backend before exposing the frontend action; no deployment is authorized by this document.
- Keep deletion metadata and inactive/session state on rollback. Do not roll back to code that can reactivate logically deleted users after real deletions exist; a rollback would require an equivalent deletion guard or suspension of user-management mutations.
- Implementation and tests use synthetic local identities only. No production deletion, migration, notification, email, commit, push, or deployment is authorized.

## Acceptance criteria and verification

| Criterion | Required evidence |
| --- | --- |
| AC1: Delete is available directly on eligible rows, protected row has none, cancellation writes nothing, confirmation has correct identity. | Rendered directory/dialog tests; desktop ~1440px and mobile ~390px interaction and keyboard/focus checks. |
| AC2: Active and inactive users disappear from all directory results/counts; page/filter behavior remains valid. | Mongo/memory parity using unequal roles and statuses; filtered/last-row frontend tests; dashboard current-account aggregation checks. |
| AC3: Only current active Super Admin may delete; protected identity remains intact. | Full role matrix, malformed/missing/stale targets, direct API bypass attempts, no-write/non-disclosure assertions. |
| AC4: Login and existing sessions fail; grants revoke; deleted identities cannot be edited/reactivated or recreated automatically. | Auth/admin/invitation/vendor-access regressions, same-email and vendor-binding fixtures, fresh request after deletion. |
| AC5: History and existing work remain linked by stable IDs. | Two asymmetric identities with different assignments/grants/approval or audit attribution; compare retained records and independent Configuration vendor data. |
| AC6: Deletion, revocations, and audits are atomic and race-safe. | Replica-set tests for concurrent delete/delete, delete/update/reactivate, grant creation versus delete, and injected audit failure; exactly one deletion event. |
| AC7: Error, pending, stale, conflict, retry, and refresh-failure states are truthful and accessible. | Rendered tests and browser interaction checks; no duplicate requests, stale confirmation, unexpected console/network errors, or overflow. |
| AC8: Contracts and existing management behavior remain consistent. | Authorization/route/OpenAPI/frontend-contract checks; existing administration/auth/invitation tests; frontend/backend typechecks and builds; final diff review and `git diff --check`. |

Exact task ownership, test commands, and dependency order belong in the separate task plan after specification approval. No task plan or product implementation is created at this gate.


## Follow-up correction: visibility and Manage entry

The user reported Delete missing both in Manage and the list row. Read-only evidence on the local running backend showed `/openapi.json` still advertised GET/PATCH user routes only. The current source includes DELETE, but the development supervisor loads TypeScript without a watcher; rebuilding did not update that process. AuthProvider keeps the authorization snapshot until login/restore/reload, so the older server/snapshot hides the newly permission-gated action.

The existing approved behavior is retained. The bounded correction adds the same Delete action to Manage for discoverability and refreshes the local development runtime. There is no additional permission, API, persistence, or deletion behavior. Current account-status actions, protected identity, version checks, pending guards, and historical data remain unchanged. No real account deletion is authorized by this follow-up.

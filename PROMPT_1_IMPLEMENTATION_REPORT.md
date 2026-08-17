# Prompt 1 — RBAC Foundation Implementation Report

Completion date: 2026-08-17
Implementation base: `15913b58c33acf16de18ba1498ef2011a58b265b`
Verified implementation HEAD: `482e5852c71c565068da8ef011ff9d373cbc940c`

Normative documents:

- [RBAC foundation design](./docs/superpowers/specs/2026-08-17-prompt-1-rbac-foundation-design.md)
- [Route-operation matrix](./docs/superpowers/specs/2026-08-17-prompt-1-route-operation-matrix.md)
- [Implementation plan](./docs/superpowers/plans/2026-08-17-prompt-1-rbac-foundation.md)

IMPLEMENTATION STATUS

Completed:

- Centralized an exhaustive 16-role catalog, including distinct Admin and Super Admin roles, Estimator/Sales, operational roles, and the Electrician, Plumber, Carpenter, Painter, Civil Worker, and Other Worker trade roles.
- Added the versioned, default-deny authorization policy with 91 permission codes and an independently checked 93-operation human-JWT registry.
- Added `GET /auth/authorization` and an immutable authorization snapshot. The frontend establishes identity and authorization atomically and rejects malformed, stale, role-mismatched, or unknown policy data.
- Added module- and source-aware project access. Existing relationship access remains intact, while additive grants are accepted only for an eligible module/source tuple.
- Migrated all 84 pre-existing human-JWT operations to registered permission enforcement while preserving existing ownership, relationship, Client, and Estimator/Sales restrictions.
- Added transaction-safe `AccessRequest`, `ProjectAccessGrant`, and authorization-coordination persistence for memory and Mongo repositories.
- Added opaque project-access submission, owner history/cancellation, scoped Admin/Super Admin review, exact-request decisions, and exact-grant revocation. Submission never resolves or discloses project existence.
- Added safe Admin/Super Admin user administration with redacted directory DTOs, optimistic versions, current-and-destination role boundaries, responsibility checks, last-Super-Admin protection, and active-grant revocation on deactivation.
- Added a guarded local-only demo seed with deterministic dummy accounts for the new role catalog. It is not a production bootstrap.
- Added permission-aware frontend routing through one 18-entry route registry, explicit presentation-role boundaries, generic non-disclosing access denial, neutral homes, and authorization-derived desktop/mobile navigation.
- Added the Admin/Super Admin user directory and mutation interface.
- Added requester history/create/cancel and reviewer decision/revoke interfaces without Worker assignment or Prompt 2 behavior.
- Completed the integrated Task 17 gate: 14 test files and 338 tests passed; backend/frontend typechecks and production builds passed.
- Completed the fresh Task 18 full gate and final security review with zero Critical or Important findings.

Files Changed:

- Final Prompt 1 range: 164 tracked paths after this report and the implementation-state update (162 implementation/test/config paths plus 2 completion documents).
- Backend production and configuration: `backend/.env.example`, `backend/README.md`, `backend/src/app.ts`, `backend/src/contracts/domain.ts`; authorization files under `backend/src/domain/`; authentication and authorization middleware plus the access-request limiter under `backend/src/middleware/`; `AccessRequest`, `AuthorizationCoordination`, `ProjectAccessGrant`, `User`, and `Evaluation` models; memory/Mongo repository contracts and implementations; all protected route modules plus the new `access-requests.ts`, `admin-users.ts`, and split `estimates.ts`; seed configuration/data/runner; and the affected authorization, access, audit, project, design, estimation, hierarchy, KPI, task, workflow, and user-administration services.
- Backend tests: new `access-policy.test.ts`, `access-request-models.test.ts`, `access-request-mongo.replica-set.test.ts`, `access-request-repository.test.ts`, `access-requests.test.ts`, `audit-security.test.ts`, `auth-authorization.test.ts`, `authorization-policy.test.ts`, `frontend-authorization-contract.test.ts`, `project-module-access.test.ts`, `roles.test.ts`, `route-operation-registry.test.ts`, `super-admin-authorization.test.ts`, `user-administration-mongo.replica-set.test.ts`, and `user-administration.test.ts`; independent route fixtures; and the affected auth, repository, route, workflow, seed, upload, and end-to-end regression suites.
- Frontend production: `frontend/src/api/authorization-contract.ts`, `frontend/src/api/types.ts`; route paths, registry, and router under `frontend/src/app/`; authorization provider/parser/guards and access-denied UI under `frontend/src/auth/`; shell/sidebar/mobile navigation; role feedback; Admin and access-request features; neutral home; `frontend/src/main.tsx`; and scoped administration/theme styles.
- Frontend tests/support: new authorization-contract/parser, `AccessDeniedPage`, `PermissionRoute`, `AccessRequestDialog`, `AccessRequestInboxPage`, `MyAccessRequestsPage`, `UserDirectoryPage`, `UserMutationDialog`, and `NeutralHomePage` tests; `frontend/src/test/authFixtures.ts`; and updated router, authentication, navigation, accessibility, layout, Client, Designer, Manager, Head, and Estimation regression fixtures.
- Documentation and tracked reports: `README.md`; Task 9, 10, and 12–16 reports under `.superpowers/sdd/2026-08-17-prompt-1-rbac-foundation/`; `CODEX_IMPLEMENTATION_PLAN.md`; and this report. The root report is the canonical Prompt 1 completion record.

Database Changes:

- Added the `AccessRequest` collection with:
  - a partial unique `(requesterId, projectId, module)` index for `status: pending`;
  - `(requesterId, createdAt desc, _id desc)`;
  - `(status, createdAt desc, _id desc)`; and
  - `(projectId, status, createdAt desc, _id desc)`.
- Added the `ProjectAccessGrant` collection with:
  - a partial unique `(userId, projectId, module)` index for `active: true`;
  - a partial unique `accessRequestId` index when the field is a string;
  - `(userId, module, active, projectId)`; and
  - `(projectId, source, active, userId)`.
- Added the singleton `AuthorizationCoordination` collection used to serialize authorization-sensitive user and access-request mutations.
- Added integer `User.version` with default `1`. Legacy rows missing the field map to version 1; an expected-version-1 compare-and-swap accepts stored `1` or missing and persists version `2`. Later writes require exact versions.
- No production migration or backfill is required by Prompt 1. Existing users and projects are not rewritten.

API Changes:

- `GET /api/v1/auth/authorization` returns `{ data: { role, policyVersion, permissions } }` for the authenticated, active, stored-role-matching user.
- `GET /api/v1/admin/users` accepts canonical `search`, `role`, `active`, `limit`, and `offset` query parameters and returns redacted paginated items plus server-authoritative `manageableRoles`.
- `PATCH /api/v1/admin/users/:userId` accepts exactly `{ version, role }` or `{ version, active }` and returns `{ user, revokedGrantCount, responsibilities }` in `data`.
- `POST /api/v1/access-requests` accepts `{ projectId, module, reason }` and always returns the same `202 { data: { accepted: true } }` receipt for accepted new, duplicate, known, hidden, or unknown references.
- `GET /api/v1/access-requests/mine` returns paginated, whitelisted owner DTOs without project resolution metadata.
- `POST /api/v1/access-requests/:requestId/cancel` accepts `{ version }` and performs an owner-only pending-request compare-and-swap.
- `GET /api/v1/access-requests/review` returns server-scoped paginated review DTOs: Super Admin is global; Admin is limited to exact `admin_initiator` scope.
- `POST /api/v1/access-requests/:requestId/decision` accepts versioned approved or rejected decisions, resolves the exact stored project ID transactionally, and returns `{ request, grant }` without substituting later grants.
- `POST /api/v1/project-access-grants/:grantId/revoke` accepts `{ version, reason }` and revokes only the exact scoped active grant.
- All 84 prior protected operations now use the registered authorization policy. Existing request/response envelopes, `/auth/me`, login, Client signup, ownership checks, and non-disclosure behavior remain compatible.

Frontend Changes:

- Added a dependency-free frontend mirror of the 16 roles, 91 permission codes, modules, requestability rules, labels, and policy version, with backend parity tests.
- Added strict snapshot parsing: unknown permissions are discarded, known permissions are deduplicated into canonical order, and the snapshot and permission list are frozen.
- Restored and established sessions by loading `/auth/me` and `/auth/authorization` together. User and authorization are committed atomically, share abort/generation/token guards, and are cleared together on accepted failures or logout.
- Replaced role-only page authorization with the 18-entry route registry, explicit permission plus presentation-role enforcement, generic Access Denied rendering, authenticated Not Found rendering, and safe optional request context.
- Added neutral `/home` content for Procurement, Finance Head, Site Manager, and all Worker roles. Admin and Super Admin land on `/admin/users`.
- Derived both desktop and mobile navigation from the same authorization snapshot and route registry.
- Added the responsive Admin/Super Admin user directory and versioned role/activation dialog without create, invite, password, credential, or impersonation controls.
- Added requester and reviewer access-request screens with opaque receipts, immutable row/grant identity, version-conflict fail-closed behavior, live announcements, and accessible dialogs.
- No demo credential is present under `frontend/src`.

Tests Added:

- Backend policy/registry: `backend/tests/access-policy.test.ts`, `authorization-policy.test.ts`, `frontend-authorization-contract.test.ts`, `roles.test.ts`, `route-operation-registry.test.ts`, and `super-admin-authorization.test.ts` cover catalog exhaustiveness, default deny, frontend parity, exact route registration, operation ordering, Super Admin classification, and pre-service denial.
- Backend access persistence/workflow: `access-request-models.test.ts`, `access-request-repository.test.ts`, `access-request-mongo.replica-set.test.ts`, and `access-requests.test.ts` cover schema invariants, indexes, transaction rollback, duplicate races, exact-ID decisions, opaque receipts, authorization coordination, idempotence, and exact-grant revocation.
- Backend authorization/admin: `auth-authorization.test.ts`, `project-module-access.test.ts`, `audit-security.test.ts`, `user-administration.test.ts`, and `user-administration-mongo.replica-set.test.ts` cover snapshot integrity, module/source ceilings, audit redaction, Admin/Super Admin boundaries, legacy-version CAS, responsibility protection, grant cleanup, and last-Super-Admin/access-approval races.
- Frontend authorization: `frontend/src/api/authorization-contract.test.ts`, `frontend/src/auth/authorization.test.ts`, `AccessDeniedPage.test.tsx`, and `PermissionRoute.test.tsx` cover contract immutability, strict parsing, default deny, role parity, safe denial, and presentation-role enforcement.
- Frontend administration/access: `UserDirectoryPage.test.tsx`, `UserMutationDialog.test.tsx`, `AccessRequestDialog.test.tsx`, `MyAccessRequestsPage.test.tsx`, and `AccessRequestInboxPage.test.tsx` cover redacted rendering, canonical requests, version conflicts, pending interaction integrity, accessible focus, opaque duplicate receipts, action permissions, and non-retargeting decisions/revocations.
- Frontend neutral routing: `NeutralHomePage.test.tsx` plus updated route, navigation, shell, authentication, accessibility, and legacy feature tests cover all 16 roles and preserved existing journeys.

Tests Executed:

```bash
cd backend
npm test
npm run typecheck
npm run build

cd frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test
npm run typecheck
npm run build

prompt1_base_commit=$(git log --format=%H --fixed-strings --grep='docs: add Prompt 1 implementation plan' -1)
test -n "$prompt1_base_commit"
git diff --check "$prompt1_base_commit"..HEAD
git diff --check
git status --short
rg -n "authorizeRoles|isRoleAuthorized|requireAccessibleProject\\([^,]+,[^,]+\\)" backend/src
rg -n "worker_assignment.override" backend/src/routes frontend/src
rg -n "admin_initiator" backend/src/routes backend/src/services
rg -n "DEMO_ACCOUNT|LisnoDemo2026" frontend/src
git diff --stat "$prompt1_base_commit"..HEAD
git diff --name-only "$prompt1_base_commit"..HEAD
```

Tests Passed:

- Backend full suite: 51/51 files and 935/935 tests passed in 10.06 seconds.
- Backend typecheck: exit 0 (3.92 seconds wall time).
- Backend production build: exit 0 (4.10 seconds wall time).
- Frontend full suite with hostile `VITE_API_URL`: 73/73 files and 781/781 tests passed in 11.74 seconds.
- Frontend typecheck: exit 0 (4.67 seconds wall time).
- Frontend production build: exit 0 (6.50 seconds wall time); Vite transformed 2,046 modules and completed bundling in 1.53 seconds.
- Task 17 integrated acceptance/security gate: 14/14 files and 338/338 tests passed; both typechecks and both builds passed.
- Range and worktree `git diff --check`: exit 0. Final pre-document worktree status: clean.
- Legacy-role/no-module resolver search: zero matches.
- Worker override search: only the canonical permission contract and its parity test; zero route or UI matches.
- `admin_initiator` search: one review-scope consumption in `access-request.service.ts`; zero lifecycle creation routes.
- Frontend demo-credential search: zero matches.
- Final independent code/security review: zero Critical and zero Important findings.

Tests Failed:

- 0

Known Issues:

- Public-production readiness remains **NO**. Prompt 1 deliberately does not provide a production staff invitation/password-setup flow or a non-destructive first-Super-Admin bootstrap. The destructive demo seed is local-only and must never provision production identities.
- Public signup/project claiming still relies on an unverified Client email association. That Prompt 0 security risk must be remediated before public production signup/project access is enabled.
- Admin review is implemented but remains staged until Prompt 2 project initiation creates `admin_initiator` grants.
- Procurement, Finance, and Execution grants are persisted but dormant until their module workflows are implemented in Prompts 4, 5, and 6.
- `direct_assignment` is modeled but dormant. Estimator/Sales has no access-request/grant path in Prompt 1 and must receive project access only through the future Prompt 2 explicit active-estimator assignment workflow.
- `execution.worker_assignment.override` is a reserved, route-less permission. Worker assignment/reassignment and Worker progress behavior remain deferred to Prompts 6 and 7.
- Authorization coordination serializes user mutations and access-request approval/revocation. Pre-existing responsibility-creating Lead, Estimate, Project, Task, and reporting writers are not all globally serialized with concurrent role changes; broader workflow coordination is deferred to the owning lifecycle phases.
- Non-blocking verification warnings remain: Mongoose warns that the legacy `new` option should migrate to `returnDocument: "after"`, and Vite reports a 682.88 kB minified main chunk above its 500 kB advisory threshold.

Next Recommended Step:

- Obtain separate authorization and design approval for Prompt 2 — Project and Estimation Lifecycle. Prompt 2 implementation has not started.

RBAC FOUNDATION COMPLETE

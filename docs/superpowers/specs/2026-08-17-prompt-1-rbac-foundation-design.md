# Prompt 1 Roles, RBAC, and Authorization Foundation Design

**Date:** 2026-08-17
**Status:** Approved design; written-spec review complete
**Phase:** Prompt 1 only

## Goal

Build the authorization foundation required by the later project lifecycle while preserving every current role and workflow. The backend remains the authority for authentication, role, permission, module, project, and resource checks. The frontend reflects those decisions without becoming a security boundary.

Prompt 1 must finish with a reviewable, default-deny role and permission system at both backend and frontend levels. It must not implement the project lifecycle, procurement, finance, execution, worker KPI, or Super Admin dashboard owned by later prompts.

## Approved product decisions

| Decision | Approved outcome |
|---|---|
| Existing roles | Keep `client`, `designer`, `design_manager`, `design_head`, and `estimator_sales` unchanged as compatibility roles. |
| New platform roles | Add `super_admin`, `admin`, `procurement`, `finance_head`, and `site_manager`. |
| Admin separation | `admin` and `super_admin` are distinct. Only Super Admin has global scope. |
| Role cardinality | Every account has exactly one primary role. |
| Worker roles | Store one explicit trade role per worker: Electrician, Plumber, Carpenter, Painter, Civil Worker, or Other Worker. This deliberate product choice replaces the audit's alternative base-role-plus-category recommendation. |
| Admin project scope | Admin can access only projects that Admin initiated. |
| Staff administration | Super Admin manages every role. Admin manages operational roles only and cannot manage Admin or Super Admin accounts. |
| Staff provisioning for Prompt 1 | Use development/test dummy accounts. Do not implement public staff signup or production invitation delivery in this phase. |
| Client identity | Do not change current client signup, authentication, or project-linking behavior in Prompt 1. |
| Access requests | Active authenticated staff may request eligible project/module access. The initiating Admin reviews its projects; Super Admin has global review and override. |
| Worker reassignment | Register Super Admin's override permission in the foundation, but implement worker assignment/reassignment only with Prompts 6–7. |
| Selected architecture | Use a code-owned canonical role catalog, declarative module/action permissions, shared project-scope policy, and existing resource-ownership checks. |

## Scope

### Included

- A canonical backend role catalog and schemas derived from it.
- A matching frontend role contract protected by contract tests.
- Explicit worker trade role codes mapped to one Worker permission family.
- A code-owned module/action permission catalog with exhaustive role mappings and default-deny fallbacks.
- Permission middleware for protected routes while retaining service-level project and resource checks.
- Explicit Super Admin global data and administrative access across existing protected modules without user impersonation.
- Admin user-directory access limited to operational roles.
- A project/module access-request and access-grant foundation for eligible internal staff.
- Role-aware navigation, explicit access-denied handling, and small Admin/Super Admin user and request-management screens built from existing UI components.
- Development/test seed accounts for every new role and worker trade.
- Regression and security tests covering existing and new roles.
- Implementation-state and Prompt 1 completion documentation after fresh verification.

### Excluded

- Admin project creation, estimator assignment, client approval, project statuses, and lifecycle locking from Prompt 2.
- Design lifecycle or proof-based approval changes from Prompt 3.
- Procurement routes, records, or UI from Prompt 4.
- Finance routes, records, or UI from Prompt 5.
- Execution-task generation, assignment, or reassignment from Prompt 6.
- Worker progress or KPI behavior from Prompt 7.
- Super Admin metrics/dashboard behavior from Prompt 8.
- Cross-module lifecycle integration and final release hardening from Prompts 9–10.
- Real staff invitation delivery, password setup/reset, or production provisioning.
- Any change to client signup or the current email-based client project-claim behavior.
- OCR, estimate calculations, PDF generation, file storage, or visual redesign.

## Approaches considered

### 1. Expand direct role checks

Add the new role strings to the existing allow lists and service branches.

This is the smallest initial diff, but authorization decisions would remain duplicated across routes, services, JWT validation, Mongo schemas, repository access, tests, and frontend routing. New roles could be admitted accidentally by branches that currently only exclude `client`.

### 2. Canonical catalog plus permission and scope policies — selected

Use one code-owned role catalog, an exhaustive module/action permission matrix, a shared project-scope policy, and existing ownership checks.

This preserves the current architecture, makes missing role decisions visible at compile time, establishes a backend permission boundary, and avoids replacing mature resource rules with a speculative policy engine.

### 3. Database-configurable role and permission engine

Persist roles, permission bundles, and policy expressions so administrators can modify them at runtime.

This is more flexible but creates a second authorization source of truth, requires a larger migration and administration surface, and permits security policy changes without deployment or route-level verification. It is outside Prompt 1.

## Canonical role model

The backend owns immutable role codes:

```text
super_admin
admin
estimator_sales
designer
procurement
finance_head
site_manager
worker_electrician
worker_plumber
worker_carpenter
worker_painter
worker_civil
worker_other
design_manager
design_head
client
```

Display labels remain product-friendly, for example `worker_civil` displays as “Civil Worker.” The initial `worker_other` role handles trades outside the named set. Adding another durable trade later requires a catalog entry and its exhaustive permission tests; administrators cannot invent runtime permission-bearing roles.

`WORKER_ROLES` is an explicit catalog-derived set. A `roleFamilyFor(role)` helper maps each trade role to the `worker` family for shared authorization behavior. It must not infer worker status through unvalidated string prefixes.

The role catalog is the source for:

- The TypeScript `Role` type.
- The Mongoose User role enum.
- JWT payload Zod validation.
- Seed and test factories.
- Exhaustive backend permission and project-scope mappings.
- Frontend API role types, with contract tests preventing drift.

Every user stores one role. No user-level permission arrays, multiple roles, or runtime permission overrides are introduced.

## Permission architecture

Permissions are named module/action capabilities, not route names. The exact project-module catalog is:

```text
projects
design
estimation
procurement
finance
execution
```

Identity, organization, audit, access administration, and future own-worker-KPI capabilities are explicitly non-project namespaces and never consult a `ProjectAccessGrant`. `projects` is a core permission namespace and module-aware legacy scope, but is not requestable; project/module requests use Design, Procurement, Finance, or Execution under the approved matrix.

The backend provides:

```text
ROLE_PERMISSIONS: Record<Role, readonly Permission[]>
hasPermission(role, permission)
requirePermission(permission)
```

All maps are exhaustive over `Role`; runtime unknowns return deny. Super Admin receives every registered capability through an explicit global policy. A wildcard in an unvalidated request or persisted user record is never accepted.

`REQUESTABLE_MODULES_BY_ROLE` is a separate exhaustive catalog. It declares which project/module affiliation a role may request, including dormant future-module affiliations, without granting any module action. An access grant becomes usable only when both the current role has the requested module in this catalog and `ROLE_PERMISSIONS` contains the concrete route action. This lets Procurement prepare a scoped grant without making any Procurement API exist or become callable before Prompt 4.

Every protected request follows the applicable layers:

```text
Authentication
  -> active current user and current stored role
  -> module/action permission
  -> project scope or grant
  -> resource relationship/ownership
  -> workflow validation
```

Permission middleware replaces duplicated outer route allow lists where practical. It does not replace service checks such as client ownership, estimator lead ownership, designer assignment, task ownership, manager reporting lines, artifact visibility, optimistic concurrency, or state-transition validation.

Client login, signup, and `/auth/me` response shapes stay unchanged. A separate authenticated `/auth/authorization` contract returns a readonly snapshot containing the current role, a policy version, and server-derived permission codes for navigation and route presentation. The frontend treats missing, unknown, stale, or unparseable codes as deny and loads the snapshot during session establishment and restoration. Those codes are informational to the frontend; every API request is authorized again on the backend.

## Role boundaries

| Role | Prompt 1 authorization boundary |
|---|---|
| `super_admin` | Global project, module, and resource visibility across existing protected functionality; all account/access administration and explicit administrative mutations. |
| `admin` | Operational-user management and access-request review only for Admin-initiated projects. Project initiation and client approval actions are reserved for Prompt 2. |
| `estimator_sales` | Existing owned lead and estimate functionality. Generic project access stays deny-by-default until explicit assignment is implemented later. |
| `designer` | Existing initiated/assigned design projects, design artifacts, and personally owned design tasks. |
| `design_manager` | Existing accountable-manager scope and design-management behavior only. |
| `design_head` | Existing all-project visibility inside legacy design operations only; it is not a platform-global or user-administration role. |
| `procurement` | Identity and neutral authenticated home only. Procurement remains deny-by-default until Prompt 4. |
| `finance_head` | Identity and neutral authenticated home only. Finance remains deny-by-default until Prompt 5. |
| `site_manager` | Identity and neutral authenticated home only. Execution remains deny-by-default until Prompt 6. |
| Worker trade roles | Identity and neutral authenticated home only. Project visibility, execution tasks, and KPI remain deny-by-default until Prompts 6–7. |
| `client` | Existing linked-client project and portal behavior unchanged. |

Super Admin bypasses role, module, project, and resource-scope restrictions for reads and explicit administrative actions. It does not bypass authentication, inactive-account rejection, schema validation, file validation, concurrency control, or workflow-state integrity. Personally attributable actions—such as a client's own response or a worker's own progress update—remain actor-bound and are not performed through another role's legacy endpoint. Where a global override is required, the endpoint must represent an administrative action and audit Super Admin as the actor.

Prompt 1 classifies every existing JWT-protected operation as read, administrative mutation, or personally attributable mutation. Super Admin is added to global reads and valid administrative mutations. Personally attributable mutations remain ownership-bound. The frontend does not add a global project browser or metrics surface before Prompt 8; its Super Admin navigation is limited to user and access administration, while compatible direct-read routes use the same backend global policy.

The normative route classification is checked in beside this design at [Prompt 1 route-operation matrix](./2026-08-17-prompt-1-route-operation-matrix.md). It covers every current human-JWT route plus each Prompt 1 endpoint with method/path, permission code, project module or non-project namespace, preserved legacy relationship rule, operation class, and Super Admin behavior. Implementation must create a code-owned operation registry matching that artifact; tests fail when a human-JWT route is registered without a classification or when a registry entry has no route.

## Project access foundation

### Compatibility access

The existing shared project-scope policy remains authoritative for current relationships:

- Client: linked `clientId` only.
- Designer: initiating or assigned designer.
- Design Manager: accountable `managerId` only.
- Design Head: all projects inside its legacy design-operation permissions.
- Estimator/Sales: no generic project visibility.

No current relationship is rewritten or copied into the new grant model.

### New project/module grants

New-role access uses an additive `ProjectAccessGrant` record rather than overloading `assignedDesignerIds` or `managerId`.

Required fields:

- `id`
- `projectId`
- `userId`
- `module`
- `source`: `access_request`, `direct_assignment`, or `admin_initiator`
- nullable `accessRequestId`, required and unique when `source` is `access_request`
- `grantedById`
- `active`
- `grantedAt`
- `revokedAt`, `revokedById`, and `revocationReason`
- optimistic-concurrency version and timestamps

Only one active grant may exist for the same user, project, and module. Mongo uses a partial unique index and the memory repository enforces the same rule.

A grant supplies project/module scope only. The role matrix remains the ceiling. A grant can never make a Worker a Finance user, let Procurement approve Design, or let Admin access another Admin's project.

Prompt 2 will create the `admin_initiator` grant transactionally when Admin initiates a project. Until that relationship exists, Admin has no access to legacy projects. Later assignment dropdowns create role-appropriate direct grants only after independently validating that the selected person is active and has the expected role.

Worker access is not represented by a broad project grant. Prompts 6–7 will use direct execution-task ownership; Super Admin's reserved reassignment override will operate on those assignments.

### Module-aware resolution

The existing role-only `requireAccessibleProject` primitive is insufficient for grants. Prompt 1 replaces project-resource authorization calls with an explicit module-aware boundary:

```text
canAccessProjectModule(actor, projectId, module)
requireProjectModuleAccess(actor, projectId, module)
projectFilterForUserInModule(actor, module)
```

Resolution is ordered and default-deny:

1. Reload and validate the active actor and stored role.
2. Require the route's module/action permission.
3. Allow Super Admin's explicit global scope.
4. Evaluate the existing client/designer/manager/head relationship when that relationship is valid for the requested module.
5. Otherwise require an active grant matching the exact actor, project, and module, and re-check that the current role is eligible for that module.
6. Apply the resource's existing ownership, relationship, visibility, and workflow checks.

A grant for one module never satisfies another module. Every project-backed human JWT route supplies a compile-time module constant, including direct-Mongoose query paths. Memory and Mongo query builders implement the same module-aware filter. The legacy no-module helper is removed from production project-resource paths or retained only as a compatibility wrapper that requires an explicit module at its call site.

An exact module grant may expose only the minimal project identity needed to name and navigate that module. It must not expose another module's artifacts or a broader legacy project DTO. Existing role-scoped project lists retain their current DTO and behavior.

## Access-request workflow

Only active authenticated internal staff can request access. Anonymous users and clients cannot use the workflow.

An `AccessRequest` contains:

- `id`
- `requesterId`
- the syntactically validated, immutable existing Project ID supplied by the requester as `projectId`
- `module`
- a bounded reason
- status: `pending`, `approved`, `rejected`, or `cancelled`
- reviewer and decision reason
- reviewed timestamp, optimistic-concurrency version, and timestamps

Submission rules:

1. The requested module must match this initial `REQUESTABLE_MODULES_BY_ROLE` matrix: Designer → Design, Procurement → Procurement, Finance Head → Finance, and Site Manager → Execution. Admin, Super Admin, Estimator/Sales, compatibility manager/head roles, clients, and Worker trade roles have no requestable module in Prompt 1. Estimator assignment remains exclusively deferred to Prompt 2's Admin-selected active Estimator/Sales workflow.
2. A grant never supplies a concrete route action absent from `ROLE_PERMISSIONS`.
3. A repeated pending request with the same immutable Project ID and module is treated idempotently; it does not create duplicates.
4. Submission grants no access.
5. Valid and unknown/hidden Project ID submissions create the same opaque own-request receipt and return the same `202` body `{ "data": { "accepted": true } }`, without an ID, title, duplicate flag, resolution state, or status that confirms project existence. Invalid role/module eligibility remains a role-level `403` independent of the Project ID.
6. The requester may cancel a known pending request from the authenticated own-request list. Cancellation grants nothing and is audited.

The Project ID uses a bounded opaque-ID schema compatible with existing seed IDs such as `project-aurora-villa` and generated IDs such as `project-<random UUID>`; it is not validated as a bare UUID and requires no backfill. The own-request DTO echoes only the same ID the requester supplied, requested module, neutral status, and timestamps until a reviewer decides it; it never returns a resolved project title or other project data. Submission is rate-limited. Admin review lists only IDs that resolve to that Admin's own project. Super Admin review may identify unknown IDs and reject them. Approval resolves that exact immutable ID inside the decision transaction and cannot substitute a different project; unknown IDs are unapprovable and receive only a generic rejection reason.

Procurement, Finance, and Execution grants approved in Prompt 1 are dormant authorization records until their later module routes exist. Design grants are consumed through the module-aware resolver while existing task, artifact, and workflow ownership rules still apply. Estimation requests and grants are not created in Prompt 1 because existing lead/estimate routes are owner-scoped rather than project-scoped; Prompt 2 introduces the approved Admin-to-Estimator assignment relationship.

Review rules:

- Admin can list and decide requests only for projects with that Admin's active `admin_initiator` grant.
- Super Admin can list and decide requests globally.
- Super Admin's global scope does not permit a role-ineligible grant.
- Approval resolves the exact stored Project ID and revalidates the requester's active status and current role, then creates or activates the grant and resolves the request in one transaction.
- Rejection and revocation require a reason and are concurrency-safe and idempotent.
- Decisions, grants, and revocations create audit events.

Prompt 1 creates no `admin_initiator` grant because Admin project initiation belongs to Prompt 2. Therefore Super Admin is the only reviewer with real reviewable requests against legacy projects during Prompt 1. The Admin inbox and backend policy are implemented and tested with bounded fixtures, but become operational only after Prompt 2 creates the first Admin-initiated project. This is staged availability, not a bootstrap relationship or lifecycle implementation.

The resource endpoints retain their existing non-disclosure behavior. Access is requested through a dedicated endpoint, not by weakening project-detail 404 behavior.

## User administration and dummy accounts

Prompt 1 introduces a redacted, paginated user directory. Responses may contain identifiers, name, email, role, active state, display metadata, and timestamps, but never password hashes or secrets.

Super Admin may view and manage every account type. Admin may view and manage only these operational roles:

```text
estimator_sales
designer
procurement
finance_head
site_manager
all worker trade roles
```

`OPERATIONAL_ROLES` is one canonical allowlist. For an Admin-performed mutation, both the target's current role and any requested destination role must be in that allowlist. Admin therefore cannot promote an operational user to Admin, Super Admin, Client, Design Manager, or Design Head through a destination-role gap. Admin cannot mutate its own role. Super Admin cannot deactivate or demote the last active Super Admin. Mutations re-check the actor, target, current role, requested role, and optimistic-concurrency version inside the transaction.

Role changes never rewrite or silently orphan domain relationships. A role change is rejected with `409 RESPONSIBILITY_REASSIGNMENT_REQUIRED` when active role-dependent responsibilities would become invalid, including owned active leads/estimates, active designer tasks/projects, reporting relationships, or Admin-initiator relationships. When a safe role change succeeds, all active additive project/module grants are revoked and audited; they must be deliberately re-granted for the new role.

Authorized deactivation remains available for account-security response even when work is active. It immediately blocks authentication, revokes active additive grants, records affected responsibility counts, and leaves legacy assignments visible for later reassignment rather than deleting history. Reactivation does not restore revoked additive grants. Legacy project/task/lead relationships remain unchanged and resume their existing behavior only where still role-compatible.

Typed audit actions include `user.role_changed`, `user.activated`, `user.deactivated`, `access_request.created`, `access_request.cancelled`, `access_request.approved`, `access_request.rejected`, `project_access.granted`, and `project_access.revoked`. Audit old/new values must never include passwords, hashes, tokens, or invitation secrets.

Prompt 1 does not add a production staff-create endpoint. Development and test seeds provide one usable dummy account for every new platform role and every worker trade role while preserving existing fixtures. Seed credentials come from the seed configuration and are documented for local developers, never rendered in production UI.

The destructive demo seed command is fail-closed: it requires both a non-production runtime environment and a separate affirmative `ALLOW_DEMO_SEED=true` opt-in, checked before database connection or mutation. Production-like configuration, a missing opt-in, or an invalid value must perform zero deletes and zero writes. The demo seed is never a production Super Admin bootstrap.

Real invitation, one-time activation, password-setup delivery, and a controlled non-destructive first-Super-Admin bootstrap remain the recommended production model but are deferred to a separately approved identity/release-hardening task. Prompt 1 is not production-deployable for privileged staff provisioning, and public-production readiness remains false until that boundary exists.

Client signup, login, activation behavior, and project claiming remain unchanged at the user's direction. The existing unverified-email project-claim risk remains explicitly documented as a public-production blocker.

## API surface

Exact route naming may follow the repository's existing route conventions, but the supported behaviors are:

| Behavior | Authorization |
|---|---|
| Current authenticated user | Existing `/auth/me`; response remains unchanged |
| Current authorization snapshot | Any authenticated active user; exact readonly role/policy-version/permission-code contract |
| Paginated/filterable user directory | Admin sees operational users; Super Admin sees all |
| Change eligible user's role or active state | Admin requires both current and destination roles in `OPERATIONAL_ROLES`; Super Admin global boundary and relationship preconditions |
| Submit access request | Eligible active internal staff only |
| List own access requests | Requesting active internal staff |
| Cancel own pending access request | Request owner only |
| List reviewable access requests | Super Admin for Prompt 1 legacy projects; initiating Admin support activates with Prompt 2 projects |
| Approve or reject request | Super Admin for Prompt 1 legacy projects; initiating Admin support activates with Prompt 2 projects |
| Revoke project/module grant | Super Admin for Prompt 1 legacy projects; initiating Admin support activates with Prompt 2 projects |

Validation schemas use canonical role, module, status, bounded-text, pagination, and optimistic-concurrency contracts. Repository/service operations exist in both memory and Mongo implementations with matching behavior.

## Frontend design

The existing AppShell, navigation primitives, fields, dialogs, feedback, async states, and responsive patterns are reused. Prompt 1 does not redesign the application.

### Navigation and routing

- Navigation is derived from the separately loaded authorization snapshot plus registered frontend routes. Until a valid snapshot is loaded, protected navigation and route checks fail closed behind the existing authenticated loading state.
- Hiding a link never substitutes for backend authorization.
- Direct navigation uses explicit permission-aware route guards.
- Existing Client, Designer, Design Manager, Design Head, and Estimator/Sales destinations remain unchanged.
- Admin receives only operational-user and access-request administration screens.
- Super Admin receives global user and access-request administration, not the Prompt 8 metrics dashboard.
- Procurement, Finance Head, Site Manager, and worker trade roles receive a neutral authenticated home until their modules are implemented.
- Eligible internal roles receive a My access requests destination that accepts an immutable existing Project ID, eligible module, and reason; it does not depend on discovering a hidden project through a resource API.

### Denied and request states

- `401` clears the invalid session and returns to login.
- `403` renders an explicit Access Denied page instead of silently redirecting.
- Hidden resources continue to use Not Found behavior.
- A known, non-hidden project-context Access Denied page may link to My access requests with safe module/Project-ID context. A hidden-resource `404` never reveals a project name or renders a request dialog.
- Role-forbidden modules and clients never show the request action.
- Submission uses a small existing-style dialog with project/module context, bounded reason, pending state, success feedback, and retryable error handling.
- Admin and Super Admin use a compact request inbox built from existing list/surface components.

Dummy credentials are local documentation only and are not shown by the application.

## Error and security semantics

- Missing, malformed, expired, inactive, or invalid authentication returns `401` through existing auth conventions.
- A known endpoint without module/action permission returns `403`.
- Inaccessible project/resource identifiers continue returning `404` where the current service prevents existence disclosure.
- Optimistic-concurrency mismatches return `409`.
- Validation failures return the existing structured `400` error format.
- Access-request submission gives valid, duplicate-valid, unknown, and hidden Project IDs the same status/body and creates the same opaque own-request receipt without resolved project identity. Tests also compare headers and observable validation text; timing is kept indistinguishable as far as practical.
- Unknown role or permission values default-deny and are never coerced to a nearby role.
- The extraction worker's shared-secret authentication remains separate from human Worker trade roles.

## Data rollout and compatibility

The rollout is additive:

1. Deploy readers and validators that accept every existing role plus the new canonical values.
2. Deploy the exhaustive permission and project-scope policies with new roles default-denied from future modules.
3. Create the AccessRequest and ProjectAccessGrant collections and indexes. No existing record requires backfill.
4. Preserve every existing user's role, active state, manager relationship, and token behavior.
5. Preserve every existing project's client/designer/manager relationships.
6. Add development/test dummy users through the seed system only.

Existing JWTs remain valid because no existing role value is renamed. The current request-time database reload continues invalidating tokens when a user's active state or stored role changes.

No migration guesses new roles, creates grants for existing users, or changes project ownership. Any future production staff provisioning and any project-lifecycle backfill require their own dry-run, idempotent migration design.

## Testing strategy

Implementation follows red-green-refactor.

### Domain and repository tests

- Canonical role catalog and frontend/backend contract parity.
- Exact `ProjectModule`, `PermissionCode`, and route-operation registry parity with the normative matrix.
- One-to-one coverage between registered human-JWT routes and operation classifications.
- Exhaustive permission mapping for every role.
- Identical Worker-family permissions for every trade role.
- Runtime unknown-role default deny.
- Existing and new project scopes in memory and Mongo.
- Active-grant uniqueness, query behavior, revocation, and non-broadening role ceiling.
- Access-request deduplication, status transitions, transactions, and concurrency.

### Authentication and administration tests

- Login and `/auth/me` for every seeded role.
- Inactive account rejection and stored-role/token mismatch rejection.
- Admin operational-user visibility and mutation boundary.
- Admin destination-role enforcement using the same `OPERATIONAL_ROLES` allowlist for current and requested roles.
- Admin denial against Admin, Super Admin, Client, Design Manager, and Design Head targets.
- Super Admin global user management.
- Protection of the last active Super Admin.
- Role-change responsibility preconditions, grant revocation, deactivation, and non-restoring reactivation.
- Fail-closed demo seed behavior with zero database mutation unless both safety gates pass.

### Required negative authorization matrix

- Worker to Finance denied.
- Worker to Procurement denied.
- Worker to another worker's task denied.
- Designer to Finance denied.
- Procurement to Design approval denied.
- Finance Head to execution mutation denied.
- Site Manager to project approval denied.
- Estimator/Sales to project approval denied.
- Admin to another Admin's project denied.
- Anonymous user to access-request API denied.
- Client to staff access-request API denied.

Where a later module endpoint does not yet exist, Prompt 1 tests the production permission policy and route registration default-deny behavior without creating that future domain API.

### Positive and regression tests

- Super Admin global reads and administrative mutations across every existing protected route family exactly as classified in the route-operation matrix, with personally attributable legacy mutations denied.
- Existing Client project isolation and portal behavior.
- Existing Estimator/Sales lead and estimate ownership.
- Existing Designer assignment and task ownership.
- Existing Design Manager reporting relationships and Design Head legacy visibility.
- Access-request approval grants only the eligible project/module scope.
- A module-A grant cannot list, read, or mutate module-B resources.
- Revocation removes that scope immediately.

### Frontend tests

- Permission-derived navigation for every role.
- Direct-route guards and explicit Access Denied behavior.
- Request action eligibility, submission, feedback, and duplicate-pending behavior.
- My access requests submission/cancellation and identical non-disclosing acceptance responses.
- Admin versus Super Admin directory and inbox scope.
- Neutral homes for future-module roles.
- Existing role redirects and screens remain unchanged.
- Keyboard, focus, accessible-name, and automated accessibility checks for new UI.

### Full verification

- Focused backend and frontend tests while implementing each slice.
- Complete backend test suite, typecheck, and production build.
- Complete frontend test suite under the hostile API-base environment, typecheck, and production build.
- Migration/index checks where applicable.
- Git diff, whitespace, and scope checks.
- Final code and security review before completion is claimed.

## Acceptance criteria

1. Every persisted and authenticated role comes from one canonical catalog.
2. Existing role values and workflows remain compatible.
3. Every protected route has explicit authentication and module/action authorization; resource services retain project and ownership checks.
4. Super Admin has global read and administrative scope exactly as classified, without impersonating personal actions or bypassing authentication/workflow integrity.
5. Admin can manage only accounts whose current and destination roles are operational, and can access only Admin-initiated projects.
6. Every Worker trade role has the same Worker-family permissions and one trade per account.
7. New future-module roles remain default-denied from unimplemented functionality.
8. Eligible internal staff can request scoped project/module access without receiving access before approval.
9. Super Admin reviews Prompt 1 requests globally; the same policy permits Admin review only after Prompt 2 creates that Admin's initiator relationship.
10. Approved grants never exceed the requester's role ceiling and can be revoked safely.
11. Frontend navigation and route guards mirror permissions while the backend remains authoritative.
12. Dummy accounts exist only through development/test seed behavior, and demo seeding requires both a non-production environment and explicit opt-in before any database mutation.
13. Client signup and current client linking are unchanged and the known release risk remains documented.
14. Required negative authorization tests and existing-role regression tests pass.
15. Full backend/frontend tests, typechecks, builds, diff checks, and final review pass.

## Completion boundary

After the acceptance criteria are verified:

- Update `CODEX_IMPLEMENTATION_PLAN.md` to mark Prompt 1 complete.
- Add the exact verification evidence and remaining deferred risks.
- End the Prompt 1 report with `RBAC FOUNDATION COMPLETE`.
- Stop before Prompt 2.

Prompt 2 and every later phase require separate authorization.

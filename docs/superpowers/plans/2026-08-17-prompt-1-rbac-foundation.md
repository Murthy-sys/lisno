# Prompt 1 RBAC and Authorization Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Prompt 1's canonical roles, permission and route-operation policy, scoped project access, access-request workflow, safe user administration, dummy development accounts, and permission-aware frontend without starting Prompt 2 or changing the client workflow.

**Architecture:** The backend owns one immutable role catalog, one exhaustive permission catalog, and one 93-entry human-JWT operation registry. Route middleware enforces authentication and action permission, module-aware services enforce legacy relationships or exact additive grants, and resource services preserve ownership and workflow rules. The frontend loads a separately versioned authorization snapshot, fails closed, and derives route presentation from registered permissions; it is never the security boundary.

**Tech Stack:** TypeScript 5.8, Express 5, Mongoose 9, Zod, JSON Web Tokens, React 19, React Router 7, TanStack Query 5, Vite 6, Vitest 3, Testing Library, MSW.

## Global Constraints

- Implement Prompt 1 only. Do not start Admin project initiation, estimator assignment, lifecycle status changes, procurement, finance, execution, worker KPI, worker reassignment, Super Admin metrics, integration, or Prompt 2+ UI/API work.
- Treat [the approved RBAC design](../specs/2026-08-17-prompt-1-rbac-foundation-design.md) and [the 93-row route-operation matrix](../specs/2026-08-17-prompt-1-route-operation-matrix.md) as normative.
- Preserve `client` signup, login, `/auth/me`, client project linking/claiming, client response flows, and existing response envelopes. The known unverified-email claim risk remains documented and unfixed in Prompt 1.
- Keep `estimator_sales` outside project access requests and generic project grants. Prompt 2 alone will assign an active Estimator/Sales user from a role-filtered dropdown.
- Keep `admin` and `super_admin` distinct. Admin has no legacy project scope and no real reviewable Prompt 1 project until Prompt 2 creates an `admin_initiator` grant. Super Admin has global reads and audited administrative actions, but never enters personally attributable legacy mutations.
- Store one primary role per account. Worker trade roles are explicit codes and share the Worker permission family through an explicit set, never through prefix inference.
- The backend remains authoritative. Frontend navigation and guards fail closed but never replace backend permission, project, ownership, workflow, version, or validation checks.
- Do not add public staff signup, production staff-create, invitation, password-setup/reset, or first-Super-Admin bootstrap behavior. Dummy accounts are development/test seed data only.
- Demo seeding is destructive and must check runtime opt-in plus a local demo-target fingerprint before connection, delete, or write: `NODE_ENV` is `development` or `test`, `ALLOW_DEMO_SEED` is exactly `true`, and the URI is a loopback non-SRV Mongo target whose database exactly matches an explicit `DEMO_SEED_DATABASE` name in the `lisno_demo*`/`lisno_test*` namespace.
- Access-request submission must never resolve or query the supplied Project ID. Exact resolution occurs only in the review decision transaction.
- Use test-driven development for every behavior change: write the named failing test, run it and observe the expected failure, implement the minimum behavior, rerun focused tests, then commit.
- Preserve existing OCR, estimate calculations, PDF generation, email, storage, optimistic-concurrency, and file-validation behavior.
- Do not stage or alter unrelated user changes. Run `git status --short` before each commit and stage only the files named by that task.
- Do not mark Prompt 1 complete or edit the implementation state to complete until Task 18's fresh full verification is green.

---

## File Map

### Backend domain, middleware, and identity

- Create `backend/src/domain/roles.ts`: canonical role codes, schemas, Worker family, operational-role catalog, labels, and runtime guards.
- Create `backend/src/domain/authorization.ts`: project modules, requestability, permission codes, exhaustive role permissions, policy version, and snapshot builder.
- Create `backend/src/domain/route-operations.ts`: all 93 normative method/path classifications.
- Create `backend/src/domain/operation-context.ts`: AsyncLocalStorage binding from the registered route operation to project-scope resolution.
- Create `backend/src/domain/audit-actions.ts`: typed Prompt 1 and existing audit action catalog plus sensitive-key scrubber contract.
- Create `backend/src/middleware/authorization.ts`: `requirePermission` and registry-backed `requireOperation`.
- Create `backend/src/middleware/access-request-rate-limit.ts`: bounded actor/IP submission limiter.
- Modify `backend/src/contracts/domain.ts`: re-export canonical `Role` instead of declaring another union.
- Modify `backend/src/middleware/auth.ts`: retain authentication, mark human-JWT middleware for coverage introspection, and remove `authorizeRoles` only after all callers migrate.
- Modify `backend/src/services/auth.service.ts`: derive JWT role validation from the catalog and expose the authorization snapshot without changing existing auth payloads.
- Modify `backend/src/routes/auth.ts`: classify `/auth/me` and add `/auth/authorization`.

### Backend persistence and workflows

- Create `backend/src/models/AccessRequest.ts`.
- Create `backend/src/models/ProjectAccessGrant.ts`.
- Create `backend/src/models/AuthorizationCoordination.ts`: singleton transactional write lock shared by grant decisions, revocations, role changes, deactivations, and last-Super-Admin safety.
- Modify `backend/src/models/User.ts`: canonical enum and API-facing optimistic version.
- Modify `backend/src/models/Evaluation.ts`: allow `super_admin` as an evaluator without weakening subject/workflow rules.
- Modify `backend/src/models/AuditEvent.ts`: typed action validation if schema enforcement is used.
- Modify `backend/src/repositories/types.ts`: new records, filters, pagination, CAS transitions, user-administration primitives, module-aware project queries, and seed arrays.
- Modify `backend/src/repositories/memory.ts`: transaction-safe parity for every new repository method.
- Modify `backend/src/repositories/mongo.ts`: session-aware queries, CAS, indexes, review joins, and module-aware filters.
- Modify `backend/src/domain/project-access.ts`: module-aware legacy scope and source-aware additive grants.
- Modify `backend/src/services/workflow.ts`: exact registry-bound `requireProjectOperationAccess` boundary.
- Create `backend/src/services/access-request.service.ts`.
- Create `backend/src/services/user-administration.service.ts`.
- Modify `backend/src/services/audit.service.ts`: typed actions, Super Admin reads, and recursive secret scrubbing.
- Modify `backend/src/services/project.service.ts`, `task.service.ts`, `hierarchy.service.ts`, `kpi.service.ts`, `evaluation.service.ts`, `project-activity.service.ts`, `design-version.service.ts`, `design-section.service.ts`, `lead.service.ts`, `estimate-design.service.ts`, and `estimate-plan-review.service.ts`: route-matrix behavior and preserved resource rules.

### Backend routes and wiring

- Create `backend/src/routes/admin-users.ts`.
- Create `backend/src/routes/access-requests.ts`.
- Create `backend/src/routes/estimates.ts`: behavior-preserving extraction of estimate rows 72–84 from the oversized lead router.
- Modify `backend/src/routes/projects.ts`, `tasks.ts`, `organization.ts`, `kpis.ts`, `evaluations.ts`, `audit.ts`, `design-versions.ts`, `design-sections.ts`, `estimate-designs.ts`, `estimate-plan-review.ts`, and `leads.ts`: replace direct role gates with exact operation registrations.
- Modify `backend/src/app.ts`: construct and mount the new services/routes and split estimate router.

### Seed and documentation

- Create `backend/src/seed/config.ts`: seed safety predicate, dummy-account catalog, and local-only credential configuration.
- Modify `backend/src/seed/data.ts`: one deterministic dummy account for each new platform and Worker trade role; empty access request/grant arrays.
- Modify `backend/src/seed/run.ts`: fail-closed pre-connection/target gate and reset the new access/grant/coordination collections.
- Modify `backend/.env.example`, `backend/README.md`, and `README.md`: safe seed invocation and local credentials; no credentials in product UI.

### Frontend

- Create `frontend/src/api/authorization-contract.ts`: exact role, permission, module, policy-version, label, Worker, and operational-role mirrors.
- Create `frontend/src/auth/authorization.ts`: strict snapshot parsing and permission helpers.
- Create `frontend/src/auth/PermissionRoute.tsx` and `frontend/src/auth/AccessDeniedPage.tsx`.
- Create `frontend/src/app/routeRegistry.ts`: permission and navigation metadata for every current/new frontend route.
- Create `frontend/src/features/home/NeutralHomePage.tsx`.
- Create `frontend/src/features/admin/adminApi.ts`, `frontend/src/features/admin/UserDirectoryPage.tsx`, and `frontend/src/features/admin/UserMutationDialog.tsx`.
- Create `frontend/src/features/access/accessRequestsApi.ts`, `frontend/src/features/access/MyAccessRequestsPage.tsx`, `frontend/src/features/access/AccessRequestDialog.tsx`, `frontend/src/features/access/AccessRequestInboxPage.tsx`, `frontend/src/features/access/AccessRequestDecisionDialog.tsx`, and `frontend/src/features/access/GrantRevocationDialog.tsx`.
- Create `frontend/src/styles/access-administration.css` and `frontend/src/test/authFixtures.ts`.
- Modify `frontend/src/api/types.ts`, `frontend/src/auth/AuthProvider.tsx`, `frontend/src/auth/ProtectedRoute.tsx`, `frontend/src/app/routePaths.ts`, `frontend/src/app/router.tsx`, `frontend/src/components/layout/navigation.ts`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/MobileHeader.tsx`, `frontend/src/content/roleFeedback.ts`, `frontend/src/auth/LoginPage.tsx`, `frontend/src/main.tsx`, and `frontend/src/styles/role-themes.css`.
- Modify authenticated-session mocks in `frontend/src/app/router.test.tsx`, `frontend/src/auth/AuthProvider.test.tsx`, `frontend/src/auth/LoginPage.test.tsx`, `frontend/src/auth/SignupPage.test.tsx`, `frontend/src/components/layout/AppShell.test.tsx`, `frontend/src/features/client/ClientDashboard.collapsible.test.tsx`, `frontend/src/features/client/ClientDashboard.test.tsx`, `frontend/src/features/client/ClientProject.test.tsx`, `frontend/src/features/designer/DesignerDashboard.test.tsx`, `frontend/src/features/designer/ProjectWorkspace.test.tsx`, `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`, `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`, `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`, `frontend/src/features/head/HeadDashboard.test.tsx`, `frontend/src/features/leads/LeadDashboard.pdf.test.tsx`, `frontend/src/features/leads/LeadDashboard.test.tsx`, `frontend/src/features/manager/DesignerDetail.test.tsx`, `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`, `frontend/src/features/manager/ManagerDashboard.test.tsx`, and `frontend/src/test/accessibility.test.tsx`.

### Tests

- Create `backend/tests/roles.test.ts`, `backend/tests/frontend-authorization-contract.test.ts`, `backend/tests/authorization-policy.test.ts`, `backend/tests/route-operation-registry.test.ts`, `backend/tests/auth-authorization.test.ts`, `backend/tests/access-policy.test.ts`, `backend/tests/access-request-models.test.ts`, `backend/tests/access-request-repository.test.ts`, `backend/tests/project-module-access.test.ts`, `backend/tests/access-requests.test.ts`, `backend/tests/access-request-mongo.replica-set.test.ts`, `backend/tests/user-administration.test.ts`, `backend/tests/user-administration-mongo.replica-set.test.ts`, `backend/tests/audit-security.test.ts`, and `backend/tests/super-admin-authorization.test.ts`.
- Create `backend/tests/fixtures/prompt-1-route-operations.ts`: independent exact 93-row test oracle transcribed from the normative matrix.
- Create `frontend/src/api/authorization-contract.test.ts`, `frontend/src/auth/authorization.test.ts`, `frontend/src/auth/PermissionRoute.test.tsx`, `frontend/src/auth/AccessDeniedPage.test.tsx`, `frontend/src/features/home/NeutralHomePage.test.tsx`, `frontend/src/features/admin/UserDirectoryPage.test.tsx`, `frontend/src/features/admin/UserMutationDialog.test.tsx`, `frontend/src/features/access/MyAccessRequestsPage.test.tsx`, `frontend/src/features/access/AccessRequestDialog.test.tsx`, and `frontend/src/features/access/AccessRequestInboxPage.test.tsx`.
- Modify the exact existing backend family tests named by Tasks 6–11.
- Create `PROMPT_1_IMPLEMENTATION_REPORT.md` and modify `CODEX_IMPLEMENTATION_PLAN.md` only in Task 18.

---

## Stable Contracts Used by Later Tasks

Use these exact public shapes throughout the plan:

~~~typescript
export const AUTHORIZATION_POLICY_VERSION = "2026-08-17.prompt-1" as const;

export interface AuthorizationSnapshot {
  readonly role: Role;
  readonly policyVersion: typeof AUTHORIZATION_POLICY_VERSION;
  readonly permissions: readonly PermissionCode[];
}

export type ProjectModule =
  | "projects"
  | "design"
  | "estimation"
  | "procurement"
  | "finance"
  | "execution";

export type RequestableProjectModule =
  | "design"
  | "procurement"
  | "finance"
  | "execution";
~~~

`GET /auth/authorization` returns:

~~~json
{
  "data": {
    "role": "designer",
    "policyVersion": "2026-08-17.prompt-1",
    "permissions": ["identity.self.read", "identity.authorization.read"]
  }
}
~~~

Do not rename `permissions` to `permissionCodes` in either layer. Existing `/auth/me`, login, and signup shapes remain byte-for-byte compatible at the JSON-field level.

---

### Task 1: Centralize the canonical role catalog

**Files:**

- Create: `backend/src/domain/roles.ts`
- Modify: `backend/src/contracts/domain.ts`
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/domain/project-access.ts`
- Test: `backend/tests/roles.test.ts`
- Test: `backend/tests/auth.test.ts`

**Interfaces:**

- Consumes: existing five persisted role values and JWT payloads.
- Produces: `ROLE_CODES`, `Role`, `roleSchema`, `WORKER_ROLES`, `WorkerRole`, `RoleFamily`, `OPERATIONAL_ROLES`, `isRole`, `isWorkerRole`, `roleFamilyFor`, and exhaustive display labels.
- Preserves: one role per user, existing tokens, `PublicUser`, `AuthPayload`, and client signup behavior.

- [ ] **Step 1: Write the failing role-catalog tests**

~~~typescript
import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  WORKER_ROLES,
  isRole,
  roleFamilyFor
} from "../src/domain/roles.js";

it("exposes the exact sixteen canonical role codes", () => {
  expect(ROLE_CODES).toEqual([
    "super_admin",
    "admin",
    "estimator_sales",
    "designer",
    "procurement",
    "finance_head",
    "site_manager",
    "worker_electrician",
    "worker_plumber",
    "worker_carpenter",
    "worker_painter",
    "worker_civil",
    "worker_other",
    "design_manager",
    "design_head",
    "client"
  ]);
});

it.each(WORKER_ROLES)("maps %s to the Worker family", (role) => {
  expect(roleFamilyFor(role)).toBe("worker");
});

it("does not infer Worker membership from a string prefix", () => {
  expect(isRole("worker_roofer")).toBe(false);
});

it("keeps the Admin operational boundary exact", () => {
  expect(OPERATIONAL_ROLES).toEqual([
    "estimator_sales",
    "designer",
    "procurement",
    "finance_head",
    "site_manager",
    ...WORKER_ROLES
  ]);
});

it.each([
  "super_admin",
  "admin",
  "procurement",
  "finance_head",
  "site_manager",
  ...WORKER_ROLES
] as const)("keeps %s at no legacy project scope during catalog rollout", (role) => {
  expect(projectAccessScopeForUser({ id: `user-\${role}`, role })).toEqual({
    kind: "none"
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify RED**

Run:

~~~bash
cd backend
npm test -- tests/roles.test.ts
~~~

Expected: failure because `domain/roles.ts` does not exist and roles are duplicated.

- [ ] **Step 3: Implement the dependency-free role constants and Zod schema**

~~~typescript
import { z } from "zod";

export const ROLE_CODES = [
  "super_admin",
  "admin",
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other",
  "design_manager",
  "design_head",
  "client"
] as const;

export type Role = (typeof ROLE_CODES)[number];
export const roleSchema = z.enum(ROLE_CODES);

export const WORKER_ROLES = [
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other"
] as const satisfies readonly Role[];

export type WorkerRole = (typeof WORKER_ROLES)[number];
export type RoleFamily = Exclude<Role, WorkerRole> | "worker";

export const OPERATIONAL_ROLES = [
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  ...WORKER_ROLES
] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLE_CODES.some((role) => role === value);
}

export function isWorkerRole(role: Role): role is WorkerRole {
  return (WORKER_ROLES as readonly Role[]).includes(role);
}

export function roleFamilyFor(role: Role): RoleFamily {
  return isWorkerRole(role) ? "worker" : role;
}
~~~

- [ ] **Step 4: Replace each backend role declaration with the catalog**

  - Re-export `Role` from `contracts/domain.ts`.
  - Use `ROLE_CODES` as the Mongoose `User.role` enum.
  - Use `roleSchema` inside the JWT payload schema.
  - Expand `PROJECT_SCOPE_KIND_BY_ROLE` exhaustively and map every new role, including Super Admin, to `none` for this compatibility-only commit. Task 5 replaces this with the approved module-aware Super Admin/global and grant rules.
  - Leave token claims `{ id, role }` and request-time stored-role comparison unchanged.
  - Do not seed new users yet.

- [ ] **Step 5: Run focused regression tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/roles.test.ts tests/auth.test.ts
npm run typecheck
~~~

Expected: all pass; existing-role tokens and client signup remain unchanged.

- [ ] **Step 6: Commit**

~~~bash
git add backend/src/domain/roles.ts backend/src/contracts/domain.ts backend/src/models/User.ts backend/src/services/auth.service.ts backend/src/domain/project-access.ts backend/tests/roles.test.ts backend/tests/auth.test.ts
git commit -m "refactor: centralize canonical role catalog"
~~~

---

### Task 2: Define exhaustive permissions, requestability, audit actions, and route classifications

**Files:**

- Create: `backend/src/domain/authorization.ts`
- Create: `backend/src/domain/audit-actions.ts`
- Create: `backend/src/domain/route-operations.ts`
- Create: `backend/src/domain/operation-context.ts`
- Create: `backend/src/middleware/authorization.ts`
- Modify: `backend/src/middleware/auth.ts`
- Test: `backend/tests/authorization-policy.test.ts`
- Test: `backend/tests/route-operation-registry.test.ts`
- Test: `backend/tests/fixtures/prompt-1-route-operations.ts`

**Interfaces:**

- Consumes: `Role`, the approved role boundary, and all 93 rows of the normative matrix.
- Produces: `ProjectModule`, `RequestableProjectModule`, `PermissionCode`, `ROLE_PERMISSIONS`, `REQUESTABLE_MODULES_BY_ROLE`, `hasPermission`, `HUMAN_JWT_OPERATIONS`, `HumanJwtOperationKey`, `runWithHumanOperation`, `currentHumanOperation`, `requirePermission`, and `requireOperation`.
- Preserves: service-level ownership/scope checks and extraction-worker shared-secret authentication.

- [ ] **Step 1: Scaffold the independent route test oracle**

In `backend/tests/fixtures/prompt-1-route-operations.ts`, declare all rows as literal data with:

~~~typescript
export type ExpectedHumanJwtOperationKey =
  `\${"GET" | "POST" | "PUT" | "PATCH" | "DELETE"} /\${string}`;

export interface ExpectedHumanJwtOperation {
  key: ExpectedHumanJwtOperationKey;
  permission: string;
  scope:
    | { kind: "project"; module: "projects" | "design" }
    | {
        kind: "non_project";
        namespace:
          | "identity"
          | "organization"
          | "audit"
          | "estimation_ownership"
          | "access_administration";
        projectReviewScope?: boolean;
      };
  operationClass: "read" | "admin" | "personal";
  superAdminBehavior:
    | "self"
    | "global_read"
    | "admin_override"
    | "deny_personal";
  availability: "baseline" | "prompt_1";
}

export function splitExpectedHumanOperationKey(
  key: ExpectedHumanJwtOperationKey
): {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: `/${string}`;
} {
  const separator = key.indexOf(" ");
  return {
    method: key.slice(0, separator) as
      "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: key.slice(separator + 1) as `/${string}`
  };
}
~~~

Export five initially empty literal slice arrays for rows 1–23, 24–39, 40–65, 66–84, and 85–93. Steps 6–10 populate one test slice from the Complete Literal Operation Manifest before adding the same slice independently to production. The test fixture must never import production constants.

- [ ] **Step 2: Write failing policy and registry tests**

~~~typescript
it("contains exactly the six project module codes", () => {
  expect(PROJECT_MODULES).toEqual([
    "projects",
    "design",
    "estimation",
    "procurement",
    "finance",
    "execution"
  ]);
});

it("allows only the four approved requestable pairs", () => {
  expect(
    Object.entries(REQUESTABLE_MODULES_BY_ROLE).filter(
      ([, modules]) => modules.length > 0
    )
  ).toEqual([
    ["designer", ["design"]],
    ["procurement", ["procurement"]],
    ["finance_head", ["finance"]],
    ["site_manager", ["execution"]]
  ]);
});

it("matches all normative operation rows", () => {
  expect(Object.values(HUMAN_JWT_OPERATIONS)).toEqual(
    EXPECTED_HUMAN_JWT_OPERATIONS
  );
  expect(Object.keys(HUMAN_JWT_OPERATIONS)).toHaveLength(93);
});

it("defaults unknown roles and permissions to deny", () => {
  expect(hasPermission("root", "projects.read")).toBe(false);
  expect(hasPermission("designer", "projects.destroy")).toBe(false);
});

it.each([
  ["worker_electrician", "finance.expense.read"],
  ["worker_plumber", "procurement.purchase_order.read"],
  ["worker_carpenter", "execution.task.self.update"],
  ["designer", "finance.expense.read"],
  ["procurement", "design.version.approve"],
  ["finance_head", "execution.task.update"],
  ["site_manager", "design.version.approve"],
  ["estimator_sales", "design.version.approve"]
] as const)("denies %s the unregistered or foreign action %s", (role, action) => {
  expect(hasPermission(role, action)).toBe(false);
});
~~~

Also assert:

  - the registry has no duplicate method/path;
  - every permission is in `PERMISSION_CODES`;
  - every project scope uses exactly `projects` or `design`;
  - estimation rows use `estimation_ownership` and cannot consult grants;
  - all six Worker trades have identical permissions;
  - future-module roles have only identity plus their own access-request capabilities;
  - `estimator_sales` has no requestable module;
  - `execution.worker_assignment.override` exists, belongs only to Super Admin, and has no route.

- [ ] **Step 3: Run tests and verify RED**

~~~bash
cd backend
npm test -- tests/authorization-policy.test.ts tests/route-operation-registry.test.ts
~~~

Expected: failure because authorization catalogs and registry do not exist.

- [ ] **Step 4: Implement project/module and requestability constants**

~~~typescript
export const PROJECT_MODULES = [
  "projects",
  "design",
  "estimation",
  "procurement",
  "finance",
  "execution"
] as const;

export type ProjectModule = (typeof PROJECT_MODULES)[number];

export const REQUESTABLE_PROJECT_MODULES = [
  "design",
  "procurement",
  "finance",
  "execution"
] as const;

export type RequestableProjectModule =
  (typeof REQUESTABLE_PROJECT_MODULES)[number];

export const REQUESTABLE_MODULES_BY_ROLE = {
  super_admin: [],
  admin: [],
  estimator_sales: [],
  designer: ["design"],
  procurement: ["procurement"],
  finance_head: ["finance"],
  site_manager: ["execution"],
  worker_electrician: [],
  worker_plumber: [],
  worker_carpenter: [],
  worker_painter: [],
  worker_civil: [],
  worker_other: [],
  design_manager: [],
  design_head: [],
  client: []
} as const satisfies Record<Role, readonly RequestableProjectModule[]>;

export function roleMayRequestModule(
  role: unknown,
  module: unknown
): boolean {
  return isRole(role) &&
    isRequestableProjectModule(module) &&
    REQUESTABLE_MODULES_BY_ROLE[role].some(
      (candidate) => candidate === module
    );
}
~~~

- [ ] **Step 5: Implement the explicit permission and audit catalogs**

  - Put every unique matrix permission in `PERMISSION_CODES` exactly once.
  - Add route-less `execution.worker_assignment.override`.
  - Declare `ROLE_PERMISSIONS` as `Record<Role, readonly PermissionCode[]>` with every role literal present.
  - Give Super Admin the complete explicit catalog; do not use `*` or pattern matching.
  - Give Worker trades exactly `identity.self.read` and `identity.authorization.read`.
  - Add `access_request.create` and `access_request.self.read`/`self.cancel` only to Designer, Procurement, Finance Head, and Site Manager.
  - Keep concrete Procurement, Finance, Execution, and Worker domain action codes absent until their later prompts.
  - Preserve each compatibility role's current capabilities by mapping the relevant matrix actions; relationship scope remains in services.
  - Register existing audit actions plus these typed actions:

~~~typescript
export const PROMPT_1_AUDIT_ACTIONS = [
  "user.role_changed",
  "user.activated",
  "user.deactivated",
  "access_request.created",
  "access_request.cancelled",
  "access_request.approved",
  "access_request.rejected",
  "project_access.granted",
  "project_access.revoked"
] as const;
~~~

- [ ] **Step 6: Transcribe independent fixture rows 1–23**

Copy rows 1–23 from the Complete Literal Operation Manifest into the fixture slice only. Do not add production rows yet.

- [ ] **Step 7: Run rows 1–23 and observe RED**

~~~bash
cd backend
npm test -- tests/route-operation-registry.test.ts -t "matches manifest rows 1 through 23"
~~~

Expected: the independent fixture contains 23 entries while the production slice is empty.

- [ ] **Step 8: Add production rows 1–23 and verify GREEN**

Transcribe the same 23 literals independently into `HUMAN_JWT_OPERATION_LIST`, then rerun the Step 7 command and require a pass.

- [ ] **Step 9: Transcribe independent fixture rows 24–39**

Copy rows 24–39 into the fixture only.

- [ ] **Step 10: Run rows 24–39 and observe RED**

~~~bash
cd backend
npm test -- tests/route-operation-registry.test.ts -t "matches manifest rows 24 through 39"
~~~

Expected: a 16-row missing-production mismatch.

- [ ] **Step 11: Add production rows 24–39**

Transcribe the 16 production literals independently.

- [ ] **Step 12: Rerun rows 24–39 and verify GREEN**

Rerun the Step 10 command and require a pass.

- [ ] **Step 13: Transcribe independent fixture rows 40–65**

Copy rows 40–65 into the fixture only.

- [ ] **Step 14: Run rows 40–65 and observe RED**

~~~bash
cd backend
npm test -- tests/route-operation-registry.test.ts -t "matches manifest rows 40 through 65"
~~~

Expected: a 26-row missing-production mismatch.

- [ ] **Step 15: Add production rows 40–65**

Transcribe the 26 production literals independently.

- [ ] **Step 16: Rerun rows 40–65 and verify GREEN**

Rerun the Step 14 command and require a pass.

- [ ] **Step 17: Transcribe independent fixture rows 66–84**

Copy rows 66–84 into the fixture only.

- [ ] **Step 18: Run rows 66–84 and observe RED**

~~~bash
cd backend
npm test -- tests/route-operation-registry.test.ts -t "matches manifest rows 66 through 84"
~~~

Expected: a 19-row missing-production mismatch.

- [ ] **Step 19: Add production rows 66–84**

Transcribe the 19 production literals independently.

- [ ] **Step 20: Rerun rows 66–84 and verify GREEN**

Rerun the Step 18 command and require a pass.

- [ ] **Step 21: Transcribe independent fixture rows 85–93**

Copy the final nine rows into the fixture only.

- [ ] **Step 22: Run rows 85–93 and observe RED**

~~~bash
cd backend
npm test -- tests/route-operation-registry.test.ts -t "matches manifest rows 85 through 93"
~~~

Expected: the final missing-production and full-count mismatch.

- [ ] **Step 23: Add production rows 85–93**

Enter all nine Prompt 1 production literals. Use the manifest's stable `key` and exact `availability` marker. The production type is:

~~~typescript
export interface HumanJwtOperation {
  key: HumanJwtOperationKeyShape;
  permission: PermissionCode;
  scope:
    | { kind: "project"; module: "projects" | "design" }
    | {
        kind: "non_project";
        namespace:
          | "identity"
          | "organization"
          | "audit"
          | "estimation_ownership"
          | "access_administration";
        projectReviewScope?: boolean;
      };
  operationClass: "read" | "admin" | "personal";
  superAdminBehavior:
    | "self"
    | "global_read"
    | "admin_override"
    | "deny_personal";
  availability: "baseline" | "prompt_1";
}
~~~

Define `HUMAN_JWT_OPERATION_LIST` as the exact 93-object literal array assembled by Steps 6–10 from the Complete Literal Operation Manifest, ending with `as const satisfies readonly HumanJwtOperation[]`. Define the key contract once and use it in the fixture, production registry, route markers, and parity tests:

~~~typescript
export type HumanJwtMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type HumanJwtOperationKeyShape = `\${HumanJwtMethod} /\${string}`;

export type HumanJwtOperationKey =
  (typeof HUMAN_JWT_OPERATION_LIST)[number]["key"];

export const HUMAN_JWT_OPERATIONS = Object.freeze(
  Object.fromEntries(
    HUMAN_JWT_OPERATION_LIST.map((operation) => [operation.key, operation])
  )
) as Readonly<Record<HumanJwtOperationKey, HumanJwtOperation>>;

export function splitHumanOperationKey(key: HumanJwtOperationKeyShape): {
  method: HumanJwtMethod;
  path: `/${string}`;
} {
  const separator = key.indexOf(" ");
  return {
    method: key.slice(0, separator) as HumanJwtMethod,
    path: key.slice(separator + 1) as `/${string}`
  };
}
~~~

Tests that issue HTTP requests call `splitHumanOperationKey`; no task parses keys ad hoc. Do not add a route entry for `execution.worker_assignment.override`.

- [ ] **Step 24: Rerun rows 85–93 and verify GREEN**

Rerun the Step 22 command and require a pass.

- [ ] **Step 25: Implement default-deny middleware and introspection markers**

~~~typescript
export function requirePermission(permission: PermissionCode): RequestHandler {
  return (request, _response, next) => {
    const actor = request.authenticatedUser;
    if (!actor) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    if (!hasPermission(actor.role, permission)) {
      next(new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."));
      return;
    }
    next();
  };
}

export function requireOperation(key: HumanJwtOperationKey): RequestHandler {
  const operation = HUMAN_JWT_OPERATIONS[key];
  if (!operation) {
    throw new AuthorizationConfigurationError(
      `Unregistered human operation: \${String(key)}`
    );
  }
  const handler: RequestHandler = (request, _response, next) => {
    const actor = request.authenticatedUser;
    if (!actor) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    if (!hasPermission(actor.role, operation.permission)) {
      next(new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."));
      return;
    }
    if (
      actor.role === "super_admin" &&
      operation.superAdminBehavior === "deny_personal"
    ) {
      next(new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."));
      return;
    }
    runWithHumanOperation(key, next);
  };
  return markHumanOperation(handler, key);
}
~~~

Implement the request context with Node `AsyncLocalStorage`:

~~~typescript
type ActiveHumanOperation = Readonly<{
  key: HumanJwtOperationKey;
  operation: HumanJwtOperation;
}>;

const operationStorage = new AsyncLocalStorage<ActiveHumanOperation>();

export function runWithHumanOperation<T>(
  key: HumanJwtOperationKey,
  callback: () => T
): T {
  return operationStorage.run(
    Object.freeze({ key, operation: HUMAN_JWT_OPERATIONS[key] }),
    callback
  );
}

export function currentHumanOperation(): ActiveHumanOperation {
  const context = operationStorage.getStore();
  if (!context) throw new AuthorizationConfigurationError(
    "A registered human operation is required."
  );
  return context;
}
~~~

Mark the handler returned by `authenticate` with a distinct symbol. Export read-only marker predicates for tests. Never classify health, login, signup, or extraction-worker routes as human-JWT operations. Add a context-propagation test through an asynchronous Express handler so scope cannot be lost after `await`.

- [ ] **Step 26: Run policy tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/authorization-policy.test.ts tests/route-operation-registry.test.ts
npm run typecheck
~~~

Expected: exact catalogs and all 93 independent rows pass; no application route has been broadened yet.

- [ ] **Step 27: Commit**

~~~bash
git add backend/src/domain/authorization.ts backend/src/domain/audit-actions.ts backend/src/domain/route-operations.ts backend/src/domain/operation-context.ts backend/src/middleware/authorization.ts backend/src/middleware/auth.ts backend/tests/authorization-policy.test.ts backend/tests/route-operation-registry.test.ts backend/tests/fixtures/prompt-1-route-operations.ts
git commit -m "feat: define exhaustive authorization policy"
~~~

---

### Task 3: Add the versioned authorization snapshot without changing auth identity

**Files:**

- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/routes/auth.ts`
- Test: `backend/tests/auth-authorization.test.ts`
- Test: `backend/tests/auth.test.ts`

**Interfaces:**

- Consumes: authenticated `PublicUser` and `ROLE_PERMISSIONS`.
- Produces: `authorizationSnapshotFor(role)`, `AuthService.authorization(actor)`, and `GET /api/v1/auth/authorization`.
- Preserves: login, signup, JWT, inactive-account checks, stored-role mismatch checks, and `GET /auth/me` response.

- [ ] **Step 1: Write failing snapshot and compatibility tests**

~~~typescript
it("returns an exact versioned snapshot for the current stored role", async () => {
  const response = await request(app)
    .get("/api/v1/auth/authorization")
    .set("Authorization", bearer(designerToken));

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    data: {
      role: "designer",
      policyVersion: "2026-08-17.prompt-1",
      permissions: expect.arrayContaining([
        "identity.self.read",
        "identity.authorization.read"
      ])
    }
  });
  expect(new Set(response.body.data.permissions).size).toBe(
    response.body.data.permissions.length
  );
});

it("keeps auth me unchanged", async () => {
  const response = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", bearer(designerToken));

  expect(Object.keys(response.body.data).sort()).toEqual([
    "email",
    "id",
    "name",
    "role"
  ]);
});
~~~

Use table tests for all 16 roles, anonymous requests, inactive users, and token/stored-role mismatch.

- [ ] **Step 2: Run and verify RED**

~~~bash
cd backend
npm test -- tests/auth-authorization.test.ts tests/auth.test.ts
~~~

Expected: `/auth/authorization` is 404.

- [ ] **Step 3: Add the snapshot builder and service method**

~~~typescript
export const AUTHORIZATION_POLICY_VERSION = "2026-08-17.prompt-1" as const;

export function authorizationSnapshotFor(role: Role): AuthorizationSnapshot {
  return Object.freeze({
    role,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: Object.freeze([...ROLE_PERMISSIONS[role]])
  });
}
~~~

The service must use the already reloaded authenticated actor, never a client-supplied role.

- [ ] **Step 4: Register and classify both authenticated identity routes**

~~~typescript
router.get(
  "/auth/me",
  authenticate(authService),
  requireOperation("GET /auth/me"),
  (request, response) => response.json({ data: request.authenticatedUser })
);

router.get(
  "/auth/authorization",
  authenticate(authService),
  requireOperation("GET /auth/authorization"),
  (request, response) =>
    response.json({ data: authService.authorization(request.authenticatedUser!) })
);
~~~

- [ ] **Step 5: Run focused tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/auth-authorization.test.ts tests/auth.test.ts
npm run typecheck
~~~

- [ ] **Step 6: Commit**

~~~bash
git add backend/src/services/auth.service.ts backend/src/routes/auth.ts backend/tests/auth-authorization.test.ts backend/tests/auth.test.ts
git commit -m "feat: expose authorization snapshot"
~~~

---

### Task 4: Persist access requests and additive project grants with repository parity

**Files:**

- Create: `backend/src/models/AccessRequest.ts`
- Create: `backend/src/models/ProjectAccessGrant.ts`
- Create: `backend/src/models/AuthorizationCoordination.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/access-request-models.test.ts`
- Test: `backend/tests/access-request-repository.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`

**Interfaces:**

- Consumes: `ProjectModule` and `RequestableProjectModule`.
- Produces: immutable request/grant records, CAS transitions, active-grant queries, request pagination, review scopes, and empty seed collections.
- Preserves: memory transaction isolation, Mongo session transactions, and existing repository method behavior.

- [ ] **Step 1: Add exact record contracts to the failing tests**

~~~typescript
export type AccessRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface AccessRequestRecord {
  id: string;
  requesterId: string;
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
  status: AccessRequestStatus;
  reviewerId: string | null;
  decisionReason: string | null;
  decisionFingerprint: string | null;
  approvedGrantId: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAccessGrantRecord {
  id: string;
  projectId: string;
  userId: string;
  module: ProjectModule;
  source: "access_request" | "direct_assignment" | "admin_initiator";
  accessRequestId: string | null;
  grantedById: string;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revocationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type NewAccessRequest = Pick<
  AccessRequestRecord,
  "requesterId" | "projectId" | "module" | "reason"
> & { id?: string; createdAt: string; updatedAt: string };

export type AccessRequestTransition =
  | {
      status: "approved";
      reviewerId: string;
      decisionReason: null;
      decisionFingerprint: string;
      approvedGrantId: string;
      reviewedAt: string;
      updatedAt: string;
    }
  | {
      status: "rejected";
      reviewerId: string;
      decisionReason: string;
      decisionFingerprint: string;
      approvedGrantId: null;
      reviewedAt: string;
      updatedAt: string;
    }
  | {
      status: "cancelled";
      reviewerId: null;
      decisionReason: null;
      decisionFingerprint: null;
      approvedGrantId: null;
      reviewedAt: null;
      updatedAt: string;
    };

export interface AccessRequestFilters {
  status?: AccessRequestStatus;
  module?: RequestableProjectModule;
}

export type AccessRequestReviewScope =
  | { kind: "global" }
  | { kind: "admin_initiator"; adminId: string };

export type NewProjectAccessGrant = Pick<
  ProjectAccessGrantRecord,
  | "projectId"
  | "userId"
  | "module"
  | "source"
  | "accessRequestId"
  | "grantedById"
> & { id?: string; grantedAt: string; createdAt: string; updatedAt: string };

export interface GrantRevocation {
  revokedAt: string;
  revokedById: string;
  revocationReason: string;
  updatedAt: string;
}
~~~

Test names:

  - `accepts seeded and UUID-derived opaque project IDs`;
  - `rejects whitespace slash and overlong project IDs`;
  - `declares one pending request per requester project and module`;
  - `declares one active grant per user project and module`;
  - `declares one grant per accessRequestId`;
  - `requires accessRequestId only for access_request source`;
  - `requires complete revocation metadata on inactive grants`;
  - `uses expected versions for request transitions and grant revocation`;
  - `stores a stable terminal decision fingerprint`;
  - `requires the exact approved grant id only for approved requests`;
  - `rolls back request grant and audit state together`;
  - `does not expose uncommitted transaction state`.

- [ ] **Step 2: Run model/repository tests and verify RED**

~~~bash
cd backend
npm test -- tests/access-request-models.test.ts tests/access-request-repository.test.ts
~~~

Expected: missing models and repository contracts.

- [ ] **Step 3: Implement schemas and exact indexes**

For `AccessRequest`:

  - immutable `_id`, `requesterId`, `projectId`, `module`, and `reason`;
  - Project ID 1–128 characters matching `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`;
  - trimmed reason 1–1000 characters;
  - `versionKey: "__v"` and `optimisticConcurrency: true`;
  - partial unique pending tuple index on `{ requesterId, projectId, module }`;
  - indexes for requester chronology, review status chronology, and project/status chronology.

`decisionFingerprint` defaults to null, accepts only 64 lowercase hexadecimal characters when non-null, and is never exposed in an API DTO. On approval/rejection, set it to SHA-256 of the canonical string `decision + "\n" + normalizedIncomingReason`; this preserves exact retry identity even when an unresolved rejection must expose only the generic `decisionReason`.

`approvedGrantId` defaults to null, is required exactly when status is `approved`, and is never exposed in an own-request DTO. It snapshots the exact created or reused grant so terminal retries never substitute a later grant on the same tuple.

For `ProjectAccessGrant`:

  - immutable identity/source/grant fields;
  - `accessRequestId` required only for `access_request` source;
  - active records have null revocation fields;
  - inactive records require `revokedAt`, `revokedById`, and a bounded reason;
  - partial unique active tuple index on `{ userId, projectId, module }`;
  - partial unique `accessRequestId` index for string values;
  - user/module/active/project and project/source/active/user indexes.

Map Mongo `__v` zero to API `version: 1` consistently.

- [ ] **Step 4: Add the exact repository methods**

~~~typescript
findAccessRequestById(id: string): Promise<AccessRequestRecord | null>;
coordinateAuthorizationMutation(): Promise<void>;
findPendingAccessRequest(
  requesterId: string,
  projectId: string,
  module: RequestableProjectModule
): Promise<AccessRequestRecord | null>;
createAccessRequest(input: NewAccessRequest): Promise<AccessRequestRecord>;
findOrCreatePendingAccessRequest(
  input: NewAccessRequest
): Promise<{ record: AccessRequestRecord; created: boolean }>;
transitionAccessRequest(
  id: string,
  expectedVersion: number,
  change: AccessRequestTransition
): Promise<AccessRequestRecord>;
pageAccessRequestsForRequester(
  requesterId: string,
  filters: AccessRequestFilters,
  pagination: PaginationInput
): Promise<PageResult<AccessRequestRecord>>;
pageAccessRequestsForReview(
  scope: AccessRequestReviewScope,
  filters: AccessRequestFilters,
  pagination: PaginationInput
): Promise<PageResult<AccessRequestRecord>>;
findProjectAccessGrantById(id: string): Promise<ProjectAccessGrantRecord | null>;
findProjectAccessGrantByAccessRequestId(
  accessRequestId: string
): Promise<ProjectAccessGrantRecord | null>;
findActiveProjectAccessGrant(
  userId: string,
  projectId: string,
  module: ProjectModule
): Promise<ProjectAccessGrantRecord | null>;
listActiveProjectAccessGrants(
  userId: string,
  module: ProjectModule
): Promise<ProjectAccessGrantRecord[]>;
createProjectAccessGrant(
  input: NewProjectAccessGrant
): Promise<ProjectAccessGrantRecord>;
findOrCreateActiveProjectAccessGrant(
  input: NewProjectAccessGrant
): Promise<{ record: ProjectAccessGrantRecord; created: boolean }>;
revokeProjectAccessGrant(
  id: string,
  expectedVersion: number,
  change: GrantRevocation
): Promise<ProjectAccessGrantRecord>;
revokeActiveProjectAccessGrantsForUser(
  userId: string,
  change: GrantRevocation
): Promise<ProjectAccessGrantRecord[]>;
~~~

Define review scope as `{ kind: "global" } | { kind: "admin_initiator"; adminId: string }`. The Admin query joins only active `admin_initiator/projects` grants and existing projects before pagination/counting; Super Admin includes unresolved IDs.

- [ ] **Step 5: Implement memory and Mongo parity**

  - Add requests and grants to `SeedData` and `demoSeedData` as empty arrays.
  - Define `AuthorizationCoordination` as the singleton document `{ _id: "authorization", revision: number, updatedAt: Date }`; `coordinateAuthorizationMutation()` must atomically upsert it and increment `revision` inside the caller's current transaction/session. It is a serialization write, never an authorization decision or externally returned DTO.
  - Add every new write method to memory `mutationMethods`.
  - Enforce partial uniqueness in memory before commit. Implement `findOrCreatePendingAccessRequest` and `findOrCreateActiveProjectAccessGrant` atomically.
  - In Mongo, use an upsert that returns whether the call inserted. If `E11000` occurs inside a transaction, preserve the raw code and let `runInTransaction` abort and retry the entire callback with a fresh session; the retry observes the winning row. Do not re-read on the aborted session.
  - Translate duplicate errors only after the transaction retry boundary. Never retry generic `RepositoryConflictError` or CAS/version conflicts.
  - Use the repository passed into `runInTransaction` for every write; never call the outer repository from inside a transaction.
  - Keep `direct_assignment` persisted but dormant.

Use the same atomic shape for pending requests and active grants; do not implement either as `find` followed by `create`:

~~~typescript
const { id: candidateId, ...insert } = input;
const result = await AccessRequestModel.findOneAndUpdate(
  {
    requesterId: input.requesterId,
    projectId: input.projectId,
    module: input.module,
    status: "pending"
  },
  {
    $setOnInsert: {
      _id: candidateId ?? randomUUID(),
      ...insert,
      status: "pending",
      reviewerId: null,
      decisionReason: null,
      decisionFingerprint: null,
      approvedGrantId: null,
      reviewedAt: null
    }
  },
  { upsert: true, new: true, includeResultMetadata: true, session }
).lean().exec();

if (!result.value) throw new Error("Pending request upsert returned no row.");
return {
  record: mapAccessRequest(result.value),
  created: result.lastErrorObject?.upserted !== undefined
};
~~~

The active-grant form substitutes the `{ userId, projectId, module, active: true }` tuple and immutable grant fields. Generate the candidate ID before the upsert so a whole-transaction retry is deterministic inside that attempt; audit creation keys off `created`, never off a preceding read.

- [ ] **Step 6: Run focused tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/access-request-models.test.ts tests/access-request-repository.test.ts
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts
npm run typecheck
~~~

- [ ] **Step 7: Commit**

~~~bash
git add backend/src/models/AccessRequest.ts backend/src/models/ProjectAccessGrant.ts backend/src/models/AuthorizationCoordination.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/seed/data.ts backend/tests/access-request-models.test.ts backend/tests/access-request-repository.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts
git commit -m "feat: persist project access requests and grants"
~~~

---

### Task 5: Replace role-only project access with exact module-aware resolution

**Files:**

- Modify: `backend/src/domain/project-access.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/workflow.ts`
- Test: `backend/tests/access-policy.test.ts`
- Test: `backend/tests/project-module-access.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/workflows.test.ts`

**Interfaces:**

- Consumes: legacy client/designer/manager/head relationships and active grant repository methods.
- Produces: `grantCanSupplyProjectModuleScope`, `canAccessProjectForCurrentOperation`, `requireProjectOperationAccess`, `listProjectsForUserInModule`, and `pageProjectsForUserInModule`.
- Preserves: existing 404 non-disclosure and all existing relationship/ownership checks.

- [ ] **Step 1: Write the failing source-policy tests**

~~~typescript
it("keeps direct assignment dormant in Prompt 1", () => {
  expect(
    grantCanSupplyProjectModuleScope("designer", {
      module: "design",
      source: "direct_assignment",
      active: true
    })
  ).toBe(false);
});

it("allows only an Admin projects initiator grant", () => {
  expect(
    grantCanSupplyProjectModuleScope("admin", {
      module: "projects",
      source: "admin_initiator",
      active: true
    })
  ).toBe(true);
  expect(
    grantCanSupplyProjectModuleScope("admin", {
      module: "design",
      source: "admin_initiator",
      active: true
    })
  ).toBe(false);
});

it("derives scope from the registered operation, not a caller string", async () => {
  await expect(runWithHumanOperation(
    "GET /projects/:projectId/design-versions",
    () => canAccessProjectForCurrentOperation(repository, designer, project.id)
  )).resolves.toBe(true);

  await expect(runWithHumanOperation(
    "GET /projects/:projectId",
    () => canAccessProjectForCurrentOperation(repository, designer, project.id)
  )).resolves.toBe(false);
});

it("fails closed without a registered project operation", async () => {
  await expect(
    canAccessProjectForCurrentOperation(repository, designer, project.id)
  ).rejects.toThrow(AuthorizationConfigurationError);
});
~~~

Run identical compatibility cases against memory and Mongo:

  - client linked project;
  - designer initiated/assigned project;
  - manager accountable project;
  - Design Head all legacy `projects` and `design` scope;
  - Super Admin global scope;
  - every other role none without an eligible exact grant;
  - inactive/revoked/stale-role/module-mismatched grants denied.

- [ ] **Step 2: Run focused tests and verify RED**

~~~bash
cd backend
npm test -- tests/access-policy.test.ts tests/project-module-access.test.ts
~~~

Expected: missing module-aware APIs.

- [ ] **Step 3: Implement source-aware grant eligibility**

~~~typescript
export function grantCanSupplyProjectModuleScope(
  role: Role,
  grant: Pick<ProjectAccessGrantRecord, "module" | "source" | "active">
): boolean {
  if (!grant.active) return false;

  if (grant.source === "access_request") {
    return REQUESTABLE_MODULES_BY_ROLE[role].some(
      (module) => module === grant.module
    );
  }
  if (grant.source === "admin_initiator") {
    return role === "admin" && grant.module === "projects";
  }
  return false;
}
~~~

- [ ] **Step 4: Implement the registry-bound ordered resolver**

~~~typescript
export async function canAccessProjectForCurrentOperation(
  repository: AppRepository,
  actor: PublicUser,
  projectId: string
): Promise<boolean> {
  const { operation } = currentHumanOperation();
  if (operation.scope.kind !== "project") {
    throw new AuthorizationConfigurationError(
      "The current operation is not project-backed."
    );
  }
  const module = operation.scope.module;
  const storedActor = await repository.findUserById(actor.id);
  if (!storedActor || !storedActor.active || storedActor.role !== actor.role) {
    return false;
  }
  const project = await repository.findProjectById(projectId);
  if (!project) return false;
  if (storedActor.role === "super_admin") return true;
  if (legacyRelationshipAllows(storedActor, project, module)) return true;

  const grant = await repository.findActiveProjectAccessGrant(
    storedActor.id,
    project.id,
    module
  );
  return grant !== null &&
    grantCanSupplyProjectModuleScope(storedActor.role, grant);
}
~~~

`requireProjectOperationAccess(repository, actor, projectId)` uses the same current operation and returns the project or the existing non-disclosing 404 error. It has no module parameter. A route cannot choose a module independently from its registry entry. Calls outside a registered project operation fail closed with `AuthorizationConfigurationError`.

- [ ] **Step 5: Add module-aware repository list/page queries**

  - Legacy relationships apply only to `projects` and `design`.
  - Super Admin queries all.
  - Exact usable grants are unioned with legacy scope only for the requested module.
  - Mongo must filter grant IDs by current-role source policy, not merely by `active: true`.
  - Denied roles with no usable grants short-circuit without broad Mongo queries.

- [ ] **Step 6: Preserve the route boundary until operation middleware is mounted**

Add `requireProjectOperationAccess` alongside the existing `requireAccessibleProject`; do not change a current route/service call site in this commit. Repository query builders may accept a derived `ProjectModule` internally, but the new public resolver accepts no module. Tasks 6–7 migrate each route and its service in the same commit, so no committed boundary calls `currentHumanOperation()` without `requireOperation` already mounted. Do not alter estimation ownership queries.

Add a route-level regression that calls one current Project route and one current Design route through `app` and proves their existing actors still receive the pre-migration success responses at the end of Task 5.

- [ ] **Step 7: Run focused and compatibility tests**

~~~bash
cd backend
npm test -- tests/access-policy.test.ts tests/project-module-access.test.ts
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/workflows.test.ts
npm run typecheck
~~~

- [ ] **Step 8: Commit**

~~~bash
git add backend/src/domain/project-access.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/workflow.ts backend/tests/access-policy.test.ts backend/tests/project-module-access.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/workflows.test.ts
git commit -m "feat: make project authorization module aware"
~~~

---

### Task 6: Enforce the operation registry across core project, organization, KPI, evaluation, and audit routes

**Files:**

- Modify: `backend/src/routes/projects.ts`
- Modify: `backend/src/routes/tasks.ts`
- Modify: `backend/src/routes/organization.ts`
- Modify: `backend/src/routes/kpis.ts`
- Modify: `backend/src/routes/evaluations.ts`
- Modify: `backend/src/routes/audit.ts`
- Modify: `backend/src/services/project.service.ts`
- Modify: `backend/src/services/task.service.ts`
- Modify: `backend/src/services/hierarchy.service.ts`
- Modify: `backend/src/services/kpi.service.ts`
- Modify: `backend/src/services/evaluation.service.ts`
- Modify: `backend/src/services/project-activity.service.ts`
- Modify: `backend/src/services/audit.service.ts`
- Modify: `backend/src/models/Evaluation.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Test: `backend/tests/super-admin-authorization.test.ts`
- Test: `backend/tests/route-operation-registry.test.ts`
- Test: `backend/tests/workflows.test.ts`
- Test: `backend/tests/hierarchy.test.ts`
- Test: `backend/tests/kpi.test.ts`

**Interfaces:**

- Consumes: matrix rows 2–23, `requireOperation`, and module-aware scope.
- Produces: global Super Admin reads, audited Super Admin administrative mutations, preserved personal denials, and marked route registrations for the core families.
- Preserves: DTO redaction, reporting relationships, subject eligibility, workflow validation, and existing role behavior.

- [ ] **Step 1: Write the failing Projects/Tasks table for rows 2–11**

Build the table directly from manifest rows 2–11. Assert global/redacted reads, deadline override, all personal denials, and all existing-role compatibility. Include:

~~~typescript
it("allows a Super Admin deadline override without bypassing workflow", async () => {
  const response = await request(app)
    .patch("/api/v1/tasks/task-concept/deadline")
    .set("Authorization", bearer(superAdmin))
    .send({ version: 1, deadline: "2026-09-01T00:00:00.000Z", reason: "Coverage" });

  expect(response.status).toBe(200);
  expect(await repository.listTaskEvents("task-concept")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ actorId: "user-super-admin" })
    ])
  );
});

it.each([
  ["POST", "/api/v1/projects"],
  ["POST", "/api/v1/projects/project-aurora-villa/floors"],
  ["PATCH", "/api/v1/tasks/task-concept"]
])("denies Super Admin personal operation %s %s", async (method, path) => {
  await authenticatedRequest(app, method, path, superAdmin).expect(403);
});
~~~

- [ ] **Step 2: Run focused tests and verify RED**

~~~bash
cd backend
npm test -- tests/super-admin-authorization.test.ts tests/workflows.test.ts -t "Projects and Tasks operations"
~~~

Expected: Super Admin requests are rejected by role gates and rows 2–11 lack operation markers.

- [ ] **Step 3: Implement Projects/Tasks rows 2–11**

Each route uses this order:

~~~typescript
router.get(
  "/projects/:projectId",
  authenticate(authService),
  requireOperation("GET /projects/:projectId"),
  handler
);
~~~

Apply only rows 2–11. Project list/get and client summaries use registry-derived scope with endpoint-specific redaction. Task events use the registered `design` scope. Deadline override bypasses only the manager/head relationship for Super Admin and retains state/version/date/transaction/event/audit checks. Personal mutations remain denied before service entry.

- [ ] **Step 4: Verify Projects/Tasks GREEN**

~~~bash
cd backend
npm test -- tests/super-admin-authorization.test.ts tests/workflows.test.ts -t "Projects and Tasks operations"
npm test -- tests/route-operation-registry.test.ts -t "classifies rows 1 through 11"
npm run typecheck
~~~

- [ ] **Step 5: Commit Projects/Tasks**

~~~bash
git add backend/src/routes/projects.ts backend/src/routes/tasks.ts backend/src/services/project.service.ts backend/src/services/task.service.ts backend/tests/super-admin-authorization.test.ts backend/tests/workflows.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce project and task operation authorization"
~~~

- [ ] **Step 6: Write Organization/KPI/Evaluation tests for rows 12–20**

Use these literal cases; substitute the named seeded IDs before issuing the request:

| Test name | Actor | Method/path | Valid body | Expected response | State assertion |
|---|---|---|---|---|---|
| `Super Admin lists active managers globally` | `super_admin` | `GET /api/v1/organization/managers?limit=20&offset=0` | none | `200`, paginated items include `user-manager-maya` | inactive managers absent |
| `Super Admin reads the global Designer team` | `super_admin` | `GET /api/v1/organization/team?limit=20&offset=0` | none | `200`, items include `user-designer-arun` outside any reporting line | repository uses `pageActiveDesigners`, not a manager-scoped query |
| `Super Admin reads the organization tree` | `super_admin` | `GET /api/v1/organization/tree?limit=20&offset=0` | none | `200`, existing paginated tree envelope | no inactive user is introduced |
| `Super Admin reads one manager's Designers` | `super_admin` | `GET /api/v1/organization/managers/user-manager-maya/designers?limit=20&offset=0` | none | `200`, existing `DesignerSummary` items | every item retains `managerId = user-manager-maya` |
| `Super Admin reads a Designer summary and KPI` | `super_admin` | `GET /api/v1/designers/user-designer-arun/summary`, then `GET /api/v1/kpis/users/user-designer-arun` | none | both `200`, existing DTOs | subject remains active Designer; no relationship row is written |
| `Super Admin reads KPI tasks` | `super_admin` | `GET /api/v1/kpis/users/user-designer-arun/tasks?limit=20&offset=0` | none | `200`, existing paginated task DTO | unsupported subject fixtures remain `403`/`404` as currently specified |
| `Super Admin creates an evaluation as the real actor` | `super_admin` | `POST /api/v1/evaluations` | `{ "subjectUserId":"user-designer-arun", "periodStartAt":"2026-07-01T00:00:00.000Z", "periodEndAt":"2026-07-31T23:59:59.999Z", "score":90, "comments":"Quarterly review" }` | `201`, existing evaluation envelope | persisted `evaluatorId = user-super-admin` and `evaluatorRole = super_admin` |
| `Super Admin reads evaluations globally` | `super_admin` | `GET /api/v1/evaluations/user-designer-arun?limit=20&offset=0` | none | `200`, created evaluation is present | response redaction matches the existing endpoint |
| `future roles remain denied` | each Procurement, Finance Head, Site Manager, Worker | each row 12–20 path with the same valid params/body | same as positive case | `403` before service entry | repository/evaluation counts unchanged |

- [ ] **Step 7: Run Organization/KPI/Evaluation tests and verify RED**

~~~bash
cd backend
npm test -- tests/super-admin-authorization.test.ts tests/hierarchy.test.ts tests/kpi.test.ts -t "Organization KPI and Evaluation operations"
~~~

- [ ] **Step 8: Implement Organization/KPI/Evaluation rows 12–20**

  - Convert only these route keys.
  - Hierarchy Super Admin reads active managers/designers globally through the exact repository and service boundary below.
  - KPI resolves only active Designer/Design Manager subjects.
  - Evaluation permits Super Admin as recorded evaluator, widens `EvaluationRecord.evaluatorRole`/Mongoose enum, and preserves dates/revisions/subjects.
  - `assertDesignerRelationship` bypasses reporting lines only for these registered read/admin contexts.

~~~typescript
// repositories/types.ts
pageActiveDesigners(
  pagination: PaginationInput
): Promise<PageResult<UserRecord>>;

// services/hierarchy.service.ts
export interface HierarchyService {
  team(
    actor: PublicUser,
    pagination: PaginationInput
  ): Promise<PageResult<DesignerSummary>>;
}

// createHierarchyService(...).team
const page = actor.role === "super_admin"
  ? await repository.pageActiveDesigners(pagination)
  : await repository.pageDesignersForManager(actor.id, pagination);
return {
  items: await buildSummaries(page.items),
  total: page.total
};
~~~

`pageActiveDesigners` filters exactly `{ role: "designer", active: true }`, sorts by `name` ascending and then `id` ascending, applies `offset` and then `limit`, and returns exactly `{ items: UserRecord[], total: number }`, where `total` is the matching count before pagination. Memory uses `byNameThenId`; Mongo uses `{ name: 1, _id: 1 }`. No other hierarchy method consumes this new repository API.

- [ ] **Step 9: Verify Organization/KPI/Evaluation GREEN**

~~~bash
cd backend
npm test -- tests/super-admin-authorization.test.ts tests/hierarchy.test.ts tests/kpi.test.ts -t "Organization KPI and Evaluation operations"
npm test -- tests/route-operation-registry.test.ts -t "classifies rows 12 through 20"
npm run typecheck
~~~

- [ ] **Step 10: Commit Organization/KPI/Evaluation**

~~~bash
git add backend/src/routes/organization.ts backend/src/routes/kpis.ts backend/src/routes/evaluations.ts backend/src/services/hierarchy.service.ts backend/src/services/kpi.service.ts backend/src/services/evaluation.service.ts backend/src/models/Evaluation.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/super-admin-authorization.test.ts backend/tests/hierarchy.test.ts backend/tests/kpi.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce organization operation authorization"
~~~

- [ ] **Step 11: Write Audit tests for rows 21–23**

Use these literal cases:

| Test name | Actor | Method/path | Valid body | Expected response | State assertion |
|---|---|---|---|---|---|
| `Super Admin reads project activity globally` | `super_admin` | `GET /api/v1/projects/project-aurora-villa/activity?limit=20&offset=0` | none | `200`, existing paginated activity envelope | registered operation supplies `design`; no grant lookup is required |
| `Super Admin reads a Designer audit globally` | `super_admin` | `GET /api/v1/designers/user-designer-arun/audit?limit=20&offset=0` | none | `200`, existing redacted audit DTO | secret-key scrub assertions remain green |
| `Super Admin reads the audit list globally` | `super_admin` | `GET /api/v1/audit?limit=20&offset=0` | none | `200`, includes an event outside Super Admin's reporting relationships | response contains no password/hash/token/secret key |
| `legacy audit filters remain scoped` | Designer, Design Manager, Design Head positive fixtures | the same three concrete paths | none | existing `200`/non-disclosing result for each role | returned actor/entity IDs remain within the pre-Prompt-1 relationship set |
| `future roles cannot read audit routes` | Procurement, Finance Head, Site Manager, Worker | each concrete path above | none | `403` before service entry | audit repository spy remains uncalled |

- [ ] **Step 12: Run Audit tests and verify RED**

~~~bash
cd backend
npm test -- tests/super-admin-authorization.test.ts tests/workflows.test.ts -t "Audit operations"
~~~

- [ ] **Step 13: Implement Audit rows 21–23**

Convert the three exact keys. `audit.service.ts` gives Super Admin supported unfiltered reads without leaking secret fields; `project-activity.service.ts` uses registered Design scope. Keep all existing role filters unchanged.

- [ ] **Step 14: Verify Audit GREEN**

~~~bash
cd backend
npm test -- tests/super-admin-authorization.test.ts tests/workflows.test.ts -t "Audit operations"
npm test -- tests/route-operation-registry.test.ts -t "classifies rows 21 through 23"
npm run typecheck
~~~

- [ ] **Step 15: Commit Audit**

~~~bash
git add backend/src/routes/audit.ts backend/src/services/project-activity.service.ts backend/src/services/audit.service.ts backend/tests/super-admin-authorization.test.ts backend/tests/workflows.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce audit operation authorization"
~~~

---

### Task 7: Enforce global reads and administrative overrides across Design routes

**Files:**

- Modify: `backend/src/routes/design-versions.ts`
- Modify: `backend/src/routes/design-sections.ts`
- Modify: `backend/src/services/design-version.service.ts`
- Modify: `backend/src/services/design-section.service.ts`
- Modify: `backend/src/services/workflow.ts`
- Modify: `backend/src/domain/project-access.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Test: `backend/tests/super-admin-authorization.test.ts`
- Test: `backend/tests/design-sections.test.ts`
- Test: `backend/tests/design-section-review.test.ts`
- Test: `backend/tests/uploads.test.ts`
- Test: `backend/tests/workflows.test.ts`
- Test: `backend/tests/route-operation-registry.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/roles.test.ts`

**Interfaces:**

- Consumes: matrix rows 24–39 and `design` module access.
- Produces: global Super Admin design reads and approval override with strict personal denial.
- Preserves: client visibility, owner-only editing, extraction state, file validation, storage, and design workflow.

- [ ] **Step 1: Write Design Version tests for rows 24–29**

Create the cases below using the existing seeded version/task IDs; where an ID differs in the fixture, substitute it in the path without changing the asserted operation key:

| Test name | Actor | Method/path | Valid body | Expected response | State assertion |
|---|---|---|---|---|---|
| `Super Admin reads latest approved versions` | `super_admin` | `GET /api/v1/client/latest-approved-versions?limit=20&offset=0` | none | `200`, existing client-shaped approved-version envelope | drafts remain absent |
| `Super Admin cannot upload a Design Version` | `super_admin` | `POST /api/v1/tasks/task-concept/design-versions` | existing valid multipart PDF fixture | `403` before upload handler | storage and DesignVersion counts unchanged |
| `Super Admin lists project Design Versions` | `super_admin` | `GET /api/v1/projects/project-aurora-villa/design-versions?limit=20&offset=0` | none | `200`, includes `design-version-approved` | no owner/accountable-manager restriction is added to the query |
| `Super Admin reads extraction state` | `super_admin` | `GET /api/v1/design-versions/design-version-approved/extraction` | none | `200`, existing extraction DTO | extraction job remains unchanged |
| `Super Admin approves with workflow checks` | `super_admin` | `PATCH /api/v1/design-versions/design-version-submitted/approval` | `{ "approvalStatus":"approved", "clientVisible":true }` | `200`, approved DTO | audit actor is `user-super-admin`; approval status advances exactly once |
| `Super Admin downloads a Design Version` | `super_admin` | `GET /api/v1/design-versions/design-version-approved/download` | none | `200`, existing content type/disposition and bytes | storage read occurs once; no mutation occurs |
| `Design grant cannot satisfy Projects` | Designer with only an active `design/access_request` grant | `GET /api/v1/projects/project-aurora-villa` | none | non-disclosing `404` | the same actor receives `200` for the row-26 Design-Version list |

- [ ] **Step 2: Run Design Version tests and verify RED**

~~~bash
cd backend
npm test -- tests/uploads.test.ts tests/workflows.test.ts tests/super-admin-authorization.test.ts -t "Design Version operations"
~~~

- [ ] **Step 3: Implement Design Version rows 24–29**

  - Convert these six exact operation keys.
  - List/extraction/download/latest-approved read through registry-derived Design scope.
  - Approval bypasses only the accountable-manager relationship for Super Admin and keeps workflow/version/audit.
  - Upload stays personal and is denied before the upload handler.
  - Client-shaped reads retain approved/client-visible filters for every actor.

- [ ] **Step 4: Verify Design Version GREEN**

~~~bash
cd backend
npm test -- tests/uploads.test.ts tests/workflows.test.ts tests/super-admin-authorization.test.ts -t "Design Version operations"
npm test -- tests/route-operation-registry.test.ts -t "classifies rows 24 through 29"
npm run typecheck
~~~

- [ ] **Step 5: Commit Design Version**

~~~bash
git add backend/src/routes/design-versions.ts backend/src/services/design-version.service.ts backend/tests/uploads.test.ts backend/tests/workflows.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce design version authorization"
~~~

- [ ] **Step 6: Write Design Section tests for rows 30–39**

Use these literal cases with the existing valid section/revision/source-page payload fixtures:

| Manifest rows | Actor | Concrete/substituted request | Valid body | Expected response | State assertion |
|---|---|---|---|---|---|
| 30 | `super_admin` | `GET /api/v1/design-versions/design-version-draft/sections` | none | `200`, existing draft-section DTO | no section is mutated |
| 31–35 | `super_admin` | `POST /api/v1/design-versions/design-version-draft/sections`; `PATCH`/`DELETE /api/v1/design-sections/design-section-kitchen`; `POST /api/v1/design-versions/design-version-draft/retry-extraction`; `POST /api/v1/design-versions/design-version-draft/submit-sections` | respectively `{ "sourcePageId":"design-source-page-1", "label":"Kitchen", "crop":{ "x":0, "y":0, "width":100, "height":80 } }`; `{ "version":1, "label":"Updated kitchen" }`; `{ "version":1 }`; no body; no body | every request `403` before handler | section/version/storage/job counts and versions unchanged |
| 36 | `super_admin` | `GET /api/v1/client/projects/project-aurora-villa/design-sections` | none | `200`, client-shaped approved/visible sections only | draft sections absent |
| 37 | `super_admin` | `POST /api/v1/design-section-revisions/design-revision-client/decision` | `{ "version":1, "decision":"approved", "comment":"Looks good" }` | `403` before handler | revision/client-decision state unchanged |
| 38 | `super_admin` | `GET /api/v1/design-source-pages/design-source-page-1/image` | none | `200`, existing image content type/bytes | storage read once, no mutation |
| 39 | `super_admin` | `GET /api/v1/design-section-revisions/design-revision-approved/image` | none | `200`, existing image content type/bytes | storage read once, no mutation |
| 30–35 | another Designer with only a Design grant | repeat the draft-owner requests above | same valid bodies | non-disclosing `404` or existing owner-denial status | owner IDs, versions, storage, and extraction state unchanged |
| 36–39 | linked Client | repeat rows 36–39 with approved/client-visible fixtures | row-37 valid decision body | existing success responses | hidden/unapproved artifacts remain absent |

- [ ] **Step 7: Run Design Section tests and verify RED**

~~~bash
cd backend
npm test -- tests/design-sections.test.ts tests/design-section-review.test.ts tests/super-admin-authorization.test.ts -t "Design Section operations"
~~~

- [ ] **Step 8: Split editable ownership from read access**

In `design-section.service.ts` replace an overloaded owner helper with:

~~~typescript
async function requireEditableOwner(
  actor: PublicUser,
  versionId: string
): Promise<EditableDesignContext>;

async function requireDraftReader(
  actor: PublicUser,
  versionId: string
): Promise<DesignReadContext>;
~~~

`requireEditableOwner` remains Designer/task-owner only. `requireDraftReader` may allow Super Admin while preserving all file/extraction/read validation. Submitted/non-draft reads call `requireProjectOperationAccess(repository, actor, projectId)` and derive `design` from their registered operations. Convert exactly rows 30–39.

After rows 30–39 are mounted, run `rg -n "requireAccessibleProject|projectAccessScopeForUser|listProjectsForUser|pageProjectsForUser" backend/src`. The only remaining hits must be legacy declarations/implementations; remove those old exports and repository methods now. This is the first boundary where every former caller has a matching `requireOperation` context. Keep `requireProjectOperationAccess`, `listProjectsForUserInModule`, and `pageProjectsForUserInModule`.

Remove Task 1's rollout-only `projectAccessScopeForUser` assertion from `roles.test.ts`; the exact no-legacy-scope cases now live in `project-module-access.test.ts` against `canAccessProjectForCurrentOperation`. Keep every canonical role/family/operational-role assertion in `roles.test.ts`.

- [ ] **Step 9: Verify Design Section GREEN**

~~~bash
cd backend
npm test -- tests/design-sections.test.ts tests/design-section-review.test.ts
npm test -- tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/workflows.test.ts
npm test -- tests/roles.test.ts tests/project-module-access.test.ts
npm run typecheck
~~~

- [ ] **Step 10: Commit Design Section**

~~~bash
git add backend/src/routes/design-sections.ts backend/src/services/design-section.service.ts backend/src/services/workflow.ts backend/src/domain/project-access.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/design-sections.test.ts backend/tests/design-section-review.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/route-operation-registry.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/workflows.test.ts backend/tests/roles.test.ts
git commit -m "feat: enforce design section authorization"
~~~

---

### Task 8: Split lead and estimate routers without changing behavior

**Files:**

- Create: `backend/src/routes/estimates.ts`
- Modify: `backend/src/routes/leads.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/leads.test.ts`
- Test: `backend/tests/estimate-pdf-routes.test.ts`
- Test: `backend/tests/full-journey.test.ts`

**Interfaces:**

- Consumes: current 454-line lead router and its existing service/model dependencies.
- Produces: lead rows 66–71 in `leads.ts` and estimate rows 72–84 in `estimates.ts`.
- Preserves: every method/path, middleware order, handler body, response, status, PDF, email, and ownership rule.

- [ ] **Step 1: Add a route-presence regression**

Add this 19-row characterization table. Each row starts from an isolated copy of the named existing fixture, uses the current authorized actor, and asserts the exact current response envelope/content headers in addition to the summarized expectation:

| Row | Actor | Concrete/substituted method/path | Valid body | Expected response | State assertion |
|---:|---|---|---|---|---|
| 66 | Estimator/Sales | `GET /api/v1/leads?limit=20&offset=0` | none | `200`, paginated lead envelope | no writes |
| 67 | Estimator/Sales | `POST /api/v1/leads` | `{ "clientName":"Asha Rao", "clientEmail":"asha@example.com", "clientMobile":"9999999999", "projectName":"Aurora", "location":"Pune", "propertyType":"villa", "source":"referral", "nextAction":"site visit", "nextActionAt":"2026-09-01T10:00:00.000Z" }` | `201`, lead envelope | one lead owned by the actor is created |
| 68 | Estimator/Sales owner | `GET /api/v1/leads/lead-aurora` | none | `200`, lead DTO | no writes |
| 69 | Estimator/Sales owner | `PATCH /api/v1/leads/lead-aurora` | `{ "stage":"negotiation" }` | `200`, updated lead DTO | stage changes once |
| 70 | Estimator/Sales owner | `GET /api/v1/leads/lead-aurora/activities?limit=20&offset=0` | none | `200`, paginated activity envelope | no writes |
| 71 | Estimator/Sales owner | `POST /api/v1/leads/lead-aurora/activities` | `{ "type":"call", "note":"Confirmed site visit", "occurredAt":"2026-07-29T10:00:00.000Z" }` | `201`, activity envelope | one activity is appended |
| 72 | Estimator/Sales owner | `GET /api/v1/leads/lead-aurora/estimate` | none | `200`, estimate DTO or the fixture's current `null` | no writes |
| 73 | Estimator/Sales | `GET /api/v1/estimates` | none | `200`, estimate list envelope | no writes |
| 74 | Estimator/Sales owner | `PUT /api/v1/leads/lead-aurora/estimate` | `{ "propertyType":"villa", "rooms":[], "scopes":["interiors"], "lineItems":[{ "catalogueId":"cat-paint", "roomName":"Living", "specification":"Primer and paint", "unit":"sqft", "rate":10, "quantity":100, "included":true }] }` | `200`, calculated estimate DTO | subtotal `1000`, GST `180`, total `1180` |
| 75 | Estimator/Sales owner | `POST /api/v1/leads/lead-aurora/estimate/submit` | none | `200`, submitted estimate DTO | status/review/notification follow the existing threshold fixture exactly once |
| 76 | Estimator/Sales owner | `GET /api/v1/estimates/estimate-draft/pdf` | none | `200`, `application/pdf` with existing disposition | PDF generator called once; no writes |
| 77 | Design Manager | `GET /api/v1/estimates/review-queue` | none | `200`, current manager queue envelope | no writes |
| 78 | Design Manager | `GET /api/v1/estimates/designers` | none | `200`, current active-team Designer DTOs | no writes |
| 79 | Design Manager | `POST /api/v1/estimates/estimate-awaiting-assignment/assign` | `{ "designerId":"user-designer-arun" }` | `200`, assigned estimate DTO | assigned manager/designer/status/review/notification update once |
| 80 | assigned Designer | `POST /api/v1/estimates/estimate-awaiting-designer/designer-decision` | `{ "decision":"approve", "note":"Approved" }` | `200`, reviewed estimate DTO | status becomes `ready_for_client`; one review appended |
| 81 | Estimator/Sales owner | `POST /api/v1/estimates/estimate-ready/send-client` | none | `200`, sent estimate DTO | status, notification, and Lead next action update once |
| 82 | linked Client | `GET /api/v1/client/estimates` | none | `200`, client-visible estimate list | non-visible statuses absent; no writes |
| 83 | linked Client | `GET /api/v1/client/estimates/estimate-client-visible/pdf` | none | `200`, `application/pdf` with existing disposition | PDF generator called once; no writes |
| 84 | linked Client | `POST /api/v1/client/estimates/estimate-client-visible/decision` | `{ "decision":"approve", "note":"Approved" }` | `200`, client-approved estimate DTO | CAS transition, review, audit, and linked-project effects match the current test exactly once |

If an existing fixture uses a different ID for rows 79–81, bind that ID through a named constant at the top of the test; do not change the method/path template. No row may accept `404` as route-presence evidence.

- [ ] **Step 2: Run the regressions before refactoring**

~~~bash
cd backend
npm test -- tests/leads.test.ts tests/estimate-pdf-routes.test.ts tests/full-journey.test.ts
~~~

Expected: green baseline. Record the passing counts in the task notes.

- [ ] **Step 3: Move handlers unchanged**

  - Keep `GET/POST /leads`, `GET/PATCH /leads/:leadId`, and lead activities in `leads.ts`.
  - Move estimate read/save/submit/PDF/review/assignment/client routes to `estimates.ts`.
  - Give each factory only the dependencies it uses.
  - Mount both under `/api/v1` in `app.ts`.
  - Do not add Super Admin, permission middleware, query changes, or formatting rewrites in this commit.

- [ ] **Step 4: Rerun the exact baseline**

~~~bash
cd backend
npm test -- tests/leads.test.ts tests/estimate-pdf-routes.test.ts tests/full-journey.test.ts
npm run typecheck
~~~

Expected: identical green behavior and route count.

- [ ] **Step 5: Commit the isolated refactor**

~~~bash
git add backend/src/routes/leads.ts backend/src/routes/estimates.ts backend/src/app.ts backend/tests/leads.test.ts backend/tests/estimate-pdf-routes.test.ts backend/tests/full-journey.test.ts
git commit -m "refactor: separate lead and estimate routes"
~~~

---

### Task 9: Enforce the route matrix across Estimation ownership and direct-Mongoose paths

**Files:**

- Modify: `backend/src/routes/leads.ts`
- Modify: `backend/src/routes/estimates.ts`
- Modify: `backend/src/routes/estimate-designs.ts`
- Modify: `backend/src/routes/estimate-plan-review.ts`
- Modify: `backend/src/services/lead.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/services/estimate-plan-review.service.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Delete: `backend/src/domain/permissions.ts` after its last caller is gone
- Modify: `backend/src/middleware/auth.ts` to remove `authorizeRoles` after its last caller is gone
- Test: `backend/tests/super-admin-authorization.test.ts`
- Test: `backend/tests/estimate-design-upload.test.ts`
- Test: `backend/tests/estimate-design-review.test.ts`
- Test: `backend/tests/estimate-plan-review-client.test.ts`
- Test: `backend/tests/estimate-plan-review-staff.test.ts`
- Test: `backend/tests/leads.test.ts`
- Test: `backend/tests/estimate-pdf-routes.test.ts`
- Test: `backend/tests/route-operation-registry.test.ts`
- Test: `backend/tests/auth.test.ts`

**Interfaces:**

- Consumes: matrix rows 40–84.
- Produces: global Super Admin reads and audited admin overrides on Estimation ownership routes, personal denials, and complete 84-route baseline registry coverage.
- Preserves: Estimator owner scope, client relation, Designer/Manager assignment rules, calculations, PDF, email, OCR, images, annotations, and all mutation workflows.

- [ ] **Step 1: Add the shared Estimation operation-case adapter**

Derive four independent test slices from manifest rows 40–53, 54–65, 66–71, and 72–84. For each slice, drive global reads, admin overrides, and personal denials from `operationClass`/`superAdminBehavior`:

~~~typescript
it.each(PERSONAL_ESTIMATION_OPERATIONS)(
  "denies Super Admin personal estimation operation $key",
  async ({ method, path, body }) => {
    await authenticatedRequest(app, method, path, superAdmin)
      .send(body)
      .expect(403);
  }
);

function requestCaseFor(
  operation: ExpectedHumanJwtOperation,
  body: unknown = undefined
) {
  return { ...operation, ...splitExpectedHumanOperationKey(operation.key), body };
}
~~~

`splitExpectedHumanOperationKey` is the fixture-local equivalent of the production splitter and imports no production registry value. For every slice also spy on `findActiveProjectAccessGrant`, `listProjectsForUserInModule`, and `pageProjectsForUserInModule` and assert zero calls. Existing Estimator, Client, Designer, and Manager relationship fixtures remain the positive controls.

#### Task 9A: Estimate Design rows 40–53

- [ ] **Step A1: Write Estimate Design row tests**

Create `ESTIMATE_DESIGN_CASES` from fixture rows 40–53 with the existing seeded estimate/upload/page/drawing IDs and valid request bodies. Assert rows 41, 43, 45, and 46 allow Super Admin reads; every `deny_personal` row returns 403 before its handler; Estimator/Client owner controls remain green; and all three project-grant spies remain uncalled.

- [ ] **Step A2: Run Estimate Design tests and verify RED**

~~~bash
cd backend
npm test -- tests/estimate-design-upload.test.ts tests/estimate-design-review.test.ts
npm test -- tests/super-admin-authorization.test.ts -t "Estimate Design operations"
~~~

- [ ] **Step A3: Implement Estimate Design read helpers and routes**

Keep `requireOwnedEstimate` and `requireClientEstimate` strict for mutation rows. Add only:

~~~typescript
async function requireEstimateWorkspaceReader(
  actor: PublicUser,
  estimateId: string
): Promise<EstimateWorkspaceContext>;

async function requireClientVisibleEstimateReader(
  actor: PublicUser,
  estimateId: string
): Promise<ClientVisibleEstimateContext>;
~~~

Use them only for rows 41, 43, 45, and 46. Convert exactly rows 40–53. Upload/retry/drawing edits/replacement/submission and client annotation/decision stay personal. Do not broadly refactor the OCR/image service.

- [ ] **Step A4: Verify Estimate Design GREEN**

~~~bash
cd backend
npm test -- tests/estimate-design-upload.test.ts tests/estimate-design-review.test.ts
npm test -- tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts -t "Estimate Design"
npm run typecheck
~~~

- [ ] **Step A5: Commit Estimate Design**

~~~bash
git add backend/src/routes/estimate-designs.ts backend/src/services/estimate-design.service.ts backend/tests/estimate-design-upload.test.ts backend/tests/estimate-design-review.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce estimate design authorization"
~~~

#### Task 9B: Estimate Plan Review rows 54–65

- [ ] **Step B1: Write Estimate Plan Review row tests**

Create `ESTIMATE_PLAN_REVIEW_CASES` from fixture rows 54–65 with the seeded Client/Estimator/Designer/Manager review fixtures. Assert Super Admin reads rows 54–56, 58, 61–62, and 65; overrides rows 63–64 with an audit event; receives 403 for rows 57, 59, and 60; and never consults project grants.

- [ ] **Step B2: Run Plan Review tests and verify RED**

~~~bash
cd backend
npm test -- tests/estimate-plan-review-client.test.ts tests/estimate-plan-review-staff.test.ts
npm test -- tests/super-admin-authorization.test.ts -t "Estimate Plan Review operations"
~~~

- [ ] **Step B3: Implement Plan Review reads/admin overrides and routes**

Read helpers permit Super Admin only for rows 54–56, 58, 61–62, and 65. `listStaff` omits ownership filters for Super Admin; `getStaff`/`staffPageImage` bypass assignment only for Super Admin. Target updates and page resolution allow an audited Super Admin override. Client draft/request mutations remain personal. For client-shaped reads, resolve client identity from the estimate; never query drafts/requests under Super Admin's ID.

- [ ] **Step B4: Verify Plan Review GREEN**

~~~bash
cd backend
npm test -- tests/estimate-plan-review-client.test.ts tests/estimate-plan-review-staff.test.ts
npm test -- tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts -t "Estimate Plan Review"
npm run typecheck
~~~

- [ ] **Step B5: Commit Plan Review**

~~~bash
git add backend/src/routes/estimate-plan-review.ts backend/src/services/estimate-plan-review.service.ts backend/tests/estimate-plan-review-client.test.ts backend/tests/estimate-plan-review-staff.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce estimate plan review authorization"
~~~

#### Task 9C: Lead rows 66–71

- [ ] **Step C1: Write Lead row tests**

Create `LEAD_CASES` from fixture rows 66–71. Assert Super Admin globally lists/reads activities for another Estimator's lead, receives 403 for create/update/add-activity, existing Estimator ownership remains enforced, and project-grant methods are never called.

- [ ] **Step C2: Run Lead tests and verify RED**

~~~bash
cd backend
npm test -- tests/leads.test.ts
npm test -- tests/super-admin-authorization.test.ts -t "Lead operations"
~~~

- [ ] **Step C3: Separate Lead reads from mutation ownership and convert routes**

Add explicit global read methods rather than nullable ownership:

~~~typescript
pageAllLeads(
  filters: LeadFilters,
  pagination: PaginationInput
): Promise<PageResult<LeadRecord>>;

findLeadForReader(
  actor: PublicUser,
  leadId: string
): Promise<LeadRecord>;
~~~

Super Admin uses global page/read/activity reads. Estimator create/update/add-activity remains owner-personal. Convert rows 66–71 and retain all validation/envelopes.

- [ ] **Step C4: Verify Lead GREEN**

~~~bash
cd backend
npm test -- tests/leads.test.ts
npm test -- tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts -t "Lead operations"
npm run typecheck
~~~

- [ ] **Step C5: Commit Leads**

~~~bash
git add backend/src/routes/leads.ts backend/src/services/lead.service.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/leads.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: enforce lead operation authorization"
~~~

#### Task 9D: Estimate rows 72–84

- [ ] **Step D1: Write Estimate row tests**

Create `ESTIMATE_CASES` from fixture rows 72–84. Assert Super Admin global reads for rows 72–73, 76–78, and 82–83; audited assignment override for row 79; 403 for personal rows 74–75, 80–81, and 84; all existing owner/client/Designer/Manager positives; and zero project-grant queries. The test name must use the exact key so an incorrect status cannot be hidden by grouping.

- [ ] **Step D2: Run Estimate tests and verify RED**

~~~bash
cd backend
npm test -- tests/leads.test.ts tests/estimate-pdf-routes.test.ts
npm test -- tests/super-admin-authorization.test.ts -t "Estimate operations"
~~~

- [ ] **Step D3: Implement direct-Mongoose reads/admin override and personal denial**

  - Super Admin read queries omit owner/client-email restrictions only for rows 72–73, 76–78, and 82–83.
  - Review queue returns both pending manager-assignment and pending Designer-approval records for Super Admin.
  - Assignable Designers returns all active Designers for Super Admin.
  - Assignment validates the selected active Designer and that Designer's active accountable manager, keeps the manager as `assignedManagerId`, audits Super Admin, and preserves version/workflow.
  - Save, submit, Designer decision, send-client, and Client decision stay personal.
  - Preserve calculations, PDF, email/notification, version, and state validation.

Convert rows 72–84. After the last caller migrates, remove `authorizeRoles`, delete `domain/permissions.ts`, and assert no production import remains. Remove the obsolete `isRoleAuthorized`/`authorizeRoles` unit cases from `auth.test.ts`; their default-deny replacement is the exact role/permission table in `authorization-policy.test.ts`, while `auth.test.ts` retains authentication, stored-role, inactive-user, and client-signup coverage.

- [ ] **Step D4: Verify all 84 baseline routes are classified exactly once**

The route registry test must inspect the built application and compare mounted human-JWT routes to all `availability: "baseline"` entries:

~~~typescript
expect([...mountedBaselineOperations].sort()).toEqual(
  expectedOperations
    .filter((operation) => operation.availability === "baseline")
    .map(({ key }) => key)
    .sort()
);
expect(mountedBaselineOperations).toHaveLength(84);
~~~

Also assert that `GET /auth/authorization` is already mounted and the only missing registrations are the remaining eight Prompt 1 entries, rows 86–93.

- [ ] **Step D5: Run Estimate/final baseline tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts
npm test -- tests/leads.test.ts tests/estimate-pdf-routes.test.ts tests/auth.test.ts
npm run typecheck
~~~

- [ ] **Step D6: Commit Estimate authorization and role-gate removal**

~~~bash
git add backend/src/routes/estimates.ts backend/src/middleware/auth.ts backend/tests/super-admin-authorization.test.ts backend/tests/leads.test.ts backend/tests/estimate-pdf-routes.test.ts backend/tests/route-operation-registry.test.ts backend/tests/auth.test.ts
git add -u backend/src/domain/permissions.ts
git commit -m "feat: enforce estimate operation authorization"
~~~

---

### Task 10: Implement the non-disclosing access-request and grant workflow

**Files:**

- Create: `backend/src/services/access-request.service.ts`
- Create: `backend/src/routes/access-requests.ts`
- Create: `backend/src/middleware/access-request-rate-limit.ts`
- Modify: `backend/src/models/AccessRequest.ts`
- Modify: `backend/src/models/ProjectAccessGrant.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/audit.service.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/access-requests.test.ts`
- Test: `backend/tests/access-request-repository.test.ts`
- Test: `backend/tests/access-request-mongo.replica-set.test.ts`
- Test: `backend/tests/route-operation-registry.test.ts`

**Interfaces:**

- Consumes: request/grant repository methods, requestability, typed audit, operation rows 88–93, and module-aware scope.
- Produces: submit/list-own/cancel/review/decision/revoke service methods and six routes.
- Preserves: project existence non-disclosure and exact-ID immutability.

- [ ] **Step 1: Declare exact service DTOs in failing route/service tests**

~~~typescript
export interface OwnAccessRequestDto {
  id: string;
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
  status: AccessRequestStatus;
  decisionReason: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAccessRequestDto extends OwnAccessRequestDto {
  requester: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
  };
  project: {
    id: string;
    resolved: boolean;
    name: string | null;
  };
  reviewerId: string | null;
  activeGrant: {
    id: string;
    version: number;
    grantedAt: string;
  } | null;
}
~~~

Exact HTTP behavior:

| Route | Success |
|---|---|
| `POST /access-requests` | `202 { data: { accepted: true } }` |
| `GET /access-requests/mine` | existing paginated envelope of own DTOs |
| `POST /access-requests/:requestId/cancel` | `200 { data: OwnAccessRequestDto }` |
| `GET /access-requests/review` | existing paginated envelope of review DTOs |
| `POST /access-requests/:requestId/decision` | `200 { data: { request, grant } }` |
| `POST /project-access-grants/:grantId/revoke` | `200 { data: grant }` |

- [ ] **Step 2: Write the opaque-submission tests first**

~~~typescript
it.each([
  "project-aurora-villa",
  "project-hidden-valid",
  "project-does-not-exist"
])("returns the same opaque receipt for %s", async (projectId) => {
  const response = await request(app)
    .post("/api/v1/access-requests")
    .set("Authorization", bearer(designer))
    .send({ projectId, module: "design", reason: "Need design access." });

  expect(response.status).toBe(202);
  expect(response.body).toEqual({ data: { accepted: true } });
});
~~~

Compare status, body keys, content type, CORS-visible headers, and bounded observable validation text for visible, hidden, unknown, and duplicate cases. Spy on `findProjectById` and assert it is never called during submission.

Also write tests for:

  - role-ineligible module rejected before inspecting Project ID;
  - anonymous and Client denied;
  - own list contains no project title/resolved identity;
  - no response exposes `decisionFingerprint`; own-request DTOs omit internal `approvedGrantId`, while reviewer DTOs expose only the bounded `activeGrant` summary needed for revocation;
  - owner-only pending cancellation with CAS;
  - Super Admin sees unknown IDs as unresolved;
  - Prompt 1 Admin real inbox is empty;
  - injected `admin_initiator` fixture exposes only its exact existing project;
  - exact-ID approval; no reviewer substitution;
  - unknown approval leaves request pending with `ACCESS_REQUEST_NOT_APPROVABLE`;
  - unknown rejection stores only `The access request could not be approved.`;
  - retrying that unknown rejection with the same original reason returns the terminal response, while a different reason is 409;
  - active requester/current-role/requestability revalidation;
  - a dormant-source active tuple cannot be mistaken for an effective access-request grant;
  - atomic request/grant/audit writes;
  - idempotent same decision/revocation response reconstruction and 409 competing/stale transition;
  - revocation removes Design scope immediately;
  - future grants remain dormant without route actions.

- [ ] **Step 3: Run focused tests and verify RED**

~~~bash
cd backend
npm test -- tests/access-requests.test.ts tests/access-request-repository.test.ts
~~~

- [ ] **Step 4: Implement validation and middleware order**

~~~typescript
const opaqueProjectIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const boundedReasonSchema = z.string().trim().min(1).max(1000);

router.post(
  "/access-requests",
  authenticate(authService),
  requireOperation("POST /access-requests"),
  requireEligibleModuleFromBody(),
  accessRequestRateLimit,
  validateBody(submitSchema),
  handler
);
~~~

`requireEligibleModuleFromBody` checks only the actor/current-role/module pair and returns 403 without any project lookup. Then validate the opaque ID and reason. Configure the limiter for 10 attempts per 15 minutes and at most 10,000 actor/IP buckets; expose deterministic overrides in `AppDependencies.accessRequestRateLimit`.

- [ ] **Step 5: Implement submission without project resolution**

Inside one retryable transaction callback:

  1. acquire `coordinateAuthorizationMutation()`;
  2. reload active actor and match stored role;
  3. re-check module requestability;
  4. call `findOrCreatePendingAccessRequest` for the immutable tuple;
  5. append `access_request.created` only when `created` is true;
  6. if a concurrent unique collision aborts Mongo, allow `runInTransaction` to retry the whole callback with a fresh session; the retry returns `created: false` and writes no second audit event.

Never call `findProjectById` in this method. Return only `{ accepted: true }`.

- [ ] **Step 6: Implement own history and cancellation**

`listOwn(actor, filters, pagination)` calls `pageAccessRequestsForRequester(actor.id, ...)` and maps only `OwnAccessRequestDto`; it never resolves Project IDs and omits `requesterId`, `reviewerId`, `decisionFingerprint`, and `approvedGrantId`.

Cancellation validates `{ version: z.number().int().positive() }` and runs in one transaction: reload the active actor/current role and request in any status; return the existing non-disclosing 404 unless `request.requesterId === actor.id`; transition a pending request to cancelled with exact version and append `access_request.cancelled` atomically. A network retry returns the cancelled DTO without writes only when `input.version + 1 === request.version`; approved/rejected/other-version states return 409. Cancellation never resolves the Project ID and never changes a grant.

- [ ] **Step 7: Implement review, decision, and revocation transactions**

`listForReview(actor, filters, pagination)` reloads the active actor/current role, selects `{ kind: "global" }` only for Super Admin or `{ kind: "admin_initiator", adminId: actor.id }` for Admin, and rejects every other role. Map repository rows to `ReviewAccessRequestDto`: Super Admin may receive `{ resolved: false, name: null }`; the Admin repository query has already inner-joined an exact active initiator grant and existing project, so unresolved/out-of-scope rows never enter its count or page. `activeGrant` is derived only from the request's exact `approvedGrantId` and is null when absent/inactive.

Approval transaction order:

~~~typescript
function decisionFingerprintFor(
  decision: "approved" | "rejected",
  reason: string | undefined
): string {
  const normalizedReason = decision === "approved" ? "" : (reason ?? "").trim();
  return createHash("sha256")
    .update(`\${decision}\n\${normalizedReason}`, "utf8")
    .digest("hex");
}
~~~

  1. acquire `coordinateAuthorizationMutation()`, then reload the active reviewer and request in any status;
  2. enforce global Super Admin or exact active `admin_initiator/projects` reviewer scope;
  3. compute `decisionFingerprintFor(input.decision, input.reason)` from the normalized incoming reason; if the request is terminal, authorize it first, then return it without writes only when `input.version + 1 === request.version`, status matches, and the fingerprint equals the stored decision; for an approved request, load the exact `approvedGrantId` and return it only when still active, otherwise return `null`; never substitute a later grant on the same tuple; reject every competing terminal decision/fingerprint/version with 409;
  4. resolve the exact stored Project ID in this transaction;
  5. reject unknown approval with 409 and no state change;
  6. revalidate requester active/current role/module eligibility while holding the shared authorization mutation lock;
  7. call `findOrCreateActiveProjectAccessGrant`, creating `source: "access_request"` with the request ID only when no exact active grant exists; if an exact active tuple exists but `grantCanSupplyProjectModuleScope` says its source cannot supply the requester's current role/module, return `ACCESS_REQUEST_NOT_APPROVABLE` and leave the request pending;
  8. transition the request with the exact created/reused `approvedGrantId` and append the decision audit atomically; append `project_access.granted` only when the atomic result says `created: true`.

Rejection requires a reason; an unknown project stores only the generic constant. Revocation acquires the same authorization mutation lock, loads any grant state, re-checks reviewer scope, and branches before CAS. An active grant requires its exact current version and is revoked/audited atomically. An inactive grant is returned without writes only when `incoming.version + 1 === stored.version`, `revokedById` is the same actor, and its normalized reason equals the incoming reason; every other repeated or stale revocation returns 409. This makes a retried response idempotent without letting another reviewer disguise a competing action.

- [ ] **Step 8: Register routes and app wiring**

Mount rows 88–93 with exact `requireOperation` keys, existing pagination helpers, optional canonical status/module filters, and existing error envelopes.

- [ ] **Step 9: Write and pass real Mongo transaction races**

In `access-request-mongo.replica-set.test.ts` run parallel requests against a replica set and assert:

~~~typescript
const [first, second] = await Promise.all([
  submitAccessRequest(designerToken, input),
  submitAccessRequest(designerToken, input)
]);
expect([first.status, second.status].sort()).toEqual([202, 202]);
expect(
  await AccessRequestModel.countDocuments({
    requesterId: designerId,
    projectId: input.projectId,
    module: input.module,
    status: "pending"
  })
).toBe(1);
~~~

Add atomic approval/audit rollback, one-active-grant, competing decision, exact duplicate-abort/fresh-session recovery, idempotent terminal-response reconstruction before and after revocation, same-original-reason retry of an unresolved generic rejection, and immediate revocation cases. Run this file and observe a RED failure before adjusting transaction/session/CAS/duplicate-conflict logic in the files listed for this task.

~~~bash
cd backend
npm test -- tests/access-request-mongo.replica-set.test.ts
~~~

- [ ] **Step 10: Run focused tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/access-requests.test.ts tests/access-request-repository.test.ts
npm test -- tests/access-request-mongo.replica-set.test.ts
npm test -- tests/project-module-access.test.ts tests/route-operation-registry.test.ts
npm run typecheck
~~~

- [ ] **Step 11: Commit**

~~~bash
git add backend/src/services/access-request.service.ts backend/src/routes/access-requests.ts backend/src/middleware/access-request-rate-limit.ts backend/src/models/AccessRequest.ts backend/src/models/ProjectAccessGrant.ts backend/src/repositories/mongo.ts backend/src/services/audit.service.ts backend/src/app.ts backend/tests/access-requests.test.ts backend/tests/access-request-repository.test.ts backend/tests/access-request-mongo.replica-set.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: add project access request workflow"
~~~

---

### Task 11: Add transaction-safe Admin and Super Admin user administration

**Files:**

- Create: `backend/src/services/user-administration.service.ts`
- Create: `backend/src/routes/admin-users.ts`
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/audit.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/user-administration.test.ts`
- Test: `backend/tests/user-administration-mongo.replica-set.test.ts`
- Test: `backend/tests/audit-security.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/route-operation-registry.test.ts`

**Interfaces:**

- Consumes: canonical `OPERATIONAL_ROLES`, active-grant revocation, typed audit, and operation rows 86–87.
- Produces: paginated redacted directory, CAS user mutations, responsibility counts, a write-skew-safe last-Super-Admin invariant, and grant cleanup.
- Preserves: user passwords/secrets, legacy relationship history, client auth, and one primary role.

- [ ] **Step 1: Write failing repository and service tests**

Use these exact public contracts:

~~~typescript
export interface UserDirectoryFilters {
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version: number;
  avatar?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponsibilityCounts {
  ownedActiveLeads: number;
  ownedActiveEstimates: number;
  initiatedActiveProjects: number;
  assignedActiveProjects: number;
  managedActiveProjects: number;
  ownedActiveTasks: number;
  directReports: number;
  linkedClientProjects: number;
  adminInitiatorGrants: number;
}

export type UpdateManagedUserInput =
  | { version: number; role: Role; active?: never }
  | { version: number; active: boolean; role?: never };
~~~

Required service cases:

~~~typescript
it("requires both current and destination roles to be operational for Admin", async () => {
  await expect(
    service.update(admin, designer.id, {
      version: designer.version,
      role: "admin"
    })
  ).rejects.toMatchObject({ status: 403 });
});

it("rejects role change while dependent responsibilities remain", async () => {
  await expect(
    service.update(superAdmin, designer.id, {
      version: designer.version,
      role: "procurement"
    })
  ).rejects.toMatchObject({
    status: 409,
    code: "RESPONSIBILITY_REASSIGNMENT_REQUIRED"
  });
});

it("deactivates despite active work and revokes additive grants", async () => {
  const result = await service.update(superAdmin, designer.id, {
    version: designer.version,
    active: false
  });
  expect(result.user.active).toBe(false);
  expect(result.revokedGrantCount).toBe(2);
  expect(result.responsibilities.ownedActiveTasks).toBeGreaterThan(0);
});
~~~

Also test:

  - Admin directory contains only operational current roles;
  - Super Admin directory contains every role;
  - Admin cannot target self, Admin, Super Admin, Client, Design Manager, or Design Head;
  - Admin cannot use a destination-role gap;
  - Super Admin cannot deactivate or demote the last active Super Admin;
  - two concurrent demotions of two remaining Super Admins leave at least one active;
  - stale user version is 409;
  - an inactive direct report still blocks a manager role change, and reactivating that report never points to a non-manager;
  - safe role change revokes grants;
  - deactivation records counts and does not delete legacy assignments;
  - reactivation never restores grants;
  - directory/mutation output contains no password hash or secret;
  - audit values recursively contain no password/hash/token/secret key.

In `user-administration-mongo.replica-set.test.ts` create two active Super Admin targets and issue concurrent demotions with their current versions. Assert exactly one succeeds, one returns the last-Super-Admin conflict, and one active Super Admin remains. This test must use the real Mongo transaction/coordination document, not a mocked repository.

In the same replica-set file create dedicated Designer requesters with zero leads, estimates, projects, tasks, direct reports, client links, or initiator grants. Race approval against (a) requester deactivation and (b) role change from Designer to Procurement. The user mutation must return 200 in both races; approval may return 200 when it serializes first or 409 `ACCESS_REQUEST_NOT_APPROVABLE` when it serializes second, and no unrelated conflict is accepted. Reload both User and ProjectAccessGrant after both promises settle and assert:

~~~typescript
expect(
  reloadedUser.active &&
  roleMayRequestModule(reloadedUser.role, request.module)
    ? true
    : reloadedGrant === null || reloadedGrant.active === false
).toBe(true);
~~~

For the deactivation race additionally assert `reloadedUser.active === false`; for the role race assert `reloadedUser.role === "procurement"`. In both, assert the exact Design tuple has no active grant. Both workflows must acquire `coordinateAuthorizationMutation` before reading the requester or changing grants, so the serial winner either prevents approval or revokes the just-created grant.

- [ ] **Step 2: Run focused tests and verify RED**

~~~bash
cd backend
npm test -- tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/audit-security.test.ts
~~~

- [ ] **Step 3: Add an explicit user version with legacy compatibility**

Add `version: number` to `UserRecord` and the User schema with default 1. Add `version: 1` to the seed user factory and default new memory users to version 1. Memory updates require exact equality. Mongo update with expected version 1 may match either `version: 1` or a legacy document where `version` does not exist, and writes version 2. Every subsequent update uses exact CAS. Do not change `passwordHash select: false`.

- [ ] **Step 4: Add repository primitives and exact responsibility definitions**

~~~typescript
coordinateAuthorizationMutation(): Promise<void>;
pageUsers(
  filters: UserDirectoryFilters & { visibleRoles: readonly Role[] },
  pagination: PaginationInput
): Promise<PageResult<UserRecord>>;
countActiveUsersByRole(role: Role): Promise<number>;
countUserResponsibilities(userId: string): Promise<UserResponsibilityCounts>;
updateUser(
  userId: string,
  expectedVersion: number,
  change: { role?: Role; active?: boolean; updatedAt: string }
): Promise<UserRecord>;
~~~

Count dependencies consistently in memory and Mongo:

  - active lead: owner matches and stage is neither `won` nor `lost`;
  - active estimate: owner matches and status is not `client_approved`;
  - active project: status is not `completed`, counted separately for initiator, assigned Designer, and manager;
  - active task: owner matches and status is not `completed`;
  - direct report: every persisted user whose `managerId` is the target, including inactive reports, because later reactivation must not revive an invalid manager relationship;
  - linked Client project: any project whose `clientId` is the target, because the persisted relationship cannot be rewritten;
  - Admin initiator: active `admin_initiator/projects` grant for the target.

`coordinateAuthorizationMutation` updates the singleton `AuthorizationCoordination` document inside the same Mongo session before counting/updating. The same primitive is already used by access approval/revocation, so account changes cannot interleave to leave an inactive or role-ineligible user with a new active grant. Memory's transaction lock supplies equivalent coordination.

- [ ] **Step 5: Implement the mutation transaction**

Inside `repository.runInTransaction`:

  1. acquire `coordinateAuthorizationMutation()`;
  2. reload active actor and matching stored role;
  3. reload target and expected version;
  4. for Admin, require target current role and requested destination role to both be in `OPERATIONAL_ROLES`;
  5. for Super Admin, enforce the last-active-Super-Admin invariant;
  6. on role change, count responsibilities and reject any non-zero incompatible dependency with `RESPONSIBILITY_REASSIGNMENT_REQUIRED`;
  7. on deactivation, allow the action even with work, record counts, and leave legacy links untouched;
  8. update one field, revoke every active additive grant when role changes or account deactivates, and audit all changes using the transaction repository;
  9. on reactivation, do not restore grants.

Return:

~~~typescript
export interface ManagedUserMutationResult {
  user: UserDirectoryItem;
  revokedGrantCount: number;
  responsibilities: UserResponsibilityCounts;
}
~~~

- [ ] **Step 6: Recursively scrub audit values**

Before persistence, walk objects/arrays and omit any key whose normalized name contains `password`, `hash`, `token`, or `secret`. Apply the scrubber to both old and new values. Add a test with nested arrays/objects, not only top-level fields.

- [ ] **Step 7: Add exact directory and mutation routes**

~~~typescript
router.get(
  "/admin/users",
  authenticate(authService),
  requireOperation("GET /admin/users"),
  validateQuery(directoryQuerySchema),
  handler
);

router.patch(
  "/admin/users/:userId",
  authenticate(authService),
  requireOperation("PATCH /admin/users/:userId"),
  validateBody(updateManagedUserSchema),
  handler
);
~~~

The exact GET shape is `{ data: { items, pagination, manageableRoles } }`. The PATCH schema requires positive `version` and exactly one of `role` or `active`. Admin role filters outside the visible set return 403 rather than confirming protected-role membership.

- [ ] **Step 8: Close exact 93-route parity now that rows 86–87 exist**

Replace temporary partial registry assertions with:

~~~typescript
const expectedKeys = EXPECTED_HUMAN_JWT_OPERATIONS
  .map(({ key }) => key)
  .sort();

expect(mountedHumanJwtOperations(app).sort()).toEqual(expectedKeys);
expect(expectedKeys).toHaveLength(93);
expect(new Set(expectedKeys).size).toBe(93);
expect(mountedHumanJwtOperations(app)).not.toContain(
  "POST /execution/worker-assignments/override"
);
~~~

For every mounted operation assert exactly one human authentication marker and one matching operation marker. Assert public login/signup, health, and extraction-worker routes have neither marker.

- [ ] **Step 9: Run focused tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/audit-security.test.ts
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts
npm test -- tests/route-operation-registry.test.ts
npm run typecheck
~~~

- [ ] **Step 10: Commit**

~~~bash
git add backend/src/models/User.ts backend/src/services/user-administration.service.ts backend/src/routes/admin-users.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/audit.service.ts backend/src/app.ts backend/src/seed/data.ts backend/tests/user-administration.test.ts backend/tests/user-administration-mongo.replica-set.test.ts backend/tests/audit-security.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/route-operation-registry.test.ts
git commit -m "feat: add safe user administration"
~~~

---

### Task 12: Gate destructive demo seeding and add local dummy accounts

**Files:**

- Create: `backend/src/seed/config.ts`
- Modify: `backend/src/seed/data.ts`
- Modify: `backend/src/seed/run.ts`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Modify: `README.md`
- Modify: `frontend/src/auth/LoginPage.tsx`
- Modify: `frontend/src/auth/LoginPage.test.tsx`
- Modify: `frontend/src/styles/role-themes.css`
- Test: `backend/tests/seed.test.ts`
- Test: `backend/tests/auth.test.ts`

**Interfaces:**

- Consumes: canonical roles, existing demo data, and the existing local password.
- Produces: runtime/opt-in/target seed authorization and one active dummy account for every new platform/Worker role.
- Preserves: all existing fixture IDs/relationships and prevents production UI credential display.

- [ ] **Step 1: Write failing zero-mutation safety tests**

Inject spies for the database-side-effect-free environment loader, Mongo connection, model loading, `deleteMany`, `bulkWrite`, and `insertMany`. Every invocation loads environment exactly once so shell variables can override `.env`; every rejected flag or target must make zero connection, model-loading, or mutation calls. Cover:

  - production with opt-in;
  - development without opt-in;
  - test with `TRUE`, `1`, empty, or whitespace values;
  - missing `NODE_ENV`;
  - valid development flags with a remote host;
  - valid development flags with any `mongodb+srv` target;
  - valid development flags with a local production-like database such as `lisno`;
  - local URI database differing from `DEMO_SEED_DATABASE`;
  - direct seed helper invocation without an authorization capability.

Assert development/test plus exact `true`, loopback `mongodb://`, and exact matching `lisno_demo` or `lisno_test*` database reaches connection/reset.

- [ ] **Step 2: Write failing role-account tests**

Assert exactly one active seeded user for:

~~~text
super_admin
admin
procurement
finance_head
site_manager
worker_electrician
worker_plumber
worker_carpenter
worker_painter
worker_civil
worker_other
~~~

Use deterministic IDs `user-super-admin`, `user-admin`, `user-procurement`, `user-finance-head`, `user-site-manager`, and `user-worker-<trade>`. Use corresponding `@lisno.example` emails. Verify the configured hash matches the documented local password with bcrypt. Keep access request/grant seed arrays empty.

- [ ] **Step 3: Run and verify RED**

~~~bash
cd backend
npm test -- tests/seed.test.ts tests/auth.test.ts
~~~

- [ ] **Step 4: Implement the capability-style safety gate**

~~~typescript
import { config as dotenvConfig } from "dotenv";

export interface DemoSeedRuntime {
  NODE_ENV?: string;
  ALLOW_DEMO_SEED?: string;
  DEMO_SEED_DATABASE?: string;
}

export interface LoadedDemoSeedEnvironment extends DemoSeedRuntime {
  MONGODB_URI: string;
}

export function loadDemoSeedEnvironment(): LoadedDemoSeedEnvironment {
  dotenvConfig({ override: false, quiet: true });
  return {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED,
    DEMO_SEED_DATABASE: process.env.DEMO_SEED_DATABASE,
    MONGODB_URI: process.env.MONGODB_URI ?? ""
  };
}

const demoSeedAuthorizationBrand = Symbol("demo-seed-authorization");
export type DemoSeedAuthorization = {
  readonly [demoSeedAuthorizationBrand]: true;
  readonly databaseName: string;
};

export interface ParsedMongoTarget {
  protocol: "mongodb:";
  hostname: string;
  databaseName: string;
}

export function parseSingleHostMongoTarget(
  uri: string
): ParsedMongoTarget {
  const parsed = new URL(uri);
  if (
    parsed.protocol !== "mongodb:" ||
    !parsed.hostname ||
    parsed.host.includes(",") ||
    parsed.hash ||
    parsed.pathname.split("/").filter(Boolean).length !== 1
  ) {
    throw new Error("Demo seed Mongo target is invalid.");
  }
  return {
    protocol: "mongodb:",
    hostname: parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase(),
    databaseName: decodeURIComponent(parsed.pathname.slice(1))
  };
}

export function assertDemoSeedRuntimeAllowed(
  runtime: DemoSeedRuntime
): void {
  if (
    !["development", "test"].includes(runtime.NODE_ENV ?? "") ||
    runtime.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error("Demo seed is disabled.");
  }
}

export function authorizeDemoSeed(
  runtime: DemoSeedRuntime,
  mongodbUri: string
): DemoSeedAuthorization {
  assertDemoSeedRuntimeAllowed(runtime);
  const expectedDatabase = runtime.DEMO_SEED_DATABASE ?? "";
  if (!/^lisno_(?:demo|test)(?:[_-][a-z0-9_-]+)?$/.test(expectedDatabase)) {
    throw new Error("Demo seed database is not allowlisted.");
  }
  const target = parseSingleHostMongoTarget(mongodbUri);
  if (
    target.protocol !== "mongodb:" ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.databaseName !== expectedDatabase
  ) {
    throw new Error("Demo seed target is not a local allowlisted database.");
  }
  return {
    [demoSeedAuthorizationBrand]: true,
    databaseName: expectedDatabase
  };
}

export function assertAuthorizedDemoSeedTarget(
  authorization: DemoSeedAuthorization | undefined,
  connectedDatabaseName: string
): asserts authorization is DemoSeedAuthorization {
  if (
    !authorization ||
    authorization[demoSeedAuthorizationBrand] !== true ||
    connectedDatabaseName !== authorization.databaseName
  ) {
    throw new Error("Demo seed authorization does not match the connection.");
  }
}
~~~

Remove the top-level `import "dotenv/config"` from `seed/run.ts`. `main()` calls `loadDemoSeedEnvironment()` exactly once; that database-side-effect-free function loads `.env` without overriding shell variables and returns the four fields above. It then calls `authorizeDemoSeed(env, env.MONGODB_URI)` before `mongoose.connect` or dynamic model loading. `parseSingleHostMongoTarget` rejects SRV, remote, missing-database, multi-host, and malformed targets. `seedMongoDatabase(authorization)` calls the exported `assertAuthorizedDemoSeedTarget(authorization, mongoose.connection.name)`—which closes over the private brand—before its first delete/write. Include AccessRequest, ProjectAccessGrant, and AuthorizationCoordination in the authorized reset.

~~~typescript
async function main(): Promise<void> {
  const env = loadDemoSeedEnvironment();
  const authorization = authorizeDemoSeed(env, env.MONGODB_URI);
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(env.MONGODB_URI);
  try {
    await seedMongoDatabase(authorization);
  } finally {
    await mongoose.disconnect();
  }
}

export async function seedMongoDatabase(
  authorization: DemoSeedAuthorization
): Promise<void> {
  const mongoose = (await import("mongoose")).default;
  assertAuthorizedDemoSeedTarget(
    authorization,
    mongoose.connection.name
  );
  const models = await loadSeedModels();
  await resetAuthorizedSeedCollections(models, demoSeedData);
}
~~~

`loadSeedModels` imports exactly the existing seed models plus AccessRequest, ProjectAccessGrant, and AuthorizationCoordination; `resetAuthorizedSeedCollections` contains the existing delete/replace/append-only reset logic. Neither function is called until the branded target assertion passes.

- [ ] **Step 5: Add the accounts and local documentation**

  - Put the deterministic account definitions and password/hash constants in `seed/config.ts`.
  - Keep credentials in README files only.
  - Document `NODE_ENV=development ALLOW_DEMO_SEED=true DEMO_SEED_DATABASE=lisno_demo npm run seed` and the destructive-reset warning; the URI still comes from the matching local `.env` value.
  - Set `NODE_ENV=development`, `ALLOW_DEMO_SEED=false`, and `DEMO_SEED_DATABASE=lisno_demo` in `backend/.env.example`; its local Mongo URI must point to `lisno_demo`.
  - State explicitly that this is not a production privileged-account bootstrap.
  - Retain the client-email claim production blocker in the root README.

- [ ] **Step 6: Remove credentials from the application UI**

Delete the demo-account constant, fill-credentials button/helper, Sparkles import, and dead `.demo-helper` styling. Update the Login Page test to assert the email/password helper and credential values are absent.

- [ ] **Step 7: Run focused tests and verify GREEN**

~~~bash
cd backend
npm test -- tests/seed.test.ts tests/auth.test.ts
npm run typecheck
cd ../frontend
npm test -- src/auth/LoginPage.test.tsx
npm run typecheck
~~~

- [ ] **Step 8: Commit**

~~~bash
git add backend/src/seed/config.ts backend/src/seed/data.ts backend/src/seed/run.ts backend/.env.example backend/README.md README.md backend/tests/seed.test.ts backend/tests/auth.test.ts frontend/src/auth/LoginPage.tsx frontend/src/auth/LoginPage.test.tsx frontend/src/styles/role-themes.css
git commit -m "chore: gate demo seed and add role accounts"
~~~

---

### Task 13: Load and validate frontend authorization snapshots atomically

**Files:**

- Create: `frontend/src/api/authorization-contract.ts`
- Create: `frontend/src/auth/authorization.ts`
- Create: `frontend/src/test/authFixtures.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/auth/AuthProvider.tsx`
- Modify: `frontend/src/test/render.tsx`
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/routePaths.test.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/router.test.tsx`
- Modify: `frontend/src/components/layout/navigation.ts`
- Modify: `frontend/src/components/layout/navigation.test.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/content/roleFeedback.ts`
- Modify: `frontend/src/content/roleFeedback.test.ts`
- Test: `frontend/src/api/authorization-contract.test.ts`
- Test: `frontend/src/auth/authorization.test.ts`
- Test: `frontend/src/auth/AuthProvider.test.tsx`
- Test: `backend/tests/frontend-authorization-contract.test.ts`
- Modify: `frontend/src/auth/LoginPage.test.tsx`
- Modify: `frontend/src/auth/SignupPage.test.tsx`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/features/client/ClientDashboard.collapsible.test.tsx`
- Modify: `frontend/src/features/client/ClientDashboard.test.tsx`
- Modify: `frontend/src/features/client/ClientProject.test.tsx`
- Modify: `frontend/src/features/designer/DesignerDashboard.test.tsx`
- Modify: `frontend/src/features/designer/ProjectWorkspace.test.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Modify: `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`
- Modify: `frontend/src/features/head/HeadDashboard.test.tsx`
- Modify: `frontend/src/features/leads/LeadDashboard.pdf.test.tsx`
- Modify: `frontend/src/features/leads/LeadDashboard.test.tsx`
- Modify: `frontend/src/features/manager/DesignerDetail.test.tsx`
- Modify: `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`
- Modify: `frontend/src/features/manager/ManagerDashboard.test.tsx`
- Modify: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**

- Consumes: backend `AuthorizationSnapshot`.
- Produces: dependency-free frontend contract, strict parser, `authorization` auth context state, and reusable test snapshots.
- Preserves: current token storage, race protection, query-cache clearing, login/signup return values, and 401 session handling.

- [ ] **Step 1: Write cross-layer contract and parser tests**

In `backend/tests/frontend-authorization-contract.test.ts` import the dependency-free frontend contract module and compare its role codes, permission codes, modules, requestable modules, and policy version to backend constants. This test is the drift gate; do not derive one side from the other in test setup.

Frontend parser cases:

  - exact role/version accepted;
  - snapshot role differing from `PublicUser.role` rejected;
  - stale/missing policy version rejected;
  - missing/malformed role or permission array rejected;
  - unknown individual permission strings omitted, therefore denied;
  - duplicates normalized to canonical order;
  - unknown role rejected.

~~~typescript
expect(
  parseAuthorizationSnapshot(
    {
      role: "designer",
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      permissions: ["identity.self.read", "unknown.action"]
    },
    "designer"
  )
).toEqual({
  role: "designer",
  policyVersion: AUTHORIZATION_POLICY_VERSION,
  permissions: ["identity.self.read"]
});
~~~

- [ ] **Step 2: Write failing AuthProvider atomicity/race tests**

Add cases for:

  - restore waits for both `/auth/me` and `/auth/authorization`;
  - identity succeeds but authorization fails;
  - role mismatch;
  - stale policy;
  - stale authorization response after a newer login;
  - logout aborts both restore requests;
  - login/signup replacement token is removed if snapshot establishment fails;
  - accepted 401 clears user, authorization, token, and query cache;
  - no child observes an authenticated user with null authorization.

- [ ] **Step 3: Run and verify RED**

~~~bash
cd frontend
npm test -- src/api/authorization-contract.test.ts src/auth/authorization.test.ts src/auth/AuthProvider.test.tsx
cd ../backend
npm test -- tests/frontend-authorization-contract.test.ts
~~~

- [ ] **Step 4: Implement the dependency-free mirrored contract**

Declare the exact 16 `ROLE_CODES`, every backend `PERMISSION_CODE` including the reserved override, six project modules, four requestable modules, exact policy version, Worker roles, operational roles, and exhaustive display labels. Export literal union types. Do not import React, icons, browser APIs, or backend runtime code so the backend parity test can load it.

Also widen the existing frontend `Evaluation.evaluatorRole` field to `"design_manager" | "design_head" | "super_admin"`. In `DesignerDetail.test.tsx`, return one Super Admin-created evaluation, assert it renders in the trend/history, and assert a Manager's correction picker excludes it because correction candidates still require both the current evaluator's user ID and role.

~~~typescript
export function isFrontendRole(value: unknown): value is Role {
  return typeof value === "string" &&
    (ROLE_CODES as readonly string[]).includes(value);
}

export const REQUESTABLE_MODULES_BY_ROLE = {
  super_admin: [], admin: [], estimator_sales: [], designer: ["design"],
  procurement: ["procurement"], finance_head: ["finance"],
  site_manager: ["execution"], worker_electrician: [], worker_plumber: [],
  worker_carpenter: [], worker_painter: [], worker_civil: [], worker_other: [],
  design_manager: [], design_head: [], client: []
} as const satisfies Record<Role, readonly RequestableProjectModule[]>;

export function roleMayRequestModule(
  role: Role,
  module: RequestableProjectModule
): boolean {
  return (REQUESTABLE_MODULES_BY_ROLE[role] as
    readonly RequestableProjectModule[]).includes(module);
}
~~~

- [ ] **Step 5: Implement strict snapshot parsing**

~~~typescript
const rawAuthorizationSnapshotSchema = z.object({
  role: z.string(),
  policyVersion: z.string(),
  permissions: z.array(z.string()).max(PERMISSION_CODES.length + 32)
}).strict();

export class InvalidAuthorizationSnapshotError extends Error {
  readonly code = "INVALID_AUTHORIZATION_SNAPSHOT";

  constructor() {
    super("The authorization policy could not be established.");
    this.name = "InvalidAuthorizationSnapshotError";
  }
}

export function parseAuthorizationSnapshot(
  input: unknown,
  expectedRole: Role
): AuthorizationSnapshot | null {
  const parsed = rawAuthorizationSnapshotSchema.safeParse(input);
  if (!parsed.success) return null;
  if (
    !isFrontendRole(parsed.data.role) ||
    parsed.data.role !== expectedRole ||
    parsed.data.policyVersion !== AUTHORIZATION_POLICY_VERSION
  ) {
    return null;
  }
  const permissions = PERMISSION_CODES.filter((permission) =>
    parsed.data.permissions.includes(permission)
  );
  return Object.freeze({
    role: parsed.data.role,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: Object.freeze(permissions)
  });
}
~~~

Account for the API client's existing envelope-unwrapping behavior: pass the unwrapped `data` object, not a second envelope, if `apiClient.get` already unwraps it.

- [ ] **Step 6: Commit identity and authorization together in AuthProvider**

Add `authorization: AuthorizationSnapshot | null` to context. Restore:

~~~typescript
const [currentUser, rawAuthorization] = await Promise.all([
  apiClient.get<PublicUser>("/auth/me", { signal: controller.signal }),
  apiClient.get<unknown>("/auth/authorization", { signal: controller.signal })
]);
const authorization = parseAuthorizationSnapshot(
  rawAuthorization,
  currentUser.role
);
if (!authorization) throw new InvalidAuthorizationSnapshotError();
commitSession(currentUser, authorization);
~~~

For login/signup, store the replacement token, clear prior cache, fetch/validate `/auth/authorization` against `payload.user.role`, then commit both atomically. Every logout/failure/supersession/accepted 401 clears both.

- [ ] **Step 7: Update authenticated test fixtures**

Use `authorizationFor(role)` from `frontend/src/test/authFixtures.ts` and add `/auth/authorization` responses to:

  - `frontend/src/app/router.test.tsx`;
  - `frontend/src/auth/AuthProvider.test.tsx`;
  - `frontend/src/auth/LoginPage.test.tsx`;
  - `frontend/src/auth/SignupPage.test.tsx`;
  - `frontend/src/components/layout/AppShell.test.tsx`;
  - `frontend/src/features/client/ClientDashboard.collapsible.test.tsx`;
  - `frontend/src/features/client/ClientDashboard.test.tsx`;
  - `frontend/src/features/client/ClientProject.test.tsx`;
  - `frontend/src/features/designer/DesignerDashboard.test.tsx`;
  - `frontend/src/features/designer/ProjectWorkspace.test.tsx`;
  - `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`;
  - `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`;
  - `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`;
  - `frontend/src/features/head/HeadDashboard.test.tsx`;
  - `frontend/src/features/leads/LeadDashboard.pdf.test.tsx`;
  - `frontend/src/features/leads/LeadDashboard.test.tsx`;
  - `frontend/src/features/manager/DesignerDetail.test.tsx`;
  - `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`;
  - `frontend/src/features/manager/ManagerDashboard.test.tsx`;
  - `frontend/src/test/accessibility.test.tsx`.

Do not weaken AuthProvider to accommodate old mocks.

- [ ] **Step 8: Make every existing exhaustive Role consumer safe**

Before running typecheck, expand all current `Record<Role, ...>` consumers:

  - `routePaths.ts` maps every new role to `/home` as an interim neutral destination; Task 14 changes Admin/Super Admin to their final `/admin/users` home.
  - `router.tsx` adds neutral `roleHomeContent` entries and one `/home` route restricted to Admin, Super Admin, Procurement, Finance Head, Site Manager, and all Worker roles. Task 14 removes Admin/Super Admin from that route when it installs their final permission routes.
  - `navigation.ts` gives every new role an explicit empty frozen array; do not expose future-module links.
  - `Sidebar.tsx` imports the exhaustive labels from `authorization-contract.ts`.
  - `roleFeedback.ts` assigns a shared immutable neutral feedback bundle explicitly to each new role; never fall through an undefined map entry.

Add table tests that iterate all 16 `ROLE_CODES` and prove `roleHomePath`, navigation, role label, RoleLanding content, and `getRoleFeedback` return defined safe values.

- [ ] **Step 9: Run focused tests and verify GREEN**

~~~bash
cd frontend
npm test -- src/api/authorization-contract.test.ts src/auth/authorization.test.ts src/auth/AuthProvider.test.tsx
npm test -- src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx src/content/roleFeedback.test.ts
npm test -- src/features/manager/DesignerDetail.test.tsx
npm run typecheck
cd ../backend
npm test -- tests/frontend-authorization-contract.test.ts
~~~

- [ ] **Step 10: Commit**

~~~bash
git add frontend/src/api/authorization-contract.ts frontend/src/api/authorization-contract.test.ts frontend/src/api/types.ts frontend/src/auth/authorization.ts frontend/src/auth/authorization.test.ts frontend/src/auth/AuthProvider.tsx frontend/src/auth/AuthProvider.test.tsx frontend/src/test/authFixtures.ts frontend/src/test/render.tsx frontend/src/app/routePaths.ts frontend/src/app/routePaths.test.ts frontend/src/app/router.tsx frontend/src/app/router.test.tsx frontend/src/components/layout/navigation.ts frontend/src/components/layout/navigation.test.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/content/roleFeedback.ts frontend/src/content/roleFeedback.test.ts frontend/src/auth/LoginPage.test.tsx frontend/src/auth/SignupPage.test.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/features/client/ClientDashboard.collapsible.test.tsx frontend/src/features/client/ClientDashboard.test.tsx frontend/src/features/client/ClientProject.test.tsx frontend/src/features/designer/DesignerDashboard.test.tsx frontend/src/features/designer/ProjectWorkspace.test.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx frontend/src/features/estimates/estimateDrawingJourney.test.tsx frontend/src/features/head/HeadDashboard.test.tsx frontend/src/features/leads/LeadDashboard.pdf.test.tsx frontend/src/features/leads/LeadDashboard.test.tsx frontend/src/features/manager/DesignerDetail.test.tsx frontend/src/features/manager/ManagementProjectWorkspace.test.tsx frontend/src/features/manager/ManagerDashboard.test.tsx frontend/src/test/accessibility.test.tsx backend/tests/frontend-authorization-contract.test.ts
git commit -m "feat: load frontend authorization snapshots"
~~~

Before committing, inspect the broad `frontend/src` stage and unstage any file not changed solely for the authorization fixture cascade.

---

### Task 14: Replace frontend role redirects with permission routes and registered navigation

**Files:**

- Create: `frontend/src/app/routeRegistry.ts`
- Create: `frontend/src/auth/PermissionRoute.tsx`
- Create: `frontend/src/auth/AccessDeniedPage.tsx`
- Create: `frontend/src/features/home/NeutralHomePage.tsx`
- Modify: `frontend/src/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/components/layout/navigation.ts`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/MobileHeader.tsx`
- Test: `frontend/src/auth/PermissionRoute.test.tsx`
- Test: `frontend/src/auth/AccessDeniedPage.test.tsx`
- Test: `frontend/src/features/home/NeutralHomePage.test.tsx`
- Test: `frontend/src/app/routePaths.test.ts`
- Test: `frontend/src/app/router.test.tsx`
- Test: `frontend/src/components/layout/navigation.test.tsx`
- Test: `frontend/src/components/layout/AppShell.test.tsx`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**

- Consumes: authenticated user plus validated snapshot.
- Produces: explicit Access Denied behavior, neutral homes, route registry, and permission-filtered/role-exposed navigation.
- Preserves: existing five role paths and screens; hiding links is presentation only.

- [ ] **Step 1: Write failing routing and navigation tests**

Assert:

  - a missing snapshot remains behind authenticated loading/error state;
  - missing permission renders Access Denied without redirecting;
  - 401 still returns to login;
  - generic direct denial has no access-request link;
  - 404 remains Not Found and does not create request context;
  - Super Admin navigation contains Users and Access requests only;
  - Admin navigation contains Users and Access requests only;
  - Super Admin and Admin direct navigation to existing personal-workflow dashboards is denied even when a read permission exists; global backend read APIs remain covered separately and no Prompt 8 browser is added;
  - Procurement, Finance Head, and Site Manager receive Home plus My access requests;
  - Designer retains Workspace and adds My access requests;
  - every Worker trade receives neutral Home only;
  - existing Client, Manager, Head, and Estimator destinations remain unchanged.
  - `/admin/users`, `/admin/access-requests`, and `/access-requests/mine` are non-404 permission-guarded staged pages in this task; Tasks 15–16 replace their elements without changing registry metadata.
  - Access Denied, neutral Home, desktop navigation, and mobile navigation have no axe violations and retain visible keyboard focus.

- [ ] **Step 2: Run and verify RED**

~~~bash
cd frontend
npm test -- src/auth/PermissionRoute.test.tsx src/auth/AccessDeniedPage.test.tsx
npm test -- src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx
~~~

- [ ] **Step 3: Register exact frontend routes**

Use these permission/path/presentation/navigation decisions:

| Path | Permission | Presentation roles | Navigation roles |
|---|---|---|---|
| `/designer` | `projects.list` | Designer | Designer |
| `/designer/projects/:projectId` | `projects.read` | Designer | none |
| `/manager` | `organization.team.read` | Design Manager | Design Manager |
| `/manager/designers/:designerId` | `organization.designer_summary.read` | Design Manager | none |
| `/manager/projects/:projectId` | `projects.read` | Design Manager | none |
| `/head` | `organization.tree.read` | Design Head | Design Head |
| `/head/designers/:designerId` | `organization.designer_summary.read` | Design Head | none |
| `/head/projects/:projectId` | `projects.read` | Design Head | none |
| `/estimator-sales` | `estimation.lead.list` | Estimator/Sales | Estimator/Sales |
| `/estimator-sales/leads/:leadId` | `estimation.lead.read` | Estimator/Sales | none |
| `/estimator-sales/leads/:leadId/estimate` | `estimation.estimate.read` | Estimator/Sales | none |
| `/client` | `projects.client_summary.read` | Client | Client |
| `/client/projects/:projectId` | `projects.read` | Client | none |
| `/admin/users` | `identity.users.read` | Admin, Super Admin | Admin, Super Admin |
| `/admin/access-requests` | `access_request.review.read` | Admin, Super Admin | Admin, Super Admin |
| `/access-requests/mine` | `access_request.self.read` | Designer, Procurement, Finance Head, Site Manager, Super Admin | Designer, Procurement, Finance Head, Site Manager |
| `/home` | `identity.self.read` | Procurement, Finance Head, Site Manager, all Worker roles | same |
| `/access-denied` | authenticated only | every role | none |

`presentationRoles` is an explicit UI-safety boundary in addition to permission; `navigation.roles` is its visible subset. Existing dashboards combine reads with personally attributable mutations, so they are not compatible Super Admin read surfaces. Prompt 1 preserves global backend reads without adding the Prompt 8 global browser or exposing personal-action controls to Super Admin.

At this task boundary, mount `NeutralHomePage` with explicit copy for routes whose full page arrives later:

~~~tsx
const stagedElements = {
  "/admin/users": (
    <NeutralHomePage
      title="User administration"
      description="User access management is loading in the next Prompt 1 task."
    />
  ),
  "/admin/access-requests": (
    <NeutralHomePage
      title="Access requests"
      description="Access-request review is loading in the final Prompt 1 interface task."
    />
  ),
  "/access-requests/mine": (
    <NeutralHomePage
      title="My access requests"
      description="Your request history is loading in the final Prompt 1 interface task."
    />
  )
} as const;
~~~

`NeutralHomePage` accepts required `title` and `description` props and contains no action that calls an unimplemented API. Task 15 replaces only `/admin/users`; Task 16 replaces the two access-request elements. The permission and navigation entries remain unchanged.

- [ ] **Step 4: Implement permission guard and generic denial**

`ProtectedRoute` retains authentication/loading/error logic and delegates action checks to `PermissionRoute`. `PermissionRoute` renders `AccessDeniedPage` for a valid session missing a permission. Do not silently redirect to role home.

`AccessDeniedPage` accepts optional `SafeAccessRequestContext` only from an already known, non-hidden project context:

~~~typescript
interface SafeAccessRequestContext {
  projectId: string;
  module: RequestableProjectModule;
}
~~~

A direct route guard passes no context. A 404 never renders an access-request action.

`AccessDeniedPage` renders “Request access” only when context exists, `roleMayRequestModule(auth.user.role, context.module)` is true, and the snapshot has `access_request.create`; otherwise it is a generic denial. The link serializes only validated `projectId` and `module` query parameters.

Use this fail-closed guard shape for every registered page:

~~~tsx
export function PermissionRoute({
  permission,
  presentationRoles,
  requestContext,
  children
}: {
  permission: PermissionCode;
  presentationRoles: readonly Role[];
  requestContext?: SafeAccessRequestContext;
  children: ReactNode;
}) {
  const auth = useAuth();
  if (
    auth.status !== "authenticated" ||
    !auth.user ||
    !auth.authorization ||
    auth.authorization.role !== auth.user.role
  ) {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="error"
        message="Authorization could not be established."
      />
    );
  }
  return presentationRoles.includes(auth.user.role) &&
    hasFrontendPermission(auth.authorization, permission)
    ? children
    : <AccessDeniedPage requestContext={requestContext} />;
}
~~~

Router entries must nest it under `ProtectedRoute` and pass both values from the same registry entry; only a resource page that has already loaded a known project may pass `requestContext`. The generic registry renderer passes none.

- [ ] **Step 5: Add exhaustive role homes and labels**

~~~typescript
const roleHomePathByRole: Record<Role, string> = {
  super_admin: "/admin/users",
  admin: "/admin/users",
  estimator_sales: "/estimator-sales",
  designer: "/designer",
  procurement: "/home",
  finance_head: "/home",
  site_manager: "/home",
  worker_electrician: "/home",
  worker_plumber: "/home",
  worker_carpenter: "/home",
  worker_painter: "/home",
  worker_civil: "/home",
  worker_other: "/home",
  design_manager: "/manager",
  design_head: "/head",
  client: "/client"
};
~~~

Use contract-provided labels in Sidebar; remove local duplicated role labels.

- [ ] **Step 6: Derive navigation from the registry**

`navigationForAuthorization(user.role, authorization)` filters registered navigation entries by both explicit navigation roles and `hasFrontendPermission`. AppShell/desktop/mobile navigation requires a valid snapshot.

~~~typescript
export interface RegisteredFrontendRoute {
  path: string;
  permission: PermissionCode | null;
  presentationRoles: readonly Role[];
  navigation: {
    roles: readonly Role[];
    item: NavigationItem;
  } | null;
}

export const ROUTE_REGISTRY = [
  { path: "/designer", permission: "projects.list", presentationRoles: ["designer"], navigation: { roles: ["designer"], item: { label: "Workspace", to: "/designer", end: true, icon: LayoutDashboard } } },
  { path: "/designer/projects/:projectId", permission: "projects.read", presentationRoles: ["designer"], navigation: null },
  { path: "/manager", permission: "organization.team.read", presentationRoles: ["design_manager"], navigation: { roles: ["design_manager"], item: { label: "Team", to: "/manager", end: true, icon: UsersRound } } },
  { path: "/manager/designers/:designerId", permission: "organization.designer_summary.read", presentationRoles: ["design_manager"], navigation: null },
  { path: "/manager/projects/:projectId", permission: "projects.read", presentationRoles: ["design_manager"], navigation: null },
  { path: "/head", permission: "organization.tree.read", presentationRoles: ["design_head"], navigation: { roles: ["design_head"], item: { label: "Organization", to: "/head", end: true, icon: Building2 } } },
  { path: "/head/designers/:designerId", permission: "organization.designer_summary.read", presentationRoles: ["design_head"], navigation: null },
  { path: "/head/projects/:projectId", permission: "projects.read", presentationRoles: ["design_head"], navigation: null },
  { path: "/estimator-sales", permission: "estimation.lead.list", presentationRoles: ["estimator_sales"], navigation: { roles: ["estimator_sales"], item: { label: "Leads & estimates", to: "/estimator-sales", end: true, icon: BriefcaseBusiness } } },
  { path: "/estimator-sales/leads/:leadId", permission: "estimation.lead.read", presentationRoles: ["estimator_sales"], navigation: null },
  { path: "/estimator-sales/leads/:leadId/estimate", permission: "estimation.estimate.read", presentationRoles: ["estimator_sales"], navigation: null },
  { path: "/client", permission: "projects.client_summary.read", presentationRoles: ["client"], navigation: { roles: ["client"], item: { label: "My projects", to: "/client", end: true, icon: FolderKanban } } },
  { path: "/client/projects/:projectId", permission: "projects.read", presentationRoles: ["client"], navigation: null },
  { path: "/admin/users", permission: "identity.users.read", presentationRoles: ["admin", "super_admin"], navigation: { roles: ["admin", "super_admin"], item: { label: "Users", to: "/admin/users", end: true, icon: UsersRound } } },
  { path: "/admin/access-requests", permission: "access_request.review.read", presentationRoles: ["admin", "super_admin"], navigation: { roles: ["admin", "super_admin"], item: { label: "Access requests", to: "/admin/access-requests", end: true, icon: ClipboardCheck } } },
  { path: "/access-requests/mine", permission: "access_request.self.read", presentationRoles: ["designer", "procurement", "finance_head", "site_manager", "super_admin"], navigation: { roles: ["designer", "procurement", "finance_head", "site_manager"], item: { label: "My access requests", to: "/access-requests/mine", end: true, icon: KeyRound } } },
  { path: "/home", permission: "identity.self.read", presentationRoles: ["procurement", "finance_head", "site_manager", ...WORKER_ROLES], navigation: { roles: ["procurement", "finance_head", "site_manager", ...WORKER_ROLES], item: { label: "Home", to: "/home", end: true, icon: House } } },
  { path: "/access-denied", permission: null, presentationRoles: ROLE_CODES, navigation: null }
] as const satisfies readonly RegisteredFrontendRoute[];

export function navigationForAuthorization(
  role: Role,
  authorization: AuthorizationSnapshot
): readonly NavigationItem[] {
  if (authorization.role !== role) return [];
  return ROUTE_REGISTRY
    .filter((entry) => entry.navigation !== null)
    .filter((entry) =>
      (entry.navigation!.roles as readonly Role[]).includes(role)
    )
    .filter((entry) =>
      entry.permission === null ||
      hasFrontendPermission(authorization, entry.permission)
    )
    .map((entry) => entry.navigation!.item);
}
~~~

- [ ] **Step 7: Run focused tests and verify GREEN**

~~~bash
cd frontend
npm test -- src/auth/PermissionRoute.test.tsx src/auth/AccessDeniedPage.test.tsx src/features/home/NeutralHomePage.test.tsx
npm test -- src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx
npm test -- src/test/accessibility.test.tsx
npm run typecheck
~~~

- [ ] **Step 8: Commit**

~~~bash
git add frontend/src/app/routeRegistry.ts frontend/src/auth/PermissionRoute.tsx frontend/src/auth/AccessDeniedPage.tsx frontend/src/features/home/NeutralHomePage.tsx frontend/src/auth/ProtectedRoute.tsx frontend/src/app/routePaths.ts frontend/src/app/router.tsx frontend/src/components/layout/navigation.ts frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/MobileHeader.tsx frontend/src/auth/PermissionRoute.test.tsx frontend/src/auth/AccessDeniedPage.test.tsx frontend/src/features/home/NeutralHomePage.test.tsx frontend/src/app/routePaths.test.ts frontend/src/app/router.test.tsx frontend/src/components/layout/navigation.test.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/test/accessibility.test.tsx
git commit -m "feat: add permission-aware frontend routing"
~~~

---

### Task 15: Build the Admin/Super Admin user directory and mutation UI

**Files:**

- Create: `frontend/src/features/admin/adminApi.ts`
- Create: `frontend/src/features/admin/UserDirectoryPage.tsx`
- Create: `frontend/src/features/admin/UserMutationDialog.tsx`
- Create: `frontend/src/styles/access-administration.css`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/features/admin/UserDirectoryPage.test.tsx`
- Test: `frontend/src/features/admin/UserMutationDialog.test.tsx`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**

- Consumes: `GET/PATCH /admin/users` DTOs and existing UI primitives.
- Produces: redacted paginated directory, safe role/status mutation dialog, and clear concurrency/responsibility feedback.
- Preserves: existing shell, design system, responsive behavior, and no staff-create/invite button.

- [ ] **Step 1: Write failing page and dialog tests**

Use these literal MSW-backed cases:

| Test name | Actor | Request and valid body | Mock response | UI/state assertion |
|---|---|---|---|---|
| `Admin sees only operational users and destinations` | `admin` | `GET /api/v1/admin/users?limit=20&offset=0` | `200 { data: { items: [designer], pagination, manageableRoles: OPERATIONAL_ROLES } }` | only returned operational row/options render; no password, credential, create, invite, or impersonate control exists |
| `Super Admin sees every role` | `super_admin` | `GET /api/v1/admin/users?limit=20&offset=0` | `200 { data: { items: [superAdmin, admin, designer, client], pagination, manageableRoles: ROLE_CODES } }` | all four rows and all role labels render |
| `directory sends canonical filters and pagination` | `super_admin` | after entering search `maya`, role `designer`, active `true`, and selecting Next: `GET /api/v1/admin/users?search=maya&role=designer&active=true&limit=20&offset=20` | `200 { data: { items:[designer], pagination:{ limit:20, offset:20, total:21, hasMore:false }, manageableRoles:ROLE_CODES } }` | offset resets to `0` after each filter change, then becomes `20` only on Next; no differently ordered query matches |
| `role change submits one field and version` | `super_admin` | `PATCH /api/v1/admin/users/user-designer-arun` with `{ "version":3, "role":"procurement" }` | `200 { data: { user: { ...designer, role:"procurement", version:4 }, revokedGrantCount:1, responsibilities:zeroCounts } }` | no `active` field is sent; directory invalidates, dialog closes, live success announced |
| `deactivation explains preserved assignments` | `super_admin` | `PATCH /api/v1/admin/users/user-designer-arun` with `{ "version":3, "active":false }` after confirmation | `200 { data: { user: { ...designer, active:false, version:4 }, revokedGrantCount:2, responsibilities:{ ...zeroCounts, ownedActiveTasks:2 } } }` | confirmation says grants revoke and assignments remain; returned counts render; no `role` field is sent |
| `responsibility conflict remains actionable` | `super_admin` | `PATCH /api/v1/admin/users/user-designer-arun` with `{ "version":3, "role":"procurement" }` | `409 { error: { code:"RESPONSIBILITY_REASSIGNMENT_REQUIRED", message:"Reassign dependent work first." } }` | dialog remains open, message renders, no success announcement or automatic replay |
| `stale version refetches without replay` | `super_admin` | `PATCH /api/v1/admin/users/user-designer-arun` with `{ "version":3, "role":"procurement" }` | `409 { error: { code:"VERSION_CONFLICT", message:"The user changed elsewhere." } }`, followed by `GET /api/v1/admin/users?limit=20&offset=0` returning version `4` | query invalidates/refetches; dialog remains open and requires a new explicit choice; PATCH count stays one |
| `last Super Admin error is explicit` | `super_admin` | `PATCH /api/v1/admin/users/user-super-admin` with `{ "version":1, "active":false }` | `409 { error: { code:"LAST_SUPER_ADMIN", message:"At least one active Super Admin is required." } }` | exact message renders; dialog remains open; no refetch-triggered replay |
| `directory and dialog are keyboard accessible` | `admin` | `GET /api/v1/admin/users?limit=20&offset=0`; then open dialog, Tab, Escape, reopen, Cancel | `200 { data: { items:[designer], pagination, manageableRoles:OPERATIONAL_ROLES } }`; no mutation request | axe has no violations; initial focus, trap, Escape/Cancel close, and trigger-focus restoration all pass |

- [ ] **Step 2: Run and verify RED**

~~~bash
cd frontend
npm test -- src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx
~~~

- [ ] **Step 3: Implement typed API functions**

~~~typescript
export interface UserDirectoryFilters {
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version: number;
  avatar?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDirectoryPage extends PageData<UserDirectoryItem> {
  manageableRoles: Role[];
}

export type UpdateManagedUserInput =
  | { version: number; role: Role; active?: never }
  | { version: number; active: boolean; role?: never };

export interface UserResponsibilityCounts {
  ownedActiveLeads: number;
  ownedActiveEstimates: number;
  initiatedActiveProjects: number;
  assignedActiveProjects: number;
  managedActiveProjects: number;
  ownedActiveTasks: number;
  directReports: number;
  linkedClientProjects: number;
  adminInitiatorGrants: number;
}

export interface ManagedUserMutationResult {
  user: UserDirectoryItem;
  revokedGrantCount: number;
  responsibilities: UserResponsibilityCounts;
}

export function getManagedUsers(
  filters: UserDirectoryFilters,
  pagination: PaginationInput
): Promise<UserDirectoryPage>;

export function updateManagedUser(
  userId: string,
  input: UpdateManagedUserInput
): Promise<ManagedUserMutationResult>;
~~~

Use existing API client/query conventions and never accept password fields.

- [ ] **Step 4: Implement the page with existing primitives**

Reuse `PageHeader`, `Surface`, `Field`, `StatusBadge`, `Button`, `Dialog`, `AsyncState`/`PageState`, feedback toasts, and existing pagination patterns. Show name, email, role label, active state, timestamps, and actions only. Keep the layout compact and responsive; do not redesign the app.

~~~tsx
export const adminUserKeys = {
  all: ["admin-users"] as const,
  page: (filters: UserDirectoryFilters, pagination: PaginationInput) =>
    ["admin-users", filters, pagination] as const
};

const [filters, setFilters] = useState<UserDirectoryFilters>({});
const [pagination, setPagination] = useState<PaginationInput>({
  limit: 20,
  offset: 0
});
const normalizedFilters = useMemo<UserDirectoryFilters>(() => ({
  ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
  ...(filters.role ? { role: filters.role } : {}),
  ...(filters.active === undefined ? {} : { active: filters.active })
}), [filters]);

const usersQuery = useQuery({
  queryKey: adminUserKeys.page(normalizedFilters, pagination),
  queryFn: () => getManagedUsers(normalizedFilters, pagination),
  placeholderData: keepPreviousData
});
~~~

Changing search/role/active resets `offset` to zero. Render all request errors through existing `PageState`; do not substitute seed data or a client-side role filter.

- [ ] **Step 5: Implement safe mutation UX**

Use `manageableRoles` returned by the server for the dropdown, never a client-maintained broader allowlist. Submit exactly one changed field plus version. Display returned responsibility counts after deactivation without implying assignments were reassigned.

~~~tsx
export interface UserMutationDialogProps {
  user: UserDirectoryItem;
  manageableRoles: readonly Role[];
  onClose(): void;
}

const mutation = useMutation({
  mutationFn: (change: UpdateManagedUserInput) =>
    updateManagedUser(user.id, change),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    announce("User access updated.");
    onClose();
  }
});

function submitRole(role: Role) {
  if (!manageableRoles.includes(role) || role === user.role) return;
  mutation.mutate({ version: user.version, role });
}

function submitActive(active: boolean) {
  if (active === user.active) return;
  mutation.mutate({ version: user.version, active });
}
~~~

Map 409 codes explicitly: `RESPONSIBILITY_REASSIGNMENT_REQUIRED`, `LAST_SUPER_ADMIN`, and `VERSION_CONFLICT` keep the dialog open; version conflict invalidates `adminUserKeys.all` and requires the user to choose again. Never call `mutation.mutate` automatically after a 409.

- [ ] **Step 6: Run focused tests and verify GREEN**

~~~bash
cd frontend
npm test -- src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx
npm test -- src/app/router.test.tsx
npm test -- src/test/accessibility.test.tsx
npm run typecheck
~~~

- [ ] **Step 7: Commit**

~~~bash
git add frontend/src/features/admin/adminApi.ts frontend/src/features/admin/UserDirectoryPage.tsx frontend/src/features/admin/UserMutationDialog.tsx frontend/src/styles/access-administration.css frontend/src/api/types.ts frontend/src/app/router.tsx frontend/src/main.tsx frontend/src/features/admin/UserDirectoryPage.test.tsx frontend/src/features/admin/UserMutationDialog.test.tsx frontend/src/test/accessibility.test.tsx
git commit -m "feat: add user administration interface"
~~~

---

### Task 16: Build My Access Requests and the review inbox

**Files:**

- Create: `frontend/src/features/access/accessRequestsApi.ts`
- Create: `frontend/src/features/access/MyAccessRequestsPage.tsx`
- Create: `frontend/src/features/access/AccessRequestDialog.tsx`
- Create: `frontend/src/features/access/AccessRequestInboxPage.tsx`
- Create: `frontend/src/features/access/AccessRequestDecisionDialog.tsx`
- Create: `frontend/src/features/access/GrantRevocationDialog.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/styles/access-administration.css`
- Test: `frontend/src/features/access/MyAccessRequestsPage.test.tsx`
- Test: `frontend/src/features/access/AccessRequestDialog.test.tsx`
- Test: `frontend/src/features/access/AccessRequestInboxPage.test.tsx`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**

- Consumes: the six access administration APIs and snapshot requestability.
- Produces: own submission/history/cancellation and Admin/Super Admin review/decision/revocation UI.
- Preserves: opaque project identity before decision and staged empty Admin inbox.

- [ ] **Step 1: Write failing own-request tests**

Use these literal MSW-backed own-request cases:

| Test name | Actor | Request and valid body | Mock response | UI/state assertion |
|---|---|---|---|---|
| `eligible roles see only their module` | each Designer, Procurement, Finance Head, Site Manager | `GET /api/v1/access-requests/mine?limit=20&offset=0` | `200 { data: { items:[], pagination } }` | route renders; module option is respectively `design`, `procurement`, `finance`, or `execution`; Create is enabled |
| `Super Admin self history is read-only` | `super_admin` | `GET /api/v1/access-requests/mine?limit=20&offset=0` | `200 { data: { items:[pendingOwnRequest], pagination } }` | direct route renders but no navigation item, module option, Create, or Cancel action appears |
| `non-request roles are denied` | each Admin, Estimator/Sales, Design Manager, Design Head, Client, Worker | direct navigation to `/access-requests/mine` | no API request | Access Denied renders and mine-endpoint request count is zero |
| `valid submission stays opaque` | `designer` | `POST /api/v1/access-requests` with `{ "projectId":"project-aurora-villa", "module":"design", "reason":"Need design access." }`; repeat with `project-550e8400-e29b-41d4-a716-446655440000`, hidden, unknown, and duplicate IDs | every response `202 { data:{ accepted:true } }` | identical live announcement; no project title, resolved flag, or existence claim is rendered; list invalidates |
| `invalid submission never calls the API` | `designer` | attempt IDs containing slash/whitespace/129 chars, empty/1001-char reason, or module `finance` | no API response | field error is associated; POST count remains zero |
| `validated prefill is accepted` | `designer` with `access_request.create` | open `/access-requests/mine?projectId=project-aurora-villa&module=design` | mine GET `200` | dialog opens with those values; invalid/module-ineligible/missing-permission query leaves it closed |
| `own list preserves opaque fields` | `designer` | mine GET | `200 { data:{ items:[{ id:"request-1", projectId:"project-hidden-valid", module:"design", reason:"Need access", status:"pending", decisionReason:null, reviewedAt:null, version:2, createdAt:"2026-08-17T10:00:00.000Z", updatedAt:"2026-08-17T10:00:00.000Z" }], pagination } }` | supplied ID/module/status/timestamps render; no title/resolution text; Cancel appears only on this pending row |
| `cancel sends version and handles success` | `designer` | `POST /api/v1/access-requests/request-1/cancel` with `{ "version":2 }` | `200 { data:{ ...pendingOwnRequest, status:"cancelled", version:3 } }` | exact body observed; list invalidates; Cancel disappears after refetch |
| `stale cancel does not replay` | `designer` | `POST /api/v1/access-requests/request-1/cancel` with `{ "version":2 }` | `409 { error:{ code:"VERSION_CONFLICT", message:"The request changed elsewhere." } }`, then `GET /api/v1/access-requests/mine?limit=20&offset=0` returns version `3` | row remains server-derived, list invalidates, stale announcement renders, POST count stays one |

- [ ] **Step 2: Write failing review tests**

Use these literal review cases:

| Test name | Actor | Request and valid body | Mock response | UI/state assertion |
|---|---|---|---|---|
| `Admin inbox empty state is scoped` | `admin` | `GET /api/v1/access-requests/review?limit=20&offset=0` | `200 { data:{ items:[], pagination } }` | copy says there are no requests for projects Admin can review; it does not claim global visibility |
| `Super Admin distinguishes resolved and unresolved IDs` | `super_admin` | `GET /api/v1/access-requests/review?limit=20&offset=0` | `200` with one row `{ project:{ id:"project-aurora-villa", resolved:true, name:"Aurora Villa" } }` and one `{ project:{ id:"project-hidden-valid", resolved:false, name:null } }` | first shows name; second shows supplied ID plus “Unresolved project” |
| `approval uses immutable row identity` | `super_admin` | `POST /api/v1/access-requests/request-1/decision` with `{ "version":2, "decision":"approved" }` | `200 { data:{ request:{ ...reviewRow, status:"approved", version:3 }, grant:activeGrant } }` | no Project ID input exists; exact request ID/version/body observed; inbox and own list invalidate; success announced |
| `rejection requires and trims reason` | `super_admin` | first submit blank reason without a request, then `POST /api/v1/access-requests/request-1/decision` with `{ "version":2, "decision":"rejected", "reason":"Not in scope" }` | valid request returns `200 { data:{ request:{ ...reviewRow, status:"rejected", decisionReason:"Not in scope", version:3 }, grant:null } }` | associated error clears on valid text; success invalidates/refetches and closes dialog; POST count is one |
| `unknown approval remains pending` | `super_admin` | `POST /api/v1/access-requests/request-unknown/decision` with `{ "version":2, "decision":"approved" }` | `409 { error:{ code:"ACCESS_REQUEST_NOT_APPROVABLE", message:"The access request could not be approved." } }`, then `GET /api/v1/access-requests/review?limit=20&offset=0` returns pending version `2` | dialog stays open, row remains pending, no optimistic status/grant appears, POST count one |
| `unknown rejection exposes only generic reason` | `super_admin` | `POST /api/v1/access-requests/request-unknown/decision` with `{ "version":2, "decision":"rejected", "reason":"Internal lookup detail" }` | `200` with rejected request whose `decisionReason` is `The access request could not be approved.` | internal reason never renders; refetched row displays only generic text |
| `revocation sends reason and version` | `super_admin` | `POST /api/v1/project-access-grants/grant-1/revoke` with `{ "version":1, "reason":"Access no longer required" }` | `200 { data:{ ...activeGrant, active:false, version:2, revocationReason:"Access no longer required" } }` | exact body observed; inbox invalidates; revoke control disappears; success announced |
| `review UI exposes no Worker assignment` | Admin and Super Admin | `GET /api/v1/access-requests/review?limit=20&offset=0` | `200` with active request/grant rows | no assign/reassign Worker control or request is present |
| `access dialogs are keyboard accessible` | eligible requester and `super_admin` reviewer | `GET /api/v1/access-requests/mine?limit=20&offset=0` and `GET /api/v1/access-requests/review?limit=20&offset=0`; open each request/decision/revocation dialog, Tab, Escape, reopen, Cancel | both GETs return `200` fixture rows; no mutation request | axe has no violations; initial focus, trap, error association, live region, Escape/Cancel, and trigger-focus restoration pass |

- [ ] **Step 3: Run and verify RED**

~~~bash
cd frontend
npm test -- src/features/access/MyAccessRequestsPage.test.tsx src/features/access/AccessRequestDialog.test.tsx src/features/access/AccessRequestInboxPage.test.tsx
~~~

- [ ] **Step 4: Implement typed API functions**

~~~typescript
export interface OwnAccessRequest {
  id: string;
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionReason: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAccessRequest extends OwnAccessRequest {
  requester: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
  };
  project: { id: string; resolved: boolean; name: string | null };
  reviewerId: string | null;
  activeGrant: { id: string; version: number; grantedAt: string } | null;
}

export interface ProjectAccessGrant {
  id: string;
  projectId: string;
  userId: string;
  module: ProjectModule;
  source: "access_request" | "direct_assignment" | "admin_initiator";
  accessRequestId: string | null;
  grantedById: string;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revocationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessRequestDecisionResult {
  request: ReviewAccessRequest;
  grant: ProjectAccessGrant | null;
}

export interface AccessRequestListFilters {
  status?: OwnAccessRequest["status"];
  module?: RequestableProjectModule;
}

export function createAccessRequest(input: {
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
}): Promise<{ accepted: true }>;

export function cancelAccessRequest(
  id: string,
  version: number
): Promise<OwnAccessRequest>;

export function decideAccessRequest(
  id: string,
  input: {
    version: number;
    decision: "approved" | "rejected";
    reason?: string;
  }
): Promise<AccessRequestDecisionResult>;

export function revokeProjectAccessGrant(
  id: string,
  input: { version: number; reason: string }
): Promise<ProjectAccessGrant>;

export function getOwnAccessRequests(
  filters: AccessRequestListFilters,
  pagination: PaginationInput
): Promise<PageData<OwnAccessRequest>>;

export function getAccessRequestsForReview(
  filters: AccessRequestListFilters,
  pagination: PaginationInput
): Promise<PageData<ReviewAccessRequest>>;
~~~

Serialize filters in the fixed order `status`, `module`, `limit`, `offset` and omit absent values so query keys and request URLs are deterministic.

- [ ] **Step 5: Implement own requests and safe context**

Build the form/list with existing fields, surfaces, buttons, statuses, dialog focus management, query invalidation, and feedback. Parse prefill context only with the frontend opaque-ID schema, current role requestability, and snapshot permission. Never create request context from a 404 or generic denied route.

~~~tsx
const accessRequestFormSchema = z.object({
  projectId: z.string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  module: z.enum(REQUESTABLE_PROJECT_MODULES),
  reason: z.string().trim().min(1).max(1000)
}).strict();

export const ownAccessRequestKeys = {
  all: ["access-requests", "mine"] as const,
  page: (filters: AccessRequestListFilters, pagination: PaginationInput) =>
    ["access-requests", "mine", filters, pagination] as const
};

const ownQuery = useQuery({
  queryKey: ownAccessRequestKeys.page(filters, pagination),
  queryFn: () => getOwnAccessRequests(filters, pagination),
  placeholderData: keepPreviousData
});

const createMutation = useMutation({
  mutationFn: createAccessRequest,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all });
    announce("Your access request was accepted for review.");
    closeDialog();
  }
});

const cancelMutation = useMutation({
  mutationFn: ({ id, version }: { id: string; version: number }) =>
    cancelAccessRequest(id, version),
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all })
});
~~~

Before calling `createMutation`, require `roleMayRequestModule(user.role, parsed.module)` and `hasFrontendPermission(authorization, "access_request.create")`. Render Cancel only when the row is pending, the snapshot has `access_request.self.cancel`, and `user.role !== "super_admin"`; an eligible role may still cancel its own historical pending request after changing between eligible roles, while Super Admin's self-history remains read-only despite its exhaustive catalog. Every accepted response uses the same announcement above; a 409 cancellation leaves the row unchanged, invalidates the list, and announces that it changed elsewhere.

- [ ] **Step 6: Implement inbox, decision, and revocation**

Show reviewer-visible identity only in the inbox. For unresolved projects show the supplied ID and “Unresolved project”; do not invent a title. Keep version in each mutation. Do not optimistically mark approved/revoked before the server succeeds.

~~~tsx
export const reviewAccessRequestKeys = {
  all: ["access-requests", "review"] as const,
  page: (filters: AccessRequestListFilters, pagination: PaginationInput) =>
    ["access-requests", "review", filters, pagination] as const
};

const reviewQuery = useQuery({
  queryKey: reviewAccessRequestKeys.page(filters, pagination),
  queryFn: () => getAccessRequestsForReview(filters, pagination),
  placeholderData: keepPreviousData
});

const decisionMutation = useMutation({
  mutationFn: ({
    id,
    input
  }: {
    id: string;
    input: Parameters<typeof decideAccessRequest>[1];
  }) => decideAccessRequest(id, input),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewAccessRequestKeys.all }),
      queryClient.invalidateQueries({ queryKey: ownAccessRequestKeys.all })
    ]);
    announce("Access request decision saved.");
    closeDecisionDialog();
  }
});

const revokeMutation = useMutation({
  mutationFn: ({
    id,
    version,
    reason
  }: {
    id: string;
    version: number;
    reason: string;
  }) => revokeProjectAccessGrant(id, { version, reason }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({
      queryKey: reviewAccessRequestKeys.all
    });
    announce("Project access revoked.");
    closeRevocationDialog();
  }
});
~~~

Decision submission sends the row's immutable `id` and `version`; the dialog has no Project ID input. Reject mode validates a trimmed 1–1000 character reason. Approval omits `reason`. On any 409, keep the dialog open, invalidate the inbox, and never replay automatically.

- [ ] **Step 7: Run focused tests and verify GREEN**

~~~bash
cd frontend
npm test -- src/features/access/MyAccessRequestsPage.test.tsx src/features/access/AccessRequestDialog.test.tsx src/features/access/AccessRequestInboxPage.test.tsx
npm test -- src/app/router.test.tsx src/components/layout/navigation.test.tsx
npm test -- src/test/accessibility.test.tsx
npm run typecheck
~~~

- [ ] **Step 8: Commit**

~~~bash
git add frontend/src/features/access/accessRequestsApi.ts frontend/src/features/access/MyAccessRequestsPage.tsx frontend/src/features/access/AccessRequestDialog.tsx frontend/src/features/access/AccessRequestInboxPage.tsx frontend/src/features/access/AccessRequestDecisionDialog.tsx frontend/src/features/access/GrantRevocationDialog.tsx frontend/src/api/types.ts frontend/src/app/router.tsx frontend/src/styles/access-administration.css frontend/src/features/access/MyAccessRequestsPage.test.tsx frontend/src/features/access/AccessRequestDialog.test.tsx frontend/src/features/access/AccessRequestInboxPage.test.tsx frontend/src/test/accessibility.test.tsx
git commit -m "feat: add project access request interface"
~~~

---

### Task 17: Run the integrated Prompt 1 security and accessibility gate

**Files:**

- No files are created or modified by this verification-only task.

**Interfaces:**

- Consumes: exact 93-route parity from Task 11, Mongo race tests from Tasks 10–11, route-family policy tests from Tasks 6–11, and accessibility tests from Tasks 14–16.
- Produces: fresh integrated evidence only.
- Preserves: the committed implementation. A failure returns execution to the owning task and does not authorize an ad hoc gate-stage fix.

- [ ] **Step 1: Run the complete integrated security gate**

~~~bash
cd backend
npm test -- tests/access-request-mongo.replica-set.test.ts tests/user-administration-mongo.replica-set.test.ts
npm test -- tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts
npm test -- tests/authorization-policy.test.ts tests/project-module-access.test.ts tests/access-requests.test.ts tests/user-administration.test.ts tests/audit-security.test.ts
npm run typecheck
npm run build
cd ../frontend
npm test -- src/test/accessibility.test.tsx src/auth/PermissionRoute.test.tsx
npm test -- src/features/admin/UserDirectoryPage.test.tsx src/features/access/MyAccessRequestsPage.test.tsx src/features/access/AccessRequestInboxPage.test.tsx
npm run typecheck
npm run build
~~~

- [ ] **Step 2: Route any failure back to its owning task**

Do not edit production or test files under Task 17. If a check fails:

  1. identify the earliest owning task and exact contract it violates;
  2. reopen that task;
  3. add a focused RED assertion in the owning test file;
  4. implement the minimal fix only in files mapped by that task;
  5. rerun that task's GREEN command;
  6. commit with `fix: enforce <specific Prompt 1 invariant>`;
  7. restart Task 17 Step 1 from the beginning.

- [ ] **Step 3: Confirm the gate leaves a clean worktree**

~~~bash
git status --short
~~~

Expected: no output. Task 17 creates no commit.

---

### Task 18: Run fresh full verification, document completion, and stop before Prompt 2

**Files:**

- Modify: `CODEX_IMPLEMENTATION_PLAN.md` only after every verification command passes
- Create: `PROMPT_1_IMPLEMENTATION_REPORT.md`

**Interfaces:**

- Consumes: all Prompt 1 acceptance criteria and fresh command output.
- Produces: exact verification evidence, remaining release blockers, implementation-state update, and completion report.
- Preserves: Prompt 2 state as `NOT STARTED`.

- [ ] **Step 1: Invoke the completion verification discipline**

Use `superpowers:verification-before-completion` before making any passing/completion claim. Run from a clean process environment with no leftover development servers or diagnostic CPU-load jobs.

- [ ] **Step 2: Run the complete backend verification**

~~~bash
cd backend
npm test
npm run typecheck
npm run build
~~~

Record exact test-file/test counts, durations, typecheck result, and build result. A skipped suite required by Prompt 1 is not a pass.

- [ ] **Step 3: Run the complete frontend verification, including hostile API base**

~~~bash
cd frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test
npm run typecheck
npm run build
~~~

Record exact counts and durations. The full frontend suite must use the hostile API base to prove mocks do not leak to an external API.

- [ ] **Step 4: Run scope and repository checks**

~~~bash
prompt1_base_commit=$(git log --format=%H --fixed-strings --grep='docs: add Prompt 1 implementation plan' -1)
test -n "$prompt1_base_commit"
git diff --check "$prompt1_base_commit"..HEAD
git diff --check
git status --short
rg -n "authorizeRoles|isRoleAuthorized|requireAccessibleProject\\([^,]+,[^,]+\\)" backend/src
rg -n "worker_assignment.override" backend/src/routes frontend/src
rg -n "admin_initiator" backend/src/routes backend/src/services
rg -n "DEMO_ACCOUNT|LisnoDemo2026" frontend/src
~~~

Expected:

  - no whitespace errors;
  - no remaining direct role middleware or no-module production project resolver;
  - no worker override route/UI;
  - `admin_initiator` is consumed for review/scope only and is never created by a Prompt 1 lifecycle route;
  - no demo credentials in frontend source.

Inspect `git diff --stat "$prompt1_base_commit"..HEAD` and `git diff --name-only "$prompt1_base_commit"..HEAD`. Confirm no Prompt 2+ model, lifecycle route, assignment endpoint, future module page, Worker task behavior, or client identity/linking change.

- [ ] **Step 5: Request final code and security review**

Use `superpowers:requesting-code-review`. The reviewer must compare:

  - all acceptance criteria in the approved design;
  - every row in the normative matrix;
  - Admin current/destination operational-role enforcement;
  - last-Super-Admin concurrency;
  - exact-ID/non-disclosing access requests;
  - module/source grant ceiling;
  - client and estimator boundaries;
  - seed pre-connection safety;
  - frontend default-deny behavior;
  - Prompt 2 exclusion.

Do not fix review findings under Task 18. For every Critical or Important finding, return to the earliest owning implementation task, add a focused RED assertion, make and commit the scoped fix, rerun that task's GREEN commands, rerun Task 17 from the beginning, and then restart Task 18's full commands.

- [ ] **Step 6: Write the implementation report**

`PROMPT_1_IMPLEMENTATION_REPORT.md` must use the required implementation-status format:

~~~text
IMPLEMENTATION STATUS

Completed:
- List each verified Prompt 1 acceptance slice and its final status.

Files Changed:
- Group the actual changed paths by backend, frontend, tests, and documentation.

Database Changes:
- Record the additive collections, indexes, and User version compatibility behavior.

API Changes:
- Record the authorization, user-administration, and access-request routes and response contracts.

Frontend Changes:
- Record snapshot loading, permission routing, neutral homes, directory, and request screens.

Tests Added:
- List every new test file and the security/concurrency behavior it covers.

Tests Executed:
- Record the exact commands from Steps 2–4.

Tests Passed:
- Record exact file/test counts and zero-failure evidence from the fresh runs.

Tests Failed:
- State zero only when every required command is green; otherwise do not mark Prompt 1 complete.

Known Issues:
- Record deferred provisioning and client-email claim blockers plus staged/dormant capabilities.

Next Recommended Step:
- Obtain separate authorization and design approval for Prompt 2.
~~~

Include:

  - additive AccessRequest and ProjectAccessGrant collections/indexes;
  - legacy User version compatibility;
  - no production backfill;
  - no production privileged-account bootstrap;
  - client-email claim risk still blocks public production;
  - Admin inbox staged until Prompt 2 creates `admin_initiator`;
  - Procurement/Finance/Execution grants dormant;
  - Estimator access only through future Prompt 2 assignment.

End the report with:

~~~text
RBAC FOUNDATION COMPLETE
~~~

- [ ] **Step 7: Update implementation state only after green evidence**

In `CODEX_IMPLEMENTATION_PLAN.md`:

  - change Prompt 1 to `COMPLETE` followed by the actual completion date from the system clock;
  - keep Prompt 2 and all later prompts `NOT STARTED`;
  - link the design, route matrix, implementation plan, and report;
  - insert exact fresh verification evidence;
  - retain `Public-production readiness: NO` and both production blockers;
  - state `Ready for Prompt 2: YES` only if review and every required check passed.

- [ ] **Step 8: Commit documentation**

~~~bash
git add CODEX_IMPLEMENTATION_PLAN.md PROMPT_1_IMPLEMENTATION_REPORT.md
git diff --cached --check
git commit -m "docs: complete Prompt 1 RBAC foundation"
~~~

- [ ] **Step 9: Stop**

Do not implement Prompt 2. Report Prompt 1 status, fresh evidence, known blockers, and whether the repository is ready for Prompt 2.

---

## Complete Literal Operation Manifest

This is the task-local execution manifest for both the independent test fixture and the production registry. Transcribe it twice: the test fixture must not import the production registry. Each route-family task registers exactly the keys in its stated row range. The normative companion remains authoritative for the preserved relationship prose, while every method/path, permission, scope, class, Super Admin behavior, and availability value needed by code is literal here.

~~~typescript
export const PROMPT_1_OPERATION_MANIFEST = [
  { key: "GET /auth/me", permission: "identity.self.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "self", availability: "baseline" },
  { key: "GET /projects", permission: "projects.list", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/project-summaries", permission: "projects.client_summary.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /projects", permission: "projects.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /projects/:projectId", permission: "projects.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /projects/:projectId/floors", permission: "projects.floor.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /floors/:floorId/stages", permission: "projects.stage.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /stages/:stageId/tasks", permission: "projects.task.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /tasks/:taskId/events", permission: "design.task_events.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PATCH /tasks/:taskId", permission: "design.task.self.update", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PATCH /tasks/:taskId/deadline", permission: "design.task_deadline.update", scope: { kind: "project", module: "design" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /organization/managers", permission: "organization.managers.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /organization/team", permission: "organization.team.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /organization/tree", permission: "organization.tree.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /organization/managers/:managerId/designers", permission: "organization.manager_designers.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /designers/:designerId/summary", permission: "organization.designer_summary.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /kpis/users/:userId/tasks", permission: "organization.user_tasks.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /kpis/users/:userId", permission: "organization.user_kpi.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /evaluations", permission: "organization.evaluation.create", scope: { kind: "non_project", namespace: "organization" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /evaluations/:subjectId", permission: "organization.evaluation.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /projects/:projectId/activity", permission: "audit.project_activity.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /designers/:designerId/audit", permission: "audit.designer.read", scope: { kind: "non_project", namespace: "audit" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /audit", permission: "audit.read", scope: { kind: "non_project", namespace: "audit" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/latest-approved-versions", permission: "design.client_latest_approved.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /tasks/:taskId/design-versions", permission: "design.version.upload", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /projects/:projectId/design-versions", permission: "design.version.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /design-versions/:versionId/extraction", permission: "design.version_extraction.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PATCH /design-versions/:versionId/approval", permission: "design.version.approve", scope: { kind: "project", module: "design" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /design-versions/:versionId/download", permission: "design.version.download", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /design-versions/:versionId/sections", permission: "design.section_draft.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /design-versions/:versionId/sections", permission: "design.section.create", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PATCH /design-sections/:sectionId", permission: "design.section.update", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "DELETE /design-sections/:sectionId", permission: "design.section.delete", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /design-versions/:versionId/retry-extraction", permission: "design.section_extraction.retry", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /design-versions/:versionId/submit-sections", permission: "design.section.submit", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /client/projects/:projectId/design-sections", permission: "design.client_sections.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /design-section-revisions/:revisionId/decision", permission: "design.client_section_decision", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /design-source-pages/:pageId/image", permission: "design.source_page_image.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /design-section-revisions/:revisionId/image", permission: "design.section_revision_image.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimates/:estimateId/design-uploads", permission: "estimation.design_upload.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimates/:estimateId/design-uploads", permission: "estimation.design_upload.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimate-design-uploads/:uploadId/retry", permission: "estimation.design_upload.retry", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimate-design-source-pages/:pageId/image", permission: "estimation.source_page_image.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimate-design-source-pages/:pageId/drawings", permission: "estimation.drawing.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimate-design-revisions/:revisionId/image", permission: "estimation.design_revision_image.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimates/:estimateId/design-drawings", permission: "estimation.client_drawings.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /client/estimate-design-revisions/:revisionId/annotation-draft", permission: "estimation.client_annotation_draft.save", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /client/estimate-design-revisions/:revisionId/decision", permission: "estimation.client_drawing_decision", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PATCH /estimate-design-drawings/:drawingId", permission: "estimation.drawing.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PUT /estimate-design-drawings/:drawingId/estimate-item", permission: "estimation.drawing.estimate_item.assign", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "DELETE /estimate-design-drawings/:drawingId", permission: "estimation.drawing.delete", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /estimate-design-drawings/:drawingId/replacement", permission: "estimation.drawing.replace", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /estimates/:estimateId/design-drawings/submit", permission: "estimation.drawing.submit", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /client/estimates/:estimateId/plan-review", permission: "estimation.client_plan_review.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimate-plan-pages/:pageId/thumbnail", permission: "estimation.client_plan_review.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimate-plan-pages/:pageId/current-image", permission: "estimation.client_plan_review.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /client/estimate-plan-pages/:pageId/annotation-draft", permission: "estimation.client_plan_annotation_draft.save", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /client/estimate-plan-pages/:pageId/target-preview", permission: "estimation.client_plan_target_preview", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /client/estimate-plan-pages/:pageId/change-requests", permission: "estimation.client_plan_change_request.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PUT /client/estimate-plan-change-requests/:requestId", permission: "estimation.client_plan_change_request.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimate-plan-change-requests", permission: "estimation.plan_change_request.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimate-plan-change-requests/:requestId", permission: "estimation.plan_change_request.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /estimate-plan-change-requests/:requestId/targets", permission: "estimation.plan_change_request.targets.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "POST /estimate-plan-change-requests/:requestId/resolve-page", permission: "estimation.plan_change_request.resolve_page", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /estimate-plan-pages/:pageId/current-image", permission: "estimation.plan_page_image.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /leads", permission: "estimation.lead.list", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /leads", permission: "estimation.lead.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /leads/:leadId", permission: "estimation.lead.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PATCH /leads/:leadId", permission: "estimation.lead.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /leads/:leadId/activities", permission: "estimation.lead_activity.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /leads/:leadId/activities", permission: "estimation.lead_activity.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /leads/:leadId/estimate", permission: "estimation.estimate.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimates", permission: "estimation.estimate.list", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /leads/:leadId/estimate", permission: "estimation.estimate.save", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /leads/:leadId/estimate/submit", permission: "estimation.estimate.submit", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimates/:estimateId/pdf", permission: "estimation.estimate_pdf.download", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimates/review-queue", permission: "estimation.review_queue.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimates/designers", permission: "estimation.assignable_designers.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimates/:estimateId/assign", permission: "estimation.designer_assignment.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "POST /estimates/:estimateId/designer-decision", permission: "estimation.designer_assignment.decision", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /estimates/:estimateId/send-client", permission: "estimation.estimate.send_client", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /client/estimates", permission: "estimation.client_estimate.list", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimates/:estimateId/pdf", permission: "estimation.client_estimate_pdf.download", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /client/estimates/:estimateId/decision", permission: "estimation.client_estimate.decision", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /auth/authorization", permission: "identity.authorization.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "self", availability: "prompt_1" },
  { key: "GET /admin/users", permission: "identity.users.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_1" },
  { key: "PATCH /admin/users/:userId", permission: "identity.users.update", scope: { kind: "non_project", namespace: "identity" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "prompt_1" },
  { key: "POST /access-requests", permission: "access_request.create", scope: { kind: "non_project", namespace: "access_administration" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_1" },
  { key: "GET /access-requests/mine", permission: "access_request.self.read", scope: { kind: "non_project", namespace: "access_administration" }, operationClass: "read", superAdminBehavior: "self", availability: "prompt_1" },
  { key: "POST /access-requests/:requestId/cancel", permission: "access_request.self.cancel", scope: { kind: "non_project", namespace: "access_administration" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_1" },
  { key: "GET /access-requests/review", permission: "access_request.review.read", scope: { kind: "non_project", namespace: "access_administration", projectReviewScope: true }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_1" },
  { key: "POST /access-requests/:requestId/decision", permission: "access_request.review.decide", scope: { kind: "non_project", namespace: "access_administration", projectReviewScope: true }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "prompt_1" },
  { key: "POST /project-access-grants/:grantId/revoke", permission: "project_access_grant.revoke", scope: { kind: "non_project", namespace: "access_administration", projectReviewScope: true }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "prompt_1" },
] as const;
~~~

The implementation test must assert that this manifest has 93 unique keys and 90 unique routed permissions. The route-less `execution.worker_assignment.override` permission is added to `PERMISSION_CODES` separately and must not appear above.

### Exact Role-to-Operation Allowlist

Build each non-Super-Admin `ROLE_PERMISSIONS` array from the unique permissions on these exact one-based manifest rows. Row 1 (`identity.self.read`) and row 85 (`identity.authorization.read`) are the common identity base for every role.

| Role | Additional manifest rows beyond 1 and 85 |
|---|---|
| `super_admin` | Every row 1–93, deduplicated by permission, plus route-less `execution.worker_assignment.override` |
| `admin` | 2, 5, 86, 87, 91–93 |
| `estimator_sales` | 2, 5, 40–45, 49–53, 61–76, 81 |
| `designer` | 2, 4–10, 12, 16–18, 20, 22–23, 25–27, 29–35, 38–39, 61–65, 77, 80, 88–90 |
| `design_manager` | 2, 5, 9, 11, 13, 16–23, 26–29, 38–39, 61–65, 77–79 |
| `design_head` | 2, 5, 9, 11, 14–23, 26–29, 38–39, 61–65 |
| `client` | 2, 3, 5, 24, 26–27, 29, 36–39, 45–48, 54–60, 82–84 |
| `procurement` | 88–90 |
| `finance_head` | 88–90 |
| `site_manager` | 88–90 |
| Every Worker trade | none |

Rows 2 and 5 for Admin and Estimator/Sales preserve the existing project-list/detail contract while module scope still denies ungranted records: Estimator/Sales receives an empty list/404, and Admin receives an empty list/404 until an exact `admin_initiator/projects` fixture or Prompt 2 relationship exists. No future-module role receives a Procurement, Finance, Execution, or generic Projects action merely from an approved dormant grant.

Implement an independent test helper in `authorization-policy.test.ts` that expands this row allowlist through the test manifest, deduplicates permissions in manifest order, and compares the result with every production `ROLE_PERMISSIONS[role]` array. The production mapping must contain literal permission arrays and must not import the test helper.

## Dependency and Commit Sequence

| Order | Task | Required predecessor | Commit intent |
|---:|---|---|---|
| 1 | Canonical roles | Approved design | `refactor: centralize canonical role catalog` |
| 2 | Permission/operation catalogs | Task 1 | `feat: define exhaustive authorization policy` |
| 3 | Authorization snapshot | Task 2 | `feat: expose authorization snapshot` |
| 4 | Request/grant persistence | Task 2 | `feat: persist project access requests and grants` |
| 5 | Module-aware scope | Task 4 | `feat: make project authorization module aware` |
| 6 | Core route families | Tasks 2, 5 | three scoped commits: Projects/Tasks, Organization/KPI/Evaluation, Audit |
| 7 | Design route family | Tasks 2, 5 | two scoped commits: Design Version, Design Section |
| 8 | Lead/estimate split | Current green baseline | `refactor: separate lead and estimate routes` |
| 9 | Estimation route family | Tasks 2, 8 | four scoped commits: Estimate Design, Plan Review, Leads, Estimates |
| 10 | Access workflow | Tasks 4, 5, 9 | `feat: add project access request workflow` |
| 11 | User administration | Tasks 4, 10 | `feat: add safe user administration` |
| 12 | Seed safety/accounts | Tasks 1, 4, 11 | `chore: gate demo seed and add role accounts` |
| 13 | Frontend snapshot | Tasks 2, 3, 12 | `feat: load frontend authorization snapshots` |
| 14 | Frontend routes/navigation | Task 13 | `feat: add permission-aware frontend routing` |
| 15 | User administration UI | Tasks 11, 14 | `feat: add user administration interface` |
| 16 | Access request UI | Tasks 10, 14, 15 | `feat: add project access request interface` |
| 17 | Integrated security/a11y verification | Tasks 1–16 | verification only; no commit |
| 18 | Verification and state | Task 17 | `docs: complete Prompt 1 RBAC foundation` |

Tasks 6 and 8 may be developed in parallel only if they use separate worktrees and Task 8 is merged before Task 9. Tasks 15 and 16 are sequential because they share API types, router wiring, styles, and accessibility coverage. All shared repository-interface changes must land in the stated order.

## Prompt 1 Completion Boundary

Completion means the exact 93-route registry is enforced, every approved role and grant rule is tested, all backend/frontend checks are freshly green, the completion report ends with `RBAC FOUNDATION COMPLETE`, and `CODEX_IMPLEMENTATION_PLAN.md` says Prompt 1 complete. Completion does not authorize Prompt 2.

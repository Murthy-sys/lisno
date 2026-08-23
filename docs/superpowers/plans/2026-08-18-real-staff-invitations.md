# Real Staff Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the sole active Super Admin invite an allowed staff/trade role with required Name, Email, Role, and Mobile through a secure 24-hour, single-use email link so the invitee creates a real remotely usable account.

**Architecture:** `UserInvitation` is an append-preserving identity-provisioning aggregate separate from `User`; no User exists before acceptance. Protected mutations reload the sole Super Admin under the authorization lock and serialize normalized-email state and the recipient cooldown through `EmailCoordination`. Tokens are 32 random bytes and only their SHA-256 digest persists; acceptance atomically creates one standard User and consumes the invitation. SMTP runs after commit, while missing delivery configuration disables create/resend before mutation. The frontend adds six-status invitation controls to `/admin/users` and a public fragment-scrubbing acceptance route outside the protected registry.

**Tech Stack:** TypeScript 5.8, Express 5, Mongoose 9 transactions/aggregation, Zod, bcryptjs, Node crypto, Nodemailer, React 19, React Router 7, TanStack Query 5, Vitest 3, MSW, Testing Library, axe.

**Spec:** [Local Demo Accounts and Staff Invitations Design](../specs/2026-08-18-local-demo-accounts-and-staff-invitations-design.md).

**Revised:** 2026-08-23 after written-spec approval.

**Precondition:** [Local Demo Accounts and Remote Authentication Safety](./2026-08-18-local-demo-accounts.md) is implemented, reviewed, committed, and green. This plan consumes its exact `UserRecord.accountKind`, `isReservedDemoEmail`, `isReservedDevelopmentDemoIdentity`, and local/external mail safety boundary.

## Global Constraints

- Do not create an inactive User when an invitation is sent. A User exists only after successful acceptance.
- Do not invite `client` or `super_admin`; the exact `InvitableRole` union is `Exclude<Role, "client" | "super_admin">`. Client signup remains its existing public transaction.
- Name, normalized email, canonical role, and normalized mobile are mandatory. Invitation and acceptance contracts contain no title field; accepted Users have no title value.
- Only the current sole active stored `super_admin` may list/create/resend/revoke. Admin receives no permission, data, UI, or service entry.
- Application paths cannot invite/promote a second Super Admin or mutate the sole Super Admin. A partial unique User index is the persistence backstop.
- `GET /admin/users` returns all-role `filterRoles` separately from `manageableRoles`, which excludes `super_admin`; the sole Super Admin row has no mutation action.
- Display `finance_head` as **Finance Manager** everywhere while retaining the internal code. The requested Executive Manager remains `site_manager` / **Site Manager**.
- The four invitation permission codes belong only to Super Admin. Update backend/frontend catalogs atomically to policy `2026-08-23.staff-invitations.v1`; the current 93 permissions become 97 and the current 97 protected operations become 101.
- Keep the frontend permission/presentation route registry at exactly 20 entries. `/accept-invitation` is a public route outside it; invitation controls live on existing `/admin/users`.
- Lock order is always `coordinateAuthorizationMutation()` then `coordinateClientEmail(emailNormalized)`. An outside-transaction ID/hash read may discover email/identity only; every authoritative read and write happens after both required locks.
- Client signup must not query invitations. The first User wins. Invitation create/resend/accept also rejects matching unclaimed Client projects so a staff User cannot orphan the existing Client claim path.
- A new invite supersedes the prior pending row; resend rotates the same row. No partial unique pending-email index is used.
- Presentation status is exactly Pending, Delivery Failed, Expired, Revoked, Superseded, or Accepted. Internal issuer invalidation remains Pending with `currentLinkAvailable: false`.
- Server-derived `availableActions` is advisory: normal stored-pending rows expose resend/revoke, email-claimed or Client-project-reserved rows expose revoke only, and terminal rows expose none. Mutations recheck under lock.
- Raw token/password/link/provider payload never enters Mongo, audit values, logs, errors, Admin DTOs, URLs outside the fragment, browser storage, router state, React Query, or DOM.
- SMTP happens only after the invitation transaction commits. SMTP failure does not roll back the invitation; stale generation callbacks cannot mutate a newer/terminal record.
- Entirely absent production delivery configuration yields a disabled mail boundary and `503 INVITATION_DELIVERY_UNAVAILABLE` before token generation or mutation. Partial/invalid configuration fails startup.
- A `development_demo` or exact reserved actor may never call an external mail adapter. Local/test mail is injected and does not log raw links.
- Acceptance returns no JWT and never alters an existing browser session. The new user signs in normally afterward.
- Public inspect/accept set `Cache-Control: no-store` for every success and failure response.
- The explicit destructive seed clears UserInvitation and EmailCoordination state plus invitation audits; automatic demo bootstrap remains Users-only and non-destructive.
- Existing Admin project initiation, Estimator assignment, grants, worker actions, and project/assignment workflows remain unchanged. Production provisioning of the sole Super Admin remains operator-controlled.
- TDD every change. Capture focused RED, implement minimum GREEN, run focused tests/typecheck, self-review, and commit exact task scope.
- Do not stage unrelated work. Run `git status --short` and `git diff --cached --check` before each commit.

---

## Parallel Execution Map

All agents work on `feature/phase1_module1` in the shared checkout. A task owner may edit only its listed files until the integration checkpoint; the primary agent stages and commits after review so concurrent agents never race Git state.

Before Wave 1 editing, the primary agent alone performs Task 4's dependency install and announces that the lockfile/node_modules mutation is complete. During a wave, owners announce RED-ready and edit-complete barriers; targeted Vitest files may run only when their dependency files are syntactically complete, and the primary runs each wave's typechecks/GREEN gates only after every owner is edit-complete. Agents never run `npm install`, typecheck, build, Git staging, or commits concurrently in the shared checkout.

- **Wave 1 — parallel:** Task 1 (sole-Super-Admin/user-directory/labels), Task 2 (invitation domain/model/seed/audit), Task 4 (mailer/config/limiters).
- **Wave 2 — parallel after Wave 1 is integrated:** Task 3 (repositories) after Task 2; Task 9 (frontend transport contracts) after Task 1; primary agent resolves interface drift before either owner edits a previously touched file.
- **Wave 3 — parallel:** Tasks 5–6 (backend services, sequential because they share one service file) run beside Task 10 (Admin invitation UI) and Task 11 (public acceptance UI).
- **Wave 4 — parallel after service/UI green:** Task 7 (routes/policy/server wiring), Task 8 (real Mongo races), and Task 12 (frontend accessibility/regression), with fixes routed back to the owning task.
- **Wave 5:** Task 13 documentation, static security checks, full suites/builds, independent reviews, and final cleanup.

The three-hour target is pursued through these waves, focused RED/GREEN commands, and file ownership. Correctness gates are not skipped if a dependency or full suite runs longer.

## Requirement Coverage

| Approved requirement | Owning tasks |
|---|---|
| Exactly one immutable Super Admin; no invite/promotion bypass; user-directory visibility remains intact | 1, 7, 8 |
| Required Name/Email/Role/Mobile, no title, Client/Super Admin excluded, canonical Finance Manager/Site Manager labels | 1, 2, 5, 7, 9, 10 |
| Separate invitation state, 24-hour digest-only tokens, supersede/resend/revoke, six presentation statuses | 2, 3, 5, 8 |
| Transactional acceptance creates one standard User and preserves Client/project ownership races | 3, 6, 8 |
| Disabled/partial/full SMTP configuration, bounded post-commit delivery, stale-callback safety | 4, 5, 7, 8 |
| Exact protected/public APIs, Super-Admin-only authorization, rate limits, no-store responses | 4, 7 |
| Redacted Admin UI and fragment-scrubbing public acceptance with no automatic login | 9, 10, 11, 12 |
| Explicit reset only, audit/log secrecy, unchanged existing project workflows, deployment documentation | 2, 8, 13 |

---

## File Map

### Backend production

- Create `backend/src/domain/user-invitations.ts`.
- Create `backend/src/models/UserInvitation.ts`.
- Modify `backend/src/domain/roles.ts` and `backend/src/models/User.ts`.
- Modify `backend/src/services/user-administration.service.ts` and `backend/src/routes/admin-users.ts`.
- Create `backend/src/services/invitation-mailer.ts`.
- Create `backend/src/services/smtp-invitation-mailer.ts`.
- Create `backend/src/types/nodemailer-smtp-connection.d.ts`: narrow declarations for Nodemailer's bundled, version-synchronized low-level connection handle.
- Create `backend/src/services/user-invitation.service.ts`.
- Create `backend/src/middleware/invitation-rate-limit.ts`.
- Create `backend/src/routes/user-invitations.ts`.
- Modify `backend/src/repositories/types.ts`, `memory.ts`, and `mongo.ts`.
- Modify `backend/src/domain/authorization.ts`, `route-operations.ts`, and `audit-actions.ts`.
- Modify `backend/src/services/auth.service.ts` policy version only; preserve login/signup payloads.
- Modify `backend/src/config/env.ts`, `server.ts`, `app.ts`, `seed/data.ts`, and `seed/run.ts`; the seed model set adds `UserInvitation` and existing `EmailCoordination`.
- Modify `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`, `backend/README.md`, and root `README.md`.

### Backend tests

- Create `backend/tests/user-invitation-models.test.ts`.
- Create `backend/tests/user-invitation-repository.test.ts`.
- Create `backend/tests/user-invitation-mailer.test.ts`.
- Create `backend/tests/invitation-rate-limit.test.ts`.
- Create `backend/tests/errors.test.ts`.
- Create `backend/tests/helpers/trickling-smtp-server.ts`.
- Create `backend/tests/user-invitations.test.ts`.
- Create `backend/tests/user-invitations-mongo.replica-set.test.ts`.
- Modify `backend/tests/user-administration.test.ts`, `user-administration-mongo.replica-set.test.ts`, `mongo-repository.test.ts`, `audit-security.test.ts`, `config.test.ts`, `server.test.ts`, `authorization-policy.test.ts`, `route-operation-registry.test.ts`, `auth-authorization.test.ts`, and `frontend-authorization-contract.test.ts`; create `backend/tests/fixtures/staff-invitation-route-operations.ts` composed after the existing Prompt 2 fixture.

### Frontend production

- Create `frontend/src/features/admin/userInvitationsApi.ts`.
- Create `frontend/src/features/admin/UserInvitationsPanel.tsx`.
- Create `frontend/src/features/admin/InviteUserDialog.tsx`.
- Create `frontend/src/features/admin/InvitationActionDialog.tsx`.
- Create `frontend/src/auth/userInvitationsApi.ts`.
- Create `frontend/src/auth/InvitationAcceptancePage.tsx`.
- Create `frontend/src/styles/invitations.css`.
- Modify `frontend/src/api/authorization-contract.ts`, `api/types.ts`, and `api/client.ts`.
- Modify `frontend/src/features/admin/UserDirectoryPage.tsx`, `UserMutationDialog.tsx`, and `styles/access-administration.css`.
- Modify `frontend/src/app/router.tsx`, `main.tsx`, and `frontend/index.html`.

### Frontend tests

- Create `frontend/src/features/admin/userInvitationsApi.test.ts`.
- Create `frontend/src/features/admin/UserInvitationsPanel.test.tsx`.
- Create `frontend/src/features/admin/UserInvitationDialogs.test.tsx`.
- Create `frontend/src/auth/InvitationAcceptancePage.test.tsx`.
- Modify `frontend/src/api/authorization-contract.test.ts`, `api/client.test.ts`, `test/authFixtures.ts`, `features/admin/UserDirectoryPage.test.tsx`, `features/admin/UserMutationDialog.test.tsx`, `app/router.test.tsx`, and `test/accessibility.test.tsx`.

---

## Stable Backend Contracts

The exact new permission codes are inserted after `identity.users.update` and before `access_request.create` in both canonical catalogs; `execution.worker_assignment.override` remains the final permission:

~~~typescript
"identity.user_invitations.read",
"identity.user_invitations.create",
"identity.user_invitations.resend",
"identity.user_invitations.revoke",
~~~

Only `ROLE_PERMISSIONS.super_admin` and the Super Admin test fixture receive all four. No other role receives any of them. Endpoint/action mapping is exact:

| Permission | Protected API/UI action |
|---|---|
| `identity.user_invitations.read` | `GET /admin/user-invitations`; render/query the panel |
| `identity.user_invitations.create` | `POST /admin/user-invitations`; show/submit Invite user |
| `identity.user_invitations.resend` | `POST /admin/user-invitations/:invitationId/resend`; show/submit Resend |
| `identity.user_invitations.revoke` | `POST /admin/user-invitations/:invitationId/revoke`; show/submit Revoke |

~~~typescript
export type InvitableRole = Exclude<Role, "client" | "super_admin">;
export type UserInvitationStoredStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationTokenValidity = "current" | "expired" | "invalidated" | "unavailable";
export type UserInvitationPresentationStatus =
  | "pending"
  | "delivery_failed"
  | "expired"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationDeliveryStatus = "queued" | "sent" | "failed";
export type UserInvitationAction = "resend" | "revoke";

export const USER_INVITATION_TTL_MS = 24 * 60 * 60 * 1_000;
export const USER_INVITATION_RECIPIENT_COOLDOWN_MS = 60_000;
export const USER_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const USER_INVITATION_NAME_MAX = 120;
export const USER_INVITATION_EMAIL_MAX = 254;
export const USER_INVITATION_MOBILE_MAX = 30;
export const USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

export function normalizeInvitationMobile(value: string): string;
export function tokenValidityForInvitation(input: {
  storedStatus: UserInvitationStoredStatus;
  expiresAt: string;
  issuerMatches: boolean;
  now: string;
}): UserInvitationTokenValidity;
export function presentationStatusForInvitation(input: {
  storedStatus: UserInvitationStoredStatus;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  now: string;
}): UserInvitationPresentationStatus;

export interface UserInvitationRecord {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  role: InvitableRole;
  mobile: string;
  tokenHash: string | null;
  tokenGeneration: number;
  issuedAt: string;
  expiresAt: string;
  status: UserInvitationStoredStatus;
  invitedById: string;
  tokenIssuedById: string;
  tokenIssuerVersion: number;
  acceptedUserId: string | null;
  acceptedAt: string | null;
  revokedById: string | null;
  revokedAt: string | null;
  supersededByInvitationId: string | null;
  supersededAt: string | null;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  deliveryFailureCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationFilters {
  search?: string;
  role?: InvitableRole;
  status?: UserInvitationPresentationStatus;
  deliveryStatus?: UserInvitationDeliveryStatus;
}

export interface UserInvitationAdminRecord {
  id: string;
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
  tokenValidity: UserInvitationTokenValidity;
  presentationStatus: UserInvitationPresentationStatus;
  currentLinkAvailable: boolean;
  availableActions: readonly UserInvitationAction[];
  invitedBy: Pick<UserRecord, "id" | "name" | "email" | "role">;
  issuedAt: string;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type NewUserInvitation = UserInvitationRecord;
export interface SupersedeUserInvitationChange {
  supersededByInvitationId: string;
  supersededAt: string;
  updatedAt: string;
}
export interface ResendUserInvitationChange {
  tokenHash: string;
  tokenGeneration: number;
  issuedAt: string;
  expiresAt: string;
  tokenIssuedById: string;
  tokenIssuerVersion: number;
  updatedAt: string;
}
export interface RevokeUserInvitationChange {
  revokedById: string;
  revokedAt: string;
  updatedAt: string;
}
export interface AcceptUserInvitationChange {
  acceptedUserId: string;
  acceptedAt: string;
  updatedAt: string;
}
export type InvitationDeliveryChange =
  | { status: "sent"; attemptedAt: string; sentAt: string; updatedAt: string }
  | { status: "failed"; attemptedAt: string; failureCode: string; updatedAt: string };
~~~

The Mongoose `tokenHash` field is `select: false`. Repository/admin/public DTOs never reuse records through object spread.

Exact redacted service shapes:

~~~typescript
export interface UserInvitationDto {
  id: string;
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
  status: UserInvitationPresentationStatus;
  currentLinkAvailable: boolean;
  availableActions: readonly UserInvitationAction[];
  invitedBy: Pick<PublicUser, "id" | "name" | "email" | "role">;
  issuedAt: string;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationPage {
  items: UserInvitationDto[];
  total: number;
  invitableRoles: readonly InvitableRole[];
}

export interface CreateUserInvitationInput {
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
}

export interface UserInvitationInspection {
  name: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
}
~~~

Exact service interface:

~~~typescript
export interface UserInvitationService {
  list(actor: PublicUser, filters: UserInvitationFilters, pagination: PaginationInput): Promise<UserInvitationPage>;
  create(actor: PublicUser, input: CreateUserInvitationInput): Promise<UserInvitationDto>;
  resend(actor: PublicUser, invitationId: string, input: { version: number }): Promise<UserInvitationDto>;
  revoke(actor: PublicUser, invitationId: string, input: { version: number }): Promise<UserInvitationDto>;
  inspect(rawToken: string): Promise<UserInvitationInspection>;
  accept(input: { rawToken: string; password: string }): Promise<{ accepted: true }>;
}
~~~

Exact mail boundary:

~~~typescript
export type InvitationMailer =
  | { readonly deliveryKind: "disabled" }
  | {
      readonly deliveryKind: "external" | "local_test";
      sendInvitation(input: {
        recipient: { name: string; email: string };
        roleLabel: string;
        rawToken: string;
        expiresAt: string;
      }): Promise<void>;
    };

export interface InvitationRateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
  maxEntries?: number;
  clock?: () => number;
}

export function createInvitationPublicRateLimit(
  options?: InvitationRateLimitOptions
): RequestHandler;
export function createInvitationDeliveryRateLimit(
  options?: InvitationRateLimitOptions
): RequestHandler;

export interface CreateUserInvitationServiceInput {
  repository: AppRepository;
  audit: AuditService;
  mailer: InvitationMailer;
  clock: Clock;
  randomBytes?: (size: number) => Buffer;
  passwordHasher?: (password: string, cost: number) => Promise<string>;
}

export function createUserInvitationService(
  input: CreateUserInvitationServiceInput
): UserInvitationService;

export function createUserInvitationsRouter(
  auth: AuthService,
  invitations: UserInvitationService,
  deliveryRateLimit: RequestHandler
): Router;

// Exact additions to existing integration contracts:
export interface AppDependencies {
  invitationMailer?: InvitationMailer;
  invitationPublicRateLimit?: InvitationRateLimitOptions;
  invitationDeliveryRateLimit?: InvitationRateLimitOptions;
}

export type InvitationDeliveryConfig =
  | { kind: "disabled" }
  | {
      kind: "smtp";
      publicFrontendUrl: string;
      host: string;
      port: number;
      tlsMode: "implicit" | "starttls";
      username: string;
      password: string;
      from: string;
    };

export function createSmtpInvitationMailer(
  config: Extract<InvitationDeliveryConfig, { kind: "smtp" }>
): Extract<InvitationMailer, { deliveryKind: "external" }>;

export interface LoadedEnvironment {
  invitationDelivery: InvitationDeliveryConfig;
}

export interface ApiErrorHeaders {
  readonly "Retry-After"?: string;
}

// Existing ApiError fields remain the fourth argument; headers is fifth.
export declare class ApiError extends Error {
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    headers?: ApiErrorHeaders
  );
}
~~~

## Stable Frontend Transport Contracts

The backend service returns `total`; the protected route converts it with `paginatedEnvelope`. The frontend receives the HTTP shape below, never the internal service page:

~~~typescript
export type InvitableRole = Exclude<Role, "client" | "super_admin">;
export type UserInvitationPresentationStatus =
  | "pending"
  | "delivery_failed"
  | "expired"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationDeliveryStatus = "queued" | "sent" | "failed";
export type UserInvitationAction = "resend" | "revoke";

export interface UserInvitationFilters {
  search?: string;
  role?: InvitableRole;
  status?: UserInvitationPresentationStatus;
  deliveryStatus?: UserInvitationDeliveryStatus;
}

export interface CreateUserInvitationInput {
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
}

export interface UserInvitationInspection {
  name: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
}

export interface UserDirectoryPage extends PageData<UserDirectoryItem> {
  filterRoles: Role[];
  manageableRoles: Exclude<Role, "super_admin">[];
}

export interface UserInvitationItem {
  id: string;
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
  status: UserInvitationPresentationStatus;
  currentLinkAvailable: boolean;
  availableActions: UserInvitationAction[];
  invitedBy: Pick<PublicUser, "id" | "name" | "email" | "role">;
  issuedAt: string;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationPage extends PageData<UserInvitationItem> {
  invitableRoles: InvitableRole[];
}

export interface InvitationVersionInput {
  version: number;
}

export interface AcceptUserInvitationInput {
  token: string;
  password: string;
  passwordConfirmation: string;
}

export interface AcceptUserInvitationResult {
  accepted: true;
}

export const userInvitationKeys = {
  all: ["user-invitations"] as const,
  page: (filters: UserInvitationFilters, pagination: PaginationInput) =>
    ["user-invitations", filters, pagination] as const
};

export function userInvitationsPath(
  filters: UserInvitationFilters,
  pagination: PaginationInput
): string;
export function getUserInvitations(
  filters: UserInvitationFilters,
  pagination: PaginationInput
): Promise<UserInvitationPage>;
export function createUserInvitation(
  input: CreateUserInvitationInput
): Promise<UserInvitationItem>;
export function resendUserInvitation(
  invitationId: string,
  input: InvitationVersionInput
): Promise<UserInvitationItem>;
export function revokeUserInvitation(
  invitationId: string,
  input: InvitationVersionInput
): Promise<UserInvitationItem>;
export function inspectUserInvitation(
  token: string
): Promise<UserInvitationInspection>;
export function acceptUserInvitation(
  input: AcceptUserInvitationInput
): Promise<AcceptUserInvitationResult>;

// New method on apiClient:
postPublic<T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestInit, "body" | "method">
): Promise<T>;
~~~

The path builder serializes only `search`, `role`, `status`, `deliveryStatus`, `limit`, `offset` in that order and encodes every invitation ID with `encodeURIComponent`. Create sends exactly `{name,email,role,mobile}`; Client, Super Admin, title, password, and assignment fields never enter that request.
Public inspection/acceptance use a new `apiClient.postPublic<T>(path, body, options)` transport that never reads or sends `tokenStorage`, never dispatches the authenticated-session 401 event, and still applies JSON/no-store/referrer options. Protected Admin calls continue using ordinary authenticated `post`.

---

### Task 1: Enforce the sole Super Admin and canonical role presentation

**Files:**

- Modify: `backend/src/domain/roles.ts`
- Modify: `backend/src/development/demo-account-catalog.ts`
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/services/user-administration.service.ts`
- Modify: `backend/src/routes/admin-users.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/tests/user-administration.test.ts`
- Modify: `backend/tests/user-administration-mongo.replica-set.test.ts`
- Modify: `backend/tests/roles.test.ts`
- Modify: `backend/tests/development-demo-account-catalog.test.ts`
- Modify: `backend/tests/frontend-authorization-contract.test.ts`
- Modify: `backend/tests/design-section-review.test.ts`
- Modify: `backend/tests/design-sections.test.ts`
- Modify: `backend/tests/access-requests.test.ts`
- Modify: `backend/tests/estimate-design-review.test.ts`
- Modify: `backend/tests/estimate-pdf-routes.test.ts`
- Modify: `backend/tests/hierarchy.test.ts`
- Modify: `backend/tests/kpi.test.ts`
- Modify: `backend/tests/leads.test.ts`
- Modify: `backend/tests/project-module-access.test.ts`
- Modify: `backend/tests/repository.test.ts`
- Modify: `backend/tests/super-admin-authorization.test.ts`
- Modify: `backend/tests/uploads.test.ts`
- Modify: `backend/tests/workflows.test.ts`
- Modify: `frontend/src/api/authorization-contract.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/admin/UserDirectoryPage.tsx`
- Modify: `frontend/src/features/admin/UserMutationDialog.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/api/authorization-contract.test.ts`
- Modify: `frontend/src/features/admin/UserDirectoryPage.test.tsx`
- Modify: `frontend/src/features/admin/UserMutationDialog.test.tsx`
- Modify: `frontend/src/app/router.test.tsx`

**Interfaces:**

- Produces: `UserDirectoryPage.filterRoles: readonly Role[]` containing all 16 roles.
- Produces: `UserDirectoryPage.manageableRoles: readonly Exclude<Role, "super_admin">[]`.
- Produces errors: `400 ROLE_NOT_MANAGEABLE` for a Super Admin destination and `409 SOLE_SUPER_ADMIN_IMMUTABLE` for any PATCH targeting the sole Super Admin.
- Produces canonical labels: `finance_head: "Finance Manager"`, `site_manager: "Site Manager"` with unchanged stored role codes.

- [ ] **Step 1: Write backend RED tests for directory and service invariants**

Add cases proving list returns all-role `filterRoles`, `manageableRoles` excludes only `super_admin`, direct promotion is rejected before responsibility checks, and every mutation of the sole Super Admin—including a stale-version request—returns `SOLE_SUPER_ADMIN_IMMUTABLE` with zero User/grant/audit writes. Replace the existing two-Super-Admin fixture/test. Extend memory seed validation plus direct `createUser` and `updateUser` paths so no repository state can contain or create a second Super Admin. Update every cloned-demo-seed test listed above to reuse its existing `user-super-admin` row instead of appending a duplicate; do not weaken the invariant for fixtures. Where an old test used a second Super Admin to prove reviewer/idempotency behavior, use a non-Super-Admin actor that already owns the required permission so the original assertion remains meaningful.

- [ ] **Step 2: Write Mongo RED tests for the persistence backstop**

Assert the User schema includes this exact additional index and a real replica set rejects concurrent second-Super-Admin inserts while preserving the original row:

~~~typescript
userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: "super_admin" },
    name: "one_super_admin"
  }
);
~~~

- [ ] **Step 3: Run backend RED**

~~~bash
cd backend
npm test -- tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts --reporter=dot
~~~

Expected: failures for missing `filterRoles`, offered Super Admin destinations, mutable sole account, and absent unique index.

- [ ] **Step 4: Implement the backend boundary**

Use separate immutable arrays in `list`; do not reuse mutation choices as filters. In `update`, reload actor and target, reject a Super Admin target before the version check, then retain normal version checking and reject a Super Admin destination before responsibility/audit work:

~~~typescript
if (target.role === "super_admin") {
  throw new ApiError(409, "SOLE_SUPER_ADMIN_IMMUTABLE", "The sole Super Admin account cannot be changed.");
}
if (input.role === "super_admin") {
  throw new ApiError(400, "ROLE_NOT_MANAGEABLE", "This role cannot be assigned.");
}
~~~

Update the route envelope to return both role arrays. Preserve full directory visibility and all existing responsibility/grant behavior for non-Super-Admin rows.

- [ ] **Step 5: Write frontend RED tests and implement presentation**

Change backend/frontend `ROLE_LABELS.finance_head`, the demo account title, and the hard-coded workspace heading to **Finance Manager**. Make the filter consume `filterRoles`, pass only `manageableRoles` to `UserMutationDialog`, and render no Manage button/dialog for `user.role === "super_admin"`. Assert no stale user-facing `Finance Head` string, no Super Admin destination, no PATCH from the sole row, and unchanged Site Manager labeling.

- [ ] **Step 6: Run GREEN/typechecks**

~~~bash
cd backend
npm test -- tests/roles.test.ts tests/development-demo-account-catalog.test.ts tests/frontend-authorization-contract.test.ts tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/access-requests.test.ts tests/design-section-review.test.ts tests/design-sections.test.ts tests/estimate-design-review.test.ts tests/estimate-pdf-routes.test.ts tests/hierarchy.test.ts tests/kpi.test.ts tests/leads.test.ts tests/project-module-access.test.ts tests/repository.test.ts tests/super-admin-authorization.test.ts tests/uploads.test.ts tests/workflows.test.ts --reporter=dot
npm run typecheck
cd ../frontend
npm test -- src/api/authorization-contract.test.ts src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx src/app/router.test.tsx --reporter=dot
npm run typecheck
~~~

- [ ] **Step 7: Commit**

~~~bash
git add backend/src/domain/roles.ts backend/src/development/demo-account-catalog.ts backend/src/models/User.ts backend/src/services/user-administration.service.ts backend/src/routes/admin-users.ts backend/src/repositories/memory.ts backend/tests/roles.test.ts backend/tests/development-demo-account-catalog.test.ts backend/tests/frontend-authorization-contract.test.ts backend/tests/user-administration.test.ts backend/tests/user-administration-mongo.replica-set.test.ts backend/tests/access-requests.test.ts backend/tests/design-section-review.test.ts backend/tests/design-sections.test.ts backend/tests/estimate-design-review.test.ts backend/tests/estimate-pdf-routes.test.ts backend/tests/hierarchy.test.ts backend/tests/kpi.test.ts backend/tests/leads.test.ts backend/tests/project-module-access.test.ts backend/tests/repository.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/uploads.test.ts backend/tests/workflows.test.ts frontend/src/api/authorization-contract.ts frontend/src/api/types.ts frontend/src/features/admin/UserDirectoryPage.tsx frontend/src/features/admin/UserMutationDialog.tsx frontend/src/app/router.tsx frontend/src/api/authorization-contract.test.ts frontend/src/features/admin/UserDirectoryPage.test.tsx frontend/src/features/admin/UserMutationDialog.test.tsx frontend/src/app/router.test.tsx
git diff --cached --check
git commit -m "feat: enforce sole Super Admin identity"
~~~

---

### Task 2: Define the invitation domain, model, and audit vocabulary

**Files:**

- Create: `backend/src/domain/user-invitations.ts`
- Create: `backend/src/models/UserInvitation.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/domain/audit-actions.ts`
- Modify: `backend/src/seed/data.ts`
- Modify: `backend/src/seed/run.ts`
- Test: `backend/tests/user-invitation-models.test.ts`
- Test: `backend/tests/audit-security.test.ts`
- Modify: `backend/tests/seed.test.ts`

- [ ] **Step 1: Write RED tests for exact domain behavior**

Test `INVITABLE_ROLE_CODES` equals all canonical roles except `client` and `super_admin`; trimmed name is 1–120 characters with explicit 120/121 boundaries; invitation-normalized email is at most 254 characters with 254/255 boundaries; and mobile normalization accepts `+91 98765 43210`, trims/collapses whitespace, permits only an optional leading `+` plus ASCII digits/spaces/hyphens/parentheses, requires 7–15 digits, caps the normalized display at 30 characters with 30/31 boundaries, rejects misplaced/multiple plus signs, controls, non-ASCII digits, and unsupported characters, and never adds a country code. Apply `CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u` separately to name, email, and mobile before persistence; RED cases include CR, LF, NUL, DEL, and C1 controls in name/email as well as SMTP header-injection strings. Test 32-byte/43-character base64url generation, lowercase 64-character SHA-256 digest, token-shape rejection, and exact 24-hour interval.

Test token validity independently from the exact presentation precedence:

1. terminal stored status presents Accepted/Revoked/Superseded and has unavailable token;
2. stored pending at `expiresAt <= now` presents Expired;
3. otherwise failed delivery presents Delivery Failed;
4. otherwise stored pending presents Pending, including issuer-invalidated rows;
5. issuer-invalidated Pending has `currentLinkAvailable: false` without a seventh status.

Test all model state invariants and the exact five indexes: partial unique string token hash; non-unique email/status/history; status/history; status/expiry; partial unique string accepted User ID. Assert no TTL and no unique pending-email index.

Extend audit-security fixtures with `rawToken`, `tokenHash`, `passwordConfirmation`, and `smtpPassword`; prove the recursive scrub removes each. Link text, SMTP body, and provider response are never passed to audit writes in the first place. Delivery failure codes must match the bounded uppercase-safe pattern and never preserve provider text.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/user-invitation-models.test.ts tests/audit-security.test.ts tests/seed.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement model and types**

Pending requires hash, issuer ID/version, current generation timestamps, no terminal fields, and expiry exactly issuedAt + 24h. Accepted/revoked/superseded require their exact actor/time/reference and null hash. Delivery consistency:

- queued: all telemetry null;
- sent: attemptedAt + sentAt, failureCode null;
- failed: attemptedAt + bounded failureCode, sentAt null.

Register exactly:

~~~text
user_invitation.created
user_invitation.superseded
user_invitation.delivery_sent
user_invitation.delivery_failed
user_invitation.resent
user_invitation.revoked
user_invitation.accepted
user.invited_created
~~~

Persist trimmed display `name`, trimmed display `email`, separately derived lowercase `emailNormalized`, required normalized `mobile`, and no invitation title field. Add `userInvitations: UserInvitationRecord[]` to `SeedData`, initialize it empty, and add UserInvitation plus shared EmailCoordination to the explicit destructive seed's authorized reset set. Prove a pre-reset token is unavailable after fixtures rebuild and invitation audits are cleared consistently. Do not import either reset path from automatic demo startup.

- [ ] **Step 4: Run GREEN/typecheck and commit**

~~~bash
cd backend
npm test -- tests/user-invitation-models.test.ts tests/audit-security.test.ts tests/seed.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/src/domain/user-invitations.ts backend/src/models/UserInvitation.ts backend/src/repositories/types.ts backend/src/domain/audit-actions.ts backend/src/seed/data.ts backend/src/seed/run.ts backend/tests/user-invitation-models.test.ts backend/tests/audit-security.test.ts backend/tests/seed.test.ts
git diff --cached --check
git commit -m "feat: define staff invitation state model"
~~~

---

### Task 3: Implement memory and Mongo invitation persistence

**Files:**

- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Test: `backend/tests/user-invitation-repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`

**Repository additions:**

~~~typescript
findUserInvitationById(id: string): Promise<UserInvitationRecord | null>;
findPendingUserInvitationByEmail(emailNormalized: string): Promise<UserInvitationRecord | null>;
findLatestUserInvitationIssuedAtByEmail(emailNormalized: string): Promise<string | null>;
findPendingUserInvitationByTokenHash(tokenHash: string): Promise<UserInvitationRecord | null>;
pageUserInvitations(filters: UserInvitationFilters, pagination: PaginationInput, now: string): Promise<PageResult<UserInvitationAdminRecord>>;
hasUnclaimedClientProjectByEmail(emailNormalized: string): Promise<boolean>;
createUserInvitation(input: NewUserInvitation): Promise<UserInvitationRecord>;
supersedeUserInvitation(id: string, expectedVersion: number, change: SupersedeUserInvitationChange): Promise<UserInvitationRecord>;
resendUserInvitation(id: string, expectedVersion: number, change: ResendUserInvitationChange): Promise<UserInvitationRecord>;
revokeUserInvitation(id: string, expectedVersion: number, change: RevokeUserInvitationChange): Promise<UserInvitationRecord>;
acceptUserInvitation(id: string, expectedVersion: number, expectedGeneration: number, expectedTokenHash: string, change: AcceptUserInvitationChange): Promise<UserInvitationRecord>;
updateUserInvitationDelivery(id: string, tokenGeneration: number, change: InvitationDeliveryChange): Promise<UserInvitationRecord | null>;
~~~

- [ ] **Step 1: Write repository RED tests**

Cover create/read with normalized mobile and absent title, normalized-email lookup, maximum persisted `issuedAt` across pending/terminal history, one stored pending per email, supersede then create inside one transaction, resend same record, CAS conflicts, revoke/accept terminality, hash/generation match, telemetry no version bump, stale telemetry returning null, explicit redacted Admin page, and memory rollback. When filters omit `status`, both repositories return all stored-pending rows. Exact status filters implement `pending`, `delivery_failed`, `expired`, `accepted`, `revoked`, and `superseded`; internally invalidated unexpired rows are included by Pending.

Page records batch-check current User ownership and unclaimed Client-project reservation. Normal stored-pending rows derive `availableActions: ["resend", "revoke"]`; claimed/reserved rows derive `["revoke"]` and `currentLinkAvailable: false`; terminal rows derive `[]`. The projection discloses neither ownership reason nor token material.

Mongo tests must prove every session is attached and that session-bound operations remain sequential. Admin paging derives token validity and presentation status before filtering/pagination and omits `tokenHash`, password, account kind, delivery failure code, and provider detail at projection time.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/user-invitation-repository.test.ts tests/mongo-repository.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement parity**

Add all mutation methods to the memory transaction mutation list. Enforce unique non-null token hashes and accepted User IDs, max one stored pending invitation per normalized email, exact state validation, and timing-safe application comparison where needed.

Mongo semantic transitions use `findOneAndUpdate` filters with `_id`, `status: "pending"`, and exact expected version; accept also matches generation and digest. Because `UserInvitationRecord` requires the hash for pending-state validation, every internal Mongo read or transition result typed as a full record explicitly opts into `+tokenHash`, including ID/email/token lookups and resend/delivery results. Admin aggregation, locators that use a narrower redacted type, and every DTO projection remain unable to select it. Map `__v + 1` to API version. Delivery update filters exact `_id + pending + tokenGeneration + queued` and uses `timestamps:false` without incrementing `__v`. Every create/resend service transaction calls the maximum-`issuedAt` read only after `coordinateClientEmail(emailNormalized)` so concurrent recipient cooldown checks serialize. Preserve the existing `executeSessionCompatibleReadPair` rule: every query using one Mongo transaction session executes sequentially; `Promise.all` remains permitted only for queries with no session.

Use aggregation for Admin list: when status is omitted pre-match stored `status: "pending"`; lookup current issuer; normalize a missing legacy issuer version with `$ifNull: ["$issuer.version", 1]`; derive token validity and the six-value presentation precedence; join/batch-check User and unclaimed-project email state; filter; sort `{createdAt:-1,_id:-1}`; facet page/count; lookup inviter; and explicitly project safe fields/actions. Add a raw legacy active Super Admin without a stored `version` and prove a token issued at version 1 remains Pending/current rather than being misclassified.

- [ ] **Step 4: Run GREEN/typecheck and commit**

~~~bash
cd backend
npm test -- tests/user-invitation-repository.test.ts tests/mongo-repository.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/user-invitation-repository.test.ts backend/tests/mongo-repository.test.ts
git diff --cached --check
git commit -m "feat: persist staff invitations transactionally"
~~~

---

### Task 4: Add fail-closed SMTP configuration, mail adapter, and limiters

**Files:**

- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/services/invitation-mailer.ts`
- Create: `backend/src/services/smtp-invitation-mailer.ts`
- Create: `backend/src/types/nodemailer-smtp-connection.d.ts`
- Create: `backend/src/middleware/invitation-rate-limit.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/middleware/errors.ts`
- Modify: `backend/.env.example`
- Create: `backend/tests/helpers/trickling-smtp-server.ts`
- Test: `backend/tests/user-invitation-mailer.test.ts`
- Create: `backend/tests/invitation-rate-limit.test.ts`
- Create: `backend/tests/errors.test.ts`
- Test: `backend/tests/config.test.ts`

- [ ] **Step 1: Add dependencies**

~~~bash
cd backend
npm install nodemailer
npm install --save-dev @types/nodemailer
~~~

- [ ] **Step 2: Write RED tests**

Test a full valid SMTP config, a completely absent group producing `{kind:"disabled"}`, and rejection of every partial group, HTTP/non-origin frontend URL, credentials/query/fragment, invalid port/mode/from, CR/LF, and certificate verification disabled. The startup-before-connect assertions belong to Task 7, which wires this parsed union.

Mailer tests assert exact fragment-only link, address-object usage, escaped HTML, no click tracking/provider logging, implicit `secure:true` versus STARTTLS `secure:false, requireTLS:true`, `tls.rejectUnauthorized:true` in both modes, and 10-second connection/greeting/socket bounds. Opportunistic plaintext fallback is forbidden. Implement Nodemailer composition through a custom transport whose every send owns one isolated connection imported from Nodemailer's bundled `nodemailer/lib/smtp-connection`; never install the stale standalone `smtp-connection` package and never share a connection with another invitation. Add only a narrow local `.d.ts` for the methods/options actually used so the low-level implementation stays synchronized with the installed Nodemailer security version. The wall-clock timer closes that exact connection handle, and one settle-once guard resolves/rejects the send exactly once and clears the timer. A reusable `backend/tests/helpers/trickling-smtp-server.ts` real socket fixture—not only a mock/spied `transporter.close()`—must prove the peer connection is actually closed by the deadline, the send promise settles once, and no timer/connection remains. An uncancelled `Promise.race` and ordinary single-shot Nodemailer `transporter.close()` are forbidden because they do not cancel the in-flight SMTP connection. Public/delivery limiter tests use direct socket address and cover exact 20 attempts per actor+socket or socket IP per 15 minutes, 10,000-entry bounded eviction, integer ceiling `Retry-After`, and no shared login bucket.

Classify adapter failures into bounded uppercase internal codes matching `USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN`; never persist or rethrow the provider's message, response, command, recipient list, or enhanced status text.

Error middleware tests pin `ApiError.headers` as the fifth constructor argument, apply only an integer `Retry-After`, and preserve the existing JSON envelope. Narrowly map an Express body-parser error only when it is a `SyntaxError` with `status === 400` and `type === "entity.parse.failed"` to `400 INVALID_JSON` / `Request body must contain valid JSON.` without echoing parser text; arbitrary errors must remain generic 500.

- [ ] **Step 3: Implement adapters/config**

Parse the complete configuration as a discriminated union exposed by `loadEnvironment()` at the exact `invitationDelivery` property and consumed later by `startServer`:

~~~typescript
export type InvitationDeliveryConfig =
  | { kind: "disabled" }
  | {
      kind: "smtp";
      publicFrontendUrl: string;
      host: string;
      port: number;
      tlsMode: "implicit" | "starttls";
      username: string;
      password: string;
      from: string;
    };
~~~

Development/test may inject `local_test`; no adapter prints a link. Add optional response headers to `ApiError` so `429 TOO_MANY_ATTEMPTS` includes integer `Retry-After` without broad error-envelope changes. Do not wire `AppDependencies` or `startServer` in this parallel task; Task 7 owns those shared integration files.

Export exactly `createSmtpInvitationMailer(config: Extract<InvitationDeliveryConfig, {kind:"smtp"}>): Extract<InvitationMailer, {deliveryKind:"external"}>`; Task 7 consumes this factory without reconstructing SMTP options.

- [ ] **Step 4: Run GREEN/typecheck and commit**

~~~bash
cd backend
npm test -- tests/user-invitation-mailer.test.ts tests/invitation-rate-limit.test.ts tests/errors.test.ts tests/config.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/package.json backend/package-lock.json backend/src/services/invitation-mailer.ts backend/src/services/smtp-invitation-mailer.ts backend/src/types/nodemailer-smtp-connection.d.ts backend/src/middleware/invitation-rate-limit.ts backend/src/config/env.ts backend/src/middleware/errors.ts backend/.env.example backend/tests/helpers/trickling-smtp-server.ts backend/tests/user-invitation-mailer.test.ts backend/tests/invitation-rate-limit.test.ts backend/tests/errors.test.ts backend/tests/config.test.ts
git diff --cached --check
git commit -m "feat: add secure invitation email delivery"
~~~

---

### Task 5: Implement protected invitation administration

**Files:**

- Create: `backend/src/services/user-invitation.service.ts`
- Test: `backend/tests/user-invitations.test.ts`

- [ ] **Step 1: Write direct-service RED tests for list/create/resend/revoke**

Test the current sole active stored Super Admin only; every other role and stale/inactive actor fails before invitation persistence. List supplies exact roles excluding Client/Super Admin, normalized mobile, the six presentation statuses, safe link availability/actions, and redacted DTOs. Omitted status returns all stored-pending rows; explicit status filters use the documented presentation mapping. Claimed/project-reserved rows are revoke-only without disclosing why.

Create tests enforce disabled-delivery rejection before token generation/transaction, exact required `{name,email,role,mobile}`, trimmed name 1–120, normalized email at most 254, normalized mobile 7–15 digits/30 display characters, separate control/header-injection rejection for name/email/mobile, excluded roles/title/unknown keys at the route task, reserved email, User existence, unclaimed project, prior-pending supersede + new row, generation 1, current issuer ID/version, audits, and no mail before commit. Inside the auth-lock → email-lock transaction, the maximum persisted `issuedAt` check enforces the 60-second cooldown before any semantic write. At sub-second boundaries, assert the `429 TOO_MANY_ATTEMPTS` error carries the integer ceiling of remaining seconds in `Retry-After` and performs zero invitation/audit/mail writes.

Resend/revoke start with a non-authoritative ID pre-read, then auth lock → email lock → exact authoritative reload/CAS. Any current sole active Super Admin may rescue an invalidated pending generation; resend rotates the same row, clears delivery telemetry, rechecks User/project/cooldown, and captures the current actor ID/version. Expired/invalidated rows remain revocable. Claimed/project-reserved resend returns `INVITATION_NOT_ACTIONABLE` while revoke succeeds. Add one integration case using Task 4's real trickling SMTP test server: after the isolated connection is forcibly closed at the wall-clock deadline, the service persists generation-scoped failed telemetry/audit, returns a redacted Delivery Failed DTO, and leaves no pending SMTP work.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/user-invitations.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement mutations and delivery helper**

Before generating a token, narrow `InvitationMailer`; `deliveryKind: "disabled"` throws `503 INVITATION_DELIVERY_UNAVAILABLE` with no invitation/audit/mail work. Generate the raw token before the enabled transaction so repository retries persist the digest matching the memory-held token. After commit, `deliverGeneration` reloads the actor and applies the full demo predicate before selecting mailer. An external adapter with a demo actor is never invoked; record a safe failed code. Audit values across all eight new actions use only the approved per-action subset of `invitationId`, `emailNormalized`, `role`, `tokenGeneration`, `expiresAt`, and `deliveryState`; they never add `matched`, provider outcome text, link, body, or response fields. Administrative actions use the Super Admin actor; acceptance and invited-user-created use the newly created User actor. A stale SMTP callback may append its generation-scoped delivery audit but cannot change invitation telemetry or semantic version; the attempted generation already distinguishes it without an extra disclosure field. For a matching current generation, the CAS telemetry update and its delivery audit append occur inside the same short repository transaction; forced audit failure rolls the telemetry back to queued. Telemetry persistence failure returns current queued state and never leaks provider error/token.

Map exact protected errors: existing User `ACCOUNT_EXISTS`; reserved/unclaimed project on create `400 INVITATION_EMAIL_NOT_ALLOWED`; disabled delivery `503 INVITATION_DELIVERY_UNAVAILABLE`; limit/cooldown `429 TOO_MANY_ATTEMPTS` with integer `Retry-After`; stale `VERSION_CONFLICT`; terminal resend or revoke and claimed/project-reserved resend `INVITATION_NOT_ACTIONABLE`; missing ID `NOT_FOUND`. Claimed/project-reserved stored-pending rows remain revocable.

- [ ] **Step 4: Run GREEN/typecheck and commit**

~~~bash
cd backend
npm test -- tests/user-invitations.test.ts tests/audit-security.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/src/services/user-invitation.service.ts backend/tests/user-invitations.test.ts
git diff --cached --check
git commit -m "feat: implement staff invitation administration"
~~~

---

### Task 6: Implement public inspect and one-time acceptance

**Files:**

- Modify: `backend/src/services/user-invitation.service.ts`
- Modify: `backend/tests/user-invitations.test.ts`

- [ ] **Step 1: Write public-flow RED tests**

Equivalent unavailable cases: malformed, unknown, expired-at-equality, invalidated issuer, revoked, accepted, superseded, old generation, existing User, and unclaimed Client project. Assert same status/code/message/cache behavior at route task later and zero password-hasher calls for every cheap-invalid case.

For a plausible current token, inspect returns only name/email/role/expiry and deliberately omits mobile. Hash an accepted password with bcrypt cost 12, then in one transaction: authorization lock → email lock → exact invitation reload by ID/hash/generation/version → sole-issuer/User/project rechecks → ordinary active `standard` User creation → accept CAS/hash clear → two audits. Both acceptance audit actors are the newly created User. Assert `User.name` copies the stored trimmed invitation name, `User.email` preserves the invitation's display email, the repository derives/asserts `User.emailNormalized === invitation.emailNormalized`, and role/mobile copy exactly; the User has no title value, has null address/manager, empty client IDs, no grants/assignments, and no JWT.

- [ ] **Step 2: Run RED, implement, then GREEN**

~~~bash
cd backend
npm test -- tests/user-invitations.test.ts --reporter=dot
npm run typecheck
~~~

Map every public race/repository conflict to one `InvitationUnavailableError`; replay performs zero User/status/JWT writes.

- [ ] **Step 3: Commit**

~~~bash
git add backend/src/services/user-invitation.service.ts backend/tests/user-invitations.test.ts
git diff --cached --check
git commit -m "feat: accept one-time staff invitations"
~~~

---

### Task 7: Expose exact APIs and update authorization parity

**Files:**

- Create: `backend/src/routes/user-invitations.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/domain/authorization.ts`
- Modify: `backend/src/domain/route-operations.ts`
- Modify: `backend/src/services/auth.service.ts`
- Create: `backend/tests/fixtures/staff-invitation-route-operations.ts`
- Modify: `backend/tests/authorization-policy.test.ts`
- Modify: `backend/tests/route-operation-registry.test.ts`
- Modify: `backend/tests/auth-authorization.test.ts`
- Modify: `backend/tests/frontend-authorization-contract.test.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `frontend/src/api/authorization-contract.ts`
- Modify: `frontend/src/api/authorization-contract.test.ts`
- Modify: `frontend/src/auth/authorization.test.ts`
- Modify: `frontend/src/test/authFixtures.ts`
- Test: `backend/tests/user-invitations.test.ts`

- [ ] **Step 1: Write policy/registry/API RED tests**

Assert exact 97 unique permissions, only Super Admin owns the four additions, policy `2026-08-23.staff-invitations.v1`, 101 unique human-JWT operations, and 96 unique routed permissions. Expand `HumanJwtOperation.availability` with literal `identity_provisioning` and use it only for the four appended operations. Add identity scope: GET read/global-read and three POST admin/admin-override. Add inspect/accept to the registry test's explicit non-human route list and prove both public routes have no auth/operation markers.

Strict route schemas and canonical query order:

- GET query `search,role,status,deliveryStatus,limit,offset`;
- create `{name,email,role,mobile}` with all four keys required;
- resend/revoke `{version}`;
- inspect `{token}`;
- accept `{token,password,passwordConfirmation}`.

Assert exact successful HTTP contracts: list returns 200 `{data:{items,pagination,invitableRoles}}`; create returns 201 with one redacted DTO even when delivery failed; resend/revoke return 200 with one redacted DTO; inspect returns 200 `{data:{name,email,role,expiresAt}}`; and accept returns 201 exactly `{data:{accepted:true}}` with no JWT, token, or login fields.

Add an end-to-end authentication regression for a non-reserved invitation: accept once, then use the chosen password through ordinary `/auth/login` from an allowed non-loopback/remote socket and prove `/auth/me` plus the authorization snapshot work for the new active standard role. The acceptance response itself must still contain no JWT or session payload.

An omitted GET `status` must remain omitted at the service boundary and produce the stored-pending/actionable default; add a route regression containing both pending and terminal rows.

Invitation roles reject Client and Super Admin; strict schemas enforce trimmed name 1–120, normalized email at most 254, required normalized mobile with the exact 7–15-digit/30-character domain rules, and reject title plus every extra field. Route RED cases include name 120/121, normalized email 254/255, mobile 30/31, misplaced/multiple `+`, non-ASCII digits, every unknown key, and CR/LF/NUL/DEL/C1 controls independently in name, email, and mobile. Token shape maps to generic 410, while weak/mismatched 12–128-character password remains 400 field validation. A no-store middleware runs before public limiting/validation so success, malformed-JSON 400, schema 400, 410, 429, and 500 responses all include `Cache-Control: no-store`; unavailable 410 responses are byte-equivalent. Prove malformed JSON increments the invitation-public bucket and cannot reach either service.

- [ ] **Step 2: Run RED and implement**

Protected order is authenticate → exact `requireOperation` → delivery limiter for create/resend → validation → service. Public order is no-store → isolated public IP limiter → JSON parsing → token-shape normalization → strict validation → service.

Mount one router under `/api/v1`; inject the discriminated mailer and both limiter option bags through `AppDependencies`. In `app.ts`, register a path-scoped pre-parser chain for the two exact public invitation paths before the existing global `express.json()`: no-store, then the shared invitation-public limiter. Mount the router after JSON parsing without a second limiter invocation. This ordering is required so malformed JSON is still no-store and rate limited; unrelated API routes retain their current parser/middleware behavior. Preserve compatibility for existing `createApp` callers with an internal disabled-mailer default; `local_test` is available only through explicit test/development injection and never logs a link. `startServer` maps absent delivery config to `{deliveryKind:"disabled"}`, uses `createSmtpInvitationMailer` only for the complete SMTP group, and never silently falls back to local/test. Partial config fails in `loadEnvironment` before Mongo connect. Preserve exact startup order `loadEnvironment → connect → prepareDatabase → prepareIdentityIndexes → repository/app → listen`; initialize User and UserInvitation with `Model.init()` (never runtime `syncIndexes()`) so duplicate Super Admin/index failures abort before serving and disconnect. Make index preparation injectable in `ServerDependencies` for order/failure tests. In the new staff-invitation fixture, define `ExpectedStaffInvitationHumanJwtOperation = Omit<ExpectedHumanJwtOperation, "availability"> & { availability: ExpectedHumanJwtOperation["availability"] | "identity_provisioning" }`, compose the Prompt 2 array plus the four additions under that widened expected type, and leave historical Prompt 1/2 fixtures byte-for-byte unchanged. Update the backend `HumanJwtOperation` availability union plus the frontend permission/policy contract in the same commit so parity never lands broken; the protected frontend registry remains 20.

- [ ] **Step 3: Run GREEN/typechecks and commit**

~~~bash
cd backend
npm test -- tests/user-invitations.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts tests/server.test.ts --reporter=dot
npm run typecheck
cd ../frontend
npm test -- src/api/authorization-contract.test.ts src/auth/authorization.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/src/routes/user-invitations.ts backend/src/app.ts backend/src/server.ts backend/src/domain/authorization.ts backend/src/domain/route-operations.ts backend/src/services/auth.service.ts backend/tests/fixtures/staff-invitation-route-operations.ts backend/tests/authorization-policy.test.ts backend/tests/route-operation-registry.test.ts backend/tests/auth-authorization.test.ts backend/tests/frontend-authorization-contract.test.ts backend/tests/user-invitations.test.ts backend/tests/server.test.ts frontend/src/api/authorization-contract.ts frontend/src/api/authorization-contract.test.ts frontend/src/auth/authorization.test.ts frontend/src/test/authFixtures.ts
git diff --cached --check
git commit -m "feat: expose staff invitation APIs"
~~~

---

### Task 8: Prove real Mongo race safety

**Files:**

- Create: `backend/tests/user-invitations-mongo.replica-set.test.ts`

Task 8 owns no production file. A reproduced defect pauses this task and returns to the exact owning Task 2, 3, or 5 RED/fix/commit scope before this race suite resumes.

- [ ] **Step 1: Add real replica-set races**

Sync UserInvitation, User, EmailCoordination, AuthorizationCoordination, Project, and AuditEvent models. Prove:

- two accepts → one 201-equivalent result, one unavailable, one User;
- Client signup vs accept → one User and staff is never linked as Client;
- project create vs invitation create/resend/accept serializes and cannot orphan an unclaimed project;
- revoke vs accept, resend vs accept, create vs resend, resend vs resend;
- out-of-band issuer deactivation, role change, version increment, and operator-controlled replacement vs accept, followed by resend from the restored/current sole Super Admin capturing the new issuer/version;
- second-Super-Admin create/promotion attempts vs the unique index and immutable service boundary;
- concurrent demote/deactivate attempts against the sole Super Admin, each rejected with zero User/grant/audit writes;
- concurrent create/resend cooldown attempts under EmailCoordination, with only one generation issued per minute;
- deferred old SMTP completion vs resend/accept/revoke;
- first-use coordination E11000 retry;
- forced audit failure rolls back semantic invitation/User changes.

Assert max one stored pending row/email, terminal hashes null, claimed/project-reserved rows become revoke-only, six-value presentation filtering is stable, old tokens are unavailable, exact audits exist, and raw token/password are absent from all Mongo/audit/DTO/error JSON plus captured stdout/stderr.

- [ ] **Step 2: Run focused race suite and fix only reproduced defects**

~~~bash
cd backend
npm test -- tests/user-invitations-mongo.replica-set.test.ts --reporter=dot
~~~

Use a suite timeout appropriate for wiredTiger setup, not assertion weakening. After every fix rerun the exact failing race, then the whole file.

- [ ] **Step 3: Commit**

~~~bash
git add backend/tests/user-invitations-mongo.replica-set.test.ts
git diff --cached --check
git commit -m "test: prove staff invitation race safety"
~~~

---

### Task 9: Add frontend invitation contracts and API clients

**Files:**

- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`
- Create: `frontend/src/features/admin/userInvitationsApi.ts`
- Create: `frontend/src/features/admin/userInvitationsApi.test.ts`
- Create: `frontend/src/auth/userInvitationsApi.ts`

- [ ] **Step 1: Write API RED tests**

Add the exact stable frontend types above, including required mobile, six presentation statuses, safe link availability/actions, and `InvitableRole` excluding Client/Super Admin. Extend authenticated `apiClient.post` with optional `Omit<RequestInit,"body"|"method">` without changing existing callers, and add the exact unauthenticated `postPublic` boundary for inspect/accept.

Test canonical protected query order, all six status codes, encoded IDs, exact `{version}` bodies, and the literal create body `{name,email,role,mobile}` with no title/unknown keys. Public inspect exposes no mobile; public requests use `{cache:"no-store",referrerPolicy:"no-referrer"}`. Seed `tokenStorage` and prove no Authorization header is sent and a public 401 cannot clear/dispatch against the existing session. Public functions must not create React Query keys or include the token in URLs.

- [ ] **Step 2: Run RED, implement, and GREEN**

~~~bash
cd frontend
npm test -- src/api/client.test.ts src/features/admin/userInvitationsApi.test.ts --reporter=dot
npm run typecheck
~~~

- [ ] **Step 3: Commit**

~~~bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/features/admin/userInvitationsApi.ts frontend/src/features/admin/userInvitationsApi.test.ts frontend/src/auth/userInvitationsApi.ts
git diff --cached --check
git commit -m "feat: align frontend staff invitation contracts"
~~~

---

### Task 10: Add Super Admin invitation controls to the user directory

**Files:**

- Create: `frontend/src/features/admin/UserInvitationsPanel.tsx`
- Create: `frontend/src/features/admin/InviteUserDialog.tsx`
- Create: `frontend/src/features/admin/InvitationActionDialog.tsx`
- Create: `frontend/src/features/admin/UserInvitationsPanel.test.tsx`
- Create: `frontend/src/features/admin/UserInvitationDialogs.test.tsx`
- Modify: `frontend/src/features/admin/UserDirectoryPage.tsx`
- Modify: `frontend/src/features/admin/UserDirectoryPage.test.tsx`
- Modify: `frontend/src/styles/access-administration.css`

- [ ] **Step 1: Write UI RED tests**

Super Admin + read permission gets one invitation GET; Admin gets no section and zero user/invitation GETs even when a malformed snapshot includes invitation permissions. Each button requires its exact permission. Role options are the server's order, exclude Client/Super Admin, display Finance Manager/Site Manager canonically, and never use a frontend-generated allowlist.

Test exactly four required controls—Name, Email, Role, Mobile—with shared mobile normalization/error association and no title/password/Client/project/assignment/impersonation controls. Assert literal one-shot bodies, `retry:false`, no optimistic cache, exact status filters (Pending, Delivery Failed, Expired, Revoked, Superseded, Accepted), safe sent/queued/failed metadata, no token text, busy close protection, focus entry/restoration, and live announcements.

Render actions only from both permission and server `availableActions`: eligible stored-pending rows show Resend/Revoke; internally invalidated rows remain Pending with a current-link-unavailable resend hint; claimed/project-reserved rows show generic revoke-only copy; terminal history has no actions. A `503 INVITATION_DELIVERY_UNAVAILABLE` preserves all create/resend dialog state, performs no automatic retry, and exposes no link.

For `VERSION_CONFLICT`, retain the selected safe snapshot and set a dialog-lifetime `conflicted` latch before invalidating/refetching. That latch remains true until this dialog unmounts, regardless of whether a later response returns the same ID/version. `conflicted || !isCurrentRow` disables every submit/alternate action; the user must close and explicitly reopen against a refreshed row. Add a regression where refetch returns the same stale version and prove request count remains one. Revoke disappears only after server refetch.

- [ ] **Step 2: Run RED, implement, and GREEN**

~~~bash
cd frontend
npm test -- src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserInvitationDialogs.test.tsx --reporter=dot
npm run typecheck
~~~

- [ ] **Step 3: Commit**

~~~bash
git add frontend/src/features/admin/UserInvitationsPanel.tsx frontend/src/features/admin/InviteUserDialog.tsx frontend/src/features/admin/InvitationActionDialog.tsx frontend/src/features/admin/UserInvitationsPanel.test.tsx frontend/src/features/admin/UserInvitationDialogs.test.tsx frontend/src/features/admin/UserDirectoryPage.tsx frontend/src/features/admin/UserDirectoryPage.test.tsx frontend/src/styles/access-administration.css
git diff --cached --check
git commit -m "feat: add Super Admin invitation controls"
~~~

---

### Task 11: Add the secure public acceptance page

**Files:**

- Create: `frontend/src/auth/InvitationAcceptancePage.tsx`
- Create: `frontend/src/auth/InvitationAcceptancePage.test.tsx`
- Create: `frontend/src/styles/invitations.css`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/router.test.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/index.html`

- [ ] **Step 1: Write StrictMode security RED tests**

Use real `BrowserRouter`. Parse only exact `#token=<43 base64url>`. During render capture hash into a ref without mutating history. In `useLayoutEffect`, preserve `window.history.state` while replacing URL with pathname + search. Only a later effect may inspect.

Store one shared inspect Promise in a ref so StrictMode setup/cleanup/setup produces exactly one network call and still observes the result. Never abort that sole Promise during simulated cleanup. Assert the MSW handler sees empty `window.location.hash`, preserved router state, and raw token absent from DOM, local/session storage, router state, React Query cache, console, and request URL.

Test generic equivalent unavailable UI; valid `<dl>` summary with name/email/role/expiry and no mobile/title; exact expiry; 12–128 matching password; error association/focus; visibility toggles; one accept while pending; no JWT/session install; success link to normal login.

With an authenticated/restoring/error session, keep route mounted but block submission and require explicit logout; accept only after safely unauthenticated. Never silently replace a session.

- [ ] **Step 2: Run RED and implement**

Add a direct public route beside login/signup. Do not touch `routeRegistry.ts`/`routePaths.ts`; assert the registry remains 20 and excludes this path. Add `<meta name="referrer" content="no-referrer">` and import CSS once.

- [ ] **Step 3: Run GREEN/typecheck and commit**

~~~bash
cd frontend
npm test -- src/auth/InvitationAcceptancePage.test.tsx src/app/router.test.tsx --reporter=dot
npm run typecheck
cd ..
git add frontend/src/auth/InvitationAcceptancePage.tsx frontend/src/auth/InvitationAcceptancePage.test.tsx frontend/src/styles/invitations.css frontend/src/app/router.tsx frontend/src/app/router.test.tsx frontend/src/main.tsx frontend/index.html
git diff --cached --check
git commit -m "feat: add secure invitation acceptance"
~~~

---

### Task 12: Verify frontend accessibility and regressions

**Files:**

- Modify: `frontend/src/test/accessibility.test.tsx`
- Modify: `frontend/src/app/router.test.tsx`

- [ ] **Step 1: Add accessibility/responsive coverage**

Cover axe-clean Super Admin panel, create/resend/revoke dialogs, acceptance loading/valid/unavailable/success states, focus trap/Escape/cancel/return, pending protection, keyboard password toggles, textual status, and existing mobile breakpoint.

- [ ] **Step 2: Run focused regression set**

~~~bash
cd frontend
npm test -- src/api/authorization-contract.test.ts src/api/client.test.ts src/features/admin/userInvitationsApi.test.ts src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserInvitationDialogs.test.tsx src/auth/InvitationAcceptancePage.test.tsx src/app/router.test.tsx src/test/accessibility.test.tsx src/auth/LoginPage.test.tsx src/auth/SignupPage.test.tsx src/auth/AuthProvider.test.tsx --reporter=dot
npm run typecheck
npm run build
~~~

- [ ] **Step 3: Commit**

~~~bash
git add frontend/src/test/accessibility.test.tsx frontend/src/app/router.test.tsx
git diff --cached --check
git commit -m "test: verify invitation frontend integration"
~~~

---

### Task 13: Document, review, and run the final cross-stack gate

**Files:**

- Modify: `backend/README.md`
- Modify: `README.md`

- [ ] **Step 1: Document deployment and behavior**

Document exact SMTP variables, disabled/partial/full configuration behavior, sole operator-provisioned Super Admin prerequisite, required Name/Email/Role/Mobile, excluded Client/Super-Admin targets, 24-hour/single-use/resend/revoke behavior, normal login after acceptance, no raw-link logging, Finance Manager/Site Manager naming, and Client separation. State that accepted staff are ordinary remote-usable Users and demo accounts remain local-only.

- [ ] **Step 2: Commit documentation before verification**

~~~bash
git add backend/README.md README.md
git diff --cached --check
git commit -m "docs: document staff invitation delivery"
git status --short
~~~

Expected: clean worktree before the cross-stack gates.

- [ ] **Step 3: Run backend focused/replica gates**

~~~bash
cd backend
npm test -- tests/roles.test.ts tests/development-demo-account-catalog.test.ts tests/seed.test.ts tests/user-invitation-models.test.ts tests/user-invitation-repository.test.ts tests/user-invitation-mailer.test.ts tests/invitation-rate-limit.test.ts tests/errors.test.ts tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/auth.test.ts tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/project-module-access.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts tests/audit-security.test.ts tests/config.test.ts tests/server.test.ts --reporter=dot
npm run typecheck
npm run build
~~~

- [ ] **Step 4: Run frontend focused gate**

~~~bash
cd frontend
npm test -- src/api/authorization-contract.test.ts src/auth/authorization.test.ts src/api/client.test.ts src/features/admin/userInvitationsApi.test.ts src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserInvitationDialogs.test.tsx src/auth/InvitationAcceptancePage.test.tsx src/app/router.test.tsx src/test/accessibility.test.tsx --reporter=dot
npm run typecheck
npm run build
~~~

- [ ] **Step 5: Run static security/scope gates**

~~~bash
! rg -n 'tokenStorage\.(set|get)|localStorage|sessionStorage|useQuery|queryKey' frontend/src/auth/InvitationAcceptancePage.tsx frontend/src/auth/userInvitationsApi.ts
! rg -n 'user-invitations|Invite user|identity\.user_invitations' frontend/src/auth/SignupPage.tsx frontend/src/features/client
! rg -n 'tokenHash|rawToken|passwordConfirmation|smtpPassword' backend/src/routes/user-invitations.ts backend/src/services/user-invitation.service.ts backend/src/services/smtp-invitation-mailer.ts | rg 'console|logger|audit.*Values|response\.json'
! rg -n 'Finance Head' backend/src frontend/src README.md backend/README.md
! rg -n 'super_admin|client|title' frontend/src/features/admin/InviteUserDialog.tsx | rg 'option|name="title"|CreateUserInvitationInput'
! rg -n 'createProjectAccessGrant|findOrCreateActiveProjectAccessGrant|linkUnclaimedProjectsToClient|createProject\(|updateProject\(|createTask\(|updateTask\(' backend/src/services/user-invitation.service.ts backend/src/routes/user-invitations.ts
! rg -n 'projectId|clientId|managerId|assignment|grant' frontend/src/features/admin/InviteUserDialog.tsx frontend/src/features/admin/userInvitationsApi.ts
! rg -n 'seed/run|UserInvitation|EmailCoordination|deleteMany|dropDatabase|drop\(' backend/src/development backend/src/config/development-env.ts
rg -n 'name="referrer".*content="no-referrer"' frontend/index.html
rg -n 'identity\.user_invitations' backend/src/domain/authorization.ts frontend/src/api/authorization-contract.ts
~~~

Expected: forbidden searches have no output; required parity/referrer searches find exact declarations only.

- [ ] **Step 6: Request independent backend and frontend security reviews**

Backend review must cover sole-Super-Admin enforcement, lock order/snapshots, cooldown serialization, CAS identity/generation, Client/project races, issuer replacement/invalidation, SMTP post-commit behavior, disabled delivery, external-mail demo guard, rate limits, DTO/hash/log redaction, and 101-operation parity. Frontend review must cover directory immutability, role+permission gates, no Admin GET, server roles/actions/statuses, immutable versions, fragment clearing/StrictMode, no token persistence, session isolation, and registry staying 20.

Fix every Critical/Important finding with an exact RED/GREEN regression, then rerun affected focused gates and one final full suite for the changed layer. A review finding pauses Task 13: write a short plan addendum naming its exact production/test paths and owning task before editing, commit the verified fix independently, and resume this documentation task only with a clean index. Do not hide review fixes in the README commit.

- [ ] **Step 7: Run the final full suites from a clean worktree**

~~~bash
git status --short
cd backend
npm test -- --reporter=dot
cd ../frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test -- --reporter=dot
cd ..
git diff --check
git status --short
~~~

Expected: both status commands have no output and both full suites pass after every review-fix commit.

---

## Completion Gate

The requirement is complete only when:

- all precondition local-demo and existing Admin-project gates remain green;
- the sole Super Admin alone can list/create/resend/revoke every canonical staff/trade role except Client and Super Admin;
- invitation create requires exactly normalized Name/Email/Role/Mobile and contains no title;
- no application path can create/promote a second Super Admin or mutate the sole Super Admin, and the unique index is initialized before serving;
- every human-facing `finance_head` label is Finance Manager while `site_manager` remains Site Manager;
- raw tokens are fragment-only/transient and only digests persist;
- current token accepts exactly once within 24 hours and creates one active standard User;
- accepted User signs in normally from a remote allowed frontend/backend deployment;
- resend, revoke, supersede, expiry, issuer changes, Client/project races, stale SMTP, and audit failures are proven safe;
- Admin/Client/demo actors cannot use invitation delivery outside their approved boundaries;
- backend has exactly 97 permissions and 101 registered human-JWT operations; frontend registry remains 20;
- full backend/frontend suites, both typechecks/builds, static searches, and independent reviews pass;
- existing Admin project initiation and assignment behavior remains unchanged, and the worktree is clean.

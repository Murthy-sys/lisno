# Real Staff Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an active Super Admin invite any non-Client role through a secure 24-hour, single-use email link so the invitee creates a real remotely usable account, without changing the real Client signup/linking workflow or starting Prompt 2.

**Architecture:** `UserInvitation` is an append-preserving identity-provisioning aggregate separate from `User`. Protected mutations reload the actor under the existing authorization lock and serialize each normalized email through `EmailCoordination`. Tokens are 32 random bytes; only their SHA-256 digest persists. Acceptance cheaply validates the token before bcrypt, then atomically creates one standard User and consumes the invitation. SMTP runs after commit and updates generation-scoped telemetry only. The frontend adds Super-Admin controls to `/admin/users` and a public fragment-scrubbing acceptance route outside the permission registry.

**Tech Stack:** TypeScript 5.8, Express 5, Mongoose 9 transactions/aggregation, Zod, bcryptjs, Node crypto, Nodemailer, React 19, React Router 7, TanStack Query 5, Vitest 3, MSW, Testing Library, axe.

**Spec:** [Local Demo Accounts and Staff Invitations Design](../specs/2026-08-18-local-demo-accounts-and-staff-invitations-design.md).

**Precondition:** [Local Demo Accounts and Remote Authentication Safety](./2026-08-18-local-demo-accounts.md) is implemented, reviewed, committed, and green. This plan consumes its exact `UserRecord.accountKind`, `isReservedDemoEmail`, `isReservedDevelopmentDemoIdentity`, and local/external mail safety boundary.

## Global Constraints

- Do not create an inactive User when an invitation is sent. A User exists only after successful acceptance.
- Do not invite `client`. Client signup remains its existing public transaction for every real/non-reserved Client identity.
- Only a current active stored `super_admin` may list/create/resend/revoke. Admin receives no permission, data, UI, or service entry.
- The four permission codes belong only to Super Admin. Update backend/frontend catalogs atomically to exact policy `2026-08-18.staff-invitations.v1`.
- Keep the frontend permission/presentation route registry at exactly 18 entries. `/accept-invitation` is a public route outside it; invitation controls live on existing `/admin/users`.
- Lock order is always `coordinateAuthorizationMutation()` then `coordinateClientEmail(emailNormalized)`. An outside-transaction ID/hash read may discover email/identity only; every authoritative read and write happens after both required locks.
- Client signup must not query invitations. The first User wins. Invitation create/resend/accept also rejects matching unclaimed Client projects so a staff User cannot orphan the existing Client claim path.
- A new invite supersedes the prior pending row; resend rotates the same row. No partial unique pending-email index is used.
- Raw token/password/link/provider payload never enters Mongo, audit values, logs, errors, Admin DTOs, URLs outside the fragment, browser storage, router state, React Query, or DOM.
- SMTP happens only after the invitation transaction commits. SMTP failure does not roll back the invitation; stale generation callbacks cannot mutate a newer/terminal record.
- A `development_demo` or exact reserved actor may never call an external mail adapter. Local/test mail is injected and does not log raw links.
- Acceptance returns no JWT and never alters an existing browser session. The new user signs in normally afterward.
- No Prompt-2 project initiation, Estimator assignment, grants, worker actions, assignments, or production first-Super-Admin bootstrap.
- TDD every change. Capture focused RED, implement minimum GREEN, run focused tests/typecheck, self-review, and commit exact task scope.
- Do not stage unrelated work. Run `git status --short` and `git diff --cached --check` before each commit.

---

## File Map

### Backend production

- Create `backend/src/domain/user-invitations.ts`.
- Create `backend/src/models/UserInvitation.ts`.
- Create `backend/src/services/invitation-mailer.ts`.
- Create `backend/src/services/smtp-invitation-mailer.ts`.
- Create `backend/src/types/nodemailer-smtp-connection.d.ts`: narrow declarations for Nodemailer's bundled, version-synchronized low-level connection handle.
- Create `backend/src/services/user-invitation.service.ts`.
- Create `backend/src/middleware/invitation-rate-limit.ts`.
- Create `backend/src/routes/user-invitations.ts`.
- Modify `backend/src/repositories/types.ts`, `memory.ts`, and `mongo.ts`.
- Modify `backend/src/domain/authorization.ts`, `route-operations.ts`, and `audit-actions.ts`.
- Modify `backend/src/services/auth.service.ts` policy version only; preserve login/signup payloads.
- Modify `backend/src/config/env.ts`, `server.ts`, `app.ts`, `seed/data.ts`, and `seed/run.ts`.
- Modify `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`, `backend/README.md`, and root `README.md`.

### Backend tests

- Create `backend/tests/user-invitation-models.test.ts`.
- Create `backend/tests/user-invitation-repository.test.ts`.
- Create `backend/tests/user-invitation-mailer.test.ts`.
- Create `backend/tests/user-invitations.test.ts`.
- Create `backend/tests/user-invitations-mongo.replica-set.test.ts`.
- Modify `backend/tests/mongo-repository.test.ts`, `audit-security.test.ts`, `config.test.ts`, `server.test.ts`, `authorization-policy.test.ts`, `route-operation-registry.test.ts`, `auth-authorization.test.ts`, `frontend-authorization-contract.test.ts`, and `fixtures/prompt-1-route-operations.ts`.

### Frontend production

- Create `frontend/src/features/admin/userInvitationsApi.ts`.
- Create `frontend/src/features/admin/UserInvitationsPanel.tsx`.
- Create `frontend/src/features/admin/InviteUserDialog.tsx`.
- Create `frontend/src/features/admin/InvitationActionDialog.tsx`.
- Create `frontend/src/auth/userInvitationsApi.ts`.
- Create `frontend/src/auth/InvitationAcceptancePage.tsx`.
- Create `frontend/src/styles/invitations.css`.
- Modify `frontend/src/api/authorization-contract.ts`, `api/types.ts`, and `api/client.ts`.
- Modify `frontend/src/features/admin/UserDirectoryPage.tsx` and `styles/access-administration.css`.
- Modify `frontend/src/app/router.tsx`, `main.tsx`, and `frontend/index.html`.

### Frontend tests

- Create `frontend/src/features/admin/userInvitationsApi.test.ts`.
- Create `frontend/src/features/admin/UserInvitationsPanel.test.tsx`.
- Create `frontend/src/features/admin/UserInvitationDialogs.test.tsx`.
- Create `frontend/src/auth/InvitationAcceptancePage.test.tsx`.
- Modify `frontend/src/api/authorization-contract.test.ts`, `api/client.test.ts`, `test/authFixtures.ts`, `features/admin/UserDirectoryPage.test.tsx`, `app/router.test.tsx`, and `test/accessibility.test.tsx`.

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
export type StaffRole = Exclude<Role, "client">;
export type UserInvitationStoredStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationEffectiveStatus =
  | UserInvitationStoredStatus
  | "expired"
  | "invalidated";
export type UserInvitationDeliveryStatus = "queued" | "sent" | "failed";

export const USER_INVITATION_TTL_MS = 24 * 60 * 60 * 1_000;
export const USER_INVITATION_RECIPIENT_COOLDOWN_MS = 60_000;
export const USER_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface UserInvitationRecord {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  role: StaffRole;
  title: string | null;
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
  role?: StaffRole;
  status?: UserInvitationEffectiveStatus;
  deliveryStatus?: UserInvitationDeliveryStatus;
}

export interface UserInvitationAdminRecord {
  invitation: Omit<UserInvitationRecord, "tokenHash">;
  effectiveStatus: UserInvitationEffectiveStatus;
  invitedBy: Pick<UserRecord, "id" | "name" | "email" | "role">;
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
  role: StaffRole;
  title?: string;
  status: UserInvitationEffectiveStatus;
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
  invitableRoles: readonly StaffRole[];
}

export interface CreateUserInvitationInput {
  name: string;
  email: string;
  role: StaffRole;
  title?: string;
}

export interface UserInvitationInspection {
  name: string;
  email: string;
  role: StaffRole;
  title?: string;
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
export interface InvitationMailer {
  readonly deliveryKind: "external" | "local_test";
  sendInvitation(input: {
    recipient: { name: string; email: string };
    roleLabel: string;
    title?: string;
    rawToken: string;
    expiresAt: string;
  }): Promise<void>;
}
~~~

## Stable Frontend Transport Contracts

The backend service returns `total`; the protected route converts it with `paginatedEnvelope`. The frontend receives the HTTP shape below, never the internal service page:

~~~typescript
export interface UserInvitationItem {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  title?: string;
  status: UserInvitationEffectiveStatus;
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
  invitableRoles: StaffRole[];
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

The path builder serializes only `search`, `role`, `status`, `deliveryStatus`, `limit`, `offset` in that order and encodes every invitation ID with `encodeURIComponent`.
Public inspection/acceptance use a new `apiClient.postPublic<T>(path, body, options)` transport that never reads or sends `tokenStorage`, never dispatches the authenticated-session 401 event, and still applies JSON/no-store/referrer options. Protected Admin calls continue using ordinary authenticated `post`.

---

### Task 1: Define the invitation domain, model, and audit vocabulary

**Files:**

- Create: `backend/src/domain/user-invitations.ts`
- Create: `backend/src/models/UserInvitation.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/domain/audit-actions.ts`
- Modify: `backend/src/seed/data.ts`
- Modify: `backend/src/seed/run.ts`
- Test: `backend/tests/user-invitation-models.test.ts`
- Test: `backend/tests/audit-security.test.ts`

- [ ] **Step 1: Write RED tests for exact domain behavior**

Test non-Client `INVITABLE_ROLE_CODES`, 32-byte/43-character base64url generation, lowercase 64-character SHA-256 digest, token-shape rejection, exact 24-hour interval, and total effective-status precedence:

1. terminal stored status wins;
2. pending + changed/inactive/non-SA issuer is `invalidated`;
3. otherwise `expiresAt <= now` is `expired`;
4. otherwise `pending`.

Test all model state invariants and the exact five indexes: partial unique string token hash; non-unique email/status/history; status/history; status/expiry; partial unique string accepted User ID. Assert no TTL and no unique pending-email index.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/user-invitation-models.test.ts tests/audit-security.test.ts --reporter=dot
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

Add `userInvitations: UserInvitationRecord[]` to `SeedData`, initialize empty, and make explicit destructive seed clear this new collection without changing automatic demo startup.

- [ ] **Step 4: Run GREEN/typecheck and commit**

~~~bash
cd backend
npm test -- tests/user-invitation-models.test.ts tests/audit-security.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/src/domain/user-invitations.ts backend/src/models/UserInvitation.ts backend/src/repositories/types.ts backend/src/domain/audit-actions.ts backend/src/seed/data.ts backend/src/seed/run.ts backend/tests/user-invitation-models.test.ts backend/tests/audit-security.test.ts
git diff --cached --check
git commit -m "feat: define staff invitation state model"
~~~

---

### Task 2: Implement memory and Mongo invitation persistence

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
findLatestUserInvitationByEmail(emailNormalized: string): Promise<UserInvitationRecord | null>;
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

Cover create/read, normalized-email lookup, latest-issued lookup, one stored pending per email, supersede then create inside one transaction, resend same record, CAS conflicts, revoke/accept terminality, hash/generation match, telemetry no version bump, stale telemetry returning null, explicit redacted Admin page, and memory rollback. When filters omit `status`, both repositories must return only stored-pending rows while deriving/presenting them as pending, expired, or invalidated; terminal history appears only under an explicit terminal status.

Mongo tests must prove every session is attached. Admin paging derives effective state before status filtering/pagination and omits `tokenHash`, password, account kind, and provider detail at projection time.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/user-invitation-repository.test.ts tests/mongo-repository.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement parity**

Add all mutation methods to the memory transaction mutation list. Enforce unique non-null token hashes and accepted User IDs, max one stored pending invitation per normalized email, exact state validation, and timing-safe application comparison where needed.

Mongo semantic transitions use `findOneAndUpdate` filters with `_id`, `status: "pending"`, and exact expected version; accept also matches generation and digest. Map `__v + 1` to API version. Delivery update filters exact `_id + pending + tokenGeneration + queued` and uses `timestamps:false` without incrementing `__v`.

Use aggregation for Admin list: when status is omitted pre-match stored `status: "pending"`; lookup current issuer; normalize a missing legacy issuer version with `$ifNull: ["$issuer.version", 1]`; derive precedence; effective-status match; delivery/search/role match; sort `{createdAt:-1,_id:-1}`; facet page/count; lookup inviter; explicit safe project. Add a raw legacy active Super Admin without a stored `version` and prove a token issued at version 1 is not misclassified invalidated.

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

### Task 3: Add fail-closed SMTP configuration, mail adapter, and limiters

**Files:**

- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/services/invitation-mailer.ts`
- Create: `backend/src/services/smtp-invitation-mailer.ts`
- Create: `backend/src/middleware/invitation-rate-limit.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/middleware/errors.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/user-invitation-mailer.test.ts`
- Test: `backend/tests/config.test.ts`
- Test: `backend/tests/server.test.ts`

- [ ] **Step 1: Add dependencies**

~~~bash
cd backend
npm install nodemailer
npm install --save-dev @types/nodemailer
~~~

- [ ] **Step 2: Write RED tests**

Test full valid SMTP config and rejection of partial config, HTTP/non-origin frontend URL, credentials/query/fragment, invalid port/mode/from, CR/LF, missing production config, and certificate verification disabled. Assert production rejection happens before Mongo connect/listen.

Mailer tests assert exact fragment-only link, address-object usage, escaped HTML, no click tracking/provider logging, implicit vs STARTTLS settings, `tls.rejectUnauthorized: true`, and 10-second connection/greeting/socket bounds. Implement Nodemailer composition through a custom transport whose every send owns one isolated connection imported from Nodemailer's bundled `nodemailer/lib/smtp-connection`; never install the stale standalone `smtp-connection` package and never share a connection with another invitation. Add only a narrow local `.d.ts` for the methods/options actually used so the low-level implementation stays synchronized with the installed Nodemailer security version. The wall-clock timer closes that exact connection handle, and one settle-once guard resolves/rejects the send exactly once and clears the timer. A real local trickling SMTP socket test—not only a mock/spied `transporter.close()`—must prove the peer connection is actually closed by the deadline, the send promise settles once, and no timer/connection remains. An uncancelled `Promise.race` and ordinary single-shot Nodemailer `transporter.close()` are forbidden because they do not cancel the in-flight SMTP connection. Public/delivery limiter tests use direct socket address and cover exact 20 attempts per actor+socket or socket IP per 15 minutes, 10,000-entry bounded eviction, integer ceiling `Retry-After`, and no shared login bucket.

- [ ] **Step 3: Implement adapters/config**

Production requires the complete seven-variable group. Development/test may inject `local_test`; absent local SMTP produces a safe failed/test-only adapter and never prints a link. Add `AppDependencies.invitationMailer?: InvitationMailer` in this task, have production `startServer` construct/inject the external adapter, and leave `createApp`'s eventual Task-6 service consumption for later. A server integration test must observe `deliveryKind: "external"`; production may not silently fall back to local/test. Add optional response headers to `ApiError` or a typed route mapper so `429 TOO_MANY_ATTEMPTS` includes integer `Retry-After` without broad error-envelope changes.

- [ ] **Step 4: Run GREEN/typecheck and commit**

~~~bash
cd backend
npm test -- tests/user-invitation-mailer.test.ts tests/config.test.ts tests/server.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/package.json backend/package-lock.json backend/src/services/invitation-mailer.ts backend/src/services/smtp-invitation-mailer.ts backend/src/types/nodemailer-smtp-connection.d.ts backend/src/middleware/invitation-rate-limit.ts backend/src/config/env.ts backend/src/server.ts backend/src/app.ts backend/src/middleware/errors.ts backend/.env.example backend/tests/user-invitation-mailer.test.ts backend/tests/config.test.ts backend/tests/server.test.ts
git diff --cached --check
git commit -m "feat: add secure invitation email delivery"
~~~

---

### Task 4: Implement protected invitation administration

**Files:**

- Create: `backend/src/services/user-invitation.service.ts`
- Test: `backend/tests/user-invitations.test.ts`

- [ ] **Step 1: Write direct-service RED tests for list/create/resend/revoke**

Test current active stored Super Admin only; every other role and stale/inactive actor fails before invitation persistence. List supplies exact non-Client `invitableRoles` and redacted DTOs. Omitted status passes the actionable default through unchanged and returns only effective pending/expired/invalidated stored-pending rows; explicit accepted/revoked/superseded filters return history.

Create tests enforce lock/order, strict bounds, reserved email, User existence, unclaimed project, persisted 60-second recipient cooldown, prior-pending supersede + new row, generation 1, current issuer ID/version, audits, and no mail before commit. Resend/revoke start with non-authoritative ID pre-read, then auth lock → email lock → exact authoritative reload/CAS. Resend rotates same row, clears all delivery telemetry, rechecks User/project/cooldown, and captures resender version. Revoke clears hash and records actor/time. Add one integration case using Task 3's real trickling SMTP test server: after the isolated connection is forcibly closed at the wall-clock deadline, the service persists generation-scoped `failed` telemetry/audit, returns a redacted failed DTO, and leaves no pending SMTP work.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/user-invitations.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement mutations and delivery helper**

Generate raw token before transaction so repository retries persist the digest matching memory-held token. After commit, `deliverGeneration` reloads the actor and applies the full Plan-A demo predicate before selecting mailer. An external adapter with a demo actor is never invoked; record a safe failed code. Every physical SMTP success/failure appends a safe audit containing only invitation ID, token generation, outcome, and whether the exact pending generation still matched; a stale callback records `matched: false` but cannot change invitation telemetry or semantic version. Current-generation telemetry is written in a short transaction. Telemetry persistence failure returns current queued state and never leaks provider error/token.

Map exact protected errors: existing User `ACCOUNT_EXISTS`; reserved/unclaimed project `400 INVITATION_EMAIL_NOT_ALLOWED`; limit/cooldown `429 TOO_MANY_ATTEMPTS`; stale `VERSION_CONFLICT`; terminal/claimed resend `INVITATION_NOT_ACTIONABLE`; missing ID `NOT_FOUND`.

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

### Task 5: Implement public inspect and one-time acceptance

**Files:**

- Modify: `backend/src/services/user-invitation.service.ts`
- Modify: `backend/tests/user-invitations.test.ts`

- [ ] **Step 1: Write public-flow RED tests**

Equivalent unavailable cases: malformed, unknown, expired-at-equality, invalidated issuer, revoked, accepted, superseded, old generation, existing User, and unclaimed Client project. Assert same status/code/message/cache behavior at route task later and zero password-hasher calls for every cheap-invalid case.

For plausible current token, hash password with bcrypt cost 12, then in one transaction: authorization lock → email lock → exact invitation reload by ID/hash/generation/version → issuer/user/project rechecks → ordinary active `standard` User creation → accept CAS/hash clear → two audits. Both acceptance audit actors are the newly created User. Assert null mobile/address/manager, empty client IDs, no grants/assignments, stored invitation fields own role/email/name/title, and no JWT.

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

### Task 6: Expose exact APIs and update authorization parity

**Files:**

- Create: `backend/src/routes/user-invitations.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/domain/authorization.ts`
- Modify: `backend/src/domain/route-operations.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/tests/fixtures/prompt-1-route-operations.ts`
- Modify: `backend/tests/authorization-policy.test.ts`
- Modify: `backend/tests/route-operation-registry.test.ts`
- Modify: `backend/tests/auth-authorization.test.ts`
- Modify: `backend/tests/frontend-authorization-contract.test.ts`
- Modify: `frontend/src/api/authorization-contract.ts`
- Modify: `frontend/src/api/authorization-contract.test.ts`
- Modify: `frontend/src/test/authFixtures.ts`
- Test: `backend/tests/user-invitations.test.ts`

- [ ] **Step 1: Write policy/registry/API RED tests**

Assert exact 95 unique permissions, only Super Admin owns the four additions, exact policy version, and 97 unique human-JWT operations. Expand `HumanJwtOperation.availability` with exact literal `identity_provisioning` and use it only for keys 94–97. Append those keys with identity scope: GET read/global-read and three POST admin/admin-override. The two public routes must have public limiter then validation and no auth/operation markers.

Strict route schemas and canonical query order:

- GET query `search,role,status,deliveryStatus,limit,offset`;
- create `{name,email,role,title?}`;
- resend/revoke `{version}`;
- inspect `{token}`;
- accept `{token,password,passwordConfirmation}`.

An omitted GET `status` must remain omitted at the service boundary and produce the stored-pending/actionable default; add a route regression containing both pending and terminal rows.

Token shape maps to generic 410, while weak/mismatched password remains 400 field validation. Public unavailable responses include `Cache-Control: no-store` and are byte-equivalent.

- [ ] **Step 2: Run RED and implement**

Protected order is authenticate → exact `requireOperation` → delivery limiter for create/resend → validation → service. Public order is no-store → isolated public IP limiter → token-shape normalization → strict validation → service.

Mount one router under `/api/v1`; inject mailer and both limiter option bags through `AppDependencies`. Keep default safe local adapter. Update frontend contract in the same commit so backend parity never lands broken.

- [ ] **Step 3: Run GREEN/typechecks and commit**

~~~bash
cd backend
npm test -- tests/user-invitations.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts --reporter=dot
npm run typecheck
cd ../frontend
npm test -- src/api/authorization-contract.test.ts --reporter=dot
npm run typecheck
cd ..
git add backend/src/routes/user-invitations.ts backend/src/app.ts backend/src/domain/authorization.ts backend/src/domain/route-operations.ts backend/src/services/auth.service.ts backend/tests/fixtures/prompt-1-route-operations.ts backend/tests/authorization-policy.test.ts backend/tests/route-operation-registry.test.ts backend/tests/auth-authorization.test.ts backend/tests/frontend-authorization-contract.test.ts backend/tests/user-invitations.test.ts frontend/src/api/authorization-contract.ts frontend/src/api/authorization-contract.test.ts frontend/src/test/authFixtures.ts
git diff --cached --check
git commit -m "feat: expose staff invitation APIs"
~~~

---

### Task 7: Prove real Mongo race safety

**Files:**

- Create: `backend/tests/user-invitations-mongo.replica-set.test.ts`
- Modify only owning production files if a reproduced defect requires it.

- [ ] **Step 1: Add real replica-set races**

Sync UserInvitation, User, EmailCoordination, AuthorizationCoordination, Project, and AuditEvent models. Prove:

- two accepts → one 201-equivalent result, one unavailable, one User;
- Client signup vs accept → one User and staff is never linked as Client;
- project create vs invitation create/resend/accept serializes and cannot orphan an unclaimed project;
- revoke vs accept, resend vs accept, create vs resend, resend vs resend;
- issuer demotion/deactivation vs accept;
- deferred old SMTP completion vs resend/accept/revoke;
- first-use coordination E11000 retry;
- forced audit failure rolls back semantic invitation/User changes.

Assert max one stored pending row/email, terminal hashes null, old tokens unavailable, exact audits, and raw token/password absent from all Mongo/audit/DTO/error JSON.

- [ ] **Step 2: Run focused race suite and fix only reproduced defects**

~~~bash
cd backend
npm test -- tests/user-invitations-mongo.replica-set.test.ts --reporter=dot
~~~

Use a suite timeout appropriate for wiredTiger setup, not assertion weakening. After every fix rerun the exact failing race, then the whole file.

- [ ] **Step 3: Commit**

~~~bash
git add backend/tests/user-invitations-mongo.replica-set.test.ts backend/src/models/UserInvitation.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/user-invitation.service.ts
git diff --cached --check
git commit -m "test: prove staff invitation race safety"
~~~

---

### Task 8: Add frontend invitation contracts and API clients

**Files:**

- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`
- Create: `frontend/src/features/admin/userInvitationsApi.ts`
- Create: `frontend/src/features/admin/userInvitationsApi.test.ts`
- Create: `frontend/src/auth/userInvitationsApi.ts`

- [ ] **Step 1: Write API RED tests**

Add the exact stable frontend types above. Extend authenticated `apiClient.post` with optional `Omit<RequestInit,"body"|"method">` without changing existing callers, and add the exact unauthenticated `postPublic` boundary for inspect/accept.

Test canonical protected query order, encoded IDs, exact `{version}` bodies, create omission of blank title, and public `{cache:"no-store",referrerPolicy:"no-referrer"}`. Seed `tokenStorage` in the public transport test and prove no Authorization header is sent and a public 401 cannot clear/dispatch against the existing session. Public functions must not create React Query keys.

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

### Task 9: Add Super Admin invitation controls to the user directory

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

Super Admin + read permission gets one invitation GET; Admin gets no section and zero GET even when a malformed snapshot includes invitation permissions. Each button requires its exact permission. Role options are the server's order and never include a frontend-generated allowlist.

Test exact fields/bounds, no password/Client/project/assignment/impersonation controls, literal one-shot bodies, `retry:false`, no optimistic cache, sent/queued/failed truth, no token text, busy close protection, focus entry/restoration, and live announcements.

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

### Task 10: Add the secure public acceptance page

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

Test generic equivalent unavailable UI; valid `<dl>` summary; optional title; exact expiry; 12–128 matching password; error association/focus; visibility toggles; one accept while pending; no JWT/session install; success link to normal login.

With an authenticated/restoring/error session, keep route mounted but block submission and require explicit logout; accept only after safely unauthenticated. Never silently replace a session.

- [ ] **Step 2: Run RED and implement**

Add direct public route beside login/signup. Do not touch `routeRegistry.ts`/`routePaths.ts`; assert registry remains 18 and excludes this path. Add `<meta name="referrer" content="no-referrer">` and import CSS once.

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

### Task 11: Verify frontend accessibility and regressions

**Files:**

- Modify: `frontend/src/test/accessibility.test.tsx`
- Modify fixture files only when the real new routes require explicit successful handlers.

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

### Task 12: Document, review, and run the final cross-stack gate

**Files:**

- Modify: `backend/README.md`
- Modify: `README.md`
- Modify only task-owned files for review fixes.

- [ ] **Step 1: Document deployment and behavior**

Document exact SMTP variables, HTTPS public origin, initial real Super Admin prerequisite, 24-hour/single-use/resend/revoke behavior, normal login after acceptance, no raw-link logging, and Client separation. State that accepted staff are ordinary remote-usable Users and demo accounts remain local-only.

- [ ] **Step 2: Run backend focused/replica gates**

~~~bash
cd backend
npm test -- tests/user-invitation-models.test.ts tests/user-invitation-repository.test.ts tests/user-invitation-mailer.test.ts tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/auth.test.ts tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/project-module-access.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/audit-security.test.ts tests/config.test.ts tests/server.test.ts --reporter=dot
npm run typecheck
npm run build
~~~

- [ ] **Step 3: Run frontend focused gate**

~~~bash
cd frontend
npm test -- src/api/authorization-contract.test.ts src/api/client.test.ts src/features/admin/userInvitationsApi.test.ts src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserInvitationDialogs.test.tsx src/auth/InvitationAcceptancePage.test.tsx src/app/router.test.tsx src/test/accessibility.test.tsx --reporter=dot
npm run typecheck
npm run build
~~~

- [ ] **Step 4: Run static security/scope gates**

~~~bash
! rg -n 'tokenStorage\.(set|get)|localStorage|sessionStorage|useQuery|queryKey' frontend/src/auth/InvitationAcceptancePage.tsx frontend/src/auth/userInvitationsApi.ts
! rg -n 'user-invitations|Invite user|identity\.user_invitations' frontend/src/auth/SignupPage.tsx frontend/src/features/client
! rg -n 'tokenHash|rawToken|passwordConfirmation|smtpPassword' backend/src/routes/user-invitations.ts backend/src/services/user-invitation.service.ts | rg 'console|logger|audit.*Values|response\.json'
rg -n 'name="referrer".*content="no-referrer"' frontend/index.html
rg -n 'identity\.user_invitations' backend/src/domain/authorization.ts frontend/src/api/authorization-contract.ts
~~~

Expected: forbidden searches have no output; required parity/referrer searches find exact declarations only.

- [ ] **Step 5: Run fresh full suites**

~~~bash
cd backend
npm test -- --reporter=dot
cd ../frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test -- --reporter=dot
~~~

- [ ] **Step 6: Request independent backend and frontend security reviews**

Backend review must cover lock order/snapshots, CAS identity/generation, Client/project races, issuer version invalidation, SMTP post-commit behavior, external-mail demo guard, rate limits, DTO/hash/log redaction, and 97-operation parity. Frontend review must cover role+permission gates, no Admin GET, server roles, immutable versions, fragment clearing/StrictMode, no token persistence, session isolation, and registry staying 18.

Fix every Critical/Important finding with an exact RED/GREEN regression, then rerun affected focused gates and one final full suite for the changed layer.

- [ ] **Step 7: Commit documentation and final review fixes**

~~~bash
git add backend/README.md README.md
git diff --cached --check
git commit -m "docs: document staff invitation delivery"
git status --short
~~~

Expected: clean worktree.

---

## Completion Gate

The requirement is complete only when:

- all Plan A gates remain green;
- Super Admin alone can list/create/resend/revoke every non-Client role, including Super Admin;
- raw tokens are fragment-only/transient and only digests persist;
- current token accepts exactly once within 24 hours and creates one active standard User;
- accepted User signs in normally from a remote allowed frontend/backend deployment;
- resend, revoke, supersede, expiry, issuer changes, Client/project races, stale SMTP, and audit failures are proven safe;
- Admin/Client/demo actors cannot use invitation delivery outside their approved boundaries;
- backend has exactly 95 permissions and 97 registered human-JWT operations; frontend registry remains 18;
- full backend/frontend suites, both typechecks/builds, static searches, and independent reviews pass;
- Prompt 2 remains not started and the worktree is clean.

# Local Demo Accounts and Real Staff Invitations Design

**Date:** 2026-08-18
**Revised:** 2026-08-23
**Status:** Approved in chat after independent written-spec review
**Phase:** Identity provisioning extension; independent of existing project-initiation workflows

**Related:** [Prompt 1 RBAC foundation design](./2026-08-17-prompt-1-rbac-foundation-design.md), [Prompt 1 route-operation matrix](./2026-08-17-prompt-1-route-operation-matrix.md), [Admin-initiated projects design](./2026-08-23-admin-initiated-projects-design.md), and [Prompt 1 implementation report](../../../PROMPT_1_IMPLEMENTATION_REPORT.md)

## Goal

Make one selected canonical account for every documented role usable during normal local development without requiring a destructive seed command, while adding a production-safe way for the sole Super Admin to invite real staff and trade users who can authenticate against a remotely deployed backend.

The two account classes must remain deliberately separate:

- local demo accounts are known, disposable identities that work only in a validated loopback development environment;
- invited staff are real persisted users created through a one-time invitation and may sign in from any supported frontend against the deployed backend.

Client signup, Client authentication, and the existing normalized-email project-linking flow remain unchanged for every real, non-reserved Client identity. The only Client-path exception is the approved security rule that exact reserved demo identities are inert outside validated local development. This work does not modify project initiation, staff project assignment, or later module workflows.

## Context

Prompt 1 introduced the 16-role authorization catalog and local seed credentials. Today those credentials work only after an explicit, destructive `npm run seed`, and the development server may bind beyond loopback. The seed command resets a fixed set of application collections and is not suitable as an automatic startup action; this feature must extend that explicit reset set for invitation state without coupling it to automatic startup.

Prompt 1 intentionally deferred real staff provisioning. The existing Super Admin user screen can list and update existing accounts, but it cannot create one. The only public account-creation route is Client signup, which always creates role `client` and links unclaimed projects by normalized Client email.

This design closes those two provisioning gaps without combining them:

1. `npm run dev` non-destructively ensures one reserved account for each role in an exact local demo database and binds the development API to loopback.
2. The authenticated sole Super Admin sends a one-time email invitation for an allowed staff/trade role. Accepting it transactionally creates a real standard User.

## Approved product decisions

| Decision | Approved outcome |
|---|---|
| Normal local use | Running `npm run dev` is sufficient to make the canonical demo logins available. No seed command is required for normal development. |
| Seed command | Keep `npm run seed` only as an explicit, opt-in full local reset. It also clears invitations and email-coordination state; automatic startup must never call its destructive reset helpers. |
| Demo scope | Ensure one canonical demo account for every one of the 16 roles. |
| Demo safety | Demo accounts work only with a validated loopback development backend and the exact allowlisted local demo database. |
| Remote behavior | A deployed/default backend neither creates nor authenticates a reserved demo identity, even if demo User rows or a previously issued demo JWT were copied to that database. |
| Real staff provisioning | The sole active Super Admin invites real users by email; Admin cannot invite users. |
| Invitable roles | The server supplies every canonical role except `client` and `super_admin`. Neither role may be supplied manually. |
| Required invitation profile | Name, normalized email, canonical role, and mobile are all mandatory. Invitation input has no title field. |
| Business role names | Internal code `finance_head` is displayed as **Finance Manager**. The requested Executive Manager role maps to the existing `site_manager` code and **Site Manager** label. |
| Sole Super Admin | The system has exactly one active Super Admin. Invitations and role updates cannot create or promote another, and the existing Super Admin cannot be demoted or deactivated. |
| Client behavior | Real, non-reserved Client signup, login, and project linking remain on the existing path and do not use staff invitations. Exact reserved demo identities are denied remotely. |
| Account timing | Store a separate invitation first. Do not create a User until the invitation is accepted. |
| Delivery | Send provider-neutral SMTP email containing a public frontend invitation link. |
| Token | Use a random 256-bit, single-use token. Store only its SHA-256 hash. |
| Lifetime | Each issued token expires 24 hours after issue. |
| Replacement | A newly created invitation for the same email supersedes the older pending invitation. Resend rotates the token and invalidates the prior link. |
| Password | The invitee chooses and confirms a 12–128 character password. Persist a bcrypt cost-12 hash only. |
| Invitation controls | Super Admin can list pending invitations and can resend or revoke them with optimistic concurrency. |
| Successful acceptance | Create an active real User with the invited name, email, role, and mobile; consume the invitation; and direct the person to normal login. Do not create an authenticated session automatically. |
| Sole production Super Admin | Remains an operator-controlled deployment prerequisite. The invitation feature cannot bootstrap its privileged actor. |

## Scope

### Included

- A canonical reserved-demo identity registry containing exactly one identity per role.
- Non-destructive, idempotent local demo-account creation before the development server listens.
- Loopback-only development HTTP binding and strict local Mongo target validation.
- Default denial of reserved demo identities in login and JWT authentication outside the validated local development path.
- A separate `UserInvitation` persistence model, indexes, repository contracts, and memory/Mongo parity.
- Super-Admin-only invitation list, create, resend, and revoke APIs.
- Service- and persistence-level enforcement of the single-Super-Admin invariant across user creation and mutation paths.
- Public invitation inspect and accept APIs with rate limiting and generic terminal errors.
- SMTP configuration, delivery adapter, safe delivery status, and an invitation email template.
- A public invitation-acceptance page and Super Admin invitation controls within the existing user-administration screen.
- Permission catalog, authorization snapshot, route registry, audit catalog, and frontend contract updates.
- Concurrency, non-disclosure, security, integration, accessibility, and full regression verification.
- Documentation for local credentials, optional full reset, SMTP deployment configuration, and sole-Super-Admin prerequisites.
- Canonical role-label updates so `finance_head` is presented as Finance Manager while its internal code remains stable.

### Excluded

- Creating, inviting, or changing Clients through the staff invitation flow.
- Inviting or promoting another Super Admin, or demoting/deactivating the sole Super Admin through application APIs.
- Email verification or any modification of `/auth/client-signup` and its project-claim behavior for real, non-reserved identities; exact reserved demo email denial is the sole exception.
- General password reset, forgotten-password, magic-link login, SSO, MFA, or invitation-based automatic login.
- Admin-issued temporary passwords or displaying any password to Super Admin.
- Admin invitations, self-service staff signup, bulk import, CSV upload, or domain-based auto-enrollment.
- Production creation of the sole Super Admin.
- Changes to project initiation, estimator assignment, worker assignment, or later lifecycle behavior.
- New role permissions, role-specific dashboards, project assignments, or task assignments for an invited identity.
- An email job queue, scheduled invitation expiry worker, provider webhooks, or a general notification platform.
- Deleting or rewriting unrelated local data during automatic demo-account preparation.

## Approaches considered

### Combined identity-provisioning architecture (2026-08-18)

### 1. Continue requiring the destructive seed and add temporary staff passwords

This would reuse existing code and produce accounts quickly. It would still make normal local login depend on a command that deletes project and workflow data, and it would require Super Admin to transmit reusable passwords. It was rejected.

### 2. Make the known demo accounts available on every backend

This would make demos easy on remote environments, but a public Super Admin password and known development JWT configuration would become a deployed-backend entry point. Environment variables and CORS are not adequate security boundaries for those accounts. It was rejected.

### 3. Separate local demo bootstrap from real invitation provisioning — selected

Local startup gets a narrowly authorized, users-only bootstrap that cannot run remotely. Production staff use a separate one-time invitation record and choose their own password. This adds more code than the first option, but it establishes the required security boundary and preserves the existing Client lifecycle.

### Real-user onboarding revision (2026-08-23)

#### 1. One-time email invitation — selected

The sole Super Admin supplies the user's required identity fields, while the recipient chooses their own password through a single-use 24-hour link. This avoids administrator-visible passwords and cleanly separates pending invitations from authenticated Users.

#### 2. Super-Admin-issued temporary password

This creates the User immediately and requires the administrator to communicate a reusable credential. It increases credential-handling risk and cannot reliably prove the intended recipient received the account. It was rejected.

#### 3. Open or approval-based staff signup

This would expose a broader public provisioning path and add approval, abuse-prevention, and role-selection concerns. Staff identities are intentionally initiated only by the sole Super Admin, so it was rejected.

## System boundaries

The feature consists of isolated units with explicit responsibilities:

```text
Development launcher
  -> validate loopback HTTP + local Mongo target
  -> ensure missing reserved demo Users only
  -> pass opaque local-demo authorization to authentication
  -> start listening on 127.0.0.1

Super Admin UI
  -> authenticated invitation APIs
  -> UserInvitation repository + audit
  -> post-commit SMTP delivery

Email invitation link (fragment token)
  -> public acceptance page strips fragment
  -> rate-limited inspect / accept APIs
  -> EmailCoordination lock + transaction
  -> real allowed-role User + consumed invitation
  -> normal login
```

The destructive seed module is not imported by the automatic development path. The public Client signup path is not called by invitation acceptance.

## Local demo accounts

### Canonical account catalog

The automatic development catalog selects exactly one reserved identity per canonical role. It is exhaustive over `ROLE_CODES` and fails tests when the role catalog changes without a corresponding development account. It does not attempt to auto-create all 21 Users in the larger full-reset seed dataset.

| Role | Email | Canonical User ID |
|---|---|---|
| Super Admin | `super-admin@lisno.example` | `user-super-admin` |
| Admin | `admin@lisno.example` | `user-admin` |
| Estimator/Sales | `sales@lisno.example` | `user-estimator-sales` |
| Designer | `ananya@lisno.example` | `user-designer-ananya` |
| Procurement | `procurement@lisno.example` | `user-procurement` |
| Finance Manager | `finance-head@lisno.example` | `user-finance-head` |
| Site Manager | `site-manager@lisno.example` | `user-site-manager` |
| Electrician | `worker-electrician@lisno.example` | `user-worker-electrician` |
| Plumber | `worker-plumber@lisno.example` | `user-worker-plumber` |
| Carpenter | `worker-carpenter@lisno.example` | `user-worker-carpenter` |
| Painter | `worker-painter@lisno.example` | `user-worker-painter` |
| Civil Worker | `worker-civil@lisno.example` | `user-worker-civil` |
| Other Worker | `worker-other@lisno.example` | `user-worker-other` |
| Design Manager | `aarav@lisno.example` | `user-manager-aarav` |
| Design Head | `head@lisno.example` | `user-head` |
| Client | `client@aurora.example` | `user-client-aurora` |

All 16 use the documented local-only password `LisnoDemo2026!`. It is intentionally public test data, not a secret. The catalog includes only the minimum canonical profile fields needed by current screens and relationships; it does not create projects, tasks, estimates, access grants, or invitations.

User gains an additive internal `accountKind` field with values `standard` and `development_demo`, defaulting to `standard` for existing and invited real accounts. The automatic catalog inserts `development_demo`. The explicit full-reset seed marks all of its dummy Users as `development_demo`.

Remote denial checks both that marker and an exact legacy reserved-identity registry. In addition to the 16 canonical rows above, the fallback registry contains these five seed-only pairs:

- `user-manager-meera` / `meera@lisno.example`
- `user-designer-kabir` / `kabir@lisno.example`
- `user-designer-ishita` / `ishita@lisno.example`
- `user-designer-vikram` / `vikram@lisno.example`
- `user-client-celeste` / `client@celeste.example`

Older copied seed data without `accountKind` is therefore also inert. Detection never infers demo status from an arbitrary `.example` suffix, display name, or role.

### Startup authorization

Automatic preparation is reachable only from `src/dev.ts`, which is used by both the combined `npm run dev` launcher and the backend-only `npm run dev:backend` watcher. The normal `src/server.ts` entry point and `npm start` do not invoke or import the demo-account writer.

Before any User model load or write, the development path must verify all of the following:

- the effective environment is exactly `development`;
- an explicitly supplied non-development environment is preserved and rejected, not overwritten;
- the HTTP bind host is exactly `127.0.0.1` or the equivalent IPv6 loopback chosen by the implementation;
- the Mongo URI uses `mongodb:` rather than `mongodb+srv:`;
- the URI contains exactly one host and that host is loopback;
- the URI contains no user information;
- the URI database is exactly `lisno_demo`;
- after connection, `mongoose.connection.name` is still exactly `lisno_demo`;
- the User model belongs to that exact connected Mongoose connection.

The validated path mints a module-private, opaque development-demo authorization. That authorization is required both for the bootstrap write and for allowing reserved demo identities through authentication. It is passed through the post-connect/pre-app startup boundary; overriding the Mongo `connect` dependency is not used because preparation failures must remain inside the disconnect-on-error lifecycle. There is no general `ALLOW_DEMO_ACCOUNTS=true` production escape hatch.

`withDevelopmentCredentials` defaults a missing `NODE_ENV` to `development` only for the development launcher. It preserves an explicitly supplied value such as `production`, which causes the demo preparation to reject and the server not to listen.

### Non-destructive insertion policy

The bootstrap first reads all 16 reserved IDs and normalized emails and performs a complete collision preflight before writing:

- if neither ID nor email exists, the canonical account is missing and is inserted;
- if both the canonical ID and email identify the same existing User, that reserved row is eligible for canonical demo repair;
- if the canonical ID and email resolve to different records, or only one side matches a different identity, startup fails before any insertion.

Missing accounts are inserted atomically with their canonical ID, normalized email, role, active state, `development_demo` account kind, password hash, version 1, valid timestamps, and minimum profile/relationship fields. For an exact ID-and-email match, startup restores only the catalog-owned demo fields: name, display/normalized email, password hash, canonical role, active `true`, account kind, title, manager link, and authorized Client IDs. It preserves the immutable ID, original `createdAt`, mobile/address, unknown fields, and every record outside User. If any catalog-owned field changes, it increments User `version` exactly once and sets `updatedAt` to the startup clock; an already canonical row receives no write or timestamp change.

This self-healing behavior is deliberate for reserved local fixtures: changing their password, role, active state, or canonical relationships is temporary and is reset at the next development start. It does not run the normal role-change/deactivation audit or grant-revocation workflow because it is permitted only for marked/exact reserved identities in `lisno_demo`. Existing projects, assignments, responsibilities, and grants remain untouched and continue to be bounded by the restored role's normal authorization policy. Real and unrelated Users are never repaired.

The entire preflight-and-insert operation runs transactionally on the required replica set. Concurrent development starts must converge on the same 16 identities. A duplicate-key race is accepted only after a fresh read proves every winner is the exact canonical ID/email pair; unrelated conflicts fail startup. A second normal run performs zero modifications and does not change `updatedAt` or `version`.

Automatic preparation writes only to the default-connection User collection after verifying `UserModel.db === mongoose.connection`. It never calls `deleteMany`, `replaceOne`, the seed reset helper, or any project/workflow model. In particular, inserting the canonical local Client does not run Client signup and does not retroactively claim an existing unclaimed project. A failure disconnects Mongo and prevents the HTTP server from reporting readiness.

The explicit seed command remains available when a developer intentionally wants a complete local reset. Its authorized model set adds `UserInvitation` and the shared `EmailCoordination` collection, so it deletes pending/terminal invitations and their cooldown/coordination state alongside Users and audit history before rebuilding fixtures. A pre-reset invitation token can never become valid against a recreated canonical Super Admin with the same ID/version. The reset contract avoids a fixed collection-count assertion and instead tests the exact authorized model set. It retains its existing opt-in flags and destructive warning; it is not part of normal startup.

### Loopback HTTP binding

`npm run dev` binds the API explicitly to `127.0.0.1`. The current CORS allow list remains defense in depth and is not treated as a network boundary. Normal production/default startup retains its existing platform/wildcard bind behavior; this scope adds no production `HOST` contract and never supplies the local-demo authorization there.

The readiness message prints the actual bind host and port. Startup tests prove the application does not listen when demo validation or preparation fails.

### Remote denial of reserved identities

Authentication defaults to denying `development_demo` and exact legacy reserved identities. The predicate is independent and fail-closed: `accountKind === development_demo` OR User ID is in the reserved-ID set OR normalized email is in the reserved-email set. The denial applies in both places:

1. password login rejects a located demo User unless the opaque local-demo authorization is present and the socket peer is loopback;
2. JWT authentication reloads the current User and rejects the same identity unless that authorization and loopback peer check both pass.

The peer check reads the socket address and never trusts raw `X-Forwarded-For`. IPv4, IPv6, and IPv4-mapped loopback forms are normalized explicitly; missing or unparseable addresses deny. A process using the built-in development JWT secret rejects every non-loopback human authentication request, not only demo identities. Together with loopback binding, this prevents that known secret from becoming a remote token-forgery path.

The JWT reload check invalidates a demo JWT when it is presented to a remote/default backend, even if the signature is otherwise valid and the demo User row was copied. Login and token failures use the existing generic authentication responses and do not disclose whether a demo record exists.

Staff invitation creation rejects every reserved demo email; generated real User IDs use the normal random User-ID path and must never collide with a reserved ID. Client signup maps an exact reserved demo email to the existing `409 ACCOUNT_EXISTS` response and performs zero User/project/audit writes. Validation and project-linking behavior for every real, non-reserved email remains unchanged. A copied reserved record is inert on a remote backend; this feature does not automatically delete it or fail general production readiness.

## Real staff invitations

### Authorization model

Four new permission codes are added to the canonical backend and frontend catalogs:

```text
identity.user_invitations.read
identity.user_invitations.create
identity.user_invitations.resend
identity.user_invitations.revoke
```

Only `super_admin` receives these permissions. The existing Super Admin user-directory and mutation boundary remains in place; Admin receives no invitation permission and sees no invitation controls or invitation API data.

The invitation target role must be a canonical role other than `client` or `super_admin`; “Super-Admin-only” describes the actor boundary. Every service mutation reloads the current actor and requires it to be the sole active stored `super_admin`, even after route middleware has passed.

The exact invitable role codes are `admin`, `estimator_sales`, `designer`, `procurement`, `finance_head`, `site_manager`, `worker_electrician`, `worker_plumber`, `worker_carpenter`, `worker_painter`, `worker_civil`, `worker_other`, `design_manager`, and `design_head`. Their canonical labels are used everywhere; in particular, `finance_head` displays as Finance Manager and the requested Executive Manager maps to `site_manager` / Site Manager without adding a new role code.

Each token generation captures the issuing Super Admin's User ID and version. Inspect and accept require that User to remain active, remain the sole `super_admin`, and retain the exact captured version. Any out-of-band role/active/version change permanently invalidates that generation without an unbounded bulk invitation mutation. The current sole active Super Admin may explicitly resend an invalidated pending invitation, rotating the token and capturing the current actor's ID/version. This also permits operator-controlled disaster recovery in which the sole Super Admin identity was replaced without ever allowing two such accounts concurrently.

The existing user-administration mutation boundary is tightened into a single-Super-Admin invariant:

- invitation and role-selection allowlists never contain `super_admin`;
- every application service rejects creating or promoting a second `super_admin`;
- the sole Super Admin cannot be demoted or deactivated through the user-administration API;
- a partial unique User index on `role: "super_admin"` provides an at-most-one persistence backstop;
- deployment/index setup refuses pre-existing duplicate Super Admin rows and requires operator remediation rather than choosing one automatically;
- initial production Super Admin provisioning remains operator controlled, after which the operational invariant is exactly one active Super Admin.

The existing `GET /api/v1/admin/users` response separates visibility from mutation choices: `filterRoles` contains every canonical role so the directory can still show and filter the sole Super Admin, while `manageableRoles` contains every currently manageable destination except `super_admin`. `PATCH /api/v1/admin/users/:userId` rejects a `super_admin` destination with `ROLE_NOT_MANAGEABLE` and rejects every mutation targeting the sole Super Admin row with `SOLE_SUPER_ADMIN_IMMUTABLE`; both failures perform zero writes, grant revocations, or audits. The frontend uses `filterRoles` only for filtering, `manageableRoles` only for eligible non-Super-Admin mutation dialogs, and renders no mutation action on the sole Super Admin row.

The authorization policy version receives a new release identifier, and the current permission catalog grows by these four exact codes. Backend/frontend contract parity tests cover both. These four authenticated operation keys are added to the current human-JWT route registry:

```text
GET /admin/user-invitations
POST /admin/user-invitations
POST /admin/user-invitations/:invitationId/resend
POST /admin/user-invitations/:invitationId/revoke
```

The two public invitation routes are explicitly asserted to have rate limiting and validation but no human-JWT operation marker. The current permission/presentation frontend registry gains no protected page entry because the Super Admin controls stay on `/admin/users`; `/accept-invitation` is a separate public route.

### UserInvitation record

`UserInvitation` is additive and separate from `User`. A pending invitation has no login capability, role permissions, project access, or User ID.

Required persistence fields:

- `id`
- invited `name`
- original display `email` and canonical `emailNormalized`
- `role`, validated as any canonical role except `client` and `super_admin`
- required normalized `mobile`
- nullable, non-selected `tokenHash`, containing the lowercase 64-character hexadecimal SHA-256 digest only while the record is pending
- `tokenGeneration`, beginning at 1 and incremented on every resend
- `issuedAt` and `expiresAt`
- stored `status`: `pending`, `accepted`, `revoked`, or `superseded`
- `invitedById`
- `tokenIssuedById` and `tokenIssuerVersion`, identifying the active Super Admin User/version that authorized the current token generation
- nullable `acceptedUserId` and `acceptedAt`
- nullable `revokedById` and `revokedAt`
- nullable `supersededByInvitationId` and `supersededAt`
- `deliveryStatus`: `queued`, `sent`, or `failed`
- nullable `deliveryAttemptedAt`, `sentAt`, and a bounded sanitized `deliveryFailureCode`
- optimistic-concurrency `version`, starting at 1
- `createdAt` and `updatedAt`

The eventual User takes name, normalized email, role, and mobile only from the stored invitation. Acceptance input cannot supply or override them. The invitation and audits retain the inviter relationship; it is not copied into the current User schema. The created User has `accountKind: standard`, the invited mobile, no title value, `address: null`, `managerId: null`, no authorized Client IDs, no access grants, and no assignments. Repositories follow their existing absent-optional-field representation rather than adding a literal-null title contract. Later workflow-specific assignment remains outside this scope.

Token validity and user-facing status are separate derivations. A terminal stored status (`accepted`, `revoked`, or `superseded`) is unavailable and presented as stored. For a stored-pending record, token validity is `invalidated` when the token issuer ID/version/active-sole-Super-Admin check fails, `expired` when `expiresAt <= now`, and `current` otherwise.

The protected directory exposes exactly six presentation statuses with this total precedence: terminal Accepted/Revoked/Superseded first; otherwise Expired when time has elapsed; otherwise Delivery Failed when the current delivery state is failed; otherwise Pending. An internally invalidated, unexpired generation therefore remains presentation status Pending and carries `currentLinkAvailable: false`; an ordinary current pending generation carries `currentLinkAvailable: true`. Internal invalidation never introduces a seventh user-facing status. There is no expiry cron and no TTL deletion because invitation history is retained for review and audit.

Required indexes:

- partial unique `tokenHash` where it is a string;
- non-unique `(emailNormalized, status, createdAt descending, _id descending)` for the transactionally coordinated one-pending invariant and history;
- `(status, createdAt descending, _id descending)` for the Super Admin list;
- `(status, expiresAt, _id)` for derived expiry scans and filters;
- partial unique `acceptedUserId` where it is a string.

The one-pending-per-email invariant is enforced by requiring every repository create/supersede/resend/accept/revoke path to update the same `EmailCoordination` row before every authoritative in-transaction invitation read or write for that normalized email. An ID/hash pre-read outside the transaction may discover the email but grants no authority. The supersede-and-insert transaction therefore does not rely on reusing a partial unique index key before Mongo commits. The memory repository enforces the same coordination, validation, compare-and-swap, and transaction semantics as Mongo.

Model/repository validation enforces the state invariants: pending requires a current hash, token issuer ID/version, issue/expiry, and no terminal fields; accepted requires accepted User/time and a null hash; revoked requires revoking actor/time and a null hash; superseded requires successor/time and a null hash. `expiresAt` must be exactly 24 hours after the current generation's `issuedAt`. Delivery fields never contain provider payloads. Admin/list reads omit the non-selected hash at query time in addition to using explicit serializers.

### State and token transitions

| Operation | Allowed source | Result |
|---|---|---|
| Create | No existing User; any prior invitation state | Existing pending record becomes `superseded` and clears its hash; a new pending record with generation 1 and a 24-hour token is created. |
| Resend | Current stored `pending`, including derived expired, invalidated, or failed delivery | Same record stays pending; token hash rotates, generation increments, current issuing Super Admin ID/version is captured, expiry becomes issue time + 24 hours, delivery returns to queued, and the old link becomes invalid immediately. |
| Revoke | Current stored `pending`, including derived expired or invalidated | Record becomes `revoked`, clears its hash, and cannot be inspected or accepted. |
| Accept | Current pending record, exact current token hash, unexpired, unchanged active Super Admin token issuer, no User with that email | Real active User is created and invitation becomes `accepted` with a cleared hash in one transaction. |
| Concurrent new invite | Existing pending | The newest committed record is the only pending invitation; the older record and token are superseded. |

Accepted, revoked, and superseded records are terminal. Each terminal transition clears `tokenHash`; its generation and safe history remain. A new invitation may be created later, but terminal records are never reopened or automatically deleted. Inspect does not consume a token. Acceptance consumes it exactly once.

Every create, resend, revoke, and accept mutation uses versioned compare-and-swap inside the repository. Missing, stale, terminal, and changed-generation records fail without writing. Resend and create generate a new token before the transaction but persist only its hash.

### Token handling

Raw invitation tokens contain 32 cryptographically random bytes encoded with base64url. The server stores and compares only lowercase hexadecimal `SHA-256(rawToken)` using constant-time comparison where application-level comparison occurs. `expiresAt` is exactly the server-UTC `issuedAt + 24 hours`; equality with the current clock is expired. Resend is the only operation that changes the current generation's issue and expiry times.

The raw token exists only:

- transiently in server memory while composing the SMTP message;
- in the recipient's SMTP message content;
- in the frontend URL fragment;
- transiently in the JSON request body sent to inspect or accept.

It is never returned by an Admin API, persisted, placed in a query string, included in a React Query key, stored in browser local/session storage, written to audit values, or logged. Request logging and error serialization must redact keys normalized to `token`, `password`, `passwordConfirmation`, hash, or secret. The existing recursive audit scrub remains active.

The email link has this form:

```text
https://configured-frontend.example/accept-invitation#token=<base64url-token>
```

The fragment is not sent in the initial HTTP request. The acceptance route captures `window.location.hash` into component memory during its initial render without mutating history. In a pre-request layout effect it calls `history.replaceState(history.state, "", window.location.pathname + window.location.search)`, preserving React Router's state object, and marks the fragment cleared. Only a later effect gated by that cleared state may call inspect. The capture is not performed as a destructive state initializer, and StrictMode remount/effect behavior must retain the captured token. The page does not load third-party analytics or derive cache keys from the token.

The public frontend sends `Referrer-Policy: no-referrer` for the acceptance route. SMTP click tracking is disabled. Recipient and name values are passed through the mail library's address APIs and HTML-escaped templates; CR/LF header injection is rejected.

### Invitation creation

The create service transaction performs these steps in order:

1. Acquire the existing authorization/user-administration coordination lock, then reload and authorize the active Super Admin.
2. Validate a canonical role other than Client or Super Admin and strict name/email/mobile bounds.
3. Reject the reserved demo identity set.
4. Acquire the existing normalized-email coordination lock.
5. Read the greatest persisted `issuedAt` across invitation history for that normalized email and reject when it is less than 60 seconds old.
6. Recheck that no User already owns the email and no unclaimed Client project uses it.
7. Recheck and supersede any currently pending invitation for the email.
8. Create the new pending invitation with a hashed token, 24-hour expiry, the creating Super Admin's current User ID/version as token issuer, queued delivery, and null delivery telemetry fields.
9. Append invitation-created and, when applicable, invitation-superseded audits in the same transaction.
10. Commit before attempting external SMTP delivery.

The user is not created at this stage. Double submission is blocked in the UI; server concurrency still guarantees one pending invitation per email and treats the newest committed invitation as authoritative.

Invitation input bounds are exact: trimmed name 1–120 characters; invitation-specific normalized email at most 254 characters using the existing email normalization; canonical role other than `client` or `super_admin`; and required mobile. Mobile normalization trims outer whitespace, collapses internal whitespace, permits only an optional leading `+`, ASCII digits, spaces, hyphens, and parentheses, and requires 7–15 digits after separators are removed. It does not infer or add a country code. The normalized display value must be at most 30 characters and is what both invitation and User store. All four keys are mandatory and the strict schema rejects control characters, `title`, and every unknown field. These invitation-specific bounds do not modify the shared Client signup schema.

Create and resend share a bounded actor-plus-IP rate limiter and a persisted one-minute per-recipient delivery cooldown. The initial limits are 20 invitation delivery attempts per actor/IP per 15 minutes and no more than one issued token for an email per minute. The actor/IP limiter runs after authentication/permission checks and before the transaction. The authoritative recipient cooldown check runs inside the transaction after acquiring `EmailCoordination`: it reads the greatest persisted `issuedAt` for that normalized email across pending and terminal invitation history and rejects a value newer than 60 seconds before any invitation, audit, or delivery write. Concurrent create/resend attempts therefore serialize on the same email and only one may issue a generation per minute. Before any mailer call, the invitation service applies the full demo predicate—account marker OR reserved ID OR reserved normalized email. A demo Super Admin may use only an explicitly injected local/test sink; the service never invokes the real SMTP adapter for that actor. This prevents both marked and legacy public local credentials from becoming an outbound mail relay without trusting presentation fields inside the mailer.

Create is intentionally not transport-idempotent: a second committed POST is a new invitation and supersedes the first. The frontend never automatically retries create or resend. Rate limits and the cooldown bound an ambiguous lost-response retry.

### Resend and revoke

Resend requires the immutable invitation ID and current version. It first performs a non-authoritative ID pre-read outside the transaction to discover normalized email. Inside the transaction it acquires the authorization coordination lock, then the email coordination lock, then authoritatively reloads exact ID/version/stored-pending status before any CAS. It reauthorizes the current sole Super Admin, enforces the authoritative persisted recipient cooldown, rechecks that no User or unclaimed Client project now owns/reserves the email, rotates token generation/hash/expiry, and captures the resending Super Admin's current ID/version. It resets delivery to queued and clears `deliveryAttemptedAt`, `sentAt`, and `deliveryFailureCode`. The previous token becomes invalid at commit, before SMTP is called.

Revoke also performs a non-authoritative ID pre-read to discover email, then acquires authorization followed by email coordination inside the transaction before authoritatively reloading exact ID/version/stored-pending status. Stored-pending invitations remain revocable when their derived state is expired or invalidated. Revoke clears the hash, records the actor/time, and audits in the same transaction. Revocation never deletes a User and is unavailable after acceptance.

Neither mutation retries automatically after a version conflict. The UI refetches, keeps the selected redacted invitation visible, and requires a fresh explicit action against the new server version.

### SMTP delivery

An isolated `InvitationMailer` interface accepts the recipient, safe invitation presentation fields, raw token, and expiry. Production uses a provider-neutral SMTP adapter with certificate-validating TLS, authenticated credentials, a configured From address, a bounded connection/request timeout, and a public HTTPS frontend base URL.

Create and resend commit the invitation before SMTP. They then attempt delivery once:

- success updates the same invitation generation from queued to sent, sets `deliveryAttemptedAt` and `sentAt`, clears `deliveryFailureCode`, and writes its safe audit event in one short transaction;
- failure updates it to failed, sets `deliveryAttemptedAt` and a bounded internal `deliveryFailureCode`, keeps `sentAt` null, and writes its safe audit event in one short transaction; it stores no provider response, message body, or credential;
- a stale completion may update only the exact invitation ID, pending status, and token generation it attempted, so an old send cannot overwrite the state of a resend, revoke, supersede, or accept;
- an email from a stale in-flight attempt may arrive, but its token is already invalid after a later rotation.

Delivery telemetry updates `deliveryStatus` and its timestamps but does not increment the invitation's semantic optimistic-concurrency version. Version increments only for create's initial version and for resend, revoke, supersede, or accept. This prevents an SMTP acknowledgement from manufacturing a false user-action conflict while the token-generation predicate still protects delivery races.

Generation-specific delivery timestamps and failure codes describe only the current token generation. Prior-generation delivery outcomes remain in audit history rather than leaking into the current queued/sent/failed DTO.

The API returns the persisted invitation and its delivery state even when SMTP fails because the invitation was committed. Super Admin sees **Delivery Failed** and may resend. No raw token is returned as a fallback. If the process exits after commit but before delivery, the row remains queued and can be resent.

Audit actions cover created, superseded, delivery sent, delivery failed, resent, revoked, and accepted. Audit values contain invitation ID, normalized email, role, generation, expiry, and safe delivery state only.

### Invitation acceptance and Client race

The acceptance service first validates the bounded body, hashes the raw invitation token with SHA-256, and performs a cheap non-authoritative read for a current pending, unexpired candidate and unchanged active Super Admin token issuer. Malformed, unknown, terminal, expired, or invalidated tokens return the generic unavailable response with zero bcrypt work. Only a plausible bearer token causes the selected password to be hashed with bcrypt cost 12. Every authority and state condition is then rechecked inside the transaction; the pre-read grants no authority. Within the transaction it:

1. acquires the existing authorization/user-administration coordination lock;
2. acquires the existing `EmailCoordination` lock for the pre-read invitation's normalized email as the first email-specific operation;
3. reloads the invitation by ID and submitted token hash in the same transaction;
4. requires stored pending status, exact current hash/generation, and an expiry in the future;
5. reloads the current token issuer and requires active stored `super_admin` role plus the exact captured User version;
6. requires that no User owns the normalized email;
7. requires that no unclaimed Client project currently uses the normalized email;
8. creates one active standard User with the invitation's name, email, role, and mobile, no title value, default version 1, and no Client project linkage;
9. compare-and-swap marks the invitation accepted, clears its hash, and records the new User ID;
10. appends invitation-accepted and invited-user-created audits without password or token data;
11. commits both records atomically.

Client signup already takes the same normalized-email coordination lock. Therefore concurrent Client signup and staff invitation acceptance serialize:

- if invitation acceptance wins, later Client signup receives the existing account response and links no projects;
- if Client signup wins, invitation acceptance returns the generic unavailable response and creates no staff User;
- the Client signup schema, Client role, response envelope, and existing `linkUnclaimedProjectsToClient` transaction remain unchanged.

An invitation does not reserve its email against public Client signup. This is an explicit compatibility decision: `/auth/client-signup` does not query `UserInvitation` or change its response behavior for real, non-reserved identities. The first committed User wins. If Client signup wins, the invitation remains pending but unusable until Super Admin revokes it; create and resend correctly refuse an email that now belongs to a User. Public inspect/accept returns the generic unavailable response.

Invitation create and resend also check for an existing unclaimed Client project under the same coordination lock and reject rather than emailing a staff link. Acceptance repeats that check transactionally. Project creation itself remains unchanged: if an unclaimed Client project appears after invitation delivery, acceptance becomes unavailable, preserving the email for Client signup rather than converting it into an internal account.

Invitation acceptance never calls the Client project-linking helper. Staff invitation creation rejects roles `client` and `super_admin`. This invitation system does not resolve the separately documented risk of claiming projects by an unverified Client email.

## API contract

All bodies and queries are strict. IDs in paths are encoded by the frontend. All invitation DTOs are explicit whitelists and exclude token hashes, raw tokens, passwords, provider responses, and credential fields.

### Protected Super Admin routes

#### `GET /api/v1/admin/user-invitations`

Canonical query order is `search`, `role`, `status`, `deliveryStatus`, `limit`, `offset`. Invitation `status` accepts the six user-facing values `pending`, `delivery_failed`, `expired`, `accepted`, `revoked`, or `superseded`; `deliveryStatus` separately accepts `queued`, `sent`, or `failed` for operational filtering. `status=pending` includes unexpired stored-pending rows whether their internal token validity is current or invalidated, but excludes rows whose presentation status is Delivery Failed. Omitting `status` defaults server-side to all actionable stored-pending rows regardless of presentation status. Pagination follows the existing `{items, pagination}` envelope.

The response also includes `invitableRoles`, supplied by the server and containing every canonical role except `client` and `super_admin`. Role labels come from the canonical server contract; `finance_head` is shown as Finance Manager and `site_manager` remains Site Manager. Each row contains only:

- ID, invited name/email/role/mobile;
- presentation invitation status and safe `currentLinkAvailable` boolean;
- invited-by public identity;
- issued/expiry timestamps;
- safe delivery status, attempted time, and SMTP-accepted time;
- optimistic version and created/updated timestamps.

For stored-pending rows, the server also derives `availableActions` after batch-checking whether a User or unclaimed Client project now owns/reserves each normalized email. A normal actionable row exposes `resend` and `revoke`; an email-claimed or project-reserved row exposes only `revoke`, carries `currentLinkAvailable: false`, and remains presentation status Pending unless expiry or Delivery Failed has higher presentation precedence. These hints are advisory snapshots and every mutation repeats the authoritative checks under `EmailCoordination`.

The response never includes token material or a reconstructed invitation link.

#### `POST /api/v1/admin/user-invitations`

Exact body:

```json
{
  "name": "Real User",
  "email": "person@example.com",
  "role": "designer",
  "mobile": "+91 98765 43210"
}
```

All four fields are mandatory. `role` rejects `client` and `super_admin`, and the strict body rejects `title` and unknown keys. The endpoint returns `201` with the redacted invitation DTO after the bounded delivery attempt. A failed SMTP attempt still returns the created row with `deliveryStatus: "failed"`.

#### `POST /api/v1/admin/user-invitations/:invitationId/resend`

Exact body: `{ "version": 2 }`. Returns `200` with the updated redacted invitation after delivery attempt.

#### `POST /api/v1/admin/user-invitations/:invitationId/revoke`

Exact body: `{ "version": 2 }`. Returns `200` with the revoked redacted invitation.

### Public routes

Both public routes use a dedicated invitation-public rate limiter before token/body validation so attack traffic cannot consume the login/Client-signup limiter. Its initial bound is 20 attempts per socket IP per 15 minutes with the existing bounded-entry eviction behavior. Every inspect and accept response—success, validation failure, rate limit, or terminal failure—sets `Cache-Control: no-store`. Unavailable cases return HTTP `410` with the same `INVITATION_UNAVAILABLE` code, message, headers, and body for unknown, malformed, expired, invalidated, revoked, accepted, superseded, wrong-generation, email-claimed, unclaimed-Client-project, or otherwise unavailable tokens.

#### `POST /api/v1/auth/user-invitations/inspect`

Exact body: `{ "token": "..." }`.

The token input must be exactly 43 base64url characters, the encoding length of 32 bytes. Token-shape failures are mapped to the same `410 INVITATION_UNAVAILABLE` response as lookup/state failures rather than the general schema-error envelope.

For a valid current token, returns only the invitation's name, email, role, and expiry. Mobile is deliberately omitted from the public inspection response. Inspect does not consume or extend the token.

#### `POST /api/v1/auth/user-invitations/accept`

Exact body:

```json
{
  "token": "...",
  "password": "invitee-selected-password",
  "passwordConfirmation": "invitee-selected-password"
}
```

Passwords must match and be 12–128 characters. Success returns `201` with `{ "data": { "accepted": true } }`; it returns no JWT and no login payload.

### Error behavior

- Public invalid/expired/invalidated/used/revoked/superseded tokens: one generic `INVITATION_UNAVAILABLE` response.
- Existing real User or Client race during public acceptance: the same generic `INVITATION_UNAVAILABLE` response.
- Super Admin create for an existing User: `ACCOUNT_EXISTS` without exposing credentials or account details.
- Reserved demo email or email currently used by an unclaimed Client project: `400 INVITATION_EMAIL_NOT_ALLOWED` with `This email cannot be invited.`; no identity/project details are returned.
- Actor/IP delivery limit or per-recipient cooldown: `429 TOO_MANY_ATTEMPTS` with the existing generic message and an integer `Retry-After` header; no invitation, token rotation, audit, or SMTP call occurs.
- Stale resend/revoke: `VERSION_CONFLICT`; no retry or token rotation occurs.
- Terminal resend/revoke, or resend after the email becomes User-owned or reserved by an unclaimed Client project: `INVITATION_NOT_ACTIONABLE`.
- Unknown protected invitation ID: the existing generic `404 NOT_FOUND` response.
- SMTP failure after commit: successful invitation mutation response with safe `failed` delivery state, not a raw provider error.
- Entirely absent production SMTP/public-URL configuration: invitation create/resend returns `503 INVITATION_DELIVERY_UNAVAILABLE` before token generation or persistence; unrelated application features may still start.
- Partially supplied or invalid SMTP/public-URL configuration: backend startup fails before listening because it indicates a misconfigured attempt to enable invitations.

## Frontend experience

### Super Admin user administration

The existing `/admin/users` page remains the Super Admin entry point. Its user directory remains intact. The one-field mutation dialog remains available for manageable non-Super-Admin user rows, regardless of `accountKind`, but excludes promotion to Super Admin and offers no role/status mutation for the sole Super Admin account.

For a snapshot with `identity.user_invitations.read` and role `super_admin`, the page additionally renders:

- an **Invite user** button, gated by `identity.user_invitations.create`;
- a **Pending invitations** section showing email, role, inviter, expiry, and safe delivery state;
- **Resend** gated by `identity.user_invitations.resend`;
- **Revoke** gated by `identity.user_invitations.revoke`.

Admin receives none of these permissions, cannot access the Super Admin user directory, and does not call user-directory or invitation APIs. Role choices come from server-provided `invitableRoles`, not a frontend-created allow list. Client and Super Admin never appear as invitation targets.

The section defaults to actionable invitations but provides status filtering over Pending, Delivery Failed, Expired, Revoked, Superseded, and Accepted history using the exact server query mapping. A rare internally invalidated generation remains presented as **Pending** with a textual **Current link unavailable—resend** hint rather than introducing another user-facing status. An email-claimed or Client-project-reserved pending row uses the generic hint **This invitation can no longer be resent—revoke it**, shows only Revoke, and does not disclose which ownership condition occurred. Buttons are rendered only when present in server-derived `availableActions`, with permissions applied as a second gate; mutation-time server checks remain authoritative.

The create dialog contains exactly four required controls: name, email, role, and mobile. The role control uses the server allowlist, which excludes Client and Super Admin. It has no title, password field, temporary-password output, Client project control, assignment control, or impersonation action. Pending submission blocks duplicate actions and dialog dismissal.

Resend and revoke use the row's immutable ID and version. A `VERSION_CONFLICT` invalidates/refetches, keeps the selected redacted snapshot, disables stale replay, and requires another explicit action. Create/resend success announces whether delivery is sent, queued, or failed without exposing a token. Revoke success removes the item from the actionable list after server refetch.

### Public acceptance page

`/accept-invitation` is a public route outside the authenticated permission registry. It does not alter the existing login and Client signup routes.

The page:

1. reads and immediately removes the fragment token;
2. calls inspect without caching the raw token;
3. shows the invited name, email, role label, and expiry for a valid invitation;
4. accepts and confirms a 12–128 character password;
5. calls accept once and never retries a mutation automatically;
6. on success shows that the account is ready and links to normal login;
7. never stores or installs a JWT automatically.

Unavailable states use one stable message that does not distinguish invalid, expired, revoked, already used, or superseded. The page offers a link back to login and tells the person to contact their administrator for a new invitation.

If the browser already has an authenticated session, the acceptance page does not replace it. It requires the current user to sign out before submitting a different account's invitation, preventing an accidental account switch.

Dialog and page controls reuse the current design system, focus trap, pending-state protection, live announcements, responsive behavior, and accessible error association. Invitation state and delivery state are conveyed in text rather than color alone.

## Configuration and deployment

Production invitation delivery, when enabled, requires the complete configuration bundle:

- `PUBLIC_FRONTEND_URL`, an HTTPS origin with no credentials, query, or fragment;
- `SMTP_HOST` and positive integer `SMTP_PORT`;
- `SMTP_TLS_MODE`, exactly `implicit` or `starttls`, with certificate verification required in both modes;
- `SMTP_USERNAME` and `SMTP_PASSWORD`;
- `SMTP_FROM`, parsed as one validated mailbox with no CR/LF characters.

SMTP connection and send operations use fixed bounded ten-second timeouts. The environment changes update `backend/.env.example`, the root README, and backend deployment documentation together. When the complete bundle is absent, production starts with invitation delivery disabled: create and resend fail closed with `503 INVITATION_DELIVERY_UNAVAILABLE` before they generate, rotate, persist, audit, or mail a token. List and revoke remain available for previously persisted records. A partial or invalid bundle is fatal before Mongo connection/listen because it signals an attempted but unsafe enablement. Secrets are never printed in readiness or error output, and there is no console-link fallback.

Development and tests use an injected mailer. They do not silently print raw invitation links. The normal demo launcher never sends real mail because its sole Super Admin is a reserved demo identity. Testing real SMTP locally requires an explicit production-like, non-demo startup plus a standard operator-provisioned sole Super Admin and the complete delivery configuration; supplying SMTP settings to the normal demo launcher alone is insufficient. Otherwise the injected/local adapter records a safe failed or test-only delivery state without exposing the token in logs.

Deployment prerequisites are:

1. provision the sole real Super Admin through the existing operator-controlled process;
2. configure production SMTP and the public frontend URL;
3. deploy backend and frontend permission contracts together;
4. verify public acceptance routing and HTTPS before sending an invitation.

Real accepted users are ordinary User records. They may authenticate from any allowed frontend origin against the remote backend, subject to existing account-active, JWT, role, and authorization checks.

## Audit and observability

New canonical audit actions cover:

```text
user_invitation.created
user_invitation.superseded
user_invitation.delivery_sent
user_invitation.delivery_failed
user_invitation.resent
user_invitation.revoked
user_invitation.accepted
user.invited_created
```

Administrative actions record Super Admin as actor. For `user_invitation.accepted` and `user.invited_created`, the newly created User is the required audit actor, matching the existing Client-signup convention. The audit preserves the invitation/inviter relationship without treating the unauthenticated browser or the inviter as the acceptance actor.

Safe operational logs may include invitation ID, delivery state, token generation, and a request correlation ID. They must not include raw token, token hash, password, SMTP credentials, full provider response, or invitation link. Startup logs may report how many demo accounts were inserted or already present, but never the password hash or JWT secret.

## Testing strategy

Implementation follows red-green-refactor. All security claims require executable regression tests rather than only static checks.

### Local demo-account tests

- The catalog is exhaustive and contains exactly one account for each of the 16 roles.
- A fresh exact local demo database creates all 16 accounts and each can log in with the documented local password.
- Normal `npm run dev` requires no seed flags or seed command.
- Drifted catalog-owned fields on exact reserved matches are repaired, incrementing version/timestamp once; their non-catalog fields and all unrelated Users/projects/tasks remain byte-for-byte unchanged.
- A second run makes zero writes and preserves versions/timestamps.
- ID-only, email-only, and crossed reserved-identity collisions abort before all writes.
- Concurrent starts converge on one canonical row per account.
- Production, missing/incorrect effective development mode, remote/SRV/multi-host/userinfo Mongo URI, wrong/missing database, connected-name mismatch, and wrong model connection all reject with zero writes.
- Demo bootstrap completes before listen; failure disconnects and never reports readiness.
- The development server binds loopback; production/default startup does not use the bootstrap.
- Remote login independently rejects account marker, reserved-ID-only, and reserved-email-only matches; remote JWT authentication rejects a locally issued demo token for all socket-address forms, including spoofed forwarded headers.
- A server using built-in development credentials rejects every non-loopback human authentication request.
- Real non-reserved Users remain able to log in remotely.
- Exact reserved Client email is inert remotely while normal Client signup/login/linking regression tests remain green.
- Static scope tests prove the automatic path has no destructive seed/reset imports or calls.
- The explicit full seed reset clears UserInvitation and EmailCoordination state, removes invitation audit history consistently, and makes every pre-reset invitation token unavailable; the automatic bootstrap still touches Users only.

### Invitation persistence and concurrency tests

- Model validation and every required index are exact; invitation rows require normalized mobile and have no title field.
- Memory and Mongo repositories agree on create, list, CAS, status derivation, and redacted mapping.
- Only one stored pending invitation exists per normalized email.
- A new invite supersedes the prior pending row and token atomically.
- Resend rotates hash/generation/expiry and invalidates the old token before delivery.
- Accept succeeds exactly once and creates exactly one User.
- Parallel accepts yield one success and one generic unavailable result.
- Acceptance copies the stored normalized name, email, role, and mobile exactly once, creates no User title value, and cannot accept identity overrides.
- Client signup versus staff acceptance yields one User and never links staff as a Client.
- Matching unclaimed Client projects prevent invitation create/resend/accept without changing those project rows.
- Revoke versus accept, resend versus accept, create versus resend, and stale SMTP completion races cannot revive or retarget an invitation.
- Invitation create/resend/accept versus project creation serializes on normalized email; an unclaimed Client project prevents internal-User creation.
- Out-of-band token-issuer deactivation, role change, or version change makes acceptance unavailable; the current operator-controlled sole active Super Admin can explicitly resend and become issuer of the rotated generation.
- Transaction/audit failures roll back invitation/User mutations.
- Raw token and password are absent from persisted documents, audit events, logs, thrown error serialization, and DTOs.
- Concurrent create/promote attempts cannot establish a second Super Admin, and concurrent demote/deactivate attempts cannot remove the sole active Super Admin.

### Backend authorization and API tests

- All four invitation permissions belong only to Super Admin.
- The operation registry contains exactly the four new authenticated routes once and preserves middleware order.
- Admin and every other role receive 403 before service entry on protected invitation routes.
- Public inspect/accept have rate limiting before validation and no JWT requirement.
- Strict schemas reject Client and Super Admin targets, missing name/email/role/mobile, title or other extra fields, malformed versions, weak/mismatched passwords, and invalid token shapes.
- User creation and mutation services plus the partial unique User index reject a second Super Admin; every application mutation targeting the sole Super Admin is rejected without writes or audits.
- The user-directory contract returns all canonical `filterRoles`, excludes `super_admin` from `manageableRoles`, rejects direct destination bypass, and treats the sole Super Admin row as immutable.
- The canonical role contract keeps internal code `finance_head` while returning the Finance Manager label, and keeps `site_manager` / Site Manager for the requested Executive Manager role.
- Presentation-status filters implement the six exact status values; Pending includes internally invalidated unexpired rows, and Delivery Failed is derived without leaking delivery internals into token validity.
- Unknown, expired, revoked, accepted, superseded, and wrong-generation tokens have equivalent public status/body/header behavior.
- Every public inspect/accept response, including success, schema failure, rate limiting, and generic unavailability, carries `Cache-Control: no-store`.
- Malformed, unknown, terminal, expired, and invalidated tokens invoke zero bcrypt work.
- Create/resend/revoke bodies and DTOs contain only the documented fields.
- SMTP success/failure/timeout and stale-generation completion are characterized without token leakage.
- Completely absent delivery configuration disables create/resend with no mutation, while partial or invalid configuration fails production startup.
- Actor/IP and per-recipient invitation delivery limits prevent duplicate mail while public invitation limits remain isolated from login/signup limits.
- Concurrent create/resend recipient-cooldown checks serialize under `EmailCoordination`, derive the latest persisted issue time across invitation history, and reject the loser without invitation, audit, or mail writes.
- `/auth/client-signup`, login, `/auth/me`, authorization snapshots, and the complete current protected-operation registry remain compatible after adding the four invitation operations.

### Frontend tests

- Super Admin sees Invite user and pending invitations; Admin does not render them or issue invitation GETs.
- The directory role filter uses `filterRoles`, mutation dialogs use `manageableRoles`, no destination offers Super Admin, and the sole Super Admin row has no mutation action or PATCH call.
- Server-provided role options excluding Client and Super Admin are used exactly.
- Name, email, role, and mobile are all required; the create request contains exactly those four fields and no title.
- Finance Manager appears on every frontend role surface for `finance_head`, including workspace titles; static checks reject stale user-facing `Finance Head` strings while allowing stable internal identifiers such as `finance-head@lisno.example`.
- Create, resend, and revoke send literal versioned bodies once with no optimistic state or automatic mutation retry.
- SMTP failed/queued/sent states and expiry are accessible and non-secret.
- Pending, Delivery Failed, Expired, Revoked, Superseded, and Accepted presentations are covered; a rare internally invalidated generation remains Pending with a current-link-unavailable resend hint.
- Server-derived actions show Resend/Revoke for eligible pending rows, Revoke only with a generic hint after email ownership/reservation changes, and no actions for terminal history; stale snapshots still rely on server rejection.
- Missing production delivery configuration surfaces `INVITATION_DELIVERY_UNAVAILABLE`, preserves entered form data, does not retry automatically, and exposes no token or link.
- Under React StrictMode, the fragment token is retained in component memory, removed with router history state preserved before the first invitation API call, and absent from history, storage, logs, cache keys, and rendered DOM.
- Invalid/expired/invalidated/revoked/accepted/superseded links render equivalent generic UI.
- Password confirmation, error association, focus, pending-close blocking, live announcements, and keyboard flow are covered.
- Successful acceptance creates no frontend session and routes to normal login.
- Existing authenticated session cannot be silently replaced by invitation acceptance.
- Real/non-reserved Client signup and Client portal regression suites remain green; reserved-demo denial has its own exact regression.
- Axe and responsive tests cover the Super Admin invitation UI and public acceptance page.

### Full verification

- Backend and frontend focused suites.
- Real Mongo replica-set race suites.
- Backend and frontend typechecks and production builds.
- Full backend and frontend suites from a clean worktree.
- Static searches for destructive bootstrap coupling, raw-token logging/storage, Client/Super-Admin invitation options, stale user-facing `Finance Head` strings, and invitation-driven project/assignment route, model, or UI expansion.
- Independent authorization/security review before completion.

## Migration and compatibility

This is an additive schema change. Deployment creates the `UserInvitation` collection and indexes, adds the partial unique Super Admin role index, and adds User `accountKind` with runtime/default value `standard`. Index setup refuses existing duplicate Super Admin rows for explicit operator remediation. No production User, project, grant, access request, Client, or workflow row is backfilled or rewritten. Exact legacy seed IDs/emails remain the compatibility denial for copied rows that predate `accountKind`.

Existing real Users continue to log in and retain their roles, versions, assignments, grants, and audit history. Invitation acceptance creates ordinary Users compatible with the existing directory and role-update service. Pending invitations remain separate and never appear as directory Users.

The Finance Manager change is presentation-only: stored Users and authorization checks retain role code `finance_head`. The requested Executive Manager uses the already stored `site_manager` code and Site Manager label. Neither change requires a User data migration.

The public/admin User DTO whitelists do not expose `accountKind`. The explicit full-reset seed marks its dummy Users as development demo, while automatic startup inserts or canonically repairs only the selected 16 rows, including setting their marker when required.

The authorization policy version and permission catalog change, so backend and frontend must be deployed as one compatible release. Existing JWTs do not embed permission arrays and remain subject to current User reload; a refreshed authorization snapshot receives the new policy version.

The existing destructive seed remains an explicit local tool. The normal local path becomes non-destructive and requires only `npm run dev` with the already documented local Mongo replica set and `lisno_demo` URI.

Existing project-initiation behavior remains unchanged. The invitation role determines authorization eligibility only; it does not assign a project, create an Admin-initiator grant, assign an Estimator, or activate dormant Procurement, Finance, Execution, or Worker workflows.

## Known boundary conditions

- The sole real production Super Admin must be provisioned by an operator before invitations can be sent.
- SMTP provides delivery, not proof that the human controls the address after acceptance; the one-time link is the possession proof for this scope.
- The SMTP provider necessarily receives email content containing the raw invitation link. Application persistence and logging still must not retain it.
- Catalog-owned fields on an exact reserved local demo account are intentionally repaired on restart so the documented credentials remain usable; non-catalog User fields and all other collections are preserved.
- If Client signup claims an invited email first, the invitation becomes unusable but is not silently converted to a Client or staff account.
- This work does not fix the existing production blocker around unverified Client-email project claiming.

## Acceptance criteria

The design is complete when all of the following are true:

- A developer with the documented local Mongo replica set can run `npm run dev` and log in through all 16 canonical role accounts without running seed.
- That startup changes no unrelated data and listens only on loopback.
- The same demo identities and locally issued demo JWTs are rejected by a normal remote/default backend.
- The sole Super Admin can invite, list, resend, and revoke every canonical staff/trade role except Client and Super Admin, while Admin cannot.
- Name, email, role, and mobile are mandatory invitation inputs; title and unknown fields are rejected, and acceptance copies those four invited identity fields into one active standard User.
- Application services and the database prevent a second Super Admin, and application APIs cannot demote or deactivate the sole Super Admin.
- Every human-facing role label shows Finance Manager for `finance_head`; the requested Executive Manager is represented by `site_manager` / Site Manager without a new role code.
- A current invitation link can be accepted once within 24 hours, creates one active real User, and then requires normal login.
- Resend, revoke, supersede, expiry, duplicate acceptance, SMTP failure, and Client-signup races fail safely and do not leak token/password data.
- The Client signup, login, and email-based project-linking behavior remains functionally unchanged for real, non-reserved Client identities; exact demo identities remain the documented security exception.
- No project or assignment behavior is introduced or changed by the invitation feature.
- All focused, concurrency, full-suite, typecheck, build, scope, and independent review gates pass from a clean worktree.

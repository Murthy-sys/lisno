# Local Demo Accounts and Real Staff Invitations Design

**Date:** 2026-08-18
**Status:** Approved in chat; written-spec review pending
**Phase:** Post-Prompt 1 identity provisioning extension; Prompt 2 remains not started

**Related:** [Prompt 1 RBAC foundation design](./2026-08-17-prompt-1-rbac-foundation-design.md), [Prompt 1 route-operation matrix](./2026-08-17-prompt-1-route-operation-matrix.md), and [Prompt 1 implementation report](../../../PROMPT_1_IMPLEMENTATION_REPORT.md)

## Goal

Make one selected canonical account for every documented role usable during normal local development without requiring a destructive seed command, while adding a production-safe way for Super Admin to invite real non-Client users who can authenticate against a remotely deployed backend.

The two account classes must remain deliberately separate:

- local demo accounts are known, disposable identities that work only in a validated loopback development environment;
- invited staff are real persisted users created through a one-time invitation and may sign in from any supported frontend against the deployed backend.

Client signup, Client authentication, and the existing normalized-email project-linking flow remain unchanged for every real, non-reserved Client identity. The only Client-path exception is the approved security rule that exact reserved demo identities are inert outside validated local development. This work does not start Prompt 2 or implement project initiation, staff project assignment, or any later module workflow.

## Context

Prompt 1 introduced the 16-role authorization catalog and local seed credentials. Today those credentials work only after an explicit, destructive `npm run seed`, and the development server may bind beyond loopback. The seed command resets 13 collections and is not suitable as an automatic startup action.

Prompt 1 intentionally deferred real staff provisioning. The existing Admin/Super Admin user screen can list and update existing accounts, but it cannot create one. The only public account-creation route is Client signup, which always creates role `client` and links unclaimed projects by normalized Client email.

This design closes those two provisioning gaps without combining them:

1. `npm run dev` non-destructively ensures one reserved account for each role in an exact local demo database and binds the development API to loopback.
2. An authenticated Super Admin sends a one-time email invitation. Accepting it transactionally creates a real non-Client User.

## Approved product decisions

| Decision | Approved outcome |
|---|---|
| Normal local use | Running `npm run dev` is sufficient to make the canonical demo logins available. No seed command is required for normal development. |
| Seed command | Keep `npm run seed` only as an explicit, opt-in full local reset. Automatic startup must never call its destructive reset helpers. |
| Demo scope | Ensure one canonical demo account for every one of the 16 roles. |
| Demo safety | Demo accounts work only with a validated loopback development backend and the exact allowlisted local demo database. |
| Remote behavior | A deployed/default backend neither creates nor authenticates a reserved demo identity, even if demo User rows or a previously issued demo JWT were copied to that database. |
| Real staff provisioning | Super Admin invites real users by email; Admin cannot invite users. |
| Invitable roles | Super Admin may invite every role except `client`, including another Super Admin. |
| Client behavior | Real, non-reserved Client signup, login, and project linking remain on the existing path and do not use staff invitations. Exact reserved demo identities are denied remotely. |
| Account timing | Store a separate invitation first. Do not create a User until the invitation is accepted. |
| Delivery | Send provider-neutral SMTP email containing a public frontend invitation link. |
| Token | Use a random 256-bit, single-use token. Store only its SHA-256 hash. |
| Lifetime | Each issued token expires 24 hours after issue. |
| Replacement | A newly created invitation for the same email supersedes the older pending invitation. Resend rotates the token and invalidates the prior link. |
| Password | The invitee chooses and confirms a 12–128 character password. Persist a bcrypt cost-12 hash only. |
| Invitation controls | Super Admin can list pending invitations and can resend or revoke them with optimistic concurrency. |
| Successful acceptance | Create an active real User, consume the invitation, and direct the person to normal login. Do not create an authenticated session automatically. |
| First production Super Admin | Remains an operator-controlled deployment prerequisite. The invitation feature cannot bootstrap its own first privileged actor. |

## Scope

### Included

- A canonical reserved-demo identity registry containing exactly one identity per role.
- Non-destructive, idempotent local demo-account creation before the development server listens.
- Loopback-only development HTTP binding and strict local Mongo target validation.
- Default denial of reserved demo identities in login and JWT authentication outside the validated local development path.
- A separate `UserInvitation` persistence model, indexes, repository contracts, and memory/Mongo parity.
- Super-Admin-only invitation list, create, resend, and revoke APIs.
- Public invitation inspect and accept APIs with rate limiting and generic terminal errors.
- SMTP configuration, delivery adapter, safe delivery status, and an invitation email template.
- A public invitation-acceptance page and Super Admin invitation controls within the existing user-administration screen.
- Permission catalog, authorization snapshot, route registry, audit catalog, and frontend contract updates.
- Concurrency, non-disclosure, security, integration, accessibility, and full regression verification.
- Documentation for local credentials, optional full reset, SMTP deployment configuration, and first-Super-Admin prerequisites.

### Excluded

- Creating, inviting, or changing Clients through the staff invitation flow.
- Email verification or any modification of `/auth/client-signup` and its project-claim behavior for real, non-reserved identities; exact reserved demo email denial is the sole exception.
- General password reset, forgotten-password, magic-link login, SSO, MFA, or invitation-based automatic login.
- Admin-issued temporary passwords or displaying any password to Super Admin.
- Admin invitations, self-service staff signup, bulk import, CSV upload, or domain-based auto-enrollment.
- Production creation of the first Super Admin.
- Project initiation, estimator assignment, worker assignment, or any Prompt 2+ lifecycle behavior.
- An email job queue, scheduled invitation expiry worker, provider webhooks, or a general notification platform.
- Deleting or rewriting unrelated local data during automatic demo-account preparation.

## Approaches considered

### 1. Continue requiring the destructive seed and add temporary staff passwords

This would reuse existing code and produce accounts quickly. It would still make normal local login depend on a command that deletes project and workflow data, and it would require Super Admin to transmit reusable passwords. It was rejected.

### 2. Make the known demo accounts available on every backend

This would make demos easy on remote environments, but a public Super Admin password and known development JWT configuration would become a deployed-backend entry point. Environment variables and CORS are not adequate security boundaries for those accounts. It was rejected.

### 3. Separate local demo bootstrap from real invitation provisioning — selected

Local startup gets a narrowly authorized, users-only bootstrap that cannot run remotely. Production staff use a separate one-time invitation record and choose their own password. This adds more code than the first option, but it establishes the required security boundary and preserves the existing Client lifecycle.

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
  -> real non-Client User + consumed invitation
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
| Finance Head | `finance-head@lisno.example` | `user-finance-head` |
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

The explicit seed command remains available when a developer intentionally wants a complete local reset. It retains its existing opt-in flags and destructive warning; it is not part of normal startup.

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

Only `super_admin` receives these permissions. Admin retains its existing operational-user update boundary but receives no invitation permission and sees no invitation controls or invitation API data.

The target role may also be `super_admin`; “Super-Admin-only” describes the actor boundary, not a restriction on the invited target. Every service mutation reloads the current actor and requires it to remain active with stored role `super_admin`, even after route middleware has passed.

Each token generation captures the issuing Super Admin's User ID and version. Inspect and accept require that User to remain active, remain `super_admin`, and retain the exact captured version. Any role/active update increments User version and permanently invalidates that generation without an unbounded bulk invitation mutation. Another active Super Admin can explicitly resend the stored pending invitation, rotating the token and capturing the new issuer/version. The existing last-active-Super-Admin invariant and user-administration response remain unchanged.

The authorization policy version becomes `2026-08-18.staff-invitations.v1`, and the permission catalog grows from 91 to 95 exact codes. Backend/frontend contract parity tests cover both. These four authenticated operation keys are added, bringing the human-JWT route registry from 93 to 97 exact operations:

```text
GET /admin/user-invitations
POST /admin/user-invitations
POST /admin/user-invitations/:invitationId/resend
POST /admin/user-invitations/:invitationId/revoke
```

The two public invitation routes are explicitly asserted to have rate limiting and validation but no human-JWT operation marker. The existing 18-entry permission/presentation frontend registry is unchanged because the Super Admin controls stay on `/admin/users`; `/accept-invitation` is a separate public route.

### UserInvitation record

`UserInvitation` is additive and separate from `User`. A pending invitation has no login capability, role permissions, project access, or User ID.

Required persistence fields:

- `id`
- invited `name`
- original display `email` and canonical `emailNormalized`
- `role`, validated as any canonical role except `client`
- nullable `title`
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

The eventual User takes name, normalized email, role, and title only from the stored invitation. Acceptance input cannot supply or override them. The invitation and audits retain the inviter relationship; it is not copied into the current User schema. The created User has `accountKind: standard`, `mobile: null`, `address: null`, `managerId: null`, no authorized Client IDs, no access grants, and no assignments. Later workflow-specific assignment remains outside this scope.

Effective status follows one total precedence rule. A terminal stored status (`accepted`, `revoked`, or `superseded`) is returned as stored. Otherwise the record is stored pending: return `invalidated` when the token issuer ID/version/active-Super-Admin check fails; else return `expired` when `expiresAt <= now`; else return `pending`. There is no expiry cron and no TTL deletion because invitation history is retained for review and audit.

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
| Revoke | Current stored `pending`, including derived expired | Record becomes `revoked`, clears its hash, and cannot be inspected or accepted. |
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

The public frontend sends `Referrer-Policy: no-referrer` for the acceptance route. SMTP click tracking is disabled. Recipient/name/title values are passed through the mail library's address APIs and HTML-escaped templates; CR/LF header injection is rejected.

### Invitation creation

The create service transaction performs these steps in order:

1. Acquire the existing authorization/user-administration coordination lock, then reload and authorize the active Super Admin.
2. Validate a non-Client canonical role and strict name/email/title bounds.
3. Reject the reserved demo identity set.
4. Acquire the existing normalized-email coordination lock.
5. Recheck that no User already owns the email and no unclaimed Client project uses it.
6. Recheck and supersede any currently pending invitation for the email.
7. Create the new pending invitation with a hashed token, 24-hour expiry, the creating Super Admin's current User ID/version as token issuer, queued delivery, and null delivery telemetry fields.
8. Append invitation-created and, when applicable, invitation-superseded audits in the same transaction.
9. Commit before attempting external SMTP delivery.

The user is not created at this stage. Double submission is blocked in the UI; server concurrency still guarantees one pending invitation per email and treats the newest committed invitation as authoritative.

Invitation input bounds are exact: trimmed name 1–120 characters; invitation-specific normalized email at most 254 characters using the existing email normalization; canonical non-Client role; optional trimmed title 1–120 characters, with blank title omitted. The stricter invitation bounds do not modify the shared Client signup schema.

Create and resend share a bounded actor-plus-IP rate limiter and a persisted one-minute per-recipient delivery cooldown. The initial limits are 20 invitation delivery attempts per actor/IP per 15 minutes and no more than one issued token for an email per minute. The limiter runs after authentication/permission checks and before mutation. Before any mailer call, the invitation service applies the full demo predicate—account marker OR reserved ID OR reserved normalized email. A demo Super Admin may use only an explicitly injected local/test sink; the service never invokes the real SMTP adapter for that actor. This prevents both marked and legacy public local credentials from becoming an outbound mail relay without trusting presentation fields inside the mailer.

Create is intentionally not transport-idempotent: a second committed POST is a new invitation and supersedes the first. The frontend never automatically retries create or resend. Rate limits and the cooldown bound an ambiguous lost-response retry.

### Resend and revoke

Resend requires the immutable invitation ID and current version. It first performs a non-authoritative ID pre-read outside the transaction to discover normalized email. Inside the transaction it acquires the authorization coordination lock, then the email coordination lock, then authoritatively reloads exact ID/version/stored-pending status before any CAS. It reauthorizes Super Admin, rechecks that no User or unclaimed Client project now owns/reserves the email, rotates token generation/hash/expiry, and captures the resending Super Admin's current ID/version. It resets delivery to queued and clears `deliveryAttemptedAt`, `sentAt`, and `deliveryFailureCode`. The previous token becomes invalid at commit, before SMTP is called.

Revoke also performs a non-authoritative ID pre-read to discover email, then acquires authorization followed by email coordination inside the transaction before authoritatively reloading exact ID/version/stored-pending status. It clears the hash, records the actor/time, and audits in the same transaction. Revocation never deletes a User and is unavailable after acceptance.

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

The API returns the persisted invitation and its delivery state even when SMTP fails because the invitation was committed. Super Admin sees `Delivery failed` and may resend. No raw token is returned as a fallback. If the process exits after commit but before delivery, the row remains queued and can be resent.

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
8. creates one active standard User with the invitation's name, email, role, and optional title, default version 1, and no Client project linkage;
9. compare-and-swap marks the invitation accepted, clears its hash, and records the new User ID;
10. appends invitation-accepted and invited-user-created audits without password or token data;
11. commits both records atomically.

Client signup already takes the same normalized-email coordination lock. Therefore concurrent Client signup and staff invitation acceptance serialize:

- if invitation acceptance wins, later Client signup receives the existing account response and links no projects;
- if Client signup wins, invitation acceptance returns the generic unavailable response and creates no staff User;
- the Client signup schema, Client role, response envelope, and existing `linkUnclaimedProjectsToClient` transaction remain unchanged.

An invitation does not reserve its email against public Client signup. This is an explicit compatibility decision: `/auth/client-signup` does not query `UserInvitation` or change its response behavior for real, non-reserved identities. The first committed User wins. If Client signup wins, the invitation remains pending but unusable until Super Admin revokes it; create and resend correctly refuse an email that now belongs to a User. Public inspect/accept returns the generic unavailable response.

Invitation create and resend also check for an existing unclaimed Client project under the same coordination lock and reject rather than emailing a staff link. Acceptance repeats that check transactionally. Project creation itself remains unchanged: if an unclaimed Client project appears after invitation delivery, acceptance becomes unavailable, preserving the email for Client signup rather than converting it into an internal account.

Invitation acceptance never calls the Client project-linking helper. Staff invitation creation rejects role `client`. This invitation system does not resolve the separately documented risk of claiming projects by an unverified Client email.

## API contract

All bodies and queries are strict. IDs in paths are encoded by the frontend. All invitation DTOs are explicit whitelists and exclude token hashes, raw tokens, passwords, provider responses, and credential fields.

### Protected Super Admin routes

#### `GET /api/v1/admin/user-invitations`

Canonical query order is `search`, `role`, `status`, `deliveryStatus`, `limit`, `offset`. Invitation `status` accepts `pending`, `expired`, `invalidated`, `accepted`, `revoked`, or `superseded`; `deliveryStatus` separately accepts `queued`, `sent`, or `failed`. Omitting `status` defaults server-side to actionable stored-pending rows, with each item presented as pending, expired, or invalidated. Pagination follows the existing `{items, pagination}` envelope.

The response also includes `invitableRoles`, supplied by the server and containing every canonical role except `client`. Each row contains only:

- ID, invited name/email/role/title;
- effective invitation status;
- invited-by public identity;
- issued/expiry timestamps;
- safe delivery status, attempted time, and SMTP-accepted time;
- optimistic version and created/updated timestamps.

The response never includes token material or a reconstructed invitation link.

#### `POST /api/v1/admin/user-invitations`

Exact body:

```json
{
  "name": "Real User",
  "email": "person@example.com",
  "role": "designer",
  "title": "Senior Designer"
}
```

`title` is optional and otherwise omitted. The endpoint returns `201` with the redacted invitation DTO after the bounded delivery attempt. A failed SMTP attempt still returns the created row with `deliveryStatus: "failed"`.

#### `POST /api/v1/admin/user-invitations/:invitationId/resend`

Exact body: `{ "version": 2 }`. Returns `200` with the updated redacted invitation after delivery attempt.

#### `POST /api/v1/admin/user-invitations/:invitationId/revoke`

Exact body: `{ "version": 2 }`. Returns `200` with the revoked redacted invitation.

### Public routes

Both public routes use a dedicated invitation-public rate limiter before token/body validation so attack traffic cannot consume the login/Client-signup limiter. Its initial bound is 20 attempts per socket IP per 15 minutes with the existing bounded-entry eviction behavior. They return HTTP `410` with the same `INVITATION_UNAVAILABLE` code, message, headers, and no-store cache policy for unknown, malformed, expired, invalidated, revoked, accepted, superseded, wrong-generation, email-claimed, unclaimed-Client-project, or otherwise unavailable tokens.

#### `POST /api/v1/auth/user-invitations/inspect`

Exact body: `{ "token": "..." }`.

The token input must be exactly 43 base64url characters, the encoding length of 32 bytes. Token-shape failures are mapped to the same `410 INVITATION_UNAVAILABLE` response as lookup/state failures rather than the general schema-error envelope.

For a valid current token, returns only the invitation's name, email, role, optional title, and expiry. It does not consume or extend the token.

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
- Terminal resend/revoke: `INVITATION_NOT_ACTIONABLE`.
- Unknown protected invitation ID: the existing generic `404 NOT_FOUND` response.
- SMTP failure after commit: successful invitation mutation response with safe `failed` delivery state, not a raw provider error.
- Missing or invalid production SMTP/public-URL configuration: backend startup fails before listening.

## Frontend experience

### Super Admin user administration

The existing `/admin/users` page remains the entry point. Its existing user directory and one-field mutation dialog remain intact.

For a snapshot with `identity.user_invitations.read` and role `super_admin`, the page additionally renders:

- an **Invite user** button, gated by `identity.user_invitations.create`;
- a **Pending invitations** section showing email, role, inviter, expiry, and safe delivery state;
- **Resend** gated by `identity.user_invitations.resend`;
- **Revoke** gated by `identity.user_invitations.revoke`.

Admin receives none of these permissions, does not call the invitation API, and sees the current directory behavior only. Role choices come from server-provided `invitableRoles`, not a frontend-created allow list. The Client role never appears.

The create dialog contains name, email, non-Client role, and optional title. It has no password field, temporary-password output, Client project control, assignment control, or impersonation action. Pending submission blocks duplicate actions and dialog dismissal.

Resend and revoke use the row's immutable ID and version. A `VERSION_CONFLICT` invalidates/refetches, keeps the selected redacted snapshot, disables stale replay, and requires another explicit action. Create/resend success announces whether delivery is sent, queued, or failed without exposing a token. Revoke success removes the item from the actionable list after server refetch.

### Public acceptance page

`/accept-invitation` is a public route outside the authenticated permission registry. It does not alter the existing login and Client signup routes.

The page:

1. reads and immediately removes the fragment token;
2. calls inspect without caching the raw token;
3. shows the invited email, role label, optional title, and expiry for a valid invitation;
4. accepts and confirms a 12–128 character password;
5. calls accept once and never retries a mutation automatically;
6. on success shows that the account is ready and links to normal login;
7. never stores or installs a JWT automatically.

Unavailable states use one stable message that does not distinguish invalid, expired, revoked, already used, or superseded. The page offers a link back to login and tells the person to contact their administrator for a new invitation.

If the browser already has an authenticated session, the acceptance page does not replace it. It requires the current user to sign out before submitting a different account's invitation, preventing an accidental account switch.

Dialog and page controls reuse the current design system, focus trap, pending-state protection, live announcements, responsive behavior, and accessible error association. Invitation state and delivery state are conveyed in text rather than color alone.

## Configuration and deployment

Production invitation delivery requires:

- `PUBLIC_FRONTEND_URL`, an HTTPS origin with no credentials, query, or fragment;
- `SMTP_HOST` and positive integer `SMTP_PORT`;
- `SMTP_TLS_MODE`, exactly `implicit` or `starttls`, with certificate verification required in both modes;
- `SMTP_USERNAME` and `SMTP_PASSWORD`;
- `SMTP_FROM`, parsed as one validated mailbox with no CR/LF characters.

SMTP connection and send operations use fixed bounded ten-second timeouts. The environment changes update `backend/.env.example`, the root README, and backend deployment documentation together. Production environment parsing treats any missing or partial invitation delivery configuration as fatal before Mongo connection/listen. Secrets are never printed in readiness or error output.

Development and tests use an injected mailer. They do not silently print raw invitation links. A developer who wants to test real local delivery supplies explicit SMTP configuration; otherwise the injected/local adapter records a safe failed or test-only delivery state without exposing the token in logs.

Deployment prerequisites are:

1. provision one real initial Super Admin through the existing operator-controlled process;
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

### Invitation persistence and concurrency tests

- Model validation and every required index are exact.
- Memory and Mongo repositories agree on create, list, CAS, status derivation, and redacted mapping.
- Only one stored pending invitation exists per normalized email.
- A new invite supersedes the prior pending row and token atomically.
- Resend rotates hash/generation/expiry and invalidates the old token before delivery.
- Accept succeeds exactly once and creates exactly one User.
- Parallel accepts yield one success and one generic unavailable result.
- Client signup versus staff acceptance yields one User and never links staff as a Client.
- Matching unclaimed Client projects prevent invitation create/resend/accept without changing those project rows.
- Revoke versus accept, resend versus accept, create versus resend, and stale SMTP completion races cannot revive or retarget an invitation.
- Invitation create/resend/accept versus project creation serializes on normalized email; an unclaimed Client project prevents internal-User creation.
- Token-issuer demotion/deactivation versus acceptance serializes; the captured version becomes invalid and cannot create a User until another active Super Admin explicitly resends.
- Transaction/audit failures roll back invitation/User mutations.
- Raw token and password are absent from persisted documents, audit events, logs, thrown error serialization, and DTOs.

### Backend authorization and API tests

- All four invitation permissions belong only to Super Admin.
- The operation registry contains exactly the four new authenticated routes once and preserves middleware order.
- Admin and every other role receive 403 before service entry on protected invitation routes.
- Public inspect/accept have rate limiting before validation and no JWT requirement.
- Strict schemas reject Client role, unknown roles, extra fields, malformed versions, weak/mismatched passwords, and invalid token shapes.
- Unknown, expired, revoked, accepted, superseded, and wrong-generation tokens have equivalent public status/body/header behavior.
- Malformed, unknown, terminal, expired, and invalidated tokens invoke zero bcrypt work.
- Create/resend/revoke bodies and DTOs contain only the documented fields.
- SMTP success/failure/timeout and stale-generation completion are characterized without token leakage.
- Actor/IP and per-recipient invitation delivery limits prevent duplicate mail while public invitation limits remain isolated from login/signup limits.
- `/auth/client-signup`, login, `/auth/me`, authorization snapshots, and all 97 protected operation registrations remain compatible.

### Frontend tests

- Super Admin sees Invite user and pending invitations; Admin does not render them or issue invitation GETs.
- Server-provided non-Client role options are used exactly.
- Create, resend, and revoke send literal versioned bodies once with no optimistic state or automatic mutation retry.
- SMTP failed/queued/sent states and expiry are accessible and non-secret.
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
- Static searches for destructive bootstrap coupling, raw-token logging/storage, Client invitation options, and any Prompt 2 route/model/UI work.
- Independent authorization/security review before completion.

## Migration and compatibility

This is an additive schema change. Deployment creates the `UserInvitation` collection and indexes and adds User `accountKind` with runtime/default value `standard`. No production User, project, grant, access request, Client, or workflow row is backfilled or rewritten. Exact legacy seed IDs/emails remain the compatibility denial for copied rows that predate `accountKind`.

Existing real Users continue to log in and retain their roles, versions, assignments, grants, and audit history. Invitation acceptance creates ordinary Users compatible with the existing directory and role-update service. Pending invitations remain separate and never appear as directory Users.

The public/admin User DTO whitelists do not expose `accountKind`. The explicit full-reset seed marks its dummy Users as development demo, while automatic startup inserts or canonically repairs only the selected 16 rows, including setting their marker when required.

The authorization policy version and permission catalog change, so backend and frontend must be deployed as one compatible release. Existing JWTs do not embed permission arrays and remain subject to current User reload; a refreshed authorization snapshot receives the new policy version.

The existing destructive seed remains an explicit local tool. The normal local path becomes non-destructive and requires only `npm run dev` with the already documented local Mongo replica set and `lisno_demo` URI.

Prompt 2 remains not started. The invitation role determines authorization eligibility only; it does not assign a project, create an Admin-initiator grant, assign an Estimator, or activate dormant Procurement, Finance, Execution, or Worker workflows.

## Known boundary conditions

- A real first production Super Admin must exist before invitations can be sent.
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
- Super Admin can invite, list, resend, and revoke every non-Client role, including Super Admin, while Admin cannot.
- A current invitation link can be accepted once within 24 hours, creates one active real User, and then requires normal login.
- Resend, revoke, supersede, expiry, duplicate acceptance, SMTP failure, and Client-signup races fail safely and do not leak token/password data.
- The Client signup, login, and email-based project-linking behavior remains functionally unchanged for real, non-reserved Client identities; exact demo identities remain the documented security exception.
- No Prompt 2+ project or assignment behavior is introduced.
- All focused, concurrency, full-suite, typecheck, build, scope, and independent review gates pass from a clean worktree.

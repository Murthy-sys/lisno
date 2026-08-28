# Self-Service Password Reset — Design Specification

## 1. Decision summary

### Requested outcome

Add a **Forgot password** workflow so any eligible Lisno User can recover access
through the email address already stored on the account and choose a new password.

“Any user” means every active, real `standard` User across every role, including
Clients, staff, workers, Admins, and the sole Super Admin. Role membership does not
grant or restrict self-service recovery.

Inactive Users, reserved development-demo identities, and pending invitations are
not eligible. They receive the same public response as an unknown email and require
an administrator or invitation workflow to regain access.

### Recommended approach

Add a separate, versioned `PasswordResetRequest` aggregate modeled on Lisno's staff
invitation flow:

1. the public request endpoint always gives an account-neutral response;
2. an eligible request creates one short-lived, single-use reset token whose digest,
   never raw value, is stored;
3. the reset link carries the token in the URL fragment and the frontend removes it
   before making an API call;
4. reset completion atomically changes the password, consumes the token, increments
   the User and session versions, and writes a safe audit event; and
5. all JWTs issued before the reset become invalid immediately.

The existing SMTP configuration, isolated TLS transport, public frontend origin,
repository transaction boundary, audit sanitization, and accessible invitation-page
patterns are reused.

### Fixed product decisions

- Email link is the only recovery method in this scope.
- The reset password policy remains 12–128 characters and uses bcrypt cost `12`.
- Reset links expire 30 minutes after issuance.
- A successful reset does not automatically sign the User in.
- A successful reset invalidates all existing sessions automatically.
- No administrator can view, choose, retrieve, or reset another User's password.
- The workflow does not change User ID, email, role, active state, account kind,
  assignments, project access, or financial/workflow data.

## 2. Current behavior and verified evidence

### Authentication

- `POST /api/v1/auth/login` is the only password-authentication entry point.
- Login already uses a dummy bcrypt hash and one generic invalid-credentials response
  for unknown, inactive, and wrong-password cases.
- Passwords for signup and invitation acceptance use bcrypt cost `12`.
- Production JWTs expire after 15 minutes.
- JWTs currently contain User ID and role but no credential/session version.
- Authentication reloads the current User and rejects missing, inactive, or
  role-changed Users, but changing only `passwordHash` would leave an existing JWT
  valid until its expiry.
- No refresh-token, server-session, password-reset, or credential-version facility
  exists.

### Reusable one-time-token and mail behavior

- Staff invitations use 32 cryptographically random bytes encoded as base64url.
- Only SHA-256 token digests are persisted.
- Invitation tokens have versioned pending/terminal states, expiry, CAS checks,
  recipient cooldown, audit events, and replica-set concurrency coverage.
- Disabled invitation delivery is detected before token generation, persistence, or
  audit writes.
- SMTP uses certificate-validating TLS, isolated connections, bounded timeouts, safe
  provider failure codes, escaped HTML, and disabled file/URL access.
- SMTP configuration already provides a trusted `PUBLIC_FRONTEND_URL`; recovery URLs
  must never be built from the HTTP `Host` header.

### Frontend

- Login uses React Hook Form, Zod, shared `Field`, `Input`, `Button`, `IconButton`, and
  `NoticeBanner` primitives with first-invalid-field focus and accessible busy/error
  announcements.
- Public `/login`, `/signup`, and `/accept-invitation` routes sit outside the
  authenticated App Shell.
- Invitation acceptance already captures a strict fragment token once, scrubs the
  URL with `history.replaceState`, avoids query/storage/log persistence, uses public
  no-store/no-referrer requests, prevents double submission, and handles keyboard,
  focus, responsive, and session-conflict states.

### Current constraints

- Existing IP limiters are process-local and are not a sufficient per-account abuse
  boundary.
- Render proxy/IP attribution has not yet been proven safe for trusting forwarding
  headers.
- The current worktree contains approved, uncommitted Super Admin bootstrap changes.
  Password-reset implementation must preserve and not reformat or overwrite them.

## 3. Goal and measurable outcome

An eligible User who no longer knows their password can:

1. select **Forgot password?** on the sign-in page;
2. submit their account email without the UI revealing whether an account exists;
3. receive a short-lived reset link through the configured email provider;
4. choose and confirm a valid new password; and
5. return to sign-in and authenticate only with the new password.

After reset completion:

- the old password no longer works;
- every JWT issued before the reset is rejected;
- the reset token cannot be inspected or used again;
- identity, role, permissions, assignments, and project/business data are unchanged;
  and
- no token, password, password hash, private link, or provider response is disclosed
  through APIs, audit records, application logs, frontend state, browser storage, or
  rendered content.

## 4. Actors and permission matrix

| Actor or account state | Request link | Complete reset | Result |
|---|---:|---:|---|
| Active `standard` User, any role | Public | Valid token bearer | Allowed |
| Sole active Super Admin | Public | Valid token bearer | Allowed; all sessions invalidated |
| Inactive User | Generic public response | Generic unavailable | No token, mail, or identity change |
| Development-demo/reserved identity | Generic public response | Generic unavailable | No token, external mail, or identity change |
| Unknown email | Generic public response | Not applicable | No token, mail, audit, or User write |
| Pending invitation without a User | Generic public response | Not applicable | Invitation must be accepted or resent |
| Administrator acting for another User | No special authority | No special authority | Cannot view or set the password |

The endpoints are public bearer-token operations. They do not enter the protected
human-JWT route-operation permission registry and must be documented with OpenAPI
`security: []`.

## 5. Scope

### Included

- **Forgot password?** link on sign-in.
- Public password-reset request, inspection, and completion endpoints.
- Generic account-enumeration-safe request response.
- Dedicated public IP rate limiting plus persistent per-User issuance limits.
- Separate password-reset domain rules, persistence model, repository methods, and
  memory/Mongo parity.
- Reset request email and password-changed notification email.
- One current pending token per User, prior-token supersession, delivery telemetry,
  expiry, replay protection, and concurrency-safe completion.
- User `sessionVersion` with legacy value `1`.
- JWT issuance and authentication checks against `sessionVersion`.
- Transactional password update, reset consumption, User/session version changes,
  and safe audit event.
- Public `/forgot-password` and `/reset-password` frontend pages.
- OpenAPI, application-index initialization, local seed cleanup, configuration
  documentation, and focused/full verification.

### Non-goals

- Password change for an already authenticated User who knows the current password.
- Administrator-assigned passwords or password viewing.
- Email-address changes, account recovery without email, support impersonation, or
  security questions.
- MFA enrolment or MFA recovery.
- Automatic login after a reset.
- Refresh tokens, long-lived server sessions, device/session management UI, or a
  general JWT blacklist.
- Account activation/reactivation or invitation acceptance.
- CAPTCHA in the initial release; rate limits and monitoring remain mandatory.
- Changing the existing role/permission model.
- Sending real reset emails, deploying, changing Render/SendGrid settings, migrating
  production data, committing, or pushing without later explicit authorization.

## 6. Public API contract

### `POST /api/v1/auth/password-reset/request`

Strict request:

```json
{ "email": "user@example.com" }
```

Normal response for every syntactically valid address, including unknown, inactive,
reserved, recipient-throttled, queued-delivery, sent-delivery, or provider-failed
outcomes:

```http
202 Accepted
Cache-Control: no-store
```

```json
{ "data": { "accepted": true } }
```

The response must never contain name, normalized email, User ID, role, active state,
account kind, reset ID, token, expiry, delivery status, or provider detail.

When mail is globally disabled, the endpoint returns the same system-level response
for every email without looking up an account or creating token/audit data:

```http
503 Service Unavailable
Cache-Control: no-store
```

```json
{
  "error": {
    "code": "PASSWORD_RESET_DELIVERY_UNAVAILABLE",
    "message": "Password reset is temporarily unavailable."
  }
}
```

This `503` discloses only global service availability, never account existence.

### `POST /api/v1/auth/password-reset/inspect`

Strict request:

```json
{ "token": "opaque-43-character-base64url-token" }
```

Available response:

```json
{ "data": { "available": true } }
```

The inspection response never returns identity or account details. Malformed,
unknown, expired, superseded, completed, replayed, inactive, reserved, or
version-invalid tokens all return:

```http
410 Gone
Cache-Control: no-store
```

```json
{
  "error": {
    "code": "PASSWORD_RESET_UNAVAILABLE",
    "message": "This password reset link is unavailable."
  }
}
```

### `POST /api/v1/auth/password-reset/complete`

Strict request:

```json
{
  "token": "opaque-43-character-base64url-token",
  "password": "new password",
  "passwordConfirmation": "new password"
}
```

- Password is 12–128 characters.
- Confirmation must match exactly.
- Success returns `200 { "data": { "reset": true } }` with no JWT.
- Token/state/version failures use the same `410 PASSWORD_RESET_UNAVAILABLE` response
  as inspection.
- Validation errors use the established field-error envelope without echoing the
  password or token.

All three endpoints:

- strip/ignore browser Authorization credentials;
- use `Cache-Control: no-store` on success and every error;
- apply a dedicated public rate limiter before body validation;
- accept only strict JSON objects;
- never redirect based on input; and
- never log request bodies or private links.

## 7. Data and state contract

### User compatibility

Add `sessionVersion` to the User contract/model:

- new Users default to `1`;
- legacy rows without the field map to `1` without a production backfill;
- login includes `sessionVersion` in newly issued JWTs;
- authentication treats a legacy JWT without the claim as version `1` only; and
- authentication rejects any JWT whose claim differs from the current User value.

The existing administrative `User.version` remains the CAS/source version.
Successful reset increments both `User.version` and `sessionVersion`.

### PasswordResetRequest

The separate aggregate contains only the data needed for security and delivery:

- stable reset ID and User ID;
- captured User version and captured session version;
- SHA-256 token hash, hidden from normal selection;
- token generation;
- issued and expires timestamps;
- stored status: `pending`, `superseded`, or `completed`;
- superseded/completed timestamps and successor ID where applicable;
- delivery state: `queued`, `sent`, or `failed`;
- delivery attempted/sent timestamps and bounded safe failure code;
- CAS version and created/updated timestamps.

It does not store the raw token, password, password hash, email, name, role, JWT,
provider response, or reset URL.

Required indexes:

- unique token hash when present;
- at most one `pending` reset per User;
- User/issued-at lookup for cooldown and daily quota; and
- status/expiry operational lookup.

Indexes are additive and initialize through the established application-index
boundary. No existing collection or index is dropped or synchronized destructively.

### Token rules

- Raw token has 256 bits of cryptographic entropy and is encoded as 43 base64url
  characters.
- Only its SHA-256 digest is used for persistence and lookup.
- Token is linked to exactly one User/reset generation.
- Token expires 30 minutes after issue.
- A newer request supersedes and clears the prior pending token hash atomically.
- Completion clears the current token hash and transitions the record exactly once.
- Expired records are derived as unavailable; destructive retention cleanup is not
  part of this feature.

## 8. Request, delivery, and completion workflow

### Request

1. Reject globally disabled mail before email lookup, token generation, audit, or
   persistence.
2. Validate and normalize the email.
3. Perform the same account-neutral public response path for all valid emails.
4. An eligible User must be active, `standard`, and not a reserved development-demo
   identity.
5. Serialize issuance by normalized email/User.
6. Apply a persisted five-minute recipient cooldown and maximum five issued links
   per rolling 24 hours. Suppression still returns generic `202`.
7. Supersede the prior pending reset, create the new reset, and append a safe
   `password_reset.requested` audit event in one transaction.
8. Commit independently from external SMTP delivery.

### Enumeration-safe delivery

The public response must not wait for SMTP. After the issuance transaction, delivery
is dispatched asynchronously so known and unknown email responses do not reveal
provider latency. The raw token exists only in the bounded in-memory delivery
attempt and is never serialized or persisted.

- Successful delivery updates only the exact reset ID/generation to `sent` and
  appends a safe delivery audit.
- Failure updates only that generation to `failed` with a bounded safe failure code.
- A stale callback cannot overwrite a superseded or completed reset.
- If the process stops after commit but before mail is sent, the queued raw token is
  intentionally unrecoverable. The User can request a new link after cooldown,
  which supersedes the stranded generation. No raw token may be persisted to make
  retry possible.
- The UI never reports delivery state and instructs the User to retry later if no
  email arrives.

This safe-failure tradeoff is preferred over synchronous SMTP timing disclosure or
storing an encrypted/recoverable bearer token in Mongo.

### Completion

1. Hash the proposed password with bcrypt cost `12` before opening the transaction.
2. Discover the reset only by token digest.
3. In one transaction, coordinate the exact User and reset generation.
4. Re-read and require:
   - pending, unexpired, matching token hash;
   - exact reset version/generation;
   - active standard non-demo User;
   - unchanged User version and session version; and
   - unchanged identity link between reset and User.
5. Atomically:
   - replace `passwordHash`;
   - increment `User.version` and `sessionVersion`;
   - clear and consume the reset token;
   - mark the reset completed; and
   - append `password_reset.completed` without secret values.
6. Concurrent completion has one winner; every loser receives generic unavailable.
7. Send a best-effort password-changed notification after commit. Notification
   failure does not roll back the new password; only safe sent/failed telemetry is
   recorded.
8. Do not issue a JWT. The User signs in normally with the new password.

## 9. Session and invitation effects

- Login signs new JWTs with `sessionVersion`.
- Authentication compares the claim with the current User on every protected call.
- Existing legacy JWTs without a claim work only while the User's stored/mapped
  session version is `1`.
- Reset increments the session version, so every old JWT fails immediately and the
  frontend clears it through the existing unauthorized-session path.
- Changing the password does not lock or deactivate the account.
- Resetting the sole Super Admin increments its `User.version`. Staff invitation
  generations issued under the prior Super Admin version consequently become
  unavailable under the existing issuer-version invariant. The Super Admin must
  resend those invitations after signing in again.

This invitation invalidation is an intentional compromise-recovery effect, not a
silent regression.

## 10. Abuse prevention and non-disclosure

- Dedicated process/IP limit: 20 request/inspect/complete attempts per 15 minutes,
  bounded to 10,000 buckets.
- Persistent eligible-recipient controls: one issuance per five minutes and at most
  five per rolling 24 hours.
- Public IP-limit exhaustion may return generic `429 TOO_MANY_ATTEMPTS` with
  `Retry-After`; recipient suppression remains generic `202`.
- Do not trust arbitrary `X-Forwarded-For`. Render's proxy topology or an edge rate
  limiter must be verified before production rollout.
- Unknown/inactive/demo/suppressed requests create no reset, audit, or email.
- Request responses never echo the submitted email.
- Raw token, password, password hash, reset URL, provider response, SMTP credentials,
  and JWT are prohibited from DTOs, audit values, error messages, logs, telemetry,
  frontend state, storage, cache, DOM, and screenshots.
- No account state changes until a valid token is completed; reset-request spam must
  never lock a User out or increment the session/User version.

## 11. UX and content contract

### Sign-in

- Add **Forgot password?** between the Password field and **Sign in** action.
- Link only to literal `/forgot-password`; never carry an external or prior return
  target.
- Keyboard order remains email, password, visibility toggle, forgot-password link,
  sign-in button.

### Forgot-password page

- Public route outside the App Shell with one `main` and one `<h1>Reset your
  password</h1>`.
- One email field using `type="email"` and `autocomplete="email"`.
- Reuse login validation, first-invalid focus, busy button, and live-region patterns.
- After `202`, replace the form with exactly:
  **“If an account exists for that email, we'll send password reset instructions.”**
- Do not echo the email or describe account/delivery state.
- Provide literal **Back to sign in** and **Try another email** actions.
- `503` shows **“Password reset is temporarily unavailable. Please try again
  later.”**
- `429` shows generic retry-later copy without identity detail.

### Reset-password page

- Public `/reset-password#token=...` route outside the App Shell and permission
  registry.
- Capture an exact fragment token once, keep it only in a ref, and immediately scrub
  the fragment with `history.replaceState` before inspection/render side effects.
- Use public POST requests with `cache: no-store` and `referrerPolicy: no-referrer`.
- Never place the token in path/query parameters, router state, React state, TanStack
  keys/cache, local/session storage, DOM, console, error copy, or links.
- Checking state: **Checking your reset link**.
- Missing/malformed/expired/used/superseded/unknown state:
  **Reset link unavailable. This link is invalid, expired, or has already been
  used.**
- Ready state: `<h1>Choose a new password</h1>` with new-password and confirmation
  fields, 12–128 policy, exact-match validation, visibility controls, and first-error
  focus.
- Prevent duplicate inspect and complete calls under React Strict Mode and repeated
  clicks.
- A completion-time race moves to the same generic unavailable state.
- Success: `<h1>Password updated</h1>`, **Sign in with your new password**, and one
  literal `/login` link. No automatic redirect or authentication.

### Existing browser session

- Public inspection may occur, but reset submission is blocked while AuthProvider is
  restoring, authenticated, in error, or signing out.
- Show **Log out to reset password** and remain on the reset route after explicit
  logout.
- This prevents resetting account A while retaining account B's local session and
  prevents the success `/login` link from bouncing to an authenticated workspace.

### Accessibility and responsive behavior

- Every state has one main landmark and one page heading.
- Route/state transitions focus the new heading or announce through an atomic live
  region.
- Controls have accessible names, linked hints/errors, visible focus, and at least
  44px targets.
- The pages reuse the established auth layout at desktop, tablet, 320px mobile, and
  safe-area viewports and respect reduced motion.
- Status is never communicated by color alone.

## 12. Audit and observability

Add safe actions for:

- `password_reset.requested`;
- `password_reset.superseded`;
- `password_reset.delivery_sent`;
- `password_reset.delivery_failed`;
- `password_reset.completed`;
- `password_reset.notification_sent`; and
- `password_reset.notification_failed`.

Permitted audit values are reset ID, User ID, generation/version, expiry, terminal
state, and bounded delivery state/failure code. Email, token/hash, password/hash,
link, JWT, SMTP values, and provider responses are forbidden.

Operational metrics should count request acceptance, suppression, delivery outcome,
unavailable-token completion, successful completion, and rate-limit events without
identity labels.

## 13. Compatibility, rollout, and rollback

### Compatibility

- New collection and User field are additive.
- Existing Users need no backfill because missing `sessionVersion` maps to `1`.
- Existing JWTs without the claim remain valid for version-1 Users until natural
  expiry or password reset.
- Memory and Mongo repository implementations must remain contract-equivalent.
- Local destructive seed cleanup must include password-reset rows.

### Rollout order

1. Deploy frontend `/forgot-password` and `/reset-password` routes first so no email
   can link to a missing page.
2. Deploy backend model/index/session-version support and public APIs.
3. Verify `PUBLIC_FRONTEND_URL`, SMTP TLS, sender, Render proxy behavior, and provider
   click/open tracking settings.
4. Run a non-production mail/link/reset journey before enabling production use.

SendGrid or another provider must not rewrite or track bearer-token links. Provider
click/open tracking must be disabled for password-reset mail before production.

### Rollback

Reverting to authentication code that ignores `sessionVersion` after any reset could
temporarily re-enable a pre-reset JWT for the remainder of its original 15-minute
lifetime. Safe rollback requires one of:

- disable new reset issuance and wait one full JWT lifetime before reverting; or
- rotate `JWT_SECRET`, intentionally signing every User out.

Schema additions can remain during rollback. No destructive down migration is
required.

## 14. Options and tradeoffs

### A. Separate reset aggregate plus `sessionVersion` — recommended

- Matches the existing invitation token/CAS architecture.
- Supports one-time use, history, delivery state, cooldown, replay audits, and
  immediate session invalidation.
- Adds more model/repository/service/test surface, but keeps temporary bearer state
  out of User.

### B. Reset fields directly on User

- Fewer files.
- Mixes temporary token/delivery state into the central identity record, churns User
  state on every unauthenticated request, weakens history, and increases accidental
  token-selection exposure.
- Rejected.

### C. Stateless signed reset JWT

- Avoids a reset collection.
- Cannot provide safe single use, supersession, persistent recipient quotas, or replay
  auditing without server state. Incrementing User version on request would enable
  unauthenticated denial of service.
- Rejected.

### D. Synchronous SMTP before request response

- Closest to the current invitation call pattern and easier to reason about delivery.
- Provider latency makes valid accounts measurably different from unknown accounts,
  enabling timing enumeration.
- Rejected for a public recovery endpoint; asynchronous post-commit delivery is the
  approved safe-failure tradeoff.

## 15. Principal risks

- Render proxy misconfiguration can globally throttle users behind one address or
  permit spoofed forwarding headers.
- Process-local asynchronous delivery can strand a queued token if the process stops;
  raw-token non-persistence intentionally favors secrecy over automatic resend.
- SMTP link rewriting/click tracking can copy bearer tokens outside Lisno.
- Email-account compromise allows account takeover, including the sole Super Admin;
  MFA is outside this scope.
- Resetting the sole Super Admin invalidates older invitation generations and
  requires resend.
- Rollback to pre-session-version authentication can revive an old JWT briefly.
- Public request volume can create email abuse; persistent recipient quotas and
  provider/edge monitoring are required.
- A frontend token leak through history, state, cache, storage, logs, or referrer is a
  credential disclosure and must be regression-tested.

## 16. Acceptance criteria

1. Every active `standard` User role, including Client and Super Admin, can request
   and complete password recovery through the stored email.
2. Unknown, inactive, reserved/demo, and persisted-recipient-throttled requests return
   the same `202` body and headers and disclose no identity or delivery data.
3. Globally disabled mail returns the same `503` for every address before token,
   reset, audit, or email work.
4. Request response timing is independent of SMTP delivery; eligible delivery begins
   only after issuance commits.
5. Tokens have 256 bits of entropy, are digest-only in persistence, expire after 30
   minutes, are tied to one User/generation, and are single use.
6. A new request atomically supersedes the prior pending reset; cooldown/quota races
   cannot create multiple current tokens.
7. Reset completion atomically changes bcrypt password hash, increments User and
   session versions, consumes the reset, and appends a safe audit event.
8. Old password and every pre-reset JWT fail after completion; new password succeeds
   through normal login and reset does not issue a JWT.
9. Concurrent complete/complete, request/request, request/complete,
   complete/deactivate, and complete/role-change races are deterministic and leave no
   partial identity or token state.
10. Password/update/reset/audit failure injection proves transactional rollback.
11. Raw token, token hash, password/hash, email, link, JWT, SMTP secret, and provider
   response never appear in public DTOs, audit values, errors, logs, frontend DOM,
   browser history/state/storage/cache, screenshots, or committed fixtures.
12. Public request/inspect/complete paths use strict validation, no-store, dedicated
   limiting, OpenAPI `security: []`, and no protected permission registry entry.
13. Frontend fragment is removed before inspection; malformed fragments make no API
   call; Strict Mode/repeated actions produce one effective inspect/complete.
14. Frontend provides accessible loading, generic unavailable, validation, transient
   error, session-block, busy, and success states at desktop/tablet/mobile widths.
15. Disabled, failed, successful, stale-callback, and post-commit notification mail
   paths preserve the stated commit-independent behavior without exposing delivery
   state publicly.
16. Existing version-1 Users and legacy JWTs remain compatible until reset; User
   roles, assignments, project access, and business data are unchanged.
17. Super Admin reset invalidates old invitation generations and the effect is covered
   by tests and operator documentation.
18. Mongo replica-set tests verify CAS, unique indexes, one-time consumption, rollback,
   and memory/Mongo parity.
19. Focused and full backend/frontend tests, typechecks, builds, rendered interaction
   and accessibility checks, `git diff --check`, and dirty-worktree review pass.
20. No production migration, real email, deployment, Render/provider change, commit,
   or push occurs without a later exact authorization.

## 17. Assumptions, constraints, and open decisions

The following assumptions become the approved behavior when this specification is
approved:

- “Any user” means any active real `standard` User in any role.
- Inactive/demo identities require administrator handling and remain non-disclosing.
- TTL is 30 minutes; persistent issuance bounds are five minutes and five per 24
  hours; process/IP bound is 20 per 15 minutes.
- Asynchronous post-commit delivery is accepted even though a process stop can strand
  one queued generation.
- All existing sessions are invalidated automatically after reset.
- Super Admin reset intentionally invalidates its older invitation generations.
- Existing SMTP and public frontend origin are reused; no second mail provider is
  introduced.

Technical facts still required before production enablement, not before local
implementation:

- confirm Render's trusted proxy/IP boundary or retain conservative socket-IP
  limiting plus an approved edge control;
- confirm reset-email click/open tracking is disabled in the active provider; and
- complete a non-production end-to-end email/reset test with a disposable real
  mailbox.

Specification approval authorizes only creation of the separate task plan. It does
not authorize implementation, dependency installation, migration, real email,
deployment, production access, commit, or push.

## 18. Standards reference

The design follows the OWASP Forgot Password guidance for consistent account-neutral
responses, uniform response timing, per-account abuse controls, cryptographically
strong single-use expiring tokens, trusted-origin reset URLs, password confirmation,
no automatic login, reset notification, and session invalidation:

- <https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html>
- <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>

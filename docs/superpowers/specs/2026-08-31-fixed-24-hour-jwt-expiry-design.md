# Fixed 24-Hour JWT Expiry Design

## Goal

Issue every new human authentication JWT with a fixed lifetime of 24 hours
(`86,400` seconds) from issuance. Activity must not renew, extend, or otherwise
change that expiry.

## Current behavior and evidence

- `backend/src/services/auth.service.ts` already signs login and client-signup JWTs
  using the injected `jwtExpiresInSeconds` configuration.
- `backend/src/server.ts` currently hardcodes that configuration to `900` seconds,
  so production tokens expire 15 minutes after issuance.
- The environment schema and `backend/.env.example` do not currently expose a JWT
  expiry setting.
- The Render Blueprint generates `JWT_SECRET` but does not declare the token expiry.
- JWT verification already enforces the signed `exp` claim. Expired tokens produce
  `401 TOKEN_EXPIRED`, and the frontend already clears the token, authenticated
  state, and query cache on an authenticated `401`.
- There is no refresh-token, sliding-session, server-side session, or last-activity
  model. The user has explicitly clarified that none is required.

## Scope

- Add a validated backend runtime setting for JWT expiry seconds.
- Default that setting to `86,400` seconds and prevent configuration longer than 24
  hours.
- Pass the validated runtime value from server bootstrap to the existing auth
  service instead of hardcoding `900`.
- Declare the exact 24-hour value in the backend environment example and Render API
  service configuration.
- Add focused configuration, server-wiring, login, and signup expiry regressions.

## Non-goals

- Tracking user, browser, or API inactivity.
- Sliding expiry, refresh tokens, token rotation, or background renewal.
- Persisted sessions, a session collection, last-activity writes, or an Atlas
  migration.
- Changing JWT signing algorithms, `JWT_SECRET`, token storage, roles, permissions,
  session-version revocation, password reset behavior, or demo-account restrictions.
- Adding a frontend timer. An open page discovers expiry on its next protected API
  request, while the backend token is already invalid at the signed expiry time.
- Committing, pushing, deploying, restarting Render, or mutating production.

## Requirements

### Runtime configuration

1. Add `JWT_EXPIRES_IN_SECONDS` to the validated backend environment.
2. The default must be `86,400` seconds.
3. The setting must accept integers from `60` through `86,400` seconds. It must
   reject non-positive values, values below `60`, fractions, non-numeric input, and
   values greater than `86,400` so a configuration error cannot silently weaken the
   approved maximum.
4. `backend/.env.example` must document that expiry is fixed from issuance and is
   not renewed by activity.
5. The Render API Blueprint must explicitly set
   `JWT_EXPIRES_IN_SECONDS="86400"`.

### Token behavior

1. Successful staff/admin login JWTs must have `exp - iat = 86,400` under the
   production/default runtime configuration.
2. Successful client-signup JWTs must have the same fixed lifetime.
3. Requests made during the 24-hour window must not change the token or its `exp`
   claim.
4. At and after the signed expiration time, authentication must continue to return
   `401 TOKEN_EXPIRED` through the existing middleware path.
5. User deactivation, role mismatch, session-version mismatch, invalid signature,
   and development-demo restrictions must remain enforced independently of expiry.

### Frontend behavior

1. No frontend source behavior change is required.
2. The existing authenticated-`401` path must continue to clear the expired token
   and cached authenticated data and present the existing session-expired guidance.

## Assumptions

- “24 hours” means exactly 24 × 60 × 60 seconds from JWT issuance, not the next
  calendar day and not a timezone-dependent boundary.
- “Ignore active session” means activity never renews or extends the token.
- The setting applies uniformly to all human roles, including the sole Super Admin,
  staff, workers, and clients.
- OCR worker authentication is separate and unaffected.

## Constraints and invariants

- Backend authorization remains authoritative and operation-specific.
- The sole active Super Admin identity and existing `sessionVersion` invalidation
  rules remain unchanged.
- No credential, JWT, private URL, or user data may appear in fixtures, logs, or
  output.
- Existing tests may continue to inject shorter expiries such as 900 seconds to test
  boundaries; the production server wiring is what changes to 86,400.
- No dependency or lockfile change is required.

## Options and recommendation

### A. Validated environment setting with a 24-hour default and maximum — recommended

Add `JWT_EXPIRES_IN_SECONDS`, wire it through server bootstrap, and explicitly set it
in Render. This makes the production security value visible and testable while
preventing a value longer than the approved maximum. Shorter values remain possible
for stricter local/test environments.

### B. Replace the server hardcode with the literal `86_400`

This is smaller but hides an operational security setting in source code and gives
configuration tests no runtime boundary to validate.

### C. Sliding 24-hour inactivity expiry

Rejected by the clarified request. It would require token renewal or persisted
session activity and would keep active sessions alive beyond 24 hours.

## Data, API, UX, and operational impact

- **Data:** no MongoDB or Atlas schema/data change.
- **API:** response shapes and route inventory remain unchanged; only the JWT `exp`
  claim changes for newly issued tokens.
- **Security:** the bearer-token exposure window increases from 15 minutes to 24
  hours. Existing session-version invalidation, user deactivation, role validation,
  and password-reset revocation mitigate but do not eliminate stolen-token risk.
- **UX:** newly authenticated users can remain signed in for at most 24 hours. At
  expiry, the next protected request triggers the existing sign-out/session-expired
  flow.
- **Operations:** changing the environment requires an authorized Render redeploy.
  Tokens issued before deployment retain their original 15-minute `exp`; tokens
  issued after deployment receive 24 hours.

## Compatibility and rollback

- JWT shape, algorithm, and claims remain compatible; no frontend/backend rollout
  ordering constraint is introduced.
- Existing tokens are not rewritten or extended.
- Rolling back the source/environment restores the prior expiry for newly issued
  tokens only. Already-issued 24-hour tokens remain valid until their signed expiry
  unless an existing revocation boundary (for example `sessionVersion`) invalidates
  them.
- Rotating `JWT_SECRET` merely to shorten rollback is out of scope because it would
  sign out every user and has a separate production authority boundary.

## Risks and mitigations

- **Longer stolen-token window:** keep the 24-hour maximum enforced by validation;
  preserve user deactivation and session-version checks; never log tokens.
- **Configuration drift:** declare and test the value in environment parsing,
  `.env.example`, server dependency wiring, and Render Blueprint configuration.
- **False assumption that activity extends expiry:** document fixed-expiry semantics
  next to the setting and test that the issued claim is exactly 86,400 seconds.
- **Open page appears authenticated after expiry:** backend remains authoritative;
  the next protected request returns `401` and triggers the existing cleanup path.

## Acceptance criteria

1. Default validated runtime configuration returns
   `JWT_EXPIRES_IN_SECONDS = 86,400`.
2. Explicit `60` and `86,400` are accepted; zero, negative, values below `60`,
   fractional, non-numeric, and values greater than `86,400` are rejected.
3. Server bootstrap passes the validated runtime expiry to the auth service instead
   of a hardcoded 900 seconds.
4. Login and client-signup tokens issued with the production/default configuration
   have `exp - iat = 86,400`.
5. The same token remains unchanged during authenticated activity and expires at its
   original signed boundary.
6. Expired tokens continue to return `401 TOKEN_EXPIRED` and frontend cleanup
   regressions remain green.
7. `backend/.env.example` and the Render API service declare the 24-hour setting
   without exposing a secret.
8. Focused environment, server, auth, and frontend session-expiry tests pass.
9. Backend and frontend typechecks/tests/builds pass in proportion to the shared auth
   configuration change.
10. `git diff --check` and repository status inspection show only approved files and
    preserve the existing authorization-policy compatibility work.

## Open decisions

None. The clarified request fixes expiry at 24 hours from issuance and explicitly
excludes inactivity/sliding-session behavior.

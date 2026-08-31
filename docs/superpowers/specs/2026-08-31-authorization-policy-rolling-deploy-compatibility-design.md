# Authorization Policy Rolling-Deploy Compatibility Design

## Goal

Prevent valid production users from being signed out solely because the frontend
and backend were deployed at different times and report different authorization
policy labels, while preserving fail-closed role and permission handling.

## Current behavior and evidence

- `POST /api/v1/auth/login` returns `200` for the affected production account, so
  the credentials, Atlas user record, Render API reachability, and login CORS path
  are valid.
- `frontend/src/auth/authorization.ts` accepts an authorization snapshot only when
  `policyVersion` exactly equals the frontend build's
  `AUTHORIZATION_POLICY_VERSION` constant.
- `frontend/src/auth/AuthProvider.tsx` requests `/auth/authorization` immediately
  after login. When the snapshot parser rejects the response, session
  establishment fails and the newly issued token is cleared.
- Commit `938ef15` changed both frontend and backend policy labels from
  `2026-08-28.ai-estimator-knowledge.v6` to
  `2026-08-30.super-admin-dashboard.v1`.
- Render provisions `lisno-api` and `lisno-frontend` as separate services. Deploying
  the API before the static frontend therefore creates a window in which the old
  frontend rejects a structurally valid snapshot from the new API.
- The frontend already treats backend authorization as authoritative: it retains
  only permission codes known to the frontend and checks those retained codes for
  UI visibility. Backend route authorization remains the enforcement boundary.
- Focused authorization/session tests and production builds pass when both sides
  use commit `938ef15`; the defect is version-skew behavior rather than invalid
  credentials or a build failure.

## Scope

- Change frontend authorization snapshot parsing so `policyVersion` is retained as
  an observed backend policy identifier instead of being used as an exact runtime
  compatibility gate.
- Keep the current policy constant as the identifier emitted by the matching
  backend and used by current fixtures/contract synchronization checks.
- Update frontend authorization types and focused regression tests for older,
  current, and future policy labels.
- Verify session establishment and restoration across policy-label skew.

## Non-goals

- Changing JWT issuance, expiry, signing secrets, password handling, user records,
  or Atlas data.
- Relaxing backend authorization or making frontend visibility an enforcement
  boundary.
- Accepting an unknown role, a role different from the authenticated login user, a
  malformed permissions value, or an oversized permission list.
- Granting permission codes that the frontend does not recognize.
- Changing the backend response shape or policy assignment in this fix.
- Deploying, rolling back, or otherwise mutating Render production services as part
  of the repository implementation.

## Requirements

### Snapshot compatibility

1. A structurally valid snapshot with a recognized role matching the authenticated
   user must be accepted when its policy label differs from the frontend build's
   current label.
2. The policy label must remain required, non-empty, bounded, and restricted to a
   safe identifier character set suitable for diagnostics.
3. The parsed `AuthorizationSnapshot` must preserve the exact accepted backend
   policy label; it must not replace it with the frontend constant.
4. Current same-version snapshots must continue to work without a behavior change.

### Fail-closed authorization

1. Unknown roles and login/snapshot role mismatches remain invalid.
2. Missing or malformed required fields and unexpected response fields remain
   invalid under the existing strict response schema.
3. The existing permission-list ceiling remains enforced.
4. Unknown permission codes remain omitted and denied. The frontend must never
   synthesize a permission absent from the backend snapshot.
5. Backend route-operation authorization remains authoritative for every request.

### Session behavior

1. Login and restored sessions must remain authenticated when the only difference
   is a valid policy label.
2. A malformed snapshot or role mismatch must continue to fail closed using the
   existing invalid-authorization behavior.
3. A real `401` for the issued token must continue to clear the session and
   authenticated query cache.

## Assumptions

- Authorization policy labels identify a permission-policy revision; they are not
  schema-version negotiation tokens.
- Existing permission codes are stable capabilities and will not be repurposed to
  mean a broader action. New capabilities receive new permission codes.
- Additive permissions are safe across frontend versions because older frontends
  discard unknown codes, while removed permissions disappear from the backend
  snapshot and are therefore denied by the UI.
- Production frontend users may need a hard refresh after the corrected static
  bundle is deployed; no service worker is used by this repository.

## Constraints

- The sole active Super Admin identity and operation-specific backend authorization
  invariants must remain unchanged.
- The fix must not expose tokens, credentials, private URLs, or user data in errors,
  logs, fixtures, or screenshots.
- No dependency or lockfile change is required.
- The implementation must preserve unrelated work and leave deployment as a
  separate explicitly authorized production action.

## Options and recommendation

### A. Treat `policyVersion` as an opaque observed identifier — recommended

Accept any safe, structurally valid policy label while retaining strict role,
shape, list-size, and known-permission validation. This removes availability
coupling between otherwise compatible frontend and backend releases without
expanding authorization, because the backend remains authoritative and unknown
permissions remain denied.

### B. Allowlist the current and immediately previous labels

This fixes the present incident but recreates the same outage at a later policy
change unless every deployment follows a two-phase allowlist rollout. It adds
ongoing operational coordination without strengthening permission enforcement.

### C. Keep exact equality and require coordinated deployment/rollback

This requires no parser change, but separate Render services cannot be deployed
atomically. Any backend-first rollout or cached old frontend can sign out valid
users, so the production failure remains structurally possible.

## Security rationale

Exact equality of the policy label does not enforce a permission. Enforcement is
performed by backend route operations, and frontend visibility is calculated only
from recognized permission codes actually returned by the backend. Accepting a
different safe label therefore does not grant access. The checks that prevent
privilege confusion—recognized role, exact role match, strict shape, bounded list,
and known permission filtering—remain in place.

## Data, API, and UX impact

- **Data:** no schema, migration, seed, or Atlas write.
- **API:** no endpoint or response-shape change. `policyVersion` remains present.
- **Types:** the frontend snapshot exposes the observed policy identifier as a
  string rather than the single current literal type.
- **Authorization:** no backend permission or role change; unknown permissions stay
  denied.
- **UX:** valid users no longer return to the login screen merely because the API
  policy label is older or newer than the frontend bundle.
- **Operations:** frontend and backend should still be deployed from the same
  commit, but temporary label skew no longer causes an authentication outage.

## Risks and mitigations

- **Semantics of an existing permission code change incompatibly:** prohibit
  repurposing codes; introduce a new permission code for a new capability.
- **Malformed or hostile policy label:** require a short, safe identifier and retain
  strict snapshot validation.
- **Unknown backend permission appears in an older frontend:** continue filtering it
  out so the UI denies it.
- **A real authentication failure is hidden:** keep all `401`, invalid-token,
  role-mismatch, and malformed-snapshot behavior unchanged.
- **Production remains on an old cached bundle:** deploy the corrected frontend and
  require a hard refresh as an operational recovery step.

## Acceptance criteria

1. A login response followed by an authorization snapshot using
   `2026-08-28.ai-estimator-knowledge.v6` establishes a session in the current
   frontend.
2. The current `2026-08-30.super-admin-dashboard.v1` snapshot continues to establish
   and restore sessions.
3. A safe future policy label is accepted and preserved in the parsed session.
4. Empty, oversized, unsafe, missing, or non-string policy labels are rejected.
5. Unknown roles and role mismatches are rejected.
6. Unknown permission codes are omitted and cannot satisfy a frontend permission
   check.
7. A genuine authenticated-request `401` still clears the token and authenticated
   cache.
8. Focused frontend authorization and `AuthProvider` tests pass.
9. Frontend typecheck and production build pass.
10. Relevant backend authorization synchronization tests remain green, confirming
    that the current source constants still match.
11. `git diff --check` and repository status inspection show only the authorized
    source, test, specification, and task-plan changes.

## Open decisions

None. Option A is recommended because it removes the deployment-order failure while
preserving every permission-granting and role-matching boundary.

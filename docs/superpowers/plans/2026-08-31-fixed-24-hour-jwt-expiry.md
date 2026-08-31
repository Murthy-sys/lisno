# Fixed 24-Hour JWT Expiry Task Plan

## Source of truth

- Approved design:
  `docs/superpowers/specs/2026-08-31-fixed-24-hour-jwt-expiry-design.md`
- Required behavior: every newly issued human JWT expires exactly 86,400 seconds
  after issuance. Activity does not renew or extend it.
- Production boundary: repository implementation and verification are authorized;
  committing, pushing, changing Render environment values, deploying, restarting,
  rotating secrets, or mutating Atlas are not authorized by this plan.

## Ownership boundaries

- **Backend runtime configuration:** `backend/src/config/env.ts`,
  `backend/src/server.ts`, and their focused tests.
- **Authentication expiry contract:** existing `backend/src/services/auth.service.ts`
  behavior is reused; modify it only if focused evidence shows the injected expiry
  is not applied uniformly to login and signup.
- **Operator configuration:** `backend/.env.example` and the `lisno-api` environment
  block in `render.yaml`.
- **Frontend:** verification-only unless a focused regression disproves the existing
  authenticated-`401` cleanup behavior.
- **Persistence:** no ownership; no model, repository, migration, seed, or Atlas
  change is permitted.
- **Integration:** the primary implementer owns the shared expiry contract, final
  diff reconciliation, and external-action handoff.

## Dependency-ordered tasks

### Task 1 — Capture and protect the baseline

**Affected areas:** repository status and relevant per-target diffs.

**Work:**

1. Record the dirty-path set, including any previously approved authorization-policy
   compatibility work and the new specification/plan.
2. Confirm the target configuration/server/test files have no unexplained user
   edits before assigning write ownership.
3. Record the current production wiring evidence: `backend/src/server.ts` passes
   `jwtExpiresInSeconds: 900` while the auth service consumes the injected value.

**Acceptance criteria:**

- Existing work is preserved and ownership is explicit.
- No unrelated dirty file is reformatted, reverted, staged, or overwritten.

### Task 2 — Add bounded runtime expiry configuration

**Depends on:** Task 1.

**Affected areas:** `backend/src/config/env.ts`, `backend/tests/config.test.ts`.

**Work:**

1. Add integer environment setting `JWT_EXPIRES_IN_SECONDS`.
2. Default it to `86_400`.
3. Enforce the approved minimum of `60` seconds and maximum of `86_400`; reject
   zero, negatives, values below `60`, fractions, non-numeric input, and values
   above the maximum.
4. Add focused parser tests for the default, explicit 24-hour value, a permitted
   shorter test value, and every rejected boundary class.

**Acceptance criteria:** specification criteria 1 and 2 pass with deterministic
configuration tests.

### Task 3 — Replace the production hardcode with validated wiring

**Depends on:** Task 2.

**Affected areas:** `backend/src/server.ts`, `backend/tests/server.test.ts`.

**Work:**

1. Pass `env.JWT_EXPIRES_IN_SECONDS` into the auth service configuration.
2. Extend the server bootstrap fixture/type to contain the validated value.
3. Assert the application factory receives exactly 86,400 seconds from the runtime
   environment fixture.
4. Do not change the JWT secret, algorithm, claims, authorization, CORS, storage,
   OCR, or mail bootstrap paths.

**Acceptance criteria:** specification criterion 3 passes and the old production
`900` hardcode is absent from server bootstrap.

### Task 4 — Prove fixed login/signup expiry and no activity renewal

**Depends on:** Task 3.

**Affected areas:** the minimum necessary cases in `backend/tests/auth.test.ts` and
existing frontend session-expiry tests as verification-only.

**Work:**

1. Issue a normal login token with `jwtExpiresInSeconds: 86_400`, decode it without
   exposing the token, and assert `exp - iat === 86_400`.
2. Issue a client-signup token with the same configuration and assert the same
   lifetime.
3. Reuse a token for authenticated requests and confirm its serialized value and
   original expiry do not change; no refresh/renewal response is introduced.
4. Use controlled time to confirm the token is accepted before expiry and returns
   `401 TOKEN_EXPIRED` at/after expiry.
5. Keep existing invalid-signature, deactivated-user, role, session-version,
   password-reset, and demo-account checks green.
6. Run the focused frontend API/AuthProvider expiry-cleanup tests without changing
   frontend behavior unless they reveal a real regression.

**Acceptance criteria:** specification criteria 4, 5, and 6 pass.

### Task 5 — Document local and Render runtime values

**Depends on:** Task 2.

**Affected areas:** `backend/.env.example`, `render.yaml`.

**Work:**

1. Add `JWT_EXPIRES_IN_SECONDS=86400` beside `JWT_SECRET` in the backend example.
2. Document that the lifetime is fixed from issuance and activity does not renew it.
3. Add explicit non-secret `JWT_EXPIRES_IN_SECONDS: "86400"` configuration to the
   `lisno-api` Render service only.
4. Do not touch frontend API URLs, CORS origins, MongoDB URI, generated secrets, or
   other Render services.

**Acceptance criteria:** specification criterion 7 passes by source inspection and
configuration tests.

### Task 6 — Integrated security review

**Depends on:** Tasks 3, 4, and 5.

**Review focus:**

1. Confirm every human token issuance path uses the fixed runtime value.
2. Confirm no sliding renewal, refresh token, response-token rotation, activity
   persistence, or frontend timer was introduced.
3. Confirm the environment cannot configure a lifetime above 24 hours.
4. Confirm expired/invalid/session-version behavior remains distinguishable and
   fail-closed.
5. Confirm no secret, token, database, permission, or role change entered the diff.

**Acceptance criteria:** no unresolved blocker/high/medium integrity finding remains.

### Task 7 — Final verification and handoff

**Depends on:** Task 6 and any finding resolution.

**Verification:**

1. Backend focused:

   ```bash
   cd backend && npm test -- tests/config.test.ts tests/server.test.ts tests/auth.test.ts
   ```

2. Backend full:

   ```bash
   cd backend && npm run typecheck && npm test && npm run build
   ```

3. Frontend focused expiry cleanup:

   ```bash
   cd frontend && npm test -- src/api/client.test.ts src/auth/AuthProvider.test.tsx src/auth/LoginPage.test.tsx
   ```

4. Frontend type/build verification if no frontend source changed:

   ```bash
   cd frontend && npm run typecheck && npm run build
   ```

5. Repository hygiene:

   ```bash
   git diff --check
   git status --short
   ```

6. Inspect the final diff for unauthorized persistence, frontend environment,
   secret, permission, dependency, lockfile, or external-system changes.

**Handoff:**

- Report exact files, commands, counts/results, warnings, and unrun checks.
- State that old tokens retain their original expiry and new behavior begins only
  after an authorized backend deployment and new login/signup.
- State that no commit, push, Render environment mutation/redeploy, secret rotation,
  or Atlas action was performed.
- Identify rollback limits: already-issued 24-hour tokens remain valid until expiry
  unless an existing revocation boundary is deliberately invoked.

## Parallelization

- After baseline capture, Task 2/3/4 form one tightly coupled backend auth slice and
  should have one writer.
- Task 5 may be assigned independently to a non-overlapping configuration/document
  owner after the setting name and bounds are fixed.
- Focused frontend verification may run in parallel with backend full verification
  only after all writers finish.
- Integrity review must run after writers; final verification must run after review
  findings are resolved.

## Completion definition

The repository change is complete only when newly issued login and signup tokens
are proven to carry an immutable 86,400-second lifetime, every security regression
passes, the final diff contains no activity/session persistence or renewal behavior,
and the handoff clearly separates local verification from unperformed production
deployment.

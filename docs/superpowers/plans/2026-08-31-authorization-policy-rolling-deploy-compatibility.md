# Authorization Policy Rolling-Deploy Compatibility Task Plan

## Source of truth

- Approved design:
  `docs/superpowers/specs/2026-08-31-authorization-policy-rolling-deploy-compatibility-design.md`
- Incident boundary: valid login succeeds, then frontend session establishment
  rejects a different but structurally compatible backend `policyVersion` and
  clears the token.
- Production configuration boundary: local and deployed frontends may continue to
  call the Render API backed by MongoDB Atlas. This plan does not alter environment
  variables, deployment resources, JWT configuration, CORS, or database data.

## Ownership boundaries

- **Frontend authorization contract/parser:**
  `frontend/src/api/authorization-contract.ts` and
  `frontend/src/auth/authorization.ts`.
- **Frontend regression coverage:**
  `frontend/src/auth/authorization.test.ts` and the minimum necessary cases in
  `frontend/src/auth/AuthProvider.test.tsx`.
- **Backend:** no behavior-changing backend source ownership. Backend authorization
  tests are verification-only because the API response contract does not change.
- **Shared artifacts and integration:** the primary implementer owns this plan, the
  approved design, final diff review, and production handoff.
- **External systems:** no Render deploy/rollback, Atlas write, secret change, seed,
  migration, commit, or push is authorized by this implementation plan.

## Dependency-ordered tasks

### Task 1 — Capture the authorization compatibility baseline

**Affected areas:** repository status, current frontend parser/type contract, focused
auth tests.

**Work:**

1. Reconfirm the dirty-path set and preserve the approved specification/plan files.
2. Record the current exact-equality behavior and existing tests that reject a stale
   policy label.
3. Run the focused frontend authorization parser tests before editing when feasible
   to retain a reproducible baseline.

**Acceptance criteria:**

- Existing user work is identified and preserved.
- The behavior-changing files are confirmed to have no unrelated uncommitted edits.
- Baseline evidence shows policy-label mismatch is the only compatibility gate being
  changed.

### Task 2 — Make the policy identifier rolling-deploy compatible

**Depends on:** Task 1.

**Affected areas:**
`frontend/src/api/authorization-contract.ts`,
`frontend/src/auth/authorization.ts`.

**Work:**

1. Change the frontend `AuthorizationSnapshot.policyVersion` type from the single
   current literal to the validated observed policy-identifier type.
2. Keep `AUTHORIZATION_POLICY_VERSION` as the canonical current-build label for
   fixtures and frontend/backend source synchronization.
3. Validate the received policy label as required, trimmed/non-empty, bounded, and
   restricted to the approved identifier character set.
4. Remove only the exact-current-label equality gate.
5. Preserve the backend-supplied policy label in the parsed immutable snapshot.
6. Preserve recognized-role checking, exact login/snapshot role matching, strict
   response shape, permission-list ceiling, canonical known-permission ordering,
   unknown-permission filtering, and immutable results.

**Acceptance criteria:**

- Current, previous, and safe future labels parse successfully when every security
  boundary is otherwise valid.
- Parsed state reports the actual backend label.
- No unknown role or permission gains access.
- No backend, environment, or persistence behavior changes.

### Task 3 — Add compatibility and fail-closed regression tests

**Depends on:** Task 2.

**Affected areas:**
`frontend/src/auth/authorization.test.ts`,
`frontend/src/auth/AuthProvider.test.tsx`.

**Work:**

1. Replace the stale-policy rejection expectation with explicit acceptance cases for
   the previous, current, and a safe future policy identifier.
2. Assert that the actual backend label is preserved rather than rewritten.
3. Add rejection cases for empty, whitespace-padded, unsafe-character, oversized,
   missing, and non-string policy labels.
4. Retain regression cases for unknown role, role mismatch, malformed permissions,
   oversized permission arrays, extra fields, and unknown permission denial.
5. Add or refine `AuthProvider` coverage proving that login and restoration do not
   clear a valid token solely because the policy label differs.
6. Retain coverage proving that a real authenticated `401` clears the token and
   authenticated cache.

**Acceptance criteria:**

- Every acceptance criterion in the approved specification is represented by a
  focused test or an explicitly mapped build/typecheck verification.
- Tests distinguish version-label skew from genuine authentication or authorization
  failure.

### Task 4 — Verify the integrated security contract

**Depends on:** Tasks 2 and 3.

**Affected areas:** frontend and backend test/build lanes; repository hygiene.

**Verification:**

1. Frontend focused:

   ```bash
   cd frontend && npm test -- src/auth/authorization.test.ts src/auth/AuthProvider.test.tsx
   ```

2. Frontend full static verification:

   ```bash
   cd frontend && npm run typecheck && npm test && npm run build
   ```

3. Backend contract synchronization:

   ```bash
   cd backend && npm test -- tests/frontend-authorization-contract.test.ts tests/authorization-policy.test.ts
   ```

4. Repository hygiene:

   ```bash
   git diff --check
   git status --short
   ```

5. Inspect the final diff and confirm it contains no environment URL, secret, JWT,
   Render, Atlas, CORS, database, or backend authorization-enforcement changes.

**Acceptance criteria:**

- Focused compatibility/security regressions pass.
- Frontend typecheck, full tests, and production build pass.
- Backend authorization synchronization tests pass.
- Repository hygiene passes with only approved paths changed.

### Task 5 — Prepare the production recovery handoff

**Depends on:** Task 4.

**Affected areas:** final report only; no external mutation.

**Work:**

1. Report the exact source/test files changed and verification results.
2. State that production deployment was not performed.
3. Provide the required operator sequence: deploy the compatible
   `lisno-frontend`, confirm its `VITE_API_URL`, hard-refresh, then verify login,
   `/auth/authorization`, and one protected read using an authorized production
   identity.
4. Keep rollback explicit: redeploy the prior frontend artifact/commit if the new
   static deployment fails; do not mutate Atlas.

**Acceptance criteria:**

- The handoff separates locally verified code from unperformed production actions.
- No credentials, JWTs, private URLs, or user data appear in the report.

## Parallelization

- There is no safe parallel writer split: the parser, public type, and auth tests are
  one tightly coupled frontend security contract and should have a single owner.
- After the integrated edit is complete, frontend verification and backend
  read-only contract verification may run in parallel.
- Final diff review and repository hygiene run after both verification lanes finish.

## Completion definition

The repository implementation is complete only when the compatible parser and
regressions are integrated, all specified checks pass, the diff is reviewed, and
the handoff explicitly identifies production deployment as unperformed. Production
recovery itself requires separate authorization and successful Render verification.

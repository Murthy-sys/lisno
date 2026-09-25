# Mobile authorization contract login recovery — task plan

- Date: 2026-09-21
- Status: Completed and verified 2026-09-22
- Specification: [Mobile authorization contract login recovery](../specs/2026-09-21-mobile-authorization-contract-login-design.md)
- Classification: High-risk authentication/RBAC compatibility fix

## Ownership and worktree boundaries

- Preserve all pre-existing backend/OCR edits, Expo-generated runtime files, the mobile router deletion, and its specification/plan.
- **Authorization contract slice:** owns `mobile/src/contracts/authorization.ts`, `mobile/src/contracts/operations.ts`, `mobile/scripts/contract-drift.test.ts`, and directly related contract tests only.
- **Sign-in error slice:** owns `mobile/src/features/auth/SignInScreen.tsx`, `mobile/src/features/auth/SignInScreen.test.tsx`, and directly related test fixtures only.
- The primary agent owns contract decisions, integration, dirty-worktree reconciliation, runtime verification, and specification/plan documents.
- No backend source, database, credential, dependency, lockfile, generated Expo runtime file, deployment, commit, or push is in scope.

## Dependency-ordered tasks

### 1. Capture the failure baseline and canonical contract

- Confirm the target mobile source files have no unrelated uncommitted edits before assigning ownership.
- Record the canonical backend permission list, policy version, protected-operation order, permission bindings, and Super Admin behavior.
- Run the focused mobile contract-drift test to preserve the failing 134/135 and 221/224 baseline.

**Acceptance:** the implementation inputs are traced to the current backend registries, and unrelated dirty paths are identified and excluded.

### 2. Synchronize the mobile authorization contract

- Add `ai_estimator_knowledge.quality_control_options.create` in canonical order.
- Update the mobile authorization policy identifier to `2026-09-20.quality-control-options.v1`.
- Update stale fixed assertions to 135 permissions and the current policy identifier.
- Keep exact policy matching, role matching, schema validation, known-permission filtering, and immutable snapshot behavior unchanged.

**Acceptance:** mobile, backend, and web expose the same ordered role/permission contract and policy version; mismatched policies remain rejected.

### 3. Synchronize the protected-operation mirror

- Insert the three missing operations at their canonical registry positions:
  - `GET /admin/ai-estimator-knowledge/quality-control-options`
  - `POST /admin/ai-estimator-knowledge/quality-control-options`
  - `POST /estimate-plan-change-requests/:requestId/replacement-upload`
- Add the corresponding permissions and exact `superAdminBehavior` values without shifting later operation/behavior associations.
- Update the canonical count assertion from 221 to 224.

**Acceptance:** the fully composed mobile operation objects exactly equal the backend registry in order, operation key, permission, and Super Admin behavior.

### 4. Correct sign-in error classification

- Import and classify `InvalidAuthorizationSnapshotError` and `InvalidSessionPayloadError` explicitly.
- Map those post-login failures to the approved safe service compatibility message.
- Preserve existing credential, lockout, deactivation, SSO, cleanup, and password-clearing behavior.
- Add focused UI tests proving credential failures and session-contract failures produce different messages without revealing internal policy details.

**Acceptance:** bad credentials still produce the generic credential message, while invalid post-login contracts produce the safe compatibility message and leave the session unauthenticated.

### 5. Integrate and perform authorization integrity review

- Inspect the combined diff against the specification and canonical backend source.
- Verify all 224 operation entries retain the correct position-sensitive Super Admin behavior.
- Confirm no parser relaxation, permission expansion, token logging, backend auth change, or unrelated source modification was introduced.
- Resolve every confirmed integrity finding before final verification.

**Acceptance:** authorization remains fail-closed and operation-specific, and the integrated diff is bounded to the approved mobile scope and documents.

### 6. Run focused and full verification

Run in this order from `mobile/`:

1. Focused contract drift test.
2. Authorization parser/session manager tests.
3. Sign-in screen tests.
4. Navigation and operation-capability tests.
5. `npm run typecheck`.
6. Full `npm test`.
7. Android Expo export/build validation using the repository’s established command.
8. Reload the active Android emulator and complete a real local Super Admin sign-in through the UI.
9. Check Metro/device logs for runtime, console, navigation, and API errors without printing credentials or tokens.
10. Run `git diff --check` and `git status --short` from the repository root.

**Acceptance:** every specification criterion has direct evidence; any unrelated pre-existing failure is reported precisely and is not described as passing.

## Parallel execution boundaries

After the baseline contract is fixed, Tasks 2–3 may run as one authorization-contract slice while Task 4 runs concurrently as the sign-in-error slice because their source ownership does not overlap. Tasks 5 and 6 must run sequentially after both writers finish. In Mode A, use separate implementation agents for those two slices, then an integrity reviewer and verification runner. In Mode B, perform the same steps inline and sequentially.

## Rollback and external effects

- Rollback is limited to reverting the bounded mobile contract, sign-in, and test changes.
- No database migration, seed, production mutation, external service write, credential rotation, deployment, commit, or push will be performed.

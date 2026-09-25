# Mobile authorization contract login recovery — design specification

- Date: 2026-09-21
- Status: Approved; implemented and verified 2026-09-22
- Classification: High-risk authentication/RBAC compatibility fix
- Affected area: `mobile/`

## Goal

Restore valid mobile sign-in against the current local Lisno backend while preserving fail-closed authorization. When the backend returns an incompatible or malformed post-login session contract, the mobile app must report a service compatibility problem instead of claiming the email or password is incorrect.

## Current behavior and evidence

- The mobile app is configured for the local API, and both the host and Android emulator can reach the local backend health endpoint.
- The active local Super Admin record exists, is active, and its stored password hash matches the configured loopback-development demo credential.
- A direct `POST /api/v1/auth/login` with that configured local credential succeeds and returns the Super Admin identity. The credential and primary login endpoint are therefore not the failure.
- After the primary login succeeds, `sessionManager.login` fetches `/auth/me` and `/auth/authorization` and validates both before accepting the session.
- The backend and web authorization contract use policy version `2026-09-20.quality-control-options.v1`; the mobile mirror still expects `2026-09-18.vendor-procurement.v1`.
- Mobile has 134 permission codes while the canonical backend and web contracts have 135. It is missing `ai_estimator_knowledge.quality_control_options.create`.
- Mobile has 221 protected-operation entries while the canonical backend registry has 224. It is missing:
  - `GET /admin/ai-estimator-knowledge/quality-control-options`
  - `POST /admin/ai-estimator-knowledge/quality-control-options`
  - `POST /estimate-plan-change-requests/:requestId/replacement-upload`
- `parseAuthorizationSnapshot` intentionally rejects an unknown policy version. `SignInScreen` maps that rejection, and every other unrecognized login error, to “Email or password is incorrect.” This masks the real post-login contract mismatch.
- The mobile contract-drift suite currently fails on the stale permission and protected-operation mirrors.

## Required behavior

1. Synchronize the mobile role/permission contract with the current canonical backend and web authorization contracts, including the 135th permission and current policy version.
2. Synchronize the mobile protected-operation mirror with all 224 canonical backend entries, preserving exact order, permission mapping, and `superAdminBehavior` for every route.
3. Keep authorization parsing fail-closed. Mobile must continue to reject unknown policy versions, invalid roles, malformed snapshots, and inconsistent session payloads.
4. A valid current backend Super Admin login must complete session establishment and reach the authorized mobile landing route.
5. Invalid credentials must continue to show the existing credential error without disclosing which field was wrong.
6. `InvalidAuthorizationSnapshotError` and `InvalidSessionPayloadError` must show a safe service compatibility message that does not expose tokens, policy internals, permissions, or account data.
7. Existing session cleanup must remain intact: rejected post-login sessions must clear transient credentials and must never leave the app authenticated.
8. Update fixed contract assertions so they prove the current canonical counts and policy version rather than preserving stale values.

## Source of truth and invariants

- `backend/src/domain/authorization.ts` remains authoritative for permission codes.
- `backend/src/services/auth.service.ts` remains authoritative for the emitted authorization policy version.
- `backend/src/domain/route-operations.ts` remains authoritative for protected operations, permission bindings, and Super Admin behavior.
- The web contract remains an independently checked consumer mirror; this fix does not make mobile trust the web client at runtime.
- Backend authorization remains authoritative. Mobile capabilities only control presentation and local navigation.
- Super Admin access stays operation-specific and keeps every canonical `superAdminBehavior`; no permission boundary is widened.
- Development demo identities and credentials remain loopback-development-only.

## Scope

- Mobile authorization and protected-operation contract mirrors.
- Mobile contract-drift assertions.
- Mobile sign-in error classification and focused regression coverage.
- Runtime verification against the already-running local backend and Android emulator.

## Non-goals

- Changing, resetting, exposing, or hardcoding any password or token.
- Weakening policy-version validation or accepting unknown permissions as trusted capabilities.
- Changing backend authentication, role assignments, authorization policy, route permissions, or the development-only demo guard.
- Seeding data, modifying production, deploying, committing, or pushing.
- Altering the unrelated OCR replacement work or mobile router fix already present in the worktree.

## Recommended approach

Update the mobile mirrors from the current canonical registries and retain strict equality checks in the drift suite. Add explicit sign-in handling for the existing session-contract error classes while leaving credential-related API handling unchanged. This fixes the actual mismatch and improves diagnosis without bypassing authorization validation.

## Failure handling and observability

- A stale or malformed authorization response remains a rejected login with local credential cleanup.
- The user sees a retry-oriented compatibility message, such as “This app is out of sync with the Lisno service. Update or reload the app and try again.”
- No raw backend message, token, permission list, policy identifier, password, or private account detail is rendered or logged.
- Contract-drift tests continue to fail whenever the backend registry changes without the mobile mirror being updated.

## Risks and controls

- **Ordered route mirror drift:** inserting a route without the matching Super Admin behavior could associate later routes with the wrong behavior. Compare complete composed objects to the canonical registry and add all three entries at their canonical positions.
- **Accidental authorization weakening:** accepting arbitrary policy versions would make login appear fixed while undermining compatibility checks. Preserve exact policy-version equality and fail-closed parsing.
- **Misclassified credential failures:** broad error remapping could hide true 401 responses. Match only the explicit session-contract error classes; retain the current `ApiError` mappings for credential and account failures.
- **Shared dirty worktree:** preserve the existing OCR backend edits, Expo runtime files, router deletion, and approved router documents; restrict source edits to the listed mobile contract/authentication files.

## Acceptance criteria

1. Mobile, backend, and web expose the same ordered 135 permission codes and the same authorization policy version.
2. Mobile’s 224 protected operations exactly match the backend registry in operation key, permission, order, and Super Admin behavior.
3. The mobile contract-drift suite passes.
4. Authorization parser tests prove that the current snapshot is accepted and a mismatched policy, malformed payload, or role mismatch is rejected.
5. Sign-in tests prove that invalid credentials retain the credential message and post-login contract failures receive the safe compatibility message.
6. Mobile TypeScript checking and the relevant session, sign-in, navigation, and contract tests pass.
7. The full mobile test suite and Android export/build validation pass, or any unrelated pre-existing failure is identified with evidence.
8. On the Android emulator, the configured local Super Admin can sign in and reach the authorized landing screen without a credential error or console/runtime error.
9. Repository hygiene checks pass without altering unrelated dirty paths.

## Data, migration, and external effects

No schema change, database write, migration, seed, dependency change, lockfile change, external communication, production mutation, or deployment is required. Rollback consists of reverting the bounded mobile source and test changes, though doing so would restore the known login incompatibility.

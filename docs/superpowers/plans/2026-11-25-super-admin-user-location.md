# Super Admin Users: location implementation plan

Date: 2026-11-25
Status: Implemented in approved Mode A. Final verification passed: 607 backend and 72 frontend tests, both typechecks/builds, desktop/mobile browser checks and live local schema/health verification.

Approved source: [User location specification](../specs/2026-11-25-super-admin-user-location-design.md). Acceptance criteria below refer to its AC1–AC7.

## Agreed outcome and contract

- Optional **Location** field with the hint **City or area** in Invite user and Manage user. Show Location in the Users table and Details; absent values display **Not set**.
- Persist location on invitations and copy it into the user on acceptance. Existing users can add, change or clear location using **Save location**.
- Persisted records accept optional `location?: string | null`; administrative responses normalize missing values to `null`. Frontend read types tolerate missing data for compatibility.
- Normalize strings by trimming; blank becomes `null`. Reject control characters, invalid types and normalized strings over 120 characters. Preserve Unicode names.
- Invitation creation accepts optional location. User PATCH adds the strict branch `{ version, location: string | null }`; existing role and active-status branches remain separate.
- Preserve authorization, immutable Super Admin protection, version checks, invitation preflight and transaction semantics. Location writes must not invalidate sessions, revoke grants, change assignments or alter project location.
- No dependency, migration, seed, public identity-data expansion, direct user-creation flow or email-template change is needed.

## Dependency-ordered tasks

### T1. Establish baseline and shared frontend contract

Owner: primary agent. Dependencies: plan approval and execution-mode selection. Covers AC1–AC4.

1. Recheck `git status --short` and capture target diffs before assigning writers. At planning time only the new specification is untracked; all product targets are clean. Preserve any later unrelated changes.
2. Trace the current invitation and managed-user mappings once more where necessary. Confirm absence remains valid for old records, automated vendor invitations and older clients.
3. Update only the relevant interfaces in `frontend/src/api/types.ts`: optional nullable location on invitation creation/read and user-directory read types; add the mutually exclusive location PATCH branch. Share the agreed shape with both implementers.
4. Confirm the interaction rule: one pending edit operation at a time. While location is dirty, prevent role/status/deletion actions from discarding it; while role is dirty, prevent entering/submitting a separate location change. Existing Cancel/discard behavior remains available. Include normalized location changes in dirty-state handling.
5. Record the baseline and ownership here. Keep one parent implementation task in progress, with child status tracked under it.

### T2. Backend validation, storage and lifecycle

Owner in Mode A: `backend_implementer`. Depends on T1. Covers AC1–AC5, AC7.

Owned paths: relevant backend source and tests only, principally:

- `backend/src/domain/user-location.ts` if a small shared validation module is needed, plus `domain/audit-actions.ts`.
- `backend/src/models/User.ts` and `UserInvitation.ts`.
- `backend/src/repositories/types.ts`, `memory.ts`, `mongo.ts`.
- `backend/src/routes/admin-users.ts`, `user-invitations.ts`.
- `backend/src/services/user-administration.service.ts`, `user-invitation.service.ts`.
- `backend/src/openapi.ts` and focused backend tests named below.

Work:

1. Define one backend normalization/validation rule reused at the relevant request, service and persistence boundaries. Validate raw control characters before trimming. Keep absent historical fields valid.
2. Add storage and all explicit mappings for user and invitation records, including invitation administration projections. Keep memory and Mongo implementations aligned; do not change generic public/authentication user DTOs.
3. Extend invitation route validation and service parsing. `parseCreateInput()` currently checks an exact required-key count: allow the one optional location key while preserving required fields, unknown-field rejection and vendor membership checks.
4. Preserve location through creation, resend and acceptance. Older and automated invitations omit it safely. Do not change delivery preflight, token rules, public inspection or email content.
5. Add the location-only PATCH branch, normalization, change detection and existing version/CAS handling. Persist through `updateUser`; increment user version only for a changed value and leave `sessionVersion` unchanged. Preserve location on unrelated role/status writes.
6. Add `user.location_updated` to the established audit registry and transactionally append actor, target, timestamps, versions and old/new location. A normalized no-op emits no new audit. Keep grants and responsibilities unchanged.
7. Document the new fields and request branch in OpenAPI, including nullable/optional behavior. Verify existing route-operation registrations still match the unchanged routes and permissions.
8. Add focused regression coverage: two distinct users/locations; create/accept and resend; legacy omission; add/change/clear/no-op; invalid values; stale versions; unauthorized/protected/deleted targets; unaffected sessions/grants/assignments; rollback on audit failure; mail-disabled no-write behavior. Use isolated replica sets for transactional Mongo verification and fake mailers only.

Boundary: no frontend or documentation writes. Report any contract conflict to the primary agent before expanding scope.

### T3. Frontend forms, directory and feedback

Owner in Mode A: `frontend_implementer`. Depends on T1; final integration depends on T2. Covers AC1–AC3, AC6–AC7.

Owned paths:

- `frontend/src/features/admin/InviteUserDialog.tsx`, `UserMutationDialog.tsx`, `UserDirectoryPage.tsx`, `userInvitationsApi.ts` and their focused tests.
- Existing scoped administration styles only if needed for the new column/field.
- `frontend/src/test/fixtures/enterpriseUsersData.ts` and the relevant synthetic transport handlers only if needed for rendered verification.
- `UserInvitationsPanel.tsx` only if an existing details surface needs location. Current inspection found a table without a separate details panel; do not create an extra screen.

Work:

1. Add the optional invitation field, matching client validation and field errors; include it in explicit API serialization, focus order and unsaved-change tracking. Preserve input on failures.
2. Add Location to directory rows and the existing Details panel, with **Not set** for missing/null values. Preserve existing sorting/filtering behavior and accessible table semantics.
3. Add prefilled location editing with an independent **Save location** action. Normalize blank to `null`; send only `{ version, location }`. Apply the agreed one-operation-at-a-time interaction and existing stale/deleted/protected-user guards.
4. Extend loading, success and failure feedback for location updates without misleading access-change wording. Preserve failed input; handle version conflicts through refetch and review. Keep directory/detail cache refresh correct and existing dashboard invalidation intact.
5. Add rendered tests for new and existing users, clearing, empty/old records, validation, keyboard controls, failed save retention, conflict recovery, dirty-state/deletion safeguards and successful query refresh.
6. Reuse current components and styling. No redesign, new icons, dependencies or location catalogue. Verify long values and panel/table behavior at approximately 1440px and 390px widths.

Boundary: no backend or `frontend/src/api/types.ts` writes; the primary owns that shared type file. Do not overwrite unrelated fixtures or styling changes.

### T4. Integrate and review

Owner: primary agent; use `integrity_reviewer` in Mode A after writers finish. Depends on T2 and T3. Covers AC1–AC6.

1. Inspect the integrated diff and reconcile schema, serializer, null/omission and error behavior across frontend and backend.
2. Review all explicit record copies, invitation required-key validation, protected-account checks, audit rollback, unchanged sessions/grants and public data projections.
3. Confirm role/status operations preserve location, no-op and stale-version behavior match the spec, and simultaneous UI changes cannot be silently lost.
4. Resolve confirmed findings before final verification. Check scope, dependencies and lockfiles against the baseline.

### T5. Verify and hand off

Owner: primary agent; use `verification_runner` in Mode A after T4. Depends on resolved integration/review findings. Covers AC1–AC7.

Run focused checks on the completed worktree, then the relevant shared-identity regression checks and builds below. Do not rely on results collected during concurrent writes. Re-run affected checks only after a fix or unresolved concern.

From `backend/`:

```sh
npm test -- tests/user-administration.test.ts tests/user-invitations.test.ts tests/user-invitation-repository.test.ts tests/user-invitation-models.test.ts
npm test -- tests/user-administration-mongo.replica-set.test.ts tests/user-invitations-mongo.replica-set.test.ts
npm test -- tests/auth-session-revocation.test.ts tests/super-admin-authorization.test.ts tests/authorization-policy.test.ts tests/audit-security.test.ts
npm run typecheck
npm run build
```

Include focused tests for a new location validator and the changed OpenAPI contract when added. Do not alter unrelated historical audit registry assertions unless the implementation legitimately changes their asserted group.

From `frontend/`:

```sh
npm test -- src/features/admin/UserInvitationDialogs.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/userInvitationsApi.test.ts
npm test -- src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserDeletionDialog.test.tsx
npm run typecheck
npm run build
```

Rendered verification uses synthetic users and a fake invitation transport. Check invite entry, add/change/clear/save, directory refresh, keyboard focus, validation errors and desktop/mobile layout. Include accessibility and console/network-error checks. Never send real invitations or modify real user records as a test.

At repository root, run `git diff --check` and `git status --short`; inspect the final target diff. No lint script exists. Broaden to other suites only if shared-contract changes or observed failures justify it; reproduce suspected unrelated failures against an isolated baseline.

Inspect the running local backend's OpenAPI/health after implementation. If it is stale, safely reload the identified local development service with its existing no-seed startup command, preserving local data and companion services, then recheck readiness and schema. Do not deploy remotely or write application records to test runtime validation.

Record exact commands/results, every AC's evidence, unrun checks, remaining failures and temporary artifact paths. Clean up task-owned QA processes and temporary artifacts that are no longer needed. Leave any intentionally refreshed existing development service running. No commits, pushes, migrations, production mutation or external communication.

## Parallelism and ownership

- No agents or implementation before the execution-mode gate. In Mode A, T2 and T3 run concurrently after T1, with separate paths and the shared contract settled. Each agent must preserve others' work and return cross-boundary changes to the primary.
- Primary owns the specification/plan, frontend shared API types, contract decisions and final reconciliation. Backend shared repository files belong to the backend implementer; do not split those across writers.
- T4 review and T5 final verification follow completed writers sequentially. In Mode B, the primary performs all work, review and verification inline.

## Acceptance trace

| Acceptance criterion | Implementation | Required evidence |
| --- | --- | --- |
| AC1 New user persistence | T1–T3 | Invitation create/accept round trip and directory display using distinct identities |
| AC2 Existing user editing | T2–T3 | Add/change/clear, reload, other-user isolation and role/status preservation |
| AC3 Validation/compatibility | T1–T3 | Null/omission/blank/Unicode/limit/control-character tests; strict union rejection |
| AC4 Access/integrity | T2, T4 | CAS, protected and unauthorized targets, audit rollback, unchanged sessions/grants |
| AC5 Invitation safety | T2, T4 | Resend and old invitation acceptance; disabled/unavailable mail no writes |
| AC6 UI behavior | T3–T5 | Rendered keyboard/error/conflict/dirty-state/cache-refresh and responsive checks |
| AC7 Integrated validation | T4–T5 | Focused regressions, typechecks/builds, live local schema and hygiene results |

## Execution record

- Specification: approved by the user.
- Task plan: approved by the user.
- Execution mode: A, parallel sub-agents.
- T1: complete. Baseline saved under `/private/tmp/lisno-user-location-20261125/`; only the specification and plan were initially untracked, and all product targets were clean. Primary established the optional nullable frontend fields and strict location-only mutation type.
- T2: complete, including invitation acceptance, existing-user persistence and both integrated review corrections below.
- T3: complete; 72 focused frontend tests and typecheck passed. Primary owns shared frontend API types, documents, integration and rendered QA. No permanent QA fixture changes were needed.
- T4: complete. Both confirmed findings were corrected and reviewed. Stored audit values remain intact while non-Super-Admin reads redact this action's location values; location edits preserve existing invitation/reset authority. No blocking defect remains.
- T5: complete. Browser flows passed at 1440px and 390px, including keyboard save, normalized values, refetch, prefill, clear, ordinary-error retention, conflict review and invitation serialization. No page overflow, runtime errors or axe violations. Screenshots were visually inspected after drawer animation settled. Final commands and runtime verification passed as recorded below.
- Runtime follow-up: while implementation verification was ongoing, the user encountered a location PATCH validation error. Live local `/openapi.json` confirmed the existing process still lacked the new Location contract. Reload the known local no-seed development supervisor after the review correction and verify live schema/readiness before handoff.
- Review correction: current invitation and password-reset authority checks reuse `User.version`. Location-only CAS increments would invalidate these existing links. Preserve the approved no-access-side-effects behavior with a private profile-version offset: old users default to zero, changed location writes increment both CAS version and offset, and authorization fences use their difference. Other user mutations still advance authorization fences. Update token/source capture and validation consistently, including memory/Mongo presentation; password-reset completion retains CAS against the current raw user version. No public field, migration or permission change. Verify old/new invitations and pending resets across repeated location edits and ensure real access/credential changes still invalidate them.
- T4 correction review complete: audit privacy and authority-version behavior are resolved; no blocking source defect remains. Focused reset regressions passed 10 location scenarios and invitation regressions passed 4 scenarios across memory and isolated Mongo. Full affected suites subsequently passed in final verification.
- Live local backend reloaded using the existing `npm run dev` supervisor, without seeding/resetting data. Live OpenAPI now confirms Location on user PATCH, directory records and invitation creation. Health returned HTTP 200, rules readiness and OCR startup were confirmed. Runtime evidence: `/private/tmp/lisno-user-location-20261125/runtime-check.json`. No real users were edited and no real invitations were sent during verification.

### Final verification evidence

From `frontend/`:

```sh
npm test -- src/features/admin/UserInvitationDialogs.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/userInvitationsApi.test.ts src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserDeletionDialog.test.tsx
# 6 files, 72 tests passed; exit 0.
npm run typecheck
npm run build
# Both exit 0.
```

From `backend/`:

```sh
npm test -- tests/user-location.test.ts tests/user-administration.test.ts tests/user-invitations.test.ts tests/user-invitation-repository.test.ts tests/user-invitation-models.test.ts tests/user-administration-mongo.replica-set.test.ts tests/user-invitations-mongo.replica-set.test.ts
# Initially 245 passed, 1 failed: existing DTO key assertions needed the approved location field.
npm test -- tests/user-invitations-mongo.replica-set.test.ts
# After updating both assertions and checking historical null values: 34/34 passed, exit 0.
# Combined final core coverage: 246 tests passed.
npm test -- tests/auth-session-revocation.test.ts tests/super-admin-authorization.test.ts tests/authorization-policy.test.ts tests/audit-security.test.ts tests/password-reset.test.ts tests/password-reset-mongo.replica-set.test.ts tests/procurement-vendor-access.test.ts tests/procurement-vendor-access.replica-set.test.ts tests/project-client-invitations.test.ts tests/project-client-invitations-mongo.replica-set.test.ts
# 10 files, 361 tests passed; exit 0.
npm run typecheck
npm run build
# Both exit 0.
```

Total distinct final coverage: **607 backend + 72 frontend = 679 tests passed**. Tests used isolated databases and fake mailers. Root `git diff --check`, `git status --short` and final scope inspection passed; only intended source/tests/documents changed, with no dependency or lockfile changes.

Browser evidence is under `/private/tmp/lisno-user-location-20261125/browser-report.json` and `output/playwright/` in that temporary directory. Synthetic browser mutations exercised the actual UI; backend HTTP and replica-set suites separately verified persistence, transactions and invitation acceptance. QA browser and task-owned Vite port 5189 were stopped. The refreshed existing local application services remain running for the user. Build outputs in `frontend/dist` and `backend/dist` are ignored artifacts.

### Limits and remaining baseline issues

- Two unrelated API documentation assertions failed during the broader backend checks and were reproduced on isolated HEAD: the existing Mode tier enum includes `default`, and the route inventory has 535 entries while an older assertion expects 534. No unrelated contract was changed to satisfy them. Evidence: `backend-shared-check.log` and `backend-baseline-api-docs.log` in the temporary QA directory. The new Location OpenAPI checks passed.
- Existing Vite large-chunk warning (main JS 3,501.31 kB) and Mongoose `new` option deprecation warnings remain.
- Full repository/OCR suites were not run; changed feature, identity, invitation and reset paths were covered above. No lint script exists.
- Review noted that invitation aggregation subtracts the private offset without the helper's malformed-metadata guard; normal application writes cannot produce invalid offset state. No external input accepts this field.
- No migration, backfill, seed, commit, push, remote deployment, real email or application-user mutation was performed. Runtime verification used schema/health reads only.

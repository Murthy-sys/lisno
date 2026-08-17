# Task 13 report — Atomic frontend authorization snapshots

## Scope

- Plan task: Task 13 only.
- Base HEAD: `5ccea264d7411959c1badb1d9bee1aa8e5671172`.
- Commit: this commit, subject `feat: load frontend authorization snapshots`.
- Added the dependency-free frontend authorization contract, strict snapshot parsing, atomic identity/authorization establishment, exhaustive staged role consumers, explicit authorization fixtures, and the backend drift gate.
- Did not add Task 14 Admin/Super Admin pages, routes, navigation, permission-gated UI, or any Prompt 2 behavior. Existing Client routes and behavior remain unchanged.

## Contract, parser, and parity

- The frontend contract declares the exact 16 roles and labels, six project modules, four requestable modules, Worker and operational role families, 91 permissions including the reserved override, requestability map, and policy version `2026-08-17.prompt-1` without React, browser, or backend runtime imports.
- `frontend/src/api/types.ts` re-exports the canonical `Role`; the previous five-role union is gone. Evaluation records now also accept `super_admin` as an evaluator role.
- The strict parser rejects malformed/extra fields, unknown roles, role mismatch, missing or stale policy versions, malformed or oversized permission arrays. Unknown individual permissions are omitted, duplicates are removed, and retained permissions are returned in canonical order in a frozen snapshot.
- `hasFrontendPermission` fails closed for a missing snapshot or a permission absent from the validated snapshot.
- The backend parity test imports the frontend dependency-free module directly and independently compares every mirrored constant to backend sources.

## Atomic session and race behavior

- Auth state stores either one complete `{ user, authorization }` session or `null`; consumers cannot observe an authenticated identity with missing authorization.
- Restore issues `/auth/me` and `/auth/authorization` together under one generation, token, and AbortController, validates the unwrapped snapshot, and commits both values atomically. Failure of either sibling aborts the shared controller.
- Login and signup retain the existing POST API surface, then establish the replacement token's authorization under the owning generation before committing the session. An account switch hides the prior session immediately while its POST is pending.
- Logout, establishment failure, accepted 401, replacement-token 401, supersession, and unmount clear or protect state according to token/generation ownership. Cache cancellation/clearing cannot remove a newer session's cache.
- Regression tests cover stale restore/login/signup responses, both restore signals on logout and unmount, old-session suppression during a deferred POST, authenticated login 401, pending replacement-token 401, and accepted-session 401.

## Exhaustive role consumers and fixtures

- All 16 roles have defined home paths, landing content, canonical sidebar labels, navigation arrays, and role feedback.
- The approved 11 staged roles use a real restricted `/home` route. Admin and Super Admin remain neutral there until Task 14; no future module links were exposed.
- Navigation arrays and items are frozen in production. The 11 newly staged roles receive an explicit shared frozen empty array.
- Every brief-listed authenticated frontend fixture now explicitly serves `/auth/authorization` through `authorizationFor(role)`; the shared render helper does not auto-stub authorization.
- The test-only render helper aligns jsdom's AbortController with the active Request implementation when Node and jsdom realms differ, allowing MSW to exercise real request cancellation without weakening AuthProvider.
- A distinct Super Admin evaluation is rendered in Designer Detail trend/history while remaining excluded from a Manager's correction choices, which still require both evaluator user ID and evaluator role.

## TDD evidence

RED:

- Contract/parser tests initially failed because both new frontend modules were absent; the backend parity suite failed because the dependency-free frontend contract was absent.
- Atomic-provider tests initially had 9 intended failures with 16 existing cases passing.
- Exhaustive consumer expansion produced 58 intended failures with 96 existing cases passing; staged routing produced 37 intended failures with 21 existing cases passing.
- Three later race regressions each failed independently before their fixes: authenticated account-switch POST 401 retained the old session, a deferred account-switch POST exposed the old session, and pending replacement-token 401 retained user A's cache.
- The explicit MSW fixture pass exposed seven test-runtime AbortSignal realm failures; the test-only Request/AbortController alignment reproduced and resolved that harness issue without changing production request behavior.

Focused GREEN:

- Contract/parser/provider: 3/3 files, 46/46 tests passed.
- Exhaustive role consumers and staged routing: 5/5 files, 224/224 tests passed.
- Super Admin evaluator behavior: 1/1 file, 2/2 tests passed.
- Explicit authorization fixture cascade: 16/16 files, 91/91 tests passed.
- Backend parity: 1/1 file, 2/2 tests passed.
- Final focused AuthProvider rerun after strengthening unmount signal evidence: 1/1 file, 28/28 tests passed.

## Final verification

Exactly one fresh full suite per workspace after self-review:

- Frontend `npm test`: 65/65 files, 696/696 tests passed in 9.94 seconds.
- Backend `npm test`: 51/51 files, 934/934 tests passed in 9.86 seconds.
- Frontend `npm run typecheck`: passed.
- Backend `npm run typecheck`: passed.
- `git diff --check`: passed during self-review; the staged diff is checked again immediately before commit.

## Concerns and boundaries

- The backend suite continues to emit the pre-existing Mongoose `new` option deprecation warning; Task 13 does not change repository update calls.
- Current permission checks are deliberately only the validated snapshot primitive. Task 14 owns permission-gated Admin/Super Admin UI and final homes.
- Existing route-shielded role fallthroughs in future manager/estimate surfaces are outside Task 13; this task does not expose those surfaces to newly staged roles.

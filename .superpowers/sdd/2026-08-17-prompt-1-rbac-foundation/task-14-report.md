# Task 14 report — Permission-aware frontend routing

## Scope

- Plan task: Task 14 only.
- Base HEAD: `105d942ca97e86178c3329ba0595b8334d4e879c`.
- Commit: this commit, subject `feat: add permission-aware frontend routing`.
- Added the canonical frontend route registry, permission and presentation-role guards, generic non-disclosing denial, staged Prompt 1 pages, final role homes, and registry-derived desktop/mobile navigation.
- Preserved the existing Client, Designer, Manager, Head, and Estimator/Sales screens. Did not add Task 15 user APIs/UI, Task 16 access-request APIs/UI, a Prompt 8 global browser, or Prompt 2 behavior.

## Permission and routing behavior

- `ROUTE_REGISTRY` contains the exact 18 approved paths with their permission, presentation-role, navigation-role, label, destination, exact-match, and icon metadata.
- Every registered screen receives permission and presentation roles from the same registry entry. A valid session missing either condition renders Access Denied in place rather than redirecting or destroying the session.
- `ProtectedRoute` retains restoration, sign-out, retryable error, and unauthenticated login behavior. It also fails closed if an authenticated shell lacks either identity or its validated authorization snapshot.
- The Admin and Super Admin final homes are `/admin/users`; every approved operational/Worker neutral home remains `/home`; the five established product role homes are unchanged.
- `/admin/users`, `/admin/access-requests`, and `/access-requests/mine` mount non-404, permission-guarded staged copy without actions that call unimplemented APIs.
- Unknown authenticated paths render Page not found in place and never gain access-request context. The established root entry continues to resolve to the signed-in role's home.
- Admin and Super Admin remain outside personal-workflow presentation roles even when their backend snapshot contains a corresponding read permission.

## Safe denial and navigation

- Direct route denial is generic. A Request access link can appear only when a caller supplies an already-known project/module context, the current role is contract-eligible for that module, and the validated snapshot contains `access_request.create`.
- The action serializes only `projectId` and `module` through `URLSearchParams`; generic registry guards and 404s pass no context.
- Sidebar and mobile navigation require the same validated snapshot as the shell and filter registry entries by both their explicit navigation roles and permissions. A role-mismatched snapshot returns a frozen empty list.
- Returned navigation arrays and cloned items are frozen. Sidebar role names come from the shared authorization contract rather than a local duplicate map.
- Super Admin and Admin receive Users and Access requests only; Designer adds My access requests; Procurement, Finance Head, and Site Manager receive My access requests plus Home; every Worker trade receives Home only; established destinations remain unchanged.

## Authorized fixture-scope addition

- `frontend/src/test/authFixtures.ts` is the controller-authorized addition to the Task 14 file map. Its private exhaustive `Record<Role, readonly PermissionCode[]>` supplies only the minimal realistic registered-route permissions needed by each role's existing or staged screens, plus base identity permissions.
- It does not synthesize permissions in production and does not give every role every permission. An explicit `authorizationFor(role, permissions)` argument remains authoritative for denial and race tests, and every returned permission array remains frozen.
- Focused navigation characterization proves the defaults expose only the intended registered navigation roots for all 16 roles; router tests independently prove the presentation-role boundary remains authoritative.

## TDD evidence

RED:

- New guard/denial/home tests failed as three missing-module suites with zero collected tests before their production modules existed.
- The initial route/navigation contract run failed all four target files with 55 failing and 124 passing assertions before the registry, final homes, permission guards, and navigation consumers existed.
- The first integrated rerun retained two obsolete legacy redirect expectations; the new in-place denial/404 behavior was then characterized according to the approved Task 14 contract.

Focused GREEN:

- Permission guard, denial, and neutral page: 3/3 files, 9/9 tests passed.
- Route paths, router, navigation, and shell: 4/4 files, 179/179 tests passed.
- Accessibility: 1/1 file, 14/14 tests passed, including generic denial focus, neutral Worker home, and desktop/mobile navigation.
- Frontend `npm run typecheck`: passed.

## Final verification

Exactly one fresh full frontend suite after self-review:

- Frontend `npm test`: 68/68 files, 725/725 tests passed in 10.54 seconds.
- Frontend `npm run typecheck`: passed before the fresh full suite.
- `git diff --check`: passed during self-review and is checked again on the staged Task 14 diff before commit.

## Concerns and boundaries

- The staged pages deliberately contain copy only. Tasks 15 and 16 own their actual data/API interfaces while retaining this task's route metadata.
- Hidden navigation is presentation only; backend authorization remains authoritative.
- No generic guard constructs a project access-request context. A future resource page may supply one only after it has safely resolved a known, non-hidden project.

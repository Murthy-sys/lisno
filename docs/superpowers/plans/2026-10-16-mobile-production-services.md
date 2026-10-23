# Mobile production service switch task plan

Date: 2026-10-16
Status: Approved and completed on 2026-10-16 using Mode A. Configuration and public health checks passed; device activation was not performed.
Specification: [Mobile production service selection](../specs/2026-10-16-mobile-production-services-design.md), approved by the user on 2026-10-16.

## Scope and ownership

- The primary agent owns the configuration edit, integration, final diff, and handoff.
- The only product file to change is `mobile/.env.local`. Preserve its existing local URL, development variant, and unrelated entries.
- Do not modify application source, package/lockfiles, native identity, signing, backend settings, or production data. No APK build, deployment, commit, or push is included.
- Initial state: no tracked changes; the new specification is untracked. Recheck this baseline before implementation and preserve any subsequent unrelated changes.

## Dependency-ordered tasks

### 1. Capture the configuration baseline

Owner: Primary agent. Dependencies: Task-plan approval and execution-mode selection.

- Recheck `git status --short` and the target diff.
- Inspect only the relevant configuration keys, without exposing credentials or unrelated values.
- Record the prior selector, HTTP flag, and remote-entry absence for rollback; preserve the exact local URL.

Acceptance: AC5; the target and any existing changes are understood before editing.

### 2. Select production services

Owner: Primary agent. Dependency: Task 1.

- Set `EXPO_PUBLIC_API_ENV=remote`.
- Add `EXPO_PUBLIC_REMOTE_API_URL=https://lisno.onrender.com/api/v1`.
- Set `LISNO_ALLOW_LOCAL_HTTP=0`.
- Preserve `LISNO_APP_VARIANT=development`, the local URL, and all other settings.

Acceptance: AC1, AC2, AC5; the existing resolver selects production services without changing app identity or introducing fallbacks.

### 3. Verify the integrated configuration

Owner: Primary agent in Mode B; a read-only verification sub-agent may own local checks in Mode A while the primary performs the independent health check. Dependency: Task 2.

- Load the actual `mobile/.env.local` through the existing configuration tooling. Assert Remote selection, the expected HTTPS API base with one `/api/v1` suffix, disabled cleartext HTTP, and the unchanged development package/variant. Report selected non-secret assertions only.
- Run from `mobile/`: `npm test -- --runInBand app.config.test.ts src/core/config/environment.test.ts`.
- Retry an unauthenticated read-only GET to `https://lisno.onrender.com/api/v1/health` with a bounded timeout. Report the HTTP/health outcome or connection failure; do not authenticate or write production data.
- Review the target diff and run `git diff --check` and `git status --short`.

Acceptance: AC1–AC5. Configuration validation and endpoint availability are reported independently. No new tests, full suite, native build, or UI checks are necessary for this settings-only change.

### 4. Hand off the result

Owner: Primary agent. Dependency: Task 3.

- Report the changed file, exact checks/results, health-check limitations, and any checks not run.
- Explain that an existing development app needs Metro restarted and `npm run android` rerun from `mobile/` to refresh bundled/native settings. An existing standalone APK is unchanged by the repository edit.
- State that the service target is production while the app identity remains development. Device login and authenticated workflow verification are outside this change.
- Rollback restores the prior Local selector and HTTP flag and removes the newly added Remote entry; it preserves the existing local URL.

Acceptance: AC5; repository configuration and installed-device activation are clearly distinguished.

## Parallelism and execution boundary

Keep one parent task in progress. The baseline and edit are sequential. Within Task 3, local configuration/tests and the public health request can run independently; final reconciliation follows both. In Mode A, delegate only the bounded read-only local verification, with no shared-file writes. In Mode B, perform all work inline.

Implementation starts only after this plan is approved and the user selects execution mode A or B, as required by `AGENTS.md`.

## Execution evidence

- Tasks 1–2: Confirmed the clean target baseline, then changed only `mobile/.env.local` to Remote with the documented production HTTPS URL and `LISNO_ALLOW_LOCAL_HTTP=0`. Preserved the local URL and development identity.
- Task 3, independent verification: `npm test -- --runInBand app.config.test.ts src/core/config/environment.test.ts` from `mobile/` passed 23 tests across 2 suites, exit 0.
- The verification agent loaded the actual environment using installed `@expo/env` and `@expo/require-utils`, evaluated `app.config.ts` and `environment.ts`, and passed 19 assertions: exact Remote target, one API suffix, disabled cleartext, unchanged development package/variant, unchanged local URL, and bounded configuration differences from HEAD.
- Public health: the sandbox could not resolve the host. The approved network-enabled retry using `curl --silent --show-error --connect-timeout 15 --max-time 45 --output /tmp/lisno-mobile-production-health-20261016.json --write-out 'HTTP %{http_code}\n' https://lisno.onrender.com/api/v1/health` returned HTTP 200; the JSON body reports `data.status=ok`. The public response is temporary evidence at the specified `/tmp` path.
- Final source review shows only the three intended environment changes. `git diff --check` passed; status contains `mobile/.env.local` and these two working documents only.
- Task 4: Handoff requires restarting Metro and rerunning `npm run android` from `mobile/` to activate this configuration in the existing development app. No device activation, authenticated workflows, full suite/typecheck, APK/native build, production mutation, deployment, staging, commit, or push was performed. No dependencies were added.

# Mobile production service selection

Date: 2026-10-16
Status: Approved and implemented on 2026-10-16; local configuration verification passed. Existing installed apps still require restart/rebuild.
Classification: Small, localized environment configuration change

## Goal

Configure the existing `mobile/` app to use the deployed production backend instead of the local development backend.

## Current behavior and evidence

- The initial tracked worktree is clean. `mobile/.env.local` is tracked despite the directory's ignore pattern.
- That file selects `EXPO_PUBLIC_API_ENV=local`, provides only the local HTTP API URL, uses `LISNO_APP_VARIANT=development`, and enables `LISNO_ALLOW_LOCAL_HTTP=1`.
- `mobile/src/core/config/runtimeEnvironment.ts` reads the selected environment and URL. `environment.ts` requires a deployed HTTPS URL for Remote, normalizes `/api/v1`, and never automatically falls back to Local.
- `mobile/app.config.ts` separates backend selection from application identity. A development app can use the Remote backend; changing its identity to production requires a separate approved package ID.
- The prior production service work documents `https://lisno.onrender.com/api/v1` as the public production API. The specification-stage health check timed out; the implementation-stage network-enabled retry returned HTTP 200 with `data.status=ok` on 2026-10-16.
- `mobile/README.md` documents restarting Metro and rebuilding the development app after environment changes. Tokens and query state are already scoped by environment identity.

## Scope and requirements

1. Update only the service configuration in `mobile/.env.local`: set `EXPO_PUBLIC_API_ENV=remote`, add `EXPO_PUBLIC_REMOTE_API_URL=https://lisno.onrender.com/api/v1`, and set `LISNO_ALLOW_LOCAL_HTTP=0`.
2. Preserve the existing local URL for an explicit future switch and preserve `LISNO_APP_VARIANT=development` and the existing package/signing identity.
3. Use the existing environment resolver and HTTP client for API, authenticated files, and related services. No new URL mechanism or fallback is needed.
4. Include only the public API URL in mobile configuration. No credentials, database connection strings, or tokens are added.

## Non-goals and impacts

- No application UI, API contract, authentication behavior, backend deployment, database change, dependency change, distribution build, or production signing change.
- Existing application actions will target production after reload/rebuild. Verification will not authenticate, upload, send messages, or mutate production records.
- Existing local sessions remain separate through the current environment-scoped storage. A production sign-in may be required; do not clear app data.

## Assumptions, constraints, and risks

- “Prod” means the deployed services, while the current development app identity remains suitable. A release APK is outside this request.
- The documented production URL is the intended endpoint, subject to a fresh public health check. If it cannot be verified, report that limitation; do not substitute a guessed host.
- An already running Metro process or installed standalone APK may retain old bundled configuration. The handoff must distinguish the updated repository setting from device activation.
- Local mobile source may differ from the deployed API. Configuration validation does not establish full authenticated workflow compatibility.
- Rollback restores the previous selector and HTTP flag and removes the added remote entry. Keep the existing local URL unchanged.

## Acceptance criteria and verification

- AC1: Loading the actual mobile environment resolves `remote` and the configured HTTPS production API base with exactly one `/api/v1` suffix.
- AC2: Resolved Expo configuration disables cleartext HTTP and retains the existing development app identity.
- AC3: Existing focused tests pass: `npm test -- --runInBand app.config.test.ts src/core/config/environment.test.ts` from `mobile/`. Inspect the actual resolved configuration without printing secrets; no new tests are needed for this settings-only change.
- AC4: Attempt a read-only unauthenticated production `/health` request and report its actual result. Unavailability is reported separately from correct local configuration.
- AC5: Review the final diff and run `git diff --check`. No unrelated source, lockfiles, production writes, commits, or deployments are included. Report the restart/rebuild needed for an existing running app.

## Open decisions

None for the bounded configuration switch. A replacement endpoint is needed only if the documented production address is no longer correct.

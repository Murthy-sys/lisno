# Mobile router entry conflict — design specification

- Date: 2026-09-21
- Status: Draft for approval
- Classification: Small localized mobile startup fix
- Affected area: `mobile/src/app`

## Goal

Restore the Lisno mobile application startup by ensuring Expo Router resolves exactly one `/index` route.

## Current behavior and evidence

- Expo reports that `./index.tsx` and `./index.js` both resolve to `/index`.
- `mobile/src/app/index.js` is the obsolete Expo starter screen that renders “Hello World.”
- `mobile/src/app/index.tsx` is the current Lisno startup router. It handles configuration, session restoration, onboarding, recovery, access denial, and the role-authorized landing route.
- Git history shows the JavaScript starter existed before commit `554ea65`; that commit added the TypeScript startup router without deleting the starter.

## Required change

- Remove only `mobile/src/app/index.js`.
- Keep `mobile/src/app/index.tsx` as the single `/index` route.
- Preserve the current root layout, runtime provider, onboarding, authentication, and role-based landing behavior.
- Do not modify the active Expo log, backend review changes, dependencies, lockfile, or unrelated mobile features.

## Risks and controls

- A stale Metro route cache may continue to display the old conflict after the file is removed. Verification will run Expo routing/export with cache-aware guidance if a running client needs a reload.
- Removing the wrong entry could bypass startup routing. The TypeScript route will be retained and covered by the existing onboarding/startup tests.

## Acceptance criteria

1. `mobile/src/app` contains only one index route implementation.
2. Expo no longer reports a duplicate `/index` route.
3. Mobile TypeScript checking passes.
4. Startup/onboarding routing tests and the relevant mobile test suite pass.
5. Android Expo export completes without route-conflict errors.
6. Repository hygiene checks pass, with pre-existing backend changes and the active Expo log left untouched.

## Migration and external effects

No data migration, dependency change, production mutation, deployment, or publication is required.

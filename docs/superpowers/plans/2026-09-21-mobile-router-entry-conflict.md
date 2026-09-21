# Mobile router entry conflict — task plan

- Date: 2026-09-21
- Status: Draft for approval
- Classification: Small localized mobile startup fix
- Source: [Mobile router entry conflict specification](../specs/2026-09-21-mobile-router-entry-conflict-design.md)

## Tasks

1. Capture the current mobile route files and dirty paths so unrelated backend work and the active Expo log remain untouched.
2. Delete the obsolete `mobile/src/app/index.js` Expo starter, retaining `mobile/src/app/index.tsx` as the sole `/index` route.
3. Verify route uniqueness and run mobile TypeScript checking plus focused startup/onboarding tests.
4. Run the mobile test suite and Android Expo export to prove Metro resolves the route graph.
5. Run `git diff --check` and report the exact task diff separately from unrelated workspace changes.

## Ownership and sequencing

This is one atomic file removal followed by dependent verification. It has no useful parallel implementation slice and should be completed inline.

## Acceptance

- Expo Router sees one `/index` route.
- Existing startup, onboarding, authentication, and role-based redirects remain intact.
- Typecheck, relevant tests, Android export, and repository hygiene pass, or any external-tool limitation is reported with exact evidence.
- No dependency, lockfile, backend, active log, migration, deployment, or production change occurs.

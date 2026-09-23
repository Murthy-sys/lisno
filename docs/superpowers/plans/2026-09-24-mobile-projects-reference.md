# Mobile Projects redesign plan

Specification: [design](../specs/2026-09-24-mobile-projects-reference-design.md). Mode A and approval waiver persist. Implementation, integrity review, automated verification and native Android inspection complete.

1. Read-only contract audit and dirty baseline (complete): role endpoints, pagination, status/metadata semantics, permissions and initiation mismatch.
2. Architectural asset (parallel, isolated): generated decorative header under mobile/assets/brand; no project photographs or remote publishing.
3. Initiation action slice (parallel): owns only ProjectCreateActions.tsx and focused new tests. Add reference-style native trigger while keeping forms/permissions/invalidation; fix admin/super_admin assignee parameter to established backend contract.
4. Primary owns ProjectsWorkspace, presentation/query helpers/tests and FeatureWorkspace integration. Build paginated native list, source-correct counters/filters/cards and responsive composition. Do not modify shared navigation/token files.
5. Independent integrity review after writers finish, then focused verification/typecheck/Android export and native visual checks. Resolve findings; remove any temporary QA fixture route and generated type references before final export.
6. Record affected paths, checks, limitations and artifacts. Preserve concurrent work and exact existing runtime-log prefixes; no staging/commit/deploy or data creation during QA.

## Delivered changes

- `ProjectsWorkspace.tsx` and `ProjectCard.tsx`: dedicated reference composition, architectural heading, cream/forest styling, summary counters, accessible status picker, native virtualized project cards, missing-photo/phase labels and genuine source dates. Shared Back/header/dock preserved.
- `projectsModel.ts` and `useProjects.ts`: role-specific private paginated queries, validated page shape/offsets, latest-page totals, stable-ID deduplication, explicit loaded-status count scope, retry and refresh handling. No new backend query parameters or endpoint.
- `ProjectCreateActions.tsx`: styled action opening the existing form; Admin/Super Admin now select Sales users using the existing `estimatorId` contract. Authorized Sales actors retain `salesManagerId`. Permission gates and scoped invalidation retained.
- `FeatureWorkspace.tsx`: routes only Projects into its dedicated workspace. Other feature branches unchanged.
- `projects-architecture.jpg`: newly generated decorative brand image, 1200×600, 132,869 bytes. Generated via built-in imagegen, inspected and optimized with existing sips. Not presented as project photography. No dependencies added.

## Follow-up: match the second header reference

Current mismatch: separate plain Back strip, repeated arches without the right-hand lettering, and oversized spacing/action. Dirty baseline captured under `/tmp/lisno-projects-header-match-20260924`.

1. Asset worker owns only new `projects-architecture-reference.jpg`, matching the single arch/right-side wall lettering from the second crop.
2. Primary owns Projects header composition, compact action styling and an explicit scaffold/content Back placement option. Existing Back policy and all data behavior preserved. Update existing rendered Back/Projects regressions.
3. Verify actual Android header + Back/action, focused tests/typecheck/export, enlarged text where spacing changes; record screenshot and exact result. Earlier approval waiver persists, no new gate.

Follow-up implementation complete: one continuous 170-point header contains the existing guarded Back control, title and description. A new 1200×520 / 84,882-byte decorative asset supplies the single arch and handwritten “Spaces / People / Progress”. The action is 60 points at normal text size and expands with text. Original asset retained, shared guard context identity preserved, default/immersive navigation unchanged.

Follow-up focused tests: **54 passed in 4 suites** (Projects workspace/action, scaffold navigation and chat guard regression). Independent navigation review found no defects. Android confirmed one Back control returning to the dashboard, opening the initiation form without submitting, and unclipped header/action at 1.5 font scale. Preferences restored. Evidence: `/tmp/lisno-projects-header-match-20260924/projects-header-final.png`, `projects-header-large-text.png`, `native-result.json`. No dependencies, data/API changes or native resource rebuild required.

Follow-up final typecheck, Android export and diff check exited 0. Export: 2,743 modules, 38 assets, 8.3 MB; all 59 scoped source hashes stable. Own export-log suffix archived/removed, existing shared logs preserved. Exact commands and platform limits: `/tmp/lisno-projects-header-match-20260924/final-verification/verification-report.md`. Native iOS remains unverified.

## Verification

- Project-focused run: 57 tests passed across 5 suites.
- Independent integrity review found a pagination freshness defect: first-page total could hide a gap after overlapping pages. Fixed to use latest server total and mark any loaded-count mismatch partial; added regression. No other confirmed findings.
- Final integrated lane: **229 tests passed across 16 suites**, including Projects, feature definitions, capabilities, invalidation and navigation. `npm run typecheck` and `git diff --check` exited 0.
- After the native enlarged-text adjustment, all 12 workspace regressions, typecheck, clean export and diff check passed again; source hashes stayed stable.
- Android export passed: 2,743 modules, 38 assets, 8.3 MB bundle. Asset included and verified. All 76 source hashes stayed unchanged during final tests/export.
- Export command: `EXPO_NO_TELEMETRY=1 npm exec -- expo export --platform android --output-dir /tmp/lisno-mobile-projects-reference-20260924/android-export-final`.
- Native Android: actual account-scoped list rendered; All → On hold empty state → Show all passed; initiation form opened and cancelled without submission; stable-ID project detail and Back passed. Font scale 1.5 inspected; summary adapts to two columns to avoid broken words and card metadata remains accessible. Original font setting restored and app returned to Projects. Final typography/layout captures under `/tmp/lisno-mobile-projects-reference-20260924`; assertions in `native-result.json`.
- Task-owned export log suffix archived and removed by exact match; pre-existing runtime logs retained. No temporary app routes introduced.
- Evidence/commands: `/tmp/lisno-mobile-projects-reference-20260924/final-verification/verification-report.md`.
- Full mobile suite not repeated for this bounded slice; prior unrelated contract-inventory mismatch (224 vs 227) remains outside scope. Native iOS, physical tablet and production release build were not run. No migrations, data submissions, commits, pushes or deployment.

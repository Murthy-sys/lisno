# Procurement items under estimate budgets — plan

Spec: [design](../specs/2026-09-18-procurement-items-only-design.md).

1. Source/consumer audit and initial removal — complete. The clarified request supersedes flat-only display. Original baseline92 dirty paths and subsequent steered baseline97 are captured under `/tmp/lisno-procurement-items-only-qa/`; three frontend removal edits and the two task documents belong to this task. All other work must be preserved.
2. Implement frozen contract — complete. Backend owner: project-procurement domain/model/service/route/OpenAPI, narrow canonical resolver helper, named source-index migration and focused tests. Frontend owner: API types/client, grouped estimate UI, item editor/table scoped queries, local styles and focused tests. Root owns product decisions, spec/plan, integration and browser verification. Both slices ran in parallel on non-overlapping workspaces.
3. Integrated integrity review and user-requested visual polish — complete; backend source, index compatibility, authorization, races and unchanged finance reviewed without findings. Full-page background refresh draft-loss finding corrected with three regression cases; reviewer closed the finding. Compact toolbar, section headers, budget alignment, expansion treatment and responsive CSS implemented after independent read-only UI audit.
4. Final verification after review corrections — complete. Focused backend+replica+migration and frontend suites, typechecks/builds and three-width rendered flow passed. Independent preservation audit found90/92 original dirty files byte-identical; the two expected OpenAPI/api-docs overlaps preserve all original hunks. No baseline paths disappeared, unrelated changes or lockfile edits. Generated browser artifacts relocated outside the repository.
5. Handoff — complete; local implementation and proportional verification only. Unapplied index migration remains an existing-database rollout prerequisite. No live database changes, commits or deployment.

Preliminary flat-only removal was checked with29 frontend tests/typecheck/build and360/768/1440 rendered Add item; those browser results are superseded by the clarified grouped design and must not be reported as final evidence.

## Final verification evidence

### Follow-up: soft table value chips
Complete. Root changed only `ProjectProcurementItems.tsx`, `projectProcurementItems.css` and these two task documents from the follow-up baseline in `/tmp/lisno-procurement-chips-qa/`. A parallel read-only token/mobile audit informed the field palette. All five data values use passive soft-color spans; neutral missing vendor and separate historical notes are preserved. Existing `npm test -- src/features/procurement/ProjectProcurementItems.test.tsx`:20/20 passed. Frontend `npm run typecheck` and `npm run build`:exit0. Browser1440/768/360px:axe0 and no horizontal overflow; long unbroken item/vendor names wrap with no chip overflow; editing still opens correctly; console0 errors/warnings. No new tests, backend changes, dependencies or deployment. Temporary browser/server stopped and dependency symlink removed. Logs/screenshots are under the follow-up QA directory; browser-checks.log, frontend-tests.log, frontend-typecheck.log, frontend-build.log, chips-1440.png, chips-768.png, chips-360.png and chips-long-mobile.png. The broader suites were not repeated for this presentation-only change.

- Backend: `npm test -- tests/project-procurement-routes.test.ts tests/project-procurement-mongo.replica-set.test.ts tests/project-procurement-source-index.replica-set.test.ts tests/procurement-routes.test.ts tests/procurement-mongo.replica-set.test.ts tests/api-docs.test.ts` — **152 passed / 6 files**, including70 replica-set cases. `npm run typecheck` and `npm run build` exit0.
- Frontend: `npm test -- src/features/procurement/EstimateProcurementItems.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/ProjectProcurementItems.test.tsx` — **39 passed / 3 files**. Final `npm run typecheck` and `npm run build` exit0.
- Browser: built real production components with synthetic authenticated transport in an isolated temporary Vite fixture. At **1440/768/360px**, correct approved budgets including zero, responsive child rows, no horizontal overflow and axe0. Mobile Add item form axe0; saved₹250.50 as25050paise under exact Living-room source only; Bedroom remained unchanged; approved budgets unchanged; Record purchase absent. Explicit legacy assignment submitted source+expectedVersion, removed the unassigned row and displayed it under the selected parent. Saved row persisted after back/reopen. Browser console0 errors/0warnings.
- Temporary evidence: `/tmp/lisno-procurement-items-only-qa/` — backend-final-tests.log, frontend-grouped-final-tests.log, backend-typecheck.log, backend-build.log, frontend-grouped-typecheck.log, frontend-grouped-build.log, browser-final-flow.log, grouped-desktop.png, grouped-768.png, grouped-360.png, grouped-mobile-editor.png, grouped-final-desktop.png. Browser/preview stopped; temporary node_modules symlink removed; CLI artifacts moved outside the repository.
- Full repository suites and live authenticated/production checks were not run. Browser transport was synthetic; real Mongo persistence/concurrency/index behavior was verified by the replica-set tests. No lint script exists.

## Existing-database rollout prerequisite — not executed

The old project-wide unique index would reject the same material under two distinct estimate items. Apply the narrowly scoped source-index transition as part of an explicitly authorized rollout, before enabling that behavior on an existing database. No document data is rewritten.

From `backend/`, with the intended database supplied securely through `MONGODB_URI`:

```sh
npx tsx src/migrations/project-procurement-source-index.ts --dry-run
```

Review the exact-index, malformed-source and duplicate reports and resolve conflicts. Retain the deployment's database backup/rollback plan. An authorized apply uses a new absolute metadata-backup filename and performs another inspection immediately before the index change:

```sh
npx tsx src/migrations/project-procurement-source-index.ts --apply --backup=/absolute/path/procurement-index-before.json
```

Rollback is deliberate and refuses if new cross-parent duplicates make the old uniqueness impossible; it does not delete or merge records:

```sh
npx tsx src/migrations/project-procurement-source-index.ts --rollback --backup=/absolute/path/procurement-index-before-rollback.json
```

Backup metadata files use exclusive creation and0600 permissions. Keep them outside Git. No live dry run, apply, rollback, production mutation, commit, push or deployment was performed.

# Projects reference layout: task plan

Date: 2026-09-25. T0–T6 complete and verified under explicit approval waiver and prior Mode A.
Specification: [Projects reference layout](../specs/2026-09-25-projects-reference-layout-design.md).

Single parent task: redesign and verify the Projects collection.

1. T0, root/auditor: inspect source data/authorization/UI, capture baseline dirty hashes/diff/target copies in `/tmp/lisno-projects-redesign-qa`. Complete.
2. T1, root: settle compact rows and list contract; durable specification/plan. Complete, property-type default stated pending optional clarification.
3. T2, backend owner: repository types/memory/Mongo, list service/route, narrow OpenAPI update and focused tests. Preserve dirty OpenAPI/API-doc tests. AC3–5. Independent of T3 after settled contract.
4. T3, frontend owner: AdminProjectsPage, admin-project-grid.css, adminProjectsApi, narrow api/types, page tests. Compact card/header/controls and responsive/accessible states. AC1–6. Root owns any shared shell changes; avoid shell unless evidence requires it.
5. T4, root: synthetic browser harness, visual baseline and rendered QA; integrate T2/T3. Independent harness preparation can run during writers. No real backend writes.
6. T5, integrity reviewer: read-only integrated source/diff/contract/permissions/financial lineage; root fixes confirmed findings. Depends T2/T3.
7. T6, verification runner/root: final focused suites, replica tests, both typechecks/builds, responsive browser interaction/axe and diff hygiene. Depends T5. Update completion evidence here.

Writers are not alone; preserve unrelated changes. Ownership excludes concurrent Configuration/vendor work. Exact target snapshots are in baseline directory, including already dirty backend OpenAPI files and frontend api/types. All unassigned edits remain intact.

## Verification plan

- Backend: admin-projects unit/routes plus Mongo replica-set suite (authorization across asymmetric admins and more than one page), API docs, repository impacted checks as needed. Literal search, status counts, stable ordering, validation. Both typecheck/build.
- Frontend: AdminProjectsPage, presentation, QuickView, initiation, AppShell as applicable; query URLs/keys, reset pagination, empty/error/stale, persisted view, amount parity and missing-baseline invariant. Both typecheck/build.
- Browser: real components, synthetic scoped responses, 1920/1440/1024/768/390/320 widths; title/client/city/type/cost geometry, header photo, loading/empty/error, statuses/search/sort across pages, grid/list, keyboard and axe. At least two unequal project amounts and long labels. No unexpected network or console errors.
- `git diff --check`, task-only diff and initial dirty hash comparison. No lint script exists.
- No staging, commit, push, deployment, seed, migration, customer mutation or new dependencies.

## Implementation and integrity evidence

Fifteen product/test files changed: ten backend (repository types/memory/Mongo, list service/route, OpenAPI, admin route/replica tests, Mongo repository tests, API docs tests), five frontend (API types, list API, Projects page/test, page CSS). The root owns this task's two durable documents. Existing shared shell, Configuration, vendor and mobile changes remain untouched.

All requested card rows use existing data. Project Type is the stated default for the repeated Project Name in the final row; no correction was received. The image is the existing decorative interior default, because no project-photo contract exists. No generated asset, dependency, model or migration was added. A real status/search/sort contract supports the screenshot's controls across pages. Backend rollout should precede frontend rollout.

Independent read-only integrity review passed with no confirmed defects. It checked scoped search/counts, binary identity protection, stable name/ID ordering, session sequencing, cache identity/pagination reset, stale-page handling, and approved-baseline-only cost semantics. Case-variant IDs have explicit Mongo regression coverage. Root browser QA additionally corrected the Initiate button's accessible name so the existing decorative CSS plus sign is not read as part of the command.

Name sorting intentionally loads matching authorized name/ID metadata into memory before page hydration, avoiding locale-sensitive authorization comparisons. It scales with matching collection size; newest is database-paginated. This is a documented tradeoff rather than a schema/index migration.

## Final verification

All 268 tests passed across ten files, including 26 Mongo replica-set tests. Both typechecks and production builds passed. Exact final commands:

```sh
cd backend
npm test -- tests/admin-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/api-docs.test.ts tests/repository.test.ts tests/mongo-repository.test.ts
npm run typecheck
npm run build
```

Backend result: 197/197 tests. Covers asymmetric Admin scopes, more than one page, inactive grants, all filter inputs, literal search, count invariance, newest/name ordering, case-variant ID authorization, session sequencing, and existing project workflows. Five existing Mongoose warnings recommend replacing deprecated `new` options with `returnDocument: 'after'`.

```sh
cd frontend
npm test -- src/features/admin/AdminProjectsPage.test.tsx src/features/admin/adminProjectPresentation.test.ts src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/components/layout/AppShell.test.tsx
npm run typecheck
npm run build
```

Frontend result: 71/71 tests. Existing Vite chunk-size warning over 500 kB remains. No lint script exists. Final automated logs are `/tmp/lisno-projects-redesign-qa/final-*.log`.

Fifteen product/test hashes were unchanged during the independent final automated lane. Afterward, root refined only the local header button CSS to override the existing role-theme hover shadow and retain a visible olive keyboard outline. That CSS was verified in the browser and the frontend production build was rerun successfully. Both default and hover shadow are now none; focused button has a solid 2px outline. No broader regression rerun was necessary for the isolated CSS refinement.

### Rendered checks

Actual AppShell and Projects components ran in Chromium against a loopback synthetic harness, with 28 unequal projects, long names, distinct costs and explicit missing/zero states. No real backend or customer data was used, and no write request occurred.

| Width | Grid columns | Page overflow | Paired rows / one-line title | Axe violations |
| --- | --- | --- | --- | --- |
| 1920 | 4 | None | Passed | 0 |
| 1440 | 4 | None | Passed | 0 |
| 1024 | 3 | None | Passed | 0 |
| 768 | 2 | None | Passed | 0 |
| 390 | 1 | None | Passed | 0 |
| 320 | 1 | None | Passed | 0 |

All toolbar/status targets measured at least 44px tall. Screenshots were inspected at desktop and phone widths, including long metadata and missing-baseline cards. Header artwork, image crops, top-left status overlays, single-line titles, two compact detail rows and visible focus were checked.

Interactions verified:

- Pagination reaches records 21–28; status and sort changes reset offset to zero. Search for Mumbai preserves the selected status and returns the project from beyond the initial page; counts report all three search matches before selected status.
- List choice survives reload. Quick view retains the right project ID and returns focus after Escape. Project link opens the expected workspace route.
- During delayed filtering, previous rows are explicitly announced, counts are hidden, quick view and pagination are disabled. Empty search retains controls and reset; simulated API error retains retry and recovers successfully.
- Initiation opens the existing dialog. Without initiate/assignment permissions, neither action is offered. My Projects heading is preserved for Admin.
- Loading uses the existing accessible status and skeleton; filters remain available. Keyboard opens Filter with a visible outline, including under reduced-motion settings.
- Approved values use the baseline rather than intentionally unequal current totals. Draft amounts include status. Missing approved baseline and no estimate are explicit; zero remains ₹0. Long text remains available in accessible names/title attributes and does not overflow.
- No unmocked requests, write requests, or unexpected browser errors were observed. The intentional simulated 503 is part of retry verification.

Evidence: `/tmp/lisno-projects-redesign-qa/browser-layout-final.log`, `browser-states-final.log`, `browser-edge-states.log`, `browser-button-final.log`, `projects-<width>.png`, `long-and-missing-320.png`, `loading-320.png`, `final-focus-320.png`, `task-only.diff`, and `dirty-comparison.json`. The initial state-check timeout was a locator expecting an accessible name without the CSS-generated plus; the explicit accessible label correction and final run passed.

### Handoff limits and hygiene

Full repository suites, physical-device/non-Chromium runs, and OCR checks were not run. Replica-set persistence/authorization tests complement the synthetic browser checks. No project photo upload exists, so cards use the established decorative default image. Name-sort metadata memory use remains the documented scaling consideration.

Initial 89 dirty paths were preserved outside explicitly assigned OpenAPI paths; shared shell, Configuration, vendor and mobile changes were not altered. Final `git diff --check` passed. No dependencies, lockfiles, model changes, migrations, staging, commits, pushes, deployment, seeds, or production mutations. Backend should be deployed before frontend when a separate rollout is authorized. Temporary browser/server and keep-awake process are closed after verification; QA artifacts remain outside tracked sources.

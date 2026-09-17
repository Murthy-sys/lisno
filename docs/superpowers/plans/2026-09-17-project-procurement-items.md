# Project procurement correction plan

Source: [specification](../specs/2026-09-17-project-procurement-items-design.md). Supersedes shared item catalogue behavior. Standing autonomous authority/Mode A apply. Implementation, review and final verification are finished; the known baseline signup failure is disclosed below.

## Initial state and ownership

Prior-turn catalogue changes are uncommitted, understood owned work. Initial dirty-path list, tracked binary diff and untracked source archive saved in `/tmp/lisno-project-procurement-qa/initial-*`. No unrelated dirty paths observed. Backend and frontend ownership remain separate; parent owns docs, contract and temporary rendered QA. No commits, migrations or production actions.

## Dependency-ordered tasks

1. **Evidence/contract — parent with read-only audits, complete.** Trace project eligibility, UOM/vendor Configuration sources and table location. Resolve optional vendor, independent quick-add, snapshots and project-scoped cache. AC1–7.
2. **Backend — procurement_backend, complete.** Own backend only, including replacing prototype catalogue files with project item model/domain/service/routes/OpenAPI/tests, shared registry/permissions/startup wiring and minimal session-aware access export in procurement service. Reuse vendor master + ordering allocator, transactional audits and lifecycle locks. Cover two projects, scoped identity/uniqueness, vendor persistence/races and existing finance invariants. AC1–5,7.
3. **Frontend — procurement_frontend, complete; parallel with 2.** Own frontend only: replace prototype with project-scoped components/API/types/cache, remove global home table, integrate project detail, Configuration UOMs, optional searchable saved vendors and inline quick-add. Keep compact responsive UI. Preserve existing purchase forms; update affected tests/fixtures and mirror permissions exactly. AC1–4,6–7.
4. **Browser QA — parent, complete.** Use actual shell/project components and synthetic APIs on loopback. Verify two projects with unequal values and shared vendors, add/edit/vendor quick-add, project switching, search/paging, unavailable reference/error/conflict/empty/focus states, widths360/768/1440, axe and request counts. Separately rely on replica tests for real persistence.
5. **Integrated integrity review — complete.** Inspect scope isolation, master identity, vendor race/audit/ordering, precision, permissions, cache and UI lifecycle; parent resolves findings.
6. **Final verification — verification agent, complete.** Focused project procurement/reference/previous procurement + authorization/API inventory/server tests; relevant frontend/editor/reference/project/router tests; both typechecks/builds; diff/status. Confirm known signup baseline if it appears. No OCR or full repository suites unless new evidence warrants them.
7. **Handoff — parent, complete.** Update durable evidence, clarify local implementation/deployment limits and any prototype data not migrated. Keep QA/runtime artifacts outside tracked sources.

## Verification evidence

Implementation and independent integrity review are complete. Final integrated verification is complete, with one confirmed unrelated baseline signup failure. Logs/screenshots are stored in `/tmp/lisno-project-procurement-qa`. No dependencies or lockfiles changed; no lint script exists.

- Writer verification: backend 268 focused tests, typecheck/build; frontend 20 item tests including final review fixes, typecheck. Earlier focused UI/shared checks passed before the final two regression additions.
- Browser interaction found and fixed a vendor-search keyboard race: old options are suppressed during debounce/loading, so immediate Enter cannot pick a stale vendor. Verified the corrected selection and shared stable vendor ID across two unequal projects.
- Integrity review found and fixed stale cached items after canonical project eligibility returns 404 or approval-lineage 409. Rows, mutation controls and open editor now disappear; the parent project list refreshes. Two regressions also prove recovery does not reopen an old draft. Ordinary 503 failures retain labeled stale data. Targeted reviewer recheck found no remaining concrete defect.
- Rendered QA: 360/768/1440px tables without horizontal overflow or axe violations; mobile editor/inline vendor creation; exact prices/CAS reload; project isolation and saved vendor reuse; independent vendor survives item cancellation; updated Configuration UOM appears after reference refresh. Browser uses actual application components with synthetic loopback APIs; real Mongo persistence and concurrency are covered separately by replica-set tests. Idle45seconds produced no additional requests (one initial project list and one initial project item list). Full browser evidence: `/tmp/lisno-project-procurement-qa/browser-evidence.md`. Temporary browser/server and node_modules symlink were cleaned up.
- Existing signup router test failure remains scoped for final verification; baseline evidence is `/tmp/lisno-procurement-catalogue-qa/baseline-signup-test.log`.


## Final integrated result

- Backend: typecheck and build exit0; 268/268 tests across11 files passed, including27 new project-procurement replica tests and23 existing procurement replica tests. The first sandbox attempt could not bind local HTTP/Mongo ports (EPERM); the identical escalated command passed.
- Frontend: typecheck and build exit0; 201 passed,1 failed across6 files. All20 new project-item tests pass. Sole failure: existing `marks interactive signup focus after a failed attempt is retried` expects the missing `Address` label in unchanged signup UI; matches the previously isolated-HEAD baseline evidence. No procurement test failure.
- Existing frontend bundle-size advisory remains (largest application JS about1.66MB before gzip). No dependency/lockfile changes or lint script.
- Integrity review complete, including targeted recheck of project-eligibility cache recovery. Browser checks complete as recorded above. `git diff --check` and `git status --short` exit0; intended source/docs changes remain uncommitted.
- No full repository/OCR suites, seed, migration, commit, push, deployment, production mutation or customer communication. Prototype global records, if any exist, are not migrated or deleted; the new project collection starts independently. Backend/frontend policy changes require coordinated deployment.
- Ignored build outputs are `backend/dist` and `frontend/dist`. Browser screenshots, fixture, logs and initial-work snapshots remain under `/tmp/lisno-project-procurement-qa`; temporary browser, server and dependency symlink were removed.

### Exact verification commands

From `backend/`:

```sh
npm run typecheck
npm test -- tests/project-procurement-routes.test.ts tests/project-procurement-mongo.replica-set.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts tests/procurement-routes.test.ts tests/procurement-mongo.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-display-order.service.test.ts
npm run build
```

From `frontend/`:

```sh
npm run typecheck
npm test -- src/features/procurement/ProjectProcurementItems.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/SupportingDocumentActions.test.tsx src/api/authorization-contract.test.ts src/test/fixtures/enterpriseTransport.test.tsx src/app/router.test.tsx
npm run build
```

From repository root: `git diff --check`, `git status --short`.

Final logs: `/tmp/lisno-project-procurement-qa/final-backend-typecheck.log`, `final-backend-tests-escalated.log`, `final-backend-build.log`, `final-frontend-typecheck.log`, `final-frontend-tests.log`, `final-frontend-build.log`, `final-diff-check.log`, `final-git-status.log`.

### Principal affected areas

Backend project procurement domain/model/service/routes/OpenAPI, existing procurement access helper, operation/permission registry, application indexes and focused/shared tests. Frontend project item table/editor/vendor field/API/CSS, project/home integration, mirrored authorization/types and fixtures. Current specification and this plan supersede the prior catalogue documents.

# Reusable procurement catalogue implementation plan

Superseded by [Project procurement correction plan](2026-09-17-project-procurement-items.md) following the user's revised project-level scope.

Source: [specification](../specs/2026-09-17-procurement-item-catalogue-design.md). Standing autonomous authority and parallel mode apply. Initial dirty-path set: empty. Only this parent task is in progress.

## Tasks and ownership

1. **Evidence and contract — parent, complete.** Confirm shared catalogue interpretation, procurement entry point, canonical UOM/paise boundaries, role scope and API contract. AC1–8.
2. **Backend implementation — `procurement_backend`, complete.** Own only `backend/`: catalogue domain/model/service/routes, auth permissions and route registry, server wiring/OpenAPI and focused tests. Use the specification's exact DTO/routes. Preserve current finance and UOM master workflows. Test persistence, normalization, duplicates/races, CAS, active/revoked identities, UOM lifecycle and integer currency. AC2–6,8.
3. **Frontend implementation — `procurement_frontend`, complete; parallel with 2.** Own only `frontend/`: catalogue types/API/queries, mirrored permission contract, component/editor/styles, procurement home integration and focused regression tests. Preserve existing project purchase tests. Implement responsive table, search/pagination, explicit conflict recovery, dirty dismissal and no polling. AC1–7,8.
4. **Integration and visual fixture — parent, complete.** Own docs and ignored `/tmp` QA artifacts. Reconcile contracts. Render actual app components with synthetic API fixtures at 360/768/1440 widths; test add/edit/search/error/empty, focus, no overflow, axe and console/network behavior. No production traffic.
5. **Integrity review — `procurement_integrity`, complete; no confirmed defects.** Read integrated diff for auth, normalization/indexes, concurrency/CAS, unit price precision, UOM lifecycle, query invalidation and frontend state correctness. Preserves existing snapshot-start actor authorization semantics; no new concurrent revocation guarantee claimed.
6. **Final verification — `procurement_verification`, complete with the baseline limitation below.** Focused catalogue/procurement tests plus affected auth policy/frontend contract/route inventory/API docs/server tests; both typechecks/builds; replica-set tests for transactional Mongo persistence; `git diff --check` and final status. Record exact results and limits.
7. **Handoff — parent, complete.** Update completion evidence here, summarize outcome, links/checks and deployment limits. No stage/commit/push/deploy/migration/customer communication.

## Verification evidence

Final integrated checks: **201/201 backend tests passed**, including 37 real Mongo replica-set tests. **76/76 focused frontend tests passed; router 115/116**, for 191 passed and one confirmed baseline failure. Both typechecks and production builds passed. `git diff --check` passed and status contains only expected implementation/document paths. The signup test `marks interactive signup focus after a failed attempt is retried` expects a missing Address field and also fails on isolated unmodified HEAD. No signup behavior was modified. Independent integrity review found no confirmed defects.

Rendered fixture evidence: `/tmp/lisno-procurement-catalogue-qa/browser-evidence.md`; 360/768/1440px catalogue and contextual editor checks, zero axe violations and no horizontal overflow. Add/edit/duplicate/CAS reload, exact currency, search/paging, stale retry/empty and focus restoration exercised with synthetic API fixtures. Backend replica-set tests independently prove persistence/concurrency. A 98.404-second idle observation produced no additional catalogue/project/UOM/auth requests. QA browser/server closed and temporary dependency symlinks removed.

Exact integrated commands:

```sh
# backend/
npm test -- tests/procurement-catalogue-routes.test.ts tests/procurement-catalogue-mongo.replica-set.test.ts tests/procurement-routes.test.ts tests/procurement-mongo.replica-set.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/procurement/ProcurementCatalogue.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/SupportingDocumentActions.test.tsx src/api/authorization-contract.test.ts src/test/fixtures/enterpriseTransport.test.tsx src/app/router.test.tsx
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

The frontend test command exits 1 solely for the known baseline failure; the other final commands exit 0. Initial backend socket EPERM was resolved through the authorized escalation. One 5-second route-test timeout during competing typecheck load did not reproduce in an isolated 36/36 route run or the unchanged full 201/201 rerun. Frontend build retains a large-chunk warning (main JS 1,656.08 kB minified).

Logs and screenshots: `/tmp/lisno-procurement-catalogue-qa`, particularly `final-backend-tests-retry.log`, `final-frontend-tests.log`, `final-*-typecheck.log`, `final-*-build.log` and `baseline-signup-test.log`. Builds also generated ignored workspace `dist/` outputs. No dependencies or lockfiles changed.

Not run: full repository suites, real deployed frontend-to-API browser session, OCR tests and migration checks. Browser tests used synthetic responses; real persistence/concurrency was verified separately through Mongo tests. OCR and migrations are unaffected. There is no repository lint script. No deployment, production mutation, migration, commit, push or customer communication was performed.

# Vendor procurement workspaces — implementation plan

Specification: [design](../specs/2026-09-18-vendor-procurement-workspaces-design.md).

1. Evidence and contract — complete. Root captured clean baseline/head, inspected authorization and assigned independent vendor-data and frontend-navigation audits. Root owns product interpretation, permission matrix, spec/plan and frozen API shapes. KPI remains an explicit unrated placeholder unless the user steers otherwise.
2. Implementation — complete: backend and frontend slices integrated. Backend contract frozen. Backend owner: new suggestion domain/model/service/router/OpenAPI/test files, narrow existing source helper and directory reader, app wiring, backend permission/operation registry/auth policy/tests. Preserve existing procurement write boundaries and shared vendor CRUD. No live writes or migrations.
3. Frontend implementation — complete under step 2. Root owns API contracts, role-specific management/suggestion screens, vendor picker integration and cache invalidation. A bounded frontend navigation/test slice may be delegated independently. Reuse existing vendor editor and design system.
4. Integrity review — complete, no unresolved findings. Read-only reviewer checks authorization, immutable lineage, CAS/idempotency/races, historical vendor data, no false KPI ranking and cache/draft isolation. Resolve findings before final checks.
5. Final verification — complete for affected scope. Focused backend route/replica/shared-authorization tests, focused frontend role/navigation/interaction suites, both typechecks/builds, desktop/tablet/mobile rendered flows, accessibility and clean-delta audit. Verify at least two asymmetric managers/projects. No repeated broad tests unless new evidence warrants them.
6. Handoff — complete; report exact behavior, checks, unrun/live limits, new collection and unchanged prior migration prerequisite. No commit, push, deployment or production mutation.

## Ownership and temporary artifacts
Initial status/head/diff are under `/tmp/lisno-vendor-procurement-qa/`. Worktree was clean before this task. Backend and frontend writers must not cross workspaces; root coordinates API/authorization shapes and owns docs. All runtime data, logs and screenshots stay outside tracked sources. No dependency/lockfile changes are planned.

## Implemented areas
- Backend: `src/domain/project-vendor-suggestions.ts`, `src/models/ProjectVendorSuggestion.ts`, `src/services/project-vendor-suggestions.service.ts`, `src/routes/project-vendor-suggestions.ts`, dedicated OpenAPI shape, app wiring, permission/operation/policy mirrors, and narrowly broadened shared vendor directory GET. No existing purchasing write authority changed.
- Frontend: route registry/router/safe returns; `ProcurementManagementPage`, `ProcurementVendorDirectory`, `SalesProcurementProjects`, `ProjectVendorSuggestionsPanel`, `ProcurementSuggestedVendors`, `vendorSuggestionsApi`, and scoped `vendorProcurement.css`. Existing item editor integrates suggested vendors. Existing master editor is reused and vendor cache invalidation covers all project suggestion pages.
- New suggestions preserve immutable approved-source/vendor identity and use transactional actor/grant/vendor/source validation, CAS, idempotency and audit. Current suggestions are distinct from the unrated KPI placeholder.

## Verification evidence — 2026-09-18
All evidence is under `/tmp/lisno-vendor-procurement-qa/`. Initial HEAD remains unchanged (`d275107`); initial tree was clean. Final delta: 44 intended paths, no dependency/lockfile changes.

### Backend — 290 unique focused tests passed
`npm test -- tests/project-vendor-suggestions-routes.test.ts tests/project-vendor-suggestions.replica-set.test.ts tests/project-procurement-routes.test.ts tests/project-procurement-mongo.replica-set.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts tests/server.test.ts`

The initial integrated run had one test-only Mongoose mock error. Corrected fixture and final `npm test -- tests/project-vendor-suggestions.replica-set.test.ts` passed 21/21; the other eight unchanged suites passed 269 cases. Final evidence: `backend-final-tests.log` plus `backend-suggestion-final-replica.log`. Actor/grant revocation, vendor deactivation, source version changes, duplicate/idempotent requests, CAS, rollback/audit and asymmetric manager/project boundaries are covered.

`npm run typecheck` and `npm run build`: exit 0 (`backend-typecheck.log`, `backend-build.log`). Independent backend integrity review had no actionable findings against product sources; subsequent writer changes were test-only.

### Frontend — 299 unique relevant tests passed
`npm test -- src/features/procurement/VendorProcurement.test.tsx src/features/procurement/ProjectProcurementItems.test.tsx src/features/procurement/EstimateProcurementItems.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/components/layout/navigation.test.tsx src/app/routePaths.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts`

These seven suites cover 242 cases. Initial run had one ambiguous test locator; it was scoped to the editor dialog. Final `npm test -- src/features/procurement/VendorProcurement.test.tsx` passed 14/14 and supersedes that fixture failure. Evidence: `frontend-final-tests.log` plus `frontend-final-vendor-tests.log`.

`npm test -- src/app/router.test.tsx -t 'registered permission routes|public invitation route'`: 57 passed, 62 intentionally unselected (`frontend-final-router.log`). New routes render independently of chat; sidebar order/role filtering and safe-return boundaries pass. Vendor create/edit/archive, manager creation/withdrawal, source/version/access failure draft preservation, stable retry keys, active/current-project selection and shared cache invalidation pass.

`npm run typecheck` and `npm run build`: exit 0 (`frontend-final-typecheck.log`, `frontend-final-build.log`); existing Vite chunk-size warning remains.

A broader router run also found the pre-existing signup test `marks interactive signup focus after a failed attempt is retried` looking for a removed `Address` field. Reproduced with the original HEAD test copied temporarily (`baseline-signup.log`), then removed that copy. No signup product/test changes were made. The entire router suite is therefore not claimed green. Full repository suites were not run; no lint script exists.

### Rendered verification
Actual React components with synthetic local API responses at 1440, 768 and 360px for all three roles: nine states, no horizontal overflow, no WCAG A/AA axe violations and no page errors (`browser-final-checks.log`). Drawer animation was allowed to finish before capture; the mobile drawer spans exactly 0–360px. Screenshots were inspected. Browser interactions passed vendor creation/deactivation, manager withdrawal, unsaved-draft protection and explicit Procurement selection (`browser-interactions.log`). Isolated fixture role shell was corrected to match sidebar width; product shell was unchanged.

`git diff --check`: exit 0. Build outputs are ignored at `frontend/dist/` and `backend/dist/`; screenshots/logs remain outside tracked sources. Preview/browser processes are stopped and the temporary dependency symlink is removed at handoff.

## Remaining operational boundaries
No vendor performance score/formula or KPI ranking is implemented: it is the explicitly requested placeholder, while Sales Manager suggestions are functional. New Mongo collection/indexes follow existing model setup and require no existing-data rewrite. No live migration, production data validation, commit, push or deployment was performed. Prior procurement source-index rollout requirements remain separate. Local browser API responses were synthetic; Mongo behavior was verified with replica-set tests.

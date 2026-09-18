# Furniture configured UOM implementation plan

Spec: [design](../specs/2026-09-17-furniture-configured-uom-design.md).
Baseline: `/tmp/lisno-furniture-uom-qa/initial-status.txt`, `initial-tracked.diff`, `initial-untracked.tar.gz`. All earlier dirty work is preserved. Standing autonomous Mode A. Local work complete; not deployed.

1. Discovery/contract — complete. Shared UOM model, admin-only master service, procurement create-or-reuse pattern, precision semantics and scoped uploader permissions traced.
2. Implementation — complete. Backend writer owned the domain, service, router, repositories and workflow regression tests. Root owned registry/OpenAPI, frontend API/editor/actions/review integration and durable docs. Bounded frontend writer owned the new UOM field/add component, CSS and tests.
3. Integrity review — complete. Independent read-only frontend and backend reviews found no actionable issue. Project/global privilege boundary, transactional identity/references, lifecycle races, snapshot immutability, cache and nested-form state reviewed.
4. Integrated verification — complete. Focused cross-stack/replica tests, typechecks/builds, rendered add/select/submit/review flow and responsive/accessibility checks passed. Verification runner independently checked backend/build evidence, source invariants, baseline preservation and hygiene.
5. Handoff — complete. No commit, push, deployment, migration, production mutation or customer communication.

## Result and affected areas
- Configuration UOMs now supply the measurement selector. New submissions send `uomId`; server stores stable ID and submitted code/name alongside dimensions. Historical units remain readable without inferring IDs from text.
- Narrow project GET/POST furniture-uoms endpoints reuse the existing global master. POST requires an available upload action, rechecks current scope transactionally, creates or reuses normalized active identities and audits the actual actor/project. Generic Configuration permissions remain unchanged.
- Shared dependency writes serialize selection with catalog lifecycle changes. Existing pending/approved snapshots survive rename, scale changes and archive. Quantity precision does not round L/W/H.
- Compact Add UOM panel preserves drafts, selects the saved record only for its initiating item, handles duplicates/errors/stale units and updates Configuration/procurement caches. One shared query supplies all items, without polling. Required configured selection replaces the hardcoded default.
- Principal paths: backend `domain/workflow-uoms.ts`, workflow state domain/service/router, repositories types/memory/Mongo, registry/OpenAPI; frontend `FurnitureUomField.tsx`, `FurnitureDimensionsEditor.tsx`, `WorkflowStageActions.tsx`, `projectWorkflowApi.ts`, snapshot review and scoped CSS/tests.

## Exact verification
Backend, from `backend/`:
```sh
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-submission-gates.test.ts tests/workflow-estimate-items.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/project-procurement-mongo.replica-set.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```
All passed: **366 tests in 8 files** (168 state, 30 workflow replica, 22 gates, 21 estimate items, 34 Configuration reference, 27 procurement replica, 42 registry, 22 API docs). Root also ran `npm test -- tests/api-docs.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/authorization-policy.test.ts`: authorization 40 and frontend authorization contract 3 passed. That first run found the old API route-count assertion (228 versus new 230); corrected and API docs passed in the final 366-test run. Unique backend total **409**. Logs: `/tmp/lisno-furniture-uom-qa/backend-{regression,typecheck,build}.log`.

Frontend, from `frontend/`:
```sh
npm test -- src/features/workflow/FurnitureUomField.test.tsx src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
npm run typecheck
npm run build
```
All passed: **249 tests in 11 files**, typecheck and production build. Build log: `/tmp/lisno-furniture-uom-qa/frontend-build.log`. Existing large-bundle warning remains; no new dependencies. Total **658 unique focused tests** passed across both workspaces.

Actual Chromium, real components with synthetic/mocked API (separate backend persistence verification above): measurement editor, nested Add UOM and Client review checked at **360, 768 and 1440 px**. No document overflow or axe violations. Created Inches, reused Millimetres, retained `2400.125`, selected the new UOM only for the initiating item, submitted three estimate IDs with UOM IDs, and verified Client review displays `in` and `mm` from submitted snapshots. No application console errors; only development-tool/HMR messages. Final screenshots: `/tmp/lisno-furniture-uom-qa/{measurements-final,add-uom-final,client-review-final}-{360,768,1440}.png`. Browser and Vite server stopped; temporary node_modules symlink removed.

`git diff --check` and `git status --short` passed. Independent baseline comparison found only expected UOM changes, preserving earlier dirty work.

## Limits and rollout
No full workspace suites or OCR tests run; verification targeted changed/shared contracts. No lint script exists. No new dependency or migration needed. Browser used mocked API, not a deployed environment. Frontend/backend should deploy together because new furniture submissions require `uomId`; legacy stored history remains compatible. No deployment/commit/push/production action performed.

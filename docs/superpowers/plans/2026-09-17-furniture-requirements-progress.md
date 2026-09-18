# Furniture requirements progress correction

Source: [specification](../specs/2026-09-17-furniture-requirements-progress-design.md). Autonomous Mode A; one parent correction in progress. Initial dirty paths/diffs/untracked files preserved in `/tmp/lisno-furniture-completion-qa`.

1. Evidence and contract — parent plus independent backend/frontend explorers, complete. Confirm saved scope lifecycle, misleading projection/action label and missing edit prefill. AC1–4.
2. Backend — furniture_backend, complete. Own backend derived furniture summary, dynamic edit action label and targeted lifecycle/projection tests. Preserve all existing measurement changes and transaction/approval gates. No persistence or route changes expected. AC1–4.
3. Frontend — parent, complete; independent after shared contract (existing agent thread limit reached). Own API optional type, shared selectors, Designer next action, shared phase badge/details, saved-scope edit prefill and regression tests. Preserve existing measurement/media list changes. AC1–5.
4. Browser QA — parent, complete. Actual workspace/components with synthetic workflow states; save then refetch, edit selected rooms, no-furniture awaiting Client, accepted pending dimensions, completed stage advancement. Desktop1440 and mobile360, axe and overflow. AC1–5.
5. Integrity review — read-only reviewer, complete; no confirmed defects. Verify backend lifecycle authority, phase/status precedence, stable IDs, frontend consistent consumers, saved prefill, no gate bypass. Resolve findings. AC1–4.
6. Final verification — parent and read-only backend verification after integrated review, complete. Backend focused workflow-state/projection/submission tests and replica coverage as appropriate; frontend Designer page/workflow/progress/selectors tests plus measurement regression. Both typechecks/builds and git diff/status. AC1–5.
7. Handoff — parent, complete. Record exact checks, artifacts and limitations, stop local browser/server, report local-only status. No commit/deploy/migration.

## Verification

Backend focused 106 tests and typecheck passed; frontend focused 25 tests and source typecheck passed. Final integrated verification: 178 backend + 194 frontend = 372 tests passed; both typechecks/builds, browser QA and diff check passed. No review defects.

## Exact final checks

Backend, all exit0:

```sh
npm run typecheck
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts tests/design-workflow-state.replica-set.test.ts tests/workflow-measurement-media.test.ts tests/api-docs.test.ts
npm run build
```

178 tests:89 workflow state,6 projection,17 submission gates,13 Mongo replica-set,32 measurement media,21 API docs. Initial sandbox-only attempt hit socket EPERM; identical suite passed with authorized escalation. Existing Mongoose `new` deprecation warning.

Frontend, all exit0:

```sh
npm test -- src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx
npm run typecheck
npm run build
```

194 tests. Existing build chunk-size warning remains. `git diff --check` and `git status --short` succeeded. Browser actual-page save/refetch/edit/next-stage checks passed, with9 final responsive state/width checks at360/768/1440px, no overflow/axe findings and no console errors. API data in the browser fixture was synthetic; production data was not inspected.

Evidence: `/tmp/lisno-furniture-completion-qa/frontend-workflow.log`, `final-frontend-{typecheck,build}.log`, `final-backend-{typecheck,workflow,build}.log`, `browser-evidence.md` and screenshots. Sandbox failure retained separately. Local browser/server stopped.

## Handoff

Backend source/test: `design-workflow-state.service.ts`, `design-workflow-state.test.ts`.
Frontend: `projectWorkflowApi.ts`, `projectWorkflowSelectors.ts`, `DesignerDesignPlanTasksPage.tsx`, `ProjectWorkflowProgress.tsx`, `projectWorkflowProgress.css`, `WorkflowStageActions.tsx`, and new `DesignerDesignPlanTasksPage.furniture.test.tsx`.

The correction exposes saved state and the pending Client step; it preserves Client acceptance and room-scoped evidence/permission completion. Existing persisted declarations benefit from the new projection without a migration. No dependency, schema migration, commit, push, deployment, production mutation or external communication. Prior measurement work preserved.

Full repository suites, OCR, unrelated areas and external/production services were not run. No lint script exists. Live rollout and validation against the reported production project remain outside this local implementation.

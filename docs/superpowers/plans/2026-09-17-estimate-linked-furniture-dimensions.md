# Estimate-linked furniture dimensions implementation plan

Spec: [design](../specs/2026-09-17-estimate-linked-furniture-dimensions-design.md).
Baseline: `/tmp/lisno-estimate-furniture-qa/initial-status.txt`, `initial-tracked.diff`, `initial-untracked.tar.gz`. Preserve all prior dirty changes. Standing autonomous Mode A.

1. Discovery/contract — complete. Approved snapshot lines, deterministic legacy IDs and strict unique room-label resolution settled. Public item shape and upload input are recorded in spec. Independent CSS audit confirmed portalled drawer scoping and checkbox primitive cause.
2. Implementation — complete. `/root/furniture_backend` owns all backend source/repository/validation/projection/tests. Root owns frontend types/editor/action integration/tests and durable docs. `/root/furniture_panel_style` owns only workflowStageActions.css and furnitureDimensionsEditor.css; root supplies workflow-action-panel class and item-header markup. No shared primitive changes.
3. Integrity review — complete; no open findings. Independent read-only review covered estimate/room/line lineage, approval/revision immutability, projections and failure handling. A shared-context issue found during integration was fixed: estimate item validation is an explicit furniture-only opt-in, preserving payment source behavior. Exact-label compatibility follows the current estimate producer; unsupported historical mismatches require reconciliation.
4. Verification — complete. Independent backend runner passed 262 tests, typecheck/build and hygiene. Root passed 232 frontend tests, typecheck/build and browser checks. Final baseline comparison confirms only intended paths changed.
5. Handoff — complete. Local implementation verified. No commits, deployment or live data changes.

## Evidence and verification so far

- Estimate editor writes `roomName: room.label` and restores by exact label; custom labels are supported. Drawing/OCR aliases are intentionally not used to guess approval associations.
- Frontend source and compact CSS complete. Final ten-suite workflow/Designer run passed all 232 cases. Frontend typecheck/build passed; existing large-chunk warning remains.
- Independent frontend review found no actionable issues: ID-based submission/prefill, duplicate-name isolation, legacy non-rebinding, stale-source blocking, default selections/dirty protection, empty-state blocking and scoped portal styling.
- Browser harness uses real components/styles with synthetic data and mocked API responses at `127.0.0.1:4215`. Three selected estimate items across two rooms were entered with mm/cm units and uploaded through the real file input and submit button. Client previewed the protected proof, returned Bedroom, Designer corrected Wardrobe width 600→650 while Bedside table retained its own values, and Client approved the new Bedroom revision plus the unchanged Living room revision. Furniture completed and Space planning became current.
- At 360/768/1440px: no page/panel overflow and zero axe WCAG A/AA violations. Measured 18px title, 18×18px checkbox inside 44px clickable label, 13px/40px desktop input text/height and 16px/44px mobile input text/height. Screenshots visually inspected. Static QA captures disabled motion only in the temporary page. No browser console errors.
- Temporary evidence: `/tmp/lisno-estimate-furniture-qa/panel-{360,768,1440}.png`, `panel-filled-mobile.png`, `approved.png`, `browser-widths.log`, `browser-submit-return.log`, `browser-resubmit-approve.log`. Backend verification is separate from this mocked browser harness.

## Affected files

- Backend: new `src/domain/workflow-estimate-items.ts`; `src/domain/design-workflow-state.ts`, `src/domain/design-workflow-instructions.ts`, `src/repositories/{types,memory,mongo}.ts`, `src/services/{design-workflow-state,project}.service.ts`, and `src/openapi.ts`. Tests: new `workflow-estimate-items.test.ts`, updated `design-workflow-state.test.ts` and replica-set suite.
- Frontend: `src/features/workflow/projectWorkflowApi.ts`, `FurnitureDimensionsEditor.tsx`, `WorkflowStageActions.tsx`, `furnitureDimensionsEditor.css`, `workflowStageActions.css`, and the action/approval regression tests. Shared Drawer/Checkbox primitives remain unchanged.
- Existing prior measurement-upload, furniture-review and other dirty changes are preserved. No dependencies, migrations or live data changes.

## Exact checks

From `frontend/` (passed: 232 tests, 10 files; typecheck and build):

```sh
npm run typecheck
npm test -- src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
npm run build
```

From `backend/` (passed: 262 tests, 7 files; typecheck and build):

```sh
npm run typecheck
npm test -- tests/workflow-estimate-items.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-submission-gates.test.ts tests/design-workflow-projection.test.ts tests/workflow-measurement-media.test.ts tests/api-docs.test.ts
npm run build
```

Backend counts: estimate item source 21, workflow state 140, replica-set integration 20, submission gates 22, projection 6, measurement media 32, API docs 21. Only existing Mongoose `new` deprecation warnings. Final log: `/tmp/lisno-estimate-furniture-qa/backend-final.log`. Frontend final log: `/tmp/lisno-estimate-furniture-qa/frontend-final-tests.log`. Combined total: 494 focused tests passed. `git diff --check` and final status checks passed; baseline comparison is in `final-baseline-comparison.txt` in the same temporary directory.

Full repository/OCR suites were not run; no lint script exists. Local browser uses mocked API responses rather than production data. Historical production mappings have not been audited or rewritten. Browser/server stopped and temporary dependency symlink removed. No commit, push, deployment, migration, backfill or external communication performed. Frontend/backend must deploy together.

# Furniture dimensions approval plan

Spec: [design](../specs/2026-09-17-furniture-dimensions-approval-design.md)

Baseline snapshot: `/tmp/lisno-furniture-approval-qa/initial-status.txt`, `initial-tracked.diff`, `initial-untracked.tar.gz`. Prior measurement uploads, furniture progress and evidence review are preserved. Standing autonomous Mode A applies.

1. Discovery/contract — complete. Independent backend and frontend audits reconciled persistence, upload ownership, bypasses, gates and legacy behavior.
2. Implementation — complete.
   - `/root/furniture_backend`: backend domain/service/projection/instructions and relevant tests. Own all backend writes; no frontend/doc writes. Implement exact contract from spec, scope correction, revision submission/review, readiness gates and transactional regression tests (AC1–6).
   - Root: frontend types, dimensions editor, shared review, scope/approval/return forms, status/next-step consumers and focused rendered tests. Own frontend, spec/plan and integration (AC1–5,7).
3. Integrity review — complete. Independent read-only review covered actor enforcement, current-submission binding, immutable history, proof access/cleanup, CAS/idempotency and onward gates. Closed the identified existing no-furniture pin exemption: final submissions now verify the accepted scope's approved-estimate source ID/version for no-furniture declarations too. No open review findings.
4. Integrated verification — complete. Root finished integrated backend verification after the independent runner's sandbox attempt; frontend checks and actual rendered Client/Designer flows also passed.
5. Handoff — complete. Local implementation verified; no commit, push, deployment, migration or production/customer actions.

## Implementation and affected areas

- Backend: `src/domain/design-workflow-state.ts`, `src/domain/design-workflow-instructions.ts`, `src/services/design-workflow-state.service.ts`, `src/openapi.ts` and three workflow regression suites. Structured measurements, immutable revisions, scope/dimension return and explicit approval use the existing action endpoint and transaction/version contract. No migration or new dependency.
- Frontend: `projectWorkflowApi.ts`, `WorkflowStageActions.tsx`, `FurnitureRequirementsReview.tsx` and its CSS, new `FurnitureDimensionsEditor.tsx` and CSS, `projectWorkflowSelectors.ts`, and `ProjectWorkflowProgress.tsx`. Added the furniture-approval suite and updated existing action/Designer regression expectations.
- Preserved unrelated initial dirty work. A baseline comparison confirmed only intended tracked paths changed; previous untracked changes were limited to the shared furniture review component/CSS and Designer furniture test.

## Verification results

### Frontend — passed

From `frontend/`:

```sh
npm run typecheck
npm test -- src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
npm run build
```

226 tests passed across 10 files, including 14 new approval cases. Typecheck and production build passed. Existing build chunk-size warning remains. A regression found during verification was corrected: furniture-specific readiness labels apply only to the furniture stage; other stages keep their existing room labels.

### Rendered interactions — passed

Real production components and styles in a temporary local Vite harness with synthetic data and mocked API responses; this is not a live production or full-stack browser test. Backend transaction/authorization behavior is verified separately.

- Client sends back scope with a reason; Designer sees prefilled choices and resubmits; Client explicitly accepts.
- Designer enters two rooms with different units (mm/cm), attaches an actual local PDF through the file input, and submits through the real button. Both rooms remain pending.
- Client sees exact measurement values and opens the submission's protected proof endpoint before deciding.
- Client sends back Bedroom and approves Living room. Only one of two required rooms is ready.
- Designer sees the correction reason and prefilled Wardrobe values, changes width from 600 to 650 mm, and submits a new proof. Approved Living room is unavailable for editing.
- Client approves Bedroom revision 2 using its new submission ID. Furniture completes and Space planning becomes current.
- Editor and Client review at 360, 768 and 1440 px: no document overflow; zero axe WCAG A/AA violations. Measurement tables retain local horizontal scrolling on narrow screens. Final approved state also has zero violations. No browser console errors.
- Static captures disabled animations in the QA page only. Browser and Vite server stopped; temporary dependency symlink removed. Evidence retained outside the repository at `/tmp/lisno-furniture-approval-qa/` (screenshots, browser-scope.log, browser-submit.log, browser-correction-approval.log).

### Backend — passed

From `backend/`:

```sh
npm run typecheck
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-submission-gates.test.ts tests/workflow-measurement-media.test.ts tests/api-docs.test.ts tests/design-workflow-projection.test.ts
npm run build
```

220 tests passed across 6 files: workflow state 124, Mongo replica-set 15, submission gates 22, measurement media 32, API docs 21, projection 6. Typecheck and production build passed. First sandbox attempt could not bind local servers (`EPERM`); the required rerun outside the sandbox passed with no skipped tests. Existing Mongoose `new` option deprecation warnings remain. The final run includes the no-furniture source-pin regressions and concurrent approve/return transaction coverage.

### Scope and limitations

Focused regression suites, not complete repository or OCR suites. No lint script exists. `git diff --check` passed; final status preserves prior dirty work. No dependencies, schema/index migration, data backfill, commit, push, deployment, production mutation or external communication. Backend/frontend must deploy together; reverting to the old automatic-readiness gate after new revisions are persisted is unsafe (see spec compatibility section).

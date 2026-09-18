# Point-count workflow correction — plan

Spec: [design](../specs/2026-09-17-point-count-workflow-design.md). Autonomous Mode A. Baseline `/tmp/lisno-item-measurements-qa/initial-{status.txt,tracked.diff,untracked.tar.gz}` captures prior dirty work.

1. Audit canonical item semantics and settle additive contract — complete.
2. Implement — complete: backend owner handles all backend domain/projection/service/API/tests; frontend owner handles API types/editor/review/styles/tests; root owns documents, integration and browser QA. No overlapping source ownership.
3. Independent integrity review — complete and clear after writers: snapshot semantics, incompatible mode rejection, legacy approvals/returns, UOM, exact tokens and revision integrity checked.
4. Final verification — complete: focused contract/transactional tests, builds/typechecks, responsive interaction/axe and preservation audit.
5. Handoff — complete; implementation remains local. No dependencies, migration, production change, commit, push or deployment expected.

## Result and affected areas

Explicit approved-estimate point units now produce count inputs. Point counts are stored and reviewed distinctly, without L/W/H placeholders. Furniture sold by nos/lot retains physical measurements. Backend source metadata drives the branch, while old pending dimension-only point submissions can be returned for correction; approved history is not rewritten. The configured UOM selector/create behavior remains available, with no new semantic classification assumed for arbitrary custom UOMs.

Backend: `workflow-estimate-items.ts`, `design-workflow-state.ts`, `design-workflow-state.service.ts`, OpenAPI and tests. Frontend: `projectWorkflowApi.ts`, `FurnitureDimensionsEditor.tsx`, `FurnitureRequirementsReview.tsx`, `furnitureDimensionsEditor.css`, new `WorkflowStageActions.pointCounts.test.tsx`. Existing dirty work preserved.

## Exact verification

**484 unique tests across 14 suites** on the integrated result.

Backend command:
```sh
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-submission-gates.test.ts tests/design-workflow-projection.test.ts tests/workflow-estimate-items.test.ts tests/api-docs.test.ts
```
Initial result: 359 passed and one new replica fixture failure. The fixture incorrectly attempted to change an immutable approved snapshot; it was corrected to create the intended frozen point unit initially while retaining a conflicting live estimate unit. No product fix was needed. `npm test -- tests/design-workflow-state.replica-set.test.ts` then passed **37/37**. Final deduplicated backend counts: workflow **233**, source **38**, projection **6**, gates **22**, docs **24**, replica **37** = **360**. Logs `backend-focused.log` and `backend-replica-final.log`.

Frontend command:
```sh
npm test -- src/features/workflow/WorkflowStageActions.pointCounts.test.tsx src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/FurnitureRequirementsReview.combined.test.tsx src/features/workflow/FurnitureUomField.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx
```
**124 passed**, including **26 new regressions**: no dimensional point fields, integer/lexical boundaries (including values that Number conversion could round), incompatible modes, mixed payloads, prefill/toggles, point-only and mixed Client review, legacy corrections and accessibility. Log `frontend-focused.log`.

Backend and frontend `npm run typecheck` and `npm run build` passed. Existing warnings: Mongoose deprecated `new` option and Vite large chunks. No lint script exists. Full suites/shared authorization/OCR/migration checks were not rerun because those areas are unchanged; independent verifier found no material missing test that justified repeating them.

## Browser and independent verification

Used built real React components with synthetic project/identities and mocked APIs; actual backend HTTP/Mongo behavior is covered separately above. This is not live/deployed full-stack verification.

- `browser-entry-review.log`: point item has **zero L/W/H controls**, rejects fractional count, retains count/file when no-furniture toggles, submits count **12** alongside wardrobe and sofa dimensions, and renders a separate count table. Six entry/review states at **360/768/1440px** have **zero axe violations**, **no document overflow**, **zero page errors**. Screenshots `entry-{360,768,1440}.png` and `review-{360,768,1440}.png`.
- `browser-correction-approval.log`: Client sends back exact `requirements-8` token; next stage remains blocked. Designer receives count 12, pts UOM and unchanged wardrobe width 600; changes count to 14 and resubmits. Client sees 14 pts and approves fresh `requirements-10`; furniture completes and Space planning opens.
- Independent read-only integrity review clear. Independent verification reconciled logs and fresh hygiene checks. **71 baseline dirty paths retained**, 58 byte-identical, 13 intended modifications, three expected new files; no staged/unexpected changes.
- Evidence `/tmp/lisno-item-measurements-qa`. Temporary browser-harness issues (macOS /tmp realpath output and preview hook returning middleware) were corrected before final successful browser pass. No product sources were changed for the harness.

No dependencies/lockfiles, migration, commit, push, deployment, production mutation or customer messages. Frontend/backend should be released together under separately authorized deployment.

Cleanup complete: named browser session closed, local preview server stopped, temporary node_modules symlink removed. Evidence remains in /tmp; no runtime outputs added to the repository. Final diff check passed.

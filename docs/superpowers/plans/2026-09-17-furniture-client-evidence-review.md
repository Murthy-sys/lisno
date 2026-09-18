# Client furniture evidence review plan

Spec: [design](../specs/2026-09-17-furniture-client-evidence-review-design.md)

Initial worktree snapshot: `/tmp/lisno-furniture-evidence-qa/initial-status.txt`, `initial-tracked.diff`, `initial-untracked.tar.gz`. All existing measurement and furniture progress work is preserved.

## Dependency-ordered work
1. Discovery and contract — complete. Root plus independent backend/frontend audits traced uploads, Client visibility, lineage and existing protected downloads.
2. Implementation — complete.
   - Backend owner `/root/furniture_backend`: workflow state projection, project projection context and relevant backend tests. Curate safe metadata without persistence or authorization expansion (AC2–3,6).
   - Root: frontend API types/helper cancellation, focused furniture review UI, inline Client acceptance and regression tests (AC1,4–6). Own specification, plan and integration. No shared writer paths.
3. Integrity review — complete. After writers finished, `/root/measurement_integrity` reviews final diff for lineage, authorization, stale responses and cleanup. Resolve confirmed findings.
4. Integrated verification — complete. Backend focused suites/typecheck/build; frontend focused workflow suites/typecheck/build; real browser Client flow at 360/768/1440 widths, previews, responsive overflow and accessibility. Existing agents may run bounded checks if thread limits prevent a separate verification runner. Then `git diff --check` and final dirty-path reconciliation (AC7).

## Verification record
Final integrated results: **400 tests passed** (188 backend, 212 frontend). Both typechecks and production builds passed. `git diff --check` passed. Existing Mongoose `new` deprecation and Vite chunk-size warnings remain; no new dependencies or lockfile changes.

Commands run from the indicated workspace:

```sh
# backend
npm run typecheck
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts tests/design-workflow-state.replica-set.test.ts tests/workflow-measurement-media.test.ts tests/api-docs.test.ts
npm run build
# frontend
npm run typecheck
npm test -- src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
npm run build
# repository
 git diff --check
```

Independent review confirmed backend lineage/authorization and acceptance invariants. It found same-version preview replacement and download-row removal/page-shift lifecycle issues. Both were fixed; source replacement/removal, late response, and pagination regressions now pass. The reviewer reached its usage limit before final closure; the primary completed the final code review and integrated verification. No outstanding finding remains.

Rendered QA used the actual Client ProjectWorkflowPanel/components with synthetic API responses, paired with the backend authorization/byte-access tests above. At 360/768/1440 widths: no horizontal overflow or WCAG A/AA automated violations, no eager evidence requests, and preview drawers stay within the viewport. Verified all33files reachable, image decoding, video metadata/playback readiness, native PDF display, retry after synthetic failure, review visibility during acceptance, and exact versioned acceptance submission. Screenshots were visually inspected, including a fully rendered PDF on mobile.

Artifacts: `/tmp/lisno-furniture-evidence-qa/browser-results.log`, `browser-preview-results.log`, `review-360.png`, `review-768.png`, `review-1440.png`, `pdf-stable-360.png`, `acceptance-360.png`, initial snapshots and `incremental-tracked.diff`. Temporary browser/server are stopped after verification. Previously untracked files were compared to their initial archive and remained unchanged.

Affected product files: backend workflow-state service and project service; frontend WorkflowStageActions, projectWorkflowApi, new FurnitureRequirementsReview and its stylesheet. Backend workflow-state tests and new frontend furnitureReview tests cover the added behavior. Persistence, routes and approval rules did not change.

Not run: full repository suites, OCR tests, live production checks. No staging, commits, push, deployment, migration, data mutation or customer communication. No lint script exists. Preview fetch remains one complete selected blob; unsupported formats/codecs can be downloaded. Missing optional sketch/legacy evidence does not block acceptance.

# All selected room items — task plan

Spec: [design](../specs/2026-09-17-all-selected-room-items-design.md). Baseline: `/tmp/lisno-all-room-items-qa/initial-{status.txt,tracked.diff,untracked.tar.gz}`. Prior work is intentional and must be retained.

1. Source diagnosis — complete: selected quantity-zero lines explicitly omitted by shared adapter; user clarified Master Bedroom.
2. Implementation and compatibility reconciliation — complete. Backend writer changed the adapter, service canonical-completeness condition and three regression files. Root added two tests to the existing frontend furnitureScope suite and aligned OpenAPI/API-doc tests. No frontend product changes were needed.
3. Integrated integrity review — complete. One OpenAPI finding corrected, regression tested and checked in final verification. No source fallback, data reassignment or approval-history rewriting.
4. Final verification — complete. Independent verifier confirmed 438 passing unique tests, builds/typechecks, browser evidence and preservation audit: all 77 baseline dirty paths retained, 69 byte-identical, exactly eight expected modifications and two new documents. Fresh git diff --check/status exit 0; no staged/unexpected paths.
5. Handoff — complete on 2026-09-18; local implementation only. No migration, commit, deployment or production edits performed.

## Recorded verification

Temporary evidence: `/tmp/lisno-all-room-items-qa`.

- Backend `npm test -- tests/workflow-estimate-items.test.ts tests/design-workflow-state.test.ts tests/design-workflow-submission-gates.test.ts tests/design-workflow-projection.test.ts`: 321 passed (43 source + 250 workflow + 22 gates + 6 projection).
- Backend `npm test -- tests/design-workflow-state.replica-set.test.ts`: 40 passed. The initial new test used a previously committed idempotency key; corrected to a fresh request key and rerun. Product idempotency guards unchanged.
- Backend `npm test -- tests/api-docs.test.ts`: 24 passed after the OpenAPI correction. Initial sandbox local-listen denial was resolved with an authorized rerun.
- Frontend `npm test -- src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.pointCounts.test.tsx src/features/workflow/WorkflowStageActions.submitBlocker.test.tsx`: 53 passed. New all-room test uses the established fireEvent.submit pattern because JSDOM reports a user-event-populated native file input invalid; real-browser native validity and click-submit separately passed.
- Both workspace `npm run typecheck` and `npm run build` passed. Backend build rerun after OpenAPI adjustment. Existing frontend chunk-size warning remains.
- Total 438 unique tests (385 backend, 53 frontend). No full unrelated suites or lint run; repository has no lint script.
- Real React browser fixture imports the actual shared backend adapter and a baseline copy captured before edits, using synthetic approved data and mocked API transport. With unchanged input, baseline yields zero Master Bedroom/Kitchen items and disabled submit; corrected source yields the wardrobe, kitchen unit and point item in the proper rooms. Excluded dresser remains absent (`browser-baseline.log`).
- Rendered entry checked at 360/768/1440: no horizontal overflow or axe A/AA violations. Screenshots visually inspected. All three rooms stay selected; native form validation passes, one multipart request contains all four item IDs with positive actual measurements, Client tables display all submitted values, and explicit Client confirmation completes the stage (`browser-final.log`). Approved reference quantities remain unchanged.
- Browser fixture does not connect to a live backend or inspect the reported production project's actual estimate. Database tests separately verify the transactional service behavior. This proves the reproduced source-omission fix, not an inspection of live data.
- Browser console: zero errors/warnings. Local browser and preview server stopped; temporary node_modules symlink removed. Existing Mongoose `new` deprecation and Vite bundle-size warnings remain; no dependency or lockfile changes.

Product source changes are limited to `backend/src/domain/workflow-estimate-items.ts`, `backend/src/services/design-workflow-state.service.ts`, and the reference quantity schema in `backend/src/openapi.ts`. Regression changes are `backend/tests/workflow-estimate-items.test.ts`, `backend/tests/design-workflow-state.test.ts`, `backend/tests/design-workflow-state.replica-set.test.ts`, `backend/tests/api-docs.test.ts`, and `frontend/src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx`.

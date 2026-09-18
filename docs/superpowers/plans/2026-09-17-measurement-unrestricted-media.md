# Remove measurement media limits

Source: [specification](../specs/2026-09-17-measurement-unrestricted-media-design.md). This correction supersedes prior count/combined-size caps. Autonomous Mode A applies. One parent task in progress; all pre-existing dirty paths belong to the preceding measurement implementation and are snapshotted.

1. **Evidence and contract — parent/read-only audit, complete.** Trace every ceiling, binary buffer and retrieval path; settle streaming multipart while preserving action payload. AC1–5.
2. **Backend — measurement_backend, complete.** Own backend only: private staged streaming/storage import, no media count/size/aggregate caps, inactivity/abort/schema cleanup, bounded-memory downloads, service/OpenAPI updates and focused regressions. Preserve other proof actions and full evidence retention semantics. AC1–3,5.
3. **Frontend — measurement_frontend, complete; parallel with 2.** Own frontend only: remove quantity/aggregate checks/copy, scalable selected/history lists, all-file multipart submission and regression tests. AC1,3–5.
4. **Browser QA — parent, complete.** Existing actual-component fixture, 32+ synthetic files and selections above 25 MiB, paged remove/reselect, optional sketch, submission/retry/history, widths 360 / 768 / 1440 and axe. Backend tests independently cover real streaming and persistence.
5. **Integrated review — complete.** Verify stream/memory bounds, every cleanup path and unknown commits, upload/download identity, compatibility, list pagination and file selection semantics. Resolve concrete findings.
6. **Final verification — complete.** Focused media/workflow/storage/replica/shared upload/auth/API tests; relevant frontend workflow tests; both typechecks/builds and diff/status. Broaden only for changed contracts or failures.
7. **Handoff — complete.** Record exact evidence/limits, clean temporary server/browser and report local-only status. No commit/deploy/migration or new dependency expected.

## Verification

Final frontend workflow 166 tests, typecheck and build passed (existing chunk-size warning). Frontend review found no defects. Browser fixture passed 33 files / 26 MiB, all-file retry/submission without a sketch, paged removal/reselection/history/download, 360 / 768 / 1440 px with zero axe findings or horizontal overflow. Backend focused 57 tests, typecheck and diff check passed. Real storage case uploaded a 28 MiB video plus 12 photos and downloaded with streamed integrity checks. Review found and resolved close-failure orphan cleanup; fault-injected regression tests cover the fix. No outstanding review findings. Final verification passed: 380 backend + 166 frontend = 546 tests, both typechecks/builds and repository diff check. Logs/artifacts under `/tmp/lisno-measurement-unrestricted-qa`; prior measurement artifacts remain intact.

## Review and execution notes

- One initial backend focused run returned 401 where a tampered-download case expected 409. The identical 57-test rerun passed without an authorization code change. The first integrated final run passed without recurrence or reruns; root cause of the earlier isolated response is not established.
- Browser fixture and server stopped; temporary dependency symlink removed. Logs and screenshots remain outside the repository. No dependencies, migrations, commits, deployment or external writes.

## Exact final verification

All commands below exited 0 on the integrated sources.

Backend:

```sh
npm run typecheck
npm test -- tests/workflow-measurement-media.test.ts tests/workflow-evidence-streaming.test.ts tests/stream-file.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/local-storage.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts
npm test -- tests/uploads.test.ts tests/project-chat-attachments-validation.test.ts tests/project-chat-audio-validation.test.ts tests/project-chat-audio-upload.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm run build
```

179 workflow/streaming tests, including 13 Mongo replica-set tests; 201 shared upload/auth/API tests. Earlier transient assertions did not recur. Existing Mongoose `new` deprecation warning; backend build clean.

Frontend:

```sh
npm run typecheck
npm test -- src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx
npm run build
```

166 tests passed. Existing bundle chunk-size warning remains.

Repository: `git diff --check` and `git status --short` both exited 0. Logs under `/tmp/lisno-measurement-unrestricted-qa/final-{backend,frontend}-*.log`; rendered evidence in `browser-evidence.md` and six screenshots in that directory. Browser API responses were synthetic; backend tests separately used actual temporary/permanent filesystem storage and streamed HTTP transfers.

## Final affected areas and limits

- Backend: workflow multipart middleware; private temporary and streaming file storage; workflow media storage/download route; service validation; OpenAPI; focused storage/lifecycle tests. Existing action payload, transaction authorization and opaque evidence history are preserved.
- Frontend: measurement validation/selection, `WorkflowMediaList` display pagination, workflow history, styles and regression coverage. No dependency added.
- Full repository suites, OCR, unrelated signup tests and production/external service behavior were not run. No repository lint script exists. Hosting/proxy capacity and extreme Mongo document-size cases were not exercised. Sketch keeps its existing document-size bound; photo/video count and size caps are removed.
- No production changes, migration, staging, commit, push or deployment performed. Temporary browser and server are closed.

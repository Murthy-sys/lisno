# Measurement media upload plan

> Follow-up correction: media count and size limits in this document are superseded by [unrestricted measurement media](../specs/2026-09-17-measurement-unrestricted-media-design.md).

Source: [specification](../specs/2026-09-17-measurement-media-upload-design.md). Standing autonomous Mode A authority. Implementation, review, rendered QA and final verification complete. Clean initial worktree recorded under `/tmp/lisno-measurement-media-qa`.

1. **Evidence/contract — parent and read-only audits, complete.** Trace measurement requirements, storage/history/permissions and UI; settle repeated `mediaFiles`, optional existing `file`, bounded25MiB batch and legacy compatibility. AC1–6.
2. **Backend — measurement_backend, complete.** Own backend only: bounded multipart middleware, media validation/storage, workflow history/service rules and retention/hash reconciliation, authenticated download route, registry/OpenAPI and tests. Preserve narrow estimate proof contracts and unrelated workflow rules. AC1–4,6.
3. **Frontend — measurement_frontend, complete; parallel with2.** Own frontend only: optional history/media types, multipart serialization/progress, direct media chooser/rows/validation, optional sketch and protected history download controls, focused tests. AC1,2,3,5.
4. **Rendered QA — parent, complete.** Actual workflow components with synthetic APIs, local synthetic files only; cover mixed uploads, no sketch, failure/draft controls/history, mobile/tablet/desktop, axe and console. Backend tests separately prove persistence/auth/transactions.
5. **Integrated integrity review — complete, no confirmed defects.** Verify multipart resource bounds, project/identity isolation, immutable history, file cleanup/unknown outcomes, legacy compatibility, query invalidation and UI lifecycle. Resolve findings in owned slices.
6. **Final verification — read-only runner, complete.** Relevant workflow state/instructions/routes/replica, attachment validator/local storage, shared authorization/OpenAPI checks; frontend workflow/action/API checks; typechecks/builds; diff/status. Avoid unrelated full/OCR suites unless evidence requires them.
7. **Handoff — parent, complete.** Update exact results and evidence paths, stop temporary server/browser, report deployment/migration boundaries. No commit/push/seed/production action or dependencies expected.

## Verification evidence

Both implementation slices and rendered QA complete. Backend361/361 focused tests, typecheck/build pass; includes30 new media HTTP/fault tests,86 workflow-state tests,13 replica,8 storage,6 projection,17 submission-gate tests plus201 shared upload/audio/authorization/API tests. Independent integrated review and separate authorization/API audit found no confirmed defects. Final integrated verification passed361 backend and166 frontend tests, both typechecks/builds and diff hygiene. Frontend focused47/47 tests and typecheck pass. Browser checks pass at360/768/1440px, with zero axe violations/overflow; PNG+MP4 upload without sketch, add/remove/reselect, dirty dismissal, failed save retention, same-key retry, per-media downloads, optional sketch/WebM save and stale-version blocking verified. Full evidence `/tmp/lisno-measurement-media-qa/browser-evidence.md`. Temporary browser/server and dependency symlink have been removed. Temporary artifacts remain outside tracked sources.


## Review outcome

Integrated review confirmed multipart resource bounds/abort behavior, shared proof validation preservation, required media with optional sketch, immutable history/CAS/transactional audit, complete evidence-set cleanup/replay/uncertain-commit retention, scoped downloads/safe metadata, legacy reads and UI draft/progress/cache behavior. No changes requested.

Residual implementation limits: storage deletion remains best-effort as established by the storage wrapper; unknown commit outcomes deliberately retain the complete evidence set rather than risking deletion of committed evidence. Synthetic clips cover supported containers but do not establish compatibility with every camera encoding or a production proxy's request limits. Combined upload default is25MiB; no transcoding added.


## Final backend verification

Independent runner passed backend typecheck/build and the160-test workflow group plus201-test shared group. First sandbox test attempt could not bind local sockets (EPERM); identical permitted rerun succeeded. Initial shared run had one existing API docs read-only-method assertion return404 rather than405; without code edits, the complete API docs file passed21/21 and an identical full shared-group rerun passed201/201. Recorded as transient, cause unestablished; no feature failure persists. Logs preserve the initial failure and successful reruns. Frontend integrated checks also passed166/166, typecheck and build.


## Final integrated verification and handoff

527 distinct tests passed:361 backend and166 frontend. Both typechecks and builds exit0. Independent review found no confirmed defects. Final `git diff --check` passes and28 intended source/test/document paths remain uncommitted. No dependency or lockfile changes.

Exact commands from `backend/`:

```sh
npm run typecheck
npm test -- tests/workflow-measurement-media.test.ts tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/local-storage.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-submission-gates.test.ts
npm test -- tests/uploads.test.ts tests/project-chat-attachments-validation.test.ts tests/project-chat-audio-validation.test.ts tests/project-chat-audio-upload.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm test -- tests/api-docs.test.ts
npm run build
```

The API-docs command was a diagnostic rerun after the transient failure above; the entire shared group subsequently passed unchanged. Replica tests emitted the existing Mongoose `new` option deprecation advisory.

Exact commands from `frontend/`:

```sh
npm run typecheck
npm test -- src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx
npm run build
```

Frontend build has the existing large-chunk advisory. Repository checks: `git diff --check`, `git status --short`.

Final logs under `/tmp/lisno-measurement-media-qa`: `final-backend-typecheck.log`, `final-backend-workflow-unrestricted.log`, `final-backend-shared-rerun.log`, `final-api-docs-rerun.log`, `final-backend-build.log`, `final-frontend-typecheck.log`, `final-frontend-workflow.log`, `final-frontend-build.log`, `final-diff-check.log`, `final-status.log`. Original failed attempts are retained in `final-backend-workflow.log` and `final-backend-shared.log`.

Principal changes: backend workflow evidence parser/storage, workflow state/history/service/instructions, authenticated media download, existing upload validator extraction, storage extensions and API/operation inventory; frontend WorkflowStageActions, multipart API/history DTO, measurementMedia validation helper and compact responsive styles. Tests cover changed contracts and prior workflow/proof consumers.

No full repository suites, unrelated signup/router tests or OCR were run; no lint script exists. No migration required or executed. No staging, commit, push, deployment, seed, production mutation or external-service call. Backend/frontend contract changes need coordinated release. Ignored builds remain under `backend/dist` and `frontend/dist`; all browser fixtures, screenshots and logs are in the temporary QA directory. Temporary browser, loopback server and dependency symlink are stopped/removed.

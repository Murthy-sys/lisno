# Assigned project visibility task plan

Source: [specification](../specs/2026-10-13-assigned-project-visibility-design.md). Current implementation request and standing autonomous instruction authorize the work; parallel execution remains selected.

## Ordered work and ownership

1. **Evidence and contract, complete.** Two read-only audits traced role visibility, canonical preparation data, assignment/read scope, mutation reuse and current UI consumers. Clean baseline recorded in `/tmp/lisno-assigned-project-visibility/`.
2. **Implementation, complete.** Independent backend/frontend slices ran in parallel. Backend owns read-only scope and permissions, repository parity and backend tests. Frontend owns list/detail/project-progress UI, actor-scoped generic read queries and rendered tests. Primary owns shared/frontend authorization synchronization, durable documents, integration decisions and browser QA. No overlap without explicit handoff.
3. **Integrity review, complete.** Review confirmed exact assignment/revocation, read/write separation and compatibility. Both confirmed frontend cache findings were fixed: execution stream denial/refresh and canonical project rename invalidation. Reviewer inspected the delta and found no unresolved confirmed defects. The six-file follow-up lane passed 47/47 and typecheck passed.
4. **Final verification, complete.** Integrated focused suites, both typechecks/builds and hygiene passed. Primary checked changed rendered/browser states and reconciled all touched paths. No unresolved review findings remain.

## Contract and ownership boundaries

- Existing public Project and DesignWorkflow DTOs/endpoints stay. No added protected route or permission code is required; only existing project list/detail/workflow read grants for Procurement/Program Manager.
- Backend may add narrowly named repository read methods and a read-only workflow scope path, including memory fixture support for exact Procurement assignments. Existing write/module APIs retain behavior. Program Manager status fallback is read-only and exact-ID based.
- Frontend uses genuine generic Project metadata, separate from ProcurementProject preparation data. Keep existing `/designer/projects/:projectId`, `/procurement/projects/:projectId`, and `/projects/:projectId/execution` routes. A small shared read-only overview/query helper is acceptable; no new route is needed.
- Primary owns `frontend/src/api/authorization-contract.ts` and associated frontend/backend contract expectations unless explicitly reassigned. Backend owns `backend/src/domain/authorization.ts`; report the policy version immediately so contracts match. No financial/API type nullability change for ProcurementProject.

## Acceptance and verification mapping

| Criteria | Required evidence |
| --- | --- |
| AC1–AC2 | Assigned/unassigned pairs across no/draft/pending/approved estimates; memory and Mongo list/detail/workflow tests, revoked grant/assignment checks. |
| AC3 | Role-based ProjectWorkflowPanel render checks, mismatch/error/source-issue state, unavailable actions; existing workflow mutation regressions. |
| AC4 | Mixed prepared/unprepared Procurement list/details, truthful totals, controls absent without preparation, independently failed preparation query. |
| AC5 | Exact Program Manager details/status access, unrelated denial and no chat/write expansion; execution regressions. |
| AC6 | Authorization/route contract tests, focused suites, both typechecks/builds, review, responsive/keyboard browser checks and `git diff --check`. |

Do not rerun unrelated full repository suites without a specific risk: earlier work documented unrelated failures. No lint script exists. Use disposable local databases for integration tests, never production or write migrations. Do not stage, commit, push, deploy, seed or send messages.

## Progress

- 2026-10-13: baseline clean; audits complete enough to settle read-only contract. Existing approval-gated financial projections remain authoritative for actions.
- Primary synchronized policy version `2026-10-13.assigned-project-visibility.v1` in backend auth service and frontend contract; existing permission vocabulary/route inventory is unchanged. Frontend test authorization fixtures gained only the three read permissions for Procurement/Program Manager. Focused contract checks passed: frontend 29/29, backend parity 3/3 (`frontend-contracts.log`, `backend-contracts.log`).
- Backend confirmed legacy preparation reads are role-scoped while new generic reads are exact-assignment scoped. Frontend preserves each successful read independently, with regression coverage for preparation available but generic metadata denied, and vice versa.
- Explicit frontend ownership includes `ProjectWorkspace.tsx`/tests, `procurementPresentation.ts`, Procurement gallery tests and new `features/projects/` read-only helper/overview. Primary owns the policy version-only backend auth service edit and frontend auth fixtures; no overlap with implementation writers.
- Backend focused release: 462/462 across nine files, followed by 37/37 status tests after preserving the existing explicitly authorized Program Manager participant path. Frontend focused release: 185/185 across 14 files; both slice typechecks passed. Final integrated verification follows review fixes.
- Primary browser QA used actual React components with synthetic local GET responses, covering no-estimate list/detail navigation by keyboard for Designer, Procurement and Program Manager at 390px and 1440px. All three flows show one workflow panel, no horizontal overflow, no stage action controls, no unexpected requests/writes and no console/page errors. Viewport captures are in `/tmp/lisno-assigned-project-visibility/browser/`; full-page capture compositing artifacts were distinguished from duplicate DOM using unique heading/panel checks.

## Final verification, 2026-10-13

| Check | Result |
| --- | --- |
| Backend focused suite, including local Mongo replica sets | 572/572 tests, 12/12 files, exit 0 |
| Frontend focused suite, including rendered interactions and live revocation | 266/266 tests, 19/19 files, exit 0 |
| `npm run typecheck` in backend and frontend | Both exit 0 |
| `npm run build` in backend and frontend | Both exit 0 |
| Independent integrity review and cache-fix delta review | No unresolved confirmed defects |
| Three role flows at 390px/1440px, local synthetic browser data | Keyboard navigation, pending progress, read-only state, responsive layout and error checks passed |
| `git diff --check`; `git status --short` | Passed; only intended task paths |

Exact backend test command (run in `backend/`):

```sh
npm test -- tests/assigned-project-visibility.replica-set.test.ts tests/authorization-policy.test.ts tests/project-module-access.test.ts tests/design-workflow-projection.test.ts tests/design-workflow-state.test.ts tests/project-status-service.test.ts tests/project-status-mongo.replica-set.test.ts tests/project-status-routes.test.ts tests/workflows.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts --maxWorkers=2
```

Exact frontend test command (run in `frontend/`):

```sh
npm test -- src/features/projects/projectReadQueries.test.tsx src/features/execution/ExecutionWorkspace.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/designer/DesignerDashboard.test.tsx src/features/designer/ProjectWorkspace.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/ProcurementProjectGallery.test.tsx src/features/client/ClientProject.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/finance/FinanceProjectWorkflowControl.test.tsx src/features/designer/ProjectStructureDialog.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/SpacePlanningCompletion.test.tsx src/features/execution/ExecutionLiveProvider.test.tsx src/api/projectNameSync.test.ts src/api/authorization-contract.test.ts src/auth/authorization.test.ts src/auth/AuthProvider.test.tsx --maxWorkers=2
```

Acceptance coverage: AC1–AC2 passed asymmetric no/draft/pending/approved, assignment/grant revocation and memory/Mongo tests. AC3 passed readonly observer, source-conflict and existing action regressions. AC4 passed mixed preparation totals and independent authorization/error-state tests. AC5 passed direct and existing-participant Program Manager status, detail and live-denial tests. AC6 passed the integrated checks above.

Evidence: `/tmp/lisno-assigned-project-visibility/final-verification.md`, `final-*.log` and `browser/`. Initial backend sandbox listener failures were resolved by the approved local-listener retry; preserved separately in `final-backend-tests-sandbox.log`. Non-failing warnings: Mongoose deprecated `new` option and Vite chunks over 500 kB. Full repository suites and unchanged OCR tests were not rerun; no lint script exists. Browser data was synthetic, not a production end-to-end run.

No dependencies, schema migration, seed, live data changes, email, commit, push or deployment. Ignored build outputs were generated in `backend/dist/`, `frontend/dist/` and frontend TypeScript cache. Task browser/server stopped; task CLI artifacts moved out of the worktree into the evidence directory.

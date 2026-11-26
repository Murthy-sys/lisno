# Design and execution timeline configuration: task plan

Date: 2026-11-27
Status: Specification and task plan approved; user selected Mode A. Implementation and scoped verification complete. Five pre-existing failures remain in the broader regression checks.

Approved specification: [Design and execution timeline configuration](../specs/2026-11-27-workflow-timeline-configuration-design.md).

## Delivery and boundaries

Add **Design & execution timelines** to the Super Admin Configuration header. It opens two tables at `/admin/configuration/estimation/workflow-timelines`. Super Admin edits eight 0% base-workday values, previews the calculated 5–30% columns, and saves the complete configuration to the backend.

Use `ceil(baseWorkdays * (100 + 2 * customPercent) / 100)` for every derived cell. The supplied 56 default cells are the acceptance reference. Only positive integer bases from 1 to 3650 are valid.

This delivery configures workday scenarios. It does not apply dates to projects, calculate a project's Custom share, or change prices, approved artifacts, proposal copy, original deadlines, stage clocks, key-collection appointments or notifications. No dependencies, seed, backfill, deployment or production writes are planned.

## Architecture and implementation evidence

- The existing Configuration header lives in `KnowledgeBaseIndexPage.tsx`; the route registry, router and `AppShell` explicitly register Configuration pages. The button and all three navigation integration points must be covered.
- Follow the existing shared-runtime pattern in `shared/projects/projectInitiation.ts`: dependency-free definitions live inside the backend build root and are re-exported to the frontend. This avoids divergent calculations and imports outside the backend's TypeScript `rootDir`.
- The existing project-initiation-defaults service uses `AppRepository.runInTransaction`, authorization coordination, version checks and `audit.append(..., transaction)`. Reuse this pattern for configuration persistence and audit atomicity rather than adding another transaction abstraction.
- Both repository implementations already support transactions. Mongo uses a session and handles duplicate-key retries; memory uses an isolated snapshot and serialized writes. Add the new singleton to both implementations and their state/snapshot handling.
- Use a singleton model with a fixed ID and version. An absent record reads as defaults at version 0 without writing. First save creates version 1; later writes require the expected version. Configuration and its audit entry commit together.
- Register dedicated read/update permissions and operations for active Super Admin only. Runtime validation, OpenAPI, frontend permission contracts and route visibility must agree.

## Ordered tasks and ownership

The primary agent keeps one parent task active at a time. Task 3 may contain two concurrent implementation slices after Task 2 settles their shared contract. No subagents start until the user selects Mode A.

### Task 1: Establish the change baseline

Owner: primary agent. Dependencies: approved task plan and selected execution mode.

- Capture the current dirty-path list and before-images/per-target diffs for every existing file that will be edited. Reconcile the existing changes before assigning ownership.
- Read the relevant repository state constructors, authorization registry, API error handling, query-session scope and Configuration route patterns.
- Confirm the existing local app and test setup. Preserve running services; use an owned preview port for browser checks and synthetic data for screenshots.
- Record baseline failures if an applicable check fails before edits. Historical test counts are context only.

Completion: target ownership and baseline are recorded; unrelated work is preserved. Covers AC8.

### Task 2: Establish the shared contract and access inventory

Owner: primary agent. Dependency: Task 1.

Owned files/areas:

- New `backend/src/contracts/workflow-timelines.ts` and `shared/projects/workflowTimelines.ts` re-export.
- `backend/src/domain/authorization.ts`, `route-operations.ts`, `audit-actions.ts`.
- `frontend/src/api/authorization-contract.ts` and the corresponding permission/operation inventory assertions.
- New focused calculation/contract tests.

Work:

- Define stable IDs for the four fixed value bands, seven percentage columns, eight default bases, request/response types and a pure matrix calculator.
- Keep runtime schema parsing on the backend; frontend previews import only dependency-free definitions and the same calculator.
- Freeze the complete request shape containing `expectedVersion` and bases identified by stable band ID. Explicitly reject missing, duplicate, unknown or extra entries and unsafe versions.
- Freeze the response with version, bases, calculated matrices and nullable updater/timestamps for unsaved defaults. Use the repository's standard validation/conflict error envelope.
- Add dedicated Super Admin read/update operations for `GET /admin/workflow-timelines` and `PUT /admin/workflow-timelines`, plus a configuration-update audit action.
- Verify all 56 supplied defaults and upward rounding with unequal bases; check the limits and that calculations always derive from the original base.

Completion: backend and frontend can implement against the same settled contract without editing each other's shared files. Covers AC2, AC3, AC5.

### Task 3: Implement persistence and the configuration page

Dependency: Task 2. In Mode A, these slices can run concurrently with explicit ownership. In Mode B, implement them sequentially inline.

**Backend slice owner: backend implementer.**

Owned files/areas:

- New `backend/src/models/WorkflowTimelineConfiguration.ts`.
- `backend/src/repositories/types.ts`, `memory.ts`, `mongo.ts` and any directly required repository state fixtures.
- New `backend/src/services/workflow-timelines.service.ts`, `backend/src/routes/workflow-timelines.ts`.
- New `backend/tests/workflow-timelines.test.ts` and `workflow-timelines-mongo.replica-set.test.ts`.

Work:

- Implement read defaults without persistence, strict complete-save validation and transaction-only singleton writes.
- Revalidate the stored active Super Admin identity and preserve the sole-active-Super-Admin invariant. Use established authorization coordination for saves.
- Write the configuration and safe before/after audit in the same transaction. A failure in either must leave both unchanged.
- Enforce expected-version checks for first creation and ordinary updates. Concurrent writes from the same version must yield one success and one conflict, with one committed audit.
- Cover memory/Mongo parity, refresh reads, invalid inputs, permission denial, audit rollback and both concurrency cases. Use the existing isolated replica-set test helper, not a running application database.
- Prove configuration saves leave representative project, estimate, stage and appointment records unchanged.

**Frontend slice owner: frontend implementer.**

Owned files/areas:

- New `frontend/src/features/workflow-timelines/` page, scoped styles, API/query integration and rendered tests.
- Narrow button insertion in `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx` and its existing index-page tests.

Work:

- Build two labelled semantic tables using existing layout, form and feedback components. Only eight base cells are inputs; other cells are derived text.
- Show project-value labels, Custom-value-share explanation, workday units, Save timelines and Discard changes.
- Use an authorized identity/session-scoped query and the version returned by the server. Update/invalidate the saved configuration query after mutation.
- Preserve the unsaved draft on failed saves and stale-version conflicts. Do not silently replace a dirty draft during refetch; provide an explicit reload/discard path after conflict.
- Cover loading, retry, empty numeric input, invalid values, dirty state, pending-save controls, success and error feedback. Failed reads must not appear as saved defaults.
- Add the visible header button with the dedicated read permission. Ensure wrapped actions remain usable.
- Contain table overflow on narrow screens; provide phase/band-specific input labels, focus visibility and accessible validation/feedback.
- Add rendered tests for all default cells, isolated row edits, read-only derived cells, save/revisit, discard, error retention, conflict handling and identity changes.

Both implementers must preserve others' changes and report contract issues to the primary agent rather than modifying shared definitions independently. Covers AC2–AC7.

### Task 4: Integrate API and navigation

Owner: primary agent. Dependency: both Task 3 slices complete.

Owned files/areas:

- `backend/src/app.ts`, relevant `backend/src/openapi*` module(s), and index registration only if the model requires it.
- `frontend/src/app/routeRegistry.ts`, `router.tsx`, `routePaths.ts` if needed, and `frontend/src/components/layout/AppShell.tsx`.
- Shared route/OpenAPI/permission integration tests and synthetic browser fixtures where necessary.

Work:

- Wire the service/router into application construction and document complete request/response/error schemas in OpenAPI.
- Register the page as a Configuration child with dedicated permission checks, direct-link handling and Back to Configuration navigation. Keep existing Configuration navigation working.
- Verify the complete path from the pictured Configuration header through editing, save and revisit.
- Reconcile authorization inventory changes by exact operations/permissions, not by blindly updating snapshot counts.
- Inspect integrated diffs against Task 1's baseline, including all adjacent pre-existing changes.

Completion: the visible button opens a functioning, backend-persisted configuration page. Covers AC1, AC4–AC6.

### Task 5: Integrity review and final verification

Owner: primary agent; Mode A uses `integrity_reviewer` followed by `verification_runner` after all writers finish. In Mode B, perform the same review and checks inline.

- Review authorization, singleton/CAS behavior, transaction/audit rollback, read-without-write semantics, shared rounding, dirty-form/cache behavior and persistence boundaries.
- Resolve findings before final verification. Run tests on the integrated tree, not while writers are changing shared files.
- Verify desktop and narrow-screen navigation, table scrolling, keyboard edits, visible focus, validation, saving, retry and conflict UI with rendered interaction checks and browser inspection.
- Report any unrelated baseline failures separately with evidence. Do not claim complete verification when a required lane could not run.

Completion: AC1–AC8 reconciled with actual evidence and remaining limitations recorded.

## Verification commands and acceptance mapping

Run from the indicated workspace; test names for new files above are the planned names.

| Area | Command/check | Acceptance criteria |
| --- | --- | --- |
| Calculation, API, memory and isolation | `cd backend && npm test -- tests/workflow-timelines.test.ts` | AC2–AC6 |
| Transaction rollback and concurrent saves | `cd backend && npm test -- tests/workflow-timelines-mongo.replica-set.test.ts` | AC4–AC6, AC8 |
| Authorization and frontend contract parity | `cd backend && npm test -- tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/frontend-authorization-contract.test.ts` plus the actual route-operation/OpenAPI inventory tests | AC5, AC8 |
| UI behavior | `cd frontend && npm test -- src/features/workflow-timelines src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/api/authorization-contract.test.ts src/auth/authorization.test.ts` | AC1–AC5, AC7 |
| Backend compilation/package | `cd backend && npm run typecheck && npm run build` | AC8 |
| Frontend compilation/package | `cd frontend && npm run typecheck && npm run build` | AC8 |
| Rendered browser checks | Configuration button and page at approximately 1440px and 390px widths; keyboard flow, contained overflow and console/network inspection | AC1, AC7 |
| Repository hygiene | `git diff --check` and `git status --short` | AC8 |

Broaden to adjacent tests if shared-contract review or failures reveal an impact. There is no repository lint script, so no lint success will be claimed. Keep test databases, preview output and screenshots temporary/ignored, report their paths when retained, and stop only processes started for this task.

## Handoff

Report the button's location, eight editable base fields, automatic recalculation and persistence behavior. Link principal changed files and state exact checks/results, any unrun checks and baseline failures. Confirm that project date application remains outside this delivery. No commit, push, deployment, migration or customer communication is included.


## Execution record

- Task 1 complete: baseline source copies, initial status and diff captured under `/private/tmp/lisno-workflow-timelines-20261127/` before writers began.
- Task 2 complete: shared runtime definitions and calculation live under the backend build root with a frontend re-export. Dedicated read/update operations and audit action added.
- Tasks 3 and 4 complete: backend persistence and frontend page integrated with app/OpenAPI, authorization registries, Configuration routing and button.
- Task 5 complete: integrity review identified an audit-history disclosure to Design Head; timeline values are now redacted from non-Super-Admin audit projections, preserving stored history and pagination. Regression and follow-up review confirm the fix; no unresolved integrity findings remain.


## Final implementation and verification record

The Configuration header now includes **Design & execution timelines**. It opens the two approved scenario tables with eight editable base-workday fields, shared recalculation, strict backend persistence, version conflicts and discard/reload behavior. Only Super Admin can read or update the settings. Values in audit history are also limited to Super Admin.

Principal implementation files:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`: visible Configuration action.
- `frontend/src/features/workflow-timelines/WorkflowTimelinesPage.tsx`, `workflowTimelinesApi.ts`, `workflowTimelines.css`: tables, editing, validation, saving, session-scoped caching and responsive behavior.
- `backend/src/contracts/workflow-timelines.ts` and `shared/projects/workflowTimelines.ts`: stable bands, defaults, types and one calculation rule.
- `backend/src/services/workflow-timelines.service.ts`, `routes/workflow-timelines.ts`, `models/WorkflowTimelineConfiguration.ts` and both repositories: authorized transactional saving and audit.
- Application, OpenAPI, permission and frontend route registries wire the complete feature; `audit.service.ts` protects configuration history from other roles.

Final commands and results:

```sh
# backend/: 398 passed, 1 baseline failure; exit 1
npm test -- tests/workflow-timeline-calculation.test.ts tests/workflow-timelines.test.ts tests/workflow-timelines-mongo.replica-set.test.ts tests/audit-security.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts tests/api-docs.test.ts

# frontend/: 269 passed, 4 baseline failures; exit 1
npm test -- src/features/workflow-timelines src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/app/router.test.tsx src/components/layout/AppShell.test.tsx src/api/authorization-contract.test.ts src/auth/authorization.test.ts

# Each of backend/ and frontend/: exit 0
npm run typecheck && npm run build

# Repository: exit 0
 git diff --check
 git status --short
```

All feature-specific checks passed, including eight replica-set cases for persistence/concurrency, audit privacy, row calculations, input validation, authorization, navigation, errors and session isolation. The broader runs have **667 passing checks and five baseline failures**. Baseline copies independently reproduce: the OpenAPI Mode-tier expectation omitting existing `default`; two signup-restore expectations for `Your design plans`; room selection expecting `Wardrobe carcass`; and a reopened-estimate assertion matching duplicate ₹22,420 text. These unrelated tests were not weakened or changed to pass.

Browser evidence uses the synthetic enterprise fixture, with real backend persistence separately exercised on isolated memory/Mongo test repositories:

- At 1440×1100, the Configuration button is visible and opens both complete tables.
- Changing the first Design base from 15 to 17 produces 19, 21, 23, 24, 26, 28 in its derived columns. Save, return and reopen preserve 17 in the synthetic transport.
- At 390×844, document overflow is absent; each table scrolls within its 372px container over 780px content.
- Keyboard navigation reaches the first labelled base input with visible solid focus. Axe reports zero violations; no render errors or unexpected API requests occurred. Axe emitted one asset-preload warning.
- The existing local development supervisor was restarted to load the new API. Read-only checks confirm GET/PUT in local OpenAPI and HTTP 401 for unauthenticated access. No existing user/project/configuration records were changed during this runtime check.

Acceptance reconciliation: AC1 navigation/desktop/mobile verified; AC2 all56 cells verified; AC3 independent edits verified; AC4 save/discard/error/CAS verified; AC5 direct API and audit access/session privacy verified; AC6 project/estimate/deadline/appointment isolation verified; AC7 semantic/keyboard/scroll/accessibility checks verified; AC8 scoped tests/typechecks/builds/hygiene verified with the unrelated baseline exceptions above.

Artifacts, scoped before/after diff, test logs, baseline reproductions, screenshots and `browser-verification.json` are retained outside the worktree at `/private/tmp/lisno-workflow-timelines-20261127/`. Temporary preview/browser processes were stopped. The user's local application services remain running. Builds created ignored `backend/dist` and `frontend/dist` outputs; frontend retains its existing large-chunk warning.

No dependencies or lockfiles changed. No migration, seed, backfill, commit, push, deployment, external messages or production writes were performed. Full unrelated suites and OCR checks were not run; there is no lint script. Project completion dates remain outside this approved configuration-only delivery.

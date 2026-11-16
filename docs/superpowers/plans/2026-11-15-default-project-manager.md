# Default Project Manager implementation plan

Date: 2026-11-15
Status: Implemented and verified within scope; T0–T7 complete. Repository-wide suites retain the baseline failures documented below.
Approved specification: [Default Project Manager for new projects](../specs/2026-11-15-default-project-manager-design.md).
Specification approval: user replied “Approved” on 2026-11-15 after the specification was presented. The specification file retains its original proposal-stage wording; this plan records the approval without changing that approved document.
Execution mode: A, parallel sub-agents, explicitly selected after task-plan approval on 2026-11-15.

## Outcome and boundaries

Configure one default canonical Project Manager (`site_manager`), display that person in a disabled **Project Manager** field using the existing initiation-form styling, and assign the saved ID to every newly created project. Persist assignment on `Project.programManagerId`; changing the default must not reassign existing projects.

Super Admin alone manages the global default. An absent or invalid default blocks new creation. The new Sales web flow keeps Sales ownership but does not create an implicit Sales Manager grant. Existing Sales Manager/Super Admin initiation and legacy explicit Sales Manager payloads retain their current grant rules. Preserve approval history, task-generation triggers, receipts, invitation semantics, and all unrelated work.

This plan authorizes no code changes by itself. After plan approval, ask for execution mode exactly as required by `AGENTS.md`; implementation starts only after the mode response. No deployment, production setting change, seed, backfill, migration execution, commit, push, or external communication is included.

## Settled implementation contract

### Setting and resolution

- Add `ProjectInitiationDefaults` as a singleton with `projectManagerId`, a positive stored `version`, `updatedById`, and `updatedAt`. Absence reads as version 0 and status `unconfigured`; never materialize a fallback during a read.
- Public projection is a discriminated union: `{ version, status: "ready", projectManager: { id, name } }` or `{ version, status: "unconfigured" | "unavailable", projectManager: null }`. The available name is current display information; the ID is the join key.
- Repository methods read the singleton and conditionally save it. First-write expected version is 0; subsequent writes compare the current version. Same-ID saves with the current version are no-ops. Stale versions conflict even if the submitted ID happens to match. Concurrent first writes must have one winner.
- Add one transaction-aware resolver in `services/project-initiation-default-resolution.ts` using `AppRepository`. It checks the saved version when supplied, validates active/nondeleted `site_manager`, and returns the chosen ID plus provenance/version. Approval-time direct-Mongoose creation calls it with `createMongoRepository(session)` within the existing transaction; no nested transaction or second source of truth.
- Creation and setting writes coordinate through the existing authorization mutation mechanism. Validation must happen after coordination inside the transaction, so default changes and account role/deactivation changes cannot commit an unchecked owner.
- Use explicit errors: `PROJECT_INITIATION_DEFAULT_UNCONFIGURED`, `PROJECT_INITIATION_DEFAULT_UNAVAILABLE`, and `PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT`. Mutation stale-version errors use 409; unavailable/unconfigured creation fails with a recoverable conflict and safe user-facing message. Invalid setting selections use the established field-validation envelope.

### HTTP and permissions

- Register authenticated `GET /admin/project-initiation-defaults` and `PUT /admin/project-initiation-defaults` with strict runtime schemas and documented responses. PUT accepts `{ expectedVersion, projectManagerId }` and returns the current projection after success/no-op.
- Add `projects.initiation_defaults.read` for current project-creation roles and `projects.initiation_defaults.manage` for Super Admin only. Keep route-operation and frontend/mobile permission inventories synchronized. The write service independently rechecks the sole active Super Admin invariant.
- Reuse `GET /admin/program-managers` and `frontend/src/features/admin/procurementProjectIdentityApi.ts` for the Super Admin picker. Do not expose that directory to Sales through the new read permission.
- Add optional nonnegative integer `projectManagerDefaultVersion` to initiation requests. The web sends the ready projection's version; older clients may omit it. Clients cannot supply an overriding Project Manager ID.
- Sales may omit `salesManagerId`; if supplied, preserve its original role/availability validation and grant behavior. Other initiators still require the existing Sales selection and cannot supply `salesManagerId`.
- Add a narrowly scoped repository projection for a Sales creator's exact initiated project, checking active Sales identity, `assignedEstimatorId`, and the linked lead owner by stable IDs. Reuse `admin-project-summary.ts`; do not expand `findAdminProject`, project-list authorization, or general Admin reads. Invoke the new projection only from initiation/replay after receipt and actor checks.

### Web behavior

- Super Admin Projects header gets the text action **Project defaults**, opening a contextual settings panel. Existing styles/controls are reused; no new icon, font, dependency, global CSS redesign, or lockfile change.
- Sales initiation replaces its Sales Manager picker with a labeled disabled Project Manager input. Staff initiation retains its Sales picker and shows the same disabled Project Manager field.
- Default fetching, error, missing/unavailable, stale, and success states must be explicit. Keep Retry and configuration actions outside disabled fieldsets. Super Admin can reach configuration from the blocked state without losing form inputs; sequence contextual panels to avoid nested focus traps.
- Scope the query key by authenticated identity. Refetch when opening, on relevant focus/invalidation, and after a stale-default rejection. A successful settings save invalidates/refetches open initiation defaults. No cross-account cached identity reuse.
- Both the submit button and the submit handler enforce current readiness. Default auto-population is excluded from dirty state. Preserve user-entered fields across errors.
- Preserve the exact attempted payload/key during ambiguous network retries. A definitive no-write version conflict can refresh the displayed default and prepare a new explicit attempt. Do not pair a committed attempt's key with a silently changed default version and manufacture a retry conflict.

## Ownership and dependency order

Only one parent implementation task is in progress at a time. Child work may progress concurrently within the designated implementation phase after its prerequisites are complete. In Mode B, the primary agent performs every task sequentially. In Mode A, use native agents with explicit file ownership, and tell each writer they are not alone and must preserve others' edits.

### T0. Record baseline and confirm interfaces

Owner: primary agent. Depends on execution-mode selection. Covers AC1–AC8 preparation.

- Capture `git status --short` and each target diff before writing. Preserve the vendor implementation dirty set described below.
- Confirm the three insertion paths, request/replay callers, default-picker API, canonical assignment consumers, and relevant test helper behavior against the current worktree.
- Record focused baseline results and tool availability, including the local replica-set binary and browser runtime. Identify existing failures without changing unrelated behavior.
- In Mode A, independent read-only audits may inspect creation/replay authorization and frontend state handling. They may not modify sources and must finish before file ownership is assigned.
- Freeze the API/error/resolver/projection interfaces above and share them with all writers. Stop for a specification update only if an actual behavioral conflict is discovered.

Exit: target baseline and ownership are recorded; no unresolved contract disagreement remains.

### T1. Implement shared contracts and transaction-safe persistence

Owner: primary agent. Depends on T0. Covers AC1, AC3–AC8 foundations.

Owned paths:

- New `backend/src/contracts/project-initiation-defaults.ts`, `backend/src/models/ProjectInitiationDefaults.ts`, and `backend/src/services/project-initiation-default-resolution.ts`.
- `backend/src/repositories/types.ts`, `memory.ts`, `mongo.ts`, and `admin-project-summary.ts` only as needed for the narrow creation projection.
- `backend/src/domain/authorization.ts`, `domain/route-operations.ts`, `frontend/src/api/authorization-contract.ts`, `frontend/src/api/types.ts`, and the mirrored `mobile/src/contracts/authorization.ts` if contract parity requires it.
- New default-repository/resolver tests and `backend/tests/helpers/project-initiation-defaults.ts` for explicit test-only configuration setup.

Implement singleton validation/CAS with memory and Mongo parity, including memory transaction mutation tracking, rollback snapshots, and Mongo session attachment. Implement the shared resolver and creator-only summary method without weakening ordinary repository access filters. Make test configuration explicit in each creation fixture; do not insert a default into production/demo seed data or globally disguise missing configuration in tests.

Verify absent/ready/unavailable projections, role checks, no-op/stale saves, transaction rollback, creator/project/lead asymmetry, concurrent initial writes, and stable-ID selection with two distinct managers. A test-only default is isolated from actual application configuration.

Exit: stable shared interfaces and storage/resolution regressions pass; parallel writers have no reason to edit these owned files.

### T2. Implement global-default service and HTTP routes

Owner in Mode A: `backend_implementer` assigned to settings only. Depends on T1. Covers AC1, AC4, AC8.

Exclusive paths: new `backend/src/services/project-initiation-defaults.service.ts`, `backend/src/routes/project-initiation-defaults.ts`, and new `backend/tests/project-initiation-defaults.test.ts` / `project-initiation-defaults.replica-set.test.ts`. These writers do not edit repositories, authorization inventories, `app.ts`, OpenAPI, or project creation services.

Implement authorized projection reads and transactional Super Admin saves. Validate actor, singleton version, and target under authorization coordination; audit effective replacements only. Return safe errors and no private unavailable-account information. Reuse the shared resolver/projection rules. Supply the exported factory/router signatures to the primary agent for app integration.

Verify all role outcomes, zero/one/multiple active Super Admin handling, invalid target identities, concurrent replacements, deactivation races, no-op audit behavior, and no writes on failure. A multiple-Super-Admin invalid state may need a memory/guard fixture because the Mongo unique index intentionally rejects it.

Exit: focused management/route tests pass after primary integration; no other role can write the global default.

### T3. Apply the default to every new-project insertion

Owner in Mode A: separate `backend_implementer` assigned to creation only. Depends on T1. Covers AC3–AC7.

Exclusive source paths: `backend/src/services/admin-project.service.ts`, `project.service.ts`, `estimate-project-handoff.ts`, `estimate-decision.service.ts` only where provenance/actor context must be passed, and `backend/src/routes/admin-projects.ts` for the request schema.

Exclusive tests: existing `admin-projects.test.ts`, `sales-initiated-projects.test.ts`, `admin-projects-mongo.replica-set.test.ts`, and new `project-initiation-default-creation.test.ts` / `project-initiation-default-creation.replica-set.test.ts`. Additional existing test files must be explicitly handed off by the primary agent before editing.

- In each actual insertion transaction, resolve the current default, validate any observed version, write `programManagerId`, and audit provenance. Leave linked/existing project branches untouched.
- Keep Sales lead ownership and staff-created grants. Skip implicit Sales Manager grants for the new Sales flow; retain validation/audit/grants for explicit legacy `salesManagerId` requests.
- Use the narrow creator summary for Sales responses/replays. Preserve old receipt fingerprints and legacy empty-intake compatibility. Replay successful original requests before applying new default readiness requirements; never reassign the stored project.
- Propagate default errors through approval-time creation so the enclosing transaction rolls back. Preserve client invitations as the current post-commit operation and do not call delivery on a failed creation.
- Confirm assignment derivation in downstream task generation uses the stored canonical owner. Do not add early tasks or overwrite existing task ownership.

Verify two projects on opposite sides of a default change, original/historical receipt replays, duplicate requests, changed-payload conflicts, actor mismatch, no-default/invalid-default rollback, legacy payloads, no arbitrary grants, creator result access, invitation no-write behavior, and approval-time existing-project preservation. Include Mongo replica-set race evidence and rollback of enclosing approval state.

Exit: all insertion paths use the same rule and focused creation/authorization regressions pass.

### T4. Implement settings and disabled creation field

Owner in Mode A: `frontend_implementer`. Depends on T1; can use contract-faithful request mocks while T2/T3 run. Covers AC1–AC6, AC8.

Exclusive paths:

- New `frontend/src/features/admin/projectInitiationDefaultsApi.ts` and `ProjectInitiationDefaultsPanel.tsx` with their tests.
- Existing `AdminProjectInitiationDialog.tsx`, `AdminProjectInitiationDialog.test.tsx`, `AdminProjectsPage.tsx`, `AdminProjectsPage.test.tsx`, `adminProjectsApi.ts`, `frontend/src/features/leads/LeadDashboard.tsx`, and `LeadDashboard.test.tsx` as needed.
- A small locally scoped style file only if existing styles cannot express the approved states. Shared UI primitives/global styles, shared API types/permission inventories, and existing enterprise fixture files remain primary-owned.

Build the Super Admin setting panel using the existing manager picker API. Replace the Sales Manager field in Sales initiation; retain the independent Sales selector in staff initiation. Keep current geometry/type/colors and form keyboard behavior. Implement all readiness, retry, conflict, data-retention, idempotency, and dirty-state rules in the settled contract.

Test real rendered behavior: disabled field/name, no manual choice/clear path, no Sales Manager directory call for Sales, correct version payload, unchanged staff selector, pristine close, blocked Enter submission, loading/error/unavailable states, retained input after conflict, scope change/account cache isolation, and default save/refetch while a form has edits. Do not test only CSS string declarations.

Exit: focused component/API tests pass; browser validation follows integrated wiring in T6.

### T5. Integrate contracts, fixtures, and cross-layer checks

Owner: primary agent. Depends on T2–T4. Covers AC1–AC8 integration.

Exclusive integration paths: `backend/src/app.ts`, `backend/src/openapi.ts`, optional focused `backend/src/openapi/project-initiation-defaults.ts`, route/OpenAPI/authorization contract tests and fixtures, and any previously shared files from T1. Primary also owns test-fixture updates outside explicitly delegated test files, including enterprise fixtures that already contain vendor changes.

- Wire service/router factories and document request variants, default state/errors, no-override semantics, and response projections.
- Run contract parity checks for backend/web/mobile inventories. Native payloads keep their current fields and behavior; update only necessary mirrored contracts, not native screens.
- Update affected successful-creation tests to explicitly configure the fixture default; keep independent unconfigured tests and ordinary existing-project tests unaffected.
- Check actual endpoint behavior from the frontend, query invalidation/account isolation, creator summary visibility, approval/handoff assignment, and no new PM powers.
- Inspect combined diffs and compare preserved vendor changes with the initial capture. Reconcile all agent reports; do not accept partial test results as final evidence.

Exit: writers are finished, integrated focused/contract suites pass, and the complete diff is ready for read-only integrity review.

### T6. Integrity review and final verification

Owner in Mode A: run `integrity_reviewer` after T5; address confirmed findings through the relevant owner, then run `verification_runner` after all fixes/writers finish. In Mode B, the primary agent performs both stages sequentially. Covers AC1–AC8.

The review must trace authorization, source of truth, CAS/first-write races, deactivation/default-change coordination, unchanged historical receipts, all insertion paths, linked-project preservation, no implicit grants, memory/Mongo parity, invitation side effects, and frontend stale/dirty/key handling.

Verification commands, run from the indicated workspace (include newly added named suites):

```sh
cd backend
npm test -- tests/project-initiation-defaults.test.ts tests/project-initiation-default-repository.test.ts tests/project-initiation-default-creation.test.ts tests/admin-projects.test.ts tests/sales-initiated-projects.test.ts
npm test -- tests/project-initiation-defaults.replica-set.test.ts tests/project-initiation-default-repository.replica-set.test.ts tests/project-initiation-default-creation.replica-set.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/project-manager-assignment.replica-set.test.ts
npm test -- tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/frontend-authorization-contract.test.ts
npm run typecheck
npm test
npm run build
```

```sh
cd frontend
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/admin/ProjectInitiationDefaultsPanel.test.tsx src/features/admin/projectInitiationDefaultsApi.test.ts src/features/leads/LeadDashboard.test.tsx
npm run typecheck
npm test
npm run build
```

Run the actual affected approval/project-creation suites as identified by T0 in addition to the named focused suites above. Replica tests must use the existing isolated `startMongoReplicaSet` helper; do not point tests at a user or production database or weaken transaction requirements. For mirrored mobile authorization changes, run `npm run typecheck` and `npm run test:contracts` in `mobile`; otherwise verify legacy mobile request compatibility through backend contract tests and report native runtime as untested.

Browser QA uses only local fixture identities: settings and initiation at 390px and 1440px, long names, ready/loading/unconfigured/unavailable/error/stale states, saved-default replacement, keyboard/focus/disabled semantics, accessible names/feedback, untouched-close behavior, retained form data, no overflow, and no unexpected console/network errors. Keep temporary evidence under `/tmp/lisno-default-project-manager-qa` or ignored browser-output paths; remove unnecessary files and never stage runtime outputs.

Run `git diff --check` and final `git status --short` at repository root. There is no lint script; do not claim lint passed. The earlier vendor task recorded unrelated frontend suite failures, but that is background only: establish the current baseline and attribute failures with evidence before declaring any check unchanged. Do not fix unrelated suites to conceal their failures.

Exit: each acceptance criterion has a concrete test or rendered-verification result, confirmed findings are resolved, and unrun/blocked checks are explicitly recorded.

### T7. Handoff

Owner: primary agent. Depends on T6.

Record implementation status and verification results in this plan. Report principal files/decisions, exact checks/results, remaining risks or unrun checks, and temporary evidence paths. Explain that a Super Admin must choose the actual default through Project defaults before future creation succeeds; no real default or production data was changed by implementation. Report no migrations/external actions performed. Do not call partially verified work complete.

## Safe parallelism

After T1 completes, T2 (settings service/routes), T3 (creation flows), and T4 (web UI) can run in parallel with their non-overlapping boundaries. The primary agent retains shared contracts, repositories, app/OpenAPI wiring, and dirty shared fixtures. T5 waits for all writers. Integrity review runs after integration; final verification runs after review fixes. Any new cross-owned file requirement is reported to the primary agent before editing. In Mode B, execute T0–T7 inline without implementation agents.

## Acceptance trace

| Criterion | Primary tasks | Final evidence |
| --- | --- | --- |
| AC1: setting authority/valid identity | T1, T2, T4, T5 | Role matrix, sole-Super-Admin enforcement, target validation, setting save UI |
| AC2: styled disabled field | T4, T6 | Rendered label/disabled/dirty-state regressions and two-width visual QA |
| AC3: all creation paths | T1, T3, T5 | Initiation/designer/approval insertion tests with two distinct managers |
| AC4: failures and races | T1–T4, T6 | CAS/role/default races, transactional rollback, stale-submit and Retry checks |
| AC5: existing projects/replay preserved | T3, T6 | Default A/B project fixture, original/historical receipts, duplicate request, linked handoff |
| AC6: correct ownership/access | T1, T3, T5, T6 | Asymmetric identity tests, no fabricated grants, scoped creation summary, legacy explicit payload |
| AC7: downstream history/workflow intact | T3, T5, T6 | Assignment/task regressions, approval rollback, invitation side-effect tests |
| AC8: integrated contracts/styles/worktree | T1, T4–T6 | Registry/OpenAPI parity, cache/account checks, builds/typechecks, final diff and hygiene |

## Preserved worktree and current-stage checks

Initial tracked changes belong to the completed vendor task: `ExecutionDetailPanel.tsx`, `ExecutionWorkspace.tsx` and its test, `VendorWorkPage.test.tsx`, `vendorWork.css`, and `frontend/src/test/fixtures/enterpriseRoutes.ts` / `enterpriseTransport.ts`. Untracked work includes vendor presentation/list/review components and tests, `enterpriseVendorData.ts`, and the 2026-11-14 vendor spec/plan. The approved 2026-11-15 default-Project-Manager spec is also untracked. None may be overwritten, staged, reverted, or reformatted incidentally.

The planning stage modified only this plan. The user subsequently approved it and selected Mode A; the execution record below describes the authorized implementation and verification.

## Execution record

- T0: baseline captured in `/tmp/lisno-default-project-manager-qa` (`initial-status.txt`, `initial-diff.patch`, and untracked hashes). Baseline focused backend: 90 tests passed after allowing local HTTP listeners; frontend: 72 tests passed. Initial sandbox HTTP bind errors were environment restrictions, not assertion regressions.
- Read-only audits completed for creation/replay and frontend state handling. Current Designer HTTP creation is denied; preserve that and do not grant Designer defaults-read permission while this remains so. Its internal creation service still applies the default.
- T1 complete: shared singleton contract/model, memory/Mongo transaction and CAS support, common resolver, scoped Sales creation/replay projection, permission/operation inventories, and repository tests implemented. The default is never seeded or inferred.
- T2 complete: dedicated settings agent implemented authenticated GET, sole-active-Super-Admin PUT, target validation, coordinated version checks, effective-change audit, and memory/replica-set tests. Primary integrated app wiring and OpenAPI.
- T3 complete: separate creation agent applied canonical `programManagerId` to initiation, internal Designer creation, and new-project approval handoff. Existing linked projects and receipt replays preserve their original assignment; Sales omission creates no implicit Sales Manager grant. Deterministic default-replacement/deactivation races and complete approval-transaction rollback tests were added after review.
- T4 complete: frontend agent added the existing-style Project defaults panel, identity-scoped defaults queries, disabled creation field, readiness/retry/conflict states, and exact ambiguous-retry payload preservation. Settings navigation retains the creation draft with one visible focus trap. No shared styles, primitives, dependencies, or lockfiles changed.
- T5 complete: primary synchronized backend/web/mobile permission vocabulary, new operation entries, policy version, OpenAPI, and explicit creation fixtures. The pre-existing mobile inventory gap is reported below rather than hidden. All initial vendor file diffs and untracked hashes are unchanged; the shared enterprise route fixture gained exactly two default/manager-directory handlers, with comparison saved in `preserved-vendor-shared-fixture.diff`.
- T6 review: independent integrity reviewer found no remaining product defect. An obsolete frontend authorization-prefix assertion was corrected. A corrected-submit test now waits for the existing assignee-query loading guard before clicking. No product behavior was changed to conceal test failures.

### Integrated verification evidence

Temporary evidence is in `/tmp/lisno-default-project-manager-qa`; all browser data and writes were synthetic and local. No user database or real organization setting was modified.

| Check | Result and evidence |
| --- | --- |
| Backend default repository, settings, creation, initiation, Sales, route registry, and web-contract suites (11 suites, including four replica suites) | 245/245 passed; `verification-backend-focused.log` contains the exact command and suite list. |
| Default creation races and full commercial approval transaction (two replica suites) | 50/50 passed; `creation-race-approval-replica.log`. Missing/inactive defaults roll back approval, lead, review-round, project, audit, and downstream writes. |
| Existing approval/publication and invitation replica suites after explicit fixture updates | 38/38 and 33/33 passed; `remaining-approval-publication-replica.log` and `remaining-invitation-replica.log`. Exact race outcomes, actor identities, and audit expectations remain asserted. |
| `npm test -- tests/api-docs.test.ts` and `npm test -- tests/leads.test.ts` | 73 passed/one original Mode-tier schema failure; 46 passed/two original draft-save failures. All newly affected assertions pass after explicit default fixtures and documentation expectations; `api-docs-final.log`, `leads-default-fixture-regressions.log`. |
| Project Manager assignment replica, Super Admin authorization, authorization policy | 228 passed, one existing audit-action-list failure; `verification-backend-authorization.log`. The identical failure reproduces on untouched HEAD in `verification-backend-authorization-head.log`. |
| Final six frontend feature/API/authorization suites | All 91 assertions passed in `verification-frontend-focused-final.log`. The accompanying accessibility run had one unrelated async summary-metric readiness failure; its isolated rerun passed all 31 in `verification-frontend-accessibility-retry.log`. |
| Full frontend: `npm test -- --maxWorkers=4 --reporter=json --outputFile=/tmp/lisno-default-project-manager-qa/frontend-full.json` | 6,921 passed, 98 failed. All 98 failed assertion identities exactly match the earlier vendor baseline; no new failure identity. `verification-frontend-full-comparison.json` records both evidence paths and comparison. |
| Full backend: `npm test -- --maxWorkers=4 --reporter=json --outputFile=/tmp/lisno-default-project-manager-qa/backend-full.json` | Initial integrated run: 7,574 passed, 78 failed, 24 pending. An untouched-HEAD comparison of the 19 relevant failing files reproduced 64 identical failures (813 passed/64 failed). Of the other 14, three passed isolated reruns; eleven required the explicit default-fixture/documentation corrections above and now pass. Full suites were not repeated after these test-only fixes. Exact comparison and follow-up evidence: `backend-full-comparison.json`, `backend-failures-head-command.json`, `backend-failures-head.json`. No unexplained new failure remains. |
| Backend/frontend `npm run typecheck` and `npm run build` | Passed. Final typecheck logs are `verification-backend-typecheck-final.log` and `verification-frontend-typecheck-final.log`; production build logs are `backend-build.log` and `frontend-build.log`. Vite retains its existing large-chunk warning. |
| Mobile `npm run typecheck`, `npm run test:contracts` | Typecheck passed; contracts three passed, one existing operation-inventory gap failed (508 backend operations versus 480 mirrored). Untouched HEAD has the same 28-operation gap, plus an older permission-count mismatch now synchronized. No native UI/runtime verification was performed. |
| Browser initiation/settings at 390px and 1440px | Disabled named field, no Sales Manager directory fetch, long manager names, settings replacement/version payload, retained draft and restored focus, one visible dialog, pristine cancellation, loading/missing/unavailable/error guards, and error retry all passed. No page overflow, runtime error, or unexpected request. Automated axe reported zero violations for initiation/settings; contrast rules with background images still require manual assessment. See `browser-ready.log`, `browser-settings.log`, `browser-states.log`, and screenshots. |
| Preserved work and hygiene | Initial tracked vendor diffs and untracked hashes match; shared fixture delta is limited to the two new handlers. `git diff --check` passed. There is no lint script. Own Vite and browser QA sessions were stopped. |

- T6 complete: an independent final verification agent reviewed the fixture/documentation corrections without finding a new defect. Final production sources were already covered by the integrity review, typechecks, builds, focused regressions, and browser QA. The final backend typecheck includes the last fixture corrections (`backend-typecheck-handoff.log`). Root reran the initially unstable assigned-visibility and KPI suites: assigned visibility passed, KPI 28/28 passed; the three Mongo-repository failures also reproduced on HEAD (`backend-transient-rerun.log`, `vendor-kpi-rerun.log`).
- T7 complete: no dependencies were added. No commit, push, deployment, seed, migration/backfill, production write, or external communication was performed. OCR and native runtime tests were not run because no OCR/native runtime behavior changed. Existing broader-suite failures remain outside this task; this is not a clean repository-wide test certification.

Rollout requires a Super Admin to choose a valid default through **Projects → Project defaults** before new project creation can succeed. Changing it affects future projects only. The actual default person's identity was deliberately not selected or hardcoded during implementation.

### Local mapping follow-up, 2026-11-15

The user subsequently requested mapping the existing Project/Site Manager. Read-only checks found exactly one active local `site_manager`, one active Super Admin, and no saved default. The running local development backend also returned 404 for the new defaults endpoint because its supervisor had not reloaded the implementation.

Restarted the same local backend/chat/OCR launcher, which explicitly skips account provisioning. Saved the unique existing Project/Site Manager through the authenticated, audited settings API with expected version 0; the saved default is now ready at version 1. Verified that the Sales session receives that same ready assignment from the initiation-default endpoint. No application code, role mapping, existing project assignment, seed, or production data changed. Local before/result evidence is retained in `/tmp/lisno-default-project-manager-qa/local-default-mapping-before.json` and `local-default-mapping-result.json`; the local development stack remains running.

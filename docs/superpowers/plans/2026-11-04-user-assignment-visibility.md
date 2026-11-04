# User assignment visibility: implementation plan

Date: 2026-11-04

Status: Specification and task plan approved; user selected Mode A. Implementation, integrity review and local verification complete on 2026-11-04.

Source of truth: [Approved specification](../specs/2026-11-04-user-assignment-visibility-design.md). Acceptance references below refer to its numbered acceptance criteria (AC1–AC9).

## Outcome and boundaries

The Manage user panel will show a compact, paginated Current assignments list before Save: project number/name, authoritative current stage, the user's responsibility/work status and which entries block the chosen role change. Existing authorized project links help locate the work.

This is a read-only visibility change. Preserve the role-change guard, Super Admin immutability, deactivation/deletion semantics, transactions/CAS, historical approvals and assignment ownership. No automatic transfers or new reassignment mutations. Do not start the application backend, launcher or OCR. Test-only in-process services, temporary Mongo replica sets and a synthetic frontend fixture are allowed verification tools; they must not connect to the user's database.

No dependencies, lockfile changes, seeds, migrations, live data changes, commits, pushes, deployment or communications. Preserve previous recommendation/checklist/dimension edits.

## Execution and ownership

Follow the selected mode after this plan is approved. In Mode A, use the bounded slices below; in Mode B, the primary performs all slices and equivalent review/verification sequentially. No agents run before the execution-mode choice. Keep only one parent phase in progress: baseline/contracts, implementation, integration/review, verification.

| Owner in Mode A | Exclusive write boundary |
| --- | --- |
| Primary | Spec/plan status and evidence; `backend/src/contracts/user-responsibilities.ts` (new); repository interfaces and memory fixture shape in `backend/src/repositories/types.ts`; matching additions to `frontend/src/api/types.ts`; composition in `backend/src/app.ts`; new operation in `backend/src/domain/route-operations.ts`; OpenAPI entry/schema in `backend/src/openapi.ts` and a focused new OpenAPI module if appropriate; route inventory/authorization contract tests and shared fixtures. Own final integration. |
| Responsibility backend implementer | `backend/src/repositories/memory.ts`, `mongo.ts`; focused responsibility query helper(s) if needed; `backend/src/services/user-administration.service.ts`; `backend/src/routes/admin-users.ts`; a focused responsibility policy helper if needed; user-administration/responsibility tests, including memory/Mongo parity. No writes to primary-owned shared contracts or project-status service. |
| Project-stage backend implementer | `backend/src/services/project-status.service.ts` and focused project-status service/route/Mongo regression tests. Reuse the existing domain projection; do not change stage calculations or the participant endpoint's authorization. No responsibility repository/route changes. |
| Frontend implementer | `frontend/src/features/admin/adminApi.ts`, `UserMutationDialog.tsx`, a new focused `UserResponsibilitiesPanel.tsx` and local styles/tests, plus relevant UserMutationDialog/UserDirectoryPage fixtures. Prefer a local stylesheet over broad administration styling. No shared API-type, backend or generic ContextPanel rewrites. |

All writers must be told that they share a dirty worktree, must not revert others' work and must report any needed cross-boundary change to the primary. The three implementation slices can run in parallel only after the primary fixes the contracts and service signatures in Task 2.

## Dependency-ordered tasks

### 1. Preserve baseline and settle integration points

Primary; prerequisite to all edits.

- Capture `git status --short`, affected full diffs and relevant file copies under `/private/tmp/lisno-user-assignment-visibility/` before writers begin. The route registry, OpenAPI and route-registry tests already contain unrelated estimate changes; primary must inspect and preserve them.
- Confirm the exact administrative actor checks, repository pagination conventions, project-number lookup and project-stage projection.
- Verify that the stage service's data-hydration path is read-only before reusing it. Any reusable read must not persist workflow state or fabricate an actor.
- Confirm the actual project route and any supported assignment anchor before adding a link. A normal Open project link is sufficient where no direct assignment destination is verified.

Exit: baseline captured; no ambiguous ownership; no changes to the approved product scope. Covers AC6/AC9.

### 2. Establish the shared contract and interfaces

Primary; depends on Task 1. Complete before parallel writers.

- Define the read-only responsibility response and repository row/page types, including the eleven category keys, stable source IDs, target version/role, requested destination, read timestamp, counts, full blocking count, rows and pagination.
- Use the existing pagination defaults/bounds: default 20, limit 1–100, nonnegative offset. Blockers sort first, then deterministic category/source identity ordering. Pagination must operate on responsibility rows; totals cover the full scope.
- Define explicit nullable context and availability states for unlinked leads, direct reports, unresolved projects/numbers and unavailable stages. A source ID remains available when its linked project is missing. Project number and system ID remain separate.
- Agree the repository read method and the service dependency for page-project stage enrichment. Only page project IDs may be hydrated; duplicate IDs are hydrated once.
- Define the narrow administrative stage read: authenticate the stored actor and bind requested IDs to the target user's enumerated responsibility page. Reuse the canonical stage projection, return only needed metadata and leave the public participant endpoint unchanged. Do not export a general unrestricted status reader.
- Extend memory estimate/workflow assignment fixture shapes with explicit optional lineage where necessary. Legacy fixtures without lineage produce an unavailable context, never a guessed link.
- Add matching frontend API types. No new role permissions or unrelated contract generation changes are needed unless the established generator requires the new registered operation.

Exit: backend, stage and frontend writers have exact shared types/signatures and invariant examples. Covers AC2–AC6/AC8.

### 3. Implement responsibility enumeration and the administration endpoint

Responsibility backend implementer; depends on Task 2. Parallel with Tasks 4 and 5 in Mode A.

- Enumerate all eleven categories using the existing count predicates. Factor compatibility into a reusable pure policy if needed, preserving the current `null` workflow-task mapping and all existing outcomes. Omitted/current destination role reports zero blockers because no role change is requested.
- Implement bounded, deterministic page selection and counts in memory/Mongo. In Mongo, use projected queries/counts rather than loading full documents or the full portfolio into application memory; share the current session when invoked within a repository transaction.
- Resolve estimate/project/lead/task lineage only through stable IDs. Retain counted records even if a related entity is absent or inconsistent. Direct reports and linked completed Client projects retain the existing guard's semantics.
- Add the service read with stored administrative actor/target validation. Enrich distinct page projects through the agreed stage dependency; isolate safe missing/inconsistent context without swallowing authentication/authorization failures.
- Add strict query validation and `GET /admin/users/:userId/responsibilities` to `admin-users.ts`. Keep PATCH/DELETE contracts and mutation behavior unchanged.
- Cover every category and exclusion, same/compatible/incompatible destination roles, pagination, stable sorting, missing lineage and no writes. Cross-check listed totals against `countUserResponsibilities`.

Exit: endpoint behavior works in focused tests against both repository implementations. Covers AC1–AC6/AC8.

### 4. Expose the narrowly authorized project-stage projection

Project-stage backend implementer; depends on Task 2. Parallel with Tasks 3 and 5 in Mode A.

- Implement the agreed administrative projection entry point using the existing commercial source selection, workflow evidence and `deriveProjectStatus` path.
- Return generated project number/name, broad status and current-stage key/label/state needed by the assignment list. Do not return pending-action people, financial amounts, contact details or source documents.
- Keep linked-project validation and read scope explicit. Do not use the target user's credentials, grant membership or relax the public status API.
- Exercise two unequal projects at different actual stages, missing/conflicting evidence, unauthorized actors, stale/inactive identities and no-write behavior. Retain the existing project-status regressions.

Exit: administrative metadata agrees with the canonical stage projection; participant access rules are unchanged. Covers AC2/AC4/AC6/AC8.

### 5. Add the compact assignments section

Frontend implementer; depends on Task 2. Parallel with Tasks 3 and 4 using typed synthetic responses.

- Add API functions and query keys scoped by target user, selected destination role, pagination and appropriate target-version invalidation. No previous-user placeholder data.
- Render the list after identity/role controls, before account-status/delete sections. Show total responsibilities, full blocker count, current stage separately from own work status, and explicit unavailable/unlinked/non-project cases.
- Provide Refresh, accessible pagination and loading/error/retry/empty states. Reset pagination on target/destination changes. Keep blocker totals visible across pages and compact row spacing with wrapped long names.
- On `RESPONSIBILITY_REASSIGNMENT_REQUIRED`, retain the selected role and refetch assignments. Refresh on reopening/returning and target-version changes. Preserve existing version-conflict behavior; never automatically resubmit.
- Use permission-gated Open project links with stable IDs. Prefer a new-tab link with explicit accessible indication and `rel="noopener noreferrer"` so inspection preserves the unsaved role in the current panel; no generic ContextPanel navigation changes are necessary. Existing destination authorization remains authoritative.
- Keep Save governed by the existing mutation flow. The preview informs the user; it is not an authorization decision and does not bypass the backend guard. A failed preview must not falsely assert there are no blockers.
- Test two-user cache isolation, slow/out-of-order destination responses, pagination/full counts, 409 refresh, loading/failure/empty/unavailable states, link permissions, keyboard labels and unchanged deactivation/deletion behavior.

Exit: complete section works with contract fixtures without requiring a running backend. Covers AC1–AC7.

### 6. Integrate and review

Primary, then read-only integrity reviewer in Mode A; depends on Tasks 3–5 finishing.

- Wire services in `app.ts`, register the operation using `identity.users.read` with the existing administrative scope and update OpenAPI inventory/request/response schemas. Preserve existing dirty additions.
- Reconcile route authorization fixtures and any response test fixtures; add tests proving unauthorized users cannot obtain target/project details and GET performs no mutation/audit write.
- Compare count/list predicates across memory and Mongo, especially task completion, supersession, grants, inactive reports and retained Client links. Check page-wide vs full-scope totals and stable source joins.
- Review stage-source reuse, constrained service access, generated project-number lineage, query isolation, refresh behavior and unchanged transactional role updates. Resolve confirmed review findings within the owning files.
- In Mode A, run `integrity_reviewer` after all writers finish, with no product-source write access requested. In Mode B, primary performs the equivalent review. Do not proceed with known authorization or lineage defects.

Exit: integrated code and review findings resolved. Covers AC2–AC9.

### 7. Verify and record evidence

Verification runner in Mode A, primary in Mode B; after Task 6. No concurrent product writers during final checks.

Run focused regressions first. Exact new test names may be consolidated into existing files; record the executed paths and results rather than claiming an unrun command passed.

Backend focused, from `backend/`:

```sh
npm test -- tests/user-administration.test.ts tests/user-responsibilities.test.ts tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-routes.test.ts
npm test -- tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/super-admin-authorization.test.ts tests/api-docs.test.ts
npm test -- tests/user-administration-mongo.replica-set.test.ts tests/project-status-mongo.replica-set.test.ts
npm run typecheck
npm run build
```

Use the existing `startMongoReplicaSet` helper for temporary test-only Mongo. Never read `backend/.env` credentials into logs or reuse the local/demo database. If test infrastructure is unavailable, report it explicitly instead of substituting real data or weakening transaction checks.

Frontend focused, from `frontend/`:

```sh
npm test -- src/features/admin/UserResponsibilitiesPanel.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserDeletionDialog.test.tsx src/components/ui/ContextPanel.test.tsx
npm run typecheck
npm run build
```

Include a focused API/query test if behavior is not covered by those rendered tests. Broaden to existing authorization/project-status suites only if shared changes or failures justify it; avoid repeating passing tests without new changes.

Rendered checks use the actual Manage user panel with synthetic data and a temporary frontend-only fixture:

- 1440 px desktop, 768 px tablet and 390 px mobile: long project names, multiple project stages, non-project rows and more than one page; inspect screenshots and panel/footer overflow.
- Keyboard reachability, readable stage/work labels, focus, refresh/pagination, permission-gated project navigation and an accessibility scan.
- Open one user, switch to another, change destination, simulate a 409 and refresh after reassignment; confirm no stale rows or automatic PATCH retry.
- Inspect application console errors and synthetic failed-response states. Stop only agent-owned frontend/browser/test processes afterward.

At repository root run `git diff --check` and `git status --short`, compare target diffs against the baseline and verify no unrelated files were overwritten. Record logs/screenshots under `/private/tmp/lisno-user-assignment-visibility/`; build outputs remain ignored. No lint command exists and none is claimed.

Exit: evidence mapped to all acceptance criteria, limitations stated, and temporary services stopped.

## Acceptance coverage

| Criterion | Main evidence |
| --- | --- |
| AC1: immediate visibility and user isolation | Panel/query tests and two-user browser flow. |
| AC2: correct project ID, stage and responsibility | Asymmetric repository/service fixtures, canonical-stage comparison and screenshots. |
| AC3: complete categories and blockers | Eleven-category memory/Mongo count parity, destination-role and pagination tests. |
| AC4: explicit missing context | Missing/conflicting lineage fixtures and rendered unavailable states. |
| AC5: refresh, races and CAS | Conflict/refetch tests, out-of-order response tests and unchanged role-mutation regressions. |
| AC6: authorization and no mutations | Route/service negative tests, actor validation, no-write assertions and participant API regressions. |
| AC7: usable responsive panel | Rendered state/keyboard tests plus desktop/tablet/mobile fixture inspection. |
| AC8: persistence/contract parity | Mongo replica-set regressions, repository parity and OpenAPI/operation registry checks. |
| AC9: integrated validation | Typechecks/builds, final integrity review, hygiene and recorded results. |

## Handoff requirements

Update this plan with changed files, exact test/build results, browser evidence and any remaining limitations. Clearly distinguish synthetic frontend checks and temporary test Mongo from a live application check. No production or pictured-user changes are performed. Do not call the implementation fully verified if a required authorization, repository or rendered check remains unrun.

## Implementation record

- Captured the initial dirty paths, affected diffs and source copies under `/private/tmp/lisno-user-assignment-visibility/`. Previous recommendation/checklist/dimension work was retained.
- Added the minimal `user-responsibilities` backend contract and matching frontend types. Repository `types.ts` includes bounded enumeration and explicit optional lineage for legacy memory fixtures.
- Added shared compatibility policy in `backend/src/domain/user-responsibilities.ts` and projected enumeration in `backend/src/repositories/user-responsibilities.ts`, with memory/Mongo entry points. All eleven categories use the previous guard predicates. Mongo reads counts and selected category page ranges, not the entire portfolio.
- Added the strict GET route, `no-store` response, registry entry and explicit OpenAPI schemas. Existing mutation contracts are unchanged. Updated route-manifest assertions to 501 human operations/522 total documented operations, including the previous unrelated recommendation route already present at baseline.
- Narrow administrative orchestration resides in `ProjectStatusService.readUserResponsibilities`: it validates the actor and target, enumerates the target's page inside the same repository snapshot and enriches only those distinct project IDs. User administration delegates to that reader through an injected dependency. This implements the agreed boundary without exporting an unrestricted arbitrary-project reader. The public participant API is unchanged; existing workflow hydration was verified read-only with its default lock disabled.
- Added `UserResponsibilitiesPanel.tsx`/`userResponsibilities.css`, API/query helpers and panel integration. Current project stage, work stage/status, generated number, full blocker counts, missing contexts, Refresh and pagination are shown in compact rows. Project links use existing permission checks and a new tab to preserve the unsaved role.
- Native backend, project-stage and frontend implementers worked on their assigned non-overlapping files. The subsequent read-only integrity review found no confirmed defects in predicates, authorization, lineage, read-only behavior, paging or query isolation.

## Browser evidence

Used real application routes and the actual Manage user panel with synthetic fetch responses in a frontend-only fixture; no application backend or real account was used.

- Inspected screenshots at 1440, 768 and 390 px. Panel widths were 480, 480 and 390 px; no horizontal panel/page overflow. Fixed actions remained usable and long names wrapped.
- Accessibility scans reported zero violations at all three widths. Recorded application runtime errors were empty.
- Project links targeted the correct stable IDs with `_blank` and `noopener noreferrer`; generated project numbers and differing current stages were visible.
- A synthetic blocked save sent exactly one PATCH, retained the selected Procurement role and refreshed from 26 to 25 responsibilities/blockers. Page 2 showed the remaining five rows while preserving the full count. A failed refresh hid the stale list and showed retry; retry restored the first 20 rows.
- Keyboard Tab from the Role field reached Refresh assignments. Switching from the designer to a different user showed only that user's one North Residence responsibility and no prior Aurora rows.
- Screenshots: `/private/tmp/lisno-user-assignment-visibility/output/playwright/assignments-{1440,768,390}.png` and `assignments-blocked.png`. Temporary frontend/browser sessions were closed after verification. The initial fixture favicon 404 was fixed locally; development reloads required reopening the synthetic panel, with no product change.

## Final automated verification

The verification runner checked the integrated worktree after all writers and integrity review finished. **20 files / 515 tests passed**; all commands below exited 0.

From `backend/`:

```sh
npm test -- tests/user-administration.test.ts tests/user-responsibilities.test.ts tests/user-responsibilities-routes.test.ts tests/user-responsibilities-openapi.test.ts tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-routes.test.ts tests/project-status-user-responsibilities.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/super-admin-authorization.test.ts tests/api-docs.test.ts
npm test -- tests/user-administration-mongo.replica-set.test.ts tests/user-responsibilities-mongo.replica-set.test.ts tests/project-status-mongo.replica-set.test.ts
npm run typecheck
npm run build
```

Results: 12 focused files / 433 tests; 3 Mongo files / 27 tests; typecheck/build passed. Temporary replica sets were used, not the local/demo database. The complete selected Super Admin authorization suite passed. Early contract checks encountered sandbox test-port restrictions and an obsolete route-total assertion; the final tests ran with test-port permission and the corrected manifest count, all passing.

From `frontend/`:

```sh
npm test -- src/features/admin/UserResponsibilitiesPanel.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserDeletionDialog.test.tsx src/components/ui/ContextPanel.test.tsx
npm run typecheck
npm run build
```

Results: 5 files / 55 tests; typecheck/build passed. Existing Mongoose `new` option deprecation and Vite large-chunk warnings remain. No new dependency or lockfile changes.

Repository checks `git diff --check` and `git status --short` passed; pre-existing dirty work remains. Logs: `/private/tmp/lisno-user-assignment-visibility/final-*.log`; final status: `final-status.txt` in the same directory. Build outputs are ignored at `backend/dist` and `frontend/dist`.

Verification limits: browser checks used synthetic responses; a live application backend and real-user data were not exercised. No unrelated full suites, OCR checks or lint were run. No application backend, launcher, OCR, seed, migration, live reassignment, account access change, deletion, commit, push, deployment or communication was performed. The change provides visibility and existing authorized project navigation; actual reassignment remains in the existing workflows.

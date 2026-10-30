# Super Admin user deletion: task plan

Date: 2026-10-30
Status: Implemented; final local verification complete, handoff recorded
Specification: [Approved user deletion design](../specs/2026-10-30-super-admin-user-deletion-design.md)
Approval record: The user approved the specification and task plan, then selected A.
Execution mode: A; native parallel sub-agents with separate ownership
Classification: High-risk identity/access change

## Approved outcome and invariants

Add **Delete** directly to eligible Users rows, with an accessible confirmation. Logically delete active or inactive non-Super-Admin users, exclude them from current directory/account projections, revoke access, and preserve historical identities and work. Protect the sole Super Admin and enforce deletion on the backend. Email uniqueness and vendor membership remain reserved; deleting a login never deletes the Configuration vendor or business records.

The approved specification is the source of truth, including its exact deletion endpoint, success envelope, protected-target behavior, idempotent retries, and AC1–AC8. There is no permission to delete a real user or deploy this change.

## Planning evidence and existing work

- HEAD remains `73761538e1ca9cc34b70d768ec35f938ada7ae65`.
- Initial dirty paths: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`; the estimate-configuration workflow-panel-removal specification and plan; and this task's user-deletion specification. Preserve them. Relevant user-administration, authorization, repository, and dashboard targets currently have no diff.
- The existing administration mutation already coordinates authorization writes, uses expected user versions, revokes additive project grants, and audits changes transactionally.
- Authentication reads current stored active/session state. Both memory and Mongo repositories must implement the same deletion transition and preserve historical lookups.
- Permission vocabulary is mirrored in `frontend/src/api/authorization-contract.ts`. Contract tests pin the policy version and permission count, so update these expectations deliberately with the new operation.
- Current candidate lists commonly require `active: true`, which already excludes a correctly deleted account. Explicit deletion filtering is additionally needed for directory rows, all-status totals, and dashboard account/workforce reads that include inactive users. Do not blanket-filter historical joins.
- Existing query families include admin users, dashboard, access requests, vendor login access, invitations, execution, and project identity. `invalidateVendorAccess` already groups vendor-login, execution, and invitation invalidation; reuse it where applicable.
- Replica-set tests use `backend/tests/helpers/mongo-replica-set.ts`. Do not substitute non-transactional persistence if the local replica-set environment needs setup or permission.

## Execution and ownership rules

Keep one parent task in progress. For the parallel implementation task below, child slices may progress independently under that one parent.

If Mode A is selected, use native Codex agents for independent audits and writers with the ownership boundaries below. Every writer must be told that other agents share the worktree, must not revert others' edits, and must report necessary cross-boundary changes to the primary. In Mode B, the primary performs the same work sequentially without implementation subagents.

No subagents or product edits begin before the execution-choice gate. The primary owns product interpretation, contracts, integration, and these working documents. Shared files are written by one owner at a time; handoffs are explicit.

## Dependency-ordered tasks

### 1. Reconfirm baseline and classify consumers

Owner: Primary; read-only audits may be delegated in approved Mode A. Dependency: task-plan approval and execution choice. AC2–AC8.

- Recheck HEAD, dirty paths, and per-target diffs before writers begin; preserve the prior estimate-screen change.
- Audit the deletion route's authorization path, transaction coordination, user/grant writes, existing authentication invalidation, and invitation/vendor-bound identity checks.
- Build a concise consumer matrix: current directory/count/candidate reads versus historical ID/actor joins. Include dashboard clients/workforce, assignment candidates, vendor login/onboarding, and audit attribution. Mark already-safe active-only reads so they are not unnecessarily rewritten.
- Capture focused baseline results and any failures before edits. Use synthetic active staff, inactive vendor, client, and protected Super Admin identities with different responsibilities and grants. Do not use personal data from the screenshot.
- Freeze the exact shared contract and affected file ownership before parallel implementation. Escalate only a material scope conflict; routine integration choices stay within the approved spec.

### 2. Establish shared contracts and policy inventory

Owner: Primary. Dependency: task 1. AC3, AC4, AC6, AC8.

Owned paths: `backend/src/repositories/types.ts`, `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, `backend/src/domain/audit-actions.ts`, `backend/src/openapi.ts`, `frontend/src/api/types.ts`, `frontend/src/api/authorization-contract.ts`, and corresponding registry/OpenAPI/contract test fixtures. Establish the backend authorization policy version in `auth.service.ts` before handing that file to the backend owner.

- Define optional deletion metadata and the dedicated repository CAS deletion method. Retain legacy missing-field compatibility and stable-ID/email lookup semantics.
- Define request `{ version }` and response `{ userId, deletedAt, version }`, consistent with the approved spec and existing response envelopes. Keep internal metadata/credentials out of general public user contracts.
- Register Super-Admin-only `identity.users.delete`, `DELETE /admin/users/:userId`, and `user.deleted`; synchronize frontend vocabulary and policy version. Update route inventories, exact permission counts, and explicit OpenAPI request/response shapes.
- Publish the contract and file handoffs to all writers. Backend and frontend must not invent different deleted-target, retry, or conflict behaviors.

### 3. Implement independent slices

Dependency: task 2. This is one parent task, with the following independent slices in Mode A; run them sequentially in Mode B.

| Slice and owner | Exclusive file/subsystem ownership | Deliverable and acceptance criteria |
| --- | --- | --- |
| 3A. Backend implementer | `backend/src/models/User.ts`; `repositories/memory.ts`, `repositories/mongo.ts`; `services/user-administration.service.ts`, `services/auth.service.ts`; `routes/admin-users.ts`; administration/auth tests, including deletion and replica-set cases | Audited transactional logical deletion, directory filtering, sessions/grants revoked, protected identity, idempotency/CAS, no reactivation, memory/Mongo parity. AC2–AC6, AC8. |
| 3B. Frontend implementer | `frontend/src/features/admin/UserDirectoryPage.tsx`, `UserMutationDialog.tsx` only if needed for stale-target handling, `adminApi.ts`, focused new `UserDeletionDialog.tsx`, associated admin tests, and narrowly needed rules in `styles/access-administration.css` | Direct row action, accessible confirmation, robust pending/conflict/error/success states, cache reconciliation, preserved filters and valid pagination. AC1, AC2, AC7, AC8. |
| 3C. Projection implementer | `backend/src/repositories/super-admin-dashboard.ts`; `tests/super-admin-dashboard.test.ts`, `tests/super-admin-dashboard-mongo.replica-set.test.ts`; a focused deletion-projection test file if useful | Deleted accounts excluded from current account/workforce projections in memory/Mongo, with historical actor references and inactive-assignee risk preserved. AC2, AC5, AC8. |

Backend slice details:

- Add optional metadata and mapper support without changing unique email/vendor identity rules.
- Authorize before disclosing target details. Inside the coordinated transaction, revalidate actor and protected target, return an already-deleted result without writes, otherwise compare version and perform the transition.
- Atomically mark inactive/deleted, increment version and sessionVersion even for an inactive target, revoke grants, and append deletion plus grant audit events. Use the existing rollback semantics.
- Guard stale role/status mutations and authentication against deleted records. Retain historical ID/email/vendor-bound lookup behavior. Verify credential/profile mutation paths cannot reactivate an account; keep unrelated profile behavior unchanged.
- Add regression coverage for every role, protected/missing/malformed/stale targets, exact redacted response, repeat/concurrent deletion, retained work, email/vendor reservation, and rollback. Share any additional current-read consumer requiring edits with the primary.

Frontend slice details:

- Reuse existing Button/Dialog/feedback components and authenticated API client. No new dependencies or general directory redesign.
- Guard Delete by current authorization and target eligibility; never rely on the frontend for enforcement. Disable confirmation against stale, placeholder, failed, or refreshing data.
- Pin the version being confirmed. A conflict reloads details and requires a fresh confirmation, without automatically sending a newer version.
- Use Cancel as initial focus; prevent double-submit/close while pending; return focus to an appropriate remaining row/control after success or cancellation.
- On success, close all panels targeting the deleted ID. Remove the confirmed deleted row from cached directory pages and invalidate/refetch authoritative totals rather than guessing counts. If refresh fails, show truthful refresh failure separately from committed deletion success, and avoid presenting old metrics as current.
- Invalidate affected query families using existing key exports/helpers. Include admin users/dashboard and vendor-login/execution/invitation projections; include access/project candidate queries identified in task 1. Preserve server authorization boundaries and cache identity scopes.
- Handle deleting the last row on a page, an already-deleted target, row removal during a dialog, and both active/inactive users.

The primary may implement narrowly identified additional consumer fixes after auditing ownership. Any edits in shared contracts return to the primary; any change to approved product behavior returns to specification review before proceeding.

### 4. Integrate and close boundary gaps

Owner: Primary. Dependency: all task 3 writers finished. AC1–AC8.

- Reconcile final diffs and contracts; confirm no unrelated edits or lockfile changes.
- Resolve the consumer matrix. Verify current candidates exclude deleted accounts while historical names, audits, assignments, vendor records, bids/orders, and approvals retain their stable links.
- Add/extend invitation and vendor-access/onboarding regression tests using the primary's exclusive ownership of those test files after writers finish. Confirm deletion cannot cause a replacement login or email to be created automatically and does not send mail.
- Confirm deletion-vs-grant creation and deletion-vs-reactivation races serialize correctly. Missing-field legacy users and malformed active-plus-deleted fixtures must not authenticate.
- Finish focused type/test checks to resolve integration errors before review. Do not weaken assertions to accommodate unrelated existing failures.

### 5. Integrity review

Owner: `integrity_reviewer` in Mode A; primary inline in Mode B. Dependency: task 4 complete; no concurrent source writers. AC2–AC8.

Read-only review of authorization/non-disclosure, protected Super Admin, persistence/rollback, race behavior, historical attribution, reserved email/vendor membership, all relevant read filters, frontend stale-version handling, and cache reconciliation. Inspect explicit absence of production/file/email effects. The primary resolves confirmed findings, then requests a focused re-review of changed areas.

### 6. Final integrated verification

Owner: `verification_runner` in Mode A, plus primary browser QA; primary sequentially in Mode B. Dependency: integrity findings resolved and writers stopped. AC1–AC8.

Run the focused command sets below, then typecheck/build and shared-boundary checks. Earlier concurrent checks do not replace final verification of the integrated tree. Broaden only for newly affected consumers or unresolved findings. Report any baseline failures with evidence from the original source using an isolated checkout or in-memory baseline; never revert shared files to measure a baseline.

### 7. Handoff

Owner: Primary. Dependency: task 6 results reconciled.

Record actual changed files, test results, screenshots and temporary artifact paths, remaining limitations, and consumer matrix conclusions in this plan. Update specification status after execution when document editing is in scope. State that no real account deletion, migration, deployment, commit, push, or external communication occurred. Do not claim completion if required identity/transaction verification remains unresolved.

## Verification commands and scenarios

From `backend/`, focused administration and security checks:

```sh
npm test -- tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/auth.test.ts tests/auth-authorization.test.ts tests/access-requests.test.ts
npm test -- tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts tests/server.test.ts
```

Current projections and retained identity/vendor boundaries:

```sh
npm test -- tests/super-admin-dashboard.test.ts tests/super-admin-dashboard-mongo.replica-set.test.ts tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts
npm test -- tests/procurement-vendor-access.test.ts tests/procurement-vendor-access.replica-set.test.ts tests/vendor-work-onboarding.test.ts tests/vendor-work-onboarding.replica-set.test.ts
npm run typecheck
npm run build
```

Run any new focused test files added by the slices as well; record their final paths. Existing role/status/admin tests must stay intact. Expand to the specific assignment, chat/auth streaming, profile, or execution suites only if the consumer audit or implementation changes those boundaries. A full backend suite is not required by default once these risk-selected suites pass; document the unrun suite and any discovered gaps.

From `frontend/`:

```sh
npm test -- src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDeletionDialog.test.tsx src/api/authorization-contract.test.ts src/auth/authorization.test.ts src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx
npm run typecheck
npm run build
```

The new deletion-dialog test file is created during implementation. Add focused API/cache tests where they provide distinct failure coverage. No repository lint script exists.

Browser checks at 1440px and 390px use synthetic local accounts and include: active/inactive rows; protected row; correct identity and Cancel focus; cancellation; successful deletion; keyboard tab/escape/focus return; pending double-click protection; stale-version refresh/reconfirmation; failed delete versus committed delete with refresh failure; filtered results and last-row pagination. Inspect console/network errors, responsive actions, and screenshots. Stop task-owned preview servers afterward.

Replica-set race scenarios: two deletes; delete versus role/status update; delete versus reactivation; delete versus approval of a pending project access grant; audit persistence failure. Verify final stored user/session versions, no eligible active grants, exactly one deletion audit event, unchanged unrelated identities/business records, and no partial writes on failure.

From the repository root:

```sh
git diff --check
git status --short
```

## Execution record

- Tasks 1–7 completed in approved Mode A: baseline and independent consumer audits, shared contracts, separate backend/frontend/dashboard writers, primary boundary integration, read-only integrity review, final integrated verification, and handoff.
- Baseline frontend directory/management tests: 19 passed. Baseline backend selected suites: 302 passed, one administration test failed when a forbidden-route request received an unexpected external-shaped 401 response. Log: `/tmp/lisno-user-deletion-backend-baseline.log`. The initial sandbox run could not open local sockets; the rerun used the required escalation.
- Audit confirmed retained historical ID/email/vendor-bound lookups must remain intact. Current candidate reads mostly already require active users. Dashboard current-client totals need deletion exclusion while historical project-client links and creation event series must remain intact.
- Audit identified a delayed profile-photo write race. Memory and Mongo repository setters now reject deleted targets. Primary integration added deletion-specific photo upload compensation, password-reset race, vendor onboarding/reservation, and authenticated chat-stream regression coverage. This preserves the approved no-account-edits behavior without changing the product scope.


### Final implementation and consumer reconciliation

- **Identity and persistence:** `models/User.ts`, `repositories/types.ts`, `memory.ts`, `mongo.ts`, `services/user-administration.service.ts`, `auth.service.ts`, and `routes/admin-users.ts` implement optional deletion metadata, strict versioned deletion, transactional grant/audit writes, session invalidation, protected targets, idempotent retries, and deleted-account write guards. Historical lookup and uniqueness semantics remain intact.
- **Policy and contracts:** backend authorization/route/audit registries, OpenAPI, and frontend API/authorization contracts include the new operation. Policy version is `2026-10-30.user-deletion.v1`. Registry, API documentation, permission, and mirrored-contract fixtures are synchronized.
- **Directory UI:** `UserDirectoryPage.tsx`, `adminApi.ts`, and new `UserDeletionDialog.tsx` add the direct action and accessible confirmation, fresh-version review, pending safeguards, truthful committed-delete/refresh failure handling, relevant cache invalidation, filter preservation, and page recovery. Existing shared components/styles are reused. No dependency or lockfile changes.
- **Current reads:** directory pages/summaries and dashboard account/workforce queries exclude deleted accounts. Existing active-only assignment and identity-candidate reads already exclude the deletion transition. Inactive or unavailable-assignee risk remains visible for retained work, including defensive malformed active-plus-deleted fixtures.
- **Historical and reserved identity:** stable ID/email/vendor-bound lookups, project-client links, existing work, approvals/audits, vendor records/orders, and account-creation event history are retained. Deleted emails remain reserved. Vendor onboarding cannot create a replacement or send an invitation for the deleted identity.
- **Integrity review:** independent read-only review found no blocking authorization, transactional, lineage, race, cache, or UX defect. Final product sources were unchanged after review; one additional chat-stream regression was added and passed.
- The pre-existing `LeadEstimateWorkspace.tsx` diff and previous estimate-configuration specification/plan were preserved unchanged. No unrelated file was staged or rewritten.

### Final verification evidence

Backend selected regression batch, from `backend/`:

```sh
npm test -- --maxWorkers=4 tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/auth.test.ts tests/auth-authorization.test.ts tests/access-requests.test.ts tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts tests/server.test.ts tests/super-admin-dashboard.test.ts tests/super-admin-dashboard-mongo.replica-set.test.ts tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/procurement-vendor-access.test.ts tests/procurement-vendor-access.replica-set.test.ts tests/vendor-work-onboarding.test.ts tests/vendor-work-onboarding.replica-set.test.ts tests/password-reset.test.ts tests/password-reset-mongo.replica-set.test.ts tests/profile-photo.test.ts tests/profile-photo-mongo.replica-set.test.ts tests/project-chat-stream.test.ts
npm test -- --maxWorkers=1 tests/super-admin-dashboard-mongo.replica-set.test.ts
npm run typecheck
npm run build
```

- Broad batch: 24 files, 828 passed / 3 failed (831 total), exit 1. One dashboard Mongo case hit its 5-second timeout; two later assertions in that same file failed. The identical dashboard suite passed all 43 tests when rerun alone, exit 0. All 831 selected tests therefore have a passing result across the batch and isolated rerun. Resource contention and work continuing after timeout are plausible explanations, not a proven root cause; the combined run was not clean.
- Both backend typecheck and build passed, exit 0. Earlier integrated contract/identity-boundary batch passed 277 tests in 10 files; the dedicated chat stream suite passed 5 tests. These overlap with final coverage and are not added to the unique count.
- Final frontend command is the six-file command listed above: 105 tests passed, exit 0. Frontend typecheck and production build passed, exit 0.
- Backend tests include real local Mongo replica-set races and transaction rollback. Local socket access used the approved test-command escalation; no production data or external service was involved.
- Browser: actual directory, dialog, auth/query/feedback components rendered in an isolated Vite fixture with synthetic API responses. Eight scenarios passed at each of 1440px and 390px (16 total): normal active/inactive deletion and cancellation, conflict/reconfirmation, failed deletion/retry, committed deletion with failed refresh, last-page recovery, pending safeguards, preserved filters, and permission-hidden actions. Verified correct identity, protected row, initial Cancel focus, keyboard navigation/Escape/focus return, current totals, and no document overflow. Console/runtime error and failed-request arrays were empty. Desktop/mobile directory and confirmation screenshots were visually inspected. Additional mobile checks confirmed focus stays inside the pending dialog for forward/reverse Tab and a disabled click cannot send a duplicate request. Mobile actions remain reachable within the existing horizontally scrolling table.
- Browser QA does not replace deployed end-to-end verification: the fixture uses actual frontend code with synthetic responses; backend behavior is independently covered by HTTP/service and replica-set tests.
- Final `git diff --check` passed. No repository lint script exists.

### Artifacts, limitations, and operations

- Final logs: `/tmp/lisno-user-deletion-final-backend.log`, `/tmp/lisno-user-deletion-final-dashboard-isolated.log`, `/tmp/lisno-user-deletion-final-backend-typecheck.log`, `/tmp/lisno-user-deletion-final-backend-build.log`, `/tmp/lisno-user-deletion-final-frontend.log`, `/tmp/lisno-user-deletion-final-frontend-typecheck.log`, `/tmp/lisno-user-deletion-final-frontend-build.log`.
- Browser fixture, runner, result JSON and screenshots: `/tmp/lisno-user-deletion-qa/`. They contain synthetic identities only and are outside tracked repository sources. The task-owned browser and preview server were closed after QA. Build outputs are ignored in `backend/dist/` and `frontend/dist/`; frontend incremental files are under `node_modules/.tmp/`.
- Warnings: backend tests emit Mongoose's deprecated `new` option warning. Frontend build reports chunks over 500 kB (main JavaScript 3,081.31 kB; gzip 846.59 kB). Neither warning fails its command; bundle optimization is outside this bounded identity change.
- Full backend/frontend suites were not run beyond the approved risk-selected coverage. OCR is unchanged; its tests were not run. No migration/backfill is needed for optional deletion fields, so no migration dry run or execution was performed.
- No real account deletion, seed, production mutation, deployment, commit, push, external communication, dependency installation, or lockfile change occurred. Backend support must be deployed before exposing the new frontend operation. Logical deletion preserves historical identity and does not free email/vendor bindings or add restore support.


## Follow-up: missing Delete in the running app

- User reported no Delete in Manage and supplied a list-row screenshot without Delete. Continued under the existing approved Mode A scope as a visibility/discoverability correction; no security or persistence expansion.
- Evidence: actual local backend at port 3000 returned OpenAPI user routes GET and PATCH only, with no deletion schema. Frontend source already contains the Delete action, gated by the new server permission. The running supervisor uses `node ../scripts/local-chat.mjs --with-ocr` and source entrypoints without watch. AuthProvider retains its authorization snapshot until restore/login/page reload.
- Ownership: primary handles runtime diagnosis, controlled local restart, documents, and browser checks. `manage_delete_entry` owns the two admin UI components and focused deletion tests. `delete_visibility_audit` performs independent read-only review. `user_delete_final_verification` runs final frontend verification after writers stop.
- `UserMutationDialog.tsx` now exposes Delete user via a permission-gated parent callback, retaining Activate/Deactivate. `UserDirectoryPage.tsx` replaces Manage with the existing confirmation, avoiding duplicate API/cache logic. Pending mutations, unresolved conflicts, stale/refreshing data, version mismatch, and unsaved role edits block entry. Cancellation restores the surviving Manage row; success uses the existing search fallback.
- Independent review found no blockers. Final follow-up verification: `npm test -- src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDeletionDialog.test.tsx` passed 38 tests in three files; `npm run typecheck`, `npm run build`, and `git diff --check` passed. Logs: `/tmp/lisno-user-delete-manage-final-tests.log`, `-typecheck.log`, and `-build.log`. Build still reports the >500 kB chunk warning. Backend source was unchanged during this follow-up, so its suites were not repeated.
- Runtime resolution: gracefully stopped the identified existing local supervisor and restarted the same `npm run dev` configuration (backend, local chat, and OCR). No seed or account provisioning was run. Read-only `/openapi.json` changed from PATCH-only to PATCH + DELETE for `/admin/users/{userId}`, with operation `deleteAdminUsersUserId`. The frontend server at port 5173 serves the Delete permission branch, shared confirmation, and Manage callback. The development services remain running for the user; the temporary synthetic preview server was stopped.
- Runtime artifacts: before/after API inventories `/tmp/lisno-delete-running-openapi.json` and `/tmp/lisno-delete-running-openapi-after.json`; served UI source `/tmp/lisno-delete-served-directory.js`. Local service output is redirected to `/tmp/lisno-user-deletion-local-runtime.log` and was not echoed into chat.
- Follow-up browser verification used only synthetic fixture identities. Desktop inspection confirmed list-row Delete plus Manage's Activate and Delete controls; mobile 390×844 inspection confirmed Deactivate and Delete coexist without overflow. Both Manage paths opened the existing confirmation with initial Cancel focus. Cancellation returned to the appropriate Manage row; the existing deactivation confirmation and cancellation also worked. Browser warning/error log was empty. Temporary viewport was reset and the QA tab closed. No account was deleted through the browser.
- The user's open app session itself was not available through the connected Chrome tab inventory. A full page refresh is needed to fetch the updated authorization snapshot. No role-only permission bypass or automatic grant was added. No production deployment, data migration, real user deletion, commit, or push occurred.

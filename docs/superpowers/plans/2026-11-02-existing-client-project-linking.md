# Existing client project linking: task plan

Status: complete. Code implemented and verified; the user explicitly requested account-wide mapping, and all three historical local project links were repaired and verified. The client's list now returns all eight projects.

Approved specification: [Existing clients join new projects automatically](../specs/2026-11-02-existing-client-project-linking-design.md).

## Execution record

- Task 1 complete: contract settled, pre-implementation dirty paths and target diffs captured in `/tmp/lisno-existing-client-link-baseline/`.
- Tasks 2–4 implemented: backend automatic linking and summary, frontend feedback/status, API documentation, and focused repair CLI/core/tests. The primary agent delegated repair preparation to a separate bounded writer owning only the new script, repair tests, and focused `backend/src/operations/existing-client-project-link-repair.ts`; primary retains contract/docs integration and live dry-run responsibility.
- Task 5 complete: integrated integrity review and final verification passed. Review found and resolved a historical-summary edge case: an accepted invitation now retains its history after client deactivation/deletion, without granting access. Accepted UI copy describes history instead of claiming current permission. All implementation writers have stopped.
- Read-only local Client 1 dry run succeeded: one eligible project, one matching eligible account, one pending failed invitation; result `ready`, `writes: 0`, `projectsToLink: 1`, `invitationsToRevoke: 1`. Protected target/result files are under `/tmp/lisno-existing-client-link-baseline/`; no identifiers or email addresses are published here.
- Task 6 complete after the user's explicit instruction to map all projects to the existing client account. The three exact unlinked targets, including Client 1, were corrected. No emails were sent.

### Account-wide visibility follow-up

The user subsequently identified the client account and reported that not all projects appeared. A read-only check found one active standard Client account and eight exact-email projects: five already linked to that account, three unlinked, and none linked to a different account. All eight have existing project/Lead records. The unlinked projects use workflow versions 2, 2, and 3; each has a pending invitation (one sent, two failed). The previously checked Client 1 project is among the three.

The existing repair utility passed a separate read-only dry run for each of the three exact project/account/invitation targets: three ready, zero conflicts, zero writes. Protected stable IDs and expected versions are in `/tmp/lisno-existing-client-link-baseline/client-account-repair-targets.json`; the client email and project identifiers are intentionally omitted from this document.

An independent read-only code audit confirmed that client project lists use stable `clientId` ownership and have no status, approval, invitation, or workflow-version filter. Frontend pagination retrieves all pages. After an authorized repair, the client must reload the dashboard because window-focus refetch is disabled.

No further product code change was needed. The user explicitly instructed mapping all projects for this existing client. Final dry runs passed for the three saved targets before applying the scoped repair. Each transaction linked only its target project, revoked the obsolete invitation token, and appended two audit events. No new invitations or emails were created, and the original five project links were outside the write scope.

Post-apply verification passed: the registered client-summary service returns all eight projects; the intended client can open the three newly linked project details; a different active Client cannot list or open them. All three old invitation tokens are revoked, delivery history is preserved, and six repair audit events exist. Read-only repeated repair checks return `already_linked` for all three. Before/after digests match for all associated Leads, estimates, estimate review rounds, and stored quotation rendition records.

Protected backups and receipts are stored in `/tmp/lisno-existing-client-link-baseline/applied-2026-11-02T17-53-17-026Z/` (directory mode 0700, backup files mode 0600). The final result is recorded in that directory's `verification.json` and `/tmp/lisno-existing-client-link-baseline/latest-account-repair-result.json`. Initial verification calls lacked or misspelled the registered operation context; these read-only checks were corrected and rerun successfully without repeating the mutations. No rollback was needed. Refresh the existing client dashboard to fetch the repaired list.

### Final verification evidence

- Backend focused command listed in task 5, run with `MONGOMS_RUNTIME_DOWNLOAD=false`: **217/217 tests passed across 6 files**. All **62 replica-set tests** ran, without skips.
- Frontend focused command listed in task 5: **53/53 tests passed across 3 files**, including rendered interaction and axe accessibility checks. Axe contrast checking is excluded under JSDOM because it lacks layout/canvas; no browser visual QA is claimed.
- Backend and frontend `npm run typecheck` and `npm run build`: all passed (exit 0).
- Supplementary repair script/test compilation from `backend/` passed: `./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --strict --skipLibCheck scripts/repair-existing-client-project-link.ts tests/existing-client-project-link-repair.replica-set.test.ts`.
- `git diff --check` and final status inspection passed. No dependencies or lockfiles changed for this task.
- Backend test listeners initially required sandbox escalation; the isolated replica-set rerun passed. An ambiguous frontend test selector was scoped to the Client invitation region and its full focused suite rerun successfully.
- Non-blocking warnings: Mongoose's deprecated `new` option and Vite chunks above 500 kB (main JS 3,151.90 kB). Bundle optimization was outside this task's scope.
- Logs: `/tmp/lisno-existing-client-link-baseline/verification-*`. Standard ignored build outputs: `backend/dist/` and `frontend/dist/`. Protected target/dry-run files remain under the same temporary baseline directory for the pending repair.
- Full repository suites, browser visual testing, live rollback, deployment, real emails, and backend restart were not performed. The scoped live local repair was subsequently authorized, completed, and verified as recorded above. The user controls the backend process and must restart it to load source changes if it has not already been restarted; the repaired project links take effect on a fresh client read without requiring a restart.

## Execution boundaries

Preserve the dirty worktree and `/tmp/lisno-existing-client-link-baseline/` evidence. Before changing each target, reconcile its current diff with that baseline. No staging, commits, deployment, account creation in the live database, or real email sends. Keep one parent task in progress and record verification against the integrated changes.

This plan supports either execution mode. In Mode A, use native subagents only for the independent ownership areas below; tell each writer they share the worktree and must preserve others' edits. In Mode B, the primary agent performs the same steps sequentially. The execution choice follows task-plan approval.

## 1. Settle the contract and capture focused baselines

Owner: primary agent. Dependencies: none.

- Confirm the existing `coordinateAuthorizationMutation` and `coordinateClientEmail` transaction boundaries, eligible standard Client checks, and initiation idempotency receipts.
- Fix the shared response contract before parallel work: add `linked` only to the invitation summary status union; persisted invitation statuses remain unchanged. A linked project has no invitation actions. An actually accepted invitation retains its `accepted` status and historical timestamps when consistent with the project's owner.
- A linked summary must come from persisted project ownership, never a frontend email inference. Send/resend must short-circuit for a linked project before mail availability checks or token creation. Existing unlinked invitations retain their established acceptance behavior.
- Inspect the relevant tests and current fixture assumptions before adjusting them. Do not change generic client-read authorization or add writes to reads/login.

Acceptance: specification requirements 1–7 have one agreed contract; dirty targets and responsibility boundaries are understood.

## 2. Implement automatic linking and backend regressions

Owner: backend implementer, or primary agent in Mode B. Dependency: task 1.

Owned paths:

- `backend/src/services/admin-project.service.ts`
- `backend/src/services/project-client-invitation.service.ts`
- `backend/src/domain/project-client-invitations.ts`
- `backend/tests/admin-projects.test.ts`
- `backend/tests/admin-projects-mongo.replica-set.test.ts`
- `backend/tests/project-client-invitations.test.ts`
- `backend/tests/project-client-invitations-mongo.replica-set.test.ts`

Work:

- Resolve an eligible existing Client inside initiation's transaction and persist its stable account ID on the new project. Audit `client_project_linked` using the initiating staff actor.
- Reject inactive/deleted, internal-role, and restricted demo identities with appropriate field errors and no partial writes. Preserve normalized-email coordination and idempotency.
- Skip invitation generation and delivery for linked projects, including idempotent initiation retries and disabled/failing SMTP. Keep first-time invitation registration unchanged.
- Derive `linked` summaries from project state without inventing acceptance records. Ensure linked projects cannot issue or rotate invitation tokens through stale send/resend requests.
- Cover two unequal Client accounts, correct list/detail visibility, unauthorized reads, email normalization, absent accounts, all ineligible-account cases, disabled/failed mail, repeated initiation, and transaction races. Assert audit and invitation counts, not only response statuses.

No repository-contract or authorization-policy expansion is expected. Escalate any necessary shared-file change to the primary agent before writing it.

Acceptance: automatic owner-only access; zero invitation side effects for existing clients; first-time acceptance preserved; retries and concurrent operations remain safe.

## 3. Implement linked-client presentation and frontend regressions

Owner: frontend implementer, or primary agent in Mode B. Dependency: task 1; may run in parallel with task 2 after the contract is fixed.

Owned paths:

- `frontend/src/auth/projectClientInvitationsApi.ts`
- `frontend/src/features/admin/ProjectClientInvitationStatus.tsx`
- `frontend/src/features/admin/ProjectClientInvitationStatus.test.tsx`
- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx`
- `frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx`

Work:

- Add the `linked` response type and render “Client already linked” without invitation actions or SMTP-unavailable warnings.
- Give successful initiation clear feedback that the existing client already has access. Preserve first-time invitation feedback, accepted invitation history, and transient error/retry behavior.
- Preserve the current design and accessible status announcements. Test rendered linked, accepted, failed, disabled-mail, and new-client states; verify stale UI cannot expose a send action for linked state.
- Retain existing query invalidation and seed the invitation summary cache from initiation's authoritative response. Any additional shared API types must be coordinated with the primary agent.

Acceptance: the client-access status is truthful and existing clients are never prompted to join again.

## 4. Integrate API documentation and prepare the Client 1 repair

Owner: primary agent. Dependencies: settled contract; repair preparation may overlap tasks 2–3 without editing their owned paths.

Owned paths:

- `backend/src/openapi/estimate-collaboration.ts`
- Any necessary shared API type integration outside the writers' owned paths
- Proposed bounded repair utility: `backend/scripts/repair-existing-client-project-link.ts`
- Proposed isolated repair tests: `backend/tests/existing-client-project-link-repair.replica-set.test.ts`
- This task-plan file and final verification record

Work:

- Add `linked` to the documented invitation summary and verify API schema tests.
- Prepare a local-only repair with explicit project, client, and authorized actor IDs. Default to dry run; require explicit apply mode and expected project/invitation state. Never resolve a write target by name alone or silently broaden its scope.
- In a transaction, revalidate the exact account/project/email relationship, link the project, revoke the pending invitation and clear its token hash, and append the established audit events. Preserve delivery history and all estimate/artifact data. Repeated application must be a no-op when already correct; competing state must cause a conflict.
- Prepare a protected before-state backup and a documented rollback procedure. Refuse rollback after subsequent client activity; never reinstate a usable old token.
- Test dry-run no-writes, successful repair, wrong account, conflicting ownership, changed invitation version, idempotent reapplication, rollback guards, and untouched estimate/approval records against an isolated replica set.
- Run a read-only dry run for the uniquely identified local Client 1 target and retain only redacted evidence in the handoff. Do not execute the live repair until its exact target, backup, dry-run result, and rollback are reviewable and the user authorizes that data change separately.

Acceptance: synchronized API contract and a safe, reviewable correction for the reported existing project. No live data mutation is implied by implementation approval.

## 5. Review and verify the integrated result

Owner: primary agent. Dependencies: all writers finished.

In Mode A, run `integrity_reviewer` first, resolve confirmed issues, then run `verification_runner`. In Mode B, perform those reviews sequentially in the primary thread. Review ownership enforcement, transaction races, invitation token invalidation, audit attribution, idempotency, historical preservation, and the repair's scope/rollback.

Focused verification:

```sh
cd backend
npm test -- tests/admin-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/project-client-invitations.test.ts tests/project-client-invitations-mongo.replica-set.test.ts tests/existing-client-project-link-repair.replica-set.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

```sh
cd frontend
npm test -- src/features/admin/ProjectClientInvitationStatus.test.tsx src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/client/ClientDashboard.test.tsx
npm run typecheck
npm run build
```

Run the repository's replica-set lane as required by its test configuration; do not count skipped integration tests as passing. Add existing authorization/route-registry regressions if any shared authorization or route files change. Run `git diff --check` and inspect the final scoped diff and status. There is no lint script, so do not claim lint validation.

Perform rendered interaction/accessibility checks for the changed status and initiation feedback with synthetic fixtures. Do not send real emails for verification. Respect the user's preference to manage the running backend manually.

Acceptance: all applicable specification criteria have exact evidence; unrun checks and remaining limitations are explicitly reported.

## 6. Authorize and verify the existing local project correction

Owner: primary agent. Dependencies: task 5 and explicit authorization for the exact local data repair.

Before applying, repeat the dry run and capture the protected backup. Apply only the approved Client 1 repair, then confirm the intended Client sees the project and another Client does not. Verify invitation token revocation and unchanged estimate/review/PDF records. If authorization is not yet granted, hand over the prepared dry-run evidence and state clearly that Client 1's existing project still awaits the data correction.

Do not restart the user's backend without their direction. Report whether the code change requires a manual restart to become active.

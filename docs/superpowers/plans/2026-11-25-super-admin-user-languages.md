# User languages implementation plan

Date: 2026-11-25

Approved specification: [User known languages and preferred language](../specs/2026-11-25-super-admin-user-languages-design.md). The user approved this specification in the current conversation.

Plan status: Completed and verified in approved Mode A. Baseline and verification evidence captured under `/private/tmp/lisno-user-languages-20261125/`; existing Location work preserved.

## Contract and boundaries

- Reuse the existing 23-language catalog and `ProjectLanguageMultiSelect`. Preferred language remains independent of known languages.
- Persist `languagesKnown: ProjectLanguage[]` and `preferredLanguage: ProjectLanguage | null` on users and invitations. Missing historical fields read as `[]` and `null`.
- Invitation creation accepts the fields optionally. The new user-update branch requires `{ version, languagesKnown, preferredLanguage }`, with both language fields present and no role, active, or Location fields.
- Reject unsupported/duplicate values and invalid types with field errors. Store known languages in catalog order; reordered equivalent values are a no-op.
- Add the controls to Invite user and Manage user, with **Save languages** in Manage user. Show saved values in Details, preserving the compact directory table.
- Language changes are profile-only: advance the raw CAS version and profile offset once without revoking sessions, grants, invitations, or password resets. Preserve the sole Super Admin restriction.
- Audit `user.languages_updated`, redacting its private values from non-Super-Admin readers. Do not add the metadata to public/authentication projections or email content.
- Preserve all uncommitted Location work. No new dependencies, migrations, seeds, commits, deployments, or real emails.

## Ownership and execution

The primary agent owns contract interpretation, shared files, documentation, integration, and the final result. Keep only one parent implementation task in progress.

In Mode A, use one backend implementer and one frontend implementer after the baseline check. They may work concurrently within the boundaries below. Tell both writers they share the worktree, must preserve existing changes, and must report any cross-boundary dependency before changing it. Do not assign overlapping files to another writer.

In Mode B, the primary agent performs the same tasks inline without subagents.

### 1. Record baseline and confirm the approved contract

Owner: Primary agent. Dependencies: Plan approval and execution-mode selection. Acceptance criteria: safeguards for all criteria.

- Capture current dirty paths and the relevant existing diffs before writers start, including untracked Location implementation files. Treat them as the baseline, not changes to undo.
- Confirm HTTP and direct-service validation, explicit repository mappings, administrative projections, and the existing profile-version behavior against the approved contract.
- Keep the existing catalog and its shared re-export unchanged unless a concrete integration need is identified. Any shared-file change belongs to the primary agent.
- Share exact field names, defaults, patch shape, normalization, and privacy boundaries with both writers.

### 2. Implement persistence, API validation, and profile updates

Owner: Backend implementer in Mode A; primary agent in Mode B. Depends on Task 1. Covers specification criteria 1–5 and 8.

Owned areas:

- `backend/src/domain/user-languages.ts` (new validation/normalization helper), `domain/audit-actions.ts`.
- `backend/src/models/User.ts`, `UserInvitation.ts`.
- `backend/src/repositories/types.ts`, `memory.ts`, `mongo.ts`.
- `backend/src/routes/admin-users.ts`, `user-invitations.ts`.
- `backend/src/services/user-administration.service.ts`, `user-invitation.service.ts`, `audit.service.ts`.
- `backend/src/openapi.ts` and relevant backend regression tests. No frontend, shared, or documentation edits.

Work:

- Extend types, strict route schemas, service validation, model validation, create/update/read mappings, and OpenAPI together. Ensure malformed language fields yield useful field-level errors.
- Persist invitation languages and copy them on acceptance. Preserve resend data, optional inputs, automated invitations, and mail preflight behavior.
- Implement atomic versioned language updates, clear operations, historical defaults, set normalization, and true no-op detection in memory and Mongo.
- Extend existing profile-only change detection without weakening CAS or authorization-version checks. Do not change access behavior or the private authorization-version helper unnecessarily.
- Append the private audit event in the transaction; redact language values from non-Super-Admin audit reads.
- Cover unsupported/duplicate values, independent preference, add/edit/clear, invitation acceptance/resend, old records/callers, stale/concurrent updates, immutable/deleted targets, authorization preservation, audit privacy, and public DTO exclusion.
- Use isolated replica-set databases for transactional tests. Update intentional exact-field DTO assertions without weakening privacy checks.

### 3. Implement the Users forms and saved-value display

Owner: Frontend implementer in Mode A; primary agent in Mode B. Depends on Task 1; can run in parallel with Task 2 against the agreed contract. Covers criteria 1–3, 6–8.

Owned areas:

- `frontend/src/api/types.ts`.
- `frontend/src/features/admin/InviteUserDialog.tsx`, `UserMutationDialog.tsx`, `UserDirectoryPage.tsx`, `userInvitationsApi.ts`.
- A small user-language form helper if needed, existing selection-control files only if required for reuse/accessibility, scoped administration CSS, and associated frontend tests/fixtures.
- No backend, shared, or documentation edits. Reuse the existing API client and language catalog.

Work:

- Align API types and explicit invitation serialization with the backend contract; do not accidentally drop either field.
- Add known-language multi-selection and an optional preferred-language dropdown to Invite user and Manage user. Keep preferred language independent and support clearing both.
- Add **Save languages**, prefill existing selections, normalize set comparison, and include language edits in cancellation/unsaved-change guards.
- Keep Location, role, active status, and delete actions usable. Prevent silent loss of edits and mutually blocked save states; provide a clear way to save or discard the current edit.
- Preserve entries on ordinary failures, show/focus field errors, handle stale-version refresh visibly, and invalidate affected user/invitation/dashboard queries as appropriate.
- Display saved values and empty-state text in Details. Wrap long selections within desktop/mobile panels.
- Add rendered interaction tests for invite payloads, existing-user saves, clear/reopen, independent preference, no-op ordering, errors, stale data, keyboard use, and coexistence with Location/access changes. If the shared selection control changes, rerun its project-form consumers.

### 4. Integrate and review correctness

Owner: Primary agent plus `integrity_reviewer` in Mode A; primary agent inline in Mode B. Depends on both writers finishing. Covers criteria 1–6 and 8.

- Inspect the integrated feature diff against the recorded baseline and reconcile frontend/backend shapes.
- Trace one invitation through create, resend, accept, and directory read; trace one existing-user update through CAS, audit, and refetch.
- Review authorization-version preservation, transaction atomicity, private audit projections, and non-disclosure through public DTOs using distinct test identities.
- Confirm existing Location changes and project language behavior remain intact. Resolve findings before final verification; keep fixes within the assigned ownership boundaries.

### 5. Verify the integrated result and local runtime

Owner: `verification_runner` after review/fixes in Mode A, with browser/runtime checks owned by the primary agent; primary agent inline in Mode B. Depends on Task 4. Covers all acceptance criteria.

Run focused tests first, then both typechecks/builds. Record exact commands, counts, and failures in this plan during execution. Avoid repeating passed checks unless changes or unresolved risks justify it.

Backend core, from `backend/`:

```sh
npm test -- tests/user-languages.test.ts tests/user-location.test.ts tests/user-administration.test.ts tests/user-invitations.test.ts tests/user-invitation-repository.test.ts tests/user-invitation-models.test.ts tests/user-administration-mongo.replica-set.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/audit-security.test.ts
npm run typecheck
npm run build
```

Because profile-only repository writes participate in authorization fences, also verify affected session, permission, password-reset, and invitation-authority paths using the existing `auth-session-revocation`, `super-admin-authorization`, `authorization-policy`, `password-reset`, `password-reset-mongo.replica-set`, `procurement-vendor-access`, `procurement-vendor-access.replica-set`, `project-client-invitations`, and `project-client-invitations-mongo.replica-set` test files. Keep broader testing proportional to the actual changes. Validate the new OpenAPI shapes directly; report unrelated existing API-doc failures separately if reproduced.

Frontend, from `frontend/`:

```sh
npm test -- src/features/admin/UserInvitationDialogs.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/userInvitationsApi.test.ts src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserDeletionDialog.test.tsx src/features/admin/ProjectLanguageMultiSelect.test.tsx
npm run typecheck
npm run build
```

- If the shared language selector is edited, also run `AdminProjectInitiationDialog.test.tsx` and the relevant accessibility checks.
- After source writers finish, use synthetic browser fixtures at desktop and mobile widths. Check invite/edit/clear/reopen, keyboard focus, long selections, request failure, stale-save handling, overflow, accessibility, and console/network errors. Do not send real invitations or edit real accounts for QA.
- Inspect the established loopback development service. If it still serves the old contract, restart its existing non-seeding launcher and confirm health and the language schemas before reporting readiness. Do not use demo bootstrap, seed, or production commands.
- Run `git diff --check` and `git status --short`; verify there are no unintended lockfile/dependency or unrelated changes. Check whitespace for new untracked source files as well.
- No lint script exists; do not claim lint passed. Full repository/OCR suites are unnecessary unless an unexpected dependency is touched.
- Keep temporary logs/screenshots in ignored output or a task-specific temporary directory. Report artifact paths and remove unnecessary test runtime processes.

### 6. Record the result and hand off

Owner: Primary agent. Depends on Task 5.

- Record completed acceptance criteria, exact verification evidence, changed files, existing failures, and unrun checks in this plan.
- Report the user-visible behavior concisely, including frontend/backend persistence and any material limitation.
- Explicitly distinguish local readiness from deployment. No migration or external mutation is expected.

## Dependency summary

Task 1 precedes Tasks 2 and 3. Tasks 2 and 3 can run concurrently only in approved Mode A. Task 4 starts after both writers finish; Task 5 follows resolved review findings; Task 6 follows verification. Review and final verification must use the integrated worktree, not a transient state during edits.

## Completed result and verification record

All six tasks are complete. Backend and frontend writers used separate ownership boundaries; an independent integrity review found no blocking defects before final verification. No shared catalog/selector or permission expansion was needed.

### Delivered behavior and affected areas

- Invite user and Manage user now offer **Known languages** and **Preferred language**. Manage saves the pair with **Save languages**. Users can add, edit, clear, reopen, and review saved values in Details. Preference remains independent; Location and access changes retain their separate controls and unsaved-change protection.
- New backend `domain/user-languages.ts` centralizes strict validation, catalog-order normalization, historical defaults, and equality. User/UserInvitation models, memory/Mongo repositories and interfaces, administration/invitation services and routes, audit actions/projections, and OpenAPI now carry the pair throughout its administrative lifecycle.
- New frontend `features/admin/userLanguages.ts` supports canonical comparison/display. API types, invitation serializer, both forms, Details, and scoped administration styles were updated. The existing language catalog and `ProjectLanguageMultiSelect` were reused unchanged.
- Language-only changes preserve authorization versions and sessions. Invalid language fields produce named errors. Private language audit values remain restricted to Super Admin.
- Regression files cover both administration/invitation paths, model validation, transactional Mongo concurrency/rollback, audit privacy, password-reset/Procurement authority, and rendered frontend interactions. Existing Location tests were preserved, with intentional API-shape expectations updated for the additional branch.

### Final integrated checks

All commands below exited 0 on the final integrated worktree.

From `backend/`:

```sh
npm test -- tests/user-languages.test.ts tests/user-location.test.ts tests/user-administration.test.ts tests/user-invitations.test.ts tests/user-invitation-repository.test.ts tests/user-invitation-models.test.ts tests/user-administration-mongo.replica-set.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/audit-security.test.ts
```

Result: **9 files, 278 tests passed**, including replica-set tests. Covers criteria 1–5 and the API/persistence portion of criterion 8.

```sh
npm test -- tests/auth-session-revocation.test.ts tests/super-admin-authorization.test.ts tests/authorization-policy.test.ts tests/password-reset.test.ts tests/password-reset-mongo.replica-set.test.ts tests/procurement-vendor-access.test.ts tests/procurement-vendor-access.replica-set.test.ts tests/project-client-invitations.test.ts tests/project-client-invitations-mongo.replica-set.test.ts
npm run typecheck
npm run build
```

Result: **9 files, 366 tests passed**; typecheck and build passed. Covers authorization/session/invitation compatibility in criteria 4–5 and 8.

From `frontend/`:

```sh
npm test -- src/features/admin/UserInvitationDialogs.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/userInvitationsApi.test.ts src/features/admin/UserInvitationsPanel.test.tsx src/features/admin/UserDeletionDialog.test.tsx src/features/admin/ProjectLanguageMultiSelect.test.tsx
npm run typecheck
npm run build
```

Result: **7 files, 88 tests passed**; typecheck and build passed. Covers criteria 1–3, 6, and 8. Total: **732 passing tests** (644 backend, 88 frontend).

- `git diff --check` passed; `git status --short` captured the expected existing and new changes. All seven untracked source/test files passed explicit whitespace checks. No dependency or lockfile changes.
- Initial backend core execution encountered sandbox `EPERM` while binding temporary test sockets; the identical run with local-test permissions passed. No product fix was needed.
- Intermediate writer failures were test-only expectations/locators and were corrected before the successful integrated run.

### Browser and runtime evidence

Using the existing synthetic enterprise fixture and temporary in-browser responses, verified at **1440×1000** and **390×1000**: keyboard selection/Escape focus restoration, independent preference, save/refetch/reopen, Details display, clearing, request-failure recovery, version-conflict review, and unsaved-change protection. Invitation payload included both language fields and the existing Location. Zero axe violations, document overflow, unexpected fixture requests, or application runtime errors.

Also selected and saved all **23 languages at 390×844**: selections wrapped, controls remained usable, zero overflow/axe violations. Screenshots were visually inspected. This completes criterion 7.

An initial browser attempt used an ambiguous option locator, then a development-page reload reset the temporary transport. After scoping the locator and waiting for all writers, the complete flows passed on a stable page. These were QA harness issues, not product failures.

The established local backend was restarted through `backend/npm run dev`, whose existing launcher skips seeding. Live checks confirmed HTTP **200** health, the **23-language** catalog, and both fields in create/update/directory/invitation API schemas. Existing rules-service readiness and OCR startup were retained. No application user or invitation was changed for QA.

Evidence directory: `/private/tmp/lisno-user-languages-20261125/`:

- Exact command output: `final-backend-core-retry.log`, `final-backend-authority.log`, `final-frontend-tests.log`, and `final-*-typecheck.log` / `final-*-build.log`.
- Browser reports: `browser-report.json`, `browser-long-report.json`; screenshots and CLI artifacts: `output/playwright/`.
- Live readiness: `runtime-check.json`; initial baseline: `baseline.patch`, `baseline/`, `baseline-paths.json`.
- The task's browser session and temporary Vite server were stopped. Generated browser artifacts were moved out of the repository. The normal application backend remains running with the change.

### Limits and external actions

- Full global and OCR suites were not run; neither area required broader verification. The known unrelated API-doc test failures were not rerun; language/Location OpenAPI assertions passed in focused suites. No lint script exists.
- Existing Mongoose deprecated-`new` warnings and Vite's large-chunk warning remain (main JS 3,504.86 kB). No new blocker was found.
- Builds generated ignored `backend/dist` and `frontend/dist`; these were not staged. No migration, backfill, seed, real email, production mutation, commit, push, or deployment occurred. No new dependencies were added.

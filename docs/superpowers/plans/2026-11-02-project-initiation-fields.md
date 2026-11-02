# Project initiation fields: task plan

Date: 2026-11-02
Status: Implemented and reviewed (Mode A); verification has one pre-existing test failure
Specification: [Project initiation fields](../specs/2026-11-02-project-initiation-fields-design.md), approved by the user on 2026-11-02.

This plan implements the approved specification without changing its scope. No implementation begins until task-plan approval and the subsequent execution-mode choice. Keep one parent task active at a time; bounded subtasks within that parent may run in parallel where indicated.

## Contract to implement

- The linked Lead owns `nativePlace`, `tentativeBudget`, `closureTentativeDate`, `category`, `languagesKnown`, and `preferredLanguage`. Add the same metadata at the top level of the Admin project summary alongside the existing Lead-derived property type and budget fields.
- New metadata is optional on input and in public TypeScript shapes for legacy compatibility. Newly returned data uses `null` for absent scalar fields and `[]` for absent known languages.
- Text limits: Native 120 characters; Tentative Budget 200 characters. Budget remains descriptive text and never feeds financial calculations.
- Closure date is a validated `YYYY-MM-DD` calendar date, nullable/omittable, with no timezone conversion or new scheduling effects.
- Category values are `self_use` and `rental`. Both language selectors use the specification's 23 options, with lowercase language-name values such as `english`, `hindi`, and `tamil`. Known languages are a unique array; preferred language is an independent nullable scalar.
- Next action is disabled and fixed to `Estimation` in the form. The initiation API defaults omission to `Estimation` while preserving explicit values accepted from existing API consumers. Existing saved actions are untouched.
- No dependencies, migration, backfill, permission changes, additional detail-screen sections, production mutations, commits, or deployment are part of this work.

## Ownership boundaries

In Mode A, use native Codex agents only after execution mode is selected. In Mode B, the primary agent performs every step inline, including review and verification.

| Owner in Mode A | Exclusive write scope |
| --- | --- |
| Primary agent | This plan; pure shared contract at `backend/src/contracts/project-initiation.ts` and frontend re-export at `shared/projects/projectInitiation.ts`; shared record/API shapes in `backend/src/repositories/types.ts` and `frontend/src/api/types.ts`; integration decisions and reconciliation. |
| Backend implementer | Initiation validation/service, Lead model, memory/Mongo adapters, Admin summary projection, OpenAPI, backend tests named below. Excludes the primary agent's contract and type files. |
| Frontend implementer | Initiation dialog, local language picker, existing date picker, related styles, frontend tests named below. Excludes `frontend/src/api/types.ts` and the shared contract. |
| Integrity reviewer | Read-only review of the integrated task diff and applicable invariants after both writers finish. |
| Verification runner | Final commands and browser verification after review fixes; no product-source edits. |

All writers must be told that they are not alone in the codebase, must preserve others' edits, and must stop at their ownership boundary if a shared-contract change is needed. The primary agent settles and communicates such changes before dependent edits resume.

## Task 1: Baseline and contract preparation

Dependencies: Approved task plan and selected execution mode.

Owner: Primary agent.

1. Re-read the approved specification and inspect current status plus relevant per-target diffs. Capture the dirty-path set and scoped baseline patches in ignored temporary storage before writers start. Existing quotation/design-workflow work is unrelated and must remain intact.
2. Inspect current focused tests to distinguish baseline failures from this task's regressions. Run the initiation-dialog and admin-project tests as the initial baseline; record failures without changing unrelated behavior.
3. Define a browser-safe, dependency-free catalog and metadata types in `backend/src/contracts/project-initiation.ts`. Expose them to the frontend through `shared/projects/projectInitiation.ts`, following the existing shared re-export pattern in `shared/knowledge/knowledgeSpecificationItemNames.ts`. Keep backend imports inside its established `rootDir`; preserve NodeNext `.js` suffixes there.
4. Extend Lead, Admin summary, and initiation input shapes in the two primary-owned type files. Preserve current workflow-version and quotation additions. Agree on empty-value normalization and API field names before handing work to writers.

Completion evidence: Baseline recorded, exact shared shape available, each writer assigned explicit paths and existing changes explained. Supports AC 1, 3, 4, and 7.

## Task 2: Implement persisted fields and form behavior

Dependencies: Task 1 complete. This is the only active parent during implementation. Subtasks 2A and 2B may run in parallel in Mode A because their file ownership does not overlap; execute them sequentially inline in Mode B.

### Task 2A: Backend validation, persistence, and regression coverage

Owner: Backend implementer in Mode A; primary in Mode B.

Affected areas:

- `backend/src/routes/admin-projects.ts`
- `backend/src/services/admin-project.service.ts`
- A focused backend domain helper for metadata validation/normalization, if needed
- `backend/src/models/Lead.ts`
- `backend/src/repositories/memory.ts`, `mongo.ts`, and `admin-project-summary.ts`
- `backend/src/openapi.ts`
- `backend/tests/admin-projects.test.ts`, `mongo-repository.test.ts`, `leads.test.ts`, and `api-docs.test.ts`
- `backend/tests/project-client-invitations.test.ts` and `project-client-invitations-mongo.replica-set.test.ts` for creation retry/transaction coverage

Work:

1. Extend the strict initiation request validation with optional metadata, supported category/language values, duplicate rejection, text limits, and actual calendar-date checks. Normalize blank optional text and defaults consistently. Keep validation field-addressable and before persistence; direct service callers must receive the same defaults and cannot bypass required metadata validation.
2. Persist metadata on the Lead inside the existing initiation transaction. Keep project status, IDs, assignments, access grants, audit payloads, and invitation orchestration unchanged.
3. Extend Mongo schema/mapping and memory read/create/update behavior so new fields survive later reads and unrelated mutations. Normalize missing historical metadata consistently on Lead list/detail and Admin summary responses. No Project or User duplication is needed.
4. Incorporate normalized metadata and the Next action default into idempotency fingerprinting. Equivalent omitted/explicit defaults must retry safely; changed metadata must conflict. Assess historical receipt fingerprint compatibility and preserve legitimate retries without rewriting receipts or accepting different requests under the same key.
5. Update OpenAPI input fields, language/category enums, date-only format, limits, optional/default Next action, and response metadata documentation without expanding unrelated response contracts.
6. Add focused tests for two distinct projects with different intake values; omitted/blank inputs and old records; invalid lengths, enums, duplicate languages, malformed/impossible dates, and leap days; existing numeric budget/action preservation; identical/concurrent retries and changed-metadata conflicts. Verify no partial writes on failure and no new personal metadata in audit or mail content.
7. Extend actual replica-set initiation coverage to prove persistence/readback and receipt deduplication in Mongo. Use synthetic users and local fake/disabled delivery only.

Completion evidence: Focused backend tests pass, the Mongo path retains every field, and AC 3, 4, 5, and 6 are demonstrated.

### Task 2B: Form fields, language selectors, calendar, and interaction coverage

Owner: Frontend implementer in Mode A; primary in Mode B.

Affected areas:

- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx`
- A small feature-local `ProjectLanguageMultiSelect.tsx` and its styles/tests if needed
- `frontend/src/features/admin/NextActionDateTime.tsx` and `next-action-date-time.css`
- `frontend/src/styles/access-administration.css`, limited to initiation-related selectors if necessary
- `frontend/src/features/admin/adminProjectsApi.ts`, only if required by the agreed input shape
- `frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx`, `NextActionDateTime.test.tsx`, and `AdminProjectsPage.test.tsx`
- `frontend/src/features/leads/LeadDashboard.test.tsx` and `frontend/src/test/accessibility.test.tsx`

Work:

1. Add typed form state and explicit optional/required field handling. Group Native/languages with client details and category/budget/closure date with project details while retaining the current responsive layout.
2. Use existing single-select styling for Category and Most Preferred Language. Existing room and brand multi-selects are domain-specific, so use their interaction conventions for a small local language picker without importing their icons or catalog workflows. Support selection/removal, keyboard operation, clear accessible labels, disabled state, and mobile scrolling without a new dependency.
3. Extend the existing calendar with a configurable accessible label and optional clearing behavior. Preserve the current default label and behavior for Next action date. Use separate IDs/state for the closure date and provide correct Escape/focus-return behavior within the panel.
4. Show Next action as disabled `Estimation` from first render and submit it explicitly. Compare editable form state against initial defaults for dirty detection; do not treat the fixed action or an empty language array as user changes.
5. Serialize new fields using the agreed empty-value rules. Send the closure date string directly. Keep the existing Next action timestamp conversion, role-specific assignment, query invalidations, and post-success navigation unchanged.
6. Preserve entered data on failure, disable editing while pending, and focus enabled controls for field errors. Update existing test helpers that currently type a custom Next action so they verify the new fixed value instead.
7. Add rendered tests for both assignment modes, all new fields, multi-select changes, independent preference, date clearing and keyboard behavior, clean/dirty/reverted state, pending/error retention, and exact request payloads. Retain successful creation and navigation checks from both entry points.

Completion evidence: Focused frontend tests pass and AC 1, 2, and the calendar portion of AC 5 are demonstrated.

## Task 3: Integrate and review

Dependencies: Both Task 2 writers finished; no concurrent product-source writes during the review.

Owner: Primary agent, with read-only `integrity_reviewer` in Mode A.

1. Reconcile the changes against the scoped baseline. Inspect every task-owned diff and confirm unrelated work was preserved.
2. Review the complete path from form selection to request validation, transaction, Mongo mapping, Lead readback, and Admin projection. Verify catalog agreement and backward-compatible optional fields.
3. Review canonical fingerprints and historical retries, server-side validation, date boundaries, assignment permissions, stable joins, audit privacy, and invitation isolation.
4. Review keyboard focus, calendar labels/state, dirty-state comparison, disabled-value submission, and stale-query invalidation.
5. Resolve confirmed findings in their owned paths and rerun only relevant focused checks before final verification.

Completion evidence: No unresolved correctness or acceptance-criteria findings; review results recorded. Supports all acceptance criteria.

## Task 4: Final integrated verification

Dependencies: Task 3 complete and all fixes integrated.

Owner: `verification_runner` in Mode A; primary inline in Mode B. Backend and frontend command groups may run independently, but final results must refer to the same settled worktree.

Run from `backend/`:

```sh
npm test -- tests/admin-projects.test.ts tests/mongo-repository.test.ts tests/leads.test.ts tests/api-docs.test.ts tests/project-client-invitations.test.ts
npm test -- tests/project-client-invitations-mongo.replica-set.test.ts
npm run typecheck
npm run build
```

Run from `frontend/`:

```sh
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/NextActionDateTime.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/leads/LeadDashboard.test.tsx src/test/accessibility.test.tsx
npm run typecheck
npm run build
```

Include any new focused picker or contract test files in the corresponding command group. Run date-related tests under at least UTC and Asia/Kolkata, including a valid leap day and invalid non-leap February 29. Do not repeat entire suites solely to change timezone.

Browser verification:

- Run the local application with synthetic data and fake/disabled email; do not submit real client data or send real invitations.
- Inspect the initiation panel at approximately 390px, 768px, and 1440px widths. Exercise both entry points/assignment modes, one complete synthetic submission and saved-value readback, field errors, server failure, and pending state.
- Exercise both calendars, language selection/removal, keyboard Tab/Escape, focus return, and clean/dirty cancellation. Check overflow, panel scrolling, footer reachability, and dropdown/calendar clipping.
- Inspect browser console and network errors. Use the applicable browser QA skill during execution and store temporary evidence outside tracked source paths.

Run `git diff --check` and `git status --short` from the repository root. Broaden tests only for newly identified impacts or failures. Record any pre-existing failures separately; do not claim all checks pass if a required check was blocked or unrun. There is no lint script.

Completion evidence: Results mapped to AC 1–7, exact checks recorded, browser widths/states verified, and any remaining limits explicitly reported.

## Task 5: Handoff

Dependencies: Final verification complete, or an explicit report of a material unresolved blocker.

Owner: Primary agent.

Report the saved fields and default behavior, principal files/decisions, exact validation results, any unrun checks or residual risks, and temporary artifact paths. Confirm that no dependency, migration, production action, commit, or deployment was performed. Do not call partially verified work complete.

## Gate state

- Specification: Approved.
- Task plan: Approved.
- Execution mode: A, parallel sub-agents.
- Task 1: Complete. Baseline backend initiation 37/37 and frontend initiation 26/26 passed. Shared contract and public shapes added.
- Task 2: Complete. Backend and frontend writers finished their owned changes and focused checks.
- Task 3: Complete. Independent integrity review found no confirmed defects.
- Task 4: Verification completed; results below. One unrelated baseline test failure remains.
- Task 5: Handoff prepared. No product work remains under this plan.
- Known baseline failure: Mongo repository user-CAS test expects a filter without `deletedAt: null`, although the pre-existing implementation includes it. Leave unrelated behavior/test unchanged.
- Baseline evidence: `/tmp/project-initiation-baseline-status.txt` and `/tmp/project-initiation-baseline.patch`.


## Final verification evidence

All commands below ran against the integrated implementation after both writers finished and the independent integrity review found no confirmed defects.

| Area | Command | Result |
| --- | --- | --- |
| Backend focused | `npm test -- tests/admin-projects.test.ts tests/mongo-repository.test.ts tests/leads.test.ts tests/api-docs.test.ts tests/project-client-invitations.test.ts` | 258 passed, 1 pre-existing failure. |
| Mongo transactions | `npm test -- tests/project-client-invitations-mongo.replica-set.test.ts` | 6 passed. |
| Backend types/build | `npm run typecheck`; `npm run build` | Both passed. |
| Frontend focused | `npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/NextActionDateTime.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/leads/LeadDashboard.test.tsx src/test/accessibility.test.tsx src/features/admin/ProjectLanguageMultiSelect.test.tsx` | 105 passed, including accessibility states. |
| Calendar timezone | `TZ=UTC npm test -- src/features/admin/NextActionDateTime.test.tsx`; `TZ=Asia/Kolkata npm test -- src/features/admin/NextActionDateTime.test.tsx` | 5 passed in each timezone. Backend intake/date validation also passed its 16 focused cases in each timezone during implementation. |
| Frontend types/build | `npm run typecheck`; `npm run build` | Both passed. |
| Hygiene | `git diff --check`; `git status --short` | Passed; existing unrelated dirty work preserved. |

The remaining backend failure is `tests/mongo-repository.test.ts:924`, “uses legacy-aware version-one CAS then exact incrementing Mongo CAS.” Its expectation omits `deletedAt: null`, which already exists in the HEAD implementation. Neither the affected user-update code nor that expectation was modified by this task. The focused backend command therefore does not pass as a whole. Logs: `/tmp/project-initiation-final-backend-tests-escalated.log` (definitive rerun after local-socket sandbox denial), `/tmp/project-initiation-final-frontend-tests.log`, `/tmp/project-initiation-final-replica.log`, and the related `/tmp/project-initiation-final-*.log` build/typecheck/timezone files.

Browser verification used Chrome 156, DPR 1, with 390×844, 768×1024, and 1440×1000 viewports. The actual initiation component and API routes ran on an isolated development server with synthetic memory data and disabled email. Both assignment modes saved/read back correctly; all new fields and omitted optional values were exercised. Pointer/keyboard language selection, calendar clearing and independent dates, required-error focus, pending controls, a simulated 503 retry, clean/dirty/reverted forms, and discard behavior passed. There was no horizontal overflow, submit/cancel remained reachable, and screenshots were visually inspected. The sole browser console error was the deliberate 503 response. This was viewport emulation, not a physical-device or production-performance benchmark.

Browser details and screenshots: `/tmp/lisno-project-initiation-qa/results.json` and the referenced images in that directory. The task browser and local QA server were stopped, discarding their synthetic data. Baseline reconciliation for previously dirty target files is `/tmp/project-initiation-task-only-dirty-files.diff`.

Remaining limits: full repository suites and other browser engines/physical devices were not run; no lint script exists. The frontend build retains its existing chunk-size warning, and Mongo integration emits existing Mongoose deprecation warnings. Builds generated ignored `backend/dist` and `frontend/dist` outputs. No dependency or lockfile changes, migration/backfill, production mutation, real email, commit, push, or deployment occurred.

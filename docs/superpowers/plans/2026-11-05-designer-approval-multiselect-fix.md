# Approval timestamp compatibility and secondary-Designer multi-select: task plan

Date: 2026-11-05  
Status: Implemented and verified on 2026-11-05.

Approved specification: [Conditional Client reapproval and compact Designer team selection](../specs/2026-11-04-designer-assignment-approval-flow-design.md). The user approved this revision on 2026-11-05.

## Target outcome

Complete two bounded follow-ups without reopening or rewriting the verified workflow implementation:

1. A valid Client approval resolves as current when Mongo supplies its decision time as a JavaScript `Date` and lifecycle evidence supplies the same instant as an ISO string, including non-zero milliseconds.
2. Super Admin manages zero to three secondary Designers through a compact searchable multi-select dropdown instead of the current large expanded search-and-checkbox panel.

The approval correction preserves every existing lineage, actor, revision, digest, scope and fail-closed check. The team-selector change reuses the existing eligible-Designer query and CAS-protected mutation contract. No migration, project mutation, new approval, dependency or backend process is required.

## Confirmed evidence and baseline

- Read-only inspection of demo project `Lisno000001` showed that the immutable pre round and lifecycle reference identify the same approval instant: `2026-11-04T16:14:41.812Z`.
- The resolver evaluates `Date.parse(String(value))`. When `value` is a Mongo `Date`, `String(Date)` drops `.812`, so the valid source incorrectly becomes `source_issue` although every other approval predicate passes.
- `DesignTeamPicker.tsx` opens a full-width inline region containing search, a separate count, a checkbox fieldset and action controls. The backend/API already supports a maximum of three secondary Designer IDs.
- The current backend resolver and its focused test are task-created untracked files. The targeted Designer picker source, style and test files are currently clean. Their state must be captured before writers begin.
- The earlier workflow implementation passed its final focused lanes: backend 6 files / 226 tests, frontend 13 files / 242 tests, both typechecks/builds and `git diff --check`. Those results are historical evidence, not verification of this follow-up.

Before writers start, the primary agent records `git status --short`, copies the untracked backend targets and captures relevant diffs under `/private/tmp/lisno-designer-approval-multiselect/baseline/`. No writer may overwrite unrelated or pre-existing hunks.

## Fixed implementation decisions

### Approval timestamp compatibility

- Keep exact instant equality.
- Normalize a valid `Date` with `getTime()` and a valid ISO string with `Date.parse()`; require finite epoch-millisecond values before comparison.
- Do not compare `Date` values through display strings and do not truncate, round or apply a tolerance window.
- Do not weaken any adjacent lineage check or introduce fallback approval inference.
- Cover both initial-current and revised-current resolution where the shared helper is used, plus invalid and genuinely different timestamp failures.

### Secondary-Designer selector

- Keep the primary Designer visible and read-only.
- Replace the expanded page section with one labelled compact trigger/control and a bounded popover/listbox.
- The dropdown contains search and checkbox options, uses stable Designer IDs, scrolls internally and remains open for multiple selections.
- Show selected names as compact removable values and expose the count out of three.
- At the limit, disable only additional unselected options; removal remains available.
- Keep edits local until **Save team**. **Cancel** restores the server-backed selection. Show the reason input only when the existing API requires it.
- Preserve loading, empty, no-match, API error, stale-version and permission states; support keyboard navigation, Escape, outside click, focus restoration and accessible status announcements.
- Do not change the team API payload, maximum of three, role permissions or query ownership.

## Dependency-ordered task graph

| Task | Owner and boundary | Dependencies | Completion evidence |
| --- | --- | --- | --- |
| 1. Capture delta baseline | Primary agent; read-only inventory and copies under `/private/tmp/lisno-designer-approval-multiselect/baseline/` | None | Record status/diffs for every target, preserve the untracked resolver/test, map AC1/AC10/AC11/AC12 to focused checks and confirm no user process is touched. |
| 2. Correct exact timestamp normalization | One `backend_implementer`; owns only `backend/src/services/quotation-approval-state.service.ts`, `backend/tests/quotation-approval-state.test.ts`, and a directly required focused fixture if discovered | Task 1 | Equal `Date`/ISO instants with milliseconds resolve current; invalid/different values fail closed; existing source/revision cases still pass. No schema or data write. |
| 3. Implement compact multi-select | One `frontend_implementer`; owns `frontend/src/features/designer/DesignTeamPicker.tsx`, `DesignTeamPicker.test.tsx`, `designTeamPicker.css`, plus directly affected page tests only | Task 1; may run in parallel with task 2 | Compact dropdown supports search, multi-selection, max three, removal, save/cancel, CAS/error states, keyboard/accessibility and responsive layout while reusing the existing API. |
| 4. Integrate and inspect | Primary agent; cross-layer reconciliation and only narrow fixes outside delegated ownership | Tasks 2–3 | Final diff contains no approval weakening, API drift, unrelated reformatting or duplicated picker logic. Reported-project evidence is reproduced with a read-only resolver call or equivalent fixture. |
| 5. Integrity review | `integrity_reviewer`, read-only | Task 4 | Review exact approval lineage/time comparison, initial/revised behavior, authorization, CAS handling, stable-ID selection, query refresh and dirty-worktree preservation. Primary resolves confirmed findings. |
| 6. Final verification | `verification_runner` after writers and integrity fixes; primary owns rendered QA and final reconciliation | Task 5 | Focused regressions, typechecks, builds, interaction/accessibility checks and repository hygiene complete with exact results and limitations. |

In Mode A, tasks 2 and 3 are independent and run in parallel after task 1. Tasks 4–6 remain sequential. In Mode B, the primary agent performs all tasks sequentially without implementation subagents.

## Backend implementation slice

The backend change is deliberately narrow:

- replace only the lossy timestamp normalization used by exact approval comparisons;
- keep the current resolver states and five-field projection unchanged;
- add focused fixtures with a real `Date` object containing non-zero milliseconds and the equivalent ISO string;
- assert one-millisecond and invalid-value mismatches still fail closed;
- retain coverage for initial current, revision current, pending revision, changed quotation and source issue;
- do not connect tests to the user's demo database or mutate `Lisno000001`.

Focused command:

```sh
cd backend
npm test -- tests/quotation-approval-state.test.ts tests/project-workflow.test.ts tests/design-workflow-state.test.ts --maxWorkers=1
```

If the helper is exercised by a Mongo-specific conversion path not represented by the unit fixture, add the nearest existing disposable replica-set suite. Do not require the local Mongo demo database.

## Frontend implementation slice

The frontend change stays inside the existing Designer team feature:

- reuse `getEligibleSecondaryDesigners()` and the existing team mutation/version fields;
- preserve current primary Designer presentation and selected-secondary summary;
- use a button/combobox-style trigger with an associated popover/listbox rather than a permanently expanded fieldset;
- prevent the popover from expanding the page to the full result count;
- keep save/cancel semantics explicit and do not save on each checkbox click;
- ensure selected values remain understandable at narrow widths and long names do not force horizontal overflow;
- avoid a new dependency; use existing primitives and established visual tokens.

Focused command:

```sh
cd frontend
npm test -- src/features/designer/DesignTeamPicker.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/ProjectWorkspace.test.tsx --maxWorkers=1
```

Focused tests cover:

- closed empty and populated controls;
- opening, search and no-match state;
- mouse and keyboard selection/removal;
- maximum-three enforcement while removal remains enabled;
- primary/ineligible Designer exclusion by stable ID;
- cancel rollback and successful CAS-protected save;
- loading, mutation error and stale-version recovery;
- Escape/outside close, focus restoration and accessible names/status;
- reuse in both current parent pages without duplicate behavior.

## Acceptance-criterion trace

| Criterion | Implementation evidence | Verification evidence |
| --- | --- | --- |
| AC1 / AC10 unchanged approved assignment | Existing canonical resolver remains intact; only exact time normalization changes | Existing initial-current regression plus reported non-zero-millisecond fixture returns current without another approval |
| AC11 timestamp compatibility | Direct epoch-millisecond normalization for `Date` and ISO input | Equal instant passes; invalid, one-millisecond-different and stale source cases fail closed |
| AC12 compact multi-select | Bounded searchable popover over unchanged team API | Focused interaction tests and rendered desktop/tablet/mobile checks cover select, remove, limit, save/cancel and error states |
| Authorization and CAS invariants | Existing backend team mutation remains authoritative; UI sends stable IDs and expected version | Primary exclusion, stale-version and role/page tests remain passing |

## Integrated verification and rendered QA

After focused tests and integrity review, run:

```sh
cd backend
npm run typecheck
npm run build

cd ../frontend
npm run typecheck
npm run build

cd ..
git diff --check
git status --short
```

Run additional affected suites if integration inspection shows the timestamp helper or picker contract has a wider consumer. The prior full frontend suite had known unrelated dirty-worktree failures; do not represent it as passing unless it is rerun successfully. There is no lint script.

Rendered QA uses production components with synthetic/mock state and does not start the backend, launcher or OCR worker. Check the team selector at approximately 1440px, 768px and 390px for:

- empty, populated and maximum-selected controls;
- open dropdown with enough options to scroll internally;
- search no-match, loading and error states;
- keyboard focus/selection/removal and Escape close;
- no unintended page-height jump or horizontal overflow.

Also render the reported approval state with an equivalent `Date`/ISO fixture and confirm that the operational next action is shown instead of **Refresh the quotation approval status**. Store temporary evidence only under `/private/tmp/lisno-designer-approval-multiselect/verification/`.

## Integration and integrity checklist

- Timestamp equality retains millisecond precision and exactness for all supported representations.
- No approval predicate other than representation-safe time parsing changes.
- Initial-current and revision-current states both remain correct; pending/changed/stale evidence remains blocking.
- The five-field backend/frontend approval projection stays aligned.
- Primary Designer cannot appear as a secondary selection; identity joins use stable IDs.
- Existing maximum-three, reason, expected-version and authorization rules remain backend-enforced.
- Query invalidation refreshes both parent pages after save without manufacturing local server state.
- Dropdown state does not leak between projects and closes/restores focus predictably.
- No dependency, lockfile, schema, migration, email, live data, seed, commit, push or deployment change is introduced.
- Unrelated dirty and untracked work remains untouched.

## Operational limits and handoff

- Do not start or stop the user's backend, launcher or OCR worker; the user will restart the backend manually.
- Do not assign a real Designer or mutate the reported project. Read-only diagnostics are allowed and must not expose personal data in the handoff.
- Do not seed, migrate, backfill, send mail, deploy, commit or push.
- No dependency or lockfile change is expected.
- Final handoff reports principal files, exact checks/results, unrun checks, temporary artifact paths, external actions not performed and remaining risk. Partially verified work is not described as complete.

## Implementation result

- Exact approval-time comparison now preserves milliseconds for Mongo `Date` and ISO string representations while retaining fail-closed lineage validation.
- The secondary-Designer control is a compact searchable multi-select with a bounded list, maximum-three enforcement, removable selections, Save/Cancel draft behavior and keyboard/focus handling over the existing API.
- Integrity review found one removal-focus issue; it was corrected and covered by a regression assertion.
- Final focused verification passed: backend 3 files / 321 tests, frontend 3 files / 51 tests, both typechecks and builds, and `git diff --check`.
- Full suites, live demo-project re-read and real-browser width-matrix QA were not run. No backend, launcher, OCR, Vite, browser, database, migration, seed, email, dependency, commit, push or deployment action was performed.


# Procurement inline work updates: task plan

Date: 2026-11-28 (Asia/Kolkata)
Status: Specification and task plan approved; Mode A selected. Implementation and scoped verification completed on 2026-11-28.

Approved specification: [Inline work updates without percentages](../specs/2026-11-28-procurement-inline-work-updates-design.md).

## Intended result

Each P1/P2/P3 item shows vendor status separately from Procurement's latest saved work update. Remove work percentages from this surface. Procurement can record status, notes, follow-up dates and delay details using **Update work**, or append a reasoned correction using **Amend work update**, inside the item panel.

For the setup-required screenshot, expose **Set up to update work** inside the item. It opens the single existing project setup form, then returns to the same stable item after explicit setup and refresh. Initialized projects with an unsaved review use an explicit **Start review to update work** action. No observation is saved automatically.

Reuse the existing observation contracts with `progress: null` on new check/correction revisions. Keep earlier history, server eligibility, priority ordering, source snapshots, permissions and project-wide inspections unchanged. Keep the development backend stopped.

## Ownership and safe parallelism

- Primary agent owns the approved interpretation, documents, baseline preservation, integration, temporary contract validation and browser QA.
- One frontend implementation owner handles `frontend/src/features/procurement/lifecycle/ProgressPanel.tsx`, `ProgressPriorityPanels.tsx`, focused local component extraction if needed, `lifecycle.css`, `ProgressPanel.test.tsx`, `LifecycleWorkspace.test.tsx`, and necessary `lifecycleFixtures.test-support.ts` changes. Narrow `LifecycleShared.tsx` focus integration is allowed only if a local solution cannot preserve the existing behavior. Keep these coupled source/test edits with one owner.
- Backend contracts/domain/services, shared DTOs, API endpoints, query invalidation contracts and unrelated lifecycle panels are read-only references. No backend writer, schema change, dependency install or lockfile edit is planned.
- Existing files contain prior untracked work. Copies and dirty paths are captured under `/tmp/lisno-procurement-inline-work-updates/`. Refresh the per-target baseline before assigning a writer; never replace files from Git or discard prior changes.
- In Mode A, a bounded read-only state/contract audit can run alongside primary baseline/QA preparation. The frontend owner can implement while the primary prepares an isolated actual-component browser fixture on temporary paths. Do not split overlapping UI and test files between writers. After all writers finish, integrity review runs; resolve findings before final verification.
- In Mode B, the primary performs implementation, review and verification inline. No agents start before the execution-choice gate. Keep one parent implementation task in progress; parallel activity is supporting read-only investigation or disjoint temporary QA preparation.

## Dependency-ordered tasks

### T1. Reconcile current code and capture the execution baseline

Owner: primary; optional bounded read-only audit in Mode A. Depends on task-plan approval and execution-mode selection. Acceptance: AC1–AC6.

1. Compare the current targets with the captured copies, record dirty paths and preserve all prior panel/payment/lifecycle work.
2. Trace the setup mutation, query refresh, projected version-zero review, saved round, correction and source-conflict paths. Confirm the exact item identity carried across setup/start-review transitions.
3. Confirm existing permissions and visibility for Procurement/admin, active/completed projects, unavailable sources and revoked access. Record which UI actions are driven by summary versus review capabilities.
4. Run the existing focused Progress/Lifecycle suites as a baseline. Inspect any failure before modifying its expectations; historical test counts are not current proof.

### T2. Replace percentages with inline work-update presentation and entry

Owner: frontend implementation owner. Depends on T1. Acceptance: AC1, AC2, AC4, AC5.

1. Remove vendor/observed percentage rendering from previews and saved-round item summaries. Show the actual vendor status and note, with a truthful missing-value state. Do not derive a status from numeric progress.
2. Label the saved Procurement observation **Work update** and display its status, notes, author/time, next action/check date and applicable delay/recovery details. Use **No work update recorded for this review** where appropriate; do not carry previous-round observations into a new review.
3. Rename eligible item actions to **Update work** and **Amend work update**. Keep the form within the selected item and its priority panel. Use **Work status** and **Work update notes**, retaining observation date/time, required follow-up, blocked/delay recovery fields, forecast controls and correction reason.
4. Remove percentage form state/input. Send `progress: null` for both new checks and amendments, including amendments of historical numeric observations. Preserve the original check and its revision chain; retain the exact identity/version/source/idempotency contract.
5. Keep save feedback with the updated item after refreshed data arrives. Preserve the user's panel expansion, round snapshot membership and existing review/correction history. Do not automatically move to P2/P3 after saving.

### T3. Add the item-to-setup/start-review continuation

Owner: same frontend owner as T2. Depends on T2. Acceptance: AC3, AC5, AC6.

1. Add item-level **Set up to update work** only where explicit setup is permitted. Reveal/focus the existing single setup disclosure without saving anything or mounting duplicate setup forms. Preserve its draft on collapse/reopen.
2. Hold a pending stable item ID scoped to the current project/actor and explicit user action. After successful setup and fresh summary/review data, reveal the containing group and focus the selected item's eligible update action. For a locked item, reveal and focus its explanation instead. Do not attempt to focus a disabled button.
3. Add **Start review to update work** for initialized no-round and version-zero states when the review response permits `open`. Reuse the existing open command and current digest/version. Disable repeated submissions while pending; after a saved round is returned/refetched, return to the selected item without recording an observation.
4. Treat a missing/reassigned item or unresolved source change explicitly after refresh. Never find a replacement by label, index or a similar name. Keep null-priority items unresolved and non-editable.
5. Preserve setup drafts and selection after failed setup/open. Prevent stale/conflicted/revoked states from continuing an update. Reset pending continuation and drafts on project/actor changes or unrelated round changes; late callbacks from a prior identity must not focus or edit the new project's item.
6. Preserve ordinary disclosure/refetch draft retention, deep links and URL parameters. Consume successful continuation once so future refreshes do not force panels open or steal focus. Hidden retained tabs must not receive focus.

### T4. Add focused rendered regressions and contract checks

Owner: frontend owner for repository tests; primary for a temporary backend-schema smoke script. Depends on T2–T3. Acceptance: AC1–AC6.

1. Update existing tests for intentional labels while retaining the original behavioral assertions. Extend focused fixtures only as needed; keep unequal groups with at least two P1 items and distinct stable IDs.
2. Assert percentage-free previews, saved summaries and forms with nonzero legacy numeric records. Keep status, notes and real counts visible. Missing vendor status must remain missing rather than inferred.
3. Exercise each work status, payload `progress: null`, displayed saved update and success feedback. Verify blocked/delayed required fields and reasoned amendments of a numeric record. Inspect mutation payload IDs/version/source and retained prior revision data.
4. Test setup-required item action → single shared setup form → explicit successful setup → same-item focus after refresh. Cover an eligible P1 item and a locked later-priority item. Assert no observation is submitted by setup or navigation.
5. Test no-round and version-zero start-review actions, pending duplicate-click protection, failure/conflict retention, and missing/moved item outcomes. Include unavailable/admin/completed restrictions and no-write browsing.
6. Retain and extend sequencing, snapshot reconciliation, null priority, draft retention, errors and revoked-access coverage. Explicitly test project/actor switches and stale continuation callbacks. Check keyboard-accessible controls, target reveal and hidden-tab focus.
7. Run a temporary schema smoke script against `backend/src/domain/procurement-progress.ts`, validating check/correct commands with `progress: null` for all four statuses and required blocked recovery fields. Include invalid blocked-data and numeric-status mismatch controls. The script imports domain validation only, starts no server and writes no repository/backend product files.

### T5. Review the integrated change

Owner: primary; integrity reviewer in Mode A. Depends on all writers completing T2–T4. Acceptance: AC1–AC6.

1. Compare actual file contents with the execution baseline, including untracked files. Verify that unrelated sources, dependencies, API contracts, previous records and backend behavior remain intact.
2. Review setup/open mutation boundaries, selected-item continuation, version-zero restrictions, identity resets, late responses, source snapshots, correction history and focus timing.
3. Confirm that hidden percentages cannot survive in a new mutation or cause a status-validation error, and that no authorization or earlier-priority rule is inferred from an expanded panel.
4. Resolve confirmed findings, update relevant tests, and freeze the integrated product source before final verification.

### T6. Verify the final result and record the handoff

Owner: primary for browser QA/documents; verification runner in Mode A for consolidated checks. Depends on T5. Acceptance: AC1–AC6.

1. Run focused frontend tests, typecheck and build on the frozen integrated result. Run typecheck/build sequentially. Run the unchanged backend ordering tests and temporary schema validation. Broaden testing only for a newly affected shared consumer or concrete failure.
2. Render actual components with synthetic API data at 390, 768 and 1440 pixels. Inspect setup preview, active inline form, saved update, legacy-number amendment and locked P2/P3 presentation. Check overflow, accessible names, keyboard operation, console errors and API failures.
3. Exercise a setup-to-item-to-save flow and a projected-round-to-item flow in the browser. Verify two P1 observations unlock P2 without requiring completed work, collapse/refetch preserves drafts, and unavailable/read-only/revoked states stay restricted.
4. Confirm no backend listener was started. Stop the disposable browser/frontend fixture. Keep logs/screenshots outside the repository under `/tmp/lisno-procurement-inline-work-updates/`; identify generated ignored outputs without deleting unrelated existing artifacts.
5. Record exact commands, results, changed files, acceptance coverage and limitations in this plan. No full-suite, authenticated E2E, native-device or performance claim without running the relevant check. No stage, commit, push, deployment, seed, migration or production/external write.

## Verification commands

From `frontend/`:

```sh
npm test -- src/features/procurement/lifecycle/ProgressPanel.test.tsx src/features/procurement/lifecycle/LifecycleWorkspace.test.tsx
npm run typecheck
npm run build
```

From `backend/`:

```sh
npm test -- tests/procurement-progress.test.ts
node --import tsx /tmp/lisno-procurement-inline-work-updates/progress-contract-smoke.mts
```

The temporary smoke script will use the actual domain schema and Node assertions. It must not import the application/server, connect to Mongo or mutate data. The existing `tsx` dependency is sufficient.

From the repository root:

```sh
git diff --check
git status --short
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

No listener is the intended result for port 3000; `lsof` exit 1 with no output means no match. Compare task-specific file copies/hashes as well as tracked diffs because the lifecycle files are already untracked. There is no repository lint script.

## Acceptance mapping

| Criterion | Evidence to collect |
| --- | --- |
| AC1 | Nonzero legacy-value fixtures; absence of work-percentage display/input; truthful vendor status and update counts; browser screenshots. |
| AC2 | Inline status/notes submission, refreshed saved record and feedback, panel remains open. |
| AC3 | Explicit setup/start-review interaction, selected stable item restored, version-zero gating, failure handling, no-write browsing. |
| AC4 | Exact null-progress check/correct payloads, four statuses, delay requirements, amendment reason/history and direct backend-schema validation. |
| AC5 | Multi-item P1 ordering, empty/null priorities, source reconciliation, stale/conflict/denied/admin/completed restrictions. |
| AC6 | Collapse/refetch retention, identity/round reset and late-callback tests, keyboard/deep-link/focus checks, 390/768/1440 browser widths. |

## Approval and execution record

- Specification approved in the current conversation on 2026-11-28. The approved specification is linked above and remains the source of truth.
- Task plan approved in the current conversation; the user selected Mode A for this change.
- T1 is complete. A refreshed execution baseline is captured under `/tmp/lisno-procurement-inline-work-updates/execution-baseline/`; the previously captured targets are unchanged since specification preparation. The existing frontend focused suite passed 26/26 before edits (`frontend-baseline.log`).
- Mode A ownership: `/root/inline_updates_ui` owns the bounded frontend implementation/tests; `/root/inline_updates_audit` completed the independent read-only continuation/contract audit. Primary owns documents, domain smoke and isolated browser QA.
- Audit follow-up included in the form scope: preserve the exact initial observation timestamp so an immediate first update cannot predate a newly opened review due to minute truncation. Continue only with fresh readable summary/review data; guard new actions by active project status; scope pending item selection by project/actor and one-shot request identity.
- Unchanged backend ordering baseline: 4/4 tests passed. Temporary domain smoke: 8 valid null-progress check/correct commands and 5 invalid controls passed. Logs: `/tmp/lisno-procurement-inline-work-updates/backend-baseline.log` and `contract-smoke.log`.
- The confirmed pre-existing local backend launcher was gracefully stopped under the approved constraint; port 3000 has no listener. A frontend-only synthetic fixture runs temporarily on localhost4182; it does not contact the backend or database.
- T2–T5 are complete. The primary integrated three item-scoped test-selector corrections after the interrupted agent turn and added two regressions for successful setup followed by failed refresh, and unrelated-round replacement during continuation. All 40 focused frontend tests pass. The independent integrity review found no confirmed defects and approved the added test assertions. Product/test source is frozen for T6 verification.
- Browser checks passed: 18 width/state cases, setup failure/retry and same-minute first save, projected/no-round continuation, legacy numeric amendment with null on the new revision, two-P1 ordering, draft retention, deep links, identity isolation and revoked access. Product hashes are unchanged since these browser checks. Final ordinary-state console/network smoke is clean.
- `/root/inline_updates_verify` consolidated the successful test evidence and completed sequential frontend typecheck/build plus hygiene, hash-preservation and stopped-port checks. The browser and fixture server are stopped; temporary fixture dependency symlink/cache were removed. Final results follow below.

## Completed implementation

T1–T6 are complete. Four source/test files changed relative to the execution baseline:

- `frontend/src/features/procurement/lifecycle/ProgressPanel.tsx`: percentage-free vendor status and Procurement work updates; inline update/amend forms and save feedback; new revisions send null progress; explicit setup/start-review actions return to the selected stable item or blocker; fresh data, source/round/actor identity and hidden-tab focus are guarded. Initial observation timestamps retain milliseconds so an immediate post-setup save is valid.
- `frontend/src/features/procurement/lifecycle/lifecycle.css`: small work-update spacing and text-wrapping additions using existing styling.
- `frontend/src/features/procurement/lifecycle/ProgressPanel.test.tsx`: new payload, timestamp, setup/open continuation, retry, reassignment, actor-change, failed-refresh and unrelated-round regressions; existing priority/draft/access tests retained.
- `frontend/src/features/procurement/lifecycle/LifecycleWorkspace.test.tsx`: existing integration expectations aligned with the work-update labels.

No backend/shared contract, persistence, API endpoint, dependency, lockfile, native mobile or unrelated product file changed. Previous percentage-bearing observations remain in immutable history; only new observation/correction revisions from this form send `progress: null`. Existing P1-to-P2-to-P3 gates and project-wide inspection rules remain authoritative.

## Final verification

Exact commands, logs, hashes and scope limits: `/tmp/lisno-procurement-inline-work-updates/final-verification.md`. The verifier reused passing test logs after checking their source hashes, then ran the remaining typecheck/build sequentially.

| Check | Result |
| --- | --- |
| `cd frontend && npm test -- src/features/procurement/lifecycle/ProgressPanel.test.tsx src/features/procurement/lifecycle/LifecycleWorkspace.test.tsx` | 40/40 passed, exit 0. |
| `cd backend && npm test -- tests/procurement-progress.test.ts` | 4/4 passed, exit 0; backend product sources unchanged. |
| `cd backend && node --import tsx /tmp/lisno-procurement-inline-work-updates/progress-contract-smoke.mts` | 8 valid null-progress check/correct commands and 5 invalid controls passed, exit 0. |
| `cd frontend && npm run typecheck` | Passed, exit 0. |
| `cd frontend && npm run build` | Passed, exit 0; existing Vite chunk-size warning only. |
| Independent integrity review | No confirmed defects; two identified coverage gaps were closed with passing tests and reviewed. |
| Browser width/state matrix | 18/18 passed: six lifecycle states at 390/768/1440 pixels; no percentages, overflow or browsing writes. |
| Browser workflows | Setup retry, same-minute first save, explicit open, stable-item/blocker focus, amendment/history, two-P1 ordering, drafts, deep links, project/actor changes and revoked access passed. |
| Ordinary browser error smoke | Zero console/page errors, failed requests or HTTP errors. |
| `git diff --check` / preservation | Passed; four tested file hashes and browser product hashes unchanged. All 299 dirty-path entries unchanged during final verification. Baseline comparison across 2,769 paths found only the four intended frontend source/test changes. |
| `lsof` on ports 3000 and 4182 | No listeners; development backend and disposable frontend fixture are stopped. |

Browser evidence: `/tmp/lisno-procurement-inline-work-updates/browser/qa-report.md`, result logs and ten screenshots. The temporary dependency symlink and fixture Vite cache were removed. Build/test tooling may update ignored `frontend/dist/` and `frontend/node_modules/.tmp/` outputs; these are not deliverables and were not staged.

Acceptance criteria AC1–AC6 are covered by the rendered regressions, existing ordering suite, actual-schema smoke, independent review and actual-component browser checks. Browser responses were synthetic: authenticated backend E2E, full repository suites, Mongo integration, native devices/Safari and performance benchmarks were not run. No lint success is claimed because the repository has no lint script. No commit, push, deployment, seed, migration, production mutation or external communication occurred.

# Automatic test calculations — task plan

Approved specification: [Automatic test calculations](../specs/2026-09-15-automatic-test-calculations-design.md).

Status: implemented in approved mode A. Integrated tests, integrity review, typecheck/build and desktop interaction checks passed. Mobile visual verification remains incomplete because browser automation stalled during resize.

## Outcome and fixed boundaries

PMC, Sub-Vendor, individual Labor/Material and combined In-house previews run automatically on valid opening and after a 300 ms typing pause. Normal footers contain Close; a current failure offers Retry calculation. Loading stays inside the simulator, inputs remain usable, and obsolete results disappear immediately on edits.

Preserve backend amounts, formulas, paise units, validation, permissions, opening snapshots, UOM identity/precision, temporary-only edits, the Sub-Vendor Final total presentation and PMC's existing breakdown. Combined In-house results must update or clear both the panel and its external temporary summary together. No backend, persistence, dependency, migration, commit, push or deployment work is included.

## Implementation approach

Use one small feature-local hook for the lifecycle shared by the two simulator implementations. It coordinates the typing delay, local loading phase, cancellation, request generations and explicit retry; it does not contain financial formulas or component-specific validation. Keep each simulator's request construction, accepted-result validation and presentation in its current component.

The parent establishes and documents the hook interface before assigning consumer writes. The interface must support a stable input/context key, valid-request eligibility, asynchronous calculation with an AbortSignal, immediate invalidation from input handlers, settling of validation after the typing pause, current-result/error state, retry and a guarded callback for the external combined summary. Callbacks or newly created parsed objects must not become accidental request triggers. The key includes raw editable values and context, so an invalid intermediate edit still invalidates an earlier request even if two later values normalize to the same payload.

Expose optional `signal` and `showGlobalLoader` controls through `previewKnowledge`, passing them through the already-capable API client. Preserve the default behavior of unrelated preview callers. Automatic calls set `showGlobalLoader: false`. Abort superseded requests and retain a generation guard for transports/mocks that resolve after cancellation. No broad shared API-client source change is expected.

## Tasks and ownership

### 1. Capture baseline and confirm integration contract — parent

After execution is authorized, record `git status --short`, the relevant per-file diffs and exact pre-edit contents, including currently clean targets. The current worktree has 49 modified tracked files plus earlier task documents. Preserve all preceding changes; do not stage, revert or reformat unrelated work.

Reconcile current code with the approved spec, enumerate every manual simulator consumer, and settle the hook/transport interface and component ownership. Share that contract with all writers. This is the first parent task in progress; later parent tasks start only after its completion.

Acceptance: AC1–AC6 have explicit owners; dirty targets are understood; snapshots, financial response guards and external In-house result lifecycle are recorded as invariants.

### 2. Implement shared lifecycle and preview transport — parent; depends on task1

Own:

- New `frontend/src/features/ai-estimator-knowledge/useAutomaticKnowledgeCalculation.ts` and its `.test.tsx`.
- `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts` and `knowledgeApi.test.ts`.
- `frontend/src/api/client.test.ts` only if an additional real transport check is needed to demonstrate signal/global-loader behavior; preserve its current source API.

Implement one 300 ms schedule for valid opening and edits, immediate cancellation/invalidation, local waiting/loading/error state, validation settling, current-input retry and cleanup. Guard success, failure, finally and external result callbacks against obsolete generations. Closing/unmounting cancels work without erasing a previously successful retained external summary merely because cleanup ran. Invalidating an edited combined preview still clears that summary immediately.

Use deterministic timer/deferred-response tests for 299/300 ms, rapid typing, valid→invalid→valid, successive requests resolved out of order, late failure, unmount, context changes, callback rerenders, Strict Mode cleanup and retry without loops. Verify default preview transport behavior and explicit signal/loading options. Publish the tested interface before tasks3/4 consumer implementation begins.

Acceptance: AC1–AC4 and AC6; hook performs no arithmetic and introduces no global loading side effects.

### 3. Convert shared Mode simulator — frontend owner1; depends on task2

Own only:

- `KnowledgeModeCalculationSimulator.tsx`.
- `KnowledgePmcCalculationSimulator.test.tsx`.
- `KnowledgeSubVendorCalculationSimulator.test.tsx`.
- `KnowledgeModeCalculationEditor.test.tsx`.

Integrate automatic previews for PMC, Sub-Vendor, individual Labor/Material and the existing generic Mode path. Remove Calculate, prevent form submission side effects, show automatic-update guidance and local statuses, and offer Retry calculation only after a current failure. Clear old results synchronously on edits, settle input errors after the typing pause, and do not focus fields automatically. Keep current validators and server-branch normalization unchanged.

Adapt existing tests to arrange server responses before opening/editing and await an identifiable new automatic request or result. Do not replace meaningful button-driven tests with arbitrary sleeps or weaken request/value assertions. Include preview transport options in mock expectations. Preserve validation/malformed response, discount, Min./Max. basis, immutable opening snapshot, UOM, close/reopen and no-dirty/no-save coverage, plus the ₹23,076.92 example and PMC/Sub-Vendor presentation distinction.

Acceptance: AC1–AC5 for shared Mode contexts. The editor's existing snapshot/key implementation remains unchanged unless the parent identifies and assigns a necessary integration fix.

### 4. Convert combined In-house simulator — frontend owner2; depends on task2; parallel with task3

Own only `KnowledgeInHouseTotal.tsx` and `KnowledgeInHouseTotal.test.tsx`.

Integrate the same lifecycle for quantity, discount, markup basis and independent Labor/Material draft changes. Remove Calculate total and add local statuses/Retry calculation. Ensure an edit clears both result copies; a current accepted response updates both; a stale response or late failure changes neither. Preserve successful temporary-summary retention after close, reset on reopening, and clearing on configuration/UOM replacement.

Use the existing asymmetric Labor and Material fixtures so swapped/partial/stale components cannot pass accidentally. Verify opening, rapid edits, invalidity/recovery, current failure/retry, snapshot reset, close/unmount and results outside the panel. Preserve all calculation/discount checks and output labels.

Acceptance: AC1–AC5 for the combined simulator and external summary.

### 5. Update workspace integration coverage — parent; contract after task2, may run alongside tasks3/4

Own only `KnowledgeModeSectionStateRemoval.test.tsx` and `KnowledgeScreens.test.tsx` for these consumer changes. Parent also owns any test-only helper that becomes necessary; agree its interface before another writer consumes it.

Replace manual Calculate/Calculate total interactions with assertions on automatic requests and current results. Preserve save/discard, no accidental configuration writes, section switching, configuration/UOM loading, malformed responses and successful snapshot behavior. Arrange mocks for the automatic opening request before opening the panel so it cannot consume a later scenario's one-shot fixture. Keep application financial fixture values unchanged unless a test explicitly exercises a new input scenario.

Acceptance: AC2–AC5 at workspace level. The existing Mode-save/UOM cache fix remains intact. No unrelated workspace product edit is planned.

### 6. Integrate and review — parent, then integrity reviewer; depends on tasks3–5

Review the scoped diff against the captured baseline and run focused regressions to diagnose integration failures. Reconcile callback stability, input/context identity, immediately invalidated results, cancellation races, guarded external summary writes, local loading and safe error/retry semantics. Confirm there are no amount/formula/response-guard changes or hidden manual Calculate dependencies.

In Mode A, assign a read-only `integrity_reviewer` the completed diff and AC1–AC5 after all writers finish. Resolve confirmed findings through the original owners; no overlapping writes. In Mode B, perform this review inline. Do not broaden into unrelated backend finance audits.

### 7. Final verification and handoff — parent and verification runner; depends on resolved task6

In Mode A, a `verification_runner` runs the integrated command set below after review fixes; the parent can independently perform synthetic browser QA without writing product sources. In Mode B, perform both inline. Keep final results tied to the final diff; repeat only checks invalidated by subsequent changes or unresolved failures.

Inspect desktop and mobile automatic opening/editing, pending input usability/focus, error/retry and shortened result presentation using local synthetic responses. Include at least one rapidly superseded request, the Sub-Vendor example and the combined external summary. Capture/inspect screenshots when tooling permits, check for horizontal overflow and console/API errors, and run rendered accessibility checks. Stop task-owned servers and keep temporary evidence outside tracked source. Bound browser retries; prior mobile font waits stalled, so report an incomplete mobile check precisely rather than claiming a pass.

Acceptance: AC6 with evidence for AC1–AC5. Record exact commands/results, modified paths, remaining warnings/unrun checks and any automation limitation in this plan. No application-data mutation or external action is authorized.

## Execution and parallel boundaries

Dependency order: **task1 → task2 → (task3, task4, task5) → task6 → task7**.

In Mode A, parent owns shared lifecycle/transport first, then delegates task3 and task4 to separate native frontend implementers while handling task5. Every writer is told that others share the worktree, receives explicit paths/invariants, and must preserve prior changes. Review and final verification occur after writers finish. In Mode B, perform all tasks inline without implementation subagents. Do not spawn agents or implement before the user selects the execution mode. Additional source paths require explicit parent assignment; no shared-file ownership by multiple concurrent writers.

## Verification commands

Run from `frontend/` after integration:

```sh
npm test -- src/features/ai-estimator-knowledge/useAutomaticKnowledgeCalculation.test.tsx src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/api/client.test.ts src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm run typecheck
npm run build
```

Run `git diff --check` and `git status --short` from the repository root and compare against the task baseline. Source-specific focused tests may run during implementation; the final command set runs on the integrated result. Test counts from prior tasks are not evidence for this task. There is no lint script. Full backend/replica/OCR suites are unnecessary unless the implementation unexpectedly changes those contracts; frontend broadening is driven by changed consumers or unresolved failures.

## Progress

- Specification: approved.
- Task plan: approved.
- Execution mode: A — parallel sub-agents.
- Task1: complete; baseline at `/tmp/lisno-automatic-calculation-baseline`.
- Task2: complete; lifecycle/API wrapper15 tests and API client21 tests passed. Parent also owns `KnowledgeSimulatorDiscountField.tsx`: its existing over-limit shortcut showed errors immediately, so error visibility now follows the settled validation flag.
- Tasks3/4: complete; separate Mode153-test and combined In-house20-test checks passed. All writers finished.
- Task5: complete; workspace/lifecycle assertions now await automatic requests and retained totals.
- Task6: integrated nine-file suite passed 322 tests; independent integrity review found no blocking issues. Financial response validation and result rendering are preserved.
- Task7: final verification runner confirmed typecheck/build and repository hygiene passed, reusing the passing integrated suite because no product edits followed it. Desktop automatic opening/editing, abort/retry/focus and external combined summaries verified using synthetic transport. Mobile resize/interaction call stalled and was bounded/terminated; no mobile pass claimed.

## Integrated evidence

- All nine planned test files passed: lifecycle 8, API wrapper 7, API client 21, Mode editor 18, PMC 61, Sub-Vendor 74, combined In-house 20, Mode lifecycle 45 and workspace 68; **322 total**, 32.90 seconds. No test count from earlier work was reused.
- Independent read-only integrity review verified debounce/generation guards, abort cleanup, effect dependencies, current-error retry, snapshots, external combined summaries and unchanged financial response guards. No blocking findings; no dedicated suspended-render test was performed.
- Desktop 1280×720 with synthetic local transport: Sub-Vendor opened automatically at quantity1, ₹15,000 base and35% Lisno margin, displaying **₹23,076.92** with no Calculate button. Screenshot inspected; the Final total layout is retained.
- A deliberately delayed quantity2 request was aborted after editing quantity3. Quantity retained focus and remained enabled; Close stayed enabled during calculation. Quantity3 displayed **₹69,230.77**. A synthetic service failure for quantity4 displayed Retry calculation; retry used quantity4 and returned **₹92,307.69**. Transport recorded one aborted request.
- Combined In-house synthetic asymmetric costs displayed **₹1,550.22** on opening. Editing quantity2 immediately removed both result copies, then displayed **₹3,100.43** in both; the accepted summary remained after closing. Synthetic responses validate UI behavior only; arithmetic is covered separately by preserved regression fixtures/guards.
- Desktop evidence: `/tmp/lisno-automatic-calculation-final/desktop.png`, `desktop-report.json`, `combined-report.json` and `browser-setup.js`. Input changes occurred only in the local synthetic workspace; no configuration save or real data mutation was performed.
- Mobile390×844 resize/interaction attempt stalled and was terminated. No returned mobile result or screenshot exists; **mobile visual verification is incomplete**. Earlier mobile failures involved font/screenshot waits, but the current resize stall did not provide a more specific cause.
- Baseline preserved at `/tmp/lisno-automatic-calculation-baseline`; scoped diff and changed paths at `/tmp/lisno-automatic-calculation-final/followup.patch` and `paths.txt`. Expected changes are 12 existing frontend files and two new feature-local hook/test files. Prior backend and unrelated frontend work remains untouched.
- Final `npm run typecheck`, `npm run build`, `git diff --check` and `git status --short` all exited0. Logs are in the evidence directory. Build emitted a chunk-size warning (main JS approximately1,486.39 kB; gzip408.10 kB). The passing Mode lifecycle authoritative minimum-margin validation test emitted unwrapped React update/unawaited async-act warnings; these were recorded, not suppressed.
- Task-owned Vite server stopped and browser logs moved to the evidence directory. Browser close also stalled after the mobile timeout, so tab closure could not be confirmed. No runtime artifacts remain as new untracked repository paths; generated build files remain ignored.
- No backend/full-repository/OCR/replica test run was needed; no lint script exists. No dependencies, migrations, application-data writes, staging, commit, push or deployment were performed.

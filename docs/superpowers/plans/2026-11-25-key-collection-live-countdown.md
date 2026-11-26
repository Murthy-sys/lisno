# Live key-collection countdown: task plan

Date: 2026-11-25
Status: Complete; implemented and verified in Mode A.

Approved specification: [Live 48-hour key-collection countdown](../specs/2026-11-25-key-collection-live-countdown-design.md). User approved on 2026-11-25.

## Outcome and boundaries

Display the confirmed appointment countdown as **48:00:00 remaining → 47:59:59 remaining**, updating every second from the saved deadline. Reuse the existing server-adjusted clock. Preserve confirmation, chosen dates, overdue/received/completed states, and both kickoff prerequisites.

This is a localized frontend change. The backend already saves confirmation plus 48 hours. No API, deadline, schema, dependency, migration, production mutation, or Internal Kickoff timer change is needed.

## Tasks and ownership

| Task | Owner and affected paths | Dependency | Criteria |
| --- | --- | --- | --- |
| 1. Capture current baseline | Primary: dirty paths, affected-file snapshots/diffs, focused handoff tests | Approved plan and execution choice | AC1–AC6 prerequisites |
| 2. Update timer presentation | Primary: `frontend/src/features/workflow/DesignerHandoff.tsx`; existing timer style only if visual verification requires it | 1 | AC1–AC5 |
| 3. Update regression coverage | Frontend implementer in Mode A, primary in Mode B: `DesignerHandoff.test.tsx` | 1 and agreed display contract | AC1–AC5 |
| 4. Review and verify | Primary: integrated diff, focused tests, typecheck/build, synthetic browser checks, documentation | 2 and 3 | AC1–AC6 |

Mode A permits tasks 2 and 3 to run in parallel on separate files. Mode B performs them sequentially. Preserve existing dirty work; writers must not revert others' changes. Primary owns integration decisions and any narrowly necessary synthetic QA fixture edits. Keep one parent phase in progress: preparation, implementation, then verification.

## Implementation contract

- Convert the existing duration calculation from minute precision to second precision. Format total hours, minutes, and seconds with at least two digits; do not reduce hours modulo 24.
- Positive remainder: `HH:MM:SS remaining`. At the deadline: `00:00:00 · Due now`. After the deadline: `Overdue by HH:MM:SS` using a nonnegative duration.
- Keep the persisted `deadlineAt`, server/receipt-time anchor, and existing one-second interval. Derive elapsed time from the clock so delayed ticks, remounts, and refreshed responses cannot restart the window. Do not introduce an independent 48-hour state counter or a second interval.
- Keep the due date/time in Asia/Kolkata. Chosen-date appointments use their actual saved deadline with the same formatting.
- Keep unavailable timing states explicit. Received/completed states suppress the timer. Preserve the timer's accessible name and use `aria-live="off"` so screen readers are not interrupted each second.
- Do not change scheduling mutations, authorization, version/idempotency handling, or kickoff dependencies.

## Focused regressions

- Confirm no timer before saved confirmation, including failed confirmation; preserve scheduling request/version tests (AC2).
- Assert exact `48:00:00`, then `47:59:59` after one second and the next second afterward in Client and Designer presentations (AC1, AC5).
- Update the existing server-time/remount regression to seconds. Cover refreshed anchors and a jump in elapsed time without replaying every tick; verify no reset and interval cleanup (AC3).
- Verify the minute/hour boundary, exact deadline, overdue increment, chosen date, invalid deadline/server clock, and received/completed messages (AC4).
- Assert accessible timer naming/live-region behavior and check readable desktop/mobile layout (AC5).

## Verification

From `frontend/`:

```sh
npm test -- src/features/workflow/DesignerHandoff.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx
npm run typecheck
npm run build
```

Run additional focused suites only if an affected integration or fixture requires them. Use the existing isolated QA transport, with a narrowly scoped synthetic appointment fixture if necessary, to inspect Client and Designer timers at desktop and mobile widths. Observe two consecutive seconds and verify the saved deadline survives a workflow refresh. Check keyboard/accessible timer semantics, overflow, and application/network errors. Do not confirm a real Client appointment for testing.

Finish with `git diff --check`, `git status --short`, and baseline comparison. Record exact check results and any pre-existing warnings. Full unrelated/backend suites are unnecessary for the presentation change; there is no repository lint script.

## Handoff and cleanup

Report changed files, verification results, remaining limitations, and temporary screenshot/log paths. Stop only the QA processes started for this task. No commit, push, deployment, database mutation, or customer communication is included. Preserve all prior uncommitted work.

## Execution record

- Specification approved.
- Task plan approved; user selected Mode A.
- Baseline captured at `/private/tmp/lisno-key-countdown-20261125`; focused baseline passed (31 tests, 2 files).
- Primary owns seconds display and browser QA; parallel frontend implementer owns handoff regressions.
- Integrated verification completed. Only `DesignerHandoff.tsx`, `DesignerHandoff.test.tsx`, and this task's specification/plan changed from the captured baseline. No existing files were removed.

### Implementation and regression evidence

- Reused the existing one-second server-adjusted clock and saved appointment deadline; changed duration formatting to total hours, minutes, and seconds. Added explicit due-now text and quiet timer semantics (`aria-live="off"`). No scheduling, backend, stage deadline, or kickoff prerequisite changes.
- `cd frontend && npm test -- src/features/workflow/DesignerHandoff.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx`: **41 tests passed across 2 files**, exit 0. Coverage includes Client/Designer ticks, failed/saved confirmation, minute/hour rollover, refreshed server anchors, remounts, delayed ticks, due/overdue, chosen dates, invalid data, received/completed states, and interval cleanup.
- `cd frontend && npm run typecheck`: passed, exit 0.
- `cd frontend && npm run build`: passed, exit 0. Existing Vite bundle-size warning remains; the main JavaScript bundle is approximately 3.52 MB before compression. No dependencies or lockfiles changed.
- `git diff --check`: passed. Baseline comparison and final status captured under the verification artifact directory.

### Rendered browser evidence

- Used the isolated enterprise QA page on loopback port 5189. A browser-only synthetic transport overlay supplied a saved appointment and workflow stage. No fixture source file changed and no real appointment was confirmed.
- Client confirmation activated by keyboard: no appointment timer beforehand; then **48:00:00 remaining → 47:59:59 remaining → 47:59:58 remaining**. The synthetic confirmation was recorded once.
- Navigating away and reopening preserved the exact deadline; reopening after the query became stale continued at **47:58:29 remaining**, without resetting the 48-hour window. Component tests separately verified refreshed server anchors and delayed ticks.
- Designer presentation using the same saved deadline changed **47:57:31 remaining → 47:57:30 remaining**.
- Inspected Client and Designer handoff screenshots at **1440 px and 390 px**. Countdown and due date remained readable, with no document overflow, application errors, or unexpected synthetic API requests.
- Client full-page axe scans reported **0 violations** at both widths. Designer full-page scans reported existing `color-contrast` findings in project-header metadata and `heading-order` on the unchanged handoff heading; these elements/styles were unchanged from the task baseline. No finding targeted the changed timer. Axe also logged preload-asset warnings in the synthetic fixture. This task does not claim whole-page accessibility conformance.

### Artifacts and limits

- Temporary baseline, incremental diffs, screenshots, and verification logs: `/private/tmp/lisno-key-countdown-20261125/`. Generated build output remains ignored under `frontend/dist/`.
- The owned QA browser/server were stopped and task-created Playwright logs moved out of the repository. Existing development services were left running.
- No backend or unrelated full-suite rerun was needed for this presentation-only change. No repository lint script exists. No commit, push, migration, database mutation, deployment, or external communication was performed.

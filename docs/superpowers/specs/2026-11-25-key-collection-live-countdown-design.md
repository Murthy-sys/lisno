# Live 48-hour key-collection countdown

Date: 2026-11-25
Status: Approved; implemented and verified in Mode A.

## Goal

After the Client confirms **Within 48 hours of confirmation**, show a visibly ticking countdown in the **Your designer / Key collection appointment** section: **48:00:00 remaining**, then **47:59:59 remaining**, updating every second.

## Current behavior and evidence

- `backend/src/services/design-workflow-state.service.ts` already saves the confirmation timestamp and a deadline exactly two calendar days later for `within_48_hours`. The saved appointment is the source of truth.
- `frontend/src/features/workflow/DesignerHandoff.tsx` already advances a server-adjusted clock every second, but formats the result as rounded hours/minutes (`48h 0m remaining`). Consequently, the visible text changes only once per minute.
- `projectWorkflowApi.ts` records receipt time alongside `serverNow`, allowing cached/remounted views to account for elapsed time.
- The top-right **Internal Kick off** timer comes from `ProjectWorkflowProgress.tsx` and measures that workflow stage. This request is interpreted as making the confirmed key-collection appointment countdown visibly tick; it does not replace the Internal Kickoff stage deadline.

## Scope and constraints

Localized frontend countdown presentation and focused regression coverage. Extend the existing shared handoff component used by Client, Designer, and internal workflow views. No new timer service, dependencies, backend/API/schema change, migration, or new deadline is needed.

Preserve the earlier explicit requirement that both Internal Kickoff and Client Kickoff must be completed before key collection. The appointment countdown continues while those tasks are pending.

## Requirements

1. Start displaying the appointment countdown only after successful Client confirmation is reflected in the saved workflow. Failed confirmation, assignment alone, or an unsaved radio selection must not start it.
2. Format remaining time as total hours, minutes, and seconds (`HH:MM:SS`). Keep 48 hours as `48:00:00`, rather than converting it to two days. Pad each segment to at least two digits.
3. Refresh the visible display every second using the existing server-adjusted clock and persisted `deadlineAt`. Account for elapsed time; do not decrement a fresh local 48-hour counter or write every tick to the server.
4. Reload, remount, workflow refetch, and returning from a background tab must continue from the saved deadline. If time has already passed since confirmation, show the actual remainder instead of restarting at 48 hours.
5. At the deadline show `00:00:00` with a due state; afterward retain an explicit overdue state with an increasing `HH:MM:SS` duration. Avoid negative or invalid clock text.
6. Stop the active countdown when keys are received or collection is completed, keeping the existing received/completed messages.
7. A Client-chosen date/time uses its saved deadline with the same seconds display; never replace it with a new 48-hour window. Keep the saved due date/time visible in Asia/Kolkata.
8. Missing or invalid timing data must show the existing unavailable state. Preserve the timer's accessible name and `role="timer"`; avoid announcing every second through a live region. Keep the text readable on mobile.

## Risks and invariants

- Minute rounding must be replaced with second-level formatting without extending the actual deadline.
- A workflow refresh can change the clock anchor; it must not restart the appointment or create duplicate intervals.
- Timing is presentation derived from persisted server data. Assignment, confirmation idempotency, kickoff gates, immutable original deadlines, and authorization remain unchanged.
- Existing handoff files are uncommitted prior work. Capture and preserve their current contents before implementation.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | A confirmed 48-hour appointment visibly changes from `48:00:00` to `47:59:59` after one second. | Fake-clock rendered component regression and synthetic browser observation |
| AC2 | No countdown before successful confirmation; failed confirmation creates none. | Existing scheduling tests with focused assertions |
| AC3 | Refresh/remount and elapsed background time preserve the deadline and correct remaining duration. | Server/receipt-time and lifecycle regressions |
| AC4 | Due, overdue, chosen-date, invalid-data, received, and completed states display correctly. | Focused timer-state regressions |
| AC5 | Client and Designer presentations remain readable and accessible. | Rendered role checks and desktop/mobile browser inspection |
| AC6 | Focused tests, frontend typecheck/build, and repository hygiene checks pass. | Record exact commands/results in the task plan |

## Open decisions

None. This specification targets the key-collection appointment timer shown below the workflow stages in the screenshot.

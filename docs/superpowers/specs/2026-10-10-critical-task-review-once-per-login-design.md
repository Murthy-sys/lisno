# Critical task review once per login

Date: 2026-10-10 (Asia/Kolkata)
Status: Implemented and verified locally

## Goal

Stop the “Daily critical tasks” alert from reopening after “I have reviewed this list.” Automatically show a current, recipient-scoped task review at most once after each successful login, and only if the signed-in user has relevant open work.

## Current behavior and evidence

- `frontend/src/features/messages/DailyCriticalTasksPrompt.tsx` opens whenever a returned digest has no `acknowledgedAt`. It does not check `items.length` and has no login-level presentation guard.
- The query polls every 30 seconds and refetches on focus. `NotificationProvider.tsx` also invalidates it on daily-critical stream events.
- Successful acknowledgment closes only the manual-open flag and invalidates the query; it does not independently suppress automatic opening.
- `backend/src/services/daily-critical-tasks.service.ts` backfills daily receipts and `pickReceipt` selects the oldest unacknowledged receipt. After one receipt is acknowledged, the next read can return another unacknowledged date. The backend outage/backfill test explicitly demonstrates this sequence.
- Digest creation and current digest availability are tied to the 5 PM India-time schedule. A login-only review must be able to inspect current assigned work before 5 PM without fabricating a scheduled delivery.
- `authorizedItems` already limits content to authorized projects, open critical chat actions for which the actor is responsible, and overdue incomplete workflow tasks assigned to that actor. Reuse these rules.
- The frontend acknowledgment API currently declares a full `DailyCriticalTasks` response, while the server returns only `{localDate, acknowledgedAt}`. Correct this local typing when integrating the review, without changing the existing server acknowledgment response.
- `AuthProvider.tsx` distinguishes successful login/session establishment, restoration and logout. Its internal render/request generation is not a persistent login identity; existing token/session-version values must not be treated as an explicit login counter.

These are code findings, not a claim that the screenshot's production receipt records were inspected. The worktree contains unrelated changes; the initial dirty-path inventory is saved at `/tmp/lisno-critical-review-initial-status.txt`.

## Scope and assumptions

- This request applies to the pictured critical-task review. “Notifications” here means its existing open critical actions and overdue assigned tasks, not every ordinary message or inbox notification.
- Keep current role and permission eligibility. Do not introduce this internal-team popup for Clients or roles lacking the relevant chat permissions.
- “Once after every login” means one automatic eligibility check per successful authenticated browser session. Navigation, component remounting, page reload, focus changes, polling, stream events and date rollover are not new logins.
- A successful login later on the same day is a new opportunity to show unresolved work. A previously acknowledged daily receipt must not suppress that new-login review if relevant work remains.
- A successful empty result consumes that login's automatic check. Work arriving later remains accessible through existing notifications and the manual Critical tasks action; it must not force another popup in the same login.
- Preserve task state, notification read state, assignments, permissions, chat hours, daily schedule, existing acknowledgment history and audit semantics. No redesign or changes to other alert types.

## Recommended approach

Use a small browser-session presentation guard and a current authorized review read, separate from the existing chronological daily receipt queue. This directly satisfies the requested login behavior while preserving historical receipts.

Changing only the daily receipt selector or bulk-acknowledging old dates would neither enforce once-per-login presentation nor correctly handle empty lists and pre-5 PM logins. A new persistent server-side login-review ledger would require broader session/schema changes than this request needs.

### Current review data

- Expose a current-review read alongside the existing daily digest endpoints, returning current authorized items, the check timestamp/timezone and an optional existing receipt reference for acknowledgment. A suitable route is `GET /daily-critical-tasks/current`; it remains an internal, personal `chat.read` operation.
- The read is independent of the 5 PM cutoff, does not create or backfill delivery receipts, and must use authenticated repository snapshot access and the established recipient/project checks.
- A receipt reference, if present, identifies an actually existing applicable receipt. Never invent a date or acknowledge unseen historical receipts in bulk.
- Return an empty item list for no relevant work. Loading or failure is not an empty success.
- Keep the current daily digest, scheduler, stream signal and acknowledgment endpoint compatible. Synchronize types, runtime validation where applicable, OpenAPI and route-operation inventory for the current-review read.

### Login lifecycle and automatic opening

- Give successful session establishment an opaque presentation-session identity. Retain it through restoration/reload and reset it on a new successful login, logout or invalidated session. It is presentation metadata, never authorization.
- Bind presentation state to both current user and login. Do not add raw tokens, task titles, project names or notification content to storage or query keys.
- Record that the automatic check has been consumed after a successful current read and before opening a nonempty review. This prevents stale queries, multiple renders and old daily receipts from opening another alert.
- Preserve the consumed marker across route remounts and reloads. Coordinate same-login browser tabs so they do not each force the same review. If durable browser storage is unavailable, use a safe in-memory fallback and document the reload limitation.
- Do not show cached details while authentication or current access is uncertain. Abort/ignore requests and mutations from a previous identity or superseded login.
- A failed initial read may be retried safely, with at most one successful automatic display. Avoid an error-driven automatic dialog loop.

### Reviewing and reopening

- On “I have reviewed this list,” acknowledge an applicable unacknowledged receipt through the existing endpoint when one exists, then close the review. If no acknowledgment is due, close the current review without inventing a server receipt.
- Apply successful receipt metadata immediately; do not let an invalidated or late cached response reopen the dialog. Older receipts remain historical data and do not trigger further automatic prompts in this login.
- If acknowledgment fails, keep the same review available with a clear retry state; do not claim that a server acknowledgment succeeded or spawn another popup.
- Keep the manual Critical tasks action. It fetches current authorized content before opening, can be opened repeatedly by the user and does not rearm automatic presentation. An empty state is acceptable when the user opens it manually.
- Use current-review wording and current check time, avoiding the misleading “5 PM team review”/old receipt-date framing for a login-triggered review. Keep the existing compact dialog and keyboard/focus behavior.
- Reviewing is not completing a task, resolving a critical action or marking all notifications read.

## Invariants, compatibility and failure handling

- The backend alone decides item visibility and permission. A local presentation flag cannot grant access.
- Preserve immutable receipt audit history and idempotent acknowledgment. No destructive cleanup, seed, migration or backfill is part of this fix.
- Existing inbox alerts and the daily scheduler continue operating; only their ability to force this particular popup changes.
- Logging and diagnostics must not expose session tokens or task content. Existing error handling and audit records remain sufficient; no new external telemetry is required.
- Rolling back the UI restores the previous presentation behavior. The new read endpoint and local marker require no data migration; stored business records remain compatible.
- No new dependency is expected. No production changes, deployment, commits, pushes or customer communication are authorized by this specification.

## Acceptance criteria

1. Fresh login with authorized relevant work displays one current review; fresh login with no relevant work displays none, including when empty unacknowledged daily receipts exist.
2. Clicking the review button successfully closes the alert. Multiple missed daily receipts cannot cause consecutive alerts during the same login.
3. Polling, stream invalidation, navigation, remount, reload, focus changes and date rollover cannot automatically reopen it in that login. New successful login can show unresolved work once again, even on the same day.
4. A login before 5 PM can see current assigned critical/overdue work without creating a premature delivery receipt. No historical date is presented as today's review.
5. New work arriving after a successful empty login check does not force this dialog; existing notifications and manual review remain usable.
6. Manual review always uses a fresh authorized read. Empty, loading, error, acknowledgment retry and permission-loss states are coherent and do not reveal stale/foreign data.
7. Two different users and overlapping auth/query requests cannot share suppression state or task details. Same-login tabs are coordinated; reload persistence and storage failure behavior are tested.
8. Existing receipt history, task/notification state, scope rules and acknowledgment idempotency remain intact. The current-review read does not create receipts or business writes.
9. Focused backend current-review/authorization/receipt regressions and frontend login/prompt/notification regressions pass, along with affected typechecks/builds and diff checks. Rendered desktop/mobile interaction checks cover repeated acknowledgment, navigation/reload and keyboard behavior. Use replica-set tests only if transactional persistence implementation changes.

## Open decisions

No blocking product question is needed with the assumptions above. All approval gates completed; implementation and verification evidence are recorded in the [task plan](../plans/2026-10-10-critical-task-review-once-per-login.md).

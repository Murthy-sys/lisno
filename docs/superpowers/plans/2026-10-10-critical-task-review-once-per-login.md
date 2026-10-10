# Critical task review once per login: implementation plan

Date: 2026-10-10 (Asia/Kolkata)
Status: Complete; implemented and verified locally
Specification: [Critical task review once per login](../specs/2026-10-10-critical-task-review-once-per-login-design.md)
Specification approval: received in this conversation.
Task-plan approval: received in this conversation.
Execution mode: A, parallel sub-agents, selected in this conversation.

## Outcome and boundaries

Show current authorized critical actions and overdue assigned tasks at most once per successful browser login, only when the initial successful check contains items. Preserve manual review, daily receipt history, notification delivery, task status, permissions and chat hours.

No dependency, database migration, receipt cleanup, seed, deployment, commit, push or customer communication is included. Keep only one parent phase in progress. Do not start product edits before task-plan approval and execution-mode selection.

## T1. Baseline and integration contracts

Owner: primary engineer. Dependency: approved plan and execution mode. Covers AC1–9.

- Recheck the current worktree and capture the dirty-path inventory plus relevant target contents/diffs under `/tmp/lisno-critical-review-once-per-login-2026-10-10/`. Preserve existing changes; the earlier inventory is `/tmp/lisno-critical-review-initial-status.txt`.
- Confirm the reproduction with several unacknowledged daily receipts and with an empty digest. Record the prior behavior in focused tests without mutating a running account.
- Settle this additive read contract before parallel writers begin:

```ts
interface CurrentCriticalTaskReview {
  timezone: "Asia/Kolkata";
  checkedAt: string;
  items: readonly DailyCriticalTaskItem[];
  receipt: { localDate: string; acknowledgedAt: string | null } | null;
}

interface DailyCriticalAcknowledgment {
  localDate: string;
  acknowledgedAt: string;
}
```

- `GET /daily-critical-tasks/current` returns `{data: CurrentCriticalTaskReview}` with `Cache-Control: no-store`. It is a personal internal-team `chat.read` operation with the existing actor/project rules. Empty work returns `items: []`, not an error or unavailable historical digest.
- Select the most recent already-created, already-due receipt, if any, from the same authenticated snapshot. It is only an optional acknowledgment reference. Do not create a receipt, run `ensureDue`, backfill, bulk-acknowledge older dates or use receipt status to decide automatic presentation.
- Preserve existing endpoints and the actual `{localDate, acknowledgedAt}` acknowledgment response. Primary owns additive types in `backend/src/contracts/daily-critical-tasks.ts` and `shared/chat/dailyCriticalTasks.ts`, plus `projectChatApi.ts` current-read/acknowledgment typing.
- Settle the frontend session-helper contract with the frontend owners: an opaque presentation-session ID available only after authenticated session establishment/restoration, a current-session check, and an asynchronous atomic “consume automatic review check” operation returning whether this caller won. This marker carries no authority or task content.
- A successful explicit login creates a new marker even if credentials/session-version are unchanged. Restoration retains the same marker; an existing session without a marker initializes one once. Bind restoration to the accepted current account/session without persisting another raw token or using tokens in query keys. Use available browser synchronization for cross-tab creation/claim; storage-event delivery alone is not an atomic claim.

Exit: current baseline, agreed types/lifecycle and disjoint ownership are recorded. Share these contracts with every writer.

## T2. Implement independent slices

After T1, the following three slices can run in parallel in Mode A. In Mode B, implement them sequentially inline. Every writer must be told that others are working in the repository and that unrelated changes must be preserved.

### T2A. Authorized current-review endpoint

Owner: backend implementer. Covers AC1, AC4, AC6, AC8–9.

Owned areas:

- `backend/src/services/daily-critical-tasks.service.ts`
- `backend/src/routes/daily-critical-tasks.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/openapi/project-chat.ts`, and `backend/src/openapi.ts` only if required by inventory wiring
- `backend/tests/chat-hours-and-daily-critical-tasks.test.ts`, a focused current-review test if useful, and `backend/tests/fixtures/project-chat-route-operations.ts`

Work:

- Add a snapshot-only current-review method reusing `authorizedItems`, existing authentication and internal-team rules. Capture one check time and return an existing due receipt reference or null.
- Wire the authenticated route, canonical operation and OpenAPI schema. Preserve the legacy scheduled digest, scheduler, signals and acknowledgment behavior.
- Test pre-5 PM reads, empty results, multiple missed dates, already-acknowledged latest receipts and stale sessions. Use two users/projects with unequal assignments to prove recipient isolation, responsible-person checks and current project authorization.
- Verify the read produces no receipt, audit, task, notification or other business write. Preserve existing idempotent acknowledgment and missed-delivery tests.

Do not modify auth-session issuance, repository persistence schemas or frontend contracts. Return any unexpected dependency to the primary engineer.

### T2B. Presentation-session lifecycle and atomic review marker

Owner: frontend session implementer. Covers AC3, AC5, AC7, AC9.

Owned areas:

- `frontend/src/auth/AuthProvider.tsx` and `AuthProvider.test.tsx`
- A focused `frontend/src/auth/loginReviewSession.ts` helper and its test
- `frontend/src/api/client.ts` and `client.test.ts` only if cleanup integration genuinely requires them; agree that change with the primary first

Work:

- Establish the opaque presentation-session identity only after successful authenticated session acceptance. Preserve generation checks, cache cleanup and superseded-login protection.
- Retain identity across restores, reloads and route remounts; rotate on explicit successful login and clear/invalidate on logout or expired authentication. Old async operations must not clear a newer user's marker.
- Persist only bounded presentation metadata. Implement an atomic same-login claim across tabs so one successful automatic check is consumed once, including an empty result. Failed network checks do not consume it.
- Notify subscribers when another tab consumes the check or the session changes. Do not broaden existing authentication behavior or treat the marker as security enforcement.
- When durable storage is unavailable, use a non-throwing in-memory fallback, document its reload/cross-tab limitation and keep manual review usable. Do not block login on presentation-storage failure.
- Test repeated login for the same user, restore, reload, cross-tab contention, different users, logout/session expiry, failed login, superseded responses, StrictMode and storage failure. Verify no sensitive token or review content is persisted in the new records.

Do not edit the task prompt, chat API or backend. Share the settled helper exports before the prompt owner integrates.

### T2C. Once-per-login prompt and manual review

Owner: frontend prompt implementer. Covers AC1–7, AC9.

Owned areas:

- `frontend/src/features/messages/DailyCriticalTasksPrompt.tsx` and its test
- `frontend/src/features/messages/dailyCriticalTasks.css` only for a necessary small state/layout correction

Work:

- Use the new current-review read and login identity. Key query state by an opaque session scope and current user; require existing role/permission eligibility and current authentication.
- Perform the automatic check once per login. After a fresh successful result, atomically consume the marker before deciding to open; only the winning caller with a nonempty result opens. A successful empty result consumes the opportunity without a popup.
- Keep automatic visibility separate from receipt acknowledgment, query invalidation and manual visibility. Poll/focus/stream events and older receipts must not rearm it. Avoid unnecessary background polling when the review is closed.
- Submit acknowledgment only for an existing unacknowledged receipt. Immediately apply its successful metadata and close; if none is due, close locally. Do not resolve tasks or mark notifications read. On failure retain one retryable review without falsely acknowledging it.
- Keep manual Critical tasks available. Fetch current authorized content before opening; show a manual empty state if appropriate. Do not display cached details during an uncertain or denied read.
- Guard query/mutation callbacks against logout, user change, new login and unmount. Known access loss clears visible content.
- Replace 5 PM/old receipt-date framing with a current task-review label and check time. Preserve the existing compact layout and accessible dialog, button and focus behavior.
- Test receipt backlog, empty first read, new work later, stale post-ack reads, failure/retry, manual reopen, session changes and late responses. Cover close/return-focus and keyboard operation.

Do not edit auth helpers, shared contracts, generic notification delivery or backend. Request shared integration changes from the primary.

## T3. Integrate and verify complete journeys

Owner: primary engineer. Dependency: T2A–C finished. Covers AC1–9.

- Inspect all writer diffs against the captured baseline and reconcile types, route inventory, auth-helper lifecycle and prompt state transitions.
- Own any necessary shared inventory/API-doc tests, frontend auth fixtures, `NotificationProvider` regression fixtures and operational documentation. Do not remove the daily-critical stream event or change unrelated inbox alerts merely because automatic prompt presentation is now independent.
- Verify the exact reported flow: multiple historic pending dates, one nonempty login review, successful acknowledgment, then polling/invalidation/navigation/reload with no repeat. Verify empty login, later incoming work, manual viewing and a second explicit login.
- Use actual components with synthetic authorized fixtures for rendered desktop and narrow mobile checks. Exercise two same-origin tabs, storage failure, account switch and keyboard focus. Do not seed data or use customer accounts for QA.
- If a shared contract or auth behavior differs from the approved design, resolve the discrepancy before final review; do not introduce an unrelated authentication refactor.

## T4. Independent integrity review and corrections

Owner: `integrity_reviewer` in Mode A; primary inline in Mode B. Dependency: integrated T3 result.

Review recipient authorization, absence of writes in the current read, existing receipt/history invariants, session boundaries, cross-tab atomicity, successful empty-check handling, stale responses and immediate acknowledgment closure. Confirm no other notification mechanism is suppressed and no secret enters presentation metadata.

Assign only confirmed corrections to their existing owners and recheck. Stop all product writers before final verification.

## T5. Final verification and handoff

Owner: `verification_runner` in Mode A; primary inline in Mode B. Dependency: T4 clear.

Run focused regressions first, then the following integrated lane. Add any newly introduced focused test file to these commands.

```sh
# backend/
npm test -- tests/chat-hours-and-daily-critical-tasks.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/auth/AuthProvider.test.tsx src/auth/loginReviewSession.test.ts src/auth/LoginPage.test.tsx src/auth/AuthRouteState.test.tsx src/api/client.test.ts src/api/authorization-contract.test.ts src/features/messages/DailyCriticalTasksPrompt.test.tsx src/features/notifications/NotificationProvider.test.tsx src/features/notifications/notificationStream.test.ts src/test/fixtures/enterpriseTransport.test.tsx
npm run typecheck
npm run build

# repository root/
git diff --check
git status --short
```

If repository-backed transactional persistence changes, also run `backend/tests/daily-critical-receipts.replica-set.test.ts` and any affected auth integration tests. Do not weaken transactions for a standalone fixture. There is no repository lint script; do not claim lint was run.

Trace every acceptance criterion to test/browser evidence. Record exact commands, counts, exit codes, warnings, unrun checks and storage fallback limitations. Keep logs/screenshots in the task-specific temporary directory; stop only task-owned QA processes. Report affected files and no migration, production action or deployment. Mark complete only after integrated verification passes.

## Execution record

Specification and task plan approved; Mode A selected. T1 baseline and target copies are saved under `/tmp/lisno-critical-review-once-per-login-2026-10-10/`. Initial product targets were clean; the existing untracked specification and plan were preserved.

T1–T3 implementation/integration is complete. Backend current-review contract, login marker lifecycle, and prompt presentation were implemented by disjoint owners. Primary integrated API/inventory tests and the enterprise transport fixture. Independent integrity review identified cross-tab replacement recovery cases; the session owner corrected successful and abandoned-login paths, and the reviewer cleared all findings. The final actual-browser cross-tab rerun passed on the corrected code. No unrelated work was changed.

Browser QA uses the actual AuthProvider, login helper and prompt with synthetic API responses, never customer accounts. Desktop 1440×900 and mobile 390×844 checks passed with zero dialog axe violations. Keyboard acknowledgment returns focus. Acknowledgment, invalidation, remount, reload, repeated same-token login, empty initial reads, later work, manual refresh, denied reads and acknowledgment retry passed. Two actual tabs showed one automatic popup, recovered manual review after an external login, and switched accounts without stale task details. Blocked metadata storage retained same-loaded-app suppression and manual access. Final integrated command results are recorded below. The final cross-tab rerun used the corrected AuthProvider; all product writers stopped before final regression execution.


### Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| AC1 | Backend current-review empty/recipient tests; prompt empty/nonempty tests; rendered empty-login journey. |
| AC2 | Prompt backlog and immediate acknowledgment-cache test; rendered acknowledge, failed-save retry and manual reopen. |
| AC3 | Helper explicit-login/restore/atomic-claim tests; prompt invalidation/focus/remount tests; browser reload, same-token login and two-tab journey. |
| AC4 | Backend pre-5 PM and due-boundary tests; current check timestamp replaces historical date in the dialog. |
| AC5 | Prompt and browser empty-then-new-work case; manual review still fetches current work. |
| AC6 | Prompt manual-freshness, denied read, failed acknowledgment and session-loss tests; browser retry and keyboard return-focus checks. |
| AC7 | Two unequal backend recipients/projects; helper separate-tab claims; provider late-response and split-publication/abandoned-login tests; real-browser account switch and blocked-storage checks. |
| AC8 | Backend explicit no-write operation guard and stored-state equality; five legacy scheduled receipt/chat-hours cases retained. |
| AC9 | Final regression commands and build results recorded below; actual desktop/mobile dialog axe checks report no violations. |

Operational behavior and fallback limits: [Critical task review](../../operations/critical-task-review.md).


### Final verification record

- Backend T5 command: 5 files, 172 tests passed, exit 0. The local Supertest socket checks required a sandbox-permitted rerun. A stale route-count assertion exposed on the first permitted run was updated to the new 368-operation manifest before the passing run.
- Frontend T5 command (including the new helper and enterprise transport): 10 files, 241 tests passed, exit 0. The broad synthetic fixture lacked the existing basket-request list read; it now returns an empty synthetic page. No related product behavior was changed.
- Two non-failing LoginPage MSW warnings remain for synthetic project-status and design-workflow reads; these unrelated test handlers were not changed.
- Browser journey commands: Playwright CLI `run-code --filename journey.js` and `run-code --filename tabs.js`, exit 0. Final tabs run was repeated after the terminal-recovery correction. No browser runtime errors or dialog axe violations. Task-owned browser and Vite server were stopped.
- Logs and screenshots: `/tmp/lisno-critical-review-once-per-login-2026-10-10/verification/` and `/tmp/lisno-critical-review-once-per-login-2026-10-10/visual/`.
- No full repository suite, OCR suite or live customer-account testing was performed. Replica-set integration tests were not required because no repository/transactional persistence implementation changed. There is no lint script.
- No dependencies, lockfiles, migration, database cleanup, seed, commit, push, deployment or external customer communication.

- `backend/ npm run typecheck` and `npm run build`: exit 0, no build warnings.
- `frontend/ npm run typecheck` and `npm run build`: exit 0. Vite reports chunks above 500 kB (main bundle 2,572.49 kB, gzip 704.87 kB); bundle restructuring is outside this fix.
- Root `git diff --check` and `git status --short`: exit 0. No unrelated dirty paths or runtime artifacts were added to the worktree.

T1–T5 complete. Independent integrity review cleared all findings. Implementation is locally verified and has not been deployed. The storage/locking fallback limitation in the operations note remains the only limitation of the once-per-login persistence guarantee.

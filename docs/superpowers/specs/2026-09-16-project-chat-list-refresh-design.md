# Project conversation-list request scheduling

Date: 2026-09-16  
Status: Implemented and locally verified; existing autonomous Mode A authorization retained

## Goal and evidence

Reduce repeated `GET /api/v1/project-messages?limit=30&offset=0` requests without breaking realtime delivery in the open conversation. Starting worktree at `d50c1b5` is clean. No production credentials or customer records are needed.

`ProjectConversationList.tsx` polls every 15 seconds. `ProjectChatLayout` keeps it mounted when CSS hides the list below 1024 pixels. The provider's independent 10-second stream-recovery poll also invalidates the list. The stream reports live on connection and again on the server's initial state frame, causing redundant provider refreshes. The list endpoint performs membership resolution/counting across candidate projects; repeated requests have real backend cost.

## Scope and decisions

Keep the existing API, authorization, project-scoped SSE and message cursor contracts. Change frontend request scheduling only. An account-wide stream would permit immediate updates across every unopened conversation, but requires a separate authorization and transport design; it is outside this bounded fix. Removing all list reconciliation would leave other projects stale while the user remains in the list.

Use a visible-only 60-second conversation-list reconciliation interval, preserving actual project-event/mutation refreshes, focus/reconnect refresh and the explicit refresh button. This reduces idle visible polling from four requests/minute to one; hidden lists start no automatic requests. Keep the current 10-second fallback for the open project's data when streaming fails, but do not let it independently refetch the whole list. Typing, heartbeat comments and non-resync empty cursor batches must not refresh the list. Duplicate live status notifications must not repeatedly invalidate queries; preserve one reconciliation after genuine reconnection. No migration, new dependency, deployment or production mutation is included.

## Acceptance criteria

1. A visible, idle list performs at most one periodic reconciliation per 60 seconds; no 15-second loop remains. Permission-denied list failures do not poll indefinitely.
2. A hidden document or CSS-hidden mobile list starts no new automatic list requests. Cached list state, pagination and scroll survive navigation/resizing. Revealing the list can refresh stale data.
3. Genuine message, issue, membership and own-read changes still refresh affected data promptly. Typing, heartbeat and empty non-resync batches do not.
4. Initial/repeated live notifications do not cause duplicate reloads; a real reconnect still reconciles once. Stream replay cursors and denial handling remain unchanged.
5. Stream-recovery polling checks open-project data without multiplying list requests. Background and offline behavior remains bounded.
6. Focused request-count/lifecycle regressions, rendered desktop/mobile interaction checks, frontend typecheck/build and diff hygiene pass. Existing unrelated baseline failures remain documented rather than rewritten.

## Risks and compatibility

Only the selected project has a realtime stream. Changes in other projects are discovered by the visible list's bounded reconciliation (up to 60 seconds), or by focus/reconnect/manual refresh. Open-chat delivery and typing remain realtime. A currently in-flight request may finish after visibility changes; the requirement prevents new hidden work. Backend authentication stays authoritative. Rollback consists of reverting this frontend-only scheduling change.

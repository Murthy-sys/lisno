# Conversation-list performance fix

Date: 2026-09-16  
Status: Complete; implemented and locally verified under the existing autonomous Mode A instruction  
Source: [Specification](../specs/2026-09-16-project-chat-list-refresh-design.md)

Initial worktree clean at `d50c1b5`. No deployment/commit is authorized.

## Tasks and ownership

1. Evidence/contracts (primary, complete): trace list polling, responsive mounting, provider fallback and SSE state. Independent backend audit confirms typing/empty batches need no list refresh; resync and durable events do.
2. Visible-list scheduling (frontend implementer): own `ProjectConversationList.tsx`, a focused visibility helper if justified, and its new request-count test file. Use the existing 1024-pixel breakpoint, document visibility, 60-second reconciliation, no background/denied polling and safe lifecycle cleanup. Preserve layout, pagination and manual refresh. Criteria 1–2, 5.
3. Stream/provider scheduling (primary, parallel with task 2): own `ProjectChatProvider.tsx`, `projectChatStream.ts` and their existing tests. Deduplicate live transitions and separate open-project fallback invalidation from whole-list refresh. Preserve real events, replay/denial, reconnect and typing behavior. Criteria 3–5.
4. Integrate and review (primary plus integrity reviewer after writers return): reconcile request counts, account/project isolation and responsive lifecycle; resolve confirmed findings.
5. Verify (verification runner after review): focused messages tests, frontend typecheck/build, rendered desktop/mobile request counts with synthetic fixtures, `git diff --check` and final status. No backend or OCR changes expected. Record exact evidence and unrun limitations here.

Parent stage: complete; implementation, integrity review and final verification finished. All agents preserve others' edits and remain inside explicit file ownership. Reuse current dependencies; no lockfile, permissions or backend API changes.

## Verification evidence

- Provider regression negative control reproduced duplicate live callbacks (4 list calls where 2 were expected) and stream-failure polling (5 where 2 were expected). Both now pass. Presence/cursor-only frames remain quiet while all four durable event types and empty resyncs refresh data.
- List scheduling has 12 focused tests, including 120-second idle request counts, hidden document/mobile cancellation of queued retries, stale reveal, 401/403/404 interval stop, manual refresh, pagination/scroll, offline/focus/reconnect and cleanup. Existing layout tests continue passing.
- Independent integrity review found no confirmed blockers. The stream parser and backend were unchanged; provider-level status deduplication is sufficient.
- Final `npm test -- src/features/messages`: 132/132 tests across 15 files pass. Frontend `npm run typecheck` and `npm run build` pass. Build retains the existing chunk-size warning. `git diff --check` passes. Exact results: `/tmp/lisno-chat-list-performance/verification-results.json`.
- Full unrelated frontend, backend and OCR suites are outside this scheduling-only scope and were not repeated. No dependencies, lockfiles, API contracts, migrations or permission rules changed. No commit, push or deployment was performed.
- Actual Chromium browser used intercepted synthetic HTTP responses on a loopback Vite server; no production session or records were used. With a visible desktop list, there were no periodic requests during the first 57.6 seconds; the next request occurred 60,013 ms after the settled initial fetch. The development StrictMode mount produced an initial aborted/restarted request pair, distinct from periodic polling. Desktop screenshot inspected with no horizontal overflow. At 390×844 the mobile conversation hid the list with display:none and showed zero list requests after a development-server connection reset remounted the page; returning to the list fetched once. Both mobile screenshots were inspected with no horizontal overflow. The development reset means these browser counters do not prove uninterrupted navigation persistence; that behavior is covered by the passing pagination/scroll and hidden-retry regression tests.

Browser screenshots and test logs are retained under `/tmp/lisno-chat-list-performance/`. Final browser validation used Chromium; other engines and production traffic were not exercised. No live Render deployment was performed.

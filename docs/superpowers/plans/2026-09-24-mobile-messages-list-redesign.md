# Mobile Messages list redesign — task plan

Spec: [2026-09-24-mobile-messages-list-redesign-design.md](../specs/2026-09-24-mobile-messages-list-redesign-design.md)
(approved; D1 = server-side filter and search, D2 = backend totals, D3 = sort menu, D4 = search by project name,
D5 = image thumbnails)

## Pre-flight facts

- The worktree has 63 dirty paths from earlier approved, uncommitted work. The target files below are **clean**,
  except `mobile/src/navigation/NavigationIcon.tsx` and `mobile/src/ui/tokens.ts`; check `git status` for tokens.
  Snapshot the status and the pre-edit copies before writers start.
- **Backend:**
  - `routes/project-chat.ts:28` defines `GET /project-messages` with `validateQuery(chatListQuerySchema)`.
  - `domain/project-chat.ts:32` holds `chatListQuerySchema`, which is strict and shared with
    `routes/notifications.ts:12`.
  - `services/project-chat.service.ts:80–112`:
    - `list`: Super Admin uses `tx.projectPage`, others use `tx.candidateProjectIds`, membership, then sort and
      slice.
    - `summary` (line 43) calls `tx.counts(projectId, userId, readSequence)`.
  - `repositories/project-chat.ts:172`, `ChatTransaction`: `counts` at line 204 and `messages(scan)`, with
    implementations in `project-chat-memory.ts` and `project-chat-mongo.ts:195,211`.
  - Contracts: `contracts/project-chat.ts` (`ChatConversation`, `ChatConversationPage`, `ChatFilter`).
  - Tests:
    - `project-chat.test.ts`, `project-chat-routes.test.ts`, `project-chat-repository.test.ts`
    - `project-chat-mongo.replica-set.test.ts`
    - `api-docs.test.ts`
  - `openapi.ts` documents the path.
- **Mobile:**
  - `features/messages/ConversationList.tsx`: the header at lines 40–70, and paging with `PAGE_SIZE` 30 through
    `/project-messages?limit=…&offset=…`.
  - `ConversationRow.tsx`: hard-coded hex colours.
  - `chatModel.ts`: `presentSummary` and `presentConversationPage` (around lines 380–445), which tolerate extra
    fields.
  - `chatQueryKeys.ts`: `conversations(scope)`.
  - `ChatIcon.tsx`: the messages icon set.
  - Tests: `ConversationList.test.tsx`, `chatModel.test.ts`, `chatQueryKeys.test.ts`.
  - The authenticated image preview is already used by the chat thread (see `ChatThread` and `MessageBubble` for the
    attachment preview download pattern).
- **Baselines:**
  - backend full suite: 4 known failures (design-workflow-initialization and 3 in full-journey)
  - mobile: only `contract-drift` fails
  - frontend: 17 known failures

## Shared contract (settled first by the primary in T1; both slices follow it)

- Query: `GET /project-messages?limit&offset&filter=all|unread|critical|important&search=<≤100 chars>`. It is strict:
  unknown parameters return 400.
- Response:

  ```ts
  {
    items: ChatConversation[],
    pagination,
    totals: { unread: number; critical: number; important: number }
  }
  ```

- Each `ChatConversation` gains:

  ```ts
  lastMessage: {
    id: string;
    author: { id: string; name: string };
    excerpt: string;          // at most 120 characters
    createdAt: string;
    attachments: { id: string; kind: ChatAttachmentKind; filename: string; hasPreview: boolean }[]; // at most 3; field names follow the existing ChatAttachment
    attachmentCount: number;
  } | null
  ```

- `totals` ignores `filter` and `search`.
  - `unread`: the number of conversations with `counts.unread > 0`.
  - `critical`: the sum of `openCritical`.
  - `important`: the sum of `openImportant`.
- Sort (D3) is client-side over the loaded pages: "Recent activity" (the server order) or "Unread first", which is a
  stable reorder. There is no server `sort` parameter.

## Tasks (dependency order)

### T1 — Contract types (primary)
- Owner: primary.
- File: `backend/src/contracts/project-chat.ts`. Add these types, all additive:
  - `ChatConversationFilter`
  - `ChatLastMessage`
  - `ChatConversation.lastMessage`
  - `ChatConversationTotals`
  - `ChatConversationPage.totals`
- Check: backend typecheck. Fix only type errors caused by the new required fields, by having the service produce
  them in T2.

### T2 — Backend: schema, service, repositories, and OpenAPI (spec A; AC4)
- Owner: **backend slice**.
- Depends on: T1.
- Files: `domain/project-chat.ts`, `routes/project-chat.ts`, `services/project-chat.service.ts`,
  `repositories/project-chat.ts`, `project-chat-memory.ts`, `project-chat-mongo.ts`, `openapi.ts`, and backend
  tests. Nothing in `mobile/` or `frontend/`.
- Work:
  1. Add `projectMessagesQuerySchema` for `/project-messages` only. `chatListQuerySchema` is untouched, so
     notifications still reject the new parameters.
  2. Add the repository method `lastMessage(projectId)`, returning the newest message with its author and first 3
     attachments plus the count, in both memory and Mongo, aligned. Build the excerpt as plain text with whitespace
     collapsed, mentions rendered as @Name, and a 120-character limit.
  3. Service `list`:
     - Build the full authorized set: Super Admin gets all projects through a non-paged variant or by iterating
       `projectPage`; other roles keep the existing membership path.
     - Compute `counts` per conversation, then `totals`.
     - Apply `search` (case-insensitive substring match on the project name), then `filter`, then the existing sort,
       then slice.
     - Build full summaries plus `lastMessage` only for the page.
     - Keep the Super Admin single-active guard.
     - Update the old "deferred counts" comment to match the new behaviour.
  4. OpenAPI: the parameters, `totals`, and `lastMessage`.
- Tests:
  - Routes: filter and search validation, and 400 for unknown parameters. `/notifications?filter=unread` still
    returns 400.
  - Service (memory):
    - `totals` across more than one page, with at least 2 unequal projects
    - each filter
    - search, including case-insensitivity
    - `total`/`hasMore` after filtering
    - `lastMessage` (truncation, mentions, attachments cap, `attachmentCount`, null when empty, no keys or URLs)
    - a non-member sees no conversation and no totals
    - Super Admin
  - Replica-set (`project-chat-mongo.replica-set.test.ts` or a new file): Mongo parity for `lastMessage`, filters,
    and totals, with the list timing logged.

### T3 — Mobile: data layer (spec B2, C, D; AC1–AC3)
- Owner: **mobile slice**.
- Depends on: T1 (the contract shape only). Can run in parallel with T2.
- Files: `chatModel.ts` (parse `totals` and `lastMessage` tolerantly, keeping items whose `lastMessage` is missing
  for old servers), `chatQueryKeys.ts` (include `filter` and `search` in the conversations key), and their tests.

### T4 — Mobile: UI (spec B–D; AC1–AC3, AC5, AC6)
- Owner: **mobile slice**.
- Depends on: T3.
- Files: `ConversationList.tsx`, `ConversationRow.tsx`, and `ChatIcon.tsx`. Add the glyphs search, list, paperclip,
  and close in the existing ChatIcon style. Also `mobile/src/ui/tokens.ts`, additive only: `lavender` and
  `lavenderSoft` tokens, plus any strong colours the avatar palette needs.
  - New `ConversationFilters.tsx`: the chips, with counts shown only when greater than zero, role tab, and the
    selected state.
  - New `ConversationSearchField.tsx`: 300 ms debounce, the clear button, and accessible labels.
  - New `ConversationSortMenu.tsx`: "Recent activity" and "Unread first". It follows the ProfileMenu or
    AttachmentOptionsSheet modal pattern.
  - New `ConversationThumbnails.tsx`: up to 2 authenticated preview thumbnails plus "+N", with a placeholder on load
    or error, hidden from screen readers.
  - Header: the title and subtitle, the search and list icon buttons. Remove the refresh button (keep
    pull-to-refresh) and the "Your project groups" row.
  - Row, per spec D1–D8:
    - the avatar palette is chosen from the project ID
    - time formats: "10:24 AM", "Yesterday", "Sep 16", "Sep 16, 2025"
    - the "Author: excerpt", "You: …" and "No messages yet" lines
    - the red unread badge, capped at "99+"
    - the attachment line
    - the priority dot
    - the inset divider
    - the full accessibility label
    - token colours replace the hard-coded hex values in the row
  - Empty states per filter and search. Changing the filter or search resets paging.
- Tests (`ConversationList.test.tsx`, plus new tests for the chips, search, row, and thumbnails):
  - counts hidden when 0
  - selecting a chip sends `filter`
  - search debounces and sends `search`
  - sort reorders
  - the row renders its variants
  - the badge shows only when unread, and caps at 99+
  - thumbnails use the preview operation
  - opening a conversation still works
  - the stale, error and denied states still work
  - 320pt width with large text

### T5 — Integration review (all AC)
- Owner: primary, plus `integrity_reviewer`-style checks.
- Depends on: T2, T4.
- Checks:
  - The request and response shapes match across backend and mobile.
  - Authorization invariants hold.
  - No keys or URLs are exposed.
  - Notifications are unaffected.
  - Only planned files changed compared with the snapshot, and the earlier dirty work is intact.

### T6 — Verification (AC7)
- Owner: primary.
- Depends on: T5.
- Backend:
  - focused: `npm test -- tests/project-chat*.test.ts tests/api-docs.test.ts`
  - `npm run typecheck`, then `npm test` compared to the baseline, then `npm run build`
  - the replica-set chat test
- Mobile: `npm run typecheck`, `npx jest src/features/messages`, then `npx jest` compared to the baseline.
- Frontend: `npm run typecheck`.
- `git diff --check`.
- Visual: the user checks in Expo after restarting the backend.

## Parallelism

- T1 runs first, inline.
- **T2** (backend slice: `backend/**` except `contracts/project-chat.ts` after T1) and **T3 plus T4** (mobile slice:
  `mobile/src/features/messages/**`, `mobile/src/ui/tokens.ts`) have disjoint files and run in parallel as two
  sub-agents.
- They are coupled only through the shared contract above.
- T5 and T6 run afterwards on the integrated result.

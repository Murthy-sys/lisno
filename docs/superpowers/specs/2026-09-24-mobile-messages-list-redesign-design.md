# Mobile Messages list redesign: search, Unread / Critical / Important filters with counts, and message previews — specification

Date: 2026-09-24
Status: Approved 2026-09-24 (D1 = server-side filter and search; D2 = backend totals; D3 = sort menu; D4 = project-name search; D5 = image thumbnails)
Classification: **Substantial.** It changes a mobile UI and makes additive changes to the `GET /project-messages` API
contract: new query parameters and new response fields for filters, totals, search, and the last-message preview.
Authorization is unchanged, but the preview exposes message content in a list, so it must obey the existing chat read
rules.

## Goal

Make the mobile Messages list match the user's reference "exactly":
- a "Messages / Project conversations" header with search and list icons
- a rounded search field
- filter chips **All · Unread · Critical · Important**, each showing a **count only when it is greater than zero**
- conversation rows that show:
  - a pastel initials avatar
  - the project name in bold
  - a one-line "Author: message…" preview
  - an attachment filename or up to two image thumbnails
  - the time on the right ("10:24 AM", "Yesterday", "Sep 16")
  - a red unread count badge

The user asked for "Unread, critical, important" instead of the reference's "Unread, Important, Files".

## Current behavior and evidence

- **Mobile list** (`mobile/src/features/messages/ConversationList.tsx` and `ConversationRow.tsx`):
  - The header has "Messages" and "Project conversations", plus a refresh button. Below it is a "Your project
    groups" row with a total.
  - There is no search and there are no filters.
  - Each row has a mint initials avatar, a 2-line project name and the time. Its second line is
    "N participants · Status", followed by `@mentions`, a green unread count, and a "Critical N" line.
  - Several colours are hard-coded (`#E5ECE9`, `#00855F`, `#A82936` and others), not theme tokens.
  - Infinite paging uses `/project-messages?limit=30&offset=…`.
- **Backend** `GET /project-messages` (`backend/src/services/project-chat.service.ts:80–112`):
  - It returns `{ items: ChatConversation[], pagination }`.
  - The query schema `chatListQuerySchema` (`domain/project-chat.ts:32`) is **strict** and accepts only
    `limit ≤ 50` and `offset`. It is **shared with `GET /notifications`**.
  - Each item has `counts { openCritical, openImportant, unread, unreadMentions }` and `lastMessageAt`.
  - There is **no last-message preview** (author, excerpt, attachments). Per-conversation counts are computed **only
    for the current page**; a code comment says this is deliberate so that off-page history is never counted.
  - Super Admin is paged at the database level; other roles are filtered by membership and then paged in memory.
- **Priority model:** messages have `priority: "normal" | "important" | "critical"` and `issueStatus: "open" |
  "resolved" | null`. The conversation counts `openCritical` and `openImportant` count **open issues**.
- **Attachments:** these existing operations serve images:
  - `GET /projects/:projectId/chat/attachments/:attachmentId/preview` (`chat.read`)
  - `GET /projects/:projectId/chat/attachments/:attachmentId/content`

  The chat thread already renders image previews through the authenticated transfer layer.
- **Mobile parser** (`chatModel.ts:presentConversationPage`) tolerates extra fields, so additive response fields are
  safe for older builds. The web app also consumes `/project-messages`, and additive fields are safe there too.

## Proposed behavior

### A. Backend: additive list contract (D1, D2)
1. `GET /project-messages` gets its **own** query schema, so notifications are unaffected:
   - `limit`, `offset` (unchanged)
   - `filter`: `all` (default) | `unread` | `critical` | `important`
   - `search`: trimmed, at most 100 characters, case-insensitive match on the **project name**
   - The schema stays strict: any other parameter returns 400.
2. **Filter semantics** (a conversation matches when):
   - `unread`: `counts.unread > 0`
   - `critical`: `counts.openCritical > 0`
   - `important`: `counts.openImportant > 0`

   Filter and search are applied **before** pagination, so `total` and `hasMore` describe the filtered set.
3. The response gains **`totals`**, computed across **all** conversations the actor is a member of (or, for Super
   Admin, can see). It ignores `filter` and `search`, so the chip counts are stable:
   - `unread`: the number of conversations with unread messages
   - `critical`: the number of **open critical issues** summed across conversations
   - `important`: the number of **open important issues** summed across conversations
4. Each conversation gains **`lastMessage`**, the newest message the actor can read in that conversation, or `null`:

   ```ts
   {
     id,
     author: { id, name },
     excerpt,        // plain text, whitespace collapsed, at most 120 characters, mention tokens rendered as @Name
     createdAt,
     attachments: [ // at most 3
       { id, kind, name }
     ],
     attachmentCount
   }
   ```

   - It contains no storage keys or URLs.
   - Images are loaded only through the existing authenticated `…/attachments/:attachmentId/preview` operation.
5. There are **no new route operations or permissions**: it is the same `GET /project-messages` with `chat.read`.
   OpenAPI documents the new parameters and fields, and runtime Zod stays authoritative.
6. **Performance:** `totals` and pre-pagination filtering need counts for every authorized conversation. This
   reverses the deliberate "counts only for the page" behaviour. The counts reuse the existing per-project count
   queries, bounded by the actor's conversation set. Replica-set tests seed at least two unequal projects and record
   the timing. If it is too slow, fall back as described in D2.

### B. Mobile: header and search
1. The header has "Messages" (large and bold) and "Project conversations" (muted). On the right are a **search icon
   button** ("Search messages", which focuses the field) and a **list icon button** ("Sort conversations", D3).
2. The search field sits below the header: a rounded 44pt field with a `surfaceMuted`/`primarySoft` fill, a search
   glyph, and the placeholder "Search messages".
   - It is debounced (300 ms) and sends `search`.
   - A clear (×) button appears when there is text.
   - Results: the empty state becomes "No conversations match" with a Clear action.
3. The "Your project groups · N" row is removed. Pull-to-refresh replaces the refresh button, and refresh stays
   available.

### C. Mobile: filter chips
1. There are four pill chips in a horizontally scrollable row: **All, Unread, Critical, Important**.
   - Selected chip: `primarySoft` fill with `primary` text.
   - Other chips: `surfaceMuted` fill with `inkMuted` text.
   - Chips are 36pt tall with a 44pt hit target.
2. **Counts** come from `totals` and are shown **only when greater than zero**, as a small inline pill after the
   label, for example "Critical 3":
   - Unread: `primary`
   - Critical: `danger`
   - Important: `warning`
   - All: no count
3. Selecting a chip sends `filter` and resets paging. Each chip is announced as a tab with its selected state and
   count, for example "Critical, 3".
4. Empty filtered states: "No unread conversations", "No open critical issues", and "No open important issues".

### D. Mobile: conversation row (matches the reference)
1. **Avatar:** a 52pt circle with two-letter initials. The pastel fill is chosen deterministically from the project
   **ID** out of a token palette: `primarySoft`, `warningSoft`, `infoSoft`, `dangerSoft`, `successSoft`, and a lavender
   token added to `tokens.ts`. The initials use the matching strong colour.
2. **Line 1:** the project name, semibold, 1 line with ellipsis. The time is on the right, small and muted: "10:24 AM"
   today, "Yesterday", "Sep 16" within the year, "Sep 16, 2025" otherwise.
3. **Line 2:** "{author}: {excerpt}", 1 line and muted.
   - It shows "You: …" when the author is the current user.
   - With no messages yet, it shows "No messages yet".
   - An **unread count badge** sits on the right: a red (`danger`) circle with a white count, shown only when unread
     is greater than 0 and capped at "99+".
4. **Line 3**, shown only when the last message has attachments:
   - **Images:** up to **2 rounded thumbnails** (about 72×56, radius 10), loaded via the authenticated preview
     operation, with a muted placeholder while loading or on error. Extra attachments are shown as "+N".
   - **Documents and other files:** a paperclip glyph plus the first filename in muted text, 1 line.
5. **Priority signal:** if a conversation has open critical or important issues, a small red or amber dot sits beside
   the time. This replaces the separate "Critical N" line. The participant count and status text are removed from
   the row.
6. **Divider:** a hairline divider is inset from the text column, as in the reference. There are no card
   backgrounds.
7. The whole row is one button. Its label is "{project}, {unread N unread,} {critical/important if any,} last
   message from {author}: {excerpt}, {time}". Thumbnails are hidden from screen readers. At large text sizes the
   time wraps under the name.
8. The selected state (tablet split view) and the disabled state are kept, with token-based colours.

### E. Unchanged
- Opening a conversation, the chat thread, realtime invalidation (`chat-changed`), paging, and the loading, error,
  denied and stale-warning states
- Back and the scaffold, the web UI, and notifications

## Scope and non-goals

- In scope:
  - backend: the `/project-messages` schema, service, repository counting, OpenAPI, and tests
  - mobile: `ConversationList`, `ConversationRow`, and `chatModel` parsing (`totals`, `lastMessage`), the chat
    query key, new glyphs (search, list, paperclip, close), and one lavender token
  - tests
- Non-goals:
  - searching message **contents**, since search matches project names only (D4)
  - a "Files" chip
  - a "mark all read" action
  - swipe actions
  - web UI changes
  - notification changes
  - changing which users can see which conversations

## Invariants

- Authorization is unchanged. `lastMessage`, `totals`, and filters only ever reflect conversations and messages the
  actor may already read through the existing membership rules.
- Stable IDs are used for keys, navigation, and the avatar colour. Names are only presentation.
- No storage keys or URLs are exposed. Images go through the existing authenticated preview endpoint.
- `GET /notifications` validation is unchanged.
- Older mobile and web clients keep working, because all changes are additive.
- The mobile UI never computes totals; it only displays server values.

## Risks

- **Performance** of the all-conversation totals and pre-pagination filtering, especially for Super Admin's global
  list. Mitigated by the measured replica-set test and the D2 fallback.
- **Exposing message excerpts in a list** could leak content if the membership check is wrong. Mitigated by
  asymmetric tests: a non-member sees no conversation, no totals, and no preview.
- **Search** matches project names only. The placeholder says "Search messages" as in the reference, so users may
  expect content search (D4).
- The web UI does not show these new fields yet.

## Acceptance criteria

- AC1: The header shows "Messages", "Project conversations", the search and list icons, and a rounded "Search
  messages" field. Typing filters by project name (server-side) and can be cleared.
- AC2: The chips are All, Unread, Critical, and Important. Each shows a count from `totals` only when it is greater
  than zero. Selecting a chip filters server-side, with correct `total` and paging. The empty filtered states are
  worded correctly.
- AC3: Rows show a pastel initials avatar (stable per project ID), the bold name, the time format, "Author: excerpt"
  (or "You: …" or "No messages yet"), the red unread badge only when there are unread messages, a paperclip plus
  filename, or up to 2 authenticated image thumbnails with "+N", and priority dots.
- AC4 (backend): `filter` and `search` are validated. Unknown parameters return 400. `totals` are correct across more
  than one page of conversations, with at least two unequal projects. `lastMessage` is correct and truncated, and
  contains no keys or URLs. A non-member sees nothing. Super Admin works. `/notifications` still rejects the new
  parameters.
- AC5: Opening a conversation, realtime refresh, pull-to-refresh, paging, and the error, denied, and stale states
  still work.
- AC6: Accessibility and layout: chips are announced as tabs with their counts, rows have full labels, thumbnails
  are hidden from screen readers, and nothing clips at 320pt or with large text.
- AC7 (checks):
  - backend focused tests, `npm run typecheck`, `npm test`, `npm run build`, and a replica-set test for
    filters and totals
  - mobile typecheck, the messages tests, and the full suite against the baseline
  - frontend typecheck, unchanged
  - `git diff --check`

## Open decisions

- **D1 — Where filtering and search happen.** *Recommended:* server-side (A1–A2), so counts and filtered lists are
  correct beyond the first 30 conversations. The alternative is client-side filtering over pages already loaded; it
  needs no backend change but is wrong once there are more than 30 conversations.
- **D2 — Chip counts.** *Recommended:* backend `totals` across all conversations, as defined in A3: Unread is the
  number of conversations with unread messages, and Critical and Important are open-issue counts. The alternative
  is to sum only the loaded pages, which is cheaper but can undercount.
- **D3 — The list icon (top right).** *Recommended:* it opens a small sort menu with "Recent activity" (the default,
  as today) and "Unread first". The alternative is to leave the icon out, keeping only search.
- **D4 — Search scope.** *Recommended:* search project names now. Searching message contents is a larger follow-up
  that needs an indexed backend search.
- **D5 — Image thumbnails.** *Recommended:* include them, with up to 2 per row loaded through the existing
  authenticated preview endpoint, matching the reference. The alternative is filename-only for all attachments,
  which is lighter on network use.

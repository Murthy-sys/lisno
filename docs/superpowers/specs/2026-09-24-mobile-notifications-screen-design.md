# Mobile Notifications screen redesign — specification

Date: 2026-09-24
Status: Approved 2026-09-24 (D1 = redesign for existing mention notifications; D2 = tap marks read and opens; D3 = SVG leaves)
Classification: **Substantial (UI only).** This is a new dedicated screen for one mobile destination, replacing the
generic workspace list for it. It keeps the existing API, permissions, realtime updates, and read-state mutation.
There are no backend changes, unless D1's alternative is chosen.

## Goal

Make the mobile Notifications screen (opened from the bell) look like the user's reference:
- a botanical header with "UPDATES", "Notifications", and the description
- notifications **grouped by Today, Yesterday, and Earlier**
- each notification a **rounded card** with a **tinted icon tile**, a **bold title**, a **two-line message**, a
  **time on the right**, and a **chevron**

## Current behavior and evidence

- **Route:** the bell pushes `/feature/notifications`. `mobile/src/app/feature/[featureId].tsx` renders
  `AdaptiveAppScaffold` (with `backPlacement="scaffold"`, which gives the "← Back") around the generic
  `FeatureWorkspace`.
- **Definition** (`mobile/src/features/workspace/featureDefinitions.ts:46`):
  - eyebrow "UPDATES", title "Notifications", description "Recent Lisno activity for your authorized work."
  - empty state "You’re all caught up."
  - endpoint `/notifications?limit=30&offset=0`
- **Generic list** (`FeatureWorkspace.tsx:112–170`): plain bordered cards showing `recordTitle` and `recordSubtitle`.
  For notifications it also renders `NotificationAction` below each card:
  - a "Read" label, or a "Mark as read" button that calls `PUT /notifications/:id/read`
  - an "Open conversation" button that goes to `/record/messages/{projectId}`
  - `NotificationRealtimeBridge` refetches on SSE `notifications` events, and pull-to-refresh is supported
- **Data:** this is the whole contract (`backend/src/contracts/notifications.ts`). Today **only chat mentions
  exist**, with `type` of `"chat.mention"` or `"chat.mention.oversight"`. Each item has:
  - `id`, `type`
  - `projectId`, `projectName`
  - `messageId`
  - `actor { id, name }`
  - `excerpt`
  - `createdAt`
  - `readAt | null`

  The page also carries `unreadCount` and `pagination`.
- **The reference's other categories don't exist in the backend:** Manager Assigned, Design Uploaded, Client
  Comment, Stage Approved, and Meeting Scheduled all need new server-side event producers (see D1).
- **Assets:** there is no botanical or leaf image asset in `mobile/assets`. Icons are custom `react-native-svg` line
  glyphs in `NavigationIcon.tsx`.
- **Theme tokens:**
  - `primary` `#3d4a32`, `primarySoft` `#e8eddf`, `accent` `#a9b89a`
  - `surface` `#fbfaf6`, `canvas` `#f6f4ec`, `border` `#d9dccf`
  - `ink`, `inkMuted`
  - `warningSoft` / `warning`, `infoSoft` / `info`, `successSoft` / `success`

## Proposed behavior

### A. Screen structure
1. The route is unchanged: `/feature/notifications` inside the scaffold. The scaffold's "← Back", the top bar, and the
   bottom bar are unchanged.
2. `FeatureWorkspace` delegates to a new **`NotificationsScreen`** when `destination.id === "notifications"`. That
   screen keeps:
   - the same query, endpoint, and query key, so cache invalidation (`notification-changed`, `chat-changed`) still
     works
   - the realtime bridge and pull-to-refresh
   - the loading, error or denied, and empty states
3. **Header:**
   - Eyebrow "UPDATES", in olive, letter-spaced.
   - Title "Notifications" in the page-title style.
   - The existing description in muted ink.
   - A **decorative botanical illustration** in the top-right: soft sage leaves drawn with `react-native-svg` using
     `accent` and `primarySoft` at low opacity, with no image asset (D3). It is hidden from screen readers and never
     overlaps the title's hit areas.
4. **Grouping:**
   - Section labels are "Today", "Yesterday", and "Earlier", in the muted semibold style, using the device's local
     date.
   - Empty sections are not shown.
   - Items are sorted newest first within each section.

### B. Notification card
1. A rounded surface card with radius 16, a `surface` fill, a hairline `border`, and a soft shadow. The minimum
   height is 72pt, with 12pt spacing between cards.
2. **Left:** a 48pt rounded-square **icon tile**, radius 14, with a tinted fill and a 22pt line icon. Types map to
   tiles like this; the map makes it easy to add new types later:

   | Type | Icon | Tile fill | Icon colour |
   | --- | --- | --- | --- |
   | `chat.mention` | chat bubble | `primarySoft` | `primary` |
   | `chat.mention.oversight` | chat bubble | `infoSoft` | `info` |
   | any unknown type | generic bell | `surfaceMuted` | `inkMuted` |

3. **Middle:**
   - **Title** is `projectName`, semibold ink, 1 line with ellipsis.
   - **Message** is 2 lines in muted ink: "{actor.name} mentioned you: {excerpt}". Oversight items read
     "{actor.name} mentioned a team member: {excerpt}".
   - Only server-provided fields are used; nothing is invented.
4. **Right:**
   - **Time**, top-aligned, in small muted text:
     - Today: "1:20 PM"
     - Yesterday: "Yesterday, 6:15 PM"
     - Earlier: "Sep 20, 2026"
   - A **chevron** in ink.
5. **Unread state** (`readAt === null`):
   - The title is bold, and there is a small 8pt olive dot before the time.
   - The card stays the same shape; there is no heavy highlight.
   - The accessible label includes "Unread".
6. **Tap (D2):**
   - Tapping the card marks the notification read (the existing `PUT /notifications/:id/read`, only if unread) and
     opens the conversation at `/record/messages/{projectId}`.
   - The inline "Mark as read" and "Open conversation" buttons are removed.
   - If marking as read fails, navigation still happens. The read state refreshes on the next refetch, and the
     failure is never shown as success.
7. **Accessibility:**
   - Each card is one button, labelled "{Unread, }{projectName}, {message}, {time}", with the hint "Opens the
     conversation".
   - Icons and the leaf art are hidden from screen readers.
   - Section labels are headers.
   - It works with large text: the time wraps under the title instead of clipping.

### C. Data
- There are no API or contract changes.
- The first 30 notifications are shown, as today. There is no infinite scroll in this change.
- Unknown `type` values render with the fallback tile, so the screen is ready when new types arrive.

## Scope and non-goals

- In scope:
  - the new `features/notifications/NotificationsScreen.tsx` and its presentation helpers (grouping, time format,
    type map)
  - new icon glyphs added to `NavigationIcon.tsx`: `chat` and `chevron`
  - a small delegation in `FeatureWorkspace.tsx`
  - removing the now-unused `NotificationAction` usage
  - tests
- Non-goals:
  - **new notification types**: Manager Assigned, Design Uploaded, Client Comment, Stage Approved, and Meeting
    Scheduled (D1)
  - backend changes
  - pagination or infinite scroll
  - swipe actions and "mark all as read"
  - the bell's unread badge
  - web UI

## Invariants

- Backend authorization is authoritative, and the screen shows only what `GET /notifications` returns.
- No manufactured content: every title, message, and time comes from server fields.
- Stable IDs are used: `id` for keys and mark-as-read, and `projectId` for navigation. Names are only presentation.
- The notification query key and invalidation are unchanged. Realtime refresh and pull-to-refresh still work.
- Only theme tokens are used, with no hard-coded colours outside the botanical SVG's token-based fills.

## Risks

- **The reference shows categories the system doesn't produce.** Users will see only mention notifications until
  D1's follow-up is done. The fallback tile keeps the screen stable.
- **Local-date grouping:** "Today" follows the device's time zone. The tests use a fixed clock and time zone.
- **Removing the inline buttons** changes how people mark items read: tapping now both reads and opens.

## Acceptance criteria

- AC1: The header shows UPDATES, Notifications, and the description, with a decorative botanical illustration in the
  top-right that is hidden from screen readers.
- AC2: Notifications are grouped under Today, Yesterday, and Earlier, newest first, and empty groups are hidden.
  Fixed-clock tests cover midnight boundaries.
- AC3: Each card shows the tinted icon tile for its type, the project name as the title, a two-line "{actor}
  mentioned you: {excerpt}", the time in the right format, and a chevron.
- AC4: Unread cards show a bold title and an olive dot, and are announced as "Unread".
- AC5: Tapping a card marks it read only if unread, then opens `/record/messages/{projectId}`. A failed mark-as-read
  still navigates and is not treated as success.
- AC6: Loading, error or denied (with Retry), and empty ("You’re all caught up.") states work. Pull-to-refresh and
  SSE refresh still refetch.
- AC7: At 320pt width and with large text, nothing clips and the time wraps.
- AC8: Mobile typecheck passes, the workspace and notifications tests pass, the full suite matches the baseline (only
  `contract-drift` fails), and `git diff --check` is clean.

## Open decisions

- **D1 — Notification categories.** *Recommended:* redesign the presentation now for the mention notifications that
  exist, with a type map ready for more. The alternative is a separate high-risk backend spec that adds the
  reference's categories (manager assigned, design uploaded, client comment, stage approved, meeting scheduled) as
  new event producers.
- **D2 — Tap behaviour.** *Recommended:* tapping the card marks it read and opens the conversation, and the inline
  buttons are removed, matching the reference. The alternative is to keep "Mark as read" and "Open conversation"
  buttons under each card.
- **D3 — Botanical art.** *Recommended:* leaves drawn in SVG with theme tokens, so no asset is needed. The alternative
  is for you to supply an image asset (PNG) of the leaf artwork, which is then used as is.

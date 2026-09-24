# Mobile Notifications screen redesign — task plan

Spec: [2026-09-24-mobile-notifications-screen-design.md](../specs/2026-09-24-mobile-notifications-screen-design.md)
(approved; D1 = existing mention notifications only, with a type map; D2 = tapping marks read and opens the
conversation; D3 = leaves drawn in SVG)

## Pre-flight facts

- **`FeatureWorkspace.tsx`** (clean in git):
  - The query is at lines 87–91. Its key is `privateQueryKey(requestScope(context, session), definition.family,
    destination.id, endpoint)`.
  - Loading is handled at line 93, and error or denied at lines 96–106.
  - The success `ScrollView` is at lines 112–170. It contains the header, `NotificationRealtimeBridge` (line 123),
    and the list, with `NotificationAction` at line 162.
- **`features/notifications/NotificationAction.tsx`** (clean) is the pattern for mark-as-read:
  - a `useMutation` that calls `runtime.api.authenticated.put("/notifications/{id}/read")`
  - on success, `invalidate("notification-changed")` through `useInvalidateEvent`
  - navigation to `{ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId:
    projectId } }`
- **`NavigationIcon.tsx`** already has uncommitted, approved work: the person, sign-out, and new-bell glyphs.
  `NavigationIconName` is exported.
- **Tokens:** `colors.primary`, `primarySoft`, `accent`, `surface`, `surfaceMuted`, `border`, `ink`, `inkMuted`,
  `info`, `infoSoft`, plus `radii`, `spacing`, `fonts`, and `typography` in `mobile/src/ui/tokens.ts`.
- **Baseline:** mobile typecheck passes, and the full jest run has only the known `contract-drift` failure.
- Snapshot `git status --short` and the pre-edit copies of the target files before writers start.

## Shared contract between slices

- `NavigationIcon` gains the glyph names `"chat"` (a speech bubble) and `"chevron"` (a right chevron,
  `M9 6l6 6-6 6`). The existing `"notifications"` glyph is the fallback icon for unknown types.
- `NotificationsScreen` props:

  ```ts
  { definition: FeatureDefinition; data: unknown; refreshing: boolean; onRefresh: () => void }
  ```

  `FeatureWorkspace` keeps owning the query and the loading and error states. The screen owns the header, the
  realtime bridge usage, grouping, the cards, the empty state, and tap handling.

## Tasks (dependency order)

### T1 — Icon glyphs (spec scope; AC3)
- Owner: **slice A**, the navigation icons.
- Files: `mobile/src/navigation/NavigationIcon.tsx` and `NavigationIcon.test.tsx`. Additive only; existing glyphs
  stay byte-identical.
- Add:
  - `chat`: `M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-1-2V6a2 2 0 0 1 2-2Z`
  - `chevron`: `M9 6l6 6-6 6`
- Test: both render, and both are hidden from screen readers.

### T2 — Presentation helpers (spec A4, B2–B5, C; AC2–AC4)
- Owner: **slice B**, the notifications feature.
- Can run in parallel with T1.
- File: `mobile/src/features/notifications/notificationPresentation.ts` (new) and its test. It contains:
  - `parseNotifications(data)`: turns `{ items }` or `{ data: { items } }` into typed items and skips malformed
    entries. It never invents fields.
  - `groupNotifications(items, now)`: returns Today, Yesterday, and Earlier by local date, newest first, with empty
    groups dropped.
  - `formatNotificationTime(createdAt, now)`: "1:20 PM", "Yesterday, 6:15 PM", or "Sep 20, 2026", using `Intl` or
    `toLocaleString` with `en-US` options.
  - `notificationTone(type)`: the type map from spec B2, with the fallback for unknown types.
  - `notificationMessage(item)`: the mention or oversight copy from spec B3.
  - `notificationAccessibilityLabel(item, now)`
- Tests use a fixed clock and cover:
  - the midnight boundary for Today and Yesterday
  - the year in Earlier
  - ordering, and malformed entries being skipped
  - unknown types
  - unread labelling

### T3 — NotificationsScreen and the botanical accent (spec A1–A3, B1, B5–B7; AC1, AC3–AC7)
- Owner: **slice B**.
- Depends on: T2, and T1's glyph names (it uses the agreed names; slice A delivers them in parallel).
- Files (new):
  - `features/notifications/NotificationsScreen.tsx`
  - `features/notifications/BotanicalAccent.tsx`: soft sage leaf paths in SVG using the `accent` and `primarySoft`
    tokens at low opacity. It is absolutely positioned top-right, has `pointerEvents="none"`, and is hidden from
    screen readers.
  - `NotificationsScreen.test.tsx`
- Behaviour:
  - A `ScrollView` with `RefreshControl`, and the header (eyebrow, title, description) over the accent.
  - `NotificationRealtimeBridge`: move the component from `FeatureWorkspace` into
    `features/notifications/NotificationRealtimeBridge.tsx` unchanged, and have both files import it from there.
  - Section headers use `accessibilityRole="header"`.
  - Cards follow spec B1–B5.
  - Tapping a card: if the item is unread, fire the mark-read mutation (on success, `invalidate("notification-changed")`;
    on error, do nothing visible). Then push the messages record route with `projectId`.
  - Empty state: `StateView` with the definition's empty message.
- Tests:
  - the grouped sections render
  - the card content and time
  - the unread dot and label
  - tapping an unread card calls PUT then navigates
  - tapping a read card navigates without PUT
  - a failed PUT still navigates
  - the empty state
  - the accent is hidden from screen readers
  - a 320pt width with large font scale renders without errors

### T4 — FeatureWorkspace delegation (spec A2; AC6)
- Owner: **slice B**.
- Depends on: T3.
- File: `features/workspace/FeatureWorkspace.tsx`, with minimal edits:
  - After the loading and error branches, when `destination.id === "notifications"`, return
    `<NotificationsScreen definition={definition} data={query.data} refreshing={query.isRefetching}
    onRefresh={() => void query.refetch()} />`.
  - Remove the notifications-only lines from the generic list, and import `NotificationRealtimeBridge` from its new
    file.
  - Delete `NotificationAction.tsx` only if nothing else imports it (check with grep). Otherwise leave it.
- All other destinations render exactly as before.

### T5 — Integration review (all AC)
- Owner: primary.
- Depends on: T1–T4.
- Checks:
  - The glyph names match.
  - The query key and invalidation are unchanged.
  - No hard-coded colours outside the tokens.
  - The diff against the pre-write snapshot touches only the files listed here.

### T6 — Verification (AC8)
- Owner: primary.
- Depends on: T5.
- `cd mobile && npm run typecheck`
- `npx jest src/features/notifications src/features/workspace src/navigation`
- `npx jest` compared to the baseline
- `git diff --check`
- Visual: the user checks the screen in Expo.

## Parallelism

- **Slice A** (T1, `mobile/src/navigation/NavigationIcon*`) and **slice B** (T2–T4,
  `mobile/src/features/notifications/**` and `mobile/src/features/workspace/FeatureWorkspace.tsx`) have disjoint
  files. They can run as two sub-agents.
- They are coupled only through the glyph names `chat`, `chevron`, and `notifications`.
- T5 and T6 run after both slices finish.

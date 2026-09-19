# Lisno mobile WhatsApp-style messaging redesign

Date: 2026-09-18
Status: Implemented; available-emulator verification complete, broader device certification recorded below
Classification: Substantial mobile UX and interaction redesign

## Goal

Redesign the Android project-conversation list and individual message thread around the familiar information hierarchy and interaction rhythm of WhatsApp while retaining Lisno branding, project context, permissions and backend contracts.

The result should feel like a purpose-built mobile messenger: compact conversation rows, clear unread and priority signals, incoming and outgoing bubbles, a fixed composer, fast reply and issue actions, stable scroll position, realtime arrivals and keyboard-safe behavior. It should faithfully adapt Lisno's existing web project-messaging shell, without copying WhatsApp trademarks or proprietary assets.

## Approved visual reference refinement

After task-plan approval and the Mode A choice, the user supplied the existing web **Project messages** list and **Villa** conversation as the exact visual reference. The Android implementation therefore follows that established messaging surface: white compact project rows; pale green initials avatars; neutral selected rows; muted gray headers; a warm patterned conversation canvas; white incoming bubbles; soft-green outgoing bubbles; compact author/role/time metadata; critical red pills; authenticated image previews; inline voice-note rows; and a pale fixed composer with attachment, emoji, importance, microphone and send controls. Mobile touch targets, safe areas, Back behavior and narrow-width composition remain native Android adaptations.

## Current behavior and evidence

- `mobile/src/features/workspace/FeatureWorkspace.tsx` renders `/project-messages` through the generic feature workspace. Every conversation is a large bordered card with only a generic title and chevron, even though the API already returns project status, participant count, last activity time, unread count, unread mentions and open issue counts.
- `mobile/src/features/workspace/RecordDetailScreen.tsx` wraps the conversation in a page-level `ScrollView`, shows a large **Back to conversations** button and leaves the global app header and phone tab bar visible.
- `mobile/src/features/messages/ChatConversation.tsx` renders every message as a full-width card. Author, timestamp, Reply and Raise issue are repeated as large controls. The composer, priority controls, attachment controls and send button appear after all messages, rather than remaining available at the bottom of the screen.
- The current thread already supports authenticated history, realtime invalidation, reply references, issue actions, read state, staged attachments, downloads, voice recording, idempotent message identity and permission-derived capabilities. These contracts must be preserved.
- The backend conversation list already supplies `project`, `counts`, `participantCount`, `lastMessageAt`, pagination and capabilities. The message response supplies stable message/author IDs, sequence, reply, attachments, priority, issue state, version and per-message capabilities. No fabricated preview or client-side permission decision is needed.
- The web messaging implementation already uses a WhatsApp-like shell, compact project rows, left/right bubbles, date and unread separators, fixed composer, cursor pagination, safe read-position rules and a new-message affordance. It is useful behavior evidence, but the Android implementation must remain native and touch-first.

## Recommended experience

Create a dedicated mobile messaging workspace rather than adding more conditions to the generic record-card renderer. Reuse the existing API, query isolation, realtime stream, transfer service, audio service and authorization snapshot. Split the feature into a conversation-list surface, a thread header, a virtualized timeline, message bubbles, an action sheet and a keyboard-aware composer.

The visual source of truth is Lisno's existing web project-chat implementation and the screenshots supplied by the user. The design uses its dedicated chat palette and flatter surfaces, compact rows and bubbles; it avoids the current oversized page heading, repeated bordered cards and full-width action buttons.

## Conversation-list screen

### Phone composition

- Keep the normal Lisno phone tab bar because Messages remains a root destination.
- Replace the large marketing-style heading with a compact messaging header containing **Messages**, the subtitle **Project conversations**, and an accessible refresh action.
- Render conversations as a continuous native list with subtle separators instead of individual rounded cards.
- Each row contains:
  - a deterministic initials avatar derived from the project name;
  - project name, limited to two lines;
  - last activity time formatted as time today and short date otherwise;
  - a secondary line using real available data: participant count and project status;
  - unread-message badge, unread-mention `@` badge and open-critical indicator when their backend counts are non-zero.
- Use the web messaging palette: neutral gray selection, green unread/mention signals, red only for open critical issues and near-black primary text. Read conversations stay visually quiet; unread conversations use stronger project-name/time weight.
- Pull to refresh remains available. Offset pagination becomes list continuation with a visible retry state; duplicate project IDs are reconciled without changing server ordering.
- Do not display invented last-message text. The current list contract has activity time and counts but no last-message preview.

### Expanded widths

- At 600 dp and above, show a deliberate two-pane layout: a 320–360 dp conversation column and a flexible thread pane.
- Keep the authorization-derived navigation rail outside the messaging workspace.
- Selecting a conversation updates the highlighted row and thread pane. With no selected project, the right pane shows a restrained project-conversation empty state.
- Preserve the conversation list's scroll/pagination state while moving between threads.

## Conversation thread

### Header and navigation

- On phones, opening a conversation uses an immersive thread surface: hide the global Lisno top bar and bottom root tabs for that route, then provide a compact thread header with Back, project initials, project name and participant count.
- On expanded widths, keep the rail and list pane. The thread header remains inside the right pane and does not duplicate global identity chrome.
- Fetch the existing project-chat summary for authoritative project name, participant count, issue counts and capabilities. Do not rely on a route label or list-row cache as the source of truth.
- Show a compact critical-issue indicator only when `openCritical` is non-zero. Refresh and secondary actions remain accessible through an overflow action rather than permanent large buttons.

### Timeline

- Replace the page `ScrollView` with a virtualized message list. Present history chronologically, opening at the newest available message.
- Incoming messages align left on white; the signed-in user's messages align right on the web shell's soft-green surface. Bubble width is bounded to approximately 86% on compact phones and 72–76% on wider panes.
- Consecutive messages from the same author group visually. Show the author label on the first incoming bubble in a group; do not repeat it on every bubble.
- Place timestamp and sent state inside the bubble footer. Use local time only; keep the original ISO timestamp available to accessibility and tests.
- Insert date separators and an **Unread messages** separator from the summary's `lastReadSequence`.
- Render priority and issue state as compact semantic chips inside the bubble. Critical and important colors remain distinct; resolved issues do not look active.
- Replies render as a quoted block inside the bubble. Attachments stay behind authenticated transfer APIs: images render an authenticated local preview plus original-file action, voice notes render a user-triggered inline play/pause waveform row, and other files show filename, kind/size and an accessible Open action.
- A tap selects a bubble and exposes a compact action sheet with capability-derived actions such as Reply, Raise issue or Manage issue. Essential actions do not require long press; long press may open the same sheet as a convenience.
- Load earlier messages with the existing cursor contract and preserve the visible anchor when older history is prepended.
- If a realtime message arrives while the user is near the bottom, keep the view at the latest message. Otherwise preserve reading position and show a **New messages** pill that returns to the bottom.
- Replace manual **Mark latest read** with safe automatic read acknowledgement from visible messages. Never advance across an unloaded unread-history gap; retain a retry/status message when acknowledgement fails.

### Composer

- Pin a keyboard-aware composer to the bottom safe area. The timeline consumes the remaining height and stays scrollable while the keyboard is open.
- Use one rounded expanding text input with attachment and voice controls plus a circular send action. When the draft is empty, the voice action is primary; when text or staged attachments exist, Send is primary.
- Keep priority selection available through a compact importance control instead of an always-visible radio group. Normal remains the default.
- Show reply context, selected/staged attachments, upload progress, recording state and recoverable errors in a tray immediately above the input.
- Preserve the current client message ID across a failed send so Retry remains idempotent. Generate a new identity only after the draft changes or the send succeeds, matching the existing contract.
- Keep attachment limits, MIME policy, recording duration, foreground interruption cleanup and staged-file cleanup authoritative from existing services.
- A read-only conversation hides composer controls and displays a compact permission message at the bottom.

## Issue actions

- Move raise/escalate/resolve/reopen/lower/clear controls into a modal bottom sheet or equivalent accessible overlay opened from the selected message.
- Continue using message `version` and a fresh idempotency key. A 409 closes no data silently: keep the sheet open, explain that the message changed and refresh the message before another action.
- Require the existing reason/resolution note for resolve, reopen, lower and clear actions.
- Do not expose actions absent from the backend-provided message capabilities or the authenticated `chat.issue` permission.

## State, routing and architecture

- Add a dedicated `MessagesWorkspace` under `mobile/src/features/messages` for the root list and expanded split view.
- Add a dedicated conversation screen/shell for the record route. The existing `/feature/messages` and `/record/messages/:recordId` paths remain valid so navigation and deep links do not break.
- Extend `AdaptiveAppScaffold` with a narrowly scoped immersive-phone option or equivalent message-owned composition. Other feature routes keep their current chrome.
- Parse conversation summaries and messages through typed mobile presentation adapters. Preserve author ID so outgoing bubbles are derived from `session.user.id`, never from display names.
- Use TanStack Query with environment/user/project-scoped keys. Conversation-list pages, chat summary and cursor message pages remain separate query families under the existing private query boundary.
- Realtime events invalidate only the relevant list/summary/history data. Access-denied events purge or stop the affected project stream and render a non-disclosing unavailable state.
- Draft, reply and staged-file state remain scoped to one environment, user and project for the mounted conversation. Switching project cannot carry text, priority, attachments or reply references into another thread.
- No backend route, persistence schema, authorization rule, notification contract or finance/workflow contract changes are required.

## Loading, empty, error and offline behavior

- Conversation list: skeleton rows on initial load; retained rows plus a compact warning on stale refetch failure; a project-specific empty state; non-disclosing denied state.
- Thread: header/timeline skeleton on initial load; retained history plus retry warning on refetch failure; explicit beginning-of-conversation and no-message states.
- Composer: preserve the draft when a send fails; show upload and send errors adjacent to the affected tray/item; prevent duplicate taps while the same mutation is pending.
- Realtime interruption does not erase history or draft. The existing stream reconnect/resync behavior remains authoritative and refreshes the relevant queries.
- Rotation, keyboard resize and expanded-width transitions retain the selected conversation, draft and a stable visible message anchor.

## Accessibility and responsive behavior

- All icon-only controls receive clear accessible names. Touch targets are at least 48 dp.
- Conversation rows announce project name, participant/status summary, unread count, mention count, critical count and activity time without requiring separate focus for decorative badges.
- Message bubbles expose author, content/attachment summary, priority/issue state and timestamp in a useful reading order. Decorative bubble tails and avatars are hidden from accessibility.
- New-message and send/error states use restrained live-region announcements. Realtime arrivals do not steal focus.
- Reply and issue sheets restore focus to the originating message/action after closing.
- Support 320 dp width, font scale 2.0, portrait, landscape, phone bottom insets, three-button navigation, tablet/foldable live resize and reduced motion. Large text may increase row/bubble height rather than clip controls.
- Keyboard navigation and hardware Back close the action sheet first, then dismiss reply/attachment transient UI where applicable, then return from thread to conversation list.

## Scope

In scope:

- Dedicated WhatsApp-style conversation list and thread layouts for Android.
- Phone immersive thread chrome and expanded two-pane messaging layout.
- Conversation badges, grouped incoming/outgoing bubbles, date/unread separators and bubble action sheet.
- Cursor-based older-history loading, realtime arrival behavior and safe automatic read acknowledgement.
- Fixed keyboard-aware composer with existing text, priority, reply, file, voice and send behaviors.
- Focused model, list, thread, composer, routing and accessibility tests plus rendered emulator verification.

Out of scope:

- Copying WhatsApp branding, green palette, proprietary icons, assets or exact pixel measurements.
- Backend changes to add last-message preview/search, delivery/read receipts, presence, reactions or deletion/editing.
- Mobile mentions UI, participant management, typing indicators, video playback or OS push notifications; these remain separate parity work.
- Changes to web messaging, authentication, permissions, storage schemas, API routes or production deployment.

## Assumptions and constraints

- “Similar to WhatsApp” means the familiar list/thread/composer interaction model, not feature-for-feature parity or a branded clone.
- Lisno supports one conversation per authorized project. There is no new-contact or arbitrary-chat creation action.
- Project initials are a deterministic visual fallback; no project photo is supplied by the current contract.
- The secondary conversation-row preview remains participant count plus project status until the backend deliberately exposes a safe last-message summary.
- Existing Expo/React Native dependencies are sufficient. Prefer React Native primitives, `FlatList`, `Modal`, Animated and existing services; no new chat UI package is expected.
- The existing dirty `mobile/` work and onboarding documents are preserved. Unrelated `.idea/` content remains untouched.

## Risks and handling

- **Read state skips unseen history:** acknowledge only viewable messages when there is no unloaded unread gap; preserve the backend sequence invariant and test asymmetric page boundaries.
- **Project data leaks across threads:** key every query, draft and transfer by environment, user and stable project ID; cancel and purge denied project work.
- **Realtime movement disrupts reading:** auto-scroll only near the bottom or after the current user's send; otherwise show the new-message pill.
- **Cursor pagination jumps:** capture the first visible message and offset before prepending, then restore it after layout.
- **Keyboard/composer covers messages:** use a dedicated flex layout, keyboard avoidance and safe-area padding rather than nesting the thread inside a page scroll.
- **Large text and compact height overflow:** allow header/row growth, cap only non-essential metadata lines and verify constrained portrait/landscape layouts.
- **Action discoverability:** provide tap-accessible actions with visible selected feedback; long press is optional, never the only route.
- **Large component regression risk:** split list, timeline, bubble, composer, issue sheet and presentation models so their state and cleanup can be tested independently.

## Acceptance criteria

1. The Messages root uses a compact continuous conversation list with project initials, name, real status/participant preview, last activity time, unread count, mention badge and critical indicator from backend data.
2. Conversation rows are no longer generic rounded record cards, and the screen remains a normal root tab with pull-to-refresh, loading, empty, stale-error, denied and pagination states.
3. Opening a thread on a phone presents a full-height messaging surface with compact Back/project header, virtualized timeline and composer fixed above the bottom safe area; the global top bar and root tab bar do not compete with the thread.
4. Expanded Android widths show conversation list and thread together with stable selection and list position.
5. Incoming and outgoing messages are distinguished by stable author ID, grouped into bounded bubbles and presented with author, timestamp, priority/issue state, replies and attachments without repeated full-width action rows.
6. Tapping or long-pressing a message opens capability-derived Reply/issue actions. The existing issue version, idempotency, note requirements, conflicts and authorization behavior remain intact.
7. The composer supports multiline text, reply cancellation, priority selection, file staging/upload/removal, voice start/stop/interruption, upload progress, errors and idempotent send/retry in a keyboard-safe compact layout.
8. Earlier history loads through backend cursors without visible jumps. Realtime arrivals preserve reading position unless the user is at the bottom, and a new-message control returns to the latest message.
9. Read acknowledgement advances only across safely viewed history and never skips an unloaded unread gap; failures remain visible and retryable.
10. Project switches, denial, logout and unmount clean up streams, recordings and staged attachments without carrying draft or private data into another project/environment/user scope.
11. Accessibility checks cover row summaries, bubble reading order, 48 dp controls, action-sheet focus restoration, live announcements, hardware Back and font scale 2.0. Rendered checks cover 320/360/412/600/800 dp, portrait, landscape and keyboard-open states.
12. Focused messaging tests, mobile typecheck, full mobile Jest, contract tests, Android export, arm64 debug build and installed-emulator interaction/visual smoke pass. No migration, dependency addition, deployment, publication, commit or production mutation occurs.

## Open decisions

The recommended scope keeps the backend unchanged. Conversation rows will use participant count and project status as their secondary preview because the existing list contract does not expose message text. Adding an actual last-message preview or server-side conversation search would require a separate backend contract and privacy review and is not included in this redesign.

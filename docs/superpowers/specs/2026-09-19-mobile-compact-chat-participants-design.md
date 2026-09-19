# Lisno mobile compact chat media and group participants

Date: 2026-09-19
Status: Implemented and verified (physical-device and TalkBack matrix pending)
Classification: Substantial mobile messaging UX and participant-management integration

## Goal

Make the Android project conversation materially denser while preserving accessible touch targets and truthful states:

1. Render audio messages as compact WhatsApp-style voice rows instead of tall attachment cards.
2. Replace the large Photo/Camera/File sheet with the smallest practical responsive chooser.
3. Let every authorized chat reader open project group information and see the current participants.
4. Let the active Super Admin add an eligible participant through the existing audited project-chat API. Any other actor whom the backend explicitly grants the same capability remains supported; the mobile UI never grants access from a displayed role label.
5. Refine delivered text, image and audio bubbles to use WhatsApp-like content-fit spacing, with an in-app image viewer opened by tapping the image instead of a visible **Open** button.
6. Remove the permanent per-message chevron and let an authorized sender swipe a message horizontally to select it as the composer reply target.

## Current behavior and evidence

- The supplied emulator screenshot shows audio-only messages occupying several times the height needed for one play/waveform/avatar row. In `mobile/src/features/messages/MessageBubble.tsx`, every attachment bubble is forced to 86% phone width; the audio container wraps, and the separate download control has a left margin that pushes it onto another line. The result is a large blank card around a small amount of content.
- The supplied attachment screenshot shows a nearly full-width bottom sheet with a drag handle, title, explanatory sentence, three bordered cards and large internal padding. `AttachmentOptionsSheet.tsx` deliberately builds that hierarchy even though the only decision is Photo, Camera or File.
- `ChatThread.tsx` already shows a project avatar, name and participant count, but the identity is static. Only the overflow menu can be opened, and it currently offers refresh only.
- Mobile parses `participantCount` and `canManageParticipants` from the chat summary, but it has no participant page/options model, query, group-information surface or participant mutation.
- The backend already exposes all required contracts:
  - `GET /projects/:projectId/chat/participants`
  - `GET /projects/:projectId/chat/participant-options?search=&limit=30`
  - `POST /projects/:projectId/chat/participants`
  - `POST /projects/:projectId/chat/participants/:selectionId/revoke`
- Backend membership resolution automatically includes the sole active Super Admin and makes that identity a selection manager. Participant search/add still requires `chat.participants.manage`, current project context and `canSelectChatPerson`; Client and Super Admin identities cannot be manually selected, and worker roles are eligible only for approved project trades.
- Participant addition already requires `{ userId, reason, idempotencyKey }`, emits an audit entry and `participants.changed` event, and returns a refreshed participant page. New selected participants can read existing conversation history under the established backend behavior.
- Backend responses redact membership sources and selection metadata from non-managers. Mobile must preserve that boundary rather than deriving administrative state locally.
- Focused baseline checks passed before this specification: `MessageBubble.test.tsx`, `AttachmentOptionsSheet.test.tsx` and `ChatThread.test.tsx` passed 3 suites and 18 tests.
- The repository remains intentionally dirty/untracked around `mobile/`, the current specs/plans and unrelated `.idea/` content. These paths must be preserved; no unrelated source may be reformatted or replaced.
- Follow-up screenshot evidence shows that short text messages still reserve more horizontal and vertical space than their content needs, adjacent bubbles need a small consistent transcript gap, image cards expose a redundant **Open** action even though the preview is already pressable, and voice-note bubbles still use fixed percentage/minimum widths (`84%` and `258 dp`) that create unused space.

## Follow-up bubble-spacing and media refinement

### Text and general message spacing

- Use content-fit bubbles for ordinary text messages, capped at the existing responsive maximum. Short messages such as “hi” and “hello there” must not expand to a card-like width.
- Keep compact WhatsApp-like internal spacing: approximately 7–9 dp horizontally and 4–6 dp vertically, with only the space required by sender, reply, body, priority and timestamp content.
- Preserve a small visible transcript gap: approximately 2 dp between messages in the same author group and 6–8 dp before a new group. Bubbles must neither touch nor appear as widely separated cards.
- Keep timestamps at the lower trailing edge without creating a large empty footer row. Priority and issue labels may require their own compact footer line when present.
- Do not reserve visible padding for message actions. The swipe refinement below removes the permanent overlay and retains non-gesture access through tap/long press and named accessibility actions.

### Image messages

- Remove the visible **Open** button from image attachments only. Document and other non-image attachments retain their explicit action when needed.
- The image preview itself is the primary 48 dp-or-larger action. Tapping it opens an in-app, full-screen image viewer using the authenticated local preview/original artifact.
- The viewer uses `contain` sizing, a dark neutral background, an accessible Close control, Android Back dismissal, loading and retry/error states, and no public or raw private URL.
- The preview should open immediately from the already-downloaded local preview when available, then use the authenticated original artifact when ready. Access denial follows the existing non-disclosing thread-access path.
- Filename and size metadata remain compact beneath the image when available; removing **Open** must also remove its reserved column and trailing whitespace.

### Audio messages

- Remove fixed percentage/minimum-width sizing that leaves blank space around voice notes. Use a compact content width appropriate to the 48 dp play control, short waveform/progress track, 36 dp avatar and timestamp, capped responsively on narrow screens.
- At normal phone text scale, an audio-only bubble should generally occupy about 220–260 dp rather than most of the transcript width. It may grow for sender, reply, caption, priority, errors or large text.
- Keep the existing 48 dp playback target, one-row control/track/avatar composition, single timestamp, lazy authenticated download, single playback owner and cleanup behavior.
- Do not reduce touch targets or clip content to achieve the smaller visual footprint.

## Swipe-to-reply refinement

### Current behavior and evidence

- Every message renders a permanent `⌄` action glyph in a 48 × 48 dp absolute overlay at its upper trailing edge. This adds visual noise, overlaps media space and forces extra author-line padding.
- Reply is currently available only after opening `MessageActionSheet`; `ChatTimeline` has no direct reply callback and `MessageBubble` has no horizontal gesture.
- `ChatThread` already owns the reply target and passes it into `ChatComposer`, so swipe-to-reply needs no backend, payload or persistence change.
- The application is already rooted in `GestureHandlerRootView`; however, the implementation may use the existing React Native responder/animation APIs when they provide more deterministic FlatList and test behavior without another dependency.

### Interaction

- Remove the visible per-message `⌄` glyph and its permanent overlay from every text, issue, image, document and audio bubble.
- A horizontal swipe in either direction may select the message for reply. Clamp visual travel to approximately 64–72 dp and commit only on release after about 52–56 dp, or after a clearly intentional horizontal fling with a smaller distance.
- Reveal a small reply indicator only while dragging. The message returns to its resting position after release; a successful gesture invokes reply exactly once.
- Ignore taps, long presses, horizontal movement below the intent threshold and vertical-dominant movement. Vertical transcript scrolling must win before a horizontal swipe activates.
- Preserve image taps, audio play/pause, document actions and text interaction. Starting a horizontal swipe may cancel the nested tap only after the gesture becomes intentional.
- Preserve tap/long-press access to the existing message-action sheet for issue actions and other commands; swipe bypasses the sheet only for Reply.
- Enable swipe reply only when the current thread can send. Read-only participants can still read and use any actions already authorized to them, but a gesture cannot manufacture reply permission.
- Selecting a reply uses the exact stable `PresentedMessage` already rendered. Existing project/session owner remounting clears the target on access, user, environment or project change.

### Accessibility and motion

- Because a swipe gesture alone is inaccessible, expose **Reply** and **Message actions** as named accessibility actions on the message summary/timestamp without grouping or hiding nested image, audio and document controls.
- The reply indicator is decorative and hidden from accessibility. A successful reply selection is represented by the existing visible composer reply context.
- Use a short bounded return animation. When reduced motion is enabled, reset immediately or use a minimal-duration transition.
- Gesture state must reset on recycle, unmount, project/session change, interruption and responder termination so FlatList reuse cannot carry a translated bubble to another message.

## Recommended product approach

Use the existing WhatsApp-style interaction model already established by Lisno web chat:

- Audio becomes one compact media row inside the existing incoming/outgoing bubble.
- Attachment choice becomes a small anchored three-action popover with no persistent explanatory copy.
- Tapping the group avatar/name/participant summary opens Group info. Phones use a dedicated full-height modal surface because the participant list can scroll; expanded layouts use a bounded thread-pane panel.
- Group info shows real names and roles with generated initials. Lisno has no participant-photo or presence contract, so the mobile app does not invent photos, online state or last-seen data.
- Add participant is driven only by the server-returned `canManageParticipants` capability plus the authenticated permission. This guarantees the Super Admin path while retaining operation-specific backend authorization.

No backend, persistence, migration or dependency change is required.

## Compact audio-message design

### Composition

- Keep the existing incoming-left/outgoing-right bubble colors, grouping, author line, reply context, caption, priority state, timestamp and message actions.
- For an audio-only attachment at normal font scale, target a single media row of approximately 60–72 dp and an overall bubble near 72–92 dp depending on whether the sender line or caption is present. There must be no large empty region.
- The media row contains:
  1. one 48 × 48 dp stateful leading control for download/loading/play/pause;
  2. a flexible compact waveform/progress treatment;
  3. a 34–38 dp sender-initial avatar with a small microphone badge.
- Remove the separate second-row download arrow. The leading control may authenticate/download on first activation and then play, as the current lazy playback already does. A secondary Share/Open action may remain in the existing message-actions surface; it must not consume a permanent row inside every audio bubble.
- Keep the message timestamp once in the existing footer. Do not duplicate it inside the audio component.
- Multiple audio attachments stack as compact rows with a small gap. Mixed attachments retain their appropriate existing presentation.
- The visible waveform must not claim to be measured audio if no amplitude data exists. It may be a restrained decorative/progress track hidden from accessibility, while playback state remains truthful through the control label and loading indicator.

### Behavior and failure states

- First Play activation may download the private attachment, then start playback only from that user action.
- Preserve one active playback owner across the project chat. Starting another audio message stops or pauses the previous owner through the existing audio service.
- Loading, playing, paused, ended, unavailable and access-denied states stay deterministic. Playback errors remain concise and retryable without changing the message.
- Unmount, project switch, logout and access loss cancel downloads, stop playback and release local artifacts exactly as today.
- A long filename remains available to assistive technology but is not primary visible bubble copy for a voice note.

## Compact attachment chooser

- Tapping the paperclip still opens Photo, Camera and File in that order and retains their accessible names.
- At ordinary phone text size, use one compact rounded popover above the composer, at most the available width minus safe margins and preferably about 288–320 dp wide. The content is a single horizontal row of three icon-and-label actions.
- Remove the large visible title, subtitle and three oversized bordered cards. If contextual text is needed for accessibility, expose it as a modal/panel label rather than permanent visual copy.
- Use compact 40–44 dp icon wells inside actions whose complete pressable area remains at least 48 × 48 dp. Visual compactness must not reduce the touch target.
- Target an ordinary content height near 96–120 dp plus required safe-area spacing. It must not cover a large portion of the transcript.
- Retain dimmed outside-tap dismissal on compact phones, thread-pane-scoped outside dismissal on expanded layouts, Android Back, initial focus on Photo and focus restoration to the paperclip.
- At font scale 2.0 or very narrow width, actions may wrap or become a compact vertical list. Content may grow to remain readable; clipping text to preserve the normal-height target is not allowed.
- Existing picker, permission, upload, cleanup and explicit-send behavior remains unchanged.

## Group-information experience

### Entry and layout

- Make the thread identity—project avatar, project name and participant summary—one accessible button. Its name is equivalent to `Open group info, Villa, 5 participants`.
- The overflow menu also exposes **Group info** as a secondary entry.
- On phones, open a dedicated modal group-information screen with a compact Back/Close header. On 600 dp and wider layouts, open a bounded panel within the thread pane so the conversation list remains available.
- Opening Group info pauses viewability-driven read acknowledgement. Hardware Back closes an add flow first, then Group info, before other composer transient state or route navigation.
- Closing restores focus to the header identity when supported.

### Participant content

- Show project initials, project name, participant count and the established audience message: **Shared with the client and project team. New participants can read the conversation history.**
- Render a continuous participant list rather than large cards. Each row contains generated initials, real participant name and the canonical role label from `ROLE_LABELS`.
- Do not show fabricated photos, presence, last seen, phone numbers or email addresses.
- Do not expose membership-source or selection metadata to ordinary readers. Manager-only backend metadata may be used to decide future selection removal, but it is not required as prominent participant copy.
- Support loading, retained-data refresh, empty, retryable error and non-disclosing denied states. A participant-fetch failure must not erase the conversation or draft.

## Add-participant workflow

- Show **Add participant** only when both are true:
  - `summary.capabilities.canManageParticipants` is true; and
  - the authenticated authorization contains `chat.participants.manage`.
- Do not enable this action by checking `session.user.role === "super_admin"`. The backend capability is authoritative and already guarantees the active Super Admin path while allowing a properly scoped Admin selection manager.
- Add opens a focused participant-selection surface:
  1. searchable active eligible people, debounced at approximately 250 ms;
  2. stable option identity by user ID, with name and canonical role label;
  3. one selected person at a time;
  4. a required **Reason for access** field, maximum 1,000 characters, because the backend audit contract requires a reason;
  5. Cancel and **Add participant** actions.
- Search uses the existing bounded `limit=30` endpoint and shows **More people match. Refine your search.** when `hasMore` is true.
- Empty search explains that only currently eligible active project participants can be added. The mobile app never expands eligibility locally.
- Submit a newly generated idempotency key with the exact selected user ID and trimmed reason. Lock duplicate submission while pending.
- On success, replace/invalidate the participant page and invalidate the chat summary and conversation list so the count updates everywhere. Close the add surface and announce the added participant once.
- On `409`, refresh options/participants and explain that the participant state changed. On `401/403/404`, close protected participant surfaces, purge their private queries and use the existing non-disclosing access-loss path. Other failures retain the selected person and reason for retry.
- `participants.changed` realtime events invalidate the participant query as well as the existing summary/list/history project family.
- Participant removal/revocation is not added in this pass. The backend route and web behavior remain unchanged; adding a mobile remove flow can be specified separately if requested.

## Mobile data and state contract

- Add mobile presentation adapters for:
  - participant `{ id, name, role, sources, selection }`;
  - participant page `{ items, setupWarnings }`;
  - participant options `{ items, hasMore }`.
- Validate all API payloads before rendering. Stable IDs are the only selection/join keys; names are presentation only.
- Add participant and participant-options query keys beneath the existing environment/user/project-scoped private chat key.
- Group-info/add state is scoped to the mounted environment, authenticated user and project. Project/user/environment changes close the surfaces, cancel search/mutation requests and prevent stale responses from entering another conversation.
- Query invalidation after add covers participants, summary and conversation list. Backend authorization and membership resolution remain authoritative.
- No raw token, private URI, draft, reason or personal contact data enters logs, persistent storage or query keys. A reason exists only in transient form input and the authorized request/audit path.

## Responsive and accessibility requirements

- Preserve minimum 48 × 48 dp interactive targets for audio control, attachment actions, header identity, Add participant and modal navigation.
- Voice rows and attachment actions may grow at font scale 2.0. “Smaller” means reduced unused space at normal scale, never clipped content or inaccessible targets.
- Validate compact widths 320, 360 and 412 dp; expanded widths 600 and 800 dp; portrait, short landscape and keyboard-open states.
- Participant names and roles truncate visually only when their full value remains in the accessible label.
- Modal/panel titles, focus order, busy/disabled state, errors and success messages use appropriate roles and restrained live regions.
- TalkBack order for Group info is: close/back, project identity, Add participant when allowed, then participant rows.
- Reduced-motion users receive no required animation. Opening/closing state must remain understandable with animations disabled.

## Scope

In scope:

- Compact delivered-audio bubble layout and playback control composition.
- Compact responsive Photo/Camera/File chooser.
- Header identity interaction and Group info participant list.
- Capability-gated Super Admin/authorized-manager add-participant flow using existing APIs.
- Participant query invalidation on realtime membership change.
- Content-fit text/image/audio spacing, tap-to-view full-screen image behavior and removal of the image **Open** button.
- Removal of the permanent message chevron and permission-aware horizontal swipe-to-reply with a non-gesture accessibility equivalent.
- Focused tests, full mobile verification, Android export/build and rendered emulator checks.

Out of scope:

- Backend route, schema, persistence, membership, permission or audit changes.
- Arbitrary contacts, public chat invitations, phone-book access or adding ineligible identities.
- Participant removal/revocation on mobile in this pass.
- Profile-photo uploads, presence, last seen, calls, group renaming, group description editing or chat creation.
- Audio transcription, measured waveform extraction, duration persistence, reactions or background playback.
- Copying WhatsApp branding, proprietary icons or exact pixel values.
- Deployment, production mutation, migration, commit, push or real participant additions during verification.

## Risks and handling

- **Compact design reduces accessibility:** keep pressable bounds at 48 dp while shrinking only visual wells, padding and unused rows; verify large text separately.
- **Audio resource leak:** retain transfer cancellation, single playback ownership and artifact release under unmount/project/access changes.
- **Participant access granted from UI role:** render Add only from server capability plus permission, then rely on backend context and eligibility checks for every write.
- **Duplicate participant write:** use a stable idempotency key for one submission attempt and lock repeated presses; refresh on conflict.
- **Stale participants after realtime event:** add participants to the project query family and explicitly invalidate it on `participants.changed`.
- **Private membership metadata leaks:** present names/roles only to readers and never manufacture source detail; continue trusting backend redaction.
- **New participant surprises users by seeing history:** state this before confirmation using the same wording as web chat.
- **Modal Back conflicts with composer:** define Group info/add surfaces ahead of composer and route navigation in the thread Back order.
- **Image viewer leaks private media:** render only authenticated local artifacts, release them on unmount/session or project change, and keep denial handling non-disclosing.
- **Visual compaction harms usability:** shrink visible padding and fixed width only; preserve 48 dp actions, readable text, large-font growth and responsive caps.
- **Swipe steals transcript/media interaction:** activate only for horizontal-dominant movement after an intent threshold, allow vertical scroll to win, and regression-test image/audio/document controls.
- **Gesture-only reply excludes assistive technology:** expose Reply and Message actions as named accessibility actions without hiding nested media controls.
- **Recycled row retains translation:** reset animated/gesture state on release, termination, unmount and message identity change.

## Acceptance criteria

1. An audio-only message renders as one compact play/waveform/avatar row without the current large blank card or separate download row, while preserving playback, error and cleanup behavior.
2. Audio controls remain at least 48 dp, accessible and usable at 320 dp and font scale 2.0; only one attachment plays at a time.
3. The Photo/Camera/File chooser removes the large visible heading/subtitle/cards and normally fits in a compact 96–120 dp horizontal popover while retaining safe margins and 48 dp actions.
4. Attachment outside tap, Android Back, Photo initial focus, paperclip focus restoration, busy/disabled state and large-text reflow continue to work.
5. Tapping the project identity or selecting Group info opens current project participants with real names, canonical roles, initials, participant count and the history-sharing notice.
6. Participant loading, error/retry, access denial, project switch and realtime membership changes cannot leak or retain another project's people.
7. The active Super Admin sees Add participant because the backend returns `canManageParticipants`; ordinary participants do not. Properly authorized Admin selection managers remain compatible without a role-name shortcut.
8. Add participant searches only backend-eligible active users, requires a bounded reason, sends a stable user ID and idempotency key, prevents duplicate submission and preserves form state on retryable failure.
9. Successful addition refreshes participant rows and counts in Group info, the thread header and conversation list without a manual reload. New access remains audited by the existing backend path.
10. No backend/frontend/OCR source, dependency, lockfile, persistence schema or authorization rule changes are required.
11. Focused message-bubble, attachment-sheet, thread, participant-model/query/mutation, realtime and Back/access tests pass, followed by mobile typecheck, full Jest, contract drift, Android export, arm64 APK build and installed-emulator launch smoke.
12. Rendered checks cover compact audio, compact attachment chooser, reader Group info, Super Admin add search/form/success/error states, 320/360/412/600/800 dp, short landscape and large text where tooling permits. No real participant is added during verification.
13. Short and long text bubbles fit their content with compact padding, a small consistent inter-message gap and no card-like unused width; replies, priorities, timestamps and action targets remain readable and operable.
14. Image attachments show no visible **Open** button. Tapping the image opens an authenticated full-screen viewer that closes through its Close control or Android Back and releases local artifacts safely.
15. Audio-only bubbles no longer use the `84%`/`258 dp` fixed phone sizing and have no avoidable blank area, while playback, loading, errors, access denial, one-owner behavior and 48 dp controls remain unchanged.
16. No message shows the permanent `⌄` action glyph or reserves its overlay/padding; existing action-sheet commands remain reachable through tap/long press and accessibility actions.
17. An intentional horizontal swipe in either direction selects that exact message as the reply target once, animates back to rest and shows the existing composer reply context; short, vertical or terminated gestures do not reply.
18. Swipe reply is disabled for read-only threads and does not regress vertical scrolling, image viewing, audio controls, document actions, FlatList recycling, project/session fencing, reduced motion or TalkBack-accessible Reply/Message actions.

## Assumptions and open decisions

- “Smaller as much as possible” applies to both supplied examples: delivered voice-note bubbles and the Photo/Camera/File chooser. The sizes above are compact targets, with accessibility and large-text behavior taking priority over an absolute height.
- “Similar to WhatsApp group chat” means header-to-group-info navigation, a participant list and an admin add flow using Lisno data and authorization. It does not mean WhatsApp branding, contacts, presence, calls or public invitations.
- The existing backend contract establishes that the sole active Super Admin can manage selections. The UI will also honor any non-Super-Admin actor for whom the backend truthfully returns the same capability.
- Participant removal remains out of scope for this pass because the request explicitly asks to view and add participants. The existing revoke API is preserved for a later mobile flow.

## Baseline verification evidence

- Focused final lane: 8 suites and 85 tests passed; full mobile lane: 52 suites and 373 tests passed; contract lane: 1 suite and 3 tests passed; TypeScript passed.
- Clean Android export produced a 5.6 MB Hermes bundle in `/tmp/lisno-mobile-compact-participants-final-export`. Arm64-v8a Gradle assembly passed, and the 87,502,449-byte debug APK (`d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`) installed and passed the checked-in launch smoke on `emulator-5554`.
- Rendered API 37 emulator checks covered the compact audio rows, compact Photo/Camera/File chooser, Super Admin Group info roster and Add participant search surface. No participant or message was created during verification.
- Package/lock hashes remained unchanged; no backend, frontend or OCR source was changed. Physical hardware, TalkBack and the complete width/font-scale/device matrix remain unrun.

## Follow-up verification evidence

- The focused final lane passed 5 suites and 37 tests; the complete mobile suite passed 53 suites and 385 tests with the established `--forceExit` runner; the contract lane passed 1 suite and 3 tests; TypeScript passed.
- Clean Android export processed 2,083 modules and 34 assets and produced a 5,655,103-byte Hermes bundle. Arm64-v8a Gradle assembly passed, and the checked-in Android launch smoke passed on `emulator-5554`.
- Rendered API 37 emulator checks covered short and long text spacing, priority/issue messages, compact image metadata, absence of the image **Open** action, authenticated full-screen image viewing, Android Back dismissal and 248 dp phone voice notes.
- Private preview/original transfers are deduplicated, cancelled and released across viewer close, unmount and environment/session/project owner changes. Package/lock hashes remain unchanged; no backend, frontend or OCR source changed.
- Physical hardware, TalkBack, API 24 hardware and the complete 320/360/412/600/800 dp, orientation and font-scale matrix remain unrun.

## Swipe-to-reply verification evidence

- Deterministic gesture rules use a 12 dp horizontal-intent threshold, symmetric ±72 dp visual clamp, 54 dp distance commit and a guarded velocity fallback. Cancelled, terminated, vertical-dominant and short movement never commits.
- The final focused lane passed 7 suites and 88 tests; the complete mobile suite passed 54 suites and 406 tests; the contract lane passed 1 suite and 3 tests; TypeScript passed.
- Integrity review confirmed exact-message targeting, once-only dispatch, backend-capability-plus-permission gating, action-sheet consistency, reduced-motion and recycled-row reset, nested media control preservation, accessible Reply/Message actions and synchronous owner-key fencing.
- API 37 emulator checks covered permanent-chevron removal, both swipe directions, the in-progress reply indicator, exact composer reply context, vertical transcript scrolling, image viewing and audio-control isolation. No message or participant was created.
- Clean Android export processed 2,084 modules and 34 assets. Arm64-v8a Gradle assembly, exact APK installation and the checked-in launch smoke passed on `emulator-5554`; post-launch AndroidRuntime/ReactNativeJS error output was empty.
- Final APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 87,502,449 bytes, SHA-256 `d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`, minSdk 24 and targetSdk 36.
- Package and lock hashes remained unchanged; no backend, frontend or OCR source changed. Physical hardware, TalkBack custom-action traversal and the full Android device/width/font-scale matrix remain unrun.

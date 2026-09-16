# Project chat: reliable audio, inline audio bubbles and named typing indicators

Date: 2026-09-16  
Status: Approved; implemented and locally verified in Mode A (see task plan for evidence and baseline test limitations)  
Request: Fix the reported audio-send error, match the compact WhatsApp audio bubble in the user's second attachment, and show other participants' names when they are typing in the same project chat.

## Goal

Project participants can record or attach supported audio, send it successfully, and play it directly inside the conversation. Audio uses one compact bubble with play/pause, a waveform/seek track, duration, message time and sender badge, rather than a nested file card or playback dialog. This applies to narrow mobile, tablet and desktop layouts.

Participants also see live, named typing indicators without refreshing, for example “Priya is typing…” or “Priya and Rahul are typing…”. Typing status is temporary, project-scoped and visible only to currently authorized participants.

## Current behavior and verified evidence

- Baseline is commit `1a0fdca` (`added chat screen`). Initial `git status --short` was clean. No application sources were changed during this investigation.
- `frontend/src/features/messages/useChatRecorder.ts` chooses supported policy formats, normally `audio/webm;codecs=opus`, and joins `MediaRecorder` chunks collected with `start(1000)` into a file.
- `backend/src/domain/project-chat-attachment-validation.ts` detects the container, then calls `music-metadata` through a storage-backed, bounded `ManagedTokenizer`. Its `ignore()` rejects unsafe integer lengths.
- A real Chromium `MediaRecorder`, fed a synthetic Web Audio oscillator without microphone access, produced a 21,429-byte WebM in three chunks. The actual production validator rejected it with `CHAT_ATTACHMENT_INVALID` and the exact screenshot text: “The file contents do not match a supported format.” The stack reaches `ManagedTokenizer.ignore()` from `EbmlIterator.parseContainer()`.
- The recording contains unknown-size Segment and Cluster elements, both using size bytes `01ffffffffffffff`. The installed EBML iterator treats that sentinel as a numerical skip length, which the tokenizer correctly rejects as unsafe. This identifies a container-parser compatibility defect; the numeric safety guard must remain intact.
- Chromium independently decoded the same bytes successfully: 1.32 seconds, 48 kHz, two channels. Therefore the rejected sample contains decodable audio. The user's original file was not available; this is an independently reproduced matching failure.
- Unknown element sizes are part of EBML and are only allowed for eligible master elements. See [RFC 8794, section 6.2](https://www.rfc-editor.org/rfc/rfc8794.html#section-6.2). An unknown size must be interpreted structurally, not as an arbitrary large finite byte count.
- Current validation fixtures use FFmpeg-generated media; recorder unit tests mock recording. They do not exercise this real browser recording shape.
- `ChatFileTray.tsx` places local audio in a generic file card with native browser controls, filename, size, progress and an error. `ChatTimeline.tsx` repeats the failed-send error outside that card.
- `ChatMessageAttachments.tsx` renders sent audio as a document-style tile with a “Load audio” action, then plays it in a dialog. This differs from the supplied reference in both appearance and interaction.
- `ChatPerson` contains stable ID, name and role, but no profile-photo field. The current attachment contract has no persisted duration or waveform.
- Typing is currently absent: `ChatComposer.tsx` updates the local draft, but there is no typing endpoint, state contract or rendered indicator. `projectChatStream.ts` handles only `chat` and `state` frames.
- The existing `project-chat-stream.service.ts` provides one authenticated SSE connection per active project on the frontend, with protected delivery and replayable message cursors. `project-chat-events.service.ts` combines Mongo change-stream wakeups with a 750 ms polling fallback. Its shared repository has memory and Mongo implementations. Typing should extend this channel, not create a second connection or append transient activity to durable message history.

Diagnostic artifacts, all synthetic, are under `/tmp/lisno-chat-audio-diagnosis-20260916/`: `browser-voice.webm`, `capture.txt`, and `inspect.mts`. These are disposable evidence, not application assets or committed test fixtures.

## Scope and non-goals

In scope:

- Correct bounded validation of supported browser-recorded WebM audio, including valid unknown-size containers.
- Regression coverage for recorded and uploaded audio, with browser-produced bytes rather than only mocked recordings.
- Shared inline audio presentation for selected attachments, pending/failed sends and delivered messages.
- Accessible play/pause, seeking, truthful timing, loading/error/retry states, and bounded media resource ownership.
- Responsive visual and interaction checks against the supplied audio-bubble reference.
- Named live typing indicators, including multiple simultaneous typists, expiry, project isolation, reconnect behavior and multiple-tab handling.

Out of scope: critical/normal task controls; redesigning the whole chat; reactions; transcription; server-side transcoding; new audio formats; background playback; profile-photo uploads; online/last-seen status; “recording audio” presence; changing project membership or role permissions; deployment, live index/migration execution, backfills or customer-data changes. An additive, short-lived typing collection and its index definitions are in scope; no existing message migration is expected. Existing image, video, document and ZIP presentation remains outside this audio-specific change.

## Recommended approach and tradeoff

**Recommendation:** correct the WebM/EBML inspection boundary with container-aware handling of valid unknown sizes, while retaining the existing storage abstraction, read budgets and numeric bounds. Add a reusable audio player within the existing chat media ownership model. Audio continues to use the current attachment API and browser playback facilities without new persistence fields.

An upstream media-parser upgrade is an alternative only if a verified release handles the same fixture without weakening validation. It could reduce local parsing logic but affects every supported media format and requires broader regression checks. Do not edit installed dependency files or relax the general tokenizer to accept arbitrary oversized lengths. Mandatory transcoding is unnecessary for the demonstrated failure and would introduce a new operational dependency.

**Typing transport recommendation:** publish short-lived typing leases through an authenticated endpoint and send current typing snapshots over the existing SSE connection. Store leases in the existing Mongo deployment, with an equivalent memory implementation, so users connected to different API processes still see each other. This introduces no Redis or WebSocket infrastructure. An in-process-only map is simpler but would miss users connected to different processes; it is unsuitable for the required production behavior. Poll active projects at the existing bounded cadence and coalesce unchanged snapshots; typing does not need durable event replay.

## Functional and validation requirements

1. **Valid recordings:** accept a complete playable browser recording assembled from all chunks, including unknown-size WebM Segment/Cluster elements. Preserve audio/video classification based on tracks, canonical MIME types, filename/content consistency and existing policy limits.
2. **Strict bounds:** unknown sizes are valid only in the applicable container context. Preserve cancellation, bounded reads, file-size bounds and bounded parser work. Reject malformed/truncated required structure, invalid element sizes, missing required audio tracks and spoofed content. Do not substitute trust in the claimed MIME type for inspection. This is structural validation, not a promise to fully decode every codec packet server-side.
3. **Other audio:** preserve MP3, M4A/MP4 audio, WAV, Ogg/Opus and finite-size WebM support. Check actual runtime-supported recording formats without advertising formats the browser cannot record or play.
4. **Existing lifecycle:** keep reserved/staged/attached lifecycle, ownership checks, quotas, compensating cleanup, transfer concurrency, message idempotency and retry reconciliation unchanged.
5. **Receive without refresh:** an audio message arriving through existing realtime delivery uses the same inline player immediately. Refetching history also produces the same presentation.

## Audio bubble UX

### Composition

- Keep the current incoming/outgoing message alignment and bubble colors. Eliminate the white bordered file card inside an audio bubble.
- Main row: generous play/pause target at the left; flexible waveform/seek track in the middle; circular sender initials with a small microphone badge at the right. Use stable sender identity and existing sender color. Do not invent a photo or introduce a profile-image API.
- Supporting row: duration/current playback position below the track; message timestamp and the existing delivery indicator aligned toward the lower right. Render message time once. Preserve the existing group sender name/role and reply context.
- Voice-note filenames, byte sizes, MIME labels and a “Load audio” button are not primary bubble content. Keep the filename available as an accessible description and retain an accessible download action through the established message/attachment actions. A selected uploaded file may show its filename as a subdued removable draft label.
- Captions remain ordinary message text. Multiple audio attachments form separate compact rows within their message without duplicating the message timestamp. Mixed attachments retain their established behavior.
- Match the reference's proportions and hierarchy using existing CSS and icons. Do not add a component library or bitmap waveform asset.

### Playback and waveform

- First activation may download the authenticated audio; show progress/loading in place, then begin playback only in response to that action. Pause, resume, end and replay must have deterministic states. Merely receiving or rendering a message never starts playback.
- The waveform doubles as a keyboard-accessible seek control. Enable seeking only when a usable finite duration is known. Support pointer/touch selection and keyboard arrows, Home and End; expose current and total time accessibly without noisy continuous announcements.
- Display duration from actual media metadata or decoded sample duration, never from a filename or a guessed value. Before duration is available, show a neutral unknown/loading state instead of misleading `0:00`, `NaN` or `Infinity`. Handle browser-recorded files whose initial duration metadata is missing or infinite.
- Use real audio amplitudes when waveform extraction is feasible within an explicit processing budget. Until then, or for unsupported/large/unknown-duration audio, use a neutral progress track. Do not present randomly generated bars as measured audio. Playback must work independently of waveform extraction.
- Waveform analysis is lazy and serialized, with explicit input, duration and decoded-memory limits. Do not decode every visible history attachment. If duration/resource bounds cannot be established safely, skip analysis and retain the accessible seek/progress fallback. Release audio-analysis resources promptly.
- Only one clip plays at a time within project chat, including draft previews. Starting another clip pauses the previous one. Project/account changes, loss of access and unmount stop playback and prevent stale results from attaching to a new chat.

### Pending and failure states

- Draft and pending audio use the same compact player language, with remove/cancel controls appropriate to the current stage.
- Show upload progress compactly. At 100% transferred, use a checking/sending state until server validation and message commit finish; do not equate transfer completion with successful delivery.
- Display each distinct failure once. Retain retry, edit and discard where the existing state machine permits them. Retry must preserve the recording and caption without duplicating an already committed message.
- A playback failure is separate from a send failure. Show a concise inline playback error and retry/download options while preserving the sent message.
- Unsupported browser playback does not silently discard a valid file or prevent its download.

### Responsive and accessibility requirements

- Validate at 320, 390, 768 and 1440 CSS-pixel widths and with 200% text zoom. Fit the available message width, including nested project navigation, without horizontal scrolling or clipped controls.
- Reduce waveform width/bar count before shrinking essential controls. Keep a minimum 44-by-44 CSS-pixel play/pause target, visible focus and readable duration. Sender badge can reduce in size on narrow screens.
- Maintain semantic buttons, an accessible seek control, meaningful labels, focus order, sufficient contrast, and reduced-motion behavior. Loading and waveform animation must not be necessary to understand state.

## Data, API, permissions and compatibility

- The audio fix requires no schema change, migration or new endpoint. Public attachment IDs, private storage references, existing fetch authorization, and safe filenames remain unchanged. Typing adds the bounded contract described below; unrelated contract expansion requires a specification update.
- All current project members who can send attachments can send audio; all who can read a message can fetch its audio under the same backend policy. No role gains additional access.
- Extend/refactor the existing authenticated media controller rather than using public object URLs or direct storage URLs. Keep byte-bounded transfers and access-denial reconciliation. Blob URLs are local resources and must be revoked when their owner releases them.
- Retain at most one active original-audio resource and one waveform analysis at a time; do not add an unbounded decoded-buffer cache. Guard asynchronous fetch, decoding and play completion against cancellation, identity changes and stale attachment selection.
- Existing stored audio requires no rewrite. The new player applies to old audio descriptors as well as new messages. Unsent local recordings can be retried while retained by the current session; recordings already discarded or lost to a reload cannot be recovered by this fix.
- Errors remain safe and actionable. Diagnostics may identify format and error category but must not log recording bytes, private URLs or client file contents.

## Named typing indicators

### User-visible behavior

- In the active Messages screen, place a compact status line directly above the composer so it remains visible without scrolling the conversation. Reserve its line height to avoid moving the composer, changing scroll position or obscuring messages when people start and stop typing. It must fit mobile, tablet and desktop layouts.
- One other person: “Priya is typing…”. Two: “Priya and Rahul are typing…”. Three or more: “Priya, Rahul and 2 others are typing…”, with correct singular/plural wording. Keep a stable ordering, deduplicate by user ID, and expose the full current list through accessible text. Long names may truncate visually without losing their accessible names.
- Exclude the viewer's own identity, including the same user's other tabs. The indicator shows current names supplied by the server, not client-provided labels or role names in place of people.
- Publish active typing for actual text edits, including paste, deletion that leaves text, emoji insertion, mention selection and IME composition. Focus alone, restoring an existing draft, selecting files, changing importance or playing/recording audio must not imply typing.
- Stop on send initiation, clearing the text, leaving the Messages screen, losing composer focus, hiding the browser tab, project/account changes, disablement or access loss. Keep the draft itself intact. A failed send does not restart typing unless the user resumes editing.
- Do not play sounds, change unread badges or create notifications for typing. Use a polite, deduplicated accessibility announcement when the named typist set changes, not on every heartbeat. Any animated dots respect reduced motion.

### Timing, failure handling and multiple tabs

- Send the first activity signal immediately; while edits continue, refresh at most once every 3 seconds per composer. Send an explicit stop after 3 seconds without an edit. Do not send a request on each keystroke or keep refreshing a motionless draft.
- A successful active update grants an 8-second server-controlled lease. Recipients remove expired entries locally even if a stop frame is lost; server reads also filter expired leases independently of database cleanup timing. Under a healthy local connection, the indicator should appear or clear within 2 seconds of the relevant accepted update.
- Clear all displayed typing when the stream disconnects, reconnects, becomes unavailable or is denied. Reconnect with a fresh snapshot, never replay old typing activity. Resume publishing only on renewed editing while the chat is live.
- Each mounted composer has its own opaque instance ID and monotonic update sequence. Scope that ID to the authenticated user, session and project on the server. Ignore stale/out-of-order updates. Keep stop sequence information long enough to prevent an older in-flight active update from reviving a stopped lease.
- Stopping one tab removes only its lease. The user remains visible to others if another authorized tab is still actively typing. Aggregate the active leases into one displayed person.
- Typing is best-effort. Transient update failures do not block messages, discard drafts or produce repeated toast errors. Stop requests during navigation/unmount are best-effort and expiry is the fallback. Abort stale requests and do not replay queued typing from a previous project/account.

### API, storage and authorization contract

- Add `PUT /api/v1/projects/:projectId/chat/typing`, protected by the existing `chat.send` permission and the same current-project membership/session checks as sending. Body: `{ composerId, sequence, typing }`, with bounded ID length, a nonnegative safe integer sequence and a boolean status. The actor ID, name, session scope and lease expiry are server-derived; there is no draft text, mention list or keystroke payload. Return the normal data envelope with the accepted sequence and effective expiry/status so stale updates can be reconciled.
- Register the operation in the canonical route-operation inventory and OpenAPI; align frontend types and runtime validation. Preserve operation-specific Super Admin behavior and non-disclosing project denial.
- Add an SSE `typing` frame containing `{ projectId, serverTime, participants: [{ userId, name, expiresAt }] }`. Send an initial current snapshot and changes, including an empty snapshot on clear. Typing frames have no durable message-event ID, never advance the chat cursor, and never invalidate full message queries. Use server time plus remaining lease duration to avoid depending on synchronized client clocks.
- Bound snapshot size and repository reads; cap visible names while retaining correct counts. Coalesce pending snapshots for a slow consumer so typing cannot grow an unbounded queue or starve committed messages. Preserve existing SSE backpressure and connection limits.
- Add short-lived repository records keyed by project, authenticated user/session and composer ID, containing last accepted sequence, active lease expiry and cleanup expiry. A compound unique index prevents duplicate leases; a TTL index removes operational records after their short retention period. Memory and Mongo repositories must implement the same sequence, aggregation and expiry rules. Enforce per-user/project active-composer limits and update rate limits server-side.
- TTL cleanup is housekeeping, never authorization or the source of visible expiry. Retain inactive sequencing records for at least 60 seconds; cap request lifetime and reject updates older than the allowed request window so delayed work cannot outlive its ordering guard. Do not write typing into messages, durable chat events, notification records, audit history or project activity timestamps.
- Recheck both the recipient's read membership/session and each typist's current active membership/session before disclosing names. Preserve the existing delivery authorization fence. Revoked participants and logged-out/invalidated sessions must not remain visible because an unexpired lease still exists.
- Mongo-backed operation must work across two API instances sharing the same database, including when change streams are unavailable and the existing polling fallback is active. Cache/coalesce a typing snapshot per active project/tick where compatible with the authorization fence, rather than multiplying unrestricted reads by every connected user.
- No external service, seed or data backfill is required. Include additive model/index definitions in code and verify them against disposable local storage only; report production index rollout as an unperformed external action.

## Risks and mitigations

- **Parser permissiveness:** accepting an unknown-size sentinel everywhere would hide corruption. Keep the compatibility fix container-specific and pair the valid-browser fixture with malformed and oversized-element tests.
- **Missing duration:** streaming WebM may not expose an immediately finite duration. Keep duration discovery independent from playback and use a truthful fallback until known.
- **Large audio processing:** compressed size alone does not bound decoded memory. Gate optional waveform work on additional media bounds; keep playback available when analysis is skipped.
- **Resource and authorization races:** share media ownership, cancel stale work, test logout/project switching and denied fetches.
- **Reference avatar mismatch:** use a deliberate initials badge because chat has no photo contract; layout still follows the supplied reference.
- **Cross-browser variation:** reproduce with native recording in available engines, include representative format fixtures, and report unavailable browser/device checks explicitly.
- **Stuck or misleading typing:** expire leases on both server and client, send explicit stops, prevent stale sequences from winning, and test hidden tabs, lost connections and multiple tabs.
- **Privacy and cross-process delivery:** derive names from authorized server identities, apply the existing authorization fence, and test separate API instances plus revoked users. Do not use a process-local-only presence map in Mongo mode.
- **Typing load:** throttle publisher updates, bound leases/frames, coalesce unchanged snapshots and enforce server limits. Typing must not increase message counters or trigger message-history refetches.

## Acceptance criteria and verification

| ID | Observable result | Required evidence |
| --- | --- | --- |
| A1 | A real browser-generated WebM voice note sends successfully without the reported error. | Native `MediaRecorder` synthetic-stream fixture, domain validation, upload/send integration and rendered playback. Exercise timesliced recording and stopping before the first interval. |
| A2 | Unknown-size compatibility does not weaken validation. | Valid finite/unknown-size containers plus malformed sizes, illegal unknown-size elements, truncation, missing tracks, MIME/extension mismatch and bounded-work checks. Existing non-audio validation suite stays green. |
| A3 | Existing supported audio formats remain usable. | Representative MP3, M4A, WAV, Ogg/Opus and WebM validation cases; distinguish browser playback support from server acceptance. |
| A4 | Audio uses a compact inline bubble throughout draft, pending, failed and delivered states. | Rendered screenshots at the four specified widths, incoming/outgoing examples, captions, multiple files and long filenames; no nested file card or playback dialog for audio. |
| A5 | Play/pause, seek, duration and end/replay work without refresh. | Actual browser playback/seek checks, single-active-player checks, realtime receive and history reload. Assert no `Infinity`/`NaN` duration and no autoplay on arrival. |
| A6 | Failed sends are understandable and retry safely. | One error per distinct failure; progress-to-validation transition; retry with retained file; existing duplicate-send reconciliation; edit/discard availability. |
| A7 | Audio resources stay private and bounded. | Permission-denied fetch, transfer cancellation, project/account switch, unmount, URL cleanup and optional-analysis fallback tests. No background full-history decoding. |
| A8 | Controls remain accessible and responsive. | Keyboard play/seek, focus, accessible-name and touch-target checks; 200% text zoom; narrow-width overflow and reduced-motion inspection. |
| A9 | Other participants see the typist's name live in the same project chat. | Two authenticated browser sessions: edit, paste, emoji, mention and IME input; show the correct name without refreshing; never show the viewer's own name or an indicator for focus/draft restoration alone. |
| A10 | Typing clears reliably and handles concurrent people/tabs. | Fake-clock tests for 3-second idle/refresh and 8-second expiry; send/clear/blur/hidden-tab/navigation cleanup; multiple typists, same-user tabs, stale sequences, lost stops and reconnect snapshots. |
| A11 | Typing remains project-private and works across API processes. | Two unequal projects and multiple roles; denied read/write, spoofed identity fields, membership/session revocation, multi-instance Mongo delivery and polling fallback. Assert no leaked names, durable chat events, unread changes or draft content. |
| A12 | Typing stays bounded and does not disturb the interface. | Server rate/lease limits, coalesced frames, no per-keystroke requests or message refetches; four-width screenshots with long/multiple names, stable composer position, keyboard/screen-reader status and reduced motion. |

After implementation, run focused chat/audio/typing regression suites, frontend/backend typechecks and production builds, and `git diff --check`. Broaden testing for shared media-controller, validator, SSE and authorization-inventory changes. Include replica-set tests for typing's Mongo concurrency, session/membership fences and multi-instance behavior; do not weaken transactions to fit a standalone Mongo test. There is no repository lint script. Report exact results and unrun browser checks; do not treat mocked-recorder tests or a single-user typing test alone as sufficient verification.

## Assumptions, open decisions and rollback

- The second attachment defines the desired audio layout; exact third-party branding and profile-photo functionality are not required.
- The compact player applies to uploaded audio as well as recorded notes, as requested.
- The latest request explicitly adds named typing indicators to this audio fix. The earlier cancellation of typing work no longer excludes this feature; critical/normal controls remain outside this scope.
- Existing authorization, upload limits and recording policy remain authoritative. No product decision currently requires clarification.
- This specification does not select an execution mode or authorize deployment. A separate task plan follows specification approval under `AGENTS.md`.
- Changes should remain separable into audio compatibility/presentation and transient typing. No existing-data migration is expected. Rollback removes the eventual source changes without rewriting messages or stored files; short-lived typing records become unused and expire through their TTL cleanup. Deployments must establish the additive typing indexes before enabling the feature.

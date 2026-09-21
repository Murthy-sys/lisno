# Mobile compact chat media and group participants — task plan

Date: 2026-09-19
Status: Complete
Specification: `docs/superpowers/specs/2026-09-19-mobile-compact-chat-participants-design.md`
Execution target: React Native Android application in `mobile/`; existing project-chat backend contracts remain authoritative and unchanged

## Delivery contract

Deliver the approved specification as one integrated mobile change:

- compact delivered-audio messages with no blank attachment-card space or permanent second download row;
- compact Photo/Camera/File chooser with 48 dp actions;
- header-driven Group info with real project participants;
- capability-gated participant search/add for the active Super Admin and any other backend-authorized selection manager;
- project/user/environment fencing, safe Back/read behavior, realtime refresh and full Android verification.
- content-fit text and voice-note bubbles with WhatsApp-like transcript spacing;
- image-preview tap opening an authenticated in-app viewer, with no visible image **Open** button.
- removal of the permanent message chevron and permission-aware horizontal swipe-to-reply.

Freeze these invariants before implementation:

- backend participant membership, eligibility, permissions, audit, idempotency and `participants.changed` events are the source of truth;
- the UI gates Add participant on both `summary.capabilities.canManageParticipants` and `chat.participants.manage`, never a role-name comparison;
- participant identity uses stable user ID; names and roles are presentation only;
- one add attempt keeps one idempotency key across retry of the same selected user/reason and renews it when the payload changes or succeeds;
- participant queries, async search and mutations remain scoped to environment, authenticated user and project;
- audio playback/download ownership, private file release and access-loss cleanup remain unchanged;
- compact visuals preserve 48 dp targets and may grow for font scale 2.0;
- no backend/frontend/OCR source, dependency, lockfile, migration, commit, push or production mutation is authorized.
- authenticated attachment artifacts remain local, cancellable and released across viewer close, unmount, project/session/environment change and access loss.
- horizontal reply gestures must never override backend-derived send capability, vertical transcript scrolling or nested media controls.

## Baseline and repository hygiene

- Initial dirty set consists of untracked `mobile/`, current/historical mobile specs and plans, and unrelated `.idea/`. Treat every pre-existing path as user work and preserve it.
- `mobile/package.json` SHA-256: `6e144e38577e01a2f1320c21a47a0d99e39eef36084235abe31b4086bcfe9d24`.
- `mobile/package-lock.json` SHA-256: `2376fb3eef7f1c1105895e816e1f9efa582fef21115f719a3ed1c318a5e740e9`.
- Focused visual-component baseline passed 3 suites and 18 tests:
  - `src/features/messages/MessageBubble.test.tsx`
  - `src/features/messages/AttachmentOptionsSheet.test.tsx`
  - `src/features/messages/ChatThread.test.tsx`
- The prior stable mobile baseline passed 50 suites and 334 tests, TypeScript, contract drift, Android export/prebuild, arm64 Gradle assembly, exact APK install and launch smoke. Re-establish these checks after this change rather than assuming them.

## T00 — Reconfirm contracts and visual baseline

**Owner:** Primary.

**Paths:** Read-only inspection of approved spec, `MessageBubble.tsx`, `AttachmentOptionsSheet.tsx`, `ChatThread.tsx`, `useChatThread.ts`, `chatModel.ts`, `chatQueryKeys.ts`, backend project-chat contracts/routes/service and web `ChatParticipants.tsx`.

- Record the current untracked/dirty paths and package hashes before any writer starts.
- Capture emulator reference screenshots for:
  - an audio-only message;
  - the current attachment chooser;
  - the thread header;
  - Group info absence/current overflow menu.
- Freeze the participant payload shapes and add contract from the backend:
  - participant page and redaction behavior;
  - options page and `hasMore`;
  - `{ userId, reason, idempotencyKey }` add payload;
  - `canManageParticipants` and permission requirements;
  - conflict and access-denied behavior.
- Freeze controlled component seams before parallel work:
  - `AttachmentOptionsSheet` retains its current controlled source callbacks;
  - `MessageBubble` retains its message/action/download/audio service contract;
  - Group info receives stable project/session/capability inputs and reports overlay/denial/close events.

**Acceptance evidence:** Baseline screenshots, test result, hashes and exact contract shapes are recorded; no source behavior changes.

## T01 — Add participant presentation models and scoped query keys

**Owner:** Mobile data-contract writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/chatModel.ts`, `chatModel.test.ts`, `chatQueryKeys.ts`, `chatQueryKeys.test.ts`, and a new participant-focused hook/helper plus its tests if needed. Do not edit chat UI components, audio/attachment components, backend, frontend or native configuration.

- Add strict mobile presentation types and adapters for:
  - `PresentedChatParticipant` with stable ID, name, validated canonical role, sources and nullable selection metadata;
  - `PresentedChatParticipantPage` with items and setup warnings;
  - `PresentedChatParticipantOptions` with people and `hasMore`.
- Accept the backend's manager-redacted ordinary-reader response: empty `sources` and null `selection` are valid.
- Reject malformed IDs, names, roles, source kinds, selection versions, warnings and option shapes with `ApiProtocolError` at the consumer boundary.
- Add project-scoped private query keys for participants and participant options beneath `chatQueryKeys.project(...)` so existing project invalidation, denial purge and realtime refresh include them.
- Add URL builders for participants and bounded options search where that improves testability; encode project/search input exactly once.
- Do not store search text, reason or participant names in persistent storage. Query keys may contain the bounded current search string but never the audit reason.

**Acceptance evidence:** Tests cover valid manager/reader participant pages, all canonical roles/source kinds, redacted metadata, malformed payload rejection, option pagination, project/user/environment key separation and encoded search URLs.

## T02 — Compact delivered-audio bubbles

**Owner:** Audio bubble UI writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/MessageBubble.tsx` and `MessageBubble.test.tsx` only. Do not edit audio services, composer recording, thread, participant files, attachment chooser or backend.

- Replace the wrapping audio card with one compact media row:
  - 48 dp stateful download/loading/play/pause control;
  - flexible bounded decorative/progress track;
  - 34–38 dp sender-initial avatar with microphone badge.
- Remove the permanently rendered second-row download arrow and the margin/wrap rules that produce large empty space.
- Keep the filename in accessible labels. If a secondary Share/Open action remains, place it behind the existing message action path rather than adding a permanent media row; request primary integration if that requires changing `MessageActionSheet`.
- Let audio-only attachment bubbles size to their content with sensible phone/expanded min/max widths. Keep non-audio image/file behavior unchanged.
- Preserve author, caption, reply, priority, time, message actions, lazy authenticated download, play/pause, single-owner playback, denial handling and cleanup.
- Use a restrained visual track without presenting the existing synthetic bars as measured audio data.
- At font scale 2.0, allow growth/wrap without clipping the 48 dp control or avatar.

**Acceptance evidence:** Render tests prove compact single-row composition, absence of the second download row, content-sized phone/expanded widths, 48 dp control, initial-download-to-play, pause, failure/retry, single-owner switching, cleanup, denial, multiple audio attachments, caption/reply/footer preservation and large-text semantics.

## T03 — Compact Photo/Camera/File chooser

**Owner:** Attachment chooser UI writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/AttachmentOptionsSheet.tsx`, `AttachmentOptionsSheet.test.tsx`, and `ChatIcon.tsx` only if an existing glyph needs a bounded visual adjustment. Do not edit `ChatComposer`, picker/upload platform code, participants, thread or backend.

- Remove the ordinary visible heading, subtitle and three large bordered cards.
- Render Photo, Camera and File as one compact horizontal icon/label row at normal size, with a preferred phone width around 288–320 dp and ordinary content height around 96–120 dp plus safe-area spacing.
- Keep action pressables at least 48 × 48 dp while reducing visual wells to 40–44 dp and tightening panel padding/gaps.
- Preserve controlled visibility, availability, busy source, disabled state and source callbacks.
- Preserve compact-phone backdrop, expanded thread-pane outside target, Android modal Back, Photo initial accessibility focus and paperclip focus restoration.
- Reflow safely to wrapped or vertical actions for narrow width/font scale 2.0 rather than clipping.
- Keep reduced-motion behavior and do not add a dependency or bitmap asset.

**Acceptance evidence:** Focused tests assert normal compact dimensions/hierarchy, label order, absent visible explanatory copy, 48 dp action bounds, phone/expanded composition, outside/Back dismissal, focus behavior, busy/disabled states, conversation-list interactivity and large-text reflow.

## T04 — Build the controlled Group info and Add participant surfaces

**Owner:** Participant UI writer in Mode A; primary in Mode B.

**Paths:** New message-owned components such as `ChatGroupInfo.tsx`, `ChatParticipantRow.tsx` and their focused tests. The component may use the settled T01 participant hook/helper. Do not edit `ChatThread.tsx`, `useChatThread.ts`, message/audio/attachment UI, backend or frontend.

- Build controlled Group info presentation with:
  - phone full-height modal and expanded bounded thread-pane panel;
  - project initials, name, participant count and history-sharing notice;
  - continuous rows with generated initials, real name and `ROLE_LABELS` role;
  - loading, retained refresh, empty, retry, denied and setup-warning states;
  - Close/Back callback and focus-restoration callback.
- Expose Add participant only from a `canManage` prop derived later by `ChatThread`; do not inspect the role label inside the component.
- Build nested Add participant flow:
  - 250 ms debounced search;
  - stable option selection by user ID;
  - name and canonical role labels;
  - `hasMore` refinement hint and truthful empty state;
  - required trimmed reason, maximum 1,000 characters;
  - Cancel and pending-safe Add actions;
  - retained input on retryable failure.
- Keep one mutation attempt record `{ fingerprint, idempotencyKey }`. Reuse it for an unchanged retry; renew when selected user/reason changes or after success.
- On success, apply/invalidate the participant page and invoke integration callbacks for summary/list refresh, success announcement and close.
- Map 409 to a refresh/review message. Map 401/403/404 to the controlled denial callback without exposing backend detail.
- Cancel stale option/search/mutation work on close, project/user/environment change and unmount.
- Do not expose participant removal in this task.

**Acceptance evidence:** Tests cover ordinary reader list, manager Add visibility, search debounce/cancellation, options parsing, stable user-ID selection, hasMore/empty, reason validation, rapid-submit lock, stable retry identity, changed-payload identity, success refresh callbacks, 409 refresh, access denial, project switch fencing, Back ordering, focus restoration, phone/expanded layout and accessible roles/names.

## T05 — Integrate participant data, Group info and header entry into the thread

**Owner:** Primary after T01 and T04 interfaces settle.

**Paths:** `mobile/src/features/messages/ChatThread.tsx`, `ChatThread.test.tsx`, `useChatThread.ts`, `useChatThread.test.tsx`, and at most a narrow message action integration if T02 requires a secondary audio share action. Do not change backend/frontend/OCR.

- Make the header avatar/name/participant summary one Pressable with an accessible `Open group info` name and 48 dp minimum target.
- Add **Group info** to the conversation overflow menu.
- Compute management visibility as:

```text
summary.capabilities.canManageParticipants
AND session.authorization.permissions includes chat.participants.manage
```

- Fetch participants only for the active project when Group info needs them, while allowing retained cached data during refresh.
- Wire participant success to invalidate/update:
  - participants;
  - project chat summary;
  - conversation list.
- Ensure project-level realtime invalidation also refreshes the nested participant query after `participants.changed`.
- Add Group info/add visibility to the read-active overlay gate.
- Extend hardware Back ordering:
  1. pending participant add remains locked;
  2. nested Add flow closes;
  3. Group info closes;
  4. header menu closes;
  5. existing composer/message/reply/route behavior continues.
- Restore header identity focus after close and keep the expanded conversation list interactive.
- On participant access denial, close protected surfaces, cancel/remove project participant queries and invoke the current thread access-loss path.
- Project/session/environment changes must reset Group info/add state without carrying participant or form data.

**Acceptance evidence:** Thread/hook tests cover both header/menu entry points, reader and manager permissions, Super Admin capability path, admin compatibility, read pause/resume, participant-count refresh, realtime invalidation, pending-add navigation lock, Back ordering, focus restoration, expanded list interactivity, denial purge and project switch.

## T06 — Integrated contract, lifecycle and accessibility regression lane

**Owner:** Primary after all implementation writers stop.

**Paths:** Focused tests under `mobile/src/features/messages`; product edits only for confirmed integration defects.

- Run and reconcile the complete affected lane:
  - chat model/query keys;
  - MessageBubble;
  - AttachmentOptionsSheet;
  - participant/group info components;
  - ChatThread/useChatThread;
  - ChatTimeline if layout/read behavior is affected;
  - ChatComposer to prove attachment integration did not regress;
  - audio session/resource tests;
  - mobile authorization/contract-drift tests.
- Add scenario-level regressions rather than implementation mirrors:
  - same display name with different IDs;
  - ordinary reader receives redacted metadata;
  - manager capability absent despite a role label;
  - stale option/add result from another project/user/environment;
  - duplicated add tap and unchanged retry;
  - membership event while Group info is open;
  - audio download/play owner switch during project navigation;
  - compact chooser at the 599/600 dp layout boundary.
- Confirm no new dependency/lockfile change and no backend/frontend/OCR source edit.

**Acceptance evidence:** Every approved acceptance criterion maps to a focused automated result or an explicitly recorded rendered/device result.

## T07 — Rendered emulator QA and visual correction

**Owner:** Primary; may use a verification-focused agent only after implementation is stable.

**Paths:** Product-source corrections only for observed defects; screenshots and diagnostics remain in `/tmp` and are not committed.

- Install the current debug APK and exercise only synthetic/read-only or isolated development data. Do not add a real participant.
- Capture and inspect:
  - audio-only incoming and outgoing messages;
  - audio with author, caption, reply and priority;
  - compact attachment chooser open/busy/disabled;
  - reader Group info;
  - Super Admin Group info and Add search/form states using mocked/test-safe responses when necessary;
  - retry/conflict/denied states without live mutation.
- Validate 320, 360, 412, 600 and 800 dp where tooling permits, plus short landscape, keyboard open, font scale 1.0 and 2.0.
- Check TalkBack focus order if available; otherwise record it as unrun and rely on rendered accessibility tests.
- Compare normal-scale results to the supplied screenshots: remove unused vertical space while preserving 48 dp targets.

**Acceptance evidence:** Final screenshots show materially smaller audio and attachment surfaces and usable Group info/add states; unavailable physical-device/accessibility lanes are listed explicitly.

## T08 — Integrity review and correction

**Owner:** `integrity_reviewer` in Mode A; primary inline in Mode B.

Review the stable integrated tree for:

- participant authorization sourced from backend capability plus permission;
- Super Admin uniqueness/selection-manager semantics and ordinary-reader redaction;
- user/project/environment/session fencing for participants, options and writes;
- idempotency fingerprint/key behavior, rapid taps, conflict refresh and mutation cleanup;
- query invalidation across participants, summary and conversations;
- read acknowledgement, Back ordering, focus restoration and expanded-pane interaction;
- audio transfer/playback ownership, local-artifact release and access denial;
- 48 dp controls, font scale 2.0 and compact safe-area behavior;
- accidental contact data, reason text, private URI/token or source-metadata leakage;
- unrelated source, dependency, lockfile, native-generated or backend/frontend/OCR changes.

Resolve every confirmed material finding and rerun the smallest affected lane before T09.

## T09 — Final verification and documentation

**Owner:** `verification_runner` in Mode A; primary inline in Mode B. No concurrent writers.

Run from `mobile/` unless stated otherwise:

1. Focused affected message/model/query/audio/attachment/participant/thread suites with `--runInBand --forceExit` if the established Jest open handle persists.
2. `npm run typecheck`.
3. `npm test -- --runInBand --forceExit` once on the final integrated tree.
4. `npm run test:contracts`.
5. `npx expo install --check`, disclosing offline bundled-map limitations.
6. Clean Android export to `/tmp`.
7. Expo config/prebuild verification without retaining unrelated native changes.
8. Direct arm64-v8a Gradle debug assembly.
9. Inspect merged/packaged manifest for API 24 and existing permissions.
10. Install the exact fresh APK and run the checked-in Android launch smoke on `emulator-5554` when available.
11. Run rendered interaction checks from T07 against the final build where possible, without a live participant mutation.
12. From repository root: `git diff --check`, trailing-whitespace sweep for untracked text, `git status --short`, changed-path audit, package/lock hash audit and generated-artifact audit.

Update only observed results in:

- `mobile/README.md`;
- `mobile/docs/android-support.md`;
- `mobile/docs/feature-parity.md`;
- the approved specification status;
- this plan's final evidence section.

Report exact pass counts, APK path/hash/size, emulator/device scope, unrun physical/TalkBack/font/device lanes and the fact that no real participant was added.

## T10 — Refine message spacing and audio footprint

**Owner:** Mobile message UI writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/MessageBubble.tsx` and `MessageBubble.test.tsx` only. Do not edit thread, composer, transfer/audio services, participant UI or other workspaces.

- Make ordinary text bubbles content-fit within responsive maximums; remove unnecessary minimum/card width while retaining enough room for the message and trailing timestamp.
- Use approximately 7–9 dp horizontal and 4–6 dp vertical bubble padding.
- Add a 2 dp same-group message gap and retain a 6–8 dp new-group gap.
- Keep timestamps compact at the lower trailing edge and avoid a large empty footer row. Preserve reply, priority and issue layouts.
- Remove the phone `84%`/`258 dp` voice-bubble sizing. Use a compact normal-scale width around 220–260 dp that may grow for captions, replies, errors and large text.
- Preserve 48 dp playback/message-action targets, one-owner playback, lazy authenticated download, denial handling and artifact cleanup.

**Acceptance evidence:** Focused tests cover short/long incoming and outgoing text, same/new group spacing, timestamp/action target layout, compact normal voice notes, caption/reply/priority growth, 320 dp width and large-font behavior.

## T11 — Add tap-to-view authenticated image viewer

**Owner:** Mobile image-viewer writer in Mode A; primary in Mode B.

**Paths:** A focused new `mobile/src/features/messages/ChatImageViewer.tsx` and test if separation improves lifecycle clarity; final integration changes in `MessageBubble.tsx` and its test belong to the primary after T10. Do not edit the transfer manager, backend or native configuration.

- Remove the visible **Open** button and its reserved column only for image attachments. Preserve explicit actions for documents and other non-image attachments.
- Make the preview itself the primary accessible action and open an in-app full-screen viewer.
- Render the already-authenticated local preview immediately when available; use the authenticated original artifact when loaded, without exposing a private URL.
- Provide contain-mode rendering, dark neutral background, loading/error state, 48 dp Close control, Android Back dismissal and focus-safe accessibility naming.
- Cancel pending transfers and release preview/original artifacts on unmount, project/session/environment change and access denial. Keep non-disclosing 401/403/404 behavior.
- Keep filename/size metadata compact below the preview and preserve image preview fallback behavior.

**Acceptance evidence:** Tests prove there is no visible image **Open** action, image tap opens the viewer, preview-to-original loading works, Close and Android Back dismiss, failures remain retryable, denial invokes the existing path, delayed transfers cannot reopen after unmount, and document Open behavior remains unchanged.

## T12 — Integrate and render-check the follow-up

**Owner:** Primary after T10 and the controlled T11 viewer interface are stable.

**Paths:** `MessageBubble.tsx`, its focused tests and documentation only for confirmed behavior. `ChatTimeline.tsx` may change only if a consistent inter-message gap cannot be expressed by the bubble row.

- Reconcile the message-row spacing and image-viewer integration without duplicate press handlers or nested inaccessible actions.
- Confirm tapping the image does not also open message actions; long-press/message action behavior remains available outside the media action.
- Inspect short and long text, priority/issue messages, incoming/outgoing images, image viewer and audio-only messages on the Android emulator.
- Check at least a compact phone width and normal font scale; use automated layout tests for 320/360/412 dp and font scale 2.0 where direct emulator coverage is unavailable.
- Keep screenshots and diagnostics in `/tmp`; perform no live message, participant or production mutation.

**Acceptance evidence:** Rendered results show small consistent transcript gaps, content-fit text, no image **Open** label/whitespace, working full-screen image viewing and voice notes without avoidable blank space.

## T13 — Follow-up integrity review and final verification

**Owner:** `integrity_reviewer` then `verification_runner` in Mode A; primary sequentially in Mode B. No concurrent writers during final verification.

- Review private-artifact lifecycle, project/session/environment fencing, Android Back order, nested press handling, accessibility targets and document/image behavioral separation.
- Run focused MessageBubble/viewer/ChatTimeline tests, `npm run typecheck`, full mobile Jest, contract drift, clean Expo Android export, arm64-v8a Gradle assembly and emulator launch smoke.
- Run repository whitespace/status, changed-path, package/lock hash and generated-artifact audits.
- Update spec/plan status and observed verification evidence only after the final integrated tree passes.

**Acceptance evidence:** AC13–AC15 pass with exact automated/native results and remaining device/accessibility gaps disclosed.

## T14 — Define deterministic swipe intent and commit rules

**Owner:** Mobile interaction helper writer in Mode A; primary in Mode B.

**Paths:** A new focused helper such as `mobile/src/features/messages/swipeReply.ts` and `swipeReply.test.ts`. Do not edit UI components, thread integration or other workspaces.

- Define pure, testable rules for horizontal intent, clamped translation and reply commit:
  - do not claim movement below approximately 12 dp;
  - require horizontal movement to dominate vertical movement;
  - clamp either direction to approximately 72 dp;
  - commit at approximately 54 dp, or from a clearly intentional horizontal velocity after a smaller minimum distance;
  - never commit for vertical, short, cancelled or terminated movement.
- Keep direction symmetric so left and right swipes follow the same threshold.
- Keep the helper independent of React Native gesture objects so boundary behavior is covered without implementation-mirror tests.

**Acceptance evidence:** Unit tests cover exact threshold boundaries, both directions, velocity fallback, diagonal/vertical rejection, clamping and termination inputs.

## T15 — Replace the chevron with animated swipe-to-reply

**Owner:** Message-bubble UI writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/MessageBubble.tsx`, `MessageBubble.test.tsx`, and `ChatIcon.tsx` only if a reply indicator glyph is added. Consume the settled T14 helper; do not edit timeline/thread integration.

- Add optional `onReply` to `MessageBubble`. When absent, install no reply gesture and preserve read-only behavior.
- Remove the permanent `⌄` Pressable/glyph, its author padding and reserved overlay from every bubble type.
- Wrap the bubble in a bounded horizontal responder/animation layer:
  - reveal a decorative reply indicator only during intentional drag;
  - support either horizontal direction;
  - call `onReply` exactly once after a committed release;
  - return to zero on success, short release, cancel, termination, unmount and message identity change.
- Keep tap/long press opening the existing action sheet. Preserve image tap, audio play/pause, document Open, text selection and 48 dp media controls.
- Query reduced-motion preference and reset immediately/minimally when enabled.
- Move Reply and Message actions to named accessibility actions on the message summary/timestamp without grouping or hiding nested media controls.

**Acceptance evidence:** Component tests cover no visible chevron, both swipe directions, short/vertical/terminated gestures, exactly-once reply, disabled gesture, reset/recycle, reduced motion, action-sheet tap/long press, accessibility actions and media-control non-regression.

## T16 — Wire reply capability through timeline and thread

**Owner:** Timeline/thread integration writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/ChatTimeline.tsx`, `ChatTimeline.test.tsx`, `ChatThread.tsx` and `ChatThread.test.tsx`. Do not edit MessageBubble implementation, composer internals, backend or other workspaces.

- Add optional `onReply(message)` through `ChatTimeline` to each `MessageBubble` using the exact rendered `PresentedMessage` identity.
- In `ChatThread`, pass the callback only when existing backend summary capability and session authorization produce `canSend=true`.
- On committed swipe, set the existing `reply` state directly without opening `MessageActionSheet`; the composer renders the existing reply context and cancellation behavior.
- Preserve the action-sheet Reply path, owner-key reset, read acknowledgement, Back ordering, selected-message state and FlatList keying.
- Ensure rerenders use stable callbacks so message rows do not reset gesture state unnecessarily.

**Acceptance evidence:** Timeline/thread tests prove exact target identity, direct composer reply context, no action-sheet opening, read-only omission, action-sheet Reply compatibility and owner/project/session reset.

## T17 — Swipe integrity review, Android QA and final verification

**Owner:** `integrity_reviewer` then `verification_runner` in Mode A; primary sequentially in Mode B. No concurrent writers during final verification.

- Review gesture arbitration with FlatList, nested image/audio/document controls, permission gating, accessibility actions, recycled rows, reduced motion and owner fencing.
- Render-check both swipe directions, reply indicator, composer reply context, chevron removal, vertical scrolling, image viewing and audio play on the available Android emulator.
- Run focused helper/bubble/timeline/thread/composer tests, TypeScript, full mobile Jest, contract drift, clean Android export, arm64 Gradle assembly, APK launch smoke and repository/package hygiene checks.
- Update specification/plan status and observed mobile documentation only after the final integrated tree passes.

**Acceptance evidence:** AC16–AC18 pass with exact automated/native evidence and any physical-device/TalkBack/device-matrix gaps disclosed.

## Acceptance-to-task trace

| Specification criterion | Tasks |
| --- | --- |
| AC1 compact audio row | T02, T06, T07, T08 |
| AC2 audio accessibility and ownership | T02, T06, T08, T09 |
| AC3 compact attachment chooser | T03, T06, T07 |
| AC4 chooser dismissal/focus/states | T03, T05, T06 |
| AC5 Group info and real participant rows | T01, T04, T05, T07 |
| AC6 participant lifecycle and isolation | T01, T04, T05, T08 |
| AC7 capability-gated Super Admin/manager Add | T04, T05, T06, T08 |
| AC8 search/reason/idempotency/retry | T01, T04, T06, T08 |
| AC9 success refresh and audited existing backend path | T04, T05, T06, T08 |
| AC10 no backend/dependency/other-workspace changes | T00, T06, T08, T09 |
| AC11 complete automated/native verification | T06, T09 |
| AC12 rendered responsive states/no live add | T07, T09 |
| AC13 content-fit text and transcript spacing | T10, T12, T13 |
| AC14 tap-to-view image and no Open button | T11, T12, T13 |
| AC15 compact audio width without regression | T10, T12, T13 |
| AC16 chevron removal and retained actions | T15, T16, T17 |
| AC17 symmetric swipe reply and reset | T14, T15, T16, T17 |
| AC18 permission, scrolling, media and accessibility safety | T14, T15, T16, T17 |

## Parallel execution boundaries

If Mode A is selected:

- T00 runs first and freezes the contracts.
- T01, T02 and T03 may run in parallel because they own data contracts, audio bubbles and attachment chooser respectively.
- T04 begins only after T01 participant adapters/query keys are stable. It owns new participant UI files and must not edit `ChatThread`.
- T05 begins after T01 and T04 finish. The primary owns `ChatThread`/`useChatThread` integration and cross-query behavior.
- T06 runs only after all writers stop. Tests during concurrent edits are provisional; final verification uses the integrated tree.
- T07 follows functional integration. T08 integrity review and T09 verification run sequentially after the tree is stable.
- Every agent must inspect current shared files before editing, preserve unrelated work and report contract changes immediately rather than inventing fallbacks.

If Mode B is selected, the primary executes the same dependency order inline without implementation subagents.

For the follow-up in Mode A, T10 and the new-file portion of T11 may run in parallel because their write paths do not overlap. The primary then owns the `MessageBubble.tsx` image-viewer integration in T12. T13 review and verification run sequentially after all writers stop.

For swipe-to-reply in Mode A, T14 freezes the pure gesture contract first. T15 and T16 then run in parallel because they own MessageBubble and timeline/thread paths respectively, using the settled optional `onReply` interface. The primary integrates them before sequential T17 review and verification.

## Prior implementation evidence

- T01–T07 completed in the approved ownership order. Rendered emulator captures are retained only in `/tmp`: `lisno-audio-final.png`, `lisno-attachment-final.png`, `lisno-group-final.png` and `lisno-add-final.png`.
- T08 found two medium lifecycle gaps: thread-local state was not reset across an environment generation change, and eligible-participant options were not invalidated after a successful add. Both were corrected and covered by focused regressions.
- T09 passed 8 focused suites / 85 tests, 52 full suites / 373 tests, 1 contract suite / 3 tests and TypeScript. Expo dependency checking passed using its offline bundled map, and clean Android export, API 24/target 36 manifest inspection, arm64-v8a Gradle assembly, APK install and the checked-in emulator launch smoke passed.
- Final APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 87,502,449 bytes, SHA-256 `d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`.
- No participant was added during verification. Physical-device, TalkBack, API 24 hardware and the complete width/orientation/font-scale matrix were not run.

## Follow-up completion evidence

- T10–T12 completed in the approved Mode A ownership order. Integrity review identified and corrected Yoga expansion of auto-sized audio bubbles; plain voice notes now use 248 dp compact and 260 dp expanded widths, while rich audio can grow.
- Image-only messages now use a compact column metadata row and inline timestamp. The visible image **Open** action was removed; tapping the preview opens the authenticated contain-mode viewer, and Android Back closes it.
- T13 passed 5 focused suites / 37 tests, 53 full suites / 385 tests, 1 contract suite / 3 tests, TypeScript, clean Android export, arm64 Gradle assembly, APK launch smoke, `git diff --check`, whitespace and package-hash checks.
- Final APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 87,502,449 bytes, SHA-256 `d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`.
- API 37 emulator inspection covered compact message/image/audio spacing, full-screen image viewing and Back dismissal. Physical-device, TalkBack, API 24 hardware and the complete responsive/font-scale matrix remain unrun.

## Swipe-to-reply completion evidence

- T14 defined and tested the symmetric intent, clamp, commit, velocity and termination contract. T15 removed the permanent chevron and added bounded swipe animation, reduced-motion handling, accessibility actions and media-safe gesture arbitration. T16 wired the exact rendered message through timeline/thread, unified direct and action-sheet reply authorization, and synchronously fenced reply targets by owner key.
- T17 integrity review found no remaining material defect after the owner-tagged reply hardening. Final verification passed 7 focused suites / 88 tests, 54 full suites / 406 tests, 1 contract suite / 3 tests, TypeScript, clean Android export, arm64 Gradle assembly, exact APK install and the checked-in Android launch smoke.
- API 37 emulator inspection confirmed chevron removal, both reply directions, transient indicator motion, exact composer context, vertical scrolling, image viewing and media-control isolation. No message, upload or participant mutation was performed.
- Final APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 87,502,449 bytes, SHA-256 `d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`.
- `git diff --check`, untracked-text whitespace, package/lock hash and generated-artifact audits passed. Physical-device, TalkBack and broader Android device/width/font-scale certification remain pending.

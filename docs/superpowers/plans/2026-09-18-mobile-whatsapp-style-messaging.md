# Lisno mobile WhatsApp-style messaging task plan

Date: 2026-09-18
Status: Implementation delivered; remaining device-certification gates recorded
Specification: [Mobile WhatsApp-style messaging redesign](../specs/2026-09-18-mobile-whatsapp-style-messaging-design.md), approved by the user on 2026-09-18
Execution mode: A — parallel sub-agents, selected by the user on 2026-09-18

## Delivery contract

Replace the generic Android conversation cards and page-scrolled message cards with a dedicated native messaging workspace. Deliver a compact project-conversation list, an immersive phone thread, an expanded split view, grouped incoming/outgoing bubbles, cursor history, safe read acknowledgement, realtime arrivals, message actions and a keyboard-aware composer while preserving current API, authorization, attachment, audio, issue-version and idempotency behavior. The final visual pass follows the user-supplied Lisno web project-messaging screenshots, including the muted header, patterned canvas, soft-green outgoing bubbles, authenticated image previews and inline voice-note rows.

The implementation must not add backend routes, schemas, permissions or dependencies. It must not invent last-message previews or infer ownership from display names. Existing routes `/feature/messages` and `/record/messages/:recordId` remain compatible. Unrelated `.idea/`, onboarding work and other feature code remain untouched.

## Ownership and dependency order

- The primary agent owns the approved product interpretation, shared route/scaffold integration, query-key contract, documentation, final reconciliation and final changed-path audit.
- In Mode A, a data/model writer owns T01–T02; a conversation-list writer owns T03 after the presentation contract settles; a thread writer owns T04–T06 after the message model settles. The primary owns T07. Writers may add their named focused tests but must not edit each other's paths.
- In Mode B, the primary performs T01–T09 sequentially.
- The integrity review starts only after every product writer stops. Final verification runs after confirmed findings are fixed against the integrated tree.

## T01 — Capture the baseline and freeze invariants

**Owner:** Data/model writer in Mode A; primary in Mode B.

**Paths:** Read-only inspection plus the plan's progress section. No product changes.

- Capture the initial dirty-path set and relevant current file contents for `mobile/src/features/messages/**`, `FeatureWorkspace.tsx`, `RecordDetailScreen.tsx`, `AdaptiveAppScaffold.tsx`, route files and focused tests.
- Record representative current conversation-list and thread screenshots before redesign when the development session/backend is available.
- Run current messaging model tests and the mobile typecheck to distinguish pre-existing failures from redesign regressions.
- Freeze these invariants:
  - server project ID, message ID, author ID, sequence and version remain authoritative;
  - permissions/capabilities come from the authenticated session and backend payload;
  - client message/upload identities retain current retry semantics;
  - staged files and recordings are cleaned on removal, project change, denial and unmount;
  - query/cache identity includes environment, user and project;
  - read state never advances across an unloaded unread-history gap.

**Acceptance evidence:** baseline commands/results and dirty targets are recorded before writer edits; no unrelated path is reformatted or replaced.

## T02 — Build typed presentation and paging models

**Owner:** Data/model writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/messages/chatModel.ts`, new model/query-key helper files under `mobile/src/features/messages/`, and focused pure tests. Do not edit UI, routes or the scaffold.

- Add defensive presenters for conversation pages, chat summary and message pages using the existing backend shapes.
- Preserve `author.id`, name and role in each presented message so outgoing ownership compares only with `session.user.id`.
- Model project identity/status, participant count, last activity, unread/mention/critical counts, capabilities, pagination and setup warnings without filling missing values with invented business data.
- Add pure helpers for:
  - deterministic project initials;
  - today/date activity formatting inputs;
  - merging offset conversation pages by stable project ID while preserving server order;
  - merging cursor message pages by stable message ID/version and sorting by sequence;
  - sender/day grouping and date separators;
  - unread-boundary placement;
  - selecting a safely readable message when earlier unread history may still be unloaded;
  - accessibility summaries for conversation rows and messages.
- Keep existing `createClientMessageId` and `createClientUploadId` behavior compatible.

**Acceptance evidence:** focused tests cover malformed payloads, duplicate pages, newer message versions, unequal author IDs with equal names, sequence gaps, missing activity dates, unread mentions, critical counts, day boundaries and unsafe read gaps.

## T03 — Implement the dedicated conversation list

**Owner:** Conversation-list writer in Mode A; primary in Mode B.

**Paths:** new `mobile/src/features/messages/ConversationList*.tsx`, `MessagesWorkspace.tsx` and focused list tests. Do not edit thread/composer files, routes or scaffold.

- Fetch `/project-messages` with environment/user-scoped infinite queries using the existing offset contract.
- Render a native virtualized list with compact header, refresh action, pull-to-refresh, skeleton rows, retained stale-data warning, empty/denied states and continuation retry.
- Render each row with initials avatar, project name, participant/status secondary line, last activity time, unread count, mention badge and critical indicator from T02 data.
- Aggregate row accessibility into one useful announcement and hide decorative initials/badges from separate focus.
- Keep the selected row visually stable on expanded layouts and expose a callback/route action without owning navigation.
- Reconcile duplicate project IDs and prevent concurrent `onEndReached` calls from issuing duplicate pages.

**Acceptance evidence:** component tests cover read/unread styling semantics, all badges, accessible row labels, refresh, retained error, empty, denied, pagination, duplicate-page reconciliation and selected state.

## T04 — Implement query-backed thread state and realtime behavior

**Owner:** Thread writer in Mode A; primary in Mode B.

**Paths:** new message-owned hook/state files under `mobile/src/features/messages/`, `ChatConversation.tsx` if retained as the composition root, and focused hook/state tests. Do not edit list, routes or scaffold.

- Fetch the existing `/projects/:projectId/chat` summary and cursor-based message pages with environment/user/project-scoped query keys.
- Open at the latest page, load older pages using the returned cursor and merge through T02 helpers.
- Maintain one project-scoped realtime stream. Relevant message/issue/read events invalidate or refresh list, summary and history without opening a stream on the list-only screen.
- On project/session/environment change, cancel stale work and prevent old responses/events from updating the new thread.
- Track whether the user is near the bottom. Realtime arrivals scroll only when near bottom; otherwise set a new-message indicator.
- Add viewability-driven read acknowledgement guarded by the safe-read helper. Keep failures visible/retryable and invalidate list/summary counts after success.

**Acceptance evidence:** tests cover latest/older paging, anchor metadata, stream start/stop/resync/denial, project switching, near-bottom arrivals, new-message indicator, safe read advancement, gap refusal and read failure/retry.

## T05 — Build the virtualized timeline and message bubbles

**Owner:** Thread writer in Mode A; primary in Mode B.

**Paths:** new `ChatTimeline.tsx`, `MessageBubble.tsx`, attachment presentation components and focused render tests.

- Replace the page-scrolled card stack with a virtualized chronological timeline that preserves the visible item when older pages prepend.
- Render incoming bubbles left and current-user bubbles right using Lisno surfaces. Bound bubble width per the approved compact/expanded rules.
- Group consecutive messages by stable author/day, add date separators and place the unread separator at the server read boundary.
- Render sender, body, time, sent state, priority/issue chips, reply quote and attachments in accessible reading order.
- Keep attachment downloads authenticated through the existing transfer service. Show real filename, kind and byte size; load image previews to private local URIs and voice content only after a play action. Do not introduce remote bearer URLs.
- Add the **New messages** pill and a beginning-of-conversation/empty state.
- A visible tap target opens the message action sheet; long press invokes the same action as an optional shortcut.

**Acceptance evidence:** tests cover own/incoming identity, grouping, day/unread separators, long content, attachment-only messages, reply quotes, critical/resolved states, bubble action discoverability, new-message navigation and compact/expanded width styles.

## T06 — Rebuild message actions and the fixed composer

**Owner:** Thread writer in Mode A; primary in Mode B.

**Paths:** new `MessageActionSheet.tsx`, `ChatComposer.tsx`, attachment/recording tray components, replacement/refactor of `ChatConversation.tsx`, and focused tests.

- Move Reply and capability-derived issue actions into an accessible modal bottom sheet/action overlay. Back closes the overlay first and focus returns to the originating message action.
- Preserve issue version/idempotency, required notes, allowed transitions and 409 conflict refresh behavior.
- Place a keyboard-aware composer at the bottom safe area with multiline input, attachment control, voice control and circular send action.
- Present priority selection as a compact importance overlay/control while retaining normal as default.
- Show reply preview, selected/staged attachments, recording status, progress and targeted error/retry controls directly above the input.
- Preserve the current attachment policy, MIME/size/count limits, foreground recording interruption behavior and cleanup.
- Keep the same client message ID after an ambiguous/failed send. Renew it only after draft mutation or confirmed success; block duplicate submits while pending.
- Hide the composer for read-only access and show a compact non-disclosing permission message.

**Acceptance evidence:** tests cover send enablement, multiline draft, retry identity, success reset, reply/cancel, priority, file choose/upload/remove, upload error, voice start/stop/limit/interruption, unmount cleanup, issue actions/conflict, read-only access, keyboard/Back ordering and accessible labels.

## T07 — Integrate routes, immersive phone chrome and expanded split view

**Owner:** Primary.

**Paths:** `mobile/src/features/workspace/FeatureWorkspace.tsx`, `RecordDetailScreen.tsx`, `mobile/src/app/feature/[featureId].tsx`, `mobile/src/app/record/[featureId]/[recordId].tsx`, `mobile/src/navigation/AdaptiveAppScaffold.tsx`, message exports and focused route/scaffold tests.

- Route only the Messages destination to `MessagesWorkspace`; all other generic feature rendering remains unchanged.
- Route message records to the dedicated thread composition instead of the generic detail `ScrollView`.
- Add a narrowly scoped scaffold option that hides the global top bar/root tab bar for a phone thread while retaining safe areas and normal Back behavior. Other screens retain current chrome.
- At 600 dp and above, compose the conversation list and selected thread side by side inside the existing navigation rail boundary. Preserve list page/scroll while selection changes.
- Keep the approved existing paths and authorization resolution. Invalid, missing, denied or unscoped project IDs remain non-disclosing.
- Ensure phone Back returns to the conversation list after transient overlays/reply state are closed.

**Acceptance evidence:** route tests cover list, phone thread, direct thread deep link, denied thread, Back ordering, other features' unchanged scaffold, 599/600 dp breakpoint, selected row and expanded list-state preservation.

## T08 — Integrity review and corrections

**Owner:** `integrity_reviewer` in Mode A; primary inline in Mode B.

Review the integrated implementation for:

- authorization and backend capability enforcement;
- stable project/message/author ID lineage;
- environment/user/project query isolation and stale-response fencing;
- read high-water correctness across cursor gaps;
- message/upload idempotency and retry behavior;
- recording, stream, timer, modal and staged-attachment cleanup;
- pagination ordering, duplicate pages and viewport-anchor stability;
- phone/expanded routing and Back behavior;
- keyboard, safe-area, large-text and screen-reader usability;
- accidental backend/dependency/lockfile/unrelated changes.

Resolve confirmed findings before final verification and rerun the smallest affected focused checks after each correction.

## T09 — Final verification and handoff

**Owner:** `verification_runner` in Mode A; primary inline in Mode B. No concurrent writers.

Run from `mobile/` unless stated otherwise:

1. Focused message model/list/thread/composer/route tests with `--runInBand`.
2. Existing auth, navigation, query invalidation, file-transfer, audio-session and SSE regression tests touched by the integration.
3. `npm run typecheck`.
4. `npm test -- --runInBand` once against the final integrated tree.
5. `npm run test:contracts` to prove protected-operation drift remains intact.
6. A clean temporary Android export.
7. Direct arm64-v8a Gradle debug assembly and installed-app launch smoke on the available emulator.
8. Rendered Android QA with representative seeded/mocked development data:
   - list loading, populated, unread/mention/critical, stale error and empty states;
   - phone thread with incoming/outgoing grouping, reply, attachment, issue action and composer;
   - keyboard open, multiline input, file tray, recording, send failure/retry and realtime arrival away from bottom;
   - older-history prepend without jump and safe unread acknowledgement;
   - hardware Back ordering;
   - 320/360/412 dp portrait and landscape;
   - 600/800 dp split view and live resize;
   - font scale 1.0 and 2.0, reduced motion and available TalkBack checks.
9. From the repository root, run `git diff --check`, inspect `git status --short`, verify the scoped changed-path set and check new untracked text files for whitespace.

Update `mobile/README.md`, `mobile/docs/android-support.md` and `mobile/docs/feature-parity.md` only with observed final behavior and exact evidence. Record unavailable backend scenarios, device sizes, TalkBack or physical-device lanes as unrun rather than inferred.

## Acceptance-to-task trace

| Specification criterion | Tasks |
| --- | --- |
| AC1 compact data-backed conversation rows | T02, T03, T09 |
| AC2 list states, refresh and pagination | T03, T09 |
| AC3 immersive phone thread and fixed composer | T05, T06, T07, T09 |
| AC4 expanded split view and stable selection | T03, T07, T09 |
| AC5 ID-based incoming/outgoing grouped bubbles | T02, T05, T08 |
| AC6 capability-derived reply/issue actions | T05, T06, T08 |
| AC7 complete composer/file/voice/retry behavior | T06, T08, T09 |
| AC8 cursor stability and realtime arrivals | T02, T04, T05, T09 |
| AC9 safe read acknowledgement | T02, T04, T08, T09 |
| AC10 cleanup and scope isolation | T04, T06, T08 |
| AC11 accessibility and responsive matrix | T03, T05, T06, T07, T09 |
| AC12 complete checks and no external mutation | T08, T09 |

## Parallel execution boundaries

If Mode A is selected:

- T01–T02 run first because every UI slice depends on their normalized models and helpers.
- After T02 is integrated, T03 may proceed in parallel with T04–T06 because the list writer owns only `ConversationList*` and `MessagesWorkspace*`, while the thread writer owns only thread/timeline/bubble/composer/action files.
- The primary settles shared query-key and callback interfaces before those writers start and owns any change to common UI tokens.
- T07 waits for list and thread writers. No worker edits `FeatureWorkspace.tsx`, `RecordDetailScreen.tsx`, app routes or `AdaptiveAppScaffold.tsx` except the primary.
- T08 and T09 run sequentially after all product writers stop.

No task is authorized to commit, push, deploy, publish, seed, migrate, add signing material or mutate production.

## Implementation and verification evidence

Delivered on 2026-09-18 against the approved specification and the user-supplied web messaging reference.

- Dedicated message routing, compact project rows, the immersive phone thread, the 600 dp split boundary, cursor history, safe visible-message read acknowledgement, realtime refresh, grouped bubbles, action overlays and the fixed composer are integrated.
- Authenticated image/file transfers and inline voice-note playback keep private artifacts local. Transfer cleanup, owner-scoped playback, recording/playback transition serialization and 48 dp media controls passed the final integrity review with no remaining material finding.
- `npm run typecheck` passed.
- The focused verification lane passed 12 suites and 81 tests. The final complete lane passed 49 suites and 268 tests with `--runInBand --forceExit`; all assertions passed, while Jest retained its known open-handle warning when allowed to exit naturally.
- `npm run test:contracts` passed 1 suite and 3 tests.
- `npx expo export --platform android --output-dir /tmp/lisno-mobile-messaging-export-final-20260918` passed and produced a 5,551,827-byte Hermes bundle.
- Direct arm64-v8a Gradle debug assembly passed with 380 actionable tasks, producing `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
- The fresh APK installed on `emulator-5554`; `npm run test:e2e:android` passed after putting SDK platform-tools on `PATH`.
- Rendered emulator QA opened Messages, selected Villa, inspected the conversation options and rotated the active thread. It confirmed the compact web-referenced portrait list/thread and the landscape navigation-rail/list/thread split view, including the muted project header, critical indicator, warm patterned timeline, authenticated image preview, inline audio rows and fixed pale composer.
- `git diff --check` and an untracked text-file whitespace sweep passed. Unrelated `.idea/` content remained untouched.

The full 320/360/412/600/800 dp, landscape, font-scale-2, TalkBack, reduced-motion and physical-device matrix remains unrun. Native Expo audio timing is covered through the adapter contract; recording/container acceptance and Bluetooth/interruption behavior still require device instrumentation and backend validation. No lint script exists. No backend, OCR, schema, migration, commit, push, deploy or production action was performed.

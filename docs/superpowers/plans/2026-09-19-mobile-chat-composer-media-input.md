# Lisno mobile chat composer media and native input task plan

Date: 2026-09-19
Status: Approved; implementation in progress
Specification: [Mobile chat composer media and native input](../specs/2026-09-19-mobile-chat-composer-media-input-design.md), approved by the user on 2026-09-19
Execution mode: A — parallel sub-agents, selected by the user on 2026-09-19

## Delivery contract

Extend the existing Android project-chat composer without changing backend contracts or adding dependencies. The paperclip must open a responsive Photo/Camera/File choice surface; all three sources must converge on the current authenticated staging and idempotent send path. The smiley must stop inserting a hard-coded character and instead focus the native Android input method. Voice notes must retain explicit tap-to-record, Stop/Cancel, secure staging, and explicit Send, with clearer elapsed and ready states.

Preserve project authorization, environment/user/project isolation, attachment cleanup, audio ownership, read gating, Back ordering, query identity, send retry identity, Android API 24 support, and unrelated work. Do not touch backend behavior, schemas, route registries, OpenAPI, web messaging, `.idea/`, onboarding, signing, production data, or deployment.

## Ownership boundaries

- The primary agent owns product interpretation, shared types/contracts, task sequencing, app configuration, cross-slice integration, documentation, final reconciliation, and final changed-path review.
- In Mode A, a **platform media writer** owns native Photo/Camera/File selection and pending-result recovery under `mobile/src/platform/files/**`.
- In Mode A, a **composer UI writer** owns the new attachment-options component, its focused tests, and message-specific icon additions. It does not edit selection, upload, audio, or composer orchestration.
- In Mode A, a **composer integration writer** owns `ChatComposer.tsx`, `ComposerTray.tsx`, and their focused tests after the platform/UI interfaces settle. It does not edit platform adapters, app config, backend files, or shared navigation.
- The primary agent owns `mobile/app.config.ts`, `app.config.test.ts`, any necessary narrow `ChatThread` integration, mobile documentation, and all shared-interface reconciliation.
- In Mode B, the primary performs T00–T09 sequentially without implementation subagents.
- Integrity review and final verification run only after all product writers have stopped and the integrated tree is stable.

## T00 — Capture baseline and preserve the dirty worktree

**Owner:** Primary.

**Paths:** Read-only inspection; progress section of this plan only after implementation begins.

- Capture `git status --short` and the relevant current contents/diffs for:
  - `mobile/src/features/messages/ChatComposer.tsx`
  - `ComposerTray.tsx`
  - `ChatIcon.tsx`
  - `ChatThread.tsx`
  - `mobile/src/platform/files/selection.ts`
  - `mobile/src/platform/audio/audioSession.ts`
  - `mobile/app.config.ts`
  - their focused tests.
- Preserve the existing untracked `mobile/` implementation, the approved messaging/onboarding documents, and unrelated `.idea/` content.
- Run the current focused composer/selection/audio tests and mobile typecheck to establish the comparison baseline.
- Freeze these invariants:
  - backend `chat.send`, policy capabilities, stable project/user/environment identity, and attachment policy remain authoritative;
  - one selected asset maps to one stable staged upload identity;
  - send retry reuses the exact frozen message payload and client message ID;
  - no selection, picker recovery, upload, or recording result crosses environment/user/project scope;
  - uncommitted staged media is removed on discard/access loss/logout/unmount unless already committed in a pending send;
  - voice-note Stop stages content and never auto-sends.

**Acceptance evidence:** Initial dirty paths and baseline command results are recorded; no unrelated file is assigned or reformatted.

## T01 — Extend the native media-selection platform

**Owner:** Platform media writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/platform/files/selection.ts`, new focused platform-file helpers if needed, `mobile/src/platform/files/index.ts`, and selection/recovery tests. Do not edit message UI, upload transport, audio, app config, or backend files.

- Retain `pickDocument` and the current policy validator.
- Refine `pickImage` for the Photo action using single-image selection, original quality, no crop/edit, no base64, and no broad Android media permission when the system picker grants access to the selected item.
- Add a typed Camera flow that:
  - requests permission only after the Camera action;
  - distinguishes selected, cancelled, temporarily denied, permanently denied, and unavailable/invalid outcomes;
  - launches still-image capture only;
  - normalizes safe URI, name, MIME, byte size, width, and height;
  - validates the result against server-derived image MIME policy.
- Add exact local byte-size resolution for `file://` and readable `content://`/cached assets when the picker omits size. Never guess or reserve zero bytes.
- Add a short-lived pending-image-selection marker using the existing local storage foundation. Persist only source, environment ID, user ID, project ID, and expiry; never persist URI, filename, bytes, draft text, or credentials.
- Add a scoped recovery adapter around `ImagePicker.getPendingResultAsync`:
  - consume only when marker and active composer scope match;
  - reject mismatched, expired, malformed, denied, or already-consumed results;
  - clear on selection, cancel, denial, explicit cleanup, logout/environment change, or expiry.
- Keep platform errors typed so the composer can distinguish silent cancellation from permission/settings and validation failures.

**Acceptance evidence:** Focused tests cover Photo/Camera/File selected/cancelled results, camera grant/temporary denial/permanent denial, unavailable camera, invalid/empty result, missing-size resolution/failure, MIME and size policy, safe fallback filenames, matching recovery, cross-project/user/environment rejection, expiry, and single consumption.

## T02 — Build the responsive attachment-options surface

**Owner:** Composer UI writer in Mode A; primary in Mode B.

**Paths:** New `mobile/src/features/messages/AttachmentOptionsSheet.tsx` (or equivalently named message-owned component), its focused test, and `ChatIcon.tsx`. Do not edit `ChatComposer.tsx`, selection/upload/audio services, `ChatThread.tsx`, app config, or backend files.

- Build the approved Photo/Camera/File surface using React Native primitives and Lisno chat tokens.
- Expose controlled props for visibility, availability, busy/disabled state, close, and the three source callbacks. The component owns no authorization or upload rules.
- Phone behavior: bottom-anchored rounded panel above the composer with a dismissible backdrop.
- Expanded behavior: bounded panel within the thread pane, visually associated with the paperclip and never stretched across the complete split view.
- Use three icon+label actions in the approved order with accessible names **Choose a photo**, **Take a photo**, and **Choose a file**.
- Add code-native photo, camera, file, stop, and any required composer glyphs to `ChatIcon`; do not use functional emoji/text glyphs.
- Support outside-tap and Android modal Back dismissal, initial focus on Photo, and focus-restoration callback for the paperclip.
- Every actionable target is at least 48 × 48 dp. At font scale 2.0, actions may wrap or form a vertical list without clipping.
- Respect reduced motion; do not require animation for state comprehension.

**Acceptance evidence:** Render tests cover compact/expanded composition, labels/order, 48 dp targets, disabled/busy/expanded state, backdrop dismissal, modal Back, callbacks, large-text wrapping semantics, and accessible modal/action names.

## T03 — Configure Android camera ownership

**Owner:** Primary.

**Paths:** `mobile/app.config.ts`, `mobile/app.config.test.ts`. Do not edit generated native files manually.

- Add explicit `expo-image-picker` config using Lisno camera/photo permission language.
- Give image picker and `expo-audio` the same Lisno voice-note permission copy. Verified Expo behavior treats image picker's `microphonePermission: false` as a manifest-wide removal of `RECORD_AUDIO`, so it cannot be used while voice notes are enabled; `expo-audio` remains the only recording implementation.
- Preserve the existing explicit recording permission, API 24 minimum, cleartext environment rules, package identity, splash, and signing boundaries.
- Assert configuration through `createAppConfig` tests and confirm generated/merged Android manifest output through prebuild/build verification later.

**Acceptance evidence:** App-config tests prove camera/image-picker copy, explicit recording permission, minimum SDK, package/environment validation, and cleartext behavior; generated and merged manifests retain `CAMERA` and `RECORD_AUDIO`.

## T04 — Integrate source selection, limits, upload, and native emoji input

**Owner:** Composer integration writer in Mode A; primary in Mode B. Begins only after T01 and T02 interfaces are settled.

**Paths:** `mobile/src/features/messages/ChatComposer.tsx`, `ComposerTray.tsx`, and focused composer tests. Request primary integration for any shared-contract change; do not edit platform adapters, icons, app config, navigation, or backend files.

- Retain `formats[].kind`, label, extensions, and MIME types in the local attachment-policy shape.
- Replace direct document selection with controlled attachment-options state.
- Derive Photo and Camera availability from policy image MIME types. File uses the complete server MIME allowlist.
- Close the choice surface before invoking a system picker, then route the selected asset through one shared validation/staging function.
- Before upload, enforce returned limits:

```text
next count = staged.length + 1
next bytes = sum(staged.attachment.byteSize) + candidate.size
```

- Enforce `maxAttachments`, `maxFileBytes`, and `maxMessageBytes` locally while retaining backend authority.
- Keep one active selection/upload at a time. Reopening the panel allows another item until limits are reached.
- Preserve current stable upload ID across a retry of the same selected asset and renew it only when the draft asset changes or upload succeeds.
- Show truthful selected/uploading/progress/ready/retry/remove state and formatted byte limits in the composer tray.
- Add Open settings handling for permanent camera denial without hiding Photo/File.
- Recover a matching Android pending photo/camera result through the T01 coordinator and fence it by current environment, user, project, session generation, policy, and mounted ownership.
- Replace hard-coded `🙂` insertion with a `TextInput` ref and **Open device emoji keyboard** action that focuses the native IME without modifying the draft.
- Preserve current caret/selection and normal `onChangeText` behavior for Unicode/ZWJ/skin-tone sequences and retry identity.
- Raise paperclip, smiley, importance, microphone/send, and any tray action targets to at least 48 dp.
- Treat attachment-options visibility and priority visibility as mutually safe composer overlays. `onOverlayChange(true)` must remain active while either is open.
- Add attachment-options state to the composer transient-state/Back ordering before recording, upload selection, reply, staged attachment, priority, and route navigation.

**Acceptance evidence:** Focused tests cover choice open/close/Back/overlay, three source routes, source-policy filtering, cancellation, permission/settings errors, count/per-file/aggregate limits, missing-size result, staged send, attachment-only and captioned send, retry identity, access loss, pending-result recovery, emoji focus/no mutation, Unicode text change, 48 dp controls, and cleanup.

## T05 — Complete the visible voice-note send journey

**Owner:** Composer integration writer in Mode A; primary in Mode B, within the same T04 ownership to avoid overlapping composer edits.

**Paths:** `ChatComposer.tsx`, `ComposerTray.tsx`, and their tests only. Reuse `audioSession`; change it only through a primary-owned contract revision if a confirmed defect requires it.

- Keep the tap-based microphone interaction and existing permission/audio-session ownership.
- Add a startup lock/visible requesting state so repeated taps cannot start overlapping permission/configuration operations.
- Show elapsed `m:ss` from a low-frequency composer timer after recording starts. Do not announce every tick.
- Keep explicit Stop and Cancel. Stop or duration limit stages/uploads the private `.m4a`; neither auto-sends.
- Show preparing, upload progress, and a truthful voice-note **Ready to send** row with Remove/Retry as applicable.
- Allow an optional caption after staging, then require the existing Send action.
- Preserve background/access-loss/project-change/logout/unmount cleanup and recording/playback serialization.
- Do not add hold/swipe gestures, transcription, background recording, effects, or autoplay.

**Acceptance evidence:** Tests cover startup lock, permission denial, active timer, Stop, Cancel, duration limit, completion event to upload, voice-only send, captioned send, upload failure/retry/remove, foreground interruption, cleanup, and no auto-send.

## T06 — Reconcile thread overlay, Back, read, and navigation behavior

**Owner:** Primary.

**Paths:** `mobile/src/features/messages/ChatThread.tsx` and its focused test only if the existing callback contract needs a narrow adjustment; otherwise verification-only.

- Confirm attachment and priority overlays pause viewability-driven read acknowledgement.
- Confirm hardware Back ordering:
  1. native system picker handles its own Back;
  2. attachment or priority overlay closes;
  3. keyboard hides through normal Android IME behavior;
  4. active recording/upload/reply/staged/priority transient state is handled by the composer;
  5. thread returns to the conversation list.
- Confirm pending send continues to block thread navigation and root scaffold actions.
- Ensure switching project cannot carry the attachment menu, native-picker recovery, draft, selection, staged media, recording, or error state into another thread.

**Acceptance evidence:** Thread tests cover overlay/read gating, Back ordering, pending-send lock, focus return, project switch, and unchanged behavior for the header/message action overlays.

## T07 — Integrated UI and lifecycle regression coverage

**Owner:** Primary after writers stop.

**Paths:** Existing focused tests under `mobile/src/features/messages`, `mobile/src/platform/files`, `mobile/src/platform/audio`, `mobile/src/navigation`, and config tests. Product-source edits only to correct confirmed integration defects.

- Run focused selection, transfer, composer, tray, thread, audio-session, scaffold, environment/config, and contract-drift tests.
- Add no tests that merely mirror implementation; target permission, lifecycle, cross-scope, cleanup, retry, Back, and accessibility regressions.
- Validate Photo/Camera/File with server-returned asymmetric limits, including unequal staged sizes so aggregate-byte mistakes cannot pass.
- Validate stale selection/recovery results from another environment, user, and project.
- Validate native emoji input with a multi-code-point family or profession sequence and a skin-tone modifier, not only one BMP character.
- Confirm no new dependency or lockfile change and no backend/frontend/OCR source edit.

**Acceptance evidence:** Every specification criterion has at least one focused automated or explicitly rendered/device verification result.

## T08 — Integrity review and correction

**Owner:** `integrity_reviewer` in Mode A; primary inline in Mode B.

Review the stable integrated tree for:

- backend-derived permission/capability enforcement;
- environment/user/project/session fencing of picker recovery and async completions;
- camera and microphone permission timing/ownership;
- exact byte resolution and per-file/count/aggregate policy checks;
- upload/message idempotency and staged cleanup under cancellation/unmount/pending send;
- recording startup/finalization/playback races and resource ownership;
- read acknowledgement while overlays/native pickers are active;
- Android Back, keyboard, focus restoration, large text, safe areas, and 48 dp targets;
- exposure of filenames, URIs, tokens, bytes, participant data, or draft content in persistent markers/logs;
- accidental backend/dependency/lockfile/generated-native/unrelated changes.

Resolve every confirmed material finding and rerun the smallest affected focused lane before T09.

## T09 — Final verification and handoff

**Owner:** `verification_runner` in Mode A; primary inline in Mode B. No concurrent writers.

Run from `mobile/` unless stated otherwise:

1. Focused selection, attachment-options, composer, tray, thread, audio, transfer, navigation, and app-config tests with `--runInBand --forceExit` if the known Jest open handle persists.
2. `npm run typecheck`.
3. `npm test -- --runInBand --forceExit` once against the final integrated tree.
4. `npm run test:contracts`.
5. `npx expo install --check` when registry access is available.
6. Clean Android export to a temporary path.
7. Expo prebuild/native configuration verification without retaining unrelated generated changes.
8. Direct arm64-v8a Gradle debug assembly.
9. Fresh APK install and checked-in Android launch smoke on the available emulator.
10. Rendered interaction QA with synthetic, non-sensitive content:
   - Photo/Camera/File panel open, dismissal, labels, focus, and Back;
   - gallery selection and cancel;
   - camera grant, temporary/permanent denial when reproducible, capture and cancel;
   - document selection, progress, ready, remove, retry, attachment-only send, and captioned send;
   - native keyboard focus from smiley, Unicode emoji entry, keyboard Back, and unchanged draft on smiley tap;
   - voice request, active timer, Stop, Cancel, ready, caption, explicit Send, and background interruption;
   - 320/360/412 dp portrait, short landscape, 600/800 dp split behavior where tooling permits;
   - font scale 1.0/2.0, gesture/three-button navigation, reduced motion, and TalkBack where available.
11. From the repository root: `git diff --check`, trailing-whitespace sweep for new untracked text, `git status --short`, changed-path audit, dependency/lockfile audit, and generated-artifact audit.

Update `mobile/README.md`, `mobile/docs/android-support.md`, `mobile/docs/feature-parity.md`, the approved specification status, and this plan's evidence section only with observed final results. Report unavailable API-level, keyboard-vendor, camera hardware, physical-device, permission, TalkBack, or activity-recreation lanes as unrun.

No migration, seed, production data mutation, deployment, publication, commit, push, signing change, or external communication is authorized.

## Acceptance-to-task trace

| Specification criterion | Tasks |
| --- | --- |
| AC1 attachment choice surface | T02, T04, T09 |
| AC2 Photo selection/cancellation | T01, T04, T07, T09 |
| AC3 Camera permission/capture/settings | T01, T03, T04, T07, T09 |
| AC4 File selection/full allowlist | T01, T04, T07, T09 |
| AC5 exact bytes, limits, staging, explicit send | T01, T04, T07, T08 |
| AC6 scoped activity-recreation recovery | T01, T04, T07, T08 |
| AC7 smiley opens native input without mutation | T04, T06, T09 |
| AC8 Unicode/caret/edit/retry integrity | T04, T07, T08 |
| AC9 complete voice-note journey | T05, T07, T08, T09 |
| AC10 overlay/read/Back/focus | T02, T04, T06, T08 |
| AC11 accessibility/responsive matrix | T02, T04, T06, T09 |
| AC12 regression preservation | T06, T07, T08, T09 |
| AC13 complete checks and disclosed device gaps | T09 |

## Parallel execution boundaries

If Mode A is selected:

- T00 runs first.
- T01, T02, and T03 may run in parallel because their owned files do not overlap.
- The primary freezes these interfaces before writers begin:
  - selection result/permission/recovery types from T01;
  - controlled attachment-options props from T02;
  - unchanged backend attachment-policy and upload contracts.
- T04–T05 run after T01 and T02 finish, with one composer integration writer owning both to avoid concurrent edits to `ChatComposer.tsx` and `ComposerTray.tsx`.
- T06 waits for composer integration. T07 runs only after all implementation writers stop.
- T08 integrity review and T09 final verification run sequentially on the integrated tree.
- Agents must treat the shared worktree as concurrent, inspect current content before edits, preserve others' changes, and never revert or reformat outside their owned paths.

If Mode B is selected, the primary executes the same dependency order inline.

## Final evidence — 2026-09-19

- Integrity review found no remaining confirmed material defect after cleanup-order, immediate-Back, expanded outside-dismissal and detailed per-file-limit corrections.
- Final focused verification passed 7 suites and 106 tests; TypeScript passed; the complete mobile suite passed 50 suites and 334 tests; contract drift passed 3 tests.
- Clean Android export and Expo prebuild passed. Generated, merged and packaged native configuration retains minimum API 24, `CAMERA` and `RECORD_AUDIO`.
- Final arm64-v8a Gradle debug assembly passed. The 87,502,449-byte APK has SHA-256 `d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`, installed successfully on `emulator-5554` and passed the checked-in launch smoke.
- Package and lockfile hashes remained unchanged. Repository hygiene checks passed, with no backend, frontend or OCR source change.
- Expo dependency validation used its offline bundled map. Physical devices, API 24 hardware, vendor keyboard/camera behavior, manual picker and microphone permission flows, activity recreation, TalkBack and the full width/font/orientation matrix remain unrun. No real message or upload was sent.

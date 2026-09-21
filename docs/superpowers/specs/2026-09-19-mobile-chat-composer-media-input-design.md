# Lisno mobile chat composer media and native input

Date: 2026-09-19
Status: Implemented and verified on the available API 37 arm64 emulator; physical-device and extended accessibility/device-matrix lanes remain recorded gaps
Classification: Substantial Android composer interaction and native-media extension

## Goal

Extend the Android project-chat composer so the attachment control opens a WhatsApp-style choice surface with **Photo**, **Camera**, and **File** actions; users can select or capture supported content, stage it securely, and send it with or without text. Preserve and visibly complete the existing voice-note flow. Replace the current single hard-coded smile insertion with access to the user's normal Android keyboard so its supported emojis can be entered into the message field.

The result must preserve the approved Lisno messaging design, project authorization, private attachment lifecycle, idempotent send behavior, safe Back ordering, realtime/read-state behavior, and Android API 24 baseline.

## Current behavior and evidence

- `mobile/src/features/messages/ChatComposer.tsx` sends the paperclip directly to `pickDocument`. There is no Photo/Camera/File choice surface.
- `mobile/src/platform/files/selection.ts` already provides a single-image system photo-library picker with MIME/size validation, but the chat composer does not call it.
- There is no camera capture helper and no use of `expo-image-picker`'s `launchCameraAsync` or runtime camera-permission API.
- The smiley control currently appends one literal `🙂` at the end of the draft. It does not preserve the caret or open the device keyboard.
- Voice recording already requests microphone permission lazily, records Android-compatible MPEG-4/AAC into a private `.m4a`, stops at the server-provided limit, stages the result through the authenticated attachment upload, and requires the user to press Send. Cancellation, background interruption, project change, access loss, logout, and unmount cleanup already exist.
- The composer already fetches the authoritative attachment policy, stages one authenticated upload at a time, preserves stable upload/message identities for retry, deletes uncommitted staged files, supports attachment-only messages, and freezes the committed send payload while it is pending.
- The backend attachment policy already supports images, video, audio, documents, and ZIP. It supplies permission-derived upload/recording capabilities and the effective count, per-file, aggregate-message, staging, and recording limits. No backend route or schema change is required.
- Current focused baseline checks pass: `ChatComposer.test.ts`, `selection.test.ts`, and `audioSession.test.ts` passed 3 suites and 23 tests; `npm run typecheck` passed.

## Platform constraint and approved interpretation

Android gives an application control over focusing a text editor and showing the currently installed input method. It does not give an ordinary application a standard API to force Gboard, Samsung Keyboard, or another third-party input method directly into that keyboard's emoji tab. React Native exposes text-input focus and normal keyboard input, but no emoji keyboard mode.

The proposed behavior therefore interprets “normal device keypad” literally:

- Tapping the Lisno smiley focuses the message `TextInput` and opens the user's installed Android keyboard.
- The control does not mutate the draft or insert a placeholder emoji.
- The user uses that keyboard's own emoji key, search, recents, skin tones, and composed Unicode sequences.
- All text and emoji then enter through the normal `onChangeText` path and retain existing draft and retry semantics.

This follows the requested device-keyboard behavior. A one-tap app-owned emoji grid would be a different product choice, require an emoji catalog and maintenance or a new dependency, and would no longer be the normal device keypad. It is outside this specification unless the user changes this decision during spec review.

Official references: [React Native TextInput](https://reactnative.dev/docs/textinput), [Android InputMethodManager](https://developer.android.com/reference/android/view/inputmethod/InputMethodManager), and [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/).

## Attachment interaction

### Choice surface

- Rename the paperclip's accessible action to **Open attachment options**.
- Tapping it opens a rounded Lisno/WhatsApp-style attachment surface immediately above the composer on phones.
- Present three actions in this order:
  1. **Photo** — visible label; accessible name **Choose a photo**.
  2. **Camera** — visible label; accessible name **Take a photo**.
  3. **File** — visible label; accessible name **Choose a file**.
- Each action uses a clear code-native icon and a minimum 48 × 48 dp target. Do not use emoji or font glyphs as functional icons.
- On compact phones, use a bottom-anchored modal/panel with a dimmed dismissible backdrop. At expanded widths, cap the panel width and visually associate it with the paperclip instead of stretching across the thread.
- Opening the panel reports an active composer overlay to `ChatThread`, pausing visible-message read acknowledgement behind it.
- Outside tap and Android Back close the attachment panel before cancelling a recording, removing staged content, clearing reply/priority state, or leaving the conversation.
- Closing the panel restores accessibility focus to the paperclip when the platform focus API is available.
- The panel closes before launching any system picker so only one modal surface owns interaction at a time.

### Photo

- Open the Android/system photo-selection UI through the existing `expo-image-picker` dependency.
- Allow images only and intersect selection validation with MIME types returned under the server policy's `image` format.
- Select one image per invocation. Users can reopen the panel to add another image until the effective count and aggregate byte limits are reached.
- Preserve original quality and file bytes; do not crop, resize, add filters, strip metadata, or silently change format in this scope.
- Do not request broad media-library access when the platform system picker can grant access to the selected item.
- Cancellation is silent and returns to the unchanged draft.

### Camera

- Request camera permission only after **Camera** is tapped.
- If permission is granted, open the native still-camera capture through `expo-image-picker`. This action captures a photo only; video capture is not exposed under the Camera label.
- If permission is denied but can be requested again, show: **Camera access is needed to take a photo.** Photo and File remain usable.
- If permission is permanently denied, show: **Camera access is off. Enable it in Android Settings to take a photo.** Provide an accessible **Open settings** action using the system app-settings route.
- If no camera is available or the camera provider returns no valid asset, show a concise recoverable error without changing the draft.
- Normalize safe filename, MIME type, local URI, byte size, width, and height through the same asset validator as Photo and File.
- Configure `expo-image-picker` explicitly in `app.config.ts` with Lisno camera/photo permission copy. Expo ImagePicker's `microphonePermission: false` removes `RECORD_AUDIO` from the complete merged Android manifest, including the permission required by `expo-audio`; therefore both config plugins use the same Lisno voice-note permission copy while `expo-audio` remains the only recording implementation.

### File

- Open the existing Android system document picker.
- Use the complete MIME allowlist returned by the attachment policy. This remains the route for supported documents, ZIP, video, pre-recorded audio, and any supported image the user chooses from Files.
- Select one item per invocation and copy it to the app cache as the existing picker does.
- Cancellation is silent. Unsupported, unreadable, empty, oversized, or mismatched content retains the draft and presents a bounded error.

## Selection, validation, and upload contract

- Photo, Camera, and File converge on one `SelectedAsset` validation and upload path.
- Resolve a missing picker-reported size from the app-readable cached URI before reserving an upload. The backend requires a positive exact `sizeBytes`; an unknown size must never be converted to zero or guessed.
- Validate against the current server policy before upload:

```text
next attachment count = staged attachment count + 1
next total bytes = sum(staged attachment.byteSize) + selected asset byte size
```

- Reject locally when the next count exceeds `maxAttachments`, the selected file exceeds `maxFileBytes`, or total staged bytes exceed `maxMessageBytes`. The backend remains authoritative and revalidates every constraint and file signature.
- Do not invent fallback MIME types outside a policy-compatible normalization. The backend's content inspection remains authoritative over extension and picker claims.
- A successful selection begins the existing authenticated staging upload and shows filename, truthful type, byte size, progress, retry, and remove state in the composer tray.
- Upload completion means **Ready to send**. It does not create a message, increment unread/critical counts, or clear the draft.
- Pressing Send commits the ordered staged attachment IDs with the optional trimmed caption, reply, and priority through the existing message mutation.
- Attachment-only messages remain valid. A draft with neither text nor staged attachments remains invalid.
- A failed or ambiguous send preserves the exact frozen payload and client message ID for safe retry.
- While a send is pending, all attachment, camera, keyboard, recording, priority, reply, navigation, and duplicate-send actions remain locked as they are today.
- Access loss cancels the active transfer/recording, clears private unsent media, removes protected query state through the existing flow, and renders the current non-disclosing unavailable state.

## Android activity-recreation recovery

Expo documents that Android can destroy and recreate `MainActivity` while a camera or photo-picker activity is open. The implementation must not silently lose or misattribute a returned image.

- Before launching Photo or Camera, record a short-lived pending selection context containing only the source plus normalized environment, user, and project IDs. Do not store filenames, URIs, bytes, draft text, or credentials in this marker.
- On composer restoration, query `getPendingResultAsync` only when that marker matches the current environment, authenticated user, and project and has not expired.
- Recovered content passes through the current policy and normal asset validation before staging.
- A mismatched, expired, denied, malformed, or already-consumed result is discarded and cannot be attached to a different project or user.
- Clear the marker on successful selection, cancellation, denial, explicit Back, logout, access loss, environment change, or expiry.
- Because no other current mobile feature launches `expo-image-picker`, this coordinator can remain platform-file scoped. Any future image-picker consumer must share the same origin routing rather than reading chat's pending result opportunistically.

## Native emoji input behavior

- Keep a `TextInput` ref and current selection/caret state in the composer.
- Rename the smiley's accessible action to **Open device emoji keyboard**.
- Tapping it closes any composer overlay, focuses the message input, preserves the existing caret/selection, and asks Android to show the current IME.
- It never inserts `🙂` or any other character by itself.
- Emoji, text, deletion, replacement, skin-tone modifiers, and multi-code-point sequences flow through the same `onChangeText` handler, renew draft identity when appropriate, and remain subject to the 4,000-character limit.
- Android Back hides the IME through normal platform behavior before the chat-level Back handler removes draft state or navigates away.
- Hardware keyboards remain supported: the smiley focuses the field, while emoji entry remains controlled by the user's installed input method or hardware keyboard shortcuts.

## Voice-note behavior

The current tap-based voice flow remains the accessible primary interaction. Hold/swipe gestures are not required and will not become the only route.

1. When the draft has no text or staged attachments and recording is authorized, show **Record voice note**.
2. A tap starts one permission/startup operation and prevents duplicate taps while it resolves.
3. After recording begins, show a red semantic recording state, elapsed `m:ss`, **Stop**, and **Cancel**. Do not announce every timer tick to TalkBack.
4. Stop or the policy duration limit finalizes the private recording and stages it through the existing authenticated upload.
5. Show preparing/upload progress, then identify the staged asset as a voice note that is ready to send.
6. The user may add a caption and must explicitly press **Send message**. Stopping a recording never auto-sends it.
7. Remove deletes the staged server attachment and releases any retained local recording. A failed upload retains retry/remove choices.
8. Backgrounding, access loss, project/environment/user change, logout, cancellation, and unmount preserve the existing discard and cleanup rules.

No backend audio contract change is required. Actual native duration/container acceptance, permission revocation, Bluetooth/audio-route interruption, and low-storage behavior remain device-verification concerns.

## Required states and messages

| State | Required behavior |
| --- | --- |
| Policy loading | Text remains usable; media actions are disabled without changing composer height. |
| Policy unavailable | Show **Media sharing is unavailable. Text messages can still be sent.** with a retry path. |
| Upload prohibited | Hide the paperclip; never infer access from a displayed role name. |
| Recording prohibited | Hide the microphone. File selection may still accept a supported audio file when upload capability allows it. |
| Max attachment count | Disable attachment and record actions and show the returned maximum. |
| Per-file limit | Name the selected file and formatted returned limit. |
| Combined limit | State the formatted `maxMessageBytes` limit before upload. |
| Picker cancelled | Restore the unchanged draft with no error banner. |
| Camera temporarily denied | Explain that camera access is required; keep Photo and File available. |
| Camera permanently denied | Offer **Open settings**; keep Photo and File available. |
| Upload active | Show bounded progress when known and allow safe cancellation/removal. |
| Upload failure | Retain the selected local asset and stable upload identity for Retry or Remove. |
| Recording active | Show elapsed time, Stop, and Cancel. |
| Recording interrupted | Discard partial content and announce the existing foreground interruption message. |
| Recording limit reached | Stop automatically and announce that the voice note is being prepared. |
| Send pending | Freeze the complete payload and lock draft/navigation actions. |
| Send ambiguous/failure | Retain caption/attachments/reply/priority and retry the same client message identity. |
| Access revoked | Cancel private work, clear unsent media, and show **Messages are unavailable.** |

## Architecture and affected areas

- Add a message-owned attachment-options component responsible for presentation, focus management, responsive layout, and invoking typed source callbacks. It must not own authorization or upload business rules.
- Extend `mobile/src/platform/files/selection.ts` with camera capture, structured camera-permission outcomes, missing-size resolution, and scoped pending-result recovery. Reuse `validateSelectedAsset` across every source.
- Extend the composer's local attachment-policy type to retain `formats[].kind`, labels, extensions, and MIME types needed for source-specific filtering.
- Keep policy checks, count/aggregate limits, upload staging, retry identity, cleanup, and send orchestration inside `ChatComposer` or focused message-owned helpers.
- Extend `ComposerTray` only as needed for truthful source/type/size, recording timer, progress, ready, retry, remove, and error states.
- Extend `ChatIcon` with photo, camera, file, stop, and other necessary code-native glyphs.
- Treat attachment-options or priority visibility as the composer overlay signal consumed by `ChatThread` read gating.
- Add explicit `expo-image-picker` configuration and camera-permission assertions to `app.config.ts` and its tests. Reuse the already installed package; do not add a picker or emoji dependency.
- Preserve all backend routes, storage state, schemas, permissions, authorization registry, OpenAPI inventory, message contracts, attachment TTL/cleanup, audio encoding, and download behavior.

## Authorization, privacy, and failure invariants

- Only an authenticated, current project participant with backend-derived `chat.send` and policy `canUpload` may stage Photo, Camera, or File content.
- Only policy `canRecord` exposes voice recording. A role label or local UI state never grants capability.
- A selected or captured asset remains private and unsent until its ready attachment ID is committed by the existing message mutation.
- No raw storage path, bearer URL, token, local URI, private filename, media byte content, or draft text enters logs, query keys, pending-result markers, or accessibility announcements beyond the user-facing filename already shown in the private composer.
- A stale picker, permission, stat, upload, recording, or send result from one environment/user/project cannot update another scope.
- Cancellation and project change cannot leave an unowned camera asset, active upload, microphone resource, or staged backend file without the existing cleanup path.
- Server rejection never causes the app to send a partial subset automatically.
- Existing text-only chat remains usable when native media is unavailable.

## Responsive and accessibility requirements

- Raise composer controls to at least 48 × 48 dp; current paperclip, smiley, and send/mic targets are smaller than this requirement.
- TalkBack focus order remains: attachment options, device emoji keyboard, message input, importance, record/send.
- Opening the attachment panel places focus on Photo; closing restores focus to the paperclip. Native permission and picker surfaces retain system focus behavior.
- Every icon-only control has a stable accessible name, role, disabled/busy/expanded state, and non-color state cue.
- At font scale 2.0, Photo/Camera/File may become a vertical list; labels and permission messages cannot clip.
- At 320, 360, and 412 dp, keep the choice panel inside safe-area margins and keep the composer input usable.
- At 600 and 800 dp split layouts, cap/anchor the panel within the thread pane and retain selected conversation/list state.
- In short landscape layouts, the panel/tray may scroll but must not cover every route out of the conversation.
- Preserve gesture and three-button navigation insets, keyboard resizing, reduced-motion behavior, and the existing audience notice.
- Elapsed recording seconds are visual text rather than an every-second live-region announcement. Start, stop, ready, failure, and interruption receive restrained announcements.

## Scope

In scope:

- WhatsApp-style Photo/Camera/File choice surface.
- System photo selection and still-camera capture.
- Runtime camera permission and settings recovery.
- Existing secure file selection, staging, progress, retry, removal, and explicit send flow.
- Native device-keyboard focus from the smiley without hard-coded emoji insertion.
- Existing voice recording flow with clearer requesting, elapsed, stop/cancel, staging, and ready-to-send states.
- Android activity-recreation recovery for camera/photo results with environment/user/project scoping.
- Focused tests, full mobile verification, regenerated native config/build, and rendered emulator/device QA where available.

Out of scope:

- An app-owned emoji catalog/picker, stickers, GIF search, reactions, or forcing a third-party keyboard into a private emoji mode.
- Multi-select gallery/file selection in one system-picker invocation; users may repeat single selection.
- Video capture, in-app camera UI, cropping, filters, compression, transcoding, metadata stripping, OCR, or media editing.
- Hold/swipe-to-lock voice gestures, transcription, audio effects, background recording, or automatic send on stop.
- Backend routes, schemas, storage migration, attachment allowlist expansion, public URLs, production deployment, commits, pushes, or real customer uploads.

## Risks and handling

- **Keyboard cannot be forced into emoji mode:** focus the normal IME and document the platform-owned emoji key; do not pretend a hard-coded smile is equivalent.
- **Picker result crosses scope after recreation:** store only a short-lived scoped origin marker and reject mismatched/expired recovery.
- **Unknown asset size:** stat the app-readable local URI before upload reservation; fail clearly when exact size remains unavailable.
- **Large camera image exceeds policy:** validate returned size before upload and retain the draft with a useful limit message.
- **Camera permission is permanently denied:** provide settings recovery without disabling Photo/File.
- **Read acknowledgement advances behind a modal:** report attachment-panel visibility through the existing overlay gate.
- **Stale async result modifies another chat:** generation/scope fence picker, stat, upload, recording, and send completions.
- **Recording or upload leaks resources:** preserve active-transfer cancellation, audio ownership, local-file release, staged deletion, and logout cleanup.
- **Aggregate bytes exceed message policy:** compute from authoritative staged metadata before each upload while retaining backend enforcement.
- **Android provider/activity differences:** verify cancellation, camera, photo, file, recreation, and cache URI behavior on the available emulator and at least one physical device when available; disclose unavailable lanes.

## Acceptance criteria

1. Tapping the paperclip opens an accessible, responsive Photo/Camera/File choice surface rather than launching a picker directly.
2. Photo uses the system image picker and stages a policy-approved image; cancellation leaves the draft unchanged.
3. Camera requests permission only on selection, captures a still image when allowed, handles temporary/permanent denial, and offers settings recovery without disabling Photo/File.
4. File opens the document picker with the full server MIME allowlist and retains existing secure staging behavior.
5. Every selected source resolves exact bytes, obeys returned MIME/count/per-file/aggregate limits, shows progress/retry/remove, and remains unsent until Send succeeds.
6. Camera/photo results recovered after Android activity recreation can only return to their matching environment, user, and project.
7. The smiley no longer inserts `🙂`; it focuses the message input and opens the user's installed keyboard without losing the caret or draft identity rules.
8. Native keyboard Unicode emoji, including multi-code-point sequences, remains intact through edit, length validation, send, rendering, and retry.
9. Voice recording visibly supports requesting, active elapsed state, Stop, Cancel, duration-limit completion, authenticated staging, removal/retry, optional caption, and explicit Send without resource leaks.
10. Attachment and priority overlays are mutually safe, pause read acknowledgement, close before other transient Back actions, and restore appropriate focus.
11. All composer controls meet 48 dp, have correct accessible roles/names/state, and remain usable at 320/360/412/600/800 dp, short landscape, keyboard open, font scale 2.0, TalkBack, gesture, and three-button navigation where available.
12. Existing text, reply, priority, issue, realtime, safe-read, navigation-lock, attachment cleanup, audio ownership, authorization, and retry behavior does not regress.
13. Focused selection/composer/audio/config tests, typecheck, full Jest, contract drift, Android export, arm64 Gradle build, fresh APK install, launch smoke, and rendered Photo/Camera/File/emoji/voice interaction checks pass on the available final tree. Unavailable physical-device, keyboard-vendor, API-level, permission, or lifecycle lanes are reported rather than inferred.

## Verification requirements

- Platform selection tests: Photo/Camera/File success, cancellation, temporary/permanent camera denial, settings action, invalid/empty result, missing-size stat, source MIME filtering, oversize, and scoped pending-result recovery/rejection.
- Composer tests: open/dismiss/outside tap/Back/focus, overlay/read gating, all three routing callbacks, count and aggregate limits, upload progress/retry/remove, attachment-only and captioned sends, frozen retry identity, access revocation, and cleanup.
- Emoji tests: button does not mutate the draft, input is focused, selection is retained, Unicode/ZWJ/skin-tone text follows the native change path, and keyboard Back precedes chat navigation.
- Voice tests: startup lock, denial, elapsed state, Stop/Cancel, duration limit, completion-to-upload, voice-only send, captioned send, upload retry/removal, background interruption, unmount/project switch, and recording/playback races.
- Configuration tests: camera/image-picker plugin settings, microphone ownership, minimum SDK, cleartext policy, and generated manifest permissions.
- Integrated tests: typecheck, focused suites, full mobile Jest, contract drift, Android export, Gradle arm64 debug APK, fresh install, checked-in launch smoke, and repository hygiene.
- Rendered QA: compact portrait, short landscape, expanded split view, keyboard open, Photo/Camera/File panel, camera permission denial and grant, staged media, recording, retry/error states, Android Back, font scale, and TalkBack where available.

No backend test lane is required unless implementation changes a backend file or discovers an existing contract mismatch. No migration, seed, production mutation, customer upload, deployment, commit, or push is authorized.

## Assumptions and open decisions

- Approval accepts the native-device-keyboard interpretation above: the smiley opens/focuses the installed keyboard, and the user selects that keyboard's emoji key because Android does not allow Lisno to force the emoji tab.
- Photo and Camera are image-only. Existing supported video/audio files remain available through File; recorded voice notes remain on the microphone control.
- Each picker invocation selects one item. Reopening the panel adds another up to returned limits.
- Selected assets continue to upload immediately into private staged storage, while message sending remains an explicit separate action.
- The existing `expo-image-picker`, `expo-document-picker`, `expo-file-system`, and `expo-audio` dependencies are sufficient. No new dependency or lockfile change is expected.

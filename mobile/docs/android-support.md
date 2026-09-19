# Android support and native proof plan

Date: 2026-09-18

## Supported baseline

- Expo SDK 57, React Native 0.86, New Architecture.
- Android API 24 (Android 7) and newer, subject to the completed dependency proof.
- Phone, tablet and foldable layouts; portrait, landscape and live resize.
- Play-compatible ABIs and Android 16 KB memory-page compatibility must be checked for every native dependency.

Node 22 LTS is the recommended development/CI runtime. The initial machine has Node 24.18, which meets Expo's minimum but remains a compatibility observation rather than the pinned CI target.

## Local environment evidence

At T00 the machine had no working Java runtime, Android Studio, Android SDK, `adb`, emulator, Gradle command, `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`. During follow-up setup, JDK 17, Android Studio, platform-tools, an arm64 emulator, Android Platform 36, Build Tools, NDK 27.1 and CMake 3.22.1 became available. `android/local.properties` points the ignored generated project to this machine's SDK.

Expo Android prebuild has generated and validated the managed native configuration: minimum API 24, `armeabi-v7a`, `arm64-v8a`, `x86` and `x86_64`, development package identity, adaptive/monochrome launcher resources, splash resources and recording permissions. The generated `android/` directory is intentionally ignored and reproducible from `app.config.ts`.

Metro Android export and Expo dependency compatibility checks pass. After the toolchain setup, `./gradlew app:assembleDebug -x lint -x test --configure-on-demand --build-cache -PreactNativeArchitectures=arm64-v8a` completed successfully for the corrected environment-only build. The resulting APK installed and passed the checked-in launch smoke on the arm64 `emulator-5554` target. This proves an arm64 debug native build and launch, but it does not certify the complete device and interaction matrix.

Final local evidence on 2026-09-19:

- `npm ci` completed from the lockfile. `test-renderer` is pinned to the React 19.2-compatible 1.2 line; the earlier caret range incorrectly selected its React 19.3 renderer.
- `npm run typecheck` passed.
- The final bubble/media follow-up lane passed 5 suites and 37 tests. The complete mobile suite passed 53 suites and 385 tests. Jest still prints its generic force-exit advisory, so the established `--forceExit` lane remains in use.
- `npm run test:contracts` passed 1 suite and 3 contract-drift tests covering backend roles, permissions and protected operations.
- `expo install --check` exited successfully and reported compatible dependencies using Expo's bundled offline map. Expo marked that offline result unreliable, so online registry validation is not claimed.
- Production Expo config rejects a missing/unapproved package ID, a missing remote URL and an HTTP remote URL. With explicit approved-format package and HTTPS inputs, cleartext is disabled.
- The final clean Android export completed in `/tmp/lisno-mobile-compact-participants-final-export` with a 5.6 MB Hermes bundle, 2,082 modules and 34 assets.
- Direct arm64-v8a Gradle debug assembly passed in 49 seconds with 380 actionable tasks. The merged and packaged manifests retain minimum API 24, target API 36, `CAMERA` and `RECORD_AUDIO`.
- The resulting `android/app/build/outputs/apk/debug/app-debug.apk` is 87,502,449 bytes with SHA-256 `d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`.
- `adb install -r` installed the fresh APK successfully and `npm run test:e2e:android` passed the launch smoke for `com.lisno.mobile.dev` on `emulator-5554` after SDK platform-tools were placed on `PATH`.
- The current `.env.local` Local profile resolved to `http://10.0.2.2:3000/api/v1`. The authenticated emulator session loaded the local project-conversation list and Villa history for visual QA. Remote connectivity was not tested because no verified HTTPS endpoint and test access were supplied.

`npm install` reports 15 moderate advisories in the current Expo/toolchain dependency graph. No breaking `npm audit --force` rewrite was applied; these should be reassessed with the next compatible Expo dependency update.

## Onboarding verification evidence

The premium first-launch onboarding was verified on the API 37 `sdk_gphone16k_arm64` emulator (`arm64-v8a`, 1080 × 2424 physical pixels, density 420, font scale 1.0):

- A cleared development-app data store opened slide one rather than the sign-in screen.
- All three portrait scenes rendered with their approved copy, distinct depth compositions, scene actions and primary actions. The final CTA opened the unchanged sign-in form without any Local/Remote label, URL or backend selector.
- Force-stop and relaunch after completion opened sign-in directly, proving the one-time completion path on the installed app.
- Android hardware Back returned slide two to slide one.
- Landscape used the expanded two-column composition; vertical scrolling made the scene interaction and primary CTA fully reachable on the constrained height.
- `npm run test:e2e:android` passed for `com.lisno.mobile.dev` on `emulator-5554`. A direct arm64-v8a Gradle debug assembly also passed with 380 actionable tasks (19 executed, 361 up-to-date).
- The final clean export in `/tmp/lisno-onboarding-export-final-20260918` produced a 5,427,941-byte Hermes bundle containing all approved slide titles, interactions and the final CTA.

Automated tests cover reduced-motion static rendering, preference-read failure, live resize, accessibility labels and slide announcements, paging, Back, scene actions, completion persistence and storage failures. TalkBack, 320 dp width, enlarged system text, reduced motion on an actual device and physical ARM hardware remain unrun.

## Messaging verification evidence

The installed API 37 arm64 emulator build was opened from the role-based shell into **Messages**, then into **Villa**. The rendered flow matched the approved reference: content-fit text bubbles with small grouped gaps, no permanent per-message chevrons, compact white conversation rows, participant/status and critical metadata, an immersive phone thread, muted project header, warm geometric wallpaper, authenticated image previews with compact metadata, 248 dp phone voice notes and a fixed composer with attachment, emoji, importance, microphone and send actions. Right and left swipes selected the exact reply target, the transient reply indicator appeared during drag, the bubble returned to rest and the existing composer reply context appeared. Vertical transcript scrolling remained independent. Image cards no longer show Open; tapping the image opens a dark contain-mode viewer and Android Back closes it. The attachment action rendered Photo, Camera and File in a centered 320 dp compact chooser. Tapping the Villa identity opened full-screen Group info with five real participants, canonical roles, the history notice and the capability-gated Add participant action. The Super Admin Add surface loaded eligible people and the required reason workflow; no participant was selected or added during verification.

Automated coverage includes list pagination and states, the 599/600 dp layout boundary, routing and Back behavior, cursor history, safe read thresholds, realtime updates, send retry identity, issue actions, Photo/Camera/File routing, camera permission outcomes, exact-byte and policy limits, scoped activity-recreation recovery, authenticated media cleanup, native-input focus, Unicode text, voice-note staging, serialized recording/playback transitions, image viewer loading/retry/denial/Back and late-artifact cleanup, participant payload validation, capability gating, synchronous owner fencing, search debounce, reason validation, stable add idempotency, conflict/denial handling, participant cache refresh and swipe intent/commit/cancellation/accessibility behavior. Final swipe verification passed 7 suites and 88 tests; the complete mobile suite passed 54 suites and 406 tests; contracts passed 3 tests; TypeScript, clean Android export, arm64 assembly, exact APK install and launch smoke passed. Integrity review found no remaining material defect after owner-tagged reply-state hardening.

The final 87,502,449-byte APK (`d11e700fc736e05fe625f3792a7779a6602f46c2482224c6ca42dbc0e68d161c`) installed and passed the checked-in launch smoke on the API 37 arm64 emulator, with no post-launch AndroidRuntime or ReactNativeJS errors. Real message/upload mutation was intentionally avoided. Manual native picker/camera/microphone permission flows, Android activity recreation during capture, vendor keyboards and camera hardware, TalkBack custom-action traversal, the full width/orientation/font-scale/device matrix, long-running native SSE, Bluetooth interruption, API 24 hardware and a physical ARM device remain unrun.

Do not weaken minSdk, cleartext, signing or native checks to compensate. Development/internal builds may allow explicitly configured local HTTP. Production builds require a configured HTTPS remote API and never fall back automatically.

## Native proof gates

1. **SSE:** `expo/fetch` must deliver heartbeats incrementally, abort sockets, sustain a 30-minute authenticated stream, replay/resync cursors, stop on denial and reconnect after AppState/NetInfo changes on API 24 and a current device.
2. **Audio:** an actual Android `.m4a` / `audio/mp4` recording must pass the backend signature/container policy. Test denial/revocation, interruption, Bluetooth changes, five-minute limit and cleanup.
3. **XLSX:** the chosen Hermes-compatible implementation must inspect archives before expansion, preserve all existing limits and pass web → mobile → web round trips without blocking the interaction thread.
4. **PDF:** a native, non-WebView viewer must support New Architecture, API 24, 16 KB pages, large documents, rotation and lifecycle without exposing bearer URLs.
5. **App Links:** production verification waits for the final package ID, signing fingerprint, HTTPS domain and hosted `assetlinks.json`. Development uses `lisno-dev://` with an exact host/path allowlist.

If the SDK 57 transport cannot satisfy the SSE proof, use a scoped Android streaming adapter. Do not change the backend to polling or WebSockets as an unreviewed fallback.

## Device matrix

Record OS/API, ABI, model/emulator, width, orientation, font scale, navigation mode and build mode. Minimum evidence is API 24, one pre-Android-12 device, Android 12+ splash behavior, current target API, host-compatible emulator and physical ARM hardware when available.

Widths: 320, 360, 412, 600 and 800 dp. Font scales: 1.0, 1.3 and 2.0. Include TalkBack, reduced motion, gesture and three-button navigation, hardware keyboard, offline/slow network, cold/warm/restored launch and launcher mask gallery.

Missing hardware or production link credentials are disclosed gaps, never converted into a pass from a web preview or unit test.

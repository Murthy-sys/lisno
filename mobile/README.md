# Lisno Android

React Native Android application for Lisno. It lives in this repository as a sibling of `backend/`, `frontend/`, and `ocr-worker/`, with its own package, lockfile, native configuration, tests, and brand assets.

## Requirements

- Node.js 22 LTS (the repository `.nvmrc` pins `22`)
- npm
- JDK 17 and Android Studio/SDK for APK builds
- Android API 24 or newer device/emulator
- A reachable Lisno backend mounted at `/api/v1`

Install dependencies with `npm ci` from this directory.

## Backend configuration

Copy `.env.example` to `.env.local` and select exactly one backend. These values are bundled configuration, so never place credentials in them.

Remote is the default:

```dotenv
EXPO_PUBLIC_API_ENV=remote
EXPO_PUBLIC_REMOTE_API_URL=https://api.example.com/api/v1
LISNO_APP_VARIANT=development
LISNO_ALLOW_LOCAL_HTTP=0
# Set only after the production application ID is approved:
# LISNO_ANDROID_PACKAGE=com.yourcompany.lisno
```

For the backend running on the development Mac and an Android emulator:

```dotenv
EXPO_PUBLIC_API_ENV=local
EXPO_PUBLIC_LOCAL_API_URL=http://10.0.2.2:3000/api/v1
LISNO_APP_VARIANT=development
LISNO_ALLOW_LOCAL_HTTP=1
```

Only the selected profile's URL is required in development. `EXPO_PUBLIC_API_ENV` defaults to `remote`; unsupported values fail startup. Production builds require `remote` plus an HTTPS `EXPO_PUBLIC_REMOTE_API_URL` and reject Local. The app contains no backend selector or URL editor and never falls back automatically. After changing `.env.local`, stop Metro and run `npm run android` again so configuration and native development settings are rebuilt.

For a local backend:

- Android emulator: use `http://10.0.2.2:3000/api/v1`.
- Physical device on the same LAN: use the development machine's LAN address and ensure the backend listens on that interface.
- USB device: `adb reverse tcp:3000 tcp:3000`, then a configured loopback URL can reach the forwarded port.

## Development and checks

```bash
npm start
npm run android
npm run typecheck
npm test -- --runInBand
npm run test:contracts
npm run doctor
npm run export:android
```

The app uses the development package `com.lisno.mobile.dev`. Production configuration requires an explicit approved `LISNO_ANDROID_PACKAGE`; no permanent identity is inferred. This repository does not create production signing material or publish an application.

Generate the native Android project and build a debug APK with:

```bash
npm run prebuild:android
cd android && ./gradlew assembleDebug
```

The debug APK is normally written to `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run build:android:debug` performs prebuild plus the Gradle build. JDK 17, the Android SDK, accepted SDK licences, and a valid `ANDROID_HOME` are required.

Run the installed-build smoke check with an attached device or running emulator:

```bash
npm run test:e2e:android
```

## Architecture

- `src/core`: validated environment-only Remote/Local selection, HTTP isolation, environment-scoped SecureStore token ownership, session restore, versioned onboarding completion, and scoped TanStack Query state.
- `src/contracts`: mobile-owned adaptations of the backend authorization and operation registry, guarded by contract drift tests.
- `src/navigation`: fail-closed, permission-derived phone tabs and tablet rail.
- `src/features`: native auth, project, sales, review, procurement, finance, management, access, messaging, notification, and settings flows.
- `src/platform`: authenticated private transfers, bounded SSE, Android MPEG-4/AAC audio, file selection, and annotation coordinate conversion.
- `src/ui`: Poppins-based Lisno tokens, accessible controls, wordmark, icon, and animated loader.

Bearer tokens are stored only in SecureStore under keys derived from the normalized selected environment. API responses, files, streams, and query keys are fenced by environment identity and session generation. No connection choice is persisted on the device.

The first anonymous launch presents three Lisno onboarding scenes for planning, collaboration and delivery. **Sign in to Lisno** on the final slide stores an app-wide completion flag and opens the existing sign-in screen; later anonymous launches go directly to sign-in. Authenticated restoration always bypasses onboarding. Clearing application data resets this first-launch state.

## Android support and current proof

The configured minimum is Android 7 / API 24, with phone, tablet, foldable, rotation, 200% text, TalkBack, reduced-motion, and current Android behavior in the validation matrix. See [docs/android-support.md](docs/android-support.md), [docs/contracts.md](docs/contracts.md), and [docs/feature-parity.md](docs/feature-parity.md).

JavaScript type checks, contract tests, unit tests, and Metro Android export can run without Android Studio. APK compilation, splash-mask inspection, SSE/audio certification, and physical-device interaction require the native toolchain and device matrix; they must not be inferred from Expo Go or web output.

## Current feature status

The app contains the production foundations and broad role-based workflows: premium first-launch onboarding, authentication, environment-configured Remote/Local connectivity, adaptive navigation, projects/tasks, workflow and design-version controls, leads, Client/admin decisions, procurement expenses, finance entries, team evaluations, users/invitations, access requests, a native Configuration workspace with section editors, server calculation previews, reusable-value/vendor management and Quality workbooks, notifications and secure artifacts. Project messaging uses a dedicated adaptive list/thread workspace with cursor history, realtime updates, safe visible-message read acknowledgement, content-fit incoming/outgoing bubbles, issue actions, a compact Photo/Camera/File chooser, 248 dp phone voice notes, tap-to-view authenticated full-screen images and a fixed keyboard-aware composer. Messages have no permanent action chevron: authorized senders can swipe either horizontal direction to reply, while tap/long press and named accessibility actions retain the message-action path. Image cards use the preview itself as the action and do not show a redundant Open button. Tapping the project identity opens Group info with the real participant roster; the active Super Admin and any other backend-authorized selection manager can search eligible people and add one with an audited reason. The smiley focuses the installed Android keyboard without changing the draft; media and voice notes remain staged until the user explicitly sends them.

It does not yet provide complete web parity. The estimate builder, drawing/annotation review, several complex workflow/procurement/finance actions, participant removal and broader native device certification remain open. The exact implemented/open matrix is maintained in [docs/feature-parity.md](docs/feature-parity.md).

# Android test APK using production services

Date: 2026-09-24
Status: User-authorized release APK built and artifact verification passed. Physical-device installation and authenticated runtime testing have not been performed; see task plan.

## Goal

Build an installable, standalone Android APK from the current mobile workspace so the user can test it on a real device against the deployed production services. Bundle JavaScript and assets so Metro, Expo Go, a development Mac and local network forwarding are not required.

## Current behavior and evidence

- `mobile/README.md` and `app.config.ts` separate the service environment (`remote`/`local`) from the application identity (`development`/`production`). The existing test identity is `com.lisno.mobile.dev`, displayed as Lisno Dev.
- `mobile/.env.local` currently selects Local and permits development HTTP. No actual `EXPO_PUBLIC_REMOTE_API_URL` is configured; example/test URLs are not evidence of the production service address.
- `mobile/package.json` provides native prebuild and release/QA build commands. The existing generated `android/app/build.gradle` bundles JS for release and uses the existing development signing certificate for QA builds. A permanent production application ID and distribution signing are not configured.
- Local JDK 17, Android SDK/build tools, native project, node dependencies and a development signing key are present. Existing generated native files and APK outputs are ignored. Actual release compilation remains to be verified.
- The mobile worktree contains ongoing user changes. Package the current workspace, including those changes, while preserving their source and configuration.

## Scope and chosen behavior

1. Produce a Gradle **release/QA APK** using the existing test package and certificate, connected to the user-confirmed production HTTPS API base. This is a real-device test artifact, not a Play Store release or a new permanent application identity.
2. Supply `EXPO_PUBLIC_API_ENV=remote`, the confirmed `EXPO_PUBLIC_REMOTE_API_URL`, and `LISNO_ALLOW_LOCAL_HTTP=0` consistently during native generation and release bundling. Preserve the developer's local environment file; do not bake local/emulator URLs into the active configuration.
3. Use the existing Android architecture configuration for broad real-device compatibility unless native toolchain evidence requires a documented adjustment. Inspect the final APK's actual minimum SDK and supported ABIs before delivery.
4. Keep existing mobile features and native permissions unchanged. No unrelated UI/backend work, new dependency, version/signing identity change or authentication bypass is included.
5. Validate the configured endpoint with an unauthenticated read-only health request. Do not log in, create test records, send messages, upload files or otherwise write to production.
6. Deliver a clearly named APK under an ignored local artifact directory, plus SHA-256 checksum, size, package/version/minimum SDK/ABI details and concise installation guidance.

## Verification and acceptance

- AC1: Android release build succeeds and produces a non-empty signed APK with its JS/assets bundled; it starts without a development server.
- AC2: Resolved Expo/native/bundled configuration selects the confirmed Remote HTTPS service. Cleartext traffic is disabled and Local selection is not active.
- AC3: Run mobile typecheck, existing app/environment configuration tests and contract-drift checks. Fix only build-blocking issues within this packaging scope; report unrelated failures rather than changing unrelated behavior.
- AC4: Inspect the APK manifest/package, minimum SDK, ABIs and signing verification using installed Android tools. Check the package is non-debuggable, contains the release JS bundle and includes the intended public endpoint configuration.
- AC5: If a suitable local emulator is available, perform an unauthenticated launch smoke check only. Real-device installation/testing remains with the user unless explicitly requested. Never infer native runtime success solely from a successful build.
- AC6: Preserve the initial dirty work and `.env.local`; report exact checks, any unrun device checks, artifact location and checksum. No publishing, backend deployment, production data mutation, staging, commit or push.

## Assumptions, risks and open input

- **Resolved input:** user configured a production HTTPS API base ending in `/api/v1` in `mobile/.env.local`. Its unauthenticated health endpoint returned status `ok`. Use this configured value without guessing or replacing it.
- “Prod services” refers to the deployed backend. The existing QA application identity/certificate is appropriate for sideloaded testing; distribution-grade signing is outside this request.
- Current source may call API capabilities not yet deployed. A build and health check cannot prove full compatibility; report any observed version/contract issue without deploying backend changes.
- Installing over an existing app requires matching package/certificate. Do not uninstall an existing app or clear device data automatically.
- Native compilation may require dependency downloads and sandbox approval for SDK/Gradle caches. Preserve existing tooling and generated-project customizations; avoid destructive clean prebuilds.
- Device tests performed by the user after installation act on the configured production service and its real data.

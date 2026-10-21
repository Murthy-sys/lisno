# Direct Android APK and AAB release commands

Date: 2026-10-16
Status: Implemented in Mode A on 2026-10-16. Both plain commands and artifact signing/configuration checks passed; device execution and Play Store validation were not performed.

## Goal

Make these existing commands sufficient from `mobile/android/`, with the project's normal Node, Java, and Android SDK prerequisites already installed and configured:

```bash
./gradlew assembleRelease
./gradlew bundleRelease
```

The first produces an APK and the second an AAB, using the saved mobile environment configuration. The current configuration selects production services. No per-build environment export, npm wrapper, Metro session, or manual clean should be required.

## Current behavior and evidence

- `mobile/.env.local` selects Remote, sets the established production HTTPS API ending in `/api/v1`, disables local HTTP, and retains the development app variant. The preceding task verified 23 configuration tests and a production health response of HTTP 200 with `data.status=ok`.
- `mobile/android/app/build.gradle` applies the Android application and React Native plugins, which already supply the APK/AAB release tasks. Release JS/assets bundling uses Expo, and release signing uses the existing development certificate. The package is `com.lisno.mobile.dev`, version `0.1.0`, versionCode `1`.
- The native manifest currently disables cleartext traffic. `gradle.properties` enables Hermes and four Android ABIs with minimum SDK 24.
- The native Gradle and manifest files are tracked; they must not be regenerated or rewritten unnecessarily. APK outputs and `mobile/dist/apk/` are ignored.
- Installed mobile dependencies, the Gradle wrapper, a development keystore, JDK 17, and Android SDK/build tools are present. In the inspected shell, `JAVA_HOME` and `ANDROID_HOME` are already set; `NODE_ENV` is unset. No actual plain-command compilation failure has been reproduced yet.
- Installed Expo `export:embed` requests production mode for release JS bundling, but its actually resolved nested CLI utility only sets `NODE_ENV` when absent. A conflicting inherited value is therefore preserved. Separately, `expo-constants/scripts/get-app-config-android.gradle` runs `getAppConfig.js`, which loads dotenv using its inherited `NODE_ENV`. When unset, its installed environment loader warns and only loads `.env.local` and `.env`; metadata and bundle environment resolution can differ. Implementation discovery corrected the initial assumption that the nested CLI always overrides the mode.
- Installed React Native `BundleHermesCTask` declares JS/JSX/TS/TSX sources as inputs but does not declare dotenv files or the app's service-related shell overrides. An environment-only edit can therefore leave the JS bundle considered up to date. Expo metadata is generated on every build, which can then disagree with a cached JS bundle.
- Initial dirty state consists of the preceding task's `mobile/.env.local` change and its two untracked working documents, plus this pending specification. Preserve them.

## Scope and chosen behavior

1. Extend the existing Gradle configuration so both commands work directly. Use existing task integration; keep the generated Gradle wrappers and installed dependencies unchanged.
2. Make release Expo metadata generation and release JS bundling resolve the same production-mode dotenv inputs without requiring the caller to set `NODE_ENV`. Preserve ordinary debug behavior and verify that the change does not globally force debug builds into production mode.
3. Keep `mobile/.env.local` and Expo's established dotenv/shell precedence as the environment source. Do not hardcode production URLs in Gradle, silently change the selected profile, or equate release optimization with `LISNO_APP_VARIANT=production`.
4. Declare the relevant dotenv files and configuration overrides as Gradle inputs so changed values, added/removed dotenv files, and changed shell overrides invalidate the affected bundle. Do not expose secrets or capture the entire process environment as task metadata. Retain incremental reuse when inputs are unchanged.
5. Preserve package, version, signing, permissions, ABI coverage, native customizations, and current production service selection. Use targeted Gradle settings and a small repository-owned helper only if the installed plugin interfaces require one. No clean prebuild or dependency upgrade is planned.
6. Document the two commands and their standard output paths in `mobile/README.md`. Keep the primary deliverables at `mobile/android/app/build/outputs/apk/release/app-release.apk` and `mobile/android/app/build/outputs/bundle/release/app-release.aab`; report checksums and sizes after successful builds.

## Approach and tradeoffs

- **Recommended: existing Gradle task configuration.** Fix the different environment resolution and missing inputs at their source, while preserving the requested commands and normal incremental builds. Gradle supports [additional task inputs](https://docs.gradle.org/current/userguide/incremental_build.html) and [environment inputs for caching](https://docs.gradle.org/current/userguide/common_caching_problems.html).
- A custom shell/npm launcher could export variables before Gradle starts, but would introduce another command or modify generated wrappers and would not itself fix environment-only cache invalidation. It is unnecessary for this repository's configured toolchain.
- The installed React Native bundle task exposes Node arguments but no subprocess environment property. A small Node preload scoped to that task is justified to normalize the bundling mode before the nested Expo CLI loads environment files. It does not replace the user's Gradle command or modify installed dependencies.

## Assumptions and non-goals

- The requested commands generate release APK/AAB artifacts using existing signing. The existing debug certificate remains appropriate for QA; an AAB generated with that certificate is not a Play Store-ready distribution release. Production signing, permanent app identity, version policy, and publishing are outside this change.
- Installing/configuring Node, JDK, or the Android SDK on a new computer remains a one-time prerequisite. No machine-wide shell changes, hardcoded user paths, downloads of new toolchains, or automatic SDK installation are introduced.
- No device installation, app-data clearing, authenticated production testing, production mutation, backend deployment, commit, or push is included.
- No UI, API, database, permissions, or authentication contract changes are needed. Existing environment-scoped sessions remain intact. Existing invalid-environment errors must remain visible rather than falling back to another service.

## Risks, constraints, and recovery

- Gradle may need approved access to its cache, SDK, or dependency downloads. Reuse installed tools and preserve lockfiles.
- A successful build does not prove every authenticated mobile workflow is compatible with the deployed backend. Report native compilation and static APK verification separately from device runtime checks.
- Installing over an existing app requires matching package and certificate. Do not uninstall or reset an app to bypass a mismatch.
- Changing a native property that requires Expo prebuild remains separate from changing a public service URL. This work does not promise that arbitrary native app-configuration edits can bypass native generation.
- Build outputs and temporary logs are ignored/local artifacts. Source hashes and the final diff must show preservation of the existing environment and unrelated native configuration. Rollback reverts the scoped Gradle/helper/documentation changes without changing production or the user's selected environment.

## Acceptance criteria and verification

- AC1: Run the exact plain `./gradlew assembleRelease` and `./gradlew bundleRelease` commands with `NODE_ENV` absent, using the configured JDK/SDK. Both succeed and produce non-empty artifacts at the documented paths.
- AC2: Verify release metadata and JS use the same saved production configuration and no missing-`NODE_ENV` warning is emitted by configuration generation. APK and AAB both contain bundled JS/assets and current Remote configuration.
- AC3: Demonstrate an environment-only change invalidates the affected bundle without `clean` or `--rerun-tasks`; test file creation/removal and relevant shell overrides proportionately. Use isolated fixtures or temporary test inputs, restore the exact current environment, and regenerate final production artifacts before delivery. A subsequent unchanged build can reuse the JS bundle.
- AC4: Add focused regression coverage for release/debug mode handling and environment input tracking, including a conflicting inherited `NODE_ENV`. Preserve existing profile validation and run the existing app/environment configuration tests. Run `npm run typecheck` from `mobile/`.
- AC5: Inspect APK signature/manifest and AAB signing/ZIP contents using installed tools. Report package, version, minimum SDK, supported ABIs, non-debuggable release state, disabled cleartext, artifact sizes, and SHA-256. Do not infer artifact correctness solely from source configuration.
- AC6: Inspect the final diff and run `git diff --check` and `git status --short`. Preserve the existing environment edit and unrelated work; report exact checks, artifacts/logs, warnings, and unrun device/Play Store validation. No deployment or production data mutation.

## Open decisions

None for the existing release/QA configuration. The approved scope expands the earlier one-off APK build into a durable build-configuration fix covering both APK and AAB.
.90op
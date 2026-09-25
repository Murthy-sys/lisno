# Production-services Android test APK

Date: 2026-09-24
Status: Release APK built and delivered after signature/configuration verification. Device installation/runtime testing remains with the user.
Source: [Build specification](../specs/2026-09-24-mobile-production-services-apk-design.md).

## Bounded execution

1. Capture current dirty paths and hashes of environment, package/lockfile and app configuration. Complete: `/tmp/lisno-production-apk-qa/`.
2. Validate configured Remote HTTPS service and run local configuration/type checks. Complete: unauthenticated health returned `ok`; mobile typecheck passed; `npm test -- --runInBand app.config.test.ts src/core/config/environment.test.ts scripts/contract-drift.test.ts` passed 26 tests across 3 suites.
3. Regenerate Android configuration with `NODE_ENV=production npx expo prebuild --platform android --no-install`, then run `NODE_ENV=production ./gradlew assembleRelease --console=plain` from `mobile/android`. Complete: prebuild succeeded and Gradle reported `BUILD SUCCESSFUL in 6m 10s`, 694 actionable tasks. Release manifest disables cleartext. Existing development package and QA signing configuration retained.
4. Verify final APK signature, manifest/package/version/SDK/ABIs, non-debuggable release state, bundled JS/assets and production endpoint selection. Inspect bundled configuration for local/Metro dependencies. Copy APK into ignored `mobile/dist/apk/` and record SHA-256/size.
5. Reconcile source hashes, report exact results and any unrun device checks, and deliver the APK link. No device uninstall/data reset, account login, production writes, publishing, deployment or commits.

Primary owns the build, generated native output and verification. No feature-source edits or dependency changes are planned. Build/signature inspection is sequential after compilation; configuration tests and public health preflight can run independently.

## Evidence and current limitations

- The user requested manual commands, then explicitly asked to proceed with that build; the production URL was the only missing execution input and has now been supplied through `.env.local`.
- Prebuild completed without package changes. `.env.local`, `package.json`, `package-lock.json` and `app.config.ts` hashes match the captured prebuild baseline.
- Expo reports an existing optional `expo-system-ui` warning for `userInterfaceStyle`; no dependency was added for this packaging task.
- Gradle initially could not access its wrapper cache inside the filesystem sandbox. The same build was rerun with approved cache/network access. Public health DNS likewise passed on the approved network rerun.
- This release APK uses the existing QA identity/signing, not distribution signing. Native installation and authenticated workflows are separate from successful compilation and static artifact verification.

## Delivered artifact and verification

- APK: `mobile/dist/apk/lisno-production-services-2026-09-24.apk` (111,523,509 bytes; 106.36 MiB), ignored local build artifact.
- SHA-256: `b61eef81936e60ea95376468f96b9229a345a1c55c131c20bc89e34baaa799bb`. Companion `.apk.sha256` file saved beside it.
- App label `Lisno Dev`; package `com.lisno.mobile.dev`; version `0.1.0`, versionCode `1`; minimum SDK `24`; ABIs `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`.
- Android `apksigner verify --verbose --print-certs` passed with v2 signing using the existing Android Debug QA certificate. `aapt dump badging` and `aapt dump xmltree ... AndroidManifest.xml` verified the package, SDK and non-debuggable/cleartext-disabled release manifest.
- Inspected the final APK ZIP, not just intermediate build configuration: `assets/index.android.bundle` contains 6,711,584 bytes and the exact production URL configured by the user. `assets/app.config` selects Remote with `allowLocalHttp=false`. The emulator development URL is absent from the JS bundle.
- Production public health returned `ok`. No production login or writes were performed. No device installed/uninstalled, no data cleared, and no emulator or physical-device runtime smoke is claimed.
- `.env.local`, `package.json`, `package-lock.json`, and `app.config.ts` remained byte-identical to their prebuild hashes. Expo regenerated ignored native outputs; no tracked product source/dependency edits were required. Existing user work is preserved. Root `git diff --check` passed.
- Preflight mobile typecheck passed; app configuration, environment and contract-drift tests passed 26/26 across 3 suites. Unrelated full suites were not run for this packaging request.
- Non-blocking warnings: optional `expo-system-ui` advice from prebuild; dependency/native API deprecations and Gradle 10 compatibility deprecation warnings. No build error remained.
- Exact evidence: `/tmp/lisno-production-apk-qa/assemble-release.log`, `prebuild.log`, `signature-verification.log`, `apk-badging.log`, `apk-manifest.log`, `artifact-verification.json`, baseline hashes and status. No commits, publishing or backend deployment.

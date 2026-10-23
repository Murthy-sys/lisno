# Direct Android APK and AAB release command plan

Date: 2026-10-16
Status: Implemented and build-verified on 2026-10-16 in Mode A; both exact commands succeeded and artifacts are ready. Device execution and Play Store validation were not performed.
Source of truth: [Approved APK/AAB specification](../specs/2026-10-16-mobile-assemblerelease-apk-design.md), approved by the user on 2026-10-16.

## Outcome and boundaries

From `mobile/android/`, `./gradlew assembleRelease` produces the APK and `./gradlew bundleRelease` produces the AAB. Release metadata and JS use matching environment resolution, and environment-only edits invalidate cached bundles. No per-build shell exports or manual clean are required on the configured development machine.

- Preserve `mobile/.env.local`, the existing development identity/certificate, native permissions, version, and ABIs. Do not hardcode the production service address in build logic.
- Do not edit Gradle wrappers, installed dependencies, lockfiles, or unrelated app source. No clean prebuild, new dependency, device installation, production writes, deployment, staging, commit, or push.
- APK/AAB files and verification logs remain local build artifacts. Existing artifacts must be identified before they are replaced by normal build outputs.
- Keep one parent task in progress. Implementation begins only after this plan is approved and the execution mode is selected.

## Ownership

| Area | Owner and boundary |
| --- | --- |
| Specification, task plan, scope, integration, final reconciliation | Primary agent |
| `mobile/android/build.gradle`, `mobile/android/app/build.gradle`, a small repository-owned Gradle/helper file if needed, and focused new build-environment tests | One implementation owner; no other writer edits these paths |
| `mobile/README.md` | Primary agent, after the build behavior is settled |
| Read-only integrated review | `integrity_reviewer` in Mode A; primary in Mode B |
| Final build, cache, artifact, and regression verification | `verification_runner` in Mode A; primary in Mode B; sole owner of verification subprocesses and temporary environment fixtures |

In Mode A, the implementation owner may be a native Codex worker. Every delegated agent receives the approved scope, explicit paths, preservation requirements, and notice that others share the worktree. In Mode B, the primary performs all work inline.

## 1. Capture the baseline and settle task integration

Dependencies: Plan approval and execution-mode selection. Owner: Primary.

- Recheck `git status --short`, capture relevant target diffs, and record hashes for `.env.local`, package/lockfile, wrappers, and native identity/signing/manifest inputs without logging private values.
- Initial dirty paths at planning: `mobile/.env.local`, the two prior production-service working documents, and the pending APK/AAB specification. No existing changes appear in intended Gradle/helper/README targets.
- Inspect the installed plugin task interfaces and lifecycle. Confirm how the shared Expo config task can receive the appropriate mode for separate release and debug builds without globally changing all Gradle processes.
- Use Gradle task configuration and input declarations as the default. A helper is justified only if the plugin interface requires it. Keep the standard requested task names; account for qualified invocations when identifying variant behavior.
- Identify installed APK/AAB inspection tools, existing output paths, JDK/SDK access, and a temporary verification directory.

Acceptance: AC4, AC6; write ownership and the precise integration point are established before edits.

## 2. Implement build environment consistency and cache correctness

Dependencies: Task 1. Owner: Single build-implementation owner; primary owns the README slice.

### Build integration

- Configure release Expo metadata generation to use production-mode environment resolution, consistent with installed Expo release JS bundling. Ordinary debug generation must use its development context even if the parent shell supplies an inappropriate `NODE_ENV`.
- Keep app variant/service profile independent from optimization mode. Preserve existing Expo dotenv precedence and explicit shell overrides; retain existing validation errors rather than falling back to another service.
- Register all dotenv files that can affect the applicable mode as bundle inputs, including detection of file addition/removal. Register relevant public/configuration shell overrides and dotenv controls as inputs without serializing unrelated process environment or exposing secret values.
- Include any repository-owned helper as a task input. Use normal Gradle incremental invalidation; do not permanently mark JS bundling out of date or require `clean`/`--rerun-tasks`.
- Add focused behavioral regression coverage for missing/conflicting `NODE_ENV`, release/debug mode selection, environment input changes, and preservation of profile validation. Tests must exercise behavior, not merely match source strings.

### Documentation

- Update `mobile/README.md` with the two exact commands, prerequisites, and standard outputs:
  - `android/app/build/outputs/apk/release/app-release.apk`
  - `android/app/build/outputs/bundle/release/app-release.aab`
- Explain that normal service changes are read from the mobile environment, while native-property changes may still require the established native generation workflow.
- Describe the existing QA signing accurately; generating an AAB does not configure Play Store distribution signing.

Acceptance: AC1–AC4, AC6. Code/test implementation and README editing may proceed in parallel after the behavior and paths are settled. Do not run competing Gradle builds or temporary environment mutations during implementation.

## 3. Review the integrated change

Dependencies: All Task 2 writers finished. Owner: Read-only integrity reviewer.

- Check release/debug task selection, inherited environment handling, dotenv and shell precedence, input completeness, and cache reuse.
- Check that changing environment cannot produce fresh Expo metadata paired with stale JS, and that mode handling is not a global override affecting unrelated tasks.
- Verify no secrets, machine-specific paths, forced production identity, unexpected signing changes, wrapper edits, or dependency changes were introduced.
- Reconcile findings with the implementation owner. Resolve confirmed defects before final verification; review fixes proportionately.

Acceptance: AC2–AC4, AC6. This stage is sequential after writers to avoid reviewing transient shared-worktree state.

## 4. Verify direct commands, environment changes, and final artifacts

Dependencies: Task 3 findings resolved; no active writers. Owner: Verification owner.

### Focused checks

- Run the new build-environment tests plus `npm test -- --runInBand app.config.test.ts src/core/config/environment.test.ts` from `mobile/`.
- Run `npm run typecheck` from `mobile/`.
- Verify ordinary debug configuration independently from release and cover conflicting inherited `NODE_ENV`. Avoid an unnecessary full debug APK build if configuration/task-level checks establish the behavior.

### Cache regression

- Use an isolated fixture where practical; otherwise capture a restricted exact baseline of any temporary environment target and restore it in guaranteed cleanup. Do not overwrite an existing dotenv file without preserving its content or leave a test endpoint selected.
- Exercise an environment-only file change, a relevant higher-priority file addition/removal, and a relevant shell override. Confirm the affected release JS task executes without `clean` or `--rerun-tasks`.
- Confirm an unchanged repeat can reuse the JS bundle. Inspect the resolved/bundled value, not only a task-success exit code. Do not contact fixture endpoints.
- Restore the exact production environment and confirm baseline hashes before creating final artifacts. If interrupted, recover this baseline before any delivery.

### Exact commands and artifacts

- Remove `NODE_ENV` from the verification process environment and invoke `./gradlew assembleRelease` and `./gradlew bundleRelease` separately from `mobile/android/`, with the existing JDK/SDK configuration. Do not add user-required exports or substitute npm scripts.
- Capture bounded build logs. Both commands must succeed, with no missing-`NODE_ENV` warning from Expo configuration generation.
- Inspect the actual APK and AAB for bundled JS/assets, Remote production configuration, and agreement between JS and Expo metadata. Validate APK signing with `apksigner`; inspect AAB signing with the installed JDK/Android tooling. Report limitations of any unavailable inspection capability explicitly.
- Inspect artifact manifests/metadata for the preserved package/version/minimum SDK, ABIs, non-debuggable release state, and disabled cleartext. Use installed tools; no unapproved new dependency is needed for verification.
- Record sizes and SHA-256 checksums for both final artifacts and link their standard output paths.
- Compare preserved-file hashes, review the final diff, and run `git diff --check` and `git status --short`.

Acceptance: AC1–AC6. Final verification is serial because Gradle outputs and environment fixtures are shared. Tests/typecheck may run concurrently only when they do not observe temporary environment mutations.

## 5. Handoff

Dependencies: Task 4 complete. Owner: Primary.

- Report the two working commands, final APK/AAB links, principal build changes, exact checks/results, artifact sizes/checksums, and temporary log locations.
- State existing signing limitations and any unrun device or Play Store checks. Do not equate a successful build with authenticated production workflow verification.
- Report preservation of the previous production-service configuration and absence of deployment, production data changes, commits, or pushes.
- Update the durable plan/spec status to the verified outcome. If any acceptance criterion remains unmet, report it explicitly instead of claiming completion.

Acceptance: AC6; the user can repeat the two plain commands using the existing project setup.

## Execution evidence

- Baseline and verification files are under `/tmp/lisno-native-release-20261016/`. Twelve initial source hashes were recorded; the nine files outside the intended Gradle/README edits remained unchanged before native compilation. The APK and AAB output files were initially absent.
- Build integration uses the existing Android tasks plus `mobile/scripts/lisno-build-environment.gradle` and `mobile/scripts/lisno-node-environment.cjs`. Helpers live in the tracked scripts directory; wrappers, installed dependencies, lockfiles, identity, and signing were preserved.
- Independent integrity review found and resolved a transitive interpolation cache gap. Inputs now follow referenced shell variables recursively with cycle protection and hash the values. Separate release/debug execution is enforced for the shared Expo metadata asset.
- Real-project configuration exposed React Native's compatibility `project.ext.react` map and eager root-plugin app evaluation. Capturing the typed React extension and installing hooks before the root plugin resolved those lifecycle issues. The reviewer confirmed both fixes against the installed plugin code.
- `node --test scripts/native-build-environment.test.mjs` passed 2 tests covering 20 real Gradle fixture invocations, including environment file edits/additions/removals, nested and direct shell overrides, conflicting modes, invalid profile errors, and unchanged-bundle reuse. Current source hashes match `implementation.sha256` and the passing log `native-build-environment-tests.log`.
- Real Android project configuration passed `./gradlew :app:assembleRelease :app:bundleRelease --dry-run --offline --console=plain`; evidence is `native-configuration-dry-run.log`.
- `npm test -- --runInBand app.config.test.ts src/core/config/environment.test.ts` from `mobile/` passed 23 tests across 2 suites. `npm run typecheck` passed. The final verifier reconciled preserved-file and implementation hashes before native builds.
- Exact `./gradlew assembleRelease` with `NODE_ENV` absent succeeded in 4m 49s, with 735 actionable tasks. Exact `./gradlew bundleRelease` succeeded in 12s, with 681 actionable tasks; `createBundleReleaseJsAndAssets` was `UP-TO-DATE`, demonstrating unchanged-bundle reuse. Logs: `assemble-release.log` and `bundle-release.log` in the evidence directory.
- APK signature verification passed v2; AAB `jarsigner` returned exit 0 and `jar verified`. Both use the existing Android Debug certificate. Existing QA-signing warnings include an untrusted/self-signed chain, no timestamp, a legacy certificate signature, and JAR stream manifest ordering. Production distribution signing was not configured or validated.
- Both artifact manifests preserve package `com.lisno.mobile.dev`, version `0.1.0`/code `1`, minimum SDK `24`, target SDK `36`, non-debuggable release state, and disabled cleartext. Both include `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` libraries. Their embedded JS and Expo metadata hashes match; metadata selects Remote with the development app variant and local HTTP disabled.
- APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`, 134,129,931 bytes, SHA-256 `b0b61d1126b4b2dbee20b32db76b41724fd3fccd1c6da7d7ff8824ebb730cd03`.
- AAB: `mobile/android/app/build/outputs/bundle/release/app-release.aab`, 89,417,485 bytes, SHA-256 `075d49b98afda86f250006e569549393feb6bc9a6335ee9476dd7b27e2bd33a1`.
- Artifact evidence is recorded in `artifact-summary.json` and signature/manifest inspection logs under `/tmp/lisno-native-release-20261016/`. Build warnings also include dependency and Gradle deprecations; no unresolved compilation failure remains.
- No dependency added, device installation, authenticated runtime check, production request/mutation, deployment, staging, commit, or push occurred. Full unrelated test suites and Play Store validation were not run. The preceding production-service environment change remains preserved.
- Final bounded artifact check confirmed the exact configured production URL in each embedded JS bundle, Remote selection in each Expo metadata asset, and disabled local HTTP. All nine protected baseline files remained unchanged; `git diff --check` passed. Full Hermes initializer disassembly was stopped to avoid further delay; no device-level runtime success is claimed.

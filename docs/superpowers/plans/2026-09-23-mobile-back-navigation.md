# Mobile Back navigation task plan

Date: 2026-09-23
Status: Implemented; automated verification finished with one pre-existing contract failure; native interaction verification incomplete
Source of truth: [Mobile Back navigation specification](../specs/2026-09-23-mobile-back-navigation-design.md), approved by the user in this conversation.
Execution mode: A, parallel sub-agents, selected by the user after task-plan approval.

## Outcome and boundaries

Add one usable Back control to each non-home mobile app screen, retain each role's home exception, and preserve chat, pending-operation, and account-recovery behavior. Follow acceptance criteria AC1–AC9 in the approved specification.

All product changes are confined to `mobile/`. The primary agent owns the shared navigation contract and integration. Existing role destinations, authorization, session generation, query behavior, and native configuration remain authoritative. No dependencies, lockfiles, web/backend changes, data mutations, migration, commit, or deployment are planned.

The scope includes secondary account screens; sign-in, onboarding, startup loading, and startup recovery retain their existing entry behavior. Existing local Cancel/Close controls remain local actions. This task does not add universal draft persistence or unsaved-form prompts.

## Execution order and ownership

Only one parent task is in progress at a time. T3 contains independent implementation slices if Mode A is selected; Mode B executes those slices sequentially in the primary thread.

| Task | Deliverable | Dependencies | Owner and write boundary | Criteria |
| --- | --- | --- | --- | --- |
| T0 | Current baseline and verified integration inventory | Mode selection | Primary; temporary evidence only | All |
| T1 | Safe Back policy, router integration, and reusable control | T0 | Primary; new navigation/UI modules and their tests | AC2–AC4, AC8–AC9 |
| T2 | Approved shared contract integrated into the app root and scaffold | T1 | Primary; root layout, scaffold, route wrappers, shared mocks if needed | AC1–AC5, AC8–AC9 |
| T3 | General screens, chat, and secondary auth integrations | T2 | Three non-overlapping slices described below | AC1, AC3, AC5–AC9 |
| T4 | Integrated integrity review and corrections | All T3 slices complete | Read-only reviewer in Mode A; primary in Mode B; original owners fix findings | All |
| T5 | Final automated and rendered Android verification | T4 corrections complete | Verification runner in Mode A; primary in Mode B; evidence only | All |
| T6 | Final reconciliation and handoff | T5 | Primary; task plan and handoff only | All |

## T0: Establish the current baseline

- Capture `git status --short` and relevant per-target diffs under `/tmp/lisno-mobile-back-navigation-20260923/` before any product writer starts. At planning time, only `mobile/.expo/dev/logs/start.log` is dirty within mobile; do not alter or restore it. Re-check rather than relying on this observation.
- Reconfirm scaffold, feature/record routes, secondary auth routes, access denied, and chat handling against current source. Read existing test mocks before adding provider dependencies.
- Inspect the installed Expo Router APIs for route keys, native stack state, focus, and navigation actions. Use public supported APIs; avoid private router internals or relying solely on `canGoBack()`.
- Verify that `SessionSnapshot.generation`, environment identity, and user identity can fence eligible navigation entries. Do not change session or authorization contracts.
- Run the existing focused navigation, auth/startup, and messaging suites to identify current failures before changes. Save exact results rather than adopting historical counts.
- Inventory available Android tooling/emulator and existing development processes without clearing app data, installing packages, or interrupting unrelated servers.

In Mode A, independent read-only audits of native navigation/session handling and chat Back ordering may run alongside the primary baseline work. Audit agents have no product-file ownership and must finish before the shared contract is settled.

## T1: Build and verify the shared navigation foundation

Primary ownership: new files under `mobile/src/navigation/` for Back policy/provider/hooks and `mobile/src/ui/BackButton.tsx`, with adjacent focused tests. Proposed names are `backNavigationPolicy.ts`, `BackNavigationProvider.tsx`, and `useScreenBack.ts`; keep responsibilities small and avoid creating modules without a distinct purpose.

Required behavior:

1. Normalize supported feature, record, and More routes from native router state using stable IDs. Derive home and authorized destinations from `registry.ts`; do not duplicate its role map.
2. Prefer a known eligible preceding app entry owned by the current session. An unknown, stale, cross-session, auth, or unauthorized previous entry must never trigger a blind history pop. Use the specified feature/home replacement fallback instead.
3. Keep any ownership metadata ephemeral, bounded by current router entries, and keyed by environment, user, and session generation. Clear it on invalidation. Do not store credentials, tokens, password-reset parameters, or a persistent custom history stack.
4. Ensure replacement fallbacks cannot create detail/list cycles or redirect repeatedly into access denied. Keep the home exception exact to the top-level route.
5. Provide one shared dispatch path for visible Back and focused Android Back. Preserve native keyboard handling and modal dismissal. Only the focused route may react; retained mounted screens must not compete.
6. Provide a feature-local interception mechanism: a registered local handler can consume Back before route navigation, while pending-state locks can prevent navigation. Registration must clean up on blur/unmount and use current callbacks. A feature also needs a way to invoke its explicit parent action after local handling without recursively dispatching itself.
7. Implement an accessible, static arrow-and-Back control with a 48 dp minimum target, visible disabled state, and existing typography/colors. Use existing SVG/native dependencies.

Before T2/T3, record the concrete exports and use examples in the implementation record below. Required contract responsibilities are route visibility/target resolution, guarded Back dispatch, local interception, and the shared presentational button. Agents must consume this contract rather than invent parallel navigation stacks or global listeners.

Focused evidence: policy tests for home versus record, role differences, pushes/replacements, cold links, unsafe history, missing landing, session/environment transitions, and permission revocation; hook tests for focus and listener cleanup; rendered button accessibility checks.

## T2: Integrate shared infrastructure

Primary ownership:

- `mobile/src/app/_layout.tsx`
- `mobile/src/navigation/AdaptiveAppScaffold.tsx` and its tests
- `mobile/src/app/feature/[featureId].tsx`
- `mobile/src/app/record/[featureId]/[recordId].tsx`
- Associated new route tests; `mobile/test-support/setup.ts` only if shared test infrastructure truly needs adjustment

Install the provider at a location with runtime/session and router access. Preserve the font/splash lifecycle, hidden native header, and current Stack animation. Distinguish feature pages from record pages explicitly or through normalized route state.

Place the shared control above asynchronous content without crowding the identity bar. Suppress it on home and on the immersive phone chat thread where ChatThread owns the visible Back. Preserve tabs, rail breakpoints, notification behavior, and scaffold send locks. Wire local Back registration into the same guarded dispatch instead of adding independent competing listeners.

Add tests for every role's home and non-home feature, More, detail routes belonging to home, 599/600 and 839/840 dp chat boundaries, disabled navigation, and query-independent rendering. Keep root tab navigation using its established replacement behavior.

T2 is complete only when shared exports and shell integration are stable enough for the independent T3 consumers. No child may modify these primary-owned files during T3.

## T3: Integrate independent screen families

### T3a: General records, More, and denied states

Owner: primary. Files: `mobile/src/features/workspace/RecordDetailScreen.tsx`, `mobile/src/features/settings/MoreScreen.tsx` and tests, `mobile/src/app/access-denied.tsx`, and new focused tests for these surfaces.

- Remove redundant record Back buttons now supplied by the scaffold. Retain record actions and data handling.
- Verify Back remains present for loading, errors, unavailable detail, and empty data, including a direct record link.
- Ensure More and notifications get a usable return route through the scaffold.
- Give access-denied screens safe Back/recovery behavior based on current authorization. When no authorized landing exists, expose a viable account recovery/sign-out action without changing permission rules or entering a redirect loop.
- Preserve inline knowledge, finance, project, and lead form actions. Extend an existing guard connection only where necessary for the new control; do not redesign forms.

If an additional feature file must change to honor an existing guard, the primary explicitly takes ownership before editing. No broad form refactor is included.

### T3b: Messaging Back integration

Owner in Mode A: one frontend implementation agent. Exclusive files: `mobile/src/features/messages/MessagesWorkspace.tsx`, `ChatThread.tsx`, existing corresponding tests, and a new `MessagesWorkspace.test.tsx` if needed. Other messaging modules are read-only unless the primary reassigns a specifically justified target.

- Retain the existing phone thread arrow and accessible name; use the agreed shared contract without rendering a duplicate shell button.
- Preserve thread-to-conversation return behavior. Avoid history cycles after a thread was pushed, directly opened, or converted between phone/split layouts.
- Register existing local handling so a shell action on tablet dismisses transient thread state before leaving when applicable. Preserve group info, header menu, composer, reply, image viewer, and message-action behavior and priority.
- Maintain send locks and staged-media cleanup. Do not alter send requests, participant mutations, read acknowledgement, SSE, or draft ownership.
- Ensure native listeners act only for the focused route and do not navigate twice. Test phone and split transitions, including pending send and open overlays.

### T3c: Secondary account Back integration

Owner in Mode A: one frontend implementation agent. Exclusive files: `mobile/src/features/auth/AuthFrame.tsx`, `ForgotPasswordScreen.tsx`, `TokenPasswordScreen.tsx`, and adjacent auth tests. SignInScreen and startup/onboarding product files are read-only regression boundaries.

- Add an opt-in shared Back slot to AuthFrame so sign-in remains unchanged.
- Use a safe return-to-sign-in action for forgot/reset/invitation screens, including cold-link, inspecting, invalid, ready, error, and complete states.
- Remove duplicate Back affordances while retaining useful success actions. Protect in-flight requests and ensure Back never submits a request.
- Ensure returning to sign-in cannot replay sensitive token routes on later Back. Avoid recording token parameters in navigation metadata, fixtures, or logs.
- Test pending requests, direct links, one visible applicable control, and sign-in/startup/onboarding regression behavior.

Parallel rule: after T2, T3a, T3b, and T3c can run concurrently in Mode A with the primary plus two agents. Each agent is explicitly told that others share the worktree, must not revert other edits, and must return shared-contract issues to the primary. In Mode B all work, review, and verification stays inline.

## T4: Review the integrated behavior

After all writers finish, inspect the full task diff and run a read-only integrity review. Check every acceptance criterion, focusing on stale native history, account switches, authorization loss, missing landing recovery, duplicate handlers, local interception order, send locks, unsafe auth returns, and records misidentified as home.

The primary reconciles findings and assigns fixes to the original owner. Re-run affected focused checks after corrections. Broader final verification begins only when fixes are integrated. Review must not weaken permissions or introduce data mutations to make navigation tests pass.

## T5: Final verification

Run checks from `mobile/` unless indicated otherwise. Store logs and screenshots under `/tmp/lisno-mobile-back-navigation-20260923/`, not tracked source directories.

| Scope | Command or scenario | Required evidence |
| --- | --- | --- |
| Focused regression | `npm test -- --runInBand src/navigation src/features/auth src/features/settings src/features/workspace src/features/messages src/core/onboarding` plus any new route/UI tests outside those paths | All changed paths and AC1–AC8 exercised; exact totals and any baseline failures recorded |
| TypeScript | `npm run typecheck` | Clean typecheck |
| Integrated unit/rendered tests | `npm test -- --runInBand` | Final integrated results, not results observed during concurrent edits |
| Contract drift | `npm run test:contracts` | Existing mobile/backend role, permission, and operation contracts preserved |
| Android bundle | `npm exec -- expo export --platform android --output-dir /tmp/lisno-mobile-back-navigation-20260923/android-export` | Successful Metro/Hermes export with no package/configuration changes |
| Repository hygiene | Root: `git diff --check` and `git status --short` | Only assigned product changes plus preserved baseline work |

If Jest does not exit because of an existing open-handle issue, capture the actual result and diagnostic before using the established `--forceExit` workaround. Do not report a force-exited run as proof that resource cleanup is correct.

Native rendered verification must use the current code on an Android development build/emulator. Reuse a suitable local development build when possible; if a fresh debug build/install is necessary, use the existing development package and scripts without clearing app data, changing environment configuration, release signing, or touching unrelated running processes. Report exact build/runtime identity. Run `npm run test:e2e:android` when an installed compatible build is available, but do not treat its launch-only smoke as interaction coverage.

Exercise:

- Each distinct home policy through parameterized tests; representative Admin, Super Admin, and operational-role navigation through safe local fixtures or authorized test access.
- Home → More → feature → record → Back; notifications; direct record entry; loading/error/denied states; repeated Back without loops.
- Phone conversation → transient panel/reply → Back → conversation list; send-lock assertions through mocks rather than sending live messages; tablet split view and resize.
- Forgot-password and invalid-token recovery without requesting email or completing password/invitation mutations.
- On-screen and Android system Back; 360/412 dp phones, 600/840 dp boundaries, landscape, and enlarged text. Check 48 dp touch targets, accessible names, focus restoration, clipping, and composer/safe-area placement.

Record native console errors, device/API, dimensions, font scale, and tested interactions. Restore any task-owned emulator display changes. Stop only task-owned servers. If tooling, hardware, or test access prevents a scenario, state the gap precisely; do not substitute web screenshots or mock tests as native proof.

## T6: Reconcile and hand off

Update this plan's execution record with completed tasks, final exports, review findings and fixes, exact checks/results, artifact paths, and any unrun checks. Summarize the visible outcome, safe Back/fallback decision, affected mobile areas, and remaining limitations. Do not claim full native certification from a limited emulator matrix.

No seed, backfill, migration, production record mutation, deployment, commit, or push is part of this task. No additional user approval is needed for ordinary implementation and proportionate local checks once the plan and execution mode are approved.

## Execution record

- Specification approved by user: yes.
- Task plan approved: yes.
- Execution mode selected: A.
- T0: complete. Baseline 25 suites / 222 tests passed; existing Jest open handles confirmed on initial run and investigated with `--detectOpenHandles`. Read-only router and chat audits complete. Emulator available; existing backend and Metro are not task-owned.
- T1/T2: complete. Policy 81/81 and provider/hook integration 22/22 pass; role ownership includes environment, session generation, user, and role.
- T3: complete. General navigation, messaging, and secondary auth integrated. Initial combined focused lane passed 341 tests before the additional provider tests. Typecheck passes.
- T4: complete. Review findings fixed: still-authorized features without a home grant return to access-denied recovery; terminal denial consumes Android Back so it cannot bounce into retained history. Review confirmed both P2 findings closed. Provider regression also caught and fixed revoked conversation-parent fallback to home. A test initially placed under Expo's route directory was relocated to navigation tests before final export.
- T5 automated: mobile typecheck passed; full suite 622 passed / 1 pre-existing contract-drift failure (623 tests, 69 suites); targeted policy/provider lane 107/107 passed; explicit contract lane 2 passed / 1 same pre-existing failure; clean Android export passed (2,727 modules, 34 assets, 8.2 MB Hermes bundle); `git diff --check` passed. The drift is 224 mobile operations versus 227 backend operations, with three earlier Sub-Basket operations already present in the initial dirty backend baseline. No navigation operation contract changed or unrelated manifest repair was performed.
- T5 native: partial, not fully verified. Existing development APK installed on API 37 arm64 emulator at 1080×2424, density 420, font scale 1.0. Current JavaScript rendered welcome, sign-in, and password recovery with the Back control; native bounds verified its 48 dp height. Actual successful Back navigation was not established. Emulator commands then stalled, and the final recovered screen showed an unavailable Metro script. Authenticated-role, phone/tablet resize, enlarged text, TalkBack, and full hardware/gesture interaction matrix remain unverified. Existing Metro/backend processes were not restarted or reconfigured. Home hardware delegation remains the pre-existing platform behavior, as specified.
- T6: handoff records implementation and the verification gaps. No live catalog/message/finance mutation, migration, dependency addition, commit, push, or deployment performed.
- Shared export contract: `BackNavigationProvider` wraps the existing Stack inside runtime. `useScreenBack({ blocked? })` returns `{ visible, disabled, onBack, returnToParent(path) }`. Pass `blocked` only for the route's guard owner (scaffold or auth frame), not secondary consumers. `useBackInterceptor(() => boolean)` registers only while focused; true consumes the action. `returnToParent` bypasses interception and accepts only the current record's authorized feature path. `BackButton` accepts `onPress`, optional `disabled`, `accessibilityLabel`, and `accessibilityHint`. Root dispatch owns the single Android listener; remove competing chat listeners. Secondary-auth `onBack` resets the app stack to sign-in so token pages cannot replay.
- Product edits or tests performed at this planning gate: none.

### Final evidence and hygiene

- Exact commands, results, and limitations: `/tmp/lisno-mobile-back-navigation-20260923/final-verification/verification-report.md`.
- Clean final bundle: `/tmp/lisno-mobile-back-navigation-20260923/android-export-final/`.
- Native captures and baseline evidence: `/tmp/lisno-mobile-back-navigation-20260923/`. `recovery.png` establishes rendering only; `native-last-check.png` records the Metro connection failure. An earlier capture named `home-phone.png` is also a recovery screen and must not be treated as authenticated home evidence.
- Temporary UI/console diagnostics were removed before final typecheck/tests/export. Task-only additions to the tracked export runtime log were archived outside the repository and removed after exact baseline comparison. The pre-existing, shared Metro start log was preserved.
- The Jest suite used the established `--forceExit` lane; the baseline `--detectOpenHandles` investigation completed, but this does not establish resource-cleanup correctness. No lint script exists.

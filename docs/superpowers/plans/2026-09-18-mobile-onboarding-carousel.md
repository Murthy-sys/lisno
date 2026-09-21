# Lisno premium mobile onboarding carousel task plan

Date: 2026-09-18
Status: Approved and completed on 2026-09-18
Specification: [Mobile onboarding carousel design](../specs/2026-09-18-mobile-onboarding-carousel-design.md), approved by the user on 2026-09-18
Execution mode: A — parallel sub-agents

## Delivery contract

Add one first-install, three-slide onboarding experience before sign-in for anonymous users. Deliver three distinct premium interactive 2.5D Lisno scenes, horizontal paging, accessible scene actions, Next actions on slides one and two, and **Sign in to Lisno** only on slide three. Persist completion locally, preserve authenticated startup and direct auth routes, keep the current sign-in UI unchanged, and never display backend environment information.

No backend, API, authorization, session, finance, approval or environment contract changes are allowed. No new dependency or lockfile change is expected. Existing unrelated `.idea/` and repository work remain untouched.

## Ownership and dependency order

- The primary agent owns the approved product interpretation, navigation contract, shared route integration, documentation, final diff and reconciliation.
- In Mode A, one core/navigation writer may own T01–T02 while one onboarding UI writer owns T03–T04 after the slide model contract is settled. They must not edit each other's paths. The primary integrates T05, resolves findings and runs the final handoff.
- In Mode B, the primary implements T01–T07 sequentially.
- Final integrity review and verification begin only after all product writers stop. Tests run during concurrent edits are provisional until repeated against the integrated tree.

## T01 — Establish the completion-state contract

**Owner:** Core/navigation writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/core/onboarding/**` and focused tests only. Do not edit UI or route files.

- Add a small versioned onboarding-completion adapter backed by the already-installed AsyncStorage dependency.
- Use one app-wide, non-sensitive key such as `lisno.onboarding.complete.v1`; do not include API origins, user IDs or environment values.
- Expose explicit read and complete operations with injectable storage for deterministic tests.
- Treat absent or malformed state as incomplete. A read failure reports an incomplete state so onboarding remains available. A write failure is returned to the caller but never becomes an authentication blocker.
- Keep this adapter independent from token storage and the session manager.

**Acceptance evidence:** focused tests prove absent, completed, malformed, read-failure and write-failure behavior; storage calls use only the versioned onboarding key.

## T02 — Integrate startup and route behavior

**Owner:** Core/navigation writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/app/index.tsx`, `mobile/src/app/welcome.tsx`, the minimal startup/onboarding routing hook if needed, and route-focused tests. Do not implement visual scenes in this task.

- Preserve configuration errors, startup branding, session restoration and recovery precedence.
- After runtime boot, authenticated sessions continue directly to their authorized landing destination without reading or displaying onboarding.
- Resolve onboarding completion before choosing the anonymous destination. Incomplete or unreadable state routes to `/welcome`; completed state routes to `/sign-in` without flashing a slide.
- Add a thin `/welcome` route that renders the onboarding feature. Keep `/sign-in`, reset-password and invitation routes directly reachable.
- Completion triggered from the final slide attempts the T01 write and route-replaces to `/sign-in` whether the write succeeds or fails.
- An explicit logout reaches sign-in because completion was already recorded; no session or cleanup contract changes are introduced.

**Acceptance evidence:** route tests cover first anonymous launch, completed anonymous launch, authenticated restoration, unreadable storage, direct sign-in, storage-write failure and absence of redirect loops.

## T03 — Build the typed slide system and premium scenes

**Owner:** Onboarding UI writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/onboarding/**` and its focused tests. Do not edit startup/session files.

- Create a typed three-item slide model containing the approved eyebrow, title, body, visual variant, scene-action label and primary action.
- Build one responsive onboarding shell using existing tokens, wordmark/icon assets, SafeArea and Poppins fonts. Keep text and controls outside perspective transforms so they remain stable and readable.
- Implement the three approved scenes using existing React Native, Animated and SVG capabilities:
  - **Plan:** measured blueprint plane, isometric floor plates, projected shadows and gold phase path.
  - **Collaborate:** spatial role/decision nodes around a project core with front/back connectors and a trace pulse.
  - **Deliver:** layered procurement/approval/cost/progress tower resolving around the Lisno icon and completion arc.
- Give every scene foreground, subject and background depth planes, one coherent light direction and a distinct composition. Avoid generic card stacks, stock character art, random particles and remote images.
- Do not add WebGL, Three.js, a continuous render loop or a new dependency.

**Acceptance evidence:** component tests prove exactly three slides and exact approved copy/actions. Render inspection shows each scene is visually distinct and contains the required semantic depth layers.

## T04 — Add paging, scene interaction and accessibility

**Owner:** Onboarding UI writer in Mode A; primary in Mode B.

**Paths:** `mobile/src/features/onboarding/**` and its focused tests.

- Use a horizontally paged, virtualized native list with dimensions derived at render time; rotation and live resize must preserve the active index.
- Bind bounded slide progress to multi-plane parallax using transform/opacity properties suitable for the native animation driver. Inactive slides stop scheduled work.
- Add one optional accessible scene interaction per slide:
  - **Explore project layers** separates/reunites the plan floors and moves the phase path.
  - **Trace the handoff** sends one pulse through the collaboration nodes.
  - **See delivery align** performs one delivery-layer assembly cycle.
- Keep scene response under 1.2 seconds and prevent repeated taps from accumulating unbounded animations.
- Add Next to slides one and two; add **Sign in to Lisno** only to slide three. Swiping remains optional.
- Add three page indicators with a single current-position accessibility value. Android Back moves to the preceding slide from slides two/three and retains normal platform behavior on slide one.
- Honor system reduced motion: render completed static scenes, remove parallax/staged assembly and apply interaction state immediately.
- Maintain 48 dp controls, header semantics, readable contrast, screen-reader labels and height-aware scrolling for constrained displays/large text.

**Acceptance evidence:** interaction tests cover swipe/index synchronization, both Next actions, final CTA, scene actions, rapid taps, Back, resize, reduced motion and accessibility names/state.

## T05 — Integrate and protect existing authentication UX

**Owner:** Primary.

**Paths:** shared route registration, onboarding exports, `mobile/src/features/auth/**` only if tests require integration coverage, and focused integration tests.

- Wire the visual feature into `/welcome` and the completion callback from T02.
- Confirm that the existing sign-in form is unchanged after the final CTA and that forgot-password behavior still works.
- Confirm no Local/Remote badge, environment label, URL, selector or connection control appears in onboarding, sign-in or the authenticated header.
- Reconcile focus on slide entry and on the sign-in screen after route replacement. Ensure scene completion settles before the final CTA receives focus.
- Remove any temporary scaffold, duplicated slide model or unused scene primitive introduced during parallel work.

**Acceptance evidence:** integrated first-launch → three slides → sign-in flow passes; completed launch → sign-in and authenticated launch → workspace pass; source search proves no environment presentation was reintroduced.

## T06 — Integrity review and corrections

**Owner:** `integrity_reviewer` in Mode A; primary inline in Mode B.

Review the integrated change for:

- authenticated and anonymous route precedence;
- storage failure and redirect-loop behavior;
- direct reset/invitation/sign-in compatibility;
- accidental token/environment coupling;
- animation cleanup, duplicate timers and repeated-tap races;
- accessibility equivalence when motion/interaction is disabled;
- constrained-height/large-text clipping;
- unrelated file, dependency or lockfile changes.

Resolve confirmed findings before final verification. Re-run only the affected focused checks after each correction.

## T07 — Final verification and handoff

**Owner:** `verification_runner` in Mode A; primary inline in Mode B. No concurrent writers.

Run from `mobile/` unless stated otherwise:

1. Focused onboarding persistence, startup routing, carousel interaction and auth-regression tests.
2. `npm run typecheck`.
3. `npm test -- --runInBand` once against the final integrated tree.
4. `npm run test:contracts` to prove mobile contract drift remains intact.
5. `npm run export:android` or a clean temporary Android export.
6. Existing arm64 debug APK build when native inputs changed or the final emulator lane requires a fresh install.
7. Emulator interaction and visual QA:
   - first-launch slide 1;
   - each scene at rest and after its interaction;
   - swipe and Next navigation;
   - final CTA to the unchanged sign-in screen;
   - completed relaunch direct to sign-in;
   - Android Back on slides two/three;
   - reduced-motion state;
   - compact portrait, landscape and available expanded-width evidence;
   - no `LOCAL` or other environment presentation.
8. From the repository root, run `git diff --check`, inspect `git status --short`, and review the scoped changed-path set.

Update `mobile/README.md` and `mobile/docs/android-support.md` only with final, observed behavior and exact verification evidence. Record any unavailable physical-device, TalkBack or expanded-emulator check as unrun rather than inferred.

## Acceptance-to-task trace

| Specification criterion | Tasks |
| --- | --- |
| AC1 first anonymous launch opens onboarding | T01, T02, T05, T07 |
| AC2 exactly three premium depth scenes | T03, T04, T07 |
| AC3 action placement | T03, T04, T05 |
| AC4 synchronized paging/parallax/Back | T04, T07 |
| AC5 completion then route replacement | T01, T02, T05 |
| AC6 returning/authenticated bypass | T01, T02, T05, T07 |
| AC7 recoverable storage failures | T01, T02, T06 |
| AC8 no backend/environment presentation | T05, T06, T07 |
| AC9 accessible scene interactions | T03, T04, T06, T07 |
| AC10 responsive/reduced-motion rendering | T03, T04, T07 |
| AC11 tests/export/emulator evidence | T06, T07 |

## Parallel execution boundaries

If Mode A is selected:

- T01 must settle the storage interface before T02 consumes it.
- T03 may begin in parallel with T01 because it owns only `mobile/src/features/onboarding/**` and consumes a callback contract supplied by the primary.
- T02 and T04 may then proceed in parallel because their paths do not overlap.
- T05 waits for both writers, after which no product writer remains active during T06 and T07.
- The primary owns shared route/model interface reconciliation and will not permit both writers to edit `mobile/src/app/index.tsx`, route tests or shared UI primitives.

No task is authorized to commit, push, deploy, publish, seed, migrate, create signing material or mutate production.

## Completion evidence

- T01–T05 are implemented across the onboarding core adapter, startup routing, `/welcome` guard, typed three-slide feature and existing sign-in integration. The completion key is `lisno.onboarding.complete.v1`; write failure still routes to sign-in.
- The Mode A integrity review found and resolved direct `/welcome` bypass behavior, misleading progress semantics and a reduced-motion initialization race. The follow-up review reported no blocker, high or medium findings.
- Final automated verification passed: 38 Jest suites / 195 tests, 1 contract suite / 3 tests, TypeScript typecheck and a clean Android Hermes export containing all approved slide copy and actions.
- The arm64-v8a Gradle debug build completed successfully with 380 actionable tasks, and the installed-app launch smoke passed on `emulator-5554` after the smoke harness was made tolerant of normal Android process-start latency.
- Rendered emulator QA covered all three portrait slides, final CTA to the unchanged sign-in form, completion persistence across relaunch, Android Back from slide two, and the expanded landscape composition with scroll-reachable controls. No Local/Remote label, URL or backend selector was visible.
- Reduced motion, resize, accessibility naming/announcements, storage failures and scene interactions are covered by component tests. TalkBack, 320 dp, enlarged system text and physical-device checks remain unrun and are recorded in `mobile/docs/android-support.md`.
- No dependency, backend contract, migration, deployment, publication, commit or production action was introduced by this change.

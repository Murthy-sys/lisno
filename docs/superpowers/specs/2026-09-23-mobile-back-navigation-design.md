# Mobile Back navigation

Date: 2026-09-23
Status: Approved by the user; implementation and verification recorded in the separate task plan

## Goal and scope

Provide an obvious, consistent Back control on every non-home screen of the Lisno **mobile app**. The user clarified that this request concerns `mobile/`, not the responsive web application.

Cover authenticated feature screens, record details, More, notifications, configuration, access-denied states, and messaging on phones and tablets. Include secondary account screens (forgot password, reset password, invitation acceptance), where Back returns safely to sign-in. Preserve existing local Back/Close controls in modal and nested workflows.

Assumption: “home” means the current role's authorized landing screen, not every bottom-navigation destination. Sign-in, the initial welcome experience, startup loading, and startup recovery are entry/recovery flows rather than authenticated app screens; their routing and onboarding behavior remain unchanged. This scope resolves the earlier unanswered web/auth clarification using the user's subsequent mobile-only correction.

No web, backend, API, database, permission-policy, dashboard redesign, dependency, or native-package changes are required. Universal form autosave and new dirty-form prompts across unrelated workflows are outside this navigation change.

## Current behavior and evidence

Verified from current mobile source:

- `src/app/_layout.tsx` configures Expo Router's Stack with `headerShown: false`; standard native Back controls are therefore absent.
- `src/navigation/AdaptiveAppScaffold.tsx` supplies identity, notifications, tabs, and a tablet rail, but no Back control. Root-tab selection uses `router.replace`, so navigation history alone cannot guarantee a previous screen.
- `src/navigation/registry.ts` already owns permission-filtered feature destinations, root tabs, and `landingDestination`. It is the source of truth for home and accessible fallbacks.
- `src/app/feature/[featureId].tsx` and `src/app/record/[featureId]/[recordId].tsx` both use the scaffold. Matching only `activeFeature` would incorrectly hide Back on records belonging to the home feature.
- `src/features/workspace/RecordDetailScreen.tsx` has scattered text Back buttons using unconditional `router.back()`. They appear only after successful data loading, leaving loading, unavailable, and error states without them.
- `src/features/settings/MoreScreen.tsx` uses the scaffold but has no Back control.
- `src/features/messages/MessagesWorkspace.tsx` and `ChatThread.tsx` already implement phone thread Back, adaptive list/thread layouts, Android Back handling, and send-time navigation blocking. Phone record views below 600 dp hide the outer scaffold chrome; the messaging rail starts at 840 dp.
- `ChatThread` consumes Back for transient UI and reply state before leaving the conversation. Group info, image viewing, and other sheets own their dismiss behavior. A second generic thread button could bypass these protections.
- `KnowledgeCatalogWorkspace.tsx` uses inline creation/detail panels with Cancel and Close detail controls; those are local workflow actions, not separate routes.
- Forgot-password has a Back-to-sign-in action, including an unconditional history call. Reset/invitation screens only offer a sign-in action in invalid/completed states, not throughout their flow.

Relevant existing checks include navigation registry/scaffold tests, MoreScreen tests, messaging navigation and overlay tests, auth tests, and startup/onboarding routing tests. No implementation or verification result is claimed by this specification.

## Home definition

Use `landingDestination` with the current role and authorization snapshot. The table describes current registry behavior; do not duplicate it as a second hard-coded implementation map.

| Role | Home feature route |
| --- | --- |
| Super Admin | `/feature/dashboard` |
| Admin, Designer, Client | `/feature/projects` |
| Estimator / Sales | `/feature/leads` |
| Design Manager | `/feature/team` |
| Design Head | `/feature/organization` |
| Procurement, Finance Head, Site Manager, all worker roles | `/feature/work` |

Only the matching top-level feature route is home. A project record still gets Back when Projects is home. Projects gets Back for Super Admin. Messages, More, notifications, and secondary root tabs get Back. Filters or dashboard sections within the home route do not turn it into a separate page.

## Recommended behavior

### Shared route Back

1. Render one Back control in a stable, top-left location above the active screen content, integrated with the existing scaffold. Keep it outside asynchronous page content so loading, empty, failed, denied, and stale-data states retain navigation.
2. Hide it on the authorized role-home route. Do not infer home from the selected tab alone.
3. Prefer the previous eligible mobile app route when the router has a known previous entry belonging to the current authenticated session. Re-check that destination against the current authorization snapshot. Never navigate into a previous user's workspace, an authentication page, or an unavailable feature as authenticated Back history.
4. When eligible history is unavailable, record details return to their authorized feature list. Other authenticated pages, including More and feature lists, return to the authorized role home.
5. A cold-start or deep-linked record must have working Back even without prior navigation. Use replacement for fallback navigation so repeated Back cannot cycle between the detail and its parent. Do not change all tab selection to push or introduce a persistent custom history stack.
6. If authorization no longer permits the intended parent, use the current authorized home. If no landing is available, retain a recovery/account action that does not redirect repeatedly between `/` and access denied. Back must not bypass access checks or create a loop.
7. Use existing router navigation and focus-aware native Back handling. Screen Back and Android system Back should share route resolution on non-home screens while preserving the keyboard, modal, and feature-specific handling that consumes Back first. Do not alter the platform exit behavior of the home screen.
8. Replace redundant record-level route Back buttons with the shared control. Keep local step, panel, Cancel, and Close actions where they serve a different purpose.

### Messaging and nested surfaces

- Phone thread Back remains in the existing thread header and returns to conversations through its established handler; do not add another visible route Back above it.
- The conversation list gets a route Back control. Tablet/split layouts retain a way to leave Messages without changing the established list/thread selection model.
- Thread menus, reply context, media previews, group info, and transient composer surfaces retain their current Back/dismiss priority. A shell-level action must delegate to active local handling before leaving when applicable.
- Pending sends retain their existing navigation lock, including the newly added control. Back must not cause a duplicate send, abandon an in-flight operation, or skip staged-media cleanup.
- Existing inline form controls remain available. The new control must honor existing disabled/pending or navigation-guard state; it must not silently submit, save, delete, freeze, or discard data as a side effect.

### Secondary account screens

Provide the same recognizable Back affordance on forgot-password, reset-password, and invitation-acceptance screens, including loading/invalid/error states. Its safe destination is sign-in, independent of whether the screen was reached through a link or a prior app screen. Preserve request-in-progress protection and existing completion actions; avoid duplicate Back controls.

Do not replay secure-token routes on subsequent Back. Do not persist or log tokens, credential fields, or sensitive route parameters to implement navigation history.

## UX requirements

- Use a simple static left arrow with visible **Back** text for the shared control; preserve the existing compact chat arrow and its descriptive accessible name.
- Reuse mobile Poppins typography, existing spacing, and surface/text tokens. Use a lightweight native/SVG arrow with existing dependencies, without Lucide, shadows, gradients, hover animation, or a new visual theme.
- Provide a minimum 48 dp touch target, button semantics, descriptive accessibility label/hint, and disabled state where navigation is temporarily blocked.
- Respect safe areas, phone/tablet navigation, landscape, keyboard visibility, and large text. Avoid overlapping identity, notifications, page titles, bottom tabs, or the fixed chat composer.
- Preserve accessible modal focus restoration and return focus where the current navigation framework supports it. Avoid adding another screen title or unnecessary full native header.

## Options and decision

**Recommended: shared custom Back with eligible native history and parent/home fallback.** Fits the existing hidden native header and immersive chat design, follows actual entry paths when available, and works after tab replacement or deep linking. Requires focused integration with existing chat handlers and session/permission checks.

**Alternative: always return to the logical parent/home.** Simpler and deterministic, but a screen opened from More or another workspace would ignore that origin. This is less consistent with a control labelled Back and is not the recommended behavior.

Enabling a global native Stack header would duplicate current custom chrome and require broader messaging/dashboard layout changes. The existing architecture supports extending the custom scaffold instead.

## Invariants, compatibility, and side effects

- Authorization remains sourced from the existing mobile registry and current session snapshot; backend enforcement is unchanged.
- Identity changes, sign-out, session invalidation, and environment changes invalidate any eligibility information used for Back. Keep such information ephemeral and bounded if additional state is needed.
- Stable feature/record IDs remain the navigation keys. Names are display text only.
- No API request/response, storage schema, finance value, query key, permission, or audit contract changes.
- Navigation alone performs no mutation. Existing unsaved-state, pending-operation, modal, and chat safeguards must continue working.
- No data migration, production action, package installation, release signing, or deployment is needed. Rollback is limited to the task's mobile navigation/UI changes.
- Preserve unrelated work. At investigation time only `mobile/.expo/dev/logs/start.log` was dirty in `mobile/`; the wider repository has substantial unrelated changes. Capture fresh target diffs before implementation.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | Every authenticated non-home feature, More, and record screen has exactly one applicable route Back control. | Registry-wide role/route matrix and rendered scaffold/route tests, including records whose feature is home. |
| AC2 | No shared Back is shown on the current role's home. Secondary root tabs still show it. | Parameterized tests for every role, including Projects for Admin versus Super Admin. |
| AC3 | Back follows eligible history or uses a safe feature/home fallback without loops. | Normal push, replaced tab, direct record link, empty history, denied parent, and missing landing cases. |
| AC4 | History cannot expose a previous identity's workspace or route around authorization. | Session/environment change and permission-revocation cases using distinct users and feature grants. |
| AC5 | Loading, empty, offline/error, and permission states retain a usable return control. | Rendered route-state tests independent of successful API data. |
| AC6 | Chat retains one phone thread Back, correct overlay/reply ordering, send locks, and tablet behavior. | Existing and extended MessagesWorkspace/ChatThread/scaffold tests; installed Android interactions. |
| AC7 | Secondary account screens can return to sign-in from normal and deep-linked states. | Auth rendered interactions, pending/invalid states, and startup/onboarding regression tests. |
| AC8 | Shared Back preserves existing local dismissal and navigation protection; no mutation occurs from navigation. | Focused guarded/pending-state tests and network/mutation spies where relevant. |
| AC9 | Back is reachable and readable across phone/tablet widths and enlarged text, without clipping or duplicate headers. | React Native accessibility assertions plus rendered Android phone/tablet or resized-emulator checks. |

Final implementation verification should include focused tests first, then mobile typecheck, the integrated mobile Jest suite, contract-drift checks, and an Android Metro export. Use current package scripts; there is no lint script. Inspect `git diff --check` and final dirty paths.

Native QA should exercise home → More → feature → record → Back, notifications, a direct record entry, a chat thread and overlay, and Android hardware/gesture Back. Check representative 360/412 dp phone and 600/840 dp adaptive boundaries, landscape, and large text. Record actual device/API and executed checks. If native hardware/tooling is unavailable, disclose that limitation rather than treating a web preview or unit tests as native proof. No live message, finance, identity, or catalog mutation is needed for navigation QA.

## Risks and remaining decisions

- Native history can retain entries across replacements; merely checking `canGoBack()` is insufficient to establish a safe destination.
- Several retained routes can mount listeners concurrently; only the focused screen may handle Android Back.
- Chat has its own overlay and send lifecycle. Shared handling must preserve its priority rather than race or navigate twice.
- Small screens and large text can crowd the existing identity bar. Position and sizing need rendered validation.
- The anonymous entry-flow scope is an explicit assumption above. No other product decision is required before approving this specification.

Only this specification is created at the current gate. A separate task plan, execution-mode selection, and implementation follow the repository approval workflow.

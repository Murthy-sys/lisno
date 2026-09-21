# Lisno React Native Android application

Date: 2026-09-18
Status: Approved on 2026-09-18, including the environment-only backend-selection revision.
Classification: Substantial, with high-risk authentication, approval, financial, and file-handling consumers.

## Goal

Create a React Native Android application in `mobile/` within the existing Lisno repository, as a sibling of `frontend/`, `backend/`, and `ocr-worker/`. Give it its own runnable package, matching the existing sibling-project organization. Deliver the existing Lisno application's supported features through native mobile interactions. Select the backend exclusively through environment configuration, with Remote as the default and Local available through an explicit development environment value. Do not expose backend selection or URL editing in the app. Provide a premium Lisno launch experience using the existing logo and a Lisno icon loader.

Feature parity is the completion target. A splash screen, login, read-only dashboard, placeholder screens, or a website wrapped in a WebView does not satisfy this request.

## Interpretation and assumptions

- Interpret “remove backend services” as “remote backend services.” Local services means the existing backend running on a developer machine or local network, not business services embedded in the APK or an offline database replacement.
- User clarification: `mobile/` belongs in this same repository, just like `backend/`, `frontend/`, and `ocr-worker/`. It has its own package manifest, lockfile, configuration, assets, tests, and README. Do not initialize nested Git history, create a separate repository, or move existing projects.
- “All Android devices” means broad Android phone, tablet, and foldable support. Proposed minimum: Android 7 / API 24, subject to verifying all selected native dependencies. Historical Android versions below that minimum, watches, TV, and automotive interfaces are outside this application scope.
- English and the existing Lisno terminology/currency conventions remain the baseline. No new translation system is required.
- Remote API base URL, permanent Android application ID, signing identity, and verified link domains are not supplied. Keep those deployment inputs explicit; do not invent a working service address or access production while developing.
- User correction: backend profile selection belongs in the environment file, not in application UI or persisted device settings. `EXPO_PUBLIC_API_ENV` is the sole profile selector; changing it requires restarting/rebundling the development app or creating a new build.

## Current behavior and evidence

The initial worktree is clean (`git status --short` returned no paths). No mobile project exists in the inspected application layout. No existing application or lockfile changes are needed at this specification gate.

| Verified source | Finding and mobile implication |
| --- | --- |
| `frontend/package.json` | React, Vite, TypeScript, TanStack Query, React Hook Form, and Zod web app. DOM components and CSS cannot be reused directly as native screens. |
| `frontend/src/app/router.tsx`, `routeRegistry.ts` | Public authentication routes and role-specific project, design, management, sales, client, administration, procurement, finance, access-request, and chat routes. Route parity alone does not cover nested actions. |
| `frontend/src/api/authorization-contract.ts` | Sixteen role codes, including six worker roles. Navigation is filtered using authorization snapshots as well as presentation roles. |
| `frontend/src/api/client.ts` | Versioned API, bearer authentication, `{ data }` response envelopes, structured errors, pagination, multipart uploads, authenticated downloads, and event streams. Uses browser storage and browser events. |
| `frontend/src/auth/AuthProvider.tsx` | Restoration checks `/auth/me` and `/auth/authorization`, validates authorization, cancels obsolete work, and clears authenticated query caches. Mobile must preserve those race protections with native storage. |
| `frontend/.env.example`, local configuration inspection | Current configured frontend endpoint uses HTTP loopback. No remote deployment address has been established from this investigation; no configuration secrets were copied into this document. |
| `backend/src/app.ts`, `backend/src/routes/auth.ts` | Existing services are mounted under `/api/v1`. Mobile should consume the same API, not introduce a parallel business backend. |
| `frontend/src/features/*/*Api.ts` | Mutation-heavy design, estimation, workflow, procurement, configuration, access, and financial features. Full parity is a multi-feature build. |
| `frontend/src/features/messages/projectChatStream.ts`, `notifications/notificationStream.ts` | Authenticated SSE, cursors/resynchronization, bounded parsing, reconnects, and browser lifecycle hooks need native transport/lifecycle adapters. |
| `frontend/src/features/finance/projectFinanceApi.ts` | Finance entries use integer paise and idempotency keys; portfolio and project totals come from the backend. |
| `frontend/public/lisno-logo.svg`, `frontend/src/assets/lisno-loader.svg`, `components/ui/BrandLoadingMark.tsx` | Existing brand wordmark and loader artwork are available. Use these source assets rather than redesigning the logo. |
| `frontend/src/styles/global.css` | Existing brand includes deep purple `#1e183b`, gold `#d5ad18`, white surfaces, and Poppins interface typography. |
| Root `AGENTS.md` | Specification, separate task plan, and execution-mode gates apply. Existing identity, approval, finance, mail, storage, and OCR invariants remain binding. |
| Implemented `mobile/src/core/config/environmentSelection.ts`, `mobile/src/features/settings/ConnectionScreen.tsx` | The first implementation persisted a device-side Remote/Local selection and exposed it on sign-in and Settings. That behavior conflicts with the user's correction and must be removed. |
| Implemented `mobile/src/runtime/createRuntime.ts` | The configured URLs are read from public environment variables, but `EXPO_PUBLIC_API_ENV` is currently ignored and Remote is always required. The corrected resolver must validate and activate the environment-selected profile. |

Investigation is sufficient to establish product scope and integration boundaries, but is not an endpoint-by-endpoint compatibility certification. The task plan must expand each parity area below into traceable screens, actions, APIs, and verification coverage, including mutations implemented inside web components.

## Architecture recommendation and alternatives

**Recommended: React Native + TypeScript with stable Expo tooling and native Android builds.** Use Expo Router for navigation, TanStack Query for server state, native secure token storage, React Native SVG for brand/annotation vectors, and compatible native file/media modules. Use development builds when required and validate the actual splash in a standalone build. Cloud build services are optional, not a runtime requirement.

Expo's current reference lists SDK 57 paired with React Native 0.86 and Android 7+. Pin a compatible stable dependency set during the approved implementation; avoid unpinned prereleases. [Expo SDK compatibility](https://docs.expo.dev/versions/latest/)

**Alternative: bare React Native with directly maintained Gradle/native configuration.** Offers more manual control over splash resources and native modules, but increases maintenance for permissions, assets, builds, and upgrades. Choose this only if a verified required capability cannot be delivered through Expo modules/configuration plugins. The official React Native guidance recommends a framework for new projects. [React Native setup guidance](https://reactnative.dev/docs/environment-setup)

Within `mobile/`, separate navigation/composition, feature screens, typed API contracts, authorization, environment configuration, query state, native device adapters, reusable UI/theme, and bundled brand assets. Keep business decisions on the existing backend. Avoid runtime imports from sibling web source files so the mobile folder remains independently installable; explicitly record the provenance of adapted contracts and detect contract drift with tests. Do not undertake a shared-package monorepo refactor in this scope.

## Scope and feature parity

Each area requires native list/detail/form flows and all currently supported role-authorized actions. “Same features” preserves outcomes, validation, status meaning, history, and permissions; mobile layout may differ. Existing web placeholders are not a request to create new backend capabilities.

| Area | Required mobile behavior | Evidence anchor |
| --- | --- | --- |
| Identity and session | Sign-in/out, secure restoration, expired-session handling, forgot/reset password, invitation inspection/acceptance, authorization-aware landing and access denial. Public client signup remains subject to the repository's email-ownership restriction. | `frontend/src/auth/`, backend auth routes |
| Projects and task workspaces | Role-specific project lists/details, project creation where permitted, floors/stages/tasks, assignments, activity, version history, operational work queues, task actions, and proof/media. | `features/designer/`, `features/admin/`, `features/home/`, `features/workflow/`, `components/tasks/` |
| Design and approvals | Uploads, extraction status/retry/manual review, design sections, designer assignment, submission/review, client responses, payment confirmations, furniture requirements/dimensions, workflow progression, approval history, attachments, and delivery retry/status. | `features/designer/`, `features/workflow/`, `features/client/`, `features/admin/DesignPlanResponseInboxPage.tsx` |
| Sales and estimates | Lead list/search/detail/create/edit/activity, saved and draft estimates, calculations supported by the current UI, submit/review/assignment, publication and delivery state, client decisions, PDF export, and client-response evidence. | `features/leads/`, `features/estimates/`, `features/admin/estimateClientResponsesApi.ts` |
| Drawing and plan review | Existing upload/replace/delete actions, drawing-item mapping, plan/drawing previews, touch pan/zoom, annotation drafts, client decisions/change requests, request targeting/resolution, and version conflicts using the existing annotation schema. | `features/leads/estimateDesignApi.ts`, `features/estimates/ClientPlanPageReview.tsx` |
| Management | Team and organization views, designer summary, KPI/task breakdown, evaluation, audit/activity, deadlines and reasoned deadline revisions. | `features/manager/`, `features/head/` where present, corresponding router components |
| Client | Project summaries/details, approved versions, estimate/design review and changes, permitted workflow actions and progress, authenticated artifacts, and project conversations. | `features/client/`, client-facing estimate APIs |
| Procurement | Project/items hierarchy, vendor directory and suggestions, permitted item/vendor creation and editing, units, procurement expenses, supporting documents. | `features/procurement/` |
| Finance | Portfolio and project figures, ledger history, direct-spend/overhead entry, supporting documents, payment confirmation and workflow controls where permitted. | `features/finance/` |
| Configuration and administration | Super Admin dashboard, managed users, invitation create/resend/revoke, existing knowledge item/revision/activation workflows, reusable values, baskets/main lines, masters, surfaces, pricing/mode configuration and simulator, quality import/export and editing, and supported lifecycle actions. | `features/admin/`, `features/ai-estimator-knowledge/` |
| Access requests | Request, own history/cancel, review/decision, and grant revocation with existing project scope. | `features/access/` |
| Project messages | Conversation list, pagination/search where supported, participant management, messages/replies/mentions, issue status, read state, typing activity, file/image attachments, audio recording/playback, transfer progress/cancel/retry, reconnect/resync. | `features/messages/` |
| Notifications | In-app list, unread count, mark read, authorized navigation to the referenced message, foreground realtime updates, and catch-up on resume. | `features/notifications/` |

The implementation may be delivered internally in increments, but no area may be silently deferred or substituted with a “coming soon” screen while claiming parity. OS push delivery while the app is terminated is a new backend/platform capability, not evidenced by the current in-app SSE feature, and is outside this parity scope.

## Authorization and data contract

Presentation groups below describe entry points, not permission grants. Each action uses the backend authorization snapshot and corresponding operation policy; project assignment, relationship, ownership, and explicit grants continue to constrain access.

| Actor | Native entry points to reproduce |
| --- | --- |
| Client | Own linked projects, permitted reviews/actions, messages, notifications |
| Designer | Workspace, design plan tasks, assigned project work, own access requests |
| Design Manager / Design Head | Team or organization, designer/project review, evaluation and deadline controls according to policy |
| Sales (`estimator_sales`) | Leads, estimates, associated reviews/design context |
| Sales Manager (`admin`) | Scoped projects, procurement oversight, response/design/access review queues |
| Super Admin | Operation-specific dashboard, projects, users/invitations, configuration, finance and oversight entries; no blanket client-side bypass |
| Procurement / Finance Manager / Site Manager | Authorized operational queues, respective procurement/finance workspaces, access requests |
| Six worker roles | Assigned operational work and permitted conversations/actions |

- Use current request/response/error shapes, stable IDs, pagination, CAS/version fields, approval/proof fields, and idempotency keys. Public token endpoints must not receive an unrelated bearer token.
- Persist bearer tokens in Android-backed secure storage, not plain async storage. Do not store passwords. Authenticate and validate authorization before rendering protected content. Fail closed on invalid or mismatched snapshots.
- Keep session/environment generations so delayed responses and delayed 401s cannot overwrite or sign out a newer session. Clear private state on logout and denied access.
- Never infer privilege from labels or role names alone. Keep immutable Super Admin identity and demo/loopback restrictions unchanged. Development connectivity is not a reason to relax backend authorization.
- Production public client signup/project claiming is not enabled by this project unless email ownership is verified before linking/session issuance. The current signup route is not evidence that this invariant is satisfied; retain existing safe login/invitation paths and explicitly account for this exception in parity verification.
- Finance uses integer paise internally; preserve explicit conversions for existing rupee-boundary contracts. Backend approved estimates, GST treatment, profit baseline, expense classification, and ledger overheads remain authoritative. Do not recalculate a substitute balance in the app.
- Approval, estimate, and design history remains immutable. Preserve actor identity, versions, on-behalf proof, deduplication, and server audit behavior.
- Invitation create/resend retains delivery preflight. Estimate/design publication retains commit-independent mail state/retry. The mobile UI must display persisted disabled/failed delivery truthfully.
- No embedded mail, database, OCR, storage-provider, or administrative service credentials. OCR continues to use the current backend/worker protocol.

## Environment-only backend selection

1. Define one validated environment resolver. `EXPO_PUBLIC_API_ENV` accepts only `remote` or `local` and defaults to `remote` when absent. `EXPO_PUBLIC_REMOTE_API_URL` and `EXPO_PUBLIC_LOCAL_API_URL` provide the corresponding versioned API bases. These are public configuration, never secrets.
2. Validate the selected profile and its matching URL. Remote requires a real HTTPS origin and the appropriate `/api/v1` base. Local requires a configured emulator, LAN, loopback-via-ADB, or HTTPS address. A Local development build does not also require a Remote URL. Missing, unsupported, or invalid selected configuration shows a precise setup error naming the relevant variable.
3. Backend profile and URL cannot be selected, edited, persisted, or displayed from the app. Remove the Backend connection screen, sign-in link, Settings entry, profile-selection storage, runtime switching actions, environment labels, and Local badges.
4. Changing backend profile requires changing the environment file or build environment and then restarting/rebundling the development app or producing a new build. The application never changes API origins during a running session and never falls back automatically during an outage. Deep links cannot choose or replace the API host.
5. Local development supports Android emulator address `10.0.2.2`, a configured LAN address for a physical device, or an ADB reverse connection. Device `localhost` refers to the device. The selected service must already be reachable; the app does not start a backend or create data.
6. Permit cleartext Local HTTP only in development/internal variants using Android network configuration. Production configuration must select Remote, require a valid Remote HTTPS URL, and reject Local selection. Do not enable release cleartext or disable certificate verification.
7. Environment identity includes the selected normalized API origin/base path. Scope credentials, requests, query keys, private files, streams, and temporary artifacts by environment plus user so installing or launching a build pointed at another environment cannot reuse another environment's private state, even when user IDs coincide.
8. Existing in-process cleanup remains required for logout, permission loss, authentication replacement, app disposal, and canceled work. Runtime environment-switch cleanup and warnings are removed because switching is no longer an application action.

## Launch, icon, and interaction design

### Brand launch sequence

- Reuse the actual Lisno wordmark and square loader/icon geometry; verify source SVG viewBoxes before generating raster launcher resources. Bundle all launch artwork/fonts locally.
- Use a deep-purple launch background with a high-contrast Lisno mark and restrained gold accent. Match Android window/system-bar/background colours to avoid a white flash.
- Stage one is the OS-managed native launch screen with the Lisno icon. Android 12+ controls this launch surface; do not promise an arbitrary React Native layout there. [Android splash behavior](https://developer.android.com/develop/ui/views/launch/splash-screen)
- Stage two is a visually continuous native React Native startup view: centred Lisno wordmark, generous negative space, and a small Lisno icon loader below. Use a gentle icon pulse plus thin animated arc, rather than spinning the entire wordmark. Entrance motion should last roughly 400–600 ms; the loader loops only while real startup work is pending.
- Keep essential resource initialization independent of API availability. Transition to sign-in immediately when there is no session. For a stored session scoped to the selected environment, restore secure credentials and authorization before entering the appropriate workspace.
- Do not manufacture progress percentages or add a fixed multi-second branding delay. Cap the blocking restore attempt at approximately 10 seconds, then show a recoverable connection/session error with Retry and Sign in again actions. Configuration errors name the environment variable that must be corrected outside the app. Preserve the selected environment's token on transient network failure but expose no protected data.
- Reduced-motion mode uses a static icon and accessible loading status. Stop animations on unmount/background. Expose one meaningful loading announcement without repeated screen-reader chatter.
- The same Lisno loader component serves suitable page-loading states. Background refetches use unobtrusive status and keep visible valid data; form mutations retain action-local progress.
- Supply adaptive launcher foreground/background, legacy raster sizes, and a monochrome themed icon with safe padding. Inspect actual launcher masks and standalone startup. Expo Go is insufficient to certify the final splash. [Expo splash testing guidance](https://docs.expo.dev/versions/latest/sdk/splash-screen/)

### Mobile application UX

- Use role-specific Home/Work, Projects where permitted, Messages, and More/Settings destinations; notifications remain easy to reach. Only show destinations supported by the current authorization snapshot.
- Replace dense desktop grids with readable summary lists, native detail screens, progressive form sections, and filter sheets. Complex estimate/configuration editors retain every supported action with a clear save/review flow.
- Support back gestures/hardware Back, keyboard avoidance, safe areas, system bars, unsaved-change prompts, and restoring a validated destination after login.
- Use responsive single-column layouts on compact phones and optional list/detail panes from approximately 600 dp. Accommodate rotation, tablet/foldable resizing, and large system fonts without clipped actions.
- Target at least 48 dp touch controls, accessible labels/roles and focus order, TalkBack use, sufficient text contrast, and non-colour status labels. Gold is an accent, not low-contrast small text on white.
- Every data screen handles loading, empty, error/retry, stale/offline, permission loss, success, and conflict states. A version conflict reloads current server data for review; it does not silently overwrite it.

## Native integrations, failure behavior, and performance

- Adapt browser-only `window`, storage, DOM events, `File`, object URLs, downloads, audio, visibility hooks, and canvas/SVG interaction explicitly. A TypeScript build is insufficient evidence of native support.
- Use native document/image selection, authenticated streaming/file transfer, and app-private temporary files for PDFs, images, spreadsheets, and audio. Respect server type/signature/size policy. Request camera/microphone/media permissions only for invoked features and provide denial recovery.
- A user-requested share/export may use the platform chooser after authorized retrieval. Do not put tokens in public URLs, share intents, analytics, or logs. Clean temporary files on cancellation, logout, environment change, and expiration.
- Validate Android audio codec/container output against the existing server attachment policy with actual recordings. Stop and release recording/playback correctly when backgrounded or interrupted.
- Port SSE using a proven native-compatible transport supporting authorization headers, cancellation, reconnect cursors, replay/deduplication, and denial. Do not assume browser `Response.body` behavior on Android. Pause background work appropriately and refetch/resynchronize when foregrounded.
- Keep first-release business mutations online. No offline mutation queue or automatic retry of non-idempotent writes. Offline states must never imply a saved approval, sent message, completed upload, or posted expense without server confirmation.
- Virtualize long lists, paginate, constrain image dimensions, lazy-load heavy editors, and avoid base64 copies of large files. Keep splash animation to lightweight transforms/opacity/vector work; no 3D engine is warranted here.
- Use synthetic identities/data for local verification. Log only redacted failure categories, environment labels, build details, and safe request identifiers. Do not add a telemetry vendor as part of this request.

## Non-goals, compatibility, and rollback

No iOS deliverable, backend rewrite, backend inside the app, offline synchronization engine, new push service, public-signup security expansion, production migration, seed, live customer notification, Play Store publication, signing-key creation, hosted repository creation, commit, push, or deployment is included.

Existing web/backend behavior and dependencies remain unchanged unless an evidenced native integration gap requires a narrow compatible change. Any material API/security behavior change must be reflected in the specification before implementation. No persistence migration is currently proposed. Mobile rollback consists of reverting/withholding the mobile artifact; it must not require rolling back server data. Backend backwards compatibility with the web application remains mandatory.

## Acceptance criteria and verification requirements

| ID | Required outcome | Verification evidence required before claiming completion |
| --- | --- | --- |
| AC1 | Independent React Native Android project in `mobile/` | Clean install from its own manifest/lockfile; documented startup/build commands; no runtime dependency on sibling web source or nested Git repository. |
| AC2 | Backend is selected only through environment configuration; Remote is the default | Resolver/build-configuration tests for absent/remote/local/invalid `EXPO_PUBLIC_API_ENV`; selected-URL validation; emulator and physical/LAN or ADB connection exercise; no selector or URL editor in app UI; no automatic fallback. A Local development selection does not require a Remote URL. Production rejects Local. |
| AC3 | Environment/session isolation | Adversarial tests across separately configured Remote and Local launches, including the same user ID in both environments, delayed 401/restore behavior, and secure-store/query/file key separation; no leaked caches, credentials, drafts, previews, transfers, or streams. |
| AC4 | Correct identity and permission behavior | Login, restoration, logout, reset/invitation links, invalid snapshots, expired tokens, denied routes/actions; sixteen-role navigation coverage plus asymmetric project access tests. No production signup bypass. |
| AC5 | Full existing feature parity | Every row above mapped to concrete screens/actions/APIs and passing interaction checks; successful and failed mutations, pagination, edits, approval/conflict/retry flows, imports/exports and artifacts. No placeholder substitute counted as complete. |
| AC6 | Branded splash, icon loader, and launcher assets | Inspect cold/warm starts in standalone Android builds on pre-12 and 12+ systems; successful restore, no token, timeout/offline, reduced motion, icon masks, no white flash or indefinite loader. |
| AC7 | Responsive and accessible native UI | Rendered interaction on 320/360/412 dp phones, 600/800 dp tablet/foldable widths, rotation, keyboard, large font scaling, TalkBack and Back behavior. Record tested device/OS/ABI combinations; do not claim all devices were tested. |
| AC8 | Native files, audio, drawings and realtime work | Actual Android recording/upload/playback, file selection/download/share, permission denial, cancellation, annotation round trips, SSE reconnect/resync, background/resume and permission revocation. |
| AC9 | Financial and approval invariants remain intact | Two unequal projects with different approved totals, GST, expenses and overhead; reconcile portfolio/detail/ledger; stale-version and duplicate-submission tests; immutable approval/proof/history checks. |
| AC10 | Stable build and acceptable runtime | Mobile typecheck, focused tests, compatible dependency/configuration checks, Android bundle/native build; startup and scroll profiling on a constrained device; no crashes, runaway timers, duplicate streams, or unbounded transfer memory. |
| AC11 | Existing application remains compatible | Review all diffs; run affected web/backend tests/builds if shared files change; replica-set tests for any transactional backend change; `git diff --check` and final status review. |
| AC12 | Honest handoff | README documents environment-only selection, prerequisites, supported minimum/ABIs, build/run steps, permission behavior and diagnostics. Report generated artifacts, exact checks, unavailable devices/services, and any incomplete parity. |

No build/runtime checks have been run at this specification stage because no implementation exists yet. Native build verification depends on Android SDK/JDK/emulator availability; physical-device coverage depends on available hardware. Missing prerequisites must be reported and must not be replaced by claims based only on a web preview.

## Open deployment inputs and risks

- **Remote endpoint:** provide the intended HTTPS `/api/v1` base and an authorized non-production test context before remote end-to-end verification. It is not safe to infer an endpoint from branding.
- **Application identity and links:** permanent package ID, signing ownership and HTTPS App Link domain must be confirmed before distributable production packaging/domain association. A clearly documented development identifier and custom-scheme test links can support local development. External domain/email template changes are not implicitly authorized.
- **Device breadth:** Android 7+ is the proposed baseline from current framework documentation. Validate the minimum SDK and ABI support of the complete dependency set; do not raise the minimum or omit older-device architectures silently. Unsupported historical devices require a separate compatibility decision.
- **Scope size:** complex estimator/configuration editors, touch annotations, spreadsheet operations, file security, and chat media make parity materially larger than app scaffolding. The next task plan must account for all these areas, without downgrading the goal to a demo.
- **Native transport differences:** secure storage, SSE, multipart uploads, filesystem sharing and audio need actual Android evidence. Libraries are selected for these verified needs, not installed speculatively at this gate.
- **Release evidence:** final launch fidelity needs a standalone build. No store/release/production claims follow from passing JavaScript tests alone.

## Approval boundary

This file is the only requested-change artifact created at the current gate. After specification approval, create the separate dependency-ordered task plan with exact ownership and acceptance-criterion coverage. After task-plan approval, request execution mode A or B. Create `mobile/` and begin implementation only after that mode selection, unless the user explicitly changes the repository workflow.

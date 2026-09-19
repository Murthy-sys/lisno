# Lisno Android application task plan

Date: 2026-09-18
Status: Approved and executed through the environment-only backend-selection correction on 2026-09-18.
Specification: [React Native Android application](../specs/2026-09-18-react-native-android-app-design.md), environment-only backend-selection revision approved by the user on 2026-09-18.
Execution mode: A — parallel sub-agents.

## Delivery contract

Build `mobile/` as a sibling of `backend/`, `frontend/`, and `ocr-worker/` in the existing repository. Deliver the approved feature parity, native Android UI, environment-only backend selection with Remote as the default, secure sessions, and Lisno splash/icon loader. Keep the existing backend authoritative. Backend profile selection and URL editing must not appear in application UI. A foundation/demo is an intermediate result, not completion.

This revision gate updates only this task-plan file. Do not alter application code or start corrective implementation until this revision is approved and an execution mode is selected. The existing implementation and its earlier verification evidence remain historical context, not proof of the corrected behavior.

Use the specification's AC1–AC12 acceptance criteria throughout. Keep one parent implementation task active; bounded child tasks may run concurrently only in Mode A. Every task below begins pending.

## Baseline and additional evidence

- Initial dirty-path set for this planning turn: only the untracked approved specification at `docs/superpowers/specs/2026-09-18-react-native-android-app-design.md`. No existing product changes were present. Capture the current status and relevant diffs again before implementation because other work may arrive.
- `mobile/` does not exist. Node/npm are available; observed Node version is `v24.18.0`. `java` is on PATH, but its actual JDK version has not been validated. `adb`, `emulator`, and a global `gradle` command are absent from PATH. The standard macOS `~/Library/Android/sdk` path is absent. Other SDK locations have not been ruled out.
- The feature inventory must include component-local mutations: `ProjectCreateDialog.tsx` posts projects, `ProjectWorkspace.tsx` and `ManagementProjectWorkspace.tsx` fetch hierarchy, `DeadlineRevisionDialog.tsx` changes deadlines with a version/reason, `DesignUploadDialog.tsx` uploads versions, and `TaskUpdateDialog.tsx` updates tasks. Enumerating `*Api.ts` exports alone misses these workflows.
- `knowledgeQualityWorkbook.ts` provides native-porting requirements beyond an upload button: import parsing, template/export generation, archive checks, a 5 MiB compressed limit, 32 MiB expanded limit, timeout and 200-question policy. Preserve current validation and draft-first import semantics.
- `AskLisnoLauncher.tsx` is currently disabled and labelled coming soon. Record it as an existing unavailable capability, not a new AI backend deliverable or a way to count a mobile placeholder as implemented parity. Apply the same rule to existing vendor KPI placeholders.
- Canonical authorization evidence includes `backend/src/domain/authorization.ts` and `backend/src/domain/route-operations.ts`. Existing API modules, domain contracts, route validation, and interaction tests are the contract sources; historical plans are background only.

## Ownership and integration boundaries

In Mode B, the primary agent executes every implementation, review, and verification task sequentially. The owner names below describe responsibilities rather than requiring subagents.

In Mode A, use at most three child agents concurrently, leaving the primary agent responsible for integration. Before each assignment, identify the exact owned paths, existing edits, dependencies, deliverable, and applicable invariants. Tell every writer: other agents are working in the repository; do not revert their work or edit outside your assignment. Related API/client/type/test files within an assigned feature belong to that feature owner.

| Responsibility | Exclusive write boundary |
| --- | --- |
| Primary / integrator | This plan and progress records; `mobile/package.json`, lockfile, root configuration, `.env.example`, build scripts/plugins, generated native configuration, `mobile/app/**`, `mobile/src/navigation/**`, `mobile/src/contracts/**`, shared query invalidation registry, root app providers, `mobile/README.md`, `mobile/docs/**`, `mobile/e2e/**`, `mobile/test-support/**`, and necessary root ignore changes |
| Core owner | `mobile/src/core/config/**`, `core/http/**`, `core/session/**`, `core/query/**` except the integrator-owned invalidation registry; its colocated tests |
| UI/brand owner | `mobile/src/ui/**`, `mobile/src/theme/**`, `mobile/assets/**`; its colocated tests |
| Native integration owner | `mobile/src/platform/**`; its colocated tests. Requests dependency/configuration changes from the primary agent |
| Feature owners | Only the exact `mobile/src/features/<area>/**` directories assigned in T04/T07–T17, including feature-specific endpoints, schemas, hooks, components, and colocated tests |
| Reviewer and verification runner | Read product sources; produce findings/evidence in designated ignored QA output paths. No product-source edits |

Feature modules export screens/widgets and typed functions; the primary agent owns route files and final composition. Shared types, dependencies, query invalidation relationships, and platform adapter contracts must be agreed before consumers write against them. No implementation agent modifies another feature to make its tests pass. A newly discovered shared need goes to the primary agent for coordinated integration.

No routine writes to `backend/`, `frontend/`, or `ocr-worker/` are planned. If a genuine integration gap appears, record it with source evidence. A material contract/security change requires an updated specification and its applicable approval; otherwise the primary agent scopes any necessary compatible change and corresponding regression checks explicitly before assigning it.

## Dependencies and parallel schedule

The schedule below is a dependency graph, not a request for separate approval per task. After the required execution-mode choice, progress through approved tasks without asking again for normal implementation work.

| Task | Outcome | Depends on | AC coverage |
| --- | --- | --- | --- |
| T00 | Baseline, complete action inventory, contract and device feasibility record | Execution mode selected | AC1, AC4, AC5, AC8, AC10–12 |
| T01 | Mobile package, build/test tooling and native configuration | T00 | AC1, AC2, AC10–12 |
| T02 | Remote/local configuration, HTTP, session and query foundations | T01 | AC2–4, AC9 |
| T03 | Native UI primitives, brand assets, launch/loader components | T01 | AC6, AC7, AC10 |
| T05 | Files, audio, annotation support primitives and realtime adapters | T01; frozen HTTP/session interfaces from T02 before integration | AC3, AC8, AC10 |
| T04 | Authentication and environment-aware settings screens | T02, T03 | AC2–4, AC7 |
| T06 | Role-aware navigation, app providers and startup integration | T02–05 | AC2–4, AC6, AC7 |
| T07 | Project hierarchy and task/operational workspaces | T06 | AC4, AC5, AC7, AC9 |
| T08 | Design versions, workflows, approvals and payment-confirmation module | T07, T05 | AC4, AC5, AC8, AC9 |
| T09 | Leads, estimates and estimate response workflows | T06, T05; shared project identifiers from T07 contracts | AC4, AC5, AC7–9 |
| T10 | Drawing/plan upload, annotations and change-review workflows | T09 shared estimate interfaces, T05 | AC4, AC5, AC7–9 |
| T11 | Procurement and vendor workflows | T07, T05 | AC4, AC5, AC8, AC9 |
| T12 | Finance screens and ledger workflows | T07, T05; T08 for payment-confirmation composition | AC4, AC5, AC7–9 |
| T13 | Team, organization, KPI and management workflows | T07 | AC4, AC5, AC7, AC9 |
| T14 | Admin dashboard, users/invitations and access management | T06, T05; T07 contracts | AC4, AC5, AC7, AC9 |
| T15a | Estimation knowledge catalog, revisions and reusable values | T06; shared knowledge schemas frozen in T00/T02 | AC4, AC5, AC7, AC9 |
| T15b | Knowledge editors, modes and calculation simulator | T15a public interfaces and shared schemas | AC4, AC5, AC7, AC9 |
| T15c | Quality checklist, spreadsheet import/export and evidence configuration | Shared knowledge schemas, T05, T06 | AC4, AC5, AC7–9 |
| T16 | Messages, attachments, voice notes and in-app notifications | T05, T06; T07 project-link interfaces | AC3–5, AC7, AC8 |
| T17 | Client dashboard/project composition | T07–10, T16 | AC4, AC5, AC7, AC9 |
| T18 | Complete route/action integration and parity reconciliation | T07–17, including T15a–c | AC1–12 |
| T19 | Integrity review and resolution | All feature writers and T18 finished | AC2–5, AC8, AC9, AC11 |
| T20 | Final integrated checks and Android device/runtime QA | T19 findings resolved; environment prerequisites ready | AC1–12 |
| T21 | Documentation, evidence reconciliation and handoff | T20 | AC12 |
| T22 | Replace persisted runtime selection with validated environment-only selection | Revised specification and execution mode selected | AC2, AC3, AC10–12 |
| T23 | Remove backend-selection UI/routes and align startup/auth/settings copy | T22 contract settled | AC2–4, AC7, AC12 |
| T24 | Correct isolation/docs/tests and run integrity review | T22–T23 | AC2–4, AC8, AC10–12 |
| T25 | Integrated Android build/runtime verification and revision handoff | T24 findings resolved | AC1–4, AC6–8, AC10–12 |

Safe Mode A concurrency:

- During T00, independent read-only audits may cover authorization/API contracts, product/action inventory, and native/toolchain feasibility. The primary agent reconciles their findings before creating shared interfaces.
- After T01, T02 and T03 may run independently. T05 may inspect/spike compatible native modules in its owned paths while T02 settles HTTP/session interfaces; consumers cannot integrate against an unsettled interface.
- After T06, T07, T09, and T15a can progress in separate directories, with the primary agent integrating route definitions. T09 uses settled project/estimate interfaces rather than waiting for unrelated project UI.
- Once project contracts and T07 are ready, fill available slots with T08, T11, T13, T14, or T16. T12 waits for the payment module interface; T10 waits for estimate interfaces. T15b and T15c have separate directory ownership and may overlap once their shared contracts are fixed.
- T17 is composition after its children exist. T18–T21 are integration/review/verification stages. Do not run final verification against a worktree with active feature writers.
- For the approved correction, T22 freezes the environment contract before T23 changes consumers. T24 and T25 are sequential review and verification stages. T22 and T23 touch coupled runtime/provider/UI behavior and must not be assigned as concurrent writers. Documentation updates may run alongside focused test discovery only when their file ownership does not overlap.

## Task details

### T00 — Reconcile contracts, inventory and feasibility

**Owner:** Primary; optional bounded read-only audits in Mode A. **Writes during implementation:** `mobile/docs/feature-parity.md`, `mobile/docs/contracts.md`, `mobile/docs/android-support.md` and this plan's progress. No application behavior changes in this task.

1. Capture baseline dirty paths, target diffs and repository instructions. Preserve the approved specification and unrelated work.
2. Enumerate all public/protected web routes, nested dialogs, component-local mutations and API resources. Record for each action: source path, role/permission and project scope, HTTP method/path, request/result shape, units, version/idempotency/proof requirements, target mobile screen, owner, and test scenario.
3. Freeze shared contracts for identifiers, authorization, money, pagination/errors, session/environment scope, transfers, SSE, annotations, file refs, cross-feature queries and navigation destinations. Copy/adapt only client-safe types; add provenance and a repository-level drift check without making production mobile imports depend on sibling source trees.
4. Inspect Node/JDK/SDK/NDK requirements, native modules' minimum SDK/ABIs, 16 KB page-size compatibility where applicable, native audio format support, streaming cancellation and workbook support. Record actual available tools/devices. Preserve the approved Android minimum unless an evidenced incompatibility is escalated as a scope decision.
5. Collect missing remote/test-service inputs without delaying independent local work. No production mutation, deployment, seed, signing-key creation, or outbound mail is part of verification.

**Exit:** Every approved parity area has an owned action inventory; no unknown contract is delegated as an implementation guess. Dependencies requiring native proof have explicit checks and blockers.

### T01 — Create the mobile package and verification harness

**Owner:** Primary. **Paths:** `mobile/` package/configuration/scripts/plugins, root test setup and ignore rules; no feature implementation.

- Scaffold a TypeScript Expo/React Native Android package with stable compatible pinned dependencies and its own lockfile. Keep this in the existing Git repository. Use native-compatible test tooling, including React Native Testing Library and an Expo-compatible Jest setup; establish scripts described in the verification section.
- Add configuration validation, remote/local public configuration examples, development application ID, safe-area/system-bar setup, Android permission/config-plugin boundaries, launcher resource inputs, and minimum/target SDK declarations supported by the chosen stable toolchain.
- Provide local Gradle/native build paths; cloud build services remain optional. Keep development/internal and distributable production configuration distinct. Production packaging must reject missing remote configuration and unrestricted HTTP. Never embed private endpoints/secrets from an existing `.env` into fixtures or documentation.
- Detect an existing SDK/JDK before installing anything. If installation is necessary, use the required sandbox/system approval process; do not bypass it. Prefer available Gradle wrappers over requiring a global Gradle installation.
- Place runtime/build outputs in ignored directories, with a designated `mobile/.qa/` evidence location. Create typed synthetic test fixtures and network adapters used only by tests, not a shipped mock fallback.

**Verify:** Standalone package install/typecheck and test-harness smoke check; Android configuration validation; initial native build when toolchain permits. Verify no nested `.git`, unexpected sibling lockfile changes, or accidental secret inclusion.

### T02 — Implement service, session and cache isolation

**Owner:** Core owner. **Paths:** assigned `mobile/src/core/**` directories. Primary owns shared contracts and the invalidation registry.

- Implement normalized, validated remote/local `/api/v1` bases and select exactly one immutable runtime environment from `EXPO_PUBLIC_API_ENV`, defaulting to Remote. Validate only the selected profile's matching URL in development, require HTTPS for Remote, reject unsupported selectors, and never silently fall back. Production must select Remote and provide its HTTPS URL.
- Implement typed JSON/multipart/download/stream entry contracts, bearer header ownership, public requests without bearer headers, error envelopes, pagination, cancellation/timeouts and bounded safe retry. Do not automatically retry non-idempotent mutations.
- Implement secure token storage, `/auth/me` plus `/auth/authorization` restoration, snapshot validation, session/environment generations and logout. Block protected UI until valid; preserve credentials on transient restore failure; cap startup restoration and surface recovery.
- Provide one cleanup registry for requests, queries, streams, recording/playback, drafts and temporary files. Runtime profile switching does not exist. Credential reads and asynchronous secure-store writes/clears must remain generation-safe for login replacement, logout, authorization loss and app disposal. Secure storage, queries and private artifacts remain keyed by the selected normalized environment identity so separately configured builds cannot share private state.
- Register invalidation relationships for project lists/details, tasks/workflows, client reviews, estimates/drawings, finance/portfolio, procurement, admin dashboards, chat and notifications. Feature owners submit additions to the primary-owned registry rather than editing it concurrently.

**Verify:** Absent selector defaults to Remote; explicit Remote and Local select the matching URL; invalid selector and selected-URL errors name the correct variable; Local development does not require Remote; production rejects Local; duplicate `/api/v1` normalization; public request headers; same IDs across separately configured environments; logout during every asynchronous phase; delayed old 401/200; restoration races; aborted uploads; cache clearance; unavailable secure storage; expired tokens; and unauthorized snapshots. Confirm tests use no real credentials.

### T03 — Implement the brand, reusable native UI and splash components

**Owner:** UI/brand owner. **Paths:** `mobile/src/ui/**`, `src/theme/**`, `assets/**` and colocated tests; configuration wiring goes through the primary agent.

- Translate existing brand tokens and source SVG geometry into native assets/components. Bundle appropriate local fonts; produce legacy/adaptive/monochrome Android icon resources from existing vector artwork without changing the brand.
- Build accessible screen/layout, typography, buttons, fields, selectors, list/detail, form sections, sheets, confirmation, loader, empty/error/stale/denied, pagination and money display primitives. Cover compact/expanded width, large text, keyboard and Back behavior.
- Build the purple native-to-JS launch composition, Lisno wordmark and icon pulse/arc loader, startup recovery view and reduced-motion alternative. No fake percentages, mandatory branding wait, endless restore spinner or unnecessary 3D dependency.
- Expose startup state/render interfaces without implementing another auth/environment state machine. Primary connects native splash resources and startup lifetime in T06.

**Verify:** Source logo geometry/contrast, loading/recovery/reduced-motion semantics, accessible labels and controls, narrow and expanded layouts. Final launcher masking and OS-native launch inspection remain required in T20.

### T04 — Authentication and environment-aware screens

**Owner:** Authentication feature owner. **Paths:** `mobile/src/features/auth/**`, `features/settings/**`.

- Add login, forgot password, reset-token inspection/completion, invitation inspection/acceptance, session-expired/access-denied and restore-retry screens consuming T02.
- Keep backend configuration outside application UI. Sign-in and Settings contain no selector, URL editor, Backend connection route, environment label, or Local badge. Sign-out retains its normal unsaved-work/session behavior.
- Handle validated internal return destinations and token links without persisting/logging raw reset/invitation tokens. Do not enable unsafe public production client signup or relax demo-account restrictions.

**Verify:** Form validation, error/retry, link token lifecycle, expired/used tokens, accessibility/keyboard, absence of backend-selection controls, environment labels and routes, and safe return after authentication. Native route registration remains primary-owned.

### T05 — Native files, media and realtime primitives

**Owner:** Native integration owner. **Paths:** `mobile/src/platform/**` and tests. Dependency/plugin changes go through the primary agent.

- Provide document/image selection, user-triggered permissions, URI-based multipart uploads with progress/cancel, authenticated bounded downloads, image/PDF preview, private temporary storage and platform sharing. Validate destinations before attaching credentials; reject arbitrary cross-origin URL use. Clean up both successful and abandoned private artifacts.
- Provide record/preview/send-compatible audio primitives and playback focus/interruption handling. Use actual Android output to verify the backend attachment policy; do not change accepted media contracts merely to fit the first codec tried.
- Provide a native SSE adapter with bearer headers, cancellation, bounded framing, cursor replay/resync, denied-state teardown and AppState/network lifecycle. Prove streaming behavior in the selected runtime before claiming it works from JS unit tests alone.
- Provide shared touch/image coordinate and preview primitives needed by annotations; business annotation documents remain T10-owned. Provide native workbook byte I/O to T15c; checklist parsing/validation remains T15c-owned.
- Register all resource lifetimes with T02 rather than introducing competing logout or app-disposal cleanup paths.

**Verify:** Native upload/download cancellation, permission denial, malicious/malformed file refs, file size bounds, interrupted recording/playback, supported audio container, realtime reconnect and background/resume, logout while transfer/stream active. Capture proof and remaining native limitations.

### T06 — Integrate startup, providers and role navigation

**Owner:** Primary. **Paths:** `mobile/app/**`, `src/navigation/**`, app providers and shared route/query registries.

- Wire configuration/resource readiness, secure restoration, native splash handoff and retry/sign-in/connection recovery. Hide the OS splash when the actual startup UI is ready; do not hold it for a network timeout.
- Add authorized role landing screens, tabs/stacks/More, notifications entry, Back/unsaved-change behavior and a non-disclosing unknown/denied route. Backend selection is not a navigation destination.
- Add a typed route registry matching T00's action inventory and a mapping from existing notification/project destinations to native routes. Deep links cannot inject backend origins or bypass session checks.
- Compose shared providers once per scoped session. Ensure no duplicate realtime subscriber, query cache or audio manager is created by nested navigation.

**Verify:** Table-driven navigation for all sixteen roles plus permission-restricted snapshots, external/internal links, denied project references, startup error/timeout and sign-in flow on Android. Temporary developer screens are not counted toward parity and must not ship as unfinished destinations.

### T07 — Projects, hierarchy and task/operational workspaces

**Owner:** Project feature owner. **Paths:** `mobile/src/features/projects/**`, `features/tasks/**`, `features/operations/**`.

- Port project list/search/filter/detail/create/initiation where authorized, hierarchy, floors/stages/tasks, current/history context and role work queues. Trace `adminProjectsApi.ts`, `designerApi.ts`, web component-local requests and backend project/task routes.
- Port task updates/events and operational assignment/override actions from `projectWorkflowApi.ts`. Publish project/task summary components for manager/client/admin composition. Design workflow and design payment commands belong to T08; deadline revisions belong to T13.
- Preserve stable project/task/version/assignment references and scoped paginated queries. Avoid fetching every page into memory when a native paginated list suffices.

**Verify:** Two differently scoped projects, create validation, nontrivial hierarchy, task update success/conflict/denial, assignment restrictions, queue-to-detail consistency, empty/error pagination and cache invalidation. Creation tests use synthetic local data, never production or seed scripts.

### T08 — Design workflow, extraction and review

**Owner:** Design feature owner. **Paths:** `mobile/src/features/design/**`, `features/workflows/**`.

- Port version upload/history/download, extraction status/retry/manual section edits/add/remove/submit, designer plan queue and assignment, design response inbox, client section review and plan decisions.
- Port workflow requirements, furniture/UOM/dimensions, space planning, stage actions, proof/media, payment confirmations, review-round delivery status and retry. Export payment-confirmation and client-action widgets for T12/T17; retain a single owner for these mutations.
- Preserve original approval history, version/CAS, actor/proof, deterministic server task generation and immutable artifacts. Show a delivery failure after successful submission as delivery state, not a rolled-back workflow.

**Verify:** Upload/extraction failure and retry, manual section save, stage prerequisites, two reviewers with stale versions, duplicate submissions, on-behalf proof, disabled/failed/retried delivery via local fixtures, denied artifacts and invalidation across project/client/queue consumers.

### T09 — Leads, estimates and client response administration

**Owner:** Estimate feature owner. **Paths:** `mobile/src/features/leads/**`, `features/estimates/**`, `features/estimate-responses/**`.

- Port lead search/filter/create/edit/activity, saved estimates and full draft editors supported by current web behavior; preserve typed calculation inputs, money/unit boundaries and backend-derived totals.
- Port submit/review queue, designer assignment/decision, client decision, publication, persisted delivery state/retry, authenticated PDF export, and client-response list/detail/decision with proof.
- Own estimate review widgets consumed by client/admin screens. T10 owns drawings/annotations; T15a–T15c own knowledge configuration. Use shared typed interfaces instead of copying their state machines or recalculating authoritative balances.

**Verify:** Lead-to-estimate flow, existing draft reload, calculation/source consistency, validation, denied actions, failed publication vs failed email distinction, duplicate/stale decision handling, on-behalf proof, PDF retrieval and all affected list/detail/queue refreshes.

### T10 — Drawing and plan review on touch devices

**Owner:** Plan-review feature owner. **Paths:** `mobile/src/features/plan-review/**`.

- Port all operations in `estimateDesignApi.ts`: upload/retry/remove, manual drawing creation, edit/replace/remove, item mapping, submission, source/revision preview, client drawing decisions and annotation drafts, full-plan review, target preview, change request submit/update, reviewer targeting and resolution.
- Use native pan/zoom/drawing controls with stable document coordinates. Preserve the current annotation schema and versioned drawing/page references; rotation and resize must not alter stored geometry.
- Support accessible annotation list/edit actions, clear save/submit distinctions, unsaved-work protection and cancellable artifact retrieval.

**Verify:** Native gesture use and coordinate round trip at different zoom/orientation, multiple pages/drawings, immutable approved revision, draft vs submitted request, stale page versions, mapping/target resolution, denied preview and oversized document handling.

### T11 — Procurement, vendors and suggestions

**Owner:** Procurement feature owner. **Paths:** `mobile/src/features/procurement/**`.

- Port project/item hierarchy, detail/edit/create, UOM/vendor selection, vendor create/directory, project vendor suggestions/edit, expense creation and supporting documents using all three procurement API modules.
- Preserve approved estimate/design parent lineage, item price paise limits and expense semantics. Existing placeholder vendor KPI capabilities remain documented as unavailable upstream.

**Verify:** Unequal projects/vendors, parent revision change while editing, suggestions vs actual vendor identity, expense posting/retry, attachment cancel/denial, pagination, validation, and finance/procurement/project refresh relationships.

### T12 — Finance and reconciled project figures

**Owner:** Finance feature owner. **Paths:** `mobile/src/features/finance/**`.

- Port portfolio summary, project bucket/detail, readable native financial charts, paginated ledger, direct spend and overhead entry, supporting documents and authorized project finance controls. Compose T08's payment confirmation widgets rather than issuing duplicate workflow commands.
- Keep integer paise, explicit rupee display conversion, idempotency, expense class and approved/GST/profit/overhead sources aligned with the backend. Represent absent data as unavailable, not zero.

**Verify:** At least two unequal projects; portfolio/detail/ledger reconciliation before and after procurement/direct/overhead expenses; paise precision; duplicate submit with the same key; ambiguous timeout reconciliation; denied reads/writes; stale cross-screen summaries.

### T13 — Management, organization and performance

**Owner:** Management feature owner. **Paths:** `mobile/src/features/management/**`.

- Port team/tree, designer/project summaries, KPI details/task pages, manager/head evaluations, audit/activity and deadline revision using `managerApi.ts`, KPI/evaluation routes, and component-local deadline mutations.
- Preserve server-calculated KPI/risk, reporting periods, immutable original deadline, reason/audit/version checks and manager/head evaluation separation.

**Verify:** Different manager/head scopes, two designers with unequal performance, reporting periods, no conflation of evaluation and KPI, reason-required deadline edit, stale revision and audit preservation, paginated drill-down.

### T14 — Administration, invitations and access

**Owner:** Admin/access feature owner. **Paths:** `mobile/src/features/admin/**`, `features/access/**`.

- Port Super Admin overview/project/workforce tabs and filters, managed users/search/update, invitation list/create/resend/revoke, own access request/history/cancel, reviewer inbox/decision and project grant revocation.
- Scope Super Admin access per operation; preserve immutable identity and backend non-disclosure. Render estimate/design review entries by navigating to T08/T09 exports, not by duplicating their endpoints inside admin.
- Respect invitation preflight failure/no-write behavior and limited disclosure. No test invokes real outbound delivery.

**Verify:** Role restrictions, immutable identity, user filters, disabled/failing invitation delivery with zero assumed success, stale invitation/access decisions, grant revocation while a protected project/chat screen is open and dashboard-to-detail consistency.

### T15a — Knowledge catalog and lifecycle

**Owner:** Knowledge catalog owner. **Paths:** `mobile/src/features/knowledge/catalog/**`, `knowledge/reference/**`.

- Port item list/search/create/duplicate, history/revision/create/activate/deactivate, baskets/sub-baskets/main lines, reusable masters and surfaces, relationship updates and deletion-impact/lifecycle dialogs from `knowledgeApi.ts` and corresponding web screens.
- Retain reference IDs, version checks, active revision semantics, archive vs permanent-delete behavior and confirmation requirements. Implement destructive UI behavior but verify it only against disposable synthetic fixtures.
- Publish typed catalog/context interfaces; primary integrates feature routes. Share reference selectors with T15b/T15c through these exports.

**Verify:** Revision conflicts, activation/history, dependency impact before delete, server refusal of referenced values, pagination/search, stable selection IDs and stale editor context.

### T15b — Knowledge configuration and simulator

**Owner:** Knowledge editor owner. **Paths:** `mobile/src/features/knowledge/workspace/**`, `knowledge/calculation/**`.

- Port current sections, overview/unit/priority/specification/budget/reference settings, modes, pricing, surface/slab/repeater editors, in-house/sub-vendor/PMC configuration, margins/discounts, pending changes, context preview and simulator supported by existing screens.
- Preserve validation, unknown/not-configured states, versioned section writes, saved-vs-draft semantics and the current calculation source. Do not introduce a competing mobile financial formula or ignore sections because they are desktop-dense.

**Verify:** Representative complex fixtures across all supported modes, units, GST/margin/discount boundaries, draft restoration within a session, conflict review, save/reload equality, invalid input and simulator parity with backend/reference fixtures.

### T15c — Quality checklist and native workbooks

**Owner:** Knowledge quality owner. **Paths:** `mobile/src/features/knowledge/quality/**`.

- Port shared basket quality checklist, parameter/evidence/sampling/inspection editors, draft import preview/merge/save, workbook template creation and export, and related validation/clipboard helpers where present.
- Adapt byte-level workbook operations to native file I/O while preserving existing archive checks, compressed/expanded limits, question count, timeout, plain-value rules and row/column errors. Validate actual native engine compatibility before selecting workbook dependencies; no remote upload workaround without a scoped contract decision.
- Imported checks enter the draft first. Do not commit partial/invalid workbook rows or silently truncate values to meet mobile limits.

**Verify:** Valid template/export/import round trip; malformed/oversized/compressed archives, formulas/links/macros and invalid column/row values; duplicate merge conflicts; cancellation; draft vs persisted state; native responsiveness and memory at allowed bounds.

### T16 — Messaging and notifications

**Owner:** Messaging feature owner. **Paths:** `mobile/src/features/messages/**`, `features/notifications/**`.

- Port conversation pages, participants/options/select/revoke, summary, message pagination/search/around-target, compose/reply/mention, issue updates, read receipts, typing, file tray, upload/stage/discard/send, audio capture/preview/playback and failed-transfer recovery using the existing APIs.
- Preserve stable send/upload identifiers, attachment limits, ordering/deduplication, scope and authorization. Wire T05 streaming/lifecycle and T02 cleanup; no alternate websocket/backend or always-running background service.
- Port notification list/older pages/unread/read, validated message deep links and foreground reconnect/resume catch-up. Do not claim OS push while terminated.

**Verify:** Two independent identities/project memberships; sent/received/duplicate/out-of-order events; cursor expiry/resync; participant revocation; canceled/failed audio and attachments; keyboard/back; reconnect/offline/resume; logout/app disposal during transfer; separate environment configurations cannot share transfer or notification state; notification navigation and unread consistency.

### T17 — Client workspace composition

**Owner:** Client feature owner. **Paths:** `mobile/src/features/client/**`.

- Port client project dashboard/summary, approved versions, task/workflow progress and project details; compose existing T08/T09/T10 review/decision/annotation widgets and T16 conversation links.
- Preserve client-specific DTOs and project visibility. Never reuse a staff detail payload as an authorization shortcut. Do not duplicate estimate/design calculations or mutation owners.

**Verify:** Two clients linked to different projects, allowed and denied project links, partial/missing data, latest-approved version, review-to-project refresh, pending decisions and multi-project navigation without stale detail leakage.

### T18 — Integrate and reconcile complete parity

**Owner:** Primary. **Paths:** primary-owned routes/providers/registries/docs/E2E tests; feature corrections return to their owner or transfer ownership explicitly after that writer stops.

- Register every completed screen/action and resolve shared interfaces, permission checks, cross-feature refreshes, artifact navigation and deep links. Remove scaffolding placeholders and development-only routes from shipped navigation.
- Audit the full T00 inventory against implemented UI and tests, including nested drawers/dialogs, downloads, exports, destructive confirmation, filters and pagination. Every entry must be implemented and verified or explicitly recorded as an upstream unavailable capability; new missing parity remains unfinished work.
- Complete Android navigation/accessibility/width flows, load/error/empty/stale/denied/conflict states, environment-specific launch behavior without in-app selection, and app resume behavior.
- Build regression scenarios that cross feature owners: lead → estimate → review → design/workflow → procurement/finance; client review → admin response; project access revocation → messages and notification denial.

**Exit:** All feature writers finished, no unresolved integration/contract issue, no undisclosed parity gap. Prepare a scoped final diff and verification manifest.

### T19 — Independent integrity review and fixes

**Owner:** `integrity_reviewer` in Mode A, primary inline in Mode B. Review after all substantive writes; resolve findings with explicit ownership before final verification.

Review environment/token isolation across separately configured launches, permission/non-disclosure, ID/version/proof lineage, paise/rounding and reconciliation, idempotency after network failure, secure files/links, annotation coordinates, workbook safety, session cleanup, cache invalidation, SSE replay and delivery state. Confirm no backend selector or URL editor remains in UI, production rejects Local, the mobile build is independently installable, and no backend authority has moved into the UI.

Classify findings with source evidence and impact. Correct confirmed issues, run focused regression checks and re-review affected boundaries. Do not merely include unresolved correctness findings in a success handoff.

### T20 — Final integrated verification

**Owner:** `verification_runner` in Mode A, primary inline in Mode B. No concurrent feature writes. Verification output goes to ignored `mobile/.qa/` paths.

Run the checks and matrix below against the final integrated tree. A failed check goes back to the appropriate owner, followed by affected verification; do not repeatedly rerun unrelated suites without reason. Record unavailable hardware/services separately from failures and passes. A JS export/web preview is not a substitute for an Android build/runtime check.

### T21 — Handoff

**Owner:** Primary. **Paths:** `mobile/README.md`, `mobile/docs/**`, this plan's progress/evidence sections.

Document install/start/build commands, environment-only profile selection and restart/rebundle semantics, Android emulator/LAN/ADB connection instructions, test credentials policy, minimum SDK/verified ABIs/device matrix, developer package identity, file/media permissions, link behavior, architecture/contract provenance, dependency reasons and diagnostics. Report exact checks, artifact locations, any unrun prerequisite-dependent checks, and parity status. Do not create a production signing key, commit, push, publish, seed, migrate or deploy.

### T22 — Correct the environment contract

**Owner:** Primary in Mode B; one bounded core/config writer in Mode A. **Paths:** `mobile/src/core/config/**`, `mobile/src/runtime/**`, `mobile/app.config.ts`, environment/config tests, and configuration examples. Do not edit authentication/settings UI in this task.

- Parse `EXPO_PUBLIC_API_ENV` as `remote | local`, default to `remote`, and reject any other value with a precise configuration error.
- Construct one active immutable environment from the selected profile. Development Local requires only `EXPO_PUBLIC_LOCAL_API_URL`; development Remote requires only `EXPO_PUBLIC_REMOTE_API_URL`. Production requires Remote plus valid HTTPS and rejects Local.
- Remove persisted profile selection and runtime environment-switch methods. Retain normalized environment identity and environment-keyed secure/query/file isolation across separately configured launches.
- Keep development cleartext permission tied to the development/internal Local build configuration. Do not weaken release TLS rules.

**Verify:** Focused configuration, provider, session, query and production-config tests for absent/remote/local/invalid selectors, missing selected URLs, unselected URL absence, `/api/v1` normalization, Remote HTTPS, production rejection and same-ID cross-environment isolation.

### T23 — Remove application backend controls

**Owner:** Primary in Mode B; one bounded mobile UI writer in Mode A after T22. **Paths:** `mobile/src/features/auth/**`, `mobile/src/features/settings/**`, `mobile/src/app/**`, `mobile/src/navigation/**`, and their tests. Do not change backend or shared feature behavior.

- Delete the Backend connection screen/route and all sign-in, Settings, startup-recovery and navigation links to it.
- Remove switch confirmation/copy and any UI that implies backend URLs can be changed on-device.
- Remove environment labels and Local indicators from all application screens.
- Make startup configuration errors name `EXPO_PUBLIC_API_ENV` and the selected URL variable accurately.

**Verify:** Route/type checks; rendered sign-in, Settings and startup configuration-error states; accessibility names/focus; searches proving no selector, environment label or connection-route references remain.

### T24 — Reconcile isolation, documentation and integrity

**Owner:** Primary in Mode B; `integrity_reviewer` after writers finish in Mode A. **Paths:** focused remaining tests, `mobile/README.md`, `mobile/docs/**`, `.env.example`, and this plan's evidence section.

- Update operational documentation with exact Remote and Local `.env.local` examples, emulator/LAN/ADB addresses, restart/rebundle requirements, and production restrictions.
- Remove claims about persisted switching and switch-time cleanup while preserving logout, authorization-loss, app-disposal and environment-key isolation guarantees.
- Review the integrated correction for token/file/query leakage, stale imports/routes, misleading UX, production cleartext/TLS regression and accidental dependency or lockfile changes. Resolve confirmed findings before T25.

**Verify:** Focused tests, typecheck, environment/config searches, scoped diff review and `git diff --check`.

### T25 — Verify the corrected Android application

**Owner:** Primary in Mode B; `verification_runner` in Mode A after T24 findings are resolved. No concurrent product writes.

- Run mobile typecheck, full Jest, contract drift, Expo dependency/config diagnostics and Android export.
- Build the debug Android APK. Launch Remote and Local configurations separately on the emulator; confirm each uses its selected environment, Local works with `10.0.2.2`, no in-app selector exists, configuration errors are precise, and reinstall/rebundle semantics are documented.
- Record remote connectivity as unavailable if no verified endpoint/test access responds; do not substitute a mock success. Do not deploy, seed, migrate, publish, or create production signing material.

**Exit:** Corrected acceptance criteria have exact command/device evidence and remaining external-service limitations are explicit.

## Verification commands and evidence

These are planned mobile commands, not commands already available or already passed. T01 must implement documented scripts with these meanings; record final native commands and any justified naming adjustment in the README.

| Check | Planned command from `mobile/` | Evidence / limitation |
| --- | --- | --- |
| Reproducible dependencies | `npm ci` | Own lockfile; no sibling runtime dependencies |
| Type safety | `npm run typecheck` | Native modules, screen contracts, route params, API types |
| Focused behavioral tests | `npm test -- --runInBand <test-path>` | Each task's targeted tests before broader runs |
| Full mobile tests | `npm test -- --runInBand` | Final integrated result after writers finish |
| Contract drift | `npm run test:contracts` | Compare adapted role/API/DTO fixtures with canonical sources in this repository; package build itself must not require sibling sources |
| Dependency compatibility | `npx expo install --check` and `npx expo-doctor` | Stable compatible package set; dependency/native configuration diagnostics |
| Android JS/assets export | `npm run export:android` | Metro Android bundle/assets; this is not an APK or native-runtime verification |
| Native internal build | `npm run build:android:debug` | Gradle wrapper/native dependency build; SDK/JDK required |
| Standalone launch QA | `npm run build:android:qa` | Release-mode standalone internal APK under a development identity using development signing; no production key creation or publication. Validate profile/configuration rules, and report missing prerequisites rather than relaxing them |
| Android interaction scenarios | `npm run test:e2e:android` | Script using the chosen native Android automation runner against an installed test build and isolated synthetic service context; emulator/device required |
| Hygiene | From repository root: `git diff --check` and `git status --short` | Only scoped source/docs/dependency files; no committed builds, screenshots, private files or databases |

There is no existing repository lint script. Do not claim lint passed. If mobile introduces a lint script for a demonstrated need, document and actually run it; otherwise typecheck, tests, native builds and runtime QA are the planned checks.

If compatible existing web/backend files change, run focused affected tests first, then the applicable workspace's `npm run typecheck`, `npm test`, and `npm run build`. Changed transactional Mongo paths additionally require the corresponding replica-set tests. OCR is unchanged and needs no model runs. Do not run migrations or seeds to make QA convenient; use isolated test setup with synthetic fixtures and suppressed external delivery.

### Acceptance-to-evidence matrix

| Criteria | Mandatory evidence |
| --- | --- |
| AC1 | `mobile/` clean install, independent bundle/native build, own README and lockfile, same-repository structure |
| AC2–3 | Absent/Remote/Local/invalid `EXPO_PUBLIC_API_ENV`, validation of only the selected URL, production Local rejection, no app selector/route, emulator/physical connectivity, separate-launch environment isolation, logout/login/transfer/stream cleanup, matching IDs across origins |
| AC4 | All sixteen role navigation cases, invalid snapshots, two asymmetric client/staff project scopes, token/link expiry and revocation; backend remains enforcement |
| AC5 | Every item in `mobile/docs/feature-parity.md` links source → native screen/action → API → passing scenario; no placeholder completion |
| AC6 | Actual launcher masks and pre-12/12+ standalone cold/warm launch, signed-in/out, timeout, offline and reduced-motion recordings/screenshots using synthetic data |
| AC7 | 320/360/412 dp compact and 600/800 dp expanded layouts; rotation/fold changes; large fonts; keyboard, Back and TalkBack; critical forms and complex editors |
| AC8 | Actual files/audio/annotation/workbook round trips; permission denial/cancel; SSE resync, background/resume and access revocation |
| AC9 | Two unequal projects and two actors; portfolio/detail/ledger consistency; paise/GST/margin rules; CAS, proof, immutable approvals and duplicate submission checks |
| AC10 | Final typecheck/tests/export/native build, actual startup/scroll memory/frame observations on a constrained device; verified OS/ABI/native page-size compatibility record |
| AC11 | Scoped final diff and applicable regression checks; no unrelated changes, no backend weakening, no unapproved data effects |
| AC12 | README, parity/support/contract records, exact test results, prerequisites and remaining gaps, named artifact/evidence paths |

For device coverage, include the supported minimum Android version where runnable, a pre-Android-12 environment, Android 12+ launch behavior, and the current supported target environment. Check physical ARM hardware when available as well as the host-compatible emulator ABI. Record exact OS/API, ABI, screen width, font scale and build mode; do not imply every Android device was tested. Missing physical-device coverage remains a disclosed verification gap.

## Input and stop conditions

- Remote URL and authorized test access remain required only for real Remote connectivity verification. Local development/build verification selects Local through environment configuration and does not require a Remote URL. A missing Remote endpoint cannot be replaced with an invented service or a successful mock claim.
- Native SDK/JDK/emulator/device availability may require environment setup. Use the normal approval mechanism for system-level writes or restricted downloads; continue independent code/tests while a setup prerequisite is unresolved.
- Permanent package ID, signing ownership, verified link domain and production publication remain outside local development authority. Use a documented development identity; do not publish associations or modify real mail templates.
- If the selected native dependency set cannot support the approved Android minimum/ABI breadth, surface evidence and update the applicable specification decision before raising requirements.
- If workbook, SSE, audio or annotation parity cannot be achieved with the approved native integration contract, report the concrete blocker and resolve the architecture explicitly. Do not fall back to an entire-app WebView, disabled feature or fake backend.
- Only the next workflow gate is advanced by an approval. After this revised plan is approved, ask exactly for execution mode A or B before starting T22 corrective implementation work.

## Progress and final evidence

- Specification: approved.
- Task plan: approved.
- Execution mode: A — parallel sub-agents.
- T00: complete. Audits reconciled 16 roles, 134 permissions, 221 protected operations, native feasibility risks, and mobile UX/navigation requirements.
- T01: complete. Expo SDK 57 package, Android API 24 build configuration, brand resources, tests and contract drift lane are established.
- T02–T06: complete. Remote/local environment isolation, secure session/HTTP/query state, native platform adapters, Lisno brand UI, auth screens and adaptive authorization navigation are integrated.
- T07: substantially implemented. Project initiation/creation, hierarchy creation/read, task updates and deadline CAS controls are present.
- T08–T17: partially implemented. Design versions/sections and a bounded workflow action set, lead actions, Client/admin decisions, procurement expenses, finance entries, evaluation, users/invitations, access, knowledge catalog, chat files/audio/issues/SSE and notifications are integrated. The exact missing breadth is recorded in `mobile/docs/feature-parity.md`.
- T15b, T15c and major parts of T09–T13, T16 and T17 remain open; therefore T18 complete parity has not been reached.
- T19: complete for the integrated partial-parity scope. The independent review found and the implementation corrected operation-specific Super Admin action visibility, chat cursor/denial/heartbeat handling, protected-query purging, the post-JSON generation fence, the Client project-detail route, notification permission drift and audio interruption/auto-finalization state. Focused regressions cover these boundaries.
- T20: reproducible install, typecheck, full Jest, backend contract drift, Expo dependency checks, production configuration checks, Metro Android export, arm64-v8a debug APK assembly and emulator launch smoke pass. Broader physical-device and interaction evidence remains open as recorded in Android support documentation.
- T21: README, contract, parity and Android-support evidence updated without publication, signing, deployment, seeding or migration.
- T22: complete. `EXPO_PUBLIC_API_ENV=remote|local` is the sole selector, defaults to Remote, validates only the selected URL in development, rejects Local and non-HTTPS Remote values in production, and produces one immutable runtime environment. Secure-store token keys are environment-scoped; the legacy unscoped token key is deletion-only.
- T23: complete. The Backend connection route and screen, sign-in and Settings links, host display, persisted selector, runtime switch APIs, environment labels and Local badges were removed.
- T24: complete. README, contracts, feature-parity and Android support documentation describe env-file selection and restart/rebundle behavior. Independent integrity review confirmed no unresolved blocker after route-test relocation and hardened loopback validation.
- T25: complete for the corrective scope. Focused tests passed 8 suites/43 tests; full Jest passed 33 suites/169 tests; contract drift passed 3 tests; typecheck, dependency compatibility check, current Local config, valid/invalid production config cases, a clean 5.4 MB Android export, arm64-v8a debug APK assembly, installation and emulator launch smoke all passed. `expo-doctor` could not reach `registry.npmjs.org` in the verification environment, while `expo install --check` passed. Real Remote connectivity was not run because no verified Remote endpoint/test access was supplied. The local backend was not running during launch smoke, so authenticated Local API flows were not exercised.

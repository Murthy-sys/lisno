# Mobile feature parity inventory

Date: 2026-09-19
Status: Integrated implementation audit. Core Android delivery and the capabilities listed below are implemented; the remaining rows are explicitly open and do not count as completed parity.

## Implemented delivery

| Area | Native implementation | Current status |
| --- | --- | --- |
| First-launch onboarding | `src/core/onboarding`, `src/features/onboarding`, `src/app/welcome.tsx` | Implemented: three responsive interactive Lisno depth scenes, accessible paging/actions, Android Back, reduced motion and versioned one-time completion before the unchanged sign-in flow |
| Session and connection | `src/features/auth`, `src/features/settings`, `src/core/config`, `src/core/session` | Implemented: secure restore/login/logout, recovery/invitation flows, environment-only backend selection with Remote default, selected-URL validation and environment-scoped credentials; no selector is exposed in the app |
| Android shell and brand | `src/app`, `src/navigation`, `src/ui/brand`, `assets` | Implemented: staged Lisno splash/loader, permission-derived phone tabs/tablet rail, adaptive launcher resources and API 24 configuration |
| Project and task basics | `src/features/projects` | Implemented: role-scoped lists/details, project initiation/creation, hierarchy creation, task progress/CAS deadline revision, design-version upload/history/extraction/section draft controls and project workflow timeline with supported actions |
| Leads and Client estimate decisions | `src/features/leads`, `src/features/estimates`, `src/features/reviews` | Partial: lead creation/stage/activity, Client estimate PDF/decision and proof-backed admin decisions work; full estimate authoring/publication remains open |
| Procurement and finance | `src/features/procurement`, `src/features/finance` | Partial: approved items, receipt-backed expense recording, finance buckets/ledger and paise-safe direct/overhead entries work; full item/vendor/document/payment-control breadth remains open |
| Management, users and access | `src/features/management`, `src/features/admin`, `src/features/access` | Partial: team/detail, evaluation, invitations, user activation and access request/review actions work; full KPI/audit/grant administration remains open |
| Knowledge | `src/features/knowledge` | Partial: catalog search/detail/history/create/duplicate/activate/deactivate works; dense editors, reusable reference management, simulator and workbook quality tooling remain open |
| Chat and notifications | `src/features/messages`, `src/features/notifications`, `src/platform/realtime`, `src/platform/audio` | Partial: dedicated adaptive conversation list/thread UI, cursor history, realtime arrival handling, safe visible-message read state, content-fit text/reply/issues, permission-aware bidirectional swipe-to-reply without permanent message chevrons, named accessible message actions, compact responsive Photo/Camera/File choices, scoped picker recovery, exact policy-limit enforcement, staged authenticated uploads, native keyboard focus, explicit-send 248 dp phone voice notes, authenticated tap-to-view full-screen images without a redundant Open action, participant roster and capability-gated audited participant addition, denial, heartbeat recovery, bounded foreground SSE and notification conversation links work; mentions, participant removal, typing and target-message navigation remain open |
| Native foundations | `src/platform/files`, `src/platform/audio`, `src/platform/realtime`, `src/platform/annotations` | Implemented and unit-tested; the arm64-v8a debug APK compiles with the local JDK/SDK, while device certification of SSE, audio and interaction breadth remains pending |

## Open parity work

These are working web capabilities that are not yet complete in this Android repository:

- Full estimate builder, calculation editing, assignment, submission, publication/delivery retry and saved-draft restoration.
- Estimate design upload/drawing mapping and the full touch plan-review/annotation/change-request workflow.
- Complex furniture dimension and site-measurement multi-media workflow actions, Designer assignment and all payment-confirmation queue composition.
- Procurement item/vendor/suggestion CRUD and every supporting-document screen.
- Finance charts, document retrieval and full payment controls; management KPI task drill-down and audit history.
- Knowledge section editors, simulator, reusable masters/surfaces, relationship/delete-impact flows and XLSX checklist/import/export.
- Chat mentions, participant revocation, typing, conversation filtering, video playback and target-message navigation.
- Complete Android hardware/device validation, TalkBack/rotation/width/font-scale matrix and end-to-end flows against an isolated backend. Arm64 debug APK compilation, install, launch and the reference messaging flow are proven on the available API 37 emulator.

Because these gaps remain, the mobile application is a substantial integrated Android implementation rather than complete feature parity with the web application.

The final integrity pass also verifies operation-specific Super Admin behavior before rendering actions, removes protected query families on access change, fences responses again after asynchronous JSON parsing, and keeps Client project details on the canonical scoped project route.

## Navigation by actor

| Actor | Phone roots | Primary work |
| --- | --- | --- |
| Super Admin | Dashboard, Projects, Messages, More | Organization oversight, users/invitations, configuration, finance and review queues |
| Sales Manager | Projects, Messages, More | Project initiation, assignments, response/approval/access queues, procurement oversight |
| Sales | Leads, Messages, More | Lead pipeline, estimates, drawings and publication |
| Designer | Work, Design plans, Messages, More | Assigned projects/tasks, design authoring and own access requests |
| Design Manager | Team, Messages, More | Direct reports, estimate/design review, KPI/evaluation/deadlines |
| Design Head | Organization, Messages, More | Organization tree, designers, KPI/evaluation/deadlines |
| Client | Projects, Messages, More | Estimate/design/plan review, workflow requests and artifacts |
| Procurement | Work, Projects, Messages, More | Operational tasks, approved items, vendors, expenses and documents |
| Finance Manager | Work, Finance, Messages, More | Operational tasks, portfolio, ledger and payment confirmations |
| Site Manager | Work, Messages, More | Execution tasks and access requests |
| Six worker roles | Work, Messages, More | Assigned task progress and project conversations |

Messages appears only with `chat.read`. On expanded widths the same destinations use a navigation rail and list/detail panes.

## Action map

| Area | Existing source actions | Native target | Contract / acceptance |
| --- | --- | --- | --- |
| Session | Login/logout/restore, expiration, forgot/reset, invitation inspect/accept, denied state | Startup/auth stack and environment-configured runtime | Public calls omit bearer; fail-closed authorization; selected backend is immutable during the running session; credentials are scoped by environment identity |
| Projects | List/filter/detail/create/initiate, hierarchy, activity, versions | Project list/detail/create and adaptive hierarchy | Stable project IDs; scoped roles; pagination and invalidation |
| Tasks | Create floor/stage/task, task event/read/update, operational queues, assignment/override | Work queue, task detail/update and project structure | Version/CAS; server risk; audit events |
| Design | Version upload/download, extraction status/retry, section add/edit/remove/submit | Design plan queue/workspace | Native URI upload; immutable versions; conflict refresh |
| Design workflow | Stage requirements/actions/history, UOMs/furniture/dimensions, space planning, proof/media, delivery retry, payment confirmations | Project workflow timeline and action forms | Idempotency, proof, delivery-independent commit |
| Leads | Search/filter/create/edit/detail, activities and stage changes | Lead pipeline/list/detail/editor | Ownership, validation, cache coherence |
| Estimates | Draft/save/submit, calculations, review/assignment/decision, publish/retry, PDF | Estimate builder and review screens | Backend totals; version/proof; authenticated artifacts |
| Drawings | Upload/retry/remove, manual/create/edit/replace/remove, item mapping and submit | Drawing workspace | Source/revision IDs, URI transfers and version checks |
| Plan review | Images/thumbnails, touch annotations, draft/save, target preview, change request/update/target/resolve | Native plan viewer/editor | Normalized geometry, snapshot token, CAS and idempotency |
| Management | Team/tree/search, designer summary, KPI/task detail, evaluation, audit/activity, deadline reason/revision | Team/organization list-detail and evaluation/deadline forms | Server KPI, immutable original deadline, scoped relationships |
| Client | Project summaries/details, approved versions, estimate/design decisions, workflow actions/artifacts | Client projects and composed review screens | Client DTO/scope; no staff payload shortcut |
| Procurement | Approved projects/items, UOM/vendor selection, create/update, vendor suggestions, expenses/documents | Procurement list/detail/editors | Approved-source lineage, paise, idempotency |
| Finance | Portfolio/bucket/ledger, direct/other/overhead entries, documents and payment controls | Finance portfolio/project/entry | Integer paise, GST/margin lineage, reconciliation |
| Admin | Dashboard overview/project/workforce, users, invitations, response/design/access queues | Dashboard and administrative lists/details | Per-operation Super Admin behavior; delivery preflight |
| Knowledge catalog | Items/search/create/duplicate, revisions/history/activation, baskets/main lines/masters/surfaces and impact/delete | Knowledge catalog/list-detail | Stable references, versions, lifecycle confirmations |
| Knowledge editors | Overview, specifications, budgets, relationships, modes/pricing/margins/discounts, simulation | Section index + editor; tablet context rail | Current backend/reference formula; saved/draft/conflict states |
| Quality workbook | Checklist/evidence/sampling edits, template/import preview/merge/export/save | Quality editor and native document flow | 5 MiB compressed, 32 MiB expanded, 20 s, 200 questions; draft-first |
| Access | Own request/history/cancel, review/decision and grant revocation | Access request/inbox/detail | Eligibility, version, non-disclosure and immediate purge |
| Messages | Conversation list, messages/replies/mentions/issues/read, participants, typing, files and audio | Conversation list/detail/composer | Membership, client IDs, bounded SSE, attachment policy |
| Notifications | List/older, unread/read, realtime snapshot and message navigation | Notification inbox/bell | Authorized destination and resume catch-up |

Component-local requests included in this inventory: session establishment/restoration, designer project creation, project hierarchy reads, task updates, deadline revisions, design-version upload, evaluation creation, protected image and file retrieval.

## Required states per screen

These remain the acceptance target for complete parity: initial loading, empty, error/retry, retained stale data, offline, permission loss, success and version conflict. The shared list/detail shell currently implements loading, empty, refresh, error/retry and non-disclosing denied states; several specialized editors still lack retained-stale, offline and draft-conflict presentation. Mutations block duplicate taps where wired and report server-confirmed outcomes. Access-change handling now cancels and removes protected query families before refreshing the retained access-request state.

Android Back follows the router hierarchy for the implemented screens. Full keyboard/transient-overlay ordering, universal dirty-form Save/Discard/Keep editing, and list focus/scroll restoration remain part of the open Android device-validation and parity work.

## Existing unavailable capabilities

These are not mobile parity gaps:

- Ask Lisno is a disabled web “Coming soon” control.
- Vendor KPI is an upstream “Not rated yet” placeholder.
- SSO and resend-verification controls have no backend route.
- OS push while terminated is not part of the current SSE notification contract.
- Production public signup remains disabled until verified email ownership exists.

No “Coming soon” screen counts as completed parity for a working existing feature.

## Verification trace

Each implementation row must add links to its mobile screen/module and focused test. Final verification covers all sixteen roles, asymmetric project relationships, two unequal finance projects, conflict/idempotency/proof cases, native file/audio/annotation/workbook round trips, responsive widths, TalkBack, Back behavior and separate Remote/Local configured launches.

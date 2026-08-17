# Prompt 0 — Complete Codebase Audit Report

## Document provenance

The requested CODEX_IMPLEMENTATION_PLAN.md name did not exist in the working tree or repository history when Prompt 0 began. The user clarified that the attached prompt library should be treated as that plan. This separate file is the durable Prompt 0 architecture-audit report.

The controlling Prompt 0 specification was read in full from:

- [CODEX_IMPLEMENTATION_PLAN.md](./CODEX_IMPLEMENTATION_PLAN.md), created from the attached Codex Prompt Library
- The pre-state-block plan content was verified against the user-referenced copy in /Users/apple/Downloads

Audit baseline:

| Field | Value |
|---|---|
| Audit date | 2026-08-17 |
| Branch | feature/phase1_module1 |
| Commit | c739abf |
| Authorized scope | Prompt 0 only |
| Product implementation performed | None |
| Schema or data migration performed | None |

## Implementation state

| Phase | State | Notes |
|---|---|---|
| Prompt 0 — Complete codebase audit | **COMPLETE** | Architecture, workflows, data model, tests, reuse opportunities, conflicts, and risks audited |
| Prompt 1 — Roles, RBAC and authorization foundation | **NOT STARTED** | Explicitly outside this run |
| Prompt 2 — Project and estimation lifecycle | **NOT STARTED** | Explicitly outside this run |
| Prompt 3 — Design lifecycle | **NOT STARTED** | Explicitly outside this run |
| Prompt 4 — Procurement | **NOT STARTED** | Explicitly outside this run |
| Prompt 5 — Finance and expenses | **NOT STARTED** | Explicitly outside this run |
| Prompt 6 — Execution task generation | **NOT STARTED** | Explicitly outside this run |
| Prompt 7 — Worker progress and KPI | **NOT STARTED** | Explicitly outside this run |
| Prompt 8 — Super Admin dashboard | **NOT STARTED** | Explicitly outside this run |
| Prompt 9 — Full lifecycle integration | **NOT STARTED** | Explicitly outside this run |
| Prompt 10 — Final hardening | **NOT STARTED** | Explicitly outside this run |

No later phase has been implemented, scaffolded, or partially started.

## Historical Prompt 1 readiness decision — superseded 2026-08-17

> **Historical Prompt 0 snapshot.** This original pre-remediation readiness decision is retained unchanged for audit history. The dated readiness-remediation addendum below supersedes it as the current gate verdict.

**Repository ready for Prompt 1: NO — not under a strict safety and green-baseline gate.**

The architecture is sufficiently understood to plan Prompt 1. The backend, OCR worker, typechecks, and production builds are green. The repository is nevertheless not ready to begin cross-cutting RBAC changes for two independent reasons:

1. **Production authorization prerequisite:** Mongo project visibility begins with an unrestricted filter and scopes only client, designer, and design manager. As a result, estimator_sales already receives all projects through generic project APIs, while the memory repository used by many tests behaves differently. Any new role would also default to all-project access. This must become explicit and deny-by-default before new roles are introduced.
2. **Red frontend baseline:** With a deterministic API base, two stale LeadDashboard PDF regression tests still fail. Beginning RBAC work from a red suite would make new regressions harder to identify.

Required gate before Prompt 1:

1. Fix Mongo/memory project-access parity with a shared explicit, default-deny policy and regression tests.
2. Make the frontend test API base deterministic so an ignored local .env value cannot turn relative mocked requests into absolute URLs.
3. Update the two LeadDashboard PDF tests to reflect the intentional lead-row redesign, or restore equivalent behavior if the removed standalone estimate cards remain required.
4. Run the complete baseline to green and record the result.

These are prerequisite remediation items, not authorization to begin Prompt 1.

## Executive architecture summary

| Layer | Current implementation | Assessment |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind plus large handwritten CSS | Mature feature application with reusable shells, states, upload, annotation, task, KPI, and approval UI |
| Backend | Express 5, TypeScript, Zod, Mongoose, JWT/bcrypt, route/service/repository patterns | Strong validation and workflow coverage, but persistence is split between repositories and direct Mongoose services |
| Database | MongoDB replica set; Mongoose models; UUID-like string identifiers; transactions for critical workflows | Transaction-aware, but no generic role/permission, expense, or document model and no versioned migration framework |
| Files | Authenticated storage abstraction backed by local disk | Safe reference-based access; local-only storage is a production scaling and recovery risk |
| OCR | Separate Python worker with leased jobs, heartbeat, retryable delivery, normalized image output, and PaddleOCR integration | Substantial implementation that should be preserved and extended, not replaced |
| Estimation | Lead-rooted estimate builder, fixed calculation rules, internal approval, PDF generation, client portal review | Working system, but its lifecycle conflicts with the requested project-first/external-proof model |
| Tasks and KPI | Design-task hierarchy, dependencies, optimistic versions, events, deadlines, evaluations, deterministic designer KPI | Reusable concepts and UI; not yet an execution/site-worker system |

The application is not a scaffold. It is a production-oriented design-operations platform with significant tests and two parallel OCR-backed design-review domains.

## Frontend audit

### Framework and structure

- React 19 with strict TypeScript and Vite 6.
- React Router 7 provides routing.
- TanStack Query owns server state; authentication and feedback use React context; local workflow state and React Hook Form own forms. There is no Redux/Zustand-style store.
- Feature folders cover designer, manager, design head, client, leads, and estimates.
- Shared areas include auth, API client, layout, general UI, KPI, task, design/OCR, and styles.
- Tailwind is installed, but much of the product uses semantic handwritten CSS. The main styles file and role-theme stylesheet are already large maintenance surfaces.
- Routes are eagerly imported; no route-level code splitting is present.
- Scripts exist for development, test, typecheck, and build. There is no lint, browser E2E, Storybook, or coverage-threshold script.

### Routing and authentication

Public routes:

- /login
- /signup
- root redirect

Protected route families:

- /designer and /designer/projects/:projectId
- /manager, designer drill-down, and project drill-down
- /head, designer drill-down, and project drill-down
- /estimator-sales, lead detail, and estimate workspace
- /client and client project detail

ProtectedRoute restores the session before making access decisions, handles authentication errors, redirects unauthenticated users, and checks allowed roles. Safe return-path logic prevents external or traversal-like redirects.

The role model is static and coarse:

- The Role union, role-home table, navigation, labels, feedback content, and route definitions all enumerate the same five roles.
- Frontend checks know roles only; they do not express permissions, module access, project access, or ownership.
- Wrong-role navigation redirects home rather than displaying a dedicated 403 state.
- Unknown routes also redirect home; there is no distinct 404 experience.

Authentication strengths:

- Centralized token handling and authorization headers.
- /auth/me restoration.
- Careful handling of concurrent restore/logout/login generations.
- Query-cache clearing between users.
- Consistent expired-session behavior.

Authentication risks:

- JWTs are stored in localStorage and are therefore exposed if application JavaScript is compromised by XSS.
- The session-expired custom browser event currently includes the token value; an opaque event is safer.
- Logout is client-side only; there is no token revocation endpoint.
- Seed/demo credentials appear in the login UI without an explicit development-only gate.
- Authenticated PDF blobs are rendered in an iframe without a sandbox attribute; backend MIME defenses reduce risk, but this deserves a browser-security review.

### API and state layer

The centralized API client should be reused. It already supports:

- Configurable /api/v1 base URL.
- Bearer authentication.
- Standard JSON/error envelopes.
- JSON verbs.
- Multipart upload with progress.
- Authenticated blob download and filename parsing.
- 401 session-expiry signaling.

Feature API modules and query-key factories exist for designer, manager, client, leads, estimation workflow, and estimate-design workflow.

Limitations:

- Frontend response objects are cast to handwritten interfaces; there is no generated shared contract or runtime validation of responses.
- Endpoint ownership is inconsistent because some components call the low-level client directly.
- Query abort signals are generally not forwarded.
- Uploads have no UI cancellation or common timeout.
- Organization views fetch all pages and can perform per-manager pagination, which will not scale to a global dashboard.
- The lead dashboard fetches only its first page without load-more behavior.
- A task update uses an exact base-key invalidation that does not match period-suffixed KPI queries, so KPI/task feed data can remain stale.

### Existing screens and reusable components

Existing screens:

- Designer dashboard, project creation/detail, floor/stage/task management, uploads, OCR correction, and estimate review.
- Manager team dashboard, designer detail/KPI/evaluation, project inspection, deadline revision, approvals, and estimate assignment.
- Design-head organization hierarchy, designer/project drill-down, approvals, evaluation, and KPI.
- Estimator-sales lead dashboard/detail, estimate builder, PDF export, design upload/OCR mapping/replacement, and change-request handling.
- Client project view, approved files, progress, estimate/design review, annotation, approval, and rejection.

Reusable UI:

- Responsive application shell, sidebar, mobile drawer, focus handling, and skip link.
- Dialog, drawer, buttons, fields, combobox, banners, badges, skeletons, and loading/error/empty state components.
- Metric cards, progress bars, KPI score/breakdown/trend, designer cards, and task risk badges.
- Authenticated image/blob loaders, file preview, and download.
- Crop editor, map viewport, annotation editor, drawing preview, and full-plan projection.
- Task row/update/upload dialogs, including optimistic conflict handling.
- Real upload progress, OCR polling, retry, thumbnails, crop correction, mapping, annotation, and review.

Dashboard gaps:

- No charting library.
- No reusable data-table system.
- KpiTrend is textual/list history, not a plotted chart.
- There is no cross-role or Super Admin dashboard.

### Frontend correctness findings

- LeadDetail always displays “Start estimate” and does not first determine whether an estimate exists.
- LeadEstimateWorkspace does not render a saved-estimate query error; a failed read can look like an empty/new estimate state.
- The dashboard redesign removed standalone saved-estimate cards and now embeds estimate actions in lead rows, but two PDF-export tests still seed zero leads and expect the old cards.
- The ignored frontend .env sets an absolute API base. Many tests mock exact relative /api/v1 URLs, creating environment-dependent failures.
- The FC01 catalogue displays human-readable specification labels while its rate map uses slug keys; direct lookup can fall back to a zero base rate. This must be characterized with backward-compatible fixtures before any correction because estimation calculations are explicitly protected.
- All role routes are eagerly imported, and the current bundle already exceeds Vite’s default chunk warning threshold.

## Backend audit

### Framework and composition

- Express 5 with TypeScript and Zod validation.
- Mongoose 9 for MongoDB.
- JWT authentication and bcrypt password hashing.
- Centralized error normalization, CORS allowlisting, pagination, request validation, and authentication rate limiting.
- App composition lives in backend/src/app.ts and mounts the versioned API under /api/v1.
- Worker routes use a worker token and are mounted ahead of the normal JSON body-size limit where required.
- The production server connects MongoDB. createApp can use an in-memory repository for tests.

Core project/task/auth/KPI areas use route, service, and repository abstractions. Lead/estimate, estimate-design, and plan-review areas use Mongoose models and services more directly. This hybrid persistence architecture is the largest backend structural conflict for future cross-module transactions.

### Authentication and authorization

Current strengths:

- Passwords use bcrypt cost 12, including a dummy comparison for unknown accounts.
- JWT verification is restricted to HS256, validates its payload, reloads the active user, and verifies the current database role.
- Role middleware guards route families.
- Services enforce many resource ownership and relationship rules.
- Inaccessible identifiers are frequently returned as 404 to limit enumeration.
- Client signup/linking and critical approval flows use transactions.
- Tests cover many cross-role and cross-resource isolation cases.

Critical findings:

- Mongo project filtering initializes to unrestricted and only narrows client, designer, and design_manager. estimator_sales and any new role therefore receive all projects through generic project APIs.
- The memory repository has different fallback behavior, so repository-backed tests can miss the production exposure.
- Generic project list/detail routes require authentication but no route role allow-list. Project-design list/download relies on project accessibility, extending the exposure to artifacts.
- There is no Role collection, permission catalog, module ACL, project-access grant model, or policy engine.
- Roles are repeated in domain contracts, auth schemas, Mongoose enums, seeds, routes, frontend types, and tests.
- Client signup immediately activates an account and claims unclaimed projects matching the submitted email, without email verification. Estimate/client access also relies on lead email matching. An attacker able to register another client’s email could claim related data.
- The login limiter is process-local; there is no refresh/session revocation, password reset, MFA, or invitation workflow.

### API areas found

- Authentication and client signup/linking.
- Designer, manager, design-head, and client project views.
- Project/floor/stage/task creation and updates.
- Task deadline revision, dependencies, event feed, evaluation, audit, and KPI.
- Design version upload, OCR jobs, section correction/submission, approval, and client review.
- Lead CRUD/activity and estimate creation/update/workflow.
- Estimate PDF generation and protected download.
- Estimate-design upload/OCR, drawing/revision, correction, mapping, annotation, and review.
- Full-plan review and change requests.
- Worker job claim/heartbeat/result/manual-retry operations.

### Validation, operations, and storage

Strengths:

- CORS allowlist and authentication rate limiting.
- Strict Zod request validation in most routes.
- Bounded upload sizes.
- File signature/MIME checks and bounded PDF structural validation.
- Generated internal storage references rather than public upload paths.
- Authenticated streaming with controlled content disposition.
- MongoDB transactions for critical multi-record workflows.
- Leased OCR jobs with claim tokens, heartbeats, result IDs, and stale-result rejection.

Risks:

- Local-disk storage has horizontal-scaling, backup, retention, and orphan-cleanup implications.
- MongoDB transactions require a replica set.
- MongoDB references are application-enforced, not foreign-key-enforced.
- No real outbound mail dispatcher was found.
- Direct-Mongoose/repository split makes atomic rules and test parity harder.
- Unexpected errors are hidden but there is no structured logging, correlation ID, or security-header middleware.
- Direct Mongoose duplicate/validation errors can become generic 500s.
- Base estimate input accepts caller-supplied catalogue/specification/unit/rate/quantity with weak bounds; totals are recomputed but authoritative pricing is not server-catalogue-enforced.
- No visible CI workflow, lint gate, browser E2E suite, or coverage threshold.
- Automatic OCR retry/backoff is documented/configured but the policy is not consumed; failures move to processing_failed and require manual retry.

## Database audit

Identifiers are string IDs with domain prefixes/UUID-like values. MongoDB indexes, service checks, and transactions provide integrity; there are no database-enforced foreign keys.

| Required audit model | Current state |
|---|---|
| User | Exists. Name, normalized unique email, password hash, static role enum, active flag, managerId, authorized client IDs, avatar/title |
| Role | **Does not exist.** Roles are static strings |
| Project | Exists. Client snapshot/link, initiating/assigned designers, manager, location, planned/actual dates, and planning/active/on_hold/completed status |
| Estimation | Exists as Estimate. One estimate per lead, embedded rooms/scopes/line items, totals, workflow status, reviews, notifications, project link, and design lifecycle fields |
| Estimation item | **No standalone model.** Line items are embedded and have no durable source-item ID suitable for later generation idempotency |
| Task | Exists for design delivery. Project/floor/stage, designer owner, dates, progress, status, dependencies, version, and quality/KPI metadata |
| Expense | **Does not exist** |
| Document/file | **No generic model.** Domain-specific versions, uploads, source pages, revisions, and storage references are separate |
| Audit | Exists as append-only AuditEvent |

Other models include Lead, LeadActivity, Floor, DesignStage, TaskEvent, DesignVersion and sequence state, Evaluation, project-design extraction/pages/sections/revisions, estimate-design uploads/extraction/pages/drawings/revisions/annotations/plan pages/change requests, and EmailCoordination.

Notable integrity findings:

- Lead stage is route-validated but unconstrained in the database schema.
- AuditEvent actor is declared as a User reference although OCR writes system actor strings.
- Embedded estimate reviews/notifications can grow without bounds.
- Project supports on_hold in storage, but project read projection derives status from tasks and can overwrite it with planning/active/completed.
- The seed resets core data but not all lead/estimate/OCR collections, so it can leave orphaned commercial records.

### Migration posture

Existing migrations are standalone TypeScript scripts with useful dry-run, duplicate detection, conflict reporting, and compare-and-swap patterns. There is no ordered migration registry.

Future work needs explicit ordering, idempotent dry runs, backups/rollback guidance, compatibility reads, backfills, index reconciliation, and preflight duplicate/orphan checks.

## Existing roles and access

| Role | Current permissions | Frontend access | Backend access |
|---|---|---|---|
| designer | Creates design projects/hierarchy/tasks; updates owned tasks; uploads/corrects designs; submits OCR sections; reviews assigned high-value estimates; views own KPI/audit | Designer dashboard and project workspace | Assigned/initiated projects, owned tasks, project-design workflow, assigned estimate review, self KPI/audit |
| design_manager | Manages direct reports/projects; revises deadlines; approves versions; assigns estimate designer; records evaluations; views report KPI/audit | Manager team, designer, and project screens | Direct-report project resources, approvals, global pending estimate queue with team-limited assignment, evaluations, report KPI/audit |
| design_head | Organization-wide design oversight; approvals; deadline revisions; evaluations; KPI/audit | Head organization, designer, and project screens | All Mongo projects, org access and project-design approvals; route/service mismatch prevents ordinary full-plan access |
| estimator_sales | Manages owned leads/estimates; exports PDFs; uploads/corrects estimate designs; sends estimates | Lead dashboard/detail and estimate workspace | Intended owner-scoped lead/estimate access; **currently receives all Mongo projects and dependent generic project artifacts** |
| client | Views linked projects/approved artifacts; reviews estimates/drawings/pages/sections; approves or requests changes | Client dashboard and project review | Client-linked projects; client-visible artifacts; estimate/PDF/design decisions by normalized lead-email matching |

Absent requested roles: Super Admin, Admin, Procurement, Finance, Site Manager, and Worker. Worker category is also absent and should be metadata/permissions on a worker identity, not a growing set of hard-coded route roles.

## Existing estimation, PDF, notification, and approval workflow

### Actual current flow

The requested conceptual flow does not exist as a single project-rooted pipeline. The principal commercial implementation is:

Lead
→ owner-scoped Estimate draft
→ optional internal manager/designer review for high-value estimates
→ PDF generated on demand
→ “send to client” status transition plus queued notification record
→ client portal drawing/estimate review
→ direct client approval
→ transactionally auto-created Project and won Lead

A separate designer workflow can create a Project directly, so the application currently has two project-origin paths.

### How estimation starts and continues

- Estimator Sales creates and owns a Lead.
- PUT /leads/:leadId/estimate find-or-creates the lead’s estimate and persists its draft.
- The server recomputes line amounts, subtotal, fixed 18% GST, and total.
- The estimate workspace can restore an existing saved estimate.
- The lead dashboard shows Continue estimate for drafts and View details for later states, but LeadDetail itself always offers Start estimate.
- Editable states are draft, designer_changes_requested, and client_changes_requested; reopening a change request moves it back to draft and increments version.

### Completion and duplicate prevention

- Estimate state is persisted in one mutable Estimate record.
- Estimate has a unique leadId index, so one lead cannot intentionally hold multiple estimates.
- The service updates the existing record when present.
- There is no explicit request idempotency key; concurrent first creates rely on the uniqueness rule and can surface a generic duplicate-key 500.
- Repeated submit is not guarded by current status/version and can append duplicate review/notification state or corrupt a later lifecycle state.
- Manager assignment and designer decisions use read-modify-save without compare-and-set protection.
- Final client approval is stronger: transaction/status/version/design-lifecycle checks prevent a successful replay from creating multiple projects.
- The unique key is leadId, not the future requirement’s projectId, and embedded lines have no durable IDs.

### Internal review

- A hard-coded ₹1,500,000 threshold decides whether manager/designer review is required.
- Lower-value estimates go directly to sent_to_client.
- Higher-value estimates go to pending_manager_assignment, then a manager assigns a direct-report designer.
- The pending manager queue is global, although assignment is limited to the chosen manager’s team.
- The designer approves or requests changes.
- Estimator Sales sends ready_for_client estimates.
- If final approval has no assigned designer/manager, the workflow can fall back to the earliest active designer and manager, which can cross intended team boundaries.

### Calculation and PDF

- Room/scope/line-item details are embedded in Estimate.
- The backend recomputes line amount, subtotal, fixed 18% GST, and total; the frontend has a corresponding engine.
- Caller-supplied catalogue IDs, specifications, units, rates, and quantities are accepted. Recalculation protects arithmetic but not authoritative catalogue pricing.
- Existing calculation behavior must be preserved unless a later prompt explicitly authorizes a change.
- PDFKit generates the estimate PDF on demand from current Lead and Estimate data.
- Owner- and client-scoped endpoints provide authenticated downloads.
- The renderer groups included items, handles legacy catalogue IDs, paginates, applies headers/watermarks, and returns a sanitized versioned filename.
- No immutable PDF artifact, content hash, approved snapshot, or retained version is stored. A later approval cannot currently point to the exact bytes reviewed.
- This implementation should be wrapped and reused, not replaced.

### Email/notification reality

No outbound email transport, provider adapter, outbox consumer, SMTP dependency, or dispatcher was found. “Send to client” changes workflow state and appends an embedded notification with queued status. Similar kickoff notifications are queued on client approval.

EmailCoordination is a normalized-email concurrency record for account/project linking; it is not an email service.

Therefore the current “email implementation” is a logical notification queue, not proven email delivery. A later phase must connect it to an existing external mechanism not present here or implement delivery explicitly without duplicating notification intent.

### Approval conflict

Current client approval is direct and portal-based. Successful approval rechecks drawing/plan readiness, freezes design state, creates the Project, links the Estimate, marks the Lead won, records audit, and queues kickoff notifications in one Mongo transaction.

The requested future lifecycle is project-first and relies on external approval proof followed by an internal role’s approval. These semantics conflict and must be reconciled through migration and compatibility design rather than layering a second independent lifecycle onto the same records.

Client estimate authorization currently relies on normalized Lead email rather than a durable client ID. Combined with public signup that claims unverified matching-email projects, this is a high-priority identity and data-access risk.

## Existing OCR and file workflow

There are two parallel, substantial OCR domains.

### Project/design-task OCR

1. A designer uploads a design file for a task.
2. Backend validates size, signature/MIME, and PDF validity.
3. DesignVersion and extraction job records are created.
4. The Python worker leases the job, downloads the protected source, renders pages, runs OCR, and publishes normalized results.
5. Source pages/crops and DesignSections are stored.
6. The designer reviews/corrects sections and submits them.
7. Manager/head version approval and client section review are separate workflows.

### Estimate-design OCR

1. Estimator uploads a design under an existing Estimate.
2. Estimate-specific upload, job, source-page, drawing, and revision records are created.
3. The same worker claims an estimate_design job.
4. OCR returns page/crop images, labels/confidence, and taxonomy proposals.
5. Estimator maps drawings to rooms/scopes/catalogue items, corrects crops, replaces revisions, and submits.
6. Client can annotate, approve, request changes, and review full-plan pages.

### Processing and storage

- Worker kinds are project_design and estimate_design.
- Supported inputs include PDF, PNG, JPEG, WebP, TIFF, and HEIC.
- The pipeline uses PyMuPDF, Pillow/HEIF support, NumPy, and optional PaddleOCR/PaddlePaddle.
- Page, pixel, output-byte, and upload-size limits are enforced.
- Job claim tokens, leases, heartbeats, result IDs, and stale-result rejection protect the queue.
- Rendered images/crops and normalized OCR metadata are stored through authenticated storage references.
- The current adapter stores UUID-named files on local disk with mode 0600 and path traversal checks; sources are not public static files.
- Frontend provides upload progress, polling, manual retry, thumbnails, crop correction, mapping, annotation, and review.
- Estimate-design mapping is derived from included estimate lines and enabled scopes, with coherent all-or-none mapping invariants.
- Full-plan change requests use idempotency keys and a partial uniqueness rule allowing one open request per client/page.

Important limitations:

- Filesystem writes and Mongo transactions cannot be atomic; cleanup handles many failures, but process crashes can leave orphans or missing-file references.
- Automatic OCR retry/backoff is advertised in configuration and documentation, but the policy is not consumed by the failure paths. OCR failures move to processing_failed and require manual retry; the worker only retries delivery of a failure callback.
- Project and estimate design systems have separate lifecycles and approval semantics. Later design work must select/bridge the correct domain rather than create a third OCR system.
- Project-design approval is a status toggle with no proof document requirement.
- Design-head is route-allowed for full-plan staff actions but service scoping generally requires the assigned manager/designer, creating a route/service mismatch.

The OCR worker and both domain integrations should be preserved.

## Existing task and KPI systems

Task assignment/status exists, but it is specifically a design-delivery system:

- Task belongs to project/floor/design stage.
- Owner is a designer who must be assigned to the project.
- Dates, progress, status, dependencies, optimistic version, notes, event history, and quality metadata are tracked.
- Transition rules are explicit, dependencies must be complete before work starts, and completion requires 100% progress.
- Designers update their own tasks.
- Managers/heads can revise deadlines with a reason; original deadline remains immutable.
- TaskEvent and AuditEvent record changes transactionally.
- Risk is derived at read time from deadline, progress, blockage, and forecast state.

It does not provide:

- Estimation-item source identity.
- Automatic execution-task generation.
- Site-manager assignment.
- Worker category/worker assignment.
- Reassignment workflow.
- Execution quantity/unit tracking.
- Daily site progress/evidence.
- Generated-task idempotency constraint.

The existing Task model should not be silently repurposed if doing so changes design-task semantics. A later phase should either extend it with a discriminated task kind and strict invariants or introduce an execution-task model while reusing shared services/UI.

The designer KPI engine is deterministic and reusable in concept. It calculates weighted on-time delivery, approval quality, revision efficiency, update discipline, and workload completion, redistributing unavailable weights. Access is designer self, manager direct reports/team, and head organization.

The future worker KPI formula is different. It should be added as an execution KPI policy rather than overwriting historical designer KPI meaning.

Project storage supports on_hold, but the project read projection derives status from task state and can return planning, active, or completed instead. Explicit future lifecycle state must not be overwritten this way.

## Existing dashboards

Role dashboards already compose:

- Metric cards.
- Progress bars.
- Status/risk badges.
- KPI score and breakdown.
- KPI textual trend/history.
- Designer/team cards.
- Task rows/feed.
- Lead pipeline/estimate state views.
- Project progress views.

They are role-specific query compositions, not a global aggregation layer. No Super Admin view, cross-module summary API, reusable chart, or reusable table exists. A future global dashboard should reuse visual primitives but use server-side paginated aggregations rather than fetching every role page into the browser.

## Critical reuse and gap analysis

| Category | Reuse as-is where possible | Modify or extend | New implementation required |
|---|---|---|---|
| Auth | JWT verification, bcrypt login, active-user reload, auth middleware | Canonical roles, email verification/invitations, explicit default-deny project access, permission/module/project policy | Internal user administration and fine-grained grants |
| Frontend shell | App shell, responsive navigation, states, dialogs/forms | Role homes/navigation, forbidden/locked states, lazy route boundaries | New role workspaces and global dashboard |
| API client | JSON, errors, multipart progress, protected downloads | Shared contracts, cancellation, cache invalidation consistency | APIs for missing modules |
| Project | Existing identity, hierarchy, planned dates | Lifecycle/status compatibility, approval/module fields, canonical origin | Approval-proof and module-activation workflow |
| Estimation | Builder, calculation engine, unique lead estimate, approvals, PDF | Project linkage, authoritative catalogue policy, idempotency/CAS, immutable versions, start/continue error handling | External-proof/internal-approval orchestration |
| Notification | Embedded queued intent records | Durable outbox semantics and delivery status | Actual mail transport if none exists operationally |
| OCR/design | Worker, leases, validation, storage, rendering, correction/annotation UI | Activate real retry policy; clarify domain ownership and overall approval | Proof-backed design authorization/module gate |
| Files | Storage abstraction, protected streaming, MIME checks | Production object-store adapter, retention/orphan handling | Generic proof/document metadata if justified |
| Tasks | Hierarchy, transitions, dependencies, events/audit, task UI | Discriminated execution semantics or shared abstractions | Estimate-derived idempotent task generation and site workflow |
| KPI | Deterministic engine pattern, access checks, KPI UI | Add execution-specific formula and scopes | Worker/site KPI aggregates |
| Dashboards | Cards, progress, badges, loading/error/empty states | Scalable paginated aggregation and real chart/table primitives | Super Admin cross-module dashboard |
| Data | Transactions, indexes, dry-run/CAS migration patterns | Versioned migration discipline, compatibility reads, index reconciliation | Role/access, procurement, expense, execution, proof, outbox models |

## Architecture conflicts and risks

### Critical and high priority

1. **Production project exposure:** estimator_sales and every unknown/new role receive an unrestricted Mongo project filter. Memory behavior differs, hiding the defect from tests.
2. **Unverified client identity claim:** Public signup activates a matching email and claims unowned projects without verifying that email. Client estimate access also relies on email matching.
3. **Static RBAC:** Roles are repeated across frontend and backend; there is no granular permission/module/project policy.
4. **Two lifecycle roots:** Leads/estimates auto-create projects while designers can create projects directly. A project-first lifecycle needs a canonical identity and compatibility policy.
5. **Approval semantic collision:** Direct client portal approval conflicts with external proof plus internal approval.
6. **Red frontend baseline:** Two stale tests remain after normalizing the API base, while local configuration can cause another 39 apparent failures.
7. **Hybrid persistence:** Repository-backed core services and direct-Mongoose module services complicate atomic cross-module rules and production/test parity.
8. **No actual email delivery found:** UI and records say queued; delivery is unverified and no dispatcher exists.
9. **Mutable estimate/PDF:** No immutable commercial revision or PDF artifact binds an approval to exact content.
10. **Inconsistent concurrency protection:** Start, submit, manager assignment, designer decision, and send-client do not all use transaction/CAS/idempotency patterns.
11. **Embedded estimation items lack durable source IDs:** Later task generation cannot be safely idempotent or traceable by array position.
12. **Caller-controlled pricing metadata:** Arithmetic is server-recomputed, but catalogue/rate authority is not enforced server-side.

### Migration and backward-compatibility risks

- Existing JWTs contain old role strings; role renames can invalidate active sessions.
- Existing users have one static role and may need permission/category backfills.
- Existing projects have only four status values and no approval/module/proof fields.
- Existing projects can be designer-created or estimate-created.
- Existing estimates may have no projectId; existing projects may have no estimate.
- Estimate line items are embedded and may have no stable item ID.
- Existing bookmarks and APIs use role-specific paths and status strings.
- Existing client-approved records must not be re-opened when new proof fields default.
- Index additions can fail if legacy duplicates or missing keys are not audited first.
- File migrations must preserve protected references and handle orphaned local files.
- OCR has two valid data domains; merging them can lose revision/audit history.
- Lead stage and several action strings lack schema-level enums even where routes constrain them.
- The seed resets core records but not all lead/estimate/OCR collections, risking orphaned development data.
- There is no applied-version migration registry or comprehensive index rollout.

### Security and operational risks

- Browser-stored JWT exposure, token-bearing browser event, and lack of revocation.
- Demo credential visibility.
- Role-only UI gating without fine-grained backend policy for future modules.
- Process-local authentication rate limiting.
- Local-disk storage scaling/recovery/orphan risk.
- MongoDB replica-set requirement for transaction-dependent behavior.
- Application-enforced references can orphan records.
- Unsandboxed authenticated PDF iframe.
- No visible CI, lint, browser E2E, or coverage gate.
- Main frontend bundle is above the default chunk-size warning.
- No structured backend logging/correlation IDs and no explicit security-header middleware.

## Migration posture

Existing migrations are standalone TypeScript scripts with useful dry-run, duplicate-detection, conflict-reporting, and compare-and-swap patterns, including client-email/project linking and estimate-design mapping. There is no ordered migration registry.

Future schema work needs:

- Explicit ordering and applied-version tracking.
- Dry-run and idempotency.
- Backup and rollback guidance.
- Compatibility reads during rollout.
- Backfills for projects, estimates, embedded items, identities, and role values.
- Preflight duplicate/orphan reports.
- Controlled index creation and verification.
- Transaction-safe audit of access/lifecycle changes.

## Recommended implementation sequence

This sequence is a recommendation only. No step after Prompt 0 has started.

### Gate 0 — safety and baseline remediation

- Make Mongo and memory project access share an explicit default-deny policy; add regression tests proving estimator and unknown-role isolation.
- Add email verification or administrator-issued invitation semantics before relying on email-based project claiming.
- Make frontend tests independent of local VITE_API_URL.
- Reconcile the two stale LeadDashboard PDF tests with intended dashboard behavior.
- Re-run the complete baseline and preserve green evidence.
- Record the canonical project/estimate origin and approval-compatibility decision before schema work.

### Prompt 1 — RBAC foundation

- Establish one canonical role catalog and permission/module/project policy.
- Preserve old role values initially unless a migration explicitly maps them.
- Expand backend contracts, schemas, user validation, seeds, frontend role types, role homes, navigation, and routes together.
- Add internal user administration, activation/deactivation, invitation/verification, and audit.
- Treat worker as a role plus category/permissions rather than a route role per trade.
- Add backend authorization matrix and cross-resource isolation tests.

### Prompt 2 — project/estimation lifecycle

- Decide and migrate toward a canonical Project root without duplicating existing projects.
- Add compatible lifecycle/module/approval-proof fields and transition history.
- Move estimate mutations behind consistent service/repository, transaction, CAS, and idempotency rules.
- Preserve calculation behavior and PDF renderer while introducing immutable estimate/PDF snapshots if approval must bind exact content.
- Make Start/Continue/View behavior resource-driven and error-safe.
- Make notification delivery claims match actual delivery.

### Prompt 3 — design lifecycle

- Reuse OCR worker, storage, uploads, versions, crops, annotations, and review UI.
- Keep section/drawing feedback distinct from overall design authorization.
- Activate or remove misleading automatic-retry configuration.
- Add proof-backed approval/module gates without creating a third OCR domain.

### Prompts 4–5 — procurement and finance

- Add bounded modules/models with project/module authorization, audit history, document handling, migrations, and immutable money records.
- Reuse shared file, validation, money-display, state, and dashboard primitives.

### Prompts 6–7 — execution, worker progress, and KPI

- Give every source estimation item a durable identity before generation.
- Use a database uniqueness rule/idempotency key for task generation.
- Preserve design-task and designer-KPI semantics; add explicit execution task/KPI policies.
- Enforce site-manager/worker project scope in backend services.

### Prompt 8 — global dashboard

- Build server-side paginated aggregation/drill-down APIs.
- Reuse cards/status/progress primitives and add accessible table/chart primitives.
- Avoid client-side fetch-all organization patterns.

### Prompts 9–10 — integration and hardening

- Consolidate navigation/query keys around canonical project identity while preserving route aliases.
- Exercise the complete lifecycle, migrations, role matrix, locked modules, retries, idempotency, and failure recovery.
- Add browser E2E, performance budgets, CI/lint/coverage gates, object storage, retention, observability, and security review.

## Historical Prompt 0 verification evidence — superseded 2026-08-17

> **Historical Prompt 0 snapshot.** These original test results are retained unchanged for audit history. The fresh full-gate evidence in the dated readiness-remediation addendum below supersedes them as the current verification result.

| Area | Command and context | Result |
|---|---|---|
| Backend tests | backend: npm test | **PASS — 36 files, 487 tests** |
| Backend typecheck | backend: npm run typecheck | **PASS** |
| Backend production build | backend: npm run build | **PASS** |
| OCR tests excluding optional model marker | ocr-worker: .venv/bin/python -m pytest -m 'not model' | **PASS — 320 passed, 1 skipped, 1 deselected; 5 deprecation warnings** |
| Frontend tests with existing ignored .env | frontend: npm test | **FAIL — 521 passed, 41 failed across 12 files**; absolute VITE_API_URL conflicts with relative request mocks |
| Frontend tests with deterministic API base | frontend: VITE_API_URL=/api/v1 npm test | **FAIL — 560 passed, 2 failed** in LeadDashboard.pdf.test.tsx |
| Frontend typecheck | frontend: npm run typecheck | **PASS** |
| Frontend production build | frontend: npm run build | **PASS**, with a 637.52 kB main-JavaScript chunk warning |

The optional OCR model-marked test was not run. No lint or browser E2E command exists in the repository manifests.

## Historical Prompt 0 completion report — superseded 2026-08-17

> **Historical Prompt 0 snapshot.** This original completion report is retained unchanged for audit history. Its pre-remediation readiness status and next step are superseded by the dated readiness-remediation addendum below; Prompt 0 itself remains complete.

IMPLEMENTATION STATUS

Completed:

- Read the complete controlling prompt library.
- Audited frontend, backend, database models, roles/access, workflows, estimation/PDF/notification behavior, OCR/files, tasks/KPI, dashboards, tests, risks, and compatibility constraints.
- Recorded a recommended phase sequence.
- Updated implementation state: Prompt 0 complete; Prompts 1–10 not started.

Files Changed:

- CODEX_IMPLEMENTATION_PLAN.md — the full attached prompt library under the requested filename, with the implementation-state block added.
- PROMPT_0_AUDIT_REPORT.md — detailed Prompt 0 audit and verification report.

Database Changes:

- None.

API Changes:

- None.

Frontend Changes:

- None.

Tests Added:

- None.

Tests Executed:

- Backend unit/integration test suite.
- Backend typecheck and production build.
- OCR non-model test suite.
- Frontend suite under the existing local environment and a deterministic API-base override.
- Frontend typecheck and production build.

Tests Passed:

- Backend: 487/487.
- OCR non-model selection: 320 passed, 1 skipped, 1 model-marked test deselected.
- Frontend normalized run: 560/562.
- Both frontend and backend typechecks passed.
- Both frontend and backend production builds passed.

Tests Failed:

- Frontend normalized run: 2/562, both stale LeadDashboard PDF tests expecting removed standalone estimate cards.
- Existing local frontend environment produces 41/562 failures because absolute request URLs do not match relative test mocks; 39 disappear when the API base is normalized.

Known Issues:

- Production Mongo project authorization exposes all projects to estimator_sales and would do the same for new roles unless corrected.
- Public unverified client signup can claim matching-email projects and email-linked estimate access.
- Repository is not at a fully green frontend baseline.
- OCR’s optional model-marked test was not executed.
- No actual outbound email dispatcher was found.
- Principal architecture, migration, security, and compatibility risks are documented above.

Next Recommended Step:

- Stop here. With separate authorization, perform Gate 0 safety/baseline remediation and verification; then return for explicit approval before starting Prompt 1.

AUDIT COMPLETE

No major feature implementation performed.

**Ready for Prompt 1: NO.** The repository is architecturally understood, but it is not safe to add roles until production project access is default-deny and the strict frontend baseline is green.

---

## Readiness remediation addendum — 2026-08-17

> **Current authoritative gate record.** This addendum supersedes the earlier historical Prompt 1 readiness decision, Prompt 0 verification evidence, and Prompt 0 completion report for current readiness status and verification results.

### Remediation state and scope

**Prompt 0 readiness remediation: COMPLETE.** Prompt 0 remains **COMPLETE**. Prompt 1 through Prompt 10 remain **NOT STARTED**. The remediation changed only the prerequisite safety/baseline behavior authorized after the audit; it did not start Prompt 1, change OCR, or implement any later prompt.

The three remediation commits completed the required gate items:

1. **Shared access-scope fix:** One shared project-access policy now drives both memory and Mongo repository reads. `design_head`, `designer`, `design_manager`, and `client` retain explicit scopes; `estimator_sales` receives an explicit `none` scope. Generic project lists, project details, and dependent project design artifacts therefore deny unassigned Estimator/Sales access in both persistence implementations.
2. **Test-environment isolation:** Vitest fixes `VITE_API_URL` to `/api/v1` inside test configuration, so even the hostile shell value `http://hostile.invalid/api/v1` cannot replace the deterministic request base expected by test mocks.
3. **Restored complete saved-estimate export surface:** The Estimator/Sales dashboard again renders a dedicated Saved estimates region containing every saved estimate, including estimates whose lead is outside the currently loaded lead page, with per-estimate PDF export and estimate navigation. Lead rows remain usable, and their estimate state is reported as unavailable rather than falsely empty if the saved-estimate request fails.

No OCR file changed. No migration, schema, later-role, Admin assignment UI, role-filtered dropdown, or other Prompt 1 implementation was added.

### Fresh full-gate evidence

All required commands were run fresh on `feature/phase1_module1` on 2026-08-17:

| Area | Exact command | Fresh result |
|---|---|---|
| Backend tests | `cd backend && npm test` | **PASS — 36/36 test files; 491/491 tests; 0 failed** |
| Backend typecheck | `cd backend && npm run typecheck` | **PASS — 0 TypeScript errors** |
| Backend production build | `cd backend && npm run build` | **PASS — `tsc` plus static-asset copy completed; 0 build errors** |
| Hostile-environment frontend tests | `cd frontend && VITE_API_URL=http://hostile.invalid/api/v1 npm test` | **PASS — 63/63 test files; 563/563 tests; 0 failed** |
| Frontend typecheck | `cd frontend && npm run typecheck` | **PASS — 0 TypeScript errors** |
| Frontend production build | `cd frontend && npm run build` | **PASS — 2,029 modules transformed; 0 build errors** |

Gate total: **6/6 required commands passed; 0 required-command failures.** Frontend build output was `dist/index.html` 0.51 kB (0.31 kB gzip), CSS 160.13 kB (29.15 kB gzip), and JavaScript 639.34 kB (185.76 kB gzip). The build emitted one non-failing warning because a minified chunk exceeds Vite's 500 kB threshold. The hostile frontend test run also emitted a non-failing MSW diagnostic for an unmatched `GET /api/v1/estimate-plan-pages/page-1/current-image` request while all 563 tests passed.

Diff-scope verification used `git status --short`, `git diff HEAD~3..HEAD -- backend ocr-worker frontend`, and `git diff --check`. The three commits changed only the shared backend project-access policy and its repository/workflow tests, frontend test environment configuration, and LeadDashboard saved-estimate export behavior/tests. The `ocr-worker` diff was empty, and the whitespace check exited zero.

### Access contract for later work

Current generic project access for `estimator_sales` is explicit deny-by-default. Future Estimator/Sales project access is not implicit, global, manager-derived, or granted by this remediation. It may be introduced only in a later authorized prompt through an Admin assignment to a named active user selected from a role-filtered `estimator_sales` dropdown. The backend must enforce that durable assignment; frontend filtering alone is insufficient.

### Readiness verdict and remaining risks

**Ready to begin Prompt 1: YES.** The authorization prerequisite and strict hostile-environment frontend baseline are green, so the repository is ready for separately authorized Prompt 1 work.

**Ready for public production: NO.** This gate establishes a controlled starting point for Prompt 1; it does not complete later lifecycle, security, operational, migration, browser-E2E, performance, observability, storage, or release-hardening work.

The unverified client-email claiming issue remains open and non-blocking for beginning Prompt 1 but blocking/high-priority for public release: public signup can activate a client for a submitted email and claim matching unowned projects, while client estimate access also relies on normalized lead-email matching. Email verification or Admin-issued invitation/claim semantics and durable client identity binding remain required before public production. The existing non-failing frontend bundle-size warning and the non-failing MSW unmatched-request diagnostic should also be addressed in later hardening.

# Vendor execution tracker implementation plan

Date: 2026-10-08

Status: task plan approved; implementation authorized in Mode A on 2026-10-08. T0–T7 complete locally on 2026-10-09. Feature checks and browser QA passed; full suites retain independently reproduced baseline failures documented below. Not deployed.

Source of truth: [approved specification](../specs/2026-10-08-vendor-execution-tracker-design.md). The user approved that specification on 2026-10-08. Its original drafting-status line is historical; this plan records the subsequent approval without modifying the approved file during the task-plan-only gate.

## Outcome and boundaries

Implement issued-work vendor onboarding, individual Main Line commitments and daily reports, Site Manager completion verification, 09:00/18:00/19:00 India-time reporting/reminders/escalation, and live scoped project/portfolio tracking. Preserve issued financial terms, Client decisions and Super Admin final project closure.

Only this plan is created at this gate. No application source, dependencies, tests, production data or external email are changed. The user’s next approval advances to execution-mode selection, not implementation directly.

## Evidence and worktree baseline

- Before this plan, `git status --short` showed only the untracked, approved specification. Application sources were clean. Preserve that file and recapture status/per-target diffs before implementation writers start.
- The shared `onPurchaseOrderApproved` hook is wired from `backend/src/app.ts` into direct purchase-order approval, project purchase-order-request approval, and basket award issuance. Automatic and manual basket issue converge on the basket service. Every path must produce access intent and execution records consistently.
- Assignment identity is already order/revision/line-specific. Extend it; do not create a second Main Basket-level assignment system.
- Manual invitations, acceptance and issuer checks live in `user-invitation.service.ts`, with `UserInvitation` and memory/Mongo repository contracts. Automatic vendor authority requires a narrow tagged extension across all of them.
- The existing vendor work and site-completion paths can submit to Client review; project-level 100% can currently imply assignment verification. All these paths must enforce the approved individual verification requirement for the new workflow.
- `Project.programManagerId` exists. The frontend Program Manager default points at `/work-order-approvals`, while the current route registry does not present that route for this role. Provide a dedicated scoped execution landing view without granting unrelated approval permissions.
- Notifications and daily critical lists currently depend on chat contracts/permissions. Vendor execution delivery must not require granting vendors chat access or exposing staff escalation data to Clients.
- Existing email transports, Mongo change streams, SSE patterns, TanStack Query, test tooling and date/crypto utilities are available. No new dependency is planned.

## Contract to establish before parallel writers

The parent owns shared backend/frontend DTOs and route-operation integration. New module names below are planned paths; adjust a filename only where current repository structure warrants it, without changing approved behavior or allowing overlapping ownership.

### Data boundaries

| Record/module | Minimum responsibilities |
| --- | --- |
| `contracts/vendor-execution.ts` and frontend `features/execution/executionApi.ts` | Shared semantics for identity, versions, issued scope, execution state, schedule, report/verification summaries, daily flags, next owner, pagination and aggregates. Frontend types mirror backend wire shapes. |
| `VendorExecutionState` | One current projection per existing assignment ID. Persist workflow version, current execution round/version, acknowledgement, schedule revision, report/submission/verification pointers, hold state and reporting eligibility date. Keep existing assignment Client-review status distinct. |
| `VendorExecutionEvent` | Append-only typed events for acknowledgement, reports/corrections, schedule proposals/decisions, hold/resume and evidence exemption. Include exact lineage, actor, request digest, expected/resulting version, server timestamp/local date and applicable round/evidence IDs. Unique assignment/command idempotency; indexed paginated history. |
| `VendorExecutionReview` | Immutable completion submission and one CAS-protected site decision for each execution round. References exact submitted report/version/evidence and Site Manager identity. Decision requires current project ownership. |
| `ProjectExecutionPolicy` | Versioned timezone/local-time policy and effective date, preserving prior revisions. Defaults Asia/Kolkata, 09:00/18:00/19:00, every calendar day. Store policy revision with each obligation. |
| `VendorDailyObligation` | Assignment/local reporting date, policy occurrence, frozen due instant, eligible/exempt state, first qualifying report, on-time/late/missed outcome and escalation resolution. No retrospective clearing of a missed cutoff. |
| `VendorAccessIntent` | Stable order/revision/vendor key, authentic trigger/source, account/setup/delivery state, lease/retry metadata and safe failure reason. This business intent is distinct from an invitation or an email job. |
| Invitation authority extension | Optional tagged work-order source on existing invitation records; absence retains manual Super Admin semantics. Source is constructed server-side, valid only for the bound vendor and supported by current issued work. Never accept it from a general public create payload. |
| `ExecutionNotification` / delivery record | Recipient/project/kind/date or event key, scoped assignment references, read state, delivery status, lease and bounded attempts. Persist eligibility/state separately from external delivery. |
| `ExecutionChangeEvent` | Durable event ID, project/vendor/assignment IDs and changed version/type. No private report text or financial data in stream payload. Commit with the mutation and fetch authorized snapshots after invalidation. |

New execution persistence follows the existing direct-Mongoose vendor-work boundary. Invitation changes keep both `repositories/memory.ts` and `repositories/mongo.ts` aligned. Do not move all legacy persistence to a new generic repository.

### Read and command families

- Retain `/vendor/work` and assignment detail as vendor entry points. Add explicit execution commands under `/vendor/work/:assignmentId/execution` for acknowledgement, schedule proposal, daily report and completion submission. Reconcile legacy progress/submit endpoints so they cannot bypass journaling or verification for the new workflow.
- Add `/projects/:projectId/execution` for internal paginated tracker/summary and assignment history, schedule confirmation, holds/resume, evidence exemption, verification decision and project reporting policy. Separate operation permissions for reading, scheduling, site verification and policy management.
- Add `/execution/projects` for the scoped staff portfolio; `/execution/notifications` and acknowledge/read command; `/execution/events` for an authenticated recipient/project-scoped stream. Query filters must narrow an already authorized result set.
- Add a project/order-scoped access-status/read and retry command. Retry revalidates the original issued revision, vendor binding, delivery preflight and actor permission; it is not a general invitation-create endpoint.
- Parent finalizes exact route names, Zod request/response shapes, query keys, error codes and operation registry entries before writers consume them. Commands use expected version/idempotency key; reviews include exact submission ID/version. Pagination uses the established bounded limit/offset pattern with deterministic ordering.
- Internal reads return `allowedActions` alongside authoritative state for presentation, but every mutation checks authorization again. Client-facing routes retain dedicated review projections that omit daily staff journals/escalations.
- Execution frontend query keys are identity-scoped, with project/list/detail/portfolio/notification branches. Define one invalidation helper covering these and legacy work/completion keys. Version-aware refresh cannot overwrite newer cache data or an unsaved form.

## Tasks and dependency order

Only one parent task is in progress at a time. Child slices inside that task may run concurrently where the ownership table allows it. All tasks below remain pending until task-plan approval and mode selection.

### T0. Establish baseline and inspect integration risks

Owner: parent; in approved Mode A, bounded read-only analysis may be delegated.

- Capture dirty paths and target diffs; reconcile any new user changes without overwriting them.
- Trace all three issuance hooks, cancellation/amendment paths, invitation issuer validation/acceptance, project completion fences, Site Manager assignment and Program Manager scope.
- Confirm approved Configuration/Main Line IDs can be resolved through issued source lineage; represent unresolved lineage explicitly.
- Inspect existing focus suites and establish baseline results for invitation, vendor-work and site-completion behavior. Do not change tests merely to remove existing failures.
- Confirm local Mongo replica-set tooling, supported email test transports and browser QA setup. Read applicable UI/Playwright skills before their implementation/QA stages; do not install dependencies without a concrete need.
- Record existing pending/accepted review compatibility cases and primary risks in this plan's delivery log during execution.

Acceptance: actionable evidence for AC1–AC12; current ownership map and baseline captured. No live credentials/contact data or external transport required.

### T1. Establish the shared contract and authorization foundation

Owner: parent. Depends on T0.

- Implement the common execution DTO/domain enums, validation shapes, source-reference structure, CAS/idempotency rules, transaction-aware change-event append API and frontend API/query-key contract.
- Implement central project/vendor scoping using current active identity, `programManagerId`, assigned site/procurement tasks and operation-specific Super Admin policy.
- Settle persisted workflow-version/legacy compatibility rules. Reads do not initialize records; authorized setup/issue writes do. Legacy pending reviews remain actionable; a changes-requested next round enters the new verification flow.
- Add canonical route operations and frontend authorization contract entries without granting broad chat, staff invitations, financial management or Client journal access.
- Prepare a read-only compatibility/index inventory with counts of open, pending review, accepted, missing source, missing contact/manager and setup-required assignments. Do not run a write migration or production command.
- Publish exact exported types/service signatures to all implementation owners before parallel writes begin.

Acceptance: AC4, AC8, AC10 contract tests, asymmetric role/project denial cases and memory/Mongo invitation contract review. Shared source changes remain parent-owned thereafter.

### T2. Implement secure onboarding, execution records and UI against the contract

Parent task with three non-overlapping slices. Depends on T1.

**T2A: onboarding and invitation authority, identity owner**

- Implement `VendorAccessIntent` and vendor-only automatic setup service/dispatcher with current issued-work authority. Extend existing invitation service/model/domain/repository contracts and acceptance checks while preserving manual Super Admin behavior.
- Preflight before tokens/invitations/invitation audit/email jobs; distinguish disabled capability from failure after an enabled send attempt. Persist safe status on the already-issued business intent.
- Handle active account, same-vendor pending invitation, conflicting email/role/vendor, inactive/archived identities, invalid mobile/email and concurrent activation without rebinding users.
- Use leased retries, recipient cooldown and safe token-generation recovery. Reuse configured transports for new-work messages and setup; never persist plaintext token payloads or send in a transaction. Preserve development identity restrictions.
- Provide transactional intent-creation and source-validation hooks for parent integration, plus access-status and authorized retry service methods.
- Test no-write disabled preflight, rollback, all identity collision cases, multiple orders for one vendor, accept/resend races, cancelled sources and post-provider-acceptance recovery.

Acceptance: AC1–AC3, AC10, AC12.

**T2B: assignment execution and verification, execution owner**

- Implement state/event/review models, indexes and services: acknowledgements, schedule proposals/confirmations, original/current deadlines, reports/corrections, blockers, holds/resume, exemptions, submissions and Site Manager decisions.
- Maintain latest projection plus append-only history; enforce current order/source/round and expected versions. Same request replay is safe; conflicting payload replay fails.
- Implement backend-derived eligible reporting start, next owner, original/current lateness and verified/current assignment counts. Preserve no-progress reports as valid daily updates.
- Implement scoped paginated assignment/history/project/portfolio projections with current vendor labels and issued quantity/UOM. Counts cover the filtered population, not just a loaded page.
- Provide transaction-aware guards and event hooks for legacy progress/upload/submit/Client decision/site completion integration. Acknowledgement and execution history count as activity for amendment reconciliation.
- Test split vendor/room/order assignments, evidence ownership, correction rules, field bounds, stale decisions, schedule changes and no verification by another role/user.

Acceptance: AC4–AC8, AC10, AC11.

**T2C: vendor and staff views, frontend owner**

- Evolve `VendorWorkPage` into compact assigned-work, commitment, daily-report and completion flows. Preserve approved order viewing and show distinct reported/verified/accepted state.
- Implement `features/execution` project tracker, portfolio, reusable timeline/detail panel and staff verification/schedule/hold/policy forms against T1 API contracts. Replace internal progress rendering through `VendorWorkProgressPanel` rather than adding a duplicate tracker.
- Show specific access/setup blockers, authoritative counts and daily flags, loading/error/empty states and preserved draft/conflict handling. Render issued quantities/UOM without recalculation.
- Preserve current Client review presentation; do not show staff-only daily comments in Client-facing components.
- Add focused rendered interaction/accessibility tests using typed fixture responses from the shared contract. Do not finalize transport/navigation assumptions locally; parent owns the app shell/router/query contract.

Acceptance: AC4, AC5, AC7, AC10, AC11; live transport completed in T3/T4.

### T3. Integrate all lifecycle paths and implement scheduling/live delivery

Depends on T2A/T2B service contracts; UI continuation may run in parallel on its owned files.

**Parent integration**

- Compose common issuance hooks in `app.ts`; ensure direct order approval, project request approval and manual/automatic basket issue atomically create assignment/execution/access records. Hook context includes actual trigger actor and approved revision; do not forge a Super Admin identity.
- Integrate legacy `vendor-work.service.ts` mutations with reports/submission guards and event append. Preserve Client review responses and explicit grandfathering. Add report/evidence checks to existing write endpoints so a direct API call cannot bypass the new UI.
- Integrate `site-completion.service.ts`, `site-completion-progress.ts`, `site-completion-fence.ts` and `project-completion.service.ts`: project-level 100% does not bulk-verify new workflow lines; exact current site decisions gate Client submission and closure. Preserve current order/Client review fences.
- Ensure Client rejection invalidates applicable verification for the next execution round and that pending/accepted existing rounds keep their immutable snapshots.
- Add routes, OpenAPI, audit action declarations and authorization inventory tests for all new commands and reads. Reconcile source/assignment changes and cancellation with retry, stream and reminder eligibility.

**Delivery owner**

- Implement project policy revisions, daily obligation storage, deterministic timezone clock functions and a bounded scheduler. Freeze original cutoffs; derive first full reporting day and hold/access/setup exemptions.
- Implement 09:00 per-vendor/project reminder, 18:00 saved reporting outcome and 19:00 per-staff/project exception digest. Include individual Main Line statuses; no one-email-per-line flood.
- Recheck recipient/project/vendor access before send. Suppress invalid recipients and surface staff ownership/access failures. Persist notification/read state independently from resolution of the underlying work.
- Add leases, unique semantic keys, multi-worker recovery, bounded catch-up, limited attempts and visible last-tick/failure state. Recover missed outcomes without sending historical email storms.
- Implement committed event subscription via Mongo change streams, authenticated execution SSE and periodic recovery. Revalidate each delivery, bound buffers/connections and close on access loss. No event leaks private report or finance payloads.
- Provide lifecycle start/stop hooks and mailer injection to the parent. Follow existing SMTP/SendGrid transport configuration without coupling execution to chat authorization.
- Fake-clock/replica-set tests cover midnight, time-zone policy changes, duplicate workers, report/deadline races, late reports, review aging, holds/resume, restarted jobs and stale leases.

Acceptance: AC1, AC3, AC6–AC10, AC12. No scheduler or sender runs against a real account during verification.

### T4. Integrate navigation, notifications and live UI

Owner: parent for app-level paths; frontend owner for feature components. Depends on T3 API/service integration and T2C.

- Register `/execution` and project execution routes with permissions/presentation roles; make the existing Program Manager role land on its scoped execution portfolio. Keep other roles' existing destinations and navigation intact, adding only applicable execution entry points.
- Add deep links from issued work orders and internal project workflows. Wire access status and retry feedback in the existing Procurement/Super Admin work-order surface.
- Implement identity-scoped execution stream client/provider and cache invalidation. Healthy committed updates refresh other browsers within the target; reconnect refetches all relevant projections.
- Implement visible-only 15-second fallback polling, honest live/reconnecting/last-refreshed labels, abort/cleanup, revocation cache clearing and protection for unsaved forms/out-of-order responses.
- Integrate execution notifications into the existing shell notification experience as a separate typed source. Preserve chat behavior; the bell/provider must work for vendor/Program Manager execution permissions even without `chat.read`. Notification read status does not resolve a work exception.
- Add compact execution summary/exception entry to Super Admin and assigned staff views; verify portfolio totals and drilldowns use the same authorized backend source.
- Wire scheduler/dispatcher rollout flags and orderly shutdown in `app.ts`/`server.ts`/environment config. Disabling delivery cannot disable verification enforcement already attached to work.

Acceptance: AC9–AC12 plus all route/navigation and chat-notification regression checks.

### T5. Review integrity and resolve findings

Owner: `integrity_reviewer` in Mode A, parent inline in Mode B. Depends on all product writers finishing.

- Inspect the integrated diff, not just agent reports. Review identity authority, source lineage, shared Main Line splits, role/project boundaries, Client history, completion bypasses, cutoff/report races, token/delivery leases, event ordering and finance preservation.
- Confirm no live side effects on startup/deployment; preexisting issued orders receive no invitation blast. Verify exact compatibility handling and read-only inventory output redaction.
- Confirm no bare HTTP endpoint or retained legacy command bypasses new verification/journaling. Verify same authorization on media, retry and stream paths.
- Parent assigns bounded fixes to the existing file owner, reconciles them, then re-runs affected checks. Do not run final verification while writers are active.

Acceptance: no unresolved material correctness/security/history issues; findings and fixes recorded against AC1–AC12.

### T6. Run integrated verification and rendered multi-session QA

Owner: `verification_runner` in Mode A; parent inline in Mode B. Depends on T5 fixes completed.

- Run focused behavior suites, transactional Mongo suites, cross-cutting auth/route/docs tests and frontend interaction tests below. Then run both workspaces' typecheck/full test/build on the integrated worktree.
- Run real-browser QA with separate local vendor, Site Manager, Program Manager and Super Admin sessions against isolated test data and fake mail. Use at least two projects/two vendors and one split Main Line. Verify visibility, permissions, progress update latency, completion review, reminders and retry feedback.
- Test 1440px desktop, 768px tablet and 390px mobile, plus 320px overflow for key forms. Check focus, keyboard, error recovery, accessible names, responsive lists/panels, no console/API errors and honest disconnected state. Use generic local identities and redact private information from artifacts.
- Exercise cross-process change propagation independently of a single server's in-memory wakeup; test revoked/reassigned access while subscribed. Record timing evidence for the healthy two-second target and the visible 15-second fallback.
- Record failing baseline checks separately from new regressions. Address regressions, then repeat only affected checks unless the fix changes a shared contract.
- Run final diff/hygiene check and inspect changed files. Store temporary QA output only under ignored `tmp/vendor-execution-qa/` or `/tmp/lisno-vendor-execution-qa/`; do not stage runtime artifacts.

Acceptance: AC1–AC12 mapped to exact passing evidence or explicitly documented limitation. Do not call partial verification complete.

### T7. Handoff and production enablement notes

Owner: parent. Depends on T6.

- Update this plan's delivery record with actual files, principal decisions, dependencies, commands/results, unrun checks, artifacts and limitations.
- Document required additive indexes, read-only preflight results, new rollout flags, fake/local versus production mail behavior, scheduler health and rollback constraints. No live migration/index build/deployment is run under this implementation authorization.
- Explain where each role finds assigned work/tracker, how Site Manager verification and Client acceptance differ, and the configured daily schedule.
- Report that no real email, production mutation, deployment, commit or push occurred unless separately and explicitly authorized later.

## Ownership and safe parallel execution

Execution mode A was selected by the user. use native subagents within the four-slot limit (parent plus at most three active children). If B is chosen, the parent executes the same tasks sequentially without implementation subagents.

| Owner | Exclusive write area | Must not edit concurrently |
| --- | --- | --- |
| Parent | Shared contracts/domain authorization and route operations; `app.ts`, `server.ts`, environment/audit inventories; existing issuance, vendor-work, site/project completion integration; backend existing route/OpenAPI inventory integration; frontend API contract/query keys, `app/router.tsx`, `routeRegistry.ts`, `routePaths.ts`, providers, app shell/navigation and notification composition; spec/plan records | Delegated feature modules, invitation repositories or worker-owned tests. Receive a patch request when another owner needs these files. |
| Identity owner | `models/UserInvitation.ts`, `domain/user-invitations.ts`, `services/user-invitation.service.ts`, repository invitation shapes/adapters in `types.ts`, `memory.ts`, `mongo.ts`; new vendor access-intent/onboarding modules and related tests/mail templates | Shared app/server/authorization and execution state/completion services. Freeze repository exports before other workers consume them. |
| Execution owner | New vendor execution domain/service/state/event/review modules, scoped query projections, policy-free eligibility functions and related tests | Existing vendor-work/site-completion/issuance integration and identity files. Export transaction-aware hooks for parent. |
| Delivery owner | New reporting-policy/obligation/scheduler/notification/delivery/change-stream modules and SMTP/SendGrid execution mail adapters; focused tests | Access-intent invitation dispatcher, shared contracts, app/server lifecycle, existing chat services and parent append-event integration. |
| Frontend owner | `features/vendor` work UI; new execution tracker/detail/portfolio forms and CSS/tests excluding parent-owned API/query contract; `features/workflow/VendorWorkProgressPanel` and related styling/tests | App router/registry/providers, auth contract, global notification composition and backend files. |
| Reviewer / verifier | Read-only review and checks; ignored verification outputs only | Product source fixes; return findings to parent for ownership assignment. |

Suggested waves after T1: T2A identity + T2B execution + T2C frontend in parallel; then delivery starts as a backend slot frees and stable execution interfaces are available while parent integrates existing services. Frontend can continue against settled contracts. T5 review and T6 final verification are sequential after writers finish.

Every writer receives one bounded deliverable, explicit paths, relevant invariants and this instruction: **You are not alone in the codebase. Do not revert others' changes; preserve the initial dirty set and adapt to integrated changes. Request ownership before editing a shared or another worker's file.** Contract discoveries go to the parent immediately; no local fallback may silently change source-of-truth, permissions or completion policy.

## Verification commands and traceability

Run commands in their respective workspace. Exact new test names are planned below; adapt only filenames to actual created modules and record final commands.

| Area | Focused checks | Criteria |
| --- | --- | --- |
| Onboarding and invitation security | Existing `user-invitations.test.ts`, `user-invitation-repository.test.ts`, `user-invitation-models.test.ts`, `user-invitations-mongo.replica-set.test.ts`; new `vendor-work-onboarding.test.ts` and replica-set counterpart | AC1–AC3, AC10, AC12 |
| All issuance paths | Existing `project-purchase-order.replica-set.test.ts`, `project-purchase-order-request.replica-set.test.ts`, `project-purchase-order-basket-issue.replica-set.test.ts` | AC1, AC4, AC8 |
| Reports and verification | Existing `vendor-work.replica-set.test.ts`, `site-completion-progress.test.ts`, `project-completion-configured.test.ts`; new `vendor-execution.test.ts` and `vendor-execution.replica-set.test.ts` | AC4, AC5, AC7, AC8 |
| Daily scheduling and delivery | New `vendor-execution-schedule.test.ts`, `vendor-execution-reminders.replica-set.test.ts`, `vendor-execution-mailer.test.ts` | AC3, AC6, AC12 |
| Live updates and visibility | New `vendor-execution-stream.test.ts`, `vendor-execution-events.replica-set.test.ts`; rendered execution stream/provider tests and two-server propagation test | AC9, AC10, AC12 |
| Cross-cutting contracts | Existing `authorization-policy.test.ts`, `frontend-authorization-contract.test.ts`, `route-operation-registry.test.ts`, `api-docs.test.ts`, `server.test.ts`, invitation rate-limit and notification regressions | AC2, AC8, AC10, AC12 |
| Frontend behavior | Existing vendor, workflow, site completion and Client review tests; new execution tracker/portfolio/policy/verification/detail tests; router/navigation/notification tests | AC4, AC5, AC7–AC11 |

Backend full lane:

```sh
cd backend
npm run typecheck
npm test
npm run build
```

Frontend full lane:

```sh
cd frontend
npm run typecheck
npm test
npm run build
```

Focused commands use `npm test -- tests/<file>.test.ts` in backend and `npm test -- src/<path>.test.tsx` in frontend. Mongo transactional tests must actually run on a replica set, not silently skip. Use existing test helpers and injected clocks/mail transports. No real invitation link or production email address belongs in fixtures/output.

Final hygiene: `git diff --check`, `git status --short`, and review the complete diff including new files. No lint claim: neither workspace has a lint script. OCR is out of scope and its tests need not run.

## Delivery record

- Specification: approved by the user on 2026-10-08.
- Task plan: approved by the user on 2026-10-08.
- Execution mode: A, parallel sub-agents, selected on 2026-10-08.
- T0/T1: complete. Contracts, initial clean product baseline, source/authorization/completion audits recorded.
- T2: complete. Core execution, vendor onboarding, and feature UI implemented.
- T3: complete. All issuance hooks, completion guards, policy/obligations/digests, live delivery and lifecycle wiring integrated.
- T4: complete. Staff navigation, vendor/manager screens, independent execution notifications, access retry and Super Admin delivery status integrated.
- T5: complete. Independent integrated integrity review found five P2 defects; all were fixed and re-reviewed without further confirmed findings. Fixes cover first eligible access/acknowledgement clock, history next action/dates, historical hold/resume obligations, exhausted uncertain email lease recovery, and current account/readiness access status. Reads and settlement share the immutable hold-history check.
- T6: complete. Integrated checks, baseline reconciliation and actual two-process browser workflow/role/responsive verification finished. Feature regressions are resolved; full suites are not green due to the documented baseline failures.
- T7: complete. Rollout limits, required flags, evidence, affected areas and remaining operational risks recorded. Temporary QA services stopped; no external action performed.
- Focused evidence (not final integration): execution core replica set 11 passed; onboarding 8 memory + 14 Mongo passed; existing invitation Mongo 32 passed; invitation model/repository 65 passed. Frontend tracker 15 tests passed; stream/site-completion 7 passed. Backend/frontend typechecks passed before remaining integration writes.
- Invitation HTTP suite rerun on 2026-10-09: 67/67 passed; earlier boundary failure did not reproduce. Contract/auth/docs suites passed; server index readiness updated and 18/18 passed. Full integrated tests/builds have not yet run.
- External actions: none. No real mail, migration/backfill, production mutation, deployment, staging, commit or push.
- Remaining operational limits: production email delivery, production topology/latency, live preflight/index readiness and large-project load were not verified. Local identity/concurrency, legacy completion, multi-process SSE and scheduler recovery checks passed; no unresolved feature defect was identified by the completed reviews.


## Rollout and operations notes

- `VENDOR_ACCESS_DELIVERY_ENABLED=true` enables queued work-order setup/new-work email dispatch. `EXECUTION_REMINDERS_ENABLED=true` enables daily obligation processing and reminder/escalation dispatch. Both default to `false` for controlled rollout. Verification enforcement and authorized reads remain active independently.
- Configure the existing validated SMTP or SendGrid transport. No new provider credentials or dependency are introduced. Disabled mail creates no invitation credential or invitation email job; independently issued access intents remain available for staff attention/retry.
- Super Admin's `/execution` overview displays invitation/reminder enablement, last scheduler success, queued/failed email counts and scheduler failure state. Procurement and Super Admin can inspect and retry project access intents. Vendor access is `/vendor`; staff project detail is `/projects/:projectId/execution`.
- Startup registers the new access, execution, reporting policy, obligation, notification/membership, lease and change-event indexes through the existing application index boundary. No production index build or migration was executed during development.
- `vendorExecutionInventory()` produces counts only. Run it read-only with automatic index creation disabled against an explicitly selected environment before rollout; no production inventory was run here. Existing open work needs explicit tracking setup and an agreed schedule. Existing pending Client reviews and accepted history remain intact. No invitation backfill is triggered by enabling the services.
- Default timezone/schedule: Asia/Kolkata, 09:00 reminder, 18:00 deadline, 19:00 escalation. Policy revisions apply on future full reporting days. Frozen daily deadlines retain their original policy. For DST custom zones, nonexistent local times advance through the gap; ambiguous times use the earlier occurrence.
- Stop new delivery by setting the corresponding flags false and restarting through the normal deployment procedure. Preserve persisted records and current verification enforcement; do not roll back to code that bypasses verification after tracked work has started.
- SMTP/SendGrid recovery is at-least-once after uncertain provider acceptance. Leases prevent immediate duplicates and retain one usable invitation token generation, but providers do not offer an idempotent-send guarantee.
- Local checks use fake mail and ephemeral replica sets. Production deployment, real email, data migration/backfill, commits and pushes are outside this implementation's authorization and were not performed.

### Integrated verification checkpoint (2026-10-09)

- Backend `npm test -- tests/vendor-work-onboarding.replica-set.test.ts tests/vendor-execution.replica-set.test.ts tests/vendor-execution-delivery.replica-set.test.ts`: 56/56 passed (16 onboarding, 14 core, 26 delivery). Includes regression coverage for all five final-review findings and hold/resume reads before a scheduler tick.
- Frontend `npm test -- src/features/execution/ExecutionWorkspace.test.tsx`: 6/6 passed, including blocker next action and committed date history.
- Backend and frontend `npm run typecheck` and `npm run build`: passed. Frontend build retains a large-chunk warning; no dependency or lockfile changes.
- Full suites use `npm test -- --maxWorkers=2` to bound local test load. Initial sandboxed backend attempt could not bind replica-set sockets (`EPERM`); stopped and rerun with authorized local socket access. Logs: `/tmp/lisno-execution-backend-full-authorized.log`, `/tmp/lisno-execution-frontend-full.log`, and `/tmp/lisno-execution-{backend,frontend}-build.log`.

### Browser integration and full-suite checkpoint

- Actual vendor browser exposed staff chat polling without `chat.read`. `ChatScheduleProvider` and `DailyCriticalTasksPrompt` now require the canonical permission, including explicit refresh. The backend permissions are unchanged; no vendor chat grant was added. Independent reviewer found no regression. Five shell permission tests passed.
- Full frontend run: 288 files, 4,398 passed and 35 failed. Baseline comparison is in progress. Feature-related stale contract assertions, new execution mock reads and old project-level inferred verification expectations were updated to the approved behavior. The related integrated run (`npm test -- src/api/authorization-contract.test.ts src/features/workflow/OperationalTaskQueue.test.tsx src/features/messages/DailyCriticalTasksPrompt.test.tsx src/app/router.test.tsx src/components/layout/navigation.test.tsx src/features/execution src/features/vendor/VendorWorkPage.test.tsx src/features/workflow/SiteCompletionPanel.test.tsx src/features/workflow/VendorWorkProgressPanel.test.tsx src/features/notifications/ExecutionNotifications.test.tsx`) passed 287/287 across 12 files. A final fixture timing assertion awaits its independent project-status query rather than assuming simultaneous loads; OperationalTaskQueue rerun passed 8/8.
- Enterprise transport regression: 61/63 passed; only the two preexisting missing `basket-requests` synthetic handlers remain. Both newly added execution reads now pass. Shell plus enterprise combined: 66 passed, 2 baseline failures.
- Final frontend build passed, including TypeScript, after the shell changes; retained existing large-bundle warning. Log `/tmp/lisno-execution-frontend-build-final.log`.
- Full backend run with authorized local sockets: 239 files, 4,829 passed and 17 failed. Isolated untouched-HEAD baseline comparison and focused timing-failure reruns are in progress. Log `/tmp/lisno-execution-backend-full-authorized.log`.
- Isolated baseline files were exported from Git HEAD into `/tmp/lisno-execution-baseline`; only installed dependency directories were linked. Production/runtime environment files were not copied. Baseline runs use their own source and test configuration.

### Baseline reconciliation (independent verifier)

- Backend full-suite classification: all 16 assertion failures reproduce with the same names/assertion summaries on untouched HEAD. They concern existing Configuration, lead/full-journey snapshots and recovered purchase-order-request source expectations. The 17th failure was a loaded-run timeout in `project-purchase-order.replica-set.test.ts`; the unchanged current test passed on focused rerun, 19/19 file tests (timeout case 785 ms).
- Frontend full-suite classification: 27 assertion failures reproduce on untouched HEAD. Six feature-related expectation/mock gaps were corrected and passed the integrated regressions (three authorization inventory assertions, two execution route fixtures and one old project-100%-implies-verification assertion). Two calculator timeout failures did not reproduce: current `KnowledgePmcCalculationSimulator.test.tsx` plus `KnowledgeSubVendorCalculationSimulator.test.tsx` passed 146/146.
- Full-suite status is **not green** because of those independently reproduced baseline failures. No unrelated Configuration, lead, password-reset, accessibility or designer behavior was changed to suppress them.
- Baseline logs: `/tmp/lisno-execution-baseline-backend-wave1-authorized.log`, `-backend-wave2-authorized.log`, `-backend-wave4-authorized.log`, and `/tmp/lisno-execution-baseline-frontend-wave2.log`. Initial baseline attempt without the tracked `shared/` tree was discarded; the valid rerun included unchanged HEAD `shared/` sources.
- Current focused rerun logs: `/tmp/lisno-execution-backend-po-rerun.log`, `/tmp/lisno-execution-frontend-calculator-rerun.log`, `/tmp/lisno-execution-frontend-integrated.log`, `/tmp/lisno-execution-shell-regression.log` and `/tmp/lisno-execution-shell-types-regression.log`. The latter recorded a query-load timing assertion subsequently corrected to await the independent request; the final task-queue-only rerun passed 8/8.

### Live browser evidence (in progress)

- Vendor blocked report saved through API process A; assigned Site Manager on API process B rendered the committed report 116 ms after the POST response (198 ms from click). Both independent browsers displayed Live updates. The saved staff timeline included the blocker reason and required next action. This meets the two-second local connected acceptance target.
- Completion verification, draft preservation and responsive/role-scope browser checks are still running.

### Final visual and timeline corrections

- Parent inspected actual desktop and mobile screenshots. A visually hidden table heading escaped its scroll container and widened the 390 px document to 655 px. Positioning `.execution__table-wrap` contains that heading; browser recheck confirms document/body widths exactly 390 px and 320 px. No global overflow clipping was introduced. Corrected artifacts: `/tmp/lisno-vendor-execution-qa/vendor-verified-390-fixed.png`, `vendor-verified-320-fixed.png`.
- Same-millisecond execution history previously used random event IDs as its tie-breaker. Reads and the compound history index now order by timestamp, committed version, then ID. A regression checks equal-time events across two pagination pages. Final backend `npm test -- tests/vendor-execution.replica-set.test.ts tests/server.test.ts`: 32/32 passed with authorized replica-set sockets. Log `/tmp/lisno-execution-history-final-authorized.log`; initial sandbox EPERM attempt excluded. Final backend build passed, log `/tmp/lisno-execution-backend-build-final.log`.
- Final frontend build passed after the one-line containment correction, log `/tmp/lisno-execution-frontend-build-final.log`.
- Actual vendor-to-Site-Manager completion: a 100% vendor report leaves verified count zero; explicit submission creates one awaiting-verification item; assigned Site Manager verification produces verified count one and Client accepted zero. Vendor can then send that verified work to Client. Super Admin and Program Manager verification attempts return 403; wrong Site Manager and other vendor receive 404.
- Actual browser offline/recovery shows the offline warning and returns to Live updates. Aborting only SSE displays the 15-second fallback; measured GET interval 15,003 ms, then reconnect restores Live updates. Screenshots: `vendor-offline-390.png`, `vendor-fallback-390.png` in the same temporary QA directory.
- Automated axe WCAG 2A/2AA/2.1AA check on vendor detail found zero violations. Staff responsive/keyboard verification is completing independently.

### Staff browser results and interpretation

- Program Manager Alpha sees only project-a; Program Manager Beta sees only project-b; Super Admin sees both. Direct wrong-project navigation returns 404 with a generic unavailable message and no assignment data. Positive authorized PM/Super Admin console checks recorded zero errors and zero warnings; expected denial requests were isolated.
- Super Admin portfolio, Program Manager tracker and detail drawer were checked at 1440, 768, 390 and 320 px. Document/body widths equal the viewport in all cases; wide tables scroll within their own focusable region. Keyboard table scrolling reached scrollLeft 543.5 with a visible 3 px focus ring. Detail opens with Close focused, traps focus and restores the originating row button on Escape.
- Fourteen additional axe scans of staff main/dialog content found zero violations. The verifier inspected sixteen staff screenshots in `/tmp/lisno-vendor-execution-qa/`, including `sa-portfolio-{1440,768,390,320}.png`, `pm-tracker-{1440,768,390,320}.png`, `pm-detail-{1440,768,390,320}.png`, `pm-tracker-320-keyboard.png`, `sa-detail-390.png`, `sa-reporting-policy-390.png`, and `pm-beta-denied-alpha.png`. Parent also inspected desktop/mobile portfolio and vendor detail images.
- Count semantics reviewed: **Needs setup** counts legacy open assignments with no execution tracking record (`tracking=setup_required`). A newly issued assignment already has tracking and can separately require vendor acknowledgement or schedule confirmation; those requirements remain visible as workflow flags/statuses, next actor and open work. The observed zero setup count for new pending assignments is therefore intentional, not a missing record.
- Actual history after restarting only the second test API (preserving the database) is newest-first even for equal timestamps: Verify, Submit, Report, Exempt evidence, prior Report, Confirm schedule, Propose schedule, Acknowledge, Issued. Artifact `site-history-final-1440.png`.

### Acceptance evidence at handoff

| Criteria | Final evidence |
| --- | --- |
| AC1–AC3 | All issuance hooks integrated; new integration replica set 4/4, onboarding 8 memory + 16 Mongo, invitation HTTP 67 and invitation Mongo 32 passed. Disabled, retry, identity ambiguity, acceptance and rollback paths covered with fake transports. |
| AC4–AC5 | Core execution replica set 14/14 plus actual unequal split assignments, blocker history, version conflicts and commitment workflow. Equal-time timeline pagination regression passed. |
| AC6 | Delivery replica set 26/26: local time boundaries/DST, activation, holds/resume, cutoffs, leases, disabled accounts, downtime and scoped escalation. |
| AC7–AC8 | Core/integration/vendor-work/Client compatibility checks passed; final purchase-order replica-set rerun 19/19. Actual browser report100%, submission and assigned-Site-Manager decision remain distinct from Client acceptance. |
| AC9 | Separate backend/browser update latency 116 ms after response; SSE-only fallback GET interval 15,003 ms; offline/reconnect, unsaved draft/version handling and cross-process tests. |
| AC10 | Authorization 54/54, route registry 44/44, API docs 52/52 and frontend/backend authorization contract checks passed; actual wrong-role/wrong-project denial confirmed. |
| AC11 | Integrated frontend 287/287; enterprise execution route fixtures passed; desktop/tablet/mobile screenshots, keyboard/focus, axe and role-scope checks. |
| AC12 | Server readiness 18/18, delivery/onboarding failure recovery tests, paused delivery indicators and scoped access retry; no real external delivery attempted. |

Remaining limits: full suites retain 16 backend and 27 frontend independently reproduced baseline assertion failures. All three full-run timeout cases passed focused reruns. Chromium emulation was used; physical devices/Safari, production email deliverability, production multi-instance latency, large-project load and production preflight/index application were not tested or executed. OCR and lint are not applicable (no lint script). No dependencies or lockfiles changed. No deployment, migration/backfill, production mutation, real mail, staging, commit or push.

### Final completion record

- Actual browser workflow finished successfully across independent API processes: acknowledgement, commitment proposal/confirmation, blocked report, 100% report, explicit submission and assigned Site Manager verification. A dirty 100% report survived a staff change, and the stale draft required explicit version review before saving.
- Fresh 31-second vendor and Site Manager sessions recorded zero console errors and zero failed API responses. Final workflow script results are `/tmp/lisno-vendor-execution-qa/workflow-results.json`; named `role-denials.js`, `fallback-check.js`, `fresh-vendor-check.js` and `fresh-site-check.js` invocations all exited zero and are recorded there.
- Both reviewers closed their named browsers; harness owner stopped its two API processes, Vite servers and ephemeral Mongo replica. Final local port check found no listeners for that fixture. No production service was stopped.
- Final repository `git diff --check` passed; status contains only the expected implementation/spec/plan/test changes. Nothing staged or committed. Baseline report and temporary test/visual evidence remain under `/tmp` for review.
- Production enablement is a separate action: validate the existing mail transport and additive indexes, review read-only inventory, then enable `VENDOR_ACCESS_DELIVERY_ENABLED` and `EXECUTION_REMINDERS_ENABLED` in the intended environment. Both remain false by default. This implementation did not deploy or send real mail.

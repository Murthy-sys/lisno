# Project Manager workspace

Date: 2026-10-27
Status: Original workspace/consolidation specification and task plan approved; Mode A selected and local implementation verified with documented full-suite limitations. The scoped local assignment-mapping addendum and plan were approved, followed by the target-specific apply response. The five mappings are now applied to local `lisno_demo` and verified through the stored receipt, preserved raw records, real authenticated portfolio and desktop/mobile dashboard. See the task plan's M6–M7 evidence and actual old-token HTTP-check limitation. No production deployment or global role migration was performed. The inventory below records the pre-apply state.

## Local dashboard assignment mapping addendum, 2026-10-27

### Goal and observed data

Show the existing manager's assigned projects on the new dashboard. The configured development database is `lisno_demo` on loopback Mongo port 27017. A native read-only inventory against this exact target completed without collection/index initialization or database writes. Temporary evidence is `/tmp/lisno-pm-dashboard-mapping/manifest.json`, digest `a6491a52aef149784fe48e179aabcfd5bb60fa5aee5b42af8e4df492e80f00ab`; it is diagnostic evidence, not an executable approved manifest.

Verified state:

- Twelve projects exist. Five are active and have a unique valid current Site execution task assigned to `user-site-manager`, an active canonical `site_manager` account. Each of the five has an absent/null `programManagerId`.
- Seven projects have no current manager assignment. Do not assign them automatically.
- No legacy `program_manager` account exists in this target; account-role conversion is unnecessary for this repair.
- Four unsuperseded Site task records reference missing projects and missing estimates. One is completed. They are historical data requiring separate reconciliation, not dashboard projects to recreate or delete.
- The current dashboard uses `GET /api/v1/project-manager/projects`. Its backend candidate query uses `Project.programManagerId`, and runtime assignment classification rejects unsynchronized scalar/task ownership. The frontend renders API results directly; no frontend mapping defect was found.
- The existing full-role migration reports four `PROJECT_MISSING` conflicts and refuses apply. Do not erase conflicts from its manifest or weaken its full-cutover checks.

The exact proposed project scope is:

| Project ID | Existing and proposed owner |
| --- | --- |
| `project-131f45db-bf84-4cb0-986b-856160373280` | `user-site-manager` |
| `project-157c30f3-7954-40fc-a96f-0581361e1797` | `user-site-manager` |
| `project-9a077986-0dcb-49ce-bcdd-0712439317dc` | `user-site-manager` |
| `project-da81b594-f785-44e5-b791-86fa114e093a` | `user-site-manager` |
| `project-fe1604f4-5da6-4986-8f72-cd863ceaff0e` | `user-site-manager` |

### Proposed behavior and boundary

Provide a narrowly scoped, dry-run-first assignment synchronization operation for these already-canonical accounts. Populate each selected project's compatibility owner field from its unique valid current task. Do not choose a different owner, rewrite a task owner, convert roles, create projects/tasks, alter the other seven projects, or modify the four orphan tasks. Keep the general full-role migration blocked by its existing orphan conflicts until they are separately resolved.

The scoped operation must require an explicit target, selected project IDs, stable owner ID, versioned manifest, verified backup reference, run ID and authorized operator. Validate active canonical identity, task/source lineage and frozen-review bindings. Reject owner mismatch, duplicate/current-source ambiguity, a newly missing project, stale versions, new selected-project conflicts or changed relevant outside records. Record the known orphan conflict IDs/fingerprints as preserved out-of-scope evidence; do not represent this operation as a completed global role migration.

Use one replica-set transaction for all five mappings, with authorization/assignment fences, CAS, per-project audit, receipt-based idempotency and guarded rollback. Preserve immutable approvals, task IDs/owners/status, financial data and history. Invalidate the affected manager's session/cache through the established mechanism; version increments must remain monotonic on rollback. Do not modify the frontend's authorization or add a fallback that exposes unsynchronized projects.

Before any real write, prepare and verify a private backup, rehearse the exact operation and rollback on isolated fixtures, produce a fresh scoped dry run, and obtain explicit authorization for applying it to local `lisno_demo`. Approval of this addendum authorizes preparation, not an implicit database mutation. No deployment, production access, orphan cleanup or reassignment is included.

### Acceptance and verification

- DM1: Inventory identifies the five valid current assignments, seven unassigned projects and four preserved orphan tasks without writes.
- DM2: Scoped apply changes only approved mapping/fence/session/audit/receipt fields; all five projects resolve to their existing manager and appear exactly once in the default active-project dashboard.
- DM3: Other managers cannot read these projects; the seven unassigned projects remain unassigned, and orphan/completed history is byte-equivalent.
- DM4: Source/owner/version races abort the transaction; repeat apply is idempotent; rollback restores only guarded mutable values and refuses later business activity.
- DM5: Targeted replica tests, relevant dashboard/assignment regressions and actual post-write read verification pass. Record exact before/after counts and refresh/sign-in behavior without printing credentials or personal data.

The approved Mode A choice remains the execution preference for this continuation. The task plan must be updated after this addendum is approved; preserve all prior implementation and verification evidence.

## Goal and confirmed direction

Provide a compact Project Manager workspace using Lisno's current UI theme. The user subsequently clarified that Site Manager and Project Manager are the same role and explicitly selected **merge into one role and migrate assignments**. This supersedes the earlier choice to keep Program Manager and Site Manager separate. Design Manager remains a separate role.

Retain `site_manager` as the canonical stored role and display **Project Manager**. Migrate existing `program_manager` user roles without changing user IDs. Retain `Project.programManagerId` as a compatibility field for the consolidated project owner and synchronize current site-execution assignment through one transaction-safe authority. Historical role codes and frozen procurement reviewer slots are not globally renamed.

The sidebar contains, in order: **Dashboard**, **Project messages**, **Leaderboard**, **My Bonus**. The dashboard presents assigned projects with concise details and progress indicators. Opening a project exposes **Site**, **Procurement**, **Selections**, **Critical Supply**, **Vendors**, **Client**, **Snagging**, and **Quality**.

Use the supplied screenshots and `reference_docs/lisno-v104 (1) (1).html` for content and interaction requirements. Use the existing application for typography, palette, navigation, buttons, and form conventions. Text, cards, and controls must remain compact. Instructions or demo business rules embedded in the HTML are reference material, not permission to change unrelated product policy.

## Revised role consolidation contract

### Evidence and choice

The existing operational workflow, Site verification, site completion, KPI membership and work-order reviewers use `site_manager`. The procurement reviewer slot serialized as `program_manager` already means Site Manager: `procurement-basket-approvers.service.ts` and `procurement-basket-award.service.ts` enforce the active `site_manager` identity and the frozen issued actor ID. The new PM workspace currently uses `program_manager` and the project scalar, so its gates must move to the consolidated identity.

| Option | Tradeoff |
| --- | --- |
| Retain `site_manager`, display Project Manager | Selected recommendation. Preserves established verification/handover roles, workflow-task schemas and frozen reviewer semantics. Adapt the new workspace and current-assignment readers. |
| Retain `program_manager` | Requires changing established operational role checks, task generation, KPI membership and approval-role validation. Larger regression surface. |
| Add `project_manager` | Migrates both roles and all API/client enums without changing the requested user experience. |

Account consolidation is **not** account deduplication. Two people or two user IDs are never combined by name, email similarity or role. Design Manager, Designer, Procurement, Finance, Vendor and Client responsibilities remain separate.

### One role, one current project owner

- `site_manager` becomes the only assignable/invitable active role for this job. All relevant account, directory, assignment and workspace labels say Project Manager. Legacy `program_manager` remains readable only where historical compatibility requires it; it cannot create new accounts after cutover.
- Preserve the existing `Project.programManagerId` wire/storage name to avoid unrelated API churn. It identifies the consolidated owner. A current `site_execution` task, when present, must have that same `assigneeUserId` and canonical `assigneeRole`.
- Both administration assignment paths must use a shared transaction-safe resolver/update boundary with version checks, authorization coordination, audit and live-access invalidation. They cannot independently assign different managers.
- Workflow activation retains its approved-source and stage gates. If no site task exists yet, the consolidated scalar assignment is saved and later task generation uses it. Migration must not manufacture an execution stage merely to make assignments agree.
- Reads, writes, chat membership, evidence and streams use the same resolved current assignment. Missing, conflicting or duplicate current ownership fails closed with an explicit reconciliation state. Superseded tasks are historical, not extra current owners.
- The consolidated manager receives the existing operational responsibilities plus the PM workspace capabilities only for currently assigned projects. They can manage execution, verify vendor work and submit site completion. Client acceptance, Designer approval, Finance authority and frozen issued-reviewer checks remain independent.
- The web landing page is `/execution`, with the four requested sidebar destinations and eight project tabs. Existing `/home` and project deep links remain compatible. Site verification, site completion, work-order approvals and existing reporting controls remain reachable inside project details; removing a separate Site Manager sidebar must not remove these actions.
- Update native mobile role/authorization contracts, labels, route landing and assignment compatibility because those clients share the backend identity. A new native eight-tab PM redesign remains out of scope.
- Existing Site Manager operational KPI, its evidence and its recorded policy remain accessible unchanged. Only new PM-specific composite scoring, cross-role leaderboard comparison and bonus calculations remain unavailable until their policies exist. Do not fabricate a formula because the role label changes.

### Migration inventory and resolution

The existing ordinary role-change responsibility count omits `Project.programManagerId` and `ProjectWorkflowTask` assignments. Therefore this requires a dedicated migration inventory, not a bulk call to the ordinary user editor.

| Current state | Required handling |
| --- | --- |
| Scalar and unique current site task identify the same active user | Retain user ID and assignment; convert role if needed. |
| Only a unique current site task is assigned | Populate the consolidated scalar with that same active user. |
| Only the scalar is assigned | Convert the account role if needed; align an existing unassigned current site task. Do not create a premature task. |
| Different non-null scalar and task owners | Stop and report the project plus both stable IDs. Require a reviewed owner resolution; no automatic winner. |
| Duplicate current tasks, missing/inactive users, invalid roles or incompatible current frozen reviewers | Stop and report the conflict. Do not hide it by widening authorization. |
| Superseded tasks or completed historical decisions | Preserve their IDs, actors, source versions and recorded results. |
| Pending `program_manager` invitations | Unresolved usable invitations block cutover. Their immutable role cannot be rewritten silently. A reviewed resolution may revoke the old invitation; any replacement or external email requires its established explicit workflow. After cutover, legacy-role invitation creation and acceptance fail closed. |

The migration must be dry-run-first, idempotent and reversible. Inventory reads must not initialize collections or synchronize indexes. Produce a conflict report and a versioned change manifest with stable IDs, expected before-values/versions and a digest. Apply must verify a fresh conflict-free manifest, explicit target, backup reference and run ID. Use replica-set transactions, assignment/authorization fences, CAS checks and per-change audit records. Abort on concurrent changes, never partially choose a conflicting owner.

Increment session versions for affected identities and invalidate current role/authorization caches and live connections. Old-role or stale-session tokens must fail. Preserve user credentials and identity IDs. Existing invitation tokens, secrets, client files and private URLs must not appear in reports.

Preserve immutable estimate/design approvals, signed audits, notice/action history, completion decisions, original deadlines, issued procurement revisions and reviewer IDs byte-for-byte. Do not globally replace the string `program_manager`: it is also a historical procurement slot name. A replacement manager cannot inherit another person's recorded signature.

Record protected before-images sufficient for a CAS-guarded rollback. Rollback refuses to overwrite later business activity, creates its own audit trail, and requires the matching application version. Session versions are monotonic: rollback increments them again rather than restoring a before-image value, so old tokens cannot become valid again. Never delete operational history to roll back the UI.

No live database target has been supplied or inspected. Implementation can produce and test inventory/apply/rollback tooling using isolated fixtures. A live apply requires the named target, backup, reviewed conflicts and final dry-run evidence before execution; approval of this specification alone is not authorization to mutate an unspecified database.

### Consolidation acceptance criteria

| ID | Outcome and required verification |
| --- | --- |
| RC1 | One active Project Manager role in backend, web and mobile role/invitation/assignment controls; both prior account cohorts retain their user IDs. |
| RC2 | A single current owner governs all surfaces. Test same-owner, one-sided, unassigned, different-owner, inactive/missing-user, duplicate and superseded-task cases. |
| RC3 | Consolidated manager can perform PM operations and Site verification/handover on own projects; cannot access another project, approve for Client/Designer, or execute payment. |
| RC4 | Old tokens and reassigned actors lose read/write/chat/stream/evidence access. Current permitted sessions recover through sign-in and refreshed authorization. |
| RC5 | Frozen approvals, source artifacts, history and actor IDs are unchanged. Issued reviewer mismatch still blocks a new decision. |
| RC6 | Dry run writes nothing; rerun is idempotent; stale manifest aborts; injected failures roll back; rollback rejects intervening activity. Include replica-set concurrency tests. |
| RC7 | Four web destinations/eight tabs remain compact and responsive; old links, site verification, completion and work-order review remain reachable. Native clients remain contract-compatible. |

The separate task plan must be revised after this specification is approved. The earlier plan remains evidence of the completed workspace slices, but does not yet authorize the new role/data migration.

## Evidence and reference review

Initial worktree: clean (`git status --short` returned no paths). Recheck before future implementation.

The HTML was opened in Chrome in an isolated browser context and Vikram's **Project Manager** role selected. Browser review covered:

| Reference surface | Observed content and behavior |
| --- | --- |
| Dashboard | Four health filters, priority alerts, two project cards, procurement/execution progress, dates, warning counts, optional My KPI panel. At Risk filtering and a priority-alert link into Selections worked. |
| My KPI | On-Time, Quality, Client, Hygiene, overall KPI, estimated bonus. These are demo values. |
| Site | Overall actual versus planned progress; six room groups in the execution project; trade, vendor, blockers, progress, and completion status. The setup project has one room summary. |
| Procurement | Procurement breach, critical unrequested items, delivery ETA, BOQ references, time until trade, Raise action. |
| Selections | Material/site-visit requests, ownership, deadline, blocking impact, acknowledgement, reminders, escalations, completed decision. |
| Critical Supply | Item/vendor timelines with workshop, sample, dispatch, and receipt milestones; PM Sign-off and Notify Designer. |
| Vendors | Assigned vendors, contact/on-site status, attendance/quality/schedule metrics, overdue audits, six notice types, payment-certificate decisions. |
| Client | Portal activity, Send Update, WhatsApp, escalation creation, follow-up, resolution, escalation action. |
| Snagging | Pre-snagging stage, Log Snag, 90% readiness explanation, handover expectations and proposed bonus penalty text. |
| Quality | Expanded all six sections: False Ceiling (7 checks), Carpentry (7), Flooring (6), Electrical (6), Painting (6), Civil (5); 37 checklist controls total and weekly signing. |
| Second project | Reviewed all eight tabs. Several reference tabs have blank bodies when no records exist. Production needs deliberate empty states. |
| Inbox | Inbox/Sent list and message detail, including an SLA alert. This is an email-like demo, not Lisno's existing project chat. |
| Leaderboard | Eight demo employees across roles, ordered by a fixed KPI value. |
| My Profile | Profile/KPI summary. Existing account/profile access can remain outside the four requested sidebar entries. |
| My Bonus | Selecting the sidebar item leaves the PM dashboard rendered. There is no functioning PM bonus page in this reference path. |

Most project action handlers call `alert(...)`; they do not persist work. Open Full Detail was clicked and also only displays a demo alert. Quality checks toggle DOM styling without durable state. The reference cannot establish successful save, approval, notification delivery, or payment behavior.

Repository evidence captured before the original workspace implementation (the role-consolidation findings above reflect the current worktree):

| Area | Current implementation and consequence |
| --- | --- |
| Roles/routing | `frontend/src/api/authorization-contract.ts`, `app/routeRegistry.ts`, `app/routePaths.ts`, and `app/router.tsx`: Program Manager lands at `/execution`; project detail is `/projects/:projectId/execution`. No PM leaderboard/bonus route. |
| Existing PM UI | `features/execution/ExecutionWorkspace.tsx`: portfolio table, assignment tracker, project overview, workflow panel, reporting controls, vendor access. There is no eight-tab PM workspace. |
| Other managers | `features/site-manager/*` was a distinct operational workspace under the original scope. Its responsibilities now join the consolidated Project Manager workspace. `features/manager/ManagerDashboard.tsx` belongs to Design Manager and remains separate. |
| Assignment security | `backend/src/services/vendor-execution-access.ts`: Program Manager project access is bound to `Project.programManagerId`; other projects return a non-disclosing not-found result. |
| Execution data | `features/execution/executionApi.ts` and `backend/src/contracts/vendor-execution.ts`: assignment progress, schedule, original target, report, blockers, verification, current round/version, and allowed actions already exist. Vendor reports, Site Manager verification, and Client acceptance are distinct. |
| Design requirements | `backend/src/domain/design-requirements.ts` and `services/design-requirements.service.ts`: selection and critical requirements already derive from stable approved line IDs/current Configuration. PM acknowledgement and joint operational milestone sign-offs are not existing approval actions. |
| Procurement milestones | `backend/src/models/ProcurementBasketTender.ts` already stores reviewer slots including `program_manager` and `designer`. Extend that lineage where applicable rather than creating unrelated sign-offs. |
| Messages | `backend/src/domain/authorization.ts`: Program Manager lacks chat permissions. `domain/project-chat-membership.ts` does not automatically include `programManagerId`. Adding the menu alone will not grant functional project messages. |
| KPI | `backend/src/services/kpi.service.ts` does not include Program Manager in its operational KPI roles. The existing calculator has explicit component weights and missing-component behavior; the reference's PM scores must not replace it with frontend constants. |
| Bonus/other workflows | Targeted code search found no dedicated PM bonus, team leaderboard, snag register, or PM payment-certificate workflow. These require explicit contracts and persistence, not cosmetic controls. |
| Finance | `services/project-purchase-order-invoice-assessment.service.ts` restricts invoice assessment to Finance Manager. PM certification must remain a separate work-evidence decision. |
| Theme | `frontend/src/styles/global.css`, `styles/role-themes.css`, and shared primitives use Poppins, a sage navigation rail and olive buttons. Older comments and earlier CSS declarations describe superseded palettes; follow effective tokens. |

## Scope and approach

Recommended: a PM-specific presentation and backend aggregation layer that reuse existing execution, design, procurement, chat, notifications, and financial sources. Add narrow persisted operational records for functionality missing from the repository. Preserve old execution deep links and expose existing detailed workflows from the new tabs.

An alternative is a frontend-only reference replica. It is smaller, but cannot provide the requested durable actions, PM messaging access, or reliable performance information. It is not the proposed implementation.

In scope: all four requested navigation destinations, all eight project tabs, functional applicable actions, related scoped backend contracts, responsive/accessibility states, and regression verification. No production data should be populated from the HTML.

Non-goals: account deduplication; replacement of Design Manager; global theme redesign; new 3D/animation; replacement of project chat; procurement tender/PO authority reassignment; changing approved estimates/designs; payroll/payment execution; deployment, unrelated seed/backfill, commits, or unspecified production mutation. Native mobile role/contract compatibility is included for consolidation; a new native PM screen design remains outside scope.

## Navigation and visual specification

- Retain `/execution` as the existing role landing URL; render the PM Dashboard there for canonical `site_manager`, labeled Project Manager. Other roles retain their current execution views.
- Retain `/projects/:projectId/execution`; add URL-addressable tab state. Default to Site. Preserve existing `assignment` deep links by opening the corresponding work detail. Invalid tab values resolve to Site safely.
- Use existing `/project-messages` and project conversation routes. Add role-specific leaderboard/bonus routes to the central registry. Sidebar order and labels must exactly match the request.
- “Project Manager” is the workspace-facing name. Keep serialized role codes, assignment fields, and unrelated administration labels compatible.
- Use existing Poppins tokens. Target page headings 20–22px, section headings 15–16px, project/row titles 13–14px, body 12–13px, and metadata 11–12px. Avoid the reference's unreadably small 6–9px labels.
- Use a warm off-white working canvas derived from existing theme colors, thin borders, olive controls, near-square local panels, and restrained semantic status accents. Keep the shared sage rail. No new gradients, shadows, glass effects, oversized numbers, decorative emoji, Lucide artwork, colored left stripes, or hover motion.
- Reuse Button, Field, PageState/InlineMessage, ContextPanel, and the established custom sidebar icon mechanism. Extend their scoped presentation only where required. Preserve visible focus and disabled/pending states.
- Cards are compact project records in a vertical list, not a three-column feature grid. Use 12–16px content padding and 8–12px gaps. Dense desktop controls may be 32–36px visually; coarse-pointer hit areas remain usable at roughly 44px.
- At narrow widths, stack project metadata and actions; keep tab navigation horizontally scrollable with the selected tab visible. Room/trade data becomes readable stacked rows or a clearly labeled local scroll region. No page-wide overflow at 360px.
- Forms use focused panels/dialogs with labels, validation, pending feedback, and unsaved-change protection. Return focus on close. No essential action depends on hover.

## Dashboard

Header: “Project Manager”, signed-in identity, date, compact Refresh and My KPI controls. My KPI expands inline on demand, rather than dominating the initial view.

Four compact, selectable summary metrics use the user's wording: **Active Projects**, **At Risk**, **Setup**, **On Track**. Active Projects means assigned, non-completed projects; on-hold projects are explicitly marked. At Risk includes critical projects, with critical severity separately visible on project records and alerts. Setup and On Track are mutually exclusive health buckets after risk precedence. Unknown/incomplete health is explicitly reported and never counted as healthy. Completed projects remain accessible through an All/Completed filter.

The backend computes counts over the full authorized dataset before pagination, with clear filter semantics. Priority alerts are ordered by severity and deadline, show the affected project, issue, impact and next action, and link to the correct tab/record. Alerts should be compact and initially bounded with Show all, keeping projects visible.

Each project record shows project/client identification, location or property metadata when available, approved project value when authorized, stage, health label, handover target, concise blocking summary, and **one primary execution progress indicator**. This interprets the user's “just progress indicator” as a lightweight card rather than a miniature dashboard. Procurement progress and detailed vendor metrics belong inside the project. Missing values say “Not set” or “Unavailable”, never zero by default.

Search/filter/page state is reflected in the URL. Returning from a project restores the dashboard context. Opening the project uses a semantic link with a clear accessible name.

## Project workspace and tab behavior

Compact persistent header: All projects, project/client identity, stage/health, available KPI, approved value, and a working Full detail action. Full detail exposes the existing authorized overview, design/procurement documents, workflow history, execution detail, reporting settings, and access controls without bypassing their permissions. The new workspace must retain existing PM capabilities.

### Site

Show overall execution progress and planned progress when a valid schedule exists. Clearly label vendor-reported progress versus verification/Client acceptance; 100% reported does not mean approved. Group work by stable source room/section IDs and trade/package, with vendor, status, blockers, and progress. Unmapped work is explicit rather than matched by room name.

Open the existing execution detail for reporting history and permitted schedule/setup/hold actions. Do not create a “Done” checkbox that skips Site Manager verification or Client approval. Preserve original deadlines and reasoned, audited revisions. Calendar days must not be labeled working days unless the actual working calendar is available.

### Procurement

Show current approved scope, linked requests/orders, undelivered items, critical missing requests, supplier, source BOQ/Main Line, ETA, receipt state, and required-by/trade dates. Missing ETA or trade schedule is explicit. Derive urgency from actual dates rather than the reference's fixed 30-day progress formula.

Raise opens a real request form referencing the approved project line, quantity/unit, needed-by date, and reason. Persist a request to the responsible Procurement owner and expose request status/history. PM raising a request does not award a vendor, issue a PO, change shared Configuration, or approve procurement spend. Deduplicate active requests for the same source requirement. New deliveries and changes refresh dependent project alerts.

### Selections

Reuse the current design-requirement source for applicable material/sample/finish decisions. Add PM operational request/acknowledgement records linked to the requirement and current source revision, including owner, due date, impact, request kind, and history.

Support Raise request, Acknowledge, Remind, and Escalate with durable state and explicit results. PM acknowledgement records awareness; the authorized Client/Designer still owns the underlying decision. Show completed decision and actor/time. Changes to source revision invalidate stale acknowledgements without deleting history. Reminders/escalations target a valid current assignee and are idempotent.

### Critical Supply

Show item/vendor milestones and due dates, with independent PM and Designer sign-offs where the requirement calls for both. Reuse issued procurement milestone reviewer assignments when applicable. Bind records to project, approved scope/issued revision, milestone, actor and source version.

Support PM sign-off with evidence/note, pending Designer state, Notify Designer, missed/overdue indicators, and read-only history. A milestone becomes complete only when all required current-revision sign-offs exist. Preserve missed-deadline history after late completion. Do not apply an invented KPI/bonus penalty from a label in the reference.

### Vendors

Show only project-linked vendors/packages, contact information the PM may access, current work, blockers, notices, audits, and available performance measures. Attendance and physical presence require actual records; missing telemetry is unavailable. Do not reinterpret current vendor rubric categories as the reference's attendance/quality/schedule values.

Support a weekly audit linked to the Quality checklist and notices for Quality warning, Absenteeism, Misbehaviour, PPE violation, Cleaning issue, and Stop work. Capture reason, affected work, evidence when required, actor/time, and resolution. Stop work uses the existing execution hold semantics, including reason/review date, for explicitly selected assignments.

Payment certification has Requested, PM certified, PM rejected, Finance pending, and Paid states as applicable. PM can review supporting work/evidence and certify/reject only when designated for that source milestone. Rejection requires a reason. Certification never creates a payment or marks a vendor paid; Paid requires an actual payout source; a posted cost ledger entry is not proof of payment. Reuse existing reviewer slots and finance workflows wherever present. Absent requests display an empty state.

### Client

Show project-specific portal activity only if backed by authorized activity records. Project chat read state is not a general portal-login timestamp. Missing activity is “No activity recorded”; do not invent engagement scores.

Send update opens the current project conversation with a draft for the PM to review/send. WhatsApp, if a permitted valid contact exists, opens a compose link with the user controlling delivery; otherwise show why it is unavailable. No automated WhatsApp integration or background customer messages are implied.

Provide persisted escalation logging with category, severity, description, owner, next follow-up date and history. Open/Pending can transition to Resolved with a resolution note; Escalate records the next responsible party/reason. A design-change escalation cannot modify an approved estimate or bypass variation approval.

### Snagging

Provide a real snag register grouped/filterable by room, trade, vendor, severity and status. Log snag, attach authenticated evidence, assign owner/deadline, track resolution and verify/reopen with an audit trail. Keep Open, In progress, Resolved, and Verified distinct. Log post-move-in visits against actual events.

At 90% reported execution show readiness for pre-handover review; this is guidance and does not block earlier defect reporting. Open snags must be surfaced to existing completion/handoff decisions. Any added handover gate must use the backend completion transaction and preserve existing review snapshots. Snag verification remains separate from vendor-work verification and Client acceptance, even when the same consolidated manager performs the internal inspections.

The reference's “more than three post-move-in visits = 30% deduction” is an unconfirmed compensation rule. Display an applicable approved policy only; no automatic deduction without one.

### Quality

Provide compact expandable trade/package checklists, checked progress, saved drafts, weekly signing, and previous signed records. Mirror the six reference categories where applicable; source actual project checks from current Configuration/issued package quality requirements. The reference's sample construction tolerances are not automatically adopted as universal standards.

Each audit targets project, vendor/package, reporting week, and checklist version. Use pass/fail/not-applicable responses where needed; require reasons for failures/exemptions. Signing requires all required answers, records actor/time, and creates an immutable snapshot. Subsequent corrections are new revisions. Weekly audits and Vendor Control reference the same records.

## Project messages, Leaderboard, and My Bonus

**Project messages:** reuse Lisno's conversation list, timeline, attachments, read state, mentions and permitted actions. Include the assigned active consolidated Project Manager as a participant through `programManagerId`, with required chat permissions. Reassignment revokes old access and cancels/removes stale cached data; every read/write/stream rechecks scope. This is a deliberate, narrowly scoped access expansion included in the specification. PM receives no participant-management or arbitrary-project access.

**Leaderboard:** retain the reference's ranked list structure with period, rank, staff name, role and calculated KPI, highlighting the current PM subtly. Use an explicitly authorized internal staff cohort; exclude clients/vendors, compensation, project details, email/phone and raw private evaluations. Scores must use the same period, documented policy and eligibility rules. Unsupported roles or insufficient evidence remain unranked, never receive default scores. Deterministic ties and pagination are backend-owned. A PM-only cohort filter supports comparable role-specific scores.

**My Bonus:** a separate self-only view with period, available estimated bonus, project breakdown, source basis, applicable KPI, adjustments, calculation policy/version and statement status. Include an accessible Show/Hide amount control that removes hidden amounts from the rendered accessibility tree, not blur alone. Estimated, approved and paid are distinct. No payroll disbursement action.

The supplied PM page has a hardcoded 1.25% estimate while the reachable shared bonus component is procurement-specific at 1%, and My Bonus is not wired for PM. Therefore a compensation formula cannot be inferred reliably. Until a PM policy is explicitly confirmed/configured, the page must show **“Bonus policy not configured”** and no invented monetary estimate. Implementing the destination and truthful unavailable state is in scope; activating a new compensation formula is a separate policy decision. Similarly, PM KPI dimensions/weights need an explicit source; show available evidence and unavailable composite status until a suitable policy exists. Do not silently use Designer KPI weights as PM policy.

## Data, API and security contract

Add PM-specific, versioned read projections for portfolio summaries/alerts and project tab data, reusing canonical domain services. Avoid a dashboard request per project or loading every tab at once. Portfolio counts must be independent of page slicing; tab data is fetched on demand with bounded pagination.

Common response metadata: project/record IDs, source revision or digest, calculated-at timestamp, version, availability/reason, and allowed actions. Common commands: project ID, stable entity ID, expected version/source token, idempotency key, reason/note where required. Cross-project IDs, reassigned actors, stale sources and invalid transitions must be rejected server-side.

New operational records cover procurement requests where no existing compatible contract exists, PM acknowledgements, milestone sign-offs, notices, escalation history, snags/visits, weekly quality audits, and certification decisions. Use separate bounded records rather than an unbounded all-tabs project blob. Exact route/schema names belong in the subsequent task plan; their behavior and ownership boundaries are fixed here.

| Actor | Intended authority |
| --- | --- |
| Assigned Project Manager | Read permitted assigned-project projections; raise operational requests; acknowledge; record own sign-offs/audits/notices/escalations/snags; certify only designated milestones; participate in assigned project chat; read own bonus. |
| Other/unassigned Project Manager | No private project, attachment, action, or conversation access. Leaderboard exposes only the approved minimal cohort projection. |
| Designer/Client | Keep their current decision and approval authority. PM awareness/sign-off cannot stand in for them. |
| Former Site Manager account | Uses the same consolidated Project Manager role/workspace; retains authorized execution verification and completion responsibilities. |
| Procurement | Keep supplier selection, awards, request fulfillment, purchasing and applicable stock/PO responsibilities. |
| Finance Manager | Keep invoice assessment, financial approval/payment and ledger authority. |
| Super Admin | Operation-specific oversight and policy management only through registered, auditable permissions; no broad new bypass. |

Synchronize backend permission codes, route-operation registry, frontend authorization snapshot, and OpenAPI. Project assignment is enforced at service/transaction boundaries, including attachments and streaming. Reads must not create workflow records. Repository-backed changes require matching memory/Mongo behavior; existing direct-Mongoose execution paths remain intentional.

Amounts remain integer paise. Approved project value comes from the approved estimate source, with GST basis labeled. Procurement request amounts, vendor certification amounts, bonus estimates and ledger payments are separate values. Never join on client/vendor/room names, average unrelated quantities, or reuse another project's values.

Progress/risk are backend-derived. Reuse an established canonical execution aggregate where one exists. If unavailable, return unavailable until the aggregation basis is defined; do not substitute design-task progress or arithmetic means from the reference. Planned progress requires current confirmed schedules and a declared work-weight basis. Risk uses actual overdue/blocking/missed-milestone evidence, with critical precedence; missing data cannot establish On Track. Final aggregate formulas and denominators must be pinned in the task plan before writers begin.

## State, reliability and compatibility

- Successful mutations update/refetch the affected detail, tab list, portfolio card/counts, alerts, and relevant notification/performance projections. Reuse execution live events and refresh fallbacks.
- Preserve accurate content on transient refresh failure with a stale warning; disable consequential decisions until refreshed. Clear protected data immediately after access revocation, logout or reassignment.
- Do not show another project's previous data during navigation. Distinguish loading, no records, filters with no matches, unavailable source, permission denied, and backend failure.
- Use version/CAS conflicts with clear refresh/review recovery. Retry idempotently; double submissions cannot duplicate notices, requests, sign-offs or notifications. Immutable history survives source changes and reopening.
- In-app reminders target actual authorized recipients. External delivery uses existing delivery infrastructure only, with pending/failed/disabled state and retry semantics; success copy must not claim delivery before it occurs. No live sends are part of development verification.
- Uploads retain authenticated opaque storage references, type validation and compensating cleanup. No credentials/contact details/private files in diagnostics or fixtures.
- Original PM feature schemas are additive and use source-aware empty states. Role consolidation now requires the explicit migration contract above; any additional migration needs its own dry-run, rollback and execution authorization. Rollback must not erase new audit history.
- Scope CSS to the PM workspace. Shared execution, Procurement, Site Manager, Design Manager, Finance, and Client paths remain compatible. No new dependency is currently justified.

## Open policy decisions and assumptions

1. User confirmed one role with assignment migration. Canonical stored `site_manager`, displayed Project Manager, is recommended for the evidence-backed compatibility reasons above.
2. User wording controls the four summary labels; Critical remains a severity within At Risk rather than replacing Active Projects.
3. A single execution indicator keeps project cards compact; detailed procurement and vendor metrics move to tabs.
4. All reference actions are required when applicable, backed by persisted authorized behavior. Empty/unavailable states must not hide missing implementation of ordinary actions.
5. Existing Site Manager operational KPI and its recorded policy remain accessible unchanged. New PM composite KPI weights, cross-role comparison, bonus base/rate, eligibility, period, deduction rules and approval/payout source remain unconfirmed and use explicit unavailable states. Any later activation requires an approved policy, not sample HTML constants.
6. Leaderboard publication scope is proposed as minimal internal employee performance data under a dedicated permission; approval of this specification includes that bounded disclosure, not access to employee projects or pay.
7. Construction quality criteria follow approved project/Configuration requirements. No global checklist seeding or engineering-standard certification is authorized by the reference.

## Acceptance criteria and verification expectations

| ID | Required outcome | Evidence required during implementation |
| --- | --- | --- |
| AC1 | The consolidated Project Manager gets the four requested sidebar destinations and workspace label; other roles retain routes and capabilities. | Role-navigation/router tests, sign-in landing and old-link browser checks. |
| AC2 | Compact dashboard has correct full-scope counts, search/filter/page restoration, actionable alerts and one primary progress indicator per card. | Tests with unequal projects across critical/risk/setup/on-track/incomplete/completed states, rendered filter/back navigation. |
| AC3 | Project identity, eight tabs, deep links, and Full detail work without cross-project data bleed. | Direct URL/reload/back tests, rapid project switching, forbidden-project tests. |
| AC4 | Site progress preserves source identity, deadlines and reported/verified/accepted distinctions. | Aggregation and schedule fixtures, current versus superseded revisions, existing execution regression tests. |
| AC5 | Procurement requests, selection acknowledgement/reminder/escalation and supply sign-offs persist and respect ownership. | API/domain/integration tests, reload verification, duplicate/stale/source-change cases, dual-sign-off concurrency. |
| AC6 | Vendor audits/notices/certification work; certification does not mark payment paid or grant Finance powers. | Asymmetric vendors/projects, permission matrix, rejection reasons and ledger reconciliation. |
| AC7 | Client escalations and communication entry points work with honest activity/delivery state. | Open/resolve/escalate tests, missing contact/activity cases, message draft and failed-delivery behavior. |
| AC8 | Snags and weekly quality checklists have durable drafts, ownership, history and immutable signed results. | Status/reopen/weekly version tests, authenticated evidence tests, completion gate regression. |
| AC9 | PM project chat is assignment-scoped, including attachments, streams and reassignment. | Chat membership/authorization regression and two PM identities with separate projects. |
| AC10 | Leaderboard and My Bonus are distinct functional views; no invented scores, amounts, policies or paid status. | Period/cohort/self-scope/hidden-amount tests, policy-unavailable state and source reconciliation. |
| AC11 | Theme and density meet the brief at 360, 390, 768, 1280 and 1440px with long realistic content. | Rendered screenshots inspected as images, mobile tabs/forms, no page overflow, readable type and compact controls. |
| AC12 | Keyboard/accessibility, loading/error/empty/stale/conflict states, cache updates and no runtime errors. | Interaction tests, accessibility checks, keyboard traversal/focus restoration, console/network inspection. |

Verification starts with focused relevant suites, including execution, design requirements, procurement milestones, project chat membership, authorization, financial lineage, and new PM behaviors. Changed Mongo transactional workflows require replica-set integration tests. Complete backend/frontend typecheck and production builds; broaden tests proportionately for shared contracts. Run `git diff --check` and inspect final status. There is no repository lint script, so do not claim lint passed.

The original workspace implementation is present in the worktree and has undergone focused regression tests, independent integrity review, typechecks, builds and synthetic browser QA. Final focused runs passed 306 frontend tests and 166 backend contract/status tests, with separate PM workflow replica-set coverage. Both builds and typechecks passed. Responsive checks covered 360, 390, 768, 1024, 1280 and 1440px. The full frontend run's remaining 97 failures reproduce on HEAD; remaining backend full-suite failures are not all baseline-proven and must not be described as a clean full-suite result. Local evidence is in `/tmp/lisno-pm-qa/verification.md` and `/tmp/lisno-pm-qa/README.md`. This revision adds the role-consolidation specification only; no role migration, production action, external communication, dependency change or commit has occurred. Revised task planning follows specification approval.

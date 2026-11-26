# Key-collection header countdown, Designer reminders, and advance notifications

Date: 2026-11-26
Status: Approved on 2026-11-26; Mode A implementation in progress.

## Goal and confirmed decisions

Put the live key-collection countdown at the top of project details. Use green, orange, and red according to elapsed appointment time. Keep a red reminder visible across the assigned Designer's workspace while collection is pending. Notify the associated Project Manager and the active Super Admin **30 minutes before** the orange and red boundaries, as confirmed by the user on 2026-11-26.

This extends the completed live-countdown change. Its saved deadline, per-second display, and both kickoff prerequisites remain authoritative.

## Current behavior and evidence

- `frontend/src/features/workflow/DesignerHandoff.tsx` shows a server-adjusted `HH:MM:SS` countdown inside the handoff section. It has no elapsed-time colour bands or global reminder.
- `ProjectWorkflowPanel.tsx` owns the workflow query and mounts that handoff inside project content. The Client's Design flow can be collapsed; Super Admin's workflow is behind a secondary tool. A header countdown must be independently visible without opening either section.
- Client, Designer, Super Admin, and other authorized project detail views have established `PageHeader` and project-status controls. The actual simplified Super Admin view is `SuperAdminProjectDetails.tsx`, not just the older admin detail layout.
- `backend/src/services/design-workflow-state.service.ts` saves `confirmedAt`, `originalDeadlineAt`, `deadlineAt`, Designer identity, assignment revision, and approved-estimate lineage. The 48-hour option sets the deadline to confirmation plus 48 hours; a Client-selected date saves its actual deadline.
- `backend/src/services/designer-handoff.service.ts` validates appointment history and approved-estimate/assignment evidence. `keyCollectionAppointmentView` stops the appointment clock on Designer receipt or completed collection. Existing kickoff and quotation blockers remain separate from elapsed appointment time.
- `AppShell.tsx`/`WorkspaceTopbar.tsx` already support a Designer assignment reminder on every authenticated workspace route. That request inbox is distinct from an accepted Designer's pending collection obligation.
- Existing `PMNotifications.tsx` exposes **Project updates** across screens. `backend/src/services/project-manager/workspace.ts` reads durable `ProjectManagerEvent` records, rechecks project access, and supports read state. The model has a unique project/actor/idempotency-key index. This is an appropriate notification surface to extend.
- Existing stage SLA reminders in `design-workflow-state.service.ts` are projected when a workflow is read and use different stage rules. They do not provide the requested unattended appointment notification scheduler.
- Project Manager ownership must come from `resolveProjectManagerAssignment`; the stored role is `site_manager`. Do not confuse this owner with a Design Manager or infer ownership from names.

## Scope and approach

Extend the existing handoff timing contract and project header presentation. Add one authenticated Designer collection-reminder feed and a shared shell reminder. Add a backend scheduler that records idempotent key-collection events in the existing Project updates notification system.

Reuse the existing saved appointment, project access checks, Project updates UI, and workflow actions. Browser-only notifications would miss deadlines when nobody is viewing the project, so notification creation must run on the backend. The existing stage SLA clocks remain separate.

No email, SMS, WhatsApp, push subscription, deadline editing, new assignment workflow, replacement stage SLA policy, financial change, or displayed project-progress percentage is included. Percentages below define colour thresholds internally, not a project progress UI.

## Timing rules

Let `start = confirmedAt`, `end = deadlineAt`, and `duration = end - start`. The duration must be positive and its source valid.

| State | Rule | 48-hour example |
| --- | --- | --- |
| Green | Before `start + duration × 0.50` | First 24 hours; more than 24 hours remain |
| Orange | At 50% up to, but excluding, 75% elapsed | 24 to 36 hours elapsed; 24 to 12 hours remain |
| Red | At or after 75% elapsed | At most 12 hours remain |
| Overdue | Deadline has passed; remains red | Show overdue duration |

- At exactly 50%, switch to orange; at exactly 75%, switch to red. At the deadline show the established due-now state. Keep total hours rather than converting 48 hours into days.
- Compute authoritative boundaries and current band on the backend. Return absolute transition timestamps and `serverNow` so the UI can advance the display and cross those saved boundaries without waiting for a poll or inventing another policy.
- Continue using receipt-time-adjusted server time. Reload, navigation, background-tab recovery, and refetch must not restart or extend the deadline.
- Apply the same ratio to a Client-selected appointment window. Do not silently substitute 48 hours for a chosen date.
- Kickoff blockers, working hours, and project holds do not pause or extend this calendar appointment.
- Preserve the existing stop condition: when the Designer records receiving the keys, the collection countdown/reminder stops. Any remaining Client handover confirmation stays in the existing workflow. Completed collection also clears the reminder. Merely opening or reading an alert does not clear it.
- Invalid or conflicting appointment evidence shows an unavailable/needs-review state rather than green or a fabricated clock.

## Project-detail UX

- Place a compact **Key collection · HH:MM:SS remaining** chip in the project header area beside the status/owner controls. On narrow screens it wraps beneath the title while staying above the project content and expansion panels.
- Include a visible state label such as **On track**, **Attention**, **Urgent**, or **Overdue**, with restrained green/orange/red styling and accessible contrast. Colour alone must not convey urgency.
- Show it on Client, Designer, Super Admin, and Project Manager project details, plus existing internal project detail views that already expose this handoff under workflow-read permission. Do not add access for vendor or otherwise unauthorized roles. Include the Designer's selected-project design workspace.
- Keep the chip visible when Client Design flow is collapsed and when Super Admin switches between Project details, Client persona, Assignments, or tools.
- Clicking the chip opens a focused dialog with the saved due date/time in Asia/Kolkata, Designer, current timing state, and existing blockers. Provide a link/action to the relevant existing workflow; do not introduce a second completion mutation or bypass kickoff gates.
- The handoff section retains appointment confirmation, appointment details, and prerequisite information. Avoid two competing live countdowns on the same project page when the header countdown is present; shared standalone workflow views may retain their inline timer.
- Before confirmation, show the existing scheduling/assignment information without an active countdown. After receipt/completion, remove the active header timer and preserve the workflow's recorded status.

## Persistent Designer reminder

- Once an assigned pending appointment reaches red, show a persistent, non-flashing red **Key collection needs attention** chip in the common Designer workspace header, regardless of the current route.
- Clicking it opens the affected projects, their live remaining/overdue time, and **Open key collection** actions. Sort by earliest deadline, keep project identity explicit, and support multiple projects without one chip per project overwhelming the header.
- Closing the dialog does not dismiss the reminder. It disappears only when no authorized pending red appointments remain. Do not repeatedly interrupt the Designer with forced popups, sound, or repeated toast announcements.
- Recheck current assigned Designer identity and access on the backend. Pending assignment requests, declined Designers, and previously assigned Designers receive no collection obligation for that project.
- Refresh the feed after relevant workflow mutations, assignment changes, reconnection, and foreground return, with bounded background polling. Derive visible seconds locally from server timestamps; never make a request per second.
- Clear denied/session-switched cached data immediately. A transient refresh failure must show that information may be stale and a retry action, not incorrectly claim that collection is complete or no reminder exists.

## Project Manager and Super Admin notifications

- Channel: the existing in-app **Project updates** inbox and unread indicator. No external messages are sent by this task.
- Schedule the orange warning at `orangeAt - 30 minutes` and the red warning at `redAt - 30 minutes`. For a 48-hour window, these are **23h 30m** and **35h 30m** after confirmation.
- No warning precedes the initial green state: the appointment starts green only after successful confirmation. This request adds two advance warnings, not repeated per-second/per-minute notifications.
- Each notification identifies the project, key collection, next zone, exact transition time, due time, and a link to the relevant project. Use current tense if a delayed scheduler discovers that the boundary has already passed; do not falsely say the change is still 30 minutes away.
- Deliver only to the currently reconciled, active associated Project Manager and the sole active Super Admin. Missing/conflicting PM ownership must not block Super Admin delivery or send to an arbitrary manager. Record a safe diagnostic for missing recipients. Revalidate current access on list/read/open.
- Use a stable appointment identity incorporating project, confirmation, original deadline, and assignment lineage. Persist deduplication per warning and recipient, with transaction-safe unique keys. Multiple server instances, retries, restarts, and repeated polling must not duplicate an event or reset read state.
- Run the scheduler independently of page visits on a bounded approximately one-minute cadence, with startup recovery and clean shutdown. Notifications are targeted 30 minutes before the boundary, with up to one scheduler interval of normal processing latency.
- On delayed processing/startup, emit only the most relevant outstanding warning for a still-pending appointment and suppress obsolete earlier warnings rather than flooding the inbox. Existing pending appointments are eligible without rewriting their saved dates.
- For a very short chosen-date window whose warning time predates confirmation, the relevant warning becomes eligible at confirmation; coalesce obsolete warnings as above.
- Recheck receipt/completion, project closure, current assignment, and source validity transactionally when recording warnings. Serialize against collection/assignment changes so concurrent scheduler and workflow writes remain consistent. Historical notifications remain history; opening them shows current status.
- If PM ownership changes, former owners lose current-project visibility; the newly associated PM may receive the current relevant warning once. The Super Admin must not receive a duplicate because PM ownership changed.

## Data, API, authorization, and compatibility

- Add optional timing/zone information to the shared handoff appointment projection, preserving existing consumers and immutable original deadlines. Return explicit unavailable data when the source cannot be trusted.
- Add a narrow read-only Designer collection-reminder endpoint backed by an efficient bounded project/appointment query. Include stable project IDs, names, appointment identity, saved timing, server time, and enough pagination/count information to expose every pending obligation. Avoid fetching every project's full workflow in the browser.
- Register the endpoint and any additional operation in canonical authorization and OpenAPI inventories; keep frontend contracts aligned. The feed returns only the authenticated active Designer's current assignments.
- Reuse `ProjectManagerEvent` persistence and the existing Project updates list/read behavior for a distinct key-collection event family. Extend message presentation and project deep links only where needed; preserve existing notification families and operation-specific Super Admin checks.
- Preserve the repository's direct-Mongoose notification boundary. Any new repository-backed appointment query must have equivalent Mongo and memory behavior. Transactional notification paths require replica-set verification; do not weaken transactions for tests.
- Reuse indexed project/recipient/event identity queries. If implementation needs a new appointment-discovery index, document its exact definition in the task plan and verify it on an isolated test database. Do not run a live migration or index rewrite under this specification's approval.
- UI query keys must separate actor, role, review session, and project. Invalidate all affected header, reminder, workflow, and notification queries after relevant changes.

## Risks, failure handling, and observability

- Principal risks: timezone/client-clock drift; alerts tied to the wrong Designer/PM; completion races; duplicate warnings; stale cached alerts; and unbounded background scans. Use one backend timing policy, canonical identity resolution, transactional checks/deduplication, access-aware caches, and bounded batches.
- Preserve all existing dirty work. Capture target-file snapshots and the initial dirty-path set before implementation writers begin.
- Log scheduler success/failure and counts of processed, deduplicated, skipped-invalid, and missing-recipient cases without exposing client details or secrets. One bad project must not stop processing other projects.
- Notification persistence failures should retry safely. A notification error must not undo a previously committed Client confirmation or collection action.
- No appointment backfill is required. Existing timestamps remain unchanged. Rollback removes the new UI/scheduler use while retaining immutable appointment and notification history; no destructive cleanup is part of rollback.

## Acceptance criteria and verification

| ID | Criterion | Required evidence |
| --- | --- | --- |
| AC1 | Live header countdown is visible above project content, including collapsed Client Design flow and Super Admin tabs. | Rendered integration checks and desktop/mobile screenshots |
| AC2 | Green below 50%, orange at 50%, red at 75% and beyond; selected dates and server-clock recovery agree across views. | Boundary, chosen-date, clock-skew, remount/refetch, due/overdue tests |
| AC3 | Red Designer reminder persists across routes, supports several projects, and opens the correct workflow without bypassing prerequisites. | Shell/navigation/dialog/keyboard tests with unequal project deadlines |
| AC4 | Confirmation alone starts the window; receipt/completion clears active collection alerts; unrelated/pending/previous Designers cannot see them. | Source, state-transition, negative authorization, and cache-isolation tests |
| AC5 | PM and Super Admin each receive orange/red warnings 30 minutes early without an open browser. | Injected-clock scheduler tests immediately before/at warning times |
| AC6 | Concurrent ticks, restarts, missed windows, reassignment, missing PM, and receipt races do not duplicate or misroute warnings. | Replica-set transactions/deduplication tests and asymmetric identities |
| AC7 | Existing Project updates notifications/read state continue working; notification links show current project state. | Notification API/UI regressions and operation/OpenAPI contract checks |
| AC8 | Loading, unavailable, denied, stale, empty, and multiple-alert states are readable and accessible. | Rendered interactions, focus restoration, contrast/non-colour labels, and responsive QA |
| AC9 | Focused backend/frontend suites, affected typechecks/builds, and repository hygiene pass. | Exact commands/results recorded in the separate task plan after approval |

## Open decisions and gate

No unresolved decision. The user confirmed the 30-minute advance interval. In-app notification delivery, receipt-based stop behavior, and selected-date proportional thresholds follow the existing workflow and are stated above for approval.

This document is the specification only. No task plan, implementation, deployment, live scheduler activation, database write, migration, commit, push, or external communication has been performed for this change.

# Project group chat, mentions, and critical discussions

Date: 2026-09-16
Status: Core feature and approved WhatsApp group-chat visual revision implemented locally; verification results and limits recorded in the task plan
Classification: Substantial; high-risk authorization, shared client/staff visibility, persistence, and live delivery

Revision: On 2026-09-16, after the core implementation, the user requested the UI to match WhatsApp group chat at every screen size. The approved visual revision below supersedes the original layout/styling requirements; approved messaging, membership, issue and delivery rules remain the source of truth. The task plan records both implementations and their verification results.

## Goal

Give every project one shared, WhatsApp-like Messages space where its client and involved staff can communicate, mention one another with `@`, reply to a specific message, and raise Important or Critical matters. Show the number of unresolved critical matters at the top of the project. Incoming messages, mention indicators, and priority changes must appear without refreshing the page.

This is an in-app project conversation. All participants see the same conversation, including the client. “Intelligent” means accurate participant selection, role-aware mentions, useful issue tracking, and reliable live recovery; no external AI service is needed for the core experience.

## Current behavior and evidence

The following table records the initial inspection before the approved core implementation on 2026-09-16. That initial worktree was clean. It is historical evidence, not a description of today's implemented chat. The later visual-revision section records the current source and worktree baseline.

| Area | Verified current behavior | Source |
| --- | --- | --- |
| Roles | Existing role codes cover the requested people. `admin` is displayed as Sales Manager; `estimator_sales` as Sales. Six worker roles already exist. | `backend/src/domain/roles.ts` |
| Project relationships | Projects identify the client, initiating and assigned designers, assigned Sales user, and Design Manager. There is no general project participant list or Site Manager field. | `backend/src/models/Project.ts` |
| Sales Manager | Project initiation creates an active `admin_initiator` grant for the selected Sales Manager. | `backend/src/services/admin-project.service.ts`, `backend/src/models/ProjectAccessGrant.ts` |
| Estimate relationships | Estimates retain owner, assigned Design Manager/reviewer, design-plan designer, project ID, and versioned approval state. These fields must be interpreted by stage rather than unioning historical reviewers. | `backend/src/models/Estimate.ts`, `backend/src/routes/estimates.ts`, `backend/src/services/project-workflow.service.ts` |
| Selected trades | Downstream trade tasks derive from included estimate lines, with stable estimate/line/section references and specific `assigneeUserId` values. Canonical trade assignment requires one client-approved estimate with an approved design-plan version. | `backend/src/domain/project-workflow.ts`, `backend/src/models/ProjectWorkflowTask.ts`, `canonicalApprovedTradeSource` in `backend/src/services/project-workflow.service.ts` |
| Site Manager gap | The operational Site Manager queue includes site and trade tasks broadly. The execution assignee override filter currently covers procurement and trade tasks, not named Site Manager assignment. Queue visibility cannot define chat membership. | `listOperationalTasks`, `assignableExecutionTaskFilter` in `backend/src/services/project-workflow.service.ts` |
| Authorization | Permission codes, registered route operations, project scopes, active identities, and session versions are enforced on the backend. Super Admin behavior is operation-specific. Frontend policy mirrors the backend. | `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, `backend/src/services/workflow.ts`, `backend/src/services/auth.service.ts`, `frontend/src/api/authorization-contract.ts` |
| Project screens | Client, designer, management, admin, procurement, and finance use different project screens. Workers and Site Managers primarily enter through operational task queues; Sales enters through leads/estimates. | `frontend/src/app/router.tsx`, `frontend/src/app/routeRegistry.ts`, role-specific project components, `frontend/src/features/workflow/OperationalTaskQueue.tsx` |
| Messaging | No shared chat model, chat routes, WebSocket/SSE transport, or mention system was found. Existing notifications are workflow/email records or transient UI feedback. | Search of `backend/src` and `frontend/src`; both package manifests |
| Transport | Frontend requests use Bearer authentication and JSON responses. CORS currently allows Authorization and Content-Type. Deployment configuration separates the static frontend and API and calls for transaction-capable MongoDB Atlas. | `frontend/src/api/client.ts`, `backend/src/middleware/auth.ts`, `backend/src/middleware/cors.ts`, `render.yaml` |

## Scope and assumptions

Included:

- One conversation per existing project, available throughout planning, execution, and completion.
- Automatic participants from current project relationships, plus explicit selection of additional involved internal users.
- Text messages, Unicode/emoji text, participant mentions, quoted replies, sent/pending/failed states, older-message pagination, and personal unread/mention counts.
- Normal, Important, and Critical priorities; open/resolved discussion items; a persistent project-top critical count and a filterable issue list.
- Live delivery, reconnect/catch-up, multiple browser sessions, server restart recovery, and authorization revocation handling.
- A shared Messages UI and safe navigation for every participating role.

Assumptions proposed for approval:

1. The group is visible to the client. There is no hidden staff-only thread inside it.
2. Only active, authenticated, linked/selected users participate. An email address, role label, or unassigned trade is not a participant.
3. New participants may read the existing project conversation. Removing their last valid membership source removes future access, while their historical messages remain attributed.
4. Completed assigned work does not itself remove a person. Reassignment, removal of the relevant source, deactivation, or loss of a qualifying role can remove access.
5. Priority is an explicit human choice. A word such as “critical” in a sentence does not silently change project state.
6. Important/Critical messages track discussion issues. They do not automatically create execution tasks, approve estimates, change deadlines, or alter calculated risk/KPI.
7. Messages remain available after project completion for follow-up. No automatic archiving or deletion policy is introduced.

Non-goals: WhatsApp integration; private/direct messages; external email/SMS/push delivery; voice/video calls; media/file uploads; reactions; typing/presence indicators; public links; message editing/deletion; full-text search; AI-generated replies or automatic severity classification; changes to estimate/Design approvals, task assignment powers, finance, or OCR.

## Participant source of truth

The backend computes effective membership as a deduplicated union of valid current relationship sources and explicit chat participant assignments. Display each person once, with their current role label and membership sources available to participant administrators.

| Participant | Qualifying source |
| --- | --- |
| Client | Active Client account whose stable ID equals `Project.clientId`; existing account-linking protections continue to apply. No chat-driven signup or email claiming. |
| Super Admin | The existing sole active Super Admin identity, explicitly permitted for these chat operations across projects. Messages are authored as that identity. |
| Sales Manager | Active `admin_initiator` project grant to an active Sales Manager; additional Sales Managers require explicit chat selection. |
| Sales | Current `Project.assignedEstimatorId`; for legacy linkage, a consistent current linked lead/estimate owner may supply the source when the project field is absent. Conflicting IDs must not expand membership. |
| Designer | Current initiating/assigned project designers and the current applicable estimate/design-plan assignment. Historical reviewer fields do not preserve access after a superseding assignment. |
| Design Manager | Current project manager or applicable current estimate Design Manager assignment. A manager's role or organization hierarchy alone does not join all project chats. |
| Site Manager | Explicit selected chat participant, a valid project-specific execution access grant, or a supported named site-task assignment if one exists. Broad queue visibility never qualifies. |
| Trade workers | Named assignees on canonical approved-estimate/design-plan trade tasks, with matching active worker roles; or explicit chat selection for a trade present in that canonical approved source. No automatic inclusion of every electrician/plumber in the organization. |
| Other involved staff | Named valid workflow assignment, valid project-specific design/procurement/finance/execution grant applicable to the person's role, or explicit chat selection. Broad role visibility alone does not qualify. |

Membership rules:

- Validate project/lead/estimate IDs and canonical approval lineage. Do not join by names, email addresses, catalogue labels, or inferred text.
- Unassigned selected trades show an administrative “Participant not selected” state, not fictitious people or mention targets. Core participants may chat before estimates are approved; trade eligibility follows the established approved source.
- Only the assigned Sales Manager and Super Admin manage additional chat selections. Select active internal accounts by name and role. Trade selections are constrained to included approved trades; client and Super Admin membership cannot be manually replaced.
- Additional chat selection grants only conversation access. It does not assign execution work or grant access to designs, finance, staff directories, or other project modules.
- Explicit selections have stable IDs, actor/time, a reason, version, and revocation metadata. Any removal records its actor and reason. Role changes invalidate selections made for a previous role.
- Automatically derived members are managed at their existing source. Removing one explicit selection does not remove a person who still has another valid source; the UI explains this before the action.
- On source conflicts, retain independently provable core memberships, withhold ambiguous memberships, and show a safe setup warning to authorized administrators. Never choose an arbitrary approved estimate or add every candidate.
- Reconcile membership on protected reads/writes and before live message delivery; use assignment changes to invalidate live membership and participant queries promptly. Revocation/deactivation must also clear the affected frontend cache and stop the stream.

## Permission matrix

“Participant” below always requires an active account, the current backend permission, and current membership in this project. Denied project/message lookups use a non-disclosing not-found response.

| Operation | Participant | Project discussion manager | Assigned Sales Manager / Super Admin |
| --- | --- | --- | --- |
| Read history, participants, summary, and live events | Yes | Yes | Yes |
| Send text, quote a message, mention current participants | Yes | Yes | Yes |
| Raise Important/Critical on a message; escalate Important to Critical | Yes | Yes | Yes |
| Resolve, lower priority, or clear a priority | Item raiser or selected responsible participant | Yes | Yes |
| Reopen a resolved issue | Yes, with a reason | Yes, with a reason | Yes, with a reason |
| Select/change an issue's responsible person | Item raiser; self-assignment by another participant | Yes | Yes |
| Manage additional chat participants | No | No unless also assigned Sales Manager / Super Admin | Yes |
| Read/update unread position | Own position only | Own position only | Own position only |

Project discussion managers are participating Sales Managers, Design Managers, and Site Managers, plus Super Admin. Ordinary Sales staff, designers, clients, and workers retain full conversation/raising rights. A mention is not an assignment; assigning an issue owner is a separate explicit action.

New chat operations must be registered in the canonical route inventory with an explicit chat namespace and service-enforced project membership. Add matching permission codes and frontend policy support. Do not reuse a broad `projects.read`/operational-role check to permit chat. Sending as Super Admin must be explicitly supported without changing unrelated personal-operation rules.

## User experience

### Project entry and layout

- Add a clear Messages tab to existing project workspaces using shared navigation and one reusable conversation component. Keep the project name and `Critical N` indicator above the project content; the count stays visible on the overview as well as Messages.
- Use a canonical `/projects/:projectId/messages` route for deep links and roles without a full project-detail screen. It loads a minimal chat-authorized project header, not a protected full design/finance payload.
- Add project-scoped Messages entry points to Sales lead/estimate views, operational project task groups, and other relevant project lists. Selected participants without an existing module/task entry can find their conversations through a minimal “Project messages” entry in their workspace, backed by a membership-filtered list.
- The Messages tab shows unread count and a distinct mention indicator. The header shows participant count and connection state. Participant details show names and roles, not contact details.
- Use the WhatsApp group-chat visual treatment defined in the revision below, scoped to messaging. Retain accessible primitives and Lisno project identity. Sender, role, time, quote and priority remain available without expanding each message into a card with an action toolbar.
- Desktop shows a project-conversation list beside the selected chat. Mobile uses a full-height conversation with back navigation, a compact group header and a bottom composer; the timeline owns conversation scrolling. Issues and participants open on demand.

### Sending and replying

- Messages contain plain text up to 4,000 characters, allowing line breaks and Unicode. Render text safely without accepting HTML. Do not fabricate author IDs, author roles, timestamps, or delivery state from the request.
- Typing `@` opens a searchable participant list with name and role. Keyboard arrows navigate, Enter selects, Escape dismisses. Selection inserts a structured user mention. Plain typed text never silently mentions a similarly named person.
- Up to 20 distinct participants can be mentioned in one message. No `@everyone` or whole-role mass mentions in this scope. Duplicate names remain distinct by stable ID and role; email/contact information is not used as a disambiguator.
- Reply quotes a specific message and jumps back to it, loading its surrounding history if necessary. A quote must refer to the same project. Replying does not automatically mention someone unless the composer displays an explicit mention.
- Desktop Enter sends and Shift+Enter inserts a line break; composition/IME input must not send early. Mobile keeps a visible Send button and supports multiline input.
- An optimistic message shows “Sending” until committed. Failure shows “Not sent · Retry” and preserves text. Retry of the same attempt reuses its idempotency key. A changed payload is a new attempt.
- Auto-scroll only when already near the newest message or after the user's own send. Otherwise show a “New messages” affordance without moving the reader. Prepending older messages preserves the scroll anchor.
- Drafts remain in memory during ordinary in-app navigation. Do not persist private drafts/history to local storage or promise delivery while the app is closed.

### Important and Critical discussions

- The composer defaults to Normal; anyone may choose Important or Critical. Any participant may also flag a saved normal message or escalate an Important one through its action menu.
- One message represents at most one discussion issue. Replies remain ordinary messages unless independently flagged. Resolving/reopening and other lifecycle changes are dedicated actions, not new counted critical messages.
- State: Normal has no open issue; Important/Critical is Open or Resolved. Raising priority creates an Open item. Reopening preserves severity. Lowering Critical to Important removes it from the critical count but keeps it open. Clearing priority removes it from open-issue counts and preserves the audit trail.
- `openCriticalCount = count(project messages where priority = critical and issueStatus = open)`. Important count uses the equivalent formula. Counts are backend-derived over the entire project history, not only loaded messages. Show `Critical 0` only when a successful current summary establishes zero.
- Selecting the count opens the Open Critical filter. Also support All messages, Mentions of me, Open Important, and Resolved issue views. Every issue links to its original conversation context.
- An issue shows who raised it, when, its severity, optional responsible participant, age, and current state. Mentions alone do not set the responsible person. A departed responsible person is shown as unavailable for reassignment by an authorized participant.
- Resolve requires a brief resolution note; lower/clear/reopen requires a reason. Show actor/time and notes in the conversation history. Repeated clicks/retries and concurrent updates must not create duplicate history or corrupt counts.
- A reply saying “done” does not automatically resolve an item. Resolving a chat discussion does not complete a formal task or change project completion, original deadlines, approvals, finance, or risk/KPI.

### Accessibility and states

- Provide semantic tabs/navigation, accessible names, visible focus, a keyboard-operable mention combobox, and correctly managed dialog/drawer focus. Return focus to the triggering control.
- Announce new arrivals politely without rereading the entire history. Priority must have a text label/icon in addition to color. Respect reduced motion.
- Specify and render loading, no messages, no matches, no participants selected for a trade, disconnected, reconnecting, failed send, stale summary, conflict, and removed-access states.
- On loss of authorization, stop fetching/streaming and remove cached project conversation data. On transient connection failure retain visible history with a connection notice and preserve the draft.

## Delivery architecture and options

Recommended: authenticated HTTP writes plus an SSE response consumed with streaming `fetch`, with a durable project event log in MongoDB. This fits the existing Express/Bearer API and avoids a new messaging service. SSE is a one-way server-to-client transport; message creation remains an authenticated POST. The event format provides IDs and heartbeat comments. [MDN SSE documentation](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

Alternative: WebSockets/Socket.IO with durable HTTP-equivalent authorization, acknowledgements, and replay. This is credible if later scope includes typing, presence, or richer duplex events, but adds connection middleware/protocol and dependency surface for the current requirements. Either transport still needs durable storage and explicit reconnect recovery; an in-memory broadcast alone is insufficient.

Required behavior for the recommended option:

- Reuse the existing Bearer token via the Authorization header. Never put tokens in stream URLs. Native EventSource is not the proposed authentication boundary. The stream parser must handle split UTF-8, split event frames, CRLF, comments, multiple data lines, aborts, and protocol errors.
- At most one active project stream per browser tab, shared by the current project's header and Messages view. It remains connected while the user views another tab within that project. Workspace conversation lists use bounded summary refresh on entry/focus and recovery; they do not open one stream per project card.
- Commit the message/priority change and its durable event atomically before acknowledging success or publishing it. MongoDB remains the recovery source even if the process dies immediately after commit.
- Use a monotonic per-project event sequence and an opaque validated cursor. Subscribe with the snapshot cursor, replay later events, then deliver new events without a snapshot/subscription gap. Deduplicate by stable event/message IDs and reconcile message versions.
- Use one process-level Mongo change-stream dispatcher, not one database watcher per browser. Database change streams require a replica set or sharded cluster; the repository already requires transaction-capable Mongo for related workflows. [MongoDB change-stream documentation](https://www.mongodb.com/docs/manual/changestreams/)
- Fan-out must work when send and receive requests reach different API processes. If change-stream wakeups fail, a bounded server-side durable-log tail/reconciliation lane recovers events and reports degraded delivery. Never quietly fall back to same-process-only delivery.
- Reconnect with exponential backoff and jitter; retry promptly on network recovery. A heartbeat approximately every 15 seconds detects stale connections. If a cursor cannot be replayed, return a resync signal and recover history/summary from canonical storage.
- Backgrounded/suspended devices catch up on resume. Offline messages remain visible to their sender as pending/failed until server acceptance; no OS-level or closed-browser delivery promise is made.
- Revalidate identity, token expiry/session version, operation permission, and current membership before replay/live payload batches and on heartbeats. Invalidate on assignment/revocation changes; do not keep authorizing from the opening handshake. Stop a revoked/expired idle stream within the heartbeat interval. Already delivered bytes cannot be recalled.
- Serialize membership-affecting writes with chat writes through a compatible authorization/project revision fence so a stale participant cannot commit a message or mention across a completed revocation. Account deactivation and session changes must participate in the same effective checks.
- Bound connection counts, message rates, page sizes, replay batches, and output queues. Disconnect slow consumers with recoverable cursors. Clean up on unmount/logout, disconnect, and shutdown; SSE connections must not prevent shutdown.
- Configure no-store/no-transform stream responses, heartbeat flushing, appropriate proxy buffering/timeouts, and allowlisted-origin CORS. A cursor query parameter may carry a sequence, never credentials. If resume headers are used, update the CORS allowlist deliberately.
- Local acceptance target: a committed message/count change appears in another connected foreground session within two seconds under normal test conditions; reconnect catches up without duplicates or missing history. Production latency and connection capacity require deployment-specific validation before any rollout claim.

## Data and API contracts

Use the established domain/service/route/model boundaries. Add a focused chat repository boundary with Mongo and deterministic in-memory implementations; do not rewrite unrelated direct-Mongoose services. Existing assignment mutations may need small revision/invalidation hooks.

Conceptual records:

- **ProjectChatMessage:** stable message ID, project ID, author user ID, safe author display snapshot, server timestamp, creation sequence, body, structured mention spans/user IDs, optional reply-to ID, priority, nullable issue status, issue raiser, optional responsible user ID, version, and send idempotency key.
- **ProjectChatEvent:** stable event ID, project ID, monotonic sequence, event type, affected record ID/version, actor/time, safe lifecycle payload, and operation idempotency metadata. Types include message created, issue changed, participants invalidated, and read position changed (self-only).
- **ProjectChatState:** one per project with sequence/revision allocation; lazily initialized using a unique project key. A read must not create an audit or message record.
- **ProjectChatReadState:** unique `(projectId, userId)`, highest acknowledged message sequence, version/update time. Updates are monotonic and cannot acknowledge future/foreign messages. Unread count counts eligible messages above this position, excluding the user's own messages; it is not sequence subtraction. Unread mentions count distinct unread messages mentioning that user.
- **ProjectChatParticipantAssignment:** project/user IDs, selected role, qualifying trade reference when applicable, active/revocation state, reason, actor/time, and version. Effective membership remains derived, not an unchecked cached array.

Necessary indexes include unique `(projectId, authorId, clientMessageId)`, unique `(projectId, eventSequence)`, chronological message retrieval, project/priority/status issue retrieval, project/mention/sequence retrieval, unique read-state identity, and unique active explicit project/user selection. Keep participant snapshots limited to name/role; no emails, phone numbers, credentials, private document references, or finance payloads.

API surface, under the existing `/api/v1` prefix:

| Endpoint family | Contract |
| --- | --- |
| `GET /project-messages` | Paginated membership-filtered conversation list with safe project names and summary counts. |
| `GET /projects/:projectId/chat` | Safe project header, capabilities, participants summary, unread/mention/issue counts, current snapshot cursor. |
| `GET /projects/:projectId/chat/participants` | Current deduplicated mention targets, safe name/role only. |
| `GET /projects/:projectId/chat/participant-options` | Bounded name/role search for eligible additional participants; only membership administrators. |
| `POST /projects/:projectId/chat/participants` and versioned revoke action | Add/revoke an explicit selection; derived membership cannot be removed through this route. |
| `GET /projects/:projectId/chat/messages` | Cursor pagination (default 50, maximum 100), mention/priority/status filters, and authorized around-message retrieval for quotes/deep links. |
| `POST /projects/:projectId/chat/messages` | Body, structured mentions, optional reply ID, explicit priority/owner, and idempotency key; returns canonical saved message/version and cursor. |
| `PATCH /projects/:projectId/chat/messages/:messageId/issue` | Versioned raise/escalate/resolve/reopen/lower/clear/assign action, reason/note where required, and idempotency key. |
| `PUT /projects/:projectId/chat/read` | Acknowledge the highest actually displayed message sequence for the authenticated user. |
| `GET /projects/:projectId/chat/events` | Authenticated SSE replay/live stream from the supplied cursor. |

- Zod validates IDs, bounds, exact action shapes, mention offsets and user IDs, allowed states, and same-project references. Unknown/removed mention targets produce an actionable validation error; never silently notify someone else.
- POST retry with the same actor/project/key and same normalized payload returns the original success. Reusing the key for another payload returns a conflict. Check current authorization even on retries. Unique indexes and transaction retries handle concurrent requests.
- Issue/participant mutations use expected versions; stale updates return a conflict with safe refetch behavior. Counts and history reflect only committed changes. Send, event creation, and required audit writes roll back together on storage failure.
- Read acknowledgements advance only when the conversation is visible and the relevant message has actually been displayed. Loading a summary or receiving an event does not mark it read. Sync the user's own read state across sessions without exposing per-person read receipts to the group.
- Live events update or invalidate all affected TanStack Query keys: history/filter pages, project summary, issue lists, participant lists, unread/mention indicators, and conversation-list entries. Query keys include authenticated user and project; clear them on logout/permission loss.
- Register every route, audit action, permission, and OpenAPI shape; synchronize the authorization policy version and existing rolling-compatibility behavior. UI capability flags do not replace backend enforcement.

## Compatibility, failure handling, and operations

- Additive collections and indexes; no destructive backfill of existing projects/messages. Existing projects resolve current participants and an empty conversation on demand. Missing assignments remain visible as setup gaps to authorized managers.
- Messages and issues do not write to approved-estimate or Design-history records, task progress, ledger entries, or KPI values. Participant selection never grants unrelated module access.
- Default history/event retention is persistent; do not introduce automatic purging or deletion. Growth, pagination, bounded replay, and index use must be checked with representative history volume.
- Feature availability must fail safely when the chat backend/policy is unavailable. Show an unavailable/retry state instead of a blank conversation, fabricated zero counts, or an endlessly “live” connection.
- Rollout later would require backend/index readiness and compatible frontend policy support. Rollback disables the feature and stops streams while retaining chat data; it does not delete records or rewrite assignments. No deployment, live index operation, seed, migration, or external communication is authorized by this specification stage.
- Log event lag, stream reconnects/failures, replay/resync counts, slow-consumer disconnects, send latency, dedupe conflicts, denied operations, and membership conflicts using opaque IDs and codes. Do not log message bodies, tokens, client contacts, or mention text.
- No runtime dependency is presently required by the recommendation. If a narrowly scoped stream/parser dependency proves necessary, justify it and verify compatibility during the task-plan stage rather than silently modifying lockfiles.

## Risks and mitigations

| Risk | Required mitigation |
| --- | --- |
| Unrelated staff see client conversations | Explicit membership resolver; no global role/queue shortcut; two-project authorization tests for REST, summaries, mentions, streams, and participant options. |
| Stale workers or managers retain access | Canonical lineage, source/version validation, explicit revocation, invalidation hooks, and live reauthorization. |
| Staff share something assuming privacy | Persistent concise “Shared with the client and project team” text in the conversation and participant-selection flow. |
| Missing/duplicated messages after outages | Persist before publish, durable ordered events, idempotent writes, race-free replay, canonical resync, and multi-process tests. |
| Incorrect critical count | Server-side whole-project count, transactional updates, version checks, one issue per message, and concurrent lifecycle tests. |
| Revocation/send race | Compatible coordination of current membership and committed writes; test in-flight send/mention versus removal and deactivation. |
| Large conversations overwhelm browser/API | Cursor pagination, anchored history loading, bounded rendering/cache/stream queues, filtered indexes, and connection cleanup. |
| New frontend denies otherwise valid sessions | Coordinated permission/version inventory and established rolling-deployment contract tests. |

## Acceptance criteria and verification evidence required

| ID | Acceptance criterion | Required verification |
| --- | --- | --- |
| AC1 | Every involved role can enter the correct project's Messages view, including selected Site Managers/workers and staff with no other project-module route. | Role-specific navigation and direct-route rendering with positive and denied fixtures. |
| AC2 | Membership includes current linked/selected identities once and excludes unrelated clients, same-role workers, broad-queue managers, inactive users, stale assignments, and non-included trades. | Backend resolver/REST tests with two unequal projects, multiple people per role, legacy links, inconsistent estimate lineage, and assignment changes. |
| AC3 | Additional participant selection is available only to the assigned Sales Manager/Super Admin and grants chat access only. | Add/revoke/version/race tests; verify other design/finance/task endpoints remain denied. |
| AC4 | Participants send Unicode text, quote same-project messages, and mention actual participants through an accessible autocomplete. | API validation and rendered keyboard/mobile/IME tests; duplicate names, edited mentions, removed users, foreign reply IDs, and escaped HTML. |
| AC5 | Every participant can raise Important/Critical items. Resolve/downgrade/ownership permissions match the matrix, with visible audited history. | Domain/route tests for each actor/action, unauthorized closure, valid reopen, and unavailable responsible users. |
| AC6 | Project-top Critical count equals all open critical discussion items, including older unloaded messages, and updates on both overview and Messages. | Three critical/two important items in project A and one critical in B; resolve, lower, reopen, retry, concurrent conflict, and pagination checks. |
| AC7 | Connected users see committed messages, mentions, and count changes without page refresh, normally within two seconds in the local acceptance environment. | Two independent browser sessions; send/receive on separate API processes backed by a replica set; verify actual stream behavior and no manual reload. |
| AC8 | Disconnects, server restart, snapshot/subscription races, split stream chunks, retries, and duplicate/out-of-order delivery do not lose or duplicate saved messages. | Stream parser/transport tests and replica-set integration with commit-before-publish failure, reconnect replay, resync, and idempotent retry. |
| AC9 | Unread and mention counts are personal, persist across sessions, and advance only on actual viewing. | Multi-session, hidden-tab, own-message, duplicate-mention, old-message viewing, and forged/future read-position tests. |
| AC10 | Revoked/deactivated/expired sessions cannot send, fetch, or receive new authorized payloads using an old stream or cached UI. | REST and live-connection tests for each removal source, session-version change, heartbeat shutdown, and in-flight write races. |
| AC11 | Existing authorization, workflow, immutable approvals, finance, and project screens retain their behavior. | Route inventory/OpenAPI/frontend policy tests and relevant project/access/workflow regression suites; inspect final integrated diff. |
| AC12 | The UI is usable at 360px, 390px, 768px, and desktop widths with keyboard/reduced motion and long histories. | Rendered accessibility/interaction checks, mobile keyboard simulation, focus return, anchored pagination, unread-scroll behavior, errors/empty/reconnecting states, console/network inspection, and bounded-resource checks. |

Expected later verification lanes: focused new chat domain/route/repository/stream tests; replica-set tests for transactional message/lifecycle/membership paths and cross-process delivery; existing authorization/OpenAPI/workflow regression tests; frontend chat/navigation tests; backend and frontend typecheck, test, and production build; `git diff --check` and `git status --short`. Exact tasks, file ownership, and commands belong in the separately approved task plan. There is no repository lint script.

## WhatsApp group-chat visual revision — 2026-09-16

### Goal and visual reference

Replace the current document-like Messages screen with a close visual match to WhatsApp's familiar default light group-chat interface across desktop, tablet and phone sizes. Match the composition, compact spacing, neutral header, green outgoing bubbles, white incoming bubbles, quiet patterned chat background, sender labels, bubble tails, timestamps, quoted replies and rounded bottom input. The project name remains the group name and the project-specific Critical counter remains visible.

Reference baseline: default light WhatsApp Web composition on wide screens and the default light mobile group-conversation pattern on narrow screens. This is one consistent web design; platform-specific iOS/Android chrome and user-selected WhatsApp themes are not alternate requirements. Official design references: [Meta's WhatsApp interface overview](https://about.fb.com/br/news/2024/05/mantendo-o-whatsapp-moderno-simples-e-acessivel/), its [UI reference image](https://about.fb.com/br/wp-content/uploads/sites/11/2024/05/441310103_371955471922850_4262473069234654732_n.png), and [WhatsApp chat theme examples](https://blog.whatsapp.com/chat-themes-to-reflect-your-style). These references establish the baseline; they do not establish pixel measurements for every current app release.

### Verified pre-revision state and preservation boundary

- `frontend/src/features/messages/ProjectMessagesPage.tsx` uses a full page heading, separate navigation, toolbar and filters before the conversation. `ProjectMessagesListPage.tsx` is a separate paginated document with large rows.
- `projectChat.css` fixes the transcript to `clamp(320px, 47dvh, 640px)` (43dvh on small screens), sets 230–260 px minimum bubble widths, and applies neutral bordered cards to both incoming and outgoing messages. This produces document scrolling around a short independently scrolling transcript.
- `ChatComposer.tsx` renders a labelled three-row textarea, permanent helper/character text, an Importance select, an optional owner select and a rectangular Send button. This form takes substantial vertical space on phones.
- `ChatTimeline.tsx` repeats author/role/date-time above every message and Reply/Flag/Manage buttons below it. It already contains important read-observation and scroll-anchor behavior that the visual rewrite must preserve.
- `AppShell.tsx` supplies the application navigation and workspace around both chat routes, and owns the persistent `ProjectChatProvider`. Role-specific styles can affect descendants and portalled controls.
- The worktree already contains the approved, uncommitted backend/frontend chat implementation plus its specification and task plan. Its initial dirty-path set for this revision was captured using `git status --short`. Existing modifications are the preservation baseline; no backend files or prior implementation work may be reverted for the redesign. Relevant target diffs must be recaptured before any writer starts.

### Layout and responsive behavior

Recommended architecture: a dedicated authenticated messaging presentation for `/project-messages` and `/projects/:projectId/messages`, using the existing provider and authorization boundaries. Its own compact navigation replaces the surrounding dashboard chrome while either chat route is active. A visible Back to workspace action, accessible application-navigation/logout menu and the existing safe project-overview link preserve navigation. Other project screens keep their existing Messages entry and Critical indicator. Suppress the existing fixed client assistant launcher on the messaging routes so it cannot overlap the composer.

The alternative is retaining the dashboard sidebar/mobile header around an inset chat. That requires fewer shell edits, but loses the requested WhatsApp composition and consumes the narrow viewport. The dedicated presentation is the accepted recommendation for this revision; no new router, global state system or UI library is needed.

| Available width | Required composition |
| --- | --- |
| 320–767 px | One edge-to-edge panel. The list route shows project conversations; a selected project shows the group header, flexible transcript and composer. Back returns to the list without losing that project's draft. |
| 768–1023 px | The same single-panel flow with more breathing room; do not squeeze a permanent sidebar beside the chat. |
| 1024 px and above | Two full-height panes: approximately 320–360 px conversation list and the remaining width for the chat. The list and transcript scroll independently. With no selected project, show a quiet, useful empty state on the right. |

- Use a bounded viewport-height shell with `min-height: 0` flex/grid children, dynamic viewport units and safe-area insets. The conversation header and composer stay outside the transcript's scroll container. Avoid body scrolling behind an open conversation at ordinary text size.
- Mobile keyboard, landscape rotation and changing browser chrome must preserve the focused textarea, Send action and access to recent messages. Add a visual-viewport adjustment only if browser evidence shows CSS alone is insufficient; clean up its listeners on exit.
- At large text/200% zoom, preserve all actions and allow accessible reflow rather than clipping content to force the normal layout. Dialogs and expanded composer options must remain scrollable at short heights.
- No duplicated active chat instance or stream for the list pane. Resizing between one and two panes preserves the selected project, draft, filter and read position.

### Group header, list and secondary information

- Compact 56–64 px group header at ordinary text size, with a circular project-initial avatar, project name, participant summary and accessible overflow action. On mobile, include Back. Long names truncate visually with a full accessible name.
- Selecting the group identity opens group information/participants. Use actual participant names/roles; do not invent profile photos or online status. Reconnection/error notices remain truthful and compact.
- Show `Critical N` as a compact red labelled chip in the header. Selecting it opens the existing Open Critical view. At narrow sizes retain the count by shortening the participant summary before wrapping the header into a large block.
- Replace the permanent top filter toolbar with an accessible View menu or compact expandable filter row. All messages, Mentions of me, Open Critical, Open Important and Resolved remain reachable, and a non-default view has an obvious label and exit action.
- Project-list rows use a circular avatar, compact project title, actual last-message time, unread badge and restrained Critical/mention metadata. Use only fields returned by the existing conversation endpoint; it does not supply last-message bodies, so no preview text may be invented or fetched through one message request per row.
- Retain bounded pagination and foreground count refresh in the list. Avoid cosmetic search, call, camera, attachment or microphone controls without implemented behavior. This revision changes the chat UI; it does not add full-text search, uploads, voice/calls, presence, reactions or message deletion.

### Bubble and composer fidelity

- Incoming bubbles align left on white; outgoing bubbles align right on pale green (initial target `#d9fdd3`), over a muted warm chat surface (initial target `#efeae2`). Scope semantic chat color tokens and a system sans-serif stack locally so Lisno's other modules do not change. Validate text/action colors for contrast rather than copying low-contrast decorative values blindly.
- Bubble width follows content; remove the current 230–260 px minimum. Cap long bubbles at roughly 65–75% on desktop and 85–90% on phones. Wrap long unbroken content, support emoji/Unicode and multiline text, and group adjacent same-sender messages visually while retaining an accessible author for each message.
- Incoming group sender names use a stable, readable color derived from user ID; role context remains available. Put compact time and truthful send state at the bottom-right of the bubble. Use a single sent check or accessible Sent text only for server-committed messages; double ticks/blue ticks would imply recipient receipts the current API does not provide.
- Use small centered date pills, a compact unread marker, a floating jump-to-latest action and a subtle bubble tail at group boundaries. A low-contrast original SVG/CSS line pattern supplies the background; no raster generator or asset dependency is required.
- Quotes use an inset preview with a colored leading rule, author and clamped excerpt; clicking still loads the original message context. Message actions move into a compact accessible menu. Reply and issue actions must work by touch, keyboard and pointer without requiring hover or a swipe.
- Important/Critical state remains visible as a small labelled indicator within the bubble. Responsible person, resolution notes and immutable history remain available through issue details. Opening details must not acknowledge unseen messages or change issue state.
- The bottom composer defaults to a single rounded input and a green circular Send action. It grows with text to a bounded height, then scrolls internally. Keep a screen-reader label; normal typing must not display the existing large form/help block.
- Reply preview and selected priority appear directly above the input. A clearly labelled Message importance control opens the existing Normal/Important/Critical choices and optional responsible person; selected Important/Critical state stays visible before sending. Hidden options must never silently leave a draft's severity unclear.
- Mention autocomplete remains anchored above the input, keyboard-operable, bounded by the visible viewport and identified by stable participant IDs. Preserve IME handling, desktop Enter/Shift+Enter, mobile multiline input, 4,000-character validation, idempotent retry and session-memory drafts. Show errors and a near-limit character count when useful, with accessible announcements.

### Contracts, constraints, risks and rollback

This is a frontend presentation change. Existing endpoints, DTOs, membership decisions, stream/event handling, issue permissions, read-state rules and safe return paths remain authoritative. No persistence change, migration, dependency, WhatsApp connection, or deployment is included. Local component state for menus/panels and derived presentation formatting may change; provider ownership must remain stable across layout transitions.

Integration invariants found by the read-only frontend audit: active-project registration currently lives in `ProjectChatNavigation` within `ProjectChatHeader.tsx` and must move into the conversation page/layout if that navigation row is removed. Preserve `ChatTimeline`'s actual scroll element as the read-observer root. `RouteFocusManager` targets the first `h1` in `main`; an earlier persistent sidebar heading must not steal destination focus from the selected conversation. Keep one mounted presentation of each details panel, and preserve the main landmark/skip link and list pagination state.

Principal risks are nested scrolling/mobile keyboard overlap; role-theme selectors overriding chat colors or portalled menus; losing scroll/read anchors when regrouping bubbles; duplicate streams during split-pane rendering; and hiding issue actions while simplifying the UI. Verify these risks in the actual authenticated AppShell for representative client, designer and chat-only worker roles, not only an isolated content harness. Rollback is limited to the new UI/shell diff and must retain the underlying uncommitted chat implementation.

### Additional visual acceptance criteria

| ID | Required result | Verification |
| --- | --- | --- |
| UI1 | The default chat matches the selected WhatsApp group-chat composition: compact header, patterned transcript, white/green content-sized bubbles, inline times, inset replies and rounded bottom composer. | Inspect screenshots as images against the linked reference, with short/long and grouped messages at the same viewport. No large page heading, permanent form, bubble action toolbar or dashboard card frame inside chat. |
| UI2 | Single-panel mobile/tablet and two-pane desktop layouts reflow without clipping or document horizontal overflow. | Render 320, 360, 390, 768, 1024, 1440 and 1920 px widths, plus phone landscape and breakpoint boundaries. |
| UI3 | Group header and composer remain usable while only the transcript scrolls; mobile keyboard/safe-area changes and long drafts preserve Send access. | Real browser viewport/keyboard simulation, long draft, expanded importance/mention options, 200% text/zoom and screenshot checks. Distinguish simulated keyboard results from physical-device evidence. |
| UI4 | Mentions, quotes, retries, older-history anchoring, unread rules, issue lifecycle, Critical counts and participant controls retain their behavior. | Focused rendered regression tests and a real two-session send/mention/reply/resolve exchange without refresh. |
| UI5 | Chat-only participants get safe navigation, no additional module permission and one active project stream through resize/navigation. | Client/designer/worker route checks, session/draft and stream lifecycle tests, no per-row history fetches. |
| UI6 | Menus, dialogs, composer and mentions work with keyboard/touch, visible focus, clear names and restored focus. | Rendered accessibility tests; actual-browser focus, contrast, reduced-motion and error/empty/loading/reconnect checks. |
| UI7 | Chat styling and shell changes leave the existing project overviews and role workspaces intact. | Representative non-chat route screenshots and relevant shell/navigation regressions, frontend typecheck and production build, diff review. |

## Open decisions and current-stage outcome

The core feature's approvals and Mode A execution choice are already recorded in the conversation and existing task plan. No additional product clarification is required for this visual revision: the proposed default is the light WhatsApp Web/mobile group-chat pattern above. Approval of this revision accepts its layout and presentation requirements; it does not reopen or expand the established messaging/authorization rules.

Actual production concurrency, proxy streaming behavior, and latency are not established by repository inspection; these remain deployment-validation inputs, not assumptions that block a local implementation plan.

The user approved this visual revision and its updated task plan on 2026-09-16. Implementation and local verification were performed under the previously selected Mode A, preserving the existing core implementation. The task plan records the final checks, baseline suite failures, browser evidence and remaining physical-device/deployment verification limits.

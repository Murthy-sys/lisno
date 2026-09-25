# Web Messages: participants, tracked actions and project names

Date: 2026-09-24
Status: Approved and implemented in Mode A. Integrity review and proportionate local verification complete; see the task plan for evidence and limits.

## Goal and confirmed scope

Improve the web Messages screen with participant removal, adjacent name/role mention labels, a composer action dropdown usable by Clients, Super Admin creation of additional action types, and editing the actual project name from Messages.

The user explicitly selected **tracked actions/escalations with an assignee, due date and status**, rather than message labels. Initial action types are **Action** and **Escalation**. “Etc.” means Super Admin can add more types; do not invent additional defaults.

## Current behavior and evidence

- `frontend/src/features/messages/ChatParticipants.tsx` exposes “Remove selection” only for manually selected participants. `project-chat-membership.ts` also derives membership from client, Super Admin, project/estimate/work assignments and access grants. Removing a selection does not remove other membership sources.
- `ChatComposer.tsx` already supplies emoji, attachment and importance controls. Mention results show name and role at opposite ends because `projectChat.css` uses `justify-content: space-between` and right-aligned role text.
- Existing chat issues provide Important/Critical priority, assignee, Open/Resolved status, issue history, version checks and idempotent writes. They have no configurable action type or due date. Extend this workflow rather than creating a second independent task system.
- Chat reads, sends, attachments, streams, typing and notifications rely on current project membership. Removal must affect this common source, not merely hide a participant in the web list.
- Project name is read from the canonical project record. Inspection found no existing project-rename endpoint. Add a narrowly scoped, authorized rename operation rather than a chat-only alias or broad project-update endpoint.
- Backend chat and authorization files already contain unrelated work. Capture and preserve per-target baselines before writers start. Do not replace those changes.

## User experience

### Participants

Show **Remove participant** beside removable people for an authorized participant manager. Ask for a reason and confirm removal from this conversation; preserve historical messages and all underlying project/work assignments.

Removal applies even when membership came from an assignment or access grant. Persist a conversation-specific exclusion until an authorized manager explicitly adds the person back. Re-adding revalidates current identity/trade eligibility and restores conversation history access. Ordinary relationship refreshes must not silently re-add an excluded person.

Protect the linked Client, sole active Super Admin and the acting manager from removal. Show a short explanation rather than a misleading removal control. Keep the existing manager boundary: Super Admin and eligible initiating Admin, validated on the backend. Clients do not receive participant-management privileges.

### Mentions

Render each result as `Name · Role`, left aligned in the same group. Keep the role immediately beside the name, with wrapping together on narrow screens. Retain stable user IDs, duplicate-name disambiguation and keyboard selection. Mention insertion remains the existing validated `@Name` behavior.

### Composer actions

Add an **Actions** control alongside the existing composer tools. Its dropdown contains **Action**, **Escalation**, and saved custom types. Clients and other current members allowed to send messages can use it. Super Admin additionally sees **Add action type…** in this dropdown.

Selecting a type opens a compact form with action details, one responsible current participant and a required due date. The message body supplies the details; existing mentions and attachments remain usable. Show a removable draft summary before Send. Cancel or a failed send retains the user's message and selections appropriately. Message and tracked item save atomically and retry without duplication.

Persist and display type, creator, assignee, due date and **Open/Resolved** status on the message. Reuse existing issue management, history and realtime refresh. Provide the relevant issue actions to resolve, reopen, reassign or escalate according to existing backend capabilities. Action starts Important; Escalation starts Critical. Custom types use the same tracked workflow, initially Important. Adding a type defines its name, not executable behavior or an automation rule.

Changing the due date requires a reason and audit history; preserve the original due date. Dates are validated calendar dates, displayed without timezone shifts. Clearing draft selection does not delete an already saved tracked item. Saved tracked items cannot lose their tracking/history through “Clear priority.” Existing plain messages and legacy issues retain their current behavior.

Super Admin creates a reusable global type with a trimmed name of 1–60 characters. Prevent case-insensitive duplicates, including built-in names. The new type becomes selectable immediately after a successful save. Other roles can select types but cannot create them. Type editing/deletion is outside this request.

### Project name

Show an edit control beside the Messages project heading for Super Admin and the eligible initiating Admin. The form edits the actual project name, with Save/Cancel, nonempty trimmed validation and a 200-character limit. Keep the project ID unchanged. Display a concurrent-change error instead of overwriting another rename.

Refresh the conversation header/list and affected project queries after success, and make other connected clients refresh their project summary. Existing immutable historical audit/delivery snapshots retain their recorded names; live project views use the current canonical name. Clients and other participants retain read-only project names.

## Permissions and invariants

| Operation | Authorized actor |
| --- | --- |
| View/select action types | Authenticated current chat member with existing chat access |
| Send tracked action/escalation | Current member with `chat.send`, including Client |
| Resolve/reassign/reopen | Existing issue capability policy; current membership rechecked |
| Add custom action type | Sole active Super Admin only, dedicated registered operation |
| Remove/re-add participant | Existing participant managers; protected identities cannot be removed |
| Rename project from Messages | Super Admin or eligible initiating Admin for that project, dedicated operation |

No client-supplied role or display name establishes authority. Names are presentation, and joins use stable project/user/type IDs. Removal cannot alter formal assignments, approval history, financial records or the sole Super Admin identity. All operations revalidate identity, session, membership and capabilities within the write boundary.

## Contract, persistence and compatibility

- Extend the chat message/issue contract additively with action type ID/name snapshot and original/current due dates. Legacy messages normalize missing action metadata to absent. Preserve existing priority/status fields and old-client sends.
- Add a global action-type catalogue with built-in stable IDs for Action and Escalation and persisted custom entries. List/create endpoints use runtime validation, operation registry entries, OpenAPI and backend authorization; prevent concurrent duplicate creates with a unique normalized name.
- Add conversation exclusion records keyed by project/user, with active state, version and actor/reason history. Removal/re-add is transactional, version checked and idempotent. Do not repurpose selection revocation in a way that changes old endpoint semantics unexpectedly.
- Apply exclusions in common membership resolution for every consumer, including notifications/email recipient eligibility, attachment access, typing, SSE and conversation listings. Removed users lose subsequent access; web caches/drafts clear through existing denial handling. Do not expose excluded records or private source details to ordinary participants.
- Reuse the message's stable ID, version, operation deduplication and issue event/history pipeline. Type/assignee validation and action/message creation must commit together. Preserve original deadlines; audit every later deadline change.
- Rename updates only the canonical project name, with compare-and-set conflict protection, deduplicated retries and actor/old/new-name audit. Register the narrowly scoped operation and refresh affected subscriptions/caches without rewriting historical snapshots.
- Memory and Mongo repository implementations must agree. New Mongo transactional writes require replica-set verification. Existing mobile consumers must continue parsing additive responses; this request does not redesign the mobile UI.
- No destructive migration, seed, historical backfill, deployment or live data change. New optional fields default safely on existing records. Built-in action types must be available without running a production seed.

## Failure, security and operational risks

Main risks are a removed user retaining access through another membership path, stale project names, duplicate tracked items after retry, lost deadlines/history and unauthorized catalogue creation. Enforce exclusions centrally, isolate caches by identity/project, use existing idempotency/CAS transaction patterns and test asymmetric identities across two projects.

Preserve existing notification and delivery behavior. Do not add a new external email or scheduled reminder workflow in this scope. Do not imply that resolving a chat action completes a formal project task, changes a KPI or approves an estimate/design. No new dependency is expected.

## Acceptance and verification

1. Authorized managers remove assigned and manually added participants, and can explicitly restore eligible people. Protected participants cannot be removed. Removed users are denied chat APIs, streams, attachment access and subsequent notification delivery; historical messages remain.
2. Mention results show name and role adjacent on desktop and narrow web layouts; keyboard, duplicate names and selection IDs work unchanged.
3. A Client can create Action or Escalation with current assignee and due date; send/retry creates exactly one tracked message. Validation/failure retains the draft. Type, owner, date and status survive reload.
4. Existing issue permissions govern resolve/reopen/reassign/escalate; changing a deadline records a reason and preserves the original. Stale updates fail safely.
5. Super Admin adds a type from the dropdown and other members can select it; other roles' direct create requests are denied. Concurrent and case-insensitive duplicate names do not create duplicate types.
6. Authorized project-name edits propagate to live Messages/project views while preserving the ID and historical snapshots. Unauthorized and stale writes are rejected.
7. Focused backend chat/domain/repository/routes, authorization/OpenAPI/registry and replica-set tests; relevant frontend composer/participants/messages/state/API tests; frontend/backend typecheck/build; mobile contract compatibility checks if shared contract changes require them; `git diff --check`.
8. Rendered desktop and narrow web checks cover Client, Super Admin and removed participant, open dialogs/dropdowns, long names, keyboard/focus/error states and accessibility. Use synthetic local data only. Record exact outcomes and any environment limitations.

## Assumptions and non-goals

The existing participant-manager boundary also governs the new header rename control. The linked Client and Super Admin stay in the conversation. Custom action types share the existing Open/Resolved workflow. These are reviewable scope choices, not claims about existing implementation.

Out of scope: formal project task creation/completion, configurable automation, reminders, new KPI calculations, removal of project assignments, client participant administration, custom status workflows and mobile UI changes.

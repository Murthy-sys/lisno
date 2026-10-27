# Compact shared Project Messages redesign

Date: 2026-10-27
Status: Approved by the user on 2026-10-27. Task plan approved and Mode A selected. Implemented and locally verified; repository-wide test failures outside messaging are recorded in the task plan.

## Goal and user decisions

Redesign the common web Project Messages screen around the supplied reference: application navigation, a compact project conversation list, a central conversation, and contextual project details. Use the same presentation for every role already authorized to use messaging.

The user's follow-up requirements are binding:

- Keep typography and containers compact. Avoid large headings and large cards.
- Preserve Actions, tags, and all existing functionality. This is a presentation redesign, not a replacement messaging workflow.
- Keep existing role permissions, project membership, and capability decisions authoritative.

The reference is visual guidance. Its sample names, messages, photos, percentages, dates, and indicators are not application data or instructions.

## Current behavior and evidence

Inspected the current working tree, rather than relying on historical designs.

| Area | Verified current behavior | Source |
| --- | --- | --- |
| Shared routing | Both `/project-messages` and `/projects/:projectId/messages` use `chat.read` with presentation roles from `ROLE_CODES`. | `frontend/src/app/routeRegistry.ts`, `frontend/src/app/router.tsx` |
| Shell | Messaging hides the normal desktop sidebar and uses a compact shared topbar. Navigation is available through the conversation list drawer. | `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/common-shell.css` |
| Conversation list | One shared list stays mounted across project navigation and viewport changes. It supports pagination, refresh, unread/mention/critical indicators, and request suspension while hidden. | `frontend/src/features/messages/ProjectChatLayout.tsx`, `ProjectConversationList.tsx` |
| List data | Backend already accepts project-name `search` and `all`, `unread`, `critical`, `important` filters. It returns saved last-message previews and authorized aggregate counts. The web API wrapper and types currently expose only pagination and basic summaries. | `backend/src/domain/project-chat.ts`, `backend/src/contracts/project-chat.ts`, `backend/src/services/project-chat.service.ts`, `frontend/src/features/messages/projectChatApi.ts`, `projectChatTypes.ts` |
| Count meaning | `totals.unread` counts conversations with unread messages; `totals.critical` and `totals.important` count open issues. `pagination.total` counts conversations matching the current search/filter. | `backend/src/services/project-chat.service.ts` |
| Conversation | Existing page includes history, reply/context navigation, filters, priorities, tracked actions, participant management, rename, chat-hours restrictions, and status access. | `frontend/src/features/messages/ProjectMessagesPage.tsx` |
| Composer | Supports attachments, emoji selection, Actions and action-type creation, importance, responsible person, due date, mentions, voice notes, draft validation, drag/drop/paste, and send/retry behavior. | `frontend/src/features/messages/ChatComposer.tsx`, `ChatTrackedAction.tsx`, `ProjectChatProvider.tsx` |
| Tags and history | Message tags retain type name, importance, open/resolved state, responsible person, due date, creator, and issue-history actions. Lisno AI has separate messages and contextual controls. | `frontend/src/features/messages/ChatTimeline.tsx`, `ChatIssueDialog.tsx`, `ChatAssistantResult.tsx` |
| Details data | Chat summary contains project ID/name/status and capabilities. Participant endpoint supplies names, roles, membership sources, and management capabilities. Project status supplies current stage and pending actions with owners, schedules, and deadlines. | `projectChatTypes.ts`, `frontend/src/features/project-status/ProjectStatusButton.tsx`, `projectStatusApi.ts`, `frontend/src/api/types.ts` |
| Visual baseline | Current messaging uses a two-pane layout, a patterned conversation background, outgoing green bubbles, a 23px list heading, and multiple shadowed/rounded elements. | `frontend/src/features/messages/projectChatShell.css`, `projectChat.css` |
| Regression coverage | Existing tests cover shared routing/layout, list request scheduling, drafts, stream lifecycle, revoked access, retries, participants, actions, attachments, voice, and accessibility. | Tests alongside the messaging feature and project-status feature |

The initial working tree contains extensive unrelated in-progress work across backend, frontend, and mobile. Relevant dirty targets include `AppShell.tsx`, `common-shell.css`, `ProjectMessagesPage.tsx`, route files, authorization files, and shared QA transport. In particular, the conversation page already contains a `draft=project-update` entry flow, and the shell includes Project Manager notifications. Preserve those changes. Capture and reconcile current per-target diffs again before implementation begins; avoid rewriting dirty shared files wholesale.

## Scope and assumptions

### Included

- Shared web messaging routes for all currently authorized roles, including responsive mobile web.
- Reference-inspired navigation/list/conversation/details composition with compact typography and density.
- Server-supported project-name search, list filters, and last-message previews, exposed through the existing backend endpoint.
- A contextual details rail using authorized project status, participants, and attachments already loaded in the conversation.
- Styling and presentation-only restructuring of existing messaging controls and dialogs where needed for consistency.
- Regression, rendered interaction, accessibility, and responsive verification after implementation approval.

### Excluded

- Native `mobile/` application redesign.
- New permissions, membership rules, APIs, database fields, migrations, or messaging semantics.
- Changes to task/action tags, priority rules, due-date rules, issue transitions, approvals, or chat hours.
- New pinning, favoriting, online-presence, group-creation, or message full-text search systems.
- Changes to unrelated dashboards, global typography, or business workflows.
- Dependency additions, commits, deployment, or external communication.

Recommendation: extend the established shared React components and CSS, retaining the existing provider and feature logic. One common implementation already fits the user's request; separate role-specific messaging screens would add divergence without a requirement.

## Visual and layout requirements

### Density and tokens

- Use a messaging-scoped token layer with warm off-white surfaces, dark charcoal text, muted secondary text, and restrained deep green emphasis.
- Retain the messaging system-font stack. Do not introduce Inter, Geist, Space Grotesk, or additional font downloads.
- Main list heading: 17–18px. Project title: 15–16px. Section headings: 13–14px. Message body: 13–14px. Supporting metadata: 12px where practical. Do not shrink essential information to achieve density.
- Compact rows, small gaps, thin separators, and flat panels. No nested dashboard-card treatment, large feature tiles, gradients, ornamental backgrounds, drop shadows, or colored left selection stripes.
- Prefer square or minimally rounded controls, approximately 2–4px where a radius is useful. Circular initials remain suitable for avatars.
- Desktop conversation rows should normally occupy about 68–76px, with a 34–38px avatar, readable project name, metadata, and one preview line. Longer content truncates safely with an accessible full name.
- Keep compact visual controls operable: approximately 32–36px desktop targets where sufficient and at least 44px targets for coarse pointers. Allow touch toolbars to wrap without losing controls.
- Use the existing custom SVG/sidebar icon approach for redesigned chrome. Preserve every control's accessible name and behavior when changing its icon. No new icon library or decorative emoji. The existing emoji picker remains functional.

### Wide desktop

- Show the user's existing permission-filtered application navigation beside the messaging workspace.
- Target a 192–208px navigation rail, a 272–304px conversation list, a flexible central conversation, and a 248–280px details rail when the viewport can accommodate them.
- The conversation remains the dominant area. Bound media previews so one image does not consume the full viewport; retain full-size preview/download actions.
- Keep account/logout, notifications, and daily critical-task access through the existing compact topbar. Do not duplicate these controls or remove them to imitate the reference.
- Give the conversation list, history, and details independent scrolling. The header and composer remain visible without covering history content.

### Laptop, tablet, and mobile web

- Initially target a persistent details rail at approximately 1440px and above. Below that, expose the same details through an accessible drawer to protect conversation width.
- Retain the current 1024px list/conversation split boundary unless rendered evidence requires adjustment. Below it, show either the list or the selected conversation with working back navigation.
- Use the existing navigation drawer on narrow screens.
- Preserve the list's mounted state, pagination, and scroll across conversation navigation. Layout changes must not recreate the provider, reset drafts, duplicate streams, or replay effects.
- Keep all composer tools available on touch layouts, using a compact secondary tool row when necessary. The editable mobile textarea may remain 16px to avoid browser auto-zoom.
- Support safe areas, software-keyboard height, text zoom, long names, long filenames, and narrow viewports without page-level horizontal overflow.

## Information and interaction requirements

### Conversation list

- Title the screen `Project messages` with small supporting text `Project conversations`.
- Add a compact `Search projects` field. Search uses the existing backend project-name behavior; do not imply message-body search.
- Expose `All`, `Unread`, and `Critical` filters; keep `Important` available as well. List filters and existing in-conversation filters are separate controls with distinct state.
- Filter and search through the server across all authorized conversations, not just the loaded page. Reset list pagination on a query change, cancel superseded requests, and isolate cache entries by session, filter, search, and offset.
- Use real last-message excerpts and attachment summaries supplied by the backend. Do not fetch every conversation's history to build previews.
- Counts must retain their actual units. Accessible labels distinguish unread conversations from open critical/important issues. Do not infer an `All` total from a filtered result; omit that badge when a trustworthy unfiltered count is unavailable.
- Preserve existing project status metadata, participant count, unread mentions, unread-message badges, critical indicators, refresh, pagination, and retry controls.
- Selected rows use a restrained surface tint and clear accessible selection state. No decorative left stripe.
- Keep distinct loading, no conversations, no search matches, no filter matches, stale data, and access-unavailable states.

### Header, conversation, and composer

- Compact header with project initials/name, participant information, and the existing actions/status/rename access according to their current capabilities.
- Keep critical count navigation and all current history filters: All messages, Mentions of me, Open Critical, Open Important, and Resolved.
- Give messages clear author/role/time hierarchy, restrained surface differences, compact spacing, and readable attachment rows. Preserve own-message recognition, sender grouping, chronology, unread markers, and contextual targets.
- Keep tags visible in the message flow. Tracked action type, Open/Resolved state, responsible participant, due date, creator, and issue history remain available and readable.
- Preserve the composer Actions control as an explicitly labelled tool. Do not bury it behind a generic attachment control or remove it to match the simpler screenshot.
- Preserve existing menu destinations and all issue/action transitions, including assign/self-assign, raise/escalate, resolve/reopen, lowering/clearing where currently permitted, and audited rescheduling.
- Keep draft chips, reply context, mentions, file tray, recording controls, validation messages, and recoverable failure controls. Styling must not change payloads, idempotency keys, or retry/cancel semantics.
- Preserve Lisno AI branding, request/result controls, structured results, and their availability states.
- Preserve the `draft=project-update` flow, current overview navigation, read receipts, live typing, schedule restrictions, and warnings. Existing emoji functionality is retained.

### Project details

- Render one compact details presentation: a desktop rail or a narrow-screen drawer. Do not mount competing copies of stateful participant management UI.
- Show canonical project identity and status. Keep `Project status` access and its current fallback behavior, including cases where chat summary loading fails.
- When permitted, use the existing status response for current stage and next pending action, responsible people, and a real due/scheduled date. Label this as workflow status or next action, rather than a fabricated completion percentage.
- Show participants as compact rows with initials, names, and roles. Existing participant add/remove/restore controls and reason/version requirements remain available only to authorized users. Preserve membership source explanations and setup warnings.
- Show a compact attachment section labelled `Files in this view`, sourced from successfully loaded conversation messages. Clearly state when older history is not included. Reuse authenticated preview/download behavior and provide context navigation to the source message.
- Loading earlier messages expands this file subset. A filtered/contextual timeline must not claim to represent the complete project file archive. Do not add a misleading `View all files` promise or fetch the entire history in the background.
- Show a `View project` destination only when an existing valid authorized overview destination is known. Do not guess a privileged route for roles without one.
- Use initials where no authorized project photo is available. Chat summary does not currently expose location, project imagery, or progress percentage; omit those decorative reference fields.
- Pinned updates, star/favorite controls, presence dots, and a new-conversation button are not existing features. Do not render inert copies. Their absence must not remove any existing functionality.

## Data, access, and compatibility invariants

- Backend authorization, current membership, capability flags, and chat availability continue to determine access and mutations. Common styling does not grant common permissions.
- Use project/user/message/attachment IDs for state and joins. Names remain presentation values.
- Update frontend list types and request parameters to match the existing backend contract. No backend or native-mobile contract change is proposed.
- Preserve `ProjectChatProvider` ownership of drafts, optimistic attempts, access revocation, query invalidation, event streams, typing, and memory cleanup.
- New list query variants remain under the existing list cache prefix so incoming messages, read changes, issues, rename, and membership events refresh affected previews/counts.
- Revoked conversation access clears its content, draft, details, file subset, and cached media promptly. A late response from a prior identity/project must not reintroduce private content.
- Status access is independently permission-checked. A status-only failure must not disable a permitted conversation; loss of conversation access must not leave a stale details panel visible.
- Expanded details must not create a stream per listed project or add hidden polling. Reuse shared query data and visibility-aware fetch behavior.
- No schema migration or rollout ordering change is required. Rollback consists of reverting only the eventual redesign-owned diff while retaining pre-existing work.
- No extra analytics or content logging. Use existing error and connection states, with no messages, tokens, private URLs, or file content written into diagnostics.

## Required states and accessibility

- Loading, empty, filtered-empty, failed initial load, recoverable stale data, disconnected/reconnecting, and removed access are explicit and compact.
- Preserve current disabled and read-only behavior during closed chat hours, policy failures, unavailable participants, or missing capabilities. Do not trade away explanatory text for visual density.
- Keep existing loading indicators/skeletons where appropriate. No large ornamental loading screen.
- Use semantic landmarks and headings, native controls, keyboard-operable menus, accessible names, visible focus, and focus restoration for drawers/dialogs.
- Essential action tools are available without hover. Avoid hover animations and respect reduced-motion preferences.
- Verify text and control contrast against the rendered off-white/green surfaces and retain readable content at 200% zoom.

## Acceptance criteria and verification intent

| ID | Acceptance criterion | Required evidence after implementation |
| --- | --- | --- |
| AC1 | One shared layout serves every currently authorized role; role navigation and capabilities remain correct. | Route/layout tests across the role registry plus asymmetric authorized/unauthorized fixtures. |
| AC2 | Reference composition is compact with no large headings/cards; desktop has navigation/list/conversation/details when space permits. | Rendered inspection at 1920, 1440, 1280, 1024, 768, and 390px; narrow 320px and 200% zoom checks for overflow and clipping. |
| AC3 | All current Actions, tags, issue transitions, message filters, AI, participant controls, and status access remain usable. | Existing feature tests plus rendered keyboard/touch interaction with a tracked action, responsible person, due date, issue history, and permitted/restricted controls. |
| AC4 | Sending, mentions, replies, attachments, emoji, voice, drafts, retries, cancellation, and project-update entry retain their behavior. | Existing composer/provider/media tests and focused regressions where markup/control relocation changes interaction. |
| AC5 | List search/filters/previews use the existing server data correctly across pagination. | API/list tests with more than one page, unequal unread/issue counts, empty matches, query switching, denied projects, and server excerpts. |
| AC6 | Details display only authorized, truthful data, with clearly bounded file coverage. | Details tests for current/earlier/filtered history, absent metadata, status failures, direct-route entry, and member management capabilities. |
| AC7 | Switching projects, resizing, and opening details retain draft/list state without duplicate streams or hidden polling. | Existing layout/request-scheduling tests and responsive runtime checks. |
| AC8 | Revocation and identity changes clear all new surfaces and ignore late responses. | Provider/access regressions including details/media/list query variants. |
| AC9 | Loading, empty, stale, error, readonly, responsive, and accessible states remain operable. | Rendered state matrix, accessibility checks, keyboard navigation/focus restoration, console/network inspection. |
| AC10 | Integrated change preserves unrelated dirty work and compiles/builds successfully. | Focused tests first, then frontend typecheck/full tests/build and scoped diff review; disclose pre-existing failures. |

Expected verification commands after implementation approval:

- `cd frontend && npm test -- src/features/messages src/features/project-status`
- `cd frontend && npm run typecheck && npm test && npm run build`
- `git diff --check` and `git status --short`
- Rendered checks against synthetic local fixtures, including an internal role and a Client with distinct capabilities and projects. Never use real client files in screenshots.

No repository lint script exists. Do not report lint as passed. Backend tests are only required if later approved scope changes backend code/contracts; backend modification is not part of this specification.

## Risks and open decisions

- Main risk: reducing visual density by accidentally hiding or deleting existing functionality. The preserved feature inventory and AC3/AC4 are release conditions.
- Existing dirty shell and Project Manager changes create integration risk. Establish current ownership and inspect diffs before touching them.
- Desktop details reduce conversation width. Validate the breakpoint against real long messages and the full composer toolbar, not only short sample content.
- List aggregate units differ from filter result counts. Keep wording accurate instead of making badges superficially identical to the reference.
- Read-only chat hours can conceal missing tools during QA. Use synthetic writable and read-only scenarios deliberately.
- No unresolved product decision prevents specification approval. Assumptions are shared web scope, presentation preservation, and truthful use of currently available APIs.

The approved implementation and verification record is maintained in [the task plan](../plans/2026-10-27-project-messages-compact-redesign.md). No product scope or permission changes were added during execution.

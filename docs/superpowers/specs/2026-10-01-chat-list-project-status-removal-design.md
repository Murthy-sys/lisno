# Remove Project status buttons from the chat conversation list

**Date:** 2026-10-01  
**Status:** Approved and implemented

## Goal and interpretation

Remove the **Project status** buttons shown under each project in the chat conversation list in the supplied screenshot. Interpret “renice” as “remove” and the screenshot as identifying the list-row controls. Keep the project status text in each row's metadata (for example, `6 participants · completed`) so the conversation remains easy to identify.

## Current behavior and evidence

- `frontend/src/features/messages/ProjectConversationList.tsx` renders the shared Messages list. Each project row contains a link to its conversation, participant count and project status text, unread/critical indicators, then a separate `.project-messaging-row-actions` block containing `ProjectStatusButton` when the project is not selected.
- `frontend/src/features/project-status/projectStatus.css` gives that action block extra bottom and left padding and a 40px button. This creates the second line and whitespace visible in the screenshot.
- `frontend/src/features/messages/ProjectMessagesPage.tsx` and `ProjectChatHeader.tsx` also render a Project status control inside a conversation or project chat context; project overview and vendor screens use the same status feature. `ProjectMessagesPage.test.tsx` currently expects one independent status control in each conversation row.
- The list component and its relevant tests have no pre-existing local diff. The worktree does contain unrelated, approved Lead and workspace redesign changes, which must be preserved.

## Scope and non-goals

**In scope:** remove the per-row button and its now-unused layout block from the conversation list, adjust only the row-specific CSS needed to close the empty space, and update focused tests to assert that conversation links and metadata remain usable without row status controls.

**Out of scope:** removing the project status feature or drawer elsewhere; changing the `completed`/other project status text, participant count, unread/critical indicators, chat permissions, conversation ordering, navigation, data fetching, project overview, vendor screens, or backend/API behavior. The in-conversation status control remains available.

## Requirements and UX impact

1. Each conversation appears as one compact, fully clickable row with no Project status button beneath it and no reserved action space. The row link retains its existing project destination and keyboard focus treatment.
2. Keep avatar/initials, project name, participant count, textual project status, latest-message time, unread/mention counts, and critical indicator when present. Selected and unselected rows should use the same compact structure.
3. Remove only the row-level `ProjectStatusButton` use; retain the status controls in conversation headers and other product areas. Do not replace the button with another control or an unsupported status value.
4. Keep loading, empty, error/retry, pagination, visibility-based query scheduling, and mobile/desktop list behavior intact. At narrow widths, long project names and metadata must wrap or truncate without clipping the link or creating page-level horizontal overflow.
5. Preserve semantic list/link structure and accessible names. The visible project status text is information, not an action; keyboard users should encounter one conversation link per row, with existing navigation and unread information available.

## Data, API, permission, and risk

No data contract, query key, authorization rule, mutation, migration, or external effect changes. Removing a row button removes its on-demand status-drawer entry point from the list; it does not alter the conversation list request or status access from other supported locations. The main regression risk is leaving a blank row-action strip or accidentally removing the existing status text instead of the button. Another risk is changing the shared `ProjectStatusButton` component or its CSS and affecting project overview/vendor consumers; keep changes limited to the list markup and isolated row-action styling.

## Acceptance criteria

1. The Messages conversation list no longer shows Project status buttons under its project rows, including the two rows illustrated in the screenshot, and contains no empty action strip.
2. Each row still shows project name, participant count and textual status, and navigates to the same conversation. Unread/critical indicators, selected state, and list states remain intact.
3. Project status controls outside the list, including the conversation header/project overview, remain functional.
4. Focused conversation-list and shared-project-messages tests, frontend typecheck, and rendered desktop/mobile checks pass; no new page overflow or accessibility issue appears.

## Open decisions

None required for this bounded change. The screenshot identifies the list-row button. If the intended scope includes the in-conversation header button as well, that would be a separate scope change before implementation.

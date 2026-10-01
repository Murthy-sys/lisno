# Remove Project status buttons from the chat conversation list

**Date:** 2026-10-01  
**Status:** Approved and implemented  
**Approved specification:** [Chat-list Project status removal design](../specs/2026-10-01-chat-list-project-status-removal-design.md)

## Boundary and ownership

This is a localized frontend change. Preserve the existing conversation link, project status text, participant count, latest-message time, badges, list states, and the Project status controls inside conversations and elsewhere. No backend, API, permission, dependency, or data changes are planned.

The chat-list source and tests have no pre-existing local diff. Other approved workspace redesign files are dirty; leave them untouched. One frontend owner should make the linked source and test edits so the markup and assertions stay aligned. The primary agent owns integration and final verification.

## Dependency-ordered tasks

| Task | Affected area and owner | Work | Acceptance criteria |
| --- | --- | --- | --- |
| 1. Capture baseline | Primary agent, read-only | Recheck dirty paths and the target diff; inspect the existing row test and other `ProjectStatusButton` uses. | Existing unrelated edits are identified and preserved; the exact list-only removal boundary is confirmed. |
| 2. Compact each conversation row | Frontend owner: `frontend/src/features/messages/ProjectConversationList.tsx` and only the orphaned `.project-messaging-row-actions` rules in `frontend/src/features/project-status/projectStatus.css` | Remove the row-level button import and action wrapper; delete its two now-unused CSS rules. Keep the link and all row metadata/badges unchanged. | No row button or reserved action strip; selected and unselected rows share the compact structure; other status controls retain their component and styles. |
| 3. Update focused assertions | Same frontend owner: `frontend/src/features/messages/ProjectMessagesPage.test.tsx`, and `ProjectConversationList.test.tsx` only if its existing coverage needs a focused assertion | Replace the test expecting independent row status buttons with checks for no row button, retained project/status metadata, and working conversation links. Keep existing header status and list-state tests. | Tests cover the specified behavior without duplicating implementation details or changing unrelated test fixtures. |
| 4. Review and verify integrated result | Primary agent | Review the final diff against the approved spec; run focused tests, frontend typecheck and build, desktop/mobile rendered checks, and repository hygiene checks. Fix any regression within the approved scope. | All four specification acceptance criteria have evidence; no unrelated file is altered by this task. |

Tasks 2 and 3 are coupled and should run in order under one writer. After an execution-mode choice, an independent read-only audit of other status-control consumers can run alongside that writer in Mode A; there is no useful parallel writing split for this small change. In Mode B, the primary agent performs the tasks inline.

## Verification

1. Run `cd frontend && npm test -- src/features/messages/ProjectConversationList.test.tsx src/features/messages/ProjectMessagesPage.test.tsx src/features/project-status/ProjectStatusButton.test.tsx` to cover list behavior and the shared status control.
2. Run `cd frontend && npm run typecheck` and `cd frontend && npm run build`.
3. Render the Messages list at desktop and mobile widths. Confirm the row link remains keyboard reachable, project metadata is visible, the extra action line is gone, and no page-level horizontal overflow appears. Check an in-conversation Project status control still opens normally.
4. Run `git diff --check` and `git status --short`; inspect the final diff for out-of-scope changes. Do not stage, commit, push, or deploy.

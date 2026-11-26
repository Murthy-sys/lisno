# Designer assignment reminder chip and popup

Date: 2026-11-25
Status: Approved and implemented; scoped verification passed on 2026-11-25

## Goal and interpretation

When Super Admin sends a Designer an assignment request, make it visible through a colored gradient reminder chip at the top right of the Designer workspace. Clicking the chip opens request details and action buttons in a popup.

Interpretation based on the current assignment workflow: this reminder is for **pending assignment requests**, with **Accept assignment** and **Decline** actions. “Assigned Designer” refers here to the Designer receiving the request; assignment still becomes effective only after acceptance.

## Current behavior and evidence

- `frontend/src/features/designer/DesignerAssignmentInbox.tsx` already reads the current Designer's pending requests, polls every 60 seconds, and supports versioned, idempotent acceptance/decline.
- `DesignerDesignPlanTasksPage.tsx` renders that inbox as a full inline section in the design-plan workspace, including loading/error branches. It is not exposed in the shared header or on the main Designer dashboard.
- `components/layout/AppShell.tsx` renders the common `WorkspaceTopbar`, whose action area supports role-specific reminder controls alongside notifications and the account menu.
- `components/ui/Dialog.tsx` already provides the popup presentation and overlay focus/keyboard behavior.
- The current inbox API returns safe request previews and `pagination.total`; no backend or database change is needed for this presentation.

## Scope

Frontend presentation and its regression coverage only. Reuse the current inbox API, decision endpoints, cache invalidation, permissions, and shared Dialog.

Replace the full inline assignment inbox with one shared header entry for Designers, so pending requests are accessible from the dashboard, project screens, design-plan workspace, and other authenticated Designer screens. Keep the existing assigned-project workflow and project status controls available.

No new dependencies, backend changes, migrations, email/push delivery, browser notifications, or reminder scheduling. Key-collection timers and post-acceptance task reminders are outside this change.

## Requirements and UX

### Reminder chip

1. Show **Assignment requests (N)** in the upper-right workspace action area when the authenticated Designer has pending requests. Derive N from the API's total, not the current page length.
2. Use a compact, clearly clickable chip with a restrained dark-olive-to-deep-teal gradient and high-contrast light text. The user explicitly requested a gradient; confine it to this reminder. No pulsing, flashing, hover animation, added decorative icon, or invented urgency/deadline.
3. Show the chip only for a Designer with the existing inbox-read permission. Other roles must neither see it nor fetch that Designer inbox.
4. When no requests remain, remove the reminder. Initial loading must not invent a zero count. A temporary fetch failure exposes a recoverable “Assignment requests · Retry” entry rather than silently pretending there are no requests. Permission denial hides cached previews and disables access.
5. Preserve navigation, notification, and account controls on mobile. Allow the toolbar to wrap when needed; the chip must remain reachable without horizontal scrolling or covering content. Keep a minimum 44px interactive target, visible keyboard focus, and a complete accessible name.

### Popup and actions

6. Clicking or keyboard-activating the chip opens the shared Dialog titled **Assignment requests**. Do not automatically open it when new requests arrive.
7. Show each request's existing safe preview: project name, saved location, preferred language, approved-scope counts, and any backend-provided blocker. Missing values stay explicit.
8. Provide **Accept assignment** and **Decline** per request, preserving request ID, expected version, idempotency, permission checks, and duplicate-click protection. Do not add an unnecessary confirmation step.
9. Multiple requests can be reviewed in the popup with the existing pagination. After a decision, refresh the total and current page; if the last item on a later page disappears, return to a valid page rather than stranding remaining requests.
10. Keep the popup open after a successful decision long enough to show its outcome. Remaining requests stay available; when none remain, show “No pending assignment requests” until the user closes the popup. If the trigger disappears, return focus to a stable workspace control when closing.
11. A successful acceptance refreshes the existing assigned-project/workflow queries. The Designer continues through the current design flow; opening a pending request does not grant access to project documents or contacts.
12. If another Designer accepts first, or Super Admin cancels the request, refresh and remove/disable obsolete actions. Explain the closed request without exposing the winner's identity. Preserve the backend's first-valid-acceptance behavior.
13. Refetch when opening the popup, retain the existing 60-second polling, and invalidate affected queries after decisions. Disable decisions while data is being refreshed or has an unresolved fetch/conflict error. Closing the popup does not mark a request accepted, declined, or dismissed permanently.
14. Reuse Dialog focus trapping, labelled title, Escape/close behavior, scroll containment, and busy handling. Keep feedback in a live region. Reset popup selection/page state across authentication identity changes and prevent cross-user cached previews.

## Integration and data invariants

- Prefer extending the existing inbox component into the single reminder/popup entry point. Mount it once in the shared workspace actions and remove its duplicate inline mounts from `DesignerDesignPlanTasksPage`.
- Keep shared shell changes scoped to placement and responsive layout. Other roles' controls and generic notifications keep their existing behavior.
- Reuse `designerAssignmentKeys.inbox` with actor/review-session scoping and `refreshDesignerAssignment`; do not introduce a second source of truth or duplicate decision implementation.
- Reuse the existing safe inbox contract. Do not fetch full project details for a pending preview or expose another Designer's requests.
- Existing multiple-request transactions, accepted assignment identity, Client handoff, appointment deadlines, and kickoff gates remain authoritative and unchanged.
- Preserve existing dirty work from completed features. Capture the relevant implementation baseline before edits.

## Risks and failure handling

- A global header mount can accidentally query for other roles or duplicate requests; verify role/permission gating and a single mounted reminder.
- Repeated decisions and lost responses can replay incorrectly if retry keys are reset; preserve the tested idempotency behavior.
- Polling can remove the selected request or last page while the popup is open; show the current state, prevent stale decisions, and recover pagination.
- A disappearing trigger can lose keyboard focus; provide an explicit stable focus fallback.
- The mobile toolbar already contains several controls; validate real shell widths and safe-area spacing, not only an isolated chip.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | A Designer with pending requests sees a gradient chip and correct total across Designer screens. | Component and AppShell integration tests; desktop/tablet/mobile rendered checks |
| AC2 | Click, Enter, or Space opens a labelled popup with the existing safe previews and per-request actions. | Rendered keyboard, focus, and accessibility checks |
| AC3 | Acceptance/decline use the existing version/idempotency contract and refresh counts and assigned work. | Focused inbox mutation, retry, and invalidation regressions |
| AC4 | Multiple pages, last-item decisions, external acceptance/cancellation, and refresh failures do not leave stale actionable requests. | State-transition and pagination regressions |
| AC5 | Other roles and unauthorized Designers do not fetch or see the inbox; pending previews do not mount full-project data. | Asymmetric role/identity and permission tests |
| AC6 | Closing restores sensible focus, mobile does not overflow, and other header controls still work. | Real-shell visual checks at representative widths, accessibility scan, and existing shell/dialog regressions |
| AC7 | Frontend typecheck/build and scoped tests pass; no backend/runtime migration is required. | Focused frontend suites, `npm run typecheck`, `npm run build`, and `git diff --check` |

## Open decisions

No blocking decision. The pending-request interpretation and shared Designer-header placement above are the proposed scope for approval. If the requested reminder instead concerns already-accepted project tasks, that changes the data/actions and should be clarified before implementation.

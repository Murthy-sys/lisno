# Show only the assigned Designer after acceptance

Date: 2026-11-25
Status: Approved and implemented; scoped verification passed on 2026-11-25

## Goal

In Super Admin → Project → Assignment → Designer, once a Designer accepts and becomes the assigned Designer, show that Designer alone. Hide other Designer cards and assignment-request controls for that project.

## Current behavior and evidence

- `frontend/src/features/admin/DesignAssignmentPanel.tsx` displays `currentDesigner` but still renders the search, candidate cards, request buttons, pending-request controls, and pagination. This explains the screenshot showing an assigned Designer alongside buttons for other Designers.
- `backend/src/services/designer-assignment.service.ts` already commits acceptance and project assignment together and cancels competing pending requests with `assigned_elsewhere`. That behavior is already implemented.
- The suggestions response includes `currentDesigner` independently of search and pagination. Project details also expose `estimate.designPlanDesigner` for an existing assignment.
- The panel polls every 60 seconds and refreshes through the existing assignment query invalidation. Current tests explicitly cover the older presentation of replacement requests after assignment; those expectations need updating for this screen.

## Scope and approach

Make a localized frontend presentation change to the existing panel and its regression tests. Use the existing persisted assignment data, preserving stable project/Designer IDs and the existing backend acceptance flow.

The newest instruction supersedes the earlier requirement to offer replacement candidates within this panel. It does not require adding a replacement workflow or changing the backend reassignment API policy. No backend/schema changes, migration, dependency, automatic assignment mutation, or historical-request cleanup is proposed.

## Requirements

1. Before assignment, preserve the existing Designer cards, ranking, search, pagination, and ability to send requests to multiple Designers.
2. When the current project has an assigned Designer, replace the candidate interface with a compact **Assigned Designer** summary containing the assigned person's name and the message **This project is assigned to <name>.**
3. Hide all other Designer cards, search controls, candidate counts, previous/next controls, send/cancel-request actions, and text about waiting for the first acceptance. Do not add a Change Designer or reassignment action.
4. Read the assigned identity from the same-project `currentDesigner` response; do not depend on whether that person appears on the selected candidate page or matches the current search. Where suggestion fetching is unavailable or ineligible, use the existing authorized project-detail assignment field. Never borrow another project's or actor's cached data.
5. Show the assigned summary even if the project has progressed beyond the stage at which new assignment requests are permitted. Lack of assignment-management permission must not trigger a suggestions query or expose new controls; an already-authorized project-detail assignment can remain visible.
6. When the existing polling/refetch/invalidation observes acceptance, switch to the assigned summary automatically. Preserve the current 60-second polling behavior; no new push transport is required.
7. Preserve safe loading/error/permission behavior. Do not render actionable candidates from an unresolved or denied response, and do not infer that a project is unassigned from a failed fetch. Previously confirmed assignment information must not cause request controls to reappear on a transient error.
8. Keep the assigned summary readable on desktop and mobile, with semantic text and no new visual decoration or unnecessary card controls.

## Invariants and risks

- The backend remains the authority for acceptance and project membership. Rendering this panel does not assign a person or modify requests.
- First-valid acceptance continues to close competing pending requests. The Designer reminder and Client handoff remain connected to the existing APIs.
- Assignment must remain visible when the candidate search excludes the winner, the selected page changes, or the project's assignment eligibility becomes false.
- Do not overwrite existing dirty work in the panel, its tests, or synthetic fixtures; capture the relevant baseline before implementation.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | An unassigned project still offers multiple Designer requests. | Existing focused panel regressions |
| AC2 | An assigned project shows only its assigned Designer summary, with no candidate/search/request/pagination controls. | Rendered assertions, including winner outside the active search/page |
| AC3 | Acceptance detected on refetch replaces the candidate interface automatically. | Existing polling test updated to assert the complete transition |
| AC4 | The summary remains correct for progressed projects and recoverable failures, without extra permission or cross-project exposure. | Focused project-detail/permission/error regressions |
| AC5 | The simplified summary works at desktop and mobile widths. | Synthetic browser acceptance flow and responsive/keyboard check |
| AC6 | Focused tests, frontend typecheck/build, and `git diff --check` pass. | Record exact results in the task plan |

## Open decisions

None. This specification covers the requested post-acceptance Super Admin screen behavior using the existing assignment source of truth.

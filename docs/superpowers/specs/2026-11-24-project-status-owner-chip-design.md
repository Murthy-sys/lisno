# Project screens: status and task-owner chip

Date: 2026-11-24
Status: Approved and implemented in Mode A. Focused verification, typecheck, build and browser QA passed; broader-suite limitations are recorded in the task plan.

## Goal

Display the current project stage/status and the person responsible for its pending task in a compact chip at the top-right of every screen dedicated to that project. Make this visible without first opening a drawer. Clicking the chip opens the existing Project status details.

Example with synthetic data: **Estimate approval · Owner: Maya**. On narrow screens the same chip can use two lines.

## Current behavior and evidence

- `frontend/src/features/project-status/ProjectStatusButton.tsx` already provides an authorized status control and accessible details drawer. Its trigger currently says only “Project status”. Known participants normally fetch only when opening the drawer; unconfirmed contexts fetch to verify access. It polls while the drawer is open.
- `GET /projects/:projectId/status` already returns `ProjectStatusSummary`: project identity, lifecycle status, derived state, current stage, and ordered pending actions with responsible roles and named people. Frontend types match `backend/src/contracts/project-status.ts`.
- `backend/src/domain/project-status.ts` derives stages/actions and establishes the current stage from the first added action. `project-status.service.ts` verifies membership and reads the underlying sources within one snapshot. This is the source of truth; no UI inference from names, roles or page content is needed.
- Existing callers include project chat/navigation, Client, designer, management, administrator, finance, procurement, linked leads/estimates, execution and task queues. Placement varies; some controls are below the heading or inside an options disclosure. The standalone quotation and Project Manager estimations screens need explicit header coverage.
- Existing tests cover membership, stale/denied reads, identity changes, delayed project responses, multiple owners, schedules and accessible drawer dismissal. Preserve these protections while changing the header presentation and fetch lifecycle.

## Interpretation and coverage

“Every screen for that project” means project-specific pages across authorized roles, including their tabs. “Owner” means the assigned person or people responsible for the current pending project action, not a permanently assigned Project Manager or the signed-in viewer.

| Project context | Required placement |
| --- | --- |
| Client project details and standalone quotation | Top-right project/page header; retained across estimate/review views |
| Designer, Manager, Head and Admin project details | Top-right header; retained across project tabs |
| Procurement and Finance project pages | Top-right header |
| Project execution, Project Manager tabs and approved-estimation page | Top-right outer project header; avoid duplicates in embedded views |
| Project messages | Right side of the project chat header |
| Sales lead and estimate workspaces linked to a project | Right side of their header using the loaded stable project ID |
| Selected project/task detail views opened from queues or work lists | Right side of the detail header when one authorized project is selected |

An unlinked lead, a project list, dashboard or cross-project queue has no single project owner. Do not choose a project implicitly or add an always-polling chip to every list row. Existing list-level status controls can retain their current behavior. PDF artifacts, emails, configuration pages and every nested form/modal are outside this header change.

## Recommended approach and alternatives

Extend the existing shared status control with a header-chip presentation and reuse its query and drawer. Integrate it into each project header/action slot, suppressing a duplicate old status trigger within the same header/navigation area. Keep standalone list controls compatible. This follows the current architecture and avoids creating another project-status calculation or reader.

A global application-topbar chip would require new active-project registration and arbitration for selected records, embedded project views and chat. It provides one physical location but introduces unnecessary global context for this request. Prefer the existing project headers, consistently right-aligned.

## Display rules

1. Show the saved current-stage label and the owner of the first backend-ordered action for that stage. Do not reorder actions or choose the viewer's task preferentially. The details drawer continues to show the full action text, deadlines, blockers and all pending work.
2. One assigned person: show their name. Multiple people on that action: show the first server-ordered name and `+N`; provide all names in the accessible chip description and drawer. Additional pending actions get an explicit `+N tasks` indication.
3. No assigned person for an otherwise valid action: show **Unassigned** and the backend responsible-role label. Never substitute a manager, designer or current user.
4. Preserve meaningful states: scheduled work says **Scheduled**, blocked work says **Blocked**, paused work says **On hold**, completed projects say **Completed**, and a valid empty queue says **No pending tasks**. Completed/empty states do not invent an owner. The drawer retains the complete state/stage explanation.
5. An unavailable/inconsistent source says **Status needs review** and does not present a guessed owner. A mismatched project ID is never rendered as the current project's status.
6. Use the existing restrained typography, neutral background, border and focus treatment. No new icons, decorative effects, shadows or animation. Keep the chip compact with readable wrapping and a comfortable touch target.
7. Align to the top-right of the project content header. On mobile it may occupy a second header row, remaining right-aligned and within normal layout flow. Do not overlay content, primary actions or browser/PDF controls. Long stages/names must not create page-wide overflow; full details remain keyboard accessible.

## Data, access and refresh contract

- Frontend-only change. Reuse the existing endpoint and identity-scoped query-key family, backend action order and stable person/project IDs. No backend, schema, permission, workflow, financial or stored-artifact changes.
- Header chips fetch when mounted for an authenticated, permitted project context, so status and owner are available before a click. Deduplicate shared queries for the same project/identity.
- Refresh on mount, window focus and existing project-status invalidations. While the active header is mounted and the document is visible, refresh every 30 seconds. Stop background polling on hidden tabs, unmount and denied access. Existing non-header controls retain their bounded fetch behavior.
- For confirmed participants, use a neutral loading label until fresh status arrives. For contexts requiring independent membership verification, expose no project/owner data before a successful authorized response. Do not elevate project-read permission into status permission.
- After a successful read, a transient failure may retain that same identity/project's data only with an explicit **Out of date** indicator and retry access. An initial failure shows unavailable/retry where access is already established; an unverified context remains non-disclosing.
- On 401/403/404 or membership removal, close the drawer, hide sensitive content and retire cached status as the existing control does. Switching project or signed-in identity must immediately reset the previous chip/drawer; delayed responses cannot restore them.
- Clicking/keyboard activation opens the current details drawer; Escape closes it and restores focus to the chip. Preserve the Project status accessible-name convention and include the visible summary in its accessible description.

## Scope, constraints and risks

The shared status component/API consumer, project header integrations, scoped styles and their tests are in scope. Reuse `PageHeader.actions` or the corresponding custom header slot rather than introducing a separate global state system. Keep existing navigation, totals, review controls and unsaved forms intact.

Prior Client-section and quotation-summary changes are dirty in this worktree. Capture fresh status and per-target diffs before assigning any writer; preserve and build on them explicitly, especially in `ClientProject.tsx`.

Principal risks are stale/wrong-project ownership, accidental access disclosure, excessive polling in lists, duplicate chips in nested views, misleading singular ownership and crowded phone headers. Verification must target these directly.

No migration or external action is needed. Rollback is reverting the new presentation/header integrations while retaining the existing status service and drawer. No deployment, commit, push or customer communication is included.

## Acceptance criteria

1. Every project context in the coverage table displays one appropriate top-right chip without requiring a drawer click, subject to existing status authorization. No chip is assigned to an unlinked or ambiguous project context.
2. Identical authorized project data produces the same stage/status and ownership summary across roles/screens. At least two unequal projects and identities prove IDs, names and delayed responses cannot mix.
3. Multiple people/tasks, unassigned, scheduled, blocked, on-hold, completed, empty and unavailable states follow the display rules. The existing drawer retains every pending action and owner.
4. Mount/focus/visible polling and invalidation update the chip; hidden/unmounted views stop polling. No per-row polling is introduced. Transient stale, denied, mismatched and initial-loading states remain explicit and safe.
5. Keyboard activation, drawer dismissal/focus restoration and screen-reader names work. Desktop, tablet and phone checks with long labels show readable alignment, no duplicate chip and no overflow or overlap with existing controls.
6. Focused shared-control, header, routing and affected project-screen regressions, frontend typecheck/build and repository diff checks pass. Preserve unrelated work; no backend/API, dependency or lockfile changes.

## Open decisions

No blocking choice remains under the interpretations above. Specification approval confirms coverage across authorized project screens and that “owner” refers to the current backend-tracked project action. The separate task plan follows approval and will establish bounded ownership and exact verification commands.

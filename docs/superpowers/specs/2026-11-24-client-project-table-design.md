# Client home: simple project table

Date: 2026-11-24
Status: Approved and implemented in Mode A (parallel sub-agents). Scoped regression, typecheck, build, integrity review and rendered desktop/phone checks passed. See the task plan for verification evidence and unrelated baseline failures.

## Goal

Simplify the Client home screen into a table of all projects shared with the signed-in client. Each project opens its existing full project-details page directly. This is a frontend presentation change only.

## Current behavior and evidence

- `/client` renders `frontend/src/features/client/ClientDashboard.tsx`: an overview band, estimate summary, expandable project cards, per-project workflow previews and a quick-view dialog. Reaching full project details currently requires expanding a card or entering quick view.
- `getClientProjectSummaries` in `clientApi.ts` already loads every page of the authorized project-summary endpoint. `ClientProjectSummary` supplies stable ID, project number, name, location, status, progress and planned completion date. No new data field or endpoint is needed.
- `/client/projects/:projectId` already renders `ClientProject.tsx`, including applicable estimation, approvals, workflow, messages, site/vendor reviews, floors and approved documents, with Back to projects navigation.
- Existing `/client?estimate=...` links are used by review workflows and tests. `ClientEstimateSummary` validates the estimate/project association and supports legacy review flows. Simplifying the normal landing page must preserve those links.
- The working tree was clean at initial inspection. Capture a fresh status/diff before implementation.

## Presentation and interaction

1. Title the normal landing page **My projects**, with a compact total count.
2. Replace the dashboard overview, estimate-summary section, project cards, workflow previews and quick-view entry points on the normal `/client` page with one semantic projects table.
3. Use these columns, all sourced from the existing response:

   | Column | Presentation |
   | --- | --- |
   | Project | Project name and existing public project number |
   | Location | Existing location text |
   | Status | Readable existing status label |
   | Progress | Existing backend percentage |
   | Expected completion | Existing planned end date, or a clear unavailable value |
   | Action | Open project link |

4. Make the project name and Open project action links to `/client/projects/${encodeURIComponent(project.id)}`. Give repeated actions project-specific accessible names. No expansion or intermediate dialog is required.
5. Display every authorized project returned by the existing paginated reader; do not silently limit the table to the first API page. Preserve the returned ordering. Sorting, filters, export and new pagination controls are outside this request.
6. Keep the existing full project page and its business functionality. The normal flow is My projects → Open project → existing full details → Back to projects.
7. Preserve direct estimate-review links using the existing `ClientEstimateSummary` path only when an `estimate` query parameter is present. This compatibility view may retain its existing review content alongside the project list; ordinary `/client` remains table-focused. Preserve invalid/unavailable-link feedback and verified project associations.

## Data, state and compatibility

- Reuse `clientKeys.projects`, `getClientProjectSummaries`, and existing frontend types without contract changes. Do not change backend files, routes, authorization, persistence, calculations, financial values or approval rules.
- The ordinary table does not need approved-version queries, estimate-review queries or one workflow query per project. Remove only the dashboard mounts that cause these now-unused reads; existing project-detail readers and conditional estimate-review compatibility remain.
- Preserve existing transient-refresh behavior: a previously authorized list can remain visible with an explicit stale notice and Retry. A denied/non-transient read must retire the retained list; never display another account's projects or guess project identity.
- Provide distinct loading, no-projects, error/retry and stale states. Use readable existing loading components, not skeletons. Missing or invalid dates must not crash rendering or become invented dates.
- No automatic selection, navigation on data arrival, writes, email or publication is introduced.

## Visual and responsive constraints

Use the existing Client typography and muted warm background, restrained separators, aligned cells and clear keyboard focus. Keep styles scoped to Client home. No new icons, gradients, shadows, cards, hover motion, decorative effects, dependencies or global visual redesign.

Use a native table with proper column headers. Allow long project/location names to wrap. On narrow screens keep the table in a labelled, keyboard-accessible horizontal scroll container so columns remain available without causing page-wide overflow. Keep the project identity and action easy to find. Do not replace the table with project cards on mobile.

## Scope, assumptions and risks

- “Client screen” means the `/client` My projects landing page. Full project details already exist and are not being redesigned.
- “All projects” means all projects authorized for the current client, never the organization-wide project collection.
- Main implementation areas are `ClientDashboard.tsx`, `client-dashboard.css`, and dashboard/navigation regression tests. Preserve shared components that are still used elsewhere.
- Principal risks are broken review links, accidental loss of stale/denied-data handling, CSS leakage into project details, inaccessible repeated links and wide mobile tables. Focused regression and rendered desktop/mobile checks must cover these.
- No unresolved product decision blocks this specification. No migration or deployment is required; rollback is a frontend presentation revert.

## Acceptance criteria

1. Normal Client home shows one project table with all authorized projects and the specified existing fields; no overview tiles, project cards or quick-view detour.
2. Project name and action open the correct existing full detail route by stable ID; Back to projects returns to the list.
3. Detail-page estimation, approvals, tasks, messages and documents remain accessible. Existing current/legacy estimate-review deep links and unavailable-link handling still work.
4. Loading, empty, error, transient stale and access-denied states remain correct; multi-project fixtures prove row values and destinations are not mixed.
5. Desktop and phone-width checks verify wrapping, table scrolling, keyboard focus and accessible names without page-wide horizontal overflow.
6. Only frontend presentation/tests and working documents change. Focused dashboard, deep-link and project-navigation tests, frontend typecheck/build and `git diff --check` pass. Backend/API/schema/dependency files remain untouched.

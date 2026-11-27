# Designer workspace shows only the opened project

Date: 2026-11-27
Status: Approved and implemented locally in Mode A; verification recorded in the separate task plan
Classification: Small, bounded frontend presentation and project-selection correction

## Goal

When a Designer opens a project from the existing dashboard table, show only that project's workspace. Remove the **Project queue / Assigned projects** sidebar and use the available width for the opened project.

## Current behavior and evidence

- `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx` loads the authorized assignment collection, selects a task using the `estimate` URL parameter, and renders both the complete assignment sidebar and the selected project's details. Selection currently falls back to the first task even when the requested estimate does not match.
- `frontend/src/styles/designer-design-plans.css` reserves a 17–20rem sidebar column beside the workspace; the workflow timeline spans both columns. Below 980px the project queue moves above the workspace.
- `frontend/src/features/designer/DesignerDashboard.tsx` already provides the projects table and links to `/designer/design-plans?estimate=<id>`. The workspace already has **Back to dashboard** navigation.
- The generic Design plans navigation and some estimate return links use `/designer/design-plans` without a selected estimate. This entry must remain understandable after removing the queue.
- Existing `DesignerDesignPlanTasksPage.test.tsx` tests depend on the sidebar for display assertions and project switching. Their underlying workflow, upload, identity, and state-reset coverage must remain intact when navigation replaces sidebar interaction.
- The initial worktree contains the previous execution-choice feature and its approved documents (35 dirty paths). The Designer page, its tests, and `designer-design-plans.css` have no initial diff. Preserve all previous work, including the execution-choice section consumed by this page.

## Requirements and UX

1. Remove the assigned-project queue from the Designer design-plan workspace at every viewport. Do not replace it with another project list, dropdown, drawer, or carousel.
2. Use a single content column for the selected project. Keep the existing workflow timeline above it and eliminate the empty sidebar space.
3. Keep the selected project's name, ID, Client, next action, status, design team, key collection, execution choice, workflow actions, designs, and review information available according to their existing permissions and workflow state.
4. Resolve a specific project only by the existing `estimate` URL parameter and the authorized assignment result. An unknown, removed, or inaccessible selection must show an unavailable state with **Back to dashboard**, never another project's details.
5. When no estimate is specified, show **Select a project from your dashboard** with dashboard navigation. Do not automatically open the first assignment. Keep distinct loading, failed-read/retry, and no-assignment states.
6. Preserve dashboard project links and the workspace's **Back to dashboard** link. Browser navigation, reload, and changes to the selected estimate must load the correct project and reset project-specific forms as before.
7. Remove CSS used only by the deleted queue; preserve shared upload, status, project-summary, and responsive styling. Retain semantic headings, keyboard-accessible navigation, and layouts without new horizontal overflow.

## Scope, assumptions, and constraints

- Scope is the existing web Designer workspace, its stylesheet, and relevant rendered/navigation regression tests. The screenshot identifies this surface; native and other roles' project views are outside scope.
- Continue using the existing authorized task-list endpoint to resolve the selected task. This is a display/navigation change, not an API, authorization, or persistence redesign.
- No changes to project workflow rules, approval gates, financial calculations, design uploads, assignment management, the dashboard table, or the previous permanent execution-choice feature.
- No new dependencies, lockfile changes, database migration, backfill, production action, deployment, or commit.
- Missing-selection behavior is the evidence-backed default above, because the dashboard already owns project selection. There are no unresolved product decisions requiring another clarification.

## Risks and acceptance criteria

The main risks are leaving a blank grid column, displaying the first assignment for a stale URL, or losing project-switch reset coverage when removing the sidebar tests.

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | Opening project B from a list containing unequal projects A and B displays only B's workspace; no assigned-project queue or other project names appear. | Rendered route/query selection regression with two distinct projects. |
| AC2 | The selected project and timeline use the workspace width at desktop, tablet, and phone sizes without a reserved sidebar column or new overflow. | Rendered browser inspection at 1440, 768, and 390px. |
| AC3 | Missing selection shows the dashboard prompt; an unmatched or removed selection shows unavailable; neither opens another project or requests its details. | Missing/invalid/removed-selection tests, including assignment refresh. |
| AC4 | Dashboard links, Back to dashboard, reload, and route changes retain the correct project; draft forms do not cross project boundaries. | Existing navigation/reset assertions adapted to route-driven selection. |
| AC5 | Selected-project workflow, quotation, design-team, uploads/reviews, and permanent execution-choice behavior remain intact. | Focused Designer page/furniture/dashboard tests and relevant integration coverage; frontend typecheck and build. |
| AC6 | Previous task changes are preserved and no unrelated files or generated artifacts are included. | Initial/final diff review, `git diff --check`, and `git status --short`. |

This stage creates only this specification. The separate task plan follows specification approval under the repository's `AGENTS.md` workflow.

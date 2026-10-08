# Procurement Projects navigation label

Date: 2026-10-04
Status: Approved 2026-10-04; implemented

## Goal

Show **Projects** instead of **Dashboard** for the Procurement team's project-list link inside the Procurement navigation group.

## Current behavior and evidence

- `frontend/src/app/routeRegistry.ts` defines the Procurement-role group child as `Dashboard`, linking to `/procurement` with `procurement.workspace.read`.
- `/procurement` renders `ProcurementWorkspace`, which lists design-approved projects and opens each project's procurement page.
- The Super Admin group also has a `Dashboard` child, but `/admin/procurement` renders vendor activity metrics rather than a project list.
- `frontend/src/components/layout/navigation.test.tsx` checks both group labels and the active Procurement project route. The target registry and navigation test files have no existing local edits; other repository work is present and must be preserved.

## Scope and behavior

- Change the Procurement-role child label for `/procurement` to `Projects` in the route registry and update the relevant navigation assertions.
- Preserve its route, permission, group placement, icon, active state, keyboard behavior, and project-page navigation.
- Keep the Super Admin vendor-metrics child labeled `Dashboard` and keep page headings unchanged.

## Constraints and impacts

- Presentation-only frontend change. No backend, API, persistence, authorization, Configuration, or migration changes.
- The label must be the same in desktop and mobile navigation and remain the accessible link name.
- Preserve all unrelated dirty work.

## Acceptance criteria

1. A Procurement-role user sees `Procurement > Projects` and the link still opens `/procurement`.
2. On `/procurement/projects/:projectId`, `Projects` remains marked as the current navigation item.
3. A Super Admin still sees `Procurement > Dashboard` for the vendor-metrics page.
4. Focused navigation tests and frontend typecheck pass; a rendered navigation check confirms the label and active state.

## Risks and open decisions

- The same former label appears in two role-specific destinations. Relabeling the Super Admin child would misdescribe its current vendor-metrics page, so this specification limits the change to the Procurement project-list child.
- No other product decision is needed for this bounded rename.

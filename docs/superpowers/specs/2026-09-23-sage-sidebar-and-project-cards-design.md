# Sage side navigation and project card grid — specification

Date: 2026-09-23
Status: Draft, awaiting approval
Classification: Substantial (shared shell styling for every role, plus a product list screen; frontend only, no API change)
Related: [Login sage redesign](2026-09-23-login-screen-sage-redesign-design.md)

## Goal

Bring the app shell and the projects list in line with the new sage login look, following the supplied "All Projects"
reference:

1. The side navigation has a dark olive background with light, outlined icons.
2. The projects page shows a responsive grid of image-topped project cards. For now the image is a skeleton
   placeholder.

## Current behavior and evidence

### Side navigation
- `components/layout/Sidebar.tsx` renders the brand, the "Signed in as" role, `NavLink`s with a lucide icon, a label,
  and a hover arrow, and the account menu.
- Rail background: `styles/role-themes.css:1772` sets `--role-rail: var(--color-primary)` (#1E183B navy) for **every
  role**, applied at `role-themes.css:378`. The mobile header uses the same token (`role-themes.css:398`).
- Icons: `role-themes.css:384` colors nav icons `var(--color-highlight)` (#D5AD18 yellow).
- Active and hover state: a 10% white background (`role-themes.css:388–396`). Admin and Super Admin add an amber
  border and dot (`styles/admin-home.css:144–178`).
- `role-themes.css` and `admin-home.css` are clean in git. `access-administration.css` is dirty from unrelated work
  and will not be touched.

### Projects list
- The only projects list in navigation is `/admin/projects`: "My Projects" for Admin, "All Projects" for Super Admin.
  It is `features/admin/AdminProjectsPage.tsx`, which is clean in git.
- It already renders one card per project **as a full-width row**, under a column header row (Project, Location,
  Sales, Lead progress, Next action, Estimate), with Quick view and, when pending, Assign Designer. It pages 20 at a
  time.
- Data (`AdminProjectSummary`, `api/types.ts:335`):
  - `id`, `name`, `status` (planning / active / on_hold / completed), `location`
  - `client.name`, `propertyType`
  - `estimator`, `lead.stage` and `nextAction`
  - `estimate`: status, total, `approvedBaseline`, and `designPlanDesigner`
  - `createdAt`
- **The data does not include:** progress %, an updated-at time, a manager, team members beyond the estimator and
  designer, or a project image.
- The list API (`GET /admin/projects`) accepts only `limit` and `offset`. It has **no search, status, type, manager,
  or date filters**.

## Proposed behavior

### A. Side navigation (all roles)
1. Rail background: dark olive, with a subtle vertical gradient from about #2F3A2A to #262F22. The phone menu bar
   at the top picks up the same colour.
2. Nav icons: light cream (about #E6E9DC, 85% opacity), 1.75 stroke, replacing the yellow.
3. Labels: cream. Active item: an 8% light fill with rounded corners and full-opacity icon and text. Hover: a 6% fill.
4. The Admin and Super Admin amber active border and role dot become a neutral light border and a sage dot, so there
   is no amber on olive.
5. No change to nav items, order, permissions, the account menu, the logo, or the "Signed in as" block. The
   reference's "Turn ideas into beautiful spaces" promo panel is **not** added.

### B. Project card grid on `/admin/projects`
1. The page header keeps its current title and description logic ("All Projects" / "My Projects"). The title uses the
   serif face. The action stays "Initiate project", with a leading plus icon. Permission gating is unchanged.
2. **Grid/list toggle**, aligned right above the cards:
   - two icon buttons with the accessible names "Grid view" and "List view", and `aria-pressed`
   - grid is the default
   - the choice is remembered per browser in `localStorage`, wrapped in try/catch
   - list view keeps today's row layout unchanged
3. Grid: 4 columns at 1280px and wider, 3 at 1024px and wider, 2 at 640px and wider, and 1 below that. The gap is
   about 20px.
4. **Card content**, top to bottom. Every value comes from existing data; nothing is manufactured:

   | Slot | Source |
   |---|---|
   | Image | Skeleton block with a 4:3 ratio, a sage-grey fill, and a gentle shimmer. It is `aria-hidden`, and the shimmer stops under `prefers-reduced-motion`. |
   | Status chip | The existing `adminProjectStatusLabel(project)`, colored by state: planning grey, active green, on hold red, completed teal, estimation/assignment pending blue |
   | Title | `project.name` (links to `/admin/projects/:id`) |
   | Person row | `client.name` |
   | Pin row | `location` |
   | Building row | `propertyType ?? "Property not captured"` |
   | Next action | `adminProjectNextAction(project) ?? "No action pending"`, as a small muted line |
   | Amount (right-aligned) | Exactly today's estimate logic and formatting: the client-approved baseline, labelled "incl. GST" for screen readers; otherwise the estimate status and total; otherwise "No estimate yet" |
   | Footer, left | "Created 3 days ago" from `createdAt`, relative time, with the full date in `title` and `dateTime` |
   | Footer, right | Up to two initials avatars: the estimator (Sales) and `estimate.designPlanDesigner` (Designer), each with an accessible name such as "Sales: Priya Sharma" |
   | Actions | "Quick view", plus "Assign Designer" when it is pending and permitted, exactly as today |

5. The whole card is a single link target. The Quick view and Assign Designer controls stay separate buttons, not
   nested inside the link. The accessible names are unchanged ("View details for X" and "Quick view X").
6. Loading shows skeleton cards in the grid shape. Error, empty, and pagination states are unchanged.

### Explicitly omitted from the reference (no data, no API support)
- The progress % next to the status chip.
- "Updated X ago". We show "Created X ago" instead.
- The manager and extra team avatars.
- The search bar and the Status, Project Types, Managers, and Date-range filters.
- Real project photos.

Each of these needs backend fields or query support and should get its own spec. Client-side filtering of a single
20-item page would give misleading results, so it is not done.

## Scope and non-goals

- In scope:
  - `styles/role-themes.css` (rail token and nav icon, label, and active rules)
  - `styles/admin-home.css` (Admin and Super Admin active border and dot)
  - `components/layout/Sidebar.tsx`: only if an icon `strokeWidth` prop is needed
  - `features/admin/AdminProjectsPage.tsx`
  - a new `features/admin/admin-project-grid.css`, or additions to `styles/admin-home.css`
  - tests: `AdminProjectsPage` tests, and `AppShell` or navigation tests if affected
- Non-goals:
  - the backend and API
  - the other role dashboards
  - the project detail page
  - the header search and notification bell
  - the sidebar promo panel
  - finance calculations

## Invariants

- Finance: the displayed amount uses the identical existing expression and formatter. There is no new calculation
  and no GST change.
- Stable IDs: card keys and links use `project.id`. Names are presentation only.
- Permissions: Initiate and Assign Designer stay gated by `hasFrontendPermission` exactly as today.
- Pagination, the Quick view dialog, and query keys are unchanged, so no invalidation changes are needed.

## Risks

- The rail colour is shared by all roles. A role-specific stylesheet may still override the olive, for example the
  designer's mobile rail in `designer-home.css`. All role shells need a screenshot check.
- Existing `AdminProjectsPage` and router tests assert current row markup and text, and will need targeted updates.
- Light cream icons on olive must meet 3:1 non-text contrast, and labels must meet 4.5:1.

## Acceptance criteria

- AC1: The side navigation shows the olive background and cream outlined icons for Super Admin, Admin, Designer, and
  one other role, on desktop and in the mobile drawer and header (screenshots). Contrast meets 4.5:1 for labels and
  3:1 for icons.
- AC2: Nav items, permissions, active-route highlighting, and the account menu behave as before. The existing shell
  and navigation tests pass.
- AC3: `/admin/projects` shows the card grid by default at 1440px (4 columns), 1024px (3), 768px (2), and 390px (1).
  Each card shows the fields in B.4 from real data, with a skeleton image.
- AC4: The grid/list toggle switches layouts, exposes `aria-pressed`, and is remembered on reload. List view matches
  today's layout.
- AC5: The amount shown on a card for an approved, an unapproved, and a no-estimate project matches today's text
  exactly. The test uses two projects with unequal values.
- AC6: Quick view, Assign Designer (permitted versus not permitted), and pagination work as before. The loading
  skeleton, error, and empty states render.
- AC7: The skeleton shimmer is disabled under `prefers-reduced-motion`. Cards are keyboard reachable in reading order.
- AC8: `cd frontend && npm run typecheck && npm test && npm run build` passes, apart from the 17 known unrelated
  failures. `git diff --check` is clean.

## Open decisions

- **D1 — Sidebar scope.** *Recommended:* all roles, since the shell is shared. The alternative is Admin and Super
  Admin only.
- **D2 — Missing reference fields.** *Recommended:* omit progress %, "updated", the manager, and the filters, as
  listed above, until the backend provides them. The alternative is to add backend fields and filters now, as a
  separate larger spec.

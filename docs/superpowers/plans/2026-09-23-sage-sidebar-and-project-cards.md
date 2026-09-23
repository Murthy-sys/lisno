# Sage side navigation and project card grid — task plan

Spec: [2026-09-23-sage-sidebar-and-project-cards-design.md](../specs/2026-09-23-sage-sidebar-and-project-cards-design.md)
(approved; D1 = all roles, D2 = omit unsupported fields)

## Pre-flight facts

- Clean in git (safe to edit):
  - `styles/role-themes.css`
  - `styles/admin-home.css`
  - `styles/shell.css`
  - `features/admin/AdminProjectsPage.tsx`
  - `features/admin/AdminProjectsPage.test.tsx`
  - `features/admin/adminProjectPresentation.ts`
- Dirty with unrelated work (do not touch): `styles/access-administration.css`, `app/router.test.tsx`, and
  `components/layout/AppShell.test.tsx`. AppShell has one line from this session.
- The rail token is `role-themes.css:1772` (`--role-rail`). The icon color is `role-themes.css:384`.
- The Admin and Super Admin amber active styles are at `admin-home.css:144–178`. The designer mobile rail is at
  `designer-home.css:89`, which needs a check.
- `AdminProjectsPage.test.tsx` asserts markup that must survive in grid view:
  - the list `name`
  - `listitem` and `article` names
  - "View details for X" and the Assign Designer link outside the project link
  - "Client-approved value (incl. GST)" and ₹ amounts
  - the Initiate button and the pagination nav
- It also asserts row-only text, which moves to list view:
  - "3BHK · Pune"
  - "View project"
  - "Unassigned handoff" (twice)
- Baseline: the frontend suite has 17 known unrelated failures (AI estimator ×13, AppShell admin links, the
  accessibility access-request dialog, the signup Address label, and PasswordReset).

## Tasks (dependency order)

### T1 — Sidebar sage styling (AC1, AC2)
- Owner: sidebar/CSS slice
- Files:
  - `styles/role-themes.css`
  - `styles/admin-home.css`
  - `styles/designer-home.css`, only if it overrides the rail
- Changes:
  - `--role-rail`: an olive gradient.
  - Nav icons: cream at 0.85, with `stroke-width: 1.75` via CSS on `svg`.
  - Labels: cream.
  - Active: 8% light fill. Hover: 6% fill.
  - Admin and Super Admin: replace the amber border and dot with a neutral border and a sage dot.
  - Mobile header and drawer: inherit the token.
- No TSX change expected.

### T2 — Card grid markup (AC3, AC5, AC6, AC7)
- Owner: projects slice
- Files: `features/admin/AdminProjectsPage.tsx`
- Changes:
  - Add a `view` state (`"grid"` | `"list"`), initialised from `localStorage["lisno.adminProjects.view"]` inside
    try/catch, with grid as the default. Write the value back on change.
  - Add a toolbar with "Grid view" and "List view" icon buttons (`LayoutGrid` and `List`), using `aria-pressed`.
  - Grid:
    - `<ul className="admin-project-grid" aria-label={collection}>` containing `AdminProjectGridCard`.
    - Each card is an `<li>` holding an `<article aria-label={name}>`, which contains:
      - a skeleton `div`, `aria-hidden`
      - a status chip with a `data-tone` taken from the status mapping
      - a `Link` "View details for X" wrapping the title and meta rows (client, location, property type, next
        action)
      - the amount, from an `estimateDisplay()` helper extracted verbatim from today's expression, with the same
        sr-only label
      - a footer with `<time>` showing "Created …" and the Sales and Designer initials avatars with accessible
        names
      - an actions row with Quick view and Assign Designer, outside the link
  - List: today's `AdminProjectsHeaderRow` plus `AdminProjectCard`, unchanged.
  - Loading: in grid view, show 8 skeleton cards in a `PageState`-compatible wrapper. The existing loading status
    text stays.
  - Header: add a `Plus` icon to "Initiate project"; the label is unchanged.
- Helpers, in `adminProjectPresentation.ts`:
  - `adminProjectStatusTone(project)`
  - `formatCreatedRelative(iso, now)`, a pure function using `Intl.RelativeTimeFormat("en-IN")`

### T3 — Card grid styles (AC3, AC7)
- Owner: projects slice
- Depends on: T2 (class names)
- Files: a new `features/admin/admin-project-grid.css`, imported by `AdminProjectsPage.tsx`
- Changes:
  - Grid breakpoints: 4, 3, 2, and 1 columns.
  - Card: white surface, 12px radius, hairline border, and a hover lift.
  - Skeleton: 4:3 ratio, a sage-grey gradient shimmer, and no animation under `prefers-reduced-motion`.
  - Status chip tones.
  - Meta rows with 16px lucide icons.
  - Amount right-aligned and semibold.
  - Footer: muted time, with the avatars overlapping.
  - Visible focus rings.
  - The page title in serif, scoped to `.admin-projects`.

### T4 — Tests (AC3–AC7)
- Owner: projects slice
- Depends on: T2
- Files:
  - `features/admin/AdminProjectsPage.test.tsx`
  - a new `features/admin/adminProjectPresentation.test.ts`, if helpers are added
- Changes:
  - Update the row-only assertions so they apply in list view: click "List view" first.
  - Add grid tests:
    - grid is the default and the toggle has `aria-pressed`
    - the persisted choice survives a remount
    - card fields come from real data: client, location, property type, and "Created" time
    - avatar accessible names
    - the skeleton is `aria-hidden`
    - two projects with unequal values show the exact amount text for the approved, draft, and no-estimate cases
    - Assign Designer appears only when permitted
    - the loading skeleton grid appears
  - Add unit tests for `formatCreatedRelative` and `adminProjectStatusTone`.

### T5 — Integrity review and verification (AC1–AC8)
- Owner: primary
- Depends on: T1–T4
- Review:
  - Confirm the diff is limited to the planned files.
  - Confirm the amount expression is unchanged, keys and links use `id`, and permission gating is unchanged.
- Commands:
  - `cd frontend && npm test -- src/features/admin/AdminProjectsPage.test.tsx src/components/layout`
  - `npm run typecheck`
  - `npm test`: the full suite, compared against the 17 known failures
  - `npm run build`
  - `git diff --check`
- Screenshots (scratchpad only):
  - with a mocked or dev backend session, if one is available locally, the sidebar for Super Admin, Admin,
    Designer, and one worker role, on desktop and in the mobile drawer
  - `/admin/projects` grid at 1440, 1024, 768, and 390px, plus list view
- If no backend or session is available locally, report which screenshots could not be taken.

## Parallelism

- T1 (sidebar CSS) is independent of T2–T4 (projects page). They touch different files and can run in parallel.
- T3 and T4 can run in parallel after T2.
- T5 runs last, on the integrated result.

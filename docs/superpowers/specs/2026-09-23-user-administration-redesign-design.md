# User administration page redesign — design specification

- **Date:** 2026-09-23
- **Slug:** `user-administration-redesign`
- **Classification:** Substantial (frontend redesign + backend read-contract extension across two repository implementations)
- **Branch:** `feature/designer_workflow`

## 1. Goal

Rebuild the Super Admin **User administration** page so its information architecture matches the supplied reference
screenshot — a summary metric row, a consolidated filter bar, a denser identity-led directory table, clearer
pagination, and a tabbed invitation history — while rendering it entirely in Lisno's existing design system.

The reference image is a **layout and information-density reference only**. Its visual treatment (soft pastel cards,
generic rounded tiles, non-repository typeface) is explicitly not to be copied. All surfaces, spacing, colour, radius
and type must come from the existing tokens and primitives.

## 2. Current behaviour and evidence

| Area | Current state | Evidence |
| --- | --- | --- |
| Page shell | `PageHeader` + a single `StatusBadge` showing the filtered total. No metric row. | `frontend/src/features/admin/UserDirectoryPage.tsx:88-104` |
| Filters | Three stacked `Field`s (search, role, status) in a `Surface`, 3-column grid. | `UserDirectoryPage.tsx:106-177`, `styles/access-administration.css` `.access-administration__filters` |
| Table | Columns: User / Role / Status / Created / Updated / (actions). No avatar, no selection column. Role is plain text, not a chip. | `UserDirectoryPage.tsx:196-244` |
| Row actions | Two visible buttons — `Details` (opens `ContextPanel`) and `Manage` (opens `UserMutationDialog`, hidden for `super_admin`). | `UserDirectoryPage.tsx:238-256` |
| Pagination | `Showing X–Y of Z` plus `Previous page` / `Next page` buttons. No page number. | `UserDirectoryPage.tsx:262-297` |
| Invitations | `UserInvitationsPanel` with a role `Select` and a status `Select` (6 statuses), header with `Invite user`. | `frontend/src/features/admin/UserInvitationsPanel.tsx:36-140` |
| Directory API | Returns `items`, paginated envelope, `filterRoles`, `manageableRoles`. **No aggregate summary.** | `backend/src/routes/admin-users.ts:44-58`, `backend/src/services/user-administration.service.ts:38-97` |
| User record | `id, name, email, role, active, version, avatar?, title?, createdAt, updatedAt`. **No last-active / last-login field anywhere in the backend.** | `user-administration.service.ts:16-27`; `grep -rn "lastLogin\|lastActive\|lastSeen" backend/src` returns no matches |

### Gap analysis against the reference

1. **Metric row** — four tiles (Total / Active / Inactive / Different roles). No API supplies these. The paginated
   `total` describes the *filtered* page only; deriving active/inactive/role counts from the loaded page would
   manufacture organisation-wide numbers from a 20-row window.
2. **"Last active" column** — no backing field exists.
3. **Row selection checkboxes** — no bulk mutation endpoint exists; `PATCH /admin/users/:userId` is single-user and
   version-checked.
4. **Kebab (`…`) overflow menu** — no accessible menu-button primitive exists in `components/ui` (`SelectMenu` is a
   `<select>` wrapper, not a menu).
5. **Invitation tabs** — reference shows four tabs (All / Pending / Accepted / Expired); the repository supports six
   presentation statuses including `delivery_failed`, `revoked` and `superseded`.

## 3. Decisions taken (user-confirmed 2026-09-23)

- **D1 — Metric tiles: extend the backend.** Add a directory summary to the read contract rather than dropping the
  tiles or deriving them client-side.
- **D2 — "Last active": show `Updated`.** Keep the existing `updatedAt` field under an honest `Updated` column label.
  Real last-login tracking (model field, login write path, migration) is out of scope and recorded as a follow-up.

## 4. Scope

### In scope

- `backend/src/repositories/types.ts` — new `summarizeUsers` repository method on `AppRepository`.
- `backend/src/repositories/memory.ts` and `backend/src/repositories/mongo.ts` — aligned implementations.
- `backend/src/services/user-administration.service.ts` — `UserDirectoryPage.summary`.
- `backend/src/routes/admin-users.ts` — include `summary` in the `GET /admin/users` response envelope.
- Backend OpenAPI inventory entry for `GET /admin/users` kept in sync with the new field.
- `frontend/src/api/types.ts` — `UserDirectorySummary`, added to `UserDirectoryPage`.
- `frontend/src/features/admin/UserDirectoryPage.tsx` — metric row, filter bar, redesigned table, pagination.
- `frontend/src/features/admin/UserInvitationsPanel.tsx` — tabbed status filter.
- `frontend/src/styles/access-administration.css` — token-driven styles for the above.
- Existing tests: `UserDirectoryPage.test.tsx`, `UserInvitationsPanel.test.tsx`, backend user-administration tests.

### Non-goals

- **No** `lastLoginAt` / last-active tracking, model change, login write path or migration (D2).
- **No** row-selection checkboxes or bulk actions — there is no bulk endpoint, and a selection column that drives
  nothing is dead UI.
- **No** new kebab/overflow-menu primitive. Row actions stay as explicit, labelled, keyboard-reachable controls.
- **No** change to authorization, to `PATCH /admin/users/:userId`, to invitation mutation semantics, or to the
  Super Admin immutability rule.
- **No** change to `UserMutationDialog`, `InviteUserDialog` or `InvitationActionDialog` behaviour.
- **No** new dependency, font, icon pack or lockfile change.

## 5. Requirements

### R1 — Directory summary (backend)

- **R1.1** `AppRepository.summarizeUsers(visibleRoles: readonly Role[]): Promise<UserDirectorySummary>` returning
  `{ total, active, inactive, roleCount }`.
- **R1.2** Counts are scoped to `visibleRoles` (the same role visibility the list path applies) and are **independent
  of the caller's search / role / status filters** — the tiles describe the directory, not the current filtered view.
- **R1.3** `roleCount` is the number of **distinct roles actually present** among visible users, not the number of
  roles defined in the system.
- **R1.4** `total === active + inactive` must hold for every input.
- **R1.5** Memory and Mongo implementations return identical results for identical state. Mongo uses a single
  aggregation (no full-collection fetch into memory) and honours an active session when present, matching the
  session handling already used by `pageUsers` / `countActiveUsersByRole`.
- **R1.6** `UserAdministrationService.list` returns `summary` alongside `items`, `total`, `filterRoles`,
  `manageableRoles`. Authorization is unchanged: the same `requireAdministrativeActor` gate governs it.
- **R1.7** `GET /admin/users` includes `summary` in `data`. The response remains additive — existing consumers that
  ignore the field continue to work.
- **R1.8** The OpenAPI inventory entry for `GET /admin/users` reflects the new field. Runtime Zod validation remains
  authoritative.

### R2 — Metric row (frontend)

- **R2.1** Four tiles rendered with the existing `MetricCard` primitive: Total users, Active users, Inactive users,
  Different roles.
- **R2.2** Tiles render from `summary` only. They are never computed from `items`.
- **R2.3** While the directory query is pending, tiles show the existing skeleton/loading treatment rather than `0`.
- **R2.4** If `summary` is absent from the response, the metric row is omitted entirely — no zeroes, no placeholders.

### R3 — Directory table (frontend)

- **R3.1** Columns: **User**, **Role**, **Status**, **Created**, **Updated**, **Actions**.
- **R3.2** The User cell is an identity stack: initials avatar (derived from `name`, `aria-hidden`, purely
  presentational), name, email, and `title` when present. Initials are presentation only and are never used as a key.
- **R3.3** Role renders as a chip using `ROLE_LABELS`; Status uses the existing `StatusBadge` (`success` / `neutral`).
- **R3.4** Dates render as `<time>` with `dateTime` set to the ISO value, tabular-numeric, `en-GB` `dd MMM yyyy`
  short form in the cell.
- **R3.5** Actions: `Details` for every row; `Manage` for every row whose role is not `super_admin`. Each control
  keeps an accessible name that includes the user's name (current `sr-only` pattern retained).
- **R3.6** The table keeps its horizontal scroll region, its `role="region"`, its accessible name and its
  `tabIndex={0}` focus affordance.

### R4 — Filters and pagination (frontend)

- **R4.1** Search, role and status controls keep their existing `Field` labels, ids and query behaviour. Changing any
  filter resets the offset to 0 (existing behaviour preserved).
- **R4.2** Pagination shows `Showing X–Y of Z`, the current page number, and Previous / Next controls with their
  existing disabled logic and `aria-live` summary.
- **R4.3** Page number is derived from `offset / limit + 1` and is presentational; navigation remains offset-based.

### R5 — Invitations panel (frontend)

- **R5.1** The status `Select` becomes a tab strip: **All** plus every existing presentation status
  (`pending`, `delivery_failed`, `expired`, `accepted`, `revoked`, `superseded`). No status becomes unreachable.
- **R5.2** Tabs use `role="tablist"` / `role="tab"` with `aria-selected`, arrow-key navigation, and a visible focus
  ring. The strip scrolls horizontally at narrow widths rather than wrapping into an unreadable block.
- **R5.3** Selecting a tab sets the same `filters.status` value the `Select` set, and resets offset to 0.
- **R5.4** The role `Select`, the `Invite user` button, permission gating (`READ` / `CREATE` / `RESEND` / `REVOKE`),
  and all dialog behaviour are unchanged.
- **R5.5** Invitation links and tokens remain unexposed, as today.

### R6 — Visual treatment

- **R6.1** Every colour, space, radius, border, and type value comes from existing tokens
  (`--space-*`, `--color-*`, `--radius-*`, `--type-*`). No hard-coded hex, px spacing scale, or new font stack.
- **R6.2** No new shadow, gradient, or blur treatment is introduced. Surfaces stay flat and bordered, consistent with
  the rest of `access-administration.css`.
- **R6.3** Density target: the table reads as an operator tool — compact row height, uppercase metadata headers using
  the existing `--type-metadata`, tabular numerals for dates, clear 1px rules.
- **R6.4** Dark-mode and role-theme behaviour follows automatically from token usage; no theme-specific overrides are
  added unless an existing token is genuinely missing.

### R7 — States and accessibility

- **R7.1** Loading, error (with retry), empty-filter, stale/placeholder (`isPlaceholderData`) and permission-denied
  states all continue to render, including for the new metric row.
- **R7.2** The page remains usable at 1440px, 1180px, 760px and 390px widths with no horizontal page overflow outside
  the intended table scroll region.
- **R7.3** All interactive controls keep a ≥44px touch target on coarse pointers and a visible focus ring.
- **R7.4** No colour-only status encoding: every badge and chip carries text.

## 6. Assumptions

- **A1** The reference screenshot's data (names, emails, dates) is illustrative; no fixture or seed is created from it.
- **A2** Tiles describe the visible-role-scoped directory, not the active filter set. Rationale: the filtered count is
  already stated by `Showing X–Y of Z`, so filter-reactive tiles would duplicate it and lose the organisational view.
- **A3** `MetricCard` and its existing `.metric-card` styles are adequate for the tile row; only layout/grid CSS is
  added. If the primitive proves unsuitable, that is raised rather than forked.
- **A4** Adding an additive field to a `GET` response does not require a client version bump; the frontend type is
  widened in the same change.

## 7. Constraints

- NodeNext ESM: relative TypeScript imports keep their `.js` suffixes.
- Memory and Mongo repository implementations must stay aligned when the repository contract changes.
- Protected routes stay synchronised with the route-operation authorization registry and the OpenAPI inventory.
- No staging, commits, pushes, deploys, seeds, backfills or migrations.
- No dependency additions or lockfile edits.
- No lint claim — this repository has no lint script.

## 8. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| RK1 | Mongo summary aggregation diverges from the memory implementation. | Shared unit expectations run against both implementations with the same fixture set, including a role that has zero users and a mix of active/inactive. |
| RK2 | Summary aggregation adds load to a hot admin read. | Single `$group` aggregation on an already-filtered role predicate; no per-role round trips. |
| RK3 | OpenAPI inventory drifts from the runtime response. | Inventory update is an explicit plan task with its own verification. |
| RK4 | Tab conversion silently hides invitation statuses (`revoked`, `superseded`, `delivery_failed`). | R5.1 requires every status to have a tab; a test asserts each status is reachable. |
| RK5 | Denser table regresses accessibility (contrast, target size, focus). | R7 criteria verified by rendered interaction/accessibility tests at a width matrix. |
| RK6 | Redesign accidentally changes mutation or permission behaviour. | Existing dialog/permission tests kept green unmodified; no mutation code is touched. |

## 9. Acceptance criteria

- **AC1** `summarizeUsers` exists on `AppRepository`, is implemented in both `memory.ts` and `mongo.ts`, and returns
  identical `{ total, active, inactive, roleCount }` for identical state, with `total === active + inactive`.
- **AC2** `roleCount` counts distinct roles present among visible users; a role with no users does not increment it.
- **AC3** `GET /admin/users` returns `summary` in `data`, unchanged in every other respect, and the OpenAPI inventory
  entry matches.
- **AC4** Summary values are unaffected by `search`, `role` and `active` query filters.
- **AC5** The directory page renders four `MetricCard` tiles sourced only from `summary`; with `summary` absent the
  row is not rendered and no zeroes appear.
- **AC6** The table renders User (avatar initials + name + email + optional title), Role chip, Status badge, Created,
  Updated and Actions, with `Manage` absent for the `super_admin` row and present for others.
- **AC7** Pagination shows the range, the current page number, and working Previous/Next with correct disabled states.
- **AC8** Invitation statuses are selectable as tabs, all six statuses plus All are reachable, tabs are keyboard
  navigable with `aria-selected`, and filtering resets the offset.
- **AC9** Loading, error+retry, empty and stale states render for both the directory and the invitations panel.
- **AC10** Rendered accessibility checks pass at 1440 / 1180 / 760 / 390 px: no page-level horizontal overflow, every
  control has an accessible name, and no status is conveyed by colour alone.
- **AC11** No hard-coded colour, spacing or font value is introduced in `access-administration.css`; all added
  declarations reference existing tokens.
- **AC12** `cd backend && npm run typecheck && npm test && npm run build` and
  `cd frontend && npm run typecheck && npm test && npm run build` pass.
- **AC13** `git diff --check` is clean and `git status --short` shows no unintended or runtime-artifact paths.

## 10. Data / API / UX impact

- **Data:** none. No schema change, no migration, no write path touched. The summary is a read-time aggregation.
- **API:** additive only — `GET /admin/users` gains `data.summary`. No request shape, status code, error code or
  authorization change.
- **UX:** the page gains a metric row and a tabbed invitation filter; the table becomes denser and identity-led. No
  action is removed; no new destructive affordance is introduced.
- **Permissions:** unchanged. Backend authorization remains authoritative; the metric row exposes only aggregate
  counts already derivable by paging the directory the actor may already read.

## 11. Open decisions

- **OD1** Real "last active" tracking (`lastLoginAt` on the user model, a login-path write, and a backfill) is
  deferred by D2 and should be specified separately if the column is wanted with real data.
- **OD2** A reusable accessible overflow-menu (`…`) primitive is deferred. If row actions grow past two, that
  primitive should be specified on its own rather than inlined here.
- **OD3** Bulk user operations (the reference's selection checkboxes) require a bulk endpoint with its own
  authorization, versioning and audit semantics; not specified here.

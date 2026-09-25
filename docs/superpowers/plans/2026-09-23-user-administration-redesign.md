# User administration page redesign — task plan

- **Date:** 2026-09-23
- **Specification:** `docs/superpowers/specs/2026-09-23-user-administration-redesign-design.md` (approved 2026-09-23)
- **Branch:** `feature/designer_workflow`
- **Working tree at planning time:** clean

Every task below traces to acceptance criteria **AC1–AC13** in the specification. One parent task in progress at a
time. No staging, commit, push, deploy, seed, backfill or migration at any point.

## Shared contracts — settled before any writer starts

These are fixed here so parallel writers cannot invent incompatible variants.

### C1 — Summary type (backend and frontend must match field-for-field)

```ts
interface UserDirectorySummary {
  total: number;      // visible-role-scoped, filter-independent
  active: number;
  inactive: number;   // total === active + inactive
  roleCount: number;  // distinct roles PRESENT among visible users
}
```

- Backend: exported from `backend/src/repositories/types.ts`, re-exported through
  `backend/src/services/user-administration.service.ts` as part of `UserDirectoryPage`.
- Frontend: declared in `frontend/src/api/types.ts`, added as `summary: UserDirectorySummary` on the existing
  `UserDirectoryPage` interface.
- Repository method signature:
  `summarizeUsers(visibleRoles: readonly Role[]): Promise<UserDirectorySummary>`.
- Route envelope: `data.summary` beside the existing `filterRoles` / `manageableRoles`.

### C2 — CSS class contract (owned by T5; consumed verbatim by T6 and T7)

| Class | Purpose |
| --- | --- |
| `.access-administration__metrics` | grid wrapper for the four `MetricCard` tiles |
| `.access-administration__avatar` | initials chip in the User cell |
| `.access-administration__identity` | existing identity stack (extended, not renamed) |
| `.access-administration__role-chip` | role label chip |
| `.access-administration__page-indicator` | current page number in the pagination row |
| `.user-invitations__tabs` | invitation status tab strip |
| `.user-invitations__tab` | individual tab |

No other new class names are introduced. Any addition must be agreed before it is written.

### C3 — Ownership boundaries (no file is written by two owners)
> **Ownership note added 2026-09-23 (post-T4).** T4 established that every mocked `/admin/users` response in the
> frontend test suite is an untyped object literal (`UserDirectoryPage.test.tsx:99`, `test/fixtures/enterpriseRoutes.ts:45`,
> `test/accessibility.test.tsx:426`, `app/router.test.tsx:342`). Making `summary` required therefore produces **no**
> compiler error in those files — they must be updated deliberately. T8's ownership is extended to the three files
> outside `features/admin` so that exactly one owner writes them. No specification behaviour changes.


| File | Sole owner |
| --- | --- |
| `backend/src/repositories/types.ts`, `memory.ts`, `mongo.ts` | T1 |
| `backend/src/services/user-administration.service.ts`, `backend/src/routes/admin-users.ts`, `backend/src/openapi.ts` | T2 |
| `backend/tests/user-administration.test.ts`, `backend/tests/user-administration-mongo.replica-set.test.ts` | T3 |
| `frontend/src/api/types.ts`, `frontend/src/features/admin/adminApi.ts` | T4 |
| `frontend/src/styles/access-administration.css` | T5 |
| `frontend/src/features/admin/UserDirectoryPage.tsx` | T6 |
| `frontend/src/features/admin/UserInvitationsPanel.tsx` | T7 |
| `frontend/src/features/admin/UserDirectoryPage.test.tsx`, `UserInvitationsPanel.test.tsx` | T8 |
| `frontend/src/test/fixtures/enterpriseRoutes.ts`, `frontend/src/test/accessibility.test.tsx`, `frontend/src/app/router.test.tsx` | T8 (added 2026-09-23, see note) |

---

## T1 — Repository summary contract and implementations

**Depends on:** none. **Owns:** `backend/src/repositories/{types.ts,memory.ts,mongo.ts}`.

1. Add `UserDirectorySummary` (C1) and `summarizeUsers(visibleRoles)` to the `AppRepository` interface in
   `types.ts`, placed beside the existing `pageUsers` / `countActiveUsersByRole` declarations
   (`types.ts:1094-1099`).
2. Implement in `memory.ts` beside `pageUsers` (`memory.ts:1074`): filter `state.users` by `visibleRoles`, count
   total / active / inactive, and derive `roleCount` from a `Set` of the roles actually present.
3. Implement in `mongo.ts` beside `pageUsers` (`mongo.ts:1304`): a single `UserModel.aggregate` with
   `$match: { role: { $in: visibleRoles } }` and one `$group` producing the three counts plus the distinct role set;
   honour the active session exactly as `pageUsers` / `countActiveUsersByRole` do. No full-collection fetch.
4. Preserve NodeNext `.js` import suffixes.

**Acceptance:** AC1, AC2. `total === active + inactive` by construction; a visible role with zero users does not
increment `roleCount`.
**Verification:** `cd backend && npm run typecheck`.

## T2 — Service, route and OpenAPI inventory

**Depends on:** T1. **Owns:** `backend/src/services/user-administration.service.ts`,
`backend/src/routes/admin-users.ts`, `backend/src/openapi.ts`.

1. Add `summary: UserDirectorySummary` to the `UserDirectoryPage` interface
   (`user-administration.service.ts:38-44`) and populate it in `list` by calling
   `repository.summarizeUsers(visibleRoles)` alongside the existing `pageUsers` call
   (`user-administration.service.ts:84-97`). The summary is computed from `visibleRoles` only — the caller's
   `search` / `role` / `active` filters are **not** passed to it.
2. Leave `requireAdministrativeActor` and the `filters.role` visibility guard untouched.
3. Include `summary: result.summary` in the `data` object in `routes/admin-users.ts:49-57`. Nothing else in the
   envelope changes.
4. Update the `GET /admin/users` entry in `backend/src/openapi.ts` (parameters block at `openapi.ts:572`, operation
   listing at `openapi.ts:388`) so the documented response reflects `summary`. Runtime Zod validation stays
   authoritative.

**Acceptance:** AC3, AC4.
**Verification:** `cd backend && npm run typecheck`.

## T3 — Backend tests

**Depends on:** T1, T2. **Owns:** `backend/tests/user-administration.test.ts`,
`backend/tests/user-administration-mongo.replica-set.test.ts`.

1. In `user-administration.test.ts`, add cases asserting: the summary shape; `total === active + inactive`;
   `roleCount` counts only roles present; and that summary values are **identical** across three requests that differ
   only by `search`, `role` and `active` filters (AC4).
2. Use an asymmetric fixture — at least two roles with unequal user counts, at least one inactive user, and at least
   one visible role with zero users — so an off-by-one or a filter leak cannot pass accidentally.
3. In `user-administration-mongo.replica-set.test.ts`, assert the Mongo implementation returns the same summary as
   the memory implementation for the same seeded state.
4. Existing authorization, version-conflict and Super-Admin-immutability assertions are left unmodified.

**Acceptance:** AC1, AC2, AC4.
**Verification:** `cd backend && npm test -- tests/user-administration.test.ts`; replica-set file run where a replica
set is available, otherwise reported as not run.

## T4 — Frontend contract types

**Depends on:** C1 (settled above); may start in parallel with T2/T3. **Owns:** `frontend/src/api/types.ts`,
`frontend/src/features/admin/adminApi.ts`.

1. Add `UserDirectorySummary` to `types.ts` next to `UserDirectoryItem` (`types.ts:813-829`) and add
   `summary: UserDirectorySummary` to the `UserDirectoryPage` interface.
2. Confirm `getManagedUsers` in `adminApi.ts` passes the field through; adjust only if it narrows the response.
3. No component changes in this task.

**Acceptance:** AC3 (client side).
**Verification:** `cd frontend && npm run typecheck`.

## T5 — Stylesheet

**Depends on:** C2. **Owns:** `frontend/src/styles/access-administration.css`. **Must land before T6 and T7 start.**

1. Add the C2 classes using existing tokens only — `--space-*`, `--color-*`, `--radius-*`, `--type-*`. No hex
   literals, no raw px spacing, no new font stack, no new shadow/gradient/blur (AC11).
2. `.access-administration__metrics`: responsive grid, four across at wide widths, collapsing at the existing
   `1180px` and `760px` breakpoints already used in this file.
3. Table density pass: tighten row padding, apply `--type-metadata` uppercase treatment to `th`, apply
   `font-variant-numeric: tabular-nums` to date cells, keep the 1px `--color-border` rules.
4. `.access-administration__avatar`: square-ish initials chip built from `--radius-control` and
   `color-mix(... var(--color-brand-violet) ...)`, matching the existing `admin-project-card__view` idiom.
5. `.user-invitations__tabs`: horizontally scrollable strip, visible selected state that is not colour-only, and a
   `:focus-visible` ring using `--focus-ring`.
6. Add a 390px-safe rule set; keep the existing `prefers-reduced-motion` block honoured for anything animated.

**Acceptance:** AC10 (layout half), AC11.
**Verification:** `cd frontend && npm run build` (CSS compiles); visual state verified under T9.

## T6 — Directory page redesign

**Depends on:** T4, T5. **Owns:** `frontend/src/features/admin/UserDirectoryPage.tsx`.
**Parallel-safe with T7** (different files, shared CSS already landed).

1. Insert the metric row between `PageHeader` and the filters `Surface`, rendering four `MetricCard`s from
   `pageData.summary` only. Omit the entire row when `summary` is absent; show the existing loading treatment while
   the query is pending — never `0` (AC5, R2.3, R2.4).
2. Rework the table body: User cell becomes initials avatar (`aria-hidden`, derived from `name`, presentation only —
   never a key) + name + email + optional `title`; Role becomes a chip using `ROLE_LABELS`; Status keeps
   `StatusBadge`; `Created` and `Updated` keep `<time dateTime={iso}>` (AC6).
3. Keep the `Details` control on every row and `Manage` on every non-`super_admin` row, including their existing
   `sr-only` accessible-name suffixes (AC6).
4. Add the page-number indicator to the pagination row, derived as `offset / limit + 1`; Previous/Next disabled
   logic, the `aria-live` range summary and offset-based navigation are unchanged (AC7).
5. Preserve the scroll region's `role="region"`, accessible name and `tabIndex={0}`; preserve `aria-busy`,
   `isPlaceholderData` handling, the `ContextPanel` summary and `UserMutationDialog` wiring untouched (AC9).
6. No change to query keys, filters, mutation calls or permission logic.

**Acceptance:** AC5, AC6, AC7, AC9.
**Verification:** `cd frontend && npm test -- src/features/admin/UserDirectoryPage.test.tsx`.

## T7 — Invitation status tabs

**Depends on:** T5. **Owns:** `frontend/src/features/admin/UserInvitationsPanel.tsx`.
**Parallel-safe with T6.**

1. Replace the status `Select` (`UserInvitationsPanel.tsx:118-128` filter path) with a tab strip built from the
   existing `statusOptions` array plus an `All` tab — all six statuses stay reachable (AC8, RK4).
2. `role="tablist"` / `role="tab"`, `aria-selected`, roaming tabindex with Left/Right arrow navigation, visible
   focus ring.
3. Selecting a tab calls the same `setFilter("status", …)` path, which already resets the offset.
4. The role `Select`, `Invite user` button, `READ`/`CREATE`/`RESEND`/`REVOKE` permission gating and all dialog
   behaviour are unchanged. Invitation links and tokens stay unexposed.

**Acceptance:** AC8.
**Verification:** `cd frontend && npm test -- src/features/admin/UserInvitationsPanel.test.tsx`.

## T8 — Frontend tests

**Depends on:** T6, T7. **Owns:** `UserDirectoryPage.test.tsx`, `UserInvitationsPanel.test.tsx`.

1. Directory: assert the four tiles render from `summary`; assert the row is absent when `summary` is missing and
   that no stray `0` is rendered; assert the table columns, the `super_admin` row lacking `Manage`, and the page
   indicator.
2. Directory: keep/extend loading, error+retry, empty and stale-data assertions (AC9).
3. Invitations: assert every one of the six statuses plus `All` is reachable as a tab, that arrow-key navigation
   moves selection, and that selecting a tab issues the expected filtered query (AC8).
4. Accessibility/interaction: rendered checks at **1440 / 1180 / 760 / 390 px** — no page-level horizontal overflow,
   every control has an accessible name, no status conveyed by colour alone (AC10).
5. Use asymmetric fixtures (unequal role counts, at least one inactive user) so leakage or an off-by-one fails.

**Acceptance:** AC5, AC6, AC7, AC8, AC9, AC10.
**Verification:** `cd frontend && npm test -- src/features/admin`.

## T9 — Integration, integrity review and verification

**Depends on:** T1–T8 complete. **Owner:** primary agent (Mode B) or `integrity_reviewer` + `verification_runner`
after all writers are finished (Mode A). Runs on the integrated result only.

1. Inspect the full diff. Confirm no file outside the C3 ownership table was modified, and that no unrelated
   pre-existing work was reverted or reformatted.
2. Confirm AC11 by grepping the CSS diff for hex literals, raw px spacing and font declarations.
3. Run, in order, and report each result exactly:
   - `cd backend && npm run typecheck && npm test && npm run build`
   - `cd frontend && npm run typecheck && npm test && npm run build`
   - `git diff --check` and `git status --short`
4. Replica-set integration tests: run `backend/tests/user-administration-mongo.replica-set.test.ts` if a replica set
   is available; if not, report it explicitly as **not run** rather than as passing.
5. Report outcome, decisions, affected files, checks run, checks not run, actions not performed (no commit, no push,
   no migration), and residual risks.

**Acceptance:** AC12, AC13, plus final trace of AC1–AC11.

---

## Dependency order and parallelism

```
T1 ──▶ T2 ──▶ T3 ─┐
   └─────────────▶ │
C1 ──▶ T4 ────────┤
C2 ──▶ T5 ──▶ T6 ─┼──▶ T8 ──▶ T9
              T7 ─┘
```

**Safe to run in parallel:**
- T3 ∥ T4 ∥ T5 (after T2 for T3; T4 and T5 need only the settled contracts).
- T6 ∥ T7 (after T5 lands — different files, shared stylesheet already written).

**Must be sequential:** T1 → T2; T5 → T6/T7; T6/T7 → T8; everything → T9.

## Risk checkpoints carried from the spec

- **RK1** covered by T3.3 (memory vs Mongo parity).
- **RK2** covered by T1.3 (single aggregation).
- **RK3** covered by T2.4 (OpenAPI inventory) and re-checked in T9.1.
- **RK4** covered by T7.1 and asserted in T8.3.
- **RK5** covered by T8.4.
- **RK6** covered by T6.6 / T7.4 (no mutation or permission code touched) and T9.1.

# Organization overview header action alignment — design specification (compact)

- **Date:** 2026-09-23
- **Slug:** `dashboard-header-actions-alignment`
- **Classification:** Small (localized layout fix, one scoped stylesheet, no contract/data/permission impact)
- **Branch:** `feature/designer_workflow`

## 1. Goal

Make the three controls in the Super Admin **Organization overview** header — the Reporting period select, the
"Compare with previous period" toggle, and the Refresh button — sit on one shared baseline at a consistent control
height.

## 2. Current behaviour and root cause (evidence)

The header actions row is a plain centered flex container:

```css
/* frontend/src/styles/primitives.css:362-368 */
.ui-page-header__actions,
.ui-section-header__actions { align-items: center; display: flex; flex-wrap: wrap; gap: var(--space-2); }
```

Two independent defects compound inside it:

**C1 — Mixed alignment.** `.dashboard-period` is a stacked grid (the "Reporting period" caption sits *above* its
select), so it is the tallest item in the row:

```css
/* super-admin-dashboard.css:4 */
.dashboard-period { display: grid; gap: .2rem; min-width: 8rem; … }
```

`.dashboard-comparison-toggle` opts out of the container's centering to line up with the select:

```css
/* super-admin-dashboard.css:79-83 */
.dashboard-comparison-toggle { display: inline-flex; align-items: center; align-self: end; min-height: var(--control-height); … }
```

The Refresh `IconButton` has **no such override**, so it remains vertically centered against the taller stacked
label while its two neighbours are bottom-aligned. That is the visible float in the screenshot.

**C2 — No control height on the icon button.** `.ui-icon-button` declares no box size:

```css
/* frontend/src/styles/primitives.css:2-11 */
.ui-icon-button { align-items: center; border: 1px solid transparent; border-radius: var(--radius-control);
                  display: inline-flex; font: var(--type-body); font-weight: 600; justify-content: center; … }
```

Its sibling `.ui-button` does (`min-block-size: var(--control-height)`, primitives.css:15). So the Refresh control
is also *shorter* than the select and the toggle, which are both pinned to `--control-height`
(36px desktop, 44px on coarse pointers — `global.css:95`, `base.css:99`).

This misalignment predates the icon-only change; converting the control from a text `Button` to an `IconButton`
removed the text that had been padding it out to a comparable height, which made C2 visible.

## 3. Requirements

- **R1** All three header controls share one bottom baseline.
- **R2** The Refresh control is a square whose height equals `--control-height`, matching the select and toggle at
  both the 36px desktop and 44px coarse-pointer values.
- **R3** The fix is scoped to the Super Admin dashboard header. `.ui-icon-button` is used across the application,
  so its shared primitive is **not** modified.
- **R4** Existing tokens only — no hex literals, no new token, no new class name in the primitive layer.
- **R5** The row keeps wrapping safely at narrow widths; no page-level horizontal overflow at 390px.
- **R6** No change to the accessible name, `tooltip`, `busy` behaviour, click handling, or any other header control.

## 4. Scope

**In scope:** `frontend/src/features/admin/dashboard/super-admin-dashboard.css` — scoped rules for the header
actions row and the icon button inside it.

**Non-goals:**
- No change to `frontend/src/styles/primitives.css` or the `IconButton` / `PageHeader` primitives (R3).
- No change to `SuperAdminDashboardPage.tsx` markup, unless a scoping hook proves unavoidable (see OD1).
- No restyling of the select or the toggle beyond what shared alignment requires.
- No change to other pages that use `.ui-page-header__actions`.

## 5. Approach

Scoped to `.super-admin-dashboard`, inside the file's existing `@layer components` block:

1. Set the header actions row to a shared end baseline, so the stacked "Reporting period" caption no longer drags
   its siblings out of line — this makes `.dashboard-comparison-toggle`'s `align-self: end` redundant rather than
   load-bearing.
2. Give the icon button inside that row an explicit square box of `var(--control-height)` in both axes.

The existing `align-self: end` on `.dashboard-comparison-toggle` is left in place: it is harmless under an
end-aligned parent, and the class is referenced elsewhere in the file (`.dashboard-reporting-context`), so removing
it would widen the blast radius for no visual gain.

## 6. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| RK1 | An `align-items` change on the actions row disturbs another page. | The rule is scoped under `.super-admin-dashboard`; no other page matches it. |
| RK2 | Forcing a square height clips the icon or breaks the coarse-pointer 44px target. | Size is expressed in `--control-height`, which already resolves to 44px under `@media (pointer: coarse)`; the icon is 1rem-class and centered by the primitive's existing flex rules. |
| RK3 | The row stops wrapping cleanly on narrow viewports. | `flex-wrap: wrap` is retained from the primitive; verified at 390px. |
| RK4 | A dashboard test asserts on layout. | The dashboard suite is behavioural, not layout-based; re-run to confirm. |

## 7. Acceptance criteria

- **AC1** The select, the comparison toggle and the Refresh button share one bottom baseline in the header.
- **AC2** The Refresh control renders as a square at `--control-height`, equal in height to its two neighbours.
- **AC3** `frontend/src/styles/primitives.css` and the `IconButton` / `PageHeader` primitives are unmodified.
- **AC4** No hex literal or new token is introduced; only existing `--*` tokens are referenced.
- **AC5** The header wraps without page-level horizontal overflow at 390px.
- **AC6** `cd frontend && npm run typecheck && npm test -- src/features/admin/dashboard && npm run build` pass,
  and `git diff --check` is clean.

## 8. Open decisions

- **OD1** The fix is attempted as pure CSS using the existing `.ui-icon-button` descendant selector. If scoping
  proves unreliable, the fallback is a single `className` on the Refresh `IconButton` (the idiom already used at
  `ProjectConversationList.tsx:72`, `className="project-messaging-icon"`). That would touch one TSX line and is
  recorded here rather than assumed.

## 9. Data / API / UX impact

- **Data / API / permissions:** none.
- **UX:** the three header controls become visually aligned and equally sized; no behaviour changes.

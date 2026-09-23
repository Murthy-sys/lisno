# Icon-only dashboard refresh control — design specification (compact)

- **Date:** 2026-09-23
- **Slug:** `dashboard-refresh-icon-only`
- **Classification:** Small (localized presentation change, one component, no contract/data/permission impact)
- **Branch:** `feature/designer_workflow`

## 1. Goal

On the Super Admin **Organization overview** header, reduce the Refresh control to the icon alone. Keep the
refresh icon; remove the visible `Refresh` / `Refreshing…` text label.

## 2. Current behaviour and evidence

`frontend/src/features/admin/dashboard/SuperAdminDashboardPage.tsx:355` renders the control inside the
`PageHeader` `actions` slot:

```jsx
<Button variant="secondary" disabled={manualRefresh} aria-label="Refresh dashboard" onClick={() => void refresh()}>
  <RefreshCw aria-hidden="true" />
  {manualRefresh ? "Refreshing…" : "Refresh"}
</Button>
```

- The icon is already `aria-hidden`, and the accessible name already comes from `aria-label="Refresh dashboard"`,
  so the visible text is decorative from an assistive-technology standpoint.
- Busy state is *also* already reported elsewhere on the page, independently of this button:
  - `PageHeader` metadata renders `<span role="status">Refreshing dashboard…</span>` while `refreshing`
    (`SuperAdminDashboardPage.tsx:355`).
  - An `sr-only` `aria-live="polite"` region announces `Refreshing dashboard…` / `Dashboard updated.`
    (`SuperAdminDashboardPage.tsx:336`, `:356`).

### Established repository idiom

`frontend/src/components/ui/IconButton.tsx` is the existing icon-only primitive. It takes a required `label`
(applied as `aria-label`), an optional `tooltip`, and a `busy` flag that swaps the icon for a `Spinner`, sets
`aria-busy`, and disables the button. `frontend/src/features/messages/ProjectConversationList.tsx:72` already uses
exactly this primitive for a `RefreshCw` refresh action with `busy`. This change adopts that idiom rather than
inventing a new one.

## 3. Requirements

- **R1** The control renders the `RefreshCw` icon with no visible text in either idle or busy state.
- **R2** The accessible name remains exactly `Refresh dashboard`, so assistive technology and the existing test
  selector at `SuperAdminDashboardPage.test.tsx:693` continue to resolve it.
- **R3** Busy state stays perceivable without the text label: the button shows the primitive's `Spinner` and
  `aria-busy`, and the existing `role="status"` and `aria-live` announcements are left untouched.
- **R4** Click behaviour, the `refresh()` handler and focus retention after a completed refresh are unchanged —
  `SuperAdminDashboardPage.test.tsx:689` asserts `expect(refresh).toHaveFocus()` after the request resolves.
- **R5** An icon-only control needs a hover/focus affordance, so it carries `tooltip="Refresh"` via the primitive.
- **R6** Visual treatment comes from the existing `.ui-icon-button` styles and the Super Admin shell rule at
  `frontend/src/styles/admin-home.css:71-75`. No new CSS, no new token, no new dependency.

## 4. Scope

**In scope:** the single control at `SuperAdminDashboardPage.tsx:355`, and any assertion in
`SuperAdminDashboardPage.test.tsx` that depends on the removed visible text.

**Non-goals:**
- No change to `refresh()`, query invalidation, the reporting-period select, the comparison checkbox, or any other
  header control.
- No change to the `role="status"` / `aria-live` announcements.
- No change to other refresh buttons elsewhere in the application.
- No change to `IconButton`, `Button`, or any stylesheet.

## 5. Assumptions

- **A1** `variant="secondary"` is retained so the control keeps its current visual weight in the header.
- **A2** Removing the visible text is acceptable for discoverability because the tooltip (R5) plus the persistent
  `Updated <timestamp>` / `Refreshing dashboard…` metadata already explain the control in context.

## 6. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| RK1 | `IconButton` disables the button while `busy`; a disabled element can lose DOM focus, breaking the focus-retention assertion (R4). | The current `Button` already sets `disabled={manualRefresh}` with the same lifecycle, so behaviour is unchanged. Verified explicitly by running the existing focus test. |
| RK2 | A test or a11y sweep asserts on the visible text `Refresh` / `Refreshing…`. | Grep the suite for those strings and update only assertions that depend on the removed text. |
| RK3 | The header layout shifts once the control narrows. | Covered by the existing dashboard rendering tests; `PageHeader` actions already wrap. |

## 7. Acceptance criteria

- **AC1** The Refresh control renders `RefreshCw` with no visible text, idle and busy.
- **AC2** `getByRole("button", { name: "Refresh dashboard" })` still resolves.
- **AC3** Clicking it still issues the refresh, and the button still holds focus after the request resolves.
- **AC4** While busy it exposes `aria-busy`, and the existing `role="status"` / `aria-live` messages are unchanged.
- **AC5** No stylesheet, primitive, dependency or lockfile change.
- **AC6** `cd frontend && npm run typecheck && npm test -- src/features/admin/dashboard && npm run build` pass,
  and `git diff --check` is clean.

## 8. Data / API / UX impact

- **Data / API / permissions:** none.
- **UX:** the header action narrows to an icon; the busy affordance becomes a spinner plus the existing status text.

# Compact project cards — task plan

Spec: [2026-09-23-compact-project-cards-design.md](../specs/2026-09-23-compact-project-cards-design.md) (approved)

## Tasks (dependency order)

### T1 — Default card image asset (AC1b)
- Owner: primary
- Files: new `frontend/src/assets/project-card-default.jpg`
- Work: convert `frontend/src/assets/login_screen.png` with `sips -s format jpeg -s formatOptions 70 -Z 640`, and
  confirm the result is under 60 KB. Screenshots of the output go in the scratchpad only.

### T2 — Card markup (AC1b, AC2, AC3)
- Owner: primary
- Depends on: T1
- Files: `frontend/src/features/admin/AdminProjectsPage.tsx`
- Changes to `AdminProjectGridCard`:
  - Replace the media `div` with `<img className="admin-project-tile__media" src={projectCardImage} alt=""
    aria-hidden="true" loading="lazy" decoding="async" width={640} height={360} />`.
  - Remove the `<time>` element and the Quick view button.
  - Merge the avatars and the amount into `div.admin-project-tile__summary`.
  - Keep Assign Designer, which is conditional, in `div.admin-project-tile__actions`. Render that `div` only when
    Assign Designer is shown.
  - Remove the unused `formatCreatedRelative` and `createdDateFormat` usages from the page. The helper stays exported
    with its unit tests.
- List view and the skeleton markup are unchanged, except that skeleton bones are trimmed to match the new card.

### T3 — Compact CSS (AC1, AC4)
- Owner: primary
- Depends on: T2
- Files: `frontend/src/features/admin/admin-project-grid.css`
- Changes:
  - Media: 16:9, `object-fit: cover`, and a sage fill behind it.
  - Body: gap 6px, padding 12/14.
  - Meta: 13px text, 14px icons.
  - Title: one line with an ellipsis.
  - Summary row: flex, `justify-content: space-between`.
  - Assign Designer: compact and full width.
  - Remove the footer and divider rules.

### T4 — Tests (AC2, AC3, AC5)
- Owner: primary
- Depends on: T2
- Files: `frontend/src/features/admin/AdminProjectsPage.test.tsx`
- Changes:
  - The Quick view tests (around lines 141 and 164) click "List view" first.
  - Replace the grid "Created" `time` assertions (around lines 550–551) with assertions that no "Created" text and
    no Quick view button appear in a grid card.
  - Update line 602 to assert the Quick view button is absent in the grid.
  - Add: the card image `src` matches `project-card-default`, with `aria-hidden` and `alt=""`.
  - Keep the amount-equality and Assign Designer permission tests.

### T5 — Verification (AC1–AC5)
- Owner: primary
- Depends on: T1–T4
- Commands:
  - `npm test -- src/features/admin/AdminProjectsPage.test.tsx src/features/admin/adminProjectPresentation.test.ts`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
- Screenshots of the fixture-backed `/admin/projects` grid at 1440×900, 768px, and 390px, measuring card height.

## Parallelism

- T3 and T4 can run in parallel after T2.
- The change is small, so doing it inline is proportionate.

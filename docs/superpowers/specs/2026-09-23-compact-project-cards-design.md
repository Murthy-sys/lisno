# Compact project cards — specification

Date: 2026-09-23
Status: Draft, awaiting approval
Classification: Small (one screen, presentation only; no API, data, or finance change)
Related: [Sage sidebar and project cards](2026-09-23-sage-sidebar-and-project-cards-design.md)

## Goal

The All Projects grid cards (`/admin/projects`, grid view) are too tall. Make them compact, and remove the
"Created …" line and the "Quick view" button from the grid card. Replace the grey skeleton image with a **default
interior photo**.

## Current behavior and evidence

- `features/admin/AdminProjectsPage.tsx` (`AdminProjectGridCard`) and `features/admin/admin-project-grid.css`. Both
  files are from this session's previous change.
- Card stack, top to bottom:
  - a 4:3 skeleton image, about 260px tall at 4 columns
  - the status chip
  - the title
  - three meta rows
  - the next-action line
  - the amount
  - a divider, then "Created X ago" and the avatars
  - the Quick view button, plus Assign Designer when pending
- The body has 10px gaps and 14px/16px padding. The screenshot shows about 580px of total card height.
- Tests that depend on the removed items:
  - `AdminProjectsPage.test.tsx:141` and `:164`: the Quick view flows, currently in grid view
  - `:550–551`: the "Created" `time` element
  - `:602`: the Quick view button inside a grid card

## Proposed behavior

1. **Image:** every card shows one shared **default interior photo**. The data has no project images, so it is the
   same photo on every card and marks no particular project.
   - Source: the sage interior already in the repo (`frontend/src/assets/login_screen.png`, 1536×1024, 2.1 MB).
   - Asset: a new, optimised `frontend/src/assets/project-card-default.jpg`, about 640px wide, JPEG quality about
     70, target under 60 KB. It is made with macOS's built-in `sips`, so no new dependency is needed.
   - It is imported through Vite so the file name gets a hash, and the browser downloads it once for all cards.
   - The card shows it at 16:9, about 150px tall at 4 columns instead of about 260px, using `object-fit: cover`.
   - It is decorative: `alt=""` and `aria-hidden`, with `loading="lazy"`, `decoding="async"`, and explicit
     `width` and `height` so the layout does not shift.
   - While the photo loads, the sage-grey fill shows behind it.
   - The loading-state skeleton cards keep the grey block, not the photo.
2. **Remove** "Created X ago" (the `<time>`) from the grid card.
3. **Remove** the "Quick view" button from the grid card. Quick view stays available in **list view**, which is
   unchanged. The whole card is still a link to the project detail page.
4. **Tighter body:**
   - The gap drops from 10px to 6px, and padding from 14/16 to 12/14.
   - Meta rows are 13px text with 14px icons.
   - The title stays one line with an ellipsis.
5. **Merged bottom row:** a single row with the avatars on the left and the amount on the right. It replaces the
   separate amount row, divider, and footer.
6. **Assign Designer:** still shown when it is pending and permitted, as a compact full-width button at the bottom of
   the card, outside the link as today.
7. Target card height is about 330–360px at 1440px width with 4 columns, down from about 580px.

## Unchanged

- The amount text and calculation (`adminProjectEstimateDisplay`).
- The status chip and tones, the client, location, property type, and next action.
- The avatars' accessible names ("Sales: …" and "Designer: …").
- List view, the grid/list toggle and its persistence, pagination, and the loading skeleton. The loading skeleton is
  resized to the new card proportions.

## Acceptance criteria

- AC1: At 1440×900, a card is about 360px tall or less, and two full rows of cards are visible below the header
  (screenshot).
- AC1b: Each grid card shows the default interior photo, and it is not exposed to screen readers. The asset is under
  60 KB. A test asserts that the card image `src` matches `project-card-default` and that it is hidden from
  assistive technology.
- AC2: Grid cards contain no "Created" text and no Quick view button. List view still has Quick view, and the Quick
  view dialog works from there.
- AC3: The amount text is identical to before for the approved, draft, and no-estimate cases. Assign Designer appears
  only when it is pending and permitted.
- AC4: At 390px and 768px there is no horizontal overflow.
- AC5: The Quick view tests run in list view. The grid tests assert that "Created" and Quick view are absent. The
  focused tests, `npm run typecheck`, and `npm run build` pass, and `git diff --check` is clean.

## Non-goals

- Per-project real images. There is no image field in the data, so that needs a separate backend spec.
- New fields.
- Sidebar changes.
- List view changes.

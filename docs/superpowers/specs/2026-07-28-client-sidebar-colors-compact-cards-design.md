# Client Sidebar Colors and Compact Review Cards Design

## Goal

Make the client project page visually consistent with the existing sidebar and
reduce the height of section review cards without changing behavior.

## Color changes

- Keep the current layout, typography, content, interactions, and responsive
  structure unchanged.
- Replace the client project's warm brown, olive, parchment, and gold colors
  with the existing sidebar family:
  - `var(--color-lisno-navy)` for the project hero and darkest emphasis;
  - `#7057ff` for primary accents, active/focus treatments, and progress;
  - light lavender-blue surfaces and borders for cards and supporting regions;
  - white and navy text according to background contrast.
- Preserve semantic status meaning:
  - approved remains green;
  - rejected remains red;
  - awaiting review remains amber;
  - total uses blue/purple.
- Scope all color overrides beneath `.client-page--project` or
  `.design-review--client`. Manager, dashboard, designer, head, and
  authentication screens must not change.

## Compact section review card

- Reduce the active section image trigger and image minimum height from
  `19rem` to `12rem` on desktop.
- Reduce the image height to `10rem` on mobile.
- Tighten the review card's padding and internal gaps without removing plan
  metadata, history, decisions, or navigation.
- Keep `object-fit: contain` so the drawing is never cropped.
- Keep the section image clickable and preserve the existing full-size preview
  modal.
- Do not change the 50×50 approved-document thumbnails.

## Testing

- Add a stable client-only class/style contract test where useful.
- Preserve all existing review queue, preview modal, client-action, manager
  isolation, and accessibility tests.
- Run the focused client project and design-review tests, frontend typecheck,
  and production build.

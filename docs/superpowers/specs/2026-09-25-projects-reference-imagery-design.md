# Projects reference imagery correction

Date: 2026-09-25. User requests a closer visual match after comparing reference and actual screenshots. Existing approval waiver and Mode A continue.

## Evidence and intended result

The previous implementation uses a 640×426 armchair photograph for both cards and a separately boxed header. The reference uses a wide cream-sofa living room, a continuous light image backdrop behind heading and toolbar, and taller card photographs. These differences are visible in the two supplied screenshots.

Create a closer decorative living-room asset using the built-in image tool: cream sectional sofa, arched window, warm oak slats, leafy plants, soft natural daylight, wide architectural composition. Use a compressed local WebP. This is decorative default art, not a claimed photograph of a customer's project.

## Scope and acceptance criteria

1. Heading and status/layout/sort/filter toolbar share one continuous background, softly washed at left and clear at right. Remove the separate boxed banner boundary. Respect existing shell geometry and mobile controls.
2. Use a matching complete living-room photograph for the card default. Show more of the sofa/room and less empty wall; increase media ratio from 2.3:1 toward the reference's roughly 2:1. Match top status treatment sufficiently to support the image-led look without introducing dead action menus.
3. Preserve the user's compact text rows, project identity, approved costs, all filters/pagination/permissions and existing accessibility. Do not revert to reference's extra metadata rows or invent projects/photos/status totals.
4. Improve the header title hierarchy to the reference's bold sans-serif style, using the existing font system. Limit work to Projects and local assets; preserve Configuration and other dirty work.
5. Desktop and mobile rendered checks show continuous backdrop, complete room crop, readable labels, no overflow and working controls. Focused regression suite/typecheck/build pass.

No backend, data/API/schema/financial changes, dependencies, deployment or commit. Existing JPG remains available for unrelated consumers; add a new asset. Asset generation/compression provenance and final prompts are recorded in the plan. Rollback is the scoped frontend edits and new asset removal.

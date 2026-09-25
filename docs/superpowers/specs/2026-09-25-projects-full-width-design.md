# Projects full-width layout

Date: 2026-09-25. Small follow-up to the approved Projects redesign. The user's explicit instruction to continue without further approvals applies.

Goal: remove the large blank side margins shown in the latest All Projects screenshot.

Evidence: `styles/shell.css` caps every workspace child at `--content-wide` (1440px) and centers it. On a wide display this adds margins beyond the shell's normal padding. The Projects root is `.admin-projects.access-administration`; its own stylesheet has no width override.

Implementation: make that page root use 100% of the available workspace content width. Retain existing shell edge padding, sidebar, responsive grid, header artwork and compact card details. Scope the change to Projects; no API, data, authorization or other page changes. A single card continues to occupy one grid column.

Acceptance criteria:
1. At wide desktop widths, the Projects root spans the workspace's inner width without the 1440px cap.
2. Header, toolbar, grid and pagination share the full-width alignment.
3. Desktop, tablet and phone layouts have no horizontal overflow; controls and card images remain usable.
4. Existing project data, costs, filtering and navigation behavior remain unchanged.

Risk: wider backgrounds/cards can change image cropping, so inspect rendered screenshots. No persistence, migration, external side effects or open decisions. Rollback is removal of the page-scoped width declaration.

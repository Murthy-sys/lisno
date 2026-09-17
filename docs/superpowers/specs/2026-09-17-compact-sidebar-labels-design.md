# Compact sidebar labels

Status: Implemented and verified locally under the user's standing autonomous authorization. Verification evidence is recorded in the [execution plan](../plans/2026-09-17-compact-sidebar-labels.md).

Goal: smaller, professional side-navigation text across desktop rails and mobile/chat navigation drawers. Interpreting “tabs test” as “tab text.” Current shared `shell.css` uses 12.8px, weight 700, uppercase labels and 0.1em tracking, with large icons and padding.

Use the existing Poppins interface font at 12px (relative rem token), weight 500, normal case and normal tracking. Align smaller icons, reduce row padding, and preserve at least 44px click/touch targets, visible focus, active colors, wrapping and all role-based destinations. Limit product edits to shared sidebar CSS; no navigation, permissions, API or global typography-token changes. Main risk is wrapping/contrast across role themes and narrow drawers; verify rendered desktop/mobile and enlarged text.

Existing seven dirty chat-performance paths are prior work and must be preserved. No deployment, dependency, commit or migration is included. Acceptance: visibly compact labels with no clipping/overflow, usable keyboard/touch states, existing navigation tests and frontend build pass.

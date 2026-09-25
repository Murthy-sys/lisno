# Mobile visual alignment with web

Status: implemented and verified within the recorded Android scope; one unrelated contract-test failure remains. The user's instruction to proceed without further approval applies; use their existing parallel execution preference.

## Goal and evidence
Align the mobile interface, fonts, cards and buttons with the current web application. Bottom navigation must show only icons. Mobile currently uses purple tokens, 16dp cards and 10dp controls, while effective web overrides use olive primary buttons (#3d4a32), a sage rail (#2f3a2a), 12px cards and 8px controls. Poppins is already shared. Web Login uses Fraunces 500 specifically for its title; general headings remain Poppins.

Sources: frontend/src/styles/global.css, primitives.css, role-themes.css final sage overrides; frontend/src/auth/login-page.css final sage overrides; mobile/src/ui/tokens.ts, primitives.tsx, navigation/AdaptiveAppScaffold.tsx. Initial dirty paths and mobile diffs are preserved under /tmp/lisno-mobile-web-style-sync-20260923.

## Requirements and acceptance
1. Shared mobile surfaces use warm cream/sage and olive controls, with semantic red outlined destructive actions. Match web type hierarchy (24/30 page headings, 14/21 body/buttons), 12dp cards and 8dp controls; keep native controls at least 48dp. Preserve adaptive text and comfortable input sizing.
2. Retain Poppins UI fonts and bundle Fraunces 500 for the auth display title. Avoid a platform-dependent serif fallback.
3. Replace bottom tab marks/labels with recognizable static SVG icons. Keep accessible tab names, selected/disabled states and exact role-authorized destinations. Tablet rail retains labels. No icon library dependency.
4. Align custom auth/onboarding/dashboard chrome with shared tokens. Preserve deliberate chat content presentation and functional chart colors, while aligning surrounding surfaces.
5. Preserve all navigation, pending-send/Back safeguards, authentication, permissions, API contracts and domain behavior. Keep loading/error/disabled states readable.
6. Validate representative rendered phone/tablet screens, control interaction and accessible names; typecheck, focused tests and Android export. Report unavailable native checks explicitly.

## Decisions, scope and risks
Reuse native architecture and shared tokens rather than recreating web layouts. Warm off-white native surfaces honor the user's preference against pure white; native flat sage navigation avoids gradients/shadows. No backend or web edits, no migrations or external mutations. Only a bundled display-font dependency is justified. Typography/spacing changes may expose long text overflow; icon-only tabs require explicit accessible names. Existing Back edits are part of the initial baseline and must remain intact. Shared-test baseline includes an unrelated mobile authorization inventory drift (224 expected vs 227 backend operations).

There are no unresolved product decisions. Rollback is limited to the incremental style diff, never the dirty baseline.

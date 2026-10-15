# Procurement mobile experience

## Goal and authority
Match the current web Procurement navigation and dashboard hierarchy in the native mobile app, with a more polished realistic presentation. User explicitly clarified mobile and requested enhanced design. Standing autonomous Mode A authorization applies; no further approval gates for ordinary local changes.

## Current evidence
- Web `components/layout/navigation.ts` groups Projects, Vendors and All my requests under Procurement. Procurement top-level order: Execution, Project messages, Procurement, Work order approvals, My access requests, Home.
- Web `ProcurementWorkspace.tsx` supports project search, procurement status filters, selected-value portfolio total and assigned projects before preparation. `ProcurementProjectCard.tsx` uses bundled representative interiors and approval-source labels.
- Native `ProcurementSubnavigation.tsx` exposes only Dashboard/Vendors; `AdaptiveAppScaffold.tsx` uses a generic dark rail and icon dock. Native Dashboard lacks web search, statuses, portfolio summary and assigned/unprepared projects.
- Native menu paths and canonical authorization already exist for all requested sections. Existing project mutation/version/guard logic must be preserved.

## Design and behavior
Use the web cream/olive navigation palette, Poppins typography, restrained borders, compact squared controls, large touch targets and custom existing SVG icons. Phone: an accessible dismissible navigation drawer from the header, retaining the existing compact floating icon-only bottom dock, selection treatment, Profile avatar/menu and More destination. The user explicitly rejected the replacement full-width labeled bottom bar; restore the established dock without removing the dashboard improvements. Wider mobile/tablet: persistent cream rail with the same ordered menu. Keep other roles' shells unchanged.
Procurement group has Projects, Vendors, All my requests with independently authorized visibility, active state and expandable children. Add profile and additional tools access without removing current destinations. All navigation respects aggregated unsaved/unknown-command guards.
Dashboard: clear Procurement heading, genuine project search/status controls, two portfolio figures, source-aware project cards using existing bundled representative web interiors and explicit representative-image labeling. No invented metrics, gradients, shadows, glass, animated decoration or new UI libraries. Financial values remain exact integer-paise reconciliations; unavailable values remain explicit. Prepared and assigned-only projects join only on stable IDs, with pagination/partial totals disclosed. Assigned-only project links open project detail and do not fabricate procurement or approval state.
Home retains the web intent of personal performance plus project portfolio through a compact authoritative KPI overview and full report link. Existing Work queue remains reachable as additional tools. Existing project procurement sections stay functional and gain readable horizontal tabs rather than wrapping full-size action buttons.

## Contracts, compatibility, non-goals
No backend/API/schema/permission expansion or changed approval/payment/issue semantics. Reuse existing read operations and session-scoped query keys. Hide cached private data on permission loss; preserve independent unavailable/empty/stale states. Source metadata drives approval/status labels. No customer imagery or external image fetching; copy existing representative assets into mobile. No new dependencies. No deployment, migration, seed, mail, commit or production actions.

## Acceptance
AC1: Exact authorized web menu hierarchy/labels reachable in mobile drawer and wider rail; active states, expansion, close/back, focus/accessibility and guards operate correctly.
AC2: Search/status filters, reset/empty/retry states and exact portfolio amounts; two unequal prepared projects, assigned-only projects and denied/error states verified.
AC3: Source-specific approval labels, representative cover images with fallback, long text/large INR amounts, narrow phone and wider layouts usable.
AC4: Home personal KPI uses existing backend response and full-report navigation; Work queue preserved. Project procurement tabs retain guarded transitions.
AC5: Existing bottom dock appearance and interactions, theme identity and unrelated roles/features preserved; focused tests/typecheck/export, broader relevant suite and rendered visual checks pass within reported limits.

## Risks and open decisions
Shared scaffold changes could bypass guards or remove destinations, so test both procurement and another role. Portfolio pagination must not imply complete totals. Source omissions must not imply final approval. Device preview must explicitly override Expo virtual environment .env files to use synthetic loopback data. Native Android emulator available; iOS/live API certification outside local scope. No unresolved product decision blocks implementation.

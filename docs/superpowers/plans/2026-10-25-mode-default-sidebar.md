# Latest state: compact read-only margins

The latest user request supersedes the interactive sidebar described in the historical entries below. Display all three margin modes together with no dropdown, source details, helper text or buttons. Root owns the display, styling and rendering tests; Workspace agent owns removal of obsolete apply/lock/rebase integration and its integration test. Validation passed: 6 compact rendering tests, 1 Workspace integration regression and the frontend production build. Independent review found no material issues. The existing backend and Sub-Basket bulk controls are outside this presentation change. Preserve differing and missing In-house component ranges without synthesizing a combined margin.

# Mode defaults sidebar implementation

Specification: [design](../specs/2026-10-25-mode-default-sidebar-design.md).

## Implementation

Discovery and implementation complete. The Mode sidebar replaces Revision history with mode-specific saved defaults; other tabs retain history. The optional targetMainLineId extends the existing atomic margin command without changing bulk callers. Source prices come from saved fields, and source Overview/UOM lineage participates in the review token. Current-line and selected-mode application preserves prices and component identity.

Independent review resolved three integration risks: same-Draft editor baseline reinitialization, recovery locks after committed or uncertain writes, and global legacy In-house conversion changing other catalogue mode prices. Global-only targets now require saved scoped costs. Active-only draft creation and editor mutation controls stay locked throughout application.

## Validation

- Backend final affected domain/replica/pricing tests: 62 passed. Earlier OpenAPI-inclusive focused run: 114 passed. Targeted HTTP route regression passed. Authorization, frontend authorization contract, route registry, API docs and server checks: 201 passed.
- Frontend sidebar/API/pending suite: 52 passed. Three new Workspace regressions passed, including applying into an existing Draft, creating a Draft from Active, and blocking raw invalid pending input. The broader Screens/Layout run had 124 passed and 20 failures; unchanged baseline had 108 passed and exactly the same 20 failure names. No new failure was introduced.
- Both TypeScript production builds passed. No dependencies added. Existing Vite large-chunk advisory remains.
- Isolated browser data verified mode switching, current-line Sub-vendor 20–30% to 20–35% with the target base price preserved, pending-edit blocking, normal Save using the refreshed aggregate version, and independent In-house component margin application with unchanged costs and membership.
- Sidebar layouts checked at 320, 390, 768 and 1440 pixels without horizontal overflow. Bounded In-house list scrolls using keyboard PageDown; Apply stays outside the list. WCAG 2A/AA and 2.1AA axe audit reported no violations; browser console reported no errors.

## Delivery

Source-only delivery is prepared from baseline aae21d2e5ad02dc476b2ff3f5e967e537fd86242. The hash-checked manifest excludes browser fixtures, logs, build outputs and dependencies. Application verifies every original/source hash first, retains replaced-file backups, and verifies copied bytes. Original repository was clean before application. Local runtime verification is read-only; no user configuration, seed, migration, commit or deployment is part of delivery.

## Source-line button follow-up

The user reported the source-line Apply button was disabled. Removed only the source-identity UI restriction and source-self rejection. The existing backend validates the request and returns a no-op when target equals source. The UI refreshes saved values and reports that the main line already uses the selected defaults. Pending edits, unavailable values, permissions, busy operations and recovery guards still apply; their explanations are now shown for source lines too. Active sources do not promise Draft creation. Scope is the sidebar, its regression tests and these existing documents; no API or data change.

Follow-up verification: 17 sidebar regression tests and 3 Workspace regressions passed; frontend production build passed. The isolated browser source scenario rendered an enabled Apply button. Existing authorization, valid-margin and pending-edit guards remain covered.

## Margins-only display follow-up

The user requested only margins in the defaults panel. Remove Base rate, UOM, Low quantity limit, Impact and price-reference copy. Keep mode selection, source context, margin pairs, component labels and Apply behavior. Retain saved calculation metadata internally to identify legacy combined margins and blank component groups, but render no prices. Unconfigured component margins remain explicit. This is a frontend presentation change; API contracts and saved data stay intact. Update the existing rendering tests and verify the compact panel.

Margins-only verification: all 17 existing sidebar regression tests passed after updating rendering expectations; production TypeScript/Vite build passed. Independent review confirmed unchanged application safeguards and correct legacy/empty component handling.

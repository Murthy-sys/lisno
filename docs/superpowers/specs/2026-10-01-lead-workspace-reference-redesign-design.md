# Lead workspace reference redesign

**Date:** 2026-10-01  
**Status:** Approved and implemented

## Goal and decision

Redesign the Estimator/Sales Lead workspace at `/estimator-sales` to follow the supplied reference image's composition: an interior-led header, four compact metrics, a clear search and stage-filter area, and a dense lead list with prominent client, project, estimate, and next-action information. The user confirmed that the image is the target visual direction and chose a **visual redesign with the current functions**. The page must remain a usable operational workspace rather than a static copy of sample data.

## Current behavior and evidence

- `frontend/src/features/leads/LeadDashboard.tsx` owns the route. It shows a text header, four metric tiles, search and one stage select, a lead list, a permission-gated project initiation dialog, permission-gated quick review, conditional estimate/lead links, and PDF export for non-draft estimates.
- `frontend/src/features/leads/leadsApi.ts` requests the first 20 leads with optional `search` and exact `stage`, and fetches the accessible saved estimates separately. The list response includes a filtered `pagination.total` and `hasMore`; the page currently renders only the returned 20 rows.
- `backend/src/routes/leads.ts`, `backend/src/services/lead.service.ts`, and both repository implementations authorize the list and support search over client name, email, mobile, and project name, plus one of nine exact lead stages. Estimator/Sales users see their own leads. They do not support location, assignee, date, or sort parameters.
- The existing four metrics are computed from the current query results: visible rows on this page, all returned saved estimates, their draft subset, and the sum of their `total` values. The saved-value sum includes drafts; it is not an approved-only amount or a monthly trend.
- `frontend/src/styles/estimator-dashboard.css`, `frontend/src/styles/role-themes.css`, and `frontend/src/styles/index.css` style this page alongside other estimation screens. The header is currently dark and the rows are separated cards. `frontend/src/assets/projects-living-room.webp` is an existing interior scene suitable for the reference's header treatment.
- `frontend/src/features/leads/LeadDashboard.test.tsx` covers metrics, estimate failure isolation, initiation permissions and navigation, quick-review focus and stale-response behavior, and read permission. The PDF export has a separate focused test.

## Scope and non-goals

**In scope:** the Lead workspace route's visual hierarchy, copy needed to describe existing values accurately, page-local styling, responsive row presentation, accessible filtering presentation, and preservation of all current actions and states. Existing lead fields (`createdAt`, `nextAction`, `nextActionAt`) may be displayed in the list because they are already in the response.

**Out of scope:** backend or API changes; new search fields; location, assignee, created-date, or sort filters; bulk selection; grid view; saved-value growth percentage or sparkline; new business calculations; lead-detail, estimate-builder, sidebar, other dashboard, or initiation-dialog redesigns. The reference's sample names, counts, dates, rupee amounts, colored urgency dots, and `+12%` are illustrative and must never be hardcoded as live data. No new 3D scene, animation framework, or dependency is needed for this data-heavy screen.

## Visual and interaction requirements

1. **Header:** Keep the `Sales` eyebrow, `Lead workspace` heading, supporting purpose, and permission-gated `Initiate project` action. Use the existing interior asset as a decorative crop on the right with a safe, readable text area on the left. Use a warm off-white canvas, dark ink, and restrained forest/sage accents. The image may simplify or crop differently at narrow widths; it must not obscure text or controls.
2. **Metrics:** Present the four existing values in the reference's compact row with distinct, muted surface tones and clear typography. Use accurate helper copy: visible leads are rows on the current page; saved estimates include drafts; draft estimates are a subset; saved value is the sum of those saved records. Preserve the unavailable placeholder and retry message when the estimates query fails. Do not imply client approval, growth, or historical comparison from these values.
3. **Search and stage filtering:** Give the existing search field prominent placement and describe only the searchable fields the API actually supports. Present the existing `All stages` plus all nine exact stages as a scan-friendly filter, such as horizontally scrollable segmented buttons. A choice updates the existing query key and request contract; the active choice is readable without color. Do not show per-stage counts unless accurate counts for the full filtered dataset are available. Search and stage remain independent and keyboard operable.
4. **Lead list:** At wide desktop widths, use one aligned header and seven data groups: Client, Project, Stage, Estimate, Created on, Next action, and Actions. Each row uses the real lead and estimate records, with client initials as a decorative identity mark, contact details, project type/location, textual stage and estimate status, rupee value, local-date formatting, and next-action text/date. Show overdue or upcoming status with words as well as restrained color when the date is valid. Do not infer activity type from `nextAction` text or invent a status when dates are missing or invalid.
5. **Actions:** Preserve the current route destinations and conditional labels: open a lead without an estimate, continue a draft, view a non-draft estimate, open quick review only with its read permission, export PDF only for eligible non-draft estimates, and initiate only with its permission. Keep actions visible and discoverable without hover. A compact secondary action area may group quick review and export, but must retain accessible names, error feedback, and focus restoration.
6. **States:** Keep primary-list loading/error retry, secondary-estimate loading/error isolation, background-refresh status, no-leads and no-matches empty states, and permission-limited presentation. Search and stage changes must not show stale records as current after the new response settles. Preserve important text while secondary data loads.
7. **Responsive layout:** Adapt the four metrics to two columns then one or two as space allows. Reflow the toolbar. At widths where seven columns cannot be read comfortably, turn each lead into a labelled, vertically grouped row/card with client and next action first; retain every action and data value without horizontal page overflow. The stage filter may scroll within its own strip. Check long names, email addresses, rupee amounts, 200% zoom, and narrow mobile widths.
8. **Visual restraint and accessibility:** Scope new styles to this route to avoid changing other estimation screens. Reuse existing product tokens and the common shell; use subtle borders and near-square corners instead of shadows, glass, harsh gradients, neon, or hover animation. Avoid introducing Lucide icon decoration; use text labels or simple CSS geometry where an icon is optional. Maintain semantic heading order, labelled controls, meaningful list structure, visible focus, 44px touch targets where practical, sufficient text contrast, and reduced-motion-safe behavior.

## Data, API, and permission impact

No contract, schema, persistence, migration, or authorization change is intended. Existing `GET /leads` and `GET /estimates` responses remain the source of truth. The lead list is paginated, so a metric or label based on `items.length` must explicitly mean **shown on this page**; the page must not present it as the total pipeline count. The existing `pagination.total` may be used to clarify the result count but must not be used to fabricate counts for other stages. Client and project names are presentation only; rows and actions remain joined by stable lead ID. The backend continues to enforce access, and frontend permissions only determine whether the corresponding controls render.

## Risks and constraints

- Shared legacy CSS rules can override page styling or change other estimate screens. Keep selectors and imports page-specific and inspect the rendered route in the common shell.
- The reference fits a very wide screenshot. Seven desktop columns must be tested at actual workspace widths after the sidebar, not by scaling the mockup down.
- Misleading metric subtitles, stage counts, or a decorative trend chart could suggest an approved value or growth measure that the data does not support.
- Moving quick review or PDF export could make existing actions hard to discover or break focus/error handling. Preserve their semantics while changing placement.
- Existing interior imagery is decorative; its crop and load failure must leave the heading and primary action usable.

## Acceptance criteria

1. The `/estimator-sales` screen visibly follows the supplied reference's header, metric, toolbar, filter, and dense-list hierarchy, while staying within the existing Lisno shell and the user's visual restrictions.
2. Every number, status, date, contact field, and action is derived from the existing authorized responses. No illustrative value or unsupported `+12%`/trend appears as live information.
3. Search and all nine exact stage filters work through the current API contract. Project initiation, quick review, lead/estimate navigation, and eligible PDF export retain their present permission and state rules.
4. Loading, error/retry, empty, no-match, and secondary-estimate-failure states remain understandable and usable; one failed estimate request does not block the lead list.
5. Wide desktop, intermediate workspace width, and narrow mobile layouts have readable hierarchy, no page-level horizontal overflow, accessible names, keyboard focus, and useful controls at 200% zoom.
6. Focused Lead workspace and PDF tests, frontend typecheck, production build, and rendered responsive/interaction checks pass. Other estimation routes remain visually unaffected by the page-local styling.

## Open decisions

None. The reference is the target visual direction, and the user selected the current-function scope. The implementation may choose exact spacing and breakpoint values based on rendered content as long as these requirements hold.

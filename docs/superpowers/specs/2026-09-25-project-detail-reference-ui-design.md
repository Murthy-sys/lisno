# Project detail reference UI

Date: 2026-09-25. UI-only implementation authorized by the latest request and earlier explicit approval waiver; Mode A continues.

## Goal and evidence

Match the supplied project-details composition using the existing product: a wide interior-image header, compact navigation and facts, an open information/assignment column and a narrower image/summary/team sidebar. Current `AdminProjectDetailPage.tsx` has a plain PageHeader, permission-aware Overview/Messages navigation, collapsed information and assignment disclosures, and live workflow/finance/assignment/client-response panels. `AdminProjectSummary` supplies real project identity, createdAt, client contacts, property, initial budget range, estimator, lead and estimate/designer data.

## Scope and decisions

- Change only this frontend page's markup/presentation and locally scoped CSS. Reuse `projects-living-room.webp` as decorative/reference artwork; no image upload/edit feature.
- Use the full workspace width with existing shell gutters. Warm neutral surfaces, olive emphasis, thin borders, restrained corners, existing interface font, no new animations or icon library.
- Header: existing back link, project name, description and status, plus actual created date and ID. Preserve the existing conditional Assign Designer action.
- Keep existing Overview/Messages navigation and its access handling. Do not fabricate screenshot-only tabs, counts, edit buttons, More actions, timeline, manager, progress percentage or priority.
- Five compact facts use client, location, property type, created date and existing estimate value. Labels must distinguish approved contract value from current draft value and initial client budget range. Approved money uses only approvedBaseline; missing baseline never falls back to mutable estimate total.
- Open Project information and Assignment & progress by default. Reflow existing data into compact two-column definition rows; preserve all current contact, budget, lead and estimate details and disclosure keyboard behavior.
- Sidebar: reference interior image (identified as illustrative), quick summary from existing fields and known participants only (sales, assigned designer, client). No invented team, messaging or edit controls.
- Keep all existing workflow, payment, finance, design assignment, worker assignment and client response components, order, permissions, queries and mutation behavior intact in the main column. Their containers may receive page-scoped visual styling.

No backend/API/schema/permission/financial calculation changes, extra network calls, new dependencies, migration, production writes or deployment.

## Acceptance criteria

1. Reference-style hierarchy and wide image header; facts/main/sidebar alignment on desktop, orderly stacking on small screens without horizontal overflow.
2. Every displayed value derives from existing data; missing/long values remain understandable. Shared reference artwork is not represented as an uploaded project photo.
3. Existing interactions, loading/error/retry, role visibility and finance-source checks continue to work. No new mutation action or unsupported tab.
4. Keyboard navigation, contrast and responsive rendering verified; focused existing detail tests, typecheck/build and diff hygiene pass.
5. All unrelated dirty work preserved.

Risks: existing admin styles have high specificity, repeated values require test queries scoped to semantic sections, nested workflow UI must remain usable in the narrower main column. Mitigate with scoped selectors and actual rendered QA across widths/states. Rollback is limited to page JSX, new CSS and associated presentation test adjustments. No open product decisions remain.

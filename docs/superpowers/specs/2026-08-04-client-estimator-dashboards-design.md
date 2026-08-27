# Client and Estimator Dashboard Redesign

**Date:** 2026-08-04
**Status:** Approved direction; written-spec review pending

## Objective

Deliver an immediately visible redesign of only the two authenticated dashboard routes:

- Client: `/client`
- Estimator/Sales: `/estimator-sales`

The redesign must preserve the existing APIs, route destinations, permissions, dialogs, downloads, project expansion, filtering, and business rules. Client project pages, lead-detail pages, and estimate workspaces are explicitly out of scope.

## Approaches considered

1. **Operational clarity — selected.** Strong page hierarchy, compact summary metrics, prioritized actions, structured cards, and calm responsive density. This best fits both roles and the existing Lisno foundation.
2. **Dense data table.** Faster scanning for Estimator/Sales, but too utilitarian for the Client portal and weaker on mobile.
3. **Editorial showcase.** More visual whitespace and oversized typography, but slower to scan and less appropriate for action-heavy sales work.

## Shared visual direction

Both dashboards use the existing midnight, porcelain, and violet foundation. The shell remains unchanged. Dashboard content uses:

- one compact page hero with eyebrow, `h1`, supporting copy, and the primary action when applicable;
- a summary strip of small metric cards derived only from already-loaded dashboard data;
- white/porcelain surfaces with restrained borders, modest radii, and no decorative gradients;
- violet only for active state and primary actions, with semantic status colors for workflow state;
- clear 44px interactive targets, visible focus rings, and no horizontal page overflow;
- responsive stacking below tablet width without hiding actions or identity text.

## Client dashboard

The Client dashboard becomes a calm project overview:

1. Hero: “Your design plans,” existing explanation, and a compact “Projects shared” summary.
2. Summary strip: shared project count, average project completion, and number of available approved plan files. Values are computed from the existing project and latest-version queries; no new request is introduced.
3. Commercial review: the existing `EstimateReviewPanel` remains functionally unchanged but receives a clearer dashboard section boundary and heading hierarchy.
4. Projects: project cards display location, project name, progress, floor count, and an explicit expand/collapse affordance. Expanded content retains expected completion, latest approved update, retry behavior, and “Open project.”
5. Empty/error/loading states preserve the existing query actions and use the shared foundation state language.

## Estimator/Sales dashboard

The Estimator/Sales dashboard becomes an operational pipeline view:

1. Hero: “Lead workspace,” existing supporting copy, and the “New lead” primary action.
2. Summary strip: visible leads, saved estimates, draft estimates, and saved-estimate value, all derived from existing query results.
3. Search and stage filters move into a compact toolbar with clear labels and stable 44px controls.
4. Saved estimates become concise pipeline cards with status, project/client identity, total, property type, PDF export, and continue/view action. Existing download behavior and error handling remain unchanged.
5. Lead rows gain a header at desktop widths and clearer grouped identity, project, stage, and next-action content. On mobile each row becomes a labelled card without relying on column position.
6. `LeadCreateDialog` and route links remain unchanged.

## Data and behavior boundaries

- No backend, API-client, query-key, type, schema, or route changes.
- No new network request or persisted state.
- Existing loading, error, empty, retry, export, filter, expand, dialog, and navigation behavior remains authoritative.
- Metrics must tolerate pending/failed secondary queries without blocking the primary dashboard.
- Search and stage changes continue to drive the current query contract.

## Accessibility and responsive behavior

- One route-owned `h1`; lower sections use ordered `h2`/`h3` headings.
- Metric content remains textual and is not exposed as unnecessary live announcements.
- Status labels retain text, not color alone.
- Project toggles keep `aria-expanded` and `aria-controls`.
- Desktop layouts adapt at approximately 1024px and 720px; mobile uses one column.
- Controls and action links keep at least 44×44px targets and visible keyboard focus.
- Reduced-motion users receive no new transform animation.

## Testing and acceptance

Focused component tests will verify:

- the new dashboard landmarks/headings and summary metrics;
- preservation of Client expansion/retry/open-project behavior;
- preservation of Estimator search, stage filter, PDF export, lead creation, and navigation;
- semantic status text and mobile-label hooks;
- no changes to the existing API call contracts.

Acceptance requires both dashboard suites, shared accessibility coverage, frontend typecheck, and production build to pass. Browser verification will cover desktop and mobile composition for only these two routes.

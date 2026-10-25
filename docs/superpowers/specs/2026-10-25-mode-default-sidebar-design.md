# Compact default margins sidebar

## Current user requirement

Show only saved default margin values together: PMC margin: min-max; Sub-vendor margin: min-max; In-house margin: min-max. No visible heading, dropdown, source identity/revision, calculation fields, helper text or action buttons. This supersedes the earlier interactive sidebar; the existing Sub-Basket bulk margin controls and backend contracts remain available unchanged.

## Behavior

Use the first saved Main Line in the same Sub-Basket as already provided by the summary API. Render three compact labelled rows together. Preserve percentage precision and show explicit Not configured, Loading or Unavailable values instead of fabricating defaults. The panel is read-only and sends no margin mutation.

In-house equal Labour/Material ranges collapse to one range. Across multiple components, collapse only if every component has the same complete pair. Differing ranges keep the minimum labels needed to distinguish Labour, Material and components. Blank components remain explicit. Do not combine unrelated margin ranges or treat missing margins as configured values.

Keep the compact neutral style and responsive wrapping, accessible region and definition list. Other workspace tabs retain Revision history, and Quick summary remains separate. Remove the obsolete sidebar apply/locking/rebase integration while preserving ordinary Mode save and version checks.

## Validation and delivery

Update existing rendering/integration tests for the read-only list, distinct and incomplete In-house values, empty/error states, accessible output and ordinary Mode save. Run frontend build and inspect the rendered list. Apply only hash-checked scoped files with backups. No data migration, seed, dependency, backend mutation, commit or deployment.

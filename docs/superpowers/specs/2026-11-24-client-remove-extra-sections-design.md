# Client project: remove two secondary sections

Date: 2026-11-24
Status: Approved and implemented in Mode A. Focused regression, typecheck/build and desktop/phone verification passed; see the task plan.

## Goal and interpretation

Remove **Additional requirements** and **Project coordination** from the Client project-details screen. These are the two disclosure headings at the top of the supplied screenshot. The separate **Selections requiring your approval** panel remains available under its current rules.

## Current behavior and evidence

- `frontend/src/features/client/ClientProject.tsx` mounts `ClientEstimateRequirements` for workflow version 2 and, in compact form, version 3. The compact component renders the Additional requirements disclosure.
- The same page mounts `PMCounterpartPanel` for shared and older estimation paths. That shared component renders Project coordination.
- `showSubmittedSections` also controls design-selection visibility through `ProjectWorkflowPanel`; this publication check remains necessary after removing the two requested sections.
- `ClientProject.estimateReview.test.tsx` currently expects both sections to appear after publication and during background refreshes. These expectations must be updated while retaining quotation-edit, approval, refresh, error and project-identity coverage.

## Scope and requirements

1. Remove the two component mounts and unused imports from `ClientProject.tsx` for all estimation versions. Remove the panels from rendering rather than hiding them with CSS, so this screen no longer initiates their component-owned requests.
2. Preserve quotation editing/review, the total inclusive of all charges, PDF access, messages, workflow/progress, design selections, site/vendor reviews and approved documents.
3. Keep `showSubmittedSections` and its existing authorization/publication behavior for the remaining design-selection panel.
4. Preserve the shared components and their other consumers. Do not delete saved requirements or coordination records.
5. Frontend presentation only: no backend, API, schema, permission, financial, dependency or lockfile changes.

## Assumptions, constraints and risks

- “Client screen” refers to the project-details route `/client/projects/:projectId` shown in the screenshot.
- The requested two sections are the named disclosure headings, not the third approval panel below them. No other product decision is open under this interpretation.
- Existing quotation-summary work is already dirty in the worktree and must remain untouched. Capture fresh status/diffs before implementation.
- The principal regression risk is removing the remaining approval panel's publication guard or losing regression coverage while replacing old section-presence assertions.
- No migration, stored-data transition, external side effect or deployment is required. Rollback is restoring the removed frontend mounts.

## Acceptance criteria and verification

1. Additional requirements and Project coordination are absent from Client project details in current and older estimation paths, including after submission and with a `pm` query parameter.
2. Their component-owned requirements/coordination requests are not initiated by this screen.
3. Selections requiring your approval retains its existing permitted/published visibility and refresh behavior. Quotation edits, approval controls and project navigation continue to work.
4. Update the existing project-review regression tests for the new visibility requirements without duplicating component tests. Run that focused suite, frontend typecheck/build, and `git diff --check`.
5. Render the affected page at desktop and phone widths to confirm the panels and their reserved spacing are removed and remaining controls retain accessible names and keyboard access.

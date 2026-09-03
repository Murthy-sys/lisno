# Main Line Overview Section Summaries Removal Specification

## Goal

Remove the **All section summaries** card block from the Main Line Overview, including the Mode and Advanced cards shown in the supplied screenshot.

## Current behavior and evidence

- `KnowledgeOverviewPanel.tsx` renders a final Overview section titled **All section summaries** after the principal configured-value panels.
- The section maps `summary.sectionCards` into status cards for Mode, Scope, Recommendations, Quality, Execution, and Advanced when a card has configured content or a source needs attention.
- Each card can repeat completeness state, counts, highlights, warnings/blockers, source loading/error state, retry controls, and—where navigable—an **Open …** action.
- In the supplied state, the filter leaves only Mode and Advanced visible. Mode repeats the specification count and pricing/quantity-margin warnings; Advanced renders an otherwise empty **Complete** card.
- The principal Overview already has dedicated panels for selected Mode details, shared calculation values, Specifications, Pricing, Recommendations, and Quality, with relevant navigation actions.
- The existing uncommitted Gap behavior work modifies `KnowledgeScreens.test.tsx`; any additional test changes in that file must preserve and integrate its prior assertions.

## Scope

- Remove the entire rendered **All section summaries** section from Main Line Overview.
- Remove all cards within that section, including Mode, Scope, Recommendations, Quality, Execution, and Advanced cards, regardless of configured, warning, loading, error, or read-only state.
- Remove card-only rendering helpers, imports, and tests that become unused after the section is removed.
- Update rendered Overview/workspace tests to assert the section heading, cards, duplicated warnings, and card-level **Open …** actions are absent while principal Overview content remains intact.

## Non-goals

- Do not remove or alter the principal Overview panels for selected Mode details, shared calculation values, Specifications, Pricing, Recommendations, or Quality.
- Do not remove Overview's editable UOM or Surface controls.
- Do not remove or rename Mode, Recommendations, Quality, or other editor tabs/sections.
- Do not delete saved Scope, Execution, Advanced, Mode, Pricing, quantity-margin, Recommendations, or Quality data.
- Do not change backend completeness calculation, blockers/warnings, activation readiness, APIs, OpenAPI, persistence, CAS versions, authorization, or audit behavior.
- Do not remove the `sectionCards` summary projection contract unless dead-code evidence proves it has no remaining consumer and a separate contract change is approved.
- Do not change the previously approved Gap behavior implementation or its tests.
- Do not add dependencies, stage, commit, push, deploy, migrate, or mutate production data.

## Requirements

1. Main Line Overview must not render the **All section summaries** heading or its supporting sentence.
2. Overview must not render Mode, Scope, Recommendations, Quality, Execution, or Advanced summary cards from `summary.sectionCards`.
3. The duplicated card-level completeness badges, counts, highlights, warnings/blockers, source retry controls, and **Open …** actions must be absent.
4. Principal Overview panels and their existing **Open Mode**, **Open Recommendations**, and **Open Quality** actions must remain available under their current visibility rules.
5. Saved data, section queries, source state, completeness results, and backend contracts must remain unchanged by this presentation-only removal.
6. Existing uncommitted Gap behavior changes and regressions must remain intact.
7. No empty wrapper, heading gap, or card-grid spacing must remain where the removed section previously rendered.

## Assumptions

- “This section” refers to the entire final **All section summaries** block shown in the screenshot, not only the two cards visible in that particular data state.
- The principal Overview panels provide the useful configured-value summaries and navigation; the lower cards are redundant for this workflow.
- Backend completeness and saved hidden-section data may still be used by activation checks and other surfaces, so only the Overview rendering is removed.

## Constraints

- Preserve the existing Main Line Overview information hierarchy above the removed block.
- Preserve frontend permission gating and backend authorization.
- Preserve unrelated work in `KnowledgeScreens.test.tsx` and every other dirty path.
- Use existing components and styles; no shared primitive, design-token, or dependency change is required.

## Risks and mitigations

- **Useful principal content removed accidentally:** target only the final `visibleSectionCards` render block and keep the principal-grid regressions positive.
- **Navigation regression:** retain and test principal panel actions while removing only card-level actions.
- **Hidden data deletion:** make no payload, mutation, API, or backend changes.
- **Loss of retry coverage:** remove only retries that belonged to cards no longer rendered; keep source-boundary behavior for principal panels unchanged.
- **Prior work overwritten:** capture the existing `KnowledgeScreens.test.tsx` diff before edits and verify the Gap behavior regressions still pass afterward.
- **Dead local helpers/imports:** remove only symbols proven unused after the card renderer is deleted, then run typecheck.

## Acceptance criteria

1. **All section summaries** and its supporting copy are absent from Main Line Overview.
2. No Mode, Scope, Recommendations, Quality, Execution, or Advanced summary card article is rendered.
3. No duplicated card warning such as **pricing is not configured** or **quantity-margin is not configured** appears through the removed card block.
4. Principal configured-value panels and their navigation actions retain their existing rendering and behavior.
5. Overview UOM/Surface editing and other Main Line tabs remain unchanged.
6. The previously approved Gap behavior removal, hidden-value preservation, and fresh-slab compatibility tests remain green.
7. Focused Overview/workspace tests, frontend typecheck, full frontend tests, production build, and `git diff --check` pass.
8. No backend, API, persistence, calculation, authorization, migration, dependency, or external-system change is introduced.

## Data, API, and UX impact

- **Data:** none; saved section payloads remain untouched.
- **API/backend:** unchanged; completeness and section-summary projection inputs remain available.
- **Persistence/migration:** none.
- **Authorization:** unchanged.
- **UX/accessibility:** removes the redundant final heading, card landmarks, badges, warnings, retry controls, and card-level navigation stops; Overview ends after the principal configured-value panels.
- **External actions:** none authorized.

## Open decisions

No open decision remains if the screenshot refers to the complete **All section summaries** block. Removing only Mode and Advanced while retaining other cards would leave the same redundant section structure and is outside this specification.
/
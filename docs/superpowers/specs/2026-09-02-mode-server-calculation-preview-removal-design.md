# Mode Server Calculation Preview Removal Design

**Status:** Proposed — awaiting approval  
**Date:** 2026-09-02  
**Scope:** Configuration → Main Basket → Main Line → Mode → Quantity & margin

## Goal

Remove the user-facing **Server calculation preview** card from the Main Line
Mode screen. The priced Quantity slab editor already gives users the relevant
Specification, Unit, Quantity, Unit rate, and Estimated cost workflow, while
the separate preview exposes implementation-oriented quantity-scale and
basis-point inputs that are confusing in normal configuration work.

## Current behavior and evidence

- `KnowledgeModePanel` renders `KnowledgePreviewPanel` directly after the
  Quantity & margin editor.
- The card asks users to manually enter Unit rate, Quantity, Quantity scale,
  quantity adjustment, wastage, tax, margins, and PMC markup, then select
  **Run server preview**.
- The card calls the existing frontend `previewKnowledge` client, which reaches
  the backend calculation-preview endpoint.
- `KnowledgeScreens.test.tsx` currently exercises the preview button as part of
  the Mode screen test.
- The configured priced-slab row now derives its own read-only Estimated cost,
  so the preview card is not needed to complete the requested slab workflow.

## Scope

- Stop rendering the Server calculation preview card in Main Line → Mode.
- Remove the now-unused private React component, local state, presentation
  helpers, and imports from `KnowledgeModePanel.tsx`.
- Remove CSS rules used only by the deleted preview card/result.
- Update Mode-screen tests to assert that the preview heading, inputs, and
  action are absent while Pricing and Quantity & margin remain functional.
- Preserve all approved priced-slab behavior, legacy adjustment slabs, margin
  controls, Mode Save/Discard behavior, and existing Overview simplifications.

## Non-goals

- Do not remove or change the backend calculation-preview endpoint, service,
  calculation domain, OpenAPI contract, or backend tests.
- Do not change financial formulas, paise handling, GST, wastage, margins,
  quantity adjustment, PMC markup, or immutable price lineage.
- Do not change the persisted knowledge-section schema or migrate data.
- Do not redesign the priced Quantity slab editor.
- Do not deploy, seed, migrate, commit, or push.

## Requirements

1. Main Line → Mode must no longer display **Server calculation preview**,
   **Run server preview**, or its manual preview inputs.
2. Quantity & margin must continue to display its margin controls, priced
   Quantity slabs, legacy adjustment slabs when present, and their validation.
3. Removing the card must not issue a preview API request or affect Mode dirty,
   saving, conflict, or aggregate-version state.
4. The backend preview capability must remain available and unchanged for
   internal validation and any future approved consumer.
5. UI-only dead code and preview-only CSS may be removed, but shared Button,
   Field, money formatting, API, and domain utilities must be preserved when
   used elsewhere.
6. The resulting Mode layout must remain accessible and responsive without an
   empty surface or unexplained spacing where the card previously appeared.

## Assumptions and constraints

- The user's “ok” accepts the recommendation to remove only the user-facing
  card while retaining the backend calculation capability.
- This is a localized frontend removal with no data, authorization, API, or
  financial-contract change.
- Existing uncommitted approved work in the affected frontend files must be
  preserved; implementation must make a narrow diff.

## Risks and mitigations

- **Accidental backend removal:** constrain implementation to frontend rendering,
  UI-only code, CSS, and tests; verify backend files are untouched.
- **Removing shared helpers:** trace every symbol before deletion and rely on
  TypeScript plus the full frontend suite.
- **Layout regression:** assert the Quantity & margin region remains visible and
  no preview surface/action remains.
- **Test overreach:** replace only preview-specific expectations; preserve the
  surrounding Mode journey assertions.

## Data, API, authorization, and UX impact

- **Data/persistence:** none.
- **API:** the frontend screen stops calling preview; the API endpoint and
  contract remain unchanged.
- **Authorization:** none; existing Draft/read-only rules remain authoritative.
- **Financial calculations:** none; slab Estimated cost and backend calculations
  remain unchanged.
- **UX:** removes a redundant technical form and leaves Quantity & margin focused
  on direct configuration.

## Acceptance criteria

1. The Mode screen contains no Server calculation preview card, preview fields,
   or Run server preview button.
2. Pricing, Quantity & margin fields, Add Quantity slab, Estimated cost, legacy
   rows, and Mode Save/Discard continue to work.
3. Entering or saving Mode data never triggers `previewKnowledge` implicitly.
4. Backend preview routes, contracts, calculations, and tests are unchanged.
5. Focused Mode tests, frontend typecheck, full frontend tests, production build,
   and repository hygiene checks pass.
6. No migration, dependency, lockfile, generated, staged, deployment, commit, or
   external-system change is introduced.

## Open decisions

None. The accepted boundary is removal from the user-facing Mode screen while
retaining backend preview capability.

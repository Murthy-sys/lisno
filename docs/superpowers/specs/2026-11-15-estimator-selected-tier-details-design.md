# Selected-tier details in the estimator

Date: 2026-11-15
Status: Approved and implemented in Mode A; verification recorded in the task plan

## Goal

Add a collapsed **Show details of tier** expansion panel to each included estimator item. For the currently selected Signature, Premium, or Functional tier, it lists **Specification item name (Brand name)**. Preserve the existing estimator row styling and controls.

The user's clarification, “spec item name with brand in bracket,” defines the expanded content as specification names and associated brands only. Separate Mode paragraphs and specification brief-description paragraphs are not included.

## Current behavior and evidence

- The pictured drawer is `KnowledgeMainLineClientPreview.tsx`. It uses the same `EstimateLineLayout` and tier controls as the estimator, but currently displays no specification details.
- Actual estimator rows are rendered by `ConfiguredEstimateBuilder.tsx`. The selected tier is carried by `ConfiguredLineDraft.modeTier`; drafts are created and refreshed in `configuredEstimate.ts` using stable Main Line, basket, Sub-Basket, and room IDs.
- Both views use `/estimation/catalogue`. `EstimationCatalogueMainLine` currently supplies tier pricing, source identity/version, and applicability but no specification names or brand labels.
- `estimator-catalogue.service.ts` already resolves the latest saved draft revision, otherwise the saved active revision. Its pricing-section query currently selects only `payload.tierConfigurations`, so it does not load root Signature specifications or brands.
- `projectKnowledgeModeTierSection` resolves the exact namespace: root advanced/pricing fields are Signature; Premium and Functional have their own payloads. Default Mode is a separate configuration scope and must not fill missing tier data.
- Specification names and brand associations live in that tier's pricing payload. Associations use `brandId` or `brandIds` and must resolve against the same payload's brand IDs. The clarified display does not require reading or generating Mode descriptions.

## Scope and UX

1. Apply the panel to the configured estimator item rows and the pictured Configuration **Client view** preview. Reuse one small presentation component so the behavior and styling agree.
2. Use the exact visible collapsed title **Show details of tier** and the existing disclosure styling. Place it below the item name in the item's details area, using the available space without crowding quantity/rate/amount controls. Do not put interactive disclosure controls inside the item-selection checkbox label.
3. Default to collapsed. Expanding and collapsing is local display state and makes no write request. Keep it expanded when the tier changes and replace the content with that tier's details immediately. Changing the Main Line resets its disclosure state; the same Main Line in another room remains independent.
4. Expanded content lists that tier's configured specifications as **Item name (Brand name)**. Multiple associated brands appear comma-separated in the same brackets; omit brackets when no brand is associated. Preserve saved item and brand order and resolve by stable IDs, never labels. Identify the selected tier in the panel's accessible context without adding redundant headings to the compact row.
5. Render only specification names and associated brand names as plain text. Do not show separate description paragraphs, raw IDs, prices, or Configuration metadata in the expansion. Do not infer a specification or brand from the Main Line's name.
6. Use clear missing/unavailable feedback inside the expansion. Missing tier data must never borrow Signature, default Mode, another Main Line, or an old revision. Missing brands use a concise unavailable label, without exposing a raw ID. Legacy API responses without the new details field remain usable and show details unavailable.
7. Show details only for an included item with a selected configured tier. For unavailable current source data, preserve the existing source warning and show details unavailable, without reusing stale detail text. Read-only rows may expand details when an actual configured tier is selected; expanding cannot enable editing.
8. Retain existing colors, type, spacing, borders, row controls, quantities, rates, amounts, and tier-selection rules. Long specification names and multiple brands must wrap at desktop, tablet, and mobile widths. Support keyboard expansion, visible focus, unique accessible names, and screen-reader state.

## Data/API integration and invariants

- Add an optional, read-only `tierDetails` map to catalogue lines, keyed only by Signature/Premium/Functional. Each available entry contains specification records with stable IDs, names, and associated brand IDs/names. Distinguish a configured empty list from unavailable details; represent unresolved brand names explicitly. No paragraph fields are needed.
- Build these details from the same verified Main Line/revision as the catalogue row and project only the exact applicable tier. Include both regular and temporary catalogue items under their existing eligibility policy. Do not change line eligibility or financial availability because optional detail text is missing.
- Expose only the descriptive fields required by the UI. Never serialize raw Configuration payloads, internal notes, cost inputs, margin rules, calculations, or unrelated compatibility fields. Preserve existing route authorization and client visibility behavior.
- Update the catalogue DTO, OpenAPI response documentation, and frontend types together. Carry display metadata through catalogue-to-draft creation and refresh, clearing it when source identity is missing or mismatched. Do not include it in estimate mutation payloads or dirty-state fingerprints.
- Preserve current cache keys and catalogue refresh behavior. Configuration saves already invalidate catalogue readers; refreshed specification and brand names should replace previous metadata without changing the selected tier, quantity, or saved price.
- Do not persist this display projection or change estimate approval/publication snapshots. Published documents, PDFs, client saved-quotation APIs, and historical estimates are outside this task. This scope adds the panel to the estimator and its Configuration preview, not to separate client quotation/document workflows.

## Risks, compatibility, and rollback

The main risks are cross-tier or cross-revision content, resolving a brand from the wrong tier, exposing private Configuration fields, and accidentally treating descriptive refreshes as estimate edits. Test with deliberately different content and reused local IDs in different tiers/Main Lines. Preserve all existing dirty work; the shared estimator stylesheet and other targets already contain changes from earlier tasks.

The additive catalogue response needs no database migration or new endpoint. Frontend handling of an absent field permits mixed-version deployment without misleading fallback. Rollback is a code revert; no stored-data repair is required. No dependencies, seed, migration execution, production mutation, commit, push, or deployment are authorized by this scope.

## Acceptance criteria and verification

| ID | Acceptance criterion | Evidence |
| --- | --- | --- |
| AC1 | Included configured estimator and preview rows have a collapsed Show details of tier control in the existing styling. | Rendered consumer tests and desktop/mobile inspection. |
| AC2 | Expanded content follows the selected tier and lists only Item name (Brand names), without separate description paragraphs. | Three unequal tier fixtures, mode/tier changes, multiple/absent brands, text escaping, long content, and absence of Mode/brief-description text. |
| AC3 | Details use the latest saved source and exact tier, with stable-ID brand joins and explicit missing/unavailable states. | Catalogue projection tests for draft versus active, missing tier, malformed association, two unequal Main Lines, and temporary items; frontend refresh/identity checks. |
| AC4 | Only safe descriptive fields cross the existing API; rates, amounts, authorization, visibility, and immutable snapshots retain their behavior. | API/OpenAPI contract checks, private-field sentinel fixtures, existing catalogue/estimate regression tests, and no-write preview assertions. |
| AC5 | Expansion is keyboard accessible and responsive, and does not toggle inclusion or mark an estimate dirty. | Rendered interaction/accessibility tests, independent room rows, focused draft-serialization checks, browser widths 1440/768/390/320px. |
| AC6 | Integrated implementation compiles and preserves unrelated work. | Relevant backend/frontend tests and typecheck/build, `git diff --check`, baseline diff comparison. |

Use the existing replica-set catalogue test lane for the changed Mongo projection/resolver integration, with focused projection tests where appropriate. No live database or customer data is needed. Exact task ownership and commands belong in the separate task plan after spec approval.

## Assumptions and open decisions

The latest clarification is treated as the exact content requirement: specification item names with associated brands in brackets. “Estimator screen” includes the configured estimator rows and the pictured Client view preview. Existing standalone client quotation pages and issued documents remain outside this request. No open product decision remains.

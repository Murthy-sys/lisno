# Estimator GST-inclusive prices and selected-tier descriptions

Date: 2026-11-17
Status: Implemented and verified in Mode A; pre-existing test failures and verification details are recorded in the task plan

## Goal and confirmed requirements

1. Show 18% GST included in each item's Price and the main estimate total.
2. Keep the client detail area short: show only the selected Signature, Premium, or Functional description, with no specifications, internal information, or extra visible headings.

The user explicitly confirmed **Each item's Price and main total** and **Selected tier description only**. These choices resolve the initial ambiguity about price scope and client specification visibility.

## Current behavior and evidence

The worktree was clean at investigation start (`git status --short` returned no paths). No implementation changes have been made.

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx:371` already calculates GST at 18%; its summary uses the existing final-total rounding helper. However, `displayedAmount` at line 1422 uses the subtotal, and the prominent amount and historical footer are explicitly labelled before GST.
- `ConfiguredEstimateBuilder.tsx:614` displays configured rates or an In-house per-unit equivalent before GST, followed by the net line amount. Client quotation rows and Configuration's Client view similarly display net configured prices. Governed In-house aggregate totals already include margin, but exclude estimate GST.
- `backend/src/services/estimate-tiers.service.ts:343` applies GST to the net subtotal. Changing saved rates or line amounts to gross would cause tax to be added twice and could affect approved finance baselines.
- `shared/estimation/estimateTotalRounding.ts` rounds only the final estimate total to whole rupees, with exactly 50 paise rounding down. Historical totals without an adjustment retain their recorded amounts.
- `backend/src/domain/estimator-tier-description.ts` selects the requested tier but can fall back to default Mode. It calls `syncModeDescription`, which can add PMC/In-house inclusion and exclusion clauses to saved wording.
- `KnowledgeModeConfigurationBuilder.tsx:111` also synchronizes the visible description, and `updateConfigurations` at line 205 can write those generated changes into `modeDescription` when settings change.
- `EstimateLineTierDetails.tsx` renders a visible Description heading, tier label, and paragraph. Staff can opt into a separate Internal specifications disclosure. `ClientQuotationLine.tsx:65` and `KnowledgeMainLineClientPreview.tsx:136` already omit specifications, but consume the potentially expanded/fallback description.
- Catalogue descriptions use the latest saved draft, otherwise active revision, checked against stable Main Line and revision IDs. Client quotation choices already carry a nullable description through their scoped API; raw specifications do not need to be added.

## Scope and recommended approach

Use a consistent GST-inclusive display projection over existing net pricing. Keep the backend financial source of truth and final-total calculation intact. Resolve descriptions from only the chosen tier's saved Description, and present that text without decorative headings or appended configuration content.

Affected areas are the shared monetary presentation helper, current estimator rows and main total, client working-quotation price display, Configuration Client view, the selected-tier description projection/editor, shared description presentation, API documentation, and their focused regression tests.

### Price behavior

1. Current estimator item Price/Rate displays include 18% GST. Where a companion line Amount is displayed, it also includes GST and is identified accordingly. Use compact labels such as `Price incl. GST`, `Rate incl. GST`, and `Amount incl. GST`; keep the UOM visible where applicable.
2. Cover configured Vendor, PMC, legacy component-priced In-house, and governed aggregate In-house prices without changing their underlying pricing formulas. Apply GST after configured selling margin has been included. Preserve whether a field represents a unit rate or a quantity-dependent total; do not invent a unit rate for an aggregate-only client field.
3. Use integer paise and checked arithmetic. For a valid net amount `n`, compute GST as `(n * 18 + 50) / 100` with integer division, then add it to `n`. Reject unsafe integers and overflow. Do not convert missing, pending, invalid, or unavailable prices into zero.
4. Derive the gross line amount from its authoritative net line amount, calculated at the selected quantity. Do not multiply a rounded gross unit rate to replace that source. Display-only unit and line rounding can differ by paise.
5. The prominent current estimate amount uses the existing GST-inclusive grand total, including its existing final round-off. Use the same saved-versus-editable source selection as Summary. Include a concise visible GST label and a matching accessible name.
6. The grand total remains `net subtotal + GST calculated on that subtotal + final round-off`. Do not sum independently rounded gross display prices to recreate it. Subtotal/GST/Round off rows remain available in Summary and Proposal.
7. Existing room, basket, and comparison subtotals may remain net, but must be explicitly identified as before GST wherever their basis would otherwise be ambiguous. Do not relabel a net amount as gross. This is a scoped pricing presentation change, not a rewrite of comparison/export contracts.
8. Apply the same current-price presentation in the client working quotation and Configuration Client preview so their prices agree with the estimator. Preserve `From components`, `After save`, and stale-quantity feedback where a valid price is not available.
9. Historical estimate navigation uses the selected snapshot's recorded grand total, never a newly calculated 18% adjustment. Historical line amounts remain recorded net values with an explicit before-GST basis. Published/approved artifacts and stored values remain immutable.

Examples: a net unit rate of ₹100 displays ₹118 including GST; a net line amount of ₹250 displays ₹295 including GST. A recorded ₹102.50 historical grand total stays ₹102.50. A current subtotal of ₹86.64 plus ₹15.60 GST keeps the established rounded grand total of ₹102.

### Description behavior

1. Map Signature to the root advanced-section Description, Premium to its own namespace, and Functional to its own namespace. Read only the applicable selected tier from the same verified current Main Line revision.
2. Remove default Mode fallback for descriptions. Missing, cleared, disabled, malformed, or unavailable selected-tier wording must not borrow another scope, tier, Main Line, or historical revision. This supersedes the previous description-fallback rule; internal specification-list fallback is unaffected.
3. Return only the selected tier's saved `modeDescription`. Do not generate text or append/synchronize inclusions, exclusions, specifications, brands, pricing settings, source metadata, or internal notes during catalogue projection.
4. Keep Description authoring independent of configuration checklists. Changing PMC, Vendor, or In-house settings must not append or rewrite the Description. Saving and clearing Description still use the existing save, validation, and cache-invalidation flow. Default Mode remains independently editable but is not substituted into tier descriptions.
5. Preserve intentionally saved wording, line breaks, plain-text escaping, and the existing 4,000-character limit. Do not use regex-based removal to guess which sentences in old saved text were generated. There is no reliable provenance for such text; existing stored Description content remains editable without an automatic data rewrite.
6. In the client detail area, render the selected text directly below its item. Omit visible Description/tier headings, specification lists, Internal specifications/Internal information labels, and extra explanatory copy. Retain a screen-reader accessible association to the item and selected tier. Omit the empty paragraph when no description exists.
7. Keep the same selected-tier wording in the staff estimator and Configuration Client view. Authorized staff specification access may remain separate; it must not appear in a client projection or be concatenated into Description.
8. Tier switching and Configuration refresh replace the paragraph immediately without leaving the previous tier's text visible. Missing or incompatible current sources clear the display metadata. Description-only refresh must not mark the estimate dirty or mutate its financial fields.

## Data, API, permissions, and compatibility

- Stored `ratePaise`, `amountPaise`, aggregate/component pricing, subtotal, GST, total, and fingerprints keep their current meanings. Gross price projection is presentation only and must never be written back into net-price mutation fields.
- Keep the existing `tierDescriptions` map and scoped choice `description` field. Update API documentation to describe selected-tier saved wording without generation or fallback. No new endpoint or client specification field is required.
- Preserve current backend authorization, client line visibility, stable IDs, version/CAS checks, immutable approval history, and query invalidation. No permission expansion is included.
- Preserve net-of-GST revenue and margin calculations, approved baselines, project/detail/portfolio reconciliation, and historical round-off behavior.
- No schema migration, dependency, seed, backfill, production mutation, deployment, commit, push, or customer communication is required. Code rollback requires no stored-data repair.

## UX constraints and non-goals

Keep the existing layout, typography, controls, focus behavior, and responsive structure. Use compact labels and plain text. Add no cards, icons, animation, new pricing settings, or decorative effects. Do not truncate meaningful saved Description text to force a short layout; wrap long text on mobile.

This does not change statutory tax policy, procurement/invoice GST, costing/margin formulas, approved/published PDF artifacts, native mobile layouts, or the internal specification editor. It does not auto-clean historical saved descriptions. Shared API description semantics naturally apply to any existing consumer.

## Risks and acceptance criteria

The main risks are double GST, paise/rupee mistakes, changing historical totals, inconsistent net/gross labels, stale-tier text, and exposing configuration content. Verification must use unequal items/projects and distinct wording in all tier/default scopes so accidental reuse cannot pass.

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Current item Price/Rate and companion Amount include exactly 18% GST across supported pricing modes; missing/invalid prices remain honest. | Focused monetary cases for zero, fractional paise results, fractional quantities, overflow, missing values, and unequal prices; rendered staff/client/preview assertions. |
| AC2 | Main current estimate amount agrees with Summary's rounded GST-inclusive total, and historical navigation uses recorded totals. | Draft edit, save/reopen, revision switching, loading/error, incomplete totals, and below/at/above-50-paise cases. |
| AC3 | Display conversions do not change net mutation payloads, persisted pricing, final rounding, or finance reconciliation. | Payload/fingerprint assertions and focused existing backend rounding/finance tests with two unequal projects. |
| AC4 | Each tier shows only its own saved Description, with no default fallback or synthesized configuration clauses. | Backend projection and catalogue/choice integration cases covering three distinct tiers, different default text, absent/empty/disabled/malformed sources, and stable-ID/revision isolation. |
| AC5 | Description is not rewritten by unrelated configuration edits; save/clear/refresh still works. | Editor interaction and persistence-contract tests with selected checklist values and independently authored text. |
| AC6 | Clients see only the paragraph, without headings or specifications; staff-only access remains isolated. | Rendered client quotation, shared detail, and Configuration preview tests with private-content sentinels, tier switching, empty states, and escaped markup. |
| AC7 | Layout and accessibility remain usable on desktop and narrow mobile widths. | Local rendered/browser checks for price labels, long descriptions, keyboard interaction, and accessible names. |
| AC8 | The integrated change compiles and preserves repository hygiene. | Affected frontend/backend typechecks and builds, focused regression suites, `git diff --check`, and final status inspection. No lint script exists. |

## Assumptions and open decisions

- The confirmed item-price scope includes both ordinary Rate fields and the existing In-house Price fields in current web estimator/quotation views; all remain read-only pricing outputs.
- Description means the tier's saved Description field, not a specification's brief-description field. Stored wording is preserved as authored because old generated sentences cannot safely be distinguished from intentional prose.
- No unresolved product decision remains after the two user clarifications. The specification and separate task plan were approved, and the user selected Mode A.

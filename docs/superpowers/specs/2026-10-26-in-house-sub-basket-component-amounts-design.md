# In-house amounts from Sub-Basket components

Status: specification awaiting approval. No task plan or implementation is included in this stage.

## Goal and confirmed decisions

When an included Main Line uses In-house, its selected components must supply the configured amounts attributable to their Sub-Baskets. Use the Labour and Material settings saved inside each component, including quantity impact and the applicable selling calculation. Do not use another Main Line's configuration as a Sub-Basket default.

The user explicitly confirmed:

- Apply this to both estimate totals and Procurement amounts.
- When multiple included Main Lines contribute components to the same Sub-Basket, add each Main Line's contribution using that line's own quantity. Do not charge one shared amount for the whole Sub-Basket.

Recommended approach: retain Main Line and estimate source identities, calculate components independently on the backend, and expose a reconciled breakdown by the components' stable Main Basket/Sub-Basket IDs. Extend the existing calculators and current-revision rules.

## Current behavior and evidence

Read-only inspection on 2026-10-26 found a clean working tree before this specification was added.

1. Components are stored inside each Main Line's tier-specific `advanced.inHouseComponents` payload. They reference a Main Basket/Sub-Basket and have independent Labour and Material settings. They are not a single shared price record owned by a Sub-Basket. See `shared/knowledge/knowledgeInHouseComponents.ts` and `backend/src/domain/ai-estimator-knowledge-in-house-components.ts`.
2. Each estimate line already explicitly selects component IDs. Missing selection never means all components. `frontend/src/features/leads/EstimateInHouseComponents.tsx` provides this selection.
3. The estimate catalogue exposes only the sum of Labour and Material base unit rates for each component. `backend/src/services/estimator-catalogue.service.ts` deliberately keeps margin/source-cost settings out of that catalogue.
4. `backend/src/domain/estimate-mode-pricing.ts` validates configuration rates against selected component base rates. `backend/src/routes/estimates.ts` then calculates amount as unit rate times quantity. `estimate-tiers.service.ts` and the web `configuredEstimate.ts` use the same base-rate approach. Component quantity impacts and selling margins therefore do not contribute to these configured estimate amounts.
5. `ConfiguredEstimateBuilder.tsx` sums Sub-Basket totals by each Main Line's catalogue parent, rather than by the selected components' target Sub-Baskets.
6. Procurement's `backend/src/domain/project-purchase-order-mode.ts` already evaluates each selected component's Labour and Material independently and records component IDs, target IDs, adjusted cost and selling amounts. `procurement-basket-projection.ts`, `procurement-basket-mode-groups.ts`, and `ProcurementBasketScopePanel.tsx` still aggregate/display source lines without a component Sub-Basket subtotal breakdown.
7. `project-assistant-pricing.ts` already uses the full component selling calculation. Reuse that arithmetic, not a separate approximation.
8. Publication validates current Configuration and freezes customer amounts. Native component-priced lines are currently read-only in `mobile/src/features/estimate-authoring/configuredEstimate.ts`.

This request supersedes the base-rate-only estimate policy in `2026-10-25-in-house-components-design.md` for new or explicitly refreshed, configuration-priced component lines. Its explicit component selection and historical preservation rules continue to apply.

## Scope and assumptions

In scope: editable configured estimates, tier/dimension/quantity repricing, estimate subtotal/GST/total reconciliation, internal and customer-safe saved amount presentation, Procurement component cost breakdowns, current Configuration refresh, and native compatibility for the new amount basis.

The component target determines monetary attribution. Catalogue ownership and estimate source-line IDs remain unchanged. A component targeting a different Sub-Basket or Main Basket contributes to that target in the amount breakdown; its source Main Line remains identifiable.

Existing explicit component selection remains required. Selecting In-house does not automatically include every configured component, change sibling Main Lines' modes, or include excluded lines. Component inclusion/exclusion text remains scope information, not another monetary multiplier.

Manual estimate prices remain explicit overrides. Preserve their exact existing unit-rate calculation, label them as manual, and retain their amount against the source Main Line's parent in the estimate breakdown. Do not invent a component allocation for a manual selling price. Procurement may still calculate the selected components' current internal costs independently. This assumption preserves existing manual-price authority and makes its exception visible.

Non-goals: changing PMC/Sub-Vendor formulas, creating a shared Sub-Basket price store, new component selection UI, automatic draft creation/activation, restructuring vendor contracts or BOQ source ownership, rewriting issued documents, changing permissions, or redesigning unrelated screens.

## Calculation requirements

For each included, configuration-priced In-house Main Line with component configuration:

1. Resolve the current saved draft revision, otherwise saved active revision, by stable Main Line ID. Resolve only the selected applicable tier and explicitly selected component IDs.
2. Use that estimate line's validated quantity and Main Line UOM precision. Dimension-derived quantities retain the established dimension rules. Different lines' quantities are never merged before applying a threshold.
3. Evaluate each component's Labour and Material separately through the existing canonical In-house calculation. Apply each scope's own base rate, low-quantity limit, impact, minimum gross margin and starting gross margin. Preserve the existing inclusive In-house threshold boundary and independently rounded integer-paise results.
4. Estimates use starting gross margin with no newly introduced discount. Preserve Procurement's existing explicit markup-basis/discount choices and minimum-margin enforcement.
5. Component estimate amount is Labour selling amount plus Material selling amount. Main Line amount is the sum of selected component selling amounts. Procurement current cost is the corresponding sum of adjusted costs before selling margin; a cost subtotal must never display selling revenue under a cost label.
6. A Sub-Basket subtotal is the sum of matching component contributions, identified by `(basketId, subBasketId)`, across included source lines. Maintain source-line, room, tier and component identity on every contribution. Identical names or reused component IDs in different Main Lines must not merge source identities.
7. Parent/room/project totals include each monetary contribution once. Displaying a Main Line subtotal and its component breakdown must not add both to the grand total. Add unaffected modes and explicit manual contributions once under their existing attribution. GST is applied once using the existing estimate policy.
8. Exact independently rounded component amounts are authoritative. Do not derive a rounded two-decimal effective unit rate and multiply it back into the total. Any effective unit-rate display is informational and clearly distinguished from the exact amount.

Example, with all quantities above their configured impact thresholds: Line A has quantity 2, Labour base ₹100 at 20% starting gross margin and Material base ₹200 at 25%. Its selling contribution is ₹250 + ₹533.33 = ₹783.33. Line B has quantity 3, Labour ₹50 and Material ₹100 at 0% margin, contributing ₹450. If both components target the same Sub-Basket, its estimate amount is ₹1,233.33 and its current Procurement cost at those quantities is ₹1,050. Neither contribution is removed merely because they share a Sub-Basket.

## Data and API behavior

- Introduce a versioned component-calculated pricing basis for configuration-priced estimate lines, alongside the existing unit-rate basis. Carry exact component selling amounts, target identities, quantity/UOM, source revision/version, selected tier/IDs and a calculation version or fingerprint. Derive and validate this evidence on the backend; never accept client-authored component totals as authoritative.
- Provide a quantity-aware, read-only pricing preview through estimate-authorized APIs. Return the selling breakdown needed for the estimate UI. Do not expose raw margin rules, internal costs, or privileged Configuration payloads through catalogue/customer endpoints.
- Use one canonical calculation result for save, tier changes, dimension changes, publication readiness and preview. A stale preview or changed Configuration must require refresh/review through existing conflict behavior, not silently overwrite a user decision.
- Persist sufficient immutable selling breakdown evidence for newly saved/published component-priced lines. Published/client/PDF presentation uses stored amounts, not a current Configuration lookup. Internal calculation evidence is excluded from customer DTOs and artifacts.
- Add backend-produced Sub-Basket component breakdowns to Procurement read models using its existing per-scope calculation evidence. Resolve display names by matching target IDs. Keep approved source amount, current component cost, current selling benchmark and committed vendor amount distinct.
- Keep canonical source-line ownership for BOQ, tender, award, audit and commitments. Component summaries do not create duplicate commercial source lines or split historical vendor commitments without evidence. Existing source digests must continue to detect cost/configuration changes.
- Refresh affected estimate/catalogue/tier previews and Procurement queries after relevant saves. Key previews by full pricing inputs and source version; discard out-of-order responses after quantity, tier, mode or component changes.
- Preserve existing backend route-operation permissions. Synchronize request validation, models, API types and OpenAPI where contracts change. Keep memory and Mongo behavior aligned where both exist.

## UX and failure states

In the estimate workspace, show the exact calculated Main Line amount and an expandable component breakdown with target Main Basket/Sub-Basket, quantity, Labour/Material selling contributions and total. Sub-Basket amount summaries reflect component attribution and explain source Main Lines when costs originate elsewhere. Keep catalogue selection/navigation tied to the actual catalogue hierarchy.

In Procurement, show component target Sub-Basket subtotals and Labour/Material costs beneath the relevant source scope, with a visible path to the contributing Main Lines. Use labels such as “Current component cost” and “Approved estimate” to distinguish current inputs from immutable revenue. Any separate cross-basket summary is a read-only projection; it must not become a new commercial basket identity.

Missing/empty selection, missing or archived references, unavailable tier, invalid settings, incompatible UOM, overflow and unavailable current revision yield an explicit incomplete/unavailable result. Never use zero, a partial sum labelled complete, another component, another tier or an older revision as a fallback. A valid configured zero cost remains distinct from missing cost.

While a preview is loading, stale, failed or awaiting refresh, identify that state and prevent saving/publishing the stale calculated amount. Preserve user inputs for retry. Excluded lines contribute zero and do not make included totals incomplete. Controls retain keyboard operation, accessible labels, focus behavior and readable mobile layout.

## Compatibility, history and operations

- Published/approved estimate amounts, review records, issued PDFs, vendor contracts and recorded finance remain unchanged. New calculations enter an editable estimate only through the normal review/save flow and any required subsequent approval.
- Existing drafts using base-rate component pricing require explicit review when refreshed to the new calculation basis. Old clients must not silently downgrade or overwrite a component-calculated line through a unit-rate-only payload.
- Historical approved lines without a stored component selling allocation retain their approved source attribution. Show that historical component allocation is unavailable; do not distribute their approved amount using today's rates.
- Procurement current configuration costs may update independently of the approved customer amount, as they do now. Keep current-draft precedence, activation requirements for dispatch, freshness checks, CAS/version validation and idempotency intact.
- Payloads without component configuration retain legacy In-house behavior. An explicitly empty component list remains empty and never falls back. The preserved legacy component with a null Sub-Basket retains its established identity and an explicit legacy grouping.
- Native component-priced lines remain read-only, but must display and round-trip the exact stored amount/basis safely; do not recompute them with the legacy unit-rate helper.
- No seed, migration/backfill, deployment, production mutation, commit or push is part of this specification. Prefer additive optional fields. Any later rollback must preserve stored component-calculated evidence and reject unsupported writes rather than reinterpret the records.

## Acceptance criteria and verification

1. **Full configuration arithmetic:** saved component settings, including different Labour/Material thresholds, impacts and margins, determine estimate selling amounts and Procurement costs. Unit tests cover below/at/above threshold, fractional quantities, paise rounding, zero, overflow and minimum-margin enforcement.
2. **Multiple source contributions:** two Main Lines with unequal quantities/configurations targeting one Sub-Basket both contribute. Tests use two unequal projects, multiple rooms and reused component IDs to prove isolation and no deduplication by Sub-Basket alone.
3. **Target attribution and reconciliation:** components targeting different Sub-Baskets/Main Baskets appear under their own IDs. Component sums reconcile exactly to line/room/project totals; mixed PMC/Sub-Vendor/manual/excluded lines are counted once. Duplicate labels do not affect joins.
4. **Selection and invalid states:** explicit subsets price only selected components. Empty, duplicate, missing, archived or unconfigured selections block completeness without partial fallback. A tier switch cannot borrow another tier's component IDs/settings.
5. **Refresh and concurrency:** current draft beats active; updates to rates, thresholds, margins, names and UOM are handled coherently. Stale preview/save/publication, out-of-order responses and concurrent Configuration changes cannot commit the wrong amount.
6. **History and authority:** approved/published/issued values remain byte-for-byte or semantically immutable as appropriate. New customer artifacts use the saved selling breakdown and expose no internal pricing settings. Unauthorized calls remain rejected. Older/native clients cannot erase the new calculation basis.
7. **Procurement integrity:** current adjusted costs reconcile to component subtotals while approved and committed amounts retain their source identities. BOQ freshness, dispatch activation, project-only rate boundaries and existing mode decisions still hold.
8. **Rendered behavior:** test In-house selection, quantity/tier/component changes, breakdown expansion, manual-price labelling, incomplete/error/retry and refresh at mobile and desktop widths; verify keyboard/accessibility behavior and console/API errors.

Verification will extend the existing estimate-mode/component calculator tests; catalogue/estimate, tier, publication and Procurement replica-set tests; web configured-estimate/builder/workspace tests; and native compatibility coverage. Run backend/frontend typechecks, applicable tests and builds, then repository diff hygiene. No lint script currently exists, so no lint success will be claimed.

## Risks and remaining decisions

The main risks are changing editable estimate selling amounts from base cost to full configured selling price, exact-total versus unit-rate rounding, accidental disclosure of Configuration costs, and double counting when catalogue ownership differs from component attribution. The requirements above explicitly bound those risks.

No blocking product decision remains after the user's two clarifications. Component selection, manual-price exceptions, component-target attribution and historical compatibility are stated assumptions for specification review. Endpoint/field names and ownership boundaries will be settled in the separate task plan after approval; no implementation is authorized at this stage.

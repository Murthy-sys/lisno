# In-house Estimator / Execution radios and component visibility

Date: 2026-11-11
Status: Approved. Task plan approved and Mode A selected; implementation and verification are recorded in the linked task plan.
Classification: Substantial, with financial-lineage and information-access risk.

## Goal and confirmed decisions

In Configuration → Main Lines → Mode → Execution, add a mutually exclusive **Estimator / Execution** radio choice when **In-house** is selected. Use that saved choice to control the visibility of In-house component details without changing the existing calculation formulas or granting new Procurement access.

The user confirmed:

- **Execution:** components are visible to existing Procurement/Execution users with the required project permissions. Estimator accounts do not gain Procurement access.
- **Estimator:** show one combined price including margin, not separate base-cost and margin values.
- The components contributing to that price are a **subset selected by Super Admin in Configuration**. Do not automatically include all configured components or ask the estimator to choose the hidden components.

Recommended interpretation: both explicit radio choices use the configured subset and show aggregate pricing in estimation. **Execution** additionally exposes the relevant component breakdown to authorized Procurement users; **Estimator** keeps that Procurement breakdown hidden. The choice changes detail visibility, not whether an otherwise eligible Main Line can be included in an estimate. This interpretation is explicit for specification approval.

## Current behavior and evidence

1. `KnowledgeModeConfigurationBuilder.tsx` renders PMC/Execution visibility controls and independently selectable Sub-Vendor/In-house sources. Those existing checkboxes are local visibility state, not persisted access policy. The requested radios are additional persisted controls; they do not replace either existing selector.
2. Each Configuration scope has its own advanced payload. `shared/knowledge/knowledgeModeTiers.ts` distinguishes the main/default editor from Signature, Premium and Functional. Estimation currently consumes the applicable commercial tiers, without silently inheriting the default editor's settings.
3. `shared/knowledge/knowledgeInHouseComponents.ts` stores component IDs, basket IDs, scope text and Labour/Material settings. It validates a maximum of 50 components. There is currently no saved usage choice or Super Admin pricing subset.
4. `backend/src/domain/ai-estimator-knowledge-validation.ts:403` explicitly allowlists advanced fields. New policy fields require backend validation and tier-aware preservation; a UI-only field would not establish the requested behavior.
5. `estimator-catalogue.service.ts:24` exposes component identity, target names and base rates. Its projection at approximately line 600 supplies these to the estimate catalogue. `ConfiguredEstimateBuilder.tsx:634` renders the component selector, while `EstimateComponentBreakdown.tsx` displays component Labour/Material selling amounts and Sub-Basket contribution summaries.
6. The existing component-priced estimate path requires explicit `selectedInHouseComponentIds`. `configuredEstimate.ts` initializes new selections to an empty array. `estimate-component-pricing.service.ts` resolves selected components, calculates exact quantity-aware selling amounts and records source versions and a fingerprint. A hidden selector cannot simply be removed without providing a server-authoritative selection source.
7. `shared/estimation/estimateComponentPricing.ts` requires full component evidence for its existing calculation contract. Deleting arrays from this object would invalidate it. Internal calculation evidence must remain intact; restricted responses need a separate aggregate shape.
8. `procurement-in-house-components.ts` derives breakdowns from approved source lines and their selected component IDs. `procurement-basket-projection.ts` and `procurement-basket-mode-groups.ts` expose these at detail/group levels; `ProcurementComponentBreakdown.tsx` renders them. Nested mode previews also carry component evidence, so hiding just one panel is insufficient.
9. `backend/src/domain/authorization.ts:265` gives `estimator_sales` estimation access but no Procurement workspace/purchase-order permission. `route-operations.ts:298–299` protects basket reads with `procurement.purchase_orders.read`. Preserve this separation.
10. Staff estimate, quotation/tier, preview and native consumers share pricing contracts. Native component-priced lines are already restricted in editing. Compatibility checks must cover these consumers, rather than treating the web component selector as the only affected path.

These facts come from current code. Earlier component-pricing specs describe background intent; their old implementation status and test counts are not evidence for this change.

### Existing work to preserve

The worktree contains the completed Sub-Vendor basket-name/check-button change: eight modified frontend files and its two untracked documents. In particular, the builder, Mode panel, builder/workspace tests and scoped CSS are already dirty. Preserve those changes, including the basket names in the Sub-Vendor header. Capture per-target diffs again before any future implementation writers start. This stage creates only this new specification.

## Configuration behavior

### Radios

- Show one native radio group labelled **In-house use**, with choices **Estimator** and **Execution**, alongside the existing source choices as marked in the user's screenshot. Wrap or stack it below those choices on narrow screens.
- Display it only while Execution and In-house are selected in the current editor. If Sub-Vendor and In-house are both selected, the setting governs only In-house.
- Selecting one radio clears the other. Use normal radio keyboard behavior, visible focus and accurate accessible checked state. The existing Sub-Vendor/In-house checkboxes remain independent.
- Changing a radio edits the current Mode draft, appears in pending-change review and persists only through the existing save flow. Hiding or collapsing In-house preserves the unsaved choice, subset and component settings.
- Only the existing authorized Super Admin Configuration path may change this policy/subset. Preserve read-only, save-in-flight, conflict and immutable-revision restrictions.
- Show short help text: **Estimator: show the combined price only. Execution: also show components in Procurement.**

### Component subset

- Within the existing In-house component editor, add an **Include in price** checkbox for each component. Super Admin uses these to define the preset; unchecked components remain stored and editable in Configuration.
- Show the number selected and an explicit incomplete state when none are selected. Do not select all implicitly when adding a component or choosing a radio.
- Select by stable component ID from this Main Line and exact mode scope. Labels and target Sub-Basket names never become join keys.
- Adding/copying a component must not silently include it in the preset. Copying settings does not change source or target membership. Removing a selected component must identify that it contributes to the preset and remove its ID only as part of the confirmed component removal/save; it must never leave a stale reference or substitute another component.
- Drafts may retain an empty preset while Configuration is being prepared. Such an explicitly configured In-house price is **not configured/incomplete** downstream. A valid price requires a nonempty, valid preset and complete supported settings for every selected component. Unselected incomplete components do not contribute a partial or zero amount to the price; existing general draft-validation rules still apply.
- Legacy Labour/Material settings use the existing preserved legacy component representation when opting into a preset. Do not invent a second identity, copy another line's costs or change the existing preserved-configuration workflow.

## Saved contract and scope

Proposed fields in each applicable `advanced` mode payload:

```ts
inHouseUsage?: "estimator" | "execution";
inHousePresetComponentIds?: string[];
```

- Keep these outside individual component objects, consistent with the existing selected-component-ID contract. Validate enum values, array bounds, uniqueness and references against the same saved payload. Both fields belong to one versioned Configuration save. A present subset without a usage choice is invalid; an explicit usage requires a subset array, which may be empty only as incomplete draft configuration.
- Scope the fields independently to the main Mode editor and each tier through existing projection/save helpers. Do not copy settings between Main Lines, revisions or tiers. The default editor does not override Signature/Premium/Functional consumers; they continue using their exact selected scope.
- Use the latest saved draft revision when present, otherwise the saved active revision, joined by stable Main Line ID. A locally unsaved radio/subset does not change any other screen.
- These are optional additive fields for legacy compatibility. No index or live backfill is required. Persist policy/subset changes through existing CAS/version and audit mechanisms and include them in the relevant change/digest calculations.

## Visibility and authority

The following matrix applies once an explicit usage choice has been saved. Existing project, role and operation checks remain prerequisites.

| Actor/surface | Estimator choice | Execution choice |
| --- | --- | --- |
| Authorized Configuration reader | Existing full Configuration visibility | Existing full Configuration visibility |
| Super Admin Configuration editor | Edit usage, preset and all component settings | Edit usage, preset and all component settings |
| Estimator estimate screens/APIs | Combined selling price and exact line total; no component details or selection | Same aggregate estimate presentation; no Procurement permission added |
| Authorized Procurement/Execution user | Existing operational source-line totals/actions, with In-house component breakdown omitted | Relevant selected-component breakdown through existing Procurement access |
| User without required project/operation access | Existing denial | Existing denial |

“No component details” includes component names/IDs, target breakdowns, raw cost, individual Labour/Material amounts, component margin rules and component selection controls. Main Line identity, its own basket context, quantity/UOM, necessary specification/design obligations and aggregate totals remain available for ordinary estimating. The policy does not erase essential line information or affect PMC/Sub-Vendor pricing.

Enforce this at server response boundaries, not only in JSX/CSS. Cover estimator-accessible catalogue, estimate detail/list, pricing preview, quotation/tier views and any export path that could disclose restricted information. Existing shared services may retain full private calculation data internally; do not use a redacted object as a calculation input. Scope caches by actor and policy/source versions, and remove stale detailed client data when a refreshed policy no longer allows it.

Preserve existing client/designer access rules. All callers, including customer-facing selection flows, must respect the authoritative preset for explicitly governed lines and cannot override it through another endpoint. Do not introduce new disclosure to customers or alter already issued artifacts.

## Pricing and selection semantics

1. For a newly included configuration-priced In-house line with an explicit usage choice, the backend resolves the saved preset from that line's current revision and selected tier. The estimator supplies permitted inputs such as quantity/dimensions, not an alternative component set.
2. Preserve the existing exact, quantity-aware component calculation, Labour/Material thresholds and impacts, configured selling margins and paise rounding. Calculate selected components independently and sum their selling amounts once. The radio value itself never changes arithmetic.
3. Display a single **Price including margin** for the line's rate/price context, alongside the existing exact amount and required quantity/UOM. Do not display a raw base cost in a field labelled selling price. Where component pricing is quantity-dependent, an effective per-unit rate is derived from the authoritative total for display only; never multiply a rounded display rate back to calculate the line total.
4. Keep GST, room/project totals and approved-estimate reconciliation unchanged. The combined price does not disclose a separate margin percentage or amount.
5. Retain full selected IDs, calculation evidence, source versions and fingerprints internally for save validation, approval and Procurement. Introduce an aggregate response contract for restricted consumers; do not make the existing full component evidence validator accept a truncated object.
6. Preview, save, tier/dimension/quantity changes, publication readiness and Procurement must resolve the same authoritative selection. Reject forged component overrides, stale versions and client-authored totals. A compatible old client may echo an exactly matching saved preset, but must not replace it with a different subset or downgrade the pricing basis.
7. Missing selection, invalid/dangling references, unavailable tier, deleted targets, incomplete selected settings, incompatible UOM or overflow produce an explicit unavailable result. Never substitute all components, zero, a partial total, another tier or an old revision.

## Editable estimates, Procurement and history

- Existing editable estimates retain their stored selection and amounts until the normal refresh/review/save flow resolves a changed policy or preset. If the current preset differs from saved pricing evidence, show **Configuration changed. Refresh price.** and prevent stale saving/publication. A new aggregate preview may be shown, but must not silently overwrite stored financial evidence.
- A refreshed explicitly governed line adopts the current preset only through the normal explicit estimate save and existing version checks. This is the bounded replacement for estimator-owned component selection on opted-in lines.
- Approved/published estimates, approvals, stored selected IDs, issued PDFs, vendor commitments and finance remain immutable. Do not rewrite them to match a later preset.
- Procurement continues to use approved source-line identities and approved selected component IDs, with current saved costs under the existing rules. A later Configuration preset change does not replace the components of an already approved commercial source.
- For Procurement visibility, use the exact source line's current saved usage policy. Execution allows the existing breakdown for that source's approved selection; Estimator suppresses it in nested line previews, basket details and mode/group summaries. Do not leave a backdoor through alternative preview endpoints.
- Mixed-policy baskets/projects retain correct full aggregate totals. Detailed contribution summaries include only sources whose policy allows components; label them as a visible-component subtotal when they do not represent the whole basket. Do not infer hidden component identities, invent attribution or double-count these summaries as additional amounts.
- Preserve BOQ freshness, source digests, activation gates for new vendor dispatch, existing mode decisions, project-only rate boundaries, idempotency and commercial ownership. Hidden component detail must not silently disable unrelated authorized Procurement operations.

## Legacy behavior, failures and compatibility

- Existing records with neither new field retain their established behavior until Super Admin explicitly opts that scope into Estimator or Execution. Do not select a radio, mark a form dirty or write defaults on read. Show **Choose how this In-house configuration is used** for an unset legacy choice. This avoids retroactive pricing/selection changes without a defined preset.
- An invalid explicit policy must fail closed for component disclosure and surface a Configuration issue. Do not treat malformed explicit fields as legacy or silently fall back to detailed access.
- Switching radios preserves the selected subset. Turning the In-house visibility checkbox off preserves saved/unsaved policy and data. Selecting Estimator does not delete component definitions.
- Saving failures retain local choice/subset for retry; downstream screens continue to use the last successfully saved version. Stale/conflicting saves use existing conflict handling. Preview requests include policy/source version in their effective cache key and discard late responses after relevant changes.
- Backend enforcement must work for both web and native clients. Update native response parsing/display/round-trip compatibility where aggregate payloads require it; native users must not regain component disclosure through old response assumptions. A new native Configuration redesign is not in scope, but native Configuration saves must preserve these fields.
- Introduce compatible aggregate contract support before relying on it in the UI. Unsupported clients must receive a clear unsupported/stale-write response rather than silently removing preset/evidence data.
- No production migration, backfill, seed, deployment, external message, commit or push is included. Rollback must preserve saved policy/preset fields and avoid reverting to a server that ignores their disclosure restrictions; any operational rollback requires a compatible release strategy.

## Scope, constraints and risks

In scope: web Configuration radios/preset selection, shared/backend validation and projection, estimator aggregate pricing presentation, Procurement detail gating, related cache/preview/save checks, and compatibility changes required by the affected API contracts.

Out of scope: new Procurement access for estimators, new pricing formulas, automatic component inclusion, changing PMC/Sub-Vendor controls, unrelated Configuration redesign, changing approved financial history or fixing unrelated baseline test failures from the prior basket-name task.

Principal risks are component leakage through alternate responses, using redacted data in the calculator, implicit replacement of an existing subset, tier/line mix-ups, and aggregate totals changing because visible details were filtered. The server must calculate and preserve authoritative data before applying recipient-specific presentation.

## Acceptance criteria and verification

- **AC1: Configuration control.** In-house reveals one native Estimator/Execution radio group; selecting one excludes the other. PMC/Sub-Vendor and independent source checkboxes retain their behavior. Dirty/save/discard, failure, read-only, collapse, keyboard and responsive states work.
- **AC2: Authoritative subset.** Super Admin can select a proper subset from at least three unequal components. Only those IDs contribute to new governed lines. Empty, duplicate, wrong-line/tier, stale and deleted references cannot create a valid price. Add/copy/remove behavior cannot silently change inclusion.
- **AC3: Estimator non-disclosure.** All estimator-accessible read/preview paths expose only the permitted aggregate pricing for explicitly governed lines, including after policy refresh. Test direct HTTP and nested/alternative payloads, not just hidden UI controls. Unauthorized component overrides are rejected and estimator Procurement routes remain denied.
- **AC4: Execution detail.** Existing authorized Procurement users see the correct approved selected components only when the source allows Execution detail. Estimator-policy sources expose no nested component data. Mixed-policy basket/group totals reconcile without leaking hidden contributions or duplicate counting.
- **AC5: Financial correctness.** Reuse canonical calculations and exact paise totals with at least two unequal projects, different quantities, Labour/Material margins, threshold/impact cases, and components targeting different baskets. Radio-only changes preserve totals; subset changes affect only explicitly refreshed/saved editable lines. Effective displayed rates do not become authoritative totals.
- **AC6: Scope/history.** Default, Signature, Premium and Functional settings stay isolated across two Main Lines; current saved draft precedence remains intact. Approved amounts, selected IDs and issued artifacts remain unchanged. Procurement does not adopt a new preset for an old approved source.
- **AC7: Concurrency/compatibility.** Configuration changes during preview/save, out-of-order responses, legacy unset records, malformed policies, failed saves and old/native clients cannot leak components, erase presets or commit stale prices. Native aggregate display and unchanged full-detail contracts remain valid.
- **AC8: Integrated evidence.** Run focused shared/domain tests, replica-set integration tests for changed Mongo/CAS/transaction paths, authorization/API tests, frontend rendered interaction/accessibility tests and responsive browser checks at desktop/mobile widths. Run affected backend/frontend typechecks and builds plus native compatibility tests where its contract changes. Broaden according to the final task plan and failures; distinguish known baseline failures. Run `git diff --check` and inspect final status. No lint success is claimed without an actual lint script/command.

Relevant existing lanes include `ai-estimator-knowledge-in-house-components`, `estimator-catalogue-estimate`, `estimate-component-pricing-contract`, `estimate-mode-pricing`, `procurement-in-house-components`, configured-estimate/builder/workspace, Procurement component-breakdown and native staff-estimate tests. Use asymmetric actors/projects and direct forbidden requests to prove access boundaries.

## Assumptions and open decisions

- Both explicit choices keep aggregate estimator pricing available; Execution additionally permits existing authorized Procurement detail. The configured subset applies to both choices. The radio does not grant a role or select a different pricing formula.
- Optional legacy fields remain unset until an explicit Super Admin save; this request includes no blanket migration of existing Configuration.
- The setting is scoped like the existing In-house payload, not a global preference. Standard and temporary Main Lines follow existing eligibility and role rules.
- The user's three material choices are resolved. The interpretation and compatibility defaults above are presented for specification approval. Detailed endpoint/DTO field names, file ownership and dependency ordering belong in the separate task plan after approval. The previous task's Mode A choice does not bypass this new request's approval gates.

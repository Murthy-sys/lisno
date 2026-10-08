# Project initiation source and estimation pricing modes

Date: 2026-10-07

Status: Approved and implemented in Mode A. Focused verification complete; see the [task plan and evidence](../plans/2026-10-07-project-source-estimate-modes.md).
Scope: Web project initiation and configured estimate item selection.

## Selected-only compact Main Line controls

Latest user correction supersedes the earlier pre-inclusion control display: show Item type, Pricing mode and its base-price reference only while the individual item checkbox is selected. Hide the entire control/reference area when unchecked, including saved excluded and read-only excluded items. Keep quantity, editable price and the not-included amount preview available as before. Selected Standard items retain Sub-Vendor pricing; selected Special items expose all three modes. Hiding controls must preserve classification, pricing mode, rate source, manual price and quantity through deselection/reselection and save/reload.

Make the row compact: align thumbnail/name and quantity/price/amount in one primary desktop row, with selected-only controls in a compact secondary strip that wraps naturally. Remove empty grid tracks and the old three-row field span. Adapt narrow layouts without overflow or cramped radio targets; retain validation/warning feedback and read-only behavior. No backend, domain, calculation, catalogue, persistence or approval changes. Verify unchecked/selected/Standard/Special/read-only visibility, choice restoration, independent room/line state, recommendation-driven selection, save/reload, and rendered row heights at desktop/tablet/mobile widths.

The latest visual reference uses a restrained bordered item row, compact outlined radio choices with a selected green state, and Quantity/Price/Amount grouped together. Follow that hierarchy with smaller spacing and bounded field widths. Retain existing item assets and source text; do not fabricate line descriptions or pricing. The explicit selected-only instruction remains authoritative despite the reference's visible controls next to unchecked checkboxes. Standard continues to use Sub-Vendor; three editable modes appear for Special.

## Basket card reference follow-up

Latest display corrections: remove both the description/definition paragraph and the Sub Basket/Main Line/Temporary Item count badges from every basket selection card, including POP / Gypsum. Cards show the icon, name, Add/Added action and details chevron only. Remove obsolete accessible-description references as well; buttons retain their basket-specific accessible names and pressed state. Keep stored Configuration descriptions, catalogue contract and detail disclosure content intact. The compact four-column responsive layout and all selection/detail/pricing behavior remain unchanged. This supersedes the earlier instructions to display saved descriptions and summary counts below.

Replace the simple Main Basket checkbox rows with the supplied screenshot's selection cards. Each card has a pale green cube tile, basket name, compact Sub Basket/Main Line/Temporary Item counts, the basket's saved Configuration description when present, a wide Add/Added toggle, and a separate details-arrow button. Selected cards use a green outline, subtle green surface, top-right selected indicator, and tinted Added action. The screenshot's card grid, radius, selected check, and restrained depth are intentional reference-specific exceptions to the earlier generic styling preferences. Use existing typography/tokens and inline SVG; no new icon/dependency library.

The user's latest density correction supersedes the original three-column sizing: use four columns on wide chooser containers, three/two at intermediate widths, and one on narrow screens. Remove the fixed 240px minimum card height and reduce padding, gaps, icon size, and title size. Keep cards content-driven, with no reserved description space when absent. Keep long names/descriptions readable without clipping or horizontal overflow. Add/Added remains a reversible native button with `aria-pressed` and a basket-specific accessible name containing the visible Add/Added action; its visible label indicates selection. The separate chevron expands the existing Sub Basket detail content without toggling selection. Disabled/error/read-only states, loading and empty catalogue feedback, selection persistence, recommendations, and downstream Main Line pricing keep their current behavior. No basket type controls return.

Descriptions already exist on Configuration baskets but are absent from the estimator catalogue projection. Expose `description: string | null` in that existing read response; frontend accepts omission from older servers. Render saved content only, without inferred descriptions or name-based joins. Missing descriptions omit that paragraph while retaining the card composition. No data migration, write API change, pricing calculation change, or authorization change.

Acceptance: compare the compact grid against the reference and latest density correction with at least six baskets, one selected, unequal counts, a long name, described and undescribed baskets; verify Add/remove, keyboard activation and visible focus, independent disclosure, read-only/error states, responsive four/three/two/one-column layouts, no fixed minimum-height whitespace, no overflow, and unchanged per-line mode controls. Verify catalogue description/null serialization, aligned API documentation, affected regression tests, typechecks/builds, and visual QA.

## Main Basket type removal

The user's next screenshot follow-up removes Standard/Special from Main Basket rows entirely, including the read-only type label. Main Basket rows retain selection, name, counts, and detail expansion. Standard/Special and pricing modes remain on individual Main Lines. This is a presentation correction: preserve existing saved basket metadata for compatibility and preserve saved line choices, prices, and publication history. No API, migration, or default-price change is part of this removal. Verify the chooser has no type controls or labels while item selection and per-line controls still work.

## Follow-up correction from screenshots

The user's follow-up identifies the missing pre-inclusion Main Line interaction. The first implementation rendered type and mode controls only after a line was included; unchecked POP false ceiling and Cove rows therefore had no mode controls. Continue the approved per-line workflow: show Standard/Special and the selected base on every available editable row, and show PMC, Sub-Vendor, and In-house whenever that row's effective type is Special, before or after its checkbox is selected. Mode selection must not include the row or add it to totals.

Untouched rows preview their Main Basket's classification. An explicit per-line type or mode choice becomes that row's own choice and survives inclusion and deselection/reselection. Once included and saved, or when editing an already persisted excluded line, the choice survives save/reload. Preserve the existing rule that untouched/new unchecked previews are not saved. Later basket-default changes leave explicit line choices and manual prices alone. Keep Main Basket pricing-mode controls out of scope, as confirmed by the user's Main Line screenshot. Existing read-only, missing-source, and submission locks remain authoritative. The existing line API/persistence contract is sufficient.

Also remove the Budget paragraph from the lead-detail Estimate contact panel shown by the user, including empty-budget placeholders. Retain its contact information, next action, and estimate continuation behavior; do not remove underlying lead budget data or other budget displays.

Additional acceptance: reproduce with unchecked lines, change basket type to Special, open the item rows, select each mode and verify the corresponding Main Line base without affecting totals; include and reload the line to verify its choice persists. Verify the Estimate contact panel omits Budget for both populated and absent budget values.

## Goal and recommendation

Capture how a client heard about Lisno during project initiation. Let Standard estimate items use Sub-Vendor pricing, and let Special items expose PMC, Sub-Vendor, and In-house radio choices with the corresponding Main Line base price.

Reuse the existing Lead `source` field and the current Main Line catalogue projection. Persist the selected pricing mode on each configured estimate line, independently of its Standard/Special classification and Main Basket classification. Read mode base prices from the latest saved Configuration revision using stable Main Line IDs.

The approved price interaction fills the editable Price field from the chosen mode and shows the configured base price alongside it. An explicit price edit remains an estimator override. The user's specification approval confirmed this recommended behavior.

## Current behavior and evidence

- Initial `git status --short` was empty. No product files were modified during discovery.
- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` supplies the shared initiation sidepanel for Sales and Sales Manager assignment flows. It has no Source field and submits through `adminProjectsApi.ts`.
- `backend/src/routes/admin-projects.ts` uses a strict initiation schema with no `source` input. `backend/src/services/admin-project.service.ts` creates the project and its linked lead transactionally and hardcodes the lead source to `admin_project`.
- Lead source already exists as free text in `backend/src/models/Lead.ts`, the repository mappings, `frontend/src/api/types.ts`, and the separate lead-creation form. Access grants use the separate `admin_initiator` provenance value. The inspected production source has no authorization decision keyed to lead source.
- `ConfiguredEstimateBuilder.tsx` renders Standard/Special on included item rows. `LeadEstimateWorkspace.tsx` updates classification without selecting a pricing mode. Main Basket classifications supply the initial classification of newly included items.
- `configuredEstimate.ts` currently initializes new item prices from `inHouseBaseRatePaise`, preserves manually changed prices, and preserves saved prices on hydration. Thus the requested Standard/Sub-Vendor association is a new behavior, not the current implementation.
- `backend/src/services/estimator-catalogue.service.ts` projects only the In-house base price. It sums the labor and material base prices when split settings exist, or reads the same revision's legacy combined In-house setting when split settings are absent. Missing, invalid, or unsafe values produce `null`.
- `backend/src/domain/ai-estimator-knowledge-current-revision.ts` selects the saved draft revision first, otherwise the saved active revision. Configuration has `modeCalculations.pmc`, `sub_vendor`, and split `in_house_labor` / `in_house_material` settings, with legacy combined `in_house` support.
- `backend/src/routes/estimates.ts` accepts entered rates in integer paise and calculates totals. Draft lines, strict immutable review snapshots, publication projection, and client presentation currently preserve classification but have no selected pricing-mode field.
- Existing initiation tests explicitly expect Source to be absent; pricing tests expect In-house defaults. Those expectations must change within the approved scope.

## Scope and requirements

### 1. Source in project initiation

1. Add a text input labeled **Source** after Property type and before Next action. Helper text: **How did the client hear about Lisno?** Placeholder: **Instagram, existing customer, social media…**
2. Use free text, allowing channels and referral descriptions without maintaining a new dropdown or source catalogue.
3. Proposed default: Source is optional because the request does not make it a prerequisite for initiation. Trim outer whitespace and limit newly submitted values to 200 characters. Blank input is omitted; an explicitly supplied blank, non-string, or overlong API value is invalid.
4. Add optional `source` to the initiation input, strict request validation, frontend input type, and API documentation. Persist a supplied value in the linked Lead's existing `source` field. Omitted input retains `admin_project` for compatibility with older callers.
5. Do not duplicate marketing source on Project or overwrite existing leads. Preserve project/lead linkage, assignment rules, transactional creation, access-grant provenance, audit events, submission error recovery, and existing query invalidation.
6. Support both assignment flows, field errors, panel scrolling, mobile widths, and keyboard operation with existing Field/Input components. Keep the current property dropdown, date-only next action, and optional city behavior.

### 2. Standard and Special item modes

1. Keep the existing **Item type** controls. This change applies to configured item rows, including configuration-backed temporary items that share the same row and mode settings. Legacy catalogue rows retain their behavior.
2. New Standard items use **Sub-Vendor**. Display its mode and configured base price; Standard does not offer another execution-mode selection.
3. Choosing **Special** reveals a native radio group labeled **Pricing mode**, with exactly **PMC**, **Sub-Vendor**, and **In-house**, in that order. All three choices remain visible even when a rate is missing.
4. Switching a new Standard item to Special retains Sub-Vendor initially, with the other two modes available. A new item inheriting Special from its Main Basket also starts with Sub-Vendor. Switching back to Standard selects Sub-Vendor and applies its current base price.
5. The mode belongs to one room/Main Line selection. A change must not affect the same Main Line in another room, another item, or another estimate. Changing a Main Basket's classification continues to leave previously classified lines alone. Main Baskets do not receive pricing-mode controls.
6. Display **Base price: ₹<amount> / <UOM>** for the chosen mode, using the Main Line's current UOM and integer-paise formatting. In-house means the combined labor and material base rate, consistent with the existing catalogue behavior.
7. Under the proposed fill-and-edit behavior, explicitly choosing a different mode replaces the Price input with that mode's current base price. The Price remains editable. Keep the base price separately visible so the user can distinguish it from an entered override. Selecting an already checked radio does not reset an override.
8. Price changes update item amount, room and basket subtotals, Summary, Proposal, and save payload through the existing calculation path. Preserve current quantity rounding and GST treatment. Base price means the configured base unit rate before margin, markup, low-quantity impact, discount, and GST; this request does not introduce those additional calculations.
9. Missing or invalid selected-mode pricing displays **Base price not configured**. Clear a price being filled by an explicit mode change, retain the selected mode, and leave the draft visibly incomplete until a valid rate is supplied. Allow an explicit manual selling-rate entry under the existing workflow. Never substitute zero, another mode, another line, or an older revision. A configured zero is valid and visibly different from missing data.
10. Keep loading, refresh failure, unavailable-source, UOM-change, and version-conflict states explicit. Failed or stale catalogue reads must not trigger automatic mode changes or replace entered prices. Preserve the existing recommendation-selection and deselection behavior.

### 3. Save, reload, and current Configuration

1. Save and restore each new line's `pricingMode: "pmc" | "sub_vendor" | "in_house"` along with classification. Keep `itemType: "main_line" | "temporary"` unchanged.
2. Track whether the selling rate is configuration-derived or manually entered with optional `rateSource: "configuration" | "manual"`. This prevents a catalogue refresh from erasing an intentional override and allows a saved configuration-derived rate to follow its current mode configuration in editable drafts.
3. New defaults and explicit mode changes use `rateSource: "configuration"`. Editing Price sets it to `manual`. Current base-price references refresh regardless of rate source. Configuration-derived prices refresh in editable drafts; manual prices remain unchanged. Missing current configuration-derived prices make the draft incomplete rather than retaining a stale base.
4. The backend remains authoritative for configuration-derived pricing. Resolve the submitted mode against the selected Main Line's current revision and reject stale mode-derived price/version combinations with a refreshable conflict instead of silently saving different totals from those shown. Validate Standard with explicit mode as Sub-Vendor; Special may use any of the three modes.
5. Older estimates lacking pricing mode/rate source retain their saved selling price. Do not infer a historical pricing mode from a numeric match or relabel an old In-house price as a proven Sub-Vendor price. Until an explicit choice, show historical Special lines with no selected mode and **Choose pricing mode**. Historical Standard lines may show the current Sub-Vendor base reference, but their saved selling price remains an override. A deliberate mode/type choice adopts the new behavior.
6. Older API callers may omit new fields. Preserve existing saved mode metadata; if an older caller changes the entered price without rate-source metadata, treat that edit as manual. New legacy payloads without mode metadata retain the existing entered-rate workflow. Reject unknown modes, rate sources, and configuration-derived rates without a valid mode.
7. Preserve choices and overrides through catalogue refresh, deselection/reselection, save/reload, and recommendation-driven inclusion. UOM changes retain the existing quantity-review requirement.
8. Publication freezes the chosen mode and rate-source metadata in the immutable review snapshot together with its existing amount, classification, source identity, and source revision. Extend all strict schema/projection boundaries so submission continues to work. Old snapshots remain readable and unchanged. Read-only internal views display saved values and expose no editing controls.

## Data, API, and authorization impact

| Boundary | Proposed change |
| --- | --- |
| Project initiation request | Optional bounded free-text `source`; existing Lead persistence and read API reused |
| Estimation catalogue response | Add `modeBaseRatesPaise: { pmc: number \| null; sub_vendor: number \| null; in_house: number \| null }` per configured item |
| Existing catalogue compatibility | Retain `inHouseBaseRatePaise` as the matching In-house value for existing consumers; do not use it as a Sub-Vendor fallback |
| Draft line request/storage/response | Optional `pricingMode` and `rateSource`, validated and preserved by the authoritative backend |
| Publication and read-only consumers | Preserve optional new metadata through explicit snapshot projection, strict Mongoose/Zod shapes, domain/frontend types, and API documentation |

Mode projection reads the same saved revision as the name/UOM/version projection. Preserve split In-house precedence: when either split key is present, both valid components are required; only the same revision's existing legacy combined setting is supported when neither split key exists. Check integer safety for all mode rates and the In-house sum.

Existing backend operation permissions remain authoritative. Sales/Sales Managers retain their existing initiation capabilities; only existing estimate editors can change modes or prices. Configuration stays Super Admin-managed. No new route, permission, vendor assignment, or write to shared Configuration is introduced. Selecting Sub-Vendor is a pricing-mode choice, not selection of a specific vendor identity or a change to procurement dispatch.

Use the existing estimate version/CAS checks, transactions, lineage, safe validation errors, and query refresh behavior. Do not log entered referral text or expose additional Configuration internals. Keep customer amounts and all published/approved artifacts immutable.

## Options, assumptions, and open decision

- **Recommended: fill Price and keep it editable.** Fits the existing estimator rate input and makes the selected configuration price immediately usable. Requires preserving manual overrides and recording rate origin.
- **Alternative: base-price reference only.** Shows the selected mode's base beside Price while retaining the entered selling rate. This avoids repricing on mode changes but requires the estimator to transfer a base price manually. If chosen, remove automatic price replacement and the need for new rate-source tracking from this specification.

No material interaction choices remain open. Approval confirmed source optionality, a 200-character limit, Sub-Vendor as the initial Special selection for new items, and In-house as labor plus material. This specification supersedes the 2026-10-05 specification's metadata-only treatment of Standard/Special only for the item pricing interactions described here. Basket classification rules remain intact.

## Non-goals and operational constraints

- No new source analytics, campaign attribution system, source dropdown administration, mobile-app form redesign, or new UI dependency.
- No Configuration editor changes, new financial formula, procurement mode routing, vendor selection, approval policy change, or client PDF layout change.
- No rewriting old lead sources, backfill, seed, live migration, deployment, commit, push, or customer communication.
- Additive optional metadata requires no data migration. Coordinate backend contract support before frontend rollout; older snapshots and requests stay supported. Reverting the UI must not delete newly stored metadata.
- Produce only this specification at the current gate. A separate task plan follows specification approval; implementation follows the remaining repository gates.

## Risks and controls

- **Incorrect default pricing:** current code defaults to In-house. Verify the new Sub-Vendor default using deliberately different prices for all three modes.
- **Mode/value mismatch:** preserve stable line/room IDs and source versions; validate configuration-derived values on the backend and prevent stale responses from overwriting newer selections.
- **Historical repricing:** treat absent pricing metadata conservatively and test that opening/saving old estimates preserves their amounts.
- **Lost override or stale base:** distinguish manually entered prices from configuration-derived ones; test current draft precedence, refreshes, missing values, and UOM changes.
- **Publication regression:** extend strict snapshot projections and parsers together; verify transactional submission, existing empty-location support, and recommendation-origin handling.
- **Source/provenance confusion:** store the referral in Lead source while leaving access-grant provenance and authorization untouched.

## Acceptance criteria and verification expectations

1. **Source capture:** both initiation assignment flows show Source and save trimmed values such as Instagram and Existing customer to the linked Lead. Blank UI input succeeds using the compatibility default; invalid supplied values produce a field error. Old callers, transaction rollback, existing role restrictions, and source readback remain covered by memory/API and Mongo replica-set tests.
2. **Mode interaction:** a new Standard item uses Sub-Vendor; Special reveals all three accessible radio choices. Selecting PMC, Sub-Vendor, and In-house displays the correct distinct per-UOM base. Returning to Standard applies Sub-Vendor. Basket classification inheritance and separate room selections remain correct.
3. **Price behavior:** under the proposed fill-and-edit choice, explicit mode changes fill Price, manual edits are retained until another explicit mode choice, and all displayed/saved amounts reconcile with integer-paise calculations. Test at least two unequal projects and multiple room/line combinations to detect cross-project or cross-room reuse.
4. **Configuration correctness:** latest saved draft wins over active; same-revision legacy combined In-house remains supported; partial split settings, missing modes, zero, invalid and overflowing values, stale versions, and UOM changes have explicit safe behavior without fallback pricing.
5. **Persistence and compatibility:** new mode/rate-source choices survive save/reload, deselection/reselection, and recommendation inclusion. Historical and older-client paths retain saved amounts and classifications. Invalid metadata is rejected. Configuration refresh updates only configuration-derived editable prices and the current base reference.
6. **Immutable publication:** submitting a new estimate with different modes succeeds and freezes correct metadata and amounts. Previously published/approved estimates remain unchanged and readable. Client presentation, Procurement reads, and submission with an empty location and recommendation origins do not regress.
7. **Rendered UX:** inspect initiation and estimation at desktop and narrow mobile web widths; verify labels, keyboard radio navigation, focus visibility, long source input, pending/error states, missing-price messaging, and no horizontal overflow. No new animation is needed.
8. **Integrated checks:** run affected initiation tests, configured-estimate builder/workspace tests, catalogue/save replica-set tests, publication/presentation tests, API documentation checks, affected workspace typechecks and builds, and `git diff --check`. Broaden tests for any shared-contract regression discovered. There is no repository lint script; do not report lint as run.

Execution and verification progress are recorded in the separate task plan.

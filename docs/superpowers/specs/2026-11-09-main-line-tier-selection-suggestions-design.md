# Main-line tier selection and price suggestions

Date: 2026-11-09
Status: approved placement implemented and reviewed in Mode A. Focused tests, typecheck, build, and desktop/mobile checks passed. Repository-wide tests retain baseline failures documented in the task plan.

## Goal and confirmed decisions

Hide the default Mode choice in the estimate editor, put tier selection on each Main Line, and make Signature/Premium/Functional price suggestions available through an info icon beside each Sub Basket name. The user's latest feedback replaces the initially approved always-visible Main Line suggestion paragraphs with click-to-open information. The user confirmed **Keep Signature**; do not rename it Standard. Keep the existing “Check tier comparison” action (described by the user as “Check tier details”), comparison dialog, and PDF behavior unchanged.

## Original behavior and evidence

- `ConfiguredEstimateBuilder.tsx` currently renders `EstimateSubBasketModes` for each room/Main Basket/Sub Basket scope, including a separate direct-items group. Its tier options depend on every included line in the group.
- `EstimateSubBasketModes.tsx` renders Mode, Signature, Premium, and Functional choices, “Mode keeps current line choices,” and the comparison action. The comparison dialog is loaded on demand and supports PDF download.
- `LeadEstimateWorkspace.tsx` applies a group choice through `applyConfiguredGroupTier`; this updates all included lines in the scope. Its existing `updateConfiguredLine` and `updateConfiguredLinePricing` path already supports changing one line's `modeTier` by stable line key.
- `EstimateLineRow.tsx` already provides the tier slot, accessible `EstimateLineTierOptions`, and hidden unavailable-tier descriptions. `ConfiguredLineRow` currently leaves its tier slot unused.
- `shared/knowledge/knowledgeModeTiers.ts` defines the stored tiers as `signature`, `premium`, and `functional`. “Mode” is an editor baseline state, not a stored fourth tier. Standard/Special item classification and PMC/Vendor/In-house pricing modes are separate concepts.
- The existing read-only comparison service returns current and alternative tier selling rates, line amounts, and unavailable reasons from current Configuration. Requests include estimate/source versions, stable IDs, quantities, dimensions, and component selections. Alternate In-house prices can be incomplete until destination components are selected.

## Scope and non-goals

- Scope is the staff estimate workspace under discussion: Sales and its shared Designer Main Line editor, respecting existing role permissions. This is a control-placement and price-guidance update, not a general estimate redesign.
- Preserve Client editors, Configuration administration, Procurement, published/historical estimates, approval/submission behavior, and the prior Sales refresh-warning fix.
- Keep the current sub-basket comparison action in its existing location. Preserve its label, scope, columns (including its current Mode column), loading/error behavior, dialog accessibility, and PDF. Hiding Mode applies to editor selection controls, not the unchanged comparison view.
- No backend API/schema changes, new tier identities, migrations, dependencies, automatic saves/submissions, or changes to pricing formulas.

## Required editor behavior

1. Remove the staff editor's visible Mode radio and “Mode keeps current line choices” help text. Mode remains implicit: opening, refreshing, or viewing suggestions must retain each line's current tier, manual/configured price source, component selections, quantity, and dimensions.
2. Remove bulk tier selectors from staff sub-basket/direct-items headers while retaining the comparison action there. Display Signature, Premium, and Functional choices on each included configured Main Line using the existing row tier slot.
3. A choice changes only the targeted Main Line in its current room. Do not change siblings, the same Main Line in another room, excluded items, or another project. Use stable IDs rather than names or visible row positions.
4. Derive availability per line, not from its siblings. Preserve disabled reasons and permission/read-only behavior. Disable tier changes while the current source is missing, stale, or being refreshed, and do not let tier selection change a pricing mode forbidden to the actor.
5. Preserve current prices until deliberate selection. A stored configured tier can appear selected; a retained manual-price baseline must not be presented as an already-applied configured suggestion. Explicit tier selection adopts that tier's configured price even when the stored tier identity is the same. Do not add a visible Mode reset or a replacement control.
6. Reuse existing line pricing rules: a real tier switch resets destination-dependent In-house components; quantities/dimensions remain intact. Save/reload preserves the chosen tier and price source through the existing version-checked save path. Never persist `mode` as a tier.

## Sub Basket information control and price suggestions

7. Remove the always-visible suggestion paragraphs beneath Main Lines. Place one compact info icon immediately beside each Sub Basket name when that group contains included lines. The icon is a separate button, not nested inside the collapse button, and clicking it must not collapse the group. Direct items without a Sub Basket use the equivalent icon beside the Direct items heading.
8. Clicking the icon opens a compact information dialog using the existing accessible Dialog component. Display the same Signature/Premium/Functional suggestion messages, grouped by Main Line name so different quantities and prices cannot be confused. Include the group's included lines in the current room, independent of search/pagination; exclude other rooms and excluded rows. Do not replace or alter Check tier comparison and do not add another PDF action.
9. For a complete alternative, show the configured selling rate and the amount for the line's current quantity, for example: “If you choose Premium: ₹25 / sq ft; ₹50 for 2 sq ft, excluding GST.” These example amounts are illustrative only; production text uses actual current values. Component-priced lines show the validated amount without inventing a per-unit rate. Do not add new group-total calculations; the existing details comparison already provides totals.
10. When an alternative is unavailable or incomplete, keep a concise explanation in that tier's suggestion, such as “Price not configured” or “Choose components to calculate the price.” Do not use zero, another tier, an old revision, or a current manual price as a fallback. A genuine configured zero price remains valid.
11. Opening/reopening the information dialog shows the current quantities, dimensions, pricing mode, components, selected tier, source revisions, and saved estimate version. Fetch suggestion data when its information dialog is open. While new values are pending, do not present the previous amount as current. On failure, show a compact unavailable/retry state and preserve local edits/selections. A response proving stale/inaccessible Configuration blocks tier changes for that affected scope until freshness/access is recovered; hiding information does not dismiss that known blocker.
12. Use a simple outlined information symbol with a contextual accessible button name, approximately 32px desktop and 44px touch target. The information dialog uses existing styling, a bounded width around 560px, scrollable content, and viewport-safe mobile sizing. Support keyboard activation, Escape/Close, focus containment, and return focus to the surviving trigger. Close/reset when actor, estimate, room, or the underlying group changes/disappears. Do not open on hover, add decoration, or add dependencies. Preserve the existing hidden diagnostic-note treatment and row typography.

## Recommended approach and tradeoff

Reuse the existing server comparison read for suggestion amounts in the opened room/Main Basket/Sub Basket information scope, indexed back to Main Lines. This uses the same authoritative pricing as tier details, handles component/dimension rules, and needs no API change. Reads must be bounded, deduplicated, and cancelled when obsolete or the information dialog closes.

Calculating all suggestions directly from catalogue rates would avoid these reads but would duplicate component pricing and validation rules and could disagree with tier details. Do not introduce that second pricing calculation path.

Keep the implemented staff-only comparison presentation and existing Main Line tier controls/single-line edit path. Add an optional Sub Basket heading action slot to the shared builder shell for the info trigger, leaving consumers that do not supply it unchanged. Reuse the implemented suggestion renderer inside the new compact information dialog rather than duplicating pricing text or logic.

## Data, state, permissions, and compatibility

- The normal transition is retained line state → deliberate per-line tier choice → local draft update → existing Save/Submit. Reading suggestions or details is read-only and does not select a tier, save, publish, email, or mutate Configuration.
- Suggestions use the existing comparison request and integer-paise response. Show line amounts excluding GST; retain existing estimate rounding and totals. Do not expose internal cost/margin fields.
- Cache/request identity includes actor/review context, lead/project, room/group, estimate/source versions, and all price-affecting inputs. Discard obsolete responses; reset on identity/scope changes. Batch the opened group's eligible included lines instead of requesting once per line; keep invalid lines visible with explanatory states. Debounce changing inputs without delaying local edits. The info trigger remains usable when the group's lines are collapsed.
- Existing backend authorization remains authoritative. Editable Sales/Designer lines retain their existing tier capabilities; a locked/read-only line cannot change tier. Historical/published amounts remain immutable. Shared Client comparison consumers retain their current controls and permissions.
- Existing saved tiers and missing historical tier values retain their established interpretation. No data conversion or backfill is needed. Rollback is a scoped frontend revert; no data rollback is required.

## Existing work and risks

The initial dirty paths for this request were `LeadEstimateWorkspace.tsx`, `LeadEstimateWorkspace.checklist.test.tsx`, and the prior refresh-warning specification/task plan. Their diffs were inspected: they belong to the completed warning-removal request and were preserved. The approved info-icon placement is now implemented.

Primary risks are applying a choice to siblings, replacing a manual price merely on render, showing stale or incorrectly attributed prices, invalid nested header controls, lost focus when a group disappears, and unintentionally altering the shared comparison dialog or Client controls. Scoped requests, stable IDs, existing pricing helpers/Dialog behavior, and the acceptance checks below address these risks.

At the time of the placement feedback, Main Line controls and inline suggestions were implemented but not finally verified. The revised work preserved that pricing path and moved its presentation into the Sub Basket information dialog. Review confirmed fixes for legacy manual same-tier selection, blockers across quantity edits/closure, and partial successful reads that omit stale sources. Desktop/mobile rendered verification passed using synthetic data, and its temporary files and isolated sessions were removed. The task plan records exact final verification results.

## Acceptance criteria and verification

- **AC1:** Staff editor has no visible Mode/default control or helper. Opening/refreshing the editor does not change stored tiers, manual rates, components, quantities, or dimensions. Comparison still retains its current Mode column.
- **AC2:** Each included Main Line has its own tier choices. Selecting one changes only that line. Verify two unequal lines in one group, the same line in another room, excluded rows, and same-named lines with different IDs. No bulk selector remains in staff headers.
- **AC3:** Main Lines do not show the three suggestion paragraphs inline. Each populated Sub Basket has an info button adjacent to its name; clicking it opens all three price suggestions per included line in that room/group. Suggestions use current authoritative selling prices/amounts and remain available after tier selection on reopening. Cover multiple lines, collapsed groups, search/pagination, direct items, genuine zero prices, unavailable tiers, manual baselines, fractional quantities, dimensions, and incomplete In-house component choices.
- **AC4:** Closed information dialogs do not fetch suggestion prices. Opening requests only its scoped group; closing cancels obsolete reads. Quantity/source changes invalidate old suggestions; delayed out-of-order responses cannot restore stale prices. Test two distinct project/lead identities with unequal amounts and identity switches. Failed reads preserve edits and can recover without saving; known stale/inaccessible-source blockers survive closing and clear only on valid recovery.
- **AC5:** Tier selection respects existing permissions and freshness guards. Explicit same-tier selection can adopt configured pricing from a manual baseline. Save/reload persists only the targeted line's tier, price source, and valid component state using existing version checks.
- **AC6:** Check tier comparison keeps its location, label, full group scope, dialog, and PDF behavior. Opening/downloading remains read-only, and the comparison reflects current line choices and quantities. Shared Client behavior is unchanged.
- **AC7:** Rendered keyboard/accessibility tests and desktop/mobile checks confirm per-line tier focus/labels, adjacent info-trigger placement without nested buttons, information-dialog scrolling/close/return focus, and no horizontal overflow. Actor/room/group transitions dismiss the old information. Prior Sales warning-removal tests still pass.
- Run focused builder/workspace tier, pricing, comparison, and shared-consumer regressions; then frontend typecheck/build and broaden frontend tests according to shared-component impact. Run `git diff --check` and inspect final status. Backend tests are necessary only if the approved frontend-only boundary must be revisited.

## Assumptions and open decisions

- The staff estimate editor is the requested surface; Client/Configuration/Procurement UI changes are outside this scope.
- The latest placement feedback supersedes the earlier inline interpretation: suggestions are hidden until the Sub Basket info button is clicked; they are not stored advisory messages or automatic tier selections.
- Preserve the shown per-line rate/quantity information by grouping messages under Main Line names in the dialog. No new group-summary price calculation is requested.
- The user resolved the naming question: retain Signature. No remaining blocking product decision.

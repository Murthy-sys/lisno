# AI Estimator configuration refinements

## Goal

Refine the AI Estimator Configuration experience so Super Admin can manage Main Basket names from the basket-management flow, configure PMC as a minimum/maximum range, apply PMC discounts only to Lisno's PMC charge, maintain In-house inclusions/exclusions, see a reconciling Labour + Material cost breakup, review only configuration status in the Quick summary, reopen saved Mode choices as selected, and create a Main Basket while adding a temporary item.

This is a cross-stack configuration and financial-preview change. It affects the React configuration workspace, the advanced-section payload contract and validation, the preview calculation/domain contract, OpenAPI, and focused persistence/API tests. It does not authorize deployment or production data changes.

## Current behavior and evidence

- `KnowledgeBaseIndexPage.tsx` already calls `PATCH /admin/ai-estimator-knowledge/baskets/:basketId` from `BasketEditorDialog`, and the request already accepts `name`, `description`, `displayOrder`, `status`, and `expectedVersion`. Both basket cards and the Super Admin **Manage main baskets** dialog can open the editor. The requested outcome therefore needs a regression-safe Super Admin management path and cache synchronization, not a second rename endpoint.
- `CreateKnowledgeItemDialog.tsx` lists active Main Baskets but cannot create one. When none exist it directs the user back to Configuration. The existing `createKnowledgeBasket` API can create a name-only active basket.
- `KnowledgeModeConfigurationBuilder.tsx` initializes its local visibility/selection state to PMC selected, Execution unselected, Sub-Vendor selected, and In-house unselected. It does not initialize those controls from saved `modeConfigurations`, `modeCalculations`, or margins. This explains why saved Execution reopens without its checkbox marked.
- PMC currently stores one optional `advanced.payload.pmcMarginBps`, validated between 1,000 and 2,000 basis points (10%–20%). Sub-Vendor already stores a compatible pair: `subVendorMinimumMarginBps` and `subVendorMarginBps`, with a missing legacy minimum read as Min. = Max.
- The PMC preview currently calculates selling price with `adjusted cost / (1 - PMC margin)` and applies the custom discount to the entire selling price. Thus a discount reduces both cost recovery and the PMC charge. The user requires the discount to reduce only the PMC charge.
- Inclusions and exclusions are stored on the canonical PMC `modeConfigurations` row and displayed under Sub-Vendor. Backend validation currently rejects those arrays on an Execution configuration. In-house has no scope checklists.
- The In-house preview response already returns independently rounded Labour and Material `revisedAmountPaise` and `totalPaise` values plus the combined `totalPaise`. The UI currently shows only Labour total, Material total, and their combined total, so the requested expense/margin breakdown can be derived without a new pricing source.
- The Quick summary currently projects detailed Mode components, calculations, percentages, description, inclusions/exclusions, and Specifications, with expandable details. The requested summary needs only three Mode configuration statuses.
- The worktree is clean at this specification gate. Implementation must recapture the dirty-path baseline before writers start and preserve later unrelated changes.

## Confirmed product behavior

### 1. Main Basket name editing

1. In **Manage main baskets**, a Super Admin who has `ai_estimator_knowledge.configuration.update` can open an active or inactive Main Basket and edit its name in the existing editor.
2. Saving uses the existing version-checked PATCH route. Trim the submitted name, enforce the established length and uniqueness rules, and retain the current description, order, and status unless the user changes them in the same edit.
3. A successful rename immediately refreshes basket lists, item lists, temporary-item details, open selectors, headings, and other cached presentation that carries the basket name. Stable Basket IDs remain unchanged; no Main Line, Sub-Basket, quality checklist, revision, or relationship is moved.

#### Follow-up clarification: Main Line name editing

1. A Super Admin with `ai_estimator_knowledge.configuration.update` sees **Edit Main Line** on every non-archived Main Line workspace, including Draft and Active items.
2. The action edits the displayed Main Line name through the existing version-checked Main Line update contract. Successful changes refresh the workspace heading, lists, temporary-item references, and resolved context caches.
3. Archived items and users without the update permission receive no edit affordance. Stale-version and validation failures remain in the dialog and do not overwrite newer data.
4. Duplicate-name, stale-version, denied, and validation failures keep the editor open with an actionable message and do not mutate local saved presentation.
5. The backend update permission remains authoritative. The management entry point stays Super Admin-only as today; frontend visibility is not treated as enforcement.

### 2. PMC minimum and maximum margins

1. Replace the single PMC Margin control with adjacent **Min. PMC Margin (%)** and **Max. PMC Margin (%)** fields matching the established Sub-Vendor range interaction.
2. Preserve PMC's existing financial domain: each value is an integer number of basis points from 1,000 through 2,000 (10%–20%), with up to two decimal places. This request adds a range but does not broaden PMC to Sub-Vendor's 0%–95% domain. Require Min. <= Max.; an equal pair is valid.
3. Retain `pmcMarginBps` as the maximum and add optional `pmcMinimumMarginBps` as the minimum. A legacy payload with a maximum and no own minimum reads as Min. = Max. without writing or showing a pending change.
4. Both may be explicitly empty in an unconfigured draft. Once a minimum property is present, a partial pair is invalid. On the first edit of legacy single-value data, materialize both effective values before applying the changed field so editing Max. cannot silently change Min., and vice versa.
5. Save, Discard, reload, activation, pending-change review, conflict review, Active-to-Draft copy, saved summary status, model validation, and OpenAPI must all understand both values. Invalid pairs cause no section, version, or audit write.
6. PMC Test calculations display both saved values read-only and provide **Calculate with Max. PMC Margin** and **Calculate with Min. PMC Margin**. Default to Max. Selecting either value clears stale results and sends that exact value through the existing preview request field `pmcCalculation.pmcMarginBps`; no new preview request field is required.
7. Preserve historical values that were valid under the current single PMC rule. The missing-minimum compatibility interpretation is read-only until the user edits a margin. No migration or backfill is required.

### 3. PMC discount applies only to the PMC charge

Let:

- `C` be adjusted cost in integer paise after quantity and low-quantity impact;
- `r` be the selected PMC margin in basis points;
- `d` be the temporary custom discount in basis points;
- `P` be selling price before discount;
- `M` be the PMC charge before discount;
- `D` be the discount amount; and
- `T` be the final total.

Use the following exact integer-paise calculation:

```text
P = roundHalfUp(C x 10000 / (10000 - r))
M = P - C
D = roundHalfUp(M x d / 10000)
T = C + M - D
```

The cost portion `C` is never discounted. The discounted/effective PMC charge is `M - D`. Preserve inclusive low-quantity impact, exact decimal quantity parsing, integer-paise overflow checks, and half-up rounding.

Example: adjusted cost ₹220.00, PMC margin 20%, and discount 10% gives selling price ₹275.00, PMC charge ₹55.00, discount ₹5.50, effective PMC charge ₹49.50, and final total ₹269.50. The old selling-price discount would have produced ₹247.50 and must no longer be accepted for PMC.

The preview response retains `pmcMarginAmountPaise` as the pre-discount PMC charge and `totalBeforeDiscountPaise` as `P`. Its `discount.amountPaise` becomes the amount calculated on `M`. `finalVendorChargesPaise` represents the preserved adjusted cost for PMC after this change. Sub-Vendor keeps its current discount-on-selling-price behavior and current response semantics.

The frontend must verify the returned PMC arithmetic, present **PMC charge**, **Discount on PMC charge**, **Effective PMC charge**, and **Final total**, and reject stale or mathematically inconsistent responses. Temporary quantity, selected Min./Max. basis, and discount never save configuration.

### 4. In-house inclusions and exclusions

1. Add In-house **Inclusions** and **Exclusions** checklists using the existing checklist interaction, responsive layout, stable row IDs, add/delete behavior, keyboard support, and mutual-exclusion rule.
2. Treat **Supplier**, **Execution**, and **Labour** as the initial In-house scope choices. They are scope rows, not new calculation modes or financial fields. Each can be selected in either Inclusions or Exclusions, never both at once. Super Admin may add custom rows and delete rows using the existing checklist behavior.
3. Store In-house lists on the canonical `modeConfigurations` row with `modeKind: "execution"` and `executionSource: "in_house"`. Do not reuse or overwrite PMC/Sub-Vendor lists. Backend validation permits these arrays only on canonical PMC or In-house rows; other Execution/recovery rows still reject them.
4. For an item with no saved In-house scope lists, render the three initial choices without creating a write or pending change. On the first scope edit, materialize the In-house configuration and both lists with stable IDs. If a user later saves an empty list or deletes an initial choice, reopening must preserve that saved decision and must not recreate deleted entries.
5. Selected In-house scope is included in the generated/shared Mode description with explicit In-house labeling, pending changes, conflict review, and validation focus. It remains separate from Sub-Vendor scope so identical names in different execution sources do not collide.
6. The same normalized-name and selected-in-both-lists validation used by existing scope lists applies within In-house: Unicode NFKC, trimmed/collapsed whitespace, and case-insensitive comparison. IDs remain the persistence/audit identity.

### 5. Labour + Material cost breakup

After a valid In-house preview, show one compact reconciling breakdown:

```text
Labour expense       + Margin on labour
Material expense     + Margin on material
Total expense        + Total margin        = Subtotal
```

Use backend-returned values only:

```text
labour expense  = labor.revisedAmountPaise
labour margin   = labor.totalPaise - labor.revisedAmountPaise
material expense = material.revisedAmountPaise
material margin  = material.totalPaise - material.revisedAmountPaise
total expense   = labour expense + material expense
total margin    = labour margin + material margin
subtotal        = preview.totalPaise
```

When a temporary discount is applied, each displayed margin is the effective margin after that discount so the equation still reconciles exactly. The existing discount/effective-markup helper text may remain, but the main breakdown must never mix pre-discount margin with a post-discount subtotal. Show zero and signed values correctly, use the user's **Labour** spelling in this combined breakdown, and do not compute or fabricate a replacement total if the server response is inconsistent.

The combined preview must validate:

```text
total expense + total margin = subtotal
labor.totalPaise + material.totalPaise = subtotal
```

If either equality fails, show the established calculation error/retry state instead of a misleading result.

### 6. Compact Quick summary status

1. Replace detailed Mode data in the Quick summary with exactly three rows:
   - **PMC configured** / **PMC not configured**
   - **Sub-Vendor configured** / **Sub-Vendor not configured**
   - **In-house configured** / **In-house not configured**
2. Do not expose Mode percentages, base rates, quantity limits, impact, descriptions, components, inclusion/exclusion values, or Specifications through a **Show details** disclosure in Quick summary.
3. Other Quick summary groups and the Main Basket/Sub-Basket/Main Line hierarchy keep their current behavior. This change simplifies the Mode group only.
4. Status is derived only from the persisted revision returned by the server, never unsaved editor buffers or simulator inputs:
   - PMC is configured when its calculation settings and effective Min./Max. PMC pair are complete and valid.
   - Sub-Vendor is configured when its calculation settings and effective Min./Max. Lisno Margin pair are complete and valid.
   - In-house is configured when both Labour and Material calculation settings are complete and valid. Scope lists are optional and do not make an otherwise incomplete financial setup configured.
5. Missing, partial, invalid, or legacy-unresolved saved data reports **not configured**. Existing load/denied/refresh notices remain visible so a failed read is not silently presented as an authoritative status.

### 7. Saved Mode selection state

1. When a saved revision opens, mark PMC selected if persisted PMC configuration exists, and mark Execution selected if persisted Sub-Vendor or In-house configuration exists.
2. Under Execution, mark Sub-Vendor and/or In-house selected from their own saved settings. A complete saved calculation, margin pair, source-specific Mode configuration, or source-specific scope list counts as persisted configuration for selection display, even if another required field is incomplete.
3. For a brand-new revision with no Mode data, retain the current authoring convenience of opening PMC initially. That initial visibility does not mean **PMC configured** in Quick summary and does not create a pending change.
4. Selection checkboxes remain local reveal/hide controls. Unchecking a selected Mode hides its editor and does not delete saved data. After a successful save/refetch, the saved sources stay selected; switching item or revision recalculates selection from that source and must not leak the prior item's local selection.
5. Validation focus may reopen a hidden source containing an error. Read-only users see the same correct saved selection state without edit controls.

### 8. Add Main Basket while adding a temporary item

1. In **Add temporary item**, show an **Add main basket** action to a Super Admin who has `ai_estimator_knowledge.configuration.create`. Keep it available beside the selector when baskets exist and as the primary recovery action when none exist.
2. Open a small inline name editor within the same panel. Preserve the temporary item name and any other draft values while the basket is being created; avoid nested dialogs and do not submit the temporary item prematurely.
3. Create through the existing basket POST contract. On success, cache/invalidate all basket-list variants, insert/select the authoritative returned Basket ID, announce success, and return focus to the Main Basket control or next required field. The user can then finish and submit the temporary item once.
4. Duplicate name, validation, permission, network, and ambiguous outcomes keep the temporary item form intact and provide retry/reconciliation behavior that avoids blind duplicate creation.
5. The inline action is a Super Admin affordance and also requires the frontend permission. Backend route authorization remains authoritative. Other item-creation contexts keep their current behavior unless they already invoke the same temporary-item dialog.

## Architecture and data contract

### Advanced section payload

Add one optional allowlisted field:

```ts
pmcMinimumMarginBps?: number | null
```

Retain `pmcMarginBps` as Max. Validate the effective pair consistently in frontend helpers, section validation, Mongoose validation, activation, conflict review, saved projection, and OpenAPI. No collection schema migration is required because the advanced payload is JSON-like and the field is optional.

Extend the existing `KnowledgeModeConfiguration` interpretation so `inclusions` and `exclusions` are valid on:

- canonical PMC rows; and
- canonical `execution / in_house` rows.

No new top-level scope container is introduced. Existing PMC/Sub-Vendor records remain readable. Legacy In-house rows without lists remain valid.

### Preview API

The PMC request still accepts one selected `pmcMarginBps`; Min./Max. is configuration state, not a two-scenario request. Response field names remain additive-compatible. Update response documentation so PMC discount basis and `finalVendorChargesPaise` semantics are explicit. Sub-Vendor and In-house request/response contracts do not change.

### Authorization and concurrency

- Basket rename: existing configuration-update operation plus `expectedVersion`.
- Inline basket creation: existing configuration-create operation.
- Advanced-section changes: existing configuration-update operation, item `allowedActions`, section version, and aggregate version.
- Preview: existing configuration-read operation.

Super Admin override remains operation-specific and auditable. No client-only role check grants authority. Rejected writes produce no payload, version, or audit mutation.

### Compatibility and rollout

- Legacy single PMC margins read as equal Min./Max. values. No backfill occurs.
- Existing Sub-Vendor range and formula remain unchanged.
- Existing Active revision history is immutable. A new draft/save records the new field or In-house lists through the normal versioned workflow.
- Frontend and backend should be released together because the frontend will submit `pmcMinimumMarginBps`, the backend will accept In-house scope lists, and PMC response validation will expect charge-only discount arithmetic.
- Rollback must continue reading the optional field or ignore it safely. A rollback to the old PMC calculation would change new previews but does not require stored-money migration because previews are temporary.

## Decisions and tradeoffs

### PMC range domain

**Selected:** add Min./Max. while preserving PMC's current 10%–20% bounds and basis-point precision. This satisfies the requested range without silently expanding a financial control from 20% to 95%.

Alternative: copy Sub-Vendor's full 0%–95%, five-point domain. This would be visually similar but materially broadens allowed PMC pricing and is not implied by asking for Min./Max. It is outside this specification unless the user explicitly changes the bounds.

### In-house scope storage

**Selected:** store In-house lists on the canonical In-house Mode configuration. This preserves source ownership, supports independent saved/review states, and prevents In-house edits from changing Sub-Vendor wording.

Alternative: continue storing all lists on PMC and merely render them in both places. That cannot represent different Sub-Vendor and In-house choices and would make audit/pending summaries ambiguous.

### Quick summary status

**Selected:** derive three saved, validity-based statuses and remove Mode details from Quick summary. This matches the requested review behavior and avoids calling a partial financial setup configured.

Alternative: mark configured when any field exists. That would show incomplete or invalid pricing as configured and is therefore rejected.

## Scope and non-goals

Included:

- the seven requested Configuration/Mode/temporary-item refinements;
- frontend/backend validation and API documentation needed for those refinements;
- pending/conflict/saved-summary projections affected by the new fields and lists;
- focused accessibility, responsive, authorization, financial, persistence, and regression verification.

Excluded:

- changing Sub-Vendor margin bounds, formula, or discount behavior;
- changing approved estimates, estimate pricing, finance ledgers, procurement, or project budgets;
- creating Supplier, Execution, or Labour as new master-data entities;
- rewriting historical Active revisions or backfilling current records;
- altering roles or granting new backend permissions;
- dependencies, lockfile changes, seeds, live migrations, commits, pushes, deployment, or production configuration writes.

## Risks and mitigations

- **Discounting the wrong basis:** keep separate PMC and Sub-Vendor calculation branches and assert the exact ₹220/20%/10% example through the domain and HTTP preview.
- **Rounding drift:** derive displayed components from integer-paise backend fields and verify both reconciliation equalities. Never calculate money with floating-point percentages in the UI.
- **Legacy range ambiguity:** use an own-property check for the minimum and avoid writing on read. Test first-edit materialization, Save, Discard, conflict acceptance, and Active-to-Draft copy.
- **Scope leakage:** store and validate In-house lists on its own stable configuration ID. Test identical row names across sources and conflicts only within one source's pair.
- **Phantom defaults:** render initial In-house choices without a write, then preserve explicitly saved empty/deleted lists. Test open-without-edit produces no pending changes.
- **Selection leakage:** key/synchronize local reveal state by item, revision, and accepted saved payload. Test two items with asymmetric saved sources.
- **Misleading summary:** derive statuses only from matched persisted query envelopes and retain load/error notices.
- **Duplicate inline basket creation:** lock submission, use authoritative response IDs, retain draft inputs on failure, and reconcile ambiguous outcomes before retrying.
- **Rename stale labels:** invalidate every basket/item/detail selector carrying the name and test rename while a temporary-item dialog or item workspace is cached.

## Acceptance criteria

- **AC1 — Basket rename:** a permitted Super Admin renames an active or inactive Main Basket from Manage main baskets; all affected cached labels refresh by stable ID. Duplicate, stale, invalid, and denied attempts do not write.
- **AC1a — Main Line rename:** a permitted Super Admin can open **Edit Main Line** from a non-archived item workspace, rename it with expected-version protection, and immediately see the updated heading and dependent cached labels. Archived or unauthorized workspaces expose no action.
- **AC2 — PMC range:** a legacy single PMC margin opens as equal Min./Max. without a write. Unequal valid values such as 12.50%/17.75% save, reload, discard, conflict-review, and activate correctly. Partial, reversed, below-10%, above-20%, unsafe, and excess-precision pairs are rejected consistently.
- **AC3 — PMC preview selection:** Max. is selected initially; selecting Min. submits its exact value and clears stale output. Quantity, discount, close/reopen, error/retry, UOM, and pending-request behavior remain correct.
- **AC4 — PMC charge discount:** adjusted cost ₹220, 20% PMC, 10% discount returns PMC charge ₹55, discount ₹5.50, effective PMC charge ₹49.50, and final total ₹269.50. Cover 0% and 100% discount, Min./Max., impact below/equal/above threshold, half-up ties, zero cost, and overflow. Sub-Vendor regression remains unchanged.
- **AC5 — In-house scope:** In-house shows Supplier, Execution, and Labour in both list contexts without a write on open. Selection, mutual exclusion, custom add/delete, save/reload/discard, generated description, pending/conflict review, read-only rendering, saved empty lists, and backend direct-write rejection are correct and isolated from PMC/Sub-Vendor.
- **AC6 — In-house breakup:** the rendered Labour and Material expenses/margins reconcile exactly to Total expense, Total margin, and Subtotal with and without discounts. Mismatched server responses show an error instead of a total.
- **AC7 — Quick summary:** the Mode group shows only PMC, Sub-Vendor, and In-house configured/not-configured statuses from saved data, with no Mode details disclosure. Partial/invalid data is not configured, load/denied/refresh notices remain, and other groups are unchanged.
- **AC8 — Saved selections:** reopening or switching to a revision marks every saved source selected, including Execution and its saved source(s). New empty revisions retain the initial PMC view without being reported configured. Hiding a source does not delete or dirty it.
- **AC9 — Temporary Main Basket creation:** an authorized Super Admin can create and auto-select a Main Basket inside Add temporary item, including from the zero-basket state, without losing entered item data or double-submitting. Unauthorized users receive no affordance and direct API authorization remains enforced.
- **AC10 — Integrated quality:** focused frontend and backend tests, replica-set persistence checks for the advanced-section changes, authorization/route/OpenAPI checks, both workspace typechecks/builds, desktop/mobile rendered interaction and accessibility checks, `git diff --check`, and final status inspection pass or are reported with exact limitations. There is no repository lint script, so no lint result may be claimed.

## Verification requirements

Implementation verification must include:

- backend unit tests for PMC pair validation, charge-only discount arithmetic, response reconciliation, In-house list validation, and basket update/create behavior;
- backend route/OpenAPI tests plus replica-set save/refetch/reject-before-write, version-conflict, audit, legacy-copy, activation, and two-item isolation cases;
- frontend tests for PMC inputs/simulator/pending/conflict flows, In-house scope and breakup, saved-selection initialization, Quick summary statuses, Main Basket rename, and inline temporary-item basket creation;
- rendered desktop and mobile checks for field pairing, checklists, compact summary, breakpoint wrapping, keyboard/focus behavior, error states, and accessible names;
- full `npm run typecheck`, `npm test`, and `npm run build` in affected backend/frontend workspaces after focused checks, unless an unrelated baseline failure is first reproduced and documented;
- repository hygiene with `git diff --check` and `git status --short`.

## Assumptions resolved by this specification

- “Similar like Sub-vendor” means the PMC Min./Max. interaction and legacy-pair behavior; PMC keeps its established 10%–20% business range.
- “PMC discount only for PMC charge” means discounting the calculated PMC margin amount, leaving adjusted cost untouched.
- Supplier, Execution, and Labour are initial In-house inclusion/exclusion choices, not new Modes or master records.
- “Quick review” refers to the Mode content inside the existing Quick summary; its other hierarchy and saved groups remain.
- Inline Main Basket creation is available to authorized Super Admin from the temporary-item dialog even when other baskets already exist, and becomes the recovery action when none exist.

## Open decisions

None beyond approval of the explicit interpretations above. After approval, the next gate creates the separate dependency-ordered task plan. No implementation is authorized by this specification alone.

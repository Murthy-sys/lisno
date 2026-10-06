# Project-only Base amount editing in Procurement Main Basket

Date: 2026-10-05
Status: Approved

## Goal

An authorized Procurement user can enter or update the **Base amount per UOM** in the Standard Main Basket table for one project's approved line. The saved project amount drives that line's displayed Total using the existing pinned Sub-vendor low-quantity rule. It never changes the shared Configuration mode price. The user explicitly chose project-only editing and stated that shared Configuration mode prices are changed only by Super Admin in Configuration.

## Current behavior and evidence

- The four-column basket table reads `baseUnitRatePaise` and `standardCost.adjustedCostPaise` from the server; it has no price input or save operation (`ProcurementBasketScopePanel`).
- `resolvePurchaseOrderModes` reads each approved line's pinned Configuration revision, UOM and Sub-vendor settings and produces the Standard cost. `projectProcurementBaskets` returns the line/card/footer amounts and hashes the private price basis for BOQ freshness. BOQ create, update, send and basket work-order issue revalidate that projection.
- A saved procurement mode decision describes mode/quantity, not a Standard project price. `ProjectProcurementItem.pricePaise` belongs to child/vendor work and cannot represent a Main Basket source line. A separate project-scoped rate record is therefore the smallest clear persistence boundary.
- The repository has extensive pre-existing dirty work. Implementation must capture target diffs and preserve them. The preceding Standard automatic pricing correction is verified; its Configuration source remains the default when no project edit exists.

## Scope and behavior

1. In an **explicitly Standard** approved Main Basket, show a small `Edit` action inside an actionable line's Base amount cell to users authorized to manage project procurement. On activation, replace that cell with one labelled rupees-per-UOM input and Save/Cancel controls. Show an existing project rate for editing. Keep the table's four columns and do not add a price source, digest or mode note under the description. Keyboard and mobile use remain supported.
2. Save the entered rate as integer paise in a project-only override keyed by project, immutable approved estimate identity (estimate ID/version/review-round ID), Main Basket ID and source-line key. Record version, actor and timestamps. Do not write to Configuration revisions, sections, modes, the approved estimate or vendor prices. A newly approved estimate does not silently inherit an older override; the old record remains audit history.
3. Accept finite, nonnegative rupee amounts with at most two decimal places, including ₹0. Reject invalid, negative or out-of-range values server-side. The backend applies the effective base rate to the **same pinned Sub-vendor low-quantity limit and impact** and approved calculation quantity, using canonical integer-paise arithmetic. For example, changing the POP base from ₹75 to ₹80 at quantity 1 with a qualifying 10% impact displays ₹80 Base amount and ₹88 Total. The basket card/detail/footer update from one server projection. No client-side total calculation is authoritative.
4. Configuration remains the fallback when no project override exists. An existing override can be updated or cleared back to the current pinned Configuration rate using an action in the edit state. A missing valid pinned revision/UOM/quantity or missing Sub-vendor low-quantity settings remains unavailable; a local base rate alone cannot invent those rules. An observed activation digest mismatch with calculable saved settings remains orderable, as in the approved Standard behavior.
5. The new write uses backend project access plus the canonical `procurement.purchase_orders.manage` operation; frontend visibility follows that permission but does not enforce it. Only the Procurement project edit route can change project rate records. It does not grant Procurement any Configuration create/update/lifecycle permission. Existing Super Admin Configuration routes and authorization remain separate and unchanged.
6. Use expected approved source, override version/CAS and idempotency for Save/Clear. Revalidate the line's explicit Standard classification and stable source identity in the write transaction. Audit the actor, old/new rate and source identity. A concurrent edit, changed approval, stale pin or stale version returns a specific conflict and refreshes the UI; a failed write does not change the displayed saved amount.
7. Include the effective project rate and override version in the private basket preparation digest. Draft BOQs need resaving after an edit. A sent BOQ becomes stale and must use the existing revise-and-resend path before issue; do not silently carry prior vendor bids or approvals across a price change. Reject a new price edit once an award for the current approved estimate is pending approval or its basket is issued. Historical enquiries for an older approved estimate do not lock a new approved source. Preserve exact idempotent replays of already completed tender and issue actions.
8. Internal project cost remains separate from approved customer estimate, vendor BOQ, vendor bid, and payable purchase-order values. No project base rate or override metadata appears in vendor-facing/public BOQ payloads. No existing Configuration record, tender history or issued order is rewritten; no migration or backfill is needed.

## Data and API impact

- Add one project-scoped rate record with a unique approved-source-line key and a versioned Save/Clear mutation. Use the existing project procurement authorization pattern, strict Zod input validation, transaction and audit. Register the operation and OpenAPI schema. The response can return the refreshed basket line/effective price or the override version; the frontend invalidates basket list, detail, enquiry and preparation queries affected by its digest.
- Add internal basket-line override metadata needed for the editor (`version`, effective rate/source) without adding visible table text. The default line still comes from pinned Configuration. The backend loads overrides in a batch for the relevant approved source and passes them into the existing canonical Standard calculation path, rather than adding per-line database reads or mutating saved Configuration payloads.
- Keep the existing Special basket and historical unclassified manual-mode workflow. Keep the Configuration editor and its Super Admin route separate.

## Assumptions, risks and controls

- “Price here” means the Base amount per UOM in the screenshot, for explicitly Standard Main Basket lines. The buyer edits the internal project cost basis, not the vendor's quoted rate or the customer-approved estimate.
- A local base edit retains the pinned Sub-vendor low-quantity rule. Only Super Admin changes shared Configuration mode settings in its own workflow.
- Changes after a sent BOQ require an explicit BOQ revision and fresh vendor dispatch; changes during award approval or after issue are locked. This prevents a changed internal basis from being paired with an already approved award.
- Financial rounding and overflow risk is controlled by integer paise and the existing calculator; stale tender risk by the private digest; cross-project leakage by the compound source key; duplicate writes by CAS/idempotency; permission risk by backend route operation and project access checks.

## Acceptance criteria

1. Procurement edits POP's project Base amount from ₹75 to ₹80; at quantity 1 and the saved 10% low-quantity impact, the row shows ₹80 and ₹88 and the basket total/card reconcile. Save survives reload. A second project and shared Configuration still show ₹75 and ₹82.50.
2. Save, update and clear work for the same approved source line. Invalid/negative/overprecision rates, unauthorized role, wrong project/line/basket, stale approved estimate, and concurrent versions fail without changing the saved rate. ₹0 is valid.
3. The four-column table remains simple, including on mobile. Only authorized Procurement users see the inline edit action. Saving shows a pending/error state, preserves keyboard focus, and refreshes list/detail and BOQ readiness. No extra Configuration or mode message appears for a calculable Standard line.
4. The server uses the overridden base plus the pinned low-quantity rule at below/equal/above-limit quantities. The effective rate and override version enter the private preparation digest; draft/sent BOQ mutations reject stale digests, and existing revision flow restores orderability. Vendor payloads contain no internal rate.
5. Special/historical behavior, approved customer amount, vendor bid amount, committed PO amount, and Configuration history remain unchanged. Focused backend unit/replica-set/API tests, frontend rendered tests, typechecks/builds, desktop/mobile visual checks and diff hygiene pass.

## Open decision

No further product choice is required if the above interpretation of “price here” and the sent/award locking rule is accepted. Feedback at this gate can change either before a task plan is written.

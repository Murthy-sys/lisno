# Procurement basket budgeting, vendor bidding, work orders, and package monitor

Date: 2026-10-04  
Status: approved; implemented with partial full-suite verification

## Outcome and decision

Replace the current Procurement project-detail presentation with a main-basket workspace. A buyer opens a basket, checks its approved estimate and saved mode-based working figures, prepares one vendor-neutral bill of quantities (BOQ), invites multiple eligible vendors, compares complete bids, requests counteroffers, selects an award, obtains the required approvals, and issues a work order. The issued order opens a vendor package monitor for contract, site, finance, and alert information.

**Recommended architecture:** add project-and-basket-scoped enquiry, bid, award, and approval records around the existing approved-estimate source and purchase-order commitment service. Keep the current approved purchase order and vendor work assignment as the sole authority for committed vendor work. This changes Procurement and project/authorization surfaces, but does not change Configuration code, screens, records, or calculations.

The four supplied screenshots define the intended information hierarchy and interaction pattern. Their names, prices, percentages, GST/TDS figures, and implied arithmetic are illustrative. Every application amount must be derived from a validated source and reconcile before display.

## Current behavior and evidence

- `frontend/src/features/procurement/ProcurementProjectPage.tsx` renders `PurchaseOrdersPanel` and `VendorWorkProgressPanel` below a project header. The current purchase panel is an estimate tree, mode editor, project-wide request, and legacy individual purchase-order list. There is no basket-card overview, vendor-neutral enquiry, bid comparison, award drawer, or package monitor.
- `backend/src/domain/project-purchase-order-preparation.ts` already projects the client-approved estimate with stable room, main-basket, sub-basket, and main-line IDs, approved quantity/UOM, approved amount, source/version, procurement child IDs, and mode resolution. Grouping by `mainBasketId`, not by label, supplies the new basket overview without a second estimate source.
- `backend/src/domain/project-purchase-order-mode.ts` and `backend/src/services/project-purchase-order-mode.service.ts` calculate `pmc`, `sub_vendor`, and `in_house` from the approved line's pinned saved Configuration revision. A saved Procurement mode decision is per approved main line. No reliable global default mode was found. An unselected line must require an explicit choice. Existing digest-mismatch recovery is a reasoned, unverified procurement decision, not a rewrite of Configuration.
- `ProjectPurchaseOrderModel` and its service own approved net/GST/gross commitments. Approval calls a mandatory transactional hook that creates vendor work assignments. The project-request service also creates approved vendor orders through that authority. New awards must enter this same commitment lineage and must not bypass old overlap, budget, allocation, or vendor-readiness controls.
- The vendor directory has stable vendor IDs, basket classifications, active/readiness checks, and a latest official Procurement KPI score in basis points. It has address text but no structured city. `Project` and `Lead` store free-text `location`, not a reliable city field. A same-city filter cannot truthfully classify historical text without confirmation.
- The existing finance ledger records project expenses and approved-estimate source lineage, but no reliable purchase-order/milestone/payment join or TDS determination was found. The current vendor work service already supplies order-linked site assignments, progress, evidence, and review status. The order monitor may show an actual paid/invoice/TDS amount only when a stable linked record exists.
- There is no `program_manager` role today. The user chose a dedicated Program Manager role with project assignment. The user also chose an equal-weight vendor comparison using KPI and normalized price.

The current mode-aware purchase-order specification is background for pinned revisions, calculator reuse, explicit quantities, observed-digest recovery, and financial separation. This specification supersedes its **Procurement project-detail UI** for new enquiries; historical purchase orders and open legacy requests retain their records and review access.

## Scope and boundaries

### In scope

1. The Procurement project-detail route opens with one card for each distinct approved `mainBasketId` in that project. Each card shows basket name, included main-line count, approved estimate value before GST, configured base cost, adjusted cost, working total, readiness, committed amount, and enquiry/award state. Distinct rooms containing the same basket ID roll into one card; room and sub-basket sections remain visible inside it. Excluded/zero/legacy lines remain inspectable but do not silently enter a BOQ or total.
2. Selecting a card opens `Projects / {project name} / {main basket name}` with a Back control, then goes directly to the main-line modes and BOQ content. The redundant dark basket banner, four-cell budget summary, and its explanatory note are omitted from this detail view. Each included main line shows approved quantity/UOM and the saved mode decision. Where no valid decision exists, the buyer selects `PMC` or `Execution`, then `Sub-vendor` or `In-house`, confirms calculation quantity, and saves through the existing guarded mode-decision operation. Basket totals still recalculate on the backend and remain available on the basket card and line mode displays.
3. A vendor-neutral BOQ package is prepared for the basket from explicitly selected approved source lines. The buyer confirms each vendor-facing description, quantity, UOM, target/date/location, and scope. The approved quantity may be suggested, never automatically ordered. Internal configured costs, margins, customer selling prices, budget overrides, and other vendors' data are not sent to bidders. A sent BOQ has an immutable revision and digest.
4. Searchable, multi-select vendor picker with basket eligibility, official KPI, project-city/same-city/outside-city/unknown-city filters, contact and readiness states. Only eligible active vendors with a usable contact and official KPI can be invited; disabled options explain why. A buyer sends the same frozen BOQ revision to all selected vendors using separate expiring links. The recipient sees and quotes only its own scoped package.
5. A comparison table shows vendor, official KPI, bid revision/status, pre-GST quoted total, GST, gross, price score, and 50/50 comparison score. It highlights one deterministic recommended eligible bid, exposes `Request counteroffer` and `Award`, and requires a reason when awarding another bid. It must never mix bids for different BOQ revisions or partial scopes.
6. `Award` opens a focused drawer with the selected vendor, frozen quote lines and totals, payment schedule, editable advance percentage with derived advance amount, approval requirements, and source/budget exceptions. Award selection alone does not issue an order. The buyer may revise the proposal until submitted; every approval applies to one immutable proposal revision.
7. For an issued amount **up to and including ₹50,000 gross**, one authorized Procurement approval permits issuance. For an amount **above ₹50,000 gross**, the assigned Program Manager, an assigned project Designer, Procurement, and Finance Manager each approve the same proposal revision. No issuance occurs with missing, stale, rejected, or duplicate-role approvals. Existing Super Admin budget override remains additional when required by the approved-estimate commitment policy. The vendor allocation cap and other existing guards remain separate.
8. Issuance atomically records a vendor work order as an approved purchase order, approved-estimate commitment, and vendor work assignments, and changes the package/vendor status to issued. The package monitor has Order, Site performance, Finance, and Vendor alerts tabs. The Order tab shows the exact frozen vendor scope and values, a protected work-order PDF, and an explicit WhatsApp share action for a vendor-authenticated portal link. The Finance tab shows the approved payment schedule, linked actual records, and GST/TDS review state without inventing payments or statutory deductions.
9. Existing approved orders, pending legacy requests, and vendor work remain accessible in a compact history area or route. New package records and orders are distinct from legacy requests; no migration/backfill rewrites historical approved data.

### Out of scope

- Any edit to Configuration, its vendor/mode settings, activation digests, prices, margins, low-quantity rules, or saved revisions.
- Automatically placing an order from a configuration base rate, client estimate rate, or vendor bid before approval; automatic disbursement; bank transfer; automatic WhatsApp transmission; and any real vendor email during local verification.
- Reinterpreting old address text as a confirmed city, retroactively adding KPI ratings, reapproving historical orders, or changing immutable estimate/design approval history.

## Product and calculation contract

### Basket budget and mode lineage

The current approved estimate review round is the baseline. Group by stable basket ID and retain each source-line key, room/sub-basket/main-line ID, quantity, UOM, revision ID/version/digest, and inclusion status. A basket card's approved value is the sum of included approved `amountPaise` before GST. Show already committed approved purchase-order net separately; no browser-side manufactured remaining budget.

For each line, the existing server calculator uses the selected mode's saved base rate and explicitly confirmed quantity, saved low-quantity limit/impact, saved margin/discount rules, and UOM precision. Display `baseCostPaise`, `adjustedCostPaise`, and `sellingPaise` with labels. The basket's **working total** is the sum of ready line `sellingPaise` values, before GST; it is an internal configured selling benchmark, not a vendor payable quote. Show partial counts rather than a misleading complete total if a line is blocked. Do not multiply one main-line benchmark for each procurement child. A later Configuration revision never silently replaces the approved line's pinned revision. The existing unverified observed-content recovery remains visibly labeled and requires its existing reason/acknowledgement at every revalidation boundary.

For a BOQ, validate confirmed vendor-facing quantities against each UOM's precision. A BOQ can select a subset of lines, but all invited vendors in that enquiry receive exactly the same selected lines, quantities, specs, and revision. A bidder supplies a pre-GST unit rate and explicit tax treatment/rate for each line. The backend computes line net, GST, gross, and sums in integer paise using the established purchase-order rounding rules. A bidder cannot change BOQ quantities, source keys, or scope. Any buyer edit to vendor-facing scope after dispatch creates a new revision, supersedes old links, and invalidates comparisons and approvals; old bids stay audit-readable.

### Vendor recommendation

Only complete, current-revision, eligible bids with positive comparable **pre-GST** totals enter the recommendation. Let `Pmin` be the lowest such quote net. For each vendor, `priceScore = 100 × Pmin / quoteNet`, capped at 100, and `comparisonScore = (officialKpiScore + priceScore) / 2`. Perform score arithmetic in integer basis points with a documented rounding rule; show the two components and the final score as a recommendation, not an automatic decision. Tie order is higher comparison score, then lower pre-GST quote, then higher KPI, then stable vendor ID. Snapshot the KPI assessment/version, comparison inputs, and recommendation with the award revision; recalculate and require review if they change before award submission. KPI-unrated, incomplete, expired, withdrawn, or mismatched-scope bids remain visible with reasons but cannot win by this formula.

Counteroffers are versioned requests to one vendor, optionally with a reason/target, followed by a new vendor-submitted bid revision. The prior bid and all communications remain immutable. A counteroffer neither edits the buyer's BOQ nor silently changes an award. Awarding a nonrecommended bid requires a reason and keeps the comparison snapshot.

### Award, tax, and payment schedule

The quote's payable `grossPaise = netPaise + gstPaise` determines the ₹50,000 approval tier. Exactly ₹50,000 is in the Procurement tier; ₹50,000.01 is in the four-approver tier. The existing approved-estimate budget comparison continues to use **pre-GST** commitments, so GST cannot be counted as available margin. The existing unverified-address vendor allocation limit uses its established tax-inclusive basis.

The default schedule follows the screenshot's five named milestones: Advance 20%, Mobilisation 15%, Progress at 50% 25%, Progress at 85% 25%, Final 15%. The buyer can edit advance percentage; its amount updates from the frozen gross order amount, while the remaining milestones are adjusted explicitly so total shares equal exactly 100%. All milestone amounts are server-derived in paise with the final milestone absorbing rounding remainder. Dates/conditions and percentage changes require a new award revision; approval signatures from a prior revision cannot carry over. A schedule is contractual intent, not evidence of payment. An amount field may be displayed and edited as a shortcut only if it round-trips to a valid percentage and the server produces the same exact total; otherwise explain the rounding difference and block submission.

The package monitor's contract net, quoted GST, and gross come from the issued order. Supplier GST registration/GSTIN comes from the vendor profile and is not treated as proof of tax applicability by itself. Invoice total, TDS basis/rate/amount, and net payable appear only after Finance records a versioned, order-linked invoice/withholding assessment with effective-date evidence; otherwise display `Awaiting Finance review` or `No invoice recorded`. No fixed `18% GST`, `1% TDS`, or screenshot amount is used as a default. Tax invoice particulars and withholding rules are time- and fact-dependent; Finance must validate them against the actual vendor and payment date ([CBIC invoice rules](https://cbic-gst.gov.in/gst-invoice-rules.html), [Income Tax transition FAQ](https://www.incometaxindia.gov.in/documents/20117/43120/Updated-FQAs-on-Interplay%26Transitions.pdf/dda21cfd-28be-d931-ad5c-6459ecbd2ea7?t=1775128133037&version=2.0)). Actual paid amounts must come from order/milestone-linked finance entries or a reconciled payment record; matching by vendor name or free-text reference is forbidden. Recording an expense/payment must not double count the project finance ledger.

## Roles, authorization, and decisions

Add a dedicated `program_manager` role and an explicit `programManagerId` project assignment. Extend project initiation/authorized project-assignment paths so a valid active Program Manager can be assigned or changed with an audit entry. Existing projects may have no assignment; above-threshold approval is blocked until one is explicitly assigned. Do not silently map `Project.managerId`, which currently identifies a Design Manager. Extend authorization policies, project scope checks, route-operation registry, OpenAPI inventory, and frontend presentation permissions together.

| Operation | Allowed actor and guard |
| --- | --- |
| Read basket budget/internal modes and manage BOQ/invites | Authorized Procurement on the active project; Super Admin only through its explicit operation-specific grant. |
| Submit vendor bid | Holder of one live vendor-specific, package-revision-scoped link; only that vendor's BOQ and submissions. No internal budget/KPI comparison. |
| View comparison and propose award | Authorized Procurement; vendor eligibility and current source are rechecked on the server. |
| Approve gross ≤ ₹50,000 | Authorized Procurement, one approval on the current award revision. |
| Approve gross > ₹50,000 | Assigned active Program Manager, one explicitly selected assigned active project Designer, authorized Procurement, and active Finance Manager; four distinct actor IDs, each in its own role slot. |
| Exceed approved estimate net commitment | The existing Super Admin budget override with reason, **in addition** to the applicable role approvals. |
| Issue work order | Authorized Procurement after all current approvals and budget/vendor/source guards pass; one idempotent, atomic order commitment. |
| View vendor order | Linked awarded vendor sees only its own issued terms and work; staff views are scoped to their operations. |
| Record invoice/withholding or payment linkage | Finance authority only, with order and milestone IDs, audit, and validation against the issued revision. |

An approver's decision stores actor ID, role slot, timestamp, source proposal revision/digest, decision and reason. Any change to vendor, BOQ, quote, amount, GST, terms, schedule, KPI evidence, or project approver assignment after submission creates a new proposal revision and clears the approval set. A rejection returns the proposal for changes. Pending and issued revisions are immutable. A role cannot approve its own slot from an unrelated project or approve the same revision twice. Required approvals are enforced by backend operations, not visual chips alone.

## City and vendor eligibility

Add a structured, nullable project city captured in project initiation and carried into the project record. For an existing project with only `location`, show `City unconfirmed` until an authorized user explicitly records a city; never parse arbitrary address text into authority. Keep a procurement-owned vendor service-city/coverage record keyed by vendor ID, separate from Configuration's vendor profile. An authorized Procurement user can confirm a vendor's base city/service area in Procurement; do not edit Configuration for this feature. Compare canonical city IDs or normalized confirmed city values, not display strings. Picker filters are `Project city`, `Other cities`, and `City unknown`, with an `All` view and clear project-city label. City affects discovery and recommendation context, not vendor access authorization or price calculation.

Basket eligibility follows the vendor's stable basket classifications and readiness policy. The official Procurement-rated KPI is the visible score; vendor self-assessment is not substituted. Eligibility, contact availability, active status, city confirmation, and KPI are rechecked at invite and award. A city-unknown vendor may still be invited from `All/City unknown` when otherwise eligible; an unknown city is never labeled local or outside.

## Records, API, security, and state transitions

Introduce additive, versioned procurement-owned records for `BasketEnquiry` (project, basket, approved source, selected source lines, BOQ revisions/digests), `VendorInvitation` (vendor, recipient hash, token hash, expiry, delivery and revocation state), `VendorBid` (invitation, BOQ revision, immutable price revisions), `CounterofferRequest`, and `BasketAward` (selected bid, comparison/KPI snapshot, schedule, approvals, work-order/PO link). Use unique indexes for idempotency, active invitation per vendor/revision, current award per package, and issued PO link. Never use names as join keys. Store the work-order PDF as a protected generated representation of the immutable PO revision or an opaque authenticated storage reference.

Recommended transitions:

`draft BOQ → sent BOQ → bids received → comparison → award draft → pending approvals → ready to issue → issued → vendor work in progress/completed`.

An invite may be `prepared`, `sent`, `failed`, `expired`, `superseded`, or `revoked`; a failed/disabled mailer does not leave an active token. Prepare and send must use a safe idempotent delivery pattern with no usable invitation before delivery is confirmed. Generate random high-entropy single-vendor bearer tokens, store hashes only, enforce expiry/rate limiting, revoke/supersede on BOQ change, and never log or return raw links to other vendors. Bid submission must validate token, vendor, revision, scope, quantity, money, and replay idempotency. Vendor-facing responses cannot include internal mode cost/selling, approved client estimate, competing bids, staff approvals, or hidden contact data.

At issue time, in one replica-set transaction: re-read the approved estimate/source identity and preparation digest, saved mode decisions and relevant integrity basis, BOQ and bid revision, vendor readiness/allocation, required approvals, existing commitments/overlap, and project activity; create or link each awarded line to exactly one procurement child with explicit supplier quantity/rate/GST; calculate authoritative PO lines; acquire the existing project commitment fence; create the approved PO revision; call the existing mandatory vendor-work assignment hook; mark award issued; and append audit records. A concurrent issuance or old purchase-order approval for the same scope must yield one winner and one commitment, not two. Existing legacy PO approval endpoints may handle legacy records, but must reject a tender-origin order outside this issuance path. Failed transactions leave no issued status, commitment, or vendor assignment.

The new project/basket read APIs should batch source/configuration/vendor/KPI reads, paginate invitations/bids for large vendor sets, and return explicit loading/stale/error/blocker states. New protected routes are registered in the canonical route-operation policy and OpenAPI inventory. Mutation success invalidates basket budget, preparation, invitation, bid comparison, approval queue, commitments, project finance, vendor work, and package monitor queries that can change.

## Package monitor and delivery

After issuance, a package monitor opens from the basket and its awarded vendor row. The header shows vendor, order number/status, contract gross, payment progress and site progress as **separately labeled** facts. The `Order` tab shows awarded scope, quantities, rates, tax, approved milestone schedule, order/award revision, and secure PDF download. `Site performance` reuses the order-linked vendor work assignment and evidence flow, including pending owner. `Finance` shows contract net/GST/gross, Finance-reviewed invoice/TDS status, schedule, and only explicitly linked actual recorded amounts. `Vendor alerts` shows server-derived pending work, evidence/review, delivery, approval, and finance exceptions with owner and timestamp; no fabricated warning.

`Download work order PDF` requires the same project/vendor authorization as the order and contains only approved vendor-visible terms. `WhatsApp work order` is an explicit staff action that opens a prepared message pointing to the vendor's authenticated order portal; it does not send automatically and does not expose a public PDF, internal budget, or a raw invitation token. If no linked vendor account/contact exists, explain the blocker. Audit the share intent where the backend can verify it; do not claim delivery merely because a WhatsApp window opened.

## UX, accessibility, and compatibility

Use the screenshot's drill-down sequence: basket cards, main-line modes, searchable vendor selector and comparison table, then a focused award drawer and package monitor. Follow the existing Lisno design system and the user's style constraints. Keep labels explicit for `approved estimate`, `configured base/working benchmark`, `vendor quote`, `issued commitment`, and `paid` wherever those figures remain visible. Desktop tables may scroll within their own panel; mobile stacks the card and comparison rows without page-wide clipping. Controls need semantic labels, visible focus, keyboard operation, drawer focus trap/return, accessible status updates, and usable empty/error/stale states. Never keep a visually selected bidder or mode if the server rejected or invalidated it.

The old project purchase-order editing surface is removed from the primary project page. Preserve read-only historical access and a path to finish already-open legacy requests, including their existing Super Admin queue. New tender-origin orders do not inherit the old one-person Super Admin approval as a bypass. Old approved orders keep their historical values, assignment IDs, and finance effects. Additive nullable fields/indexes support historical documents without live backfill. Any later production migration requires its own authorized dry run, backup, rollback, and conflict report. This specification authorizes no seed, live migration, deployment, production messaging, commit, or push.

## Risks and controls

| Risk | Required control |
| --- | --- |
| Basket with same name in several rooms or revisions | Group and join by approved stable IDs and source-line keys; labels are presentation. |
| Internal configured benchmark mistaken for vendor payable | Separate amount labels, backend-owned formulas, vendor-neutral BOQ, and vendor-specific quoted rates. |
| Missing/altered Configuration digest or missing mode | Show a blocker or existing reasoned recovery; never alter Configuration or silently fall back to another revision. |
| Duplicate awards, old/new order overlap, or threshold bypass | Versioned award state, unique/overlap constraints, project commitment fence, transactional issuance, and origin-specific route guard. |
| Missing Program Manager on an older project | Explicit audited assignment before above-threshold approval; no automatic role mapping. |
| False same-city match | Confirmed structured project/vendor cities and an unknown bucket; never infer from address fragments. |
| Invitation link leak or delivery failure | Hash and scope token, short expiry, revocation, no token logs, disabled-mail preflight, vendor-isolated payloads. |
| Partial bids compared as cheaper | Full frozen BOQ coverage check and same-revision comparison only. |
| Stale approvals after a bid/schedule/source change | Immutable revision digest and approval reset, checked again inside issue transaction. |
| Tax or paid amount invented from screenshot | Finance-reviewed tax/invoice facts, explicit ledger/order links, pending state when absent, reconciliation checks. |
| Replacing the current UI hides open work | Legacy history and completion path stay discoverable; issued work remains accessible in vendor/project views. |

## Acceptance criteria

| ID | Observable result |
| --- | --- |
| AC1 | A Procurement user opens an approved project and sees one card per stable main-basket ID, including same-named baskets correctly separated and a breadcrumb/back path into a basket; cards reconcile included approved values, item counts, mode readiness, and commitments. |
| AC2 | A basket shows every relevant room/sub-basket/main line and its saved PMC or Execution/Sub-vendor/In-house calculation. A missing choice is selectable and reuses the pinned calculator; low-quantity impact and margins match Configuration with no Configuration write. Missing/digest-mismatched lines show an honest blocker or reasoned recovery. |
| AC3 | Buyer-confirmed BOQ quantities/specs create one immutable vendor-neutral revision. Selected eligible vendors receive separately scoped temporary links; each sees only its own BOQ and can submit a complete line-by-line quote. Failed/expired/superseded links cannot submit and expose no internal rates. |
| AC4 | Search and city filters distinguish confirmed project-city, outside, and unknown vendors, show official KPI, and explain inactive/unrated/contact blockers without inferring location from free text. |
| AC5 | The comparison table uses only complete current-revision bids and shows KPI, net quote, GST/gross, normalized price score, equal-weight score, deterministic recommendation, counteroffer history, and an explicit nonrecommended-award reason. |
| AC6 | The award drawer displays the chosen immutable bid and a 100% payment schedule; changing advance recomputes paise amounts and proposal revision. At exactly ₹50,000 gross Procurement may approve/issue; at ₹50,000.01 all four distinct assigned roles must approve the same revision. A change or rejection invalidates prior approvals. |
| AC7 | Issuance rechecks source, budget, vendor and approvals, then records exactly one approved PO commitment and vendor work assignment atomically. Concurrent issue/legacy approval cannot double commit; the vendor's status and order access update. Existing Super Admin budget-override and allocation controls still apply. |
| AC8 | The issued package monitor shows the exact awarded order, distinct site/payment progress, protected PDF, explicit WhatsApp share action, site evidence, Finance schedule and linked actuals, and real alerts. Missing invoice/TDS/payment evidence displays pending/unknown rather than fabricated numbers. |
| AC9 | Historical POs and in-flight legacy requests remain reachable. Desktop/mobile rendered tests cover navigation, tables/drawer, keyboard/focus, stale/error/permission states; backend unit and replica-set tests cover arithmetic, token isolation, approval boundaries, concurrent issuance, and two unequal projects' finance reconciliation. Typechecks, builds, focused suites, and integrated verification pass. |

## Resolved decisions and implementation assumptions

- **Program Manager:** add a dedicated role and project assignment, as selected by the user. Do not alias Design Manager.
- **Recommendation:** equal weight: 50% official Procurement KPI and 50% price score normalized to the lowest complete pre-GST bid, as selected by the user.
- **Threshold boundary:** `grossPaise <= 5_000_000` uses Procurement approval; `grossPaise > 5_000_000` uses four role approvals. This resolves the unspecified exactly-₹50,000 case without a gap.
- **One basket package:** start with one active enquiry per project/main basket and frozen selected scope. Further scope requires a separately versioned package/amendment with explicit non-overlap checks. A basket may still display several historical orders.
- **Tax display:** the screenshot's GST/TDS percentages are visual references only. The issued order's quoted GST is factual; invoice/TDS/payments require Finance-linked evidence before numbers appear.

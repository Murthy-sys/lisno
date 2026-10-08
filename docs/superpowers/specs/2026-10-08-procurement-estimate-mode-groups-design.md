# Procurement baskets grouped by approved estimate mode

## Goal

In Procurement → Projects → Project → Items/Main baskets, organize the basket cards into In-house, Sub-vendor and PMC sections following the supplied screenshot. Derive membership from the item type and pricing mode selected for each line in the approved estimate:

| Approved estimate selection | Procurement display group |
| --- | --- |
| Standard | Sub-vendor |
| Special + Sub-vendor | Sub-vendor |
| Special + In-house | In-house |
| Special + PMC | PMC |

The classification is per approved source line, including its room identity. A Main Basket containing lines in different modes appears in each applicable section, with disjoint line counts and amounts. The underlying basket, procurement records and work orders retain their existing stable IDs.

User clarification on 2026-10-08: each Main Line may independently use any allowed item type/mode under the same Main Basket, and existing functionality must not change. This is a display grouping, never a basket-wide selection rule or restriction. The same Main Basket may contain Standard, Special PMC, Special In-house and Special Sub-vendor lines simultaneously.

## Current behavior and evidence

Read-only investigation on 2026-10-08 found a clean working tree before this specification was created.

- `frontend/src/features/procurement/ProcurementProjectPage.tsx` renders `ProcurementBasketWorkspace` at `/procurement/projects/:projectId`. The existing basket drill-down is selected by the `basket` search parameter.
- `ProcurementBasketWorkspace.tsx` currently renders one flat list, without search, mode groups or grid/list controls. Cards show the approved estimate amount, current internal procurement cost, included line count and committed net amount. They open the existing basket detail, scope and enquiry flow.
- Estimation already saves line-level `classification` and `pricingMode` from `LeadEstimateWorkspace.tsx`. `ConfiguredEstimateBuilder.tsx` provides the Standard/Special controls and Special mode choices. Standard references Sub-vendor by default.
- `backend/src/models/Estimate.ts` and `services/estimate-client-review.service.ts` persist/publish these fields into the estimate review snapshot.
- The approved source reader in `backend/src/services/procurement.service.ts`, specifically `ApprovedProcurementSourceLine` and `approvedSnapshotLines`, currently omits both fields. It retains the older `selectedMainBasketClassifications` separately.
- `project-purchase-order-preparation.service.ts` passes only the older basket classification into preparation lines. `domain/procurement-basket-projection.ts` groups by stable Main Basket ID and requires one consistent basket classification. Therefore the present list cannot distinguish approved Special modes within a basket.
- Procurement has its own saved `ProjectPurchaseOrderModeDecision` and current Configuration pricing/readiness rules. Those decisions are separate from the estimate's selected mode. Reusing `line.mode.decision` as the grouping source would not meet the requested estimate-based mapping.
- `services/procurement-basket.service.ts` reads the preparation and approved order commitments within an authorized Mongo snapshot transaction. The list response strips detailed lines. Group summaries must be projected here, without fetching every basket individually in the browser.
- The existing 17 optimized photos and deterministic decorative resolver from the Main Baskets chooser can be reused. Unknown labels and image failures already have a static skeleton convention.
- Existing coverage includes `estimator-configured-procurement.test.ts`, `procurement-basket-domain.test.ts`, basket route tests, preparation/mode/tender replica-set tests and `ProcurementBasketWorkspace.test.tsx`.

## Scope and boundaries

This is a substantial frontend/backend read-model change with financial reconciliation risk. It adds the grouped overview and carries approved estimate mode metadata through the current approved-source read path.

Included:

- Approved line mode resolution and explicit historical/missing-data handling.
- Backend grouping and aggregate values, additive list/detail metadata, synchronized frontend types and OpenAPI.
- Compact collapsible mode sections, basket photos, name search, functional filters and grid/list presentation.
- A small read-only estimate-mode label on basket detail source lines, so users can distinguish different modes within a shared basket.
- Regression coverage for mode provenance, split baskets, money/count reconciliation, retained navigation and permissions, and responsive/accessibility verification.

Outside this request:

- Changing Estimation choices, approved snapshots, customer prices or approved amounts.
- Automatically creating or rewriting Procurement mode decisions, changing its pricing formulas, project-rate overrides, vendor eligibility, BOQ readiness, tender digests, bidding, award approvals or issued orders.
- Dividing one basket into new commercial packages or silently limiting a basket-wide enquiry to the mode card that was clicked.
- Changing Procurement navigation permissions, project eligibility, shell/header, Messages, Project status, critical counts or other project screens.
- New photo generation, upload support, dependencies, schema migrations, backfills, production writes, external invitations/messages, commits or deployment.

The distinction between overview grouping and Procurement commercial decisions is deliberate: this request controls where approved estimate items appear. Existing commercial workflow remains authoritative for cost and order readiness.

### Explicit preservation constraint

Do not change current item selection, Main Line/type/mode controls, save payloads, defaults, calculations, handlers, permissions, approvals, vendor choices, BOQ composition or work-order logic. Preserve source-line and basket identity exactly. Existing function signatures and commercial DTO fields should remain unchanged wherever possible; new read-only display metadata must not alter their semantics. UI search/filter/view/collapse state is presentation-only and cannot change selected items or action scope. Any implementation discovery that would require a commercial behavior change is outside this specification and must be surfaced before such a change.

## Recommended approach and tradeoffs

Add mode-group projections alongside the existing canonical basket list. Partition approved source lines before aggregating their card values. Keep the current basket detail identity and workflow.

This supports mixed modes correctly without cloning baskets or rewriting tender lineage. A single basket-level mode or a “Mixed” card would lose the requested per-line mapping. Creating new persisted baskets/packages per mode would require a broader tender and issued-order migration and is not justified by this request.

## Mode source and compatibility rules

1. Read only the canonical approved estimate snapshot already selected by `procurementItemSourceSnapshot`, including estimate ID, version and review-round ID. An edited/unapproved estimate must not move cards or change approved figures.
2. Preserve the original line-level `classification` and `pricingMode`, validating allowed enum values. Do not resolve them from catalogue names, current Configuration mode availability, manual rate overrides or Procurement mode decisions.
3. Explicit line Standard maps to Sub-vendor when pricingMode is absent or Sub-vendor. A contradictory stored Standard + PMC/In-house pair is a source issue requiring review, not permission to silently select either interpretation.
4. Explicit line Special with a valid mode maps to that mode. Special without a recorded mode remains visible in a conditional “Mode not recorded” section. Do not silently default it to Sub-vendor.
5. For historical configured lines without either line-level field, an explicit approved legacy basket Standard classification may map to Sub-vendor, with provenance retained as a legacy basket default. Legacy Special alone does not identify an execution mode.
6. Other incomplete historical records, including a mode without a reliable type, remain in “Mode not recorded”. Invalid enum values or contradictory values produce explicit source issues under the existing fail-closed lineage policy. Never borrow a value from another line, room, project, estimate version or revision.
7. Apply the same rules to temporary items when their approved snapshot contains valid selection metadata. Unselected lines and zero-value reference lines keep the existing visibility/actionability policy; they do not contribute to actionable counts, cost totals or readiness denominators.
8. Each actionable source line belongs to exactly one group. Different room occurrences remain separate by source key. Same-named baskets with different IDs remain separate. A mixed basket may appear under several modes, but no source line or amount is counted twice.

Historical compatibility affects display only. Existing manual-mode recovery remains available for older records and is not automatically converted into the new estimate mapping.

## Data and API impact

Extend the source/preparation read shapes with optional approved line classification and pricing mode, retaining absence rather than fabricating stored values. Add an explicit display-mode resolution carrying the resolved mode, provenance (`line`, `legacy_basket`, or `unrecorded`) and any missing-data explanation.

Extend the existing basket-list response additively with mode groups. Each group contains its mode key, basket subset summaries, included-line count, BOQ-ready-line count and aggregate monetary values. A subset summary references the existing Main Basket ID plus the relevant source-line keys; the UI key is the tuple of basket ID and display mode, not a new persistent ID. The canonical `baskets` list remains available for current detail lookup and other consumers.

Add the read-only estimate-mode metadata to basket detail lines. Keep existing `classification`, `automaticSubVendor`, `standardCost`, `mode`, project-rate values and commercial behavior intact. Do not rename an estimate mode to a Procurement decision or include display-only fields in existing tender/preparation digests.

Compute grouping, counts, money and readiness aggregates on the backend in the existing authorized snapshot transaction. No N+1 detail queries, GET-created mode decisions, additional collections or writes. Keep response identity/version checks and private cache policy. If grouped data is unavailable or structurally incompatible, show a refresh/error state; do not manufacture mode assignments in the frontend.

Update the OpenAPI basket schemas and the frontend API types together. No new route operation or permission is required; keep the canonical authorization registry and route inventory synchronized if a necessary contract adjustment touches their declared schemas.

## Financial presentation

The screenshot's figures are illustrative. Render only values traced to the backend:

| UI label | Meaning |
| --- | --- |
| Approved estimate | Sum of the subset's immutable approved line `amountPaise`, excluding GST |
| Current cost | Sum of those same lines' current internal Procurement adjusted costs, using the existing standard-cost or saved-mode rules |
| Committed net | Existing approved non-cancelled order net commitments linked to the subset's source keys; available as secondary text/details |
| Ready for BOQ | Count-based readiness from the existing backend line BOQ eligibility checks, not physical work completion |

Use integer paise and guarded summation. Group/subset totals must reconcile to the canonical basket/project totals for the same included source lines and approved source. Do not copy the whole basket amount into each mode card.

Current cost retains its existing meaning even if a later Procurement commercial choice differs from the approved estimate mode. Make that distinction available in concise helper text and detail labels. This grouping change must not silently reprice lines or adopt the estimate's selling rate as a procurement cost.

If any included line has unavailable cost, return a nullable aggregate and completeness information. Show “Incomplete” and the affected count rather than a partial sum presented as complete or a fabricated ₹0. A valid zero current cost remains ₹0. Do not infer “Not started”, “Approved work” or site completion from price availability alone.

The optional percentage question was presented during specification discovery. Proposed default if no preference is supplied: label the bar “Ready for BOQ”, using the backend's `boqReadyLineCount / includedLineCount` and rounded percentage. Sum line counts before calculating group percentages; never average basket percentages. For zero included lines show an empty state without a percentage. Do not label this “% complete” or calculate completion from approved estimate/current cost.

## UX and visual requirements

### Overview

- Keep the current project header, breadcrumb and surrounding navigation. Change the Main baskets content region.
- Render sections in the screenshot order: In-house, Sub-vendor, PMC. Show “Mode not recorded” only when needed. The subtitle explains grouping by approved estimate selections rather than asserting that work has actually started.
- Each section header has its mode label, basket count, approved-estimate/current-cost aggregates and the specified readiness indicator. All three normal sections are discoverable; an empty section uses a compact “No items in this mode” state. Defaults: populated sections expanded, empty sections collapsed.
- Use accessible disclosure buttons with `aria-expanded` and connected panel IDs. Collapsing affects presentation only.
- Within populated groups, use compact horizontal image cards following the reference: photo on the left, real basket name and included-line count, precise monetary labels, compact status when needed, and one clear open action.
- Four cards per row when width supports them, two on intermediate screens, one on narrow mobile. Aim for roughly 130–150 px card height, with content-driven growth for long names and amounts rather than clipping.
- Reuse the existing category thumbnails through a shared decorative resolver. If moving that resolver to a shared location, preserve Estimation's behavior. Unknown categories and image errors use a static neutral skeleton, with reserved image space and empty alt text.
- Follow existing typography, olive/neutral surfaces and restrained borders. Use inline SVG for simple symbols. No new icon library, shadows, gradients, hover motion or excessive empty padding. Distinguish groups with labels and modest accents; do not rely on color alone or introduce the screenshot's pastel purple as a new product palette.

### Search, filters and view controls

- Add an accessible Search baskets field using local trimmed, case-insensitive name matching. Preserve stable catalogue ordering within each mode.
- A working Filter control provides mode and readiness filters, with a visible reset action. Default is all modes/all readiness states. Do not add an inert mock control.
- Grid/list controls switch presentation of the same source data, retain filters/search, expose pressed state and remain keyboard accessible. Default to the grid layout from the screenshot.
- Header aggregates remain the full unfiltered mode totals, with filtered counts clearly labeled “X of Y baskets” when applicable. Search must not create the impression that project amounts changed. Empty search results and an empty approved project have different messages.
- Preserve search, filters, view choice and expanded groups when opening a basket and returning within the same project; reset on project change. Do not store business values in these UI preferences.

### Opening a card

- Open the existing basket by its real basket ID, retaining direct links and browser Back behavior. A mode card is a view of a subset, not a new procurement package.
- The existing detail shows the whole basket, with a clear “All approved lines” scope description when that basket has mixed estimate modes and a read-only estimate-mode label for each line. This makes the broader scope explicit before any existing enquiry action.
- Preserve all existing scope editors, saved rates, source freshness guards, enquiry selection, tender history and issued packages. Do not filter the `basket.lines` object passed to mutation components or imply a mode-only BOQ will be sent.

### States and accessibility

- Keep authenticated/denied, loading, stale source, error/retry and source-mismatch states. A stale or invalid approved source cannot become actionable merely because a cached group card renders.
- Preserve native controls, visible focus, logical heading/reading order and clear accessible names for same-named baskets in different groups.
- Support long basket names, large rupee amounts, unknown photos, incomplete values, mixed modes, empty sections, keyboard operation and narrow viewports without page-level horizontal overflow.
- No new animation is required. Skeleton thumbnails for permanently unknown categories must not announce indefinite loading.

## Permissions, side effects and rollback

| Actor/state | Behavior |
| --- | --- |
| Existing actor authorized for the project's Procurement workspace | Can read the grouped overview and existing detail |
| Actor without the current project/route permission | Existing backend denial; no source data exposed |
| Actor with read access but no commercial mutation permission | Group/search/filter are usable; existing mutation restrictions remain |
| Stale/mismatched approved source or revoked access | Preserve existing refresh/denial and mutation freeze behavior |

Grouping/search/filter/collapse/view changes cause no persisted writes, emails, audit events or mode decisions. Existing mutations retain their audit/CAS/idempotency and query invalidation behavior. Refreshed basket queries update groups from the same approved source and latest permitted procurement cost/readiness data.

No data migration or backfill. Rollback is the additive projection/API/UI change; approved snapshots, Configuration, saved decisions and order records remain untouched. The approved snapshot remains authoritative when newer editable estimates exist.

## Acceptance criteria and verification

1. Standard maps to Sub-vendor and Special maps to each selected mode from the approved line snapshot. Newer unapproved edits and unrelated Procurement decisions cannot move the grouping.
2. One basket containing all three modes produces three subset cards with disjoint source keys. Same-named baskets, duplicate Main Lines in different rooms and unequal projects remain correctly isolated.
3. Historical explicit Standard defaults and unrecorded Special/legacy modes follow the compatibility rules. Missing or invalid values never silently select another mode.
4. Backend group counts and integer-paise amounts reconcile exactly to canonical actionable line totals. Incomplete values remain explicit; no fabricated completion/cost or duplicated commitments.
5. The new overview follows the screenshot's grouped compact photo-card composition, with four/two/one responsive columns, skeleton fallback, working search/filter/grid/list and accessible collapse controls.
6. Each Main Line remains independently selectable with its existing allowed type/mode choices within the same Main Basket. Opening any subset retains the existing basket ID and every item in the full commercial workflow, with clear scope and per-line estimate-mode labels. Existing handlers, decisions, defaults, calculations, project rates, tender/preparation digests, immutable artifacts and permissions are unchanged.
7. Final integrated verification covers source projection and approval lineage, basket domain/API contracts and role denial, financial reconciliation using at least two unequal projects, replica-set preparation/tender compatibility, and rendered frontend interactions.
8. Frontend/backend typecheck and build pass, relevant focused tests pass, `git diff --check` passes, and final browser checks inspect desktop, intermediate and 390/320 px mobile widths. Test all three modes, mixed basket, missing mode, empty results, incomplete cost, stale source and image failure; run a focused accessibility scan and inspect screenshots.

Exact dependency-ordered commands and ownership will be documented in the separate task plan after specification approval. No lint pass may be claimed because the repository has no lint script.

## Risks, assumptions and open decisions

- Primary risks: accidentally using mutable estimate data, counting a mixed basket repeatedly, confusing estimate modes with Procurement decisions, changing commercial digests through an additive DTO field, and showing misleading completion/financial labels.
- Confirmed scope from the user's clarification: this request changes the overview grouping and appearance only. Each Main Line remains independent within the basket. It does not authorize automatic adoption of estimate modes into commercial Procurement decisions, changing selection/calculation behavior or splitting existing tenders.
- Assumption: category photos and default skeletons from the immediately preceding Main Baskets work should be reused here.
- Resolved default: the approved specification uses explicitly labeled BOQ readiness for the percentage bar. It does not represent physical completion or an amount ratio.
- User-facing labels intentionally clarify “Approved estimate” and “Current cost”; they must not be shortened into a misleading claim of work-order approval or physical completion.

## Status

The specification and separate task plan were approved on 2026-10-08, and the user selected Mode A. Local implementation, independent integrity review and integrated verification are complete: 496 targeted tests, both workspace typechecks/builds, repository hygiene and responsive browser checks passed. Evidence and remaining limitations are recorded in the [task plan](../plans/2026-10-08-procurement-estimate-mode-groups.md). No migration, deployment or production/external action was performed.

# Compact Procurement project basket

Date: 2026-10-05  
Status: proposed  
Reference: user-supplied image of a Painting scope table beside a four-stage vendor enquiry panel.

## Goal and recommendation

Make the opened basket within **Procurement → Projects** feel like one simple working component: a concise scope and working-total panel beside an enquiry panel with visible vendor search and a four-stage progress indicator. Recompose the existing basket detail and enquiry components. Keep the current backend calculations, BOQ requirements, vendor eligibility, bid comparison, approvals, and issued-order flow as the source of truth.

## Current behavior and evidence

- `ProcurementProjectPage.tsx` renders `ProcurementBasketWorkspace` for an approved project. The workspace opens a selected main basket by stable basket ID in the `basket` URL parameter and retains a breadcrumb/back path.
- `ProcurementBasketDetailView.tsx` currently stacks a large **Main lines and modes** section above `ProcurementBasketEnquiry`. The latter stacks a separate BOQ editor and, after a draft exists, a vendor picker hidden inside a directory dropdown. Bid comparison and the issued monitor appear farther down the page.
- `procurementBasketApi.ts` already supplies approved lines, saved mode previews, a basket working total, candidate vendors with city/KPI/eligibility, enquiry status, and bid count. `ProcurementProject` supplies the project name, but not the client name shown in the image. A generic editable working-rate field is not in the basket contract; mode changes use the existing preview/save operation.
- The relevant basket files and the earlier procurement spec/plan are currently untracked work in a dirty repository. They must be preserved and edited only within this approved scope.

## Scope and UX requirements

1. Apply the new composition to an **opened main basket** on `/procurement/projects/:projectId`. Keep the project list and basket selection navigation intact.
2. On wide screens, put a compact scope table on the left and the enquiry workflow on the right. On narrow screens, stack them in reading order with no page-wide horizontal overflow. Use the existing Lisno visual language with restrained borders, dense but legible rows, and clear focus states. Do not copy the image's sample values, emoji, or colors mechanically.
3. The left header shows the basket name, project name, and clearly labeled **working benchmark**. Rows show the approved source description with room/sub-basket context, quantity, unit, and the saved mode's server-computed working amount. A missing or invalid mode displays its real blocker. The existing mode preview/save controls remain available from the relevant row through a concise **Choose/Review mode** action.
4. The footer displays the server-provided basket working total only when it is complete. When incomplete, show **Incomplete** and the reason instead of a partial figure presented as final. Keep approved-estimate money distinct from working benchmark, vendor quote, order commitment, and paid money.
5. The right panel has four labeled stages: **Enquiry**, **Bids**, **Comparison**, **Awarded**. Highlight the actual stage from existing enquiry, bid, award, and issued-order state; the indicator must not advance merely because the user clicked it. Keep sent-revision, delivery retry, counteroffer, approval, history, and issued monitor paths reachable.
6. In the Enquiry stage, show the vendor search, city filter, candidate rows, checkboxes, KPI, eligibility blockers, and selection count directly in the panel. Preserve pagination for large directories. Show the required vendor-facing BOQ fields in a compact, expandable editing area; a vendor invitation can be sent only after the existing BOQ draft and source/mode guards are satisfied. No quantity, target date, delivery location, or scope is silently invented.
7. Preserve existing draft/save/send/revise actions and their API semantics. Give direct feedback for loading, empty results, failed queries, disabled mail, dispatch success/failure, stale estimate, and insufficient permission. Do not show fake vendors, KPI, price, or successful delivery.
8. Use semantic table or equivalent row relationships, labeled inputs, keyboard-operable stages and controls, visible focus, accessible status messages, and a reduced-motion-safe presentation. The reference does not require decorative animation.

## Assumptions and non-goals

- The image is a layout and information-hierarchy reference for the selected basket, not a request to hardcode Painting, sample vendors, client identity, prices, or a direct freeform rate override.
- The displayed line amount comes from `line.mode.preview.sellingPaise`; the basket total comes from `workingTotalPaise` only when `workingTotalComplete` is true. The image's editable **Rate ₹** cell becomes the existing saved-mode review action because a direct rate edit would create a new financial contract.
- The project name is the subtitle unless an already-authorized existing data source provides a client label. No new client data is fetched solely for this layout.
- Backend formulas, DTOs, permission rules, mail behavior, stored records, Configuration, historical purchase orders, and public vendor pages are outside this request. No migration or external action is needed.

## Data, state, and risks

- Continue joining by project ID, basket ID, and source line key; names remain presentation only. React Query keys and mutation invalidations must continue refreshing basket, enquiry, candidate, comparison, and preparation data as appropriate.
- No current enquiry or a `draft` maps to Enquiry; `sent` with no bids maps to Bids; `sent` with bids or `award_pending` maps to Comparison; `issued` maps to Awarded. Cancelled and earlier enquiries retain an explicit path. The stage is a presentation of server state, not a replacement state machine.
- Main risk: the compact panel could hide required BOQ fields or blockers. The send action must remain blocked with a visible explanation until the same current-source validations pass. Another risk is mistaking the internal working benchmark for a vendor payable amount; labels must remain explicit.

## Acceptance criteria

1. Opening a basket presents the reference's two-part hierarchy at desktop width and a clear stacked layout on mobile. Breadcrumb/back navigation still selects the correct stable basket, including duplicate basket names.
2. Every included line retains its source context, quantity/unit, saved-mode status, and authoritative amount. Missing modes and stale source data remain visible and prevent invalid actions. The displayed working total matches the server value or says **Incomplete**.
3. The Enquiry panel shows searchable, city-filtered, paginated vendors with real KPI and eligibility status without opening a dropdown. Multi-selection and dispatch preserve vendor IDs and the existing BOQ revision/digest rules.
4. BOQ creation/revision, invitation delivery/retry, bids/comparison, award approval, issued monitor, and historical access remain reachable. The four stages reflect actual server state, including failed and pending states.
5. Focused rendered tests cover the layout's content and interactions, keyboard and accessible names, empty/error/stale states, and narrow width. Frontend typecheck/build, browser visual check, and repository diff checks pass after implementation.

## Open decisions

None required for this visual simplification. If direct editable rates or a client-name subtitle are intended, that is a separate data/financial-source change and should be specified before implementation.

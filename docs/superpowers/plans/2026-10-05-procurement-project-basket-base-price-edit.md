# Project-only Procurement Base amount edit: task plan

Date: 2026-10-05
Specification: [Project-only Base amount editing in Procurement Main Basket](../specs/2026-10-05-procurement-project-basket-base-price-edit-design.md), approved by the user.
Status: Approved; implementation mode A

## Outcome and contract

Procurement can edit a Standard Main Basket line's Base amount per UOM for this project. The effective rate and low-quantity-adjusted Total come from the server. Configuration, approved estimate, vendor BOQ/quotes and issued orders remain distinct and unchanged. The four-column table gains a compact inline Edit/Save/Cancel control only in the Base amount cell; no provenance or mode row is added.

Before writers start, the parent locks one additive API contract: a line returns `projectRate: { version: number; overridePaise: number | null }` (version 0 with no record) beside its effective `baseUnitRatePaise`; one protected `PUT /procurement/projects/:projectId/baskets/:basketId/base-rate` mutation accepts `sourceLineItemKey`, `baseRatePaise: number | null` (null clears), `expectedVersion`, exact approved estimate source, current basket digest and an idempotency key. The response returns the saved project rate/version. The backend remains authoritative for calculation, eligibility, and freshness.

The current worktree contains extensive dirty, authorized work, including untracked basket files. Capture the exact dirty-path set and per-target baseline before any writer; inspect each target's current contents. No agent may revert, stage or reformat unrelated changes. Writers are not alone in the codebase.

## Dependency-ordered tasks

### 1. Baseline and contract lock — parent

- Record dirty paths and relevant target diffs; identify the approved source identity, source-line key, explicit Standard classification, pinned revision/UOM, existing basket digest and tender statuses. Confirm the input/output shapes above with both owners.
- Define failure codes for wrong project/line/basket, missing valid pinned settings, stale approval/digest/version, unavailable permission, and price overflow. Preserve the current whole-basket `boqReady` rule and exact idempotent replay semantics.
- **Acceptance:** backend and frontend owners share the same paise, version, source identity and query invalidation contract before implementation.

### 2. Project rate persistence and mutation — backend owner, after task 1

**Owned area:** all required `backend/` files for this feature, including a project rate model/receipt and indexes, validation/calculation domain, project source service, price mutation service/router, route-operation registry and authorization tests, audit action, OpenAPI, and focused backend tests. The owner must coordinate before editing any file outside this area; no frontend writes.

- Add a unique project + approved estimate ID/version/review-round ID + Main Basket ID + source-line key record. Preserve version through Clear by storing a nullable override rather than deleting the row. Save actor/timestamps; use a transaction, expected version/CAS, an idempotency receipt, project access and `procurement.purchase_orders.manage`; append an audit event with old/new rate and stable source identity.
- Revalidate the current approved, included, explicitly Standard configured line and its pinned revision/UOM. Reject writes for award-pending or issued enquiries of the current approved estimate source; older approved sources cannot lock a new source. Allow a sent enquiry to become stale so the existing revise-and-resend operation can be used; do not mutate prior invitations/bids/awards during a base edit. No Configuration/estimate/vendor model write.
- Batch-read current project overrides with the approved source. Apply only the base-rate override before the canonical pinned Sub-vendor low-quantity calculation; retain the pinned limit/impact and approved quantity. Preserve valid ₹0 rates and digest-mismatch orderability. Add effective rate/override version to the private basket preparation digest and internal line response. List/detail/card/footer/BOQ readiness must agree.
- Keep vendor-facing BOQ and public schemas free of internal rates. Register the route in the canonical operation and OpenAPI inventories; retain Configuration permissions for Super Admin only.
- **Acceptance:** ₹75→₹80 yields ₹88 at quantity 1 and 10% impact; update/clear/reload work; two unequal projects with the same line IDs remain independent; stale/concurrent/idempotent and authorization cases behave deterministically; a rate change invalidates a draft/sent BOQ digest and revised BOQ works; Special and historical lines cannot receive an override.

### 3. Inline Base amount editor — frontend owner, parallel with task 2 after task 1

**Owned area:** `frontend/src/features/procurement/procurementBasketApi.ts`, basket scope/detail/workspace UI, their focused tests and basket CSS, and synthetic procurement QA fixtures. No backend writes. Ask the parent before touching other paths.

- Type the agreed `projectRate`/mutation response and submit integer paise parsed from a rupees input with at most two decimals. In explicitly Standard actionable rows, show a compact accessible Edit action in Base amount only for users with `procurement.purchase_orders.manage`. Edit state contains labelled rate-per-UOM input and Save/Cancel; when an override exists, offer a small Use Configuration price action. Keep Qty and Total read-only server results and retain exactly four columns.
- Use current approved source/digest and override version on save. Disable duplicate submits; show a concise validation/server error without replacing the saved amount. On success, close edit state, restore focus and invalidate basket list/detail, enquiry and purchase-order preparation queries. Reflect draft/sent BOQ stale state and existing revision flow; lock while award is pending or issued. Special/historical rows keep current mode workflow.
- **Acceptance:** rendered tests prove Save, update, clear, invalid input, concurrent/error response, permission hiding, no extra row text, accessible keyboard/focus, refreshed card/table/footer, and narrow-width layout. The frontend never computes the authoritative adjusted Total.

### 4. Integrated integrity review — parent, after both owners finish

- Reconcile backend DTO/OpenAPI/frontend types and inspect every task diff against the captured baseline. Trace approved source → pinned settings → project rate → canonical low-quantity total → private digest → BOQ update/send/issue. Verify Configuration and approved estimate are untouched; internal rate never reaches a vendor/public payload.
- In approved parallel mode, run an independent `integrity_reviewer` after writers finish. Resolve confirmed finance, authorization, stale-version, race or cross-project findings before final verification.
- **Acceptance:** no confirmed contract or financial-lineage defect remains.

### 5. Final verification and handoff — verification runner after task 4

- Backend: focused calculation/projection, route/authorization/OpenAPI and replica-set persistence/concurrency/tender tests, then `npm run typecheck` and `npm run build`. Use two asymmetric projects and explicit zero/limit-boundary cases. Document the already known unrelated tender approval-queue test failure if the broader suite is run.
- Frontend: focused basket interaction/API fixture tests, then `npm run typecheck` and `npm run build`; rendered desktop and 390 px mobile checks of edit/save/clear, four-column layout, keyboard/focus, error state, console/network and accessibility. No real vendor delivery.
- Run `git diff --check`, whitespace checks for untracked target files, and final status. Report exact commands/results, unrun checks and generated QA artifacts. Do not seed, migrate, backfill, stage, commit, push, deploy or mutate production.

## Safe parallel work

After the parent locks the additive contract, one backend owner may work through task 2 while one frontend owner works through task 3 using mocked contract responses. Their files do not overlap. The parent owns contract changes and shared documentation. Integrity review waits for both writers, and final verification waits for review fixes. The repository's execution-mode gate must be answered before any implementation agent is spawned.

## Specification trace

| Acceptance criterion | Tasks | Evidence |
| --- | --- | --- |
| AC1: project-only rate and ₹75→₹80→₹88, other project/Configuration unchanged | 1–4 | Asymmetric replica-set source and rate tests; rendered card/row/footer assertions |
| AC2: Save/update/clear, validation, permissions, CAS and idempotency | 2–4 | Route/service replica-set and frontend mutation/error tests |
| AC3: four-column accessible inline edit and refreshed state | 3–5 | Rendered interaction and desktop/mobile visual checks |
| AC4: pinned low-quantity math, private digest, fresh BOQ and no vendor leak | 2, 4, 5 | Boundary and stale-tender tests; public payload assertions |
| AC5: Special/historical, estimate/PO/Configuration preservation and build quality | 2–5 | Cross-flow regressions, typechecks/builds, diff hygiene |

# Configuration Main Baskets in vendor classification

## Goal

Show the current Main Baskets from Configuration when Procurement adds or edits a vendor. If a needed Main Basket does not exist, `Add Main Basket` opens a small request dialog with the vendor name and proposed Main Basket name. Procurement sends that request to Super Admin, who alone adds the basket to Configuration. Once added, it appears in the shared list and Procurement can select it for the vendor.

## Current behavior and evidence

- `VendorBasketFields.tsx` already calls `listKnowledgeBaskets({ status: "active" })` and `listKnowledgeSubBaskets` from the shared Configuration API. The backend list route reads `AiEstimatorKnowledgeBasketModel`; there is no separate vendor basket catalogue. It currently replaces any failed request with a generic "shared basket list could not be loaded" message and blocks vendor save.
- In the current local session, the frontend is running at `localhost:5173` and `frontend/.env` points API calls to `localhost:3000`. Nothing is listening on port 3000 (`curl` cannot connect); local MongoDB is listening on 27017. This prevents the list from loading now. A backend response has not been observed, so the exact cause at the time of the screenshot and any second server-side catalogue defect remain unconfirmed.
- The current `Add Main Basket` action renders `CreateKnowledgeBasketFields`, which posts directly to the Configuration basket creation route. `procurement.vendor_classification.create` currently permits Procurement to create that shared basket. There is no dedicated Main Basket creation-request workflow.
- Vendor classification stores stable Configuration basket IDs. An unsaved vendor form has only the entered vendor name; an existing vendor also has a stable vendor ID.

## Scope and behavior

1. Keep the active Main Basket options sourced from the existing Configuration catalogue and Sub Basket options from its selected Configuration parents. Do not copy names into another catalogue or invent fallback options when the API is unavailable. Refresh the options after Super Admin changes Configuration and on explicit retry. Show the actual load failure concisely; keep typed vendor details and selections intact.
2. Replace the Procurement `Add Main Basket` inline creator with a dialog. Show the current vendor name, prefilled from the vendor form, and an editable proposed Main Basket name. For a saved vendor, include its stable vendor ID. For an unsaved vendor, label the vendor name as entered but not yet saved. Keep the form draft intact when the dialog closes or a request fails.
3. `Send request` creates one auditable pending request to Super Admin. Do not create, activate, or assign a Configuration basket from the Procurement action. Reject an empty name, a duplicate open request for the same vendor/proposed normalized name, and a proposal that already matches an active Configuration basket; guide Procurement to select the existing option when the catalogue is reachable. Make network retries idempotent.
4. Give Super Admin a small review list with requester, vendor name/ID when available, proposed basket name, request time and status. Super Admin may create the basket in Configuration and fulfill the request, or reject it with a reason. If a matching active Configuration basket was added in the meantime, fulfill by linking that existing ID rather than creating a duplicate. A rejected request does not change Configuration. Do not automatically attach the new basket to a vendor; Procurement selects it and saves the vendor profile.
5. Restrict direct Main Basket creation to the established Super Admin Configuration permission in both route authorization and service enforcement. Keep existing Configuration editing controls and vendor classification reads as they are. This request covers Main Baskets; the existing Sub Basket action is outside this change.

## Data, API, permissions and failure handling

- Add a request record with stable ID, requester ID, optional saved vendor ID, entered vendor name, proposed name and normalized name, status (`pending`, `fulfilled`, `rejected`), created/decided timestamps, deciding Super Admin ID, optional resulting Configuration basket ID, reason, version and idempotency key/digest. Preserve audit entries for create and decision. Use the current Mongo transaction/CAS pattern for decisions and uniqueness; no backfill is needed.
- Add scoped create and own-status read operations for Procurement and a Super Admin review/decision operation. The Super Admin decision rechecks the current Configuration catalogue and sole-active-admin authorization. Keep OpenAPI, route-operation registry, frontend authorization types and backend checks aligned.
- Requests are internal records, not emails or automatic vendor invitations. A failed catalogue call or failed request submission must not silently create a basket or erase the vendor draft. If the backend is unavailable, retry after it is running; do not mask the outage with stale local names.
- Preserve existing vendor classification IDs and unrelated dirty worktree changes. No production mutation, demo seed, migration, deployment or customer communication is in scope.

## Risks and controls

| Risk | Control |
| --- | --- |
| Procurement still creates shared Configuration values | Remove its direct POST permission and enforce Super Admin in the basket service. |
| Duplicate or wrong basket is created | Normalize proposed names, check existing Configuration values and pending requests in the decision transaction, and link an existing active ID where applicable. |
| An unsaved vendor name is mistaken for a saved vendor | Mark it as entered-only; use a stable vendor ID when available. Do not auto-assign after fulfillment. |
| Catalogue outage appears as an empty catalogue | Keep loading, empty and error states distinct and expose retry without losing form data. |

## Acceptance criteria

1. With the API running, a Procurement vendor form lists active Main Baskets from Configuration, including a newly added basket after refresh, and lists Sub Baskets under selected parents. A failed API call shows a retryable error and preserves the form; it never claims Configuration is empty.
2. `Add Main Basket` opens a keyboard-accessible dialog with vendor name and proposed basket name. Sending creates a pending Super Admin request, not a Configuration basket or vendor association. Duplicate and failed requests are handled without duplicate records or lost form input.
3. Super Admin can see, fulfill or reject the request. Fulfillment creates or links one Configuration Main Basket and makes it selectable on the Procurement form after refresh. Decision identity, reason where required, version and audit are recorded.
4. Procurement cannot call the direct Configuration Main Basket creation route, while Super Admin can. Existing vendor classification reads continue to work. Focused route/replica-set and rendered form tests cover permissions, deduplication, pending/fulfilled/rejected states, outage/retry, and responsive keyboard use; typechecks/builds and diff hygiene pass.

## Assumptions and open decisions

- The screenshot's `Add Main Basket` is the requested action. The modal asks for the **new basket name**, alongside the **vendor name**. It does not create a new vendor.
- The observed local load failure is caused by the stopped local backend. Once the backend is running, any remaining non-2xx catalogue response must be diagnosed from its exact status and fixed at that boundary.

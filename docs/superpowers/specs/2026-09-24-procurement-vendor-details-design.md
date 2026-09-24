# Super Admin procurement vendor details

Date: 2026-09-24
Status: Original scope approved and implemented in Mode A. The 2026-09-24 Execution checkbox amendment and task plan were approved and implemented in Mode A. Scoped final verification passed; current and prior evidence is recorded in the matching task plan.
Source: User attachment, “Task: Enhance Procurement Screen — Super Admin”.
Confirmed user direction: “re-use main basket and sub basket”. Both selections and additions use the existing Configuration Tool entities and APIs; no parallel hierarchy or hardcoded option list is permitted.
Risk: Substantial cross-stack change with sensitive vendor information, private uploads, and a concurrent financial restriction.

## Amendment: select multiple Execution Types

User request: “if execution selected we should show that as checkbox we can select both”.

### Goal and current evidence

When Vendor Type is Execution, show independent **Labor** and **Material + Labour** checkboxes. Either option alone or both together are valid; at least one remains required. Vendor Type itself remains the existing single-choice control.

At amendment approval, `VendorProfileFields.tsx` rendered Execution Type through `VendorRadioGroup`. `vendorProfileDraft.ts`, `knowledgeTypes.ts`, the backend contract, profile Zod schema, vendor Mongoose schema, and vendor OpenAPI schema all allowed only one scalar execution value at that baseline. The shared `Checkbox` primitive already exists in `frontend/src/components/ui/Field.tsx`. A repository search found no mobile consumer of this full-profile field.

### Scope and contract

- Reuse the shared Checkbox primitive, current fieldset styling, labels, error announcement, and keyboard/focus behavior. Selecting one option must not clear the other. Do not put HTML `required` on both checkboxes, which would incorrectly require both; validate the group as at least one selected.
- Retain `procurementProfile.executionType` as the single field, with a canonical array of allowed values for Execution: `["labor"]`, `["material_labour"]`, or `["labor", "material_labour"]`. Preserve null for Supplier. Do not add a competing scalar or combination flag.
- Reject empty arrays for Execution, unknown values, duplicate values, and contradictory Supplier/Execution payloads. Normalize valid array ordering deterministically to Labor followed by Material + Labour.
- Accept existing scalar `labor`/`material_labour` stored values and legacy request values as a one-element selection. Normalize on read and validated profile writes. Existing vendors must reopen with their original selection checked and retain their other profile fields and verification metadata. No bulk migration/backfill is needed or authorized.
- Return the canonical array/null shape in full-detail responses, and update frontend types, validation, draft serialization, tests, and OpenAPI together. Frontend/backend releases need coordinated deployment because older full-profile editors assume a scalar; generic vendor pickers and summary DTOs are unaffected.
- Switching to Supplier clears Execution selections and stores null. Switching back to Execution starts with no choices, requiring an explicit selection. Supplier Yes/No remains single-choice.
- Keep both selections after save/reopen, validation errors, stale-version recovery, and uncertain-create recovery. Compare classification arrays by normalized values rather than object identity so the existing lost-response recovery remains correct.

This amendment changes only Execution selection UI and its profile contract. Main Basket/Sub Basket reuse, allocation limits, identity fields, private photos, permissions, vendor IDs, and the other previously approved behaviors retain their existing contracts.

### Acceptance and verification

1. Labor-only, Material + Labour-only, and both-selected create/edit/save/reload flows persist exactly the selected values.
2. Unchecking one of two choices preserves the other; unchecking both gives an accessible required-group error and focuses an appropriate checkbox.
3. Existing scalar profiles remain complete and readable, with the correct box checked; lifecycle-only edits do not erase or reinterpret their profile.
4. Backend validation rejects invalid/duplicate/empty selections and handles scalar compatibility and Supplier transitions correctly; real Mongo persistence round-trips both choices without altering verification or basket references.
5. Lost-create-response reconciliation treats equivalent arrays as equal; retries neither create duplicates nor drop one selection.
6. Focused profile, directory, API/schema and compatibility tests, frontend/backend typechecks/builds, and rendered desktop/mobile keyboard checks pass. Prior unrelated broad-suite failures remain recorded in the original implementation plan.

Assumption: at least one Execution Type remains mandatory, as in the original request. No unresolved product choice remains; the amendment was approved and implemented. Main risks are scalar compatibility, array comparison in recovery, and accidental checkbox validation requiring both; the requirements above address each. Rollback must preserve two selected values rather than truncate to one. No live data operation, dependency, new endpoint, permission change, or new configuration hierarchy is proposed.

## Goal

Extend the existing Super Admin Procurement vendor directory to capture the requested classification, business, contact, identity, verification, documentation, and basket information. Reuse the existing vendor collection and Configuration Tool hierarchy. Enforce the ₹50,000 cumulative allocation limit in the backend for vendors without physical address verification.

Keep the existing application theme, navigation, vendor identity, reference-data lifecycle, and project procurement behavior. Do not redesign Super Admin.

## Current behavior and evidence

The investigation inspected current source, existing test fixtures, schemas, routes, authorization, storage, and the working-tree status. No live database, customer records, or production services were accessed. Production record completeness and historical allocation totals are therefore not verified.

| Area | Current source and finding |
| --- | --- |
| Super Admin Procurement | `frontend/src/features/procurement/ProcurementManagementPage.tsx` renders `ProcurementVendorDirectory` for Super Admin; Sales Managers see project suggestions instead. |
| Vendor directory | `frontend/src/features/procurement/ProcurementVendorDirectory.tsx` uses shared knowledge-master list/create/update/archive APIs and search, status, and pagination. |
| Current editor | `frontend/src/features/ai-estimator-knowledge/KnowledgeMasterEditorDialog.tsx` captures code, name, description, and existing-record lifecycle/order fields. It does not capture the requested vendor profile. |
| Shared vendor model | `backend/src/models/AiEstimatorKnowledgeVendor.ts`, collection `aiEstimatorKnowledgeVendors`, stores stable string IDs, normalized code/name, lifecycle, version, dependency epoch, and actor metadata. No requested procurement profile fields exist. |
| Configuration backend | `backend/src/routes/ai-estimator-knowledge-admin.ts` and `backend/src/services/ai-estimator-knowledge-reference.service.ts` implement shared vendor and basket operations with validation, audit, transactions, duplicate protection, and version checks. |
| Configuration frontend | `KnowledgeBaseIndexPage.tsx`, `KnowledgeReusableValuesPage.tsx`, `knowledgeApi.ts`, `knowledgeTypes.ts`, `knowledgeQueryKeys.ts`, and `knowledgeMutationSync.ts` under `frontend/src/features/ai-estimator-knowledge/`. |
| Main Basket | `AiEstimatorKnowledgeBasket.ts`; `/admin/ai-estimator-knowledge/baskets`; normalized names are unique among non-archived baskets. |
| Sub Basket | `AiEstimatorKnowledgeSubBasket.ts`; `/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets`; immutable `basketId` and unique normalized name within the parent. |
| Existing inline creation | `CreateKnowledgeBasketFields.tsx` and `CreateKnowledgeSubBasketFields.tsx` already handle creation, selection, duplicate/retry recovery, and query refresh. |
| Project procurement | `backend/src/routes/project-procurement.ts`, `backend/src/services/project-procurement.service.ts`, `backend/src/domain/project-procurement.ts`, and `backend/src/models/ProjectProcurementItem.ts`. Items reference the shared vendor by ID. |
| Allocation evidence | `ProjectProcurementItemEditor.tsx` explicitly describes `pricePaise` as a unit price. Procurement items have no allocated quantity or total work amount. No cumulative vendor-allocation calculation was found in the inspected paths. Summing unit prices would be incorrect. |
| Expense path | `backend/src/services/procurement.service.ts` records actual expenses against approved estimate lines. The inspected expense path and `FinanceLedgerEntry` do not provide a stable vendor allocation source. Actual expenses cannot be substituted for work commitments. |
| Quick-add compatibility | `POST /procurement/vendors` currently lets the Procurement role create a name-only shared vendor with generated code, or reuse an existing active identity. Sales suggestions and item pickers receive minimal vendor options. |
| Form primitives | `frontend/src/components/ui/Field.tsx` provides Field, Input, Select, Textarea, Radio, and FileInput. `ContextPanel`, `Button`, and `InlineMessage` provide existing interaction patterns. |
| Private image/storage patterns | `frontend/src/components/design/ProtectedImage.tsx`, `backend/src/middleware/upload.ts`, `backend/src/storage/storage.ts`, and `backend/src/storage/stream-file.ts`. Workflow evidence also demonstrates streaming import and integrity checking. |
| Authorization | `backend/src/domain/route-operations.ts`, `backend/src/domain/authorization.ts`, and `backend/src/services/ai-estimator-knowledge-actor.ts`. Configuration access requires the sole active Super Admin. Procurement item writes remain Procurement-role operations; Super Admin does not inherit them. |
| Tests | Existing coverage includes `VendorProcurement.test.tsx`, `ProjectProcurementItems.test.tsx`, knowledge-reference/basket tests, procurement route tests, and Mongo replica-set procurement tests. |

The initial worktree contains unrelated chat, mobile, notification, and profile-photo changes. Potentially overlapping dirty shared files include `backend/src/app.ts`, `backend/src/domain/{audit-actions,authorization,route-operations}.ts`, `backend/src/openapi.ts`, shared authorization/API tests, and `frontend/src/api/authorization-contract.ts`. Their current changes must be recaptured and reconciled before implementation. Procurement target files were initially clean. Do not replace shared files with historical versions or absorb unrelated changes.

## Scope and non-goals

In scope:

- Full vendor create/edit/detail flow in the existing Super Admin directory.
- Extension of the existing vendor model, APIs, validation, and safe directory projections.
- Shared basket selection and inline creation with existing permissions.
- Private vendor photo upload, authenticated preview, replacement, and removal.
- A real recorded work-allocation value and backend cumulative cap, subject to the allocation decision below.
- Compatibility for existing vendors, project references, and minimal vendor pickers.
- Focused changes to configuration reference integrity and cache invalidation where the new relationships require them.

Out of scope:

- A second vendor registry or procurement-only basket hierarchy.
- A full Configuration Tool or Super Admin redesign, new visual libraries, or new icon dependencies.
- Vendor KPI scoring, purchase orders, invoice/payment workflows, or changes to approved estimates, margin calculations, and finance ledger totals.
- Broader role access, mobile UI redesign, public vendor files, camera capture, maps, live location tracking, or automatic identity verification.
- Deployment, commits, seeds, production data changes, or historical allocation backfills.

## Material allocation decision

The existing data cannot identify allocated work value. A clarification was requested during investigation. Until answered, this specification proposes option 1; it is a proposal, not an assertion about existing data.

1. **Recommended: explicit allocated-work amount on a vendor-linked procurement item.** Add `allocatedWorkPaise` separately from `pricePaise`. This records the actual committed value without inventing quantity or assuming a vendor's share of an estimate line. It requires one additional field in the project procurement editor and corresponding backend validation.
2. **Alternative: allocated quantity multiplied by unit price.** Add an explicit allocated quantity and derive the amount using the selected UOM's precision. This supports quantity-based purchasing but adds rounding, quantity changes, and UOM rules beyond the requested vendor enhancement.

Neither option may sum unit prices or automatically copy a parent estimate's full value into each child procurement item. Approval of this specification adopts option 1 unless the user selects option 2 or provides another business definition first.

## Vendor data and validation

Extend `AiEstimatorKnowledgeVendor` with an optional structured procurement profile. Preserve the original stable ID, code, name, description, lifecycle, version, and actor fields. Do not put profile data in a generic unvalidated object.

Use existing `name` as the canonical Entity Name; do not create a second independently editable entity-name source. Preserve existing vendor codes. For new records created by the expanded form, generate a stable code using the existing vendor-generation convention if no code is supplied. Existing configuration code controls remain compatible.

| Form field | Proposed stored representation | Validation |
| --- | --- | --- |
| Vendor Type | `vendorType` | Required: `execution` or `supplier`. |
| Execution Type | `executionType` array/null | Required only for Execution: one or both of `labor`, `material_labour` using checkboxes; null for Supplier. Legacy scalar values normalize to one-element arrays. |
| Supplier | `supplier` | Explicit boolean required only for Supplier; null for Execution. False is a valid answer. |
| Name of Representative | `nameOfRepresentative` | Required bounded text. |
| Entity Name | Existing `name` | Required; existing normalization and uniqueness apply. |
| Position | `position` | Required bounded text. |
| GST Registered | `gstRegistered` | Explicit Yes/No; no implicit Yes. |
| MSME Registered | `msmeRegistered` | Explicit Yes/No. |
| Turnover (Self Declared) | `turnoverSelfDeclaredPaise` | Required nonnegative safe integer paise; rupee input with at most two decimal places. |
| Turnover (Verified) | `turnoverVerifiedPaise` | Nullable nonnegative safe integer paise. Null displays `NA`; zero displays a currency amount. |
| Reference | `reference` | Required bounded text. |
| Work Profile | `workProfile` | Required bounded multiline text, separate from legacy description. |
| Email | `email` | Required trimmed email validated using the existing Zod pattern. |
| Phone Number | `phoneNumber` | Required bounded string; preserve international prefixes and formatting. Existing auth validation is permissive, so do not impose an India-only phone regex. |
| Address | `address` | Required bounded multiline text. |
| AADHAR | `aadhar` | Required string, never a numeric database field. Normalize spaces; validate 12 digits for this requested Indian identity field. No external identity lookup or claim of authenticity. |
| PAN | `pan` | Required trimmed uppercase string; five letters, four digits, one letter. No existing PAN validator was found. |
| Current Address | `currentAddress` | Required bounded multiline text. |
| Current Address Verified Physically | `currentAddressVerifiedPhysically` | Explicit boolean required in a completed profile; missing historical value remains unknown and does not count as verified. |
| Main Basket | `mainBasketId` | Required existing active basket ID for new/changed selections. |
| Sub Basket | `subBasketId` | Required ID belonging to the selected Main Basket. |
| Geo Tagged Picture of the Vendor | Optional private image metadata/reference | Optional because the attachment does not list it among required fields. |

Use established short-text and long-text limits where suitable. Reject unsafe integers, negative amounts, fractional paise, malformed profile shapes, and wrong-parent basket IDs on the server. Frontend validation mirrors backend messages but does not replace server checks.

Switching vendor type clears the irrelevant conditional value. A complete profile cannot contain contradictory classifications. Updating verified turnover never changes self-declared turnover. Address edits reset physical verification unless the authorized editor explicitly reconfirms verification for the changed address; record the verification actor/time and relevant change audit without raw identity data.

Legacy profile absence is permitted at the database level. New profiles submitted through the expanded form and subsequent profile edits must satisfy all required fields. Lifecycle-only or legacy master edits must not erase a saved profile or demand unrelated identity data.

## API and permission contract

Extend existing routes rather than creating duplicate vendor CRUD:

- `GET /admin/ai-estimator-knowledge/vendors`: existing pagination/status/search plus safe classification summary and vendor-specific filters. Do not return Aadhaar, PAN, addresses, email, phone, or original photo metadata in the list.
- `POST /admin/ai-estimator-knowledge/vendors`: support the full vendor profile on the same shared vendor identity; retain compatible legacy master input where required by existing consumers.
- `PATCH /admin/ai-estimator-knowledge/vendors/:id`: support profile updates with the existing `expectedVersion`; preserve fields omitted by legacy clients.
- Add `GET /admin/ai-estimator-knowledge/vendors/:id` for an authorized full-detail edit read if needed, since the generic master routes currently do not expose this operation.
- Add bounded vendor-photo operations under the same vendor resource for authenticated read, replace/upload, and removal. All mutations carry a version precondition; expose a content endpoint, not the private storage key.
- Keep `GET /procurement/vendors` as a minimal selector projection and `POST /procurement/vendors` as the compatible name-only quick-add operation. New quick-added records remain incomplete/unverified; they cannot bypass the allocation cap.

| Actor | Allowed behavior |
| --- | --- |
| Sole active Super Admin with existing configuration permissions | Read/edit full profiles; upload/read/remove vendor photos; change verification; add shared baskets/sub-baskets; existing archive behavior. |
| Procurement role | Existing minimal vendor read/quick-add and project item management; allocation changes checked on the backend. No new access to private profile data or verification editing. |
| Sales Manager/Admin | Existing vendor suggestions and minimal directory access only. |
| Other/unauthenticated/disabled identities | No additional vendor operations. Existing denial and non-disclosure rules remain authoritative. |

Register any new protected routes in the canonical route-operation registry and OpenAPI, including operation-specific Super Admin behavior. Reuse existing permission codes where they accurately match the operation. Do not interpret tab visibility as authorization.

This interpretation follows the request's Super Admin scope and requirement to preserve existing permissions. Extending full profile management to Procurement staff would be a separate permission decision.

## Cumulative allocation rule, proposed option 1

Represent money as integer paise. The cap is `5_000_000` paise, inclusive: ₹50,000 is allowed and ₹50,000.01 is rejected. Apply to both Execution and Supplier vendors, irrespective of the Supplier Yes/No answer.

For a vendor, the source of truth is the sum of recorded `allocatedWorkPaise` across all vendor-linked project procurement items, across projects. Do not reset the total when a project completes or changes estimate version. Unit price, self-declared turnover, verified turnover, expenses, and approved estimate budgets are not this total.

The explicit amount represents the full committed work value, including any applicable tax; do not derive or adjust GST from the unit price. This definition is an assumption for approval and does not alter finance-ledger accounting.

- New vendor-linked item allocations require an explicit positive amount. Items without a vendor cannot carry a vendor allocation.
- Updates recompute the projected total by excluding the current item's previous amount and applying the requested replacement. Metadata and unit-price-only edits do not invent additional allocation.
- Vendor reassignment removes the previous commitment from the old vendor and checks the new vendor's projected total in the same transaction. Explicit reductions release the corresponding commitment; they must be audited. This is a cumulative recorded-commitment cap, not a lifetime sum of every superseded revision.
- Only `currentAddressVerifiedPhysically === true` lifts this cap. Missing profile/verification remains subject to it. Normal project/estimate eligibility, lifecycle, source-version, and authorization checks still apply.
- A verification change from Yes to No is allowed to record the true state even when the vendor is already over the cap. Preserve existing allocations; block new/increased commitments until the total is within the cap or verification is restored. Permit corrections that do not increase exposure.
- Serialize all allocation-affecting writes and verification changes through a shared vendor-document write inside the Mongo transaction, extending the existing dependency-epoch coordination pattern. Recompute totals on transaction retry. A read-then-write check without a shared write lock is insufficient.
- When multiple vendors are involved, use deterministic lock ordering. Prevent bypass by unchanged-vendor amount updates, alternate entry points, null amounts, concurrent project writes, or stale profile versions.
- Use one domain rule and one aggregate calculation. Prefer indexed reads over a second independent cached financial counter. Index the actual vendor aggregation path as needed.
- Return a stable business error and field message without disclosing another project's identity or private details. Failed checks cause no item, audit, or finance mutation.

### Historical allocation uncertainty

Existing records have unit prices only. Never silently treat them as measured allocated work or fabricate historical values.

- Continue to load/edit existing records and show missing allocation as `Not recorded`.
- Permit unrelated legacy item edits without silently clearing or creating allocations.
- For an unverified vendor with legacy vendor-linked items whose allocation is unknown, block a new or increased commitment with a clear `allocation baseline incomplete` response until those values are explicitly recorded or the vendor is physically verified.
- Allow authorized baseline completion as explicit audited data entry; if the newly recorded historical total exceeds the cap, preserve that factual value and block further increases. Do not use this correction path to create new work or reassign vendors without the ordinary check.
- Historical reconciliation must have a distinguishable, restricted operation and reason; do not allow ordinary clients to claim a new commitment is historical. The exact endpoint/contract belongs in the approved task plan.
- No automatic backfill is authorized. Compatibility fixtures must cover missing profile, unknown allocation, and known over-cap vendors. Inspect an authorized development dataset using aggregate counts only before any later migration proposal.

## Basket integration and reference integrity

Use the existing knowledge basket/sub-basket APIs, stable IDs, query keys, normalized duplicate rules, and inline creation components. Load the complete permitted option set through existing pagination helpers; never quietly truncate dropdowns to the first page.

Main Basket is shown first. Sub Basket is disabled until a main selection exists. Changing the parent clears the child and cancels/ignores stale child requests. New basket/sub-basket creation stays inside the current vendor form, preserves the draft, selects the saved value, and refreshes the shared Configuration Tool lists.

Only expose Add actions to identities with the existing configuration-create permission. Handle invalid/duplicate input and ambiguous/lost responses using the existing recovery controls. Creation is a separately committed configuration action and remains saved if the vendor form is later cancelled; make that clear in the form.

Vendor references must participate in basket and sub-basket deletion safety. Block permanent deletion while any retained vendor references that identity and show a useful reference count in the existing impact flow. Coordinate profile assignment with the parent dependency write to avoid deletion races. Existing inactive/archived selections remain readable with an unavailable label; require active selections for new or changed classification, without forcing destructive replacement on unrelated edits.

## Vendor photo behavior

Reuse `FileInput`, existing signature/type validation, `FileStorage`, and authenticated image rendering. Initially accept JPEG, PNG, and WebP within the existing configured upload-size limit. No database image binaries, public static URLs, remote URL import, or new storage infrastructure.

Persist an opaque storage reference with filename, detected MIME type, byte size, integrity hash, upload actor/time, and applicable metadata. Preserve original uploaded bytes, including embedded location/EXIF data when present. Existing code has no reusable GPS extraction flow; automatic coordinate extraction, map display, and proof of location are not required. An uploaded image alone never sets address verification to Yes.

Allow local preview before saving and authenticated preview after reload, plus replacement/removal. Enforce authorization before upload processing and again at the write boundary. Validate image decoding as well as content signature using the existing image tooling.

For a new vendor, persist the profile first, then attach the selected image to the returned vendor ID. If photo upload fails, explicitly report that the vendor was saved but the photo was not, retain the ID/draft, and offer photo retry without creating another vendor. Do not display a full-success message until both requested actions succeed.

Replacement must keep the existing photo available until the new reference commits. Clean up a new object when persistence fails; delete retired objects only after successful replacement/removal. Failed cleanup needs recoverable metadata/retry using established storage-cleanup patterns. CAS conflicts and uncertain responses must not delete the winning photo or publish an orphan. Photo responses are private and must not expose raw storage references in logs or general pickers.

## User experience and states

Use the current directory, ContextPanel, form grid, and existing CSS tokens. Add a focused vendor-profile editor composed from existing primitives; avoid making the generic master editor responsible for every new vendor concern.

Sections, in order: Vendor Classification; Vendor Information; Contact Information; Identity & Verification; Procurement Classification; Vendor Documentation. Use labeled radio groups for Vendor Type and required Yes/No choices, and a labeled checkbox group for Execution Type with one or both selected. On narrow screens use one column with reachable actions and no horizontal overflow.

Verified turnover has an empty editable amount input with `NA` presentation/helper text, backed by null. Do not put the string `NA` into a numeric value or treat zero as missing.

When physical verification is No, show exactly: **More than ₹50K work allocation won't be possible.** Supplement with concise cumulative-across-projects context. Legacy unknown verification has a separate incomplete status and is not presented as verified.

Extend the existing directory table and filtering with Entity Name, Vendor Type, Main Basket, and Sub Basket, alongside existing status/actions. Reuse current search/pagination/filter controls; reset pagination on filter changes. Retain existing performance placeholder behavior and archive confirmation.

Provide loading, empty, failure/retry, field-error, unauthorized, stale-reference, and version-conflict states. Preserve draft values after save/configuration/upload errors. Disable duplicate submissions and parent form saves while nested creation or upload is pending. Use the existing dirty-close confirmation, first-invalid-field focus, keyboard navigation, and status announcements. Do not add decorative animation or new icons.

Refresh all affected vendor list/detail, configuration, procurement picker, and suggestion caches after mutations; refresh basket/sub-basket caches after inline creation. Never merge private detail data into minimal picker caches.

## Acceptance criteria and verification evidence required

| ID | Acceptance criterion | Required verification |
| --- | --- | --- |
| AC1 | Execution requires at least one of Labor and Material + Labour, with both selectable using independent checkboxes; Supplier requires an explicit Yes or No. Irrelevant values are absent/null. | Backend validation and Mongo persistence; create/edit/reload for both individual selections and both together; legacy scalar compatibility, empty-selection errors, type switches and uncertain-create recovery. |
| AC2 | All requested required profile fields validate and persist; verified turnover starts at NA and stays separate from self-declared turnover. | API/model tests, invalid-field UI checks, null/zero/paise round trips, conditional false values. |
| AC3 | Basket lists come from Configuration, child choices match the parent, and additions appear immediately in both contexts. | Paginated catalog fixtures, stale parent-response tests, inline add and duplicate tests, permission denials, deletion-race tests. |
| AC4 | Photo upload/preview/replacement/removal works through private storage without accidental verification or exposed references. | Signature/decode/size/access tests; storage and persistence failures; CAS races; retry after partial create; rendered preview states. |
| AC5 | No/missing physical verification enforces the backend cumulative ₹50,000 cap. | ₹49,999.99, ₹50,000, ₹50,000.01; two unequal projects; concurrent writes; updates/reassignment; verification races; unknown baseline and over-cap historical state. Mongo replica set required. |
| AC6 | Existing vendors and references continue to load; historical IDs, unit prices, approved estimates, and ledger totals are preserved. | Old-format fixtures and old minimal API clients; profile omitted on updates; unchanged unavailable references; regression tests. |
| AC7 | Existing roles retain their boundaries and sensitive profile fields stay private. | Sole Super Admin, Procurement, Sales, disabled and unauthenticated identity matrix; route/OpenAPI inventory and frontend authorization checks. |
| AC8 | Directory search/classification filters, error recovery, and responsive keyboard interactions work in the established UI. | Rendered checks at approximately 390, 768, and 1440 pixels; focus/accessible-name checks; configuration and network failures; no browser console errors. |
| AC9 | Code integrates cleanly with unrelated work. | Focused backend/frontend tests, broader affected suites, both typechecks/builds, final diff review, `git diff --check`, and `git status --short`. |

There is no lint script in either workspace; do not claim lint passed. No product tests/builds were run in the specification stage, because only this document was added. The separate task plan will name exact test commands and ownership after specification approval.

## Risks, compatibility, and rollout constraints

- The allocation definition is the principal product decision. The recommended separate amount, total across all projects, tax-inclusive value, and historical-baseline behavior must be accepted before implementation of this rule.
- Required frontend fields cannot be introduced as mandatory database fields on every existing vendor. Optional profile storage and explicit incomplete state preserve existing data without treating missing verification as Yes.
- Existing quick-add and Configuration Tool vendor clients can still produce minimal records. These must remain visibly incomplete and subject to the same cap; do not create a privileged bypass for legacy payloads.
- Profile fields carry sensitive information. Use explicit response projections and safe audit metadata such as changed field names, actor, version, verification transition, and stable IDs. Do not log raw PAN, Aadhaar, addresses, or photos.
- Concurrent allocations and verification changes need Mongo transactions and a shared vendor write. Non-replica mocks alone cannot prove correctness.
- Referencing shared baskets changes deletion dependencies. Never silently cascade-delete vendors when configuration is deleted.
- Rollout is additive at the schema level. Old clients can keep reading unit prices and minimal vendor options; omitted allocation fields must not erase recorded values or bypass new-work checks. Validate old/mobile client interactions even though a mobile redesign is excluded.
- No production migration or automatic legacy allocation inference is included. If operational index creation/backfill becomes necessary, prepare a separate dry-run/rollback proposal and obtain the exact operational authorization.
- Rolling back to server code without the allocation rule would remove enforcement. A rollback after adoption must retain enforcement or disable allocation mutations; reverting the UI alone must not erase new data.

## Open decisions and assumptions for approval

1. The user approved explicit allocated-work amount, separate from unit price, in the original specification. Only the Execution checkbox amendment above is pending approval now.
2. The proposed cap is global per stable vendor ID across projects, on recorded commitments including applicable tax, with no automatic period reset.
3. Historical missing allocation amounts are unknown, not zero. The draft requires explicit, restricted reconciliation before additional unverified work can be accepted.
4. Full profile and verification management remains with existing Configuration-authorized Super Admin access; Procurement/Sales permissions are preserved.
5. A geo-tagged original can be uploaded and its metadata retained, but this task does not certify GPS authenticity or require a new GPS extraction service.

Approval of the amendment settles its specification only. The separate task plan must then be updated and approved before the repository's execution-choice gate. Previous implementation and its verification history are preserved.

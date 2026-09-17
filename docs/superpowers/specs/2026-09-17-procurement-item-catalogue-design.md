# Reusable procurement item catalogue

Superseded by the user's project-level correction: [Project procurement items and saved vendors](2026-09-17-project-procurement-items-design.md). This document records the earlier prototype decision only.

## Authority and decision

The user requests a procurement table with Item name, Brand, UOM and Price, using Recommendations/Exclusions and Quality Parameters as UI references. They explicitly clarified that records must be reusable across projects. Their standing instruction to finish without further approval and selected parallel execution mode apply. Local implementation and verification are authorized; deployment and production writes are not.

Implement a shared procurement catalogue above the existing project purchase list. Reuse the established procurement role boundary, UOM master and contextual form components. Initial worktree is clean.

## Current evidence

- `frontend/src/app/router.tsx` renders `ProcurementWorkspace` for the procurement user's home screen. It currently lists approved project purchases; no reusable procurement catalogue exists.
- `backend/src/routes/procurement.ts` and `services/procurement.service.ts` handle project purchases, immutable estimate projections, receipts and ledger entries. These are separate from reusable reference data.
- Procurement operations are personal operations with Super Admin denied; the service reloads the active stored procurement identity.
- `AiEstimatorKnowledgeUomModel` supplies stable IDs, code/name and active/inactive/archived lifecycle. Its admin API is unavailable to procurement users.
- `KnowledgeQualityChecklistEditor`, the recommendations builder and their CSS establish compact semantic tables and ContextPanel editing.
- `procurementPresentation.rupeesToPaise` provides exact positive rupee-to-paise conversion. Backend `MAX_FINANCE_AMOUNT_PAISE` is 9,000,000,000,000.

## Scope and workflow

Procurement users can view, search, add and edit catalogue items without selecting a project. Each saved record can be referenced across projects. Add item opens a contextual form; saving persists the record and refreshes catalogue queries. Edit retains its stable ID and requires the observed version. A repeated normalized Item name/Brand/UOM combination produces a useful duplicate error. Price is a positive INR unit price with at most two entered decimal places.

Scope excludes catalogue deletion, project-specific overrides, automatic insertion into estimates or purchases, taxes, quantities and changes to approvals or finance calculations. This task introduces no email, upload or background polling.

## Contract and invariants

- New dedicated procurement catalogue model/service; no changes to existing approved estimate or ledger values.
- Permissions `procurement.catalogue.read` and `procurement.catalogue.manage` belong to the procurement role. Registry operations preserve the existing personal/deny_personal behavior and reload stored active identities.
- `GET /procurement/catalogue/items?q=&limit=20&offset=0` returns `{items,total,limit,offset}` inside the standard API envelope. Query is literal case-insensitive normalized text search across name/brand/UOM labels, max 100 characters, bounded limit 1–100 and nonnegative offset. Stable alphabetical ordering includes ID as tie-breaker.
- `GET /procurement/catalogue/uoms` returns active UOM options `{id,code,name}` using the existing master. This endpoint conveys no admin configuration access.
- `GET /procurement/catalogue/items/:itemId` returns the authoritative item DTO for conflict recovery, including after concurrent changes move a record outside the current search/page.
- `POST /procurement/catalogue/items`: `{itemName,brand,uomId,pricePaise}`.
- `PATCH /procurement/catalogue/items/:itemId`: same fields plus `expectedVersion`.
- Item DTO: `{id,itemName,brand,uom:{id,code,name,status},pricePaise,version,createdAt,updatedAt}`. UOM status is active/inactive/archived/unavailable; preserve stored label/code snapshots when the master is unavailable. New or changed UOM must be active. An unchanged unavailable UOM can remain while correcting other fields.
- Names and brands are required, Unicode-normalized, trimmed and whitespace-collapsed, each at most 200 characters. Stable UOM ID is the join key. Unique normalized name/brand/UOM index prevents duplicates including concurrent creation. Retrying a successful POST may receive a duplicate conflict, never create a second row.
- Prices are safe positive integer paise bounded by the existing finance constant. API rejects fractional paise and UI never silently rounds currency.
- Server-managed ID, version, actor and timestamps; edit CAS prevents lost updates. Mutations and audit events commit together following existing transaction patterns; failed validation/authorization/CAS leaves no mutation or audit.
- Contract policy version: `2026-09-17.procurement-catalogue.v1`. Errors include `CATALOGUE_ITEM_DUPLICATE` (409), `CATALOGUE_ITEM_VERSION_CONFLICT` (409), `CATALOGUE_ITEM_NOT_FOUND` (404) and `VALIDATION_ERROR` for unavailable newly selected UOM.
- Updates invalidate catalogue lists only. No interval polling; searches are submitted/debounced and pagination bounded.

## UX, states and accessibility

Header: Reusable procurement items, concise shared-scope description and Add item. Table columns: Item name, Brand, UOM, Price (INR), Actions. Search by item/brand/unit; count and pagination. Price helper explains per selected UOM. Positive exact price validation and current record version govern save.

Use existing Surface, Button, Field/Input/Select, ContextPanel, InlineMessage and PageState. Compact table density and clear row separators match the reference screens. On narrow widths, each table row adapts to a labeled arrangement with all four fields visible. Avoid page overflow. Mobile actions have 44px touch targets; keyboard actions, names, focus restoration and dirty dismissal are supported.

Handle initial loading, no records, no search results, permission denial, UOM loading/error/empty, save pending/error, duplicate, stale edit conflict, refetch failure with visibly stale data, and unavailable historical UOM. A conflict preserves entered data and offers a deliberate latest-record reload; never silently overwrite.

## Compatibility, risks and operations

This is additive. Coordinate backend and frontend deployment because both use the new authorization policy version. No seed/backfill or existing-data migration is needed; new collection/index creation uses established model initialization. Rollback removes the feature code while retaining catalogue records. No production action is part of local implementation.

Main risks are duplicate creation races, stale writes, revoked actors, UOM lifecycle races, imprecise currency and CSS overrides from the application role shell. Verify these directly. Snapshot historical UOM labels and follow existing UOM dependency guards so creation/change cannot commit against an already unavailable master. Catalogue references do not change immutable estimate or ledger lineage.

## Acceptance criteria

1. Procurement home shows reusable items independent of approved project availability, with the four requested fields.
2. Add persists normalized valid values; subsequent fetch/remount shows the same stable record. Duplicate/concurrent inserts cannot create two equivalent records.
3. Edit uses CAS, persists the correct paise value, rejects stale versions and provides recovery without losing unsaved input.
4. UOM choices reuse active masters; unavailable historical units remain intelligible and cannot be newly selected.
5. Unauthorized/inactive/changed-role users cannot read or mutate; frontend/API authorization contracts and route inventory agree.
6. Search/pagination and mutation cache updates work without interval polling or changes to project finance values.
7. Loading/empty/error states, keyboard/focus interactions and 360/768/1440px layouts are usable and pass rendered accessibility checks.
8. Focused frontend/backend tests, relevant shared authorization/API tests, typechecks, builds and final diff checks pass on the integrated tree.

No unresolved product decision requires user input.

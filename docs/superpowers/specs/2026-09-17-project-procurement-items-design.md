# Project procurement items and saved vendors

## Goal and authority

The user's correction supersedes the shared procurement item catalogue: procurement items belong to a project, UOM comes from Configuration, and newly added vendors remain selectable on future projects. Keep Item name, Brand, UOM and Price and add an optional Vendor selection. Deliver a clean, compact project workspace. Standing autonomous implementation authority and Mode A remain in effect; no additional approval is required for these local changes.

## Evidence and existing work

- The prior catalogue implementation is uncommitted and was not deployed. Initial dirty paths and complete tracked/untracked snapshots are saved under `/tmp/lisno-project-procurement-qa/initial-*`. All dirty paths are understood prior-turn work; preserve unrelated work and revise this owned slice.
- `ProcurementProjectPage` resolves an authorized, Design-approved project before rendering project details. `ProcurementWorkspace` is the project overview on home.
- `procurement.service.ts` checks the stored active procurement actor and resolves the single client-approved estimate, approved design lineage and compatible procurement task in a Mongo transaction. This is the authoritative project eligibility policy.
- `AiEstimatorKnowledgeUomModel` and `AiEstimatorKnowledgeVendorModel` are existing Configuration masters. Their administration endpoints remain Super Admin-only. Vendors already have normalized unique names/codes, lifecycle status, display order, actor history and dependency epochs.
- Existing approved-estimate purchases and receipts use their own immutable financial lineage. New project items are editable procurement details and do not post expenditure.

## Product scope and behavior

Home lists procurement projects. Within an eligible project, show a Procurement items table with Item name, Brand, Vendor, UOM, Price (INR) and Actions. Users can add, search, page and edit that project's items. Project switching resets the table/editor state and never shows another project's cached items or draft. The same product may exist with different prices in different projects or for different vendors within one project.

The item editor shows the project context, uses active UOMs from Configuration, and an optional searchable Vendor selector. Add vendor accepts a name, saves a shared Configuration vendor, selects it immediately and keeps the item draft intact. Saving a vendor is an explicit independent action: the vendor remains saved if the item editor is subsequently cancelled. Vendor helper text states this. Existing active vendor names are selected idempotently; inactive names cannot be silently reactivated. Procurement users cannot edit/archive Configuration masters.

Existing estimate-linked purchase forms and their free-text invoice metadata remain unchanged in this slice; persistent vendor selection is provided in the new project item form. No automatic conversion between item prices and actual ledger spending, no quantities/taxes, and no shared item templates are introduced.

## Contract

- Replace prototype catalogue permissions with `procurement.items.read`, `procurement.items.manage`, `procurement.vendors.read`, `procurement.vendors.create`, assigned to procurement. Append these after `chat.participants.manage`, replacing the two prototype catalogue entries. Canonical and frontend policy version: `2026-09-17.project-procurement.v1`. Preserve personal-operation Super Admin denial and stored-actor checks.
- `GET /procurement/projects/:projectId/items?q=&limit=20&offset=0` returns standard envelope data `{items,total,limit,offset}`. Literal normalized search across item, brand and snapshot vendor/UOM labels; q max100, limit1–100, nonnegative bounded offset; stable alphabetical order with ID tie-breaker.
- `POST /procurement/projects/:projectId/items` accepts `{itemName,brand,uomId,vendorId,pricePaise}`; vendorId nullable/optional (omission means null). Required name/brand normalized to NFKC, collapsed whitespace and max200 characters. Price is positive integer paise ≤9,000,000,000,000. No implicit rounding.
- `GET /procurement/projects/:projectId/items/:itemId` returns the exact current item for conflict recovery.
- `PATCH /procurement/projects/:projectId/items/:itemId` accepts the same fields plus `expectedVersion`; CAS prevents lost updates.
- Item DTO `{id,projectId,itemName,brand,uom:{id,code,name,status},vendor:{id,code,name,status}|null,pricePaise,version,createdAt,updatedAt}`. Reference statuses active/inactive/archived/unavailable; historical label/code snapshots are retained on unrelated edits.
- `GET /procurement/uoms` returns active Configuration UOM options `{id,code,name}` and requires items.read.
- `GET /procurement/vendors?q=&limit=20&offset=0` returns `{items,total,limit,offset}` with active Configuration vendor options `{id,code,name,status:"active"}` and requires vendors.read. Search/pagination must support more than the first page; frontend uses the established searchable combobox with debouncing and load-more as needed.
- `POST /procurement/vendors` accepts `{name}`, requires vendors.create, and returns one vendor option (201 new, 200 already active). Name max200 display characters and normalized identity must fit the existing master constraint. Generate ID/code server-side; assign active status and append display order using the existing transactional sequence allocator. Normalized active duplicates, including concurrent/retried requests, return the same stable vendor; inactive duplicates produce actionable 409 `PROCUREMENT_VENDOR_INACTIVE`.
- Item errors `PROCUREMENT_ITEM_DUPLICATE`409, `PROCUREMENT_ITEM_VERSION_CONFLICT`409, `PROCUREMENT_ITEM_NOT_FOUND`404; unavailable newly selected references use `VALIDATION_ERROR` with `uomId`/`vendorId` field errors. Ineligible projects use the established procurement errors without disclosing another project/item.

## Persistence, authorization and lifecycle

Use a new `ProjectProcurementItem` model/collection with immutable projectId. Every item query, CAS filter and unique key includes projectId. Unique identity is projectId + normalized item name + normalized brand + UOM ID + nullable vendor ID. Actor timestamps, version and audit changes commit atomically. Server generates identities and versions.

Expose a small session-aware project access assertion in the existing procurement service that uses its authoritative actor and project resolver. Call it inside every item transaction. Route middleware is only the first gate; separate preflight transactions do not replace mutation-time checks. Wrong-project stable IDs cannot read/edit a record.

Selecting a new UOM/vendor requires active status and a transactional dependencyEpoch increment, serializing with Configuration lifecycle writes. Saved snapshots survive later rename/inactivation/archive or missing references. An unchanged unavailable reference can be retained on other edits; changing it requires an active master. Optional vendor can be cleared. No new master archive restriction is necessary for these snapshots.

Vendor creation uses the existing master collection and display-order allocator, with transactional audit. Existing admin guards are not widened. Existing active duplicate reuse writes no duplicate vendor/audit. Data/state transitions are create→v1, edit observed vN→vN+1, and independent create/reuse vendor→selected reference.

## UX and visual direction

Use established tokens, clean typography, restrained borders, compact 12–13px table text, aligned tabular prices and clear Add item action. No reusable/global catalogue copy in product flows. Keep project heading/navigation, then project items, then existing approved-estimate purchases with clear section hierarchy. Avoid excessive nested cards or dashboard metrics for the new rows.

Reuse ContextPanel, Field/Input/Select, SearchCombobox, Button and error/status patterns. Narrow layouts show labeled values for every column, preserve 44px touch actions, and avoid page overflow. Vendor quick-add lives inline within the item panel so it does not stack conflicting forms/dialogs; use buttons and correct form ownership. Support keyboard selection, Escape behavior, focus restoration, dirty dismissal, loading/empty/error/stale/permission states and explicit latest-item reload on conflict. No interval polling. Project mutation invalidates only that project's item lists; vendor creation invalidates vendor options and applicable Configuration master queries.

## Compatibility and operations

Remove prototype shared catalogue UI, routes, permissions, model registration and source files. Use a new project collection rather than changing the old global unique index. Do not guess project ownership or migrate/delete any prototype collection records. Prior prototype records, if locally created, remain untouched and unexposed; no live migration/backfill is authorized. Coordinate backend/frontend deployment for the changed policy version. No deploy, commit, push, seed or customer communication.

## Acceptance and verification

1. No global item list on home; eligible project detail shows only its own items and project-specific prices. Test two unequal projects with identical products and switched navigation/cache.
2. Add/edit persists stable project/item IDs and exact paise; duplicates scoped by project/vendor; wrong-project IDs and forged project fields fail safely.
3. UOM options reflect Configuration active units; invalid/inactive references reject new selection, unchanged historical snapshots remain editable.
4. Add vendor persists in the Configuration master; selectable after switching projects/remount; duplicate/concurrent creation resolves one stable vendor, inactive duplicate does not reactivate, display ordering and audit are consistent.
5. Stored actor/project eligibility, personal-operation denial, CAS conflict, audit rollback and selection/lifecycle races hold in replica-set tests. Existing purchases/finance reconciliation remain unchanged.
6. Search, pagination, query invalidation, failed saves, stale results, project switching, keyboard, quick-add and dirty dismissal work; table/form pass rendered checks at 360/768/1440px without overflow or axe violations.
7. Focused/backend shared-contract tests, both typechecks/builds, integrity review, final integrated verification and diff hygiene pass or disclose confirmed baseline failures. Previous unrelated signup Address failure remains out of scope unless this change introduces a regression.

No unresolved decision blocks implementation. Reusing the canonical vendor master is preferred to a second vendor directory because the user explicitly requests saved vendors across projects and Configuration already owns those identities.

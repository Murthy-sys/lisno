# Vendor configuration and project suggestions

## Outcome and authority
Add a Procurement navigation entry for Super Admin, Sales Manager and Procurement. Super Admin's entry follows Configuration; Sales Manager has no Configuration access, so its entry follows My Projects. Super Admin configures reusable vendors, Sales Manager suggests vendors for assigned Design-approved projects, and Procurement can select suggested vendors while adding project items. Standing autonomous Mode A authorization applies; no commit, deployment, live migration or external communication is authorized.

## Evidence
Baseline is clean at `d275107`; captured under `/tmp/lisno-vendor-procurement-qa/`. Sales Manager is role `admin`; Sales is `estimator_sales`. Current active `admin_initiator` grants in the projects module are the Sales Manager assignment source. Project.managerId identifies a Design Manager. The vendor master and sole-Super-Admin CRUD already exist under `/admin/ai-estimator-knowledge/vendors`, with CAS, audit, normalized identity and lifecycle handling. Procurement uses that same master and preserves vendor snapshots on saved items. Existing Procurement item/expense endpoints are personal operations and must remain restricted. `procurementItemSourceSnapshot` validates canonical Client-approved commercial and Design sources. There is no vendor KPI model; employee task KPI cannot substitute for vendor performance.

## Product decisions
- Reuse the vendor master, configuration editor and lifecycle APIs. Add a dedicated management page rather than embedding the entire estimation configuration tool.
- Super Admin's Procurement page shows vendor search/table, create/edit/deactivate/archive controls using existing permissions and a Vendor KPI column labelled **Not rated yet**. No new configuration access is granted to Sales Manager.
- Sales Manager's Procurement page lists only their backend-authorized Design-approved projects. Open a project to select an active saved vendor and optionally explain the recommendation. List current-source suggestions with edit/withdraw/reinstate actions and version conflicts. Suggestions do not select or approve purchases.
- Procurement receives its own sidebar entry to the existing project workspace. In the item editor, show available current-project suggestions above global vendor search. Explicit selection is required. Show the suggesting person's name and note. Preserve the existing search, keyboard behavior, quick-create and historical selected-vendor handling.
- KPI remains the requested placeholder for this phase: `status: not_rated`, `score: null`. A separate performance-recommendation placeholder explains that recommendations will appear when vendor performance is recorded. Do not fabricate ratings, rank by vendor order or reuse staff KPI. An optional clarification about manual scoring was asked; absent a reply, the explicit placeholder request is the assumption. No automated scoring formula is introduced.
- Keep the established compact professional layout, soft data chips, labelled mobile rows, keyboard/focus support and loading/empty/error/permission/conflict states.

## API and permission contract
Preserve existing vendor configuration CRUD. Add narrow permissions `procurement.vendor_suggestions.read` and `procurement.vendor_suggestions.manage`; admin receives both and active vendor directory read, Procurement receives suggestion read, Super Admin gets operation-specific global reads but does not perform the Sales Manager's personal suggestion writes.

New operations:
- `GET /procurement/suggestion-projects`: paginated/searchable authorized eligible project summaries, with projectId/name and exact estimateId/estimateVersion/designPlanVersion. Super Admin may read globally, Sales Manager only current initiator grants, Procurement only existing procurement scope.
- `GET /procurement/projects/:projectId/vendor-suggestions`: current canonical source plus paginated current-source suggestions. Authorization happens before source resolution. Includes current vendor availability and explicit unrated KPI. Withdrawn entries are retained and identifiable; noncurrent source history is retained in persistence but not offered for selection.
- `POST /procurement/projects/:projectId/vendor-suggestions`: Sales Manager only; exact estimateId/estimateVersion/designPlanVersion, vendorId, optional note (maximum1000 characters), stable idempotencyKey. Server derives approval round, vendor snapshot and actor identity. Return existing same-key/same-payload result on retry; changed payload conflicts; duplicate current-source vendor cannot produce a second suggestion.
- `PATCH /procurement/projects/:projectId/vendor-suggestions/:suggestionId`: Sales Manager only; expectedVersion, note and status `suggested` or `withdrawn`. Source/vendor/project identity cannot change. Reinstate only if current source and vendor are still eligible.
- Existing `GET /procurement/vendors` becomes an operation-specific active-directory read for Procurement, Sales Manager and Super Admin. Its write endpoint and all procurement item/expense permissions remain unchanged.

Final DTO field names are frozen with the backend owner before frontend integration and recorded in the plan. No endpoint grants broad procurement purchasing access to admin or Super Admin.

## Persistence and invariants
Add a dedicated ProjectVendorSuggestion collection with stable ID, project, immutable estimate/version/review-round/Design version lineage, vendor ID/code/name snapshot, note, status, version, idempotency identity, creator/updater IDs and timestamps. Enforce unique current-source vendor identity and creator request-key identity. Existing rows require no backfill.

Reads and writes validate stored active actor identity. Sales Manager access uses current active admin_initiator grants; unauthorized project IDs return non-disclosing404. Mutations coordinate authorization, canonical source and active vendor lifecycle in the Mongo transaction, with audit committed atomically. Reuse authorization coordination and existing source/vendor epoch mechanisms. Stale source, changed version, revoked grant, unavailable vendor or failed audit leaves no partial suggestion. Preserve immutable approval, task, budget and finance data. Any snapshot helper extension is additive and must not modify the existing parent-item contract.

Vendor configuration mutations invalidate configuration data, global vendor options and project suggestion queries. Project suggestion mutations invalidate only the affected project's suggestions and current project eligibility on source conflicts. No polling, email or notifications are part of this task.

## Acceptance and verification
1. Super Admin sees Configuration → Procurement; Sales Manager sees a permission-gated Procurement entry without Configuration; Procurement has an explicit workspace entry.
2. Super Admin manages the same reusable vendor IDs through established CRUD. Existing procurement items retain historical names after lifecycle changes, while new choices use active vendors.
3. Two different Sales Managers cannot see or mutate each other's projects; pre-Design, stale Design, inactive actor and revoked grants fail closed.
4. Suggestions persist by exact project/source/vendor identity, support safe retry/CAS and atomic audit; concurrent duplicate requests cannot duplicate rows or side effects.
5. Procurement sees current eligible suggestions only for the selected project and can explicitly select an active suggested vendor without losing draft fields or weakening search behavior.
6. KPI is honestly unscored; no vendor is falsely shown as a high performer.
7. Backend route/permission/OpenAPI inventories and frontend contract remain synchronized. Focused route+replica tests, relevant authorization suites, frontend interaction/navigation tests, both typechecks/builds, three-width rendered checks and preservation audit pass.

## Operations and limits
No existing-data rewrite or migration is required for the new collection. Existing procurement source-index rollout requirement from the previous feature remains separate and unapplied here. No dependencies are needed. Rollback removes the new entry points while retaining suggestion/audit records. Full live deployment and real-user data validation remain outside local implementation authority.

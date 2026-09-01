# AI Estimator Knowledge Base — Specification

**Date:** 2026-08-28
**Status:** Approved — 2026-08-28
**Owner:** Lisno cross-stack
**Delivery model:** One additive feature inside the existing Lisno application, on the current branch

## 1. Decision summary

### Requested outcome

Add **Super Admin → Configuration → AI Estimator Knowledge Base** so the sole active Super Admin can maintain structured interior-estimation knowledge covering:

- Main Baskets and Main Lines;
- UOM, Vendors, Tax, Priority, Surface, and Mode references;
- specifications and brands;
- effective-dated vendor pricing;
- quantity adjustments, margin, PMC markup, GST, and wastage;
- exclusions and recommended additions;
- quality parameters;
- execution steps, productivity, and dependencies; and
- lifecycle, completeness, version history, and audit evidence.

The feature provides a dedicated structured context API for future AI use. It does not connect the knowledge base to the current estimator in this release.

### Recommended approach

Implement one internally namespaced feature module in the existing Lisno frontend, backend process, API, MongoDB database, authentication system, audit system, and deployment. Use new knowledge-base collections inside the current database, new routes inside the current `/api/v1` application, and new pages inside the current React shell.

Use a hybrid versioned model:

- reusable masters remain independently queryable;
- a Main Basket and Main Line identify the Estimation Item;
- each item has immutable activated revisions;
- each revision stores bounded, independently addressable workspace sections;
- price and tax versions remain effective-dated and append-only; and
- the context service resolves one coherent active revision with exact lineage identifiers.

This approach is additive without being a separate system, avoids a single global JSON document, preserves historical knowledge, and does not over-normalize every row into an unrelated workflow.

### Fixed decisions

- Work remains on the current branch; no new branch is created.
- This is an individual Lisno feature, not a microservice, second database, second frontend, or standalone admin application.
- The existing estimator and every downstream Estimate workflow remain unchanged.
- No existing estimate is migrated, backfilled, or retrofitted with knowledge-base data.
- No AI/ML inference is implemented now.
- All configuration reads and mutations are Super Admin-only in this release.
- Financial and duration previews are deterministic and server-owned, but are informational knowledge previews only.
- The preview returns transparent components and does not claim an unresolved combined final selling price.
- Initial reference data is inserted only through an additive, idempotent bootstrap operation; no live bootstrap is authorized by this specification.

## 2. Current-state evidence

### Existing estimator source of truth

- `frontend/src/features/leads/estimateBuilderCatalogue.ts` hard-codes the current catalogue, specifications, units, and rates.
- `frontend/src/features/leads/estimateEngine.ts` owns the current quantity defaults, rate selection, whole-rupee calculations, and fixed 18% GST.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` imports those files directly, renders the current estimator, and submits caller-selected line values.
- `backend/src/routes/estimates.ts` validates the submitted line data, recomputes its current whole-rupee amount and 18% GST, and persists the current Estimate contract.
- `backend/src/models/Estimate.ts` stores the existing Estimate lines, totals, lifecycle, and version.
- `backend/src/domain/estimate-pdf-catalogue.ts` and `backend/scripts/sync-estimate-pdf-catalogue.ts` preserve the existing PDF/design catalogue mapping.

There is no database-backed estimation-configuration module today.

### Existing downstream lineage that must remain frozen

- `backend/src/services/estimate-publication.service.ts` creates the immutable client-review snapshot.
- `backend/src/models/EstimateClientReviewRound.ts` stores that snapshot.
- `backend/src/services/estimate-decision.service.ts` uses the approved snapshot for project/finance handoff.
- `backend/src/domain/project-finance.ts` and `backend/src/services/project-finance.service.ts` convert the approved whole-rupee estimate baseline to integer paise and preserve the existing 20% project-finance target-margin behavior.
- `backend/src/services/procurement.service.ts` reads selected items and amounts from the approved Estimate snapshot.
- `backend/src/domain/project-workflow.ts` and `backend/src/services/project-workflow.service.ts` derive existing execution work from approved Estimate identities.

The new feature must not become an implicit input to any of these paths.

### Authorization and application architecture

- `backend/src/domain/authorization.ts` is the canonical permission and role policy.
- `backend/src/domain/route-operations.ts` is the canonical protected-route operation registry.
- `backend/src/middleware/authorization.ts` enforces registered permissions and returns 403 for forbidden authenticated actors.
- `frontend/src/api/authorization-contract.ts` mirrors the backend authorization contract.
- `frontend/src/app/routeRegistry.ts` controls protected routes and navigation presentation.
- `frontend/src/app/router.tsx` mounts the current React routes in the existing `AppShell`.
- `backend/src/services/audit.service.ts` supports immutable sanitized audit writes in Mongo transactions.
- Direct-Mongoose services are already an intentional repository pattern for isolated multi-collection workflows.

### Existing UI foundation

The current design system already provides `PageHeader`, `SectionHeader`, `Surface`, `Field`, form controls, `Button`, `IconButton`, `SearchCombobox`, `StatusBadge`, `ProgressBar`, `InlineMessage`, `PageState`, `SectionState`, `Dialog`, `Drawer`, and toast feedback. There is no reusable Tabs component, so this feature may own an accessible tab implementation without redesigning the application shell.

### Missing reference evidence

The supplied request contains seven initial Basket names and one detailed Plain False Ceiling example. No complete Excel workbook or source screenshot dataset is present in the attachment or repository. The implementation must not invent unspecified Main Lines, vendor identities, rates, or relationships.

## 3. Goal and measurable outcome

The sole active Super Admin can create, find, configure, review, version, activate, deactivate, duplicate, and archive Interior Estimation Items through one professional workspace. The backend can then return one coherent, active, structured knowledge context with deterministic calculation components and explicit missing-data states.

Success does not depend on changing or using the existing estimator. A deployment with an empty knowledge base must leave all existing Lisno workflows fully operational.

## 4. Scope

### In scope

- New Configuration navigation and protected Super Admin pages inside the existing React application.
- Basket/Main Line item management.
- Reusable knowledge references: UOM, lightweight Vendor references, Tax rules, Priorities, Surfaces, and Modes.
- Eight-section Estimation Item workspace.
- Draft, Active, Inactive, Archived, revision, duplication, completeness, and review behavior.
- Structured pricing, rules, relationships, quality, execution, productivity, wastage, and dependency data.
- Deterministic knowledge preview using integer paise/basis points and scaled quantities.
- Dedicated context resolution API for the future AI Estimator.
- Super Admin authorization at both route and service boundaries.
- Immutable audit history, CAS conflict handling, effective dates, and cycle validation.
- Additive reference-data bootstrap artifact with dry-run and conflict reporting.
- Focused, integration, authorization, accessibility, visual, and frozen-estimator regression coverage.

### Non-goals

- No modification or replacement of the current Estimator/Sales catalogue, screens, formulas, payloads, endpoints, PDFs, or saved Estimates.
- No automatic use of knowledge-base rates, tax, margin, recommendations, or duration in current Estimates.
- No changes to approval snapshots, Finance, Procurement, project workflow, OCR, design mapping, or client review.
- No historical Estimate migration, backfill, or new knowledge snapshot field on existing Estimate models.
- No AI inference, prompt orchestration, model provider, embeddings, vector database, ML training, or recommendation acceptance workflow.
- No procurement, inventory, accounting, CRM, or full vendor-management subsystem.
- No separate deployed service, server, worker, database, UI application, login, or authorization system.
- No production deployment, seed, bootstrap, migration, commit, or push without later exact authorization.

## 5. Additive isolation contract

### Frozen estimator paths

The following paths are behaviorally frozen for this feature and must not be edited unless a later approved specification explicitly changes the boundary:

**Frontend**

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/estimateBuilderCatalogue.ts`
- `frontend/src/features/leads/estimateEngine.ts`
- `frontend/src/features/leads/leadsApi.ts`
- current Estimate payload shapes in `frontend/src/api/types.ts`
- current estimator selectors and presentation in `frontend/src/styles/index.css`

**Backend**

- `backend/src/models/Estimate.ts`
- `backend/src/routes/estimates.ts`
- `backend/src/domain/estimate-pdf-catalogue.ts`
- `backend/src/domain/estimate-scope-catalogue.ts`
- `backend/scripts/sync-estimate-pdf-catalogue.ts`
- `backend/src/services/estimate-publication.service.ts`
- `backend/src/models/EstimateClientReviewRound.ts`
- `backend/src/services/estimate-decision.service.ts`
- existing Finance, Procurement, project-workflow, client-review, and design-mapping calculation/lineage paths

### Dependency direction

- Existing estimator code must not import the new knowledge feature.
- New knowledge code must not read or write `EstimateModel` or existing estimator state.
- The context resolver must never fall back to `estimateBuilderSections`, existing Estimate rates, fixed 18% GST, or Finance values.
- No knowledge mutation may emit an Estimate, Finance, Procurement, project-workflow, file, OCR, or email side effect.
- New collections remain safe to ignore by older application versions.

### Minimal shared integration

Some existing registries must be extended additively to mount the feature in the same application. Existing entries and behavior remain unchanged. Expected shared integration areas are:

- backend authorization codes, authorization policy version, route-operation registry, audit-action union, app router mounting, OpenAPI registry, and application index initialization;
- frontend authorization mirror, route registry, router, safe return-path allowlist, navigation tests, and the feature stylesheet import.

No shared integration change may alter an existing permission grant, route operation, navigation entry, estimator component, or API response.

## 6. Actors and permission matrix

### Actor

The sole active **Super Admin** manages and reads the knowledge base.

### Permissions

Append new closed permission codes without renaming or reordering existing codes:

- `ai_estimator_knowledge.configuration.read`
- `ai_estimator_knowledge.configuration.create`
- `ai_estimator_knowledge.configuration.update`
- `ai_estimator_knowledge.configuration.lifecycle`
- `ai_estimator_knowledge.context.read`

All five permissions are granted only to `super_admin` in this release. No existing role receives new behavior. A future approved integration may grant context read access to another actor or an internal worker, but that is outside this scope.

| Operation | Super Admin | Other authenticated role | Anonymous |
| --- | ---: | ---: | ---: |
| Configuration list/detail/history | Allow | 403 | 401 |
| Context and preview read | Allow | 403 | 401 |
| Create Basket/Main Line/master/revision | Allow | 403 | 401 |
| Update any section, rule, master, or pricing | Allow | 403 | 401 |
| Activate/deactivate/duplicate/archive | Allow | 403 | 401 |
| Permanently delete an eligible empty custom Basket | Allow | 403 | 401 |
| Physical delete of historical data | Not exposed | Not exposed | Not exposed |

Every mutation must:

1. authenticate through the existing JWT middleware;
2. pass a registered operation permission before body validation;
3. reload the stored actor;
4. verify the actor is active, still has the token role, and is the sole active Super Admin; and
5. execute the data change and audit append in one Mongo transaction.

Valid non-Super-Admin mutation calls return HTTP 403 even when the supplied body is malformed, preventing schema disclosure.

## 7. Product information model

### Estimation Item identity

An **Estimation Item** is the product view of:

```text
Main Basket + Main Line
```

The database does not create a redundant second item identity. The Main Line record is the stable item root and references one Main Basket.

Examples:

```text
POP / Gypsum → Plain False Ceiling
Electrical → Wiring
```

All joins, mutations, relations, history, and context use stable opaque IDs. Names and labels are presentation only.

### Reusable masters

The feature owns lightweight reference masters inside the same Lisno database:

- UOM;
- Vendor reference;
- Tax rule and effective versions;
- Priority;
- Applicable Surface; and
- Mode.

These are knowledge references, not replacements for Procurement/Finance free-text vendor fields or any future enterprise master system.

Each master includes:

- stable ID and normalized unique identity;
- name/code, description, display order;
- `active | inactive | archived` lifecycle;
- version/CAS;
- created/updated actor and timestamps; and
- immutable audit evidence.

UOM additionally defines a decimal scale from 0–3 for quantity validation. Tax versions define name, percentage in basis points, inclusive/exclusive treatment, applicability, start-inclusive/end-exclusive effective dates, and state.

### Item revisions and workspace sections

Each Main Line points to:

- `activeRevisionId` or null;
- `draftRevisionId` or null;
- item lifecycle state;
- current aggregate version; and
- audit metadata.

An item revision contains immutable identity metadata, revision number, revision state, content digest, and completeness summary. Its bounded section documents are keyed by `revisionId + sectionKey`:

1. `overview`
2. `pricing`
3. `quantity-margin`
4. `scope`
5. `recommendations`
6. `quality`
7. `execution`
8. `advanced`

This avoids one giant global document, supports independent section reads/writes, and still provides one atomic activation boundary.

These eight keys remain the authoritative backend section contract. The current item-workspace frontend presents four first-level destinations—Overview, Mode, Recommendations, and Quality—while Overview summarizes configured values from the hidden backend sections. **Mode** is a presentation group rather than a persisted section: it composes mode-specific dynamic configuration from `advanced`, pricing from `pricing`, and quantity/margin configuration from `quantity-margin`. The underlying sections retain their existing ownership, independent applicability, version/CAS, validation, and API behavior; no `mode` section key is stored or sent to the backend. The primary UOM remains owned and edited by `overview`.

Section payloads are strict and bounded. The implementation must define conservative array and string limits within the existing 300 KiB JSON request ceiling; oversized/unbounded rule documents are rejected rather than silently truncated.

### Section ownership

**Overview**

- Basket/Main Line identity and description;
- primary UOM;
- priority;
- applicable surfaces;
- supported modes; and
- section applicability markers.

**Pricing**

- specifications and brands;
- technical description, quality level, and internal vendor notes;
- vendor/UOM/specification/mode price scope;
- immutable effective price versions; and
- resolved tax reference and calculated base/tax/total components.

**Quantity & margin**

- non-overlapping quantity slabs;
- start margin;
- bottom margin;
- PMC markup;
- wastage; and
- component preview inputs/results.

**Scope**

- mode applicability;
- surface applicability; and
- structured exclusions targeting a Basket or Estimation Item ID.

**Recommendations**

- target Basket and Main Line IDs;
- `mandatory | recommended | optional` type;
- priority, reason, quantity relationship, dependency, and status.

Recommendations are suggestions only. Saving or resolving one never adds an Estimate line or changes pricing.

**Quality**

- text, number, dropdown, radio, checkbox, multi-select, and boolean parameters;
- unit, allowed values, min/max, default, required, category, and status; and
- type-specific validation that rejects irrelevant fields.

**Execution**

- ordered activity steps;
- description, duration value/unit, crew size, skill type, mandatory, parallelizable, and status;
- step dependencies; and
- productivity value/UOM, crew, skill, and min/max duration.

**Advanced**

- item-to-item dependencies;
- mode-specific overrides not owned by another section;
- optional, stable-ID-owned mode configurations containing ordered `text | textarea | number | radio | dropdown | checkbox` field definitions and typed values;
- revision lineage; and
- read-only audit/change history presentation.

### Structured relationship rules

- Exclusions and recommendations use target IDs, not comma-separated labels.
- Recommendation quantity relationships use a closed set such as `same_quantity`, `percentage_of_source`, `fixed`, or `per_unit`; arbitrary executable expressions are forbidden.
- Dependencies use stable item/step IDs.
- Self-dependencies, duplicate edges, invalid references, and direct or transitive cycles are rejected.
- Deactivating a target preserves historical relations; archiving a target with active inbound references returns 409 until those references are revised.

## 8. Persistence and indexing

Recommended new collections, all in the existing active Lisno MongoDB database, are conceptually:

- `aiEstimatorKnowledgeBaskets`
- `aiEstimatorKnowledgeMainLines`
- `aiEstimatorKnowledgeRevisions`
- `aiEstimatorKnowledgeSections`
- `aiEstimatorKnowledgePriceVersions`
- `aiEstimatorKnowledgeUoms`
- `aiEstimatorKnowledgeVendors`
- `aiEstimatorKnowledgeTaxRules`
- `aiEstimatorKnowledgeTaxVersions`
- `aiEstimatorKnowledgePriorities`
- `aiEstimatorKnowledgeSurfaces`
- `aiEstimatorKnowledgeModes`

Mongoose may normalize collection naming according to current conventions, but all names remain feature-specific and must not collide with existing Estimate collections.

Required index behavior includes:

- normalized non-archived Basket-name uniqueness;
- normalized non-archived Main Line uniqueness within one Basket;
- normalized non-archived master identity uniqueness by master type;
- one draft and one active revision pointer per item;
- unique revision number per item;
- unique section key per revision;
- deterministic price scope and version identity;
- non-overlapping price/tax effective windows enforced transactionally; and
- lookup indexes for item status, Basket, Priority, Mode, Surface, Vendor, updated time, and effective dates.

All new schemas use strict validation, `versionKey: false`, explicit integer `version >= 1`, and stable string IDs consistent with existing Lisno models.

## 9. Lifecycle, versioning, and concurrency

### Item states

- **Draft:** editable and unavailable to context resolution.
- **Active:** active revision is available to context resolution.
- **Inactive:** retained but excluded from default context responses.
- **Archived:** read-only terminal history.

### Revision states

- **Draft:** independently editable through section saves.
- **Active:** immutable, context-readable revision.
- **Superseded:** immutable historical revision.

### Transitions

- Creating a Main Line creates Draft revision 1.
- Activating a Draft atomically validates all sections, marks any prior Active revision Superseded, makes the Draft Active, updates the item pointer, and writes one audit event.
- Editing an Active item first creates a copied Draft revision. The current Active revision remains context-readable until the new Draft is activated.
- Deactivation excludes the item from new default context resolution but retains the last Active revision.
- Reactivation requires activation review; no stale draft is silently promoted.
- Archive is terminal and never physically deletes revisions, prices, taxes, or audit events. The sole physical-delete exception is a custom Basket that is empty, unreferenced across all stored history, and not bootstrap-owned; its guarded workflow removes only the Basket document and appends immutable audit evidence.
- Duplicate creates a new Main Line and Draft revision with new IDs. Internal step IDs are remapped; external relationship target IDs remain explicit. Copied price rows are marked for review and are not Active by inheritance.

### CAS

Every mutable request supplies the expected aggregate/section version. Mutations use guarded updates and return HTTP 409 `VERSION_CONFLICT` when another writer wins. The UI retains local edits for comparison, refreshes server state, and never automatically replays a conflicted mutation.

## 10. Completeness and activation

Completeness is backend-derived guidance, never a frontend guess and never an activation decision by percentage alone.

Each checklist section reports:

- `complete`;
- `needs_attention`;
- `not_configured`; or
- `not_applicable`.

Explicit `not_applicable` sections are excluded from the percentage denominator. Core identity, valid Basket/Main Line/UOM references, valid statuses, valid effective windows, non-overlapping quantity rules, and acyclic relationships are activation blockers. Pricing, recommendations, quality, or execution may remain unconfigured when legitimately absent; activation then carries a visible warning and context reports the missing section explicitly.

Activation review groups findings into:

- **Required before activation**;
- **Recommended**; and
- **Not applicable**.

Only backend-reported blocking findings disable activation.

## 11. Deterministic knowledge preview

This release adds a new pure calculation module for knowledge preview only. It must not import, refactor, or replace the current frontend `estimateEngine`.

### Units

- Money: integer paise.
- Percentages: integer basis points (`5% = 500`, `18% = 1800`).
- Quantities/productivity: validated decimal strings converted to scaled integers using the configured UOM scale.
- Intermediate arithmetic: checked integer/`BigInt` arithmetic.
- Boundary output: safe integer paise and canonical decimal quantity strings.
- Monetary rounding: half-up to the nearest paise.

### Required example results

For base vendor rate ₹75.00:

- quantity adjustment +5% → ₹78.75;
- start margin 25% → ₹100.00;
- bottom margin 15% → ₹88.24;
- PMC markup 15% → ₹11.25; and
- GST 18% → ₹13.50.

### Preview component order

When quantity is supplied, the preview may resolve these transparent components:

1. effective vendor price;
2. applicable quantity adjustment and adjusted unit rate;
3. required quantity and separate wastage-adjusted procurement quantity;
4. vendor pre-tax component;
5. vendor tax and tax-inclusive component according to the selected tax treatment;
6. start-margin selling preview;
7. bottom-margin selling preview;
8. PMC markup amount where applicable; and
9. productivity-based raw duration clamped to configured min/max.

Wastage changes the procurement-quantity preview only in this release. It does not silently increase the billable quantity or other cost components.

The response deliberately does **not** expose an authoritative combined `finalPrice`. The request does not define whether margin and PMC are cumulative, which amount receives customer-output GST, or how Execution and PMC mode pricing combine. Inventing that order would violate the no-hallucination and no-existing-estimator-change requirements. A future integration specification must approve a combined formula before it can become an estimate source.

### Tax input

- For exclusive tax, Super Admin enters the base amount; the server derives tax and total.
- For inclusive tax, Super Admin enters the inclusive amount; the server derives base and tax.
- The client never supplies trusted tax amount or total amount.
- Persisted price history stores the original input treatment plus immutable derived base, tax, and total values for explanation.

### Duration preview

Reference duration is `quantity ÷ productivity`, returned as a canonical decimal in the configured duration unit and clamped to min/max when present. The service does not invent working-day calendars, holidays, crew-efficiency multipliers, or rounding increments.

## 12. AI knowledge context contract

### Input

Conceptual strict input:

```json
{
  "mainBasketId": "opaque-id",
  "mainLineId": "opaque-id",
  "specificationId": "opaque-id",
  "quantity": "1500.000",
  "uomId": "opaque-id",
  "surfaceId": "opaque-id",
  "modeId": "opaque-id"
}
```

Optional fields remain optional only when the selected configuration does not require them. Unknown or contradictory IDs are rejected; names are never accepted as join keys.

### Resolution

The service resolves:

- exactly one Active item/revision;
- exactly one applicable specification when requested;
- exactly one current effective price and tax version when pricing is requested;
- requested UOM, Surface, and Mode compatibility;
- all active section data from the same revision; and
- deterministic component previews when sufficient input exists.

The evaluation time is server-owned. Effective windows use inclusive start and exclusive end.

### Response

Conceptual response:

```json
{
  "configuration": {
    "itemId": "opaque-id",
    "revisionId": "opaque-id",
    "revisionNumber": 3,
    "contentDigest": "bounded-digest",
    "formulaVersion": "knowledge-preview-v1",
    "evaluatedAt": "ISO-8601"
  },
  "basket": {},
  "mainLine": {},
  "specifications": [],
  "uom": {},
  "pricing": {},
  "quantityRules": [],
  "margins": {},
  "taxes": {},
  "modes": [],
  "priorities": [],
  "surfaces": [],
  "exclusions": [],
  "recommendations": [],
  "qualityParameters": [],
  "executionSteps": [],
  "productivityRules": [],
  "wastageRules": [],
  "dependencies": [],
  "calculationPreview": {},
  "availability": []
}
```

The response includes selected `priceVersionId` and `taxVersionId` when applicable. Missing configuration produces explicit availability entries such as `pricing: missing`; it never substitutes current estimator data or invents a value.

Internal vendor notes, audit payloads, draft content, inactive revisions, actor emails, and other admin-only fields are omitted from the AI-facing response.

The context resolver is read-only: no audit event, Estimate, project, task, or recommendation-acceptance record is created merely by resolving context.

## 13. API surface

All routes live in the existing `/api/v1` application and use the existing JSON envelope/error format.

### Admin workspace namespace

Prefix:

```text
/admin/ai-estimator-knowledge
```

Resource families:

- `GET|POST /baskets`
- `PATCH|DELETE /baskets/:basketId`
- `GET /baskets/:basketId/deletion-impact`
- `DELETE /baskets/:basketId/permanent`
- `GET|POST /baskets/:basketId/main-lines`
- `PATCH|DELETE /main-lines/:mainLineId`
- `GET /items` for searched/filtered/paginated Estimation Item presentation
- `GET /main-lines/:mainLineId`
- `GET /main-lines/:mainLineId/history`
- `POST /main-lines/:mainLineId/revisions`
- `GET /main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`
- `PUT /main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`
- `POST /main-lines/:mainLineId/revisions/:revisionId/activate`
- `POST /main-lines/:mainLineId/deactivate`
- `POST /main-lines/:mainLineId/duplicate`
- `POST /preview`
- `GET|POST /<masterType>` and `PATCH|DELETE /<masterType>/:id`, where `<masterType>` is a closed set of `uoms`, `vendors`, `taxes`, `priorities`, `surfaces`, and `modes`.

The existing resource `DELETE` operations are Super Admin-only soft archives with expected version and reason. They never physically delete historical configuration. Active items must be deactivated before archive; referenced masters/targets return 409 until references are safely revised.

The distinct Basket `/permanent` operation may physically remove only a custom Basket with no Main Line in any status, no stored section relationship targeting it, and no bootstrap-manifest ownership. It requires an authoritative impact check, exact current-name confirmation, non-empty reason, expected version, and same-document dependency coordination against concurrent Main Line/reference creation. The guarded delete and sanitized audit append commit atomically; it never cascades into items, revisions, sections, prices, taxes, or prior audit history.

### Context namespace

```text
POST /ai-estimator-knowledge/context
```

Although POST is used for structured input, it is registered as a read operation and performs no writes.

### HTTP behavior

- `201`: successful create/duplicate/revision creation.
- `200`: successful read/update/lifecycle/preview/context.
- `400 VALIDATION_ERROR`: malformed values or strict-schema failure.
- `401`: missing/invalid/stale identity.
- `403 FORBIDDEN`: authenticated actor lacks the exact operation.
- `404 NOT_FOUND`: unavailable/unknown resource without disclosing hidden content.
- `409`: duplicate normalized identity, version conflict, active inbound reference, overlapping effective window, or dependency cycle.
- `422`: structurally valid request cannot activate/resolve because required active knowledge is unavailable.

Route authorization precedes request validation. Runtime Zod schemas remain authoritative; OpenAPI documents exact request/response contracts rather than generic objects.

## 14. UX specification

### Navigation and routes

Add one Super Admin sidebar item:

- label: **Configuration**
- route: `/admin/configuration/estimation`

Feature routes:

- `/admin/configuration/estimation`
- `/admin/configuration/estimation/items/:itemId`
- `/admin/configuration/estimation/reusable-values`

The pages remain inside the existing `AppShell`; there is no separate admin UI.

### Index page

Header:

- eyebrow: `Configuration`
- title: `AI Estimator Knowledge Base`
- description: `Maintain structured cost, time, scope, quality, and recommendation rules for future AI estimation.`

Persistent information banner:

> Knowledge-base changes do not modify current estimates or the existing Estimator/Sales builder.

Controls:

- primary action: **Add estimation item**;
- secondary actions: **Add main basket** and **Manage reusable values**;
- search Basket/Main Line;
- filters for Basket, Status, Priority, Mode, Surface, UOM, and Vendor; and
- paginated Basket-grouped item results.

Each result shows Basket → Main Line, description, status, completeness, UOM, Priority, Modes, Surfaces, current revision, and updated metadata. Filtered search may flatten results while retaining the Basket breadcrumb.

### Item workspace

Header shows:

- Basket breadcrumb and Main Line title;
- Draft/Active/Inactive/Archived status;
- active and draft revision indicators;
- backend-derived completeness progress;
- updated actor/time; and
- state-appropriate actions.

Sections:

```text
Overview | Mode | Recommendations | Quality
```

Desktop/tablet use a feature-owned accessible tablist. Mobile uses a full-width labelled **Configuration section** selector so the page does not horizontally scroll.

**Mode** is a frontend-only presentation group with **Mode configuration**, **Pricing**, and **Quantity & margin** blocks in that order. Mode configuration edits the full `advanced` envelope while preserving its dependencies, overrides, and lineage; it stores optional `modeConfigurations` associated by reusable Mode stable ID. PMC and Execution may coexist, and the selector only chooses which configuration is being edited. Super Admin can add, label, reorder, remove, and enter values for bounded text, textarea, number, radio, dropdown, and checkbox controls. A dynamic-configuration mutation marks Advanced `configured` so activated context cannot omit the saved knowledge; selector navigation alone has no such effect. Canonical choices are resolved over all Mode pages with backend-compatible normalization, and stale Draft references have an explicit remove-and-replace recovery path while remaining read-only in history. Dynamic references block Mode archival, and new/replacement references coordinate with archive through an internal, legacy-compatible Mode dependency epoch so concurrent commits cannot create a dangling reference. The epoch is not part of public versions, DTOs, timestamps, OpenAPI, or audit state. Arbitrary executable components and Description fields are not supported. Pricing and Quantity & margin continue to use the separate `pricing` and `quantity-margin` backend sections. The primary UOM remains stored and edited in Overview.

Non-Mode sections continue to save independently. Mode uses one **Save Mode** action that saves dirty underlying sections in stable order: `advanced` → `pricing` → `quantity-margin`. Saving stops at the first validation, API, or version-conflict failure. Blocks saved before the failure become clean; the failing block and every unattempted dirty block remain dirty and visibly identified, and the UI must not announce that Mode is fully saved. A block conflict identifies the underlying section, preserves other unsaved Mode edits, and retains the established review/discard behavior. Unsaved navigation offers **Save changes**, **Discard changes**, and **Stay here**; for Mode, save uses the same ordered routine and discard restores all three buffers from their latest server values. A successful underlying mutation updates the header, completeness, history, list cache, and affected context cache only after that server success.

### Lifecycle actions

- Draft: **Save section**, **Review and activate**, **Duplicate**, **Archive draft**.
- Active: **Create revision**, **Duplicate**, **Deactivate**.
- Active with draft changes: continue editing Draft while the existing Active revision remains clearly identified.
- Inactive: **Create revision**, **Review and activate**, **Archive**.
- Archived: read-only.

Activation success says the revision is available to the **AI knowledge context service**, never “available in the existing estimator.”

### Quick add

UOM, Vendor, Priority, Surface, Tax, and Mode selectors offer compact **Add** actions. Quick add uses existing Dialog/Drawer patterns with an explicit `Estimation configuration` eyebrow. Success inserts and selects the new value without leaving the item or discarding parent-form state. Failure preserves both forms.

### Repeaters and rule builders

- Specifications, quantity slabs, recommendations, quality parameters, execution steps, productivity, and dependencies use compact repeatable cards/rows.
- Only fields relevant to the selected quality type render.
- Quantity rules use business-language controls and a server preview.
- Relationship selectors cascade Basket → Main Line and retain stable IDs.
- Execution order always supports accessible **Move up**/**Move down** actions. Drag/drop is optional enhancement only and must not add a dependency unless later justified.
- Pricing history is read-only; editing creates a new version.

### UI states

The feature must handle:

- initial loading and section-level lazy loading;
- empty knowledge base, filtered empty, and empty section states;
- persistent read errors and retry;
- background refresh without content flashing;
- field and row validation while retaining input;
- 403, non-disclosing 404, archived read-only, and disabled action explanations;
- version conflict with retained local draft and explicit reconciliation;
- mutation success and one polite live announcement; and
- unsaved navigation and quick-add partial failure.

### Accessibility and responsive behavior

- Reuse Lisno tokens, Lucide icons, visible focus, and existing reduced-motion behavior.
- Keep touch targets at least 44×44 px and support the repository's 320 px minimum width.
- The four-item desktop/tablet tablist implements roving tabindex, Arrow Left/Right, Home/End, `aria-selected`, `aria-controls`, and stable panels.
- Mode owns one correctly associated tabpanel. Its Mode configuration, Pricing, and Quantity & margin blocks use semantic headings and independently named status controls, with save, error, and status feedback adjacent to the affected block.
- Mobile exposes one **Mode** option in the labelled **Configuration section** selector, not separate Pricing or Quantity & margin options; all Mode blocks stack without page-level horizontal scrolling.
- Route changes focus the new `h1` through the existing route focus manager.
- Repeaters move focus to the new row and restore it predictably after removal.
- Status and completeness use text plus tone/icon, never color alone.
- No page-level horizontal scroll at mobile widths.
- Visual QA covers 1440×900, 1024×768, 768×1024, 390×844, and 320 px width across loading, empty, error, conflict, review, Active, Inactive, and Archived states.

## 15. Validation and invariants

### Identity and references

- Normalize names using Unicode normalization, trimmed/collapsed whitespace, and case-insensitive comparison.
- Reject duplicate non-archived Basket names.
- Reject duplicate non-archived Main Line names within one Basket.
- Reject invalid, inactive-for-new-use, cross-type, self, and duplicate references.
- Names/labels never serve as relation keys.
- Permanently delete only a custom Basket with no Main Line in any status and no historical section relationship reference; bootstrap-owned Baskets and every Basket with retained lineage remain archive-only.

### Financial and quantity validation

- Money is a nonnegative bounded safe integer in paise.
- Percentage/BPS fields are nonnegative and bounded.
- Margin must be less than 10000 BPS.
- Quantity/productivity/wastage inputs must be positive where required and fit the UOM scale.
- Quantity slabs must be ordered, gap/overlap behavior explicit, and cannot overlap inconsistently.
- Effective windows have `from < to` when an end exists and cannot overlap for the same price/tax scope.
- The server derives tax amount, totals, and preview values; client-calculated values are never trusted.

### History and graph validation

- Activated revisions and financial versions are immutable.
- All modifications create new versioned data or edit only the current Draft.
- Dependency cycles across items or execution steps are rejected before save/activation.
- Archive never removes historical or audit records.
- Context always reports exact revision, price, tax, formula, and digest lineage.

## 16. Audit and observability

Append a new bounded audit-action group without changing existing actions. Events cover:

- Basket/Main Line/master creation and update;
- section update;
- pricing/tax version creation;
- revision creation and duplication;
- activation, deactivation, and archive; and
- blocked lifecycle attempts where the existing audit policy permits.

Audit values include stable IDs, section key, old/new version or status, effective-version IDs, and paise/BPS summaries where needed. They exclude full configuration bodies, free-text vendor notes, actor emails, secret/provider data, and unrelated personal information.

Every multi-document mutation and its audit event commit in one transaction. Audit failure rolls back the business mutation.

Safe operational diagnostics may record opaque item ID, section key, lifecycle, duration, result code, and blocking-rule count. They must not log prices, free-text reasons, vendor notes, recommendation text, or context payloads.

## 17. Initial reference-data bootstrap

The existing demo seed is destructive and loopback-only and must not be extended for this feature.

Create an additive knowledge bootstrap operation inside the existing backend with:

- dry-run default and explicit write mode;
- exact database-target fingerprint and approval digest for any production use;
- canonical manifest digest;
- insert-if-absent stable IDs;
- no overwrite of existing records;
- conflict report;
- one Mongo transaction;
- idempotent rerun; and
- post-commit verification.

The verified initial manifest is limited to:

- the seven supplied Main Baskets; and
- the supplied Plain False Ceiling example plus only the minimum explicitly named reference values/relations that can be represented without inventing data.

Unspecified vendor identity, ambiguous exclusion targets, and any absent Excel rows remain Draft warnings or bootstrap conflicts. They are not replaced by fabricated records. Supplying the complete reference workbook is required before a complete production dataset can be approved.

Creating the bootstrap code does not authorize running it against any database. Live dry run and write are separate future authority gates.

## 18. Compatibility, rollout, and rollback

### Compatibility

- New collections may be empty without affecting application startup or existing workflows.
- Existing API paths, request/response shapes, role grants, navigation entries, estimator calculations, and database records remain compatible.
- Authorization contract changes append new Super Admin-only permissions and bump the mirrored policy version; existing permission semantics remain unchanged.
- The feature uses the existing Mongo replica-set transaction requirement and does not add a non-transaction fallback.

### Rollout order

1. Deploy code with no knowledge bootstrap.
2. Verify existing estimator and project workflows against the unchanged regression suite.
3. Verify Super Admin Configuration with an empty knowledge base.
4. Run a separately authorized target-matched bootstrap dry run.
5. Review conflicts and manifest digest.
6. Only with exact later authorization, write the approved manifest.
7. Verify context resolution for Active knowledge while confirming the current estimator remains unchanged.

### Rollback

Code rollback removes the new route/navigation usage. Existing application versions ignore the new collections. No existing database rollback is required. New knowledge collections are retained for recovery/history; they are never dropped automatically.

## 19. Options and tradeoffs

### Option A — One namespaced feature in the existing app with hybrid versioned collections (recommended)

- Uses the existing frontend, backend, database, auth, audit, deployment, and design system.
- Keeps the current estimator isolated while providing coherent version history and independently addressable sections.
- Requires minimal additive registry/wiring edits and several new feature-owned collections.
- Best matches the user's “individual feature, not separate services/database/UI” clarification.

### Option B — Fully normalized collection per every rule row

- Maximizes independent analytics.
- Produces many joins, transactions, endpoints, and unrelated master-style screens.
- Rejected as over-normalized and contrary to the one-workspace administration objective.

### Option C — One mutable document per item or one global knowledge JSON document

- Small initial CRUD surface.
- Weak historical integrity, higher contention/document-growth risk, difficult effective pricing, and poor independent retrieval.
- Rejected by the structured/versioned AI-readiness requirements.

### Option D — Separate microservice/database/frontend application

- Strong deployment isolation.
- Duplicates operational infrastructure and conflicts with the explicit requirement to keep this as an individual feature in the existing Lisno application.
- Rejected.

## 20. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Accidental coupling changes the current estimator | Frozen-path contract, no cross-imports, estimator characterization tests, and integrity review. |
| A combined final price is invented from ambiguous rules | Return transparent component previews only; defer final formula to a separately approved integration. |
| New permission codes accidentally broaden an existing role | Grant all new permissions only to Super Admin; exact backend/frontend parity and role-matrix tests. |
| Price/tax edits rewrite history | Append-only versions, immutable Active revisions, effective-window validation, exact lineage IDs. |
| Concurrent admins overwrite a Draft | Aggregate/section CAS and 409 reconciliation without automatic retry. |
| Dependency graph becomes cyclic | Validate self, direct, and transitive cycles in the transaction before commit. |
| Large workspace payloads exceed safe request/model bounds | Per-section APIs, strict row/string limits, and no global giant document. |
| Reference seed invents missing business data | Dry-run manifest, verified prompt-only values, conflicts for missing/ambiguous inputs, no live run without approval. |
| New internal feature is mistaken for a separate system | Same app/process/database/shell/auth/deployment explicitly required; namespacing is code/data safety only. |
| AI consumers receive internal notes or Draft data | Separate admin DTOs from context DTOs; Active-only resolver and allowlisted response fields. |

## 21. Verification expectations

### Backend

- Pure domain tests for paise/BPS/scaled-quantity arithmetic and the five supplied examples.
- Validation tests for duplicate identity, negative/overflow values, margins, quantity overlaps, effective windows, invalid references, and cycles.
- Route/service authorization matrix covering every application role, including 401 identity drift and 403 non-Super-Admin mutations before validation.
- Replica-set tests for CAS races, atomic activation/supersession, audit rollback, immutable history, effective price/tax selection, duplicate, archive/reference protection, and coherent context under concurrent writes.
- Context tests for Active-only resolution, missing-price response, mode/surface/spec filtering, exact lineage/digest, no sensitive/admin fields, and no writes.
- Bootstrap tests for dry-run no-write, exact manifest, idempotency, conflict reporting, transaction rollback, wrong-target rejection, and zero mutation of existing collections.
- Route-operation registry, authorization policy parity, OpenAPI exact-schema, index initialization, typecheck, full tests, and production build.

### Frontend

- Route/navigation/direct-access permission tests.
- Index tests for search, filters, pagination, grouped/flat results, loading, empty, error, and 403.
- Workspace tests for the four first-level destinations and all eight underlying backend sections, including dynamic Mode fields, exact PMC/Execution isolation, ordered/partial Mode save behavior, independent non-Mode save, quick add, repeaters, server previews, completeness, lifecycle actions, history, duplicate, and cache invalidation.
- Conflict tests retaining local draft and preventing automatic replay.
- Keyboard, focus, accessible-name, axe, reduced-motion, and responsive visual checks for the specified viewport/state matrix.
- Frontend typecheck, full tests, and production build.

### Frozen existing behavior

At minimum rerun the existing estimator, Estimate route, PDF, publication, client-decision/review, Finance, Procurement, design mapping, and project-workflow suites. Integrity review must confirm the frozen paths have no feature diff and no runtime dependency on the new collections.

### Repository hygiene

- `git diff --check`
- `git status --short`
- no generated build/runtime/database/upload artifacts retained
- no claim that lint passed because the repository has no lint script

## 22. Acceptance criteria

1. Super Admin sees one new **Configuration** destination in the existing Lisno shell and can open the AI Estimator Knowledge Base.
2. No other role sees or can directly open the configuration routes; every non-Super-Admin mutation returns 403 from backend enforcement.
3. Super Admin can create/edit/deactivate/archive Baskets, Main Lines, UOMs, Vendor references, Taxes, Priorities, Surfaces, and Modes without code changes, and can permanently delete only an empty, unreferenced, non-bootstrap Basket through the guarded confirmation workflow.
4. Super Admin can configure one Basket → Main Line item through four first-level workspace destinations, with Mode presenting stable-ID-owned dynamic mode configuration, Pricing, and Quantity & margin over the unchanged eight-section backend contract, without navigating unrelated CRUD screens.
5. Quick-added reusable values become immediately selectable without losing parent-form state.
6. Pricing stores immutable effective versions with separate base, tax, and total paise values; historical versions never change.
7. Quantity, margin, PMC, GST, wastage, and duration previews are deterministic, server-owned, and match the supplied examples.
8. The preview does not claim an undefined combined final price or alter the existing estimator.
9. Exclusions, recommendations, quality parameters, execution steps, productivity, wastage, and dependencies are typed structured data using stable IDs.
10. Invalid references, non-overlapping-rule violations, negative/unsafe values, and dependency cycles are rejected without partial writes.
11. Draft, Active, Inactive, Archived, revision, duplication, review, completeness, and conflict states behave as specified.
12. Only Active revisions are returned by default context resolution; missing configured knowledge is explicit and never replaced by an invented or current-estimator value.
13. Context includes exact item/revision/price/tax/formula/digest lineage and excludes Draft/admin-only/sensitive data.
14. Important changes have immutable sanitized audit evidence committed atomically with the mutation.
15. The bootstrap is additive, dry-run-first, idempotent, conflict-reporting, target-guarded, and is not executed against production without later exact approval.
16. The new module runs inside the current frontend, backend, Mongo database, auth/audit systems, deployment, and current branch; no separate system is created.
17. Existing estimator screens, catalogue, calculations, Estimate APIs/models, PDFs, snapshots, Finance, Procurement, project workflow, and historical data remain behaviorally unchanged.
18. Focused and full verification, replica-set integration checks, rendered accessibility/responsive checks, frozen-estimator regressions, builds, and repository hygiene pass before the work is called complete.

## 23. Assumptions and open decisions

### Assumptions

- The “individual feature” clarification means no separately deployed service/database/frontend, while normal feature-owned internal modules and collections inside the existing application are allowed.
- The existing Mongo deployment continues to provide replica-set transactions.
- INR is the initial display currency; money remains paise in the new feature.
- Only the sole active Super Admin consumes context in this release; future AI runtime authorization is a later design.
- The complete reference workbook will be supplied before a complete production bootstrap is approved.

### Open decisions

No decision blocks the additive feature specification. The combined final selling-price formula and future AI/runtime consumer authorization are intentionally deferred because neither is needed to store, govern, preview, or return the structured knowledge safely.

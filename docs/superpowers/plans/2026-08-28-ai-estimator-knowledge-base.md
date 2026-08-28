# AI Estimator Knowledge Base — Task Plan

**Date:** 2026-08-28  
**Status:** Approved — execution mode A (parallel sub-agents)  
**Approved specification:** [AI Estimator Knowledge Base specification](../specs/2026-08-28-ai-estimator-knowledge-base-design.md)  
**Delivery model:** One additive feature on the current branch, inside the existing Lisno frontend, backend process, API, MongoDB database, authentication, audit, and deployment  
**Implementation authorization:** Not granted by this document; implementation starts only after task-plan approval and the required execution-mode choice

## 1. Outcome and execution guardrails

Implement the approved AI Estimator Knowledge Base as an internally namespaced Lisno feature while leaving the current estimator and every downstream Estimate workflow behaviorally unchanged.

This plan deliberately creates:

- feature-owned backend domain, contracts, Mongoose models, services, routes, OpenAPI schemas, bootstrap operation, and tests;
- feature-owned frontend API types, queries, pages, components, styles, and tests; and
- minimal additive entries in existing authorization, routing, navigation, audit, OpenAPI, and startup-index registries.

This plan does not authorize or create:

- a branch, microservice, worker, database, standalone UI, login, deployment, or second authorization system;
- edits to the existing estimator, Estimate storage/API, publication, Finance, Procurement, project workflow, OCR, email, or design-mapping behavior;
- AI inference, embeddings, model-provider integration, or use of the knowledge base by the existing estimator;
- a package/lockfile dependency change;
- a production connection, bootstrap dry run, bootstrap write, migration, seed, deploy, commit, or push.

## 2. Baseline, frozen boundary, and stop conditions

### 2.1 Baseline task

Before any behavior-changing writer starts, the primary integrator will:

1. capture `git status --short` and the per-target diffs for every assigned shared file;
2. record content hashes for every frozen path named in specification section 5;
3. confirm that no frozen path is already dirty or, if one is dirty, identify its owner and preserve its changes explicitly;
4. record the existing-estimator regression commands and current results where practical; and
5. freeze the cross-stack DTO, error, route-operation, query-key, revision-scope, lifecycle, calculation, and audit-summary contracts described in section 3.

The current planning baseline contains only the untracked approved specification. No implementation source is currently changed.

### 2.2 Frozen paths

No implementation task owns these paths:

**Frontend**

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/estimateBuilderCatalogue.ts`
- `frontend/src/features/leads/estimateEngine.ts`
- `frontend/src/features/leads/leadsApi.ts`
- existing Estimate payload shapes in `frontend/src/api/types.ts`
- existing estimator selectors and presentation in `frontend/src/styles/index.css`

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

`frontend/src/styles/index.css` remains untouched. The new feature stylesheet will be imported from the feature entry module, not from the frozen global stylesheet.

### 2.3 Immediate stop conditions

Stop and return to the primary integrator if any task would:

- edit a frozen path or create an import in either direction between existing estimator/downstream modules and the knowledge feature;
- grant a new permission to an existing non-Super-Admin role;
- change an existing route operation, API response, persisted Estimate shape, formula, or navigation behavior;
- add a non-transaction fallback, client-owned financial calculation, label-based join, mutable activated revision, or combined `finalPrice`;
- fabricate workbook rows, vendors, rates, or ambiguous relationships;
- require a new service, database, deployment, dependency, or lockfile edit;
- run the bootstrap against any live or external database; or
- encounter a dirty shared target whose ownership or existing change cannot be reconciled safely.

## 3. Cross-stack contract freeze

The primary integrator owns this handoff and settles it before backend service or frontend screen writers begin.

### 3.1 Public shapes and state

Define feature-local shapes for:

- item list summaries, item detail, revision history, section envelopes, completeness, activation review, reusable masters, preview, and context;
- stable string IDs, `revisionId`, `revisionNumber`, aggregate/section `version`, lifecycle state, server-derived `allowedActions`, blockers, warnings, and availability;
- integer paise, integer basis points, and canonical scaled decimal strings; and
- exact context lineage: item, revision, price version, tax version, formula version, content digest, and server evaluation time.

All specifications, section documents, and price versions are explicitly scoped by `revisionId`. The selected active revision is the sole scope for every context section and price lookup.

### 3.2 Calculation contract

The pure calculation contract will:

- use checked `BigInt` intermediates, safe-integer paise outputs, integer BPS, canonical decimal strings, and half-up monetary rounding;
- expose `basisAmountPaise` for each amount component so the server does not imply an unapproved chaining order;
- keep wastage limited to procurement quantity;
- omit `finalPrice` entirely;
- return duration as a canonical decimal with at most six fractional digits, rounded half-up under `knowledge-preview-v1`, then apply configured min/max bounds; and
- lock the approved ₹75 and inclusive ₹118 examples in focused tests.

### 3.3 Missing-data and error contract

- Optional pricing, recommendation, quality, or execution gaps return `200` with explicit availability entries.
- No resolvable Active item or missing required core identity returns `422`.
- Malformed or contradictory public identifiers return `400`, except hidden or unavailable resources use non-disclosing `404`.
- Duplicate identities, stale versions, active inbound references, effective-window overlaps, and cycles return `409` with no partial write or audit event.
- Authentication failure or stored/token identity drift returns `401`.
- A valid unauthorized role returns `403` before request validation.

### 3.4 Route-operation manifest

Register exactly 43 protected operations:

| Route family | Count | Permission |
| --- | ---: | --- |
| Basket list/create/update/archive | 4 | read/create/update/lifecycle as applicable |
| Basket Main Line list/create | 2 | read/create |
| Main Line update/archive | 2 | update/lifecycle |
| Item list, detail, history | 3 | read |
| Revision create | 1 | create |
| Section read/update | 2 | read/update |
| Revision activate | 1 | lifecycle |
| Main Line deactivate | 1 | lifecycle |
| Main Line duplicate | 1 | create |
| Admin preview | 1 | read |
| Six master families × list/create/update/archive | 24 | read/create/update/lifecycle as applicable |
| Context POST | 1 | context read |
| **Total** | **43** | Super Admin only |

The context `POST` is classified as read-only. Every route uses `authenticate → requireOperation → validation → handler`.

### 3.5 Frontend query contract

All query keys live below `['ai-estimator-knowledge']`, with distinct families for:

- item lists;
- item/revision detail;
- sections;
- history and activation review;
- reusable masters; and
- context/preview.

Section success updates the section cache and invalidates knowledge completeness, item-list summary, and history where applicable. Lifecycle changes also invalidate affected context. No mutation invalidates existing leads, Estimate, Finance, Procurement, project-workflow, or unrelated caches.

## 4. Dependency-ordered implementation tasks

### T0 — Baseline and contract handoff

**Owner:** Primary integrator  
**Dependencies:** Approved task plan and selected execution mode  
**Writes:** No product source changes; may add feature-local contract fixtures as the first implementation artifact

Actions:

1. Perform section 2 baseline capture.
2. Publish the exact DTO/error/route/query/calculation contracts from section 3 to every implementation owner.
3. Assign exclusive ownership for all shared files before writers start.
4. Keep one parent task in progress and record any contract change immediately.

Exit criteria:

- frozen hashes/diffs and dirty ownership are recorded;
- the 43-operation manifest and five permission codes are exact;
- no writer has an unresolved contract question; and
- frontend and backend agree on policy version, DTOs, errors, lifecycle, CAS, and invalidation behavior.

### T1 — Pure backend domain, validation, completeness, and calculation

**Owner:** Backend domain implementer  
**Dependencies:** T0  
**Parallel safety:** Can run alongside T3 frontend API foundations after the contract handoff

New files:

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-calculation.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/domain/ai-estimator-knowledge-completeness.ts`
- `backend/tests/ai-estimator-knowledge-domain.test.ts`
- `backend/tests/ai-estimator-knowledge-calculation.test.ts`
- `backend/tests/ai-estimator-knowledge-validation.test.ts`

Actions:

- implement closed lifecycle, section, master, relationship, quantity-rule, quality, mode, tax-treatment, availability, and formula-version constants;
- implement Unicode NFKC/case/whitespace identity normalization;
- implement canonical scaled-quantity parsing/formatting and checked financial/duration preview helpers;
- validate effective windows, slab overlap, references, duplicate/self edges, item cycles, and execution-step cycles;
- derive completeness and a canonical content digest; and
- keep the module pure: no Express, Mongoose, auth, audit, or existing estimator imports.

Exit criteria:

- exact financial/duration examples, overflow, unsafe-value, overlap, cycle, and digest tests pass;
- `finalPrice` is absent by contract and runtime test; and
- T1 changes do not touch any shared or frozen file.

### T2 — Feature persistence and application indexes

**Owner:** Backend persistence implementer  
**Dependencies:** T1 domain constants  
**Parallel safety:** Can run alongside T3 and T4; exclusively owns application-index initialization

New model files under `backend/src/models/`:

- `AiEstimatorKnowledgeBasket.ts`
- `AiEstimatorKnowledgeMainLine.ts`
- `AiEstimatorKnowledgeRevision.ts`
- `AiEstimatorKnowledgeSection.ts`
- `AiEstimatorKnowledgePriceVersion.ts`
- `AiEstimatorKnowledgeUom.ts`
- `AiEstimatorKnowledgeVendor.ts`
- `AiEstimatorKnowledgeTaxRule.ts`
- `AiEstimatorKnowledgeTaxVersion.ts`
- `AiEstimatorKnowledgePriority.ts`
- `AiEstimatorKnowledgeSurface.ts`
- `AiEstimatorKnowledgeMode.ts`

Shared-file ownership:

- `backend/src/models/application-indexes.ts`
- related assertions in `backend/tests/server.test.ts`

New tests:

- `backend/tests/ai-estimator-knowledge-models.test.ts`

Actions:

- add strict, feature-specific schemas with string IDs, `versionKey: false`, explicit integer `version >= 1`, actor metadata, and timestamps;
- add normalized partial uniqueness for non-archived Baskets, Main Lines, and masters;
- enforce unique item/revision number and revision/section key identities;
- add deterministic price/tax version identity and lifecycle/effective lookup indexes;
- make pagination deterministic with stable-ID tie-breaking;
- register all new model indexes in existing startup initialization; and
- leave cross-document overlaps, references, and graph integrity to transactional services.

Exit criteria:

- schema and index tests pass, including normalization races and archive identity behavior;
- collection/index names do not collide; and
- startup remains valid with an empty knowledge base.

### T3 — Backend authorization, audit vocabulary, and actor guard

**Owner:** Authorization/integrity implementer  
**Dependencies:** T0  
**Parallel safety:** Can run alongside T1, T2, and frontend feature work; exclusively owns every file listed below

New files:

- `backend/src/services/ai-estimator-knowledge-actor.ts`
- `backend/tests/fixtures/ai-estimator-knowledge-route-operations.ts`

Shared-file ownership:

- `backend/src/domain/authorization.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/domain/audit-actions.ts`
- `backend/src/services/auth.service.ts`
- `backend/tests/authorization-policy.test.ts`
- `backend/tests/route-operation-registry.test.ts`
- `backend/tests/frontend-authorization-contract.test.ts`

Actions:

- append the five approved permission codes only to `super_admin`;
- add the feature namespace and availability classification without altering existing registry entries;
- register the exact 43-operation manifest once;
- coordinate the backend policy-version bump with the frontend integration owner;
- add bounded audit action names without storing full section bodies; and
- implement a service guard that reloads the actor, verifies active status and token/stored-role agreement, verifies exactly one active Super Admin, and participates in the existing authorization-coordination mechanism/session for mutations.

Exit criteria:

- all role matrices and route-operation registry tests pass;
- inactive/stale-role/multiple-Super-Admin conditions fail closed;
- valid non-Super-Admin requests receive 403 before validation; and
- no existing role permission or operation changes.

### T4 — Frontend route/auth wiring and feature-local API foundation

**Owner:** Frontend integration implementer  
**Dependencies:** T0  
**Parallel safety:** Can run alongside T1–T3; exclusively owns shared frontend integration files

Shared-file ownership:

- `frontend/src/api/authorization-contract.ts`
- `frontend/src/api/authorization-contract.test.ts`
- `frontend/src/test/authFixtures.ts`
- `frontend/src/app/routeRegistry.ts`
- `frontend/src/app/routePaths.ts`
- `frontend/src/app/routePaths.test.ts`
- `frontend/src/app/router.tsx`
- `frontend/src/app/router.test.tsx`
- `frontend/src/components/layout/navigation.test.tsx`

New feature files under `frontend/src/features/ai-estimator-knowledge/`:

- `knowledgeTypes.ts`
- `knowledgeApi.ts`
- `knowledgeQueryKeys.ts`
- `knowledgePresentation.ts`
- `knowledgeMutationSync.ts`
- focused API/presentation tests

Actions:

- mirror the five permissions and backend policy version exactly;
- add routes `/admin/configuration/estimation`, `/admin/configuration/estimation/items/:itemId`, and `/admin/configuration/estimation/reusable-values`;
- add one Super Admin **Configuration** navigation destination while preserving the existing Super Admin home;
- allow only the exact configuration prefix as a Super Admin safe-return path and reject encoded traversal/other roles;
- use feature-local API types, never frozen Estimate types;
- implement knowledge-only query keys, mutations, and invalidation helpers; and
- present server-derived values without manufacturing calculations, permissions, allowed actions, or completeness.

Exit criteria:

- navigation, direct access, route focus, permission, policy parity, and safe-return tests pass;
- other roles cannot see or open the routes; and
- no existing estimator or unrelated query cache is touched.

### T5 — Transactional reusable-reference administration

**Owner:** Backend implementer A  
**Dependencies:** T1, T2, and T3 actor guard  
**Parallel safety:** Can run alongside T6 and T7; owns only the files below

New files:

- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/tests/ai-estimator-knowledge-reference.service.test.ts`

Actions:

- implement Basket create/list/update/soft archive;
- implement UOM, Vendor, Tax, Priority, Surface, and Mode list/create/update/soft archive;
- append immutable effective tax versions with overlap protection;
- enforce normalized duplicates, inbound-reference protection, aggregate CAS, deterministic pagination, and sanitized audit summaries; and
- execute each mutation and audit append in one Mongo transaction with no fallback.

Exit criteria:

- duplicate/overlap/reference/version conflicts produce 409 with no partial data or audit;
- audit failure rolls back business changes; and
- actor email, vendor notes, recommendation text, price bodies, and secrets never enter audit details.

### T6 — Transactional item, revision, section, and lifecycle administration

**Owner:** Backend implementer B  
**Dependencies:** T1, T2, and T3 actor guard  
**Parallel safety:** Can run alongside T5 and T7; owns only the files below

New files:

- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`

Actions:

- implement item list/filter/page, detail, and history;
- create Main Line plus Draft revision 1 atomically;
- read and write all eight revision-scoped sections with aggregate-plus-section CAS;
- append immutable price versions during pricing saves and retain exact price/tax references;
- implement draft creation from Active, activation review, completeness/digest, activation/supersession, deactivation/reactivation, duplication, and archive;
- remap internal step IDs on duplication, preserve external target IDs, and mark copied prices for review; and
- validate all references, effective windows, quantity slabs, and item/step graphs in the transaction.

Exit criteria:

- activated/superseded data is immutable;
- concurrent saves/actions have one winner, stale retries return 409, and no duplicate record/audit is written;
- activation is atomic with audit and prior-revision supersession; and
- archive is blocked by active inbound references.

### T7 — Admin preview and read-only context resolver

**Owner:** Backend implementer C  
**Dependencies:** T1, T2, and T3 actor guard  
**Parallel safety:** Can run alongside T5 and T6; owns only the files below

New files:

- `backend/src/services/ai-estimator-knowledge-context.service.ts`
- `backend/tests/ai-estimator-knowledge-context.service.test.ts`

Actions:

- implement deterministic admin preview using the pure T1 module;
- resolve context from exactly one Active item/revision and revision-scoped price/section data;
- use a snapshot-consistent read or equivalent immutable-reference proof so concurrent activation yields an entirely old or entirely new revision;
- use server-owned evaluation time with start-inclusive/end-exclusive price/tax windows;
- return exact lineage, explicit optional missing-data availability, and an allowlisted context DTO; and
- perform no write, audit, Estimate, project, task, or other side effect.

Exit criteria:

- missing optional sections return 200 availability; missing required Active core returns 422;
- no draft/admin/vendor-note/actor/audit data leaks;
- no `finalPrice` or existing-estimator fallback exists; and
- concurrent activation coherence is later proven in T13 replica-set tests.

### T8 — Backend HTTP, OpenAPI, and same-process composition

**Owner:** Backend HTTP integration implementer  
**Dependencies:** T3 and settled T5–T7 service contracts  
**Parallel safety:** May run alongside T10/T11 frontend pages; exclusively owns listed shared files

New files:

- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/routes/ai-estimator-knowledge-context.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`

Shared-file ownership:

- `backend/src/app.ts`
- `backend/src/openapi.ts`
- `backend/tests/api-docs.test.ts`

Actions:

- mount both routers under the existing `/api/v1` application;
- instantiate feature services with the existing Mongo connection, audit service, authorization coordination, and clock;
- preserve middleware order and existing JSON/error envelope;
- use strict Zod schemas within the existing body-size limit;
- document exact request/response/error schemas and reconcile all 43 registry entries; and
- leave `backend/src/server.ts` unchanged because no new process, connection, environment variable, or scheduler is required.

Exit criteria:

- route authorization, schema, status, OpenAPI, protected-handler marking, and operation-coverage tests pass;
- context POST is demonstrably read-only; and
- existing route documentation remains unchanged apart from additive entries.

### T9 — Feature-owned frontend foundation and interaction primitives

**Owner:** Frontend foundation implementer  
**Dependencies:** T4 types/query contract  
**Parallel safety:** Can run alongside T5–T8; owns only feature-local files

New files under `frontend/src/features/ai-estimator-knowledge/`:

- `ai-estimator-knowledge.css`
- `KnowledgeSafetyNotice.tsx`
- `KnowledgeSectionNavigation.tsx`
- `KnowledgeRepeater.tsx`
- `KnowledgeUnsavedChangesDialog.tsx`
- `KnowledgeVersionConflictDialog.tsx`
- `KnowledgeQuickAddDialog.tsx`
- `KnowledgeLifecycleDialogs.tsx`
- `useUnsavedKnowledgeGuard.ts`
- focused component/hook tests

Actions:

- reuse the existing AppShell and design-system primitives;
- implement accessible desktop/tablet tabs and a mobile section selector;
- implement keyboard-operable repeaters with accessible up/down controls rather than drag-only interaction;
- implement unsaved-navigation, lifecycle, quick-add, and 409 comparison dialogs;
- preserve local forms on conflict and never automatically replay a mutation; and
- import the feature stylesheet from the feature route/page module while leaving `styles/index.css` untouched.

Exit criteria:

- keyboard, focus restoration, accessible-name, reduced-motion, conflict, and unsaved-navigation tests pass;
- 44px touch targets and responsive no-overflow behavior are supported; and
- no dependency or global-style change is introduced.

### T10 — Frontend index and reusable-value management

**Owner:** Frontend implementer A  
**Dependencies:** T4 and T9  
**Parallel safety:** Can run alongside T11 section-editor slices

New files under the feature directory:

- `KnowledgeBaseIndexPage.tsx`
- feature-owned filters, grouped results, create-item, and create-Basket components
- `ReusableValuesPage.tsx`
- feature-owned master selector/list/editor components
- focused index and reusable-value tests

Actions:

- implement search, filters, stable pagination, loading, empty, error, stale, and permission states;
- manage all six reusable master types through one page rather than separate applications/routes;
- implement create/update/archive/version conflict behavior from server contracts; and
- make quick-added values refresh and select without resetting a parent form.

Exit criteria:

- AC 1–3 and 5 UI flows pass focused tests;
- inaccessible actions are hidden but backend remains authoritative; and
- failures preserve entered data and offer clear retry paths.

### T11 — Frontend item workspace and eight section editors

**Owner:** Frontend workspace integrator plus three non-overlapping section-editor owners  
**Dependencies:** T4 and T9; server DTO contract frozen  
**Parallel safety:** Section-editor slices may run in parallel; workspace composition starts after their public props settle

Workspace-owned files:

- `KnowledgeItemWorkspacePage.tsx`
- feature workspace header, lifecycle/history, activation review, completeness, and section loader components
- focused workspace tests

Section slice A — commercial:

- `OverviewSection.tsx`
- `PricingSection.tsx`
- `QuantityMarginSection.tsx`
- `CommercialSections.test.tsx`

Section slice B — relationships/quality:

- `ScopeSection.tsx`
- `RecommendationsSection.tsx`
- `QualitySection.tsx`
- `RelationshipSections.test.tsx`

Section slice C — execution/advanced:

- `ExecutionSection.tsx`
- `AdvancedSection.tsx`
- `ExecutionAdvancedSections.test.tsx`

Actions:

- lazy-load section data and retain independent local form state;
- render server-derived completeness, blockers, warnings, versions, allowed actions, and history;
- support quick-add without parent-form reset;
- present transparent server preview components without client arithmetic or `finalPrice`;
- store/select stable IDs only, reject closed-set mismatches, and provide accessible list reordering; and
- handle activation, deactivation, duplicate, archive, conflict comparison, and immutable history states.

Exit criteria:

- all eight sections and lifecycle states pass focused tests;
- conflicts retain local data, fetch server state separately, and never auto replay;
- recommendation/dependency editors use stable IDs and accessible controls; and
- the UI makes no claim that these values affect existing Estimates.

### T12 — Guarded additive bootstrap artifact

**Owner:** Backend bootstrap implementer  
**Dependencies:** T2 models and stable T5/T6 write invariants  
**Parallel safety:** Can run alongside T8–T11; exclusively owns its files and one package script

New files:

- `backend/src/operations/ai-estimator-knowledge-bootstrap.manifest.ts`
- `backend/src/operations/ai-estimator-knowledge-bootstrap.ts`
- `backend/tests/ai-estimator-knowledge-bootstrap.test.ts`
- `backend/tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts`

Shared-file ownership:

- `backend/package.json` for one script only; no dependency or lockfile change

Actions:

- default to dry-run mode and require explicit `--write`;
- require exact URI database/host target, target fingerprint, canonical manifest digest, approval digest, and maintenance confirmation;
- set `autoIndex: false` and `autoCreate: false` for the guarded operation;
- use stable IDs, insert-if-absent behavior, conflict reporting, one transaction, idempotent rerun, and post-commit verification;
- include only the seven named Baskets and representable supplied Plain False Ceiling data; and
- report missing vendor and ambiguous relationship targets without inventing records.

Exit criteria:

- default dry run creates no collection, index, document, or other write;
- target/digest/approval mismatch fails before mutation;
- replica-set tests prove idempotency and rollback; and
- no implementation step sources credentials or connects to Atlas.

### T13 — Integrated backend concurrency, security, and audit tests

**Owner:** Backend verification-focused implementer  
**Dependencies:** T5–T8 and T12 writers complete  
**Writes:** New test files only unless a verified defect is returned to the original owner

New files:

- `backend/tests/ai-estimator-knowledge-mongo.replica-set.test.ts`
- `backend/tests/ai-estimator-knowledge-authorization.test.ts`

Coverage:

- aggregate-plus-section CAS races and stale retry no-op;
- atomic activation/supersession and coherent context during concurrent activation;
- audit failure rollback and allowlisted audit summaries;
- activated/history immutability;
- effective price/tax overlap races and revision-scoped selection;
- duplicate/remap, inbound-reference, item-cycle, and step-cycle behavior;
- 401 drift/inactive/multiple-Super-Admin failures and 403-before-validation for every other role;
- no context writes or sensitive-field leakage;
- normalization/index races and deterministic pagination; and
- empty knowledge-base startup with old workflows still operational.

Exit criteria:

- all transaction-required tests run against a local Mongo replica set and pass;
- no test weakens transaction semantics for a standalone Mongo process; and
- any product defect is fixed by the owning writer before review continues.

### T14 — Integrated frontend behavior, accessibility, and cache tests

**Owner:** Frontend verification-focused implementer  
**Dependencies:** T4, T9–T11 writers complete  
**Writes:** New feature test files; shared regression tests only when strictly required

New tests under the feature directory:

- `KnowledgeFeatureAccessibility.test.tsx`
- `KnowledgeFeatureConflict.test.tsx`
- `KnowledgeFeatureCache.test.tsx`

Coverage:

- index, workspace, reusable values, all eight sections, overlays, and lifecycle states;
- knowledge-only invalidation and context invalidation on lifecycle change;
- conflict preservation and no automatic mutation replay;
- quick-add selection without parent reset;
- keyboard tab/selector/repeater navigation, dialog focus, route focus, accessible names, reduced motion, and no horizontal overflow; and
- permission, loading, empty, error, stale, missing-data, and responsive states.

Exit criteria:

- focused feature, router, safe-path, navigation, and accessibility tests pass; and
- existing estimator UI/engine regression tests remain unchanged and pass.

### T15 — Integrity review and owner fixes

**Owner:** `integrity_reviewer`, read-only review; original task owners fix confirmed findings  
**Dependencies:** All product writers and T13/T14 tests complete

Review checklist:

- frozen-path hashes and zero frozen diff/import direction;
- same-process/same-database composition with no extra runtime or UI;
- backend/frontend permission parity and exact operation coverage;
- stored-actor authorization coordination and middleware order;
- revision scoping, immutable history, context coherence, and effective selection;
- paise/BPS/scaled-decimal arithmetic, bases, rounding, and absence of `finalPrice`;
- transaction/CAS/index/overlap/cycle/reference correctness;
- audit allowlisting and rollback;
- bootstrap target guards and proof it was never externally executed;
- frontend cache invalidation, conflict retention, and responsive/accessibility behavior; and
- no hidden Estimate, Finance, Procurement, workflow, file, OCR, or email side effect.

Exit criteria:

- every finding is classified with evidence;
- confirmed findings are returned to their original owner and fixed; and
- integrity review is rerun on affected areas until no blocking finding remains.

### T16 — Stable-worktree verification and final handoff

**Owner:** `verification_runner`  
**Dependencies:** T15 complete and all fixes integrated  
**Writes:** No product sources

Run the exact verification lanes in section 6 against the stable integrated worktree. Report exact commands, pass/fail counts, skipped or environment-blocked checks, rendered-output locations, final dirty paths, and remaining risks. Do not call the feature complete if required transaction, accessibility, frozen-regression, or build evidence is missing.

## 5. Safe parallel execution waves and ownership

| Wave | Tasks | Parallel rule |
| --- | --- | --- |
| 0 | T0 | Primary only; contracts and ownership settle first |
| 1 | T1, T3, T4 | Parallel; backend pure domain, backend auth shared files, and frontend shared files do not overlap |
| 2 | T2, T9 | Parallel after required contracts; each has exclusive shared/style ownership |
| 3 | T5, T6, T7, T10, T11 section slices | Parallel only with the explicit file boundaries above; no shared-file edits |
| 4 | T8, T12, T11 workspace integration | Parallel; HTTP shared files, package script, and feature UI composition are disjoint |
| 5 | T13, T14 | Parallel test construction after all relevant writers finish; product fixes return to original owners |
| 6 | T15 | Integrity review on the integrated result; no concurrent writers |
| 7 | T16 | Final verification on a stable worktree; no concurrent writers |

The primary integrator owns cross-layer interpretation, contract changes, reconciliation, and all shared ownership transfers. No sub-agent may invent a fallback or modify a file assigned to another active owner. All agents are told that they share the worktree and must preserve other changes.

## 6. Verification plan

### 6.1 Focused backend feature tests

```bash
cd backend
npm test -- tests/ai-estimator-knowledge-domain.test.ts tests/ai-estimator-knowledge-calculation.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-models.test.ts
npm test -- tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-routes.test.ts
npm test -- tests/ai-estimator-knowledge-authorization.test.ts tests/ai-estimator-knowledge-mongo.replica-set.test.ts tests/ai-estimator-knowledge-bootstrap.test.ts tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts
```

### 6.2 Backend authorization, registry, documentation, audit, and startup

```bash
cd backend
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts tests/audit-security.test.ts
```

### 6.3 Frozen backend behavior

```bash
cd backend
npm test -- tests/leads.test.ts tests/estimate-pdf.test.ts tests/estimate-pdf-routes.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-decision.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts
npm test -- tests/project-finance.test.ts tests/project-finance-routes.test.ts tests/project-finance-mongo.replica-set.test.ts tests/procurement-routes.test.ts tests/procurement-mongo.replica-set.test.ts tests/project-workflow.test.ts tests/project-workflow-routes.test.ts tests/project-workflow-mongo.replica-set.test.ts tests/estimate-design-mapping.test.ts tests/estimate-design-mapping-migration.test.ts tests/estimate-design-mapping-migration.replica-set.test.ts tests/full-journey.test.ts
```

If repository inspection at implementation time shows a renamed or split test, the verification runner records the exact replacement rather than silently omitting the behavior.

### 6.4 Focused frontend feature and shared integration

```bash
cd frontend
npm test -- src/features/ai-estimator-knowledge
npm test -- src/api/authorization-contract.test.ts src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/estimateEngine.test.ts
```

### 6.5 Full verification

```bash
cd backend
npm run typecheck
npm test
npm run build

cd ../frontend
npm run typecheck
npm test
npm run build

cd ..
git diff --check
git status --short
```

There is no repository lint script, so this plan does not claim a lint result.

### 6.6 Frozen-path and dependency-direction verification

Compare final hashes and diffs to T0 for every path in section 2. Confirm through targeted `rg` checks that:

- no existing estimator/downstream module imports `ai-estimator-knowledge`;
- knowledge modules do not import Estimate models/routes/catalogues, Finance, Procurement, project workflow, OCR, files, or email modules; and
- the only shared changes are the explicitly assigned additive registries, router mounts, OpenAPI merge, index initialization, and frontend authorization/navigation/router entries.

### 6.7 Rendered interaction and accessibility QA

Use deterministic test-only feature fixtures in the existing frontend. Verify at:

- 1440×900;
- 1024×768;
- 768×1024;
- 390×844; and
- 320px width.

Exercise index, item workspace, reusable values, all eight sections, loading/empty/error/stale/missing states, activation review, quick-add, conflict, unsaved navigation, and lifecycle dialogs. Verify keyboard order, tab and mobile-selector semantics, 44px targets, focus movement/restoration, accessible names, axe results, 200% zoom, reduced motion, and `scrollWidth <= clientWidth`.

Any screenshots or reports go only under `/tmp/lisno-ai-estimator-knowledge-qa` and are not retained in the repository.

## 7. Acceptance-criteria traceability

| Specification acceptance criteria | Implemented by | Verified by |
| --- | --- | --- |
| AC 1–2: Super Admin destination and enforcement | T3, T4, T8 | T13, T14, auth/router/navigation suites |
| AC 3: Basket/Main Line/master administration | T2, T5, T10 | service, route, UI, index, and reference tests |
| AC 4–5: eight-section workspace and quick add | T6, T9, T11 | workspace/section/quick-add interaction tests and rendered QA |
| AC 6: immutable price/tax versions | T2, T5, T6 | model/service/replica-set history and overlap tests |
| AC 7–8: deterministic previews; no combined final price or estimator change | T1, T7, T11 | exact math tests, response-shape tests, frozen estimator suites |
| AC 9–10: typed stable-ID data and invariant rejection | T1, T2, T5–T7 | validation/service/replica-set cycle, overlap, unsafe-number, rollback tests |
| AC 11: lifecycle, revisions, duplication, completeness, conflicts | T6, T9, T11 | service concurrency plus UI lifecycle/conflict tests |
| AC 12–13: Active-only coherent context and exact safe lineage | T7 | context, security, no-write, and concurrent-activation tests |
| AC 14: immutable sanitized transactional audit | T3, T5, T6 | audit allowlist and injected-failure rollback tests |
| AC 15: guarded additive bootstrap | T12 | dry-run/write-mode/target/digest/idempotency/rollback tests; no live run |
| AC 16: one existing application/database/deployment | T2, T4, T8 | architecture/frozen-diff review and existing startup/build tests |
| AC 17: existing estimator/downstream unchanged | All stop conditions | frozen hashes/import checks and listed legacy regression suites |
| AC 18: complete verification | T13–T16 | focused/full/replica-set/rendered/build/hygiene evidence |

## 8. Compatibility, failure handling, and rollback

- Empty knowledge collections are a supported rollout state; all old versions and workflows ignore them.
- Every mutation plus bounded audit append commits in one replica-set transaction. Transaction or audit failure rolls back fully.
- Activated revisions and effective price/tax versions are immutable; rollback creates or activates a new version rather than rewriting history.
- A code rollback removes new route/index initialization usage but retains feature collections as historical data. No down migration or collection drop is planned.
- Context is read-only and Active-only. It never falls back to existing estimator values and never creates audit or downstream work.
- Rejected mutations write no audit event. Operational diagnostics may contain only opaque IDs, section key, duration, result code, and blocker count.
- No production bootstrap, migration, deploy, commit, or push is part of implementation verification.

## 9. Final handoff requirements

The final implementation handoff will report:

- outcome and principal cross-stack decisions;
- affected files grouped by backend, frontend, shared registries, tests, and bootstrap artifact;
- exact focused/full/replica-set/rendered commands and results;
- frozen-path and dependency-direction evidence;
- unrun or environment-blocked checks;
- confirmation that no production bootstrap/deployment/migration/commit/push occurred; and
- remaining risks, including incomplete source workbook data or any external action still requiring approval.

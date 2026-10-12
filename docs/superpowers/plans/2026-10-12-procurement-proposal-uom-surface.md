# Procurement proposal UOM and Surface implementation plan

Date: 2026-10-12
Status: Implemented in Mode A. T0–T6 executed. Feature-focused checks pass; whole-repository verification is qualified by the broad-suite failures below.

Source of truth: [approved specification](../specs/2026-10-12-procurement-proposal-uom-surface-design.md).

## Outcome and boundaries

Add working **Add UOM** and **Add Surface** controls to both Procurement basket proposal targets. Save new values privately in the proposal, make them available to its Main Lines, allow Super Admin review edits, and publish them atomically with the approved basket.

Existing shared Configuration values remain selectable. Procurement gains no generic Configuration create/update permission. Preserve submitted history, existing Super Admin screens and behavior, inherited parent quality, all prior worktree changes and all configured-database records. No seeds, migrations, sync, production changes, deployment, commits or dependency additions are included.

This is a persistence and approval change, not just enabling hidden buttons: the current dialogs write directly to shared Configuration and current proposal validators only accept live catalog references.

## Contract to settle before parallel implementation

The primary owns the following shared decisions and publishes their final TypeScript contracts before backend and frontend writers start:

1. Add `uom` and `surface` proposal resource kinds. Payloads use existing normalized name, optional description and generated code semantics; UOM adds `decimalScale` from 0 through 3. Do not expose active/inactive lifecycle, order or ownership fields in proposal forms. Bound both resource counts and total bytes alongside existing proposal limits; use an explicit limit of 100 proposed values per kind and preserve the existing 8 MiB snapshot cap.
2. Use server-generated stable resource IDs suitable for publishing as the eventual shared master IDs. Revised copies receive new private IDs; remap every supported UOM and Surface reference. Extend the publication result additively with published master identities. Existing proposals and stored decision results with no new resources remain compatible.
3. Add list/create/update/remove endpoints for only `uoms` and `surfaces` under each existing proposal base. Planned shape: `/:proposalId/masters/:masterKind` for GET/POST, and `/:proposalId/masters/:masterKind/:resourceId` for PATCH/DELETE. GET uses existing snapshot and pagination semantics; POST/PATCH return the existing mutation envelope with updated detail and resource, and DELETE returns detail with a null resource. Writes carry existing aggregate/request version guards. Final route names may follow an equivalent established convention without changing this behavior.
4. Keep the existing global reference endpoint unchanged. Fetch proposed values separately, with query keys including actor, scope, proposal, snapshot and saved head, and combine them only in the active proposal editor. Proposed provenance is explicit; a selectable adapter must not represent a private value as a published active record.
5. Extend proposal validation with a narrowly scoped resolver for private UOM/Surface values and their precision. Default Configuration validation continues to use the existing live resolver. No fake shared documents, temporary global inserts, label-based reference matching or bypass flags are permitted.
6. Preserve the existing CAS approach for resource creation: a double submission with the same expected version can create at most one resource. An uncertain network result must reconcile the saved proposal before retrying; do not retry creation automatically with a fresh version. Existing submit/decision command idempotency remains authoritative.
7. Preserve dirty Overview fields across a private master write that advances the aggregate version. Advance a draft's version guard only when the exact successful local command and unchanged saved section prove it is safe. Other concurrent changes retain the established conflict/reconciliation path. Do not simply replace the user's draft with a refetched section.

If investigation contradicts an approved product or safety requirement, reconcile the specification before expanding scope. Routine implementation choices within these contracts do not reopen approval gates.

## Dependency-ordered tasks

Keep one parent task in progress. T0 and T1 complete before any parallel writers; T5 and T6 run on the integrated worktree after writers finish.

| Task | Deliverable and affected areas | Owner | Dependency | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T0: capture baseline and trace reference paths | Capture initial dirty paths, relevant diffs and hashes, including untracked feature files. Record current Configuration and proposal behavior. Trace every UOM/Surface reference in section, price, precision, removal and revised-copy paths. | Primary; bounded read-only audits in Mode A | Plan approval and execution choice | AC2–AC6 |
| T1: establish shared contract | Set resource/input/publication types, route shapes, limits, permissions and private-reference validation interface. Add aligned backend and frontend contract definitions. Document exact writer ownership before delegation. | Primary | T0 | AC3–AC6 |
| T2: implement private resources and publication | Implement immutable master resources, guarded CRUD, snapshot reads, reference-aware removal, local validation, revision remapping and transactional publication. Add focused persistence/approval regressions. | Backend owner | T1 | AC2–AC7 |
| T3: wire HTTP, permissions and inventories | Register the proposal-only routes, strict validation, permission operations, API descriptions and matching contract/inventory tests. Keep generic Configuration permissions unchanged. | Primary | T1; service methods supplied by T2 | AC4–AC6 |
| T4: implement controls and review UX | Implement Add/Edit/Remove forms, private catalog reads, immediate selection and explicit section save, draft/version preservation, safe async completion and review display. Add rendered interaction tests and responsive styles. | Frontend owner | T1; can use the agreed contract while T2/T3 progress | AC1–AC3, AC6, AC8 |
| T5: integrate and review integrity | Reconcile adapters, all reference locations, error responses, query invalidation and existing review notifications. Independently review the complete diff and resolve findings. | Primary and integrity reviewer in Mode A | T2–T4 finished | AC1–AC8 |
| T6: final verification and handoff | Run focused and cross-cutting tests, typechecks/builds, responsive interaction/accessibility checks and worktree-preservation checks. Record exact results and limitations. | Verification runner in Mode A, then primary handoff | T5 findings resolved | AC1–AC8 |

## Ownership and parallel boundaries

### Primary: cross-stack contract and integration

- `backend/src/contracts/vendor-basket-proposal.ts` and `frontend/src/features/vendor-basket-proposals/proposalTypes.ts`.
- `backend/src/routes/vendor-basket-proposals.ts`, `backend/src/openapi/vendor-basket-proposals.ts`, canonical route-operation and authorization inventories, and corresponding contract fixtures/tests.
- Any necessary frontend authorization inventory alignment, without broadening global Configuration permissions.
- Specification/plan, baseline artifacts, final review resolution and integration.
- The primary creates contracts first, then stops editing files assigned to another writer. An agent requesting a contract change returns it to the primary for coordinated application.

### Backend implementation owner

- `backend/src/models/VendorBasketProposalResource.ts`; `VendorBasketProposal.ts` only if an additive compatible shape requires it.
- `backend/src/services/vendor-basket-proposal.service.ts`, `vendor-basket-proposal-publication.ts`, and a focused proposal-master helper if needed to keep existing services manageable.
- Narrow changes to `ai-estimator-knowledge-item.service.ts` or existing master normalization/code-generation helpers where proposal validation must reuse authoritative logic. Defaults and behavior for all existing Configuration callers must be preserved.
- New `backend/tests/vendor-basket-proposal-masters.replica-set.test.ts`, with existing proposal, publication and bounds tests updated as needed. No edits to primary-owned authorization/API inventory tests.
- No configured-database connection, migration execution, seed, background-sync action or new dependency.

### Frontend implementation owner

- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.tsx`, `proposalApi.ts`, supporting proposal form/helper modules, fixtures, focused tests and scoped CSS.
- `KnowledgeOverviewPanel.tsx`, `KnowledgeModeSurfacePanel.tsx` and their tests only for backward-compatible optional presentation/callback support. Existing Configuration defaults remain unchanged. Use visible text actions without introducing new icons.
- Proposal forms use existing field/button/panel components and pure shared validation where appropriate. Do not wire Procurement to `KnowledgeMasterEditorDialog` or `KnowledgeSurfaceEditorDialog` live mutations. Extract presentation-only helpers only if this makes reuse safe without rewriting working dialogs.
- Existing `KnowledgeBasketRequestReview` integration only where proposed-value review or approved-catalog invalidation needs it. Do not redesign the Configuration page or change direct master-management behavior.
- No backend or primary-owned frontend contract/authorization edits.

### Review and verification owners

- Read-only review of assigned code and evidence. Verification may create ignored test/browser artifacts but may not alter product sources, specifications, dependencies or configured databases.
- All agents must be told they are sharing a dirty worktree: preserve others' changes and stay within explicit ownership. Reassign files before overlapping edits.

In **Mode A**, run independent reference/publication and frontend draft-state audits after T0 when useful. After T1, T2 and T4 can run in parallel; primary can prepare T3 against the agreed service contract. Integrity review and final verification are sequential after all writers finish.

In **Mode B**, the primary performs the same tasks inline without implementation subagents. Do not spawn any subagent before the execution-choice gate for this task.

## Backend implementation details and checks

- Append private values using the existing resource/head transaction, actor identity and audit patterns. Validate duplicate normalized names/codes within the same kind and against non-archived shared entries. Different proposals may independently contain the same private name; approval must resolve any live conflict.
- Include private resources in digest, byte/count bounds, submitted/review/approved manifests, change reports and rejected-proposal revision copies. Preserve old manifests byte-for-byte when they contain no new kinds.
- Resolve Overview `uomId`, Surface arrays and every other supported section/price/productivity/precision reference through a complete inventory from T0. Test references outside Overview so missing remapping cannot pass accidentally. Keep kind mismatch and cross-proposal IDs invalid.
- Enforce reference-aware removal across the whole saved proposal. Return stable affected line/resource IDs with usable messages. Pending local section edits are preserved in the UI; they cannot make a saved referenced resource deletable.
- Readiness performs no Configuration writes or dependency-counter updates. In publication, revalidate the private and live catalog, create new active masters with established code/order/audit semantics inside the caller's transaction, then run normal hierarchy, section, activation and dependency coordination. Never start or commit a separate master transaction.
- Use the existing shared unique indexes to arbitrate concurrent approvals or normal Configuration creation. Return a useful conflict and roll back all newly created masters and basket rows. Existing active shared dependencies retain their concurrency protections.
- Preserve the exactly-once request submission notification and its rollback behavior. Adding/editing a private value alone must not enqueue a Super Admin notification.

## Frontend implementation details and checks

- Show named actions in both editable proposal targets; retain current desktop panel width and adapt buttons/forms for small screens. Leave unrelated tabs and normal Configuration layout unchanged.
- Add UOM form: Name, Quantity decimal places 0–3, optional Description. Add Surface: Name and optional Description. Use proposal-specific explanatory text and action labels.
- Make proposed values discoverable for review/edit/remove within the existing Overview area without a new navigation tab. Identify them as proposed; do not expose edits for shared values.
- On successful creation, update private reference/detail caches, then select the new value in the originating line's current draft. Preserve all other draft fields and keep the section dirty until explicitly saved. Block competing mutations while the form is saving.
- Handle uncertain responses, duplicate names, stale versions, validation errors, permission loss and failed reference refreshes without clearing user input. Recover the saved resource before retrying a creation whose outcome is unknown.
- Associate async callbacks with actor, proposal, snapshot, line and originating command. Closing/switching context must not mutate another editor. Private caches and pending callbacks must be cleared or invalidated on identity changes.
- Refresh private reference lists, readiness, hierarchy and review-change queries after resource mutation. Refresh shared master catalogs and basket/vendor selectors after approval through existing query-sync conventions.
- Preserve focus trapping/restoration, nested-panel dismissal order, accessible field errors, named buttons, loading feedback and keyboard operation. Scope style overrides to proposal opt-ins so existing Configuration screenshots remain unchanged.

## Verification matrix

| Area | Required evidence |
| --- | --- |
| Visibility and entry | Both target kinds show named Add actions when editable; absent or disabled for submitted/read-only/denied states, unavailable references and competing saves. |
| CRUD and draft safety | Create/select/save/reload both kinds; edit and unreferenced removal; reject referenced removal; preserve unrelated unsaved fields; quick-add's own version advancement does not falsely conflict; external stale version still conflicts. |
| Isolation | Two Procurement users and two proposals cannot read or reference one another's private values; global catalog responses/caches contain none; unsupported kind and ownership tampering rejected. |
| Publication | Both basket targets publish valid shared values and all section references in one transaction; duplicate/collision, activation, audit or stale-decision failure leaves no partial master/hierarchy/decision writes; replay publishes once. |
| History | Submitted values immutable during review edits; approved values reflect reviewed content; rejected proposal revision creates new private IDs and remaps every reference; older proposals remain readable. |
| Data semantics | Name/code normalization, inactive/archived conflict rules, UOM precision and existing finance/rate validations remain authoritative; no name-based substitutions or fake fallback values. |
| Notifications | Draft Add/Edit/Remove sends none; submission sends the established request notification once; failed notification persistence retains existing rollback behavior. |
| Configuration regression | Normal Super Admin UOM/Surface create/edit UI and APIs retain behavior; shared editor default rendering unchanged; generic Configuration mutation denied to Procurement. |
| Rendered QA | Main Basket and Sub-Basket at approximately 1440 px and 390 px; dialogs, validation failure, network/conflict recovery, proposed and shared selections, keyboard/focus, read-only review and no horizontal overflow. Use disposable fixtures, never user DB records. |

## Commands and sequencing

Start with focused tests as implementation slices become stable. Once integrated, run the final verification lane once; repeat checks only for new changes, failures or unresolved concerns.

Backend focused, from `backend/`:

```sh
npm test -- tests/vendor-basket-proposal-masters.replica-set.test.ts tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-proposal-publication.replica-set.test.ts tests/vendor-basket-proposal-bounds.test.ts tests/vendor-basket-request-notifications.replica-set.test.ts --maxWorkers=2
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
```

The new master test filename above is planned, not an existing test result. Run existing item/master tests selected by T0 for every shared validation/helper touched, including direct Configuration master creation and UOM precision cases.

Frontend focused, from `frontend/`:

```sh
npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx src/features/vendor-basket-proposals/proposalDataSource.test.ts src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceEditorDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/notifications/BasketNotifications.test.tsx src/api/authorization-contract.test.ts
```

Add the new proposal-master form/helper tests to the focused invocation. Run typecheck and build in both workspaces. Because the change crosses shared validation, persistence and approval, run the backend and frontend full suites on the integrated result, using bounded workers for replica-set resource use where needed. Record pre-existing failures separately and investigate their relation to this change; never report an unrun suite as passed.

Use browser tooling with an isolated fixture server or disposable integration environment for rendered checks. Capture temporary screenshots/evidence under ignored output or `/tmp`; do not generate fake requests, vendors or masters in the configured local database. No production browser writes.

Repository final checks:

```sh
git diff --check
git status --short
```

Compare against T0 hashes and scoped diffs. There is no lint script; do not claim lint validation. OCR checks are out of scope. No live migration is expected or authorized.

## Handoff and gate state

- Specification approved by the user.
- Task plan approved. The user selected Mode A; implementation is authorized.
- Final handoff records the controls delivered, approval behavior, affected files, exact tests/builds/browser results, temporary artifact paths, unrun checks and remaining limitations. Update the durable documents with actual outcomes; do not retain runtime artifacts in tracked source.

## Execution record

- Baseline captured before writers: `/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/lisno-proposal-masters-afcx9ndc`, with 3,177 source hashes, initial dirty paths and tracked diff.
- Independent backend and frontend audits completed read-only. References include Overview UOM, execution productivity UOM, pricing UOM and quantity-margin slab-rate UOM, plus Overview and scope Surface arrays; removal/revision must include inactive saved rows.
- Shared contracts now include `uom`/`surface` resources, optional snapshot/publication masters, 100-per-kind limits and existing CAS mutation envelopes. Planned route shape retained.
- Backend ownership additionally includes a narrow pure code-generation helper extraction and the corresponding delegating calls in `ai-estimator-knowledge-reference.service.ts`, preserving exact Configuration output.
- Frontend ownership additionally includes optional proposed-choice props in `KnowledgeSurfaceMultiSelect` and `KnowledgeModePanel` for selection and UOM precision without inventing shared active status.
- A separate test agent owns `backend/tests/api-docs.test.ts` and new `backend/tests/vendor-basket-proposal-master-routes.test.ts`; primary retains route and operation inventories. All other implementation ownership follows the plan.


## Implementation and review outcome

- Delivered private UOM/Surface create, edit, remove and snapshot reads with existing proposal and request CAS. Added eight authenticated routes and synchronized the 415-operation registry and OpenAPI inventory; generic Configuration permissions are unchanged.
- Private resources use stable IDs, reference-aware removal, normalized uniqueness and proposal-local UOM precision. Revision copies remap all supported references. Approval creates shared masters and basket contents in the same transaction, including audit and existing notifications.
- Both proposal targets show Add UOM and Add Surface. New values auto-select without losing unsaved Overview fields, remain explicitly proposed and require section save. Super Admin can review/edit them; normal Configuration defaults remain intact.
- Integrity review found and closed one issue: proposed masters became hidden after deleting the last Main Line. The list now remains available without a line, with guarded edit/removal and separate creation requirements. Procurement and Super Admin regressions pass.
- Additional test-only ownership: existing registry counts updated for eight new routes; ProcurementVendorProfile gained an empty private-master response fixture to eliminate unhandled request warnings. No product scope expansion.

## Verification evidence recorded so far

- Backend new transactional master tests: `npm test -- tests/vendor-basket-proposal-masters.replica-set.test.ts --maxWorkers=1`, **9/9 passed**. Covers isolation, CAS, precision, both publication targets, replay, rollback, collision races and revision remapping.
- Backend HTTP and API docs: **77/77 passed**. Final full run also passed the corrected route registry **44/44**.
- Frontend integrated focused lane: **165/165 passed** across 14 files. Final no-line master/workspace checks: **38/38 passed**, with a subsequent **15/15** master-only pass. Updated ProcurementVendorProfile fixture: **59/59 passed**, no unhandled master requests.
- Both workspace `npm run typecheck` and `npm run build` passed. Frontend build retains its bundle-size warning. No lint script exists; no lint or OCR checks were run.
- Browser checks used a new disposable Mongo replica set and real app components/services on port 4211. Created and saved both values for both proposal targets, preserved unsaved selections, reloaded saved values, restored button focus, edited a value as Super Admin and approved it. Approved snapshots had no duplicate option IDs. Normal Configuration rendered with its existing Add Unit/Add Surface actions.
- Rendered 1440 px and 390 px layouts had no horizontal overflow; desktop drawer measured 1008 px (70%). Axe reported zero violations in both proposal targets and in normal Configuration. Final reviewed/approved and Configuration browser sessions reported no console errors. Desktop/mobile screenshots inspected visually.
- Browser/server closed after QA; disposable database cleanup triggered. Evidence moved out of the source tree to `/tmp/lisno-proposal-masters-browser-evidence`. Logs use `/tmp/lisno-masters-final-*.log`; changed-path manifest `/tmp/lisno-masters-final-changed-paths.json`.
- T0 hash comparison: 31 existing files changed, all assigned feature/shared adapter/tests/docs paths. Seven new source/test modules belong to this feature. No unrelated baseline path changed, no dependency or lockfile changed. `git diff --check` passed.
- Broad frontend suite: **4,692/4,716 tests passed**, 300/306 files passed; 24 failures across accessibility smoke, PasswordResetPage, designer furniture, KnowledgeItemWorkspaceLayout, KnowledgeModeLayout and KnowledgeScreens. Layout assertions reference files identical to T0; KnowledgeScreens failures concern older Specifications/Save/query expectations. A baseline suite was not executed, so prior failure is not claimed as independently reproduced.
- Initial broader backend focused lane exposed three unchanged code/test mismatches: historical reference deletion and reopened vendor induction readiness. T0 reconstruction confirmed their failing paths and tests were unchanged. Two new publication test assertions were corrected to read UOM/Surface from the saved Overview revision, and operation count expectations were updated. Both corrected lanes pass.
- No configured local database writes, production actions, migration, seed, sync, commits, pushes, deployment or dependency changes were performed for this task. Whole-repository verification remains qualified by the broad-suite failures; feature-focused verification passes.


### Final commands

From `frontend/`:

```sh
npm test -- src/features/vendor-basket-proposals src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceEditorDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/notifications/BasketNotifications.test.tsx src/api/authorization-contract.test.ts --maxWorkers=2
npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx
npm run typecheck
npm run build
npm test -- --maxWorkers=2
```

From `backend/`:

```sh
npm test -- tests/vendor-basket-proposal-masters.replica-set.test.ts --maxWorkers=1
npm test -- tests/vendor-basket-proposal-masters.replica-set.test.ts tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-proposal-publication.replica-set.test.ts tests/vendor-basket-proposal-bounds.test.ts tests/vendor-basket-proposal-master-routes.test.ts tests/vendor-basket-request-notifications.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts --maxWorkers=2
npm run typecheck
npm run build
npm test -- --maxWorkers=2
```

From repository root: `git diff --check`, `git status --short`, and the T0 SHA-256 path comparison. Backend tests used disposable local Mongo replicas; sandbox socket-denied attempts were rerun with execution permission and are not counted as passing runs.


### Final integrated result

- Backend full suite finished: **5,647 passed / 16 failed / 5,663 total**, **267 passed / 7 failed / 274 files**, 470.43 seconds. Failing files cover project purchase-order transactions (5), basket-quality history (1), full-journey DTO expectations (2), lead DTO expectations (4), legacy inline-classification permission expectation (1), historical reference deletion (2) and reopened vendor induction readiness (1). No unverified assertion that the whole repository is green.
- In that final backend run, the new master suite **9/9**, proposal **33/33**, publication **19/19**, bounds **5/5**, and route registry **44/44** all passed. Earlier new HTTP/API checks passed **77/77**. No task-specific failing regression remains.
- Frontend full suite finished: **4,692 passed / 24 failed / 4,716 total**, **300 passed / 6 failed / 306 files**. Feature-focused **165/165** and amended ProcurementVendorProfile **59/59** pass. Existing code/test expectation mismatches are not silently repaired as part of this feature.
- Both builds and typechecks passed; final `git diff --check` passed and status was inspected. Browser QA artifacts were moved out of the repository, and the disposable server exited successfully after cleanup. No configured local or production data changed.
- Remaining limitation: broader-suite failures require separate investigation; unchanged inputs/paths have been traced for the relevant shared-editor and backend mismatches, but a complete pre-task baseline suite was not run. The requested controls and approval behavior are implemented and feature-verified; no deployment was performed.

# Procurement basket configuration and Super Admin approval: task plan

Date: 2026-10-11
Status: Approved. User selected Mode A (parallel sub-agents); implementation in progress.
Specification: [Approved design](../specs/2026-10-11-procurement-basket-configuration-approval-design.md)
Risk: High. Authorization, shared Configuration, financial configuration, immutable submission history, and transactional activation.

## Outcome and preservation boundary

Procurement will configure and save a complete proposed basket from the vendor editor, submit it, and track its decision. Super Admin will review and edit a separate copy, then approve and activate the complete hierarchy. Only successful approval will create ordinary Configuration records. The vendor form stays intact and basket selection remains explicit.

Existing Super Admin Configuration editing, reusable values, lifecycle actions, legacy name-only requests, navigation, dashboards, permissions, and history must retain their behavior. Shared editor components keep their current live data source by default; proposal mode requires an explicit adapter. No existing Configuration record is rewritten to accommodate proposals.

This plan contains the implementation contract required by the approved specification. The specification remains the product source of truth. There are no unresolved product questions.

## Evidence and worktree baseline

- Discovery traced the current name-only flow through `VendorBasketFields`, `VendorBasketRequestDialog`, the vendor request API/model/service, and the Super Admin queue/decision panel.
- `KnowledgeItemWorkspacePage`, `KnowledgeModePanel`, `KnowledgeBasketQualityPanel`, and `useKnowledgeSavedSummary` currently call live Configuration APIs. Reusing their UI without adapting reads, writes, and query keys would cross the proposal isolation boundary.
- Main Line activation and pricing materialization are implemented in `backend/src/services/ai-estimator-knowledge-item.service.ts`. Publication must reuse their validation, reference coordination, money handling, and revision semantics.
- `VendorBasketRequest` has immutable name/vendor metadata and pending-request uniqueness indexes. Mutable authoring drafts must not be inserted into that queue model prematurely.
- Existing request and Configuration transaction tests use the isolated Mongo replica-set helper. No test needs the user's local or production database.
- At plan creation, `git status --short` showed only the untracked specification for this task. No application sources were changed during specification/task planning. Recapture dirty paths and per-target diffs before implementation; intervening work must be preserved.

## Frozen implementation contract

### Persistence and versions

Use additive proposal collections and an additive discriminator on the existing request queue.

1. `VendorBasketProposal` owns author identity, immutable vendor context, schema version `1`, server-allocated basket ID, aggregate version, working resource manifest, timestamps, optional rejected-request lineage, and optional linked queue request ID. Its authoring head is mutable only before submission.
2. `VendorBasketProposalResource` stores immutable, versioned resource values: basket metadata, Sub-Basket metadata, Main Line metadata, each supported Main Line section, and one basket-quality resource. Each row includes proposal ID, resource ID/kind, resource version, actor, timestamp, byte size, canonical content digest, and payload. References in manifests identify exact resource versions. Parent relationships and display order use stable IDs.
3. On submission, freeze a submitted manifest/version/digest, initialize a review head referencing the same immutable resources, and create a `VendorBasketRequest` header in the same transaction. Add `kind: "configuration_proposal"`, `proposalId`, schema/submission identity, and compact counts. Missing `kind` continues to mean a legacy name request. Existing immutable metadata and pending uniqueness indexes remain in force.
4. Before submission, the proposal's effective state is `draft`. After submission, the existing request's `pending | fulfilled | rejected` is the authoritative decision state. Do not maintain a separately mutable duplicate status on the proposal. List/detail DTOs derive the combined state.
5. Review saves append resource versions and advance the review manifest only while the linked request is pending. They atomically compare/increment proposal aggregate version and request version. The submitted manifest never changes. Approval freezes the final reviewed manifest/digest and records canonical published IDs on the decision.
6. Every content mutation requires `expectedVersion`. Review writes and decisions additionally require `expectedRequestVersion`. Writes return current aggregate/request versions and the changed resource envelope. All mutations record an audit event in the same transaction. Resource snapshots referenced by submission/decision/audit history are retained.
7. Allocate proposal, basket, Sub-Basket, Main Line, and proposal-owned pricing identities on the server. Preserve hierarchy IDs at publication; allocate live revision/storage IDs at publication and persist explicit mappings. A revised rejected proposal receives new hierarchy IDs and remaps internal references; it never reuses the rejected proposal's owned IDs.
8. Authoring uses the existing section keys and payload validators. A mode save persists its pricing commands/values in proposal storage only. It must not call a helper that writes shared price records. Publication materializes prices through canonical Configuration logic, including retained price windows, GST policy, integer paise and explicit basis-point/unit conversions. Do not copy enriched display DTOs directly into persisted sections.

Indexes: unique proposal creation key per requester; proposal requester/updated-time pagination; unique non-null linked request ID; unique `(proposalId, resourceId, resourceVersion)`; resource lookup by proposal/kind/parent. Preserve existing request indexes and idempotency fields. No historical backfill or data conversion is required by this design.

### Bounds and response shapes

Keep the existing 300 kB JSON body limit. Initial explicit proposal limits are one basket, 50 Sub-Baskets, 100 Main Lines, and 8 MiB of canonical current-snapshot resource content. A single resource payload is limited to 240 KiB, within the HTTP envelope limit. Apply existing domain row limits as well; proposal price materialization is additionally bounded to 100 records per line and 2,000 per proposal. Validate limits before committing each save and again on submission/publication. Return actionable findings; never truncate content or partially publish.

These are safety ceilings, not targets or measured throughput claims. Boundary tests and a representative large-proposal transaction test must validate the chosen limits. If evidence requires changing user-visible limits or the publication architecture, update this plan before continuing that affected slice.

Use existing normalized names (NFKC, trimmed/collapsed whitespace, maximum 240 characters), bounded IDs, 1,000-character decision reasons, and existing Configuration field limits. Idempotency keys retain the existing 8–128-character alphabet. Lists use existing `limit/offset` conventions, default 20 and maximum 100, with stable timestamp/ID ordering. Load hierarchy, resources, and change history separately instead of returning all section payloads in list responses.

Contract DTOs:

- `ProposalSummary`: ID, kind/schema version, effective status, aggregate/request versions, vendor context, basket name, counts, saved/submitted/decided times, reason, lineage, and published basket ID when available.
- `ProposalDetail`: summary plus actor-appropriate capabilities, current head identity/digest, submitted identity/digest, basket metadata, and hierarchy counts. Capabilities help presentation; backend checks remain authoritative.
- `ProposalResource`: proposal/resource identity, kind, parent identity, resource version, head identity, payload, digest, and saved actor/time. Section payloads use established Configuration shapes.
- `ProposalReadiness`: evaluated head/version/digest, ready flag, and structured findings `{resourceId, mainLineId?, sectionKey?, path?, code, message}`. Submission/approval rerun validation; a previous readiness result is never authority to publish.
- `ProposalDecisionResult`: terminal request/versions, submitted and approved digests, reason or published hierarchy mapping. Return this persisted result for identical authorized retries.

The backend contract belongs under `backend/src/contracts`; frontend types follow existing frontend/shared boundaries. Do not change backend `rootDir` or introduce a cross-workspace runtime import to share one TypeScript file. Contract fixtures/tests check mirrored wire shapes.

### Additive API surface

Use `P = /procurement/vendor-basket-proposals` and `A = /admin/ai-estimator-knowledge/basket-proposals` below. Existing request endpoints remain compatible.

| Method/path | Contract and authority |
| --- | --- |
| `POST P` | Create an own draft from vendor context and basket name; `idempotencyKey`. Does not create a vendor. |
| `GET P/mine` | Own proposals, optional effective status, paginated. Includes drafts; excludes other requesters. |
| `GET P/references` | Paginated, allowlisted reference kinds needed by the editors; no global writes. |
| `GET P/:proposalId` / `GET A/:proposalId` | Own proposal / submitted proposal visible to sole active Super Admin. |
| `GET .../:proposalId/hierarchy` | Paginated Sub-Baskets/Main Lines, selected saved snapshot. |
| `GET .../:proposalId/resources/:resourceId` | One resource from an authorized saved snapshot; resource/version must belong to its manifest. |
| `GET .../:proposalId/readiness` | Readiness for the saved authoring/review head. |
| `PATCH .../:proposalId/basket` | Save basket details with aggregate version checks. |
| `POST .../:proposalId/sub-baskets` | Add a proposal-owned Sub-Basket with server-owned ID. |
| `PATCH` / `DELETE .../:proposalId/sub-baskets/:subBasketId` | Rename/order or remove an owned Sub-Basket. Removal of nonempty parents is blocked until children are explicitly removed. |
| `POST .../:proposalId/sub-baskets/:subBasketId/main-lines` | Add a proposal-owned Main Line. |
| `PATCH` / `DELETE .../:proposalId/main-lines/:mainLineId` | Save metadata/order or remove an owned Main Line. Block referenced-node removal and return referring resources. |
| `PUT .../:proposalId/main-lines/:mainLineId/sections/:sectionKey` | Save one validated section incrementally. Unsupported section keys are rejected. |
| `PUT .../:proposalId/quality` | Save the single shared proposal basket checklist. |
| `POST P/:proposalId/submit` | `expectedVersion`, `idempotencyKey`; validate/freeze/create queue header atomically. |
| `POST P/:proposalId/revise` | Rejected own proposal only; expected aggregate/request versions and idempotency key; create linked draft with remapped owned IDs. |
| `GET A/:proposalId/changes` | Paginated comparison of submitted resources to review head, with actor/time and field changes. |
| `POST A/:proposalId/decision` | `decision: approve | reject`, expected aggregate/request versions, idempotency key, rejection reason when applicable. Uses the saved review; no inline configuration payload. |

The shared `...` authoring paths are exposed under both namespaces but use separate role/state guards. Procurement cannot address the review head for writes. Admin cannot author an unsent draft. Snapshot selectors are `current`, `submitted`, and `approved`; resolved resource versions must be members of the selected authorized manifest. Pending review contents are visible only to Super Admin; the requester sees its submitted snapshot and decision outcome. After approval it can read the final approved snapshot.

Reference kinds are allowlisted Configuration masters (UOMs, taxes, modes, surfaces, priorities), quality frequency/performer options, and relationship baskets/Sub-Baskets/Main Lines. Return only fields required by the existing editors and validators. Exclude vendor/customer/private operational data and other proposals. Resolve own proposal nodes alongside authorized live references by stable ID; support paging and explicit lookup of selected live IDs. Missing/inactive references stay explicit rather than silently switching targets.

Maintain existing error conventions: validation/readiness findings, forbidden or non-disclosing not-found for scope violations, conflict for stale versions/key reuse/duplicate basket names, and bounded-payload errors. Authenticated responses use `private, no-store`. Audit events record IDs, actor, version/digest and change summaries without logging entire payloads or personal vendor data.

### Authorization and idempotency

- Add narrow `procurement.vendor_basket_proposal.read`, `.create`, `.update`, and `.submit` permissions, granted to Procurement for this workflow only. Own list/detail/references use read; create/revise use create; authoring changes use update; submission uses submit. Procurement operations retain `deny_personal` for Super Admin and revalidate stored active Procurement identity plus ownership.
- Admin reads require Configuration read and the sole active Super Admin guard. Review saves require Configuration update. Decisions require Configuration lifecycle; approval additionally asserts existing Configuration create/update authority in the service. Do not change legacy route permission assignments.
- Register every concrete route in the canonical route-operation inventory, frontend permission contract, and OpenAPI. Do not grant Procurement generic Configuration read/write/lifecycle permissions to make editor calls succeed.
- Revalidate actor, role, ownership and operation authority before idempotent replay as well as first execution. Use existing authorization coordination for role-change races.
- Creation/revise deduplication lives on the new proposal; submission command identity is stored with the frozen submission; decisions use the linked request's decision key/fingerprint with a proposal-specific discriminated fingerprint. Keep legacy fingerprints unchanged.
- Same key and identical canonical command returns the stored result; changed payload conflicts. Lost-response retries preserve the original key and payload. Content saves use CAS and a read-to-reconcile state on ambiguous responses; do not automatically overwrite the newer head.
- The legacy decision service must reject `configuration_proposal` requests before its name-only fulfillment path can create anything. Existing legacy pending/history/replay remains unchanged.

### Atomic publication and canonical Configuration behavior

Extract only the domain/persistence seams needed from the existing Configuration service. Live call sites remain the default and continue their established guards and transactions. Separate pure snapshot validation from transaction-aware price, hierarchy, quality, reference and activation writes.

Within one replica-set transaction:

1. Revalidate the active sole Super Admin, both expected versions, pending state and exact saved review digest. Resolve identical prior decisions without repeating publication.
2. Enforce all bounds, parent relationships, nonempty submitted hierarchy, ordinary activation rules, and canonical reference/graph validation. Coordinate referenced records and authorization using the established guarded writes so concurrent archive/delete/role changes cannot slip between validation and commit.
3. Coordinate normalized basket-name uniqueness with ordinary basket creation/rename paths. A read-before-insert is insufficient. Inspect existing uniqueness/coordination and reuse it; if absent, add narrow transaction coordination at both normal and proposal mutation paths without changing their successful behavior. Full proposals never merge into an existing named basket, including an inactive one.
4. Allocate ordinary display order and create basket, Sub-Baskets, Main Lines, saved sections and pricing records with the explicit identity mapping. Resolve all internal/external references. Preserve the approved effective values exactly; reference/GST changes that would change reviewed values must block and require a refreshed review save, not silently reprice.
5. Publish canonical basket quality with its normal mandatory-parameter policy and digest. Activate every included Main Line through the normal activation invariants, initial active revision/history and content digests. Related new nodes are validated against the complete proposed graph before activation order can matter.
6. Record terminal request outcome, final review snapshot/digest, published IDs, change summary and ordinary creation/activation plus request decision audit events. Commit together.

Any failure, including audit failure, rolls back all live writes and leaves the request pending. Do not use nested independently committed transactions or weaken replica-set requirements. Preserve current approved estimate amounts, issued artifacts, existing live basket values and latest-draft consumer behavior.

### Frontend adapter and composition

Add a narrow `KnowledgeEditorDataSource` interface under the existing knowledge feature. It supplies item/section/quality/reference reads, section/quality writes, query-key construction, saved-summary relationship lookups, and affected-query refresh hooks. UI-only editors remain controlled components. The existing live data source is the default for all existing call sites.

Pass the explicit proposal data source only from a new proposal workspace. Adapt the direct calls in `KnowledgeModePanel`, `KnowledgeBasketQualityPanel`, `useKnowledgeSavedSummary` and its summary wrapper. Keep `KnowledgeItemWorkspacePage` routing, live lifecycle controls and normal authorization intact. The proposal workspace owns its hierarchy, head selection, Overview/Recommendations save handling, review/submission controls and history. Do not intercept the global API client, route normal Configuration IDs into proposal handlers, or copy the entire live workspace.

Proposal query keys begin with `vendor-basket-proposals` and include authenticated actor, proposal ID, snapshot/head version, resource identity and resource version as applicable. Reference keys also include actor scope. Cancel and remove private proposal queries and editor state when identity/role changes; do not render stale authorized content after a denial. Live Configuration keys retain existing names.

Reuse existing Overview, Mode, Recommendations, quality editors, saved summaries, conflict presentation, and ContextPanel/overlay primitives. Disable shared-master quick creation in proposal mode for Procurement. Super Admin manages reusable values through existing Configuration screens and refreshes references. Keep one basket-quality editor and avoid duplicating checklist state per line.

Procurement entry points: replace the new Main Basket authoring action in `VendorBasketFields`; add My basket requests to the vendor directory and editor. Retain legacy request components for legacy compatibility. The parent vendor form stays mounted; propagate dirty/busy state and restore focus without changing its fields or selected classifications.

Super Admin entry points: discriminate legacy/full rows in `KnowledgeBasketRequestReview`. Keep legacy decision panel behavior. New rows open the common proposal workspace in review mode with submitted/current comparison and explicit Approve & activate/Reject. Keep the existing dashboard/count hook operating on pending queue headers only.

Mutations refresh proposal detail/resources/readiness, requester lists, review lists/counts as appropriate. Approval also refreshes Configuration basket/Sub-Basket/item/section/history/quality/context and reference queries using established invalidation helpers. Poll pending status every 30 seconds only in foreground and refresh on focus. A decision observed in another session triggers catalog refresh; query invalidation alone is not cross-browser notification. Retain a successful decision if any following read fails and offer read-only refresh retry.

## Dependency-ordered execution and ownership

Implementation begins only after task-plan approval and the separate A/B execution choice. Keep one parent task below in progress; independent child slices may run within it.

### T0. Capture baseline and confirm integration seams

Owner: primary agent. In Mode A, bounded read-only backend integrity and frontend consumer audits may run independently.

- Recapture `git status --short` and relevant diffs. Assign no dirty target until its existing changes are understood. Tell every writer it shares the worktree and must preserve others' edits.
- Confirm existing normalized-name uniqueness, reference coordination, price materialization and basket-quality publication seams. Resolve implementation details against this contract before assigning writers; surface material deviations.
- Run focused baseline suites for legacy requests, Configuration activation/pricing/quality, permissions and shared editor behavior. Record exact results and separate pre-existing failures.
- Record affected Super Admin routes/controls for later browser verification. Use isolated test fixtures only.

Done when: baseline evidence and owned file boundaries are recorded. Maps to AC9, AC12, AC13.

### T1. Define contracts, adapters and authorization inventory

Owner: primary agent for cross-layer files and contracts. Mode A may use read-only review; no competing writers in these paths.

Owned areas: new backend/frontend proposal contract types, `route-operations.ts`, authorization/permission inventories and frontend matching contract, OpenAPI inventory, `app.ts` wiring placeholders as needed, new frontend API client/query-key factory and editor data-source interface.

- Implement the exact additive wire DTOs, strict validation shape and route registrations above.
- Keep legacy request DTO fields compatible and add kind/proposal summary fields without changing old fingerprints.
- Establish live-default and proposal data-source interfaces with fixtures covering wire serialization.
- Ensure adapter methods cover summary/read paths as well as editor writes. No proposal mutation may call a live Configuration write endpoint.

Done when: contract/authorization tests cover both namespaces and writers have one stable interface. Maps to AC2, AC3, AC8, AC9, AC13.

### T2. Implement isolated backend and reusable frontend editor seams

Depends on T1. In Mode A, these two child slices can run in parallel with explicit non-overlapping ownership.

**T2a Backend owner: `backend_implementer`.** Own new proposal models, service, routes, tests; additive request model/service discriminator; targeted Configuration service/helper changes; related backend test files. Exclude T1-owned registries/contracts/app integration unless ownership is explicitly transferred.

- Implement immutable resources/manifests, own draft CRUD, bounds, references, save readiness, submit/freeze, own status list and rejected-copy remapping.
- Implement pending review edits, change history, exact-head decisions and canonical transactional publication.
- Add legacy bypass guard, name/reference coordination, stored-actor guards, rollback and deterministic retry behavior.
- Keep normal Configuration entry points unchanged except narrow shared helper/coordination calls proven by baseline regressions. Preserve `.js` suffixes and established direct-Mongoose boundaries.

**T2b Frontend adapter owner: primary agent.** Own shared `KnowledgeModePanel`, `KnowledgeBasketQualityPanel`, saved-summary hook/wrapper, adapter implementations and their existing tests. Do not modify procurement/review screens during this slice.

- Inject the optional data source with unchanged live defaults and cache behavior.
- Add proposal adapters for canonical section/editor DTOs and read-only submitted snapshots.
- Verify current Mode save/conflict/pending behavior, basket quality and summary reference resolution retain their behavior without any proposal prop.

Done when: backend focused transaction/authorization tests pass, adapter regression tests pass, and shared editor paths are ready for the new workspace. Maps to AC2–5, AC7–10, AC13.

### T3. Build the proposal workspace and Procurement journey

Depends on T2b and T1; can overlap unfinished T2a using contract-faithful mocked API fixtures.

Owner: `frontend_implementer` in Mode A; primary in Mode B. Own new proposal workspace/hierarchy/list/status/change-summary components under a dedicated proposal feature directory, Procurement vendor entry-point integration, focused proposal tests and narrow styles. Do not edit shared knowledge panels, admin queue files, contracts or global API/auth code without a coordinated ownership transfer.

- Build full draft and read-only submitted/decided views with the shared editor adapters, progressive hierarchy loading and saved summaries.
- Add all hierarchy/section/quality editing, save/close guards, readiness navigation, submit, own list/resume and rejected-copy action.
- Implement review-mode component props and saved snapshot comparison so the admin integration can mount the same editor.
- Preserve the underlying vendor form and upload state, maintain focus, avoid automatic vendor saves or classification changes.
- Cover loading/empty/error/conflict/unknown outcome, inaccessible actions, role change, desktop/mobile, keyboard and long configurations.

Done when: rendered Procurement journey and review-mode component tests pass using the frozen API. Maps to AC1, AC3, AC4, AC6–8, AC11.

### T4. Integrate Super Admin review, publication and freshness

Depends on T2a and T3. Owner: primary agent. Writers finish or explicitly release files before integration.

Owned areas: `KnowledgeBasketRequestReview`, existing decision/count/dashboard integrations, app composition, final DTO reconciliation, approval/read refresh handling and query invalidation integration.

- Keep legacy rows routed to their current decision panel. Mount the new review workspace for full proposals.
- Connect saved review edits, original/review comparison, readiness, approve/reject and terminal result handling.
- Verify pending counts exclude drafts and include each submitted proposal once.
- Check same-session invalidation and separate-session polling/focus refresh, including a successful approval followed by a failed catalog read.
- Exercise a representative full publication with two Sub-Baskets, unequal line prices/modes, quality, internal relationships and one independent live basket. Confirm normal Configuration editing after publication.

Done when: both new role workflows and existing legacy/Super Admin paths work on the integrated tree. Maps to AC3–7, AC9, AC13.

### T5. Integrity review and corrections

Depends on all writers finishing. Mode A: `integrity_reviewer`, read-only, followed by corrections from the owning writer/primary. Mode B: primary performs the same review sequentially.

Review ownership, request-kind dispatch, snapshot immutability, queue status source, CAS/replay, current actor checks, cross-request IDs, reference/name races, pricing lineage, quality policy, transaction/audit rollback, private cache clearing, catalog freshness and unchanged live defaults. Inspect the complete diff against the initial dirty-path set. Resolve confirmed findings before final verification; communicate contract changes across layers.

Done when: no unresolved feature-introduced correctness or Super Admin regression findings remain. Maps to all integrity-related criteria, particularly AC2, AC5, AC7–10, AC13.

### T6. Final verification and handoff

Depends on T5 corrections finishing. Mode A: `verification_runner` owns read-only integrated checks; primary owns browser QA/integration fixes. Mode B: all work inline. Verification must not race active source writers.

Run the matrix below, record exact commands/results, inspect final diffs and update this plan with completion evidence. After a failure, fix its cause and rerun affected checks; repeat broader suites only if new changes warrant them. Report unrun checks and remaining risks explicitly. No partially verified completion claim.

## Verification matrix

| Acceptance criteria | Required evidence |
| --- | --- |
| AC1 | Rendered open/edit/add children/save/resume/close tests with dirty vendor fields and upload state; browser interaction at desktop and mobile widths. |
| AC2 | Isolated Mongo snapshots prove no normal basket/line/price/quality/revision changes on create/save/submit/review/reject; normal catalog/estimate/relationship reads exclude proposals. Network assertions reject live-write calls from proposal UI. |
| AC3 | Incomplete drafts save but invalid submission fails; exact saved version freezes once; repeated and concurrent submit yields one queue header and correct pending count. |
| AC4 | Original snapshot remains unchanged after reviewed hierarchy/price/quality edits; reload retains reviewed content; unsaved/stale versions cannot be approved; author cannot edit pending content. |
| AC5 | Replica-set publication verifies the whole ordinary active hierarchy, canonical prices/sections/quality/revisions/digests and remapped references. Unequal fixtures detect ID/value substitution and paise conversion errors. |
| AC6 | Approved basket selectable by canonical ID after same-session refresh and separate-session status observation. Vendor data remains unchanged; post-commit refresh failure does not trigger another write. |
| AC7 | Reject/revise, stale edit/decision, approve-versus-reject, duplicate normalized names including concurrent normal creation/rename, changed/deleted references, audit failure, lost response and idempotency replay tests. |
| AC8 | Two Procurement identities, another role, inactive/reassigned actors and sole active Super Admin; forged parent/resource/manifest IDs and unauthorized replays; UI cache/state clearing on identity or role change. |
| AC9 | Existing legacy request decisions/history/replay; normal Configuration source-of-truth, price/activation, quality and vendor classification suites remain passing. |
| AC10 | Isolated replica-set tests with two Sub-Baskets, unequal Main Lines/prices/modes, another live basket and multiple users. Inject a failure after initial live writes and before final audit to prove complete rollback. |
| AC11 | Rendered/accessibility and real-browser role workflows, long hierarchy, empty/error/loading, stale references, rejection/approval, conflict recovery, narrow layout, dirty/busy guards and focus return. |
| AC12 | Backend/frontend typechecks, full suites/builds, authorization/route/OpenAPI contract checks, whitespace and worktree checks. Exact logs/results captured. |
| AC13 | Before/after Super Admin regression evidence, including live-default adapter tests, ordinary Configuration editing/activation, master/quality controls, legacy queue/decisions, dashboard navigation and immutable history. |

### Focused baseline and incremental checks

From `backend/`:

```sh
npm test -- tests/vendor-basket-request.replica-set.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-basket-quality.replica-set.test.ts tests/authorization-policy.test.ts tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts
```

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/admin/dashboard/VendorClassificationRequestQueueItem.test.tsx
```

Add focused `vendor-basket-proposal` service/routes/domain and replica-set suites for the matrix, and proposal workspace/list/review/data-source rendered suites. Run each owned slice's new tests and affected regressions before integration. Existing inline mutations, related items, sub-basket management, fixed pricing/mode calculations, deletion safeguards, conflict review and authorization consumers are covered by the final full suites; run individual cases earlier when those seams change.

### Final integrated commands

In both `backend/` and `frontend/`, sequentially:

```sh
npm run typecheck
npm test
npm run build
```

At repository root:

```sh
git diff --check
git status --short
```

Use the repository's isolated replica-set test helper, never a configured user database URI. Ensure transaction suites actually execute rather than skip; record any environment limitation. There is no repository lint script and no lint success claim is planned. No new dependency or lockfile change is expected.

### Browser matrix

Use local disposable fixtures, with production access disabled. Inspect at approximately 1440 px desktop, 768 px tablet and 390 px mobile; verify horizontal overflow, long content, visible save/decision controls, keyboard-only navigation, accessible names and focus restoration. Use separate requester and Super Admin sessions for status freshness. Check browser console and failed network requests.

Exercise Procurement draft/save/resume/submit/reject/revise/approved selection and Super Admin original/review/edit/approve paths. Alongside them, perform ordinary live Configuration editing and activation, shared quality and reusable-value access, and a legacy request decision. Use automated replica tests for rollback/races that should not be induced against the user's local data. Screenshot/log artifacts belong in ignored task-specific temporary output and must contain no private data.

## Rollout, rollback and handoff limits

Implementation authorization permits source edits and proportionate local verification only. Do not seed or alter the user's local database, sync from production, run a live migration, deploy, commit, push or send external messages.

The release order is compatible backend support before frontend enablement; release execution requires separate authorization. New collections/indexes are additive. If live index installation needs a migration, prepare its dry run, conflict report and rollback/backup requirements and stop before execution. Rollback disables new proposal entry points/submission while preserving stored drafts, review history and published normal Configuration records.

Final handoff must name affected files, principal contract decisions, exact checks/results, browser evidence, unrun checks, temporary artifact locations, external actions not performed and remaining risks. In particular, distinguish preservation verified by tests/browser flows from any Super Admin surface not exercised.

## Progress

- Specification approved by the user on 2026-10-11, including the explicit Super Admin preservation requirement.
- Task plan approved; Mode A selected by the user.
- T0 complete: only the two task documents were initially dirty; source files were clean. Frontend baseline: 208 passed, 15 pre-existing failures in KnowledgeScreens. Backend baseline (after enabling isolated local ports): 446 passed, 1 pre-existing basket-quality completeness assertion failure. Logs: `/tmp/lisno-basket-proposal-baseline-{frontend,backend}.log`.
- T1 complete; proposal persistence/publication and frontend writers released their slices. Integration review in progress. Backend contract file ownership transferred to backend proposal writer; frontend API/types transferred to frontend writer. Primary owns shared editor adapter, registry/authorization/OpenAPI/app and final admin integration. Canonical publication helper slice assigned to a separate backend writer, disjoint from proposal persistence/routes.
- Audit confirmed existing active/inactive normalized basket-name unique index; reuse it. Recommendations descendant requires a narrow scoped Sub-Basket read adapter in addition to the three named shared consumers. These preserve the approved contract.
- Proposal replica tests 12/12, publication replica tests 17/17, legacy request tests 30/30, frontend proposal tests 12/12, vendor directory 23/23 and vendor profile 56/56 passed in owned slices. Shared frontend regressions 254/254 passed; shared adapter isolation 42/42 passed. Final integrity review, browser QA and integrated verification remain.
- User clarified during implementation that shared code reuse is permitted while existing Configuration screens, behavior and data stay unchanged. Removed incidental legacy queue labeling/error-copy changes and restored ordinary activation clock timing.
- No user-database mutation, schema application or deployment performed.

### Integrated review and browser verification (2026-10-12)

- All implementation writers released their files; the integrity reviewer completed final rereview with no unresolved findings. Corrections covered incremental stale-reference repair, independent Mode save/loading state, discarded section validation, unsupported Sub-Basket description controls, exact response schemas, typed reference remapping/deletion, readable change summaries and terminal readiness states.
- Added exact bounds checks for 100 Main Lines, 240 KiB resources, 8 MiB snapshots, 100 prices per line and 2,000 total prices, plus distinct-identity duplicate-name races against ordinary Configuration create/rename. Maximum-size runtime performance has not been benchmarked.
- Browser QA used the real proposal, legacy-request and Configuration routes with isolated temporary Mongo replica sets and fixture-only identities. The user's local and production databases were never connected or mutated.
- Verified vendor draft retention during proposal creation, hierarchy/UOM/Mode rate/shared-quality saves, resume, submission, original/review separation, rejection reason, revision as a new draft, resubmission, approval and approved Main Basket/Sub-Basket selection. Final code browser run preserved the submitted ₹130 rate while approving the edited ₹145 rate. Approved/rejected views no longer show readiness blockers or issue readiness requests.
- Existing Super Admin browser regression: legacy name-only approval; ordinary Configuration draft-revision creation, Mode rate save and activation retaining revision history. No existing Configuration records were rewritten by implementation or tests; all live-write checks used disposable fixtures.
- Responsive screenshots at 1440, 768 and 390 pixels showed no page overflow. Desktop editable/review and final approved accessibility scans returned zero axe violations. Browser artifacts live in ignored `frontend/output/playwright/basket-proposal/`; fixture API harness is `/tmp/lisno-basket-proposal-qa.mts`.
- Final verification runner is executing full backend/frontend test suites and builds. Both typechecks and focused backend 229-test verification passed. Two new test-only fixture assertions were corrected (permission list slice length and scoped status locator); those frontend tests passed 28/28. A final frontend Workspace/VendorDirectory rerun after copy-only changes passed 36/36.
- Full-suite failures are being compared with a clean HEAD archive at `/tmp/lisno-basket-verification-baseline.066pMZ`; existing behavior is not being changed to make unrelated tests pass. Final counts and evidence will be recorded below.

### Final handoff (2026-10-12)

Implementation and integrated verification are complete, with the pre-existing full-suite failures below explicitly retained. Existing Configuration behavior is preserved; shared code reuse was expressly authorized by the user. No dependencies or lockfiles changed. No commit, push, deployment, migration, seed, production action or local/production database synchronization was performed.

Principal files: isolated proposal contracts/models/routes/service/publication under `backend/src/`; the new `frontend/src/features/vendor-basket-proposals/` workspace, list, API and editor adapter; Procurement `VendorBasketFields.tsx`/`ProcurementVendorDirectory.tsx`; additive `KnowledgeBasketRequestReview.tsx` queue integration; narrow live-default adapters in existing Configuration editors; synchronized authorization/route/OpenAPI inventories. Normal Configuration validation and activation are reused. Proposal authoring and review remain in separate collections until atomic approval creates the ordinary active hierarchy.

Final commands and results:

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` | Passed |
| Frontend `npm run typecheck` after final copy change | Passed |
| Backend focused proposal/publication/bounds/legacy/authorization/registry/OpenAPI tests | 229 passed |
| Frontend targeted tests, including corrected test assertions and final Workspace/VendorDirectory rerun | 362 unique tests passed |
| Backend `npm test` | 5,550 passed, 27 failed; 257/269 suites passed |
| Frontend `npm test` | 4,632 passed, 24 failed; 296/302 suites passed |
| Backend `npm run build` | Passed |
| Frontend `npm run build` | Passed; existing large-bundle warning remains |
| `git diff --check`; `git status --short` | Passed; expected task edits only |

All 24 frontend full-suite failures reproduce on clean HEAD (15 existing KnowledgeScreens cases plus 9 existing layout/password-reset/designer/accessibility cases). Backend's 27 full-suite failures comprise 16 reproduced baseline assertions, 7 reproduced business-hours/clock failures after midnight, and 4 load-sensitive timeouts. All four timeout-affected suites passed on rerun with two workers: 127/127 tests. The repository full suites are therefore not globally green; no unrelated Configuration or other product behavior was changed to hide those failures.

Evidence: `/tmp/lisno-basket-final-{backend,frontend}-full.log`; `/tmp/lisno-basket-final-backend-head-baseline.log`; `/tmp/lisno-basket-final-backend-chat-head-baseline.log`; the matching focused/typecheck/build logs under `/tmp/lisno-basket-final-*`; earlier baseline and activation logs noted above. The clean HEAD comparison archive is `/tmp/lisno-basket-verification-baseline.066pMZ`. Browser artifacts remain ignored at `frontend/output/playwright/basket-proposal/`, including final approval and vendor-selection network logs. Final browser console check reported zero errors/warnings; final approval axe scan returned zero violations. Disposable browser sessions and the temporary replica-set API server have been stopped.

No lint script exists; lint was not claimed or run. OCR was unchanged and not tested. No production/browser checks against real customer data or maximum-size performance benchmark were performed. Release/index rollout is not executed by this local implementation handoff.

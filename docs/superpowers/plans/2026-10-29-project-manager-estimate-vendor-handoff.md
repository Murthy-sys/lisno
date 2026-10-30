# Project Manager estimates and Main Line vendor handoff: task plan

Date: 2026-10-29
Status: Approved; Mode A selected. T0–T5 and the local suggestion-readiness follow-up are complete. Scoped verification and local `lisno_demo` index preparation passed with backup/restore evidence. Full-suite limitations are recorded below; no remote deployment was performed.
Approved specification: [Project Manager read-only estimates and Main Line vendor suggestions](../specs/2026-10-28-project-manager-estimate-vendor-handoff-design.md)
Approval record: The user approved the revised Main Line specification on 2026-10-29. Earlier dashboard/detail execution choices do not apply to this scope.
Classification: Substantial, with authorization, approved financial lineage, transaction and database-index risks.

## Outcome and boundaries

Completed follow-up, 2026-10-29: fixed the reported suggestion-readiness defects. The user requested the required changes after the `lisno_demo` index dry-run diagnosis and explicitly chose suggestions for approved temporary items. Mode A continued. The pre-fix dirty baseline is `/private/tmp/lisno-pm-suggestion-readiness-baseline/`. Results and local cutover evidence are recorded in the final follow-up section below.

1. Backend Configuration owner: recognize only empty, explicitly unconfigured Design placeholders in both current catalogue/rule projections; keep malformed configured rules and identity mismatches rejected. Add focused regressions.
2. Backend PM owner (parallel): include approved temporary item IDs in exact-source scopes, preserve frozen type and amounts, require current type/parent/UOM compatibility, verify persistence and actual Procurement visibility/activity. No live data writes.
3. Frontend owner (parallel): show temporary classification on approved rows/scopes, allow eligible temporary recommendations, retain precise unmapped/excluded/error states. Add rendered regression.
4. Primary: own additive optional `itemType` contract/OpenAPI mirrors and integration. Prepare a secure backup, isolated restore check and fresh index dry run; quiesce the local stack for the target-specific `lisno_demo` index cutover, verify no record changes, restart and read-check readiness. No seed, approved-record rewrite, live invitation or production change.
5. After writers stop: independent integrity review, bounded focused tests, both typechecks/builds, rendered checks and final runtime verification. Record any remaining blocker explicitly; do not repeat unrelated known-failing full suites without a new reason.

Acceptance: POP's empty unconfigured Design placeholder no longer hides its valid current Main Line; approved temporary painting scope supports suggestions without reclassification; local index readiness becomes true after verified preparation; authority, current-source/type/parent/UOM fences, duplicate/idempotency semantics and approved values remain intact.

Deliver this connected journey: open an assigned project, choose **View estimations**, read approved scope, suggest a saved vendor for a specific Main Line, and see the same recommendation in Procurement's Main Basket vendor picker. Procurement retains explicit bid-request selection and sending. PM activity is derived from real requests and bids for the matching approved line scope.

Preserve the completed dashboard/detail design, compact content, independent dashboard scroll regions, project navigation, existing Admin project-wide suggestions, and current Procurement dispatch behavior. There are no PM estimate edits, approval actions, vendor-master changes, bid prices, invitation controls, automatic messages, new pricing formulas, or new dependencies planned. Original implementation approval covered local code and isolated verification. The subsequent target-specific local `lisno_demo` preparation was authorized and completed as documented below; deployment, commits and external communication remain outside scope.

## Verified integration points

| Current evidence | Planned integration |
| --- | --- |
| `project-manager/sources.ts` uses `approvedProcurementSnapshotFromRows` and requires verified immutable approval lineage. Its source resolution is coupled to execution loading. | Extract a lightweight shared approved-source helper; use it in both the existing PM source loader and new estimate/suggestion services. |
| `project-manager/common.ts` provides active-role/assignment checks, transactional ownership fences, command receipts and audit/change recording. | Reuse assignment authority and transaction conventions. Check authority before returning an idempotent replay. |
| `ProjectVendorSuggestion.ts` and `project-vendor-suggestions.service.ts` already persist suggestion identity, actor, CAS version, request hash and audit. The unique source/vendor index lacks Main Line scope. | Extend the existing collection with immutable scope; preserve the Admin contract and add scoped PM commands. Prepare a controlled index transition. |
| Collaborative approved snapshots can have `designPlanVersion: 0`; existing suggestion schemas require positive versions. | Allow zero only for verified collaborative source records; never manufacture a Design approval/version. |
| `ProcurementBasketEnquiry.tsx` owns the actual vendor picker, explicit/all-eligible selection, preview, batches and retries. | Integrate recommendations in this picker, including recommendations beyond the first directory page. |
| `procurement-project-identity.ts` exposes project/basket candidate lookup with Procurement access, source and eligibility checks. | Add a similarly scoped recommendation read operation. PM gets a separate safe lookup, not vendor-directory permission. |
| `ProcurementBasketTender.ts` stores immutable BOQ lines, source-line keys, revisions, invitations and bids. | Derive bounded PM activity from these records and exact source/line membership. |
| `migrations/project-procurement-source-index.ts` demonstrates native read-only inventory, exact index-definition checks, backup-required apply, build-before-drop and conflict-refusing rollback. | Follow that operational pattern for suggestion indexes without running it against any persistent database. |

## Implementation contract

### Approved source and estimate projection

- Introduce an explicit `ApprovedSourceRef`: `estimateId`, positive `estimateVersion`, nonempty `estimateReviewRoundId`, phase (`pre`, `post`, or `legacy`), `designPlanVersion`, and immutable snapshot identity/digest when provided by the canonical resolver. Project ID comes from the authorized route. A zero Design version is valid only with verified collaborative pre/post lineage. Historical suggestions with null review rounds remain historical, never a verified current source.
- The estimate response is an availability union with safe project identity, source metadata, approval timestamp, approved scope rows, Main Line group descriptors, saved subtotal/GST/total in integer paise, and safe availability reasons. A missing amount remains null; legitimate zero remains zero.
- Source rows allowlist stable source-line key, section/room identity, approved basket/line labels, specification, included status, saved dimensions, quantity, UOM, saved unit rate and line amount. Read rates/dimensions from the immutable approved snapshot where present; an unavailable saved rate is not reconstructed from a mutable catalogue or amount/quantity division.
- Reuse the approved-source resolver's baseline, including final-before-pre selection and legacy approval verification. Never select a draft, arbitrary matching estimate, or Procurement preparation snapshot as a substitute. Reconcile viewer subtotal with the PM approved net value using two unequal projects.
- Main Line grouping uses stable `mainLineId`, not labels. A group contains all included occurrences in that approved source and their exact `sourceLineItemKey`/section/room identities. Missing IDs, excluded-only scope, incompatible mappings and ambiguous basket membership have explicit non-actionable reasons.
- Keep saved commercial labels/amounts distinct from current Configuration labels and eligibility context. Resolve current Configuration through the existing latest-saved-draft/otherwise-active rule. Do not overwrite approved quantities, UOM, dimensions, rates or totals with current Configuration values.
- Return no raw estimate, configuration, vendor, tender or bid documents. Explicitly exclude internal costing, margins, supplier terms, private file references, recipient hashes, invitation URLs/tokens and bid prices.

### Suggestions and commands

- Extend existing records with immutable `scope: project | main_line`, nullable `mainLineId`, source phase/snapshot metadata, approved Main Basket identity, and validated included source-line/room context. Missing scope/Main Line fields normalize to project-wide reads. Do not backfill a guessed target.
- For new Main Line records, the server derives scope membership and a deterministic scope digest from verified source identity and sorted stable line keys. Client-supplied names, basket IDs or line-key arrays never establish authority or membership.
- PM create body: `expectedSource`, `mainLineId`, `vendorId`, optional normalized note (existing 1,000-character maximum), and `idempotencyKey`. Bind the request hash to action, project, full source, Main Line, vendor and normalized note. Same key with different work is a conflict.
- PM update body: `expectedSource`, `expectedVersion`, `idempotencyKey`, and note/status changes only. Project, source, Main Line, vendor and creator are immutable. Use existing PM command receipts for update replay and the established suggestion audit trail for the semantic change; avoid duplicate semantic audit entries and provide no notification recipients. A no-op does not create a misleading status transition.
- Every write runs in a replica-set transaction: active identity and assignment fence, current immutable source/source fence, target membership, ownership, effective vendor activation where required, CAS, uniqueness, receipt and audit. A replay rechecks current authorization and may return the original receipt without applying a command to a new source.
- Same source/Main Line/vendor duplicates return a typed conflict with the authorized existing record ID/author; no ownership transfer. A vendor on another Main Line or a legacy project-wide suggestion does not block creation. Only the current assigned PM who authored the record can change its note/status. Reinstatement requires current source and effective activation; withdrawal does not revoke an invitation.
- Keep the existing Admin create/update payloads and grant rules. Legacy consumers query project-wide records explicitly so they cannot flatten scoped recommendations. Additive display metadata must not grant new Admin or Procurement write authority.

### Routes and permissions

All routes authenticate, use the canonical operation registry, validate strict runtime schemas, enforce service-level access and send private/no-store responses. Document them in OpenAPI and align frontend authorization types.

| Operation | Contract and permission |
| --- | --- |
| `GET /projects/:projectId/pm/estimate` | Allowlisted estimate availability/read model; new `pm.estimates.read` permission for canonical `site_manager`, with active assignment check. |
| `GET /projects/:projectId/pm/vendor-suggestion-candidates` | Requires exact expected source and Main Line; paginated search; `pm.vendor_suggestions.read` plus assignment. Safe ID/code/name/classification and readiness reasons only. |
| `GET /projects/:projectId/pm/vendor-suggestions` | Current/history selector, optional Main Line filter, bounded pagination and activity summary; same scoped read permission. Explicit project-wide legacy scope. |
| `POST /projects/:projectId/pm/vendor-suggestions` | Strict create command; `pm.vendor_suggestions.manage`, assignment, source, ownership/duplicate, vendor and index-readiness checks. |
| `PATCH /projects/:projectId/pm/vendor-suggestions/:suggestionId` | Strict owned CAS command; same manage permission and transaction checks. |
| `GET /procurement/projects/:projectId/baskets/:basketId/vendor-suggestions` | Additive Procurement recommendation read operation using existing Procurement project-access and operation-specific read policy; no PM access to this route. Includes Main Line filter, source relation, readiness, author/note and pagination. |

Do not broaden `requireProcurementVendorReader` or grant PM generic estimate-edit, vendor-master, invitation or bid-price permissions. Super Admin remains operation-specific and cannot acquire personal PM actions. Keep existing Admin and Procurement authorities unchanged.

Use bounded page sizes (default 20, maximum 50), validated search length and deterministic ordering. Include exact expected-source identity in lookup requests so a stale form cannot silently move to a new approved source. Failed source validation is a conflict/unavailable result, not an empty eligible list. Distinguish safe reasons such as source changed, mapping unavailable, vendor inactive, bid prerequisites missing and index preparation required.

### Procurement eligibility and actual activity

- Reuse lower-level activation/classification/readiness facts from the existing basket eligibility implementation. Its existing eligible-only candidate response is insufficient for PM, which must show safe reasons for saved active vendors that are not yet bid-ready. Never copy contact details or relax dispatch eligibility.
- The basket recommendation endpoint queries scoped records across the result set, not just visible candidate IDs. Resolve exact source relation, basket and source-line membership server-side. Current actionable, unavailable/mismatched and historical recommendations remain distinguishable; only eligible current candidates can enter the existing selection set.
- Display recommended Main Lines and rooms, author and expandable note. Explain that the actual invitation covers the selected basket BOQ. Deduplicate vendor selection across line recommendations while preserving separate recommendation identities. Do not automatically select, reconcile, modify BOQs or dispatch.
- Activity joins require project, exact approved source/reconciliation evidence, vendor, basket, enquiry, immutable BOQ revision, Main Line and matching source-line keys. A revision omitting the line is not matching activity; partial room coverage lists the covered occurrences.
- Query activity in bounded batches for the current suggestion page, with an explicit limit/continuation indicator for older events. Keep delivery state of the latest relevant request separate from historical bid receipt and distinguish a basket-level receipt from a persisted response on the matching BOQ line. Preserve original timestamps, including activity predating the suggestion.
- No match is shown only after a successful lookup. Query failure yields unavailable. Withdrawal does not erase activity. Historical source activity cannot imply invitation of the current source.

### Frontend behavior and cache contract

- Add `/projects/:projectId/estimations` and the **View estimations** action to the existing project header. Reuse the app shell, project-detail tokens and established estimate formatting. Preserve validated project return path, selected tab and dashboard filters; do not accept arbitrary return URLs.
- Build a dedicated read-only view with approved phase/version/date, room/basket scope, included/excluded lines and subtotal/GST/total. Show compact Main Line suggestion summaries and expand long specifications/notes on demand. No editor or approval-queue component is mounted with merely hidden actions.
- Use one shared Main Line suggestion panel from the estimate page and PM Procurement tab. The chooser shows selected Main Line, approved rooms and version before vendor selection. Button copy is **Suggest to Procurement**; successful save confirms persistence only.
- Key queries by actor, project, full approved source, Main Line/filter and page. Abort/discard old actor/project responses. After mutation invalidate both PM suggestion entry points and the relevant basket recommendation queries. Existing dispatch/batch/retry success invalidates activity; use established polling for other sessions.
- On 401/403/404 remove protected cached content. Loading, empty, failed lookup, stale data, source conflict, CAS conflict and write-unavailable states are explicit. Disable writes until source/permission readiness is fresh. Preserve an unsaved note on a recoverable conflict, but require review before retrying against a different source.
- Maintain ivory/olive styling, existing typography, compact cards, semantic tables/responsive rows, keyboard focus, labels, live status announcements and reduced motion. Add no icon library or decorative motion. Long text must not expand summary cards or create document overflow.

## Database compatibility and operational preparation

The old `project_vendor_suggestion_source_unique` index prevents the same vendor appearing on two Main Lines. Replacing it is a prerequisite for scoped writes, not an automatic application-startup action.

Prepare these named indexes and exact-definition checks:

| Index | Key and filter |
| --- | --- |
| `project_vendor_suggestion_project_source_unique_v2` | Unique `{ projectId: 1, estimateId: 1, estimateVersion: 1, designPlanVersion: 1, vendorId: 1 }`, partial filter `{ mainLineId: null }`, covering legacy missing/null fields and preserving old project-wide duplicate semantics. |
| `project_vendor_suggestion_main_line_source_unique_v2` | Unique `{ projectId: 1, estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1, designPlanVersion: 1, mainLineId: 1, vendorId: 1 }`, partial filter `{ mainLineId: { $type: "string" } }`. Require nonempty verified IDs in the model/service and inventory. Review-round identity distinguishes approved source rounds. |
| `project_vendor_suggestion_request_unique` | Preserve existing unique `{ createdById: 1, idempotencyKey: 1 }` unchanged. |

Retain the existing list index; add a scoped read index only when the implemented query/explain evidence warrants it. Index validation compares keys, uniqueness, partial filters and incompatible options, not names alone. Reject unknown conflicting unique indexes and malformed scope records. No record is deleted, merged or silently assigned a Main Line.

Prepare this sequence, executable only in isolated test databases during implementation:

1. Read-only inventory with native collection access: existing indexes, old/new duplicate groups, invalid scope/source metadata, null-round historical records and rollback conflicts. Dry-run is the default. No `Model.init`, `syncIndexes`, incidental model index creation or application-startup migration.
2. Provide a target-specific operational runbook. Before a future live cutover, capture verified data backup/recovery evidence and exact index metadata, deploy compatible readers/validators to all application instances, and stop old writers. Require explicit target authorization separately from this plan.
3. With suggestion writes quiesced for the cutover, perform a fresh final dry-run and build both replacement unique indexes while the old index still protects existing writes. A build/validation failure leaves the old protection intact.
4. Verify both new definitions and creator/request uniqueness, then retire only the recognized old conflicting index. Recheck indexes before reopening writes. The migration is idempotent and supports interruption after either index build or the old-index removal.
5. Gate Main Line creates/updates on verified readiness; incomplete/mismatched preparation returns a useful availability reason. Avoid a permanently cached ready state after indexes change. Existing compatible project-wide operations remain protected. Apply/rollback helpers use explicit native operations and never run implicitly on route/model initialization.
6. Rollback first disables new scoped writes and retains compatible readers/records. Restore the old global unique index only if a new inventory proves it satisfiable, while replacement indexes still protect writes; otherwise refuse and retain the compatible schema/indexes. Never delete cross-line records or reject valid zero-Design collaborative reads to force an old application rollback.

Isolated replica-set tests must prove partial-filter behavior for missing/null legacy fields, same-vendor/two-line coexistence, same-line duplicate rejection, interrupted/repeated apply, conflicting definitions, fail-closed readiness, legacy compatibility and rollback refusal with cross-line records. Model configuration must not recreate the obsolete index or auto-build migration-owned indexes at runtime. No live database target is selected in this task plan.

## Dependency-ordered tasks and ownership

Only one parent phase below is in progress at a time. Paths are ownership boundaries; creation of focused helper files inside that boundary is allowed when it prevents duplication. Shared contracts belong to the primary agent. A worker must return cross-boundary changes to the primary agent rather than editing another worker's files.

### T0. Capture baseline and confirm integration evidence

Owner: primary agent. Dependencies: approved plan and execution mode. Acceptance: supports all criteria, especially AC3/AC8.

- Capture `git status --short`, exact relevant diffs and copies/hashes of affected untracked files before any writer starts. Review the dirty PM workspace/shared components, router tests and enterprise fixtures before assigning ownership.
- Preserve all existing dashboard/detail styles, components and documents. The planning baseline has only the prior frontend/dashboard/detail changes and related documents; there are no backend source changes. Recheck this at execution time.
- Read applicable nested instructions and confirm canonical source fences, vendor activation fences, event receipts, Procurement selection and index initialization paths. Capture focused baseline failures without treating historical counts as current evidence.
- In Mode A, independent read-only source/authorization and index/activity audits may run now. Reconcile findings before freezing contracts. In Mode B, perform the same audits inline.
- Deliverable: updated execution notes in this plan with baseline evidence, exact ownership and no unexplained behavior changes.

### T1. Establish shared contracts, schema and index preparation

Owner: primary agent. Dependencies: T0. Acceptance: AC2/AC3/AC4/AC6/AC8.

- Own backend public/runtime DTO definitions, additive changes in `domain/project-vendor-suggestions.ts`, `models/ProjectVendorSuggestion.ts`, new scope/index readiness helpers and `migrations/project-vendor-suggestion-scope.ts`; keep legacy payload compatibility explicit.
- Own `domain/authorization.ts`, `domain/route-operations.ts`, frontend authorization mirror and shared API types. Define precise source/command/result/availability/page shapes before parallel consumers implement them.
- Prepare the read-only inventory and backup-required migration/rollback helpers and operational runbook described above. Test only against disposable replica sets. No persistent database command is run.
- Define replay/audit integration without changing unrelated PM actions or notification behavior. Keep new PM schemas separate where tightening a shared schema would break legacy Admin clients.
- Deliverable: stable importable contracts and passing focused schema/index/permission contract tests. Any material deviation from the approved spec returns to the specification gate; routine internal implementation choices do not reopen it.

### T2. Implement independent backend and PM frontend slices

Dependencies: T1. These three slices may run in parallel in Mode A, using at most three children plus the primary agent. Every writer is told they share the worktree and must preserve others' edits.

**T2a: approved read projections and Procurement recommendation read.** Owner: one backend implementer. AC2/AC3/AC5/AC7.

- Own `services/project-manager/sources.ts`, a focused shared approved-source helper, new estimate/candidate/suggestion-activity read modules, a new Procurement Main Line recommendation read service, and corresponding new read-projection tests.
- Own bounded additions/extraction inside `procurement-basket-vendor-eligibility.service.ts` needed for shared safe readiness facts. Preserve existing eligible candidate semantics.
- Implement safe approved rows, grouped Main Line scopes, bounded current/history reads, recommendation discovery, source reconciliation and actual invitation/bid activity. No writes, schema/registry edits, or dispatch changes in this slice.
- Include regression tests for the existing PM source resolver and unequal finance baselines. Publish exported read interfaces to the primary agent and T2b rather than independently redefining DTOs.

**T2b: persisted PM commands and legacy compatibility.** Owner: a different backend implementer. AC3/AC4/AC6/AC8.

- Own `services/project-vendor-suggestions.service.ts`, focused shared record mutation helpers if needed, a new PM suggestion command module, and suggestion mutation/compatibility/race tests.
- Consume the frozen contracts and index readiness helper. Coordinate the T2a approved-source helper interface through the primary agent; do not edit T2a files.
- Implement ownership, source/assignment/vendor fences, transaction-safe create/CAS update, replay, audit and immutable scope. Keep Admin project-wide list/create/update behavior compatible and explicitly scoped.
- Prove no suggestion action writes invitations, bids, email or notification recipients. Do not change global reader guards, schema/index definitions or dispatch services in this slice.

**T2c: PM estimate view and shared suggestion panel.** Owner: one frontend implementer. AC1/AC2/AC3/AC4/AC9.

- Own new `ProjectManagerEstimationsPage.tsx`, `PMVendorSuggestions.tsx`, a focused estimate/suggestion API-hooks module and stylesheet under `frontend/src/features/project-manager/`, plus their new rendered tests.
- Build to the T1 contracts, reuse existing formatting/tokens and implement loading/denied/conflict states, scoped lookup, own-record actions, activity and note disclosures. Keep API types aligned; no broad raw estimate/vendor calls.
- Do not edit the already-dirty `ProjectManagerWorkspace.tsx`, `PMShared.tsx`, shared router/authorization files or enterprise fixtures; primary owns their integration. No Procurement picker files yet.

### T3. Integrate routes, project entry and Procurement picker

Dependencies: T2 exports stabilized; finish all T2 writers before final integrated tests. AC1/AC3/AC4/AC5/AC7/AC8/AC9.

- Primary owns backend route modules, `app.ts` wiring, route-operation/OpenAPI inventory, related authorization/route/server contract tests, and frontend router/route helpers. Use a focused PM route module rather than expanding unrelated endpoints unnecessarily.
- Primary integrates the header action and shared suggestion panel into the existing PM Procurement tab while preserving current project-detail markup, all execution tabs and return context. Own existing dirty PM/router tests and enterprise fixtures throughout.
- In Mode A, reuse the now-free frontend implementer for `ProcurementBasketEnquiry.tsx`, an optional focused basket recommendations component, `procurementBasketApi.ts` and Procurement basket tests. Do not overlap this writer with T2c ownership or primary fixture integration.
- Add the scoped recommendation view/filter to the actual picker. Preserve explicit/all-eligible/exclusion semantics, selection across pages, invitation preview, update reasons, batches and retry behavior. A failed recommendations request remains visible and retryable without blocking independently verified directory selection.
- Primary reconciles cache keys/invalidation, denial clearing, query enablement, source-conflict behavior and shared component reuse. Add synthetic fixture support for PM-to-Procurement visibility and activity only after real contracts exist.

### T4. Exercise the complete workflow and resolve defects

Owner: primary agent, with bounded fixes returned to their original owners if Mode A. Dependencies: all T2/T3 writers finished. AC1 through AC9.

- Run focused integrated tests first, including disposable replica-set mutation/index tests. Demonstrate PM creation and reload, the same persisted record in Procurement, eligible explicit selection, an existing dispatch path creating a real test request, and exact PM line activity. Use test delivery adapters; no real mail or production records.
- Exercise source/assignment/vendor/CAS races and cache transitions. Validate no response leaks costs, prices, private URLs/tokens or another project's activity.
- Run the rendered viewport/state matrix below using synthetic data, inspect console/network and fix failures. Keep temporary QA evidence outside tracked source paths.
- Deliverable: one integrated worktree with acceptance evidence, no unresolved newly introduced regression and explicit baseline limitations.

### T5. Integrity review, final verification and handoff

Dependencies: T4 complete and writers stopped. AC1 through AC9.

- Mode A: run `integrity_reviewer` against the integrated diff for source lineage, authorization, ownership, transactions, index lifecycle, finance, activity joins and cache isolation. Resolve confirmed findings, then run `verification_runner` for final checks. These stages are sequential.
- Mode B: primary performs the same review and verification sequentially without implementation subagents.
- Inspect final diff and worktree hygiene, reconcile every acceptance criterion, and report exact results, baseline failures, unrun checks, temporary evidence paths and operational requirements. Do not mark unverified behavior complete.
- Explicitly report that no live index migration/deployment/commit/send occurred. Scoped writes in a persistent environment remain unavailable until its separately authorized index preparation passes readiness checks.

## Verification matrix

| Spec acceptance | Required evidence |
| --- | --- |
| AC1: entry and navigation | Header action, direct route, keyboard navigation, preserved project tab/return filters, valid back navigation, invalid external return rejected. |
| AC2: approved read-only lineage | Final/pre/legacy fixtures, zero Design collaborative source, draft edits after approval, missing/ambiguous rounds, unequal projects, zero/null money, included/excluded lines, immutable saved dimensions/rates and source-total reconciliation. No mutation/approval controls or leaked DTO fields. |
| AC3: authorization | Assigned PM A versus PM B, inactive/reassigned PM, Admin grant variations, Procurement, Super Admin, Client/vendor; direct route/service requests and cached-success-to-denial behavior. PM requests to generic edit/send/master/price routes remain denied. |
| AC4: Main Line persistence | L1 repeated in two rooms, L2 in the same basket, L3 in another basket; one vendor on L1/L2, two vendors on L1, old project-wide record, duplicate and request-key mismatch, other-author conflict, own edit/withdraw/reinstate, source history, missing ID and excluded targets. |
| AC5: Procurement connection | Recommendation beyond first candidate page, correct Main Line/basket/room labels, independent Main Line filter, vendor selection deduplication, explicit BOQ scope, no auto-select/send, stale-source recommendation not actionable, recommendation failure with ordinary picker still usable. |
| AC6: gates and concurrency | Replica-set tests with transaction barriers for reassignment, approval/source change, vendor deactivation, two concurrent creates and competing updates; incomplete Configuration, activation/KPI/contact/classification gates and stale dispatch fail without partial audit/receipt writes. |
| AC7: actual activity | Two projects sharing a vendor, multiple lines in one basket, omitted line, partial room coverage, multiple generations/revisions/baskets, source reconciliation, pending/failed/sent/expired/revoked/superseded requests, earlier invitation, actual basket receipt versus matched line response, later request pending after historical bid. Failure is unavailable. |
| AC8: compatibility/indexes | Existing Admin forms/readers, ordinary/select-all/batch/retry Procurement behavior, PM execution tabs, approval/finance baseline, missing/null legacy index filters, new scoped uniqueness, readiness refusal, dry-run no writes, conflicting definitions, partial apply, idempotency and safe rollback refusal. |
| AC9: rendered quality | 320, 390, 768, 1024 and 1440px widths; long specifications/vendor names/notes; loading/empty/stale/source-conflict/CAS-conflict/denied/error; keyboard chooser/search/pagination/disclosures and focus return; readable totals, no document overflow, console/network review and accessibility checks. |

### Planned focused checks

Run from the relevant workspace. New test filenames below are part of the implementation task; update this plan if an equivalent existing test file is extended instead. Do not claim tests exist or pass before they are implemented/run.

Backend:

```text
npm test -- tests/project-manager-estimates.replica-set.test.ts tests/project-manager-sources.replica-set.test.ts tests/project-manager-vendor-suggestions.replica-set.test.ts tests/project-vendor-suggestions.replica-set.test.ts tests/project-vendor-suggestion-scope-index.replica-set.test.ts
npm test -- tests/project-manager-estimate-routes.test.ts tests/project-vendor-suggestions-routes.test.ts tests/project-manager-openapi.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm test -- tests/procurement-main-line-suggestions.replica-set.test.ts tests/procurement-basket-vendor-eligibility.replica-set.test.ts tests/procurement-basket-tender.replica-set.test.ts tests/project-manager-workspace.replica-set.test.ts
```

Frontend:

```text
npm test -- src/features/project-manager/ProjectManagerEstimationsPage.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx src/app/router.test.tsx
npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/procurementBasketApi.test.ts src/features/procurement/VendorProcurement.test.tsx
```

Confirm existing frontend Procurement test locations before running; use `rg --files` rather than interpreting a missing-path/no-tests result as verification. Use the repository replica-set helper with a disposable database. Do not redirect tests to an existing local/deployed database to make them pass.

After focused checks pass, run `npm run typecheck`, `npm test`, and `npm run build` separately in both backend and frontend because shared permission/source contracts changed. Run final `git diff --check` and `git status --short`. There is no repository lint script, so do not claim lint. Re-run affected checks after fixes; do not repeatedly run unrelated suites without a new risk or change.

## Remaining risks and approval boundary

- Live data/index definitions are not inspected by this plan. The implementation must refuse scoped writes if the actual database is not prepared, and the future migration runbook must inventory its exact target before approval.
- Existing old-source/null-round records cannot be upgraded by guessing. They remain readable history or project-wide suggestions with explicit availability limits.
- Accurate activity requires immutable revision membership and persisted reconciliation evidence. Missing evidence stays unavailable/historical rather than being replaced by approximate labels or amounts.
- The current worktree contains previously completed frontend changes. Preserve their exact behavior and distinguish fresh regressions from reproducible baseline failures.
- Specification and task plan are approved; the user selected Mode A. T0 baseline is captured at `/private/tmp/lisno-pm-estimate-handoff-baseline/`. T1–T3 shared contracts, backend persistence/read models and frontend integration are implemented; no live database changes are authorized.

## Implementation and verification record: 2026-10-29

The approved local implementation is present. Approved source reads are shared with the PM baseline; suggestions persist against immutable source and Main Line IDs in the existing collection. The PM estimate route and Procurement tab share one panel, and Procurement recommendations use the actual basket vendor picker and existing dispatch authority. No dependencies or lockfiles changed.

### Final integrated checks

- Backend typecheck and build passed.
- Nine affected replica-set files passed: **152 tests**, using `--maxWorkers=2`: `project-manager-estimates`, `project-manager-sources`, `project-manager-vendor-suggestions`, `project-vendor-suggestions`, `project-vendor-suggestion-scope-index`, `procurement-main-line-suggestions`, `procurement-basket-vendor-eligibility`, `procurement-basket-tender`, and `project-manager-workspace` (all `tests/<name>.replica-set.test.ts`). This includes saved suggestion → actual local-test Procurement dispatch → matching PM activity.
- Seven HTTP/authorization inventory files passed: **248 tests**: `project-manager-estimate-routes`, `project-manager-openapi`, `frontend-authorization-contract`, `authorization-policy`, `route-operation-registry`, `api-docs`, and `server` (all `tests/<name>.test.ts`).
- PM rendered regression file passed **18 tests**, including shared panel behavior, stale/denied/conflict states, note-edit concurrency and keyboard focus restoration. Suggestion tests live in `ProjectManagerEstimationsPage.test.tsx`; no separate `PMVendorSuggestions.test.tsx` was required.
- Focused Procurement checks previously passed: workspace **44**, recommendation component **3**, API **10**, existing VendorProcurement **17**.
- Final frontend typecheck and production build passed after the keyboard fix. An unsupported test-only Testing Library option detected by typecheck was removed before the successful final rerun. Existing large-chunk build warnings remain.
- Final frontend affected lane covered **296 tests in 10 files**: the estimate page, PMShared, project workspace, operational access, router, authorization contract, Procurement basket workspace, recommendation component, basket API, and VendorProcurement. The first batch had 295 passes and one project refresh-test timeout while the full suite was active; an isolated rerun of the complete project workspace file passed **52/52** with no code changes. Logs: `frontend-focused-final.log` and `frontend-workspace-rerun.log`.
- Full frontend command `npm test -- --maxWorkers=2` completed: **366 files passed, 9 failed; 5,728 tests passed, 97 failed**. Of these failures, 96 exactly match baseline test titles and per-file counts; the remaining `ProtectedImage` timeout passed in isolation (**1/1**, no code changes). Logs: `frontend-tests.log` and `frontend-protected-image-rerun.log`. This is not a clean full-suite pass.
- Final `git diff --check` passed. Final status was reviewed; no package/lockfile/config changes or task browser artifacts remain in tracked-source paths. Generated ignored build outputs are `backend/dist/` and `frontend/dist/`; no lint command exists and OCR checks were not run because OCR is unchanged.

### Review and rendered evidence

- Independent integrity review covered approved financial lineage, identity/assignment, source and Configuration fences, transaction receipts, index readiness/rollback, exact tender activity, selection and protected query caches. Its one confirmed note-edit CAS finding was fixed and independently rechecked.
- Browser checks covered PM and Procurement at **320, 390, 768, 1024 and 1440px**, all without document overflow. Ready, empty, loading, initial error, stale refresh failure/recovery and success-to-denial states were inspected. Keyboard entry/back navigation preserves project tab and dashboard filters. A focus-restoration defect found in browser QA was fixed and rechecked.
- PM page/dialog axe checks reported no violations. The new Procurement recommendation section had no violations; the existing Procurement sidebar retains two link color-contrast findings outside this change.
- Screenshots and rendered report: `/private/tmp/lisno-pm-estimate-handoff-qa/REPORT.md`. Full check logs: `/private/tmp/lisno-pm-estimate-final-verification/`. Runtime screenshots and browser logs were moved out of the repository.

### Full-suite limitations and baseline evidence

- The unbounded backend full run was stopped after widespread Mongo replica-set setup/hook timeouts under concurrency. It had no final suite summary and is **inconclusive**, not a passing full run. The nine affected replica suites subsequently passed in the bounded lane above.
- A separate reconstruction of pre-change HEAD plus captured dirty files reproduced **11 existing backend failures** across `config`, `ai-estimator-knowledge-bootstrap`, `ai-estimator-knowledge-domain`, `ai-estimator-knowledge-routes`, and `ai-estimator-knowledge-reference.service`. Logs: `backend-baseline-selected.log` and `backend-baseline-domain.log`. Other failures from the interrupted full run are not claimed as individually baseline-confirmed.
- The same pre-change reconstruction reproduced the **three existing enterpriseTransport frontend failures**: missing protected client workflow-document button and two ambiguous Procurement gallery selectors. It passed 67 other tests. Log: `frontend-baseline-enterprise.log`.
- Broader frontend baseline checks additionally reproduced **93 failures in seven files**: `KnowledgeScreens` (16), `KnowledgeModeSectionStateRemoval` (27), `KnowledgeItemWorkspaceLayout` (4), `KnowledgeModeLayout` (1), `AskLisnoLauncher` (34), `EstimateReviewPanel.collapsible` (1), and `LeadDetail` (10). Together with the harness failures this is **96 baseline-confirmed failures**, with matching test titles and per-file counts in the current full run. Logs: `frontend-baseline-knowledge.log` and `frontend-baseline-other-failures.log`. These unrelated existing failures were not changed as part of the PM handoff.

### Operational handoff

No persistent database was inspected or migrated, and no seed, commit, push, deployment or real external send was performed. New scoped writes deliberately remain unavailable where required indexes are not prepared. Follow the separately authorized, target-specific [index preparation runbook](../../operations/project-vendor-suggestion-scope.md) before enabling writes in a persistent environment.

Fourteen of nineteen captured dirty baseline files remain byte-for-byte unchanged. Intentional changes to existing dirty files are limited to the project header/shared Procurement panel, route test inventory, QA transport and this feature's approved documents. Earlier dashboard/detail styling and compact content/scroll behavior were preserved.

## Follow-up: local View estimations access denial

The user reported the generic frontend Access denied screen after choosing View estimations. This is a defect follow-up within the approved AC1/AC3 workflow, with the existing Mode A choice retained.

Evidence on 2026-10-29: the running loopback backend on port 3000 belonged to the existing `local-chat.mjs --with-ocr` supervisor started before the feature was implemented. Its read-only OpenAPI inventory had 433 paths and contained neither the PM estimate/suggestion endpoints nor `pm.estimates.read`. The browser guard therefore had no current permission to use. The source registry was correct; the process had not reloaded source changes.

The identified local supervisor was gracefully stopped and the same existing `npm run dev` stack restarted. That launcher skips demo seeding. The restarted API inventory has 438 paths, including both new PM endpoints and the estimate permission. No production process, seed, database index migration or data backfill was run.

The project header now calls the existing session-restoration flow once on ordinary View estimations activation when its held snapshot lacks `pm.estimates.read`. This obtains the canonical server authorization after a local update. Already-authorized sessions and modified/new-tab link activation retain normal navigation. No role fallback, permission bypass, policy-version equality gate or automatic denial retry loop was added. A server denial or refresh failure keeps estimate data hidden.

Verification: `npm test -- src/features/project-manager/ProjectManagerEstimateNavigation.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx` passed **65 tests in 3 files**. Nine new cases use the real AuthProvider and route guards, actual project header and estimate component; the stale, denied and refresh-error cases reproduced the issue before the change. Frontend typecheck, production build and diff check passed; existing bundle-size warnings remain. A focused independent integrity review found no security/navigation regression. The follow-up build log is `/private/tmp/lisno-pm-estimate-access-baseline/frontend-build.log`.

Before/after runtime inventories and the pre-follow-up dirty-file manifest are under `/private/tmp/lisno-pm-estimate-access-baseline/`. The only pre-existing dirty production file changed in this follow-up is `ProjectManagerWorkspace.tsx`; a new navigation regression file was added. The user's authenticated browser session was not available to the connected test browser, so final user-session recovery requires refreshing that page once; the running local endpoint presence and real-provider rendered recovery were verified separately.

## Follow-up completed: local suggestion readiness and approved temporary items

The user requested the required fixes after the local database and Configuration diagnosis and explicitly selected allowing suggestions for approved temporary items. These changes preserve item classification and immutable approved values.

- `backend/src/services/estimator-catalogue.service.ts`: both current catalogue and Design-rule reads accept only an explicitly `not_configured` Design section with an undefined payload as empty rules. Configured/malformed/null payloads and identity mismatches remain rejected; current saved draft precedence is unchanged.
- `backend/src/services/project-manager/{approved-source,estimates,vendor-suggestion-reads}.ts`: approved Configuration-backed temporary scopes use stable IDs; frozen type, parent and UOM must match current Configuration. Regular scope digests remain unchanged. Historical suggestions without a matching approved source do not invent a type.
- Shared estimate contracts and OpenAPI add optional `itemType`. PM estimate/suggestion screens and Procurement recommendation rows show compact temporary classification. Backend readiness remains authoritative, and excluded/unmapped/mismatched scopes remain disabled. No dependency or lockfile changes.

### Focused verification

Independent integrity review found no confirmed defect. Final integrated checks ran after all writers stopped, with unchanged hashes across 2,153 source/test/package files:

- Backend command: `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/project-manager-estimates.replica-set.test.ts tests/project-manager-vendor-suggestions.replica-set.test.ts tests/procurement-main-line-suggestions.replica-set.test.ts tests/project-vendor-suggestion-scope-index.replica-set.test.ts tests/project-manager-estimate-routes.test.ts tests/api-docs.test.ts --maxWorkers=2`. The sandbox attempt could not open local sockets. The permitted rerun passed 251/252; one existing catalogue test unexpectedly returned 401. Its whole file then passed 80/80 using `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts --maxWorkers=2`, without edits. This intermittent 401 is not root-caused and the combined run is not claimed wholly green.
- Frontend command: `npm test -- src/features/project-manager/ProjectManagerEstimationsPage.test.tsx src/features/procurement/ProcurementBasketSuggestions.test.tsx src/features/project-manager/ProjectManagerEstimateNavigation.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx --maxWorkers=2`: 40/40 passed.
- Both workspaces: `npm run typecheck` and `npm run build` passed. Existing frontend bundle-size warning remains. `git diff --check` passed. Whole suites were not repeated; previous baseline failures above remain outside this follow-up. OCR is unchanged; no lint script exists.
- Synthetic browser checks at 390 and 1440px: temporary classification, enabled row action, saved temporary suggestion, closed dialog after success, zero document overflow and zero application errors. PM desktop page and mobile page/dialog axe checks had zero violations. Rendered automated tests additionally cover keyboard selection/focus, blocked states and explicit Procurement selection. Screenshots were visually inspected and moved outside the repository.
- Detailed logs and exact commands: `/private/tmp/lisno-pm-suggestion-readiness-verification/REPORT.md`; screenshots and browser logs are in its `browser/` directory.

### Local database preparation and runtime evidence

Only loopback `lisno_demo` was targeted. The existing Lisno backend/worker supervisor was stopped before backup and final inventory. A full secure archive was restored to a disposable Mongo process; all **4,043 documents in 160 collections** matched their before-backup BSON hashes. Apply, rollback and reapply were verified in that disposable restored database, with all documents unchanged. The first synchronous restore utility stalled and was stopped; an asynchronous restore completed successfully before any persistent write.

A fresh conflict-free dry run preceded the target-authorized index apply. Both replacement scoped unique indexes were built and verified before the old project-only index was removed; request uniqueness remained in place. Final `ready: true`, old index absent, both replacement indexes present, request index present. All 4,043 document hashes across all 160 collections remained identical after the local index change. No collection records, approvals, item classification or amounts were rewritten.

Secure operational evidence and archive: `/private/tmp/lisno-pm-suggestion-readiness-ops-2026-10-29/` (directory 0700, backup/evidence files 0600). Includes `restore-evidence.json`, `final-dry-run.json`, `indexes-before-apply.json`, `change-record.json`, before/after hashes and the archive. Keep these private for local recovery; never commit the archive. The runbook's conflict-refusing rollback remains available, and old uniqueness must not be restored if later legitimate scoped records conflict.

The normal `npm run dev` supervisor was restarted without seeding. `GET /api/v1/health` returned `status: ok`. A read-only check through the actual assigned-manager estimate/candidate services confirmed both reported rows: **POP false ceiling** is `main_line`, **False Ceiling Painting in Royal Emulsion** remains `temporary`; both return `canSuggest: true`, null unavailable reason, and write availability true. Their approved amounts remain 900,000 and 3,000,000 paise respectively. Both candidate reads return 13 saved vendors with 2 currently suggestable. Evidence: `runtime-readiness.json`.

No real suggestion, invitation or bid request was created during runtime validation. Procurement activation and dispatch prerequisites remain in force. No seed, remote/production migration, deployment, commit or push was performed. The authenticated user browser was not connected; refresh the local estimate page to consume the verified live response.

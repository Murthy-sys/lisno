# Temporary-item creation and basket management task plan

Date: 2026-09-23
Status: Approved. Mode A implementation and scoped verification completed; diagnostic and baseline-test limitations recorded below.

Approved specification: [Temporary-item creation and Main/Sub-Basket management](../specs/2026-09-23-temporary-items-basket-management-design.md).

The user approved the specification in the conversation after its creation. Its original proposed-status wording records the earlier stage; this plan records the approval without modifying that file during the task-plan-only stage.

## Outcome and constraints

Fix temporary-item creation from Main Lines, allow inline Main/Sub-Basket creation and selection, and extend Configuration with add/edit/delete management for both basket levels. Preserve draft-only controls in the recommendation editor, stable identity, independent recommendation saves, permissions, and transactional deletion.

The original runtime exception remains unconfirmed. Duplicate-key exceptions reaching generic 500 handling are an observed code defect, not a proven explanation of the user's request. Establish a reproducer or explicit diagnostic limitation before claiming the reported issue resolved.

This plan authorizes no production changes, writes to the user's catalog, migrations, seeds, dependency installation, staging, commits, or pushes. All mutation verification uses isolated fixture data. No task below begins until task-plan approval and execution-mode selection.

## Evidence affecting implementation

- Relevant files remain dirty with earlier draft Sub-Basket editing and unrelated administration changes. No application files changed during specification or task planning.
- `createMainLine` commits the item and then calls `getItemAfterMutation`; failure recovery must distinguish transaction failure from a lost/failed post-commit response.
- `coordinateNewBasketReferences` currently coordinates only newly introduced Main Basket IDs. Retargeting a rule between Sub-Baskets or child items inside the same Main Basket can therefore leave that set unchanged. Deletion coordination must cover changed group/item references and removal, not assume a new parent reference always occurs.
- `stripReferencesToDeleted` currently matches Main Basket/Main Line IDs and updates surviving payloads without advancing their section versions. New Sub-Basket cleanup must explicitly handle whole-group IDs and coordinate versions of surviving mutable drafts so stale saves cannot restore removed references. Preserve existing Main Basket/Main Line deletion behavior through regression tests.
- `RelatedItemCreationInput` currently requires a Sub-Basket ID or name branch. Extend/reconcile that shape for explicitly groupless temporary items without treating an unresolved selected group as a valid null group.
- Existing reference DTOs are service-local and frontend knowledge types live in `knowledgeTypes.ts`. Extend established locations rather than introducing a parallel contract system or editing unrelated general API types.

## Ownership and dependency graph

Only one parent task is marked in progress at a time. Parallel work may be child slices of that parent after all prerequisite contracts are settled.

| Task | Depends on | Responsible owner | Parallel eligibility |
| --- | --- | --- | --- |
| T0: Baseline and reproduction | Approvals and mode | Primary | Read-only audits may run together in Mode A |
| T1: Freeze contracts and frontend integration surface | T0 | Primary, consulting backend owner | Must finish before feature writers start |
| T2: Implement feature | T1 | Primary coordinates T2a/T2b/T2c | Three disjoint writer slices in Mode A |
| T2a: Backend creation and group lifecycle | T1 | Backend owner | With T2b/T2c and primary-owned adapters |
| T2b: Creation dialog and recovery | T1 | Creation-UI owner | With T2a/T2c |
| T2c: Configuration manager | T1 | Manager-UI owner | With T2a/T2b |
| T3: Cross-layer integration | All T2 writers finished | Primary | Sequential shared-file reconciliation |
| T4: Integrity review and fixes | T3 | Integrity reviewer in Mode A; primary in Mode B | Review after writers finish |
| T5: Final verification and handoff | T4 fixes complete | Verification runner in Mode A; primary in Mode B | Independent checks may run together on the stable worktree |

Mode A uses native Codex agents only. At most three independent writer agents work alongside the primary. Mode B runs every slice, review, and verification inline without implementation subagents. No agent is spawned during this planning gate.

### File boundaries

- **Primary:** this plan and integration record; shared backend route/authorization/audit/OpenAPI integration; `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/domain/route-operations.ts`, `backend/src/domain/audit-actions.ts`, `backend/src/openapi.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`; associated route/authorization/docs fixtures and tests; frontend `knowledgeTypes.ts`, `knowledgeApi.ts`, `knowledgeQueryKeys.ts`, `knowledgeMutationSync.ts` and their tests; shared `frontend/src/test/fixtures/enterpriseRoutes.ts` changes and any final accessibility fixture integration.
- **Backend owner:** `backend/src/services/ai-estimator-knowledge-item.service.ts`, `ai-estimator-knowledge-reference.service.ts`, `ai-estimator-knowledge-cascade.ts`, narrowly necessary knowledge-domain helpers; focused item/reference/Sub-Basket/related-item/replica-set tests. The service-local interface definitions stay with this owner but must implement the T1 contract exactly. Models may change only if evidence requires a compatible change within the approved specification; no schema migration is assumed.
- **Creation-UI owner:** `CreateKnowledgeItemDialog.tsx`, `CreateKnowledgeBasketFields.tsx`, a narrowly scoped Sub-Basket creation/selection helper if needed, `knowledgeRelatedItemCreation.ts`, and their focused tests. Do not edit manager components, the recommendation builder, shared API/cache files, or shared styles.
- **Manager-UI owner:** `KnowledgeBaseIndexPage.tsx`, new focused basket-manager/Sub-Basket editor/delete components as needed, existing feature CSS limited to manager changes, `KnowledgeBasketDeletion.test.tsx`, and manager-specific new interaction tests. Own call-site prop wiring in the index page; agree the prop contract with the creation owner before writing.
- **Primary during T3:** recommendation builder/workspace callers, existing draft dialogs, deletion redirects, and cross-feature tests only after all relevant writers finish. Preserve the existing uncommitted draft-editing feature.

All writers are told they are sharing one worktree, must not revert others' work, and must report any need to cross a boundary before editing that path. The primary reviews each dirty target's complete existing diff before assignment and records the baseline and ownership handoff. Unrelated administration files and their existing changes remain outside scope.

## T0: Capture baseline and reproduce the creation failure

1. Capture `git status --short` and scoped existing diffs in ignored temporary artifacts. Record pre-existing failures separately from this work. Inspect untracked draft-dialog code before extending its behavior indirectly.
2. Trace the actual Main Line recommendation action through dialog input, POST payload, route validation, transaction, and post-commit detail serialization. Establish which request fails; do not infer POST solely from the URL.
3. Use read-only inspection of the available local request/error evidence without exposing tokens or catalog contents. Reproduce writes only in a dedicated replica-set test harness with synthetic identities and baskets, never against the supplied basket.
4. Check valid unique temporary creation, duplicate normalized names, wrong/inactive parents, existing versus new Sub-Baskets, rollback, and failure after commit. Include the direct-Main-Basket temporary case.
5. Add a failing focused regression for the confirmed defect before its fix during T2a. Preserve a sanitized evidence summary of the observed failure and expected response. If the original runtime failure cannot be reproduced, retain that limitation explicitly rather than treating duplicate handling as proof.

**Acceptance:** AC1, AC2, AC8. Exit with a baseline, observed failure-path evidence, and an agreed diagnosis boundary. Stop before any live repair if investigation reveals a need for migration or catalog repair.

## T1: Freeze contracts and shared integration surface

1. Preserve POST creation payload compatibility and the mutually exclusive `subBasketId`/`subBasketName` rule. Existing item-type and completion semantics remain unchanged.
2. Freeze the approved rename payload `{ expectedVersion, name, managementContext?: "configuration" }`. The absent context keeps current draft-only validation; explicit Configuration context permits naming changes without changing child lifecycle.
3. Define the Sub-Basket deletion-preview response with parent/group IDs, current name/version, child/reference counts, and `impactToken`. Define DELETE input `{ expectedVersion, confirmationName, reason, impactToken }` and a result sufficient to remove deleted item/group caches and redirect affected item routes.
4. Define token construction from canonical authoritative impact identities/versions, using existing Node facilities and no new dependency. Bind the token to the parent/group and confirmed impact; counts alone are insufficient. Read a consistent preview and recompute/compare under transaction coordination before deletion. This token is a concurrency check, never an authorization credential.
5. Specify the shared write boundary for child creation, rename/lifecycle, incoming reference addition/removal/retargeting, and deletion. Cover references within an already-referenced Main Basket, preserved references, duplicate/copy paths, and stale source drafts. Use deterministic lock order where multiple targets are touched. A transaction retry must recheck the preview token.
6. Freeze stable error codes and UI treatment for duplicate identity, version/impact conflict, invalid parent, frozen inline group, missing resource, permission failure, and ambiguous create outcome. Unknown server exceptions remain server errors with safe diagnostics.
7. Extend primary-owned frontend API types/client/query keys and establish synchronization helper signatures. Agree creation-dialog props and manager callbacks before assigning writers. Service declarations, route bindings, schemas, and documentation must use the same frozen shapes.
8. If evidence materially changes the approved specification, update it and request its approval once before dependent implementation. Routine details such as token encoding remain implementation choices within the approved contract.

**Acceptance:** AC2, AC5, AC7, AC9. Exit with one recorded contract and non-overlapping writer assignments. Contract changes are broadcast immediately; writers must not invent alternative response or recovery shapes.

## T2a: Backend creation and basket lifecycle

1. Fix the proven creation failure and translate known normalized-name duplicate exceptions into 409 `DUPLICATE_IDENTITY` with an actionable name-field error. Do not recategorize arbitrary Mongo failures as duplicate names.
2. Preserve atomic creation of item, revision, sections, optional combined-create group, and audit. Verify failures roll back those writes; independently created baskets remain intentionally independent.
3. Implement Configuration-context Sub-Basket rename with stable identity, parent-scoped normalization/uniqueness, expected version, audit, and parent coordination. Preserve the absent-context draft guard and its activation-race protection.
4. Implement consistent impact preview and transactional Sub-Basket deletion. Revalidate actor, parent, version, name, reason, and impact token before removing the group, child catalog records, and targeted relationships.
5. Extend reference targeting with Sub-Basket IDs; do not include the containing Main Basket ID when deleting one group. Reconcile mutable surviving sections and aggregate versions so stale saves cannot restore deleted references. Keep audit and approved Estimate/Design records intact.
6. Coordinate incoming reference changes and child writes with deletion, including same-parent retargeting and reference removal. Preserve existing Main Basket and individual Main-Line deletion semantics through shared-cascade regressions.
7. Add service and real replica-set coverage for empty/populated deletion, rollback, unchanged sibling data, wrong parents, stale previews, same-count/different-identity impacts, concurrent child/reference writes, and both rename contexts.

The primary integrates schemas, route operations, audit-action registration, OpenAPI, and route/permission tests in its owned files against these service methods.

**Acceptance:** AC1, AC2, AC5, AC6, AC7, AC9. Writer deliverable includes exact changed files, local checks, preserved pre-existing changes, contract deviations, and unresolved concerns.

## T2b: Temporary-item creation flow and recovery

1. Enable the permitted inline Main Basket action consistently and preselect the relevant parent. Preserve item name and unrelated fields while adding a parent.
2. Load complete parent-scoped Sub-Basket choices. Add independent Sub-Basket creation, maintain stable selected IDs, and clear incompatible selections after a parent change.
3. Preserve required Sub-Baskets for whole-group, child-item, and ordinary estimation-item flows. Represent direct-parent temporary creation explicitly. Never use incomplete catalog data to infer that a group/item does not exist.
4. State that independently saved baskets persist after cancellation, while combined group-and-item creation remains atomic.
5. Reuse/generalize reconciliation for related and Configuration creation. Distinguish validation failure, ambiguous outcome, confirmed match/conflict/absence, confirmed saved item, and refresh failure. Block unsafe resubmission and require explicit reuse of a matching existing record after type/parent checks.
6. Preserve form fields on error, lock duplicate submissions, announce recovery states, restore focus, and use the agreed cache helpers. Leave recommendation saving separate.
7. Add focused tests for all creation contexts, direct-parent temporary items, pagination, duplicate names, server errors before/after commit, failed refresh, wrong-parent/type matches, cancellation, and accessible interaction.

**Acceptance:** AC1, AC2, AC3, AC8, AC10. Do not change the recommendation builder directly; pass required caller changes to the primary for T3.

## T2c: Configuration Main/Sub-Basket manager

1. Extend the current manager into Manage baskets, retaining Main Basket create/edit/delete behavior and displaying a selected parent's authoritative Sub-Basket list on demand.
2. Show empty groups and paginate correctly. Keep loading, error/retry, empty, archived-parent, and permission states explicit.
3. Add independent Sub-Basket creation and versioned Configuration-context rename. Reuse established panel/field/button patterns and agreed API/cache helpers.
4. Add the impact preview and confirmed group delete flow with exact name, reason, required token, child/reference counts, and an explanation of permanent removal. Failed previews disable deletion; impact conflicts require a fresh preview and renewed confirmation.
5. Reconcile lists and selection after deletion without losing unrelated state. Separate saved mutations from refresh errors and provide refresh recovery.
6. Wire creation-dialog props in the index page using the T1 agreement. Keep existing Main Basket deletion routes/payloads unchanged.
7. Add manager interaction tests for add/edit/delete, cancellation, populated and empty groups, permissions, stale versions/preview, failed refresh, focus restoration, and catalog pagination. Keep new CSS limited to readable hierarchy and responsive wrapping.

**Acceptance:** AC3, AC4, AC5, AC6, AC7, AC10.

## T3: Integrate recommendation state, caches, and navigation

1. Wait for every T2 writer, inspect their scoped diffs against the baseline, and reconcile any contract mismatch before running final checks.
2. Finish shared route/schema/docs/authorization and frontend API/key/cache integration. Verify the omitted rename context still reaches the draft-only backend branch.
3. Wire Main Line recommendation callers to the creation dialog while preserving trigger, action, reason, enabled state, target IDs, and other unsaved fields. Existing frozen-group controls remain frozen.
4. Reconcile all affected basket/group/item lists, detail/history/section caches, relationship catalogs, incoming references, deletion previews, and context projections. Cancel/remove obsolete queries where necessary so late responses cannot resurrect deleted items.
5. Redirect affected item routes after deletion. If an open recommendation draft targets a deleted group/item, preserve unrelated fields, mark the target unavailable, and block save pending explicit repair; do not silently retarget or autosave.
6. Verify a successful create selects/navigates to the authoritative item once, even when downstream refresh fails. Confirm no duplicate mutation occurs through recovery callbacks.

**Acceptance:** AC1, AC4, AC5, AC6, AC8, AC9. Run focused cross-feature tests only after the integrated code is stable.

## T4: Integrity review and remediation

Review the integrated result for deletion scope, race outcomes, preview accuracy, stale-draft resurrection, historical data protection, permissions, audit completeness, safe error mapping, and cache/navigation consistency. Use two Main Baskets with identically named Sub-Baskets and unequal populations/references; include sibling items and both temporary/catalog types.

In Mode A, run `integrity_reviewer` after the writers finish. In Mode B, the primary performs the same review inline. Findings receive evidence, severity, and an owner. Fix confirmed defects before final verification; do not dismiss a shared-cascade concern merely because it predates a changed call path.

**Acceptance:** AC2, AC5, AC6, AC7, AC8, AC9. All material findings resolved or explicitly reported as blockers/limitations.

## T5: Verification and handoff

Start with focused checks and run each required broader check once on the integrated result. Repeat only after relevant fixes or unresolved failures. Tests using Mongo must create their own replica set and must not clear or connect to the user's catalog database.

Backend focused commands, from `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-sub-baskets.test.ts tests/ai-estimator-knowledge-related-items.replica-set.test.ts
npm test -- tests/ai-estimator-knowledge-routes.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
npm run build
```

Add new Sub-Basket deletion/impact/race test files to these commands if coverage is split into focused files. Include existing basket-quality and context-service regressions if shared deletion/context changes affect those contracts. Run the broader backend suite if review finds shared behavior beyond the focused knowledge/authorization lanes is affected.

Frontend focused commands, from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx src/features/ai-estimator-knowledge/knowledgeRelatedItemCreation.test.ts src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeDeletionRedirect.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm test -- src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeCatalogNotices.test.tsx
npm run typecheck
npm run build
```

Include all new manager/creation tests and relevant accessibility checks. Run a broader frontend suite if shared fixtures or providers change beyond this feature. No lint command exists; do not report lint as passed.

Rendered checks use isolated fixture services with the running frontend. Check desktop and approximately 390px mobile width: Main Line temporary creation, inline parent/group creation, group switching, manager add/rename, impact confirmation/cancel/delete, stale preview, failed refresh, empty lists, keyboard/focus, and unavailable target after deletion. Inspect console and network errors. Load the browser/QA skill when execution reaches this task. Store screenshots/logs under an ignored temporary path and report that path without committing artifacts.

Repository checks, from the root:

```sh
git diff --check
git status --short
```

In Mode A, use `verification_runner` after integrity remediation; it must verify the integrated worktree without product-source edits. If fixes follow verification failures, rerun affected checks on the final result. In Mode B, the primary performs equivalent verification inline.

### Acceptance trace

| Spec criterion | Evidence required |
| --- | --- |
| AC1 | Main Line creation and preserved unsaved recommendation interaction; successful isolated POST |
| AC2 | Original-path diagnostic evidence, valid/duplicate/invalid cases, transaction rollback |
| AC3 | Inline create/select, parent changes, direct-parent temporary case, multi-page catalogs |
| AC4 | Manager add/edit/delete and cross-screen name/cache refresh |
| AC5 | Configuration rename versus draft-only rename, stable IDs, activation race |
| AC6 | Main Basket regression and scoped Sub-Basket cascade with asymmetric siblings/parents |
| AC7 | Preview/name/reason/token validation, cancellation, concurrency, stale preview, rollback |
| AC8 | Ambiguous outcome, identity-safe explicit reuse, no duplicate retry, refresh recovery |
| AC9 | Sole active Super Admin, route permissions, denied-write audit absence, OpenAPI/registry tests |
| AC10 | Keyboard, focus, announcements, readable desktop/mobile rendering, console/network review |
| AC11 | Exact focused/risk-based checks, typechecks, builds, hygiene results, limitations |

The final handoff reports the implemented outcome, principal decisions, changed files, exact checks and results, unrun checks, original-error reproduction status, remaining risks, and artifact paths. State that no migrations, live catalog changes, deployments, commits, or pushes occurred. Do not label partially verified work complete.

## Progress and next gate

- Specification approved by the user.
- Task plan approved by the user; Mode A selected.
- T0 complete: baseline at `/tmp/lisno-temporary-baskets-20260923/baseline`. Existing related-item/Sub-Basket replica tests passed (17 tests), including duplicate-name temporary POST returning 500. Original user's request remains unconfirmed. Creation/reconciliation baseline passed (71 tests).
- T1 complete: frozen contract below; independent audits reconciled and ownership handoffs issued.
- T2 complete: all three writers stopped. Backend focused regression 207 tests plus management 16 and related-items 5 passed; creation/reconciliation 85, builder 65, manager 28, and targeted Screens 2 passed. Shared route/auth/docs 193 and API/cache 25 passed. Typechecks passed during integration.
- T3 complete: stable-ID caller wiring and shared route/API/cache integration reconciled. Original dirty work preserved.
- T4 complete: integrity review found one ambiguous-create recovery gap in Configuration Sub-Basket creation. The manager now reconciles the complete parent catalog, blocks blind retries, and requires explicit stable-ID reuse. Three new regressions pass; focused re-review cleared the finding. No other material findings.
- T5 complete: final integrated verification covered 784 tests: 771 passed, 13 failed with names exactly matching the reconstructed baseline. Backend 487/487; frontend 284/297. Both typechecks/builds and final diff check passed. Synthetic browser verification and accessibility checks passed after the contrast correction. Original-request diagnosis remains limited as recorded below.
- Baseline limitation: reconstructed initial worktree reproduces all 13 unrelated Mode-editor failures in `KnowledgeScreens.test.tsx` (68 passed, 13 failed); logs at `/tmp/lisno-temporary-baskets-20260923/frontend-screens-baseline.log`.

### Frozen implementation contract

- Rename adds optional `managementContext: "configuration"`; omitted context retains draft-only validation.
- `getSubBasketDeletionImpact(actor,basketId,subBasketId)` returns `{ basketId, subBasketId, subBasketName, version, mainLineCount, referenceCount, impactToken }`.
- `permanentlyDeleteSubBasket(actor,basketId,subBasketId,input)` takes `{ expectedVersion, confirmationName, reason, impactToken }` and returns `{ basketId, subBasketId, deleted: true, deletedAt, deletedMainLineIds: string[], deletedReferenceCount }`.
- Token is a 64-character lowercase SHA-256 digest of canonical parent/group/child/reference identity and version data from a consistent transactional snapshot. DELETE recomputes after obtaining the parent dependency write. Mismatch is 409 `DELETION_IMPACT_CHANGED`.
- Coordinate sorted prior/new/retained target parents, including same-parent retarget/removal and legacy item-only references; retain subgroup CAS and version surviving mutable drafts during reference cleanup. No schema migration.
- New audit action: `ai_estimator_knowledge_sub_basket_permanently_deleted`.
- Frontend API uses `getKnowledgeSubBasketDeletionImpact` and `permanentlyDeleteKnowledgeSubBasket`; strict cache helper `syncKnowledgeSubBasketDeletion(queryClient,result)` publishes deletion before refresh and can reject for refresh-only recovery.
- Creation dialog preserves existing callbacks and adds optional `canCreateSubBasket` defaulting to `canCreateBasket`.

The specification, task-plan, and execution-mode gates are complete. Implementation and scoped verification are recorded below.

## Final outcome and verification

Implemented independent Main/Sub-Basket creation and stable-ID selection in item creation; direct-parent temporary items; Configuration Main/Sub-Basket management; contextual group rename; transactional, preview-confirmed scoped group deletion; reference cleanup with stale-draft fencing; and identity-safe creation/refresh recovery. Temporary creation from a Main Line preserves the unsaved recommendation trigger, action, reason, and selected group. Recommendation saving remains an explicit separate action.

Two isolated backend failures were reproduced and repaired: duplicate normalized item names now return actionable `409 DUPLICATE_IDENTITY` instead of generic 500; Mongoose transaction abort cleanup no longer masks the creation error with an embedded-document `__v` StrictModeError. The exact payload/exception from the user's original basket was unavailable and was not reproduced against their catalog. No data repair or migration is claimed.

- Final backend: 487 passed across 13 files, including real replica-set creation, rollback, scoped cascade, reference/child concurrency, authorization, registry, docs, context, and basket-quality regressions.
- Final frontend: 284 passed, 13 pre-existing failures across 10 files. All failed names exactly match the initial baseline's unrelated Mode-editor `Item name` textbox assertions. No new test failures.
- `npm run typecheck` and `npm run build` passed in both workspaces. Final frontend build includes the browser-discovered contrast fix. Build warns about large existing bundles; Mongo tests emit a deprecated-option warning.
- `git diff --check` passed. Sixteen unrelated baseline files were compared byte-for-byte and unchanged. Concurrent external dashboard work remains preserved.
- Browser: synthetic fixture flows at 1440px desktop and 390px mobile covered independent/inline creation, temporary creation from Main Line, retained draft fields, Sub-Basket rename, populated-delete cancellation, empty/populated deletion, stale impact/name reconfirmation, lost-create explicit reuse, saved-mutation refresh-only retry, empty state, keyboard focus trapping, Escape/focus return, and no horizontal overflow. Manager, creation, and deletion axe scans ended with zero violations. Final fixture pass had zero runtime errors and zero unexpected requests. Only axe preload-asset warnings remained.
- Browser screenshots were inspected. Artifacts, exact command logs, machine baseline comparison, and the verification report are in `/tmp/lisno-temporary-baskets-20260923/`; browser snapshots/logs are under its `browser/` directory. Task browser and Vite sessions were closed; runtime outputs are outside tracked source or ignored build directories.

No dependencies, lockfiles, live catalog changes, seeds, migrations, deployments, commits, or pushes were performed. Full unrelated workspace suites and OCR tests were not run; no lint script exists. The risk-focused verification commands and per-file counts are in `/tmp/lisno-temporary-baskets-20260923/final-verification/verification-report.md`.

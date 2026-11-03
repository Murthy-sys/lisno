# Resolve vendor assignments blocking basket deletion: task plan

Date: 2026-11-03
Status: Implemented and verified locally; known baseline failure documented
Specification: [Approved design](../specs/2026-11-03-basket-deletion-vendor-resolution-design.md)
Specification and task-plan approvals: Received in the conversation on 2026-11-03.
Execution mode: A, parallel sub-agents, selected by the user.

## Intended result

Main Basket and Sub-basket deletion popups identify the vendors blocking deletion and link to their exact details. Users can reassign or remove the relevant basket assignment, then return to a fresh deletion preview. Vendors retain at least one valid classification pair. Authorized Super Admins can correct archived vendors' assignments without changing their archived status or other profile fields.

No vendor deletion, automatic basket deletion, general archived-profile editing, production mutation, migration, dependency installation, commit, push, or deployment is included.

## Execution and ownership

Only one parent task is in progress at a time. Tasks 2–4 are independent implementation slices within the implementation parent after Task 1 settles the shared contracts. Task 5 integrates them; review and final verification run after all writers finish.

In Mode A, use these non-overlapping owners:

| Owner | Responsibility and exclusive write boundary |
| --- | --- |
| Primary agent | Product interpretation, shared frontend API/types/cache/return-context helper, vendor details integration and assignment editor, Configuration return restoration, plan and final integration. Own `KnowledgeBaseIndexPage.tsx`, `KnowledgeBasketManagementDialog.tsx`, and any necessary changes to the already-dirty `KnowledgeItemWorkspacePage.tsx`. |
| Backend implementer | Backend classification normalization and command, authorization, route registry, OpenAPI, and backend regression tests. All backend changes belong to this owner until handoff. |
| Frontend implementer | Shared blocker-list component, its focused tests, and integration in `KnowledgeSubBasketDialogs.tsx`. Do not edit parent-owned index/management/vendor-detail files or shared API/types. |
| Integrity reviewer | Read-only review of the integrated command, permissions, transactions, lineage, navigation, and caches after writers finish. |
| Verification runner | Final checks on the integrated worktree after review fixes. No product-source edits. |

In Mode B, the primary agent performs the same tasks, review, and verification inline. No implementation subagents are used.

Every writer receives the dirty-path snapshot, explicit owned paths, agreed interfaces, and the instruction that others share the worktree. Writers must preserve existing work and request an ownership handoff before touching another owner's files. Read-only audits may run in parallel in Mode A after execution is authorized; implementation must wait for the shared contract handoff.

## Task 1: Preserve current work and settle implementation contracts

Owner: Primary agent. Dependencies: plan approval and execution-mode selection.

1. Capture `git status --short` and the relevant per-target diffs before writers begin. Preserve the existing In-house changes in `KnowledgeInHouseComponents.tsx`, `KnowledgeInHouseComponents.test.tsx`, `KnowledgeItemWorkspacePage.tsx`, `KnowledgeModePanel.tsx`, and `KnowledgeScreens.test.tsx`, plus their design and plan.
2. Trace the vendor actor guard, directory-update operation, Configuration lifecycle operation, existing vendor detail route gate, and current full-profile transaction before assigning backend implementation.
3. Freeze the strict classification request and safe response shape from the approved design. Agree on error handling for stale version, invalid selection, permission denial, missing target, and idempotency conflict.
4. Agree on a typed, validated return context: allowed local Configuration route, stable Main Basket ID, optional Sub-basket ID, and restoration intent only. It must contain no deletion command, prior typed confirmation, private vendor data, or arbitrary redirect URL.
5. Define the blocker-list props and ownership boundary: target IDs, authoritative impact count, access state, details-navigation callback, and impact-refresh callback. Use the existing vendor-list API with `includeArchived: true`; Sub-basket lookup must use only `subBasketId`.
6. Define query keys and synchronization for the safe summary, private vendor details, KPI detail view where affected, vendor lists, blocker pages, and both deletion impacts. Never put private profile responses into catalog caches.

Completion evidence: recorded ownership, target diffs reviewed, and shared contracts handed to implementers. Covers AC1–AC6 boundaries. No unresolved material product choices are expected; discoveries that materially change the approved design require updating that design at the prescribed gate.

## Task 2: Implement the classification-only backend command

Owner: Backend implementer in Mode A; primary in Mode B. Depends on Task 1. May run alongside Tasks 3–4.

Affected areas:

- `backend/src/services/procurement-vendor-profile.ts` and a focused extracted classification helper if necessary;
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`;
- `backend/src/services/procurement-vendor-save-command.ts`;
- relevant vendor contracts and actor guards;
- `backend/src/routes/ai-estimator-knowledge-admin.ts`;
- `backend/src/domain/route-operations.ts`, the corresponding route-operation fixture, and applicable OpenAPI definitions;
- focused backend tests, including a dedicated classification-command replica-set suite.

Steps:

1. Extract/reuse selection normalization from the existing full-profile preparation path. Preserve legacy primary-only records, retained unavailable references, selected-child parent validation, bounded arrays, and deterministic locking order. Keep existing full-profile behavior covered by regressions.
2. Add `PATCH /admin/ai-estimator-knowledge/vendors/:id/classification` with strict runtime validation of `expectedVersion`, complete `mainBasketIds`/`subBasketIds`, required `reason`, and `idempotencyKey`. Reject unknown fields, empty final classification, and invalid new catalog selections.
3. Enforce normal directory-update authorization for non-archived vendors. For archived vendors additionally require Super Admin identity and Configuration lifecycle authority. Keep the generic archived-profile edit prohibition intact.
4. Within the existing transaction pattern, load and version-check the vendor, coordinate with basket deletion using the established dependency locks, and change only classification fields, normalized primary fields, version/update metadata, and the audit event.
5. Reuse the persistent vendor-save-command mechanism with an operation-specific identity for classification corrections. Preserve existing full-profile command identities and replay semantics. Same-key/different-input calls must fail; exact retries must not duplicate audit or overwrite subsequent changes.
6. Return the agreed safe summary. Audit only the actor/vendor IDs, reason, and old/new classification IDs. Synchronize registry, route inventory, OpenAPI, and runtime schema.
7. Test asymmetric selections, legacy fields, retained archived/inactive references, last-pair replacement, missing/deleted destinations, unknown-field rejection, and exact preservation of all unrelated stored fields.
8. Use disposable replica-set tests for atomic audit/CAS/idempotency and races against full-profile updates and Main Basket/Sub-basket deletion. Verify both new-assignment protection and removal of an existing blocker; do not weaken transaction semantics.

Completion evidence: focused command/profile/route tests pass; replica-set tests execute rather than skip. Covers AC3–AC5 and backend portions of AC1/AC7.

## Task 3: Build the shared vendor blocker list

Owner: Frontend implementer in Mode A; primary in Mode B. Depends on Task 1. May run alongside Tasks 2 and 4.

Affected areas: new focused blocker-list component and tests under `frontend/src/features/ai-estimator-knowledge/`, plus `KnowledgeSubBasketDialogs.tsx` and its focused regression coverage.

Steps:

1. Query the existing paginated vendor listing for the exact target, including archived records. Render name, identifying code, status, and an accessible exact-vendor details action. Use stable IDs throughout.
2. Provide bounded pagination and loading, empty-after-change, error/retry, and refreshing states. Test duplicate names and unrelated vendors with asymmetric fixtures.
3. Respect vendor-directory read permission before fetching names, and the existing detail-route permission before showing navigation. Hide stale protected data after access revocation; retain the count-only explanation when access is unavailable.
4. Keep the authoritative impact count separate from loaded rows. A list error, partial page, or mismatch cannot enable deletion. Surface changed data and require a fresh impact review rather than treating an empty list as permission to delete.
5. Integrate the shared list into the Sub-basket dialog through the agreed callbacks without weakening impact-token, reason, version, or confirmation checks. Hand the reusable component to the primary agent for Main Basket integration.
6. Verify keyboard names, readable mobile layout, pagination/retry, focus behavior, access denial, and no unintended delete call.

Completion evidence: rendered interaction tests pass and component contract is handed off. Covers AC1 and blocker-list portions of AC2/AC6/AC7.

## Task 4: Implement assignment editing and return navigation

Owner: Primary agent. Depends on Task 1. Can progress alongside Tasks 2–3 against agreed contracts; live integration waits for their handoffs.

Affected areas:

- `frontend/src/features/procurement/VendorKpiStaffPage.tsx`, `vendorProfileApi.ts`, `VendorBasketFields.tsx` only where necessary, and a focused assignment-editor component/test;
- shared frontend knowledge/vendor types, query keys, and `knowledgeMutationSync.ts` only where existing synchronization is insufficient;
- typed return-context helper and tests;
- `KnowledgeBaseIndexPage.tsx`, `KnowledgeBasketManagementDialog.tsx`, and any necessary Configuration workspace return restoration;
- focused navigation/deletion tests, avoiding unrelated rewrites of existing large test suites.

Steps:

1. Add the typed classification API client and strict response identity handling. Render Manage basket assignments under the agreed permissions on the established vendor details page.
2. Reuse `VendorBasketFields` selection behavior. Show the originating blocker, require a reason, cascade child removal when removing a parent, preserve unrelated selections, and require a valid replacement before removing the last pair.
3. Keep archived vendors' other fields read-only. Handle pending save, field errors, CAS conflict/reload, uncertain-result retry with the same command identity, cancellation/discard, and dirty-navigation protection. Do not silently merge changed server selections.
4. Validate and carry the agreed return context when opening details. Preserve existing Configuration unsaved-change guards, including inline basket management within a dirty Main Line workspace. Test canceled navigation and successful return.
5. Add Back to basket deletion. Restore the original permitted route and exact target using current data; reopen a fresh impact preview with empty confirmation. Missing/invalid targets fall back safely to the Configuration list with an explanation.
6. Integrate the shared blocker list into Main Basket deletion. Finish callbacks between inline management, Sub-basket deletion, vendor details, and return restoration without overlapping the frontend implementer's files before handoff.
7. Invalidate/refetch every affected cache after confirmed saves and on return. Keep refresh failures visible and deletion disabled until a verified current impact allows it. Never automatically submit deletion.

Completion evidence: rendered tests for both directions of navigation, selection changes, archived correction, cancel/conflict/retry, cache refresh, and denied/malformed return states. Covers AC2–AC4 and AC6–AC7.

## Task 5: Integrate and review invariants

Owner: Primary agent with read-only integrity reviewer in Mode A. Depends on Tasks 2–4 and all writers completing.

1. Inspect the integrated diff and reconcile contract or error-shape disagreements. Verify earlier In-house and request-basket functionality remains intact.
2. Review backend authorization before replay, strict field allowlists, archived status preservation, safe output, version protection, transaction/audit atomicity, command identity separation, and deterministic dependency lock order.
3. Review exact legacy blocker predicates, pagination, missing/renamed targets, return-route validation, draft guards, actor-scoped query data, and all affected invalidations. Confirm no count/list mismatch can bypass deletion checks.
4. Fix review findings through explicit ownership handoffs, then rerun only affected focused checks before final verification.

Completion evidence: no unresolved correctness, authorization, or data-integrity findings. Covers AC1–AC7.

## Task 6: Verify the integrated result and hand off

Owner: Verification runner in Mode A, with primary-owned browser QA and reconciliation; primary in Mode B. Depends on Task 5 and finished writers.

Run focused checks first, using the final added test filenames where applicable:

| Area | Checks and acceptance coverage |
| --- | --- |
| Backend normalization and command | Existing `procurement-vendor-profile` tests and new classification tests; strict schema, preservation, normalization, CAS, and retry behavior. AC3–AC5. |
| Backend transactions | New classification replica-set suite plus `procurement-vendor-profile.replica-set.test.ts` and `ai-estimator-knowledge-sub-basket-management.replica-set.test.ts`; relevant Main Basket deletion cases from the integration suite. AC1/AC4/AC5. |
| Backend permissions and inventory | `ai-estimator-knowledge-routes.test.ts`, `route-operation-registry.test.ts`, `super-admin-authorization.test.ts`, applicable authorization/OpenAPI checks and updated route fixtures. AC4/AC7. |
| Frontend dialogs | `KnowledgeBasketDeletion.test.tsx`, `KnowledgeBasketManagementDialog.test.tsx`, and new blocker-list/return tests. AC1/AC2/AC6/AC7. |
| Frontend vendor flow | New assignment-editor tests plus `ProcurementVendorProfile.test.tsx`, `VendorKpiWeb.test.tsx`, and `VendorDirectory.test.tsx` as affected. AC2–AC4/AC6/AC7. |
| Prior task preservation | Focused In-house component and request-basket regressions if shared workspace/navigation paths changed. Record established baseline failures separately. |

Commands follow repository conventions:

- Backend: `cd backend && npm test -- tests/<relevant>.test.ts` for each selected suite; `npm run typecheck` and `npm run build` in `backend/`.
- Frontend: `cd frontend && npm test -- <path-to-test>` for the selected suites; `npm run typecheck` and `npm run build` in `frontend/`.
- Broaden tests when the normalization extraction or registry changes expose additional consumers, or when focused failures justify it. Report the exact suite scope rather than implying all repository tests ran.
- Hygiene: `git diff --check` and `git status --short`. There is no repository lint script; do not claim lint passed.

Perform browser QA using synthetic fixtures and the existing QA transport, with no production credentials or records. Check desktop and mobile widths, main and child blockers, archived correction, multiple pages, denied access, failed fetch/save, final-pair replacement, keyboard/focus, unsaved navigation, return to fresh impact, and no automatic deletion. Inspect console/network errors and run available accessibility checks. Stop task-owned servers and remove temporary runtime artifacts when finished; report any retained temporary output paths.

Use the established disposable Mongo replica-set helper; never seed or target a persistent database. A missing Mongo binary or other test-environment restriction is an explicit unverified check, not a passing result.

Final handoff states the outcome, principal decisions, affected files, exact checks/results, pre-existing failures, unrun checks, and remaining limitations. No migration or external action is expected. AC8 requires recorded evidence for the requested behavior; do not label partially verified work complete.

## Gate status

- Specification approved.
- Task plan approved.
- Mode A selected; implementation authorized.
- Backend, blocker-list, editor, and navigation work integrated.
- Integrity review complete; no unresolved findings after return-scope fixes.
- Final integrated verification complete; selected checks show no new persistent regressions. The existing backend route-test failure remains documented below.


## Implementation and review record

The classification endpoint, shared blocker list, assignment editor, exact-vendor navigation, and fresh return preview are implemented. No dependencies or schema migrations were added. The earlier In-house dropdown changes remain intact.

Integrity review confirmed strict request fields, current-state authorization before idempotent replay, transactional audit/CAS, deterministic selected-parent locks, protected-field preservation, and cache synchronization. It identified and resolved two related return-path issues: Main Line workspace returns now retain `inline`/`draftOnly`, and their fresh membership check uses `listKnowledgeMainLines` with `includeArchived: true`. Current source editability, source exclusion, target parent membership, and all target member statuses are rechecked before restoring the dialog. The focused return suite passed all 26 tests after these fixes.

Rendered browser checks used synthetic data in the existing enterprise QA transport. Desktop 1440×960 and mobile/touch 390×844 both showed readable blocker lists and assignment editing, no horizontal overflow, and zero axe violations in the checked dialogs. The desktop flow removed a Main Basket and its child while retaining the other group. The mobile flow removed only a Sub-basket, retained both Main Basket selections, rejected an empty final pair, and retried a simulated 503 with the identical idempotency key. The vendor remained archived. Returning reopened the correct preview with empty confirmation, zero references after correction, and no automatic delete. A simulated blocker-list failure kept deletion disabled; retry required name confirmation again. No DELETE request or external message was sent. The QA tab was closed and the task-owned Vite server stopped. Screenshots were inspected inline, not retained as files.

Browser console: no application errors or QA error-boundary failures; one pre-existing synthetic preload-assets warning. All network writes used the synthetic in-memory transport.


## Final integrated verification evidence

- Frontend: 19 selected files, 566 unique tests. Initial concurrent run passed 562 and failed four asynchronous cases. Rerunning the three affected files with `--maxWorkers=1` passed all 214 tests, resolving every initial failure without source changes. All 566 selected tests are verified passing across the final run and isolated retry.
- Backend: eight selected files, 456/457 passed, zero skipped. All 14 new classification replica-set tests, 29 existing profile replica-set tests, 26 Sub-basket replica-set tests, 45 route-registry tests, 154 authorization tests, and 71 API documentation tests passed.
- The remaining backend failure is `permits Procurement vendor management and inline classifications without opening Configuration` in `backend/tests/ai-estimator-knowledge-routes.test.ts:229`, expecting HTTP 201 rather than the existing HTTP 403 for direct Procurement Main Basket creation. The same failure reproduces on original HEAD `999d9ce01f48778d5d49b2314828e9a57bb94429`; its behavior and assertion were preserved. Baseline evidence: `/private/tmp/lisno-vendor-classification-backend/baseline.json`.
- Both workspaces: `npm run typecheck` passed. Backend `npm run build` passed. Frontend `npm run build` passed, including the existing Vite warning for chunks above 500 kB. No dependency changes were made.
- Final `git diff --check` passed. `git status --short` contains only the prior In-house task and this task's intended source, tests, and documents. No lint was run because the repository has no lint script.
- The initial sandboxed backend run could not open disposable local listeners (`EPERM`); it was superseded by the successful local-listener-permitted run. No production database was contacted or transaction behavior weakened.
- Full frontend/backend suites and OCR tests were not run; checks were scoped to the changed contracts, consumers, and requested regressions. Earlier established `KnowledgeScreens` baseline failures were not rerun because this change does not alter its In-house behavior.

Reports and exact command logs are retained under `/private/tmp/lisno-vendor-resolution-final/`. The final backend report is `backend-tests-unrestricted.json`; frontend reports are `frontend-tests.json` and `frontend-retry.json`. Initial failed-environment logs remain clearly distinct. Build outputs are ignored `frontend/dist/` and `backend/dist/`; none were staged. There were no migrations, seeds, commits, pushes, deployments, external messages, or live record mutations.

Exact focused test commands (run in the indicated workspace):

`frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeVendorBlockers.test.tsx src/features/ai-estimator-knowledge/basketDeletionNavigation.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketDeletionReturn.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/procurement/VendorBasketAssignmentEditor.test.tsx src/features/procurement/VendorBasketResolution.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/VendorKpiWeb.test.tsx src/features/procurement/VendorDirectory.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.moves.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeRecommendationMoves.test.ts src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeInHouseComponents.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseComponentsTransfer.test.tsx src/features/ai-estimator-knowledge/KnowledgeSubBasketRequestPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx --reporter=json --outputFile=/private/tmp/lisno-vendor-resolution-final/frontend-tests.json
```

`frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/VendorDirectory.test.tsx --maxWorkers=1 --reporter=json --outputFile=/private/tmp/lisno-vendor-resolution-final/frontend-retry.json
```

`backend/`:

```sh
npm test -- tests/procurement-vendor-classification.replica-set.test.ts tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/route-operation-registry.test.ts tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts tests/super-admin-authorization.test.ts tests/api-docs.test.ts --reporter=json --outputFile=/private/tmp/lisno-vendor-resolution-final/backend-tests-unrestricted.json
```

# Inline Sub-Basket removal task plan

Date: 2026-09-23
Status: Specification and task plan approved; Mode A implementation, integrity review, and verification complete. Existing unrelated Mode-editor failures remain documented.

Approved specification: [Remove a draft Sub-Basket from the recommendation drawer](../specs/2026-09-23-inline-sub-basket-removal-design.md).

The specification's proposed-status text records its original creation stage. This plan records the user's subsequent approval without changing that file during the plan-only stage.

## Outcome and boundaries

Add the missing trash-icon Remove beside Edit name for `test-sub1` in both applicable group contexts. Reuse permanent Sub-Basket deletion with impact confirmation, add transactional Draft-only enforcement for inline callers, and preserve the open rule and existing Configuration behavior.

This plan does not authorize live catalog edits, seeds, migrations, dependencies, commits, pushes, or deployment. Verification uses synthetic frontend fixtures and isolated Mongo replica sets. Existing dirty basket, administration, dashboard, and authentication changes must be preserved. Prior test counts and known unrelated Mode-editor failures are background evidence, not current verification.

## Settled contract

### Additive deletion guard

Extend the existing parent-scoped Sub-Basket DELETE request with the optional literal flag:

```ts
readonly draftOnly?: true;
```

Inline requests always include `draftOnly: true` with existing `expectedVersion`, exact `confirmationName`, nonblank `reason`, and `impactToken`. Configuration requests continue omitting the flag. Responses, endpoints, permission operations, persisted models, and impact token format remain unchanged.

Requirements:

1. Runtime schema accepts literal true or omission; reject false and other values. Service input validation provides equivalent protection for direct callers.
2. Within the existing coordinated deletion transaction, validate the parent/group identity and version, then check all direct children, across every lifecycle state, when `draftOnly` is true. Any non-Draft child raises the existing `409 SUB_BASKET_FROZEN` error before deletion. An empty group is eligible.
3. Preserve exact-name/impact verification, parent dependency coordination, group CAS, cascade, reference cleanup, transactional audit, and rollback. Concurrent activation must serialize safely with the delete; transaction retries recompute eligibility and impact.
4. A newly loaded impact for an already frozen group still cannot authorize an inline deletion. Absence of the flag retains the established Configuration behavior.
5. Update strict route validation, backend/frontend request types, and OpenAPI together. No new route registry entry, permission expansion, or migration is needed.

### UI, confirmation, and draft flow

- Add a compact destructive-outline Remove with the existing trash icon beside Edit name in both selected-group headers. Use a contextual accessible name. Keep Add sub-item and child actions unchanged.
- Require read/lifecycle permission, complete all-status membership, matching stable IDs, unfrozen children, and an idle healthy catalog before enabling removal. Do not derive eligibility from item-type filters or labels.
- Block deletion when the source item belongs to the group; show an explanation and Configuration link when permitted. Verify that the membership source includes the current source item. If not, pass its authoritative parent metadata from the loaded workspace; never infer absence from a filtered list.
- Reuse/generalize `KnowledgeSubBasketDeleteDialog` rather than create a second destructive flow. Add an optional inline mode that sends the flag, uses Remove wording, provides draft-specific repair guidance, and supports a callback after confirmed deletion but before query refresh. Defaults retain Configuration wording and behavior.
- Bind the dialog to the selected group and parent IDs. Show fresh impact counts; retain exact-name confirmation and reason. Changed impact/name/version requires explicit review and confirmation again. Freeze or lost permission blocks submission; no automatic mutation retry.
- On confirmed success, retain the current rule in the local draft before catalog refresh. Mark all returned deleted child IDs unavailable in the builder's local creation/removal state and preserve the deleted group ID as an unavailable target. Use one group-level commit callback so an empty group's deletion also preserves a previously clean rule.
- Preserve the open drawer and all local fields, other rules, and the established source-section CAS/review behavior. Whole-group and Line item rules require explicit retargeting or removal before an enabled invalid rule can save.
- Retain success state before refreshing and retry reads only after refresh failure. Use the existing Sub-Basket deletion cache helper; audit stale-read cancellation, list/detail pruning, relationship contexts, source sections, and invalidated impact queries for inline use.
- Ensure the dialog does not unmount during its own committed cache prune before completion/recovery state is established. Keep the mutation lock until the success/failure state is safe and restore focus to a surviving selector or heading.

## Dependency-ordered tasks and ownership

Only one parent task is in progress at a time. In Mode A, the two T2 children below can run in parallel after T1 is complete. In Mode B, the primary agent performs all tasks sequentially. No agents start before the new execution choice.

| Task | Dependency | Owner and paths | Deliverable and acceptance |
| --- | --- | --- | --- |
| T0: Baseline and integration audit | Execution authorized | Primary, read-only inspection and ignored `/tmp` artifacts | Capture fresh dirty-path set, target snapshots and per-file diffs; understand existing edits. Confirm full membership/source availability, dialog success timing, draft preservation and relevant baseline tests. Spec AC 3–7. |
| T1: Shared contract | T0 | Primary: `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`, `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts`, their route/API/OpenAPI tests | Add literal flag and strict validation; document compatibility. Publish callback/type contract to both implementers before they start. Spec AC 3–5, 8. |
| T2a: Transactional enforcement | T1 | Backend implementer: `backend/src/services/ai-estimator-knowledge-reference.service.ts`, `backend/tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts` | Service request type and validation, same-transaction all-child Draft guard, rollback/compatibility/race tests. Do not edit routes, OpenAPI, frontend, or unrelated services. Spec AC 2–5, 8. |
| T2b: Drawer and confirmation | T1 | Frontend implementer: `KnowledgeBudgetAlterationBuilder.tsx` and `.test.tsx`, `KnowledgeSubBasketDialogs.tsx`, relevant dialog/management tests, scoped `knowledge-recommendations.css` only if needed | Both headers, source/freeze/permission gates, reused inline confirmation, single group-commit notification, accessible recovery/focus, draft preservation and interaction tests. No cache helper, API contract, backend, or workspace-editor edits. Spec AC 1–7, 8, 10. |
| T3: Integrate draft/cache behavior | T2a and T2b | Primary: `knowledgeMutationSync.ts` and `.test.ts`, `KnowledgeSectionEditor.tsx`, `KnowledgeItemWorkspacePage.tsx`, relevant workspace/catalog tests, shared files only after writers finish | Reconcile source metadata if needed, review cache helpers, clean/dirty source draft retention, section version review, deleted local bridges, failed refresh and unavailable target validation. Reuse working paths; modify only proven gaps. Spec AC 4–7. |
| T4: Integrity review and fixes | T3 | Mode A: read-only `integrity_reviewer`; Mode B: primary | Review integrated changes for cascade scope, lifecycle races, permissions, source protection, success timing, CAS, and stale caches. Primary assigns fixes with exclusive ownership, then verifies findings resolved. Spec AC 2–8. |
| T5: Final verification and handoff | T4 | Mode A: `verification_runner` for stable integrated checks; primary for rendered QA. Mode B: primary | Run focused regressions, typechecks/builds and diff hygiene; inspect desktop/mobile interactions and accessibility. Report exact results, baseline failures, limitations and artifact paths. Spec AC 1–10. |

Paths without a workspace prefix in T2b/T3 are under `frontend/src/features/ai-estimator-knowledge/`. Every implementer receives explicit ownership and notice that other people/agents are working in the same dirty tree. Never revert, overwrite, stage, reformat, or restore unrelated work. If a writer needs another owner's path, return the dependency to the primary instead of editing it.

Parallel work is limited to T2a and T2b. Primary may maintain the plan and prepare synthetic QA while those writers run. Cache/draft integration, integrity review, and final verification follow sequentially on the integrated result. If any custom role is unavailable, use an available independent agent with the same explicit read-only or write boundary, or perform the work inline and report that fact.

## Verification plan

Start with focused checks. Run broader existing regressions only for the affected contract/workflow. Capture any relevant existing failure names before changing their paths; compare final results against that baseline.

Backend, from `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts tests/ai-estimator-knowledge-sub-baskets.test.ts
npm test -- tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts
npm test -- tests/ai-estimator-knowledge-inline-item-mutations.replica-set.test.ts tests/ai-estimator-knowledge-related-items.replica-set.test.ts
npm run typecheck
npm run build
```

Required backend cases: draft group and empty group success; active/inactive/archived child rejection with a fresh preview; invalid flag; existing Configuration deletion compatibility; equal names under distinct parents; wrong parent/stale version/changed impact; audit rollback and denial; source/sibling/reference preservation; activation versus deletion and child/reference changes during confirmation. Extend the existing replica harness and deterministic race gates instead of testing transactions against standalone Mongo. Run authorization/route-registry suites only if their implementation or inventory changes.

Frontend, from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx
npm test -- src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts
npm test -- src/features/ai-estimator-knowledge/KnowledgeCatalogNotices.test.tsx src/features/ai-estimator-knowledge/KnowledgeDeletionRedirect.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx
npm run typecheck
npm run build
```

Include focused workspace/editor regression files if T3 changes those paths. Required frontend cases: both header actions; contextual accessible names; empty group; frozen/permission/loading/incomplete catalog; source membership; cancel; group/child removal success; explicit name/reason/impact confirmation; updated impact and freeze failure; preserved clean/dirty rules and source-section conflicts; unavailable target save blocking; removed created-item bridge; refresh-only retry without repeated DELETE; stale query suppression; unchanged Configuration flow.

Rendered QA uses synthetic fixtures at desktop 1440×1000 and mobile approximately 390×844:

- Verify pencil Edit name and trash Remove alignment beside `test-sub1`, with Add sub-item and child actions reachable.
- Open/cancel/confirm removal; inspect counts, exact-name/reason fields, loading, failure, conflict and frozen states.
- Exercise Whole Sub-Basket and Line item rules, empty group, source-group block, lost/frozen target, and post-success failed-refresh recovery.
- Confirm unsaved reason/action/trigger/enabled values and other rules survive; unavailable targets require repair and section version review remains explicit.
- Check keyboard access, nested dialog focus containment/return, announcements, mobile overflow, console/network errors, and axe results; inspect screenshots visually.
- Do not navigate or mutate the user's live browser/catalog. Close only task-owned servers and browser sessions.

From repository root:

```sh
git diff --check
git status --short
```

No repository lint script exists. Full unrelated suites, OCR, migrations, and live data actions are not part of this change. Store transient reports/screenshots/logs under `/tmp/lisno-inline-sub-basket-removal-20260923/`; move task-created CLI runtime files out of source and retain no generated artifacts in commits.

## Acceptance trace

| Approved spec AC | Evidence |
| --- | --- |
| 1 | Header/child action regression tests and desktop/mobile inspection |
| 2 | Cancel/confirm interactions, transactional cascade and sibling/reference preservation |
| 3 | Empty/all-status lifecycle checks, fresh frozen preview and activation races |
| 4 | Strict flag validation, identity/permission/version/impact regressions and asymmetric parents |
| 5 | Current-source membership block and existing Configuration compatibility |
| 6 | Clean/dirty rule retention, unavailable-target validation and section CAS/review tests |
| 7 | Successful-delete/failed-refresh one-request assertion, local bridge and stale-read tests |
| 8 | Service/route/API/OpenAPI/replica/frontend focused checks |
| 9 | Both typechecks/builds, scoped regression results and diff hygiene |
| 10 | Rendered interaction, focus/accessibility and responsive screenshot evidence |

## Handoff and current stage

Final reporting must state what changed, exact checks/results, unrun checks, remaining limitations, artifacts, and whether any pre-existing failures remain. Do not mark partially verified work complete. No live deletion, dependency addition, migration, seed, commit, push, or deployment occurs under this plan.

Only this task-plan file was created in the current stage. After plan approval, ask for the required A/B execution choice before starting implementation.

## Execution record

- T0 complete: fresh status, scoped dirty-file snapshots and per-target diffs captured under `/tmp/lisno-inline-sub-basket-removal-20260923/`. Frontend baseline 115/115. Mongo baseline required local-port sandbox escalation; test results recorded separately. Independent source audit confirms all-status `allItems` includes the current source; no source metadata extension needed.
- T1 complete: request contract is `draftOnly?: true`; strict route validation, OpenAPI, frontend API type and contract tests updated. Existing Configuration callers omit the flag. Shared dialog contract: optional synchronous `onCommitted(result)` called once after success state is set and before cache refresh; existing `onDeleted(name)` remains after successful refresh. Inline mode sends draftOnly and preserves Configuration defaults.
- T2 in progress: independent backend guard and frontend controls/dialog work may now proceed on disjoint paths.

- T2 complete: backend guard and frontend controls/dialog are integrated. Backend focused38/38; builder/Configuration140/140; frontend API12/12 and backend route/OpenAPI117/117. Mongo baseline28/28 passed after local-port escalation. No dependency/model/permission/route changes.
- T3 complete: independent membership audit confirmed source inclusion. Existing cache and section-version helpers support the flow without additional product edits. Added three workspace tests proving clean whole-group, dirty empty-group, and dirty Line item rules survive server reference cleanup/version advancement and block invalid save;3/3 passed. Screens baseline71 passed/13 known unrelated Mode-editor failures captured.
- T4 in progress: independent integrity review of the incremental baseline-relative diff. Final rendered QA and automated verification follow on the stable source.

- T4 complete: independent integrity reviewer found no actionable defects in the incremental delta; transactional freeze/impact/CAS/authorization, source protection, draft retention and cache recovery reviewed. No integration product changes beyond the assigned slices were needed.
- Rendered QA complete on final source: desktop/mobile header controls, whole-group and Line item removal, cancel/focus return, changed impact, successful-delete/failed-refresh retry with exactly one committed DELETE, empty/frozen/source-contained groups, unavailable-target save blocking, zero axe violations/no overflow in measured states. Evidence: `/tmp/lisno-inline-sub-basket-removal-20260923/browser-qa.md`. All screenshots inspected; task browsers/servers stopped and30 task CLI artifacts moved out of source.
- T5 in progress: frontend268passed/13exactbaseline failures, no new failure names. Backend first run175passed/3HTTP transport failures; affected files being rerun sequentially before final result.

- T5 complete:178unique backend tests passed;3initial HTTP transport failures passed on a sequential94/94 rerun of their two affected files without source changes. Frontend268passed/13exactbaseline failures, no new failure names. Combined459unique tests:446passed,13pre-existing failures. Both typechecks and builds passed. Existing Mongoose deprecation/Vite chunk warnings and unconfirmed HTTP-test flakiness documented.
- Final evidence: `/tmp/lisno-inline-sub-basket-removal-20260923/final-verification/verification-report.md`, `browser-qa.md`, `final-scope.diff`, and `changed-files.txt`. Twelve scoped code/test files plus this plan were changed during implementation. No live catalog mutation, dependency addition, seed, migration, staging, commit, push, or deployment. All task runtime artifacts are outside source; unrelated work preserved.

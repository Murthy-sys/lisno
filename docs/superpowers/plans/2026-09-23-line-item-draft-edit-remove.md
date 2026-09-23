# Line item draft editing and removal task plan

Date: 2026-09-23
Status: Specification and task plan approved; Mode A implementation and verification complete. Existing unrelated Mode test failures remain documented.

Approved specification: [Draft editing from Line item recommendation rules](../specs/2026-09-23-line-item-draft-edit-remove-design.md).

The specification's original proposed-status text records its creation stage. This plan records the user's subsequent approval without changing the specification during the plan-only stage.

## Outcome and boundaries

Expose Sub-Basket rename and selected-item edit/removal in the Line item scope-rule panel. Preserve existing Whole Sub-Basket behavior, draft freeze checks, stable identities, open recommendation fields, and the completed creation/Configuration management work. Add only the backend guard missing for direct-parent temporary items and narrow duplicate-name handling for rename.

The specification, task-plan, and execution-mode gates are complete. No live catalog edits, dependencies, migrations, seeds, staging, commits, pushes, or deployment are authorized by this plan. Mutation verification uses synthetic fixtures and isolated Mongo replica sets.

The shared worktree remains substantially dirty. Earlier basket changes, draft-group editing, user administration, and dashboard work are existing work to preserve. Historical passing tests and the earlier 13 Mode-editor baseline failures are evidence to recheck, not substitutes for verification of this follow-up.

## Settled contract

### Existing grouped mutations

Preserve these requests unchanged:

- Sub-Basket rename: existing parent-scoped PATCH with `{ expectedVersion, name }`, omitting `managementContext` so inline draft-only enforcement applies.
- Grouped item rename: existing item PATCH with `{ expectedVersion, name, draftSubBasketGuard: { subBasketId, expectedVersion } }`.
- Grouped item removal: existing item DELETE with `{ expectedVersion, reason, draftSubBasketGuard: { subBasketId, expectedVersion } }`.

The two expected versions belong to different entities: outer version is the item; nested version is its Sub-Basket. The whole direct-child catalog determines group freeze eligibility, independently of recommendation target kind or selected item type. Any non-Draft sibling freezes inline editing/removal.

### Additive groupless guard

Extend item PATCH and DELETE inputs with:

```ts
interface KnowledgeDraftItemGuard {
  readonly basketId: string;
  readonly subBasketId: null;
}

// Add to the existing request interfaces:
readonly draftItemGuard?: KnowledgeDraftItemGuard;
```

Example rename:

```json
{
  "expectedVersion": 3,
  "name": "False Ceiling Lights",
  "draftItemGuard": {
    "basketId": "basket-synthetic",
    "subBasketId": null
  }
}
```

The guard explicitly binds a direct-parent item to its displayed Main Basket and absence of a group. It does not require or advance a Main Basket version; unrelated siblings must not freeze a groupless item. The frontend exposes this path for selected groupless temporary items.

Runtime and service rules:

1. `draftItemGuard` and `draftSubBasketGuard` are mutually exclusive. Reject both together before any write, including direct service calls that bypass route parsing.
2. Strictly validate the nested shape, stable parent ID, literal null Sub-Basket, and existing outer item version. A guard alone is not an item field change; update-schema nonempty-change validation must exclude both guards and `expectedVersion`.
3. In the same transaction as rename/removal, authorize the actor, load the item, compare its expected version, verify parent identity and no group, then require `status === "draft"`.
4. Return `409 ITEM_PARENT_MISMATCH` for a mismatched Main Basket or grouped target and `409 ITEM_FROZEN` for a matching current-version target outside Draft. Missing records retain `NOT_FOUND`; stale versions retain `VERSION_CONFLICT`. Preserve existing unguarded and grouped error behavior.
5. Retain version predicates on the actual update/delete. A concurrent activation or other lifecycle write must either serialize before the mutation and reject it, or observe the completed mutation's version change. Never weaken transaction semantics for tests.
6. No guard means the existing main-workspace behavior remains unchanged. Inline callers always send the appropriate guard.

Preserve response shapes, routes, route-operation permissions, audit actions, and persisted models. Add the optional guard and mutual-exclusion constraint to frontend/API types, runtime validation, service interfaces, and OpenAPI. No new route operation or migration is needed.

### Rename errors and audit

Reuse/generalize the existing narrow normalized-name duplicate mapper for item rename. Only Mongo duplicate errors identifying the Main Basket/name index become `409 DUPLICATE_IDENTITY` with an actionable name error. Unknown database failures retain their actual error handling. Preserve transaction rollback, including the group aggregate increment and audit write. Keep stable actor/item IDs and before/after versions; include old/new name when a name changes.

### UI and state behavior

- Keep selectors and existing creation flows. Add group-name editing beside the selected group context in Line item mode, including empty groups.
- Show a compact selected-item area with name, type, lifecycle, **Edit item name**, and **Remove item** after a valid selection. These actions operate on only that item, never its siblings.
- Resolve group membership from the selected item's authoritative IDs even when the user came through All Sub-Baskets. A blank filter does not imply a groupless item. Mismatched row/item parent IDs block mutation pending explicit repair or authoritative refresh.
- Make the top-level action visibly **Remove rule**. Catalog removal continues to require a separate destructive confirmation.
- Derive grouped eligibility from complete all-status sibling data in both modes. For direct-parent temporary targets, derive eligibility from the authoritative selected item and item version without requiring a Sub-Basket record.
- Preserve grouped and groupless edit snapshots separately, preferably a discriminated union, so a null group cannot accidentally take an unguarded mutation path.
- Snapshot versions and identities when opening the dialog. Keep the user's entered name on recoverable error and explicit refresh; show the refreshed current name/version for review, and require a separate save click. Close or block if identity, membership, or freeze state becomes invalid.
- After successful rename, keep IDs and all rule fields intact. After removal, keep the rule and its unavailable target until the user repairs/removes it. Do not autosave, retarget, convert kind, or clear unrelated fields.
- Preserve Whole Sub-Basket last-child messaging and behavior. Line item removal explains that its selected target will become unavailable instead of incorrectly promising that a Whole Sub-Basket remains selected.
- Record confirmed mutations locally before refresh. Retry after refresh failure performs reads only. Suppress late results that could revive removed rows.

## Dependency order and ownership

Only one parent task is in progress at a time. Once implementation is authorized, Mode A can run T2's non-overlapping children concurrently; Mode B performs the same work inline. Do not assign overlapping dirty paths to multiple writers.

| Task | Depends on | Owner | Parallel work |
| --- | --- | --- | --- |
| T0: Capture baseline and failing cases | Remaining workflow gates | Primary | Independent read-only audits if useful in Mode A |
| T1: Confirm contract and shared adapters | T0 | Primary | Sequential before writers |
| T2: Implement | T1 | Primary coordinates backend/UI lanes | T2a and T2b have distinct ownership |
| T2a: Backend guard and rename errors | T1 | Backend owner | With T2b |
| T2b: Rule-panel controls and recovery | T1 | Frontend owner | With T2a |
| T3: Integrate draft/cache/save behavior | Both T2 lanes stopped | Primary | Sequential shared-file integration |
| T4: Integrity review and remediation | T3 | Reviewer in Mode A; primary in Mode B | Review stable integrated work |
| T5: Final verification and handoff | T4 fixes finished | Verification runner in Mode A; primary in Mode B | Independent checks on stable source may run together |

File boundaries:

- **Primary:** plan/progress; `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`, route/docs tests; frontend `knowledgeApi.ts` and its tests, any required shared type changes, `knowledgeMutationSync.ts` and its tests. During T3 only, narrowly necessary workspace/section validation integration and associated tests. Do not alter route registry counts for an additive field-only contract.
- **Backend owner:** `backend/src/services/ai-estimator-knowledge-item.service.ts`; focused item-service tests, `ai-estimator-knowledge-sub-baskets.test.ts`, and a narrowly named `ai-estimator-knowledge-inline-item-mutations.replica-set.test.ts` if new race/rollback coverage warrants a separate file. Existing reference/cascade implementations are dependencies to preserve; changes there require coordination with the primary.
- **Frontend owner:** `KnowledgeBudgetAlterationBuilder.tsx`, `KnowledgeDraftSubBasketDialogs.tsx`, `KnowledgeBudgetAlterationBuilder.test.tsx`, a focused dialog test if needed, and only necessary additions in `knowledge-recommendations.css`. Do not edit API/cache/workspace files owned by the primary or the Configuration basket manager.
- **Review and verification:** read-only product-source ownership, with logs/screenshots only in ignored or temporary locations. Review is followed by final verification after any fixes.

Every writer receives the baseline diff, approved contract, explicit ownership, and the instruction that others share the worktree: do not revert or overwrite their changes; coordinate any need to cross a boundary.

## T0: Baseline and reproduction

1. Capture current `git status --short`, per-target diffs, and copies of every assigned dirty/untracked target under `/tmp/lisno-line-item-draft-edit-20260923/`. Distinguish completed earlier basket work from this follow-up.
2. Reproduce the absent Line item actions with a selected draft group and child. Include the user's rename example, both item types, empty selected group, All Sub-Baskets selection, and direct-parent temporary creation/selection.
3. Confirm `KnowledgeItemWorkspacePage` supplies all-status relationship items, not just active/draft selectable items, and that pagination failures cannot appear complete.
4. Record current focused test results. If `KnowledgeScreens.test.tsx` still has the known 13 Mode-editor failures, compare failure names against the initial fixture/baseline evidence. Do not silently fix unrelated assertions or accept new failures as baseline.

Acceptance: spec AC1, AC2, AC4, AC5. Exit with scoped reproduction evidence and a protected worktree baseline.

## T1: Shared contract and adapters

1. Implement the additive guard declarations, strict route schemas, request serialization, OpenAPI mutual exclusion, and guard-only update rejection against the contract above.
2. Agree discriminated frontend mutation snapshots and callback compatibility before the UI lane starts. Existing shared dialog callers must continue to work.
3. Confirm shared refresh helpers can refresh authoritative item state for groupless targets without waiting for a nonexistent group version. Establish a saved-versus-refresh-only result path for each operation.
4. Add focused route/client tests for exact guard payloads, invalid combinations, omitted-guard compatibility, and permissions. Inventory/authorization counts stay unchanged.

Acceptance: AC2, AC4, AC5, AC8, AC9. Contract changes discovered later are broadcast; material spec changes require the specified approval boundary.

## T2a: Backend implementation

1. Add direct-parent draft-only validation in the item mutation transaction, preserving the ordinary main-workspace and existing grouped branches. Enforce mutually exclusive guards in service calls as well as HTTP validation.
2. Keep item version CAS and existing dependency/cascade coordination. Do not add a parent-wide freeze rule for direct-parent items.
3. Generalize the existing Main Basket/name duplicate mapper for item updates, without swallowing audit, connectivity, or unrelated duplicate failures. Preserve atomic rollback of child/group/audit changes.
4. Maintain existing audit events and enrich name changes with before/after name evidence without altering unrelated mutation fields.
5. Cover successful grouped and groupless rename/removal; wrong parent/group; guard-only input; both guards; stale versions; frozen active/inactive/archived statuses; identical names in different parents; same-parent duplicate rename; and unguarded main-workspace compatibility.
6. Use real replica-set tests for concurrent activation versus guarded rename/removal and audit-failure rollback. Verify only valid serialized outcomes and no partial child/section/reference deletion. Use asymmetric fixtures and no application database.

Acceptance: AC2, AC4, AC5, AC6, AC8, AC9, AC10.

## T2b: Frontend controls and dialogs

1. Decouple authoritative group-member collection and eligibility from Whole Sub-Basket rendering. Preserve the existing group child list and its behavior.
2. Add the selected-group name action and selected-item action area in Line item mode. New rows wait for complete catalog/version confirmation; same-name groups in other parents must not be reused.
3. Support grouped versus groupless snapshots and guarded requests with explicit discriminants. Do not fall back to unguarded mutation when a group or version is missing.
4. Generalize shared rename/removal dialog copy for selected Line item targets while retaining Whole Sub-Basket last-child warnings. Keep visible rule removal distinct.
5. Preserve entered rename text during errors and refreshed-version review. Keep the row's unrelated draft fields, selected IDs, and other rules through all catalog callbacks.
6. Add loading/frozen/permission/error/unavailable states, focus return, and result announcements. Keep keyboard actions reachable at mobile width. No broad styling or new icon/dependency work.
7. Test selected grouped catalog/temporary items, groupless temporary items, empty group rename, newly created item actions, incomplete catalog, sibling freeze, wrong-parent identity, permissions, cancellation, successful removal, conflict refresh, and saved-success/failed-refresh recovery.

Acceptance: AC1 through AC9 and AC11.

## T3: Draft and cache integration

1. Wait for both writers and inspect diffs against their exact starting snapshots. Reconcile request shapes and UI messages.
2. Reuse/generalize shared mutation sync helpers for list/detail/group/context/incoming-reference/deletion-preview invalidation. Cancel stale item reads and clear local bridges on deletion.
3. Verify existing section validation marks the removed selected item unavailable and blocks active-rule save without destroying the draft. Add a narrowly scoped change only if the current behavior fails this case.
4. Exercise deleting a target whose saved references include the currently open source section. Respect the backend's advanced section/aggregate versions; preserve local unsaved changes and require explicit conflict repair. Never bypass CAS to make saving succeed.
5. Verify rename updates selected group/item names, rule summary, and Configuration while keeping stable IDs and the existing target kind. Avoid unrelated workspace refactors.

Acceptance: AC3, AC5, AC6, AC7, AC8, AC9.

## T4: Integrity review

Review all changed contracts and the integrated workflow for guard bypass, archived sibling omission, parent-ID confusion, incomplete catalog inference, double submission, stale confirmation, overwritten entered names, deletion scope, stale source-section saves, and lost draft fields. Confirm main-workspace management remains compatible and Whole Sub-Basket behavior is unchanged.

In Mode A use `integrity_reviewer` after writers stop; in Mode B perform equivalent review inline. Resolve material findings before T5 and rerun relevant checks after each fix.

Acceptance: AC4 through AC10. Report any remaining limitation explicitly rather than treating earlier test counts as proof.

## T5: Verification and handoff

Run focused checks first, then typechecks/builds once source is stable. Repeat only for relevant changes/failures. Commands are run from the named workspace; add the new focused file only if it is created during T2a.

Backend:

```sh
npm test -- tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-sub-baskets.test.ts tests/ai-estimator-knowledge-related-items.replica-set.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm test -- tests/ai-estimator-knowledge-inline-item-mutations.replica-set.test.ts
npm test -- tests/ai-estimator-knowledge-routes.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

Frontend:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts
npm test -- src/features/ai-estimator-knowledge/KnowledgeCatalogNotices.test.tsx src/features/ai-estimator-knowledge/KnowledgeDeletionRedirect.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx
npm run typecheck
npm run build
```

Include new dialog tests and relevant workspace tests when those paths change. Broaden to shared cascade/context tests only if integration changes those behaviors or review identifies unresolved risk. No lint script exists. OCR, migrations, and unrelated full suites are outside the affected scope unless new evidence establishes a dependency.

Rendered synthetic QA at desktop and approximately 390px mobile:

- Enter the shown Line item panel, select a draft group/item, rename `Functional lights Supply` to `False Ceiling Lights`, and verify unchanged target IDs and unsaved reason/action/trigger/enabled state.
- Create/select a new related item, then rename and remove it; test direct-parent temporary content as well as grouped content.
- Confirm item removal and cancellation, unavailable selected target, blocked invalid save, separate Remove rule action, and preserved Whole Sub-Basket behavior.
- Cover frozen sibling/target, incomplete catalog, duplicate-name error, version conflict, and saved-success/failed-refresh retry. Assert recovery does not repeat mutation calls.
- Check focus trapping/return, accessible names, announcements, overflow, console/network errors, and rendered screenshots. Use the browser/QA skills when this stage begins. Never mutate the user's original catalog.

From repository root:

```sh
git diff --check
git status --short
```

In Mode A a `verification_runner` verifies the final integrated worktree after integrity fixes; primary owns rendered QA and the final reconciliation. Store logs/screenshots under `/tmp/lisno-line-item-draft-edit-20260923/`; remove task-created runtime artifacts from the source tree and close only task-owned servers/browser sessions.

## Acceptance trace

| Spec AC | Required evidence |
| --- | --- |
| 1 | Group rename from Line item panel using user's example, stable ID, draft preserved |
| 2 | Both grouped item types, newly created items, direct-parent temporary rename/removal |
| 3 | Updated names across selector, summary, detail/Configuration, same identities |
| 4 | Full sibling lifecycle freeze; direct-parent draft guard; activation race tests |
| 5 | Complete catalog, two parents with same group name, mismatched/stale identity rejection |
| 6 | Cancel/confirm cascade, unavailable target, blocked invalid save, no silent replacement |
| 7 | Distinct removal labels and retained fields/other rules through source-version changes |
| 8 | Duplicate/auth/missing/version/frozen errors and refresh-only retry without repeated writes |
| 9 | Existing Whole Sub-Basket, creation, and Configuration manager regressions |
| 10 | Focused tests, replica races, typechecks/builds, baseline-failure comparison, diff hygiene |
| 11 | Desktop/mobile screenshots, keyboard/focus, accessible states and announcements |

Final handoff reports the outcome, changed files and principal decisions, exact checks/results and unrun checks, artifact paths, any baseline failures or remaining risks, and confirmation that no live data, migrations, dependencies, commits, or deployments were changed.

## Execution record

- T0 complete: 76 initial dirty paths and full snapshots captured under `/tmp/lisno-line-item-draft-edit-20260923/baseline/`. Independent backend/frontend audits confirmed the plan's guards and the missing Line item branch. Current frontend baseline: builder 65/65; Screens 68 passed/13 existing Mode-editor failures. Source inspection confirms complete current+archived relationship catalog; no read-shape change is needed.
- T1 complete: guard shape and error vocabulary remain as approved. Primary added shared frontend API types, strict route validation, and OpenAPI declarations. Grouped/direct item dialog snapshots are discriminated; existing grouped calls and main-workspace callers remain compatible. Shared adapter tests follow in the primary-owned lane.
- T2 complete: backend guarded service implementation and replica tests passed; frontend controls, shared dialogs and recovery implemented. Final builder suite: 100/100. No contract deviations or dependencies.
- T3 complete: stale query cancellation/removal cache pruning, original recommendation section CAS, explicit reviewed-version acknowledgment and clean saved-rule preservation implemented. Confirmed removal republishes the unchanged affected rule draft before reference-cleanup refresh. Added explicit Line item availability validation and removed the deleted temporary item's Configuration link. Stable IDs, separate rule save, legacy Whole Sub-Basket behavior and prior work retained.
- T4 complete: spawning the preferred integrity-reviewer agent was rejected by the runtime thread limit. The available independent verification agent performed the read-only integrated review; backend/frontend owners also audited relevant contracts. The clean-source deletion P2 was reproduced, fixed and regression-tested. Browser discovery of missing Line item validation and a stale Configuration link was fixed and independently reviewed. No outstanding material findings.
- T5 complete: final integrated backend 458/458 passed; frontend 341 passed and exactly the same 13 baseline Mode-editor failures (no new failing names), 812 tests total. Both typechecks and builds passed. Existing Mongoose deprecation and Vite large-chunk warnings remain. Full unrelated/OCR suites and lint were not run (no lint script).
- Rendered QA complete: synthetic desktop1440×1000 and mobile390×844, group/item rename, duplicate/version recovery, cancel/confirm removal, retained unavailable target/blocked save, direct temporary edits beside unrelated active siblings, frozen states, keyboard/focus, no document overflow and zero axe violations in measured final states. Scoped dialog-heading contrast fix verified. All screenshots inspected. Final browser pass ran with watching disabled to isolate unrelated login HMR.
- Artifacts: `/tmp/lisno-line-item-draft-edit-20260923/final-verification/verification-report.md` records exact commands/results; `browser-qa.md` records rendered conditions, scenarios and limitations. Task browser and both task dev servers stopped; nine task-created CLI runtime files moved out of the source tree. Existing artifacts and unrelated concurrent administration/dashboard/login changes preserved.
- No live catalog mutation, seed, migration, dependency addition, staging, commit, push or deployment. Production builds are ignored verification artifacts.

- Visual follow-up requested after completion: Line item Sub-Basket now uses pencil + Edit name; selected item uses compact pencil Edit and outlined trash Remove, matching the existing Whole Sub-Basket reference. Existing accessible names and draft/freeze guards retained. Focused builder 100/100, frontend typecheck/build and diff hygiene passed; desktop/mobile screenshots inspected, zero axe violations and no overflow. Evidence: `/tmp/lisno-draft-action-styling-20260923/verification.md`. Read-only name investigation found no ordinary creation default of Plain False Ceiling; card uses its saved name, and exact record/replacement name remain unresolved. No live data edits.

# Recommendation temporary catalog additions implementation plan

## Source of truth

- Approved specification: `docs/superpowers/specs/2026-09-19-recommendation-temporary-catalog-additions-design.md`
- This plan implements the approved Configuration and knowledge-context behavior only. It does not add automatic Estimate mutation, an estimator-facing acceptance screen, or new `estimator_sales` permissions.
- Baseline worktree evidence for this change is the untracked approved specification. Writers must re-check `git status --short` and inspect any relevant pre-existing diff before editing because the shared worktree may change between approval and execution.

## Delivery order

The contract and compatibility rules are the first dependency. Backend persistence/reference work and frontend interaction work may proceed in parallel only after that contract is fixed. Integrated integrity review and verification run after all writers finish.

## Task 1 — Freeze the recommendation target contract

**Owner:** primary agent in Mode B; backend implementer with primary-agent review in Mode A.

**Affected areas**

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeBudgetAlterations.ts`
- contract/validation tests in both workspaces

**Work**

1. Model `KnowledgeBudgetAlteration` as the approved discriminated union:
   - absent or `main_line` `targetKind` means the legacy Main-Line shape;
   - `sub_basket` requires a Sub-Basket ID and null Main-Line/type fields.
2. Add one normalization/read helper used consistently by validation, presentation, duplicate detection, and context resolution so legacy defaulting is not reimplemented differently across call sites.
3. Update exact-key and field validation, including target-kind-specific required/null fields, duplicate keys, the 100-row limit, and existing action/trigger/reason rules.
4. Update OpenAPI to document legacy-compatible reads and explicit new writes.
5. Keep existing field names and legacy rows intact; do not run a migration or rewrite stored sections.

**Acceptance coverage:** AC1, AC6, AC8.

**Focused verification**

- Backend validation tests cover every valid target kind and malformed cross-shape combination.
- Frontend validation tests prove a legacy row defaults to Main Line and a Sub-Basket row cannot require a Main-Line ID.
- OpenAPI tests confirm both shapes are represented.

## Task 2 — Enforce backend references and lineage for both target kinds

**Owner:** backend implementer in Mode A; primary agent in Mode B.

**Depends on:** Task 1.

**Affected areas**

- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/services/ai-estimator-knowledge-context.service.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts` only if an existing reference/deletion helper must be extended
- `backend/src/models/AiEstimatorKnowledgeMainLine.ts` only if a non-persisted DTO projection cannot express completion state cleanly; no schema write is expected
- relevant backend unit and replica-set tests

**Work**

1. Branch recommendation reference validation by normalized target kind.
2. Preserve current Main-Line checks: active parent Basket, matching Sub-Basket/type, draft/active target, self-reference rejection, and dependency coordination.
3. For a Sub-Basket target, verify:
   - the Sub-Basket belongs to the selected active Main Basket;
   - it has at least one draft/active Main Line;
   - it does not contain the source Main Line;
   - dependency coordination protects it and its parent from concurrent deletion or incompatible lifecycle changes.
4. Extend incoming-reference and deletion-impact scans to recognize Sub-Basket targets without manufacturing Main-Line references.
5. Project `completionRequired: true` for temporary Main Lines as derived response data. Keep it separate from status, revision completeness, and stored schema.
6. Extend context projection:
   - Main Line target: identity, status, type, completion requirement;
   - Sub-Basket target: identity, available-child count, temporary-child count, and completion requirement.
7. Keep the context path read-only and avoid logging free-text reasons or catalog names in operational diagnostics.

**Acceptance coverage:** AC1, AC3, AC6, AC7, AC8, AC10.

**Focused verification**

- Service tests cover valid legacy/Main-Line/Sub-Basket targets and field-specific failures.
- Replica-set tests cover target deletion/lifecycle races and stable reference validation.
- Context tests assert no writes/audits occur during reads and verify asymmetric Sub-Baskets with unequal child counts.
- Temporary item tests assert `completionRequired` does not clear when Overview/Mode/Quality are configured or when lifecycle status changes.

## Task 3 — Support recoverable hierarchy creation from Recommendations

**Owner:** frontend implementer in Mode A; primary agent in Mode B.

**Depends on:** Task 1. Can run in parallel with Task 2 after the contract is frozen.

**Affected areas**

- `frontend/src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.tsx`
- its focused tests and reconciliation helpers
- `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQueryKeys.ts`
- a focused Sub-Basket creation/reconciliation component or helper if needed
- existing Main Basket/Sub-Basket master APIs; no new endpoint is expected unless implementation evidence shows the current operations cannot safely reconcile a lost response

**Work**

1. Permit authorized temporary-item creation opened from a recommendation to create and auto-select a missing Main Basket.
2. Preserve the pending recommendation, item name, Sub-Basket name, and selected type during Basket creation.
3. Add create/select behavior for a missing Sub-Basket using authoritative returned IDs.
4. For a new whole-Sub-Basket target, support:
   - selecting an existing non-empty Sub-Basket; or
   - creating a Sub-Basket and a generic temporary child such as **Lights** before the target becomes saveable.
5. Reconcile duplicate names and lost responses by normalized name plus parent ID before retry. Require explicit reuse of an exact active match.
6. Treat a successful parent create followed by a child failure as a recoverable partial success: retain and select the created parent, preserve entered values, and never fabricate the missing ID.
7. Invalidate/update Basket, Sub-Basket, Main-Line, item-list, deletion-impact, and incoming-reference queries after each successful mutation.
8. Preserve single-submit locking, focus return, status announcements, cancellation semantics, and responsive layout.

**Acceptance coverage:** AC2, AC5, AC11.

**Focused verification**

- Component tests cover zero-Basket state, existing and new parents, duplicate reconciliation, lost-response recovery, partial success, cancellation, permission-hidden actions, keyboard flow, and retained form state.
- API/helper tests assert exact IDs and query invalidations; no generated client-side target ID enters a rule.

## Task 4 — Add Line item versus Whole Sub-Basket authoring

**Owner:** frontend implementer in Mode A; primary agent in Mode B.

**Depends on:** Tasks 1 and 3. Can integrate against mocked Task 2 responses once Task 1 is stable.

**Affected areas**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeRecommendationPresentation.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeSavedSummary.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeSectionValidation.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledge-recommendations.css`
- related builder, screen, presentation, pending-change, summary, and validation tests

**Work**

1. Add the **Addition type** choice with **Line item** and **Whole Sub-Basket**.
2. Normalize legacy rows to Line item without mutating them merely by viewing.
3. Show target-kind-appropriate selectors and creation actions.
4. Confirm before clearing an incompatible unsaved target when the author changes kind.
5. For a whole Sub-Basket, save the exact approved shape and block an empty/unavailable/self-containing target based on frontend evidence while relying on backend validation as authority.
6. Display target kind, hierarchy names, action/requirement, status, and unresolved temporary state in:
   - the editable recommendation table;
   - read-only history;
   - pending-change cards;
   - saved summaries.
7. Use `[trigger, targetKind, target ID]` for duplicate presentation and emit an overlap warning when a whole Sub-Basket addition and a contained Main-Line addition coexist.
8. Preserve all four recommendation groups, existing rule actions, unsaved state, validation focus, read-only behavior, and responsive/accessibility behavior.

**Acceptance coverage:** AC1, AC4, AC6, AC8, AC9, AC11.

**Focused verification**

- Interaction tests create/edit/save/reopen both target kinds in mandatory, probable, exclusion, and other groups.
- Tests cover kind switching confirmation, overlap warning, legacy rows, invalid targets, read-only history, responsive labels, focus management, and accessible names/statuses.

## Task 5 — Surface temporary completion in Configuration

**Owner:** frontend implementer in Mode A; primary agent in Mode B.

**Depends on:** Task 2 response contract. Can be completed in the same frontend slice as Task 4 without assigning overlapping files to another writer.

**Affected areas**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.ts` if required by the display projection
- existing Configuration screen/workspace tests and CSS

**Work**

1. Render **Temporary item · Must be completed** for temporary Main Lines in both index and workspace.
2. Keep draft/active/inactive/archived status visually and semantically separate from completion requirement.
3. Preserve incoming recommendation references so the unresolved item shows where it is used.
4. Ensure filters, accessible row names, empty states, mobile layout, and workspace navigation still work with the additional state.

**Acceptance coverage:** AC3, AC9.

**Focused verification**

- Screen tests cover referenced/unreferenced temporary items, all lifecycle statuses, accessible labels, and narrow/wide layouts.

## Task 6 — Reconcile cross-layer behavior and documentation

**Owner:** primary agent.

**Depends on:** Tasks 2–5.

**Affected areas**

- backend/frontend contract agreement
- OpenAPI and authorization inventories
- current spec/plan only if implementation evidence requires a non-material clarification; material scope changes return to approval

**Work**

1. Inspect the integrated diff and confirm every frontend payload is accepted by runtime validation and OpenAPI.
2. Confirm API route-operation authorization remains synchronized and no new estimator permission was introduced.
3. Confirm all query invalidations cover newly created and referenced hierarchy records.
4. Confirm completion is derived, target names remain presentation only, and all joins use stable IDs.
5. Confirm no Estimate mutation, migration, seed, deployment, commit, or production action was added.

**Acceptance coverage:** all criteria, with emphasis on AC6, AC9, AC10, and AC11.

## Task 7 — Integrity review

**Owner:** `integrity_reviewer` in Mode A; primary agent performs the equivalent sequential review in Mode B.

**Depends on:** Task 6.

**Review checklist**

- Backward compatibility of absent `targetKind`.
- Exact union validation and OpenAPI parity.
- Authorization and capability visibility.
- Stable-ID lineage; no label joins or client-generated persisted target IDs.
- Parent/child reference races and deletion impact.
- Partial-create recovery, idempotency, query freshness, and stale section CAS.
- No accidental temporary-to-catalog conversion or false completion.
- No automatic Estimate side effects.

Confirmed findings are fixed before final verification.

## Task 8 — Final verification

**Owner:** `verification_runner` in Mode A; primary agent performs the equivalent sequential verification in Mode B.

**Depends on:** Task 7 and all confirmed fixes.

**Backend checks**

1. Run focused validation, service, route, context, related-item, and replica-set tests changed by Tasks 1–2.
2. Run:
   - `cd backend && npm run typecheck`
   - `cd backend && npm test`
   - `cd backend && npm run build`

**Frontend checks**

1. Run focused tests for target parsing/validation, the rule builder, creation/reconciliation, summaries, pending changes, index, and workspace.
2. Run:
   - `cd frontend && npm run typecheck`
   - `cd frontend && npm test`
   - `cd frontend && npm run build`
3. Run rendered interaction/accessibility QA for:
   - legacy Line-item rule;
   - new temporary Line item with new Main Basket;
   - existing whole Sub-Basket;
   - new Sub-Basket plus **Lights** placeholder;
   - duplicate/lost-response/permission/error states;
   - Configuration index/workspace completion badges;
   - mobile and desktop widths.

**Repository checks**

- `git diff --check`
- `git status --short`
- Inspect final scoped diff and report unrelated pre-existing changes separately.
- Do not claim lint passed because the repository has no lint script.

## Parallel execution map

After Task 1 fixes the union contract:

- **Backend lane:** Task 2.
- **Frontend lane:** Tasks 3–5, owned by one frontend writer to avoid overlap across the shared recommendation components.
- **Primary integration lane:** monitor contract adherence and begin Task 6 only after both lanes finish.

Tasks 7 and 8 are sequential on the fully integrated worktree. Tests run by writers are provisional; only Task 8 results count as final verification.

## Completion evidence

The handoff must report:

- behavior delivered against all twelve acceptance criteria;
- principal contract and compatibility decisions;
- exact affected files;
- exact focused/full checks and results;
- any unrun checks and remaining risks;
- confirmation that no migration, Estimate mutation, deployment, commit, push, seed, or production action occurred.

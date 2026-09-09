# Related item dropdown and starter catalog — task plan

## Source of truth and status
- Approved specification: [Related item dropdown and interior-design starter catalog](../specs/2026-09-09-related-item-dropdown-catalog-design.md).
- Specification and task plan approved; Mode A selected. Tasks 1–6 are complete. Integrated integrity review, automated verification, and scoped desktop/mobile browser checks passed, subject to the explicit verification limits below.
- At plan creation the only dirty path is the untracked approved specification. Recheck status and target diffs before any writer starts. Preserve unrelated changes.
- Acceptance criteria below refer to AC1–AC6 in the approved specification. The twelve starter names and their proposed classification are fixed by that specification.

## Confirmed implementation constraints
- Reuse the existing authenticated item creation API and persisted rule IDs. No endpoint, schema, migration, permission grant, or live seed is proposed.
- `AiEstimatorKnowledgeMainLine.ts` has a unique `(basketId, nameNormalized)` index for draft, active, and inactive records. Its scope is broader than suggestion matching, which also considers sub-basket/type. Preserve this index. A same-name item in another sub-basket/type must produce a conflict or require a different name; it must never be silently reused. Existing distinct IDs, including same names across different baskets, remain distinct.
- The shared creation dialog currently waits for invalidations before invoking `onCreated(id)`. Related-item mode needs the authoritative returned detail to remain available and selectable while refresh is delayed or fails, and must not misreport successful creation as a failed POST.
- Keep regular catalog creation, temporary creation, and related-item dialog wording compatible with their callers. Scope new reconciliation UX to this related-item workflow unless a shared fix is necessary to maintain the same contract.
- Section save/reload is separate from item creation. A successful POST creates a reusable draft catalog item; an unsaved/cancelled rule does not delete it.

## Ownership boundaries
All paths below are relative to `frontend/src/features/ai-estimator-knowledge/` unless prefixed otherwise.

| Owner/slice | Owned files | Boundary |
| --- | --- | --- |
| Primary integrator | This plan; `KnowledgeBudgetAlterationBuilder.tsx`, its test, scoped `ai-estimator-knowledge.css`; necessary `KnowledgeSectionEditor.tsx` / `KnowledgeItemWorkspacePage.tsx` integration and their focused tests | Owns rule state, permissions passed to UI, cross-slice contracts, final integration and product interpretation. |
| Starter-content owner | New `knowledgeRelatedItemSuggestions.ts` and `.test.ts` | Owns only immutable starter data and pure eligibility/matching helpers. No catalog writes or component edits. |
| Creation-dialog owner | `CreateKnowledgeItemDialog.tsx`, its test; new related-item creation/reconciliation helper and test if useful | Owns prefill/wording, pending/error/reconciliation state, authoritative creation-result delivery. Must agree on callback/cache contract before edits. |
| Backend contract/permission owner | `backend/src/services/ai-estimator-knowledge-item.service.ts` only for scoped target-error wording; `backend/tests/ai-estimator-knowledge-routes.test.ts` and focused existing/new related-item integration tests | Verify existing access/duplicate/reference semantics; preserve transaction, registry, and schema behavior. Do not expand permissions or alter uniqueness. |

The primary integrator owns any necessary shared `knowledgeApi.ts`, `knowledgeTypes.ts`, `knowledgeQueryKeys.ts`, or `knowledgeMutationSync.ts` edits. Owners request such changes instead of editing shared files independently. No dependency/lockfile changes are expected. Every writer must preserve others' edits and stay within assigned files.

## Task 1 — confirm contracts and capture the baseline
**Owner:** primary integrator. **Dependencies:** task-plan approval and execution choice. **Criteria:** AC1–AC6.

- Capture dirty-path set and per-target diffs. Read current dialog callers, query/list types and filters, API error representation, reference validation, unique-index errors, and relevant tests.
- Confirm the relationship catalog can supply complete status coverage for starter suppression and duplicate reconciliation. Use paginated existing reads as needed; never treat a partial/error result as proof that a name is absent.
- Freeze the starter helper interface: readonly UI key, basket-name hint, proposed sub-basket name, item name, and optional design guidance; eligibility receives real selected basket/sub-basket IDs and loaded catalog objects. A template key cannot be a rule target.
- Freeze an additive dialog interface for related-item wording and initial item name, plus authoritative created-item detail delivery. Preserve existing caller behavior and coordinate any callback test changes with the dialog owner.
- Freeze the duplicate-recovery behavior: definite validation failure retains inputs; conflict or ambiguous transport/server outcome triggers a full-context read before retry. A confirmed eligible match is offered for explicit selection; a different context/inactive match remains a conflict; failed reconciliation keeps creation retry blocked until status is checked. Do not change the stored target based on a name match alone.
- Confirm all writers understand immutable trigger/action/reason, source-item exclusion, target context, and the create-versus-section-save distinction. If evidence requires a material departure from the approved spec, stop and revise that document; routine implementation details stay within this plan.

## Task 2 — implement starter content and matching
**Owner:** starter-content owner. **Dependency:** task 1. **Criteria:** AC3, AC4, AC6.

- Add exactly the twelve reviewed starter definitions from the specification, with stable UI-only keys and generic, conditional design guidance. No product prices, automatic scope actions, or runtime AI service.
- Match the selected basket category conservatively using normalized names only for suggestion presentation. Use the actual selected IDs for filtering/persistence. Unknown category names offer custom creation without guessed suggestions.
- Filter by selected sub-basket or show proposed sub-basket context under All Sub Baskets. Suppress already represented suggestions only after a complete catalog read, using name/basket/sub-basket/type context. Inactive/archived matches do not become selectable or generate automatic duplicates.
- Test representative category matches, later-page matches, unknown categories, same names in separate contexts, item types/statuses, and incomplete catalogs. Ensure the helper cannot mutate items or create records.

## Task 3 — implement related-item creation and recovery
**Owner:** creation-dialog owner. **Dependency:** task 1. **Criteria:** AC2, AC4, AC6.

- Add related-item mode and initial-name prefill using the agreed interface. Preserve required Main Basket/Sub Basket/name validation and temporary-item semantics. Allow the user to correct starter name/classification.
- Keep POST pending state single-submit. Store the returned item detail as authoritative, notify the initiating rule promptly, and invalidate all affected item, relationship, main-line, sub-basket, and basket-impact queries. A refresh failure is a refresh warning after successful creation, not permission to POST again.
- Before reuse following a duplicate or ambiguous create failure, refresh the complete relevant catalog and compare full context. Offer explicit selection only of a confirmed eligible ID. Show conflicts when names are taken in a different context, and retain values for correction. Do not blindly retry a potentially committed request.
- Preserve the prior rule target on cancellation/definite failure and return focus to the opener. Keep a successful catalog item even if the user later abandons the rule; show concise copy explaining that saving the rule is separate.
- Test custom and prefilled creation, cancellation, validation failure, pending double submit, duplicate conflicts, unavailable matches, confirmed explicit reuse, ambiguous response/reconciliation success and failure, delayed or failed refresh after successful POST, and unchanged ordinary/temporary callers.

## Task 4 — verify backend access/reference behavior and target wording
**Owner:** backend contract/permission owner. **Dependency:** task 1. **Criteria:** AC1, AC4, AC5.

- Trace route operation, runtime authorization and actor checks for the existing create/read/update paths using an authorized Super Admin, existing authorized staff where supported, and a non-creator. Check direct API denial, not only hidden frontend controls.
- Verify the existing unique-name boundary and reference checks reject incorrect/self/unavailable/type/basket/sub-basket targets and preserve transaction/audit identity.
- Change only budget-alteration user-facing “Main Line” target errors to “related item” where needed. Keep unrelated Main Line terminology and validation logic intact.
- Reuse existing route/integration tests when they cover these cases; add focused gaps only. If any transactional behavior must change beyond wording, notify the primary owner before editing and require replica-set verification. No schema/index/registry expansion belongs to this slice.

## Task 5 — integrate dropdown, creation, and saved selection
**Owner:** primary integrator. **Dependencies:** shared contract from task 1; final integration needs tasks 2–4. **Criteria:** AC1–AC6.

- Relabel the target Related item, the action Scope action, the catalog type Catalog item, and the target placeholder/fallback per spec. Keep the native dropdown and surrounding layout.
- Add Existing items and Suggested items — add to catalog groups. Creation permission and editable state gate custom creation and starter entries. Existing permitted staff access remains unchanged.
- Add Add related item and keep the temporary flow. Opening a starter prepopulates the dialog without changing the stored target, scope action, trigger, or explanation. Preserve custom creation in unmatched basket categories.
- On confirmed creation/explicit reuse, update only the initiating rule's target type, basket, sub-basket and real ID. Merge authoritative created detail with list data by ID so its name and summary display immediately. Avoid overriding fresher catalog status with stale local detail.
- Preserve self-exclusion, basket/sub-basket/type resets, validation, empty guidance, saved unavailable selections, read-only history and no optimistic template IDs. Refreshing or opening a dropdown must never create an item.
- Add focused integration coverage for custom/starter add, temporary compatibility, permissions, two independent rules, complete payload IDs, delayed refresh, and successful section save followed by reopening/reuse. Use a second item and distinct basket to detect accidental ID/name joins.
- Keep styles local and use existing components. Verify dialog focus return when launched from an option as well as from the button.

## Task 6 — review and verify the integrated result
**Owner:** primary integrator; Mode A uses `integrity_reviewer` then `verification_runner`. **Dependencies:** all writers finished. **Criteria:** AC1–AC6.

1. Review the final combined diff, especially source/target IDs, real-versus-template keys, mutation success versus refresh failure, ambiguous retry recovery, permission boundaries, and creation/section-save lifecycle. Resolve confirmed findings before final verification.
2. From `frontend/`, run focused tests for `KnowledgeBudgetAlterationBuilder.test.tsx`, `CreateKnowledgeItemDialog.test.tsx`, the new suggestion/reconciliation helpers, and the affected workspace/save flow; run `knowledgeMutationSync.test.ts` if shared cache code changes. Then run `npm run typecheck` and `npm run build`.
3. From `backend/`, run `npm test -- tests/ai-estimator-knowledge-routes.test.ts` and any focused new related-item route tests. Run `npm run typecheck` and `npm run build` if backend source changes. Use `npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts` or a bounded related-item replica-set suite for actual creation/duplicate/reference persistence coverage; retain replica-set semantics and report missing environment requirements rather than weakening tests.
4. Render the actual UI at desktop and mobile widths with synthetic data. Exercise Super Admin custom creation, starter prefill/cancel/add, selection, save/reopen, second-rule reuse, cross-basket selection, long names, keyboard/focus/error association, no-creator/read-only modes, delayed refresh and failed creation. Mock transport for controlled failure states; distinguish mocked checks from real API persistence checks in the report. No production writes.
5. Run `git diff --check` and `git status --short`. Confirm only assigned sources/tests and working documents changed. Record temporary QA output paths outside tracked files; do not commit screenshots, databases, logs or build output.
6. Mark completed tasks and evidence in this plan. Report unrun checks and any material limitation explicitly. Broaden verification if new failures or shared impact justify it; no lint claim is permitted because the repository has no lint script.

## Acceptance-to-verification map
| Criterion | Evidence required |
| --- | --- |
| AC1 terminology | Builder/dialog accessible-name assertions; scoped backend message assertions; desktop/mobile inspection |
| AC2 create/reuse | Real ID returned from successful create; immediate label with delayed refresh; section save/reopen and second-rule reuse; cancel/failure preservation |
| AC3 starters | Twelve approved definitions; contextual filter/prefill assertions; no writes on browse; no template keys in saved payload |
| AC4 identity/recovery | Full-context match/conflict tests; server uniqueness/reference evidence; self/status/type exclusions; ambiguous-response and refresh-failure recovery |
| AC5 access | Super Admin allowed and non-creator direct API denied; existing staff boundary maintained; historical/read-only immutability |
| AC6 UX/compatibility | Existing rule and temporary tests; focused axe/keyboard checks; viewport/state checks; no implicit action/reason/pricing mutation |

## Dependency and parallel execution rules
- Task 1 is sequential and completes before any implementation slice.
- In Mode A, tasks 2, 3, and 4 can run in parallel because their file ownership does not overlap. The primary may prepare builder integration against the settled interfaces while they run; complete task 5 only after all dependencies are reconciled.
- In Mode B, perform all tasks inline in the primary thread. Do not spawn implementation subagents.
- Task 6 follows all writers and any integration fixes. In Mode A, integrity review precedes final verification; report review findings and resolve them before starting the verification runner.
- Keep one parent phase in progress, with child statuses recorded beneath it. Do not stage, commit, push, seed, migrate, deploy, or mutate production under this plan.

## Implementation and automated verification evidence — 2026-09-09
- Implemented Related item / Scope action labels, custom addition and twelve contextual starter suggestions, full-status suggestion suppression, explicit conflict reuse, and confirmed detail delivery before list refresh. Real item IDs, permission checks, draft lifecycle, and temporary-item behavior are preserved.
- The relationship query retains its original current-item list for other consumers and supplies a separate merged list including archived records to the Recommendations editor. No archived options were introduced into other section editors.
- Integrity review identified and resolved two asynchronous issues: a stale catalog row overriding newer confirmed reuse details, and a late create callback targeting a departed editor. The final implementation compares versions, keys row ownership by source ID and rule ID, and guards selection after teardown while still caching and invalidating confirmed creations. Regression tests cover both, including StrictMode and warning delivery after normal dialog closure. Re-review found no remaining blocker.
- The final verification runner made no source edits and verified the integrated worktree after all writers and review fixes.

### Exact checks and results
From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx src/features/ai-estimator-knowledge/knowledgeRelatedItemCreation.test.ts src/features/ai-estimator-knowledge/knowledgeRelatedItemSuggestions.test.ts src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts
npm run typecheck
npm run build
```

All exited 0. Tests: 175 passed across seven files (18 builder, 27 dialog, 29 reconciliation, 16 suggestions, 60 screens, 17 layout, 8 mutation synchronization). The workspace test exercises actual frontend create/select/save/reopen handling with mocked transport and explicit archived suppression. Component tests include keyboard and axe checks.

From `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-related-items.replica-set.test.ts
npm run typecheck
npm run build
```

All exited 0. Tests: 59 passed (54 route, 5 actual replica-set persistence). These exercise direct permission denial, real HTTP creation, transactional audit/uniqueness behavior, target validation, saving/reopening and second-source reuse. The existing duplicate-name error remains generic HTTP 500; frontend recovery explicitly reconciles that outcome before another attempt.

Repository `git diff --check` and `git status --short` exited 0. The dirty set consists only of eight modified sources/tests and seven new tests/helpers/working documents in the planned scope. No unrelated work was altered.

### Warnings, artifacts, and checks not run
- Existing Mongoose deprecation warnings concern `new` update options. Frontend build reports chunks over 500 kB (largest application JS 1,371.71 kB before gzip); this feature adds no dependency or bundling change.
- Ignored build artifacts: `frontend/dist/`, `backend/dist/`, and `frontend/node_modules/.tmp/tsconfig.{app,node}.tsbuildinfo`. Replica-set test databases were stopped by their helper.
- Full frontend/backend suites and OCR checks were not run; focused cross-component and transactional checks cover the changed surfaces. No migration or database seed is required or was run. No commit, push, deployment, or production mutation was performed.
- Browser QA uses `/tmp/lisno-related-item-qa/` with the actual builder/dialog and application styles plus synthetic HTTP responses, with screenshots under `output/playwright/`. Browser save/reopen is a harness check; real persistence is separately established by replica-set tests above. Authenticated browser end-to-end against a live application database is not claimed.

### Final browser evidence
- [Detailed QA report](/tmp/lisno-related-item-qa/RESULTS.md), [desktop view](/tmp/lisno-related-item-qa/output/playwright/desktop-initial.png), and [mobile long-name view](/tmp/lisno-related-item-qa/output/playwright/mobile-long-name.png). Actual components and application CSS were rendered at 1440 × 1050 and 390 × 844 with synthetic API data.
- Confirmed existing/suggested grouping, starter prefill/cancellation/creation, custom creation during delayed refresh, returned-ID selection, harness save/reopen, temporary creation with optional empty sub-basket, and failed creation preserving both input and prior target.
- Confirmed read-only/no-create permissions, empty/loading/error/stale states, descriptive error association, and no horizontal overflow at either width. Long selected names remain readable in the summary.
- Dialog Tab/Escape navigation and focus return passed. A scoped real-browser axe audit of the dialog reported zero violations with no disabled rules. Native dropdown selection via direct keyboard keys was inconclusive in the headed macOS session; normal Playwright select interaction passed. Full-page axe was not run because the harness omits the surrounding application heading hierarchy.
- No application runtime errors were observed; the synthetic harness emitted a favicon 404. Browser session and local port 4191 server were stopped. Temporary QA artifacts remain under `/tmp/lisno-related-item-qa/`; no repository QA artifacts were added.

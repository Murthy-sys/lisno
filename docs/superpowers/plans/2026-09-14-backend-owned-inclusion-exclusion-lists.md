# Backend-owned Inclusion and Exclusion lists — task plan

Specification: [Backend-owned Inclusion and Exclusion lists](../specs/2026-09-14-backend-owned-inclusion-exclusion-lists-design.md).

Status: implemented in approved execution mode A. T1–T4 complete; T5 command checks and desktop interaction checks passed. Mobile rendered state was checked, but native mobile conflict-repair clicking remains incompletely verified because of browser-tool timeouts.

## Scope and fixed contract

Use the existing authenticated, versioned section GET/PUT operations. Lists remain in the canonical PMC configuration inside the advanced payload and remain visible under Execution → Sub-Vendor. Preserve stable row IDs and the existing Save Mode/Discard workflow.

Missing or empty backend arrays render empty; no runtime starter list is synthesized. Only selected values participate in mutual exclusion. Equivalence uses the existing matching NFKC/trim/whitespace/case normalization in both workspaces. An unchecked counterpart is disabled with an accessible reason; an already-selected conflicting legacy row remains available for deselection. Backend validation rejects unresolved cross-list selections before any write.

No new endpoint, schema, dependency, shared catalogue, financial change, migration, seed, commit, push, or deployment is included.

## Initial state and ownership

Product sources are clean at planning time, based on `cd0d3e1`. The only existing dirty path is the new specification, owned by the parent. Capture status and per-target diffs again before implementation; preserve any intervening user changes.

- Parent owns the contract, integration, specification/plan, and rendered QA setup.
- Backend implementer owns the domain validator and its focused backend tests; it must not edit frontend files or change persistence architecture.
- Frontend implementer owns checklist presentation/state, Mode validation, pending-change/paragraph consumers and associated frontend tests; it must not edit backend files.
- In parallel mode, writers are not alone in the worktree: do not revert others' edits, cross ownership boundaries, or invent different normalization/legacy-recovery rules.

## Dependency-ordered tasks

### T1 — Confirm baseline and regression fixtures

Owner: parent. Dependencies: approved task plan and execution choice. Acceptance: AC1–AC11 verification setup.

- Capture the current dirty-path set and relevant target diffs; confirm no overlapping writers.
- Retain backend-shaped fixtures with arbitrary item names and distinct IDs. Update old fixtures that assume six frontend defaults or both-selected values only where the new requirements intentionally change behavior.
- Preserve explicit legacy-conflict fixtures for repair tests, rather than removing all evidence of the former valid state.
- Agree path-specific validation issues and the same-value normalization before assigning writers.

### T2 — Enforce mutual exclusion in the backend

Owner: backend implementer, or parent in inline mode. Depends on T1. Acceptance: AC2, AC3, AC9, AC10.

Affected files: `backend/src/domain/ai-estimator-knowledge-validation.ts`, `backend/tests/ai-estimator-knowledge-validation.test.ts`, and `backend/tests/ai-estimator-knowledge-item.service.test.ts`. Inspect adjacent knowledge tests for fixtures affected by the newly enforced rule; expand test-only scope only when necessary and report it.

- After validating item shapes, detect normalized names selected in both arrays and return actionable selection-path validation issues.
- Preserve missing arrays, explicit `[]`, valid unselected counterparts, and existing per-list uniqueness checks.
- Add validator cases for both directions and case, whitespace and NFKC equivalents with different IDs.
- Extend the existing replica-set service tests to save/remove/reload an ordinary row and the final row in either list, preserving the other list and another Main Line.
- Verify a rejected conflicting save leaves payload, section/aggregate versions, and audit writes unchanged. Verify legacy conflicting records remain readable and can be corrected through a valid save; do not rewrite historical data.

### T3 — Render backend-owned lists and prevent conflicting selections

Owner: frontend implementer, or parent in inline mode. Depends on T1; may run alongside T2 in parallel mode. Acceptance: AC1–AC8, AC10.

Affected runtime files: `knowledgePmcScope.ts`, `KnowledgePmcScopeChecklist.tsx`, `KnowledgeModeConfigurationBuilder.tsx`, `knowledgeModeConfiguration.ts`, `knowledgeModePendingChanges.ts`, and `knowledgeModeDescription.ts`, all under `frontend/src/features/ai-estimator-knowledge/`. A narrowly scoped style change is allowed in `knowledge-configuration-ui.css` only if required for the accessible disabled-state explanation; retain the compact layout.

- Remove the six-item runtime fallback from rendering, updates, pending-change comparisons and paragraph recognition; preserve previous saved/draft names when synchronizing deletions.
- Pass the opposite list's selected values into each checklist; block selecting an unchecked conflicting value and show the reason. Leave delete available, and immediately restore availability after the opposite entry is unchecked/deleted.
- Add the same rule to Mode validation so alternate entry points cannot submit a conflicting draft. Keep legacy rows visible and repairable, and present a clear conflict message.
- Preserve empty arrays, custom additions, Save Mode/Discard, save-error retention, conflict/version behavior, read-only controls and focus recovery.
- Update focused tests: `KnowledgePmcScope.test.tsx`, `KnowledgeModeSectionStateRemoval.test.tsx`, `KnowledgeModeConfigurationBuilder.test.tsx`, `knowledgeModeConfiguration.test.ts`, `knowledgeModePendingChanges.test.ts`, and `knowledgeModeDescription.test.ts`. Add or adjust adjacent consumers only when their existing assertions rely on the removed defaults.

### T4 — Integrate and review the complete change

Owner: parent; independent integrity reviewer in parallel mode. Depends on T2 and T3. Acceptance: AC1–AC10.

- Inspect the integrated diff, reconcile normalization/error behavior, and check all runtime references to the removed default helper.
- Review asymmetric IDs/lists, rejection-before-write, explicit empty serialization, paragraph cleanup, pending-change reporting, and legacy recovery.
- Resolve confirmed findings before final verification. Shared-worktree checks run only after writers finish.

### T5 — Final verification and handoff

Owner: parent for rendered QA; verification runner for command checks in parallel mode. Depends on T4. Acceptance: AC11 plus the behaviors mapped above.

- Frontend focused: `npm test -- src/features/ai-estimator-knowledge/KnowledgePmcScope.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeModeConfiguration.test.ts src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/knowledgeModeDescription.test.ts` from `frontend/`.
- Backend focused: `npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts` from `backend/`. The service file already uses an isolated Mongo replica set; do not substitute a non-transactional database or run test fixtures against an application database.
- Run `npm run typecheck` and `npm run build` in each affected workspace. Broaden knowledge-domain regression coverage when the shared validator or changed fixtures require it; investigate new failures without masking baseline failures.
- Render desktop and mobile checks with synthetic data through the real workspace UI: both selection directions, the disabled reason, uncheck/delete re-enable, delete-last empty state, custom-name additions, and legacy conflict repair. Component save/refetch tests and the replica-set service tests provide persistence evidence.
- Run `git diff --check` and `git status --short`. There is no lint script. Keep temporary reports outside tracked source and stop only task-owned QA processes.
- Report exact results, unrun checks and any limitations; do not claim runtime persistence from a visual-only harness. No external mutation, migration, commit or deployment is part of verification.

## Parallelism and progress

Only T2 and T3 may run concurrently after T1 settles their shared contract. T4 and T5 run sequentially on the integrated worktree. In inline mode the parent executes all tasks sequentially. Keep only one parent task in progress.

- T1 complete: product sources remain clean; only this plan and its specification were untracked before writers began. Shared normalization, stable IDs, empty-list semantics and legacy recovery behavior are settled. Backend issue code: `CONFLICTING_SCOPE_SELECTION`, with affected `.selected` paths.
- T2/T3 complete: backend and frontend changes integrated with separate native-agent ownership. Parent owns documentation and synthetic rendered QA fixtures.
- Bounded dependencies found during implementation: frontend paragraph editing also used the removed defaults, so its editor and existing tests are included. Backend context projection must retain readable historical rows while reporting the conflict. Creating a repair Draft from an older active revision also needs a narrowly scoped, nonpersisted inherited-conflict allowance; ordinary section writes, all structural checks and activation remain strict. These support the approved legacy-recovery criteria rather than changing list ownership or persistence contracts.

## Final implementation and evidence

- The frontend now uses only backend-saved rows, keeps explicit empty lists, disables an unchecked counterpart by normalized value, and retains selected legacy rows for repair. The shared description editor, paragraph synchronization and pending-change consumers also no longer synthesize starter items.
- Backend validation emits `CONFLICTING_SCOPE_SELECTION` before transaction/write for every conflicting selection path. Legacy context retains readable selected rows with an invalid-state issue. The active-to-draft copy alone supplies an internal, nonpersisted `$locals` allowance on new copied documents; ordinary writes, activation and other model validation remain strict.
- T4 independent integrity review found no confirmed blocking correctness/security/legacy-recovery defect. It traced rejection-before-write, stable IDs, normalization, empty serialization, historical immutability and the internal compatibility boundary.
- Frontend final focused command: `npm test -- src/features/ai-estimator-knowledge/KnowledgePmcScope.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeModeConfiguration.test.ts src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeModePendingChanges.test.tsx src/features/ai-estimator-knowledge/knowledgeModeDescription.test.ts src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/test/fixtures/enterpriseTransport.test.tsx` — exit0, **187 tests across9 files passed**.
- Backend final focused command: `npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-routes.test.ts` — exit0, **220 tests across5 files passed**. Initial sandbox listener `EPERM` was resolved by approved test escalation. The rerun used isolated Mongo replica sets and passed validation38, service72, context13, replica integration42 and HTTP routes55. Existing route tests were run; new conflict behavior is asserted at validator/service layers.
- `npm run typecheck` and `npm run build` passed in both workspaces. `git diff --check` passed. No runtime `defaultPmcScopeItems`/`DEFAULT_SCOPE_ITEMS` references remain. Existing Mongoose `new` deprecation and frontend >500kB chunk warnings remain. No lint script exists.
- Rendered desktop1728×1000: four columns retained; accessible names and descriptions inspected; selecting either side disables its counterpart, unchecking/deleting enables it, keyboard Space selects correctly, deleting every Inclusion produces the empty state and focuses Add Inclusion, and the other list retains3 rows. No unexpected synthetic API traffic.
- Rendered mobile390×900: the empty Inclusion list and remaining Exclusions reflow without document overflow. A legacy both-selected record renders readable conflict explanations with both selected Transport checkboxes enabled for correction and the other unavailable counterpart disabled. Native click automation repeatedly timed out; the final repair click and subsequent snapshot could not be completed reliably. A second browser-control capability reported no available browser. Do not treat these partial mobile checks as a passed native interaction test. Component tests cover repair, deselection, deletion, failed saves and read-only behavior; backend tests prove persistence independently of the visual harness.
- QA uses opt-in synthetic `qaScope=ready|conflict|empty` route data in `enterpriseKnowledgeData.ts`/`enterpriseRoutes.ts`. It makes no real API writes. Logs and the browser report are under `/tmp/lisno-scope-final/`; production build outputs/caches remain ignored. Full unrelated suites and OCR checks were not run; no migration, seed, external database mutation, staging, commit, push or deployment occurred.

## Compact disabled-option explanation follow-up

- User requested removal of inline “Selected in Inclusions/Exclusions” text. `KnowledgePmcScopeChecklist.tsx` now uses the existing shared Tooltip on the disabled option's label, with keyboard focus and Escape support. Its screen-reader description remains available while the tooltip is closed. Visible legacy-conflict repair messages are preserved.
- Two scoped CSS rules retain the compact label/delete layout and make hovering over the disabled checkbox reach the tooltip label. No dependency, shared Tooltip change, backend change or persistence change was required.
- `npm test -- src/features/ai-estimator-knowledge/KnowledgePmcScope.test.tsx src/components/ui/Tooltip.test.tsx` passed: 25 tests across two files, including both selection directions, hover/unhover, focus/Escape, description, conflict repair and accessibility. `npm run build` passed, including TypeScript compilation; the existing bundle-size warning remains. Logs: `/tmp/lisno-scope-hover-tests.log` and `/tmp/lisno-scope-hover-build.log`.
- Rendered desktop check at 1728×1000 confirmed Transport stays disabled in Exclusions, the inline explanation is clipped to a 1×1px screen-reader element, and hovering shows “Selected in Inclusions.” without changing the label's width or height. The four-column layout remains compact. The broader suites and mobile interaction matrix were not repeated for this presentation-only follow-up. `git diff --check` passed.

# Specification item-name picker: implementation plan

Date: 2026-10-30
Status: Implemented and verified for the approved scope; pre-existing broader-suite failures documented below
Classification: Substantial; Configuration lookup contract and shared editor behavior
Specification: [Approved specification](../specs/2026-10-30-specification-item-name-picker-design.md)
Execution mode: A, parallel native sub-agents, selected by the user after specification and task-plan approval.

## Outcome and boundaries

Replace the internal Configuration Specifications side panel's Item name text input with a searchable selector and Add item dialog. Reuse names from current saved Configuration and the current local draft. Keep selection and addition inside the existing Done → Save Mode lifecycle.

Names remain labels. Selecting a name changes only the existing row's name; it does not replace its ID, brands, description, typed compatibility fields, or budget/slab references. No collection, migration, write endpoint, permission expansion, dependency, or lockfile change is planned. Private proposal editors retain their existing scoped behavior without global Configuration lookup.

## Evidence and starting state

- Planning inspected HEAD `4fb3733b22f238d12af5dc8b342b50b74b49f19d`. At the start of this stage, the only dirty path was the untracked specification above. Recheck this baseline before implementation because other work can change the shared worktree.
- `KnowledgeSpecificationBuilder.tsx` owns the local specification editor and currently copies Item name input into the draft. `KnowledgeModePanel.tsx` and `KnowledgeSectionEditor.tsx` are its consumers.
- `knowledgeEditorDataSource.ts` already scopes editor API and cache access. `knowledgeModeTierDataSource.ts` preserves source capabilities through tier adapters. The proposal adapter deliberately has a separate API/cache namespace.
- `selectCurrentMainLineRevision` establishes draft-before-active selection; `knowledgeModeTierPayloads` understands Signature root and stored Premium/Functional payloads.
- `knowledgeMutationSync.ts` centralizes section and catalog refreshes. Lifecycle callers also exist in `KnowledgeItemWorkspacePage.tsx` and deletion dialogs; coverage must include source replacement/removal, not only pricing saves.
- The existing shared and backend validators reject normalized duplicate names within one specification array. Those rules and the saved payload shape remain authoritative.
- Neither workspace has a lint script. No product code or test files have been changed and no implementation tests have been run during planning.

## Settled implementation details

### Lookup contract

Add `GET /admin/ai-estimator-knowledge/specification-item-names` with the existing Configuration read operation, availability middleware, and `requireReadActor` guard.

Request parameters:

| Parameter | Contract |
| --- | --- |
| `search` | Optional string, maximum 240 characters; normalized substring filtering for the picker. Empty means all names. |
| `limit` | Integer, default 20, minimum 1, maximum 100. |
| `offset` | Nonnegative safe integer, default 0. |
| `checkName` | Optional nonempty candidate, maximum 240 characters; checks exact and similar names against the entire catalog independently of `search`, `offset`, and `limit`. |

Response uses the established pagination envelope with `items: [{ name }]`, `pagination: { limit, offset, total, hasMore }`, `exactMatch: { name } | null`, and `similarItems: [{ name }]`. Without `checkName`, return `null` and an empty array for the latter fields. Return names only, with no owning IDs, prices, projects, actors, or private payloads.

Use aligned backend/shared public types and the existing shared API factory. Invalid requests fail validation rather than being silently coerced into an unbounded scan. A dedicated candidate check prevents duplicates or spelling suggestions from being missed because they are outside the current search page.

### Source selection and matching

- Implement a read-only catalog service using existing direct-Mongoose Configuration models. Batch/project the relevant line, revision, and pricing section data; avoid per-line queries and browser detail fan-out.
- Apply `selectCurrentMainLineRevision`, verify revision/section ownership and selected revision status, and never fall back from a selected draft to an older active revision. Exclude archived/deleted lines. A selected revision with inconsistent ownership must fail safely with an existing-style catalog error, rather than returning another source's names.
- Extract valid names from supported, applicable current Mode namespaces using the existing tier helpers and applicability rules, including temporary items. Missing arrays contribute no names; skip blank, non-string, and over-length names. Historical revisions and private proposals are not inputs.
- Put pure matching rules in `shared/knowledge/knowledgeSpecificationItemNames.ts`. Comparison uses NFKC, trim/collapsed whitespace, and the existing `en-US` case normalization. Display sanitization collapses whitespace and retains case; never modify source records during discovery.
- Choose the lexicographically first sanitized display spelling within each normalized group, using an explicit stable comparison rather than database encounter order. Sort groups by normalized key before search/count/pagination.
- Use bounded edit distance on normalized Unicode code points for advisory similarity: no suggestions for candidates shorter than four characters; distance at most one for lengths 4–7, at most two for longer names. Exclude exact matches, prefilter impossible length differences, and return at most five candidates ordered by distance then normalized key. Keep punctuation, accents, and dimensions in comparison. This is a spelling aid, not an identity or save rule.
- The frontend uses the same helper to merge valid current-draft names and candidate matches with the server result. Local-draft merging must not alter server pagination offsets/counts or omit a later server page.

### Editor capability and interactions

- Add an optional, explicitly scoped item-name lookup capability to `KnowledgeEditorDataSource`, containing its query-key factory and API reader. Enable it on the live Configuration adapter; tier adapters retain it. Do not infer access from a role label or directly import the admin reader in the builder.
- Pass the capability through both builder consumers. Without it, preserve the existing scoped editor input, including proposal behavior. An enabled capability that fails must display an error; it must not fall back to unrestricted entry.
- Implement a focused `KnowledgeSpecificationItemNamePicker.tsx`, reusing the existing field, button, popover/dialog, and focus conventions. It owns search, paged results, and Add item interaction; the builder remains the owner of the current specification draft.
- Only opening an editable picker or Add item dialog triggers the necessary lookup. Keep search text separate from the selected row name. Reset paging when search changes, ignore obsolete query responses, and provide an accessible Load more action when additional server results exist.
- Disable choices already used by another row in the local array and explain that the item is already included. The currently edited row does not conflict with itself. Preserve a selected legacy value exactly until an explicit selection or addition changes it.
- Add item offers Item name, Add and select, and Cancel. Use the current search as an optional initial value. Validate the candidate, retrieve current exact/similar results, and disable submission while the candidate check is pending or failed. An old check cannot authorize a newer input value.
- An exact match offers selection of the existing spelling; a local-row conflict remains blocked. Similar matches offer selection or an explicit confirmation to use the distinct spelling. Clear that confirmation when the candidate or matching results change. Do not silently autocorrect.
- Add and select updates only the current row, marks its Mode dirty, and closes the nested dialog. Cancel changes nothing. Restore focus to the relevant trigger. Existing Done, discard, required-field focus, read-only transitions, and conflict review remain intact.
- Query loading, no saved names, no search results, and failure/retry are distinct. Retain authorized draft content across network/save/conflict failures. Respect the existing access-loss behavior; remove/disable access to unauthorized catalog results rather than retaining them as usable choices.

### Cache and save lifecycle

- Add a dedicated catalog key family under the live Configuration namespace, keyed by normalized lookup parameters. Candidate checks and result pages must not collide; proposal keys must never resolve to these queries.
- Local Add/Cancel/Done never writes a shared cache entry as a saved catalog name. Only local state supplies unsaved choices.
- Invalidate the catalog after successful pricing saves in every supported tier and successful changes that replace/remove current sources: draft/revision lifecycle changes, Main Line removal/archive, and enclosing catalog deletion where applicable. Extend existing mutation-sync functions and only the callers that lack a central hook.
- Refetch on reopening the selector so another authorized session's saved names become discoverable. Do not optimistically publish names after failed saves. A refresh failure must not retry an already committed mutation or discard the draft.
- Keep current section/aggregate version checks, transactions, validation, audits, and immutable approved/historical records unchanged. Two different Main Lines can save the same label; this feature adds no global uniqueness constraint.

## Dependency-ordered work and ownership

Only one parent phase is in progress at a time. These are planned assignments, not authorization to start implementation or spawn agents. In Mode A, use the named native roles after mode selection; in Mode B, the primary agent executes the same boundaries sequentially.

| Phase | Dependencies | Owner and owned paths | Deliverable and acceptance |
| --- | --- | --- | --- |
| T0: Baseline and evidence | Approved plan and execution mode | Primary; working documents and read-only inspection | Capture current dirty-path set and per-target diff, reconcile any changes since planning, confirm source models/applicability and lifecycle hooks. Do not assign a dirty target until existing changes and ownership are understood. AC2, AC5, AC7. |
| T1: Shared contract and capability | T0 | Primary; `shared/knowledge/knowledgeSpecificationItemNames.ts`, `shared/knowledge/knowledgeTypes.ts`, `shared/knowledge/knowledgeApi.ts`, `backend/src/contracts/ai-estimator-knowledge.ts`, frontend `knowledgeApi.ts`, `knowledgeQueryKeys.ts`, `knowledgeEditorDataSource.ts`, any needed `knowledgeModeTierDataSource.ts` adjustment, and their focused helper/API/adapter tests | Publish the exact typed contract, normalization/matching helpers, isolated optional capability, and query keys before parallel writers start. AC2, AC4, AC7. |
| T2: Catalog reader and endpoint | T1 | Backend implementer; new `backend/src/services/ai-estimator-knowledge-specification-item-name.service.ts`, `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/app.ts`, `backend/src/domain/route-operations.ts`, `backend/src/openapi.ts`, and backend tests | Authorized read-only catalog with complete pagination, current-source ownership, tier coverage, exact/similar checks, API inventory, and persistence-boundary coverage. Shared files owned in T1 remain read-only for this worker. AC2–AC4, AC6–AC7. |
| T3: Picker and save integration | T1 | Frontend implementer; new picker/component styles and tests, `KnowledgeSpecificationBuilder.tsx`, `KnowledgeModePanel.tsx`, `KnowledgeSectionEditor.tsx`, `knowledgeMutationSync.ts`, required lifecycle refresh callers, and their tests; proposal test files only | Search/Add/select/recovery/focus flows, draft preservation, source-change invalidation, and proposal no-request regressions. No production proposal adapter changes or T1 file writes without explicit ownership transfer. AC1, AC3–AC8. |
| T4: Integration and integrity review | T2 and T3 finished | Primary integrates; `integrity_reviewer` is read-only in Mode A | Inspect the integrated diff and resolve contract, source-selection, authorization, cache, and identity/draft preservation findings. Verify no unassigned changes or dependencies. Reassign fixes to the relevant owner sequentially. All ACs. |
| T5: Final verification and handoff | T4 fixes finished; no active writers | `verification_runner` in Mode A, primary in Mode B; commands and ignored temporary artifacts only | Run the focused integrated suites, both workspace typechecks/builds, rendered browser/accessibility checks, and repository hygiene. Record exact results and limitations before the final handoff. All ACs. |

T2 and T3 can run in parallel after T1 is complete because their owned files do not overlap. Primary remains the sole owner of cross-layer contract changes and communicates any revision to both writers before they proceed. Every implementation agent must be told it is not alone in the codebase and must preserve other changes. Integrity review and final verification run after writers finish, not against a moving worktree.

## Verification matrix

| Acceptance | Required test evidence |
| --- | --- |
| AC1: Picker | Render add/edit/read-only; search does not change a row; keyboard search/selection and Load more work; a current value absent from the page remains selected. |
| AC2: Current catalog | Use unequal source lines with draft and active revisions, historical-only data, temporary items, supported tiers, excluded source states, wrong-owner revisions/sections, malformed names, Unicode/case/spacing variants, deterministic display/order, and more than one page. Candidate checks must find a match outside the displayed page. |
| AC3: Persistence | Add/Cancel/Done/discard and successful/failed Save Mode; query a fresh reader before and after a real section save in an isolated Mongo replica set. Failed/version-conflicting saves cannot publish a new name. Same names across separate lines remain allowed. |
| AC4: Duplication and spelling | Exact normalized match, local-row conflict, `Plywod` → `Plywood`, explicit distinct-spelling confirmation, meaningful dimensions/punctuation, short-name limits, late/out-of-order candidate results, and changed input clearing confirmation. |
| AC5: Identity and compatibility | Selection/addition retain row ID, brands, description, hidden typed values, and budget/slab references. Preserve untouched legacy spelling through unrelated edits and existing serializer/validator behavior. |
| AC6: Recovery | Initial loading, empty catalog, empty search, retryable failure, stale query response, permission denial/loss, failed candidate check, Mode save error, and version conflict with pending draft preserved according to existing access policy. |
| AC7: Authorization and boundaries | Route-operation/OpenAPI agreement; anonymous, Procurement, PM, vendor, inactive/stale-role, and non-sole-admin denial; active sole Super Admin allowed. Proposal adapter/workspace must make zero global catalog calls, including through tier wrappers, and must keep its scoped behavior. |
| AC8: Rendered accessibility | Browser at 390px and 1440px: open/search/select/Add/cancel/near-match confirmation, long names, no horizontal overflow, keyboard/focus restoration, accessible names/errors, and console/network review. Run scoped axe checks with existing tooling. |

### Commands after implementation

Run the new suites plus the focused existing suites below. Proposed new test filenames are deliverables of T1–T3; use the final equivalent filenames if a test is colocated differently and record the exact commands actually run.

From `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-specification-item-names.replica-set.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-mode-tiers.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm run typecheck
npm run build
```

The new replica-set suite must exercise the real catalog service and the existing transactional section-save boundary. Reuse the test database helper; never run a seed script or weaken transaction requirements. Include endpoint validation/denial tests in that suite or a separately named focused route suite.

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgeSpecificationItemNames.test.ts src/features/ai-estimator-knowledge/KnowledgeSpecificationItemNamePicker.test.tsx src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.test.ts src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx
npm test -- src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/vendor-basket-proposals/proposalDataSource.test.ts src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx
npm run typecheck
npm run build
```

Include focused tests for any lifecycle caller changed in T3. Broaden testing only for uncovered affected consumers or review findings; identify pre-existing failures separately with evidence. Do not claim a full-suite or lint pass from these focused commands.

Use an isolated local browser fixture with synthetic data for the width/state matrix, plus the real backend persistence test above. Browser fixtures do not prove production data availability. Keep screenshots/logs in ignored `tmp/specification-item-name-picker-qa/` or an allowed temporary directory, report useful artifact paths, and stop task-owned servers/browser sessions afterward.

From the repository root:

```sh
git diff --check
git status --short
```

## Completion and operational limits

- Reconcile every acceptance criterion with tests or rendered evidence; leave explicit gaps when a check cannot run. Do not call partially verified work complete.
- Final handoff states what changed, the draft/shared-name boundary, key files, exact checks/results, remaining limitations, and artifact paths. No dependency or data migration is expected.
- No commit, push, deployment, production mutation, seed, backfill, or external communication is included. The change is additive and read-only at the API boundary; rollback is a code revert with no database migration.
- T0 completed with unchanged HEAD and only these two working documents initially dirty. T1 owns the contracts and scoped capability before backend/frontend writers begin.
- T1 complete: shared matching, API, and scoped capability tests passed (3 files, 26 tests). T2 and T3 assigned non-overlapping backend/frontend ownership. The primary agent owns browser QA fixtures and integration.
- T2/T3 complete. Read-only integrity review confirmed one Unicode request-length issue, corrected by sending raw search text while retaining normalized matching/cache keys; an expanded-Unicode regression was added. No other confirmed review findings. Final tests/builds and rendered QA run on the integrated result after that fix.
- Build-boundary clarification: the dependency-free matching implementation lives in `backend/src/domain/knowledge-specification-item-names.ts` and is re-exported by the shared helper. Backend `rootDir: src` prevents importing external TypeScript into its build; this preserves one implementation without changing build outputs or adding a runtime copy.

## Final verification, 2026-10-30

T4 and T5 are complete. Integrity review confirmed the source-selection, authorization, proposal isolation, identity, draft/save, and cache boundaries. Review found a Unicode search expansion issue; sending raw search input with normalized matching fixed it. Real browser QA then found that disabling the focused Load more button could dismiss the dropdown. Moving focus to Search before asynchronous pagination/retry and ignoring null blur transitions fixed that behavior. Both fixes have focused regression tests and received a follow-up read-only review.

### Exact final command checks

From `frontend/`, exit 0, **13 files and 242 tests passed**:

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgeSpecificationItemNames.test.ts src/features/ai-estimator-knowledge/KnowledgeSpecificationItemNamePicker.test.tsx src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.test.ts src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/vendor-basket-proposals/proposalDataSource.test.ts src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx
npm run typecheck
npm run build
```

From `backend/`, all exit 0, **313 core tests + 107 integration tests + 100 route tests passed**:

```sh
npm test -- tests/ai-estimator-knowledge-specification-item-names.replica-set.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-mode-tiers.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-related-items.replica-set.test.ts tests/vendor-basket-proposal-master-routes.test.ts
npm test -- tests/ai-estimator-knowledge-routes.test.ts -t '^(?!.*permits Procurement vendor management)'
npm run typecheck
npm run build
```

The last route command explicitly excludes one pre-existing test, described below. Backend HTTP/Mongo test listeners initially encountered sandbox `EPERM`; the identical authorized rerun passed. No production database was used. Both typechecks/builds and root `git diff --check` passed. `git status --short` contains only the implementation/tests and these working documents, with no dependencies or lockfiles changed.

Final command logs are under `/tmp/lisno-specification-item-name-qa/`: `frontend-final-tests.log`, `frontend-final-typecheck.log`, `frontend-final-build.log`, `backend-final-tests.log`, `backend-integration-tests.log`, `backend-route-tests.log`, `backend-final-typecheck.log`, and `backend-final-build.log`.

### Rendered checks

Used the real `KnowledgeSpecificationBuilder` with a synthetic catalog in an isolated Vite development fixture, Headless Chrome 156, DPR 1, at 1440×1000 and 390×844. This is viewport emulation, not a physical-device or production performance measurement.

The final Playwright script `/tmp/lisno-specification-item-name-qa/final-browser-check.cjs` passed after the last fix. Assertions verified 34 saved/local choices across pages, non-mutating search, similar-name confirmation, Cancel focus restoration, adding into the existing row, preserved ID/brand/description, keyboard selection, long-name wrapping, failure/retry, and Done retaining the unsaved draft. No horizontal overflow, browser errors, or failed requests occurred. The rendered Add item dialog had zero axe WCAG 2 A/AA violations. The separate replica-set tests verified real section persistence and failed-save isolation; the browser fixture makes no production-data availability claim.

Screenshots were opened and visually inspected:

- `/tmp/lisno-specification-item-name-qa/desktop-similar-name.png`
- `/tmp/lisno-specification-item-name-qa/desktop-selected.png`
- `/tmp/lisno-specification-item-name-qa/mobile-add-item.png`
- `/tmp/lisno-specification-item-name-qa/mobile-long-name.png`

Task-owned browser sessions and the local fixture server were stopped. Test/build outputs remain temporary or ignored; nothing was staged or committed.

### Existing failures and unrun checks

- `KnowledgeScreens.test.tsx`: both the integrated worktree and an isolated archive of original HEAD produced the same **16 named failures and 101 passes**. These older tests include assumptions about inline specification inputs that already disagree with the existing side-panel UI. Evidence: `/tmp/lisno-item-name-screens-baseline.log` and `/tmp/lisno-item-name-screens-current.log`. This suite is not reported as passing and was not rerun by the final verifier.
- One backend Knowledge routes case, `permits Procurement vendor management...`, expects Procurement basket creation to return 201 while the unchanged authorization returns 403. Reproduced with the original HEAD test in a temporary copy. Basket authorization was untouched; the final route command explicitly skipped this case.
- Existing frontend build warning: chunks larger than 500 kB. Backend tests emit Mongoose `new` option deprecation warnings. Neither prevents the completed checks.
- Full repository suites, OCR checks, deployment, seeds/backfills, migrations, production mutations, commits, and pushes were not performed. No lint pass is claimed because the repository has no lint script. No new dependencies were added.

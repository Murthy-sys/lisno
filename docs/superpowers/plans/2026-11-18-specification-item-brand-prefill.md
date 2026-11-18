# Saved specification item Brand prefill: task plan

Date: 2026-11-18
Status: Completed locally in approved Mode A. T1–T5 implementation, integrity review, automated verification, real-API desktop/mobile checks, and temporary-artifact cleanup are complete. No deployment or production mutation was performed.

Source of truth: [Approved specification](../specs/2026-11-18-specification-item-brand-prefill-design.md).

## Outcome and boundaries

Selecting a saved item such as Gypsum Board fills its previously saved Brands when the destination specification has no Brand choices. Existing choices, specification identity, descriptions, references, and the normal Done → Save Mode lifecycle remain intact.

Reuse the existing Configuration lookup and update contracts. No new write endpoint, permission, persistent schema, dependency, migration, production action, commit, or deployment is included. Preserve all preceding GST and tier-description edits in this dirty worktree.

## Settled contract

### Additive lookup metadata

Extend `KnowledgeSpecificationItemName` with optional `brandPrefill` metadata in backend/shared types and OpenAPI:

```ts
type KnowledgeSpecificationBrandPrefill =
  | { readonly status: "ready"; readonly names: readonly string[] }
  | { readonly status: "unavailable"; readonly reason: "invalid_source" | "too_many_brands" };

interface KnowledgeSpecificationItemName {
  readonly name: string;
  readonly brandPrefill?: KnowledgeSpecificationBrandPrefill;
}
```

- Current backend responses populate metadata for every returned saved item, including `items`, `exactMatch`, and `similarItems`. Optional typing supports older name-only responses; absence never means a verified empty Brand set.
- `ready.names` contains 0–200 valid, distinct Brand display names, each bounded to 240 characters. Empty means the item has no associated Brands in its eligible current saved occurrences. Normalize/deduplicate using the existing Unicode/case/whitespace rule and choose deterministic spelling and order.
- Resolve each source specification's associations by IDs within its own pricing scope before grouping suggestions by the existing item-name vocabulary. Do not return source IDs, unrelated Brands, prices, descriptions, or ownership data.
- An invalid referenced Brand, malformed association, or ambiguous source Brand definition makes that item's prefill unavailable. Invalid unused Brand records do not contribute suggestions. More than 200 distinct associated Brand names yields `too_many_brands`; do not return a silently truncated ready set. If both conditions exist, `invalid_source` takes precedence deterministically.
- Preserve current source revision/tier/default filtering, search, pagination, permissions, and the GET's read-only behavior. No route-operation count or permission change is required.

### Selection and draft update

The picker passes a structured selection to the builder containing the chosen name, origin (`saved`, `draft`, or `new`), and available `brandPrefill`. Origin distinguishes deliberate new/local names from legacy saved responses without metadata. This is an internal frontend callback contract, not a persisted field.

| Selection state | Draft behavior |
| --- | --- |
| Saved item, ready metadata, empty valid Brand association | Validate the complete proposed import, reuse unambiguous destination Brand definitions by the existing normalized-name uniqueness rule, allocate fresh local IDs for new definitions, and apply name/definitions/association in one update. |
| Existing nonempty Brand selection | Change the name only; retain all selected IDs and Brand definitions. |
| Malformed destination association | Preserve malformed data and existing validation/recovery behavior; do not silently replace it with suggestions. |
| Ready metadata with no names, or deliberately new/local-only name | Change the name without importing Brands. |
| Saved item with unavailable/missing metadata | Allow name reuse, retain Brand data, and show concise feedback that saved Brands could not be filled and can be chosen manually. Never present the missing set as verified empty or auto-import a partial set. |
| Import would exceed the destination limit or encounter ambiguous/invalid destination definitions | Reject the whole proposed prefill/name update, retain the current draft, and show a concise corrective error. |
| Network/permission failure | Retain the current selection/draft and use the existing lookup error/retry state. |

Metadata travels with explicit selection, avoiding a new asynchronous request after the user selects an item. Query updates, opening/reopening, and rerenders never trigger prefill. Explicitly selecting a saved item again may refill an empty association; manually clearing it otherwise remains respected.

The builder owns local draft updates and keeps the specification ID, brief description, hidden typed fields, references, and unrelated records intact. New Brand IDs are allocated only while applying a validated selection, not during rendering. Existing validation remains authoritative at Save Mode. Source records remain independent and unchanged.

## Ownership and dependency order

Only one parent phase is in progress at a time. After plan approval, ask the repository's execution-choice question once. No subagents or implementation start before that choice. In Mode A, T2 and T3 can run concurrently after T1 settles shared files. In Mode B, the primary executes the same slices sequentially.

### T1. Capture baseline and establish shared contracts

Owner: primary agent. Depends on task-plan approval and execution-mode selection. Covers AC3, AC7, AC8.

Owned files:

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `shared/knowledge/knowledgeTypes.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `backend/tests/api-docs.test.ts`
- Specification/task-plan documents and final integration decisions.

Work:

1. Capture the dirty-path set and relevant per-target diffs before writers start. Existing changes in contracts, OpenAPI, route/API tests, and shared types belong to the preceding approved work and must remain intact.
2. Record focused baseline results for the saved-name lookup and picker/builder/save tests. Known unrelated Procurement route, broader KnowledgeScreens/layout, and OpenAPI Mode-enum failures from preceding work are background; do not spend time repeatedly reproving them without new evidence.
3. Add the settled optional metadata types and strict bounded OpenAPI alternatives. Add a focused Brand-prefill schema assertion. Leave API URLs, query parameters, permissions, and saved payload schemas unchanged.
4. Confirm backend/frontend writers consume the same metadata and selection rules. Keep existing pure name normalization/matching helpers name-focused; richer callers must preserve metadata explicitly rather than requiring a shared behavior refactor.

Boundary: primary owns these shared files exclusively. Do not assign them to T2 or T3 writers. Frontend API factory signatures should require no endpoint changes.

### T2. Resolve saved Brand suggestions in the existing lookup

Owner in Mode A: backend implementer. Depends on T1. Covers AC2, AC3, AC5–AC7.

Owned files:

- `backend/src/services/ai-estimator-knowledge-specification-item-name.service.ts`
- At most one focused adjacent domain helper and its unit test, if needed to keep source association resolution/aggregation testable.
- `backend/tests/ai-estimator-knowledge-specification-item-names.replica-set.test.ts`
- The saved-item lookup case in `backend/tests/ai-estimator-knowledge-routes.test.ts`, preserving its existing dirty changes.

Work:

1. Expand the existing batched pricing projection to include specification associations and Brand IDs/names for root/default/Premium/Functional scopes. Keep current ownership/revision validation, configured/applicable filtering, and no per-specification database queries.
2. Resolve only explicitly associated Brands within each source scope. Support both valid single and multi-Brand saved forms; reject mixed, malformed, duplicate, dangling, or ambiguous associations for prefill without silently repairing source data.
3. Aggregate each catalogue item's resolved names deterministically and produce ready/unavailable metadata. Retain matching/pagination semantics and metadata on exact/similar results. Avoid unnecessary projection of Brand descriptions or other pricing data.
4. Test distinct Main Lines and tiers with overlapping item labels but unequal Brand sets, draft-before-active, inactive versus archived sources, default Mode, disabled scopes, unrelated Brand exclusion, no-brand items, malformed/dangling data, duplicates, bounds, ordering, and pagination.
5. Prove lookup is read-only by comparing source rows/versions/audits before and after. Include saved destination associations followed by a fresh lookup/read to show only successful saves publish new suggestions.
6. Verify the existing route returns metadata without changing authorization or request validation.

Boundary: no shared/frontend edits, live data access, schema change, save-service refactor, or migration. Communicate contract discrepancies before expanding scope.

### T3. Preserve metadata and prefill the local specification draft

Owner in Mode A: frontend implementer. Depends on T1; may run alongside T2 against the settled contract. Covers AC1, AC3–AC8.

Owned production files:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationItemNamePicker.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx`
- At most one focused adjacent `knowledgeSpecificationBrandPrefill.ts` helper.

Owned tests:

- `KnowledgeSpecificationItemNamePicker.test.tsx`
- `KnowledgeSpecificationBuilder.test.tsx`
- `KnowledgeModeSpecificationsSave.test.tsx`
- A companion import-helper test if the helper is added.
- Focused assertions/fixtures in `knowledgeApi.test.ts`, `knowledgeMutationSync.test.ts`, and `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx` only where required, preserving prior dirty edits.

Work:

1. Keep saved metadata when merging search pages, exact/similar matches, and local names. Saved entries take precedence over a duplicate local label. Carry origin/metadata through every explicit selection route, including Add item's existing-name shortcut.
2. Implement a small pure draft import decision using existing Brand/specification validation. Match destination definitions only under the approved local uniqueness rule; preserve existing records and associations; allocate fresh IDs for new definitions only after validation succeeds. Apply one builder update for a successful selection.
3. Preserve nonempty/malformed associations, brief descriptions, stable IDs, compatibility fields, references, and other rows. No effects or query callbacks may refill a manually cleared association.
4. Add minimal accessible feedback for unavailable metadata and rejected imports. Retain existing lookup retry, Brand controls, focus behavior, and no-layout-redesign scope. Clear obsolete feedback on a subsequent appropriate user action; never discard pending input.
5. Test the screenshot case, one/two/multiple saved Brands, reuse of an existing local Brand, Unicode/case/space deduplication, existing selections, explicit clears and reselection, newly created/local names, unavailable/legacy metadata, capacity/invalid-definition rejection, and stale search/row changes.
6. Exercise Done → Save Mode → reopen, discard, failed save, and version conflict with persisted fixture assertions. Verify source rows are unchanged and the saved catalogue invalidates through existing mutation paths.
7. Prove isolated proposals do not request the admin catalogue, and read-only controls cannot prefill. Existing capability boundaries should not need production changes; report any demonstrated need before widening ownership.

Boundary: no backend/shared edits, global Brand master, auto-save, description changes, new dependencies, or broad visual refactor.

### T4. Integrate and review

Owner: primary agent, followed by `integrity_reviewer` in Mode A; inline equivalent in Mode B. Depends on T2 and T3. Covers AC1–AC8.

1. Reconcile backend/shared/OpenAPI/frontend contracts and examine the combined diff against the captured baseline.
2. Trace Brand IDs from source association resolution through destination-local import and saved payload; check that label grouping never mutates or links source records.
3. Review current-revision/tier filtering, incomplete metadata, deterministic bounds, no partial imports, pending/cleared selections, async stale responses, mutation invalidation, and proposal/read-only isolation.
4. Resolve confirmed defects before final verification. Keep prior GST/tier-description work intact. Share contract changes rather than allowing incompatible writer fallbacks.

### T5. Verify the final integrated implementation and hand off

Owner: verification runner and primary in Mode A; primary in Mode B. Depends on T4. Covers AC1–AC8.

Start with new/changed focused tests, then run these relevant suites on final integrated sources. Include any added domain/import-helper test file explicitly in the verification record.

```sh
# backend/
npm test -- tests/knowledge-specification-brand-prefill.test.ts tests/ai-estimator-knowledge-specification-item-names.replica-set.test.ts
npm test -- tests/ai-estimator-knowledge-routes.test.ts -t 'paginated specification item-name lookup'
npm test -- tests/api-docs.test.ts -t 'specification item Brand prefill'
npm test -- tests/ai-estimator-knowledge-tier-description-copy.test.ts tests/estimator-tier-description.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/ai-estimator-knowledge/knowledgeSpecificationBrandPrefill.test.ts src/features/ai-estimator-knowledge/knowledgeSpecificationItemNames.test.ts src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.test.ts src/features/ai-estimator-knowledge/KnowledgeSpecificationItemNamePicker.test.tsx src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx
npm test -- src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx
npm test -- src/features/ai-estimator-knowledge/useKnowledgeTierDescriptionInitialization.test.tsx src/features/client/ClientQuotationLine.description.test.tsx src/features/estimates/estimateGstPresentation.test.ts
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

Use isolated Mongo replica-set fixtures for backend persistence evidence. Perform a browser check at 1440px and 390px against the real local saved-item lookup and save endpoint with synthetic data when practical: select Gypsum Board, verify both Brands immediately, use keyboard controls, Done, Save Mode, reload, and verify persisted associations. Exercise a destination Brand already present and a deliberate clear without background refill. Check accessibility, overflow, and unexpected console/network errors. If any browser step uses a mocked transport, state exactly which behavior was mocked and prove persistence separately.

Record exact commands/counts, known failures, unrun checks, principal changed files, and generated artifact paths here. Stop only dedicated temporary processes and remove temporary QA harnesses/screenshots/databases. No full repository/OCR suite is required unless implementation expands beyond this scope; there is no lint script. No production mutation, seed, migration, commit, push, deployment, or external communication is authorized.

## Execution status

Specification and task plan approved; Mode A selected. T1 shared metadata types and OpenAPI schema/test are established. The starting dirty paths and relevant target diffs are recorded in `/private/tmp/lisno-brand-prefill-baseline-status.txt` and `/private/tmp/lisno-brand-prefill-baseline.diff`. T2/T3 completed their non-overlapping implementation; T4 independently reviewed the integrated contracts, source/destination identity, incomplete data, clear behavior, and isolation, finding no remaining confirmed defects. T5 final automated and real-API browser verification and cleanup are complete.

### Implementation evidence

- Backend baseline: 8 saved-item replica tests passed. Final writer checks: 23 Brand-prefill helper tests, 18 full saved-item replica tests, and 1 focused HTTP lookup test passed; backend typecheck passed. The lookup resolves source-scope IDs before deterministic aggregation, returns complete or unavailable metadata, and leaves source rows unchanged.
- Frontend baseline: 58 picker/builder/save tests passed. Final writer checks: 91 helper/picker/builder/Mode-save tests and 91 API/mutation/proposal boundary tests passed; frontend typecheck passed. Metadata survives every selection route and applies as one validated local draft update.
- Primary integration review caught a malformed Brand-collection edge in the new helper's early returns. The frontend writer added an initial structural guard and three regressions, preventing unrelated name selection from replacing malformed data with an empty array.
- The focused OpenAPI assertion passed. The integrity reviewer found no blocking issue after all writes finished; `git diff --check` passed. Large-catalog performance has not been benchmarked; source reads remain batched with bounded result metadata.
- Writer logs: `/private/tmp/lisno-brand-prefill-backend-*` and `/private/tmp/lisno-brand-prefill-frontend-*`. Final runner logs use `/private/tmp/lisno-brand-prefill-final-*`.

### Real-API browser verification

The primary mounted the actual `KnowledgeModePanel` in React Strict Mode against the real local Configuration router, lookup service, and section-save service, backed by a temporary Mongo replica set. Authentication used a synthetic stored sole Super Admin. No product API response was mocked. A saved source Gypsum Board had Alpha Board and Beta Board associated by source IDs, plus a separate unrelated Brand/item. Each destination started with no specifications and an existing local Alpha Board definition with its own ID and description.

Chrome checks passed at 1440×1000 and 390×844:

- Keyboard selection of Gypsum Board immediately displayed both associated Brands, excluding the unrelated Brand.
- Database payload/version stayed unchanged until Save Mode. Done closed the panel without persistence.
- Save Mode persisted one specification and two Brand definitions. Alpha Board reused the destination ID/description; Beta Board received a new destination ID. No foreign source ID or source brief description was copied.
- Reload retained both selected Brands. Clearing the selection, saving, and reloading kept it empty without automatic refill and retained the same specification ID.
- The source's persisted section records remained byte-for-byte unchanged. Destination pricing versions increased from 2 to 3 for import, then to 4 for the deliberate clear.
- Both widths had zero axe violations, horizontal overflow, or unexpected browser errors. Screenshots were visually inspected for the populated fields and actions.

The first harness attempt used an unstable callback that reset its own Save-button state; a stable harness callback resolved it without a product change. Final script exit was 0. Evidence remains in `/private/tmp/lisno-brand-prefill-browser.json`, `/private/tmp/lisno-brand-prefill-browser.log`, and `/private/tmp/lisno-brand-prefill-api.log`.

Temporary `backend/qa-brand-prefill.mts`, `frontend/qa/brand-prefill.html`, `frontend/qa/brand-prefill.tsx`, runnable `/private/tmp` browser scripts, and both `output/playwright/brand-prefill-*.png` screenshots were removed. The dedicated Vite process stopped intentionally (130); API/Mongo shutdown completed (0, `BRAND_QA_STOPPED`). Existing unrelated QA assets were preserved.

### Final automated verification

The independent verification runner executed the exact T5 commands above after integrity review, against the final integrated implementation.

| Check | Result |
| --- | --- |
| Backend Brand-prefill helper and full saved-item replica suite | 41 passed |
| Focused saved-item HTTP route | 1 passed; 102 unrelated cases filtered |
| Focused Brand-prefill OpenAPI contract | 1 passed; 78 unrelated cases filtered |
| Backend tier-description regressions | 73 passed |
| Frontend Brand import, normalization/configuration, picker, builder, and Mode-save suites | 118 passed |
| Frontend API, cache invalidation, and proposal-isolation suites | 91 passed |
| Frontend tier initialization, selected description, and GST regressions | 31 passed |
| Backend and frontend typechecks/builds | All exit 0 |
| `git diff --check` and status inspection | Exit 0; prior work preserved and no temporary QA artifacts |

**356 tests passed, zero failures.** Existing Mongoose `new` deprecation and Vite chunk-size warnings remain. No full repository/OCR suite, lint, or large-catalog benchmark was run; these were outside the bounded verification scope. No unresolved defect was found in this change.

Exact log files: `/private/tmp/lisno-brand-prefill-final-{backend-focused,backend-route,backend-openapi,backend-regression,backend-typecheck,backend-build,frontend-focused,frontend-contract,frontend-regression,frontend-typecheck,frontend-build}.log`; final status: `/private/tmp/lisno-brand-prefill-final-status.txt`. Builds generated ignored `backend/dist/`, `frontend/dist/`, and frontend TypeScript build-info cache. No dependency/lockfile change, migration, seed, commit, push, deployment, or production-data mutation was performed.

## Follow-up: running local version and first specification save

The user reported the feature still missing after saving. This reopened diagnosis and correction within the approved behavior and Mode A; the requirements and configured-scope/source-identity rules did not change.

Two findings were confirmed:

1. The local frontend was serving the new helper, but the existing backend process had started before the Brand-prefill implementation. Its served OpenAPI item schema still contained only `name` and lacked `KnowledgeSpecificationBrandPrefill`. The existing local launcher deliberately runs without a source watcher. A read-only, loopback-only database check confirmed the reported Gypsum Board occurrences already had configured scopes and resolvable saved Brand associations.
2. A separate first-save regression was missing from the original test fixtures: `KnowledgeModePanel` submitted a new pricing scope's `not_configured` applicability unchanged when saving valid specifications/Brands. The catalogue correctly excludes unconfigured scopes. The original browser fixture preconfigured source/destination pricing, which concealed this first-save gap. A new regression failed before correction on the exact incorrect applicability value.

Correction: `KnowledgeModePanel.tsx` now promotes only an explicitly saved, dirty pricing scope with validated nonempty specifications from `not_configured` to `configured`, after existing full preflight validation. It preserves `not_applicable`, empty/no-edit/invalid/discard paths, payloads, version/CAS guards, and ordinary draft persistence. Existing authored unconfigured rows are promoted only when explicitly edited and saved; no read-time mutation or bulk repair was added. `KnowledgeModeSpecificationsSave.test.tsx` covers fresh save/reload, existing-row edits, blank validation, no-edit, discard, removal, and explicit applicability preservation. The independent integrity review cleared the correction.

The identified local development supervisor was gracefully restarted through the same `scripts/local-chat.mjs --with-ocr` entry point, which skips seeding. Local backend/rules/OCR were restored; the user's frontend remained on localhost:5173. After restart, the served item schema contains `name` and `brandPrefill`, the Brand-prefill component exists, backend health is 200, and the frontend's existing local API proxy also returns 200. Saved Configuration was read only and not rewritten. The refreshed development app remains running; this was not a production deployment. Runtime log: `/private/tmp/lisno-local-brand-runtime.log`.

### Follow-up verification

| Exact command | Result |
| --- | --- |
| Frontend: `npm test -- src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx` | 100 passed |
| Backend: `npm test -- tests/ai-estimator-knowledge-specification-item-names.replica-set.test.ts` | 18 passed |
| Frontend: `npm run typecheck` and `npm run build` | Both passed |
| Repository: `git diff --check` | Passed |

**118 follow-up tests passed, zero failures.** Backend typecheck/build were not repeated because backend source was unchanged. Existing Vite chunk-size and Mongoose deprecation warnings remain. The scope did not require full repository/OCR suites, lint, or a new visual redesign matrix.

A new real-API Chrome test started both source and destination directly from `createMainLine`, leaving pricing `not_configured`. Through the actual Mode panel it created Gypsum Board and two synthetic Brands, used Done → Save Mode, and verified source pricing became configured in Mongo. The real saved-item lookup then returned both Brands. Selecting the item on the fresh destination filled both, saving configured that destination, and reload retained the associations. Reuse left the source section unchanged, and no unexpected browser errors occurred. This closes the previously missing fresh-save → catalogue → reuse path. Prior desktop/mobile layout/accessibility checks remain applicable because the correction changes only submitted applicability.

Evidence: `/private/tmp/lisno-brand-prefill-first-save-{red,focused,green,typecheck}.log`, `/private/tmp/lisno-brand-prefill-first-save-final-{frontend-focused,backend-replica,frontend-typecheck,frontend-build}.log`, and `/private/tmp/lisno-brand-first-save-browser.{json,log}`. Temporary first-save API/frontend/browser files were removed and their isolated API/Mongo/Vite processes stopped separately from the refreshed user app. No existing saved item, schema, dependency, lockfile, production service, or approval history was modified by the diagnostic/restart.

### Add Specification clarification check

The user reiterated that automatic Brand selection must happen inside **Add Specification**. An independent read-only audit confirmed the new-row picker reaches the same atomic item/Brand update as the existing editor. Added a dedicated rendered regression to `KnowledgeSpecificationBuilder.test.tsx`: begin with no specifications or Brands, open Add Specification, select saved Gypsum Board, assert both saved Brands appear selected immediately before Done, and confirm they remain on reopening. This requires no additional product-source change.

Verification: `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx` passed all **31 tests**; `cd frontend && npm run typecheck` and `git diff --check` passed. Build and wider suites were not repeated for this test-only addition. No application services were started, restarted, or stopped during this clarification check; the currently running local backend was only read to confirm its public schema includes `brandPrefill`. No deployment or saved-data changes were performed.

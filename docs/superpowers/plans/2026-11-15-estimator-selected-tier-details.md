# Estimator selected-tier details task plan

Date: 2026-11-15
Status: Implemented and verified in Mode A; T1–T4 complete, with one documented pre-existing API-test failure
Approved specification: [Selected-tier details in the estimator](../specs/2026-11-15-estimator-selected-tier-details-design.md).
The user approved the specification and task plan, then selected execution Mode A.

## Outcome and settled contract

Add a collapsed **Show details of tier** control to included configured estimator items and the Configuration **Client view** preview. Expansion lists only **Specification item name (Brand name)** for the selected tier. Preserve current styling, inclusion/tier/quantity controls, prices, and all existing mutation behavior.

Extend the existing catalogue read with optional display metadata; no new endpoint or persistence:

```ts
type TierDetails = {
  specifications: Array<{
    id: string;
    name: string;
    brands: Array<{ id: string; name: string | null }>;
  }>;
// Optional on catalogue lines and local configured drafts:
tierDetails?: Partial<Record<KnowledgeModeTier, TierDetails | null>>;
```

- An object with `specifications: []` means a configured empty list. A null/missing entry means unavailable details; an absent map also supports older API responses. Only applicable Signature/Premium/Functional keys are projected.
- Read the selected tier's pricing section from the catalogue row's verified current revision. Signature uses the root payload; additional tiers use their own payloads. Resolve each brand ID against that same tier's brands. A valid reference whose brand name cannot be resolved has `name: null` and displays **Brand unavailable**. No brand association produces no brackets.
- Preserve specification order and association order. Invalid specification identity/name, duplicate specification IDs, or malformed/ambiguous brand-association structure makes that tier's details unavailable instead of silently omitting records or guessing a relationship. Duplicate brand IDs cannot select an arbitrary winner; affected references remain unresolved. Missing optional metadata must not change item eligibility or pricing.
- Project names/IDs only. Do not expose descriptions, raw payloads, costs, calculation rules, or private notes. Opening the panel requires no additional fetch or write.
- Keep expansion local to a room/Main Line row, collapsed initially, and open across tier changes. Render only when an included configured item has a selected tier. Missing/mismatched source data clears displayed details. Read-only rows can inspect without enabling edits.

## Dependency-ordered tasks

### T1. Baseline and contract preparation

Owner: primary. Covers AC1–AC6 preparation.

Capture current dirty paths, relevant target diffs, and preservation hashes under `/tmp/lisno-estimator-tier-details-qa`. Review existing changes before assigning dirty files. In particular, `backend/src/openapi.ts`, `backend/tests/api-docs.test.ts`, estimator styles, and several lead/preview fixtures already contain unrelated work.

Confirm the DTO above against existing parsing/validation conventions and share it verbatim with both implementation slices. Run the existing relevant baseline suites from T4 before changing their behavior; record unrelated baseline failures. Do not add dependencies or touch previous completed tasks.

### T2. Implement the projection and display

Depends on T1. Keep T2 as the single in-progress parent task. In Mode A, the following slices can progress in parallel after primary adds the frontend types. In Mode B, implement them sequentially inline.

**Backend slice.** Backend implementer owns only:

- `backend/src/services/estimator-catalogue.service.ts`
- `backend/src/domain/estimator-tier-details.ts` and `backend/tests/estimator-tier-details.test.ts` (new focused projection helper and its tests)
- `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`

Load the root pricing `specifications`/`brands` alongside the existing tier payloads. Project the exact current tier through the helper, verifying section/Main Line/revision alignment. Add the agreed optional map to the existing catalogue line type and response. Preserve the current revision resolver, eligibility, public financial projection, prices, policy fields, and transaction behavior. No route/permission/model changes.

Test distinct specifications and brands in all three tiers, reused IDs in different tiers/Main Lines, singular/multiple/no brand associations, missing and malformed values, configured empty lists, default-Mode non-fallback, draft precedence, and temporary items. Include private-field sentinels and verify catalogue financial fields and source identity remain intact. Exercise the actual Mongo projection so the omitted Signature root fields cannot regress.

**Frontend display slice.** Frontend implementer owns only:

- `frontend/src/features/estimates/EstimateLineTierDetails.tsx`, its `.test.tsx`, and `estimate-line-tier-details.css` (new reusable disclosure)
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and `ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.tsx` and its `.test.tsx`

Use the agreed catalogue types and existing row details area. Put the disclosure outside the checkbox label. Prefer native disclosure semantics with the exact visible title, accessible selected-tier/row context, and existing visual tokens. List names and bracketed brands without extra paragraphs or card styling. Include empty/unavailable states. Keep long content wrapping and per-row expansion independent; changing tiers updates an open list immediately. No updates to estimate draft state from expansion.

Integrate both estimator and preview consumers, passing the selected tier and current-source availability. Keep manual/unselected/excluded rows from presenting an invented tier. Test tier switching, read-only inspection, no inclusion toggle, independent rows, missing metadata, unavailable source, and no API writes. Existing preview checks for saved-only data and hidden private pricing remain valid.

**Primary integration slice.** Primary owns:

- `frontend/src/features/leads/estimationCatalogueApi.ts`
- `frontend/src/features/leads/configuredEstimate.ts` and `configuredEstimate.test.ts`
- `frontend/src/features/leads/estimateDraftFingerprint.test.ts`
- `backend/src/openapi.ts` and narrowly scoped assertions in `backend/tests/api-docs.test.ts`

Add frontend types before the frontend writer starts. Carry the map through new-row creation, refresh, and preserved saved-row hydration. Clear it for missing/mismatched source identity; never attach another source's data to a retained row. Confirm a metadata-only refresh does not alter quantities, selections, prices, or dirty fingerprints and does not add fields to explicit estimate mutation serialization. Update the additive OpenAPI response schemas, preserving existing schema edits.

Primary also owns any strictly necessary browser-fixture adaptation after inspecting its current diff; use temporary synthetic response overlays where possible. Do not modify global estimator styles or the shared row layout unless inspection demonstrates the disclosure cannot fit its existing details area. Any such small styling integration remains primary-owned, with existing changes preserved.

All Mode A writers must be told they are not alone, must preserve others' edits, and must remain within their assigned paths. Share contract questions immediately rather than inventing a fallback.

### T3. Integrate and review

Depends on all T2 writers. Owner: primary, with an independent read-only `integrity_reviewer` in Mode A; inline review in Mode B.

Review the complete projection-to-consumer flow: current revision and exact tier, stable-ID brand resolution, absent/null/empty semantics, private-field exclusion, draft hydration, read-only behavior, and explicit save serialization. Confirm no estimate amount, permission, publication, or persistence contract changed. Resolve scoped findings before verification.

### T4. Verify and hand off

Depends on T3. In Mode A, `verification_runner` owns final focused tests and typechecks after writers finish; primary owns builds, browser inspection, and preservation reconciliation. In Mode B, primary performs all verification inline.

Backend focused commands from `backend/`:

```sh
npm test -- tests/estimator-tier-details.test.ts tests/api-docs.test.ts
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts -t 'estimator configured catalogue and estimate|estimate per-line Mode tiers|tier details'
npm run typecheck
npm run build
```

The existing replica-set helper starts an isolated test database; do not substitute a live database or weaken transaction semantics. New helper tests are final-only because that file does not exist at baseline.

Frontend focused commands from `frontend/`:

```sh
npm test -- --maxWorkers=2 src/features/estimates/EstimateLineTierDetails.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/estimateDraftFingerprint.test.ts
npm run typecheck
npm run build
```

At baseline omit only the new disclosure test. Broaden checks only for new failures or a demonstrated additional consumer; do not automatically run unrelated workspaces. There is no lint script.

Use synthetic browser data at **1440/768/390/320px**. Inspect the actual estimator and Client view preview, collapsed/expanded state, all three tiers, long names/multiple brands, missing data, keyboard use, focus, and accessibility. Confirm expanding does not toggle inclusion, change amounts, mark the estimate dirty, or issue a write. Check stale details clear when the source changes or becomes unavailable. No real customer data or mutations.

Finish with `git diff --check`, `git status --short`, and baseline preservation comparison. Close owned browser sessions, remove temporary repository harnesses, and record exact results and generated artifact paths here. No commit, push, deployment, migration, or production action.

## Acceptance trace

| Criterion | Implementation | Verification |
| --- | --- | --- |
| AC1: collapsed panel in both views | Frontend display slice | Consumer tests and browser inspection |
| AC2: selected-tier names and bracketed brands only | Backend + frontend slices | Unequal tiers, associated-brand cases, absence of description paragraphs |
| AC3: exact current source and unavailable states | Backend + primary hydration | Replica-set projection, malformed/missing data, source identity/refresh tests |
| AC4: safe API and unchanged behavior | Backend + primary contract integration | Private-field sentinels, API/OpenAPI tests, existing catalogue pricing regressions, no-write assertions |
| AC5: local accessible responsive expansion | Frontend + primary hydration | Keyboard/accessibility/browser checks, independent rows, unchanged fingerprints/serialization |
| AC6: integrated correctness and preservation | T1, T3, T4 | Typechecks/builds, focused suites, final diff comparison |

## Implementation and verification record

Specification and task plan were approved, followed by Mode A. The backend and frontend writers finished their disjoint slices; independent integrity review found no confirmed defects. The primary reviewed integration and the final verification runner tested the combined worktree.

The new disclosure uses native `details`/`summary`, with an explicit tab stop for the existing drawer focus trap. It renders only the selected tier's names and brands and remains outside the inclusion checkbox label. The optional catalogue projection is copied into local draft display state, cleared for missing/incompatible sources, and omitted from explicit estimate serialization and semantic fingerprints. No financial calculation or persistence changes were needed.

### Final checks

Commands are the T4 commands above, except the final frontend test invocation also included `src/features/ai-estimator-knowledge/KnowledgeSubBasketMargins.test.tsx` after a small test-only TypeScript cleanup.

| Check | Result |
| --- | --- |
| Backend helper and API documentation suites | 107 passed, 1 pre-existing failure; exit 1 |
| Backend catalogue/estimate replica-set subset | 69 passed, 41 intentionally filtered skips; exit 0 |
| Backend `npm run typecheck` and `npm run build` | Both exit 0 |
| Frontend six focused suites | 152 passed across 6 files; exit 0 |
| Frontend `npm run typecheck` and `npm run build` | Both exit 0; Vite reports large-bundle warnings |
| `git diff --check` and `git status --short` | Exit 0; existing dirty work preserved |

The unchanged failure is `backend/tests/api-docs.test.ts`, **documents scoped Mode tiers without accepting whole namespace maps**: the current Configuration enum includes `default`, while the old assertion expects only Signature/Premium/Functional. It failed before this task as well (baseline 73 passed, 1 failed). The new tier-details API assertion passes. Baseline frontend tests passed 123 tests; baseline replica subset passed 65 tests with 41 filtered skips. Local socket-based tests required escalation for isolated test listeners/Mongo after sandbox EPERM.

Final frontend typechecking found missing refresh props in a new test fixture, which were corrected. It also found six unsupported `exact: true` options in the earlier approved Sub-Basket margins tests; only those redundant `getByRole` options were removed. String accessible names already match exactly. The existing query-key `exact: true` remains intact. That file's original hash matched the preservation baseline, and its 16 tests pass after this compile cleanup. No previous product behavior was changed.

### Rendered/browser evidence

The actual estimator and Configuration Client view preview were inspected with synthetic browser data at **1440, 768, 390, and 320px**. Both have no document or panel overflow, including long unbroken specification/brand names. Checks covered collapsed defaults, Enter/Space expansion, a visible 2px keyboard focus outline, all three unequal tiers, an open panel updating on tier change, configured-empty and missing-detail states, and clearing old metadata on catalogue refresh. Expansion preserved inclusion and displayed amounts and made no additional request. All observed requests were reads. Both automated accessibility scans reported **zero violations**; existing surrounding controls had incomplete manual-review entries, recorded in the browser summary. Rendered tests additionally cover independent room rows, read-only inspection, manual/excluded rows, and unchanged dirty fingerprints.

Browser previews used an in-memory synthetic catalogue response. The synthetic Super Admin fixture omitted catalogue-read permission, so the browser's served fixture response was extended with that permission for QA only. No repository authorization or fixture file was changed. Initial locator/fixture setup retries are retained in temporary logs; successful evidence is `estimator-interact.log`, `estimator-matrix.log`, `preview-final.log`, and `preview-states.log`.

### Preservation, artifacts, and limits

Preservation snapshots, focused logs, browser screenshots, and `browser-summary.json` are under `/tmp/lisno-estimator-tier-details-qa`. Baseline hashes show no changes to earlier dirty files outside this task's documents, the additive OpenAPI/API-test edits, and the six-option test cleanup described above. Separate task-delta patches verify preservation of pre-existing edits in those three shared files. The initially deleted room accordion remains deleted. No temporary harness or screenshots were added to the repository.

Builds generated ignored `backend/dist/` and `frontend/dist/` outputs. Owned browser sessions were closed; the pre-existing Vite server was left running. No dependency, lockfile, migration, seed, live-data mutation, commit, push, or deployment was performed. No lint script exists. Unrelated full backend/frontend suites, mobile, and OCR checks were not run. Verification is local/synthetic, not a production smoke test.

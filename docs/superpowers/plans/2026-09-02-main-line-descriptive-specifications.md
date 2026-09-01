# Main Line Descriptive Specifications — Task Plan

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Specification:** [Main Line Descriptive Specifications Design](../specs/2026-09-02-main-line-descriptive-specifications-design.md)  
**Approved semantic change:** Specifications are descriptive requirement rows,
not dynamic component values or price dimensions.

## Objective

Replace the current typed Specification builder with a stable list of
Specification name and Brief description rows, remove Specification selection
from new prices, separate Overview Specifications from Pricing, and make
estimator Specification selection filter descriptive guidance only.

Preserve typed historical rows and immutable historical price-version
relationships without migration or data rewrite.

## Fixed cross-layer contract

- New Specification rows contain `id`, `name`, and optional/null
  `description` only.
- The visible controls are **Specification name** and **Brief description**.
- Component type, options, and generated value controls are removed for new and
  current editing.
- Existing typed rows remain accepted and retain hidden `type`, `options`, and
  `value` data when visible name/description fields are edited.
- New price append commands require `specificationId: null`.
- Historical reference commands may retain valid immutable price versions with
  non-null Specification IDs.
- Context `specificationId` filters descriptive guidance only and must not
  alter effective-price resolution.
- Overview Specifications show name and non-empty Brief description only;
  prices render separately.
- Existing routes, authorization, audit, CAS, paise calculations, tax lineage,
  effective windows, and immutable revision behavior remain unchanged.
- No migration, seed, bootstrap rewrite, dependency, deployment, commit, push,
  or production action is included.

## Initial dirty-worktree contract

Before writers start:

1. Capture `git status --short` and exact diffs for every proposed target.
2. Treat all current AI-estimator modifications and untracked files as user or
   previously approved work.
3. Record file ownership and do not assign overlapping dirty targets to
   concurrent writers.
4. Preserve the completed Mode consolidation, Vendors terminology, Overview
   configured-only behavior, dynamic Mode fields, CAS rebasing, reference
   metadata, and professional styling unless this approved contract explicitly
   changes Specification behavior.
5. Do not stage, revert, broadly reformat, or overwrite unrelated work.
6. Record the current full-suite baseline, including any unrelated intermittent
   backend failure, before final regression claims.

## Ownership boundaries

| Owner | Assigned areas | Must not change |
| --- | --- | --- |
| Primary contract owner | Shared semantic contract, compatibility decisions, documents, integration reconciliation | Unapproved data rewrite or production action |
| Backend implementation | Specification validation/contract, price append guard, context semantics, OpenAPI, backend tests | Frontend rendering, unrelated finance behavior |
| Frontend editor implementation | Descriptive row model/editor, price form removal, save lifecycle, focused tests | Backend, Overview consumer internals |
| Frontend Overview implementation | Overview Specifications/Pricing split, conflict labels, focused tests | Backend and editor internals |
| Integrity reviewer | Read-only identity, immutable-history, price, context, compatibility, privacy, CAS, and UX review | Product writes |
| Verification runner | Read-only integrated suites/builds/hygiene | Product writes |

For inline execution, the primary agent performs the implementation slices in
dependency order while preserving the same boundaries.

## Dependency-ordered tasks

### Task 1 — Reconcile current behavior and establish the baseline

1. Capture dirty status and per-target diffs.
2. Trace Specifications through:
   - frontend parser/builder/serialization;
   - Pricing section validation and PUT;
   - price append/reference materialization and scope keys;
   - revision-wide historical reference metadata;
   - estimator context validation/filtering/effective-price resolution;
   - Overview Specifications and price projections;
   - conflict review, duplication, activation, and read-only history.
3. Inventory every current assumption that `specificationId` is a price
   dimension.
4. Run the smallest current backend/frontend Specification, Pricing, Overview,
   and context suites as baseline evidence.

**Type:** Read-only.  
**Acceptance criteria:** AC 1–16.  
**Blocks:** Every writer task.

### Task 2 — Freeze the descriptive new-write and compatibility-read contract

1. Define the authoritative descriptive row as exact
   `{ id, name, description? }`.
2. Define how existing typed rows are parsed, rendered, and saved without
   losing hidden keys.
3. Keep stable row identity and normalized unique names.
4. Define new price append `specificationId: null` and historical reference
   compatibility.
5. Define context selection as guidance-only and Overview as descriptive-only.
6. Align exact user-facing labels and validation paths.

**Ownership:** Primary contract owner.  
**Likely areas:** backend shared contracts/domain constants and frontend narrow
Specification model types.  
**Depends on:** Task 1.  
**Acceptance criteria:** AC 1–3, 5–7, 9–15.

### Task 3 — Update backend validation and price-write integrity

1. Make the descriptive shape authoritative for new Specification writes while
   retaining exact typed-row compatibility.
2. Preserve row limits, stable ID uniqueness, normalized name uniqueness,
   description length, unknown-key rejection, and exact issue paths.
3. Reject a new price append command with non-null `specificationId`.
4. Continue accepting valid immutable reference commands whose stored price
   version has a historical non-null Specification ID.
5. Preserve historical removal protection and response-only reference state.
6. Confirm price scope keys and overlap checks remain correct when all new
   append commands use null Specification scope.
7. Add validation/service/replica-set tests for descriptive rows, typed
   compatibility, rejected new links, accepted historical references,
   rollback, CAS, audit, and asymmetric null-scope prices.

**Ownership:** Backend implementation.  
**Likely files:**
`backend/src/contracts/ai-estimator-knowledge.ts`,
`backend/src/domain/ai-estimator-knowledge-validation.ts`,
`backend/src/domain/ai-estimator-knowledge.ts`,
`backend/src/services/ai-estimator-knowledge-item.service.ts`, and focused
backend tests.  
**Depends on:** Task 2.  
**Can run in parallel with:** Task 5 after the shared contract is frozen.  
**Acceptance criteria:** AC 2, 5–8, 14–16.

### Task 4 — Decouple estimator context from price selection

1. Keep `specificationId` validation against saved descriptive rows when
   supplied.
2. Filter returned descriptive Specification guidance by the requested ID.
3. Remove `specificationId` from effective-price filtering.
4. Return safe name/brief-description fields without typed values/options or
   private Pricing notes.
5. Preserve historical price lineage presentation without treating it as a
   current selector.
6. Add asymmetric tests proving unequal Specification IDs produce identical
   effective-price resolution while guidance differs.
7. Update OpenAPI descriptions/examples and compatibility language.

**Ownership:** Backend implementation after Task 3 establishes the write
contract.  
**Likely files:**
`backend/src/services/ai-estimator-knowledge-context.service.ts`,
`backend/src/openapi/ai-estimator-knowledge.ts`, route/context/API-doc and
replica-set tests.  
**Depends on:** Tasks 2 and 3.  
**Acceptance criteria:** AC 7, 8, 12, 13, 15, 16.

### Task 5 — Replace the typed frontend builder with descriptive rows

1. Refactor the narrow frontend Specification model so new rows serialize only
   stable ID, name, and optional description.
2. Parse typed historical rows and preserve hidden typed keys across visible
   edits without exposing them.
3. Render **Specification name** and **Brief description** controls only.
4. Remove Component type, options editor, generated value controls, and
   incompatible-value notices from current Specification editing.
5. Preserve add, reorder, remove, read-only, validation focus, accessible
   names, and reference-based removal guidance.
6. Preserve the existing Vendors section, hidden Pricing keys, and all other
   Mode blocks.
7. Add focused model/editor tests for Plywood, Inner Laminate, Hardware,
   optional/blank descriptions, normalized duplicates, typed-row preservation,
   read-only, validation, and responsive wrapping.

**Ownership:** Frontend editor implementation.  
**Likely files:**
`knowledgeSpecificationConfiguration.ts/.test.ts`,
`KnowledgeSpecificationBuilder.tsx/.test.tsx`,
`KnowledgeSectionEditor.tsx`, and focused Pricing tests.  
**Depends on:** Task 2.  
**Can run in parallel with:** Task 3.  
**Acceptance criteria:** AC 1–5, 13–16.

### Task 6 — Remove Specification from new price-version authoring

1. Remove the Specification selector from append-mode price forms.
2. Ensure new append payloads always contain `specificationId: null` at the
   established API boundary.
3. Keep existing reference rows and resolved immutable price details readable.
4. Preserve replacement workflow, Vendor/UOM/Mode/tax/amount/date/status
   controls, quick-add behavior, and hidden reference IDs.
5. Map the backend rejection for stale clients to safe human-readable
   feedback without exposing private price fields.
6. Add same-mounted save–edit–save and payload-preservation tests with
   Specifications plus one historical referenced price.

**Ownership:** Frontend editor implementation.  
**Likely files:**
`KnowledgeSectionEditor.tsx`, `KnowledgeModePanel.tsx`, Pricing/Mode tests.  
**Depends on:** Tasks 3 and 5.  
**Acceptance criteria:** AC 4–8, 14–16.

### Task 7 — Separate Overview Specifications from Pricing

1. Rename the panel to **Specifications** and dropdown to **Specification**.
2. Project/display only Specification name and non-empty Brief description.
3. Remove typed value, price count, and matching price list from the selected
   Specification detail.
4. Render saved prices in a separate configured-only Pricing summary/list.
5. Do not group historical or new prices under a Specification.
6. Preserve empty omission, dropdown stable IDs, unsaved-change navigation
   guard, partial source-state handling, and private-data suppression.
7. Update conflict review to show descriptive fields only and keep price
   lineage separate.
8. Add asymmetric empty/populated/typed-compatibility/historical-price,
   accessibility, and responsive tests.

**Ownership:** Frontend Overview implementation.  
**Likely files:**
`knowledgeOverviewSummary.ts/.test.ts`,
`KnowledgeOverviewPanel.tsx/.test.tsx`,
`KnowledgeConflictReview.tsx/.test.tsx`, and focused screen tests.  
**Depends on:** Tasks 2 and 5; integrates after Task 6.  
**Acceptance criteria:** AC 5, 9–14, 16.

### Task 8 — Cross-layer integration and compatibility verification

Run focused checks first:

- backend Specification validation and route tests;
- item-service/replica-set append/reference/null-scope tests;
- context selected-guidance/unfiltered-price tests;
- OpenAPI exact-schema tests;
- frontend Specification model/builder tests;
- Pricing editor and Mode two-save lifecycle tests;
- Overview projection/render/conflict tests;
- Draft/read-only/unauthorized accessibility tests.

Inspect every failure against the initial dirty baseline and correct only
regressions introduced by the approved semantic change.

**Depends on:** Tasks 3–7.  
**Acceptance criteria:** AC 1–16.

### Task 9 — Integrity review

Perform an independent read-only review for:

- descriptive-name versus price-dimension leakage;
- new non-null Specification price links;
- loss or mutation of immutable historical price versions;
- typed-row compatibility data loss;
- price scope, overlap, paise, GST, and tax-lineage regressions;
- context still filtering price by Specification;
- Overview price grouping under Specifications;
- raw IDs/private Pricing notes in Overview or conflict review;
- CAS, partial-save, cache, permission, and read-only regressions;
- frontend/runtime/OpenAPI mismatch.

Resolve every confirmed finding and rerun affected checks.

**Depends on:** Task 8.  
**Acceptance criteria:** AC 4–16.

### Task 10 — Final verification and handoff

1. Run backend typecheck, full tests, build, and exact changed replica-set
   suites.
2. Run frontend typecheck, full tests, and build.
3. Run `git diff --check`, `git status --short`, and final relevant-diff review.
4. Verify rendered desktop/mobile interaction coverage for descriptive rows,
   price selector absence, Overview separation, validation, and read-only
   states; use an authenticated browser only if an environment is available.
5. Report exact counts, failures/isolated reruns, warnings, generated ignored
   artifacts, unrun checks, remaining risk, and external actions not performed.
6. Update the approved specification/task-plan status only after verified
   completion.

**Depends on:** Task 9.  
**Acceptance criteria:** AC 1–16.

## Parallel execution map

After Task 2 freezes the shared contract:

- Backend Tasks 3–4 may run in one backend-owned slice.
- Frontend Tasks 5–6 may run concurrently with the backend slice because they
  own separate workspaces and consume the frozen contract.
- Frontend Task 7 may run as a separate non-overlapping Overview slice after
  the frontend descriptive model is stable; shared screen tests require primary
  reconciliation.
- Integrity review and final verification are strictly sequential after all
  writers finish.

## Acceptance-criteria traceability

| Acceptance criterion | Primary evidence |
| --- | --- |
| AC 1–3: descriptive authoring | Frontend model/builder renders and payload assertions |
| AC 4: lifecycle | Mode save–edit–save with stable IDs/descriptions |
| AC 5: typed compatibility | Hidden-key preservation tests and Active history render |
| AC 6–7: price decoupling | Price form payload plus backend append/reference tests |
| AC 8: finance/history invariants | Replica-set price/tax/CAS/audit/rollback tests |
| AC 9–11: Overview | Projection/render/dropdown/empty/price-separation tests |
| AC 12: context | Unequal guidance with identical price resolution |
| AC 13–14: privacy/read-only | Conflict, history, permission, and accessibility tests |
| AC 15: contract alignment | Runtime validation, OpenAPI, frontend parser fixtures |
| AC 16: integrated health | Full suites, builds, replica tests, hygiene, rendered QA |

## Rollout and rollback checks

- Coordinate backend/frontend release so an old client cannot continue
  creating Specification-scoped prices.
- Run no migration or bootstrap rewrite.
- Confirm typed rows and historical price references still load before rollout.
- Confirm new append commands are null-scoped and context pricing ignores
  Specification before considering the rollout deployable.
- Roll back code only while retaining dual-read and historical fields; never
  strip or rewrite stored typed rows or immutable prices.

## Completion conditions

- All sixteen acceptance criteria have exact evidence or a precisely reported
  environment limitation.
- New Specifications are descriptive name/Brief-description rows only.
- New prices cannot be scoped by Specification.
- Historical typed rows and immutable price links remain readable and intact.
- Context guidance and effective-price resolution are correctly decoupled.
- No unresolved blocker/high/moderate integrity finding remains.
- No migration, seed, dependency installation, commit, stage, push,
  deployment, production write, or external action occurs.

## Completion record

- Tasks 1–8 completed across isolated backend, frontend editor, and frontend
  Overview ownership lanes; shared screen integration was reconciled by the
  primary owner.
- Task 9 completed through independent reciprocal cross-stack review because
  the orchestration environment had no remaining dedicated reviewer thread.
  Both reviews returned GO with no findings.
- Task 10 completed with focused suites, replica-set coverage, typechecks,
  builds, rendered accessibility/responsive checks, and repository hygiene.
- Focused results: backend 101/101 plus context replica-set 1/1; frontend
  descriptive Specification, Pricing, Overview, conflict, and integrated screen
  coverage 113/113.
- Standalone full-suite results: backend 2104/2106 and frontend 1420/1421. The
  two unrelated backend failures (a production-bootstrap timeout and a
  pre-existing authorization fixture 404) and the unrelated frontend dialog
  focus failure all passed on isolated rerun.
- Backend and frontend typechecks/builds passed. The frontend build retained
  the existing large-chunk advisory; Mongoose retained existing deprecation
  warnings.
- Authenticated live-browser QA was unavailable; rendered interaction,
  accessibility, read-only, conflict, and 320–1440 px responsive tests passed.
- No migration, seed, dependency installation, commit, stage, push,
  deployment, production write, or external action occurred.

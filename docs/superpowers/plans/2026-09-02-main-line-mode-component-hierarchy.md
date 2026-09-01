# Main Line Mode Component Hierarchy — Task Plan

**Status:** Completed — verified 2026-09-02
**Date:** 2026-09-02
**Specification:** [Main Line Mode Component Hierarchy Design](../specs/2026-09-02-main-line-mode-component-hierarchy-design.md)

## Objective

Replace saved Mode answers with definition-only component templates and add the
approved hierarchy:

- PMC → direct component definitions.
- Execution → required **Sub-Vendor / In-house** radio group → independent
  component definitions for the selected source.

Preserve immutable history, legacy values as hidden compatibility data,
stable IDs, Draft CAS/audit behavior, and all unrelated Mode/Pricing knowledge.

## Fixed implementation contract

- Canonical Mode identities are `pmc` and `execution`; no new reusable Mode
  master record is created or written.
- PMC configuration omits `executionSource`.
- Execution configuration requires `executionSource: "sub_vendor" |
  "in_house"`.
- One PMC, one Execution/Sub-Vendor, and one Execution/In-house configuration
  may coexist in the same revision.
- The Execution source control is a labelled native radio group with exact
  user-facing options **Sub-Vendor** and **In-house**.
- Canonical component fields contain exact `id`, `type`, `label`, and `options`
  keys. They contain no answer/default `value`.
- Existing stored values are compatibility-only: preserve by stable ID, reject
  new or changed legacy values, and exclude them from current UI, Overview,
  conflict review, and public context.
- Unscoped historical Execution configurations are never classified
  automatically; they appear in an explicit recovery workflow.
- Context may filter by Mode/source but returns definitions only.
- Existing Draft-only authorization, section and aggregate CAS, transaction,
  audit, activation, duplication, conflict, and cache behavior remains.
- No answer-entry screen or answer persistence is included.
- No migration, seed, bootstrap execution, dependency, commit, push,
  deployment, production write, or external action is included.

## Initial dirty-worktree contract

Before any writer starts:

1. Capture `git status --short`, current hash, and per-target diffs.
2. Treat every current AI Estimator modification and untracked file as user or
   previously approved work.
3. Record exact ownership before touching a dirty target; do not revert,
   stage, broadly reformat, or overwrite unrelated changes.
4. Preserve completed descriptive Specifications, Vendors terminology, Mode
   consolidation, Overview configured-only behavior, tab styling, and all
   Pricing/Quantity behavior unless this approved contract explicitly changes
   Mode component definitions.
5. Record focused and full-suite baseline results, including known unrelated
   intermittent backend/frontend failures.

## Ownership boundaries

| Owner | Assigned areas | Must not change |
| --- | --- | --- |
| Primary contract owner | Contract freeze, shared interpretation, documents, integration reconciliation | Product meaning or unapproved answer persistence |
| Backend implementation | Runtime contracts/validation, compatibility service, context, OpenAPI, backend tests | Frontend rendering or production data |
| Frontend implementation | Definition model/builder, Mode save UX, Overview/conflict projection, frontend tests/styles | Backend semantics or shared global primitives |
| Integrity reviewer | Read-only cross-stack review | Product sources |
| Verification runner | Read-only final verification and evidence | Product sources |

For mode A, backend and frontend implementation may run in parallel only after
Task 1 freezes the shared JSON contract. Frontend builder and Overview work
must remain in one ownership lane unless their file sets are proven
non-overlapping.

## Dependency-ordered tasks

### Task 1 — Capture baseline and freeze the shared contract

**Owner:** Primary contract owner
**Acceptance criteria:** AC 1–14 prerequisites

1. Capture dirty status and relevant target diffs.
2. Trace Mode definitions through parser, builder, Advanced PUT, transaction,
   context, Overview, conflict review, duplication, activation, and read-only
   history.
3. Freeze the canonical flat configuration shapes and exact issue paths.
4. Freeze legacy rules for `modeId`, missing `executionSource`, and `value`.
5. Confirm no current answer entity/consumer is silently repurposed.
6. Run current focused Mode/backend context suites as baseline.

**Blocks:** Every writer task.
**Stop/report:** A safe stable-ID compatibility path cannot be established, or
implementation would require a data migration.

### Task 2 — Implement backend definition/source contract

**Owner:** Backend implementation
**Depends on:** Task 1
**Can run in parallel with:** Tasks 4–5 in the frontend lane
**Acceptance criteria:** AC 1–9, 11–14

1. Update shared Mode configuration contracts/constants for
   `executionSource` and definition-only fields.
2. Validate exact configuration identity:
   - PMC with no source;
   - Execution with exactly one valid source;
   - uniqueness across PMC and each Execution source.
3. Validate component type, stable IDs, normalized labels, allowed options,
   counts, lengths, depth, and payload size without requiring `value`.
4. Add service-level previous-state compatibility:
   - match legacy valued rows by stable configuration/field IDs;
   - retain hidden stored values unchanged when definitions are edited;
   - reject new valued rows, legacy-to-valued promotion, or value mutation;
   - keep immutable revisions untouched.
5. Preserve legacy `modeId` read compatibility and explicit unscoped Execution
   recovery data without manufacturing a source.
6. Preserve Advanced-section transaction, section/aggregate CAS, audit,
   completeness, activation, duplication, rollback, and other payload keys.

**Likely files:**

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- Focused domain, validation, item-service, route, model, and replica-set tests

**Stop/report:** Enforcement requires rewriting Active history or introducing a
new collection/section/permission.

### Task 3 — Decouple public context from legacy Mode values

**Owner:** Backend implementation
**Depends on:** Task 2
**Acceptance criteria:** AC 7–9, 11–14

1. Add optional `executionSource` to context requests.
2. Require `modeKind=execution` when `executionSource` is supplied; reject all
   invalid combinations with exact safe errors.
3. Filter PMC, Sub-Vendor, and In-house definitions by exact canonical
   identity without cross-source leakage.
4. Allowlist only component ID, type, label, and options in public context.
5. Exclude stored historical `value`, raw legacy IDs, and private Advanced
   fields.
6. Keep price, tax, quantity, duration, recommendation, and quality resolution
   unchanged.
7. Update OpenAPI request/response schemas, descriptions, examples, and
   compatibility notes.
8. Add asymmetric context tests using distinct PMC/Sub-Vendor/In-house labels
   and options.

**Likely files:**

- `backend/src/routes/ai-estimator-knowledge-context.ts`
- `backend/src/services/ai-estimator-knowledge-context.service.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- Context, route, OpenAPI, authorization, and replica-set tests

### Task 4 — Refactor the frontend Mode model to definitions

**Owner:** Frontend implementation
**Depends on:** Task 1
**Can run in parallel with:** Tasks 2–3
**Acceptance criteria:** AC 1–9, 12–14

1. Extend the narrow frontend model with optional Execution source identity.
2. Remove `value` from canonical current fields.
3. Parse historical valued fields into hidden compatibility state, omit them
   from frontend writes, and rely on backend stable-ID rehydration to retain
   the unchanged stored value for the same legacy row.
4. Reject/flag malformed source combinations, duplicates, unbounded options,
   and unsupported fields without mutating the input.
5. Partition configurations into PMC, Sub-Vendor, In-house, and recovery
   buckets deterministically.
6. Keep explicit recovery for legacy reusable `modeId`, source collisions, and
   unscoped Execution rows.
7. Replace value-summary helpers with definition-summary projections.

**Likely files:**

- `frontend/src/features/ai-estimator-knowledge/knowledgeModeConfiguration.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- Pure model/parser/serializer tests

### Task 5 — Implement PMC and Execution hierarchy UI

**Owner:** Frontend implementation
**Depends on:** Task 4
**Acceptance criteria:** AC 1–8, 12–14

1. Keep the fixed PMC/Execution Mode dropdown.
2. Render direct **PMC components** without a source selector.
3. Under Execution, render a required `fieldset`/`legend` radio group with
   **Sub-Vendor** and **In-house**.
4. Preserve three independent unsaved buffers when switching Mode/source.
5. Render only Component type, Component label, and conditional Allowed
   options; remove all dynamic answer/default controls and value-cleared copy.
6. Preserve add, reorder, remove, validation focus, saving, second-save,
   discard, conflict, retry, and read-only behavior.
7. Implement explicit recovery actions for unscoped historical Execution
   configuration; never auto-assign it.
8. Keep Pricing, Quantity & margin, Specifications, Vendors, and hidden
   Advanced properties unchanged during every Mode save.
9. Update scoped responsive styles for 320, 390, 768, 1024, and 1440 px.

**Likely files:**

- `KnowledgeModeConfigurationBuilder.tsx` and focused tests
- `KnowledgeModePanel.tsx`
- Mode save/state/layout/screen integration tests
- Feature-local AI Estimator CSS only when required

### Task 6 — Update Overview and conflict/read-only projections

**Owner:** Frontend implementation
**Depends on:** Tasks 4–5
**Acceptance criteria:** AC 9–14

1. Overview shows configured definition metadata only.
2. PMC remains direct; Execution shows separate configured-only Sub-Vendor and
   In-house summaries.
3. Empty groups are omitted.
4. Component summaries contain label, type, and allowed options only.
5. Conflict review and read-only history suppress values and raw IDs.
6. Preserve Overview unsaved-navigation guards, partial source errors,
   selection identity, and private-data allowlists.
7. Add asymmetric populated/empty/legacy/malformed/accessibility tests.

**Likely files:**

- `knowledgeOverviewSummary.ts/.test.ts`
- `KnowledgeOverviewPanel.tsx/.test.tsx`
- `KnowledgeConflictReview.tsx/.test.tsx`
- `KnowledgeScreens.test.tsx`

### Task 7 — Cross-layer reconciliation

**Owner:** Primary contract owner
**Depends on:** Tasks 2–6
**Acceptance criteria:** AC 1–14

1. Reconcile frontend payloads with runtime validation and OpenAPI.
2. Confirm canonical writes contain no `value` or `modeId`.
3. Confirm legacy values are unchanged internally and absent publicly.
4. Confirm exact isolation across PMC/Sub-Vendor/In-house.
5. Confirm all Advanced/Pricing/Specifications/Vendors data survives Mode
   edits and partial saves.
6. Update shared integration fixtures and stale assertions without broad
   unrelated cleanup.

### Task 8 — Focused verification

**Owner:** Primary contract owner
**Depends on:** Task 7
**Acceptance criteria:** AC 1–14

Run focused checks first:

- backend Mode validation, routes, item service, context, OpenAPI;
- replica-set CAS/audit/rollback/history/context isolation;
- frontend parser/serializer and builder interaction;
- Mode same-mounted save–edit–save and three-buffer preservation;
- Overview/conflict/read-only/privacy;
- responsive keyboard and accessibility rendering.

Correct only regressions attributable to the approved hierarchy contract.

### Task 9 — Integrity review

**Owner:** Integrity reviewer
**Depends on:** Task 8

Perform an independent read-only review for:

- answer/default values entering or leaking from configuration;
- automatic legacy Execution source classification;
- PMC/Sub-Vendor/In-house crossover;
- loss or mutation of hidden historical values;
- stable-ID or revision-lineage breaks;
- Advanced/Pricing data loss;
- authorization, CAS, audit, rollback, cache, conflict, and read-only
  regressions;
- runtime/OpenAPI/frontend mismatches and raw/private data exposure.

Resolve every confirmed finding before final verification.

### Task 10 — Final verification and handoff

**Owner:** Verification runner, then primary contract owner
**Depends on:** Task 9
**Acceptance criteria:** AC 1–14

1. Backend typecheck, full tests, build, and exact changed replica-set suites.
2. Frontend typecheck, full tests, build, and rendered viewport/state matrix.
3. `git diff --check`, `git status --short`, and final relevant-diff review.
4. Report exact counts, warnings, flakes plus isolated reruns, unrun checks,
   generated artifacts, remaining risk, and external actions not performed.
5. Update the approved specification/task-plan status only after verified
   completion.

## Parallel execution map

After Task 1:

- Backend Tasks 2–3 form one backend-owned lane.
- Frontend Tasks 4–6 form one frontend-owned lane and may run concurrently
  with the backend lane.
- Task 7 integration, Task 8 focused checks, Task 9 integrity review, and Task
  10 final verification are sequential.

## Acceptance-criteria traceability

| Acceptance criterion | Primary evidence |
| --- | --- |
| AC 1–3: hierarchy | Builder Mode/source interactions and exact payload tests |
| AC 4: full lifecycle | Add/edit/reorder/remove plus same-mounted two-save integration |
| AC 5–6: component definitions only | Six-type rendering and absence of all value controls/keys |
| AC 7–9: write/privacy compatibility | Serializer, backend previous-state enforcement, public projection tests |
| AC 10: Overview | PMC direct, Execution source split, configured-only render tests |
| AC 11: context isolation | Asymmetric source-filtered context and replica-set tests |
| AC 12: workflow invariants | Draft/read-only/CAS/audit/conflict/cache tests |
| AC 13: non-regression | Pricing/Specifications/Vendors/quantity payload preservation |
| AC 14: integrated health | OpenAPI/runtime parity, full checks, responsive/a11y, hygiene |

## Completion conditions

- All fourteen acceptance criteria have exact evidence or a precisely reported
  environment limitation.
- PMC is direct and Execution is source-scoped through the required radio
  group.
- New writes contain definitions only and no answer/default value.
- Historical values remain unchanged internally and are never publicly
  projected.
- No unresolved blocker/high/moderate integrity finding remains.
- No migration, seed, bootstrap execution, dependency installation, commit,
  stage, push, deployment, production write, or external action occurs.

## Completion record

Tasks 1–10 are complete.

- The initial dirty-path set, HEAD, and focused baseline were captured before
  writers started; unrelated user and prior approved work was preserved.
- Backend and frontend implementation ran in non-overlapping ownership lanes,
  then passed integrated reconciliation.
- Final focused backend verification passed **105/105** tests across runtime
  validation, routes, item service, replica-set invariants, and OpenAPI.
- The complete frontend AI Estimator Knowledge feature suite passed
  **278/278** tests, including component lifecycle, same-mounted save/edit/save,
  three-buffer preservation, Overview, conflict, read-only, privacy,
  accessibility, keyboard, and responsive coverage.
- Backend and frontend typechecks and production builds passed. The existing
  Vite large-chunk advisory and Mongoose deprecation warnings remain.
- Independent cross-reviews found three contract gaps: activation of unresolved
  unscoped Execution recovery, permissive OpenAPI option shapes, and an invalid
  legacy-reference Move action. All three were fixed and both re-reviews
  returned **GO**.
- The full backend run passed **2103/2108**; all five unrelated timeout failures
  passed **39/39** in isolated reruns. The full frontend run passed
  **1419/1424**; all five unrelated timing/interference failures passed
  **49/49** in isolated reruns.
- `git diff --check` passed. Authenticated real-browser viewport QA was not run;
  rendered jsdom/axe/keyboard and 768/390/320 px layout coverage passed.
- No migration, seed, bootstrap execution, dependency change, stage, commit,
  push, deployment, production write, or external mutation was performed.

# Main Line Dynamic Specification Fields — Task Plan

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Specification:** [Main Line Dynamic Specification Fields Design](../specs/2026-09-02-main-line-dynamic-specification-fields-design.md)

## Objective

Extend each Pricing `specifications[]` row into one guided configurable
component—Text, Number, Radio, Checkbox, Dropdown, or Textarea—with a required
Label, optional Description, type-specific options, and a saved editable value.

Preserve each row's existing stable ID and stored `name` field so immutable
price-version relationships, selectors, context requests, conflict review, and
Overview continue to resolve by `specificationId`. Support legacy
`{ id, name, description? }` rows without migration and promote them only after
an explicit Super Admin type choice.

No production migration, seed, bootstrap, deployment, commit, push, dependency
installation, or destructive data action is included.

## Fixed contract

- One Specification row equals one configurable component; no nested field
  collection is introduced.
- The visible **Label** persists in the existing `name` property.
- `id` remains the sole identity and price-reference key.
- Canonical field types are exactly `text`, `textarea`, `number`, `radio`,
  `dropdown`, and `checkbox`.
- Canonical rows contain `id`, `name`, optional/nullable `description`, `type`,
  `options`, and `value`.
- Legacy rows contain only `id`, `name`, and optional/nullable `description`.
- A legacy row becomes canonical only after an explicit type selection.
- Number values are canonical decimal strings and do not participate in
  financial calculations.
- Radio/Dropdown values are null or one configured option; Checkbox values are
  explicit booleans, including `false`.
- `priceEntries[].specificationId`, endpoints, permissions, audit action,
  section CAS, aggregate CAS, and Draft-only mutation remain unchanged.
- Existing hidden Pricing keys and immutable price commands must survive every
  Specification edit.
- A referenced Specification cannot be removed into a dangling state.
- Overview remains configured-only and read-only.

## Initial dirty-worktree contract

Before any writer starts:

1. Capture `git status --short` and the current relevant per-target diffs.
2. Treat all existing AI-estimator modifications and untracked files as user or
   previously approved work.
3. Record ownership before assigning a dirty file.
4. Do not stage, revert, broadly reformat, or overwrite unrelated changes.
5. Preserve the recently implemented authoritative section mutation envelope,
   non-blocking post-save refresh, Mode fixed choices, removed tabs/fields,
   Overview omission rules, and professional workspace styling.
6. Record the known stale full-frontend seven-tab assertion and any unrelated
   full-backend contention failure as baseline evidence; do not silently claim
   they pass.

## Ownership boundaries

| Owner | Assigned areas | Must not change |
| --- | --- | --- |
| Primary contract owner | Approved spec/plan, flat row contract, cross-layer reconciliation, final integration | Unrelated product behavior, production data |
| Backend validation owner | Specification contract/domain validation, exact error paths, focused validation tests | Frontend, pricing transaction orchestration |
| Backend pricing/reference owner | Price-reference integrity, context/public sanitization, OpenAPI, service/integration tests | Frontend rendering, unrelated finance formulas |
| Frontend builder owner | Specification model/parser/builder, Pricing editor integration, post-save interactions, focused tests | Backend, Overview projection |
| Frontend Overview owner | Selectors, conflict labels, configured-only Overview projection/rendering, responsive/a11y tests | Backend validation, builder internals |
| Integrity reviewer | Read-only contract, lineage, finance, CAS, cache, compatibility, and UX review | Product writes |
| Verification runner | Read-only integrated tests/builds/browser checks | Product writes |

For execution mode B, the primary agent performs these tasks inline while
preserving the same subsystem boundaries.

## Dependency-ordered tasks

### Task 1 — Reconcile current implementation and capture the baseline

1. Capture the dirty path set and exact diffs for all proposed targets.
2. Trace current Specification lifecycle through:
   - Pricing `specifications[]` editor and local validation;
   - section PUT and authoritative mutation response;
   - backend strict Pricing validation;
   - price append/reference materialization;
   - `specificationId` context validation and public sanitization;
   - price selector and conflict review labels;
   - Overview projection/dropdown/details;
   - Draft duplication, Active immutability, and tests.
3. Inventory every place that reads `specification.name`, assumes the legacy
   exact row shape, or resolves a Specification by ID.
4. Re-run the smallest relevant frontend/backend tests to establish a baseline.

**Type:** Read-only.  
**Acceptance criteria covered:** Evidence for AC 1–16.  
**Blocks:** Every writer task.

### Task 2 — Freeze the shared dual-shape Specification contract

1. Define a backend/public Specification field-type enum aligned with the six
   approved values. Reuse established constants only when that does not couple
   Specification identity to Mode identity.
2. Define exact legacy and canonical row types.
3. Define type-specific option/value rules, limits, nullable behavior, and
   normalized Label uniqueness.
4. Define frontend aligned types and display labels.
5. Keep `name` as persisted Label and `id` as stable identity.
6. Document that Description is presentation/help text and value is
   non-financial metadata.

**Primary ownership:** Primary contract owner with backend/frontend consumer
updates delegated only after the shape is frozen.  
**Likely affected areas:**
`backend/src/contracts/ai-estimator-knowledge.ts`,
`backend/src/domain/ai-estimator-knowledge.ts`, frontend knowledge types or a
narrow Specification module.  
**Depends on:** Task 1.  
**Acceptance criteria covered:** AC 1–3, 8, 9, 14.

### Task 3 — Add backend dual-shape validation

1. Split Specification validation from the existing shared
   Specifications/Brands row loop so Brand behavior remains unchanged.
2. Accept the exact legacy shape and the exact canonical shape.
3. Reject ambiguous/partial shapes, unknown keys, unknown types, malformed or
   duplicate IDs, normalized duplicate Labels, invalid descriptions, malformed
   number strings, irrelevant options, missing/duplicate/blank choice options,
   invalid choices, and non-boolean Checkbox values.
4. Preserve global section byte, nesting, array, text, and safe-number limits.
5. Return exact `payload.specifications.<index>...` issue paths suitable for
   frontend field association.
6. Add asymmetric tests for all six types, `false`, zero/negative/decimal number
   strings as permitted by the canonical decimal contract, limits, legacy rows,
   and mixed legacy/canonical arrays.

**Ownership:** Backend validation owner.  
**Likely affected areas:**
`backend/src/domain/ai-estimator-knowledge-validation.ts`, contract/domain
tests, validation tests.  
**Depends on:** Task 2.  
**Can run in parallel with:** Task 5.  
**Acceptance criteria covered:** AC 1–3, 7, 8, 14–16.

### Task 4 — Preserve price-reference integrity and public projections

1. Keep append-command validation by stable Specification ID.
2. Resolve reference commands to their stored immutable price versions and
   reject removal of a Specification still referenced within the revision.
3. Preserve transactional CAS, audit, versioning, paise calculations, tax
   lineage, effective windows, and reference-only immutable commands.
4. Ensure renaming, description edits, type/value edits, and explicit legacy
   promotion do not alter `specificationId` or price scope keys.
5. Extend context/public sanitization to return safe Label, Description, type,
   options, and saved value while continuing to exclude private vendor notes.
6. Preserve exact `specificationId` request validation and prevent unmatched
   Specification leakage.
7. Update OpenAPI schemas/examples for both shapes and ensure GET/PUT mutation
   envelope contracts remain distinct and aligned.
8. Add service and replica-set tests for referenced removal rejection,
   unreferenced removal, immutable reference commands, rename/value edit with
   stable scope, context selection, duplication, Active history, and rollback
   on failure.

**Ownership:** Backend pricing/reference owner.  
**Likely affected areas:**
`backend/src/services/ai-estimator-knowledge-item.service.ts`,
`backend/src/services/ai-estimator-knowledge-context.service.ts`, OpenAPI,
focused service/context/route/integration tests.  
**Depends on:** Tasks 2 and 3.  
**Acceptance criteria covered:** AC 4, 8, 9, 12–16.

### Task 5 — Build the frontend Specification model and guided builder

1. Create a narrow parser/model for legacy and canonical Specification rows
   without mutating cached server payloads.
2. Add factories for stable canonical rows and type-correct default values.
3. Render the six component choices using the established design-system
   controls and Mode-compatible behavior where appropriate.
4. Render required **Label**, optional **Description**, options editor for
   Radio/Dropdown, and the generated value control.
5. Use Description as associated help text for the generated value field.
6. Preserve stable IDs, ordering, other rows, and all unrelated Pricing payload
   keys on every edit.
7. Handle incompatible type/option changes with explicit clearing notices.
8. Map client/server issue paths to exact controls and focus the first issue on
   save attempt.
9. Render legacy rows without automatic conversion and require explicit type
   choice to promote them.
10. Add focused model/builder tests for all types, descriptions, options,
    `false`, canonical decimals, ordering/removal, legacy promotion, invalid
    data recovery, and read-only states.

**Ownership:** Frontend builder owner.  
**Likely affected areas:** a new narrow Specification module/builder plus
focused tests and existing form primitives only as consumers.  
**Depends on:** Task 2.  
**Can run in parallel with:** Task 3.  
**Acceptance criteria covered:** AC 1–3, 6–8, 13–15.

### Task 6 — Integrate the builder with Pricing and Mode saves

1. Replace the legacy Name/Description row UI in the Specifications repeater
   with the guided builder while leaving Brands and Price versions unchanged.
2. Keep **Add specification**, reorder, and removal keyboard behavior.
3. Disable removal with human-readable guidance when the row is referenced by
   a current price entry/version; backend rejection remains authoritative.
4. Keep price selectors displaying the Specification Label while storing the
   stable ID.
5. Preserve hidden Pricing keys and immutable price-version data when only a
   Specification changes.
6. Reuse the single **Save Mode** action and authoritative Pricing section plus
   aggregate CAS rebasing.
7. Exercise same-mounted save–edit–save with cache noise, stable IDs, another
   Specification, immutable price commands, and another dirty Mode block.
8. Preserve local buffers on validation, network, partial-save, conflict, and
   secondary-invalidation delays.
9. Preserve Draft/read-only/archived permission behavior and unsaved navigation
   guards.

**Ownership:** Frontend builder owner after Task 5.  
**Likely affected areas:**
`KnowledgeSectionEditor.tsx`, `KnowledgeModePanel.tsx` only if orchestration
needs a Specification-specific hook, Pricing/Mode/workspace tests.  
**Depends on:** Tasks 3–5.  
**Acceptance criteria covered:** AC 1–9, 13–16.

### Task 7 — Update Overview, conflict review, and label consumers

1. Resolve labels as canonical/legacy `name` with stable ID identity.
2. Project canonical type/value/Description without treating `false` or valid
   zero-like number strings as empty.
3. Keep the configured-only Specifications dropdown and omit blank optional
   details.
4. Display the selected non-empty Label, Description, formatted value, and
   matching price entries.
5. Continue omitting the whole block when no saved Specification or matching
   price entry exists.
6. Ensure conflict review and immutable price details show human labels and
   values without raw stable IDs or private notes.
7. Preserve **Open Mode** navigation and the unsaved-change guard.
8. Add asymmetric canonical/legacy, empty/populated, `false`, number, missing
   label recovery, unmatched price, and partial-source-error tests.

**Ownership:** Frontend Overview owner.  
**Likely affected areas:**
`knowledgeOverviewSummary.ts/.test.ts`,
`KnowledgeOverviewPanel.tsx/.test.tsx`, `KnowledgeConflictReview.tsx`, focused
screen tests.  
**Depends on:** Tasks 2 and 5; final integration depends on Task 6.  
**Acceptance criteria covered:** AC 9–12, 14–16.

### Task 8 — Apply responsive and accessibility polish

1. Reuse the established Mode/Pricing visual hierarchy and avoid nested raw
   data or JSON presentation.
2. Align type, Label, Description, options, value, and row actions at desktop
   widths and stack them predictably at tablet/mobile widths.
3. Verify accessible names, help/error association, radio group semantics,
   Checkbox state, keyboard reorder/remove actions, focus restoration, touch
   targets, and visible focus.
4. Cover empty, long-label/description, maximum-option, saving, validation,
   conflict, and read-only render states.
5. Do not change shared primitives unless a demonstrated primitive defect
   blocks the approved behavior.

**Ownership:** Frontend builder/Overview owners in non-overlapping component and
test files; primary agent reconciles shared CSS.  
**Likely affected areas:** AI-estimator feature CSS and layout/a11y tests.  
**Depends on:** Tasks 5–7.  
**Acceptance criteria covered:** AC 1–3, 10, 13, 15, 16.

### Task 9 — Focused cross-layer verification

Run the smallest relevant checks first:

- Backend Specification/domain validation tests.
- Backend price materialization, context, route, OpenAPI, and replica-set
  reference tests.
- Frontend Specification model/builder tests.
- Pricing editor, Mode panel, Overview projection/render, conflict review, and
  workspace interaction tests.
- Backend and frontend typechecks.
- `git diff --check` and targeted final-diff review.

Correct only regressions caused by the approved work. Record unrelated dirty
suite failures precisely.

**Depends on:** Tasks 3–8.  
**Acceptance criteria covered:** AC 1–16.

### Task 10 — Integrity review

Run an independent read-only review of the integrated diff for:

- stable-ID versus Label identity drift;
- legacy/canonical ambiguity or silent conversion;
- dangling or cross-revision price references;
- immutable price-version, tax, paise, and scope-key changes;
- Draft/Active leakage;
- CAS, partial-save, conflict, audit, and cache races;
- hidden Pricing payload loss;
- Checkbox `false`/number-zero omission;
- context/Overview data leakage;
- authorization/read-only drift;
- OpenAPI/runtime/frontend mismatch;
- responsive and accessibility regressions.

Resolve every confirmed defect and rerun the affected checks.

**Depends on:** Task 9.  
**Acceptance criteria covered:** AC 4–16.

### Task 11 — Final verification and rendered QA

After all writers and integrity fixes finish:

1. Run backend typecheck, full backend tests, and build.
2. Run frontend typecheck, full frontend tests, and build.
3. Run exact applicable AI-estimator replica-set tests.
4. Run `git diff --check` and `git status --short`.
5. Inspect the final relevant diff against the initial dirty baseline.
6. In an available authenticated browser, verify representative desktop,
   tablet, and mobile widths for:
   - all six component types;
   - Label, Description, options, and value editing;
   - first save and same-mounted second save;
   - legacy promotion;
   - referenced removal guidance;
   - Overview configured-only details;
   - validation/focus, long content, no horizontal overflow, and read-only
     history.
7. If a browser runtime is unavailable, report the limitation and rely on
   rendered interaction/accessibility tests without claiming visual QA passed.
8. Report exact commands, counts, failures, warnings, unrun checks, ignored
   build artifacts, and remaining risks.

**Depends on:** Task 10.  
**Acceptance criteria covered:** AC 1–16.

## Parallel execution map

After Task 2 freezes the contract:

- **Backend Slice A:** Task 3, validation and exact-path tests.
- **Frontend Slice A:** Task 5, model/builder and focused tests.

These slices can run concurrently because they own separate workspaces and use
the frozen contract.

Then:

- **Backend Slice B:** Task 4, service/reference/context/OpenAPI integration.
- **Frontend Slice B:** Task 6, Pricing/Mode integration.
- **Frontend Slice C:** Task 7 may start after the Task 5 public frontend model
  is stable, with explicit non-overlap from Task 6.

Shared frontend CSS and route-level screen tests require primary-agent
reconciliation. Integrity review and final verification are sequential after
all writers finish.

## Verification matrix

| Acceptance criterion | Primary evidence |
| --- | --- |
| AC 1: six component types | Backend enum/validation and rendered builder interactions |
| AC 2: Label/Description/value | Builder payload and accessible help-text assertions |
| AC 3: type-specific validation | Exact backend paths plus frontend first-error focus |
| AC 4: preservation | Mutation payload, persisted section, hidden keys, immutable price commands |
| AC 5: edit after save | Same-mounted save–edit–save with returned section/aggregate CAS |
| AC 6: local buffers | Multi-row switching, partial failure, discard/navigation tests |
| AC 7: incompatible changes | Type/option clearing notice tests |
| AC 8: legacy compatibility | Dual-shape validation, render, explicit promotion, Active history |
| AC 9: stable price references | Service/replica tests and selector/removal interactions |
| AC 10: Overview details | Canonical/legacy projection and configured-only dropdown tests |
| AC 11: empty omission | Empty/null/price-only Overview tests |
| AC 12: context/conflict/history | Context, conflict review, duplication, read-only assertions |
| AC 13: permissions/immutability | Asymmetric Draft/Active/archived/unauthorized screen and route tests |
| AC 14: contract alignment | Runtime validation, OpenAPI, API type, parser fixtures |
| AC 15: coverage matrix | Focused unit/integration/rendered/a11y/responsive suites |
| AC 16: integrated health | Typechecks, full suites, builds, replica tests, browser QA, hygiene |

## Rollout and rollback checks

- Deploy backend dual-read support before any canonical frontend write is
  considered deployable.
- Do not run a migration or bootstrap rewrite.
- Confirm legacy rows remain valid after backend rollout.
- Confirm canonical rows remain readable by the deployed frontend version;
  older frontend versions cannot safely edit unknown canonical keys, so
  backend-first alone is necessary but not sufficient for a mixed-version edit
  window. The rollout must prevent old clients from overwriting canonical rows
  or use the existing single-admin deployment coordination.
- Rollback is code-only while canonical dual-read support remains deployed; do
  not strip canonical keys or rewrite saved values.

## Completion conditions

- All sixteen acceptance criteria have exact evidence or an explicitly reported
  environment limitation.
- All six Specification component types save and remain editable.
- Labels, descriptions, values, legacy rows, and stable price references remain
  correct across Draft, Overview, context, conflict, duplicate, and history.
- No unresolved high/moderate integrity finding remains.
- No production mutation, migration, seed, dependency installation, commit,
  push, or deployment has occurred.

## Execution outcome

- Execution mode A completed with bounded backend, frontend builder, frontend
  Overview, integrity-review, and verification ownership.
- Integrity review returned GO with no unresolved blocker, high, or moderate
  finding.
- Focused backend verification passed 98/98 tests; focused frontend
  verification passed 145/145 tests.
- Backend and frontend typechecks and builds passed; the frontend full suite
  passed 1416/1416 tests.
- The backend full suite passed 2102/2103 tests. Its sole unrelated Estimate
  Design failure passed 1/1 in immediate isolation and is recorded as suite
  contention rather than a deterministic Specification regression.
- `git diff --check` passed. Verification produced no tracked changes.
- Live browser QA was unavailable because no authenticated local app/server was
  running; rendered interaction, axe accessibility, and responsive layout
  coverage passed.
- No migration, seed, dependency installation, commit, push, deployment, or
  external production action was performed.

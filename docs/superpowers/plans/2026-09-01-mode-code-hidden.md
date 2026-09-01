# Main Line Mode Tab-Local Choices — Task Plan

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-01  
**Specification:** [Main Line Mode Tab-Local Choices Design](../specs/2026-09-01-mode-code-hidden-design.md)

## Objective

Replace the Main Line dynamic Mode builder’s reusable-master dependency with
fixed PMC/Execution choices owned by the Mode tab. New configurations persist
the closed semantic `modeKind` enum, while existing saved `modeId`
configurations remain readable and convert only on a user-initiated save.

Keep the saved PMC and Execution fields editable for the lifetime of the same
Draft. Every successful save must rebase the local section and aggregate CAS
versions so a Super Admin can edit the saved fields and save again without a
reload, duplicate configuration, or lost Mode data.

Remove Modes from the Super Admin reusable-values UI and remove all missing
reusable Mode warnings and quick-add actions from the Mode tab.

No production migration, seed, bootstrap, backfill, deployment, commit, push,
or destructive data operation is included.

## Fixed contract

- Canonical kinds are exactly `pmc` and `execution`.
- Display labels are exactly **PMC** and **Execution**.
- Canonical dynamic configurations contain `modeKind`, never reusable
  `modeId`.
- Legacy configurations may contain `modeId` during compatibility, but cannot
  contain both fields.
- Configuration and field IDs remain opaque, stable IDs.
- New canonical configurations are independent of Mode-master existence,
  activation, archive, pagination, or query availability.
- Existing price-version and generic historical `modeId` lineage remains
  compatible and is not rewritten.
- Draft-only mutation, Active immutability, section/aggregate CAS, ordered Mode
  save, conflict review, audit, and permission behavior remain unchanged.
- A successful Mode save returns the authoritative section and aggregate state;
  the editor stays mounted and editable, and the next save uses those refreshed
  CAS versions.

## Initial dirty-worktree contract

Before writers start:

1. Capture `git status --short`.
2. Record the current per-target diffs for every assigned file.
3. Treat the just-completed Mode-code-hiding changes and all earlier AI
   estimator changes as existing work that must be preserved or deliberately
   superseded by this approved design.
4. Do not stage, revert, reformat, or rewrite unrelated paths.
5. Do not assign a dirty target until its current changes are understood and
   ownership is explicit.

## Ownership boundaries

| Owner | Assigned areas | Must not change |
| --- | --- | --- |
| Primary contract owner | Approved spec/plan, cross-layer `modeKind` contract, rollout compatibility, final integration | Unrelated product behavior or production data |
| Backend validation owner | Backend contracts, domain section validation, validation tests | Frontend, context orchestration, persistence migration |
| Backend context/reference owner | Context route/service, item reference checks, archive compatibility, OpenAPI, integration tests | Frontend UI, unrelated master behavior |
| Frontend Mode owner | Dynamic Mode parser/model/builder/panel and focused tests | Backend, reusable-values page, unrelated tabs |
| Frontend reusable/Overview owner | Reusable-values navigation, Overview projection/selector, focused tests | Backend contracts, dynamic builder internals |
| Integrity reviewer | Read-only contract, lineage, compatibility, race, cache, and UX review | Product writes |
| Verification runner | Read-only integrated commands and browser QA | Product writes |

For execution mode B, the primary agent performs the same tasks inline while
preserving these subsystem boundaries.

## Dependency-ordered tasks

### Task 1 — Reconcile the existing implementation and baseline

1. Capture the dirty path set and target diffs.
2. Trace the current dynamic configuration path from frontend builder to
   Advanced payload, backend validation, reference checks, context filtering,
   archive protection, Overview projection, and tests.
3. Inventory every user-visible reusable Mode entry point:
   - reusable-values desktop tabs and mobile selector;
   - Add/Edit/Archive Mode dialogs;
   - Mode-tab **Add reusable Mode** action;
   - missing/ambiguous/inactive reusable Mode messages.
4. Inventory generic/historical Mode uses that must remain compatible,
   especially price versions and legacy context requests.
5. Record the known unrelated full-frontend stale seven-tab assertion as
   baseline evidence; do not silently fold it into this feature unless it blocks
   accurate final verification.

**Type:** Read-only.  
**Acceptance criteria covered:** Establishes evidence for AC 1–16.  
**Blocks:** Every writer task.

### Task 2 — Establish the shared `modeKind` contract

1. Define a backend/public closed enum for `pmc` and `execution` in the existing
   AI-estimator knowledge contract/domain boundary.
2. Define the aligned frontend type and fixed label/options map.
3. Specify the canonical dynamic configuration shape:
   `{ id, modeKind, fields }`.
4. Specify the legacy shape:
   `{ id, modeId, fields }`.
5. Enforce exactly one identity field for compatibility parsing and backend
   validation.
6. Keep `modeId` contracts used by immutable price versions and other generic
   historical relationships unchanged.

**Primary ownership:** Primary contract owner with exact consumer updates
delegated after the shape is frozen.  
**Likely affected areas:**
`backend/src/contracts/ai-estimator-knowledge.ts`,
`backend/src/domain/ai-estimator-knowledge.ts`, frontend knowledge types or a
narrow Mode configuration module.  
**Depends on:** Task 1.  
**Acceptance criteria covered:** AC 5, 6, 12, 13.

### Task 3 — Update backend section validation

1. Extend strict validation for `modeConfigurations[]` to accept:
   - canonical `modeKind`, or
   - legacy `modeId`.
2. Reject both-present, neither-present, unknown kind, duplicate canonical kind,
   duplicate legacy ID, unknown keys, malformed IDs, invalid fields, and
   existing value/option violations with exact paths.
3. Keep canonical kind uniqueness separate from legacy ID uniqueness.
4. Preserve unrelated Advanced keys and all existing section size/count limits.
5. Add asymmetric domain tests containing PMC and Execution with unequal IDs,
   fields, and values.

**Ownership:** Backend validation owner.  
**Likely affected areas:**
`backend/src/domain/ai-estimator-knowledge-validation.ts`, contract/domain tests.  
**Depends on:** Task 2.  
**Acceptance criteria covered:** AC 5, 6, 8, 14, 16.

### Task 4 — Separate canonical configurations from reusable references

1. Update Draft section-save reference collection so canonical `modeKind`
   configurations do not query `AiEstimatorKnowledgeModeModel`.
2. Continue validating active references for legacy `modeId` configurations.
3. Exclude canonical configurations from Mode-master archive blockers and
   dependency-epoch coordination.
4. Retain legacy archive protection and the existing archive/reference race
   safety.
5. Ensure canonical saves work with zero Mode-master documents and when the
   Mode collection query path would otherwise fail.
6. Add service and replica-set coverage for:
   - canonical save with no Mode masters;
   - legacy active reference;
   - legacy missing/inactive reference rejection;
   - canonical config not blocking archive;
   - legacy config still blocking archive;
   - no dangling legacy reference in both transaction commit orders.

**Ownership:** Backend context/reference owner.  
**Likely affected areas:**
`backend/src/services/ai-estimator-knowledge-item.service.ts`,
`backend/src/services/ai-estimator-knowledge-reference.service.ts`, focused
service and replica-set tests.  
**Depends on:** Tasks 2 and 3.  
**Acceptance criteria covered:** AC 3, 5, 7–9, 13, 14, 16.

### Task 5 — Add exact canonical context filtering

1. Add optional `modeKind` to context/preview request contracts and route
   schemas where dynamic Mode selection is supported.
2. Reject requests containing both `modeKind` and `modeId`.
3. Filter canonical dynamic configurations by exact `modeKind`.
4. Retain `modeId` filtering for legacy configurations and generic established
   relationships during compatibility.
5. Do not require a Mode-master lookup for `modeKind` requests.
6. Add asymmetric PMC/Execution tests proving no cross-mode leakage, no Draft
   leakage into Active context, and correct legacy behavior.
7. Update OpenAPI schemas/examples and route-operation inventory only as needed;
   do not add a new permission or endpoint.

**Ownership:** Backend context/reference owner after Task 4 file ownership is
reconciled.  
**Likely affected areas:** context route/service, OpenAPI knowledge schemas,
route/service/OpenAPI tests.  
**Depends on:** Tasks 2 and 3.  
**Acceptance criteria covered:** AC 6, 9, 12, 14, 16.

### Task 6 — Build the frontend dual-shape parser and converter

1. Replace the dynamic configuration model’s canonical ownership field with
   `modeKind`.
2. Parse canonical configurations directly.
3. Parse legacy `modeId` records without discarding fields or stable IDs.
4. Resolve legacy IDs to PMC/Execution only when the existing master data proves
   the canonical mapping.
5. Represent an unresolvable legacy record explicitly and preserve its fields.
6. On a successful editable save, serialize resolved legacy configurations as
   canonical `modeKind` and omit `modeId`.
7. Never rewrite Active/read-only revisions or mutate cached server data during
   parsing.
8. Remove the compatibility-code derivation helper introduced by the superseded
   UI-only implementation if it no longer has a live caller.
9. Add focused unit tests for canonical round-trip, resolved legacy conversion,
   unresolved preservation/removal, mixed canonical/legacy input, duplicate
   detection, strict fields, and unrelated Advanced-key preservation.

**Ownership:** Frontend Mode owner.  
**Likely affected areas:**
`knowledgeModeConfiguration.ts/.test.ts`, aligned frontend types.  
**Depends on:** Task 2.  
**Acceptance criteria covered:** AC 5–9, 11, 14, 15.

### Task 7 — Replace the builder catalog dependency with fixed choices

1. Render exactly PMC and Execution from the fixed options map.
2. Remove canonical reusable-master loading, missing, inactive, ambiguous, and
   archive recovery states.
3. Remove **Required reusable Modes are unavailable**, **Execution is missing**,
   **Add reusable Mode**, and the quick-add callback/action.
4. Keep canonical choices usable when the modes catalog is empty, fails, or is
   never requested.
5. Preserve all six field types, labels/options/values, add/edit/reorder/remove,
   unsaved switching, validation mapping, read-only behavior, and existing Mode
   save orchestration.
6. Show unresolved legacy configurations as secondary recovery items without
   exposing raw IDs or Code and without blocking canonical PMC/Execution work.
7. Update accessible labels and help copy to describe tab-local Mode choices.

**Ownership:** Frontend Mode owner.  
**Likely affected areas:**
`KnowledgeModeConfigurationBuilder.tsx/.test.tsx`, `KnowledgeModePanel.tsx`,
section-state and layout tests.  
**Depends on:** Task 6.  
**Acceptance criteria covered:** AC 1–3, 5–9, 14, 15.

### Task 8 — Remove reusable Mode management UI

1. Remove Modes from reusable-values desktop tabs and the mobile category
   selector.
2. Remove reachable Add/Edit/Archive Mode flows from that page.
3. Keep UOMs, Vendors, Taxes, Priorities, and Surfaces unchanged, including Code
   behavior and list transitions.
4. Remove superseded Mode-specific dialog/list compatibility logic and tests
   introduced by the prior interpretation when it is no longer reachable or
   required.
5. Keep generic backend Mode routes/models untouched for compatibility.
6. Add rendered navigation tests proving the exact five categories and absence
   of Mode actions at desktop/mobile widths.

**Ownership:** Frontend reusable/Overview owner.  
**Likely affected areas:**
`KnowledgeReusableValuesPage.tsx`, `KnowledgeMasterEditorDialog.tsx`, focused
reusable-value tests.  
**Depends on:** Task 2; may run in parallel with Tasks 3 and 6.  
**Acceptance criteria covered:** AC 2, 10, 15.

### Task 9 — Convert Overview to fixed Mode kinds

1. Project dynamic summaries by canonical `modeKind` rather than reusable
   master ID.
2. Render fixed PMC/Execution labels without a master-catalog prerequisite.
3. Display only saved, non-empty values for the selected kind.
4. Preserve false checkbox values as **No** and existing number/text formatting.
5. Resolve legacy configurations through the compatibility adapter and retain
   safe unavailable-state treatment for unresolved history.
6. Keep Overview editing controls, other summary groups, loading/partial-error
   states, and configured-only omission behavior unchanged.
7. Add asymmetric PMC/Execution summary tests and catalog-empty/failure tests.

**Ownership:** Frontend reusable/Overview owner after Task 8 conflicts are
reconciled.  
**Likely affected areas:**
`knowledgeOverviewSummary.ts/.test.ts`, `KnowledgeOverviewPanel.tsx/.test.tsx`.  
**Depends on:** Task 6.  
**Acceptance criteria covered:** AC 3, 6–9, 11, 15.

### Task 10 — Integrate save, cache, and compatibility behavior

1. Confirm ordered Mode save still writes dirty backend sections only once and
   preserves section/aggregate expected versions.
2. Confirm resolved legacy conversion happens only in the user’s submitted
   payload and only after a successful save response becomes authoritative.
3. After each successful block save, rebase that block from the returned
   authoritative envelope, clear only its dirty state, and advance the aggregate
   version used by later blocks and later save cycles.
4. Keep PMC and Execution field definitions and saved values editable after the
   save completes while the revision remains a Draft.
5. Exercise a complete save–edit–save sequence in the same mounted Mode panel:
   the second request must use the first response's section version and the
   latest aggregate version, update the existing stable configuration/field IDs,
   and preserve the other Mode's saved fields.
6. Preserve local buffers on validation, network, partial-save, and conflict
   failures.
7. Ensure no reusable Mode master query invalidation is required for canonical
   field saves.
8. Preserve unrelated master-query invalidation for UOM/Surface quick-add.
9. Add route-level tests for clean/dirty/saving/error/conflict/read-only/archive
   states with fixed PMC/Execution choices, including post-save editability and
   a second successful save without remounting.

**Ownership:** Primary integrator plus Frontend Mode owner.  
**Likely affected areas:** Mode panel/workspace screen tests, mutation-sync tests
only when behavior actually changes.  
**Depends on:** Tasks 3–9.  
**Acceptance criteria covered:** AC 3–9, 11, 14, 15.

### Task 11 — Focused cross-layer verification

Run the smallest relevant checks first:

- Backend domain validation tests.
- Backend item/reference/context service tests.
- Backend route and OpenAPI tests.
- Exact replica-set archive/reference race tests.
- Frontend Mode configuration/parser tests.
- Frontend builder, Mode panel, Overview, reusable navigation, workspace, and
  mutation-sync tests.
- Backend and frontend typechecks.

Correct only regressions caused by the approved change. Preserve and report
unrelated dirty-work failures exactly.

**Depends on:** Tasks 3–10.  
**Acceptance criteria covered:** AC 1–16.

### Task 12 — Integrity review

Run an independent read-only review of the integrated diff for:

- canonical/legacy identity ambiguity;
- name-based joins;
- PMC/Execution leakage;
- Draft/Active lineage;
- legacy archive races and dangling references;
- silent data conversion or background writes;
- conflict/CAS/audit preservation;
- post-save section/aggregate version rebasing and repeat-save correctness;
- permission or route-inventory drift;
- cache invalidation gaps;
- raw IDs or reusable recovery copy in the UI;
- generic price-version compatibility;
- migration/rollout risk.

Resolve every confirmed defect and re-run the affected focused checks.

**Depends on:** Task 11.  
**Acceptance criteria covered:** AC 4–14, 16.

### Task 13 — Final verification and rendered QA

After all writers and integrity fixes finish:

1. Run backend typecheck, full tests, and build.
2. Run frontend typecheck, full tests, and build.
3. Run `git diff --check` and `git status --short`.
4. Inspect the final diff against the initial dirty-path baseline.
5. In an available authenticated browser, verify at representative desktop,
   tablet, and mobile widths:
   - exact PMC/Execution choice control;
   - no reusable warning/action or empty action space;
   - add/edit/switch/save, then edit the saved fields and save again without
     leaving the Mode tab;
   - empty and read-only states;
   - reusable navigation has exactly five categories;
   - keyboard/focus order, accessible names, overflow, wrapping, and visible
     focus.
6. If no browser is available, report that limitation and rely on rendered
   interaction/axe checks without claiming visual QA passed.
7. Report exact commands, counts, failures, warnings, unrun checks, generated
   ignored artifacts, and remaining risks.

**Depends on:** Task 12.  
**Acceptance criteria covered:** AC 1–16.

## Parallel execution map

After Task 2 freezes the contract, execution mode A may use these non-overlapping
slices:

- **Backend Slice A:** Task 3 — domain validation and tests.
- **Frontend Slice A:** Tasks 6–7 — parser/converter and Mode builder.
- **Frontend Slice B:** Task 8 — reusable-values navigation cleanup.

Backend Tasks 4 and 5 share service/OpenAPI contracts and should be sequenced or
assigned with explicit non-overlapping file ownership. Frontend Task 9 depends
on the parser contract and may begin only after Task 6 settles its public
helpers. Task 10 begins after all writers integrate. Integrity and final
verification remain sequential and read-only.

## Verification matrix

| Acceptance criterion | Primary evidence |
| --- | --- |
| AC 1: fixed choices | Builder rendered tests with no master fixtures |
| AC 2: no reusable warning/action | Empty/failed catalog DOM assertions and copy search |
| AC 3: catalog-independent save | Frontend interaction plus backend service test with zero Mode masters |
| AC 4: edit after save | Same-mounted-panel save–edit–save test with section/aggregate CAS assertions |
| AC 5: canonical writes | Mutation payload and backend persistence assertions |
| AC 6: no leakage | Unequal PMC/Execution frontend and backend context fixtures |
| AC 7: resolved legacy conversion | Dual-shape parser and user-save integration test |
| AC 8: unresolved legacy recovery | Preserved-field/remove interaction test |
| AC 9: immutable history | Active/archived read-only and no-write assertions |
| AC 10: no reusable Modes UI | Exact five-category desktop/mobile navigation tests |
| AC 11: Overview | Fixed selector and configured-only projection tests |
| AC 12: context filtering | Route/service tests for modeKind, legacy modeId, and mutual exclusion |
| AC 13: archive behavior | Service plus replica-set canonical/legacy cases |
| AC 14: workflow invariants | CAS/conflict/audit/save-order/query tests |
| AC 15: UX state matrix | Rendered interaction, axe, keyboard, responsive browser QA |
| AC 16: integrated health | Full commands, builds, hygiene, and final diff review |

## Rollout and rollback checks

- Verify backend dual-read support before frontend canonical writes are
  considered deployable.
- Do not execute a migration or bootstrap.
- Confirm a rolled-back frontend can coexist with the dual-shape backend.
- Record that old frontend versions cannot understand new `modeKind` payloads;
  backend-first deployment order is mandatory for any future release.
- Rollback is code-only while the dual-shape backend remains deployed; no data
  deletion is authorized.

## Completion conditions

- All sixteen acceptance criteria have exact evidence or an explicitly reported
  environment limitation.
- PMC and Execution work without reusable Mode data.
- No user-facing reusable Mode management or recovery action remains.
- Canonical and legacy data remain distinguishable and safe.
- No production data operation, dependency change, commit, push, or deployment
  has occurred.
- Integrity review reports no unresolved confirmed defect.

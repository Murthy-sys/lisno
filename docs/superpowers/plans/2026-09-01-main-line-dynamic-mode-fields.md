A# Main Line Dynamic Mode Fields — Task Plan

Status: Approved for execution  
Date: 2026-09-01  
Source of truth: [Main Line Dynamic Mode Fields specification](../specs/2026-09-01-main-line-dynamic-mode-fields-design.md)

## Outcome

Implement the approved Super Admin Main Line Mode builder so PMC and Execution
can each own stable, revisioned dynamic fields. The Mode tab must create and
edit those fields, the existing Save/conflict workflow must persist them in the
Advanced section, and Overview must summarize only the selected mode's saved,
non-empty values.

No production data operation, bootstrap execution, deployment, commit, or push
is included.

## Fixed implementation contract

The following approved decisions are inputs to every task and must not be
reinterpreted by an implementation agent:

- `mode` remains a frontend workspace key and is never sent to the section API.
- Persist data as optional `advanced.payload.modeConfigurations` using the
  exact approved shape: configuration `id`, stable `modeId`, ordered `fields`;
  each field has stable `id`, closed `type`, `label`, `options`, and typed
  `value`.
- Supported types are `text`, `textarea`, `number`, `radio`, `dropdown`, and
  `checkbox` only.
- PMC and Execution are distinct reusable Mode master records identified by
  stable ID. Display labels are not join keys.
- Multiple mode configurations may coexist. The dropdown is an editor switcher.
- Existing Mode Pricing and Quantity & margin behavior remains unchanged.
- Overview is read-only and filters dynamic values by exact selected `modeId`.
- Existing Advanced properties must survive every Mode save unchanged.
- The current Draft alone is mutable; section/aggregate CAS, audit atomicity,
  immutable Active history, unsaved navigation, and no automatic conflict
  replay remain invariant.
- Dynamic configuration is optional and does not add a completeness blocker.
- Missing PMC/Execution master data is explicit and recoverable through the
  governed reusable-values flow; the screen never manufactures IDs.

## Ownership boundaries

| Owner | Exclusive write boundary | Must not change |
| --- | --- | --- |
| Primary agent | Approved spec/plan, cross-layer contract reconciliation, shared documentation, final diff | Product meaning, stable-ID contract, or writer-owned code while writers run |
| Backend implementer | `backend/src/**` and task-specific `backend/tests/**` | Frontend files, production data, historical bootstrap execution |
| Frontend implementer | `frontend/src/features/ai-estimator-knowledge/**` and task-specific frontend tests/styles | Backend files, API semantics, unrelated shared UI primitives |
| Integrity reviewer | Read-only integrated review | Product sources |
| Verification runner | Read-only final commands and evidence | Product sources |

Because the current worktree is already dirty, no writer receives a target file
until Task 0 records its initial status, hash, and relevant diff. If prior edits
overlap the approved feature, the primary agent must establish ownership and a
preservation strategy before writing.

## Dependency graph

```text
Task 0: Baseline and contract freeze
        |
        +------------------------+
        |                        |
Task 1: Backend contract     Task 2: Frontend builder and Overview
        |                        |
        +-----------+------------+
                    |
Task 3: Cross-layer reconciliation and documentation
                    |
Task 4: Focused integrated verification
                    |
Task 5: Integrity review and confirmed fixes
                    |
Task 6: Independent final verification and visual QA
                    |
Task 7: Final reconciliation and handoff
```

Tasks 1 and 2 may run in parallel only after Task 0. Tasks 3–7 are sequential.
For execution mode B, the primary agent performs the same tasks inline in this
order.

## Task 0 — Capture baseline and freeze the shared contract

**Owner:** Primary agent  
**Dependencies:** Approved specification  
**Acceptance criteria covered:** Preservation prerequisite for AC 12, 13, 15,
16, 17, 19, and 20

### Actions

1. Record `git status --short` for the repository and targeted paths.
2. Record content hashes and relevant diffs for every planned backend/frontend
   target, especially already modified/untracked AI Estimator files.
3. Run the current focused backend and frontend knowledge suites to distinguish
   new regressions from existing failures.
4. Record known baseline failures, including any stale navigation assertions,
   without expanding scope to unrelated fixes.
5. Publish the exact TypeScript/JSON contract from the approved specification
   to both implementation owners before they write.
6. Confirm there is no live migration, bootstrap, seed, deployment, commit, or
   push authority.

### Stop/report conditions

- A relevant dirty file cannot be safely attributed or preserved.
- Current source materially contradicts the approved storage boundary.
- Implementing the contract would require production data mutation.

## Task 1 — Implement backend contract, validation, lineage, and API coverage

**Owner:** Backend implementer  
**Dependencies:** Task 0 contract freeze  
**Can run in parallel with:** Task 2  
**Acceptance criteria covered:** AC 2, 5, 7, 10, 13–20

### Affected areas

- `backend/src/domain/ai-estimator-knowledge.ts`
- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/models/AiEstimatorKnowledgeSection.ts` only if required to keep
  model validation aligned; the Mixed storage shape itself should remain
  unchanged
- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/services/ai-estimator-knowledge-context.service.ts`
- `backend/src/routes/ai-estimator-knowledge-admin.ts` only for authoritative
  validation integration; no new route
- `backend/src/openapi/ai-estimator-knowledge.ts`
- Focused backend tests listed below

### Actions

1. Add the closed dynamic field-type constant and public contract types.
2. Extend the Advanced payload allowlist with `modeConfigurations`.
3. Add strict structural and type-specific validation for:
   - exact keys and stable IDs;
   - one configuration per `modeId`;
   - maximum 50 fields per mode;
   - unique field IDs and normalized labels within a mode;
   - maximum 50 trimmed, non-empty, normalized-unique choice options;
   - canonical decimal-string number values;
   - choice-value membership;
   - empty options on non-choice fields;
   - boolean checkbox values;
   - existing object depth, array, text, and 256 KiB section limits.
4. Include every configuration `modeId` in revision master-reference
   validation and reject unresolved/inactive IDs transactionally.
5. Preserve `modeConfigurations` through section DTOs, Draft copy/duplicate,
   activation digest, and Active context projection without exposing Draft data.
6. Preserve all existing Advanced properties and behaviors.
7. Update OpenAPI schemas/payload-key inventory without changing the endpoint
   or permission mapping.
8. Keep the existing section-update audit action and Draft-only section/
   aggregate CAS transaction unchanged.

### Focused tests

- `backend/tests/ai-estimator-knowledge-domain.test.ts`
- `backend/tests/ai-estimator-knowledge-validation.test.ts`
- `backend/tests/ai-estimator-knowledge-models.test.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`
- `backend/tests/ai-estimator-knowledge-context.service.test.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`
- `backend/tests/api-docs.test.ts`
- `backend/tests/authorization-policy.test.ts`
- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`

Use two unequal IDs and values, for example PMC → `PMC mark = A1` and Execution
→ `Crew code = E-27`, so cross-mode leakage cannot pass accidentally.

### Stop/report conditions

- A new endpoint, section key, collection, permission, or audit action appears
  necessary.
- Existing Advanced keys would need destructive reshaping.
- A backend behavior choice is not defined by the approved contract.

## Task 2 — Implement frontend builder, save integration, and Overview projection

**Owner:** Frontend implementer  
**Dependencies:** Task 0 contract freeze  
**Can run in parallel with:** Task 1  
**Acceptance criteria covered:** AC 1–13, 15–17, 19, and frontend portions of
AC 20

### Affected areas

- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- New feature-local dynamic-mode contract/projection/validation helpers and
  tests, with names chosen consistently with repository conventions
- New feature-local `KnowledgeModeConfigurationBuilder` component and tests
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
  only if parent save/busy/error plumbing requires a contract-safe adjustment
- `frontend/src/features/ai-estimator-knowledge/knowledgeWorkspaceSections.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeConflictReview.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMutationSync.ts` only
  if existing generic synchronization does not invalidate every consumer
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- Focused frontend tests listed below

### Actions

1. Mirror the approved backend contract with readonly frontend types and pure
   parsing/projection helpers that fail closed on malformed data.
2. Add a Mode configuration block before existing Mode content:
   - labelled Mode dropdown;
   - exact stable-ID resolution for PMC and Execution;
   - explicit loading/error/missing-master/refresh states;
   - Add field, edit definition, actual value control, move, and remove actions.
3. Render the six supported field types with programmatically associated labels
   and type-correct values.
4. Enforce client validation and focus the first invalid definition/value while
   treating backend validation as authoritative.
5. Preserve drafts for both modes when switching the dropdown.
6. Query and draft the full Advanced envelope alongside Pricing and Quantity &
   margin; preserve dependencies, overrides, lineage, and unknown server-owned
   values allowed by the current client contract.
7. Extend deterministic Mode save/discard/conflict behavior to Advanced:
   - only dirty blocks save;
   - aggregate version advances after each success;
   - first failure stops the sequence;
   - local drafts remain dirty after failure/conflict;
   - no automatic conflict replay;
   - one success announcement only after every dirty block saves.
8. Include Advanced in the Mode workspace-to-backend mapping while ensuring the
   frontend key `mode` never reaches the API.
9. Extend Overview projection so configuration mode IDs participate in the
   radio choices and only the selected mode's non-empty values render; checkbox
   false remains visible as **No**.
10. Preserve existing Pricing, Quantity & margin, preview, navigation, layout,
    and read-only behavior.
11. Add responsive styles scoped to the Super Admin item workspace using the
    established Mode/repeater visual grammar; do not modify global primitives.

### Focused tests

- New dynamic-mode pure contract/validation tests
- New builder interaction/accessibility tests for all six field types
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx`
- New/extended Mode save, partial-failure, conflict, discard, and reload tests
- `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx`

Fixtures must use distinct PMC and Execution IDs, labels, field IDs, field
types, and values. Tests must assert absence as well as presence to prove no
cross-mode leakage.

### Stop/report conditions

- The implementation would hard-code a display label as persisted identity.
- Dynamic definitions require changes to shared global UI primitives.
- The Advanced draft cannot preserve unrelated keys with the existing update
  semantics.
- A new product behavior is needed for unsupported components or conditional
  logic.

## Task 3 — Reconcile the cross-layer contract and documentation

**Owner:** Primary agent  
**Dependencies:** Tasks 1 and 2 complete  
**Acceptance criteria covered:** AC 2, 7, 10, 13, 18, 19

### Actions

1. Compare backend and frontend enums, JSON keys, value domains, limits, and
   error paths field by field.
2. Inspect the full integrated diff and confirm only approved paths/behavior
   changed.
3. Reconcile save-order and aggregate-version assumptions against the actual
   mutation responses.
4. Confirm Advanced properties survive frontend round trips and backend
   persistence/context projection.
5. Confirm PMC/Execution fixtures use stable IDs and no name-based joins.
6. Update the existing AI Estimator design documentation where it describes
   Mode/Advanced/Overview, without rewriting unrelated dirty documentation.
7. Notify the implementation owner immediately if a contract mismatch requires
   a bounded correction in its owned files.

### Stop/report conditions

- Backend/frontend contract disagreement cannot be resolved within the approved
  shape.
- An unrelated dirty change would be overwritten.

## Task 4 — Run focused integrated verification

**Owner:** Primary agent  
**Dependencies:** Task 3 complete  
**Acceptance criteria covered:** All ACs, first verification pass

### Backend commands

```bash
cd backend
npm test -- tests/ai-estimator-knowledge-domain.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-models.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts tests/authorization-policy.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
```

The replica-set lane must not be weakened or substituted with a non-transactional
test.

### Frontend commands

```bash
cd frontend
npm test -- <new-dynamic-mode-tests> KnowledgeModeSectionStateRemoval.test.tsx KnowledgeModeLayout.test.tsx knowledgeOverviewSummary.test.ts KnowledgeOverviewPanel.test.tsx knowledgeMutationSync.test.ts KnowledgeItemWorkspaceLayout.test.tsx KnowledgeScreens.test.tsx KnowledgeFoundation.test.tsx
npm run typecheck
```

### Integrated assertions

- Add/edit/reorder/remove/save/reload each type.
- PMC and Execution coexist with unequal values and never leak.
- Overview omits empty values but renders checkbox `false` as **No**.
- Existing Mode Pricing/Quantity content and preview remain usable.
- Missing mode reference, backend validation, partial save failure, conflict,
  unsaved navigation, read-only history, and cache refresh are explicit.
- Advanced dependencies, mode overrides, and revision lineage survive.

Any confirmed failure is returned to its original owner for a bounded fix,
followed by rerunning the affected focused lane.

## Task 5 — Run integrity review and resolve confirmed findings

**Owner:** Integrity reviewer, then the relevant original writer for fixes  
**Dependencies:** Task 4 green for changed behavior

### Review focus

- Super Admin authorization remains backend-enforced and operation-specific.
- Stable IDs and exact mode ownership survive list/detail/save/Overview/context.
- Section and aggregate CAS handling cannot overwrite concurrent Advanced edits.
- Sequential multi-block Mode saves cannot announce false success.
- Active/Superseded revisions remain immutable and Draft data does not leak to
  Active context.
- Audit and section mutation remain one transaction.
- Advanced properties are not dropped by frontend round trips.
- Context/digest lineage includes saved configuration.
- Existing calculation, pricing, and execution semantics are unchanged.
- No hidden bootstrap, migration, external write, dependency, or permission
  expansion occurred.

Confirmed issues are fixed only in the original ownership boundary, then the
focused checks and integrity review are rerun until no confirmed defect remains.

Resolved integrity findings:

- Dynamic Advanced mutations promote applicability to `configured`, preventing
  saved knowledge from disappearing after activation.
- Dynamic Mode references block archive in Draft and retained Active history.
- First/replacement references and Mode archive coordinate on an internal epoch;
  forced replica-set tests cover both commit orders without dangling references
  or stray audit events.
- Stale references remain viewable with an explicit Draft recovery path, while
  missing canonical PMC/Execution records continue blocking persistence.
- Canonical modes resolve from all pages using backend-compatible normalization.
- Recovery controls have mode-specific accessible names and remain navigable in
  read-only loading/error history.

## Task 6 — Run independent final verification and rendered QA

**Owner:** Verification runner  
**Dependencies:** Task 5 complete with no unresolved confirmed issue

### Full automated verification

```bash
cd backend
npm run typecheck
npm test
npm run build

cd ../frontend
npm run typecheck
npm test
npm run build

cd ..
git diff --check
git status --short
```

There is no repository lint script; do not claim lint passed.

### Visual and interaction matrix

Use the approved in-app browser workflow with a signed-in Super Admin session
when available:

| Viewport/state | Required checks |
| --- | --- |
| Desktop ≥1280px, editable Draft | Dropdown, builder hierarchy, all six controls, existing Mode blocks, save feedback |
| Tablet 768px | Grid stacking, action wrapping, no horizontal page scroll |
| Mobile 480px | Full-width actions, radio/choice wrapping, touch targets, sticky/contained toolbar behavior |
| Desktop at 200% zoom | No clipped labels/actions, logical reading/focus order |
| Read-only Active revision | Values visible; add/edit/reorder/remove unavailable |
| Missing Execution master | Explicit blocking state and governed recovery action |
| Conflict and validation errors | Local data retained; first invalid/conflict action keyboard reachable |
| Overview PMC/Execution switch | Exact non-empty selected-mode values only |

Run keyboard-only interaction, accessible-name inspection, focus visibility,
and axe coverage. If the required browser runtime is unavailable, record that
blind spot explicitly; do not substitute an unapproved browser surface or claim
rendered QA passed.

### Baseline failure handling

- Report pre-existing failures separately with exact file/test evidence.
- Do not fix unrelated failures unless they block the approved feature and the
  user authorizes the scope expansion.
- Do not call the work fully verified while a scope-related test, build, type,
  integrity, or rendered-interaction defect remains.

## Task 7 — Final reconciliation and handoff

**Owner:** Primary agent  
**Dependencies:** Task 6 evidence available

### Actions

1. Recheck target hashes/status and inspect the final scoped diff.
2. Map each acceptance criterion to test or visual evidence and name any blind
   spot.
3. Report outcome, important contract decisions, affected files, exact commands
   and results, and any pre-existing unrelated failures.
4. State that no production data setup, migration, bootstrap, deployment,
   commit, or push occurred.
5. Identify the operational prerequisite that PMC and Execution must exist as
   active reusable Mode masters in the target environment.

## Verification matrix

| Requirement | Primary evidence | Expected result |
| --- | --- | --- |
| AC 1–6: selector and builder | Builder interaction tests plus desktop/mobile visual QA | PMC/Execution resolve by ID; all six definitions and real controls work |
| AC 7–9: persistence and example | Mode save/reload tests with `PMC mark = A1` | Stable IDs/order/definitions/value survive reload and remain editable |
| AC 10–11: isolation and Overview | Pure projection and component tests with unequal fixtures | Only exact selected mode's non-empty values render |
| AC 12: existing Mode behavior | Existing Mode, preview, layout, and screen regressions | Pricing/Quantity behavior unchanged |
| AC 13–14: preservation/validation | Frontend round-trip plus backend validation/service tests | Other Advanced keys survive; invalid payload writes nothing |
| AC 15–16: immutable history/CAS | Service and replica-set integration tests | Draft-only updates; conflict preserves local work; no replay |
| AC 17: authorization | Route/policy matrix | Non-Super-Admin rejected before validation |
| AC 18: Active context lineage | Context service and replica-set tests | Active-only configuration with exact revision/digest lineage |
| AC 19: backward compatibility | Missing-property, copy, activate, and context tests | Existing revisions behave unchanged |
| AC 20: release verification | Focused/full suites, typechecks, builds, visual matrix, hygiene | All scope-related checks pass; blind spots reported |

## Parallel execution map

- **Safe in parallel after Task 0:** backend Task 1 and frontend Task 2 because
  their write paths do not overlap and the JSON contract is already fixed.
- **Not safe in parallel:** integration reconciliation, integrity review, final
  verification, or fixes to shared contract assumptions.
- **Sequential correction rule:** a backend finding returns to the backend
  owner; a frontend finding returns to the frontend owner; the primary agent
  then reruns reconciliation before review/verification continues.

## External actions explicitly excluded

- No creation of PMC or Execution records in production.
- No bootstrap, seed, migration, or backfill execution.
- No production or staging deployment.
- No commit, push, PR mutation, or customer communication.
- No dependency installation unless a later, approved implementation discovers
  a strict need and obtains the required authority.

# Mode Main Line Priority — Task Plan

**Status:** Complete — verified 2026-09-02

**Date:** 2026-09-02

**Approved specification:** [Mode Main Line Priority Design](../specs/2026-09-02-mode-main-line-priority-design.md)

**Scope:** Configuration → Main Basket → Main Line → Mode → Specifications → Priority

## Outcome and fixed contract

Implement the approved Main-Line-level Priority workflow:

- Add one **Priority** select immediately after **Specifications** and before
  Vendors/Price versions in Mode.
- Offer **Non Negotiable**, **High**, **Medium**, and **Low** in that exact order.
- Persist only the selected stable master ID in
  `overview.payload.priorityId`; do not add Priority to a Specification or
  another section.
- Keep Priority hidden from Overview while preserving the entire Overview
  payload through every Mode save, rebase, conflict, retry, and discard.
- Keep Priority optional, with no default and no new activation blocker.
- Resolve a configured Priority to `{ id, tier, code, name }` in safe estimator
  context while retaining `priorityId`.
- Treat Priority only as classification metadata. Do not change prices,
  quantities, slabs, estimated cost, GST, margins, markup, wastage, or preview
  formulas.
- Provide four canonical master records safely: fresh bootstrap support plus a
  separate targeted, idempotent, dry-run-first existing-environment operation.
- Harden Priority reference/archive coordination so a first reference and an
  archive cannot both commit.
- Do not execute provisioning against a shared or production-like database,
  deploy, commit, push, seed, backfill, or mutate external state.

The approved specification is the source of truth. Any discovery that would
make Priority per-Specification, mandatory for activation, financially active,
or dependent on a downstream estimator not currently connected to knowledge
context must stop implementation and return for revised specification approval.

## Baseline and worktree protection

Before any product writer starts, the primary agent will recapture
`git status --short` and inspect the exact per-target diff. Relevant targets
already contain user-approved work for configurable priced slabs, descriptive
Specifications, Gap behavior removal, and Overview simplification.

Known overlapping dirty backend targets include:

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`
- `backend/tests/ai-estimator-knowledge-reference.service.test.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`
- `backend/tests/ai-estimator-knowledge-validation.test.ts`
- `backend/tests/api-docs.test.ts`

Known overlapping dirty frontend targets include:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeConflictReview.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMasterPagination.ts`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- their currently modified tests and the untracked Quantity-slab files.

Rules for every writer:

1. Treat all pre-existing diffs as user-owned.
2. Do not revert, stage, reformat, or replace unrelated work.
3. Inspect a dirty target's existing diff before editing it.
4. Stay inside the explicitly assigned boundary and report a cross-boundary
   dependency to the primary agent.
5. Do not run tests against a transient shared worktree while another owner is
   modifying the same subsystem; final checks run after integration is stable.

## Frozen cross-layer contract

Task T0 publishes these exact values before parallel implementation:

| Stable ID | Stored semantic tier | Code | Name | Order |
| --- | --- | --- | --- | ---: |
| `knowledge-priority-bootstrap-non-negotiable` | `non_negotiable` | `NON_NEGOTIABLE` | Non Negotiable | 0 |
| `knowledge-priority-bootstrap-high` | `high` | `HIGH` | High | 1 |
| `knowledge-priority-bootstrap-medium` | `medium` | `MEDIUM` | Medium | 2 |
| `knowledge-priority-bootstrap-low` | `low` | `LOW` | Low | 3 |

Additional contract details:

- Priority masters add an optional stored `semanticTier` constrained to the
  four values above. Existing non-canonical masters have no tier.
- A partial unique index permits at most one non-archived record per
  `semanticTier`.
- Priority masters gain internal `dependencyEpoch`, defaulting compatibly when
  absent and never exposed in public DTOs.
- Public Priority master DTOs expose response-only `semanticTier`; generic
  create/update clients cannot assign a canonical tier.
- Canonical record identity fields and availability are protected from generic
  rename/reorder/archive operations. Canonical creation/reconciliation is owned
  by the audited provisioner.
- Overview stores only `priorityId`; context maps `semanticTier` to the public
  `priority.tier` field.
- New/changed Main Line Priority selections must reference an active canonical
  master. An unchanged legacy non-canonical/inactive selection may be retained
  without being offered as a new choice.
- Mode save order is `advanced → pricing → overview → quantity-margin`.

## Dependency-ordered task graph

### T0 — Rebaseline and publish the implementation contract

**Owner:** Primary agent

**Dependencies:** Approved task plan and selected execution mode

**Covers:** All acceptance criteria indirectly

Steps:

1. Capture the exact dirty-path set and focused diffs for every assigned file.
2. Confirm the current Medium ID and publish the frozen table and response
   shapes above to all implementation owners.
3. Confirm the context response addition:

   ```json
   {
     "priorityId": "knowledge-priority-bootstrap-high",
     "priority": {
       "id": "knowledge-priority-bootstrap-high",
       "tier": "high",
       "code": "HIGH",
       "name": "High"
     }
   }
   ```

4. Assign exclusive file ownership. No task may silently alter another task's
   contract file.
5. Record that implementation authority covers local source edits and tests
   only; it does not cover any live provisioning command.

**Stop/report:** Current code or data evidence contradicts a fixed semantic
tier, requires an activation rule, or requires estimator behavior beyond
context projection.

### T1 — Add the canonical backend Priority contract

**Owner:** Backend contract implementer

**Owned boundary:** The files below only

**Dependencies:** T0

**Covers:** AC 2, 3, 6, 8, 9, 10, 11

Expected source files:

- new focused canonical-Priority domain/constants module under `backend/src/domain/`
- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/models/AiEstimatorKnowledgePriority.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `backend/tests/ai-estimator-knowledge-models.test.ts`
- focused domain/OpenAPI tests, including `backend/tests/api-docs.test.ts`

Steps:

1. Define the four tiers, stable IDs, codes, names, and ordering once in a
   backend-owned canonical registry.
2. Add optional `semanticTier` and internal `dependencyEpoch` to the Priority
   persistence model. Add a partial unique non-archived semantic-tier index and
   preserve legacy records with neither field.
3. Extend public contracts/OpenAPI so Priority DTOs may expose
   `semanticTier`, while `dependencyEpoch` remains private.
4. Keep master write schemas from accepting arbitrary client-authored
   `semanticTier`.
5. Add model/contract tests for all four tiers, uniqueness, legacy hydration,
   private epoch fields, and strict unknown-value rejection.
6. Hand the exact exported contract to T2, T3, and T4; do not edit their owned
   runtime, operation, or frontend files.

Focused verification:

- `backend/tests/ai-estimator-knowledge-models.test.ts`
- `backend/tests/api-docs.test.ts`
- any new focused canonical-Priority domain test

**Stop/report:** Supporting the contract would require rewriting existing
revision payloads, replacing Medium's stable ID, or exposing internal epoch
state publicly.

### T2 — Enforce backend selection integrity and resolve estimator context

**Owner:** Backend runtime implementer

**Owned boundary:** Runtime service files and their tests only

**Dependencies:** T1

**May run in parallel with:** T3 and T4

**Covers:** AC 3–10

Expected source files:

- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/src/services/ai-estimator-knowledge-context.service.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`
- `backend/tests/ai-estimator-knowledge-reference.service.test.ts`
- `backend/tests/ai-estimator-knowledge-context.service.test.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`
- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`

Steps:

1. Project `semanticTier` for canonical Priority master list/detail DTOs and
   exclude it for legacy custom records; never return `dependencyEpoch`.
2. On an Overview update, compare the prior and submitted `priorityId`:
   - a new or changed non-null value must resolve to an active canonical
     Priority;
   - clearing remains allowed;
   - an unchanged legacy/inactive reference can survive an unrelated
     field-preserving write;
   - a missing submitted reference is never substituted or guessed.
3. Increment the referenced Priority's `dependencyEpoch` inside the same
   transaction when creating/copying/changing relevant references, following
   established UOM/Mode coordination.
4. Add the matching epoch guard to Priority archive/status/semantic updates so
   a first reference and archive cannot both commit.
5. Keep item summaries and list filters sourced from the same
   `overview.priorityId` without duplicating Priority into another section.
6. Resolve configured active-revision Priority inside context to
   `{ id, tier, code, name }`, retain `priorityId`, and return an explicit
   unresolved state/error for an invalid reference rather than guessing.
7. Prove context preview amounts, effective price/tax lineage, quantity/slab
   results, margins, and markup are byte-for-byte/field-for-field unchanged by
   Priority selection.
8. Preserve section/aggregate CAS, transaction rollback, audit sanitation,
   duplication, activation, and authorization behavior.

Focused verification:

- active canonical, missing, inactive, archived, clear, unchanged legacy, and
  unauthorized Overview mutations;
- item summary/filter behavior using unequal Priority IDs;
- context for all four tiers, no Priority, and unresolved legacy reference;
- financial-preview comparison with identical inputs and only Priority changed;
- replica-set first-reference/archive race and copy/reference epoch cases.

**Stop/report:** Correctness would require label-based joins, non-transactional
validation, a new financial formula, or a change to activation completeness.

### T3 — Provide safe canonical catalog provisioning

**Owner:** Backend operations implementer

**Owned boundary:** Bootstrap/provisioning files and their tests only

**Dependencies:** T1

**May run in parallel with:** T2 and T4

**Covers:** AC 2, 6, 11

Expected source files:

- `backend/src/operations/ai-estimator-knowledge-bootstrap.manifest.ts`
- new `backend/src/operations/ai-estimator-knowledge-priority-provision.ts`
- `backend/package.json` only if an explicit scoped command is required
- `backend/tests/ai-estimator-knowledge-bootstrap.test.ts`
- `backend/tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts`
- new focused provisioning unit/replica-set tests

Steps:

1. Extend fresh-environment bootstrap with the four exact canonical records and
   retain the existing Medium ID.
2. Build a separate, Priority-scoped existing-environment operation instead of
   using the whole-database bootstrap, which rejects unrelated existing data.
3. Make dry run the default. Report target fingerprint, manifest digest, exact
   matches, missing records, ID/code/name/tier conflicts, proposed inserts or
   exact canonical repairs, and zero implicit deletes/remaps.
4. Gate write mode with the established target, maintenance, approval digest,
   backup, transaction, audit, and post-commit verification patterns.
5. Make reruns idempotent. A concurrent change or ambiguous existing record
   blocks the write and reports a conflict.
6. Return rollback instructions tied to the exact inserted/changed IDs; never
   roll back a record after it has acquired a reference.
7. Test the command only against isolated test databases. Do not invoke a dry
   run or write against any shared/local configured database during normal
   implementation verification.

Focused verification:

- fresh create, exact reuse, partial missing set, legacy Medium upgrade,
  code/name/ID/tier conflicts, unrelated custom records, dry-run no-write,
  concurrent drift, transactional rollback, idempotent rerun, audit parity, and
  post-commit verification failure.

**Stop/report:** Any desired reconciliation would delete/remap user data,
silently claim an ambiguous existing master, or require a live target command.

### T4 — Add the Mode supporting Overview draft and Priority UX

**Owner:** Frontend implementer

**Owned boundary:** `frontend/` Priority/Mode slice; sole owner of every
overlapping dirty frontend target

**Dependencies:** T1's frozen DTO contract

**May run in parallel with:** T2 and T3

**Covers:** AC 1–7, 12, 13

Expected source files:

- new `frontend/src/features/ai-estimator-knowledge/KnowledgePriorityEditor.tsx`
  or an equivalently focused component
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeSectionPayload.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMasterPagination.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeConflictReview.tsx`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- focused Mode, Overview, payload, pagination, conflict, and screen tests

Steps:

1. Collect all Priority master pages, not only the current first 100, and retain
   cached-refresh/loading/error metadata needed by the editor.
2. Add Overview as a supporting Mode query/draft. Do not render a standalone
   Overview block in Mode; render only its Priority field through the Pricing
   layout immediately after Specifications and before Vendors/Price versions.
3. Build a native labelled select with exact helper/empty/state copy from the
   specification. Filter and order choices by server-owned `semanticTier`,
   persist only the stable ID, and expose no quick-add action.
4. Preserve a selected inactive/non-canonical/missing value as a labelled
   unavailable option where resolvable; never display a raw ID or silently
   clear it.
5. Extend the Mode draft state, busy/dirty state, preflight, save, discard,
   second-save, partial-failure, and conflict logic to include Overview in the
   order `advanced → pricing → overview → quantity-margin`.
6. Add `priorityId` to field-aware Overview rebasing. Before each Overview PUT,
   apply only the locally edited Priority field to the latest full Overview
   payload so UOM and all hidden compatibility properties survive.
7. Map Overview Priority API errors to the control and compare resolved names
   in conflict review. Retain local values through validation, retry, server
   review, and discard choices.
8. Keep the control editable only under the existing non-archived Draft and
   permission rules. Saving disables the select and uses the established
   `Mode saved.` announcement.
9. Implement loading, empty, error/retry, stale, unavailable, saving, success,
   conflict, and read-only states with linked help/error text, logical focus
   order, keyboard operation, and at least a 44 px target.
10. Preserve the explicit tests that Priority remains absent from Overview.
    Replace only stale tests that assume Mode never queries/saves Overview or
    contains exactly three supporting section states.
11. Verify the layout at 1440, 1024, 768, 390, and 320 px with no horizontal
    overflow and no regression to current Specification/slab/UOM UI.

Focused tests include:

- new `KnowledgePriorityEditor` interaction/accessibility tests;
- `KnowledgeModeSectionStateRemoval.test.tsx`;
- `KnowledgeModeSpecificationsSave.test.tsx`;
- `KnowledgeScreens.test.tsx`;
- `KnowledgeItemWorkspaceLayout.test.tsx`;
- `KnowledgeOverviewPanel.test.tsx`;
- `KnowledgeConflictReview.test.tsx`;
- `knowledgeSectionPayload.test.ts`;
- `knowledgeMasterPagination.test.ts`.

**Stop/report:** The UI would need to persist labels, manufacture an ID,
overwrite a whole stale Overview payload, restore Priority to Overview, add
per-Specification state, or disturb the current slab implementation contract.

### T5 — Integrate and reconcile the cross-layer result

**Owner:** Primary agent

**Dependencies:** T1–T4 complete; all product writers idle

**Covers:** All acceptance criteria

Steps:

1. Inspect every final diff against the approved specification and the T0
   contract.
2. Reconcile backend `semanticTier`, public DTOs, OpenAPI, frontend types,
   option filtering/order, persisted `priorityId`, and context `priority.tier`.
3. Confirm generic master endpoints cannot create/alter canonical semantics and
   that legacy custom priorities remain compatible in existing consumers.
4. Confirm the Mode placement and save order, full Overview preservation,
   truthful partial-save handling, and no return of Priority to Overview.
5. Confirm the calculation path has no Priority branch and compare the
   financial preview before/after only-override fixtures.
6. Confirm pre-existing dirty slab/Overview changes remain intact and no owner
   crossed its boundary.
7. Run focused cross-stack tests once on the stable integrated worktree.
8. Confirm no live provisioning, dependency installation, lockfile change,
   generated runtime artifact, staging, commit, push, or deployment occurred.

**Stop/report:** Contract drift, an unexplained unrelated diff, lost user-owned
work, or a focused regression returns to the responsible owner before review.

### T6 — Independent integrity review

**Owner:** `integrity_reviewer`

**Write boundary:** Read-only review; no product-source edits

**Dependencies:** T5

**Covers:** AC 3–11 and cross-cutting risks

Review focus:

- one authoritative Main Line `priorityId` and no per-Specification duplicate;
- stable-ID/tier/code/name lineage and canonical master immutability;
- unchanged legacy/inactive selection preservation without permitting a new
  invalid selection;
- Overview section version and aggregate CAS, field-aware rebase, retry,
  conflict, discard, second save, and truthful partial commits;
- Priority dependency epoch, first-reference/archive race, copying, and
  transaction rollback;
- context safety, no label/order inference, and no financial path change;
- provisioner target binding, dry run, idempotency, conflict behavior, audit,
  backup/rollback instructions, and absence of live execution;
- authorization/operation-registry alignment and no sensitive output; and
- preservation of all earlier user-owned dirty work.

Confirmed findings return to their original owner for a bounded fix, focused
retest, and primary-agent diff review before T7.

### T7 — Final verification on the integrated worktree

**Owner:** `verification_runner`

**Write boundary:** Verification artifacts only; no product-source edits

**Dependencies:** T6 findings resolved; all writers idle

**Covers:** All acceptance criteria

Run in this order:

1. Backend focused domain/model/service/context/route/OpenAPI tests.
2. Backend focused provisioning tests and replica-set transaction/race tests.
3. Frontend focused editor/Mode/Overview/conflict/payload/pagination/screen tests.
4. Rendered keyboard/accessibility interaction checks.
5. Visual/state matrix at 1440, 1024, 768, 390, and 320 px.
6. Backend full typecheck, test suite, and build.
7. Frontend full typecheck, test suite, and build.
8. Repository `git diff --check` and `git status --short`.

No lint command exists; do not claim lint passed. Report exact commands,
results, failed/unrun checks, generated temporary artifacts, and remaining
blind spots.

## Safe parallel execution

After T1 publishes the stable contract, T2, T3, and T4 may run concurrently
because their source ownership does not overlap:

| Concurrent task | Exclusive boundary |
| --- | --- |
| T2 | Backend runtime services and runtime/replica tests |
| T3 | Backend bootstrap/provisioning operation and operation tests |
| T4 | Frontend Priority/Mode slice and frontend tests |

If a task needs a T1 contract/model/OpenAPI change or another task's file, it
must stop and return the dependency to the primary agent. T5, T6, and T7 are
strictly sequential because they inspect the integrated shared worktree.

## Verification matrix

| Acceptance criteria | Evidence/check | Expected result |
| --- | --- | --- |
| AC1: Position; absent from Overview | Rendered Mode/Overview tests and DOM-order inspection | One Priority select follows Specifications and precedes Vendors; Overview has none |
| AC2: Exact options/order/IDs/no default | Canonical registry/model tests plus select interaction test | Four exact labels in order; blank initially; submitted value is stable ID |
| AC3: Main-Line scope only | Strict payload validation and persisted-section inspection | Only Overview owns `priorityId`; Specification shape is unchanged |
| AC4: Save/reload/clear/discard/conflict preservation | Mode integration and payload-rebase tests | Correct selection and all unrelated Overview fields survive every path |
| AC5: Version/CAS and partial save | UI request-order tests plus backend route/replica tests | Ordered aggregate versions; acknowledged writes stay acknowledged; unsaved edit remains local |
| AC6: Master availability/legacy states | Backend mutation tests and UI unavailable-state tests | Active canonical selectable; legacy/inactive readable only; no raw ID |
| AC7: Authorization/read-only | Asymmetric authorized/unauthorized route and UI fixtures | Only permitted non-archived Draft can mutate; backend denies others |
| AC8: Resolved estimator identity | Context tests for four distinct tiers and missing/invalid IDs | `priorityId` retained and `{id,tier,code,name}` resolved without inference |
| AC9: Finance unchanged | Same inputs with only Priority varied | Preview and price/tax/quantity/slab/margin outputs are identical |
| AC10: Archive race | Replica-set first-reference/archive concurrency test | At most one competing outcome commits; references never point to archived master |
| AC11: Provisioning safety | Unit/replica operation tests; source inspection confirms no live run | Dry run is no-write; exact create/reuse/conflict/idempotency/audit/rollback behavior |
| AC12: UI states/responsive | State stories/tests and five-width rendered matrix | All states understandable; no clipping or horizontal overflow |
| AC13: Accessibility/focus | Keyboard test, accessible-query assertions, automated scan | Label/help/error linked; 44 px target; focus follows Specifications; no color-only meaning |

## Exact verification commands

Focused commands may be narrowed by the verification runner to the final file
set, but the expected lanes are:

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-models.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-bootstrap.test.ts tests/api-docs.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgePriorityEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/knowledgeMasterPagination.test.ts src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
cd backend && npm run typecheck
cd backend && npm test
cd backend && npm run build
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

Replica-set tests require their established local Mongo test dependency. Visual
QA requires a locally running frontend/backend with deterministic non-sensitive
fixtures. No configured shared database may be used for provisioning tests.

## Operational authority and rollback

- Local implementation may create the provisioner and test it with isolated
  fixtures only.
- A real dry run still contacts and inventories a named database, so it is not
  included in implementation authority. The user must separately authorize the
  exact target after reviewing its fingerprint, backup, manifest digest, and
  command.
- A write additionally requires a clean final dry run, maintenance/no-writer
  confirmation, approval digest, backup verification, conflict-free report,
  transaction support, and exact rollback instructions.
- No automatic rollback may delete a canonical master after it is referenced.
  A post-commit failure must report whether writes committed and the exact IDs
  requiring manual recovery.
- Section mutations continue to use existing audit events; canonical catalog
  provisioning must produce sanitized auditable resource changes without
  secrets or private connection details.

## Final handoff requirements

The final implementation report must state:

- the delivered Priority behavior and principal contract decisions;
- all affected files grouped by backend, frontend, and operations;
- exact focused/full/replica/rendered checks and their results;
- any check that was not run and why;
- temporary verification artifact paths, if any;
- that no shared/live provisioning, migration, deployment, commit, push, or
  external communication occurred; and
- remaining risks, especially unresolved catalog conflicts or an estimator that
  is still not connected to knowledge context.

# Main Line Budgeting Simplification Task Plan

**Status:** Approved — implementation complete; rendered-browser matrix unavailable in this environment
**Date:** 2026-09-02
**Approved specification:** [Main Line Budgeting Simplification Design](../specs/2026-09-02-main-line-budgeting-simplification-design.md)
**Scope:** Fixed backend GST policy, guarded provisioning, tax-free Budgeting UI,
immutable budget lineage, compatibility, financial integrity, and verification

## Outcome

Deliver a compact **Budgeting** workflow in Main Line → Mode where the Super
Admin sees only:

- Vendor;
- Unit of measure;
- Unit budget (₹, before GST);
- Starts on; and
- optional Ends on.

The screen contains no Tax selector, Add/Configure Tax button, Retry Tax action,
missing-Tax warning, or Tax-catalog dependency. It explains: **GST is fixed at
18% and is added when you save.**

The backend—not the browser—must:

- bind the protected canonical GST rule/version by stable ID;
- exact-verify 1,800 BPS, exclusive treatment, active state, ownership, and
  complete effective-window coverage;
- derive authoritative base, GST, and total paise;
- generate price-entry/version IDs and immutable version history;
- map Set/Update/unchanged rows to the existing append/reference persistence
  protocol;
- preserve Specification and legacy Mode scope rules;
- protect canonical GST records from generic mutation;
- fail atomically if the fixed policy is unavailable; and
- preserve audit, CAS, context, and data interlinks.

The implementation retains the stored `pricing.priceEntries` reference model,
PriceVersion collection, historical Tax lineage, formulas, permissions, CAS,
and audit events. It adds no schema migration or historical rewrite and performs
no provision write against a real database.

## Baseline and change boundaries

The worktree already contains the prior approved Budgeting implementation across
backend and frontend paths. That implementation currently requires selectable
Tax data and is the baseline to amend, not work to discard. Before writers
resume, the primary agent records:

```sh
git status --short
git diff --check
git diff -- backend frontend
```

Writers must inspect the existing per-target diff before editing, retain all
still-valid Budgeting behavior, and change only what the revised approved
specification supersedes. They must not revert, stage, reformat, or overwrite
unrelated user-owned work.

No writer may execute a seed, bootstrap, provision write, migration, deployment,
commit, or push. Replica-set tests may exercise provisioning only against their
isolated temporary test databases.

### Backend ownership boundary

One backend implementer owns every production and test change under `backend/`
for this revision. Keeping one owner avoids collisions among the policy,
reference-service, contract, and transaction changes. Expected targets include:

- a shared fixed-GST policy module under `backend/src/domain/`;
- `backend/src/operations/ai-estimator-knowledge-bootstrap.manifest.ts`;
- a targeted GST provision operation under `backend/src/operations/`;
- `backend/package.json` for a narrowly named provision command, if required;
- `backend/src/contracts/ai-estimator-knowledge.ts`;
- `backend/src/domain/ai-estimator-knowledge-validation.ts`;
- `backend/src/services/ai-estimator-knowledge-item.service.ts`;
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`;
- `backend/src/openapi/ai-estimator-knowledge.ts`; and
- focused unit, route, service, provision, and replica-set tests.

The immutable PriceVersion schema remains unchanged. If evidence shows that the
approved behavior requires a schema migration, the implementer stops and reports
the finding instead of expanding scope.

### Frontend ownership boundary

One frontend implementer owns every production and test change under
`frontend/`. Expected targets include:

- `KnowledgeBudgetBuilder.tsx` and its tests;
- `KnowledgeModePanel.tsx`;
- `KnowledgeSectionEditor.tsx` and pricing tests;
- `knowledgeSectionPayload.ts` and tests;
- `knowledgeSectionValidation.ts` and tests;
- `knowledgeTypes.ts`;
- `knowledgePresentation.ts` and tests;
- `KnowledgeConflictReview.tsx` and tests;
- `KnowledgeOverviewPanel.tsx`, `knowledgeOverviewSummary.ts`, and tests;
- Mode save/state regression tests; and
- `ai-estimator-knowledge.css`.

The generic repeater is not redesigned. Tax controls elsewhere in reusable
master-data administration are outside this Main Line Budgeting revision; the
canonical GST record is nevertheless protected by the backend.

### Primary-agent ownership

The primary agent owns the approved cross-layer contract, documentation,
baseline reconciliation, integration review, and correction routing. Backend and
frontend implementers must not invent alternative Tax fallbacks, calculate GST
in the browser, or weaken immutable-history behavior.

## Fixed cross-layer contract

### Preferred request command

The strict Pricing-section request union contains this preferred command:

```ts
interface KnowledgeBudgetSetCommand {
  operation: "set_budget";
  sourcePriceVersionId?: KnowledgeStableId | null;
  vendorId: KnowledgeStableId;
  uomId: KnowledgeStableId;
  inputAmountPaise: KnowledgePaise; // before GST
  effectiveFrom: string;
  effectiveTo: string | null;
}
```

Rules:

- no source ID creates a new budget history chain;
- a source ID updates the currently retained immutable version represented by
  that opaque ID;
- `set_budget` rejects `taxRuleId`, `taxVersionId`, treatment, rate, calculated
  amounts, IDs, scope, status, version, actor, audit, and other unknown fields;
- unchanged rows remain the existing `reference` shape;
- successful responses remain the current enriched reference shape; and
- internal/database names remain `pricing`, `priceEntries`, and PriceVersion.

### Canonical fixed-GST policy

New and updated budgets use only:

- rule ID `knowledge-tax-bootstrap-gst-18`;
- version ID `knowledge-tax-version-bootstrap-gst-18-v1`;
- rate `1800` BPS;
- treatment `exclusive`;
- active state; and
- the immutable version's effective window, currently beginning
  `2026-08-28T00:00:00.000Z` with no end date.

The server resolves these identities directly, never by label, code, list order,
or a client field. A missing, altered, inactive, wrongly related, or
out-of-window policy fails closed with `FIXED_GST_POLICY_UNAVAILABLE` and no
partial PriceVersion, section, or audit write.

The canonical rule/version cannot be updated, rolled over, or archived through
generic reusable-Tax operations. Those attempts fail with
`CANONICAL_TAX_POLICY_IMMUTABLE`.

### Financial and historical behavior

For a fixed-GST budget:

- `inputAmountPaise` is the before-GST amount;
- `baseAmountPaise = inputAmountPaise`;
- GST uses the existing server half-up BPS calculation; and
- total equals base plus GST.

For example, ₹100.00 becomes ₹100.00 base, ₹18.00 GST, and ₹118.00 total.
The UI displays only server-returned financial values after save.

Untouched historical records—including other rates and inclusive treatment—stay
readable and immutable. When updating a historical record, the editable
before-GST amount comes from authoritative `baseAmountPaise`, never from a
possibly inclusive `inputAmountPaise`. If base is unavailable, Update is disabled
instead of inferred.

### Command compatibility

- `reference` remains accepted for unchanged historical data.
- compatibility `append` may create a new price only when its supplied Tax
  identities, rate, and treatment exactly resolve to the canonical fixed policy;
  it cannot bypass fixed GST.
- prior immutable versions are never rewritten.
- new records use `specificationId: null` and `modeId: null`.
- a safe replacement preserves a non-null historical `modeId`.

### Targeted GST provisioning

Save Mode never creates or repairs Tax configuration. A targeted operation,
modeled on canonical Priority provisioning, must support:

- read-only dry-run before write mode;
- exact target fingerprint, backup confirmation, approval key, and digest;
- deterministic plan and conflict reporting;
- insertion or acceptance of only the exact canonical records;
- refusal to overwrite incompatible populated data;
- one transaction, deterministic audit, idempotency, and concurrency safety;
- post-commit verification and rollback instructions; and
- safe operation without invoking the whole-database bootstrap.

Implementation and isolated tests are authorized after the execution gate.
Running write mode against any real/shared target is not authorized and requires
a separate exact-target approval.

### Resolvability and Mode

For every save containing `set_budget` or compatibility `append`, the resulting
retained active set may contain at most one effective candidate per revision,
UOM, legacy Mode scope, and instant, regardless of Vendor. Different UOMs and
non-overlapping intervals remain valid. Reference-only saves do not newly reject
untouched historical ambiguity.

Budgeting shows no Mode selector. New budgets use `modeId: null`, matching the
current shared PMC/Execution estimator behavior. Existing non-null legacy scope
is preserved during a safe update.

## Dependency-ordered task graph

### Task 0 — Baseline and revised-contract checkpoint

**Owner:** Primary agent
**Dependencies:** Approved specification and task plan
**Blocks:** Tasks 1 and 5

Actions:

1. Capture dirty paths and per-target diffs before any writer resumes.
2. Identify all existing Tax-dependent `set_budget`, builder, validation,
   loading, focus, and error behavior that the revision supersedes.
3. Confirm stored and successful response shapes remain unchanged.
4. Share the exact tax-free request, canonical IDs, errors, historical-prefill
   rule, and no-real-provision constraint with both implementers.

Stop and report if an assigned target contains unrelated changes that cannot be
preserved or if a schema migration appears necessary.

**Acceptance covered:** establishes the baseline for AC3–AC14 and AC19–AC27.

### Task 1 — Canonical GST policy, protection, and targeted provisioning

**Owner:** Backend implementer
**Dependencies:** Task 0
**Blocks:** Tasks 2–4

Actions:

1. Create one backend policy source for the canonical IDs, rate, treatment, and
   effective start; make the bootstrap manifest and budget service reuse it.
2. Add guards to generic Tax update, rollover, and archive paths so the
   canonical rule/version cannot be changed or made unavailable.
3. Return `CANONICAL_TAX_POLICY_IMMUTABLE` without leaking unrelated records.
4. Implement the targeted dry-run/write provision operation using the proven
   Priority-provision safety structure.
5. Accept an already exact policy idempotently; report ID/code/name/version/value
   conflicts without overwriting them.
6. Keep provision write mode transactional and audited, with target/backup/
   approval/digest gates, concurrency handling, post-commit verification, and
   rollback instructions.
7. Add a narrowly scoped package command if the operation needs an operator
   entry point; do not change dependencies or the lockfile.
8. Never call provision from Save Mode and never run it against a real target.

Focused verification:

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-gst-provision.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-gst-provision.replica-set.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=60000 --hookTimeout=120000 --teardownTimeout=120000
cd backend && npm run typecheck
```

Fixtures cover empty, exact, conflicting, concurrent, dry-run, idempotent,
audit-failure, transaction-rollback, and post-commit-verification states.

**Acceptance covered:** AC10, AC22, AC24–AC27.

### Task 2 — Tax-free `set_budget` contract and API inventory

**Owner:** Backend implementer
**Dependencies:** Task 1
**Blocks:** Task 3

Actions:

1. Remove `taxRuleId` from the preferred command while retaining the exact
   business-field allowlist.
2. Reject every client-supplied Tax or server-owned field as unknown.
3. Keep legacy request variants and successful response schemas compatible.
4. Update runtime validation, TypeScript contracts, and OpenAPI together.
5. Document `set_budget` as preferred and `append` as compatibility-only.
6. Add request/route/OpenAPI tests for create, update, malformed business input,
   omitted Tax, supplied Tax, unknown technical fields, and legacy commands.

Focused verification:

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts
cd backend && npm run typecheck
```

**Acceptance covered:** AC4, AC7, AC9, AC10, AC14, AC26.

### Task 3 — Fixed-GST mapping, immutable lineage, and atomic failure

**Owner:** Backend implementer
**Dependencies:** Task 2
**Blocks:** Task 4 and final frontend integration

Actions:

1. Normalize `set_budget` inside the existing section-update transaction.
2. Resolve the canonical rule/version only by stable ID in that transaction.
3. Verify exact ownership, active state, 1,800 BPS, exclusive treatment, and
   complete `[effectiveFrom, effectiveTo)` coverage.
4. Generate IDs and null Specification/Mode scope for create; resolve an update
   source only from the same retained Main Line revision.
5. Preserve the history chain and any safe non-null legacy Mode scope on update.
6. Assign active/reviewed state and derive base/GST/total with the existing
   integer-paise calculation, half-up rounding, and overflow protection.
7. Persist the exact canonical Tax lineage in PriceVersion and its bounded audit.
8. Map policy absence/corruption/window failure to
   `FIXED_GST_POLICY_UNAVAILABLE` and write nothing partially.
9. Keep unchanged references side-effect free.
10. Preserve all prior immutable versions, including inclusive and non-18%
    history.

Focused verification:

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-calculation.test.ts
cd backend && npm run typecheck
```

Fixtures include ₹100.00 → ₹18.00 → ₹118.00, half-paise rounding, overflow,
missing/mismatched/inactive/wrongly-related/out-of-window policy, starts before
28 August 2026, cross-line source IDs, inclusive history, and injected
audit/transaction failure.

**Acceptance covered:** AC5–AC12, AC14, AC17, AC22–AC23, AC27.

### Task 4 — Overlap, compatibility, and concurrency protection

**Owner:** Backend implementer
**Dependencies:** Task 3
**May run while:** Frontend Tasks 5–6 continue

Actions:

1. Align new-version overlap checks with actual estimator candidates, ignoring
   Vendor and Tax as disambiguators.
2. Permit different UOMs and adjacent/non-overlapping intervals.
3. Preserve reference-only payloads containing historical ambiguity.
4. Constrain compatibility append to the exact canonical fixed-GST policy.
5. Prove two concurrent same-scope writes cannot both commit or leave orphaned
   versions/audits.
6. Re-prove shared PMC/Execution/Sub-Vendor/In-house resolution and legacy Mode
   compatibility.

Focused verification:

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=60000 --hookTimeout=120000 --teardownTimeout=120000
cd backend && npm run typecheck
```

**Acceptance covered:** AC8, AC10, AC12–AC14, AC22, AC26–AC27.

### Task 5 — Tax-free Budget draft state and payload integration

**Owner:** Frontend implementer
**Dependencies:** Task 0 and shared fixed request/error contract
**May run in parallel with:** Backend Tasks 1–4

Actions:

1. Remove Tax from Budget draft state, visible validation, serialization, focus
   targets, conflict edits, and new-row initialization.
2. Remove the Tax catalog from Budgeting loading, disabled, empty, stale, error,
   retry, and Save Mode prerequisites.
3. Render only Vendor, UOM, before-GST amount, Starts on, and optional Ends on.
4. Serialize new/update rows to the exact tax-free `set_budget` command; keep
   unchanged references unchanged and omit removed references.
5. Retain only the opaque source version ID needed for Update.
6. Initialize every saved Update amount from authoritative `baseAmountPaise`,
   never `inputAmountPaise`; disable Update when base details are unavailable.
7. Preserve current Add vendor and Add Unit flows; add no Tax recovery action.
8. Map `FIXED_GST_POLICY_UNAVAILABLE` to the expanded budget panel/validation
   summary while preserving all entered business values.
9. Preserve dirty tracking, Save Mode ordering, CAS, conflict review, discard,
   retry, and authoritative response rebasing.

Focused verification:

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/knowledgeSectionValidation.test.ts src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx
cd frontend && npm run typecheck
```

Tests capture requests and prove Tax catalog loading/failure/emptiness cannot
disable Set budget, block Save Mode, or render Tax UI.

**Acceptance covered:** AC2–AC4, AC7, AC9, AC11, AC16, AC19, AC22–AC23, AC27.

### Task 6 — Simple Budgeting presentation, summaries, and accessibility

**Owner:** Frontend implementer
**Dependencies:** Task 5
**May run while:** Backend Task 4 continues

Actions:

1. Keep **Budgeting**, **Budgets**, **Set budget**, and **Update budget** wording
   consistent throughout Mode, Overview, conflicts, and errors.
2. Remove every Tax selector, Add/Configure Tax button, Retry action, warning,
   hidden focus target, and technical Tax identity from Budgeting.
3. Show **GST is fixed at 18% and is added when you save.** beside the before-GST
   amount.
4. Keep saved rows collapsed and readable; auto-open new, updated, and invalid
   rows; allow at most one primary panel open.
5. Display authoritative Amount before GST, GST, and Total including GST after
   save without client arithmetic. Label historical tax simply **GST**.
6. Keep optional Ends on under Schedule options and reveal it for a value/error.
7. Preserve readable empty/loading/stale/read-only/permission/conflict states,
   with no technical IDs or Tax setup directions.
8. Preserve Specifications, Priority, Vendors, Quantity slabs, and unrelated
   Mode behavior.
9. Verify disclosure semantics, keyboard flow, validation focus, focus recovery,
   accessible action names, 44×44 targets, and no horizontal scrolling.

Focused verification:

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts src/features/ai-estimator-knowledge/knowledgePresentation.test.ts
cd frontend && npm run typecheck
```

**Acceptance covered:** AC1–AC3, AC11, AC15–AC22, AC27.

### Task 7 — Integrated contract reconciliation

**Owner:** Primary agent
**Dependencies:** Tasks 1–6; both writers idle
**Blocks:** Task 8

Actions:

1. Inspect the complete backend/frontend diff against all 27 acceptance
   criteria and the original dirty-path baseline.
2. Confirm the frontend emits exactly the tax-free command and never derives GST.
3. Confirm the backend persists exact canonical Tax lineage and returns the
   existing enriched reference shape.
4. Confirm inclusive historical Update prefill uses base and immutable history
   remains untouched.
5. Confirm no Tax catalog state blocks Budgeting and no Tax setup control remains
   in its UI or focus order.
6. Confirm provision code cannot run implicitly and no real-target write occurred.
7. Reconcile errors, conflict projections, query rebasing/invalidation, and user
   copy across both workspaces.
8. Confirm no schema, formulas, permissions, Quantity-slab price precedence, or
   canonical Mode behavior changed.
9. Route corrections back to the original subsystem owner and run
   `git diff --check`.

**Acceptance covered:** all.

### Task 8 — Independent integrity review

**Owner:** Integrity reviewer (read-only)
**Dependencies:** Task 7; all writers idle
**Blocks:** Task 9

Review explicitly:

- authorization and cross-line/source non-disclosure;
- strict tax-free request allowlisting;
- canonical policy identity, ownership, window, and immutability guards;
- absence of Save Mode lazy provisioning;
- target/backup/approval/audit/idempotency/rollback safeguards in provision code;
- integer-paise derivation and immutable Tax lineage;
- inclusive historical Update behavior;
- append bypass and reference compatibility;
- overlap, CAS, transaction, concurrency, audit, and orphan prevention;
- Overview/conflict financial provenance;
- frontend query state, focus, and Tax-catalog independence; and
- regressions to Specifications, Priority, Vendors, Quantity slabs, and Mode.

Every confirmed finding must be corrected and re-reviewed before Task 9.

### Task 9 — Independent final verification

**Owner:** Verification runner (read-only)
**Dependencies:** Task 8 findings resolved; all writers idle

Run focused checks first, then broad checks on the integrated tree.

Backend focused:

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-gst-provision.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-calculation.test.ts tests/api-docs.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-gst-provision.replica-set.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=60000 --hookTimeout=120000 --teardownTimeout=120000
```

Frontend focused:

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/knowledgeSectionValidation.test.ts src/features/ai-estimator-knowledge/knowledgePresentation.test.ts
```

Full lanes:

```sh
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
git diff --check
git status --short
```

Rendered interaction/accessibility matrix:

- 1440×900 desktop;
- 1024×768 compact desktop;
- 768×1024 tablet;
- 390×844 mobile; and
- 320-pixel narrow mobile.

At applicable widths verify empty, new, invalid, saved, update, fixed-policy
error, Tax-catalog failure in the background, conflict, stale, and read-only
states. Exercise keyboard-only creation, disclosure, error focus, update, and
removal. Store screenshots only in ignored temporary output.

No lint result may be reported because the repository has no lint script. OCR is
out of scope unless an unexpected OCR path changes.

## Parallel execution map

After Task 0 and contract handoff:

```text
Backend owner:  Task 1 → Task 2 → Task 3 → Task 4 ┐
                                                   ├→ Task 7 → Task 8 → Task 9
Frontend owner: Task 5 → Task 6 ──────────────────┘
```

Backend and frontend work may run concurrently because their workspace ownership
does not overlap. Tests run during concurrent edits are provisional; final
verification runs only after the integrated tree is stable.

## Acceptance-to-verification matrix

| Acceptance criteria | Primary evidence |
| --- | --- |
| AC1–AC3 terminology and absence of technical/Tax controls | Budget/Mode/Overview/conflict tests plus rendered matrix |
| AC4 tax-free business request | Captured payload, strict validation, route, and OpenAPI tests |
| AC5–AC8 IDs, history, status, and Mode scope | Item-service and replica-set tests with asymmetric source IDs |
| AC9–AC12 inputs, canonical policy, and authoritative money | UI tests plus exact-policy/calculation tests |
| AC13 overlap/resolvability | Service and concurrent replica-set cases across Vendors/UOMs/dates |
| AC14 and AC23 historical compatibility | Inclusive/non-18 reference tests and base-prefill UI test |
| AC15–AC21 panels, draft semantics, states, a11y, responsive UI | Interaction tests and 1440/1024/768/390/320 rendered review |
| AC22 fixed-policy failure | Missing/corrupt/window tests with zero partial writes and panel error test |
| AC24 provisioning safeguards | Dry-run, conflict, idempotency, audit, rollback, and isolated replica-set tests |
| AC25 canonical immutability | Generic update/rollover/archive rejection tests |
| AC26 append/reference compatibility | Legacy command and immutable-history tests |
| AC27 regression boundary | Related focused suites, both full suites/builds, and integrity review |

## Rollout and operational limits

Required production rollout order, when separately authorized, is:

1. backend fixed-policy support, mutation guards, and provision tooling;
2. exact-target provision dry-run;
3. separately approved provision write and verification;
4. policy smoke check; and
5. frontend removal of Tax controls.

This implementation task does not perform those deployment or real-target steps.
It delivers and verifies code locally only.

- No dependency installation or lockfile change is expected.
- No schema migration, data migration, historical rewrite, seed, or full
  bootstrap is allowed.
- No production/shared database write is authorized.
- Before any real budget references a newly provisioned version, rollback may
  use a verified backup. After a reference exists, the canonical records must be
  retained; application/UI code may roll back without deleting lineage.
- No commit, push, deployment, or external communication is authorized.
- If implementation reveals a schema migration, backdated GST-version need,
  different PMC/Execution price requirement, or Vendor-aware estimator input,
  stop and return to specification approval.

## Completion gate

The work is complete only when:

1. every acceptance criterion has exact evidence;
2. the integrity reviewer has no unresolved confirmed finding;
3. the verification runner completes finance replica-set checks and the rendered
   interaction matrix;
4. canonical GST provision tooling is verified only on isolated test databases;
5. no Tax UI, prerequisite, or request field remains in Budgeting;
6. all baseline/unexpected failures are reported accurately;
7. the final diff contains only approved changes and preserves user-owned work;
8. no migration, real-target provision, deployment, commit, push, or external
   write occurred; and
9. the handoff reports exact checks, results, unrun checks, temporary artifacts,
   and remaining risks.

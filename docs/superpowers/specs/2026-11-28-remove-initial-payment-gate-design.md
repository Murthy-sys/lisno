# Make initial Client payment non-blocking for work orders and execution

Date: 2026-11-28 (Asia/Kolkata)
Status: Approved and implemented locally on 2026-11-28 after task-plan approval and Mode A selection. Final verification evidence and limits are recorded in the companion task plan.

## Goal

Remove the requirement that Super Admin confirm the initial Client payment against the current quotation before Procurement can issue work orders and continue execution. Current Client quotation approval, approved design, source reconciliation and existing order approvals remain prerequisites. Payment receipt records must remain truthful and auditable.

## Current behavior and evidence

- `backend/src/services/project-work-order-eligibility.service.ts:60–66` reads `DesignWorkflowState` and adds the reported blocker when the receipt is missing or bound to a different quotation/design approval. The shared assertion is used by basket issue, purchase-order issue, direct Procurement paths, task actions and Finance source checks.
- `backend/src/services/project-workflow.service.ts:2622` separately requires the matching receipt to activate collaborative execution. It uses the receipt timestamp to open downstream tasks, set the actual project start and update the Lead's next action.
- `backend/src/services/design-workflow-state.service.ts:867` invokes execution activation from `confirm_initial_payment`. Merely deleting the issue blocker would leave already-approved projects in preparation/planning.
- `backend/src/repositories/mongo.ts:763` opens the Finance bucket as part of that activation. The memory equivalent also requires a receipt and Super Admin actor. Both implementations must stay aligned when activation moves to approval/issuance events.
- `backend/src/domain/project-status.ts:197–204` returns an initial-payment pending action before showing subsequent work. Workflow task descriptions and Lead next-action text also say payment is required.
- `frontend/src/features/procurement/ProcurementEstimateSource.tsx` and `frontend/src/features/finance/DesignPaymentConfirmations.tsx` explicitly describe payment as a prerequisite for issuing work orders.

Existing quotation/design approval handoff seams are `recordQuotationDesignHandoff`, called from quotation approval and approved-design processing, plus the effective issue transactions. These provide authorized mutation paths without introducing writes on GET.

## Scope and assumptions

The reported rule applies to collaborative quotation workflows (versions 2 and 3). Remove this dependency consistently across their issuance, execution activation, Finance-bucket initialization, status projection and user-facing instructions. Legacy work-order issuance already bypasses this particular gate; unrelated older design-start/payment workflows are outside scope.

Initial Client-payment confirmation remains optional financial recordkeeping, with its existing actor permissions, evidence/reference validation and historical source binding. Missing or stale confirmation does not prevent the scoped workflow from progressing. This change does not remove vendor payment schedules, payment authorizations, overdue alerts, invoice checks, retention rules or Procurement signoff requirements added in the previous task.

No new payment, receipt, approval, date or ledger entry may be fabricated to satisfy existing code. No dependencies, production data migration, seed, deployment or backend-server restart are part of this change.

## Required behavior

1. All effective work-order issue paths accept a missing, unconfirmed or older-quotation initial receipt when every remaining release condition is satisfied. Keep the public readiness shape and remove only the obsolete payment prerequisite.
2. Missing/rejected/stale Client quotation approval, incomplete or mismatched design approval, changed requirements, invalid order source, missing internal approvals, unavailable vendors and revoked actor access continue to block issuance server-side.
3. Once the current quotation and design are both approved, the authorized approval/handoff transaction can activate execution and initialize its Finance bucket without recording a payment. Existing approved projects still in preparation can use the next authorized work-order issuance transaction to perform the same idempotent activation; no backfill or extra payment action is required.
4. Preserve the actual actor on approval, handoff, issuance and activation events. Do not impersonate Super Admin or broaden public role permissions. Internal activation must follow validated approval/issuance authority, with the same scope and transaction fences.
5. Use the actual activation event time for a newly activated project. Preserve existing `actualStartAt`, original task opening/deadline values, issued artifacts and approved financial baselines. Later receipt confirmation, retries or quotation reapproval must not reset these dates or duplicate tasks/buckets.
6. Optional receipt confirmation retains the recorded amount/source/history semantics and no longer serves as the sole activation trigger. Existing receipt and attestation history remains unchanged.
7. Project status and workflow next-action projections must continue to the real next required action rather than returning an initial-payment blocker. Receipt metadata issues remain visible within payment recordkeeping without suppressing otherwise valid execution.
8. Procurement and payment-status copy must describe initial receipt recording as non-blocking. Work-order readiness, button availability and cached status must agree with backend eligibility after approval or mutation.

## Data, API and UX impact

- Reuse current issuance/approval endpoints and readiness DTOs. No new public permission or route is expected.
- Extend existing transactional orchestration, keeping memory/Mongo contracts consistent. Activation, task generation and Finance-bucket initialization must commit or roll back together.
- Preserve immutable approval and payment history. A receipt timestamp is no longer an execution clock for newly activated scoped projects.
- Approved planning projects remain readable without mutation; their next authorized approval/issuance action performs activation. Already active/on-hold/completed projects must not have historical dates rewritten or be automatically reopened.
- Update the existing release-condition panel, explanatory payment text and server-generated task/next-action descriptions. Review shared web/mobile status consumers for assumptions that missing payment means blocked execution; no UI redesign is intended.

## Risks and controls

The main risk is removing the visible warning while leaving a hidden activation or Finance prerequisite. Trace the complete approval-to-issue path and test a real project with no payment record. Other risks are duplicate downstream records under concurrent issuance, accidental execution before current approvals, and resetting historical deadlines. Retain CAS/source fences, use idempotent initialization and compare before/after histories in regression tests.

No schema rewrite or live migration is planned. Reverting the code would restore the previous prerequisite for future actions; existing newly issued orders and activation history must remain intact. Do not roll back by deleting approvals, receipts, issued work or tasks.

## Acceptance criteria and verification

- **AC1:** An authorized user can issue a valid approved work order without initial-payment confirmation, through every supported issue path. The original warning is absent.
- **AC2:** A receipt tied to an older quotation does not block a currently approved quotation/design. The receipt is not rewritten or represented as current payment.
- **AC3:** Missing/current-source approval failures and asymmetric unauthorized identities still fail with the correct blocker; no cross-project access or permission expansion occurs.
- **AC4:** Approval/handoff and an existing approved planning project's first valid issue can activate execution and open exactly one Finance bucket without a receipt. Memory and Mongo behavior agree.
- **AC5:** Concurrent/retried activation or issuance produces no duplicate downstream tasks, source snapshots, approvals or ledger effects. Existing start dates and deadlines remain unchanged, including after optional receipt confirmation.
- **AC6:** Status and relevant web/mobile consumers show the next actionable workflow step. The UI clearly separates optional receipt recording from release eligibility.
- **AC7:** Client-payment history and all vendor-payment/signoff controls remain intact. An already issued order retains its approved source and idempotent replay behavior.

Verification will include focused eligibility/status unit tests, replica-set approval/issuance/Finance integration tests with unequal projects, memory-repository parity, rendered readiness/payment-copy checks, affected typechecks/builds and `git diff --check`. Existing broad-suite failures are documented in the previous Procurement lifecycle plan and must not be represented as regressions without evidence. Local test fixtures do not authorize starting the stopped development backend.

## Open decisions and working-tree preservation

No additional product decision is required for this proposed scope. The assumption is that the obsolete requirement is initial Client payment for the reported quotation workflow, not vendor payment obligations or unrelated legacy design-start rules.

The worktree contains the completed Procurement lifecycle work and other pre-existing changes. The current dirty set and relevant target diffs are captured under `/tmp/lisno-remove-initial-payment-gate/`. Preserve all of them; this specification supersedes only the initial-payment prerequisite described above. The repository's separate specification, task-plan and execution-choice gates remain applicable to this new change.

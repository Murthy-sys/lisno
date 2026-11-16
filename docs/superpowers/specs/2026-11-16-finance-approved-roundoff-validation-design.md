# Correct finance validation of approved rounded totals

Date: 2026-11-16
Status: Approved, implemented, and verified in Mode A

## Goal

Display valid approved project finances instead of the false warning, “These financial details do not match this project's approved estimate.” Preserve the current screen styling, approved amounts, source checks, and financial-action protections.

## Current behavior and verified evidence

- The latest screenshot shows a finance-panel integrity warning. Its section-assignment request returns 304, rather than the previously fixed 409. The preceding approved specification covered the backend section-assignment query and expressly excluded frontend changes.
- `ProjectFinancePanel.tsx` rejects a bucket unless `approvedSubtotalPaise + approvedGstPaise === approvedContractTotalPaise`. This ignores the signed `approvedRoundOffPaise` already emitted by the backend finance DTO. `frontend/src/api/types.ts` also omits that optional DTO field.
- The backend validates final totals with its established rounding rule: round to the nearest whole rupee, with exactly fifty paise rounding down. Subtotal and GST keep their exact paise. The existing frontend-compatible helper, `shared/estimation/estimateTotalRounding.ts`, implements the same rule and legacy compatibility.
- A read-only service inspection of the previously reported local project succeeded. Its response contains a nonzero approved round-off, passes the canonical totals validator, and fails the exact current frontend guard. Replacing only the total-equality predicate in an in-memory diagnostic makes the entire guard pass. Thus its other source and financial arithmetic checks already succeed.
- Evidence: `/tmp/lisno-finance-roundoff-qa/diagnosis.json`. Command monitoring observed only find, aggregate, and transaction-commit commands, with no data mutations. The diagnostic records validation booleans, not customer names or financial amounts. The screenshot omits the project URL; the diagnostic uses the project previously reported in this conversation.

## Proposed correction and scope

Add optional `approvedRoundOffPaise?: number` to the frontend finance-bucket type. In the existing panel integrity guard, replace the subtotal/GST/total equality predicate with `estimateTotalsReconcile`, mapping the approved fields explicitly. Reuse that helper without modifying its rounding behavior.

Keep the remaining project/estimate/version, margin, cost, spending, ledger, and permission checks intact. The same panel serves the standalone Project budget screen and the embedded admin view; verify both usages where their existing tests expose the guard. Preserve optional expected-source comparisons.

Expected affected areas are `frontend/src/api/types.ts`, `frontend/src/features/finance/ProjectFinancePanel.tsx`, and focused finance component regression tests. The panel already contains unrelated changes to its project-completion control. Preserve that exact delta; the baseline is captured in `/tmp/lisno-finance-roundoff-qa/initial-target-diff.patch` and `initial-status.txt`. Refresh the baseline before any writers start.

No new UI controls, copy changes, layout changes, backend calculations, API endpoints, authorization changes, query changes, dependencies, schema changes, migrations, data repairs, approval rewrites, or cache clearing are needed. No commit, push, deployment, seeding, or external communication is included.

## Requirements and financial invariants

1. Accept an explicit signed adjustment only when it and the final total exactly match the existing canonical rounding rule. Positive, negative, and zero adjustments are valid when mathematically correct.
2. Preserve historical exact totals when the adjustment is absent. Do not manufacture an adjustment or accept a missing adjustment for a rounded total that otherwise fails reconciliation.
3. Reject malformed, fractional, unsafe, out-of-policy, or inconsistent values. Do not replace validation with a tolerance, suppress the alert unconditionally, or treat any arbitrary adjustment as valid.
4. Continue deriving profit and usable budget from the approved subtotal excluding GST. Round-off must not change the approved net revenue, reserved margin, recorded spending, or ledger.
5. Keep project identity, approved estimate/version matching, ledger ownership, and all other existing integrity protections. A correctly rounded foreign-project response must still fail closed.
6. Keep loading, empty, error, keyboard, and action-permission behavior and current visual styling. Valid rounded buckets should render the normal existing finance content; real inconsistencies should retain the warning and blocked financial actions.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | Valid approved rounded totals render normal finance content. | Rendered component regressions for unequal positive/negative-adjustment examples, zero adjustment, and the fifty-paise boundary; reproduce failure before the fix. |
| AC2 | Legacy exact totals remain valid and malformed adjustments remain blocked. | Cases for absent legacy adjustment, missing required adjustment, inconsistent adjustment/total, fractional or invalid runtime input; existing exact-total fixtures continue to pass. |
| AC3 | Other integrity protections remain effective. | At least two asymmetric project identities; a valid rounded response from the wrong project, stale/mismatched expected approval, inconsistent cost/spending, and existing ledger-ownership rejection tests. |
| AC4 | Financial amounts and presentation remain unchanged. | Assert normal rendered totals and existing interactions for accepted responses, retained alert/action blocking for rejected responses, plus a focused browser check using sanitized fixtures if available. No redesign matrix is needed. |
| AC5 | The bounded correction integrates without disturbing other work. | Focused finance/admin regressions, frontend typecheck/build, `git diff --check`, and baseline diff review. Broaden checks only for demonstrated impact. |

## Risk, compatibility, rollback, and open decisions

This is a small frontend correction to a financial safeguard. The principal risk is accepting invalid data while fixing a false rejection; reusing the strict established helper and keeping all other predicates mitigates that risk. The field is optional for legacy responses and is already provided by the backend when present. There is no persistence or permission transition.

Rollback consists of reverting only the bounded frontend type/guard changes and their regression additions; no stored-data rollback is required. No material product choice remains. The specification and separate task plan were approved, and the user selected Mode A. Execution is tracked in [the task plan](../plans/2026-11-16-finance-approved-roundoff-validation.md).

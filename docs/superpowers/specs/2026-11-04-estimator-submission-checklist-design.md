# Estimator submission checklist

Date: 2026-11-04

Status: Approved and implemented in Mode A. Scoped verification passed; evidence and limitations are recorded in the task plan.

## Goal

Before an estimator submits or sends an estimate, show a mandatory three-item confirmation dialog. The estimator must personally select each statement before continuing.

## Current behavior and evidence

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` invokes `submit.mutate()` directly from its submission button. The mutation first saves the draft, then calls `submitLeadEstimate`.
- The same workspace invokes `sendToClient.mutate()` directly for an estimate already ready for the client. The button labels vary with workflow: Submit estimate, Submit pre-estimate, Submit final estimate, Approve and send to client, and Send to client.
- These are the only production frontend callers of `submitLeadEstimate` and `sendEstimateToClient` found in the current tree. Their API helpers are in `frontend/src/features/leads/leadsApi.ts`.
- The workspace is shared with Designer. The new checklist is requested for the estimator, represented by the `estimator_sales` role.
- The existing `frontend/src/components/ui/Dialog.tsx` provides a reusable modal with accessible naming, keyboard focus management, dismissal, focus restoration and a busy state.
- Backend submit/send routes already enforce authorization, estimate readiness, Configuration freshness and applicable version checks. They have no declaration payload or declaration history.
- The worktree contains the preceding inline-recommendation implementation. Its staff workspace and regression-test changes are the baseline for this request and must be preserved. The complete initial dirty-path inventory was captured with `git status --short`; no source changes were made during this specification stage.

## Scope and recommended approach

Add one small, reusable checklist dialog to the existing estimator workspace and route both submit and send actions through it for `estimator_sales`. Reuse the current Dialog and button styles. This is a screen-level confirmation, with transient checkbox state; it is not a new server-side attestation record.

No new dependencies, API fields, database changes, role permissions, pricing calculations, publication rules or approval records are required. Client approval and Designer submission retain their current behavior. Email-delivery retry resends the existing published artifact and does not require a new checklist. Save draft and save-before-navigation also do not require the checklist.

## Required copy

Dialog title: **Before submitting your estimate**.

Short instruction: **Confirm all three statements to continue.**

Use these statements, with spelling and grammar corrected while preserving the user's meaning:

1. I confirm that I have mapped the items correctly according to the customer's requirements.
2. I understand that Lisno promotes transparency in information shared with clients. I will not practise underselling to gain sales under any circumstances.
3. I confirm that I have explained to the customer how to read and understand the estimate.

Actions: **Cancel** and **Confirm and submit**. For an existing ready-for-client estimate, use **Confirm and send** for the final action.

## Interaction and state requirements

1. Clicking an eligible estimator submission or send action opens the dialog before any draft-save, submit, publication or delivery mutation starts.
2. All three checkboxes start unchecked every time the dialog opens. No Select all control, remembered acceptance or automatic selection.
3. Each checkbox has the full statement as its accessible label. Its complete label is clickable. The final action stays disabled until all three are checked; unchecking any box disables it again.
4. Cancel, close, backdrop dismissal and Escape close the dialog without saving or submitting, preserve estimate edits and return focus to the initiating action.
5. Confirming calls the existing corresponding action exactly once. Retain existing save-before-submit ordering, expected-version checks, validation, cache refreshes, error handling and success messages. Prevent duplicate clicks while processing and use the existing dialog busy behavior.
6. Revalidate action eligibility immediately before confirmation. A stale estimate, loss of permission, changed actor/project, changed draft or changed saved version must not allow confirmation captured for earlier content to submit different content. Dismiss/reset the pending checklist when its pre-confirmation context changes. The action's own save/version transition after confirmation remains part of that single submission attempt.
7. A failed attempt preserves the current estimate/error behavior and never announces successful submission. Any newly opened checklist starts unchecked. Do not add an automatic retry or bypass the existing reconciliation flow.
8. A new submission, including an estimator's confirmation of Client revisions, requires the checklist again. Historical/read-only views and currently disabled actions remain non-submittable.

## UX and accessibility

Keep the dialog compact, with three vertically stacked checkbox labels and a small action footer. Reuse established typography, colors and focus indicators; no decorative icons, large action cards or added page banners. Long statements wrap naturally. At 390, 768 and 1440 pixel widths, the dialog stays within the viewport; its body can scroll on short screens without hiding actions. Keyboard users can reach each checkbox and both actions. Enter must not submit when a statement is unchecked. Reuse the existing dialog focus trap and background interaction blocking.

## Data/API impacts and invariants

- Checklist state belongs only to the active dialog, actor, project and current submission attempt. Do not store it in local storage or apply it to another estimate.
- Existing save/submit/send payloads and backend authorization remain unchanged. Checkbox selection is not evidence that the underlying statement is true and is not stored as audit proof.
- Immutable approval history, actor identity, CAS checks, saved estimate choices, financial totals and delivery idempotency remain unchanged.
- No migration is needed. Reverting this scoped UI change restores the previous interaction without altering saved data.

## Assumptions, risks and non-goals

- “Estimator” means the current Sales/Estimation role (`estimator_sales`). Do not broaden the requirement to Designer or Client without a later request.
- The requested outcome is a mandatory popup in the web submission flow. Persistent signed declarations or enforcement for direct API callers would require a separate backend contract and are outside this UI change.
- The main risks are gating only one of the two action paths, saving prematurely before confirmation, stale confirmations, duplicate submissions and accidentally affecting Designer's shared workspace. Cover these with rendered regressions.
- The user continues to start the application backend manually. Do not start or restart it, the launcher or OCR for this task. Use isolated frontend fixtures for browser verification if needed.
- No live data mutations, seeds, migrations, commits, pushes, deployments or external messages are authorized by this request.

## Acceptance criteria and verification

1. Estimator submit and ready-for-client send both open the checklist with exactly the three approved statements and unchecked controls. No save/submit/send request occurs simply by opening it.
2. Zero, one or two checks cannot submit, including keyboard activation. Three checks enable the corresponding final action; unchecking any disables it.
3. Every dismissal path preserves the draft and performs no mutation. Reopening requires fresh checks and restores predictable focus.
4. Confirmation executes one existing save/submit or send sequence, preserves its expected version and Sales-confirmation behavior, and blocks duplicate activation while pending.
5. Changed project/actor, changed draft/version, lost edit eligibility, stale data and request failure cannot reuse an earlier confirmation to submit different content or report false success.
6. Save draft, navigation saves, Designer flows, Client approval and delivery retry remain unchanged. Historical/disabled actions remain blocked.
7. Rendered tests cover both action paths, cancellation/reset, keyboard behavior, stale context, pending/error behavior and role scoping. Browser checks cover the dialog at 390/768/1440 widths with keyboard and accessible-name checks.
8. Run focused workspace/dialog regressions, frontend typecheck/build and `git diff --check`. No backend contract change is planned, so backend-wide tests are not required for this UI slice. Record exact checks, limitations and preserved prior work in the eventual task plan.

## Open decisions

No blocking question remains under the estimator-only, UI-confirmation scope above. The approved [task plan](../plans/2026-11-04-estimator-submission-checklist.md) records execution and verification evidence.

# Remove the Sales estimate submission refresh warning

Status: approved by the user; implemented and verified in Mode A. Verification evidence is recorded in the associated task plan.

## Goal and scope

Remove the specific Sales estimate submission warning shown in the user's screenshot: “Refresh the estimate updates before submitting. Your local edits are preserved.” and its “Refresh estimate access” button. Keep this a localized presentation change in the estimate workspace.

## Current behavior and evidence

- The initial worktree is clean (`git status --short`).
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx:773` chooses this warning when the saved-estimate query or quotation-revision query is in an error state, after checking busy, unknown-save, and version-conflict states.
- The footer renders the warning even before a submission attempt. Clicking Submit records publication feedback, focuses the footer warning, and adds the refresh button (`LeadEstimateWorkspace.tsx:814`, `:862`, `:1457`). This explains the outlined warning in the screenshot; it is not a separate form.
- `frontend/src/features/leads/useQuotationRevision.ts:10` polls quotation updates every four seconds. A failed update request can therefore trigger this state after the estimate initially loads successfully.
- The workspace already has separate query-error notices (`LeadEstimateWorkspace.tsx:1356`). The screenshot alone does not identify the failed endpoint, response, or underlying network/server cause.

## Requirements

1. For the Sales role (`estimator_sales`), suppress this specific refresh-error footer warning and its associated refresh button, before and after activating Submit.
2. Keep footer accessibility references and focus behavior consistent with the rendered UI: no reference to a missing warning and no focus attempt on removed content.
3. Preserve local draft values, existing submission eligibility checks, version checks, permission checks, and the normal confirmation/save/submit sequence.
4. Keep existing query-error feedback available. Removal of this duplicate footer warning must not imply a failed submission succeeded.

## Assumptions and non-goals

- “Remove that” refers to the pictured warning and associated button in the Sales estimation screen.
- Do not remove the submission checklist, other validation messages, or Designer behavior.
- Do not add automatic retries, replacement popups, new forms, dependencies, or broader UI changes.
- Do not change backend APIs, permissions, pricing, approval history, email delivery, or persisted data.
- Repairing the underlying failed request is outside this narrowly requested presentation change. Submission can remain unavailable while an existing freshness/error check is unsatisfied.

## Impacts, constraints, and risks

- UX impact: the pictured duplicate warning no longer appears in the Sales estimate footer.
- Data/API impact: none; no migration or external action is required.
- Main risk: hiding the footer message while leaving an invalid accessibility reference or silently weakening submission checks. Preserve existing error notices and verify the failed-request path.
- Rollback is limited to reverting the scoped frontend change.

## Acceptance criteria and verification

- AC1: With a previously loaded Sales estimate and a failed saved-estimate or quotation-update refresh, the pictured footer message and associated button are absent, including after Submit is activated.
- AC2: Unsaved item edits survive that state, and no save or submission is issued while existing checks prohibit it.
- AC3: Submit has no dangling accessible description and focus remains on a rendered element.
- AC4: After query recovery, the existing Sales confirmation/save/submit sequence still works; unrelated validation and Designer refresh behavior remain intact.
- Verify using focused rendered workspace interaction tests, frontend typecheck/build, and `git diff --check`.

## Open decisions

None. The narrow assumption above follows the user's request to remove only the pictured UI.

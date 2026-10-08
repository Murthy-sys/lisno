# Hide Initial payment on Estimate in progress

## Goal
Remove the Initial payment section shown in the user's screenshot from the Estimate in progress lead screen.

## Current behavior and evidence
- `frontend/src/features/leads/LeadDetail.tsx` maps `estimate_in_progress` to “Estimate in progress” and renders `ProjectWorkflowPanel` whenever the lead has a project.
- `frontend/src/features/workflow/ProjectWorkflowPanel.tsx` renders `ProjectInitialPaymentStatus` for its default full presentation whenever payment data exists.
- `frontend/src/features/finance/DesignPaymentConfirmations.tsx` supplies the screenshot's “Initial payment” and “Awaiting estimate approval” copy. The shared panel is also used by other project workspaces.
- The worktree was clean before this specification was created.

## Scope and requirements
1. Hide the entire Initial payment status section when the lead's stage is `estimate_in_progress`, including its heading, explanation, issue text, and any payment action.
2. Collapse the removed section's space; retain existing surrounding layout and spacing.
3. Preserve lead details, stage selection, Messages navigation, estimate actions, follow-ups, workflow notifications, applicable project progress, and client actions.
4. Preserve Initial payment visibility and behavior for other lead stages and other consumers of the shared workflow panel.

## Approach and constraints
Add a narrowly scoped, default-enabled visibility option to `ProjectWorkflowPanel`; disable it from `LeadDetail` only for `estimate_in_progress`. Keep the existing presentation mode and payment component intact. The visibility condition must apply consistently during initial load, refresh, and lead-stage changes.

This is a presentation-only change. It requires no backend, API, permission, financial calculation, persistence, dependency, or migration changes. It must not change payment confirmation eligibility or recorded payment history. Global removal of the shared payment component is outside scope.

## Assumptions and open decisions
“Estimation in progress” refers to the existing “Estimate in progress” lead stage (`estimate_in_progress`). The request applies to this screen only. No unresolved product decision is required.

## Risks
An overly broad condition could hide payment controls in unrelated project views. Default-on behavior and focused regression coverage must protect those consumers. Hiding the entire workflow panel would also remove unrelated workflow content and must be avoided.

## Acceptance criteria and verification
- **AC1:** An Estimate in progress lead with linked project and Initial payment data does not render the Initial payment region or its screenshot copy.
- **AC2:** Estimate navigation, follow-ups, and other applicable workflow content remain available, without an empty payment placeholder.
- **AC3:** Another lead stage and the shared panel's default presentation retain the existing Initial payment behavior.
- **AC4:** Changing the lead stage updates visibility correctly without changing payment data or permission rules.

After specification and task-plan approval and execution-mode selection, verify the affected rendered lead/workflow behavior, existing payment regressions, frontend typecheck and build, and repository diff hygiene. No deployment, commits, production writes, or migrations are included.

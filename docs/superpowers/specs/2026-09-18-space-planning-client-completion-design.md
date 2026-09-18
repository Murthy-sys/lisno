# Client completion of space planning

## Goal and evidence
After all designer plan images are approved, the project Client needs an explicit Approve button to complete “Designer Uploading Space planning with Tentative look and Feel”. Per-image review already works and must be preserved.

Last-image approval currently calls project-workflow.recordClientDrawingDecision and finalizes the immutable Design plan, generating downstream tasks and opening Finance. Separately, project.service derives the sixth project stage from linked floor-task progress; it exposes no Client completion action. The two sources explain why image approvals do not provide a final stage approval button.

## Decision
Add a separate Client stage confirmation after existing Design approval. Keep image review, design freeze, downstream task generation and finance timing unchanged. Reusing those side effects at the new button would risk duplicate work and change established behavior. Existing already-approved plans can receive this new stage confirmation.

Add `space_planning_complete` to the existing transactional project workflow action. Only the actual assigned project Client may invoke it; representative/admin/designer paths cannot impersonate this Client acknowledgement. This is no expansion of role access and adds no endpoint.

## Source and state contract
- Resolve the project's single canonical approved commercial estimate, preserving finance pinning and immutable estimate version lineage.
- A ready source has a positive Design plan version, exactly one matching approved DesignPlanReviewRound, valid recorded approval evidence, a nonempty current active drawing set, every current revision approved, exact current revision-ID membership equal to the round's submittedRevisionIds, and no open plan feedback. Never infer completion from counts alone or an unrelated estimate/project. Missing, conflicting, stale or malformed sources fail closed.
- The action posts exact `{estimateId, designPlanVersion, reviewRoundId}` alongside existing workflow `expectedVersion` and idempotency key. Compare against the current source in the same transaction; preserve source/assignment race protection. Do not use delivery-version changes as semantic plan identity.
- Persist the approval-source identity, completion timestamp and normal actor/history/audit in DesignWorkflowState. Replays are idempotent; concurrent decisions produce one completion. No new finance/task/email/file effects.
- Project stage completion comes from this explicit confirmation for projects with a Design-plan review source. Complete floor tasks cannot bypass it. Preserve existing floor-only legacy behavior where no Design-plan review source exists; ambiguous source must never trigger legacy fallback.
- Preserve existing workflow prerequisites and pause checks; add the missing sixth-stage activation handling without changing unrelated timers. Previously completed immutable approvals/history stay readable. No write migration.

## API and UX
`DesignStageOperational.spacePlanning` optional projection:
```
{
  estimateId: string,
  designPlanVersion: number,
  reviewRoundId: string | null,
  totalImages: number,
  approvedImages: number,
  readyForCompletion: boolean,
  completedAt: string | null
}
```
Source issues use existing blockingReasons; sensitive source IDs only exposed to existing permitted design workflow audiences. Backend generated availableActions includes `space_planning_complete`, label “Approve and complete stage”, only for the actual Client and eligible state.

Show the approved-image count and review link in this project's space-planning stage; after every image is approved, show the final button. A compact accessible confirmation identifies the plan version and explains the stage will be completed. Capture semantic source identity when opening it; stale versions or changed source require refresh and fresh confirmation. On success refresh workflow/project/client views and show Completed immediately. Keep image review accessible in Client portal. Also surface the same stage completion control beside the images in the expanded approved estimate to avoid forcing navigation; reuse the same workflow action and backend eligibility, no duplicate finalization logic or polling.

## Acceptance and risks
1. Pending/rejected/missing images, empty plans, open feedback, wrong/stale round, unapproved plan or unmet prerequisites cannot complete the stage.
2. Approving all images preserves existing finalization and makes the Client stage button available; no other role receives it.
3. One explicit Client approval completes the stage and stores exact source identity, actor and time. No duplicated tasks, finance, email or Design approvals.
4. Already-approved valid historical plans work; floor-only legacy projections remain compatible; task completion alone cannot complete a review-backed stage.
5. Wrong project/client, stale source/version, replay, concurrent confirmation and approval/read races are tested with asymmetric fixtures and Mongo transactions.
6. Mobile/desktop, keyboard, accessible names, loading/error/stale and post-mutation refresh states are checked in real rendered UI.

Standing autonomous Mode A applies. No commit, deployment, production edits, migrations or customer messages are authorized by this local implementation request.

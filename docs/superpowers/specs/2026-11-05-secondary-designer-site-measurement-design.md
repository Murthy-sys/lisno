# Assign onsite measurement to the Secondary Designer team

Date: 2026-11-05
Status: Approved and implemented in Mode A. Targeted verification passed on 2026-11-06; full-suite failures and verification limits are recorded in the [task plan](../plans/2026-11-05-secondary-designer-site-measurement.md).

## Goal

Use the saved Secondary Designers as the owners of On Site Actual Measurement. Selecting the design team must be sufficient; the Primary Designer should not need to assign another measurement taker.

For projects using the current primary/secondary design-team workflow, remove the separate measurement assignment step. Keep the existing measurement evidence, prerequisites, completion and downstream workflow.

## Current behavior and evidence

- The screenshot shows the Secondary Designers control immediately above an independent **Assign measurement team member** action. The current team has no secondary designers selected.
- `backend/src/services/design-team.service.ts` manages the current workflow, version 3. It saves up to three unique `Project.secondaryDesignerIds`, excludes the primary designer, validates active designers, and synchronizes `assignedDesignerIds`. The Primary Designer manages the team; Super Admin has an existing reasoned override. Updates use a transaction, an authorization coordination fence, `designTeamVersion` CAS and an audit event.
- `backend/src/services/design-workflow-state.service.ts` separately implements `measurement_assign`. It stores one `stages.site_measurement.assignedDesignerId`, selected from the project's assigned designers. `measurement_complete` currently depends on this singleton. Thus selecting secondaries does not assign measurement responsibility.
- The same service already checks active actor/project scope and coordinates authorization mutations inside the action transaction. Measurement completion requires site photos or videos, records the actual actor, uses workflow version CAS and idempotency, and captures the applicable room source. These safeguards must remain.
- `backend/src/services/project.service.ts` supplies a separate measurement-designer candidate list and resolves the singleton assignee for stage facts. `backend/src/domain/design-workflow-instructions.ts` explicitly instructs users to assign a measurement taker.
- `backend/src/domain/project-status.ts` projects either an assignment task for the design team or a completion task for the singleton assignee. It must use the same ownership rule as the action service.
- `backend/src/services/project-workflow.service.ts`, `listDesignerTasks`, already includes workflow-3 projects for their secondary designers. A second task collection or duplicate project task is unnecessary.
- `frontend/src/features/designer/DesignTeamPicker.tsx` saves the team and refreshes collaboration queries. Existing invalidation includes `project-workflow` and `designer`; Project status keys are under `project-workflow`. Preserve and verify this refresh path.
- `frontend/src/features/workflow/WorkflowStageActions.tsx` renders the backend's available actions and has the legacy measurement-assignment dialog. The backend must remove the action for current-team projects and enforce the rule on direct mutation requests too.

## Product decision and assumptions

**Recommended:** measurement is one shared task owned by all currently assigned, eligible Secondary Designers. Any one of them may upload the evidence and complete it once. All see the same project stage and completion history. This accommodates the existing selection of up to three secondaries without introducing another person selector.

An alternative is to designate one measurement lead from the secondaries. That gives one named owner but adds the assignment step the user wants to remove. Automatically choosing the first saved ID is not a valid business rule; the service sorts IDs and does not record a lead preference.

Spec approval confirms the shared-task interpretation. No additional product decision is required under that interpretation.

The primary/secondary team feature exists on estimation workflow version 3. Apply this change there. Preserve the established manual-assignee behavior on older workflow versions, which do not have this team contract.

## Required behavior

1. **One source of ownership.** Derive current measurement owners from the saved project's `secondaryDesignerIds`, joined by stable user ID to active, non-deleted users with the Designer role. Do not copy these into a separate mutable measurement-assignee list or infer ownership from display names, list order, `assignedDesignerIds`, or a legacy singleton.
2. **No second assignment.** Workflow-3 stage actions must omit **Assign measurement team member**. Reject new workflow-3 `measurement_assign` writes through the backend, including forged requests. Historical assignment events remain readable and existing safe idempotent replay semantics remain intact.
3. **Completion by a Secondary Designer.** Offer and accept **Complete measurement** only for a current eligible secondary, while all existing stage prerequisites, approval gates and access-pause rules are satisfied. Being the Primary Designer, a manager, another assigned designer, or Super Admin alone does not grant this completion operation.
4. **No secondary assigned.** Show a clear explanation in the measurement stage: **Assign a Secondary Designer in Design team to carry out onsite measurement.** The pending assignment responsibility belongs to the current Primary Designer through the existing team control. If saved secondaries are all unavailable, explain that an active Secondary Designer is needed. Do not silently fall back to the primary or a historical measurement assignee.
5. **Multiple secondaries.** Show all eligible assigned secondaries as the current measurement team. Project status and responsibility projections identify the same people. One successful completion closes the shared measurement task for everyone; no per-person completion requirement is introduced.
6. **Team changes.** Saving a changed team updates current task ownership, stage facts and action availability. A removed designer cannot perform a new completion, even with an already-open form. A newly assigned eligible secondary can complete the pending stage when its normal prerequisites permit it.
7. **Completed work.** Team changes alone never reopen a completed measurement stage or rewrite its original actor, timestamp, evidence, room-source lineage or history. Completed-stage presentation must distinguish historical completion from the current design team. Preserve other existing workflow invalidation rules.
8. **Evidence and subsequent stages.** Retain required site photos/videos, optional sketch, authenticated file access, evidence validation and cleanup. Preserve kickoff/key handover requirements, site-access reporting/restoration, clock rules and downstream furniture/drawing gates. An unassigned team does not reset or pause the stage clock.

## Permission matrix for workflow-3 measurement

| Actor | Manage Secondary Designers | See measurement stage | Complete measurement |
| --- | --- | --- | --- |
| Current Primary Designer | Existing permission | Existing project scope | No, primary assignment alone is insufficient |
| Current active Secondary Designer | No new permission | Existing project scope | Yes, with normal workflow prerequisites and evidence |
| Removed secondary / unrelated designer | No new permission | Existing scope checks; no residual access from old assignment | No |
| Inactive, deleted or wrong-role former secondary | No | Existing active-user checks | No |
| Super Admin | Existing reasoned and audited team override | Existing operation-specific scope | No new override |
| Client / authorized client representative | No | Existing restricted view | No; existing access-report and restore actions remain |
| Manager, Sales, Finance, Procurement or Site Manager | No new permission | Existing operation-specific scope | No new permission |

The UI follows backend capabilities; hiding an action is not authorization enforcement. Do not expose team candidates, evidence or internal facts to additional roles.

## Data, API and transaction contract

- Keep `Project.secondaryDesignerIds` authoritative for current ownership. Keep `designTeamVersion`, workflow `version`, approval versions and immutable history as separate existing contracts.
- Resolve eligibility from current backend project/user records for both action availability and mutation validation. Reuse a consistent rule in workflow/status projections so screens cannot disagree about the owner.
- Use existing team and workflow endpoints. Retain the measurement-assignment action/schema for supported legacy projects. No new role, collection, assignment endpoint or database migration is required.
- Return backend-derived owner facts, blockers and available actions through the established workflow/status projections. Extend a typed response only if existing fields cannot express the agreed behavior; synchronize frontend types and OpenAPI for any such extension. Do not make the frontend reconstruct authorization from team labels.
- Preserve the common authorization mutation coordination used by both team changes and workflow writes. Re-read current membership inside the transaction. If removal commits before completion, the removed member's completion must fail; if completion commits first while authorized, its immutable history remains valid after removal.
- Preserve workflow CAS and idempotency. Concurrent completion attempts by two secondaries result in one completion and one evidence/history transition. A stale competing request receives the established conflict response; safe retries do not duplicate events or orphan stored uploads.
- Preserve existing audit events for team changes and measurement completion. Do not create a synthetic measurement-assignment event merely because a secondary was selected. Logs and responses must not expose tokens, private file references or unrelated project data.

## UI and cross-screen behavior

- Keep the Design team section and existing Secondary Designers selector as the assignment control. Add concise responsibility guidance there if needed: **Secondary Designers carry out onsite measurement.**
- In the measurement stage, present **Secondary Designer** or **Secondary Designers** with the current eligible names, and the existing completion action only when allowed. Eliminate current-workflow instructions that tell users to assign a separate measurement taker.
- The Primary Designer can monitor progress and manage the team. Secondaries can complete the task from their existing project workflow. Project status and existing designer-task next-step text use the same backend-derived responsibility.
- Preserve loading, error and stale-query states. A failed team save must not display draft selections as committed owners. After a successful save, refresh the team, workflow, project status and affected designer-task queries through existing invalidation where sufficient.
- On a stale membership/version error during completion, retain safe recoverable form state, show the established error and refresh permissions. Do not optimistically claim completion.
- Reuse existing controls and theme. Names and helper text must wrap on narrow screens; keep keyboard access and accessible control names. This is a workflow correction, not a page redesign.

## Compatibility, scope and non-goals

Existing unfinished workflow-3 projects immediately derive responsibility from their saved secondary team, even if they have an old measurement singleton. If no eligible secondary is saved, team assignment is needed. Do not mutate or erase the old stored field or its history during reads.

Existing completed stages remain completed. Legacy projects retain their current assignment and completion behavior. No bulk backfill, seed, live migration, notification campaign, deployment or external communication is included. This change does not alter estimation, Sales baskets, recommendations, Client visibility, quotation amounts or approval authority.

Code rollback is possible without reversing stored data because no schema migration or reassignment rewrite is planned. However, old code may again require its legacy singleton for an unfinished workflow-3 stage; rollback must explicitly account for this behavioral limitation rather than inventing historical assignments.

The worktree contains earlier uncommitted Client visibility, Sales basket and recommendations changes. Preserve them. In particular, `ProjectWorkflowPanel.tsx` and its test already contain Client visibility work; capture their per-target diff before any later implementation and avoid unnecessary edits there.

## Risks and constraints

- A UI-only removal would leave inconsistent backend authorization and Project status tasks. All ownership consumers need the same rule.
- Assigning all secondaries is a shared responsibility model. The UI must state this clearly and preserve one completion event.
- Team removal and measurement submission can race. Real replica-set transaction tests must verify authorization ordering; unit tests alone are insufficient.
- Historical singleton fields and completed actors must not be misrepresented as current secondary ownership.
- Inactive secondary records, stale browser state and projects with no secondaries must remain actionable without broadening permissions.
- No dependency or lockfile change is expected. No repository lint script exists.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence after implementation |
| --- | --- | --- |
| AC1 | Saving one eligible Secondary Designer makes them the measurement owner without a second assignment. | Team/workflow integration regression and rendered Primary/Secondary journeys. |
| AC2 | With two or three eligible secondaries, each sees the same pending task and any one can complete it once. | Distinct-actor permission tests, project status owner assertions and shared-stage completion regression. |
| AC3 | With no eligible secondary, the stage explains the team assignment needed; the Primary Designer is responsible for resolving it. | Zero-secondary and inactive/deleted/wrong-role cases; stage/status UI checks. |
| AC4 | Primary, unrelated, removed and inactive designers cannot complete through direct API requests; workflow-3 manual-assignment writes are rejected. | Asymmetric role and two-project tests, including stale forms and historical singleton values. |
| AC5 | Team updates and completion serialize safely; competing completion attempts cannot create duplicate completion/history/evidence. | Replica-set tests covering removal-before-submit, completion-before-removal, simultaneous secondary completions, CAS, idempotent retry and compensating media cleanup. |
| AC6 | Existing evidence requirements, prerequisite/access gates, clock semantics, downstream transitions and completed history remain intact. | Focused measurement-media, workflow-state, submission-gate and projection regressions; team changes after completion. |
| AC7 | Workflow-3 stage facts, instructions, task next steps and Project status consistently identify secondary responsibility; successful team saves refresh these views. | Backend projection/responsibility tests and frontend query/interaction checks, including failed saves and stale data. |
| AC8 | Older workflows keep manual measurement assignment and its existing permissions. | Legacy assignment/completion and history regressions. |
| AC9 | The existing layout remains readable and operable for desktop/mobile and keyboard users, with current Client restrictions preserved. | Rendered checks at approximately 1440px and 390px, long/multiple names, empty/pending/completed states, keyboard/accessibility and Client visibility regressions. |

Relevant existing coverage includes `design-team.replica-set`, `design-workflow-state`, `design-workflow-projection`, `design-workflow-submission-gates`, `workflow-measurement-media`, `project-status`, `project-status-user-responsibilities`, and designer-task tests, plus frontend `DesignTeamPicker`, `WorkflowStageActions.measurement`, designer progress/task and Project status tests. Confirm exact test paths and fixtures in the task plan.

Run focused regressions first, backend/frontend typechecks and builds, and broader suites proportionate to the shared authorization/projection changes. Run transactional tests against a replica set and report any environment limitations rather than weakening assertions. Final verification includes `git diff --check`, worktree review and cleanup of temporary browser/build artifacts according to repository policy.

## Open decisions and approval boundary

No unresolved decision beyond confirming the recommended shared-task interpretation. This specification is the only new artifact at this gate. The separate dependency-ordered task plan follows specification approval; implementation follows plan approval and the execution-mode choice required by `AGENTS.md`.

# Designer design upload after furniture dimensions: task plan

Source of truth: [approved specification](../specs/2026-09-30-designer-design-upload-unlock-design.md). Status: implemented and verified in Mode A on 2026-09-30.

## Contract to implement

- For the sixth project stage, `operational.status` and `operational.blockingReasons` describe whether stage work can begin. Compute them from payment, pause, stage prerequisites, the existing `phase: "upload"` gate, and genuine approved-source conflicts. A normal assigned `v0` plan without a submitted review round is active, not blocked.
- Add optional `operational.spacePlanning.completionBlockingReasons: string[]` to carry the full final-submission and current-review requirements, distinct from stage entry. Keep `spacePlanning.readyForCompletion` and the Client-only `space_planning_complete` action authoritative for finishing the stage. Existing response consumers may omit the new optional field.
- Classify a clean, unsubmitted `v0` plan as awaiting upload/review rather than a corrupted review source. A version-zero source with conflicting rounds, drawings, approvals, or other inconsistent evidence remains fail-closed. Preserve the canonical project/estimate linkage and structural source-conflict blocker.
- The Designer page continues to require the current sixth stage, a permitted design task status, a successful current workflow response, and a usable operational projection before editing. It uses backend entry blockers, never completion reasons, for the file picker. Backend upload/submission/Client-completion endpoints keep their existing authorization and validation.

## Dependency-ordered tasks

| Order | Owner and affected area | Work | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Primary: contract and baseline | Capture worktree status and relevant target diffs before writers. Add or identify a deterministic assigned-`v0` fixture with five completed stages and a canonical approved estimate. Record the present failing projection/UI assertion. | AC1, AC3; the failure reproduces the reported lock without live project data. |
| 2 | Backend slice: `backend/src/domain/workflow-space-planning.ts`, `backend/src/services/design-workflow-state.service.ts`, and focused backend tests | Separate ordinary pre-review guidance from malformed source evidence. Derive stage entry blockers from upload-phase rules while retaining structural source and stale-completion blockers. Project completion blockers separately; do not change persisted state, transactions, action eligibility, or upload API rules. | AC1, AC2, AC3, AC4; assigned `v0` is active, genuine blockers still block, Client completion still requires exact approved source. |
| 3 | Frontend slice: `frontend/src/features/workflow/projectWorkflowApi.ts`, `ProjectWorkflowProgress.tsx` or `SpacePlanningCompletion.tsx`, `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx`, and focused frontend tests | Align the optional DTO type. Show completion requirements as review guidance without a locked-stage presentation. Render first-upload controls and correct next action only when backend stage entry is eligible. Refresh workflow and task queries after relevant design mutations; preserve loading/error, project-switch, submitted, and approved behavior. | AC1, AC3, AC5; file input is usable for the assigned eligible project and never for a blocked or stale one. |
| 4 | Primary integration and final verification | Reconcile the backend/frontend contract and final diff. Run focused regressions, typechecks, builds, authorization/source checks, and rendered keyboard/accessibility and desktop/mobile checks. Fix confirmed failures within the approved scope and rerun affected checks. | AC1–AC6, including hygiene and no unintended file changes. |

Tasks 2 and 3 can run in parallel after the exact optional field and entry-blocker meaning above are accepted. Their file ownership does not overlap. In Mode A, assign those slices to native backend and frontend subagents, then run an integrity review and final verification on the integrated worktree. In Mode B, the primary agent performs the same work sequentially without implementation subagents. The primary owns shared contract decisions, this plan, and reconciliation in either mode.

## Focused regression matrix

- **Backend source and projection:** assigned `v0` with no round; submitted but pending images; approved current round; no-furniture and required-room furniture paths; unconfirmed payment; incomplete predecessor; paused site access; ambiguous or foreign approved source; malformed `v0` with artifacts; stale stored completion; legacy floor-only source. Assert stage status, entry blockers, completion blockers, and Client action independently.
- **Backend enforcement:** verify an authorized draft upload remains governed by the existing upload phase; final submission and Client acknowledgement still reject missing furniture approval, wrong round/version/project, open feedback, or missing Design approval. Confirm only the assigned Client can complete and no new write occurs from reading the workflow.
- **Frontend interaction:** assigned `v0` displays an active sixth stage, “Upload the design plan”, and accessible file picker; first upload succeeds and refreshes the selected project. Blocked/paused/failed refresh remains read-only. Existing images remain visible; submitted/approved views stay read-only; a project switch does not reuse another estimate's picker or files. Client completion guidance does not offer the action prematurely.

## Verification commands and evidence

Run focused suites first, then widen only for confirmed shared-contract risk:

```text
cd backend && npm test -- tests/workflow-space-planning.test.ts tests/design-workflow-state.test.ts
cd backend && npm test -- tests/workflow-space-planning.replica-set.test.ts
cd frontend && npm test -- src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/workflow/SpacePlanningCompletion.test.tsx
cd backend && npm run typecheck && npm run build
cd frontend && npm run typecheck && npm run build
git diff --check && git status --short
```

Inspect the rendered Designer workspace at narrow mobile and desktop widths with the same deterministic eligible and blocked states. Check file input label, keyboard focus, stage status, next action, and console/network errors. If the local runtime cannot expose a representative project safely, use an isolated mock response for browser QA and report that limit. No seed, migration, deployment, commit, push, production mutation, or customer message is part of this plan.

## Completion record

- AC1 and AC3: the backend now separates sixth-stage entry from completion blockers; the Designer page checks the current stage, assigned task, matching source, payment, pause, and fresh workflow state. Focused source and page regressions passed. Synthetic browser QA showed the picker and upload action at 1280px and 390px for the eligible state, and a read-only blocked state at 390px.
- AC2 and AC4: Client completion and final submission remain on their existing stricter gates. Unit, adjacent workflow, and Mongo replica-set regressions passed, including historical reviewed commercial drawings and malformed-source rejection.
- AC5: mutation invalidation and read-only submitted/blocked behavior passed focused frontend tests. Saved images remain visible during failed refresh.
- AC6: backend focused unit/design-state 320/320, backend Mongo replica-set 13/13, adjacent backend workflow 64/64, frontend focused 84/84, and both workspaces' typechecks and production builds passed. Final furniture regression passed 6/6. Browser checks found no overflow, page error, console error, or axe violation in the tested states. `git diff --check` passed; only intended source, tests, specification, and plan paths were present.
- The browser scenario used isolated synthetic responses; no live project or production data was changed or verified. An unrelated existing denied-state enterprise transport fixture test fails on the untouched baseline because two chat requests receive unregistered mock responses. A pre-existing PageHeader ARIA item was incomplete in axe's manual-review category. No seed, migration, deployment, commit, push, or customer message was performed.

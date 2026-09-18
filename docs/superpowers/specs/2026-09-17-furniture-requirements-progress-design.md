# Existing-furniture requirements: saved progress and next step

## Authority and goal

Fix the reported Designer workspace: a successful furniture declaration still shows the same declaration action and generic In progress badge. Standing autonomous Mode A authorization applies; no approval pause, commit, deployment or production mutation. Preserve prior uncommitted measurement upload work, snapshotted under `/tmp/lisno-furniture-completion-qa/initial-*`.

## Evidence and source of truth

- `design-workflow-state.service.ts` saves furniture scope/room requirements correctly. Declaration stays available until Client acceptance; its label never changes. The projection only exposes the generic stage status.
- `DesignerDesignPlanTasksPage.tsx` uses the first available action as Next action; `ProjectWorkflowProgress.tsx` uses the generic status label. Consequently a saved editable declaration still appears to be unfinished.
- `WorkflowStageActions.tsx` initializes reopened room selection to empty and no-furniture to false. Mutation invalidation already refreshes shared workflow, Designer and Client queries.
- Current workflow instructions and tests require Client acceptance, even for no furniture. Required rooms subsequently need dimensions or explicit Client permission to proceed. Completion timestamps and submission gates already enforce this. No evidence of lost persistence was found; no production state was inspected.

## Scope and recommended behavior

Preserve the existing lifecycle and make its saved state explicit. Declaration alone completes the Designer's declaration step; the collection stage remains pending until Client requirements are satisfied. Do not fabricate completion or bypass acceptance merely to change the badge.

1. Before declaration: Declare existing-furniture requirements.
2. After declaration: persistent Requirements saved guidance; badge Awaiting Client acceptance; Designer next action Await Client acceptance of furniture requirements. Keep a secondary Edit furniture requirements action until acceptance, prefilled from saved room IDs and required flags/no-furniture selection.
3. After Client acceptance with unresolved rooms: Awaiting furniture dimensions, with required/ready/pending room counts and guidance for Client upload or permission to proceed. Designer header names this actual pending step.
4. After all required rooms are resolved, or no-furniture scope is accepted: existing Completed status; next stage becomes current; declaration/edit action is absent. Dimensions can still be supplied later where existing rules allow.
5. Prerequisite/blocked/paused statuses take precedence over phase-specific labels. Role-authorized actions and all existing version/retry/dirty behavior remain authoritative.

## Additive API contract

For the existing-furniture stage only, add optional `operational.furniture`:

```ts
{
  phase: 'requirements_pending' | 'awaiting_client_acceptance' | 'awaiting_dimensions' | 'completed';
  notApplicable: boolean;
  requiredRoomCount: number;
  readyRoomCount: number;
  pendingRoomCount: number;
}
```

Derive phase from existing rooms, acceptedAt and authoritative completedAt. Count readiness only among required rooms; ready means uploaded dimensions or explicit proceed permission. No stored schema field, new action ID, endpoint, migration or dependency. Dynamic existing furniture_scope label becomes Edit furniture requirements after a scope exists. Old responses without this optional object retain existing UI behavior.

Frontend uses a shared selector for phase-specific labels and Designer next-step guidance, retaining canonical TaskStatus for ordering and completion. Display a compact persistent summary in the operational details, shared across Designer/Client/full presentations. Avoid redundant cards or a screen redesign.

## Invariants, failure and compatibility

Client acceptance, room-scoped submission gates, actor identity, audit history, idempotency, version/CAS, optional on-behalf proof and existing evidence retention remain unchanged. No auto-acceptance, approval rewrite, data backfill, notification/email side effect or production mutation. Existing scope re-save behavior remains possible before acceptance; selected room IDs are prefilled from authoritative state and reconciled with current project room options. Refresh failures/stale forms must not claim completed state. Existing measurement uploads must be preserved.

## Acceptance criteria

- AC1: Saving requirements refreshes the Designer header, stage badge and persistent details to the actual pending Client step without manual refresh or repeated Declare wording.
- AC2: Reopening Edit retains saved required rooms and no-furniture selection; accepted/completed declarations cannot be edited through the UI.
- AC3: Client acceptance and partial/complete room upload/proceed states show correct phase/counts; no-furniture is complete only after acceptance. Reload preserves the same projection.
- AC4: Prerequisite, blocked, role, stale/version and downstream submission rules remain intact; no new persistence or permission expansion.
- AC5: Focused lifecycle, projection and full page POST/refetch regressions, relevant typechecks/builds, read-only review and rendered desktop/mobile accessibility checks pass.

## Open decisions and non-goals

No unresolved decision blocks this correction. The intended multi-person lifecycle is established by current domain rules and tests. Changing who must accept or completing the whole stage on Designer selection would materially change approval behavior and is outside this bug fix.

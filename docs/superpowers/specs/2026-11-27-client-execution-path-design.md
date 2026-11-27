# Client execution path after key collection

Date: 2026-11-27
Status: Approved by the user on 2026-11-27 and implemented locally in Mode A; verification results and limits are recorded in the task plan
Classification: Substantial, with immutable client-decision and authorization requirements

## Goal and confirmed scope

After key collection is completed, the project's linked Client can choose and save exactly one of two execution paths. The saved choice is permanent and visible to the Client and authorized project staff.

The user explicitly confirmed: **Save and display the permanent choice.** This change does not enforce completion of each listed phase or change existing stage progression.

| Choice | Exact displayed sequence |
| --- | --- |
| Option 1 | 2D layout → 3D layout → Selections → Renders → Production |
| Option 2 | 3D layout → Renders → Selections → Production |

“redenders” is interpreted as “Renders”; “selection” and “selections” use the consistent display label “Selections”. Option 2 deliberately omits 2D layout. The relative order of Selections and Renders must remain different between the two options.

## Current behavior and evidence

Investigation on 2026-11-27 began with a clean `git status --short`. The following evidence describes the baseline before implementation; implementation and verification results are recorded in the [approved task plan](../plans/2026-11-27-client-execution-path.md).

- `backend/src/domain/design-workflow.ts` initializes six project stages: Internal Kick off, Client Kick off, Key Collection, On Site Actual Measurement, Collection of existing furniture dimensions, and space planning with tentative look and feel. It has no saved execution-path choice or separate stage types matching both requested sequences.
- `backend/src/domain/design-workflow-state.ts` stores key handover and receipt separately. Its prerequisite checks require `key_collection.completedAt`, `handedOverAt`, and `receivedAt`; a scheduled appointment or one confirmation is insufficient.
- `backend/src/services/design-workflow-state.service.ts` implements transactional, versioned actions, idempotency history, and role/project checks. Key-collection scheduling and space-planning completion already restrict particular actions to the actual linked Client, despite broader representative capabilities on the shared action endpoint.
- `backend/src/models/DesignWorkflowState.ts` is the strict persisted schema. The memory and Mongo implementations of `saveDesignWorkflowState` in `backend/src/repositories/memory.ts` and `mongo.ts` use expected-version checks. Mongo creation also handles concurrent first writes.
- `backend/src/services/project.service.ts` builds the authorized design-workflow response from saved project stages and operational state. It is the appropriate source for the choice, eligibility, and locked-state projection.
- `frontend/src/features/workflow/ProjectWorkflowPanel.tsx` hosts the shared web workflow for Client and staff presentations. `projectWorkflowApi.ts` defines the client contract; `useRefreshDesignWorkflow.ts` invalidates the affected project/workflow queries.
- `mobile/src/features/workflows/WorkflowWorkspace.tsx` consumes the same endpoint. Its existing action forms demonstrate identity-scoped queries and same-command retry handling.
- `backend/src/domain/route-operations.ts` registers the common workflow action route with broad operation-level access. The new action needs an explicit personal Client check in the service; inheriting representative or Super Admin capability would violate this request.
- Existing appointment and workflow-state tests provide reusable patterns for both-confirmation prerequisites, permission checks, idempotency, transactions, and races. The proposed choice has no current implementation or regression coverage.

## Product requirements

### Availability and ownership

1. Show the choice in the project's workflow after the completed key-collection milestone, using the server's eligibility projection.
2. A Client can save only for the project to which that active identity is linked. Require all three recorded key-collection completion fields described above. Do not infer completion from a date, appointment, UI progress percentage, or elapsed timer.
3. Before completion, display a concise waiting state: **Available after you and your Designer confirm key collection.** There is no actionable save control.
4. Eligible projects start with neither option selected. Merely opening the project, selecting a radio option, navigating away, or cancelling confirmation must not persist a choice.
5. Only the Client can make the selection. Designers, managers, administrators, Super Admin, and client representatives can read it only within their existing project visibility and cannot select on the Client's behalf.
6. Missing workflow configuration or inconsistent completion evidence yields an explicit unavailable state. Reads must never create workflow state, manufacture a choice, or repair historical records.

### Save and permanent lock

1. Present both complete sequences before the Client saves. The selected option remains an unsaved local draft until explicit confirmation succeeds.
2. Use **Save execution choice** to open a confirmation that repeats the selected option and sequence, with the warning: **Once saved, this choice cannot be changed or revoked.**
3. The confirmation offers **Save permanently** and **Go back**. Cancelling preserves the local selection without a request. There is no preselected default or automatic save.
4. After a successful save, replace editing controls with the option, its ordered sequence, **Saved permanently**, and the saved timestamp. There is no edit, undo, clear, revoke, or staff-override action.
5. Persist server-recorded actor identity, timestamp, and history linkage. The choice remains locked after page reload, logout/login, another device, unrelated workflow changes, quotation revisions, or designer reassignment.
6. Record selection only. Saving neither starts Production nor marks any phase complete, changes approvals, creates downstream tasks, changes procurement permissions, nor updates deadlines or timeline configuration.

## User experience and presentation

- Add a focused **Execution choice** section adjacent to the existing key-collection/workflow content on web and in the native project workflow. Keep the current project navigation and design system.
- Use two clearly labelled radio rows with their complete ordered sequences, not a generic card grid. On narrow screens render each sequence vertically or with natural wrapping without horizontal page overflow.
- After save, show only the chosen sequence as a read-only **Planned sequence**. It is a description of the agreed path, without invented phase completion, progress, deadlines, or action buttons.
- Authorized staff see either **Awaiting Client selection**, the pre-key-collection waiting state, or the saved choice. Do not expose edit controls or imply that staff can override the Client.
- Support loading, unavailable, failed initial load with retry, eligible-unsaved, confirmation, saving, saved, stale-version conflict, and uncertain network-result states. Never convert a failed read into an empty editable choice.
- Disable duplicate submits synchronously and during saving. Keep the exact request and idempotency key for retry after a timeout or lost response. Resolve an uncertain save before allowing a different option to be submitted.
- On a stale version, refetch the canonical state. If another tab/device saved a choice, show that locked choice and explain the conflict; do not silently submit the local alternative. If no choice was saved, let the Client review the refreshed state and explicitly confirm again.
- On success, retain a local locked presentation while canonical data refreshes; a failed refresh must not reopen the form. Invalidate existing project/workflow queries and refresh other displayed consumers through established cache mechanisms.
- Reset drafts and pending presentation state on project or authenticated-identity changes. Remove private data when access is lost. An older server response lacking the new field must not enable selection.
- Web controls use a fieldset/legend, radio labels, visible keyboard focus, and an accessible confirmation dialog with focus return. Native controls expose radio selection and disabled/busy states to assistive technology. Announce saves and errors, and preserve readable order at increased text sizes. No new motion or visual dependencies are needed.

## Data and API contract

### Source of truth

Extend `DesignWorkflowState` with an optional typed `executionChoice` record. Absence means **not selected**, never Option 1. Use the existing project workflow state and transaction boundary instead of introducing a competing settings source.

The immutable record contains:

- `optionId`: stable `option_1` or `option_2`.
- `definitionVersion`: `1` for these exact sequences.
- `phaseIds`: a server-generated immutable sequence snapshot using `layout_2d`, `layout_3d`, `selections`, `renders`, and `production`.
- `selectedAt`: server UTC timestamp.
- `selectedById`: the authenticated linked Client ID.
- `historyEventId`: the immutable workflow event ID.
- `keyCollectionStageId`: the stable saved stage ID used as the eligibility source.

Keep option definitions in one dependency-free contract shared with the web and native consumers, following the existing shared-contract convention. Never accept phase order, display labels, actor IDs, or timestamps from the caller. Version future option definitions without altering existing choices.

The record and matching history event are written together. All workflow save paths must preserve an existing choice exactly, including its snapshot and attribution. Enforce preservation in both repository implementations, not only in the selection action. Any inconsistent saved record is unavailable for mutation rather than treated as an empty choice.

### Read projection

Add a typed `executionChoice` projection to `GET /projects/:projectId/design-workflow` with:

- `status`: `waiting_for_keys`, `available`, `locked`, or `unavailable`.
- `version`: the current workflow version for compare-and-swap.
- `canSelect`: server-derived capability for the requesting identity.
- `blockingReason`: a safe explanation when applicable.
- the versioned option definitions needed for presentation.
- `selection`: the saved option, ordered phase labels/IDs, and timestamp, or `null`.

Reuse existing authorized workflow/history access for attribution; do not expose additional contact data or raw private evidence. A saved choice stays locked even if a later unrelated source problem prevents other workflow actions. Never grant additional project read access for this feature.

### Write command

Extend the existing `POST /projects/:projectId/design-workflow/actions` contract with `execution_path_select`:

```json
{
  "expectedVersion": 7,
  "action": "execution_path_select",
  "stageId": "<saved-key-collection-stage-id>",
  "idempotencyKey": "<unique-client-command-id>",
  "data": {
    "optionId": "option_1",
    "definitionVersion": 1,
    "acknowledgedIrreversible": true
  }
}
```

- Validate a strict action-specific schema. Reject unknown options, unsupported definition versions, false/missing acknowledgment, extra choice fields, or evidence uploads. The acknowledgment records the Client's explicit confirmation; it is not an authorization mechanism.
- Recheck active identity, linked Client ownership, stage identity, completed keys, record absence, and expected version inside the transaction. Broad route access must never bypass the personal Client requirement.
- Preserve the existing response shape `{ version }`; fetch the canonical projection after success.
- A matching idempotency retry by the same authorized actor returns success without another decision, audit event, timestamp, or version increment. Reusing a key with different data or another actor is a conflict.
- Once a choice exists, every fresh save attempt, including the same option with a new command key, is rejected as already selected. No replacement or deletion endpoint is added.
- Use existing safe not-found/forbidden behavior for inaccessible projects, validation errors for malformed inputs, and explicit 409 conflicts for unmet prerequisites, stale workflow versions, or a locked choice.
- Persist the choice, history event, and required audit atomically. A failed validation, conflict, or transaction leaves no partial choice/history/audit. Concurrent first selections must result in one winner.
- Synchronize runtime schemas, OpenAPI, typed consumers, action-history labels, and route-operation contract tests. Reusing the route must not broaden its existing permission assignments.

## Permission matrix

| Identity | Read choice | Save initial choice | Change or revoke |
| --- | --- | --- | --- |
| Active linked Client | Existing project access | Only after completed key collection | Never |
| Assigned Designer or other authorized staff | Existing project access | Never | Never |
| Admin / Super Admin / Client representative | Existing operation-specific scope | Never | Never |
| Unrelated, inactive, or unauthenticated identity | Denied under existing access rules | Never | Never |

## Compatibility, scope boundaries, and operations

- Existing projects have no default selection. If their saved workflow proves key collection completed, the linked Client can make the same one-time choice. The selection applies prospectively and does not relabel or rewrite completed work.
- Legacy projects without a configured key-collection stage remain readable and show an unavailable choice. This change does not initialize or migrate them during a read.
- Additive backend changes can precede UI rollout. Older clients continue their current workflow; newer clients fail closed when the projection is absent or unsupported.
- Preserve existing key-collection appointments, both confirmations, measurement/furniture requirements, space-planning approvals, task generation, financial state, selection-request mechanisms, and production/work-order rules.
- Excluded: phase-by-phase enforcement, 2D/3D authoring or viewers, render upload workflows, new approval rounds, Production workflow redesign, proposal/PDF changes, reminders/email, and timeline recalculation.
- No dependency or lockfile changes are expected. No seed, backfill, live migration, external notification, deployment, commit, or push is authorized by this specification.
- Rollback should disable the new selection UI/action while retaining saved choices and audit history. Do not roll back by deleting choices or deploying a writer that can discard the new field; forward-fix compatibility if needed.

## Risks and acceptance criteria

The main risks are accidental irreversible confirmation, representative-access bypass, conflicting saves from multiple devices, loss of the field during an unrelated state write, and confusing the displayed sequence with enforced progress. Explicit confirmation, server-only ownership and eligibility, transactional compare-and-swap, preservation checks, and honest read-only sequence labels address these risks.

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Both exact sequences render correctly; Option 2 omits 2D and puts Renders before Selections. | Shared-definition and rendered web/native tests. |
| AC2 | Choice becomes available only after both key confirmations and saved stage completion. | Neither/one/both confirmation fixtures; malformed or missing stage evidence; direct API rejection. |
| AC3 | Only the active linked Client can save. | Two different projects/Clients, inactive Client, assigned Designer, Admin, Super Admin, and representative cases through service and HTTP authorization. |
| AC4 | Selecting locally or cancelling makes no write; final confirmation warns clearly and saves once. | Rendered interaction, confirmation focus, duplicate-click, and keyboard/accessibility checks. |
| AC5 | Refresh and another authorized session/device show the same locked choice and timestamp; no role can replace or clear it. | Persistence/read tests, direct repeat/alternate save attempts, staff read-only checks. |
| AC6 | Concurrent different choices produce one committed record/history/audit; same-command replay is idempotent. | Mongo replica-set race, retry, idempotency mismatch, stale-version, and audit-failure rollback tests; memory parity. |
| AC7 | Unrelated workflow writes cannot erase or alter the record. | Repository preservation tests and regressions for later workflow actions/hydration/submission paths. |
| AC8 | Existing projects receive no fabricated default, stage completion, task, approval, financial change, or deadline change. | Before/after state assertions, legacy read/no-write checks, existing workflow regressions. |
| AC9 | Failed loads, stale state, uncertain saves, identity/project changes, and older API responses remain safe and understandable. | Web/native rendered state tests, cache invalidation checks, timeout/replay and conflict scenarios. |
| AC10 | New contracts remain aligned and UI fits desktop/mobile without inaccessible controls or overflow. | OpenAPI/operation checks, applicable typechecks/builds, rendered responsive QA, and `git diff --check`. |

Verification during implementation must start with focused choice and existing key-collection/workflow tests, then run applicable backend/frontend typechecks, tests, and builds. Include native typecheck, focused Jest interaction/contract checks, and an Android export when the native surface changes. Replica-set tests are required for the transactional mutation. Record actual commands/results and any environment limits; this specification stage does not claim implementation verification.

## Assumptions and open decisions

- Confirmed by the user: save/display the permanent choice only; stage-by-stage enforcement is outside this change.
- Evidence-backed interpretation: “after key collection” means the existing completed stage with Client handover and Designer receipt, rather than appointment scheduling alone.
- Approved scope: cover both web and the existing native workflow so the permanent choice is consistent across Client entry points.
- Approved compatibility: eligible existing projects may choose without a backfill or historical rewrite.
- The user approved this specification and its separate task plan, then selected Mode A. Local implementation and verification are authorized; external actions remain outside scope.

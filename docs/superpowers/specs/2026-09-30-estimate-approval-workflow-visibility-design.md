# Show project progress only after estimate approval

Status: approved; Mode A implementation verified locally on 2026-09-30.

## Goal

Show the “Design workflow / Project progress” timeline from the screenshot only after the project's Estimate has been approved by the Client or recorded as approved on the Client's behalf through the existing proof-backed process. Before that approval, the six stages and their details must not appear.

## Current behavior and evidence

- `ProjectWorkflowPanel.tsx` fetches `GET /projects/:projectId/design-workflow` and renders `ProjectWorkflowProgress` for every successful response. The shared panel is used by Client, Designer, Admin, Manager and Estimator project views. `ProjectWorkflowProgress.tsx` renders the “Project progress” heading and stage navigation even when all six stages are locked. The supplied screenshot shows this preapproval state.
- `project.service.ts` builds the workflow response from saved stages and operational state regardless of whether an approved Estimate exists. It does not expose a dedicated estimate-approval status to the frontend.
- Estimate decisions from the Client portal and the proof-backed Admin on-behalf flow both set the Estimate to `client_approved`; the review round records whether the source was `client_portal` or `admin_proof`. The repository's `findDesignWorkflowRoomContext(projectId)` already resolves the project-linked approved Estimate, validates its version against the established finance/source rules and returns `null` when no approved source exists. Ambiguous or inconsistent sources raise `RepositoryConflictError`.
- `initialPayment.status` can be `awaiting_estimate_approval`, `awaiting_payment` or `received`. Its service returns `received` directly when payment was previously confirmed, so it is not an exact read of current Estimate approval and should not become the display gate.
- The worktree already contains uncommitted Designer upload and furniture-panel work. In particular, `backend/src/services/project.service.ts` and `frontend/src/features/workflow/projectWorkflowApi.ts` have existing edits that must be preserved.

## Scope and requirements

1. Add a read-only, project-specific Estimate approval visibility status to the existing design-workflow response. The status is `approved` only when the backend resolves the canonical linked `client_approved` Estimate under the existing source/version checks. It must cover both Client portal approval and approved on behalf of Client with proof, without inspecting actor labels in the browser.
2. Distinguish `awaiting_approval` from `source_issue` when the approved source is ambiguous or inconsistent. Treat missing, unknown and `source_issue` statuses as ineligible for rendering the progress timeline. A valid approved Estimate with zero rooms still qualifies.
3. Gate the shared `ProjectWorkflowProgress` render in `ProjectWorkflowPanel`, including its stage navigation portal, selected-stage details and actions. The rule applies consistently to all current callers and presentation modes. Keep unrelated project content, estimate review, initial-payment information and `ProjectClientActions` in their existing positions.
4. Do not flash the timeline during loading, after a failed initial request, or while the response omits the new field during mixed-version rollout. A previously confirmed approved response may remain visible with the panel's existing stale-refresh warning if a later refresh fails; a successful response with a nonapproved or conflicted status hides it.
5. Refresh the workflow query after successful Estimate approval in the Client and Admin on-behalf decision paths that can leave a project view cached. Existing periodic refetch remains a fallback. A request for changes must not reveal the timeline.
6. Keep backend workflow action authorization, payment checks, immutable approval history, project identity and source/version enforcement unchanged. Frontend visibility is presentation logic, never an authorization decision. No schema migration or persisted field is expected.

## Recommended approach and contract

- Add an optional `estimateApprovalStatus: "approved" | "awaiting_approval" | "source_issue"` field to the `DesignWorkflow` API shape, backend DTO, OpenAPI and frontend type. The new backend should populate it for every successful workflow response; making the frontend field optional allows older cached/server responses to fail closed. Render progress only for the literal `approved` value.
- Derive this field on the server from the same repository approved-Estimate context already used by payment and furniture workflows. Reuse resolved context within the request where practical; do not issue a separate Estimate query from each frontend caller or infer approval from room count, stage locks, a payment timestamp, design assignment, or a label.
- The alternative of gating on `initialPayment.status` avoids an API field, but `received` short-circuits source validation and conflates two workflows. The dedicated status expresses the requested rule precisely.

## Risks and failure handling

- Older approved Estimates may have no rooms or may use legacy review records. Preserve the repository's current compatibility rules; approval visibility must not depend on selected furniture items or room dimensions.
- A source conflict must never make another project's approval appear eligible. Report `source_issue` without disclosing private Estimate IDs or proof, and keep the timeline hidden until the project source is reconciled.
- Approval can happen in another browser session. The existing 60-second workflow refetch plus query invalidation on local successful decisions should update the view; a transient network failure keeps the last successfully confirmed state and shows the current refresh warning.
- Existing direct component tests and callers may use older workflow fixtures. Update relevant tests to include or intentionally omit the new status so they verify the fail-closed behavior and do not accidentally create an authorization assumption.

## Acceptance criteria

1. Before Estimate approval, every project view using `ProjectWorkflowPanel` omits the “Design workflow / Project progress” section, all six stage links, stage details and portal navigation. Other project content remains available.
2. After approval by the Client or by an authorized representative on behalf of Client with proof, the workflow appears for the same project after query refresh. An approved Estimate belonging to another project, an unapproved Estimate, or a source conflict never reveals it.
3. The backend response exposes `approved`, `awaiting_approval` or `source_issue` from canonical approved-Estimate resolution. A valid approved Estimate with no rooms produces `approved`; a prior payment receipt alone does not.
4. Loading, initial error, missing-field and stale-refresh behavior follows requirement 4. No workflow action becomes newly authorized by this display change.
5. Focused backend source/contract and frontend rendering/invalidation tests pass, including Client and Admin on-behalf approvals and asymmetric projects. Typechecks, builds, rendered checks and repository hygiene pass on the integrated worktree.

## Open decisions

None. “This” is interpreted as the shared Design workflow Project progress component shown in the screenshot, across its project-view placements. The canonical project-linked approved Estimate determines visibility.

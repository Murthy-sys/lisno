# Project status and pending responsibility

Status: approved by the user on 2026-10-01; task plan approved and Mode A selected. Implemented locally; final verification evidence is recorded in the task plan.

## Goal

Give every active project participant a **Project status** button that answers: where is the project now, what needs to happen next, and who is responsible for that action?

## Current behavior and evidence

- `frontend/src/features/messages/ProjectChatHeader.tsx` supplies shared project navigation used by Client, Sales, Designer, management, Admin, Finance, and Procurement project screens. Project messaging also gives assigned workers and other selected participants a project entry point.
- `backend/src/domain/project-chat-membership.ts` already resolves active participants from Client identity, project/estimate assignments, valid workflow assignments, approved access grants, explicit selections, and exclusions. It handles conflicting links and the sole active Super Admin. This matches the requested “users part of the project” more closely than a broad role check.
- `backend/src/services/project.service.ts` supplies design workflow progress. `design-workflow-state.service.ts` supplies stage state, blockers, and actions, but `availableActions` is filtered for the requesting user. Its SLA `clockOwner` is not a reliable pending-action owner.
- Estimate state and immutable approval rounds supply commercial review status; `workflow-space-planning.ts` validates the separate Design approval. Downstream assignments are held in the project workflow tasks.
- There is currently no shared participant-safe status summary. Existing status labels, Lead `nextAction` text, and the first visible button are insufficient to determine who must act.
- The worktree contains the earlier Designer upload, furniture, approval visibility, and Client estimate review changes. They must be preserved.

## Proposed experience

Use one shared **Project status** button beside the existing project navigation and in the selected project conversation header. It opens a read-only side panel, using the existing drawer, typography, controls, and restrained Procurement/Configuration styling.

The panel contains:

1. Project name and an explicit Refresh control.
2. **Current stage**, such as “Estimate approval” or “Collection of existing furniture dimensions”.
3. **Pending with**, showing the assigned person's display name and role, or a clearly labelled role when no eligible individual is assigned.
4. **Next action**, describing the outstanding action in plain language.
5. Other active pending actions when several people or workstreams can proceed independently. Do not imply only one person is responsible when multiple actions remain.
6. A blocker or scheduled date when recorded and relevant. Show a deadline only when backed by an existing authoritative deadline; do not invent a “pending since” time or deadline.

Example: **Estimate approval → Sample Client · Client → Review and approve the submitted estimate or request changes.**

The button remains available before estimate approval. The existing rule that hides the design workflow until estimate approval remains intact. This panel can explain “Sales is preparing the estimate” without revealing draft commercial values.

### Responsive and accessibility behavior

- Reuse the shared drawer with a readable desktop width and full-width mobile presentation; maintain clear label/value hierarchy and wrapping for long names.
- Support keyboard opening, focus containment, Escape/close, focus restoration, and accessible names. No new icon library, decorative motion, shadows, gradients, or font dependency.
- Show explicit loading, empty/unavailable, failed-read/retry, completed, unassigned, paused, and stale states. Retained data after a transient refresh error must be labelled out of date. Remove cached panel content immediately after access is denied.
- Refresh when opened, on window focus while open, and periodically while visible (30 seconds); invalidate after affected local workflow/approval/assignment mutations. Stop polling while closed. Never return the previous project's response after changing projects.

## Scope and assumptions

- Scope is the existing web frontend, including responsive mobile web, and the supporting backend read. A separate mobile application change is not included.
- “Part of the project” means current active membership from the existing project participant resolver, including valid explicit additions and respecting removals. Broad access to another module or a role title alone is insufficient.
- The summary spans estimate preparation/review, initial payment confirmation, the six design workflow stages, and already-supported downstream execution tasks. It reports existing workflows; it does not introduce new stages or responsibilities.
- If an assignment is ambiguous or absent, display “Assignment needed” with the responsible role rather than choose an arbitrary employee.
- This is a status view. It does not approve, assign, edit, send reminders, or change project state.

## Pending responsibility rules

Derive the result on the backend from stable IDs and current validated sources. Reuse domain transitions and prerequisites rather than parse display strings or aggregate each viewer's action buttons.

| State or workstream | What the summary identifies |
| --- | --- |
| No estimate / Sales draft / returned commercial estimate | Assigned Sales estimator; prepare or revise and submit |
| Internal estimate review | The actual pending assignment or review step; assigned Design Manager or Designer, with an unassigned-role fallback |
| Ready for Client but not submitted | Assigned Sales estimator; submit the estimate to Client |
| Current submitted commercial review | Linked Client; approve or request changes, reflecting direct or on-behalf decisions once recorded |
| Approved estimate, initial payment not confirmed | Participating Finance Head and the sole active Super Admin are alternative eligible confirmers; show one action with the eligible people. Do not describe this as proof that the Client has not paid |
| Internal kickoff | Outstanding Designer completion and any independent Sales calendar acceptance |
| Client kickoff | The current request, scheduling, or completion owner; show a scheduled meeting instead of blaming someone before its time |
| Key collection | Client handover and/or Designer receipt, according to which confirmation is missing |
| Site measurement | Actual assigned measurement Designer, assignment-needed state, or Client site-access restoration when paused |
| Furniture requirements/dimensions | The owner of the current validated preparation, submission, review, or returned-work step; preserve current and supported legacy paths |
| Design preparation/review | Designer assignment/preparation/revision, Client review, or separate workflow acknowledgement, according to the current Design round and prerequisites |
| Execution after design approval | Outstanding generated tasks and their valid individual/role assignments; show all independent active workstreams |
| All tracked actions finished | “No pending tracked actions”; call the project completed only when its canonical project state supports that claim |

The headline uses the earliest unmet lifecycle prerequisite. Independent actions that are already actionable appear underneath. Future locked stages are not listed as work currently pending with their owners. A source conflict produces an explicit “Status needs review” result for the affected workstream; it must not fabricate an owner or falsely show completion. Calendar acceptance uses the project's assigned estimator, because a Lead owner alone cannot perform that workflow action. Design stage completion requires the matching immutable Client completion event, not only populated stage fields.

## Authorization and data contract

### Permission matrix

| Actor | Read summary |
| --- | --- |
| Active linked Client, assigned Sales/Designer/Manager, valid assigned execution worker | Yes, when resolved as a current participant |
| Admin, Finance, Procurement, Site Manager, Design Head, or other staff | Only when resolved as a current participant through the existing membership rules |
| Sole active Super Admin | Yes through the existing protected participant rule and the specific status-read operation |
| Unrelated, excluded, inactive, stale-session, or unauthenticated user | No; no project details or pending names disclosed |

- Add a dedicated authenticated `GET /projects/:projectId/status` read, with a canonical `projects.status.read` permission/route operation and OpenAPI schema. Reuse participant scope enforcement; granting this operation does not grant project editing, full workflow details, finance, or estimate access.
- Return a minimal typed projection: project ID/name, canonical project status, server timestamp, derived stage/phase, summary availability, and a list of pending actions. Each pending action has a stable source key, stage/workstream label, plain-language action, responsible role, eligible assigned people by ID/name/role, optional recorded schedule/deadline, and a safe blocker. Do not return whole source documents.
- The same safe status summary is available to eligible participants regardless of whether they can perform the action. Personal names come from current authorized assignments/participant records; do not expose account contact details or arbitrary directory users.
- Exclude estimate line items/rates/totals, Finance ledgers, internal notes, proof documents, private links, and attachment metadata. The new view must not widen access to those resources.
- Source identity must agree across project, Lead, estimate, approval round, Design version, and generated task lineage. No joins by project/client name. Approved estimates and approval history remain immutable.
- Preserve active-user/session checks, non-disclosing denials, and existing audit behavior. Summary reads must not create chat messages, selections, tasks, or other domain writes.

## Architecture and compatibility

Preferred approach: a dedicated backend summary derived from existing state, plus one reusable frontend button/drawer. A frontend-only summary would be incomplete for users whose action lists are filtered or who lack access to internal source endpoints, so it is unsuitable for this requirement.

Reuse the participant source loader/resolver without coupling status availability to chat office hours or starting extra message streams. Keep the button's membership gating explicit; mounting shared navigation must not momentarily expose a project summary to a denied user. Use the same status component in conversation headers for roles without a general project-detail page.

Reuse repository-backed reads for workflow state and established estimate/workflow read paths. Keep memory and Mongo behavior aligned wherever a new repository read is needed. Do not persist a second status or assignment record that can drift from its source. Avoid per-task/per-user query fan-out.

No migration, backfill, dependency installation, production change, notification, or external message is required. Rollback removes the summary endpoint/UI without modifying project data.

## Risks and verification requirements

- Membership and module access differ. Test two asymmetric projects and unrelated users, revoked grants, explicit removal, inactive accounts, and assignment changes. Cover both direct endpoint access and hidden UI.
- A stage can have multiple pending actors or a scheduled wait. Cover those cases, unassigned owners, paused measurement, and future locked stages.
- Commercial and Design approvals are distinct. Cover direct/on-behalf approval, requested changes, Sales revision, resubmission, separate Design acknowledgement, and conflicting or missing approval sources.
- Current worktree has known unrelated route-registry count and broader journey fixture failures. Capture the implementation baseline and report them separately; verification must exercise the new route's registration and mounted authorization explicitly.
- Verify summary freshness after decisions, workflow actions, participant/assignment changes, project switching, and access revocation. Include responsive rendered interaction and accessibility checks, then both workspace typechecks/builds and `git diff --check`.

## Acceptance criteria

- **AC1:** Current participants can find and open Project status from their project screen or conversation; nonparticipants cannot read it.
- **AC2:** The panel shows the current stage, concrete next action, and named responsible person/people or honest unassigned-role fallback.
- **AC3:** Estimate preparation/approval is understandable before design workflow visibility unlocks; direct/on-behalf approval updates the summary correctly.
- **AC4:** Pending ownership follows the actual workflow transitions, including simultaneous actions, returns, scheduled waits, pauses, and execution tasks, without assigning future locked work.
- **AC5:** No financial, draft-estimate, proof, internal-note, or unrelated-project data leaks. Missing/conflicting sources and unassigned owners remain explicit.
- **AC6:** Changes refresh correctly; the drawer is responsive, keyboard accessible, and handles loading, failure, stale data, access removal, and project switching.
- **AC7:** Earlier Designer upload, furniture, Client review, and workflow visibility behavior is preserved; focused checks and builds pass or remaining unrelated failures are precisely reported.

## Open decisions

None required before approval. The specification assumes the existing project participant list defines membership and that the entry point is shared project navigation plus the project conversation header.

## Correction to the approved feature, 2026-10-01

The user reported that Project status is inaccurate and unavailable to some project participants. The existing goal and acceptance criteria already require accurate ownership and access for every current participant. Read-only investigation found:

- The shared status button is hidden until a chat summary succeeds; shared navigation disappears when chat is disabled. Status reading has its own permission and backend participant check. Site managers and workers have no direct status entry on their task screen.
- The status reader compares an approved review round's decision source to `Estimate.clientDecisionSource`, a field absent from the Estimate schema and approval writer. Both approved local development projects have valid round sources but no such Estimate field, so the panel incorrectly reports an unavailable status. Validate the immutable review round and stored approval timestamp/proof without inventing a new Estimate field.
- Initial-payment confirmation also permits Finance Head, calendar acceptance requires the project's assigned estimator, and Design completion requires its Client event. Missing Internal Kick off evidence must name that stage rather than initial payment.
- Read-only verification of the corrected local summaries exposed a stage/action mismatch: an older, independent Sales calendar action appeared before the current Design action, and a completed Design stage remained labeled current when execution tasks existed. Keep the actual current lifecycle stage and put its action first; show outstanding independent work beneath it.

Correction acceptance: every active participant can discover the button in their relevant project or task context independently of chat availability; backend membership still protects reads and removed participants see no status. Approved Client or on-behalf decisions yield the real current stage. Pending people and stage labels follow the actual workflow authorization and immutable event history. Preserve the read-only minimal response, approval history, project isolation, and prior feature behavior. No new persisted field or migration is required.

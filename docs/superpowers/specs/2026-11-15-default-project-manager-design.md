# Default Project Manager for new projects

Date: 2026-11-15
Status: Proposed specification, awaiting approval. No task plan or implementation yet.

## Goal and confirmed decisions

Replace the pictured Sales Manager selector in the Sales project-initiation form with a **Project Manager** field. Automatically populate it from one saved organization-wide default and disable editing within project creation. Preserve the existing form's styling.

The user explicitly selected:

- Project Manager instead of Sales Manager.
- Configure one default Project Manager for all new projects.

The canonical Project Manager role is `site_manager`. The existing `Project.programManagerId` field stores this assignment. Sales Manager (`admin`), Design Manager (`design_manager`), and the historical `program_manager` role remain distinct.

## Current behavior and evidence

| Area | Current evidence |
| --- | --- |
| Pictured field | `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` renders “Sales Manager” and “Search and select Sales Manager” when `assignmentMode` is `sales-manager`. It requires a manual selection and includes that selection in dirty-state detection. |
| Sales entry point | `frontend/src/features/leads/LeadDashboard.tsx` opens that mode. `AdminProjectsPage.tsx` opens the same form with a Sales-user selector for Sales Manager/Super Admin initiation. |
| Current request | `POST /admin/projects` accepts `salesManagerId` or `estimatorId`. `admin-project.service.ts` requires Sales to choose an active `admin`, creates an `admin_initiator` grant for that person, and sets `programManagerId: null`. Its result and receipt replay currently use that manager's scoped project summary. |
| Other creation paths | `project.service.ts#create` and the new-project branch of `estimate-project-handoff.ts#resolveApprovalProject` also initialize `programManagerId: null`. These must participate for a default to apply to all newly created projects. |
| Assignment authority | `project-manager-assignment.service.ts` and `domain/project-manager-assignment.ts` validate active `site_manager` identities and keep project/site-execution owners consistent. Existing reassignment uses transactions and version checks. |
| Existing manager directory | `GET /admin/program-managers` already lists active Project Managers for authorized Sales Manager/Super Admin callers. Its legacy URL does not change the role it returns. |
| No existing default | Inspection found no saved global default or Sales-to-Project-Manager mapping. `User.managerId` is not an established default for this workflow, and the authenticated public user does not expose it. |

This is a workflow and authorization-sensitive change, not just a label change. A Project Manager ID cannot be submitted as `salesManagerId` or receive a Sales Manager grant.

## Scope

- A durable, versioned organization-wide default Project Manager setting.
- Super Admin management of that setting from the existing web Projects screen.
- A disabled, automatically populated Project Manager field in the shared web initiation dialog. Sales Manager/Super Admin initiation retains its independent Sales-user selector.
- Backend application of the default when any of the three identified application flows actually creates a new project.
- API contracts, authorization registry/OpenAPI, memory/Mongo persistence parity, audited changes, query freshness, and focused regression/visual verification.
- Compatibility with existing project-initiation clients and previously stored initiation receipts.

Non-goals: restyling vendor screens or other forms; bulk reassignment or backfilling existing projects; changing Design Manager assignments; changing downstream approval authority; creating site-execution work before its existing workflow trigger; changing financial calculations; a native-app redesign; deployment, production configuration, seeding, migration execution, or customer communication.

## Proposed behavior

### Configure the default

Add a text action, **Project defaults**, to the Super Admin Projects header. Open an existing-style contextual form containing one searchable **Default Project Manager** control and Save/Cancel actions. Reuse current controls, typography, colors, spacing, borders, and focus treatment; add no icon dependency or new visual theme.

Only the sole active Super Admin may change this organization-wide setting. The backend validates that the selected user is active, not deleted, and has role `site_manager`. No first-user, name, alphabetical-order, demo-account, or sole-active-user fallback is permitted.

Store one singleton setting with a stable Project Manager ID, version, updated actor, and timestamp. Missing configuration is represented explicitly with version 0. A first save creates version 1; replacements use compare-and-set and increment the version. Keep a no-op save idempotent. Audit old/new IDs and versions without copying private account information.

Saving the setting applies only to projects created afterward. It does not update previously assigned or unassigned projects. Existing authorized per-project reassignment remains available through its current authority.

### Initiate a project

1. Load the current default from an authenticated, minimal projection.
2. Display **Project Manager** with the configured person's name in a genuinely disabled input, styled like the current field. Show “Assigned automatically from project defaults.” as supporting text.
3. In Sales mode, remove the Sales Manager search/selection requirement. The authenticated Sales user still owns the new lead.
4. In Sales Manager/Super Admin mode, keep the existing Sales selection and add the disabled Project Manager field.
5. Submit the observed configuration version, not a caller-selected Project Manager ID. Resolve and validate the current configured person inside the project-creation transaction.
6. Persist the canonical Project Manager assignment as part of creating the project. Do not create workflow tasks prematurely. When downstream tasks are generated, their assignee must continue to agree with that assignment.
7. Show existing success/navigation behavior. Automatic loading of a default must not mark an otherwise untouched form dirty.

Loading and refresh have a textual status, with submission unavailable until the displayed default is current. Lookup failure has an accessible Retry action outside the disabled control. Missing, deleted, wrong-role, or inactive defaults show a clear configuration message and block new-project creation. Super Admin can reach Project defaults; other users are told to ask Super Admin. Never expose an unavailable account's private details.

If the setting changes after the form loads, reject a stale submission without writes, refresh the displayed manager, retain the entered project data, and require an explicit retry. Keyboard/Enter submission must follow the same guards as the button. An inaccessible or stale default must not silently change the displayed assignment on submit.

### Sales Manager oversight consequence

The new Sales web flow has no Sales Manager selection. It therefore creates no implicit `admin_initiator` grant for an arbitrary Sales Manager. The configured Project Manager receives only the normal access attached to their Project Manager assignment, not Sales Manager or client-representative powers. Sales ownership, Super Admin oversight, and existing authorized access-request/assignment mechanisms remain in force.

Sales Manager/Super Admin initiation retains its existing initiating-manager grant behavior. Historical projects and their grants are untouched. Legacy Sales clients that explicitly provide a valid `salesManagerId` retain that existing grant behavior in addition to receiving the configured Project Manager. This compatibility path must not be used to infer the Project Manager or manufacture a manager grant for the new web flow.

The creation response/replay must no longer require a selected Sales Manager for the new Sales flow. Return a narrowly scoped creation summary for the authenticated creator and the exact created project/lead, preserving the current response fields. Do not broaden general Admin project reads or list permissions to make this work.

## Data and API contract

Recommended integration shape, to be finalized into file-level tasks only after specification approval:

- `GET /admin/project-initiation-defaults`: minimal `{ version, status, projectManager }` result. Status distinguishes ready, unconfigured, and unavailable; only a ready manager exposes `{ id, name }`. Allow currently authorized project-creation roles; do not grant them general user-directory access.
- `PUT /admin/project-initiation-defaults`: `{ expectedVersion, projectManagerId }`, restricted to the sole active Super Admin. Validate input with runtime Zod, enforce compare-and-set, and audit successful changes. Reuse the existing authorized Project Manager directory for the settings picker where possible.
- `POST /admin/projects`: add optional `projectManagerDefaultVersion`. The new web flow always supplies it. Sales may omit `salesManagerId`; a provided legacy value retains its original active-role validation and grant behavior. Sales cannot choose another lead owner. Sales Manager/Super Admin must still choose a Sales user.
- Older clients without a displayed/default version use the current configured default at transaction time. They still cannot override the Project Manager. Existing native callers remain source-compatible; no native visual changes are required by this specification.
- Designer creation and approval-time creation use the same default-resolution rule when inserting a project. Existing-project handoff/linking must preserve its assigned manager and must not be blocked by an unrelated subsequent default change.
- Persist canonical assignment on `Project.programManagerId`. Keep default-setting provenance/version in the creation audit; do not make existing projects dynamically refer to the mutable global setting.
- Preserve `managerId` for Design Manager and preserve immutable approval/client records.

The singleton and transaction-aware resolution need compatible repository-backed and direct-Mongoose adapters. Do not route an existing in-transaction creation through a second independent transaction. All new protected operations must be registered in the authorization inventory, frontend permission contract, and OpenAPI documentation.

## Permission matrix

| Actor | Read default for creation | Change global default | Create project |
| --- | --- | --- | --- |
| Sole active Super Admin | Yes | Yes, versioned and audited | Existing initiation authority; default applied |
| Sales Manager | Yes | No | Existing initiation authority; selected Sales user retained |
| Sales | Yes | No | Own lead only; default applied |
| Designer | Yes, with existing project-create authority | No | Existing designer creation rules; default applied |
| Project Manager | No new configuration permission | No | No new creation permission; assigned-project access only |
| Client/other roles | No new configuration permission | No | No new creation permission; existing approval actions may create a project internally |

Do not broaden permissions for unrelated identities. Default changes and creation must revalidate active actors/manager roles and coordinate with the existing authorization mutation mechanism.

## Transactions, retries, compatibility, and failures

- Resolve the default and validate its target within the transaction that writes the project. Coordinate default replacement and user deactivation/role changes so a concurrent stale assignment cannot commit silently.
- Missing/invalid configuration, stale displayed version, or authorization failures produce no project, lead, grant, receipt, audit-success event, or invitation write. Approval-time creation failures roll back the enclosing decision rather than leaving partial approval data.
- Successful idempotent replay returns the original project's assignment. A new default must not move the original project, create another project, or invalidate an otherwise valid historical receipt. A reused key with different request content still conflicts.
- Creation/assignment/default-setting audit records use stable IDs and the real actor. Preserve existing project/lead events and invitation delivery semantics.
- Invalidate/refetch default queries after settings changes, including open initiation views. Keep identity-scoped caches isolated across sign-out/account changes.
- No migration or seed is needed for existing projects. A Super Admin must select a valid default through the new UI before newly creating projects after rollout. This operational prerequisite is intentional; do not fill production configuration during implementation.
- Rollback must retain stored assignments and audit history. Disable/remove the new UI through a coordinated code rollback if needed; never clear project owners or remove grants as a rollback shortcut. Account for new Sales creation records without an initiating Sales Manager before reverting old replay code.

## Options and decisions

| Option | Outcome |
| --- | --- |
| One explicit organization-wide default | Selected by the user. Deterministic assignment with a small configuration surface. Requires initial configuration and becomes unavailable if its person is deactivated. |
| Mapping per Sales user | Not selected. Adds per-user maintenance and permits different teams to route differently. |
| Automatically select the sole active manager | Not selected. Avoids a setting for a single-manager organization but becomes ambiguous as staff grows. |

Assumptions proposed for approval: Super Admin owns the global setting; an invalid default blocks new creation; the default applies to all three application creation paths; new Sales web creation stops implicitly choosing a Sales Manager, with legacy explicit selections preserved as described above.

Open implementation decisions: exact singleton repository/model placement and narrow creation-summary adapter can be settled in the task plan without changing these behaviors. No additional product decision is needed for this specification. The actual default person's identity is selected later in the application, not hardcoded into code or fixtures.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Super Admin can save and replace one active canonical Project Manager; other roles cannot change the setting. | Authorization matrix, zero/one/multiple Super Admin cases, wrong-role/inactive/deleted target tests, settings interaction checks. |
| AC2 | The pictured Sales field is labeled Project Manager, correctly prefilled, disabled, and preserves existing styling; automatic population is not a dirty edit. | Rendered tests for accessible label/disabled state, no search/clear/change interaction, close-without-edits, and desktop/mobile visual checks. |
| AC3 | Sales Manager/Super Admin initiation retains its Sales selector, and every identified new-project creation path assigns the same configured stable ID. | Memory/repository tests plus Mongo replica-set coverage for initiation, designer creation, and approval-time new-project creation; two distinct managers and creators. |
| AC4 | Unconfigured/unavailable defaults, load failures, stale versions, and racing changes cannot create partial or incorrectly assigned projects. | Frontend loading/error/retry/stale tests; transactional failure/race tests; keyboard-submit tests; input-retention checks. |
| AC5 | Changing the default affects future projects only; existing assignments and valid idempotent replays remain unchanged. | Two projects created around a default change; original receipt replay, concurrent duplicate initiation, historical receipt, and existing-project approval-handoff cases. |
| AC6 | Project Manager assignment gives only existing Project Manager scope; the new Sales flow requires no Sales Manager selection and grants none implicitly. | Asymmetric identity checks, no fabricated grants, creator-scoped response/replay, historical/legacy explicit Sales Manager compatibility, denied unrelated project reads. |
| AC7 | Downstream canonical assignment stays consistent and no approval/design/finance history or task generation is rewritten. | Assignment resolver/task-generation regressions, existing-owner handoff checks, approval rollback checks, invitation side-effect regressions. |
| AC8 | Contracts, settings cache refresh, and repository adapters are consistent and existing styling/work is preserved. | Registry/OpenAPI tests, frontend/backend typechecks and builds, relevant broader regressions, integrated diff review, `git diff --check`. |

Browser validation: the initiation and settings views at approximately 390px and 1440px, long manager names, ready/loading/missing/inactive/error/stale states, keyboard focus, retry/save/conflict behavior, and overflow. Use fixtures without production identities. No new dependencies are expected.

Focused suites include `AdminProjectInitiationDialog`, `LeadDashboard`, `AdminProjectsPage`, backend `admin-projects`, `sales-initiated-projects`, `admin-projects-mongo.replica-set`, canonical Project Manager assignment, project creation, and estimate-decision tests as affected. Add meaningful settings/transactional regressions. Final verification must run on the integrated result after writers finish. This specification stage has run only read-only inspection and document hygiene checks; no runtime verification is claimed.

## Workspace preservation and approval boundary

The initial dirty set is the completed vendor-workflow work: execution/detail/list integration, vendor components/tests/styles, enterprise fixture changes, and its two 2026-11-14 specification/plan files. Relevant current project-initiation/backend targets were clean at inspection. Preserve all earlier work; inventory target diffs again before any writers start. Do not edit shared enterprise fixtures without explicitly reconciling their current changes.

Follow repository `AGENTS.md`: approve this specification first, then create the separate task plan for approval, then select execution mode. Earlier approvals/mode A belonged to the completed vendor task. No implementation, task plan, agents, commits, deployment, configuration mutation, or external action is authorized by creating this specification.

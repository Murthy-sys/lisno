# Assigned project visibility before estimate approval

Status: implemented and locally verified, 2026-10-13. The current request and standing autonomous instruction authorized parallel execution without routine approval pauses. See the [completed task plan](../plans/2026-10-13-assigned-project-visibility.md) for exact checks and limitations.

## Goal

Assigned Designers, Procurement staff and Program Managers can find and view their projects without waiting for estimation completion or Client approval. Viewing does not authorize an otherwise blocked workflow action.

## Current evidence

- Designer project reads already use assignment scope without an estimate gate. `DesignerDashboard.tsx` fetches those projects but renders only approved-estimate design tasks, omitting assigned projects without tasks.
- `ProjectWorkflowPanel.tsx` hides the entire progress panel unless `estimateApprovalStatus` is `approved`, following the older September 30 visibility requirement. The current request supersedes that presentation rule for the three named staff roles.
- Procurement project cards/details consume the priced `/procurement/projects` preparation projection. That projection intentionally requires a real eligible estimate and cannot safely represent an unestimated project.
- Procurement and Program Manager lack generic project list/detail/workflow-read permission. Program Manager has an exact `programManagerId` relationship in memory scope but not the Mongo legacy filter. Procurement assignment is evidenced by a current Procurement workflow task or active explicit Procurement module grant, not a Project name or estimate status.
- Program Manager execution views have no frontend approval filter, but offer execution-specific details only. Project-status access also misses the direct Program Manager assignment.

## Scope and behavior

1. Reuse `GET /projects`, `GET /projects/:projectId` and `GET /projects/:projectId/design-workflow` for authorized metadata and progress reads. Add only the named read permissions for Procurement and Program Manager, synchronizing frontend authorization contract and policy version.
2. Add a dedicated read-scope repository path rather than widening a module helper used by mutations. Preserve existing-role behavior. For Program Manager require the project's exact `programManagerId`; for Procurement accept exact assigned Procurement task or an active valid Procurement module grant. Keep memory/Mongo results and pagination aligned. No creator, team-wide or role-wide fallback is introduced.
3. Designer dashboard includes every authorized assigned project even without a design task, joined by stable project ID. Existing eligible task actions remain; all rows can open the project's existing detail route.
4. Procurement workspace supplements genuine preparation records with authorized generic project metadata. Unprepared projects show their name/details and a clear preparation-pending state. They have no invented estimate version, task ID, financial amount, selected scope or preparation record. Preparation controls continue to require the existing genuine preparation projection.
   Existing preparation visibility is role-scoped and can legitimately include an older project without the new exact-assignment generic read. The two read paths remain independent: unavailable generic metadata must not revoke a successful existing preparation read, and failed/unavailable preparation must not hide successfully authorized generic details.
5. Program Manager can inspect general project information/progress from the existing execution project route while existing issued-work empty states remain accurate. The existing execution assignment scope is preserved.
6. For the three named internal roles, successfully authorized, matching-project workflow data can show read-only progress before estimate approval. Client and other-role visibility stays as before. Missing/failed reads remain explicit; a source conflict is shown honestly. Before approval, do not mount workflow action controls; new observer roles receive no workflow write capability from their read permission.
7. Project status can use exact Program Manager assignment without granting chat participation. Preserve revoked/unassigned project denial and suppress retained data after permission/assignment denial or identity switch.

## Invariants and non-goals

Estimate and Design approvals, initial-payment confirmation, work-order issue, vendor invitations, upload/edit actions and procurement source/freshness checks remain enforced by existing services. Do not relax approved-estimate resolution or manufacture financial values. Client/vendor access, chat membership, project creation and assignment mechanisms are unchanged. No database schema migration, live data mutation, email, dependency, commit or deployment is required.

This extends existing project reads rather than changing the priced ProcurementProject contract. The latter would mix visibility with financial readiness and require unsafe placeholder values. Current project DTOs and route inventory remain; permissions and read-scope implementation change.

## Acceptance criteria

- AC1: Each named role can list/open its assigned project with no estimate, a draft estimate or pending Client approval. Designer sees a project without a design task.
- AC2: Unrelated identities/projects, revoked grants and non-assignees cannot read/list project details or workflow; memory/Mongo agree. Existing role behavior is preserved.
- AC3: Pending/source-issue progress is viewable only for named staff after a successful scoped read. Client/other-role approval visibility and all action/payment/issue guards remain.
- AC4: Procurement displays unprepared project metadata without fake financial/source values, and mounts preparation controls only for real eligible preparation records. Approved and mixed portfolios retain accurate totals.
- AC5: Program Manager reads general details/status through exact project assignment without gaining chat/write access or changing execution work visibility.
- AC6: Focused asymmetric backend authorization/repository tests, rendered frontend state/interaction tests, shared authorization contracts, both typechecks/builds, independent integrity review and hygiene pass. Browser checks cover materially changed list/detail states when local tools permit.

## Risks, compatibility and verification

The main risk is widening mutation scope by reusing a read helper; explicitly separate new read authorization from existing action checks and test denied mutations. Keep query keys actor-scoped for new shared reads and stop rendering revoked data. Optional preparation data must not block independently successful project reads. No backfill is needed; rollback removes the added read permission and UI without changing saved approvals or records. Temporary evidence lives under `/tmp/lisno-assigned-project-visibility/`. The baseline worktree at `e8208664` is clean.

No unresolved product decision remains. “Program Manager” means the existing `program_manager` role, not Site Manager.

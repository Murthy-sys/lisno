# Close project from the finance panel

Status: Proposed for approval
Date: 2026-10-01

## Goal and evidence

Replace the prominent **Record project cost** action shown in the Super Admin's project finance panel with **Close**. Selecting Close opens a confirmation modal; confirming closes the project without asking the user to enter a cost or other form data.

The current button in `ProjectFinancePanel.tsx` opens `FinanceEntryForm` and posts a ledger expense. It never calls the final project completion endpoint. A separate Super Admin page already calls `POST /admin/projects/:projectId/complete`, which records the final decision and changes project status to `completed` transactionally after the Site Manager and Client sequence. A read-only check of the local Jayan Villa record found `active`, Site Manager progress 100%, Client completion accepted, `readyForCompletion: true`, and no completion blockers. That project can use the existing closure operation immediately; no new force-close API is needed.

The finance panel is shared by Super Admin and Finance Head. Finance Head has cost-entry permission but no project-completion permission. The approved workflow gives only Super Admin the final closure decision, after Client acceptance. The existing finance bucket and ledger remain the source of costs and actual margin.

## Scope and behavior

1. For Super Admin on an active project using the current Site Manager → Client → Super Admin completion path, the finance panel's prominent action reads **Close**. It fetches the current backend completion summary, including `readyForCompletion`, blockers, and `completionAuthorityVersion`. The action opens an accessible confirmation modal naming the project. The modal has **Cancel** and **Close project**; it has no cost, amount, reason, or other user-entry field. It explains that closing records the project's actual completion time and ends ordinary project workflow actions.
2. Confirm sends the existing `POST /admin/projects/:projectId/complete` request with the summary's expected authority version and one idempotency key for that attempt. The server remains authoritative for Super Admin identity, Client acceptance, approved estimate/order/scope lineage, project state, and version checks. One success records the existing immutable final decision and changes `Project.status` to `completed`; the UI does not write a project status directly or post a finance ledger entry.
3. If completion is not ready, opening Close shows the current named blockers and disables confirmation. A failed/stale request keeps the modal open with an actionable error and refreshes the completion summary. Loading, permission, unavailable/legacy completion authority, and already completed states have clear non-actionable presentation. A repeated confirm cannot create a second decision.
4. After success, dismiss the modal, show a completion message and read-only Completed state, remove Close, and refresh project detail, project status, Super Admin completion queue, finance project/list, and dashboard queries. The same project must appear completed to all participants after their normal refresh. Do not optimistically claim completion before the backend responds.
5. Preserve cost recording as a separate, clearly named finance action before closure for authorized finance users, because it is an existing ledger function. Finance Head continues to see **Record project cost** and cannot see or invoke Close. Super Admin's primary action at the pictured location becomes Close; cost entry remains available as a secondary finance control and is never part of the Close modal. After completion, ordinary workflow actions remain governed by the existing server terminal guards. This change does not alter existing ledger history, approved estimates, PO commitments, or project finance calculations.

## Contract, failure handling, and constraints

- Reuse `GET /admin/projects/:projectId/completion` and `POST /admin/projects/:projectId/complete` with `procurement.project_completion.decide`. No route, authorization, schema, or persistence change is proposed. The frontend may add a small API helper/type for this existing contract.
- Keep backend compare-and-swap, transaction, audit event, immutable decision, and idempotent replay behavior. A 409 triggers refetch and shows the server's current blocker/version message; a network failure offers retry with the same pending attempt key. Do not duplicate a successful closure.
- The modal uses the existing `Dialog` interaction model: keyboard focus containment, Escape/Cancel, clear button names, busy state, and error announcement. At narrow widths, actions remain visible without horizontal overflow.
- Preserve the current cost-entry feature and its permissions. The Close button is restricted to Super Admin in the frontend; the backend operation remains the enforcement point. Do not run a migration, mutate live data, deploy, commit, or send external communication as part of this change.

## Options and decision

- **Recommended:** connect the finance panel's Close confirmation to the existing final completion service. This makes the pictured control perform the authorized project closure and keeps all approved gates and audit history.
- Adding a direct project-status update or force-close endpoint would bypass Client acceptance, source checks, and immutable completion history, so it is outside this request.

## Acceptance criteria

| ID | Outcome |
| --- | --- |
| AC1 | On a ready active project, Super Admin sees **Close** in the finance panel. Click opens a confirmation modal with no data-entry fields; Cancel makes no request. Confirm calls the existing completion endpoint once with current version and idempotency key, then shows Completed and refreshes affected screens. |
| AC2 | An unready, stale, already completed, unauthorized, or legacy project cannot close from this control. The modal presents current blockers or a useful error, and backend checks remain authoritative. |
| AC3 | Close creates no finance ledger entry and does not open the cost form. Existing cost recording remains available to authorized Finance Head and Super Admin as a separate action before closure. |
| AC4 | Successful closure follows the already approved Site Manager → Client → Super Admin sequence; project status and pending owner update for participants, while the existing completion decision/audit and financial history stay consistent. |

## Verification

Use focused rendered tests for ready/unready, Cancel, confirm success, stale 409, retry, completed, Finance Head, and cost-action separation. Exercise the existing backend completion replica-set tests or a focused route test to confirm the reused endpoint closes exactly once and still rejects invalid closure. Run frontend/backend typechecks and builds as impacted, `git diff --check`, and a rendered desktop/mobile modal check if the local browser is available. Inspect the final dirty-path diff and report any unrun check. No production mutation is authorized by specification approval.

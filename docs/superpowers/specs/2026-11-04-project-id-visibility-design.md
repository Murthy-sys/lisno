# Generated Project ID across project screens

Date: 2026-11-04
Status: Approved by the user on 2026-11-04
Classification: Substantial, additive read-contract and cross-role UI change with identity-lineage risk.

## Goal

Show each project's existing generated reference, such as `Lisno000001`, wherever users identify or select a project in the web application. Label this reference **Project ID**, retain the project name, and preserve the compact layouts requested earlier.

## Current behavior and evidence

- The worktree was clean at the start of this investigation (`git status --short`). No product sources have been changed for this request.
- `backend/src/domain/project-number.ts` defines and validates the canonical `Lisno` prefix with at least six numeric digits. `backend/src/services/project-number.service.ts` assigns the immutable Lead-owned `projectNumber` inside the first estimate-save transaction, records its assignment audit, and checks counter/identity consistency.
- `backend/src/routes/estimates.ts` exposes that number in authorized Sales estimate responses. `backend/src/repositories/admin-project-summary.ts` joins Project to Lead by stable IDs, projects the number, and rejects contradictory numbered Lead/Estimate links.
- Sales currently displays it in `LeadDashboard.tsx`, `LeadDetail.tsx` and `LeadEstimateWorkspace.tsx`. Admin displays it in `AdminProjectsPage.tsx` and `AdminProjectDetailPage.tsx`, using the label “Project number”. Admin detail/quick view also expose a separate internal UUID under “Project ID”.
- General project list/detail and Client summary responses in `backend/src/services/project.service.ts` do not project `projectNumber`. The explicit `toClientProject` mapper would drop it even if a lower-level read supplied it. Frontend `Project` and `ClientProjectSummary` in `frontend/src/api/types.ts` omit the field.
- Client uses those responses in `ClientDashboard.tsx` and `ClientProject.tsx`. Designer project list/detail use the general project responses. Their identity areas therefore cannot display the generated number reliably today.
- Other project identity projections are separate: Project Manager uses `PMProject`; messaging uses `ChatSummary.project`; status uses `ProjectStatusSummary`; Finance and Procurement expose project-specific summaries. Updating only the general Project interface would leave these screens inconsistent.
- The approved earlier numbering specification, `2026-11-02-estimate-project-number-design.md`, explicitly keeps allocation at first successful estimate creation and excludes automatic historical backfill. Current code retains that design.

## Scope and interpretation

“Generated Project ID” means the existing `projectNumber`, not the internal UUID. “Every project” includes all project records visible to the current user across the existing role screens. This is a display/read-projection extension, not a new numbering scheme.

Cover the primary project identity areas below, including their existing list/grid/mobile variants:

| Surface | Required placement |
| --- | --- |
| Client | Project dashboard entries, project header and standalone quotation identity |
| Sales | Lead/project entries, detail and estimation header; use the same Project ID label |
| Admin / Super Admin | Project rows/cards, detail and quick view; distinguish any retained internal UUID |
| Designer and management | Assigned-project entries, project/workspace headers, design-plan project context and project selectors |
| Project Manager | Portfolio entries, project workspace and project-estimation header |
| Procurement and Finance | Project galleries/lists, project budget/detail/workspace identity and project selectors |
| Vendor / execution | Authorized project identity in work lists and project/work context, without altering issued document contents |
| Shared messaging/status | Conversation project entries, project conversation/details header and project-status context |

Use one identity label per logical project row/header. Do not repeat it on every estimate line, message, task, floor or sub-basket when the containing project is already identified. During task planning, enumerate the exact current consumers behind these surfaces; no surface is considered covered merely by adding a TypeScript field.

## Required behavior and UX

1. Display `Project ID: Lisno000001` alongside or directly below the project name in the existing identity area. Use small, readable, selectable text and existing typography. No extra panel, toolbar, icon, badge row or decorative treatment.
2. Every visible project identity uses the same canonical number across roles, navigation, refresh, rename and estimate revision. Renaming must not change the number.
3. Where the record has no assigned number, display the compact neutral text `Project ID not assigned`. Do not substitute a UUID, array position, project name, estimated next number or a different project's reference.
4. A number becomes visible after its existing first-estimate save commits and affected queries refresh. Do not invent an optimistic number or retain one from a previously selected project.
5. Keep existing internal `id`/`projectId` values as route parameters, cache keys, select values, mutation identifiers and relationship keys. Project-selector labels may include the generated number, but their values remain the internal IDs.
6. If a read-only UI still needs to expose the internal UUID for support, label it `System ID`. Existing technical forms that explicitly accept an internal project ID must retain their input contract and clarify the distinction where necessary; they must not begin accepting a generated number implicitly.
7. Preserve search/filter behavior. This change does not add global lookup or server-side search by generated ID. Any broader search capability requires a separate scope decision.
8. Preserve loading, empty, denied, stale and error states. A pending/failed request is not evidence that the number is unassigned; render unassigned only for a successfully loaded record whose value is missing/null.
9. Long names and expanded numeric suffixes wrap without clipping actions or creating page overflow. The compact Client header remains compact and the estimate retains its current position immediately beneath it.

## Recommended architecture

Extend existing authorized response projections with a nullable, read-only `projectNumber`. Reuse the current Lead-owned source and validation. Add a shared, minimal project-number resolver where needed so repository-backed and direct-Mongoose read paths apply the same identity rules.

- Resolve numbers only for project IDs already authorized by the calling feature. Batch resolution for list pages rather than fetching each project's detail from the browser or performing one database query per row.
- Join `Lead.projectId` to the actual Project ID. For estimate-owned identity, validate its Lead/Project relationship using the established lineage rules. Names, emails, row order and arbitrary “first lead” selection are not join keys.
- Return `null` for legitimately unnumbered records. Contradictory/invalid numbered identity must retain an explicit conflict response consistent with `PROJECT_NUMBER_STATE_CONFLICT`, rather than silently selecting or concealing a different number.
- Extend memory and Mongo repository contracts together when a new repository lookup is required. Keep direct-Mongoose feature boundaries intact; do not force an unrelated service refactor.
- Keep the API field named `projectNumber` for compatibility. Update relevant frontend DTOs and OpenAPI response shapes; create/update schemas must not gain permission to set it.
- Reuse a small presentation component/formatter for the Project ID label and missing state if it removes actual duplication. It receives response data and does not fetch privileged data independently.
- Refresh affected project/summary caches after the existing first-save assignment. Number changes are not a new mutation, and project renaming continues to synchronize names without dropping the immutable reference.

The alternative of duplicating a writable number onto Project is rejected: it would introduce a second source and require synchronization/backfill without improving this display requirement. Frontend-only lookup through Admin/Lead APIs is also unsuitable because other roles must not gain those permissions merely to render an ID.

## Permissions and invariants

| Actor/context | Read behavior |
| --- | --- |
| Authorized reader of a listed/project-scoped record | Receives that record's number or null through the existing permitted response |
| Unauthorized reader or unrelated project | Retains existing denial/non-disclosure; number lookup must not bypass feature access |
| Super Admin | Remains subject to the existing operation-specific scope |
| Any client of a create/update endpoint | Cannot assign or overwrite the generated number |

No change to role permissions, project membership, Client Configuration visibility, Sales confirmation before Client approval, approval history, estimate values, finance calculations, project creation timing or numbering allocation/audit semantics.

## Compatibility, failure handling and migration

- No new persisted field, sequence, allocation trigger, new public endpoint or migration is required. Preserve already issued numbers, counter state and indexes.
- Historical projects/estimates that were never numbered remain explicitly unassigned. Generating IDs for those records would be a separate backfill requiring its own approved inventory/dry run and live-execution authorization.
- Frontend handling must tolerate older responses omitting `projectNumber`; new response serializers normalize legitimate absence to null.
- Existing published quotation snapshots, issued purchase orders, PDFs, exported documents and emails remain immutable. Do not regenerate them to insert a newly visible UI reference.
- Rollback consists of reverting additive read/display code; stored numbers and all existing internal IDs remain intact. No data rollback is needed.
- No dependencies, lockfile changes, production writes, seeds, commits, pushes or deployment are included.

## Risks and mitigations

- **Incorrect cross-project identity:** two projects can share a name. Use stable IDs and test equal names with different generated numbers, plus unlinked/mismatched Lead cases.
- **Data disclosure:** role-specific response shapes differ. Resolve after authorization, add only the reference, and test unrelated actors/projects; do not return Lead contacts or internal commercial fields.
- **Partial UI coverage:** independent role/feature DTOs can silently omit the number. Maintain a surface/contract inventory in the task plan and verify each entry.
- **List performance:** a naive per-row fetch increases requests and latency. Batch backend resolution and avoid new frontend waterfall requests.
- **Stale references:** cached project summaries may predate first estimate save. Verify invalidation/navigation while ensuring a failed save does not display a number.
- **Layout regression:** metadata could recreate the excessive top space just removed. Keep it within existing identity typography and verify narrow screens and enlarged text.

## Acceptance criteria and verification

1. Two authorized projects with different numbers show the correct distinct Project IDs in every applicable surface in the scope matrix, including when both share a name. The same project retains its number across roles and refresh.
2. General project list/detail and Client summaries return the canonical number; each separate Project Manager, messaging/status, procurement/finance and work projection used by an in-scope UI carries the same reference. Memory/Mongo behavior aligns where a repository contract changes.
3. Unauthorized reads and unrelated projects retain their existing access behavior. No additional Lead fields or administrative endpoints are exposed.
4. Missing, historical and pre-estimate numbers display the defined unassigned state. Reading, editing, renaming or opening those records does not allocate/backfill a number. Invalid identity data produces an explicit conflict rather than a fabricated fallback.
5. Existing first-save assignment becomes visible after committed success and cache refresh. Failed saves, retries, project switching and rename flows never create or cross-wire a displayed ID.
6. Internal UUIDs continue to drive routes, selection values, cache keys, mutations and audits. Existing approval/version checks and financial outputs are unchanged.
7. Rendered tests cover identity labels, missing/loading/error states, role variants and responsive wrapping. Browser QA covers the compact Client header, representative list/detail views at mobile/tablet/desktop widths, keyboard use and enlarged text without horizontal page overflow.
8. Run focused backend projection/lineage/access tests, affected frontend tests, both typechecks/builds, and repository hygiene checks. Use the existing numbering replica-set regression lane if numbering read integrations touch its transaction boundary; preserve allocation code where possible. Broaden verification according to the actual shared-contract delta. There is no lint script.

## Open decisions

No blocking decision remains for displaying existing generated IDs. Approval accepts the Project ID label, cross-role surface scope and explicit unassigned state while retaining the existing first-estimate generation rule. Retroactive numbering, a different format or a new allocation trigger are outside this specification.

This stage creates only the specification. The task plan and execution-mode choice follow approval under `AGENTS.md`.

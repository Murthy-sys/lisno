# Client estimate decisions and project page redesign

Status: approved by the user on 2026-09-30; Mode A implementation in verification.

## Goal

Let a Client review the estimate for a project as read-only information, approve it directly, or send clear changes back to the Sales estimator for revision and resubmission. Make the Client project page a useful decision workspace, using the restrained information hierarchy of the Procurement and Estimation Configuration screens as the visual reference.

## Current behavior and evidence

- The Client dashboard already renders `EstimateReviewPanel` and offers “Approve estimate” and “Request changes” for estimates in `sent_to_client`. The supplied screenshot is the **Client project detail** page, `ClientProject.tsx`, which has no estimate section. Its header, tabs, workflow, and secondary disclosures leave the required commercial decision hard to find.
- `POST /client/estimates/:estimateId/decision` already verifies the Client's email against the Lead and calls `EstimateDecisionService`. The service checks the current pending review round and estimate version, preserves immutable decision history, and moves the estimate to `client_approved` or `client_changes_requested`. The approved path links or creates the project and drives the existing downstream workflow. The authorized on-behalf approval path remains separate and proof-backed.
- `LeadEstimateWorkspace.tsx` permits editing `client_changes_requested` estimates and already has a submission path. It does not show the Client's commercial change note, although the backend stores that note in the estimate review record and current review round.
- The portal currently accepts an empty request-changes note. `estimate-client-decision.test.ts` explicitly tests that legacy behavior. The new interaction needs an actionable explanation so Sales knows what to revise.
- `GET /client/estimates` exposes client-visible status rows with the mutable estimate body. After a changes request, Sales can edit that body before resubmission. The submitted review round holds an immutable estimate snapshot and PDF; the Client-facing commercial review must remain anchored to the submitted version, not a Sales draft in progress.
- A pending estimate may have `projectId: null`; approval can create a project. Such estimates need the existing dashboard review entry. For an already linked project, identity must come from stable project IDs, never project names.
- The earlier approved workflow-visibility change gates the six-stage progress timeline on an approved estimate. The estimate decision section should be the prominent preapproval content on this page.

## Scope and requirements

1. Add a project-specific estimate review section near the top of the Client project page. Match only estimates linked to that exact project ID. Show the latest current submitted review, its version, status, total including GST, section/item breakdown, and PDF access. Quantities, rates, specifications, and totals are read-only for the Client. Do not display another project's estimate or pick by name.
2. When the current estimate is `sent_to_client`, provide distinct “Approve estimate” and “Request changes” actions. Approval requires a deliberate confirmation showing the project and submitted total. A change request uses a clearly labelled, required explanation of at most 1,000 characters before submission. Disable duplicate submits, show field and server errors, and announce the resulting state.
3. Route both actions through the existing Client decision service. Require a nonblank explanation for new Client portal change requests at the API/service boundary as well as in the UI. Preserve review-round/version conflict handling, actor identity, audit events, immutable history, and existing proof requirements for on-behalf decisions. Previously stored empty-note records remain readable; no backfill is needed.
4. Show the latest Client commercial feedback in the authorized Sales estimate workspace when status is `client_changes_requested`, including a safe generic state for historical empty notes. The Sales estimator can edit, submit through the established approval/publication path, and the Client then receives a new review opportunity for the newly submitted version. A previous approval or changes request must not silently apply to the new version.
5. Keep the Client's visible commercial values tied to the immutable submitted review snapshot while Sales edits after a changes request. Do not show an in-progress Sales draft or let the PDF and on-screen figures refer to different versions. If a legacy record lacks a trustworthy snapshot, show a clear unavailable/revision state and keep decision controls closed rather than inventing values.
6. Keep the existing dashboard estimate review available, especially for estimates with no project yet. Share review presentation and decision behavior where practical so the dashboard and project page do not diverge. A linked project page shows only its own estimate; absence of a linked estimate has a specific empty state rather than a generic approval prompt.
7. Refresh Client estimate, project, workflow, and relevant Sales queries after decisions or resubmission. A stale or conflicting decision must explain that the estimate changed and offer refresh; it must not leave an apparently active approval button.
8. Redesign the Client project page's information hierarchy around a compact project header, clear Overview/Messages navigation, a strong estimate decision section before approval, and the approved workflow and project records thereafter. Reuse the existing `PageHeader`/`Surface`/status and token patterns where they fit the Client role. Match the Procurement and Configuration screens' quiet borders, generous but controlled spacing, metadata hierarchy, and structured rows. Avoid new fonts, dependencies, shadows, gradients, decorative icons, or unrelated dashboard restyling.

## Recommended approach and data/API impact

- Reuse the existing decision endpoint and review-round service; add only the client-facing submitted-snapshot read shape needed for consistent on-screen/PDF values. Keep the current Client estimates queue and its existing consumers compatible. The backend must select the latest authorized submitted review round and expose its immutable version/status/snapshot with the estimate's stable `projectId`; it must not present mutable Sales draft fields as the current Client proposal.
- Use one Client estimate review UI for dashboard and project context, or extract shared read-only details and decision controls. In project context, filter by exact project ID and fail closed on ambiguous or inconsistent links. In dashboard context, keep unlinked estimates actionable.
- Add the Sales feedback display from the existing review history/current round through its authorized estimate read path. No new email, notification channel, schema migration, or external side effect is required for this request.
- A project-scoped new decision implementation would duplicate transactional approval rules; reuse of the existing decision service is the supported path. Reading only the mutable estimate body would expose unsubmitted Sales changes, so the immutable review snapshot is the supported presentation source.

## State, permissions, and failure handling

| State | Client project page | Sales estimate workspace |
| --- | --- | --- |
| No linked submitted estimate | Show a clear waiting/empty state; keep dashboard entry for unlinked estimates | Continue draft/submission flow |
| `sent_to_client` | Show submitted read-only snapshot and PDF; enable Client approval or explained changes request | Await Client decision; no draft editing |
| `client_changes_requested` | Show last submitted snapshot and “Sales is revising”; no decision on that round | Show Client feedback, edit, and submit a new version |
| `client_approved` | Show approved summary; no second decision; reveal approved workflow through its existing backend gate | Preserve approved baseline and existing downstream flow |

- The backend remains authoritative for authorization. A Client may act only on an estimate belonging to their verified Lead email and the current review round. Admin or Sales on-behalf decisions continue to require their existing role and proof; the Client screen does not expose those actions.
- An older or missing snapshot, conflicting project link, two candidate current estimates, withdrawn/changed round, unauthorized response, or network failure must not reveal another Client's content or permit an action. Provide retry where the failure is transient. Preserve already confirmed data only under the repository's existing stale-data policy and mark it as stale.
- The interface must work at desktop and narrow mobile widths, 200% text zoom, keyboard-only use, and visible focus. The approval confirmation and change-request form need accessible names, focus handling, validation, and success/error announcements. Long project names, large totals, many rooms/items, and empty states must remain legible.

## Acceptance criteria

1. A Client opens a project with a linked, submitted estimate and can read the exact submitted version's sections, quantities, prices, GST, total, and PDF. No commercial field is editable. A second project's estimate never appears there.
2. Approving the current version records a Client portal approval once, updates the page to approved, refreshes the project/workflow view, and does not change the proof-backed on-behalf path. A stale second approval is rejected.
3. Requesting changes requires a nonblank explanation, records it once, removes decision actions for that round, and makes the note visible to the authorized Sales estimator. Sales can revise and resubmit; the next Client review refers to the new submitted version.
4. During Sales revision, the Client sees no unsubmitted commercial edits. The displayed figures and downloadable PDF come from the same published round. Missing or inconsistent source data fails closed with a useful state.
5. A Client without a project link can still review and decide from the dashboard. Dashboard and project actions stay synchronized after a decision and after a new submission.
6. The project page uses the requested Procurement/Configuration visual language without prohibited decorative styling. Rendered desktop/mobile, keyboard, accessibility, loading, empty, error, stale, and long-content checks pass. Focused backend decision/authorization and frontend flow tests, typechecks, builds, and `git diff --check` pass on the integrated worktree.

## Open decisions

None. “Client screen” means the Client project page shown in the screenshot, while the existing dashboard remains the entry for estimates that have not been linked to a project. “Read-only” applies to the commercial estimate; the existing design drawing review tools remain a separate workflow.

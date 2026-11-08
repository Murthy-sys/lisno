# Client project sections before Sales submission

Date: 2026-11-05
Status: Approved by the user on 2026-11-05. Separate task plan approved and execution mode A selected.

## Goal and decision

Hide the three sections identified in the user's second screenshot until Sales has submitted an estimate to the Client:

- Additional requirements, including its Unsaved changes indicator and form.
- Project coordination, including source notes, empty records and pagination.
- Selections requiring your approval, including its empty-state message.

An invitation, an estimate being created, or an Estimator preparing an initial estimate is not a Sales submission. After a verified submission, preserve the existing restricted Client experience and its existing role/action rules. Use the existing backend-published review as the visibility source; no new workflow status or persistent flag is needed.

## Current behavior and evidence

Evidence is the supplied screenshots and current source inspection. The initial worktree is clean (`git status --short` returned no paths); inspected target diffs are empty. No runtime reproduction or tests have been run in this specification stage.

| Finding | Source and consequence |
| --- | --- |
| Version-3 projects always mount compact requirements and project coordination below the quotation. | `frontend/src/features/client/ClientProject.tsx`, the `sharedEstimation` branch. There is no Sales-publication condition. |
| Version-2 projects also expose requirements immediately and mount coordination in the non-shared branch. | The same component. Invitations support workflow versions 2 and 3 in `backend/src/services/project-client-invitation.service.ts`. |
| The selections panel is mounted independently of estimate approval/publication. | `frontend/src/features/workflow/ProjectWorkflowPanel.tsx` mounts `ProjectDesignRequirementsPanel` whenever authorized workflow data exists, even while project progress itself is hidden. |
| The selections component renders an empty surface for a Client with no entries. | `frontend/src/features/workflow/ProjectDesignRequirementsPanel.tsx` renders the screenshot's heading and empty message. |
| Immediate access to requirements was previously intentional. | `frontend/src/features/client/ClientProject.estimateReview.test.tsx` contains both the v3 not-started and v2 invited-membership tests expecting requirements before the first estimate. Those expectations must change for this request. |
| A submitted Client review already has an authorized source. | `frontend/src/features/estimates/estimateWorkflowApi.ts`: `getClientEstimates`, query key `estimateWorkflowKeys.client`, and `publishedReview`/`reviewSourceIssue`. `ClientEstimationWorkspace.tsx` already selects a unique review by project ID. |
| Internal drafts without a published round do not constitute Client publication. | `backend/src/services/estimate-client-review.service.ts` loads the latest published round; `estimate-client-presentation.ts` validates project/recipient/source identity, presents immutable snapshots and excludes unpublished internal states. |
| The v3 pre-design publication records assigned Sales approval. | `backend/src/services/estimate-publication.service.ts` requires the assigned Sales estimator to approve and send, then stores the review round and Sales evidence. Email delivery is a separate concern. |

The earlier specification `2026-11-03-client-estimation-approval-workspace-design.md` retained requirements before estimation. This request supersedes that presentation requirement only; its quotation and approval invariants remain applicable.

## Scope and non-goals

In scope: the web Client project page for invitation-supported workflow versions 2 and 3; the three screenshot sections; the minimal shared-workflow presentation control needed to hide selections; and focused regression, interaction, accessibility and responsive verification.

Out of scope: redesigning the quotation workspace; changing the existing quotation editor's availability or allowed edits; changing Sales/Estimator/Designer screens; changing standalone requirement components globally; changing legacy projects without workflow version 2 or 3; mobile application changes; changing backend authorization, APIs, invitation behavior, approval rules, publication, email, financial calculations or stored requirements.

Do not hide the entire project workflow to suppress one selections panel. Preserve project navigation, Messages, Project status, quotation loading/not-started/error/retry states, genuine later workflow actions, document access, floor progress and completion reviews under their current rules.

## Requirements and state transitions

### R1. One project-bound publication condition

For version-2/3 Client project pages, derive visibility from a successful authorized Client-estimates response containing exactly one estimate for the current stable project ID with a non-null `publishedReview` and no `reviewSourceIssue`. Reuse the existing query/cache and its refresh paths. Do not infer publication from project status, an estimate ID, nonzero totals, draft items, invitation acceptance, `editingAllowed`, or an Estimator's internal handoff.

Do not use `publishedReview.canDecide` or only `status === sent_to_client` as the visibility test. A legitimate previous submission remains evidence after approval, requested changes or supersession. Those states must retain existing restrictions on actions and current-version approval.

| State | Three screenshot sections | Existing quotation/project behavior |
| --- | --- | --- |
| Invitation accepted; no estimate | Not mounted | Keep the current not-started message and refresh action. |
| Internal initial estimate/draft; no Sales publication | Not mounted | Keep existing quotation behavior and restrictions. |
| Initial publication lookup pending or failed | Not mounted | Retain existing error/retry presentation; do not invent an empty estimate. |
| Unique, verified Sales-published review | Existing sections may mount under their current rules | Preserve the current restricted Client quotation, review, PDF and decision flow. |
| Published estimate approved, changes requested or superseded | Retain eligibility when the backend still returns a valid published review | Preserve existing history, editing, workflow and action checks. |
| Foreign project, duplicate matches, missing snapshot, source conflict or denied refresh | Not mounted | Never substitute another project's publication or infer permission. |

Successful cached publication evidence may remain during a background refresh to avoid remounting open forms on every fetch. Once a response fails or establishes invalid/missing evidence, hide the three sections. Do not add automatic retries or autosaves of hidden forms. Reuse existing session/cache isolation and ensure changing projects does not reuse the prior project's eligibility.

### R2. Hide complete sections

Before publication, omit the three components from the rendered tree rather than collapsing their disclosures, disabling controls or hiding them with CSS. This prevents misleading empty surfaces, keyboard targets and component-owned reads. Leave no placeholder card, divider or reserved gap for the omitted content. Persisted requirements remain intact and become available under the existing behavior after submission.

Keep the shared workflow component's default behavior intact for staff and legacy callers. Any presentation option introduced for selections must be narrowly applied by the Client project composition; do not change workflow authorization or suppress unrelated workflow content.

### R3. Preserve the submitted Client experience

Retain the established Client-safe room/basket/item view and all existing restrictions. Do not copy the staff screen or expose staff costs, hidden lines, internal checklist content or extra actions. Approval remains bound to the published round and expected version, and unsaved quotation changes continue to prevent approval. A later Client edit returning the quotation to Sales does not reset the project to its never-submitted state.

### R4. Refresh and presentation

The existing user-visible refresh/retry path must also allow publication eligibility to recover and reveal the sections once Sales submission is verified, without requiring logout. Keep query reuse coordinated with the existing quotation and review queries; avoid a separate stale local boolean or redundant endpoint.

Reuse current typography, controls, layout and responsive behavior. Keep keyboard navigation and accessible names for remaining controls. This is a visibility correction with no new animation, styling system or dependency.

## Data, API and operational impacts

- No API contract, database schema, migration, seed or data rewrite is planned.
- No additional role permissions or route operations are introduced. Backend authorization remains authoritative; the new condition controls presentation only.
- No changes to integer-paise values, GST, published snapshots, immutable approvals, IDs, CAS/version tokens or audit history.
- Publication visibility follows the committed review, independently of email delivery success.
- No new telemetry is necessary; existing request/error handling remains the diagnostic source.
- Rollback consists of reverting the bounded frontend visibility change and its tests. No stored data requires restoration.
- No commits, pushes, deployment, real invitations or customer communication are authorized.

## Assumptions, risks and open decisions

- Assumption: “after Sales team submit” means the existing submit-to-Client publication operation, not an Estimator saving or handing off an internal estimate.
- Assumption: the three sections may follow their existing behavior after first verified submission. This request does not permanently remove later Client requirements, coordination or selections.
- Assumption: both invitation-supported workflow versions should obey this rule. Legacy projects keep current behavior.
- Risk: checking only the current commercial status would hide useful sections during later revisions. Use published review evidence instead.
- Risk: changing shared workflow defaults would affect staff or hide genuine Client actions. Apply the visibility restriction only to the selected sections and scoped Client page.
- Risk: cached data, route changes or ambiguous review matches could reveal content for the wrong project. Verify asymmetric project fixtures and failed refreshes.
- Risk: hiding/unmounting on a denied or invalid publication response can discard local state in the affected auxiliary forms. Do not expand this change into quotation draft handling; preserve existing stored data and quotation navigation guards.
- No unresolved decision blocks specification approval. If investigation reveals a need for backend permissions or broader quotation behavior changes, revise the specification before expanding scope.

## Acceptance criteria and verification

1. **AC1: After invitation.** A v2 or v3 Client project without an estimate renders none of the three screenshot sections, their nested text, controls or misleading Unsaved changes indicator. Existing quotation/not-started and navigation behavior remains available.
2. **AC2: Internal estimate.** Creating or preparing an initial estimate without a published Client review does not reveal those sections, even when the draft includes line items or editable requirements.
3. **AC3: After Sales submission.** A valid project-matched publication restores the existing permitted Client sections and quotation review/actions without staff-only content or broader permissions. Verify transition on refresh as well as initial load.
4. **AC4: Later lifecycle.** Approved, changes-requested and superseded valid published reviews retain existing behavior; current approval eligibility and unsaved quotation guards remain unchanged.
5. **AC5: Unknown or invalid evidence.** Loading, failures, denied refresh, source issues, duplicate reviews and foreign-project records never reveal the sections. Recovery reveals only the correct project's eligible content.
6. **AC6: Narrow scope.** Staff/shared workflow behavior, legacy Client projects, valid later workflow actions, saved requirements, navigation and existing Client restrictions are preserved.
7. **AC7: Rendered quality.** Check a synthetic invited project and a synthetic submitted project at desktop and mobile widths, including keyboard access and automated accessibility checks. No blank containers or horizontal overflow should be introduced.

Verification during implementation will cover `ClientProject.estimateReview.test.tsx`, `ClientProject.test.tsx`, `ClientEstimationWorkspace.test.tsx` and `ProjectWorkflowPanel.test.tsx`, extending the relevant suites for AC1–AC6. Include component request assertions for omitted panels, two distinct project IDs, and publication refresh/recovery. Run focused frontend tests, `npm run typecheck`, `npm run build`, rendered browser checks for AC7, and `git diff --check`/`git status --short`. Broaden tests only if the integrated change affects additional consumers. The repository has no lint script. Any unavailable runtime checks must be reported as unverified.

The separate dependency-ordered task plan will be created only after this specification is approved, as required by `AGENTS.md`.

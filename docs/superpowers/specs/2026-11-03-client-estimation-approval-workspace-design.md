# One Client estimation workspace for editing and approval

Date: 2026-11-03
Status: Implemented in approved Mode A; final verification and baseline limitations recorded in the task plan (2026-11-04).
Classification: Substantial frontend workflow consolidation with approval and financial presentation regression risk.

## Goal and confirmed decision

Replace the duplicated Client estimate editor and expanded submitted-estimate panel with one estimation workspace. The Client opens the same saved project estimate used by Sales, edits the Configuration-permitted items, and completes pre-design approval in that workspace.

The user explicitly selected **“Sales confirms changes before Client approval.”** The sequence remains:

1. Client edits permitted items and saves.
2. Sales checks and confirms the revised estimate through the existing approval/publication workflow.
3. Client reviews and approves that exact submitted version in the same workspace.

This is a presentation and navigation correction to the implemented [shared estimation specification](2026-11-03-shared-estimation-workspace-design.md), using the [compact workspace layout](2026-11-03-workspace-content-density-design.md). It does not remove Sales approval or introduce direct approval of a working draft.

## Current behavior and evidence

| Finding | Source | Effect |
| --- | --- | --- |
| Both the current editor and the old full review are mounted on the dedicated route. | `frontend/src/features/estimates/ProjectQuotationWorkspace.tsx`: `ClientQuotation` followed by `EstimateReviewPanel`. | A second complete estimate appears below the editor. |
| The Client project page repeats the same composition. | `frontend/src/features/client/ClientProject.tsx`: workflow-version-3 `ClientQuotation` followed by `EstimateReviewPanel`. | The screenshot's Project estimate review block duplicates the estimation content. |
| Client home still embeds the full review experience. | `frontend/src/features/client/ClientDashboard.tsx`: `EstimateReviewPanel` inside the Estimate review section. | Clients have another competing estimate/approval surface. |
| The published view combines metadata, a second item list and totals, decision controls, and other design-related features. | `EstimateReviewPanel.tsx` and `ClientPublishedEstimate.tsx`. | Removing the old container without separating its responsibilities could lose PDF export, approval, post-design comparison or design review. |
| Client saves invalidate the previous submission and Sales approval. | `backend/src/services/quotation.service.ts`: `supersedePending`, version/priced-revision increments, pending review reset, `estimation.salesApproval: null`, `client_quotation_saved`. | A saved edit must show Waiting for Sales confirmation and must not permit approval of the older submission. |
| Pre-design approval requires proof for the exact current version. | `backend/src/services/estimate-decision.service.ts`: checks current pending round, estimate/version, priced revision, requirements, source digest, and Sales actor/proof. | Preserve the backend as the authority. Moving buttons cannot make a draft approvable. |
| The editable estimate follows current Configuration while review/PDF amounts are frozen publication data. | `quotation.service.ts`, `ClientPublishedEstimate.tsx`, existing quotation/review contracts. | These sources must remain distinguishable even when shown in one workspace. |

Evidence is source inspection plus the user-provided screenshot. This follow-up has not yet been implemented or browser-verified. The worktree contains the preceding estimation and app-wide layout changes; they are the baseline and must be preserved.

## Scope and non-goals

In scope:

- Workflow-version-3 Client estimation on the dedicated quotation route and embedded Client project page.
- A compact Client dashboard entry to the canonical project estimation workspace, including existing estimate deep links.
- Shared presentation for current working items, submitted-version review, decision state, PDF access and existing approval information.
- Preservation of design review and post-design comparison features currently nested in the old estimate review container.
- Relevant rendered tests, accessibility, responsive behavior and unchanged backend approval-contract regression checks.

Not in scope:

- Bypassing Sales confirmation, adding a Save and approve operation, changing approval stages or changing the Client mutation allow-list.
- Editing staff-only costs, rates, margins, hidden items, room structure or previously unselected project Main Baskets.
- Expanding Designer permissions, changing pricing/GST calculations or altering Configuration.
- Migrating legacy estimates or changing their approval/edit permissions. They retain their existing compatible review path.
- Changing PDF/email generation or delivery behavior, inventing additional historical versions, or changing immutable records.
- Backend startup repair, database/index operations, dependencies, commits, deployment or external customer communication.

## Product and UX requirements

### R1. One current estimate surface

- Use the existing shared room, Main Basket, Sub Basket and item-navigation structure. Keep saved quantities, dimensions, tiers, component choices, included/excluded items and scoped removal behavior.
- Render one primary item area. Do not append the expanded Project estimate panel or a second section-wise item list underneath the version-3 editor.
- Group phase, version, current status and primary actions into the compact workspace header/footer using the existing layout and control tokens.
- Preserve the dedicated route and project-page entry. The project page may embed the shared composition, but must not mount a second independent approval/editor composition for the same estimate.

### R2. One workspace, explicit edit and submitted-review states

- The editing state displays the current saved working estimate and permitted local changes.
- When a fresh submitted version is available, provide a clear **Review for pre-design approval** action in the same workspace. Submitted review replaces the primary item area with the frozen Client-safe version being approved, using the shared hierarchy/navigation; it does not add another full item area beneath it.
- Label the submitted review as read-only with its exact version, phase, submission status and total including GST. Provide **Edit estimate** to return to the current working editor. Published snapshots must never become editable fields.
- In submitted-review state, provide the existing **Approve pre-design quotation** and **Request changes** actions, with their existing confirmation/note dialogs and accessible focus return.
- The approval confirmation identifies the submitted version and total. Decision payloads use that review round's stable ID and expected version. They must not use a total recalculated in the frontend or current Configuration values in place of the frozen submission.
- If current working and submitted versions differ, or eligibility cannot be verified, the old submitted copy remains read-only history and cannot be approved. Do not treat matching totals alone as proof that two versions are equivalent.
- Post-design review uses the same one-area principle while preserving the existing comparison with the approved pre-design version and all post-design decision guards. The user's Sales reconfirmation choice applies to pre-design; no new post-design Sales gate is introduced.

### R3. Clear save and approval states

| State | Client presentation and behavior |
| --- | --- |
| Estimate not started | Explain that the team has not prepared the estimate yet; retain existing requirements entry. No empty editor pretending to be a saved estimate and no approval action. |
| Editable draft, no submission | Show working items and existing permitted editing actions. State that Sales confirmation is required before Client approval. |
| Unsaved changes | Show Save changes / Discard changes and the existing navigation guard. Approval/review transitions cannot silently discard edits or approve a different version. |
| Save in progress or outcome uncertain | Disable conflicting save/removal/approval actions; retain edits and the existing reconciliation path. |
| Client changes saved | Show **Waiting for Sales confirmation** with concise explanatory text. Preserve the saved estimate and permit further edits only where backend eligibility allows. |
| Fresh Sales-confirmed submission | Show **Ready for your pre-design approval** and the action to review the exact submitted version in the primary item area. |
| Superseded submission, stale read or 409 conflict | Retain useful context with a refresh/recovery action; block decisions until a fresh eligible review is verified. Never reactivate approval from stale cached data. |
| Pre-design approved | Show approval status and approved-version access; retain the established transition to the next phase. Do not introduce a permanent lock if the backend authorizes subsequent post-design editing. |
| Final quotation approved/locked | Preserve existing read-only and unlock rules. |

Saving remains a separate action from Sales confirmation, Client approval and publication. The Client must not see a successful save message that claims approval or suggests the revised version is ready before Sales confirms it.

### R4. Dashboard, history, PDF and design continuity

- For version-3 projects, Client home shows compact estimate status/action entries linked to the appropriate project estimation workspace. It does not repeat a full editable/reviewable item list or offer a competing decision flow.
- Preserve authorized `?estimate=` entry links by resolving the estimate's stable project ID and opening or clearly linking to its canonical workspace. Handle missing, unlinked or unauthorized records without guessing by names or leaking another project's details. Legacy estimates keep their existing compatible route.
- Keep access to the current submitted PDF and any already-supported approved/pre-design versions in compact secondary controls. Label the version being exported, especially while Client edits wait for Sales confirmation. Do not describe an older PDF as the current working estimate.
- Existing drawing/plan review, space-planning completion and later workflow actions remain available in their appropriate project sections. Removing the duplicated commercial panel must not remove those capabilities.
- Only expose history already supplied by authorized APIs. A new general-purpose history API is not required.

## Architecture, data and permission constraints

- Prefer composing the existing quotation editor and extracting/reusing the published snapshot renderer and Client decision controls. Do not copy a second decision state machine or move the Client onto unrestricted staff APIs.
- Backend contracts and persistence are expected to remain unchanged. Existing Client quotation detail/save/revision APIs and published-review/decision/PDF APIs already cover this flow.
- Client ownership, Configuration visibility, permitted fields, phase locks, version/CAS checks and approval eligibility remain enforced by the backend. Designer and staff consumers of shared components must keep their established permissions and behavior.
- Preserve stable project/estimate/line/review IDs, paise units and immutable snapshot/history records. Keep saved overall estimate totals distinct from any visible-line subtotal.
- Refresh all affected quotation, review, Client, workflow and collaboration queries after saves or decisions using existing invalidation paths. A stale or failed review request must not enable decisions simply because cached quotation data is present.
- Changing between edit/review views must not remount the editor in a way that loses pending inputs or restores stale state. Handle account/project changes with the existing isolation boundaries.
- API or backend changes are not assumed necessary. If evidence reveals a material missing contract, update this specification and obtain approval before expanding the implementation scope.

## Failure handling and operational impact

- Preserve loading, empty, transient-error, access-denied, unavailable-source, stale-version and unknown-save states, with precise retry/refresh actions.
- Do not write or approve anything automatically when opening a route, switching views, exporting a PDF or returning from Client home.
- Keep existing auditing and downstream task generation on the unchanged server decision path. No new email or notification action is added by the UI consolidation.
- No schema/data migration is required. A code rollback restores the previous composition without rewriting saved estimates or approval records.

## Acceptance criteria and verification

| ID | Acceptance criterion | Evidence required |
| --- | --- | --- |
| AC1 | Version-3 Client project and quotation routes contain one primary estimate item area, with no duplicated expanded Project estimate panel below it. | Rendered DOM checks and desktop/mobile screenshots with a populated saved estimate. |
| AC2 | Client can edit the saved estimate in the staff-style hierarchy within the existing Configuration allow-list, including save-and-return and scoped removal. | Focused Client/shared-workspace tests and a browser edit/save/basket-navigation exercise. |
| AC3 | A saved Client edit waits for Sales confirmation; the superseded version cannot be approved. | Save → waiting → Sales-confirmed refetch → review-ready scenario; unsaved, failed and unknown-save cases remain blocked. |
| AC4 | Approval is performed in the same workspace against the exact frozen, fresh Sales-confirmed version. | Assert submitted snapshot/total, expected review ID/version, explicit confirmation, duplicate-submit protection, 409 recovery and no decision call while ineligible. |
| AC5 | Current Configuration changes cannot cause approval UI to present working amounts as the submitted snapshot. | Asymmetric working/submitted line names, prices and totals; same-number/different-source and stale-data cases. |
| AC6 | Dashboard and email/deep-link navigation reach the correct authorized estimation workspace without duplicating full estimate content. | Two unequal project identities; known, missing, legacy and unauthorized estimate-link cases. |
| AC7 | Existing PDF/pre-approved-version access, post-design comparison, drawings/plan review and later Client workflow actions remain available. | Targeted regression checks for version 3 pre/post phases and legacy compatibility. |
| AC8 | All layouts remain compact, responsive and accessible. | 390/768/1440/1920px, 200% text, keyboard focus/return, dialogs, contained scrolling, axe and runtime/network checks using synthetic data. |
| AC9 | Sales, authorized Designers, backend approval rules and preceding estimation/layout work remain unchanged outside this consolidation. | Diff against captured dirty baseline, relevant shared-consumer tests and focused existing approval-contract tests. |
| AC10 | Final checks and limitations are reported accurately. | Frontend typecheck, focused tests, risk-appropriate full suite/build, `git diff --check`, and exact baseline failure comparison when applicable. No claim of physical-device validation without performing it. |

The prior full frontend run had reproduced baseline failures, including one EstimateReviewPanel test. That historical result is context only; capture the current focused baseline before implementation and distinguish intentional expectation changes from existing failures.

## Risks and mitigations

- **Approving the wrong data:** separate editable working state from submitted review in the single item area; bind decisions to authoritative review IDs/versions and use immutable amounts.
- **Losing non-estimate features:** explicitly preserve design review and later workflow features currently nested in the review component.
- **Stale multi-query state:** require fresh, consistent review eligibility, invalidate dependent queries, and fail closed on conflicts/denials without discarding local edits.
- **Legacy regressions:** gate the new composition by the actual workflow version and preserve the older review path.
- **Dirty-worktree damage:** snapshot initial dirty paths and target diffs before writers; preserve previous estimation and layout edits and unrelated backend work.

## Open decisions and approval boundary

No product decision remains open. The user confirmed Sales must approve changes before Client approval. Existing version-3 scope, role restrictions and legacy compatibility carry forward from the approved shared-estimation work.

This document is the specification only. The repository workflow requires specification approval, then a separate task-plan approval, then an execution-mode choice before implementation. The user's answer resolves the workflow question; it is not an approval of this newly written specification.

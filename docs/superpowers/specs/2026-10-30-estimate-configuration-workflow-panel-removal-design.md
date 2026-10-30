# Remove the workflow panel from Configure estimate

Date: 2026-10-30
Status: Approved; implemented and verified with the baseline test limitations recorded in the task plan
Classification: Small; localized frontend presentation change

## Goal

Remove the screenshot's **Pre-estimation workflow and client requirements** section from the **Configure estimate** screen so that this screen focuses on estimate configuration.

## Current behavior and evidence

- Inspected HEAD `73761538e1ca9cc34b70d768ec35f938ada7ae65`; initial worktree is clean.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` renders the heading **Configure estimate** when `tab === "configure"` (around line 940).
- Immediately below that heading/navigation, the workspace renders a `staff-estimate-workspace-tools` details element for collaborative estimates. Its summary is **Pre-estimation** or **Post-estimation workflow and client requirements**, plus the open-request count. It opens by default in Configure estimate because `open={tab !== "builder" || undefined}`.
- This element contains `StaffEstimateCollaboration` and `StaffEstimateRequirements`, including the screenshot's description, approved pre-estimate, and saved proposed total. A separate fallback renders collaboration directly for eligible older saved estimates.
- `LeadDetail.tsx` also presents collaboration and client requirements. The workspace's item, Summary, and Proposal views already use these controls.
- Requirements data also determines publication blocking in `LeadEstimateWorkspace.tsx`; hiding the visible panel must not remove that validation or its data queries.

## Scope and required behavior

1. In `tab === "configure"`, do not render the entire workflow/collaboration/requirements block. Remove its disclosure heading, open count, content, empty-state message, and spacing, rather than merely collapsing it.
2. Apply this presentation rule to both pre-estimation and post-estimation, and to the direct collaboration fallback for older eligible estimates.
3. Keep the existing workflow panel available in the other workspace views and the existing Lead detail location.
4. Preserve configuration inputs, room/property choices, selected values, total calculation, navigation, and the transition into Estimate Builder.
5. Preserve requirements queries, submission blocking, approval/read-only rules, saved-version checks, and all existing workflow mutations. This is a render-boundary change only.
6. Do not introduce a replacement banner, explanatory text, control, or blank space on Configure estimate.

## Assumptions, constraints, and non-goals

- “Estimate configuration screen” means the existing **Configure estimate** view, identified directly in the code, rather than every view within the estimate workspace.
- The screenshot identifies the whole workflow disclosure, so the removal includes its collaboration summary and client requirements content on that view.
- No change to the shared collaboration/requirements components, backend APIs, permission policy, financial calculations, saved data, or other screens is intended.
- No new dependencies, database migration, deployment, commit, or push is needed or authorized.
- No blocking product decision remains under this interpretation.

## Data, API, and UX impacts

There is no data/API contract change. The existing `configure` view condition controls visibility. Render the current block only in the existing non-configuration views; do not delete its underlying lifecycle logic or apply global CSS hiding.

The configuration content moves up naturally, with no inaccessible hidden panel or focusable controls left behind. Returning from Estimate Builder to Configure estimate removes the block again without discarding edits.

## Risks and verification

| Acceptance criterion | Verification |
| --- | --- |
| AC1: Configure estimate contains no workflow disclosure, collaboration summary, client-requirements panel, fallback, or empty gap. | Rendered checks for pre/post states and eligible legacy state, plus desktop/mobile inspection. |
| AC2: Existing non-configuration workflow controls remain reachable and returning to Configure estimate hides them again. | Exercise Configure → Estimate Builder → Configure and existing Lead detail/workspace coverage. |
| AC3: Configuration values, saving, read-only states, version handling, and submission requirements/design blocking remain intact. | Run the existing relevant estimate workspace/collaboration tests; inspect that query and mutation logic is untouched. |

The main risk is accidentally removing workflow logic with the presentation block. Keep the implementation confined to the rendering condition and any necessary existing-test updates. Use proportional rendered verification and existing suites rather than introducing a new test framework or broad refactor. Run frontend typecheck/build and `git diff --check`; no lint pass is claimed because the repository has no lint script.

The user approved this specification and the [separate task plan](../plans/2026-10-30-estimate-configuration-workflow-panel-removal.md), then selected execution mode A. Implementation and verification evidence are recorded in that plan.

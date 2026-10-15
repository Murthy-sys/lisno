# Unified lead estimate landing

## Status and goal

Specification approved on 2026-10-13. The separate task plan was subsequently approved and the user selected parallel execution (Mode A). Implemented and locally verified; see the [task plan's final verification evidence](../plans/2026-10-13-project-initiation-estimate-landing.md). No deployment was performed.

Use the user's second image as the single lead-detail screen for both starting and continuing estimates. Remove the older first-image presentation rather than retaining it for other lead stages. Immediately after Sales successfully submits Initiate project, show this same screen for the returned lead. The Leads navigation entry and All leads link must continue to open the lead list.

Latest clarification: both images represent the same screen, the second is the latest design, and the first can be removed. This supersedes the earlier proposal to extend the new design only to project-linked new leads.

## Current behavior and evidence

- `frontend/src/features/leads/LeadDashboard.tsx` renders the lead list at `/estimator-sales`. Its Initiate project action opens `AdminProjectInitiationDialog` with `assignmentMode="sales-manager"`. On success it navigates to `/estimator-sales/leads/<returned lead.id>`.
- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` invalidates project, dashboard, and lead queries before closing and calling `onCreated`. Creation failure leaves the form available with errors.
- `backend/src/services/admin-project.service.ts` creates the project and its linked lead transactionally. The saved lead and its creation audit both have stage `new_lead`. This also applies to projects initiated by Admin/Super Admin.
- `frontend/src/features/leads/LeadDetail.tsx` selects its redesigned presentation only for `item.stage === "estimate_in_progress"`. A freshly created `new_lead` therefore receives the older client-first header, Initial payment panel, small estimate card, and Follow-ups form shown in the first image.
- The second image's project-first header, contact row, navigation, three-step guide, and full-width Estimate section already exist in `LeadDetail.tsx`, `ContactAndEstimateCard.tsx`, and `estimationProgress.css`. They do not require a replacement screen or new design system.
- Continue/Start estimate currently updates that lead to `estimate_in_progress`, refreshes lead queries, and then opens `/estimator-sales/leads/<leadId>/estimate`. The builder is a different screen from the requested landing view.
- `LeadDashboard.test.tsx` covers initiation and navigation but currently expects the old client-name heading. `LeadDetail.test.tsx` covers the redesigned stage, follow-up preservation on other stages, and failed/retried estimate-entry mutations.
- Initial worktree inspection was clean. Historical October 8 redesign documentation describes the earlier stage-only scope; the latest request replaces that restriction with one screen for starting and continuing estimates.

## Scope and non-goals

Make the existing redesigned presentation the default for every lead detail, across all saved stages and whether or not a project link is present. Eliminate the old presentation branch. Refresh, a direct link, and reopening from the list must produce the same view.

Keep the Sales initiation success destination on the returned lead detail route. Keep `/estimator-sales` as the list, including search, filters, review actions, and saved-estimate links. Admin/Super Admin creation destinations remain unchanged; their leads use the same presentation if subsequently opened in the Sales lead workspace.

Excluded: changing backend creation defaults, adding a new route or route-state-only mode, automatically opening the estimate builder after creation, creating an empty estimate on page load, redesigning the list or application chrome, permissions, financial calculations, approval/payment rules, schema changes, data migration, dependencies, deployment, commits, or pushes.

## Recommended approach

Reuse the existing project-first header, navigation, and estimate guide unconditionally in `LeadDetail`. Remove the superseded client-first header, small contact/estimate card presentation, and stage-dependent layout switching. Keep workflow-stage decisions only where they determine real behavior, such as the stage label and Start versus Continue action. Remove obsolete code/styles only when they have no remaining consumers.

The user's clarification establishes one credible design direction, so a second page or alternate old layout is unnecessary. Changing saved lead stages merely to activate styling is also unnecessary.

## Requirements and UX

1. After a successful Sales initiation, land on the newly returned lead's detail page and show the reference composition immediately when lead data loads, without requiring a manual stage change or an extra Start estimate click.
2. Use `projectName` as the main heading, saved property type beside it, and client name, phone, and email in the existing wrapping contact row. Preserve available location metadata. Use actual records, never screenshot contact information or fabricated placeholder values.
3. Retain the stage selector, project Critical summary, Lead/Messages navigation, Project status control, and applicable workflow notices using their established data sources and permissions.
4. Show the existing full-width Estimate section with its informational ordered guide: Rooms & Dimensions, Select Scope, Generate Estimate. The guide does not claim saved step completion or introduce new step navigation.
5. Show one estimate-entry action: **Start estimate** for stages that currently use Start (`new_lead`, `contacted`, `site_visit`, `design_meeting`), and **Continue estimate** for stages that currently use Continue (`estimate_in_progress`, `estimate_sent`, `negotiation`, `won`, `lost`). Preserve this existing classification rather than inventing saved-draft progress. Both actions belong to the same latest layout. Do not render the older explanatory contact card.
6. Match the second image by omitting the Initial payment panel and entire Follow-ups panel from this landing screen at every stage, without leaving empty reserved space. This removes their rendering here, not their backend records, APIs, payment rules, or other consumers. Keep the Leads list's existing quick-review history and the shared workflow component's default behavior elsewhere intact.
7. Use the same latest layout for standalone leads without a project link. Preserve the existing authorized fallback for project-specific Messages, Critical, and Project status controls; do not fabricate a project or show dead controls. Stage changes update real state without switching back to the removed layout.
8. Leads and All leads open the list. Neither becomes a redirect to the last-created lead. The created project appears in the appropriate refreshed list results, subject to the active filters.
9. Reuse the reference's existing warm neutral surface, typography, compact borders, line symbols, and responsive styles. Do not introduce decorative effects, new icons, layout abstractions, or dependencies.
10. Preserve loading and retryable error states, semantic headings and step list, keyboard operation, focus visibility, and unclipped wrapping on mobile.

## Data, state, and API impacts

- Creation remains the existing transactional request and response. Stable returned lead/project IDs determine the destination and all subsequent actions.
- Every lead gets the requested presentation without a PATCH or estimate write on page mount, reload, or navigation.
- The stage eyebrow and selector always show the actual saved stage. A new lead displays **New lead** and **Start estimate**. Starting successfully updates the backend to **Estimate in progress**, refreshes affected lead queries, and opens that lead's builder. The screenshot's stage text is a data example, not a hardcoded label.
- **Continue estimate** opens the existing builder for that same lead without resetting its saved stage. In particular, opening an estimate must not change `estimate_sent`, `negotiation`, `won`, or `lost` back to `estimate_in_progress`. The builder retains its established editability/approval rules.
- A failed Start estimate update stays on the same lead with a retryable error and retained layout; it must not recreate the project or navigate early. Preserve pending/disabled behavior while starting and block duplicate activation.
- Existing lead query refresh behavior remains authoritative for stage/list consistency. No new API fields, cache namespace, permissions, backend audit events, or payment confirmations are introduced by the presentation change.
- Manual stage selection retains its existing mutation, refresh, pending, and retryable error behavior. It changes the saved stage and appropriate action label, not the page design.

## Assumptions and open decisions

- “At lead we should get list” means the Leads navigation destination remains the existing lead workspace/list; it does not request a new list design.
- “Same like 2nd image” means the existing estimate-entry composition, not the room configuration builder and not an automatic change to the saved pipeline stage.
- Applying the latest layout to existing and newly created leads at every stage is intentional, following the user's clarification that the first image is superseded.
- Start/Continue wording reflects the existing stage classification; the page does not claim that a draft exists solely because the stage allows Continue.
- No unresolved decision blocks this specification. Approval accepts the single-screen scope and truthful saved-stage labels.

## Acceptance criteria and verification

- **AC1 Creation landing:** A rendered Sales initiation flow navigates to the returned lead ID and shows the project heading, contact metadata, property type, three estimate steps, and Start estimate for a `new_lead`. No Initial payment, Follow-ups, or old estimate-card explanation is present.
- **AC2 List navigation:** Opening Leads or clicking All leads shows the list. The creation refresh makes the new lead available in matching list results. Use at least two distinct lead/project identities to detect an incorrect destination or stale details.
- **AC3 Persistent rendering and truthful state:** Direct entry and remount/reload use the same composition at all stages. The header/selector show the actual saved value; simply viewing a lead sends no stage mutation and creates no estimate.
- **AC4 Start and continue:** Start estimate updates only the current lead, stays pending/disabled until the update succeeds, and then opens that lead's builder. A failed request shows a retryable error without duplicate creation or premature navigation. Continue estimate opens the correct builder without a stage mutation, including for an already-sent or closed lead.
- **AC5 Single-screen replacement:** Cover all lead-stage values and a standalone lead without a project. The latest header and three-step guide remain consistent; the action label changes appropriately. Stage switching never restores the old header, contact card, payment panel, or follow-up form. Existing history remains available in list quick review; shared workflow/chat/status consumers retain their permissions and behavior.
- **AC6 Responsive and accessible:** Render desktop, tablet, 390px, and 320px widths with synthetic long project/contact values. Check the reference hierarchy, no horizontal overflow or clipped controls, keyboard navigation, accessible action names, and an effective 200% zoom layout. Exercise All leads, both Start and Continue estimate, and the stage selector in the rendered UI.
- **AC7 Engineering checks:** Run focused `LeadDashboard.test.tsx` and `LeadDetail.test.tsx` regressions, affected navigation/accessibility tests, frontend typecheck and production build, and `git diff --check`. Broaden only if shared components change or checks expose additional risk. This repository has no lint script. Report exact results and temporary visual QA artifact paths during implementation handoff.

## Risks, compatibility, and rollback

The primary risk is changing saved state just to obtain the newer design. Remove the presentation branch and assert that mount performs no write. A second risk is reusing the existing unconditional stage PATCH for Continue and regressing a later-stage lead. Test Start and Continue separately, including sent/closed stages. Removing local follow-up and payment rendering must not remove persisted records, shared component functionality, or authorized controls on other screens.

This supersedes the earlier stage-only redesign deliberately and changes the presentation of all lead details. It requires no data rewrite. Rollback is the bounded frontend diff; backend data and the existing estimate workflow remain compatible. No production mutation or external communication is authorized or needed.

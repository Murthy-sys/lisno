# Estimate in progress content redesign

## Goal
Redesign only the content of the Estimate in progress lead screen to follow the user's supplied reference: a project-focused header, compact Lead/Messages navigation with Project status, and a full-width Estimate section showing three steps and one Continue estimate action.

## Requested amendment: remove Follow-ups
The latest user request removes the entire Follow-ups card from `estimate_in_progress`: heading, activity selector, note field, save action, empty/error copy, and activity history. Render no replacement card or reserved space. Keep saved activities and Follow-ups on other lead stages intact. Preserve the completed header, navigation, estimate guide, Continue estimate, and payment removal.

Evidence at amendment discovery: `LeadDetail.tsx` rendered its Follow-ups section unconditionally inside `content`; the target-stage stylesheet supplied its compact layout. Existing `LeadDetail.test.tsx` assertions expected it on this screen. This is a small UI removal; no backend, activity deletion, permission, API, or schema change is required. Unused target-only follow-up styling may be removed as part of the bounded change. The completed redesign and earlier payment edits remain the baseline to preserve.

## Current behavior and evidence
- Route: `/estimator-sales/leads/:leadId`, rendered by `frontend/src/features/leads/LeadDetail.tsx`; target stage is `estimate_in_progress`.
- The current header leads with `clientName`, then combines project name, property type, and location. Phone/email appear inside `ContactAndEstimateCard`.
- `ContactAndEstimateCard.tsx` displays contact details, Next action, explanatory copy, and the estimate button beside a Follow-ups form. It has only one current caller, LeadDetail.
- `ProjectChatHeader.tsx` owns the existing Lead/Messages links, unread indicators, project Critical count, and Project status control. Critical comes from `summary.data.counts.openCritical`, with existing access, loading, error, and stale-data handling.
- `ProjectStatusButton.tsx` provides the authorized project-status drawer and focus restoration. It must remain the source of that interaction.
- Lead data provides one `propertyType` string, project/client names, phone, email, location, and next action. The screen has no authoritative three-step completion state.
- The previously completed payment change hides Initial payment only at this stage. Preserve it and its regression coverage.

## Existing work to preserve
At discovery, these files were already modified by the completed payment task: `LeadDetail.tsx`, `LeadDetail.test.tsx`, and `ProjectWorkflowPanel.tsx`. Its specification and plan (`2026-10-08-estimation-hide-initial-payment*`) are untracked. Their relevant diffs were reviewed. Extend this work; do not revert, stage, or overwrite it.

## Scope and non-goals
Apply the redesigned presentation only when the lead stage is `estimate_in_progress`. Keep the application sidebar, global topbar, daily-critical control, estimate builder, other lead-stage layouts, and other project screens unchanged. This is a frontend presentation change with no new dependencies, API fields, permissions, pricing, payment rules, approval behavior, or persistence changes.

The screenshot is a composition reference, not a source of customer records or hardcoded counts. Use existing live data. The latest amendment explicitly removes Follow-ups at this stage; retain applicable workflow content.

## Content and visual requirements

### Header
- Keep the existing All leads navigation in a compact position above the content.
- Show “Estimate in progress” as the small stage label.
- Use `projectName` as the primary heading, with the saved property type beside it as a compact badge. Display only the actual property value; do not invent the second BHK value shown in the reference.
- Below the title, show client name, phone, and email in one wrapping contact row. Retain location as quiet secondary metadata.
- Place the labeled Lead stage select and project Critical badge at the right on wide screens, following the reference hierarchy. Keep existing stage mutation, pending, and error behavior.
- Source the Critical badge from the existing project chat summary. Its link opens the same project's Critical message filter. Show zero only when returned by the backend, retain stale-count warnings, and preserve access-denied/disabled/loading/error behavior. Do not duplicate the count in the navigation row.

### Navigation
- Present Lead and Messages as compact text tabs with the current Lead tab clearly indicated. Preserve unread and mention counts, routes, accessible names, and chat registration.
- Align the existing Project status button to the right of the navigation row. Keep its drawer, permission checks, loading/error states, and keyboard focus behavior intact.
- For missing project links or unavailable chat access, preserve the established authorized fallback rather than displaying dead tabs or fabricated counts.

### Estimate section
- Replace the narrow contact card with one full-width Estimate section beneath navigation.
- Show an Estimate heading with a small calculator symbol and a light divider.
- Present a single ordered three-step guide using the reference labels: **1 Rooms & Dimensions**, **2 Select Scope**, **3 Generate Estimate**. On desktop the steps share one row; on narrow screens they become compact stacked rows.
- Each step uses a small number marker, simple line symbol, and concise label. Keep padding and height compact, consistent with the user's previous requests to avoid oversized cards and wasted space.
- These are informational steps, not new tab controls or a new wizard. Do not fabricate completion/current-step state or add dead buttons. A restrained green treatment may emphasize the starting step without announcing it as saved progress.
- Keep one Continue estimate action aligned right on desktop and comfortably accessible on mobile. Use the existing handler and route, including its pending/disabled and retryable error behavior. A decorative static arrow is optional; no animation is required.
- Move contact details to the header and retain Next action as quiet metadata near the estimate action or follow-up area, without restoring the old explanatory paragraph or budget information.

### Remaining content
- Remove the entire Follow-ups card from Estimate in progress. Retain it on other lead stages, including its activity selector, note, validation, save/retry behavior, and history. Hiding the card must not delete saved activities or clear an unsaved note entered at another stage during the same mounted lead view.
- Keep applicable workflow notices, reminders, progress, and client actions available below the estimate entry section. Initial payment remains hidden at `estimate_in_progress`.
- Avoid fixed-height empty containers; absent sections must not reserve card-sized space.

## Design and accessibility constraints
Reuse the established Poppins typography, warm neutral surface tokens, dark text, muted green emphasis, borders, and existing control dimensions. Match the reference's arrangement while respecting the user's constraints: no new Lucide icons, pure-white surface styling, gradients, shadows, decorative motion, or exaggerated corner rounding. Use small local inline SVG symbols where needed; do not add an icon dependency.

Scope all new styles/variants to this presentation. Use meaningful headings and an ordered list for steps, native controls, visible keyboard focus, and accessible contact/action names. Contact details and long project names must wrap without clipping. Preserve usable controls at 320px, tablet widths, and desktop, including an effective 200% text/viewport zoom check. Prefer content-driven height and 12–20px spacing to large empty areas.

## Integration approach and invariants
Extend the existing lead view and estimate-card component rather than creating a second page or duplicating mutations. Use a scoped presentation option/composition in existing project navigation to position its Critical summary with header controls, keeping its current default output for other callers. Keep one source for summary data, chat access checks, unread indicators, and stream registration.

State transitions remain unchanged: Lead stage updates via the existing mutation and query invalidation; Continue estimate uses the existing stage update then navigation; follow-ups save through the current lead activity API. Repositioning content must not clear unsaved note state or expose counts from another project. Permission logic and backend authority remain unchanged.

## Assumptions and decisions
- “Only content” includes the lead-specific header, navigation, and Estimate section shown in the screenshot, while excluding application chrome and the estimate builder.
- The three reference steps describe the existing workflow; this request does not introduce direct step navigation or progress tracking.
- Workflow information remains below the reference composition. Follow-ups is removed only at `estimate_in_progress`, following the latest request. No unresolved decision blocks the specification.

## Risks and acceptance criteria
- **AC1 Reference composition:** At desktop width, project title/property/contact details lead the page, stage/Critical controls align right, navigation sits below, and the Estimate section spans the content width with three compact steps and Continue estimate.
- **AC2 Accurate data:** Property/contact/project details and Critical counts come from existing sources; missing, stale, denied, or unavailable data never becomes a fabricated value or unauthorized control.
- **AC3 Behavior retained:** Continue estimate, Lead stage, Messages/Critical navigation, and Project status drawer continue working. Follow-up save/retry remains available on other lead stages; temporarily hiding the card through a stage change retains an unsaved note.
- **AC4 Prior scope preserved:** No budget or Initial payment panel returns at this stage. Other lead stages, app chrome, estimate builder, and other shared navigation consumers retain their behavior and presentation.
- **AC5 Responsive/accessibility:** Desktop, tablet, 390px and 320px layouts have no horizontal overflow, clipped long labels, overlap, or unnecessary fixed height. Keyboard order/focus, labels, pending/error states, and the step list remain usable.
- **AC6 Verification:** Run focused lead, shared navigation/status, and payment regressions as affected; frontend typecheck/build; diff hygiene; rendered desktop/mobile interaction and accessibility checks using synthetic data. Compare actual screenshots with the reference hierarchy. Full-suite expansion should follow any discovered shared-component risk.
- **AC7 Follow-ups removal:** At `estimate_in_progress`, no Follow-ups heading, activity fields, Add follow-up button, activity history, or empty card is rendered. The full-width Estimate section remains usable. Switching to another lead stage restores the existing Follow-ups UI and recorded history; no activity records are changed by this visibility change. Verify with the focused rendered lead regression, desktop/mobile inspection, frontend typecheck/build, and diff hygiene.

Principal risks are shared-navigation style leakage, duplicate chat registration/counts, false step-progress claims, and losing follow-up state during conditional layout changes. Scoped variants, existing data hooks, stable form state, and focused rendered regression checks address these risks. Rollback is limited to reverting this scoped UI diff while retaining the earlier payment change. No migration, deployment, production mutation, commit, or push is included.

## Status
Original redesign and approved Follow-ups removal amendment implemented and verified in Mode A; see the separate fresh amendment results in the [task plan and verification evidence](../plans/2026-10-08-estimation-progress-content-redesign.md). No deployment was performed.

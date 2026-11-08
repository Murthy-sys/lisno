# Designer estimate additions after initial approval

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal

After initial Client approval, the assigned Designer can clearly open the estimate,
add the required items, save the revised draft and send it for Client reapproval.
The entry point must be available from the Designer's project estimation screen.

## Current behavior and evidence

- `frontend/src/features/estimates/ProjectQuotationWorkspace.tsx` always renders
  `ClientQuotation` with `readOnly` for every non-Client, including the primary
  Designer. It offers no editing entry point.
- `DesignerDesignPlanTasksPage.tsx:256` separately offers a staff-editor link when
  the backend returns `canEditQuotation` and a `leadId`. The existing label is
  “Review or update estimate” for the initially approved state.
- `LeadEstimateWorkspace.tsx:164` uses the collaborative lifecycle's draft status
  to allow edits. `ConfiguredEstimateBuilder.tsx:315` already contains an Add items
  picker for editable selected-item views. The Sales catalogue presentation is
  separately role-gated; its existence does not establish that Designer additions
  are unsupported by the editor.
- `backend/src/services/estimate-decision.service.ts:562` moves a collaborative
  initial approval to the post phase with lifecycle status `draft`, preserving the
  initial approval record.
- `backend/src/services/estimate-tiers.service.ts:74` and
  `project-workflow.service.ts:2507` already scope V3 editing to the assigned
  primary Designer. The latter exposes `canEditQuotation` and stable project,
  estimate and lead IDs.

The confirmed gap is inconsistent discovery of the existing editor from the
project quotation view. The exact user session/route has not been reproduced;
verification must also exercise the complete initial-approval-to-item-add path.

## Requirements and recommended approach

1. Show a clear **Add / edit estimate items** action for the eligible assigned
   Designer after initial approval, in the project quotation view and the existing
   Designer workspace entry point. Reuse the established staff estimate editor.
2. Resolve eligibility and the editor's lead ID from existing backend-provided
   project/estimate identity and capability data. Do not authorize by role alone,
   infer IDs from names, or display an editor link for a mismatched project.
3. In the editable current post-approval draft, the Designer can open Add items,
   browse/search the relevant catalogue, select a room and add an item. Selecting
   an item adds only that item, once; unrelated recommended items stay unselected.
   Preserve the current configure-baskets/rooms path when more scope is needed.
4. Saving preserves the additions after refresh. Existing save-conflict and
   uncertain-outcome recovery remains intact. The existing revised-quotation
   submission action uses the saved current version and requires Client reapproval
   when scope changes. Preserve immutable initial approval and issued snapshots.
5. Keep pending review, historical snapshots and closed/finally approved estimates
   subject to their existing restrictions and explicit reopening flow. This fix
   does not silently unlock them.
6. Retain existing secondary-Designer and unrelated-user restrictions. During
   capability loading/error/stale state, fail closed and provide the existing
   retry pattern; do not flash an unauthorized editing action.
7. Keep action placement compact, keyboard accessible and usable on mobile.
   Preserve all earlier Sales, Client quotation, recommendation and kickoff changes.

## Assumptions, scope and non-goals

- “Initial approval” means the Client's initial/pre-estimate approval, before a
  revised quotation's final approval. “Designer” means the currently authorized
  assigned Designer; V3 retains the primary-Designer ownership rule.
- Scope is the missing entry point and any demonstrated local UI restriction in
  the existing add/save/submit path. Prefer existing capability reads and mutations;
  no new editing API or permission expansion is planned.
- No new pricing formula, Configuration write, migration, dependency, dashboard
  redesign, automatic item selection, deployment or external communication.

## Data, API and failure impacts

Reuse the existing project/estimate/lead identifiers, `canEditQuotation`, versioned
staff save and revised-quotation publication contracts. Client-facing projection
remains separate from the internal staff editor so internal lines are not lost.
No persistence change is expected. If tracing reveals an incompatible backend
permission/approval contract, report that evidence before expanding this scope.

## Acceptance and proportionate verification

- **AC1:** An eligible primary Designer viewing an initially approved project can
  find the action and reach that exact project's editable current estimate.
- **AC2:** Add one previously absent item to one room, save, reload and see exactly
  that addition. Existing items and another room/project remain unchanged.
- **AC3:** Submit the saved revision through the established reapproval flow;
  the original approval snapshot remains unchanged.
- **AC4:** Secondary/unrelated users cannot gain editing access; pending, closed,
  historical, stale and error states retain their protections.
- **AC5:** Relevant rendered interaction/accessibility checks and desktop/mobile
  inspection pass. Run targeted workspace/editor/Designer tests and frontend
  typecheck/build. Run a focused backend contract test only if a backend contract
  actually changes. Do not run unrelated full repository suites for this fix.

## Risks and open decisions

Main risks are linking the wrong project, broadening secondary-Designer authority,
using a Client-only projection as the staff draft, or changing immutable approval
history. Stable-ID checks and reuse of the existing staff editor address these.
No product decision is currently required beyond approval of this bounded scope.

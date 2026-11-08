# Sales Submit and client estimate action layout

Date: 2026-11-08
Status: Approved and implemented; verification evidence recorded in the task plan

## Goal and confirmed scope

Show Sales a clear Submit action alongside Save draft. Simplify button placement
on the client quotation/estimate screen so the next required action is easy to
find and secondary actions do not compete with it.

The user confirmed that “client screen” means the quotation/estimate screen.
Client dashboard, Procurement, unrelated project screens, and a general visual
redesign are outside scope.

## Current behavior and evidence

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx:1157` renders Save draft
  in Setup separately from Continue/Return controls. Its footer at line 1226
  does not render in Setup. `submitAllowed` at line 668 also excludes Setup.
- The non-Setup footer already supports submission, but renders it only when
  `draftEditable && canPublish`. Labels differ by workflow, including
  “Approve and send to client” rather than Submit. A capability denial can leave
  an editable Sales estimate with Save draft and no submit control or local
  explanation. These are verified visibility paths, not a reproduction of the
  particular user's current estimate or assignment.
- The existing submit mutation at line 565 saves current edits first, uses the
  returned estimate version, and then submits. Sales publication uses the
  existing checklist/confirmation. Saving alone does not publish.
- `backend/src/routes/estimates.ts:372` grants version-3 initial publication to
  the assigned Sales owner. Post-design publication belongs to the assigned
  Designer and requires the existing approval/revision conditions. The submit
  route at line 696 preserves version checks, readiness, ownership, and
  publication/manager-routing behavior.
- `frontend/src/features/client/ClientQuotation.tsx:367` mixes Configure,
  Builder/Summary navigation and review actions in one wrapping row. Save and
  Discard appear separately in the footer at line 411. Recovery controls appear
  in several state branches. The Setup component additionally has Save, Return
  and Continue controls in separate locations.
- `ClientQuotationSubmittedView.tsx:34` places Edit and Export at the top and
  approval/change-request controls in the bottom review area. Shared
  `ClientEstimateDecision` already implements confirmation, request notes,
  version checks, duplicate prevention and query refresh.
- `clientQuotation.css:78` forces the client footer to static positioning and
  gives top-level navigation buttons similar space at narrow widths. The action
  hierarchy needs consolidation using existing styles and components.

## Recommended approach

Use one consistent action area per screen state. Keep navigation at the top,
editing controls beside their content, and save/submit/review decisions in the
footer. Put infrequent client actions in an accessible “Estimate options”
disclosure. This keeps the established workflow and makes its actions visible.

Changing Sales into a post-design publisher would be a different authorization
and workflow change. It is not needed to show Submit and is excluded here.

## Sales requirements

1. In the current editable Sales estimate, show **Save draft** as the secondary
   action and **Submit** as the primary action together in one footer, including
   Setup, Builder, Summary and Proposal. Render each action once. Keep Setup's
   Continue to items/Return navigation distinguishable from saving/submission.
2. A new empty Setup shows Submit disabled with a concise reason to select and
   complete items first. A valid existing estimate can submit from Setup using
   its current draft selections; it must pass the same checks as other views.
   The current view alone must not be the reason submission is denied.
3. Show the principal blocking reason next to disabled Submit, with a relevant
   recovery action where one already exists. Cover missing items/prices/setup,
   outstanding client requests, stale/conflicting or unverified data, busy
   operations, and missing publication permission. Prefer one clear reason over
   a stack of repeated notices; preserve detailed field errors at their fields.
4. Preserve server authority. When a Sales draft is editable but publication is
   denied, keep Submit disabled. For the established post-design workflow, say
   that the assigned Designer submits revised quotations. Unknown/missing
   capability data must never enable submission or imply that saving succeeded.
5. Submit invokes the existing checklist and explicit confirmation, saves current
   changes once, and then uses the returned version for the existing submission
   operation. The confirmation must explain whether this submits for internal
   review or approves/sends the quotation to the client. A concise Submit label
   must not conceal delivery or approval effects.
6. Keep existing locks, errors, retry behavior, permission refresh and duplicate
   prevention. A failed draft save must not submit; a failed submit must preserve
   the saved draft. Historical/locked/submitted views do not acquire edit or
   publication rights. Existing authorized resend/retry actions remain available
   under their current conditions without duplicating Submit.
7. Designer and other-role workflows retain their current authority and behavior.

## Client layout and state behavior

Use the existing design system without new decorative effects, icon packages,
fonts or dependencies. Keep the client-facing copy short and task-oriented.

- **Header:** quotation identity/version when relevant and one status message.
  Keep the financial summary clearly labeled as saved or submitted, including
  GST; do not repeat the same total in competing action bars.
- **Navigation:** Items and Summary together. Put Configure estimate and a
  read-only submitted-version shortcut in “Estimate options” when available.
  Keep search, room/basket navigation and Add items in the builder toolbar.
- **Footer:** one dominant action appropriate to the current state, with only
  necessary secondary actions. Never show a disabled Save or approval button
  merely to fill space. Sales' explicitly requested disabled Submit treatment
  does not apply to the client screen.

| Client state | Main action area | Secondary/contextual behavior |
| --- | --- | --- |
| Clean editable estimate, no current approval ready | Saved status/total; no Save or Discard buttons | Configure or view a submitted copy through options when permitted |
| Unsaved item changes | Save changes | Discard changes; review remains blocked until changes are saved or discarded |
| Setup changes | Save and continue to items; Continue to items when unchanged | Cancel/return; consolidate the separate setup Save button into this action. Preserve draft-only Save setup changes when a valid setup lacks the room/basket selections required to continue. |
| Clean estimate ready for client review | Review quotation | Opens the verified submitted snapshot; does not immediately approve |
| Submitted snapshot awaiting decision | Approve quotation | Request changes, both using the existing confirmation/note flow |
| Approved, superseded, waiting for staff, or read-only | Current status, no inapplicable decision controls | Relevant history/PDF access remains available |
| Error, stale data, or unknown save outcome | The relevant retry/verify recovery action | Preserve local edits; never silently discard or hide the recovery path |

On the submitted snapshot, use Back to estimate as navigation and place Download
PDF in the secondary options area. Keep the version visible so the downloaded
artifact is identifiable. Approval and Request changes stay in one decision
area. Preserve subtotal, GST, total and required change comparisons; consolidate
repeated help copy without removing decision-critical information.

Desktop workspace actions should remain reachable beside the workspace's bottom
edge without covering items. Mobile uses a compact, clearly ordered action area
with reserved content space and safe-area support. Embedded quotations use
document flow so multiple estimates do not create overlapping global footers.
Long labels wrap, and the options disclosure supports keyboard use, Escape and
focus return. Required loading, empty, error and permission states remain clear.

## Invariants, data and side effects

- Frontend presentation and eligibility explanations only; no new backend route,
  role permission, schema, migration, email behavior or financial calculation.
- Stable estimate/review/room/item IDs, actor/session context, CAS/version checks,
  immutable published snapshots, client-on-behalf proof and existing audit events
  remain authoritative. Preserve all affected query invalidations.
- Save remains a draft-only operation. Client changes still return to staff
  confirmation before renewed approval. Approval always targets the current
  verified published review, never an unsaved editor total.
- Keep integer-paise boundaries and all existing saved/submitted amounts. Do not
  derive missing totals or fake workflow readiness in the UI.
- Preserve the preceding single-item recommendation fix, its room-specific
  browsing, receipts, pagination and focus behavior.
- No live estimate mutations, customer messages, deployment, commits, pushes or
  dependency changes are authorized by this specification stage.

## Assumptions and open decisions

- Confirmed: the client quotation/estimate screen is the client target.
- Proposed assumption: showing Submit does not expand Sales' post-design
  publication permission. Disabled availability should explain the next owner.
- Proposed assumption: the Sales Save/Submit pair is consistent across Setup
  and item/summary views; incomplete Setup retains an obvious route to items.
- No additional user decision is required for this bounded approach. Any
  requirement to let Sales publish Designer-owned revisions would need a separate
  explicit specification change before implementation.

## Risks and verification acceptance criteria

1. **AC1: Visible Sales actions.** One Save draft/Submit pair exists in each
   editable current Sales view. Valid Setup can reach the same submit flow;
   empty Setup shows a useful blocker and creates no submission request.
2. **AC2: Truthful submission.** Exercise allowed initial Sales submission,
   denied post-design Sales publication, authorized Designer behavior, missing
   permissions, stale versions, pending checks and read-only history. Verify
   save-before-submit ordering, no submission on failed save, one request under
   repeated confirmation, and clear delivery/approval wording.
3. **AC3: Client hierarchy.** Each table state above has one decision area and
   only its relevant actions. Configuration, PDF, submitted-version access and
   recovery remain discoverable. No duplicate action IDs/labels or empty bars.
4. **AC4: Client integrity.** Dirty changes block review; unknown saves remain
   verifiable; failures preserve edits; approval/change requests use the existing
   review ID/version and refresh affected data. Two unequal estimates verify
   identity and saved/submitted total separation.
5. **AC5: Usability.** Render at 1440×900 and 390×844 with long labels, keyboard
   navigation, open disclosures/dialogs and scrolling. Actions stay reachable,
   content is not covered, focus is stable and there is no horizontal overflow.
6. **AC6: Regression.** Run focused Sales workspace/checklist/collaboration,
   client quotation/setup/approval and recommendation tests, frontend typecheck
   and build, plus risk-based shared regressions and repository hygiene checks.
   Use synthetic browser data. No real submissions or approvals during QA.

Baseline caution: the preceding task's focused checks and browser QA passed,
but the broader frontend run had 92 failures in eight unchanged test files.
Treat that as recorded context, not a passing baseline or proof about future
failures. Compare new failures to exact current evidence and report limitations.

## Worktree preservation and likely affected areas

The initial dirty set is the preceding recommendation fix: 14 modified frontend
files, two new scope-helper files, and four untracked Sales/OCR workflow documents.
Its relevant workspace, shared shell and style diffs were inspected. Preserve
them; do not reset or reformat unrelated work.

Likely implementation areas are `LeadEstimateWorkspace.tsx`, existing Sales
checklist/collaboration tests, `ClientQuotation.tsx`, `ClientQuotationSetup.tsx`,
`ClientQuotationSubmittedView.tsx`, `clientQuotation.css`, and their tests.
Shared decision components should change only through a backward-compatible
presentation option if necessary. The task plan and execution ownership will
be prepared separately after this specification is approved.

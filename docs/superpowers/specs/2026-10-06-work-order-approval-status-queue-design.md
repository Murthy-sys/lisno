# Simple work order issue and payment schedule

## Award modal presentation, 6 October 2026

The user's next presentation request replaces the Award drawer with a centered modal. Keep vendor, monetary totals, schedule, chips, direct issue and approval behavior unchanged. Reuse the existing Dialog/overlay primitives for focus containment, Escape/backdrop close, background isolation and focus restoration. Scope the visual treatment to this modal: existing warm surfaces and forest accents, a responsive bounded width, persistent header/footer and an internally scrolling body. Use a 340ms scale/rise and opacity entrance, a fading backdrop and a 180ms exit; reduced-motion preference removes movement and closes immediately. Close remains available for a read-only award, while active mutations prevent accidental dismissal. No new dependency or backend change.

Acceptance: Award opens a centered dialog at desktop and narrow widths, content and actions remain reachable, previous award regressions pass, close/reopen and keyboard focus work, and reduced-motion behavior is covered.

## Latest user correction, 6 October 2026

This correction supersedes the separate Procurement approval visit described below for orders below ₹50,000. In the award drawer, when the server proposal's gross amount is strictly below ₹50,000 and Procurement is its only required role, show **Issue work order & lock payment**. That action saves/submits the proposal, records the acting Procurement user's revision-bound approval, and issues through the existing guarded issue path. It must also resume an already submitted Procurement-only proposal after a failed response. Exactly ₹50,000 retains the established approval flow. For new or revised proposals strictly below ₹50,000, Procurement is sufficient even when the quote exceeds the estimate; retain the actual amounts and budget snapshots. For amounts at or above ₹50,000, preserve the existing budget-override requirement. Previously frozen proposals retain their stored role requirements until revised.

Remove **Reason for awarding outside the recommendation** and its minimum-length blocker from both frontend and backend. Eligible nonrecommended vendors can be awarded without a reason; preserve historical saved reasons where applicable. Remove only the award drawer's **Frozen quotation** expansion/table. Keep the main vendor bid comparison, monetary totals, payment schedule, and chips.

Verification must cover a nonrecommended award without a reason, an enabled direct-issue action for a valid small award, revision-bound Procurement approval and issuance in the same action, retry after a partially completed request, and the unchanged higher-value approval and budget-override gates. The user’s live ₹141.60 nonrecommended bid also exposed an existing over-budget gate; its direct-issue regression must cover that case. These are corrections to the already authorized implementation and continue in selected Mode A.

## Goal

Use one clear award screen. Show the selected vendor and five payment rows with selectable **PM, Design, Proc, Fin** chips after each percentage and calculated amount. More than one chip can be selected on a row. Each selected role receives an approval task for the current award revision. The work order and payment schedule lock only after every required approval is recorded.

## Current behavior and evidence

- Clicking **Award** opens the drawer in `frontend/src/features/procurement/ProcurementBasketComparison.tsx`, but it still presents three sequential actions: **Prepare award**, **Submit for approvals**, and **Issue work order & lock payment schedule**. The first action creates a draft; only the second creates approval tasks. The third requires a return visit after approval. This is the extra workflow the user wants removed.
- The drawer already shows the selected vendor, five calculated payment rows, and selectable approver chips. The previous correction removed the per-line detail and general Work order terms fields; neither should return.
- `backend/src/domain/procurement-basket-tender.ts` derives the five amounts from one Advance input and the **gross amount including GST**. Its existing threshold puts an order of **up to and including ₹50,000** in the Procurement tier; an amount above ₹50,000 requires Program Manager, Designer, Procurement, and Finance approval.
- The award proposal stores the selected role slots per milestone. `procurement-basket-award.service.ts` separately creates a draft, submits it to the approval queue, and records revision-bound decisions. `project-purchase-order-basket-issue.service.ts` separately issues the order from `ready_to_issue` after checking the current source, bid, approvals, and commitment in a Mongo transaction.
- The affected tender files and much of the worktree were already dirty before this request. Preserve unrelated edits.

## Requirements

1. Match the supplied screen's simple layout: vendor and gross total at top; five rows for **Advance, Mobilisation, Progress 50%, Progress 85%, Final**; each row shows its percentage, server-calculated amount, then the four role chips. Chips are multi-select controls with clear selected, unselected, focus, and disabled states. Keep the current percentage-editing behavior; this request changes approval selection, not the payment formula.
   Remove the separate **Work order details** section with per-line Scope, Target date, and Delivery location controls from the award drawer. Those fields must not block preparing an award. Preserve values already present on the frozen BOQ or a saved proposal; when none exist, leave them unspecified rather than inventing values in the issued tender work order or vendor assignment. Ordinary purchase-order entry still requires its existing fields.
   Remove the empty **Work order terms** textarea and its preparation requirement from this drawer too. A new basket award can omit general terms; store and return `null`, omit the empty terms section from issued work-order views and PDF, and preserve existing saved terms on an award revision. Ordinary purchase-order entry retains its required terms input.
2. After a vendor bid is received, **Award** opens one drawer showing that vendor, the payment schedule, and required approver chips. A single primary action, **Send for approvals**, saves the selected bid and schedule and submits the current revision. It creates visible tasks for the selected roles in **Work order approvals**, scoped to the same proposal revision and eligible assigned accounts. Each task shows the payment rows that caused the role to be selected. A tentative chip click before this action creates no task. Do not expose separate Prepare and Submit actions for this flow.
3. The selected roles are required **before issuing and locking the work order**. A role selected on several rows receives one task listing those rows; its recorded decision covers those rows on the immutable revision. Rejection or changed chip selections require a revised proposal and fresh decisions. Do not label an unsent draft **Pending** or show it in a queue.
4. For gross orders **up to and including ₹50,000**, preselect Procurement on the payment rows and disable PM, Design, and Finance chips. **Send for approvals** creates the Procurement task. After its approval, the server issues and locks the work order automatically if all existing issue guards pass. No other role task is created for this tier.
5. For gross orders **above ₹50,000**, retain the existing four distinct mandatory work-order approval roles. All four chips are available across the payment rows, and each required role must be selected on at least one row before submission. **Send for approvals** creates one task per role with the selected rows shown. A budget override remains an additional Super Admin decision at any amount. After the last required current-revision approval, the server automatically issues and locks the work order if every existing issue guard passes. There is no routine final Issue button. The issued schedule and chip selections become read-only.
6. Keep existing vendor eligibility, current bid/BOQ/source checks, payment calculations, budget checks, version/CAS, idempotency, audit, and single-commitment transaction protections at issue time. Existing issued orders and older proposal records remain readable and processable without fabricating a stored chip selection.

## Scope and non-goals

- Simplify the existing award drawer to one submission action and make completed approvals trigger the existing issue transaction. Show pending, blocked, and issued states in the same drawer and existing approval/order screens.
- Do not add payment disbursement, change actual paid amounts, change finance ledger calculations, or make every percentage independently editable. Approval of an award revision is not evidence of payment.
- Do not widen who may issue orders or approve a budget override. Do not change other purchase-order workflows.

## Data, API, and UX impact

- Extend each proposal milestone with a validated set of role slots keyed by stable milestone ID; carry the set through preview/save/detail and the issued-order view. Existing records without the new field retain their prior approval route and show **Approver chips not recorded**. No historical backfill is expected.
- Basket awards may omit per-line work-order details. Existing frozen BOQ/proposal values remain attached to their lines; missing values stay absent through issue and are presented as unspecified where a label is needed. The general purchase-order input contract remains strict.
- Basket awards may also omit general work-order terms. New proposals and tender-origin issued orders represent missing terms as `null`; existing saved terms remain readable. The award drawer never asks for those terms.
- The backend creates revision-bound approval tasks on submission, authorizes each role's decision, and refuses issue until all required decisions exist. The frontend cannot synthesize a task, approval, or issued state.
- Use the existing create/update and submit validations under one user action. If either call fails, show the exact blocker and allow retry without duplicating a proposal or approval task. A saved draft may exist as a recovery state; the user sees only **Send for approvals** to resume it. Keep the current idempotency, version, and immutable-revision checks.
- The drawer's submit request explicitly opts into automatic issue after approval. Existing API submissions without that option retain their prior manual-issue behavior for compatibility.
- On the last required approval, invoke the existing issue transaction from a server-owned path with explicit attribution to the initiating Procurement request and the triggering approval. Do not give an approver the Procurement issue permission. A failed issue guard must preserve the recorded approvals and leave a visible **Approved · issue blocked** state with a controlled Procurement retry action; it must never claim the order is issued or locked. Automatic retries must be idempotent and cannot create a second order or commitment.
- Keep the screen's action and status adjacent to the schedule. Before submission, show a clear next step; after submission, show the actual pending roles; after successful issuance, show the locked order. Queue entries remain account-scoped.
- No production mutation, deployment, migration, commit, or push is authorized by this specification.

## Assumptions and risks

- The user's “less than ₹50K” refers to the existing Procurement tier, which includes **exactly ₹50,000**. Amounts above ₹50,000 retain the current four-role issue gate.
- The supplied screenshot informs row layout. The user's later instruction sets the under-₹50,000 chip rule: Procurement selected; other chips disabled. For higher amounts, preserve the existing four-role approval requirement and let Procurement select which payment rows each role reviews.
- The existing approval screen records one decision per role per revision. Use one task per selected role containing all rows selected for it; this avoids duplicate decisions for the same role and revision.
- The user wants the normal path to require one action in the Award drawer and no return visit to issue. An automatic issue failure is an exception state that needs a safe retry after its cause is fixed.
- The issue gate has financial and authorization impact. Test stale proposals, missing selected-role decisions, budget override, retries, concurrent issue attempts, and exactly one resulting order/commitment.

## Acceptance criteria

1. Each of the five payment rows shows its current percentage and amount followed by selectable role chips; multiple roles can be selected. Existing schedule arithmetic and amount reconciliation remain intact.
   The award drawer has no separate per-line Work order details section, and a BOQ without those values can be prepared and issued after its required approvals.
   The award drawer has no Work order terms textarea, and a proposal without general terms can be submitted and issued after its required approvals. Empty terms are not shown in issued views or PDFs.
2. A valid ₹44,000 gross award has Procurement selected on each payment row and disables all other chips. One **Send for approvals** click creates one Procurement task in **Work order approvals**; its approval automatically issues and locks the order after server checks succeed.
3. Exactly ₹50,000 follows the Procurement tier; ₹50,000.01 retains the existing four-role minimum. A required budget override also blocks issue until approved.
4. A draft does not claim an approval is pending or appear in the approval queue. After submission, each required role sees one current-revision task containing the rows selected for it. Decisions update queue and issue state; old decisions do not satisfy a revised proposal.
5. Stale bids, missing required approvals, unauthorized actors, failed transactions, and repeated or concurrent requests cannot issue an order or create duplicate commitments.
6. Focused domain, API/transaction, and rendered tests cover threshold, chip persistence, task creation/assignment, decisions, issue gating, and issued read-only state. Run typecheck/build and rendered desktop/mobile accessibility checks.
7. **Award** opens the approval drawer; the normal flow has no visible Prepare, separate Submit, or final Issue step. The drawer shows server-backed Pending and Issued states. A failed automatic issue leaves approvals intact, shows the blocker, and provides an authorized idempotent retry without producing a duplicate order or commitment.

## Open decisions

This revision recommends automatic issue and lock after the last required approval, with a controlled retry only if a server issue guard fails. Approval of this specification confirms that behavior. Use the existing one-decision-per-role approval model and the confirmed Procurement-only chip selection for the small-order tier.

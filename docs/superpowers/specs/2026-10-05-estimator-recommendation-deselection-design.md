# Remove recommendation-selected lines when their source is deselected

Date: 2026-10-05

## Goal

In the editable Estimator estimate, deselecting a configured Main Line also deselects related lines that the estimator added from that Main Line's recommendation. The same rule applies when deselecting a Main Basket unchecks its source lines. The change affects estimate selection only: Configuration rules, catalogue items, vendor/procurement views, and approved estimate history are untouched.

## Current behavior and evidence

- `LeadEstimateWorkspace.tsx` includes a related line in `selectRecommendedLine` by setting `ConfiguredLineDraft.included = true`. The callback receives the target but does not record which selected source Main Line(s) caused the addition.
- `updateConfiguredLine` and `toggleMainBasket` currently uncheck only the clicked line or lines in the removed Basket. An included recommendation target stays selected, keeps contributing to totals, and can be saved or submitted after its source is unchecked.
- `roomRecommendations.ts` has exact room, source Main Line ID, target Main Line ID, and all current reasons for a shared target. The estimate input, `Estimate` model, and saved line response do not currently carry recommendation-selection origin.
- The approved 2026-10-03 smart-recommendations specification said a source deselection leaves its target selected. This request supersedes that rule **for targets selected from recommendations in Estimation**. It does not change how recommendations are authored or displayed in Configuration.
- The relevant frontend workspace, estimate route/model, and their tests already have unrelated uncommitted changes. Implementation must inspect and preserve those diffs.

## Required behavior

1. Record, by stable ID and room, the included source Main Line(s) when **Select item** in the recommendation slide-out includes a target. A target selected directly from the item list is an independent/manual selection, even if Configuration also recommends it. Quantity, selling rate, and classification edits alone do not change selection origin.
2. On explicit source-line deselection, remove that source from the origin of each recommendation-selected target in the same room. Deselect a target when no included source remains for it. A target with another included recorded source remains selected. Apply the same cleanup to lines unchecked by Main Basket deselection; follow recommendation chains until no further recommendation-only line needs deselection. Do not touch another room.
3. A target independently selected in the item list remains selected when a recommending source is removed. Explicitly unchecking and manually rechecking a previously recommended target makes that new selection independent. A recommended target that is deselected retains its draft quantity/rate fields for later editing, but is absent from selected counts, totals, Summary, Proposal, and submitted scope.
4. Keep a Main Basket selected if it was revealed by a recommendation but becomes empty after cleanup. The estimator may choose other lines in it; Basket selection itself carries no included amount. Existing automatic slide-out dismissal rules continue to work, without duplicate dialogs or rollback of unrelated lines.
5. Preserve recommendation origin through draft save, reload, catalogue refresh, and subsequent edits in editable estimate statuses. Use an optional array of source Main Line IDs on configured estimate lines; absent origin on older saved lines means independent selection. Do not infer origin from matching names or current rules, and do not rewrite historical estimates.
6. On estimate save, validate and normalize origin against included configured source lines in the same room. A removed source cannot leave an included recommendation-only target behind in the saved result, including when an older client omits the optional field. Recalculate amounts and GST from the normalized included lines using the existing paise path and estimate version check. Locked/approved estimates remain read-only.

## Scope and contract

- Estimator UI and its estimate-draft API/model only. No Configuration rule write, catalogue deletion, procurement change, invitation, new permission, email, migration/backfill, or dependency is planned.
- The optional configured-line field is `recommendationSourceMainLineIds: string[]` in input, persistence, and editable draft response. Values are unique stable IDs from included configured lines in the same `roomId`; self-reference and invalid IDs are rejected. Missing on a new line means manual. For an existing line, a legacy request omitting the field retains its stored origin before server cleanup; explicit manual re-selection sends an empty array.
- The frontend applies cleanup immediately so the estimate, count, and total change together. The backend performs the same origin cleanup before saving and computing totals so a stale or older client cannot persist an orphaned recommendation selection. Existing saved lines without origin are preserved as manual because their earlier selection path cannot be reconstructed reliably.
- The established estimate `expectedVersion`/CAS and authorization remain authoritative. An estimate save failure leaves the local draft available for retry; no external action occurs from a deselection itself.

## Risks and controls

| Risk | Control |
| --- | --- |
| A manually chosen or shared target is removed | Track the selection origin; retain manual targets and targets with another included source. |
| A recommendation chain leaves an orphaned target | Apply room-scoped cleanup until stable and verify a two-step chain. |
| A stale client persists an orphaned line or incorrect amount | Normalize persisted origin and included flags before server amount/GST calculation. |
| Existing estimates lose scope | Treat absent historical origin as independent; no backfill or mutation of locked estimates. |
| Refresh/hydration drops origin | Carry the optional field through draft restoration, source refresh, save response, and subsequent saves. |

## Acceptance criteria

1. Selecting POP false ceiling and then adding recommended painting includes both only in the active room. Unchecking POP immediately unchecks painting and updates count, subtotal, GST, total, Summary, Proposal, and next draft save.
2. If POP and Functional Lights both led to the same painting target, unchecking one keeps painting; unchecking both removes it. A recommendation chain is cleaned transitively. Other rooms and unrelated items remain selected.
3. A manually included painting line stays included when POP is unchecked. Manual uncheck/recheck of a recommendation target makes it independent. A removed recommendation target's edited quantity/rate is retained for a later choice.
4. Save and reload preserve origin for new recommendation selections. Server validation rejects invalid or cross-room origins and prevents an orphaned included target from affecting saved totals. Older saved lines with no origin remain included until the estimator explicitly deselects them.
5. The current recommendation slide-out close behavior, recommendation availability/version guards, read-only status, Configuration authoring, and Procurement are unchanged. Focused frontend interaction and backend estimate-route/replica tests, typechecks/builds, rendered keyboard/accessibility checks, and `git diff --check` pass.

## Assumption for approval

“Remove items” means uncheck recommendation-added estimate lines, so they stop contributing to scope and price; it does not delete Main Lines or recommendation rules from Configuration. Existing saved lines without recorded origin cannot be distinguished from manually selected lines and are retained.

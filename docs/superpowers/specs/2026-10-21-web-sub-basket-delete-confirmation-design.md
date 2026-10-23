# Web Sub-Basket deletion confirmation reliability

Date: 2026-10-21
Status: Approved on 2026-10-21; implemented and locally verified under the approved task plan.
Classification: Bounded frontend fix in a destructive workflow; preserve backend deletion safeguards.

## Goal

Resolve the web Configuration dialog's unexplained disabled Delete Sub-Basket button. Accept harmless whitespace differences in an explicitly typed confirmation name, continue rejecting genuinely different names, and explain every blocking state so the user can complete or recover the form safely.

## Observed behavior and evidence

**User report:** deletion sometimes cannot proceed. The user confirmed that the button stays disabled. The screenshot shows an empty Sub-Basket named `sub 1`, zero configuration references, an entered name, and a populated reason. A screenshot cannot establish the input's exact characters or current query state.

**Verified current code:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSubBasketDialogs.tsx:275` enables deletion only when `confirmationName === impact.subBasketName`, the trimmed reason is nonempty, preview IDs match, no vendor or caller block exists, and mutation/preview/refresh/saved states permit it.
- The name input retains raw typed/pasted characters. Its `Field` displays an exact-name hint but receives no validation error when the values differ. Thus an extra leading/trailing/internal space or a non-breaking space can silently disable deletion even when the text looks equivalent.
- `backend/src/models/AiEstimatorKnowledgeSubBasket.ts` normalizes saved names during validation with NFKC, trimming, and whitespace collapse. The update service also normalizes names. Do not infer corrupt stored data from the screenshot or from route-schema parsing alone.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts:596` requires exact equality with the current stored name and separately enforces actor authorization, parent identity, expected version, current impact token, vendor references, transactional deletion, and audit history.
- The dialog blocks while `impactQuery.isFetching`, but a cached preview may remain visible without a specific refresh-in-progress message. Existing error/vendor/identity/caller-block messages must be preserved.
- The same dialog serves Configuration index deletion, basket management, and inline draft-rule removal. Any confirmation fix must remain consistent across those callers while preserving their different restrictions and explanatory copy.
- Current baseline command from `frontend/`: `npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx`; **16 tests passed**. These cover exact-name rejection, success, conflicts, vendor references, load errors, refresh recovery, and related management behavior, but do not establish the exact cause in the user's session.
- Worktree was clean at investigation start, commit `276d22ca`. No live delete request, database inspection, production mutation, or application edit was performed.

**Conclusion and uncertainty:** silent raw-text confirmation mismatch is a verified usability defect and a plausible explanation for the reported intermittent symptom. The particular invisible character or predicate in the screenshot is unconfirmed. Loading/blocking feedback must also make other legitimate disabled states understandable; do not simply force-enable the button.

## Recommended approach and alternatives

1. **Recommended: whitespace-tolerant confirmation with explicit validation.** Trim outer whitespace and collapse each run of whitespace to one ordinary space for comparison only. Preserve case, punctuation, word boundaries, and all non-whitespace characters. After a match and all existing guards pass, submit the exact name from the reviewed impact snapshot. This improves typed/pasted input handling without changing the backend's exact-name contract, stable target IDs, or concurrency checks.
2. **Alternative: preserve raw exact matching and add mismatch feedback only.** This retains the current byte-sensitive input rule but still requires users to identify and remove invisible whitespace themselves. It explains the failure without making visually equivalent input work.

Approval of this specification selects option 1. This is a deliberate change to frontend confirmation semantics: harmless whitespace differences become acceptable. The backend remains authoritative and unchanged. Do not add a one-click autofill or bypass the typed confirmation.

## Scope and non-goals

In scope: the shared web Sub-Basket deletion dialog, a small local comparison helper only if useful, focused dialog/caller regression tests, and minimal existing-style presentation for validation/loading messages.

Likely affected files: `KnowledgeSubBasketDialogs.tsx`, `KnowledgeBasketManagementDialog.test.tsx`, and relevant portions of `KnowledgeIndexPage.test.tsx` and `KnowledgeBudgetAlterationBuilder.test.tsx`. Use the existing `Field` error/ARIA capabilities; avoid a broad shared-form redesign.

Out of scope: mobile changes, Main Basket or Main Line deletion redesigns, name migrations/renames, API schemas, backend exact comparison, permissions, transaction/cascade logic, audit formats, shared catalog normalization, dependencies, real basket deletion, deployment, or production data access.

## Requirements

### Confirmation semantics

Define comparison text as `value.trim().replace(/\s+/gu, " ")`. Apply it symmetrically to the entered name and the reviewed preview name. Both must be nonempty and equal. Do not apply case folding, NFKC, fuzzy matching, punctuation removal, zero-width-character removal, or removal of word-separating spaces in this deletion confirmation helper.

For a preview name `sub 1`:

| Entered value | Expected outcome when every other guard passes |
| --- | --- |
| `sub 1` | Enable deletion. |
| Leading/trailing spaces around `sub 1` | Enable deletion. |
| Multiple whitespace characters between `sub` and `1` | Enable deletion. |
| A non-breaking space between `sub` and `1` | Enable deletion. |
| `sub1`, `Sub 1`, `sub 2`, or an empty/whitespace-only value | Keep disabled with appropriate field guidance. |
| A different letter, punctuation mark, or visually similar non-whitespace character | Keep disabled; no fuzzy equivalence. |

Keep the user's input visible as entered; do not rewrite it on every keystroke. When submitting, use the exact `impact.subBasketName` from the same reviewed snapshot as `impact.version` and `impact.impactToken`, only after the normalized comparison succeeds. Keep `basket.id` and `subBasket.id` as request target IDs and preserve `draftOnly` for inline removal.

### Validation and blocked-state UX

- Replace the current hint that requires exact spaces with accurate guidance: the name and capitalization must match; extra whitespace is ignored.
- Show a concise name-mismatch error linked to the input after a nonmatching field has been interacted with and blurred, or another deliberate validation point. Do not flag an untouched empty field on initial open or announce errors for every partial keystroke.
- Clear mismatch feedback immediately when corrected. Once the preview is ready, the reason is nonempty, and all guards pass, enable deletion without closing/reopening the dialog.
- A missing or whitespace-only reason remains invalid; expose its field guidance after interaction. A valid name never overrides the reason requirement.
- When a cached impact is refreshing, show an explicit accessible status such as “Checking the latest deletion impact…” while retaining the existing lock. If paused/offline preview work is encountered, expose its actual state and a safe recovery path; never treat stale counts as fresh approval.
- Reuse existing visible permission, catalog, identity, vendor-reference, conflict, request-error, and completed-deletion/refresh-retry messages. Avoid contradictory or duplicate blockers. Keep pending mutation state labeled as deletion in progress.
- Preserve keyboard navigation, focus restoration, semantic form submission, and `aria-invalid`/`aria-describedby` associations through the existing `Field` component. Keep the explanation visible independently of hovering over a disabled button.

### Safety and state invariants

- Empty Sub-Baskets remain deletable when the preview is current, the confirmation/reason are valid, and no independent blocker exists. A zero item/reference count is neither an extra block nor permission to skip safety checks.
- Preserve vendor-reference blocks, caller permission/catalog blocks, preview-parent/child identity checks, and inline frozen-group rules.
- Never submit while the required impact refresh is pending/failed/paused, while a mutation/refresh is busy, or after a successful deletion has already committed.
- A changed impact token/version still requires a refreshed review and cleared name confirmation. Preserve the reason, never auto-retry deletion, and do not carry a prior match onto a different target.
- Retain the synchronous duplicate-submit lock, query synchronization, and separation between successful deletion and subsequent catalog-refresh failure. Retry refresh must not repeat deletion.
- The backend's exact-name validation, expected version, impact token, actor permissions, transaction boundaries, sibling/parent preservation, retained historical revisions, and audit reason remain unchanged.

## Data and API impact

No endpoints, fields, persistence schemas, or migrations change. The frontend sends the exact preview name in the existing `confirmationName` field after a whitespace-equivalent typed confirmation. The backend can still reject a concurrent rename or changed impact; preserve its conflict handling. No normalization is applied to stable IDs, stored records, or audit history.

## Acceptance criteria and verification

1. **AC1: Whitespace reliability.** Exact input and the supported outer/repeated/non-breaking-space variants enable deletion with a valid reason and fresh matching preview. The request contains the exact preview name and its original target IDs/version/token.
2. **AC2: Incorrect-name protection.** Missing word separators, changed case, different names, punctuation changes, zero-width additions, and blank input remain blocked. A valid nonmatching attempt displays an associated, actionable field error and sends no request.
3. **AC3: Complete eligibility feedback.** Invalid reason, preview refresh/failure/paused state, permission/catalog/identity loss, retained vendor references, pending mutation, and committed deletion have accurate visible feedback and appropriate disabled behavior. Correcting a field or completing a successful unchanged preview refresh restores eligibility without reopening.
4. **AC4: Conflict and duplicate safety.** Changed preview clears confirmation, retains reason, and requires explicit re-confirmation. Double click/Enter cannot submit twice. A successful delete followed by refresh failure offers refresh-only recovery.
5. **AC5: Caller consistency and accessibility.** Configuration index, basket management, and inline draft removal retain their correct restrictions; typed confirmation and error associations work by keyboard. Test at desktop and a narrow web viewport without clipping action buttons or feedback.
6. **AC6: Verification evidence.** Run focused dialog/index/inline removal regression tests, frontend typecheck and build, rendered interaction/accessibility checks using synthetic fixtures, and `git diff --check`. Existing backend validation remains unchanged; add backend verification only if implementation discoveries require a separately approved backend change. Do not use a real deletion as a reproduction step.

## Risks, assumptions, and rollback

- Assumption: the user wants to correct a blocked web confirmation, not remove deletion safeguards. Their clarification confirms the button remains disabled; there is no reported post-submit server error.
- Principal risk: frontend comparison and submitted payload diverge. Test both valid equivalent input and negative cases, including the exact raw payload and unchanged version/token/IDs.
- Another risk is retaining confirmation after a preview or target change. Keep the existing invalidation behavior and exercise asymmetric IDs/names across callers.
- Actual session-specific root cause is still unconfirmed. If reproduction exposes a different state defect, fix only within these invariants; update this specification before materially expanding contracts or scope.
- No data backfill or rollback migration is needed. Rollback reverts only this request's frontend confirmation/feedback changes and tests, preserving unrelated work.

## Approval boundary

Only this specification is created at this stage. The separate task plan, execution-mode choice, implementation, and final verification follow `AGENTS.md`. No production deletion, install, deployment, commit, or push is authorized by this request.

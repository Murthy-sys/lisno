# Sub-Vendor Lisno margin range

Status: the 15%–20% correction was approved, its task plan was approved, and execution mode A was selected. Implementation, independent integrity review, command checks, desktop interactions and mobile layout checks are finished. Automated mobile interaction checks timed out and remain unverified; current evidence and limitations are recorded in the task plan.

## Goal

In Execution → Sub-Vendor, retain the **Lisno Margin** card with minimum and maximum controls and Test calculations, and restrict both configured margins to **15% or 20%**: the user's clarified 15%–20% range in multiples of five.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgePmcMarginInput.tsx` now renders adjacent Min./Max. Lisno Margin controls with five-point arrow steps, but the shared input still has 10%–20% bounds. `knowledgePmcMargin.ts` also accepts integer basis points throughout that range, including percentages between the requested five-point values. Changing the HTML step alone does not enforce multiples on typed values or API requests.
- `KnowledgeModeCalculationTable.tsx` already uses the Lisno Margin heading. The maximum is stored in `advanced.payload.subVendorMarginBps`; the optional minimum is stored in `advanced.payload.subVendorMinimumMarginBps`.
- `KnowledgeModeCalculationSimulator.tsx` already displays both configured margins and sends the selected Min. or Max. rate to the backend for one breakdown. Configuration values are read-only; Quantity and Discount are temporary inputs. Max. is selected initially.
- `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts` applies Sub-Vendor margin to the amount including low-quantity impact, using integer paise and basis points. Impact applies at or below the quantity limit. Discount applies to the subtotal after margin. These rules differ from In-house markup/discount rules.
- `backend/src/domain/ai-estimator-knowledge-validation.ts` validates both saved margin fields against 10%–20%. The preview route and calculation domain enforce the same old bounds for the selected rate. Runtime validators and OpenAPI need to agree on the new allowed values; no new endpoint or transport field is needed.
- The hidden `minimumMarkupBps`/`startingMarkupBps` within existing Sub-Vendor rate settings are generic markup data, not the current Sub-Vendor margin source. They must not be repurposed into Lisno margins; their values can differ from the allowed margin range.
- Pending-change review and conflict review already cover both Lisno margins, including legacy fallback and accepted server counterparts. Preserve that behavior.
- `backend/src/models/AiEstimatorKnowledgeSection.ts` revalidates payloads when active sections are copied into a draft. The existing internal exception only permits inherited inclusion/exclusion conflicts. Tightening margin validation without a narrowly scoped repair-copy path would prevent older margins from being copied for correction.

## Requirements and UX

1. Replace the Sub-Vendor margin card heading with **Lisno Margin**. Render **Min.** and **Max.** percentage inputs side by side, following the compact In-house composition. Accessible names are **Min. Lisno Margin (%)** and **Max. Lisno Margin (%)**. Use one concise allowed-range hint; retain responsive reflow and existing focus/error styling.
2. Both percentages must be multiples of five within **15%–20%**, so the valid configured values are **15% and 20%**. Both arrow controls step 15 → 20 and back; typed values and API requests follow the same rule. Require Min. ≤ Max.; equal pairs remain valid. Show `Allowed: 15%–20% · Steps of 5% · Min. ≤ Max.` PMC retains its existing bounds and behavior.
3. Replace the single value with two controls; do not add a redundant third current-margin input. Both changes use the existing Save Mode/Discard and pending-change workflow. Invalid/partial input must remain editable and visible; block a conflicting save without discarding edits.
4. Test calculations displays both configured rates as read-only fields and a **Calculate with** radio group: **Max. Lisno Margin** and **Min. Lisno Margin**. Default to Max., matching In-house's default starting/high rate. Calculate one selected scenario at a time, matching the existing simulator pattern.
5. Selecting either basis clears the previous result and invalidates any pending response. The request sends that exact configured rate to the existing Sub-Vendor preview branch. Changing Quantity or Discount also clears the result. Simulator changes never save configuration.
6. Use **Lisno Margin** consistently for the margin input, selected calculation basis, margin amount, subtotal, discount helper text, validation messages and change/conflict review. Keep **Sub-Vendor** as the execution-source and simulator context name; it still identifies which configuration is being tested.
7. Preserve loading, read-only/denied, missing UOM, unconfigured margin, backend error, stale-response, close/reopen and keyboard behavior. Do not fabricate results or display a result returned for the wrong margin/discount or wrong calculation branch.

## Data and compatibility contract

Recommended approach: retain `advanced.payload.subVendorMarginBps` as the maximum Lisno margin and add `advanced.payload.subVendorMinimumMarginBps` for the minimum. This adds one optional field without renaming persisted data or the established single-rate preview contract.

- Both stored values remain integer basis points: 15% = 1500; 20% = 2000. Backend and frontend enforce safe integers, 1500–2000 bounds, multiples of 500 basis points and ordering. Numerically equivalent input such as `15.00` is valid; `16` and `17.5` are not. Retain existing transport key names and numeric units.
- A legacy payload with `subVendorMarginBps` and no own `subVendorMinimumMarginBps` property reads as Min. = Max. = the existing value. Opening it causes no write and no pending changes. Do not infer a new minimum, round stored values or borrow generic markup defaults.
- Previously valid values from 10%–20% that do not satisfy the new rule remain readable exactly as stored, including in immutable active revisions. Show a field-level correction message in the draft editor. Normal advanced-section saves, activation and calculation previews require the new valid pair; unrelated sections can retain their established workflows. Do not silently replace either margin with 15% or 20%.
- Permit an unchanged historical advanced section to be copied from Active into Draft for repair even when its only margin problem is the newly introduced allowed-value rule. Keep this exception internal to that trusted copy operation and limited to values valid under the old 10%–20% contract. Do not permit invalid types, partial pairs, reversed pairs, arbitrary out-of-range values or normal API writes through this exception. Preserve the existing independently scoped inclusion/exclusion repair exception. Memory and Mongo copy behavior must agree.
- On the first margin edit of a legacy payload, materialize both values from the original effective pair before applying that edit. Editing Max. must not silently change Min. Editing an unrelated field must not materialize the pair.
- Explicit `null` is an intentional empty value, not permission to fall back. An entirely unconfigured pair remains permitted in drafts, matching current nullable-margin behavior; the simulator requires a valid complete pair. Once the minimum field is explicitly present, partially configured pairs are invalid for Save Mode and rejected by backend validation. Missing-minimum legacy payloads remain supported.
- Save, refetch, Discard, version conflict review and active-to-draft copying preserve both fields. Pending-change comparison uses the effective legacy pair so compatibility normalization alone is not shown as a user edit.
- Keep the established advanced payload allowlist and tighten authoritative validation. A rejected pair causes no payload, version or audit write. Preserve established authorization, optimistic concurrency and immutable historical records. New validation issues must distinguish the new allowed-value restriction from unrelated structural errors so repair copying cannot bypass those errors.
- Preview requests continue using `subVendorCalculation.subVendorMarginBps` for the selected rate. Preview responses continue supplying `subVendorMarginBps` and `subVendorMarginAmountPaise`; these transport keys are unchanged. The UI translates presentation labels to Lisno. No `modeCalculationMarkupBasis` is sent for Sub-Vendor.

## Calculation invariants

Reuse the current backend Sub-Vendor calculation for either rate. Do not copy In-house's financial formula or its discount-cap policy merely because the controls look similar.

- Low-quantity impact applies when quantity ≤ configured limit. Preserve existing per-unit rounding, integer-paise calculation and overflow checks.
- Add the selected Lisno margin to the revised amount including impact, using existing rounding.
- Apply the existing custom discount to the subtotal after the selected margin. The configured Min./Max. selects the calculation rate; it does not introduce an effective-margin floor or change the current 0%–100% custom discount policy.
- Preserve displayed reconciliation: revised amount + Lisno margin = subtotal; subtotal − discount = final total; final vendor charges + Lisno margin = final total. Retain the signed balance presentation for large discounts.
- Example with Base Rate ₹200, Quantity 10, Limit 15, Impact 10%, Min. 15%, Max. 20%, Discount 0%: revised amount ₹2,200; Min. margin ₹330 and total ₹2,530; Max. margin ₹440 and total ₹2,640.

## Scope, assumptions and non-goals

This is a cross-stack configuration/preview change. Scope is the Sub-Vendor margin card, its saved values, related review/validation messages and its Test calculations panel. Preserve PMC, In-house, inclusion/exclusion behavior, shared navigation and prior uncommitted work.

Interpretation for approval: the latest “15 to 20” specifies the allowed range, and the preceding request for multiples of five makes 15% and 20% the permitted values. This applies to both Lisno margin fields and the selected Sub-Vendor preview rate. Retain the existing Max. default and custom-discount semantics.

Compatibility decision: preserve historical values for read and repair, while enforcing the requested values on new saves and previews. This requires an explicit correction before saving an advanced section containing an older invalid margin. Automatic clamping would silently alter configured financial values; continuing to accept those values on normal writes would not enforce the requested rule.

No dependency, new endpoint, schema migration, backfill, seed, live database mutation, historical rewrite, estimate-pricing rollout, commit, push or deployment is included. Existing approved estimates and downstream finance are outside this configuration simulator change.

## Risks and mitigations

- Legacy data must retain its stored value: use the equal-value read fallback and test first-edit materialization, no-write opening, correction, Save and Discard. Below-range and non-multiple historical values cannot be previewed until corrected in a draft.
- Strict model validation could block repair cloning: test the narrow internal compatibility exception on both repository paths, including refusal to bypass unrelated payload errors. Normal saves and activation remain strict.
- Hidden generic markup values could be mistaken for margins: keep their persistence and consumers separate.
- Shared PMC components could regress: introduce scope-specific range presentation and preserve PMC behavior with focused tests.
- Pending/review projections could omit Min.: trace both fields through all workspace consumers and mutation/refetch paths.
- Switching basis during a slow request could show the wrong result: invalidate request sequences and verify returned-rate agreement.
- The worktree contains 44 modified source/test paths and four untracked specification/plan files from the prior list and margin work. This follow-up must preserve those edits. Recapture relevant per-target diffs before any writers start.
- No stored data is rewritten. Rolling back this restriction to the preceding 10%–20% validator requires no migration because newly accepted 15%/20% values also satisfy that validator. Deployment is outside this task.

## Acceptance criteria and verification

- **AC1 — Presentation:** Sub-Vendor shows the Lisno Margin heading and adjacent Min./Max. controls; no margin-specific Sub-Vendor label remains in this flow or its review messages. Desktop and mobile retain accessible labels and no horizontal overflow.
- **AC2 — Validation:** accept 15% and 20%, including equivalent formatting, and reject 10%, 14.99%, 16%, 17.5%, 20.01%, invalid types and unsafe integers. Equal values, reversed pairs, explicit empty and partial pairs behave consistently in frontend/backend. Arrow keys advance by five points and respect both limits. Invalid API saves cause no state/version/audit change; direct preview requests cannot bypass validation. PMC retains 10%–20% behavior.
- **AC3 — Persistence:** 15%/20% save and reload exactly; Discard restores both; legacy values resolve to equal margins without writes; first margin edit freezes the unchanged counterpart. Historical 10% and 17.5% values remain readable and can be copied into a repair draft, but cannot pass normal save/activation/preview until corrected. Verify the copy exception cannot admit unrelated invalid payloads. Use two distinct Main Lines to verify isolation.
- **AC4 — Simulator:** both configured values are visible; Max. is initially selected; selecting Min. sends its exact rate and returns the correct labelled breakdown. Reopening uses the current configuration, and temporary choices do not mutate it.
- **AC5 — Financial correctness:** verify the example above, unequal values, quantities below/equal/above the limit, decimal quantities, nonzero discount, rounding, large-discount signed balances and reconciliation using backend responses.
- **AC6 — Interaction safety:** keyboard controls, read-only configuration, missing UOM, invalid pair, error/retry, basis changes during pending requests and stale responses are covered. Existing PMC and In-house behavior passes regression checks.
- **AC7 — Integrated checks:** focused frontend margin/editor/simulator/pending/review tests; backend validator/calculation/preview tests; isolated replica-set save/refetch and rejection-before-write checks for changed persistence behavior; typecheck and build in both workspaces; rendered desktop/mobile interaction and accessibility checks; `git diff --check` and final status. No lint script exists. Report exact checks, unrun checks and limitations at handoff.

## Open decisions

None beyond approval of the stated UX and compatibility assumptions. After specification approval, create the separate dependency-ordered task plan before requesting the execution mode for this new task.

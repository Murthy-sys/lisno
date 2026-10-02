# Configured estimate live row amount task plan

Source of truth: [Live amount in configured estimate line rows](../specs/2026-10-02-estimate-line-live-amount-design.md).

## Working contract and ownership

- The primary agent owns the approved product interpretation, the calculation contract, integration, final diff review, and verification coordination. Only the row's displayed amount becomes an inclusion-independent preview. Basket, room, GST, estimate, saved, and backend amounts remain inclusion-aware.
- Before any writer starts, capture `git status --short` and relevant per-target diffs. `configuredEstimate.ts`, `configuredEstimate.test.ts`, `ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, and `LeadEstimateWorkspace.test.tsx` are already dirty; `ConfiguredEstimateBuilder.test.tsx` is already untracked. Preserve every existing hunk and identify its owner before assigning a target.
- Calculation slice ownership: `frontend/src/features/leads/configuredEstimate.ts` and `configuredEstimate.test.ts` only. UI slice ownership: `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and `ConfiguredEstimateBuilder.test.tsx` only. The primary agent owns `LeadEstimateWorkspace.test.tsx` for cross-screen integration evidence and any strictly necessary change to `LeadEstimateWorkspace.tsx`. No writer edits a file outside its boundary.
- No backend, API type, catalogue, persistence, shared stylesheet, lockfile, or other in-progress estimate file is in scope. The existing backend amount formula is a read-only parity reference.

## Dependency-ordered tasks

### 1. Capture baseline and settle the helper contract

**Owner:** primary agent. **Dependencies:** approved specification and execution mode.

- Save the current dirty-path set and relevant diffs to a temporary baseline. Inspect the current row, calculation helper, workspace totals, saved payload, and backend formula immediately before edits.
- Define `configuredLinePreviewAmountPaise(line): number | null`: parse the row's rate to paise, scale a positive quantity at its UOM precision, use the existing integer half-up rounding and safe-integer limit, and return `null` for blank/invalid/overflow input. Its result ignores `included`.
- Preserve `configuredLineAmountPaise(line)` as the inclusion-aware source for all totals: excluded is zero; included valid uses the same underlying arithmetic; included incomplete remains `null`. Do not let preview data enter the save payload.
- Agree on row feedback: valid unchecked lines show the computed amount plus a concise `Not included` cue; a missing or invalid input shows a neutral placeholder while existing field validation remains visible. Quantity and price labels use the same `line.uomName`.

**Exit evidence:** the helper signature, rounding, invalid states, and financial boundary are fixed before implementation work is split.

### 2A. Implement and test paise preview calculation

**Owner:** calculation slice owner in Mode A; primary agent in Mode B. **Files:** `configuredEstimate.ts`, `configuredEstimate.test.ts`. **Dependencies:** task 1. **Parallel with:** task 2B after task 1 in Mode A.

- Extract shared arithmetic only as needed, then add the inclusion-independent preview helper without changing current included totals, rate parsing, UOM quantity validation, line construction, restoration, or source-review behavior.
- Cover 100 × ₹60 = ₹6,000, fractional UOM precision and half-up rounding, a distinct Rft or count unit, valid zero rate, blank/invalid rate, zero/invalid quantity, and unsafe result. Assert the same unchecked line still contributes zero through `configuredLineAmountPaise` and the checked line contributes the preview amount.

**Exit evidence:** specification criteria 1, 3, and 4 hold at the pure calculation boundary.

### 2B. Show live row amount and actual UOM in the builder

**Owner:** UI slice owner in Mode A; primary agent in Mode B. **Files:** `ConfiguredEstimateBuilder.tsx`, `ConfiguredEstimateBuilder.test.tsx`. **Dependencies:** task 1 and the agreed helper contract. **Parallel with:** task 2A in Mode A; final test run waits for both.

- Use the preview helper only for the row's Amount output. Keep all basket/sub-basket/rail subtotal calls on `configuredLineAmountPaise`.
- Label Quantity and Price with the same current UOM. Distinguish an unchecked preview from an included amount without hiding the value. Keep the output's item-specific accessible name and avoid a misleading ₹0 when fields are blank or invalid.
- Add rendered interaction coverage that edits quantity, selling price, and stepper values and observes immediate output updates. Use at least two unequal items with different UOMs; test unchecked and checked states, saved/read-only rendering, and keyboard operation. Do not create tests that only snapshot markup.

**Exit evidence:** specification criteria 1, 3, and 5 hold in the row UI, with no preview value flowing into subtotal calculations.

### 3. Integrate financial state and payload checks

**Owner:** primary agent. **Files:** `LeadEstimateWorkspace.test.tsx`; `LeadEstimateWorkspace.tsx` only if integration exposes a required local fix. **Dependencies:** tasks 2A and 2B.

- Reconcile the two slices against the recorded dirty baseline. Add an integration test with an unchecked line at 100 sq-ft × ₹60/sq-ft and a second, unequal UOM/room line. Assert the live row preview, zero initial contribution, exact subtotal/GST/total after checking, and removal after unchecking without field loss.
- Verify existing Save draft and Submit estimate gates: blank selected rate can be saved as incomplete draft but cannot be submitted; malformed selected/persisted values block both; new unchecked lines are absent from the payload. Check that source-UOM review and snapshot handling still apply.
- Do not change backend calculation, version checks, line identities, or saved payload shape to make the preview pass.

**Exit evidence:** specification criteria 1–4 are proved across component state and existing financial boundaries.

### 4. Review and verify the integrated result

**Owner:** primary agent in Mode B; primary agent coordinates `integrity_reviewer` followed by `verification_runner` in Mode A. **Dependencies:** task 3 and all writers finished.

- Run focused calculation, builder, and workspace tests first. Run the adjacent lead/estimate frontend test lane, frontend typecheck and build, then broaden only to investigate a concrete failure. The earlier full frontend suite was red in this dirty worktree, so report any new broad-run result separately and do not attribute failures without evidence. There is no repository lint script.
- Render the configured item-selection view at wide desktop, tablet, and narrow mobile sizes. Edit quantity and rate with pointer and keyboard; inspect unchecked preview versus included basket/room/estimate totals, pending/invalid display, long UOM label wrapping, focus, and horizontal overflow. Run the available accessibility scan. Confirm a 200% zoom equivalent does not clip fields.
- Run `git diff --check`, inspect `git status --short`, compare all touched files with the captured baseline, and report exact checks, unrun checks, temporary outputs, and remaining risks. Do not stage, commit, deploy, or mutate production.

**Exit evidence:** specification criteria 1–5 are verified on the integrated worktree; any inability to exercise a state is explicitly reported.

## Acceptance trace

| Specification criterion | Tasks | Verification |
| --- | --- | --- |
| 1. 100 × ₹60 live preview while unchecked | 2A, 2B, 3 | Pure calculation, rendered row, integration test, browser edit |
| 2. Inclusion changes totals only | 2A, 2B, 3 | Checkbox transition with exact subtotal/GST/total and payload assertions |
| 3. Actual UOMs, temporary/saved rows, rounding | 2A, 2B, 3 | Asymmetric UOM test fixtures, saved row, parity cases |
| 4. Invalid/blank/zero/overflow/source-review states | 2A, 2B, 3 | Boundary tests and existing workflow gates |
| 5. Accessible responsive interaction | 2B, 4 | Keyboard, screen-reader labels, viewport/zoom/overflow and accessibility checks |

## Safe parallelism

Mode A can run tasks 2A and 2B concurrently only after task 1 sets the helper signature and confirms the dirty file baselines. Their file sets do not overlap. Task 3 waits for both, and integrity review precedes final verification. Mode B performs the same tasks inline in dependency order.

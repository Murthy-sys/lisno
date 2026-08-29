# AI Estimator Knowledge Rupee Pricing — Task Plan

**Date:** 2026-08-29  
**Specification:** [2026-08-29-ai-knowledge-rupee-pricing-design.md](../specs/2026-08-29-ai-knowledge-rupee-pricing-design.md)  
**Status:** Implemented and verified locally

## 1. Outcome and guardrails

Present and accept AI Estimator Knowledge Base money in Indian rupees while keeping backend APIs, persistence, lineage, and calculations in integer paise.

Guardrails:

- Do not modify backend money fields or formulas.
- Do not perform client-authoritative financial calculations.
- Do not touch existing Estimator, Finance, Procurement, project workflow, or global styles.
- Preserve current user-owned changes in:
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
  - `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- No dependency, lockfile, migration, deployment, commit, push, or production action.

## 2. Baseline and ownership

### T0 — Capture the financial and dirty-worktree baseline

**Owner:** Primary agent  
**Dependencies:** None

Tasks:

1. Record `git status --short` and the exact diff of each affected dirty file.
2. Trace all user-facing paise labels, input states, validation messages, formatters, request builders, and rendered price summaries.
3. Confirm backend contracts still require integer `inputAmountPaise` and `unitRatePaise`.
4. Run the existing money-presentation, pricing validation, pricing workspace, and preview tests before writers start.

Acceptance:

- Pre-existing edits are identified and attributable.
- Existing paise behavior is reproducible.
- No writer starts without explicit ownership of a dirty target.

## 3. Implementation tasks

### T1 — Exact rupee/paise presentation-boundary helpers

**Owner:** Frontend helper owner  
**Dependencies:** T0

Affected areas:

- `frontend/src/features/ai-estimator-knowledge/knowledgePresentation.ts`, or one feature-local money-input helper module
- Focused unit tests in the same feature

Tasks:

1. Add `formatPaiseForRupeeInput` for canonical editable rupee text.
2. Add `parseRupeeInputToPaise` using digit/string arithmetic only.
3. Represent valid, incomplete typing, and invalid input distinctly so controlled inputs do not corrupt user text.
4. Enforce non-negative values, at most two fractional digits, no exponent notation, and safe-integer paise bounds.
5. Keep the existing INR display formatter as the shared output path.

Acceptance:

- `0` ↔ `0`, `1` paise ↔ `0.01`, `7_550` ↔ `75.50`, and `1_180_000` ↔ `11800.00` round-trip exactly.
- Unsafe, negative, exponent, non-numeric, and three-decimal inputs are rejected.
- No floating-point multiplication performs the conversion.

Verification:

- Focused helper tests with boundary and asymmetric values.
- Frontend typecheck for the helper contract.

### T2 — Rupee pricing editor and immutable price history

**Owner:** Frontend pricing-editor owner  
**Dependencies:** T1

Exclusive affected areas:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeSectionValidation.ts`
- Pricing-editor-focused tests; avoid unrelated workspace files

Tasks:

1. Preserve the current dirty hint-copy change in `KnowledgeSectionEditor.tsx`.
2. Replace the raw paise number control with an accessible rupee text/decimal control.
3. Maintain editable rupee text separately from the underlying paise payload value.
4. Convert to `inputAmountPaise` only at the feature request/state boundary.
5. Format resolved immutable Input, Base, Tax, and Total with `formatKnowledgeMoney`.
6. Prefill replacement version entry from the resolved paise value as exact rupee text.
7. Replace paise-oriented validation/help copy with rupee-oriented messages.
8. Preserve stable `priceEntryId`, tax version, effective window, status, quick-add, and response-only field stripping.

Acceptance:

- Entry `75.50` creates `inputAmountPaise: 7550`.
- Stored `14160` renders as `₹141.60`.
- Replacement reloads the exact value and retains lineage.
- Zero and `0.01` work.
- Invalid values block Save and focus/announce the error.

Verification:

- Pricing editor rendered tests.
- Save/reload/replacement payload assertions.
- Keyboard and accessible-error checks.

### T3 — Rupee server-preview input and output consistency

**Owner:** Frontend preview owner  
**Dependencies:** T1

Exclusive affected areas:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- Preview-focused tests; do not edit the pricing editor

Tasks:

1. Preserve the existing dirty workspace layout changes.
2. Change `Unit rate (paise)` to a rupee-labelled input with separate editable text.
3. Convert valid rupee text to exact `unitRatePaise` only in `previewRequest`.
4. Remove user-facing paise instructions while retaining the explanation that the server is authoritative.
5. Continue formatting every returned money component through `formatKnowledgeMoney`.
6. Preserve quantity, BPS, tax treatment, zero-value, loading, error, and disabled behaviors.

Acceptance:

- Preview entry `118.00` sends `unitRatePaise: 11800`.
- `0` remains a valid preview rate.
- Invalid rupee text disables preview and produces accessible guidance.
- Returned amounts remain INR-formatted with no raw paise label.

Verification:

- Preview request and rendering tests.
- Existing zero-value preview regression.
- Dirty-state and lifecycle smoke coverage.

### T4 — Integrated interaction, responsive, and regression coverage

**Owner:** Primary agent or one dedicated frontend test owner after T2/T3 stop  
**Dependencies:** T2, T3

Affected areas:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- Existing feature-local accessibility and presentation tests
- `ai-estimator-knowledge.css` only if a verified rendering defect requires a minimal merge with the existing dirty CSS

Tasks:

1. Reconcile pricing and preview test fixtures around rupee entry/paise payloads.
2. Assert no visible `paise` copy remains in pricing and preview screens.
3. Cover create, saved reference, replacement, server preview, API error, CAS conflict, and read-only Active states.
4. Run axe checks and keyboard/focus restoration checks.
5. Exercise desktop and narrow viewport cases without overwriting the existing CSS redesign.

Acceptance:

- All specification acceptance criteria have traceable tests.
- Existing dirty styling remains intact unless a reviewed minimal addition is necessary.
- Existing estimator tests remain unchanged and green.

## 4. Review and verification

### T5 — Financial integrity review

**Owner:** `integrity_reviewer`  
**Dependencies:** T4; all writers stopped

Review:

- Exact string conversion and safe-integer limits.
- No floating-point money conversion.
- Paise API/persistence/calculation invariants unchanged.
- Replacement price lineage and tax treatment preserved.
- Zero/minor-unit handling.
- Dirty-worktree reconciliation.
- No coupling to existing Estimator or Finance paths.

Confirmed findings return to the owning task before final verification.

### T6 — Stable-worktree verification and handoff

**Owner:** `verification_runner`  
**Dependencies:** T5 complete and fixes integrated

Commands:

1. `cd frontend && npm run typecheck`
2. `cd frontend && npm test -- src/features/ai-estimator-knowledge`
3. Relevant router/navigation and existing estimator regression tests
4. `cd frontend && npm test`
5. `cd frontend && npm run build`
6. `git diff --check`
7. `git status --short`
8. Frozen-path diff and forbidden cross-import audit

Backend source is expected to remain unchanged. If any backend financial contract changes appear, stop and reopen the approved specification rather than expanding scope.

Final handoff reports exact counts, warnings, unrun real-browser checks, generated ignored outputs, and external actions not performed.

## 5. Safe parallel execution

After T1 fixes the conversion contract:

- T2 and T3 may run in parallel because they own separate product files and separate focused tests.
- T4 begins only after both product writers stop to avoid conflicts in shared screen tests.
- T5 and T6 are sequential and read-only.

No two agents may edit `KnowledgeScreens.test.tsx`, `KnowledgeSectionEditor.tsx`, `KnowledgeItemWorkspacePage.tsx`, or the CSS file concurrently.

## 6. Acceptance-criteria traceability

| Specification criteria | Tasks |
|---|---|
| Rupee-labelled pricing and preview entry | T2, T3 |
| Exact rupee-to-paise conversion | T1–T3 |
| INR saved/history/preview display | T2–T4 |
| Zero, one-paise, unsafe, and precision boundaries | T1–T4 |
| Replacement lineage and tax preservation | T2, T5 |
| Dirty navigation, CAS, quick-add, history behavior | T2–T4 |
| Responsive and accessibility coverage | T4 |
| Backend paise invariant and frozen estimator | T0, T5, T6 |
| Full verification and hygiene | T6 |

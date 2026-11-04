# Compact estimate checklist and price controls: task plan

Date: 2026-11-04
Status: Specification and task plan approved; Mode A selected. All four tasks implemented and locally verified on 2026-11-04.

Approved specification: [Compact estimate checklist and price controls](../specs/2026-11-04-estimate-popup-price-density-design.md). The user approved the specification on 2026-11-04.

## Boundaries

Presentation only. Preserve all three checklist statements, confirmation/reset/focus/busy behavior, prices, calculations, validation and role permissions. Client prices remain read-only. Do not change shared Dialog behavior or unrelated views. No dependencies, backend/OCR startup, live-data mutations, migrations, commits, pushes or deployment.

## Dependency-ordered work

| Task | Ownership and affected areas | Completion criteria |
| --- | --- | --- |
| 1. Capture baseline | Primary: `git status --short`, relevant diffs and copies of already-dirty/untracked target files, saved under `/private/tmp/lisno-estimate-popup-price-density/`. Confirm current CSS overrides and rendered fixture availability. | Existing work is identified and preserved; no overlapping file ownership. AC5. |
| 2. Compact checklist | Popup owner: `frontend/src/features/leads/estimateSubmissionChecklist.css`; `EstimateSubmissionChecklist.tsx` only if local markup is necessary. Scope all overrides to this popup. | About 544px maximum desktop width, one visible title, 13px statement text, 16px checkboxes, reduced padding, 32px desktop actions and 44px mobile/touch targets. Keep scrollable statements and reachable actions. AC1–AC2, AC4. |
| 3. Compact price controls | Price owner: `frontend/src/styles/estimator-dashboard.css` and narrowly required Client price styling. Preserve existing dimension overrides. | About 354px desktop numeric group, 96px price column, 120px amount column, 28–30px desktop price/amount controls; align quantity controls. Keep mobile/touch sizing, readable values, state messages and Client read-only output. AC3–AC4. |
| 4. Integrate and verify | Primary after tasks 2 and 3: review only this task's diff against the captured baseline; run checks below and correct any regressions within the same ownership boundaries. | All acceptance criteria have evidence; record exact results, temporary artifact paths and remaining limits here. AC1–AC5. |

Task 1 precedes edits. Tasks 2 and 3 can run in parallel because their files do not overlap. In Mode A, assign the popup slice to one native subagent and keep shared price CSS/integration with the primary agent; neither may revert existing edits. In Mode B, execute both slices inline. Final verification follows all writers. Keep one parent task in progress at a time.

## Verification

- Run existing focused regressions from `frontend/`: `npm test -- src/features/leads/EstimateSubmissionChecklist.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/client/ClientQuotation.test.tsx`. Extend tests only if a behavior change or uncovered risk justifies it; do not add CSS-mirroring tests.
- Run `npm run typecheck` and `npm run build` in `frontend/`, then `git diff --check` and `git status --short` at repository root. There is no lint script.
- Use a synthetic frontend fixture with actual components and styles; do not launch the application backend. Inspect popup and staff/Client rows at 1440px, 768px, 390px, and a short desktop viewport. Check computed dimensions, horizontal overflow, readable large amounts/decimal rates, Pending/Unavailable/error states and 44px mobile/touch controls.
- Check accessible dialog name, full checkbox labels, label clicks, keyboard focus/trapping/return, disabled partial confirmation, reset on reopen and busy protection. Confirm Client prices have no editable input and an unrelated dialog keeps its original appearance.
- Stop only temporary QA processes created for this task. Do not change the user's manually managed backend. Record browser evidence separately from unit-test evidence and disclose any unrun checks.

## Results

- Baseline captured in `/private/tmp/lisno-estimate-popup-price-density/baseline/`, including dirty-path inventory and copies of four potential targets. Existing changes preserved; the checklist TSX is byte-identical to baseline.
- Product changes are limited to `frontend/src/features/leads/estimateSubmissionChecklist.css`, `frontend/src/styles/estimator-dashboard.css` and `frontend/src/features/client/clientQuotation.css`. No JSX, calculation, API, permission or dependency changes. Popup CSS was delegated; primary integrated price styling and final visual fixes.
- AC1: Rendered desktop popup is 544px wide and about 350px high, with one visible title, 16px boxes, 13px statements and 32px actions. Checklist text remains verbatim.
- AC2: Required confirmations, label/keyboard selection, disabled partial confirmation, reopen reset, focus containment/return and busy dismissal protection passed. An unrelated Dialog retains its 18px heading, toolbar context, eyebrow and 36px actions.
- AC3: Desktop numeric group is 354px wide; ordinary price fields are 96px wide and 28px high. Large Client prices wrap without losing digits. A rate edit from 250.75 to 375.50 produces the expected 751.00 amount for quantity two. Pending, invalid and unavailable states remain present; Client price fields are read-only.
- AC4: Four popup cases (1440×900, 768×900, 390×844 and 1440×360) and six staff/Client price cases (1440, 768 and 390px widths) passed. No horizontal page overflow, numeric output overflow or fields escaping their item row. Axe reported zero violations in the checked popup/estimation regions. Wide coarse-pointer checks passed for both roles, with 44px controls and no control-group overflow. The short-window inspection prompted a max-content row fix so statements scroll instead of overlapping. Touch group width is 396px to fit its minimum tracks.
- AC5: Focused command from the Verification section passed: **4 files, 66 tests**. `cd frontend && npm run typecheck` passed. `cd frontend && npm run build` passed, then was rerun successfully after final CSS fixes (including TypeScript compilation). `git diff --check` passed. No lint command exists or was run. Read-only verification found no confirmed defect.

### Evidence and limits

- Evidence directory: `/private/tmp/lisno-estimate-popup-price-density/`. It contains `focused-tests.log`, `typecheck.log`, `final-build.log`, `browser-final.log`, `final-source.diff`, baseline files, synthetic fixtures and screenshots. Build also generated ignored `frontend/dist/` output.
- Browser verification used actual components, production styles/fonts, the actual builder containers and synthetic data. It did not exercise live API persistence. Console connection errors during an intentional fixture-server restart were development WebSocket reconnects; no application runtime exception was observed in the final pass.
- Existing build warnings about chunks exceeding 500kB remain. Full frontend/backend/OCR suites and live backend checks were not run for this CSS-only change.
- Temporary browser session and fixture server were stopped. The application backend, launcher and OCR were never started or modified. No database write, migration, seed, commit, push or deployment was performed.

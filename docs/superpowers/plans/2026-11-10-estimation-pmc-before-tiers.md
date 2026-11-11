# Estimator PMC toggle before Tiers task plan

Date: 2026-11-10
Status: implementation and verification complete under Mode A; two unchanged baseline test failures remain.

Source of truth: [approved specification](../specs/2026-11-10-estimation-pmc-before-tiers-design.md).

## Scope and shared contract

Show one PMC toggle before Tiers in included estimator rows. Enable it for both internal classifications when existing pricing permissions and target-price availability allow. Hide the estimator's Type and Vendor/In-house selectors. Keep existing price ownership, compact fields and other screens intact.

- Extend `EstimateLineLayout` with an optional `pricingBeforeTier` presentation flag, default false. True renders the existing pricing slot before the tier slot in DOM order; all other callers retain the existing order.
- Extend `EstimatePricingModeControl` with an opt-in `variant: "pmc-only"`; the default remains the current full presentation. This variant renders just the existing PMC switch, including its disabled state and accessible unavailable-transition explanation. It must not render Vendor/In-house radios, a second toggle or a separate Pricing heading.
- The estimator owns state and permission decisions. Turning on sends Special classification and PMC mode together. Turning off restores the remembered non-PMC mode and classification, or Standard/Sub-Vendor for a loaded PMC line without remembered state. Record remembered state only on an accepted user transition, never during rendering; isolate it by line and estimate context.
- Reuse existing configured-tier and configured-price validation. A missing, zero or unusable target price disables that transition without changing the tier or selecting another rate. Keep saved components intact across an In-house/PMC round trip, subject to existing tier-change rules.
- Shared presentation controls do not calculate prices, infer permissions or write data. No backend, API schema, dependency or persisted-data migration is needed.

## Dependency-ordered tasks and ownership

1. **Capture and inspect the baseline.** Primary owner. Record initial dirty paths and per-target diffs before writers start. The row layout, builder, builder/workspace tests and estimator stylesheet already contain earlier user-requested edits; preserve those exactly outside this task. Confirm the current configured-price helper, capability checks and save serialization support the agreed transitions. Acceptance: requirements 2–6 and preservation of prior work.

2. **Add opt-in shared presentation.** Shared-component owner in Mode A; primary in Mode B. Exclusive files: `frontend/src/features/estimates/EstimateLineRow.tsx`, `EstimateLineRow.test.tsx`, `EstimatePricingModeControl.tsx`, and `EstimatePricingModeControl.test.tsx`. Implement the presentation contract above. Verify default callers retain current behavior, PMC-only renders one switch, readonly states cannot invoke callbacks, and DOM/keyboard order matches placement. Acceptance: requirements 1–2.

3. **Wire estimator transitions and availability.** Primary owner. Exclusive files: `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`, `ConfiguredEstimateBuilder.test.tsx`, and `ConfiguredEstimateBuilder.sellingPrice.test.tsx`. Opt into the new presentation, remove the old estimator pricing presentation, and adapt non-PMC memory to retain mode and classification. Check the target state before accepting a toggle; preserve existing capability/source restrictions. Reuse `updateConfiguredLinePricing` and the existing workspace callback so rates and save metadata update together. Adapt tests that previously selected Vendor/In-house to seed those existing states. Preserve pricing and persistence assertions. If required, primary may make a minimal PMC-layout-only adjustment in `frontend/src/styles/estimator-dashboard.css`, without changing existing quantity/price widths or field alignment. Acceptance: requirements 1–6.

4. **Verify workspace saving and restrictions.** Workspace-test owner in Mode A; primary in Mode B. Exclusive files: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx` and `LeadEstimateWorkspace.collaboration.test.tsx`. Cover Standard → PMC and return, saved PMC reload, saved Special/In-house restoration, target-price unavailability, and existing mode-change capability denial. Verify the save payload carries compatible classification, mode and configured rate; retain disabled-price, freshness and conflict assertions. Adapt removed-selector interactions without weakening the scenarios. Acceptance: requirements 2–6.

Tasks 2–4 may progress independently after task 1 and the contract above are understood. Each writer is informed that others share the worktree, owns only its assigned files and must preserve others' changes. Primary owns shared decisions, integration, documentation and any stylesheet adjustment. Do not expand scope if the existing save path exposes a different contract; report evidence to primary first.

5. **Integrate and review.** Primary checks the combined diff after writers finish. In Mode A, use a read-only `integrity_reviewer` to verify classification/mode consistency, remembered-state isolation, price eligibility, permission preservation and unchanged default shared callers. Resolve confirmed task-related findings before final verification. In Mode B, primary performs this review inline. Acceptance: requirements 2–6.

6. **Run final checks and rendered QA.** After integration and review, use `verification_runner` in Mode A or primary in Mode B for the focused tests/build below. Primary performs rendered checks at mobile, tablet and desktop widths using synthetic data, including a keyboard PMC round trip, tier/price update and readonly state. Verify a single toggle before Tiers, no Type or Vendor/In-house selector, compact Qty/Rate fields and no overflow. Inspect the final diff/status, record exact results, remove task-owned temporary artifacts and stop only task-owned servers. Acceptance: all requirements.

Keep one parent task in progress. No subagents or implementation start until task-plan approval and the new execution-mode selection.

## Verification commands and handoff

From `frontend/`, start with focused cases during implementation, then run once on the integrated result:

```sh
npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/estimates/EstimatePricingModeControl.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx --maxWorkers=1
npm run build
```

From the repository root:

```sh
git diff --check
git status --short
```

Trace results to the specification requirements. The preceding task independently reproduced two existing collaboration failures that expect editable rate inputs; keep them separate from any new failures and do not fix unrelated behavior. No lint script exists. Broader frontend, backend or OCR suites are unnecessary unless new evidence exposes a shared-contract issue.

Record actual test/build/browser results and any unrun checks here. No staging, commit, push, deployment, migration or customer-data mutation is authorized. The implementation begins only after task-plan approval and the execution-mode choice.

## Implementation and verification record

- Tasks 1–5 completed under Mode A. Initial status, diffs and ten target snapshots were captured in `/tmp/lisno-pmc-before-tiers-20261110/` before writers started. Shared presentation and workspace tests had separate owners; primary owned builder integration and its tests.
- Product changes are limited to `ConfiguredEstimateBuilder.tsx`, `EstimateLineRow.tsx` and `EstimatePricingModeControl.tsx`. No new stylesheet change was necessary. The estimator opts into one PMC switch before Tiers, automatic compatible classification/mode transitions, positive target-price validation and disabled readonly/restricted states. Other shared callers retain their default presentation.
- Existing context lifetime is preserved: the workspace review key includes actor, lead and saved version. An unsaved round trip restores prior non-PMC metadata; a changed saved version or reloaded PMC line uses the approved Standard/Sub-Vendor fallback. Component IDs remain on the line across an unsaved In-house/PMC round trip.
- Independent integrity review found no confirmed defect. It traced compatible save serialization and backend validation, configured-price ownership, capability/source/refresh restrictions, default caller compatibility and per-line/context memory isolation. It performed no product edits or live API writes.
- The integrated seven-file test command above completed with **206 passed, 2 failed, 208 total**, exit 1, in 27.98 seconds. The two failures are the already confirmed baseline collaboration cases: `preserves an incomplete manual rate when both the old rate and serialized edit are null` and `retains a partial rate typed while an earlier blank-rate save is in flight`. Both still expect editing an already-disabled rate field; those test blocks remain unchanged. No new failures occurred.
- Final `npm run build` passed (exit 0), including TypeScript compilation and Vite (9.70 seconds). Vite reported the existing warning for chunks over 500 kB. Final `git diff --check` and status checks passed; changes match this task and the recorded prior dirty work. The estimator stylesheet is byte-identical to its task-start snapshot.
- Rendered Chromium checks with the app's Poppins font passed at **320, 390, 768, 1280 and 1920px**. Each included row has exactly one PMC switch before Tiers in DOM order, with no Type or Vendor/In-house selector, overlap or horizontal page overflow. Wide rows retain Qty **96px**, Rate **112px** and right alignment. Mobile retains its existing wrapping.
- Browser keyboard interaction follows inclusion → PMC → Tiers. Synthetic Standard pricing changed from 101.25 to PMC 80 with Special classification; Premium selected PMC 120; switching off restored Standard/Sub-Vendor 150. A separate Special/In-house row restored its price of 130. Readonly switches and all selling-rate fields stayed disabled. Desktop/mobile screenshots were visually inspected. A fixture-only favicon 404 was resolved by adding an empty fixture icon; no application runtime error was observed.
- Task browser fixture/screenshots under `frontend/output/playwright/pmc-before-tiers-1110/` and task `.playwright-cli` snapshot/console log were removed. The task browser session and port-5179 Vite server were stopped.
- Task baseline snapshots and verification logs in `/tmp/lisno-pmc-before-tiers-20261110/` were removed after recording results. Build-generated ignored `frontend/dist/` and TypeScript caches are not part of the change.
- Full frontend/backend/OCR suites, live API integration, other browser engines and physical-device checks were not run for this bounded change. No lint script exists. No dependency, backend/API, migration, commit, push, deployment or customer-data mutation occurred. All prior dirty work was preserved.

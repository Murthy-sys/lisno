# Estimation Main Line Standard / Custom: implementation plan

Date: 2026-11-25

Status: Implemented in Mode A. Final focused verification, typechecks, builds and desktop/mobile browser checks passed. Broader checks have documented pre-existing failures below.

Approved source: [Specification](../specs/2026-11-25-estimation-main-line-custom-standard-design.md).

## Outcome and boundaries

Add an accessible **Item type: Standard / Custom** radio group to each configured Main Line in the estimation screen. Save the choice independently for each line/room. Default unmarked working lines to Standard. The choice is metadata only and must not affect pricing, Configuration design rules, recommendations, requirements, or approval policy.

Use optional `customizationType: "standard" | "custom"` in the existing line contract. Do not reuse `classification`, `pricingMode`, or `designRules.itemNature`. Keep existing save permissions, version checks, source freshness, and immutable history. Temporary items and legacy catalogue rows remain outside scope.

The approved specification's acceptance criteria are referenced below as AC1–AC5.

## Implementation evidence

- `ConfiguredEstimateBuilder.tsx` renders the relevant rows. `EstimateLineRow.tsx` already has a `type` slot and native radio patterns; existing styling is in `styles/estimator-dashboard.css`.
- `configuredEstimate.ts` rebuilds/restores draft rows. Its `updateConfiguredLinePricing` resets saved PMC pricing metadata, so a label-only update needs a separate path.
- `LeadEstimateWorkspace.tsx` explicitly serializes fields and reconciles saves with edits made during the request. `estimateDraftFingerprint.ts` explicitly lists draft fields.
- `routes/estimates.ts` validates configured input strictly, matches saved lines by room/Main Line IDs, and explicitly constructs persisted rows inside a transaction. Its preserved-snapshot branch must also retain the label consistently without relaxing its guards.
- `models/Estimate.ts`, `domain/estimate-client-review.ts`, `estimate-revisions.service.ts`, and `estimate-client-presentation.ts` define persisted or snapshot shapes. Optional metadata must survive the applicable serialization paths.
- `estimate-price-ownership.ts` and `estimate-collaboration-policy.service.ts` distinguish price and physical/quotation changes. The label must stay outside those commercial/design comparisons.
- The direct-Mongoose estimate save path is established. Do not introduce a repository refactor; inspect existing memory/Mongo projections only for explicit mappings that could discard the new field.

## Dependency-ordered tasks and ownership

### T1. Capture baseline and settle shared interface

Owner: primary agent. Dependencies: approved task plan and execution-mode selection. Acceptance: AC2–AC4.

1. Capture `git status --short` and target diffs before writers start. At planning time there are 15 pre-existing dirty paths, including the current specification, from the preceding Super Admin work. None of the intended estimation implementation targets is dirty. Recheck this at execution time and preserve all unrelated work.
2. Confirm the field flows from editable draft to save request, stored line, response, and new revision/snapshot. Identify explicit copies, including tier/quotation update paths that reconstruct lines; change only copies that would otherwise drop the field.
3. Establish the optional frontend input/read type in `frontend/src/features/leads/leadsApi.ts`. Share this interface with all writers before parallel work.
4. Fix compatibility semantics: input omission preserves the existing stored value; an unmarked line behaves as Standard. Explicit Custom and explicit Standard both round-trip. Normalize absent/Standard consistently in draft dirty checks.
5. Keep persisted metadata changes separate from pricing/design fingerprints. No new endpoint, permission, price calculation, or migration.

Deliverable: baseline and agreed contract recorded here, with precise writer boundaries. Primary owns `leadsApi.ts`, this plan, and any cross-slice contract decision.

### T2. Backend persistence and snapshot compatibility

Owner in Mode A: `backend_implementer`. Dependencies: T1. Acceptance: AC2–AC4.

Owned paths: affected estimate backend source files and their focused tests, principally:

- `backend/src/routes/estimates.ts`
- `backend/src/models/Estimate.ts`
- `backend/src/domain/estimate-client-review.ts`
- `backend/src/services/estimate-revisions.service.ts`
- `backend/src/services/estimate-client-presentation.ts`
- `backend/src/openapi.ts`
- Relevant publication, tier, quotation, repository mappings only where inspection proves a field-copy change is required.

Work:

1. Add optional enum validation and model storage. Preserve prior metadata by stable saved-line identity when older clients omit it. Keep malformed values rejected and existing identity/CAS/permission checks intact.
2. Include the field in normal and applicable preserved-line construction without changing the conditions allowing either path.
3. Preserve metadata in new snapshots and staff revision reads; accept absence in older snapshots. Never update previously issued snapshots/files.
4. Document the optional API field. Keep memory and Mongo representations compatible wherever their explicit projections are involved.
5. Verify metadata does not affect price ownership, quotation content/physical scope comparisons, generated requirements, or financial outputs. Change a comparison only if necessary to preserve these approved invariants.
6. Add focused save/read tests for explicit choices, omitted fields, invalid values, independent rooms, excluded saved rows, and unchanged amounts. Include Sub-vendor, PMC, and In-house with unequal values. Exercise stale-version and unauthorized saves and frozen revision reads using existing fixtures.

No frontend writes. Return any required shared-contract change to the primary agent.

### T3. Frontend draft lifecycle

Owner in Mode A: `frontend_implementer` for state. Dependencies: T1. Acceptance: AC2–AC4.

Owned files:

- `frontend/src/features/leads/configuredEstimate.ts` and its relevant unit tests.
- `frontend/src/features/leads/estimateDraftFingerprint.ts` and its test.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` and its relevant workspace tests.

Work:

1. Add the independent draft value. Default new/unmarked lines to Standard and restore saved choices through catalogue rebuilds and quantity/tier edits.
2. Route label-only changes through a metadata-only update that preserves PMC snapshots and component calculations. Preserve existing commercial update behavior for other fields.
3. Include the value in draft serialization and dirty detection. Continue saving included or previously persisted rows under existing rules.
4. Reconcile a save response without overwriting a newer Standard/Custom choice made while the request was pending. Do not treat customization as a pricing change.
5. Keep exclusion/reselection, room navigation, source refresh, recommendation triggers, mutation failures, and cache updates consistent with current behavior.
6. Test Standard → Custom → Standard, equal Main Line IDs in different rooms, two unequal rows, refresh/save/reload retention, failed/conflicting saves, and in-flight edits. Assert unchanged finance/design inputs and recommendation selection.

No builder/layout/style or backend writes. Any new prop/interface needed by T4 is agreed through the primary agent before use.

### T4. Accessible row controls and historical display

Owner in Mode A: separate `frontend_implementer` for presentation. Dependencies: T1; integration depends on T3. Acceptance: AC1, AC4, AC5.

Owned files:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its component tests.
- `frontend/src/features/estimates/EstimateLineRow.tsx` and its test, only if a reusable radio control is appropriate.
- `frontend/src/styles/estimator-dashboard.css`, only scoped rules needed for wrapping/focus/touch targets.
- `frontend/src/features/leads/EstimateRevisionView.tsx` and its test, only as needed to retain the choice in staff historical estimation display.

Work:

1. Use the existing row `type` slot for a compact native fieldset labelled Item type, with Standard and Custom radios. Use stable row/room identity for unique groups and accessible names; do not join state by names.
2. Show on included and excluded configured Main Lines. Disable excluded rows and all rows locked by existing permission/submission/source/history state. Radio selection must never implicitly include a row.
3. Keep labels editable under normal estimate-edit permission without requiring permission to change pricing mode.
4. Preserve temporary/legacy layouts. Maintain existing read-only historical behavior without adding PDF/email or client presentation changes.
5. Add rendered checks for independent groups, selection callbacks, disabled states, keyboard operation, and accessible names. Check wrapping at desktop and mobile widths with long Main Line/room names.

No draft/workspace/API/backend writes.

### T5. Integrate and review

Owner: primary agent; in Mode A use `integrity_reviewer` after writers finish. Dependencies: T2–T4. Acceptance: AC1–AC4.

1. Inspect the integrated diff and resolve contract mismatches. Check all line rebuild/copy paths and save-response reconciliation.
2. Review label-only saves for price snapshot loss, false commercial/design changes, identity mix-ups, stale writes, omitted-field regression, and immutable-history mutation.
3. Review frontend permissions and source locks against backend behavior. Confirm no dependency/lockfile or unrelated Super Admin changes were introduced by this task.
4. Resolve findings before final verification; hand off any fixes to the owning writer or implement sequentially once that owner is idle.

### T6. Verify the integrated result and hand off

Owner: primary agent; in Mode A use `verification_runner` after T5 fixes finish. Dependencies: T5. Acceptance: AC1–AC5.

Run the checks below once on the integrated worktree. Re-run affected checks only after a relevant fix or unresolved failure. Record exact results and any limitation here. Clean up task-owned QA processes and ignored artifacts. No commit, push, deployment, seed, migration, customer communication, or production mutation.

## Parallel execution rules

- No subagents or implementation before the execution-choice gate. Mode A uses native agents with the boundaries above; Mode B performs the same work inline.
- T2, T3, and T4 can run concurrently after T1 settles the interface. They have separate file ownership. The primary agent alone changes the shared frontend API contract.
- Give each writer the approved specification, relevant ACs, baseline, and the instruction that others share the worktree: preserve others' edits and never revert them.
- Review and final verification follow completed writers sequentially. Keep one parent implementation task in progress and record child status within it.

## Verification matrix

| Coverage | Evidence required | AC |
| --- | --- | --- |
| Radio behavior | Included/excluded/read-only Main Lines; independent room groups; default Standard; native keyboard and accessible labels | 1, 4, 5 |
| Saved state | Choice survives navigation, refresh, tier/quantity changes, persisted deselection/reselection, reload, and edits during a pending save | 2, 4 |
| Finance isolation | Label-only changes preserve all existing price inputs, amounts, GST, round off, PMC split, margins and In-house component results | 3 |
| Workflow isolation | Same design scope, quotation commercial revision, requirements and recommendation outputs; existing approval and source locks | 3, 4 |
| API/history | Enum validation, omitted stored choice retention, older snapshots, stale CAS, unauthorized identity, immutable historical amounts | 2, 4 |
| Layout | Rendered desktop/mobile checks, long labels, no overflow, visible focus, disabled/read-only states | 1, 5 |

Focused frontend checks from `frontend/`:

```sh
npm test -- src/features/leads/configuredEstimate.test.ts src/features/leads/estimateDraftFingerprint.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
npm test -- src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/EstimateRevisionView.test.tsx src/features/estimates/EstimateLineRow.test.tsx
npm run typecheck
npm run build
```

Run any additional focused files added for this feature, plus existing component-pricing/PMC presentation regressions relevant to modified draft helpers. Prefer tests that exercise behavior over assertions mirroring implementation.

Focused backend checks from `backend/`:

```sh
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts tests/estimate-collaboration.replica-set.test.ts
npm test -- tests/estimate-price-ownership.test.ts tests/estimate-component-pricing-contract.test.ts tests/estimate-pmc-payment-split.test.ts tests/estimate-client-presentation.test.ts tests/estimate-publication.test.ts
npm run typecheck
npm run build
```

The save path is transactional, so replica-set coverage is required. Use the existing isolated `MongoMemoryReplSet` test helper, never an application database. Include any additional changed snapshot/tier/quotation tests if copy-path inspection requires those edits. Do not weaken transaction behavior if the local test environment is unavailable; report the precise limitation.

Use the existing browser QA tooling for a synthetic-data estimation fixture at approximately 1440 px and 390 px. Verify keyboard selection, save/reload state, disabled controls, wrapping, and console errors. Keep screenshots or other temporary outputs ignored and report their paths if retained.

Repository checks: `git diff --check`, `git status --short`, and a final scope review. There is no lint script; do not claim lint ran. Broaden tests only for a changed shared path or an unresolved regression risk.

## Compatibility and rollout notes

This is an additive optional field and requires no backfill. Backend acceptance must precede a separately deployed frontend that sends it; this plan authorizes no deployment. Older clients omit the value without erasing a saved choice. Old immutable artifacts remain unchanged. Any later rollback must preserve stored metadata and pair compatible frontend/backend versions.

## Execution record

- Specification: approved.
- Task plan: approved.
- Execution mode: A, parallel sub-agents.
- T1: baseline captured in `/private/tmp/lisno-custom-standard-20261125/initial-status.txt` and `initial.diff`; all estimation targets initially clean. The existing 16 dirty paths (including this plan) are preserved. Frontend contract established as optional `EstimateCustomizationType` / `customizationType`.
- T2–T4: implementation finished. Primary also aligned `frontend/src/api/types.ts` for the staff revision snapshot. Backend included the immutable `EstimateClientReviewRound` line schema; no repository copy changes were needed.
- T5: integrity review complete. One finding was fixed: the Room applicability review branch now shows the same disabled radios, retaining the saved choice. Reviewer confirmed the fix and found no remaining defect.
- T6: final integrated verification finished. All 352 selected tests passed; frontend/backend typechecks and builds passed; repository whitespace check passed. No unresolved review finding.

### Evidence collected during implementation

- Backend save/read, immutable snapshot/revision/model suites: 235 passing tests; ownership/presentation: 56 passing tests. The additional immutable-field assertions also passed in the 80-test model suite. Backend typecheck passed.
- Frontend builder/revision/tier-info: 112 passing tests; selling-price keyboard flow: 6 passing tests. After the room-mismatch fix, the 90-test builder suite passed again. Draft/fingerprint units: 55 passing tests; two save/reload/in-flight workspace scenarios passed. Frontend typecheck passed.
- Broader frontend state checks: 115 passed, 22 failed. An isolated HEAD comparison reproduced all 22 failures; one previously failing pending-save fixture now passes. Exact comparison and failure names: `/private/tmp/lisno-custom-standard-20261125/state-baseline-comparison.txt`.
- Broader backend checks reproduced two pre-existing failures on isolated HEAD: `estimate-collaboration.replica-set.test.ts:302` expects an already-prohibited legacy rate edit to succeed; `estimate-component-pricing-contract.test.ts:88` expects a before-tax PDF amount despite the existing tax-inclusive presentation. Those unrelated behaviors were not changed.
- Browser checks at 1440×1000 and 390×1000 passed native keyboard switching, disabled excluded rows, independent rooms, successful synthetic save, unchanged totals, catalogue refresh and editor remount retention. Both widths: no horizontal overflow, page/runtime errors, unexpected API requests, or axe violations. Screenshots were visually inspected. Browser report: `/private/tmp/lisno-custom-standard-20261125/browser-report.json`; final screenshots: `output/playwright/estimator-1440.png` and `estimator-390.png` beneath that temporary directory. Persistence against Mongo is covered separately by replica-set tests; browser transport uses synthetic in-memory data.
- Original eight modified tracked paths outside this task exactly match the initial diff; prior untracked admin work is preserved.
- No dependencies, migrations, commits, pushes, deployments, production data changes or external communications.

### Final integrated commands and results

From `frontend/`:

```sh
npm test -- src/features/leads/configuredEstimate.test.ts src/features/leads/estimateDraftFingerprint.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/EstimateRevisionView.test.tsx
# 5 files, 164 tests passed.
npm test -- src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx -t 'saves independent Main Line labels|preserves newer mode choices'
# 2 files, 2 tests passed; 80 nonmatching tests skipped.
npm run typecheck
npm run build
# Both exit 0. Existing Vite >500 kB chunk warning; main chunk 3,491.46 kB.
```

From `backend/`:

```sh
npm test -- tests/estimate-price-ownership.test.ts tests/estimate-client-presentation.test.ts tests/estimate-client-review-models.test.ts tests/estimate-publication.test.ts tests/estimate-pmc-payment-split.test.ts
# 5 files, 182 tests passed.
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts -t 'customization|preserves configured frozen dimensions'
# 2 files, 4 tests passed; 151 nonmatching tests skipped.
npm run typecheck
npm run build
# Both exit 0.
```

The replica-set command's initial sandbox attempt could not bind a local port (EPERM); its approved unsandboxed local retry passed. No application database was used.

From repository root: `git diff --check` passed; `git status --short` contains the intended task paths and preserved prior changes. No lint command exists. Full repository suites and OCR were not run; relevant broader frontend/backend suites were run during implementation, with the 24 baseline failures described above. Do not interpret the focused pass as an entirely green repository suite.

### Submission validation follow-up, 2026-11-25

- Report: estimate submission rejected `customizationType` as unrecognized. Submit first saves the draft through the existing PUT route. Current source and built output already accept this metadata inside configured Main Lines; the frontend sends it there correctly. An independent read-only probe of the actual validation middleware accepted both Standard and Custom.
- Runtime evidence: the local backend had been running since November 24, before this feature. Its live `/openapi.json` lacked `customizationType`, while current source and built schemas included it. No product-code correction was needed.
- Resolution: gracefully restarted the existing local development supervisor with the same `npm run dev` command, including its rules and OCR companions. No seed, reset, migration, deployment, or customer submission was performed. Existing dirty Procurement work was preserved.
- Runtime verification: the restarted backend exposes `customizationType` in both `ConfiguredEstimateLineInput` and `ClientEstimateSnapshot`; `/api/v1/health` returned HTTP 200. The frontend and rules service remained reachable, and startup markers confirmed rules readiness and OCR startup without a startup failure.
- Regression verification: re-ran `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts -t 'customization|preserves configured frozen dimensions'` from `backend/`: 2 files, 4 tests passed, 151 nonmatching tests skipped. Tests used isolated MongoMemoryReplSet, not application data. No build/typecheck/browser rerun was needed because no product source changed. The user's own estimate was not submitted during verification.
- Local runtime evidence and private startup log: `/private/tmp/lisno-customization-runtime-20261125/`. The replacement local development service is intentionally left running for the user.

Final logs are `/private/tmp/lisno-custom-standard-20261125/verify-*.log`. The task-owned Vite server and browsers were stopped; isolated baseline archives and intermediate screenshots were removed. Only final QA evidence and logs remain in that temporary directory. Build outputs and TypeScript caches are ignored, not staged or committed.

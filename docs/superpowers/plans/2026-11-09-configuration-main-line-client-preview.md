# Configuration Main Line Client view: task plan

Date: 2026-11-09
Status: Implemented; scoped verification passed; broader frontend validation has unrelated blockers
Specification: [Configuration Main Line Client view](../specs/2026-11-09-configuration-main-line-client-preview-design.md)
Specification approval: User replied “Approved” on 2026-11-09.

## Delivery boundary

Implement the approved current-Main-Line preview in Configuration. Use the existing catalogue read API, shared client estimator presentation, and contextual Drawer. Desktop width is 80vw; narrow layouts are full width. Keep every preview interaction local and all existing editor changes intact. No backend, permission, calculation, schema, dependency or persistence changes.

## Ownership and parallel work

- Primary agent owns the workspace integration, cross-component interface, existing shared files, plan/spec records and final reconciliation.
- In Mode A, one frontend implementer owns only the new preview component, adapter, scoped stylesheet and their focused tests. The primary agent can integrate the agreed component interface and write workspace integration coverage in parallel.
- No worker edits existing shared client/estimator components or global styles without returning that dependency to the primary agent. Prefer composition and feature-scoped CSS.
- Integrity review follows completion of writers. Verification follows resolution of review findings. Browser verification and independent test/build commands may then run concurrently without source edits.
- In Mode B, the primary agent performs the same tasks sequentially without implementation subagents.
- Every writer must be told that others share the worktree, to preserve their changes and stay within the assigned paths.

## Dependency-ordered tasks

### 1. Capture baseline and freeze the component interface

Owner: Primary agent. Dependencies: Task-plan approval and execution-mode choice.

- Capture the current dirty-path set and relevant diffs before any product edits. Preserve prior estimator/client work.
- Recheck the current workspace action area, all dirty-state flags, catalogue response types, client row contracts and Drawer behavior.
- Use `KnowledgeMainLineClientPreview` with the integration inputs `open`, `mainLineId`, `mainLineName`, `hasUnsavedChanges`, `onClose` and `returnFocusRef`. Add a saved revision identifier only if required to keep the catalogue display consistent with the current workspace.
- Keep source resolution and local state inside the preview feature. Use shared row primitives if the production client component would require inventing a saved quotation, approval or financial record.
- Confirm the header button uses the existing Configuration and catalogue-read capabilities without changing authorization. This is an internal preview, not Client impersonation.

Acceptance: AC1, AC3, AC4, AC6. Evidence: Baseline diff record and agreed props/ownership before parallel writers start.

### 2. Build the isolated preview and data states

Owner in Mode A: Frontend implementer. Depends on Task 1. Can run alongside Task 3.

Owned paths, expected new files:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMainLineClientPreview.ts` if a separate adapter is warranted
- `frontend/src/features/ai-estimator-knowledge/knowledge-main-line-client-preview.css`
- Corresponding new `KnowledgeMainLineClientPreview.test.tsx` and adapter test if needed

Work:

- Compose the existing right contextual Drawer with feature-scoped 80vw desktop width and full-width layout below a defined narrow-screen breakpoint. Preserve existing focus/close behavior.
- Read `getEstimationCatalogue({ includeReadyNonActive: true })` only while open. Give the preview query a distinct key containing Main Line identity under the catalogue query-key namespace so existing catalogue invalidation reaches it. Refetch on each opening; display loading/error during an unconfirmed refresh rather than presenting cached values as current.
- Resolve the exact stable Main Line ID across normal and temporary catalogue placements. Use its returned basket/sub-basket context and saved current revision. Do not fall back to another item, name match or historical revision.
- Reuse the actual client row or shared estimator row primitives and compact styles. Any adapter carries only the source data and explicitly local preview context. Keep a missing amount pending/unsaved; do not calculate or fabricate a quotation total.
- Show available tiers, sample quantity, current selling-rate presentation and relevant pricing/dimension/In-house controls according to existing row behavior. Type/mode sample context, where needed, must remain explicitly local and never be represented as a real project's classification or capability.
- Reset local choices on close and identity change. Guard against old asynchronous responses displaying under a new Main Line.
- Implement hidden-client, ineligible/archived/absent, missing-price, required-dimension, loading and error/retry states. Preserve client-facing omissions of costs, margins and removed tier/configured-price notes.
- Add focused tests for source selection, hidden/missing data, failed refresh, local interaction, reset, and asymmetric line identities. Verify no mutation API is imported/called.

Acceptance: AC2–AC7.

### 3. Add the Main Line header entry point

Owner: Primary agent. Depends on Task 1. Can run alongside Task 2 after the interface is agreed.

Owned paths:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- New `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx`
- Existing workspace test fixtures only if necessary; do not rewrite unrelated suites

Work:

- Add the compact **Client view** text button to the existing header actions with a stable ref for return focus.
- Mount the preview for the current Main Line. Opening and closing must bypass navigation/discard handling because neither action leaves the editor.
- Pass an aggregate unsaved flag covering Overview/recommendations, mode, Design and Quality editors, including any unconfirmed save state where the preview cannot represent local input.
- Keep the existing editor mounted and preserve local form state. Clear/close the preview when the route/Main Line changes.
- Add integration tests proving opening, closing, saved-data refresh on reopening, unsaved notice, retained edits, permission visibility and no update/save/submit request.

Acceptance: AC1, AC4, AC6, AC7.

### 4. Integrate and review

Owner: Primary agent, followed by `integrity_reviewer` in Mode A. Depends on Tasks 2 and 3.

- Inspect the combined diff against the captured baseline, reconcile component props and ensure styles stay confined to the preview.
- Review stable-ID and latest-saved source selection, stale/error behavior, read permissions, local-only state, client visibility and financial display for misleading or leaked values.
- Confirm source requests contain no real Client/project impersonation and the panel exposes no mutation command.
- Resolve confirmed findings before final verification. Keep one parent implementation task in progress.

Acceptance: AC1–AC7; no outstanding correctness findings.

### 5. Verify the integrated result

Owner: `verification_runner` in Mode A; primary agent in Mode B. Depends on Task 4 and completion of all writers.

Focused command from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/estimates/EstimateLineRow.test.tsx src/features/estimates/EstimatePricingModeControl.test.tsx src/components/ui/Drawer.test.tsx
```

Run any added adapter tests with the focused command. Add `ClientQuotation.pricingMode.test.tsx` if reusing or touching the full client row. If a shared production component is changed, include its existing affected suites as well.

Then run from `frontend/`:

```sh
npm run typecheck
npm run build
```

Rendered verification with synthetic data and actual components/styles:

- Desktop at 1440px and 1920px: measure the panel at 80% viewport width; verify basket context and compact estimator styling, scroll and unclipped controls.
- Tablet at 768px and mobile at 390px: verify the full-width panel, usable touch controls, and no page-level horizontal overflow.
- Exercise representative Standard/Special pricing display, In-house components, required dimensions, hidden/ineligible data, missing price, delayed loading, failed refresh/retry and reopening after a saved-data update.
- Verify open/close, Tab focus containment, Escape/backdrop dismissal and focus restoration; confirm editor values survive. Check accessible names and fresh console/network errors.
- Use synthetic fixtures or existing authorized local services; do not start backend/OCR services solely for this frontend preview. Do not mutate customer data. Stop any owned temporary frontend/browser process and remove owned temporary artifacts after inspection.

Repository checks:

```sh
git diff --check
git status --short
```

Acceptance: Evidence for every AC; report actual test counts and command exit results. Do not claim lint, backend tests or unrun full suites passed.

### 6. Handoff

Owner: Primary agent. Depends on Task 5.

- Record implemented behavior, validation results and any remaining limitations in these durable documents.
- Report the button location, panel behavior, principal affected files and exact verification results concisely.
- Report any ignored build/test outputs retained and any unrun checks. No commit, push, deployment, migration, dependency install or external action is part of this plan.

## Gate state

- Specification: approved.
- Task plan: approved.
- Execution mode: A, selected by user.
- Implementation: implemented and reviewed. Preview-specific verification passed; broader checks have the limitations recorded below.


## Implementation and verification record

### Delivered behavior and ownership

- Added Client view to the Main Line header. The panel uses the existing Drawer and estimator row primitives, 80vw above 900px and full width at narrower sizes.
- Preview reads the saved current catalogue by stable Main Line ID, rejects legacy active-only catalogue responses, and starts an isolated query session on each opening. Local choices and older pending responses cannot leak into a later opening.
- Includes explicit Preview type selection for inspecting Standard/Special client presentation. Quantity, tiers, PMC/In-house and component choices remain local. No quotation record, saved amount or cost calculation is fabricated.
- Underlying editor values remain mounted; the saved-only notice covers dirty or unconfirmed editor state. Existing read capabilities gate the button.
- Principal files: `KnowledgeItemWorkspacePage.tsx`, new `KnowledgeMainLineClientPreview.tsx`, scoped `knowledge-main-line-client-preview.css`, and the two new preview test files. One existing header-action assertion in `KnowledgeScreens.test.tsx` was updated to include Client view. All other changes in that existing test file belong to concurrent work and were preserved.
- No new dependencies, backend/API/schema changes, migrations, commits, pushes or deployment. Existing services were preserved.

### Passing checks

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx src/features/estimates/EstimateLineRow.test.tsx src/features/estimates/EstimatePricingModeControl.test.tsx src/components/ui/Drawer.test.tsx
```

Exit 0: 5 suites, 50 tests passed. Separately, the updated KnowledgeScreens header-action test passed (1 passed, 120 skipped). Both new preview suites account for 18 of the 50 tests. Integrity review found no confirmed defects.

Browser checks: 54 assertions passed using actual components/styles and synthetic catalogue data. Measured widths were 1152/1440 and 1536/1920 on desktop, and 768/768 and 390/390 on tablet/mobile. Checked no horizontal overflow, PMC restoration, In-house selection, dimensions, missing/hidden/unavailable states, error/retry, refresh after reopening, keyboard containment, Escape/backdrop dismissal, focus return and preserved unsaved input. Accessibility audit reported zero violations; nine intercepted catalogue requests were GETs and no mutation or fresh page error occurred. Desktop/mobile screenshots were visually inspected.

`git diff --check` exited 0. Final status inspected; unrelated dirty files were preserved. No lint command exists.

### Broader validation limits

- The two existing Configuration suites (`KnowledgeItemWorkspaceLayout.test.tsx`, `KnowledgeScreens.test.tsx`) finish with 118 passed and 20 failed tests. The same 20 failures reproduce with the captured original workspace page through an in-memory baseline transform. They include stale source/CSS expectations and older editor fixture/label expectations. The one failure introduced by the new header action was corrected and verified separately.
- `npm run typecheck` and `npm run build` both exited 2 because of three errors in concurrently changed `src/features/client/clientQuotationDraft.ts` (lines 95, 101 and 133): `QuotationTierGroupOperation` lacks `QuotationGroup.includedCount`. No diagnostic points to the preview files. These unrelated changes were not rewritten.
- Other work changed the workspace Mode label, group-tier helpers, API helpers and quotation files during verification. The preview component, its CSS/tests, the integration test and shared row/mode primitives stayed stable. This report does not claim a globally frozen or fully passing repository.
- Full frontend, backend, OCR and replica-set suites were not run; no relevant backend contract changed.

### Temporary artifacts

The owned browser and fixture server on port 4192 were stopped. Owned screenshots and fixtures under `output/playwright/lisno-client-preview` and `/private/tmp/lisno-client-preview-browser` were removed after inspection; existing logs/services were preserved. Vitest/TypeScript may refresh ignored caches under `frontend/node_modules/.vite` and `.tmp`. No production build artifact was generated by the failed build command.

The owned baseline copies and three temporary verification JSON reports under `/private/tmp/lisno-client-preview-*` were removed after the results were recorded here.

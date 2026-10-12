# Procurement basket panels: implementation plan

Date: 2026-10-12
Status: Approved and implemented in Mode A. Local verification completed 2026-10-13.

Approved specification: [Procurement basket panels: match Add Vendor presentation](../specs/2026-10-12-procurement-basket-vendor-panel-ux-design.md).

## Scope and invariants

Match Add Vendor's existing illustration and header treatment in Procurement's Main Basket and Sub-Basket panels, including initial forms and saved workspaces. Keep the existing 70vw desktop width and full-width behavior below 1200px. Preserve all basket fields, labels, values, validation, payloads and configuration actions.

Hide All my requests and normal Refresh baskets only inside Add Vendor. Preserve error-only Retry baskets, automatic catalog updates, external My Requests navigation, existing-vendor utilities, submission behavior and retained vendor drafts. Configuration, Super Admin, other drawers and the shared modal redesign remain unchanged. No dependencies, database operations or deployment.

## Dependency-ordered tasks

### 1. Capture the implementation baseline

Owner: primary agent. Depends on task-plan approval and execution-mode selection.

- Recheck `git status --short` and inspect any existing diff on intended targets before editing. At planning time the only dirty path was the new specification.
- Record the rendered field/control inventory for the two initial forms and two saved workspaces, plus Add Vendor and existing-vendor details.
- Capture Add Vendor's current desktop/mobile header as the visual reference. Use isolated fixtures where needed; do not seed or mutate local databases.

Acceptance: baseline distinguishes task changes from unrelated work and establishes the unchanged field and workflow contracts.

### 2. Match basket panel presentation

Owner in Mode A: frontend implementation agent for basket styling. In Mode B: primary agent. Depends on task 1; can run alongside task 3.

Owned paths:

- `frontend/src/features/vendor-basket-proposals/procurement-main-basket.css`
- `frontend/src/features/vendor-basket-proposals/CreateProposalPanel.tsx`
- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.tsx`

Work:

- Reuse `vendor-drawer-header.webp` and Add Vendor's established header dimensions, opacity, text clearance, divider and close-control styling.
- Reconcile the existing Procurement CSS rules that hide header artwork. Prefer scoped styling; add wrapper presentation hooks only if necessary.
- Apply compact spacing to both creation forms and saved workspaces while retaining all controls, saved summaries, tabs and hierarchy.
- Hide artwork below 768px as Add Vendor does. Retain existing basket width breakpoints and ensure long copy cannot overlap artwork or controls.
- Do not change shared/global drawer defaults or Super Admin styling. If sharing rules requires another file, coordinate ownership with the primary agent before editing it.

Acceptance: specification requirements 1–4 and 8; all four basket states use the vendor header treatment without field or behavior changes.

### 3. Remove Add Vendor utilities with scoped behavior

Owner in Mode A: frontend implementation agent for vendor controls and their regression tests. In Mode B: primary agent. Depends on task 1; can run alongside task 2.

Owned paths:

- `frontend/src/features/procurement/VendorBasketFields.tsx`
- `frontend/src/features/procurement/ProcurementVendorEditor.tsx`
- Relevant procurement tests, principally `VendorDirectory.test.tsx` and `ProcurementBasketModeGroups.test.tsx`

Work:

- Add a narrow presentation option to the shared basket fields, with the default preserving existing consumers. Set it from the vendor editor only for Add Vendor, including resumed new-vendor drafts.
- Hide normal Refresh baskets and All my requests in that context. Keep Retry baskets visible and operable during catalog errors.
- Preserve query refresh/invalidation, creation buttons, callbacks, request routes and existing-vendor controls.
- Update tests that previously opened requests through the removed shortcut. Preserve their draft-retention and authorization regression coverage through a supported submission flow or retained-draft fixture.
- Verify Add Vendor absence, existing-vendor presence, catalog retry and external My Requests access. Avoid implementation-mirroring CSS tests.

Acceptance: specification requirements 5–7; utility visibility is correct without losing error recovery, requests access or retained drafts.

### 4. Integrate and review the complete diff

Owner: primary agent; bounded independent integrity review in Mode A after writers finish. Depends on tasks 2 and 3.

- Compare the final field/control inventory and event handlers against the baseline.
- Check Procurement-only CSS scope, responsive sizing and the shared component's default behavior.
- Confirm Refresh saved configuration remains available in basket workspaces and existing-vendor details retain their utilities.
- Confirm no API, database, permission, Configuration or Super Admin behavior changed.

Acceptance: all specification invariants hold together. Resolve review findings before final verification.

### 5. Verify the integrated result

Owner in Mode A: verification agent after writers finish, with primary-agent visual review. In Mode B: primary agent. Depends on task 4.

Run from `frontend/`:

```sh
npm test -- src/features/vendor-basket-proposals/CreateProposalPanel.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx src/features/procurement/VendorDirectory.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/ProcurementVendorDraftProvider.test.tsx src/features/procurement/ProcurementRequestsPage.test.tsx
npm run typecheck
npm run build
```

Run repository hygiene checks:

```sh
git diff --check
git status --short
```

Rendered verification:

- Check Main/Sub-Basket initial and saved states at 390px, 768px, 1440px and 1920px; compare header treatment with Add Vendor. Inspect image visibility, text clearance, long names, spacing, overflow and reachable actions.
- Confirm unchanged field inventory and existing basket draft/configuration interactions.
- Inspect Add Vendor, a resumed vendor draft and existing-vendor details. Verify removed utilities, external requests navigation and catalog failure/retry behavior.
- Exercise keyboard focus/close, dirty confirmation and successful request submission closing all panels while preserving the vendor draft. Use isolated fixtures/mocked requests for writes.
- Check runtime console/network failures and representative Configuration/Super Admin screens for unintended presentation changes.

Report baseline failures separately. Broaden checks only if shared changes or new failures justify it; no repository lint script exists. Keep QA artifacts outside tracked sources and report their paths.

Acceptance: specification verification criteria pass, or any unresolved limitation is explicitly reported without claiming completion.

## Coordination and handoff

Keep one parent task in progress. In Mode A, tasks 2 and 3 have disjoint ownership; agents must preserve unrelated work and coordinate any proposed boundary change. In Mode B, execute the same tasks inline. The primary agent owns documentation, interpretation, integration and final reconciliation.

The final handoff will summarize the visible changes, affected files, exact verification results and any limitations. No staging, commits, pushes, database sync, migrations, seeds or deployment are authorized by this plan.

## Completion evidence

All five tasks completed. The initial source tree was clean; only this request's spec and plan were untracked. Two implementation agents worked on separate paths, followed by a read-only integrity review with no confirmed defects and integrated verification.

Affected frontend files:

- `vendor-basket-proposals/procurement-main-basket.css`: existing vendor artwork, shared header typography/divider, matching 44px close control, compact form spacing and responsive body insets. Basket JSX and workflow code were unchanged.
- `procurement/VendorBasketFields.tsx` and `ProcurementVendorEditor.tsx`: default-on utility presentation option, disabled only for Add Vendor.
- `procurement/VendorDirectory.test.tsx`: new/resumed vendor utility visibility, existing-vendor preservation, main/sub catalog recovery and draft-retention coverage.
- `procurement/ProcurementVendorProfile.test.tsx`: existing legacy-supplier test now waits for catalog readiness before saving, resolving a timing failure without altering its assertion or product behavior.

Verification results:

- The exact seven-file command above passed: **159 tests in 7 files**. `npm run typecheck` passed. `npm run build` passed, including a repeat after the final close-control CSS correction. The build retains the chunk-size warning above 500 kB.
- `git diff --check` passed. No dependencies or lockfiles changed.
- Rendered Main/Sub initial forms and saved workspaces at **390, 768, 1440 and 1920px**: no horizontal overflow, appropriate illustration hiding on mobile, expected 70vw desktop width, and compact 20px mobile/24px desktop headings. Rechecked all four basket states after the final close-control adjustment.
- Compared field/control inventories with HEAD at 390px and 1440px: every basket field and button remained unchanged; the only removed Add Vendor buttons were Refresh baskets and All my requests. Existing-vendor and Super Admin inventories were identical.
- Add Vendor's initial viewport, existing-vendor details and Super Admin review were pixel-identical to HEAD at 390px and 1440px after fonts/animations settled. Configuration source files and global drawer defaults were not modified.
- Checked long-name variants at all four widths and scrolled to the submission action. Verified dirty-state Escape/Keep editing, failed creation retry preserving the exact command, successful submission closing the panel, and Add Vendor catalog Retry recovery with both normal shortcuts absent.
- Browser axe checks for initial and saved Sub-Basket panels returned zero violations. The responsive matrix produced zero uncaught page errors; the isolated fixture's only network errors were missing favicons. Focused rendered tests also cover closing nested panels and retaining vendor drafts across requests navigation.

Evidence is under `/tmp/lisno-basket-vendor-panel-qa/`: `final-focused.log`, `final-typecheck.log`, `final-build.log`, `rendered-checks.log`, `pixel-comparison.json`, responsive screenshots and isolated fixture files. Browser-generated artifacts are moved there from the repository. The temporary QA server/browser are stopped after inspection; the user's app server is untouched.

Limits: browser checks use actual components with synthetic API responses; no live backend writes were made. The full frontend suite, backend/OCR checks and a separate rendered Configuration screen check were not run for this scoped presentation change. No database operations, production changes, commits, pushes or deployment occurred.

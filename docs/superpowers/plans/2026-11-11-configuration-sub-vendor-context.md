# Configuration Sub-Vendor basket context and source check buttons: task plan

Date: 2026-11-11
Status: Mode A implementation, review and scoped verification finished. The selected regression lane retains confirmed baseline failures; see below.

## Authority and source of truth

The user approved the [specification](../specs/2026-11-11-configuration-sub-vendor-context-design.md), then this task plan, and selected Mode A on 2026-11-11. This plan implements its AC1–AC5 without changing its scope.

All implementation gates are satisfied. No commit, push, deployment, data migration, seed or external mutation is included.

## Baseline and implementation contract

- At planning time the only untracked path is the task's specification; there are no modified product files. Capture status and relevant target diffs again before writing, and preserve any intervening work.
- The current Main Line's `item` is the source for basket names and assignment IDs. Pass a read-only basket-context prop from `KnowledgeModePanel` to `KnowledgeModeConfigurationBuilder`, using the existing item field types. Do not introduce a shared API field, lookup or stored value.
- At the start of the Sub-Vendor body, render a semantic description list containing Main Basket and Sub Basket. Use `knowledge-mode-configuration__basket-context` for scoped layout. Missing Sub Basket ID means **Not assigned**; an assigned basket with a missing/blank name means **Name unavailable**.
- Retain the execution-source native inputs, labels, event handlers and `aria-controls`. A decorative `knowledge-mode-configuration__source-check` element may provide the visual indicator; keep it hidden from assistive technology and synchronize it through the existing checked/selected state. Do not add an icon dependency or introduce a second interactive control.
- Source selection remains independent local visibility state. Preserve both/neither selection, keyboard operation, validation reveal, unfinished inputs and read-only browsing.
- Only one parent task is in progress: implement and verify this approved specification. The slices below have explicit dependencies and ownership.

## Dependency-ordered tasks

### T1. Basket context and source-control markup

Dependencies: approved plan, selected execution mode and refreshed worktree baseline.

Owner: frontend implementer in Mode A; primary agent in Mode B.

Owned files:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx`, only if needed to verify the real tier/item prop path
- Other direct builder test fixtures only when the new typed prop requires an update; report these paths before expanding ownership.

Work: pass and display basket context; add the accessible check-indicator markup; preserve existing state handlers. Extend focused rendered tests for two Main Lines with different basket names, absent assignment versus unavailable name, and source-selection behavior. Verify the actual Mode panel passes context, including tier use through the shared builder. Reuse existing state-preservation coverage rather than duplicating it.

Acceptance: AC1, AC2 and AC3. Context changes with current item props; both labels are within Sub-Vendor; checkbox pointer/Space interaction preserves independent selection and triggers no payload/dirty callback by itself; existing calculations and validation behavior pass.

### T2. Scoped visual treatment

Dependencies: the markup/class contract above. May run alongside T1 in Mode A because file ownership is separate.

Owner: primary agent in both modes.

Owned files:

- `frontend/src/features/ai-estimator-knowledge/knowledge-mode-reference.css`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`, only if an existing base selector requires a bounded correction

Work: match source-button spacing, typography and selected treatment to the existing mode selector. Provide a clear selected tick, unchecked outline, visible keyboard focus and a usable label target. Style the basket description list as compact labelled text that wraps at narrow widths. Preserve surrounding Description and section styles; add no decorative icons, hover animation or global style override.

Acceptance: AC2 and AC4. Selection is visually unambiguous, focus remains visible, and long names and controls fit at desktop/mobile widths without overlap or page overflow.

### T3. Integrate and review

Dependencies: T1 and T2 complete; all writers stopped.

Owner: primary agent. In Mode A, use a bounded read-only `integrity_reviewer` for the integrated frontend diff; in Mode B, perform the equivalent review inline.

Work: review prop wiring, item changes, fallback labels, CSS cascade and focus, native checkbox semantics, no-write selection behavior, and preservation of common Description and tier isolation. Inspect all changed paths and address confirmed findings before final verification. Do not change pricing, API contracts, permissions or unrelated work.

Acceptance: AC1–AC4 are accounted for; no unintended behavior or out-of-scope changes remain.

### T4. Verify the integrated result and hand off

Dependencies: T3 complete and any review corrections integrated.

Owner: primary agent; in Mode A a `verification_runner` may execute the test/build checks after writers finish. Browser verification remains with the primary agent. Mode B keeps all work inline.

Run from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcScope.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx
npm run typecheck
npm run build
```

Use the actual Configuration components and styles in a local browser, with synthetic fixture data or intercepted local responses to avoid mutating real records. Check approximately 1440px and 390px widths: long basket names, selected/unchecked source indicators, both/neither selection, Tab/Space focus, hide/show and collapse/reopen, read-only browsing, and common Description placement. Check console errors and horizontal overflow. Automated rendered accessibility checks complement the visual inspection.

Run `git diff --check` and `git status --short` at the repository root. Record exact commands, pass/failure counts, browser observations and any unrun checks. Do not claim lint ran; no lint script exists. Broaden testing only for an actual shared-contract change or unresolved regression.

Acceptance: AC5 and final evidence for AC1–AC4. Record verification in this plan during implementation, then report principal changes, affected files, checks, limitations and external actions not performed. Remove temporary browser fixtures/artifacts after use; report paths for any generated ignored build or QA outputs without committing them.

## Parallel execution boundaries

- Mode A: T1 and T2 may proceed concurrently after the agreed prop/markup contract is communicated. The frontend implementer owns TSX and its assigned tests; the primary agent owns CSS and documents. Each writer must preserve other agents' changes and request coordination before crossing a file boundary. T3 and T4 run sequentially on the integrated result.
- Mode B: the primary agent performs T1, T2, T3 and T4 inline, without subagents.
- No backend, shared-contract or native mobile implementation is planned. Any discovery that materially changes the approved behavior must be reconciled with the specification before expanding scope.

## Execution record

- Refreshed baseline: only this task's specification and plan are untracked; all product targets are clean.
- T1 assigned to the frontend implementer; T2 owned by the primary agent. The agreed indicator and basket-context class names separate JSX and CSS ownership.
- Additional T1 direct caller fixture updates: `KnowledgePmcScope.test.tsx`, `KnowledgePmcMargin.test.tsx`, `KnowledgeModeDescription.test.tsx`. These only supply the new required basket-context prop.
- T1 and T2 complete: current item context feeds the Sub-Vendor description list; native source checkboxes retain their behavior with CSS check indicators. No API, persistence, calculation, permission or dependency change.
- T3 complete: independent integrity review found no confirmed defects in the eight changed frontend files. Primary inspection reconciled the JSX/CSS contract and final diff.
- T4 browser checks passed using the actual builder and Configuration styles with synthetic data at 1440px, 390px and 320px. Checked/unchecked visuals, Tab/Space, visible focus, independent both/neither selection, collapse/reopen, current-item labels, missing-name/assignment text, pending Description retention and read-only browsing all passed. Long names wrap; document widths exactly matched all three viewports. Screenshots inspected. Zero browser errors, network writes or dirty/payload callbacks during these checks.
- Browser automation used the existing cached Playwright CLI after the wrapper could not reach npm. One automatic approval review timed out; the permitted retry succeeded. Browser QA was completed, its isolated browser and Vite server were closed, and `frontend/output/playwright/sub-vendor-context/` (fixture, scripts, CLI snapshots and screenshots) was removed.

### Integrated command results

- The seven-file `npm test -- ...` command above: **150 passed, 32 failed, 182 total** across seven files in 20.19s. All five changed test files passed, including the new context tests. Failures occur in two unchanged legacy files: 31 in `KnowledgeModeSectionStateRemoval.test.tsx` and one in `KnowledgeModeLayout.test.tsx`.
- `npm run typecheck`: passed, exit 0.
- `npm run build`: passed, exit 0. Vite transformed 3346 modules and completed its build in 9.66s. The existing large-chunk warning remains (main JavaScript approximately 3.34 MB uncompressed). Generated ignored outputs: `frontend/dist/` and TypeScript metadata under `frontend/node_modules/.tmp/`.
- `git diff --check`: passed. Final status contains only the eight intended frontend changes and the two task documents; no QA fixture remains.
- The initial component/workspace development test run had two existing timing failures after a long stall. Both passed in isolation and the full workspace rerun (25 passed); final integrated verification also passed that file. No timeout-related product change was made.

### Baseline limitations

An isolated source copy at `/tmp/lisno-sub-vendor-baseline-n4yrj6_c` restored all three changed product files to `HEAD` and ran the two unchanged failing test files. It reproduced **24 passed / 32 failed**: 15/31 for SectionStateRemoval and 9/1 for Layout. JSON reports from both the baseline and a current two-file rerun confirmed identical failure-name sets, with no added or resolved failures. Many old SectionStateRemoval cases unconditionally click Execution even when saved state already selects it, hiding the expected fields; the old Layout assertion expects grid columns from CSS that already uses flex. These unrelated baseline failures were not repaired or suppressed by this change. The verification runner removed the temporary baseline copy and both JSON reports after comparison.

The baseline/current comparison used the following command in each respective `frontend/` directory, changing the output filename for the current run:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx --reporter=json --outputFile=/tmp/lisno-sub-vendor-baseline-n4yrj6_c/baseline-results.json
```

The full frontend suite, backend/OCR/mobile suites and lint were not run; this scoped presentation change has no backend/shared contract impact, and no lint script exists. No commit, push, migration, seed, deployment or real Configuration mutation was performed. The requested UI checks pass, but the broader selected regression command is not green because of the baseline failures above.

### Header visibility refinement

The user reiterated displaying both names after providing the expanded-panel screenshot. Kept the approved current-item data flow and additionally placed both labelled names in the Sub-Vendor header subtitle, visible while collapsed. Primary owned the builder display change and browser check; the frontend implementer owned its existing test file. Prior work on all dirty paths was preserved. Names are resolved once for the header and body, and the disclosure button references the header context through `aria-describedby`. No data rename or new workflow was introduced.

Final refinement verification:

```sh
# frontend/
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx
npm run typecheck
npm run build
# repository root
git diff --check
git status --short
```

- Tests: **51/51 passed**, two files, 10.96s. Header names update across items, preserve legitimate saved `na` text, show missing/unassigned states and remain visible and accessible when collapsed.
- Typecheck and build passed. Vite transformed 3346 modules and completed its build in 9.44s; the existing large-chunk warning remains. Ignored build outputs remain under `frontend/dist/` and `frontend/node_modules/.tmp/`.
- Real-component browser checks at 1440px and 390px passed for screenshot-style saved names and long synthetic names. Both names remain in the collapsed header with the correct accessible description; no page/header overflow or browser errors. Screenshots inspected. The isolated browser/server were closed and temporary `frontend/output/playwright/sub-vendor-header/` artifacts removed.
- Primary integrated review and independent verification found no new issue; final diff checks pass and only the eight intended frontend files plus two task documents remain changed. The full suite and the 32 previously proven baseline failures were not rerun for this small subtitle refinement. No external/data mutation or deployment occurred.

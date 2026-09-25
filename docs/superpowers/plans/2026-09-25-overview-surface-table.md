# Configuration Overview surface-table plan

Specification: [Overview surface table](../specs/2026-09-25-overview-surface-table-design.md).

Single parent task: update Overview to the supplied reference while preserving existing contracts.

1. Root captured current dirty hashes and target snapshots under `/tmp/lisno-overview-surface-table-qa`, read existing diffs and audited surface contracts. Complete.
2. UI implementer owns `KnowledgeOverviewPanel.tsx`, `KnowledgeModeSurfacePanel.tsx`, their focused tests and a new Overview-scoped CSS file. Add optional edit callback and an Overview presentation variant, keeping default shared behavior; build accessible table/actions and responsive layout.
3. Root owns minimal workspace integration (`KnowledgeItemWorkspacePage.tsx`), integration coverage, shared-editor explanatory copy and docs. Wire optional edit callback to the existing versioned reusable editor with current permissions; no new API or persistence path. In parallel prepare synthetic actual-workspace preview from prior harness.
4. After writers finish, independent integrity review confirms permission/selection/save/identity and shared-tab invariants. Resolve findings, then final verification runs focused component/integration tests, typecheck/build. Root performs rendered viewport/state/keyboard/accessibility checks and inspects screenshots.
5. Reconcile baseline hashes, update this evidence record, stop temporary preview tools and remove only owned runtime artifacts from repository paths.

No unrelated formatting, shared contract changes, backend changes, dependency installation, staging, commits, deployment or production mutation.

User correction during rendered verification: keep Quick summary and Revision history in their original right sidebar. Removed the proposed rail-placement CSS; the original workspace responsive layout remains authoritative.

Further user clarification: remove the unused side whitespace. Override only the Main Line workspace maximum width to use the existing shell area. Keep the original sidebar and responsive shell padding.

## Verification and outcome

Implementation and independent integrity review complete. Quick summary and Revision history remain in their existing right sidebar on desktop; their prior responsive stacking remains unchanged. The Main Line workspace now uses all available shell width (1920px viewport: page x=264px, 24px after the 240px navigation; page width 1632px instead of 1440px).

Changed areas: Overview and its shared Surface panel opt-in presentation, new `knowledge-overview-table.css`, minimal reusable-editor wiring in `KnowledgeItemWorkspacePage.tsx`, clarifying editor copy, and focused component/integration coverage. No new dependency, backend/API/schema, permission, financial or workflow contract change. Surface categories are absent from the existing contract, so the UI shows actual names/descriptions only. The remove action unselects a row from the draft; it never deletes shared data.

- Focused Vitest command: `npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceEditorDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`: 116 passed, 14 failed. All 40 component tests and the 3 added integration tests passed.
- Captured pre-task `KnowledgeScreens.test.tsx` was executed using a one-run in-memory Vite transform, with no source replacement: 73 passed, the same 14 failures. Current integration file: 76 passed, same 14 failures. Failures are 13 stale inline “Item name” queries and 1 stale “Version 2” expectation, predating this task. No additional failures; unrelated tests not rewritten.
- `npm run typecheck`: passed. `npm run build`: passed, repeated after final CSS refinements; existing >500kB bundle-size warning remains. `git diff --check`: passed.
- Actual workspace rendered against synthetic loopback-only API responses at 1920, 1440, 1024, 768, 390 and 320px. No page overflow; all six axe WCAG A/AA checks report zero violations. Desktop uses 30/70 cards alongside the original rail; tablet/phone stack normally. Phone heading flex-basis corrected to eliminate inherited 224px height, and Actions heading remains readable.
- Browser checks passed: keyboard edit/open, reusable edit while preserving pending UOM, row removal without server mutation until Save Overview, same stable IDs and hidden payload fields preserved on save, both Surface creation entry points, new Surface selected immediately, Add Unit shortcut, read-only, selected inactive/archived/unresolved values, empty table, catalog loading and error recovery, long names/descriptions at phone width. New Surface and Overview writes were synthetic in-memory only.
- QA screenshots, logs, harness and baseline snapshots: `/tmp/lisno-overview-surface-table-qa/`. Full frontend/backend/OCR suites were not run for this UI-only change. No repository lint script exists. No staging, commit, push, deployment, live database mutation or migration performed.

## Compact spacing follow-up

Root owns scoped spacing changes in `knowledge-overview-table.css`. Read-only audit traces sidebar padding and tab baseline while root inspects status/Overview rules. Preserve all JSX/data/actions, full workspace width, right sidebar, selected-tab underline and 44px controls. Verify computed spacing before/after, rendered desktop/phone, dropdown/summary/tab keyboard use, axe, production build and diff hygiene. Baseline and evidence: `/tmp/lisno-overview-spacing-qa/`. User’s standing approval waiver applies.

Spacing follow-up complete: only the scoped CSS and these existing design/plan documents changed. At 1920px with six selected fixture surfaces, completeness bar height reduced 70→54px, UOM 630→169px (content-height), Surfaces 630→518px and Revision history 238→202px. Sidebar summary nested spacing is reduced without changing its viewport height limit, scrolling or disclosure behavior. The tab strip border is 0px; selected tab border remains 3px.

Validation: `npm run build` passed (existing large-chunk warning); `git diff --check` passed. Synthetic actual-workspace browser checks passed at 1920, 1440, 768 and 390px: no horizontal overflow, zero axe WCAG A/AA violations, existing 44px controls retained, right sidebar retained on desktop, surface dropdown keyboard/focus, Quick summary disclosure and Overview/Mode tab switching passed. Inspected desktop/mobile screenshots under `/tmp/lisno-overview-spacing-qa/`. No TS/JS/contract changes, so no additional unit tests or backend checks were run for this CSS-only follow-up.

## Typography and plus-control follow-up

Root owns scoped `knowledge-overview-table.css` changes. Read-only agent audits Button markup for empty-label gaps and existing progress grid conventions. Root verifies typography/control geometry and responsive progress layout using the actual-workspace synthetic preview. Maintain sidebar, tab indicator, labels/focus and save semantics. Baseline/QA: `/tmp/lisno-overview-type-qa/`.

Typography/control follow-up complete. Scoped CSS uses 16px Overview titles, 12px helper text/labels, 28px decorative icon tiles and tighter 8px card padding/4px control gaps. Plus shortcuts are 32px on desktop, with 44px phone/coarse-pointer targets. Their empty label and inactive busy row no longer reserve space; icons and controls are centered exactly, including wrapped selections. UOM fixture height is now 127px on desktop instead of 169px. Surface fixture card is 483px instead of 518px.

Progress now occupies column 3 after label and percentage and approximately 25% of the desktop status row. Save commands remain trailing; below 900px they move below the three progress columns. Actual progress value, saving state, labels and actions are unchanged. No answer arrived to the optional col-3 clarification, so the stated compact quarter-width interpretation was used.

Validation: final `npm run build` passed (existing >500kB chunk warning), `git diff --check` passed. Actual workspace with synthetic loopback-only data checked at 1920/1440/1024/768/390/320px: zero page overflow, zero axe WCAG A/AA violations, correct 16px/12px typography, centered icons and adjacent-field centers within 0px, correct 32px/44px targets, actual 17% progress in grid column 3 and about 25% desktop width. Keyboard Add Unit, Create Surface, Surface selector, Save Overview and last-saved display passed. No JS/API/data contract changes; no new unit tests or backend checks needed for this CSS follow-up. Evidence: `/tmp/lisno-overview-type-qa/`, including final screenshots, browser-checks.log, final-layout.log and build.log. No deployment, live data writes, staging or commits.

Heading-divider follow-up: root adds `border-block-end: 0` to the existing Overview-scoped heading rule in `knowledge-overview-table.css`. Verify both heading borders at desktop/phone widths while retaining table, card and selected-tab borders; run diff hygiene. CSS-only local change; no new tests or contract changes. Baseline/evidence: `/tmp/lisno-overview-dividers-qa/`.

Heading-divider verification passed at1920px and390px in the actual workspace with synthetic data: both heading borders0px, card outlines1px, table header separator1px, selected-tab underline3px, no page overflow. Inspected `/tmp/lisno-overview-dividers-qa/overview-1920.png`. `git diff --check` passed. This one-declaration CSS change did not require new unit tests or a repeated production build.

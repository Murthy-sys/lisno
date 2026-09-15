# Overview UOM and Surfaces proportions — task plan

Approved specification: [Overview proportions](../specs/2026-09-15-overview-uom-surfaces-proportions-design.md).

Status: specification and task plan approved; execution mode A selected. Implementation and verification complete.

## Fixed scope

Use a 1:3 split for UOM and Surfaces at suitable Overview content widths, retaining the existing gap and top alignment. Stack on narrower content widths. Allow Add Unit below its selector when the quarter-width card needs it; preserve readable controls, current typography, Surface details and all existing behavior. This is a local style change with no backend, data, financial or dependency work.

## Tasks and ownership

1. **Capture baseline — parent; AC1–AC4.** Before writes, capture current status and the exact existing diff/content of `frontend/src/features/ai-estimator-knowledge/knowledge-configuration-ui.css`, which already contains unrelated changes. Confirm the Overview wrapper and cascade. Preserve prior work, including automatic simulator previews. Do not stage, revert or reformat unrelated paths.
2. **Implement the layout — frontend owner; after task1; AC1–AC3.** Own only `knowledge-configuration-ui.css`. Use Overview-scoped selectors and an inline-size container on the appropriate existing workspace wrapper. Start with a single-column layout; at approximately 56rem of available Overview content, apply `minmax(0, 1fr) minmax(0, 3fr)` to the two existing sections. Preserve the gap and top alignment. Adjust only the UOM control arrangement needed to fit its narrow column; keep Add Unit visible and Surface controls inline when they fit. Ensure existing mobile control stacking still wins. A minimal class addition to `KnowledgeOverviewPanel.tsx` requires parent assignment only if current selectors are insufficient; no component rewrite or shared field changes.
3. **Prepare verification — parent; after task1; parallel with task2.** Review the existing Overview/layout/Surface tests and prepare local synthetic browser states for selected/empty values, long labels and read-only/loading/error content. Do not write actual application data. The parent owns any necessary existing-test correction; do not add tests that simply duplicate CSS declarations. Do not run final visual checks until the stylesheet writer finishes.
4. **Integrate and verify — parent; after tasks2/3; AC1–AC4.** Review the scoped delta, run the checks below and inspect the rendered layout. Verify the measured desktop card-width ratio is approximately 1:3 after subtracting the gap. Check that UOM selection and Add Unit work and that the Surface selector/quick-add action remains accessible. Inspect narrow layouts, long labels, keyboard focus/order, horizontal overflow and 200% zoom. Fix confirmed scope-related issues and repeat only affected checks. Record exact results and limitations in this plan.

Dependency order: **task1 → (task2, task3) → task4**. Keep one parent task in progress.

In Mode A, one native frontend implementer owns the stylesheet while the parent prepares verification; tell the writer that others share the worktree and existing edits must be preserved. In Mode B, implement and verify inline. No subagents or implementation before execution-mode selection. This small change needs a focused final diff review, not a separate broad integrity audit.

## Verification

Run from `frontend/` after the writer finishes:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceEditorDialog.test.tsx
npm run typecheck
npm run build
```

Run `git diff --check` and `git status --short` from the repository root and compare against the baseline. Existing layout tests may inspect earlier stylesheet declarations; passing them does not replace rendered validation of the final cascade.

Browser matrix: a desktop viewport with at least 56rem of actual Overview space (start at 1440px), a narrower tablet/laptop viewport (start at 1024px), mobile 390px and 200% browser zoom where tooling supports it. Measure the actual Overview/card bounds rather than assuming viewport width equals content width. Confirm top alignment, approximately 25%/75% card widths on desktop, stacked narrow sections, no horizontal overflow and usable full action labels. Capture and inspect relevant screenshots.

Recent mobile resize automation has stalled. Use bounded attempts and document any unavailable mobile/zoom check without claiming a pass. Stop task-owned servers and move temporary browser/test evidence outside tracked source. Keep generated build artifacts ignored.

No new dependencies, backend/full-repository/replica tests, migration, application-data mutation, commit, push or deployment are included. There is no lint script. Broaden checks only for an actual new issue.

## Progress

- Specification: approved.
- Task plan: approved.
- Execution mode: A — parallel sub-agents.
- Task1: complete; baseline at `/tmp/lisno-overview-proportions-baseline`.
- Tasks2/3: complete; frontend agent implemented the scoped stylesheet change while the parent prepared verification.
- Task4: complete; parent reviewed the final delta and verified the integrated result.

## Implementation and verification results

The product delta is 20 added lines in `frontend/src/features/ai-estimator-knowledge/knowledge-configuration-ui.css`. An Overview-specific inline-size container switches the cards from one column to 1:3 at 56rem of content width. The UOM selector and Add Unit stack within the quarter-width card. No component, test, backend, dependency or lockfile changes were needed. Earlier worktree edits were preserved against the captured baseline.

All required commands above passed after the writer finished: **43 tests across four files**, frontend typecheck, frontend production build and `git diff --check`. The build retains the existing large-chunk warning. There is no lint script. Backend, full-repository, replica-set and OCR suites were not run for this CSS-only change.

Rendered checks used local synthetic data and fresh browser contexts with their viewport set before navigation, avoiding the earlier resize stall:

| Viewport | Overview content | UOM / Surfaces | Result |
| --- | ---: | --- | --- |
| 1920 × 1080 | 1132 px | 279 / 837 px, 16 px gap | Exact 1:3 ratio, top-aligned |
| 1440 × 960 | 812 px | Both 812 px, stacked | Workspace navigation leaves insufficient width for the split |
| 1024 × 900 | 992 px | 244 / 732 px, 16 px gap | Navigation collapses; exact 1:3 ratio |
| 390 × 844 | 326 px | Both 326 px, stacked | Readable mobile controls |
| 960 × 540, DPR 2 | 928 px | 228 / 684 px, 16 px gap | 200% reflow emulation for a 1920 × 1080 display |

No document or control overflow was observed. Screenshots were inspected. Native browser-menu zoom was not exercised; the zoom check used the equivalent reduced logical viewport and doubled pixel density.

Interaction checks covered changing UOM, selecting a Surface, opening and dismissing both quick-add dialogs, and tabbing from UOM to Add Unit. Selected-surface details, long labels, read-only permissions and UOM loading/error states fitted the cards. Browser accessibility analysis reported zero violations, with `aria-prohibited-attr` and `color-contrast` checks incomplete; this is not an exhaustive accessibility audit. No application errors were observed in the viewport matrix.

Logs, screenshots and the baseline-relative product patch are at `/tmp/lisno-overview-proportions-final/`; the original baseline is at `/tmp/lisno-overview-proportions-baseline/`. Task-owned browser contexts and the Vite server were stopped. Build outputs remain ignored. No saved application-data mutation, migration, commit, push or deployment was performed.

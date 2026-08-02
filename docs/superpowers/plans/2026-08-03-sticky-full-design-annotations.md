# Sticky Full Design Annotation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Full Design sticky and restore explicit preview, draft saving, and annotations for clients until the estimate is approved.

**Architecture:** Separate commercial estimate actions from design-review editability. `EstimateReviewPanel` derives a client design permission from estimate status and passes it to both full-page and extracted-drawing review, while `ClientFullPlanNav` exposes an explicit Preview action and owns sticky positioning independently of Ask Lisno.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library

## Global Constraints

- Commercial decision controls remain actionable only for `sent_to_client`.
- Design annotations are editable for `sent_to_client` and `client_changes_requested`, and read-only for `client_approved`.
- Approved individual pages remain read-only.
- Ask Lisno remains separate from Full Design.
- Every uploaded page remains reachable without nested clipping.

---

### Task 1: Restore pre-approval design permissions

**Files:**
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

**Interfaces:**
- Produces: `canReviewDesign(role: Role, status: EstimateStatus): boolean`.
- Consumes: the existing `actionable` flag only for commercial controls.

- [x] **Step 1: Write failing workflow tests**

Add one client estimate with `client_changes_requested` and assert that opening a Full Design page shows the `Annotation tools` toolbar and enabled `Save as draft`. Add an approved case and assert that the toolbar is absent.

- [x] **Step 2: Run tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: the changes-requested case fails because `actionable` is false.

- [x] **Step 3: Implement the separate permission**

```ts
function canReviewDesign(role: Role, status: EstimateQueueItem["status"]) {
  return role === "client" && ["sent_to_client", "client_changes_requested"].includes(status);
}
```

Pass this value to `ClientEstimateDrawings` and `ClientPlanPageReview`; keep `reviewControls` based on `actionable`.

- [x] **Step 4: Run tests and verify GREEN**

Run the focused test file and expect all tests to pass.

### Task 2: Add explicit Preview and Save as draft actions

**Files:**
- Modify: `frontend/src/features/estimates/ClientFullPlanNav.tsx`
- Modify: `frontend/src/features/estimates/ClientFullPlanNav.test.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- `ClientFullPlanNav` continues to call `onSelectPage(page)`.
- The draft callback remains `onSaveDraft(document)`; only visible copy changes to `Save as draft`.

- [x] **Step 1: Write failing UI tests**

Assert six buttons named `Preview design page N`, and assert the modal button is named `Save as draft`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientFullPlanNav.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: tests fail because the whole row is the page button and draft copy is `Save draft`.

- [x] **Step 3: Implement minimal UI changes**

Render each page as a non-button row containing thumbnail, metadata, and:

```tsx
<button type="button" aria-label={`Preview design page ${page.pageNumber}`} onClick={() => onSelectPage(page)}>
  Preview
</button>
```

Rename the modal draft action to `Save as draft`. Preserve page selection styling on the row.

- [x] **Step 4: Run focused tests and verify GREEN**

Run both focused test files and expect all tests to pass.

### Task 3: Make Full Design independently sticky

**Files:**
- Modify: `frontend/src/styles/index.css`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Modify: `design-qa.md`

**Interfaces:**
- `.client-plan-nav` owns sticky desktop behavior.
- `.client-estimate-workspace__rail` remains the layout container for Full Design and Ask Lisno.

- [x] **Step 1: Write failing CSS assertions**

Assert `.client-plan-nav` contains `position: sticky` and `top: 1rem`, the rail does not own sticky positioning, and the mobile `.client-plan-nav` rule contains `position: static`.

- [x] **Step 2: Run the CSS regression test and verify RED**

Run the collapsible panel test and expect the sticky ownership assertions to fail.

- [x] **Step 3: Move sticky ownership to Full Design**

Keep the rail as a flex column with minimum viewport height for bottom Ask Lisno alignment. Remove `position: sticky` and `top` from the rail; add them to `.client-plan-nav`. On mobile, set `.client-plan-nav { position: static; }`.

- [x] **Step 4: Verify all frontend checks**

Run: `VITE_API_URL=/api/v1 npm test && npm run typecheck && npm run build`

Expected: all tests pass and both commands exit 0.

- [x] **Step 5: Commit and push without merging**

```bash
git add frontend/src docs/superpowers/plans/2026-08-03-sticky-full-design-annotations.md design-qa.md
git commit -m "fix: restore full design annotations"
git push origin feature/ocr_improvements
```

### Task 4: Correct action placement and immediate drawing

**Files:**
- Modify: `frontend/src/features/estimates/ClientFullPlanNav.tsx`
- Modify: `frontend/src/features/estimates/ClientFullPlanNav.test.tsx`
- Modify: `frontend/src/components/design/ImageAnnotationEditor.tsx`
- Modify: `frontend/src/components/design/ImageAnnotationEditor.test.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Full Design tiles continue to invoke `onSelectPage(page)` without visible Preview copy.
- Extracted drawing rows retain their existing `Preview` buttons unchanged.
- `ImageAnnotationEditor` starts with `tool === "rectangle"` in editable mode.

- [x] **Step 1: Write failing placement and pointer tests**

Assert Full Design contains no visible `Preview` text, clicking its page tile selects the page, Rectangle is initially pressed, the instruction is visible, and the first pointer drag creates a rectangle that enables `Save as draft`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientFullPlanNav.test.tsx src/components/design/ImageAnnotationEditor.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: failures show the extra Full Design Preview label and Select as the initial tool.

- [x] **Step 3: Implement corrected placement and default tool**

Restore each Full Design tile as the page-selection button with an accessible name such as `Open design page 1`, remove visible Preview copy, initialize `tool` to `rectangle`, add `Choose a tool, then drag on the drawing.`, and expose the active tool through `data-active-tool` for cursor styling.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the three focused files and expect all tests to pass.

### Task 5: Give sticky Full Design the complete scroll range

**Files:**
- Modify: `frontend/src/styles/index.css`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Modify: `design-qa.md`

**Interfaces:**
- `.client-estimate-workspace__rail` stretches to the grid row's full content height.
- `.client-plan-nav` remains `position: sticky; top: 1rem`.

- [x] **Step 1: Write a failing rail-height regression assertion**

Assert `.client-estimate-workspace__rail` contains `align-self: stretch` and does not use a fixed viewport-height containing block.

- [x] **Step 2: Run the CSS test and verify RED**

Run the collapsible panel test; expect failure because the rail currently inherits `align-items: start` and ends after one viewport.

- [x] **Step 3: Stretch the rail and preserve mobile flow**

Add `align-self: stretch` to the desktop rail. Keep Full Design sticky and Ask Lisno bottom-aligned with `margin-top: auto`. On mobile, reset `align-self: auto` and keep Full Design static.

- [x] **Step 4: Run full verification and push without merging**

Run: `VITE_API_URL=/api/v1 npm test && npm run typecheck && npm run build`

Then commit with `fix: make full design annotations usable` and push `feature/ocr_improvements`.

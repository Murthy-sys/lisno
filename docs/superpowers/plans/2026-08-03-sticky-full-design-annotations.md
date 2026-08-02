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

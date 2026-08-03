# Bidirectional Change-Request Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display mapped change-request summaries as read-only history in both Full Design and extracted drawing previews.

**Architecture:** Keep comments separate from annotation documents and editable form state. Pure projection helpers derive request history from the existing drawing and plan workspaces, using the same canonical placement and request targeting rules as annotation projection; the preview dialog only renders the resulting presentation values.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library

## Global Constraints

- Historical summaries are read-only and never prefill the editable Change summary field.
- Saving a draft or submitting a request never includes mapped historical comments.
- Request IDs provide stable deduplication.
- Blank summaries are omitted.
- Replacement revisions inherit their original canonical page relationship.

---

### Task 1: Render shared request history without changing submission state

**Files:**
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Produces: `SharedChangeRequestComment` and `EstimateDrawingPreviewDialogProps.sharedComments?: SharedChangeRequestComment[]`.
- Guarantees: callbacks continue receiving only `(AnnotationDocumentV1)` or `(AnnotationDocumentV1, newSummary)`.

- [x] **Step 1: Write a failing dialog test**

Render two identical `sharedComments` entries with ID `request-1`, assert `Requested changes` and the summary appear once, assert Change summary remains empty, then save and submit and assert neither callback payload contains the historical summary.

- [x] **Step 2: Run the dialog test and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: FAIL because `sharedComments` is not supported.

- [x] **Step 3: Add the read-only history**

Export:

```ts
export interface SharedChangeRequestComment {
  id: string;
  summary: string;
  status: string;
  source: "plan" | "drawing";
}
```

Normalize by trimming summaries, dropping blanks, and retaining the first item for each ID. Render the list above the editable Change summary control under a `Requested changes` heading. Do not add it to component state.

- [x] **Step 4: Run the dialog test and verify GREEN**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: all dialog tests pass.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/design/EstimateDrawingPreviewDialog.tsx frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx frontend/src/styles/index.css
git commit -m "feat: show mapped request comments in previews"
```

### Task 2: Project comments in both directions

**Files:**
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/ClientPlanPageReview.tsx`
- Modify: `frontend/src/features/estimates/ClientPlanPageReview.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

**Interfaces:**
- Produces: `projectDrawingCommentsToPage(page, drawingWorkspace, planWorkspace): SharedChangeRequestComment[]`.
- Produces: drawing-specific shared plan comments derived from `openRequests[].targets`.
- Consumes: `EstimateDrawingPreviewDialog.sharedComments`.

- [ ] **Step 1: Write failing projection tests**

Assert that:

```ts
projectDrawingCommentsToPage(page, drawingWorkspace, planWorkspace)
```

returns the targeted plan request once plus the latest placed drawing revision's nonblank `changeSummary`, and that a replacement revision resolves to the original page. In a drawing preview test, assert a page request targeting that drawing appears under Requested changes while a request targeting another drawing does not.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: FAIL because comment projection and prop wiring do not exist.

- [ ] **Step 3: Implement page-side projection**

Add `projectDrawingCommentsToPage`. Include page `openRequests` as `{ id: request.id, summary, status, source: "plan" }`. For active latest drawing revisions canonically placed on the page, include nonblank `changeSummary` as `{ id: `drawing:${revision.id}`, summary, status: revision.reviewStatus, source: "drawing" }`. Deduplicate by ID.

- [ ] **Step 4: Implement extracted-side projection and wiring**

Derive plan comments only from requests containing a target with the current `drawingId`. Pass them to `ClientDrawingRow`, then `EstimateDrawingPreviewDialog`. Add `sharedComments` to `ClientPlanPageReview` and pass page-projected comments from `EstimateReviewPanel`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: all focused tests pass with bidirectional mapped comments and replacement ancestry.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/estimates/ClientEstimateDrawings.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/features/estimates/ClientPlanPageReview.tsx frontend/src/features/estimates/ClientPlanPageReview.test.tsx frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
git commit -m "feat: project request comments across plan views"
```

### Task 3: Complete regression verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-03-bidirectional-change-request-comments.md`

**Interfaces:**
- Verifies the completed comment projection without changing backend persistence.

- [ ] **Step 1: Run the full frontend verification**

Run:

```bash
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build
```

Expected: zero failures and a successful production build.

- [ ] **Step 2: Run backend regression verification**

Run: `npm test -- --run tests/estimate-plan-review-client.test.ts tests/estimate-plan-composite.test.ts`

Expected: all canonical page-count and selective replacement tests pass.

- [ ] **Step 3: Mark the plan complete and commit**

Mark every checkbox complete, run `git diff --check`, then commit the plan.

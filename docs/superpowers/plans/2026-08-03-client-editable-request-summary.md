# Client-Editable Open Request Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client edit the one existing open request mapped to a plan page or extracted drawing while preventing any duplicate open request.

**Architecture:** MongoDB enforces one open request per client and canonical source page with a partial unique index. A versioned client update endpoint mutates the same request and synchronizes its requested drawing revisions; frontend projection selects that request as an editable value while preserving read-only history for non-client previews.

**Tech Stack:** TypeScript, Express, Zod, Mongoose transactions, React 19, TanStack Query, Vitest, Testing Library

## Global Constraints

- An open request mapped to a preview can be updated but never submitted again as a new request.
- Full Design and extracted previews resolve to the same request ID.
- Stale versions and duplicate submissions return HTTP 409.
- Updating a request changes no page count, targets, target statuses, or replacement placement.
- Staff and approved-client previews remain read-only.

---

### Task 1: Enforce and update one open request

**Files:**
- Modify: `backend/src/models/EstimatePlanChangeRequest.ts`
- Modify: `backend/src/routes/estimate-plan-review.ts`
- Modify: `backend/src/services/estimate-plan-review.service.ts`
- Modify: `backend/tests/estimate-plan-review-client.test.ts`

**Interfaces:**
- Produces: `UpdateClientPlanRequestInput { version; summary; annotations }`.
- Produces: `plans.updateClientRequest(user, requestId, input)`.
- Adds: `PUT /client/estimate-plan-change-requests/:requestId`.

- [ ] **Step 1: Write failing service and route tests**

Prove the owner can update summary and annotations on the same request ID, version increments, targets remain byte-for-byte equal, requested revisions synchronize, and an audit event is written. Prove another client, a stale version, and a resolved request cannot update it.

- [ ] **Step 2: Write the failing duplicate/concurrency tests**

Submit overlapping requests from page and extracted contexts and assert only one open request exists. Run two simultaneous submissions and assert one succeeds while one returns 409.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- --run tests/estimate-plan-review-client.test.ts`

Expected: FAIL because update endpoint and open-request uniqueness do not exist.

- [ ] **Step 4: Implement the database and service contract**

Add a partial unique index on `{ clientId: 1, sourcePageId: 1 }` where `status: "open"`. Before submission, query for an open request and throw `PLAN_REQUEST_ALREADY_OPEN` with `{ requestId }`. Translate duplicate-key insertion into the same 409. Implement the owner-only versioned update transaction, request/revision synchronization, and `estimate_plan_change_request_updated` audit event.

- [ ] **Step 5: Add the validated route**

Validate `version` as a positive integer, `summary` as trimmed 1–1,000 characters, and `annotations` as a non-empty annotation document. Return the updated request DTO.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- --run tests/estimate-plan-review-client.test.ts tests/estimate-plan-composite.test.ts`

Expected: all tests pass and canonical page/replacement behavior is unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/EstimatePlanChangeRequest.ts backend/src/routes/estimate-plan-review.ts backend/src/services/estimate-plan-review.service.ts backend/tests/estimate-plan-review-client.test.ts
git commit -m "feat: update one open client plan request"
```

### Task 2: Add client edit mode to the preview dialog

**Files:**
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx`
- Modify: `frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx`
- Modify: `frontend/src/features/leads/estimateDesignApi.ts`

**Interfaces:**
- Produces: `EditableChangeRequest { id; version; summary; annotations }`.
- Adds: `EstimateDrawingPreviewDialogProps.editableRequest` and `onUpdateChangeRequest`.
- Adds: `updateClientPlanChangeRequest(requestId, input)`.

- [ ] **Step 1: Write a failing client edit-mode test**

Render an editable request and assert its summary prefills Change summary, Requested changes history is hidden for that request, the primary button reads Update change request, and the update callback receives the same request ID/version plus edited summary and annotations. Assert no create callback fires.

- [ ] **Step 2: Run the dialog test and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: FAIL because editable request mode does not exist.

- [ ] **Step 3: Implement edit mode**

Initialize summary from `editableRequest.summary`, exclude its ID from read-only history, change the primary action copy/callback, keep draft persistence independent, and surface stale updates through the existing error region.

- [ ] **Step 4: Run the dialog test and verify GREEN**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/components/design/EstimateDrawingPreviewDialog.test.tsx`

Expected: all dialog tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/design/EstimateDrawingPreviewDialog.tsx frontend/src/components/design/EstimateDrawingPreviewDialog.test.tsx frontend/src/features/leads/estimateDesignApi.ts
git commit -m "feat: edit existing client request in preview"
```

### Task 3: Wire the same request through both client views

**Files:**
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Modify: `frontend/src/features/estimates/ClientPlanPageReview.tsx`
- Modify: `frontend/src/features/estimates/ClientPlanPageReview.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `docs/superpowers/plans/2026-08-03-client-editable-request-summary.md`

**Interfaces:**
- Full Design selects the last open request for the page.
- Extracted preview selects the last open request targeting its drawing ID.
- Extracted updates project crop annotations into canonical page coordinates before calling the update endpoint.

- [ ] **Step 1: Write failing bidirectional UI tests**

Assert Full Design and extracted preview both prefill the same request summary and call update with the same request ID/version. Assert extracted annotations are projected to page coordinates, and Submit change request is absent while an open request exists.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: FAIL because the mapped request is only read-only history.

- [ ] **Step 3: Wire Full Design update mode**

Pass the selected page request to `ClientPlanPageReview`; call the update endpoint and invalidate plan/drawing queries.

- [ ] **Step 4: Wire extracted update mode**

Pass the request targeting the drawing to `ClientDrawingRow`; project edited crop annotations to canonical page coordinates and update that same request.

- [ ] **Step 5: Run complete verification**

Backend: `npm test && npm run typecheck && npm run build`

Frontend: `VITE_API_URL=/api/v1 npm test && npm run typecheck && npm run build`

Expected: zero failures and successful builds.

- [ ] **Step 6: Mark complete, commit, and push feature branch**

Run `git diff --check`, commit the final wiring and completed plan, then push `feature/ocr_improvements` without merging master.

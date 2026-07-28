# Client Section Review Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace large inline client section-review images with 50×50 protected thumbnails that open accessible full-image dialogs.

**Architecture:** Extend `ProtectedImage` with an optional protected-source callback while retaining ownership of blob fetching and object URL cleanup. `SectionReviewCard` reuses that source for a thumbnail and shared `Dialog`, and applies scoped semantic classes to client decisions.

**Tech Stack:** React 19, TypeScript, authenticated blob API, Vitest, Testing Library

## Global Constraints

- Target `SectionReviewCard`, the screen shown in the client Design Review grid.
- Preserve status, source-page disclosure, history, and decision behavior.
- Thumbnails must be exactly 50×50 CSS pixels.
- Do not issue a second API request when opening the full preview.
- Preserve `ProtectedImage` cleanup of object URLs.
- Approve is green; Request changes is red/orange; source disclosure and close are neutral.

---

### Task 1: Protected section thumbnail and modal

**Files:**
- Modify: `frontend/src/components/design/ProtectedImage.tsx`
- Modify: `frontend/src/components/design/SectionReviewCard.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Adds: `ProtectedImageProps.onSourceChange?: (source: string | undefined) => void`
- Consumes: shared `Dialog`
- Produces: labeled section thumbnail and modal preview

- [ ] **Step 1: Write the failing review-card test**

Stub `URL.createObjectURL` to return `blob:section-preview`. Assert the large
inline preview is replaced by:

```ts
const thumbnail = await screen.findByRole("button", {
  name: "Preview Front elevation"
});
expect(thumbnail).toHaveClass("section-review-card__thumbnail");
expect(within(thumbnail).getByRole("img")).toHaveClass(
  "section-review-card__thumbnail-image"
);
await user.click(thumbnail);
expect(screen.getByRole("dialog", {
  name: "Front elevation preview"
})).toBeVisible();
expect(screen.getByRole("img", {
  name: "Full preview of Front elevation"
})).toBeVisible();
await user.keyboard("{Escape}");
expect(thumbnail).toHaveFocus();
```

Also assert Approve uses `button--success`, Request changes uses
`button--danger`, and the source disclosure uses
`section-review-card__source-summary`.

- [ ] **Step 2: Verify RED**

Run: `cd frontend && npm test -- src/features/client/DesignSectionReview.test.tsx`

Expected: FAIL because thumbnail, modal, and semantic classes do not exist.

- [ ] **Step 3: Expose the protected object URL**

Add a callback ref to `ProtectedImage`. Notify it when an object URL loads and
with `undefined` during cleanup. Do not include the callback identity in the
fetch effect dependencies.

- [ ] **Step 4: Implement the exact review-card interaction**

Store the protected revision URL and modal-open state in `SectionReviewCard`.
Wrap the protected image in a labeled 50×50 button. Render the same object URL
as a full contain-fitted image inside `Dialog` with
`eyebrow="Section preview"` and a visible neutral Close button.

- [ ] **Step 5: Apply semantic action styles**

Use `button button--success` for Approve and `button button--danger` for Request
changes. Style the source summary as a neutral disclosure. Add exact thumbnail,
modal image, and action layout CSS.

- [ ] **Step 6: Verify GREEN and regressions**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/design/ProtectedImage.tsx \
  frontend/src/components/design/SectionReviewCard.tsx \
  frontend/src/features/client/DesignSectionReview.test.tsx \
  frontend/src/styles/index.css \
  docs/superpowers/plans/2026-07-28-client-section-review-thumbnail.md
git commit -m "fix: add client section review thumbnails"
```

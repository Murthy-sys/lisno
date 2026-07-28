# Project Source Image Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one project-level source-image modal and replace the plain design-review counts with responsive semantic status cards.

**Architecture:** `DesignSectionReview` selects the source page from the highest design version, loads it through `ProtectedImage`, and reuses that authenticated object URL in the shared `Dialog`. `SectionReviewCard` keeps only section-specific content. Existing query and decision flows remain unchanged.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, CSS

## Global Constraints

- Render exactly one “View source image” trigger beside the design-review heading.
- Select the source-page URL from the section with the highest `versionNumber`; preserve API order for ties.
- Omit the trigger when no source-page URL exists.
- Reuse the protected object URL when opening the modal.
- Keep shared dialog dismissal, focus trapping, and focus restoration behavior.
- Preserve all section thumbnail, revision-history, approval, rejection, and read-only behavior.
- Add no dependencies.

---

### Task 1: Project source modal and semantic progress cards

**Files:**
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.tsx`
- Modify: `frontend/src/components/design/SectionReviewCard.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `ProtectedImage` prop `onSourceChange?: (source: string | undefined) => void`
- Consumes: `Dialog` props `title`, `eyebrow`, and `onClose`
- Produces: a single button with accessible name `View source image`
- Produces: progress items with modifier classes `design-review__stat--approved`, `--rejected`, `--awaiting`, and `--total`

- [ ] **Step 1: Write the failing project-level source-image test**

Extend the primary review test data to include two submitted sections with
different `versionNumber` and `sourcePageUrl` values. Assert:

```tsx
expect(await screen.findAllByRole("button", { name: "View source image" })).toHaveLength(1);
expect(screen.queryByText("View source page")).not.toBeInTheDocument();

const sourceTrigger = screen.getByRole("button", { name: "View source image" });
await userEvent.click(sourceTrigger);
expect(screen.getByRole("dialog", { name: "Project source image" })).toBeVisible();
expect(screen.getByRole("img", { name: "Project source image" })).toHaveAttribute(
  "src",
  expect.stringContaining("blob:")
);

await userEvent.keyboard("{Escape}");
expect(screen.queryByRole("dialog", { name: "Project source image" })).not.toBeInTheDocument();
expect(sourceTrigger).toHaveFocus();
```

Capture protected-image requests and assert that the chosen source belongs to
the highest design version and is not fetched again when the modal opens.

- [ ] **Step 2: Write failing progress-card assertions**

Assert the existing count text remains visible and each item has its semantic
class:

```tsx
expect(screen.getByText("0 approved").closest(".design-review__stat"))
  .toHaveClass("design-review__stat--approved");
expect(screen.getByText("0 rejected").closest(".design-review__stat"))
  .toHaveClass("design-review__stat--rejected");
expect(screen.getByText("2 awaiting review").closest(".design-review__stat"))
  .toHaveClass("design-review__stat--awaiting");
expect(screen.getByText("2 total").closest(".design-review__stat"))
  .toHaveClass("design-review__stat--total");
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx
```

Expected: FAIL because repeated “View source page” controls remain, the
project-level modal trigger does not exist, and progress modifier classes are
missing.

- [ ] **Step 4: Implement the project-level source-image modal**

In `DesignSectionReview.tsx`:

- import `Image` and `X` from `lucide-react`;
- import `ProtectedImage`;
- add `sourceImageUrl` and `sourcePreviewOpen` state;
- select the first section with the highest `versionNumber` that has a
  `sourcePageUrl`;
- render one protected source thumbnail/trigger in the review header;
- use `onSourceChange={setSourceImageUrl}`;
- open a `Dialog` titled `Project source image`;
- reuse `sourceImageUrl` in the modal `<img>`;
- provide a styled “Close preview” button.

The trigger must be disabled while the protected source is loading and omitted
when no source page exists.

- [ ] **Step 5: Remove repeated source pages from section cards**

Delete the `<details>`, “View source page” summary, and source-page
`ProtectedImage` block from `SectionReviewCard.tsx`. Keep the 50×50 section
thumbnail and its preview modal unchanged.

- [ ] **Step 6: Implement semantic progress markup and CSS**

Render each count as:

```tsx
<div className="design-review__stat design-review__stat--approved">
  <strong>{progress.approved}</strong>
  <span>Approved</span>
</div>
```

Repeat with `rejected`, `awaitingReview`, and `total`. In `index.css`, use a
four-column responsive grid, subtle tinted backgrounds, matching borders and
icons/accents, prominent numeric values, and smaller labels. Collapse to two
columns on narrow screens. Remove obsolete source-summary/source-page styles
and add project source trigger/modal styles.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx
```

Expected: all design-section review tests pass.

- [ ] **Step 8: Run complete frontend verification**

Run:

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Expected: every command exits successfully with no test failures or TypeScript
errors.

- [ ] **Step 9: Commit the implementation**

```bash
git add frontend/src/features/client/DesignSectionReview.test.tsx \
  frontend/src/features/client/DesignSectionReview.tsx \
  frontend/src/components/design/SectionReviewCard.tsx \
  frontend/src/styles/index.css \
  docs/superpowers/plans/2026-07-28-project-source-image-modal.md
git diff --cached --check
git commit -m "fix: simplify client design review source preview"
```

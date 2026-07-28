# Client File Thumbnail Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show approved client image uploads as 50×50 thumbnails with an accessible modal preview and semantically styled actions.

**Architecture:** Refactor the existing `FilePreview` component to preload authenticated image blobs, reuse their object URLs for thumbnail and modal rendering, and use the shared `Dialog` for focus management and close behavior. Add narrowly scoped semantic CSS variants for preview, download, and close actions.

**Tech Stack:** React 19, TypeScript, TanStack Query data, Lucide icons, Vitest, Testing Library

## Global Constraints

- Only approved, client-visible versions already returned to `ClientProject` are rendered.
- Protected blobs must continue through the authenticated download endpoint.
- Image thumbnails are exactly 50×50 CSS pixels.
- Object URLs are revoked on replacement or unmount.
- The modal closes through button, Escape, or backdrop and restores focus.
- PDF files retain an explicit preview action; unsupported files retain Download only.

---

### Task 1: Accessible thumbnail and modal preview

**Files:**
- Modify: `frontend/src/components/ui/FilePreview.tsx`
- Modify: `frontend/src/components/ui/Dialog.tsx`
- Modify: `frontend/src/features/client/ClientProject.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `apiClient.getBlob("/design-versions/:id/download")`
- Consumes: `Dialog`
- Produces: image thumbnail button, protected image/PDF modal, semantic action variants

- [ ] **Step 1: Write failing image thumbnail/modal tests**

Add an approved PNG fixture to the existing client-project test response. Return
an authenticated image blob for its download endpoint. Assert:

```ts
const thumbnail = await screen.findByRole("button", {
  name: "Preview Elevation.png"
});
expect(thumbnail).toHaveClass("file-preview__thumbnail");
expect(within(thumbnail).getByRole("img")).toHaveClass(
  "file-preview__thumbnail-image"
);
await user.click(thumbnail);
expect(screen.getByRole("dialog", { name: "Elevation.png" })).toBeVisible();
expect(screen.getByRole("img", {
  name: "Preview of Elevation.png"
})).toBeVisible();
await user.keyboard("{Escape}");
expect(screen.queryByRole("dialog", { name: "Elevation.png" })).not.toBeInTheDocument();
expect(thumbnail).toHaveFocus();
```

- [ ] **Step 2: Write failing semantic-action assertions**

Assert that PDF Preview uses `button--preview`, Download uses
`button--download`, and the visible modal close action uses `button--close`.

- [ ] **Step 3: Verify RED**

Run: `cd frontend && npm test -- src/features/client/ClientProject.test.tsx`

Expected: FAIL because thumbnails, modal rendering, and semantic variants do
not exist.

- [ ] **Step 4: Extend Dialog copy**

Add an optional `eyebrow` prop defaulting to `Designer workflow`, then pass
`eyebrow="File preview"` from `FilePreview`. Preserve all existing focus trap,
Escape, backdrop, and focus restoration behavior.

- [ ] **Step 5: Implement protected thumbnail loading**

For image MIME types, fetch the authenticated blob on mount, create one object
URL, and render it inside a labeled 50×50 thumbnail button. Revoke the URL on
unmount. Keep an inline error message if thumbnail loading fails.

- [ ] **Step 6: Implement shared modal preview**

Open the dialog immediately from a loaded image thumbnail. For PDFs, fetch on
Preview and open the dialog after the blob is available. Render a contain-fitted
image or iframe and a visible `Close preview` button.

- [ ] **Step 7: Add semantic actions and CSS**

Use Lucide `Eye`, `Download`, and `X` icons where appropriate. Add
`button--preview`, `button--download`, `button--close`,
`file-preview__thumbnail`, and modal content classes. Set thumbnail width and
height to exactly `50px`.

- [ ] **Step 8: Verify GREEN and regressions**

Run:

```bash
cd frontend
npm test -- src/features/client/ClientProject.test.tsx
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ui/FilePreview.tsx \
  frontend/src/components/ui/Dialog.tsx \
  frontend/src/features/client/ClientProject.test.tsx \
  frontend/src/styles/index.css \
  docs/superpowers/plans/2026-07-28-client-file-thumbnail-preview.md
git commit -m "feat: add client image thumbnail previews"
```

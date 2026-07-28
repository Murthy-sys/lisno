# Client Sidebar Colors and Compact Review Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the client project page to the sidebar navy/purple palette and reduce active section-image height without changing behavior.

**Architecture:** Add an explicit theme marker to the existing client-project root and scope the palette to that root plus the existing client review modifier. Keep component structure, data flow, typography, queue behavior, and dialogs unchanged; compactness is implemented entirely through scoped CSS.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS

## Global Constraints

- Change only colors and section-card compactness.
- Keep all layout hierarchy, typography, content, queries, actions, navigation, images, and dialogs unchanged.
- Use `var(--color-lisno-navy)`, `#7057ff`, and light lavender-blue supporting surfaces.
- Preserve approved green, rejected red, awaiting amber, and total blue/purple semantics.
- Scope changes to the client project and client design review; do not alter manager, dashboard, designer, head, or authentication views.
- Active section images are `12rem` high on desktop and `10rem` on mobile.
- Keep `object-fit: contain` and the existing full-size preview modal.
- Do not change approved-document 50×50 thumbnails.
- Add no dependencies or backend changes.

---

### Task 1: Sidebar palette and compact section cards

**Files:**
- Modify: `frontend/src/features/client/ClientProject.tsx`
- Modify: `frontend/src/features/client/ClientProject.test.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/features/manager/ManagementProjectWorkspace.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Produces: `data-theme="sidebar"` on the `.client-page--project` root
- Consumes: existing `.design-review--client` mode class
- Produces: client-only `12rem` desktop and `10rem` mobile review image sizing

- [ ] **Step 1: Write the failing theme-isolation test**

In `ClientProject.test.tsx`, assert:

```tsx
const projectPage = await screen.findByRole("region", { name: "Aurora Villa" });
expect(projectPage).toHaveAttribute("data-theme", "sidebar");
```

In `ManagementProjectWorkspace.test.tsx`, retain the current project-theme
isolation assertion and add:

```tsx
expect(screen.getByRole("region", { name: /design review/i }).closest('[data-theme="sidebar"]'))
  .toBeNull();
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd frontend
npm test -- src/features/client/ClientProject.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx
```

Expected: the client-project assertion fails because the explicit sidebar
theme marker is absent.

- [ ] **Step 3: Add the explicit client theme marker**

Change the `ClientProject` root to:

```tsx
<section
  className="client-page client-page--project"
  data-theme="sidebar"
  aria-labelledby="client-project-title"
>
```

Do not change any child structure or behavior.

- [ ] **Step 4: Replace only client-project colors**

In `index.css`, keep existing selector structure but replace the warm palette
under `.client-page--project[data-theme="sidebar"]`:

- page background: light lavender-blue;
- project hero: navy-to-deep-purple gradient using
  `var(--color-lisno-navy)` and `#302472`;
- accents, links, progress, and focus: `#7057ff`;
- cards: white or pale lavender-blue;
- borders: muted lavender;
- primary text: sidebar navy;
- secondary text: muted blue-gray.

Keep all font-family, font-size, spacing, grid, and responsive declarations
unchanged.

Under `.client-page--project .design-review--client`, update warm review
surfaces, source trigger, client comment, navigation accents, zoom affordance,
and focus rings to the same navy/purple family. Do not change the semantic
green/red/amber status card colors.

- [ ] **Step 5: Compact the active review card**

Only in client review selectors:

```css
.client-page--project .design-review--client .section-review-card {
  gap: 0.75rem;
  padding: 1rem;
}

.client-page--project .design-review--client .section-review-card__body {
  gap: 1rem;
}

.client-page--project .design-review--client .section-review-card__image-trigger,
.client-page--project .design-review--client .section-review-card__image {
  min-height: 12rem;
  height: 12rem;
}

@media (max-width: 800px) {
  .client-page--project .design-review--client .section-review-card__image-trigger,
  .client-page--project .design-review--client .section-review-card__image {
    min-height: 10rem;
    height: 10rem;
  }
}
```

Retain `object-fit: contain`. Do not edit `.file-preview__thumbnail`.

- [ ] **Step 6: Verify client and manager behavior**

Run:

```bash
cd frontend
npm test -- src/features/client/ClientProject.test.tsx \
  src/features/client/DesignSectionReview.test.tsx \
  src/features/manager/ManagementProjectWorkspace.test.tsx
npm run typecheck
npm run build
```

Expected: all focused tests pass, TypeScript exits successfully, and Vite
builds production assets.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/client/ClientProject.tsx \
  frontend/src/features/client/ClientProject.test.tsx \
  frontend/src/features/client/DesignSectionReview.test.tsx \
  frontend/src/features/manager/ManagementProjectWorkspace.test.tsx \
  frontend/src/styles/index.css \
  docs/superpowers/plans/2026-07-28-client-sidebar-colors-compact-cards.md
git diff --cached --check
git commit -m "style: align compact client review with sidebar"
```

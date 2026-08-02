# Ask Lisno Right-Rail Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Ask Lisno as an independent disabled AI-chat launcher anchored at the bottom of the client estimate right rail, outside the Full Design card.

**Architecture:** `ClientFullPlanNav` owns only page navigation. A focused `AskLisnoLauncher` sibling is rendered by `EstimateReviewPanel` inside a new sticky right-rail wrapper; responsive CSS converts that wrapper to normal flow on narrow screens.

**Tech Stack:** React 19, TypeScript, Lucide React, CSS, Vitest, Testing Library

## Global Constraints

- Do not change APIs, persistence, or chat behavior.
- Use the existing icon library for the bot/chat icon.
- The launcher is disabled and exposes the accessible name `Ask Lisno`.
- Every uploaded design page remains reachable and unobstructed.

---

### Task 1: Separate the launcher from Full Design

**Files:**
- Create: `frontend/src/features/estimates/AskLisnoLauncher.tsx`
- Modify: `frontend/src/features/estimates/ClientFullPlanNav.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Test: `frontend/src/features/estimates/ClientFullPlanNav.test.tsx`
- Test: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

**Interfaces:**
- Produces: `AskLisnoLauncher(): JSX.Element`, a disabled button with accessible name `Ask Lisno`.
- Consumes: `ClientFullPlanNav` unchanged public props; `EstimateReviewPanel` composes both right-rail children.

- [x] **Step 1: Write failing component and composition tests**

```tsx
expect(screen.queryByRole("button", { name: "Ask Lisno" })).not.toBeInTheDocument();
expect(within(rightRail).getByRole("button", { name: "Ask Lisno" })).toBeDisabled();
expect(within(fullDesign).queryByRole("button", { name: "Ask Lisno" })).not.toBeInTheDocument();
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientFullPlanNav.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: FAIL because Ask Lisno remains inside `ClientFullPlanNav` and no right-rail wrapper/launcher exists.

- [x] **Step 3: Implement the launcher and parent composition**

```tsx
import { BotMessageSquare } from "lucide-react";

export function AskLisnoLauncher() {
  return (
    <button className="ask-lisno-launcher" type="button" aria-label="Ask Lisno" disabled>
      <BotMessageSquare aria-hidden="true" />
      <span><strong>Ask Lisno</strong><small>Coming soon</small></span>
    </button>
  );
}
```

Remove `.client-plan-nav__ask` from `ClientFullPlanNav`. In `EstimateReviewPanel`, render:

```tsx
<aside className="client-estimate-workspace__rail" aria-label="Design tools">
  <ClientFullPlanNav {...planNavigationProps} />
  <AskLisnoLauncher />
</aside>
```

- [x] **Step 4: Run the focused tests and verify GREEN**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/ClientFullPlanNav.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: all focused tests PASS.

### Task 2: Anchor the independent launcher safely

**Files:**
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

**Interfaces:**
- Consumes: `.client-estimate-workspace__rail` and `.ask-lisno-launcher` from Task 1.
- Produces: sticky desktop right rail, bottom-aligned launcher, and narrow-screen normal flow.

- [x] **Step 1: Write failing CSS regression assertions**

```tsx
expect(railRule).toMatch(/position:\s*sticky/);
expect(railRule).toMatch(/min-height:\s*calc\(100vh\s*-\s*2rem\)/);
expect(launcherRule).toMatch(/margin-top:\s*auto/);
expect(mobileRailRule).toMatch(/position:\s*static/);
expect(mobileRailRule).toMatch(/min-height:\s*0/);
```

- [x] **Step 2: Run the CSS regression test and verify RED**

Run: `VITE_API_URL=/api/v1 npm test -- --run src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

Expected: FAIL because the right-rail and launcher rules do not exist.

- [x] **Step 3: Implement desktop and mobile layout rules**

```css
.client-estimate-workspace__rail {
  display: flex;
  flex-direction: column;
  grid-column: 2;
  grid-row: 1;
  gap: 1rem;
  position: sticky;
  top: 1rem;
  min-height: calc(100vh - 2rem);
}

.ask-lisno-launcher { margin-top: auto; }

@media (max-width: 760px) {
  .client-estimate-workspace__rail {
    grid-column: 1;
    position: static;
    min-height: 0;
  }
}
```

Move sticky/grid placement responsibility from `.client-plan-nav` to the rail wrapper. Style the launcher using existing navy/violet tokens, a real Lucide icon, a 44px minimum target, and visible disabled state without overlap.

- [x] **Step 4: Run focused and full verification**

Run: `VITE_API_URL=/api/v1 npm test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: 233 or more tests PASS; typecheck and build exit 0.

- [x] **Step 5: Commit and push the implementation**

```bash
git add frontend/src/features/estimates/AskLisnoLauncher.tsx frontend/src/features/estimates/ClientFullPlanNav.tsx frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/ClientFullPlanNav.test.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx frontend/src/styles/index.css docs/superpowers/plans/2026-08-03-ask-lisno-rail-launcher.md
git commit -m "feat: separate Ask Lisno rail launcher"
git push origin feature/ocr_improvements
```

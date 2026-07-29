# Collapsible Client Estimate Cards Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Make every estimate card on the client dashboard an independent, initially collapsed expansion panel whose summary contains only the project name and total amount.

**Architecture:** Extract the mapped estimate article into a small `EstimateReviewCard` component so each card can own its disclosure state without storing an ID map in the parent. Apply disclosure behavior only when `role === "client"`; manager and designer cards retain their current always-expanded workflow. Keep the existing section-level `<details>` UI inside the expanded client content.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Testing Library, CSS

---

### Task 1: Add failing disclosure tests

**Files:**
- Create: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Reference: `frontend/src/features/client/ClientDashboard.test.tsx`
- Reference: `frontend/src/test/render.tsx`

**Step 1: Create client and manager API fixtures**

Build two client estimates in the new test:

- `estimate-ready`, project `Aurora Villa`, total `118000`, status `sent_to_client`
- `estimate-approved`, project `Cedar Loft`, total `236000`, status `client_approved`

Include a valid catalogue line item on the ready estimate so the expanded section breakdown can be asserted. Mock:

- `GET /api/v1/auth/me`
- `GET /api/v1/client/project-summaries?...`
- `GET /api/v1/client/latest-approved-versions`
- `GET /api/v1/client/estimates`

Use the existing `tokenStorage`, `renderApp`, and fetch-mocking patterns.

**Step 2: Write the client disclosure test**

Render `/client` and assert:

- Both project headings and formatted totals are visible.
- Location, client name, item count, estimate breakdown, status, note field, and decision buttons are initially absent.
- Each project has an independent toggle with `aria-expanded="false"` and a unique `aria-controls`.
- Expanding `Aurora Villa` reveals only its details, note, and decision controls.
- Expanding `Cedar Loft` reveals its completed status without collapsing `Aurora Villa`.
- Collapsing `Aurora Villa` hides its details while the `Cedar Loft` status remains visible.

Use the controlled panel IDs with `within(...)` when assertions could otherwise match both cards.

**Step 3: Write the non-client regression test**

Render `/manager` with a `pending_manager_assignment` estimate and mock:

- `GET /api/v1/auth/me`
- `GET /api/v1/estimates/review-queue`
- `GET /api/v1/estimates/designers`

Assert the project metadata and assignment control are immediately visible and there is no project disclosure toggle.

**Step 4: Run the focused test and confirm RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
```

Expected: FAIL because client estimate details and actions are currently rendered immediately and no estimate-level disclosure buttons exist.

### Task 2: Extract the estimate card and implement client-only disclosure

**Files:**
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`

**Step 1: Import the disclosure icon**

Import `ChevronDown` from the icon package already used by the frontend.

**Step 2: Replace the inline mapped article**

Keep query and mutation ownership in `EstimateReviewPanel`, but render one `EstimateReviewCard` per queue item. Pass:

- `estimate`
- `role`
- `actionable`
- designer options and selected designer ID
- note value
- mutation pending state
- callbacks for designer changes, note changes, and actions

The callbacks continue updating the existing parent maps and calling the existing mutation.

**Step 3: Give each card local disclosure state**

Inside `EstimateReviewCard`, add:

```tsx
const [clientExpanded, setClientExpanded] = useState(false);
const isClient = role === "client";
const detailsId = `client-estimate-${estimate.id}-details`;
const headingId = `client-estimate-${estimate.id}-title`;
```

For client cards, render a compact summary row containing only:

- An `h3` with the project name
- The formatted total
- A toggle button labelled by the heading, with `aria-expanded`, `aria-controls`, and the chevron

Render all other client content inside the controlled region only when `clientExpanded` is true:

- Location and client name
- Included item count
- `ClientEstimateDetails`
- Completed status notice, when applicable
- Review note and decision actions, when actionable

Keep the panel mounted only while expanded so collapsed content is absent from keyboard navigation and accessibility queries.

For manager and designer roles, render the existing card content directly with no disclosure state or toggle. Preserve all existing assignment, note, and action behavior.

**Step 4: Run the focused test**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
```

Expected: PASS.

### Task 3: Style the estimate expansion panel

**Files:**
- Modify: `frontend/src/styles.css`

**Step 1: Add client summary styles**

Add client-specific selectors near the existing `.estimate-review-card` rules:

```css
.estimate-review-card--client {
  gap: 0;
}

.estimate-review-card__client-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
}

.estimate-review-card__toggle {
  display: inline-grid;
  place-items: center;
}

.estimate-review-card__toggle svg {
  transition: transform 160ms ease;
}

.estimate-review-card__toggle[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.estimate-review-card__client-content {
  display: grid;
  gap: 0.75rem;
  padding-top: 0.75rem;
}
```

Match existing border, button, focus, spacing, and color conventions rather than introducing a second card style. Ensure the title can shrink and wrap without pushing the amount or toggle outside the card.

**Step 2: Verify responsive behavior**

Check existing mobile media queries. If needed, let the summary grid wrap or reduce its gap while keeping the total and toggle visible.

**Step 3: Re-run the focused test**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
```

Expected: PASS.

### Task 4: Update the approved-estimate dashboard regression

**Files:**
- Modify: `frontend/src/features/client/ClientDashboard.test.tsx`

**Step 1: Update the completed-history test**

In `shows an approved estimate as completed history without decision buttons`:

- First assert the project name and amount are visible while `Estimate approved` is hidden.
- Click the `Aurora Villa` estimate toggle.
- Assert `Estimate approved` is visible.
- Keep the existing assertions that decision buttons are absent.

This preserves the intent of the test while reflecting the new collapsed initial state.

**Step 2: Run affected tests**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/client/ClientDashboard.test.tsx
```

Expected: PASS.

### Task 5: Verify and commit

**Files:**
- Verify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Verify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Verify: `frontend/src/features/client/ClientDashboard.test.tsx`
- Verify: `frontend/src/styles.css`

**Step 1: Run frontend verification**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build
```

Use the `VITE_API_URL` override because the developer's local `frontend/.env` points at an absolute backend URL while the test mocks use `/api/v1`.

Expected: all commands exit successfully.

**Step 2: Inspect the final diff**

```bash
git diff --check
git status --short
git diff -- frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx frontend/src/features/client/ClientDashboard.test.tsx frontend/src/styles.css
```

Confirm that only the planned client disclosure behavior, tests, and styles changed.

**Step 3: Commit**

```bash
git add frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx frontend/src/features/client/ClientDashboard.test.tsx frontend/src/styles.css
git commit -m "feat: add collapsible client estimate cards"
```


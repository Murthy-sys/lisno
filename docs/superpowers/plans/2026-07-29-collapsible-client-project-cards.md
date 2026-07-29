# Collapsible Client Project Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every client project card start collapsed and expand independently to reveal its existing details and actions.

**Architecture:** `ClientProjectCard` will own a local `expanded` boolean, expose it through an accessible header button, and render its existing detail panel only when expanded. `ClientDashboard` will continue to own data fetching; no API, persistence, or cross-card accordion state will be added.

**Tech Stack:** React 19, TypeScript, React Router, Lucide React, Vitest, Testing Library, CSS

## Global Constraints

- Every project starts collapsed.
- The collapsed header always shows project name, location, completion progress, and floor count.
- Multiple projects may be expanded simultaneously.
- Expansion state does not persist across page reloads.
- The toggle must expose `aria-expanded` and `aria-controls`.
- The controlled panel ID must be stable and project-specific.
- Existing latest-update loading, empty, retry, and navigation behavior must remain unchanged.
- Preserve unrelated working-tree changes and stage only feature-specific hunks.

---

### Task 1: Add independently collapsible client project cards

**Files:**
- Create: `frontend/src/features/client/ClientDashboard.collapsible.test.tsx`
- Modify: `frontend/src/features/client/ClientDashboard.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `ClientProjectSummary`, `ClientDesignVersion`, the existing `latest`, `loading`, `failed`, and `onRetry` card props.
- Produces: an accessible button named by the project heading, `aria-expanded: boolean`, `aria-controls: "client-project-<project.id>-details"`, and a conditionally rendered details panel with that ID.

- [ ] **Step 1: Create the failing interaction test**

Create `frontend/src/features/client/ClientDashboard.collapsible.test.tsx` with a two-project client-dashboard fixture. Match API URLs by suffix or contained path so the test works with both the default relative API URL and `VITE_API_URL=http://localhost:3000/api/v1`.

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const client = {
  id: "client-1",
  name: "Aurora Homes",
  email: "client@lisno.example",
  role: "client" as const
};

const summaries = [
  {
    id: "project-villa",
    name: "Aurora Villa",
    status: "active",
    location: "Bengaluru",
    plannedStartAt: "2026-06-01T00:00:00.000Z",
    plannedEndAt: "2026-09-30T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    progress: 64,
    floorCount: 3
  },
  {
    id: "project-loft",
    name: "Cedar Loft",
    status: "planning",
    location: "Mysuru",
    plannedStartAt: "2026-07-01T00:00:00.000Z",
    plannedEndAt: "2026-10-30T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    progress: 0,
    floorCount: 1
  }
];

function installClientDashboardApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/me")) {
      return Response.json({ data: client });
    }
    if (url.includes("/api/v1/client/project-summaries?")) {
      return Response.json({
        data: {
          items: summaries,
          pagination: { limit: 100, offset: 0, total: 2, hasMore: false }
        }
      });
    }
    if (url.endsWith("/api/v1/client/latest-approved-versions")) {
      return Response.json({
        data: [{
          id: "version-villa",
          projectId: "project-villa",
          floorId: "floor-1",
          stageId: "stage-1",
          taskId: null,
          versionNumber: 2,
          originalFilename: "Villa floor plan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          uploadedAt: "2026-07-12T00:00:00.000Z",
          approvalStatus: "approved",
          approvedAt: "2026-07-14T00:00:00.000Z",
          clientVisible: true,
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }]
      });
    }
    if (url.endsWith("/api/v1/client/estimates")) {
      return Response.json({ data: [] });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("collapsible client project cards", () => {
  it("starts collapsed and toggles projects independently", async () => {
    tokenStorage.set("client-token");
    installClientDashboardApi();
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaToggle = await screen.findByRole("button", {
      name: /Aurora Villa/
    });
    const loftToggle = screen.getByRole("button", { name: /Cedar Loft/ });

    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open project" })).not.toBeInTheDocument();

    await user.click(villaToggle);

    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    const villaPanel = document.getElementById(
      villaToggle.getAttribute("aria-controls")!
    )!;
    expect(villaPanel).toBeVisible();
    expect(within(villaPanel).getByText("Villa floor plan.pdf")).toBeVisible();
    expect(within(villaPanel).getByRole("link", {
      name: "Open project"
    })).toHaveAttribute("href", "/client/projects/project-villa");

    await user.click(loftToggle);
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(villaToggle);
    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/features/client/ClientDashboard.collapsible.test.tsx
```

Expected: FAIL because no project-card toggle button with `aria-expanded` exists and current card details render immediately.

- [ ] **Step 3: Implement local disclosure state and accessible markup**

In `frontend/src/features/client/ClientDashboard.tsx`:

1. Import `useState` from React and `ChevronDown` from `lucide-react`.
2. Keep the existing card props and data flow unchanged.
3. Replace the card's always-open body with this structure:

```tsx
function ClientProjectCard({
  project,
  latest,
  loading,
  failed,
  onRetry
}: {
  project: ClientProjectSummary;
  latest: ClientDesignVersion | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `client-project-${project.id}-details`;
  const floorLabel = `${project.floorCount} ${
    project.floorCount === 1 ? "floor" : "floors"
  }`;

  return (
    <article className="client-project-card">
      <button
        type="button"
        className="client-project-card__toggle"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="client-project-card__identity">
          <span className="eyebrow">{project.location}</span>
          <h2>{project.name}</h2>
        </span>
        <span className="client-project-card__summary">
          <strong>{project.progress}% complete</strong>
          <span>{floorLabel}</span>
          <ChevronDown
            aria-hidden="true"
            className={expanded ? "is-expanded" : undefined}
          />
        </span>
      </button>

      {expanded ? (
        <div id={detailsId} className="client-project-card__details">
          <p>Expected completion: {formatDate(project.plannedEndAt)}</p>
          <div className="client-project-card__update">
            <span>Latest approved update</span>
            {loading ? (
              <strong>Loading approved plans…</strong>
            ) : failed ? (
              <>
                <strong>Latest approved update unavailable.</strong>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={onRetry}
                >
                  Retry approved updates
                </button>
              </>
            ) : latest ? (
              <strong>{latest.originalFilename}</strong>
            ) : (
              <strong>No approved plan available yet.</strong>
            )}
          </div>
          <Link
            className="button button--primary"
            to={`/client/projects/${project.id}`}
          >
            Open project
          </Link>
        </div>
      ) : null}
    </article>
  );
}
```

Do not add persisted state or dashboard-wide accordion state.

- [ ] **Step 4: Style collapsed, expanded, focus, and responsive states**

Update the existing client project-card block in
`frontend/src/styles/index.css`. Remove the fixed `min-height: 18rem` from
`.client-project-card` and add:

```css
.client-project-card {
  overflow: hidden;
  padding: 0;
}

.client-project-card__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 1.25rem 1.5rem;
  text-align: left;
  cursor: pointer;
}

.client-project-card__toggle:hover {
  background: var(--surface-muted, #f8fafc);
}

.client-project-card__toggle:focus-visible {
  outline: 3px solid var(--focus, #6757c8);
  outline-offset: -3px;
}

.client-project-card__identity {
  display: grid;
  gap: 0.25rem;
}

.client-project-card__identity h2,
.client-project-card__identity .eyebrow {
  margin: 0;
}

.client-project-card__summary {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  white-space: nowrap;
}

.client-project-card__summary svg {
  transition: transform 160ms ease;
}

.client-project-card__summary svg.is-expanded {
  transform: rotate(180deg);
}

.client-project-card__details {
  display: grid;
  gap: 0.75rem;
  border-top: 1px solid var(--line, #e2e8f0);
  padding: 1rem 1.5rem 1.5rem;
}

@media (max-width: 640px) {
  .client-project-card__toggle,
  .client-project-card__summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .client-project-card__summary {
    gap: 0.35rem;
  }
}
```

Keep the existing `.client-project-card__update` styling. Confirm that the
expanded details, retry button, and project link still use existing shared
button styles.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/features/client/ClientDashboard.collapsible.test.tsx
```

Expected: PASS with one passing test.

- [ ] **Step 6: Update affected legacy expectations**

Run the existing client-dashboard test:

```bash
cd frontend
npm test -- --run src/features/client/ClientDashboard.test.tsx
```

For cases that assert expanded-only content, select the relevant project toggle
before asserting. For example:

```tsx
await userEvent.click(
  await screen.findByRole("button", { name: /Aurora Villa/ })
);
expect(await screen.findByText("Villa floor plan.pdf")).toBeVisible();
```

In the retry test, expand both project cards before looking for their retry
messages:

```tsx
await userEvent.click(
  await screen.findByRole("button", { name: /Aurora Villa/ })
);
await userEvent.click(screen.getByRole("button", { name: /Cedar Loft/ }));
expect(await screen.findAllByText(
  "Latest approved update unavailable."
)).toHaveLength(2);
```

Also normalize those existing fetch stubs to `endsWith(...)` or `includes(...)`
when the local `VITE_API_URL` makes requests absolute. Do not change their
asserted business behavior.

- [ ] **Step 7: Run frontend verification**

Run:

```bash
cd frontend
npm test
npm run typecheck
npm run build
cd ..
git diff --check
```

Expected:

- all frontend test files pass;
- TypeScript exits with status 0;
- Vite production build exits with status 0; and
- `git diff --check` prints no errors.

- [ ] **Step 8: Review and commit only the feature changes**

Inspect the diff:

```bash
git diff -- frontend/src/features/client/ClientDashboard.tsx \
  frontend/src/features/client/ClientDashboard.collapsible.test.tsx \
  frontend/src/features/client/ClientDashboard.test.tsx \
  frontend/src/styles/index.css
```

Because `ClientDashboard.test.tsx` and `index.css` already contain unrelated
working-tree edits, stage only this feature's hunks:

```bash
git add frontend/src/features/client/ClientDashboard.tsx \
  frontend/src/features/client/ClientDashboard.collapsible.test.tsx
git add -p frontend/src/features/client/ClientDashboard.test.tsx \
  frontend/src/styles/index.css
git diff --cached --check
git commit -m "feat: add collapsible client project cards"
```

Expected: the commit contains the disclosure component, its tests, the affected
legacy-test adjustments, and only the relevant CSS hunks.

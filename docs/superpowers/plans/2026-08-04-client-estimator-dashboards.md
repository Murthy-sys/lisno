# Client and Estimator Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visibly redesign the Client and Estimator/Sales dashboard routes while preserving every existing API call, interaction, and route destination.

**Architecture:** Keep each dashboard independent: `ClientDashboard.tsx` imports a new route-scoped Client stylesheet, while `LeadDashboard.tsx` imports a new route-scoped Estimator stylesheet. Derive summary values synchronously from existing React Query results; introduce no new network request or persistent state. Existing feature components such as `EstimateReviewPanel`, `DownloadButton`, and `LeadCreateDialog` remain behavior owners.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Vitest, Testing Library, route-scoped CSS using the existing Lisno semantic tokens.

## Global Constraints

- Modify only `/client` and `/estimator-sales` dashboard presentation; Client project, lead-detail, and estimate-workspace routes are out of scope.
- Do not change backend code, API clients, query keys, data types, schemas, permissions, or route destinations.
- Preserve Client project expansion/retry/open behavior and Estimator search/filter/export/dialog/navigation behavior.
- Use the existing midnight, porcelain, violet, status, spacing, radius, and focus tokens; introduce no gradients or new dependencies.
- Keep one route-owned `h1`, ordered section headings, textual status labels, visible focus, and interactive targets of at least 44×44px.
- Desktop layouts must stack without horizontal overflow below 720px and retain all actions and identity text.
- Tests must use `VITE_API_URL=/api/v1` because the developer-local `.env` points at an absolute API URL.

---

### Task 1: Redesign the Client dashboard

**Files:**

- Modify: `frontend/src/features/client/ClientDashboard.tsx`
- Modify: `frontend/src/features/client/ClientDashboard.test.tsx`
- Verify: `frontend/src/features/client/ClientDashboard.collapsible.test.tsx`
- Create: `frontend/src/styles/client-dashboard.css`

**Interfaces:**

- Consumes: `ClientProjectSummary[]` from `getClientProjectSummaries()` and `ClientDesignVersion[]` from `getClientLatestApprovedVersions()`.
- Produces: the unchanged `ClientDashboard` export and the existing `/client/projects/:projectId` links.
- Preserves: `EstimateReviewPanel`, `latestForProject()`, project toggle IDs, retry callback, and `aria-expanded`/`aria-controls` behavior.

- [ ] **Step 1: Add failing dashboard hierarchy and metric assertions**

Extend the existing “shows multiple client projects” test after the `h1` assertion:

```tsx
const overview = screen.getByRole("region", { name: "Client overview" });
expect(within(overview).getByText("Shared projects")).toBeVisible();
expect(within(overview).getByText("2", { selector: "dd" })).toBeVisible();
expect(within(overview).getByText("Average progress")).toBeVisible();
expect(within(overview).getByText("32%", { selector: "dd" })).toBeVisible();
expect(within(overview).getByText("Approved plans")).toBeVisible();
expect(within(overview).getByText("1", { selector: "dd" })).toBeVisible();
expect(screen.getByRole("heading", { name: "Projects", level: 2 })).toBeVisible();
```

Import `within` from Testing Library. Add an assertion that the Aurora Villa card includes visible `Active` status text while the existing internal-information exclusion remains unchanged.

- [ ] **Step 2: Run the Client dashboard test and observe RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/client/ClientDashboard.test.tsx
```

Expected: FAIL because the `Client overview` region, metrics, `Projects` section heading, and status label do not exist.

- [ ] **Step 3: Add derived Client summary values and semantic structure**

In `ClientDashboard.tsx`, import `../../styles/client-dashboard.css`. After the query guards, derive:

```tsx
const approvedPlans = (latestQuery.data ?? []).filter(
  (version) => version.approvalStatus === "approved" && version.clientVisible
).length;
const averageProgress = projects.length
  ? Math.round(projects.reduce((total, project) => total + project.progress, 0) / projects.length)
  : 0;
```

Use this structure while retaining the existing `EstimateReviewPanel` and card mapping:

```tsx
<section className="client-page client-dashboard" aria-labelledby="client-dashboard-title">
  <header className="workspace-header client-dashboard__hero">
    <div>
      <p className="eyebrow">Client portal</p>
      <h1 id="client-dashboard-title">Your design plans</h1>
      <p>Follow your projects and view plans once they are approved for sharing.</p>
    </div>
    <span className="client-dashboard__hero-count">
      <strong>{projects.length}</strong>
      <span>{projects.length === 1 ? "project shared" : "projects shared"}</span>
    </span>
  </header>
  <section className="client-dashboard__overview" aria-label="Client overview">
    <dl>
      <div><dt>Shared projects</dt><dd>{projects.length}</dd></div>
      <div><dt>Average progress</dt><dd>{averageProgress}%</dd></div>
      <div><dt>Approved plans</dt><dd>{latestQuery.isPending ? "—" : approvedPlans}</dd></div>
    </dl>
  </section>
  <section className="client-dashboard__estimates" aria-label="Estimate review">
    <EstimateReviewPanel />
  </section>
  <section className="client-dashboard__projects" aria-labelledby="client-projects-title">
    <header className="client-dashboard__section-heading">
      <div><p className="eyebrow">Project workspace</p><h2 id="client-projects-title">Projects</h2></div>
      <span>{projects.length} total</span>
    </header>
    {/* Existing project grid or empty state */}
  </section>
</section>
```

Add a textual status badge inside each `client-project-card__identity`:

```tsx
<span className={`client-project-card__status client-project-card__status--${project.status}`}>
  {project.status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())}
</span>
```

Do not move the heading inside the toggle; preserve the tested independent heading/toggle structure.

- [ ] **Step 4: Create the route-scoped Client stylesheet**

Create `frontend/src/styles/client-dashboard.css` with route-specific selectors:

```css
.client-dashboard { gap: var(--space-6); }
.client-dashboard__hero {
  align-items: end;
  border-bottom: 1px solid var(--color-border);
  padding-block-end: var(--space-6);
}
.client-dashboard__hero-count {
  display: grid;
  min-inline-size: 10rem;
  padding: var(--space-4);
  border-radius: var(--radius-surface);
  color: var(--color-surface);
  background: var(--color-brand-midnight);
}
.client-dashboard__hero-count strong { font: 700 2rem/1 var(--font-editorial); }
.client-dashboard__hero-count span { color: color-mix(in srgb, var(--color-surface) 72%, transparent); }
.client-dashboard__overview dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}
.client-dashboard__overview dl > div {
  display: grid;
  gap: var(--space-2);
  min-block-size: 7rem;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-surface);
  background: var(--color-surface);
}
.client-dashboard__overview dt { color: var(--color-text-muted); font-weight: 700; }
.client-dashboard__overview dd { margin: 0; color: var(--color-text); font: 700 2rem/1 var(--font-editorial); }
.client-dashboard__section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-block-end: var(--space-4);
}
.client-dashboard__section-heading h2 { margin: 0; }
.client-dashboard .client-project-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.client-dashboard .client-project-card { border-color: var(--color-border); box-shadow: var(--shadow-soft); }
.client-project-card__status { inline-size: max-content; padding: .25rem .55rem; border-radius: var(--radius-pill); font: var(--type-metadata); font-weight: 800; text-transform: capitalize; }
.client-project-card__status--active { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface)); }
.client-project-card__status--planning { color: var(--color-info); background: color-mix(in srgb, var(--color-info) 12%, var(--color-surface)); }
@media (max-width: 720px) {
  .client-dashboard__hero { align-items: stretch; }
  .client-dashboard__hero-count { min-inline-size: 0; }
  .client-dashboard__overview dl,
  .client-dashboard .client-project-grid { grid-template-columns: 1fr; }
  .client-dashboard__section-heading { align-items: flex-start; flex-direction: column; }
}
```

Every custom property in this block is defined in `frontend/src/styles/tokens.css`; do not add dashboard-only tokens.

- [ ] **Step 5: Run focused Client tests GREEN**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/test/accessibility.test.tsx
```

Expected: all tests pass; existing expansion, retry, internal-data exclusion, and accessibility cases remain green.

- [ ] **Step 6: Commit the Client dashboard**

```bash
git add frontend/src/features/client/ClientDashboard.tsx frontend/src/features/client/ClientDashboard.test.tsx frontend/src/styles/client-dashboard.css
git diff --cached --check
git commit -m "feat: redesign client dashboard"
```

---

### Task 2: Redesign the Estimator/Sales dashboard

**Files:**

- Modify: `frontend/src/features/leads/LeadDashboard.tsx`
- Create: `frontend/src/features/leads/LeadDashboard.test.tsx`
- Verify: `frontend/src/features/leads/LeadDashboard.pdf.test.tsx`
- Create: `frontend/src/styles/estimator-dashboard.css`

**Interfaces:**

- Consumes: `PaginatedData<Lead>` from `getLeadPage(search, stage)` and `SavedEstimate[]` from `getSavedEstimates()`.
- Produces: the unchanged `LeadDashboard` export, `/estimator-sales/leads/:leadId` links, and `/estimator-sales/leads/:leadId/estimate` links.
- Preserves: `LeadCreateDialog`, per-card `DownloadButton`, search/stage query state, status labels, and PDF error isolation.

- [ ] **Step 1: Create a failing Estimator dashboard contract test**

Create `LeadDashboard.test.tsx` using `renderApp`, the existing Estimator user, two complete `Lead` fixtures, and the two saved-estimate fixtures from `LeadDashboard.pdf.test.tsx`. Mock `/api/v1/auth/me`, `/api/v1/leads?`, and `/api/v1/estimates`, then assert:

```tsx
renderApp(["/estimator-sales"]);

expect(await screen.findByRole("heading", { name: "Lead workspace" })).toBeVisible();
const overview = screen.getByRole("region", { name: "Pipeline overview" });
expect(within(overview).getByText("Visible leads")).toBeVisible();
expect(within(overview).getByText("2", { selector: "dd" })).toBeVisible();
expect(within(overview).getByText("Saved estimates")).toBeVisible();
expect(within(overview).getByText("Draft estimates")).toBeVisible();
expect(within(overview).getByText("1", { selector: "dd" })).toBeVisible();
expect(within(overview).getByText("Saved value")).toBeVisible();
expect(within(overview).getByText("₹3,54,000", { selector: "dd" })).toBeVisible();
expect(screen.getByRole("heading", { name: "Leads", level: 2 })).toBeVisible();
expect(screen.getByRole("heading", { name: "Saved estimates", level: 2 })).toBeVisible();
expect(screen.getByText("Next action", { selector: ".lead-list__header span" })).toBeVisible();
expect(screen.getByText("Contact architect").closest("[data-label='Next action']")).toBeVisible();
await userEvent.click(screen.getByRole("button", { name: "New lead" }));
expect(await screen.findByRole("dialog", { name: "New lead" })).toBeVisible();
```

Use estimate totals `118000` and `236000`, which format to `₹3,54,000`. Ensure each `Lead` fixture includes every field required by `Lead` in `api/types.ts`.

- [ ] **Step 2: Run the Estimator dashboard test and observe RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/leads/LeadDashboard.test.tsx
```

Expected: FAIL because the overview region, metric labels, section structure, desktop list header, and mobile data-label hooks do not exist.

- [ ] **Step 3: Add Estimator summary calculations and dashboard structure**

In `LeadDashboard.tsx`, import `../../styles/estimator-dashboard.css`. After both queries are declared, derive values without adding state:

```tsx
const savedEstimates = estimates.data ?? [];
const draftEstimates = savedEstimates.filter((estimate) => estimate.status === "draft").length;
const savedValue = savedEstimates.reduce((total, estimate) => total + estimate.total, 0);
```

Add `className="lead-page estimator-dashboard"`, retain the hero copy/button, and insert:

```tsx
<section className="estimator-dashboard__overview" aria-label="Pipeline overview">
  <dl>
    <div><dt>Visible leads</dt><dd>{query.data.items.length}</dd></div>
    <div><dt>Saved estimates</dt><dd>{estimates.isPending ? "—" : savedEstimates.length}</dd></div>
    <div><dt>Draft estimates</dt><dd>{estimates.isPending ? "—" : draftEstimates}</dd></div>
    <div><dt>Saved value</dt><dd>{estimates.isPending ? "—" : money(savedValue)}</dd></div>
  </dl>
</section>
```

Place the existing search/stage controls after the overview. Wrap the lead list in a section headed `Leads`, and render this desktop-only header before rows:

```tsx
<div className="lead-list__header" aria-hidden="true">
  <span>Client</span><span>Project</span><span>Stage</span><span>Next action</span>
</div>
```

Give each row cell a stable mobile label and a textual stage badge:

```tsx
<span className="lead-row__client" data-label="Client">...</span>
<span data-label="Project">{lead.projectName} · {lead.propertyType} · {lead.location}</span>
<span data-label="Stage"><span className={`lead-stage-badge lead-stage-badge--${lead.stage}`}>{labels[lead.stage]}</span></span>
<span data-label="Next action">{lead.nextAction}</span>
```

Move the existing saved-estimates markup into a sibling section headed `Saved estimates`; preserve every `DownloadButton`, status string, field, and continue/view link.

- [ ] **Step 4: Create the route-scoped Estimator stylesheet**

Create `frontend/src/styles/estimator-dashboard.css` with unique selectors and verified existing tokens:

```css
.estimator-dashboard { gap: var(--space-6); }
.estimator-dashboard .workspace-header { align-items: end; padding-block-end: var(--space-6); border-bottom: 1px solid var(--color-border); }
.estimator-dashboard__overview dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
.estimator-dashboard__overview dl > div { display: grid; gap: var(--space-2); min-block-size: 7rem; padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.estimator-dashboard__overview dt { color: var(--color-text-muted); font-weight: 700; }
.estimator-dashboard__overview dd { margin: 0; color: var(--color-text); font: 700 2rem/1 var(--font-editorial); }
.estimator-dashboard .lead-controls { padding: var(--space-4); border-color: var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.estimator-dashboard .lead-controls input,
.estimator-dashboard .lead-controls select { min-block-size: 44px; border-color: var(--color-border-strong); background: var(--color-canvas); }
.estimator-dashboard__section { display: grid; gap: var(--space-4); }
.estimator-dashboard__section-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-4); }
.estimator-dashboard__section-heading h2 { margin: 0; }
.lead-list__header,
.estimator-dashboard .lead-row { grid-template-columns: 1.15fr 1.35fr .8fr 1.2fr; }
.lead-list__header { display: grid; gap: var(--space-3); padding-inline: var(--space-4); color: var(--color-text-muted); font: var(--type-metadata); font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.estimator-dashboard .lead-row { min-block-size: 5rem; border-color: var(--color-border); box-shadow: var(--shadow-soft); }
.lead-stage-badge { display: inline-flex; inline-size: max-content; padding: .3rem .6rem; border-radius: var(--radius-pill); color: var(--color-info); background: color-mix(in srgb, var(--color-info) 12%, var(--color-surface)); font-weight: 800; }
.estimator-dashboard .saved-estimate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 1024px) {
  .estimator-dashboard__overview dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .estimator-dashboard .workspace-header,
  .estimator-dashboard__section-heading { align-items: stretch; flex-direction: column; }
  .estimator-dashboard__overview dl,
  .estimator-dashboard .saved-estimate-grid { grid-template-columns: 1fr; }
  .lead-list__header { display: none; }
  .estimator-dashboard .lead-row { grid-template-columns: 1fr; }
  .estimator-dashboard .lead-row > [data-label] { display: grid; gap: .2rem; }
  .estimator-dashboard .lead-row > [data-label]::before { content: attr(data-label); color: var(--color-text-muted); font: var(--type-metadata); font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
}
```

The listed token names already exist in `tokens.css`. Remove the legacy `.lead-row:hover` transform inside this route by overriding it with `transform: none` and use border/background changes for hover instead.

- [ ] **Step 5: Run focused Estimator tests GREEN**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/leads/LeadDashboard.test.tsx src/features/leads/LeadDashboard.pdf.test.tsx src/test/accessibility.test.tsx
```

Expected: all tests pass; the PDF isolation cases, dialog semantics, role heading, and new dashboard hierarchy remain green.

- [ ] **Step 6: Commit the Estimator dashboard**

```bash
git add frontend/src/features/leads/LeadDashboard.tsx frontend/src/features/leads/LeadDashboard.test.tsx frontend/src/styles/estimator-dashboard.css
git diff --cached --check
git commit -m "feat: redesign estimator dashboard"
```

---

### Task 3: Integrate and verify both dashboards

**Files:**

- Modify only if verification exposes a dashboard defect: files owned by Tasks 1–2 and their focused tests.
- Preserve untouched: `docs/qa/2026-08-04-ui-foundation.md` from the earlier Phase 1 gate.

**Interfaces:**

- Consumes: the unchanged `ClientDashboard` and `LeadDashboard` exports.
- Produces: verified responsive dashboard presentation on `/client` and `/estimator-sales`.

- [ ] **Step 1: Run the combined dashboard regression suite**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/leads/LeadDashboard.test.tsx src/features/leads/LeadDashboard.pdf.test.tsx src/components/layout/AppShell.test.tsx src/test/accessibility.test.tsx
```

Expected: all tests pass with no altered API-contract expectation.

- [ ] **Step 2: Run frontend static and production verification**

```bash
cd frontend
npm run typecheck
npm run build
```

Expected: both commands exit 0; the existing bundle-size advisory is non-blocking.

- [ ] **Step 3: Run the canonical full frontend suite**

```bash
cd frontend
VITE_API_URL=/api/v1 npm test
```

Expected: all test files pass. Record the existing non-failing MSW warning for the estimate-plan current-image request without expanding dashboard scope.

- [ ] **Step 4: Verify dashboard compositions in the browser**

Open `/client` and `/estimator-sales` at 390px and 1440px. Record for each route:

- `document.documentElement.scrollWidth === document.documentElement.clientWidth`;
- one `h1`, visible section headings, and no clipped metric/action text;
- all metric cards and content columns stack to one column at 390px;
- Client project expand/collapse and “Open project” remain usable;
- Estimator search, stage filter, “New lead,” PDF export, lead row, and estimate link remain usable;
- no new console error or failed request caused by the dashboard diff.

- [ ] **Step 5: Review and commit only verification fixes**

For any dashboard defect, add a focused failing test, make the smallest route-owned correction, rerun Steps 1–3, and commit separately:

```bash
git add frontend/src/features/client frontend/src/features/leads frontend/src/styles/client-dashboard.css frontend/src/styles/estimator-dashboard.css
git diff --cached --check
git commit -m "fix: complete dashboard verification"
```

If no defect is found, do not create an empty commit.

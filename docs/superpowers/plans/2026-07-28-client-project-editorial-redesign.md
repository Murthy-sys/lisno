# Client Project Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the complete client project page into the approved Architectural Editorial experience with an accessible one-plan-at-a-time review queue.

**Architecture:** Keep existing queries, mutations, protected-image loading, and shared dialogs. `ClientProject` owns the editorial page shell and authoritative project/floor/document data; `DesignSectionReview` owns queue selection and action-driven advancement; `SectionReviewCard` renders the single active plan and receives navigation state through explicit props.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Router, Lucide React, Vitest, Testing Library, CSS

## Global Constraints

- Apply the redesign only to the client project page.
- Use the backend-provided project `progress`; do not calculate a replacement in the frontend.
- Preserve existing project, floor, approved-document, protected-image, download, query, mutation, and dialog behavior.
- Render exactly one active section review surface at a time.
- Preserve active selection by section ID across refreshed data when the section still exists.
- Initial selection prefers the first section whose revision status is `submitted`, then the first API section.
- Previous and Next traverse all API sections without wrapping and are disabled at boundaries.
- Successful client decisions advance to the next section still awaiting review; failures retain the active section and rejection comment.
- Decided and read-only sections never expose decision actions.
- Keep the project source modal and section preview modal separate.
- Add no dependencies and make no backend changes.
- Maintain keyboard access, visible focus, contrast, dialog focus behavior, live success announcements, and alert semantics.
- Desktop uses a two-column active review surface; tablet/mobile stacks it without horizontal overflow.

---

### Task 1: Editorial project shell and authoritative progress

**Files:**
- Modify: `frontend/src/features/client/clientApi.ts`
- Modify: `frontend/src/features/client/ClientProject.tsx`
- Modify: `frontend/src/features/client/ClientProject.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: backend `/projects/:projectId` response `ProjectHierarchy & { progress: number }`
- Produces: `getClientProject(projectId: string): Promise<ProjectHierarchy & { progress: number }>`
- Produces: page regions `.client-project-hero`, `.client-floor-progress`, and `.client-approved-documents`

- [ ] **Step 1: Write the failing project-shell test**

Add `progress: 52` to the `project` fixture. Extend the first
`ClientProject.test.tsx` test with:

```tsx
const hero = await screen.findByRole("region", { name: "Aurora Villa project overview" });
expect(within(hero).getByRole("heading", { name: "Aurora Villa" })).toBeVisible();
expect(within(hero).getByText("52%")).toBeVisible();
expect(within(hero).getByText("Project complete")).toBeVisible();

const floors = screen.getByRole("region", { name: "Floor progress" });
expect(within(floors).getByText("Ground floor")).toBeVisible();
expect(within(floors).getByText("70% complete")).toBeVisible();

const documents = screen.getByRole("region", { name: "Approved documents" });
expect(within(documents).getByText("Ground plan.pdf")).toBeVisible();
```

In the empty-approved-plans test, assert that the same
`Approved documents` region contains the existing in-progress message.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- src/features/client/ClientProject.test.tsx
```

Expected: FAIL because the named hero and approved-documents regions do not
exist and the project percentage is not rendered.

- [ ] **Step 3: Correct the client project API type**

Change `clientApi.ts` to:

```ts
export const getClientProject = (projectId: string) =>
  apiClient.get<ProjectHierarchy & { progress: number }>(
    `/projects/${encodeURIComponent(projectId)}`
  );
```

Do not change the backend or derive progress from floor values.

- [ ] **Step 4: Implement the editorial page hierarchy**

Refactor `ClientProject.tsx` so:

- the back link remains first;
- the project hero is a `section.client-project-hero` with
  `aria-label={`${project.name} project overview`}`;
- the header renders `project.progress`, “Project complete”, location, and
  expected completion;
- floor cards live inside
  `<section className="client-floor-progress" aria-labelledby="floor-progress-title">`;
- each floor card retains its existing `ProgressBar`;
- `DesignSectionReview` follows floor progress;
- approved files and the existing empty state live inside
  `<section className="client-approved-documents" aria-labelledby="approved-documents-title">`;
- the heading copy is `Approved documents`.

Keep `VisibleVersion`, authenticated preview/download behavior, filtering, and
floor ordering unchanged.

- [ ] **Step 5: Add scoped Architectural Editorial styles**

In `index.css`, scope the warm design under `.client-page`:

- parchment page field and generous vertical spacing;
- dark warm gradient hero with responsive completion block;
- Georgia/display-serif headings with system-font body copy;
- stone floor cards and olive/gold progress accents;
- quieter approved-document region and empty state;
- existing button and file-preview focus states remain visible;
- stack hero content and floor-card contents below `760px`;
- prevent horizontal overflow.

Do not modify global dashboard, authentication, manager, head, or designer
styles.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
cd frontend
npm test -- src/features/client/ClientProject.test.tsx
npm run typecheck
```

Expected: both client-project tests pass and TypeScript exits successfully.

- [ ] **Step 7: Commit Task 1**

```bash
git add frontend/src/features/client/clientApi.ts \
  frontend/src/features/client/ClientProject.tsx \
  frontend/src/features/client/ClientProject.test.tsx \
  frontend/src/styles/index.css
git diff --cached --check
git commit -m "feat: redesign client project overview"
```

---

### Task 2: Focused review queue and responsive active-plan surface

**Files:**
- Modify: `frontend/src/features/client/DesignSectionReview.tsx`
- Modify: `frontend/src/components/design/SectionReviewCard.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: `DesignSectionReviewData.sections: DesignSectionReviewItem[]`
- Produces: active section state `activeSectionId: string | undefined`
- Produces: `SectionReviewCard` props `position`, `total`, `previousLabel`, `nextLabel`, `onPrevious`, and `onNext`

- [ ] **Step 1: Write failing queue-selection and navigation tests**

Update the main review test so it asserts only one review article is visible:

```tsx
expect(screen.getAllByRole("article", { name: /review$/ })).toHaveLength(1);
expect(screen.getByRole("article", { name: "Front elevation review" })).toBeVisible();
expect(screen.getByText("Plan 1 of 2")).toBeVisible();

const previous = screen.getByRole("button", { name: "Previous plan" });
const next = screen.getByRole("button", { name: "Next plan: Site plan" });
expect(previous).toBeDisabled();
await user.click(next);
expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
expect(screen.queryByRole("article", { name: "Front elevation review" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Next plan" })).toBeDisabled();
```

Add a test whose first section is approved and second section is submitted.
Assert the second section is initially active. Rerender refreshed data with
the same active ID in a different array position and assert the active section
is preserved.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx
```

Expected: FAIL because both cards render and queue navigation does not exist.

- [ ] **Step 3: Implement stable active-section selection**

In `DesignSectionReview.tsx`:

```ts
const [activeSectionId, setActiveSectionId] = useState<string>();

const preferredSection =
  sections.find((section) => section.id === activeSectionId) ??
  sections.find((section) => section.revision.reviewStatus === "submitted") ??
  sections[0];

const activeIndex = preferredSection
  ? sections.findIndex((section) => section.id === preferredSection.id)
  : -1;
```

Use an effect to synchronize `activeSectionId` only when the selected ID is
missing or no longer valid. Do not reset selection merely because query data
receives a new object identity.

- [ ] **Step 4: Render one active review surface**

Replace `.section-review-grid` mapping with one `SectionReviewCard` for
`preferredSection`. Pass:

```tsx
position={activeIndex + 1}
total={sections.length}
previousLabel={activeIndex > 0 ? sections[activeIndex - 1]?.label : undefined}
nextLabel={activeIndex < sections.length - 1 ? sections[activeIndex + 1]?.label : undefined}
onPrevious={() => setActiveSectionId(sections[activeIndex - 1]?.id)}
onNext={() => setActiveSectionId(sections[activeIndex + 1]?.id)}
```

Keep the current source-image selection based on the highest design version and
all progress summary behavior.

- [ ] **Step 5: Refactor `SectionReviewCard` into the active-plan surface**

Extend its props with:

```ts
position: number;
total: number;
previousLabel?: string;
nextLabel?: string;
onPrevious: () => void;
onNext: () => void;
```

Render:

- “Plan {position} of {total}”;
- a two-column `.section-review-card__body`;
- a large `.section-review-card__image-trigger` using the same
  `ProtectedImage` and preview modal;
- metadata, status, rejection comment, history, and decision actions in
  `.section-review-card__details`;
- a `.section-review-card__navigation` footer;
- Previous with accessible name
  `previousLabel ? `Previous plan: ${previousLabel}` : "Previous plan"`;
- Next with accessible name
  `nextLabel ? `Next plan: ${nextLabel}` : "Next plan"`;
- disabled boundary buttons and a position indicator.

Keep the shared preview dialog, protected object URL lifecycle, revision order,
and semantic action classes unchanged.

- [ ] **Step 6: Add focused-queue responsive CSS**

Replace obsolete grid/50px card-thumbnail layout rules for this component with:

- warm editorial active-card surface;
- a desktop two-column body;
- large image with `object-fit: contain` and a clear zoom affordance;
- restrained metadata, history, and status styling;
- full-width decision actions when narrow;
- three-part Previous / position / Next navigation;
- a one-column body below `800px`;
- no horizontal overflow and visible disabled/focus states.

Do not change the 50×50 `FilePreview` thumbnail used by approved documents.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx
npm run typecheck
```

Expected: all design-review tests pass and TypeScript exits successfully.

- [ ] **Step 8: Commit Task 2**

```bash
git add frontend/src/features/client/DesignSectionReview.tsx \
  frontend/src/components/design/SectionReviewCard.tsx \
  frontend/src/features/client/DesignSectionReview.test.tsx \
  frontend/src/styles/index.css
git diff --cached --check
git commit -m "feat: add focused client review queue"
```

---

### Task 3: Action-driven advancement, completion, and failure retention

**Files:**
- Modify: `frontend/src/features/client/DesignSectionReview.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**
- Consumes: active section state and navigation from Task 2
- Produces: polite status text `Review saved. Showing the next plan awaiting review.`
- Produces: completed state `Review complete`

- [ ] **Step 1: Write failing approval-advancement tests**

Change the approval test to assert:

```tsx
await user.click(screen.getByRole("button", { name: "Approve Front elevation" }));
await user.click(screen.getByRole("button", { name: "Confirm approval" }));

expect(await screen.findByRole("status"))
  .toHaveTextContent("Review saved. Showing the next plan awaiting review.");
expect(screen.getByRole("article", { name: "Site plan review" })).toBeVisible();
expect(screen.queryByRole("button", { name: "Approve Front elevation" }))
  .not.toBeInTheDocument();
```

Update the API fixture so decision responses modify only the matching section
instead of all sections.

- [ ] **Step 2: Write failing rejection, error-retention, and completion tests**

Add tests that:

- submit a valid rejection comment and assert the queue advances to the next
  submitted section;
- return a failed decision and assert the same section remains active, the
  rejection dialog stays open, the typed comment remains, and the API error is
  an alert;
- start with only one submitted section, approve it, and assert
  `screen.getByRole("heading", { name: "Review complete" })` is visible and
  the live status contains `Review complete` while the decided section remains
  reachable;
- render read-only data and assert queue navigation exists but Approve and
  Request changes do not.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx
```

Expected: FAIL because success does not select the next awaiting section and no
completion/status announcement exists.

- [ ] **Step 4: Implement action-driven advancement**

Before each mutation, retain the chosen section ID. In `onSuccess`:

1. close the decision dialog and clear comment validation;
2. await query invalidation/refetch;
3. inspect the refreshed cached
   `DesignSectionReviewData` through
   `queryClient.getQueryData(clientKeys.designSections(projectId))`;
4. select the first `submitted` section whose ID differs from the decided ID;
5. if one exists, set it active and announce
   `Review saved. Showing the next plan awaiting review.`;
6. otherwise retain the decided section ID and announce `Review complete`.

Do not clear `choice`, `comment`, or the active ID in `onError`. Preserve the
existing API error rendering.

- [ ] **Step 5: Render feedback and completion states**

Add one persistent live region:

```tsx
<p className="design-review__announcement" role="status" aria-live="polite">
  {announcement}
</p>
```

When no section remains submitted, render a visible
`.design-review__complete` panel with heading `Review complete` and copy
confirming that all current plans have a decision. Do not hide queue navigation
or prior decided sections.

- [ ] **Step 6: Extend accessibility smoke coverage**

In `accessibility.test.tsx`, keep the existing smoke render and assert the
focused review surface has:

- one active review article;
- named Previous and Next buttons;
- the progress group;
- no decision actions in read-only mode.

Use existing test fixtures and fetch routing; do not duplicate production
logic in the test.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
cd frontend
npm test -- src/features/client/DesignSectionReview.test.tsx src/features/client/ClientProject.test.tsx src/test/accessibility.test.tsx
npm test
npm run typecheck
npm run build
```

Expected: focused tests pass, the full suite has zero failures, TypeScript exits
successfully, and Vite completes the production build.

- [ ] **Step 8: Commit Task 3 and the implementation plan**

```bash
git add frontend/src/features/client/DesignSectionReview.tsx \
  frontend/src/features/client/DesignSectionReview.test.tsx \
  frontend/src/styles/index.css \
  frontend/src/test/accessibility.test.tsx \
  docs/superpowers/plans/2026-07-28-client-project-editorial-redesign.md
git diff --cached --check
git commit -m "feat: advance client review actions"
```

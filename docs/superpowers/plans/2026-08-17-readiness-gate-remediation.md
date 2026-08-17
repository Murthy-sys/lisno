# Readiness Gate Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Close the production project-access exposure and restore a deterministic, behavior-correct frontend test baseline without starting Prompt 1.

**Architecture:** A single typed project-access scope policy becomes the authority for both Mongo and memory repositories. Frontend tests receive a fixed test-only API base, while the estimator dashboard regains an estimate-driven export surface that is independent of the filtered lead page.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, React 19, Vite 6, Vitest 3, Testing Library, TanStack Query.

## Global Constraints

- Prompt 1 and all later phases remain NOT STARTED.
- Do not add roles, Admin UI, estimator assignment fields, schemas, migrations, or APIs.
- Do not change estimation calculations, PDF generation, OCR, file storage, or notification behavior.
- Preserve design_head all-project access.
- Preserve existing designer, design_manager, and client project visibility.
- estimator_sales has no generic project access until a later Admin workflow explicitly assigns an active estimator.
- Retain the current inline lead estimate summary and actions.
- Restore a complete Saved estimates export surface driven by getSavedEstimates.
- Use test-first red-green-refactor for every production behavior change.
- Do not stage or modify unrelated user changes.

---

## File map

### Backend

- Create backend/src/domain/project-access.ts: typed role-to-project-scope policy and in-memory scope predicate.
- Modify backend/src/repositories/memory.ts: consume the shared scope instead of a catch-all manager branch.
- Modify backend/src/repositories/mongo.ts: translate the shared scope into Mongo filters and short-circuit denied reads.
- Modify backend/tests/repository.test.ts: reproduce and lock memory estimator isolation.
- Modify backend/tests/mongo-repository.test.ts: reproduce and lock Mongo estimator isolation while preserving head visibility.
- Modify backend/tests/workflows.test.ts: lock HTTP list/detail isolation for estimator_sales.

### Frontend

- Modify frontend/vite.config.ts: provide the test-only /api/v1 base.
- Modify frontend/src/features/leads/LeadDashboard.test.tsx: require the complete Saved estimates section and error isolation.
- Modify frontend/src/features/leads/LeadDashboard.pdf.test.tsx: keep zero-visible-lead export coverage and remove CSS-selector coupling.
- Modify frontend/src/features/leads/LeadDashboard.tsx: restore the estimate-driven section while retaining inline lead behavior.

### State documentation

- Modify CODEX_IMPLEMENTATION_PLAN.md: record readiness-gate completion and Prompt 1 readiness without changing Prompt 1 state.
- Modify PROMPT_0_AUDIT_REPORT.md: append remediation and fresh verification evidence.

---

### Task 1: Centralize and enforce project access

**Files:**

- Create: backend/src/domain/project-access.ts
- Modify: backend/src/repositories/memory.ts
- Modify: backend/src/repositories/mongo.ts
- Test: backend/tests/repository.test.ts
- Test: backend/tests/mongo-repository.test.ts
- Test: backend/tests/workflows.test.ts

**Interfaces:**

- Consumes: Role from backend/src/contracts/domain.ts and structural user/project identifiers already present in repository records.
- Produces: ProjectAccessScope, projectAccessScopeForUser(user), and projectIsInAccessScope(scope, project).
- Preserves: AppRepository method signatures and existing HTTP response envelopes.

- [ ] **Step 1: Add the failing memory-repository regression**

Extend the existing visibility test in backend/tests/repository.test.ts with an estimator whose ID is deliberately placed in managerId:

~~~typescript
it("denies estimator sales projects even when legacy data names them as manager", async () => {
  const seed = structuredClone(demoSeedData);
  const sales = seed.users.find((user) => user.id === "user-estimator-sales")!;
  seed.projects[0]!.managerId = sales.id;
  const repository = createMemoryRepository(seed);

  await expect(repository.listProjectsForUser(sales)).resolves.toEqual([]);
  await expect(
    repository.pageProjectsForUser(sales, { limit: 20, offset: 0 })
  ).resolves.toEqual({ items: [], total: 0 });
});
~~~

- [ ] **Step 2: Add the failing Mongo-repository regression**

Add this test to backend/tests/mongo-repository.test.ts. The query chain is mocked so the current unsafe implementation fails on the no-query assertions instead of attempting a live database connection:

~~~typescript
it("short-circuits Mongo project reads for estimator sales", async () => {
  const exec = vi.fn().mockResolvedValue([]);
  const lean = vi.fn(() => ({ exec }));
  const limit = vi.fn(() => ({ lean }));
  const skip = vi.fn(() => ({ limit }));
  const sort = vi.fn(() => ({ lean, skip }));
  const find = vi.spyOn(ProjectModel, "find").mockReturnValue({ sort } as never);
  const count = vi.spyOn(ProjectModel, "countDocuments").mockReturnValue({
    exec: vi.fn().mockResolvedValue(0)
  } as never);
  const sales = demoSeedData.users.find(
    (user) => user.id === "user-estimator-sales"
  )!;
  const repository = createMongoRepository();

  await expect(repository.listProjectsForUser(sales)).resolves.toEqual([]);
  await expect(
    repository.pageProjectsForUser(sales, { limit: 20, offset: 0 })
  ).resolves.toEqual({ items: [], total: 0 });

  expect(find).not.toHaveBeenCalled();
  expect(count).not.toHaveBeenCalled();
});
~~~

Add this preservation test for the only role that intentionally receives the all scope:

~~~typescript
it("keeps the design head Mongo project scope explicitly unrestricted", async () => {
  const exec = vi.fn().mockResolvedValue([]);
  const lean = vi.fn(() => ({ exec }));
  const sort = vi.fn(() => ({ lean }));
  const find = vi.spyOn(ProjectModel, "find").mockReturnValue({ sort } as never);
  const head = demoSeedData.users.find((user) => user.id === "user-head")!;

  await createMongoRepository().listProjectsForUser(head);

  expect(find).toHaveBeenCalledWith({});
});
~~~

- [ ] **Step 3: Add the failing HTTP workflow regression**

Add sales to the users fixture in backend/tests/workflows.test.ts:

~~~typescript
sales: ["user-estimator-sales", "estimator_sales"],
~~~

Then add:

~~~typescript
it("denies estimator sales generic project and artifact access", async () => {
  const seed = structuredClone(demoSeedData);
  seed.projects.find(
    (project) => project.id === "project-aurora-villa"
  )!.managerId = "user-estimator-sales";
  const { app } = setup(seed);

  const list = await request(app)
    .get("/api/v1/projects?limit=20&offset=0")
    .set("Authorization", bearer(users.sales));

  expect(list.status).toBe(200);
  expect(list.body.data).toEqual({
    items: [],
    pagination: {
      limit: 20,
      offset: 0,
      total: 0,
      hasMore: false
    }
  });

  for (const path of [
    "/api/v1/projects/project-aurora-villa",
    "/api/v1/projects/project-aurora-villa/design-versions"
  ]) {
    await request(app)
      .get(path)
      .set("Authorization", bearer(users.sales))
      .expect(404);
  }
});
~~~

- [ ] **Step 4: Run the focused backend tests and verify RED**

Run:

~~~bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/workflows.test.ts
~~~

Expected:

- The memory regression returns at least the project whose managerId equals the sales ID.
- The Mongo regression reports that ProjectModel.find was called.
- The workflow list/detail regression exposes the project.
- Existing tests remain otherwise green.

- [ ] **Step 5: Create the shared project-access policy**

Create backend/src/domain/project-access.ts:

~~~typescript
import type { Role } from "../contracts/domain.js";

export type ProjectAccessScope =
  | { kind: "all" }
  | { kind: "linked-client"; clientId: string }
  | { kind: "initiated-or-assigned-designer"; designerId: string }
  | { kind: "accountable-manager"; managerId: string }
  | { kind: "none" };

type ProjectAccessUser = {
  id: string;
  role: Role;
};

type ProjectAccessRecord = {
  clientId: string | null;
  initiatingDesignerId: string;
  assignedDesignerIds: string[];
  managerId: string;
};

const PROJECT_SCOPE_KIND_BY_ROLE = {
  design_head: "all",
  designer: "initiated-or-assigned-designer",
  design_manager: "accountable-manager",
  client: "linked-client",
  estimator_sales: "none"
} as const satisfies Record<Role, ProjectAccessScope["kind"]>;

export function projectAccessScopeForUser(
  user: ProjectAccessUser
): ProjectAccessScope {
  const kind = PROJECT_SCOPE_KIND_BY_ROLE[user.role] ?? "none";
  switch (kind) {
    case "all":
      return { kind };
    case "linked-client":
      return { kind, clientId: user.id };
    case "initiated-or-assigned-designer":
      return { kind, designerId: user.id };
    case "accountable-manager":
      return { kind, managerId: user.id };
    case "none":
      return { kind };
  }
}

export function projectIsInAccessScope(
  scope: ProjectAccessScope,
  project: ProjectAccessRecord
): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "linked-client":
      return project.clientId === scope.clientId;
    case "initiated-or-assigned-designer":
      return (
        project.initiatingDesignerId === scope.designerId ||
        project.assignedDesignerIds.includes(scope.designerId)
      );
    case "accountable-manager":
      return project.managerId === scope.managerId;
    case "none":
      return false;
  }
}
~~~

- [ ] **Step 6: Integrate the memory repository**

Import both functions into backend/src/repositories/memory.ts. Replace the role branch in listProjectsForUser with:

~~~typescript
async listProjectsForUser(user) {
  const scope = projectAccessScopeForUser(user);
  const projects = state.projects
    .filter((project) => projectIsInAccessScope(scope, project))
    .sort(byNameThenId);
  return clone(projects);
},
~~~

Keep pageProjectsForUser unchanged so it paginates the now-authoritative list.

- [ ] **Step 7: Integrate the Mongo repository**

Import projectAccessScopeForUser into backend/src/repositories/mongo.ts. Replace projectFilterForUser with:

~~~typescript
const projectFilterForUser = (user: UserRecord): PlainDocument | null => {
  const scope = projectAccessScopeForUser(user);
  switch (scope.kind) {
    case "all":
      return {};
    case "linked-client":
      return { clientId: scope.clientId };
    case "initiated-or-assigned-designer":
      return {
        $or: [
          { initiatingDesignerId: scope.designerId },
          { assignedDesignerIds: scope.designerId }
        ]
      };
    case "accountable-manager":
      return { managerId: scope.managerId };
    case "none":
      return null;
  }
};
~~~

Short-circuit both reads:

~~~typescript
async listProjectsForUser(user) {
  const filter = projectFilterForUser(user);
  if (filter === null) return [];
  const documents = await ProjectModel.find(filter)
    .sort({ name: 1, _id: 1 })
    .lean()
    .exec();
  return documents.map(mapProject);
},

async pageProjectsForUser(user, pagination) {
  const filter = projectFilterForUser(user);
  if (filter === null) return { items: [], total: 0 };
  const [documents, total] = await Promise.all([
    ProjectModel.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip(pagination.offset)
      .limit(pagination.limit)
      .lean()
      .exec(),
    ProjectModel.countDocuments(filter).exec()
  ]);
  return { items: documents.map(mapProject), total };
},
~~~

- [ ] **Step 8: Run focused tests and typecheck to verify GREEN**

Run:

~~~bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/workflows.test.ts
npm run typecheck
~~~

Expected: all focused tests pass and TypeScript exits zero.

- [ ] **Step 9: Commit the backend security fix**

~~~bash
git add backend/src/domain/project-access.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/workflows.test.ts
git diff --cached --check
git commit -m "fix: deny unassigned project access"
~~~

---

### Task 2: Isolate the frontend test environment

**Files:**

- Modify: frontend/vite.config.ts
- Test: frontend/src/api/client.test.ts

**Interfaces:**

- Consumes: Vitest test.env configuration.
- Produces: VITE_API_URL=/api/v1 for test transforms only.
- Preserves: production/development import.meta.env resolution.

- [ ] **Step 1: Reproduce the hostile-environment failure**

Run:

~~~bash
cd frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test -- src/api/client.test.ts
~~~

Expected: two URL assertions fail because requests use the hostile absolute origin.

- [ ] **Step 2: Add the minimal test-only configuration**

Update frontend/vite.config.ts:

~~~typescript
test: {
  environment: "jsdom",
  setupFiles: ["./src/test/setup.ts"],
  env: {
    VITE_API_URL: "/api/v1"
  }
}
~~~

- [ ] **Step 3: Verify the hostile environment is overridden**

Run:

~~~bash
cd frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test -- src/api/client.test.ts
npm run typecheck
~~~

Expected: client.test.ts passes 14/14 and typecheck exits zero.

- [ ] **Step 4: Commit the test isolation**

~~~bash
git add frontend/vite.config.ts
git diff --cached --check
git commit -m "test: isolate frontend api base"
~~~

---

### Task 3: Restore the complete saved-estimate export surface

**Files:**

- Modify: frontend/src/features/leads/LeadDashboard.tsx
- Modify: frontend/src/features/leads/LeadDashboard.test.tsx
- Modify: frontend/src/features/leads/LeadDashboard.pdf.test.tsx

**Interfaces:**

- Consumes: getSavedEstimates, SavedEstimate, DownloadButton, and existing lead routes.
- Produces: a Saved estimates region driven independently from the visible lead page.
- Preserves: current lead-row estimate summary/actions and all API calls.

- [ ] **Step 1: Strengthen the dashboard test before production changes**

In frontend/src/features/leads/LeadDashboard.test.tsx replace the absence assertion with:

~~~typescript
const savedSection = screen.getByRole("region", { name: "Saved estimates" });
expect(
  within(savedSection).getByRole("heading", {
    name: "Saved estimates",
    level: 2
  })
).toBeVisible();
expect(
  within(savedSection).getAllByRole("button", { name: "Export as PDF" })
).toHaveLength(2);
~~~

The region requires aria-labelledby pointing to the Saved estimates heading.

- [ ] **Step 2: Make PDF tests semantic while retaining zero-lead coverage**

In both tests in LeadDashboard.pdf.test.tsx, keep the API response items array empty. Replace CSS-selector lookups with article-scoped accessible queries:

~~~typescript
const draftCard = (await screen.findByRole("heading", {
  name: "Aurora Villa",
  level: 3
})).closest("article")!;
const sentCard = screen.getByRole("heading", {
  name: "Cedar Loft",
  level: 3
}).closest("article")!;
const draftExport = within(draftCard).getByRole("button", {
  name: "Export as PDF"
});
const sentExport = within(sentCard).getByRole("button", {
  name: "Export as PDF"
});
~~~

Keep the existing independent loading, authorization-header, no-navigation, and scoped-error assertions.

- [ ] **Step 3: Run dashboard tests and verify RED**

Run:

~~~bash
cd frontend
npm test -- src/features/leads/LeadDashboard.test.tsx src/features/leads/LeadDashboard.pdf.test.tsx
~~~

Expected: the dashboard cannot find the Saved estimates region and both PDF tests cannot find estimate project headings when the lead page is empty.

- [ ] **Step 4: Restore the estimate-driven section**

In LeadDashboard.tsx add this section after the overview and before the lead controls:

~~~tsx
<section
  className="saved-estimates estimator-dashboard__section"
  aria-labelledby="saved-estimates-title"
>
  <header className="estimator-dashboard__section-heading">
    <div>
      <p className="eyebrow">Estimate pipeline</p>
      <h2 id="saved-estimates-title">Saved estimates</h2>
    </div>
    {estimates.data ? <strong>{estimates.data.length} total</strong> : null}
  </header>
  {estimates.isPending ? <p>Loading saved estimates…</p> : null}
  {estimates.isError ? (
    <p role="alert">
      Saved estimates are unavailable.{" "}
      <button type="button" onClick={() => void estimates.refetch()}>
        Try again
      </button>
    </p>
  ) : null}
  {estimates.data?.length ? (
    <div className="saved-estimate-grid">
      {estimates.data.map((estimate) => (
        <SavedEstimateCard key={estimate.id} estimate={estimate} />
      ))}
    </div>
  ) : estimates.isSuccess ? (
    <p className="inline-empty">
      No saved estimates yet. Start one from a lead.
    </p>
  ) : null}
</section>
~~~

Add a focused card below LeadRow:

~~~tsx
function SavedEstimateCard({ estimate }: { estimate: SavedEstimate }) {
  const projectName = estimate.lead?.projectName ?? "Saved estimate";
  const estimatePath =
    "/estimator-sales/leads/" + estimate.leadId + "/estimate";

  return (
    <article className="saved-estimate-card">
      <div className="saved-estimate-card__top">
        <div className="saved-estimate-card__summary">
          <span className="estimate-status">
            {estimate.status.replaceAll("_", " ")}
          </span>
          <strong>{money(estimate.total)}</strong>
        </div>
        <DownloadButton
          className="button button--secondary saved-estimate-card__export"
          label="Export as PDF"
          loadingLabel="Preparing PDF..."
          errorMessage={
            "PDF export failed for " + projectName + ". Try again."
          }
          fallbackFilename={"lisno-" + estimate.id + ".pdf"}
          getFile={() => downloadEstimatePdf(estimate.id)}
        />
      </div>
      <h3>{projectName}</h3>
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{estimate.lead?.clientName ?? "—"}</dd>
        </div>
        <div>
          <dt>Property</dt>
          <dd>{estimate.propertyType}</dd>
        </div>
      </dl>
      <Link className="button button--primary" to={estimatePath}>
        {estimate.status === "draft" ? "Continue estimate" : "View estimate"}
      </Link>
    </article>
  );
}
~~~

Retain LeadRow and its inline DownloadButton unchanged.

- [ ] **Step 5: Remove the duplicate lead-section estimate error banner**

The restored Saved estimates section owns loading/error/retry state. Remove lead-list__estimates-error from the Leads section so one failed query produces one alert. When estimate data is unavailable, pass estimatesUnavailable to LeadRow and render Unavailable instead of No estimate yet:

~~~tsx
<LeadRow
  key={lead.id}
  lead={lead}
  estimate={estimateByLead.get(lead.id)}
  estimatesPending={estimates.isPending}
  estimatesUnavailable={estimates.isError}
/>
~~~

Replace the LeadRow signature with:

~~~tsx
function LeadRow({
  lead,
  estimate,
  estimatesPending,
  estimatesUnavailable
}: {
  lead: Lead;
  estimate: SavedEstimate | undefined;
  estimatesPending: boolean;
  estimatesUnavailable: boolean;
}) {
~~~

In its missing-estimate branch use:

~~~tsx
<small>
  {estimatesPending
    ? "Loading…"
    : estimatesUnavailable
      ? "Unavailable"
      : "No estimate yet"}
</small>
~~~

- [ ] **Step 6: Add a secondary-query error regression**

Add this test to LeadDashboard.test.tsx:

~~~typescript
it("keeps leads usable when saved estimates fail", async () => {
  tokenStorage.set("sales-token");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
    if (url.startsWith("/api/v1/leads?")) {
      return Response.json({
        data: {
          items: leads,
          pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
        }
      });
    }
    if (url === "/api/v1/estimates") {
      return Response.json(
        { error: { code: "ESTIMATES_FAILED", message: "Unavailable" } },
        { status: 500 }
      );
    }
    throw new Error("Unhandled request: " + url);
  });

  renderApp(["/estimator-sales"]);

  expect(
    await screen.findByRole("heading", { name: "Aurora Villa", level: 3 })
  ).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Saved estimates are unavailable."
  );
  expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});
~~~

- [ ] **Step 7: Run focused frontend tests and verify GREEN**

Run:

~~~bash
cd frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test -- src/api/client.test.ts src/features/leads/LeadDashboard.test.tsx src/features/leads/LeadDashboard.pdf.test.tsx
npm run typecheck
~~~

Expected: all focused tests and typecheck pass.

- [ ] **Step 8: Commit the dashboard regression fix**

~~~bash
git add frontend/src/features/leads/LeadDashboard.tsx frontend/src/features/leads/LeadDashboard.test.tsx frontend/src/features/leads/LeadDashboard.pdf.test.tsx
git diff --cached --check
git commit -m "fix: restore saved estimate exports"
~~~

---

### Task 4: Verify the full gate and update implementation state

**Files:**

- Modify: CODEX_IMPLEMENTATION_PLAN.md
- Modify: PROMPT_0_AUDIT_REPORT.md

**Interfaces:**

- Consumes: fresh test/typecheck/build evidence from Tasks 1–3.
- Produces: durable readiness state and completion report.
- Preserves: Prompt 1 through Prompt 10 as NOT STARTED.

- [ ] **Step 1: Run complete backend verification**

~~~bash
cd backend
npm test
npm run typecheck
npm run build
~~~

Expected: all backend tests, typecheck, and build pass with zero failures.

- [ ] **Step 2: Run complete frontend verification under a hostile environment**

~~~bash
cd frontend
VITE_API_URL=http://hostile.invalid/api/v1 npm test
npm run typecheck
npm run build
~~~

Expected: all frontend tests, typecheck, and build pass. Record any non-failing bundle warning separately.

- [ ] **Step 3: Verify no OCR or unrelated changes**

~~~bash
git status --short
git diff HEAD~3..HEAD -- backend ocr-worker frontend
git diff --check
~~~

Expected: no ocr-worker diff, no unrelated files, and no whitespace errors.

- [ ] **Step 4: Update CODEX implementation state**

In CODEX_IMPLEMENTATION_PLAN.md:

- Add a readiness-remediation state marked COMPLETE with the date.
- Keep Prompt 0 COMPLETE.
- Keep Prompt 1 through Prompt 10 NOT STARTED.
- Change the Prompt 1 readiness statement only if every required verification command passed.
- State that estimator_sales future access is limited to projects explicitly assigned by Admin through the later role-filtered dropdown workflow.

- [ ] **Step 5: Update the Prompt 0 audit report**

Append a dated remediation addendum containing:

- The shared access-scope fix.
- The test-environment isolation.
- The restored complete saved-estimate export surface.
- Exact fresh test/typecheck/build counts.
- Remaining non-blocking risks, including unverified client-email claiming.
- A clear distinction between “ready to begin Prompt 1” and “ready for public production.”

- [ ] **Step 6: Commit state documentation**

Stage only the two requested state documents:

~~~bash
git add CODEX_IMPLEMENTATION_PLAN.md PROMPT_0_AUDIT_REPORT.md
git diff --cached --check
git commit -m "docs: record readiness gate result"
~~~

- [ ] **Step 7: Final verification**

~~~bash
git status --short
git log -5 --oneline
git diff HEAD~4..HEAD --check
~~~

Expected:

- Only intentionally uncommitted user files, if any, remain.
- Prompt 1 has not been implemented.
- The final report cites fresh evidence and clearly states the readiness verdict.

---

## Execution boundary

Completing this plan authorizes only the readiness remediation described above. It does not authorize Prompt 1. After Task 4, stop and return the result to the user.

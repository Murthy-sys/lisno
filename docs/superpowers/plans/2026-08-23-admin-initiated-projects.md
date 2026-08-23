# Admin-Initiated Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give regular Admins a scoped My Projects workspace where they initiate a real project with a mandatory Estimator/Sales handoff, while preserving the existing estimator estimate flow and reusing the same project at client approval.

**Architecture:** Add nullable project-team and lead-link fields to the shared persistence contracts, then expose a dedicated Admin project read model in both repository adapters. A separate Admin project service atomically creates the Project, initiator grant, linked Lead, and safe audits; the existing Mongoose estimate path copies and verifies that project link and branches between reuse and legacy project creation at approval. The frontend adds purpose-built Admin list/detail/initiation components and removes regular Admin from the Super Admin user-directory boundary.

**Tech Stack:** TypeScript, Node.js, Express, Zod, Mongoose/MongoDB transactions, Vitest, Supertest, React 19, React Router, TanStack Query, Testing Library, MSW, CSS.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-initiated-projects-design.md`

## Global Constraints

- Regular Admin lists and reads only projects supplied by that Admin's active `admin_initiator` grant for module `projects`; guessed or out-of-scope detail IDs return the existing non-disclosing `404`.
- Super Admin retains backend global-read behavior and the existing `/admin/users` home; no Super Admin project navigation is added.
- Only a currently active stored actor whose exact role is `admin` may initiate; Super Admin is denied by the `deny_personal` operation classification and by the service guard.
- The selector accepts only active users whose exact role is `estimator_sales`; it exposes only `id`, `name`, `email`, and nullable `title`.
- The initiation request has exactly `clientName`, `clientEmail`, `clientMobile`, `projectName`, `location`, `propertyType`, `budgetMin`, `budgetMax`, `nextAction`, `nextActionAt`, and `estimatorId`. It never accepts or submits `source`, `builder`, `areaSqft`, `targetHandoverAt`, or `notes`.
- The server sets Lead source to the exact value `admin_project`.
- `lead.ownerId` must equal `project.assignedEstimatorId` for every linked handoff.
- Admin-created projects start with `initiatingDesignerId: null`, `assignedDesignerIds: []`, `managerId: null`, `status: "planning"`, and a 90-day planning window. No placeholder team account is allowed.
- Project is authoritative for project name, client identity, and location. Linked Lead is authoritative for property type, budgets, stage, next action, and next-action date.
- Initiation is one `AppRepository.runInTransaction` operation containing Project, grant, Lead, and all three audit writes. No partial record may survive a failure.
- Initiation audit payloads use only the allowlists from the spec and never copy client identity, location, budgets, next-action text, or other free text.
- `POST /admin/projects` remains non-idempotent and is never automatically retried; the UI prevents a second submit while pending.
- Estimate persistence remains on the current Mongoose path. This work does not move Estimate into `AppRepository`.
- Estimate save copies or backfills the Lead project ID and rejects conflicting non-null links before mutating the document.
- Client approval reuses a valid non-null Estimate project ID, updates the pre-created Project with the real Designer and Design Manager, leaves `initiatingDesignerId` null, retains the initiator grant, and creates no second Project.
- A legacy Lead/Estimate with no project ID continues through the current approval-time Project creation branch.
- Regular Admin loses `identity.users.read` and `identity.users.update` in backend policy, service guards, frontend presentation, navigation, and test fixtures. Super Admin behavior is unchanged.
- Add exact permission codes `projects.initiate` and `organization.estimators.read`, exact route availability `prompt_2`, and synchronized authorization policy version `2026-08-23.prompt-2` in backend and frontend.
- Do not add Admin estimate editing, project editing, estimator reassignment, approval override, proof upload, new lifecycle states, or wider Prompt 2 functionality.
- Use existing dependencies and UI primitives; do not add a package.
- Follow red-green-refactor for every behavior change and make one focused commit per task.

---

## File structure and ownership

### New backend files

- `backend/src/repositories/admin-project-summary.ts` — pure scoped-project projection mapper shared by memory and Mongo adapters after each adapter has resolved project scope.
- `backend/src/services/admin-project.service.ts` — Admin list/detail/options authorization and the atomic initiation use case.
- `backend/src/routes/admin-projects.ts` — strict HTTP schemas and the four Prompt 2 Admin endpoints.
- `backend/src/services/estimate-project-handoff.ts` — Mongoose-session helper that validates/reuses a linked Project or performs the unchanged legacy creation branch.
- `backend/tests/admin-projects.test.ts` — memory-backed route/service acceptance, scope, validation, audit, and rollback coverage.
- `backend/tests/admin-projects-mongo.replica-set.test.ts` — real Mongo transaction, index, sorting, join, and rollback coverage.
- `backend/tests/fixtures/prompt-2-route-operations.ts` — the four exact normative route-operation rows.

### New frontend files

- `frontend/src/features/admin/adminProjectsApi.ts` — Admin project query keys, URL builders, and GET/POST calls.
- `frontend/src/features/admin/AdminProjectsPage.tsx` — paginated My Projects page and initiation entry point.
- `frontend/src/features/admin/AdminProjectDetailPage.tsx` — read-only Admin project detail.
- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` — exact approved initiation form and mandatory estimator combobox.
- `frontend/src/features/admin/AdminProjectsPage.test.tsx` — list state, pagination, nullable handoff, action, and navigation coverage.
- `frontend/src/features/admin/AdminProjectDetailPage.test.tsx` — detail state and read-only boundary coverage.
- `frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx` — exact fields/payload, validation, estimator lookup, error retention, and success coverage.

### Existing files changed across tasks

- Persistence/contracts: `backend/src/repositories/types.ts`, `backend/src/repositories/memory.ts`, `backend/src/repositories/mongo.ts`, `backend/src/models/Project.ts`, `backend/src/models/Lead.ts`, `backend/src/domain/project-access.ts`, `backend/src/services/project.service.ts`, `backend/src/services/lead.service.ts`, `backend/src/seed/data.ts`, `backend/src/seed/run.ts`, `frontend/src/api/types.ts`.
- Backend composition/security: `backend/src/app.ts`, `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, `backend/src/services/auth.service.ts`, `backend/src/services/user-administration.service.ts`, `backend/src/services/lead.service.ts`, `backend/src/routes/estimates.ts`.
- Backend tests/contracts: `backend/tests/repository.test.ts`, `backend/tests/mongo-repository.test.ts`, `backend/tests/project-module-access.test.ts`, `backend/tests/leads.test.ts`, `backend/tests/full-journey.test.ts`, `backend/tests/user-administration.test.ts`, `backend/tests/user-administration-mongo.replica-set.test.ts`, `backend/tests/authorization-policy.test.ts`, `backend/tests/auth-authorization.test.ts`, `backend/tests/frontend-authorization-contract.test.ts`, `backend/tests/route-operation-registry.test.ts`, `backend/tests/audit-security.test.ts`, `backend/tests/fixtures/prompt-1-route-operations.ts`.
- Frontend composition/security: `frontend/src/api/authorization-contract.ts`, `frontend/src/test/authFixtures.ts`, `frontend/src/app/routePaths.ts`, `frontend/src/app/routeRegistry.ts`, `frontend/src/app/router.tsx`, `frontend/src/styles/access-administration.css`.
- Frontend regressions: `frontend/src/api/authorization-contract.test.ts`, `frontend/src/app/routePaths.test.ts`, `frontend/src/app/router.test.tsx`, `frontend/src/components/layout/navigation.test.tsx`, `frontend/src/components/layout/AppShell.test.tsx`, `frontend/src/features/admin/UserDirectoryPage.test.tsx`, `frontend/src/features/admin/UserMutationDialog.test.tsx`, `frontend/src/test/accessibility.test.tsx`.

---

### Task 1: Evolve Project and Lead persistence without broadening access

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/models/Project.ts`
- Modify: `backend/src/models/Lead.ts`
- Modify: `backend/src/domain/project-access.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/project.service.ts`
- Modify: `backend/src/services/lead.service.ts`
- Modify: `backend/src/seed/data.ts`
- Modify: `backend/src/seed/run.ts`
- Modify: `frontend/src/api/types.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/project-module-access.test.ts`
- Test: `backend/tests/auth.test.ts`
- Test: `backend/tests/full-journey.test.ts`

**Interfaces:**
- Consumes: Existing `ProjectRecord`, `LeadRecord`, `legacyRelationshipAllows`, memory/Mongo mapper conventions, and Mongoose schemas.
- Produces: `ProjectRecord.initiatingDesignerId: string | null`, `ProjectRecord.assignedEstimatorId: string | null`, `ProjectRecord.managerId: string | null`, `LeadRecord.projectId: string | null`, and `LeadChange` that cannot mutate `projectId` or `ownerId`.

- [ ] **Step 1: Add failing repository tests for nullable Project relationships and unique linked Leads**

Add focused cases with concrete records:

```ts
it("stores an Admin project without fabricated design relationships", async () => {
  const seed = structuredClone(demoSeedData);
  const repository = createMemoryRepository(seed);
  const record = await repository.createProject({
    ...structuredClone(seed.projects[0]!),
    id: "project-admin-1",
    name: "Admin project",
    initiatingDesignerId: null,
    assignedEstimatorId: "user-estimator-sales",
    assignedDesignerIds: [],
    managerId: null,
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T10:00:00.000Z"
  });

  expect(record).toMatchObject({
    initiatingDesignerId: null,
    assignedEstimatorId: "user-estimator-sales",
    assignedDesignerIds: [],
    managerId: null
  });
  expect(await repository.countUserResponsibilities("user-estimator-sales"))
    .toMatchObject({ initiatedActiveProjects: 0, assignedActiveProjects: 0, managedActiveProjects: 0 });
});

it("allows only one non-null Lead project link", async () => {
  const repository = createMemoryRepository(structuredClone(demoSeedData));
  const lead = {
    id: "lead-1",
    projectId: "project-admin-1",
    ownerId: "user-estimator-sales",
    clientName: "Asha Shah",
    clientEmail: "asha@example.com",
    clientMobile: "9000000000",
    projectName: "Asha home",
    location: "Pune",
    propertyType: "3BHK",
    budgetMin: 800000,
    budgetMax: 1200000,
    source: "admin_project",
    stage: "new_lead" as const,
    nextAction: "Schedule site visit",
    nextActionAt: "2026-08-25T05:00:00.000Z",
    builder: null,
    areaSqft: null,
    targetHandoverAt: null,
    notes: null,
    latestActivityAt: null,
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T10:00:00.000Z"
  };
  await repository.createLead(lead);

  await expect(
    repository.createLead({ ...lead, id: "lead-2" })
  ).rejects.toBeInstanceOf(RepositoryConflictError);
  await expect(
    repository.createLead({ ...lead, id: "lead-3", projectId: null })
  ).resolves.toMatchObject({ projectId: null });
});
```

Also add a project-module case proving null team fields do not create legacy Designer or Design Manager access, while an exact active `admin_initiator`/`projects` grant still supplies Admin access.

- [ ] **Step 2: Add failing Mongo mapping and index tests**

Assert missing legacy fields map safely and inspect the Lead schema index:

```ts
expect(mappedProject).toMatchObject({
  initiatingDesignerId: null,
  assignedEstimatorId: null,
  assignedDesignerIds: [],
  managerId: null
});

expect(LeadModel.schema.indexes()).toContainEqual([
  { projectId: 1 },
  expect.objectContaining({
    unique: true,
    partialFilterExpression: { projectId: { $type: "string" } }
  })
]);
```

- [ ] **Step 3: Run the focused tests to establish the red state**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/project-module-access.test.ts
```

Expected: FAIL because the records, mappers, schemas, and memory uniqueness rule do not yet contain the new fields.

- [ ] **Step 4: Change the shared record contracts and frontend Project/Lead contracts**

Use these exact shapes:

```ts
export interface ProjectRecord {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientEmailNormalized: string;
  clientMobile: string;
  clientAddress: string;
  initiatingDesignerId: string | null;
  assignedEstimatorId: string | null;
  assignedDesignerIds: string[];
  managerId: string | null;
  status: ProjectStatus;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadRecord {
  id: string;
  projectId: string | null;
  ownerId: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  source: string;
  stage: LeadStage;
  nextAction: string;
  nextActionAt: string;
  builder: string | null;
  areaSqft: number | null;
  targetHandoverAt: string | null;
  notes: string | null;
  latestActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LeadChange = Partial<
  Omit<LeadRecord, "id" | "projectId" | "ownerId" | "createdAt">
>;
```

Mirror the same nullability in `frontend/src/api/types.ts`:

```ts
export interface Lead {
  id: string;
  projectId: string | null;
  ownerId: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  source: string;
  stage: LeadStage;
  nextAction: string;
  nextActionAt: string;
  builder: string | null;
  areaSqft: number | null;
  targetHandoverAt: string | null;
  notes: string | null;
  latestActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientAddress: string;
  initiatingDesignerId: string | null;
  assignedEstimatorId: string | null;
  assignedDesignerIds: string[];
  managerId: string | null;
  status: ProjectStatus;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress?: number;
}
```

- [ ] **Step 5: Make the Mongoose schemas and serializers null-safe**

Use nullable defaults and the exact partial unique index:

```ts
initiatingDesignerId: { type: String, ref: "User", default: null },
assignedEstimatorId: { type: String, ref: "User", default: null },
assignedDesignerIds: { type: [String], ref: "User", default: [] },
managerId: { type: String, ref: "User", default: null }
```

```ts
projectSchema.index({ assignedEstimatorId: 1 });
leadSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { projectId: { $type: "string" } }
  }
);
```

Map legacy documents without throwing:

```ts
initiatingDesignerId:
  document.initiatingDesignerId == null ? null : String(document.initiatingDesignerId),
assignedEstimatorId:
  document.assignedEstimatorId == null ? null : String(document.assignedEstimatorId),
assignedDesignerIds: Array.isArray(document.assignedDesignerIds)
  ? document.assignedDesignerIds.map(String)
  : [],
managerId: document.managerId == null ? null : String(document.managerId)
```

Add `projectId: document.projectId == null ? null : String(document.projectId)` to `mapLead`; `leadForMongo` serializes it, while `leadChangeForMongo` never accepts it because `LeadChange` excludes it.

Normalize in-memory legacy fixtures at repository construction before uniqueness checks and timestamp discovery:

```ts
normalizedSeed.projects = normalizedSeed.projects.map((project) => ({
  ...project,
  initiatingDesignerId: project.initiatingDesignerId ?? null,
  assignedEstimatorId: project.assignedEstimatorId ?? null,
  assignedDesignerIds: project.assignedDesignerIds ?? [],
  managerId: project.managerId ?? null
}));
normalizedSeed.leads = normalizedSeed.leads.map((lead) => ({
  ...lead,
  projectId: lead.projectId ?? null
}));
```

- [ ] **Step 6: Enforce the linked-Lead uniqueness rule in memory and preserve exact relationship scope**

Before pushing a Lead in `createLead`, reject only duplicate non-null links:

```ts
if (
  input.projectId !== null &&
  state.leads.some((lead) => lead.projectId === input.projectId)
) {
  throw new RepositoryConflictError("A lead already exists for this project.");
}
```

Change `ProjectAccessRecord` to nullable team identifiers. Guard the `Set<string>.has` call in `listProjectsForDesignerIds`:

```ts
const initiated =
  project.initiatingDesignerId !== null && ids.has(project.initiatingDesignerId);
return initiated || project.assignedDesignerIds.some((id) => ids.has(id));
```

Keep grant filtering and legacy predicates exact; comparisons against `null` return false and must never be replaced with wildcard behavior.

- [ ] **Step 7: Update seed and test builders with explicit legacy nulls**

Set `assignedEstimatorId: null` in the shared `project()` seed builder and in the existing Designer `ProjectService.create` record. Set `projectId: null` in the existing Estimator/Sales `LeadService.create` record and every `LeadRecord` test builder. Ensure seed serialization retains null values. Existing Designer-created project fixtures keep their real initiating Designer and Design Manager IDs.

- [ ] **Step 8: Run focused tests and both typecheckers**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/project-module-access.test.ts tests/auth.test.ts tests/full-journey.test.ts
npm run typecheck
cd ../frontend
npm run typecheck
```

Expected: all commands PASS; no Project consumer assumes nullable IDs are strings, and existing Designer project behavior remains covered.

- [ ] **Step 9: Commit the domain evolution**

```bash
git add backend/src/repositories/types.ts backend/src/models/Project.ts backend/src/models/Lead.ts backend/src/domain/project-access.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/project.service.ts backend/src/services/lead.service.ts backend/src/seed/data.ts backend/src/seed/run.ts frontend/src/api/types.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/project-module-access.test.ts backend/tests/auth.test.ts backend/tests/full-journey.test.ts
git commit -m "feat: add admin project handoff links"
```

---

### Task 2: Add the scoped Admin project read model to both repositories

**Files:**
- Create: `backend/src/repositories/admin-project-summary.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/project-module-access.test.ts`

**Interfaces:**
- Consumes: Task 1's nullable `ProjectRecord` and linked `LeadRecord`, existing `PageResult<T>`/`PaginationInput`, exact grant scope, `UserModel`, and `EstimateModel`.
- Produces: `EstimatorOption`, `EstimateSummaryRecord`, `AdminProjectSummary`, optional `SeedData.estimateSummaries`, and repository methods `pageAdminProjects`, `findAdminProject`, and `pageActiveEstimatorOptions`, with exact `createdAt DESC, id DESC` project ordering.

- [ ] **Step 1: Write failing memory read-model tests**

Cover stable order, post-scope pagination, joins, and nullable fallbacks:

```ts
const first = await repository.pageAdminProjects(adminA, { limit: 1, offset: 0 });
expect(first.total).toBe(2);
expect(first.items.map(({ id }) => id)).toEqual(["project-newer"]);
expect(first.items[0]).toMatchObject({
  estimator: { id: estimator.id, name: estimator.name, email: estimator.email },
  lead: { id: "lead-newer", stage: "new_lead" },
  estimate: { id: "estimate-newer", status: "draft", total: 118000 }
});

const hidden = await repository.findAdminProject(adminB, "project-newer");
expect(hidden).toBeNull();

const exceptional = await repository.findAdminProject(superAdmin, "project-legacy");
expect(exceptional).toMatchObject({ estimator: null, lead: null, estimate: null });
```

Use two projects with identical `createdAt` values and assert descending ID is the tie-breaker. Include inactive, wrong-source, wrong-module, and other-Admin grants and assert none changes Admin A's `total`.

- [ ] **Step 2: Write failing estimator-option tests**

```ts
const page = await repository.pageActiveEstimatorOptions("asha", {
  limit: 20,
  offset: 0
});

expect(page.items).toEqual([
  { id: "estimator-active", name: "Asha Rao", email: "asha@example.com", title: null }
]);
expect(JSON.stringify(page)).not.toContain("mobile");
expect(JSON.stringify(page)).not.toContain("address");
```

Seed an inactive Estimator/Sales user and active users in other roles; assert they are absent. Assert name/email search is case-insensitive and results use name then ID ordering.

- [ ] **Step 3: Write failing Mongo query tests**

Assert the project query receives the resolved scope before joins, uses `.sort({ createdAt: -1, _id: -1 })`, applies skip/limit to scoped projects, and only then queries Lead/User/Estimate IDs. Assert detail combines `_id` with the exact scope through `$and` and returns null for an out-of-scope ID.

- [ ] **Step 4: Run the focused repository tests to establish the red state**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/project-module-access.test.ts
```

Expected: FAIL because the three read-model methods and DTOs do not exist.

- [ ] **Step 5: Add the exact repository transport types**

Add these contracts to `backend/src/repositories/types.ts`:

```ts
export interface EstimatorOption {
  id: string;
  name: string;
  email: string;
  title: string | null;
}

export interface EstimateSummaryRecord {
  id: string;
  leadId: string;
  projectId: string | null;
  status: string;
  total: number;
}

export interface AdminProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  location: string;
  client: { name: string; email: string; mobile: string };
  propertyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  estimator: {
    id: string;
    name: string;
    email: string;
  } | null;
  lead: {
    id: string;
    stage: LeadStage;
    nextAction: string;
    nextActionAt: string;
  } | null;
  estimate: {
    id: string;
    status: string;
    total: number;
  } | null;
  createdAt: string;
}
```

Add `estimateSummaries?: EstimateSummaryRecord[]` to `SeedData`, then add the exact repository methods:

```ts
pageAdminProjects(
  actor: UserRecord,
  pagination: PaginationInput
): Promise<PageResult<AdminProjectSummary>>;
findAdminProject(
  actor: UserRecord,
  projectId: string
): Promise<AdminProjectSummary | null>;
pageActiveEstimatorOptions(
  search: string,
  pagination: PaginationInput
): Promise<PageResult<EstimatorOption>>;
```

Set `estimateSummaries: []` in `demoSeedData` so the canonical seed is explicit while older test/application seeds remain compatible through the optional property.

- [ ] **Step 6: Implement memory ordering, scope-first paging, and joins**

Normalize `estimateSummaries` to `[]` in `createMemoryRepository`. Build visible projects with the existing exact module-scope function, then sort and slice before looking up relationships:

```ts
const newestFirst = (left: ProjectRecord, right: ProjectRecord) =>
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
  right.id.localeCompare(left.id);

const visible = (await implementation.listProjectsForUserInModule(actor, "projects"))
  .sort(newestFirst);
const selected = visible.slice(pagination.offset, pagination.offset + pagination.limit);
return {
  items: selected.map((project) =>
    adminProjectSummary(project, state.users, state.leads, state.estimateSummaries ?? [])
  ),
  total: visible.length
};
```

Define the pure mapper in `backend/src/repositories/admin-project-summary.ts` and import it from both adapters. Join an Estimate by its linked Lead ID first and fall back to `estimate.projectId === project.id`. Map only the approved summary fields; in particular, omit Estimator `title` from the project summary even though selector options include it.

```ts
function adminProjectSummary(
  project: ProjectRecord,
  users: UserRecord[],
  leads: LeadRecord[],
  estimates: EstimateSummaryRecord[]
): AdminProjectSummary {
  const lead = leads.find((candidate) => candidate.projectId === project.id) ?? null;
  const estimator = project.assignedEstimatorId === null
    ? null
    : users.find((candidate) => candidate.id === project.assignedEstimatorId) ?? null;
  const estimate =
    (lead
      ? estimates.find((candidate) => candidate.leadId === lead.id)
      : undefined) ??
    estimates.find((candidate) => candidate.projectId === project.id) ??
    null;
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    location: project.location,
    client: {
      name: project.clientName,
      email: project.clientEmail,
      mobile: project.clientMobile
    },
    propertyType: lead?.propertyType ?? null,
    budgetMin: lead?.budgetMin ?? null,
    budgetMax: lead?.budgetMax ?? null,
    estimator: estimator
      ? { id: estimator.id, name: estimator.name, email: estimator.email }
      : null,
    lead: lead
      ? {
          id: lead.id,
          stage: lead.stage,
          nextAction: lead.nextAction,
          nextActionAt: lead.nextActionAt
        }
      : null,
    estimate: estimate
      ? { id: estimate.id, status: estimate.status, total: estimate.total }
      : null,
    createdAt: project.createdAt
  };
}
```

`findAdminProject` must search only the already scoped project collection.

- [ ] **Step 7: Implement Mongo scope-first paging and batched joins**

Resolve `projectFilterForUserInModule(actor, "projects")`; return an empty page when it is null. Query and count scoped Project rows, sorted by `{ createdAt: -1, _id: -1 }`, before issuing joins. Batch the joins:

```ts
const projectIds = documents.map((document) => String(document._id));
const leads = await LeadModel.find({ projectId: { $in: projectIds } }).lean();
const leadIds = leads.map((lead) => String(lead._id));
const estimatorIds = documents
  .map((project) => project.assignedEstimatorId)
  .filter((id): id is string => typeof id === "string");
const [estimators, estimates] = await Promise.all([
  UserModel.find({ _id: { $in: estimatorIds } })
    .select({ _id: 1, name: 1, email: 1, title: 1 })
    .lean(),
  EstimateModel.find({
    $or: [
      { projectId: { $in: projectIds } },
      { leadId: { $in: leadIds } }
    ]
  }).select({ _id: 1, leadId: 1, projectId: 1, status: 1, total: 1 }).lean()
]);
```

Apply the repository session to every query. Detail uses `{ $and: [{ _id: projectId }, scopeFilter] }`. The option query filters `{ role: "estimator_sales", active: true }`, applies an escaped name/email regex when search is non-empty, sorts `{ name: 1, _id: 1 }`, and selects only `_id`, `name`, `email`, and `title`.

- [ ] **Step 8: Run focused tests and backend typecheck**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/project-module-access.test.ts
npm run typecheck
```

Expected: PASS, including deterministic paging and nullable legacy/global projections.

- [ ] **Step 9: Commit the repository read model**

```bash
git add backend/src/repositories/admin-project-summary.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/seed/data.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/project-module-access.test.ts
git commit -m "feat: add scoped admin project read model"
```

---

### Task 3: Add the atomic Admin initiation API and lock user administration to Super Admin

**Files:**
- Create: `backend/src/services/admin-project.service.ts`
- Create: `backend/src/routes/admin-projects.ts`
- Create: `backend/tests/admin-projects.test.ts`
- Create: `backend/tests/admin-projects-mongo.replica-set.test.ts`
- Create: `backend/tests/fixtures/prompt-2-route-operations.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/domain/authorization.ts`
- Modify: `backend/src/domain/route-operations.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/services/user-administration.service.ts`
- Modify: `frontend/src/api/authorization-contract.ts`
- Modify: `backend/tests/fixtures/prompt-1-route-operations.ts`
- Modify: `backend/tests/route-operation-registry.test.ts`
- Modify: `backend/tests/authorization-policy.test.ts`
- Modify: `backend/tests/auth-authorization.test.ts`
- Modify: `backend/tests/frontend-authorization-contract.test.ts`
- Modify: `backend/tests/user-administration.test.ts`
- Modify: `backend/tests/user-administration-mongo.replica-set.test.ts`
- Modify: `backend/tests/audit-security.test.ts`
- Modify: `frontend/src/api/authorization-contract.test.ts`

**Interfaces:**
- Consumes: Task 2's `pageAdminProjects`, `findAdminProject`, `pageActiveEstimatorOptions`, existing `AuditService`, `Clock`, `requireActor`, client-email coordination, access-grant creation, and pagination envelopes.
- Produces: `InitiateAdminProjectInput`, `AdminProjectService`, `createAdminProjectService(repository, audit, clock)`, `createAdminProjectsRouter(auth, service)`, four `/api/v1/admin/*` routes, two new permissions, `prompt_2` operation rows, and policy version `2026-08-23.prompt-2`.

- [ ] **Step 1: Write failing authorization and user-directory lockdown tests**

Assert the exact regular Admin permission set contains the project permissions and excludes the directory permissions:

```ts
expect(ROLE_PERMISSIONS.admin).toEqual([
  "identity.self.read",
  "projects.list",
  "projects.read",
  "projects.initiate",
  "organization.estimators.read",
  "identity.authorization.read",
  "access_request.review.read",
  "access_request.review.decide",
  "project_access_grant.revoke"
]);
expect(ROLE_PERMISSIONS.admin).not.toContain("identity.users.read");
expect(ROLE_PERMISSIONS.admin).not.toContain("identity.users.update");
```

Add route tests proving Admin receives `403` for both `GET /api/v1/admin/users` and `PATCH /api/v1/admin/users/:userId`, while Super Admin still lists and updates. Add direct service tests so a forged call bypassing middleware also receives `403`.

- [ ] **Step 2: Write the four failing operation-registry expectations**

Create `prompt-2-route-operations.ts` with these exact rows:

```ts
export const EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS = [
  { key: "GET /admin/projects", permission: "projects.list", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" },
  { key: "GET /admin/projects/:projectId", permission: "projects.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" },
  { key: "POST /admin/projects", permission: "projects.initiate", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_2" },
  { key: "GET /admin/estimators", permission: "organization.estimators.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" }
] as const;
```

Extend the fixture availability union to `"baseline" | "prompt_1" | "prompt_2"`. Assert all 97 normative rows and assert one new router mounts all four routes with authentication before exactly one matching operation marker.

- [ ] **Step 3: Write failing Admin initiation route tests**

In `admin-projects.test.ts`, cover:

```ts
const response = await adminAgent
  .post("/api/v1/admin/projects")
  .send({
    clientName: "Asha Shah",
    clientEmail: "ASHA@example.com",
    clientMobile: "+91 90000 00000",
    projectName: "Asha home",
    location: "Pune",
    propertyType: "3BHK",
    budgetMin: 800000,
    budgetMax: 1200000,
    nextAction: "Schedule site visit",
    nextActionAt: "2026-08-25T10:30:00+05:30",
    estimatorId: estimator.id
  })
  .expect(201);

expect(response.body.data).toMatchObject({
  name: "Asha home",
  estimator: { id: estimator.id },
  lead: { stage: "new_lead" },
  estimate: null
});
```

Assert missing `estimatorId`, `source`, any unknown field, reversed budgets, negative budgets, and a timestamp without an offset receive `400` with the relevant field key. Assert missing/inactive/wrong-role estimator IDs all return the same safe `estimatorId` message. Assert an email owned by an internal account returns the safe `clientEmail` error, while an existing Client email sets `project.clientId` to that Client. Change the stored Admin role after issuing its token and assert commit-time actor reload rejects the request without writes. Assert Super Admin receives `403` on POST.

- [ ] **Step 4: Write failing scope, options, audit, and rollback tests**

Prove Admin A lists/reads only its exact granted projects; Admin B sees an empty page and gets `404` for Admin A's ID. Prove options never expose mobile/address/roles. After a successful create, assert exactly one Project, one active grant, and one linked Lead with:

```ts
expect(project).toMatchObject({
  initiatingDesignerId: null,
  assignedEstimatorId: estimator.id,
  assignedDesignerIds: [],
  managerId: null,
  status: "planning"
});
expect(
  new Date(project.plannedEndAt).getTime() -
    new Date(project.plannedStartAt).getTime()
).toBe(90 * 24 * 60 * 60 * 1000);
expect(grant).toMatchObject({
  userId: admin.id,
  projectId: project.id,
  module: "projects",
  source: "admin_initiator",
  grantedById: admin.id,
  active: true
});
expect(lead).toMatchObject({
  projectId: project.id,
  ownerId: estimator.id,
  source: "admin_project",
  stage: "new_lead"
});
```

Inject one failure at `createProject`, `createProjectAccessGrant`, `createLead`, first `appendAuditEvent`, second `appendAuditEvent`, and third `appendAuditEvent` through a transaction-wrapping repository proxy that counts audit appends. After every failure, assert zero new Projects, grants, Leads, and audits in both memory and Mongo replica-set suites.

- [ ] **Step 5: Run the new and contract tests to establish the red state**

Run:

```bash
cd backend
npm test -- tests/admin-projects.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts tests/user-administration.test.ts tests/audit-security.test.ts
```

Expected: FAIL because permissions, policy version, operations, service, routes, and lockdown are absent.

- [ ] **Step 6: Implement the final authorization catalog and Super Admin-only service guard**

Add `projects.initiate` and `organization.estimators.read` to both permission vocabularies and to Super Admin. Use the exact Admin set from Step 1. Set both policy constants to:

```ts
export const AUTHORIZATION_POLICY_VERSION = "2026-08-23.prompt-2" as const;
```

Change `HumanJwtOperation.availability` to include `prompt_2` and append the four exact rows. Replace `requireAdministrativeActor` with a guard returning `UserRecord & { role: "super_admin" }`; remove Admin-only target-management branches and let missing targets retain the existing Super Admin `404` behavior.

- [ ] **Step 7: Implement the Admin project service contract**

Define:

```ts
export interface InitiateAdminProjectInput {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number;
  budgetMax: number;
  nextAction: string;
  nextActionAt: string;
  estimatorId: string;
}

export interface AdminProjectService {
  list(actor: PublicUser, pagination: PaginationInput): Promise<PageResult<AdminProjectSummary>>;
  get(actor: PublicUser, projectId: string): Promise<AdminProjectSummary>;
  estimators(actor: PublicUser, search: string, pagination: PaginationInput): Promise<PageResult<EstimatorOption>>;
  initiate(actor: PublicUser, input: InitiateAdminProjectInput): Promise<AdminProjectSummary>;
}
```

For list/get/options, reload the actor and allow only `admin` or `super_admin`; use the repository scope and return the generic `404` when detail is null. Start initiation with the exact stored-actor, estimator, and client-email checks inside the transaction:

```ts
return repository.runInTransaction(async (tx) => {
  const admin = await requireActor(tx, actor);
  if (admin.role !== "admin") forbidden();

  const estimator = await tx.findUserById(input.estimatorId);
  if (!estimator || !estimator.active || estimator.role !== "estimator_sales") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Request validation failed.",
      { estimatorId: "Select an active Estimator/Sales user." }
    );
  }

  const emailNormalized = normalizeEmail(input.clientEmail);
  await tx.coordinateClientEmail(emailNormalized);
  const existingClient = await tx.findUserByEmail(emailNormalized);
  if (existingClient && existingClient.role !== "client") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Request validation failed.",
      { clientEmail: "This email belongs to an internal account." }
    );
  }
```

Then construct:

```ts
const occurredAt = clock();
const plannedEndAt = new Date(occurredAt);
plannedEndAt.setUTCDate(plannedEndAt.getUTCDate() + 90);

const project: ProjectRecord = {
  id: `project-${randomUUID()}`,
  name: input.projectName,
  clientId: existingClient?.id ?? null,
  clientName: input.clientName,
  clientEmail: input.clientEmail,
  clientEmailNormalized: normalizeEmail(input.clientEmail),
  clientMobile: input.clientMobile,
  clientAddress: input.location,
  initiatingDesignerId: null,
  assignedEstimatorId: estimator.id,
  assignedDesignerIds: [],
  managerId: null,
  status: "planning",
  location: input.location,
  plannedStartAt: occurredAt.toISOString(),
  plannedEndAt: plannedEndAt.toISOString(),
  actualStartAt: null,
  actualEndAt: null,
  createdAt: occurredAt.toISOString(),
  updatedAt: occurredAt.toISOString()
};
```

Create the Project, grant, and Lead with these exact writes, then append the three allowlisted audits:

```ts
const createdProject = await tx.createProject(project);
const grant = await tx.createProjectAccessGrant({
  projectId: createdProject.id,
  userId: admin.id,
  module: "projects",
  source: "admin_initiator",
  accessRequestId: null,
  grantedById: admin.id,
  grantedAt: occurredAt.toISOString(),
  createdAt: occurredAt.toISOString(),
  updatedAt: occurredAt.toISOString()
});
const lead = await tx.createLead({
  id: `lead-${randomUUID()}`,
  projectId: createdProject.id,
  ownerId: estimator.id,
  clientName: input.clientName,
  clientEmail: input.clientEmail,
  clientMobile: input.clientMobile,
  projectName: input.projectName,
  location: input.location,
  propertyType: input.propertyType,
  budgetMin: input.budgetMin,
  budgetMax: input.budgetMax,
  source: "admin_project",
  stage: "new_lead",
  nextAction: input.nextAction,
  nextActionAt: input.nextActionAt,
  builder: null,
  areaSqft: null,
  targetHandoverAt: null,
  notes: null,
  latestActivityAt: null,
  createdAt: occurredAt.toISOString(),
  updatedAt: occurredAt.toISOString()
});

await audit.append({
  actorId: admin.id,
  action: "project_created",
  entityType: "project",
  entityId: createdProject.id,
  occurredAt: occurredAt.toISOString(),
  newValues: {
    status: "planning",
    assignedEstimatorId: estimator.id
  }
}, tx);
await audit.append({
  actorId: admin.id,
  action: "project_access.granted",
  entityType: "project_access_grant",
  entityId: grant.id,
  occurredAt: occurredAt.toISOString(),
  newValues: {
    projectId: createdProject.id,
    userId: admin.id,
    module: "projects",
    source: "admin_initiator"
  }
}, tx);
await audit.append({
  actorId: admin.id,
  action: "lead_created",
  entityType: "lead",
  entityId: lead.id,
  occurredAt: occurredAt.toISOString(),
  newValues: {
    stage: "new_lead",
    projectId: createdProject.id,
    ownerId: estimator.id
  }
}, tx);
```

Return the transaction-scoped projection and close the transaction callback:

```ts
const summary = await tx.findAdminProject(admin, createdProject.id);
if (!summary) {
  throw new Error("The created Admin project could not be read in its transaction.");
}
return summary;
});
```

- [ ] **Step 8: Implement strict route schemas and app composition**

Use a strict initiation schema with trimmed non-empty strings, email validation, non-negative numeric budgets, offset-aware `z.string().datetime({ offset: true })`, and a `budgetMax` refinement. The selector query uses search max 100, limit 1–50 default 20, and non-negative offset. List uses the existing pagination shape.

```ts
const initiationSchema = z.object({
  clientName: z.string().trim().min(1),
  clientEmail: z.string().trim().email(),
  clientMobile: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  location: z.string().trim().min(1),
  propertyType: z.string().trim().min(1),
  budgetMin: z.number().nonnegative(),
  budgetMax: z.number().nonnegative(),
  nextAction: z.string().trim().min(1),
  nextActionAt: z.string().datetime({ offset: true }),
  estimatorId: z.string().trim().min(1)
}).strict().refine(
  (value) => value.budgetMax >= value.budgetMin,
  {
    path: ["budgetMax"],
    message: "Maximum budget must be at least the minimum budget."
  }
);
const listQuerySchema = z.object(paginationShape).strict();
const estimatorQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();
```

Mount in this order inside one router:

```ts
router.get(
  "/admin/projects",
  protectedRoute,
  requireOperation("GET /admin/projects"),
  validateQuery(listQuerySchema),
  async (request, response, next) => {
    try {
      const pagination = response.locals.validatedQuery;
      response.json({
        data: paginatedEnvelope(
          await service.list(request.authenticatedUser!, pagination),
          pagination
        )
      });
    } catch (error) {
      next(error);
    }
  }
);
router.get(
  "/admin/estimators",
  protectedRoute,
  requireOperation("GET /admin/estimators"),
  validateQuery(estimatorQuerySchema),
  async (request, response, next) => {
    try {
      const { search, ...pagination } = response.locals.validatedQuery;
      response.json({
        data: paginatedEnvelope(
          await service.estimators(request.authenticatedUser!, search, pagination),
          pagination
        )
      });
    } catch (error) {
      next(error);
    }
  }
);
router.post(
  "/admin/projects",
  protectedRoute,
  requireOperation("POST /admin/projects"),
  validateBody(initiationSchema),
  async (request, response, next) => {
    try {
      response.status(201).json({
        data: await service.initiate(request.authenticatedUser!, request.body)
      });
    } catch (error) {
      next(error);
    }
  }
);
router.get(
  "/admin/projects/:projectId",
  protectedRoute,
  requireOperation("GET /admin/projects/:projectId"),
  async (request, response, next) => {
    try {
      response.json({
        data: await service.get(
          request.authenticatedUser!,
          request.params.projectId as string
        )
      });
    } catch (error) {
      next(error);
    }
  }
);
```

Return paginated envelopes for list/options, `201` for create, and `{ data: summary }` for detail/create. Construct `adminProjectService` in `createApp` and mount `createAdminProjectsRouter` under `/api/v1` adjacent to `createAdminUsersRouter`.

- [ ] **Step 9: Run memory, Mongo, security, and contract tests**

Run:

```bash
cd backend
npm test -- tests/admin-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts tests/user-administration.test.ts tests/user-administration-mongo.replica-set.test.ts tests/audit-security.test.ts
npm run typecheck
cd ../frontend
npm test -- src/api/authorization-contract.test.ts
npm run typecheck
```

Expected: PASS; Admin directory requests are denied at middleware and service layers, Super Admin tests remain green, and initiation is atomic in both adapters.

- [ ] **Step 10: Commit the Admin API and authorization boundary**

```bash
git add backend/src/services/admin-project.service.ts backend/src/routes/admin-projects.ts backend/src/app.ts backend/src/domain/authorization.ts backend/src/domain/route-operations.ts backend/src/services/auth.service.ts backend/src/services/user-administration.service.ts frontend/src/api/authorization-contract.ts backend/tests/admin-projects.test.ts backend/tests/admin-projects-mongo.replica-set.test.ts backend/tests/fixtures/prompt-2-route-operations.ts backend/tests/fixtures/prompt-1-route-operations.ts backend/tests/route-operation-registry.test.ts backend/tests/authorization-policy.test.ts backend/tests/auth-authorization.test.ts backend/tests/frontend-authorization-contract.test.ts backend/tests/user-administration.test.ts backend/tests/user-administration-mongo.replica-set.test.ts backend/tests/audit-security.test.ts frontend/src/api/authorization-contract.test.ts
git commit -m "feat: let admins initiate scoped projects"
```

---

### Task 4: Protect linked Leads and propagate their Project into Estimate drafts

**Files:**
- Modify: `backend/src/services/lead.service.ts`
- Modify: `backend/src/routes/estimates.ts`
- Modify: `frontend/src/api/types.ts`
- Test: `backend/tests/leads.test.ts`
- Test: `backend/tests/admin-projects.test.ts`

**Interfaces:**
- Consumes: Task 1's `LeadRecord.projectId`, Task 3's generated linked Lead invariant, existing Lead owner authorization, and existing `EstimateModel.projectId`.
- Produces: `LINKED_LEAD_IDENTITY_IMMUTABLE` conflict behavior and `ESTIMATE_PROJECT_CONFLICT` behavior; every saved draft for a linked Lead returns the same project ID.

- [ ] **Step 1: Write failing linked-Lead mutation tests**

For a Lead with `projectId: "project-admin-1"`, assert PATCH requests containing `clientName`, `clientEmail`, `clientMobile`, `projectName`, `location`, or `source` receive `409` and a field-addressable error. Assert `projectId` and `ownerId` are rejected as unrecognized request fields with `400`. Then prove live fields still work:

```ts
await estimatorAgent.patch(`/api/v1/leads/${lead.id}`).send({
  propertyType: "4BHK",
  budgetMin: 1000000,
  budgetMax: 1500000,
  stage: "contacted",
  nextAction: "Confirm site visit",
  nextActionAt: "2026-08-27T10:00:00+05:30"
}).expect(200);
```

- [ ] **Step 2: Write failing estimate-link propagation and conflict tests**

Cover all three states:

```ts
expect(firstSave.body.data.projectId).toBe(linkedLead.projectId);
expect(backfilledSave.body.data.projectId).toBe(linkedLead.projectId);
expect(conflictingSave.status).toBe(409);
expect(conflictingSave.body.error.code).toBe("ESTIMATE_PROJECT_CONFLICT");
expect(saveSpy).not.toHaveBeenCalled();
```

Keep the existing unique-Lead Estimate test to prove a second Estimate is not created.

- [ ] **Step 3: Run the focused Lead/Estimate tests to establish the red state**

Run:

```bash
cd backend
npm test -- tests/leads.test.ts tests/admin-projects.test.ts
```

Expected: FAIL because linked identity fields remain mutable and draft save ignores the Lead project ID.

- [ ] **Step 4: Add the linked identity guard in `LeadService.update`**

Before starting the update transaction, reject any submitted immutable key for a linked Lead:

```ts
const LINKED_IDENTITY_FIELDS = [
  "clientName",
  "clientEmail",
  "clientMobile",
  "projectName",
  "location",
  "source"
] as const;

function assertLinkedIdentityIsUnchanged(
  current: LeadRecord,
  input: UpdateLeadInput
): void {
  if (current.projectId === null) return;
  const fields = Object.fromEntries(
    LINKED_IDENTITY_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(input, field))
      .map((field) => [field, "This field is managed by the linked project."])
  );
  if (Object.keys(fields).length > 0) {
    throw new ApiError(
      409,
      "LINKED_LEAD_IDENTITY_IMMUTABLE",
      "Linked project identity fields cannot be changed from the lead workspace.",
      fields
    );
  }
}
```

Call it after owner authorization and before `runInTransaction`. Do not block property type, budgets, stage, next action, next-action date, or follow-up activity.

- [ ] **Step 5: Copy, backfill, and validate Project IDs before Estimate mutation**

Immediately after loading the Lead and existing Estimate:

```ts
const leadProjectId = lead.projectId ?? null;
const estimateProjectId = estimate?.projectId ?? null;
if (
  leadProjectId !== null &&
  estimateProjectId !== null &&
  leadProjectId !== estimateProjectId
) {
  throw new ApiError(
    409,
    "ESTIMATE_PROJECT_CONFLICT",
    "The estimate and lead are linked to different projects."
  );
}

if (!estimate) {
  estimate = new EstimateModel({
    _id: `estimate-${randomUUID()}`,
    leadId: lead.id,
    ownerId: req.authenticatedUser!.id,
    projectId: leadProjectId,
    version: 1,
    status: "draft"
  });
} else if (estimate.projectId == null && leadProjectId !== null) {
  estimate.projectId = leadProjectId;
}
```

Perform this conflict check before changing property type, rooms, scopes, line items, totals, status, or version. Ensure the frontend `Lead` type still exposes `projectId: string | null` and existing Estimate transport already maps nullable `projectId`.

- [ ] **Step 6: Run focused tests and backend typecheck**

Run:

```bash
cd backend
npm test -- tests/leads.test.ts tests/admin-projects.test.ts
npm run typecheck
```

Expected: PASS, including generated Lead visibility for only the assigned estimator and existing Super Admin global reads.

- [ ] **Step 7: Commit the linked draft safeguards**

```bash
git add backend/src/services/lead.service.ts backend/src/routes/estimates.ts frontend/src/api/types.ts backend/tests/leads.test.ts backend/tests/admin-projects.test.ts
git commit -m "feat: carry admin project links into estimates"
```

---

### Task 5: Reuse the pre-created Project during client approval

**Files:**
- Create: `backend/src/services/estimate-project-handoff.ts`
- Modify: `backend/src/routes/estimates.ts`
- Test: `backend/tests/leads.test.ts`
- Test: `backend/tests/full-journey.test.ts`

**Interfaces:**
- Consumes: Task 4's aligned Lead/Estimate project ID, existing approval readiness and team resolution, `ClientSession`, `ProjectModel`, and the existing 90-day legacy Project shape.
- Produces: `resolveApprovalProject(input): Promise<string>`, `PROJECT_LINK_CONFLICT` failures, a linked reuse branch with no Project creation, and the unchanged legacy creation branch.

- [ ] **Step 1: Extend the full journey with a failing linked-project approval case**

Preload one Admin Project, its active initiator grant, linked Lead, and sent Estimate. Approve as the matching Client and assert:

```ts
expect(await ProjectModel.countDocuments()).toBe(projectCountBefore);
expect(await ProjectAccessGrantModel.countDocuments({
  projectId: adminProject.id,
  source: "admin_initiator",
  active: true
})).toBe(1);
expect(updatedProject).toMatchObject({
  _id: adminProject.id,
  clientId: client.id,
  initiatingDesignerId: null,
  assignedEstimatorId: estimator.id,
  assignedDesignerIds: [designer.id],
  managerId: manager.id
});
expect(updatedEstimate).toMatchObject({
  status: "client_approved",
  projectId: adminProject.id
});
```

Extend the existing `full-journey.test.ts` in-memory model harness with a mutable Project collection plus transaction-aware `ProjectModel.findById` and `ProjectModel.updateOne` fakes. Preserve its current `ProjectModel.create` spy so the linked case can assert it was not called and the legacy case can assert it was called once.

Retain the existing legacy journey assertion that a null-linked Lead creates exactly one Project with the assigned Designer as `initiatingDesignerId`.

- [ ] **Step 2: Add failing closed conflict and rollback cases**

In `leads.test.ts`, use the existing `startMongoReplicaSet` helper for a real-session suite. Test a missing linked Project, null-Estimate/non-null-Lead link, different non-null Lead/Estimate IDs, mismatched Estimate/Lead owners, mismatched `assignedEstimatorId`, non-null `initiatingDesignerId`, and conflicting project identity. Every case must return `409 PROJECT_LINK_CONFLICT`; Project, Estimate, Lead, grant, and audit rows must remain unchanged after the transaction. Include one successful replica-set approval and assert the Project count is unchanged.

- [ ] **Step 3: Run the approval suites to establish the red state**

Run:

```bash
cd backend
npm test -- tests/leads.test.ts tests/full-journey.test.ts
```

Expected: FAIL because approval always creates a new Project.

- [ ] **Step 4: Create the Mongoose-session project resolver**

Define the exact input:

```ts
export interface ResolveApprovalProjectInput {
  estimate: { projectId: string | null; ownerId: string };
  lead: {
    projectId: string | null;
    ownerId: string;
    projectName: string;
    clientName: string;
    clientEmail: string;
    clientMobile: string;
    location: string;
  };
  clientId: string;
  assignedDesignerId: string;
  managerId: string;
  occurredAt: Date;
  session: ClientSession;
}

function projectLinkConflict(): ApiError {
  return new ApiError(
    409,
    "PROJECT_LINK_CONFLICT",
    "The linked project no longer matches this estimate."
  );
}
```

- [ ] **Step 5: Implement both legacy creation and linked-project reuse**

Use one complete resolver. A null Estimate link is valid only when the Lead link is also null. A non-null link must load, validate, and compare-and-set the pre-created Project in the same session:

```ts
export async function resolveApprovalProject(
  input: ResolveApprovalProjectInput
): Promise<string> {
  const {
    estimate,
    lead,
    clientId,
    assignedDesignerId,
    managerId,
    occurredAt,
    session
  } = input;

  if (estimate.projectId === null) {
    if (lead.projectId !== null) throw projectLinkConflict();
    const plannedEndAt = new Date(occurredAt);
    plannedEndAt.setUTCDate(plannedEndAt.getUTCDate() + 90);
    const projectId = `project-${randomUUID()}`;
    await ProjectModel.create([{
      _id: projectId,
      name: lead.projectName,
      clientId,
      clientName: lead.clientName,
      clientEmail: lead.clientEmail,
      clientEmailNormalized: normalizeEmail(lead.clientEmail),
      clientMobile: lead.clientMobile,
      clientAddress: lead.location,
      initiatingDesignerId: assignedDesignerId,
      assignedEstimatorId: null,
      assignedDesignerIds: [assignedDesignerId],
      managerId,
      status: "planning",
      location: lead.location,
      plannedStartAt: occurredAt,
      plannedEndAt
    }], { session });
    return projectId;
  }

  const project = await ProjectModel.findById(estimate.projectId)
    .session(session)
    .lean();
  if (!project) throw projectLinkConflict();

  const identityMatches =
    String(project._id) === estimate.projectId &&
    lead.projectId === estimate.projectId &&
    estimate.ownerId === lead.ownerId &&
    project.assignedEstimatorId === lead.ownerId &&
    project.initiatingDesignerId == null &&
    project.managerId == null &&
    Array.isArray(project.assignedDesignerIds) &&
    project.assignedDesignerIds.length === 0 &&
    project.status === "planning" &&
    (project.clientId == null || String(project.clientId) === clientId) &&
    project.name === lead.projectName &&
    project.clientName === lead.clientName &&
    project.clientEmailNormalized === normalizeEmail(lead.clientEmail) &&
    project.clientMobile === lead.clientMobile &&
    project.clientAddress === lead.location &&
    project.location === lead.location;
  if (!identityMatches) throw projectLinkConflict();

  const result = await ProjectModel.updateOne(
    {
      _id: estimate.projectId,
      assignedEstimatorId: lead.ownerId,
      initiatingDesignerId: null,
      assignedDesignerIds: { $size: 0 },
      managerId: null,
      status: "planning"
    },
    {
      $set: {
        clientId,
        assignedDesignerIds: [assignedDesignerId],
        managerId,
        updatedAt: occurredAt
      }
    },
    { session }
  );
  if (result.matchedCount !== 1) throw projectLinkConflict();
  return estimate.projectId;
}
```

Do not set `initiatingDesignerId`, do not create or revoke grants in the linked branch, and do not change the Project identity fields.

- [ ] **Step 6: Replace unconditional Project creation in the approval route**

Keep readiness and Designer/Manager resolution where they are. Replace the existing `ProjectModel.create` block with:

```ts
const projectId = await resolveApprovalProject({
  estimate: {
    projectId: estimate.projectId == null ? null : String(estimate.projectId),
    ownerId: String(estimate.ownerId)
  },
  lead: {
    projectId: lead.projectId == null ? null : String(lead.projectId),
    ownerId: String(lead.ownerId),
    projectName: lead.projectName,
    clientName: lead.clientName,
    clientEmail: lead.clientEmail,
    clientMobile: lead.clientMobile,
    location: lead.location
  },
  clientId: req.authenticatedUser!.id,
  assignedDesignerId: String(assigned._id),
  managerId: String(manager._id),
  occurredAt,
  session
});
```

Leave the existing Estimate CAS update, Lead transition to `won`, notification recipients, drawing freeze, review, and audit logic intact, all using the returned ID.

- [ ] **Step 7: Run approval, legacy, and type tests**

Run:

```bash
cd backend
npm test -- tests/leads.test.ts tests/full-journey.test.ts
npm run typecheck
```

Expected: PASS; the linked Project count does not increase, conflict cases roll back, and the legacy count increases by exactly one.

- [ ] **Step 8: Commit approval-time identity reuse**

```bash
git add backend/src/services/estimate-project-handoff.ts backend/src/routes/estimates.ts backend/tests/leads.test.ts backend/tests/full-journey.test.ts
git commit -m "feat: reuse admin projects at estimate approval"
```

---

### Task 6: Build the frontend Admin project API and read-only workspace

**Files:**
- Create: `frontend/src/features/admin/adminProjectsApi.ts`
- Create: `frontend/src/features/admin/AdminProjectsPage.tsx`
- Create: `frontend/src/features/admin/AdminProjectDetailPage.tsx`
- Create: `frontend/src/features/admin/AdminProjectsPage.test.tsx`
- Create: `frontend/src/features/admin/AdminProjectDetailPage.test.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/styles/access-administration.css`

**Interfaces:**
- Consumes: Backend `AdminProjectSummary`/pagination response, existing `apiClient`, `PageData<T>`, `PageHeader`, `PageState`, `Surface`, `StatusBadge`, Button, and TanStack Query patterns.
- Produces: frontend `AdminProjectSummary`, `AdminProjectPage`, `EstimatorOption`, `InitiateAdminProjectInput`; `adminProjectKeys`; `getAdminProjects`, `getAdminProject`, `getEstimatorOptions`, `initiateAdminProject`; and read-only list/detail components.

- [ ] **Step 1: Write failing API URL and DTO rendering tests**

Assert exact URL construction:

```ts
expect(adminProjectsPath({ limit: 20, offset: 40 }))
  .toBe("/admin/projects?limit=20&offset=40");
expect(estimatorOptionsPath("asha rao", { limit: 20, offset: 0 }))
  .toBe("/admin/estimators?search=asha+rao&limit=20&offset=0");
```

Use MSW to assert the list and detail pages render populated data, `No estimate yet` for null Estimate, and `Unassigned handoff` whenever estimator or Lead is null.

- [ ] **Step 2: Write failing list/detail state and interaction tests**

Cover list loading, retryable error, empty, populated, previous/next pagination, `aria-busy` during page refresh, and exact links to `/admin/projects/:projectId`. Cover detail loading, retry, captured identity/location, estimator, Lead next action/date, and Estimate status/value. Assert the detail page has no button or link named Edit, Reassign, Approve, Start estimate, or Continue estimate.

- [ ] **Step 3: Run the new frontend tests to establish the red state**

Run:

```bash
cd frontend
npm test -- src/features/admin/AdminProjectsPage.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx
```

Expected: FAIL because the API module, DTOs, and components do not exist.

- [ ] **Step 4: Add exact frontend Admin project contracts**

```ts
export interface EstimatorOption {
  id: string;
  name: string;
  email: string;
  title: string | null;
}

export interface AdminProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  location: string;
  client: { name: string; email: string; mobile: string };
  propertyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  estimator: {
    id: string;
    name: string;
    email: string;
  } | null;
  lead: {
    id: string;
    stage: LeadStage;
    nextAction: string;
    nextActionAt: string;
  } | null;
  estimate: { id: string; status: string; total: number } | null;
  createdAt: string;
}

export type AdminProjectPage = PageData<AdminProjectSummary>;

export interface InitiateAdminProjectInput {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number;
  budgetMax: number;
  nextAction: string;
  nextActionAt: string;
  estimatorId: string;
}
```

- [ ] **Step 5: Implement API keys and calls without mutation retries**

```ts
export const adminProjectKeys = {
  all: ["admin-projects"] as const,
  page: (pagination: PaginationInput) => ["admin-projects", "page", pagination] as const,
  detail: (projectId: string) => ["admin-projects", "detail", projectId] as const,
  estimators: (search: string, pagination: PaginationInput) =>
    ["admin-projects", "estimators", search, pagination] as const
};

export function adminProjectsPath(pagination: PaginationInput): string {
  const query = new URLSearchParams({
    limit: String(pagination.limit),
    offset: String(pagination.offset)
  });
  return `/admin/projects?${query.toString()}`;
}

export function estimatorOptionsPath(
  search: string,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/admin/estimators?${query.toString()}`;
}

export const getAdminProjects = (pagination: PaginationInput) =>
  apiClient.get<AdminProjectPage>(adminProjectsPath(pagination));
export const getAdminProject = (projectId: string) =>
  apiClient.get<AdminProjectSummary>(`/admin/projects/${encodeURIComponent(projectId)}`);
export const getEstimatorOptions = (search: string, pagination: PaginationInput) =>
  apiClient.get<PageData<EstimatorOption>>(estimatorOptionsPath(search, pagination));
export const initiateAdminProject = (input: InitiateAdminProjectInput) =>
  apiClient.post<AdminProjectSummary>("/admin/projects", input);
```

Do not add TanStack mutation retry configuration or a retry wrapper; `apiClient.post` makes one request.

- [ ] **Step 6: Implement My Projects list and read-only detail**

Use `PAGE_SIZE = 20`, `placeholderData: keepPreviousData`, and offset pagination. The list header copy is:

```tsx
<PageHeader
  id="admin-projects-title"
  eyebrow="Project administration"
  title="My Projects"
  description="Projects you initiated and handed to Estimator/Sales."
/>
```

Each row/card shows project name, client, property type, location, estimator or `Unassigned handoff`, Lead stage/next action when present, and Estimate status/value or `No estimate yet`. Link the name to the encoded detail route.

The detail header includes a back link to `/admin/projects`; render identity and client data from Project fields, progress data from Lead fields, and Estimate state. Render text only—no mutation controls.

- [ ] **Step 7: Add responsive Admin project styles**

Extend `access-administration.css` with focused `.admin-projects`, `.admin-projects__list`, `.admin-project-card`, `.admin-project-card__meta`, `.admin-project-detail`, and `.admin-project-detail__grid` selectors. Reuse design tokens and existing surface/status/button classes. At the existing mobile breakpoint, collapse grids to one column and make pagination/actions full width.

- [ ] **Step 8: Run focused tests and frontend typecheck**

Run:

```bash
cd frontend
npm test -- src/features/admin/AdminProjectsPage.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx
npm run typecheck
```

Expected: PASS with every list/detail async state and nullable handoff state covered.

- [ ] **Step 9: Commit the Admin read workspace**

```bash
git add frontend/src/features/admin/adminProjectsApi.ts frontend/src/features/admin/AdminProjectsPage.tsx frontend/src/features/admin/AdminProjectDetailPage.tsx frontend/src/features/admin/AdminProjectsPage.test.tsx frontend/src/features/admin/AdminProjectDetailPage.test.tsx frontend/src/api/types.ts frontend/src/styles/access-administration.css
git commit -m "feat: add admin my projects workspace"
```

---

### Task 7: Add the exact project initiation dialog and estimator selector

**Files:**
- Create: `frontend/src/features/admin/AdminProjectInitiationDialog.tsx`
- Create: `frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx`
- Modify: `frontend/src/features/admin/AdminProjectsPage.tsx`
- Modify: `frontend/src/features/admin/AdminProjectsPage.test.tsx`
- Modify: `frontend/src/styles/access-administration.css`

**Interfaces:**
- Consumes: Task 6's API/types/query keys, `SearchCombobox`, `Dialog`, `Field`, `Input`, `Button`, `ApiError.fields`, `useFeedback`, `useNavigate`, and query invalidation.
- Produces: `AdminProjectInitiationDialog({ onClose, onCreated })`, exact client-side validation, one-request submission, and success navigation to the created detail.

- [ ] **Step 1: Write the failing exact-field and exclusion test**

Open the dialog and assert these 11 accessible fields exist: Client name, Client email, Mobile, Project / property name, Location, Property type, Minimum budget, Maximum budget, Next action, Next action date, and Estimator/Sales. Assert no control named Source, Lead source, Builder, Area, Target handover, or Notes exists.

- [ ] **Step 2: Write failing estimator lookup tests**

Cover initial loading, returned active options, empty response, error with inline Try again, search debounce, keyboard selection, and mandatory selection. Assert only server-returned options render and submit remains disabled when lookup failed or no valid option is selected.

- [ ] **Step 3: Write failing payload, duplicate-submit, error-retention, and success tests**

Capture the request JSON and assert exact equality:

```ts
expect(body).toEqual({
  clientName: "Asha Shah",
  clientEmail: "asha@example.com",
  clientMobile: "+91 90000 00000",
  projectName: "Asha home",
  location: "Pune",
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  nextAction: "Schedule site visit",
  nextActionAt: expect.stringMatching(/Z$/),
  estimatorId: "estimator-1"
});
expect(body).not.toHaveProperty("source");
```

Hold the POST response and click twice; assert one request and disabled pending UI. Return a structured field error and assert every entered value remains, the first invalid control receives focus, and accessible field feedback appears. On success, assert project queries are invalidated, a success announcement is emitted, the dialog closes, and the page navigates to `/admin/projects/project-created`.

- [ ] **Step 4: Run dialog/page tests to establish the red state**

Run:

```bash
cd frontend
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/AdminProjectsPage.test.tsx
```

Expected: FAIL because the dialog and page action are absent.

- [ ] **Step 5: Implement form state, estimator query, and field-focus behavior**

Use this form state so no excluded key can enter the payload:

```ts
interface ProjectInitiationForm {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: string;
  budgetMax: string;
  nextAction: string;
  nextActionAt: string;
}
```

Debounce the normalized estimator query by 300 ms and call `getEstimatorOptions(search, { limit: 20, offset: 0 })`. Use `SearchCombobox<EstimatorOption>` with `required`, `invalid`, `describedBy`, loading/error/retry props, and an input ref stored under `estimatorId`. Clear the selected estimator when its displayed query is edited.

Track `fieldErrors: Record<string, string>` and a ref map. On every validation response, focus the first key in insertion order. Preserve form and selected estimator state on mutation failure.

- [ ] **Step 6: Implement exact client validation and strict payload construction**

Trim every text field. Require all text fields and a selected estimator. Parse budgets as finite non-negative numbers and require max greater than or equal to min. Parse the datetime-local value and require a valid Date. Construct only:

```ts
const input: InitiateAdminProjectInput = {
  clientName: form.clientName.trim(),
  clientEmail: form.clientEmail.trim(),
  clientMobile: form.clientMobile.trim(),
  projectName: form.projectName.trim(),
  location: form.location.trim(),
  propertyType: form.propertyType.trim(),
  budgetMin: Number(form.budgetMin),
  budgetMax: Number(form.budgetMax),
  nextAction: form.nextAction.trim(),
  nextActionAt: new Date(form.nextActionAt).toISOString(),
  estimatorId: selectedEstimator.id
};
```

Render the dialog with `eyebrow="Project administration"`, title `Initiate project`, and description `Create the project now and hand its lead to Estimator/Sales.` Disable submit when mutation is pending, the estimator lookup is pending or failed, or no estimator is selected.

- [ ] **Step 7: Implement mutation success/error and page navigation**

Use one `useMutation` calling `initiateAdminProject`. On `ApiError.fields`, set those exact errors and show the first safe message. On success:

```ts
await queryClient.invalidateQueries({ queryKey: adminProjectKeys.all });
feedback.success({
  title: "Project initiated",
  message: "The Estimator/Sales handoff is ready."
});
onClose();
onCreated(project);
```

In `AdminProjectsPage`, show an `Initiate project` primary action only when the authenticated snapshot includes `projects.initiate`. Open the dialog from that action and implement `onCreated` with `navigate(`/admin/projects/${encodeURIComponent(project.id)}`)`.

- [ ] **Step 8: Add dialog layout styles and run focused tests**

Extend existing modal form selectors with an `.admin-project-form` two-column grid, full-width alert/combobox/actions rows, and one-column mobile layout.

Run:

```bash
cd frontend
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/AdminProjectsPage.test.tsx
npm run typecheck
```

Expected: PASS, including exact request keys, no Source field, no duplicate request, and accessible server errors.

- [ ] **Step 9: Commit the initiation experience**

```bash
git add frontend/src/features/admin/AdminProjectInitiationDialog.tsx frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx frontend/src/features/admin/AdminProjectsPage.tsx frontend/src/features/admin/AdminProjectsPage.test.tsx frontend/src/styles/access-administration.css
git commit -m "feat: add admin project initiation form"
```

---

### Task 8: Switch Admin home/navigation and make Users Super Admin-only in the UI

**Files:**
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/routeRegistry.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/test/authFixtures.ts`
- Modify: `frontend/src/app/routePaths.test.ts`
- Modify: `frontend/src/app/router.test.tsx`
- Modify: `frontend/src/components/layout/navigation.test.tsx`
- Modify: `frontend/src/components/layout/AppShell.test.tsx`
- Modify: `frontend/src/features/admin/UserDirectoryPage.test.tsx`
- Modify: `frontend/src/features/admin/UserMutationDialog.test.tsx`
- Modify: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–7 Admin pages, existing `registeredElement`, `PermissionRoute`, role-home redirects, and registry-derived navigation.
- Produces: Admin home `/admin/projects`, Admin routes/presentation/navigation, Super Admin-only `/admin/users`, and direct old-route access denial.

- [ ] **Step 1: Write failing role-home and safe-return tests**

```ts
expect(roleHomePath("admin")).toBe("/admin/projects");
expect(roleHomePath("super_admin")).toBe("/admin/users");
expect(safeReturnPath("admin", "/admin/projects/project-1"))
  .toBe("/admin/projects/project-1");
expect(safeReturnPath("admin", "/admin/users"))
  .toBe("/admin/projects");
```

- [ ] **Step 2: Write failing navigation and route-authorization tests**

Assert regular Admin navigation labels are exactly `My Projects` and `Access requests`, without `Users`. Assert Super Admin still sees `Users` and `Access requests`, without `My Projects`. Route tests must prove Admin renders both new project routes, direct `/admin/users` renders the standard access-denied page without calling the users API, and Super Admin still renders the user directory.

- [ ] **Step 3: Update failing user-directory and accessibility scenarios**

Change User Directory and mutation tests to authenticate as Super Admin. Replace the regular Admin user-directory accessibility scenario with My Projects and the initiation dialog, including combobox keyboard selection and error focus. Keep a separate Super Admin user-directory accessibility assertion.

- [ ] **Step 4: Run routing/navigation tests to establish the red state**

Run:

```bash
cd frontend
npm test -- src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx src/test/accessibility.test.tsx
```

Expected: FAIL because Admin still lands on and presents Users and the project routes are not mounted.

- [ ] **Step 5: Change role home, route registry, and test authorization fixtures**

Set only Admin home to `/admin/projects`. Register:

```ts
{
  path: "/admin/projects",
  permission: "projects.list",
  presentationRoles: ["admin"],
  navigation: {
    roles: ["admin"],
    item: {
      label: "My Projects",
      to: "/admin/projects",
      end: true,
      icon: FolderKanban
    }
  }
},
{
  path: "/admin/projects/:projectId",
  permission: "projects.read",
  presentationRoles: ["admin"],
  navigation: null
}
```

Change `/admin/users` presentation and navigation roles to `["super_admin"]`. Keep `/admin/access-requests` for both Admin and Super Admin. Change Admin fixture permissions to include `projects.list`, `projects.read`, `projects.initiate`, `organization.estimators.read`, and access-request review, with no identity-user permission. Keep Super Admin fixture identity-user permission.

- [ ] **Step 6: Mount both Admin project routes before the user/access-request routes**

Import the two pages, add both to `stagedElements`, and mount:

```tsx
<Route
  path="/admin/projects"
  element={registeredElement(
    "/admin/projects",
    stagedElements["/admin/projects"]
  )}
/>
<Route
  path="/admin/projects/:projectId"
  element={registeredElement(
    "/admin/projects/:projectId",
    stagedElements["/admin/projects/:projectId"]
  )}
/>
```

Leave `/admin/users` mounted so Super Admin behavior remains, relying on `registeredElement` to render `AccessDeniedPage` for regular Admin.

- [ ] **Step 7: Run focused frontend security, routing, and accessibility tests**

Run:

```bash
cd frontend
npm test -- src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx src/features/admin/UserDirectoryPage.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/features/admin/AdminProjectInitiationDialog.test.tsx src/test/accessibility.test.tsx
npm run typecheck
```

Expected: PASS; frontend manipulation cannot expose Users to Admin, and Super Admin directory behavior remains green.

- [ ] **Step 8: Commit the frontend authorization switch**

```bash
git add frontend/src/app/routePaths.ts frontend/src/app/routeRegistry.ts frontend/src/app/router.tsx frontend/src/test/authFixtures.ts frontend/src/app/routePaths.test.ts frontend/src/app/router.test.tsx frontend/src/components/layout/navigation.test.tsx frontend/src/components/layout/AppShell.test.tsx frontend/src/features/admin/UserDirectoryPage.test.tsx frontend/src/features/admin/UserMutationDialog.test.tsx frontend/src/test/accessibility.test.tsx
git commit -m "feat: make my projects the admin home"
```

---

### Task 9: Run complete acceptance verification and record implementation status

**Files:**
- Modify after every verification command passes: `docs/superpowers/specs/2026-08-23-admin-initiated-projects-design.md`

**Interfaces:**
- Consumes: All prior task commits and the acceptance criteria in the approved spec.
- Produces: Fresh full-suite/type/build evidence, a clean diff check, and spec status `Implemented and verified`.

- [ ] **Step 1: Run the complete backend verification set from a clean process**

Run:

```bash
cd backend
npm run typecheck
npm test
npm run build
```

Expected: all three commands exit 0. The full test run includes memory and Mongo replica-set initiation/rollback, legacy estimate approval, linked Project reuse, authorization catalog, operation registry, and Super Admin regressions.

- [ ] **Step 2: Run the complete frontend verification set**

Run:

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Expected: all three commands exit 0. The full test run includes routing, navigation, all Admin page states, strict form payload, no Source field, error focus, user-directory denial, and accessibility.

- [ ] **Step 3: Check formatting damage and inspect the final change set**

Run:

```bash
git diff --check
git status --short
git diff --stat 74026cb..HEAD
```

Expected: `git diff --check` exits 0; status is empty before the final documentation edit; the stat contains no dependency lockfile or out-of-scope subsystem change.

- [ ] **Step 4: Mark the approved spec implemented only after fresh evidence exists**

Change the status line to:

```markdown
**Status:** Implemented and verified
```

Append a concise verification section containing the six successful commands and the date `2026-08-23`. Do not claim a command that did not exit 0.

- [ ] **Step 5: Commit the verified status and confirm a clean worktree**

```bash
git add docs/superpowers/specs/2026-08-23-admin-initiated-projects-design.md
git commit -m "docs: record admin project verification"
git status --short
```

Expected: final status output is empty.
